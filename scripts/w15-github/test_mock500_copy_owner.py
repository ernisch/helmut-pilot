"""One opt-in CI copy/reader experiment; defaults to small, Docker-free tests.

Uses only the existing synthetic CI service image, one inert container and one
fictional descriptor. A positive defect finding deliberately exits nonzero.
Neither outcome establishes the historical Mock500 first failure.
"""
import sys
sys.dont_write_bytecode = True

import argparse
import ast
import errno
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tempfile
import time
import unittest
import uuid
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch

SCRIPT = Path(__file__).absolute()
REPO = SCRIPT.parents[2]
HEAD_REF = 'codex/w15-mock500-first-failure-checkpoint-20261102'
CONTROLLER = 'scripts/synthetik-500-w15-full500-controller.py'
BINDINGS = 'scripts/w15-github/mock500_bindings.js'
SOURCES = (str(SCRIPT.relative_to(REPO)), CONTROLLER, BINDINGS,
           'scripts/w15-github/runner_diagnostics.py',
           'scripts/fixtures/w15-memory-contract.json', 'scripts/fixtures/w15-local-memory-budget.json')
BASE = '/tmp/w15-full500-20261028d'
TARGET = BASE + '/state/mock-context.PRIVATE.json'
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
SELECTORS = ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH')
OLD_COPY = "def copy_in(src,dst):docker('cp',str(src),CONTAINER+':'+dst)"
SHA = re.compile('[a-f0-9]{40}')
ID = re.compile('[a-f0-9]{64}')
LABEL = 'helmut.w15.synthetic-copy-owner'
CATEGORIES = {'ACCEPTED', 'ACCESS_DENIED', 'ASSERTION_REJECTED', 'OTHER_REJECTION'}
PHASES = {'binding', 'service-image', 'fixture', 'container', 'controller-import', 'copy', 'default-reader',
          'counter-reader', 'closure'}
COPY_PHASES = {'uid-binding', 'original-cwd', 'fixture-cwd', 'copy-command', 'child-wait'}
ERROR_CLASSES = {'NONE', 'PermissionError', 'FileNotFoundError', 'TimeoutExpired',
                 'CommandFailure', 'RuntimeError', 'Other'}
ERRNOS = {'NONE', 'EACCES', 'EPERM', 'ENOENT', 'UNKNOWN'}
COMMAND_RESULTS = {'NO_RESULT', 'ACCEPTED', 'READ_ONLY_FILESYSTEM', 'ACCESS_DENIED',
                   'ENTRY_MISSING', 'OTHER_REJECTION', 'TIMEOUT'}


def need(value):
    if not value:
        raise RuntimeError('SYNTHETIC_COPY_OWNER_CHECK_REJECTED')


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('ascii')


def uid_map(raw):
    """Numeric, bounded native user-namespace rows; never arbitrary child text."""
    need(type(raw) is bytes and 0 < len(raw) <= 512)
    rows = [line.split() for line in raw.decode('ascii').splitlines()]
    need(1 <= len(rows) <= 5 and all(len(row) == 3 for row in rows))
    need(all(re.fullmatch('[0-9]{1,10}', cell) for row in rows for cell in row))
    result = [[int(cell) for cell in row] for row in rows]
    need(all(0 <= n <= 2**32 - 1 for row in result for n in row) and all(row[2] > 0 for row in result))
    return result


def reader_packet(raw, code):
    need(type(raw) is bytes and 0 < len(raw) <= 512)
    value = json.loads(raw)
    need(type(value) is dict and set(value) == {'uid', 'gid', 'accepted', 'category'}
         and type(value['uid']) is int and value['uid'] == 1000
         and type(value['gid']) is int and value['gid'] == 1000
         and type(value['accepted']) is bool and value['category'] in CATEGORIES
         and value['accepted'] is (value['category'] == 'ACCEPTED')
         and type(code) is int and code == (0 if value['accepted'] else 2))
    return value


