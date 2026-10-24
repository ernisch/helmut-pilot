#!/usr/bin/env python3
"""PREPARATION ONLY: exactly two preclassified disposable CAS heap PASS copies.
Default check prints a report; retirement needs separate fresh exact Root adoption.
No archive/backup qualification. Never deletes source, evidence or container hulls.
"""
import argparse
import copy
import datetime
import hashlib
import json
import os
import re
import stat
import subprocess
import time
import uuid
from pathlib import Path

BASE = Path(__file__).resolve().parent
CASES = Path('/workspace/helmut-ram-fix-20261020/cas-heap-20261021/cases')
SOURCE = Path('/workspace/helmut-ram-fix-20261020/next-single-go-20261020/postrun-canonical-readback/PGDATA_COPY_NOT_AN_ORIGINAL')
SOURCE_SHA = '827a9872003182a73dff6329f16e0f68aa429fbe680606b58c138668a8d23396'
FLOOR = 8 * 1024**3
CTX = BASE / 'ROOT_PASS_CASES_CONTEXT.PRIVATE.json'
EXPECTED_LAUNCHER_PIN = {"path":"/workspace/helmut-cpu-epoch-20261015/scripts/helmut-resource-meter/cas-heap-native-launcher/PREPARED.SAFE.json","bytes":67996,"sha256":"a30bc1a726a5002e7f5b3f5e6e4d9c24dab26630bd3806d027d0c5e46ece63e8"}
EXPECTED_HOST_PIN = {"path":"/workspace/helmut-cpu-epoch-20261015/scripts/helmut-resource-meter/cas-heap.py","bytes":2420,"sha256":"d1e4aec3c4327e20fafff7934ff52186c7ec54cec67dbdbbdb657d89958c19b3"}
EXPECTED_TWO_CASE_PLAN_PIN = {"path":"/workspace/helmut-ram-fix-20261020/cas-heap-20261021/ROOT_TWO_CASE_PLAN.SAFE.json","bytes":820,"sha256":"b4dfe25b96c3ff8160539da1993753ff228598692f66b191068e6fc82f58a833"}
EXPECTED_INTENT_PIN = {"path":"/workspace/helmut-ram-fix-20261020/cas-heap-20261021/ROOT_MEASUREMENT_INTENT.SAFE.json","bytes":8774,"sha256":"34f71d2eaad42706bfabc713ab34b8be6f011ecc7a24d5e0ce7da6c1d4579aa0"}
EXPECTED_LIFECYCLE_REVIEW_PATH = '/workspace/helmut-ram-fix-20261020/cas-heap-20261021/independent-review/LIFECYCLE_ACTUAL_REVIEW.SAFE.json'
EXPECTED_ACTUAL_REVIEW_PATH = '/workspace/helmut-ram-fix-20261020/cas-heap-20261021/independent-review/ACTUAL_REVIEW.SAFE.json'
EXPECTED_ROOT_VERIFICATION_PATH = '/workspace/helmut-ram-fix-20261020/cas-heap-20261021/ROOT_ACTUAL_REVIEW.SAFE.json'
EXPECTED_LIFECYCLE_REVIEW_PIN = {'path': EXPECTED_LIFECYCLE_REVIEW_PATH, 'bytes': 26117, 'sha256': '563028c75c2c48eefc23669479e35bdcc6b4f653c0a19864a68c58602592a969'}
EXPECTED_ACTUAL_REVIEW_PIN = {'path': EXPECTED_ACTUAL_REVIEW_PATH, 'bytes': 39335, 'sha256': 'f7ef4bf4e31cb71c5696e31f58ab45abda8ddc1dbb9b8f4041086e46f3d1b9d8'}
EXPECTED_ROOT_VERIFICATION_PIN = {'path': EXPECTED_ROOT_VERIFICATION_PATH, 'bytes': 5842, 'sha256': '0e0d47998242e787316eb504ba8136b468aaca39dd89404e37cb836057625d32'}
EXPECTED_RETENTION_DECISION_PIN = {'path': '/workspace/helmut-ram-fix-20261020/cas-heap-20261021/ROOT_PASS_COPY_RETENTION_DECISION.SAFE.json', 'bytes': 1981, 'sha256': '7a94af355507dea80ce32e1896695f692b0381d3799225a075cad18214d76e46'}
CURRENT_U_SHA = '3b88a424d33e4630dd35411ee6e1660811cc753184fb99822e9ad47ab1332c66'
BASE_U_SHA = '93917a57bf8714baea2a21a7ed06fbc6aeb2cd8081f54093b70b7134d0a31c3b'
COMMON_PARTS_SHA = 'f30089e790f2ac8bee306385a92f39440d5001ff84d22874b9e808540f469d63'
NEW_RENDERER_SHA = 'd02ac4844aaa10dd41c601a1e568398adf375f18810c6301bdab6040d11a1e32'
NEW_GRAPH_SHA = '4e2b9015790312d0b05e781ba6ef9a62cb13462167c47b6c9a998f27cdfb9ae0'
EXPECTED_HEAP_CONTRACT_PIN = {'path': '/workspace/helmut-ram-fix-20261020/cas-heap-20261021/sql-preparation/HEAP_CONTRACT.SAFE.json', 'bytes': 10426, 'sha256': '74f37ac8545dc4b692197bd051704be2c42150d4d28bd5c541a4763106ab19aa'}
HEAP_RENDERER_SHA = '4012154c41cc8b34a38d806e5f4c0741332467192363ec1c1df7b2692dc84252'
HEAP_CAS_SHA = 'f6f64a5039643798d67c5d25b43d8528a9c8acb6b2d92beb76620d9b917f5af8'
EXPECTED_RESULT_PINS = [
    {'path': '/workspace/helmut-ram-fix-20261020/cas-heap-20261021/cases/heap-68bb54a5d546f714223e7bc9/ACTUAL_RESULT.SAFE.json', 'bytes': 11372, 'sha256': '40bd0d0074915f7404ad6d1d2137361d9703e39c83c66ca114160076ead69ff9'},
    {'path': '/workspace/helmut-ram-fix-20261020/cas-heap-20261021/cases/heap-c35697a3832dc8dd58b21042/ACTUAL_RESULT.SAFE.json', 'bytes': 12128, 'sha256': '8cf6cb28631d2a180ae0c56a7d7afbd4f313b3b6550a441988fd35b65f9d5617'}]
PHASE_LABELS = ['driver.restore.beforeU', 'U.beforeSnapshotCapture', 'U.afterSnapshotCapture', 'U.afterPartsBuild',
                'driver.request.afterSerializationBeforeHTTP', 'driver.request.afterBodyObserverBeforeHTTP',
                'driver.request.afterRPCJSONParsed', 'U.beforeAttach', 'U.afterAttach', 'U.beforeReturn',
                'driver.afterU.beforeVerifyLogical', 'driver.afterVerifyLogical', 'driver.beforeFinalRead',
                'driver.afterFinalRead']
SPECS = {'heap-68bb54a5d546f714223e7bc9': {'mode': 'lifecycle-only', 'variant': 'NONE'},
         'heap-c35697a3832dc8dd58b21042': {'mode': 'cas-heap', 'variant': 'CURRENT'}}
AUTH_ROOT = '24bea8f26ed99b234b4d0c557ce8f80cbba205bc093797daff329b398b851633'
ORIGINAL_PHYSICAL_SHA = '9b62ab352733025f1b752e637f6360d7813b10ea86f134168698e8f4f0d11bc9'
HISTORY_SHA = '85af0c1168108966125f4ac4df5602a6a00fe04d03de16c0056bb22b3272fd68'
SOURCE_ROOT_IDENTITY = {'device': 27, 'inode': 169, 'mode': 448, 'uid': 1000, 'gid': 1000, 'links': 19, 'bytes': 4096, 'allocatedBytes': 4096, 'mtime_ns': 1792487833623423814, 'atime_ns': 1792487926568063929, 'ctime_ns': 1792487833623423814}

KNOWN_STAGE3_CID = '25c5a4f97713377f683b24172e34985386f4ee546296767d36170fb66e67da22'
KNOWN_STAGE3_PINS = {'plan': {'path': '/workspace/helmut-ram-fix-20261020/cleanup-20261020/old-two-pgdata-privileged-xattr-read-preparation/PLAN.SAFE.json', 'bytes': 17414, 'sha256': '8708f3d45db5645b8565096bf320a1b2388576d1fbb006de1017754318f3eb65'}, 'actual': {'path': '/workspace/helmut-ram-fix-20261020/cleanup-20261020/old-two-pgdata-privileged-xattr-read-preparation/ROOT_ACTUAL_METADATA.SAFE.json', 'bytes': 3202, 'sha256': '56996233a3956b891c53bcaf553d715c6ee537cf8c2a56fac720ac4aea611eeb'}, 'inspect': {'path': '/workspace/helmut-ram-fix-20261020/cleanup-20261020/old-two-pgdata-privileged-xattr-read-preparation/ROOT_STOPPED_INSPECT.PRIVATE.json', 'bytes': 10908, 'sha256': 'c77945bc0ba405455597db3ea813cb9d0db0c8119d3479a214e5d49b4036fa7d'}, 'output': {'path': '/workspace/helmut-ram-fix-20261020/cleanup-20261020/old-two-pgdata-privileged-xattr-read-preparation/ROOT_START_STDOUT.PRIVATE.json', 'bytes': 1866337, 'sha256': '98de12ee40d4860d51b6633b8e4f3fda2fda723f348732b43e4f528ad7761c22'}, 'source': {'path': '/workspace/helmut-ram-fix-20261020/cleanup-20261020/old-two-pgdata-privileged-xattr-read-preparation/metadata-only.c', 'bytes': 31261, 'sha256': '4f269b2f000e60dd29a3a1d3b131fad4fdeceba5db2dc34527332fedd62e5c0e'}}

def require(ok, why):
    if not ok:
        raise RuntimeError(why)

def canonical(path):
    p = Path(path)
    require(p.is_absolute() and p.resolve() == p, 'noncanonical path')
    for part in [p, *p.parents]:
        require(not part.is_symlink(), 'symlink ancestor')
    return p

