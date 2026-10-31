#!/usr/bin/env python3
"""One actual-source candidate qualification, reusing the existing offline PG container."""
import hashlib, json, os, pathlib, shutil, subprocess
ROOT = pathlib.Path(__file__).resolve().parents[1]
WORK = pathlib.Path('/workspace/shared/helmut-w15-publication-bridge-20261028')
DATA = pathlib.Path('/workspace/shared/helmut-w15-current-source-update-20261028')
OUT = DATA / 'qualification-b'
CONTAINER = 'w15-full500-20261028'
DB = 'helmut_w15_source_bindings_20261028'
BASE = '/tmp/w15-publication-bindings-20261028'
OLD = '/tmp/w15-full500-20261028'
RECEIPT = pathlib.Path('/workspace/shared/helmut-w15-receipt-20261027/reports/W15_RECEPTION_REPORT.SAFE.json')
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
ENV = {'PATH': os.environ['PATH'], 'LANG': 'C.UTF-8'}
def sha(b): return hashlib.sha256(b).hexdigest()
def call(args, data=None, timeout=60):
    r = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ENV, cwd=ROOT, timeout=timeout)
    if r.returncode: raise RuntimeError('w15-publication-command-failed:' + args[0] + ':' + str(r.returncode))
    return r.stdout
