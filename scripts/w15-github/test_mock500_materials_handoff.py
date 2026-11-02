"""Actual fixed-worker handoff with fictional results and an unreadable checkout.

Only UID/process identity and run_worker are inert. The pinned staged import,
closed Materials validator and private result serialization execute unchanged.
No original, database, GPG, cgroup, network or protected execution occurs.
"""
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

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location('materials_handoff_' + name,
                                                HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


T, R, C = map(load, ('test_mock500_materials_diagnostic', 'mock500_runner',
                    'mock500_materials_contract'))


class MaterialsHandoffChecks(unittest.TestCase):
    def test_actual_worker_keeps_closed_first_failure_when_original_checkout_is_unreadable(self):
        request, result = T.MaterialsResultChecks('runTest').fixture()
        with tempfile.TemporaryDirectory(prefix='materials-fictional-handoff-') as tmp:
            directory = Path(tmp) / 'scripts/w15-github'
            directory.mkdir(parents=True)
            (directory / 'mock500_materials_contract.py').write_bytes(
                (HERE / 'mock500_materials_contract.py').read_bytes())
            script = directory / 'mock500_workflow.py'
            raw = ('''import importlib.util
from pathlib import Path
from types import SimpleNamespace
def component(name):
    if name == 'mock500_host_contract':
        return SimpleNamespace()
    assert name == 'mock500_materials_contract'
    spec = importlib.util.spec_from_file_location('fictional_staged_materials',
        Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
def run_worker(manifest, private_payload):
    return ''' + repr(result) + '\n').encode('ascii')
            script.write_bytes(raw)
            manifest = {**request, 'stagedRepo': tmp, 'runnerTemp': tmp + '/worker-temp',
                'sourcePins': {'scripts/w15-github/mock500_workflow.py': {
                    'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}}}
            sender, receiver = Mock(), Mock()
            with patch.object(R.S, '_close_stdio'), patch.dict(os.environ, {}, clear=True), \
                 patch.object(R.os, 'setgroups'), patch.object(R.os, 'setgid'), \
                 patch.object(R.os, 'setuid'), patch.object(R.os, 'getuid', return_value=1000), \
                 patch.object(R.os, 'getgid', return_value=1000), \
                 patch.object(R.os, 'getgroups', return_value=[987]), \
                 patch.object(R.P.P, 'StopLatch', return_value=SimpleNamespace(seen=False, close=Mock())), \
                 patch.object(R.S, '_load', side_effect=PermissionError('FICTIONAL_UNREADABLE_CHECKOUT')) as original:
                with self.assertRaises(SystemExit) as done:
                    R._fork_worker(manifest, {}, sender, receiver, 987)
            packet = json.loads(sender.send_bytes.call_args.args[0])
            self.assertEqual(done.exception.code, 0, packet)
            self.assertEqual(packet, {'ok': True, 'result': result})
            original.assert_not_called()
            receiver.close.assert_called_once()
            sender.close.assert_called_once()

    def test_staged_validation_still_rejects_private_extras_and_false_completion(self):
        request, result = T.MaterialsResultChecks('runTest').fixture()
        with patch.object(R.S, '_load', side_effect=PermissionError('FICTIONAL_UNREADABLE_CHECKOUT')) as original:
            self.assertEqual(R.validate_public_result(result, request, materials_contract=C), result)
            for change in ({'units': 500}, {'activeProfiles': 1}, {'nonce': 'WRONG'},
                           {'mock500Acceptance': True}, {'privateRawError': 'FICTIONAL_PRIVATE'}):
                with self.subTest(change=change), self.assertRaises(ValueError):
                    R.validate_public_result({**result, **change}, request, materials_contract=C)
            malformed = copy.deepcopy(result)
            malformed['firstFailure']['rawError'] = 'FICTIONAL_PRIVATE'
            with self.assertRaises(ValueError):
                R.validate_public_result(malformed, request, materials_contract=C)
            original.assert_not_called()

    def test_privileged_readback_keeps_independent_default_validation(self):
        request, result = T.MaterialsResultChecks('runTest').fixture()
        self.assertEqual(R.validate_public_result(result, request), result)
        with self.assertRaises(ValueError):
            R.validate_public_result({**result, 'units': 500}, request)


if __name__ == '__main__':
    unittest.main()
