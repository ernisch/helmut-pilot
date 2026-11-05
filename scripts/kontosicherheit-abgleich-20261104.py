#!/usr/bin/env python3
"""Offline source/patch comparison only. No runtime imports, tests or network."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = Path('/workspace/helmut-claude-backend-evidence/parallel-20261104/latest-code')
BASELINE = 'ae18658e5caac2b39403c0e41e3a8af5c2b3d7be'
FILES = ['lib/helmut/accounts.js', 'lib/helmut/storage.js', 'lib/helmut/auth.js',
         'lib/helmut/auth-store-cas.js', 'server.js']
PROTECTED = FILES + ['client.js', 'index.html', 'styles.css', 'scripts/lokal.js',
                     'scripts/lokaler-netzschutz.js']
PATCHES = ['docs/backend-isolated/sprint-d-status-active.patch',
           'docs/backend-isolated/sprint-d2-last-admin.patch']

def sha(data):
    return hashlib.sha256(data).hexdigest()

def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

def hashes():
    return {name: sha((ROOT / name).read_bytes()) for name in PROTECTED}

def section(source, start):
    offset = source.index(start)
    end = source.index('\n}\n', offset) + 3
    return source[offset:end]

def between(source, start, end):
    return source[source.index(start):source.index(end, source.index(start))]

def run_git(args, cwd, env=None):
    return subprocess.run(['git', '--no-optional-locks', *args], cwd=cwd,
                          env=env, capture_output=True, text=True, check=False)

def main():
    assert str(ROOT) == '/workspace/helmut-backend-sicherheit-20261104'
    head = run_git(['rev-parse', 'HEAD'], ROOT)
    assert head.returncode == 0 and head.stdout.strip() == BASELINE
    before = hashes()
    metadata = json.loads((SNAPSHOT / 'remote-metadata.json').read_text())
    observations = []
    artifact_newline_corrections = []
    for label in ['main', 'motor']:
        expected = {item['path']: item['sha'] for item in metadata['trees'][label]['root']}
        expected.update({'lib/helmut/' + item['path']: item['sha']
                         for item in metadata['trees'][label]['accounts']})
        for name in FILES:
            local = (ROOT / name).read_bytes()
            target = SNAPSHOT / label / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if blob(local) == expected[name]:
                if target.exists():
                    assert target.read_bytes() == local
                else:
                    target.write_bytes(local)
                provenance = 'local bytes reused after equality with exact remote Git blob'
            else:
                data = target.read_bytes()
                if blob(data) != expected[name] and data.endswith(b'\n') and blob(data[:-1]) == expected[name]:
                    # apply_patch's text transport added one trailing LF to the snapshot.
                    # Remove only that artifact byte after exact remote-blob verification.
                    data = data[:-1]
                    target.write_bytes(data)
                    artifact_newline_corrections.append(str(target))
                assert blob(data) == expected[name], name
                provenance = 'exact remote-commit source downloaded through GitHub connector'
            data = target.read_bytes()
            assert blob(data) == expected[name]
            observations.append({'ref': label, 'path': name, 'gitBlobSha1': blob(data),
                                 'sha256': sha(data), 'bytes': len(data),
                                 'sameAsBaseline': data == local, 'provenance': provenance})
    atomic = metadata['additionalMotorSource']
    atomic_path = SNAPSHOT / 'motor' / atomic['path']
    data = atomic_path.read_bytes()
    if blob(data) != atomic['sha'] and data.endswith(b'\n') and blob(data[:-1]) == atomic['sha']:
        data = data[:-1]
        atomic_path.write_bytes(data)
        artifact_newline_corrections.append(str(atomic_path))
    assert blob(data) == atomic['sha']
    atomic_source = {'path': atomic['path'], 'sha256': sha(data), 'gitBlobSha1': blob(data), 'bytes': len(data)}
    apply_checks = []
    for label in ['main', 'motor']:
        cwd = SNAPSHOT / label
        env = dict(os.environ, GIT_CEILING_DIRECTORIES=str(SNAPSHOT))
        for names in [[PATCHES[0]], [PATCHES[1]], PATCHES, list(reversed(PATCHES))]:
            result = run_git(['apply', '--check', *[str(ROOT / name) for name in names]], cwd, env)
            apply_checks.append({'ref': label, 'patches': names, 'exitCode': result.returncode,
                                 'detail': (result.stdout + result.stderr).strip()})
            assert result.returncode == 0, apply_checks[-1]
    base_storage = (ROOT / 'lib/helmut/storage.js').read_text()
    motor_storage = (SNAPSHOT / 'motor/lib/helmut/storage.js').read_text()
    base_server = (ROOT / 'server.js').read_text()
    motor_server = (SNAPSHOT / 'motor/server.js').read_text()
    relevant_sections = {
        'mutateAuthStore': section(base_storage, 'function mutateAuthStore(') == section(motor_storage, 'function mutateAuthStore('),
        'handleAuthLogin': section(base_server, 'function handleAuthLogin(') == section(motor_server, 'function handleAuthLogin('),
        'adminUserRoutes': between(base_server, '  if (url.pathname === "/api/admin/users")', '  // --- Admin-Profilverwaltung') == between(motor_server, '  if (url.pathname === "/api/admin/users")', '  // --- Admin-Profilverwaltung')
    }
    assert all(relevant_sections.values())
    prior_path = ROOT / 'docs/backend-isolated/sprint-d-kombination-20261104.json'
    prior = json.loads(prior_path.read_text())
    assert prior['status'] == 'PASS_COMBINED_TARGETED_HTTP'
    assert prior['summary'] == {'workerCases': 8, 'passedWorkerCases': 8,
                               'passedChecks': 30, 'failedChecks': 0, 'httpRequests': 56}
    for item in prior['patches'] + prior['unchangedHelpers']:
        assert sha((ROOT / item['file']).read_bytes()) == item['sha256']
    after = hashes()
    assert before == after
    result = {'schema': 'helmut-account-security-latest-code-comparison/1',
              'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'status': 'PASS_SOURCE_AND_PATCH_COMPATIBILITY_ONLY',
              'baseline': BASELINE, 'main': metadata['main'],
              'latestMotorPr': metadata['latestMotorPr'],
              'remoteMetadataSha256': sha((SNAPSHOT / 'remote-metadata.json').read_bytes()),
              'files': observations, 'additionalReviewedSource': atomic_source,
              'unchangedRelevantSections': relevant_sections, 'applyChecks': apply_checks,
              'priorCombinedEvidence': {'path': str(prior_path), 'sha256': sha(prior_path.read_bytes()),
                                        'summary': prior['summary'], 'reusedWithoutRerun': True},
              'protectedBefore': before, 'protectedAfter': after, 'protectedUnchanged': True,
              'snapshotTransportNewlineCorrections': artifact_newline_corrections,
              'patchesApplied': False, 'testsRun': False, 'runtimeImported': False,
              'review': {'storageDelta': 'mutateAuthStore and ordinary CAS are unchanged; new atomic usage mode is explicit local-only and emits the same AUTH_STORE_CONFLICT for retries',
                         'serverDelta': 'only three older legal contact email texts differ; account mutation and login sections are byte-identical',
                         'accountsAndAuth': 'byte-identical on current main and latest motor head'},
              'limits': ['Source and patch applicability only; no current-head runtime, distributed DB or production acceptance',
                         'Existing contradictory account records are not repaired by D1/D2',
                         'Open PR and workflow metadata are point-in-time observations',
                         'The latest motor PR is open and is not merged main']}
    output = ROOT / 'docs/backend-isolated/kontosicherheit-abgleich-20261104.json'
    assert not output.exists(), 'Preserve prior evidence; choose a new output name'
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': result['status'], 'main': result['main'],
                      'motorHead': result['latestMotorPr']['head'], 'filesCompared': len(observations),
                      'patchChecks': len(apply_checks), 'reusedPriorChecks': 30,
                      'testsRun': False, 'protectedUnchanged': before == after,
                      'output': str(output)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
