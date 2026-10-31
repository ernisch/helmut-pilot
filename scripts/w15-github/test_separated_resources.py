"""Small fictional observations; optional SELECT on the existing CI database only."""
import sys
sys.dont_write_bytecode = True
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


S = load('separated_resource_test', 'separated_resources.py')


def connections():
    return dict(zip(S.SETTINGS + S.COUNTS, (60, 3, 2, 268435456, 3584000, 2,
        17, 9, 1, 3, 2, 1, 4, 6, 5, 10, 2, 0)))


def observation():
    groups = []
    for role, instance in [('application', 1), ('application', 2), ('database', 0)]:
        limit = S.load_contract()['referenceLabProposal'][role]
        groups.append({'declaredRole': role, 'classifiedRole': role, 'instanceId': instance,
            'pidInventoryStable': True, 'uniqueObservedPids': 1,
            'observedKernel': {'memory': {'currentBytes': 100000, 'kernelLifetimePeakBytes': 200000,
                'maximumBytes': limit['hardMemoryBytes'], 'swapCurrentBytes': 0, 'swapMaximumBytes': 0},
                'cpuMaximum': {'quotaUsec': 100000, 'periodUsec': 100000},
                'memoryEvents': dict.fromkeys(('max', 'oom', 'oom_kill', 'oom_group_kill'), 0)},
            'cpuInterval': {'counterIdentityDrift': 'UNKNOWN'}})
    return {'schema': 'helmut-w15-component-resource-observation/1',
        'status': 'OBSERVED_SEPARATE_CGROUP_COUNTERS_ONLY', 'groups': groups,
        'unassignedParentProcessCount': 0, 'executionAuthority': False, 'resourceContractAccepted': False}


