"""One original-free synthetic capacity diagnostic, never an old W15 start gate.

Only the outside GitHub launcher prepares the existing common parent.  Its fresh
tools service starts this module before imports.  A stopped shell is bound by
host PID/starttime and cgroup identity before it execs the actual Node workload.
No entry point runs on import.  Tests use invented observations only.
"""
import sys
sys.dont_write_bytecode = True

import argparse
import base64
import datetime
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import re
import select
import signal
import stat
import subprocess
import time
import uuid

HERE = Path(__file__).absolute().parent
REPO = HERE.parents[1]
REF = 'refs/heads/codex/mock100-local-20261105'
SCOPE = 'ORIGINAL_FREE_SYNTHETIC_100_MOCK_ONLY'
SMALL_SCOPE = 'ORIGINAL_FREE_SYNTHETIC_3_PROFILE_CONNECTION_QUALIFICATION_ONLY'
SMALL_COUNT = 3  # One actual BT, BE and BB profile before the sole 500 cohort.
SCHEMA = 'helmut-mock100-request/1'
APP_HARD, DB_HARD, HOST_HARD, HOST_RESERVE = 1999998976, 948191232, 4999999488, 2147483648
WALL, DISK, MAX_OUTPUT = 1800, 536870912, 2 * 1024 * 1024
WORK_SECONDS = WALL - 180  # Reserve owned stop/readback within the total wall contract.
RECEIPT_MAX = 65536
WORKLOAD_SCHEMA = 'helmut-synthetic100-mock/1'
WORKLOAD_PHASES = frozenset(('configuration','prepare-database','services','dataset','provision',
    'activate','understanding','work','readback','deactivate','closed'))
PROGRESS_OPERATIONS = frozenset(('idle','profile-provision','profile-activation','active-cohort-readback',
    'source-save','understand','match','decide','briefing-build','briefing-store','full-readback',
    'profile-deactivation','lage-generate','closed'))
ASSERTIONS = frozenset(('diagnostic-native-vector-bootstrap-required','diagnostic-native-vector-version-required','diagnostic-native-postgres-version-required','diagnostic-fresh-database-required','diagnostic-ca-required-before-node-start',
    'diagnostic-stop-or-deadline','diagnostic-exact-active-cohort-required','diagnostic-initial-zero-required',
    'diagnostic-provision-refused','diagnostic-positive-native-understanding-required','diagnostic-native-matches-required',
    'diagnostic-native-decisions-required','diagnostic-positive-current-briefing-required',
    'diagnostic-cleanup-only-newly-owned-profiles','diagnostic-local-preload-required',
    'diagnostic-synthetic-profile-selector-required','diagnostic-required-schema-migration-missing',
    'diagnostic-schema-migration-list-unique','diagnostic-mock-schema-required',
    'diagnostic-one-explicit-case','diagnostic-mock-case-binding','diagnostic-mock-current-understanding-schema','UNKNOWN'))
ASSERTIONS = ASSERTIONS | frozenset(('diagnostic-mock-profile-binding','diagnostic-three-native-slots-required','diagnostic-native-output-binding','diagnostic-native-source-binding','diagnostic-native-receipt-binding','diagnostic-complete-app-package-required','diagnostic-exact-model-phases-required','diagnostic-five-output-categories-required'))
NODE_CODES = frozenset(('ERR_ASSERTION','MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND','EACCES','EPERM','ENOENT',
    'EEXIST','ECONNREFUSED','ETIMEDOUT','EPIPE','ENOTFOUND','ECONNRESET','UNKNOWN'))
NODE_CODES = NODE_CODES | frozenset(['LLM_USAGE_NOT_CONFIRMED', 'AI_REQUEST_TIMEOUT', 'AI_REQUEST_SEND_ERROR', 'AI_RESPONSE_TOO_LARGE', 'AI_RESPONSE_ABORTED', 'AI_RESPONSE_STREAM_ERROR', 'AI_RESPONSE_INVALID_JSON', 'AI_RESPONSE_NOT_COMPLETED', 'AI_REQUEST_BUILD_FAILED', 'AI_TLS_ERROR', 'AI_PROVIDER_HTTP_4XX', 'AI_PROVIDER_HTTP_5XX', 'AI_PROVIDER_HTTP_400', 'AI_PROVIDER_HTTP_401', 'AI_PROVIDER_HTTP_403', 'AI_PROVIDER_HTTP_404', 'AI_PROVIDER_HTTP_408', 'AI_PROVIDER_HTTP_422', 'AI_PROVIDER_HTTP_429', 'AI_PROVIDER_HTTP_500', 'AI_PROVIDER_HTTP_502', 'AI_PROVIDER_HTTP_503', 'AI_PROVIDER_HTTP_504'])
NODE_CODES = NODE_CODES | frozenset(['LAGE_AI_TEXT_PARAGRAPH_COUNT', 'LAGE_AI_TEXT_EMPTY_OR_TYPE', 'LAGE_AI_TEXT_SOURCE_REFERENCE', 'LAGE_AI_TEXT_PROFILE_REFERENCE', 'LAGE_AI_TEXT_AUSWAHLBEGRUENDUNG', 'LAGE_AI_TEXT_VISIBLE_ID', 'LAGE_AI_TEXT_WORD_LIMIT', 'LAGE_AI_COST_RECEIPT_MISSING', 'LAGE_AI_RESPONSE_INCOMPLETE', 'LAGE_AI_RESPONSE_INVALID_JSON', 'LAGE_AI_PROVIDER_UNAVAILABLE', 'LAGE_BUDGET', 'LAGE_STORE_ERROR', 'LAGE_NO_VORGAENGE', 'LAGE_NO_SOURCES', 'LAGE_NO_AI', 'LAGE_AI_ERROR', 'LAGE_EXISTING_RESULT', 'LAGE_NO_CURRENT_SOURCES', 'LAGE_GENERATING', 'LAGE_AI_UNAVAILABLE', 'LAGE_AI_TEXT_SOURCE_SUPPORT', 'LAGE_AI_TEXT_QUALITY_INCOMPLETE', 'LAGE_AI_TEXT_EVIDENCE_QUOTE', 'LAGE_AI_TEXT_REPETITION', 'LAGE_AI_EMPTY', 'LAGE_AI_INVALID', 'LAGE_LOCK_BUSY', 'LAGE_AI_PROVIDER_HTTP_400', 'LAGE_AI_PROVIDER_HTTP_401', 'LAGE_AI_PROVIDER_HTTP_403', 'LAGE_AI_PROVIDER_HTTP_404', 'LAGE_AI_PROVIDER_HTTP_408', 'LAGE_AI_PROVIDER_HTTP_422', 'LAGE_AI_PROVIDER_HTTP_429', 'LAGE_AI_PROVIDER_HTTP_500', 'LAGE_AI_PROVIDER_HTTP_502', 'LAGE_AI_PROVIDER_HTTP_503', 'LAGE_AI_PROVIDER_HTTP_504'])
ASSERTIONS = ASSERTIONS | frozenset(['diagnostic-ca-required-before-node-start', 'diagnostic-cleanup-only-newly-owned-profiles', 'diagnostic-complete-app-package-required', 'diagnostic-exact-active-cohort-required', 'diagnostic-exact-model-phases-required', 'diagnostic-five-output-categories-required', 'diagnostic-fresh-database-required', 'diagnostic-initial-zero-required', 'diagnostic-local-preload-required', 'diagnostic-mock-case-binding', 'diagnostic-mock-current-understanding-schema', 'diagnostic-mock-profile-binding', 'diagnostic-mock-schema-required', 'diagnostic-native-decisions-required', 'diagnostic-native-matches-required', 'diagnostic-native-output-binding', 'diagnostic-native-postgres-version-required', 'diagnostic-native-receipt-binding', 'diagnostic-native-source-binding', 'diagnostic-native-vector-bootstrap-required', 'diagnostic-native-vector-version-required', 'diagnostic-one-explicit-case', 'diagnostic-positive-current-briefing-required', 'diagnostic-positive-native-lage-required', 'diagnostic-positive-native-understanding-required', 'diagnostic-provision-refused', 'diagnostic-required-schema-migration-missing', 'diagnostic-schema-migration-list-unique', 'diagnostic-stop-or-deadline', 'diagnostic-synthetic-profile-selector-required', 'diagnostic-three-native-slots-required'])
SQLSTATES = frozenset(('42P01','42703','42883','42501','23505','23503','3D000','28P01','57014',
    '22023','42601','XX000','08006','UNKNOWN'))
BASE = '/tmp/helmut-public-resource-diagnostic'
WORKLOAD = 'scripts/synthetik-500-resource-diagnostic.js'
BOUND_SHELL = ('umask 077; printf "W15_DIAG_CHILD_READY %s\\n" "$$"; '
               'IFS= read -r answer; [ "$answer" = GO ] || exit 79; '
               'log=$1; shift; exec "$@" >"$log" 2>&1')
ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
       'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1',
       'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_TERMINAL_PROMPT':'0','GIT_OPTIONAL_LOCKS':'0'}
PHASES = frozenset(('binding', 'parent', 'tools-start', 'staging', 'groups', 'database',
    'schema', 'postgrest', 'services', 'barrier', 'preflight-small', 'mock100', 'closure'))


