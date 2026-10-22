"""Pure protocol/negative tests. Fake callbacks never execute SQL or prove a unit."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
import unittest

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent


def load():
    spec = importlib.util.spec_from_file_location('final_acceptance_offline', HERE / 'local-unit-native-final-acceptance.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class Fixture:
    def __init__(self):
        self.m = load(); self.calls = []
        self.operation = 'localUnitDiagnostic-' + 'a' * 32
        self.database = 'helmut_unit_diagnostic_' + 'a' * 32
        self.command = {'version': 'helmut-local-unit-diagnostic-command/1', 'mode': 'D-R-1-local-fixture',
            'limits': {'units': 1, 'production': False, 'paidProviderCallsAllowed': False},
            'units': [{'kind': 'DR', 'subject': 'test-kohorte-synthetik-bt-001'}], 'drafts': [{}],
            'slot': {'plan': {'operationId': self.operation, 'runId': 'nachlauf500-123456'}}, 'target': {'database': self.database}}
        self.selection = {'operationId': self.operation, 'commandHash': self.m._sha(self.m._canonical(self.command))}
        self.initial = {'proof': {'generation': '11111111-1111-1111-1111-111111111111', 'count': 1000,
            'head': digest('old logical head'), 'originalHash': digest('original logical usage')}, 'revision': '22222222-2222-2222-2222-222222222222'}
        self.process = {'pid': 7, 'startTicks': '123456', 'nspid': [9000, 7], 'pidNamespace': 'pid:[111]', 'hostPIDMapping': 'NOT_ESTABLISHED_BY_ENTRY'}
        self.terminal = {'schema': 'helmut-local-unit-native-entry-terminal/1', 'status': 'closed', 'selection': self.selection,
            'attemptPin': {'path': '/workspace/helmut-unit-diagnostic-native/' + 'a' * 32 + '/ATTEMPT_STARTED.SAFE.json', 'bytes': 1000, 'sha256': digest('VM attempt metadata')},
            'process': self.process, 'startedAtUTC': self.at(0), 'finishedAtUTC': self.at(23000),
            'timing': {'totalMonotonicMS': 24000, 'adapterElapsedMS': 23000},
            'result': {**self.selection, 'state': 'closed', 'sourceIndex': 499, 'diagnosticUnit': 0, 'units': 1,
                'completedUnits': 1, 'dispatchedUnits': 1, 'expectedPositions': 3, 'evidenceHash': digest('VM evidence metadata'),
                'independentFinalAcceptance': False, 'full500Accepted': False, 'production': False, 'paidProviderCallsAllowed': False, 'retryAllowed': False},
            'errors': [], 'memory': {}, 'unit60OrAuth30Acceptance': 'ADAPTER_AND_SQL_ONLY_NOT_ATTESTED_BY_ENTRY',
            'full500Accepted': False, 'independentFinalAcceptance': False, 'production': False, 'paidProviderCallsAllowed': False, 'retryAllowed': False}
        self.close = {'schema': 'helmut-local-unit-native-entry-process-close/1', 'selection': self.selection, 'process': self.process,
            'exitCode': 0, 'signal': None, 'stdoutEOF': True, 'stderrEOF': True,
            'terminalCanonicalSHA256': self.m._sha(self.m._canonical(self.terminal)), 'observedAtUTC': self.at(24000)}
        ack = {'version': 'helmut-local-unit-diagnostic-state-ack/1', 'scopeHash': self.selection['commandHash'], 'hash': digest('VM closed state'),
            'revision': 12, 'claimHash': digest('VM claim identity'), 'nonceSHA256': digest('VM final ACK nonce metadata'),
            'authorizationHash': digest('VM Auth30 metadata'), 'controlsHash': digest('VM16 controls metadata'), 'controlCount': 16}
        readback = {**{k: ack[k] for k in ('scopeHash', 'hash', 'revision', 'authorizationHash', 'controlsHash', 'controlCount')},
            'version': 'helmut-local-unit-diagnostic-state-witness/1', 'nonceSHA256': digest('VM state read nonce metadata'),
            'claimIdSHA256': ack['claimHash'], 'journalState': 'closed', 'journalIndex': 1, 'journalInFlightNull': True,
            'resultState': 'retained-unreviewed', 'evidenceHash': self.terminal['result']['evidenceHash']}
        records = []
        for i in range(19):
            kind = 'control-graph-4' if i < 16 else 'final-own-ack' if i == 16 else 'closed-state-readback'
            record = {'seq': i + 1, 'kind': kind, **{key: digest('VM ' + key + ' ' + str(i)) for key in
                ('requestNonceSHA256', 'requestBodySHA256', 'responseBodySHA256', 'attestationSHA256', 'envelopeSHA256', 'signatureSHA256')},
                'status': 200, 'timing': {}, 'io': {'upstreamRequestFinish': None if i == 16 else True,
                    'upstreamResponseEnd': None if i == 16 else True, 'upstreamMessageComplete': None if i == 16 else True,
                    'ownerSocketEnd': True if i == 16 else None, 'ownerSocketClose': True if i == 16 else None, 'downstreamFinish': True},
                'control': {'readNonceSHA256': digest('VM graph read ' + str(i))} if i < 16 else None,
                'ownAck': ack if i == 16 else None, 'readback': dict(readback, nonceSHA256=digest('VM closed read ' + str(i))) if i > 16 else None}
            for j, key in enumerate(('send', 'upstreamEnd', 'signed', 'finish')):
                ms = (i + 1) * 1000 + j * 10
                record['timing'][key + 'UTC'] = self.at(ms)
                record['timing'][key + 'Ns'] = str(900000000000000 + ms * 1000000)
            records.append(record)
        self.trace = {'schema': 'helmut-local-unit-native-control-read-trace/1',
            'header': {**self.selection, 'database': self.database, 'ownerPID': 10, 'ownerStartTicks': '123', 'pidNamespace': 'pid:[222]',
                'timeNamespace': 'time:[333]', 'clockDomain': {'schema': 'helmut-local-unit-monotonic-domain/1', 'kind': 'time-namespace',
                    'namespace': 'time:[333]', 'bootId': '01234567-89ab-4cde-8fab-0123456789ab'},
                'brokerCodeSHA256': digest('VM broker code'), 'trustSHA256': digest('VM trust'), 'sourceBindingSHA256': digest('VM source binding')},
            'records': records, 'footer': {'event': 'closed', 'recordCount': 19, 'controlCount': 16, 'finalAckCount': 1, 'closedReadbackCount': 2, 'complete': True}}

    @staticmethod
    def at(ms):
        return '2026-10-22T12:00:%02d.%03dZ' % (ms // 1000, ms % 1000)

    def summary(self):
        ack = self.trace['records'][16]['ownAck']
        return {'schema': 'helmut-local-unit-native-final-snapshot/1', 'selection': self.selection, 'database': self.database,
            'databaseOID': '18405', 'stateHash': ack['hash'], 'stateRevision': ack['revision'], 'evidenceHash': self.terminal['result']['evidenceHash'],
            'authorizationHash': ack['authorizationHash'], 'controlsHash': ack['controlsHash'], 'ownArtifactCount': 9,
            'originalResultRowCount': 7, 'positionCount': 3, 'controlCount': 16, 'freshGraphReadCount': 16, 'newUsageCount': 2,
            'initialUsageCount': self.initial['proof']['count'], 'finalUsageCount': self.initial['proof']['count'] + 2,
            'initialUsageHead': self.initial['proof']['head'], 'finalUsageHead': digest('VM final chain metadata'),
            'historicalLogicalPrefixUnchanged': True, 'finalACKAndReadbackBound': True, 'snapshotAtUTC': self.at(25000)}

    def query(self, database, sql, label):
        self.calls.append((database, sql, label)); return copy.deepcopy(self.summary())

    def run(self, callback=None):
        return self.m.final_acceptance(callback or self.query, command=self.command, expectedInitialUsageProof=self.initial,
            actualEntryTerminal=self.terminal, actualEntryProcessClose=self.close, controlReadTrace=self.trace)


class AcceptanceChecks(unittest.TestCase):
    def reject(self, f, callback=None):
        with self.assertRaisesRegex(f.m.FinalAcceptanceError, '^native-single-unit-final-acceptance-not-confirmed$'): f.run(callback)

    def test_single_snapshot_protocol_returns_only_metadata_and_no_product_or500_claim(self):
        f = Fixture(); result = f.run()
        self.assertEqual(len(f.calls), 1)
        self.assertEqual(f.calls[0][0], f.database)
        self.assertEqual(f.calls[0][2], 'FINAL_SINGLE_UNIT_READONLY_ACCEPTANCE')
        self.assertTrue(result['nativeSingleUnitAccepted'])
        self.assertFalse(result['independentProductAcceptance'] or result['full500Accepted'] or result['production'])
        self.assertEqual(result['snapshot']['ownArtifactCount'], 9)
        self.assertNotIn('commandCanonical', json.dumps(result))

    def test_generated_statement_is_readonly_snapshot_with_native_checks_and_no_mutator(self):
        f = Fixture(); f.run(); sql = f.calls[0][1]
        self.assertTrue(sql.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'))
        self.assertTrue(sql.endswith('ROLLBACK;\n'))
        self.assertNotRegex(sql, r'(?i)\b(?:create|insert|update|delete|truncate|copy|commit)\b')
        self.assertNotRegex(sql, r'@[A-Z_]+@')
        self.assertIn('PERFORM helmut_unit_diagnostic.validate_state', sql)
        self.assertIn('PERFORM helmut_unit_diagnostic.original_bridge_result_v1', sql)
        self.assertIn('public.helmut_auth_usage_checked_proof_local_v1', sql)

    def test_closed_database_cannot_heal_lost_ack_failed_entry_or_missing_eof(self):
        for key, value in [('exitCode', 1), ('signal', 'SIGKILL'), ('stdoutEOF', False), ('stderrEOF', False),
                           ('terminalCanonicalSHA256', digest('different terminal'))]:
            f = Fixture(); f.close[key] = value; self.reject(f); self.assertEqual(f.calls, [])
        f = Fixture(); f.terminal['status'] = 'failed'; self.reject(f); self.assertEqual(f.calls, [])
        f = Fixture(); f.terminal['result']['state'] = 'unknown'; self.reject(f); self.assertEqual(f.calls, [])

    def test_unit_monotonic_limits_and_actual_terminal_binding_fail_closed(self):
        for value in (60000, 60001, float('nan'), -1, True):
            f = Fixture(); f.terminal['timing']['adapterElapsedMS'] = value; self.reject(f); self.assertEqual(f.calls, [])
        f = Fixture(); f.close['process'] = {**f.process, 'startTicks': '999'}; self.reject(f)

    def test_exact19_records_required_and_no_missing_second_closed_readback(self):
        for index in (0, 16, 18):
            f = Fixture(); f.trace['records'].pop(index); self.reject(f); self.assertEqual(f.calls, [])
        f = Fixture(); f.trace['records'].append(copy.deepcopy(f.trace['records'][-1])); self.reject(f)

    def test_replay_reorder_extra_field_and_unfinished_transport_fail_before_sql(self):
        for mutation in ('replay', 'reorder', 'extra', 'finish', 'httpEnd', 'ownerEnd', 'footer'):
            f = Fixture()
            if mutation == 'replay': f.trace['records'][1]['control'] = copy.deepcopy(f.trace['records'][0]['control'])
            elif mutation == 'reorder': f.trace['records'][0], f.trace['records'][1] = f.trace['records'][1], f.trace['records'][0]
            elif mutation == 'extra': f.trace['records'][0]['readNonce'] = 'VM forbidden raw metadata'
            elif mutation == 'finish': f.trace['records'][0]['io']['downstreamFinish'] = False
            elif mutation == 'httpEnd': f.trace['records'][0]['io']['upstreamResponseEnd'] = False
            elif mutation == 'ownerEnd': f.trace['records'][16]['io']['ownerSocketEnd'] = False
            else: f.trace['footer']['complete'] = False
            self.reject(f); self.assertEqual(f.calls, [])

    def test_real_final_ack_and_both_readbacks_must_match_state_claim_and_verification(self):
        for key, value in [('hash', digest('other state')), ('revision', 13), ('claimIdSHA256', digest('other claim')),
                           ('authorizationHash', digest('other auth')), ('controlsHash', digest('other controls')), ('controlCount', 15)]:
            f = Fixture(); f.trace['records'][18]['readback'][key] = value; self.reject(f); self.assertEqual(f.calls, [])
        f = Fixture(); f.trace['records'][17]['timing']['sendNs'] = f.trace['records'][16]['timing']['finishNs']; self.reject(f)

    def test_absolute_owner_clock_span_cannot_hide_a_minute_behind_short_utc_times(self):
        f = Fixture(); f.trace['records'][-1]['timing']['finishNs'] = str(int(f.trace['records'][0]['timing']['sendNs']) + 60000000000)
        self.reject(f); self.assertEqual(f.calls, [])

    def test_absent_kernel_time_namespace_has_exact_domain_and_same_acceptance_checks(self):
        f = Fixture()
        f.trace['header']['timeNamespace'] = None
        f.trace['header']['clockDomain'].update(kind='kernel-without-time-namespaces', namespace=None)
        result = f.run()
        self.assertTrue(result['nativeSingleUnitAccepted'])
        self.assertFalse(result['full500Accepted'])
        self.assertEqual(len(f.calls), 1)
        # Unsupported time namespaces do not extend any monotonic deadline.
        for mutation in ('ownerSpan', 'unitSpan', 'missingEOF'):
            f = Fixture()
            f.trace['header']['timeNamespace'] = None
            f.trace['header']['clockDomain'].update(kind='kernel-without-time-namespaces', namespace=None)
            if mutation == 'ownerSpan':
                f.trace['records'][-1]['timing']['finishNs'] = str(int(f.trace['records'][0]['timing']['sendNs']) + 60000000000)
            elif mutation == 'unitSpan':
                f.terminal['timing']['adapterElapsedMS'] = 60000
            else:
                f.close['stderrEOF'] = False
            self.reject(f)
            self.assertEqual(f.calls, [])

    def test_clock_domain_wrong_modes_namespace_inconsistency_or_bad_boot_fail_before_sql(self):
        changes = [lambda h: h.pop('clockDomain'), lambda h: h.update(clockDomain=None),
                   lambda h: h['clockDomain'].update(extra=True),
                   lambda h: h['clockDomain'].update(schema='unsupported-schema'),
                   lambda h: h['clockDomain'].update(kind='kernel-global'),
                   lambda h: h['clockDomain'].update(kind='time-namespace', namespace=None),
                   lambda h: h['clockDomain'].update(kind='kernel-without-time-namespaces'),
                   lambda h: h.update(timeNamespace=None),
                   lambda h: h['clockDomain'].update(namespace='time:[999]'),
                   lambda h: h['clockDomain'].update(namespace='time:[0]'),
                   lambda h: h['clockDomain'].update(namespace='time:[333]\n'),
                   lambda h: h['clockDomain'].update(namespace='pid:[333]')]
        for boot in (None, True, '', 'invalid', '01234567-89AB-4cde-8fab-0123456789ab',
                     '01234567-89ab-4cde-8fab-0123456789ab\n'):
            changes.append(lambda h, boot=boot: h['clockDomain'].update(bootId=boot))
        for change in changes:
            f = Fixture(); change(f.trace['header']); self.reject(f)
            self.assertEqual(f.calls, [])

    def test_kernel_domain_cannot_be_combined_with_invented_namespace(self):
        for namespace in ('time:[333]', 'pid:[333]', False, 0, {}, []):
            f = Fixture()
            f.trace['header']['clockDomain'].update(kind='kernel-without-time-namespaces', namespace=None)
            f.trace['header']['timeNamespace'] = namespace
            self.reject(f); self.assertEqual(f.calls, [])

    def test_snapshot_failure_or_incomplete_result_never_becomes_acceptance(self):
        for key, value in [('ownArtifactCount', 8), ('originalResultRowCount', 6), ('positionCount', 2), ('controlCount', 15),
                           ('newUsageCount', 1), ('finalUsageCount', 1001), ('historicalLogicalPrefixUnchanged', False),
                           ('finalACKAndReadbackBound', False), ('stateRevision', 13), ('evidenceHash', digest('other evidence'))]:
            f = Fixture()
            def bad(db, sql, label):
                result = f.query(db, sql, label); result[key] = value; return result
            self.reject(f, bad); self.assertEqual(len(f.calls), 1)

    def test_unknown_sql_outcome_duplicate_json_and_error_details_are_not_accepted(self):
        f = Fixture()
        def unknown(*_): raise RuntimeError('private native error details')
        self.reject(f, unknown)
        for raw in ('{"schema":1,"schema":2}', '{"schema":NaN}', ' ' * 16385):
            f = Fixture(); self.reject(f, lambda *_: raw)

    def test_callback_dictionary_is_snapshotted_before_returning_public_metadata(self):
        f = Fixture(); retained = f.summary(); result = f.run(lambda *_: retained)
        retained['ownArtifactCount'] = 0; retained['selection']['commandHash'] = digest('changed callback object')
        self.assertEqual(result['snapshot']['ownArtifactCount'], 9)
        self.assertNotEqual(result['snapshot']['selection']['commandHash'], retained['selection']['commandHash'])

    def test_payload_quoting_cannot_introduce_a_second_statement(self):
        f = Fixture(); args = {'commandCanonical': "';DROP TABLE impossible;--", 'vmOnly': True}
        sql = f.m._sql(args)
        self.assertNotIn(args['commandCanonical'], sql)
        encoded = re.search(r"decode\('([A-Za-z0-9+/=]+)','base64'\)", sql)[1]
        import base64
        self.assertEqual(json.loads(base64.b64decode(encoded)), args)

    def test_initial_proof_is_an_actual_four_field_chain_proof_not_an_acceptance_flag(self):
        for mutation in ('missingHead', 'negativeCount', 'boolCount', 'extraFlag'):
            f = Fixture()
            if mutation == 'missingHead': f.initial['proof'].pop('head')
            elif mutation == 'negativeCount': f.initial['proof']['count'] = -1
            elif mutation == 'boolCount': f.initial['proof']['count'] = True
            else: f.initial['proof']['qualified'] = True
            self.reject(f); self.assertEqual(f.calls, [])


if __name__ == '__main__':
    unittest.main()
