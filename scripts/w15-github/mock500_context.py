"""Explicit Mock500-v2 context and received-input binding, without execution.

The End500 context API stays strict. Static source review and newly observed
runner identity are distinct records; neither is an execution permission.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import uuid

HERE = Path(__file__).absolute().parent
REPO = HERE.parents[1]
SCOPE = 'ISOLATED_GITHUB_MOCK500_BINDING_ONLY'
BRANCH = 'refs/heads/codex/w15-github-end500-preparation-20261028'
SYNTHETIC_BRANCH = 'refs/heads/codex/w15-mock500-integration-20261029'
MEMORY = 'scripts/fixtures/w15-memory-contract.json'
SEALED_SHA = 'af3bd654fa292ad256e0fa265c2fb3d968e945633f1439a12da72f015aeab86f'
TRANSFER = {'exactCommit': '66efb89a42e3d1bee739844ac32a258d79b38ebb', 'runId': '20261029010443',
    'inputManifestSHA': '84b730490014c5d17f81ac350677275ce33f368731c8f4a979a4d1b2c9165bf5',
    'recipientFingerprint': '7E3998A6C2CB948C69A2EE51F4267ABF26796EDC'}
CONTEXT_KEYS = {'schema', 'scope', 'nonce', 'runId', 'runAttempt', 'exactCommit', 'runnerTemp',
    'hostPaths', 'uidMap', 'inputManifestPin', 'sourcePins', 'runtimePins', 'executionAuthority', 'testStarted'}


def component(name, repo=REPO):
    key = 'w15_github_' + name
    path = Path(repo) / 'scripts/w15-github' / (name + '.py')
    if key in sys.modules:
        need(Path(sys.modules[key].__file__).absolute() == path.absolute())
        return sys.modules[key]
    spec = importlib.util.spec_from_file_location(key, path)
    module = importlib.util.module_from_spec(spec); sys.modules[key] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(key, None)
        raise
    return module


def need(value):
    if not value:
        raise ValueError('MOCK500_CONTEXT_BINDING_REJECTED')


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')


def validate_context(context, repo=REPO):
    """Validate fresh names and actual committed public bytes; never create paths."""
    repo = Path(repo)
    r = component('runtime_inputs', repo)
    need(type(context) is dict and set(context) == CONTEXT_KEYS
         and context['schema'] == 'helmut-w15-mock500-controller-context/1'
         and context['scope'] == SCOPE and context['executionAuthority'] is False and context['testStarted'] is False)
    nonce = uuid.UUID(context['nonce'])
    need(str(nonce) == context['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122
         and type(context['runId']) is str and re.fullmatch('[1-9][0-9]{4,19}', context['runId'])
         and type(context['runAttempt']) is int and context['runAttempt'] == 1
         and type(context['exactCommit']) is str and re.fullmatch('[a-f0-9]{40}', context['exactCommit']))
    need(context['uidMap'] == {'runnerUID': os.getuid(), 'runnerGID': os.getgid(),
                              'containerUID': 1000, 'containerGID': 1000}
         and all(type(v) is int for v in context['uidMap'].values()))
    temporary = context['runnerTemp']; fd = r.C._directory(temporary)
    try:
        value = os.fstat(fd)
        need(value.st_uid == os.getuid() and stat.S_IMODE(value.st_mode) & 0o022 == 0)
        stem = 'w15-mock500-' + context['runId'] + '-' + nonce.hex
        try:
            os.stat(stem, dir_fd=fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            need(False)
    finally:
        os.close(fd)
    root = temporary + '/' + stem
    need(context['hostPaths'] == {'runRoot': root, 'work': root + '/work', 'prepare': root + '/prepare', 'cache': root + '/cache'}
         and context['inputManifestPin'] == {'sha256': SEALED_SHA, 'fileCount': 12, 'totalBytes': 242570240})
    pins, _ = r.source_requirements(repo)
    need(context['sourcePins'] == pins)
    r._require_commit_contents(repo, context['exactCommit'], pins)
    need(r.P.git_head(repo) == context['exactCommit'])
    memory = r.P.decode((repo / MEMORY).read_bytes())
    need(memory == {'version': 'helmut-w15-memory-check/2', 'comparisonBudgetBytes': 2048000000,
                    'minimumReservePercent': 20})
    runtime = context['runtimePins']
    need(type(runtime) is dict and set(runtime) == set(r.C.RUNTIME) | {'imageId'}
         and all(runtime[key] == value for key, value in r.C.RUNTIME.items())
         and type(runtime['imageId']) is str and re.fullmatch('sha256:[a-f0-9]{64}', runtime['imageId']))
    return {'status': 'PASS_MOCK500_CONTEXT_DECLARATIONS_ONLY_START_BLOCKED',
            'contextSHA256': hashlib.sha256(canonical(context)).hexdigest(),
            'memoryProfile': memory['version'], 'executionAuthority': False, 'mock500Acceptance': False}


def build_context(manifest, repo=REPO):
    r = component('runtime_inputs', repo)
    nonce = uuid.UUID(manifest['nonce'])
    root = manifest['runnerTemp'] + '/w15-mock500-' + manifest['runId'] + '-' + nonce.hex
    pins, _ = r.source_requirements(repo)
    need(all(manifest['sourcePins'].get(path) == pin for path, pin in pins.items()))
    context = {'schema': 'helmut-w15-mock500-controller-context/1', 'scope': SCOPE,
        **{key: manifest[key] for key in ('nonce', 'runId', 'runAttempt', 'exactCommit', 'runnerTemp')},
        'hostPaths': {'runRoot': root, 'work': root + '/work', 'prepare': root + '/prepare', 'cache': root + '/cache'},
        'uidMap': {'runnerUID': os.getuid(), 'runnerGID': os.getgid(), 'containerUID': 1000, 'containerGID': 1000},
        'inputManifestPin': {'sha256': SEALED_SHA, 'fileCount': 12, 'totalBytes': 242570240},
        'sourcePins': pins, 'runtimePins': {**r.C.RUNTIME, 'imageId': manifest['imageId']},
        'executionAuthority': False, 'testStarted': False}
    validate_context(context, repo)
    return context


def qualified_observation(context, raw, sha256, observed_context, repo=REPO):
    r = component('runtime_inputs', repo)
    observed = validate_context(context, repo)
    need(type(raw) is bytes and 0 < len(raw) <= 8 * 1024 * 1024
         and hashlib.sha256(raw).hexdigest() == sha256)
    qualification = r.P.decode(raw)
    need(canonical(qualification) == raw)
    r._validate_qualification(context, qualification, repo)
    need(type(observed_context) is dict and observed_context.get('mode') in ('mock500-full-gated', 'mock500-full-phased-gated')
         and observed_context == {key: context[key] for key in ('exactCommit', 'runId', 'runAttempt', 'nonce')}
         | {'branch': BRANCH, 'mode': observed_context['mode']})
    need(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
         and os.environ.get('GITHUB_SHA') == context['exactCommit'] and os.environ.get('GITHUB_REF') == BRANCH
         and os.environ.get('GITHUB_RUN_ID') == context['runId'] and os.environ.get('GITHUB_RUN_ATTEMPT') == '1')
    return {'schema': 'helmut-w15-mock500-qualified-runtime-observation/1',
        'status': 'PASS_STATIC_SOURCE_QUALIFICATION_AND_OBSERVED_MOCK_CONTEXT_BINDING',
        'exactCommit': context['exactCommit'], 'contextSHA256': observed['contextSHA256'],
        'sourcePins': qualification['sourcePins'], 'historicalDeltas': qualification['historicalDeltas'],
        'qualification': qualification, 'qualificationSHA256': sha256, 'observedContext': observed_context,
        'executionAuthority': False, 'testStarted': False}


def open_runtime_inputs(root, *, context, qualification_raw, qualification_sha256, observed_context, repo=REPO):
    """New explicit Mock adapter. The legacy End500 context remains unchanged."""
    r = component('runtime_inputs', repo)
    review = qualified_observation(context, qualification_raw, qualification_sha256, observed_context, repo)
    received = r.IP.verify_received(str(root), expected_transfer_context=TRANSFER,
        expected_sealed_manifest_sha256=SEALED_SHA, checkout_commit=context['exactCommit'], repo=Path(repo))
    return r.RuntimeInputs(r.TOKEN, received, context, review, Path(repo), canonical(review))