def load(name):
    spec = importlib.util.spec_from_file_location('public_resource_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


P = load('runner_parent')
C = load('component_resource_meter')
ROLES = load('end500_capacity_roles')
S = load('separated_resources')


class Rejected(RuntimeError):
    def __init__(self, phase, code='CHECK_REJECTED'):
        self.phase = phase if phase in PHASES else 'binding'
        self.code = code
        super().__init__('SYNTHETIC_RESOURCE_DIAGNOSTIC_REJECTED')


def need(value, phase='binding', code='CHECK_REJECTED'):
    if not value: raise Rejected(phase, code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')


def decode(raw):
    def unique(rows):
        result = {}
        for key, value in rows:
            need(key not in result); result[key] = value
        return result
    need(type(raw) in (str, bytes) and len(raw) <= MAX_OUTPUT)
    return json.loads(raw, object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(Rejected('binding')))


def validate_request(value, expected, environment, *, preflight=False):
    keys = {'schema', 'scope', 'expectedCommit', 'nonce', 'profiles', 'attempt', 'maxSeconds'}
    scope, profiles = (SMALL_SCOPE, SMALL_COUNT) if preflight else (SCOPE, 100)
    need(type(value) is dict and set(value) == keys and value['schema'] == SCHEMA and value['scope'] == scope)
    need(type(expected) is str and re.fullmatch('[a-f0-9]{40}', expected)
         and value['expectedCommit'] == expected == environment.get('EXPECTED_COMMIT'))
    for key, wanted in (('profiles', profiles), ('attempt', 1), ('maxSeconds', WALL)):
        need(type(value[key]) is int and value[key] == wanted)
    n = uuid.UUID(value['nonce']); need(str(n) == value['nonce'] and n.version == 4 and n.variant == uuid.RFC_4122)
    need(environment.get('GITHUB_ACTIONS') == 'true' and environment.get('GITHUB_SHA') == expected
         and environment.get('GITHUB_RUN_ATTEMPT') == '1')
    if preflight:
        event, ref = environment.get('GITHUB_EVENT_NAME'), environment.get('GITHUB_REF','')
        need((event == 'pull_request' and re.fullmatch(r'refs/pull/[1-9][0-9]*/merge',ref)
              and re.fullmatch(r'[A-Za-z0-9_./-]{1,200}',environment.get('GITHUB_HEAD_REF','')))
             or (event == 'push' and ref == 'refs/heads/main')
             or (event == 'workflow_dispatch' and ref == REF))
    else:
        need(environment.get('GITHUB_EVENT_NAME') == 'workflow_dispatch' and environment.get('GITHUB_REF') == REF)
    ctx = P.context(environment.get('GITHUB_RUN_ID'), expected, str(n)); ctx['capacityDiagnostic'] = True
    return ctx


def private_json(path, value):
    path = Path(path)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        raw = canonical(value) + b'\n'; need(os.write(fd, raw) == len(raw)); os.fsync(fd)
    finally: os.close(fd)


def read_private(path, maximum=MAX_OUTPUT, allowed_owner=None):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600
             and before.st_uid in (0, 1000, os.getuid(), allowed_owner) and before.st_size <= maximum)
        raw = os.read(fd, maximum + 1); after = os.fstat(fd)
        need(len(raw) <= maximum and (before.st_size, before.st_mtime_ns, before.st_ctime_ns)
             == (after.st_size, after.st_mtime_ns, after.st_ctime_ns))
        return decode(raw)
    finally: os.close(fd)


def blob_bound(relative, expected):
    file = REPO / relative
    row = subprocess.check_output(['/usr/bin/git', '--no-optional-locks',
        '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
        '-c', 'safe.directory=' + str(REPO), '-C', str(REPO), 'ls-tree', '-z', expected, '--', relative], env=ENV)
    header, name = row.rstrip(b'\0').split(b'\t'); mode, kind, oid = header.split()
    raw = file.read_bytes()
    need(name.decode() == relative and mode in (b'100644', b'100755') and kind == b'blob' and not file.is_symlink()
         and hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest().encode() == oid)


def unit_names(ctx):
    parent = P.names(ctx)[0]; stem = parent[:-6]
    return {'application': stem + '-application.slice', 'database': stem + '-database.slice',
            'tools': stem + '_diagnostic_tools.service'}


def unit_bytes(role):
    need(role in ('application', 'database'), 'groups')
    cap = APP_HARD if role == 'application' else DB_HARD
    return ('[Unit]\nDescription=Owned original-free diagnostic component\n[Slice]\n'
            'MemoryAccounting=yes\nMemoryMax=' + str(cap) + '\nMemorySwapMax=0\n'
            'CPUAccounting=yes\nCPUQuota=100%\nCPUQuotaPeriodSec=100ms\n').encode()


def group_fit(raw, hard):
    try:
        memory, cpu, events = raw['memory'], raw['cpuMaximum'], raw['memoryEvents']
        integers = [memory[k] for k in ('currentBytes', 'kernelLifetimePeakBytes', 'maximumBytes', 'swapCurrentBytes', 'swapMaximumBytes')]
        integers += [events[k] for k in ('max', 'oom', 'oom_kill', 'oom_group_kill')]
        need(all(type(x) is int and 0 <= x <= 2**53 - 1 for x in integers), 'groups', 'UNKNOWN_GROUP_READBACK')
        need(memory['maximumBytes'] == hard and max(memory['currentBytes'], memory['kernelLifetimePeakBytes']) <= hard
             and memory['swapCurrentBytes'] == memory['swapMaximumBytes'] == 0
             and all(events[k] == 0 for k in ('max', 'oom', 'oom_kill', 'oom_group_kill'))
             and cpu == {'quotaUsec': 100000, 'periodUsec': 100000}, 'groups', 'COMPONENT_LIMIT_OR_EVENT')
        return True
    except (KeyError, TypeError): raise Rejected('groups', 'UNKNOWN_GROUP_READBACK') from None


def jwt_token(secret, expires, nonce):
    enc = lambda b: base64.urlsafe_b64encode(b).rstrip(b'=')
    head = enc(canonical({'alg': 'HS256', 'typ': 'JWT'}))
    body = enc(canonical({'role': 'service_role', 'exp': expires, 'resourceDiagnosticNonce': nonce,
                          'iss': 'isolated-public-synthetic-fixture'}))
    return (head + b'.' + body + b'.' + enc(hmac.new(secret.encode(), head + b'.' + body, hashlib.sha256).digest())).decode()


CODEPOINT_MODULES=frozenset(['scripts/synthetik-500-resource-diagnostic.js', 'scripts/fixtures/resource500-diagnostic.js', 'lib/helmut/lage.js', 'lib/helmut/ai.js', 'lib/helmut/storage.js', 'lib/helmut/briefing-speicher.js', 'lib/helmut/morgenversorgung.js', 'lib/helmut/briefing-lauf.js', 'lib/helmut/understanding.js'])
CODEPOINT_SYMBOLS=frozenset(['workload', 'verifyProfileRows', 'configuration', 'services', 'production', 'check', 'observed', 'Object.workload', 'Object.configuration', 'Object.verifyProfileRows', 'Object.response', 'Object.storeResult', 'Object.audit', 'Object.generateLage', 'response', 'lageResponse', 'requestContext', 'buildLageBriefing', 'generateLageBriefing', 'materialisiere', 'pruefeZeile', 'speicherePaket', 'schreibeQuittung'])

def codepoint(value):
    if value is None:return None
    if not (type(value) is dict and set(value)=={"module","function","line"}):return None
    if not (type(value["module"]) is str and type(value["function"]) is str
            and value["module"] in CODEPOINT_MODULES and value["function"] in CODEPOINT_SYMBOLS
            and type(value["line"]) is int and 1<=value["line"]<=99999):return None
    return dict(value)

def failure_detail(value):
    if value is None: return None
    need(type(value) is dict and set(value) in ({'assertion','code','sqlstate','nativeStatus'},{'assertion','code','sqlstate','nativeStatus','codepoint'}))
    need(value['assertion'] in ASSERTIONS and value['code'] in NODE_CODES and value['sqlstate'] in SQLSTATES
         and value['nativeStatus'] in ('saved', 'skipped', 'failed', 'disabled', 'unknown', 'duplicate', 'merged', 'skipped-artikelkontext', 'skipped-ausgang-unbekannt', 'skipped-bestandslesefehler', 'skipped-budget', 'skipped-cluster-belegt', 'skipped-error', 'skipped-failed', 'skipped-gate-geparkt', 'skipped-invalid', 'skipped-modellstart-unklar', 'skipped-no-cluster', 'skipped-no-vorgang', 'skipped-production-admission', 'skipped-store', 'skipped-terminal', 'skipped-update-final', 'skipped-veraltet', 'skipped-zeitbudget'))
    return {**value,"codepoint":codepoint(value.get("codepoint"))}


def workload_result(value, nonce, count):
    """Only bound counters/hashes cross the private workload/report boundary."""
    keys = {'schema','nonce','status','firstFailurePhase','firstFailureDetail','cleanupFailureDetail',
        'requestedProfiles','provisionedProfiles','positiveProfileResults','activeCohortReadbacks','understoodCases',
        'finalActiveProfiles','simulatedProviderOnly','originalDataUsed','formal1500Acceptance','end500Acceptance',
        'mock500Acceptance','productionProof','professionalAcceptance','executionAuthority','retryAllowed',
        'outputPositions','outputKinds','modelPhases','nativeAuditSHA256','acknowledgedResultsSHA256','tenantGuardChecks',
        'confirmedCountsOnly','nativeObserved','outputErrors'}
    need(type(value) is dict and set(value) == keys and value['schema'] == WORKLOAD_SCHEMA and value['nonce'] == nonce)
    passed = 'PASS_MOCK100_RUNTIME' if count == 100 else 'PASS_MOCK100_PREFLIGHT'
    need(value['status'] in (passed,'FAIL_OR_UNKNOWN_DIAGNOSTIC'))
    need(value['firstFailurePhase'] is None or value['firstFailurePhase'] in WORKLOAD_PHASES)
    for key in ('requestedProfiles','provisionedProfiles','positiveProfileResults','activeCohortReadbacks','understoodCases','outputPositions','tenantGuardChecks'):
        need(type(value[key]) is int and 0 <= value[key] <= 10000)
    need(value['requestedProfiles'] == count and value['simulatedProviderOnly'] is True
         and all(value[k] is False for k in ('originalDataUsed','formal1500Acceptance','end500Acceptance',
             'mock500Acceptance','productionProof','professionalAcceptance','executionAuthority','retryAllowed')))
    need(value['finalActiveProfiles'] == 'UNKNOWN' or type(value['finalActiveProfiles']) is int and value['finalActiveProfiles'] >= 0)
    first=failure_detail(value['firstFailureDetail']); cleanup=failure_detail(value['cleanupFailureDetail'])
    need(value['confirmedCountsOnly'] is True)
    errors=value['outputErrors']; native=value['nativeObserved']
    need(errors is None or type(errors) is dict and set(errors)=={'missing','empty','duplicate','technicallyInvalid','unusable'}
         and all(type(n) is int and 0<=n<=10000 for n in errors.values()))
    need(native is None or type(native) is dict and set(native)=={'positions','usage','understanding','entwurf','pruefung'}
         and all(type(n) is int and 0<=n<=10000 for n in native.values()))
    positive=value['positiveProfileResults']
    need(type(value['outputKinds']) is dict and set(value['outputKinds'])=={'mandatsbriefing','lage','morgenlageReceipt'}
         and all(type(v) is int and v==positive for v in value['outputKinds'].values())
         and value['outputPositions']==positive*3 and value['tenantGuardChecks']==positive*4)
    need(type(value['modelPhases']) is dict and set(value['modelPhases'])=={'understanding','entwurf','pruefung'}
         and all(type(v) is int and v>=0 for v in value['modelPhases'].values())
         and value['modelPhases']=={'understanding':value['understoodCases'],'entwurf':positive,'pruefung':positive})
    for key in ('nativeAuditSHA256','acknowledgedResultsSHA256'):
        need(value[key] is None or type(value[key]) is str and re.fullmatch('[a-f0-9]{64}',value[key]))
    if value['status'] == passed:
        need(value['firstFailurePhase'] is None and value['firstFailureDetail'] is None and value['cleanupFailureDetail'] is None
             and value['provisionedProfiles'] == positive == count
             and value['activeCohortReadbacks'] >= count and value['understoodCases'] > 0
             and value['finalActiveProfiles'] == 0 and value['nativeAuditSHA256'] is not None
             and value['acknowledgedResultsSHA256'] is not None and errors is not None and all(n==0 for n in errors.values())
             and native=={'positions':3*count,'usage':value['understoodCases']+2*count,
                          'understanding':value['understoodCases'],'entwurf':count,'pruefung':count})
    return {**value,"firstFailureDetail":first,"cleanupFailureDetail":cleanup}


def workload_progress(value, nonce, count):
    """A last observed partial frame is never an APP_RESULT or a completion proof."""
    counters = {'provisionedProfiles':count, 'activatedProfiles':count,
        'activeCohortReadbacks':10000, 'sourceDocumentsSaved':12 if count==SMALL_COUNT else 384,
        'understoodCases':SMALL_COUNT if count==SMALL_COUNT else 96, 'matchingProfiles':count,
        'decisionProfiles':count, 'positiveProfileResults':count, 'deactivatedProfiles':count}
    keys = {'schema','nonce','requestedProfiles','sequence','phase','operation','finalActiveProfiles'} | set(counters)
    need(type(value) is dict and set(value)==keys and value['schema']==WORKLOAD_SCHEMA
         and value['nonce']==nonce and type(value['requestedProfiles']) is int
         and value['requestedProfiles']==count, 'closure', 'WORKLOAD_PROGRESS_SCHEMA')
    need(type(value['sequence']) is int and 1<=value['sequence']<=10000
         and value['phase'] in WORKLOAD_PHASES and value['operation'] in PROGRESS_OPERATIONS,
         'closure','WORKLOAD_PROGRESS_SCHEMA')
    for key,maximum in counters.items():
        need(type(value[key]) is int and 0<=value[key]<=maximum, 'closure','WORKLOAD_PROGRESS_SCHEMA')
    need(value['positiveProfileResults']<=value['decisionProfiles']<=value['matchingProfiles']<=count
         and value['deactivatedProfiles']<=value['activatedProfiles']<=value['provisionedProfiles']
         and (value['finalActiveProfiles']=='UNKNOWN' or type(value['finalActiveProfiles']) is int
              and value['finalActiveProfiles']==0), 'closure','WORKLOAD_PROGRESS_SCHEMA')
    return dict(value)


def request_for_preflight(expected):
    return {'schema':SCHEMA,'scope':SMALL_SCOPE,'expectedCommit':expected,'nonce':str(uuid.uuid4()),
            'profiles':SMALL_COUNT,'attempt':1,'maxSeconds':WALL}


def dataset_result(value, epoch, count):
    """Publish aggregate invented-fixture coverage, never source document text."""
    need(type(value) is dict and value.get('schema')=='helmut-mock100-synthetic-dataset/1'
        and value.get('syntheticOnly') is True and value.get('originalEquivalent') is False
        and value.get('epoch')==epoch and value.get('profileCount')==count
        and all(value.get(k) is False for k in ('originalQualificationClaimed','professionalAcceptance','productionProof')))
    selectors=value.get('fixtureRequiredSelectors')
    need(selectors=={'politicalLevels':['bund','land'],'geographyIDs':['geo-bund','geo-land-berlin','geo-land-brandenburg'],
        'preflightProfileIndices':[0,330,450],'profileSelectorCoverage':count})
    need(value.get('profileDistribution')==({'bundestag':66,'berlin':24,'brandenburg':10} if count==100 else {'bundestag':1,'berlin':1,'brandenburg':1}))
    expected_cases=SMALL_COUNT if count==SMALL_COUNT else 96
    need(value.get('caseCount')==96 and value.get('sourceDocumentCount')==384
        and value.get('executedProfileCount')==count and value.get('executedCaseCount')==expected_cases
        and value.get('executedSourceCount')==expected_cases*4)
    for key in ('sourceTextBytes','minimumSourceTextBytes','maximumSourceTextBytes'):
        need(type(value.get(key)) is int and 0<value[key]<1000000000)
    for key in ('sourceDatasetSHA256','profileSpecsSHA256'):
        need(type(value.get(key)) is str and re.fullmatch('[a-f0-9]{64}',value[key]))
    keys=('schema','syntheticOnly','originalEquivalent','epoch','profileCount','caseCount','sourceDocumentCount',
        'profileDistribution','sourceTextBytes','minimumSourceTextBytes','maximumSourceTextBytes','executedProfileCount','executedCaseCount',
        'executedSourceCount','sourceDatasetSHA256','profileSpecsSHA256','fixtureRequiredSelectors',
        'originalQualificationClaimed','professionalAcceptance','productionProof')
    return {key:value[key] for key in keys}


def simulated_ai_result(value):
    if value is None or value=='UNKNOWN':return 'UNKNOWN'
    keys={'aufrufe','erfolgreich','fehler','abgewiesenWegenObergrenze','eingabeBytes','ausgabeBytes',
        'eingabeTokenGeschaetzt','ausgabeTokenGeschaetzt','bytesJeGeschaetztemToken','gleichzeitigSpitze','dauerMs'}
    need(type(value) is dict and set(value)==keys)
    scalar=lambda v:v=='UNKNOWN' or type(v) in (int,float) and 0<=v<=2**53-1
    need(type(value['dauerMs']) is dict and set(value['dauerMs'])=={'n','min','p50','p95','max','mittel'})
    need(all(scalar(v) for k,v in value.items() if k!='dauerMs') and all(scalar(v) for v in value['dauerMs'].values()))
    return {**value,'actualPaidProviderUsage':False,'tokensAreEstimates':True}


def closed_failure(error, phase):
    code=error.code if type(error) is Rejected else 'FAIL_OR_UNKNOWN'
    if not isinstance(error,Rejected):
        candidate=P.failure_record(error).get('code')
        if candidate in P.CODES:code=candidate
    result={'phase':getattr(error,'phase',phase) if getattr(error,'phase',phase) in PHASES else 'closure','code':code}
    if code=='RUNTIME_REJECTED':
        known={'AssertionError','JSONDecodeError','ValueError','TypeError','KeyError','AttributeError','ResourceError','StopIteration'}
        result['exceptionType']=type(error).__name__ if type(error).__name__ in known else 'UNKNOWN'
        tb=error.__traceback__
        while tb is not None:
            if Path(tb.tb_frame.f_code.co_filename).absolute()==Path(__file__).absolute():result['sourceLine']=tb.tb_lineno
            tb=tb.tb_next
    return result


def final_receipt(temporary, value):
    """No overwrite or link following; one bounded aggregate, never a private log."""
    raw = canonical(value) + b'\n'; need(len(raw) <= RECEIPT_MAX, 'closure','PUBLIC_RECEIPT_BOUND')
    path = Path(temporary) / 'resource-diagnostic.SAFE.json'
    # Root ownership is required by the publisher contract. No credentials are
    # passed to sudo: input is this already closed aggregate only.
    argv = ['/usr/bin/sudo','-n','/usr/bin/python3','-B','-c',
        'import os,sys; p=sys.argv[1]; b=sys.stdin.buffer.read(65537); '
        'assert len(b)<=65536; f=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600); '
        'assert os.write(f,b)==len(b); os.fsync(f); os.close(f)', str(path)]
    r = subprocess.run(argv,input=raw,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env=ENV,timeout=10)
    need(r.returncode == 0,'closure','PUBLIC_RECEIPT_WRITE')


# Source-copy implementation retained from PR1050 runner_start.py; only its
# irrelevant restore dependency is replaced by this diagnostic's workload marker.
MAX_FILES, MAX_SOURCE_BYTES, MAX_BLOB = 4096, 128 * 1024 * 1024, 16 * 1024 * 1024
CHUNK = 1024 * 1024
GIT_OPTIONS = ['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
               '-c', 'core.autocrlf=false', '-c', 'core.attributesFile=/dev/null', '-c', 'gc.auto=0',
               '-c', 'maintenance.auto=false']

def _parts(value):
    need(isinstance(value, str) and value and not value.startswith('/')
         and all(p not in ('', '.', '..') for p in value.split('/'))
         and '\x00' not in value and '\\' not in value)
    return value.split('/')

def _path(value):
    need(type(value) is str and value.startswith('/') and value != '/'
         and str(Path(value)) == value and all(p not in ('', '.', '..') for p in value[1:].split('/'))
         and all(ord(c) >= 32 and ord(c) != 127 for c in value))
    return Path(value)


def _directory(path):
    path = _path(str(path))
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in str(path)[1:].split('/'):
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise



def _command(argv, *, timeout=60, maximum=2 * 1024 * 1024):
    result = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            env=ENV, timeout=timeout, close_fds=True)
    need(result.returncode == 0 and len(result.stdout) <= maximum)
    return result.stdout