def digest_stream(f):
    h = hashlib.sha256()
    while True:
        chunk = f.read(1024 * 1024)
        if not chunk:
            return h.hexdigest()
        h.update(chunk)

def pin(path):
    p = canonical(path)
    s = p.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_nlink == 1, 'nonexclusive regular proof')
    with p.open('rb') as f:
        digest = digest_stream(f)
    after = p.lstat()
    require((s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns) ==
            (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
            'proof changed during read')
    return {'path': str(p), 'bytes': s.st_size, 'sha256': digest}

def read_pin(p):
    require(pin(p['path']) == p, 'proof pin drift')
    return json.loads(Path(p['path']).read_text())

def free():
    s = os.statvfs('/workspace')
    return s.f_bavail * s.f_frsize

def save_new(path, value):
    canonical(path.parent)
    data = (json.dumps(value, indent=2, sort_keys=True) + '\n').encode()
    require(free() >= FLOOR + len(data) + 4096, 'host floor before proof write')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())

def docker(args):
    env = os.environ.copy()
    for key in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
        env.pop(key, None)
    r = subprocess.run(['docker', '--host=unix:///var/run/docker.sock', *args],
                       env=env, capture_output=True, text=True, timeout=30, check=True)
    return r.stdout

def overlaps(a, b):
    left, right = a.parts, b.parts
    return left[:len(right)] == right or right[:len(left)] == left

def canonical_mounts(mounts):
    return sorted(mounts, key=lambda row: json.dumps(row, sort_keys=True, separators=(',', ':')))

def metadata(s):
    return {'device': s.st_dev, 'inode': s.st_ino, 'mode': stat.S_IMODE(s.st_mode),
            'uid': s.st_uid, 'gid': s.st_gid, 'links': s.st_nlink,
            'bytes': s.st_size, 'allocatedBytes': s.st_blocks * 512,
            'mtime_ns': s.st_mtime_ns, 'atime_ns': s.st_atime_ns, 'ctime_ns': s.st_ctime_ns}

def identity_equal(actual, expected, directory_after_unlink=False):
    keys = ['device', 'inode', 'mode', 'uid', 'gid']
    if not directory_after_unlink:
        keys += ['bytes', 'links', 'mtime_ns', 'ctime_ns']
    require(all(actual[k] == expected[k] for k in keys), 'derived entry identity/metadata changed')

def snapshot(root):
    entries = []
    identities = set()
    device = root.lstat().st_dev
    def walk(path, relative):
        s = path.lstat()
        require(s.st_dev == device and not path.is_symlink() and s.st_uid == 1000,
                'mount crossing, foreign ownership or aliased derived entry')
        require((s.st_dev, s.st_ino) not in identities, 'repeated/aliased inode in derived tree')
        identities.add((s.st_dev, s.st_ino))
        require(not os.listxattr(path, follow_symlinks=False),
                'unpreserved extended attribute/ACL; preserve everything')
        row = {'relative': relative, **metadata(s)}
        if stat.S_ISDIR(s.st_mode):
            row['kind'] = 'directory'
            entries.append(row)
            for name in sorted(os.listdir(path)):
                walk(path / name, name if not relative else relative + '/' + name)
        else:
            require(stat.S_ISREG(s.st_mode) and s.st_nlink == 1, 'hardlinked/special derived file')
            row['kind'] = 'file'
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, 'rb') as f:
                identity_equal(metadata(os.fstat(f.fileno())), row)
                row['sha256'] = digest_stream(f)
                identity_equal(metadata(os.fstat(f.fileno())), row)
            entries.append(row)
    walk(root, '')
    return entries

def same_snapshot(root, entries):
    current = snapshot(root)
    require(len(current) == len(entries), 'entry inventory changed')
    for a, b in zip(current, entries):
        require(a['relative'] == b['relative'] and a['kind'] == b['kind'], 'entry closure changed')
        identity_equal(a, b)
        if a['kind'] == 'file':
            require(a['sha256'] == b['sha256'], 'derived content changed')

def host_users_many(roots, prepared):
    """One metadata sweep, same exact-reference rules as the verified parent.

    UID equality is not case membership. Unreadable unrelated global fields
    are reported, never turned into a complete absence-of-users claim.
    """
    parents = {'/' + prepared['cases'][name]['parent'] for name in SPECS}
    case_ids = {cid for record in prepared['cases'].values() for cid in record['containers']}
    seen, cmdlines, cgroups, unreadable = 0, 0, 0, []
    for process in Path('/proc').iterdir():
        if not process.name.isdigit() or int(process.name) == os.getpid():
            continue
        try:
            seen += 1; missing = []; relevant = False
            try:
                command = (process / 'cmdline').read_bytes().replace(b'\0', b' ').decode(errors='replace')
                cmdlines += 1
                require(not any(str(root) in command for root in roots), 'live host command references protected source/derived copy')
            except PermissionError:
                missing.append('cmdline')
            try:
                paths = [line.split(':', 2)[2] for line in (process / 'cgroup').read_text().splitlines()]
                cgroups += 1
                relevant = any(any(p == parent or p.startswith(parent + '/') for parent in parents) or
                               any(cid in p for cid in case_ids) for p in paths)
            except PermissionError:
                missing.append('cgroup')
            require(not relevant, 'live PID belongs to exact completed case cgroup/container')
            paths = []
            for field in ['cwd', 'root']:
                try: paths.append(os.readlink(process / field))
                except PermissionError: missing.append(field)
                except FileNotFoundError: pass
            try:
                links = list((process / 'fd').iterdir())
            except PermissionError:
                missing.append('fd'); links = []
            for link in links:
                try: paths.append(os.readlink(link))
                except FileNotFoundError: pass
                except PermissionError: missing.append('fd/' + link.name)
            try:
                paths += [line.split(None, 5)[5] for line in (process / 'maps').read_text().splitlines()
                          if len(line.split(None, 5)) == 6]
            except PermissionError:
                missing.append('maps')
            for value in set(paths):
                value = value.removesuffix(' (deleted)')
                if value.startswith('/'):
                    for p in [Path(os.path.abspath(value)), Path(value).resolve()]:
                        require(not any(p == root or p.is_relative_to(root) for root in roots),
                                'live host process uses protected source/derived copy')
            if missing:
                unreadable.append({'pid': int(process.name), 'unreadableFields': sorted(set(missing)),
                                   'exactCaseReferenceObserved': False})
        except (FileNotFoundError, ProcessLookupError):
            require(not process.exists(), 'live process changed during inspection; rerun check')
    return {'visiblePIDsAttempted': seen, 'readableCmdlines': cmdlines, 'readableCgroups': cgroups,
            'unreadableProcessMetadata': unreadable, 'invokingPIDExcluded': os.getpid(),
            'checkedRoots': [str(root) for root in roots], 'allTwoExactCaseGroupsAndContainerIDsClassified': True,
            'completeGlobalFDMapsInspectionClaimed': False, 'globalAbsenceOfUnobservableUsersProven': False}


def qualified_stage3_nsfs(by_id):
    """Only the pinned stopped Stage3 daemon-host namespace object; no fallback."""
    proof = {key: read_pin(value) for key, value in KNOWN_STAGE3_PINS.items() if key != 'source'}
    plan, actual, observed, output = (proof[key] for key in ['plan', 'actual', 'inspect', 'output'])
    require(pin(KNOWN_STAGE3_PINS['source']['path']) == KNOWN_STAGE3_PINS['source'] and
            plan['sourcePin'] == actual['sourcePin'] == KNOWN_STAGE3_PINS['source'], 'Stage3 reviewed source drift')
    require(actual['schema'] == 'helmut-stage3-privileged-xattr-root-actual/1' and
            actual['status'] == 'INITIAL_USERNS_VISIBLE_ZERO_XATTR_METADATA_QUALIFIED' and
            actual['cid'] == KNOWN_STAGE3_CID and actual['processEnded'] is True and
            actual['noOOM'] is True and actual['allBindsRO'] is True and
            KNOWN_STAGE3_PINS['inspect'] in actual['outputPins'] and
            KNOWN_STAGE3_PINS['output'] in actual['outputPins'], 'Stage3 actual proof binding')
    require(output['schema'] == 'helmut-two-derived-pgdata-privileged-xattr-inventory/1' and
            output['complete'] is True and output['initialUserNamespaceQualified'] is True and
            output['initialUserNamespaceDevice'] == 4 and output['initialUserNamespaceInode'] == 4026531837 and
            output['namespaceSource'] == 'daemon-host-literal-/proc/1/ns/user' and
            output['kernelABIRelease'] == '6.18.55' and output['internalReadonlySeccompInstalled'] is True and
            output['postFilterReadSyscallsAllowed'] is False and output['payloadReads'] is False and
            output['allNamespacesXattrCompletenessClaimed'] is False and
            output['archivalOrRetirementQualification'] is False, 'Stage3 actual NSFS identity/proof scope')
    require(plan['internalBeforeSubjects']['nsfsMagic'] == '0x6e736673' and
            plan['internalBeforeSubjects']['NS_GET_NSTYPE'] == 'CLONE_NEWUSER' and
            plan['internalBeforeSubjects']['requiredInitialUsernsInode'] == 4026531837,
            'Stage3 reviewed NSFS/type contract')
    require(len(observed) == 1 and observed[0]['Id'] == KNOWN_STAGE3_CID and KNOWN_STAGE3_CID in by_id,
            'exact retained Stage3 CID required')
    frozen = observed[0]; current = by_id[KNOWN_STAGE3_CID]
    mounts = [{'Type': m['type'], 'Source': m['source'], 'Destination': m['destination'],
               'Mode': '', 'RW': not m['readOnly'], 'Propagation': m['propagation']} for m in plan['mounts']]
    binds = [{'Type': m['type'], 'Source': m['source'], 'Target': m['destination'], 'ReadOnly': m['readOnly'],
              'BindOptions': {'Propagation': m['propagation'], 'NonRecursive': True}} for m in plan['mounts']]
    require(len(mounts) == 4 and all(m['recursive'] == 'disabled' for m in plan['mounts']) and
            canonical_mounts(current['Mounts']) == canonical_mounts(frozen['Mounts']) == canonical_mounts(mounts) and
            canonical_mounts(current['HostConfig']['Mounts']) == canonical_mounts(frozen['HostConfig']['Mounts']) == canonical_mounts(binds),
            'exact four Stage3 complete RO/nonrecursive mount dictionaries required')
    require(all(current[key] == frozen[key] for key in ['Id', 'Name', 'Image', 'State']) and
            current['Image'] == plan['expectedExistingImageId'] and
            all(current['HostConfig'][key] == frozen['HostConfig'][key] for key in
                ['CgroupParent', 'ReadonlyRootfs', 'CapAdd', 'CapDrop', 'Privileged', 'UsernsMode', 'NetworkMode', 'SecurityOpt']),
            'Stage3 identity/configuration/restart drift')
    state = current['State']
    require(state['Status'] == 'exited' and state['Running'] is False and state['Pid'] == 0 and
            state['ExitCode'] == 0 and state['OOMKilled'] is False and state['Error'] == '' and
            not state['Paused'] and not state['Restarting'] and not state['Dead'], 'Stage3 no longer closed cleanly')
    mount = {'Type': 'bind', 'Source': '/proc/1/ns/user', 'Destination': '/host-init-userns',
             'Mode': '', 'RW': False, 'Propagation': 'rprivate'}
    require(mount in mounts, 'single exact Stage3 namespace mount required')
    return mount


