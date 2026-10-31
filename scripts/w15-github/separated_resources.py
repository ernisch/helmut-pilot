"""Inactive reference contract and closed, read-only DB telemetry. No run on import."""
import sys
sys.dont_write_bytecode = True

import hashlib
import json
from pathlib import Path

UNKNOWN = 'UNKNOWN'
CONTRACT = Path(__file__).with_name('separated_resources_contract.json')
MAX_NUMBER = 2**53 - 1

# Only server settings and aggregate client classes; no query texts, IPs or IDs.
# The observer is part of total clients and is separately visible, never subtracted.
CONNECTION_SNAPSHOT_SQL = """select jsonb_build_object(
 'maxConnections',current_setting('max_connections')::int,
 'superuserReservedConnections',current_setting('superuser_reserved_connections')::int,
 'reservedConnections',current_setting('reserved_connections',true)::int,
 'sharedBuffersBytes',pg_size_bytes(current_setting('shared_buffers')),
 'workMemBytes',pg_size_bytes(current_setting('work_mem')),
 'maxParallelWorkers',current_setting('max_parallel_workers')::int,
 'clientBackends',count(*)filter(where backend_type='client backend'),
 'backgroundBackends',count(*)filter(where backend_type is distinct from 'client backend'),
 'observerClients',count(*)filter(where backend_type='client backend' and pid=pg_backend_pid()),
 'postgrestClients',count(*)filter(where backend_type='client backend' and pid<>pg_backend_pid() and usename='authenticator'),
 'authClients',count(*)filter(where backend_type='client backend' and pid<>pg_backend_pid() and usename='supabase_auth_admin'),
 'storageClients',count(*)filter(where backend_type='client backend' and pid<>pg_backend_pid() and usename='supabase_storage_admin'),
 'sharedPlatformClients',count(*)filter(where backend_type='client backend' and pid<>pg_backend_pid() and usename='supabase_admin'),
 'otherClients',count(*)filter(where backend_type='client backend' and pid<>pg_backend_pid()
   and usename not in('authenticator','supabase_auth_admin','supabase_storage_admin','supabase_admin')),
 'activeClients',count(*)filter(where backend_type='client backend' and state='active'),
 'idleClients',count(*)filter(where backend_type='client backend' and state='idle'),
 'idleTransactionClients',count(*)filter(where backend_type='client backend' and state in('idle in transaction','idle in transaction (aborted)')),
 'unknownStateClients',count(*)filter(where backend_type='client backend' and
   (state is null or state not in('active','idle','idle in transaction','idle in transaction (aborted)'))))
from pg_stat_activity;"""
SETTINGS = ('maxConnections', 'superuserReservedConnections', 'reservedConnections',
            'sharedBuffersBytes', 'workMemBytes', 'maxParallelWorkers')
COUNTS = ('clientBackends', 'backgroundBackends', 'observerClients', 'postgrestClients',
          'authClients', 'storageClients', 'sharedPlatformClients', 'otherClients',
          'activeClients', 'idleClients', 'idleTransactionClients', 'unknownStateClients')


def _integer(value):
    return type(value) is int and 0 <= value <= MAX_NUMBER


def load_contract():
    value = json.loads(CONTRACT.read_text())
    if not (value['schema'] == 'helmut-w15-separated-resources/1'
            and value['status'] == 'PROPOSED_REFERENCE_LAB_ONLY'
            and value['activationEnabled'] is False and value['executionAuthority'] is False
            and value['legacyAcceptanceUnchanged'] is True):
        raise ValueError('INACTIVE_RESOURCE_PROPOSAL_REJECTED')
    proposal = value['referenceLabProposal']; page = proposal['pageSizeBytes']
    if page != 4096:
        raise ValueError('REFERENCE_PAGE_ASSUMPTION_CHANGED')
    for role in ('application', 'database'):
        row = proposal[role]
        if not (all(_integer(row[k]) for k in ('hardMemoryBytes', 'maximumKernelPeakBytes', 'quotaUsec', 'periodUsec'))
                and row['hardMemoryBytes'] % page == 0
                and row['hardMemoryBytes'] - row['maximumKernelPeakBytes'] == page
                and row['quotaUsec'] == row['periodUsec'] == 100000):
            raise ValueError('REFERENCE_NUMERICS_REJECTED')
    return value


def plan():
    value = load_contract()
    canonical = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('ascii')
    return {'schema': value['schema'], 'status': 'PREPARED_INACTIVE_REFERENCE_MEASUREMENT_ONLY',
            'contractSHA256': hashlib.sha256(canonical).hexdigest(),
            'providerFacts': value['providerFacts'], 'referenceLabProposal': value['referenceLabProposal'],
            'activationEnabled': False, 'executionAuthority': False, 'legacyAcceptanceUnchanged': True,
            'providerParityAccepted': False, 'startGateAccepted': False}


