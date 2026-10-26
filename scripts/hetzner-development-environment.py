#!/usr/bin/env python3
"""Closed development setup/tasks. Loaded only by the CI-qualified root controller.

No import/default effects. No native paths, original mounts, credentials, host
accounts or general command endpoint. Every test runs as its observed free IDs in
its own daemon, with only this development checkout mounted and no network.
"""
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import grp
import re
import selectors
import signal
import stat
import subprocess
import tarfile
import time
import urllib.parse
import urllib.request

BASE = Path('/opt/helmut-development-20261026')
SERVICE = 'helmut-development-docker.service'
UNIT = Path('/etc/systemd/system') / SERVICE
REPOSITORY = 'https://github.com/ernisch/helmut-pilot.git'
SOCKET = str(BASE / 'private/docker/run/docker.sock')
CGROUP = Path('/sys/fs/cgroup/helmut-development-20261026')
NODE_VERSION = '22.23.4'
NODE_SHA = '1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce'
DOCKER_SHA = '21516934188f06d0e5f232cbde8112701f6d82899016240bc7a5d619f6b0059c'
POSTGREST_SHA = '9f71269e61ac3a940281e93ff415760f5957e430e475ba4c3889f3ede7d5527c'
POSTGRES = 'postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3'
IDENTITY_RANGE = range(60001, 60033)
IDENTITY_KEYS = {'schema', 'uid', 'gid', 'uid_absent_from_nss', 'gid_absent_from_nss',
                 'uid_absent_from_processes', 'gid_absent_from_processes', 'observed_at_utc', 'proof_sha256'}
UID = GID = ACTIVE_IDENTITY = None
PROC = Path('/proc')
PROC_TASK_LIMIT, PROC_STATUS_LIMIT, PROC_TOTAL_LIMIT = 8192, 131072, 16*1024**2
GIB = 1024**3
RESERVE, BUILD_BUFFER, STOP_MARGIN = 10*GIB, 8*GIB, GIB
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C', 'HOME': '/nonexistent',
       'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_SYSTEM': '/dev/null',
       'GIT_TERMINAL_PROMPT': '0', 'GIT_ASKPASS': '/bin/false', 'SSH_ASKPASS': '/bin/false',
       'GIT_LFS_SKIP_SMUDGE': '1', 'GIT_OPTIONAL_LOCKS': '0'}
DOWNLOADS = {
    'docker.tgz': ('https://download.docker.com/linux/static/stable/x86_64/docker-28.4.0.tgz', DOCKER_SHA, 90*1024**2),
    'node.tar.xz': ('https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz', NODE_SHA, 45*1024**2),
    'postgrest.tar.xz': ('https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz', POSTGREST_SHA, 25*1024**2)}
CAPSULE_KEYS = {'schema', 'action', 'phase', 'source_sha256', 'source_commit', 'nonce',
                'issued_at_utc', 'expires_at_utc'}
PHASES = {'prepare': ('tools', 'source', 'image'), 'source-sync': ('source',),
          'test': ('syntax', 'lage-rest')}
PREFIX = b'helmut-development-request-v1\0'
ACTIVE_NONCE, TOOL_INDEX = None, 0
UNIT_PATHS = frozenset(('/etc/systemd/system.control','/run/systemd/system.control',
    '/run/systemd/transient','/run/systemd/generator.early','/etc/systemd/system',
    '/etc/systemd/system.attached','/run/systemd/system','/run/systemd/system.attached',
    '/run/systemd/generator','/usr/local/lib/systemd/system','/usr/lib/systemd/system',
    '/lib/systemd/system','/run/systemd/generator.late'))


def manager_unit_paths(deadline):
    # Read-only D-Bus probe deliberately does not create a unit before its
    # policy is qualified. Its own bus timeout and our read bound are explicit.
    argv = ['/usr/bin/busctl','--system','--timeout=5','--json=short','get-property',
        'org.freedesktop.systemd1','/org/freedesktop/systemd1','org.freedesktop.systemd1.Manager','UnitPath']
    process = subprocess.Popen(argv,env=ENV,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,close_fds=True)
    end, raw = min(deadline,time.monotonic()+6), bytearray()
    try:
        os.set_blocking(process.stdout.fileno(),False)
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout,selectors.EVENT_READ)
            while selector.get_map():
                need(time.monotonic()<end,'DEVELOPMENT_UNIT_PATH_TIMEOUT')
                for _,_ in selector.select(.05):
                    block=os.read(process.stdout.fileno(),65537-len(raw))
                    if not block:selector.unregister(process.stdout)
                    else:raw.extend(block)
                    need(len(raw)<=65536,'DEVELOPMENT_UNIT_PATH_LIMIT')
        need(process.wait(timeout=max(.01,end-time.monotonic()))==0,'DEVELOPMENT_UNIT_PATH_UNKNOWN')
        return parse_unit_paths(bytes(raw))
    finally:
        if process.poll() is None:process.kill();process.wait(timeout=2)
        process.stdout.close()


def parse_unit_paths(raw):
    value=json.loads(raw)
    need(type(value) is dict and set(value)=={'type','data'} and value['type']=='as'
         and type(value['data']) is list and 0<len(value['data'])<=32
         and all(type(path) is str and path in UNIT_PATHS for path in value['data'])
         and len(set(value['data']))==len(value['data']), 'DEVELOPMENT_UNIT_PATH_UNKNOWN')
    return value['data']


def unit_directory(path):
    fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC)
    try:
        for part in str(path).strip('/').split('/'):
            try:child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=fd)
            except FileNotFoundError:
                os.close(fd);return None
            os.close(fd);fd=child;info=os.fstat(fd)
            need(info.st_uid==info.st_gid==0 and not info.st_mode&0o022,'DEVELOPMENT_UNIT_DIRECTORY')
        return fd
    except BaseException:os.close(fd);raise


def dropin_names(unit):
    need(unit==SERVICE or re.fullmatch(r'helmut-development-host-[a-f0-9]{64}-[1-9][0-9]{0,2}\.service',unit),
         'DEVELOPMENT_UNIT_NAME')
    stem=unit[:-len('.service')]
    return ['service.d',*(stem[:index+1]+'.service.d' for index,char in enumerate(stem) if char=='-'),unit+'.d']