def quiescent_all(data, prepared):
    """Single full Docker inventory and host sweep for all6IDs/two groups."""
    started = time.time()
    ids = docker(['ps', '--all', '--quiet']).split()
    rows = json.loads(docker(['inspect', *ids])) if ids else []
    by_id = {row['Id']: row for row in rows}
    known_nsfs = qualified_stage3_nsfs(by_id)
    expected_ids = {cid for record in prepared['cases'].values() for cid in record['containers']}
    require(len(expected_ids) == 6 and expected_ids <= set(by_id), 'all6 exact retained case CIDs present')
    groups = {}; roots = {}
    for name, (root, candidate, result) in data.items():
        spec = spec_for(name); containers = candidate['containers']; expected_rows = prepared['cases'][name]['containers']
        require({x['role'] for x in containers} == {'control-cache-probe-worker', 'holder', 'setter'} and
                len(containers) == 3 and {x['id'] for x in containers} == set(expected_rows), 'exact three containers per case')
        for expected in containers:
            row = by_id[expected['id']]; state = row['State']
            require(row['Id'] == expected['id'] and row['Name'] == '/' + expected['name'] and
                    row['HostConfig']['CgroupParent'] == '/' + spec['parent'], 'container identity drift')
            identity = {'Id': row['Id'], 'Name': row['Name'], 'Image': row['Image'],
                        'CgroupParent': row['HostConfig']['CgroupParent'], 'Mounts': canonical_mounts(row['Mounts'])}
            expected_identity = {**expected_rows[row['Id']], 'Mounts': canonical_mounts(expected_rows[row['Id']]['Mounts'])}
            require(identity == expected_identity, 'exact prepared full container/mount identity drift')
            require(state['Running'] is False and state['Pid'] == 0 and state['Status'] == 'exited' and
                    state['ExitCode'] == 0 and not state['Paused'] and not state['Restarting'] and
                    not state['OOMKilled'], 'one of6 case containers no longer closedPASS')
            if expected['role'] == 'control-cache-probe-worker':
                require(row['Id'] == spec['cid'] and state['StartedAt'] == result['actualContainerClosure']['state']['StartedAt'] and
                        state['FinishedAt'] == result['actualContainerClosure']['state']['FinishedAt'], 'worker identity/restart drift')
        group = canonical(Path('/sys/fs/cgroup') / spec['parent'])
        require(group.stat().st_ino == result['nativeBudgetAfterLastExit']['actualParentInode'], 'group inode drift')
        require(dict(x.split() for x in (group / 'cgroup.events').read_text().splitlines())['populated'] == '0', 'one of two groups populated')
        require(all(not f.read_text().strip() for f in group.rglob('cgroup.procs')), 'owned process still live')
        groups[name] = {'closedCaseContainerIDs': [x['id'] for x in containers], 'emptyGroup': str(group)}
        roots[name] = root
    for row in rows:
        for mount in row['Mounts']:
            if mount.get('Source'):
                require(Path(mount['Source']).is_absolute(), 'unexpected relative Docker mount source')
                source = Path(os.path.abspath(mount['Source']))
                if row['Id'] == KNOWN_STAGE3_CID and mount == known_nsfs:
                    require(not any(overlaps(root, source) for root in [SOURCE, *roots.values()]),
                            'known NSFS source unexpectedly overlaps protected path lexically')
                    # Device4 NSFS user namespace inode is not a PGDATA filesystem path alias.
                    # Do not dereference this one daemon-host magiclink in the execution sandbox.
                    continue
                resolved = Path(mount['Source']).resolve()
                require(not row['State']['Running'] or not (overlaps(SOURCE, source) or overlaps(SOURCE, resolved)),
                        'protected canonical base has running Docker binding')
                for name, root in roots.items():
                    if overlaps(root, source) or overlaps(root, resolved):
                        expected_rows = prepared['cases'][name]['containers']
                        require(row['Id'] in expected_rows and not row['State']['Running'] and
                                mount in expected_rows[row['Id']]['Mounts'] and source == resolved and
                                canonical(source) in [root, root.parent, root.parent.parent],
                                'unknown/running/aliased Docker bind overlaps derived directory')
    processes = host_users_many([SOURCE, *roots.values()], prepared)
    require(set(ids) == set(docker(['ps', '--all', '--quiet']).split()), 'Docker inventory changed')
    require(free() >= FLOOR, 'host floor violated')
    return {'observedAtUnix': started, 'completedAtUnix': time.time(), 'cases': groups,
            'hostProcessInspection': processes, 'allDockerMountsInspected': True,
            'all6ClosedCIDsAndTwoEmptyGroupsVerified': True, 'protectedBaseNoRunningDockerBindings': True,
            'onlyExactStoppedOwnedOverlappingBindsAllowed': True, 'dockerFullInspectCalls': 1, 'hostProcessSweeps': 1,
            'singleKnownStage3NSFSObjectExemption': {'cid': KNOWN_STAGE3_CID, 'mount': known_nsfs,
                'device': 4, 'inode': 4026531837, 'proofPins': KNOWN_STAGE3_PINS,
                'executionSandboxProcPermissionBypassed': False, 'otherMountResolutionUnchanged': True}}


def unlink_exact(root, entries):
    rootfd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    def parent_fd(relative):
        parts = Path(relative).parts; fd = os.dup(rootfd)
        try:
            for part in parts[:-1]:
                new = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                os.close(fd); fd = new
            return fd, parts[-1]
        except BaseException:
            os.close(fd); raise
    before_free = free(); removed = 0
    try:
        identity_equal(metadata(os.fstat(rootfd)), entries[0])
        for row in entries:
            if row['kind'] != 'file': continue
            directory, leaf = parent_fd(row['relative'])
            try:
                fd = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
                with os.fdopen(fd, 'rb') as f:
                    identity_equal(metadata(os.fstat(f.fileno())), row)
                    require(digest_stream(f) == row['sha256'], 'last-moment file digest drift')
                    identity_equal(metadata(os.fstat(f.fileno())), row)
                    identity_equal(metadata(os.stat(leaf, dir_fd=directory, follow_symlinks=False)), row)
                    os.unlink(leaf, dir_fd=directory); removed += 1
            finally: os.close(directory)
        for row in sorted((x for x in entries if x['kind'] == 'directory' and x['relative']),
                          key=lambda x: len(Path(x['relative']).parts), reverse=True):
            directory, leaf = parent_fd(row['relative'])
            try:
                identity_equal(metadata(os.stat(leaf, dir_fd=directory, follow_symlinks=False)), row, True)
                os.rmdir(leaf, dir_fd=directory)
            finally: os.close(directory)
        identity_equal(metadata(os.fstat(rootfd)), entries[0], True)
        require(not os.listdir(rootfd), 'unexpected entry after exact retirement')
        identity_equal(metadata(root.lstat()), entries[0], True)
        os.rmdir(root)
    finally: os.close(rootfd)
    return removed, before_free

