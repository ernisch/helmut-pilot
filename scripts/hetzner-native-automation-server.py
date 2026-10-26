"""One-shot root-only recipient setup; no import-time I/O or default executor.

execute_tool(path, args, input=None, timeout=...) must use no shell and a clean
fixed subprocess env (no inherited loader variables), cap BOTH output streams
at MAX_TOOL_OUTPUT while reading, and return an object
with integer returncode and bytes stdout/stderr. On timeout/overflow it must
terminate only its own child and raise. Do not log its input or raw output.
The GPG environment is additionally cleared by the fixed /usr/bin/env -i prefix.
This module never reads, exports, deletes, or changes existing private keys.
The installer must bind this source and its executor before invoking it.
"""
import base64
import hashlib
import json
import os
import re
import stat
import time

TARGET_BASE = '/opt/helmut-native-test/automation-20261026'
USER_ID = 'Helmut Hetzner PR942 Automation'
MAX_TOOL_OUTPUT = 65536
HOME_NAME = 'recipient.private'
PUBLIC_NAME = 'recipient.public.asc'
ATTEMPT_NAME = 'RECIPIENT_ATTEMPT.SAFE.json'
RESULT_NAME = 'RECIPIENT.SAFE.json'
ERROR_NAME = 'RECIPIENT_FIRST_ERROR.SAFE.json'
_DFLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME | os.O_CLOEXEC
_WFLAGS = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC


class _Stop(Exception):
    def __init__(self, code):
        self.code = code


def _require(condition, code):
    if not condition:
        raise _Stop(code)


def _owned(metadata):
    return metadata.st_uid == 0 and metadata.st_gid == 0


def _dir(metadata, exact=False):
    _require(stat.S_ISDIR(metadata.st_mode) and _owned(metadata), 'DIRECTORY_OWNER_OR_TYPE')
    permissions = stat.S_IMODE(metadata.st_mode)
    _require(permissions == 0o700 if exact else permissions & 0o022 == 0,
             'DIRECTORY_PERMISSIONS')


