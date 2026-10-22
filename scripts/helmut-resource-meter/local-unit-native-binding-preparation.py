"""Genuine source inputs and native bindings, preparation only.

Called inside the measured source worker after fresh POSTRUN restoration and
base DDL. No authority, observation, seed, claim, engine or provider is started.
The preparation command is deliberately NOT an executable grant. A subsequent
unit needs its own fresh verifier and complete owner/client qualification.
"""
import datetime
import ctypes
import hashlib
import json
import os
from pathlib import Path
import selectors
import subprocess
import time

GATES = ('source', 'runtime', 'owner', 'calendar', 'costs', 'reservation', 'sender',
         'review', 'result', 'independentAcceptance')
READERS = ('public.helmut_auth_state_graph_read_v1', 'public.helmut_auth_usage_read_v1')
PRIVATE_SOURCES = {
    'packet': ('FRESH_PACKET.PRIVATE.json', 1233928, '29cf691713b875c5a720882644963f9c2ca2dc39c51a4c284588d815c863cf44'),
    'install': ('native-end-preparation/run-combined500-synthetik500-resources21-f3375a7d5548/LOCAL_INSTALL_PINS.PRIVATE.json',
                586, '3ccf05233f012f42224abe97f5ec7e50c929df319c4bf6b7ddedd294d9ed268b'),
    'preparedRequests': ('NEW_PREPARED_REQUESTS.PRIVATE.json', 8209746,
                         '79498729160c30dd3aaccfcce3b5613b4f97e3a1b0074b83273e172f5455fb32'),
    'actualRequestBindings': ('ALL500_ACTUAL_REQUEST_TEMPLATE_BINDINGS.SAFE.json', 306392,
                              '8bef63b785b7afdf7a370080d108c2ce613dec40f7734a0d63766663d24dbbe0'),
    'providerFixtures': ('BOUND_LOCAL_PROVIDER_FIXTURES.PRIVATE.json', 1472456,
                         'ebf215088d81524a7bb5d1465a1f61f0064be541a98707400f9a6519e0fdcaa5'),
}
ENV_SOURCE = 'native-end-preparation/runtime-candidates/generated-materials/EXECUTION_ENV.PRIVATE.json'
ENV_SHA = '9fa2f9da31bf6e834fc94b7db67f17d328dfa8977a37e57a9debed2b9dfb7fd8'
POLICY_SHA = '274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04'


def need(ok, code):
    if not ok:
        raise RuntimeError('native-binding-preparation-' + code)


def canonical(value):
    # Every resulting command is compared with the actual JS canonical SHA.
    # No mismatch is repaired by substituting a different hash/command.
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def sha(raw):
    return hashlib.sha256(raw.encode('utf8') if isinstance(raw, str) else raw).hexdigest()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def source_functions(catalog):
    return [{k: v for k, v in row.items() if k != 'securityDefiner'} for row in catalog['functions']
            if row['name'] in READERS and row.get('securityDefiner') is False]


def logical_pin(worker, nonce, basename, value):
    path = worker.OUT / 'client' / basename
    worker.save('client/' + basename, value)
    return {**worker.pin(path), 'path': '/workspace/helmut-unit-diagnostic-native/' + nonce + '/' + basename}