def load_context():
    require(CTX.parent == BASE and CTX.name == 'ROOT_PASS_CASES_CONTEXT.PRIVATE.json', 'fixed Root context')
    s = CTX.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_uid == 1000 and stat.S_IMODE(s.st_mode) == 0o600,
            'private Root context required')
    value = json.loads(CTX.read_text())
    require(value['schema'] == 'helmut-cas-heap-disposable-pass-context/1' and
            value['scriptPin'] == pin(Path(__file__).resolve()) and set(value['cases']) == set(SPECS),
            'exact two-case Root context/script required')
    require(value['allTwoMeasurementsCompleted'] is True and value['allNecessaryEvidenceRetained'] is True
            and value['bothCasesIndependentlyAccepted'] is True
            and value['twoCasePlanPin'] == EXPECTED_TWO_CASE_PLAN_PIN
            and value['measurementIntentPin'] == EXPECTED_INTENT_PIN
            and value['hostEntryPin'] == EXPECTED_HOST_PIN
            and pin(EXPECTED_HOST_PIN['path']) == EXPECTED_HOST_PIN,
            'both complete independently accepted actual measurements and exact host/plan/intent required')
    plan = read_pin(EXPECTED_TWO_CASE_PLAN_PIN); intent = read_pin(EXPECTED_INTENT_PIN)
    require(plan['schema'] == 'helmut-cas-heap-two-case-plan/1' and
            plan['intentPin'] == EXPECTED_INTENT_PIN and plan['noAutomaticStartOrSequence'] is True and
            plan['full500'] is False and plan['production'] is False and
            plan['cases'] == [{'index': i, 'case': str(CASES / name), 'measurementMode': spec['mode'],
                'variant': spec['variant'], 'authRPCs': 0 if i == 0 else 27}
                for i, (name, spec) in enumerate(SPECS.items())], 'exact two predeclared case identities and scope')
    require(intent['schema'] == 'helmut-cas-heap-predeclared-intent/1' and
            intent['scope'] == 'CAS_SERVER_MEMORY_CONTEXTS_ONLY' and
            intent['baseProductUPin']['sha256'] == BASE_U_SHA and intent['commonPartsSHA256'] == COMMON_PARTS_SHA and
            intent['baseRendererSHA256'] == NEW_RENDERER_SHA and intent['newGraphSHA256'] == NEW_GRAPH_SHA and
            intent['sourceManifestSHA256'] == SOURCE_SHA and intent['probe']['plannedLabels'] == PHASE_LABELS and
            intent['probe']['exactAcceptedFrames'] == intent['probe']['maximumFrames'] == 14 and
            intent['probe']['maximumExtraJSONBytes'] == 49152 and
            intent['serverHeapProbe']['contractPin'] == EXPECTED_HEAP_CONTRACT_PIN and
            (intent['serverHeapProbe']['expectedCASBinders'], intent['serverHeapProbe']['expectedFrames'],
             intent['serverHeapProbe']['maximumLogRecords']) == (4, 8, 12) and
            intent['sameFreezeIndependentlyAcceptedLifecycleRequired'] is True and
            intent['noAutomaticSequenceRetriesOrExtraCases'] is True and
            intent['workingCopyRetention']['preclassifiedDisposableOnlyAfterActualPASSAndIndependentReview'] is True and
            intent['workingCopyRetention']['FAILUnknownKeep'] is True and intent['full500'] is False and
            intent['production'] is False, 'exact predeclared CAS heap intent and disposable-after-PASS class')
    results = [value['cases'][name]['proofs']['ACTUAL_RESULT.SAFE.json'] for name in SPECS]
    require(results == EXPECTED_RESULT_PINS, 'exact two newly completed actual result bytes/hashes')
    for name, result_pin in zip(SPECS, results):
        require(result_pin['path'] == str(CASES / name / 'ACTUAL_RESULT.SAFE.json'), 'exact same-case actual result pin')
    actual_pin = value['independentActualReviewPin']
    require(actual_pin == EXPECTED_ACTUAL_REVIEW_PIN, 'exact independent both-case actual review pin')
    actual = read_pin(actual_pin)
    require(actual['schema'] == 'helmut-cas-heap-independent-actual-review/1' and
            actual['status'] == 'PASS' and actual['functionalEvidencePASS'] is True and
            actual['resultPins'] == results and actual['preparedPin'] == EXPECTED_LAUNCHER_PIN and
            actual['hostPin'] == EXPECTED_HOST_PIN,
            'independent functional both-case PASS must bind ordered actual results and final freeze/host')
    life_review_pin = value['lifecycleIndependentActualReviewPin']
    require(life_review_pin == EXPECTED_LIFECYCLE_REVIEW_PIN and
            actual['lifecycleActualReviewPin'] == life_review_pin, 'exact independent lifecycle review pin')
    life_review = read_pin(life_review_pin)
    require(life_review['schema'] == 'helmut-cas-heap-independent-lifecycle-actual-review/1' and
            life_review['status'] == 'PASS' and life_review['functionalEvidencePASS'] is True and
            life_review['resultPins'] == [results[0]] and
            life_review['preparedPin'] == EXPECTED_LAUNCHER_PIN and life_review['hostPin'] == EXPECTED_HOST_PIN,
            'new exact independent same-freeze lifecycle actual PASS required')
    root_pin = value['rootActualVerificationPin']
    require(root_pin == EXPECTED_ROOT_VERIFICATION_PIN, 'exact Root both-case verification pin')
    root = read_pin(root_pin)
    require(root['schema'] == 'helmut-cas-heap-root-actual-review/1' and
            root['status'] == 'PASS_BOUNDED_DIAGNOSTIC_ONLY' and root['resultPins'] == results and
            root['preparedPin'] == EXPECTED_LAUNCHER_PIN and root['hostPin'] == EXPECTED_HOST_PIN and
            root['independentActualReviewPin'] == actual_pin and root['closedAndOriginalDataIntact'] is True,
            'separate exact Root actual/closure/original integrity verification required')
    require(value['rootPassCopyRetentionDecisionPin'] == EXPECTED_RETENTION_DECISION_PIN,
            'separate exact Root decision: both new copies no longer needed')
    decision = read_pin(EXPECTED_RETENTION_DECISION_PIN)
    require(decision['schema'] == 'helmut-cas-heap-pass-copy-retention-decision/1' and
            decision['status'] == 'ONLY_TWO_NEW_PASS_PGDATA_COPIES_DISPOSABLE_AFTER_RETIRER_QUALIFICATION' and
            decision['rootActualReviewPin'] == root_pin and decision['independentActualReviewPin'] == actual_pin and
            decision['targets'] == [{'case': str(CASES / name), 'target': str(CASES / name / 'disk/pgdata'),
                'stillNeededForCurrentDiagnostic': False, 'independentlyAcceptedPASS': True} for name in SPECS] and
            all(decision[k] is True for k in ('originalsCanonicalArchivesHelperFilesGitAndAllProofsKEEP',
                'allContainerHullsImagesVolumesLoopsKEEP', 'allFAILUNKNOWNKEEP',
                'requiresQualifiedRetirerFreshIndividualPreflightAndRootNonceTTLOnce')) and
            decision['automaticDeletionAuthorized'] is False and decision['full500'] is False and
            decision['production'] is False, 'exact disposable-only scope and complete KEEP obligations')
    # Functional completeness governs disposal; no memory-saving or causal conclusion is required.
    # Each case still requires Root's no-needed-state/unknown-use decisions plus fresh per-target adoption.
    return value


def spec_for(name):
    value = load_context()['cases'][name]
    require(re.fullmatch('[0-9a-f]{64}', value['cid']) and
            re.fullmatch('helmut-meter-memorybudget-[0-9a-f]{24}', value['parent']), 'exact fresh native identities')
    return {**SPECS[name], 'cid': value['cid'], 'parent': value['parent'], 'exit': 0,
            'status': 'PASS', 'resultSHA256': value['proofs']['ACTUAL_RESULT.SAFE.json']['sha256']}


def contains_pin(value, expected):
    if value == expected:
        return True
    if isinstance(value, dict):
        return any(contains_pin(v, expected) for v in value.values())
    if isinstance(value, list):
        return any(contains_pin(v, expected) for v in value)
    return False


def evidence_files(case):
    """Only future Root execution enumerates evidence; exact PGDATA is excluded."""
    result = []
    def walk(directory):
        for path in sorted(directory.iterdir()):
            if path == case / 'disk/pgdata':
                continue
            s = path.lstat()
            require(not path.is_symlink() and s.st_uid == 1000, 'foreign/aliased case evidence')
            if stat.S_ISDIR(s.st_mode):
                walk(path)
            else:
                require(stat.S_ISREG(s.st_mode) and s.st_nlink == 1, 'nonregular case evidence')
                result.append(path)
            require(len(result) <= 4096, 'bounded case evidence inventory')
    walk(case)
    require(sum(p.stat().st_size for p in result) <= 64 * 1024**2, 'bounded retained evidence bytes')
    return result


def proof_by_name(proofs, name):
    matches = [v for v in proofs.values() if Path(v['path']).name == name]
    require(len(matches) == 1, 'exact required evidence basename: ' + name)
    return read_pin(matches[0])


def source_identity():
    source = load_context()['source']
    require(source['path'] == str(SOURCE) and source['manifestSHA256'] == SOURCE_SHA and
            source['fileCount'] == 1709 and source['fileBytes'] == 369399611 and
            source['permanentProtectedReconstructionDependency'] is True, 'permanent protected source')
    require(source['rootIdentity'] == SOURCE_ROOT_IDENTITY, 'historical protected root identity')
    canonical(SOURCE)
    identity_equal(metadata(SOURCE.lstat()), source['rootIdentity'])
    require(SOURCE.is_dir() and not (SOURCE / 'postmaster.pid').exists(), 'protected source remains offline')
    return source


def physical_auth(value):
    require(value['rows'] == 1 and value['physicalBytes'] == 606 and
            value['ledgerRows'] == value['referencedLedgerRows'] == 6000, 'physical root/6000 ledger')
    data = value['data']
    require(set(data) == {'_authStoreRevision', '_llmUsageRef', '_authStateRef'} and
            uuid.UUID(data['_authStoreRevision']).version == 4 and
            data['_authStateRef']['root'] == AUTH_ROOT and data['_llmUsageRef']['count'] == 6000,
            'exact restored physical/Auth root')
    return data