def _git(repo, args, **kwargs):
    return _command(['/usr/bin/git', *GIT_OPTIONS, '-c', 'safe.directory=' + str(repo),
                     '-C', str(repo), *args], **kwargs)



def _tree_rows(raw):
    need(isinstance(raw, bytes) and len(raw) <= 2 * 1024 * 1024)
    rows, total, seen = [], 0, set()
    for entry in raw.split(b'\0'):
        if not entry:
            continue
        header, filename = entry.split(b'\t', 1)
        mode, kind, digest, size = header.split()
        name = filename.decode('utf-8')
        parts = _parts(name)
        need(not any(p.casefold() == '.git' for p in parts) and len(filename) <= 4096
             and all(ord(c) >= 32 and ord(c) != 127 for c in name) and name not in seen
             and mode in (b'100644', b'100755') and kind == b'blob' and re.fullmatch(b'[a-f0-9]{40}', digest))
        count = int(size)
        need(0 <= count <= MAX_BLOB)
        total += count; seen.add(name)
        need(len(seen) <= MAX_FILES and total <= MAX_SOURCE_BYTES)
        rows.append((name, mode, digest, count))
    need(rows and WORKLOAD in seen)
    return rows


def _copy_blob(process, root, row, guard):
    name, mode, digest, size = row
    parts = _parts(name)
    parent = _directory(root)
    try:
        for part in parts[:-1]:
            try:
                os.mkdir(part, 0o700, dir_fd=parent)
            except FileExistsError:
                pass
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            os.close(parent); parent = child
        process.stdin.write(digest + b'\n'); process.stdin.flush()
        header = process.stdout.readline(128)
        need(header == digest + b' blob ' + str(size).encode() + b'\n')
        fd = os.open(parts[-1], os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o700 if mode == b'100755' else 0o600, dir_fd=parent)
        try:
            sha, git_sha, remaining = hashlib.sha256(), hashlib.sha1(), size
            git_sha.update(b'blob ' + str(size).encode() + b'\0')
            while remaining:
                guard()
                block = process.stdout.read(min(CHUNK, remaining))
                need(block)
                sha.update(block); git_sha.update(block); remaining -= len(block)
                view = memoryview(block)
                while view:
                    written = os.write(fd, view); need(written > 0); view = view[written:]
                guard()
            need(process.stdout.read(1) == b'\n' and git_sha.hexdigest().encode() == digest)
            os.fsync(fd)
            os.lseek(fd, 0, os.SEEK_SET)
            back, read_size = hashlib.sha256(), 0
            while True:
                guard()
                block = os.read(fd, CHUNK)
                guard()
                if not block:
                    break
                read_size += len(block); back.update(block)
            need(read_size == size and back.digest() == sha.digest())
            return {'bytes': size, 'sha256': sha.hexdigest()}
        finally:
            os.close(fd)
    finally:
        os.close(parent)