def _open_base(target_base):
    """Descend without following links or updating directory access times."""
    descriptor = os.open('/', _DFLAGS)
    try:
        _dir(os.fstat(descriptor))
        for component in target_base.strip('/').split('/'):
            child = os.open(component, _DFLAGS, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
            _dir(os.fstat(descriptor))
        _dir(os.fstat(descriptor), exact=True)
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _write_new(directory, name, data):
    _require(type(data) is bytes and len(data) <= MAX_TOOL_OUTPUT, 'FILE_SIZE_OR_TYPE')
    descriptor = os.open(name, _WFLAGS, 0o600, dir_fd=directory)
    try:
        info = os.fstat(descriptor)
        _require(stat.S_ISREG(info.st_mode) and _owned(info)
                 and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1,
                 'NEW_FILE_METADATA')
        offset = 0
        while offset < len(data):
            count = os.write(descriptor, data[offset:])
            _require(count > 0, 'FILE_WRITE_SHORT')
            offset += count
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.fsync(directory)


def _json_new(directory, name, value):
    _write_new(directory, name,
               (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode('ascii'))


def _missing(directory, name):
    try:
        os.stat(name, dir_fd=directory, follow_symlinks=False)
    except FileNotFoundError:
        return True
    return False


def _check_pinned(base_fd, home_fd):
    current = _open_base(TARGET_BASE)
    try:
        before, after = os.fstat(base_fd), os.fstat(current)
        _require((before.st_dev, before.st_ino) == (after.st_dev, after.st_ino),
                 'BASE_IDENTITY_CHANGED')
        info = os.stat(HOME_NAME, dir_fd=current, follow_symlinks=False)
        _dir(info, exact=True)
        pinned = os.fstat(home_fd)
        _require((info.st_dev, info.st_ino) == (pinned.st_dev, pinned.st_ino),
                 'HOME_IDENTITY_CHANGED')
    finally:
        os.close(current)


def _run(execute_tool, home, arguments, input_data=None, timeout=30):
    # No caller-supplied process argument or environment reaches the executor.
    arguments = ('-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C', '/usr/bin/gpg',
                 '--no-options', '--homedir', home, '--batch', '--no-tty',
                 '--no-auto-key-retrieve', '--auto-key-locate', 'clear',
                 '--no-auto-check-trustdb') + tuple(arguments)
    try:
        result = execute_tool('/usr/bin/env', arguments, input=input_data, timeout=timeout)
    except Exception:
        raise _Stop('TOOL_EXECUTION_FAILED') from None
    _require(type(getattr(result, 'returncode', None)) is int
             and type(getattr(result, 'stdout', None)) is bytes
             and type(getattr(result, 'stderr', None)) is bytes, 'TOOL_RESULT_TYPE')
    _require(len(result.stdout) <= MAX_TOOL_OUTPUT and len(result.stderr) <= MAX_TOOL_OUTPUT,
             'TOOL_OUTPUT_LIMIT')
    _require(result.returncode == 0, 'TOOL_EXIT_NONZERO')
    return result.stdout


def _status_fingerprint(data, kind):
    try:
        value = data.decode('ascii')
    except UnicodeError:
        raise _Stop('KEY_STATUS_INVALID') from None
    matches = re.findall(r'^\[GNUPG:\] KEY_CREATED ([A-Z]) ([0-9A-F]{40})$',
                         value, re.MULTILINE)
    _require(len(matches) == 1 and matches[0][0] == kind, 'KEY_STATUS_INVALID')
    return matches[0][1]


def _parse_listing(data, primary, subkey, started):
    try:
        lines = data.decode('ascii').splitlines()
    except UnicodeError:
        raise _Stop('PUBLIC_LIST_INVALID') from None
    rows = [line.split(':') for line in lines]
    _require(all(row and row[0] in ('tru', 'pub', 'fpr', 'uid', 'sub') for row in rows),
             'PUBLIC_LIST_INVALID')
    rows = [row for row in rows if row[0] != 'tru']
    _require([row[0] for row in rows] == ['pub', 'fpr', 'uid', 'sub', 'fpr'],
             'PUBLIC_LIST_SHAPE')
    pub, pfpr, uid, sub, sfpr = rows
    _require(all(len(row) > 16 for row in (pub, sub))
             and len(uid) > 9 and len(pfpr) > 9 and len(sfpr) > 9,
             'PUBLIC_LIST_FIELDS')
    _require(pfpr[9] == primary and sfpr[9] == subkey and primary != subkey,
             'PUBLIC_FINGERPRINT_MISMATCH')
    _require(pub[1] == 'u' and sub[1] == 'u' and uid[1] == 'u'
             and uid[9] == USER_ID, 'PUBLIC_IDENTITY_OR_VALIDITY')
    _require(pub[2:4] == ['255', '22'] and pub[16] == 'ed25519'
             and sub[2:4] == ['255', '18'] and sub[16] == 'cv25519',
             'PUBLIC_ALGORITHM_MISMATCH')
    _require(''.join(c for c in pub[11] if c.islower()) == 'c'
             and ''.join(c for c in sub[11] if c.islower()) == 'e'
             and pub[4] == primary[-16:] and sub[4] == subkey[-16:],
             'PUBLIC_USAGE_MISMATCH')
    expiries = []
    now = int(time.time())
    for row in (pub, sub):
        _require(re.fullmatch(r'[0-9]{1,12}', row[5]) is not None
                 and re.fullmatch(r'[0-9]{1,12}', row[6]) is not None,
                 'PUBLIC_EXPIRY_INVALID')
        created, expires = int(row[5]), int(row[6])
        _require(started - 5 <= created <= now + 5 and expires - created == 7 * 86400
                 and expires > now, 'PUBLIC_EXPIRY_INVALID')
        expiries.append(expires)
    return expiries


def _public_armor(data):
    begin = b'-----BEGIN PGP PUBLIC KEY BLOCK-----\n'
    end = b'-----END PGP PUBLIC KEY BLOCK-----\n'
    _require(data.startswith(begin) and data.endswith(end)
             and data.count(begin) == 1 and data.count(end) == 1
             and b'PRIVATE KEY' not in data and b'SECRET KEY' not in data,
             'PUBLIC_ARMOR_INVALID')
    try:
        text = data.decode('ascii')
        _require('\x00' not in text and '\r' not in text, 'PUBLIC_ARMOR_INVALID')
        contents = text[len(begin):-len(end)]
        headers, separator, body = contents.partition('\n')
        # GnuPG's fixed export has no configurable armor headers (--no-options).
        _require(headers == '' and separator == '\n', 'PUBLIC_ARMOR_INVALID')
        lines = body.splitlines()
        _require(bool(lines), 'PUBLIC_ARMOR_INVALID')
        if lines[-1].startswith('='):
            _require(re.fullmatch(r'=[A-Za-z0-9+/]{4}', lines[-1]) is not None,
                     'PUBLIC_ARMOR_INVALID')
            lines.pop()
        payload = base64.b64decode(''.join(lines), validate=True)
        _require(bool(payload), 'PUBLIC_ARMOR_INVALID')
    except (UnicodeError, ValueError):
        raise _Stop('PUBLIC_ARMOR_INVALID') from None


def _audit_home(home_fd):
    """Read directory entries and metadata only, never private file contents."""
    total = [0]
    private_count = [0]

    def visit(descriptor, depth, private=False):
        _require(depth <= 3, 'PRIVATE_TREE_DEPTH')
        _dir(os.fstat(descriptor), exact=True)
        for name in sorted(os.listdir(descriptor)):
            total[0] += 1
            _require(total[0] <= 128, 'PRIVATE_TREE_LIMIT')
            info = os.stat(name, dir_fd=descriptor, follow_symlinks=False)
            _require(_owned(info), 'PRIVATE_OWNER')
            mode = stat.S_IMODE(info.st_mode)
            if stat.S_ISDIR(info.st_mode):
                child = os.open(name, _DFLAGS, dir_fd=descriptor)
                try:
                    check = os.fstat(child)
                    _require((check.st_dev, check.st_ino) == (info.st_dev, info.st_ino),
                             'PRIVATE_DIRECTORY_CHANGED')
                    visit(child, depth + 1, depth == 0 and name == 'private-keys-v1.d')
                finally:
                    os.close(child)
            elif stat.S_ISREG(info.st_mode):
                _require(mode == 0o600 and info.st_nlink == 1, 'PRIVATE_FILE_PERMISSIONS')
                if private:
                    _require(re.fullmatch(r'[0-9A-F]{40}\.key', name) is not None
                             and 0 < info.st_size <= MAX_TOOL_OUTPUT, 'PRIVATE_KEY_METADATA')
                    private_count[0] += 1
            else:
                _require(stat.S_ISSOCK(info.st_mode) and mode & 0o077 == 0 and not private,
                         'PRIVATE_SPECIAL_FILE')
        if private:
            _require(private_count[0] == 2, 'PRIVATE_KEY_COUNT')

    visit(home_fd, 0)
    _require(private_count[0] == 2, 'PRIVATE_KEY_COUNT')


def create_recipient(target_base, execute_tool):
    """Return SAFE JSON-compatible data; retain every partial file on failure.

    Only the exact fixed root base is accepted. The attempt marker prevents a
    second generation attempt, including after failure. Existing artifacts are
    never read or overwritten. The first error is recorded once when possible.
    No cleanup, key deletion, private export, or host-wide agent command exists.
    """
    result = {'schema': 'helmut-recipient-v1', 'ok': False, 'phase': 'preflight',
              'target_base': TARGET_BASE, 'private_material_exported': False,
              'first_error_recorded': False}
    base_fd = home_fd = None
    attempt_started = False
    previous_umask = None
    try:
        _require(type(target_base) is str and target_base == TARGET_BASE, 'TARGET_BASE_REJECTED')
        _require(os.geteuid() == 0 and os.getegid() == 0, 'ROOT_REQUIRED')
        _require(callable(execute_tool), 'EXECUTOR_REQUIRED')
        base_fd = _open_base(target_base)
        for name in (ATTEMPT_NAME, HOME_NAME, PUBLIC_NAME, RESULT_NAME, ERROR_NAME):
            _require(_missing(base_fd, name), 'RECIPIENT_ALREADY_ATTEMPTED')
        previous_umask = os.umask(0o077)
        result['phase'] = 'attempt'
        attempt_started = True
        _json_new(base_fd, ATTEMPT_NAME, {'schema': result['schema'], 'operation': 'create-once'})
        result['phase'] = 'home'
        os.mkdir(HOME_NAME, 0o700, dir_fd=base_fd)
        home_fd = os.open(HOME_NAME, _DFLAGS, dir_fd=base_fd)
        _dir(os.fstat(home_fd), exact=True)
        home = TARGET_BASE + '/' + HOME_NAME
        started = int(time.time())
        result['phase'] = 'generate'
        _check_pinned(base_fd, home_fd)
        primary = _status_fingerprint(_run(execute_tool, home, (
            '--pinentry-mode', 'loopback', '--passphrase-fd', '0', '--status-fd', '1',
            '--quick-generate-key', USER_ID, 'ed25519', 'cert', '7d'), b'\n', 90), 'P')
        result['primary_fingerprint'] = primary
        result['phase'] = 'add-subkey'
        _check_pinned(base_fd, home_fd)
        subkey = _status_fingerprint(_run(execute_tool, home, (
            '--pinentry-mode', 'loopback', '--passphrase-fd', '0', '--status-fd', '1',
            '--quick-add-key', primary, 'cv25519', 'encr', '7d'), b'\n', 90), 'S')
        result['subkey_fingerprint'] = subkey
        result['phase'] = 'verify-public'
        _check_pinned(base_fd, home_fd)
        listing = _run(execute_tool, home, (
            '--with-colons', '--fixed-list-mode', '--with-fingerprint',
            '--with-subkey-fingerprint', '--list-keys', '--', primary))
        expiries = _parse_listing(listing, primary, subkey, started)
        result['phase'] = 'export-public'
        _check_pinned(base_fd, home_fd)
        public = _run(execute_tool, home, ('--armor', '--export', '--', primary))
        _public_armor(public)
        result['phase'] = 'verify-private-metadata'
        _check_pinned(base_fd, home_fd)
        _audit_home(home_fd)
        result['phase'] = 'write-public'
        _write_new(base_fd, PUBLIC_NAME, public)
        result.update({'phase': 'write-result',
                       'recipient_home': home,
                       'public_key_path': TARGET_BASE + '/' + PUBLIC_NAME,
                       'public_key_sha256': hashlib.sha256(public).hexdigest(),
                       'public_key_bytes': len(public), 'user_id': USER_ID,
                       'primary_algorithm': 'ed25519', 'primary_usage': 'cert',
                       'subkey_algorithm': 'cv25519', 'subkey_usage': 'encr',
                       'primary_expires_unix': expiries[0], 'subkey_expires_unix': expiries[1],
                       'validity_days': 7})
        success = dict(result, ok=True, phase='complete')
        _json_new(base_fd, RESULT_NAME, success)
        return success
    except Exception as error:
        code = error.code if isinstance(error, _Stop) else 'FILESYSTEM_OR_INTERNAL_FAILURE'
        result['ok'] = False
        result['first_error'] = {'phase': result['phase'], 'code': code}
        if attempt_started:
            try:
                result['first_error_recorded'] = True
                _json_new(base_fd, ERROR_NAME, result)
            except Exception:
                result['first_error_recorded'] = False  # Keep original failure.
        return result
    finally:
        if home_fd is not None:
            os.close(home_fd)
        if base_fd is not None:
            os.close(base_fd)
        if previous_umask is not None:
            os.umask(previous_umask)

# Deployment module: no import-time I/O; all source is covered by one module hash.
import selectors
import subprocess
import signal
import types
import ctypes
import resource
import io
import select
NATIVE_GO_PLAN_SHA256 = None
_CONTROL_DEADLINE = None
_TOOL_ERROR_NAME = 'GPG_FIRST_TOOL_ERROR.PRIVATE.json'
_IN_STAGE_CHILD = False

def _first_tool_error(output,code):
    descriptor=None
    try:
        descriptor=_open_base(TARGET_BASE)
        record={'code':code,'stdout_sha256':hashlib.sha256(output[0]).hexdigest(),
                'stderr_sha256':hashlib.sha256(output[1]).hexdigest(),
                'stderr_prefix_base64':base64.b64encode(bytes(output[1][:8192])).decode('ascii')}
        _require(_TOOL_ERROR_NAME in ('GPG_FIRST_TOOL_ERROR.PRIVATE.json',
            'GPG_RECOVERY_FIRST_TOOL_ERROR.PRIVATE.json',
            'GPG_STAGE_FIRST_TOOL_ERROR.PRIVATE.json'), 'EXECUTOR_COMMAND')
        _json_new(descriptor,_TOOL_ERROR_NAME,record)
    except Exception:pass
    finally:
        if descriptor is not None:os.close(descriptor)

def _bounded_tool(path,args,input=None,timeout=30,file_limit=None):
    _require(path == '/usr/bin/env' and tuple(args[:5]) == ('-i','PATH=/usr/bin:/bin','LC_ALL=C','/usr/bin/gpg','--no-options'), 'EXECUTOR_COMMAND')
    _require(file_limit is None or (_IN_STAGE_CHILD and type(file_limit) is int and 0 < file_limit <= 3*1024**3), 'EXECUTOR_COMMAND')
    def limits():
        resource.setrlimit(resource.RLIMIT_FSIZE,(file_limit,file_limit))
    process=subprocess.Popen([path,*args],stdin=subprocess.PIPE if input is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C'},
        cwd=TARGET_BASE,start_new_session=not _IN_STAGE_CHILD,close_fds=True,
        preexec_fn=limits if file_limit is not None else None)
    output=[bytearray(),bytearray()];selector=selectors.DefaultSelector();end=time.monotonic()+timeout
    if _CONTROL_DEADLINE is not None:end=min(end,_CONTROL_DEADLINE)
    try:
        offset=0
        if input is not None:
            if input:
                os.set_blocking(process.stdin.fileno(),False)
                selector.register(process.stdin,selectors.EVENT_WRITE,2)
            else:process.stdin.close()
        for i,pipe in enumerate((process.stdout,process.stderr)):
            os.set_blocking(pipe.fileno(),False);selector.register(pipe,selectors.EVENT_READ,i)
        while selector.get_map():
            _require(time.monotonic()<end,'TOOL_TIMEOUT')
            for key,_ in selector.select(min(.25,max(0,end-time.monotonic()))):
                if key.data==2:
                    count=os.write(process.stdin.fileno(),input[offset:offset+4096])
                    _require(count>0,'TOOL_INPUT_WRITE')
                    offset+=count
                    if offset==len(input):
                        selector.unregister(process.stdin);process.stdin.close()
                    continue
                block=os.read(key.fileobj.fileno(),4096)
                if not block:selector.unregister(key.fileobj);continue
                output[key.data].extend(block)
                _require(len(output[key.data])<=MAX_TOOL_OUTPUT,'TOOL_OUTPUT_LIMIT')
        _require(time.monotonic()<end,'TOOL_TIMEOUT')
        code=process.wait(timeout=max(.01,end-time.monotonic()))
        if code!=0:_first_tool_error(output,'EXIT_'+str(code))
        return types.SimpleNamespace(returncode=code,stdout=bytes(output[0]),stderr=bytes(output[1]))
    except BaseException as error:
        _first_tool_error(output,getattr(error,'code','TOOL_EXECUTION_FAILURE'))
        try:
            if _IN_STAGE_CHILD:process.kill()
            else:os.killpg(process.pid,signal.SIGKILL)
        except OSError:pass
        try:process.wait(timeout=5)
        except Exception:pass
        raise
    finally:
        selector.close()
        if process.stdin is not None and not process.stdin.closed:process.stdin.close()
        for pipe in (process.stdout,process.stderr):pipe.close()

def _read_public_file(path,limit=65536):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NOATIME)
    try:
        before=os.fstat(fd)
        _require(stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==0 and before.st_nlink==1
                 and stat.S_IMODE(before.st_mode)==0o600,'RECIPIENT_FILE_IDENTITY')
        with os.fdopen(os.dup(fd),'rb') as stream:value=stream.read(limit+1)
        _require(len(value)<=limit and before==os.fstat(fd),'RECIPIENT_FILE_CHANGED')
        return value
    finally:os.close(fd)

DIAGNOSTIC_PHASES = ('preflight', 'attempt', 'home', 'generate', 'add-subkey',
    'verify-public', 'export-public', 'verify-private-metadata', 'write-public', 'write-result',
    'recovery-preflight', 'recovery-public-before', 'recovery-trust-refresh',
    'recovery-public-after', 'recovery-public-export', 'recovery-private-metadata',
    'recovery-write-public', 'recovery-write-result')
DIAGNOSTIC_CODES = ('BASE_IDENTITY_CHANGED', 'DIRECTORY_OWNER_OR_TYPE',
    'DIRECTORY_PERMISSIONS', 'EXECUTOR_REQUIRED', 'FILESYSTEM_OR_INTERNAL_FAILURE',
    'FILE_SIZE_OR_TYPE', 'FILE_WRITE_SHORT', 'HOME_IDENTITY_CHANGED', 'KEY_STATUS_INVALID',
    'NEW_FILE_METADATA', 'PRIVATE_DIRECTORY_CHANGED', 'PRIVATE_FILE_PERMISSIONS',
    'PRIVATE_KEY_COUNT', 'PRIVATE_KEY_METADATA', 'PRIVATE_OWNER', 'PRIVATE_SPECIAL_FILE',
    'PRIVATE_TREE_DEPTH', 'PRIVATE_TREE_LIMIT', 'PUBLIC_ALGORITHM_MISMATCH',
    'PUBLIC_ARMOR_INVALID', 'PUBLIC_EXPIRY_INVALID', 'PUBLIC_FINGERPRINT_MISMATCH',
    'PUBLIC_IDENTITY_OR_VALIDITY', 'PUBLIC_LIST_FIELDS', 'PUBLIC_LIST_INVALID',
    'PUBLIC_LIST_SHAPE', 'PUBLIC_USAGE_MISMATCH', 'RECIPIENT_ALREADY_ATTEMPTED',
    'ROOT_REQUIRED', 'TARGET_BASE_REJECTED', 'TOOL_EXECUTION_FAILED', 'TOOL_EXIT_NONZERO',
    'TOOL_OUTPUT_LIMIT', 'TOOL_RESULT_TYPE', 'RECOVERY_ORIGINAL_BINDING',
    'RECOVERY_ALREADY_ATTEMPTED', 'RECOVERY_CACHE_NOT_PROVEN',
    'RECOVERY_KEY_METADATA_CHANGED', 'RECOVERY_PUBLIC_RING_CHANGED')
DIAGNOSTIC_TOOL_CLASSES = ('AGENT_CONNECTION', 'AGENT_GENERATION', 'PERMISSION_DENIED',
    'MISSING_FILE', 'PINENTRY', 'UNSUPPORTED_OPTION', 'UNSUPPORTED_ALGORITHM', 'UNCLASSIFIED')


def _project_recipient_error(record):
    _require(type(record) is dict and record.get('schema') == 'helmut-recipient-v1'
             and record.get('ok') is False and record.get('private_material_exported') is False,
             'DIAGNOSTIC_FORMAT')
    error = record.get('first_error')
    _require(type(error) is dict and set(error) == {'phase', 'code'}
             and type(error['phase']) is str and error['phase'] in DIAGNOSTIC_PHASES
             and type(error['code']) is str and error['code'] in DIAGNOSTIC_CODES,
             'DIAGNOSTIC_FORMAT')
    return {'phase': error['phase'], 'code': error['code']}


def _project_gpg_error(record):
    _require(type(record) is dict and set(record) == {
        'code', 'stdout_sha256', 'stderr_sha256', 'stderr_prefix_base64'}, 'DIAGNOSTIC_FORMAT')
    code = record['code']
    _require(type(code) is str, 'DIAGNOSTIC_FORMAT')
    number = re.fullmatch(r'EXIT_(-?[0-9]{1,3})', code)
    _require(code in ('TOOL_TIMEOUT', 'TOOL_OUTPUT_LIMIT', 'TOOL_EXECUTION_FAILURE')
             or number is not None and -64 <= int(number[1]) <= 255, 'DIAGNOSTIC_FORMAT')
    _require(all(type(record[key]) is str and re.fullmatch(r'[a-f0-9]{64}', record[key])
                 for key in ('stdout_sha256', 'stderr_sha256')), 'DIAGNOSTIC_FORMAT')
    encoded = record['stderr_prefix_base64']
    _require(type(encoded) is str and len(encoded) <= 10924, 'DIAGNOSTIC_FORMAT')
    prefix = base64.b64decode(encoded, validate=True)
    _require(len(prefix) <= 8192, 'DIAGNOSTIC_FORMAT')
    # Only fixed classifications leave the server. Never return raw tool text,
    # encoded text, paths, user IDs, private key data, or arbitrary exception strings.
    lowered = prefix.lower()
    matches = {
        'AGENT_CONNECTION': (b"can't connect to the agent", b"can't connect to the gpg-agent", b'failed to start agent'),
        'AGENT_GENERATION': (b'agent_genkey failed',),
        'PERMISSION_DENIED': (b'permission denied',),
        'MISSING_FILE': (b'no such file or directory',),
        'PINENTRY': (b'no pinentry', b'inappropriate ioctl for device', b'pinentry failed'),
        'UNSUPPORTED_OPTION': (b'invalid option', b'unknown option'),
        'UNSUPPORTED_ALGORITHM': (b'unsupported algorithm', b'unknown elliptic curve',),
    }
    classes = sorted(name for name, needles in matches.items()
                     if any(needle in lowered for needle in needles))
    return {'code': code, 'stderr_classes': classes or ['UNCLASSIFIED']}


def _diagnostic_file(name, project, gpg=False):
    # Only these two already-written first-error records may be observed. Reading
    # one does not adopt a recipient, run GPG, generate another key, or retry.
    _require(name in (ERROR_NAME, 'GPG_FIRST_TOOL_ERROR.PRIVATE.json',
        'RECIPIENT_RECOVERY_FIRST_ERROR.SAFE.json', 'GPG_RECOVERY_FIRST_TOOL_ERROR.PRIVATE.json'),
        'DIAGNOSTIC_PATH')
    result = {'state': 'ABSENT', 'sha256': None, 'code': None}
    result.update({'stderr_classes': []} if gpg else {'phase': None})
    try:
        raw = _read_public_file(TARGET_BASE + '/' + name, MAX_TOOL_OUTPUT)
    except FileNotFoundError:
        return result
    except Exception:
        return dict(result, state='UNTRUSTED')
    result.update(state='UNRECOGNIZED', sha256=hashlib.sha256(raw).hexdigest())
    try:
        def unique(pairs):
            value = {}
            for key, item in pairs:
                _require(key not in value, 'DIAGNOSTIC_FORMAT')
                value[key] = item
            return value
        record = json.loads(raw.decode('ascii'), object_pairs_hook=unique)
        fields = project(record)
    except Exception:
        return result
    return dict(result, state='OBSERVED', **fields)


def _recipient_diagnostic():
    recovery = any(os.path.lexists(TARGET_BASE + '/' + name) for name in
        ('RECIPIENT_RECOVERY_FIRST_ERROR.SAFE.json', 'GPG_RECOVERY_FIRST_TOOL_ERROR.PRIVATE.json'))
    return {'recipient': _diagnostic_file('RECIPIENT_RECOVERY_FIRST_ERROR.SAFE.json' if recovery
                else ERROR_NAME, _project_recipient_error),
            'gpg': _diagnostic_file('GPG_RECOVERY_FIRST_TOOL_ERROR.PRIVATE.json' if recovery
                else 'GPG_FIRST_TOOL_ERROR.PRIVATE.json', _project_gpg_error, True)}


# Exact observed target failure. A different failure is not an authority to
# repair trust, adopt keys, or start another key-generation attempt.
RECOVERY_ORIGINAL_ERROR_SHA256 = '7d168d7defda650d313e152bd1b015b13becc24c9827eb411de775d6a6beae50'
RECOVERY_ATTEMPT = 'RECIPIENT_RECOVERY_ATTEMPT.SAFE.json'
RECOVERY_RECEIPT = 'RECIPIENT_RECOVERY_RECEIPT.SAFE.json'
RECOVERY_ERROR = 'RECIPIENT_RECOVERY_FIRST_ERROR.SAFE.json'
RECOVERY_PENDING_RESULT = 'RECIPIENT_RECOVERY_RESULT.PENDING.SAFE.json'


def _publish_recovery_result(base_fd):
    # The candidate file and receipt are already fsynced. Publish atomically
    # without replacing any entry. No fallible write follows this commit.
    library = ctypes.CDLL(None, use_errno=True)
    rename = library.renameat2
    rename.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
    rename.restype = ctypes.c_int
    if rename(base_fd, RECOVERY_PENDING_RESULT.encode('ascii'), base_fd,
              RESULT_NAME.encode('ascii'), 1) != 0:  # Linux RENAME_NOREPLACE
        raise OSError(ctypes.get_errno(), 'atomic-publication-failed')


def _recovery_tool(path, args, input=None, timeout=30):
    global _TOOL_ERROR_NAME
    previous = _TOOL_ERROR_NAME
    _TOOL_ERROR_NAME = 'GPG_RECOVERY_FIRST_TOOL_ERROR.PRIVATE.json'
    try:
        return _bounded_tool(path, args, input=input, timeout=timeout)
    finally:
        _TOOL_ERROR_NAME = previous


def _recovery_read(name):
    path = TARGET_BASE + '/' + name
    before = os.stat(path, follow_symlinks=False)
    raw = _read_public_file(path)
    _require(before == os.stat(path, follow_symlinks=False), 'RECOVERY_ORIGINAL_BINDING')
    return raw, before


def _private_key_metadata(home_fd):
    descriptor = os.open('private-keys-v1.d', _DFLAGS, dir_fd=home_fd)
    try:
        _dir(os.fstat(descriptor), exact=True)
        names = sorted(os.listdir(descriptor))
        _require(len(names) == 2, 'PRIVATE_KEY_COUNT')
        result = {}
        for name in names:
            _require(re.fullmatch(r'[0-9A-F]{40}\.key', name) is not None, 'PRIVATE_KEY_METADATA')
            info = os.stat(name, dir_fd=descriptor, follow_symlinks=False)
            _require(stat.S_ISREG(info.st_mode) and _owned(info)
                     and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1
                     and 0 < info.st_size <= MAX_TOOL_OUTPUT, 'PRIVATE_KEY_METADATA')
            result[name] = {key: getattr(info, key) for key in (
                'st_dev', 'st_ino', 'st_mode', 'st_nlink', 'st_uid', 'st_gid', 'st_size',
                'st_atime_ns', 'st_mtime_ns', 'st_ctime_ns', 'st_blocks')}
        return result
    finally:
        os.close(descriptor)


def _recovery_public_facts(raw, primary, subkey, started, original_error_time):
    # This is a precondition for refreshing a local trust cache, never a READY
    # decision. The unmodified full parser must accept the final listing.
    lines = raw.decode('ascii').splitlines()
    rows = [line.split(':') for line in lines]
    _require(all(row and row[0] in ('tru', 'pub', 'fpr', 'uid', 'sub') for row in rows),
             'PUBLIC_LIST_INVALID')
    rows = [row for row in rows if row[0] != 'tru']
    _require([row[0] for row in rows] == ['pub', 'fpr', 'uid', 'sub', 'fpr'], 'PUBLIC_LIST_SHAPE')
    pub, pfpr, uid, sub, sfpr = rows
    _require(all(len(row) > 16 for row in (pub, sub)) and len(uid) > 9
             and len(pfpr) > 9 and len(sfpr) > 9, 'PUBLIC_LIST_FIELDS')
    _require(pfpr[9] == primary and sfpr[9] == subkey and primary != subkey,
             'PUBLIC_FINGERPRINT_MISMATCH')
    _require(uid[9] == USER_ID and pub[8] == 'u', 'PUBLIC_IDENTITY_OR_VALIDITY')
    _require(pub[2:4] == ['255', '22'] and pub[16] == 'ed25519'
             and sub[2:4] == ['255', '18'] and sub[16] == 'cv25519', 'PUBLIC_ALGORITHM_MISMATCH')
    _require(''.join(c for c in pub[11] if c.islower()) == 'c'
             and ''.join(c for c in sub[11] if c.islower()) == 'e'
             and pub[4] == primary[-16:] and sub[4] == subkey[-16:], 'PUBLIC_USAGE_MISMATCH')
    for row in (pub, sub):
        _require(re.fullmatch(r'[0-9]{1,12}', row[5]) is not None
                 and re.fullmatch(r'[0-9]{1,12}', row[6]) is not None, 'PUBLIC_EXPIRY_INVALID')
        created, expires = int(row[5]), int(row[6])
        _require(started - 5 <= created <= original_error_time + 5
                 and created <= time.time() + 5 and expires - created == 7 * 86400
                 and expires > time.time(), 'PUBLIC_EXPIRY_INVALID')
    validity = [pub[1], uid[1], sub[1]]
    _require(all(value in ('u', '-', 'o', 'q') for value in validity), 'RECOVERY_CACHE_NOT_PROVEN')
    return {'validity': validity, 'ownertrust': pub[8], 'identity_matches': True}


def recover_recipient(target_base, execute_tool):
    """One guarded recovery of the existing keypair; never generate/add keys."""
    result = {'schema': 'helmut-recipient-v1', 'ok': False, 'phase': 'recovery-preflight',
              'private_material_exported': False, 'recovery': True}
    base_fd = home_fd = None
    attempt_started = False
    published = False
    try:
        _require(type(target_base) is str and target_base == TARGET_BASE
                 and os.geteuid() == os.getegid() == 0, 'ROOT_REQUIRED')
        _require(callable(execute_tool), 'EXECUTOR_REQUIRED')
        base_fd = _open_base(TARGET_BASE)
        for name in (RECOVERY_ATTEMPT, RECOVERY_RECEIPT, RECOVERY_ERROR, RECOVERY_PENDING_RESULT,
                     'GPG_RECOVERY_FIRST_TOOL_ERROR.PRIVATE.json', PUBLIC_NAME, RESULT_NAME):
            _require(_missing(base_fd, name), 'RECOVERY_ALREADY_ATTEMPTED')
        _json_new(base_fd, RECOVERY_ATTEMPT, {'schema': 'helmut-recipient-recovery-attempt-v1',
            'original_error_sha256': RECOVERY_ORIGINAL_ERROR_SHA256})
        attempt_started = True
        _require(_missing(base_fd, 'GPG_FIRST_TOOL_ERROR.PRIVATE.json'), 'RECOVERY_ORIGINAL_BINDING')
        original_raw, original_meta = _recovery_read(ERROR_NAME)
        _require(hashlib.sha256(original_raw).hexdigest() == RECOVERY_ORIGINAL_ERROR_SHA256,
                 'RECOVERY_ORIGINAL_BINDING')
        original = json.loads(original_raw)
        _require(_project_recipient_error(original) == {
            'phase': 'verify-public', 'code': 'PUBLIC_IDENTITY_OR_VALIDITY'}, 'RECOVERY_ORIGINAL_BINDING')
        primary, subkey = original.get('primary_fingerprint'), original.get('subkey_fingerprint')
        _require(all(type(value) is str and re.fullmatch(r'[0-9A-F]{40}', value)
                     for value in (primary, subkey)) and primary != subkey, 'RECOVERY_ORIGINAL_BINDING')
        attempt_raw, attempt_meta = _recovery_read(ATTEMPT_NAME)
        _require(attempt_raw == b'{"operation":"create-once","schema":"helmut-recipient-v1"}\n'
                 and attempt_meta.st_mtime_ns <= original_meta.st_mtime_ns, 'RECOVERY_ORIGINAL_BINDING')
        started, original_error_time = int(attempt_meta.st_mtime), int(original_meta.st_mtime)
        home_fd = os.open(HOME_NAME, _DFLAGS, dir_fd=base_fd)
        _check_pinned(base_fd, home_fd)
        _audit_home(home_fd)
        key_metadata = _private_key_metadata(home_fd)
        ring_raw, ring_meta = _recovery_read(HOME_NAME + '/pubring.kbx')
        ring_sha256 = hashlib.sha256(ring_raw).hexdigest()
        home = TARGET_BASE + '/' + HOME_NAME

        def check_preserved():
            _check_pinned(base_fd, home_fd)
            _audit_home(home_fd)
            _require(_private_key_metadata(home_fd) == key_metadata, 'RECOVERY_KEY_METADATA_CHANGED')
            current_ring, current_meta = _recovery_read(HOME_NAME + '/pubring.kbx')
            fields = ('st_dev', 'st_ino', 'st_mode', 'st_nlink', 'st_uid', 'st_gid',
                      'st_size', 'st_mtime_ns', 'st_ctime_ns', 'st_blocks')
            _require(hashlib.sha256(current_ring).hexdigest() == ring_sha256
                     and all(getattr(current_meta, key) == getattr(ring_meta, key) for key in fields),
                     'RECOVERY_PUBLIC_RING_CHANGED')
            old, old_meta = _recovery_read(ERROR_NAME)
            marker, marker_meta = _recovery_read(ATTEMPT_NAME)
            _require(old == original_raw and old_meta == original_meta
                     and marker == attempt_raw and marker_meta == attempt_meta, 'RECOVERY_ORIGINAL_BINDING')
            _require(_missing(base_fd, 'GPG_FIRST_TOOL_ERROR.PRIVATE.json'), 'RECOVERY_ORIGINAL_BINDING')

        listing_args = ('--no-autostart', '--lock-never', '--with-colons', '--fixed-list-mode',
                        '--with-fingerprint', '--with-subkey-fingerprint', '--list-keys', '--', primary)
        result['phase'] = 'recovery-public-before'
        before = _run(execute_tool, home, listing_args)
        facts_before = _recovery_public_facts(before, primary, subkey, started, original_error_time)
        check_preserved()
        refreshed = facts_before['validity'] != ['u', 'u', 'u']
        if refreshed:
            result['phase'] = 'recovery-trust-refresh'
            _run(execute_tool, home, ('--no-autostart', '--check-trustdb'))
            check_preserved()
        result['phase'] = 'recovery-public-after'
        after = _run(execute_tool, home, listing_args)
        facts_after = _recovery_public_facts(after, primary, subkey, started, original_error_time)
        expiries = _parse_listing(after, primary, subkey, started)
        _require(facts_after['ownertrust'] == facts_before['ownertrust'] == 'u', 'PUBLIC_IDENTITY_OR_VALIDITY')
        check_preserved()
        result['phase'] = 'recovery-public-export'
        public = _run(execute_tool, home, ('--no-autostart', '--lock-never', '--armor', '--export', '--', primary))
        _public_armor(public)
        result['phase'] = 'recovery-private-metadata'
        check_preserved()
        result['phase'] = 'recovery-write-public'
        _write_new(base_fd, PUBLIC_NAME, public)
        check_preserved()
        _require(_read_public_file(TARGET_BASE + '/' + PUBLIC_NAME) == public, 'PUBLIC_ARMOR_INVALID')
        receipt = {'schema': 'helmut-recipient-recovery-receipt-v1', 'ok': True,
            'original_error_sha256': RECOVERY_ORIGINAL_ERROR_SHA256,
            'before': facts_before, 'after': facts_after, 'trust_cache_refreshed': refreshed,
            'private_key_metadata_unchanged': True, 'pubring_sha256': ring_sha256,
            'private_metadata_sha256': hashlib.sha256(json.dumps(key_metadata, sort_keys=True).encode()).hexdigest(),
            'key_generation_attempts': 0, 'subkey_add_attempts': 0,
            'public_sha256': hashlib.sha256(public).hexdigest()}
        result['phase'] = 'recovery-write-result'
        _json_new(base_fd, RECOVERY_RECEIPT, receipt)
        check_preserved()
        receipt_raw = _read_public_file(TARGET_BASE + '/' + RECOVERY_RECEIPT)
        _require(json.loads(receipt_raw) == receipt,
                 'RECOVERY_ORIGINAL_BINDING')
        success = dict(result, ok=True, phase='complete', target_base=TARGET_BASE,
            recipient_home=home, public_key_path=TARGET_BASE + '/' + PUBLIC_NAME,
            primary_fingerprint=primary, subkey_fingerprint=subkey,
            primary_expires_unix=expiries[0], subkey_expires_unix=expiries[1],
            public_key_sha256=hashlib.sha256(public).hexdigest(), public_key_bytes=len(public),
            recovered_from_error_sha256=RECOVERY_ORIGINAL_ERROR_SHA256,
            recovery_receipt_sha256=hashlib.sha256(receipt_raw).hexdigest())
        # A failed candidate fsync cannot leave an apparently valid READY file,
        # even when no further error record can be created (for example ENOSPC).
        _json_new(base_fd, RECOVERY_PENDING_RESULT, success)
        _require(json.loads(_read_public_file(TARGET_BASE + '/' + RECOVERY_PENDING_RESULT)) == success,
                 'RECOVERY_ORIGINAL_BINDING')
        check_preserved()
        _publish_recovery_result(base_fd)
        published = True
        return success
    except Exception as error:
        code = error.code if isinstance(error, _Stop) else 'FILESYSTEM_OR_INTERNAL_FAILURE'
        result['first_error'] = {'phase': result['phase'], 'code': code}
        if base_fd is not None and attempt_started:
            try:
                _json_new(base_fd, RECOVERY_ERROR, result)
            except Exception:
                pass
        return result
    finally:
        for descriptor in (home_fd, base_fd):
            if descriptor is not None:
                try:
                    os.close(descriptor)  # read-only descriptors; no pending data flush
                except OSError:
                    if not published:
                        raise

def _recipient_ready(allow_create):
    # A possibly complete marker from a failed fsync/publication is UNKNOWN,
    # not an accepted key. Never turn that failed recovery into READY on read.
    _require(not any(os.path.lexists(TARGET_BASE+'/'+name)
                     for name in (RECOVERY_ERROR, RECOVERY_PENDING_RESULT)), 'RECIPIENT_NOT_ACCEPTED')
    result_path=TARGET_BASE+'/'+RESULT_NAME
    if not os.path.lexists(result_path):
        _require(allow_create,'RECIPIENT_NOT_ACCEPTED')
        if os.path.lexists(TARGET_BASE+'/'+ERROR_NAME):
            result=recover_recipient(TARGET_BASE,_recovery_tool)
        else:
            result=create_recipient(TARGET_BASE,_bounded_tool)
        _require(result['ok'],'RECIPIENT_CREATION_FAILED')
    result=json.loads(_read_public_file(result_path))
    _require(result.get('ok') is True and result.get('phase')=='complete','RECIPIENT_NOT_ACCEPTED')
    if os.path.lexists(TARGET_BASE+'/'+RECOVERY_ATTEMPT):
        _require(result.get('recovery') is True, 'RECIPIENT_NOT_ACCEPTED')
    public=_read_public_file(TARGET_BASE+'/'+PUBLIC_NAME)
    _public_armor(public)
    _require(hashlib.sha256(public).hexdigest()==result['public_key_sha256'],'RECIPIENT_PUBLIC_HASH')
    _require(result['primary_expires_unix']>time.time() and result['subkey_expires_unix']>time.time(),'RECIPIENT_EXPIRED')
    reply = {'status':'RECIPIENT_READY','recipient':{'fingerprint':result['primary_fingerprint'],
            'public_key_base64':base64.b64encode(public).decode('ascii'),'public_sha256':result['public_key_sha256']}}
    if result.get('recovery') is True:
        _require(result.get('recovered_from_error_sha256') == RECOVERY_ORIGINAL_ERROR_SHA256,
                 'RECOVERY_ORIGINAL_BINDING')
        receipt_raw = _read_public_file(TARGET_BASE+'/'+RECOVERY_RECEIPT)
        receipt = json.loads(receipt_raw)
        _require(receipt.get('schema') == 'helmut-recipient-recovery-receipt-v1'
                 and receipt.get('ok') is True
                 and receipt.get('original_error_sha256') == RECOVERY_ORIGINAL_ERROR_SHA256
                 and receipt.get('public_sha256') == result['public_key_sha256']
                 and hashlib.sha256(receipt_raw).hexdigest() == result.get('recovery_receipt_sha256'),
                 'RECOVERY_ORIGINAL_BINDING')
        reply['recovery'] = {
            'original_error_sha256': RECOVERY_ORIGINAL_ERROR_SHA256,
            'receipt_sha256': hashlib.sha256(receipt_raw).hexdigest(),
            'before_validity': receipt['before']['validity'],
            'after_validity': receipt['after']['validity'],
            'ownertrust': receipt['after']['ownertrust'],
            'identity_matches': receipt['after']['identity_matches'],
            'trust_cache_refreshed': receipt['trust_cache_refreshed'],
            'private_key_metadata_unchanged': receipt['private_key_metadata_unchanged'],
            'pubring_sha256': receipt['pubring_sha256'],
            'public_sha256': receipt['public_sha256'],
            'key_generation_attempts': receipt['key_generation_attempts'],
            'subkey_add_attempts': receipt['subkey_add_attempts']}
    return reply


# STAGE is byte restoration only. Its embedded helper is qualified with this module.
import datetime
import http.client
import ipaddress
import socket
import ssl
import urllib.parse

STAGE_PLAN = 'e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb'
STAGE_SCOPE = '08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd'
STAGE_HOST = 'sdmntprpolandcentral.oaiusercontent.com'
STAGE_HOSTS = frozenset(('sdmntpritalynorth.oaiusercontent.com',
    'sdmntprnortheu.oaiusercontent.com', 'sdmntprpolandcentral.oaiusercontent.com',
    'sdmntprukwest.oaiusercontent.com'))
STAGE_CAPSULE_B64 = 48 * 1024
STAGE_CAPSULE_JSON = 64 * 1024
STAGE_CIPHER_CAP = 1024**3
STAGE_TAR_CAP = 3 * 1024**3
STAGE_ORIGINAL_BYTES = 2865680705
STAGE_ORIGINAL_FILES = 1767
STAGE_FREE_RESERVE = 8 * 1024**3
STAGE_WORK_CAP = 8 * 1024**3
STAGE_MIN_REMAINING = 120
STAGE_RESTORE_SHA256 = 'c77dba4fe7fcbe34b419a668c19d55262af30eeaaad6c43650290e38cf39bd88'
EMBEDDED_STAGE_RESTORE_SOURCE = b'"""Bounded byte restoration into one fresh private tree; no execution authority."""\nimport hashlib as _sr_hashlib\nimport ctypes as _sr_ctypes\nimport json as _sr_json\nimport os as _sr_os\nimport posixpath as _sr_path\nimport re as _sr_re\nimport stat as _sr_stat\nimport sys as _sr_sys\nimport zlib as _sr_zlib\n\n_SR_SCOPE_SHA256 = \'08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd\'\n_SR_FILE_CAP = 1767\n_SR_BYTE_CAP = 2865680705\n_SR_META_CAP = 99\n_SR_STREAM_CAP = 3 * 1024**3\n_SR_SCOPE_CAP = 2 * 1024**2\n_SR_PAX_CAP = 65536\n_SR_FLAGS = (_sr_os.O_RDONLY | _sr_os.O_NOFOLLOW | _sr_os.O_NOATIME |\n             _sr_os.O_NONBLOCK | _sr_os.O_CLOEXEC)\n_SR_DIR = _SR_FLAGS | _sr_os.O_DIRECTORY\n_SR_PATH_DIR = _sr_os.O_PATH | _sr_os.O_DIRECTORY | _sr_os.O_NOFOLLOW | _sr_os.O_CLOEXEC\n\n\nclass _SRStop(Exception):\n    pass\n\n\ndef _sr_need(value, code):\n    if not value:\n        raise _SRStop(code)\n\n\ndef _sr_owned(info):\n    return info.st_uid == info.st_gid == 0\n\n\ndef _sr_admin():\n    _sr_need(_sr_os.getuid() == _sr_os.geteuid() == _sr_os.getgid() == _sr_os.getegid() == 0, \'ROOT_REQUIRED\')\n\n\ndef _sr_pathcheck(path, absolute=False):\n    _sr_need(type(path) is str and bool(path) and len(path.encode(\'utf8\')) <= 4096\n             and not any(ord(c) < 32 or c == \'\\\\\' for c in path), \'PATH_FORMAT\')\n    _sr_need(path.startswith(\'/\') == absolute and _sr_path.normpath(path) == path\n             and \'..\' not in path.split(\'/\') and \'.\' not in path.split(\'/\'), \'PATH_ESCAPE\')\n    return path\n\n\ndef _sr_parent(path):\n    _sr_pathcheck(path, True)\n    descriptor = _sr_os.open(\'/\', _SR_PATH_DIR)\n    readable = None\n    try:\n        for part in path.split(\'/\')[1:-1]:\n            child = _sr_os.open(part, _SR_PATH_DIR, dir_fd=descriptor)\n            _sr_os.close(descriptor)\n            descriptor = child\n            info = _sr_os.fstat(descriptor)\n            _sr_need(_sr_stat.S_ISDIR(info.st_mode) and _sr_owned(info)\n                     and not _sr_stat.S_IMODE(info.st_mode) & 0o022, \'UNTRUSTED_PARENT\')\n        readable = _sr_os.open(\'.\', _SR_DIR, dir_fd=descriptor)\n        _sr_need(_sr_os.fstat(readable) == _sr_os.fstat(descriptor), \'PARENT_CHANGED\')\n        _sr_os.close(descriptor)\n        return readable, path.split(\'/\')[-1]\n    except BaseException:\n        if readable is not None:\n            _sr_os.close(readable)\n        _sr_os.close(descriptor)\n        raise\n\n\ndef _sr_metadata(descriptor, uid, gid, mode):\n    _sr_os.fchown(descriptor, uid, gid)\n    _sr_os.fchmod(descriptor, mode)\n\n\ndef _sr_link_metadata(parent, name, uid, gid):\n    _sr_os.chown(name, uid, gid, dir_fd=parent, follow_symlinks=False)\n\n\ndef _sr_directory(root, parts):\n    descriptor = _sr_os.dup(root)\n    try:\n        for part in parts:\n            created = False\n            try:\n                _sr_os.mkdir(part, 0o755, dir_fd=descriptor)\n                created = True\n            except FileExistsError:\n                pass\n            child = _sr_os.open(part, _SR_DIR, dir_fd=descriptor)\n            if created:\n                _sr_os.fchmod(child, 0o755)\n                _sr_os.fsync(child)\n                _sr_os.fsync(descriptor)\n            _sr_os.close(descriptor)\n            descriptor = child\n            _sr_need(_sr_stat.S_ISDIR(_sr_os.fstat(descriptor).st_mode), \'DESTINATION_DIRECTORY\')\n        return descriptor\n    except BaseException:\n        _sr_os.close(descriptor)\n        raise\n\n\ndef _sr_write(descriptor, data):\n    position = 0\n    while position < len(data):\n        written = _sr_os.write(descriptor, data[position:])\n        _sr_need(written > 0, \'SHORT_WRITE\')\n        position += written\n\n\ndef _sr_new(root, name, data):\n    descriptor = _sr_os.open(name, _sr_os.O_WRONLY | _sr_os.O_CREAT | _sr_os.O_EXCL |\n                             _sr_os.O_NOFOLLOW | _sr_os.O_CLOEXEC, 0o600, dir_fd=root)\n    try:\n        _sr_os.fchmod(descriptor, 0o600)\n        _sr_write(descriptor, data)\n        _sr_os.fsync(descriptor)\n    finally:\n        _sr_os.close(descriptor)\n    _sr_os.fsync(root)\n\n\ndef _sr_json_bytes(value):\n    return _sr_json.dumps(value, sort_keys=True, separators=(\',\', \':\'), ensure_ascii=True).encode(\'ascii\') + b\'\\n\'\n\n\ndef _sr_publish_receipt(root):\n    library = _sr_ctypes.CDLL(None, use_errno=True)\n    rename = library.renameat2\n    rename.argtypes = (_sr_ctypes.c_int, _sr_ctypes.c_char_p, _sr_ctypes.c_int,\n                       _sr_ctypes.c_char_p, _sr_ctypes.c_uint)\n    rename.restype = _sr_ctypes.c_int\n    if rename(root, b\'RESTORE_RECEIPT.PENDING.PRIVATE.json\', root,\n              b\'RESTORE_RECEIPT.PRIVATE.json\', 1) != 0:\n        raise OSError(_sr_ctypes.get_errno(), \'receipt-publication-failed\')\n\n\ndef _sr_json_load(raw):\n    def unique(pairs):\n        result = {}\n        for key, value in pairs:\n            _sr_need(key not in result, \'JSON_DUPLICATE\')\n            result[key] = value\n        return result\n    def constant(value):\n        raise _SRStop(\'JSON_CONSTANT\')\n    return _sr_json.loads(raw, object_pairs_hook=unique, parse_constant=constant)\n\n\nclass _SRGzip:\n    def __init__(self, descriptor):\n        self.fd, self.pending, self.count, self.compressed, self.eof = descriptor, b\'\', 0, 0, False\n        self.decoder = _sr_zlib.decompressobj(31)\n\n    def read(self, size):\n        result = bytearray()\n        while len(result) < size and not self.eof:\n            if self.decoder.eof:\n                _sr_need(not self.decoder.unused_data and not self.pending\n                         and not _sr_os.read(self.fd, 1), \'GZIP_TRAILING_BYTES\')\n                self.eof = True\n                break\n            if not self.pending:\n                self.pending = _sr_os.read(self.fd, 65536)\n                _sr_need(self.pending, \'GZIP_TRUNCATED\')\n                self.compressed += len(self.pending)\n                _sr_need(self.compressed <= _SR_STREAM_CAP, \'GZIP_INPUT_LIMIT\')\n            block = self.decoder.decompress(self.pending, min(size - len(result), 65536))\n            self.pending = self.decoder.unconsumed_tail\n            self.count += len(block)\n            _sr_need(self.count <= _SR_STREAM_CAP, \'TAR_TOTAL_LIMIT\')\n            result.extend(block)\n        return bytes(result)\n\n    def exact(self, size):\n        result = self.read(size)\n        _sr_need(len(result) == size, \'TAR_TRUNCATED\')\n        return result\n\n    def padding(self, size):\n        _sr_need(not any(self.exact((-size) % 512)), \'TAR_NONZERO_PADDING\')\n\n\ndef _sr_number(raw):\n    value = raw.strip(b\'\\0 \')\n    _sr_need(not value or _sr_re.fullmatch(b\'[0-7]+\', value), \'TAR_NUMBER\')\n    return int(value or b\'0\', 8)\n\n\ndef _sr_text(raw):\n    return raw.split(b\'\\0\', 1)[0].decode(\'utf8\')\n\n\ndef _sr_mtime(value):\n    match = _sr_re.fullmatch(r\'(-?)([0-9]{1,12})(?:\\.([0-9]{1,9}))?\', value)\n    _sr_need(match is not None, \'PAX_MTIME\')\n    nanoseconds = int(match[2]) * 10**9 + int((match[3] or \'\').ljust(9, \'0\'))\n    if match[1]:\n        nanoseconds = -nanoseconds\n    _sr_need(-2**63 <= nanoseconds < 2**63, \'PAX_MTIME\')\n    return nanoseconds\n\n\ndef _sr_header(raw):\n    _sr_need(raw[257:265] == b\'ustar\\x0000\', \'TAR_FORMAT\')\n    _sr_need(_sr_number(raw[148:156]) == sum(raw[:148] + b\' \' * 8 + raw[156:]), \'TAR_CHECKSUM\')\n    name, prefix = _sr_text(raw[:100]), _sr_text(raw[345:500])\n    return {\'name\': (prefix + \'/\' if prefix else \'\') + name, \'kind\': raw[156:157],\n            \'mode\': _sr_number(raw[100:108]), \'uid\': _sr_number(raw[108:116]),\n            \'gid\': _sr_number(raw[116:124]), \'size\': _sr_number(raw[124:136]),\n            \'link\': _sr_text(raw[157:257]), \'mtime_ns\': _sr_mtime(str(_sr_number(raw[136:148])))}\n\n\ndef _sr_pax(raw):\n    values, position = {}, 0\n    while position < len(raw):\n        space = raw.find(b\' \', position, position + 12)\n        _sr_need(space > position and _sr_re.fullmatch(b\'[1-9][0-9]*\', raw[position:space]), \'PAX_LENGTH\')\n        length = int(raw[position:space])\n        record = raw[space + 1:position + length]\n        _sr_need(length <= len(raw) - position and record.endswith(b\'\\n\') and b\'=\' in record, \'PAX_RECORD\')\n        key, value = record[:-1].split(b\'=\', 1)\n        _sr_need(key in (b\'path\', b\'mtime\') and key not in values, \'PAX_KEY\')\n        values[key] = value.decode(\'utf8\')\n        if key == b\'path\':\n            # PAX directory paths may carry exactly one terminal slash. Keep\n            # the raw value; the following entry\'s type must authorize it.\n            path = values[key]\n            _sr_pathcheck(path[:-1] if path.endswith(\'/\') else path)\n        else:\n            values[key] = _sr_mtime(values[key])\n        position += length\n    return values\n\n\ndef _sr_scope(raw):\n    _sr_need(_sr_hashlib.sha256(raw).hexdigest() == _SR_SCOPE_SHA256, \'SCOPE_HASH\')\n    scope = _sr_json_load(raw)\n    _sr_need(scope[\'schema\'] == \'helmut-encrypted-transport-scope-v4\'\n             and len(scope[\'items\']) == scope[\'regularFileCount\'] <= _SR_FILE_CAP\n             and len(scope[\'pythonDirectoriesAndLinks\']) <= _SR_META_CAP, \'SCOPE_COUNTS\')\n    selected, total = {}, 0\n    for row in scope[\'items\']:\n        path = _sr_pathcheck(row[\'path\'], True)\n        name = _sr_pathcheck(row[\'archiveMember\'])\n        _sr_need(name == \'files\' + path and name not in selected and type(row[\'bytes\']) is int\n                 and row[\'bytes\'] >= 0 and _sr_re.fullmatch(\'[0-9a-f]{64}\', row[\'sha256\']), \'SCOPE_FILE\')\n        selected[name] = dict(kind=b\'0\', size=row[\'bytes\'], sha256=row[\'sha256\'],\n                              mode=int(row[\'mode\'], 8), uid=row[\'uid\'], gid=row[\'gid\'])\n        total += row[\'bytes\']\n    _sr_need(total == scope[\'regularLogicalBytes\'] <= _SR_BYTE_CAP, \'SCOPE_BYTES\')\n    for row in scope[\'pythonDirectoriesAndLinks\']:\n        name = \'files\' + _sr_pathcheck(row[\'path\'], True)\n        _sr_need(name not in selected and row[\'type\'] in (\'directory\', \'symlink\'), \'SCOPE_METADATA\')\n        info = row[\'statBefore\']\n        record = dict(kind=b\'5\' if row[\'type\'] == \'directory\' else b\'2\', size=0,\n                      mode=_sr_stat.S_IMODE(info[\'st_mode\']), uid=info[\'st_uid\'], gid=info[\'st_gid\'])\n        if \'st_mtime_ns\' in info:\n            _sr_need(type(info[\'st_mtime_ns\']) is int and -2**63 <= info[\'st_mtime_ns\'] < 2**63, \'SCOPE_METADATA\')\n            record[\'mtime_ns\'] = info[\'st_mtime_ns\']\n        if row[\'type\'] == \'symlink\':\n            target = _sr_pathcheck(row[\'target\'])\n            resolved = _sr_path.normpath(_sr_path.join(_sr_path.dirname(name), target))\n            _sr_need(resolved in selected and selected[resolved][\'kind\'] == b\'0\', \'SCOPE_LINK_TARGET\')\n            record[\'link\'] = target\n        selected[name] = record\n    for name, row in selected.items():\n        _sr_need(type(row[\'uid\']) is int and 0 <= row[\'uid\'] < 2**32 - 1\n                 and type(row[\'gid\']) is int and 0 <= row[\'gid\'] < 2**32 - 1\n                 and 0 <= row[\'mode\'] <= 0o777, \'SCOPE_METADATA\')\n        prefix = _sr_path.dirname(name)\n        while prefix:\n            _sr_need(prefix not in selected or selected[prefix][\'kind\'] == b\'5\', \'SCOPE_PARENT_TYPE\')\n            prefix = _sr_path.dirname(prefix)\n    return scope, selected\n\n\ndef restore_bound_archive(gzip_tar_path, fresh_own_output_root):\n    """Restore one pinned archive; retain every partial file and never retry."""\n    _sr_admin()\n    input_parent = output_parent = source = root = None\n    receipt = {\'schema\': \'helmut-bound-byte-restore-v1\', \'ok\': False, \'status\': \'FAIL_KEEP_STATE_NO_RETRY\',\n               \'scope_sha256\': _SR_SCOPE_SHA256, \'native_qualified\': False, \'actual_files\': [],\n               \'actual_bytes\': 0, \'remaining_entries\': None, \'partial_file_state\': \'NONE\',\n               \'metadata_state\': \'UNKNOWN\', \'unverified_entries\': None}\n    receipt[\'mtime_binding\'] = \'AUTHORIZED_ARCHIVE_HEADER_OR_PAX_NOT_A_HISTORICAL_ALL_INPUT_MTIME_PIN\'\n    verified, selected = set(), None\n    try:\n        input_parent, input_name = _sr_parent(gzip_tar_path)\n        named = _sr_os.stat(input_name, dir_fd=input_parent, follow_symlinks=False)\n        _sr_need(_sr_stat.S_ISREG(named.st_mode) and _sr_owned(named) and named.st_nlink == 1\n                 and _sr_stat.S_IMODE(named.st_mode) == 0o600 and 0 < named.st_size <= _SR_STREAM_CAP,\n                 \'INPUT_IDENTITY\')\n        source = _sr_os.open(input_name, _SR_FLAGS, dir_fd=input_parent)\n        original = _sr_os.fstat(source)\n        _sr_need(original == named, \'INPUT_CHANGED\')\n        stream, seen, pending, selected = _SRGzip(source), set(), None, None\n        links, directories = [], []\n        while True:\n            raw = stream.exact(512)\n            if raw == b\'\\0\' * 512:\n                _sr_need(stream.exact(512) == raw and pending is None, \'TAR_END\')\n                padding = (-stream.count) % 10240\n                tail = stream.read(10241)\n                _sr_need(len(tail) in (0, padding) and not any(tail) and stream.eof, \'TAR_TRAILING_BYTES\')\n                break\n            header = _sr_header(raw)\n            if header[\'kind\'] == b\'x\':\n                _sr_need(pending is None and 0 < header[\'size\'] <= _SR_PAX_CAP, \'PAX_LIMIT\')\n                pending = _sr_pax(stream.exact(header[\'size\']))\n                stream.padding(header[\'size\'])\n                continue\n            _sr_need(header[\'kind\'] in (b\'0\', b\'5\', b\'2\'), \'TAR_ENTRY_TYPE\')\n            path = (pending or {}).get(b\'path\', header[\'name\'])\n            if path.endswith(\'/\'):\n                _sr_need(header[\'kind\'] == b\'5\', \'PATH_ESCAPE\')\n                path = path[:-1]\n            name = _sr_pathcheck(path)\n            if pending and b\'mtime\' in pending:\n                header[\'mtime_ns\'] = pending[b\'mtime\']\n            pending = None\n            if selected is None:\n                _sr_need(name == \'SOURCE_SCOPE.PRIVATE.json\' and header[\'kind\'] == b\'0\'\n                         and 0 < header[\'size\'] <= _SR_SCOPE_CAP, \'SCOPE_FIRST\')\n                scope_raw = stream.exact(header[\'size\'])\n                stream.padding(header[\'size\'])\n                scope, selected = _sr_scope(scope_raw)\n                output_parent, output_name = _sr_parent(fresh_own_output_root)\n                _sr_os.mkdir(output_name, 0o700, dir_fd=output_parent)\n                root = _sr_os.open(output_name, _SR_DIR, dir_fd=output_parent)\n                _sr_os.fchmod(root, 0o700)\n                _sr_os.fsync(output_parent)\n                _sr_new(root, \'SOURCE_SCOPE.PRIVATE.json\', scope_raw)\n                receipt[\'remaining_entries\'] = len(selected)\n                continue\n            _sr_need(name in selected and name not in seen, \'TAR_EXTRA_OR_DUPLICATE\')\n            expected = selected[name]\n            _sr_need(all(header[key] == expected[key] for key in (\'kind\', \'size\', \'mode\', \'uid\', \'gid\'))\n                     and header[\'link\'] == expected.get(\'link\', \'\'), \'TAR_METADATA\')\n            _sr_need(\'mtime_ns\' not in expected or expected[\'mtime_ns\'] == header[\'mtime_ns\'], \'TAR_METADATA\')\n            expected = dict(expected, mtime_ns=header[\'mtime_ns\'])\n            seen.add(name)\n            parts = name.split(\'/\')\n            if header[\'kind\'] == b\'0\':\n                parent = _sr_directory(root, parts[:-1])\n                descriptor = None\n                try:\n                    descriptor = _sr_os.open(parts[-1], _sr_os.O_RDWR | _sr_os.O_CREAT | _sr_os.O_EXCL |\n                        _sr_os.O_NOFOLLOW | _sr_os.O_NOATIME | _sr_os.O_CLOEXEC, 0o600, dir_fd=parent)\n                    receipt[\'partial_file_state\'] = \'UNKNOWN\'\n                    digest, remaining = _sr_hashlib.sha256(), expected[\'size\']\n                    while remaining:\n                        block = stream.exact(min(remaining, 65536))\n                        digest.update(block)\n                        _sr_write(descriptor, block)\n                        remaining -= len(block)\n                    _sr_need(digest.hexdigest() == expected[\'sha256\'], \'FILE_HASH\')\n                    stream.padding(expected[\'size\'])\n                    _sr_metadata(descriptor, expected[\'uid\'], expected[\'gid\'], expected[\'mode\'])\n                    info = _sr_os.fstat(descriptor)\n                    _sr_need(_sr_stat.S_ISREG(info.st_mode) and info.st_nlink == 1\n                             and (info.st_size, info.st_uid, info.st_gid, _sr_stat.S_IMODE(info.st_mode)) ==\n                             (expected[\'size\'], expected[\'uid\'], expected[\'gid\'], expected[\'mode\']), \'RESTORED_FILE_METADATA\')\n                    _sr_os.fsync(descriptor)\n                    _sr_os.lseek(descriptor, 0, _sr_os.SEEK_SET)\n                    actual_digest, unread = _sr_hashlib.sha256(), expected[\'size\']\n                    while unread:\n                        block = _sr_os.read(descriptor, min(unread, 65536))\n                        _sr_need(block, \'RESTORED_FILE_TRUNCATED\')\n                        actual_digest.update(block)\n                        unread -= len(block)\n                    _sr_need(not _sr_os.read(descriptor, 1) and actual_digest.hexdigest() == expected[\'sha256\']\n                             and _sr_os.fstat(descriptor) == info ==\n                             _sr_os.stat(parts[-1], dir_fd=parent, follow_symlinks=False), \'RESTORED_FILE_HASH\')\n                    _sr_os.utime(descriptor, ns=(info.st_atime_ns, expected[\'mtime_ns\']))\n                    stamped = _sr_os.fstat(descriptor)\n                    _sr_need(stamped.st_mtime_ns == expected[\'mtime_ns\'] and stamped.st_atime_ns == info.st_atime_ns\n                             and (stamped.st_mode, stamped.st_uid, stamped.st_gid, stamped.st_size) ==\n                             (info.st_mode, info.st_uid, info.st_gid, info.st_size)\n                             and stamped == _sr_os.stat(parts[-1], dir_fd=parent, follow_symlinks=False), \'RESTORED_MTIME\')\n                    info = stamped\n                    _sr_os.fsync(descriptor)\n                    _sr_os.fsync(parent)\n                finally:\n                    if descriptor is not None: _sr_os.close(descriptor)\n                    _sr_os.close(parent)\n                receipt[\'actual_files\'].append({\'archiveMember\': name, \'bytes\': expected[\'size\'],\n                    \'sha256\': actual_digest.hexdigest(), \'mode\': oct(info.st_mode & 0o777), \'uid\': info.st_uid, \'gid\': info.st_gid})\n                receipt[\'actual_files\'][-1][\'mtime_ns\'] = info.st_mtime_ns\n                receipt[\'actual_bytes\'] += expected[\'size\']\n                verified.add(name)\n                receipt[\'partial_file_state\'] = \'NONE\'\n            elif header[\'kind\'] == b\'5\':\n                directories.append((name, expected))\n                descriptor = _sr_directory(root, parts)\n                _sr_os.close(descriptor)\n            else:\n                links.append((name, expected))\n            receipt[\'remaining_entries\'] = len(selected) - len(seen)\n        _sr_need(selected is not None and seen == set(selected), \'TAR_MISSING_ENTRIES\')\n        _sr_need(_sr_os.fstat(source) == original, \'INPUT_CHANGED\')\n        for name, expected in links:\n            receipt[\'partial_file_state\'] = \'UNKNOWN\'\n            parts = name.split(\'/\')\n            parent = _sr_directory(root, parts[:-1])\n            try:\n                _sr_os.symlink(expected[\'link\'], parts[-1], dir_fd=parent)\n                _sr_link_metadata(parent, parts[-1], expected[\'uid\'], expected[\'gid\'])\n                info = _sr_os.stat(parts[-1], dir_fd=parent, follow_symlinks=False)\n                _sr_need(_sr_os.readlink(parts[-1], dir_fd=parent) == expected[\'link\'], \'RESTORED_LINK_METADATA\')\n                _sr_os.utime(parts[-1], ns=(info.st_atime_ns, expected[\'mtime_ns\']),\n                             dir_fd=parent, follow_symlinks=False)\n                info = _sr_os.stat(parts[-1], dir_fd=parent, follow_symlinks=False)\n                _sr_need(_sr_stat.S_ISLNK(info.st_mode) and info.st_nlink == 1 and\n                    (info.st_uid, info.st_gid, _sr_stat.S_IMODE(info.st_mode)) ==\n                    (expected[\'uid\'], expected[\'gid\'], expected[\'mode\'])\n                    and info.st_mtime_ns == expected[\'mtime_ns\'], \'RESTORED_LINK_METADATA\')\n                _sr_os.fsync(parent)\n                verified.add(name)\n                receipt[\'partial_file_state\'] = \'NONE\'\n            finally:\n                _sr_os.close(parent)\n        for name, expected in sorted(directories, key=lambda row: row[0].count(\'/\'), reverse=True):\n            receipt[\'partial_file_state\'] = \'UNKNOWN\'\n            descriptor = _sr_directory(root, name.split(\'/\'))\n            try:\n                _sr_metadata(descriptor, expected[\'uid\'], expected[\'gid\'], expected[\'mode\'])\n                info = _sr_os.fstat(descriptor)\n                _sr_os.utime(descriptor, ns=(info.st_atime_ns, expected[\'mtime_ns\']))\n                info = _sr_os.fstat(descriptor)\n                _sr_need((info.st_uid, info.st_gid, _sr_stat.S_IMODE(info.st_mode)) ==\n                         (expected[\'uid\'], expected[\'gid\'], expected[\'mode\'])\n                         and info.st_mtime_ns == expected[\'mtime_ns\'], \'RESTORED_DIRECTORY_METADATA\')\n                _sr_os.fsync(descriptor)\n                verified.add(name)\n                receipt[\'partial_file_state\'] = \'NONE\'\n            finally:\n                _sr_os.close(descriptor)\n        receipt.update(ok=True, status=\'BYTES_RESTORED_NOT_NATIVE_QUALIFIED\',\n                       gzip_bytes=stream.compressed, tar_bytes=stream.count, metadata_state=\'VERIFIED\')\n    except Exception as error:\n        receipt[\'code\'] = str(error) if isinstance(error, _SRStop) else \'FILESYSTEM_OR_FORMAT_FAILURE\'\n    receipt[\'actual_file_count\'] = len(receipt[\'actual_files\'])\n    if selected is not None:\n        receipt[\'unverified_entries\'] = sorted(set(selected) - verified)\n        receipt[\'remaining_entries\'] = len(receipt[\'unverified_entries\'])\n    if root is not None:\n        try:\n            receipt_raw = _sr_json_bytes(receipt)\n            _sr_new(root, \'RESTORE_RECEIPT.PENDING.PRIVATE.json\', receipt_raw)\n            _sr_publish_receipt(root)\n        except Exception:\n            receipt.update(ok=False, status=\'FAIL_KEEP_STATE_NO_RETRY\', receipt_saved=False)\n        else:\n            receipt[\'receipt_saved\'] = True\n            receipt[\'receipt_sha256\'] = _sr_hashlib.sha256(receipt_raw).hexdigest()\n    for descriptor in (root, source, output_parent, input_parent):\n        if descriptor is not None:\n            try:\n                _sr_os.close(descriptor)\n            except OSError:\n                if not receipt.get(\'receipt_saved\'):\n                    raise\n    return receipt\n\n\nif __name__ == \'__main__\':\n    if len(_sr_sys.argv) != 4 or _sr_sys.argv[1] != \'--restore-bound-archive-once\':\n        print(\'{"status":"NOT_EXECUTED_EXPLICIT_RESTORE_FLAG_REQUIRED"}\')\n        raise SystemExit(2)\n    _sr_result = restore_bound_archive(_sr_sys.argv[2], _sr_sys.argv[3])\n    print(_sr_json_bytes({key: value for key, value in _sr_result.items() if key != \'actual_files\'}).decode(\'ascii\'), end=\'\')\n    raise SystemExit(0 if _sr_result[\'ok\'] else 1)\n'
STAGE_CODES = frozenset(('STAGE_COMPLETE', 'STAGE_INTERNAL_FAILURE', 'STAGE_DEADLINE',
    'STAGE_FRAME', 'STAGE_CAPSULE_LIMIT', 'STAGE_CAPSULE_FORMAT', 'STAGE_CAPSULE_BINDING',
    'STAGE_CAPSULE_TIME', 'STAGE_PARTS', 'STAGE_URL', 'STAGE_DNS', 'STAGE_HTTP',
    'STAGE_SIZE', 'STAGE_HASH', 'STAGE_SPACE', 'STAGE_ALREADY_ATTEMPTED',
    'STAGE_GPG', 'STAGE_GPG_INTEGRITY', 'STAGE_GPG_RECIPIENT', 'STAGE_RESTORE',
    'STAGE_HELPER_HASH', 'STAGE_RECEIPT', 'STAGE_CHILD', 'STAGE_COMMIT',
    'RECIPIENT_NOT_ACCEPTED', 'RECIPIENT_EXPIRED', 'RECIPIENT_PUBLIC_HASH',
    'RECOVERY_ORIGINAL_BINDING'))


def _stage_remaining():
    _require(type(_CONTROL_DEADLINE) in (int,float), 'STAGE_DEADLINE')
    remaining = _CONTROL_DEADLINE - time.monotonic()
    _require(remaining > 0, 'STAGE_DEADLINE')
    return remaining


def _stage_space(extra=0):
    _stage_remaining()
    info = os.statvfs(TARGET_BASE)
    _require(info.f_bavail * info.f_frsize >= STAGE_FREE_RESERVE + extra, 'STAGE_SPACE')


def _stage_json(raw):
    _require(type(raw) is bytes and 0 < len(raw) <= STAGE_CAPSULE_JSON, 'STAGE_CAPSULE_LIMIT')
    def unique(pairs):
        value = {}
        for key, item in pairs:
            _require(key not in value, 'STAGE_CAPSULE_FORMAT');value[key] = item
        return value
    def invalid(_):raise _Stop('STAGE_CAPSULE_FORMAT')
    try:return json.loads(raw.decode('utf8'),object_pairs_hook=unique,parse_constant=invalid)
    except (ValueError,UnicodeError,RecursionError):raise _Stop('STAGE_CAPSULE_FORMAT') from None


def _stage_read_capsule(stream):
    # Buffered reads run only in the own child; its parent enforces the deadline.
    raw = stream.readline(STAGE_CAPSULE_B64 + 2)
    _require(1 < len(raw) <= STAGE_CAPSULE_B64 + 1 and raw.endswith(b'\n')
             and stream.read(1) == b'', 'STAGE_FRAME')
    encoded = raw[:-1]
    _require(re.fullmatch(b'[A-Za-z0-9+/]+={0,2}',encoded) is not None,'STAGE_FRAME')
    try:value = base64.b64decode(encoded,validate=True)
    except ValueError:raise _Stop('STAGE_FRAME') from None
    _require(value and base64.b64encode(value)==encoded,'STAGE_FRAME')
    return value


def _stage_url(url,expires):
    _require(type(url) is str and 0 < len(url) <= 8192
             and all(32 < ord(c) < 127 and c != '\\' for c in url),'STAGE_URL')
    try:
        parsed=urllib.parse.urlsplit(url)
        host=parsed.hostname
        _require(parsed.scheme=='https' and host in STAGE_HOSTS and parsed.netloc in (host,host+':443')
                 and parsed.port in (None,443)
                 and parsed.username is None and parsed.password is None and not parsed.fragment
                 and re.fullmatch(r'/files/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/raw',parsed.path)
                 and bool(parsed.query),'STAGE_URL')
        pairs=urllib.parse.parse_qsl(parsed.query,keep_blank_values=True,strict_parsing=True,max_num_fields=32)
        values=dict(pairs)
        _require(len(values)==len(pairs) and 'se' in values and bool(values.get('sig')),'STAGE_URL')
        expiry=datetime.datetime.fromisoformat(values['se'].replace('Z','+00:00'))
        _require(expiry.utcoffset()==datetime.timedelta(0) and expiry.timestamp()>=expires,'STAGE_URL')
    except (ValueError,OverflowError,TypeError):raise _Stop('STAGE_URL') from None
    return host,parsed.path+'?'+parsed.query


def _stage_validate_capsule(raw,recipient):
    value=_stage_json(raw)
    fields={'schema','plan_sha256','scope_sha256','recipient_fingerprint','case_id',
            'created_unix','expires_unix','cipher_sha256','cipher_bytes',
            'compressed_tar_sha256','compressed_tar_bytes','parts'}
    _require(type(value) is dict and set(value)==fields,'STAGE_CAPSULE_FORMAT')
    _require(value['schema']=='helmut-private-drive-stage-capsule-v1'
             and value['plan_sha256']==STAGE_PLAN and value['scope_sha256']==STAGE_SCOPE
             and value['recipient_fingerprint']==recipient['primary_fingerprint']
             and type(value['case_id']) is str and re.fullmatch('[a-f0-9]{64}',value['case_id']),
             'STAGE_CAPSULE_BINDING')
    for key in ('cipher_sha256','compressed_tar_sha256'):
        _require(type(value[key]) is str and re.fullmatch('[a-f0-9]{64}',value[key]),'STAGE_CAPSULE_FORMAT')
    now=time.time();created,expires=value['created_unix'],value['expires_unix']
    _require(type(created) is int and type(expires) is int and now-300<=created<=now+30
             and created<expires<=created+300 and expires-now>=STAGE_MIN_REMAINING,'STAGE_CAPSULE_TIME')
    _require(type(value['cipher_bytes']) is int and 0<value['cipher_bytes']<=STAGE_CIPHER_CAP
             and type(value['compressed_tar_bytes']) is int
             and 0<value['compressed_tar_bytes']<=STAGE_TAR_CAP,'STAGE_SIZE')
    parts=value['parts'];total=0
    _require(type(parts) is list and 0<len(parts)<=64,'STAGE_PARTS')
    for index,part in enumerate(parts,1):
        _require(type(part) is dict and set(part)=={'index','bytes','sha256','url'}
                 and type(part['index']) is int and part['index']==index
                 and type(part['bytes']) is int and 0<part['bytes']<=16*1024**2
                 and type(part['sha256']) is str and re.fullmatch('[a-f0-9]{64}',part['sha256']),'STAGE_PARTS')
        _stage_url(part['url'],expires);total+=part['bytes']
    _require(total==value['cipher_bytes'],'STAGE_SIZE')
    peak=total+value['compressed_tar_bytes']+STAGE_ORIGINAL_BYTES+64*1024**2
    _require(peak<=STAGE_WORK_CAP,'STAGE_SPACE');_stage_space(peak)
    return value


def _stage_gpg(recipient,arguments,input_data=None,file_limit=None):
    prefix=('-i','PATH=/usr/bin:/bin','LC_ALL=C','/usr/bin/gpg','--no-options',
            '--homedir',TARGET_BASE+'/'+HOME_NAME,'--batch','--no-tty',
            '--no-auto-key-retrieve','--auto-key-locate','clear','--no-auto-check-trustdb')
    result=_bounded_tool('/usr/bin/env',prefix+tuple(arguments),input=input_data,
                         timeout=_stage_remaining(),file_limit=file_limit)
    try:return _stage_verify_gpg(result,recipient,'--status-fd=2' in arguments)
    except Exception:
        _first_tool_error((result.stdout,result.stderr),'STAGE_GPG_VALIDATION')
        raise


def _stage_verify_gpg(result,recipient,status_on_stderr):
    _require(result.returncode==0,'STAGE_GPG')
    status=result.stderr if status_on_stderr else result.stdout
    try:lines=status.decode('utf8').splitlines()
    except UnicodeError:raise _Stop('STAGE_GPG_INTEGRITY') from None
    records=[line[9:].split() for line in lines if line.startswith('[GNUPG:] ')]
    _require(sum(row[:1]==['DECRYPTION_OKAY'] for row in records)==1
             and sum(row[:1]==['GOODMDC'] for row in records)==1
             and any(row[:1]==['ENC_TO'] for row in records)
             and not any(row[:1] in (['BADMDC'],['ERRMDC'],['DECRYPTION_FAILED'],['NODATA'],['ERROR'],['FAILURE']) for row in records)
             and any(len(row)>=3 and row[0]=='DECRYPTION_INFO' and row[1:3]==['2','9']
                     and (len(row)==3 or row[3]=='0') for row in records),'STAGE_GPG_INTEGRITY')
    keys=[row for row in records if row[:1]==['DECRYPTION_KEY']]
    _require(len(keys)==1 and len(keys[0])>=3
             and keys[0][1:3]==[recipient['subkey_fingerprint'],recipient['primary_fingerprint']],
             'STAGE_GPG_RECIPIENT')
    return result.stdout


def _stage_connect(host):
    # No proxy or second DNS lookup: connect exactly the checked numeric sockaddr.
    # TLS verifies exactly the allowlisted hostname carried from the URL.
    _stage_remaining()
    _require(type(host) is str and host in STAGE_HOSTS,'STAGE_URL')
    try:rows=socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)
    except OSError:raise _Stop('STAGE_DNS') from None
    _require(0<len(rows)<=32,'STAGE_DNS')
    for family,kind,protocol,_,address in rows:
        _require(family in (socket.AF_INET,socket.AF_INET6)
                 and ipaddress.ip_address(address[0]).is_global,'STAGE_DNS')
    rows.sort(key=lambda row:row[0]!=socket.AF_INET)
    family,kind,protocol,_,address=rows[0]
    raw=socket.socket(family,kind,protocol)
    try:
        raw.settimeout(min(10,_stage_remaining()));raw.connect(address)
        connection=http.client.HTTPSConnection(host,443,timeout=min(10,_stage_remaining()))
        connection.sock=ssl.create_default_context().wrap_socket(raw,server_hostname=host)
        return connection
    except BaseException:raw.close();raise


