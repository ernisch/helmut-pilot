"""SOURCE side of the explicitly requested, once-only native unit.

No CLI or connection default. The pinned supervisor selects this module only
for a fresh owned COPY. Preparing an input never installs authority. The source
verifier must observe the real read-only Node verifier, service, host and native
catalog before the separate genuine seed can be invoked.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import stat
import subprocess
import sys
import time

GATES = ('source', 'runtime', 'owner', 'calendar', 'costs', 'reservation', 'sender',
         'review', 'result', 'independentAcceptance')
BIN = Path(__file__).resolve().parent
SEED_CODE = {
    'llmUsageAtomic': 'llm-usage-atomic', 'authStateParts': 'auth-state-parts', 'authStoreCas': 'auth-store-cas',
    'euServiceContract': 'synthetik-500-eu-service-contract', 'profile': 'synthetik-500-profile',
    'streamingCanonicalHash': 'streaming-canonical-hash', 'canonicalContentFacts': 'canonical-content-facts',
    'cpuEpoch': 'synthetik-500-cpu-epoch', 'canonicalShaByteWriter': 'canonical-sha-byte-writer'}


def need(ok, code):
    if not ok:
        raise RuntimeError('native-execution-source-' + code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def sha(value):
    return hashlib.sha256(value.encode('utf8') if isinstance(value, str) else value).hexdigest()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def parse_utc(value):
    need(type(value) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z', value), 'utc-shape')
    parsed = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    need(parsed.isoformat(timespec='milliseconds').replace('+00:00', 'Z') == value, 'utc-roundtrip')
    return parsed


def private_json(worker, path, *, expected=None, cap=8 * 1024**2):
    """One stable private FD; never return unbounded or duplicate-key JSON."""
    p = Path(path)
    need(p.is_absolute() and p.resolve() == p, 'private-path')
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == 1000 and stat.S_IMODE(before.st_mode) == 0o600
             and before.st_nlink == 1 and 0 < before.st_size <= cap, 'private-file')
        chunks, size = [], 0
        while chunk := os.read(fd, 65536):
            size += len(chunk); need(size <= before.st_size, 'private-growth'); chunks.append(chunk)
        raw = b''.join(chunks)
        fields = ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        after, named = os.fstat(fd), p.lstat()
        need(size == before.st_size and all(getattr(before, k) == getattr(after, k) == getattr(named, k) for k in fields), 'private-drift')
        pin = {'path': str(p), 'bytes': size, 'sha256': sha(raw)}
        need(expected is None or pin == expected, 'private-pin')
        def unique(pairs):
            answer = {}
            for k, v in pairs:
                need(k not in answer, 'private-duplicate'); answer[k] = v
            return answer
        value = json.loads(raw.decode('utf8', errors='strict'), object_pairs_hook=unique,
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite')))
        return value, pin
    finally:
        os.close(fd)


def logical_pin(worker, nonce, name, value):
    worker.save('client/' + name, value)
    return {**worker.pin(worker.OUT / 'client' / name),
            'path': '/workspace/helmut-unit-diagnostic-native/' + nonce + '/' + name}


def code_files(worker, config):
    """Bind actual JS consumers and every SOURCE/controller implementation."""
    paths = {Path(p['path']) for p in config['sourceCodePins']}
    paths.update(Path(p['path']) for p in config['sources'] if Path(p['path']).suffix in ('.py', '.js', '.json', '.sql', '.c'))
    paths.update(BIN / name for name in (
        'local-unit-native-execution-source.py', 'local-unit-native-execution-host.py',
        'local-unit-native-source-qualification.py', 'local-unit-native-observation-updater.py',
        'local-unit-native-final-acceptance.py'))
    pins = [worker.pin(p) for p in sorted(paths)]
    need(0 < len(pins) <= 3000, 'code-closure')
    return pins


def command_input(worker, config, pg, catalog, ready, originals, expires_at):
    """Build honest preconditions; none claim that future native steps passed."""
    need(config.get('executeNativeSingleUnit') is True and config.get('full500') is False
         and config.get('motorCalls') == config.get('paidProviderCalls') == 0, 'explicit-single-unit')
    nonce, repo = config['nonce'], Path(config['repository'])
    code = code_files(worker, config)
    code_pin = logical_pin(worker, nonce, 'CODE_MANIFEST.SAFE.json',
                           {'schema': 'helmut-local-unit-diagnostic-code-manifest/1', 'files': code})
    bridge = worker.load('execution_bridge_source_expectations', config['bridgeQualifierPin'])
    actual_base = {f['name'] + '(' + f['identityArguments'] + ')': f['prosrcSHA256'] for f in catalog['functions']}
    future_helpers = bridge.expected_bridge_sources(config['bridgeProposalPin'])
    need(len(actual_base) == 27 and len(future_helpers) == 9 and not set(actual_base) & set(future_helpers), 'native-source-expectations')
    runtime_pins = {}
    code_names = {p['path'] for p in code}
    for row in config['runtimeBindings']:
        p = worker.pin(row['imagePath'])
        need(p == {**row['source'], 'path': row['imagePath']}, 'runtime-image-binding')
        runtime_pins[p['path']] = p
    for p in (config['nodePin'], worker.pin(config['pythonExecutable'])):
        runtime_pins[p['path']] = p
    # The JIT tree is public original runtime material, restored under the
    # measured parent. The client receives ONLY this /ram subpath read-only.
    jit = json.loads((worker.OUT / 'ORIGINAL_JIT_RESTORED.SAFE.json').read_bytes())
    for row in jit['files']:
        p = {k: row[k] for k in ('path', 'bytes', 'sha256')}
        need(worker.pin(p['path']) == p, 'actual-jit-file')
        runtime_pins[p['path']] = p
    need(not code_names & set(runtime_pins), 'disjoint-code-runtime')
    transport_originals = {key: originals[key] for key in ('preparedRequests', 'actualRequestBindings', 'providerFixtures')}
    producer = worker.pin(repo / 'lib/helmut/local-unit-diagnostic-original-producer.js')
    phases = {}
    for phase in ('D', 'R'):
        pins, observed = ready['derivedPins'][phase], ready['producerTransport']['phases'][phase]
        phases[phase] = {'sourceIntentId': ready['producerTransport']['sourceIntentIds'][phase],
            'requestPin': pins['request'], 'derivedResponsePin': pins['response'], 'derivedLatencyPin': pins['latency'],
            'responseStatus': observed['responseStatus'], 'latencyMs': observed['latencyMs'],
            'derivation': {'schema': 'helmut-local-unit-diagnostic-pure-producer-derivation/1',
                'producerPin': producer, 'inputPins': list(transport_originals.values()), 'originalPinsHash': sha(canonical(transport_originals)),
                'requestSHA256': pins['request']['sha256'], 'responseSHA256': pins['response']['sha256'], 'latencySHA256': pins['latency']['sha256']}}
    runtime = {'schema': 'helmut-local-unit-diagnostic-runtime-manifest/1', 'database': catalog['database'],
               'sqlSources': {**actual_base, **future_helpers}, 'files': list(runtime_pins.values()),
               'transport': {'schema': 'helmut-local-unit-diagnostic-source-producer-transport/1',
                             'originalPins': transport_originals, 'phases': phases}}
    need(sum(p['bytes'] for p in code + runtime['files']) <= 1024**3, 'complete-closure-budget')
    runtime_pin = logical_pin(worker, nonce, 'RUNTIME_MANIFEST.SAFE.json', runtime)
    facts = {'schema': 'helmut-local-unit-native-execution-preconditions/1', 'database': catalog['database'],
        'databaseOID': catalog['databaseOID'], 'nonce': nonce, 'sourceIndex': 499, 'diagnosticUnit': 0,
        'originalPostrunSHA256': config['raw']['sha256'], 'actualSourceNodeBudget': ready['actualNodeBudget'],
        'sourceSelectionHash': ready['selectionHash'], 'sourceProfileHash': ready['selectedProfileHash'],
        'sourceInputsHash': ready['selectedSourcesHash'], 'originalControlHash': ready['originalControlHash'],
        'requiresFreshSourceVerifier': True, 'requiresNativeReadAndBridgeQualification': True,
        'requiresActualOwnerAndClientQualification': True, 'requiresConfirmedPrivateSeed': True,
        'requiresFreshRuntimeObservations': True, 'requiresIndependentFinalAcceptance': True,
        'executionAuthorityInstalled': False, 'unit60Qualified': False, 'full500Qualified': False}
    facts_pin = logical_pin(worker, nonce, 'EXECUTION_PRECONDITIONS.SAFE.json', facts)
    gate_pins = {}
    for gate in GATES:
        document = {**facts, 'gate': gate}
        if gate == 'source':
            document.update(schema='helmut-local-unit-native-source-gate/1')
        gate_pins[gate] = logical_pin(worker, nonce, 'GATE_' + gate + '.SAFE.json', document)
    auth_pin = logical_pin(worker, nonce, 'AUTHORIZATION.SAFE.json', {
        'schema': 'helmut-local-unit-native-operator-request/1', 'nonce': nonce,
        'operatorInstruction': '2026-10-22 qualify preserved originals and run one isolated genuine native fixture unit',
        'maximumUnits': 1, 'freshGrantRequired': True, 'oldGOsReused': False,
        'production': False, 'paidProviderCallsAllowed': False, 'full500Authorized': False})
    now = utc()
    need(parse_utc(now) < parse_utc(expires_at), 'command-window')
    return {'schema': 'helmut-local-unit-native-command-input/1', 'nowUTC': now,
        'window': {'startsAtUTC': now, 'endsAtUTC': expires_at},
        'target': {'database': catalog['database'], 'postrunPin': config['raw'],
                   'ownerEvidencePin': facts_pin, 'runtimeEvidencePin': facts_pin, 'sourceRuntimePin': facts_pin},
        'gatePins': gate_pins, 'codeCommit': config['codeCommit'], 'runtimeManifestPin': runtime_pin,
        'authPin': auth_pin, 'freshGrantId': os.urandom(32).hex()}


class HostChannel:
    """Private pinned controllers, not a public JSON grant or retry channel."""
    def __init__(self, worker, config, selection):
        self.worker, self.config, self.selection = worker, config, selection
        self.seq, self.sealed = 0, False

    def call(self, stage, body, *, seconds=25):
        need(not self.sealed and self.seq < 32 and 0 < seconds <= 90, 'host-channel-open')
        self.seq += 1
        name = f'HOST_REQUEST_{self.seq:02d}.PRIVATE.json'
        now = datetime.datetime.now(datetime.timezone.utc)
        request = {'schema': 'helmut-local-unit-native-host-request/1', 'seq': self.seq, 'stage': stage,
            'nonce': os.urandom(32).hex(), 'selection': self.selection,
            'issuedAtUTC': now.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
            'expiresAtUTC': (now + datetime.timedelta(seconds=3)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'), 'body': body}
        try:
            self.worker.save(name, request)
            request_pin = self.worker.pin(self.worker.OUT / name)
            path, end = self.worker.OUT / f'HOST_REPLY_{self.seq:02d}.PRIVATE.json', time.monotonic() + seconds
            while not path.exists():
                self.worker.guard(self.config)
                need(time.monotonic() < end, 'host-reply-deadline')
                time.sleep(.025)
            reply, _ = private_json(self.worker, path)
            need(type(reply) is dict and set(reply) == {'schema', 'seq', 'stage', 'nonce', 'selection', 'requestSHA256',
                                                       'issuedAtUTC', 'expiresAtUTC', 'result'}
                 and reply['schema'] == 'helmut-local-unit-native-host-reply/1'
                 and all(reply[k] == request[k] for k in ('seq', 'stage', 'nonce', 'selection'))
                 and reply['requestSHA256'] == request_pin['sha256'], 'host-reply-binding')
            observed = datetime.datetime.now(datetime.timezone.utc)
            issued, expiry = parse_utc(reply['issuedAtUTC']), parse_utc(reply['expiresAtUTC'])
            need(issued <= observed < expiry and 0 < (expiry - issued).total_seconds() <= 3, 'host-reply-freshness')
            need(self.worker.pin(self.worker.OUT / name) == request_pin, 'host-request-drift')
            return reply['result']
        except BaseException:
            self.sealed = True
            raise


def node_environment(database):
    return {'PATH': '/usr/bin:/bin', 'HOME': '/ram', 'TMPDIR': '/ram', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC',
        'SUPABASE_URL': 'http://127.0.0.1:3000', 'HELMUT_STORAGE_BACKEND': 'supabase',
        'HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE': database, 'HELMUT_NATIVE_NODE_OLD_SPACE_MIB': '384',
        'HELMUT_LLM_USAGE_STORAGE': 'relational-atomic-v1', 'HELMUT_AUTH_STATE_STORAGE': 'merkle-auth-v1',
        'HELMUT_AUTH_HISTORY_READ_REUSE': 'verified-history-reuse-v1', 'HELMUT_AUTH_CONTROL_READ': 'verified-control-view-v1'}


class NodeChild:
    """Actual child identity and natural pipes, also for the long-lived service."""
    def __init__(self, worker, config, relative, flag, label):
        self.worker, self.config, self.label = worker, config, label
        script = Path(config['repository']) / relative
        self.script_pin = worker.pin(script)
        need(self.script_pin in config['sourceCodePins'], 'node-code-closure')
        self.child = subprocess.Popen([config['nodePin']['path'], '--max-old-space-size=384', '--max-semi-space-size=16', str(script), flag],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=node_environment(config['database']))
        worker.CHILDREN.append(self.child)
        observer = worker.load('native_execution_process_observer', config['sourceObserverPin'])
        self.process = observer.process_identity(self.child.pid)
        parent = observer.process_identity(os.getpid())
        need(self.process['parentPID'] == os.getpid() and self.process['exe'] == config['nodePin']['path']
             and self.process['membership'] == parent['membership'] == '0::/\n'
             and self.process['pidNamespace'] == parent['pidNamespace'], 'actual-node-child-process')
        self.selector, self.outputs, self.eof = selectors.DefaultSelector(), [bytearray(), bytearray()], [False, False]
        for i, stream in enumerate((self.child.stdout, self.child.stderr)):
            os.set_blocking(stream.fileno(), False); self.selector.register(stream, selectors.EVENT_READ, i)
        self.began, self.saved = time.monotonic(), False

    def poll(self):
        self.worker.guard(self.config)
        for key, _ in self.selector.select(.025):
            raw = os.read(key.fd, 16384)
            if not raw:
                self.eof[key.data] = True; self.selector.unregister(key.fileobj); continue
            need(len(self.outputs[key.data]) + len(raw) <= (131072 if key.data else 1048576), 'node-output-cap')
            self.outputs[key.data].extend(raw)

    def first_line(self, seconds=15):
        until = time.monotonic() + seconds
        while b'\n' not in self.outputs[0]:
            self.poll(); need(self.child.poll() is None and time.monotonic() < until, 'node-ready-deadline')
        need(self.outputs[0].count(b'\n') == 1 and not self.outputs[1], 'node-ready-only')
        return json.loads(bytes(self.outputs[0]).decode('utf8'))

    def finish(self, seconds=35, *, signal_child=False):
        if signal_child and self.child.poll() is None:
            import signal
            self.child.send_signal(signal.SIGTERM)
        until = time.monotonic() + seconds
        try:
            while self.selector.get_map() or self.child.poll() is None:
                self.poll(); need(time.monotonic() < until, 'node-exit-deadline')
            need(self.child.wait(timeout=.1) == 0 and all(self.eof) and not self.outputs[1], 'node-actual-exit-eof')
            need(self.worker.pin(self.script_pin['path']) == self.script_pin, 'node-final-code')
            return bytes(self.outputs[0])
        finally:
            self.save()

    def save(self):
        if self.saved:
            return
        self.saved = True
        self.selector.close()
        for i, stream in enumerate((self.child.stdout, self.child.stderr)):
            path = self.worker.OUT / (self.label + ('.STDOUT' if i == 0 else '.STDERR') + '.PRIVATE.log')
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as out:
                out.write(self.outputs[i]); out.flush(); os.fsync(out.fileno())
            stream.close()


def postgres_identity(worker, pg):
    values = Path('/proc', str(pg.pid), 'stat').read_text().rsplit(')', 1)[1].split()
    need(pg.poll() is None and values[0] not in ('Z', 'X'), 'postgres-live')
    return {'pid': pg.pid, 'startTicks': values[19], 'exePin': worker.pin(worker.PGBIN / 'postgres')}


def source_group(config):
    return {'path': '/owned-group', 'device': config['parentDevice'], 'inode': config['parentInode'], 'procMembership': '0::/\n'}
