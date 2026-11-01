"""New private handoff seam only; reuse fictional receiver mocks, never originals."""
import sys
sys.dont_write_bytecode = True

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from unittest.mock import patch
import unittest

HERE = Path(__file__).absolute().parent
SPEC = importlib.util.spec_from_file_location('w15_runtime_handoff_existing_fixtures', HERE / 'test_receive_existing_inputs.py')
FIXTURES = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FIXTURES)
E = FIXTURES.E


class RuntimeHandoffChecks(unittest.TestCase):
    def root(self):
        temporary = tempfile.TemporaryDirectory(prefix='w15-fictional-private-handoff-')
        self.addCleanup(temporary.cleanup)
        return Path(temporary.name)

    def test_receipt_wrapper_and_cli_never_expose_private_root(self):
        root = self.root()
        received = root / 'FICTIONAL-PRIVATE-RECEIVED'
        summary = {'status': 'FICTIONAL_RECEIPT_ONLY', 'verifiedFiles': 12,
                   'verifiedBytes': 242570240, 'executionAuthority': False}
        with patch.object(E, '_receive_existing_verified', return_value=(received, summary)) as internal:
            self.assertIs(E.receive_existing(FIXTURES.COMMIT, str(root)), summary)
            internal.assert_called_once_with(FIXTURES.COMMIT, str(root))
        with patch.object(E, '_receive_existing_verified', return_value=(received, summary)) as internal, \
                contextlib.redirect_stdout(io.StringIO()) as output:
            result = E.main(['--receive-existing-inputs-only', '--expected-commit', FIXTURES.COMMIT,
                             '--runner-temp', str(root)])
        self.assertEqual(result, 0)
        self.assertEqual(json.loads(output.getvalue()), summary)
        self.assertNotIn(str(root), output.getvalue())
        self.assertNotIn('PRIVATE-RECEIVED', output.getvalue())
        internal.assert_called_once_with(FIXTURES.COMMIT, str(root))

    def call_fixture(self, root, *, close_status=0, receipt_sha=None):
        events, handed = [], []
        class CloseResult:
            @property
            def returncode(self):
                events.append('agent-close-exit-observed')
                return close_status
        def receive_for_fixture(commit, runner_temp):
            received, summary = E._receive_existing_verified(commit, runner_temp)
            events.append('private-handoff')
            handed.append(received)
            return summary
        # The reused helper constructs its close-process result via this factory.
        # Its GPG/HTTP/original-receiver calls remain the existing fictional mocks.
        with patch.object(FIXTURES.subprocess, 'CompletedProcess', return_value=CloseResult()), \
                patch.object(E, 'receive_existing', side_effect=receive_for_fixture), \
                patch.object(E, '_receive_existing_verified', wraps=E._receive_existing_verified) as internal:
            try:
                result = FIXTURES.ExistingReceiveChecks().run_receiver(root, receipt_sha=receipt_sha)
            except BaseException:
                self.assertEqual(handed, [])
                self.assertNotIn('private-handoff', events)
                raise
        internal.assert_called_once_with(FIXTURES.COMMIT, str(root))
        return result, events, handed

    def test_private_handoff_occurs_once_after_agent_close_and_complete_original_checks(self):
        root = self.root()
        result, events, handed = self.call_fixture(root)
        summary, _, download, receive, verify = result
        self.assertEqual(events, ['agent-close-exit-observed', 'private-handoff'])
        self.assertEqual(handed, [root / 'received'])
        self.assertEqual(summary['verifiedFiles'], 12)
        self.assertEqual(summary['verifiedBytes'], 242570240)
        self.assertTrue(summary['relocationVerified'])
        self.assertFalse(summary['executionAuthority'])
        self.assertNotIn(str(root), json.dumps(summary))
        self.assertEqual(download.call_count, 1)
        self.assertEqual(receive.call_count, 1)
        self.assertEqual(verify.call_count, 1)
        self.assertEqual(receive.call_args.kwargs['destination'], str(root / 'received'))
        self.assertEqual(verify.call_args.args, (str(root / 'received'),))
        self.assertEqual(verify.call_args.kwargs['checkout_commit'], FIXTURES.COMMIT)
        self.assertEqual(verify.call_args.kwargs['expected_transfer_context'], E.SOURCE)

    def test_agent_close_failure_blocks_private_handoff(self):
        root = self.root()
        with self.assertRaisesRegex(ValueError, '^EXISTING_INPUT_RECEPTION_REJECTED$') as error:
            self.call_fixture(root, close_status=1)
        self.assertEqual(E.PHASE, 'agent-close')
        self.assertNotIn(str(root), str(error.exception))

    def test_existing_integrity_failure_never_returns_received_root(self):
        root = self.root()
        with self.assertRaisesRegex(ValueError, '^EXISTING_INPUT_RECEPTION_REJECTED$') as error:
            self.call_fixture(root, receipt_sha='b' * 64)
        self.assertEqual(E.PHASE, 'authenticated-reception')
        self.assertNotIn(str(root), str(error.exception))


if __name__ == '__main__':
    unittest.main()