def _stage_download(part,expires,descriptor,whole):
    _require(expires>time.time()+5,'STAGE_CAPSULE_TIME')
    host,target=_stage_url(part['url'],expires)
    try:connection=_stage_connect(host)
    except _Stop:raise
    except (OSError,http.client.HTTPException):raise _Stop('STAGE_HTTP') from None
    try:
        connection.sock.settimeout(min(10,_stage_remaining()))
        connection.request('GET',target,headers={'Host':host,'Accept-Encoding':'identity','Connection':'close',
                                               'User-Agent':'helmut-private-drive-stage-v1'})
        response=connection.getresponse()
        _require(response.status==200 and response.getheader('Transfer-Encoding') is None
                 and response.getheader('Content-Encoding') in (None,'identity')
                 and response.getheader('Content-Length')==str(part['bytes']),'STAGE_HTTP')
        digest,count=hashlib.sha256(),0
        while True:
            _stage_space()
            block=response.read(min(65536,part['bytes']+1-count))
            if not block:break
            count+=len(block);_require(count<=part['bytes'],'STAGE_SIZE')
            digest.update(block);whole.update(block);offset=0
            while offset<len(block):
                _stage_remaining();written=os.write(descriptor,block[offset:])
                _require(written>0,'STAGE_SIZE');offset+=written
        _require(count==part['bytes'] and digest.hexdigest()==part['sha256'],'STAGE_HASH')
    except _Stop:raise
    except (OSError,http.client.HTTPException):raise _Stop('STAGE_HTTP') from None
    finally:connection.close()


