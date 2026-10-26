"""Synthetic physical continuation control flow; no systemd, Docker or target access.

The retained-reader boundary supplies an explicitly synthetic two-accepted/one-failed
proof and checks physical old sentinels. Real new asset pins, driver receipt reads,
old library publication and new coordinator state/lifecycle/seal checks stay active.
Only filesystem ownership, fixed context-path translation and component/service
boundaries are fixture adapters. No synthetic bytes claim an original-data digest.
"""
from contextlib import ExitStack
import copy
import fcntl
import os
from pathlib import Path
import shutil
import stat
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

SOURCE = Path(__file__).with_name('hetzner-native-context-continuation-coordinator.py')

def source_bytes(path):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME), 'rb') as handle:
        return handle.read()

RAW = source_bytes(SOURCE)
m = types.ModuleType('synthetic_physical_continuation_coordinator')
m.__source_bytes__ = RAW
exec(compile(RAW, str(SOURCE), 'exec'), m.__dict__)
LIBRARY_RAW = source_bytes(SOURCE.with_name('hetzner-native-setup-coordinator.py'))
DRIVER_RAW = source_bytes(SOURCE.with_name('hetzner-native-context-continuation-driver.py'))
OLD_DRIVER_RAW = source_bytes(SOURCE.with_name('hetzner-native-setup-driver.py'))
GUARD_RAW = source_bytes(SOURCE.with_name('hetzner-native-context-continuation-service.py'))
FIXED_CONTEXT = '/opt/helmut-native-test/docker28-context-20261026'
REAL_LOAD_ASSETS = m.load_assets


class ContinuationCoordinatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='explicit-synthetic-context-continuation-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.base, self.component_root = self.root / 'control', self.root / 'context'
        self.base.mkdir(mode=0o700); self.component_root.mkdir(mode=0o700)
        for name in ('results', 'once'): (self.base / name).mkdir(mode=0o700)
        self.write(self.base / 'TARGET_SETUP_LOCK.PRIVATE', b'')
        self.stack = ExitStack(); self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(m, 'BASE', str(self.base)))
        self.stack.enter_context(patch.object(m, 'STATE_ROOT', str(self.base / m.NAMESPACE)))
        self.wall = self.stack.enter_context(patch.object(m.time, 'time', return_value=10000.0))
        self.clock = self.stack.enter_context(patch.object(m.time, 'monotonic', return_value=1000.0))
        for key in ('getuid', 'geteuid', 'getgid', 'getegid'):
            self.stack.enter_context(patch.object(m.os, key, return_value=0))
        self.public_id, self.overrides = None, {}
        self.real_stat, self.real_fstat, self.real_open = os.stat, os.fstat, os.open
        def view(info):
            identity = info.st_dev, info.st_ino
            updates = {'st_uid': 1000, 'st_gid': 1000} if identity == self.public_id else {'st_uid': 0, 'st_gid': 0}
            updates.update(self.overrides.get(identity, {}))
            return types.SimpleNamespace(**{**{key:getattr(info,key) for key in dir(info) if key.startswith('st_')}, **updates})
        self.stack.enter_context(patch.object(m.os, 'stat', side_effect=lambda *a, **kw:view(self.real_stat(*a, **kw))))
        self.stack.enter_context(patch.object(m.os, 'fstat', side_effect=lambda fd:view(self.real_fstat(fd))))
        def opening(path, flags, *args, **kwargs):
            value = os.fsdecode(path)
            if value.startswith('/'):
                self.assertTrue(Path(value).is_relative_to(self.root), 'no host path access')
            else:
                self.assertIn('dir_fd', kwargs, 'relative path needs own directory FD')
                self.assertNotIn('..', value.split('/'))
            return self.real_open(path, flags, *args, **kwargs)
        self.stack.enter_context(patch.object(m.os, 'open', side_effect=opening))
        self.stack.enter_context(patch.object(m.http.client, 'HTTPSConnection', side_effect=AssertionError('no network')))
        self.library = {'__name__':'synthetic_real_library', '__source_bytes__':LIBRARY_RAW}
        exec(compile(LIBRARY_RAW, '<synthetic-real-library>', 'exec'), self.library)
        self.library['BASE'] = str(self.base)
        self.library['CONTEXT'] = str(self.component_root)
        self.library['directory'] = self.directory
        self.old_driver = {'__name__':'synthetic_old_driver', '__source_bytes__':OLD_DRIVER_RAW}
        exec(compile(OLD_DRIVER_RAW, '<synthetic-old-driver>', 'exec'), self.old_driver)
        self.configure_driver(self.old_driver)
        self.paths = self.old_driver['paths']()
        for role in self.old_driver['roles'](9):
            path = Path(self.paths[role])
            if role == 'public_repository':
                path.mkdir(mode=0o700, parents=True)
                info = self.real_stat(path); self.public_id = info.st_dev, info.st_ino
            else: self.write(path, m.encoded({'explicitly_synthetic_inherited_role':role}))
        self.legacy = self.base / 'setup-successor-unit-properties-v1'
        for name in ('FIRST_ERROR.PRIVATE.json', '.setup-write-held.tmp', 'once/old.json',
                     'jobs/old/JOB.PRIVATE.json', 'SETUP_RECOVER_ACCEPTED.SAFE.json',
                     'SETUP_CHECKOUT_ACCEPTED.SAFE.json', 'failed-context/FIRST_ERROR.PRIVATE.json'):
            self.write(self.legacy / name, ('EXPLICIT_SYNTHETIC_RETAINED_'+name+'\n').encode())
        self.old_snapshot = self.inherited_snapshot()
        self.baseline = {'baseline_sha256':m.sha(m.encoded(self.old_snapshot)),
            'partial_setup_proof':{'explicitly_synthetic':True,'accepted_phases':['recover','checkout'],
                'failed_phase':'context','native_qualified':False,'native_go_consumed':False},
            'failure_diagnostic':{'explicitly_synthetic':True,'records':{'component_error':{'sha256':'1'*64},
                'job_error':{'sha256':'2'*64}, 'component_attempt':{'state':'ABSENT'},
                'component_receipt':{'state':'ABSENT'}, 'component_receipt_pending':{'state':'ABSENT'}}}}
        self.retained = self.stack.enter_context(patch.object(m, 'retained_baseline', side_effect=self.retained_baseline))
        self.daemon = {'pid':424242,'start_ticks':123456,'namespace':[5,10],
            'pid1_namespace':[5,11],'socket':[12,13],'private':False}
        self.preflight = Mock(side_effect=self.inspect_preflight)
        self.run = Mock(side_effect=self.run_phase)
        self.guard = self.driver = self.ctx = None
        self.assets = {'guard.py':GUARD_RAW, 'driver.py':DRIVER_RAW,
            **{name:('# EXPLICIT_SYNTHETIC_INERT_SOURCE_'+name+'\n').encode()
               for name in ('recovery.py','restore.py','public.py','context.py','image.py')}}
        self.expected = {name:{'sha256':m.sha(raw),'bytes':len(raw)} for name,raw in self.assets.items()}
        self.asset_set = m.sha(m.encoded(self.expected))
        self.fetch = self.stack.enter_context(patch.object(m,'fetch_asset',side_effect=self.fetch_asset))
        self.loader = self.stack.enter_context(patch.object(m,'load_assets',side_effect=self.load_assets))
        self.context = {'base':str(self.base),'source_sha256':'b'*64,'deployment_commit':'c'*40,'deadline':1250.0}
        reader_source = b'# EXPLICIT_SYNTHETIC_READER_BOUNDARY\n'
        self.stack.enter_context(patch.object(m,'READER_SHA',m.sha(reader_source)))
        self.reader = {'__source_bytes__':reader_source}
        self.qualified = {'library':self.library,'driver.py':self.old_driver,
            **{name:{'__source_bytes__':b'# EXPLICIT_SYNTHETIC_OLD_QUALIFICATION\n'} for name in
               ('successor','preflight','guard.py','recovery.py','restore.py','public.py','context.py','image.py')}}
        self.contract = {'schema':'helmut-context-continuation-contract-v1','contract_id':m.NAMESPACE,
            'authorization_source':'operator-setup-request-20261026-working-test-environment',
            'setup_authorized':True,'base':str(self.base),'case_id':m.CASE,'plan_sha256':m.PLAN,'scope_sha256':m.SCOPE,
            'target_host':'100.96.83.66','target_public_ip':'2.28.77.245','server_sha256':self.context['source_sha256'],
            'coordinator_sha256':m.sha(RAW),'asset_set_sha256':self.asset_set,
            'assets':{name:{'repoFile':m.FILES[name],**pin} for name,pin in self.expected.items()},
            'metadata_reader':{'repoFile':'hetzner-native-runtime-metadata.py','sha256':m.sha(reader_source),'bytes':len(reader_source)},
            'not_before_utc':9900,'not_after_utc':15000,'allowed_phases':list(m.PHASES),
            'native_qualified':False,'native_go_consumed':False}
        self.contract_raw = m.encoded(self.contract)
        self.counter = 0

    def write(self,path,raw,mode=0o600):
        path=Path(path); self.assertTrue(path.is_relative_to(self.root))
        path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        fd=self.real_open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode) if hasattr(self,'real_open') else os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
        try: self.assertEqual(os.write(fd,raw),len(raw))
        finally: os.close(fd)

    def directory(self,path):
        if path == FIXED_CONTEXT or path.startswith(FIXED_CONTEXT+'/'):
            path=str(self.component_root)+path[len(FIXED_CONTEXT):]
        self.assertTrue(Path(path).is_relative_to(self.root),'directory outside synthetic fixture')
        relative=Path(path).relative_to(self.root)
        fd=self.real_open(self.root,self.library['D'])
        try:
            for part in relative.parts:
                child=self.real_open(part,self.library['D'],dir_fd=fd); os.close(fd); fd=child
                info=os.fstat(fd)
                self.library['need'](stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
                    and not info.st_mode & 0o022,'DIRECTORY_IDENTITY')
            return fd
        except BaseException: os.close(fd); raise

    def configure_driver(self,driver):
        driver['BASE'],driver['CONTEXT']=str(self.base),str(self.component_root)
        driver['directory']=self.directory

    def inherited_snapshot(self):
        value=self.old_driver['bindings'](self.old_driver['roles'](9))
        rows={}
        def walk(path):
            fd=self.directory(str(path))
            try:
                rows[str(path.relative_to(self.base))]={'metadata':self.library['metadata'](os.fstat(fd))}
                for name in sorted(os.listdir(fd)):
                    info=os.stat(name,dir_fd=fd,follow_symlinks=False)
                    if stat.S_ISDIR(info.st_mode): walk(path/name)
                    else:
                        item=os.open(name,m.R,dir_fd=fd)
                        try: rows[str((path/name).relative_to(self.base))]={'metadata':self.library['metadata'](os.fstat(item)),
                            'sha256':m.sha(os.read(item,16384))}
                        finally: os.close(item)
            finally: os.close(fd)
        walk(self.legacy)
        return {'bindings':value,'legacy':rows}

    def retained_baseline(self,reader,qualified,deadline):
        self.assertIs(reader,self.reader); self.assertIs(qualified,self.qualified)
        if self.inherited_snapshot() != self.old_snapshot: raise m.Stop('SYNTHETIC_OLD_BASELINE_CHANGED')
        return copy.deepcopy(self.baseline)

    def inspect_preflight(self,stage,recovery=None,public=None):
        self.assertEqual((stage,recovery,public),(m.RECOVERY_READY,m.OLD_RECEIPT,m.PUBLIC_READY))
        identity=m.sha(m.encoded({k:v for k,v in self.daemon.items() if k != 'private'})[:-1])
        return {'explicitly_synthetic_component_boundary':True,'native_qualified':False,'native_go_consumed':False,
                'source_proof_sha256':'d'*64,'daemon_binding_sha256':identity}

    def fetch_asset(self,commit,filename,pin,deadline):
        self.assertEqual((commit,deadline),(self.context['deployment_commit'],self.context['deadline']))
        name=next(name for name,value in m.FILES.items() if value == filename)
        self.assertEqual(pin,self.expected[name]); return self.assets[name]

    def load_assets(self,context,contract,library):
        assets,modules,expected,asset_set=REAL_LOAD_ASSETS(context,contract,library)
        self.guard,self.driver,self.ctx=(modules[name] for name in ('guard.py','driver.py','context.py'))
        self.configure_driver(self.driver)
        self.guard['BASE']=str(self.base); self.guard['run_setup_phase']=self.run
        self.ctx['observe']=lambda:copy.deepcopy(self.daemon)
        self.ctx['inspect_preflight']=self.preflight
        return assets,modules,expected,asset_set

    def capsule(self,action='inspect',phase=None):
        self.counter+=1
        return {'schema':'helmut-context-continuation-capsule-v1','contract_id':m.NAMESPACE,'action':action,'phase':phase,
            'source_sha256':self.context['source_sha256'],'contract_sha256':m.sha(self.contract_raw),
            'nonce':format(self.counter,'064x'),'inspection_nonce':None if action == 'inspect' else self.inspection_nonce,
            'inspection_result_sha256':None if action == 'inspect' else self.inspection_sha,
            'issued_at_utc':int(self.wall.return_value)-10,'expires_at_utc':int(self.wall.return_value)+290}

    def request(self,capsule):
        return {'schema':'helmut-native-control-request-v1','operation':'status' if capsule['action'] == 'inspect' else 'admit',
            'nonce':m.sha(m.PREFIX+m.encoded(capsule)),'plan_sha256':m.PLAN,'payload_sha256':self.context['source_sha256']}

    def coordinate(self,capsule=None,request=None):
        capsule=self.capsule() if capsule is None else capsule
        return m.coordinate_continuation(self.request(capsule) if request is None else request,
            self.context,capsule,self.contract_raw,self.reader,self.qualified)

    def inspect(self):
        capsule=self.capsule(); request=self.request(capsule)
        result=self.coordinate(capsule,request)
        self.assertEqual(result['status'],'INSPECTED_NOT_ADMITTED',result)
        self.inspection_nonce,self.inspection_sha=request['nonce'],m.sha(m.encoded(result)[:-1])
        outer={'schema':'helmut-native-control-response-v1','operation':'status','nonce':request['nonce'],
            'plan_sha256':m.PLAN,'payload_sha256':self.context['source_sha256'],'result':result,'result_sha256':self.inspection_sha}
        self.write(self.base/'results'/(request['nonce']+'.json'),m.encoded(outer))
        return result

    def run_phase(self,request,context,phase,assets,expected,data):
        self.assertIn(phase,m.PHASES)
        self.assertEqual(context,{key:self.context[key] for key in ('base','source_sha256','deadline')}|{'job_namespace':m.NAMESPACE})
        self.assertEqual(assets,self.assets); self.assertEqual(expected,self.expected)
        self.assertEqual(data,m.data_for([]) if phase == 'context' else
            {**m.data_for([]),'context_ready_sha256':self.driver['read'](self.driver['paths']()['context_receipt'])[1]['sha256']})
        paths=self.driver['paths']()
        if phase == 'context':
            self.write(paths['context_once'],m.encoded({'explicitly_synthetic':'new-context-attempt'}))
            self.write(paths['context_receipt'],m.encoded({'explicitly_synthetic':'new-context-ready'}))
            self.daemon['private']=True
        else: self.write(paths['image_receipt'],m.encoded({'explicitly_synthetic':'new-image-ready'}))
        count=11 if phase == 'context' else 12
        primary=paths['context_receipt' if phase == 'context' else 'image_receipt']
        value={'status':self.library['SUCCESS'],'phase':phase,'ready_sha256':self.driver['read'](primary)[1]['sha256'],
            'native_qualified':False,'native_go_consumed':False,'bindings':self.driver['bindings'](self.driver['roles'](count))}
        nonce=request['nonce']; job_root=self.base/m.NAMESPACE/'jobs'/nonce
        job_root.mkdir(mode=0o700,parents=True)
        worker={'pid':6789+m.PHASES.index(phase),'start_ticks':123,'namespace':[5,6]}
        job={'schema':'helmut-context-daemon-binding-v2-service-job-v1','job_namespace':m.NAMESPACE,
            'request':copy.deepcopy(request),'controller_source_sha256':context['source_sha256'],'plan_sha256':m.PLAN,
            'case_id':m.CASE,'phase':phase,'boot_id':'11111111-2222-3333-4444-555555555555','deadline':context['deadline'],
            'runtime_seconds':245,'controller':{'pid':5678,'start_ticks':100,'namespace':[5,6]},
            'phase_data':copy.deepcopy(data),'assets':copy.deepcopy(expected)}
        job_raw,result_raw=m.encoded(job),m.encoded(value); unit=self.guard['unit_name'](nonce)
        proof={'schema':'helmut-context-daemon-binding-v2-service-lifecycle-v1','nonce':nonce,'phase':phase,
            'controller_source_sha256':context['source_sha256'],'job_sha256':m.sha(job_raw),'boot_id':job['boot_id'],
            'unit':unit,'runtime_seconds':245,'invocation_id':'f'*32,'worker':worker,
            'sole_worker':{'cgroup':'/system.slice/'+unit,'pids':[worker['pid']],'worker':worker},
            'pidfd_exited':True,'unit_exit_code':0,'result_sha256':m.sha(result_raw)}
        arm={'schema':'helmut-context-daemon-binding-v2-service-arm-v1','nonce':nonce,'job_sha256':proof['job_sha256'],
            'controller_source_sha256':context['source_sha256'],'worker':worker}
        ack={'schema':'helmut-context-daemon-binding-v2-service-ack-v1','nonce':nonce,'job_sha256':proof['job_sha256'],
            'result_sha256':proof['result_sha256'],'worker':worker}
        for name,raw in assets.items(): self.write(job_root/name,raw,0o500)
        for name,raw in (('JOB.PRIVATE.json',job_raw),('ARM.PRIVATE.json',m.encoded(arm)),
                         ('ACK.PRIVATE.json',m.encoded(ack)),('RESULT.PRIVATE.json',result_raw)):
            self.write(job_root/name,raw)
        return {**value,'lifecycle_proof':proof}

    def assert_closed(self,result,code=None):
        self.assertEqual(result['status'],'FAIL_KEEP_STATE_NO_RETRY',result)
        self.assertIs(result['native_qualified'],False); self.assertIs(result['native_go_consumed'],False)
        if code is not None: self.assertEqual(result['code'],code,result)
        self.run.assert_not_called()
        self.assertEqual(self.inherited_snapshot(),self.old_snapshot)

    def first_context(self):
        self.inspect(); capsule=self.capsule('setup','context'); result=self.coordinate(capsule)
        self.assertEqual(result['status'],self.library['SUCCESS'],result)
        self.first_capsule=capsule
        return self.base/m.NAMESPACE/'jobs'/self.request(capsule)['nonce']

    def rejected_followup(self,mutate):
        job=self.first_context(); self.assertEqual(len(self.job_names(job)),11)
        mutate(job); self.run.reset_mock()
        self.assert_closed(self.coordinate(self.capsule('setup','image')))
        self.assertFalse((self.base/m.NAMESPACE/'ATTEMPT_IMAGE.PRIVATE.json').exists())

    def job_names(self,path):
        root=self.directory(str(path))
        try: return set(os.listdir(root))
        finally: os.close(root)

    def test_physical_inspection_is_readonly_and_loads_all_seven_pinned_assets(self):
        before=self.inherited_snapshot(); entries=set(self.base.iterdir())
        result=self.coordinate()
        self.assertEqual(result['status'],'INSPECTED_NOT_ADMITTED',result)
        self.assertEqual(set(result),m.INSPECTION_KEYS)
        self.assertEqual(set(self.base.iterdir()),entries)
        self.assertEqual(self.inherited_snapshot(),before)
        self.assertEqual(self.fetch.call_count,7); self.preflight.assert_called_once(); self.run.assert_not_called()
        self.assertFalse((self.base/m.AUTHORITY).exists()); self.assertFalse((self.base/'once'/m.ONCE).exists())

    def test_inspect_context_image_physical_job_seals_keep_old_failure_and_one_authority(self):
        self.inspect(); authority=None
        for phase in m.PHASES:
            capsule=self.capsule('setup',phase); result=self.coordinate(capsule)
            self.assertEqual(result['status'],self.library['SUCCESS'],result)
            raw=self.read_bytes(self.base/m.AUTHORITY)
            if authority is None: authority=raw
            self.assertEqual(raw,authority); self.assertEqual(result['authority_sha256'],m.sha(authority))
            job=self.base/m.NAMESPACE/'jobs'/self.request(capsule)['nonce']
            self.assertEqual(self.job_names(job),set(self.assets)|
                {'JOB.PRIVATE.json','ARM.PRIVATE.json','ACK.PRIVATE.json','RESULT.PRIVATE.json'})
            seal=m.parsed(self.read_bytes(self.base/m.NAMESPACE/m.seal_name(phase)))
            self.assertEqual(set(seal['files']),self.job_names(job))
            self.assertEqual(seal['lifecycle_proof']['pidfd_exited'],True)
            self.assertEqual(self.inherited_snapshot(),self.old_snapshot)
        self.assertEqual([call.args[2] for call in self.run.call_args_list],['context','image'])
        self.assertTrue(self.daemon['private']); self.assertEqual(self.preflight.call_count,2)

    def read_bytes(self,path):
        fd=os.open(path,m.R)
        try:
            raw=bytearray()
            while block:=os.read(fd,65536): raw.extend(block)
            return bytes(raw)
        finally: os.close(fd)

    def test_contract_source_pins_scope_and_phase_list_fail_before_asset_fetch(self):
        original=copy.deepcopy(self.contract)
        for change in ({'setup_authorized':1},{'native_go_consumed':True},{'allowed_phases':['recover','context']},
                       {'coordinator_sha256':'0'*64},{'server_sha256':'0'*64},{'scope_sha256':'0'*64},
                       {'asset_set_sha256':'0'*64},{'target_host':'127.0.0.1'}):
            self.contract={**original,**change}; self.contract_raw=m.encoded(self.contract)
            with self.subTest(change=change): self.assert_closed(self.coordinate())
        self.fetch.assert_not_called()

    def test_missing_corrupt_or_swapped_source_never_admits_or_creates_authority(self):
        for name in self.assets:
            with self.subTest(name=name), patch.object(m,'fetch_asset',side_effect=lambda commit,filename,pin,deadline:
                    b'# wrong source\n' if filename == m.FILES[name] else self.fetch_asset(commit,filename,pin,deadline)):
                self.assert_closed(self.coordinate(),'CONTINUATION_ASSET_HASH')
        self.assertFalse((self.base/m.NAMESPACE).exists())

    def test_expired_capsule_and_inspection_cannot_admit_context(self):
        self.inspect(); self.wall.return_value=10301.0
        self.assert_closed(self.coordinate(self.capsule('setup','context')),'CONTINUATION_AUTHORITY_MISSING_OR_SPENT')
        self.wall.return_value=10000.0; capsule=self.capsule('setup','context'); capsule['expires_at_utc']=9999
        self.assert_closed(self.coordinate(capsule),'CONTINUATION_CAPSULE_TIME')
        self.assertFalse((self.base/m.AUTHORITY).exists())

    def test_missing_inspection_and_foreign_saved_hash_are_not_authority(self):
        self.inspection_nonce,self.inspection_sha='a'*64,'d'*64
        self.assert_closed(self.coordinate(self.capsule('setup','context')))
        self.inspect(); self.inspection_sha='0'*64
        self.assert_closed(self.coordinate(self.capsule('setup','context')),'CONTINUATION_INSPECTION_BINDING')

    def test_daemon_pid_change_or_baseline_drift_denies_first_effect(self):
        self.inspect(); self.daemon['pid']+=1
        self.assert_closed(self.coordinate(self.capsule('setup','context')),'CONTINUATION_INSPECTION_DRIFT')
        self.daemon['pid']-=1; self.baseline['baseline_sha256']='0'*64
        self.assert_closed(self.coordinate(self.capsule('setup','context')),'CONTINUATION_INSPECTION_DRIFT')

    def test_preflight_change_denies_fresh_authority(self):
        self.inspect(); original=self.preflight.side_effect
        self.preflight.side_effect=lambda *a,**kw:{**original(*a,**kw),'source_proof_sha256':'0'*64}
        self.assert_closed(self.coordinate(self.capsule('setup','context')),'CONTINUATION_PREFLIGHT_CHANGED')

    def test_context_replay_wrong_phase_and_finished_chain_never_rearm(self):
        self.first_context(); self.run.reset_mock()
        self.assert_closed(self.coordinate(self.first_capsule),'CONTINUATION_PHASE_ORDER')
        self.assert_closed(self.coordinate(self.capsule('setup','context')),'CONTINUATION_PHASE_ORDER')
        self.assertEqual(self.coordinate(self.capsule('setup','image'))['status'],self.library['SUCCESS'])
        self.run.reset_mock(); self.assert_closed(self.coordinate(self.capsule('setup','image')),'CONTINUATION_PHASE_ORDER')
        self.assert_closed(self.coordinate(),'CONTINUATION_ALREADY_ATTEMPTED')

    def test_finished_context_deadline_does_not_become_live_followup_authority(self):
        self.first_context(); self.context['deadline']=2250.0; self.clock.return_value=2000.0; self.wall.return_value=11000.0
        result=self.coordinate(self.capsule('setup','image'))
        self.assertEqual(result['status'],self.library['SUCCESS'],result)
        self.assertEqual(self.run.call_count,2)

    def test_guard_failure_spends_once_preserves_first_error_and_blocks_retry(self):
        self.inspect(); self.run.side_effect=lambda *args:{'status':'FAIL_KEEP_STATE_NO_RETRY','code':'SYNTHETIC_GUARD_FAILED'}
        result=self.coordinate(self.capsule('setup','context'))
        self.assertEqual(result['code'],'SYNTHETIC_GUARD_FAILED',result)
        first=self.read_bytes(self.base/m.NAMESPACE/m.ERROR)
        self.assertTrue((self.base/'once'/m.ONCE).exists())
        self.run.reset_mock(); self.assert_closed(self.coordinate(self.capsule('setup','context')))
        self.assertEqual(self.read_bytes(self.base/m.NAMESPACE/m.ERROR),first)

    def test_private_exception_text_never_leaks_to_own_first_error(self):
        self.inspect(); self.run.side_effect=ValueError('/synthetic-private-secret')
        result=self.coordinate(self.capsule('setup','context'))
        self.assertEqual(result['code'],'CONTINUATION_IO_OR_FORMAT')
        self.assertNotIn(b'synthetic-private-secret',self.read_bytes(self.base/m.NAMESPACE/m.ERROR))

    def test_current_arm_must_bind_the_physical_job_hash(self):
        self.inspect()
        def bad(*args):
            result=self.run_phase(*args); path=self.base/m.NAMESPACE/'jobs'/args[0]['nonce']/'ARM.PRIVATE.json'
            arm=m.parsed(self.read_bytes(path)); arm['job_sha256']='0'*64; path.write_bytes(m.encoded(arm)); return result
        self.run.side_effect=bad; result=self.coordinate(self.capsule('setup','context'))
        self.assertEqual(result['code'],'CONTINUATION_JOB_HANDSHAKE',result)
        self.assertFalse((self.base/m.NAMESPACE/self.library['marker_name']('context')).exists())

    def test_current_lifecycle_requires_exited_pidfd(self):
        self.inspect()
        def bad(*args):
            result=self.run_phase(*args); result['lifecycle_proof']['pidfd_exited']=False; return result
        self.run.side_effect=bad; result=self.coordinate(self.capsule('setup','context'))
        self.assertEqual(result['code'],'LIFECYCLE_PROOF',result)
        self.assertFalse((self.base/m.NAMESPACE/self.library['marker_name']('context')).exists())

    def test_missing_whole_context_job_blocks_image(self):
        self.rejected_followup(lambda job:shutil.rmtree(job))

    def test_missing_jobs_root_blocks_image(self):
        self.rejected_followup(lambda job:shutil.rmtree(job.parent))

    def test_missing_context_seal_blocks_image(self):
        self.rejected_followup(lambda job:(job.parent.parent/m.seal_name('context')).unlink())

    def test_corrupt_context_seal_blocks_image(self):
        self.rejected_followup(lambda job:(job.parent.parent/m.seal_name('context')).write_bytes(b'{}\n'))

    def test_orphan_image_seal_blocks_image(self):
        self.rejected_followup(lambda job:self.write(job.parent.parent/m.seal_name('image'),b'{}\n'))

    def test_partial_context_seal_blocks_image(self):
        self.rejected_followup(lambda job:self.write(job.parent.parent/(m.seal_name('context')+'.PENDING'),b'{'))

    def test_extra_error_file_inside_previously_accepted_job_blocks_image(self):
        self.rejected_followup(lambda job:self.write(job/'FIRST_ERROR.PRIVATE.json',b'{}\n'))

    def test_previous_context_job_requires_private_directory(self):
        self.rejected_followup(lambda job:job.chmod(0o755))

    def test_previous_source_hardlink_outside_job_blocks_image(self):
        self.rejected_followup(lambda job:os.link(job/'context.py',self.root/'synthetic-hardlinked-context.py'))

    def test_seal_publication_failure_keeps_unknown_state_without_retry(self):
        self.inspect(); publish=self.library['publish']
        def partial(root,name,value):
            if name == m.seal_name('context'):
                fd=os.open(name+'.PENDING',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600,dir_fd=root)
                os.write(fd,b'{'); os.close(fd); raise OSError('SYNTHETIC_PARTIAL_SEAL')
            return publish(root,name,value)
        self.library['publish']=partial
        self.assertEqual(self.coordinate(self.capsule('setup','context'))['status'],'FAIL_KEEP_STATE_NO_RETRY')
        self.assertTrue((self.base/m.NAMESPACE/(m.seal_name('context')+'.PENDING')).exists())
        self.library['publish']=publish; self.run.reset_mock(); self.assert_closed(self.coordinate(self.capsule('setup','context')))

    def test_job_change_after_seal_publication_prevents_accepted_marker(self):
        self.inspect(); publish=self.library['publish']
        def mutate(root,name,value):
            result=publish(root,name,value)
            if name == m.seal_name('context'):
                path=self.base/m.NAMESPACE/'jobs'/value['nonce']/'ACK.PRIVATE.json'; path.write_bytes(b'{}\n')
            return result
        self.library['publish']=mutate
        self.assertEqual(self.coordinate(self.capsule('setup','context'))['status'],'FAIL_KEEP_STATE_NO_RETRY')
        self.assertFalse((self.base/m.NAMESPACE/self.library['marker_name']('context')).exists())

    def test_prior_seal_metadata_change_during_image_effect_blocks_acceptance(self):
        self.first_context()
        def mutate(*args):
            result=self.run_phase(*args); (self.base/m.NAMESPACE/m.seal_name('context')).touch(); return result
        self.run.side_effect=mutate; result=self.coordinate(self.capsule('setup','image'))
        self.assertEqual(result['status'],'FAIL_KEEP_STATE_NO_RETRY',result)
        self.assertFalse((self.base/m.NAMESPACE/self.library['marker_name']('image')).exists())

    def test_unaccepted_job_added_after_image_attempt_prevents_service_call(self):
        self.first_context(); self.run.reset_mock(); publish=self.library['publish']
        def mutate(root,name,value):
            result=publish(root,name,value)
            if name == 'ATTEMPT_IMAGE.PRIVATE.json': (self.base/m.NAMESPACE/'jobs'/('0'*64)).mkdir(mode=0o700)
            return result
        self.library['publish']=mutate
        self.assert_closed(self.coordinate(self.capsule('setup','image')),'CONTINUATION_UNACCEPTED_JOB')

    def test_physical_old_metadata_change_during_effect_stops_acceptance(self):
        self.inspect(); path=Path(self.paths['recovery_ready']); original=self.real_stat(path)
        def mutate(*args):
            result=self.run_phase(*args)
            self.overrides[(original.st_dev,original.st_ino)]={'st_mtime_ns':original.st_mtime_ns+1}
            return result
        self.run.side_effect=mutate; result=self.coordinate(self.capsule('setup','context'))
        self.assertEqual(result['code'],'SYNTHETIC_OLD_BASELINE_CHANGED',result)
        self.assertFalse((self.base/m.NAMESPACE/self.library['marker_name']('context')).exists())

    def test_shared_setup_lock_busy_stops_before_fetch_or_effect(self):
        fd=os.open(self.base/self.library['LOCK'],m.R)
        try:
            fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            self.assert_closed(self.coordinate(),'CONTINUATION_BUSY'); self.fetch.assert_not_called()
        finally: os.close(fd)

    def test_removed_phase_capsules_are_rejected_before_files_or_source_fetch(self):
        self.inspect(); self.fetch.reset_mock()
        for phase in ('recover','checkout','four-tx'):
            with self.subTest(phase=phase): self.assert_closed(self.coordinate(self.capsule('setup',phase)),'CONTINUATION_CAPSULE')
        self.fetch.assert_not_called()


def physical_artifact_test(name,mutation):
    def test(self):
        def mutate(job):
            path=job/name
            if mutation == 'missing': path.unlink()
            elif mutation == 'bytes':
                path.chmod(0o700); path.write_bytes(b'EXPLICIT_SYNTHETIC_JOB_DRIFT\n'); path.chmod(0o500 if name.endswith('.py') else 0o600)
            elif mutation == 'metadata':
                info=self.real_stat(path)
                self.overrides[(info.st_dev,info.st_ino)]={'st_mtime_ns':info.st_mtime_ns+1}
            elif mutation == 'hardlink': os.link(path,path.with_name(name+'.hardlink'))
        self.rejected_followup(mutate)
    return test

for artifact in (*m.FILES,'JOB.PRIVATE.json','ARM.PRIVATE.json','ACK.PRIVATE.json','RESULT.PRIVATE.json'):
    for mutation in ('missing','bytes','metadata'):
        name='test_previous_physical_'+artifact.replace('.','_')+'_'+mutation+'_blocks_image'
        setattr(ContinuationCoordinatorTests,name,physical_artifact_test(artifact,mutation))


if __name__ == '__main__': unittest.main(verbosity=2)
