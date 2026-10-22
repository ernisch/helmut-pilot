#!/usr/bin/env python3
"""Protected CI-only access to pinned originals. No engine, provider or test GO."""
import argparse
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import tarfile
import urllib.request

BIN = Path(__file__).resolve().parent
REPO = 'ernisch/helmut-pilot'
ENVIRONMENT = 'helmut-ci-originals'
REVIEWER = 'ernisch'
REVIEWER_ID = 273344519
MANIFEST_SHA = 'b2e3584818b16fed2f4bfd845f9379732d9f9eb045c83f59ad94034d9e6c46ef'
TRANSPORT_SHA = 'fd9eac76ded846b2474c1ec85eaa72d5e7b023ff7cf7204e9cb62fb0401664fe'
TRANSPORT_PATH = BIN / 'private-ci-transport.json'
CIPHER_REL = '.github/ci-originals/CI84_ORIGINALS.tar.gz.gpg'
MAX_BYTES = 90 * 1024 ** 2
SHA = re.compile(r'[a-f0-9]{64}')
COMMIT = re.compile(r'[a-f0-9]{40}')


def require(ok):
    if not ok:
        raise RuntimeError('PRIVATE_CI_CHANNEL_REJECTED')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_file(path, maximum, private=False):
    p = Path(path)
    require(p.is_absolute() and str(p) == str(PurePosixPath(p)) and '..' not in p.parts)
    current = Path('/')
    for part in p.parts[1:]:
        current /= part
        require(not current.is_symlink())
    before = p.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and 0 < before.st_size <= maximum)
    if private:
        require(before.st_uid == os.getuid() and stat.S_IMODE(before.st_mode) & 0o077 == 0)
    identity = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid,
                          s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        require(identity(os.fstat(fd)) == identity(before))
        parts, count = [], 0
        while count <= before.st_size:
            block = os.read(fd, min(65536, before.st_size + 1 - count))
            if not block:
                break
            parts.append(block)
            count += len(block)
        require(count == before.st_size and identity(os.fstat(fd)) == identity(before)
                and identity(p.lstat()) == identity(before))
        return b''.join(parts)
    finally:
        os.close(fd)


def save(path, value):
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as handle:
        json.dump(value, handle, indent=2)
        handle.write('\n')


def load_transport():
    raw = read_file(TRANSPORT_PATH, 4096)
    require(sha(raw) == TRANSPORT_SHA)
    value = json.loads(raw)
    require(set(value) == {'schema', 'manifestSHA256', 'cipher', 'archive', 'files', 'totalBytes'})
    require(value['schema'] == 'helmut-private-ci-transport/1' and value['manifestSHA256'] == MANIFEST_SHA
            and value['files'] == 84 and value['totalBytes'] == 83496520)
    for key in ['cipher', 'archive']:
        p = value[key]
        require(set(p) == {'path', 'bytes', 'sha256'} and type(p['bytes']) is int
                and 0 < p['bytes'] <= MAX_BYTES and isinstance(p['sha256'], str) and SHA.fullmatch(p['sha256']))
    require(value['cipher']['path'] == CIPHER_REL and value['archive']['path'] == 'CI84_ORIGINALS.tar.gz')
    return value


def child_env():
    # In particular, no GITHUB_TOKEN or bundle key reaches git/GPG children.
    return {k: os.environ[k] for k in ['PATH', 'LANG', 'LC_ALL', 'HOME'] if k in os.environ}


