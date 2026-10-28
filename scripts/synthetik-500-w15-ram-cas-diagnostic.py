#!/usr/bin/env python3
"""One targeted native Auth spill attribution; no activation or DR execution."""
import hashlib, json, os, pathlib, shutil, subprocess
ROOT = pathlib.Path(__file__).resolve().parents[1]
WORK = pathlib.Path('/workspace/shared/helmut-w15-ram-cas-diagnostic-20261028')
BASE = '/tmp/w15-ram-cas-diagnostic-20261028'
OLD = '/tmp/w15-full500-20261028c'
CONTAINER = 'w15-full500-20261028c'
DB = 'helmut_w15_ram_cas_20261028'
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
ENV = {'PATH': os.environ['PATH'], 'LANG': 'C.UTF-8'}
def call(args, data=None, timeout=90):
    r = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ENV, cwd=ROOT, timeout=timeout)
    if r.returncode: raise RuntimeError('w15-auth-check-command-failed:' + args[0] + ':' + str(r.returncode))
    return r.stdout
def docker(*args, **kw): return call(DOCKER + list(args), **kw)
def save(name, value):
    p = WORK / name
    with p.open('x') as f: os.chmod(p, 0o600); json.dump(value, f, indent=2); f.write('\n')
def main():
    assert not WORK.exists(), 'w15-auth-check-no-repeat'
    info = json.loads(docker('inspect', CONTAINER))[0]
    assert info['State']['Running'] and info['HostConfig']['NetworkMode'] == 'none' and not info['NetworkSettings']['Ports']
    docker('exec', CONTAINER, 'test', '!', '-e', BASE)
    os.umask(0o077); WORK.mkdir(mode=0o700)
    created = False; failure = None; zero = False; report = None
    try:
        receipt = pathlib.Path('/workspace/shared/helmut-w15-receipt-20261027/reports/W15_RECEPTION_REPORT.SAFE.json').read_bytes()
        assert hashlib.sha256(receipt).hexdigest() == '2cee6eb467342cabbe28db958ac00cc6cd9699622c3a772796d68d2d6adb97f1'
        pin = next(p for p in json.loads(receipt)['files'] if p['key'] == 'frozenSourceDump')
        dump = pathlib.Path(pin['receivedPath']); b = dump.read_bytes()
        assert len(b) == pin['expectedBytes'] and hashlib.sha256(b).hexdigest() == pin['expectedSHA256']
        stage = WORK / 'stage'; stage.mkdir(mode=0o700)
        docker('cp', CONTAINER + ':' + OLD + '/app', str(stage / 'app'))
        shutil.copytree(ROOT / 'lib', stage / 'app/lib', dirs_exist_ok=True)
        for name in ['lokal.js', 'lokaler-netzschutz.js', 'synthetik-500-w15-ram-cas-diagnostic.js',
          'synthetik-500-w15-full500-runtime.js', 'fixtures/z3-plattform.js',
          'fixtures/w15-memory-contract.js', 'fixtures/w15-memory-contract.json']:
            shutil.copy2(ROOT / 'scripts' / name, stage / 'app/scripts' / name)
        docker('exec', CONTAINER, 'mkdir', '-m', '700', BASE)
        docker('cp', str(stage / 'app'), CONTAINER + ':' + BASE + '/app')
        docker('exec', CONTAINER, 'chown', '-R', '1000:1000', BASE)
        docker('cp', str(dump), CONTAINER + ':' + BASE + '/input.PRIVATE.dump')
        docker('exec', CONTAINER, 'psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', 'create database ' + DB + ';')
        created = True
        docker('exec', CONTAINER, 'pg_restore', '--exit-on-error', '--file=' + BASE + '/restore.PRIVATE.sql', BASE + '/input.PRIVATE.dump')
        docker('exec', CONTAINER, 'psql', '-X', '-w', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-U', 'postgres', '-d', DB,
          '-f', BASE + '/restore.PRIVATE.sql', '-c', "set local statement_timeout='15s';update public.mandate_profiles set aktiv=false where aktiv;")
        # Preserve the exact retained69-unit Auth content in a NEW inactive DB.
        # Only read the old failed target; never reuse an execution permission.
        q = "begin read only;set local statement_timeout='10s';select data::text from public.helmut_store where id='main-auth';rollback;"
        original_auth = docker('exec', '-i', CONTAINER, 'psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'helmut_w15_full500_20261028b', '-f', '-', data=q.encode())
        original_value = json.loads(original_auth)
        assert len(original_value['llmUsage']) == 5139
        auth_path = WORK / 'RETAINED_AUTH_INPUT.PRIVATE.json'
        auth_path.write_bytes(original_auth); auth_path.chmod(0o600)
        docker('cp', str(auth_path), CONTAINER + ':' + BASE + '/RETAINED_AUTH_INPUT.PRIVATE.json')
        docker('exec', CONTAINER, 'chown', '1000:1000', BASE + '/RETAINED_AUTH_INPUT.PRIVATE.json')
        text = original_auth.decode().strip().replace("'", "''")
        q = "begin;set local statement_timeout='15s';update public.helmut_store set data='" + text + "'::jsonb where id='main-auth';commit;"
        docker('exec', '-i', CONTAINER, 'psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DB, '-f', '-', data=q.encode())
        with (WORK / 'DIAGNOSTIC.PRIVATE.log').open('xb') as log:
            result = subprocess.run(DOCKER + ['exec', '--user', '1000:1000', CONTAINER, 'env', '-i', 'PATH=/usr/bin:/bin', 'LANG=C.UTF-8',
              'HELMUT_SOURCE_MODE=off', 'HELMUT_STORAGE_BACKEND=local', 'NODE_V8_COVERAGE=' + BASE + '/coverage',
              OLD + '/node', BASE + '/app/scripts/lokal.js', '--', OLD + '/node', BASE + '/app/scripts/synthetik-500-w15-ram-cas-diagnostic.js'],
              stdout=log, stderr=log, env=ENV, cwd=ROOT, timeout=180)
        docker('cp', CONTAINER + ':' + BASE + '/RAM_CAS_DIAGNOSTIC.SAFE.json', str(WORK / 'RAM_CAS_DIAGNOSTIC.SAFE.json'))
        docker('cp', CONTAINER + ':' + BASE + '/coverage', str(WORK / 'coverage'))
        report = json.loads((WORK / 'RAM_CAS_DIAGNOSTIC.SAFE.json').read_text())
        assert result.returncode == 0 and report['status'] == 'PASS_CAUSAL_POSTGREST_AUTH_SPILL_DIAGNOSIS_ONLY', 'w15-auth-check-first-failure'
    except BaseException as e: failure = {'type': type(e).__name__, 'reason': str(e), 'retryAllowed': False}
    finally:
        if created:
            try:
                # Kill only surviving owned probe services; never the PG entrypoint.
                code = "const f=require('fs');for(const n of ['probe','postgrest']){const p='" + BASE + "/'+n+'.pid';if(!f.existsSync(p))continue;const id=Number(f.readFileSync(p,'utf8'));if(!Number.isSafeInteger(id)||id<2)throw Error('pid');try{const c=f.readFileSync('/proc/'+id+'/cmdline','utf8');if(!c.includes('" + BASE + "'))throw Error('unowned');process.kill(id,'SIGTERM');}catch(e){if(!['ENOENT','ESRCH'].includes(e.code))throw e;}}"
                docker('exec', '--user', '1000:1000', CONTAINER, OLD + '/node', '-e', code)
                q = "begin read only;set local statement_timeout='10s';select count(*)from public.mandate_profiles where aktiv;rollback;"
                zero = docker('exec', '-i', CONTAINER, 'psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DB, '-f', '-', data=q.encode()).decode().strip() == '0'
            except BaseException: failure = failure or {'reason': 'w15-auth-check-zero-or-closure-unknown'}
        save('RESULT.SAFE.json', {'status': 'PASS' if not failure and zero else 'FAIL_OR_UNKNOWN', 'failure': failure,
          'activeProfiles': 0 if zero else None, 'unitExecutions': 0, 'providerCalls': 0, 'newContainers': 0, 'retryAllowed': False})
    print(json.dumps({'status': 'PASS' if not failure and zero else 'FAIL', 'reportAvailable': report is not None, 'activeZero': zero}))
    if failure or not zero: raise SystemExit(1)
if __name__ == '__main__': main()
