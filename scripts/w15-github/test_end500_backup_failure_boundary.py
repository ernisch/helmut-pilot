"""Execute actual backup boundary AST with tiny fake executors; no DB/GPG/network."""
import sys
sys.dont_write_bytecode = True

import ast
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest

REPO = Path(__file__).absolute().parents[2]
TREE = ast.parse((REPO / 'scripts/synthetik-500-w15-memory-forward.py').read_text())
MAIN = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
SPEC = importlib.util.spec_from_file_location('w15_boundary_runtime_backup', REPO / 'scripts/w15-github/runtime_backup.py')
BACKUP = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(BACKUP)


def collect_call(node):
    return any(isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
               and n.func.attr == 'collect_backup' for n in ast.walk(node))


BLOCKS = [n for n in ast.walk(MAIN) if isinstance(n, ast.If)
          and any(isinstance(child, ast.Try) and collect_call(child) for child in n.body)]
assert len(BLOCKS) == 1
BLOCK = compile(ast.fix_missing_locations(ast.Module(body=BLOCKS, type_ignores=[])), 'actual-backup-boundary', 'exec')
FINAL = compile(ast.fix_missing_locations(ast.Module(body=[MAIN.body[-1]], type_ignores=[])), 'actual-final-systemexit', 'exec')
HELPERS = compile(ast.fix_missing_locations(ast.Module(body=[n for n in TREE.body if isinstance(n, ast.FunctionDef)
    and n.name in ('backup_phase', 'capacity_phase')], type_ignores=[])), 'actual-phase-observers', 'exec')


