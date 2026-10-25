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
NATIVE_GO_PLAN_SHA256 = None
_CONTROL_DEADLINE = None

def _first_tool_error(output,code):
    descriptor=None
    try:
        descriptor=_open_base(TARGET_BASE)
        record={'code':code,'stdout_sha256':hashlib.sha256(output[0]).hexdigest(),
                'stderr_sha256':hashlib.sha256(output[1]).hexdigest(),
                'stderr_prefix_base64':base64.b64encode(bytes(output[1][:8192])).decode('ascii')}
        _json_new(descriptor,'GPG_FIRST_TOOL_ERROR.PRIVATE.json',record)
    except Exception:pass
    finally:
        if descriptor is not None:os.close(descriptor)

def _bounded_tool(path,args,input=None,timeout=30):
    _require(path == '/usr/bin/env' and tuple(args[:5]) == ('-i','PATH=/usr/bin:/bin','LC_ALL=C','/usr/bin/gpg','--no-options'), 'EXECUTOR_COMMAND')
    process=subprocess.Popen([path,*args],stdin=subprocess.PIPE if input is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C'},
        cwd=TARGET_BASE,start_new_session=True,close_fds=True)
    output=[bytearray(),bytearray()];selector=selectors.DefaultSelector();end=time.monotonic()+timeout
    if _CONTROL_DEADLINE is not None:end=min(end,_CONTROL_DEADLINE)
    try:
        if input is not None:
            process.stdin.write(input);process.stdin.close()
        for i,pipe in enumerate((process.stdout,process.stderr)):
            os.set_blocking(pipe.fileno(),False);selector.register(pipe,selectors.EVENT_READ,i)
        while selector.get_map():
            _require(time.monotonic()<end,'TOOL_TIMEOUT')
            for key,_ in selector.select(min(.25,max(0,end-time.monotonic()))):
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
        try:os.killpg(process.pid,signal.SIGKILL)
        except OSError:pass
        try:process.wait(timeout=5)
        except Exception:pass
        raise
    finally:
        selector.close()
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

def handle(request,context):
    global _CONTROL_DEADLINE
    _CONTROL_DEADLINE=context.get('deadline')
    _require(context['base']==TARGET_BASE,'SERVER_BASE_BINDING')
    operation=request['operation']
    if operation=='status':
        return {'status':'CONTROL_READY','enabled_operations':['status','recipient'],
                'native_enabled':False,'source_sha256':context['source_sha256']}
    _require(operation=='recipient','NATIVE_OPERATION_NOT_QUALIFIED')
    result_path=TARGET_BASE+'/'+RESULT_NAME
    if not os.path.lexists(result_path):
        result=create_recipient(TARGET_BASE,_bounded_tool)
        _require(result['ok'],'RECIPIENT_CREATION_FAILED')
    result=json.loads(_read_public_file(result_path))
    _require(result.get('ok') is True and result.get('phase')=='complete','RECIPIENT_NOT_ACCEPTED')
    public=_read_public_file(TARGET_BASE+'/'+PUBLIC_NAME)
    _public_armor(public)
    _require(hashlib.sha256(public).hexdigest()==result['public_key_sha256'],'RECIPIENT_PUBLIC_HASH')
    _require(result['primary_expires_unix']>time.time() and result['subkey_expires_unix']>time.time(),'RECIPIENT_EXPIRED')
    return {'status':'RECIPIENT_READY','recipient':{'fingerprint':result['primary_fingerprint'],
            'public_key_base64':base64.b64encode(public).decode('ascii'),'public_sha256':result['public_key_sha256']}}
