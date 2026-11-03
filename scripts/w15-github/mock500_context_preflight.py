"""One separately approved input check using the existing private archive receiver.

No database, controller, activation, model, upload or new resource. Actual source
dates and all original bytes stay unchanged. A comparison is never admission.
"""
import sys
sys.dont_write_bytecode = True
import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time
from zoneinfo import ZoneInfo

HERE = Path(__file__).absolute().parent
REPO = HERE.parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location('input_context_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


H, C = load('mock500_archive_receive'), load('restore_capacity')
STATUSES = ('VALID', 'MISSING', 'EMPTY', 'UNUSABLE', 'TECHNICAL')
COUNTS = ('valid', 'missing', 'empty', 'unusable', 'technical')


def need(value):
    if not value: raise ValueError('INPUT_CONTEXT_PREFLIGHT_REJECTED')


def closed_report(value):
    need(type(value) is dict and set(value) == {'schema', 'bindingAccepted', 'expected', 'inspected',
        'counts', 'all500Valid', 'results'} and value['schema'] == 'helmut-w15-mock500-input-contexts/1'
        and value['expected'] == 500 and type(value['expected']) is int
        and type(value['inspected']) is int and 0 <= value['inspected'] <= 500
        and type(value['bindingAccepted']) is bool and type(value['all500Valid']) is bool
        and type(value['results']) is list and len(value['results']) == 500
        and type(value['counts']) is dict and set(value['counts']) == set(COUNTS))
    counts = dict.fromkeys(COUNTS, 0)
    rows = []
    for index, row in enumerate(value['results']):
        need(type(row) is dict and set(row) == {'index', 'status', 'contextCount', 'timeOnlyExclusion', 'phase'}
            and type(row['index']) is int and row['index'] == index and row['status'] in STATUSES
            and row['phase'] in ('INPUT', 'CALENDAR', 'PROVIDER', 'COMPLETE')
            and (row['contextCount'] == 'UNKNOWN' or type(row['contextCount']) is int and 0 <= row['contextCount'] <= 500)
            and (type(row['timeOnlyExclusion']) is bool or row['timeOnlyExclusion'] == 'UNKNOWN'))
        if row['status'] == 'VALID':
            need(type(row['contextCount']) is int and row['contextCount'] > 0 and row['phase'] == 'COMPLETE')
        if row['status'] == 'EMPTY': need(row['contextCount'] == 0)
        if row['timeOnlyExclusion'] is True: need(row['status'] == 'EMPTY')
        counts[row['status'].lower()] += 1
        rows.append(dict(row))
    need(all(type(value['counts'][k]) is int and value['counts'][k] == counts[k] for k in COUNTS)
        and value['all500Valid'] == (value['bindingAccepted'] and value['inspected'] == 500 and counts['valid'] == 500))
    if value['inspected'] != 500:
        need(value['inspected'] == 0 and value['bindingAccepted'] is False and counts['technical'] == 500)
    return {**value, 'results': rows, 'counts': counts}


class ContextCheck:
    def __init__(self, runner_temp):
        self.runner_temp = Path(runner_temp)
        self.admission = None
        self.node_stopped = 'UNKNOWN'
        self.baseline = None

    def events(self):
        result = {}
        for row in self.admission['ancestors']:
            if row['relativePath'] == '/': continue
            root = Path('/sys/fs/cgroup') / row['relativePath'].lstrip('/')
            values = dict(line.split() for line in C._host_raw(root / 'memory.events').splitlines())
            result[row['relativePath']] = {k: int(values[k]) for k in ('max', 'oom', 'oom_kill', 'oom_group_kill')}
            need(int(C._host_raw(root / 'memory.swap.current', 64).strip()) == 0)
        return result

    def admit(self, request):
        root = H.load('seal')._directory(str(self.runner_temp))
        try:
            meta = os.fstat(root); need(meta.st_uid == os.getuid() and meta.st_mode & 0o022 == 0)
            fd = os.open('W15_CONTEXT_PREFLIGHT_ATTEMPT.SAFE.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=root)
            with os.fdopen(fd, 'wb') as out: out.write(H.canonical({'nonce': request['nonce'], 'retryAllowed': False}))
        finally: os.close(root)
        self.issued = H.E.utc(request['issuedAt'])
        self.admission = C.host_admission_dynamic()
        self.baseline = self.events()
        self.guard()

    def guard(self):
        need(self.admission is not None)
        observed = C.host_runtime_guard(self.admission)
        # This reader stays inside its existing caller. Its own allocations
        # consume ancestor headroom; it does not allocate a second common parent.
        # Full-test allocation policy remains unchanged.
        headroom = observed['minimumAncestorHeadroomBytes']
        need(observed['status'] in ('PASS', 'FAIL_ANCESTOR_HEADROOM')
            and observed['ancestorIdentitiesMatch'] is True
            and type(observed['hostAvailableBytes']) is int and observed['hostAvailableBytes'] >= C.HOST_RESERVE
            and (headroom == 'UNLIMITED' or type(headroom) is int and headroom >= C.HOST_RESERVE))
        now = datetime.now(timezone.utc)
        need(now.date() == self.issued.date()
            and now.astimezone(ZoneInfo('Europe/Berlin')).date() == self.issued.astimezone(ZoneInfo('Europe/Berlin')).date())
        need(self.events() == self.baseline)
        swap = dict((p[0], int(p[1])) for line in C._host_raw('/proc/meminfo').splitlines()
                    if (p := line.split()) and p[0] in ('SwapTotal:', 'SwapFree:'))
        need(set(swap) == {'SwapTotal:', 'SwapFree:'} and swap['SwapTotal:'] == swap['SwapFree:'])

    def __call__(self, paths, root, guard):
        decoder = H.load('mock500_original_archive')
        assets = {key: {'path': str(paths[key]), 'bytes': row[1], 'sha256': row[2]}
                  for key, row in decoder.FILES.items() if key in ('qualificationReport', 'qualifiedRows', 'qualifiedFixtures', 'publicationPolicy')}
        descriptor = {'assets': assets, 'executionISO': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')}
        self.execution_iso = descriptor['executionISO']
        node = shutil.which('node'); need(node is not None)
        output_fd, log_fd = (H.A._file(root, name) for name in ('CONTEXTS.SAFE.json', 'CONTEXTS.PRIVATE.log'))
        process = None
        try:
            # The workflow enters via lokal.js. Preload that exact existing
            # guard in one directly owned Node child, without a nested wrapper.
            # Credentials and external endpoints never reach this environment.
            env = {'PATH': os.environ['PATH'], 'LANG': 'C.UTF-8', 'HOME': str(root),
                   'HELMUT_STORAGE_BACKEND': 'local', 'HELMUT_SOURCE_MODE': 'off'}
            process = subprocess.Popen([node, '--require', str(REPO / 'scripts/lokaler-netzschutz.js'),
                str(HERE / 'mock500_input_contexts_cli.js')], cwd=REPO, env=env, stdin=subprocess.PIPE,
                stdout=output_fd, stderr=log_fd, close_fds=True, start_new_session=True)
            process.stdin.write(H.canonical(descriptor)); process.stdin.close()
            while process.poll() is None:
                guard(); need(os.fstat(output_fd).st_size <= 196608 and os.fstat(log_fd).st_size <= 196608)
                time.sleep(0.25)
            process.wait(timeout=5)
            try: os.killpg(process.pid, 0)
            except ProcessLookupError: self.node_stopped = 'PASS'
            need(self.node_stopped == 'PASS')
            guard(); need(process.returncode == 0)
            parent = H.P.open_root(str(root))
            try: raw = H.P.inspect_file(parent, 'CONTEXTS.SAFE.json', retain_limit=196608)
            finally: os.close(parent)
            return closed_report(H.P.decode(raw))
        finally:
            if process is not None:
                if self.node_stopped != 'PASS':
                    try: os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError: pass
                process.wait(timeout=5)
                if self.node_stopped != 'PASS':
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        try: os.killpg(process.pid, 0)
                        except ProcessLookupError:
                            self.node_stopped = 'PASS'; break
                        time.sleep(0.05)
            os.close(output_fd); os.close(log_fd)


def main(argv=None):
    class Parser(argparse.ArgumentParser):
        def error(self, message): raise ValueError('INPUT_CONTEXT_ARGUMENTS_REJECTED')
    parser = Parser(add_help=False, allow_abbrev=False)
    parser.add_argument('--check-existing-input-contexts-only', action='store_true', required=True)
    parser.add_argument('--expected-commit', required=True)
    parser.add_argument('--runner-temp', required=True)
    check, stage = None, 'arguments'
    def stop(signum, frame): raise ValueError('INPUT_CONTEXT_WALL_STOP')
    old = {s: signal.signal(s, stop) for s in (signal.SIGTERM, signal.SIGINT, signal.SIGALRM)}
    signal.alarm(H.WALL_SECONDS)
    try:
        args = parser.parse_args(argv); check = ContextCheck(args.runner_temp)
        stage = 'context-preflight'
        result = H.receive_only(args.expected_commit, args.runner_temp, context_preflight=check)
        check.guard()
        result.update({'schema': 'helmut-w15-mock-input-context-preflight/1', 'nodeProcessStopped': check.node_stopped,
            'originalQualificationRepeated': False, 'sourceDatesRewritten': False,
            'hostReserveGuardObserved': True, 'dynamicHardLimitActivated': False,
            'databaseActions': 0, 'profileActivations': 0, 'unitExecutions': 0, 'modelCalls': 0, 'artifactUploads': 0})
        print(json.dumps(result, sort_keys=True))
        return 0 if result['contexts']['all500Valid'] else 1
    except BaseException as error:
        print(json.dumps({'status': 'FAIL_OR_UNKNOWN_MOCK_INPUT_CONTEXT_PREFLIGHT',
            'phase': error.phase if isinstance(error, H.ArchiveHandoffError) else stage,
            'gpgProcessStopped': getattr(error, 'process_stopped', 'UNKNOWN'),
            'gpgAgentStopped': getattr(error, 'agent_stopped', 'UNKNOWN'),
            'nodeProcessStopped': check.node_stopped if check is not None else 'UNKNOWN',
            'executionAuthority': False, 'retryAllowed': False, 'mock500Acceptance': False}, sort_keys=True))
        return 1
    finally:
        signal.alarm(0)
        for signum, handler in old.items(): signal.signal(signum, handler)


if __name__ == '__main__': sys.exit(main())