class End500BackupFailureBoundaryChecks(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix='w15-fictional-backup-boundary-')
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        work = self.root / 'work'; work.mkdir(mode=0o700)
        self.calls, self.phases = [], []
        self.inject = None; self.sample_calls = 0; self.fail_sample = None
        self.context = {'recipientFingerprint': 'C' * 40, 'exactCommit': 'a' * 40,
                        'runId': '123456789', 'inputManifestSHA': 'b' * 64}
        self.resources = SimpleNamespace(processing_backup_stage=None,
            end_capacity_diagnostic=False, phase_observer=self.phases.append,
            sample=self.sample, safe_summary=self.summary,
            last_observation=lambda: {'lastReadbackValid': True})
        self.module = SimpleNamespace(collect_backup=self.collect, S=SimpleNamespace(seal=self.seal))
        inputs = SimpleNamespace(backup_context=lambda: dict(self.context),
            backup_input_files=lambda: {}, backup_provenance_files=lambda: {})
        self.scope = {'inputs': inputs, 'failure': None, 'zero': True,
            'functional_closure_completed': True, 'actual_memory_accepted': True,'functional_observation':lambda _:None,
            'capacity_diagnostic': False, 'functional':False, 'common_resources': self.resources,
            'service_closure': {'status': 'PASS_GENUINE_OWNED_SERVICE_EXIT'},
            'w': SimpleNamespace(native_failure=None, finished=SimpleNamespace(is_set=lambda: True),
                thread=SimpleNamespace(is_alive=lambda: False), reporter=SimpleNamespace(is_alive=lambda: False), stop_failure=None),
            'WORK': work, 'PREP': self.root / 'prepared', 'ROOT': REPO,
            'backup_result': None, 'sealed_backup': None, 'backup_completion': None,
            'backup_stage': None, 'backup_failure_phase': None,
            '_runtime_module': lambda name: self.module,
            'hashlib': hashlib, 'json': json, 'os': os, 'sys': sys, '__name__': __name__}
        exec(HELPERS, self.scope)

    def collect(self, *args, **kwargs):
        self.calls.append('collect')
        if self.inject == 'collect': raise RuntimeError('DO_NOT_EXPORT_PRIVATE_COLLECT_PATH')
        return {'manifestSHA256': 'd' * 64}

    def seal(self, **kwargs):
        self.calls.append('seal')
        if self.inject == 'seal': raise RuntimeError('DO_NOT_EXPORT_PRIVATE_SEAL_PATH')
        return {'status': 'FICTIONAL_BYTES_ONLY'}

    def sample(self):
        self.sample_calls += 1
        if self.sample_calls == self.fail_sample: raise RuntimeError('DO_NOT_EXPORT_PRIVATE_KERNEL_PATH')
        return {'lastReadbackValid': True}

    def summary(self):
        if self.inject == 'summary': raise RuntimeError('DO_NOT_EXPORT_PRIVATE_SUMMARY')
        return {'legacyContractAccepted': False}

    def run_boundary(self):
        exec(BLOCK, self.scope)

    def exit_error(self):
        with self.assertRaises(SystemExit) as caught: exec(FINAL, self.scope)
        self.assertEqual(caught.exception.code, 1)
        self.assertNotIn('DO_NOT_EXPORT', json.dumps(self.scope['failure']))
        return caught.exception

    def test_collect_failure_keeps_first_closed_phase_through_final_systemexit(self):
        self.inject = 'collect'; self.fail_sample = 1 # A later closing failure cannot replace collection.
        self.run_boundary()
        error = self.exit_error()
        self.assertEqual(error.backup_failure_phase, 'backup-collect')
        self.assertEqual(self.calls, ['collect']); self.assertEqual(self.phases, ['backup-collect'])
        self.assertEqual(self.scope['failure']['reason'], 'w15-complete-backup-or-common-closure-failed-or-unknown')

    def test_seal_failure_keeps_closed_phase_without_callback(self):
        self.inject = 'seal'; self.run_boundary()
        self.assertEqual(self.exit_error().backup_failure_phase, 'backup-seal')
        self.assertEqual(self.calls, ['collect', 'seal'])
        self.assertEqual(self.phases, ['backup-collect', 'backup-seal'])

    def test_postcheck_failure_after_seal_keeps_closed_phase(self):
        self.inject = 'summary'; self.run_boundary()
        self.assertEqual(self.exit_error().backup_failure_phase, 'backup-postcheck')
        self.assertEqual(self.phases, ['backup-collect', 'backup-seal', 'backup-postcheck'])

    def test_final_closure_failure_is_postcheck_without_overwriting_prior_failure(self):
        self.fail_sample = 2; self.run_boundary()
        self.assertEqual(self.exit_error().backup_failure_phase, 'backup-postcheck')
        self.assertEqual(self.scope['failure']['reason'], 'w15-final-closure-receipt-or-kernel-unconfirmed')

    def test_existing_primary_failure_prevents_backup_and_keeps_precedence(self):
        primary = {'type': 'FICTIONAL_PRIMARY', 'reason': 'earlier-primary'}
        self.scope['failure'] = primary; self.run_boundary()
        error = self.exit_error()
        self.assertIs(self.scope['failure'], primary)
        self.assertFalse(hasattr(error, 'backup_failure_phase'))
        self.assertEqual(self.calls, []); self.assertEqual(self.phases, [])

    def test_existing_native_failure_keeps_precedence(self):
        native = {'schema': 'FICTIONAL_ALREADY_VALIDATED_NATIVE_FAILURE'}
        self.scope['w'].native_failure = native; self.inject = 'collect'; self.run_boundary()
        error = self.exit_error()
        self.assertIs(error.native_failure, native)
        self.assertFalse(hasattr(error, 'backup_failure_phase'))

    def test_callback_retains_its_own_failure_channel(self):
        def callback(**kwargs): raise RuntimeError('DO_NOT_EXPORT_PRIVATE_CALLBACK')
        self.scope['backup_completion'] = callback; self.run_boundary()
        self.assertFalse(hasattr(self.exit_error(), 'backup_failure_phase'))
        self.assertEqual(self.phases, ['backup-collect', 'backup-seal'])

    def test_capacity_closure_false_legacy_acceptance_can_reach_collection(self):
        self.scope.update(capacity_diagnostic=True, actual_memory_accepted=False)
        self.resources.end_capacity_diagnostic = True
        self.inject = 'collect'; self.run_boundary()
        self.assertEqual(self.exit_error().backup_failure_phase, 'backup-collect')
        self.assertEqual(self.calls, ['collect'])
        self.assertEqual(self.phases, ['capacity-processing-stopped', 'backup-collect'])
        self.assertFalse(self.scope['actual_memory_accepted'])

    def test_actual_gateway_redirect_is_private_under_permissive_inherited_umask(self):
        gateways = [n for n in ast.walk(MAIN) if isinstance(n, ast.Call)
            and isinstance(n.func, ast.Attribute) and n.func.attr == 'docker'
            and any(isinstance(a, ast.Constant) and a.value == '-d' for a in n.args)]
        self.assertEqual(len(gateways), 1)
        command = compile(ast.Expression(gateways[0].args[-1]), 'actual-gateway-command', 'eval')
        base = self.scope['WORK']; state = base / 'state'; state.mkdir(mode=0o700)
        # A tiny owned shell stand-in ignores the application's args. Nothing runs a service.
        node = base / 'node'; node.write_text('#!/bin/sh\nexit 0\n'); node.chmod(0o700)
        argv = eval(command, {'BASE': str(base), 'BUDGET': {'nodeOldSpaceMiB': 16}})
        result = subprocess.run(['sh', '-c', argv], env={'PATH': '/usr/bin:/bin'}, timeout=5,
            capture_output=True, preexec_fn=lambda: os.umask(0o022))
        self.assertEqual(result.returncode, 0)
        log = state / 'gateway.PRIVATE.log'
        self.assertEqual(log.stat().st_mode & 0o777, 0o600)
        self.assertEqual([row['path'] for row in BACKUP._tree(state, private=True)], ['gateway.PRIVATE.log'])


if __name__ == '__main__': unittest.main()
