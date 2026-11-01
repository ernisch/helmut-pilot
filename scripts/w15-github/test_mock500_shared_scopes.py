"""Exercise only the new explicit backup/input scopes with fictional archives."""
import sys
sys.dont_write_bytecode = True
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('mock_scope_fixtures', Path(__file__).with_name('test_restore_backup.py'))
F = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(F)


class ExplicitScopes(unittest.TestCase):
    def fixture(self):
        case = F.BackupChecks('runTest'); case.setUp(); self.addCleanup(case.doCleanups)
        return case

    def test_default_end_scope_does_not_accept_mock_or_unknown_scope(self):
        context = self.fixture().context
        for scope in ('ISOLATED_GITHUB_MOCK500_BACKUP_ONLY', 'ISOLATED_GITHUB_MOCK500_INPUTS_ONLY'):
            value = {**context, 'scope': scope}
            with self.subTest(scope=scope), self.assertRaises(F.R.B.BackupRejected): F.R._context(value)
            F.R._context(value, expected_scope=scope)
        for scope in ('UNKNOWN', 'ISOLATED_GITHUB_MOCK500_BINDING_ONLY'):
            with self.assertRaises(F.R.B.BackupRejected): F.R._context({**context, 'scope': scope}, expected_scope=scope)

    def test_authenticated_readback_reuses_decoder_only_for_explicit_matching_scope(self):
        for scope in ('ISOLATED_GITHUB_MOCK500_BACKUP_ONLY', 'ISOLATED_GITHUB_MOCK500_INPUTS_ONLY'):
            case = self.fixture(); case.context['scope'] = scope
            result = case.readback(backup_scope=scope)
            self.assertTrue(result['localAuthenticatedReadbackObserved'])
            self.assertEqual((case.root / 'readback/database/final.PRIVATE.dump').read_bytes(), case.payload)


if __name__ == '__main__': unittest.main()