def prove_restoration(proofs, mode, variant, node_pid, group_inode):
    before = proof_by_name(proofs, 'SMALL_AUTH_BEFORE.stdout.PRIVATE.txt')
    after = proof_by_name(proofs, 'SMALL_AUTH_AFTER.stdout.PRIVATE.txt')
    b = physical_auth(before); a = physical_auth(after)
    require(before['sha'] == ORIGINAL_PHYSICAL_SHA, 'original full physical root pin')
    target = copy.deepcopy(before)
    if mode == 'cas-heap':
        observed = proof_by_name(proofs, 'AUTH_WRITE_PHASE.SAFE.json')
        require(observed['pass'] is True and observed['variant'] == variant and
                observed['schema'] == 'helmut-auth-write-phase-27-rpc/1' and
                observed['authRPCCount'] == observed['rpcResponsesCompleted'] == observed['nativeHTTPSendCount'] == 27 and
                (observed['fullReadCount'], observed['writeCount'], observed['controlReadCount'],
                 observed['mutations'], observed['restoreCount']) == (5, 4, 18, 3, 1) and
                len(observed['cycles']) == 3 and observed['uCalls'] ==
                    (['read', 'write'] + ['readControl'] * 6) * 3 + ['read', 'write', 'read'] and
                len(observed['steps']) == 27 and all(type(row['wallMilliseconds']) in (int, float) and
                    0 <= row['wallMilliseconds'] <= 30000 and row['selectedUAcceptance'] is True for row in observed['steps']) and
                observed['freshNativeChecksAcceptedBySelectedU'] is True and
                observed['originalStateRestored'] == b['_authStateRef'] and
                observed['unchangedNativeProof'] == {k: v for k, v in b['_llmUsageRef'].items() if k != 'version'} and
                observed['unchangedLogicalHistorySHA256'] == HISTORY_SHA and
                observed['finalRevision'] == a['_authStoreRevision'] != b['_authStoreRevision'] and
                observed['providerCalls'] == 0 and observed['full500'] is False and observed['automaticRetry'] is False,
                'complete genuine27/full Auth/history restoration')
        probe = observed['phaseProbe']; frames = probe['frames']
        encoded = json.dumps({'phaseProbe': probe}, separators=(',', ':')).encode()
        require(probe['schema'] == 'helmut-auth-write-phase-frames/1' and probe['complete'] is True and
                probe['plannedLabels'] == PHASE_LABELS and type(frames) is list and len(frames) == 14 and
                [frame['label'] for frame in frames] == PHASE_LABELS and
                probe['maximumFrames'] == 14 and probe['maximumExtraJSONBytes'] == 49152 and
                probe['maximumFrameJSONBytes'] == 3072 and probe['maximumEnvelopeJSONBytes'] == 4096 and
                probe['staticMaximumJSONBytes'] == 47117 and
                type(probe['extraMetadataBytes']) is int and
                0 < len(encoded) == probe['extraMetadataBytes'] <= 47117 and
                probe['groupPath'] == '/owned-group' and type(probe['groupInode']) is int and
                probe['groupInode'] == group_inode and
                all(type(frame['nodePID']) is int and frame['nodePID'] == node_pid and
                    type(frame['groupInode']) is int and frame['groupInode'] == group_inode and
                    len(json.dumps(frame, separators=(',', ':')).encode()) <= 3072 for frame in frames) and
                probe['snapshotsAtomic'] is False and probe['exactPeakOwnerClaimed'] is False and
                probe['allocatorCauseClaimed'] is False and probe['inputObjectsRetained'] is False and
                probe['peakIncreasesInsideFramesObserverAmbiguous'] is True and
                probe['betweenFramesIncludeRecordingOverhead'] is True,
                'fourteen complete bounded exact-label captured-Node/group phase frames required')
        target['data']['_authStoreRevision'] = a['_authStoreRevision']
        target['sha'] = after['sha']
    require(after == target, 'only exact authorized revision may change')
    receipt = proof_by_name(proofs, 'CATALOG_OPERATION_UNCHANGED.SAFE.json')
    selected = proof_by_name(proofs, 'CATALOG_SELECTED.stdout.PRIVATE.txt')
    final = proof_by_name(proofs, 'CATALOG_AFTER_OPERATION.stdout.PRIVATE.txt')
    expected = copy.deepcopy(selected)
    if mode == 'cas-heap':
        expected['store'] = {k: after[k] for k in ('rows', 'physicalBytes', 'sha')}
    require(final == expected == receipt['actual'] and receipt['smallBefore'] == before and
            receipt['smallAfter'] == after and receipt['unchangedExceptAuthorizedRevision'] is True and
            receipt['allOtherPhysicalFieldsExact'] is True and receipt['revisionChanged'] == (mode == 'cas-heap'),
            'complete catalog/ABI/ACL exact with sole independent physical revision exception')


def validate_server_heap(raw, observed, mode):
    """Only completed bounded PG log; no live query, process scan or content."""
    require(type(raw) is bytes and len(raw)<=262144,'bounded complete PG log for heap proof')
    def uuid4(value):
        return (type(value) is str and re.fullmatch('[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', value) is not None)
    prefix=b'HELMUT_CAS_HEAP_V1 '
    records=[]
    json_bytes=0
    common={'schema','kind','point','backendPID','xid','expectedRevision','newRevision',
            'currentUser','sessionUser','rawProjection','rawDiagnosticScope',
            'logErrorVerbosity','logMinErrorStatement'}
    counters={'contextCount','totalBytes','usedBytes','freeBytes'}
    output_sizes={'outputTextBytes','outputValueBytes'}
    def unique(pairs):
        result={}
        for key,value in pairs:
            require(key not in result,'duplicate heap JSON key')
            result[key]=value
        return result
    for number,line in enumerate(raw.splitlines(),1):
        require(not (line.lstrip().startswith((b'CONTEXT:',b'STATEMENT:')) or
                      re.match(rb'^[^\[\]\r\n]{0,128}\[[1-9][0-9]{0,9}\] (?:CONTEXT|STATEMENT):',line)),
                  'unexpected PG context/statement payload disclosure')
        if prefix not in line:
            continue
        require(len(records)<12,'unexpected extra heap diagnostic record')
        envelope=re.fullmatch(rb'([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9:.]{8,20} [A-Za-z0-9_+:/.-]{1,32})'
            rb' \[([1-9][0-9]{0,9})\] LOG:  HELMUT_CAS_HEAP_V1 (\{.*\})',line)
        require(envelope is not None,'unexpected heap log envelope or CONTEXT')
        encoded=envelope.group(3)
        require(0<len(encoded)<=2048,'heap record JSON cap')
        json_bytes+=len(encoded)
        require(json_bytes<=24576,'heap diagnostic JSON cap')
        value=json.loads(encoded.decode('utf8'),object_pairs_hook=unique)
        require(type(value) is dict and value.get('schema')=='helmut-cas-heap-log/1'
                  and ((value.get('kind'),value.get('point')) in
                       (('cas','session'),('heap','beforeOutputText'),('heap','afterOutputValue'))),
                  'exact server heap record schema/kind/point')
        require(set(value)==common|(counters|output_sizes if value['kind']=='heap' else set()),
                  'heap record scalar key whitelist')
        require(type(value['backendPID']) is int and 0<value['backendPID']<=2147483647
                  and value['backendPID']==int(envelope.group(2)),'actual PG log/backend PID binding')
        require(type(value['xid']) is str and re.fullmatch('[1-9][0-9]{0,19}',value['xid'])
                  and int(value['xid'])<=18446744073709551615,'assigned bounded server XID')
        require(uuid4(value['expectedRevision']) and uuid4(value['newRevision'])
                  and value['expectedRevision']!=value['newRevision'],'fresh CAS revision scalars')
        require(value['currentUser']=='service_role' and value['sessionUser']=='postgres',
                  'actual invoker/session role; no definer or membership substitute')
        for key in ('rawProjection','rawDiagnosticScope'):
            require(value[key] is None or (type(value[key]) is str and
                       len(value[key].encode('utf8'))<=128),'bounded raw GUC/null preserved')
        require(value['rawProjection']!='on','projection ON cannot qualify')
        require(value['logErrorVerbosity']=='terse' and value['logMinErrorStatement']=='fatal',
                  'actual bounded LOG without statement/CONTEXT disclosure')
        if value['kind']=='heap':
            require(all(type(value[key]) is int and 0<=value[key]<=9223372036854775807
                          for key in counters),'strict finite signed64 heap integers')
            require(1<=value['contextCount']<=4096 and
                      value['totalBytes']==value['usedBytes']+value['freeBytes'],
                      'exclusive context accounting identity/count bound')
            if value['point']=='beforeOutputText':
                require(all(value[key] is None for key in output_sizes),'pre-output lengths are unknown/null')
            else:
                require(all(type(value[key]) is int and 0<=value[key]<=9223372036854775807
                              for key in output_sizes),'bounded O(1) observed output length scalars')
        records.append({'line':number,'serverTimestamp':envelope.group(1).decode('ascii'),
                        'record':value})
    if mode=='lifecycle-only':
        require(observed is None and not records,'zero Auth lifecycle must emit zero heap records')
    else:
        require(mode=='cas-heap' and type(observed) is dict and observed.get('pass') is True
                  and len(records)==12,'complete4CAS/8heap records from accepted workload')
        writes=[row for row in observed['requests'] if row['uMethod']=='write']
        require(len(writes)==4 and [row['phase'] for row in writes]==
                  ['round0.mutation','round1.mutation','round2.mutation','restore.write']
                  and all(row['responseReceived'] is True and row['selectedUAccepted'] is True
                          for row in writes),'four already accepted driver CAS rows only')
        used_xids=set();used_revisions=set()
        for index,write in enumerate(writes):
            triplet=[row['record'] for row in records[index*3:index*3+3]]
            require([(row['kind'],row['point']) for row in triplet]==
                      [('cas','session'),('heap','beforeOutputText'),('heap','afterOutputValue')],
                      'fixed ordered binder/text/value triplet')
            binder=triplet[0]
            identity={key:binder[key] for key in common-{'kind','point'}}
            require(all({key:row[key] for key in identity}==identity for row in triplet)
                      and binder['expectedRevision']==write['expectedRevision']
                      and binder['newRevision']==write['revision'],'exact server/driver PID/XID/revision/GUC correlation')
            require(binder['xid'] not in used_xids and binder['newRevision'] not in used_revisions,
                      'duplicate CAS transaction or revision')
            used_xids.add(binder['xid']);used_revisions.add(binder['newRevision'])
    result={'schema':'helmut-cas-heap-parsed-server-proof/1','qualified':True,'mode':mode,
        'diagnosticRecords':len(records),'CASBinderRecords':len(records)//3,
        'heapRecords':2*len(records)//3,'diagnosticJSONBytes':json_bytes,
        'maximumRecordJSONBytes':2048,'maximumDiagnosticJSONBytes':24576,
        'completePGLogEOFRequired':True,'logParseAfterClosure':True,'records':records,
        'snapshotsAtomic':False,'observerMaterializationIncluded':True,
        'contextCountersAreProcessRSS':False,'groupPeakOwnerClaimed':False,
        'causalityOrSavingsClaimed':False}
    require(len(json.dumps(result,separators=(',',':')).encode())<=32768,'bounded parsed heap evidence')
    return result