def _stage_hash_file(path,size):
    descriptor=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NOATIME|os.O_CLOEXEC)
    try:
        before=os.fstat(descriptor)
        _require(stat.S_ISREG(before.st_mode) and _owned(before) and before.st_nlink==1
                 and stat.S_IMODE(before.st_mode)==0o600 and before.st_size==size,'STAGE_SIZE')
        digest=hashlib.sha256();count=0
        while True:
            _stage_space();block=os.read(descriptor,65536)
            if not block:break
            count+=len(block);_require(count<=size,'STAGE_SIZE');digest.update(block)
        _require(count==size and before==os.fstat(descriptor),'STAGE_SIZE')
        os.fsync(descriptor);_stage_remaining()
        return digest.hexdigest()
    finally:os.close(descriptor)


def _stage_result(code,capsule_sha=None,capsule=None,restored=None,receipt_sha=None):
    capsule=capsule or {};restored=restored or {}
    return {'schema':'helmut-private-drive-stage-result-v1',
        'status':'STAGE_READY_NOT_NATIVE_QUALIFIED' if code=='STAGE_COMPLETE' else 'FAIL_KEEP_STATE_NO_RETRY',
        'native_qualified':False,'plan_sha256':STAGE_PLAN,'scope_sha256':STAGE_SCOPE,
        'capsule_sha256':capsule_sha,'case_id':capsule.get('case_id'),
        'cipher_sha256':capsule.get('cipher_sha256'),'compressed_tar_sha256':capsule.get('compressed_tar_sha256'),
        # FAIL includes interrupted/partial writes. Without a complete verified
        # report, zero would falsely claim that no original bytes were written.
        'actual_file_count':restored.get('actual_file_count') if code=='STAGE_COMPLETE' else None,
        'actual_bytes':restored.get('actual_bytes') if code=='STAGE_COMPLETE' else None,
        'receipt_sha256':receipt_sha,'code':code}


