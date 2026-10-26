"""Fixed, read-only observation of the retained DAEMON_SERVICE_BINDING failure.

No wire selectors, namespace entry, unit lifecycle calls or Docker mutations.
An observation is diagnostic evidence and never setup or execution authority.
"""
import hashlib
import json
import math
import os
import re
import stat
import time

CONTRACT_ID = 'daemon-binding-observation-20261026-v1'
SCHEMA = 'helmut-native-daemon-binding-observation-v1'
BASE = '/opt/helmut-native-test/automation-20261026'
CONTEXT_BASE = '/opt/helmut-native-test/docker28-context-20261026'
SERVICE = 'helmut-native-docker28.service'
SOCKET = CONTEXT_BASE + '/run/docker.sock'
EXECUTABLE = CONTEXT_BASE + '/bin/dockerd'
UNIT_FILE = '/etc/systemd/system/' + SERVICE
UNIT_CGROUP = '/system.slice/' + SERVICE
READER_SHA256 = 'edcc93c55404685d3637abb096589f90c02ec1fce2a0e75b54dc53003b269046'
COMPONENT_ERROR_SHA256 = '24124f28a62c92b0cc373f70e35b6926cf06f8df13f5fede02770a74a66fe33b'
JOB_ERROR_SHA256 = '97ddf7c9c97a700d90a3b4a419ba7125849ffa251c33a8655446a84d91909a18'
CONFIG = {'schema': 'helmut-native-daemon-binding-contract-v1', 'contract_id': CONTRACT_ID,
    'metadata_reader_sha256': READER_SHA256,
    'metadata_contract_sha256': 'b85cecc106ab2e2a40d19f02c8caa412e6e6e3f86c6ee4c5bfa18fbe712a2caf',
    'component_error_sha256': COMPONENT_ERROR_SHA256, 'job_error_sha256': JOB_ERROR_SHA256,
    'failure_code': 'DAEMON_SERVICE_BINDING', 'service': SERVICE, 'socket': SOCKET,
    'unit_file': UNIT_FILE, 'comm': 'dockerd\n', 'executable': EXECUTABLE,
    'cgroup': '0::' + UNIT_CGROUP + '/daemon\n',
    'command_timeout_seconds': 5, 'command_output_limit': 4096,
    'executable_limit': 268435456, 'unit_file_limit': 65536, 'output_limit': 32768,
    'read_only': True, 'native_qualified': False, 'native_go_consumed': False}
R = os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_NONBLOCK | os.O_CLOEXEC
QUERY = ['/usr/bin/systemctl', 'show', SERVICE, '--no-pager',
         '--property=Id,ActiveState,SubState,MainPID,ControlGroup']


class Stop(Exception):
    @property
    def code(self): return self.args[0]


def need(value, code):
    if not value: raise Stop(code)


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True,
                       allow_nan=False) + '\n').encode('ascii')


def sha(raw): return hashlib.sha256(raw).hexdigest()
def hex64(value): return type(value) is str and re.fullmatch('[a-f0-9]{64}', value) is not None


def bounded(deadline):
    need(type(deadline) in (int, float) and math.isfinite(deadline)
         and 0 < deadline - time.monotonic() <= 300, 'DAEMON_BINDING_DEADLINE')


def record(raw, info, reader):
    return {'sha256': sha(raw), 'bytes': len(raw), 'metadata': reader['metadata'](info)}


def proc_read(root, name, limit, deadline, reader):
    bounded(deadline)
    fd = os.open(name, R, dir_fd=root)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0,
             'DAEMON_BINDING_PROC_OWNER')
        raw = bytearray()
        while True:
            bounded(deadline)
            block = os.read(fd, min(65536, limit + 1 - len(raw)))
            if not block: break
            raw.extend(block)
            need(len(raw) <= limit, 'DAEMON_BINDING_PROC_LIMIT')
        need(reader['metadata'](before) == reader['metadata'](os.fstat(fd)), 'DAEMON_BINDING_PROC_DRIFT')
        return bytes(raw), record(bytes(raw), before, reader)
    finally: os.close(fd)