def finding(default, counter, owner):
    if owner == 0 and default['category'] == 'ACCESS_DENIED' and counter['accepted']:
        return 'DEFAULT_OWNER_ACCESS_DENIED_COUNTER_CORRECTED'
    if owner == 1000 and default['accepted'] and counter['category'] == 'ACCESS_DENIED':
        return 'DEFAULT_READER_ACCEPTED_NEGATIVE_OWNER_CONTROL_REJECTED'
    return 'INCONCLUSIVE'


def provenance(security):
    need(type(security) is list and len(security) <= 16 and all(type(v) is str and len(v) <= 128 for v in security))
    return ('ROOTLESS_REPORTED' if any('rootless' in v for v in security) else
            'USER_NAMESPACE_REPORTED' if any('name=userns' in v for v in security) else
            'NO_USER_NAMESPACE_OPTION_REPORTED')


def closed_error(error):
    """No class names, exception arguments or messages from arbitrary errors."""
    kind = ('PermissionError' if isinstance(error, PermissionError) else
            'FileNotFoundError' if isinstance(error, FileNotFoundError) else
            'TimeoutExpired' if isinstance(error, subprocess.TimeoutExpired) else
            'RuntimeError' if type(error) is RuntimeError else 'Other')
    number = error.errno if isinstance(error, OSError) else None
    return kind, {errno.EACCES: 'EACCES', errno.EPERM: 'EPERM', errno.ENOENT: 'ENOENT'}.get(number, 'UNKNOWN')


def command_stderr(raw):
    """Classify a bounded prefix only; never retain or emit native error text."""
    if type(raw) is not bytes:
        return 'OTHER_REJECTION'
    value = raw[:8192].lower()
    if b'read-only' in value and any(part in value for part in (b'file system', b'filesystem', b'rootfs', b'container')):
        return 'READ_ONLY_FILESYSTEM'
    if b'permission denied' in value or b'access is denied' in value:
        return 'ACCESS_DENIED'
    if b'no such file or directory' in value or b'could not find the file' in value:
        return 'ENTRY_MISSING'
    return 'OTHER_REJECTION'


def copy_report(raw):
    need(type(raw) is bytes and 0 < len(raw) <= 1024)
    value = json.loads(raw)
    need(type(value) is dict and set(value) == {'status', 'phase', 'errorClass', 'errno', 'originalCwd', 'originalCwdErrno',
         'fixtureCwd', 'uid', 'gid', 'copyCommandInvoked', 'commandResult', 'commandReturncode'}
         and value['status'] in ('PASS', 'FAIL') and value['phase'] in COPY_PHASES
         and value['errorClass'] in ERROR_CLASSES and value['errno'] in ERRNOS and value['originalCwdErrno'] in ERRNOS
         and value['commandResult'] in COMMAND_RESULTS
         and (type(value['commandReturncode']) is int and -255 <= value['commandReturncode'] <= 255
              or value['commandReturncode'] == 'UNKNOWN')
         and all(value[key] in ('PASS', 'ACCESS_DENIED', 'MISSING', 'UNKNOWN') for key in ('originalCwd', 'fixtureCwd'))
         and all(type(value[key]) is int and 0 <= value[key] < 2**32 or value[key] == 'UNKNOWN' for key in ('uid', 'gid'))
         and (type(value['copyCommandInvoked']) is bool or value['copyCommandInvoked'] == 'UNKNOWN'))
    need(value['status'] != 'PASS' or (value['phase'] == 'copy-command' and value['uid'] == value['gid'] == 1000
         and value['fixtureCwd'] == 'PASS' and value['copyCommandInvoked'] is True
         and value['errorClass'] == value['errno'] == 'NONE'
         and value['commandResult'] == 'ACCEPTED' and value['commandReturncode'] == 0))
    return value


