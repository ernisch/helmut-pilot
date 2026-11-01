"""Fictional context and canonical-class seams; no original data or execution."""
import sys
sys.dont_write_bytecode = True
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('mock_context_tested', Path(__file__).with_name('mock500_context.py'))
C = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(C)
NONCE = '26d5a413-5ca7-415c-a412-62fc45b561c8'


class ContextChecks(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory(); self.addCleanup(folder.cleanup)
        self.repo = Path(folder.name); self.repo.chmod(0o700)
        memory = self.repo / C.MEMORY; memory.parent.mkdir(parents=True)
        memory.write_text(json.dumps({'version': 'helmut-w15-memory-check/2',
            'comparisonBudgetBytes': 2048000000, 'minimumReservePercent': 20}))
        self.pins = {'FICTIONAL.py': {'bytes': 3, 'sha256': 'b' * 64}}
        self.runtime = SimpleNamespace(C=SimpleNamespace(_directory=lambda p: os.open(p, os.O_RDONLY | os.O_DIRECTORY),
            RUNTIME={'node': 'FICTIONAL'}), source_requirements=Mock(return_value=(self.pins, [])),
            _require_commit_contents=Mock(), P=SimpleNamespace(git_head=Mock(return_value='a' * 40), decode=json.loads),
            _validate_qualification=Mock(), IP=SimpleNamespace(verify_received=Mock(return_value='RECEIVED')),
            TOKEN=object(), RuntimeInputs=Mock(return_value='CANONICAL_RUNTIME_INPUTS'))
        self.manifest = {'nonce': NONCE, 'runId': '123456789', 'runAttempt': 1, 'exactCommit': 'a' * 40,
            'runnerTemp': str(self.repo), 'sourcePins': self.pins, 'imageId': 'sha256:' + 'c' * 64}
        self.components = patch.object(C, 'component', return_value=self.runtime); self.components.start()
        self.addCleanup(self.components.stop)
        self.context = C.build_context(self.manifest, self.repo)

    def test_fresh_namespace_and_exact_committed_sources_are_required(self):
        self.assertEqual(C.validate_context(self.context, self.repo)['memoryProfile'], 'helmut-w15-memory-check/2')
        self.runtime._require_commit_contents.assert_called_with(self.repo, 'a' * 40, self.pins)
        for key, changed in [('sourcePins', {}), ('scope', 'ISOLATED_GITHUB_END500_BINDING_ONLY'),
                             ('runAttempt', True), ('executionAuthority', True)]:
            bad = copy.deepcopy(self.context); bad[key] = changed
            with self.subTest(key=key), self.assertRaises(ValueError): C.validate_context(bad, self.repo)
        Path(self.context['hostPaths']['runRoot']).mkdir(mode=0o700)
        with self.assertRaises(ValueError): C.validate_context(self.context, self.repo)

    def test_runtime_class_is_reused_after_source_and_fresh_event_binding(self):
        raw = C.canonical({'sourcePins': self.pins, 'historicalDeltas': [], 'executionAuthority': False})
        sha = hashlib.sha256(raw).hexdigest()
        observed = {k: self.context[k] for k in ('exactCommit', 'runId', 'runAttempt', 'nonce')} | {
            'branch': C.BRANCH, 'mode': 'mock500-full-gated'}
        env = {'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_SHA': 'a' * 40,
               'GITHUB_REF': C.BRANCH, 'GITHUB_RUN_ID': '123456789', 'GITHUB_RUN_ATTEMPT': '1'}
        with patch.dict(os.environ, env, clear=True):
            result = C.open_runtime_inputs('/FICTIONAL/received', context=self.context, qualification_raw=raw,
                qualification_sha256=sha, observed_context=observed, repo=self.repo)
            self.assertEqual(result, 'CANONICAL_RUNTIME_INPUTS')
            self.runtime.IP.verify_received.assert_called_once_with('/FICTIONAL/received',
                expected_transfer_context=C.TRANSFER, expected_sealed_manifest_sha256=C.SEALED_SHA,
                checkout_commit='a' * 40, repo=self.repo)
            for bad_raw, bad_observed in [(b' ' + raw, observed), (raw, {**observed, 'runId': '123456788'})]:
                with self.assertRaises(ValueError): C.qualified_observation(self.context, bad_raw,
                    hashlib.sha256(bad_raw).hexdigest(), bad_observed, self.repo)
            with patch.dict(os.environ, {'GITHUB_RUN_ATTEMPT': '2'}), self.assertRaises(ValueError):
                C.qualified_observation(self.context, raw, sha, observed, self.repo)


if __name__ == '__main__': unittest.main()