def executable_record(root, deadline, reader):
    # Deliberately follow only the fixed kernel /proc/<held-pid>/exe link.
    bounded(deadline)
    fd = os.open('exe', os.O_RDONLY | os.O_NOATIME | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=root)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0
             and before.st_nlink == 1 and not stat.S_IMODE(before.st_mode) & 0o022
             and stat.S_IMODE(before.st_mode) & 0o111 and 0 < before.st_size <= CONFIG['executable_limit'],
             'DAEMON_BINDING_EXECUTABLE_IDENTITY')
        digest, total = hashlib.sha256(), 0
        while True:
            bounded(deadline)
            block = os.read(fd, min(65536, CONFIG['executable_limit'] + 1 - total))
            if not block: break
            total += len(block); digest.update(block)
            need(total <= CONFIG['executable_limit'], 'DAEMON_BINDING_EXECUTABLE_LIMIT')
        need(total == before.st_size and reader['metadata'](os.fstat(fd)) == reader['metadata'](before),
             'DAEMON_BINDING_EXECUTABLE_DRIFT')
        return {'sha256': digest.hexdigest(), 'bytes': total, 'metadata': reader['metadata'](before)}
    finally: os.close(fd)


def unit_file_record(deadline, reader):
    bounded(deadline)
    root, name, _ = reader['trusted_parent'](UNIT_FILE)
    fd = None
    try:
        try: fd = os.open(name, R, dir_fd=root)
        except FileNotFoundError:
            # Positive missing fixed leaf; never infer an empty unit configuration.
            try: os.stat(name, dir_fd=root, follow_symlinks=False)
            except FileNotFoundError:
                return {'state': 'UNKNOWN_MISSING', 'sha256': None, 'bytes': None, 'metadata': None}
            raise Stop('DAEMON_BINDING_UNIT_FILE_DRIFT')
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0
             and before.st_nlink == 1 and not stat.S_IMODE(before.st_mode) & 0o022
             and 0 < before.st_size <= CONFIG['unit_file_limit'], 'DAEMON_BINDING_UNIT_FILE_IDENTITY')
        raw = bytearray()
        while True:
            bounded(deadline)
            block = os.read(fd, min(65536, CONFIG['unit_file_limit'] + 1 - len(raw)))
            if not block: break
            raw.extend(block)
            need(len(raw) <= CONFIG['unit_file_limit'], 'DAEMON_BINDING_UNIT_FILE_LIMIT')
        need(len(raw) == before.st_size and reader['metadata'](before) == reader['metadata'](os.fstat(fd))
             == reader['metadata'](os.stat(name, dir_fd=root, follow_symlinks=False)),
             'DAEMON_BINDING_UNIT_FILE_DRIFT')
        return {'state': 'PRESENT', **record(bytes(raw), before, reader)}
    finally:
        if fd is not None: os.close(fd)
        os.close(root)


def unit_snapshot(guard, deadline):
    bounded(deadline)
    raw = guard['command'](QUERY.copy(), deadline, timeout=5)
    need(type(raw) is bytes and 0 < len(raw) <= 4096, 'DAEMON_BINDING_UNIT_LIMIT')
    fields = {}
    for line in raw.decode('ascii').splitlines():
        key, sep, value = line.partition('=')
        need(sep and key not in fields, 'DAEMON_BINDING_UNIT_FORMAT')
        fields[key] = value
    need(set(fields) == {'Id', 'ActiveState', 'SubState', 'MainPID', 'ControlGroup'}
         and fields['Id'] == SERVICE and fields['ActiveState'] == 'active' and fields['SubState'] == 'running'
         and re.fullmatch('[1-9][0-9]{0,9}', fields['MainPID'])
         and 1 < int(fields['MainPID']) < 2**31 and fields['ControlGroup'] == UNIT_CGROUP,
         'DAEMON_BINDING_UNIT_IDENTITY')
    return fields


def namespace_record(root, ctx):
    fd = os.open('ns/mnt', os.O_RDONLY | os.O_CLOEXEC, dir_fd=root)
    try: return ctx['namespace_identity'](fd)
    finally: os.close(fd)


def cgroup_membership(cgroup_raw, pid, deadline, reader, ctx):
    root = ctx['directory']('/sys/fs/cgroup')
    try: need(ctx['filesystem'](root)[0] == 0x63677270, 'DAEMON_BINDING_CGROUP2')
    finally: os.close(root)
    known = {('0::' + UNIT_CGROUP + '\n').encode(): ('UNIT_ROOT', '/sys/fs/cgroup' + UNIT_CGROUP),
             ('0::' + UNIT_CGROUP + '/daemon\n').encode(): ('DAEMON_CHILD', '/sys/fs/cgroup' + UNIT_CGROUP + '/daemon')}
    need(re.fullmatch(rb'0::/[^\x00\r\n]*\n', cgroup_raw) is not None, 'DAEMON_BINDING_CGROUP_FORMAT')
    if cgroup_raw not in known: return 'OTHER', False
    kind, path = known[cgroup_raw]
    root = ctx['directory'](path)
    try:
        need(ctx['filesystem'](root)[0] == 0x63677270, 'DAEMON_BINDING_CGROUP2')
        raw, _ = proc_read(root, 'cgroup.procs', 65536, deadline, reader)
        rows = raw.splitlines()
        need(all(re.fullmatch(rb'[1-9][0-9]*', row) for row in rows)
             and str(pid).encode() in rows, 'DAEMON_BINDING_CGROUP_MEMBERSHIP')
    finally: os.close(root)
    return kind, True


