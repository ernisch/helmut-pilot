"""Explicit input/provenance adapter for the existing isolated End500 controller.

Opening the adapter observes bytes only. A separately supplied, externally
hash-bound current source review covers every changed historical source pin;
it never grants execution or GitHub data-provisioning authority.
"""
import sys
sys.dont_write_bytecode = True

import ast
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import uuid

HERE = Path(__file__).absolute().parent
REPO = HERE.parents[1]
TOKEN = object()


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


P = _load('w15_runtime_prepare', 'prepare.py')
IP = _load('w15_runtime_port', 'input_port.py')
C = _load('w15_runtime_context', 'controller_context.py')


class RuntimeInputError(ValueError):
    """Fixed public code only; no private data or paths in exceptions."""


def require(value):
    if not value:
        raise RuntimeInputError('RUNTIME_INPUT_BINDING_REJECTED')


def _public_bytes(repo, relative, maximum=16 * 1024 * 1024):
    parts = P.parts(relative)
    directory = C._directory(str(repo))
    fd = None
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = child
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
                and 0 <= before.st_size <= maximum)
        chunks, size = [], 0
        while chunk := os.read(fd, 1024 * 1024):
            size += len(chunk)
            require(size <= maximum)
            chunks.append(chunk)
        after = os.fstat(fd)
        require((before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                (after.st_size, after.st_mtime_ns, after.st_ctime_ns))
        return b''.join(chunks)
    finally:
        if fd is not None:
            os.close(fd)
        os.close(directory)


def _reports(repo):
    reports = {}
    for original, name, size, digest in IP.PUBLIC_PROVENANCE:
        relative = IP._REPORT_ROOT + name
        raw = _public_bytes(repo, relative)
        require(len(raw) == size and hashlib.sha256(raw).hexdigest() == digest)
        reports[name] = (original, relative, raw, P.decode(raw))
    return reports


def _historical_pins(reports):
    pins = []
    for name, field in (('JOURNAL_DRAIN_RESULTS_REVIEW.SAFE.json', 'actualSourcePins'),
                        ('MEMORY_PRESTART_REVIEW_D.SAFE.json', 'sourcePins')):
        for row in reports[name][3][field]:
            require(isinstance(row, dict) and set(row) >= {'path', 'bytes', 'sha256'})
            P.parts(row['path'])
            require(type(row['bytes']) is int and row['bytes'] >= 0 and P.SHA.fullmatch(row['sha256']))
            pins.append({key: row[key] for key in ('path', 'bytes', 'sha256')})
    for path, digest in reports['SQL_PREFLIGHT_D.SAFE.json'][3]['sourcePins'].items():
        P.parts(path)
        require(P.SHA.fullmatch(digest))
        pins.append({'path': path, 'bytes': None, 'sha256': digest})
    return pins


def source_requirements(repo=REPO):
    """Observe the exact public runtime closure; no review or start approval."""
    repo = Path(repo)
    reports = _reports(repo)
    historical = _historical_pins(reports)
    paths = {row['path'] for row in historical} | {
        'server.js', 'vercel.json', 'package.json', 'package-lock.json', C.FORWARD, C.CONTROLLER,
        C.AUDITOR, C.MEMORY, 'supabase/proposals/auth_usage_atomic_local.sql',
        'scripts/auth-usage-split.Dockerfile',
        'scripts/synthetik-500-w15-full500-materials.js', 'scripts/synthetik-500-w15-full500-audit.js',
        'scripts/synthetik-500-w15-processing-materials.js', 'scripts/fixtures/w15-full500-provider.js',
        'scripts/fixtures/w15-unit0-provider.js', 'scripts/fixtures/w15-full500-window.js',
        'scripts/fixtures/w15-current-mock-data.js',
        'docs/betrieb/belege/w15-atomic-usage-integration-20261028/D_RESULTS_INDEPENDENT_REVIEW.SAFE.json',
        'docs/betrieb/belege/w15-atomic-usage-integration-20261028/PREPARE.SAFE.json',
        'docs/betrieb/belege/w15-atomic-usage-integration-20261028/ATOMIC_AUTH_PREPARED0.SAFE.json',
        'docs/betrieb/belege/w15-atomic-usage-integration-20261028/ATOMIC_EU.SAFE.json',
        'docs/betrieb/belege/w15-atomic-usage-integration-20261028/SOURCE_COMPATIBILITY.SAFE.json'}
    tree = ast.parse(_public_bytes(repo, C.FORWARD))
    staged = next(ast.literal_eval(node.value) for node in tree.body
                  if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'STAGED_SCRIPTS'
                                                         for t in node.targets))
    require(isinstance(staged, list) and all(isinstance(p, str) for p in staged))
    paths.update('scripts/' + name for name in staged)
    for root in ('lib', 'scripts/w15-github', '.github/workflows', '.github/actions'):
        for file in (repo / root).rglob('*'):
            require(not file.is_symlink())
            if file.is_file() and not file.name.startswith('test_'):
                paths.add(str(file.relative_to(repo)))
    paths.update(row[1] for row in reports.values())
    result = {}
    for path in sorted(paths):
        raw = _public_bytes(repo, path)
        result[path] = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    return result, historical


