#!/usr/bin/env python3
"""Source-local native qualification. No default run and no full500 entry.

Every workload starts below one fresh kernel parent. Originals are read-only
mounts. A preparation/DDL result is deliberately not an engine acceptance.
"""
import argparse
from contextlib import nullcontext
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import time
import types

BIN = Path(__file__).resolve().parent
REPO = BIN.parent.parent
BASE = Path('/workspace/helmut-ram-fix-20261020')
ARCH = BASE / 'architecture-correction-20261020'
SOURCE = Path('/workspace/helmut-parallel-20261015/wave20-resource-integration/attempt-f3375a7d5548')
RAW = Path('/workspace/helmut-parallel-20261015/wave19-resource-meter/full500-owned-storage21-f3375a7d5548/image.raw')
RAW_SHA = '54df2ecc0e4fdc22adf75f2ce3491d3c921e38296510543dcdadd48db3f37693'
OUT = Path('/workspace/helmut-unit-diagnostic-native')
JIT = BASE / 'auth-working-set-20261020/jit-closure-v2'
READER = BASE / 'next-single-go-20261020/postrun-canonical-readback-preparation/readonly_ext4.py'
LEGACY = BASE / 'next-full500-20261021/v12-http-lock-comparison/worker-http-lock.py'
COPY_MANIFEST = BASE / 'next-full500-20261021/v12-postrun-readback/COPIED_PGDATA_FILE_MANIFEST.SAFE.json'
PYTHON = Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/python')
NODE = Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node')
FLOOR = 8 * 1024**3
OWNER_RUNTIME_TARGETS = (
    '/lib64/ld-linux-x86-64.so.2',
    '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',
    '/usr/lib/x86_64-linux-gnu/libc.so.6',
    '/usr/lib/x86_64-linux-gnu/libgcc_s.so.1',
    '/usr/lib/x86_64-linux-gnu/libm.so.6',
    '/usr/lib/x86_64-linux-gnu/libstdc++.so.6',
)