def unit_policy(unit, deadline, expected_fragment=None):
    paths=manager_unit_paths(deadline)
    found=[]
    for path in paths:
        root=unit_directory(path)
        if root is None:continue
        try:
            try:item=os.stat(unit,dir_fd=root,follow_symlinks=False)
            except FileNotFoundError:item=None
            if item is not None:
                need(expected_fragment is not None and path==str(UNIT.parent)
                    and stat.S_ISREG(item.st_mode) and item.st_uid==item.st_gid==0
                    and item.st_nlink==1 and not item.st_mode&0o022,'DEVELOPMENT_UNIT_FRAGMENT')
                need(read_root(Path(path)/unit,65536)==expected_fragment,'DEVELOPMENT_UNIT_FRAGMENT')
                found.append(path)
            for name in dropin_names(unit):
                # All effective global/prefix/exact dropins must be positively
                # absent/without .conf files. Missing metadata is never [] hooks.
                directory=unit_directory(Path(path)/name)
                if directory is not None:
                    try:need(not any(name.endswith('.conf') for name in os.listdir(directory)),
                             'DEVELOPMENT_UNIT_OVERRIDE_UNQUALIFIED')
                    finally:os.close(directory)
            for suffix in ('.wants','.requires','.upholds'):
                directory=unit_directory(Path(path)/(unit+suffix))
                if directory is not None:
                    try:need(not os.listdir(directory),'DEVELOPMENT_UNIT_DEPENDENCY_UNQUALIFIED')
                    finally:os.close(directory)
        finally:os.close(root)
    need(found==([str(UNIT.parent)] if expected_fragment is not None else []),'DEVELOPMENT_UNIT_FRAGMENT')
    return digest(encoded({'unit':unit,'unit_paths':paths,'dropins':dropin_names(unit),
                           'fragment_sha256':None if expected_fragment is None else digest(expected_fragment)}))


class Stop(Exception):
    @property
    def code(self): return self.args[0]


def need(value, code):
    if not value: raise Stop(code)


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)+'\n').encode('ascii')


def digest(raw): return hashlib.sha256(raw).hexdigest()


def hex_string(value, size):
    return type(value) is str and re.fullmatch('[a-f0-9]{'+str(size)+'}', value) is not None


def validate_identity(value):
    need(type(value) is dict and set(value) == IDENTITY_KEYS
         and value['schema'] == 'helmut-development-identity-v1', 'DEVELOPMENT_IDENTITY_RECEIPT')
    need(all(type(value[key]) is int and value[key] in IDENTITY_RANGE for key in ('uid', 'gid'))
         and all(value[key] is True for key in ('uid_absent_from_nss', 'gid_absent_from_nss',
             'uid_absent_from_processes', 'gid_absent_from_processes'))
         and type(value['observed_at_utc']) is int and 0 < value['observed_at_utc'] <= int(time.time())
         and hex_string(value['proof_sha256'], 64), 'DEVELOPMENT_IDENTITY_RECEIPT')
    need(value['proof_sha256'] == digest(encoded({key: item for key, item in value.items()
                                                if key != 'proof_sha256'})), 'DEVELOPMENT_IDENTITY_PROOF')
    return value


def nss_absent(lookup, number, deadline):
    need(time.monotonic() < deadline, 'DEVELOPMENT_IDENTITY_DEADLINE')
    try:
        lookup(number)
    except KeyError:
        need(time.monotonic() < deadline, 'DEVELOPMENT_IDENTITY_DEADLINE')
        return True
    except Exception as error:
        raise Stop('DEVELOPMENT_IDENTITY_NSS_UNKNOWN') from error
    need(time.monotonic() < deadline, 'DEVELOPMENT_IDENTITY_DEADLINE')
    return False


def status_identity(raw):
    # Only numeric credential columns are used. Names, command lines and all
    # other /proc fields are neither retained nor part of any proof/export.
    rows = {}
    for line in raw.splitlines():
        key, separator, rest = line.partition(b':')
        if key not in (b'Uid', b'Gid', b'Groups'):
            continue
        need(separator and key not in rows, 'DEVELOPMENT_IDENTITY_PROCESS_UNKNOWN')
        values = rest.split()
        need((key == b'Groups' or len(values) == 4)
             and len(values) <= 8192 and all(re.fullmatch(rb'[0-9]{1,10}', item) for item in values),
             'DEVELOPMENT_IDENTITY_PROCESS_UNKNOWN')
        rows[key] = {int(item) for item in values}
        need(all(item <= 4294967295 for item in rows[key]), 'DEVELOPMENT_IDENTITY_PROCESS_UNKNOWN')
    need(set(rows) == {b'Uid', b'Gid', b'Groups'}, 'DEVELOPMENT_IDENTITY_PROCESS_UNKNOWN')
    return rows[b'Uid'], rows[b'Gid'] | rows[b'Groups']


def process_identities(deadline):
    end, used_uids, used_gids, count, total = min(deadline, time.monotonic()+3), set(), set(), 0, 0
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    def listing(fd):
        need(time.monotonic() < end, 'DEVELOPMENT_IDENTITY_DEADLINE')
        names = {name for name in os.listdir(fd) if re.fullmatch('[1-9][0-9]{0,9}', name)}
        need(len(names) <= PROC_TASK_LIMIT, 'DEVELOPMENT_IDENTITY_PROCESS_LIMIT')
        return names
    try:
        root = os.open(PROC, flags)
        try:
            pids = listing(root)
            need(bool(pids), 'DEVELOPMENT_IDENTITY_PROCESS_UNKNOWN')
            for pid in sorted(pids):
                process = os.open(pid, flags, dir_fd=root)
                try:
                    tasks = os.open('task', flags, dir_fd=process)
                    try:
                        tids = listing(tasks)
                        need(pid in tids, 'DEVELOPMENT_IDENTITY_PROCESS_UNKNOWN')
                        for tid in sorted(tids):
                            count += 1
                            need(count <= PROC_TASK_LIMIT, 'DEVELOPMENT_IDENTITY_PROCESS_LIMIT')
                            task = os.open(tid, flags, dir_fd=tasks)
                            try:
                                status = os.open('status', os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=task)
                                try:
                                    raw = bytearray()
                                    while block := os.read(status, min(65536, PROC_STATUS_LIMIT+1-len(raw))):
                                        raw.extend(block)
                                        need(len(raw) <= PROC_STATUS_LIMIT and time.monotonic() < end,
                                             'DEVELOPMENT_IDENTITY_PROCESS_LIMIT')
                                finally: os.close(status)
                            finally: os.close(task)
                            total += len(raw)
                            need(total <= PROC_TOTAL_LIMIT, 'DEVELOPMENT_IDENTITY_PROCESS_LIMIT')
                            uids, gids = status_identity(bytes(raw))
                            used_uids.update(uids.intersection(IDENTITY_RANGE))
                            used_gids.update(gids.intersection(IDENTITY_RANGE))
                        need(listing(tasks) == tids, 'DEVELOPMENT_IDENTITY_PROCESS_CHANGED')
                    finally: os.close(tasks)
                finally: os.close(process)
            need(listing(root) == pids, 'DEVELOPMENT_IDENTITY_PROCESS_CHANGED')
        finally: os.close(root)
    except OSError as error:
        raise Stop('DEVELOPMENT_IDENTITY_PROCESS_UNKNOWN') from error
    return used_uids, used_gids