def compact_private(worker, name, value):
    # The native Node reader rejects alternate serialization and duplicate keys.
    # Keep its exact compact JSON ABI; evidence files may remain pretty JSON.
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf8')
    destination = worker.OUT / name
    stage = worker.OUT / ('.' + name + '.stage-' + os.urandom(16).hex())
    fd = os.open(stage, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw); stream.flush(); os.fsync(stream.fileno())
    # Readers consume an input exactly once. Never expose a zero/partial file,
    # overwrite a prior attempt, or create a visible nlink=2 interval.
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renameat2
    rename.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(stage), -100, os.fsencode(destination), 1) != 0:
        error = ctypes.get_errno()
        raise OSError(error, 'native-binding atomic no-replace publication failed')
    directory = os.open(worker.OUT, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def prepare(worker, config, pg, catalog):
    """Return genuine command, without installing or granting its execution."""
    repo, nonce = Path(config['repository']), config['nonce']
    need(config.get('qualifyNativeBindings') is True and config['motorCalls'] == 0
         and config['paidProviderCalls'] == 0 and config['full500'] is False, 'preparation-scope')
    source = Path(config['originalSourceDirectory'])
    originals = {}
    for name, (relative, size, expected) in PRIVATE_SOURCES.items():
        actual = worker.pin(source / relative)
        need(actual['sha256'] == expected and (size is None or actual['bytes'] == size), 'original-pin-' + name)
        originals[name] = actual
    terminal = worker.pin(repo / 'docs/betrieb/belege/next-local-full500-20261021/V12_ACTUAL_TERMINAL.SAFE.json')
    need(terminal['bytes'] == 3336 and terminal['sha256'] == '1781a7b1b7acd5dc15368865eb2c262fb9ca058f4cd3a89dfd8f6a0108f88a8b', 'original-v12-terminal')
    originals['terminal'] = terminal
    env_path = source / ENV_SOURCE
    env_pin = worker.pin(env_path)
    need(env_pin['bytes'] == 2563 and env_pin['sha256'] == ENV_SHA, 'original-runtime-envelope')
    # The complete secret-bearing original remains read-only and source-private.
    # Only this exact non-secret publication policy field is materialized.
    policy = json.loads(env_path.read_text())['env']['HELMUT_PUBLICATION_ELIGIBILITY_JSON'].encode('utf8')
    need(len(policy) == 493 and sha(policy) == POLICY_SHA, 'original-policy-field')
    policy_path = worker.OUT / 'PUBLICATION_POLICY.PRIVATE.json'
    fd = os.open(policy_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(policy); stream.flush(); os.fsync(stream.fileno())
    need(worker.pin(env_path) == env_pin, 'original-runtime-envelope-drift')
    code = config['sourceCodePins']
    need(len(code) > 0 and len(code) <= 3000 and all(worker.pin(p['path']) == p for p in code), 'actual-code-closure')
    readers = source_functions(catalog)
    need(len(readers) == 2, 'actual-read-rpc-pins')
    pg_state = Path('/proc', str(pg.pid), 'stat').read_text().rsplit(')', 1)[1].split()
    node = config['nodePin']
    group = {'path': '/owned-group', 'device': config['parentDevice'], 'inode': config['parentInode'], 'procMembership': '0::/\n'}
    worker.OUT.joinpath('client').mkdir(mode=0o700)
    run_id = 'nachlauf500-' + str(time.time_ns() // 1000)
    issued_at = datetime.datetime.now(datetime.timezone.utc)
    issued = issued_at.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    expires = (issued_at + datetime.timedelta(seconds=180)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    preparation = {'schema': 'helmut-local-unit-native-prepare/1', 'nonce': nonce, 'runId': run_id,
                   'database': catalog['database'], 'issuedAtUTC': issued, 'expiresAtUTC': expires,
                   'selfPin': worker.pin(repo / 'scripts/helmut-resource-meter/local-unit-native-prepare.js'),
                   'nodePin': node, 'psqlPin': worker.pin(worker.PGBIN / 'psql'), 'sourceCodePins': code,
                   'readRPCPins': readers, 'postgres': {'pid': pg.pid, 'startTicks': pg_state[19],
                                                     'exePin': worker.pin(worker.PGBIN / 'postgres')},
                   'measuredCgroup': group, 'libraryPath': worker.LIBRARY_PATH,
                   'originalPins': originals, 'originalPublicationPolicyPin': worker.pin(policy_path)}
    compact_private(worker, 'PREPARE_CONFIG.PRIVATE.json', preparation)
    environment = {'PATH': '/usr/bin:/bin', 'HOME': '/ram', 'TMPDIR': '/ram', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC',
                   'SUPABASE_URL': 'http://127.0.0.1:3000', 'HELMUT_STORAGE_BACKEND': 'supabase',
                   'HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE': catalog['database'], 'HELMUT_NATIVE_NODE_OLD_SPACE_MIB': '384',
                   'HELMUT_LLM_USAGE_STORAGE': 'relational-atomic-v1', 'HELMUT_AUTH_STATE_STORAGE': 'merkle-auth-v1',
                   'HELMUT_AUTH_HISTORY_READ_REUSE': 'verified-history-reuse-v1', 'HELMUT_AUTH_CONTROL_READ': 'verified-control-view-v1'}
    child = subprocess.Popen([node['path'], '--max-old-space-size=384', '--max-semi-space-size=16',
                              preparation['selfPin']['path'], '--prepare-own-native-copy'], stdin=subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=environment)
    worker.CHILDREN.append(child)
    outputs, selector = [bytearray(), bytearray()], selectors.DefaultSelector()
    for index, stream in enumerate((child.stdout, child.stderr)):
        os.set_blocking(stream.fileno(), False); selector.register(stream, selectors.EVENT_READ, index)
    deadline, ready, supplied = time.monotonic() + 60, None, False
    try:
        while selector.get_map():
            worker.guard(config)
            need(time.monotonic() < deadline, 'genuine-inputs-deadline')
            for key, _ in selector.select(.05):
                block = os.read(key.fd, 16384)
                if not block:
                    selector.unregister(key.fileobj); continue
                need(len(outputs[key.data]) + len(block) <= (128 * 1024 if key.data else 1024 * 1024), 'child-output-cap')
                outputs[key.data].extend(block)
            if b'\n' in outputs[0] and not supplied:
                need(outputs[0].count(b'\n') == 1, 'one-ready-only')
                ready = json.loads(outputs[0].decode('utf8'))
                need(ready['schema'] == 'helmut-local-unit-native-prepare-ready/1' and ready['nonce'] == nonce
                     and ready['database'] == catalog['database'] and ready['process']['pid'] == child.pid
                     and ready['authorityInstalled'] is False and ready['unitExecutionQualified'] is False,
                     'actual-source-preparation-ready')
                # These documents bind observed preparation facts. They do not
                # pretend future owner/endpoint qualification has occurred.
                facts = {'schema': 'helmut-local-unit-native-preparation-facts/1', 'database': catalog['database'],
                         'databaseOID': catalog['databaseOID'], 'sourceIndex': 499, 'diagnosticUnit': 0,
                         'sourceProofHash': ready['sourceProofHash'], 'originalPostrunSHA256': config['raw']['sha256'],
                         'actualNodeBudget': ready['actualNodeBudget'], 'executionAuthority': False,
                         'nativeEndpointQualified': False, 'unit60Qualified': False, 'full500Qualified': False}
                facts_pin = logical_pin(worker, nonce, 'PREPARATION_FACTS.SAFE.json', facts)
                gate_pins = {}
                for gate in GATES:
                    value = {**facts, 'gate': gate, 'purpose': 'native bindings preparation only'}
                    if gate == 'source':
                        value.update(schema='helmut-local-unit-native-source-gate/1', originalControlHash=ready['originalControlHash'])
                    gate_pins[gate] = logical_pin(worker, nonce, 'GATE_' + gate + '.SAFE.json', value)
                runtime = {'schema': 'helmut-local-unit-diagnostic-runtime-manifest/1', 'database': catalog['database'],
                           'sqlSources': {}, 'files': [node], 'transport': {'preparationOnly': True}}
                # This preparatory manifest is explicitly insufficient for an
                # execution consumer. Actual final sources are recorded below.
                runtime_pin = logical_pin(worker, nonce, 'RUNTIME_MANIFEST.SAFE.json', runtime)
                logical_pin(worker, nonce, 'CODE_MANIFEST.SAFE.json', {'schema': 'helmut-local-unit-diagnostic-code-manifest/1', 'files': code})
                auth_pin = logical_pin(worker, nonce, 'AUTHORIZATION.SAFE.json', {
                    'schema': 'helmut-local-unit-native-preparation-authorization/1', 'nonce': nonce,
                    'operatorInstruction': '2026-10-22 qualify preserved originals and native single-unit integration',
                    'executionAuthority': False, 'oldGOsReused': False, 'full500': False})
                now = utc()
                compact_private(worker, 'COMMAND_INPUT.PRIVATE.json', {'schema': 'helmut-local-unit-native-command-input/1',
                    'nowUTC': now, 'window': {'startsAtUTC': now, 'endsAtUTC': expires},
                    'target': {'database': catalog['database'], 'postrunPin': config['raw'],
                               'ownerEvidencePin': facts_pin, 'runtimeEvidencePin': facts_pin, 'sourceRuntimePin': facts_pin},
                    'gatePins': gate_pins, 'codeCommit': config['codeCommit'], 'runtimeManifestPin': runtime_pin,
                    'authPin': auth_pin, 'freshGrantId': os.urandom(32).hex()})
                supplied = True
        child.wait(timeout=max(.01, deadline - time.monotonic()))
        need(child.returncode == 0 and supplied and outputs[0].count(b'\n') == 1 and not outputs[1], 'real-child-exit-and-eof')
        prepared_path = worker.OUT / 'client/PREPARED_COMMAND.PRIVATE.json'
        prepared_pin = worker.pin(prepared_path)
        need(prepared_pin['bytes'] <= 8 * 1024 * 1024, 'prepared-command-cap')
        prepared = json.loads(prepared_path.read_text())
        command_text = canonical(prepared['command'])
        need(sha(command_text) == prepared['selection']['commandHash']
             and prepared['selection']['operationId'] == 'localUnitDiagnostic-' + nonce, 'genuine-js-canonical-command')
        worker.save('GENUINE_SOURCE_PREPARATION.SAFE.json', {**ready, 'preparedCommandPin': prepared_pin,
            'actualChildExitCode': child.returncode, 'actualStdoutEOF': True, 'actualStderrEOF': True,
            'executionAuthority': False, 'motorCalls': 0, 'full500': False})
        return {'prepared': prepared, 'canonical': command_text, 'originalPins': originals, 'ready': ready}
    finally:
        selector.close()
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill(); child.wait(timeout=5)
        for index, (stream, data) in enumerate(zip((child.stdout, child.stderr), outputs)):
            stream.close()
            path = worker.OUT / ('SOURCE_PREPARATION.' + ('STDOUT' if index == 0 else 'STDERR') + '.PRIVATE.log')
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as output:
                output.write(data)


def qualify(worker, config, pg, catalog):
    value = prepare(worker, config, pg, catalog)
    read_helper = worker.load('native_original_read_closure', config['readClosurePin'])
    repo = Path(config['repository'])
    source_pins = {relative: worker.pin(repo / relative) for relative in (
        'supabase/proposals/auth_state_parts_local.sql', 'supabase/proposals/auth_usage_atomic_local.sql',
        'supabase/proposals/auth_read_bounded_local.sql')}
    trigger_helper = worker.load('native_original_trigger_qualification', config['originalTriggerQualifierPin'])
    trigger_sources = {**source_pins,
        'supabase/proposals/synthetik500_stored_command_binding.sql': worker.pin(repo / 'supabase/proposals/synthetik500_stored_command_binding.sql')}
    triggers = trigger_helper.qualify_original_triggers(worker.query, database=catalog['database'],
                                                       catalog=catalog, source_pins=trigger_sources)
    worker.save('NATIVE_ORIGINAL_TRIGGERS.SAFE.json', triggers)
    prepared = value['prepared']
    read_result = read_helper.install_read_closure(worker.query, database=catalog['database'],
        operation_id=prepared['selection']['operationId'], command_canonical=value['canonical'],
        command_sha256=prepared['selection']['commandHash'], source_pins=source_pins,
        authenticator_password_hex=os.urandom(32).hex())
    worker.save('NATIVE_READ_CLOSURE.SAFE.json', read_result)
    bridge = worker.load('native_original_bridge', config['bridgeQualifierPin'])
    bridge_result = bridge.install_bridge(worker.query, database=catalog['database'],
        operation_id=prepared['selection']['operationId'], command_canonical=value['canonical'],
        command_sha256=prepared['selection']['commandHash'], proposal_pin=config['bridgeProposalPin'],
        original_source_pins=catalog['originalSources'])
    # Relation policies include selected synthetic/source identifiers. The full
    # qualification stays private with the source; SAFE holds only hashes/counts.
    worker.save('NATIVE_ORIGINAL_BRIDGE.PRIVATE.json', bridge_result)
    q = bridge_result['qualification']
    worker.save('NATIVE_ORIGINAL_BRIDGE.SAFE.json', {
        'schema': 'helmut-local-unit-native-original-bridge-summary/1', 'database': catalog['database'],
        'qualificationSHA256': sha(canonical(q)), 'originalFunctionCount': len(q['originalSources']),
        'helperFunctionCount': len(q['helperSources']), 'nativeFunctionCount': len(q['nativeSources']),
        'relationCount': len(q['originalRelations']), 'executionAuthorityInstalled': False,
        'motorCalls': 0, 'full500': False})
    return {'schema': 'helmut-local-unit-native-binding-qualification/1', 'genuineSourceInputsQualified': True,
            'readClosureQualified': True, 'originalBridgeQualified': True, 'executionAuthorityInstalled': False,
            'motorCalls': 0, 'providerCalls': 0, 'full500': False, 'unit60Qualified': False,
            'full500ReserveQualified': False}