def copy_as_worker(controller, source, container, deadline):
    """The exact copy function, with a UID-owned test cwd; source stays untouched."""
    socket_gid = os.stat('/var/run/docker.sock').st_gid
    receiver, sender = os.pipe()
    try:
        pid = os.fork()
    except BaseException:
        os.close(receiver); os.close(sender)
        raise
    if pid == 0:
        os.close(receiver)
        report = {'status': 'FAIL', 'phase': 'uid-binding', 'errorClass': 'Other', 'errno': 'UNKNOWN',
                  'originalCwd': 'UNKNOWN', 'originalCwdErrno': 'UNKNOWN', 'fixtureCwd': 'UNKNOWN', 'uid': 'UNKNOWN', 'gid': 'UNKNOWN',
                  'copyCommandInvoked': False, 'commandResult': 'NO_RESULT', 'commandReturncode': 'UNKNOWN'}
        try:
            os.setsid()
            fd = os.open('/dev/null', os.O_RDWR)
            for target in (0, 1, 2):
                os.dup2(fd, target)
            if fd > 2:
                os.close(fd)
            os.setgroups([socket_gid]); os.setgid(1000); os.setuid(1000)
            report.update(uid=os.getuid(), gid=os.getgid())
            need(os.getuid() == os.getgid() == 1000 and os.getgroups() == [socket_gid])
            report['phase'] = 'original-cwd'
            try:
                os.chdir(controller.ROOT)
                report.update(originalCwd='PASS', originalCwdErrno='NONE')
            except PermissionError as error:
                report.update(originalCwd='ACCESS_DENIED', originalCwdErrno=closed_error(error)[1])
            except FileNotFoundError:
                report.update(originalCwd='MISSING', originalCwdErrno='ENOENT')
            # Only the already imported test child changes this cwd selector.
            # The real worker has its own UID1000 staged repository. The CI
            # source checkout can have a different owner or ancestor access.
            report['phase'] = 'fixture-cwd'
            controller.ROOT = source.parent
            os.chdir(controller.ROOT)
            report['fixtureCwd'] = 'PASS'
            controller.CONTAINER = container
            original_run = controller.subprocess.run
            def observe_run(*argv, **kwargs):
                try:
                    completed = original_run(*argv, **kwargs)
                except subprocess.TimeoutExpired:
                    report['commandResult'] = 'TIMEOUT'
                    raise
                code = completed.returncode
                if type(code) is int and -255 <= code <= 255:
                    report['commandReturncode'] = code
                report['commandResult'] = 'ACCEPTED' if code == 0 else command_stderr(completed.stderr)
                return completed
            # Observe the genuine call's result without changing its arguments,
            # environment, cwd, return value or exception behavior. Child only.
            controller.subprocess = SimpleNamespace(run=observe_run, PIPE=subprocess.PIPE,
                                                    TimeoutExpired=subprocess.TimeoutExpired)
            report.update(phase='copy-command', copyCommandInvoked=True)
            controller.copy_in(source, TARGET)
            report.update(status='PASS', errorClass='NONE', errno='NONE')
        except BaseException as error:
            kind, number = closed_error(error)
            if type(error) is controller.CommandFailure:
                kind = 'CommandFailure'
            report.update(errorClass=kind, errno=number)
        finally:
            try:
                os.write(sender, canonical(report))
            except BaseException:
                report['status'] = 'FAIL'
            os.close(sender)
        os._exit(0 if report['status'] == 'PASS' else 1)
    os.close(sender)
    ended, end = False, min(deadline, time.monotonic() + 10)
    try:
        while time.monotonic() < end:
            child, status = os.waitpid(pid, os.WNOHANG)
            if child:
                ended = True
                report = copy_report(os.read(receiver, 1025))
                report['childExitCode'] = os.waitstatus_to_exitcode(status)
                need(report['childExitCode'] == (0 if report['status'] == 'PASS' else 1))
                return report
            time.sleep(.02)
        raise subprocess.TimeoutExpired('FIXED_COPY_CHILD_WAIT', 10)
    finally:
        if not ended:
            try:
                os.killpg(pid, signal.SIGKILL)
            except ProcessLookupError:
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            os.waitpid(pid, 0)
        os.close(receiver)