def context():
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_REPOSITORY') == REPO
            and os.environ.get('GITHUB_API_URL') == 'https://api.github.com')
    event_name = os.environ.get('GITHUB_EVENT_NAME')
    require(event_name in ['pull_request', 'push', 'workflow_dispatch'])
    run_id, attempt = os.environ.get('GITHUB_RUN_ID', ''), os.environ.get('GITHUB_RUN_ATTEMPT', '')
    require(re.fullmatch(r'[1-9][0-9]{0,19}', run_id) and re.fullmatch(r'[1-9][0-9]{0,5}', attempt))
    checkout = os.environ.get('GITHUB_SHA', '')
    require(COMMIT.fullmatch(checkout) and os.environ.get('GITHUB_WORKFLOW_SHA') == checkout)
    ref = os.environ.get('GITHUB_REF', '')
    require(os.environ.get('GITHUB_WORKFLOW_REF') == REPO + '/.github/workflows/ci.yml@' + ref)
    actual = subprocess.run(['git', 'rev-parse', 'HEAD'], check=True, capture_output=True,
                            text=True, env=child_env(), timeout=10).stdout.strip()
    require(actual == checkout)
    event = json.loads(read_file(Path(os.environ['GITHUB_EVENT_PATH']), 2 * 1024 ** 2))
    pr, head = None, checkout
    if event_name == 'pull_request':
        pr = event.get('number')
        require(type(pr) is int and pr > 0 and ref == f'refs/pull/{pr}/merge')
        p = event['pull_request']
        require(p['head']['repo']['full_name'] == REPO and p['base']['repo']['full_name'] == REPO)
        head = p['head']['sha']
        require(COMMIT.fullmatch(head) and p['merge_commit_sha'] == checkout)
    elif event_name == 'push':
        require(ref == 'refs/heads/main' and event['after'] == checkout)
    else:
        require(ref == 'refs/heads/main')
    return dict(repository=REPO, event=event_name, runID=int(run_id), runAttempt=int(attempt),
                ref=ref, headSHA=head, checkoutSHA=checkout, workflowSHA=checkout, prNumber=pr,
                manifestSHA256=MANIFEST_SHA, transportSHA256=TRANSPORT_SHA)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def api(suffix):
    token = os.environ.get('GITHUB_TOKEN', '')
    require(bool(token))
    request = urllib.request.Request('https://api.github.com/repos/' + REPO + suffix, headers={
        'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'helmut-private-ci-review'})
    # Default proxy and TLS verification remain in effect; redirects are rejected.
    with urllib.request.build_opener(NoRedirect).open(request, timeout=20) as response:
        require(response.status == 200)
        raw = response.read(2 * 1024 ** 2 + 1)
    require(len(raw) <= 2 * 1024 ** 2)
    return json.loads(raw)


def validate_review(ctx, run, reviews, current_pr=None):
    require(run['head_sha'] == ctx['headSHA'] and run['event'] == ctx['event']
            and run['run_attempt'] == ctx['runAttempt'] and run['id'] == ctx['runID']
            and run['path'].split('@')[0] == '.github/workflows/ci.yml')
    if ctx['prNumber'] is not None:
        require(current_pr['state'] == 'open' and current_pr['number'] == ctx['prNumber']
                and current_pr['head']['repo']['full_name'] == REPO
                and current_pr['head']['sha'] == ctx['headSHA']
                and current_pr['merge_commit_sha'] == ctx['checkoutSHA'])
    require(isinstance(reviews, list) and len(reviews) <= 100)
    selected = [r for r in reviews if any(e.get('name') == ENVIRONMENT
                and type(e.get('id')) is int and e['id'] > 0 for e in r.get('environments', []))]
    require(not any(r.get('state') == 'rejected' for r in selected))
    approved = [r for r in selected if r.get('state') == 'approved'
                and r.get('user', {}).get('login') == REVIEWER and r.get('user', {}).get('id') == REVIEWER_ID]
    require(bool(approved))
    env = next(e for e in approved[-1]['environments'] if e['name'] == ENVIRONMENT)
    return {**ctx, 'schema': 'helmut-private-ci-reviewed-access/1', 'environment': ENVIRONMENT,
            'environmentID': env['id'], 'reviewer': REVIEWER, 'reviewerID': REVIEWER_ID,
            'executionGO': False, 'ciPassed': False}


def check_approval(receipt):
    ctx = context()
    load_transport()
    run = api(f"/actions/runs/{ctx['runID']}")
    reviews = api(f"/actions/runs/{ctx['runID']}/approvals")
    current = api(f"/pulls/{ctx['prNumber']}") if ctx['prNumber'] is not None else None
    value = validate_review(ctx, run, reviews, current)
    save(receipt, value)
    return value


def extract_archive(archive, destination, rows):
    expected = {str(PurePosixPath(r['path']).relative_to('/workspace')): r for r in rows}
    require(len(expected) == len(rows))
    seen = set()
    destination.mkdir(mode=0o700)
    with tarfile.open(archive, 'r|gz') as tar:
        for member in tar:
            require(member.name in expected and member.name not in seen and member.isreg()
                    and member.type in [tarfile.REGTYPE, tarfile.AREGTYPE] and not member.pax_headers
                    and not member.issparse() and member.mode == 0o600)
            row = expected[member.name]
            require(member.size == row['bytes'])
            stream = tar.extractfile(member)
            require(stream is not None)
            data = stream.read(row['bytes'] + 1)
            require(len(data) == row['bytes'] and sha(data) == row['sha256'])
            relative = PurePosixPath(member.name)
            require(not relative.is_absolute() and '..' not in relative.parts and str(relative) == member.name)
            parent = destination
            for part in relative.parts[:-1]:
                parent /= part
                if not parent.exists():
                    parent.mkdir(mode=0o700)
                require(not parent.is_symlink() and parent.is_dir())
            target = parent / relative.name
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as handle:
                handle.write(data)
            seen.add(member.name)
    require(seen == set(expected))


def provision(receipt):
    ctx = context()
    approved = json.loads(read_file(receipt, 4096, private=True))
    require(all(approved.get(k) == v for k, v in ctx.items())
            and approved.get('schema') == 'helmut-private-ci-reviewed-access/1'
            and approved.get('environment') == ENVIRONMENT and approved.get('reviewer') == REVIEWER
            and approved.get('reviewerID') == REVIEWER_ID and approved.get('executionGO') is False)
    transport = load_transport()
    spec = importlib.util.spec_from_file_location('ci_original_provisioner', BIN / 'provision-private-ci-originals.py')
    original = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(original)
    require(original.MANIFEST_SHA256 == MANIFEST_SHA)
    rows = original.load_manifest()
    root = BIN.parents[1]
    cipher = root / CIPHER_REL
    raw = read_file(cipher, MAX_BYTES)
    require(len(raw) == transport['cipher']['bytes'] and sha(raw) == transport['cipher']['sha256'])
    os.umask(0o077)
    secret = os.environ.pop('HELMUT_CI_ORIGINALS_KEY', '').strip()
    require(re.fullmatch(r'[a-f0-9]{64}', secret) is not None)
    runner_temp = Path(os.environ['RUNNER_TEMP'])
    require(runner_temp.is_absolute() and runner_temp.resolve() == runner_temp and runner_temp.is_dir())
    work = runner_temp / f"helmut-ci-originals-{ctx['runID']}-{ctx['runAttempt']}"
    work.mkdir(mode=0o700)
    home = work / 'gnupg'
    home.mkdir(mode=0o700)
    # Decrypt the authenticated bytes, never reopen a mutable checkout path.
    pinned_cipher = work / 'originals.gpg'
    fd = os.open(pinned_cipher, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as handle:
        handle.write(raw)
    archive = work / 'CI84_ORIGINALS.tar.gz'
    log_fd = os.open(work / 'decrypt.PRIVATE.log', os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(log_fd, 'wb') as error_log:
        decrypted = subprocess.run(['/usr/bin/gpg', '--no-options', '--batch', '--homedir', str(home),
            '--pinentry-mode', 'loopback', '--no-symkey-cache', '--disable-dirmngr', '--no-auto-key-retrieve',
            '--passphrase-fd', '0', '--output', str(archive), '--decrypt', str(pinned_cipher)],
            input=(secret + '\n').encode(), stdout=subprocess.DEVNULL, stderr=error_log,
            env=child_env(), timeout=120)
    del secret
    require(decrypted.returncode == 0)
    raw_archive = read_file(archive, MAX_BYTES, private=True)
    require(len(raw_archive) == transport['archive']['bytes'] and sha(raw_archive) == transport['archive']['sha256'])
    bundle = work / 'bundle'
    extract_archive(archive, bundle, rows)
    result = original.provision(str(bundle), '/workspace', write=True)
    require(result['filesVerified'] == 84 and result['filesCreated'] == 84 and result['ciPassed'] is False)
    save(work / 'PROVISIONED.SAFE.json', {**approved, **result, 'transportSHA256': TRANSPORT_SHA})
    return result


def encrypt_logs():
    # This separate step receives the key only after consumer processes finish.
    secret = os.environ.pop('HELMUT_CI_ORIGINALS_KEY', '').strip()
    require(re.fullmatch(r'[a-f0-9]{64}', secret) is not None)
    temp = Path(os.environ['RUNNER_TEMP'])
    require(temp.is_absolute() and temp.resolve() == temp)
    directory = temp / 'helmut-ci-private-logs'
    require(directory.is_dir() and not directory.is_symlink())
    info = directory.stat()
    require(info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) & 0o077 == 0)
    logs = sorted(directory.iterdir())
    require(0 < len(logs) <= 100)
    total = 0
    archive = temp / 'helmut-ci-private-logs.tar.gz'
    fd = os.open(archive, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as raw:
        with tarfile.open(fileobj=raw, mode='w:gz', format=tarfile.USTAR_FORMAT) as tar:
            for log in logs:
                require(re.fullmatch(r'step-[a-f0-9]{24}\.log', log.name) is not None)
                if log.stat().st_size == 0:
                    continue
                data = read_file(log, MAX_BYTES, private=True)
                total += len(data)
                require(total <= MAX_BYTES)
                member = tarfile.TarInfo(log.name)
                member.mode = 0o600
                member.size = len(data)
                tar.addfile(member, io.BytesIO(data))
    home = temp / 'helmut-ci-log-gnupg'
    home.mkdir(mode=0o700)
    output = temp / 'helmut-ci-private-logs.tar.gz.gpg'
    require(not output.exists() and not output.is_symlink())
    result = subprocess.run(['/usr/bin/gpg', '--no-options', '--batch', '--homedir', str(home),
        '--pinentry-mode', 'loopback', '--no-symkey-cache', '--disable-dirmngr', '--no-auto-key-retrieve',
        '--passphrase-fd', '0', '--cipher-algo', 'AES256', '--compress-algo', 'none',
        '--output', str(output), '--symmetric', str(archive)], input=(secret + '\n').encode(),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=child_env(), timeout=120)
    del secret
    require(result.returncode == 0)
    return {'encryptedLogs': len(logs), 'privateLogBytes': total, 'ciPassed': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check-approval', 'provision', 'encrypt-logs'])
    parser.add_argument('--receipt', type=Path)
    args = parser.parse_args()
    try:
        if args.action == 'encrypt-logs':
            require(args.receipt is None)
            result = encrypt_logs()
        else:
            require(args.receipt is not None)
            result = check_approval(args.receipt) if args.action == 'check-approval' else provision(args.receipt)
    except Exception:
        print(json.dumps({'pass': False, 'code': 'PRIVATE_CI_CHANNEL_REJECTED', 'ciPassed': False}))
        return 1
    print(json.dumps({'pass': True, 'action': args.action, 'ciPassed': False,
                      'filesVerified': result.get('filesVerified', 0), 'executionGO': False}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