def connection_observation(value):
    """Project an already collected numeric snapshot; this function opens no DB."""
    out = {'schema': 'helmut-w15-db-connection-observation/1', 'status': 'UNKNOWN',
           **dict.fromkeys(SETTINGS + COUNTS, UNKNOWN),
           'freeNonReservedClientSlotsAtSample': UNKNOWN,
           'clientStateCoverageComplete': False, 'poolQueueDepth': UNKNOWN,
           'observerIncludedInTotal': True, 'capacityAt500Profiles': UNKNOWN,
           'executionAuthority': False, 'resourceContractAccepted': False}
    if type(value) is not dict or set(value) != set(SETTINGS + COUNTS):
        return out
    for key in SETTINGS + COUNTS:
        if _integer(value[key]): out[key] = value[key]
    roles = ('observerClients', 'postgrestClients', 'authClients', 'storageClients',
             'sharedPlatformClients', 'otherClients')
    total = out['clientBackends']
    if not (_integer(total) and all(_integer(out[k]) for k in roles)
            and sum(out[k] for k in roles) == total):
        return out
    out['status'] = 'OBSERVED_CLIENT_CONNECTIONS_ONLY'
    maximum, special, reserved = (out[k] for k in SETTINGS[:3])
    if all(_integer(x) for x in (maximum, special, reserved)) and maximum >= special + reserved:
        out['freeNonReservedClientSlotsAtSample'] = max(0, maximum - special - reserved - total)
    states = ('activeClients', 'idleClients', 'idleTransactionClients', 'unknownStateClients')
    out['clientStateCoverageComplete'] = (all(_integer(out[k]) for k in states)
        and sum(out[k] for k in states) == total and out['unknownStateClients'] == 0)
    return out


def reference_snapshot(observation):
    """Budget comparison only. Never replace an existing run/approval/acceptance gate."""
    result = {'schema': 'helmut-w15-reference-component-budget-snapshot/1',
              'status': 'UNKNOWN_REFERENCE_COMPONENT_BUDGET', 'components': [],
              'actualProviderBytes': UNKNOWN, 'actualSystemSafetyReserveBytes': UNKNOWN,
              'cpuTimeParityWithMicro': UNKNOWN, 'pureApplicationConsumption': UNKNOWN,
              'executionAuthority': False, 'resourceContractAccepted': False,
              'legacyAcceptanceUnchanged': True, 'providerParityAccepted': False,
              'fullScenarioAccepted': False}
    if (type(observation) is not dict or type(observation.get('groups')) is not list
            or observation.get('schema') != 'helmut-w15-component-resource-observation/1'
            or observation.get('status') != 'OBSERVED_SEPARATE_CGROUP_COUNTERS_ONLY'
            or observation.get('executionAuthority') is not False
            or observation.get('resourceContractAccepted') is not False):
        return result
    proposal = load_contract()['referenceLabProposal']
    seen = set()
    for row in observation['groups']:
        if type(row) is not dict or row.get('declaredRole') not in ('application', 'database'):
            continue
        role = row['declaredRole']; instance = row.get('instanceId')
        if not (_integer(instance) and (instance > 0 if role == 'application' else instance == 0)):
            return result
        slot = (role, instance)
        status = UNKNOWN
        raw = row.get('observedKernel'); raw = raw if type(raw) is dict else {}
        memory = raw.get('memory'); memory = memory if type(memory) is dict else {}
        limits = proposal[role]
        cpu = raw.get('cpuMaximum'); cpu = cpu if type(cpu) is dict else {}
        events = raw.get('memoryEvents'); events = events if type(events) is dict else {}
        interval = row.get('cpuInterval'); interval = interval if type(interval) is dict else {}
        if slot not in seen and row.get('classifiedRole') == role and row.get('pidInventoryStable') is True \
                and _integer(row.get('uniqueObservedPids')) and row['uniqueObservedPids'] > 0:
            keys = ('currentBytes', 'kernelLifetimePeakBytes', 'maximumBytes', 'swapCurrentBytes', 'swapMaximumBytes')
            if all(_integer(memory.get(k)) for k in keys) and all(_integer(events.get(k)) for k in ('max','oom','oom_kill','oom_group_kill')) \
                    and all(_integer(cpu.get(k)) for k in ('quotaUsec','periodUsec')):
                status = 'REFERENCE_SNAPSHOT_FIT_ONLY' if (
                    memory['maximumBytes'] == limits['hardMemoryBytes']
                    and max(memory['currentBytes'], memory['kernelLifetimePeakBytes']) <= limits['maximumKernelPeakBytes']
                    and memory['swapCurrentBytes'] == memory['swapMaximumBytes'] == 0
                    and all(events[k] == 0 for k in ('max','oom','oom_kill','oom_group_kill'))
                    and cpu['quotaUsec'] == limits['quotaUsec'] and cpu['periodUsec'] == limits['periodUsec']
                    and interval.get('counterIdentityDrift') in ('UNKNOWN', 'NONE_OBSERVED')) \
                    else 'REFERENCE_SNAPSHOT_OUTSIDE_PROPOSAL'
        seen.add(slot)
        result['components'].append({'role': role, 'instanceId': slot[1], 'status': status})
    # Per-instance values remain separate. Missing roles/parent coverage cannot pass.
    if result['components'] and {'application','database'} <= {r['role'] for r in result['components']} \
            and all(r['status'] == 'REFERENCE_SNAPSHOT_FIT_ONLY' for r in result['components']) \
            and type(observation.get('unassignedParentProcessCount')) is int \
            and observation['unassignedParentProcessCount'] == 0 \
            and all(type(r) is dict and r.get('pidInventoryStable') is True
                    and r.get('declaredRole') in ('application', 'database', 'test-tools', 'backup')
                    and r.get('classifiedRole') == r.get('declaredRole') for r in observation['groups']):
        result['status'] = 'REFERENCE_CURRENT_SNAPSHOT_FIT_ONLY'
    return result


if __name__ == '__main__':
    if sys.argv[1:] not in ([], ['--plan']):
        raise SystemExit('REFERENCE_PLAN_ONLY_NO_EXECUTION')
    print(json.dumps(plan(), sort_keys=True))