def prove_heap_and_acl(proofs, result, worker, frozen):
    """Retained evidence only; no live server query or observer privilege operation."""
    for key, basename in (('serverHeapProofPin', 'SERVER_HEAP.SAFE.json'),
                          ('observerACLProofPin', 'OBSERVER_ACL_PROOF.SAFE.json')):
        host = proofs[basename]; stored = worker[key]
        require(result[key] == host and stored == {**host, 'path': '/bench/' + basename},
                'exact same-case host/worker diagnostic proof bytes/SHA')
    require(all(result[k] is True and worker[k] is True for k in
                ('serverHeapQualified', 'observerACLQualified', 'observerACLRestoredExactly')) and
            worker['observerACLPrepareAttempted'] is True and worker['observerACLRestoreAttempted'] is True and
            worker['observerACLRestorationError'] is None and worker['observerACLRestoreSQLSessions'] == 1,
            'all new diagnostic qualification/restoration receipts required')
    mode = result['measurementMode']
    observed = proof_by_name(proofs, 'AUTH_WRITE_PHASE.SAFE.json') if mode == 'cas-heap' else None
    raw_pin = proofs['PG_LOG.PRIVATE.txt']
    heap = validate_server_heap(Path(raw_pin['path']).read_bytes(), observed, mode)
    require(heap == proof_by_name(proofs, 'SERVER_HEAP.SAFE.json'),
            'complete closed PG log reparse must exactly equal retained 0-or-12-record heap proof')
    acl = proof_by_name(proofs, 'OBSERVER_ACL_PROOF.SAFE.json')
    require(acl == {'schema': 'helmut-cas-heap-observer-acl-proof/1', 'prepareAttempted': True,
            'restoreAttempted': True, 'restoredExactly': True, 'restorationError': None,
            'baselinePersistedBeforePrepare': True, 'selectedMinimalACLQualified': True,
            'selectedPeriodIsExplicitTwoObjectException': True, 'automaticRestoreRetry': False, 'qualified': True},
            'complete known exact observer ACL restoration; UNKNOWN remains KEEP')
    clone_sha = result['rootAdoptionPin']['sha256']
    def read_metadata(stem, schema):
        p = proofs[stem + '.stdout.PRIVATE.txt']
        rows = [json.loads(line) for line in Path(p['path']).read_text().splitlines() if line.strip()]
        require(len(rows) == 2, 'exact namespace header plus observer receipt')
        header, value = rows
        require(set(header) == {'schema', 'qualified', 'backendPID', 'searchPath'} and
                header['schema'] == 'helmut-cas-heap-metadata-namespace/1' and
                type(header['qualified']) is int and header['qualified'] == 1 and
                type(header['backendPID']) is int and 0 < header['backendPID'] <= 2147483647 and
                header['searchPath'] == 'pg_catalog' and value['schema'] == schema,
                'retained actual bounded same-session metadata namespace')
        capture = proof_by_name(proofs, stem + '.CAPTURE.SAFE.json')
        require(0 < p['bytes'] <= 262144 and capture['exitCode'] == 0 and
                capture['stdoutBytes'] == p['bytes'] and capture['stderrBytes'] == 0 and
                capture['combinedBytesObserved'] == p['bytes'] and capture['combinedCapBytes'] == 262144 and
                capture['childReaped'] is True and capture['failure'] is None and
                capture['exceptionType'] is None and not capture['bufferEvidenceErrors'],
                'successful complete bounded metadata capture')
        if schema == 'helmut-cas-heap-observer-acl-readback/1':
            require(value['readbackBackendPID'] == header['backendPID'], 'same-session namespace/readback PID')
        return value
    before = read_metadata('OBSERVER_ACL_BEFORE', 'helmut-cas-heap-observer-acl-readback/1')['state']
    prepared = read_metadata('OBSERVER_ACL_PREPARE', 'helmut-cas-heap-observer-acl-prepare/1')
    selected = read_metadata('OBSERVER_ACL_SELECTED', 'helmut-cas-heap-observer-acl-readback/1')['state']
    restored = read_metadata('OBSERVER_ACL_RESTORE', 'helmut-cas-heap-observer-acl-restore/1')
    require(prepared['before'] == before and prepared['selected'] == selected and
            restored['restoredExactly'] is True and restored['restored'] == before,
            'full raw ACL/null/order/grantor/options/effective/roles/memberships exact restoration')
    for state in (before, selected, restored['restored']):
        binding = state['binding']
        require(state['schema'] == 'helmut-cas-heap-observer-acl-state/1' and
                binding['cloneReceiptSHA256'] == clone_sha and binding['databaseOID'] == '18405' and
                binding['dataDirectory'] == '/disk/pgdata' and binding['serverVersionNum'] == '170006' and
                binding['currentUser'] == binding['sessionUser'] == 'postgres' and
                binding['logErrorVerbosity'] == 'terse' and binding['logMinErrorStatement'] == 'fatal' and
                state['role']['name'] == 'service_role' and state['role']['super'] is False and
                state['objects']['view']['schemaOID'] == state['objects']['function']['schemaOID'] == '11' and
                state['objects']['function']['oid'] == '2282',
                'actual fresh clone/catalog/role/logging/builtin binding')
    require({k:v for k,v in before.items() if k != 'objects'} ==
            {k:v for k,v in selected.items() if k != 'objects'}, 'observer nonobject metadata unchanged')
    for name, privilege, added, removed in (('view', 'SELECT', 'addedViewSELECT', 'removedViewSELECT'),
                                            ('function', 'EXECUTE', 'addedFunctionEXECUTE', 'removedFunctionEXECUTE')):
        old, new = before['objects'][name], selected['objects'][name]
        require(type(prepared[added]) is bool and prepared[added] == (not old['effective']) and
                type(restored[removed]) is bool and not (restored[removed] and old['effective']) and
                new['effective'] is True and
                {k:v for k,v in old.items() if k not in ('rawACL', 'aclExpanded', 'effective')} ==
                {k:v for k,v in new.items() if k not in ('rawACL', 'aclExpanded', 'effective')},
                'exact two-object selected exception only; source/ABI/owner remain unchanged')
        if old['effective']:
            require(new == old, 'already-effective observer right unchanged')
        else:
            def semantics(obj):
                return {(row['grantor'], row['grantee'], row['privilege'], row['grantable'])
                        for row in obj['aclExpanded']}
            require(old['rawACL'] is not None and new['rawACL'] is not None and
                    semantics(new) == semantics(old) | {(old['ownerOID'], before['role']['oid'], privilege, False)},
                    'only missing owner-granted SELECT/EXECUTE, no option/membership/definer change')
    outer = proof_by_name(proofs, 'ROOT_OBSERVED_TOOL_EXIT.SAFE.json')
    require(outer['schema'] == 'helmut-cas-heap-root-observed-tool-exit/1' and
            type(outer['actualToolExitCode']) is int and outer['actualToolExitCode'] == 0 and
            outer['actualResultPin'] == proofs['ACTUAL_RESULT.SAFE.json'] and outer['noRetry'] is True,
            'real outer0 closure required; internal PASS alone is insufficient')