def docker(*args, **kw): return call(DOCKER + list(args), **kw)
def sql(text):
    return docker('exec', '-i', CONTAINER, 'psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DB, '-f', '-', data=text.encode()).decode().strip()
def save(name, value):
    p = WORK / name
    with p.open('x') as f: os.chmod(p, 0o600); json.dump(value, f, indent=2); f.write('\n')
def main():
    assert not WORK.exists() and not OUT.exists(), 'w15-publication-once-only-attempt'
    info = json.loads(docker('inspect', CONTAINER))[0]
    assert info['State']['Running'] and info['HostConfig']['NetworkMode'] == 'none' and not info['NetworkSettings']['Ports']
    assert info['HostConfig']['Memory'] == 2048000000 and info['HostConfig']['MemorySwap'] == 2048000000
    assert docker('exec', CONTAINER, 'test', '!', '-e', BASE) == b''
    os.umask(0o077); WORK.mkdir(mode=0o700)
    created = False; failure = None; outcome = None; zero = None
    try:
        raw = RECEIPT.read_bytes(); assert sha(raw) == '2cee6eb467342cabbe28db958ac00cc6cd9699622c3a772796d68d2d6adb97f1'
        receipt = json.loads(raw); assert receipt['actualFileCount'] == 11 and receipt['actualPayloadBytes'] == 96530256
        stage = WORK / 'stage'; stage.mkdir(mode=0o700)
        docker('cp', CONTAINER + ':' + OLD + '/app', str(stage / 'app'))
        shutil.copytree(ROOT / 'lib', stage / 'app/lib', dirs_exist_ok=True)
        shutil.copy2(ROOT / 'server.js', stage / 'app/server.js'); shutil.copy2(ROOT / 'package.json', stage / 'app/package.json')
        for filename in ['lokal.js', 'lokaler-netzschutz.js', 'synthetik-500-w15-publication-qualification.js',
          'synthetik-500-w15-mock-bindings-check.js', 'fixtures/w15-current-input-bindings.js',
          'fixtures/w15-current-native-data.js', 'fixtures/w15-current-input-database.js',
          'fixtures/w15-current-mock-data.js', 'fixtures/w15-local-calendar.js', 'fixtures/w15-full500-provider.js',
          'fixtures/w15-unit0-provider.js', 'fixtures/z3-plattform.js']:
            shutil.copy2(ROOT / 'scripts' / filename, stage / 'app/scripts' / filename)
        docker('exec', CONTAINER, 'mkdir', '-m', '700', BASE)
        docker('cp', str(stage / 'app'), CONTAINER + ':' + BASE + '/app')
        originals = [RECEIPT]
        for key in ['normalizedCurrentPolicy', 'nativeInventoryHistoricalTemplate', 'reviewedMockCandidates', 'staticMockTemplates']:
            pin = next(p for p in receipt['files'] if p['key'] == key)
            f = pathlib.Path(pin['receivedPath']); b = f.read_bytes()
            assert len(b) == pin['expectedBytes'] and sha(b) == pin['expectedSHA256'] and not f.is_symlink()
            originals.append(f)
        originals.append(pathlib.Path('/workspace/shared/helmut-w15-development-20261027/publication-policy.PRIVATE.json'))
        originals.extend(DATA / n for n in ['BERLIN_TAX_20261023.SOURCE_NORMALIZATION.PRIVATE.json',
          'BT_HOUSING_20261016.SOURCE.PRIVATE.json', 'MANUAL_SOURCE_REVIEW.SAFE.json',
          'BERLIN_TAX_20261023.ORIGINAL.html', 'BT_HOUSING_20261016.ORIGINAL.html'])
        for f in originals:
            docker('exec', CONTAINER, 'mkdir', '-p', '-m', '700', str(f.parent))
            docker('exec', CONTAINER, 'test', '!', '-e', str(f))
            docker('cp', str(f), CONTAINER + ':' + str(f))
        # These paths are new copies inside the old offline container only.
        docker('exec', CONTAINER, 'chown', '-R', '1000:1000', BASE, '/workspace/shared/helmut-w15-receipt-20261027',
          '/workspace/shared/helmut-w15-development-20261027', str(DATA))
        docker('exec', CONTAINER, 'psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', 'create database ' + DB + ';')
        created = True
        dump_pin = next(p for p in receipt['files'] if p['key'] == 'frozenSourceDump')
        dump = pathlib.Path(dump_pin['receivedPath']); b = dump.read_bytes()
        assert len(b) == dump_pin['expectedBytes'] and sha(b) == dump_pin['expectedSHA256']
        docker('cp', str(dump), CONTAINER + ':' + BASE + '/input.PRIVATE.dump')
        docker('exec', CONTAINER, 'pg_restore', '--exit-on-error', '--file=' + BASE + '/restore.PRIVATE.sql', BASE + '/input.PRIVATE.dump')
        docker('exec', CONTAINER, 'psql', '-X', '-w', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-U', 'postgres', '-d', DB,
          '-f', BASE + '/restore.PRIVATE.sql', '-c', "set local statement_timeout='15s';update public.mandate_profiles set aktiv=false where aktiv;")
        restored = json.loads(sql("begin read only;select jsonb_build_object('profiles',(select count(*)from public.mandate_profiles),'active',(select count(*)from public.mandate_profiles where aktiv));rollback;"))
        assert restored == {'profiles': 500, 'active': 0}
        save('RESTORE.SAFE.json', {'status': 'PASS_NEW_PREPARATION_DB500_INACTIVE', 'database': DB, **restored,
          'newContainer': False, 'existingDatabasesWritten': False, 'unitExecutions': 0})
        cmd = DOCKER + ['exec', '--user', '1000:1000', CONTAINER, 'env', '-i', 'PATH=/usr/bin:/bin', 'LANG=C.UTF-8',
          'HELMUT_SOURCE_MODE=off', 'HELMUT_STORAGE_BACKEND=local',
          'NODE_V8_COVERAGE=' + str(DATA / 'coverage-b'), OLD + '/node', BASE + '/app/scripts/lokal.js', '--',
          OLD + '/node', BASE + '/app/scripts/synthetik-500-w15-publication-qualification.js']
        with (WORK / 'QUALIFICATION.PRIVATE.log').open('xb') as log:
            result = subprocess.run(cmd, stdout=log, stderr=log, env=ENV, cwd=ROOT, timeout=240)
        # Copy only this new qualified/failed attempt. Never overwrite old evidence.
        docker('cp', CONTAINER + ':' + str(OUT), str(OUT))
        docker('cp', CONTAINER + ':' + BASE + '/QUALIFICATION_BOOTSTRAP.SAFE.json', str(WORK / 'QUALIFICATION_BOOTSTRAP.SAFE.json'))
        docker('cp', CONTAINER + ':' + str(DATA / 'coverage-b'), str(DATA / 'coverage-b'))
        outcome = json.loads((OUT / 'ALL500_MOCK_BINDINGS_CHECK.SAFE.json').read_text())
        assert result.returncode == 0 and outcome['status'] == 'PASS_ALL500_CURRENT_ORIGINAL_MOCK_BINDINGS', 'w15-publication-first-qualification-failure'
    except BaseException as e:
        failure = {'type': type(e).__name__, 'reason': str(e), 'retryAllowed': False}
    finally:
        if created:
            # Only the owned new services may be stopped; the old PG and DBs stay.
            code = "const f=require('fs');for(const n of ['bootstrap','postgrest']){const p='" + BASE + "/'+n+'.pid';if(!f.existsSync(p))continue;const id=Number(f.readFileSync(p,'utf8'));if(!Number.isSafeInteger(id)||id<2)throw Error('pid');try{const c=f.readFileSync('/proc/'+id+'/cmdline','utf8');if(!c.includes('" + BASE + "'))throw Error('unowned');process.kill(id,'SIGTERM');}catch(e){if(!['ENOENT','ESRCH'].includes(e.code))throw e;}}"
            try:
                docker('exec', '--user', '1000:1000', CONTAINER, OLD + '/node', '-e', code)
                zero = sql("begin read only;select count(*)from public.mandate_profiles where aktiv;rollback;") == '0'
            except BaseException as e: failure = failure or {'type': type(e).__name__, 'reason': 'w15-publication-closure-unknown', 'retryAllowed': False}
        save('RESULT.SAFE.json', {'status': 'PASS_ALL500_ORIGINAL_SOURCE_BINDINGS' if not failure and zero else 'FAIL_OR_UNKNOWN',
          'failure': failure, 'qualificationStatus': outcome.get('status') if outcome else None,
          'database': DB, 'confirmedActiveZero': zero, 'newContainer': False, 'profileActivations': 0,
          'unitExecutions': 0, 'providerCalls': 0, 'paidModelCalls': 0, 'retryAllowed': False})
    print(json.dumps({'resultPath': str(WORK / 'RESULT.SAFE.json'), 'status': 'PASS' if not failure and zero else 'FAIL'}))
    if failure or not zero: raise SystemExit(1)
if __name__ == '__main__': main()