def observe_identity(uid, gid, deadline):
    need(type(uid) is int and uid in IDENTITY_RANGE and type(gid) is int and gid in IDENTITY_RANGE,
         'DEVELOPMENT_IDENTITY_RANGE')
    for _ in range(2):
        need(nss_absent(pwd.getpwuid, uid, deadline) and nss_absent(grp.getgrgid, gid, deadline),
             'DEVELOPMENT_IDENTITY_ASSIGNED')
        used_uids, used_gids = process_identities(deadline)
        need(uid not in used_uids and gid not in used_gids, 'DEVELOPMENT_IDENTITY_PROCESS_ASSIGNED')
        need(nss_absent(pwd.getpwuid, uid, deadline) and nss_absent(grp.getgrgid, gid, deadline),
             'DEVELOPMENT_IDENTITY_ASSIGNED')
    facts = {'schema': 'helmut-development-identity-v1', 'uid': uid, 'gid': gid,
             'uid_absent_from_nss': True, 'gid_absent_from_nss': True,
             'uid_absent_from_processes': True, 'gid_absent_from_processes': True,
             'observed_at_utc': int(time.time())}
    return {**facts, 'proof_sha256': digest(encoded(facts))}


def select_identity(deadline):
    global UID, GID, ACTIVE_IDENTITY
    UID = GID = ACTIVE_IDENTITY = None
    free_uids = [number for number in IDENTITY_RANGE if nss_absent(pwd.getpwuid, number, deadline)]
    free_gids = [number for number in IDENTITY_RANGE if nss_absent(grp.getgrgid, number, deadline)]
    used_uids, used_gids = process_identities(deadline)
    free_uids = [number for number in free_uids if number not in used_uids]
    free_gids = [number for number in free_gids if number not in used_gids]
    need(free_uids and free_gids, 'DEVELOPMENT_IDENTITY_NONE_AVAILABLE')
    observed = observe_identity(free_uids[0], free_gids[0], deadline)
    UID, GID, ACTIVE_IDENTITY = observed['uid'], observed['gid'], observed
    return observed


def identity_ids():
    value = validate_identity(ACTIVE_IDENTITY)
    need((UID, GID) == (value['uid'], value['gid']), 'DEVELOPMENT_IDENTITY_BINDING')
    return UID, GID


def refresh_identity(deadline):
    global ACTIVE_IDENTITY
    previous, ACTIVE_IDENTITY = ACTIVE_IDENTITY, None
    validate_identity(previous)
    need((UID, GID) == (previous['uid'], previous['gid']), 'DEVELOPMENT_IDENTITY_BINDING')
    ACTIVE_IDENTITY = observe_identity(UID, GID, deadline)
    return ACTIVE_IDENTITY


def tools_identity(deadline):
    global UID, GID, ACTIVE_IDENTITY
    ACTIVE_IDENTITY = None
    receipt = json.loads(read_root(BASE/'private/TOOLS.SAFE.json'))
    need(type(receipt) is dict and set(receipt) == {'schema', 'node_version', 'node_archive_sha256',
         'docker_archive_sha256', 'postgrest_archive_sha256', 'postgres_base', 'identity'}
         and receipt['schema'] == 'helmut-development-tools-v1'
         and receipt['node_version'] == NODE_VERSION and receipt['node_archive_sha256'] == NODE_SHA
         and receipt['docker_archive_sha256'] == DOCKER_SHA and receipt['postgrest_archive_sha256'] == POSTGREST_SHA
         and receipt['postgres_base'] == POSTGRES, 'DEVELOPMENT_IDENTITY_RECEIPT')
    value = validate_identity(receipt['identity'])
    UID, GID, ACTIVE_IDENTITY = value['uid'], value['gid'], value
    refresh_identity(deadline)
    return receipt


def check_capsule(value, source_sha, now):
    need(type(value) is dict and set(value) == CAPSULE_KEYS and
         value['schema'] == 'helmut-development-capsule-v1', 'DEVELOPMENT_CAPSULE')
    need(value['action'] in PHASES and value['phase'] in PHASES[value['action']], 'DEVELOPMENT_ACTION')
    need(value['source_sha256'] == source_sha and hex_string(source_sha, 64)
         and hex_string(value['source_commit'], 40) and hex_string(value['nonce'], 64), 'DEVELOPMENT_BINDING')
    need(type(value['issued_at_utc']) is int and type(value['expires_at_utc']) is int
         and value['issued_at_utc'] <= now <= value['expires_at_utc']
         and 0 < value['expires_at_utc']-value['issued_at_utc'] <= 300, 'DEVELOPMENT_TIME')


def trusted_directory(path, mode=None):
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        for part in str(path).strip('/').split('/'):
            need(part not in ('', '.', '..'), 'DEVELOPMENT_PATH')
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
            os.close(fd); fd = child
            item = os.fstat(fd)
            need(item.st_uid == item.st_gid == 0 and not item.st_mode & 0o022, 'DEVELOPMENT_DIRECTORY')
        if mode is not None: need(stat.S_IMODE(os.fstat(fd).st_mode) == mode, 'DEVELOPMENT_MODE')
        return fd
    except BaseException:
        os.close(fd); raise


def write_new(path, raw, mode=0o600):
    parent = trusted_directory(path.parent)
    try:
        fd = os.open(path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, mode, dir_fd=parent)
        try:
            os.fchmod(fd, mode)
            offset = 0
            while offset < len(raw):
                count = os.write(fd, raw[offset:]); need(count > 0, 'DEVELOPMENT_SHORT_WRITE'); offset += count
            os.fsync(fd)
        finally: os.close(fd)
        os.fsync(parent)
    finally: os.close(parent)


def read_root(path, limit=32768):
    parent = trusted_directory(path.parent)
    try:
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
        try:
            before = os.fstat(fd)
            need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0
                 and before.st_nlink == 1 and not before.st_mode & 0o022 and before.st_size <= limit, 'DEVELOPMENT_FILE')
            raw = bytearray()
            while block := os.read(fd, min(65536, limit+1-len(raw))):
                raw.extend(block); need(len(raw) <= limit, 'DEVELOPMENT_FILE_LIMIT')
            need(before == os.fstat(fd), 'DEVELOPMENT_FILE_CHANGED')
            return bytes(raw)
        finally: os.close(fd)
    finally: os.close(parent)


def capacity(extra=0):
    info = os.statvfs('/opt')
    need(info.f_bavail*info.f_frsize >= RESERVE+STOP_MARGIN+extra, 'DEVELOPMENT_NATIVE_DISK_RESERVE')


CLEANUP = '''import os,time
from pathlib import Path
p=Path('/sys/fs/cgroup/helmut-development-20261026')
if p.exists():
 f=os.open(p/'cgroup.kill',os.O_WRONLY|os.O_NOFOLLOW);os.write(f,b'1');os.close(f)
 end=time.monotonic()+8
 while 'populated 0' not in (p/'cgroup.events').read_text().splitlines():
  if time.monotonic()>=end:raise SystemExit(1)
  time.sleep(.05)
'''


