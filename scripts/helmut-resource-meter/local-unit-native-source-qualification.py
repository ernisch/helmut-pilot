"""Observe the actual UID1000 source service; never start or admit a unit.

Only the pinned source worker/controller may copy this observation into the
root-owned bootstrap. JSON from a caller is not a substitute for this observer.
The controller must independently bind container ID, PID namespace, mounts and
the shared cgroup, and must observe real process/pipe ends after stopping it.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat


class SourceQualificationError(RuntimeError):
    pass


def need(ok, code):
    if not ok:
        raise SourceQualificationError('native-source-qualification-' + code)


def identity(value):
    return tuple(getattr(value, key) for key in ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid',
                                               'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns'))


def file_pin(pin, *, private=False, content=False):
    need(type(pin) is dict and set(pin) == {'path', 'bytes', 'sha256'}
         and type(pin['path']) is str and type(pin['bytes']) is int
         and 0 < pin['bytes'] <= (4 * 1024**2 if content else 256 * 1024**2)
         and type(pin['sha256']) is str and re.fullmatch('[a-f0-9]{64}', pin['sha256']), 'file-pin')
    path = Path(pin['path'])
    need(path.is_absolute() and str(path) == pin['path'] and path.resolve() == path, 'canonical-file')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size == pin['bytes']
             and (not private or before.st_uid == 1000 and stat.S_IMODE(before.st_mode) == 0o600), 'file-metadata')
        h, blocks, total = hashlib.sha256(), [], 0
        while block := os.read(fd, min(pin['bytes'], 65536)):
            total += len(block)
            need(total <= pin['bytes'], 'file-grew')
            h.update(block)
            if content:
                blocks.append(block)
        need(total == pin['bytes'] and h.hexdigest() == pin['sha256']
             and identity(before) == identity(os.fstat(fd)) == identity(path.lstat()), 'file-drift')
        return identity(before), b''.join(blocks) if content else None
    finally:
        os.close(fd)


def unique_json(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            need(key not in result, 'duplicate-json')
            result[key] = value
        return result
    return json.loads(raw.decode('utf8', errors='strict'), object_pairs_hook=unique)


def process_identity(pid):
    need(type(pid) is int and pid > 0, 'pid')
    root = Path('/proc') / str(pid)
    row = (root / 'stat').read_text()
    end = row.rfind(')')
    fields = row[end + 2:].split()
    need(end > 0 and row.split(' ', 1)[0] == str(pid) and len(fields) >= 20
         and fields[0] not in ('Z', 'X') and fields[1].isdigit() and fields[19].isdigit(), 'live-process')
    status = (root / 'status').read_text()
    for label in ('Uid', 'Gid'):
        match = re.search(r'^' + label + r':\s+([0-9\t ]+)$', status, re.M)
        need(match and match[1].split() == ['1000'] * 4, 'process-user')
    for label in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'):
        need(re.search(r'^' + label + r':\s*0+\s*$', status, re.M), 'process-capabilities')
    need(re.search(r'^NoNewPrivs:\s*1\s*$', status, re.M), 'process-no-new-privileges')
    return {'pid': pid, 'parentPID': int(fields[1]), 'startTicks': fields[19],
            'exe': os.readlink(root / 'exe'), 'membership': (root / 'cgroup').read_text(),
            'pidNamespace': os.readlink(root / 'ns/pid')}


def node_budget(value):
    need(type(value) is dict and set(value) == {'nodeVersion', 'execArgv', 'oldSpaceMiB', 'semiSpaceMiB', 'heapSizeLimitBytes'}
         and value['nodeVersion'] == 'v24.19.0'
         and value['execArgv'] == ['--max-old-space-size=384', '--max-semi-space-size=16']
         and value['oldSpaceMiB'] == 384 and value['semiSpaceMiB'] == 16
         and type(value['heapSizeLimitBytes']) is int
         and 384 * 1024**2 <= value['heapSizeLimitBytes'] <= 448 * 1024**2, 'actual-node-budget')


class SourceServiceObserver:
    """Pins the real child once, then checks immutable identities cheaply.

    Rehashing a 126MB executable every 500ms would itself change the measured
    workload. Read-only mounts plus dev/inode/ctime/mode/size checks detect drift;
    the separate native runtime observation still rechecks its complete closure.
    """
    def __init__(self, child, ready, config_pin, node_pin, container_id, group):
        need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 1000, 'source-user')
        need(type(container_id) is str and re.fullmatch('[a-f0-9]{64}', container_id), 'container-id')
        need(type(group) is dict and set(group) == {'path', 'device', 'inode', 'procMembership'}
             and group['path'] == '/owned-group' and group['procMembership'] == '0::/\n', 'group-shape')
        self.child, self.group = child, dict(group)
        need(child.poll() is None and type(ready) is dict
             and ready.get('schema') == 'helmut-local-unit-original-service-ready/1'
             and ready.get('pid') == child.pid and ready.get('configPin') == config_pin
             and ready.get('databaseConnectionObserved') is False
             and ready.get('configuredInitialDatabaseRole') == 'postgres'
             and ready.get('unitExecutionQualified') is False and ready.get('full500Qualified') is False, 'actual-ready')
        node_budget(ready.get('nodeBudget'))
        self.pins = []
        config_stat, raw = file_pin(config_pin, private=True, content=True)
        config = unique_json(raw)
        need(config.get('schema') == 'helmut-local-unit-original-service/1'
             and re.fullmatch('localUnitDiagnostic-[a-f0-9]{32}', config.get('operationId', ''))
             and re.fullmatch('[a-f0-9]{64}', config.get('commandHash', ''))
             and config.get('database') == 'helmut_unit_diagnostic_' + config['operationId'][-32:]
             and ready.get('database') == config['database'] and ready.get('commandHash') == config['commandHash']
             and config.get('measuredCgroup') == group
             and type(config.get('secretHex')) is str and re.fullmatch('[a-f0-9]{64}', config['secretHex']), 'service-scope')
        self.pins.append((config_pin['path'], config_stat))
        for pin in (node_pin, config['servicePin'], config['transactionCodePin'], config['psqlPin'], config['postgres']['exePin']):
            observed, _ = file_pin(pin)
            self.pins.append((pin['path'], observed))
        self.supervisor = process_identity(os.getpid())
        self.service = process_identity(child.pid)
        self.postgres = process_identity(config['postgres']['pid'])
        need(self.service['parentPID'] == self.supervisor['pid']
             and self.service['pidNamespace'] == self.supervisor['pidNamespace'] == self.postgres['pidNamespace']
             and self.service['membership'] == self.supervisor['membership'] == self.postgres['membership'] == group['procMembership']
             and self.service['startTicks'] == ready.get('startTicks') and self.service['exe'] == ready.get('exe') == node_pin['path']
             and self.postgres['startTicks'] == config['postgres']['startTicks']
             and self.postgres['exe'] == config['postgres']['exePin']['path'], 'actual-process-binding')
        args = Path('/proc', str(child.pid), 'cmdline').read_bytes().split(b'\0')
        need(args == [node_pin['path'].encode(), b'--max-old-space-size=384', b'--max-semi-space-size=16',
                      config['servicePin']['path'].encode(), b'--serve-original-writes', b''], 'closed-service-command')
        self.socket = Path('/ram/helmut-original-write-bridge.sock')
        s = self.socket.lstat()
        need(stat.S_ISSOCK(s.st_mode) and s.st_uid == 1000 and stat.S_IMODE(s.st_mode) == 0o666, 'actual-owner-socket')
        self.socket_identity = identity(s)
        # The actual listener must belong to the observed UID1000 service, not
        # merely exist at a familiar pathname.
        rows = [line.split() for line in Path('/proc/net/unix').read_text().splitlines()[1:]]
        listeners = [r for r in rows if len(r) == 8 and r[7] == str(self.socket) and r[3] == '00010000' and r[4] == '0001']
        need(len(listeners) == 1, 'actual-unix-listener')
        self.listener_inode = listeners[0][6]
        self.binding = {'schema': 'helmut-local-unit-original-source-binding/1', 'operationId': config['operationId'],
                        'commandHash': config['commandHash'], 'database': config['database'], 'socketPath': str(self.socket),
                        'containerId': container_id, 'pidNamespace': self.service['pidNamespace'],
                        'supervisor': {'uid': 1000, 'pid': self.supervisor['pid'], 'startTicks': self.supervisor['startTicks']},
                        'service': {'uid': 1000, 'pid': child.pid, 'startTicks': self.service['startTicks'],
                                    'exePin': node_pin, 'codePin': config['servicePin'], 'configPin': config_pin, 'nodeBudget': ready['nodeBudget']},
                        'measuredCgroup': {key: group[key] for key in ('device', 'inode', 'procMembership')},
                        'hmacKeySHA256': hashlib.sha256(bytes.fromhex(config['secretHex'])).hexdigest()}
        self.expires_at = config['expiresAtUTC']
        self.check()

    def check(self):
        need(self.child.poll() is None, 'service-exited')
        for before in (self.service, self.supervisor, self.postgres):
            need(process_identity(before['pid']) == before, 'process-drift')
        for name, observed in self.pins:
            need(identity(Path(name).lstat()) == observed and Path(name).resolve() == Path(name), 'pinned-file-drift')
        group = Path(self.group['path'])
        s = group.lstat()
        need(stat.S_ISDIR(s.st_mode) and (s.st_dev, s.st_ino) == (self.group['device'], self.group['inode'])
             and (group / 'memory.max').read_text().strip() == '1547997184'
             and (group / 'memory.high').read_text().strip() == '1399996416'
             and (group / 'memory.swap.max').read_text().strip() == '0', 'native-group-drift')
        need(identity(self.socket.lstat()) == self.socket_identity, 'socket-drift')
        owned = set()
        for fd in Path('/proc', str(self.child.pid), 'fd').iterdir():
            try:
                owned.add(os.readlink(fd))
            except FileNotFoundError:
                continue
        need('socket:[' + self.listener_inode + ']' in owned, 'listener-not-owned')

    def qualification(self):
        self.check()
        now = datetime.datetime.now(datetime.timezone.utc)
        expires = datetime.datetime.fromisoformat(self.expires_at.replace('Z', '+00:00'))
        need(now < expires <= now + datetime.timedelta(seconds=180), 'service-expired')
        return {'schema': 'helmut-local-unit-source-supervisor-qualification/1',
                'operationId': self.binding['operationId'], 'commandHash': self.binding['commandHash'],
                'database': self.binding['database'], 'issuedAtUTC': now.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                'expiresAtUTC': self.expires_at, 'publicSourceBinding': self.binding}