def proof_context(name, need_target=True):
    prepared = load_context(); spec = spec_for(name)
    case = canonical(CASES / name); root = canonical(case / 'disk/pgdata')
    require(case.stat().st_uid == os.getuid() == 1000 and stat.S_IMODE(case.stat().st_mode) == 0o700,
            'own private700 case required')
    if need_target:
        require(root.is_dir() and root.stat().st_dev == case.stat().st_dev and root.stat().st_uid == 1000 and
                stat.S_IMODE(root.stat().st_mode) == 0o700, 'exact own private700 derived root')
    for line in Path('/proc/self/mountinfo').read_text().splitlines():
        value = line.split()[4]
        for escaped, literal in [('\\040', ' '), ('\\011', '\t'), ('\\012', '\n'), ('\\134', '\\')]:
            value = value.replace(escaped, literal)
        mounted = Path(value)
        require(mounted in [Path('/'), Path('/workspace')] or not
                (overlaps(root, mounted) or overlaps(SOURCE, mounted)), 'host mount overlaps target/protected source')
    record = prepared['cases'][name]; proofs = record['proofs']
    actual_files = evidence_files(case)
    require(set(proofs) == {str(p.relative_to(case)) for p in actual_files}, 'all retained case files must be pinned')
    for relative, value in proofs.items():
        require(Path(value['path']) == case / relative and pin(value['path']) == value, 'exact retained evidence drift')
    candidate = proof_by_name(proofs, 'RETIREMENT_CANDIDATES.SAFE.json')
    result = proof_by_name(proofs, 'ACTUAL_RESULT.SAFE.json')
    frozen = read_pin(EXPECTED_LAUNCHER_PIN); frozen_dir = Path(EXPECTED_LAUNCHER_PIN['path']).parent
    require(result['preparedPin'] == EXPECTED_LAUNCHER_PIN and
            frozen['schema'] == 'helmut-cas-heap-prepared/1' and
            frozen['comparisonScope'] == 'CAS_SERVER_MEMORY_CONTEXTS_ONLY' and
            frozen['rootMeasurementIntentPin'] == EXPECTED_INTENT_PIN and
            frozen['rootTwoCasePlanPin'] == EXPECTED_TWO_CASE_PLAN_PIN and
            frozen['phaseProbeContract'] == read_pin(EXPECTED_INTENT_PIN)['probe'] and
            set(frozen['variantSources']) == set(frozen['variantParts']) ==
                set(frozen['variantBodies']) == set(frozen['variantInstallations']) == {'CURRENT'} and
            frozen['variantSources']['CURRENT']['sha256'] == CURRENT_U_SHA and
            frozen['variantParts']['CURRENT']['sha256'] == COMMON_PARTS_SHA and
            frozen['variantBodies'] == {'CURRENT': {'renderer': HEAP_RENDERER_SHA, 'graph': NEW_GRAPH_SHA, 'cas': HEAP_CAS_SHA}} and
            frozen['baseVariantBodies'] == {'CURRENT': {'renderer': NEW_RENDERER_SHA, 'graph': NEW_GRAPH_SHA}} and
            frozen['serverHeapContractPin'] == EXPECTED_HEAP_CONTRACT_PIN and
            frozen['serverHeapContract'] == read_pin(EXPECTED_HEAP_CONTRACT_PIN),
            'exact final diagnostic-U/current Parts/base NEW SQL plus two-body heap overlay freeze')
    expected_frozen = {p['path']: p for p in [EXPECTED_LAUNCHER_PIN, *frozen['files'],
        *[p for p in frozen['metadataAndCodeInputs'] if Path(p['path']).is_relative_to(frozen_dir)]]}
    require(record['historicalLauncherClosurePins'] == [expected_frozen[k] for k in sorted(expected_frozen)],
            'immutable launcher closure differs; do not adopt mutable Root U/Parts')
    for p in record['historicalLauncherClosurePins']:
        require(Path(p['path']).is_relative_to(frozen_dir), 'only immutable launcher-local sources')
        read_pin(p) if p['path'].endswith('.json') else require(pin(p['path']) == p, 'frozen source drift')
    classification = frozen['derivedPGDATAClassification']
    require(classification['schema'] == 'helmut-ephemeral-local-working-pgdata/1' and
            classification['kind'] == 'EXPENDABLE_LOCAL_WORKING_COPY' and classification['original'] is False and
            classification['futureBaselineOrInput'] is False and classification['sourcePermanentRetention'] is True and
            classification['sourceCanonicalManifestSHA256'] == SOURCE_SHA and
            classification['fullPhysicalWALArchiveForEveryPASSRequired'] is False and
            classification['FAILOrUnknownRetained'] is True and candidate['workingCopyLifecycle'] == classification,
            'prior disposable classification absent')
    require(candidate['schema'] == 'helmut-cas-heap-retirement-candidates/1' and candidate['case'] == str(case) and candidate['freshDerivedPGDATAPath'] == str(root) and
            candidate['parent'] == spec['parent'] == result['parent'] and candidate['actualPASSObserved'] is True and
            candidate['resourcesStopped'] is True and candidate['namespacesEmpty'] is True and
            candidate['automaticCleanup'] is False and candidate['imagesVolumesLoopsAndOldContainersProtected'] is True and
            candidate['fullPhysicalWALArchiveAlwaysRequired'] is False, 'exact PASS disposable candidate')
    result_pin = proofs['ACTUAL_RESULT.SAFE.json']
    require(candidate['resultPin'] == result_pin and result_pin['sha256'] == spec['resultSHA256'] and
            result['schema'] == 'helmut-cas-heap-result/1' and
            result['status'] == 'PASS' and result['forcedStop'] is None and result['errorType'] is None and
            result['measurementMode'] == spec['mode'] and result['variant'] == spec['variant'] and
            result['sourceManifestSHA256'] == SOURCE_SHA and result['providerCalls'] == 0 and
            result['full500'] is False and result['production'] is False and result['automaticRetry'] is False,
            'FAIL/UNKNOWN/forced or wrong-scope result must be retained')
    require(result['actualContainerClosure']['id'] == spec['cid'] and
            result['actualContainerClosure']['exitCode'] == 0 and
            result['actualContainerClosure']['allOwnedWorkloadExited'] is True, 'actual worker closure')
    kernel = result['kernelThroughLastOwnedExit']; budget = result['nativeBudgetAfterLastExit']
    require(kernel['fullLastProcessExitCovered'] is True and kernel['events']['populated'] == 0 and
            not kernel['populatedSubgroups'] and budget['setupHelpersExited'] is True and
            budget['peakNeverReset'] is True and
            {'high', 'max', 'oom', 'oom_kill'} <= set(kernel['memoryEvents']) and
            {'high', 'max', 'oom', 'oom_kill'} <= set(budget['memoryEvents']) and
            all(type(x) is int and x == 0 for x in kernel['memoryEvents'].values()) and
            all(type(x) is int and x == 0 for x in budget['memoryEvents'].values()), 'complete empty last exit/zero events')
    require(budget['settings'] == {'memory.max': '1547997184', 'memory.high': '1399996416', 'memory.swap.max': '0'},
            'native limits changed')
    worker = proof_by_name(proofs, 'WORKER_RESULT.SAFE.json')
    require(result['workerResultPin'] == proofs['WORKER_RESULT.SAFE.json'] and worker['schema'] == 'helmut-cas-heap-worker-result/1' and worker['pass'] is True and
            worker['postgresExitCode'] == 0 and worker['allOwnedDatabaseChildrenClosed'] is True and
            worker['sourceUnchangedFullManifest'] is True and worker['sourceManifestSHA256'] == SOURCE_SHA and
            (worker['sourceFileCount'], worker['sourceFileBytes']) == (1709, 369399611) and
            all(worker[k] is True for k in ['copiedManifestVerified', 'jitClosureRestored', 'fullOriginalCatalogQualified',
                'rendererBodyQualified', 'selectedGraphBodyQualified', 'onlyReviewedBaseAndDiagnosticPublicBodiesChanged',
                'catalogUnchangedAfterOperation', 'smallPhysicalAuthQualified', 'pgLogEOFObserved',
                'pgLogDrainThreadEnded', 'postgrestStopQualified', 'postgrestVersionQualified']) and
            not worker['pgLogDrainErrors'] and worker['measurementMode'] == spec['mode'] and
            worker['selection'] == result['selection'] == candidate['selection'], 'full worker integrity/restore/closure')
    count = 0 if spec['mode'] == 'lifecycle-only' else 27
    require(worker['authRPCCount'] == result['authRPCCount'] == count and
            worker['nodeStarted'] == result['nodeStarted'] == (count == 27), 'exact lifecycle/27RPC scope')
    arm = 'CURRENT'
    selection = result['selection']
    require(result['comparisonScope'] == selection['comparisonScope'] == 'CAS_SERVER_MEMORY_CONTEXTS_ONLY' and
            selection['bodyVariant'] == arm and selection['mode'] == spec['mode'] and
            selection['authRPCCount'] == count and selection['nodeLaunchCount'] == (0 if count == 0 else 1) and
            selection['variant'] == spec['variant'] and selection['uOverlayPin'] == frozen['variantSources'][arm] and
            selection['partsOverlayPin'] == frozen['variantParts'][arm] and
            selection['rendererInstallSQLPin'] == frozen['variantInstallations'][arm]['renderer'] and
            selection['installSQLPin'] == frozen['variantInstallations'][arm]['graph'] and
            selection['expectedRendererBodySHA256'] == frozen['baseVariantBodies'][arm]['renderer'] and
            selection['expectedBodySHA256'] == frozen['baseVariantBodies'][arm]['graph'] and
            selection['serverHeapInstallations'] == frozen['serverHeapInstallations'] and
            selection['serverHeapCatalogTargets'] == frozen['serverHeapCatalogTargets'] and
            selection['serverHeapContractPin'] == EXPECTED_HEAP_CONTRACT_PIN, 'complete exact selected Auth and diagnostic SQL arm')
    if count:
        lifecycle_pin = prepared['cases'][next(iter(SPECS))]['proofs']['ACTUAL_RESULT.SAFE.json']
        require(result['lifecycleResultPin'] == worker['lifecycleResultPin'] == candidate['lifecycleResultPin'] == lifecycle_pin,
                'same final-freeze actual CURRENT-body lifecycle required')
        life_case = prepared['cases'][next(iter(SPECS))]
        life_pins = [life_case['proofs'][base] for base in
            ('ACTUAL_RESULT.SAFE.json', 'WORKER_RESULT.SAFE.json', 'POSTGREST_STOP.SAFE.json',
             'SERVER_HEAP.SAFE.json', 'OBSERVER_ACL_PROOF.SAFE.json')]
        mounts = record['containers'][spec['cid']]['Mounts']
        require(all(any(m['Type'] == 'bind' and m['Source'] == p['path'] and
                    m['Destination'] == p['path'] and m['RW'] is False for m in mounts)
                    for p in life_pins), 'all five same-freeze lifecycle proofs mounted exactly readonly')
        require(worker['nodeExitCode'] == 0 and result['nodeHeapAndExitReceipts']['pass_'] is True and
                worker['cycleObservationCount'] == worker['cycleMetricSQLSessions'] == 6 and
                worker['postOperationCatalogSessions'] == 1 and type(worker['nodePID']) is int and worker['nodePID'] > 0,
                'complete retained27/six-boundary/Node0 evidence; no Ownership81 sampler')
        summary = worker['phaseProbeSummary']
        require(worker['phaseProbeQualified'] is True and result['phaseProbeQualified'] is True and
                result['phaseProbeSummary'] == summary and
                set(summary) == {'frames', 'serializedAddedMetadataBytes', 'capturedNodePID', 'groupInode',
                    'maximumFramePeakAfterBytes', 'currentCountersDecomposePeak', 'allocatorOrRetainedObjectCauseProven'} and
                type(summary['frames']) is int and summary['frames'] == 14 and
                summary['capturedNodePID'] == worker['nodePID'] and
                summary['groupInode'] == budget['actualParentInode'] and
                type(summary['serializedAddedMetadataBytes']) is int and
                0 < summary['serializedAddedMetadataBytes'] <= 47117 and
                type(summary['maximumFramePeakAfterBytes']) is int and
                0 < summary['maximumFramePeakAfterBytes'] <= kernel['memoryPeakBytes'] and
                summary['currentCountersDecomposePeak'] is False and
                summary['allocatorOrRetainedObjectCauseProven'] is False and
                result['phasePeakAttribution'] == ('UNLOCALIZED_OUTSIDE_OR_AFTER_FRAMES'
                    if kernel['memoryPeakBytes'] > summary['maximumFramePeakAfterBytes'] else
                    'BOUNDED_FRAME_INCREMENTS_ONLY'), 'complete phase receipts; either valid final-peak status allowed')
        observed_phase = proof_by_name(proofs, 'AUTH_WRITE_PHASE.SAFE.json')['phaseProbe']
        require(summary['serializedAddedMetadataBytes'] == observed_phase['extraMetadataBytes'] and
                summary['maximumFramePeakAfterBytes'] == max(int(frame['peakAfter']) for frame in observed_phase['frames']),
                'worker phase receipt must bind retained raw phase observations')
        for sequence in range(1, 7):
            stem = 'CYCLE_' + str(sequence)
            marker = proof_by_name(proofs, stem + '.MARKER.SAFE.json')
            ack = proof_by_name(proofs, stem + '.ACK.SAFE.json')
            observed = proof_by_name(proofs, stem + '.OBSERVATION.SAFE.json')
            expected = {'schema': 'helmut-auth-write-phase-cycle-marker/1', 'sequence': sequence,
                        'round': (sequence - 1) // 2, 'edge': 'start' if sequence % 2 else 'end',
                        'nodePID': worker['nodePID']}
            require(marker == ack == observed['marker'] == expected, 'six exact ordered captured-Node boundary proofs')
    else:
        require(result['lifecycleResultPin'] is None and worker['lifecycleResultPin'] is None and
                worker['cycleObservationCount'] == worker['cycleMetricSQLSessions'] == 0 and
                result['nodeHeapAndExitReceipts'] is None and
                worker['phaseProbeQualified'] is False and result['phaseProbeQualified'] is False and
                worker['phaseProbeSummary'] is None and result['phaseProbeSummary'] is None and
                result['phasePeakAttribution'] == 'NOT_APPLICABLE_NO_NODE',
                'fresh zero-Auth/no-Node CURRENT-body lifecycle')
    for p in candidate['sourceProofExitLogAndPlanPins'].values():
        require(proofs[Path(p['path']).name] == p, 'candidate evidence pin mismatch')
    before = proofs['SOURCE_BEFORE_FULL_MANIFEST.PRIVATE.json']; after = proofs['SOURCE_AFTER_FULL_MANIFEST.PRIVATE.json']
    require(before['bytes'] == after['bytes'] and before['sha256'] == after['sha256'], 'source before/after differs')
    for p in (before, after):
        manifest = read_pin(p)
        require((manifest['fileCount'], manifest['fileBytes'], manifest['manifestSHA256']) ==
                (1709, 369399611, SOURCE_SHA) and hashlib.sha256(json.dumps(manifest['records'],
                separators=(',', ':'), sort_keys=True).encode()).hexdigest() == SOURCE_SHA, 'saved full source record digest')
    prove_heap_and_acl(proofs, result, worker, frozen)
    prove_restoration(proofs, spec['mode'], spec['variant'], worker.get('nodePID'), budget['actualParentInode'])
    stop = proof_by_name(proofs, 'POSTGREST_STOP.SAFE.json')
    require(stop['pass'] is True and worker['postgrestStopReturnedReceipt'] == stop, 'actual strict PostgREST stop')
    for protected in candidate['protectedOriginalPaths']:
        if protected is not None:
            require(not overlaps(root, canonical(protected)), 'protected original overlap')
    review = read_pin(record['independentActualReviewPin'])
    expected_results = [prepared['cases'][case_name]['proofs']['ACTUAL_RESULT.SAFE.json'] for case_name in SPECS]
    require(record['independentActualReviewPin'] == prepared['independentActualReviewPin'] and
            record['independentActualReviewPin']['path'] == EXPECTED_ACTUAL_REVIEW_PATH and
            review['schema'] == 'helmut-cas-heap-independent-actual-review/1' and
            review['status'] == 'PASS' and review['resultPins'] == expected_results and
            contains_pin(review, result_pin), 'fresh independent actual PASS must bind both exact result pins')
    require(all(record[k] is True for k in ['actualPASSReviewed', 'completeEvidenceReviewed',
                'fullAuthHistory6000CatalogRestorationReviewed', 'dependenciesReviewed', 'unknownUseReviewed',
                'noNecessaryStateOrSoleEvidenceLost', 'neverFutureBaselineOrInput']), 'separate Root disposal review absent')
    source_identity()
    return root, candidate, result


