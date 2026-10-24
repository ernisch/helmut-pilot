#!/usr/bin/env python3
"""Pure file fixtures for the current-code connection binding; no authority import."""
import ast
import copy
import hashlib
import json
import re
import tempfile
import types
import unittest
from pathlib import Path

HERE=Path(__file__).resolve().parent
CONNECT=ast.parse((HERE/'connect-local500.py').read_text())
FINISH=ast.parse((HERE/'finish-connection.py').read_text())

def functions(tree,names,namespace):
    nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names]
    if {n.name for n in nodes}!=set(names):raise AssertionError('missing actual source function')
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-source-functions>','exec'),namespace)

class ConnectionCodeBinding(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory(prefix='helmut-code-binding-')
        self.addCleanup(self.temporary.cleanup)
        self.base=Path(self.temporary.name)
        self.repo=self.base/'current';self.repo.mkdir()
        self.legacy=self.base/'preserved-original-code'
        self.case=self.base/'case';self.case.mkdir()
        self.commit='a'*40
        self.calls=[]
        def git(argv,**kw):
            self.calls.append((argv,kw))
            self.assertEqual(argv,['git','-C',str(self.repo),'rev-parse','--show-toplevel','HEAD'])
            self.assertEqual(set(kw),{'text','capture_output','timeout','env'})
            self.assertEqual(kw['env'],{'PATH':'/usr/bin:/bin','GIT_OPTIONAL_LOCKS':'0',
                'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null'})
            return types.SimpleNamespace(returncode=0,stdout=str(self.repo)+'\n'+self.commit+'\n')
        self.c={'Path':Path,'json':json,'hashlib':hashlib,'re':re,
          'subprocess':types.SimpleNamespace(run=git),'REPO':self.repo,'LEGACY_REPO':self.legacy,
          'BASE':self.base,'LEGACY_ROOT_CONSUMERS':{'native-end-preparation/contracts.js',
            'native-end-preparation/observe-app.js','assemble-after-activation.js'}}
        functions(CONNECT,{'pin','read_pin','bind_runtime_sources','bind_template_repository'},self.c)
        self.C=types.SimpleNamespace(**self.c)
        self.f={'Path':Path,'json':json,'C':self.C,'BIN':self.repo/'scripts/helmut-resource-meter','B':self.base}
        functions(FINISH,{'current_source','static_asset','finish'},self.f)
        self.pins=[]
        for i in range(128):
            relative=Path('lib/helmut')/('source-%03d.js'%i)
            file=self.repo/relative;file.parent.mkdir(parents=True,exist_ok=True)
            file.write_text('current code '+str(i)+'\n')
            # The historical files deliberately do not exist: these are retained
            # original pins, not a request to rehash/execute their old paths.
            self.pins.append({'path':str(self.legacy/relative),'bytes':11,
              'sha256':hashlib.sha256(('original '+str(i)).encode()).hexdigest()})
        self.pins.append({'path':str(self.base/'retained-origin.json'),'bytes':0,'sha256':'0'*64})
        self.template=self.base/'wave20-resource-integration/attempt-a2521b52a505/ROOT_NEW_RUNTIME_REQUEST.PRIVATE.json'
        self.template.parent.mkdir(parents=True)
        self.write_template(self.pins)

    def pin(self,path):return self.c['pin'](path)

    def write_template(self,pins):
        self.template.write_text(json.dumps({'sourcePins':pins,'status':'PRESERVED_ORIGINAL_ONLY'}))
        self.template_pin=self.pin(self.template)
        self.c['RESTORE_TEMPLATES']={'runtimeRequestTemplate':(self.template.name,
          self.template_pin['bytes'],self.template_pin['sha256'])}

    def bind(self):return self.c['bind_runtime_sources'](self.template_pin,self.commit)

    def test_repository_is_derived_from_actual_script_location(self):
        assignment=next(n for n in CONNECT.body if isinstance(n,ast.Assign)
          and any(isinstance(t,ast.Name)and t.id=='REPO' for t in n.targets))
        namespace={'Path':Path,'__file__':str(HERE/'connect-local500.py')}
        exec(compile(ast.Module(body=[assignment],type_ignores=[]),'<actual-root>','exec'),namespace)
        self.assertEqual(namespace['REPO'],HERE.parents[1])

    def test_all_original_pairs_and_current_bytes_are_retained_without_acceptance(self):
        before=copy.deepcopy(self.pins)
        original,sources,binding=self.bind()
        self.assertEqual(original['sourcePins'],before)
        self.assertEqual(self.pins,before)
        self.assertEqual(len(sources),128)
        self.assertEqual(binding['historicalRuntimeTemplate'],self.template_pin)
        self.assertEqual(binding['historicalRepository'],str(self.legacy))
        self.assertEqual(binding['currentRepository'],str(self.repo))
        self.assertEqual(binding['sourceCommit'],self.commit)
        self.assertEqual(binding['scope'],'SOURCE_PROVENANCE_AND_CURRENT_BYTES_ONLY')
        self.assertIs(binding['codeAccepted'],False)
        self.assertIs(binding['resourceGOGranted'],False)
        self.assertEqual(binding['historicalCodePinCount'],128)
        self.assertEqual([p['original']for p in binding['bindings']],before[:128])
        for pair in binding['bindings']:
            self.assertEqual(sources[pair['current']['path']],self.pin(pair['current']['path']))
            self.assertNotEqual(pair['original']['sha256'],pair['current']['sha256'])
        self.assertEqual(len(self.calls),1)

    def test_fixed_template_and_actual_template_bytes_are_both_required(self):
        wrong={**self.template_pin,'sha256':'0'*64}
        with self.assertRaisesRegex(RuntimeError,'fixed restored'):
            self.c['bind_runtime_sources'](wrong,self.commit)
        self.template.write_text('{}')
        with self.assertRaisesRegex(RuntimeError,'input pin drift'):self.bind()
        self.assertFalse(self.calls)

    def test_incomplete_duplicate_noncanonical_or_malformed_origins_stop(self):
        variants=[self.pins[1:],self.pins+[self.pins[0]],
          [{**self.pins[0],'path':str(self.legacy/'../escape.js')},*self.pins[1:]],
          [{**self.pins[0],'path':str(self.legacy)+'//lib/a.js'},*self.pins[1:]],
          [{**self.pins[0],'bytes':True},*self.pins[1:]],
          [{**self.pins[0],'sha256':'INVALID'},*self.pins[1:]]]
        for pins in variants:
            with self.subTest(kind=variants.index(pins)):
                self.write_template(pins)
                with self.assertRaises(RuntimeError):self.bind()

    def test_missing_current_counterpart_stops(self):
        (self.repo/'lib/helmut/source-000.js').unlink()
        with self.assertRaisesRegex(RuntimeError,'regular pinned file'):self.bind()

    def test_file_and_parent_symlink_counterparts_stop(self):
        file=self.repo/'lib/helmut/source-000.js';text=file.read_text();file.unlink()
        file.symlink_to(self.repo/'lib/helmut/source-001.js')
        with self.assertRaisesRegex(RuntimeError,'aliases forbidden'):self.bind()
        file.unlink();file.write_text(text)
        folder=self.repo/'lib/helmut';outside=self.base/'moved-current';folder.rename(outside)
        folder.symlink_to(outside,target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError,'aliases forbidden'):self.bind()

    def test_actual_head_repository_and_commit_format_are_required(self):
        bind=self.c['bind_runtime_sources']
        with self.assertRaisesRegex(RuntimeError,'exact current source commit'):
            bind(self.template_pin,None)
        with self.assertRaisesRegex(RuntimeError,'actual current repository'):
            bind(self.template_pin,'b'*40)
        for returncode,stdout in [(1,''),(0,str(self.legacy)+'\n'+self.commit+'\n')]:
            self.c['subprocess']=types.SimpleNamespace(run=lambda *a,**k:
              types.SimpleNamespace(returncode=returncode,stdout=stdout))
            with self.assertRaisesRegex(RuntimeError,'actual current repository'):self.bind()

    def test_current_sources_reject_old_paths_aliases_and_conflicting_bytes(self):
        collect=self.f['current_source'];file=self.repo/'lib/helmut/source-000.js'
        sources={};p=self.pin(file)
        collect(sources,p,self.repo);collect(sources,p,self.repo)
        self.assertEqual(sources,{p['path']:p})
        with self.assertRaisesRegex(RuntimeError,'exact current repository'):
            collect(sources,self.pins[0],self.repo)
        alias=self.repo/'alias.js';alias.symlink_to(file)
        with self.assertRaisesRegex(RuntimeError,'exact current repository'):
            collect(sources,{**p,'path':str(alias)},self.repo)
        with self.assertRaisesRegex(RuntimeError,'pin drift'):
            collect(sources,{**p,'sha256':'0'*64},self.repo)
        file.write_text('new changed bytes')
        with self.assertRaisesRegex(RuntimeError,'conflicting'):
            collect(sources,self.pin(file),self.repo)

    def test_code_asset_classification_matches_collected_current_sources(self):
        asset=self.f['static_asset'];p=self.pin(self.repo/'lib/helmut/source-000.js')
        assets={};asset(assets,{p['path']:p},p,self.case);self.assertEqual(assets,{})
        with self.assertRaisesRegex(RuntimeError,'match the collected source'):
            asset(assets,{},p,self.case)
        with self.assertRaisesRegex(RuntimeError,'historical code'):
            asset(assets,{},self.pins[0],self.case)
        asset(assets,{},self.template_pin,self.case)
        self.assertEqual(assets,{self.template_pin['path']:self.template_pin})
        go=self.base/'OWNER_LOCAL_GO.PRIVATE.json';go.write_text('{}')
        with self.assertRaisesRegex(RuntimeError,'historical GO'):
            asset(assets,{},self.pin(go),self.case)

    def test_exact_three_root_literals_and_recorded_replacement_counts(self):
        bind=self.c['bind_template_repository']
        old=str(self.legacy);text="const ROOT='"+old+"';"
        for relative in self.c['LEGACY_ROOT_CONSUMERS']:
            actual,changes=bind(text,relative)
            self.assertEqual(actual,"const ROOT='"+str(self.repo)+"';")
            self.assertEqual(changes,[{'from':old,'to':str(self.repo),'count':1}])
            replay=text
            for delta in changes:
                self.assertEqual(replay.count(delta['from']),delta['count'])
                replay=replay.replace(delta['from'],delta['to'])
            self.assertEqual(replay,actual)
            for drift in ['',text+text]:
                with self.assertRaisesRegex(RuntimeError,'exact original consumer'):
                    bind(drift,relative)
        self.assertEqual(bind('unchanged','other.js'),('unchanged',[]))
        with self.assertRaisesRegex(RuntimeError,'exact original consumer'):
            bind(text,'other.js')

    def test_shared_renderer_and_request_use_the_actual_binding_helpers(self):
        render=next(n for n in CONNECT.body if isinstance(n,ast.FunctionDef)and n.name=='render_templates')
        calls=[n for n in ast.walk(render)if isinstance(n,ast.Call)
          and isinstance(n.func,ast.Name)and n.func.id=='bind_template_repository']
        self.assertEqual(len(calls),1)
        finish=next(n for n in FINISH.body if isinstance(n,ast.FunctionDef)and n.name=='finish')
        requests=[n for n in ast.walk(finish)if isinstance(n,ast.Dict)
          and any(isinstance(k,ast.Constant)and k.value=='sourceCodeBinding'for k in n.keys)]
        self.assertEqual(len(requests),1)
        binding=requests[0].values[next(i for i,k in enumerate(requests[0].keys)
          if isinstance(k,ast.Constant)and k.value=='sourceCodeBinding')]
        self.assertIsInstance(binding,ast.Name);self.assertEqual(binding.id,'source_binding')

    def test_unbound_historical_finish_fails_before_any_external_read_or_write(self):
        self.C.read_pin=lambda p:{'caseDirectory':str(self.case)}
        self.C.read_restored_staging_inputs=lambda *a:None
        self.C.save=lambda *a: self.fail('unbound historical case must not write')
        with self.assertRaisesRegex(RuntimeError,'fixed restored provenance'):
            self.f['finish']({'path':'fixture'})

    def test_source_head_failure_precedes_every_finish_write(self):
        capture_path=self.base/'capture.json';capture_path.write_text('{}')
        capture_pin=self.pin(capture_path)
        staged={'caseDirectory':str(self.case),'restoreStagingInputs':{'path':'restored'},
          'dayAcceptance':{'path':'day'},'ownerGOPin':{'path':'owner'},'sourceCommit':'b'*40}
        owner={'correctedSourceCapturePath':str(capture_path),'sourceCapturePin':capture_pin}
        capture={'before':{},'after':{},'sourceWrites':0}
        records={'staged':staged,'day':{},'owner':owner,str(capture_path):capture}
        self.C.read_pin=lambda p:records[p['path']]
        self.C.read_restored_staging_inputs=lambda *a:{'runtimeRequestTemplate':self.template_pin}
        self.C.A=types.SimpleNamespace(verify_preexisting_capture=lambda *a,**k:None)
        self.C.save=lambda *a:self.fail('source binding must precede the first write')
        self.f['backend_inputs']=lambda *a:None
        with self.assertRaisesRegex(RuntimeError,'actual current repository'):
            self.f['finish']({'path':'staged'})

if __name__=='__main__':unittest.main(verbosity=2)