def copy_committed_repo(request, destination, guard):
    """Own shallow object DB, raw blobs and index; no filters, alternates or links."""
    destination = Path(destination)
    need(not destination.exists())
    destination.mkdir(mode=0o700)
    guard()
    _git(destination, ['init', '--quiet', '--template='])
    _git(destination, ['-c', 'protocol.file.allow=always', 'fetch', '--quiet', '--depth=1', '--no-tags',
                       '--no-recurse-submodules', REPO.as_uri(), request['exactCommit']], timeout=90)
    need(_git(destination, ['rev-parse', 'FETCH_HEAD']) == (request['exactCommit'] + '\n').encode())
    _git(destination, ['update-ref', '--no-deref', 'HEAD', request['exactCommit']])
    _git(destination, ['read-tree', request['exactCommit']])
    _git(destination, ['fsck', '--strict', '--no-reflogs', '--connectivity-only', request['exactCommit']], timeout=90)
    need(not (destination / '.git/objects/info/alternates').exists())
    rows = _tree_rows(_git(destination, ['ls-tree', '-rlz', '--full-tree', request['exactCommit']]))
    guard()
    process = subprocess.Popen(['/usr/bin/git', *GIT_OPTIONS, '-C', str(destination), 'cat-file', '--batch'],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               env=ENV, close_fds=True)
    pins = {}
    try:
        for row in rows:
            pins[row[0]] = _copy_blob(process, destination, row, guard)
        process.stdin.close()
        need(process.wait(timeout=15) == 0)
    finally:
        if process.poll() is None:
            process.kill(); process.wait(timeout=10)
        process.stdout.close()
        if not process.stdin.closed:
            process.stdin.close()
    need(_git(destination, ['rev-parse', 'HEAD']) == (request['exactCommit'] + '\n').encode())
    guard()
    return pins



def _own_new_tree(root):
    """Only the exclusively created new tree; never chmod/chown source checkout."""
    total = 0
    for directory, dirs, files in os.walk(root, followlinks=False):
        path = Path(directory)
        need(path.is_dir() and not path.is_symlink())
        os.chmod(path, 0o700, follow_symlinks=False); os.chown(path, 1000, 1000, follow_symlinks=False)
        for name in files:
            file = path / name
            value = file.lstat()
            need(stat.S_ISREG(value.st_mode) and value.st_nlink == 1)
            os.chmod(file, 0o700 if value.st_mode & 0o111 else 0o600, follow_symlinks=False)
            os.chown(file, 1000, 1000, follow_symlinks=False)
            total += value.st_size
        need(not any((path / name).is_symlink() for name in dirs))
    return total