HOST_COMMAND = '''import os,select,signal,subprocess,sys,time
from pathlib import Path
parent=int(sys.argv[1]);deadline=float(sys.argv[2]);role=sys.argv[3]
uid=int(sys.argv[4]);gid=int(sys.argv[5])
if not (60001<=uid<=60032 and 60001<=gid<=60032):raise SystemExit(125)
held=os.pidfd_open(parent,0)
poll=select.poll();poll.register(held,select.POLLIN)
if poll.poll(0) or time.monotonic()>=deadline:raise SystemExit(125)
if role not in ('host','worker','docker'):raise SystemExit(125)
if role=='worker':
 os.setgroups([]);os.setgid(gid);os.setuid(uid)
 if (os.getuid(),os.geteuid(),os.getgid(),os.getegid(),os.getgroups())!=(uid,uid,gid,gid,[]):raise SystemExit(125)
process=subprocess.Popen(sys.argv[6:],stdin=subprocess.DEVNULL,start_new_session=True,close_fds=True)
aborted=False
try:
 while process.poll() is None:
  if poll.poll(50) or time.monotonic()>=deadline:
   aborted=True;break
 if aborted:
  try:os.killpg(process.pid,signal.SIGKILL)
  except ProcessLookupError:pass
  if role=='docker':
   p=Path('/sys/fs/cgroup/helmut-development-20261026')
   if p.exists():
    f=os.open(p/'cgroup.kill',os.O_WRONLY|os.O_NOFOLLOW);os.write(f,b'1');os.close(f)
   subprocess.run(['/usr/bin/systemctl','kill','--kill-whom=all','--signal=SIGKILL','helmut-development-docker.service'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=3)
  process.wait(timeout=3)
  raise SystemExit(125)
 raise SystemExit(process.returncode if process.returncode>=0 else 128-process.returncode)
finally:
 os.close(held)
'''


def stop_development():
    # Stop writers before a service grace period can consume the native reserve.
    if CGROUP.exists():
        fd = os.open(CGROUP/'cgroup.kill', os.O_WRONLY | os.O_NOFOLLOW)
        try: os.write(fd, b'1')
        finally: os.close(fd)
        end = time.monotonic()+3
        while 'populated 0' not in (CGROUP/'cgroup.events').read_text().splitlines():
            need(time.monotonic() < end, 'DEVELOPMENT_CHILDREN_UNCONFIRMED'); time.sleep(.02)
    subprocess.run(['/usr/bin/systemctl', 'kill', '--kill-whom=all', '--signal=SIGKILL', SERVICE], env=ENV,
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3)
    stopped = subprocess.run(['/usr/bin/systemctl', 'stop', SERVICE], env=ENV,
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
    need(stopped.returncode == 0, 'DEVELOPMENT_STOP_UNCONFIRMED')
    # Docker uses this fixed cgroupfs parent, including container processes that
    # are outside the service cgroup. ExecStopPost kills and observes that parent.
    if CGROUP.exists():
        need('populated 0' in (CGROUP/'cgroup.events').read_text().splitlines(), 'DEVELOPMENT_CHILDREN_UNCONFIRMED')


def run(argv, deadline, user=None, cwd=None, extra_env=None, cap=1024**2):
    global TOOL_INDEX
    need(0 < deadline-time.monotonic() <= 300, 'DEVELOPMENT_DEADLINE')
    capacity()
    need(hex_string(ACTIVE_NONCE, 64), 'DEVELOPMENT_REQUEST_REQUIRED')
    refresh_identity(deadline)
    uid, gid = identity_ids()
    need(user is None or (type(user) is int and user == uid), 'DEVELOPMENT_IDENTITY_BINDING')
    command_env = {**ENV, **(extra_env or {})}
    host_unit = 'helmut-development-host-'+ACTIVE_NONCE+'-'+str(TOOL_INDEX+1)+'.service'
    remaining = max(1, int(deadline-time.monotonic()))
    launch = ['/usr/bin/systemd-run','--quiet','--pipe','--wait','--service-type=exec','--unit='+host_unit,
        '--property=RuntimeMaxSec='+str(remaining),'--property=TimeoutStopSec=5',
        '--property=KillMode=control-group','--property=KillSignal=SIGKILL',
        '--property=User=0','--property=Group=0',
        '--property=NoNewPrivileges=yes','--property=TasksMax=256','--property=MemoryMax=2G']
    if cwd is not None: launch += ['--working-directory='+str(cwd)]
    launch += ['/usr/bin/env','-i',*[key+'='+value for key,value in command_env.items()],
        '/usr/bin/python3','-I','-S','-B',str(BASE/'toolchain/host-command.py'),str(os.getpid()),str(deadline),
        'docker' if argv[0] == str(BASE/'toolchain/docker/docker') else 'worker' if user is not None else 'host',
        str(uid),str(gid),*argv]
    unit_policy(host_unit, deadline)
    refresh_identity(deadline)  # Unit discovery may have taken time; observe again immediately before launch.
    need(identity_ids() == (uid, gid), 'DEVELOPMENT_IDENTITY_BINDING')
    process = subprocess.Popen(launch, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=ENV, start_new_session=True, close_fds=True)
    buffers = [bytearray(), bytearray()]
    try:
        with selectors.DefaultSelector() as selector:
            for index, pipe in enumerate((process.stdout, process.stderr)):
                os.set_blocking(pipe.fileno(), False); selector.register(pipe, selectors.EVENT_READ, index)
            while selector.get_map():
                capacity(); need(time.monotonic() < deadline, 'DEVELOPMENT_DEADLINE')
                for key, _ in selector.select(.1):
                    block = os.read(key.fileobj.fileno(), 65536)
                    if not block: selector.unregister(key.fileobj); continue
                    buffers[key.data].extend(block)
                    need(len(buffers[key.data]) <= cap, 'DEVELOPMENT_TOOL_OUTPUT_LIMIT')
            need(process.wait(timeout=max(.01, deadline-time.monotonic())) == 0, 'DEVELOPMENT_TOOL_FAILED')
        return bytes(buffers[0])
    except BaseException as error:
        subprocess.run(['/usr/bin/systemctl','kill','--kill-whom=all','--signal=SIGKILL',host_unit],
            env=ENV,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=3)
        try: os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: pass
        # Any abnormal Docker path stops its daemon AND fixed container cgroup.
        # Keep the first cause and every partial file. No rm/prune/reset.
        if argv[0] == str(BASE/'toolchain/docker/docker'):
            try: stop_development()
            except Exception: raise Stop('DEVELOPMENT_STOP_UNCONFIRMED') from error
        error.diagnostic = {'executable': argv[0], 'returncode': process.returncode,
                            'stdout_sha256': digest(buffers[0]), 'stderr_sha256': digest(buffers[1]),
                            'stderr_prefix': bytes(buffers[1][:4096]).decode('utf8', 'replace')}
        raise
    finally:
        if ACTIVE_NONCE is not None and (BASE/'private/requests').is_dir():
            TOOL_INDEX += 1
            stem = ACTIVE_NONCE+'.tool-'+str(TOOL_INDEX)
            for label, raw in zip(('stdout', 'stderr'), buffers):
                write_new(BASE/'private/requests'/(stem+'.'+label+'.PRIVATE.bin'), bytes(raw))
        process.stdout.close(); process.stderr.close()


def docker(args, deadline, **kwargs):
    capacity()
    unit_policy(SERVICE, deadline, daemon_unit_source())
    try:
        if CGROUP.exists():
            need('populated 0' in (CGROUP/'cgroup.events').read_text().splitlines(), 'DEVELOPMENT_PREVIOUS_WORKLOAD_ALIVE')
        # Each call gets a fresh independent maximum runtime, also after the
        # daemon has automatically stopped between two ordinary developer tasks.
        stop_development()
        run(['/usr/bin/systemctl', 'start', SERVICE], deadline)
        return run([str(BASE/'toolchain/docker/docker'), '--host=unix://'+SOCKET, *args], deadline,
                   extra_env={'DOCKER_CONFIG': str(BASE/'private/docker-config'), 'DOCKER_BUILDKIT': '0'}, **kwargs)
    except BaseException:
        stop_development()
        raise


class DownloadRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, url):
        parsed = urllib.parse.urlsplit(url)
        need(parsed.scheme == 'https' and parsed.hostname == 'release-assets.githubusercontent.com'
             and parsed.port in (None, 443) and parsed.username is None, 'DEVELOPMENT_DOWNLOAD_REDIRECT')
        return super().redirect_request(req, fp, code, msg, headers, url)