def _stage_run(request,context):
    global _TOOL_ERROR_NAME
    previous_log_name=_TOOL_ERROR_NAME
    _TOOL_ERROR_NAME='GPG_STAGE_FIRST_TOOL_ERROR.PRIVATE.json'
    base=once=case=None;capsule=None;capsule_sha=None;restored=None;published=False
    try:
        _stage_remaining();_stage_space()
        _require(request['plan_sha256']==STAGE_PLAN,'STAGE_CAPSULE_BINDING')
        _recipient_ready(False)
        recipient=json.loads(_read_public_file(TARGET_BASE+'/'+RESULT_NAME))
        _require(all(type(recipient.get(key)) is str and re.fullmatch('[A-F0-9]{40}',recipient[key])
                     for key in ('primary_fingerprint','subkey_fingerprint')),'RECIPIENT_NOT_ACCEPTED')
        encrypted=_stage_read_capsule(context['stdin']);capsule_sha=hashlib.sha256(encrypted).hexdigest()
        base=_open_base(TARGET_BASE)
        once=os.open('once',_DFLAGS,dir_fd=base);_dir(os.fstat(once),exact=True)
        attempt=STAGE_PLAN+'.stage.json'
        _require(_missing(once,attempt),'STAGE_ALREADY_ATTEMPTED')
        # Reserve and fsync the fixed cross-version slot before touching the
        # private key. A lost/blocked decrypt leaves UNKNOWN permanently locked.
        _json_new(once,attempt,{'schema':'helmut-private-drive-stage-attempt-v1',
            'state':'RESERVED_UNKNOWN_NO_RETRY','nonce':request['nonce'],
            'source_sha256':context['source_sha256'],'capsule_sha256':capsule_sha,
            'scope_sha256':STAGE_SCOPE})
        plaintext=_stage_gpg(recipient,('--status-fd=2','--max-output',str(STAGE_CAPSULE_JSON),
                                      '--decrypt'),input_data=encrypted)
        capsule=_stage_validate_capsule(plaintext,recipient)
        # The immutable reservation is never rewritten or released. Bind only
        # the subsequently validated case in a separate durable receipt.
        _json_new(once,STAGE_PLAN+'.stage-case.json',{'schema':'helmut-private-drive-stage-case-binding-v1',
            'nonce':request['nonce'],'source_sha256':context['source_sha256'],
            'capsule_sha256':capsule_sha,'case_id':capsule['case_id'],'scope_sha256':STAGE_SCOPE})
        _write_new(base,'STAGE_CAPSULE.PRIVATE.pgp',encrypted)
        _write_new(base,'STAGE_CAPSULE.PRIVATE.json',plaintext)
        name='stage-'+capsule['case_id'];os.mkdir(name,0o700,dir_fd=base);os.fsync(base)
        case=os.open(name,_DFLAGS,dir_fd=base);_dir(os.fstat(case),exact=True)
        case_path=TARGET_BASE+'/'+name
        descriptor=os.open('payload.cipher.pgp',_WFLAGS,0o600,dir_fd=case)
        try:
            whole=hashlib.sha256()
            for part in capsule['parts']:_stage_download(part,capsule['expires_unix'],descriptor,whole)
            os.fsync(descriptor)
            _require(os.fstat(descriptor).st_size==capsule['cipher_bytes']
                     and whole.hexdigest()==capsule['cipher_sha256'],'STAGE_HASH')
        finally:os.close(descriptor)
        os.fsync(case);_stage_space();gzip_path=case_path+'/payload.tar.gz'
        _stage_gpg(recipient,('--status-fd=1','--max-output',str(capsule['compressed_tar_bytes']),
                   '--output',gzip_path,'--decrypt',case_path+'/payload.cipher.pgp'),
                   file_limit=capsule['compressed_tar_bytes'])
        _require(_stage_hash_file(gzip_path,capsule['compressed_tar_bytes'])
                 ==capsule['compressed_tar_sha256'],'STAGE_HASH')
        result=_stage_finish(request,context,base,case,case_path,capsule_sha,capsule,recipient)
        published=True
        return result
    except Exception as error:
        code=getattr(error,'code',None)
        if code not in STAGE_CODES:code='STAGE_INTERNAL_FAILURE'
        result=_stage_result(code,capsule_sha,capsule,restored)
        try:
            held=_open_base(TARGET_BASE)
            try:_json_new(held,'STAGE_FIRST_ERROR.SAFE.json',result)
            finally:os.close(held)
        except Exception:pass
        return result
    finally:
        _TOOL_ERROR_NAME=previous_log_name
        for descriptor in (case,once,base):
            if descriptor is not None:
                try:os.close(descriptor)
                except OSError:
                    # These are read-only directory descriptors. Their close
                    # cannot undo the durable receipt and atomic publication.
                    if not published:raise


