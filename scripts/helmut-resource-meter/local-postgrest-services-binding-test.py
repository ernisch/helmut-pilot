#!/usr/bin/env python3
"""Pure broker allowlist and literal staging checks; no Docker or acceptance."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

BIN = Path(__file__).resolve().parent


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, BIN / file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


B = load('pure_owner_broker', 'docker-broker.py')
C = load('pure_owner_connector', 'connect-local500.py')
C.BIN = BIN


class BrokerContract(unittest.TestCase):
    def setUp(self):
        self.cfg = {'containerName': 'helmut-meter-db-w20-0123456789ab', 'containerId': 'b' * 64,
                    'postgrestBinary': '/tmp/helmut-unit-fixture-postgrest-03693bea',
                    'postgrestConfig': '/tmp/helmut-resource-fixture.conf'}
        self.optional = {**self.cfg, 'localPostgrestBackendPlanPin': {'path': '/NEVER_CREATED_REVIEWED_PLAN', 'bytes': 1, 'sha256': '0' * 64}}

    def test_absent_backend_preserves_legacy_exact_start_contract(self):
        direct = ['exec', '-d', self.cfg['containerName'], self.cfg['postgrestBinary'], self.cfg['postgrestConfig']]
        shell = ['exec', '-i', self.cfg['containerName'], 'sh', '-c',
                 'umask 077; test ! -e ' + self.cfg['postgrestConfig'] + ' && cat > ' + self.cfg['postgrestConfig']]
        for command in [direct, shell]:
            self.assertTrue(B.allowed(command, self.cfg))
            self.assertEqual(B.docker_arguments(command, self.cfg), command)
            self.assertFalse(B.allowed(command, self.optional))
        self.assertFalse(B.allowed([B.OWNER_START], self.cfg))

    def test_optional_start_is_one_fixed_supervisor_submit_without_detach(self):
        expected = ['exec', '-i', self.cfg['containerId'], B.OWNER_PYTHON, B.OWNER_SUPERVISOR, '--submit-local-postgrest-request']
        for prefix in [[], ['--host=unix:///var/run/docker.sock']]:
            self.assertEqual(B.docker_arguments(prefix + [B.OWNER_START], self.optional), expected)
        self.assertNotIn('-d', expected)
        for command in [[B.OWNER_START, 'foreign'], ['exec', self.cfg['containerId'], B.OWNER_PYTHON, '-c', 'anything'],
                        ['exec', self.cfg['containerId'], 'sh', '-c', 'kill 1'], ['stop', self.cfg['containerId']],
                        ['exec', '-d', self.cfg['containerId'], 'psql']]:
            self.assertFalse(B.allowed(command, self.optional))
            with self.assertRaises(RuntimeError):
                B.docker_arguments(command, self.optional)

    def test_bootstrap_sql_and_fixed_inspect_remain_on_owned_container_only(self):
        for cfg in [self.cfg, self.optional]:
            for command in [['exec', '-i', '-u', 'postgres', cfg['containerId'], 'psql', '-f', '-'],
                            ['inspect', '--format', '{{json .NetworkSettings.Networks}}', cfg['containerName']]]:
                self.assertTrue(B.allowed(command, cfg))
            self.assertFalse(B.allowed(['exec', 'foreign-container', 'psql'], cfg))


class RendererContract(unittest.TestCase):
    def setUp(self):
        self.case = C.AREA / 'attempt-0123456789ab'
        self.args = {'target': 'helmut_resource_fixture_20261021_0123456789ab',
                     'container': 'helmut-meter-db-w20-0123456789ab', 'operation': 'synthetik500-resources21-0123456789ab',
                     'day_rows_pin': {'path': str(C.BASE / 'wave13/NORMALIZED500_CURRENT_POLICY.PRIVATE.json')},
                     'owner_go_pin': {'path': '/NEVER_CREATED_OWNER_GO'}}
        self.plan_pin = {'path': '/NEVER_CREATED_PURE_PLAN.SAFE.json', 'bytes': 1, 'sha256': '0' * 64}

    def render(self, **extras):
        return C.render_templates(self.case, **self.args, **extras)

    def test_default_none_is_byte_identical_and_never_loads_backend(self):
        with patch.object(C, 'read_postgrest_backend_plan', return_value=None):
            plain = self.render()
            explicit = self.render(local_postgrest_backend_plan_pin=None)
        self.assertEqual(plain, explicit)
        service = next(row['text'] for row in plain if row['destination'].endswith('/start-services.candidate.js'))
        self.assertNotIn('local-postgrest-services.js', service)
        self.assertIn("docker(['exec','-d'", service)

    def test_rejected_backend_has_no_staged_outputs(self):
        before = self.case.exists()
        with patch.object(C, 'read_postgrest_backend_plan', side_effect=ValueError('Unadmitted source/GO/case')):
            with self.assertRaisesRegex(ValueError, 'Unadmitted'):
                self.render(local_postgrest_backend_plan_pin=self.plan_pin)
        self.assertEqual(self.case.exists(), before)

    def test_optional_renderer_preserves_original_and_uses_same_current_jwt_pin(self):
        originals = {p['path']: C.pin(p['path']) for p in json.loads((BIN / 'legacy-harness-pins.json').read_text())['files']}
        for restored in [None, {'jwtSecret': {'path': '/pure/retained-secret'},
                               'sourcePostgrestConfig': {'path': '/pure/retained-config', 'sha256': '1' * 64}}]:
            with self.subTest(restored=restored is not None), \
                    patch.object(C, 'read_postgrest_backend_plan', return_value={'TEST_ONLY': 'NO_REAL_ADMISSION'}) as gate, \
                    patch.object(C, 'read_restored_staging_inputs', return_value=restored):
                rows = self.render(local_postgrest_backend_plan_pin=self.plan_pin,
                                   restore_staging_inputs={} if restored else None)
            gate.assert_called_once_with(self.plan_pin, self.case, self.args['target'], self.args['operation'])
            self.assertEqual(len(rows), 26)
            by_name = {Path(row['destination']).name: row['text'] for row in rows}
            service = by_name['start-services.candidate.js']
            self.assertIn(str(BIN / 'local-postgrest-services.js'), service)
            self.assertNotIn("docker(['exec','-d'", service)
            assembly = by_name['assemble-after-activation.js']
            self.assertIn('localPostgrestBackendPlanPin:', assembly)
            self.assertIn("jwtSecret:H.privateJSON(pin(N+'/runtime-candidates/generated-services/LOCAL_POSTGREST_SERVICES_STARTED.SAFE.json')).localJWTSecretPin", assembly)
            # Original budget/signing/guards stay in the actual material consumer.
            materials = by_name['prepare-materials.candidate.js']
            self.assertIn("crypto.createHmac('sha256',secret)", materials)
            self.assertIn("const secret=H.G.pinned(r.jwtSecret)", materials)
            self.assertIn('budgetScenario(r.localBudgetScenario)', materials)
            texts = [r['text'] for r in rows if r['destination'].endswith('.js')]
            result = subprocess.run(['node', '-e', "const vm=require('node:vm');for(const s of JSON.parse(require('node:fs').readFileSync(0,'utf8')))new vm.Script(s);"],
                                    input=json.dumps(texts), text=True, capture_output=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
        for file, expected in originals.items():
            self.assertEqual(C.pin(file), expected)


if __name__ == '__main__':
    unittest.main()
