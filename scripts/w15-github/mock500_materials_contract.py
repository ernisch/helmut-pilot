"""One separately approved materials-only diagnostic, never a Mock500 verdict.

The existing dynamic host observer and original bindings remain mandatory.
The 18 minute worker deadline leaves two minutes for outer job cleanup; the
GitHub job itself has a hard 20 minute timeout. No unit/provider dispatch exists.
"""
import re

MODE = 'mock500-materials-diagnostic-gated'
SCOPE = 'ISOLATED_GITHUB_MOCK500_MATERIALS_DIAGNOSTIC_ONLY'
CONTRACT = 'helmut-w15-mock500-materials-diagnostic/1'
PROCESSING_SECONDS, WALL_SECONDS = 900, 1080
WORKER_STATUS = 'PASS_MATERIALS_DIAGNOSTIC_CLOSED_ONLY_NOT_MOCK500'
OUTER_STATUS = 'PASS_FRESH_MATERIALS_DIAGNOSTIC_OWNED_LIFETIME_ONLY'
KINDS = frozenset(('assertion', 'filesystem', 'module', 'sql', 'type', 'timeout', 'unknown'))
STAGES = frozenset(('entry', 'baseline', 'config', 'originals', 'qualified', 'original-upacket',
    'calendar', 'native-inputs', 'snapshot', 'native-manifest', 'activation', 'builder', 'output', 'complete'))


def need(value):
    if not value:
        raise ValueError('MATERIALS_DIAGNOSTIC_REJECTED')


def failure(value):
    """Only fixed source-check identifiers; no raw text, values or filenames."""
    need(type(value) is dict and set(value) == {'schema', 'category', 'kind', 'stage'})
    need(value['schema'] == 'helmut-w15-materials-first-failure/1'
         and type(value['kind']) is str and value['kind'] in KINDS
         and type(value['stage']) is str and value['stage'] in STAGES)
    category = value['category']
    need(type(category) is str and (category in ('MATERIALS_ENTRY_REJECTED', 'MATERIALS_PROCESS_REJECTED',
        'MATERIALS_PROCESS_TIMEOUT', 'MATERIALS_FAILURE_UNAVAILABLE') or
        re.fullmatch(r'MATERIALS_(?:MAIN|BINDING)_CHECK_(?:00[1-9]|0[1-9][0-9]|[1-9][0-9]{2}|10[01][0-9]|102[0-4])', category)))
    return dict(value)


def validate_result(value, manifest):
    keys = {'status', 'mode', 'exactCommit', 'runId', 'runAttempt', 'nonce', 'contract',
        'materialsCompleted', 'firstFailure', 'activeProfiles', 'profiles', 'units',
        'providerPhases', 'profileFieldsUnchanged', 'ownedContainerStopped', 'watchClosed',
        'evidence', 'executionAuthority', 'mock500Acceptance', 'end500Acceptance',
        'productionAcceptance', 'backupRoundtripVerified', 'retryAllowed'}
    need(type(value) is dict and set(value) == keys and value['status'] == WORKER_STATUS
         and manifest['mode'] == value['mode'] == MODE and value['contract'] == CONTRACT
         and all(value[k] == manifest[k] for k in ('exactCommit', 'runId', 'runAttempt', 'nonce')))
    need(type(value['materialsCompleted']) is bool
         and all(type(value[k]) is int and value[k] == v for k, v in
                 {'profiles': 500, 'activeProfiles': 0, 'units': 0, 'providerPhases': 0}.items())
         and all(value[k] is True for k in ('profileFieldsUnchanged', 'ownedContainerStopped', 'watchClosed'))
         and all(value[k] is False for k in ('executionAuthority', 'mock500Acceptance', 'end500Acceptance',
             'productionAcceptance', 'backupRoundtripVerified', 'retryAllowed')))
    if value['materialsCompleted']:
        need(value['firstFailure'] is None)
    else:
        failure(value['firstFailure'])
    evidence = value['evidence']
    evidence_keys={'schema','status','scope','artifactId','cipherBytes','cipherSHA256','retentionDays',
        'maximumStorageUSD','remoteReadbackObserved','authenticatedReadbackObserved','acceptedAsCompleteBackup',
        'mock500Acceptance','productionAcceptance','executionAuthority','retryAllowed'}
    need(type(evidence) is dict and set(evidence)==evidence_keys
         and evidence['schema']=='helmut-w15-materials-diagnostic-evidence/1'
         and evidence['status']=='PASS_PRIVATE_MATERIALS_EVIDENCE_ONLY'
         and type(evidence['artifactId'])is int and 0<evidence['artifactId']<2**63
         and type(evidence['cipherBytes'])is int and 0<evidence['cipherBytes']<=1048576
         and type(evidence['cipherSHA256'])is str and re.fullmatch('[a-f0-9]{64}',evidence['cipherSHA256'])
         and evidence.get('scope') == SCOPE
         and evidence.get('remoteReadbackObserved') is True
         and evidence.get('authenticatedReadbackObserved') is True
         and evidence.get('retentionDays') == 1 and type(evidence['retentionDays']) is int
         and evidence.get('maximumStorageUSD') == '0.05'
         and evidence.get('acceptedAsCompleteBackup') is False
         and all(evidence.get(k) is False for k in ('executionAuthority', 'mock500Acceptance',
             'productionAcceptance', 'retryAllowed')))
    return value
