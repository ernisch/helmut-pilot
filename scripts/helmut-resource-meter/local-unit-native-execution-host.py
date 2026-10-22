"""Private bounded execution transport for the fresh local Source supervisor.

Importing this module starts nothing. The caller owns authorization, seed,
runtime updater and final native snapshot; none is inferred from a JSON flag.
Docker exec credentials and Root bootstrap material travel on stdin only.
"""
import datetime
import ctypes
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

DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
ENV = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC'}
FLAGS = ['--max-old-space-size=384', '--max-semi-space-size=16']
TRACE = '/run/bootstrap/CONTROL_READ_TRACE.SAFE.jsonl'
PUBLIC = '/run/helmut-local-unit-diagnostic'
BASE = Path('/workspace/helmut-unit-diagnostic-native')
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


def prepare_execution(native, supervisor, config, case):
    """AFTER native.start, before Source: measured aliases and two owned volumes.

    Add sourceVolumeMounts/sourceAliasMounts/nodeMount to the Source create args;
    replace the former /ram tmpfs and whole Node-directory bind, never stack them.
    The caller must clean plan.volumes after every known container has exited.
    """
    nonce, case = config['nonce'], canonical(case)
    host_user()
    need(re.fullmatch('[a-f0-9]{32}', nonce) and case == BASE / nonce, 'fresh-case')
    e = config['executionHost']
    need(set(e) == {'postgrestPin', 'clientRuntimePins'}, 'preparation-config')
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
    node = config['nodePin']; pin_shape(node)
    allowed = {(r['source']['path'], r['imagePath']): r for r in config['runtimeBindings']}
    runtime_mounts = []
    for r in e['clientRuntimePins']:
        need(r == allowed.get((r['source']['path'], r['imagePath'])) and r['readonly'] is True, 'runtime-closure')
        pin_shape(r['source'])
        target = r['imagePath']
        need(target.startswith(('/usr/', '/lib/', '/lib64/', '/bin/', '/sbin/')) and not any(x in target for x in (',', '\0', '..')), 'public-runtime-target')
        runtime_mounts.append((r['source']['path'], target, True))
    setup = _install_aliases(native, supervisor, config, alias_dir, public, group)
    volumes = {'ram': 'helmut-unitdiag-ram-' + nonce, 'run': 'helmut-unitdiag-run-' + nonce}
    for key, size, uid, mode in [('ram', 268435456, 1000, '0711'), ('run', 16777216, 0, '0755')]:
        name = volumes[key]
        need(native.docker(['volume', 'inspect', name], timeout=3, check=False).returncode != 0, 'volume-already-exists')
        opts = 'rw,exec,nosuid,nodev,size=' + str(size) + ',uid=' + str(uid) + ',gid=' + str(uid) + ',mode=' + mode
        result = native.docker(['volume', 'create', '--driver', 'local', '--opt', 'type=tmpfs', '--opt', 'device=tmpfs', '--opt', 'o=' + opts, name], timeout=5)
        need(result.stdout.strip() == name, 'volume-create-outcome')
        row = json.loads(native.docker(['volume', 'inspect', name], timeout=3).stdout)[0]
        need(row['Name'] == name and row['Driver'] == 'local' and row['Options'] == {'type': 'tmpfs', 'device': 'tmpfs', 'o': opts}, 'volume-native-options')
    return {'schema': 'helmut-local-unit-native-execution-plan/1', 'nonce': nonce, 'volumes': volumes, 'aliasPins': aliases,
            'sourceVolumeMounts': ['type=volume,src=' + volumes['ram'] + ',dst=/ram', 'type=volume,src=' + volumes['run'] + ',dst=/run'],
            'sourceAliasMounts': mounts, 'nodeMount': (node['path'], node['path'], True), 'clientRuntimeMounts': runtime_mounts,
            'knownSetupContainerIds': [setup['containerId']], 'installerProcessClose': setup}


