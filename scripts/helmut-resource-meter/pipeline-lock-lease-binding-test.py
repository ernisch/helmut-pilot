#!/usr/bin/env python3
"""Pure renderer-unit fixture. No real admission, process start, SQL or case write."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

BIN = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('lease_binding_renderer_only', BIN / 'connect-local500.py')
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)
C.REPO = BIN.parents[1]
C.BIN = BIN


class LeaseBindingRendererTest(unittest.TestCase):
    def test_real_default_off_descriptor_still_renders_without_native_admission(self):
        with tempfile.TemporaryDirectory(prefix='helmut-lease-off-render-unit-') as temporary:
            root = Path(temporary)
            file = root / 'REAL_OFF_DESCRIPTOR.SAFE.json'
            value = subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify(require(process.argv[1]).descriptor()))",
                                             str(BIN / 'atomic-usage-integration.js')], text=True)
            file.write_text(value)
            pinned = C.pin(file)
            candidate = C.read_atomic_descriptor(pinned)
            self.assertNotIn('pipelineLockLease', candidate)
            case = C.AREA / 'attempt-0123456789ab'
            rows = C.render_templates(case, target='helmut_resource_fixture_20261021_0123456789ab',
                container='helmut-meter-db-w20-0123456789ab', operation='synthetik500-resources21-0123456789ab',
                day_rows_pin={'path': str(C.BASE / 'wave13/NORMALIZED500_CURRENT_POLICY.PRIVATE.json')},
                owner_go_pin={'path': str(root / 'NEVER_CREATED_OWNER_GO')}, atomic_usage_pin=pinned)
            self.assertEqual(len(rows), 26)
            bridge = next(row['text'] for row in rows if row['destination'].endswith('/root-io-bridge.js'))
            self.assertIn('Object.assign(env,require(', bridge)
            self.assertNotIn('pipelineLeaseCatalog', bridge)
            self.assertNotIn('pipelineLockLeaseReceipt', bridge)
            subprocess.run(['node', '-e', "const vm=require('vm'),fs=require('fs');for(const text of JSON.parse(fs.readFileSync(0,'utf8')))new vm.Script(text)"],
                           input=json.dumps([row['text'] for row in rows if row['destination'].endswith('.js')]),
                           text=True, capture_output=True, check=True)
            self.assertFalse(case.exists())
            self.assertFalse((root / 'NEVER_CREATED_OWNER_GO').exists())

    def test_unadmitted_fixture_rejected_but_render_branch_and_all_replays_are_pure(self):
        with tempfile.TemporaryDirectory(prefix='helmut-lease-render-unit-') as temporary:
            root = Path(temporary)
            absent = {'path': str(root / 'NEVER_CREATED_ACCEPTANCE.SAFE.json'), 'bytes': 1, 'sha256': '0' * 64}
            # This descriptor is intentionally UNADMITTED: the real canonical
            # validator must reject it. Only rendering is isolated below.
            candidate = {'schema': 'helmut-local-atomic-usage-resource-input/1', 'mode': 'relational-atomic-v1',
                         'production': False, 'stateStorage': 'merkle-auth-v1', 'historyReadReuse': 'verified-history-reuse-v1',
                         'controlRead': 'verified-control-view-v1', 'boundedRead': 'bounded-native-read-v1',
                         'senderClaimRead': 'verified-control-claim-v1', 'sourcePins': [], 'localSourceDeltaPin': absent,
                         'pipelineLockLease': {'mode': 'invocation-lease-v1', 'acceptancePin': absent}}
            file = root / 'UNADMITTED_RENDER_FIXTURE.SAFE.json'
            file.write_text(json.dumps(candidate))
            pinned = C.pin(file)
            with self.assertRaises(RuntimeError):
                C.read_atomic_descriptor(pinned)
            original_read = C.read_pin

            def read_fixture(p):
                return candidate if p == pinned else original_read(p)

            case = C.AREA / 'attempt-0123456789ab'
            self.assertFalse(case.exists())
            with patch.object(C, 'read_atomic_descriptor', return_value=candidate), patch.object(C, 'read_pin', side_effect=read_fixture):
                rows = C.render_templates(case, target='helmut_resource_fixture_20261021_0123456789ab',
                    container='helmut-meter-db-w20-0123456789ab', operation='synthetik500-resources21-0123456789ab',
                    day_rows_pin={'path': str(C.BASE / 'wave13/NORMALIZED500_CURRENT_POLICY.PRIVATE.json')},
                    owner_go_pin={'path': str(root / 'NEVER_CREATED_OWNER_GO')}, atomic_usage_pin=pinned)
            self.assertEqual(len(rows), 26)
            files = {}
            for row in rows:
                text = Path(row['original']['path']).read_text()
                for change in row['replacements']:
                    self.assertEqual(text.count(change['from']), change['count'])
                    text = text.replace(change['from'], change['to'])
                self.assertEqual(text, row['text'])
                self.assertEqual(C.pin(row['original']['path']), row['original'])
                files[Path(row['destination']).relative_to(case).as_posix()] = text
            for name in ['native-end-preparation/root-io-bridge.js',
                         'native-end-preparation/runtime-candidates/prepare-materials.candidate.js']:
                self.assertIn('Object.assign(env,require(', files[name])
                self.assertIn('.environment(env,', files[name])
            self.assertIn('Object.assign(process.env,require(', files['assemble-after-activation.js'])
            authority = files['native-end-preparation/runtime-candidates/root-authority-stage.candidate.js']
            for key in ['HELMUT_LOCAL_PIPELINE_LOCK_MODE', 'HELMUT_ATOMIC_LOCK']:
                self.assertIn(key, authority)
            bridge = files['native-end-preparation/root-io-bridge.js']
            self.assertEqual(bridge.count('.assertCatalog(pipelineLeaseCatalog)'), 3)
            self.assertEqual(bridge.count('assert.equal(pipelineLeaseCatalog.database,target.database)'), 3)
            self.assertIn('pipelineLockLeaseReceipt', bridge)
            self.assertIn('function readState(selector)', bridge)
            self.assertIn('function readAllFinalEvidence(selector,count)', bridge)
            # Parse only; requiring/running the staged workflow is forbidden.
            subprocess.run(['node', '-e', "const vm=require('vm'),fs=require('fs');for(const text of JSON.parse(fs.readFileSync(0,'utf8')))new vm.Script(text)"],
                           input=json.dumps([text for name, text in files.items() if name.endswith('.js')]),
                           text=True, capture_output=True, check=True)
            self.assertFalse(case.exists())
            self.assertFalse(Path(absent['path']).exists())
            self.assertFalse((root / 'NEVER_CREATED_OWNER_GO').exists())


if __name__ == '__main__':
    unittest.main()