def download(name, deadline):
    url, expected, cap = DOWNLOADS[name]
    path = BASE/'private'/name
    opener = urllib.request.build_opener(DownloadRedirect())
    request = urllib.request.Request(url, headers={'User-Agent': 'HELMUT-public-development-setup'})
    need(time.monotonic() < deadline, 'DEVELOPMENT_DEADLINE')
    with opener.open(request, timeout=min(20, deadline-time.monotonic())) as response:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        total, sha = 0, hashlib.sha256()
        try:
            while block := response.read(65536):
                capacity(); need(time.monotonic() < deadline, 'DEVELOPMENT_DEADLINE')
                total += len(block); need(total <= cap, 'DEVELOPMENT_DOWNLOAD_LIMIT'); sha.update(block)
                view = memoryview(block)
                while view:
                    count = os.write(fd, view); need(count > 0, 'DEVELOPMENT_SHORT_WRITE'); view = view[count:]
            os.fsync(fd)
        finally: os.close(fd)
    need(sha.hexdigest() == expected, 'DEVELOPMENT_DOWNLOAD_HASH')
    return path


def unpack(path, output, prefix):
    output.mkdir(mode=0o755)
    output.chmod(0o755)
    links = []
    with tarfile.open(path) as archive:
        members = archive.getmembers()
        need(0 < len(members) <= 20000 and sum(m.size for m in members) <= 512*1024**2, 'DEVELOPMENT_ARCHIVE_BOUND')
        for member in members:
            name = member.name.rstrip('/')
            need(name == prefix or name.startswith(prefix+'/'), 'DEVELOPMENT_ARCHIVE_PREFIX')
            relative = name[len(prefix):].lstrip('/')
            if not relative: continue
            need(str(PurePosixPath(relative)) == relative and '..' not in relative.split('/'), 'DEVELOPMENT_ARCHIVE_PATH')
            destination = output/relative
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            if member.isdir(): destination.mkdir(exist_ok=True, mode=0o755)
            elif member.isfile():
                fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o755 if member.mode & 0o111 else 0o644)
                try:
                    os.fchmod(fd, 0o755 if member.mode & 0o111 else 0o644)
                    with archive.extractfile(member) as source:
                        while block := source.read(65536):
                            view = memoryview(block)
                            while view:
                                count = os.write(fd, view); need(count > 0, 'DEVELOPMENT_SHORT_WRITE'); view = view[count:]
                finally: os.close(fd)
            elif member.issym(): links.append((destination, member.linkname))
            else: raise Stop('DEVELOPMENT_ARCHIVE_TYPE')
    for directory, _, _ in os.walk(output): os.chmod(directory, 0o755)
    for destination, target in links:
        resolved = os.path.normpath(str(destination.parent/target))
        need(not target.startswith('/') and resolved.startswith(str(output)+'/'), 'DEVELOPMENT_ARCHIVE_LINK')
        destination.symlink_to(target)


def daemon_unit_source():
    return ('[Unit]\nDescription=Helmut isolated development Docker\nAfter=network-online.target\n'
            '[Service]\nType=notify\nNotifyAccess=all\nUser=root\nGroup=root\nUMask=0077\n'
            'PrivateMounts=yes\nPrivateTmp=yes\nDelegate=yes\nKillMode=control-group\n'
            'TimeoutStartSec=90\nTimeoutStopSec=15\nKillSignal=SIGKILL\nRuntimeMaxSec=290\nRestart=no\n'
            'Environment=PATH='+str(BASE/'toolchain/docker')+':/usr/sbin:/usr/bin:/sbin:/bin\n'
            'ExecStart='+str(BASE/'toolchain/docker/dockerd')+' --host=unix://'+SOCKET+
            ' --config-file='+str(BASE/'private/daemon.json')+
            ' --data-root='+str(BASE/'private/docker/data')+' --exec-root='+str(BASE/'private/docker/exec')+
            ' --pidfile='+str(BASE/'private/docker/run/dockerd.pid')+
            ' --storage-driver=vfs --bridge=none --iptables=false --ip6tables=false --ip-forward=false'
            ' --ip-masq=false --userland-proxy=false --group=root --containerd-namespace=helmut-development'
            ' --exec-opt=native.cgroupdriver=cgroupfs --cgroup-parent=/helmut-development-20261026\n'
            'ExecStopPost=/usr/bin/python3 -I -S -B '+str(BASE/'private/cleanup.py')+'\n'
            '[Install]\nWantedBy=multi-user.target\n').encode()


