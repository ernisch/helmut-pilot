"""One retained CI log, GHA only. No tests, subject imports or original inputs."""
import ast
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile

REPO = 'ernisch/helmut-pilot'
REPO_ID = 1274160979
SOURCE = '97662d821c72f45bc3b9f02636ba308ba6b54066'
RUN, JOB, ARTIFACT = 39989672128, 120537987707, 12517496830
ZIP_BYTES = 1708
ZIP_SHA = 'd3250dfed2a9abc4ce16f59512e55dfa0e9ecf7148b857868632d2bb859cc93b'
BRANCH = 'codex/ci-private-diagnostic-39989672128'
MARKER = 'helmut-ci-metadata-only:39989672128:12517496830:' + SOURCE
WORKFLOW = '.github/workflows/ci-private-log-metadata.yml'
HELPER = 'scripts/helmut-resource-meter/ci-private-log-metadata.py'
SUITES = ('start-preflight-test.py', 'next-resource-authority-test.py',
          'preparation-bindings-test.js', 'runtime-read-contract-test.py', 'start-input-checks-test.js')
CLASSES = ('AssertionError', 'RuntimeError', 'FileNotFoundError', 'ModuleNotFoundError',
           'ImportError', 'TypeError', 'ValueError', 'KeyError', 'AttributeError', 'NameError',
           'PermissionError', 'OSError', 'SyntaxError', 'IndexError', 'TimeoutError',
           'CalledProcessError', 'Error', 'RangeError', 'ReferenceError', 'AggregateError')
CODES = {'context', 'git', 'source', 'run', 'job', 'artifact', 'download', 'zip',
         'private', 'key', 'decrypt', 'archive', 'log', 'output'}
LIMIT = 65536


class Rejected(RuntimeError):
    def __init__(self, code):
        self.code = code if code in CODES else 'context'


def need(ok, code):
    if not ok:
        raise Rejected(code)


def child_env():
    # No GitHub token, package key, user HOME, proxy or Actions command files.
    return {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8'}


def git(root, *args):
    p = subprocess.run(['/usr/bin/git', '-C', str(root), *args], env=child_env(),
                       stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                       stderr=subprocess.DEVNULL, timeout=10)
    need(p.returncode == 0 and len(p.stdout) <= 2 * 1024**2, 'git')
    return p.stdout


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get(url, token=None, maximum=LIMIT):
    headers = {'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
               'User-Agent': 'helmut-exact-ci-log-metadata'}
    if token is not None:
        need(url.startswith('https://api.github.com/repos/' + REPO + '/'), 'download')
        headers['Authorization'] = 'Bearer ' + token
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)
    try:
        with opener.open(urllib.request.Request(url, headers=headers), timeout=20) as r:
            need(r.status == 200, 'download')
            raw = r.read(maximum + 1)
    except urllib.error.HTTPError as e:
        if e.code != 302 or token is None:
            raise Rejected('download') from None
        location = e.headers.get('Location', '')
        u = urllib.parse.urlsplit(location)
        need(u.scheme == 'https' and not u.username and not u.password and not u.fragment
             and u.port in (None, 443) and re.fullmatch(r'productionresultssa[0-9]+\.blob\.core\.windows\.net', u.hostname or ''), 'download')
        # A fresh unauthenticated request: never forward GitHub credentials.
        return get(location, maximum=maximum)
    need(len(raw) <= maximum, 'download')
    return raw


def api(suffix, token):
    return json.loads(get('https://api.github.com/repos/' + REPO + suffix, token))


def context():
    e = os.environ
    need(sys.argv[1:] == ['--read-exact-ci-log-metadata'] and sys.flags.isolated
         and sys.flags.no_site and sys.flags.dont_write_bytecode, 'context')
    need(e.get('GITHUB_ACTIONS') == 'true' and e.get('GITHUB_EVENT_NAME') == 'push'
         and e.get('GITHUB_REPOSITORY') == REPO and e.get('GITHUB_REPOSITORY_ID') == str(REPO_ID)
         and e.get('GITHUB_ACTOR_ID') == '273344519' and e.get('GITHUB_REF') == 'refs/heads/' + BRANCH
         and e.get('GITHUB_WORKFLOW_REF') == REPO + '/' + WORKFLOW + '@refs/heads/' + BRANCH
         and e.get('GITHUB_API_URL') == 'https://api.github.com'
         and e.get('GITHUB_RUN_ATTEMPT') == '1', 'context')
    head = e.get('GITHUB_SHA', '')
    need(re.fullmatch('[a-f0-9]{40}', head) and e.get('GITHUB_WORKFLOW_SHA') == head, 'context')
    event = json.loads(Path(e['GITHUB_EVENT_PATH']).read_bytes())
    need(event.get('after') == head and event.get('head_commit', {}).get('id') == head
         and event['head_commit'].get('message') == MARKER
         and event.get('repository', {}).get('id') == REPO_ID, 'context')
    root = Path(e['GITHUB_WORKSPACE'])
    need(root.is_absolute() and root.resolve() == root and Path.cwd() == root
         and Path(__file__).resolve() == root / HELPER
         and git(root, 'rev-parse', 'HEAD').decode().strip() == head, 'context')
    git(root, 'merge-base', '--is-ancestor', SOURCE, head)
    return root