def pin(path, *, single_link=True):
    path = Path(path)
    before = path.lstat()
    if path.resolve() != path or not stat.S_ISREG(before.st_mode) or before.st_nlink < 1 or single_link and before.st_nlink != 1:
        raise RuntimeError('canonical regular file with required link identity required')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        opened = os.fstat(fd)
        h, size = hashlib.sha256(), 0
        while chunk := os.read(fd, 1024 * 1024):
            h.update(chunk)
            size += len(chunk)
        after, named = os.fstat(fd), path.lstat()
        fields = ('st_dev', 'st_ino', 'st_mode', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        if any(getattr(before, k) != getattr(opened, k) or getattr(opened, k) != getattr(after, k)
               or getattr(after, k) != getattr(named, k) for k in fields) or size != opened.st_size:
            raise RuntimeError('source file changed during pin')
        return {'path': str(path), 'bytes': size, 'sha256': h.hexdigest()}
    finally:
        os.close(fd)


def save(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())


def load(name, path):
    module = types.ModuleType(name)
    module.__file__ = str(path)
    exec(compile(Path(path).read_bytes(), str(path), 'exec'), module.__dict__)
    return module


def available():
    v = os.statvfs('/workspace')
    return v.f_bavail * v.f_frsize


def memory_components_output(case, enabled):
    if not enabled:
        return nullcontext()
    fd = os.open(case / 'MEMORY_COMPONENTS.PRIVATE.jsonl',
                 os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    return os.fdopen(fd, 'w', encoding='utf-8')


def retain_memory_components(kernel, stream, parent, snapshot, sample_index):
    if stream is None:
        return
    row = kernel.memory_components_snapshot(parent, expected_identity=snapshot['groupIdentity'])
    anchor_begin = time.monotonic_ns()
    anchor_utc = datetime.datetime.now(datetime.timezone.utc).isoformat()
    anchor_end = time.monotonic_ns()
    row.update(sampleIndex=sample_index, kernelSampleElapsedSeconds=snapshot['elapsedSeconds'],
               clockAnchor={'observedAtUTC': anchor_utc,
                            'monotonicBeginNS': anchor_begin, 'monotonicEndNS': anchor_end,
                            'observationElapsedNS': anchor_end - anchor_begin if anchor_end >= anchor_begin else None,
                            'status': 'OBSERVED' if anchor_end >= anchor_begin else 'UNKNOWN',
                            'reason': None if anchor_end >= anchor_begin else 'CLOCK_REGRESSION',
                            'snapshotsAtomic': False})
    stream.write(json.dumps(row, allow_nan=False) + '\n')
    stream.flush()


def owner_runtime_bindings(rows):
    """Exact public ELF closure; original private runtime files keep their modes."""
    indexed = {row['imagePath']: row for row in rows}
    if len(indexed) != len(rows) or not set(OWNER_RUNTIME_TARGETS) <= set(indexed):
        raise RuntimeError('complete unique original owner runtime bindings required')
    return [indexed[target] for target in OWNER_RUNTIME_TARGETS]


def source_runtime_mounts(rows, plan, case):
    """Consume only measured, byte-identical copies at their original ABI paths."""
    originals = {row['imagePath']: row for row in rows}
    if len(originals) != len(rows) or any(row.get('readonly') is not True for row in rows):
        raise RuntimeError('duplicate source runtime target')
    replacements = {}
    if plan is not None:
        expected = {row['imagePath']: row for row in owner_runtime_bindings(rows)}
        copies, mounts = plan['ownerRuntimeCopies'], plan['sourceOwnerRuntimeMounts']
        if (len(copies) != len(expected) or len(mounts) != len(expected)
                or len({record['copy']['path'] for record in copies}) != len(copies)):
            raise RuntimeError('complete measured owner runtime copies required')
        for record in copies:
            if set(record) != {'originalSource', 'copy', 'imagePath', 'mode', 'installerContainerId'}:
                raise RuntimeError('exact owner runtime provenance required')
            target, copy = record['imagePath'], record['copy']
            if target not in expected or target in replacements or record['originalSource'] != expected[target]['source']:
                raise RuntimeError('owner runtime copy outside original closure')
            name = Path(copy['path'])
            if (set(copy) != {'path', 'bytes', 'sha256'} or name.parent != case / 'owner-public'
                    or not re.fullmatch('runtime-[0-9]{3}', name.name)
                    or (copy['bytes'], copy['sha256']) != (record['originalSource']['bytes'], record['originalSource']['sha256'])
                    or record['mode'] != (0o555 if target.endswith('/ld-linux-x86-64.so.2') else 0o444)
                    or record['installerContainerId'] not in plan['knownSetupContainerIds']):
                raise RuntimeError('own measured owner runtime copy binding required')
            replacements[target] = copy['path']
        if {tuple(row) for row in mounts} != {(source, target, True) for target, source in replacements.items()}:
            raise RuntimeError('owner runtime mount provenance mismatch')
    return [(Path(replacements.get(row['imagePath'], row['source']['path'])), row['imagePath'], True) for row in rows]


def bindings():
    rows = json.loads((ARCH / 'native-auth-input-preparation/READONLY_RUNTIME_BINDINGS.SAFE.json').read_text())['bindings']
    assert len(rows) == 548
    rows = list(rows)
    shell = json.loads((ARCH / 'auth-component-shell/SOURCE.SAFE.json').read_text())['file']
    rows.append({'imagePath': '/bin/sh', 'source': shell, 'readonly': True})
    compat = BASE / 'next-single-go-20261020/dio-component-python-compat-runtime'
    seen = {row['imagePath'] for row in rows}
    for name, meta in json.loads((compat / 'SOURCE_COMPAT_FILES.SAFE.json').read_text())['files'].items():
        target = '/' + meta['sourcePath']
        if target not in seen:
            rows.append({'imagePath': target, 'readonly': True,
                         'source': {'path': str(compat / name), 'bytes': meta['bytes'], 'sha256': meta['sha256']}})
            seen.add(target)
    for row in rows:
        if row['readonly'] is not True or pin(row['source']['path']) != row['source']:
            raise RuntimeError('native runtime binding drift')
    return rows


def identity(docker, cid, parent, runtime, mounts):
    row = json.loads(docker(['inspect', cid]).stdout)[0]
    h = row['HostConfig']
    if row['Id'] != cid or h['CgroupParent'] != '/' + parent or h['NetworkMode'] != 'none':
        raise RuntimeError('owned container identity drift')
    if not h['ReadonlyRootfs'] or h['CapAdd'] or h['Privileged'] or h['CapDrop'] != ['ALL']:
        raise RuntimeError('unexpected workload privileges')
    if row['Image'] != runtime['imageId'] or row['Config']['User'] != '1000:1000' or h['SecurityOpt'] != ['no-new-privileges']:
        raise RuntimeError('workload image/user/privilege binding drift')
    actual = {m['Destination']: m for m in row['Mounts'] if m['Type'] == 'bind'}
    if set(actual) != {str(target) for _, target, _ in mounts}:
        raise RuntimeError('actual bind mount closure differs')
    for source, target, readonly in mounts:
        observed = actual[str(target)]
        if observed['Source'] != str(source) or observed['RW'] == readonly or observed['Propagation'] != 'rprivate':
            raise RuntimeError('actual source mount or readonly binding drift')
    return row


def registered_setup_children(execution_module, native, case, parent, runtime):
    """Recover actual setup identities even when preparation returned no plan."""
    path = case / 'ALIAS_INSTALLER_CREATED.SAFE.json'
    if not path.exists():
        return set()
    if execution_module is None:
        raise RuntimeError('unexpected setup child registry')
    raw, _ = execution_module.read_file(path, 4096)
    record = execution_module.unique(raw)
    if set(record) != {'containerId'} or not re.fullmatch('[a-f0-9]{64}', record['containerId']):
        raise RuntimeError('invalid setup child registry')
    row = json.loads(native.docker(['inspect', record['containerId']]).stdout)[0]
    if (row['Id'] != record['containerId'] or row['HostConfig']['CgroupParent'] != '/' + parent
            or row['Image'] != runtime['imageId'] or row['State']['Running']):
        raise RuntimeError('setup child did not close in measured parent')
    return {record['containerId']}


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--qualify-native-store', action='store_true')
    modes.add_argument('--qualify-native-bindings', action='store_true',
                       help='qualify genuine source inputs and native read/write bindings; no seed or motor')
    modes.add_argument('--run-native-single-unit', action='store_true',
                       help='fresh source-local COPY; qualify all native bindings before exactly one isolated fixture unit')
    modes.add_argument('--diagnose-native-claim-only',action='store_true',
                       help='fresh genuine unseeded COPY+qualification+admission+seed; first real claim only, no motor or Unit acceptance')
    modes.add_argument('--diagnose-native-readonly-http', action='store_true',
                       help='fresh unseeded COPY+Owner+readonly endpoint qualification; stop before admission, seed or entry')
    modes.add_argument('--diagnose-native-transaction-guard', action='store_true',
                       help='fresh COPY+authority+seed; one genuine compiler SQL safety case, never Entry/Unit')
    parser.add_argument('--transaction-guard-case', choices=('state', 'same-root-usage', 'late-old-mirror', 'late-outside'))
    parser.add_argument('--profile-functions', action='store_true',
                        help='instrument only the explicit same-root-usage component; never an Entry/Unit run')
    args = parser.parse_args(argv)
    if args.diagnose_native_transaction_guard != (args.transaction_guard_case is not None):
        parser.error('transaction guard mode requires exactly one explicit transaction-guard-case')
    if args.profile_functions and not (args.diagnose_native_transaction_guard
                                      and args.transaction_guard_case == 'same-root-usage'):
        parser.error('function profiling requires the explicit same-root-usage component')
    return args


def transaction_guard_result(result, case):
    if (result.get('schema') != 'helmut-local-unit-native-transaction-guard-result/1'
            or result.get('diagnosticMode') != 'native-transaction-guard-v1' or result.get('transactionGuardCase') != case
            or any(result.get(k) is not True for k in ('transactionGuardObserved', 'executionAuthorityInstalled', 'reuseForbidden'))
            or any(result.get(k) is not False for k in ('scopeExecutionQualified', 'unit60Qualified', 'auth30Qualified',
                'independentFinalAcceptance', 'production', 'full500'))
            or any(type(result.get(k)) is not int or result[k] != 0 for k in ('actualEntryCalls', 'motorCalls', 'providerCalls',
                'completedUnits', 'expectedPositions', 'controlCount'))):
        raise RuntimeError('native transaction guard incomplete or exceeded scope')


def readonly_http_result(result):
    if (result.get('schema') != 'helmut-local-unit-native-readonly-http-result/1'
            or result.get('diagnosticMode') != 'readonly-http-pre-admission-v1'
            or any(result.get(k) is not True for k in ('readonlyHttpObserved', 'signedReadonlyContractObserved', 'publicationReadObserved'))
            or type(result.get('originalControlGraphReads')) is not int or result['originalControlGraphReads'] != 2
            or any(result.get(k) is not False for k in ('executionAuthorityInstalled', 'admissionPerformed', 'seedPerformed',
                'scopeClaimConsumed', 'runtimeReadMeasured', 'ownStateReadMeasured', 'unit60Qualified', 'auth30Qualified',
                'independentFinalAcceptance', 'production', 'full500'))
            or any(type(result.get(k)) is not int or result[k] != 0 for k in ('actualEntryCalls', 'motorCalls', 'providerCalls',
                'completedUnits', 'expectedPositions', 'controlCount'))):
        raise RuntimeError('readonly HTTP diagnostic incomplete or exceeded scope')
    captures = result.get('phaseCaptures')
    if type(captures) is not dict or set(captures) != {'endpoint', 'broker'}:
        raise RuntimeError('readonly HTTP private phase captures missing')
    for name, value in captures.items():
        if (type(value) is not dict or set(value) != {'pin', 'processClose', 'containerId'}
                or type(value['containerId']) is not str or not re.fullmatch('[0-9a-f]{64}', value['containerId'])
                or set(value['pin']) != {'path', 'bytes', 'sha256'}
                or not value['pin']['path'].endswith('/READONLY_HTTP_' + name.upper() + '_PHASES.PRIVATE.log')
                or type(value['pin']['bytes']) is not int or not 0 <= value['pin']['bytes'] <= 128 * 1024
                or not re.fullmatch('[0-9a-f]{64}', value['pin']['sha256'])
                or set(value['processClose']) != {'exitCode', 'stdoutNaturalEOF', 'stderrNaturalEOF', 'registeredHostPID'}
                or value['processClose']['exitCode'] != 0
                or any(value['processClose'][k] is not True for k in ('stdoutNaturalEOF', 'stderrNaturalEOF'))
                or type(value['processClose']['registeredHostPID']) is not int or value['processClose']['registeredHostPID'] <= 0):
            raise RuntimeError('readonly HTTP private phase capture incomplete')


def main():
    args = arguments()
    # This existing bootstrap also supplies the fresh Source/Host/Owner stack.
    # The readonly branch never installs execution authority or starts Entry.
    execution_mode=args.run_native_single_unit or args.diagnose_native_claim_only or args.diagnose_native_readonly_http or args.diagnose_native_transaction_guard
    bindings_mode = args.qualify_native_bindings or execution_mode
    if not (sys.flags.isolated and sys.flags.no_site and sys.flags.dont_write_bytecode):
        raise RuntimeError('use python -I -S -B')
    if available() < FLOOR + 2 * 1024**3:
        raise RuntimeError('persistent floor plus bounded native preparation capacity missing')
    raw = pin(RAW)
    if raw['bytes'] != 2147483648 or raw['sha256'] != RAW_SHA:
        raise RuntimeError('authentic original POSTRUN missing')
    native = load('local_unit_budget', BIN / 'native-memory-budget.py')
    kernel = load('local_unit_kernel', BIN / 'kernel-meter.py')
    runtime_path = ARCH / 'native-budget-implementation-qualification-v2/runtime/RUNTIME.SAFE.json'
    original_runtime = json.loads(runtime_path.read_text())
    # The preserved source code has a retained hardlink backup. It is read only
    # for provenance, never executed/mounted here. Check the same link count,
    # inode, times and bytes before/after instead of modifying either original.
    original_helper = pin(original_runtime['sourcePin']['path'], single_link=False)
    current_helper = pin(BIN / 'native-memory-budget-helper.c')
    if original_helper != original_runtime['sourcePin'] or any(original_helper[k] != current_helper[k] for k in ['bytes', 'sha256']):
        raise RuntimeError('original native helper source differs from integration source')
    # Fresh metadata for the new worktree: identical compiled image/source bytes.
    # The preserved runtime receipt is never edited or presented as this binding.
    runtime = {**original_runtime, 'sourcePin': current_helper}
    native.validate_runtime(runtime)
    runtime_rows = bindings()
    manifest_pin = pin(COPY_MANIFEST)
    if manifest_pin['bytes'] != 313128 or manifest_pin['sha256'] != 'e231e66ff343420e0fe79496833f7c21d00272507d050b92e0403796b4aef895':
        raise RuntimeError('original POSTRUN extraction manifest drift')
    plan = json.loads((JIT / 'JIT_CLOSURE_PLAN.SAFE.json').read_text())
    root_manifest = json.loads(Path(plan['rootManifest']['path']).read_text())
    library_names = {'libcom_err.so.2': 'libcom_err.so.2.1', 'libuuid.so.1': 'libuuid.so.1.3.0',
                     'libblkid.so.1': 'libblkid.so.1.1.0', 'libe2p.so.2': 'libe2p.so.2.3', 'libext2fs.so.2': 'libext2fs.so.2.4'}
    libraries = []
    for soname, original_name in library_names.items():
        original_path = 'usr/lib/x86_64-linux-gnu/' + original_name
        entry = root_manifest[original_path]
        if entry['type'] != '0':
            raise RuntimeError('original readonly library must be regular')
        libraries.append({'path': '/tmp/helmut-meter-filesystem-tools/lib/' + soname,
                          'originalPath': original_path, 'bytes': entry['size'], 'sha256': entry['sha256']})
    if libraries[-1]['sha256'] != 'dc840deeb5e4348fc46b8390527359309b230b53329cae237d2cc95f77699380':
        raise RuntimeError('qualified readonly native ABI drift')
    nonce = secrets.token_hex(16)
    OUT.mkdir(mode=0o700, exist_ok=True)
    out_info = OUT.lstat()
    if OUT.resolve() != OUT or not stat.S_ISDIR(out_info.st_mode) or out_info.st_mode & 0o077:
        raise RuntimeError('private canonical output directory required')
    case = OUT / nonce
    case.mkdir(mode=0o700)
    parent = 'helmut-meter-memorybudget-' + secrets.token_hex(12)
    sources = [pin(p) for p in [Path(__file__), BIN / 'local-unit-native-worker.py',
                               BIN / 'local-unit-diagnostic-store.sql', BIN / 'local-unit-native-role-qualification.py',
                               BIN / 'kernel-meter.py', BIN / 'native-memory-budget.py',
                               runtime_path, BIN / 'native-memory-budget-helper.c', READER, LEGACY, COPY_MANIFEST,
                               JIT / 'restore_original_jit.py', JIT / 'JIT_CLOSURE_PLAN.SAFE.json']]
    config = {'schema': 'helmut-local-unit-native-qualification/1', 'nonce': nonce,
              'repository': str(REPO), 'parent': parent, 'raw': raw, 'reader': pin(READER),
              'legacyHelper': pin(LEGACY), 'jitHelper': pin(JIT / 'restore_original_jit.py'),
              'roleQualifier': pin(BIN / 'local-unit-native-role-qualification.py'),
              'copyManifest': manifest_pin, 'nativeReaderLibraries': libraries,
              'runtime': runtime, 'originalBudgetRuntimePin': pin(runtime_path),
              'helperSourcePathReboundOnly': True,
              'sources': sources, 'runtimeBindings': runtime_rows, 'full500': False,
              'motorCalls': 0, 'paidProviderCalls': 0, 'oldAuthorityReused': False}
    if bindings_mode:
        status = subprocess.run(['git', 'status', '--porcelain', '--untracked-files=all'], cwd=REPO,
                                capture_output=True, text=True, check=True)
        if status.stdout:
            raise RuntimeError('native bindings require a committed clean integration worktree')
        code_commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=REPO, capture_output=True,
                                     text=True, check=True).stdout.strip()
        code_paths = sorted(set(REPO.glob('lib/**/*.js')) | set(REPO.glob('lib/**/*.json'))
                            | set((BIN).glob('*.js')))
        code_pins = [pin(p) for p in code_paths]
        if not 0 < len(code_pins) <= 3000:
            raise RuntimeError('bounded source code closure required')
        extra_sources = [BIN / 'local-unit-native-binding-preparation.py', BIN / 'local-unit-native-read-closure.py',
                         BIN / 'local-unit-native-bridge-qualification.py',
                         REPO / 'supabase/proposals/local_unit_original_bridge_local.sql',
                         REPO / 'supabase/proposals/auth_state_parts_local.sql',
                         REPO / 'supabase/proposals/auth_usage_atomic_local.sql',
                         REPO / 'supabase/proposals/auth_read_bounded_local.sql',
                         BIN / 'local-unit-native-original-trigger-qualification.py',
                         REPO / 'supabase/proposals/synthetik500_stored_command_binding.sql']
        extra_pins = [pin(p) for p in extra_sources]
        config.update(qualifyNativeBindings=True, originalSourceDirectory=str(SOURCE), nodePin=pin(NODE / 'bin/node'),
                      codeCommit=code_commit, sourceCodePins=code_pins, bindingPreparationPin=extra_pins[0],
                      readClosurePin=extra_pins[1], bridgeQualifierPin=extra_pins[2], bridgeProposalPin=extra_pins[3],
                      originalTriggerQualifierPin=extra_pins[7])
        config['sources'] = [*sources, *extra_pins, *code_pins]
    if execution_mode:
        execution_files = {
            'executionSourcePin': BIN / 'local-unit-native-execution-source.py',
            'executionControllerPin': BIN / 'local-unit-native-execution-controller.py',
            'executionHostPin': BIN / 'local-unit-native-execution-host.py',
            'sourceObserverPin': BIN / 'local-unit-native-source-qualification.py',
            'observationUpdaterPin': BIN / 'local-unit-native-observation-updater.py',
            'finalAcceptancePin': BIN / 'local-unit-native-final-acceptance.py'}
        execution_pins = {name: pin(path) for name, path in execution_files.items()}
        config.update(**execution_pins, executeNativeSingleUnit=True,
                      database='helmut_unit_diagnostic_' + nonce,
                      pythonExecutable=str(PYTHON / 'bin/python3.12'))
        config['sources'].extend(execution_pins.values())
        config['sources'].append(pin(config['pythonExecutable']))
        if args.diagnose_native_claim_only:
            config['nativeDiagnosticMode']='fresh-claim-only-v1'
            if not (BIN/'local-unit-native-claim-only.js').is_file():
                raise RuntimeError('reviewed claim-only client source missing')
        elif args.diagnose_native_readonly_http:
            config['nativeDiagnosticMode'] = 'readonly-http-pre-admission-v1'
        elif args.diagnose_native_transaction_guard:
            config['nativeDiagnosticMode'] = 'native-transaction-guard-v1'
            config['transactionGuardCase'] = args.transaction_guard_case
            probe = 'local-unit-native-transaction-guard.js'
            if args.profile_functions:
                config['transactionGuardFunctionProfile'] = True
                probe = 'local-unit-native-function-profile.js'
            config['transactionGuardProbePin'] = pin(BIN / probe)
            if config['transactionGuardProbePin'] not in config['sourceCodePins']:
                raise RuntimeError('transaction guard probe outside genuine code closure')
        # Host control plane only; never expose Docker/socket to SOURCE or the
        # client. The closed subprocess environment deliberately has no host PATH.
        config['hostDockerPin'] = pin('/usr/local/bin/docker')
        rest = SOURCE.parent / 'source-capture/postgrest-pinned'
        rest_pin = pin(rest)
        if rest_pin['bytes'] != 17309560 or rest_pin['sha256'] != '870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617':
            raise RuntimeError('original pinned PostgREST executable missing')
        config['executionHost'] = {'postgrestPin': rest_pin, 'clientRuntimePins': runtime_rows,
                                   'ownerRuntimeBindings': owner_runtime_bindings(runtime_rows)}
    save(case / 'STARTED.SAFE.json', {**config, 'availableBefore': available(),
                                      'purpose': ('Fresh source-local once-only genuine native fixture unit'
                                                  if args.run_native_single_unit else
                                                  'Fresh genuine first-claim-only diagnostic; no motor/Unit acceptance'
                                                  if args.diagnose_native_claim_only else
                                                  'Fresh genuine compiler transaction safety diagnostic; no Entry/Unit acceptance'
                                                  if args.diagnose_native_transaction_guard else
                                                  'Fresh source-local genuine source and native binding qualification only'
                                                  if bindings_mode else
                                                  'Fresh source-local readonly extraction and native DDL qualification only'),
                                      'authorization': 'Operator request 2026-10-22: qualify originals/runtime/native single-unit integration',
                                      'controlDeadlineSeconds': 300, 'privateTestSecretsRemainLocal': True,
                                      'originalResourcesModified': False, 'newFull500Authority': False,
                                      'atUTC': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    budget, cid, failure, close_errors, mounts = None, None, None, [], []
    execution_host, execution_plan, execution_module, result = None, None, None, None
    mounts_observed = False
    start = time.monotonic()
    sample_count = 0
    try:
        budget = native.start(case / 'native-memory-budget', parent, runtime)
        group = native.parent_path(parent)
        config.update(parentInode=group.stat().st_ino, parentDevice=group.stat().st_dev)
        if execution_mode:
            execution_module = load('native_execution_host', config['executionHostPin']['path'])
            execution_plan = execution_module.prepare_execution(native, sys.modules[__name__], config, case)
            config['executionHostPlan'] = execution_plan
        mounts = [(case, '/bench', False), (REPO, str(REPO), True), (PYTHON, str(PYTHON), True),
                  ((NODE / 'bin/node') if execution_mode else NODE,
                   str(NODE / 'bin/node') if execution_mode else str(NODE), True),
                  (group, '/owned-group', True), (RAW, str(RAW), True),
                  (READER.parent, str(READER.parent), True), (COPY_MANIFEST, str(COPY_MANIFEST), True),
                  (runtime_path, str(runtime_path), True),
                  (LEGACY, str(LEGACY), True), (JIT, str(JIT), True),
                  (Path(plan['archive']['path']), plan['archive']['path'], True),
                  (Path(plan['rootManifest']['path']), plan['rootManifest']['path'], True)]
        mounts.extend(source_runtime_mounts(runtime_rows, execution_plan, case))
        if bindings_mode:
            preparation = load('native_source_binding_preflight', config['bindingPreparationPin']['path'])
            required_originals = [SOURCE / row[0] for row in preparation.PRIVATE_SOURCES.values()]
            required_originals.append(SOURCE / preparation.ENV_SOURCE)
            mounts.extend((p, str(p), True) for p in required_originals)
        if execution_plan is not None:
            mounts.extend((Path(source), target, readonly) for source, target, readonly in execution_plan['sourceAliasMounts'])
        destinations = [str(target) for _, target, _ in mounts]
        if len(set(destinations)) != len(destinations):
            raise RuntimeError('duplicate mount target')
        argv = ['create', '--name', 'helmut-unitdiag-qualify-' + nonce, '--network', 'none', '--read-only',
                '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '1000:1000',
                '--cgroup-parent=/' + parent, '--cgroupns', 'private', '--log-driver', 'none',
                '--shm-size', str(16 * 1024**2),
                '--tmpfs', '/tmp/helmut-meter-filesystem-tools:rw,exec,nosuid,nodev,size=2097152,uid=1000,gid=1000,mode=0700',
                '--tmpfs', '/usr/lib/postgresql/17/lib:rw,exec,nosuid,nodev,size=1048576,uid=1000,gid=1000,mode=0755',
                '--entrypoint', '/bin/sh']
        if execution_plan is None:
            argv += ['--tmpfs', '/ram:rw,exec,nosuid,nodev,size=268435456,uid=1000,gid=1000,mode=0700']
        else:
            for volume_mount in execution_plan['sourceVolumeMounts']:
                argv += ['--mount', volume_mount]
            # A Docker deletion marker removes its automatic HOSTNAME. The
            # scoped closed CLI environment must not resolve a host value.
            argv += ['--env', 'HOSTNAME']
        for source, target, readonly in mounts:
            argv += ['--mount', 'type=bind,src=' + str(source) + ',dst=' + str(target) + (',readonly' if readonly else '')]
        worker = str(BIN / 'local-unit-native-worker.py')
        command = 'exec ' + str(PYTHON / 'bin/python3.12') + ' -I -S -B ' + worker + ' > /bench/BOOTSTRAP.PRIVATE.log 2>&1'
        argv += [runtime['imageId'], '-c', command]
        created = (execution_module.owned_docker(native, execution_plan['dockerConfigDirectory'], argv)
                   if execution_plan is not None else native.docker(argv))
        cid = created.stdout.strip()
        if not re.fullmatch('[a-f0-9]{64}', cid):
            raise RuntimeError('new container identity missing')
        # Publish the source CID once, after create and before its first
        # instruction. This SAFE configuration never includes local secrets.
        if execution_mode:
            config['actualSourceContainerId'] = cid
        save(case / 'WORKER_CONFIG.SAFE.json', config)
        identity(native.docker, cid, parent, runtime, mounts)
        mounts_observed = True
        save(case / 'CREATED.SAFE.json', {'id': cid, 'parent': parent, 'workloadStartsSealed': True})
        native.docker(['start', cid])
        if execution_plan is not None:
            execution_host = execution_module.NativeExecutionHost(native, sys.modules[__name__], config, case,
                                                                  budget, cid, mounts, execution_plan)
        with (case / 'KERNEL_SAMPLES.SAFE.jsonl').open('x') as stream, \
                memory_components_output(case, execution_mode) as components_stream:
            while True:
                if execution_host is not None:
                    execution_host.tick()
                row = identity(native.docker, cid, parent, runtime, mounts)
                snapshot = kernel.kernel_snapshot(parent)
                snapshot['elapsedSeconds'] = time.monotonic() - start
                stream.write(json.dumps(snapshot) + '\n')
                stream.flush()
                sample_count += 1
                retain_memory_components(kernel, components_stream, parent, snapshot, sample_count)
                if not row['State']['Running']:
                    break
                if time.monotonic() - start >= 300 or available() < FLOOR:
                    raise RuntimeError('bounded qualification control deadline/capacity')
                time.sleep(.25)
        exit_code = int(native.docker(['wait', cid]).stdout.strip())
        if exit_code != 0 or row['State']['OOMKilled']:
            raise RuntimeError('native qualification child failed')
        result = json.loads((case / 'NATIVE_QUALIFICATION.SAFE.json').read_text())
        if result.get('pass') is not True or result.get('motorCalls') != (1 if args.run_native_single_unit else 0) or result.get('full500') is not False:
            raise RuntimeError('native qualification incomplete')
        if bindings_mode and (result.get('genuineSourceInputsQualified') is not True
                                             or result.get('readClosureQualified') is not True
                                             or result.get('originalBridgeQualified') is not True
                                             or result.get('executionAuthorityInstalled') is not (execution_mode and not args.diagnose_native_readonly_http)):
            raise RuntimeError('genuine native binding qualification incomplete')
        if args.diagnose_native_readonly_http:
            readonly_http_result(result)
        if args.diagnose_native_transaction_guard:
            transaction_guard_result(result, args.transaction_guard_case)
            if args.profile_functions and result.get('functionProfileObserved') is not True:
                raise RuntimeError('function profile result not independently observed')
        if args.diagnose_native_claim_only:
            if result.get('schema')!='helmut-local-unit-native-claim-only-result/1' or result.get('diagnosticMode')!='fresh-claim-only-v1':
                raise RuntimeError('claim-only mode/result missing')
            if any(result.get(k) is not True for k in ('claimOnlyObserved','claimStillRunning','authorityConsumed','reuseForbidden')):
                raise RuntimeError('claim-only result not confirmed')
            if any(result.get(k) is not False for k in ('unit60Qualified','auth30Qualified','independentFinalAcceptance','production')) or any(type(result.get(k)) is not int or result[k]!=0 for k in ('motorCalls','providerCalls','completedUnits','expectedPositions','controlCount')):
                raise RuntimeError('claim-only must not claim Unit acceptance')
        if args.run_native_single_unit:
            if any(result.get(key) is not True for key in ('unit60Qualified', 'auth30Qualified', 'independentFinalAcceptance')):
                raise RuntimeError('independent single-unit acceptance incomplete')
            if result.get('completedUnits') != 1 or result.get('expectedPositions') != 3 or result.get('controlCount') != 16:
                raise RuntimeError('single-unit result and fresh controls incomplete')
    except BaseException as error:
        failure = type(error).__name__ + ': ' + str(error)[:240]
    finally:
        if execution_host is not None:
            try:
                host_close = execution_host.close()
                save(case / 'EXECUTION_HOST_CLOSE.SAFE.json', host_close)
                if host_close.get('clean') is not True:
                    close_errors.append('execution-host-not-clean')
            except BaseException as error:
                close_errors.append('execution-host-close-' + type(error).__name__)
        if cid:
            try:
                row = identity(native.docker, cid, parent, runtime, mounts)
                if row['State']['Running']:
                    native.docker(['stop', '--time', '35', cid], timeout=40)
                native.docker(['wait', cid], timeout=5)
            except BaseException as error:
                close_errors.append(type(error).__name__)
                try:
                    native.docker(['kill', '--signal', 'KILL', cid], timeout=5)
                    native.docker(['wait', cid], timeout=5)
                except BaseException as final_error:
                    close_errors.append(type(final_error).__name__)
        final = None
        if budget:
            try:
                group = native.parent_path(parent)
                if (group.stat().st_dev, group.stat().st_ino) != (config['parentDevice'], config['parentInode']):
                    raise RuntimeError('new parent identity changed')
                final = kernel.kernel_snapshot(parent, require_empty=True)
                native.verify(parent, budget)
                known = {entry['id'] for entry in budget['helpers'].values()} | ({cid} if cid else set())
                # Setup can fail after Docker create and before returning a
                # plan. Its O_EXCL registry still binds that actual child.
                known.update(registered_setup_children(execution_module, native, case, parent, runtime))
                if execution_plan is not None:
                    known.update(execution_plan['knownSetupContainerIds'])
                if execution_host is not None:
                    known.update(execution_host.clients)
                ids = native.docker(['ps', '--all', '--quiet']).stdout.split()
                rows = json.loads(native.docker(['inspect', *ids]).stdout) if ids else []
                observed = {r['Id'] for r in rows if r['HostConfig']['CgroupParent'] == '/' + parent
                            or r['HostConfig']['CgroupParent'].startswith('/' + parent + '/')}
                if observed != known:
                    raise RuntimeError('unregistered or missing container in measured parent')
            except BaseException as error:
                close_errors.append(type(error).__name__)
        accepted = failure is None and not close_errors and final is not None
        receipt = {'schema': ('helmut-local-unit-native-transaction-guard-supervisor-result/1' if args.diagnose_native_transaction_guard else
                             'helmut-local-unit-native-readonly-http-supervisor-result/1' if args.diagnose_native_readonly_http else
                             'helmut-local-unit-native-claim-only-supervisor-result/1' if args.diagnose_native_claim_only
                             else 'helmut-local-unit-native-qualification-result/1'), 'pass': accepted,
                   'failure': failure, 'closureErrors': close_errors, 'parent': parent, 'containerId': cid,
                   'kernelFinal': final, 'samples': sample_count, 'case': str(case), 'full500': False,
                   'motorCalls': 0, 'unit60Qualified': False, 'full500ReserveQualified': False,
                   'originalPostrunSHA256': RAW_SHA, 'originalMountedReadonly': mounts_observed,
                   'sourcePreflightMayWarmSharedCache': True, 'noCacheOrGCManipulation': True}
        if args.qualify_native_bindings:
            receipt.update(bindingQualificationRequested=True,
                           genuineNativeBindingsQualified=accepted, executionAuthorityInstalled=False)
        if args.run_native_single_unit:
            requested = (case / 'MOTOR_ENTRY_REQUESTED.SAFE.json').exists()
            peak = final['memoryPeakBytes'] if final is not None else None
            memory_events = final['memoryEvents'] if final is not None else {}
            measured_within_target = (accepted and type(peak) is int and peak <= 1548000000
                                      and all(memory_events.get(k) == 0 for k in ('max', 'oom', 'oom_kill', 'oom_group_kill')))
            receipt.update(singleUnitRequested=True, motorEntryRequested=requested,
                motorCalls=(result or {}).get('motorCalls', None if requested else 0),
                unit60Qualified=accepted and result.get('unit60Qualified') is True,
                auth30Qualified=accepted and result.get('auth30Qualified') is True,
                independentFinalAcceptance=accepted and result.get('independentFinalAcceptance') is True,
                measuredSingleUnitPeakMeetsTarget=measured_within_target,
                measuredSingleUnitReserveBytes=(2048000000 - peak) if type(peak) is int else None,
                full500ReserveQualified=False, full500Qualified=False,
                whole500MemoryOrPlateauInferred=False, maximumUnitsAuthorized=1)
        if args.diagnose_native_claim_only:
            receipt.update(claimOnlyRequested=True,diagnosticMode='fresh-claim-only-v1',diagnosticOnly=True,
                claimOnlyObserved=accepted and result.get('claimOnlyObserved') is True,
                claimStillRunning=(result or {}).get('claimStillRunning'),authorityConsumed=(result or {}).get('authorityConsumed'),
                reuseForbidden=True,completedUnits=0,expectedPositions=0,controlCount=0,
                unit60Qualified=False,auth30Qualified=False,independentFinalAcceptance=False,full500Qualified=False)
        if args.diagnose_native_transaction_guard:
            receipt.update(transactionGuardRequested=True, diagnosticMode='native-transaction-guard-v1', diagnosticOnly=True,
                transactionGuardCase=args.transaction_guard_case,
                transactionGuardObserved=accepted and result.get('transactionGuardObserved') is True,
                executionAuthorityInstalled=(result or {}).get('executionAuthorityInstalled'), reuseForbidden=True,
                actualEntryCalls=0, providerCalls=0, completedUnits=0, expectedPositions=0, controlCount=0,
                scopeExecutionQualified=False, unit60Qualified=False, auth30Qualified=False,
                independentFinalAcceptance=False, full500Qualified=False)
        if args.diagnose_native_readonly_http:
            receipt.update(readonlyHttpRequested=True, diagnosticMode='readonly-http-pre-admission-v1', diagnosticOnly=True,
                originalControlGraphReads=result.get('originalControlGraphReads') if accepted else 0,
                readonlyHttpObserved=accepted and result.get('readonlyHttpObserved') is True,
                signedReadonlyContractObserved=accepted and result.get('signedReadonlyContractObserved') is True,
                publicationReadObserved=accepted and result.get('publicationReadObserved') is True,
                phaseCaptures=result.get('phaseCaptures') if accepted else None,
                executionAuthorityInstalled=False, admissionPerformed=False, seedPerformed=False, scopeClaimConsumed=False,
                actualEntryCalls=0, providerCalls=0, completedUnits=0, expectedPositions=0, controlCount=0,
                runtimeReadMeasured=False, ownStateReadMeasured=False,
                unit60Qualified=False, auth30Qualified=False, independentFinalAcceptance=False, full500Qualified=False)
        save(case / 'RESULT.SAFE.json', receipt)
        print(json.dumps({'pass': accepted, 'case': str(case), 'failure': failure,
                          'closureErrors': close_errors, 'full500': False, 'motorCalls': receipt['motorCalls']}))
    return 0 if accepted else 1


if __name__ == '__main__':
    raise SystemExit(main())
