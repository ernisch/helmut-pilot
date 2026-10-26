"""Synthetic draft-only data. No target/proc/Docker/SSH/GPG/network access."""
from contextlib import ExitStack
import base64
import copy
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'hetzner-native-runtime-metadata.py'
with os.fdopen(os.open(SOURCE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME), 'rb') as stream:
    RAW = stream.read()
m = types.ModuleType('synthetic_fixed_metadata')
exec(compile(RAW, str(SOURCE), 'exec'), m.__dict__)
VERIFY_BASELINE = m.verify_setup_baseline
STATIC_CONFIG = copy.deepcopy(m.SETUP_CONFIG)


class ReaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='synthetic-metadata-', dir=HERE)
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name) / 'control'; self.base.mkdir(mode=0o700)
        self.restored = self.base / 'restored'; self.restored.mkdir(mode=0o700)
        self.leaf = self.restored / m.MEMBER
        self.leaf.parent.mkdir(mode=0o755, parents=True)
        prefix = b'{"schema":"SYNTHETIC_ONLY","elf_names":["elf1","elf2","elf3","elf4","elf5"],"padding":"'
        suffix = b'"}\n'; unicode_mark = '\u00fc'.encode('utf8')
        self.payload = prefix + unicode_mark + b'x'*(m.FILE_BYTES-len(prefix)-len(suffix)-len(unicode_mark)) + suffix
        self.leaf.write_bytes(self.payload); self.leaf.chmod(0o644)
        self.scope = self.restored / 'SOURCE_SCOPE.PRIVATE.json'
        self.row = {'archiveMember': m.MEMBER, 'path': '/' + m.MEMBER[len('files/'):],
            'bytes': len(self.payload), 'sha256': m.sha(self.payload), 'uid': 1000, 'gid': 1000, 'mode': '0o644'}
        self.scope_value = {'schema': 'helmut-encrypted-transport-scope-v4', 'regularFileCount': 1767,
                            'items': [{} for _ in range(1766)] + [self.row]}
        self.scope_raw = m.encoded(self.scope_value)
        self.scope.write_bytes(self.scope_raw); self.scope.chmod(0o600)
        self.leaf_inode = os.stat(self.leaf).st_ino
        self.owner = [1000, 1000]
        self.stack = ExitStack(); self.addCleanup(self.stack.close)
        for key, value in (('BASE', str(self.base)), ('RESTORED', str(self.restored)),
                           ('LEAF', str(self.leaf)), ('SCOPE_FILE', str(self.scope)),
                           ('FILE_SHA', m.sha(self.payload)), ('SCOPE_SHA', m.sha(self.scope_raw))):
            self.stack.enter_context(patch.object(m, key, value))
        for key in ('getuid', 'geteuid', 'getgid', 'getegid'):
            self.stack.enter_context(patch.object(m.os, key, return_value=0))
        real_stat, real_fstat = m.os.stat, m.os.fstat
        def view(info):
            values = {key: getattr(info, key) for key in dir(info) if key.startswith('st_')}
            values.update(st_uid=0, st_gid=0)
            if info.st_ino == self.leaf_inode: values.update(st_uid=self.owner[0], st_gid=self.owner[1])
            return types.SimpleNamespace(**values)
        self.stack.enter_context(patch.object(m.os, 'stat', side_effect=lambda *a, **k: view(real_stat(*a, **k))))
        self.stack.enter_context(patch.object(m.os, 'fstat', side_effect=lambda fd: view(real_fstat(fd))))
        self.stack.enter_context(patch.object(m.time, 'monotonic', return_value=1000.0))
        self.qualified = {key: {'__source_bytes__': ('EXPLICITLY_SYNTHETIC_' + key).encode()}
                          for key in m.MODULE_NAMES}
        self.config = {'schema': 'helmut-runtime-metadata-read-contract-v1', 'contract_id': m.CONTRACT_ID,
            'setup_qualification_commit': '747d6c59088fbc89170f8426f5e2a2fc4ceedd08',
            'setup_deployment_commit': '1'*40, 'setup_server_sha256': '2'*64,
            'contract_sha256': '3'*64, 'asset_set_sha256': '4'*64,
            'modules': {key: {'repoFile': m.MODULE_PINS[key]['repoFile'],
                             'sha256': m.sha(mod['__source_bytes__']), 'bytes': len(mod['__source_bytes__'])}
                        for key, mod in self.qualified.items()},
            'scope_sha256': m.SCOPE_SHA, 'dataset_sha256': m.FILE_SHA, 'dataset_bytes': m.FILE_BYTES,
            'member': m.MEMBER, 'read_only': True, 'native_qualified': False, 'native_go_consumed': False,
            'retained_failure': copy.deepcopy(m.RETAINED),
            'released_safe_sha256': m.FILE_SHA}
        self.stack.enter_context(patch.object(m, 'SETUP_CONFIG', self.config))
        self.stack.enter_context(patch.object(m, 'CONTRACT_SHA256', m.sha(m.encoded(self.config))))
        self.proof = {'baseline_sha256': '5'*64, 'bindings': {},
                      'historical_source_sha256': self.config['setup_server_sha256'],
                      'historical_deployment_commit': self.config['setup_deployment_commit'],
                      'partial_setup_proof': {'schema': 'helmut-runtime-metadata-partial-setup-proof-v1',
                        'source_sha256': self.config['setup_server_sha256'],
                        'deployment_commit': self.config['setup_deployment_commit'],
                        'contract_sha256': self.config['contract_sha256'], 'asset_set_sha256': self.config['asset_set_sha256'],
                        'authority_sha256': '6'*64, 'once_sha256': '7'*64,
                        'accepted_sha256': {phase: m.sha(phase.encode()) for phase in m.PHASES[:2]},
                        'job_seal_sha256': {phase: m.sha(('seal'+phase).encode()) for phase in m.PHASES[:2]},
                        'accepted_phases': list(m.PHASES[:2]), 'failed_phase': 'context',
                        'failed_nonce': m.RETAINED['failed_nonce'],
                        'failed_response_sha256': m.RETAINED['failed_response_sha256'],
                        'failed_result_sha256': m.RETAINED['failed_result_sha256'], 'failed_job_sha256': '8'*64,
                        'failed_unit_state': 'UNKNOWN_UNIT_OBSERVATION',
                        'baseline_sha256': '5'*64, 'native_qualified': False, 'native_go_consumed': False},
                      'failure_diagnostic': {'schema': 'helmut-context-retained-failure-diagnostic-v1',
                        'status': 'RETAINED_CONTEXT_FAILURE_NOT_READY', 'failed_phase': 'context',
                        'failed_nonce': m.RETAINED['failed_nonce'], 'coordinator_code': 'WORKER_FAILED',
                        'records': {key: m.diagnostic_record(None, None, key) for key in m.RECORD_NAMES},
                        'native_qualified': False, 'native_go_consumed': False}}
        self.baseline = self.stack.enter_context(patch.object(m, 'verify_setup_baseline', return_value=self.proof))
        self.context = {'base': str(self.base), 'source_sha256': 'a'*64,
                        'deployment_commit': 'b'*40, 'deadline': 1250.0}

    def read(self, index=0):
        return m.read_runtime_metadata(index, self.context, self.qualified)

    def repin_config(self):
        m.SETUP_CONFIG = self.config
        m.CONTRACT_SHA256 = m.sha(m.encoded(self.config))

    def repin_scope(self):
        self.scope_raw = m.encoded(self.scope_value)
        self.scope.write_bytes(self.scope_raw)
        m.SCOPE_SHA = m.sha(self.scope_raw)
        self.config['scope_sha256'] = m.SCOPE_SHA
        self.repin_config()

    def closed(self, result):
        self.assertEqual(result['status'], 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED', result)
        self.assertIsNone(result['data_base64'])
        self.assertIs(result['native_qualified'], False); self.assertIs(result['native_go_consumed'], False)

    def test_four_exact_chunks_reconstruct_only_this_metadata_and_full_hash_every_call(self):
        chunks = []
        with patch.object(m, 'read_fixed', wraps=m.read_fixed) as reader:
            for index in range(4):
                result = self.read(index)
                self.assertEqual(result['status'], 'RETAINED_CONTEXT_FAILURE_METADATA_NOT_READY', result)
                self.assertLessEqual(len(m.encoded(result)), 131072)
                chunk = base64.b64decode(result['data_base64'], validate=True)
                self.assertEqual(result['chunk_sha256'], m.sha(chunk)); chunks.append(chunk)
                self.assertFalse(result['json_summary']['ascii_only'])
            leaf_calls = [call for call in reader.call_args_list if call.args[0] == str(self.leaf)]
            self.assertEqual(len(leaf_calls), 4)
            self.assertTrue(all(call.args[2:5] == (207733, 207733, m.FILE_SHA) for call in leaf_calls))
        self.assertEqual(list(map(len, chunks)), [65536, 65536, 65536, 11125])
        self.assertEqual(b''.join(chunks), self.payload)
        self.assertEqual(self.baseline.call_count, 8)

    def test_real_source_modes_are_derived_from_bound_scope_not_assumed_0600(self):
        for mode in (0o600, 0o640, 0o644, 0o444, 0o400):
            with self.subTest(mode=oct(mode)):
                self.leaf.chmod(mode); self.row['mode'] = oct(mode); self.repin_scope()
                result = self.read()
                self.assertEqual(result['status'], 'RETAINED_CONTEXT_FAILURE_METADATA_NOT_READY', result)
                self.assertEqual(result['file_binding']['metadata'][2] & 0o777, mode)

    def test_wrong_mode_owner_group_or_size_stops(self):
        self.leaf.chmod(0o600); self.closed(self.read())
        self.leaf.chmod(0o644); self.owner[0] = 999; self.closed(self.read())
        self.owner[:] = [1000, 999]; self.closed(self.read())
        self.owner[:] = [1000, 1000]; self.leaf.write_bytes(self.payload[:-1]); self.closed(self.read())

    def test_symlink_and_hardlink_are_not_regular_single_source(self):
        self.leaf.unlink(); self.leaf.symlink_to(self.scope); self.closed(self.read())
        self.leaf.unlink(); self.leaf.write_bytes(self.payload); self.leaf.chmod(0o644)
        self.leaf_inode = os.stat(self.leaf).st_ino
        os.link(self.leaf, self.restored / 'SYNTHETIC_HARDLINK')
        self.closed(self.read())

    def test_root_and_parent_permissions_are_positively_checked(self):
        self.base.chmod(0o755); self.closed(self.read())
        self.base.chmod(0o700); self.leaf.parent.chmod(0o777); self.closed(self.read())
        self.leaf.parent.chmod(0o755)
        with patch.object(m.os, 'geteuid', return_value=1000): self.closed(self.read())

    def test_file_change_during_full_read_never_releases_a_chunk(self):
        original = m.os.read; changed = []
        def read(fd, size):
            value = original(fd, size)
            if os.fstat(fd).st_ino == self.leaf_inode and not changed:
                changed.append(True)
                info = os.stat(self.leaf)
                os.utime(self.leaf, ns=(info.st_atime_ns, info.st_mtime_ns + 1))
            return value
        with patch.object(m.os, 'read', side_effect=read): self.closed(self.read())
        self.assertTrue(changed)

    def test_even_unrequested_chunk_tampering_fails_the_whole_hash(self):
        fd = os.open(self.leaf, os.O_WRONLY)
        try: os.lseek(fd, -4, os.SEEK_END); os.write(fd, b'z')
        finally: os.close(fd)
        self.closed(self.read(0))

    def test_scope_hash_wrong_or_duplicate_fixed_row_stops(self):
        self.scope.write_bytes(self.scope_raw + b' '); self.closed(self.read())
        self.scope_value['items'][-2] = copy.deepcopy(self.row); self.repin_scope()
        self.closed(self.read())

    def test_unchanged_scope_hash_cannot_be_supplied_by_caller(self):
        self.scope_value['items'][-1]['mode'] = '0o600'
        self.scope.write_bytes(m.encoded(self.scope_value))
        self.closed(self.read())

    def test_duplicate_json_nonfinite_invalid_utf8_and_depth_stop(self):
        bad = (b'{"a":1,"a":2}', b'{"d\\u0061ta":1,"data":2}', b'{"a":NaN}',
               b'{"a":1e999}', b'\xff', b'['*70 + b'0' + b']'*70)
        for raw in bad:
            with self.subTest(raw=raw[:25]):
                with self.assertRaises((m.Stop, ValueError, UnicodeError)): m.unique_json(raw)

    def test_unbound_or_mutated_source_config_is_closed(self):
        with patch.object(m, 'CONTRACT_SHA256', None): self.closed(self.read())
        self.config['read_only'] = False; self.repin_config(); self.closed(self.read())
        self.baseline.assert_not_called()

    def test_config_extra_bad_baseline_or_wrong_namespace_source_stops(self):
        original = copy.deepcopy(self.config)
        for change in ({'extra': True}, {'setup_deployment_commit': None}, {'released_safe_sha256': '0'*64},
                       {'native_qualified': True}, {'setup_qualification_commit': '0'*40}):
            self.config = {**original, **change}; self.repin_config(); self.closed(self.read())
        self.config = original; self.repin_config()
        self.qualified['guard.py']['__source_bytes__'] += b'DRIFT'
        self.closed(self.read())
        self.baseline.assert_not_called()

    def test_baseline_missing_or_changes_prevents_release(self):
        self.baseline.side_effect = m.Stop('METADATA_FOUR_ACCEPTED_REQUIRED')
        with patch.object(m, 'read_fixed', wraps=m.read_fixed) as reader:
            self.closed(self.read()); reader.assert_not_called()
        self.baseline.side_effect = [self.proof, {**self.proof, 'baseline_sha256': '9'*64}]
        self.closed(self.read())

    def test_schema_only_fallback_is_unknown_and_emits_no_json_values(self):
        self.config['released_safe_sha256'] = None; self.repin_config()
        result = self.read()
        self.assertEqual(result['status'], 'UNKNOWN_CONTENT_REVIEW_REQUIRED')
        self.assertIsNone(result['data_base64']); self.assertIsNone(result['chunk_sha256'])
        self.assertNotIn('SYNTHETIC_ONLY', str(result)); self.assertNotIn('elf1', str(result))

    def test_invalid_index_deadline_and_context_do_not_read_dataset(self):
        for index in (-1, 4, True, '0', None): self.closed(self.read(index))
        self.context['deadline'] = 1000; self.closed(self.read())
        self.context['deadline'] = 1250; self.context['extra'] = True; self.closed(self.read())
        self.baseline.assert_not_called()

    def test_private_exception_text_never_enters_output(self):
        self.baseline.side_effect = OSError('/private/original_jit_source credentials')
        result = self.read(); self.closed(result)
        self.assertNotIn('original_jit', str(result)); self.assertNotIn('credentials', str(result))

    def test_closed_results_bind_new_reader_and_original_setup_separately(self):
        result = self.read(2)
        self.assertEqual(set(result), {'schema', 'status', 'contract_id', 'contract_sha256', 'source_sha256',
            'dataset_sha256', 'dataset_bytes', 'file_binding', 'scope_sha256', 'source_row_sha256',
            'partial_setup_proof', 'failure_diagnostic', 'chunk_index', 'chunk_count', 'chunk_size', 'chunk_sha256', 'data_base64',
            'json_summary', 'native_qualified', 'native_go_consumed'})
        self.assertEqual(result['source_sha256'], self.context['source_sha256'])
        self.assertEqual(result['contract_sha256'], m.CONTRACT_SHA256)
        self.assertNotEqual(result['source_sha256'], result['partial_setup_proof']['source_sha256'])
        summary = result['json_summary']
        self.assertEqual(set(summary['type_counts']), {'dict', 'list', 'str', 'int', 'float', 'bool', 'NoneType'})
        self.assertEqual(sum(summary['type_counts'].values()), summary['nodes'])
        self.baseline.side_effect = m.Stop('SYNTHETIC_BASELINE_UNKNOWN')
        failure = self.read(2)
        self.assertEqual(set(failure), {'schema', 'status', 'contract_id', 'contract_sha256', 'source_sha256',
            'dataset_sha256', 'dataset_bytes', 'chunk_index', 'code', 'data_base64', 'native_qualified', 'native_go_consumed'})
        self.assertEqual(failure['source_sha256'], self.context['source_sha256'])
        self.assertEqual(failure['contract_sha256'], m.CONTRACT_SHA256)
        self.assertEqual(failure['chunk_index'], 2)

    def test_early_failure_builder_sanitizes_code_and_never_carries_payload(self):
        result = m.failure('/private/original/source.py SECRET', self.context, 3)
        self.closed(result)
        self.assertEqual(result['code'], 'METADATA_IO_OR_FORMAT')
        self.assertEqual(result['chunk_index'], 3)
        self.assertNotIn('SECRET', str(result)); self.assertNotIn('/private/', str(result))

    def test_frozen_8139_setup_profile_and_new_preflight_pin_are_exact(self):
        self.assertEqual(STATIC_CONFIG['setup_qualification_commit'], '747d6c59088fbc89170f8426f5e2a2fc4ceedd08')
        self.assertEqual(STATIC_CONFIG['setup_deployment_commit'], '8139b3a99d04e3e854f886123869bf669da6389d')
        self.assertEqual(STATIC_CONFIG['setup_server_sha256'], '1fc63bf8c90a6f13a2eebf4981d7f0c7da0b10f5e5c2fd563551e117f0ec58fe')
        self.assertEqual(STATIC_CONFIG['contract_sha256'], 'e5ffcce62f8a419f11596e7ef88e9d10f4585d33b1b18e7d962670475d4d4059')
        self.assertEqual(STATIC_CONFIG['modules']['preflight'], {
            'repoFile': 'hetzner-native-setup-successor-preflight.py', 'bytes': 19099,
            'sha256': '726534ef06f5649efa1282c0aabdc49857706104a4a82f2677259cc837a1764b'})
        self.assertEqual(STATIC_CONFIG['asset_set_sha256'], '9941129431d0575caa1afe9afab497fd7d111c18ede0566b5498ec5089751c07')

    def physical_partial_fixture(self):
        # Real pinned file readers, prefix/lifecycle/seal checks, own synthetic
        # state. Kernel/systemd observation and original recovery contents are
        # replaced; none of the fixture paths reaches a target.
        qualified = {}
        for key, pin in m.MODULE_PINS.items():
            path = HERE / pin['repoFile']
            with os.fdopen(os.open(path, m.R), 'rb') as stream: raw = stream.read()
            module = {'__name__': 'synthetic_qualified_' + key, '__source_bytes__': raw}
            if key in ('library', 'successor', 'guard.py'):
                exec(compile(raw, str(path), 'exec'), module)
            qualified[key] = module
        lib, succ, guard = (qualified[key] for key in ('library', 'successor', 'guard.py'))
        state_path = self.base / m.NAMESPACE
        state_path.mkdir(mode=0o700); (state_path / 'jobs').mkdir(mode=0o700)
        (self.base / 'results').mkdir(mode=0o700); (self.base / 'once').mkdir(mode=0o700)
        context_base = self.base / 'context'; context_base.mkdir(mode=0o700)
        self.stack.enter_context(patch.object(m, 'CONTEXT_BASE', str(context_base)))
        def directory(path):
            target = Path(path)
            self.assertTrue(target == self.base or self.base in target.parents)
            return os.open(path, m.R | os.O_DIRECTORY)
        lib['directory'] = directory; lib['BASE'] = str(self.base)
        succ.update(BASE=str(self.base), STATE_ROOT=str(state_path))
        config = copy.deepcopy(STATIC_CONFIG)
        profile = config['retained_failure']
        assets = {name: qualified[name]['__source_bytes__'] for name in lib['FILES']}
        expected, asset_set = lib['asset_pins']()
        old_context = {'base': str(self.base), 'source_sha256': config['setup_server_sha256'],
            'deployment_commit': config['setup_deployment_commit'], 'deadline': 800.0}
        roles = lib['ROLES']
        bindings = {role: {'sha256': None if role == 'public_repository' else m.sha(role.encode()), 'metadata': [1]*12}
                    for role in roles}
        bindings['recovery_ready']['sha256'] = profile['recover']['ready_sha256']
        bindings['public_ready']['sha256'] = profile['checkout']['ready_sha256']
        paths = {role: str(self.base / ('SYNTHETIC_' + role)) for role in roles}
        qualified['driver.py'].update(bindings=lambda selected: {key: copy.deepcopy(bindings[key]) for key in selected},
            paths=lambda: paths, read=lambda path: (b'SYNTHETIC_RECEIPT', copy.deepcopy(bindings[next(key for key,v in paths.items() if v==path)])))
        runtime = {'boot_id': '11111111-2222-3333-4444-555555555555', 'namespace_identity': [5, 6]}
        summary = {'SYNTHETIC_LEGACY_HISTORY': True}
        succ['saved_inspection'] = Mock(return_value=({'runtime': runtime, 'history': summary, 'gzip': {}}, {}))
        succ['runtime_snapshot'] = Mock(return_value=runtime)
        succ['require_controller_ended'] = Mock()
        succ['old_cgroup_empty'] = Mock(return_value={'state': 'ABSENT', 'identity': None})
        qualified['preflight'].update(collect_history=Mock(return_value={}), history_summary=Mock(return_value=summary),
            verify_history_unchanged=Mock(return_value=True))
        qualified['context.py']['recovery_stage_proof'] = Mock()
        capsule = {'inspection_nonce': '7'*64, 'inspection_result_sha256': '8'*64}
        authority = succ['authority_value'](profile['recover']['nonce'], capsule, old_context,
            config['contract_sha256'], asset_set, {'runtime': runtime, 'history': summary, 'gzip': {}}, {})
        def write(path, raw, mode=0o600):
            fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode)
            with os.fdopen(fd,'wb') as stream:stream.write(raw)
        authority_raw = m.encoded(authority); profile['authority_sha256'] = m.sha(authority_raw)
        write(self.base / succ['AUTHORITY'], authority_raw)
        write(self.base / 'once' / succ['ONCE'], m.encoded({'schema':'helmut-setup-successor-once-v1',
            'contract_id':m.NAMESPACE,'authority_sha256':profile['authority_sha256'],
            'state':'ADMITTED_FIXED_FOUR_PHASES_NO_REARM'}))
        def job_files(phase, index):
            nonce = profile[phase]['nonce'] if phase != 'context' else profile['failed_nonce']
            root = state_path / 'jobs' / nonce; root.mkdir(mode=0o700)
            request = {'schema':'helmut-native-control-request-v1','operation':'admit','nonce':nonce,
                'plan_sha256':guard['PLAN'],'payload_sha256':config['setup_server_sha256']}
            data = {'old_receipt_sha256':lib['EXPECTED_OLD_RECEIPT'],
                'recovery_ready_sha256':None if index==0 else profile['recover']['ready_sha256'],
                'public_ready_sha256':profile['checkout']['ready_sha256'] if index==2 else None,
                'context_ready_sha256':None}
            job = {'schema':'helmut-setup-service-job-successor-v1','job_namespace':m.NAMESPACE,
                'request':request,'controller_source_sha256':config['setup_server_sha256'],'plan_sha256':guard['PLAN'],
                'case_id':m.CASE,'phase':phase,'boot_id':runtime['boot_id'],'deadline':800.0,'runtime_seconds':245,
                'controller':{'pid':12345,'start_ticks':100,'namespace':[5,6]},'phase_data':data,'assets':expected}
            worker={'pid':20000+index,'start_ticks':100+index,'namespace':[5,6]}
            raw=m.encoded(job); write(root/'JOB.PRIVATE.json',raw)
            for name, source in assets.items():write(root/name,source,0o500)
            arm={'schema':'helmut-setup-service-arm-v1','nonce':nonce,'job_sha256':m.sha(raw),
                'controller_source_sha256':config['setup_server_sha256'],'worker':worker}
            write(root/'ARM.PRIVATE.json',m.encoded(arm))
            write(state_path/('ATTEMPT_'+phase.upper()+'.PRIVATE.json'), m.encoded(succ['attempt_value'](
                phase,nonce,profile['authority_sha256'],config['contract_sha256'])))
            return root,job,worker,arm
        for index,phase in enumerate(m.PHASES[:2]):
            root,job,worker,arm=job_files(phase,index)
            value={'status':lib['SUCCESS'],'phase':phase,'ready_sha256':profile[phase]['ready_sha256'],
                'native_qualified':False,'native_go_consumed':False,
                'bindings':{key:copy.deepcopy(bindings[key]) for key in roles[:lib['COUNTS'][index]]}}
            result_raw=m.encoded(value); write(root/'RESULT.PRIVATE.json',result_raw)
            ack={'schema':'helmut-setup-service-ack-v1','nonce':profile[phase]['nonce'],
                'job_sha256':arm['job_sha256'],'result_sha256':m.sha(result_raw),'worker':worker}
            write(root/'ACK.PRIVATE.json',m.encoded(ack))
            unit=guard['unit_name'](profile[phase]['nonce'])
            proof={'schema':'helmut-setup-service-lifecycle-v1','nonce':profile[phase]['nonce'],'phase':phase,
                'controller_source_sha256':config['setup_server_sha256'],'job_sha256':arm['job_sha256'],
                'boot_id':runtime['boot_id'],'unit':unit,'runtime_seconds':245,'invocation_id':'f'*32,'worker':worker,
                'sole_worker':{'cgroup':'/system.slice/'+unit,'pids':[worker['pid']],'worker':worker},
                'pidfd_exited':True,'unit_exit_code':0,'result_sha256':m.sha(result_raw)}
            marker={'schema':'helmut-target-setup-accepted-v1','phase':phase,
                'controller_source_sha256':config['setup_server_sha256'],'asset_set_sha256':asset_set,
                'nonce':profile[phase]['nonce'],'ready_sha256':profile[phase]['ready_sha256'],
                'guard_result_sha256':m.sha(result_raw),'lifecycle_sha256':m.sha(m.encoded(proof)),
                'bindings':value['bindings'],'native_qualified':False,'native_go_consumed':False}
            snapshot,_=succ['job_snapshot'](profile[phase]['nonce'],assets,expected,lib,1250)
            seal=succ['seal_value'](profile[phase]['nonce'],phase,proof,snapshot,old_context,asset_set,
                profile['authority_sha256'],config['contract_sha256'])
            marker_raw=m.encoded(marker); profile[phase]['accepted_sha256']=m.sha(marker_raw)
            profile[phase]['lifecycle_sha256']=marker['lifecycle_sha256']
            write(state_path/lib['marker_name'](phase),marker_raw)
            write(state_path/succ['seal_name'](phase),m.encoded(seal))
        failed_root, failed_job, failed_worker, arm=job_files('context',2)
        error=guard['safe_error'](OSError(9,'PRIVATE_UNEXPORTED_EXCEPTION'),'context')
        write(failed_root/'FIRST_ERROR.PRIVATE.json',m.encoded(error))
        for i,code in enumerate(('PHASE_FAILED','WORKER_FAILED')):
            write(failed_root/('.setup-write-'+str(i)*32+'.tmp'),m.encoded(guard['safe_error'](guard['Stop'](code),'context')))
        failure=succ['fail_result']('context','WORKER_FAILED',config['contract_sha256'])
        response={'schema':'helmut-native-control-response-v1','operation':'admit','nonce':profile['failed_nonce'],
            'plan_sha256':guard['PLAN'],'payload_sha256':config['setup_server_sha256'],
            'result':failure,'result_sha256':m.sha(m.encoded(failure)[:-1])}
        response_raw=m.encoded(response)
        # Exact canonical real-public artifact conventions, including LF.
        self.assertEqual(m.sha(response_raw),STATIC_CONFIG['retained_failure']['failed_response_sha256'])
        self.assertEqual(m.sha(m.encoded(failure)), '08561bc6393049e003acebb7e1d4039e17f269f4b2a632c78de43c50a4933a6b')
        write(self.base/'results'/(profile['failed_nonce']+'.json'),response_raw)
        write(state_path/'FIRST_ERROR.PRIVATE.json',m.encoded(failure))
        component={'status':'FAIL_KEEP_PARTIAL_CONTEXT_NO_RETRY','phase':'private-mounts','code':'CONTEXT_FAILURE',
            'exceptionType':'OSError','errno':9,'case_id':m.CASE,'globalEmptyAnchorsCreated':[],
            'globalAnchorAttempts':[],'mountState':'UNKNOWN','lastAcknowledgedStep':0,
            'nativeQualified':False,'nativeGOConsumed':False}
        write(context_base/'NATIVE_CONTEXT_FIRST_ERROR.PRIVATE.json',m.encoded(component))
        write(context_base/'NATIVE_CONTEXT_ATTEMPT.SAFE.json',m.encoded({'case_id':m.CASE,
            'stage_sha256':profile['recover']['ready_sha256'],'daemon':{'SYNTHETIC_PRIVATE_OBSERVATION':True}}))
        unit=guard['unit_name'](profile['failed_nonce'])
        fields={'Id':unit,'Transient':'yes','Type':'exec','MainPID':'0','ControlPID':'0','ControlGroup':'',
            'KillMode':'control-group','Restart':'no','RemainAfterExit':'yes','User':'root','Group':'root','UMask':'0077',
            'StandardOutput':'null','StandardError':'null','Delegate':'no','SendSIGKILL':'yes','KillSignal':'15',
            'FinalKillSignal':'9','TimeoutStopFailureMode':'kill','ExecMainCode':'1','ExecMainStatus':'1','Result':'exit-code',
            'ActiveState':'failed','SubState':'failed','ExecMainPID':str(failed_worker['pid']),
            'RuntimeMaxUSec':'245s','TimeoutStopUSec':'5s','InvocationID':'f'*32,
            'ExecMainStartTimestampMonotonic':'100','ExecMainExitTimestampMonotonic':'200',
            'ExecStart':'{ path=/usr/bin/env ; argv[]='+' '.join(guard['worker_argv'](profile['failed_nonce'],m.NAMESPACE))+' ; ignore_errors=no ; }'}
        worker_argv=guard['worker_argv']
        def typed_property(argv,deadline):
            self.assertEqual(argv[:4],['/usr/bin/busctl','--system','--json=short','get-property'])
            self.assertEqual(argv[4],'org.freedesktop.systemd1')
            self.assertEqual(argv[5],'/org/freedesktop/systemd1/unit/'+unit.replace('-','_2d').replace('.','_2e'))
            key=argv[-1]
            if key=='ExecStart':
                return m.encoded({'type':'a(sasbttttuii)','data':[['/usr/bin/env',
                    worker_argv(profile['failed_nonce'],m.NAMESPACE),False,0,0,0,0,failed_worker['pid'],0,0]]})
            if key in ('MainPID','ControlPID','ExecMainPID'):
                return m.encoded({'type':'u','data':int(fields[key])})
            return m.encoded({'type':'s','data':fields[key]})
        guard.update(unit_fields=Mock(side_effect=AssertionError('no systemctl show/load')),unit_hooks=Mock(),
            boot_id=Mock(return_value=runtime['boot_id']),
            run_setup_phase=Mock(side_effect=AssertionError('read only')),command=Mock(side_effect=typed_property))
        guard['worker_argv']=Mock(wraps=guard['worker_argv'])
        lib['accepted_chain']=Mock(side_effect=AssertionError('must not relax four-phase checker'))
        lib['guard_jobs_check']=Mock(side_effect=AssertionError('failed job is not accepted'))
        succ['state_check']=Mock(side_effect=AssertionError('known failure is retained'))
        self.partial_context_base=context_base; self.partial_state=state_path; self.partial_failed=failed_root
        self.partial_profile=profile; self.partial_component=component
        return config,qualified

    def test_exact_partial_baseline_uses_physical_jobs_and_retains_failure(self):
        config,qualified=self.physical_partial_fixture()
        proof=VERIFY_BASELINE(config,qualified,1250)
        self.assertEqual(proof['partial_setup_proof']['accepted_phases'],['recover','checkout'])
        self.assertEqual(proof['partial_setup_proof']['failed_phase'],'context')
        records=proof['failure_diagnostic']['records']
        self.assertEqual(records['job_error']['code'],'FILESYSTEM_OR_PHASE_FAILURE')
        self.assertEqual(records['component_error']['code'],'CONTEXT_FAILURE')
        self.assertEqual(records['component_error']['errno'],9)
        self.assertEqual(records['component_attempt']['state'],'UNKNOWN_UNACCEPTED')
        self.assertEqual(records['component_receipt']['state'],'ABSENT')
        qualified['library']['accepted_chain'].assert_not_called()
        qualified['library']['guard_jobs_check'].assert_not_called()
        qualified['successor']['state_check'].assert_not_called()
        qualified['guard.py']['run_setup_phase'].assert_not_called()
        qualified['guard.py']['worker_argv'].assert_called_with(config['retained_failure']['failed_nonce'],m.NAMESPACE)

    def test_partial_baseline_rejects_missing_accepted_job_and_additional_sibling(self):
        config,q=self.physical_partial_fixture()
        job=self.partial_state/'jobs'/self.partial_profile['recover']['nonce']
        (job/'ARM.PRIVATE.json').unlink()
        with self.assertRaisesRegex(q['successor']['Stop'],'SUCCESSOR_JOB_FILES'):VERIFY_BASELINE(config,q,1250)

    def test_partial_baseline_does_not_allow_future_accepted_or_image_attempt(self):
        config,q=self.physical_partial_fixture()
        extra=self.partial_state/'SETUP_CONTEXT_ACCEPTED.SAFE.json'; extra.write_bytes(b'{}\n');extra.chmod(0o600)
        with self.assertRaises(m.Stop):VERIFY_BASELINE(config,q,1250)

    def test_unknown_component_contents_are_digest_only(self):
        config,q=self.physical_partial_fixture()
        (self.partial_context_base/'NATIVE_CONTEXT_FIRST_ERROR.PRIVATE.json').write_bytes(b'PRIVATE ORIGINAL CODE secret')
        proof=VERIFY_BASELINE(config,q,1250)
        record=proof['failure_diagnostic']['records']['component_error']
        self.assertEqual(record['state'],'UNKNOWN');self.assertIsNone(record['code'])
        self.assertNotIn('PRIVATE',str(proof['failure_diagnostic']))

    def test_failed_job_optional_outputs_are_bound_not_assumed_absent_or_successful(self):
        config,q=self.physical_partial_fixture()
        for name in ('ACK.PRIVATE.json','RESULT.PENDING.PRIVATE.json','RESULT.PRIVATE.json'):
            path=self.partial_failed/name;path.write_bytes(b'{}\n');path.chmod(0o600)
        proof=VERIFY_BASELINE(config,q,1250)
        self.assertEqual(proof['partial_setup_proof']['accepted_phases'],['recover','checkout'])
        for name in ('ACK.PRIVATE.json','RESULT.PENDING.PRIVATE.json','RESULT.PRIVATE.json'):
            self.assertIn('sha256',proof['bindings']['failed_optional:'+name])

    def test_job_error_preserves_context_stop_but_component_rejects_guard_code(self):
        config,q=self.physical_partial_fixture()
        path=self.partial_failed/'FIRST_ERROR.PRIVATE.json'
        path.write_bytes(m.encoded(q['guard.py']['safe_error'](q['guard.py']['Stop']('SOURCE_SUBMOUNT'),'context')))
        record=VERIFY_BASELINE(config,q,1250)['failure_diagnostic']['records']['job_error']
        self.assertEqual(record['state'],'PRESENT');self.assertEqual(record['code'],'SOURCE_SUBMOUNT')
        component={**self.partial_component,'code':'WORKER_FAILED'}
        path=self.partial_context_base/'NATIVE_CONTEXT_FIRST_ERROR.PRIVATE.json'
        path.write_bytes(m.encoded(component))
        record=VERIFY_BASELINE(config,q,1250)['failure_diagnostic']['records']['component_error']
        self.assertEqual(record['state'],'UNKNOWN');self.assertIsNone(record['code'])

    def test_context_step_is_stored_index_including_10_not_ack_count(self):
        config,q=self.physical_partial_fixture()
        for index in (-1,0,8,9,10):
            path=self.partial_context_base/'NATIVE_CONTEXT_FIRST_ERROR.PRIVATE.json'
            path.write_bytes(m.encoded({**self.partial_component,'lastAcknowledgedStep':index}))
            record=VERIFY_BASELINE(config,q,1250)['failure_diagnostic']['records']['component_error']
            self.assertEqual(record['state'],'PRESENT');self.assertEqual(record['last_acknowledged_step'],index)
        path.write_bytes(m.encoded({**self.partial_component,'lastAcknowledgedStep':11}))
        self.assertEqual(VERIFY_BASELINE(config,q,1250)['failure_diagnostic']['records']['component_error']['state'],'UNKNOWN')

    def test_component_receipt_observation_never_exports_success_semantics(self):
        config,q=self.physical_partial_fixture()
        out=self.partial_context_base/('native-context-'+m.CASE);out.mkdir(mode=0o700)
        for name in ('CONTEXT_RECEIPT.SAFE.json','CONTEXT_RECEIPT.PENDING.SAFE.json'):
            path=out/name;path.write_bytes(m.encoded({'status':'CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED',
                'PRIVATE_FIELD':'UNEXPORTED_ORIGINAL','nativeQualified':False}));path.chmod(0o600)
        records=VERIFY_BASELINE(config,q,1250)['failure_diagnostic']['records']
        for key in ('component_receipt','component_receipt_pending','component_attempt'):
            self.assertEqual(records[key]['state'],'UNKNOWN_UNACCEPTED')
            self.assertIsNone(records[key]['source_status']);self.assertIsNone(records[key]['phase'])
            self.assertIsNone(records[key]['code']);self.assertTrue(m.hex64(records[key]['sha256']))
        self.assertNotIn('UNEXPORTED_ORIGINAL',str(records))

    def test_case_extra_job_temp_or_wrong_job_identity_stops_without_effect(self):
        config,q=self.physical_partial_fixture()
        temp=self.partial_failed/('.setup-write-'+'e'*32+'.tmp');temp.write_bytes(b'{}\n');temp.chmod(0o600)
        with self.assertRaises(m.Stop):VERIFY_BASELINE(config,q,1250)
        temp.unlink()
        path=self.partial_failed/'JOB.PRIVATE.json';job=m.unique_json(path.read_bytes())[0]
        job['job_namespace']='legacy';path.write_bytes(m.encoded(job))
        with self.assertRaisesRegex(m.Stop,'METADATA_FAILED_JOB_BINDING'):VERIFY_BASELINE(config,q,1250)
        q['guard.py']['run_setup_phase'].assert_not_called()

    def test_optional_zero_byte_files_are_present_unknown_not_absent(self):
        config,q=self.physical_partial_fixture()
        out=self.partial_context_base/('native-context-'+m.CASE);out.mkdir(mode=0o700)
        paths={'component_error':self.partial_context_base/'NATIVE_CONTEXT_FIRST_ERROR.PRIVATE.json',
            'component_attempt':self.partial_context_base/'NATIVE_CONTEXT_ATTEMPT.SAFE.json',
            'component_receipt':out/'CONTEXT_RECEIPT.SAFE.json',
            'component_receipt_pending':out/'CONTEXT_RECEIPT.PENDING.SAFE.json'}
        for path in paths.values():path.write_bytes(b'');path.chmod(0o600)
        records=VERIFY_BASELINE(config,q,1250)['failure_diagnostic']['records']
        for name in paths:
            row=records[name]
            self.assertEqual(row['state'],'UNKNOWN' if name=='component_error' else 'UNKNOWN_UNACCEPTED')
            self.assertEqual(row['sha256'],m.sha(b''));self.assertEqual(row['bytes'],0)
            self.assertEqual(row['metadata'][6],0);self.assertIsNone(row['code'])

    def test_mandatory_canonical_namespace_error_cannot_be_zero_byte(self):
        config,q=self.physical_partial_fixture()
        (self.partial_state/'FIRST_ERROR.PRIVATE.json').write_bytes(b'')
        with self.assertRaises(q['successor']['Stop']):VERIFY_BASELINE(config,q,1250)

    def test_optional_error_absence_does_not_imply_no_attempt_or_no_mounts(self):
        config,q=self.physical_partial_fixture()
        (self.partial_context_base/'NATIVE_CONTEXT_FIRST_ERROR.PRIVATE.json').unlink()
        proof=VERIFY_BASELINE(config,q,1250)
        self.assertEqual(proof['failure_diagnostic']['records']['component_error']['state'],'ABSENT')
        self.assertEqual(proof['failure_diagnostic']['records']['component_attempt']['state'],'UNKNOWN_UNACCEPTED')
        self.assertEqual(proof['partial_setup_proof']['failed_phase'],'context')

    def test_unavailable_unit_is_explicit_unknown_after_positive_birth_and_cgroup_checks(self):
        config,q=self.physical_partial_fixture()
        q['guard.py']['command'].side_effect=q['guard.py']['Stop']('CONTROL_COMMAND_FAILED')
        proof=VERIFY_BASELINE(config,q,1250)
        self.assertEqual(proof['partial_setup_proof']['failed_unit_state'],'UNKNOWN_UNIT_OBSERVATION')
        self.assertEqual(proof['bindings']['failed_unit']['cgroup']['state'],'ABSENT')
        q['guard.py']['unit_fields'].assert_not_called()
        birth_calls=q['successor']['require_controller_ended'].call_args_list
        self.assertTrue(any(call.args[0].get('controller',{}).get('pid')==20002 for call in birth_calls))
        self.assertGreaterEqual(len(birth_calls),4)

    def test_signal_or_unavailable_end_accounting_is_not_invented_as_exit1(self):
        config,q=self.physical_partial_fixture()
        proof=VERIFY_BASELINE(config,q,1250)
        self.assertEqual(proof['partial_setup_proof']['failed_unit_state'],'LOADED_QUIESCENT')
        keys=[call.args[0][-1] for call in q['guard.py']['command'].call_args_list]
        self.assertNotIn('ExecMainCode',keys);self.assertNotIn('ExecMainStatus',keys);self.assertNotIn('Result',keys)

    def test_unavailable_unit_does_not_weaken_quiescence_or_control_limits(self):
        config,q=self.physical_partial_fixture()
        q['guard.py']['command'].side_effect=q['guard.py']['Stop']('CONTROL_COMMAND_LIMIT')
        with self.assertRaises(q['guard.py']['Stop']):VERIFY_BASELINE(config,q,1250)
        q['guard.py']['command'].side_effect=q['guard.py']['Stop']('CONTROL_COMMAND_FAILED')
        q['successor']['require_controller_ended'].side_effect=q['successor']['Stop']('SUCCESSOR_OLD_CONTROLLER_ALIVE')
        with self.assertRaises(q['successor']['Stop']):VERIFY_BASELINE(config,q,1250)

    def test_all_chunks_use_actual_partial_baseline_without_context_or_image_acceptance(self):
        config,q=self.physical_partial_fixture()
        config.update(scope_sha256=m.SCOPE_SHA,dataset_sha256=m.FILE_SHA,released_safe_sha256=m.FILE_SHA)
        self.config=config;self.qualified=q;self.repin_config()
        self.stack.enter_context(patch.object(m,'RETAINED',config['retained_failure']))
        chunks=[]
        with patch.object(m,'verify_setup_baseline',side_effect=VERIFY_BASELINE):
            for index in range(4):
                result=self.read(index)
                self.assertEqual(result['status'],'RETAINED_CONTEXT_FAILURE_METADATA_NOT_READY',result)
                self.assertEqual(result['partial_setup_proof']['accepted_phases'],['recover','checkout'])
                self.assertIs(result['native_qualified'],False)
                chunks.append(base64.b64decode(result['data_base64'],validate=True))
        self.assertEqual(b''.join(chunks),self.payload)
        q['guard.py']['run_setup_phase'].assert_not_called()



if __name__ == '__main__': unittest.main()