def native(args):
    start = time.monotonic(); deadline = start + 42; final_deadline = start + 60
    phase, container, root, token = 'binding', None, None, uuid.uuid4().hex
    create_attempted = False
    env = {key: value for key, value in os.environ.items() if key not in SELECTORS}
    result = {'schema': 'helmut-w15-ci-mock500-copy-owner/1', 'status': 'FAIL_OR_UNKNOWN',
              'finding': 'INCONCLUSIVE', 'profiles': 0, 'sqlCommands': 0, 'modelCalls': 0,
              'originalInputs': 0, 'newContainers': 0, 'imagePulls': 0, 'imageBuilds': 0,
              'historicalActualFirstFailureProven': False, 'executionAuthority': False,
              'cleanup': dict.fromkeys(('scopeVerified', 'containerStopped', 'containerRemoved', 'fixtureRemoved'), 'NOT_CREATED')}

    def run(argv, *, cleanup=False, checked=True, maximum=65536):
        remaining = (final_deadline if cleanup else deadline) - time.monotonic()
        need(remaining > .1)
        p = subprocess.run(argv, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, timeout=min(5, remaining))
        need(len(p.stdout) <= maximum and len(p.stderr) <= maximum)
        if checked:
            need(p.returncode == 0)
        return p

    def docker(*argv, **kwargs):
        return run(DOCKER + list(argv), **kwargs)

    def git(*argv):
        return run(['git', '--no-optional-locks', '-c', 'safe.directory=' + str(REPO),
                    '-c', 'core.hooksPath=/dev/null', '-C', str(REPO), *argv], maximum=2 * 1024 * 1024)

    def source_bound():
        for name in SOURCES:
            file = REPO / name
            need(file.is_file() and not file.is_symlink())
            need(git('cat-file', 'blob', args.source_head + ':' + name).stdout == file.read_bytes())

    def owned(cleanup=False):
        info = json.loads(docker('inspect', container, cleanup=cleanup).stdout)[0]
        need(info['Id'] == container and info['Name'] == '/w15-copy-owner-' + token
             and info['Config']['Labels'].get(LABEL) == token)
        return info

    def metadata():
        script = ('const f=require("node:fs"),c=require("node:crypto"),p=' + json.dumps(TARGET) + ';'
                  'const s=f.statSync(p);process.stdout.write(JSON.stringify({uid:s.uid,gid:s.gid,'
                  'mode:s.mode&511,links:s.nlink,sha256:c.createHash("sha256").update(f.readFileSync(p)).digest("hex")}));')
        value = json.loads(docker('exec', container, '/probe/node', '-e', script).stdout)
        need(type(value) is dict and set(value) == {'uid', 'gid', 'mode', 'links', 'sha256'}
             and all(type(value[k]) is int and 0 <= value[k] < 2**32 for k in ('uid', 'gid'))
             and value['mode'] == 0o600 and value['links'] == 1 and value['sha256'] == digest)
        return value

    def reader():
        script = ('let accepted=false,category="OTHER_REJECTION";try{'
                  'const b=require("/probe/bindings.js").readBound();'
                  'require("node:assert/strict").equal(b.bindingSHA256,"' + 'b' * 64 + '");'
                  'accepted=true;category="ACCEPTED";'
                  '}catch(e){if(e&&e.code==="EACCES")category="ACCESS_DENIED";'
                  'else if(e&&e.code==="ERR_ASSERTION")category="ASSERTION_REJECTED";}'
                  'process.stdout.write(JSON.stringify({uid:process.getuid(),gid:process.getgid(),accepted,category}));'
                  'process.exitCode=accepted?0:2;')
        p = docker('exec', '--user', '1000:1000', container, 'env', '-i', 'PATH=/usr/bin:/bin', 'LANG=C.UTF-8',
                   'HELMUT_W15_MOCK_CONTEXT=' + TARGET, 'HELMUT_W15_MOCK_CONTEXT_SHA256=' + digest,
                   '/probe/node', '-e', script, checked=False)
        return reader_packet(p.stdout, p.returncode)

    try:
        need(os.getuid() == os.getgid() == 0 and os.environ.get('GITHUB_ACTIONS') == 'true'
             and os.environ.get('GITHUB_EVENT_NAME') == 'pull_request'
             and os.environ.get('GITHUB_HEAD_REF') == HEAD_REF
             and SHA.fullmatch(args.expected_commit) and SHA.fullmatch(args.source_head)
             and os.environ.get('GITHUB_SHA') == args.expected_commit
             and os.environ.get('W15_COPY_OWNER_SOURCE_HEAD') == args.source_head
             and os.environ.get('GITHUB_RUN_ATTEMPT') == '1'
             and re.fullmatch('[1-9][0-9]{4,19}', os.environ.get('GITHUB_RUN_ID', ''))
             and ID.fullmatch(args.service_container))
        need(git('rev-parse', 'HEAD').stdout.strip().decode() == args.expected_commit)
        git('merge-base', '--is-ancestor', args.source_head, args.expected_commit)
        source_bound()
        tree = ast.parse((REPO / CONTROLLER).read_text())
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'copy_in')
        need(ast.get_source_segment((REPO / CONTROLLER).read_text(), function) == OLD_COPY)
        node = Path(args.node).resolve(strict=True)
        need(node.is_file() and not Path(args.node).is_symlink() and node.stat().st_mode & 0o111)
        need(run([str(node), '--version']).stdout == b'v24.19.0\n')
        result['sourceBinding'] = 'PR_MERGE_AND_EXACT_SOURCE_HEAD_BLOBS'
        result['hostProbeUIDMap'] = uid_map(Path('/proc/self/uid_map').read_bytes())
        phase = 'service-image'
        service = json.loads(docker('inspect', args.service_container).stdout)[0]
        image = service['Image']
        need(service['Id'] == args.service_container and service['State']['Running'] is True
             and re.fullmatch('sha256:[a-f0-9]{64}', image))
        docker('image', 'inspect', image)
        version = docker('info', '--format', '{{.ServerVersion}}').stdout.decode().strip()
        need(re.fullmatch(r'[0-9]{1,3}(?:\.[0-9]{1,3}){1,3}', version))
        result['daemonVersionParts'] = list(map(int, version.split('.')))
        security = json.loads(docker('info', '--format', '{{json .SecurityOptions}}').stdout)
        result['daemonProvenance'] = provenance(security)
        result['imageProvenance'] = 'EXISTING_RUNNING_SYNTHETIC_CI_SERVICE'
        phase = 'fixture'
        root = Path(tempfile.mkdtemp(prefix='w15-copy-owner-')); root.chmod(0o700); os.chown(root, 1000, 1000)
        work = root / 'work'; work.mkdir(mode=0o700); os.chown(work, 1000, 1000)
        state = work / 'state'; state.mkdir(mode=0o700); os.chown(state, 1000, 1000)
        nonce = '11111111-2222-4333-8444-555555555555'
        runroot = '/tmp/fictional/w15-mock500-123456789-' + nonce.replace('-', '')
        context = {'schema': 'helmut-w15-mock500-controller-context/1',
                   'scope': 'ISOLATED_GITHUB_MOCK500_BINDING_ONLY', 'runId': '123456789', 'runAttempt': 1,
                   'nonce': nonce, 'exactCommit': 'a' * 40, 'runnerTemp': '/tmp/fictional',
                   'hostPaths': {'runRoot': runroot, 'work': runroot + '/work',
                                 'prepare': runroot + '/prepare', 'cache': runroot + '/cache'}}
        raw = canonical({'schema': 'helmut-w15-mock500-private-runtime/1', 'context': context, 'bindingSHA256': 'b' * 64})
        source = work / 'mock-context.PRIVATE.json'
        fd = os.open(source, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)
        os.chown(source, 1000, 1000); digest = hashlib.sha256(raw).hexdigest()
        need(not (state / source.name).exists())
        phase = 'container'
        create_attempted = True
        p = docker('create', '--name', 'w15-copy-owner-' + token, '--pull=never', '--network=none',
                   '--memory=134217728', '--memory-swap=134217728', '--pids-limit=16',
                   '--label', LABEL + '=' + token,
                   '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,nodev,noexec,size=65536',
                   '--mount', 'type=bind,src=' + str(state) + ',dst=' + BASE + '/state',
                   '--mount', 'type=bind,src=' + str(node) + ',dst=/probe/node,readonly',
                   '--mount', 'type=bind,src=' + str(REPO / BINDINGS) + ',dst=/probe/bindings.js,readonly',
                   '--entrypoint=/bin/sleep', image, '60')
        container = p.stdout.decode().strip(); need(ID.fullmatch(container)); result['newContainers'] = 1
        info = owned(); result['cleanup']['scopeVerified'] = 'PASS'
        need(info['HostConfig']['NetworkMode'] == 'none' and info['HostConfig']['Memory'] == 134217728
             and info['HostConfig']['MemorySwap'] == 134217728 and info['Config']['Entrypoint'] == ['/bin/sleep']
             and info['Config']['Cmd'] == ['60'] and info['HostConfig']['ReadonlyRootfs'] is False)
        result['containerReadonlyRootfs'] = False
        user = info['Config']['User']
        result['containerConfigUser'] = 'ROOT_DEFAULT' if user == '' else 'EXPLICIT_ROOT' if user in ('0', '0:0', 'root') else 'OTHER'
        result['containerUserNamespaceMode'] = 'DEFAULT' if info['HostConfig']['UsernsMode'] == '' else 'HOST' if info['HostConfig']['UsernsMode'] == 'host' else 'OTHER'
        docker('start', container)
        result['nativeRootUIDMap'] = uid_map(docker('exec', container, 'cat', '/proc/self/uid_map').stdout)
        result['nativeReaderUIDMap'] = uid_map(docker('exec', '--user', '1000:1000', container, 'cat', '/proc/self/uid_map').stdout)
        phase = 'controller-import'
        spec = importlib.util.spec_from_file_location('w15_synthetic_copy_owner_controller', REPO / CONTROLLER)
        controller = importlib.util.module_from_spec(spec); sys.modules[spec.name] = controller; spec.loader.exec_module(controller)
        result['controllerImport'] = 'PASS'
        phase = 'copy'; original_root = controller.ROOT
        result['copyWorkingDirectory'] = 'OWN_SYNTHETIC_WORK_TEST_ONLY'
        result['copyWorker'] = copy_as_worker(controller, source, container, deadline)
        need(controller.ROOT == original_root)
        result['parentControllerRootUnchanged'] = True
        need(result['copyWorker']['status'] == 'PASS')
        source_stat, target_stat = source.stat(), (state / source.name).stat()
        need(source_stat.st_uid == source_stat.st_gid == 1000 and source_stat.st_mode & 0o777 == 0o600
             and source_stat.st_nlink == 1
             and (source_stat.st_dev, source_stat.st_ino) != (target_stat.st_dev, target_stat.st_ino))
        result['sourceOwner'] = {'uid': source_stat.st_uid, 'gid': source_stat.st_gid, 'mode': 0o600, 'links': 1}
        result['distinctSourceAndTarget'] = True; result['targetAbsentBeforeCopy'] = True
        phase = 'default-reader'; first = metadata(); default = reader()
        result['defaultOwner'] = {key: first[key] for key in ('uid', 'gid', 'mode', 'links')}
        result['defaultReader'] = default
        phase = 'counter-reader'
        need(first['uid'] in (0, 1000))
        docker('exec', container, 'chown', '1000:1000' if first['uid'] == 0 else '0:0', TARGET)
        second = metadata(); counter = reader()
        result['counterOwner'] = {key: second[key] for key in ('uid', 'gid', 'mode', 'links')}
        result['counterReader'] = counter; result['sameBytesAnd0600'] = True
        result['finding'] = finding(default, counter, first['uid'])
        result['status'] = ('PASS_SYNTHETIC_COPY_OWNER_CONTROL_ONLY' if result['finding'] ==
                            'DEFAULT_READER_ACCEPTED_NEGATIVE_OWNER_CONTROL_REJECTED' else
                            'FAIL_SYNTHETIC_DEFAULT_COPY_OWNER_REPRODUCED' if result['finding'] ==
                            'DEFAULT_OWNER_ACCESS_DENIED_COUNTER_CORRECTED' else 'FAIL_OR_UNKNOWN')
        phase = 'closure'; source_bound()
    except BaseException as error:
        result['firstFailurePhase'] = phase if phase in PHASES else 'binding'
        kind, number = closed_error(error)
        result['errorClass'], result['errno'] = kind, number
    finally:
        if create_attempted and container is None:
            # A timed-out create may have succeeded before its response was lost.
            # Discover only this random scope; every action still requires its ID.
            try:
                found = docker('ps', '-a', '--no-trunc', '--filter', 'label=' + LABEL + '=' + token,
                               '--format', '{{.ID}}', cleanup=True).stdout.split()
                need(len(found) <= 1)
                if found:
                    container = found[0].decode(); need(ID.fullmatch(container))
                    result['newContainers'] = 1
            except BaseException:
                result['cleanup'].update(scopeVerified='UNKNOWN', containerStopped='UNKNOWN', containerRemoved='UNKNOWN')
        if container is not None:
            result['cleanup'].update(containerStopped='UNKNOWN', containerRemoved='UNKNOWN')
            try:
                info = owned(cleanup=True)
                result['cleanup']['scopeVerified'] = 'PASS'
                if info['State']['Running']:
                    docker('stop', '--time', '1', container, cleanup=True)
                info = owned(cleanup=True)
                need(info['State']['Running'] is False and info['State']['Pid'] == 0)
                result['cleanup']['containerStopped'] = 'PASS'
                docker('rm', container, cleanup=True)
                absent = docker('inspect', container, cleanup=True, checked=False)
                need(absent.returncode != 0)
                listed = docker('ps', '-a', '--no-trunc', '--filter', 'id=' + container,
                                '--format', '{{.ID}}', cleanup=True)
                need(not listed.stdout.strip())
                result['cleanup']['containerRemoved'] = 'PASS'
            except BaseException:
                result['status'] = 'FAIL_OR_UNKNOWN'
        if root is not None:
            try:
                shutil.rmtree(root); need(not root.exists()); result['cleanup']['fixtureRemoved'] = 'PASS'
            except BaseException:
                result['cleanup']['fixtureRemoved'] = 'UNKNOWN'; result['status'] = 'FAIL_OR_UNKNOWN'
        if 'firstFailurePhase' in result or any(v in ('FAIL', 'UNKNOWN') for v in result['cleanup'].values()):
            result['status'] = 'FAIL_OR_UNKNOWN'
        print(canonical(result).decode())
    return 0 if result['status'] == 'PASS_SYNTHETIC_COPY_OWNER_CONTROL_ONLY' else 1