class _PipeChild:
    """Real Popen handle: natural EOF and exit are independent observations."""
    def __init__(self, argv, data=None, lifetime=20, deferred=False):
        self.child = subprocess.Popen(argv, env=ENV, stdin=subprocess.PIPE if data is not None or deferred else subprocess.DEVNULL,
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=True)
        self.selector = selectors.DefaultSelector(); self.output = [bytearray(), bytearray()]
        self.eof = [False, False]; self.input = memoryview(data or b''); self.input_size = len(self.input); self.offset = 0
        self.deadline = time.monotonic() + lifetime; self.finished = False; self.deferred = deferred
        for i, stream in enumerate((self.child.stdout, self.child.stderr)):
            os.set_blocking(stream.fileno(), False); self.selector.register(stream, selectors.EVENT_READ, i)
        if self.child.stdin and not deferred:
            os.set_blocking(self.child.stdin.fileno(), False); self.selector.register(self.child.stdin, selectors.EVENT_WRITE, 2)
        self.registeredPID = self.child.pid

    def supply(self, data):
        need(self.deferred and self.child.stdin and not self.child.stdin.closed and self.offset == 0, 'single-deferred-input')
        self.input = memoryview(data); self.input_size = len(data); self.deferred = False
        os.set_blocking(self.child.stdin.fileno(), False); self.selector.register(self.child.stdin, selectors.EVENT_WRITE, 2)

    def tick(self):
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
                    need(len(self.output[key.data]) + len(raw) <= (CAP if key.data == 0 else 128 * 1024), 'child-stream-cap')
                    self.output[key.data].extend(raw)
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
v=json.loads(sys.stdin.buffer.read(16385));assert set(v)=={'files','group'} and len(v['files'])==3
g=os.stat('/owned-group');assert (g.st_dev,g.st_ino)==(v['group']['device'],v['group']['inode'])
meta=lambda s:tuple(getattr(s,k) for k in ('st_dev','st_ino','st_mode','st_uid','st_gid','st_nlink','st_size','st_mtime_ns','st_ctime_ns'))
out=[]
for row in v['files']:
 src=row['source'];target=row['target'];assert target in ('/output/owner','/output/broker','/output/postgrest')
 assert row['mode']==(0o555 if target.endswith('/postgrest') else 0o444) and os.path.realpath(src['path'])==src['path']
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


