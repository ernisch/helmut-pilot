"""Copy only pinned existing ciphertext ZIPs via GitHub; no Production APIs or secrets."""
import hashlib
import json
import os
import pathlib
import re
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PINS = ROOT / 'docs/betrieb/blocker2-server-handoff-artifacts-20261008.json'
REF = 'refs/heads/codex/blocker2-server-handoff-20261008'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def require(condition):
    if not condition:
        raise ValueError('blocker2-handoff-guard')

def storage_url(url):
    p = urllib.parse.urlsplit(url)
    require(p.scheme == 'https' and p.username is None and p.password is None
            and p.port in (None, 443) and not p.fragment
            and (re.fullmatch(r'productionresultssa[a-z0-9]+\.blob\.core\.windows\.net', p.hostname or '')
                 or re.fullmatch(r'[a-z0-9-]+\.actions\.githubusercontent\.com', p.hostname or '')))

def main():
    require(os.environ.get('GITHUB_REPOSITORY') == 'ernisch/helmut-pilot'
            and os.environ.get('GITHUB_REF') == REF
            and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
            and os.environ.get('GITHUB_RUN_ATTEMPT') == '1')
    pins = json.loads(PINS.read_text())
    require(pins['sourceRun'] == 37790661298 and len(pins['artifacts']) == 28
            and len({r['id'] for r in pins['artifacts']}) == 28
            and sum(r['size_in_bytes'] for r in pins['artifacts']) == 475401843)
    token = os.environ.get('GITHUB_TOKEN')
    require(bool(token))
    client = urllib.request.build_opener(NoRedirect())
    base = 'https://api.github.com/repos/ernisch/helmut-pilot'
    def request(path):
        return urllib.request.Request(base + path, headers={
            'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'})
    def metadata(path):
        with client.open(request(path), timeout=60) as r:
            raw = r.read(2 * 1024 * 1024 + 1)
            require(len(raw) <= 2 * 1024 * 1024)
            return json.loads(raw)
    run = metadata('/actions/runs/37790661298')
    require(run['id'] == 37790661298 and run['head_sha'] == pins['sourceWorkflowCommit']
            and run['status'] == 'completed' and run['conclusion'] == 'success'
            and run['event'] == 'workflow_dispatch' and run['run_attempt'] == 1
            and run['path'] == '.github/workflows/blocker2-readonly500.yml')
    dest = ROOT / 'tmp/blocker2-handoff-original-cipher'
    dest.mkdir(parents=True, exist_ok=False, mode=0o700)
    receipt = []
    for expected in pins['artifacts']:
        ident = expected['id']
        require(re.fullmatch(r'blocker2-readonly500-37790661298-checkpoint-\d{4}-part-01', expected['name']) is not None)
        actual = metadata(f'/actions/artifacts/{ident}')
        require(actual['expired'] is False and actual['workflow_run']['id'] == 37790661298)
        require(all(actual[k] == expected[k] for k in ('id', 'name', 'size_in_bytes', 'digest')))
        try:
            client.open(request(f'/actions/artifacts/{ident}/zip'), timeout=60).close()
            raise ValueError('missing-redirect')
        except urllib.error.HTTPError as error:
            require(error.code == 302)
            location = error.headers.get('Location', '')
            error.close()
        storage_url(location)
        path = dest / (expected['name'] + '.zip')
        digest = hashlib.sha256()
        size = 0
        # Never forward the GitHub Authorization header to storage. Never log signed URLs.
        with client.open(urllib.request.Request(location), timeout=60) as r, path.open('xb') as f:
            os.chmod(path, 0o600)
            while True:
                data = r.read(1024 * 1024)
                if not data:
                    break
                size += len(data)
                require(size <= expected['size_in_bytes'])
                digest.update(data)
                f.write(data)
        require(size == expected['size_in_bytes'] and 'sha256:' + digest.hexdigest() == expected['digest'])
        receipt.append({'sourceArtifactId': ident, 'file': path.name, 'bytes': size, 'sha256': digest.hexdigest()})
        print(json.dumps({'cipherZIPsCopied': len(receipt), 'total': 28}), flush=True)
    report = {'sourceRun': 37790661298, 'transportRun': os.environ['GITHUB_RUN_ID'],
              'transportCommit': os.environ['GITHUB_SHA'], 'retentionDays': 90,
              'ProductionRequests': 0, 'cronCredentials': False, 'privateKeys': False,
              'plaintexts': False, 'originalZIPs': receipt}
    (dest / 'TRANSPORT_MANIFEST.json').write_text(json.dumps(report, indent=2) + '\n')

if __name__ == '__main__':
    main()