class CopyOwnerPureChecks(unittest.TestCase):
    def test_numeric_uid_maps_and_private_canary_rejection(self):
        self.assertEqual(uid_map(b'0 0 4294967295\n'), [[0, 0, 4294967295]])
        for bad in (b'PRIVATE_PATH', b'0 0 0', b'0 0 4294967296', b'0 0 1 PRIVATE'):
            with self.subTest(value=bad), self.assertRaises((RuntimeError, UnicodeError)):
                uid_map(bad)

    def test_closed_reader_and_causal_counter_control(self):
        yes = reader_packet(canonical(dict(uid=1000, gid=1000, accepted=True, category='ACCEPTED')), 0)
        no = reader_packet(canonical(dict(uid=1000, gid=1000, accepted=False, category='ACCESS_DENIED')), 2)
        self.assertEqual(finding(no, yes, 0), 'DEFAULT_OWNER_ACCESS_DENIED_COUNTER_CORRECTED')
        self.assertEqual(finding(yes, no, 1000), 'DEFAULT_READER_ACCEPTED_NEGATIVE_OWNER_CONTROL_REJECTED')
        self.assertEqual(finding(no, no, 0), 'INCONCLUSIVE')
        for bad in (dict(uid=0, gid=1000, accepted=True, category='ACCEPTED'),
                    dict(uid=1000, gid=1000, accepted=True, category='PRIVATE'),
                    dict(uid=1000, gid=1000, accepted=True, category='ACCEPTED', path='PRIVATE')):
            with self.subTest(value=bad), self.assertRaises(RuntimeError):
                reader_packet(canonical(bad), 0)

    def test_daemon_provenance_does_not_assert_github_mapping_identity(self):
        self.assertEqual(provenance(['name=rootless']), 'ROOTLESS_REPORTED')
        self.assertEqual(provenance(['name=userns']), 'USER_NAMESPACE_REPORTED')
        self.assertEqual(provenance(['name=cgroupns']), 'NO_USER_NAMESPACE_OPTION_REPORTED')
        with self.assertRaises(RuntimeError):
            provenance(['x' * 129])

    def test_closed_native_gate_rejects_before_any_external_command(self):
        out = io.StringIO()
        with patch.dict(os.environ, {'GITHUB_ACTIONS': 'false', 'PRIVATE_CANARY': 'FICTIONAL_PRIVATE'}), \
                patch.object(subprocess, 'run') as command, redirect_stdout(out):
            self.assertEqual(native(SimpleNamespace()), 1)
        command.assert_not_called()
        value = json.loads(out.getvalue())
        self.assertEqual(value['firstFailurePhase'], 'binding')
        self.assertEqual(value['newContainers'], 0)
        self.assertNotIn('FICTIONAL_PRIVATE', out.getvalue())

    def test_actual_controller_call_requires_searchable_cwd_without_docker(self):
        if os.getuid() == 0:
            self.skipTest('Root bypasses the unprivileged directory search check')
        spec = importlib.util.spec_from_file_location('w15_copy_cwd_fixture_controller', REPO / CONTROLLER)
        controller = importlib.util.module_from_spec(spec); spec.loader.exec_module(controller)
        with tempfile.TemporaryDirectory(prefix='w15-copy-cwd-only-') as temporary:
            owned = Path(temporary); denied = owned / 'denied'; denied.mkdir(mode=0o700)
            before = controller.ROOT
            try:
                denied.chmod(0)
                controller.ROOT = denied
                with self.assertRaises(PermissionError) as caught:
                    controller.call(['/usr/bin/true'], timeout=2)
                self.assertEqual(closed_error(caught.exception), ('PermissionError', 'EACCES'))
                controller.ROOT = owned
                self.assertEqual(controller.call(['/usr/bin/true'], timeout=2), b'')
            finally:
                controller.ROOT = before; denied.chmod(0o700)

    def test_copy_error_and_worker_channel_are_closed(self):
        error = PermissionError(errno.EACCES, 'FICTIONAL_PRIVATE', '/FICTIONAL_PRIVATE')
        self.assertEqual(closed_error(error), ('PermissionError', 'EACCES'))
        report = dict(status='FAIL', phase='copy-command', errorClass='PermissionError', errno='EACCES',
                      originalCwd='ACCESS_DENIED', originalCwdErrno='EACCES', fixtureCwd='PASS',
                      uid=1000, gid=1000, copyCommandInvoked=True, commandResult='NO_RESULT', commandReturncode='UNKNOWN')
        self.assertEqual(copy_report(canonical(report)), report)
        for changed in ({**report, 'private': 'FICTIONAL_PRIVATE'}, {**report, 'errorClass': 'FICTIONAL_PRIVATE'},
                        {**report, 'phase': 'FICTIONAL_PRIVATE'}, {**report, 'errno': 'FICTIONAL_PRIVATE'}):
            with self.subTest(value=changed), self.assertRaises(RuntimeError):
                copy_report(canonical(changed))
        self.assertNotIn('FICTIONAL_PRIVATE', canonical(report).decode())

    def test_native_stderr_is_only_a_fixed_classification(self):
        for raw, expected in ((b'rootfs is marked read-only', 'READ_ONLY_FILESYSTEM'),
                              (b'Permission denied: FICTIONAL_PRIVATE', 'ACCESS_DENIED'),
                              (b'No such file or directory: FICTIONAL_PRIVATE', 'ENTRY_MISSING'),
                              (b'FICTIONAL_PRIVATE', 'OTHER_REJECTION')):
            with self.subTest(expected=expected):
                self.assertEqual(command_stderr(raw), expected)


def main():
    if sys.argv[1:] in ([], ['--unit-only']):
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(CopyOwnerPureChecks)
        return 0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--native', action='store_true', required=True)
    parser.add_argument('--node', required=True)
    parser.add_argument('--service-container', required=True)
    parser.add_argument('--expected-commit', required=True)
    parser.add_argument('--source-head', required=True)
    return native(parser.parse_args())


if __name__ == '__main__':
    raise SystemExit(main())