def _install_aliases(native, supervisor, config, alias_dir, public, group):
    """The host handles bounded metadata only; all new content/cache is owned."""
    mounts = {str(target): (str(source), bool(ro)) for source, target, ro in
              [(alias_dir, '/output', False), (supervisor.PYTHON, supervisor.PYTHON, True), (group, '/owned-group', True)]}
    for row in config['runtimeBindings']:
        need(row['readonly'] is True, 'installer-readonly-runtime')
        target, source = row['imagePath'], row['source']['path']
        need(target not in mounts or mounts[target] == (source, True), 'installer-mount-collision'); mounts[target] = (source, True)
    for _, pin, _, _ in public:
        source = pin['path']; need(source not in mounts or mounts[source] == (source, True), 'installer-source-collision'); mounts[source] = (source, True)
    argv = ['create', '--interactive', '--name', 'helmut-unitdiag-aliases-' + config['nonce'], '--network', 'none', '--read-only', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges', '--user', '1000:1000', '--cgroup-parent=/' + config['parent'], '--cgroupns', 'private',
            '--log-driver', 'none', '--entrypoint', str(supervisor.PYTHON / 'bin/python3.12')]
    for target, (source, ro) in mounts.items():
        need(not any(x in source + target for x in (',', '\0', '\n')), 'installer-mount-path')
        argv += ['--mount', 'type=bind,src=' + source + ',dst=' + target + (',readonly' if ro else '')]
    argv += [config['runtime']['imageId'], '-I', '-S', '-B', '-c', INSTALLER]
    cid = native.docker(argv, timeout=8).stdout.strip(); need(HASH.fullmatch(cid), 'installer-id')
    # Publish this identity before start, even if native setup later fails.
    publish_once(alias_dir.parent / 'ALIAS_INSTALLER_CREATED.SAFE.json', encode({'containerId': cid}))
    child = _PipeChild([*DOCKER, 'start', '--attach', '--interactive', cid], lifetime=20, deferred=True)
    observed, supplied = None, False
    try:
        while True:
            done = child.tick()
            row = json.loads(native.docker(['inspect', cid], timeout=3).stdout)[0]; h = row['HostConfig']
            need(row['Id'] == cid and row['Image'] == config['runtime']['imageId'] and row['Config']['User'] == '1000:1000'
                 and h['CgroupParent'] == '/' + config['parent'] and h['CgroupnsMode'] == 'private' and h['NetworkMode'] == 'none'
                 and h['ReadonlyRootfs'] and h['CapDrop'] == ['ALL'] and not h['CapAdd'] and not h['Privileged']
                 and h['SecurityOpt'] == ['no-new-privileges'] and not row['State']['OOMKilled'], 'actual-installer-container')
            actual = {m['Destination']: m for m in row['Mounts']}
            need(set(actual) == set(mounts) and all(actual[t]['Type'] == 'bind' and actual[t]['Source'] == p
                 and actual[t]['RW'] is (not ro) and actual[t]['Propagation'] == 'rprivate' for t, (p, ro) in mounts.items()), 'actual-installer-mounts')
            lines = bytes(child.output[0]).split(b'\n')[:-1]
            if not supplied and lines:
                ready = unique(lines[0]); need(ready['schema'] == 'helmut-local-unit-alias-installer-ready/1' and row['State']['Running'], 'installer-live-ready')
                probe = NativeExecutionHost.__new__(NativeExecutionHost); probe.config = config
                observed = probe._proc(row['State']['Pid'], 1000)
                need(ready['pid'] == observed['namespacePID'] and ready['startTicks'] == observed['startTicks']
                     and ready['pidNamespace'] == observed['namespaces']['pid'] and observed['exe'] == str(supervisor.PYTHON / 'bin/python3.12'), 'actual-installer-process')
                child.supply(encode({'files': [{'source': p, 'target': '/output/' + key, 'mode': mode} for key, p, _, mode in public],
                                     'group': {'device': config['parentDevice'], 'inode': config['parentInode']}})); supplied = True
            if done:
                close = child.close_metadata()
                need(supplied and close['exitCode'] == 0 and row['State']['ExitCode'] == 0 and not row['State']['Running']
                     and len(lines) == 2 and bytes(child.output[0]).endswith(b'\n'), 'actual-installer-close')
                result = unique(lines[1]); need(result == {'schema': 'helmut-local-unit-alias-installer-result/1',
                    'files': [{'path': '/output/' + key, 'bytes': p['bytes'], 'sha256': p['sha256']} for key, p, _, _ in public]}, 'actual-installer-result')
                return {'containerId': cid, 'process': observed, **close}
            time.sleep(.02)
    except BaseException:
        # Never adopt/retry a copy with an unknown result. Keep the CID/evidence
        # for final common-parent accounting; stop only this newly owned child.
        try:
            native.docker(['stop', '--time', '2', cid], timeout=4)
            until = time.monotonic() + 2
            while time.monotonic() < until and not child.tick():
                time.sleep(.02)
        except BaseException:
            if child.child.poll() is None:
                child.child.kill(); child.child.wait(timeout=1)
        raise RuntimeError('native-execution-host-alias-installation-unknown') from None
    finally:
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
        required_mounts = {tuple(x) for x in [*plan['sourceAliasMounts'], plan['nodeMount']]}
        need(required_mounts <= {tuple(map(str, x[:2])) + (x[2],) for x in source_mounts}, 'source-public-mount-closure')
        node = Path(config['nodePin']['path'])
        need(not any(str(t) != str(node) and node.is_relative_to(Path(t)) for _, t, _ in source_mounts), 'original-node-single-file-mount')
        self.seq = 1; self.seen = set(); self.selection = None; self.pending = None
        self.state = 'INIT'; self.failure = None; self.closed = False
        self.children = []; self.owner = None; self.owner_ready = None; self.heartbeat = None
        self.owner_lines = 0; self.last_heartbeat = 0; self.source_identity = None
        self.clients = {}; self.active_client = None; self.client_pins = []; self.handoff = None
        self.observed_at = 0; self.started_at = time.monotonic()

    def _docker(self, args, **options):
        return self.native.docker(args, timeout=options.pop('timeout', 3), **options)

    def _child(self, argv, data=None, lifetime=20):
        c = _PipeChild(argv, data, lifetime); self.children.append(c); return c

    def _root(self, code, value, lifetime=8):
        python = str(self.supervisor.PYTHON / 'bin/python3.12')
        return self._child([*DOCKER, 'exec', '-i', '--user', '0:0', self.source_id, python, '-I', '-S', '-B', '-c', code], encode(value), lifetime)

    def _proc(self, pid, uid):
        root = Path('/proc') / str(pid)
        before = (root / 'stat').read_text(); f = before.rsplit(')', 1)[1].split()
        need(before.split()[0] == str(pid) and f[0] not in ('Z', 'X') and f[19].isdigit(), 'live-process')
        rows = dict(line.split(':', 1) for line in (root / 'status').read_text().splitlines())
        need(rows.get('Uid', '').split() == rows.get('Gid', '').split() == [str(uid)] * 4
             and rows.get('NoNewPrivs', '').strip() == '1'
             and all(rows.get(k) and int(rows[k], 16) == 0 for k in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb')), 'actual-process-privileges')
        ns = {k: os.readlink(root / 'ns' / k) for k in ('pid', 'net', 'mnt', 'cgroup', 'time')}
        membership = (root / 'cgroup').read_text()
        need(membership.startswith('0::/' + self.config['parent'] + '/') and len(membership.splitlines()) == 1, 'actual-common-parent')
        nspid = [int(x) for x in rows.get('NSpid', '').split()]
        need(nspid and nspid[0] == pid and all(x > 0 for x in nspid), 'actual-namespace-pid')
        value = {'hostPID': pid, 'namespacePID': nspid[-1], 'startTicks': f[19], 'exe': os.readlink(root / 'exe'), 'namespaces': ns, 'membership': membership}
        need((root / 'stat').read_text().rsplit(')', 1)[1].split()[19] == f[19], 'process-reused')
        return value

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
                p = self._proc(row['State']['Pid'], 1000)
                need(p['exe'] == self.config['nodePin']['path'] and p['namespaces']['pid'] != process['namespaces']['pid']
                     and p['namespaces']['net'] == process['namespaces']['net'], 'actual-client-namespace')
                if c.get('process'):
                    need(p == c['process'], 'client-process-drift')
                c['process'] = p
            c['row'] = row
        if self.owner_ready and self.state != 'STOPPED' and (self.heartbeat is not None or self.state != 'INIT'):
            need(self.heartbeat and time.monotonic() - self.last_heartbeat <= 15, 'owner-heartbeat-stale')
        service = self._source_service(self.handoff['sourceQualification']['publicSourceBinding']) if self.handoff and self.state != 'STOPPED' else None
        return {'observedAtUTC': utc(), 'source': process, 'sourceService': service, 'sourceContainerId': self.source_id,
                'knownContainerIds': sorted(known), 'ownerObservation': self.heartbeat}

    def _source_service(self, binding):
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
                observed = self._proc(pid, 1000)
                if observed['namespaces']['pid'] != actual['namespaces']['pid']:
                    continue
                need(observed['startTicks'] == expected['startTicks'] and observed['exe'] == self.config['nodePin']['path'], 'actual-source-service-process')
                with open('/proc/' + str(pid) + '/cmdline', 'rb') as stream:
                    cmdline = stream.read(16385)
                need(cmdline == b'\0'.join(x.encode() for x in [self.config['nodePin']['path'], *FLAGS, p['path'], '--serve-original-writes']) + b'\0', 'actual-source-service-command')
                matches.append(observed)
            except (FileNotFoundError, ProcessLookupError, PermissionError):
                continue
        need(len(matches) == 1, 'source-service-host-mapping')
        return matches[0]

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
        self._source_service(binding)
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
        self._client_files(h['immutableClientPins']); self.handoff = h

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
            names |= {'ENDPOINT_QUALIFICATION.SAFE.json'}
        folder = self.case / 'client'; canonical(folder)
        need(all(p.name in names and stat.S_ISREG(p.lstat().st_mode) and p.lstat().st_nlink == 1 for p in folder.iterdir()), 'unqualified-client-directory-content')
        extra = []
        if mode == 'qualifier':
            extra.append((str(folder / 'ENDPOINT_QUALIFICATION_CONFIG.PRIVATE.json'), str(BASE / self.config['nonce'] / 'ENDPOINT_QUALIFICATION_CONFIG.PRIVATE.json'), True))
        mounts = [(str(self.case / 'client'), str(BASE / self.config['nonce']), False),
                  (self.config['repository'], self.config['repository'], True), self.plan['nodeMount'],
                  (str(self.native.parent_path(self.config['parent'])), '/owned-group', True),
                  *self.plan['clientRuntimeMounts'], *self.client_immutable_mounts, *extra]
        need(len({t for _, t, _ in mounts}) == len(mounts), 'client-mount-duplicate')
        args = [*FLAGS, script, '--selector', str(BASE / self.config['nonce'] / 'SELECTION.SAFE.json')]
        argv = ['create', '--name', 'helmut-unitdiag-' + mode + '-' + self.config['nonce'], '--network', 'container:' + self.source_id,
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
        env_list = [k + '=' + v for k, v in environment.items()]
        for value in env_list:
            argv += ['--env', value]
        argv += [self.config['runtime']['imageId'], *args]
        cid = self._docker(argv, timeout=8).stdout.strip(); need(HASH.fullmatch(cid) and cid not in self.clients, 'new-client-id')
        self.clients[cid] = {'mode': mode, 'mounts': mounts, 'environment': env_list, 'args': args}
        child = self._child([*DOCKER, 'start', '--attach', cid], lifetime=35 if mode == 'qualifier' else 90)
        self.clients[cid]['child'] = child; self.active_client = cid

    def _reply(self, result):
        p = self.pending; now = datetime.datetime.now(datetime.timezone.utc)
        value = {'schema': 'helmut-local-unit-native-host-reply/1', 'seq': p['request']['seq'], 'stage': p['request']['stage'],
                 'nonce': p['request']['nonce'], 'selection': self.selection, 'requestSHA256': p['sha256'],
                 'issuedAtUTC': now.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                 'expiresAtUTC': (now + datetime.timedelta(seconds=3)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'), 'result': result}
        publish_once(self.case / ('HOST_REPLY_%02d.PRIVATE.json' % self.seq), encode(value))
        self.seq += 1; self.pending = None

    def _accept(self, request, digest):
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
            h = self.handoff
            env = {**ENV, 'HOME': '/run/bootstrap', 'TMPDIR': '/run/bootstrap', 'HELMUT_NATIVE_NODE_OLD_SPACE_MIB': '384'}
            payload = {k: h[k] for k in ('start', 'sourceQualification', 'hmacKeyHex', 'readQualifications')}; payload['ownerEnvironment'] = env
            need(len(encode(payload)) <= CAP, 'owner-private-input-cap')
            self.owner = self._root(BOOTSTRAP, payload, lifetime=180)
        elif stage == 'CLIENT_QUALIFY':
            need(self.state == 'OWNER' and set(body) == {'configuration'}, 'client-qualify-order')
            q = body['configuration']; need(q['selection'] == self.selection and q['publicSourceBinding'] == self.handoff['sourceQualification']['publicSourceBinding'], 'qualifier-config-scope')
            write_once(self.case / 'client/ENDPOINT_QUALIFICATION_CONFIG.PRIVATE.json', encode(q)); self._client('qualifier')
        elif stage == 'HOST_OBSERVE':
            need(self.state in ('QUALIFIED', 'ENTRY', 'DONE') and body == {}, 'observation-order')
            value = self._observe(); self.observed_at = time.monotonic(); self._reply(value)
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
        close = child.close_metadata(); row = c['row']
        if row['State']['Running']:
            return None
        need(close['exitCode'] == 0 and c.get('process') and row['State']['ExitCode'] == 0
             and not row['State']['OOMKilled'], 'actual-client-success-close')
        close.update(actualClientPID=c['process']['hostPID'], actualClientStartTicks=c['process']['startTicks'],
                     actualClientNamespacePID=c['process']['namespacePID'], clientContainerId=self.active_client, process=c['process'])
        return close

    def tick(self):
        need(not self.closed and self.failure is None, 'sealed-host')
        try:
            need(time.monotonic() - self.started_at < 240, 'whole-lifetime')
            for c in self.children:
                c.tick()
            self._owner_messages(); observation = self._observe()
            if self.owner and self.state != 'STOPPED' and self.owner.child.poll() is not None and not (self.pending and self.pending['request']['stage'] == 'OWNER_STOP'):
                need(False, 'unexpected-owner-exit')
            if self.pending:
                stage = self.pending['request']['stage']
                need(time.monotonic() - self.pending['began'] < {'OWNER_START': 18, 'CLIENT_QUALIFY': 35, 'ENTRY_RESULT': 90, 'OWNER_STOP': 12}.get(stage, 5), 'stage-deadline')
                if stage == 'OWNER_START' and self.owner_ready and self.heartbeat:
                    self.state = 'OWNER'; self._reply({'ready': self.owner_ready, 'observation': observation})
                elif stage == 'ENTRY_START' and self.clients[self.active_client].get('process'):
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
                                     and header['brokerCodeSHA256'] == self.plan['aliasPins']['broker']['sha256']
                                     and header['trustSHA256'] == self.qualifier_report['rootTrustSHA256']
                                     and header['sourceBindingSHA256'] == self.qualifier_report['publicSourceBindingCanonicalSHA256']
                                     and header['database'] == 'helmut_unit_diagnostic_' + self.config['nonce']
                                     and trace['value']['footer']['complete'] is True, 'actual-root-trace-binding')
                                self.state = 'STOPPED'; self._reply({'ownerStop': self.owner_stop, 'ownerProcessClose': self.owner.close_metadata(), 'controlReadTrace': trace})
            if not self.pending and self.state != 'STOPPED':
                need(self.seq <= 128, 'request-count')
                p = self.case / ('HOST_REQUEST_%02d.PRIVATE.json' % self.seq)
                if p.exists():
                    raw, pin = read_file(p); self._accept(unique(raw), pin['sha256'])
            return {'state': self.state, 'pending': None if not self.pending else self.pending['request']['stage'], 'observation': observation}
        except BaseException:
            self.failure = 'sealed-native-host-failure'
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
                c.selector.close()
                for stream in (c.child.stdin, c.child.stdout, c.child.stderr):
                    if stream and not stream.closed:
                        stream.close()
        self.closed = True; self.close_result = {'state': self.state, 'clean': clean, 'children': metadata,
                                               'knownClientContainerIds': sorted(self.clients), 'sourceStopRequested': False}
        return self.close_result
