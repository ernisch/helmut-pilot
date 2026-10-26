#!/usr/bin/env python3
"""Synthetic driver tests only; fixtures are not replacement original evidence.

All component modules are mocks. Files, descriptors, ownership observations and
clocks belong to one disposable directory in this checkout. No live service,
namespace, Docker, network, database, original data or authentication is used.
"""
from contextlib import ExitStack, redirect_stdout
import copy
import errno
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

PATH = Path(__file__).with_name('hetzner-native-setup-driver.py')
with os.fdopen(os.open(PATH, os.O_RDONLY | os.O_NOATIME | os.O_NOFOLLOW), 'rb') as stream:
    SOURCE = stream.read()
SOURCE_SHA = 'e2bb2bb06ef259ba7be5814f7a7535a265988d62470a85fc7c3e26cbe158d14f'
if hashlib.sha256(SOURCE).hexdigest() != SOURCE_SHA:
    raise RuntimeError('reviewed driver source changed')
m = types.ModuleType('synthetic_setup_driver')
exec(compile(SOURCE, str(PATH), 'exec'), m.__dict__)
REAL_READ = m.read
OLD_PIN = '160b4d04df86ba0ddb9a0c0366980f1d3848a5d34249b62d8b880562e20f48be'
SCOPE = 'a' * 64
ARCHIVE_BYTES = b'EXPLICITLY_SYNTHETIC_DOCKER_SAVE_BYTES_NOT_AN_ORIGINAL'


class DriverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='.setup-driver-synthetic-', dir=PATH.parent.parent)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.base, self.context = self.root / 'control', self.root / 'context'
        self.base.mkdir(mode=0o700); self.context.mkdir(mode=0o700)
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(m, 'BASE', str(self.base)))
        self.stack.enter_context(patch.object(m, 'CONTEXT', str(self.context)))
        self.clock = self.stack.enter_context(patch.object(m.time, 'monotonic', return_value=1000.0))
        self.real_open, self.real_stat, self.real_fstat = os.open, os.stat, os.fstat
        self.public_id, self.overrides, self.unowned = None, {}, set()
        self.public_fds, self.events = [], []
        self.suppress_role, self.after_component = None, None
        self.daemon = {'pid': 4242, 'start_ticks': 321, 'namespace': [101, 102],
                       'pid1_namespace': [101, 103], 'socket': [104, 105], 'private': True}

        def opening(path, flags, *args, **kwargs):
            value = os.fsdecode(path)
            if os.path.isabs(value):
                self.assertTrue(Path(value).is_relative_to(self.root), 'no real host path may be opened')
            else:
                self.assertIn('dir_fd', kwargs, 'relative opens require a held fixture directory')
                self.assertNotIn('..', value.split('/'))
            return self.real_open(path, flags, *args, **kwargs)
        self.stack.enter_context(patch.object(m.os, 'open', side_effect=opening))

        def owner(info):
            return (info.st_dev, info.st_ino) not in self.unowned
        self.stack.enter_context(patch.object(m, 'owner', side_effect=owner))

        def directory(path):
            # Confine path traversal to the disposable fixture; never inspect /opt
            # or host ancestors. Real receipt opens still use the driver's flags.
            relative = Path(path).relative_to(self.root)
            fd = self.real_open(self.root, m.D)
            try:
                for part in relative.parts:
                    child = self.real_open(part, m.D, dir_fd=fd)
                    os.close(fd); fd = child
                    info = os.fstat(fd)
                    m.need(m.owner(info) and not stat.S_IMODE(info.st_mode) & 0o022, 'DIRECTORY_IDENTITY')
                return fd
            except BaseException:
                os.close(fd); raise
        self.stack.enter_context(patch.object(m, 'directory', side_effect=directory))

        def view(info):
            identity = (info.st_dev, info.st_ino)
            changes = dict(self.overrides.get(identity, {}))
            if identity == self.public_id:
                changes = {'st_uid': 1000, 'st_gid': 1000, **changes}
            if not changes: return info
            fields = ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink', 'st_size',
                      'st_atime_ns', 'st_mtime_ns', 'st_ctime_ns', 'st_rdev', 'st_blocks')
            return types.SimpleNamespace(**{**{k: getattr(info, k) for k in fields}, **changes})
        self.stack.enter_context(patch.object(m.os, 'fstat', side_effect=lambda fd: view(self.real_fstat(fd))))
        self.stack.enter_context(patch.object(m.os, 'stat', side_effect=lambda *a, **kw: view(self.real_stat(*a, **kw))))
        self.observe = Mock(side_effect=lambda: copy.deepcopy(self.daemon))
        self.recovery_proof = Mock(side_effect=self.prove_recovery)
        self.public_proof = Mock(side_effect=self.prove_public)
        self.helpers = {phase: Mock(side_effect=lambda *a, _phase=phase, **kw: self.component(_phase, *a, **kw))
                        for phase in m.PHASES}
        self.modules = {
            'restore': {'__source_bytes__': b'SYNTHETIC_RESTORE_STUB_SOURCE'},
            'recovery': {'__source_bytes__': b'SYNTHETIC_RECOVERY_STUB_SOURCE', 'recover': self.helpers['recover']},
            'public': {'__source_bytes__': b'SYNTHETIC_CHECKOUT_STUB_SOURCE', 'create_public_checkout': self.helpers['checkout']},
            'context': {'__source_bytes__': b'SYNTHETIC_CONTEXT_STUB_SOURCE', 'SCOPE': SCOPE,
                'prepare': self.helpers['context'], 'recovery_stage_proof': self.recovery_proof,
                'public_checkout': self.public_proof, 'observe': self.observe,
                'same_daemon': Mock(side_effect=lambda actual, expected: actual == expected)},
            'image': {'__source_bytes__': b'SYNTHETIC_IMAGE_STUB_SOURCE',
                      'import_bound_budget_image': self.helpers['image']}}

    def raw(self, path):
        fd = self.real_open(path, m.R)
        try: return os.read(fd, 1024**2 + 1)
        finally: os.close(fd)

    def write(self, path, raw):
        path = Path(path)
        self.assertTrue(path.is_relative_to(self.root))
        path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        fd = self.real_open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        try: self.assertEqual(os.write(fd, raw), len(raw))
        finally: os.close(fd)

    def json_write(self, role, value):
        if role == self.suppress_role: return
        self.write(m.paths()[role], (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode())

    def record(self, phase):
        if phase == 'recover':
            return {'synthetic': 'recovery', 'status': 'RESTORED_NOT_NATIVE_QUALIFIED',
                    'native_qualified': False, 'native_go_consumed': False}
        if phase == 'checkout':
            return {'synthetic': 'checkout', 'status': 'PUBLIC_CHECKOUT_READY_NOT_NATIVE_QUALIFIED',
                    'native_qualified': False}
        if phase == 'context':
            return {'synthetic': 'context', 'status': 'CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED',
                'case_id': m.CASE, 'scope_sha256': SCOPE, 'sourcePreparationKind': 'ACCEPTED_LOCAL_PAX_RECOVERY',
                'recoveryReadySHA256': self.digest('recovery_ready'), 'historicalRestoreReceiptSHA256': OLD_PIN,
                'publicCheckoutReadySHA256': self.digest('public_ready'), 'publicEnginePresent': True,
                'publicEngineState': 'MOUNTED_REQUIRES_FRESH_SOURCE_ADMISSION',
                'canonicalProofs': [{'path': '/opt/helmut-public-pr942', 'readonly': True, 'private': True}],
                'nativeQualified': False, 'nativeGOConsumed': False, 'daemon': copy.deepcopy(self.daemon)}
        return {'synthetic': 'image', 'status': 'IMPORTED_NOT_NATIVE_QUALIFIED', 'image': m.IMAGE,
                'nativeQualified': False, 'nativeGOConsumed': False}

    def seed_phase(self, phase):
        if phase == 'recover':
            for role in m.roles(3): self.json_write(role, {'synthetic': role})
            return
        if phase == 'checkout':
            repository = Path(m.paths()['public_repository'])
            repository.mkdir(parents=True, mode=0o700, exist_ok=True)
            info = self.real_stat(repository)
            self.public_id = (info.st_dev, info.st_ino)
        extra = {'recover': ('recovery_once', 'recovery_receipt'),
                 'checkout': ('public_once',), 'context': ('context_once',), 'image': ()}[phase]
        for role in extra: self.json_write(role, {'synthetic': role})
        role = {'recover': 'recovery_ready', 'checkout': 'public_ready',
                'context': 'context_receipt', 'image': 'image_receipt'}[phase]
        self.json_write(role, self.record(phase))

    def arrange(self, phase):
        # Each test receives a new synthetic tree. Add prerequisites once only.
        if not Path(m.paths()['historical_binding']).exists(): self.seed_phase('recover')
        for previous in m.PHASES[:m.PHASES.index(phase)]:
            role = {'recover': 'recovery_ready', 'checkout': 'public_ready', 'context': 'context_receipt'}[previous]
            if not Path(m.paths()[role]).exists():
                if previous == 'recover':
                    self.json_write('recovery_once', {'synthetic': 'recovery_once'})
                    self.json_write('recovery_receipt', {'synthetic': 'recovery_receipt'})
                    self.json_write('recovery_ready', self.record('recover'))
                else: self.seed_phase(previous)
        if phase == 'image': self.write(self.archive(), ARCHIVE_BYTES)

    def archive(self):
        return self.base / ('stage-' + m.CASE) / 'restored-pax-recovery/files/workspace' / \
            'helmut-hetzner-preparation-evidence-20261025/ORIGINAL_BUDGET_IMAGE.DOCKER_SAVE.PRIVATE.tar'

    def digest(self, role):
        return hashlib.sha256(self.raw(m.paths()[role])).hexdigest()

    def data(self, phase):
        keys = ('old_receipt_sha256', 'recovery_ready_sha256', 'public_ready_sha256', 'context_ready_sha256')
        values = [OLD_PIN]
        for role in ('recovery_ready', 'public_ready', 'context_receipt'):
            values.append(self.digest(role) if Path(m.paths()[role]).exists() else None)
        return {key: value if index <= m.PHASES.index(phase) else None
                for index, (key, value) in enumerate(zip(keys, values))}

    def prove_recovery(self, ready, old):
        self.events.append('recovery-proof')
        self.assertEqual(ready, self.digest('recovery_ready')); self.assertEqual(old, OLD_PIN)
        return {'case_id': m.CASE, 'ready_sha256': ready, 'root': str(self.archive().parent.parent.parent.parent)}

    def prove_public(self, ready):
        self.events.append('public-proof')
        self.assertEqual(ready, self.digest('public_ready'))
        fd = self.real_open(m.paths()['public_repository'], m.D)
        self.public_fds.append(fd)
        return fd, {'synthetic': 'fixed-public-directory-proof'}

    def component(self, phase, *args, **kwargs):
        self.events.append(phase)
        if phase == 'recover':
            self.assertEqual(args, (OLD_PIN, self.modules['restore']['__source_bytes__'], 1300.0))
            self.assertEqual(kwargs, {})
            self.json_write('recovery_once', {'synthetic': 'recovery_once'})
            self.json_write('recovery_receipt', {'synthetic': 'recovery_receipt'})
            self.json_write('recovery_ready', self.record(phase))
        elif phase == 'checkout':
            self.assertEqual(args, ()); self.assertEqual(kwargs, {})
            self.seed_phase(phase)
        elif phase == 'context':
            self.assertEqual(args, (self.digest('recovery_ready'),))
            self.assertEqual(kwargs, {'public': self.digest('public_ready'), 'recovery_receipt_sha': OLD_PIN})
            self.seed_phase(phase)
        else:
            self.assertEqual(kwargs, {}); self.assertEqual(len(args), 2)
            fd, observer = args
            self.assertEqual((os.fstat(fd).st_dev, os.fstat(fd).st_ino),
                             (self.real_stat(self.archive()).st_dev, self.real_stat(self.archive()).st_ino))
            self.assertEqual(os.read(fd, len(ARCHIVE_BYTES) + 1), ARCHIVE_BYTES)
            actual = observer()
            self.assertTrue(actual['private'])
            self.events.append('image-observer-private')
            self.seed_phase(phase)
        result = self.record(phase)
        if self.after_component is not None: self.after_component(phase)
        return result

    def run_phase(self, phase, data=None, deadline=1300.0):
        return m.execute_phase(phase, self.data(phase) if data is None else data, self.modules, deadline)

    def assert_only_called(self, phase):
        for name, helper in self.helpers.items(): self.assertEqual(helper.call_count, int(name == phase), name)

    def assert_success(self, phase):
        self.arrange(phase)
        count = {'recover': 3, 'checkout': 6, 'context': 9, 'image': 11}[phase]
        before = m.bindings(m.roles(count))
        result = self.run_phase(phase)
        self.assertEqual(set(result), {'status', 'phase', 'ready_sha256', 'native_qualified', 'native_go_consumed', 'bindings'})
        self.assertEqual(result['status'], 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED')
        self.assertEqual(result['phase'], phase)
        self.assertIs(result['native_qualified'], False); self.assertIs(result['native_go_consumed'], False)
        self.assertEqual(set(result['bindings']), set(m.roles({'recover': 6, 'checkout': 9, 'context': 11, 'image': 12}[phase])))
        for role, previous in before.items(): self.assertEqual(result['bindings'][role], previous)
        role = {'recover': 'recovery_ready', 'checkout': 'public_ready', 'context': 'context_receipt', 'image': 'image_receipt'}[phase]
        self.assertEqual(result['ready_sha256'], self.digest(role))
        for role, binding in result['bindings'].items():
            self.assertEqual(set(binding), {'sha256', 'metadata'})
            self.assertEqual(len(binding['metadata']), 12)
            self.assertTrue(all(type(value) is int for value in binding['metadata']))
            if role == 'public_repository': self.assertIsNone(binding['sha256'])
            else: self.assertRegex(binding['sha256'], '^[a-f0-9]{64}$')
        self.assert_only_called(phase)
        self.assertEqual(self.recovery_proof.call_count, int(phase != 'recover'))
        self.assertEqual(self.public_proof.call_count, int(phase in ('context', 'image')))
        for event in ('recovery-proof', 'public-proof'):
            if event in self.events: self.assertLess(self.events.index(event), self.events.index(phase))
        for fd in self.public_fds:
            with self.assertRaises(OSError) as error: self.real_fstat(fd)
            self.assertEqual(error.exception.errno, errno.EBADF)

    def test_recover_phase_is_separate_and_preserves_historical_evidence(self): self.assert_success('recover')
    def test_checkout_phase_is_separate_and_preserves_recovery_evidence(self): self.assert_success('checkout')
    def test_context_phase_passes_exact_explicit_provenance_arguments(self): self.assert_success('context')
    def test_image_phase_reads_only_own_archive_and_returns_closed_twelve_role_bindings(self): self.assert_success('image')

    def test_default_cli_is_inert_without_service_guard(self):
        with redirect_stdout(io.StringIO()) as output:
            with self.assertRaises(SystemExit) as error:
                exec(compile(SOURCE, '<synthetic-default-cli>', 'exec'), {'__name__': '__main__'})
        self.assertEqual(error.exception.code, 2)
        self.assertEqual(json.loads(output.getvalue()), {'status': 'NOT_EXECUTED_SERVICE_GUARD_REQUIRED'})
        self.assertTrue(all(helper.call_count == 0 for helper in self.helpers.values()))

    def test_data_rejects_unknown_phase_extra_missing_or_nonsha_values_before_any_helper(self):
        valid = {'old_receipt_sha256': OLD_PIN, 'recovery_ready_sha256': None,
                 'public_ready_sha256': None, 'context_ready_sha256': None}
        cases = [('unknown', valid), ('recover', []), ('recover', {**valid, 'extra': None}),
                 ('recover', {k: v for k, v in valid.items() if k != 'old_receipt_sha256'})]
        for value in (True, 123, 'A' * 64, '0' * 63, None): cases.append(('recover', {**valid, 'old_receipt_sha256': value}))
        cases.append(('recover', {**valid, 'recovery_ready_sha256': '0' * 64}))
        for phase, data in cases:
            with self.subTest(phase=phase, data=data), self.assertRaisesRegex(m.SetupError, '^PHASE_DATA$'):
                self.run_phase(phase, data=data)
        keys = ('old_receipt_sha256', 'recovery_ready_sha256', 'public_ready_sha256', 'context_ready_sha256')
        for phase in m.PHASES:
            for index, key in enumerate(keys):
                if index > m.PHASES.index(phase): continue
                required = {k: OLD_PIN if i == 0 else ('1' * 64 if i <= m.PHASES.index(phase) else None)
                            for i, k in enumerate(keys)}
                required[key] = True
                with self.subTest(phase=phase, key=key), self.assertRaisesRegex(m.SetupError, '^PHASE_DATA$'):
                    m.validate_data(phase, required)
        with self.assertRaises(TypeError): m.execute_phase('recover', valid, self.modules)
        with self.assertRaisesRegex(m.SetupError, '^DUPLICATE_JSON$'): m.parsed(b'{"phase":1,"phase":2}')
        self.assertTrue(all(helper.call_count == 0 for helper in self.helpers.values()))

    def test_old_receipt_pin_is_public_actual_hash_and_wrong_pin_is_rejected(self):
        self.assertEqual(m.OLD_RECEIPT, OLD_PIN)
        self.arrange('recover'); data = self.data('recover'); data['old_receipt_sha256'] = '0' * 64
        with self.assertRaisesRegex(m.SetupError, '^OBSERVED_OLD_RECEIPT_HASH$'): self.run_phase('recover', data)
        self.assertTrue(all(helper.call_count == 0 for helper in self.helpers.values()))

    def test_phase_deadline_admission_rejects_before_component_invocation(self):
        for phase, minimum, code in (('checkout', 190, 'CHECKOUT'), ('context', 90, 'CONTEXT'), ('image', 70, 'IMAGE')):
            self.arrange(phase)
            with self.subTest(phase=phase), self.assertRaisesRegex(m.SetupError, '^' + code + '_DEADLINE_ADMISSION$'):
                self.run_phase(phase, deadline=1000 + minimum - 1)
        self.assertTrue(all(helper.call_count == 0 for helper in self.helpers.values()))
        for deadline in (1000, 1301):
            with self.subTest(deadline=deadline), self.assertRaisesRegex(m.SetupError, '^DEADLINE$'):
                self.run_phase('recover', deadline=deadline)

    def test_exact_190_90_70_second_deadline_boundaries_are_admitted(self):
        for phase, minimum in (('checkout', 190), ('context', 90), ('image', 70)):
            self.arrange(phase)
            with self.subTest(phase=phase):
                self.assertEqual(self.run_phase(phase, deadline=1000 + minimum)['phase'], phase)
            self.assert_only_called(phase)
            self.helpers[phase].reset_mock()

    def test_failed_component_result_is_not_success_and_does_not_start_another_phase(self):
        for phase, code in (('recover', 'RECOVERY_FAILED'), ('checkout', 'PUBLIC_CHECKOUT_FAILED'),
                            ('context', 'CONTEXT_FAILED'), ('image', 'IMAGE_FAILED')):
            self.arrange(phase)
            self.helpers[phase].side_effect = None
            native_key = 'native_qualified' if phase in ('recover', 'checkout') else 'nativeQualified'
            for result in ({'status': 'FAIL_KEEP_STATE_NO_RETRY'}, {**self.record(phase), native_key: True}):
                self.helpers[phase].return_value = result
                with self.subTest(phase=phase, result=result), self.assertRaisesRegex(m.SetupError, '^' + code + '$'):
                    self.run_phase(phase)
                self.assert_only_called(phase)
                self.helpers[phase].reset_mock()

    def test_component_exception_preserves_the_first_exception_without_fallback(self):
        for phase in m.PHASES:
            self.arrange(phase); first = OSError(5, 'SYNTHETIC_COMPONENT_FAILURE')
            self.helpers[phase].side_effect = first
            with self.subTest(phase=phase), self.assertRaises(OSError) as error: self.run_phase(phase)
            self.assertIs(error.exception, first)
            self.helpers[phase].assert_called_once(); self.helpers[phase].reset_mock()

    def test_setup_error_exposes_its_safe_machine_code_to_the_service_guard(self):
        error = m.SetupError('SYNTHETIC_SETUP_FAILURE')
        self.assertEqual(getattr(error, 'code', None), 'SYNTHETIC_SETUP_FAILURE')

    def test_success_without_saved_ready_is_never_adopted(self):
        self.arrange('recover'); self.suppress_role = 'recovery_ready'
        with self.assertRaises(FileNotFoundError): self.run_phase('recover')
        self.assert_only_called('recover')

    def test_returned_and_saved_component_results_must_be_identical(self):
        self.arrange('recover')
        self.helpers['recover'].side_effect = lambda *a, **kw: {**self.component('recover', *a, **kw), 'unexpected': True}
        with self.assertRaisesRegex(m.SetupError, '^COMPONENT_SAVED_RESULT$'): self.run_phase('recover')
        self.assert_only_called('recover')

    def test_one_nanosecond_previous_metadata_drift_rejects_phase_completion(self):
        self.arrange('recover'); info = self.real_stat(m.paths()['historical_binding'])
        self.after_component = lambda phase: self.overrides.update({(info.st_dev, info.st_ino): {'st_mtime_ns': info.st_mtime_ns + 1}})
        before = self.raw(m.paths()['historical_binding'])
        with self.assertRaisesRegex(m.SetupError, '^PREVIOUS_BINDINGS_CHANGED$'): self.run_phase('recover')
        self.assertEqual(self.raw(m.paths()['historical_binding']), before)

    def test_previous_case_binding_digest_drift_is_rejected_without_mutating_fixture_bytes(self):
        self.arrange('recover'); original = self.raw(m.paths()['historical_binding'])
        changed = False
        def reading(path):
            raw, binding = REAL_READ(path)
            if changed and path == m.paths()['historical_binding']:
                raw = raw + b' '; binding = {**binding, 'sha256': hashlib.sha256(raw).hexdigest()}
            return raw, binding
        def after(phase):
            nonlocal changed
            changed = True
        self.after_component = after
        with patch.object(m, 'read', side_effect=reading):
            with self.assertRaisesRegex(m.SetupError, '^PREVIOUS_BINDINGS_CHANGED$'): self.run_phase('recover')
        self.assertEqual(self.raw(m.paths()['historical_binding']), original)

    def test_receipt_symlink_hardlink_mode_and_owner_are_rejected_before_helper(self):
        self.arrange('recover'); path = Path(m.paths()['historical_receipt'])
        moved = path.with_name('synthetic-original-fixture')
        path.rename(moved); path.symlink_to(moved)
        try:
            with self.assertRaises(OSError): self.run_phase('recover')
        finally: path.unlink(); moved.rename(path)
        os.link(path, moved)
        try:
            with self.assertRaisesRegex(m.SetupError, '^RECEIPT_IDENTITY$'): self.run_phase('recover')
        finally: moved.unlink()
        path.chmod(0o644)
        try:
            with self.assertRaisesRegex(m.SetupError, '^RECEIPT_IDENTITY$'): self.run_phase('recover')
        finally: path.chmod(0o600)
        info = self.real_stat(path); self.unowned.add((info.st_dev, info.st_ino))
        with self.assertRaisesRegex(m.SetupError, '^RECEIPT_IDENTITY$'): self.run_phase('recover')
        self.assertTrue(all(helper.call_count == 0 for helper in self.helpers.values()))

    def test_public_repository_requires_uid_and_gid1000_private_mode(self):
        self.arrange('context')
        for changes in ({'st_uid': 0}, {'st_gid': 0}, {'st_mode': stat.S_IFDIR | 0o755}):
            self.overrides[self.public_id] = changes
            with self.subTest(changes=changes), self.assertRaisesRegex(m.SetupError, '^PUBLIC_DIRECTORY_IDENTITY$'):
                self.run_phase('context')
        self.assertTrue(all(helper.call_count == 0 for helper in self.helpers.values()))

    def test_source_proof_errors_stop_before_context_or_image_component(self):
        for phase in ('context', 'image'):
            self.arrange(phase)
            for proof in (self.recovery_proof, self.public_proof):
                original = proof.side_effect
                proof.side_effect = m.SetupError('SYNTHETIC_SOURCE_PROOF_FAILURE')
                try:
                    with self.subTest(phase=phase, proof=proof), self.assertRaisesRegex(m.SetupError, '^SYNTHETIC_SOURCE_PROOF_FAILURE$'):
                        self.run_phase(phase)
                finally: proof.side_effect = original
        self.assertTrue(all(helper.call_count == 0 for helper in self.helpers.values()))

    def test_image_private_false_after_context_check_stops_before_ready(self):
        self.arrange('image'); changed = {**self.daemon, 'private': False}
        self.observe.side_effect = [copy.deepcopy(self.daemon), changed]
        with self.assertRaisesRegex(m.SetupError, '^CONTEXT_NOT_PRIVATE$'): self.run_phase('image')
        self.assertFalse(Path(m.paths()['image_receipt']).exists())
        self.assert_only_called('image')

    def test_image_daemon_changed_at_context_admission_is_rejected_before_import(self):
        self.arrange('image'); self.daemon['pid'] += 1
        with self.assertRaisesRegex(m.SetupError, '^DAEMON_CHANGED$'): self.run_phase('image')
        self.assertTrue(all(helper.call_count == 0 for helper in self.helpers.values()))

    def test_image_daemon_change_after_context_admission_must_stop_before_saved_ready(self):
        self.arrange('image'); changed = {**self.daemon, 'pid': self.daemon['pid'] + 1}
        self.observe.side_effect = [copy.deepcopy(self.daemon), changed]
        with self.assertRaisesRegex(m.SetupError, '^DAEMON_CHANGED$'): self.run_phase('image')
        self.assertFalse(Path(m.paths()['image_receipt']).exists())

    def test_image_archive_nanosecond_drift_rejects_completion(self):
        self.arrange('image'); info = self.real_stat(self.archive())
        self.after_component = lambda phase: self.overrides.update({(info.st_dev, info.st_ino): {'st_ctime_ns': info.st_ctime_ns + 1}})
        with self.assertRaisesRegex(m.SetupError, '^ARCHIVE_CHANGED$'): self.run_phase('image')
        self.assert_only_called('image')

    def test_context_receipt_hash_unqualified_fields_and_error_pending_gates_are_required(self):
        self.arrange('image'); data = self.data('image'); data['context_ready_sha256'] = '0' * 64
        with self.assertRaisesRegex(m.SetupError, '^CONTEXT_READY_HASH$'): self.run_phase('image', data)
        baseline = self.record('context')
        for change in ({'nativeQualified': True}, {'nativeGOConsumed': True}, {'case_id': '0' * 64},
                {'scope_sha256': '0' * 64}, {'publicEnginePresent': False},
                {'publicEngineState': 'QUALIFIED'}, {'sourcePreparationKind': 'other'},
                {'historicalRestoreReceiptSHA256': '0' * 64}):
            self.json_write('context_receipt', {**baseline, **change})
            with self.subTest(change=change), self.assertRaisesRegex(m.SetupError, '^CONTEXT_READY$'): self.run_phase('image')
        self.json_write('context_receipt', baseline)
        for path in (self.context / 'NATIVE_CONTEXT_FIRST_ERROR.PRIVATE.json',
                     Path(m.paths()['context_receipt']).with_name('CONTEXT_RECEIPT.PENDING.SAFE.json')):
            self.write(path, b'{"synthetic":"error-or-pending"}\n')
            try:
                with self.assertRaisesRegex(m.SetupError, '^CONTEXT_UNKNOWN$'): self.run_phase('image')
            finally: path.unlink()
        self.assertTrue(all(helper.call_count == 0 for helper in self.helpers.values()))

    def test_existing_native_once_prevents_every_setup_phase(self):
        marker = self.base / 'once' / (m.PLAN + '.json')
        self.write(marker, b'{"synthetic":"spent-native-marker"}\n')
        for phase in m.PHASES:
            self.arrange(phase)
            with self.subTest(phase=phase), self.assertRaisesRegex(m.SetupError, '^NATIVE_GO_ALREADY_CONSUMED$'):
                self.run_phase(phase)
        self.assertTrue(all(helper.call_count == 0 for helper in self.helpers.values()))
        self.recovery_proof.assert_not_called(); self.public_proof.assert_not_called()

    def test_deadline_expiry_after_component_never_returns_success(self):
        self.arrange('recover'); self.after_component = lambda phase: self.clock.configure_mock(return_value=1301.0)
        with self.assertRaisesRegex(m.SetupError, '^DEADLINE$'): self.run_phase('recover')
        self.assert_only_called('recover')


if __name__ == '__main__':
    unittest.main(verbosity=2)
