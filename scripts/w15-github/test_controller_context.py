"""Small binding-only fixtures. Never import a controller or read source inputs."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
from types import ModuleType
import unittest
from unittest.mock import patch

SPEC=importlib.util.spec_from_file_location('w15_controller_context',Path(__file__).with_name('controller_context.py'))
C=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(C)


class ContextChecks(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.base=Path(self.temp.name);self.repo=self.base/'repo';self.repo.mkdir(mode=0o700)
        runner=self.base/'runner';runner.mkdir(mode=0o700)
        commit='a'*40;(self.repo/'.git').mkdir(mode=0o700)
        (self.repo/'.git/HEAD').write_text(commit+'\n')
        self.memory={'version':'helmut-w15-end500-memory-check/3','scope':'ISOLATED_GITHUB_END500_ONLY',
                     'comparisonBudgetBytes':2560000000,'requiredReserveBytes':512000000,
                     'maximumConsumptionBytes':2048000000,'minimumReservePercent':20,'swapBytes':0,
                     'mock500Acceptance':False,'executionAuthority':False}
        pins={}
        for path in C.REQUIRED_SOURCE_PINS:
            file=self.repo/path;file.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
            raw=json.dumps(self.memory).encode()if path==C.MEMORY else ('fictional entry '+path).encode()
            file.write_bytes(raw);pins[path]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
        nonce='82451be8-92ca-4912-935a-ab28b4c41310';run='40758148874'
        root=str(runner)+'/w15-end500-'+run+'-'+nonce.replace('-','')
        self.context={'schema':'helmut-w15-controller-context/1','scope':'ISOLATED_GITHUB_END500_BINDING_ONLY',
          'nonce':nonce,'runId':run,'runAttempt':1,'exactCommit':commit,'runnerTemp':str(runner),
          'hostPaths':{'runRoot':root,'work':root+'/work','prepare':root+'/prepare','cache':root+'/cache'},
          'uidMap':{'runnerUID':os.getuid(),'runnerGID':os.getgid(),'containerUID':1000,'containerGID':1000},
          'inputManifestPin':{'sha256':'b'*64,'fileCount':12,'totalBytes':242570240},'sourcePins':pins,
          'runtimePins':{**copy.deepcopy(C.RUNTIME),'imageId':'sha256:'+'c'*64},
          'executionAuthority':False,'testStarted':False}

    def module(self):
        module=ModuleType('fictional_end500');module.__file__=str(self.repo/C.FORWARD);module.ROOT=self.repo
        module.M=ModuleType('fictional_shared');module.M.__file__=str(self.repo/C.CONTROLLER);module.M.ROOT=self.repo
        module.AUDIT=ModuleType('fictional_audit');module.AUDIT.__file__=str(self.repo/C.AUDITOR)
        for value in (module,module.M,module.AUDIT):
            value.BASE=C.BASE;value.CONTAINER=C.INITIAL_CONTAINER;value.WORK=Path('/historical/unchanged')
        module.DB=module.M.DB=module.AUDIT.DATABASE=C.DATABASE
        module.M.LIMIT=2560000000;module.M.RESERVE=512000000;module.M.MAXIMUM=2048000000
        module.M.MEMORY=copy.deepcopy(self.memory)
        for value in (module,module.M,module.AUDIT):
            value.ASSETS='/immutable/assets';value.RECEIPT='/immutable/reception'
        module.main=lambda: self.fail('must not launch')
        module.prepare=lambda: self.fail('must not prepare')
        module.AUDIT.capture=lambda: self.fail('must not audit')
        return module

    def test_context_pins_are_observed_but_input_image_and_start_remain_blocked(self):
        with patch.object(subprocess,'Popen',side_effect=AssertionError('no process')), \
                patch.object(socket,'socket',side_effect=AssertionError('no network')), \
                patch.object(C.P,'inspect_file',side_effect=AssertionError('no private inputs')):
            result=C.validate_context(self.context,self.repo)
        self.assertEqual(result['status'],'BINDING_ONLY_START_BLOCKED')
        self.assertFalse(result['inputManifestObserved']);self.assertFalse(result['runtimeImageObserved'])
        self.assertFalse(result['executionAuthority']);self.assertFalse(result['testStarted'])
        self.assertEqual(set(result['blockedGates'].values()),{'BLOCKED'})
        self.assertFalse(Path(self.context['hostPaths']['runRoot']).exists())

    def test_apply_binds_only_host_context_and_preserves_inner_ram_and_immutable_paths(self):
        module=self.module();original_main=module.main;original_capture=module.AUDIT.capture
        memory=module.M.MEMORY
        result=C.apply_context(module,self.context,self.repo)
        self.assertTrue(result['hostBindingsApplied']);self.assertFalse(result['executionAuthority'])
        self.assertEqual(module.WORK,module.M.WORK);self.assertEqual(module.WORK,module.AUDIT.WORK)
        self.assertEqual(module.CACHE,Path(self.context['hostPaths']['cache']))
        self.assertEqual(module.BASE,module.M.BASE);self.assertEqual(module.BASE,module.AUDIT.BASE)
        self.assertEqual(module.DB,module.M.DB);self.assertEqual(module.DB,module.AUDIT.DATABASE)
        self.assertEqual(module.CONTAINER,module.M.CONTAINER);self.assertEqual(module.CONTAINER,module.AUDIT.CONTAINER)
        self.assertEqual(module.M.IMAGE,self.context['runtimePins']['imageId'])
        self.assertIs(module.M.MEMORY,memory);self.assertEqual(module.M.MAXIMUM,2048000000)
        self.assertEqual(module.ASSETS,'/immutable/assets');self.assertEqual(module.M.RECEIPT,'/immutable/reception')
        self.assertIs(module.main,original_main);self.assertIs(module.AUDIT.capture,original_capture)
        with self.assertRaises(C.P.Rejected):C.apply_context(module,self.context,self.repo)

    def test_bad_nonce_run_commit_scope_or_authority_is_rejected(self):
        for key,value in (('nonce','not-a-uuid'),('runAttempt',2),('runAttempt',True),('runId','123;run'),
                          ('exactCommit','d'*40),('scope','MOCK500'),('executionAuthority',True)):
            with self.subTest(key=key,value=value):
                context={**self.context,key:value}
                with self.assertRaises(C.P.Rejected):C.validate_context(context,self.repo)

    def test_host_path_escape_existing_root_and_symlink_are_rejected(self):
        context=copy.deepcopy(self.context);context['hostPaths']['cache']='/outside'
        with self.assertRaises(C.P.Rejected):C.validate_context(context,self.repo)
        root=Path(self.context['hostPaths']['runRoot']);root.mkdir(mode=0o700)
        with self.assertRaises(C.P.Rejected):C.validate_context(self.context,self.repo)
        root.rmdir();root.symlink_to(self.repo,target_is_directory=True)
        with self.assertRaises(C.P.Rejected):C.validate_context(self.context,self.repo)

    def test_source_pin_drift_missing_and_symlink_are_rejected_before_mutation(self):
        path=self.repo/C.FORWARD;original=path.read_bytes();module=self.module()
        path.write_bytes(b'drift')
        with self.assertRaises(C.P.Rejected):C.apply_context(module,self.context,self.repo)
        self.assertEqual(module.CONTAINER,C.INITIAL_CONTAINER)
        path.unlink()
        with self.assertRaises(C.P.Rejected):C.validate_context(self.context,self.repo)
        path.symlink_to(self.repo/C.CONTROLLER)
        with self.assertRaises(C.P.Rejected):C.validate_context(self.context,self.repo)
        path.unlink();path.write_bytes(original)
        context=copy.deepcopy(self.context);context['sourcePins'].pop(C.AUDITOR)
        with self.assertRaises(C.P.Rejected):C.validate_context(context,self.repo)
        context=copy.deepcopy(self.context);context['sourcePins']['.git/HEAD']={'bytes':41,'sha256':'d'*64}
        with self.assertRaises(C.P.Rejected):C.validate_context(context,self.repo)

    def test_declared_manifest_runtime_or_uid_binding_drift_rejected(self):
        mutations=(('inputManifestPin','totalBytes',242548460),('inputManifestPin','fileCount',9),
                   ('inputManifestPin','sha256','unknown'),('runtimePins','imageId','postgres:latest'),
                   ('uidMap','containerUID',0),('uidMap','runnerUID',os.getuid()+1))
        for section,key,value in mutations:
            with self.subTest(section=section,key=key):
                context=copy.deepcopy(self.context);context[section][key]=value
                with self.assertRaises(C.P.Rejected):C.validate_context(context,self.repo)

    def test_wrong_module_or_v2_cannot_be_rebound(self):
        module=self.module();module.M.LIMIT=2048000000
        with self.assertRaises(C.P.Rejected):C.apply_context(module,self.context,self.repo)
        self.assertEqual(module.CONTAINER,C.INITIAL_CONTAINER)
        module=self.module();module.__file__=str(self.repo/C.CONTROLLER)
        with self.assertRaises(C.P.Rejected):C.apply_context(module,self.context,self.repo)


if __name__=='__main__':unittest.main()
