"""The new request is public and bounded; only the index is GPG ciphertext."""
import sys
sys.dont_write_bytecode = True
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('w15_gated_index_fixture', Path(__file__).with_name('test_encrypted_index.py'))
T = importlib.util.module_from_spec(spec); spec.loader.exec_module(T)
N = T.N


class GatedIndexChecks(unittest.TestCase):
    def test_actual_whole_payload_and_event_bind_new_mode_request_and_cipher(self):
        armored = T.armor()
        extra = {'w15_request': '{"FICTIONAL":"PUBLIC-CODE-REVIEW"}'}
        for mode in ('end500-restore-gated', 'end500-full-gated'):
            raw = N.dispatch_payload(T.COMMIT, armored, mode=mode, extra_inputs=extra)
            event = json.loads(raw)['inputs']
            self.assertEqual(N.check_event(T.COMMIT, armored, mode=mode,
                extra_inputs=extra, event_inputs=event), len(raw))
            event['expected_commit'] = 'f'*40
            with self.assertRaises(ValueError): N.check_event(T.COMMIT, armored, mode=mode,
                extra_inputs=extra, event_inputs=event)

    def test_public_review_cannot_overflow_or_add_hidden_fields(self):
        for extra in ({'w15_request': 'x'*65535}, {'w15_request': '{}', 'extra': 'unexpected'}, None):
            with self.subTest(extra_type=type(extra).__name__), self.assertRaises(ValueError):
                N.dispatch_payload(T.COMMIT, T.armor(), mode='end500-restore-gated', extra_inputs=extra)


if __name__ == '__main__': unittest.main()
