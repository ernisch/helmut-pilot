#!/usr/bin/env python3
"""Narrow synthetic guard tests; no Docker, SQL, originals or payload closure."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module);return module


HERE=Path(__file__).parent
with patch('subprocess.run',side_effect=AssertionError('external commands forbidden during pure imports')):
    T=load('tiny_source_guard_subject',HERE/'local-tiny-source-runtime.py')
    C=load('legacy_source_guard_subject',HERE/'capture-local-source.py')


class PureTinySource(unittest.TestCase):
    def setUp(self):
        p=patch('subprocess.run',side_effect=AssertionError('native/external command forbidden'))
        p.start();self.addCleanup(p.stop)

    def fixture(self):
        binding={'containerId':'a'*64,'containerName':'helmut-authentic-tiny-source-'+'b'*12,
                 'sourceVolume':'helmut-authentic-tiny-source-pgdata-'+'b'*12,
                 'sourceDataDirectory':'/workspace/synthetic-only/PGDATA_TINY_SOURCE_NOT_ORIGINAL',
                 'additionalReadonlyMounts':[{'source':'/synthetic/python','target':'/synthetic/python'}]}
        runtime=[('/synthetic/original-postgres','/usr/lib/postgresql/17/bin/postgres')]
        row={'Id':binding['containerId'],'Name':'/'+binding['containerName'],'Image':T.CARRIER_IMAGE,
             'State':{'Running':True,'Pid':12},'HostConfig':{'NetworkMode':'none','PortBindings':{},'ReadonlyRootfs':True,
             'CapDrop':['ALL'],'SecurityOpt':['no-new-privileges'],'Memory':T.MEMORY_BYTES,
             'Privileged':False,'Devices':[],'DeviceRequests':None,'PidMode':'','IpcMode':'private',
             'MemorySwap':T.MEMORY_BYTES,'PidsLimit':64,'NanoCpus':1000000000,'Tmpfs':None},
             'Config':{'User':'1000:1000','Env':['PATH='+T.PATH_ENV,'LD_LIBRARY_PATH='+T.LIB_ENV,
             'PGHOST='+T.PGHOST,'LANG=C.UTF-8','LC_ALL=C.UTF-8']},
             'Mounts':[{'Type':'bind','Source':source,'Destination':target,'RW':False}for source,target in runtime]
             +[{'Type':'bind','Source':'/synthetic/python','Destination':'/synthetic/python','RW':False},
               {'Type':'volume','Name':binding['sourceVolume'],'Destination':'/var/lib/postgresql/data','RW':True}]}
        return row,binding,runtime

    def test_exact_inventory_accepts_only_declared_tree(self):
        with tempfile.TemporaryDirectory()as temporary:
            root=Path(temporary);(root/'lib').mkdir();(root/'lib/only').write_bytes(b'synthetic')
            T.exact_inventory(root,{'lib/only':{'type':'0'}})

    def test_extra_file_rejects_even_when_declared_bytes_are_untouched(self):
        with tempfile.TemporaryDirectory()as temporary:
            root=Path(temporary);(root/'only').write_bytes(b'synthetic');(root/'injected.so').write_bytes(b'other')
            with self.assertRaisesRegex(RuntimeError,'extra-persistent-member'):
                T.exact_inventory(root,{'only':{'type':'0'}})

    def test_extra_empty_directory_rejects(self):
        with tempfile.TemporaryDirectory()as temporary:
            root=Path(temporary);(root/'only').write_bytes(b'synthetic');(root/'extra').mkdir()
            with self.assertRaisesRegex(RuntimeError,'extra-persistent-member'):
                T.exact_inventory(root,{'only':{'type':'0'}})

    def test_symlink_cannot_replace_regular_file(self):
        with tempfile.TemporaryDirectory()as temporary:
            root=Path(temporary);(root/'only').symlink_to('/synthetic/not-read')
            with self.assertRaisesRegex(RuntimeError,'exact-persistent-inventory'):
                T.exact_inventory(root,{'only':{'type':'0'}})

    def test_fd9_rejects_rename_after_read(self):
        with tempfile.TemporaryDirectory()as temporary:
            path=Path(temporary)/'only';other=Path(temporary)/'other'
            path.write_bytes(b'one');other.write_bytes(b'two')
            read=T.os.read;swapped=False
            def swap(fd,size):
                nonlocal swapped
                data=read(fd,size)
                if data and not swapped:swapped=True;other.replace(path)
                return data
            with patch.object(T.os,'read',side_effect=swap),self.assertRaisesRegex(RuntimeError,'file-drift'):
                T.stable_file(path)

    def test_fd9_returns_same_descriptor_bytes(self):
        with tempfile.TemporaryDirectory()as temporary:
            path=Path(temporary)/'only';path.write_bytes(b'one')
            with patch.object(Path,'read_bytes',side_effect=AssertionError('reopen forbidden')):
                pin,identity,data=T.stable_file(path,keep=True)
            self.assertEqual(data,b'one');self.assertEqual(pin['bytes'],3);self.assertEqual(len(identity),9)

    def test_duplicate_metadata_key_rejects(self):
        with tempfile.TemporaryDirectory()as temporary:
            path=Path(temporary)/'meta';path.write_text('{"a":1,"a":2}')
            pin,_,_=T.stable_file(path)
            with self.assertRaisesRegex(RuntimeError,'duplicate-json-key'):T.document(pin)

    def test_full_exact_container_is_accepted_without_external_call(self):
        T.validate_container(*self.fixture())

    def test_stopped_carrier_is_not_a_live_source(self):
        row,binding,mounts=self.fixture();row['State'].update(Running=False,Pid=0)
        with self.assertRaisesRegex(RuntimeError,'actual-live-carrier'):T.validate_container(row,binding,mounts)

    def test_image_id_swap_does_not_admit_another_carrier(self):
        row,binding,mounts=self.fixture();row['Image']=T.SOURCE_IMAGE
        with self.assertRaisesRegex(RuntimeError,'actual-live-carrier'):T.validate_container(row,binding,mounts)

    def test_memory_and_swap_are_both_fixed(self):
        for field,value in [('Memory',0),('MemorySwap',-1),('PidsLimit',65),('NanoCpus',2000000000),('Tmpfs',{'/original-jit':'size=1g'})]:
            with self.subTest(field=field):
                row,binding,mounts=self.fixture();row['HostConfig'][field]=value
                with self.assertRaisesRegex(RuntimeError,'768m-no-extra-swap-or-ram-mount'):T.validate_container(row,binding,mounts)

    def test_writable_runtime_bind_is_rejected(self):
        row,binding,mounts=self.fixture();row['Mounts'][0]['RW']=True
        with self.assertRaisesRegex(RuntimeError,'exact-runtime-mount-closure'):T.validate_container(row,binding,mounts)

    def test_additional_mount_cannot_override_original_postgres(self):
        row,binding,mounts=self.fixture();binding['additionalReadonlyMounts'].append({'source':'/injected','target':mounts[0][1]})
        with self.assertRaisesRegex(RuntimeError,'additional-mount-overrides-runtime'):T.validate_container(row,binding,mounts)

    def test_unexpected_extra_bind_is_rejected(self):
        row,binding,mounts=self.fixture();row['Mounts'].append({'Type':'bind','Source':'/injected','Destination':'/other','RW':False})
        with self.assertRaisesRegex(RuntimeError,'exact-runtime-mount-closure'):T.validate_container(row,binding,mounts)

    def test_privilege_device_or_shared_namespace_is_rejected(self):
        for field,value in [('Privileged',True),('Devices',[{'PathOnHost':'/synthetic/device'}]),
                            ('DeviceRequests',[{'Driver':'synthetic'}]),('PidMode','host'),('IpcMode','host')]:
            with self.subTest(field=field):
                row,binding,mounts=self.fixture();row['HostConfig'][field]=value
                with self.assertRaisesRegex(RuntimeError,'carrier-isolation'):T.validate_container(row,binding,mounts)

    def test_receipt_needs_every_role_and_fresh_autocommit_proof(self):
        _,binding,_=self.fixture();binding['persistentClosurePin']={'synthetic':True};binding['runtimeAdapterPin']={'syntheticAdapter':True}
        receipt={'schema':'helmut-authentic-six-db-tiny-source-restore/1',
                 'status':'ACTUAL_VERIFIED_READONLY_SOURCE_RESTORED_CLEANLY_STOPPED',
                 'newSource':{'id':binding['containerId']},'persistentClosurePin':binding['persistentClosurePin'],
                 'runtimeAdapterPin':binding['runtimeAdapterPin'],
                 'sourceDataDirectory':binding['sourceDataDirectory'],'additionalReadonlyMounts':binding['additionalReadonlyMounts'],
                 'sourceDatabaseReadonlyDefaults':[{'database':db,'readonly':True}for db in sorted(T.DATABASES)],
                 'sourceRolesReadonly':[{'role':role,'readonly':True}for role in T.READONLY_ROLES],
                 'freshAutocommitReadonlySessions':[{'database':db,'defaultReadonly':True,'transactionReadonly':True}for db in sorted(T.DATABASES)],
                 'rolesExactlyRestoredBeforeReadonlySettings':True,'originalInputsHashUnchanged':True,
                 'originalContainerMetadataUnchanged':True,'sourceWritesOnlyToFreshOwnedVolume':True,
                 'originalWrites':0,'providerCalls':0,'full500':False,'production':False,
                 'databases':[{'database':db,'financialTextExactlyEqual':True,'sourceDefaultReadonly':True,
                 'nativeEquality':{'kos':6,'rawDocumentsRows':7,'links':7},'sourceCatalogReady':True}for db in T.DATABASES]}
        T.validate_restore_receipt(receipt,binding)
        mutations=[('sourceRolesReadonly',receipt['sourceRolesReadonly'][:-1]),
                   ('freshAutocommitReadonlySessions',receipt['freshAutocommitReadonlySessions'][:-1]),
                   ('rolesExactlyRestoredBeforeReadonlySettings',False),('originalWrites',1),
                   ('runtimeAdapterPin',{'differentSyntheticAdapter':True})]
        for field,value in mutations:
            with self.subTest(field=field):
                changed=copy.deepcopy(receipt);changed[field]=value
                with self.assertRaisesRegex(RuntimeError,'genuine-six-db-restore-receipt'):T.validate_restore_receipt(changed,binding)

    def test_duplicate_environment_entry_is_rejected(self):
        row,binding,mounts=self.fixture();row['Config']['Env'].append('LANG=C.UTF-8')
        with self.assertRaisesRegex(RuntimeError,'duplicate-environment'):T.validate_container(row,binding,mounts)

    def test_original_volume_is_never_a_fresh_source_volume(self):
        row,binding,mounts=self.fixture();binding['sourceVolume']='helmut-target-pgdata-01a15550c862';row['Mounts'][-1]['Name']=binding['sourceVolume']
        with self.assertRaisesRegex(RuntimeError,'fresh-source-volume'):T.validate_container(row,binding,mounts)

    def test_volume_requires_exact_persistent_bind_options(self):
        _,binding,_=self.fixture()
        row={'Name':binding['sourceVolume'],'Driver':'local','Options':{'type':'none','o':'bind','device':binding['sourceDataDirectory']},
             'Mountpoint':'/var/lib/docker/volumes/'+binding['sourceVolume']+'/_data'}
        T.validate_volume(row,binding)
        row['Options']={'type':'tmpfs','device':'tmpfs','o':'size=1g'}
        with self.assertRaisesRegex(RuntimeError,'exact-persistent-source-volume-options'):T.validate_volume(row,binding)

    def test_no_tiny_binding_pin_is_adopted_by_preparation(self):
        self.assertIsNone(C.TINY_RUNTIME_BINDING_SHA256);self.assertIsNone(C._tiny_runtime)

    def test_legacy_inspection_arguments_and_result_stay_unchanged(self):
        value=C.RUNTIME_BINDING
        stdout='|'.join([value['containerId'],'/'+value['containerName'],value['imageId'],'none'])+'\n'
        with patch.object(C.subprocess,'run',return_value=types.SimpleNamespace(stdout=stdout))as call:
            self.assertEqual(C.verify_runtime_binding(),C.RUNTIME_BINDING_PIN)
        self.assertEqual(call.call_args.args[0],C.DOCKER+['inspect','--format','{{.Id}}|{{.Name}}|{{.Image}}|{{.HostConfig.NetworkMode}}',value['containerId']])

    def test_tiny_export_refuses_before_any_output_directory(self):
        with patch.object(C,'_tiny_runtime',object()),patch.object(Path,'mkdir',side_effect=AssertionError('no output allowed')):
            with self.assertRaisesRegex(RuntimeError,'tiny source export is not admitted'):C.capture('/synthetic/no-write')


if __name__=='__main__':unittest.main(verbosity=2)
