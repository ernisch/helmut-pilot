"""Explicitly synthetic own-temp history. No real target, originals or services."""
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import time
import types
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('hetzner-native-setup-successor-preflight.py')
with os.fdopen(os.open(SOURCE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME), 'rb') as stream:
    RAW = stream.read()
M = types.ModuleType('synthetic_successor_preflight')
exec(compile(RAW, str(SOURCE), 'exec'), M.__dict__)


class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='.successor-history-', dir=SOURCE.parent.parent)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.base, self.context = self.local(M.BASE), self.local(M.CONTEXT)
        self.base.mkdir(mode=0o700, parents=True)
        self.jobs = self.base / 'setup-jobs'
        self.jobs.mkdir(mode=0o700)
        self.jobdir = self.jobs / M.NONCE
        self.jobdir.mkdir(mode=0o700)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        # Map the walker root to our own synthetic /opt tree, never to the real /opt.
        real_open = os.open
        def own_open(path, flags, *args, **kwargs):
            return real_open(self.root if path == '/' else path, flags, *args, **kwargs)
        self.stack.enter_context(patch.object(M.os, 'open', side_effect=own_open))
        for name in ('getuid', 'geteuid', 'getgid', 'getegid'):
            self.stack.enter_context(patch.object(M.os, name, return_value=0))
        self.overrides = {}
        real_stat, real_fstat = os.stat, os.fstat
        def view(info):
            fields = {name: getattr(info, name) for name in dir(info) if name.startswith('st_')}
            fields.update(st_uid=0, st_gid=0)
            fields.update(self.overrides.get((info.st_dev, info.st_ino), {}))
            return types.SimpleNamespace(**fields)
        self.stack.enter_context(patch.object(M.os, 'stat', side_effect=lambda *a, **k: view(real_stat(*a, **k))))
        self.stack.enter_context(patch.object(M.os, 'fstat', side_effect=lambda fd: view(real_fstat(fd))))
        # The historical real pins stay in the production module; fixture pins are explicitly synthetic.
        assets = {name: ('raise AssertionError("never execute historical sources")\n# synthetic ' + name).encode()
                  for name in M.ASSET_PINS}
        self.pins = {name: {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)} for name, raw in assets.items()}
        self.stack.enter_context(patch.object(M, 'ASSET_PINS', self.pins))
        self.job = {'schema': 'helmut-setup-service-job-v1',
            'request': {'schema': 'helmut-native-control-request-v1', 'operation': 'admit', 'nonce': M.NONCE,
                        'plan_sha256': M.PLAN, 'payload_sha256': M.CONTROLLER},
            'controller_source_sha256': M.CONTROLLER, 'plan_sha256': M.PLAN, 'case_id': M.CASE, 'phase': 'recover',
            'boot_id': '11111111-2222-3333-4444-555555555555', 'deadline': 300.25, 'runtime_seconds': 250,
            'controller': {'pid': 4242, 'start_ticks': 12345, 'namespace': [5, 6]},
            'phase_data': {'old_receipt_sha256': M.OLD_RECEIPT, 'recovery_ready_sha256': None,
                           'public_ready_sha256': None, 'context_ready_sha256': None}, 'assets': copy.deepcopy(self.pins)}
        self.global_error = {'schema': 'helmut-target-setup-result-v1', 'status': 'FAIL_KEEP_STATE_NO_RETRY',
            'phase': 'recover', 'code': 'UNIT_PROPERTIES', 'ready_sha256': None, 'accepted_sha256': None,
            'lifecycle_sha256': None, 'native_qualified': False, 'native_go_consumed': False}
        self.worker_error = {'schema': 'helmut-setup-service-error-v1', 'status': 'FAIL_KEEP_STATE_NO_RETRY',
            'phase': 'recover', 'code': 'UNIT_PROPERTIES', 'exception_type': 'Stop', 'errno': None,
            'native_qualified': False, 'native_go_consumed': False}
        for name, raw in assets.items(): self.write(self.jobdir / name, raw, 0o500)
        self.write(self.base / 'TARGET_SETUP_FIRST_ERROR.SAFE.json', self.encode(self.global_error))
        self.write(self.jobdir / 'FIRST_ERROR.PRIVATE.json', self.encode(self.worker_error))
        self.write(self.jobdir / 'JOB.PRIVATE.json', self.encode(self.job))
        self.deadline = time.monotonic() + 100

    def encode(self, value): return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()

    def write(self, path, raw, mode=0o600):
        if path.exists(): path.chmod(0o600)
        path.write_bytes(raw)
        path.chmod(mode)

    def collect(self): return M.collect_history(self.deadline)

    def local(self, path):
        self.assertTrue(path.startswith('/opt/helmut-native-test/'))
        return self.root / path.lstrip('/')

    def test_positive_history_is_read_only_and_old_dynamic_values_are_never_current_authority(self):
        before = {key: M._read(spec, self.deadline) for key, spec in M._files().items()}
        baseline = self.collect()
        self.assertEqual(baseline['files'], before)
        self.assertEqual(baseline['job'], self.job)
        self.assertEqual(baseline['legacy_jobs_directory'], M._metadata(os.stat(self.jobs)))
        self.assertEqual(baseline['job_directory'], M._metadata(os.stat(self.jobdir)))
        self.assertNotEqual(baseline['legacy_jobs_directory'], baseline['job_directory'])
        self.assertTrue(M.verify_history_unchanged(baseline, self.deadline))
        self.assertEqual({key: M._read(spec, self.deadline) for key, spec in M._files().items()}, before)
        self.assertEqual(set(baseline['files']), {'global_error', 'job', 'worker_error', *self.pins})
        for row in baseline['files'].values(): self.assertEqual(len(row['metadata']), 12)

    def test_safe_summary_is_closed_contains_no_private_job_or_source_text_and_copies_metadata(self):
        baseline = self.collect()
        summary = M.history_summary(baseline)
        self.assertEqual(set(summary), {'schema', 'status', 'code', 'files', 'job_directory', 'legacy_jobs_directory',
                                        'native_qualified', 'native_go_consumed'})
        text = self.encode(summary)
        for private in (b'raw', b'controller', b'boot_id', b'namespace', b'never execute', str(self.base).encode()):
            self.assertNotIn(private, text)
        self.assertFalse(summary['native_qualified']); self.assertFalse(summary['native_go_consumed'])
        summary['files']['job']['metadata'][0] = -1
        self.assertNotEqual(summary['files']['job']['metadata'], baseline['files']['job']['metadata'])
        summary['legacy_jobs_directory'][0] = -1
        self.assertNotEqual(summary['legacy_jobs_directory'], baseline['legacy_jobs_directory'])
        baseline['files']['job']['sha256'] = '/private/text'
        with self.assertRaises(M.Stop): M.history_summary(baseline)

    def test_every_error_and_job_field_must_be_present_correct_and_not_duplicated(self):
        rows = ((self.base / 'TARGET_SETUP_FIRST_ERROR.SAFE.json', self.global_error),
                (self.jobdir / 'FIRST_ERROR.PRIVATE.json', self.worker_error), (self.jobdir / 'JOB.PRIVATE.json', self.job))
        for path, original in rows:
            for key in original:
                for kind in ('missing', 'wrong', 'duplicate'):
                    value = copy.deepcopy(original)
                    if kind == 'missing': del value[key]
                    if kind == 'wrong': value[key] = 'wrong'
                    raw = self.encode(value)
                    if kind == 'duplicate': raw = raw.rstrip()[:-1] + b',' + self.encode({key: original[key]}).strip()[1:]
                    with self.subTest(file=path.name, key=key, kind=kind):
                        self.write(path, raw)
                        with self.assertRaises(M.Stop): self.collect()
                        self.write(path, self.encode(original))
            self.write(path, self.encode({**original, 'extra': 'private'}))
            with self.assertRaises(M.Stop): self.collect()
            self.write(path, self.encode(original))

    def test_nested_job_structures_are_closed_complete_and_typed(self):
        path = self.jobdir / 'JOB.PRIVATE.json'
        for nested in ('request', 'controller', 'phase_data', 'assets'):
            for key in self.job[nested]:
                for kind in ('missing', 'wrong', 'extra'):
                    value = copy.deepcopy(self.job)
                    if kind == 'missing': del value[nested][key]
                    if kind == 'wrong': value[nested][key] = 'wrong'
                    if kind == 'extra': value[nested]['extra'] = 'private'
                    with self.subTest(nested=nested, key=key, kind=kind):
                        self.write(path, self.encode(value))
                        with self.assertRaises(M.Stop): self.collect()
        for name in self.pins:
            for change in ({'sha256': 'a'*64}, {'bytes': 1}, {'bytes': float(self.pins[name]['bytes'])},
                           {'bytes': True}, {'extra': 'private'}):
                value = copy.deepcopy(self.job)
                value['assets'][name].update(change)
                self.write(path, self.encode(value))
                with self.subTest(name=name, change=change), self.assertRaises(M.Stop): self.collect()
        self.write(path, self.encode(self.job))

    def test_dynamic_job_fields_are_bounded_without_reading_proc_or_current_boot(self):
        path = self.jobdir / 'JOB.PRIVATE.json'
        changes = ({'deadline': True}, {'deadline': -1}, {'deadline': float('nan')}, {'deadline': float('inf')},
            {'deadline': 2**53}, {'deadline': 12.5}, {'runtime_seconds': True}, {'runtime_seconds': 0}, {'runtime_seconds': 296},
            {'boot_id': 'arbitrary'}, {'boot_id': []}, {'controller': {'pid': True, 'start_ticks': 2, 'namespace': [1, 2]}},
            {'controller': {'pid': 2, 'start_ticks': 1, 'namespace': [1, 2]}},
            {'controller': {'pid': 2, 'start_ticks': 2, 'namespace': [True, 2]}},
            {'controller': {'pid': 2, 'start_ticks': 2, 'namespace': [-1, 2]}},
            {'controller': {'pid': 2, 'start_ticks': 2, 'namespace': [1]}},
            {'controller': {'pid': 2**31, 'start_ticks': 2, 'namespace': [1, 2]}})
        for change in changes:
            with self.subTest(change=change):
                self.write(path, self.encode({**self.job, **change}))
                with self.assertRaises(M.Stop): self.collect()

    def test_duplicate_nested_fields_and_asset_pin_fields_stop(self):
        path = self.jobdir / 'JOB.PRIVATE.json'
        for nested in ('request', 'controller', 'phase_data', 'assets'):
            for key, value in self.job[nested].items():
                original = self.encode(self.job[nested]).strip()
                duplicate = original[:-1] + b',' + self.encode({key: value}).strip()[1:]
                raw = self.encode(self.job).replace(original, duplicate, 1)
                self.write(path, raw)
                with self.subTest(nested=nested, key=key), self.assertRaisesRegex(M.Stop, 'HISTORY_DUPLICATE_JSON'):
                    self.collect()
        for name, pin in self.pins.items():
            for key in pin:
                original = self.encode(pin).strip()
                duplicate = original[:-1] + b',' + self.encode({key: pin[key]}).strip()[1:]
                self.write(path, self.encode(self.job).replace(original, duplicate, 1))
                with self.subTest(asset=name, key=key), self.assertRaisesRegex(M.Stop, 'HISTORY_DUPLICATE_JSON'):
                    self.collect()

    def test_false_flags_do_not_accept_numeric_zero(self):
        for path, original in ((self.base / 'TARGET_SETUP_FIRST_ERROR.SAFE.json', self.global_error),
                               (self.jobdir / 'FIRST_ERROR.PRIVATE.json', self.worker_error)):
            for flag in ('native_qualified', 'native_go_consumed'):
                self.write(path, self.encode({**original, flag: 0}))
                with self.assertRaises(M.Stop): self.collect()
                self.write(path, self.encode(original))

    def test_all_required_files_missing_empty_corrupt_or_wrong_mode_stop(self):
        for role, (parent, name, cap, mode) in M._files().items():
            path = self.local(parent) / name
            original = M._read((parent, name, cap, mode), self.deadline)['raw']
            for state in ('missing', 'empty', 'corrupt', 'mode'):
                with self.subTest(role=role, state=state):
                    if state == 'missing': path.unlink()
                    if state == 'empty': self.write(path, b'', mode)
                    if state == 'corrupt': self.write(path, b'wrong', mode)
                    if state == 'mode': path.chmod(0o644)
                    with self.assertRaises(M.Stop): self.collect()
                    self.write(path, original, mode)

    def test_each_forbidden_old_marker_and_unknown_job_entry_stops(self):
        paths = [self.jobdir / name for name in ('ARM.PRIVATE.json', 'ACK.PRIVATE.json',
                  'RESULT.PENDING.PRIVATE.json', 'RESULT.PRIVATE.json', 'foreign', '.setup-write-partial.tmp')]
        paths += [self.base / ('SETUP_' + phase.upper() + '_ACCEPTED.SAFE.json' + suffix)
                  for phase in M.PHASES for suffix in ('', '.PENDING')]
        paths.append(self.base / 'TARGET_SETUP_FIRST_ERROR.SAFE.json.PENDING')
        for path in paths:
            with self.subTest(path=path.name):
                self.write(path, b'unknown')
                with self.assertRaises(M.Stop): self.collect()
                path.unlink()

    def test_one_byte_identical_error_publication_loser_is_fully_bound_and_preserved(self):
        for suffix in ('0'*32, 'f'*32, '0123456789abcdef'*2):
            name = '.setup-write-' + suffix + '.tmp'
            path = self.jobdir / name
            self.write(path, self.encode(self.worker_error))
            before = M._read((M._job_path(), name, M.CAP, 0o600), self.deadline)
            baseline = self.collect()
            self.assertEqual(set(baseline['files']), {*M._files(), name})
            self.assertEqual(baseline['files'][name], before)
            self.assertEqual(before['raw'], baseline['files']['worker_error']['raw'])
            self.assertTrue(M.verify_history_unchanged(baseline, self.deadline))
            summary = M.history_summary(baseline)
            self.assertEqual(set(summary['files'][name]), {'sha256', 'metadata'})
            self.assertEqual(summary['files'][name], {key: before[key] for key in ('sha256', 'metadata')})
            self.assertEqual(M._read((M._job_path(), name, M.CAP, 0o600), self.deadline), before)
            self.assertEqual(baseline['files']['worker_error']['raw'], self.encode(self.worker_error))
            path.unlink()

    def test_complete_legacy_root_rejects_armed_siblings_and_unknown_partial_before_or_after_baseline(self):
        for name, directory in (('e'*64, True), ('.unknown-partial-job', False),
                                ('.setup-write-'+'a'*32+'.tmp', False)):
            baseline = self.collect()
            extra = self.jobs / name
            if directory:
                extra.mkdir(mode=0o700)
                self.write(extra / 'ARM.PRIVATE.json', b'{"synthetic_unknown_armed_job":true}\n')
            else: self.write(extra, self.encode(self.worker_error))
            with self.subTest(name=name, point='before'), self.assertRaises(M.Stop): self.collect()
            with self.subTest(name=name, point='after'), self.assertRaises(M.Stop):
                M.verify_history_unchanged(baseline, self.deadline)
            if directory:
                (extra / 'ARM.PRIVATE.json').unlink(); extra.rmdir()
            else: extra.unlink()
        self.collect()  # Exact old job remains acceptable after synthetic adversarial entries are removed.

    def test_complete_legacy_root_rejects_modes_owners_symlinks_and_missing_root(self):
        for mode in (0, 0o500, 0o600, 0o755, 0o770, 0o777, 0o1700, 0o2700):
            self.jobs.chmod(mode)
            with self.subTest(mode=mode), self.assertRaises(M.Stop): self.collect()
            self.jobs.chmod(0o700)
        info = os.stat(self.jobs)
        for owner in ('st_uid', 'st_gid'):
            self.overrides[(info.st_dev, info.st_ino)] = {owner: 1000}
            with self.subTest(owner=owner), self.assertRaises(M.Stop): self.collect()
        self.overrides.clear()
        held = self.root / 'synthetic-held-jobs'
        self.jobs.rename(held)
        with self.assertRaises(M.Stop): self.collect()
        self.jobs.symlink_to(held)
        with self.assertRaises(M.Stop): self.collect()
        self.jobs.unlink(); held.rename(self.jobs)
        link = self.jobs / 'unexpected-link'
        link.symlink_to(self.jobdir)
        with self.assertRaises(M.Stop): self.collect()
        link.unlink()
        self.collect()

    def test_legacy_root_metadata_and_membership_drift_during_scandir_are_rejected(self):
        original_scan = M.os.scandir
        root_info = os.stat(self.jobs)
        root_identity = root_info.st_dev, root_info.st_ino
        for kind in ('metadata', 'membership'):
            changed = []
            extra = self.jobs / '.unknown-partial-job'
            @contextlib.contextmanager
            def scandir(fd):
                info = os.fstat(fd)
                is_root = (info.st_dev, info.st_ino) == root_identity
                with original_scan(fd) as entries:
                    def rows():
                        for entry in entries:
                            yield entry
                            if is_root and not changed:
                                changed.append(True)
                                if kind == 'membership': self.write(extra, b'SYNTHETIC_PARTIAL')
                                else:
                                    before = os.stat(self.jobs)
                                    os.utime(self.jobs, ns=(before.st_atime_ns, before.st_mtime_ns + 1))
                    yield rows()
            with self.subTest(kind=kind), patch.object(M.os, 'scandir', side_effect=scandir):
                with self.assertRaises(M.Stop): self.collect()
            self.assertTrue(changed)
            if kind == 'membership': extra.unlink()
        self.collect()

    def test_legacy_root_metadata_drift_during_file_read_and_between_effects_is_bound(self):
        original_read, changed = M.os.read, []
        def read(fd, size):
            block = original_read(fd, size)
            if block and not changed:
                changed.append(True)
                before = os.stat(self.jobs)
                os.utime(self.jobs, ns=(before.st_atime_ns, before.st_mtime_ns + 1))
            return block
        with patch.object(M.os, 'read', side_effect=read):
            with self.assertRaisesRegex(M.Stop, 'HISTORY_DIRECTORY_CHANGED'): self.collect()
        self.assertTrue(changed)
        baseline = self.collect()
        before = os.stat(self.jobs)
        os.utime(self.jobs, ns=(before.st_atime_ns, before.st_mtime_ns + 1))
        self.assertEqual(M._metadata(os.stat(self.jobdir)), baseline['job_directory'])
        with self.assertRaisesRegex(M.Stop, 'HISTORY_CHANGED'): M.verify_history_unchanged(baseline, self.deadline)
        del baseline['legacy_jobs_directory']
        with self.assertRaises(M.Stop): M.history_summary(baseline)

    def test_error_loser_requires_one_exact_name_and_exact_bytes_not_json_equivalence(self):
        valid = '.setup-write-' + 'a'*32 + '.tmp'
        invalid_names = ('.setup-write-' + 'A'*32 + '.tmp', '.setup-write-' + 'a'*31 + '.tmp',
            '.setup-write-' + 'a'*33 + '.tmp', '.setup-write-' + 'g'*32 + '.tmp',
            'setup-write-' + 'a'*32 + '.tmp', valid + '.extra')
        for name in invalid_names:
            path = self.jobdir / name
            self.write(path, self.encode(self.worker_error))
            with self.subTest(name=name), self.assertRaises(M.Stop): self.collect()
            path.unlink()
        path = self.jobdir / valid
        self.write(path, self.encode(self.worker_error))
        second = self.jobdir / ('.setup-write-' + 'b'*32 + '.tmp')
        self.write(second, self.encode(self.worker_error))
        with self.assertRaises(M.Stop): self.collect()
        second.unlink()
        for raw in (b'', self.encode(self.worker_error) + b'\n',
                    json.dumps(self.worker_error, indent=2).encode(),
                    self.encode({**self.worker_error, 'code': 'WORKER_ALREADY_ATTEMPTED'}),
                    self.encode({**self.worker_error, 'phase': 'checkout'})):
            self.write(path, raw)
            with self.subTest(raw=raw), self.assertRaises(M.Stop): self.collect()
        self.write(path, self.encode(self.worker_error))
        first = self.jobdir / 'FIRST_ERROR.PRIVATE.json'
        first.unlink()
        with self.assertRaises(M.Stop): self.collect()

    def test_error_loser_identity_links_and_baseline_drift_stop(self):
        name = '.setup-write-' + 'a'*32 + '.tmp'
        path = self.jobdir / name
        raw = self.encode(self.worker_error)
        for mode in (0o500, 0o400, 0o644, 0o700):
            self.write(path, raw, mode)
            with self.subTest(mode=mode), self.assertRaises(M.Stop): self.collect()
        self.write(path, raw)
        info = os.stat(path)
        for owner in ('st_uid', 'st_gid'):
            self.overrides[(info.st_dev, info.st_ino)] = {owner: 1000}
            with self.subTest(owner=owner), self.assertRaises(M.Stop): self.collect()
        self.overrides.clear()
        path.unlink(); path.symlink_to(self.jobdir / 'FIRST_ERROR.PRIVATE.json')
        with self.assertRaises(M.Stop): self.collect()
        path.unlink(); self.write(path, raw)
        linked = self.root / 'duplicate-hardlink'
        os.link(path, linked)
        with self.assertRaises(M.Stop): self.collect()
        linked.unlink(); path.unlink(); os.mkfifo(path, 0o600)
        with self.assertRaises(M.Stop): self.collect()
        path.unlink(); self.write(path, raw)
        baseline = self.collect()
        info = os.stat(path)
        os.utime(path, ns=(info.st_atime_ns, info.st_mtime_ns + 1))
        with self.assertRaises(M.Stop): M.verify_history_unchanged(baseline, self.deadline)
        baseline = self.collect()
        replacement = self.root / 'duplicate-replacement'
        self.write(replacement, raw)
        os.replace(replacement, path)
        with self.assertRaises(M.Stop): M.verify_history_unchanged(baseline, self.deadline)
        baseline = self.collect()
        renamed = self.jobdir / ('.setup-write-' + 'c'*32 + '.tmp')
        path.rename(renamed)
        with self.assertRaises(M.Stop): M.verify_history_unchanged(baseline, self.deadline)

    def test_symlinks_hardlinks_nonregular_files_and_untrusted_directories_stop(self):
        path = self.jobdir / 'driver.py'
        raw = M._read(M._files()['driver.py'], self.deadline)['raw']
        path.unlink(); path.symlink_to(self.jobdir / 'guard.py')
        with self.assertRaises(M.Stop): self.collect()
        path.unlink(); self.write(path, raw, 0o500)
        os.link(path, self.root / 'extra-link')
        with self.assertRaises(M.Stop): self.collect()
        (self.root / 'extra-link').unlink(); path.unlink(); path.mkdir(mode=0o500)
        with self.assertRaises(M.Stop): self.collect()
        path.rmdir(); self.write(path, raw, 0o500)
        for directory in (self.base, self.jobs, self.jobdir):
            directory.chmod(0o755)
            with self.assertRaises(M.Stop): self.collect()
            directory.chmod(0o700)
        info = os.stat(path)
        self.overrides[(info.st_dev, info.st_ino)] = {'st_uid': 1000}
        with self.assertRaises(M.Stop): self.collect()

    def test_short_reads_are_completed_and_early_eof_or_inflight_changes_stop(self):
        original_read = M.os.read
        with patch.object(M.os, 'read', side_effect=lambda fd, size: original_read(fd, min(size, 3))):
            self.collect()
        with patch.object(M.os, 'read', return_value=b''):
            with self.assertRaises(M.Stop): self.collect()
        path = self.jobdir / 'JOB.PRIVATE.json'
        def changed(fd, size):
            block = original_read(fd, size)
            if block.startswith(b'{"assets"'): path.chmod(0o640)
            return block
        with patch.object(M.os, 'read', side_effect=changed):
            with self.assertRaises(M.Stop): self.collect()

    def test_baseline_detects_same_bytes_replacement_source_and_directory_metadata_drift(self):
        baseline = self.collect()
        path = self.jobdir / 'JOB.PRIVATE.json'
        replacement = self.root / 'replacement'
        self.write(replacement, baseline['files']['job']['raw'])
        os.replace(replacement, path)
        with self.assertRaises(M.Stop): M.verify_history_unchanged(baseline, self.deadline)
        baseline = self.collect()
        path = self.jobdir / 'guard.py'
        self.write(path, baseline['files']['guard.py']['raw'] + b'changed', 0o500)
        with self.assertRaises(M.Stop): M.verify_history_unchanged(baseline, self.deadline)
        self.write(path, baseline['files']['guard.py']['raw'], 0o500)
        baseline = self.collect()
        info = os.stat(self.jobdir)
        os.utime(self.jobdir, ns=(info.st_atime_ns, info.st_mtime_ns + 1))
        with self.assertRaises(M.Stop): M.verify_history_unchanged(baseline, self.deadline)

    def test_file_replacement_during_read_size_limits_and_midwalk_deadline_stop(self):
        path = self.jobdir / 'JOB.PRIVATE.json'
        replacement = self.root / 'replacement'
        self.write(replacement, self.encode(self.job))
        original_read = M.os.read
        replaced = []
        def read(fd, size):
            block = original_read(fd, size)
            if block.startswith(b'{"assets"') and not replaced:
                os.replace(replacement, path)
                replaced.append(True)
            return block
        with patch.object(M.os, 'read', side_effect=read):
            with self.assertRaisesRegex(M.Stop, 'HISTORY_FILE_CHANGED'): M._read(M._files()['job'], self.deadline)
        for role in ('job', 'guard.py'):
            parent, name, cap, mode = M._files()[role]
            target = self.local(parent) / name
            self.write(target, b'x' * (cap + 1), mode)
            with self.subTest(role=role), self.assertRaises(M.Stop): self.collect()
            self.write(target, self.encode(self.job) if role == 'job' else b'synthetic-invalid', mode)
        calls = []
        def now():
            calls.append(True)
            return 100 if len(calls) > 10 else 0
        with patch.object(M.time, 'monotonic', side_effect=now):
            with self.assertRaisesRegex(M.Stop, 'HISTORY_DEADLINE'): M.collect_history(50)
        self.assertEqual(len(calls), 11)

    def test_unused_components_checks_every_fixed_path_and_native_once_without_payload_reads(self):
        stage = self.base / ('stage-' + M.CASE)
        stage.mkdir(mode=0o700)
        self.write(stage / 'payload.tar.gz', b'SYNTHETIC_SENTINEL_NOT_AN_ORIGINAL')
        own_open = M.os.open
        def no_payload(path, flags, *args, **kwargs):
            self.assertNotEqual(str(path).rsplit('/', 1)[-1], 'payload.tar.gz')
            self.assertEqual(flags & M.R, M.R)
            self.assertFalse(flags & (os.O_CREAT | os.O_TRUNC | os.O_WRONLY | os.O_RDWR))
            return own_open(path, flags, *args, **kwargs)
        with patch.object(M.os, 'open', side_effect=no_payload):
            self.assertTrue(M.require_unused_components(self.deadline))
        for path in M._component_paths():
            target = self.local(path)
            created = []
            for parent in reversed(target.parents):
                if parent == self.root or self.root not in parent.parents: continue
                if not parent.exists(): parent.mkdir(mode=0o700); created.append(parent)
            self.write(target, b'unknown')
            with self.subTest(path=target.name), self.assertRaises(M.Stop): M.require_unused_components(self.deadline)
            target.unlink()
            for parent in reversed(created): parent.rmdir()
        self.assertEqual((stage / 'payload.tar.gz').read_bytes(), b'SYNTHETIC_SENTINEL_NOT_AN_ORIGINAL')

    def test_missing_component_ancestors_are_safe_only_if_trusted_and_not_symlinked(self):
        self.assertTrue(M.require_unused_components(self.deadline))
        once = self.base / 'once'
        once.symlink_to(self.root / 'missing')
        with self.assertRaises(M.Stop): M.require_unused_components(self.deadline)
        once.unlink(); once.mkdir(mode=0o700); once.chmod(0o777)
        with self.assertRaises(M.Stop): M.require_unused_components(self.deadline)

    def test_deadline_root_permissions_and_entrypoint_are_fail_closed_and_inert(self):
        for deadline in (True, float('nan'), float('inf'), time.monotonic()-1, time.monotonic()+301):
            with self.subTest(deadline=deadline), self.assertRaises(M.Stop): M.collect_history(deadline)
            with self.assertRaises(M.Stop): M.require_unused_components(deadline)
        with patch.object(M.os, 'geteuid', return_value=1000):
            with self.assertRaisesRegex(M.Stop, 'HISTORY_ROOT_REQUIRED'): self.collect()
        with patch.object(M.os, 'open', side_effect=AssertionError('inert import must not open files')):
            namespace = {'__name__': 'inert_import'}
            exec(compile(RAW, str(SOURCE), 'exec'), namespace)
        output = io.StringIO()
        with contextlib.redirect_stdout(output), self.assertRaises(SystemExit) as stopped:
            exec(compile(RAW, str(SOURCE), 'exec'), {'__name__': '__main__'})
        self.assertEqual(stopped.exception.code, 2)
        self.assertEqual(json.loads(output.getvalue()), {'status': 'NOT_EXECUTED_COMPONENT_ONLY'})
        for forbidden in (b'subprocess', b'os.system', b'os.unlink', b'os.rename', b'os.mkdir', b'os.fork'):
            self.assertNotIn(forbidden, RAW)


if __name__ == '__main__':
    unittest.main(verbosity=2)