def tools(deadline):
    receipt = BASE/'private/TOOLS.SAFE.json'
    if receipt.exists(): return tools_identity(deadline)
    select_identity(deadline)  # First setup step: only bounded credential observations.
    capacity(BUILD_BUFFER)
    need(not BASE.exists() and not UNIT.exists() and not CGROUP.exists(), 'DEVELOPMENT_SETUP_ALREADY_STARTED')
    unit_policy(SERVICE, deadline)  # Before any setup marker, download or unit write.
    BASE.mkdir(mode=0o711)
    BASE.chmod(0o711)
    for leaf, mode in (('private', 0o700), ('toolchain', 0o755), ('workspaces', 0o711), ('repositories', 0o711)):
        (BASE/leaf).mkdir(mode=mode)
        (BASE/leaf).chmod(mode)
    for leaf in ('docker', 'docker-config', 'requests'):
        (BASE/'private'/leaf).mkdir(mode=0o700)
    for leaf in ('data', 'exec', 'run'):
        (BASE/'private/docker'/leaf).mkdir(mode=0o700)
    # A marker is written before the first download. Failed setup is retained.
    write_new(BASE/'private/SETUP_STARTED.SAFE.json', encoded({'schema': 'helmut-development-setup-started-v1'}))
    unpack(download('docker.tgz', deadline), BASE/'toolchain/docker', 'docker')
    unpack(download('node.tar.xz', deadline), BASE/'toolchain/node', 'node-v22.23.4-linux-x64')
    rest = download('postgrest.tar.xz', deadline)
    with tarfile.open(rest) as archive:
        members = archive.getmembers()
        need(len(members) == 1 and members[0].name == 'postgrest' and members[0].isfile()
             and members[0].size < 100*1024**2, 'DEVELOPMENT_POSTGREST_ARCHIVE')
        write_new(BASE/'toolchain/postgrest', archive.extractfile(members[0]).read(), 0o755)
    text = daemon_unit_source().decode()
    write_new(BASE/'private/daemon.json', b'{}\n')
    write_new(BASE/'private/cleanup.py', CLEANUP.encode())
    write_new(BASE/'toolchain/npm-userconfig', b'', 0o644)
    write_new(BASE/'toolchain/npm-globalconfig', b'', 0o644)
    write_new(BASE/'toolchain/host-command.py', HOST_COMMAND.encode(), 0o644)
    write_new(UNIT, text.encode(), 0o644)
    run(['/usr/bin/systemctl', 'daemon-reload'], deadline)
    unit_policy(SERVICE, deadline, daemon_unit_source())
    run(['/usr/bin/systemctl', 'enable', '--now', SERVICE], deadline)
    result = {'schema': 'helmut-development-tools-v1', 'node_version': NODE_VERSION,
              'node_archive_sha256': NODE_SHA, 'docker_archive_sha256': DOCKER_SHA,
              'postgrest_archive_sha256': POSTGREST_SHA, 'postgres_base': POSTGRES,
              'identity': dict(ACTIVE_IDENTITY)}
    write_new(receipt, encoded(result))
    return result


GIT_OPTIONS = ('core.hooksPath=/dev/null', 'core.fsmonitor=false', 'credential.helper=',
    'credential.interactive=false', 'core.askPass=/bin/false', 'maintenance.auto=false',
    'gc.auto=0', 'submodule.recurse=false', 'protocol.allow=never', 'protocol.https.allow=always',
    'http.followRedirects=false', 'http.sslVerify=true', 'filter.lfs.required=false',
    'filter.lfs.process=', 'filter.lfs.smudge=', 'filter.lfs.clean=',
    'core.attributesFile=/dev/null', 'core.excludesFile=/dev/null', 'core.sshCommand=/bin/false')


def git(args, deadline, cwd=None, sealed=False):
    argv = ['/usr/bin/git']
    for option in GIT_OPTIONS: argv += ['-c', option]
    if sealed:
        repository = BASE/'repositories'/cwd.name
        argv += ['-c', 'safe.directory='+str(cwd), '-c', 'safe.directory='+str(repository),
                 '--git-dir='+str(repository), '--work-tree='+str(cwd)]
    return run([*argv, *args], deadline, user=UID, cwd=cwd, cap=4*1024**2)


def lockfile(raw):
    value = json.loads(raw)
    need(value.get('lockfileVersion') == 3 and type(value.get('packages')) is dict, 'DEVELOPMENT_LOCKFILE')
    for name, package in value['packages'].items():
        if not name: continue
        url = urllib.parse.urlsplit(package.get('resolved', ''))
        need(url.scheme == 'https' and url.hostname == 'registry.npmjs.org' and url.port is None
             and url.username is None and not url.query and not url.fragment
             and re.fullmatch(r'sha512-[A-Za-z0-9+/]+={0,2}', package.get('integrity', ''))
             and not package.get('hasInstallScript') and not package.get('link'), 'DEVELOPMENT_DEPENDENCY_SOURCE')
    return digest(raw)