class Supervisor:
    def __init__(self, state):
        self.state = state; self.ctx = state['context']; self.root = Path(state['stateRoot'])
        self.parent = P.R.KERNEL_ROOT / P.names(self.ctx)[0]; self.identity = tuple(state['parentIdentity'])
        self.names = unit_names(self.ctx); self.phase = 'staging'; self.first = None
        self.deadline = state['startedMonotonicNS'] / 1e9 + WORK_SECONDS
        self.groups, self.units, self.children = {}, [], []
        self.common_last = None; self.metrics = {}; self.samples = 0; self.connection_max = None
        self.connection_last = None; self.last_connection_time = 0; self.container_id = None; self.pg_pid = None
        self.work = self.root / 'work'; self.container = 'w15_public_diag_' + uuid.UUID(self.ctx['nonce']).hex
        self.cleanup = {}
        self.cleaning = False; self.container_attempted = False
        self.workload_results = []; self.early_failure = None; self.common_failure_memory = None
        self.common_failure_memory_seen = False
        self.common_kernel = None; self.phase_metrics = {}; self.bound_identities = [];self.datasets=[];self.services_results=[]
        self.progress_target = None; self.workload_progress = {}; self.progress_unknown = set()

    def guard(self):
        need(self.cleaning or time.monotonic() < self.deadline, self.phase, 'WALL_LIMIT')
        for path in (self.root,):
            v = os.statvfs(path); need(self.cleaning or v.f_bavail * v.f_frsize >= DISK, self.phase, 'DISK_RESERVE')
        deferred = None
        try:
            self.common_last = P.read_parent(self.ctx, self.identity)
            need(self.common_last['configuredLimit'] == str(HOST_HARD), self.phase, 'COMMON_LIMIT')
        except BaseException as error:
            deferred = error
            # Cleanup reuses this guard. Preserve the first failing memory
            # observation; later kernel/closure samples remain separately visible.
            if not self.common_failure_memory_seen:
                self.common_failure_memory_seen = True
                self.common_failure_memory = P.R.closed_failure_memory(getattr(error,'failure_memory',None))
        self.samples += 1
        parent_fd=self._parent_fd()
        try:self.common_kernel=C._kernel(parent_fd)
        finally:os.close(parent_fd)
        self.record_phase('common-parent',self.common_kernel)
        for role, group in self.groups.items():
            parent_fd = self._parent_fd()
            try: fd = C._open_group(parent_fd, group['parts'], group['identity'])
            finally: os.close(parent_fd)
            try:
                raw = C._kernel(fd)
                previous = self.metrics.get(role)
                peak = raw['memory']['kernelLifetimePeakBytes']
                if previous is not None and type(peak) is int and type(previous['last']['memory']['kernelLifetimePeakBytes']) is int:
                    need(peak >= previous['last']['memory']['kernelLifetimePeakBytes'], self.phase, 'KERNEL_PEAK_DECREASED')
                entry = previous or {'first': raw, 'firstObservedMonotonicNS': time.monotonic_ns(), 'categoryMaxima': {}, 'kernelPeakFirstObserved': None}
                previous_peak = previous['last']['memory']['kernelLifetimePeakBytes'] if previous is not None else None
                if type(peak) is int and (type(previous_peak) is not int or peak > previous_peak):
                    entry['kernelPeakFirstObserved'] = {'value': peak, 'phase': self.phase, 'sample': self.samples,
                        'meaning': 'FIRST_OBSERVATION_NOT_KERNEL_PEAK_OCCURRENCE_TIME'}
                for key, value in raw['memoryStat'].items():
                    if type(value) is int and value > entry['categoryMaxima'].get(key, {}).get('value', -1):
                        entry['categoryMaxima'][key] = {'value': value, 'sample': self.samples, 'phase': self.phase}
                entry.update(last=raw, lastObservedMonotonicNS=time.monotonic_ns()); self.metrics[role] = entry
                self.record_phase(role,raw)
                if not self.cleaning and role in ('application','database'):
                    try: group_fit(raw,APP_HARD if role=='application' else DB_HARD)
                    except BaseException as error:
                        if deferred is None: deferred = error
            finally: os.close(fd)
        if deferred is not None: raise deferred

    def record_phase(self, role, raw):
        need(self.phase in PHASES,self.phase,'PHASE_ENUM')
        sample={'sample':self.samples,'monotonicNS':time.monotonic_ns(),
            'currentBytes':raw['memory']['currentBytes'],'kernelLifetimePeakBytes':raw['memory']['kernelLifetimePeakBytes'],
            'cpuUsageUsec':raw['cpuStat']['usage_usec'],**raw['memoryStat']}
        phase=self.phase_metrics.setdefault(self.phase,{})
        if role not in phase:phase[role]={'first':sample,'last':sample}
        else:phase[role]['last']=sample

    def _parent_fd(self):
        fd = P.R._kernel_directory(self.parent)
        need((os.fstat(fd).st_dev, os.fstat(fd).st_ino) == self.identity, self.phase, 'PARENT_IDENTITY')
        return fd

    def component_identity(self, path):
        # Existing parent helper intentionally accepts top-level W15 parents only.
        # Descendants are attested relative to that still-bound parent, no links.
        parts=path.relative_to(self.parent).parts
        need(0<len(parts)<=2 and all(part not in ('.','..') for part in parts),self.phase,'LEAF_IDENTITY')
        fd=self._parent_fd();parent=os.fstat(fd)
        try:
            for part in parts:
                child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
                os.close(fd);fd=child;observed=os.fstat(fd)
                need(observed.st_dev==parent.st_dev and observed.st_uid==parent.st_uid,self.phase,'LEAF_IDENTITY')
            value=os.fstat(fd);return value.st_dev,value.st_ino
        finally:os.close(fd)

    def command(self, argv, *, input=None, seconds=30, check=True):
        self.guard()
        try:
            r = subprocess.run(argv, input=input, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                timeout=min(seconds, max(1, self.deadline-time.monotonic())), env=ENV, close_fds=True)
        except subprocess.TimeoutExpired: raise Rejected(self.phase, 'OWNED_COMMAND_TIMEOUT') from None
        need(len(r.stdout) <= MAX_OUTPUT, self.phase, 'OWNED_OUTPUT_BOUND')
        self.guard()
        if check: need(r.returncode == 0, self.phase, 'OWNED_COMMAND_FAILED')
        return r

    def create_groups(self):
        self.phase = 'groups'; need(os.getuid() == 0 and os.sysconf('SC_PAGE_SIZE') == 4096, self.phase)
        for role in ('application', 'database'):
            name = self.names[role]; path = P.UNIT_ROOT / name
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            try: raw = unit_bytes(role); need(os.write(fd, raw) == len(raw), self.phase); os.fsync(fd)
            finally: os.close(fd)
            self.units.append((name, raw))
        self.command(['/usr/bin/systemctl', 'daemon-reload'])
        for role in ('application', 'database'):
            self.command(['/usr/bin/systemctl', 'start', self.names[role]])
            path = self.parent / self.names[role]; identity = self.component_identity(path)
            self.groups[role] = {'path': path, 'parts': (self.names[role],), 'identity': identity}
            if role == 'application':
                leaf = path / 'bound_node'; leaf.mkdir(mode=0o755)
                self.app_leaf = leaf; self.app_leaf_identity = self.component_identity(leaf)
        raw = Path('/proc/self/cgroup').read_text(); member = P.R.membership(raw)
        need(member == '/' + self.parent.name + '/' + self.names['tools'], self.phase, 'TOOLS_MEMBERSHIP')
        path = P.R.KERNEL_ROOT / member.lstrip('/')
        self.groups['test-tools'] = {'path': path, 'parts': (self.names['tools'],), 'identity': self.component_identity(path)}
        self.tools_leaf = path / 'bound_mock_services'; self.tools_leaf.mkdir(mode=0o755)
        self.tools_leaf_identity = self.component_identity(self.tools_leaf)
        self.guard()

    def stage(self):
        self.phase = 'staging'; self.work.mkdir(mode=0o700)
        copy_committed_repo({'exactCommit': self.ctx['exactCommit']}, self.work / 'app', self.guard)
        for key, name in (('nodeSource', 'node'), ('postgrestSource', 'postgrest')):
            source = Path(self.state[key]); fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                value = os.fstat(fd); need(stat.S_ISREG(value.st_mode) and value.st_nlink == 1 and value.st_uid in (0, self.state['callerUID'], REPO.stat().st_uid)
                    and 0<value.st_size<=256*1024*1024,self.phase)
                destination = self.work / name
                digest=hashlib.sha256()
                with destination.open('xb') as f:
                    while chunk := os.read(fd, 1024*1024): f.write(chunk); digest.update(chunk); self.guard()
                need(digest.hexdigest()==({'node':'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12',
                    'postgrest':'870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617'}[name]),self.phase,'PINNED_BINARY')
                destination.chmod(0o700)
            finally: os.close(fd)
        for part in ('state', 'results', 'logs'):(self.work / part).mkdir(mode=0o700)
        _own_new_tree(self.work)

    def start_database(self):
        self.phase = 'database'; self.guard()
        image = self.command(P.DOCKER + ['image', 'inspect', '--format', '{{.Id}}', self.state['imageId']]).stdout.decode().strip()
        need(image == self.state['imageId'], self.phase, 'IMAGE_IDENTITY')
        label = 'helmut.resource-diagnostic.nonce=' + self.ctx['nonce']
        self.container_attempted = True
        self.command(P.DOCKER + ['run', '-d', '--pull=never', '--name', self.container,
            '--label', label, '--label', 'helmut.resource-diagnostic.commit=' + self.ctx['exactCommit'],
            '--network', 'none', '--cgroup-parent=' + self.names['database'],
            '--memory=' + str(DB_HARD), '--memory-swap=' + str(DB_HARD), '--cpus=1',
            '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', 'PGDATA=/tmp/helmut_resource_pgdata',
            '--mount', 'type=bind,src=' + str(self.work) + ',dst=' + BASE,
            self.state['imageId'], 'postgres', '-c', 'max_connections=60', '-c', 'shared_buffers=256MB',
            '-c', 'work_mem=3500kB', '-c', 'max_parallel_workers=2'], seconds=60)
        info = self.inspect()
        self.container_id, self.pg_pid = info['id'], info['pid']
        for _ in range(100):
            r = self.command(P.DOCKER + ['exec', self.container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '--timeout=1'], seconds=3, check=False)
            if r.returncode == 0: break
            time.sleep(.1)
        need(r.returncode == 0, self.phase, 'DATABASE_NOT_READY')

    def raw_command(self, argv, seconds=15):
        """Own cleanup is independent of admission, time and memory guards."""
        r=subprocess.run(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
                         timeout=seconds,env=ENV,close_fds=True)
        need(len(r.stdout)<=MAX_OUTPUT,'closure','OWNED_OUTPUT_BOUND');return r

    def inspect(self, cleanup=False):
        argv=P.DOCKER + ['inspect','--format',P.INSPECT,self.container]
        r=self.raw_command(argv) if cleanup else self.command(argv)
        need(r.returncode==0,self.phase,'CONTAINER_READBACK')
        raw=r.stdout
        v = decode(raw)
        need(v['image'] == self.state['imageId'] and v['network'] == 'none' and v['memory'] == DB_HARD
             and v['swap'] == DB_HARD and v['parent'] == self.names['database']
             and v['labels'].get('helmut.resource-diagnostic.nonce') == self.ctx['nonce']
             and v['labels'].get('helmut.resource-diagnostic.commit') == self.ctx['exactCommit']
             and type(v['id']) is str and re.fullmatch('[a-f0-9]{64}', v['id']), self.phase, 'CONTAINER_IDENTITY')
        return v

    def read_workload_failure(self, result):
        path=result/'WORKLOAD_FAILURE.SAFE.json'
        if not path.exists(): return
        value=read_private(path)
        need(type(value) is dict and set(value)=={'schema','nonce','phase','failureDetail','retryAllowed'}
             and value['schema']==WORKLOAD_SCHEMA and value['nonce']==self.ctx['nonce']
             and value['phase'] in WORKLOAD_PHASES and value['retryAllowed'] is False,self.phase,'WORKLOAD_FAILURE_SCHEMA')
        detail=failure_detail(value['failureDetail'])
        if self.early_failure is None:self.early_failure={'phase':value['phase'],'failureDetail':detail}

    def collect_workload_progress(self):
        """Read in the existing supervisor loop, before any cleanup can run."""
        if self.progress_target is None:return
        result,count = self.progress_target
        try:
            frame=workload_progress(read_private(result/'APP_PROGRESS.SAFE.json',maximum=8192),self.ctx['nonce'],count)
            previous=self.workload_progress.get(count)
            if previous is not None:
                old=previous['lastConfirmedWorkloadProgress']
                need(frame['sequence']>=old['sequence'],'closure','WORKLOAD_PROGRESS_SCHEMA')
                if frame['sequence']==old['sequence']:need(frame==old,'closure','WORKLOAD_PROGRESS_SCHEMA')
                for key in ('provisionedProfiles','activatedProfiles','activeCohortReadbacks','sourceDocumentsSaved',
                            'understoodCases','matchingProfiles','decisionProfiles','positiveProfileResults','deactivatedProfiles'):
                    need(frame[key]>=old[key],'closure','WORKLOAD_PROGRESS_SCHEMA')
            self.workload_progress[count]={'requestedProfiles':count,'lastConfirmedWorkloadProgress':frame,
                'observedMonotonicNS':time.monotonic_ns(),'sample':self.samples,
                'meaning':'PARTIAL_PROGRESS_NOT_COMPLETION_PROOF'}
            self.progress_unknown.discard(count)
            if previous is None or any(frame[k]!=previous['lastConfirmedWorkloadProgress'][k] for k in ('phase','positiveProfileResults','understoodCases')):
                print('MOCK100_PROGRESS '+canonical({k:frame[k] for k in ('requestedProfiles','sequence','phase','operation','positiveProfileResults','understoodCases','finalActiveProfiles')}).decode(),file=sys.stderr,flush=True)
        except Exception:
            # Missing, torn, foreign, or malformed metadata is UNKNOWN and never
            # masks the first resource/worker failure or legitimizes acceptance.
            self.progress_unknown.add(count)

    def prepare_config(self, count):
        mode = 'preflight' if count == SMALL_COUNT else 'mock100'
        db = ('helmut_mock100_preflight_' if count == SMALL_COUNT else 'helmut_mock100_') + uuid.UUID(self.ctx['nonce']).hex
        self.command(P.DOCKER + ['exec', self.container, 'createdb', '-U', 'postgres', db])
        secret = base64.urlsafe_b64encode(os.urandom(32)).decode()
        remaining = int(self.deadline-time.monotonic()); need(remaining >= 60,self.phase,'WALL_LIMIT')
        token = jwt_token(secret, int(time.time()) + remaining, self.ctx['nonce'])
        result = self.work / 'results' / mode; result.mkdir(mode=0o700); os.chown(result, 1000, 1000)
        config = {'schema': 'helmut-synthetic100-mock/1', 'mode': mode, 'count': count,
            'nonce': self.ctx['nonce'], 'database': {'host':'127.0.0.1','port':5432,'name':db,'user':'postgres','password':'helmut'},
            'postgrestURL':'http://127.0.0.1:3000','serviceToken':token,
            'resultRoot':BASE + '/results/' + mode, 'maxWallSeconds':remaining,
            'datasetEpochUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')}
        file = self.work / 'state' / 'DIAGNOSTIC_CONFIG.PRIVATE.json'
        if file.exists(): file.unlink() # Only our prior, finished small scenario config.
        private_json(file, config); os.chown(file,1000,1000)
        pgr = self.work / 'state' / 'postgrest.PRIVATE.conf'
        if pgr.exists(): pgr.unlink()
        fd = os.open(pgr,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        try:
            text = ('db-uri = "postgres://authenticator:helmut@127.0.0.1:5432/' + db + '"\n'
                    'db-schemas = "public"\ndb-anon-role = "anon"\ndb-pool = 3\nserver-host = "127.0.0.1"\nserver-port = 3000\njwt-secret = "' + secret + '"\n')
            os.write(fd,text.encode())
        finally: os.close(fd)
        os.chown(pgr,1000,1000)
        return result, config

    def launch_bound(self, action, *, ca_path=None, role='test-tools', full100_release=False):
        self.phase = 'barrier'
        log = BASE + '/logs/' + action.strip('-') + '-' + str(len(self.children)) + '.PRIVATE.log'
        argv = ['/usr/bin/env','-i','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                'LANG=C.UTF-8','HELMUT_SOURCE_MODE=off','HELMUT_STORAGE_BACKEND=local']
        if ca_path is not None: argv.append('NODE_EXTRA_CA_CERTS=' + ca_path)
        if action == '--postgrest':
            argv += [BASE+'/postgrest', BASE+'/state/postgrest.PRIVATE.conf']
        else:
            need(action in ('--prepare-database','--services','--app','--preflight-klein'),self.phase,'ACTION_ALLOWLIST')
            argv += [BASE+'/node','--require',BASE+'/app/scripts/lokaler-netzschutz.js',
                     BASE+'/app/'+WORKLOAD, action, '--config', BASE+'/state/DIAGNOSTIC_CONFIG.PRIVATE.json']
        command = P.DOCKER + ['exec','--user','1000:1000','--workdir',BASE+'/app','-i',self.container,
                             '/bin/sh','-c',BOUND_SHELL,'w15-bound-child',log,*argv]
        process = subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env=ENV,close_fds=True)
        child = {'process':process,'hostPID':None,'startTicks':None,'pidfd':None,'role':role}; self.children.append(child)
        until = min(self.deadline,time.monotonic()+15); raw=b''
        while b'\n' not in raw:
            self.guard(); need(process.poll() is None and time.monotonic()<until,self.phase,'BARRIER_NOT_READY')
            if select.select([process.stdout],[],[],.1)[0]: raw += os.read(process.stdout.fileno(),1024)
            need(len(raw)<=128,self.phase,'BARRIER_FRAME')
        match = re.fullmatch(rb'W15_DIAG_CHILD_READY ([1-9][0-9]*)\n',raw); need(match is not None,self.phase,'BARRIER_FRAME')
        rows = ROLES.bindings(self.parent,self.identity,self.pg_pid,self.container_id,{'helmut-node':int(match[1])})
        bound = [r for r in rows if r['role']=='helmut-node']; need(len(bound)==1,self.phase,'NAMESPACE_PID_UNKNOWN')
        host, start = bound[0]['pid'],bound[0]['startTicks']; child.update(hostPID=host,startTicks=start)
        child['pidfd'] = os.pidfd_open(host)
        if role != 'database':
            leaf = self.app_leaf if role=='application' else self.tools_leaf
            identity = self.app_leaf_identity if role=='application' else self.tools_leaf_identity
            need(self.component_identity(leaf)==identity,self.phase,'LEAF_IDENTITY')
            fd=os.open(leaf/'cgroup.procs',os.O_WRONLY|os.O_NOFOLLOW)
            try:need(os.write(fd,str(host).encode())==len(str(host)),self.phase,'PLACEMENT_WRITE')
            finally:os.close(fd)
            rec=ROLES._record(host,'/'+str(leaf.relative_to(P.R.KERNEL_ROOT)))
        else:
            rec=ROLES._record(host,'/'+str(self.groups['database']['path'].relative_to(P.R.KERNEL_ROOT)))
        need(rec[0]==start and rec[2][-1]==int(match[1]),self.phase,'PLACEMENT_READBACK')
        self.bound_identities.append({'role':role,'hostPID':host,'startTicks':start,'namespacePID':int(match[1]),
            'barrierBeforeNodeImport':action!='--postgrest','attestedBeforeRelease':True})
        self.guard()
        if full100_release:
            private_json(self.root/'FULL100_RELEASE_ATTEMPT.SAFE.json',{'nonce':self.ctx['nonce'],'expectedCommit':self.ctx['exactCommit'],'profiles':100,'attempt':1})
        process.stdin.write(b'GO\n');process.stdin.flush();process.stdin.close()
        child['released']=True
        return child

    def await_exit(self, child, phase, check=True):
        self.phase=phase
        while child['process'].poll() is None:
            self.guard();time.sleep(.1)
        self.guard()
        if check: need(child['process'].returncode==0,phase,'WORKLOAD_PROCESS_FAILED')

    def stop_child(self, child):
        process=child['process']
        if process.stdin is not None and not process.stdin.closed: process.stdin.close()
        if process.poll() is None:
            if child['pidfd'] is not None:
                try: signal.pidfd_send_signal(child['pidfd'],signal.SIGTERM)
                except ProcessLookupError: pass
            else:process.terminate()
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                if child['pidfd'] is not None:
                    try: signal.pidfd_send_signal(child['pidfd'],signal.SIGKILL)
                    except ProcessLookupError: pass
                process.kill();process.wait(timeout=5)
        if child['pidfd'] is not None:
            need(select.select([child['pidfd']],[],[],2)[0],'closure','BOUND_PROCESS_EXIT_UNKNOWN')
            os.close(child['pidfd']);child['pidfd']=None
        if not process.stdout.closed:process.stdout.close()

    def connections(self, db):
        raw=self.command(P.DOCKER+['exec','-i',self.container,'psql','-X','-w','-qAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],
            input=('begin read only;\n'+S.CONNECTION_SNAPSHOT_SQL+'\nrollback;').encode(),seconds=10).stdout
        value=S.connection_observation(decode(raw))
        need(value['status']=='OBSERVED_CLIENT_CONNECTIONS_ONLY' and value['maxConnections']==60
             and value['observerClients']==1 and value['clientBackends']<=60,self.phase,'CONNECTION_READBACK')
        self.connection_last=value;self.connection_max=max(self.connection_max or 0,value['clientBackends'])
        self.last_connection_time=time.monotonic()

    def scenario(self,count):
        self.phase='schema'
        result,config=self.prepare_config(count)
        child=self.launch_bound('--prepare-database');self.await_exit(child,'schema',check=False)
        self.read_workload_failure(result)
        need(child['process'].returncode==0,'schema','WORKLOAD_PROCESS_FAILED');self.stop_child(child)
        prepared=read_private(result/'PREPARED_DATABASE.SAFE.json')
        need(prepared=={'schema':WORKLOAD_SCHEMA,'nonce':self.ctx['nonce'],'database':config['database']['name'],
             'status':'PREPARED_EMPTY_SYNTHETIC_DATABASE_ONLY','profiles':0,'executionAuthority':False},'schema','FRESH_DATABASE_PROOF')
        self.phase='postgrest';pgr=self.launch_bound('--postgrest',role='database')
        for _ in range(60):
            probe=self.command(P.DOCKER+['exec','--user','1000:1000',self.container,BASE+'/node','-e',
                "const h=require('http');let q=h.get('http://127.0.0.1:3000/',r=>{r.resume();r.on('end',()=>process.exit(r.statusCode===200?0:1))});q.on('error',()=>process.exit(1));q.setTimeout(1000,()=>process.exit(1))"],seconds=3,check=False)
            if probe.returncode==0:break
            need(pgr['process'].poll() is None,'postgrest','POSTGREST_EXITED');time.sleep(.1)
        need(probe.returncode==0,'postgrest','POSTGREST_NOT_READY')
        service=self.launch_bound('--services');self.phase='services'
        ready=result/'SERVICES_READY.SAFE.json';until=min(self.deadline,time.monotonic()+20)
        while not ready.exists():
            self.guard()
            if service['process'].poll() is not None:self.read_workload_failure(result)
            need(service['process'].poll() is None and time.monotonic()<until,'services','MOCK_SERVICES_NOT_READY');time.sleep(.1)
        binding=read_private(result/'SERVICE_BINDINGS.PRIVATE.json');meta=read_private(ready)
        need(type(meta) is dict and set(meta)=={'schema','nonce','ready','pid','databasePort','rssPort','kiPort'}
             and type(binding) is dict and set(binding)=={'schema','nonce','databaseURL','rssURL','kiURL','caPath'}
             and meta['schema']==binding['schema']==WORKLOAD_SCHEMA and meta['ready'] is True
             and meta['nonce']==binding['nonce']==self.ctx['nonce'],'services','MOCK_BINDING')
        for key,scheme,portkey in (('databaseURL','http','databasePort'),('rssURL','http','rssPort'),('kiURL','https','kiPort')):
            port=meta[portkey];need(type(port) is int and 1<=port<=65535,'services','MOCK_BINDING')
            need(binding[key]==scheme+'://127.0.0.1:'+str(port),'services','MOCK_BINDING')
        ca=binding['caPath'];need(ca==config['resultRoot']+'/tls/ca.pem','services','CA_PATH')
        hostca=self.work/Path(ca).relative_to(BASE);v=hostca.lstat();need(stat.S_ISREG(v.st_mode) and v.st_uid==1000 and stat.S_IMODE(v.st_mode)==0o600,'services','CA_FILE')
        self.connections(config['database']['name'])
        self.progress_target=(result,count)
        child=self.launch_bound('--preflight-klein' if count==SMALL_COUNT else '--app',ca_path=ca,role='application',full100_release=count==100)
        self.phase='preflight-small' if count==SMALL_COUNT else 'mock100'
        while child['process'].poll() is None:
            self.collect_workload_progress()
            self.guard()
            if time.monotonic()-self.last_connection_time>=2:self.connections(config['database']['name'])
            time.sleep(.1)
        self.collect_workload_progress()
        self.await_exit(child,self.phase,check=False)
        self.read_workload_failure(result)
        value=workload_result(read_private(result/'APP_RESULT.SAFE.json'),self.ctx['nonce'],count)
        self.workload_results.append(value)
        dataset=dataset_result(read_private(result/'DATASET.SAFE.json'),config['datasetEpochUTC'],count)
        self.datasets.append(dataset)
        need(child['process'].returncode==0 and value['status']==('PASS_MOCK100_RUNTIME' if count==100 else 'PASS_MOCK100_PREFLIGHT'),self.phase,'APP_RESULT')
        need(value['understoodCases']==dataset['executedCaseCount'],self.phase,'UNDERSTOOD_CASE_COUNT')
        self.stop_child(child);self.connections(config['database']['name'])
        self.stop_child(service)
        self.collect_service_result(result,count,True)
        self.verify_model_phases(result,count,value)
        self.stop_child(pgr)
        return value

    def collect_service_result(self, result, count, app_exit):
        if any(row['profiles']==count for row in self.services_results):return
        closed=read_private(result/'SERVICES_CLOSED.SAFE.json')
        need(type(closed) is dict and set(closed)<= {'schema','nonce','closed','failed','localSimulatedAI','executionAuthority'}
            and all(closed.get(k)==v for k,v in {'schema':WORKLOAD_SCHEMA,'nonce':self.ctx['nonce'],
                'closed':True,'failed':False,'executionAuthority':False}.items()),'services','MOCK_SERVICES_STOP_UNKNOWN')
        row={'profiles':count,'closed':True,'failed':False,
            'localSimulatedAI':simulated_ai_result(closed.get('localSimulatedAI')),
            'applicationExitAttestedBeforeServiceStop':app_exit}
        response=result/'MOCK_RESPONSE_FAILURE.SAFE.json'
        if response.exists():
            failure=read_private(response)
            need(type(failure) is dict and set(failure)=={'schema','nonce','phase','failureDetail','retryAllowed'}
                 and failure['schema']==WORKLOAD_SCHEMA and failure['nonce']==self.ctx['nonce']
                 and failure['phase']=='services' and failure['retryAllowed'] is False,'services','WORKLOAD_FAILURE_SCHEMA')
            row['responseFailure']=failure_detail(failure['failureDetail'])
        self.services_results.append(row)

    def verify_model_phases(self, result, count, value):
        record=read_private(result/'MODEL_PHASES.SAFE.json',maximum=262144)
        need(type(record) is dict and set(record)=={'schema','nonce','phases'}
             and record['schema']==WORKLOAD_SCHEMA and record['nonce']==self.ctx['nonce'],self.phase,'MODEL_PHASE_BINDING')
        phases=record['phases'];need(type(phases) is list and len(phases)==value['understoodCases']+2*count,self.phase,'MODEL_PHASE_COUNTS')
        counts={'understanding':0,'entwurf':0,'pruefung':0};owners={}
        for row in phases:
            need(type(row) is dict and set(row)=={'phase','ownerHash','profileContextSHA256','requestSHA256'}
                 and row['phase'] in counts and type(row['requestSHA256']) is str
                 and re.fullmatch('[a-f0-9]{64}',row['requestSHA256']),self.phase,'MODEL_PHASE_BINDING')
            phase=row['phase'];counts[phase]+=1
            if phase=='understanding':need(row['ownerHash'] is None and row['profileContextSHA256'] is None,self.phase,'MODEL_PHASE_BINDING')
            else:
                owner=row['ownerHash'];need(type(owner) is str and re.fullmatch('[a-f0-9]{64}',owner)
                    and type(row['profileContextSHA256']) is str and re.fullmatch('[a-f0-9]{64}',row['profileContextSHA256']),self.phase,'MODEL_PHASE_BINDING')
                seen=owners.setdefault(owner,set());need(phase not in seen,self.phase,'MODEL_PHASE_COUNTS');seen.add(phase)
        need(counts==value['modelPhases'] and len(owners)==count
             and all(v=={'entwurf','pruefung'} for v in owners.values()),self.phase,'MODEL_PHASE_COUNTS')
        service=self.services_results[-1];ai=service['localSimulatedAI']
        need(type(ai) is dict and ai['aufrufe']==ai['erfolgreich']==len(phases)
             and ai['fehler']==0 and ai['abgewiesenWegenObergrenze']==0,self.phase,'MODEL_PHASE_COUNTS')
        service['modelPhaseCounts']=counts;service['modelPhaseAuditSHA256']=hashlib.sha256(canonical(record)).hexdigest()

    def cleanup_error(self,key,error):
        self.cleanup[key]='UNKNOWN'
        if self.first is None:self.first=closed_failure(error,'closure')

    def close(self):
        self.phase='closure';self.cleaning=True
        for child in reversed(self.children):
            try:self.stop_child(child)
            except BaseException as error:self.cleanup_error('childExit',error)
        self.cleanup.setdefault('childExit','PASS')
        if self.container_attempted:
            try:
                before=self.inspect(cleanup=True)
                if self.container_id is not None:need(before['id']==self.container_id,'closure','CONTAINER_IDENTITY')
                self.container_id=before['id']
                if before['running']:
                    r=self.raw_command(P.DOCKER+['stop','--time','5',self.container_id],seconds=15)
                    need(r.returncode==0,'closure','DATABASE_STOP')
                v=self.inspect(cleanup=True);need(v['id']==self.container_id and v['running'] is False and v['pid']==0,'closure','DATABASE_STOP')
                oom=self.raw_command(P.DOCKER+['inspect','--format','{{json .State.OOMKilled}}',self.container_id])
                need(oom.returncode==0 and oom.stdout.strip()==b'false','closure','DATABASE_OOM_UNKNOWN')
                self.cleanup['databaseStopped']='PASS'
            except BaseException as error:self.cleanup_error('databaseStopped',error)
        else:self.cleanup['databaseStopped']='NOT_STARTED'
        try:self.guard()
        except BaseException as error:self.cleanup_error('resourceClosure',error)
        for leaf in (getattr(self,'app_leaf',None),getattr(self,'tools_leaf',None)):
            if leaf is not None:
                try:need(not (leaf/'cgroup.procs').read_text().strip(),'closure','GROUP_NOT_EMPTY');leaf.rmdir()
                except BaseException as error:self.cleanup_error('componentGroupsEmpty',error)
        self.cleanup.setdefault('componentGroupsEmpty','PASS')
        for name,raw in reversed(self.units):
            try:
                path=P.UNIT_ROOT/name;s=path.lstat()
                need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1
                     and stat.S_IMODE(s.st_mode)==0o600 and path.read_bytes()==raw,'closure','UNIT_IDENTITY')
                subprocess.run(['/usr/bin/systemctl','stop',name],env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10,check=True)
                path.unlink()
            except BaseException as error:self.cleanup_error('componentUnitsRemoved',error)
        self.cleanup.setdefault('componentUnitsRemoved','PASS')
        try:
            r=self.raw_command(['/usr/bin/systemctl','daemon-reload']);need(r.returncode==0,'closure','SYSTEMD_RELOAD')
            self.cleanup['systemdReload']='PASS'
        except BaseException as error:self.cleanup_error('systemdReload',error)

    def run(self):
        results=[];last_work_phase='staging'
        try:
            self.create_groups();self.stage();self.start_database()
            results.append(self.scenario(SMALL_COUNT if self.state['preflightOnly'] else 100))
        except BaseException as error:
            self.first=closed_failure(error,self.phase)
            if self.early_failure is not None:self.first['workloadFailure']=self.early_failure
            try:self.collect_workload_progress()
            except BaseException:pass  # A later stop cannot displace the recorded first failure.
        finally:
            last_work_phase=self.phase
            try:self.close()
            except BaseException:
                self.cleanup['closure']='UNKNOWN'
                if self.first is None:self.first={'phase':'closure','code':'OWNED_CLEANUP_UNKNOWN'}
        # A signal may complete the closed workload receipt during cleanup.
        # Adopt that evidence without replacing an earlier guard/worker cause.
        for mode,count in (('preflight',SMALL_COUNT),('mock100',100)):
            path=self.work/'results'/mode/'APP_RESULT.SAFE.json'
            if path.exists() and not any(x['requestedProfiles']==count for x in self.workload_results):
                try:self.workload_results.append(workload_result(read_private(path),self.ctx['nonce'],count))
                except BaseException:pass
        for mode,count in (('preflight',SMALL_COUNT),('mock100',100)):
            result=self.work/'results'/mode
            if (result/'SERVICES_CLOSED.SAFE.json').exists():
                try:self.collect_service_result(result,count,'UNKNOWN')
                except BaseException:pass  # Never replace the first work/guard failure.
        successful=self.first is None and len(results)==1 and all(x in ('PASS','NOT_STARTED') for x in self.cleanup.values())
        return {'schema':'helmut-w15-synthetic-resource-diagnostic-result/1','scope':self.state['request']['scope'],
            'status':('PASS_MOCK100_PREFLIGHT' if self.state['preflightOnly'] else 'PASS_MOCK100') if successful else 'FAIL_OR_UNKNOWN_SYNTHETIC_RESOURCE_DIAGNOSTIC',
            'exactCommit':self.ctx['exactCommit'],'runId':self.ctx['runId'],'nonce':self.ctx['nonce'],
            'lastWorkPhase':last_work_phase,
            'firstFailure':self.first,'lastCommonParent':self.common_last,'commonFailureMemory':self.common_failure_memory,'components':self.metrics,
            'lastCommonKernel':self.common_kernel,'phaseMeasurements':self.phase_metrics,'boundProcessIdentities':self.bound_identities,
            'connectionsHighestSampled':self.connection_max,'connectionsTruePeak':'UNKNOWN',
            'lastConnectionSample':self.connection_last,'cleanup':self.cleanup,
            'completedScenarios':len(results),'workloadResults':self.workload_results,'syntheticDatasetCoverage':self.datasets,
            'servicesResults':self.services_results,
            'workloadProgress':list(self.workload_progress.values()),
            'workloadProgressUnknownCounts':sorted(self.progress_unknown),
            'full100ReleaseAttempted':(self.root/'FULL100_RELEASE_ATTEMPT.SAFE.json').exists(),
            'full100Completed':any(x['requestedProfiles']==100 and x['status']=='PASS_MOCK100_RUNTIME' for x in results),
            'pureApplicationBytes':'UNKNOWN','scopeMeaning':'APPLICATION_WITH_INSEPARABLE_HARNESS_CHARGED_GROUP',
            'databaseGroupIncludesPostgRESTAndTransientSQLObserverClients':True,
            'maximumTotalSeconds':WALL,'maximumWorkingSecondsIncludingPreparation':WORK_SECONDS,
            'actualSecondsIncludingOwnedCleanup':(time.monotonic_ns()-self.state['startedMonotonicNS'])/1e9,
            'kernelPeakScope':'WHOLE_GROUP_LIFETIME_NO_RESET',
            'peakCompositionKnown':False,'differentTimeMaximaAdditive':False,'cacheProducerAttribution':'UNKNOWN',
            'preexistingSharedPageChargeCompleteness':'UNKNOWN','databaseCPUQuotaIsLabChoiceNotSupabaseGuarantee':True,
            'providerParityAccepted':False,'resourceContractAccepted':False,'end500Acceptance':False,
            'mock500Acceptance':False,'productionAccepted':False,'originalsAccessed':False,
            'executionAuthority':False,'retryAllowed':False}


def launcher(expected, preflight_only):
    request=request_for_preflight(expected) if preflight_only else decode(os.environ.get('W15_DIAGNOSTIC_REQUEST',''))
    ctx=validate_request(request,expected,os.environ,preflight=preflight_only)
    P.github_binding(ctx['runId'],expected,capacity_diagnostic=True)
    for relative in ('scripts/w15-github/synthetic_resource_diagnostic.py',WORKLOAD,
        'scripts/w15-github/component_resource_meter.py','scripts/w15-github/separated_resources.py',
        'scripts/w15-github/separated_resources_contract.json','scripts/fixtures/resource500-diagnostic.js',
        'scripts/fixtures/z3-plattform.js','scripts/skalierung-z3-realistiklauf.js','scripts/lokaler-netzschutz.js'):
        blob_bound(relative,expected)
    temporary=Path(os.environ['RUNNER_TEMP']);need(temporary.is_absolute() and '..' not in temporary.parts)
    root=temporary/('w15_public_diag_'+uuid.UUID(ctx['nonce']).hex);root.mkdir(mode=0o700)
    private_json(root/'ONCE.SAFE.json',{'schema':SCHEMA,'scope':request['scope'],'nonce':ctx['nonce'],'expectedCommit':expected,'attempt':1})
    names=unit_names(ctx);created=False;process=None;identity=None;result=None;failure=None;started=time.monotonic_ns()
    try:
        image=os.environ.get('W15_IMAGE_ID');need(type(image) is str and re.fullmatch('sha256:[a-f0-9]{64}',image))
        P.privileged('prepare',ctx);created=True;parent=P.R.KERNEL_ROOT/P.names(ctx)[0]
        identity=P.identity(parent);P.read_parent(ctx,identity,empty=True)
        state={'context':ctx,'request':request,'stateRoot':str(root),'parentIdentity':list(identity),
            'startedMonotonicNS':started,'callerUID':os.getuid(),'imageId':image,'preflightOnly':preflight_only,
            'nodeSource':os.environ['W15_NODE_SOURCE'],'postgrestSource':os.environ['W15_POSTGREST_SOURCE']}
        context_path=root/'CONTEXT.PRIVATE.json';private_json(context_path,state)
        passed={**ENV,**{k:os.environ[k] for k in ('GITHUB_ACTIONS','GITHUB_EVENT_NAME','GITHUB_SHA','GITHUB_REF','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','EXPECTED_COMMIT','RUNNER_TEMP')}}
        if preflight_only:passed['GITHUB_HEAD_REF']=os.environ['GITHUB_HEAD_REF']
        argv=['/usr/bin/sudo','-n','/usr/bin/systemd-run','--quiet','--wait','--pipe','--collect','--service-type=exec',
            '--unit='+names['tools'],'--slice='+P.names(ctx)[0],'--property=User=0','--property=Group=0',
            '--property=MemoryAccounting=yes','--property=CPUAccounting=yes',
            '--property=RuntimeMaxSec='+str(max(1,int(started/1e9+WALL-120-time.monotonic()))),
            '--property=TimeoutStopSec=30','--property=KillMode=control-group','/usr/bin/env','-i',
            *[k+'='+v for k,v in passed.items()],'/usr/bin/python3','-B',str(Path(__file__).absolute()),
            '--internal-supervisor','--expected-commit',expected,'--context-file',str(context_path)]
        process=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=sys.stderr,env=ENV,close_fds=True)
        raw,_=process.communicate(timeout=max(1,started/1e9+WALL-100-time.monotonic()))
        need(len(raw)<=MAX_OUTPUT,'tools-start','RESULT_BOUND')
        result=decode(raw);need(result.get('schema')=='helmut-w15-synthetic-resource-diagnostic-result/1'
            and result.get('nonce')==ctx['nonce'] and result.get('exactCommit')==expected and result.get('scope')==request['scope'],
            'closure','RESULT_BINDING')
        final=P.read_parent(ctx,identity,empty=True)
        result['finalCommonParentAfterOwnedExits']=final
        need(process.returncode==0 and result['status']==('PASS_MOCK100_PREFLIGHT' if preflight_only else 'PASS_MOCK100'),'closure','INNER_DIAGNOSTIC_FAILED')
    except BaseException as error:
        failure=closed_failure(error,'closure')
        if result is None:result={'schema':'helmut-w15-synthetic-resource-diagnostic-result/1','scope':request['scope'],'status':'FAIL_OR_UNKNOWN_SYNTHETIC_RESOURCE_DIAGNOSTIC',
            'exactCommit':expected,'runId':ctx['runId'],'nonce':ctx['nonce'],'firstFailure':failure,'executionAuthority':False,'retryAllowed':False}
        else:
            result['status']='FAIL_OR_UNKNOWN_SYNTHETIC_RESOURCE_DIAGNOSTIC'
            if result.get('firstFailure') is None:result['firstFailure']=failure
    finally:
        if process is not None and process.poll() is None:
            try:subprocess.run(['/usr/bin/sudo','-n','/usr/bin/systemctl','stop',names['tools']],env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
            except BaseException:pass
            try:process.kill();process.wait(timeout=5)
            except BaseException:pass
        if created:
            # A killed tools supervisor cannot report/stop its owned Docker
            # namespace. Attest only our fixed name and immutable labels before
            # stopping it; never choose a container by a fuzzy name or PID.
            try:
                container='w15_public_diag_'+uuid.UUID(ctx['nonce']).hex
                inspect=P.command(P.DOCKER+['inspect','--format',P.INSPECT,container],check=False)
                if inspect.returncode==0:
                    meta=decode(inspect.stdout)
                    need(meta['labels'].get('helmut.resource-diagnostic.nonce')==ctx['nonce']
                        and meta['labels'].get('helmut.resource-diagnostic.commit')==expected and meta['image']==image,'closure','CONTAINER_IDENTITY')
                    if meta['running']:P.command(P.DOCKER+['stop','--time','5',meta['id']],timeout=15)
                    stopped=decode(P.command(P.DOCKER+['inspect','--format',P.INSPECT,meta['id']]).stdout)
                    need(stopped['running'] is False and stopped['pid']==0,'closure','DATABASE_STOP')
            except BaseException:
                if result is not None:result['outerOwnedContainerStop']='UNKNOWN'
            try:
                if identity is not None:result['finalCommonParentAfterOwnedExits']=P.read_parent(ctx,identity,empty=True)
            except BaseException as error:
                if result is not None:
                    result['finalCommonParentAfterOwnedExits']='UNKNOWN'
                    result['outerCommonFailureMemory']=P.R.closed_failure_memory(getattr(error,'failure_memory',None))
            try:
                # Removal stops the exact owned slice even when final sampling
                # fails. A guard failure must never suppress termination.
                P.privileged('remove',ctx)
                need(not (P.R.KERNEL_ROOT/P.names(ctx)[0]).exists(),'closure','PARENT_STOP_UNKNOWN')
                if result is not None:result['parentStoppedAndRemoved']='PASS'
            except BaseException as error:
                if result is not None:
                    result.update(status='FAIL_OR_UNKNOWN_SYNTHETIC_RESOURCE_DIAGNOSTIC',parentStoppedAndRemoved='UNKNOWN')
                    if result.get('firstFailure') is None:result['firstFailure']=closed_failure(error,'closure')
    if result.get('outerOwnedContainerStop')=='UNKNOWN' or result.get('finalCommonParentAfterOwnedExits')=='UNKNOWN':
        result['status']='FAIL_OR_UNKNOWN_SYNTHETIC_RESOURCE_DIAGNOSTIC'
        if result.get('firstFailure') is None:result['firstFailure']={'phase':'closure','code':'OWNED_CLEANUP_UNKNOWN'}
    result['outsideOuterLauncherMemoryBytes']='UNKNOWN_NOT_IN_COMMON_PARENT'
    result['commonIsWholeGitHubHostConsumption']=False
    result['actualTotalSecondsIncludingOuterCleanup']=(time.monotonic_ns()-started)/1e9
    if result['actualTotalSecondsIncludingOuterCleanup']>WALL:
        result['status']='FAIL_OR_UNKNOWN_SYNTHETIC_RESOURCE_DIAGNOSTIC'
        if result.get('firstFailure') is None:result['firstFailure']={'phase':'closure','code':'WALL_LIMIT'}
    try:private_json(root/'FINAL_RESULT.SAFE.json',result)
    except BaseException:
        result['status']='FAIL_OR_UNKNOWN_SYNTHETIC_RESOURCE_DIAGNOSTIC'
        result['finalReceiptWritten']='UNKNOWN'
        if result.get('firstFailure') is None:result['firstFailure']={'phase':'closure','code':'PUBLIC_RECEIPT_WRITE'}
    return result


def main(argv=None):
    parser=argparse.ArgumentParser(allow_abbrev=False)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--qualify-and-run-once',action='store_true');mode.add_argument('--preflight-klein',action='store_true')
    mode.add_argument('--internal-supervisor',action='store_true')
    parser.add_argument('--expected-commit',required=True);parser.add_argument('--context-file')
    args=parser.parse_args(argv)
    result=None;scope=SMALL_SCOPE if args.preflight_klein else SCOPE;latch=P.StopLatch()
    try:
        if args.internal_supervisor:
            need(os.getuid()==0 and args.context_file is not None)
            file=Path(args.context_file);temporary=Path(os.environ['RUNNER_TEMP'])
            need(file.is_absolute() and file.name=='CONTEXT.PRIVATE.json' and file.parent.parent==temporary)
            owner=file.parent.lstat();need(stat.S_ISDIR(owner.st_mode) and stat.S_IMODE(owner.st_mode)==0o700)
            state=read_private(file,allowed_owner=owner.st_uid)
            scope=state['request']['scope']
            ctx=validate_request(state['request'],args.expected_commit,os.environ,preflight=state['preflightOnly'])
            need(state['context']==ctx and state['stateRoot']==str(file.parent)
                 and file.parent.name=='w15_public_diag_'+uuid.UUID(ctx['nonce']).hex
                 and state['callerUID']==owner.st_uid and type(state['preflightOnly']) is bool)
            P.github_binding(state['context']['runId'],args.expected_commit,capacity_diagnostic=True)
            result=Supervisor(state).run()
        else:
            need(args.context_file is None);result=launcher(args.expected_commit,args.preflight_klein)
    except BaseException as error:
        result={'schema':'helmut-w15-synthetic-resource-diagnostic-result/1','scope':scope if scope in (SCOPE,SMALL_SCOPE) else SCOPE,
            'status':'FAIL_OR_UNKNOWN_SYNTHETIC_RESOURCE_DIAGNOSTIC','firstFailure':closed_failure(error,'binding'),
            'executionAuthority':False,'retryAllowed':False}
    for key in ('providerParityAccepted','resourceContractAccepted','end500Acceptance','mock500Acceptance',
                'productionAccepted','originalsAccessed','retryAllowed','executionAuthority'):result[key]=False
    if not args.internal_supervisor:
        try:final_receipt(os.environ['RUNNER_TEMP'],result)
        except BaseException as error:
            result['status']='FAIL_OR_UNKNOWN_SYNTHETIC_RESOURCE_DIAGNOSTIC'
            result['finalReceiptWritten']='UNKNOWN'
            if result.get('firstFailure') is None:result['firstFailure']=closed_failure(error,'closure')
    print(canonical(result).decode())
    latch.close()
    return 0 if result['status'] in ('PASS_MOCK100_PREFLIGHT','PASS_MOCK100') else 1


if __name__=='__main__':raise SystemExit(main())