def verified_cases(selected):
    prepared = load_context()
    ids = [cid for record in prepared['cases'].values() for cid in record['containers']]
    require(len(ids) == len(set(ids)) == 6, '6 distinct new-case container identities')
    data = {name: proof_context(name, need_target=(name == selected)) for name in SPECS}
    return data[selected], quiescent_all(data, prepared)


def checked(name):
    (root, candidate, result), closures = verified_cases(name)
    entries = snapshot(root)
    require(sum(r['allocatedBytes'] for r in entries) <= 768 * 1024**2, 'same native disposable-copy disk cap')
    return {'schema': 'helmut-cas-heap-pass-copy-checked/1', 'status': 'PASS_COPY_CHECKED_NOT_RETIRED',
            'case': name, 'target': str(root), 'checkedAtUnix': time.time(), 'scriptPin': pin(Path(__file__).resolve()),
            'rootContextPin': pin(CTX), 'sourceManifestSHA256': SOURCE_SHA, 'entries': entries,
            'checkNonce': uuid.uuid4().hex[:24],
            'closures': closures, 'actualResultPin': load_context()['cases'][name]['proofs']['ACTUAL_RESULT.SAFE.json'],
            'allCaseEvidenceAndHullsMustRemain': True, 'fullPhysicalArchiveRequiredForThisClass': False,
            'archiveOrBackupQualificationClaimed': False, 'retirementAuthorizedByThisCheck': False}


def retire(name, adoption_path):
    require(adoption_path == BASE / (name + '.ROOT_RETIREMENT_ADOPTION.PRIVATE.json'), 'fixed separate Root adoption')
    adoption_pin = pin(adoption_path); adopted = read_pin(adoption_pin)
    require(adopted['schema'] == 'helmut-cas-heap-pass-copy-root-retirement-adoption/1' and
            adopted['action'] == 'RETIRE EXACT PRECLASSIFIED CAS HEAP PASS COPY' and adopted['case'] == name and
            adopted['target'] == str(CASES / name / 'disk/pgdata') and
            all(adopted[k] is True for k in ['exclusiveRetirementWindow', 'noConcurrentResourceChanges',
                'actualPASSAndRestorationReviewed', 'allNecessaryArtifactsPreserved', 'dependenciesAndUnknownUseReviewed',
                'noNecessaryStateOrSoleEvidenceLost', 'protectedSourceEvidenceHullsAndOriginalsRetained']) and
            type(adopted['adoptedAtUnix']) in (int, float) and type(adopted['expiresAtUnix']) in (int, float) and
            re.fullmatch('[a-f0-9]{24}', adopted['nonce']) and
            0 <= time.time() - adopted['adoptedAtUnix'] <= 300 and
            time.time() <= adopted['expiresAtUnix'] <= adopted['adoptedAtUnix'] + 300,
            'fresh exact authorized Root nonce/TTL decision')
    require(adopted['scriptPin'] == pin(Path(__file__).resolve()) and adopted['rootContextPin'] == pin(CTX),
            'Root adopted exact source/context')
    report_pin = adopted['checkedPin']
    require(report_pin['path'] == str(BASE / (name + '.CHECKED_CASE.PRIVATE.json')), 'fixed Root-captured check')
    report = read_pin(report_pin)
    require(report['schema'] == 'helmut-cas-heap-pass-copy-checked/1' and report['case'] == name and
            report['target'] == adopted['target'] and report['scriptPin'] == adopted['scriptPin'] and
            report['rootContextPin'] == adopted['rootContextPin'] and
            type(report['checkedAtUnix']) in (int, float) and
            re.fullmatch('[a-f0-9]{24}', report['checkNonce']) and adopted['checkedNonce'] == report['checkNonce'] and
            0 <= time.time() - report['checkedAtUnix'] <= 300, 'fresh matching nonce-bound check inventory')
    for other in SPECS:
        other_path = BASE / (other + '.ROOT_RETIREMENT_ADOPTION.PRIVATE.json')
        if other != name and other_path.exists():
            require(read_pin(pin(other_path))['nonce'] != adopted['nonce'], 'retirement nonce already used for other target')
    (root, candidate, result), closures = verified_cases(name)
    entries = report['entries']; same_snapshot(root, entries)
    # Refresh all use/namespace guards AFTER the full current target hash pass.
    (root, candidate, result), closures = verified_cases(name)
    require(0 <= time.time() - closures['observedAtUnix'] <= 10, 'live closure stale')
    require(pin(CTX) == adopted['rootContextPin'] and pin(Path(__file__).resolve()) == adopted['scriptPin'] and
            0 <= time.time() - adopted['adoptedAtUnix'] <= 300 and time.time() <= adopted['expiresAtUnix'] and
            free() >= FLOOR, 'last adoption/source/nonce TTL/floor drift')
    save_new(BASE / (name + '.RETIRE_ONCE_CLAIM.PRIVATE.json'), {
        'schema': 'helmut-cas-heap-pass-copy-retire-once/1', 'case': name, 'target': str(root),
        'rootAdoptionPin': adoption_pin, 'checkedPin': report_pin, 'rootContextPin': adopted['rootContextPin'],
        'closures': closures, 'nonce': adopted['nonce'], 'checkedNonce': report['checkNonce'],
        'expiresAtUnix': adopted['expiresAtUnix'], 'automaticRetry': False, 'atUTC': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    removed, before_free = unlink_exact(root, entries)
    save_new(BASE / (name + '.RETIRED.PRIVATE.json'), {
        'schema': 'helmut-cas-heap-disposable-pass-copy-retired/1', 'case': name, 'exactRemovedRoot': str(root),
        'removedRegularFiles': removed, 'rootAdoptionPin': adoption_pin, 'checkedPin': report_pin,
        'rootContextPin': adopted['rootContextPin'], 'sourceManifestSHA256': SOURCE_SHA,
        'allNecessaryEvidenceAndHullsRetained': True, 'sourceOriginalsImagesVolumesLoopsTouched': False,
        'preclassifiedDisposablePASSOnly': True, 'archiveOrBackupQualificationClaimed': False,
        'hostAvailableBeforeRetirement': before_free, 'hostAvailableAfterRetirement': free(),
        'full500': False, 'production': False})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=tuple(SPECS), required=True)
    parser.add_argument('--action', choices=('check', 'retire'), default='check')
    parser.add_argument('--root-adoption', type=Path)
    args = parser.parse_args()
    require(os.getuid() == 1000 and BASE.stat().st_uid == 1000 and stat.S_IMODE(BASE.stat().st_mode) == 0o700,
            'own private retirement preparation only')
    if args.action == 'check':
        require(args.root_adoption is None, 'check has no deletion adoption')
        print(json.dumps(checked(args.case), sort_keys=True))
    else:
        require(args.root_adoption is not None, 'separate Root adoption required')
        retire(args.case, args.root_adoption)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