def encrypted_log(token):
    run = api('/actions/runs/' + str(RUN), token)
    need(run.get('id') == RUN and run.get('run_attempt') == 1 and run.get('head_sha') == SOURCE
         and run.get('path') == '.github/workflows/ci.yml' and run.get('status') == 'completed'
         and run.get('conclusion') == 'failure', 'run')
    job = api('/actions/jobs/' + str(JOB), token)
    need(job.get('run_id') == RUN and job.get('head_sha') == SOURCE and job.get('conclusion') == 'failure', 'job')
    steps = {x['number']: x for x in job['steps']}
    need(steps[14]['conclusion'] == steps[18]['conclusion'] == 'success'
         and steps[19]['name'] == 'Ressourcenstart und Originalbindungen (offline)'
         and steps[19]['conclusion'] == 'failure'
         and all(steps[n]['conclusion'] == 'skipped' for n in range(20, 41)), 'job')
    a = api('/actions/artifacts/' + str(ARTIFACT), token)
    need(a.get('id') == ARTIFACT and a.get('name') == 'private-ci-diagnostics-39989672128-1'
         and a.get('size_in_bytes') == ZIP_BYTES and a.get('expired') is False
         and a.get('digest') == 'sha256:' + ZIP_SHA
         and a.get('workflow_run', {}).get('id') == RUN
         and a['workflow_run'].get('head_sha') == SOURCE
         and a['workflow_run'].get('repository_id') == a['workflow_run'].get('head_repository_id') == REPO_ID, 'artifact')
    raw = get('https://api.github.com/repos/' + REPO + '/actions/artifacts/' + str(ARTIFACT) + '/zip', token, ZIP_BYTES)
    need(len(raw) == ZIP_BYTES and hashlib.sha256(raw).hexdigest() == ZIP_SHA, 'artifact')
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        items = z.infolist()
        need(len(items) == 1 and items[0].filename == 'helmut-ci-private-logs.tar.gz.gpg'
             and not items[0].is_dir() and not items[0].flag_bits & 1
             and 0 < items[0].file_size <= LIMIT, 'zip')
        cipher = z.read(items[0])  # ZIP CRC is checked; never extract archive paths.
    return cipher


def decrypt(cipher):
    temp = Path(os.environ['RUNNER_TEMP'])
    need(temp.is_absolute() and temp.resolve() == temp, 'private')
    rid, attempt = os.environ['GITHUB_RUN_ID'], os.environ['GITHUB_RUN_ATTEMPT']
    need(re.fullmatch('[1-9][0-9]{0,19}', rid) and re.fullmatch('[1-9][0-9]{0,5}', attempt), 'context')
    work = temp / ('helmut-ci-log-diagnostic-' + rid + '-' + attempt)
    work.mkdir(mode=0o700); home = work / 'gnupg'; home.mkdir(mode=0o700)
    p = work / 'LOG_CIPHER.PRIVATE.gpg'
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(cipher); f.flush(); os.fsync(f.fileno())
    key = os.environ.pop('HELMUT_CI_ORIGINALS_KEY', '').strip()
    need(re.fullmatch('[a-f0-9]{64}', key), 'key')
    result = subprocess.run(['/usr/bin/gpg', '--no-options', '--batch', '--homedir', str(home),
        '--pinentry-mode', 'loopback', '--no-symkey-cache', '--disable-dirmngr', '--no-auto-key-retrieve',
        '--passphrase-fd', '0', '--max-output', str(LIMIT), '--output', '-', '--decrypt', str(p)],
        input=(key + '\n').encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=child_env(), timeout=20)
    del key
    need(result.returncode == 0 and 0 < len(result.stdout) <= LIMIT and len(result.stderr) <= 131072, 'decrypt')
    # Bound decompression before tar parsing; USTAR is the existing producer format.
    with gzip.GzipFile(fileobj=io.BytesIO(result.stdout), mode='rb') as g:
        archive = g.read(4 * LIMIT + 1)
        need(len(archive) <= 4 * LIMIT and g.read(1) == b'', 'archive')
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as t:
        members = t.getmembers()
        need(len(members) == 1 and members[0].type == tarfile.REGTYPE
             and re.fullmatch(r'step-[a-f0-9]{24}\.log', members[0].name)
             and members[0].mode == 0o600 and 0 < members[0].size <= LIMIT, 'archive')
        log = t.extractfile(members[0]).read(LIMIT + 1)
        need(len(log) == members[0].size and b'\0' not in log, 'log')
        return log.decode('utf-8', errors='strict')