def _stage_publish_ready(base):
    library=ctypes.CDLL(None,use_errno=True)
    rename=library.renameat2
    rename.argtypes=(ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint)
    rename.restype=ctypes.c_int
    if rename(base,b'STAGE_READY.PENDING.SAFE.json',base,b'STAGE_READY.SAFE.json',1)!=0:
        raise _Stop('STAGE_COMMIT')


def _stage_readback(directory,name,expected):
    descriptor=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NOATIME|os.O_CLOEXEC,dir_fd=directory)
    try:
        before=os.fstat(descriptor)
        _require(stat.S_ISREG(before.st_mode) and _owned(before) and before.st_nlink==1
                 and stat.S_IMODE(before.st_mode)==0o600 and before.st_size==len(expected),'STAGE_RECEIPT')
        result=bytearray()
        while len(result)<=len(expected):
            _stage_remaining();block=os.read(descriptor,min(65536,len(expected)+1-len(result)))
            if not block:break
            result.extend(block)
        _require(bytes(result)==expected and before==os.fstat(descriptor),'STAGE_RECEIPT')
    finally:os.close(descriptor)


def _stage_finish(request,context,base,case,case_path,capsule_sha,capsule,recipient):
    _require(hashlib.sha256(EMBEDDED_STAGE_RESTORE_SOURCE).hexdigest()==STAGE_RESTORE_SHA256,'STAGE_HELPER_HASH')
    namespace={'__name__':'helmut_embedded_bound_restore','__file__':'<qualified-stage-restore>'}
    exec(compile(EMBEDDED_STAGE_RESTORE_SOURCE,'<qualified-stage-restore>','exec'),namespace)
    restored=namespace['restore_bound_archive'](case_path+'/payload.tar.gz',case_path+'/restored')
    _stage_remaining();_stage_space()
    _require(restored.get('ok') is True and restored.get('receipt_saved') is True
             and restored.get('status')=='BYTES_RESTORED_NOT_NATIVE_QUALIFIED'
             and restored.get('scope_sha256')==STAGE_SCOPE and restored.get('native_qualified') is False
             and restored.get('actual_file_count')==STAGE_ORIGINAL_FILES and restored.get('actual_bytes')==STAGE_ORIGINAL_BYTES
             and restored.get('metadata_state')=='VERIFIED' and restored.get('remaining_entries')==0,'STAGE_RESTORE')
    receipt={'schema':'helmut-private-drive-stage-receipt-v1','nonce':request['nonce'],
        'source_sha256':context['source_sha256'],'case_id':capsule['case_id'],
        'scope_sha256':STAGE_SCOPE,'recipient_fingerprint':recipient['primary_fingerprint'],
        'capsule_sha256':capsule_sha,'cipher_sha256':capsule['cipher_sha256'],
        'compressed_tar_sha256':capsule['compressed_tar_sha256'],
        'restore_receipt_sha256':restored['receipt_sha256'],
        'actual_file_count':restored['actual_file_count'],'actual_bytes':restored['actual_bytes'],
        'native_qualified':False}
    receipt_raw=(json.dumps(receipt,sort_keys=True,separators=(',',':'))+'\n').encode('ascii')
    _write_new(case,'STAGE_RECEIPT.PRIVATE.json',receipt_raw)
    _stage_readback(case,'STAGE_RECEIPT.PRIVATE.json',receipt_raw)
    result=_stage_result('STAGE_COMPLETE',capsule_sha,capsule,restored,hashlib.sha256(receipt_raw).hexdigest())
    pending_raw=(json.dumps(result,sort_keys=True,separators=(',',':'))+'\n').encode('ascii')
    _write_new(base,'STAGE_READY.PENDING.SAFE.json',pending_raw)
    _stage_readback(base,'STAGE_READY.PENDING.SAFE.json',pending_raw)
    # Atomic no-replace is the last fallible commit operation. If a crash loses
    # the rename, the durable PENDING remains unaccepted; no automatic adoption.
    _stage_remaining();_stage_publish_ready(base)
    return result


def _stage_handle(request,context):
    # One own child contains DNS, every file write/fsync, GPG and restore.
    _stage_remaining();read_end,write_end=os.pipe2(os.O_CLOEXEC);pid=os.fork()
    if pid==0:
        try:
            global _IN_STAGE_CHILD
            _IN_STAGE_CHILD=True;os.setsid();os.close(read_end)
            sink=os.open('/dev/null',os.O_RDWR);os.dup2(sink,1);os.dup2(sink,2);os.close(sink)
            result=_stage_run(request,context)
            encoded=json.dumps(result,sort_keys=True,separators=(',',':')).encode('ascii')
            _require(len(encoded)<=4096,'STAGE_CHILD');offset=0
            while offset<len(encoded):offset+=os.write(write_end,encoded[offset:])
            os.close(write_end);os._exit(0)
        except BaseException:os._exit(1)
    os.close(write_end);os.set_blocking(read_end,False);output=bytearray();waited=False
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(read_end,selectors.EVENT_READ)
            while selector.get_map():
                _stage_space()
                for _,_ in selector.select(min(.25,_stage_remaining())):
                    block=os.read(read_end,4097-len(output))
                    if not block:selector.unregister(read_end)
                    else:output.extend(block)
                    _require(len(output)<=4096,'STAGE_CHILD')
            while True:
                child,status=os.waitpid(pid,os.WNOHANG)
                if child:
                    waited=True;_require(os.waitstatus_to_exitcode(status)==0,'STAGE_CHILD');break
                _stage_remaining();time.sleep(min(.01,_stage_remaining()))
        result=_stage_json(bytes(output))
        _require(type(result) is dict and result.get('code') in STAGE_CODES,'STAGE_CHILD')
        return result
    except Exception as error:
        code=getattr(error,'code',None)
        return _stage_result(code if code in STAGE_CODES else 'STAGE_CHILD')
    finally:
        if not waited:
            try:os.killpg(pid,signal.SIGKILL)
            except ProcessLookupError:
                try:os.kill(pid,signal.SIGKILL)
                except ProcessLookupError:pass
                # The child may have completed setsid between the two signals.
                try:os.killpg(pid,signal.SIGKILL)
                except ProcessLookupError:pass
            os.waitpid(pid,0)
        os.close(read_end)


# Read-only diagnosis of the one retained 40270395850 restore failure. No path,
# operation, key or retry authority is accepted from the caller.
STAGE_DIAG_CASE = 'f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0'
STAGE_DIAG_SOURCE = '3262e1cf895daa03e0ef1a0a26c548f4d51f4e948273dd76dd4ff7543a20ea70'
STAGE_DIAG_RECEIPT_CAP = 1024**2
STAGE_DIAG_CODES = ('CASE_BINDING_ABSENT','CASE_BINDING_UNTRUSTED','CASE_BINDING_INVALID',
    'STAGE_ERROR_ABSENT','STAGE_ERROR_UNTRUSTED','STAGE_ERROR_INVALID',
    'RESTORE_RECEIPT_ABSENT','RESTORE_RECEIPT_UNTRUSTED','RESTORE_RECEIPT_OVERSIZE',
    'RESTORE_RECEIPT_INVALID','SAVED_RESTORE_RECEIPT')
STAGE_RESTORE_CODES = ('DESTINATION_DIRECTORY', 'FILESYSTEM_OR_FORMAT_FAILURE', 'FILE_HASH',
    'GZIP_INPUT_LIMIT', 'GZIP_TRAILING_BYTES', 'GZIP_TRUNCATED', 'INPUT_CHANGED', 'INPUT_IDENTITY',
    'JSON_CONSTANT', 'JSON_DUPLICATE', 'PARENT_CHANGED', 'PATH_ESCAPE', 'PATH_FORMAT', 'PAX_KEY',
    'PAX_LENGTH', 'PAX_LIMIT', 'PAX_MTIME', 'PAX_RECORD', 'RESTORED_DIRECTORY_METADATA',
    'RESTORED_FILE_HASH', 'RESTORED_FILE_METADATA', 'RESTORED_FILE_TRUNCATED',
    'RESTORED_LINK_METADATA', 'RESTORED_MTIME', 'ROOT_REQUIRED', 'SCOPE_BYTES', 'SCOPE_COUNTS',
    'SCOPE_FILE', 'SCOPE_FIRST', 'SCOPE_HASH', 'SCOPE_LINK_TARGET', 'SCOPE_METADATA',
    'SCOPE_PARENT_TYPE', 'SHORT_WRITE', 'TAR_CHECKSUM', 'TAR_END', 'TAR_ENTRY_TYPE',
    'TAR_EXTRA_OR_DUPLICATE', 'TAR_FORMAT', 'TAR_METADATA', 'TAR_MISSING_ENTRIES',
    'TAR_NONZERO_PADDING', 'TAR_NUMBER', 'TAR_TOTAL_LIMIT', 'TAR_TRAILING_BYTES', 'TAR_TRUNCATED',
    'UNTRUSTED_PARENT')


def _stage_diag_empty(state,code,stage_code=None,receipt_sha=None):
    return {'schema':'helmut-stage-first-error-diagnostic-v1','state':state,'diagnostic_code':code,
        'stage_code':stage_code,'restore_status':None,'restore_code':None,
        'receipt_sha256':receipt_sha,'actual_file_count':None,'actual_bytes':None,
        'remaining_entries':None,'partial_file_state':None,'metadata_state':None,
        'last_verified_member_name_sha256':None}


def _stage_diag_metadata(info):
    return {name:getattr(info,name) for name in dir(info)
            if name.startswith('st_') and type(getattr(info,name)) in (int,float)}


def _stage_diag_read(kind):
    fixed={'CASE_BINDING':('once',STAGE_PLAN+'.stage-case.json'),
        'STAGE_ERROR':('STAGE_FIRST_ERROR.SAFE.json',),
        'RESTORE_RECEIPT':('stage-'+STAGE_DIAG_CASE,'restored','RESTORE_RECEIPT.PRIVATE.json')}
    _require(kind in fixed,'STAGE_DIAGNOSTIC_PATH')
    cap=STAGE_DIAG_RECEIPT_CAP if kind=='RESTORE_RECEIPT' else MAX_TOOL_OUTPUT
    descriptors=[];parents=[];item=None
    try:
        directory=_open_base(TARGET_BASE);descriptors.append(directory)
        _dir(os.fstat(directory),exact=True)
        snapshots=[_stage_diag_metadata(os.fstat(directory))]
        for component in fixed[kind][:-1]:
            child=os.open(component,_DFLAGS,dir_fd=directory)
            descriptors.append(child);_dir(os.fstat(child),exact=True)
            before=_stage_diag_metadata(os.fstat(child))
            _require(before==_stage_diag_metadata(os.stat(component,dir_fd=directory,follow_symlinks=False)),
                     'STAGE_DIAGNOSTIC_METADATA')
            parents.append((directory,component,before));snapshots.append(before);directory=child
        name=fixed[kind][-1]
        item=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NOATIME|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=directory)
        info=os.fstat(item);before=_stage_diag_metadata(info)
        _require(stat.S_ISREG(info.st_mode) and _owned(info) and info.st_nlink==1
                 and stat.S_IMODE(info.st_mode)==0o600,'STAGE_DIAGNOSTIC_METADATA')
        _require(info.st_size<=cap,'STAGE_DIAGNOSTIC_LIMIT')
        output=bytearray()
        while True:
            block=os.read(item,min(65536,cap+1-len(output)))
            if not block:break
            output.extend(block);_require(len(output)<=cap,'STAGE_DIAGNOSTIC_LIMIT')
        _require(len(output)==info.st_size and before==_stage_diag_metadata(os.fstat(item))
                 ==_stage_diag_metadata(os.stat(name,dir_fd=directory,follow_symlinks=False)),
                 'STAGE_DIAGNOSTIC_METADATA')
        _require(all(_stage_diag_metadata(os.fstat(fd))==snapshot for fd,snapshot in zip(descriptors,snapshots))
                 and all(_stage_diag_metadata(os.stat(name,dir_fd=fd,follow_symlinks=False))==snapshot
                         for fd,name,snapshot in parents),'STAGE_DIAGNOSTIC_METADATA')
        return bytes(output)
    finally:
        if item is not None:os.close(item)
        for fd in reversed(descriptors):os.close(fd)


def _stage_diag_json(raw):
    def unique(pairs):
        value={}
        for key,item in pairs:
            _require(key not in value,'STAGE_DIAGNOSTIC_FORMAT');value[key]=item
        return value
    def invalid(_):raise _Stop('STAGE_DIAGNOSTIC_FORMAT')
    return json.loads(raw.decode('utf8'),object_pairs_hook=unique,parse_constant=invalid)


def _stage_diag_project(record,receipt_sha):
    _require(type(record) is dict and record.get('schema')=='helmut-bound-byte-restore-v1'
             and record.get('scope_sha256')==STAGE_SCOPE and record.get('native_qualified') is False
             and type(record.get('ok')) is bool,'STAGE_DIAGNOSTIC_FORMAT')
    ok=record['ok'];status=record.get('status');code=record.get('code')
    _require(status==('BYTES_RESTORED_NOT_NATIVE_QUALIFIED' if ok else 'FAIL_KEEP_STATE_NO_RETRY')
             and (code is None if ok else type(code) is str and code in STAGE_RESTORE_CODES)
             and record.get('partial_file_state') in ('NONE','UNKNOWN')
             and record.get('metadata_state') in ('UNKNOWN','VERIFIED'),'STAGE_DIAGNOSTIC_FORMAT')
    count,total,remaining=(record.get(key) for key in ('actual_file_count','actual_bytes','remaining_entries'))
    _require(type(count) is int and 0<=count<=1767 and type(total) is int and 0<=total<=2865680705
             and type(remaining) is int and 0<=remaining<=1866,'STAGE_DIAGNOSTIC_FORMAT')
    files,unverified=record.get('actual_files'),record.get('unverified_entries')
    _require(type(files) is list and len(files)==count and type(unverified) is list
             and len(unverified)==remaining,'STAGE_DIAGNOSTIC_FORMAT')
    size=0;last=None
    for row in files:
        _require(type(row) is dict and type(row.get('bytes')) is int and 0<=row['bytes']<=2865680705,
                 'STAGE_DIAGNOSTIC_FORMAT')
        name=row.get('archiveMember')
        _require(type(name) is str and name.startswith('files/') and len(name.encode('utf8'))<=4096
                 and all(part not in ('','.','..') for part in name.split('/'))
                 and not any(ord(c)<32 or c=='\\' for c in name),'STAGE_DIAGNOSTIC_FORMAT')
        size+=row['bytes'];last=hashlib.sha256(name.encode('utf8')).hexdigest()
    _require(size==total and (not ok or count==1767 and total==2865680705 and remaining==0
             and record['partial_file_state']=='NONE' and record['metadata_state']=='VERIFIED'),
             'STAGE_DIAGNOSTIC_FORMAT')
    result=_stage_diag_empty('RECORDED','SAVED_RESTORE_RECEIPT','STAGE_RESTORE',receipt_sha)
    result.update(restore_status=status,restore_code=code,actual_file_count=count,actual_bytes=total,
                  remaining_entries=remaining,partial_file_state=record['partial_file_state'],
                  metadata_state=record['metadata_state'],last_verified_member_name_sha256=last)
    return result


