"""Own synthetic fixtures only: no real proc, daemon, unit or network observation."""
from contextlib import ExitStack
import copy
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'hetzner-native-daemon-binding.py'
with os.fdopen(os.open(SOURCE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME), 'rb') as stream:
    RAW = stream.read()
M = types.ModuleType('synthetic_daemon_binding')
exec(compile(RAW, str(SOURCE), 'exec'), M.__dict__)
SNAPSHOT = M.process_snapshot
EXECUTABLE_RECORD = M.executable_record
UNIT_RECORD = M.unit_file_record
CGROUP = M.cgroup_membership


def metadata(info):
    return [getattr(info, key) for key in ('st_dev','st_ino','st_mode','st_uid','st_gid','st_nlink',
                                         'st_size','st_atime_ns','st_mtime_ns','st_ctime_ns','st_rdev','st_blocks')]


def binding(raw=b'SYNTHETIC', mode=0o100600):
    return {'sha256': M.sha(raw), 'bytes': len(raw),
            'metadata': [1, 2, mode, 0, 0, 1, len(raw), 3, 4, 5, 0, 1]}


def baseline():
    records = {'component_error': {'state': 'PRESENT', 'sha256': M.COMPONENT_ERROR_SHA256,
        'code': 'DAEMON_SERVICE_BINDING', 'phase': 'preflight', 'anchor_attempt_count': 0, 'anchor_created_count': 0},
        'job_error': {'state': 'PRESENT', 'sha256': M.JOB_ERROR_SHA256, 'code': 'DAEMON_SERVICE_BINDING'},
        **{key: {'state': 'ABSENT'} for key in ('component_attempt', 'component_receipt_pending', 'component_receipt')}}
    return {'baseline_sha256': 'b'*64, 'partial_setup_proof': {'accepted_phases': ['recover', 'checkout'],
        'failed_phase': 'context', 'native_qualified': False, 'native_go_consumed': False},
        'failure_diagnostic': {'records': records, 'native_qualified': False, 'native_go_consumed': False}}


def snapshot():
    return {'process': {'pid': 321, 'start_ticks': 1234, 'namespace': [1, 2], 'pid1_namespace': [1, 3]},
        'boot_id': '00000000-1111-2222-3333-444444444444', 'private_namespace': True,
        'private_propagation': True, 'comm_matches': True, 'exe_matches': True, 'cgroup_matches': False,
        'cgroup_kind': 'UNIT_ROOT', 'cgroup_membership_verified': True,
        'comm': binding(b'dockerd\n'), 'exe_link': binding(b'SYNTHETIC_PRIVATE_PATH', 0o120777),
        'cgroup': binding(b'SYNTHETIC_PRIVATE_CGROUP')}


class ObserverTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack(); self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(M.time, 'monotonic', return_value=1000.0))
        for key in ('getuid', 'geteuid', 'getgid', 'getegid'):
            self.stack.enter_context(patch.object(M.os, key, return_value=0))
        self.stack.enter_context(patch.object(M, 'READER_SHA256', M.sha(b'SYNTHETIC_READER')))
        self.context = {'base': M.BASE, 'source_sha256': 'a'*64, 'deployment_commit': 'b'*40, 'deadline': 1250.0}
        self.proof = baseline()
        self.reader = {'__source_bytes__': b'SYNTHETIC_READER', 'CONTRACT_SHA256': M.CONFIG['metadata_contract_sha256'],
            'validate_config': Mock(return_value={}), 'verify_setup_baseline': Mock(side_effect=lambda *a: copy.deepcopy(self.proof)),
            'metadata': metadata}
        self.query = ('Id=' + M.SERVICE + '\nActiveState=active\nSubState=running\nMainPID=321\nControlGroup=' + M.UNIT_CGROUP + '\n').encode()
        self.guard = {'command': Mock(return_value=self.query), 'exited': Mock(return_value=False)}
        self.ctx = {'socket_facts': Mock(return_value=(321, (1, 2, 3))),
            'directory': Mock(return_value=41), 'namespace_identity': Mock(return_value=[1, 2]),
            'filesystem': Mock(return_value=[0x9fa0, 1])}
        self.qualified = {'guard.py': self.guard, 'context.py': self.ctx}
        self.process = self.stack.enter_context(patch.object(M, 'process_snapshot', side_effect=lambda *a: snapshot()))
        self.binary = self.stack.enter_context(patch.object(M, 'executable_record', return_value=binding(b'SYNTHETIC_ELF', 0o100755)))
        self.unit = self.stack.enter_context(patch.object(M, 'unit_file_record', return_value={'state': 'UNKNOWN_MISSING', 'sha256': None, 'bytes': None, 'metadata': None}))
        self.stack.enter_context(patch.object(M.os, 'open', return_value=43))
        self.stack.enter_context(patch.object(M.os, 'pidfd_open', return_value=42))
        self.close = self.stack.enter_context(patch.object(M.os, 'close'))

    def observe(self): return M.observe_daemon_binding(self.context, self.reader, self.qualified)

    def rejected(self, code):
        result = self.observe()
        self.assertEqual(result['status'], 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED')
        self.assertEqual(result['code'], code)
        for key in ('partial_setup_proof', 'failure_diagnostic', 'observation'): self.assertIsNone(result[key])
        self.assertIs(result['native_qualified'], False); self.assertIs(result['native_go_consumed'], False)
        return result

    def test_frozen_contract_and_positive_source_pins(self):
        self.assertEqual(M.CONTRACT_SHA256, 'fe6a763fee403a0e34a943db533b0aca71b38afdfc9408143e0d9aef064844bd')
        self.assertEqual(M.sha(M.encoded(M.CONFIG)), M.CONTRACT_SHA256)
        self.assertEqual(M.CONFIG['metadata_reader_sha256'], 'edcc93c55404685d3637abb096589f90c02ec1fce2a0e75b54dc53003b269046')
        self.reader['__source_bytes__'] += b'CHANGED'
        self.rejected('DAEMON_BINDING_SOURCE_PIN'); self.guard['command'].assert_not_called()

    def test_bound_diagnostic_without_raw_paths_pid_argv_or_effects(self):
        result = self.observe(); self.assertEqual(result['status'], 'DAEMON_BINDING_OBSERVED_NOT_READY')
        self.assertIsNone(result['code']); self.assertFalse(result['observation']['cgroup_matches'])
        for flag in ('unit_active_running','socket_peer_bound','process_root_owned','process_alive','cgroup2_verified'):
            self.assertIs(result['observation'][flag], True)
        text = M.encoded(result)
        for private in (b'SYNTHETIC_PRIVATE', M.EXECUTABLE.encode(), M.UNIT_CGROUP.encode(), b'"pid"', b'argv', b'ExecStart'):
            self.assertNotIn(private, text)
        self.assertEqual(result['observation']['exec_hooks_state'], 'UNKNOWN_NOT_QUERIED')
        self.assertEqual(self.reader['validate_config'].call_count, 2)
        self.assertEqual(self.reader['verify_setup_baseline'].call_count, 2)
        self.assertEqual(self.guard['command'].call_count, 2)
        for call in self.guard['command'].call_args_list:
            self.assertEqual(call.args, (M.QUERY, 1250.0)); self.assertEqual(call.kwargs, {'timeout': 5})
        self.assertEqual({call.args[0] for call in self.close.call_args_list}, {41, 42, 43})

    def test_all_three_individual_mismatches_and_private_false_are_observations(self):
        for comm, exe, cg, kind in ((False, True, True, 'DAEMON_CHILD'), (True, False, True, 'DAEMON_CHILD'),
                                    (True, True, False, 'UNIT_ROOT'), (False, False, False, 'OTHER')):
            changed = snapshot(); changed.update(comm_matches=comm, exe_matches=exe, cgroup_matches=cg,
                cgroup_kind=kind, cgroup_membership_verified=kind != 'OTHER', private_namespace=False, private_propagation=False)
            self.process.side_effect = lambda *a: copy.deepcopy(changed)
            with self.subTest(kind=kind, comm=comm, exe=exe):
                result = self.observe(); self.assertIsNone(result['code'])
                self.assertEqual(result['observation']['private_namespace'], False)
                self.assertEqual(result['observation']['comm_matches'], comm)
                self.assertIs(result['native_qualified'], False)

    def test_context_deadline_and_root_fail_before_observation(self):
        for change in ({'base': '/other'}, {'extra': 'selector'}, {'deadline': 1301}, {'deadline': True},
                       {'deadline': float('nan')}, {'source_sha256': 'A'*64}, {'deployment_commit': 'private'}):
            old = self.context; self.context = {**old, **change}
            with self.subTest(change=change):
                self.rejected('DAEMON_BINDING_DEADLINE' if 'deadline' in change else 'DAEMON_BINDING_CONTEXT')
            self.context = old
        self.guard['command'].assert_not_called()
        with patch.object(M.os, 'getuid', return_value=1000): self.rejected('DAEMON_BINDING_ROOT_REQUIRED')

    def test_fixed_service_query_rejects_unknown_duplicate_missing_inactive_and_large(self):
        for raw in (self.query.replace(b'MainPID=321', b'MainPID=1'), self.query + b'Id=foreign\n',
                    self.query.replace(b'ActiveState=active', b'ActiveState=failed'), self.query.replace(b'SubState=running\n', b''),
                    self.query + b'ExecStart=PRIVATE\n', b'X'*4097, b'\xff'):
            self.guard['command'].return_value = raw
            with self.subTest(raw=raw[:30]):
                self.assertEqual(self.observe()['status'], 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED')
        self.ctx['socket_facts'].assert_not_called()

    def test_peer_pid_pidfd_and_proc_filesystem_are_mandatory(self):
        self.ctx['socket_facts'].return_value = (999, (1, 2, 3)); self.rejected('DAEMON_BINDING_SOCKET_PID')
        self.ctx['socket_facts'].return_value = (321, (1, 2, 3))
        self.ctx['filesystem'].return_value = [0x1234, 1]; self.rejected('DAEMON_BINDING_PROCFS')
        self.ctx['filesystem'].return_value = [0x9fa0, 1]
        self.guard['exited'].return_value = True; self.rejected('DAEMON_BINDING_PROCESS_EXITED')

    def test_retained_failure_exact_hashes_phase_anchors_absences_required(self):
        records = self.proof['failure_diagnostic']['records']
        for role, key, value in (('component_error','sha256','0'*64), ('job_error','code','OTHER'),
            ('component_error','phase','attempt'), ('component_error','anchor_attempt_count',1),
            ('component_error','anchor_created_count',1), ('component_attempt','state','UNKNOWN'),
            ('component_receipt_pending','state','PRESENT'), ('component_receipt','state','PRESENT')):
            old = records[role][key]; records[role][key] = value
            with self.subTest(role=role, key=key): self.rejected('DAEMON_BINDING_RETAINED_FAILURE')
            records[role][key] = old
        self.guard['command'].assert_not_called()

    def test_process_unit_socket_binary_unit_file_and_baseline_drift_fail_closed(self):
        before, after = snapshot(), snapshot(); after['exe_matches'] = False
        for changed_mock, values in ((self.process, [before, after]),
            (self.guard['command'], [self.query, self.query.replace(b'MainPID=321', b'MainPID=322')]),
            (self.ctx['socket_facts'], [(321,(1,2,3)), (321,(9,2,3))]),
            (self.binary, [binding(b'ELF_A'), binding(b'ELF_B')]),
            (self.unit, [{'state':'UNKNOWN_MISSING'}, {'state':'PRESENT'}])):
            changed_mock.side_effect = values
            with self.subTest(changed_mock=changed_mock): self.rejected('DAEMON_BINDING_DRIFT')
            changed_mock.side_effect = None
            if changed_mock is self.process: self.process.side_effect = lambda *a: snapshot()
        self.reader['verify_setup_baseline'].side_effect = [baseline(), {**baseline(), 'baseline_sha256': 'c'*64}]
        self.rejected('DAEMON_BINDING_DRIFT')

    def test_error_private_text_is_never_returned(self):
        self.guard['command'].side_effect = ValueError('PRIVATE_PATH_OR_ARGV')
        self.assertNotIn(b'PRIVATE', M.encoded(self.rejected('DAEMON_BINDING_IO_OR_FORMAT')))


class FixedReadsTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack(); self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(M.time, 'monotonic', return_value=1000.0))
        self.temp = self.stack.enter_context(tempfile.TemporaryDirectory(prefix='synthetic-daemon-', dir=HERE))
        self.root = Path(self.temp); self.reader = {'metadata': metadata}
        self.fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, self.fd)
        self.real_fstat, self.real_stat = os.fstat, os.stat
        def owned(info):
            return types.SimpleNamespace(**{key: (0 if key in ('st_uid','st_gid') else getattr(info,key))
                for key in dir(info) if key.startswith('st_')})
        self.stack.enter_context(patch.object(M.os, 'fstat', side_effect=lambda fd: owned(self.real_fstat(fd))))
        self.stack.enter_context(patch.object(M.os, 'stat', side_effect=lambda *a, **k: owned(self.real_stat(*a, **k))))

    def test_bounded_proc_record_does_not_require_kernel_st_size_to_match_bytes(self):
        (self.root/'comm').write_bytes(b'dockerd\n')
        raw, row = M.proc_read(self.fd, 'comm', 64, 1250, self.reader)
        self.assertEqual(raw, b'dockerd\n'); self.assertEqual(row['sha256'], M.sha(raw))
        with self.assertRaisesRegex(M.Stop, 'PROC_LIMIT'): M.proc_read(self.fd, 'comm', 3, 1250, self.reader)

    def test_fixed_kernel_exe_is_hashed_noatime_and_unsafe_binary_is_rejected(self):
        target = self.root/'SYNTHETIC_EXECUTABLE'; target.write_bytes(b'SYNTHETIC_ELF'); target.chmod(0o755)
        (self.root/'exe').symlink_to(target)
        before = target.stat().st_atime_ns
        row = EXECUTABLE_RECORD(self.fd, 1250, self.reader)
        self.assertEqual(row['sha256'], M.sha(b'SYNTHETIC_ELF')); self.assertEqual(target.stat().st_atime_ns, before)
        target.chmod(0o777)
        with self.assertRaisesRegex(M.Stop, 'EXECUTABLE_IDENTITY'): EXECUTABLE_RECORD(self.fd, 1250, self.reader)

    def test_fixed_unit_missing_regular_file_and_symlink_never_become_empty_configuration(self):
        unit = self.root/'unit'; self.reader['trusted_parent'] = lambda path: (os.dup(self.fd), 'unit', [])
        row = UNIT_RECORD(1250, self.reader); self.assertEqual(row['state'], 'UNKNOWN_MISSING')
        unit.write_bytes(b'SYNTHETIC_PRIVATE_UNIT'); unit.chmod(0o644)
        row = UNIT_RECORD(1250, self.reader); self.assertEqual(row['state'], 'PRESENT')
        self.assertNotIn(b'SYNTHETIC_PRIVATE', M.encoded(row))
        unit.unlink(); unit.symlink_to('/missing-synthetic-target')
        with self.assertRaises(OSError): UNIT_RECORD(1250, self.reader)

    def test_fixed_cgroup_paths_and_positive_membership_no_traversal_from_other(self):
        (self.root/'cgroup.procs').write_bytes(b'321\n')
        ctx = {'directory': Mock(side_effect=lambda path: os.dup(self.fd)), 'filesystem': Mock(return_value=[0x63677270, 1])}
        for suffix, kind in (('', 'UNIT_ROOT'), ('/daemon', 'DAEMON_CHILD')):
            raw = ('0::'+M.UNIT_CGROUP+suffix+'\n').encode()
            self.assertEqual(CGROUP(raw, 321, 1250, self.reader, ctx), (kind, True))
        ctx['directory'].reset_mock()
        self.assertEqual(CGROUP(b'0::/SYNTHETIC_OTHER\n', 321, 1250, self.reader, ctx), ('OTHER', False))
        ctx['directory'].assert_called_once_with('/sys/fs/cgroup')
        (self.root/'cgroup.procs').write_bytes(b'999\n')
        with self.assertRaisesRegex(M.Stop, 'CGROUP_MEMBERSHIP'):
            CGROUP(('0::'+M.UNIT_CGROUP+'\n').encode(), 321, 1250, self.reader, ctx)


class ProcessSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack(); self.addCleanup(self.stack.close)
        self.proc = {'status': b'Name:\tdockerd\nUid:\t0 0 0 0\nGid:\t0 0 0 0\n',
            'stat': b'321 (dockerd) S ' + b'0 '*18 + b'1234 0\n', 'comm': b'dockerd\n',
            'cgroup': ('0::'+M.UNIT_CGROUP+'/daemon\n').encode(),
            'mountinfo': b'SYNTHETIC_MOUNTINFO'}
        self.ctx = {'directory': Mock(return_value=52), 'private_propagation': Mock(return_value=True)}
        self.qualified = {'context.py': self.ctx, 'guard.py': {'boot_id': Mock(return_value='SYNTHETIC_BOOT')}}
        def read(root, name, limit, deadline, reader):
            self.assertEqual(root, 51); self.assertLessEqual(len(self.proc[name]), limit)
            return self.proc[name], binding(self.proc[name])
        self.stack.enter_context(patch.object(M, 'proc_read', side_effect=read))
        self.stack.enter_context(patch.object(M, 'namespace_record', side_effect=lambda root, ctx: [1, 2 if root == 51 else 3]))
        self.stack.enter_context(patch.object(M, 'cgroup_membership', return_value=('DAEMON_CHILD', True)))
        self.link = self.stack.enter_context(patch.object(M.os, 'readlink', return_value=M.EXECUTABLE))
        info = types.SimpleNamespace(**dict(zip(('st_dev','st_ino','st_mode','st_uid','st_gid','st_nlink',
            'st_size','st_atime_ns','st_mtime_ns','st_ctime_ns','st_rdev','st_blocks'), [1,2,0o120777,0,0,1,100,3,4,5,0,0])))
        self.stack.enter_context(patch.object(M.os, 'stat', return_value=info))
        self.stack.enter_context(patch.object(M.os, 'fstat', return_value=info))
        self.stack.enter_context(patch.object(M.os, 'close'))

    def observed(self): return SNAPSHOT(51, 321, 1250, {'metadata': metadata}, self.qualified)

    def test_real_predicate_projection_reports_each_raw_difference_without_emitting_it(self):
        result = self.observed()
        for key in ('comm_matches','exe_matches','cgroup_matches'): self.assertIs(result[key], True)
        for name, value, flag in (('comm', b'SYNTHETIC_WRONG_COMM\n', 'comm_matches'),
                                  ('cgroup', b'0::/SYNTHETIC_OTHER\n', 'cgroup_matches')):
            old = self.proc[name]; self.proc[name] = value
            row = self.observed(); self.assertIs(row[flag], False)
            self.assertNotIn(value, M.encoded(row)); self.proc[name] = old
        self.link.return_value = '/SYNTHETIC_PRIVATE_EXECUTABLE'
        row = self.observed(); self.assertIs(row['exe_matches'], False)
        self.assertNotIn(b'/SYNTHETIC_PRIVATE_EXECUTABLE', M.encoded(row))
        self.ctx['private_propagation'].return_value = False
        self.assertIs(self.observed()['private_propagation'], False)

    def test_positive_birth_and_root_ids_cannot_be_replaced_with_unknown(self):
        for raw in (b'321 (dockerd) Z '+b'0 '*18+b'1234 0\n', b'322 (dockerd) S '+b'0 '*18+b'1234 0\n'):
            self.proc['stat'] = raw
            with self.assertRaisesRegex(M.Stop, 'PROCESS_BIRTH'): self.observed()
        self.proc['stat'] = b'321 (dockerd) S '+b'0 '*18+b'1234 0\n'
        self.proc['status'] = b'Uid:\t1000 0 0 0\nGid:\t0 0 0 0\n'
        with self.assertRaisesRegex(M.Stop, 'PROCESS_OWNER'): self.observed()


if __name__ == '__main__': unittest.main(verbosity=2)