class SeparatedChecks(unittest.TestCase):
    def test_inactive_reference_numbers_are_explicit_assumptions_not_reserves(self):
        value = S.plan(); proposal = value['referenceLabProposal']
        self.assertFalse(value['activationEnabled']); self.assertFalse(value['executionAuthority'])
        self.assertFalse(value['startGateAccepted']); self.assertTrue(value['legacyAcceptanceUnchanged'])
        self.assertEqual(proposal['application']['hardMemoryBytes'], 2000000000 // 4096 * 4096)
        self.assertEqual(proposal['database']['hardMemoryBytes'], 948191232)
        self.assertEqual(proposal['realApplicationSafetyReserveBytes'], 'UNKNOWN')
        self.assertEqual(proposal['realDatabaseSafetyReserveBytes'], 'UNKNOWN')
        self.assertIn('NOT_A_SAFETY_RESERVE', proposal['peakGapMeaning'])
        self.assertEqual(value['providerFacts']['database']['cpuEntitlement'], 'SHARED_UNKNOWN')

    def test_connections_include_observer_exclude_background_and_keep_reservations(self):
        value = S.connection_observation(connections())
        self.assertEqual(value['clientBackends'], 17); self.assertEqual(value['backgroundBackends'], 9)
        self.assertEqual(value['freeNonReservedClientSlotsAtSample'], 38)
        self.assertTrue(value['observerIncludedInTotal']); self.assertTrue(value['clientStateCoverageComplete'])
        self.assertEqual(value['capacityAt500Profiles'], 'UNKNOWN')
        raw = connections(); raw['reservedConnections'] = None
        self.assertEqual(S.connection_observation(raw)['freeNonReservedClientSlotsAtSample'], 'UNKNOWN')

    def test_connection_partial_malformed_and_private_fields_are_not_zero_or_exported(self):
        for raw in ({}, {**connections(), 'privateSQL': 'PRIVATE_SENTINEL'},
                    {**connections(), 'observerClients': True}, {**connections(), 'otherClients': 99}):
            value = S.connection_observation(raw)
            self.assertEqual(value['status'], 'UNKNOWN')
            self.assertNotIn('PRIVATE_SENTINEL', json.dumps(value))
        raw = connections(); raw['unknownStateClients'] = 1
        self.assertFalse(S.connection_observation(raw)['clientStateCoverageComplete'])

    def test_per_instance_comparison_never_adds_peaks_or_opens_old_gates(self):
        value = S.reference_snapshot(observation())
        self.assertEqual(value['status'], 'REFERENCE_CURRENT_SNAPSHOT_FIT_ONLY')
        self.assertEqual([r['instanceId'] for r in value['components']], [1, 2, 0])
        self.assertFalse(value['resourceContractAccepted']); self.assertFalse(value['providerParityAccepted'])
        self.assertFalse(value['fullScenarioAccepted']); self.assertFalse(value['executionAuthority'])
        self.assertEqual(value['pureApplicationConsumption'], 'UNKNOWN')

    def test_peak_oom_swap_unbounded_and_cpu_drift_cannot_fit(self):
        paths = [('memory', 'kernelLifetimePeakBytes', 1999998976), ('memory', 'swapCurrentBytes', 1),
                 ('memory', 'maximumBytes', 'UNLIMITED'), ('memoryEvents', 'max', 1),
                 ('memoryEvents', 'oom', 1), ('cpuMaximum', 'quotaUsec', 200000)]
        for section, key, replacement in paths:
            raw = observation(); raw['groups'][0]['observedKernel'][section][key] = replacement
            self.assertNotEqual(S.reference_snapshot(raw)['status'], 'REFERENCE_CURRENT_SNAPSHOT_FIT_ONLY')
        raw = observation(); raw['groups'][0]['cpuInterval']['counterIdentityDrift'] = 'COUNTER_DECREASED'
        self.assertNotEqual(S.reference_snapshot(raw)['status'], 'REFERENCE_CURRENT_SNAPSHOT_FIT_ONLY')

    def test_missing_mixed_duplicate_malformed_and_unassigned_observations_remain_unknown(self):
        cases = []
        raw = observation(); raw['groups'][0]['classifiedRole'] = 'UNKNOWN'; cases.append(raw)
        raw = observation(); raw['groups'].pop(); cases.append(raw)
        raw = observation(); raw['groups'].append(copy.deepcopy(raw['groups'][0])); cases.append(raw)
        raw = observation(); raw['groups'][0]['observedKernel'] = None; cases.append(raw)
        raw = observation(); raw['groups'][0]['instanceId'] = []; cases.append(raw)
        raw = observation(); raw['unassignedParentProcessCount'] = False; cases.append(raw)
        raw = observation(); raw['status'] = 'PARTIAL_COMPONENT_RESOURCE_OBSERVATION'; cases.append(raw)
        raw = observation(); raw['groups'].append({'declaredRole': 'test-tools', 'classifiedRole': 'UNKNOWN'}); cases.append(raw)
        for raw in cases:
            self.assertEqual(S.reference_snapshot(raw)['status'], 'UNKNOWN_REFERENCE_COMPONENT_BUDGET')

    def test_optional_existing_guard_hook_is_passive_and_retains_cpu_interval_reader(self):
        R = load('existing_resource_hook_test', 'common_resources.py')
        guard = R.CommonResources(R.TOKEN, {}, R.KERNEL_ROOT / ('w15_123456_' + 'a' * 32 + '.slice'), (0, 0))
        C = load('passive_component_hook_test', 'component_resource_meter.py')
        meter = C.Meter()
        with patch.object(R.importlib.util, 'module_from_spec', return_value=C), \
                patch.object(R.importlib.util, 'spec_from_file_location') as spec, \
                patch.object(C, 'Meter', return_value=meter), \
                patch.object(meter, 'observe', return_value={'status': 'UNKNOWN'}) as observe, \
                patch.object(guard, 'sample', side_effect=AssertionError('old guard must not run')):
            guard.component_snapshot([]); guard.component_snapshot([])
            self.assertEqual(spec.call_count, 1); self.assertEqual(observe.call_count, 2)
            observe.assert_called_with(guard.path, guard._identity, [])
        self.assertEqual(guard.container_limit, 2560000000)
        self.assertEqual((R.LIMIT, R.MAXIMUM, R.RESERVE), (2560000000, 2048000000, 512000000))


def native_connections():
    # Public CI fixture credentials only; no arbitrary server/SQL/DSN input.
    expected = {'PGHOST': '127.0.0.1', 'PGPORT': '5433', 'PGUSER': 'helmut',
                'PGDATABASE': 'postgres', 'HELMUT_SYNTHETIK500_PG_ISOLIERT': 'JA'}
    if any(os.environ.get(k) != v for k, v in expected.items()):
        raise SystemExit('EXISTING_SYNTHETIC_CI_DATABASE_BINDING_REQUIRED')
    command = 'begin read only;\n' + S.CONNECTION_SNAPSHOT_SQL + '\nrollback;'
    process = subprocess.run(['psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=command,
        env={**expected, 'PGPASSWORD': 'helmut', 'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
             'PGCONNECT_TIMEOUT': '5'}, capture_output=True, text=True, timeout=15)
    if process.returncode != 0: raise SystemExit('SYNTHETIC_READ_ONLY_CONNECTION_QUERY_FAILED')
    value = S.connection_observation(json.loads(process.stdout))
    if (value['status'] != 'OBSERVED_CLIENT_CONNECTIONS_ONLY' or value['observerClients'] != 1
            or not value['clientStateCoverageComplete']):
        raise SystemExit('SYNTHETIC_CONNECTION_PROJECTION_FAILED')
    print(json.dumps({'schema': 'helmut-w15-ci-connection-query-check/1', 'status': 'PASS',
        'readOnly': True, 'existingSyntheticService': True, 'productionQueried': False,
        'clientBackends': value['clientBackends'], 'observerClients': value['observerClients'],
        'resourceContractAccepted': False}, sort_keys=True))


if __name__ == '__main__':
    if sys.argv[1:] == ['--native-connections']: native_connections()
    else: unittest.main()