def _deltas(current, historical):
    out = {}
    for row in historical:
        now = current[row['path']]
        if row['sha256'] == now['sha256'] and (row['bytes'] is None or row['bytes'] == now['bytes']):
            continue
        delta = {'path': row['path'], 'historicalBytes': row['bytes'],
                 'historicalSHA256': row['sha256'], 'currentBytes': now['bytes'],
                 'currentSHA256': now['sha256']}
        out[json.dumps(delta, sort_keys=True)] = delta
    return [out[key] for key in sorted(out)]


def _require_commit_contents(repo, exact_commit, current):
    """Compare raw public source bytes to Git blobs, without filters or hooks."""
    result = subprocess.run(['git', '--no-optional-locks', '-c', 'core.hooksPath=/dev/null',
                             '-c', 'core.fsmonitor=false', '-C', str(repo),
                             'ls-tree', '-rz', '--full-tree', exact_commit],
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            env={'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}, timeout=30)
    require(result.returncode == 0 and len(result.stdout) <= 16 * 1024 * 1024)
    entries = {}
    for record in result.stdout.split(b'\x00'):
        if not record:
            continue
        header, filename = record.split(b'\t', 1)
        mode, kind, digest = header.decode('ascii').split()
        name = filename.decode('utf-8')
        require(name not in entries)
        entries[name] = (mode, kind, digest)
    for path, pin in current.items():
        require(path in entries and entries[path][0] in ('100644', '100755') and entries[path][1] == 'blob')
        raw = _public_bytes(Path(repo), path)
        require(len(raw) == pin['bytes'] and hashlib.sha256(raw).hexdigest() == pin['sha256'])
        blob = b'blob ' + str(len(raw)).encode('ascii') + b'\x00' + raw
        require(hashlib.sha1(blob).hexdigest() == entries[path][2])


def validate_source_review(context, raw, expected_sha256, repo=REPO):
    """Bind an independently reviewed source record; never authorize a run."""
    try:
        require(isinstance(raw, bytes) and 0 < len(raw) <= 8 * 1024 * 1024
                and isinstance(expected_sha256, str) and P.SHA.fullmatch(expected_sha256)
                and hashlib.sha256(raw).hexdigest() == expected_sha256)
        validated = C.validate_context(context, repo)
        review = P.decode(raw)
        if isinstance(review, dict) and review.get('schema') == 'helmut-w15-qualified-runtime-observation/1':
            return _validate_observation(context, review, repo)
        require(isinstance(review, dict) and set(review) == {
            'schema', 'scope', 'status', 'contextSHA256', 'exactCommit', 'sourcePins',
            'historicalDeltas', 'executionAuthority', 'testStarted'})
        require(review['schema'] == 'helmut-w15-current-source-review/1'
                and review['scope'] == 'ISOLATED_GITHUB_END500_SOURCE_BINDINGS_ONLY'
                and review['status'] == 'PASS_INDEPENDENT_CURRENT_SOURCE_AND_ADAPTER_REVIEW'
                and review['executionAuthority'] is False and review['testStarted'] is False
                and review['exactCommit'] == context['exactCommit']
                and review['contextSHA256'] == validated['contextSHA256'])
        require(isinstance(review['sourcePins'], dict) and isinstance(review['historicalDeltas'], list))
        for path, pin in review['sourcePins'].items():
            P.parts(path)
            require(isinstance(pin, dict) and set(pin) == {'bytes', 'sha256'}
                    and type(pin['bytes']) is int and pin['bytes'] >= 0
                    and isinstance(pin['sha256'], str) and P.SHA.fullmatch(pin['sha256']))
        for delta in review['historicalDeltas']:
            require(isinstance(delta, dict) and set(delta) == {'path', 'historicalBytes',
                    'historicalSHA256', 'currentBytes', 'currentSHA256'})
            P.parts(delta['path'])
            require((delta['historicalBytes'] is None or type(delta['historicalBytes']) is int
                     and delta['historicalBytes'] >= 0)
                    and type(delta['currentBytes']) is int and delta['currentBytes'] >= 0
                    and all(isinstance(delta[key], str) and P.SHA.fullmatch(delta[key])
                            for key in ('historicalSHA256', 'currentSHA256')))
        current, historical = source_requirements(repo)
        require(review['sourcePins'] == current and review['historicalDeltas'] == _deltas(current, historical))
        _require_commit_contents(repo, context['exactCommit'], current)
        require(P.git_head(Path(repo)) == context['exactCommit'])
        return review
    except (Exception, KeyboardInterrupt):
        raise RuntimeInputError('CURRENT_SOURCE_REVIEW_REJECTED') from None


def _validate_qualification(context, qualification, repo):
    require(isinstance(qualification, dict) and set(qualification) == {
        'schema', 'scope', 'status', 'exactCommit', 'sourcePins', 'historicalDeltas',
        'executionAuthority', 'testStarted'})
    require(qualification['schema'] == 'helmut-w15-static-source-qualification/1'
            and qualification['scope'] == 'ISOLATED_GITHUB_W15_SOURCE_ONLY'
            and qualification['status'] == 'PASS_INDEPENDENT_STATIC_SOURCE_REVIEW'
            and qualification['exactCommit'] == context['exactCommit']
            and qualification['executionAuthority'] is False and qualification['testStarted'] is False)
    current, historical = source_requirements(repo)
    require(qualification['sourcePins'] == current
            and qualification['historicalDeltas'] == _deltas(current, historical))
    _require_commit_contents(repo, context['exactCommit'], current)
    require(P.git_head(Path(repo)) == context['exactCommit'])


def _validate_observation(context, review, repo):
    require(set(review) == {'schema', 'status', 'exactCommit', 'contextSHA256',
        'sourcePins', 'historicalDeltas', 'qualification', 'qualificationSHA256',
        'observedContext', 'executionAuthority', 'testStarted'})
    validated = C.validate_context(context, repo)
    qualification = review['qualification']
    raw = json.dumps(qualification, sort_keys=True, separators=(',', ':')).encode('ascii')
    require(hashlib.sha256(raw).hexdigest() == review['qualificationSHA256'])
    _validate_qualification(context, qualification, repo)
    observed = review['observedContext']
    require(isinstance(observed, dict) and set(observed) == {
        'exactCommit', 'branch', 'runId', 'runAttempt', 'mode', 'nonce'})
    require(observed == {key: context[key] for key in ('exactCommit', 'runId', 'runAttempt', 'nonce')}
            | {'branch': 'refs/heads/codex/w15-github-end500-preparation-20261028',
               'mode': observed['mode']})
    require(observed['mode'] in ('end500-restore-gated', 'end500-full-gated', 'end500-full-phased-gated', 'end500-restore-export-diagnostic', 'end500-restore-capacity-diagnostic', 'end500-full-capacity-diagnostic')
            and os.environ.get('GITHUB_ACTIONS') == 'true'
            and os.environ.get('GITHUB_SHA') == observed['exactCommit']
            and os.environ.get('GITHUB_REF') == observed['branch']
            and os.environ.get('GITHUB_RUN_ID') == observed['runId']
            and os.environ.get('GITHUB_RUN_ATTEMPT') == '1'
            and observed['runAttempt'] == 1)
    require(review['status'] == 'PASS_STATIC_SOURCE_QUALIFICATION_AND_OBSERVED_CONTEXT_BINDING'
            and review['exactCommit'] == context['exactCommit']
            and review['contextSHA256'] == validated['contextSHA256']
            and review['sourcePins'] == qualification['sourcePins']
            and review['historicalDeltas'] == qualification['historicalDeltas']
            and review['executionAuthority'] is False and review['testStarted'] is False)
    return review


def observe_source_qualification(context, qualification_raw, qualification_sha256, observed_context, repo=REPO):
    """Bind a pre-reviewed code record to a newly observed run, without claiming
    that the reviewer previously observed this future runner or its context.
    The externally approved digest covers the canonical static record.
    """
    try:
        require(isinstance(qualification_raw, bytes) and 0 < len(qualification_raw) <= 1024 * 1024)
        qualification = P.decode(qualification_raw)
        canonical = json.dumps(qualification, sort_keys=True, separators=(',', ':')).encode('ascii')
        require(qualification_raw == canonical and hashlib.sha256(canonical).hexdigest() == qualification_sha256)
        _validate_qualification(context, qualification, repo)
        validated = C.validate_context(context, repo)
        observation = {'schema': 'helmut-w15-qualified-runtime-observation/1',
            'status': 'PASS_STATIC_SOURCE_QUALIFICATION_AND_OBSERVED_CONTEXT_BINDING',
            'exactCommit': context['exactCommit'], 'contextSHA256': validated['contextSHA256'],
            'sourcePins': qualification['sourcePins'], 'historicalDeltas': qualification['historicalDeltas'],
            'qualification': qualification, 'qualificationSHA256': qualification_sha256,
            'observedContext': observed_context, 'executionAuthority': False, 'testStarted': False}
        _validate_observation(context, observation, repo)
        raw = json.dumps(observation, sort_keys=True, separators=(',', ':')).encode('ascii')
        return raw, hashlib.sha256(raw).hexdigest()
    except (Exception, KeyboardInterrupt):
        raise RuntimeInputError('STATIC_SOURCE_QUALIFICATION_REJECTED') from None


class RuntimeInputs:
    def __init__(self, token, received, context, review, repo, source_review_raw=None):
        require(token is TOKEN)
        self._received = received
        self._context = P.decode(json.dumps(context))
        self._review = P.decode(json.dumps(review))
        self._repo = Path(repo)
        self._source_review_raw = source_review_raw

    def controller_context(self):
        return P.decode(json.dumps(self._context))

    def source_review_bytes(self):
        require(isinstance(self._source_review_raw, bytes)
                and P.decode(self._source_review_raw) == self._review)
        return self._source_review_raw

    def backup_context(self):
        return {'schema': 'helmut-w15-backup-context/1',
                'scope': 'ISOLATED_GITHUB_END500_BACKUP_ONLY',
                **{key: self._context[key] for key in ('nonce', 'exactCommit', 'runId', 'runAttempt')},
                'inputManifestSHA': self._context['inputManifestPin']['sha256'],
                'recipientFingerprint': self._received.safe_summary()['transferContext']['recipientFingerprint'],
                'executionAuthority': False}

    def backup_input_files(self):
        return {key: self.path(key) for key in IP.R.PAYLOADS | IP.R.CONTROLS}

    def backup_provenance_files(self):
        return {name: self.report_path(name) for _, name, _, _ in IP.PUBLIC_PROVENANCE}

    def path(self, key):
        return self._received.resolve(self._received.original_pin(key))

    def original_path(self, key):
        return Path(self._received.original_pin(key)['path'])

    def resolve(self, pin):
        return self._received.resolve(pin)

    def report_bytes(self, name):
        require(name in _reports(self._repo))
        return _reports(self._repo)[name][2]

    def report(self, name):
        return P.decode(self.report_bytes(name))

    def report_path(self, name):
        reports = _reports(self._repo)
        require(name in reports)
        return self._repo / reports[name][1]

    def check_sources(self):
        current, historical = source_requirements(self._repo)
        require(current == self._review['sourcePins']
                and self._review['historicalDeltas'] == _deltas(current, historical)
                and P.git_head(self._repo) == self._context['exactCommit'])
        _require_commit_contents(self._repo, self._context['exactCommit'], current)

    def check_historical_source(self, pin):
        require(isinstance(pin, dict) and set(pin) >= {'path', 'sha256'})
        old = {'path': pin['path'], 'bytes': pin.get('bytes'), 'sha256': pin['sha256']}
        require(old in _historical_pins(_reports(self._repo)))
        current = self._review['sourcePins'][pin['path']]
        raw = _public_bytes(self._repo, pin['path'])
        require(len(raw) == current['bytes'] and hashlib.sha256(raw).hexdigest() == current['sha256'])
        if old['sha256'] == current['sha256'] and (old['bytes'] is None or old['bytes'] == current['bytes']):
            return
        require({'path': old['path'], 'historicalBytes': old['bytes'], 'historicalSHA256': old['sha256'],
                 'currentBytes': current['bytes'], 'currentSHA256': current['sha256']}
                in self._review['historicalDeltas'])

    def check_controller(self, *, work, prepare, cache, base, database, container, image):
        paths = self._context['hostPaths']
        nonce = uuid.UUID(self._context['nonce']).hex
        require((str(work), str(prepare), str(cache)) == (paths['work'], paths['prepare'], paths['cache'])
                and base == C.BASE and database == C.DATABASE
                and container == 'w15-end500-' + self._context['runId'] + '-' + nonce
                and image == self._context['runtimePins']['imageId'])
        self.check_sources()

    def safe_summary(self):
        return {'status': 'PASS_RUNTIME_INPUT_AND_CURRENT_SOURCE_BINDING_ONLY',
                'verifiedFiles': 12, 'verifiedBytes': 242570240,
                'sourceFiles': len(self._review['sourcePins']),
                'reviewedHistoricalDeltas': len(self._review['historicalDeltas']),
                'originalInputsModified': False, 'executionAuthority': False,
                'testStarted': False, 'readiness': 'SEPARATE_RUN_GO_AND_RUNTIME_GATES_REQUIRED'}


def open_inputs(root, *, context, expected_transfer_context, expected_sealed_manifest_sha256,
                source_review_raw, source_review_sha256, repo=REPO):
    review = validate_source_review(context, source_review_raw, source_review_sha256, repo)
    require(context['inputManifestPin']['sha256'] == expected_sealed_manifest_sha256)
    received = IP.verify_received(root, expected_transfer_context=expected_transfer_context,
                                  expected_sealed_manifest_sha256=expected_sealed_manifest_sha256,
                                  checkout_commit=context['exactCommit'], repo=repo)
    return RuntimeInputs(TOKEN, received, context, review, repo, source_review_raw)