def public_metadata(root, log):
    files = set(git(root, 'ls-tree', '-rz', '--name-only', SOURCE, '--', 'scripts', 'lib').decode().split('\0')) - {''}
    files = {p for p in files if re.fullmatch(r'(?:scripts|lib)/[A-Za-z0-9_./@-]+\.(?:py|js)', p)}
    source_cache = {}
    def source(p):
        if p not in source_cache:
            source_cache[p] = git(root, 'show', SOURCE + ':' + p).decode('utf-8', errors='strict')
        return source_cache[p]
    py = {}; js = {}
    for suite in SUITES:
        p = 'scripts/helmut-resource-meter/' + suite
        need(p in files, 'source')
        text = source(p)
        if suite.endswith('.py'):
            for c in ast.parse(text).body:
                if isinstance(c, ast.ClassDef):
                    for f in c.body:
                        if isinstance(f, ast.FunctionDef) and re.fullmatch('test_[A-Za-z0-9_]{1,160}', f.name):
                            py.setdefault((c.name, f.name), []).append(p)
        else:
            for m in re.finditer(r'\btest\(\s*([\'\"])([^\'\"\\\r\n]{1,160})\1', text):
                if m[2].isascii() and all(32 <= ord(c) < 127 for c in m[2]):
                    js.setdefault(m[2], []).append(p)
    tests, classes, locations = set(), set(), set()
    prefixes = (str(root) + '/', '/__w/helmut-pilot/helmut-pilot/', '/home/runner/work/helmut-pilot/helmut-pilot/')
    for line in log.splitlines():
        if len(line) > 4096:
            continue
        m = re.fullmatch(r'(?:FAIL|ERROR): (test_[A-Za-z0-9_]{1,160}) \(([A-Za-z0-9_.]+)\)', line)
        if m:
            for (c, f), paths in py.items():
                if f == m[1] and (m[2].endswith('.' + c + '.' + f) or m[2].endswith('.' + c)) and len(paths) == 1:
                    tests.add((paths[0], c + '.' + f))
        m = re.fullmatch(r'\s*not ok [1-9][0-9]* - ([^\r\n]{1,160})', line)
        if m and len(js.get(m[1], [])) == 1:
            tests.add((js[m[1]][0], m[1]))
        for cls in CLASSES:
            if re.match(r'^' + cls + r'(?:\s*\[[A-Z0-9_]+\])?:', line):
                classes.add(cls)
        frames = re.findall(r'File "([^"\r\n]+)", line ([1-9][0-9]{0,6})(?:,|$)', line)
        frames += re.findall(r'(?<![A-Za-z0-9_])((?:/|file:///)[^\s():]+):([1-9][0-9]{0,6})(?::[0-9]+)?(?=\)?$)', line)
        for filename, n in frames:
            filename = filename.removeprefix('file://')
            relative = next((filename[len(p):] for p in prefixes if filename.startswith(p)), filename)
            if relative in files and '..' not in relative.split('/') and 0 < int(n) <= len(source(relative).splitlines()):
                locations.add((relative, int(n)))
    need(len(tests) <= 32 and len(classes) <= 20 and len(locations) <= 32, 'output')
    return {'failedTests': [{'file': p, 'test': n} for p, n in sorted(tests)],
            'exceptionClasses': sorted(classes), 'sourceLocations': [{'file': p, 'line': n} for p, n in sorted(locations)]}


def main():
    root = context()
    token = os.environ.pop('GH_TOKEN', '')
    need(bool(token), 'context')
    cipher = encrypted_log(token)
    del token
    value = public_metadata(root, decrypt(cipher))
    known = any(value.values())
    output = {'schema': 'helmut-exact-private-ci-log-metadata/1', 'diagnosticOnly': True,
              'targetRun': RUN, 'targetJob': JOB, 'targetArtifact': ARTIFACT, 'sourceCommit': SOURCE,
              'detailsStatus': 'PUBLIC_WHITELIST_METADATA' if known else 'REDACTED_UNKNOWN', **value,
              'rawMessagesExported': False, 'testReplay': False, 'ciPassed': False,
              'nativeAccepted': False, 'production': False, 'executionGO': False}
    raw = json.dumps(output, ensure_ascii=True, separators=(',', ':'))
    need(len(raw) <= 16384, 'output')
    print(raw)
    return 0 if known else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        code = error.code if type(error) is Rejected else 'unknown'
        print(json.dumps({'schema': 'helmut-exact-private-ci-log-metadata/1', 'diagnosticOnly': True,
                          'code': code, 'detailsStatus': 'REDACTED_UNKNOWN', 'ciPassed': False,
                          'rawMessagesExported': False, 'executionGO': False}))
        raise SystemExit(1)
