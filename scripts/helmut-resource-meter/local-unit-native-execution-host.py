"""Private bounded execution transport for the fresh local Source supervisor.

Importing this module starts nothing. The caller owns authorization, seed,
runtime updater and final native snapshot; none is inferred from a JSON flag.
Docker exec credentials and Root bootstrap material travel on stdin only.
"""
import datetime
import ctypes
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import secrets
import stat
import subprocess
import time
import traceback

DOCKER = ['/usr/local/bin/docker', '--host=unix:///var/run/docker.sock']
ENV = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC'}
FLAGS = ['--max-old-space-size=384', '--max-semi-space-size=16']
TRACE = '/run/bootstrap/CONTROL_READ_TRACE.SAFE.jsonl'
PUBLIC = '/run/helmut-local-unit-diagnostic'
BASE = Path('/workspace/helmut-unit-diagnostic-native')
CGROUP_ROOT = Path('/sys/fs/cgroup')
HASH = re.compile('[a-f0-9]{64}')
CAP = 256 * 1024
POLICY_SHA = '274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04'
CLIENT_INPUT_NAMES = {'SELECTION.SAFE.json', 'CODE_MANIFEST.SAFE.json', 'RUNTIME_MANIFEST.SAFE.json', 'AUTHORIZATION.SAFE.json',
                      'EXECUTION_PRECONDITIONS.SAFE.json'} | {'GATE_' + x + '.SAFE.json' for x in
    ('source', 'runtime', 'owner', 'calendar', 'costs', 'reservation', 'sender', 'review', 'result', 'independentAcceptance')} | {
        p + '_' + k + '.PRIVATE.json' for p in ('D', 'R') for k in ('REQUEST', 'RESPONSE', 'LATENCY')}
SOURCE = Path('/workspace/helmut-parallel-20261015/wave20-resource-integration/attempt-f3375a7d5548')
ORIGINALS = {
    str(Path('/workspace/helmut-parallel-20261015/wave19-resource-meter/full500-owned-storage21-f3375a7d5548/image.raw')):
        (2147483648, '54df2ecc0e4fdc22adf75f2ce3491d3c921e38296510543dcdadd48db3f37693'),
    str(SOURCE / 'FRESH_PACKET.PRIVATE.json'): (1233928, '29cf691713b875c5a720882644963f9c2ca2dc39c51a4c284588d815c863cf44'),
    str(SOURCE / 'native-end-preparation/run-combined500-synthetik500-resources21-f3375a7d5548/LOCAL_INSTALL_PINS.PRIVATE.json'):
        (586, '3ccf05233f012f42224abe97f5ec7e50c929df319c4bf6b7ddedd294d9ed268b'),
    str(SOURCE / 'NEW_PREPARED_REQUESTS.PRIVATE.json'): (8209746, '79498729160c30dd3aaccfcce3b5613b4f97e3a1b0074b83273e172f5455fb32'),
    str(SOURCE / 'ALL500_ACTUAL_REQUEST_TEMPLATE_BINDINGS.SAFE.json'): (306392, '8bef63b785b7afdf7a370080d108c2ce613dec40f7734a0d63766663d24dbbe0'),
    str(SOURCE / 'BOUND_LOCAL_PROVIDER_FIXTURES.PRIVATE.json'): (1472456, 'ebf215088d81524a7bb5d1465a1f61f0064be541a98707400f9a6519e0fdcaa5'),
}


def need(ok, code):
    if not ok:
        raise RuntimeError('native-execution-host-' + code)


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf8')


def sha(value):
    return hashlib.sha256(value.encode('utf8') if isinstance(value, str) else value).hexdigest()


def unique(raw):
    def pairs(rows):
        out = {}
        for key, value in rows:
            need(key not in out, 'duplicate-json-key')
            out[key] = value
        return out
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: need(False, 'nonfinite-json'))


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def instant(value):
    need(type(value) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z', value), 'utc')
    return datetime.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()


def window(value):
    a, b, now = instant(value['issuedAtUTC']), instant(value['expiresAtUTC']), time.time()
    need(a <= now < b and 0 < b - a <= 3.000001, 'private-ipc-window')


def canonical(path):
    p = Path(path)
    need(p.is_absolute() and str(p) == str(path) and p.resolve() == p, 'canonical-path')
    current = Path('/')
    for part in p.parts[1:]:
        current /= part
        need(not current.is_symlink(), 'symlink-component')
    return p


def identity(s):
    return tuple(getattr(s, k) for k in ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns'))


def read_file(path, cap=CAP, uid=1000, private=True):
    p = canonical(path)
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and 0 < before.st_size <= cap
             and (not private or before.st_uid == uid and stat.S_IMODE(before.st_mode) == 0o600), 'private-regular-file')
        chunks, size = [], 0
        while block := os.read(fd, min(65536, cap + 1 - size)):
            chunks.append(block); size += len(block)
            need(size <= cap, 'file-cap')
        need(size == before.st_size and identity(before) == identity(os.fstat(fd)) == identity(p.lstat()), 'file-drift')
        raw = b''.join(chunks)
        return raw, {'path': str(p), 'bytes': size, 'sha256': sha(raw)}
    finally:
        os.close(fd)


def write_once(path, raw, mode=0o600):
    p = Path(path); canonical(p.parent)
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_NONBLOCK, mode)
    try:
        s = os.fstat(fd)
        need(stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and s.st_uid == os.getuid(), 'output-identity')
        os.fchmod(fd, mode)
        offset = 0
        while offset < len(raw):
            n = os.write(fd, raw[offset:]); need(n > 0, 'short-write'); offset += n
        os.fsync(fd)
        a = os.fstat(fd)
        need(a.st_size == len(raw) and identity(a) == identity(p.lstat()), 'output-drift')
    finally:
        os.close(fd)
    directory = os.open(p.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    return {'path': str(p), 'bytes': len(raw), 'sha256': sha(raw)}


def pin_shape(p):
    need(type(p) is dict and set(p) == {'path', 'bytes', 'sha256'} and type(p['bytes']) is int
         and 0 < p['bytes'] <= 2147483648 and type(p['sha256']) is str and HASH.fullmatch(p['sha256']), 'pin-shape')
    need(Path(p['path']).is_absolute() and str(Path(p['path'])) == p['path'] and not any(c in p['path'] for c in ',\0\r\n'), 'pin-path')


def node_budget(value):
    need(type(value) is dict and set(value) == {'nodeVersion', 'execArgv', 'oldSpaceMiB', 'semiSpaceMiB', 'heapSizeLimitBytes'}
         and value['nodeVersion'] == 'v24.19.0' and value['execArgv'] == FLAGS and type(value['oldSpaceMiB']) is int and value['oldSpaceMiB'] == 384
         and type(value['semiSpaceMiB']) is int and value['semiSpaceMiB'] == 16 and type(value['heapSizeLimitBytes']) is int
         and 384 * 1024**2 <= value['heapSizeLimitBytes'] <= 448 * 1024**2, 'actual-node-budget')


def host_user():
    rows = dict(line.split(':', 1) for line in Path('/proc/self/status').read_text().splitlines())
    need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 1000
         and rows.get('Uid', '').split() == rows.get('Gid', '').split() == ['1000'] * 4, 'actual-host-uid-gid-1000')


def docker_config(case):
    """Fresh, owned CLI config: Docker must not inject the operator's proxies."""
    directory = canonical(case) / 'docker-empty-config'
    directory.mkdir(mode=0o700)
    write_once(directory / 'config.json', b'{}')
    return str(directory)


def docker_prefix(directory):
    path = canonical(directory); s = path.lstat()
    need(stat.S_ISDIR(s.st_mode) and s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) == 0o700,
         'owned-docker-config-directory')
    raw, _ = read_file(path / 'config.json', 2, uid=os.getuid())
    need(raw == b'{}' and {p.name for p in path.iterdir()} == {'config.json'}, 'empty-docker-config')
    return ['--config', str(path)]


def owned_docker(native, directory, args, **options):
    if args and args[0] == 'create':
        return subprocess.run([*DOCKER, *docker_prefix(directory), *args], env=ENV,
                              capture_output=True, text=True, timeout=options.pop('timeout', 8),
                              check=options.pop('check', True), **options)
    return native.docker([*docker_prefix(directory), *args], **options)


def host_clock_domain():
    boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    need(re.fullmatch('[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', boot), 'actual-boot-id')
    try:
        namespace = os.readlink('/proc/self/ns/time')
        need(re.fullmatch(r'time:\[\d+\]', namespace), 'actual-time-namespace')
    except FileNotFoundError:
        namespace = None
    return {'schema': 'helmut-local-unit-monotonic-domain/1',
            'kind': 'kernel-without-time-namespaces' if namespace is None else 'time-namespace',
            'namespace': namespace, 'bootId': boot}


class ObservationPending(Exception):
    """An actual bounded observer is still running; never a successful proof."""


def host_cgroup(config, pid, membership):
    """Namespace spelling is evidence, not authority to resolve traversal."""
    parent = config['parent']
    need(type(parent) is str and re.fullmatch('helmut-meter-memorybudget-[a-f0-9]{24}', parent), 'exact-host-parent-name')
    match = re.fullmatch(r'0::/(?:\.\./)?' + re.escape(parent) + r'/([a-f0-9]{64})\n', membership)
    need(match is not None, 'actual-common-parent')
    cid = match[1]
    # Never resolve the proc string. Only the validated parent and hex CID name
    # construct a path under the independently mounted cgroup filesystem.
    group = canonical(CGROUP_ROOT / parent)
    parent_fd = os.open(group, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK)
    leaf_fd = member_fd = None
    try:
        before = os.fstat(parent_fd)
        need(stat.S_ISDIR(before.st_mode) and (before.st_dev, before.st_ino) == (config['parentDevice'], config['parentInode']),
             'host-parent-inode')
        leaf_fd = os.open(cid, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent_fd)
        leaf = os.fstat(leaf_fd)
        need(stat.S_ISDIR(leaf.st_mode) and leaf.st_dev == before.st_dev, 'host-leaf-cgroup-device')
        member_fd = os.open('cgroup.procs', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=leaf_fd)
        file = os.fstat(member_fd)
        need(stat.S_ISREG(file.st_mode) and file.st_dev == before.st_dev, 'host-leaf-members-file')
        chunks, size = [], 0
        while block := os.read(member_fd, min(4096, 65537 - size)):
            chunks.append(block); size += len(block); need(size <= 65536, 'host-cgroup-members-cap')
        raw = b''.join(chunks)
        need(re.fullmatch(rb'(?:[1-9][0-9]{0,9}\n)*', raw) is not None, 'host-cgroup-members-format')
        members = [int(x) for x in raw.splitlines()]
        need(len(set(members)) == len(members) and members.count(pid) == 1, 'host-pid-in-exact-leaf')
        parent_after = os.stat(group, follow_symlinks=False)
        leaf_after = os.stat(cid, dir_fd=parent_fd, follow_symlinks=False)
        member_after = os.stat('cgroup.procs', dir_fd=leaf_fd, follow_symlinks=False)
        need(stat.S_ISDIR(parent_after.st_mode) and stat.S_ISDIR(leaf_after.st_mode) and stat.S_ISREG(member_after.st_mode)
             and (before.st_dev, before.st_ino) == (os.fstat(parent_fd).st_dev, os.fstat(parent_fd).st_ino)
                 == (parent_after.st_dev, parent_after.st_ino)
             and (leaf.st_dev, leaf.st_ino) == (os.fstat(leaf_fd).st_dev, os.fstat(leaf_fd).st_ino)
                 == (leaf_after.st_dev, leaf_after.st_ino)
             and (file.st_dev, file.st_ino) == (os.fstat(member_fd).st_dev, os.fstat(member_fd).st_ino)
                 == (member_after.st_dev, member_after.st_ino), 'host-cgroup-identity-drift')
        return {'containerId': cid, 'parent': {'device': before.st_dev, 'inode': before.st_ino},
                'leaf': {'device': leaf.st_dev, 'inode': leaf.st_ino}}
    finally:
        for descriptor in (member_fd, leaf_fd, parent_fd):
            if descriptor is not None:
                os.close(descriptor)