def _stage_diagnostic():
    stage_code=None;receipt_sha=None
    for kind in ('CASE_BINDING','STAGE_ERROR','RESTORE_RECEIPT'):
        try:raw=_stage_diag_read(kind)
        except FileNotFoundError:return _stage_diag_empty('ABSENT',kind+'_ABSENT',stage_code)
        except Exception as error:
            code=kind+'_OVERSIZE' if kind=='RESTORE_RECEIPT' and getattr(error,'code',None)=='STAGE_DIAGNOSTIC_LIMIT' else kind+'_UNTRUSTED'
            return _stage_diag_empty('UNKNOWN',code,stage_code)
        if kind=='RESTORE_RECEIPT':receipt_sha=hashlib.sha256(raw).hexdigest()
        try:
            record=_stage_diag_json(raw)
            if kind=='CASE_BINDING':
                _require(type(record) is dict and set(record)=={'schema','nonce','source_sha256','capsule_sha256','case_id','scope_sha256'}
                         and record['schema']=='helmut-private-drive-stage-case-binding-v1'
                         and record['case_id']==STAGE_DIAG_CASE and record['source_sha256']==STAGE_DIAG_SOURCE
                         and record['scope_sha256']==STAGE_SCOPE
                         and all(type(record[key]) is str and re.fullmatch('[a-f0-9]{64}',record[key])
                                 for key in ('nonce','capsule_sha256')),'STAGE_DIAGNOSTIC_FORMAT')
                binding=record
            elif kind=='STAGE_ERROR':
                _require(type(record) is dict and record.get('schema')=='helmut-private-drive-stage-result-v1'
                         and record.get('status')=='FAIL_KEEP_STATE_NO_RETRY' and record.get('native_qualified') is False
                         and record.get('code')=='STAGE_RESTORE' and record.get('plan_sha256')==STAGE_PLAN
                         and record.get('scope_sha256')==STAGE_SCOPE and record.get('case_id')==STAGE_DIAG_CASE
                         and record.get('capsule_sha256')==binding['capsule_sha256'],'STAGE_DIAGNOSTIC_FORMAT')
                stage_code='STAGE_RESTORE'
            else:return _stage_diag_project(record,receipt_sha)
        except Exception:return _stage_diag_empty('UNKNOWN',kind+'_INVALID',stage_code,receipt_sha)


# Source pins are filled only after the independent setup qualification. They
# bind public code at the same CI-verified commit supplied by the bootstrap.
SETUP_COORDINATOR_SHA256 = '0bec349c325d402e1357e77a8238e98ede64cf59047d712d93afcaecc19bbb2d'
SETUP_COORDINATOR_BYTES = 23644


def _setup_qualified():
    return (type(SETUP_COORDINATOR_SHA256) is str
            and re.fullmatch('[a-f0-9]{64}', SETUP_COORDINATOR_SHA256) is not None
            and type(SETUP_COORDINATOR_BYTES) is int and 0 < SETUP_COORDINATOR_BYTES <= 131072)


def _setup_handle(request, context):
    _require(_setup_qualified(), 'SETUP_NOT_QUALIFIED')
    commit = context.get('deployment_commit')
    _require(type(commit) is str and re.fullmatch('[a-f0-9]{40}', commit), 'SETUP_COMMIT')
    deadline = context['deadline']
    _require(0 < deadline - time.monotonic() <= 300, 'SETUP_DEADLINE')
    path = '/ernisch/helmut-pilot/' + commit + '/scripts/hetzner-native-setup-coordinator.py'
    connection = http.client.HTTPSConnection('raw.githubusercontent.com',
        timeout=min(10, deadline-time.monotonic()))
    try:
        connection.request('GET', path, headers={'Accept': 'text/plain', 'Connection': 'close',
                                                'User-Agent': 'HELMUT-qualified-setup-code'})
        peer = connection.sock
        response = connection.getresponse()
        _require(response.status == 200, 'SETUP_SOURCE_HTTP')  # Never follow redirects.
        raw = bytearray()
        while True:
            if response.isclosed(): break
            remaining = deadline-time.monotonic()
            _require(remaining > 0, 'SETUP_DEADLINE')
            peer.settimeout(min(10, remaining))
            block = response.read1(min(65536, SETUP_COORDINATOR_BYTES + 1 - len(raw)))
            if not block: break
            raw.extend(block)
            _require(len(raw) <= SETUP_COORDINATOR_BYTES, 'SETUP_SOURCE_LIMIT')
        raw = bytes(raw)
        _require(len(raw) == SETUP_COORDINATOR_BYTES
                 and hashlib.sha256(raw).hexdigest() == SETUP_COORDINATOR_SHA256, 'SETUP_SOURCE_HASH')
    finally:
        connection.close()
    namespace = {'__name__': 'helmut_bound_setup_coordinator', '__file__': '<qualified-public-setup>',
                 '__source_bytes__': raw}
    exec(compile(raw, '<qualified-public-setup>', 'exec'), namespace)
    _require(callable(namespace.get('coordinate_setup')), 'SETUP_ENTRYPOINT')
    setup_context = {name: context[name] for name in
                     ('base', 'source_sha256', 'deployment_commit', 'deadline')}
    result = namespace['coordinate_setup'](request, setup_context)
    _require(type(result) is dict and result.get('native_qualified') is False
             and result.get('native_go_consumed') is False, 'SETUP_RESULT')
    return result


def _setup_failure(code):
    return {'schema': 'helmut-target-setup-result-v1', 'status': 'FAIL_KEEP_STATE_NO_RETRY',
        'phase': 'preflight', 'code': code, 'ready_sha256': None, 'accepted_sha256': None,
        'lifecycle_sha256': None, 'native_qualified': False, 'native_go_consumed': False}


def _setup_first_failure(result):
    directory = None
    try:
        directory = _open_base(TARGET_BASE)
        _json_new(directory, 'TARGET_SETUP_FIRST_ERROR.SAFE.json', result)
    except Exception:
        pass  # Never replace the returned first cause or an existing error.
    finally:
        if directory is not None: os.close(directory)


SETUP_SUCCESSOR_ID = 'setup-successor-unit-properties-v1'
SETUP_SUCCESSOR_COORDINATOR_SHA256 = '43f837860b111924aef3da593c8f808c773fd617ad06cad3c1279c4416b0ead9'
SETUP_SUCCESSOR_COORDINATOR_BYTES = 41531
SETUP_SUCCESSOR_PREFLIGHT_SHA256 = '726534ef06f5649efa1282c0aabdc49857706104a4a82f2677259cc837a1764b'
SETUP_SUCCESSOR_PREFLIGHT_BYTES = 19099
SETUP_SUCCESSOR_CONTRACT = 'docs/betrieb/hetzner-setup-successor-contract-20261026.json'
RUNTIME_METADATA_ID = 'runtime-metadata-failed-context-20261026-v1'
RUNTIME_METADATA_CONTRACT_SHA256 = 'b85cecc106ab2e2a40d19f02c8caa412e6e6e3f86c6ee4c5bfa18fbe712a2caf'
RUNTIME_METADATA_SHA256 = 'edcc93c55404685d3637abb096589f90c02ec1fce2a0e75b54dc53003b269046'
RUNTIME_METADATA_BYTES = 46826
RUNTIME_SETUP_COMMIT = '8139b3a99d04e3e854f886123869bf669da6389d'
RUNTIME_SETUP_SOURCE = '1fc63bf8c90a6f13a2eebf4981d7f0c7da0b10f5e5c2fd563551e117f0ec58fe'
DAEMON_BINDING_ID = 'daemon-binding-observation-20261026-v1'
DAEMON_BINDING_CONTRACT_SHA256 = 'fe6a763fee403a0e34a943db533b0aca71b38afdfc9408143e0d9aef064844bd'
DAEMON_BINDING_SHA256 = '5da9ff7eaf941a7ef25eb01d9448d34e8118f437e3ebe636dc1c733261addde5'
DAEMON_BINDING_BYTES = 16561
CONTINUATION_ID = 'setup-context-daemon-binding-v2'
CONTINUATION_SHA256 = 'eb5d7a1602ebb4861dd4aa181cee381613c987943b7cd4e3aad6a776270404b6'
CONTINUATION_BYTES = 44604
CONTINUATION_CONTRACT = 'docs/betrieb/hetzner-context-continuation-contract-20261026.json'


def _setup_successor_qualified():
    return _setup_qualified() and all(
        type(pin) is str and re.fullmatch('[a-f0-9]{64}', pin) is not None
        and type(size) is int and 0 < size <= 65536 for pin, size in (
            (SETUP_SUCCESSOR_COORDINATOR_SHA256, SETUP_SUCCESSOR_COORDINATOR_BYTES),
            (SETUP_SUCCESSOR_PREFLIGHT_SHA256, SETUP_SUCCESSOR_PREFLIGHT_BYTES)))


