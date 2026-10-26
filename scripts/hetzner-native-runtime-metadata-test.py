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
            'released_safe_sha256': m.FILE_SHA}
        self.stack.enter_context(patch.object(m, 'SETUP_CONFIG', self.config))
        self.stack.enter_context(patch.object(m, 'CONTRACT_SHA256', m.sha(m.encoded(self.config))))
        self.proof = {'baseline_sha256': '5'*64, 'bindings': {},
                      'historical_source_sha256': self.config['setup_server_sha256'],
                      'historical_deployment_commit': self.config['setup_deployment_commit'],
                      'setup_proof': {'schema': 'helmut-runtime-metadata-setup-proof-v1',
                        'source_sha256': self.config['setup_server_sha256'],
                        'deployment_commit': self.config['setup_deployment_commit'],
                        'contract_sha256': self.config['contract_sha256'], 'asset_set_sha256': self.config['asset_set_sha256'],
                        'authority_sha256': '6'*64, 'once_sha256': '7'*64,
                        'accepted_sha256': {phase: m.sha(phase.encode()) for phase in m.PHASES},
                        'job_seal_sha256': {phase: m.sha(('seal'+phase).encode()) for phase in m.PHASES},
                        'baseline_sha256': '5'*64}}
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
                self.assertEqual(result['status'], 'SAFE_METADATA_CHUNK_NOT_NATIVE_QUALIFIED', result)
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
                self.assertEqual(result['status'], 'SAFE_METADATA_CHUNK_NOT_NATIVE_QUALIFIED', result)
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
            'setup_proof', 'chunk_index', 'chunk_count', 'chunk_size', 'chunk_sha256', 'data_base64',
            'json_summary', 'native_qualified', 'native_go_consumed'})
        self.assertEqual(result['source_sha256'], self.context['source_sha256'])
        self.assertEqual(result['contract_sha256'], m.CONTRACT_SHA256)
        self.assertNotEqual(result['source_sha256'], result['setup_proof']['source_sha256'])
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

    def baseline_adapter_fixture(self):
        """Test delegation/context selection, not a replacement qualification of old modules."""
        q = copy.deepcopy(self.qualified)
        aliases = m.MODULE_NAMES - {'library', 'successor', 'preflight'}
        expected = {key: {'sha256': m.sha(q[key]['__source_bytes__']), 'bytes': len(q[key]['__source_bytes__'])}
                    for key in aliases}
        authority = {'source_sha256': self.config['setup_server_sha256'],
            'deployment_commit': self.config['setup_deployment_commit'], 'contract_sha256': self.config['contract_sha256'],
            'inspection_nonce': '7'*64, 'inspection_result_sha256': '8'*64, 'admitted_by_nonce': '9'*64,
            'history': {'SYNTHETIC_HISTORY': True}, 'runtime': {'SYNTHETIC_RUNTIME': True}}
        authority_raw = m.encoded(authority)
        rows = [({'phase': phase, 'ready_sha256': m.sha(phase.encode())},
                 m.sha(m.encoded({'SYNTHETIC_ACCEPTED': phase})))
                for phase in m.PHASES]
        payloads = {'AUTHORITY': authority_raw, 'ONCE': m.encoded({'schema': 'helmut-setup-successor-once-v1',
            'contract_id': m.NAMESPACE, 'authority_sha256': m.sha(authority_raw),
            'state': 'ADMITTED_FIXED_FOUR_PHASES_NO_REARM'})}
        for phase in m.PHASES:
            payloads['ACCEPTED_' + phase] = m.encoded({'SYNTHETIC_ACCEPTED': phase})
            payloads['SEAL_' + phase] = m.encoded({'SYNTHETIC_JOB_SEAL': phase})
        config = copy.deepcopy(self.config)
        accepted = Mock(return_value=rows)
        q['library'].update(FILES={key: key for key in aliases}, asset_pins=lambda: (expected, config['asset_set_sha256']),
            EXPECTED_OLD_RECEIPT='c'*64, directory=lambda path: os.open(self.base, m.R | os.O_DIRECTORY),
            accepted_chain=accepted, guard_jobs_check=Mock(), marker_name=lambda phase: 'ACCEPTED_' + phase)
        def read_bound(parent, name, library, deadline, cap):
            raw = payloads[name]
            return raw, {'sha256': m.sha(raw), 'metadata': [1]*12}
        q['successor'].update(AUTHORITY='AUTHORITY', ONCE='ONCE', read_bound=read_bound,
            parsed=lambda raw: m.unique_json(raw)[0], saved_inspection=Mock(return_value=({}, {})),
            encoded=m.encoded, authority_value=Mock(return_value=authority),
            runtime_snapshot=Mock(return_value=authority['runtime']), state_check=Mock(),
            verify_job_seals=Mock(), seal_name=lambda phase: 'SEAL_' + phase,
            contract_check=Mock(side_effect=AssertionError('no renewed admission')),
            coordinate_successor=Mock(side_effect=AssertionError('no new setup')))
        q['preflight'].update(collect_history=Mock(return_value={}),
            history_summary=Mock(return_value=authority['history']), verify_history_unchanged=Mock(return_value=True))
        context = {'status': 'CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED',
            'sourcePreparationKind': 'ACCEPTED_LOCAL_PAX_RECOVERY', 'recoveryReadySHA256': rows[0][0]['ready_sha256'],
            'publicCheckoutReadySHA256': rows[1][0]['ready_sha256'], 'nativeQualified': False, 'nativeGOConsumed': False}
        image = {'schema': 'helmut-original-budget-image-import-v1', 'status': 'IMPORTED_NOT_NATIVE_QUALIFIED',
                 'image': 'SYNTHETIC_FIXED_IMAGE', 'nativeQualified': False, 'nativeGOConsumed': False}
        q['driver.py'].update(paths=lambda: {'context_receipt': 'CONTEXT', 'image_receipt': 'IMAGE'},
            read=lambda path: (m.encoded(context if path == 'CONTEXT' else image), {}))
        q['context.py']['recovery_stage_proof'] = Mock()
        q['image.py']['_BI_IMAGE'] = 'SYNTHETIC_FIXED_IMAGE'
        return config, q, accepted

    def test_qualified_adapter_uses_historical_context_without_new_admission(self):
        config, qualified, accepted = self.baseline_adapter_fixture()
        proof = VERIFY_BASELINE(config, qualified, 1250)
        old_context = accepted.call_args.args[1]
        self.assertEqual(old_context['source_sha256'], config['setup_server_sha256'])
        self.assertNotEqual(old_context['source_sha256'], self.context['source_sha256'])
        self.assertEqual(old_context['deployment_commit'], config['setup_deployment_commit'])
        self.assertEqual(old_context['deadline'], 1250)
        self.assertEqual(len(proof['bindings']), 10)
        qualified['successor']['contract_check'].assert_not_called()
        qualified['successor']['coordinate_successor'].assert_not_called()
        self.assertEqual(qualified['successor']['verify_job_seals'].call_count, 2)

    def test_adapter_requires_all_four_and_current_marker_readback(self):
        config, qualified, accepted = self.baseline_adapter_fixture()
        accepted.return_value = accepted.return_value[:-1]
        with self.assertRaisesRegex(m.Stop, 'METADATA_FOUR_ACCEPTED_REQUIRED'): VERIFY_BASELINE(config, qualified, 1250)
        config, qualified, accepted = self.baseline_adapter_fixture()
        accepted.return_value[-1] = ({'phase': 'image', 'ready_sha256': 'a'*64}, '0'*64)
        with self.assertRaisesRegex(m.Stop, 'METADATA_BASELINE_DRIFT'): VERIFY_BASELINE(config, qualified, 1250)


if __name__ == '__main__': unittest.main()