def host_process(config, pid):
    """Only files the operator can genuinely read; no ptrace-gated symlinks."""
    need(type(pid) is int and pid > 0, 'host-process-pid')
    root = Path('/proc') / str(pid)
    before = (root / 'stat').read_text(); fields = before.rsplit(')', 1)[1].split()
    need(before.split()[0] == str(pid) and fields[0] not in ('Z', 'X') and fields[19].isdigit(), 'live-process')
    rows = dict(line.split(':', 1) for line in (root / 'status').read_text().splitlines())
    need(rows.get('Uid', '').split() == rows.get('Gid', '').split() == ['1000'] * 4
         and rows.get('NoNewPrivs', '').strip() == '1'
         and all(rows.get(k) and int(rows[k], 16) == 0 for k in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb')),
         'actual-process-privileges')
    membership = (root / 'cgroup').read_text()
    witness = host_cgroup(config, pid, membership)
    nspid = [int(x) for x in rows.get('NSpid', '').split()]
    need(nspid and nspid[0] == pid and all(x > 0 for x in nspid), 'actual-namespace-pid')
    with open(root / 'cmdline', 'rb') as stream:
        cmdline = stream.read(16385)
    need(0 < len(cmdline) <= 16384 and cmdline.endswith(b'\0'), 'bounded-process-command')
    command = [x.decode('utf8') for x in cmdline[:-1].split(b'\0')]
    need((root / 'stat').read_text().rsplit(')', 1)[1].split()[19] == fields[19]
         and (root / 'cgroup').read_text() == membership and host_cgroup(config, pid, membership) == witness, 'process-reused')
    return {'hostPID': pid, 'namespacePID': nspid[-1], 'startTicks': fields[19], 'nspid': nspid,
            'membership': membership, 'command': command, 'cgroupIdentity': witness}


def group_members(native, config):
    group = native.parent_path(config['parent']); s = group.lstat()
    need(stat.S_ISDIR(s.st_mode) and not group.is_symlink()
         and (s.st_dev, s.st_ino) == (config['parentDevice'], config['parentInode']), 'observer-common-parent')
    members = set()
    for file in group.rglob('cgroup.procs'):
        members.update(int(x) for x in file.read_text().split())
    return members


def exit_published(path):
    marker = Path(str(path) + '.PUBLISHED')
    if not marker.exists():
        return False
    canonical(marker)
    fd = os.open(marker, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        s = os.fstat(fd)
        need(stat.S_ISDIR(s.st_mode) and s.st_uid == 1000 and stat.S_IMODE(s.st_mode) == 0o700
             and not any(marker.iterdir()) and identity(s) == identity(marker.lstat()), 'exit-publication-marker')
    finally:
        os.close(fd)
    return True


def publish_once(path, raw):
    """No reader can observe a partial success reply or a two-link interval."""
    p = Path(path); stage = p.parent / ('.' + p.name + '.stage-' + secrets.token_hex(16))
    write_once(stage, raw)
    libc = ctypes.CDLL(None, use_errno=True); rename = libc.renameat2
    rename.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(stage), -100, os.fsencode(p), 1) != 0:
        raise OSError(ctypes.get_errno(), 'native-execution-host-no-replace-publication')
    directory = os.open(p.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def metadata_pin(pin, uid=None, mode=None):
    """The existing measured source registry owns bytes; do not warm them here."""
    pin_shape(pin); path = canonical(pin['path'])
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        s = os.fstat(fd)
        need(stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and s.st_size == pin['bytes']
             and (uid is None or s.st_uid == s.st_gid == uid) and (mode is None or stat.S_IMODE(s.st_mode) == mode)
             and identity(s) == identity(path.lstat()), 'public-source-metadata')
    finally:
        os.close(fd)


def public_source_mounts(supervisor, config):
    """Exactly six external public provenance files and the Python executable."""
    registry = {}
    for p in config['sources']:
        pin_shape(p)
        need(p['path'] not in registry or registry[p['path']] == p, 'source-registry-pin-conflict'); registry[p['path']] = p
    fields = [('reader', str(supervisor.READER)), ('legacyHelper', str(supervisor.LEGACY)),
              ('jitHelper', str(supervisor.JIT / 'restore_original_jit.py')), ('copyManifest', str(supervisor.COPY_MANIFEST)),
              ('originalBudgetRuntimePin', str(supervisor.ARCH / 'native-budget-implementation-qualification-v2/runtime/RUNTIME.SAFE.json'))]
    expected = {}
    for key, name in fields:
        p = config[key]
        need(p['path'] == name and registry.get(name) == p, 'explicit-public-source-pin'); expected[name] = p
    plan = str(supervisor.JIT / 'JIT_CLOSURE_PLAN.SAFE.json')
    need(plan in registry and Path(config['jitHelper']['path']).parent / 'JIT_CLOSURE_PLAN.SAFE.json' == Path(plan), 'explicit-jit-plan-pin')
    expected[plan] = registry[plan]
    # Match the producer's complete CodeManifest path algorithm. New outside
    # paths require an explicit review; PRIVATE inputs never become transitive.
    repo = Path(config['repository'])
    code = {p['path'] for p in config['sourceCodePins']}
    code |= {p['path'] for p in config['sources'] if Path(p['path']).suffix in ('.py', '.js', '.json', '.sql', '.c')}
    need({p for p in code if not Path(p).is_relative_to(repo)} == set(expected), 'external-public-code-closure')
    for name, p in expected.items():
        need(not any(token in name.lower() for token in ('.private.', '/pgdata/', '/run/', '/ram/', '/bench/', '/.env', 'hmac')), 'private-source-exclusion')
        metadata_pin(p)
    python = str(supervisor.PYTHON / 'bin/python3.12')
    need(config['pythonExecutable'] == python and python in registry, 'python-original-source-pin')
    metadata_pin(registry[python])
    return [(name, name, True) for name in expected], (python, python, True)


def owner_runtime_copies(config, alias_dir):
    """Explicit public ELF closure only; original runtime bytes stay untouched."""
    rows = config['executionHost']['ownerRuntimeBindings']
    need(type(rows) is list and len(rows) <= 64, 'owner-runtime-count')
    registry = {}
    for row in config['runtimeBindings']:
        target = row['imagePath']
        need(target not in registry, 'runtime-target-duplicate')
        registry[target] = row
    targets = [r['imagePath'] for r in rows]
    need(len(set(targets)) == len(targets), 'owner-runtime-target-duplicate')
    loader = next((r for r in rows if r['imagePath'] == '/lib64/ld-linux-x86-64.so.2'), None)
    need(not rows or loader is not None, 'owner-runtime-loader-required')
    copies, total = [], 0
    for index, row in enumerate(rows):
        need(type(row) is dict and set(row) in ({'source', 'imagePath', 'readonly'}, {'source', 'imagePath', 'readonly', 'reuseExisting'})
             and ('reuseExisting' not in row or row['reuseExisting'] is True) and row['readonly'] is True
             and row == registry.get(row['imagePath']), 'owner-runtime-exact-source')
        pin, target = row['source'], row['imagePath']; pin_shape(pin)
        need(type(target) is str and target.startswith(('/usr/lib/', '/lib/', '/lib64/'))
             and str(Path(target)) == target and '..' not in Path(target).parts
             and not any(x in target for x in (',', '\0', '\r', '\n'))
             and not any(x in pin['path'].lower() for x in ('.private.', '/pgdata/', '/.env', 'hmac')), 'owner-public-runtime-target')
        total += pin['bytes']; need(total <= 32 * 1024**2, 'owner-runtime-byte-cap')
        mode = 0o555 if (pin['bytes'], pin['sha256']) == (loader['source']['bytes'], loader['source']['sha256']) else 0o444
        copies.append({'originalSource': pin, 'copy': {**pin, 'path': str(alias_dir / ('runtime-%03d' % index))},
                       'imagePath': target, 'mode': mode})
    return copies


def prepare_execution(native, supervisor, config, case):
    """AFTER native.start, before Source: measured aliases and two owned volumes.

    Add sourceVolumeMounts/sourceAliasMounts/nodeMount to the Source create args;
    replace the former /ram tmpfs and whole Node-directory bind, never stack them.
    sourceOwnerRuntimeMounts replace only their exact original runtime ABI binds;
    ownerRuntimeCopies retains original/copy pins and the measured installer CID.
    The caller retains plan.volumes and setup identities for final accounting.
    """
    nonce, case = config['nonce'], canonical(case)
    host_user()
    need(re.fullmatch('[a-f0-9]{32}', nonce) and case == BASE / nonce, 'fresh-case')
    directory = docker_config(case)
    e = config['executionHost']
    need(set(e) == {'postgrestPin', 'clientRuntimePins', 'ownerRuntimeBindings'}, 'preparation-config')
    group = native.parent_path(config['parent']); g = group.stat()
    need((g.st_dev, g.st_ino) == (config['parentDevice'], config['parentInode']), 'installation-common-parent')
    pins = {Path(p['path']).name: p for p in config['sourceCodePins']}
    public = [('owner', pins['local-unit-native-owner.js'], '/opt/local-unit-native-owner.js', 0o444),
              ('broker', pins['local-unit-diagnostic-broker.js'], '/opt/local-unit-diagnostic-broker.js', 0o444),
              ('postgrest', e['postgrestPin'], '/opt/postgrest-pinned', 0o555)]
    alias_dir = case / 'owner-public'; alias_dir.mkdir(mode=0o700)
    aliases, mounts = {}, []
    for key, p, target, mode in public:
        pin_shape(p)
        aliases[key] = {**p, 'path': target}
        mounts.append((str(alias_dir / key), target, True))
    owner_copies = owner_runtime_copies(config, alias_dir)
    node = config['nodePin']; pin_shape(node)
    allowed = {(r['source']['path'], r['imagePath']): r for r in config['runtimeBindings']}
    runtime_mounts = []
    for r in e['clientRuntimePins']:
        need(r == allowed.get((r['source']['path'], r['imagePath'])) and r['readonly'] is True, 'runtime-closure')
        pin_shape(r['source'])
        target = r['imagePath']
        need((target.startswith(('/usr/', '/lib/', '/lib64/', '/bin/', '/sbin/'))
              or target in {'/etc/group', '/etc/nsswitch.conf', '/etc/passwd'})
             and not any(x in target for x in (',', '\0', '..')), 'public-runtime-target')
        runtime_mounts.append((r['source']['path'], target, True))
    public_mounts, python_mount = public_source_mounts(supervisor, config)
    setup = _install_aliases(native, supervisor, config, alias_dir, public, group, directory)
    for row in owner_copies:
        metadata_pin(row['copy'], uid=1000, mode=row['mode'])
    volumes = {'ram': 'helmut-unitdiag-ram-' + nonce, 'run': 'helmut-unitdiag-run-' + nonce}
    volume_rows = []
    for key, size, uid, mode in [('ram', 268435456, 1000, '0711'), ('run', 16777216, 0, '0755')]:
        name = volumes[key]
        inspected = owned_docker(native, directory, ['volume', 'inspect', name], timeout=3, check=False)
        missing = (r'(?:Error response from daemon: get ' + re.escape(name) + r': no such volume|Error: No such volume: ' + re.escape(name) + r')\n?')
        need(inspected.returncode == 1 and re.fullmatch(missing, getattr(inspected, 'stderr', '')), 'volume-absence-not-established')
        opts = 'rw,exec,nosuid,nodev,size=' + str(size) + ',uid=' + str(uid) + ',gid=' + str(uid) + ',mode=' + mode
        volume_rows.append({'name': name, 'options': {'type': 'tmpfs', 'device': 'tmpfs', 'o': opts}})
    publish_once(case / 'VOLUME_PREPARATION.SAFE.json', encode({'schema': 'helmut-local-unit-native-owned-volumes/1', 'nonce': nonce, 'volumes': volume_rows}))
    for item in volume_rows:
        name, opts = item['name'], item['options']['o']
        result = owned_docker(native, directory, ['volume', 'create', '--driver', 'local', '--opt', 'type=tmpfs', '--opt', 'device=tmpfs', '--opt', 'o=' + opts, name], timeout=5)
        need(result.stdout.strip() == name, 'volume-create-outcome')
        row = json.loads(owned_docker(native, directory, ['volume', 'inspect', name], timeout=3).stdout)[0]
        need(row['Name'] == name and row['Driver'] == 'local' and row['Options'] == {'type': 'tmpfs', 'device': 'tmpfs', 'o': opts}, 'volume-native-options')
    return {'schema': 'helmut-local-unit-native-execution-plan/1', 'dockerConfigDirectory': directory, 'nonce': nonce, 'volumes': volumes, 'aliasPins': aliases,
            'sourceVolumeMounts': ['type=volume,src=' + volumes['ram'] + ',dst=/ram', 'type=volume,src=' + volumes['run'] + ',dst=/run'],
            'sourceAliasMounts': mounts, 'nodeMount': (node['path'], node['path'], True), 'clientRuntimeMounts': runtime_mounts,
            'sourceOwnerRuntimeMounts': [(r['copy']['path'], r['imagePath'], True) for r in owner_copies],
            'ownerRuntimeCopies': [{**r, 'installerContainerId': setup['containerId']} for r in owner_copies],
            'clientPublicSourceMounts': public_mounts, 'pythonMount': python_mount,
            'knownSetupContainerIds': [setup['containerId']], 'installerProcessClose': setup}


class _PipeChild:
    """Real Popen handle: natural EOF and exit are independent observations."""
    def __init__(self, argv, data=None, lifetime=20, deferred=False):
        self.selector = selectors.DefaultSelector(); self.output = [bytearray(), bytearray()]
        self.eof = [False, False]; self.input = memoryview(data or b''); self.input_size = len(self.input); self.offset = 0
        self.transport_failure = None; self.capture_truncated = [False, False]; self.capture_error = None
        self.deadline = time.monotonic() + lifetime; self.finished = False; self.deferred = deferred
        self.child = None; self.registeredPID = None
        try:
            self.child = subprocess.Popen(argv, env=ENV, stdin=subprocess.PIPE if data is not None or deferred else subprocess.DEVNULL,
                                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=True)
            self.registeredPID = self.child.pid
            for i, stream in enumerate((self.child.stdout, self.child.stderr)):
                os.set_blocking(stream.fileno(), False); self.selector.register(stream, selectors.EVENT_READ, i)
            if self.child.stdin and not deferred:
                os.set_blocking(self.child.stdin.fileno(), False); self.selector.register(self.child.stdin, selectors.EVENT_WRITE, 2)
        except BaseException as error:
            self.transport_failure = {'type': type(error).__name__, 'errno': getattr(error, 'errno', None)}
            metadata = self._abort_startup()
            try:
                error.nativePipeFailure = metadata
                error.nativePipePrivateCapture = self.failure_snapshot(drain=False)
            except BaseException:
                pass
            raise

    def _abort_startup(self):
        """Own a post-Popen failure even when no handle can be returned."""
        sent_term = sent_kill = False
        child = self.child
        if child is not None:
            if child.stdin and not child.stdin.closed:
                try:
                    child.stdin.close()
                except BaseException:
                    pass
            readable = []
            for i, stream in enumerate((child.stdout, child.stderr)):
                if stream and not stream.closed:
                    try:
                        os.set_blocking(stream.fileno(), False); readable.append((i, stream))
                    except BaseException:
                        pass
            try:
                if child.poll() is None:
                    child.terminate(); sent_term = True
                until = time.monotonic() + .5
                kill_at = until - .25
                while time.monotonic() < until:
                    for i, stream in readable:
                        if self.eof[i]:
                            continue
                        try:
                            raw = os.read(stream.fileno(), 16384)
                            if raw == b'':
                                self.eof[i] = True
                            else:
                                room = (CAP if i == 0 else 128 * 1024) - len(self.output[i])
                                self.output[i].extend(raw[:max(room, 0)])
                                if len(raw) > room:
                                    self.capture_truncated[i] = True
                        except (BlockingIOError, InterruptedError):
                            pass
                        except BaseException:
                            readable = [(n, s) for n, s in readable if s is not stream]
                    if child.poll() is not None and all(self.eof):
                        break
                    if child.poll() is None and not sent_kill and time.monotonic() >= kill_at:
                        child.kill(); sent_kill = True
                    time.sleep(.005)
                if child.poll() is None and not sent_kill:
                    child.kill(); sent_kill = True
                child.wait(timeout=.25)
            except BaseException:
                try:
                    if child.poll() is None:
                        child.kill(); sent_kill = True
                    child.wait(timeout=.25)
                except BaseException:
                    pass
        try:
            self.selector.close()
        except BaseException:
            pass
        if child is not None:
            for stream in (child.stdin, child.stdout, child.stderr):
                if stream and not stream.closed:
                    try:
                        stream.close()
                    except BaseException:
                        pass
        return {'registeredHostPID': self.registeredPID, 'exitCode': None if child is None else child.poll(),
                'stdoutNaturalEOF': self.eof[0], 'stderrNaturalEOF': self.eof[1],
                'termSent': sent_term, 'killSent': sent_kill, 'startupFailed': True, 'remoteExitConfirmed': False}

    def supply(self, data):
        need(self.deferred and self.child.stdin and not self.child.stdin.closed and self.offset == 0, 'single-deferred-input')
        self.input = memoryview(data); self.input_size = len(data); self.deferred = False
        os.set_blocking(self.child.stdin.fileno(), False); self.selector.register(self.child.stdin, selectors.EVENT_WRITE, 2)

    def tick(self):
        if self.transport_failure is not None:
            raise RuntimeError('native-execution-host-child-transport-failed')
        try:
            return self._tick()
        except BaseException as error:
            self.transport_failure = {'type': type(error).__name__, 'errno': getattr(error, 'errno', None)}
            try:
                self.failure_snapshot()
            except BaseException as capture_error:
                self.capture_error = {'type': type(capture_error).__name__, 'errno': getattr(capture_error, 'errno', None)}
            raise

    def failure_snapshot(self, drain=True):
        """PRIVATE only. Never retry stdin or infer a remote process exit."""
        if self.child is not None and self.child.stdin and not self.child.stdin.closed:
            try:
                self.selector.unregister(self.child.stdin)
            except BaseException:
                pass
            try:
                self.child.stdin.close()
            except BaseException:
                pass
        if drain and self.child is not None:
            until = time.monotonic() + .1
            while time.monotonic() < until:
                progress = False
                for i, stream in enumerate((self.child.stdout, self.child.stderr)):
                    if stream is None or stream.closed or self.eof[i]:
                        continue
                    try:
                        os.set_blocking(stream.fileno(), False)
                        raw = os.read(stream.fileno(), 16384)
                    except (BlockingIOError, InterruptedError):
                        continue
                    except BaseException:
                        continue
                    progress = True
                    if raw:
                        room = (CAP if i == 0 else 128 * 1024) - len(self.output[i])
                        self.output[i].extend(raw[:max(0, room)])
                        if len(raw) > room:
                            self.capture_truncated[i] = True
                    else:
                        self.eof[i] = True
                        try:
                            self.selector.unregister(stream)
                        except BaseException:
                            pass
                        try:
                            stream.close()
                        except BaseException:
                            pass
                if all(self.eof):
                    break
                if not progress:
                    time.sleep(.005)
        return {'schema': 'helmut-local-unit-native-pipe-failure-private/1',
                'registeredHostPID': self.registeredPID, 'transportFailure': self.transport_failure, 'captureError': self.capture_error,
                'localExitCode': None if self.child is None else self.child.poll(),
                'stdoutNaturalEOF': self.eof[0], 'stderrNaturalEOF': self.eof[1],
                'inputWrittenBytes': self.offset, 'inputTotalBytes': self.input_size,
                'stdoutBytes': len(self.output[0]), 'stderrBytes': len(self.output[1]),
                'stdoutTruncated': self.capture_truncated[0], 'stderrTruncated': self.capture_truncated[1],
                'stdoutBase64': base64.b64encode(self.output[0]).decode('ascii'),
                'stderrBase64': base64.b64encode(self.output[1]).decode('ascii'), 'remoteExitConfirmed': False}

    def _tick(self):
        need(self.child.pid == self.registeredPID, 'registered-child-identity')
        if self.finished:
            return True
        for key, _ in self.selector.select(0):
            if key.data == 2:
                try:
                    n = os.write(key.fd, self.input[self.offset:self.offset + 16384]); self.offset += n
                except BlockingIOError:
                    continue
                if self.offset == len(self.input):
                    self.selector.unregister(key.fileobj); key.fileobj.close(); self.input = memoryview(b'')
            else:
                try:
                    raw = os.read(key.fd, 16384)
                except BlockingIOError:
                    continue
                if raw:
                    room = (CAP if key.data == 0 else 128 * 1024) - len(self.output[key.data])
                    self.output[key.data].extend(raw[:max(0, room)])
                    if len(raw) > room:
                        self.capture_truncated[key.data] = True
                        need(False, 'child-stream-cap')
                else:
                    self.eof[key.data] = True; self.selector.unregister(key.fileobj); key.fileobj.close()
        code = self.child.poll()
        need(time.monotonic() < self.deadline or code is not None and all(self.eof), 'child-deadline')
        self.finished = code is not None and all(self.eof)
        if self.finished:
            self.selector.close()
        return self.finished

    def close_metadata(self):
        need(self.child.poll() is not None and all(self.eof) and not self.deferred and self.offset == self.input_size, 'actual-exit-and-two-eof-required')
        return {'exitCode': self.child.returncode, 'stdoutNaturalEOF': self.eof[0], 'stderrNaturalEOF': self.eof[1],
                'registeredHostPID': self.registeredPID}


PROCESS_OBSERVER = r'''
"use strict";
const fs=require('node:fs'), crypto=require('node:crypto'), v8=require('node:v8');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const need=x=>{if(!x)throw Error('observer-guard');};
const read=p=>fs.readFileSync(p,'utf8');
const tick=()=>new Date().toISOString();
function proc(pid){
 need(Number.isSafeInteger(pid)&&pid>0);
 const root='/proc/'+pid, raw=read(root+'/stat'), f=raw.slice(raw.lastIndexOf(')')+2).trim().split(/\s+/);
 need(raw.split(' ')[0]===String(pid)&&!['Z','X'].includes(f[0])&&/^\d+$/.test(f[19]));
 const d=Object.fromEntries(read(root+'/status').trim().split('\n').map(x=>{const i=x.indexOf(':');return[x.slice(0,i),x.slice(i+1).trim()];}));
 const ids=k=>d[k].split(/\s+/).map(Number);
 need(ids('Uid').length===4&&ids('Gid').length===4&&[...ids('Uid'),...ids('Gid')].every(x=>x===1000));
 need(['CapInh','CapPrm','CapEff','CapBnd','CapAmb'].every(k=>/^[0-9a-f]+$/i.test(d[k])&&BigInt('0x'+d[k])===0n)&&d.NoNewPrivs==='1');
 const namespaces=Object.fromEntries(['pid','net','mnt','cgroup'].map(k=>[k,fs.readlinkSync(root+'/ns/'+k)]));
 let time=null;
 try{time=fs.readlinkSync(root+'/ns/time');need(/^time:\[\d+\]$/.test(time));}catch(e){if(e.code!=='ENOENT')throw e;}
 const bootId=read('/proc/sys/kernel/random/boot_id').trim();need(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(bootId));
 namespaces.time=time;namespaces.clockDomain={schema:'helmut-local-unit-monotonic-domain/1',kind:time===null?'kernel-without-time-namespaces':'time-namespace',namespace:time,bootId};
 const membership=read(root+'/cgroup');need(membership==='0::/\n');
 const nspid=ids('NSpid');need(nspid.length>0&&nspid.at(-1)===pid&&nspid.every(x=>Number.isSafeInteger(x)&&x>0));
 const exe=fs.readlinkSync(root+'/exe');
 need(read(root+'/stat').slice(read(root+'/stat').lastIndexOf(')')+2).trim().split(/\s+/)[19]===f[19]);
 return {pid,startTicks:f[19],uids:ids('Uid'),gids:ids('Gid'),capabilitiesZero:true,noNewPrivileges:true,nspid,exe,namespaces,membership};
}
const timer=setTimeout(()=>process.exit(74),2500);
try{
 need(process.version==='v24.19.0'&&process.execArgv.length===4&&process.execArgv[0]==='--max-old-space-size=384'&&process.execArgv[1]==='--max-semi-space-size=16'&&process.execArgv[2]==='-e');
 const heap=v8.getHeapStatistics().heap_size_limit;need(heap>=384*1024**2&&heap<=448*1024**2);
 const self=proc(process.pid);
 console.log(JSON.stringify({schema:'helmut-local-unit-native-process-observer-ready/1',self,nodeVersion:process.version,execArgvSHA256:hash(JSON.stringify(process.execArgv)),heapSizeLimitBytes:heap}));
 let chunks=[],size=0;
 process.stdin.on('data',b=>{size+=b.length;if(size>4096)process.exit(75);chunks.push(b);});
 process.stdin.once('error',()=>process.exit(75));
 process.stdin.once('end',()=>{try{
  const q=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  need(JSON.stringify(Object.keys(q).sort())===JSON.stringify(['group','init','nonce','schema','targets'])&&q.schema==='helmut-local-unit-native-process-observer-request/1'&&/^[a-f0-9]{64}$/.test(q.nonce));
  need(Array.isArray(q.targets)&&q.targets.length>=1&&q.targets.length<=2&&new Set(q.targets.map(x=>x.pid)).size===q.targets.length);
  const g=fs.statSync('/owned-group');need(g.dev===q.group.device&&g.ino===q.group.inode);
  need(q.init.pid===1);
  try{const init=proc(1);need(q.init.startTicks===init.startTicks&&init.namespaces.pid===self.namespaces.pid);}catch(e){if(e.code!=='ENOENT')throw e;}
  const targets=q.targets.map(t=>{need(Object.keys(t).length===2&&Object.hasOwn(t,'pid')&&Object.hasOwn(t,'startTicks'));try{const p=proc(t.pid);need(p.startTicks===t.startTicks&&p.namespaces.pid===self.namespaces.pid);return p;}catch(e){if(e.code!=='ENOENT')throw e;return{pid:t.pid,startTicks:t.startTicks,gone:true};}});
  console.log(JSON.stringify({schema:'helmut-local-unit-native-process-observer-result/1',requestNonceSHA256:hash(q.nonce),observedAtUTC:tick(),self:proc(process.pid),targets}));
  clearTimeout(timer);
 }catch(e){process.exitCode=75;clearTimeout(timer);}});
}catch(e){process.exitCode=75;clearTimeout(timer);}
'''


class ProcessObserver:
    """One immutable Node exec, held live until independent host mapping."""
    def __init__(self, native, config, directory, row, targets, allow_gone=False):
        self.began = time.monotonic()
        self.native, self.config, self.directory = native, config, directory
        self.cid, self.init_pid = row['Id'], row['State']['Pid']
        need(HASH.fullmatch(self.cid) and row['State']['Running'], 'observer-live-container')
        self.init = host_process(config, self.init_pid)
        if self.cid == config.get('actualSourceContainerId'):
            python = config['pythonExecutable']; worker = str(Path(config['repository']) / 'scripts/helmut-resource-meter/local-unit-native-worker.py')
            command = 'exec ' + python + ' -I -S -B ' + worker + ' > /bench/BOOTSTRAP.PRIVATE.log 2>&1'
            need(row['Path'] == '/bin/sh' and row['Args'] == ['-c', command]
                 and self.init['command'] == [python, '-I', '-S', '-B', worker]
                 and any(p['path'] == worker for p in config['sources']), 'observer-source-fixed-exec-command')
        else:
            need(self.init['command'] == [row['Path'], *row['Args']], 'observer-direct-command')
        need(self.init['namespacePID'] == 1 and self.init['cgroupIdentity']['containerId'] == self.cid
             and (self.cid in self.init['membership'].strip().split('/')
                  or 'docker-' + self.cid + '.scope' in self.init['membership'].strip().split('/')), 'observer-container-init-pid')
        self.before = targets; self.allow_gone = allow_gone
        need(1 <= len(targets) <= 2 and len({p['namespacePID'] for p in targets}) == len(targets)
             and all(p['membership'] == self.init['membership'] for p in targets), 'observer-target-container')
        self.nonce = secrets.token_hex(32); self.remote = None; self.result = None
        argv = [*DOCKER, *docker_prefix(directory), 'exec', '-i', '--user', '1000:1000', self.cid,
                config['nodePin']['path'], *FLAGS, '-e', PROCESS_OBSERVER]
        self.child = _PipeChild(argv, lifetime=3, deferred=True)

    def _inside(self, value, host):
        need(type(value) is dict and set(value) == {'pid', 'startTicks', 'uids', 'gids', 'capabilitiesZero', 'noNewPrivileges',
              'nspid', 'exe', 'namespaces', 'membership'} and value['pid'] == host['namespacePID']
             and value['startTicks'] == host['startTicks'] and value['uids'] == value['gids'] == [1000] * 4
             and value['capabilitiesZero'] is True and value['noNewPrivileges'] is True and value['membership'] == '0::/\n'
             and type(value['nspid']) is list and value['nspid'] and value['nspid'][-1] == host['namespacePID'], 'observer-inside-process')
        ns = value['namespaces']; clock = ns['clockDomain']
        need(set(ns) == {'pid', 'net', 'mnt', 'cgroup', 'time', 'clockDomain'}
             and all(type(ns[k]) is str and re.fullmatch(k + r':\[\d+\]', ns[k]) for k in ('pid', 'net', 'mnt', 'cgroup')),
             'observer-real-namespaces')
        need(type(clock) is dict and set(clock) == {'schema', 'kind', 'namespace', 'bootId'}
             and clock['schema'] == 'helmut-local-unit-monotonic-domain/1'
             and clock['bootId'] == host_clock_domain()['bootId'] and clock['namespace'] == ns['time']
             and ((ns['time'] is None and clock['kind'] == 'kernel-without-time-namespaces'
                   and host_clock_domain()['namespace'] is None)
                  or (type(ns['time']) is str and re.fullmatch(r'time:\[\d+\]', ns['time']) and clock['kind'] == 'time-namespace')),
             'observer-clock-domain')
        need(value['exe'] == host['command'][0], 'observer-actual-executable')
        return {'hostPID': host['hostPID'], 'namespacePID': host['namespacePID'], 'startTicks': host['startTicks'],
                'exe': value['exe'], 'namespaces': ns, 'membership': host['membership']}

    def tick(self):
        if self.result is not None:
            return self.result
        done = self.child.tick(); raw = bytes(self.child.output[0]); lines = raw.split(b'\n')[:-1]
        need(len(raw) <= 16384 and len(self.child.output[1]) == 0 and len(lines) <= 2, 'observer-output-closure')
        if self.remote is None and lines:
            ready = unique(lines[0])
            need(set(ready) == {'schema', 'self', 'nodeVersion', 'execArgvSHA256', 'heapSizeLimitBytes'}
                 and ready['schema'] == 'helmut-local-unit-native-process-observer-ready/1' and ready['nodeVersion'] == 'v24.19.0'
                 and ready['execArgvSHA256'] == sha(encode([*FLAGS, '-e', PROCESS_OBSERVER]))
                 and 384 * 1024**2 <= ready['heapSizeLimitBytes'] <= 448 * 1024**2, 'observer-ready-budget')
            command = [self.config['nodePin']['path'], *FLAGS, '-e', PROCESS_OBSERVER]
            matches = []
            for pid in group_members(self.native, self.config):
                try:
                    p = host_process(self.config, pid)
                except (FileNotFoundError, ProcessLookupError, RuntimeError):
                    continue
                if (p['namespacePID'], p['startTicks'], p['membership'], p['command']) == (
                        ready['self']['pid'], ready['self']['startTicks'], self.init['membership'], command):
                    matches.append(p)
            need(len(matches) == 1 and matches[0]['hostPID'] not in {p['hostPID'] for p in self.before}, 'observer-unique-live-host-mapping')
            self.remote = matches[0]; self.remote_process = self._inside(ready['self'], self.remote)
            need(host_process(self.config, self.init_pid) == self.init, 'observer-init-drift')
            self.child.supply(encode({'schema': 'helmut-local-unit-native-process-observer-request/1', 'nonce': self.nonce,
                'init': {'pid': 1, 'startTicks': self.init['startTicks']},
                'targets': [{'pid': p['namespacePID'], 'startTicks': p['startTicks']} for p in self.before],
                'group': {'device': self.config['parentDevice'], 'inode': self.config['parentInode']}}))
        if not done:
            return None
        close = self.child.close_metadata()
        need(self.remote is not None and close['exitCode'] == 0 and close['stdoutNaturalEOF'] is True
             and close['stderrNaturalEOF'] is True and len(lines) == 2 and raw.endswith(b'\n'), 'observer-actual-success-close')
        result = unique(lines[1])
        need(set(result) == {'schema', 'requestNonceSHA256', 'observedAtUTC', 'self', 'targets'}
             and result['schema'] == 'helmut-local-unit-native-process-observer-result/1'
             and result['requestNonceSHA256'] == sha(self.nonce) and abs(time.time() - instant(result['observedAtUTC'])) < 3
             and len(result['targets']) == len(self.before), 'observer-result-binding')
        need(time.monotonic() - self.began < 3, 'observer-total-freshness')
        need(self._inside(result['self'], self.remote) == self.remote_process, 'observer-self-drift')
        row = json.loads(owned_docker(self.native, self.directory, ['inspect', self.cid], timeout=3).stdout)[0]
        target_gone = any(p.get('gone') is True for p in result['targets'])
        need(row['Id'] == self.cid and not row['State']['OOMKilled'] and
             ((row['State']['Running'] and row['State']['Pid'] == self.init_pid and host_process(self.config, self.init_pid) == self.init)
              or (target_gone and self.allow_gone and not row['State']['Running'] and row['State']['ExitCode'] == 0)), 'observer-container-drift')
        values, gone = [], []
        for before, inside in zip(self.before, result['targets']):
            if inside.get('gone') is True:
                need(self.allow_gone and set(inside) == {'pid', 'startTicks', 'gone'}
                     and inside['pid'] == before['namespacePID'] and inside['startTicks'] == before['startTicks'], 'observer-unqualified-target-gone')
                gone.append(before['hostPID']); continue
            need(host_process(self.config, before['hostPID']) == before, 'observer-target-drift')
            p = self._inside(inside, before)
            need(p['namespaces']['pid'] == self.remote_process['namespaces']['pid'], 'observer-target-namespace')
            values.append(p)
        self.result = {'processes': values, 'gone': gone, 'observedAt': self.began,
                       'close': {**close, 'containerId': self.cid, 'observerProcess': self.remote_process,
                                 'observerCodeSHA256': sha(PROCESS_OBSERVER), 'nodePin': self.config['nodePin'],
                                 'requestNonceSHA256': sha(self.nonce), 'observedAtUTC': result['observedAtUTC']}}
        return self.result


def dispose_observer(observer):
    child = observer.child
    clean = observer.result is not None
    if child.child.poll() is None:
        clean = False
        child.child.kill()
        try:
            child.child.wait(timeout=1)
        except BaseException:
            pass
    child.selector.close()
    for stream in (child.child.stdin, child.child.stdout, child.child.stderr):
        if stream and not stream.closed:
            stream.close()
    return clean


INSTALLER = r'''
import os,sys,json,stat,hashlib
assert os.getuid()==os.getgid()==1000
status=dict(x.split(':',1) for x in open('/proc/self/status').read().splitlines())
assert status['Uid'].split()==status['Gid'].split()==['1000']*4
assert all(int(status[x].strip(),16)==0 for x in ('CapInh','CapPrm','CapEff','CapBnd','CapAmb')) and status['NoNewPrivs'].strip()=='1'
p=os.getpid();s=open('/proc/self/stat').read().rsplit(')',1)[1].split()
assert s[0] not in ('Z','X') and open('/proc/self/cgroup').read()=='0::/\n'
print(json.dumps({'schema':'helmut-local-unit-alias-installer-ready/1','pid':p,'startTicks':s[19],
 'pidNamespace':os.readlink('/proc/self/ns/pid')},separators=(',',':')),flush=True)
wire=sys.stdin.buffer.read(65537);assert len(wire)<=65536
v=json.loads(wire);assert set(v)=={'files','group'} and 3<=len(v['files'])<=67
g=os.stat('/owned-group');assert (g.st_dev,g.st_ino)==(v['group']['device'],v['group']['inode'])
meta=lambda s:tuple(getattr(s,k) for k in ('st_dev','st_ino','st_mode','st_uid','st_gid','st_nlink','st_size','st_mtime_ns','st_ctime_ns'))
runtime=v['files'][3:];loader=next((r for r in runtime if r['imagePath']=='/lib64/ld-linux-x86-64.so.2'),None)
assert not runtime or loader is not None
assert len({r['imagePath'] for r in runtime})==len(runtime) and sum(r['source']['bytes'] for r in runtime)<=32*1024**2
out=[]
for index,row in enumerate(v['files']):
 assert set(row)=={'source','target','mode','imagePath'}
 src=row['source'];target=row['target'];assert set(src)=={'path','bytes','sha256'} and os.path.realpath(src['path'])==src['path']
 if index<3:
  assert target==('/output/owner','/output/broker','/output/postgrest')[index]
  assert row['imagePath']==('/opt/local-unit-native-owner.js','/opt/local-unit-diagnostic-broker.js','/opt/postgrest-pinned')[index]
  assert row['mode']==(0o555 if index==2 else 0o444)
 else:
  assert target=='/output/runtime-%03d'%(index-3) and row['imagePath'].startswith(('/usr/lib/','/lib/','/lib64/'))
  assert '..' not in row['imagePath'].split('/') and not any(c in row['imagePath'] for c in (',','\0','\r','\n'))
  assert row['mode']==(0o555 if (src['bytes'],src['sha256'])==(loader['source']['bytes'],loader['source']['sha256']) else 0o444)
 f=os.open(src['path'],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 d=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
 try:
  a=os.fstat(f);assert stat.S_ISREG(a.st_mode) and a.st_nlink==1 and a.st_size==src['bytes'];h=hashlib.sha256();n=0
  while True:
   b=os.read(f,262144)
   if not b:break
   h.update(b);n+=len(b);assert n<=src['bytes'];i=0
   while i<len(b):
    z=os.write(d,b[i:]);assert z>0;i+=z
  assert n==src['bytes'] and h.hexdigest()==src['sha256'] and meta(a)==meta(os.fstat(f))==meta(os.lstat(src['path']))
  os.fchmod(d,row['mode']);os.fsync(d);q=os.fstat(d)
  assert q.st_uid==q.st_gid==1000 and q.st_nlink==1 and q.st_size==n and stat.S_IMODE(q.st_mode)==row['mode'] and meta(q)==meta(os.lstat(target))
 finally:os.close(f);os.close(d)
 r=os.open(target,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  a=os.fstat(r);h=hashlib.sha256()
  while True:
   b=os.read(r,262144)
   if not b:break
   h.update(b)
  assert h.hexdigest()==src['sha256'] and meta(a)==meta(os.fstat(r))==meta(os.lstat(target))
 finally:os.close(r)
 out.append({'path':target,'bytes':n,'sha256':src['sha256']})
d=os.open('/output',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);os.fsync(d);os.close(d)
print(json.dumps({'schema':'helmut-local-unit-alias-installer-result/1','files':out},separators=(',',':')),flush=True)
'''


def _install_aliases(native, supervisor, config, alias_dir, public, group, directory):
    """The host handles bounded metadata only; all new content/cache is owned."""
    copies = owner_runtime_copies(config, alias_dir)
    files = [{'source': pin, 'target': '/output/' + key, 'mode': mode, 'imagePath': target} for key, pin, target, mode in public]
    files += [{'source': row['originalSource'], 'target': '/output/' + Path(row['copy']['path']).name,
               'mode': row['mode'], 'imagePath': row['imagePath']} for row in copies]
    mounts = {str(target): (str(source), bool(ro)) for source, target, ro in
              [(alias_dir, '/output', False), (supervisor.PYTHON, supervisor.PYTHON, True), (group, '/owned-group', True),
               (config['nodePin']['path'], config['nodePin']['path'], True)]}
    for row in config['runtimeBindings']:
        need(row['readonly'] is True, 'installer-readonly-runtime')
        target, source = row['imagePath'], row['source']['path']
        need(target not in mounts or mounts[target] == (source, True), 'installer-mount-collision'); mounts[target] = (source, True)
    for _, pin, _, _ in public:
        source = pin['path']; need(source not in mounts or mounts[source] == (source, True), 'installer-source-collision'); mounts[source] = (source, True)
    for copy in copies:
        source = copy['originalSource']['path']
        need(source not in mounts or mounts[source] == (source, True), 'installer-runtime-source-collision'); mounts[source] = (source, True)
    argv = ['create', '--interactive', '--name', 'helmut-unitdiag-aliases-' + config['nonce'], '--network', 'none', '--read-only', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges', '--user', '1000:1000', '--cgroup-parent=/' + config['parent'], '--cgroupns', 'private',
            '--log-driver', 'none', '--env', 'HOSTNAME', '--entrypoint', str(supervisor.PYTHON / 'bin/python3.12')]
    for target, (source, ro) in mounts.items():
        need(not any(x in source + target for x in (',', '\0', '\n')), 'installer-mount-path')
        argv += ['--mount', 'type=bind,src=' + source + ',dst=' + target + (',readonly' if ro else '')]
    argv += [config['runtime']['imageId'], '-I', '-S', '-B', '-c', INSTALLER]
    cid = owned_docker(native, directory, argv, timeout=8).stdout.strip(); need(HASH.fullmatch(cid), 'installer-id')
    # Publish this identity before start, even if native setup later fails.
    publish_once(alias_dir.parent / 'ALIAS_INSTALLER_CREATED.SAFE.json', encode({'containerId': cid}))
    child = None
    observed, supplied, observer = None, False, None
    try:
        child = _PipeChild([*DOCKER, *docker_prefix(directory), 'start', '--attach', '--interactive', cid], lifetime=20, deferred=True)
        while True:
            done = child.tick()
            row = json.loads(owned_docker(native, directory, ['inspect', cid], timeout=3).stdout)[0]; h = row['HostConfig']
            need(row['Id'] == cid and row['Image'] == config['runtime']['imageId'] and row['Config']['User'] == '1000:1000'
                 and row['Config'].get('Env') == ['HOSTNAME']
                 and h['CgroupParent'] == '/' + config['parent'] and h['CgroupnsMode'] == 'private' and h['NetworkMode'] == 'none'
                 and h['ReadonlyRootfs'] and h['CapDrop'] == ['ALL'] and not h['CapAdd'] and not h['Privileged']
                 and h['SecurityOpt'] == ['no-new-privileges'] and not row['State']['OOMKilled'], 'actual-installer-container')
            actual = {m['Destination']: m for m in row['Mounts']}
            need(set(actual) == set(mounts) and all(actual[t]['Type'] == 'bind' and actual[t]['Source'] == p
                 and actual[t]['RW'] is (not ro) and actual[t]['Propagation'] == 'rprivate' for t, (p, ro) in mounts.items()), 'actual-installer-mounts')
            lines = bytes(child.output[0]).split(b'\n')[:-1]
            if not supplied and lines:
                ready = unique(lines[0]); need(ready['schema'] == 'helmut-local-unit-alias-installer-ready/1' and row['State']['Running'], 'installer-live-ready')
                if observer is None:
                    target = host_process(config, row['State']['Pid'])
                    need(target['command'] == [str(supervisor.PYTHON / 'bin/python3.12'), '-I', '-S', '-B', '-c', INSTALLER], 'installer-command')
                    observer = ProcessObserver(native, config, directory, row, [target])
                sample = observer.tick()
                if sample is None:
                    time.sleep(.01); continue
                observed = sample['processes'][0]
                need(ready['pid'] == observed['namespacePID'] and ready['startTicks'] == observed['startTicks']
                     and ready['pidNamespace'] == observed['namespaces']['pid'] and observed['exe'] == str(supervisor.PYTHON / 'bin/python3.12'), 'actual-installer-process')
                payload = encode({'files': files,
                                  'group': {'device': config['parentDevice'], 'inode': config['parentInode']}})
                need(len(payload) <= 65536, 'installer-input-cap'); child.supply(payload); supplied = True
            if done:
                close = child.close_metadata()
                need(supplied and close['exitCode'] == 0 and row['State']['ExitCode'] == 0 and not row['State']['Running']
                     and len(lines) == 2 and bytes(child.output[0]).endswith(b'\n'), 'actual-installer-close')
                result = unique(lines[1]); need(result == {'schema': 'helmut-local-unit-alias-installer-result/1',
                    'files': [{'path': f['target'], 'bytes': f['source']['bytes'], 'sha256': f['source']['sha256']} for f in files]}, 'actual-installer-result')
                return {'containerId': cid, 'process': observed, **close, 'observerProcessClose': sample['close']}
            time.sleep(.02)
    except BaseException as error:
        try:
            publish_once(alias_dir.parent / 'ALIAS_INSTALLER_FAILURE.PRIVATE.json', encode({
                'schema': 'helmut-local-unit-native-alias-installer-failure/1',
                'containerId': cid, 'supplied': supplied,
                'exceptionType': type(error).__name__, 'privateTraceback': traceback.format_exc()[:32768],
                'pipeChildFailure': getattr(error, 'nativePipeFailure', None),
                'stdout': bytes(child.output[0]).decode('utf8', errors='replace') if child else '',
                'stderr': bytes(child.output[1]).decode('utf8', errors='replace') if child else '',
                'retryAllowed': False}))
        except BaseException:
            pass
        # Never adopt/retry a copy with an unknown result. Keep the CID/evidence
        # for final common-parent accounting; stop only this newly owned child.
        try:
            owned_docker(native, directory, ['stop', '--time', '2', cid], timeout=4)
            until = time.monotonic() + 2
            while child is not None and time.monotonic() < until and not child.tick():
                time.sleep(.02)
        except BaseException:
            if child is not None and child.child.poll() is None:
                child.child.kill(); child.child.wait(timeout=1)
        raise RuntimeError('native-execution-host-alias-installation-unknown') from None
    finally:
        if observer is not None:
            dispose_observer(observer)
        if child is not None:
            child.selector.close()
            for stream in (child.child.stdin, child.child.stdout, child.child.stderr):
                if stream and not stream.closed:
                    stream.close()


# This fixed program is passed as code, with every secret exclusively in stdin.
# No shell parsing, dynamic imports, client-controlled destination or owner flag.
BOOTSTRAP = r'''
import os,sys,json,stat,hashlib
v=json.loads(sys.stdin.buffer.read(262145));assert set(v)=={'start','sourceQualification','hmacKeyHex','readQualifications','ownerEnvironment'}
assert os.getuid()==0 and os.getgid()==0
os.umask(0o077);os.mkdir('/run/bootstrap',0o700)
def put(p,b):
 f=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
 try:
  s=os.fstat(f);assert stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1
  o=0
  while o<len(b):
   n=os.write(f,b[o:]);assert n>0;o+=n
  os.fsync(f);assert os.fstat(f).st_size==len(b)
 finally:os.close(f)
raw=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
put('/run/bootstrap/SOURCE_QUALIFICATION.PRIVATE.json',raw(v['sourceQualification']))
put('/run/bootstrap/ORIGINAL_HMAC.PRIVATE.bin',bytes.fromhex(v['hmacKeyHex']))
for q in v['readQualifications']:put(q['path'],q['text'].encode())
put('/run/bootstrap/START.PRIVATE.json',raw(v['start']))
n=v['start']['pins']['node']['path'];os.execve(n,[n,'--max-old-space-size=384','--max-semi-space-size=16','/opt/local-unit-native-owner.js','--start-own-native-endpoint'],v['ownerEnvironment'])
'''

ROOT_READ = r'''
import os,sys,json,stat,hashlib
v=json.loads(sys.stdin.buffer.read(4097));p=v['path'];assert p in ('/run/bootstrap/CONTROL_READ_TRACE.SAFE.jsonl','/run/helmut-local-unit-diagnostic/trust.json')
f=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
 a=os.fstat(f);assert stat.S_ISREG(a.st_mode) and a.st_uid==a.st_gid==0 and a.st_nlink==1 and 0<a.st_size<=65536
 assert stat.S_IMODE(a.st_mode)==(0o600 if 'TRACE' in p else 0o444)
 b=b''
 while True:
  x=os.read(f,65537-len(b))
  if not x:break
  b+=x;assert len(b)<=65536
 names=('st_dev','st_ino','st_mode','st_uid','st_gid','st_nlink','st_size','st_mtime_ns','st_ctime_ns')
 ident=lambda s:[getattr(s,k) for k in names]
 assert ident(a)==ident(os.fstat(f))==ident(os.lstat(p)) and len(b)==a.st_size
 rows=[json.loads(x) for x in b.splitlines()]
 assert b.endswith(b'\n') and len(rows)>=2 if 'TRACE' in p else len(rows)==1
 out={'pin':{'path':p,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()},'identity':dict(zip(names,ident(a))),
      'value':{'schema':rows[0]['schema'],'header':rows[0]['header'],'records':rows[1:-1],'footer':rows[-1]} if 'TRACE' in p else rows[0]}
 print(json.dumps(out,separators=(',',':')))
finally:os.close(f)
'''

ROOT_SIGNAL = r'''
import os,sys,json,signal
v=json.loads(sys.stdin.buffer.read(4097));p=v['pid'];s=open('/proc/'+str(p)+'/stat').read();f=s[s.rfind(')')+2:].split()
assert str(p)==s.split()[0] and f[19]==v['startTicks'] and f[0] not in ('Z','X')
assert os.readlink('/proc/'+str(p)+'/exe')==v['exe'] and os.readlink('/proc/'+str(p)+'/ns/pid')==v['pidNamespace']
status=open('/proc/'+str(p)+'/status').read().splitlines();d=dict(x.split(':',1) for x in status)
assert d['Uid'].split()==d['Gid'].split()==['0']*4
assert all(int(d[x].strip(),16)==0 for x in ('CapInh','CapPrm','CapEff','CapBnd','CapAmb')) and d['NoNewPrivs'].strip()=='1'
os.kill(p,signal.SIGTERM);print('{}')
'''


class NativeExecutionHost:
    def __init__(self, native, supervisor, config, case, budget, source_id, source_mounts, plan):
        host_user()
        self.native, self.supervisor, self.config = native, supervisor, config
        self.case, self.budget, self.source_id = canonical(case), budget, source_id
        self.source_mounts, self.plan = source_mounts, plan
        need(self.case == BASE / config['nonce'] and plan['nonce'] == config['nonce'] and HASH.fullmatch(source_id)
             and config['actualSourceContainerId'] == source_id, 'host-case')
        copies = owner_runtime_copies(config, self.case / 'owner-public')
        expected_mounts = [(r['copy']['path'], r['imagePath'], True) for r in copies]
        need([tuple(r) for r in plan['sourceOwnerRuntimeMounts']] == expected_mounts, 'source-owner-runtime-plan')
        installer = plan.get('installerProcessClose', {}).get('containerId')
        need(plan['ownerRuntimeCopies'] == [{**r, 'installerContainerId': installer} for r in copies], 'source-owner-runtime-provenance')
        for row in copies:
            need(installer in plan['knownSetupContainerIds'], 'source-owner-runtime-installer')
            metadata_pin(row['copy'], uid=1000, mode=row['mode'])
        required_mounts = {tuple(x) for x in [*plan['sourceAliasMounts'], *plan['sourceOwnerRuntimeMounts'], plan['nodeMount']]}
        need(required_mounts <= {tuple(map(str, x[:2])) + (x[2],) for x in source_mounts}, 'source-public-mount-closure')
        node = Path(config['nodePin']['path'])
        need(not any(str(t) != str(node) and node.is_relative_to(Path(t)) for _, t, _ in source_mounts), 'original-node-single-file-mount')
        self.seq = 1; self.seen = set(); self.selection = None; self.pending = None
        self.state = 'INIT'; self.failure = None; self.closed = False
        self.children = []; self.owner = None; self.owner_ready = None; self.heartbeat = None
        self.owner_lines = 0; self.last_heartbeat = 0; self.source_identity = None
        self.clients = {}; self.active_client = None; self.client_pins = []; self.handoff = None; self.pending_handoff = None
        self.directory = plan['dockerConfigDirectory']
        need(self.directory == str(self.case / 'docker-empty-config'), 'case-docker-config-binding')
        docker_prefix(self.directory)
        self.probes = {}; self.process_cache = {}; self.observer_closes = []; self.observer_count = 0
        self.stop_observers = False; self.quiescing_client = None
        self.observed_at = 0; self.started_at = time.monotonic(); self.last_observation = None

    def _docker(self, args, **options):
        return owned_docker(self.native, self.directory, args, timeout=options.pop('timeout', 3), **options)

    def _child(self, argv, data=None, lifetime=20, deferred=False):
        c = _PipeChild(argv, data, lifetime, deferred=deferred); self.children.append(c); return c

    def _root(self, code, value, lifetime=8):
        python = str(self.supervisor.PYTHON / 'bin/python3.12')
        return self._child([*DOCKER, *docker_prefix(self.directory), 'exec', '-i', '--user', '0:0', self.source_id, python, '-I', '-S', '-B', '-c', code], encode(value), lifetime)

    def _probe(self, row, targets):
        cid = row['Id']
        if cid not in self.probes and not self.stop_observers and self.quiescing_client is None:
            cached = [self.process_cache.get(p['hostPID']) for p in targets]
            if not all(c and c['host'] == p and time.monotonic() - c['at'] < 1.5 for c, p in zip(cached, targets)):
                need(self.observer_count < 256, 'observer-count')
                probe = ProcessObserver(self.native, self.config, self.directory, row, targets, cid in self.clients)
                self.probes[cid] = probe; self.children.append(probe.child); self.observer_count += 1
                self._pump_probe(cid)

    def _pump_probe(self, cid):
        # Only fixed process-observer execs are pumped here. Their small
        # READY -> deferred stdin -> result -> natural EOF handshake must not
        # wait for another global Docker inventory between each phase.
        try:
            while cid in self.probes:
                need(time.monotonic() - self.probes[cid].began < 3, 'observer-total-freshness')
                self._poll_probes()
                if cid in self.probes:
                    time.sleep(.005)
        except BaseException as error:
            if cid in self.probes:
                self._observer_failure(cid, self.probes[cid], error)
            raise

    def _observer_failure(self, cid, probe, error):
        try:
            error.nativeProcessObserverFailure = {
                'containerId': cid, 'registeredHostPID': probe.child.registeredPID,
                'observerProcess': getattr(probe, 'remote_process', None),
                'probeElapsedNs': str(max(0, int((time.monotonic() - probe.began) * 1000000000))),
                'inputWrittenBytes': probe.child.offset, 'inputTotalBytes': probe.child.input_size,
                'stdoutBytes': len(probe.child.output[0]), 'stderrBytes': len(probe.child.output[1]),
                'stdoutNaturalEOF': probe.child.eof[0], 'stderrNaturalEOF': probe.child.eof[1],
                'localExitCode': probe.child.child.poll(), 'remoteExitConfirmed': False}
        except BaseException:
            pass

    def _poll_probes(self):
        for cid, probe in list(self.probes.items()):
            try:
                result = probe.tick()
            except BaseException as error:
                self._observer_failure(cid, probe, error)
                raise
            if result is None:
                continue
            if result['gone']:
                need(cid in self.clients and self.clients[cid].get('process'), 'observer-gone-before-initial-client')
                self.clients[cid]['observerGone'] = True
            for p in result['processes']:
                before = next(v for v in probe.before if v['hostPID'] == p['hostPID'])
                self.process_cache[p['hostPID']] = {'host': before, 'value': p, 'at': result['observedAt'], 'cid': cid}
            self.observer_closes.append(result['close']); dispose_observer(probe); del self.probes[cid]

    def _proc(self, pid, uid):
        need(uid == 1000, 'observer-target-uid')
        actual = host_process(self.config, pid); cached = self.process_cache.get(pid)
        if cached is None or cached['host'] != actual or time.monotonic() - cached['at'] >= 3:
            raise ObservationPending()
        return cached['value']

    def _mounts(self, row, expected, volumes):
        binds = {m['Destination']: m for m in row['Mounts'] if m['Type'] == 'bind'}
        need(len(binds) == len(expected) and set(binds) == {str(t) for _, t, _ in expected}, 'actual-bind-closure')
        for source, target, ro in expected:
            m = binds[str(target)]
            need(m['Source'] == str(source) and m['RW'] is (not ro) and m['Propagation'] == 'rprivate', 'actual-bind-mode')
        actual = {m['Destination']: m for m in row['Mounts'] if m['Type'] == 'volume'}
        need(set(actual) == set(volumes) and len(row['Mounts']) == len(binds) + len(actual), 'actual-volume-closure')
        for target, (name, ro) in volumes.items():
            m = actual[target]; need(m['Name'] == name and m['RW'] is (not ro), 'actual-volume-mode')
            specifications = [x for x in row['HostConfig'].get('Mounts', []) if x['Type'] == 'volume' and x['Target'] == target]
            subpath = 'helmut-local-unit-diagnostic' if target == PUBLIC else 'jit-root' if target == '/ram/jit-root' else ''
            need(len(specifications) == 1 and specifications[0]['Source'] == name
                 and specifications[0].get('ReadOnly', False) is ro
                 and specifications[0].get('VolumeOptions', {}).get('Subpath', '') == subpath, 'actual-volume-subpath')

    def _container(self, row, user, network):
        h = row['HostConfig']
        need(row['Image'] == self.config['runtime']['imageId'] and row['Config']['User'] == user
             and h['CgroupParent'] == '/' + self.config['parent'] and h['CgroupnsMode'] == 'private'
             and h['NetworkMode'] == network and h['ReadonlyRootfs'] and not h['Privileged'] and not h['CapAdd']
             and h['CapDrop'] == ['ALL'] and h['SecurityOpt'] == ['no-new-privileges']
             and not h.get('GroupAdd') and not h.get('Devices') and not h.get('DeviceRequests')
             and h['PidMode'] == '' and row.get('RestartCount', 0) == 0 and h['RestartPolicy']['Name'] == 'no'
             and not row['State']['OOMKilled'], 'actual-container-sandbox')

    def _observe(self):
        group = self.native.parent_path(self.config['parent']); g = group.lstat()
        need(stat.S_ISDIR(g.st_mode) and not group.is_symlink() and (g.st_dev, g.st_ino) == (self.config['parentDevice'], self.config['parentInode']), 'actual-parent-directory')
        ids = self._docker(['ps', '--all', '--quiet', '--no-trunc']).stdout.split()
        rows = json.loads(self._docker(['inspect', *ids]).stdout) if ids else []
        owned = {r['Id']: r for r in rows if r['HostConfig']['CgroupParent'] == '/' + self.config['parent']
                 or r['HostConfig']['CgroupParent'].startswith('/' + self.config['parent'] + '/')}
        known = {x['id'] for x in self.budget['helpers'].values()} | {self.source_id} | set(self.clients) | set(self.plan['knownSetupContainerIds'])
        need(set(owned) == known, 'unknown-or-missing-owned-container')
        for helper in self.budget['helpers'].values():
            row = owned[helper['id']]; h = row['HostConfig']
            need(row['Name'] == '/' + helper['name'] and row['Image'] == self.config['runtime']['imageId']
                 and h['CgroupParent'] == '/' + self.config['parent'] and h['NetworkMode'] == 'none'
                 and h['ReadonlyRootfs'] and not h['Privileged'] and not h['CapAdd'] and h['CapDrop'] == ['ALL']
                 and not row['State']['OOMKilled'], 'actual-budget-helper-binding')
        for cid in self.plan['knownSetupContainerIds']:
            row = owned[cid]; self._container(row, '1000:1000', 'none')
            need(not row['State']['Running'] and row['State']['ExitCode'] == 0, 'actual-installer-remains-exited')
        source = owned[self.source_id]; self._container(source, '1000:1000', 'none')
        self._mounts(source, self.source_mounts, {'/ram': (self.plan['volumes']['ram'], False), '/run': (self.plan['volumes']['run'], False)})
        need(source['State']['Running'], 'source-runtime-exited')
        targets = [host_process(self.config, source['State']['Pid'])]
        handoff = self.handoff or self.pending_handoff
        if handoff:
            targets.append(self._service_host(handoff['sourceQualification']['publicSourceBinding']))
        self._probe(source, targets)
        process = self._proc(source['State']['Pid'], 1000)
        if self.source_identity:
            need(process == self.source_identity, 'source-process-drift')
        self.source_identity = process
        for cid, c in self.clients.items():
            row = owned[cid]; self._container(row, '1000:1000', 'container:' + self.source_id)
            self._mounts(row, c['mounts'], {PUBLIC: (self.plan['volumes']['run'], True), '/ram/jit-root': (self.plan['volumes']['ram'], True)})
            need(row['Config']['Env'] == c['environment'] and row['Path'] == self.config['nodePin']['path']
                 and row['Args'] == c['args'], 'actual-client-command-environment')
            if row['State']['Running']:
                exit_ready = ('ENTRY' if c['mode'] == 'entry' else 'ENDPOINT') + '_OBSERVATION_EXIT_READY.SAFE.json'
                if not (c.get('process') and exit_published(self.case / 'client' / exit_ready)):
                    self._probe(row, [host_process(self.config, row['State']['Pid'])])
                p = self._proc(row['State']['Pid'], 1000)
                need(p['exe'] == self.config['nodePin']['path'] and p['namespaces']['pid'] != process['namespaces']['pid']
                     and p['namespaces']['net'] == process['namespaces']['net']
                     and p['namespaces']['clockDomain'] == process['namespaces']['clockDomain'], 'actual-client-namespace')
                if c.get('process'):
                    need(p == c['process'], 'client-process-drift')
                c['process'] = p
            c['row'] = row
        if self.owner_ready and self.state != 'STOPPED' and (self.heartbeat is not None or self.state != 'INIT'):
            need(self.heartbeat and time.monotonic() - self.last_heartbeat <= 15, 'owner-heartbeat-stale')
        service = self._source_service(handoff['sourceQualification']['publicSourceBinding']) if handoff and self.state != 'STOPPED' else None
        return {'observedAtUTC': utc(), 'source': process, 'sourceService': service, 'sourceContainerId': self.source_id,
                'knownContainerIds': sorted(known), 'ownerObservation': self.heartbeat}

    def _service_host(self, binding):
        expected = binding['service']; supervisor = binding['supervisor']; actual = self.source_identity
        need(supervisor == {'uid': 1000, 'pid': actual['namespacePID'], 'startTicks': actual['startTicks']}
             and expected['uid'] == 1000 and expected['exePin'] == self.config['nodePin'], 'actual-source-supervisor-binding')
        node_budget(expected['nodeBudget'])
        p = expected['codePin']
        need(p in self.config['sourceCodePins'] and Path(p['path']).name == 'local-unit-original-service.js', 'actual-source-service-code')
        members = set()
        for filename in self.native.parent_path(self.config['parent']).rglob('cgroup.procs'):
            members.update(int(x) for x in filename.read_text().split())
        matches = []
        for pid in members:
            try:
                status = Path('/proc', str(pid), 'status').read_text()
                values = dict(line.split(':', 1) for line in status.splitlines())
                if values.get('Uid', '').split() != ['1000'] * 4 or not values.get('NSpid') or int(values['NSpid'].split()[-1]) != expected['pid']:
                    continue
                observed = host_process(self.config, pid)
                if observed['membership'] != actual['membership']:
                    continue
                need(observed['startTicks'] == expected['startTicks'] and observed['command'] ==
                     [self.config['nodePin']['path'], *FLAGS, p['path'], '--serve-original-writes'], 'actual-source-service-process')
                matches.append(observed)
            except (FileNotFoundError, ProcessLookupError, PermissionError):
                continue
        need(len(matches) == 1, 'source-service-host-mapping')
        return matches[0]

    def _source_service(self, binding):
        target = self._service_host(binding)
        value = self._proc(target['hostPID'], 1000)
        need(value['namespaces']['pid'] == self.source_identity['namespaces']['pid']
             and value['namespaces']['clockDomain'] == self.source_identity['namespaces']['clockDomain'], 'service-observer-namespace')
        return value

    def _owner_messages(self):
        if not self.owner:
            return
        raw = bytes(self.owner.output[0]); lines = raw.split(b'\n')
        need(len(lines[-1]) <= 16384, 'owner-line-cap')
        for line in lines[self.owner_lines:-1]:
            need(0 < len(line) <= 16384, 'owner-line')
            v = unique(line); schema = v.get('schema')
            if schema == 'helmut-local-unit-native-owner-ready/2':
                need(self.owner_ready is None and v['originalService'] == self.handoff['start']['originalService']['publicSourceBinding']
                     and v['ownerCodePin'] == self.plan['aliasPins']['owner'] and v['brokerCodePin'] == self.plan['aliasPins']['broker']
                     and v['upstreamExePin'] == self.plan['aliasPins']['postgrest'] and v['nodeExePin'] == self.config['nodePin'], 'owner-ready-binding')
                node_budget(v['nodeBudget']); self.owner_ready = v
            elif schema == 'helmut-local-unit-native-owner-observation/1':
                need(self.owner_ready and v['operationId'] == self.selection['operationId'] and v['commandHash'] == self.selection['commandHash'], 'owner-observation-scope')
                for key in ('owner', 'upstream'):
                    p = v[key]
                    need(p['uids'] == p['gids'] == [0, 0, 0, 0] and p['capabilitiesZero'] is True and p['noNewPrivileges'] is True
                         and p['pidNamespace'] == self.source_identity['namespaces']['pid'] and p['membership'] == '0::/\n', 'actual-root-owner-observation')
                need(v['owner']['pid'] == self.owner_ready['ownerPID'] and v['owner']['startTicks'] == self.owner_ready['ownerStartTicks']
                     and v['upstream']['pid'] == self.owner_ready['upstreamPID'] and v['upstream']['startTicks'] == self.owner_ready['upstreamStartTicks']
                     and v['owner']['exe'] == self.config['nodePin']['path'] and v['upstream']['exe'] == '/opt/postgrest-pinned'
                     and v['upstream']['parentPID'] == v['owner']['pid']
                     and v['actualNodeBudget'] == self.owner_ready['nodeBudget']
                     and v['pins'] == {'owner': self.plan['aliasPins']['owner']['sha256'], 'broker': self.plan['aliasPins']['broker']['sha256'],
                                      'node': self.config['nodePin']['sha256'], 'upstreamExe': self.plan['aliasPins']['postgrest']['sha256'],
                                      'upstreamConfig': self.owner_ready['upstreamConfigPin']['sha256']}
                     and v['measuredCgroup'] == {'path': '/owned-group', 'device': self.config['parentDevice'], 'inode': self.config['parentInode']}
                     and v['brokerListenerObserved'] is True and abs(time.time() - instant(v['observedAtUTC'])) <= 3, 'owner-observation-binding')
                node_budget(v['actualNodeBudget']); self.heartbeat = v; self.last_heartbeat = time.monotonic()
            elif schema == 'helmut-local-unit-native-owner-stop/1':
                need(not hasattr(self, 'owner_stop'), 'duplicate-owner-stop'); self.owner_stop = v
            else:
                need(False, 'unexpected-owner-frame')
            self.owner_lines += 1

    def _handoff(self, h):
        need(type(h) is dict and set(h) == {'start', 'sourceQualification', 'hmacKeyHex', 'readQualifications', 'immutableClientPins', 'publicationPolicy'}, 'private-handoff-shape')
        s, q = h['start'], h['sourceQualification']
        need(s['operationId'] == q['operationId'] == self.selection['operationId'] and s['commandHash'] == q['commandHash'] == self.selection['commandHash']
             and s['database'] == q['database'] == 'helmut_unit_diagnostic_' + self.config['nonce'], 'handoff-scope')
        binding = s['originalService']['publicSourceBinding']
        need(binding == q['publicSourceBinding'] and binding['containerId'] == self.source_id
             and binding['pidNamespace'] == self.source_identity['namespaces']['pid'], 'actual-source-binding')
        need(type(h['hmacKeyHex']) is str and HASH.fullmatch(h['hmacKeyHex']) and sha(bytes.fromhex(h['hmacKeyHex'])) == binding['hmacKeySHA256'], 'hmac-binding')
        need(s['pins'] == {**self.plan['aliasPins'], 'node': self.config['nodePin']}
             and s['measuredCgroup'] == {'path': '/owned-group', 'device': self.config['parentDevice'], 'inode': self.config['parentInode'], 'procMembership': '0::/\n'}, 'owner-native-pins')
        source_pin = s['originalService']['sourceQualificationPin']
        need(source_pin == {'path': '/run/bootstrap/SOURCE_QUALIFICATION.PRIVATE.json', 'bytes': len(encode(q)), 'sha256': sha(encode(q))}, 'qualification-byte-pin')
        need(type(h['readQualifications']) is list and len(h['readQualifications']) == 6, 'six-read-closure-files')
        files = {}
        for r in h['readQualifications']:
            need(set(r) == {'path', 'text'} and re.fullmatch('/run/bootstrap/READ_[A-Z0-9_]+[.]PRIVATE[.]json', r['path'])
                 and r['path'] not in files and type(r['text']) is str and len(r['text'].encode()) <= 16384, 'read-qualification-file')
            unique(r['text']); files[r['path']] = r['text']
        need(len(s['legacy']['rpcs']) == 2 and {r['name'] for r in s['legacy']['rpcs']} == {'helmut_auth_state_graph_read_v1', 'helmut_auth_usage_read_v1'}, 'two-http-readers')
        for r in s['legacy']['rpcs']:
            p = r['qualificationPin']; need(p['path'] in files and p == {'path': p['path'], 'bytes': len(files[p['path']].encode()), 'sha256': sha(files[p['path']])}, 'read-qualification-pin')
        policy = h['publicationPolicy']; need(type(policy) is str and len(policy.encode()) == 493 and sha(policy) == POLICY_SHA, 'original-policy-field')
        self._client_files(h['immutableClientPins']); self.pending_handoff = h

    def _advance_owner_start(self):
        if self.owner is not None:
            return
        need(self.pending_handoff is not None, 'owner-private-pending-handoff')
        h = self.pending_handoff
        try:
            self._source_service(h['sourceQualification']['publicSourceBinding'])
        except ObservationPending:
            return
        env = {**ENV, 'HOME': '/run/bootstrap', 'TMPDIR': '/run/bootstrap', 'HELMUT_NATIVE_NODE_OLD_SPACE_MIB': '384'}
        payload = {k: h[k] for k in ('start', 'sourceQualification', 'hmacKeyHex', 'readQualifications')}; payload['ownerEnvironment'] = env
        need(len(encode(payload)) <= CAP, 'owner-private-input-cap')
        self.owner = self._root(BOOTSTRAP, payload, lifetime=180)
        self.handoff = h; self.pending_handoff = None

    def _client_files(self, rows):
        need(type(rows) is list and 10 <= len(rows) <= 128, 'client-file-closure')
        found = set(); mounts = []
        terminal = str(Path(self.config['repository']) / 'docs/betrieb/belege/next-local-full500-20261021/V12_ACTUAL_TERMINAL.SAFE.json')
        originals = {**ORIGINALS, terminal: (3336, '1781a7b1b7acd5dc15368865eb2c262fb9ca058f4cd3a89dfd8f6a0108f88a8b')}
        for r in rows:
            need(set(r) == {'logical', 'physical'}, 'client-file-pair'); a, b = r['logical'], r['physical']; pin_shape(a); pin_shape(b)
            need((a['bytes'], a['sha256']) == (b['bytes'], b['sha256']) and a['path'] not in found, 'client-file-pin-binding')
            target, source = Path(a['path']), Path(b['path'])
            if a['path'] in originals:
                need(a == b and (a['bytes'], a['sha256']) == originals[a['path']], 'original-client-pin')
                p = canonical(a['path']); fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                try:
                    s = os.fstat(fd)
                    need(stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and s.st_size == a['bytes']
                         and identity(s) == identity(p.lstat()), 'original-client-file-metadata')
                finally:
                    os.close(fd)
            else:
                need(target.parent == BASE / self.config['nonce'] and source == self.case / 'client' / target.name
                     and target.name in CLIENT_INPUT_NAMES, 'client-file-target')
            # Source has already streamed original RAW. It is not hashed a second
            # time here; all new smaller private artifacts get a fresh stable FD.
            if a['path'] not in originals:
                _, actual = read_file(source, 36 * 1024**2)
                need(actual == b, 'client-current-file-pin')
            found.add(a['path']); mounts.append((str(source), str(target), True))
        required = {str(BASE / self.config['nonce'] / n) for n in CLIENT_INPUT_NAMES}
        need(set(originals) | required <= found, 'required-originals-and-inputs')
        self.client_pins, self.client_immutable_mounts = rows, mounts

    def _client(self, mode):
        code = 'local-unit-native-endpoint-qualification.js' if mode == 'qualifier' else 'local-unit-native-run.js'
        script = str(Path(self.config['repository']) / 'scripts/helmut-resource-meter' / code)
        need(any(p['path'] == script for p in self.config['sourceCodePins']), 'client-entry-code-pin')
        environment = {**ENV, 'HOME': '/tmp', 'TMPDIR': '/tmp', 'HELMUT_STORAGE_BACKEND': 'supabase', 'SUPABASE_URL': 'http://127.0.0.1:3000',
                       'HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE': 'helmut_unit_diagnostic_' + self.config['nonce'], 'HELMUT_NATIVE_NODE_OLD_SPACE_MIB': '384'}
        if mode == 'entry':
            environment.update(HELMUT_PUBLICATION_ELIGIBILITY_JSON=self.handoff['publicationPolicy'], HELMUT_LLM_USAGE_STORAGE='relational-atomic-v1',
                               HELMUT_AUTH_STATE_STORAGE='merkle-auth-v1', HELMUT_AUTH_HISTORY_READ_REUSE='verified-history-reuse-v1',
                               HELMUT_AUTH_GRAPH_READ_REUSE='off', HELMUT_AUTH_SINGLE_WRITE_CAPTURE='off', HELMUT_AUTH_CONTROL_READ='verified-control-view-v1',
                               HELMUT_LOCAL_PIPELINE_LOCK_MODE='invocation-lease-v1')
        names = {Path(p['physical']['path']).name for p in self.client_pins if Path(p['physical']['path']).parent == self.case / 'client'}
        names |= {'ENDPOINT_QUALIFICATION_CONFIG.PRIVATE.json'}
        if mode == 'entry':
            names |= {'ENDPOINT_QUALIFICATION.SAFE.json', 'ENDPOINT_OBSERVATION_GATE.SAFE.json',
                      'ENDPOINT_OBSERVATION_EXIT_READY.SAFE.json', 'ENDPOINT_OBSERVATION_EXIT_RELEASE.SAFE.json'}
        folder = self.case / 'client'; canonical(folder)
        marker_name = 'ENDPOINT_OBSERVATION_EXIT_READY.SAFE.json.PUBLISHED'
        need(all((p.name in names and stat.S_ISREG(p.lstat().st_mode) and p.lstat().st_nlink == 1)
                 or (mode == 'entry' and p.name == marker_name and exit_published(folder / marker_name.removesuffix('.PUBLISHED')))
                 for p in folder.iterdir()), 'unqualified-client-directory-content')
        extra = []
        if mode == 'qualifier':
            extra.append((str(folder / 'ENDPOINT_QUALIFICATION_CONFIG.PRIVATE.json'), str(BASE / self.config['nonce'] / 'ENDPOINT_QUALIFICATION_CONFIG.PRIVATE.json'), True))
        mounts = [(str(self.case / 'client'), str(BASE / self.config['nonce']), False),
                  (self.config['repository'], self.config['repository'], True), self.plan['nodeMount'],
                  (str(self.native.parent_path(self.config['parent'])), '/owned-group', True),
                  *self.plan['clientRuntimeMounts'], *self.plan['clientPublicSourceMounts'], self.plan['pythonMount'],
                  next(x for x in self.plan['sourceAliasMounts'] if x[1] == '/opt/postgrest-pinned'),
                  *self.client_immutable_mounts, *extra]
        need(len({t for _, t, _ in mounts}) == len(mounts), 'client-mount-duplicate')
        args = [*FLAGS, script, '--selector', str(BASE / self.config['nonce'] / 'SELECTION.SAFE.json')]
        argv = ['create', '--interactive', '--name', 'helmut-unitdiag-' + mode + '-' + self.config['nonce'], '--network', 'container:' + self.source_id,
                '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '1000:1000',
                '--cgroup-parent=/' + self.config['parent'], '--cgroupns', 'private', '--log-driver', 'none', '--shm-size', str(16 * 1024**2),
                '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=2097152,uid=1000,gid=1000,mode=0700', '--entrypoint', self.config['nodePin']['path']]
        for source, target, ro in mounts:
            argv += ['--mount', 'type=bind,src=' + str(source) + ',dst=' + str(target) + (',readonly' if ro else '')]
        argv += ['--mount', 'type=volume,src=' + self.plan['volumes']['run'] + ',dst=' + PUBLIC + ',volume-subpath=helmut-local-unit-diagnostic,readonly',
                 '--mount', 'type=volume,src=' + self.plan['volumes']['ram'] + ',dst=/ram/jit-root,volume-subpath=jit-root,readonly']
        # The image can carry no hidden credentials/flags. Docker env overrides
        # are exact below and the inspected resulting array is checked live.
        image = json.loads(self._docker(['image', 'inspect', self.config['runtime']['imageId']]).stdout)[0]
        need(not image['Config'].get('Env'), 'image-inherited-environment')
        env_list = ['HOSTNAME', *[k + '=' + v for k, v in environment.items()]]
        for value in env_list:
            argv += ['--env', value]
        argv += [self.config['runtime']['imageId'], *args]
        cid = self._docker(argv, timeout=8).stdout.strip(); need(HASH.fullmatch(cid) and cid not in self.clients, 'new-client-id')
        self.clients[cid] = {'mode': mode, 'mounts': mounts, 'environment': env_list, 'args': args}
        child = self._child([*DOCKER, *docker_prefix(self.directory), 'start', '--attach', '--interactive', cid],
                            lifetime=35 if mode == 'qualifier' else 90, deferred=True)
        self.clients[cid]['child'] = child; self.active_client = cid

    def _reply(self, result):
        p = self.pending; now = datetime.datetime.now(datetime.timezone.utc)
        value = {'schema': 'helmut-local-unit-native-host-reply/1', 'seq': p['request']['seq'], 'stage': p['request']['stage'],
                 'nonce': p['request']['nonce'], 'selection': self.selection, 'requestSHA256': p['sha256'],
                 'issuedAtUTC': now.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                 'expiresAtUTC': (now + datetime.timedelta(seconds=3)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'), 'result': result}
        publish_once(self.case / ('HOST_REPLY_%02d.PRIVATE.json' % self.seq), encode(value))
        self.seq += 1; self.pending = None

    def _release_clients(self):
        for cid, client in self.clients.items():
            if client.get('gateReleased') or not client.get('process') or cid in self.probes:
                continue
            try:
                process = self._proc(client['process']['hostPID'], 1000)
            except ObservationPending:
                continue
            need(process == client['process'] and process['namespacePID'] == 1, 'gate-current-client-process')
            now = datetime.datetime.now(datetime.timezone.utc)
            nonce = secrets.token_hex(32)
            selection = {k: self.selection[k] for k in ('operationId', 'commandHash')}
            frame = {'schema': 'helmut-local-unit-native-observation-gate/1', 'selection': selection,
                     'process': {'pid': process['namespacePID'], 'startTicks': process['startTicks']},
                     'issuedAtUTC': now.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                     'expiresAtUTC': (now + datetime.timedelta(seconds=3)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                     'nonce': nonce}
            raw = encode(frame) + b'\n'; need(len(raw) <= 4096, 'gate-frame-cap')
            client['child'].supply(raw)
            client['gateReleased'] = {'nonceSHA256': sha(nonce), 'frameSHA256': sha(raw), 'byteCount': len(raw)}

    def _quiesce_clients(self):
        for cid, client in self.clients.items():
            if not client.get('gateReleased') or client.get('exitReleased'):
                continue
            stem = ('ENTRY' if client['mode'] == 'entry' else 'ENDPOINT') + '_OBSERVATION_EXIT_'
            path = self.case / 'client' / (stem + 'READY.SAFE.json')
            if not exit_published(path):
                continue
            if not client.get('exitReady'):
                raw, pin = read_file(path, 4096); ready = unique(raw)
                need(raw == encode(ready) + b'\n' and set(ready) == {'schema', 'selection', 'process', 'issuedAtUTC', 'expiresAtUTC', 'nonce'}
                     and ready['schema'] == 'helmut-local-unit-native-observation-exit-ready/1'
                     and ready['selection'] == self.selection and type(ready['nonce']) is str and HASH.fullmatch(ready['nonce'])
                     and ready['process'] == {'pid': client['process']['namespacePID'], 'startTicks': client['process']['startTicks']}, 'client-exit-ready')
                a, b = instant(ready['issuedAtUTC']), instant(ready['expiresAtUTC'])
                need(a <= time.time() < b and 0 < b - a <= 8.000001, 'client-exit-ready-window')
                client['exitReady'] = ready; client['exitReadyPin'] = pin
                self.quiescing_client = cid
            ready = client['exitReady']
            need(time.time() < instant(ready['expiresAtUTC']), 'client-exit-quiescence-deadline')
            if self.probes:
                continue
            before = self.process_cache[client['process']['hostPID']]['host']
            need(host_process(self.config, before['hostPID']) == before, 'client-exit-live-binding')
            now = datetime.datetime.now(datetime.timezone.utc)
            selection = {k: self.selection[k] for k in ('operationId', 'commandHash')}
            release = {'schema': 'helmut-local-unit-native-observation-exit-release/1', 'selection': selection,
                       'process': ready['process'], 'issuedAtUTC': now.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                       'expiresAtUTC': (now + datetime.timedelta(seconds=3)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                       'readyNonceSHA256': sha(ready['nonce']), 'nonce': secrets.token_hex(32)}
            client['exitReleased'] = publish_once(self.case / 'client' / (stem + 'RELEASE.SAFE.json'), encode(release) + b'\n') or True
            self.quiescing_client = None

    def _accept(self, request, digest):
        need(self.pending is None, 'request-already-pending')
        need(set(request) == {'schema', 'seq', 'stage', 'nonce', 'selection', 'issuedAtUTC', 'expiresAtUTC', 'body'}
             and request['schema'] == 'helmut-local-unit-native-host-request/1' and type(request['seq']) is int and request['seq'] == self.seq
             and type(request['nonce']) is str and HASH.fullmatch(request['nonce']) and request['nonce'] not in self.seen, 'private-request-envelope')
        window(request); s = request['selection']
        need(type(s) is dict and set(s) == {'operationId', 'commandHash'} and s['operationId'] == 'localUnitDiagnostic-' + self.config['nonce']
             and type(s['commandHash']) is str and HASH.fullmatch(s['commandHash']) and (self.selection is None or s == self.selection), 'request-selection')
        self.selection = s; self.seen.add(request['nonce']); stage, body = request['stage'], request['body']
        self.pending = {'request': request, 'sha256': digest, 'began': time.monotonic()}
        if stage == 'OWNER_START':
            need(self.state == 'INIT' and set(body) == {'handoff'}, 'owner-start-order')
            self._handoff(body['handoff'])
        elif stage == 'CLIENT_QUALIFY':
            need(self.state == 'OWNER' and set(body) == {'configuration'}, 'client-qualify-order')
            q = body['configuration']; need(q['selection'] == self.selection and q['publicSourceBinding'] == self.handoff['sourceQualification']['publicSourceBinding'], 'qualifier-config-scope')
            write_once(self.case / 'client/ENDPOINT_QUALIFICATION_CONFIG.PRIVATE.json', encode(q)); self._client('qualifier')
        elif stage == 'HOST_OBSERVE':
            need(self.state in ('QUALIFIED', 'ENTRY', 'DONE') and body == {}, 'observation-order')
            self.observed_at = 0
        elif stage == 'ENTRY_START':
            need(self.state == 'QUALIFIED' and body == {} and time.monotonic() - self.observed_at < 3, 'entry-start-order-or-fresh-observation')
            self._client('entry'); self.state = 'ENTRY'
        elif stage == 'ENTRY_RESULT':
            need(self.state == 'ENTRY' and body == {}, 'entry-result-order')
        elif stage == 'OWNER_STOP':
            need(self.state == 'DONE' and body == {}, 'owner-stop-order')
            owner = self.heartbeat['owner']; self.signal = self._root(ROOT_SIGNAL, {k: owner[k] for k in ('pid', 'startTicks', 'exe', 'pidNamespace')})
        else:
            need(False, 'unknown-stage')

    def _client_result(self):
        c = self.clients[self.active_client]; child = c['child']
        if not child.tick():
            return None
        if self.active_client in self.probes:
            return None
        close = child.close_metadata(); row = c['row']
        if row['State']['Running']:
            return None
        need(close['exitCode'] == 0 and c.get('process') and c.get('exitReleased') and row['State']['ExitCode'] == 0
             and not row['State']['OOMKilled'], 'actual-client-success-close')
        close.update(actualClientPID=c['process']['hostPID'], actualClientStartTicks=c['process']['startTicks'],
                     actualClientNamespacePID=c['process']['namespacePID'], clientContainerId=self.active_client, process=c['process'])
        return close

    def _private_pipe_captures(self, error=None, after_close=False):
        """Bounded failure bytes stay in dedicated PRIVATE files, never replies."""
        captures, candidates = [], []
        attached = getattr(error, 'nativePipePrivateCapture', None)
        if attached is not None:
            candidates.append((None, attached))
        for index, child in enumerate(self.children):
            if (getattr(child, 'transport_failure', None) is not None or child is self.owner) and hasattr(child, 'failure_snapshot'):
                candidates.append((index, child))
        for ordinal, (index, value) in enumerate(candidates):
            try:
                snapshot = value if index is None else value.failure_snapshot(drain=not after_close)
                raw = encode(snapshot)
                need(len(raw) <= 600 * 1024, 'private-pipe-capture-cap')
                suffix = '_CLOSE_' if after_close else '_'
                path = self.case / ('EXECUTION_HOST_CHILD_FAILURE' + suffix + '%03d.PRIVATE.json' % ordinal)
                publish_once(path, raw)
                pin = {'path': str(path), 'bytes': len(raw), 'sha256': sha(raw)}
                captures.append({'childIndex': index, 'pin': pin})
            except BaseException as capture_error:
                # No capture failure replaces the original transport outcome.
                captures.append({'childIndex': index, 'captureError': {'type': type(capture_error).__name__[:128],
                                                                     'errno': getattr(capture_error, 'errno', None)}})
        return captures

    def tick(self):
        need(not self.closed and self.failure is None, 'sealed-host')
        try:
            if self.state == 'STOPPED':
                need(self.pending is None and self.last_observation is not None, 'stopped-host-outcome')
                for child in self.children:
                    need(child.tick() and child.close_metadata()['exitCode'] == 0, 'stopped-host-child-close')
                # SOURCE now owns its final snapshot and service/PG closure.
                # This cached observation is deliberately not redated/fresh.
                return {'state': self.state, 'pending': None, 'observation': self.last_observation}
            need(time.monotonic() - self.started_at < 240, 'whole-lifetime')
            for c in self.children:
                c.tick()
            self._poll_probes(); self._owner_messages()
            try:
                observation = self._observe(); self.last_observation = observation
            except ObservationPending:
                observation = None
            self._release_clients(); self._quiesce_clients()
            if self.owner and self.state != 'STOPPED' and self.owner.child.poll() is not None and not (self.pending and self.pending['request']['stage'] == 'OWNER_STOP'):
                need(False, 'unexpected-owner-exit')
            if self.pending:
                stage = self.pending['request']['stage']
                need(time.monotonic() - self.pending['began'] < {'OWNER_START': 18, 'CLIENT_QUALIFY': 35, 'ENTRY_RESULT': 90, 'OWNER_STOP': 12}.get(stage, 5), 'stage-deadline')
                if stage == 'OWNER_START' and observation is not None:
                    self._advance_owner_start()
                if stage == 'HOST_OBSERVE' and observation is not None:
                    self.observed_at = time.monotonic(); self._reply(observation)
                elif stage == 'OWNER_START' and self.owner_ready and self.heartbeat and observation is not None:
                    self.state = 'OWNER'; self._reply({'ready': self.owner_ready, 'observation': observation})
                elif stage == 'ENTRY_START' and self.clients[self.active_client].get('gateReleased') and observation is not None:
                    self._reply({'containerId': self.active_client, 'startedAtUTC': utc()})
                elif stage in ('CLIENT_QUALIFY', 'ENTRY_RESULT'):
                    close = self._client_result()
                    if close:
                        if stage == 'CLIENT_QUALIFY':
                            raw, report_pin = read_file(self.case / 'client/ENDPOINT_QUALIFICATION.SAFE.json', 1024 * 1024)
                            report = unique(raw); node_budget(report['actualNodeBudget'])
                            need(report['selection'] == self.selection and report['signedReadonlyContractObserved'] is True
                                                      and report['seedPerformed'] is False and report['scopeClaimConsumed'] is False, 'actual-qualifier-report')
                            self.qualifier_report = report
                            self.state = 'QUALIFIED'; self._reply({'processClose': close, 'reportPin': report_pin, 'report': report})
                        else:
                            raw, p = read_file(self.case / 'client/ATTEMPT_TERMINAL.SAFE.json', 1024 * 1024)
                            terminal = unique(raw); need(terminal['selection'] == self.selection and terminal['status'] == 'closed', 'actual-entry-terminal')
                            process = terminal['process']; actual = self.clients[self.active_client]['process']
                            need(process['pid'] == actual['namespacePID'] and process['startTicks'] == actual['startTicks']
                                 and process['pidNamespace'] == actual['namespaces']['pid'] and process['nspid'][-1] == actual['namespacePID'], 'entry-host-pid-mapping')
                            entry_close = {'schema': 'helmut-local-unit-native-entry-process-close/1', 'selection': self.selection, 'process': process,
                                           'exitCode': 0, 'signal': None, 'stdoutEOF': close['stdoutNaturalEOF'], 'stderrEOF': close['stderrNaturalEOF'],
                                           'terminalCanonicalSHA256': sha(json.dumps(terminal, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)), 'observedAtUTC': utc()}
                            self.state = 'DONE'; self._reply({'processClose': close, 'actualEntryProcessClose': entry_close, 'terminalPin': p, 'terminal': terminal})
                elif stage == 'OWNER_STOP':
                    if self.signal.tick():
                        need(self.signal.close_metadata()['exitCode'] == 0, 'owner-signal-close')
                        if self.owner.tick():
                            self._owner_messages()
                            need(self.owner.close_metadata()['exitCode'] == 0 and hasattr(self, 'owner_stop')
                                 and self.owner_stop['cleanShutdown'] is True and self.owner_stop['failed'] is False, 'actual-owner-clean-close')
                            if not hasattr(self, 'trace_read'):
                                self.trace_read = self._root(ROOT_READ, {'path': TRACE})
                            elif self.trace_read.tick():
                                need(self.trace_read.close_metadata()['exitCode'] == 0, 'root-trace-reader-close')
                                trace = unique(bytes(self.trace_read.output[0])); header = trace['value']['header']
                                need(header['operationId'] == self.selection['operationId'] and header['commandHash'] == self.selection['commandHash']
                                     and header['ownerPID'] == self.owner_ready['ownerPID'] and header['ownerStartTicks'] == self.owner_ready['ownerStartTicks']
                                     and header['pidNamespace'] == self.source_identity['namespaces']['pid'] and header['timeNamespace'] == self.source_identity['namespaces']['time']
                                     and header['clockDomain'] == self.source_identity['namespaces']['clockDomain']
                                     and header['brokerCodeSHA256'] == self.plan['aliasPins']['broker']['sha256']
                                     and header['trustSHA256'] == self.qualifier_report['rootTrustSHA256']
                                     and header['sourceBindingSHA256'] == self.qualifier_report['publicSourceBindingCanonicalSHA256']
                                     and header['database'] == 'helmut_unit_diagnostic_' + self.config['nonce']
                                     and trace['value']['footer']['complete'] is True, 'actual-root-trace-binding')
                                self.stop_observers = True
                                if self.probes:
                                    return {'state': self.state, 'pending': stage, 'observation': observation}
                                self.state = 'STOPPED'; self._reply({'ownerStop': self.owner_stop, 'ownerProcessClose': self.owner.close_metadata(), 'controlReadTrace': trace})
            if not self.pending and self.state != 'STOPPED' and observation is not None:
                need(self.seq <= 128, 'request-count')
                p = self.case / ('HOST_REQUEST_%02d.PRIVATE.json' % self.seq)
                if p.exists():
                    raw, pin = read_file(p); self._accept(unique(raw), pin['sha256'])
            return {'state': self.state, 'pending': None if not self.pending else self.pending['request']['stage'], 'observation': observation}
        except BaseException as error:
            self.failure = 'sealed-native-host-failure'
            try:
                # PRIVATE diagnostics preserve the cause, never enter a SAFE
                # reply/receipt or reopen an unknown workload for another try.
                private_captures = self._private_pipe_captures(error)
                publish_once(self.case / 'EXECUTION_HOST_FAILURE.PRIVATE.json', encode({
                    'schema': 'helmut-local-unit-native-execution-host-failure/1', 'observedAtUTC': utc(),
                    'selection': self.selection, 'state': self.state,
                    'stage': None if self.pending is None else self.pending['request']['stage'],
                    'exception': {'type': type(error).__name__[:128], 'message': str(error)[:4096]},
                    'pipeChildFailure': getattr(error, 'nativePipeFailure', None),
                    'privateChildCaptures': private_captures,
                    'processObserverFailure': getattr(error, 'nativeProcessObserverFailure', None)}))
            except BaseException:
                self.failure = 'sealed-native-host-failure-without-private-diagnostic'
            raise RuntimeError('native-execution-host-sealed-failure') from None

    def close(self):
        """Bounded cleanup only of this handle's clients/Owner, never Source PG."""
        if self.closed:
            return self.close_result
        clean = self.failure is None and self.state == 'STOPPED'
        # No successful response/trace is manufactured by best-effort teardown.
        for cid, c in self.clients.items():
            try:
                row = json.loads(self._docker(['inspect', cid]).stdout)[0]
                if row['State']['Running']:
                    clean = False; self._docker(['stop', '--time', '2', cid], timeout=4)
            except BaseException:
                clean = False
        if self.owner and self.owner.child.poll() is None:
            clean = False
            if self.heartbeat or self.owner_ready:
                try:
                    p = self.heartbeat['owner'] if self.heartbeat else {'pid': self.owner_ready['ownerPID'], 'startTicks': self.owner_ready['ownerStartTicks'],
                        'exe': self.config['nodePin']['path'], 'pidNamespace': self.source_identity['namespaces']['pid']}
                    self._root(ROOT_SIGNAL, {k: p[k] for k in ('pid', 'startTicks', 'exe', 'pidNamespace')}, lifetime=5)
                except BaseException:
                    pass
        until = time.monotonic() + 6
        while time.monotonic() < until:
            done = True
            for c in self.children:
                try:
                    if getattr(c, 'transport_failure', None) is not None:
                        # Drain only; failed stdin is never supplied again.
                        c.failure_snapshot(); clean = False
                        done = c.child.poll() is not None and all(c.eof) and done
                    else:
                        done = c.tick() and done
                except BaseException:
                    clean = False; done = False
            if done:
                break
            time.sleep(.01)
        metadata = []
        for c in self.children:
            try:
                metadata.append(c.close_metadata())
            except BaseException:
                clean = False
                # A killed Docker CLI is never evidence that its remote child
                # stopped; the Supervisor must close Source after a failed host.
                if c.child.poll() is None:
                    c.child.kill()
                    try:
                        c.child.wait(timeout=1)
                    except BaseException:
                        pass
            finally:
                if getattr(c, 'transport_failure', None) is not None:
                    try:
                        c.failure_snapshot()
                    except BaseException:
                        clean = False
                c.selector.close()
                for stream in (c.child.stdin, c.child.stdout, c.child.stderr):
                    if stream and not stream.closed:
                        stream.close()
        if self.failure is not None:
            # Completion captures preserve later real exit/EOF observations;
            # they are never added to the SAFE close DTO below.
            self._private_pipe_captures(after_close=True)
        self.closed = True; self.close_result = {'state': self.state, 'clean': clean, 'children': metadata,
                                               'knownClientContainerIds': sorted(self.clients), 'sourceStopRequested': False,
                                               'processObserverChildren': self.observer_closes,
                                               'unknownProcessObservers': [
                                                   {'containerId': cid, 'observerProcess': getattr(p, 'remote_process', None),
                                                    'registeredHostPID': p.child.registeredPID, 'remoteExitConfirmed': False}
                                                   for cid, p in self.probes.items()]}
        return self.close_result
