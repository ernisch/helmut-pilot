#!/usr/bin/env python3
"""Opt-in bounded native proof, derived from an actual restored local input.

Never imports the absent historical W35 fixture or starts a500 workflow. Only
one new owned network-none PG17.6 clone may be written. All old inputs, loops,
containers and evidence remain untouched. Import has no execution side effect.
"""
import csv, hashlib, importlib.util, io, json, os, pathlib, subprocess, sys, time, uuid

REPO = pathlib.Path(__file__).resolve().parents[2]
ROOT = pathlib.Path('/workspace/helmut-ram-fix-20261020/native-read-proof')
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, REPO / 'scripts/helmut-resource-meter' / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def pin(path):
    path = pathlib.Path(path)
    assert path.is_file() and not path.is_symlink()
    b = path.read_bytes()
    return dict(path=str(path), bytes=len(b), sha256=hashlib.sha256(b).hexdigest())


def save(path, value):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')


def lit(value):
    return "'" + str(value).replace("'", "''") + "'"


def jlit(value):
    return lit(json.dumps(value, ensure_ascii=False, separators=(',', ':'))) + '::jsonb'


def main():
    extra = sys.argv[1:] == ['--review-requested-negatives']
    assert not sys.argv[1:] or extra, 'Only exact new native proof or review-requested negatives'
    for name in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
        os.environ.pop(name, None)
    manifest = json.loads((ROOT / 'READ_ONLY_REAL_INPUT_CAPTURE.SAFE.json').read_text())
    assert manifest['scope'] == 'ACTUAL_RESTORED_INPUT19_READ_ONLY_CAPTURE_NOT_W35_ORIGINAL'
    assert manifest['sourcePin'] == pin(ROOT / 'ACTUAL_RESTORED_INPUT19_AUTH.PRIVATE.json')
    source = json.loads(pathlib.Path(manifest['sourcePin']['path']).read_text())
    witness_path = pathlib.Path('/workspace/helmut-parallel-20261015/wave41-approved-local-preparations/input19-e400dff25393/CORRECTED_NATIVE_FINANCIAL_WITNESS.PRIVATE.json')
    witness = json.loads(witness_path.read_text())
    assert source['nativeJSONBSHA256'] == manifest['nativeJSONBSHA256'] == witness['nativeAuthSHA']
    assert source['data'] == json.loads(witness['nativeAuthText'])
    assert len(source['data']['llmUsage']) == 5000
    tag = uuid.uuid4().hex[:10]
    out = ROOT / ('case-' + tag)
    out.mkdir(mode=0o700)
    K = module('bounded_native_kernel', 'kernel-meter.py')
    B = module('bounded_native_storage', 'bounded-storage.py')
    parent = 'helmut-meter-bounded-read-' + tag
    name = 'helmut-bounded-read-' + tag
    cid = None
    storage = None
    failure = None
    result = {'scope': 'SMALL_NATIVE_SQL_DELTA_ONLY_NOT_FULL500_OR_COMMON_RAM_ACCEPTANCE',
              'sourcePin': manifest['sourcePin'], 'originalWitnessPin': pin(witness_path),
              'sourceWrites': 0, 'profileActivations': 0, 'full500Runs': 0, 'GOConsumed': False,
              'production': False, 'automaticRetry': False, 'sourcePins': [], 'reviewRequestedNegatives': extra}
    for f in ['supabase/proposals/auth_usage_atomic_local.sql', 'supabase/proposals/auth_state_parts_local.sql',
              'supabase/proposals/auth_read_bounded_local.sql', 'supabase/proposals/auth_read_bounded_local.rollback.sql',
              'lib/helmut/auth-state-parts.js', 'scripts/helmut-resource-meter/bounded-read-native-proof.py']:
        result['sourcePins'].append(pin(REPO / f))
    save(out / 'ONCE_STARTED.SAFE.json', result)

    def docker(args, **kw):
        return subprocess.run(DOCKER + args, check=True, capture_output=True, **kw)

    def sql(q, timeout=45):
        return docker(['exec', '-i', '-u', 'postgres', cid, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
                       '-v', 'VERBOSITY=verbose', '-d', 'postgres'], input=q, text=True, timeout=timeout).stdout.strip()

    def read(q):
        return json.loads(sql('BEGIN READ ONLY;SET LOCAL statement_timeout=\'20s\';' + q + ';ROLLBACK;'))

    def catalog():
        # Run the unchanged exact catalog assertions INSIDE the owned group.
        code = "const cp=require('node:child_process'),A=require(" + json.dumps(str(REPO / 'scripts/helmut-resource-meter/atomic-usage-integration.js')) + ");for(const [q,a]of[[A.catalogSQL(),A.assertCatalog],[A.stateCatalogSQL(),A.assertStateCatalog]])a(JSON.parse(cp.execFileSync('psql',['-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'})));console.log('EXACT_BASE_CATALOG_PASS');"
        assert docker(['exec', cid, str(K.NODE_ROOT / 'bin/node'), '-e', code], text=True, timeout=40).stdout.strip() == 'EXACT_BASE_CATALOG_PASS'

    def physical():
        return read("SELECT jsonb_build_object('auth',encode(sha256(convert_to(data::text,'UTF8')),'hex'),"
                    "'usageRows',(SELECT count(*)FROM public.llm_usage),'nodes',(SELECT count(*)FROM public.helmut_auth_state_nodes_local))"
                    "FROM public.helmut_store WHERE id='main-auth'")

    def func_catalog():
        return read("SELECT jsonb_object_agg(p.proname,jsonb_build_object('body',p.prosrc,'args',oidvectortypes(p.proargtypes),"
                    "'result',format_type(p.prorettype,NULL),'volatility',p.provolatile,'definer',p.prosecdef,'config',p.proconfig,"
                    "'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text))FROM pg_proc p WHERE p.pronamespace='public'::regnamespace "
                    "AND p.proname LIKE 'helmut_auth_%'")

    def reject(q, pattern):
        before = physical()
        run = subprocess.run(DOCKER + ['exec', '-i', '-u', 'postgres', cid, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres'],
                             input="BEGIN;SET LOCAL statement_timeout='5s';" + q + ';ROLLBACK;', text=True, capture_output=True, timeout=15)
        assert run.returncode != 0 and pattern in run.stderr, run.stderr[:500]
        assert before == physical()

    try:
        if extra:
            # SQL-only follow-up; never claim a block-capacity or full resource
            # acceptance from this ordinary fresh diagnostic Docker volume.
            fs = os.statvfs(out)
            assert fs.f_bavail * fs.f_frsize >= 8 * 1024 ** 3 + 512 * 1024 ** 2
            volume = name + '-sql-only-volume'
            probe = subprocess.run(DOCKER + ['volume', 'inspect', volume], capture_output=True)
            assert probe.returncode != 0, 'Never reuse a native diagnostic volume'
            docker(['volume', 'create', volume], text=True, timeout=15)
            data_mount = 'type=volume,src=' + volume
            result['sqlOnlyVolume'] = volume
        else:
            probe = out / 'loop-probe'
            subprocess.run([sys.executable, str(REPO / 'scripts/helmut-resource-meter/probe-loop-capability.py'), str(probe)], check=True, capture_output=True, timeout=45)
            capability = json.loads((probe / 'LOOP_CAPABILITY.SAFE.json').read_text())
            assert capability['exitCode'] == 0 and capability['native']['loopControlReadable']
            assert not capability['native']['backingFileAttached'] and capability['native']['mountsOrFormats'] == 0
            storage = B.create(B.BASE / ('bounded-read-' + tag), 536870912, capability['native']['freeLoopIndex'], parent + '/storage', hold=1800)
            save(out / 'BOUNDED_STORAGE.SAFE.json', storage)
            data_mount = 'type=volume,src=' + storage['volume']
        args = ['create', '--name', name, '--network', 'none', '--security-opt', 'no-new-privileges', '--cgroup-parent=/' + parent,
                '--mount', data_mount + ',dst=/var/lib/postgresql/data',
                '--mount', 'type=bind,src=' + str(out) + ',dst=/bench',
                '--mount', 'type=bind,src=' + str(REPO) + ',dst=' + str(REPO) + ',readonly',
                '--mount', 'type=bind,src=' + str(ROOT / 'ACTUAL_RESTORED_INPUT19_AUTH.PRIVATE.json') + ',dst=/actual-input.json,readonly',
                '--mount', 'type=bind,src=' + str(K.NODE_ROOT) + ',dst=' + str(K.NODE_ROOT) + ',readonly',
                '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', 'PGDATA=/var/lib/postgresql/data/pgdata',
                K.IMAGE, 'postgres', '-c', 'helmut.local_usage_experiment=on', '-c', 'work_mem=4MB',
                '-c', 'track_io_timing=on', '-c', 'shared_preload_libraries=pg_stat_statements', '-c', 'pg_stat_statements.track=all',
                '-c', 'wal_compression=off', '-c', 'full_page_writes=on', '-c', 'fsync=on', '-c', 'synchronous_commit=on']
        cid = docker(args, text=True).stdout.strip()
        docker(['start', cid], text=True, timeout=15)
        for _ in range(100):
            logs = docker(['logs', cid], timeout=10)
            if b'PostgreSQL init process complete; ready for start up.' in logs.stdout + logs.stderr:
                if subprocess.run(DOCKER + ['exec', '-u', 'postgres', cid, 'pg_isready', '-q'], capture_output=True).returncode == 0:
                    break
            time.sleep(.1)
        else:
            raise RuntimeError('new isolated native clone not ready')
        sql("CREATE EXTENSION pg_stat_statements;CREATE ROLE service_role NOLOGIN;CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;"
            "CREATE ROLE bench_writer NOLOGIN;GRANT service_role TO bench_writer;GRANT USAGE ON SCHEMA public TO bench_writer;"
            "CREATE TABLE public.helmut_store(id text PRIMARY KEY,data jsonb NOT NULL,updated_at timestamptz DEFAULT now());"
            "ALTER TABLE public.helmut_store ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE ON public.helmut_store TO bench_writer;"
            "CREATE POLICY bench_scope ON public.helmut_store TO bench_writer USING(id='main-auth')WITH CHECK(id='main-auth');")
        stream = io.StringIO()
        csv.writer(stream, lineterminator='\n').writerow(['main-auth', json.dumps(source['data'], ensure_ascii=False), source['updated_at']])
        sql('COPY public.helmut_store(id,data,updated_at)FROM stdin WITH(FORMAT csv);\n' + stream.getvalue() + '\\.\n')
        assert sql("SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM public.helmut_store WHERE id='main-auth'") == source['nativeJSONBSHA256']
        schema = (REPO / 'supabase/schema.sql').read_text()
        start = schema.index('create table if not exists public.llm_usage (')
        sql(schema[start:schema.index(');', start) + 2])
        sql((REPO / 'supabase/proposals/auth_usage_atomic_local.sql').read_text())
        sql((REPO / 'supabase/proposals/auth_state_parts_local.sql').read_text())
        catalog()
        sql("CREATE POLICY bench_usage_scope ON public.llm_usage TO bench_writer USING(usage_store_id='main-auth')WITH CHECK(usage_store_id='main-auth');"
            "CREATE POLICY bench_nodes_scope ON public.helmut_auth_state_nodes_local AS RESTRICTIVE FOR ALL TO bench_writer USING(store_id='main-auth')WITH CHECK(store_id='main-auth');")
        sql('SELECT public.helmut_auth_usage_bootstrap_v1(' + jlit(dict(id='main-auth', expectedHash=source['nativeJSONBSHA256'])) + ')')
        build_code = "const fs=require('node:fs'),S=require(" + json.dumps(str(REPO / 'lib/helmut/auth-state-parts.js')) + "),a=JSON.parse(fs.readFileSync('/actual-input.json')).data,b=S.build(a);fs.writeFileSync('/bench/BUILT_NODES.PRIVATE.json',JSON.stringify(b),{mode:0o600,flag:'wx'});fs.chownSync('/bench/BUILT_NODES.PRIVATE.json'," + str(os.getuid()) + ',' + str(os.getgid()) + ");"
        docker(['exec', cid, str(K.NODE_ROOT / 'bin/node'), '-e', build_code], text=True, timeout=30)
        tree = json.loads((out / 'BUILT_NODES.PRIVATE.json').read_text())
        h = sql("SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM public.helmut_store WHERE id='main-auth'")
        sql('SELECT public.helmut_auth_state_bootstrap_v1(' + jlit(dict(id='main-auth', expectedHash=h, root=tree['root'], nodes=tree['nodes'])) + ')')
        before = physical()
        old_catalog = func_catalog()
        a = read("SELECT public.helmut_auth_state_read_v1('{\"id\":\"main-auth\"}')")
        assert {k: v for k, v in a['data'].items() if k != '_authStoreRevision'} == {k: v for k, v in source['data'].items() if k != '_authStoreRevision'}
        requests = [dict(id='main-auth'), dict(id='main-auth', knownProof=None, readNonce=str(uuid.uuid4())),
                    dict(id='main-auth', knownProof=a['proof'], readNonce=str(uuid.uuid4())),
                    dict(id='main-auth', knownProof={**a['proof'], 'count': a['proof']['count'] + 1}, readNonce=str(uuid.uuid4()))]
        baseline = [read('SELECT public.helmut_auth_state_graph_read_v1(' + jlit(q) + ')') for q in requests]
        full = baseline[0]
        digest = hashlib.sha256('|'.join(n['hash'] for n in full['graph']['nodes']).encode()).hexdigest()
        requests.append(dict(id='main-auth', knownProof=a['proof'], readNonce=str(uuid.uuid4()),
                             knownGraph=dict(state=a['state'], nodeCount=len(full['graph']['nodes']), nodeDigest=digest)))
        baseline.append(read('SELECT public.helmut_auth_state_graph_read_v1(' + jlit(requests[-1]) + ')'))
        save(out / 'BASELINE_PROTOCOL.PRIVATE.json', baseline)
        sql((REPO / 'supabase/proposals/auth_read_bounded_local.sql').read_text())
        new_catalog = func_catalog()
        added = {'helmut_auth_usage_checked_proof_local_v1', 'helmut_auth_state_graph_checked_local_v1'}
        assert set(new_catalog) == set(old_catalog) | added
        for f in old_catalog:
            if f != 'helmut_auth_state_graph_read_v1':
                assert new_catalog[f] == old_catalog[f], f
        for f in added | {'helmut_auth_state_graph_read_v1'}:
            assert not new_catalog[f]['definer'] and new_catalog[f]['volatility'] == 's'
            assert new_catalog[f]['config'] == ['search_path=pg_catalog'] and new_catalog[f]['owner'] == 'postgres'
        candidate = [read('SELECT public.helmut_auth_state_graph_read_v1(' + jlit(q) + ')') for q in requests]
        assert candidate == baseline, 'whole native JSONB response protocol changed'
        assert before == physical()
        assert read('SET LOCAL ROLE bench_writer;SELECT public.helmut_auth_state_graph_read_v1(' + jlit(requests[2]) + ')') == baseline[2]
        negatives = []
        for role in ['anon', 'authenticated']:
            for call in ["public.helmut_auth_usage_checked_proof_local_v1('main-auth')",
                         "public.helmut_auth_state_graph_checked_local_v1('main-auth','x','" + '0' * 64 + "',false)",
                         "public.helmut_auth_state_graph_read_v1('{\"id\":\"main-auth\"}')"]:
                reject('SET LOCAL ROLE ' + role + ';SELECT ' + call, 'permission denied')
                negatives.append('denied-' + role + '-' + call.split('(')[0])
        for q in [dict(id='main-auth', extra=True), dict(id='main-auth', knownProof=a['proof'], readNonce='bad'),
                  dict(id='main-auth', knownProof={**a['proof'], 'count': -1}, readNonce=str(uuid.uuid4()))]:
            reject('SELECT public.helmut_auth_state_graph_read_v1(' + jlit(q) + ')', 'input')
            negatives.append('malformed-request')
        reject("SET LOCAL helmut.local_usage_experiment='off';SELECT public.helmut_auth_usage_checked_proof_local_v1('main-auth')", 'local-only')
        reject("SET LOCAL helmut.local_usage_experiment='off';SELECT public.helmut_auth_state_graph_read_v1(" + jlit(requests[2]) + ')', 'local-only')
        reject("SET LOCAL ROLE bench_writer;SELECT public.helmut_auth_usage_checked_proof_local_v1('foreign-diagnostic-only')", 'no rows')
        reject("SELECT public.helmut_auth_state_graph_checked_local_v1('main-auth','foreign-generation','" + '0' * 64 + "',false)", 'node-missing')
        if extra:
            cases = [
                ('usage-null', "SELECT public.helmut_auth_usage_checked_proof_local_v1(NULL)", 'read-input'),
                ('usage-empty', "SELECT public.helmut_auth_usage_checked_proof_local_v1('')", 'read-input'),
                ('usage-overlong', "SELECT public.helmut_auth_usage_checked_proof_local_v1(repeat('s',257))", 'read-input'),
                ('usage-nontext', "SELECT public.helmut_auth_usage_checked_proof_local_v1(0)", 'does not exist'),
                ('graph-null-hash', "SELECT public.helmut_auth_state_graph_checked_local_v1('main-auth','x',NULL,false)", 'expand-input'),
                ('graph-bad-hash', "SELECT public.helmut_auth_state_graph_checked_local_v1('main-auth','x','bad',false)", 'expand-input'),
                ('graph-null-omit', "SELECT public.helmut_auth_state_graph_checked_local_v1('main-auth','x','" + '0' * 64 + "',NULL)", 'expand-input')]
            for field in ['nodeCount', 'nodeDigest']:
                q = json.loads(json.dumps(requests[-1]))
                q['knownGraph'][field] = len(full['graph']['nodes']) + 1 if field == 'nodeCount' else ('0' * 64 if digest != '0' * 64 else '1' * 64)
                cases.append(('graph-' + field + '-mismatch', 'SELECT public.helmut_auth_state_graph_read_v1(' + jlit(q) + ')', 'reuse-content-mismatch'))
            for label, q, expected in cases:
                reject(q, expected)
                negatives.append(label)
        # New fresh metadata is native-derived; altered cached proof causes a
        # complete response rather than permission reuse. Exact equality above
        # includes the nonce-bound digest and every history/graph payload.
        assert candidate[2]['historyReuse']['reused'] is True
        assert candidate[3]['historyReuse']['reused'] is False
        assert candidate[4]['graphReuse']['actualPayloadsChecked'] is True
        result.update(pass_=True, nativeProtocolCases=len(requests), exactWholeResponsesEqual=True,
                      historyRows=5000, stateNodes=len(tree['nodes']), immutableBefore=before, immutableAfter=physical(),
                      addedNativeFunctions=sorted(added), unchangedOtherNativeFunctions=True, nativeNegativeCases=len(negatives) + 4)
        # Bounded repeated warm reads test this exact delta. This is latency/SQL
        # work only, not a comparative common-RAM or completeunit deadline proof.
        times = []
        for _ in range(8):
            q = dict(id='main-auth', knownProof=a['proof'], readNonce=str(uuid.uuid4()))
            began = time.monotonic()
            v = read('SELECT public.helmut_auth_state_graph_read_v1(' + jlit(q) + ')')
            assert v['proof'] == a['proof'] and v['state'] == a['state']
            times.append((time.monotonic() - began) * 1000)
        result['candidateEightFreshWarmReadWallMS'] = times
        result['databaseStats'] = read("SELECT to_jsonb(s)FROM pg_stat_database s WHERE datname=current_database()")
        result['nativeSettings'] = read("SELECT jsonb_object_agg(name,setting)FROM pg_settings WHERE name IN('server_version','fsync','full_page_writes','synchronous_commit','wal_compression','work_mem')")
        sql((REPO / 'supabase/proposals/auth_read_bounded_local.rollback.sql').read_text())
        assert func_catalog() == old_catalog
        assert physical() == before
        result['rollbackExactlyRestoresFunctionBodiesAndACLs'] = True
        result['logicalFieldsAfterRollbackEqual'] = read("SELECT public.helmut_auth_state_read_v1('{\"id\":\"main-auth\"}')") == a
        assert result['logicalFieldsAfterRollbackEqual']
    except BaseException as error:
        failure = error
        result['failure'] = {'type': type(error).__name__, 'message': str(error)[:300]}
        if isinstance(error, subprocess.CalledProcessError):
            save(out / 'FAILURE.PRIVATE.json', dict(stdout=str(error.stdout), stderr=str(error.stderr), exitCode=error.returncode))
    finally:
        if cid:
            state = json.loads(docker(['inspect', '--format', '{{json .State}}', cid], text=True).stdout)
            if state['Running']:
                docker(['stop', '--time', '20', cid], text=True, timeout=30)
            state = json.loads(docker(['inspect', '--format', '{{json .State}}', cid], text=True).stdout)
            result['ownedDatabaseStopped'] = not state['Running'] and state['Pid'] == 0
            logs = docker(['logs', cid])
            p = out / 'DATABASE_SERVER.PRIVATE.log'
            p.write_bytes(logs.stdout + logs.stderr)
            p.chmod(0o600)
            result['databaseLogPin'] = pin(p)
        if storage:
            result['storageFinal'] = B.finish(storage)
        if cid:
            result['kernelThroughLastOwnedExit'] = K.kernel_snapshot(parent, require_empty=True)
        result['containerId'] = cid
        result['comparativeMemoryGainClaimed'] = False
        result['full500AcceptanceClaimed'] = False
        save(out / 'NATIVE_RESULT.SAFE.json', result)
        print(json.dumps({'case': str(out), 'pass': failure is None, 'full500Runs': 0, 'GOConsumed': False}))
    if failure:
        raise failure


if __name__ == '__main__':
    main()