def process_snapshot(root, pid, deadline, reader, qualified):
    ctx, guard = qualified['context.py'], qualified['guard.py']
    status, _ = proc_read(root, 'status', 65536, deadline, reader)
    fields = {}
    for line in status.decode('ascii').splitlines():
        key, sep, value = line.partition(':')
        need(sep and key not in fields, 'DAEMON_BINDING_STATUS_FORMAT'); fields[key] = value
    need(fields.get('Uid', '').split() == fields.get('Gid', '').split() == ['0'] * 4,
         'DAEMON_BINDING_PROCESS_OWNER')
    raw, _ = proc_read(root, 'stat', 16384, deadline, reader)
    text = raw.decode('ascii'); tail = text.rsplit(')', 1)[1].split()
    need(text.startswith(str(pid) + ' (') and len(tail) > 19 and tail[0] in ('R','S','D','T','t','K','W','P','I')
         and tail[19].isdigit() and int(tail[19]) > 0, 'DAEMON_BINDING_PROCESS_BIRTH')
    comm, comm_record = proc_read(root, 'comm', 64, deadline, reader)
    cgroup, cgroup_record = proc_read(root, 'cgroup', 4096, deadline, reader)
    link_before = os.stat('exe', dir_fd=root, follow_symlinks=False)
    need(stat.S_ISLNK(link_before.st_mode) and link_before.st_uid == link_before.st_gid == 0,
         'DAEMON_BINDING_EXE_LINK')
    link = os.fsencode(os.readlink('exe', dir_fd=root))
    need(0 < len(link) <= 4096 and reader['metadata'](link_before)
         == reader['metadata'](os.stat('exe', dir_fd=root, follow_symlinks=False)), 'DAEMON_BINDING_EXE_DRIFT')
    ns = namespace_record(root, ctx)
    pid1 = ctx['directory']('/proc/1')
    try: host_ns = namespace_record(pid1, ctx)
    finally: os.close(pid1)
    mountinfo, _ = proc_read(root, 'mountinfo', 262144, deadline, reader)
    private = ctx['private_propagation'](mountinfo.decode('ascii'), required=False)
    kind, member = cgroup_membership(cgroup, pid, deadline, reader, ctx)
    process = {'pid': pid, 'start_ticks': int(tail[19]), 'namespace': ns, 'pid1_namespace': host_ns,
               'proc_directory_metadata': reader['metadata'](os.fstat(root))}
    return {'process': process, 'boot_id': guard['boot_id'](), 'private_namespace': ns != host_ns,
        'private_propagation': private, 'comm_matches': comm == b'dockerd\n',
        'exe_matches': link == EXECUTABLE.encode(), 'cgroup_matches': cgroup == CONFIG['cgroup'].encode(),
        'cgroup_kind': kind, 'cgroup_membership_verified': member,
        'comm': comm_record, 'exe_link': record(link, link_before, reader), 'cgroup': cgroup_record}


def retained_baseline(reader, qualified, deadline):
    config = reader['validate_config'](qualified)
    need(reader['CONTRACT_SHA256'] == CONFIG['metadata_contract_sha256'], 'DAEMON_BINDING_READER_CONTRACT')
    baseline = reader['verify_setup_baseline'](config, qualified, deadline)
    proof, diagnostic = baseline['partial_setup_proof'], baseline['failure_diagnostic']
    records = diagnostic['records']; component, job = records['component_error'], records['job_error']
    need(proof['accepted_phases'] == ['recover', 'checkout'] and proof['failed_phase'] == 'context'
         and proof['native_qualified'] is False and proof['native_go_consumed'] is False
         and diagnostic['native_qualified'] is False and diagnostic['native_go_consumed'] is False
         and component['state'] == job['state'] == 'PRESENT'
         and component['sha256'] == COMPONENT_ERROR_SHA256 and job['sha256'] == JOB_ERROR_SHA256
         and component['code'] == job['code'] == 'DAEMON_SERVICE_BINDING'
         and component['phase'] == 'preflight' and component['anchor_attempt_count'] == 0
         and component['anchor_created_count'] == 0
         and all(records[key]['state'] == 'ABSENT' for key in
                 ('component_attempt', 'component_receipt_pending', 'component_receipt')),
         'DAEMON_BINDING_RETAINED_FAILURE')
    return baseline