def checkout(commit, nonce, deadline):
    refresh_identity(deadline)
    path = BASE/'workspaces'/('repo-'+nonce)
    path.mkdir(mode=0o700); os.chown(path, UID, GID)
    git(['init', str(path)], deadline)
    git(['fetch', '--depth=1', '--no-tags', REPOSITORY, commit], deadline, path)
    git(['checkout', '-b', 'development', commit], deadline, path)
    git(['remote', 'add', 'origin', REPOSITORY], deadline, path)
    need(git(['rev-parse', 'HEAD'], deadline, path).strip().decode() == commit, 'DEVELOPMENT_SOURCE_COMMIT')
    tracked = git(['ls-files', '-z'], deadline, path).split(b'\0')
    need(not any(name.split(b'/')[-1] in (b'.env', b'.env.local', b'.npmrc') for name in tracked), 'DEVELOPMENT_SOURCE_ENV_FILE')
    raw = git(['show', commit+':package-lock.json'], deadline, path)
    # Keep host Git configuration/index outside the writable worktree. A source
    # edit cannot install a host-side filter/helper through .git/config.
    sealed = BASE/'repositories'/path.name
    os.rename(path/'.git', sealed)
    for directory, dirs, files in os.walk(sealed, followlinks=False):
        os.chown(directory, 0, 0); os.chmod(directory, 0o755)
        for name in dirs+files:
            item = Path(directory)/name
            need(not item.is_symlink(), 'DEVELOPMENT_GIT_METADATA_LINK')
            os.chown(item, 0, 0)
            if item.is_file(): os.chmod(item, 0o644)
    fd = os.open(path/'.git', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
    try:
        os.fchmod(fd, 0o644)
        os.write(fd, ('gitdir: '+str(sealed)+'\n').encode())
    finally: os.close(fd)
    return {'source_commit': commit, 'workspace': path.name, 'package_lock_sha256': lockfile(raw),
            'uid': UID, 'gid': GID}, raw


def replace_receipt(path, value):
    temporary = path.with_name(path.name+'.'+os.urandom(16).hex()+'.tmp')
    write_new(temporary, encoded(value))
    os.replace(temporary, path)
    parent = trusted_directory(path.parent)
    try: os.fsync(parent)
    finally: os.close(parent)


def workspace(receipt):
    identity_ids()
    need(receipt.get('uid') == UID and type(receipt.get('uid')) is int
         and receipt.get('gid') == GID and type(receipt.get('gid')) is int, 'DEVELOPMENT_IDENTITY_BINDING')
    name = receipt['workspace']
    need(type(name) is str and re.fullmatch('repo-[a-f0-9]{64}', name), 'DEVELOPMENT_WORKSPACE_NAME')
    path = BASE/'workspaces'/name
    item = path.lstat()
    need(stat.S_ISDIR(item.st_mode) and item.st_uid == UID and item.st_gid == GID, 'DEVELOPMENT_WORKSPACE')
    return path


def source_sync(capsule, deadline):
    identity_ids()
    active = BASE/'private/CURRENT.SAFE.json'
    if active.exists():
        old = json.loads(read_root(active))
        need(not git(['status', '--porcelain', '--untracked-files=normal'], deadline, workspace(old), sealed=True).strip(), 'DEVELOPMENT_WORKSPACE_DIRTY')
        if old['source_commit'] == capsule['source_commit']: return old
    result, _ = checkout(capsule['source_commit'], capsule['nonce'], deadline)
    image = BASE/'private/IMAGE.SAFE.json'
    if capsule['action'] == 'source-sync':
        expected = json.loads(read_root(image))
        need(result['package_lock_sha256'] == expected['package_lock_sha256'], 'DEVELOPMENT_DEPENDENCIES_REQUIRE_PREPARE')
        need((expected.get('uid'), expected.get('gid')) == identity_ids(), 'DEVELOPMENT_IDENTITY_BINDING')
    write_new(BASE/'private'/('SOURCE-'+capsule['nonce']+'.SAFE.json'), encoded(result))
    replace_receipt(active, result)
    return result


ENTRYPOINT = '''#!/bin/sh
set -eu
umask 077
test "$(id -u):$(id -g)" = @UID@:@GID@
export HOME=/tmp/home PATH=/opt/helmut-dev/node/bin:/usr/lib/postgresql/17/bin:/usr/bin:/bin
mkdir -p "$HOME"
actual_lock=$(sha256sum /workspace/package-lock.json)
expected_lock=$(cat /opt/helmut-dev/package-lock.sha256)
test "${actual_lock%% *}" = "$expected_lock"
test ! -e /workspace/.env
test ! -e /workspace/.env.local
test ! -e /workspace/.npmrc
printf 'Runtime: '; node --version
printf 'Identity: '; id -u
if test ! -d /workspace/node_modules; then cp -a /opt/helmut-dev/dependencies/node_modules /workspace/node_modules; fi
export HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local
cd /workspace
case "$1" in
syntax)
  find server.js client.js sw.js api lambda lib scripts -type f -name '*.js' -print0 >/tmp/syntax-files
  xargs -0 -r -n1 node --check </tmp/syntax-files
  node scripts/lokal.js scripts/netzschutz-test.js
  ;;
lage-rest)
  initdb -D /tmp/pgdata -U helmut --auth=trust --no-locale >/tmp/initdb.log
  pg_ctl -D /tmp/pgdata -l /tmp/postgres.log -o '-h 127.0.0.1 -p 5433 -k /tmp -c shared_buffers=32MB -c max_connections=20' -w start >/tmp/pg-start.log
  trap 'pg_ctl -D /tmp/pgdata -m immediate -w stop >/tmp/pg-stop.log 2>&1' EXIT
  export HELMUT_TEST_PG_HOST=127.0.0.1 HELMUT_TEST_PG_PORT=5433 HELMUT_TEST_PG_USER=helmut
  export PGPASSWORD=helmut HELMUT_TEST_POSTGREST_BIN=/opt/helmut-dev/postgrest
  node scripts/lokal.js scripts/lage-quellen-rest-datenbank-test.js
  ;;
*) exit 64 ;;
esac
'''


def image(deadline):
    refresh_identity(deadline)
    current = json.loads(read_root(BASE/'private/CURRENT.SAFE.json'))
    path = workspace(current)
    existing = BASE/'private/IMAGE.SAFE.json'
    if existing.exists():
        result = json.loads(read_root(existing))
        need(result['package_lock_sha256'] == current['package_lock_sha256'], 'DEVELOPMENT_IMAGE_ALREADY_BOUND')
        need((result.get('uid'), result.get('gid')) == identity_ids(), 'DEVELOPMENT_IDENTITY_BINDING')
        return result
    capacity(BUILD_BUFFER)
    build = BASE/'build'; build.mkdir(mode=0o711); build.chmod(0o711)
    layer = build/'layer'; layer.mkdir(mode=0o755); layer.chmod(0o755)
    dependencies = layer/'dependencies'; dependencies.mkdir(mode=0o700); os.chown(dependencies, UID, GID)
    for name in ('package.json', 'package-lock.json'):
        raw = git(['show', current['source_commit']+':'+name], deadline, path, sealed=True)
        if name == 'package-lock.json': need(lockfile(raw) == current['package_lock_sha256'], 'DEVELOPMENT_LOCK_CHANGED')
        fd = os.open(dependencies/name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
        try:
            os.write(fd, raw); os.fchown(fd, UID, GID); os.fchmod(fd, 0o644)
        finally: os.close(fd)
    cache = BASE/'npm-cache'; cache.mkdir(mode=0o700); os.chown(cache, UID, GID)
    node = BASE/'toolchain/node'
    run([str(node/'bin/node'), str(node/'lib/node_modules/npm/bin/npm-cli.js'), 'ci', '--ignore-scripts',
         '--audit=false', '--fund=false', '--strict-ssl=true', '--registry=https://registry.npmjs.org',
         '--userconfig='+str(BASE/'toolchain/npm-userconfig'), '--globalconfig='+str(BASE/'toolchain/npm-globalconfig'),
         '--cache='+str(cache)], deadline,
        user=UID, cwd=dependencies, extra_env={'PATH': str(node/'bin')+':/usr/bin:/bin', 'HOME': str(cache)})
    need(digest((dependencies/'package-lock.json').read_bytes()) == current['package_lock_sha256'], 'DEVELOPMENT_NPM_LOCK_CHANGED')
    os.chmod(dependencies, 0o755)
    # Same bookworm image supplies the server, clients, ICU and extension libs.
    # No cross-distribution PostgreSQL library copying and no runtime apt calls.
    run(['/bin/cp', '-a', str(node), str(layer/'node')], deadline)
    run(['/bin/cp', str(BASE/'toolchain/postgrest'), str(layer/'postgrest')], deadline)
    write_new(layer/'entrypoint', entrypoint_source(), 0o755)
    write_new(layer/'package-lock.sha256', (current['package_lock_sha256']+'\n').encode(), 0o644)
    write_new(build/'Dockerfile', dockerfile_source(), 0o644)
    docker(['pull', '--platform=linux/amd64', POSTGRES], deadline)
    tag = 'helmut-development:'+current['package_lock_sha256']
    docker(['build', '--network=none', '--pull=false', '--tag', tag, str(build)], deadline, cap=4*1024**2)
    identity = docker(['image', 'inspect', '--format={{.Id}}', tag], deadline).strip().decode()
    need(re.fullmatch('sha256:[a-f0-9]{64}', identity), 'DEVELOPMENT_IMAGE_ID')
    result = {'schema': 'helmut-development-image-v1', 'image_id': identity,
              'package_lock_sha256': current['package_lock_sha256'], 'node_version': NODE_VERSION,
              'postgres_base': POSTGRES, 'postgrest_version': '12.2.3', 'uid': UID, 'gid': GID}
    write_new(existing, encoded(result))
    return result


def dockerfile_source():
    uid, gid = identity_ids()
    pair = str(uid)+':'+str(gid)
    return ('FROM '+POSTGRES+'\nRUN groupadd --gid '+str(gid)+' helmut-development && '
            'useradd --uid '+str(uid)+' --gid '+str(gid)+' --no-create-home --home-dir /tmp/home '
            '--shell /usr/sbin/nologin helmut-development\n'
            'COPY --chown='+pair+' layer/ /opt/helmut-dev/\nUSER '+pair+'\n'
            'WORKDIR /workspace\nENTRYPOINT ["/opt/helmut-dev/entrypoint"]\n').encode()


def entrypoint_source():
    uid, gid = identity_ids()
    return ENTRYPOINT.replace('@UID@', str(uid)).replace('@GID@', str(gid)).encode()


def task_arguments(task, current, image_receipt, nonce):
    uid, gid = identity_ids()
    need(task in PHASES['test'] and hex_string(nonce, 64), 'DEVELOPMENT_TASK')
    identity = image_receipt['image_id']
    need(re.fullmatch('sha256:[a-f0-9]{64}', identity) is not None, 'DEVELOPMENT_IMAGE_ID')
    need(current['package_lock_sha256'] == image_receipt['package_lock_sha256'], 'DEVELOPMENT_TASK_LOCK')
    need((image_receipt.get('uid'), image_receipt.get('gid')) == (uid, gid), 'DEVELOPMENT_IDENTITY_BINDING')
    path = workspace(current)
    return ['run', '--name=helmut-development-'+nonce, '--network=none', '--user='+str(uid)+':'+str(gid),
            '--cap-drop=ALL', '--security-opt=no-new-privileges', '--read-only', '--pids-limit=256',
            '--memory=2g', '--cpus=2', '--tmpfs=/tmp:rw,nosuid,nodev,size=512m,uid='+str(uid)+',gid='+str(gid)+',mode=1770',
            '--mount=type=bind,src='+str(path)+',dst=/workspace', '--workdir=/workspace',
            '--entrypoint=/usr/bin/env', identity, '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C',
            '/opt/helmut-dev/entrypoint', task]


def test_output(task, output):
    need(b'SKIP' not in output, 'DEVELOPMENT_TEST_INCOMPLETE')
    if task == 'syntax':
        need(re.search(rb'^PASS [0-9]+  FAIL 0  \(gesamt [0-9]+\)$', output, re.M) is not None,
             'DEVELOPMENT_TEST_INCOMPLETE')
    else:
        need(task == 'lage-rest' and b'REST_ERGEBNIS: erfolgreich, 15/15 Gruppen und Bereinigung bestaetigt\n' in output,
             'DEVELOPMENT_TEST_INCOMPLETE')


def coordinate(request, context, capsule):
    global ACTIVE_NONCE, TOOL_INDEX, UID, GID, ACTIVE_IDENTITY
    need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0, 'DEVELOPMENT_ROOT_REQUIRED')
    check_capsule(capsule, context['source_sha256'], int(time.time()))
    need(request['nonce'] == digest(PREFIX+encoded(capsule))
         and request['operation'] == 'admit', 'DEVELOPMENT_REQUEST')
    deadline = context['deadline']
    result = {'schema': 'helmut-development-result-v1', 'status': 'FAIL_KEEP_STATE_NO_RETRY',
              'action': capsule['action'], 'phase': capsule['phase'], 'source_commit': capsule['source_commit'],
              'source_sha256': context['source_sha256'], 'request_nonce': request['nonce'], 'code': None,
              'receipt_sha256': None, 'diagnostic': None, 'native_qualified': False, 'native_go_consumed': False}
    result['identity'] = None
    ACTIVE_NONCE, TOOL_INDEX, UID, GID, ACTIVE_IDENTITY = request['nonce'], 0, None, None, None
    # The existing root control request is already serialized by its protected
    # workflow; flock also covers other correctly authenticated CI dispatches.
    lock = os.open('/run/helmut-development-20261026.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        item = os.fstat(lock)
        need(stat.S_ISREG(item.st_mode) and item.st_uid == item.st_gid == 0 and item.st_nlink == 1, 'DEVELOPMENT_LOCK')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        action, phase = capsule['action'], capsule['phase']
        if not (action == 'prepare' and phase == 'tools'):
            tools_identity(deadline)
        if action == 'prepare' and phase == 'tools': facts = tools(deadline)
        elif phase == 'source': facts = source_sync(capsule, deadline)
        elif action == 'prepare' and phase == 'image': facts = image(deadline)
        else:
            current = json.loads(read_root(BASE/'private/CURRENT.SAFE.json'))
            need(current['source_commit'] == capsule['source_commit'], 'DEVELOPMENT_TASK_SOURCE')
            active_image = json.loads(read_root(BASE/'private/IMAGE.SAFE.json'))
            output = docker(task_arguments(phase, current, active_image, request['nonce']), deadline, cap=4*1024**2)
            test_output(phase, output)
            facts = {'schema': 'helmut-development-test-v1', 'task': phase,
                     'source_commit': current['source_commit'], 'package_lock_sha256': current['package_lock_sha256'],
                     'image_id': active_image['image_id'], 'stdout_sha256': digest(output),
                     'network': 'none', 'uid': UID, 'gid': GID, 'exit_code': 0}
        facts['identity'] = dict(ACTIVE_IDENTITY)
        result.update(status='DEVELOPMENT_STEP_COMPLETE', code='DEVELOPMENT_STEP_COMPLETE',
                      receipt_sha256=digest(encoded(facts)), identity=dict(ACTIVE_IDENTITY))
        write_new(BASE/'private/requests'/(request['nonce']+'.SAFE.json'), encoded({'result': result, 'facts': facts}))
    except Exception as error:
        result['identity'] = None if ACTIVE_IDENTITY is None else dict(ACTIVE_IDENTITY)
        result['code'] = error.code if isinstance(error, Stop) else 'DEVELOPMENT_SETUP_OR_TEST_FAILED'
        diagnostic = getattr(error, 'diagnostic', {})
        result['diagnostic'] = {'tool': Path(diagnostic.get('executable', '')).name or None,
            'exit_code': diagnostic.get('returncode'), 'errno': getattr(error, 'errno', None),
            'stdout_sha256': diagnostic.get('stdout_sha256'), 'stderr_sha256': diagnostic.get('stderr_sha256'),
            'retained_tool_count': TOOL_INDEX}
        if (BASE/'private/requests').is_dir():
            try: write_new(BASE/'private/requests'/(request['nonce']+'.FIRST_ERROR.SAFE.json'), encoded(result))
            except Exception: pass
            if hasattr(error, 'diagnostic'):
                try: write_new(BASE/'private/requests'/(request['nonce']+'.TOOL_ERROR.PRIVATE.json'), encoded(error.diagnostic))
                except Exception: pass
    finally: os.close(lock)
    return result


if __name__ == '__main__':
    print('{"status":"NOT_EXECUTED_QUALIFIED_CONTROLLER_REQUIRED"}')