def _setup_read_capsule(context):
    """One optional canonical line and EOF, bounded even after stdin prefetch."""
    stream = context.get('stdin')
    if stream is None:
        return None
    raw, descriptor, blocking = bytearray(), None, None
    end = min(context['deadline'], time.monotonic() + 5)
    if isinstance(stream, io.BytesIO):
        raw.extend(stream.read(8193))
    else:
        try:
            descriptor = stream.fileno()
            blocking = os.get_blocking(descriptor)
            _require(callable(getattr(stream, 'read1', None)), 'SETUP_CAPSULE_STREAM')
            os.set_blocking(descriptor, False)
            while True:
                remaining = end - time.monotonic()
                _require(remaining > 0, 'SETUP_CAPSULE_DEADLINE')
                # read1 consumes any bytes already buffered by bootstrap.readline.
                block = stream.read1(8193 - len(raw))
                if block:
                    raw.extend(block)
                    _require(len(raw) <= 8192, 'SETUP_CAPSULE_LIMIT')
                    continue
                if select.select([descriptor], [], [], min(.05, remaining))[0]:
                    block = stream.read1(8193 - len(raw))
                    if not block:
                        break  # Kernel EOF, not a temporary nonblocking no-data read.
                    raw.extend(block)
                    _require(len(raw) <= 8192, 'SETUP_CAPSULE_LIMIT')
        finally:
            if descriptor is not None and blocking is not None:
                os.set_blocking(descriptor, blocking)
    _require(len(raw) <= 8192, 'SETUP_CAPSULE_LIMIT')
    if not raw:
        return None
    _require(raw.endswith(b'\n') and raw.count(b'\n') == 1, 'SETUP_CAPSULE_FRAME')
    value = _stage_diag_json(bytes(raw))
    _require(type(value) is dict, 'SETUP_CAPSULE_FIELDS')
    encoded = (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode('ascii')
    _require(bytes(raw) == encoded, 'SETUP_CAPSULE_BINDING')
    if value.get('schema') == 'helmut-runtime-metadata-capsule-v1':
        _runtime_metadata_capsule(value)
        return value
    if value.get('schema') == 'helmut-daemon-binding-capsule-v1':
        _daemon_binding_capsule(value)
        return value
    if value.get('schema') == 'helmut-context-continuation-capsule-v1':
        _continuation_capsule(value)
        return value
    _require(set(value) == {'schema', 'contract_id', 'action', 'phase',
             'source_sha256', 'contract_sha256', 'nonce', 'inspection_nonce',
             'inspection_result_sha256', 'issued_at_utc', 'expires_at_utc'}, 'SETUP_CAPSULE_FIELDS')
    _require(value['schema'] == 'helmut-setup-successor-capsule-v1'
             and value['contract_id'] == SETUP_SUCCESSOR_ID, 'SETUP_CAPSULE_BINDING')
    _require(value['action'] in ('inspect', 'setup') and
             (value['phase'] is None if value['action'] == 'inspect' else
              value['phase'] in ('recover', 'checkout', 'context', 'image')), 'SETUP_CAPSULE_PHASE')
    _require(all(type(value[k]) is str and re.fullmatch('[a-f0-9]{64}', value[k])
                 for k in ('source_sha256', 'contract_sha256', 'nonce')), 'SETUP_CAPSULE_BINDING')
    return value


def _setup_public_source(commit, path, deadline, limit, expected_sha=None, expected_bytes=None):
    allowed = {'scripts/hetzner-native-setup-successor.py',
               'scripts/hetzner-native-setup-coordinator.py',
               'scripts/hetzner-native-setup-successor-preflight.py',
               'scripts/hetzner-native-runtime-metadata.py', 'scripts/hetzner-native-daemon-binding.py', SETUP_SUCCESSOR_CONTRACT,
               'scripts/hetzner-native-context-continuation-coordinator.py', CONTINUATION_CONTRACT}
    _require(type(commit) is str and re.fullmatch('[a-f0-9]{40}', commit)
             and path in allowed and type(limit) is int and 0 < limit <= 131072, 'SETUP_SOURCE_BINDING')
    _require((path in (SETUP_SUCCESSOR_CONTRACT,CONTINUATION_CONTRACT) and expected_sha is None and expected_bytes is None)
             or (path not in (SETUP_SUCCESSOR_CONTRACT,CONTINUATION_CONTRACT) and type(expected_sha) is str and re.fullmatch('[a-f0-9]{64}', expected_sha)
                 and type(expected_bytes) is int and 0 < expected_bytes <= limit), 'SETUP_SOURCE_BINDING')
    remaining = deadline - time.monotonic()
    _require(0 < remaining <= 300, 'SETUP_DEADLINE')
    connection = http.client.HTTPSConnection('raw.githubusercontent.com', timeout=min(10, remaining))
    try:
        connection.request('GET', '/ernisch/helmut-pilot/' + commit + '/' + path,
                           headers={'Accept': 'text/plain', 'Connection': 'close',
                                    'User-Agent': 'HELMUT-qualified-setup-successor'})
        peer = connection.sock
        response = connection.getresponse()
        _require(response.status == 200, 'SETUP_SOURCE_HTTP')
        raw = bytearray()
        while not response.isclosed():
            remaining = deadline - time.monotonic()
            _require(remaining > 0, 'SETUP_DEADLINE')
            peer.settimeout(min(10, remaining))
            block = response.read1(min(65536, limit + 1 - len(raw)))
            if not block:
                break
            raw.extend(block)
            _require(len(raw) <= limit, 'SETUP_SOURCE_LIMIT')
        raw = bytes(raw)
        if expected_sha is not None:
            _require(len(raw) == expected_bytes and hashlib.sha256(raw).hexdigest() == expected_sha,
                     'SETUP_SOURCE_HASH')
        return raw
    finally:
        connection.close()


def _setup_successor_handle(request, context, capsule):
    if capsule.get('schema') == 'helmut-context-continuation-capsule-v1':
        return _continuation_handle(request, context, capsule)
    _require(_setup_successor_qualified(), 'SETUP_SUCCESSOR_NOT_QUALIFIED')
    commit, deadline = context['deployment_commit'], context['deadline']
    manifest = _setup_public_source(commit, SETUP_SUCCESSOR_CONTRACT, deadline, 32768)
    contract = _stage_diag_json(manifest)
    _require(type(contract) is dict and contract.get('server_sha256') == context['source_sha256']
             and contract.get('coordinator_sha256') == SETUP_SUCCESSOR_COORDINATOR_SHA256,
             'SETUP_CONTRACT_SOURCE')
    modules = {}
    for name, filename, pin, size in (
            ('library', 'hetzner-native-setup-coordinator.py', SETUP_COORDINATOR_SHA256, SETUP_COORDINATOR_BYTES),
            ('preflight', 'hetzner-native-setup-successor-preflight.py', SETUP_SUCCESSOR_PREFLIGHT_SHA256,
             SETUP_SUCCESSOR_PREFLIGHT_BYTES),
            ('coordinator', 'hetzner-native-setup-successor.py', SETUP_SUCCESSOR_COORDINATOR_SHA256,
             SETUP_SUCCESSOR_COORDINATOR_BYTES)):
        raw = _setup_public_source(commit, 'scripts/' + filename, deadline, size, pin, size)
        namespace = {'__name__': 'helmut_qualified_setup_successor_' + name,
                     '__file__': '<qualified-public-' + filename + '>', '__source_bytes__': raw}
        exec(compile(raw, namespace['__file__'], 'exec'), namespace)
        modules[name] = namespace
    entry = modules['coordinator'].get('coordinate_successor')
    _require(callable(entry), 'SETUP_ENTRYPOINT')
    selected_context = {name: context[name] for name in ('base', 'source_sha256', 'deployment_commit', 'deadline')}
    return entry(request, selected_context, capsule, manifest, modules['library'], modules['preflight'])


def _setup_successor_failure(code, capsule):
    continuation = capsule.get('schema') == 'helmut-context-continuation-capsule-v1'
    return {'schema': 'helmut-context-continuation-result-v1' if continuation else 'helmut-setup-successor-result-v1',
        'status':'FAIL_KEEP_STATE_NO_RETRY','contract_id':CONTINUATION_ID if continuation else SETUP_SUCCESSOR_ID,
        'contract_sha256':capsule['contract_sha256'],'phase':capsule['phase'] if capsule['phase'] is not None else 'preflight',
        'code':code,'authority_sha256':None,'attempt_sha256':None,'ready_sha256':None,'accepted_sha256':None,
        'lifecycle_sha256':None,'native_qualified':False,'native_go_consumed':False}


def _continuation_capsule(v):
    # The pinned coordinator checks full action/phase/time/inspection semantics
    # before loading components or opening the setup lock. This is framing only.
    _require(type(v) is dict and set(v)=={'schema','contract_id','action','phase','source_sha256','contract_sha256',
        'nonce','inspection_nonce','inspection_result_sha256','issued_at_utc','expires_at_utc'}
        and v['schema']=='helmut-context-continuation-capsule-v1' and v['contract_id']==CONTINUATION_ID
        and v['action'] in ('inspect','setup'), 'CONTINUATION_CAPSULE')


def _continuation_handle(request, context, capsule):
    _require(type(CONTINUATION_SHA256) is str and re.fullmatch('[a-f0-9]{64}',CONTINUATION_SHA256)
        and type(CONTINUATION_BYTES) is int and 0<CONTINUATION_BYTES<=65536, 'CONTINUATION_NOT_QUALIFIED')
    _continuation_capsule(capsule)
    raw=_setup_public_source(context['deployment_commit'],'scripts/hetzner-native-context-continuation-coordinator.py',
        context['deadline'],CONTINUATION_BYTES,CONTINUATION_SHA256,CONTINUATION_BYTES)
    parent={'__name__':'qualified_context_continuation','__source_bytes__':raw}
    exec(compile(raw,'<qualified-context-continuation>','exec'),parent)
    manifest=_setup_public_source(context['deployment_commit'],CONTINUATION_CONTRACT,context['deadline'],16384)
    _require(hashlib.sha256(manifest).hexdigest()==capsule['contract_sha256'], 'CONTINUATION_CONTRACT_HASH')
    reader,qualified=_runtime_metadata_modules(context)
    return parent['coordinate_continuation'](request,{k:context[k] for k in ('base','source_sha256','deployment_commit','deadline')},
        capsule,manifest,reader,qualified)


def _daemon_binding_capsule(value):
    _require(type(value) is dict and set(value) == {'schema', 'contract_id', 'action',
             'source_sha256', 'contract_sha256', 'nonce', 'issued_at_utc', 'expires_at_utc'}
             and value['schema'] == 'helmut-daemon-binding-capsule-v1'
             and value['contract_id'] == DAEMON_BINDING_ID and value['action'] == 'read'
             and value['contract_sha256'] == DAEMON_BINDING_CONTRACT_SHA256, 'DAEMON_BINDING_CAPSULE')
    _require(all(type(value[k]) is str and re.fullmatch('[a-f0-9]{64}', value[k])
                 for k in ('source_sha256', 'contract_sha256', 'nonce')), 'DAEMON_BINDING_CAPSULE')
    _require(type(value['issued_at_utc']) is int and type(value['expires_at_utc']) is int
             and 0 < value['issued_at_utc'] < value['expires_at_utc']
             and value['expires_at_utc'] - value['issued_at_utc'] <= 300
             and value['issued_at_utc'] <= time.time() <= value['expires_at_utc'], 'DAEMON_BINDING_CAPSULE_TIME')


def _daemon_binding_qualified():
    return (_runtime_metadata_qualified() and type(DAEMON_BINDING_SHA256) is str
            and re.fullmatch('[a-f0-9]{64}', DAEMON_BINDING_SHA256) is not None
            and type(DAEMON_BINDING_BYTES) is int and 0 < DAEMON_BINDING_BYTES <= 65536)


def _daemon_binding_handle(request, context, capsule):
    _require(_daemon_binding_qualified(), 'DAEMON_BINDING_NOT_QUALIFIED')
    _daemon_binding_capsule(capsule)
    reader, modules = _runtime_metadata_modules(context)
    raw = _setup_public_source(context['deployment_commit'], 'scripts/hetzner-native-daemon-binding.py',
                              context['deadline'], DAEMON_BINDING_BYTES, DAEMON_BINDING_SHA256, DAEMON_BINDING_BYTES)
    observer = {'__name__': 'helmut_qualified_daemon_binding', '__file__': '<qualified-daemon-binding>',
                '__source_bytes__': raw}
    exec(compile(raw, observer['__file__'], 'exec'), observer)
    _require(observer.get('CONTRACT_ID') == DAEMON_BINDING_ID
             and observer.get('CONTRACT_SHA256') == capsule['contract_sha256'], 'DAEMON_BINDING_CONTRACT')
    entry = observer.get('observe_daemon_binding')
    _require(callable(entry), 'DAEMON_BINDING_ENTRYPOINT')
    result = entry({key: context[key] for key in ('base', 'source_sha256', 'deployment_commit', 'deadline')},
                   reader, modules)
    _daemon_binding_capsule(capsule)
    return result


def _daemon_binding_failure(code, capsule, context):
    return {'schema': 'helmut-native-daemon-binding-observation-v1', 'status': 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED',
        'contract_id': DAEMON_BINDING_ID, 'contract_sha256': capsule['contract_sha256'],
        'source_sha256': context['source_sha256'], 'code': code,
        'partial_setup_proof': None, 'failure_diagnostic': None, 'observation': None,
        'native_qualified': False, 'native_go_consumed': False}


def _runtime_metadata_capsule(value):
    _require(type(value) is dict and set(value) == {'schema', 'contract_id', 'action', 'chunk',
             'source_sha256', 'contract_sha256', 'nonce', 'issued_at_utc', 'expires_at_utc'}
             and value['schema'] == 'helmut-runtime-metadata-capsule-v1'
             and value['contract_id'] == RUNTIME_METADATA_ID and value['action'] == 'read'
             and value['contract_sha256'] == RUNTIME_METADATA_CONTRACT_SHA256
             and type(value['chunk']) is int and 0 <= value['chunk'] < 4, 'RUNTIME_CAPSULE')
    _require(all(type(value[k]) is str and re.fullmatch('[a-f0-9]{64}', value[k])
                 for k in ('source_sha256', 'contract_sha256', 'nonce')), 'RUNTIME_CAPSULE')
    _require(type(value['issued_at_utc']) is int and type(value['expires_at_utc']) is int
             and 0 < value['issued_at_utc'] < value['expires_at_utc']
             and value['expires_at_utc'] - value['issued_at_utc'] <= 300
             and value['issued_at_utc'] <= time.time() <= value['expires_at_utc'], 'RUNTIME_CAPSULE_TIME')


def _runtime_metadata_qualified():
    return (type(RUNTIME_METADATA_SHA256) is str
            and re.fullmatch('[a-f0-9]{64}', RUNTIME_METADATA_SHA256) is not None
            and type(RUNTIME_METADATA_BYTES) is int and 0 < RUNTIME_METADATA_BYTES <= 65536
            and _setup_successor_qualified())


def _runtime_metadata_modules(context):
    _require(_runtime_metadata_qualified(), 'RUNTIME_NOT_QUALIFIED')
    deadline = context['deadline']
    raw = _setup_public_source(context['deployment_commit'], 'scripts/hetzner-native-runtime-metadata.py',
                              deadline, RUNTIME_METADATA_BYTES, RUNTIME_METADATA_SHA256, RUNTIME_METADATA_BYTES)
    reader = {'__name__': 'helmut_qualified_runtime_metadata', '__file__': '<qualified-runtime-metadata>',
              '__source_bytes__': raw}
    exec(compile(raw, reader['__file__'], 'exec'), reader)
    _require(reader.get('CONTRACT_ID') == RUNTIME_METADATA_ID
             and reader.get('CONTRACT_SHA256') == RUNTIME_METADATA_CONTRACT_SHA256, 'RUNTIME_CONTRACT')
    modules = {}
    for name, filename, pin, size in (
            ('library', 'hetzner-native-setup-coordinator.py', SETUP_COORDINATOR_SHA256, SETUP_COORDINATOR_BYTES),
            ('preflight', 'hetzner-native-setup-successor-preflight.py', SETUP_SUCCESSOR_PREFLIGHT_SHA256,
             SETUP_SUCCESSOR_PREFLIGHT_BYTES),
            ('successor', 'hetzner-native-setup-successor.py', SETUP_SUCCESSOR_COORDINATOR_SHA256,
             SETUP_SUCCESSOR_COORDINATOR_BYTES)):
        raw = _setup_public_source(RUNTIME_SETUP_COMMIT, 'scripts/' + filename, deadline, size, pin, size)
        module = {'__name__': 'helmut_historical_setup_' + name, '__file__': '<historical-' + filename + '>',
                  '__source_bytes__': raw}
        exec(compile(raw, module['__file__'], 'exec'), module)
        modules[name] = module
    old_context = {'base': TARGET_BASE, 'source_sha256': RUNTIME_SETUP_SOURCE,
                   'deployment_commit': RUNTIME_SETUP_COMMIT, 'deadline': deadline}
    expected, _ = modules['library']['asset_pins']()
    _, assets = modules['library']['load_assets'](old_context, expected)
    modules.update(assets)
    pins = reader.get('MODULE_PINS')
    _require(type(pins) is dict and set(pins) == set(modules), 'RUNTIME_MODULE_PINS')
    filenames = dict(modules['library']['FILES']) | {
        'library': 'hetzner-native-setup-coordinator.py', 'preflight': 'hetzner-native-setup-successor-preflight.py',
        'successor': 'hetzner-native-setup-successor.py'}
    for name, module in modules.items():
        pin = pins[name]
        _require(type(pin) is dict and set(pin) == {'repoFile', 'sha256', 'bytes'}
                 and pin['repoFile'] == filenames[name]
                 and type(pin['bytes']) is int and 0 < pin['bytes'] <= 131072
                 and type(pin['sha256']) is str and re.fullmatch('[a-f0-9]{64}', pin['sha256'])
                 and len(module['__source_bytes__']) == pin['bytes']
                 and hashlib.sha256(module['__source_bytes__']).hexdigest() == pin['sha256'], 'RUNTIME_MODULE_PINS')
    return reader, modules


def _runtime_metadata_handle(request, context, capsule):
    if capsule.get('schema') == 'helmut-daemon-binding-capsule-v1':
        return _daemon_binding_handle(request, context, capsule)
    _runtime_metadata_capsule(capsule)
    reader, modules = _runtime_metadata_modules(context)
    entry = reader.get('read_runtime_metadata')
    _require(callable(entry), 'RUNTIME_ENTRYPOINT')
    result = entry(capsule['chunk'],
        {key: context[key] for key in ('base', 'source_sha256', 'deployment_commit', 'deadline')}, modules)
    _runtime_metadata_capsule(capsule)
    return result


def _runtime_metadata_failure(code, capsule, context):
    if capsule.get('schema') == 'helmut-daemon-binding-capsule-v1':
        return _daemon_binding_failure(code, capsule, context)
    return {'schema': 'helmut-runtime-binding-metadata-read-v1', 'status': 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED',
        'contract_id': RUNTIME_METADATA_ID, 'contract_sha256': capsule['contract_sha256'],
        'source_sha256': context['source_sha256'],
        'dataset_sha256': '71e661eeaa3a71c74a7dc9aa7d5cf6568e12f728365f2a3b97fa08c1e8076475',
        'dataset_bytes': 207733, 'chunk_index': capsule['chunk'], 'code': code, 'data_base64': None,
        'native_qualified': False, 'native_go_consumed': False}


def _setup_watchdog(request, context, successor_capsule=None, runtime_capsule=None):
    """Absolute bound covers public-source DNS/headers and the whole coordinator.

    A live setup service independently observes this child's pidfd. Killing this
    own group therefore cannot leave its separately grouped helper descendants
    unmonitored: the service guard stops its own systemd control group.
    """
    successor = successor_capsule is not None
    runtime = runtime_capsule is not None
    _require(not (successor and runtime), 'SETUP_CAPSULE_MODE')
    _require(_runtime_metadata_qualified() if runtime else
             _setup_successor_qualified() if successor else _setup_qualified(), 'SETUP_NOT_QUALIFIED')
    result_limit = 131072 if runtime else 32768
    def failure(code):
        if runtime: return _runtime_metadata_failure(code, runtime_capsule, context)
        return _setup_successor_failure(code, successor_capsule) if successor else _setup_failure(code)
    deadline = context['deadline']
    _require(0 < deadline-time.monotonic() <= 300, 'SETUP_DEADLINE')
    read_end, write_end = os.pipe2(os.O_CLOEXEC)
    parent_pid = os.getpid()
    pid = os.fork()
    if pid == 0:
        try:
            os.close(read_end)
            os.setsid()
            library = ctypes.CDLL(None, use_errno=True)
            _require(library.prctl(1, signal.SIGKILL, 0, 0, 0) == 0
                     and os.getppid() == parent_pid, 'SETUP_PARENT_LOST')
            try:
                result = (_runtime_metadata_handle(request, context, runtime_capsule) if runtime else
                          _setup_successor_handle(request, context, successor_capsule) if successor
                          else _setup_handle(request, context))
            except BaseException as error:
                code = getattr(error, 'code', None)
                if type(code) is not str or not re.fullmatch('[A-Z][A-Z0-9_]{0,63}', code):
                    code = 'SETUP_CHILD_FAILURE'
                result = failure(code)
                if not (successor or runtime): _setup_first_failure(result)
            raw = (json.dumps(result, sort_keys=True, separators=(',', ':'), allow_nan=False)+'\n').encode()
            _require(len(raw) <= result_limit, 'SETUP_RESULT_LIMIT')
            offset = 0
            while offset < len(raw):
                count = os.write(write_end, raw[offset:])
                _require(count > 0, 'SETUP_RESULT_WRITE')
                offset += count
            os.close(write_end)
            os._exit(1 if result.get('status') in ('FAIL_KEEP_STATE_NO_RETRY', 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED') else 0)
        except BaseException:
            os._exit(1)
    os.close(write_end)
    waited, result = False, None
    try:
        os.set_blocking(read_end, False)
        raw = bytearray()
        with selectors.DefaultSelector() as selector:
            selector.register(read_end, selectors.EVENT_READ)
            while selector.get_map():
                remaining = deadline-time.monotonic()
                _require(remaining > 0, 'SETUP_DEADLINE')
                space = os.statvfs(TARGET_BASE)
                _require(space.f_bavail*space.f_frsize >= 8*1024**3, 'SETUP_FREE_SPACE')
                if not selector.select(min(.25, remaining)): continue
                block = os.read(read_end, min(65536, result_limit+1-len(raw)))
                if not block: selector.unregister(read_end)
                else: raw.extend(block)
                _require(len(raw) <= result_limit, 'SETUP_RESULT_LIMIT')
        while True:
            child, status = os.waitpid(pid, os.WNOHANG)
            if child:
                waited = True
                break
            _require(time.monotonic() < deadline, 'SETUP_DEADLINE')
            time.sleep(.01)
        result = _stage_diag_json(bytes(raw))
        schemas = (('helmut-native-daemon-binding-observation-v1',) if runtime and
                   runtime_capsule.get('schema') == 'helmut-daemon-binding-capsule-v1' else
                   ('helmut-runtime-binding-metadata-read-v1',) if runtime else
                   ('helmut-setup-successor-result-v1', 'helmut-setup-successor-inspection-v1',
                    'helmut-context-continuation-result-v1', 'helmut-context-continuation-inspection-v1') if successor
                   else ('helmut-target-setup-result-v1',))
        _require(type(result) is dict and result.get('schema') in schemas
                 and result.get('native_qualified') is False and result.get('native_go_consumed') is False,
                 'SETUP_RESULT')
        failed = result.get('status') in ('FAIL_KEEP_STATE_NO_RETRY', 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED')
        _require(os.waitstatus_to_exitcode(status) == (1 if failed else 0), 'SETUP_CHILD_EXIT')
        if failed and not (successor or runtime): _setup_first_failure(result)
        return result
    except BaseException as error:
        code = getattr(error, 'code', None)
        if type(code) is not str or not re.fullmatch('[A-Z][A-Z0-9_]{0,63}', code):
            code = 'SETUP_WATCHDOG_FAILURE'
        result = failure(code)
        if not (successor or runtime): _setup_first_failure(result)
        return result
    finally:
        if not waited:
            try: os.killpg(pid, signal.SIGKILL)
            except ProcessLookupError:
                try: os.kill(pid, signal.SIGKILL)
                except ProcessLookupError: pass
            limit = time.monotonic()+5
            while time.monotonic() < limit:
                child, _ = os.waitpid(pid, os.WNOHANG)
                if child: waited = True; break
                time.sleep(.01)
            if not waited:
                # This remains a failed/unknown operation, never successful EOF.
                if result is not None: result['code'] = 'SETUP_CHILD_UNCONFIRMED'
        os.close(read_end)


def handle(request,context):
    global _CONTROL_DEADLINE
    _CONTROL_DEADLINE=context.get('deadline')
    _require(context['base']==TARGET_BASE,'SERVER_BASE_BINDING')
    operation=request['operation']
    capsule = _setup_read_capsule(context) if operation in ('status', 'admit') else None
    if capsule is not None:
        if capsule['schema']=='helmut-context-continuation-capsule-v1':
            _require(operation==('status' if capsule['action']=='inspect' else 'admit')
                and capsule['source_sha256']==context['source_sha256']==request['payload_sha256']
                and request['plan_sha256']==STAGE_PLAN, 'CONTINUATION_REQUEST')
            raw=(json.dumps(capsule,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode('ascii')
            _require(request['nonce']==hashlib.sha256(b'helmut-context-continuation-request-v1\0'+raw).hexdigest(), 'CONTINUATION_NONCE')
            return _setup_watchdog(request,context,successor_capsule=capsule)
        if capsule['schema'] in ('helmut-runtime-metadata-capsule-v1', 'helmut-daemon-binding-capsule-v1'):
            _require(set(request) == {'schema', 'operation', 'nonce', 'plan_sha256', 'payload_sha256'}
                     and operation == 'status' and request.get('schema') == 'helmut-native-control-request-v1'
                     and request.get('plan_sha256') == STAGE_PLAN
                     and capsule['source_sha256'] == context['source_sha256'] == request['payload_sha256'],
                     'RUNTIME_REQUEST_BINDING')
            encoded = (json.dumps(capsule, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode('ascii')
            prefix = (b'helmut-daemon-binding-request-v1\0' if capsule['schema'] == 'helmut-daemon-binding-capsule-v1'
                      else b'helmut-runtime-metadata-request-v1\0')
            _require(request['nonce'] == hashlib.sha256(prefix + encoded).hexdigest(),
                     'RUNTIME_REQUEST_NONCE')
            return _setup_watchdog(request, context, runtime_capsule=capsule)
        _require(operation == ('status' if capsule['action'] == 'inspect' else 'admit'), 'SETUP_CAPSULE_OPERATION')
        _require(capsule['source_sha256'] == context['source_sha256'], 'SETUP_CAPSULE_SOURCE')
        encoded = (json.dumps(capsule, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode('ascii')
        _require(request['nonce'] == hashlib.sha256(b'helmut-setup-successor-request-v1\0' + encoded).hexdigest(),
                 'SETUP_CAPSULE_NONCE')
        return _setup_watchdog(request, context, successor_capsule=capsule)
    if operation=='status':
        return {'status':'CONTROL_READY','enabled_operations':['status','recipient','stage']
                    + (['admit'] if _setup_qualified() else []),
                'native_enabled':False,'source_sha256':context['source_sha256'],
                'recipient_diagnostic':_recipient_diagnostic(),'stage_diagnostic':_stage_diagnostic()}
    if operation=='stage':return _stage_handle(request,context)
    if operation=='admit':return _setup_watchdog(request,context)
    _require(operation=='recipient','NATIVE_OPERATION_NOT_QUALIFIED')
    return _recipient_ready(True)