def response(context, code=None, baseline=None, observation=None):
    return {'schema': SCHEMA, 'status': 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED' if code
            else 'DAEMON_BINDING_OBSERVED_NOT_READY', 'contract_id': CONTRACT_ID,
        'contract_sha256': CONTRACT_SHA256,
        'source_sha256': context.get('source_sha256') if type(context) is dict and hex64(context.get('source_sha256')) else None,
        'code': code, 'partial_setup_proof': baseline['partial_setup_proof'] if baseline else None,
        'failure_diagnostic': baseline['failure_diagnostic'] if baseline else None,
        'observation': observation, 'native_qualified': False, 'native_go_consumed': False}


def observe_daemon_binding(context, metadata_reader, qualified):
    root = pidfd = nsfd = None
    try:
        need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0, 'DAEMON_BINDING_ROOT_REQUIRED')
        need(type(context) is dict and set(context) == {'base', 'source_sha256', 'deployment_commit', 'deadline'}
             and context['base'] == BASE and hex64(context['source_sha256'])
             and type(context['deployment_commit']) is str and re.fullmatch('[a-f0-9]{40}', context['deployment_commit']),
             'DAEMON_BINDING_CONTEXT')
        deadline = context['deadline']; bounded(deadline)
        need(sha(encoded(CONFIG)) == CONTRACT_SHA256 and type(metadata_reader) is dict
             and type(metadata_reader.get('__source_bytes__')) is bytes
             and sha(metadata_reader['__source_bytes__']) == READER_SHA256, 'DAEMON_BINDING_SOURCE_PIN')
        reader, guard, ctx = metadata_reader, qualified['guard.py'], qualified['context.py']
        baseline = retained_baseline(reader, qualified, deadline)
        fields = unit_snapshot(guard, deadline); pid = int(fields['MainPID'])
        peer, socket_binding = ctx['socket_facts']()
        need(peer == pid, 'DAEMON_BINDING_SOCKET_PID')
        root = ctx['directory']('/proc/' + str(pid))
        need(ctx['filesystem'](root)[0] == 0x9fa0, 'DAEMON_BINDING_PROCFS')
        pidfd = os.pidfd_open(pid, 0)
        need(not guard['exited'](pidfd), 'DAEMON_BINDING_PROCESS_EXITED')
        nsfd = os.open('ns/mnt', os.O_RDONLY | os.O_CLOEXEC, dir_fd=root)
        held_namespace = ctx['namespace_identity'](nsfd)
        before = process_snapshot(root, pid, deadline, reader, qualified)
        need(before['process']['namespace'] == held_namespace, 'DAEMON_BINDING_NAMESPACE_DRIFT')
        binary = executable_record(root, deadline, reader)
        unit_file = unit_file_record(deadline, reader)
        after = process_snapshot(root, pid, deadline, reader, qualified)
        need(after == before and ctx['namespace_identity'](nsfd) == held_namespace
             and not guard['exited'](pidfd) and unit_snapshot(guard, deadline) == fields
             and ctx['socket_facts']() == (peer, socket_binding)
             and executable_record(root, deadline, reader) == binary
             and unit_file_record(deadline, reader) == unit_file
             and retained_baseline(reader, qualified, deadline) == baseline, 'DAEMON_BINDING_DRIFT')
        bounded(deadline)
        observation = {key: value for key, value in before.items() if key not in ('process', 'boot_id')}
        observation.update(unit_active_running=True, socket_peer_bound=True, process_root_owned=True,
            process_alive=True, cgroup2_verified=True, boot_id_sha256=sha(before['boot_id'].encode('ascii')),
            process_binding_sha256=sha(encoded(before['process'])), proc_binding_sha256=sha(encoded(before)),
            executable=binary, unit_file=unit_file, exec_hooks_state='UNKNOWN_NOT_QUERIED')
        result = response(context, baseline=baseline, observation=observation)
        need(len(encoded(result)) <= CONFIG['output_limit'], 'DAEMON_BINDING_OUTPUT_LIMIT')
        return result
    except BaseException as error:
        code = getattr(error, 'code', None)
        if type(code) is not str or re.fullmatch('[A-Z][A-Z0-9_]{0,63}', code) is None:
            code = 'DAEMON_BINDING_IO_OR_FORMAT'
        return response(context, code=code)
    finally:
        for fd in (nsfd, pidfd, root):
            if fd is not None: os.close(fd)


CONTRACT_SHA256 = sha(encoded(CONFIG))


if __name__ == '__main__':
    print('{"status":"NOT_EXECUTED_COMPONENT_ONLY"}')
    raise SystemExit(2)
