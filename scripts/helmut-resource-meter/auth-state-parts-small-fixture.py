#!/usr/bin/env python3
"""Existing small PG/PostgREST meter, atomic usage versus immutable auth nodes.

No execution on import. No profiles, command execution, activation or run GO.
Fresh network-none container only. The kernel meter and limits are unchanged.
"""
import csv, datetime, hashlib, importlib.util, io, json, os, pathlib, subprocess, sys, time, uuid

REPO = pathlib.Path('/workspace/helmut-cpu-epoch-20261015')
BASE = pathlib.Path('/workspace/helmut-parallel-20261015/wave35-auth-state-parts/meter')
SOURCE = BASE / 'DIAGNOSTIC_FIXTURE_AUTH.PRIVATE.json'
MANIFEST = BASE / 'DIAGNOSTIC_FIXTURE_MANIFEST.SAFE.json'
spec = importlib.util.spec_from_file_location('auth_state_existing_kernel', REPO / 'scripts/helmut-resource-meter/kernel-meter.py')
K = importlib.util.module_from_spec(spec)
spec.loader.exec_module(K)
ENV = os.environ.copy()
for key in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
    ENV.pop(key, None)
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']


def pin(path):
    p = pathlib.Path(path)
    b = p.read_bytes()
    return {'path': str(p), 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}


def save(path, value):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')


def docker(args, **kw):
    return subprocess.run(DOCKER + args, env=ENV, check=True, capture_output=True, **kw)


def main():
    mode = os.environ['HELMUT_STATE_COMPARE_MODE']
    workload = os.environ.get('HELMUT_STATE_WORKLOAD', 'nested-state')
    if workload not in ['nested-state', 'mixed-state-process-runs']:
        raise ValueError('explicit supported diagnostic workload required')
    if mode == 'security' and workload != 'nested-state':
        raise ValueError('security phases do not run the performance workload')
    if mode not in ['baseline', 'parts', 'security']:
        raise ValueError('explicit small baseline|parts|security mode required')
    test_phase = os.environ.get('HELMUT_STATE_TEST_PHASE', 'security' if mode == 'security' else 'measure')
    if test_phase not in (['security', 'native', 'native-leaf', 'history', 'graph', 'projection', 'single-capture', 'control'] if mode == 'security' else (['measure', 'read-path'] if mode == 'parts' else ['measure'])):
        raise ValueError('explicit security|native phase requires security mode')
    read_path = test_phase == 'read-path'
    renderer_variant = os.environ.get('HELMUT_STATE_RENDERER_VARIANT', 'original')
    if renderer_variant != 'original':
        raise ValueError('descriptor renderer retired: no proven common memory improvement')
    loop_mode = os.environ.get('HELMUT_STATE_READ_PATH_LOOP', '0')
    repeat_writes = os.environ.get('HELMUT_STATE_READ_PATH_REPEAT_WRITES', '0')
    if loop_mode not in ['0', '1'] or repeat_writes not in ['0', '32'] or ((loop_mode != '0' or repeat_writes != '0') and not read_path):
        raise ValueError('explicit bounded storage/read repetitions only in small read-path diagnostic')
    repeat_writes = int(repeat_writes)
    guard_reads = os.environ.get('HELMUT_STATE_READ_PATH_GUARD_READS', '0')
    if guard_reads not in ['0', '16'] or (guard_reads != '0' and (not read_path or loop_mode != '1' or repeat_writes != 0)):
        raise ValueError('sixteen read-only controls require own bounded loop read-path comparison, no repeated writes')
    guard_reads = int(guard_reads)
    history_reuse = os.environ.get('HELMUT_STATE_HISTORY_REUSE', '0')
    if history_reuse not in ['0', '1'] or (history_reuse == '1' and mode == 'baseline'):
        raise ValueError('history reuse only allowed in local parts/security diagnostics')
    if test_phase == 'history' and history_reuse != '1':
        raise ValueError('history security phase requires explicit local reuse mode')
    graph_reuse = os.environ.get('HELMUT_STATE_GRAPH_REUSE', '0')
    if graph_reuse not in ['0', '1'] or (graph_reuse == '1' and (mode == 'baseline' or history_reuse != '1')):
        raise ValueError('graph reuse requires the explicit local parts/history modes')
    if test_phase == 'graph' and graph_reuse != '1':
        raise ValueError('graph security phase requires explicit local graph mode')
    cas_projection = os.environ.get('HELMUT_STATE_CAS_PROJECTION', '0')
    if cas_projection not in ['0', '1'] or (cas_projection == '1' and (mode == 'baseline' or graph_reuse != '0')):
        raise ValueError('CAS projection requires explicit local parts/security and graph cache OFF')
    if test_phase == 'projection' and cas_projection != '1':
        raise ValueError('projection security requires explicit candidate')
    single_capture = os.environ.get('HELMUT_STATE_SINGLE_WRITE_CAPTURE', '0')
    if single_capture not in ['0', '1'] or (single_capture == '1' and (mode == 'baseline' or graph_reuse != '0' or cas_projection != '0')):
        raise ValueError('single capture requires local parts/security, graph cache OFF and legacy native CAS')
    if single_capture == '1' and mode == 'security' and test_phase != 'single-capture':
        raise ValueError('single-capture negatives use their own bounded phase, not state-mode switch tests')
    if test_phase == 'single-capture' and single_capture != '1':
        raise ValueError('single-capture security requires explicit candidate')
    control_view = os.environ.get('HELMUT_STATE_CONTROL_VIEW', '0')
    control_component = mode == 'security' and test_phase == 'control' and loop_mode == '0'
    control_comparison = mode == 'parts' and read_path and loop_mode == '1' and guard_reads == 16
    if control_view not in ['0', '1'] or (control_view == '1' and
            (not (control_component or control_comparison) or history_reuse != '1'
             or graph_reuse != '0' or cas_projection != '0' or single_capture != '0')):
        raise ValueError('control view requires own native component or bounded sixteen-read comparison, other candidates OFF')
    if guard_reads and (history_reuse != '1' or graph_reuse != '0' or cas_projection != '0' or single_capture != '0'):
        raise ValueError('both comparison sides require identical history mode and other candidates OFF')
    if test_phase == 'control' and control_view != '1':
        raise ValueError('control view phase requires explicit candidate')
    manifest = json.loads(MANIFEST.read_text())
    assert manifest['scope'] == 'DIAGNOSTIC_FIXTURE_DATA_ONLY_NO_ACTIVATION'
    assert pin(SOURCE) == manifest['sourcePin']
    # Fresh host checks bind both private originals without copying their data.
    for name in ['originalSourcePin', 'packetPin']:
        assert pin(manifest[name]['path']) == manifest[name]
    assert manifest['counts']['historicalUsageRows'] == 5000
    assert manifest['counts']['retainedUnits'] == 500
    assert manifest['counts']['retainedIntents'] == 1000
    assert manifest['originalsUnmodified'] is True
    assert manifest['commandInstalled'] is False
    assert manifest['profilesActivated'] == manifest['claims'] == manifest['paidCalls'] == 0
    filesystem = os.statvfs(BASE)
    if filesystem.f_bavail * filesystem.f_frsize < 2 * 1024 ** 3:
        raise RuntimeError('small-fixture free disk reserve below2GiB')
    tag = uuid.uuid4().hex[:10]
    case_kind = test_phase if mode == 'security' or read_path else ('mixed-' + mode if workload == 'mixed-state-process-runs' else mode)
    name = 'helmut-auth-state-' + case_kind + '-' + tag
    parent = 'helmut-meter-auth-state-' + case_kind + '-' + tag
    out = BASE / (case_kind + '-' + tag)
    out.mkdir(mode=0o700)
    pg = out / 'pgdata'
    pg.mkdir(mode=0o700)
    K.initialize_parent(parent, name)
    cid = None
    storage = None
    bounded = None
    storage_out = None
    native = {}
    failure = None
    cleanup = {'ownedContainerStopped': False, 'originalsUnmodified': False}
    started_at = time.monotonic()

    def sql(query):
        return docker(['exec', '-i', '-u', 'postgres', cid, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', 'postgres'], input=query, text=True, timeout=40).stdout.strip()

    def native_snapshot():
        reader = 'helmut_auth_usage_read_v1' if mode == 'baseline' else 'helmut_auth_state_read_v1'
        expression = "public." + reader + "('{\"id\":\"main-auth\"}'::jsonb)"
        return json.loads(sql("""BEGIN READ ONLY;SELECT jsonb_build_object(
          'atUTC',clock_timestamp(),'walLSN',pg_current_wal_lsn()::text,
          'wal',(SELECT to_jsonb(w)FROM pg_stat_wal w),'checkpointer',(SELECT to_jsonb(c)FROM pg_stat_checkpointer c),
          'settings',(SELECT jsonb_object_agg(name,setting)FROM pg_settings WHERE name IN('server_version','wal_compression','full_page_writes','fsync','synchronous_commit','wal_level','shared_buffers','wal_buffers','checkpoint_timeout','max_wal_size','default_toast_compression')),
          'physicalDataSHA256',(SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM public.helmut_store WHERE id='main-auth'),
          'logicalDataSHA256',encode(sha256(convert_to((logical.x->'data')::text,'UTF8')),'hex'),
          'state',logical.x->'state','usageProof',logical.x->'proof',
          'rowCount',(SELECT count(*)FROM public.helmut_store),'profileTableAbsent',to_regclass('public.mandate_profiles')IS NULL,
          'databaseSizeBytes',pg_database_size(current_database()),
          'databaseStats',(SELECT to_jsonb(d)FROM pg_stat_database d WHERE d.datname=current_database()),
          'walFiles',(SELECT jsonb_agg(jsonb_build_object('name',name,'bytes',size))FROM pg_ls_waldir()),
          'functionHashes',(SELECT jsonb_object_agg(p.proname,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'))FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname LIKE 'helmut_auth_%'),
          'relations',(SELECT jsonb_agg(jsonb_build_object('relation',c.relname,'totalBytes',pg_total_relation_size(c.oid),'heapBytes',pg_relation_size(c.oid),'indexBytes',pg_indexes_size(c.oid),'toastTotalBytes',CASE WHEN c.reltoastrelid=0 THEN 0 ELSE pg_total_relation_size(c.reltoastrelid)END,'insert',s.n_tup_ins,'update',s.n_tup_upd,'hotUpdate',s.n_tup_hot_upd,'delete',s.n_tup_del,'estimatedDead',s.n_dead_tup))FROM pg_class c LEFT JOIN pg_stat_all_tables s ON c.oid=s.relid WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'))FROM(SELECT """ + expression + """ AS x OFFSET 0)logical;
          ROLLBACK;"""))

    def network_snapshot():
        text = docker(['exec', cid, 'cat', '/proc/net/dev'], text=True, timeout=10).stdout
        result = {}
        for line in text.splitlines()[2:]:
            interface, payload = line.split(':', 1)
            fields = list(map(int, payload.split()))
            result[interface.strip()] = dict(zip(['rxBytes', 'rxPackets', 'rxErrors', 'rxDrops', 'rxFifo', 'rxFrame', 'rxCompressed', 'rxMulticast', 'txBytes', 'txPackets', 'txErrors', 'txDrops', 'txFifo', 'txCollisions', 'txCarrier', 'txCompressed'], fields))
        return result

    try:
        if loop_mode == '1':
            probe_out = out / 'loop-capability'
            subprocess.run([sys.executable, str(REPO / 'scripts/helmut-resource-meter/probe-loop-capability.py'), str(probe_out)], env=ENV, capture_output=True, text=True, check=True, timeout=60)
            capability = json.loads((probe_out / 'LOOP_CAPABILITY.SAFE.json').read_text())
            assert capability['exitCode'] == 0 and capability['native']['loopControlReadable'] is True
            assert capability['native']['backingFileAttached'] is False and capability['native']['mountsOrFormats'] == 0
            probe = json.loads(docker(['inspect', capability['containerId']], text=True, timeout=10).stdout)[0]
            assert not probe['State']['Running'] and probe['State']['Pid'] == 0 and probe['Name'].startswith('/helmut-meter-loop-probe-')
            assert probe['HostConfig']['CgroupParent'] == probe['Name'] and probe['Image'] == K.IMAGE
            docker(['rm', probe['Id']], text=True, timeout=15)
            save(out / 'PROBE_HULL_RETIRED.SAFE.json', {'containerId': probe['Id'], 'metadataAndKernelReceiptRetained': True, 'noForceNoVolumes': True})
            bounded_spec = importlib.util.spec_from_file_location('read_path_existing_bounded', REPO / 'scripts/helmut-resource-meter/bounded-storage.py')
            bounded = importlib.util.module_from_spec(bounded_spec)
            bounded_spec.loader.exec_module(bounded)
            storage_out = bounded.BASE / ('readpath-loop-' + tag)
            storage = bounded.create(storage_out, 1073741824, capability['native']['freeLoopIndex'], parent + '/storage', hold=600)
            save(out / 'BOUNDED_STORAGE.SAFE.json', storage)
        args = ['create', '--name', name, '--network', 'none', '--cgroup-parent=/' + parent,
                '--security-opt', 'no-new-privileges',
                '--mount', ('type=volume,src=' + storage['volume'] if storage else 'type=bind,src=' + str(pg)) + ',dst=/var/lib/postgresql/data',
                '--mount', 'type=bind,src=' + str(out) + ',dst=/bench',
                '--mount', 'type=bind,src=' + str(SOURCE) + ',dst=/bench-input.json,readonly',
                '--mount', 'type=bind,src=' + str(MANIFEST) + ',dst=/bench-input-manifest.json,readonly',
                '--mount', 'type=bind,src=' + str(K.NODE_ROOT) + ',dst=' + str(K.NODE_ROOT) + ',readonly',
                '--mount', 'type=bind,src=' + str(K.PYTHON_ROOT) + ',dst=' + str(K.PYTHON_ROOT) + ',readonly',
                '--mount', 'type=bind,src=' + str(REPO) + ',dst=' + str(REPO) + ',readonly',
                '--mount', 'type=bind,src=/workspace/helmut-parallel-20261015/wave20-resource-integration/source-capture/postgrest-pinned,dst=/postgrest,readonly',
                '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', 'POSTGRES_DB=postgres', '--env', 'PGDATA=' + ('/var/lib/postgresql/data/pgdata' if storage else '/var/lib/postgresql/data'),
                K.IMAGE, 'postgres', '-c', 'helmut.local_usage_experiment=on',
                '-c', 'helmut.local_auth_state_cas_projection=' + ('on' if cas_projection == '1' else 'off'),
                '-c', 'helmut.local_diagnostic_scope=bounded-cas-qualification-v1',
                '-c', 'shared_preload_libraries=pg_stat_statements', '-c', 'pg_stat_statements.track=all',
                '-c', 'log_temp_files=0', '-c', 'track_io_timing=on', '-c', 'work_mem=4MB',
                '-c', 'wal_compression=off', '-c', 'full_page_writes=on', '-c', 'fsync=on', '-c', 'synchronous_commit=on']
        cid = docker(args, text=True).stdout.strip()
        read_path_operations = 10 + repeat_writes + 2 * (guard_reads - 2 if guard_reads else 0)
        save(out / 'STARTED.SAFE.json', {'scope': 'SMALL_DATABASE_OPERATIONS_NO_ACTIVATION_NO_500_RUN', 'name': name, 'database': 'postgres', 'cid': cid, 'parent': parent, 'mode': mode, 'testPhase': test_phase, 'workload': workload, 'rendererVariant': renderer_variant, 'historyReuse': history_reuse == '1', 'graphReuse': graph_reuse == '1', 'casProjection': cas_projection == '1', 'singleWriteCapture': single_capture == '1', 'controlView': control_view == '1', 'readPathLoopMode': loop_mode == '1', 'readPathRepeatWrites': repeat_writes, 'readPathGuardReadsPerState': guard_reads, 'expectedLogicalOperations': 0 if mode == 'security' else (read_path_operations if read_path else 96), 'expectedCASRequests': 0 if mode == 'security' else (4 + repeat_writes if read_path else (120 if workload == 'mixed-state-process-runs' else 96)), 'operations': 0 if mode == 'security' else (read_path_operations if read_path else 96), 'repository': str(REPO), 'fixtureManifestPin': pin(MANIFEST), 'fixturePin': pin(SOURCE), 'harnessPin': pin(__file__), 'kernelMeterPin': pin(REPO / 'scripts/helmut-resource-meter/kernel-meter.py'), 'activation': False, 'GOClaimed': False, 'production': False})
        docker(['start', cid], text=True, timeout=15)
        for _ in range(100):
            log = docker(['logs', cid], timeout=10)
            if b'PostgreSQL init process complete; ready for start up.' in log.stdout + log.stderr:
                result = subprocess.run(DOCKER + ['exec', '-u', 'postgres', cid, 'pg_isready', '-q'], env=ENV, capture_output=True, timeout=10)
                if result.returncode == 0:
                    break
            time.sleep(.1)
        else:
            raise RuntimeError('fresh small server not ready')
        assert sql("SELECT current_setting('helmut.local_auth_state_cas_projection');") == ('on' if cas_projection == '1' else 'off')
        sql("CREATE EXTENSION pg_stat_statements;CREATE ROLE bench_writer NOLOGIN;CREATE ROLE bench_denied NOLOGIN;CREATE ROLE service_role NOLOGIN;GRANT service_role TO bench_writer;CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE TABLE public.helmut_store(id text PRIMARY KEY,data jsonb NOT NULL,updated_at timestamptz DEFAULT now());ALTER TABLE public.helmut_store ENABLE ROW LEVEL SECURITY;GRANT USAGE ON SCHEMA public TO bench_writer;GRANT SELECT,INSERT,UPDATE ON public.helmut_store TO bench_writer;CREATE POLICY bench_auth ON public.helmut_store TO bench_writer USING(id='main-auth')WITH CHECK(id='main-auth');")
        sql((REPO / 'supabase/proposals/auth_store_cas_scalar_jsonb.sql').read_text())
        sql((REPO / 'supabase/proposals/synthetik500_stored_command_binding.sql').read_text())
        source_data = json.loads(SOURCE.read_text())
        stream = io.StringIO()
        csv.writer(stream, lineterminator='\n').writerow(['main-auth', json.dumps(source_data['data']), source_data['updated_at']])
        sql("COPY public.helmut_store(id,data,updated_at)FROM stdin WITH(FORMAT csv);\n" + stream.getvalue() + '\\.\n')
        schema = (REPO / 'supabase/schema.sql').read_text()
        start = schema.index('create table if not exists public.llm_usage (')
        end = schema.index(');', start) + 2
        sql(schema[start:end])
        sql((REPO / 'supabase/proposals/auth_usage_atomic_local.sql').read_text())
        check_script = str(REPO / 'scripts/helmut-resource-meter/auth-state-parts-check.js')
        argv = [str(K.NODE_ROOT / 'bin/node'), check_script]
        if mode != 'baseline':
            sql((REPO / 'supabase/proposals/auth_state_parts_local.sql').read_text())
            # Strict source-only native catalog is checked before adding the
            # separately declared diagnostic-role restriction. No normalization.
            docker(['exec', cid] + argv + ['catalog', mode, str(os.getuid()), str(os.getgid())], text=True, timeout=30)
            # This local PostgREST role has no BYPASSRLS. Its inherited
            # service-role permissions are narrowed to this sole fixture ID.
            # RESTRICTIVE also intersects the proposal's service-role policy.
            sql("CREATE POLICY local_auth_state_bench_scope ON public.helmut_auth_state_nodes_local AS RESTRICTIVE FOR ALL TO bench_writer USING(store_id='main-auth')WITH CHECK(store_id='main-auth');")
            save(out / 'DIAGNOSTIC_RLS_ROLE.SAFE.json', json.loads(sql("SELECT jsonb_build_object('postgrestRole','bench_writer','bypassRLS',(SELECT rolbypassrls FROM pg_roles WHERE rolname='bench_writer'),'nodePolicy',(SELECT row_to_json(p)FROM pg_policies p WHERE schemaname='public'AND tablename='helmut_auth_state_nodes_local'AND policyname='local_auth_state_bench_scope'));")))
        sql("CREATE POLICY local_usage_bench ON public.llm_usage TO bench_writer USING(usage_store_id='main-auth')WITH CHECK(usage_store_id='main-auth');SELECT pg_stat_statements_reset();")
        config = 'db-uri = "postgresql://postgres@127.0.0.1:5432/postgres"\ndb-anon-role = "bench_writer"\ndb-schemas = "public"\nserver-host = "127.0.0.1"\nserver-port = 38419\ndb-plan-enabled = true\ndb-pool = ' + ('2' if mode == 'security' else '1') + '\nlog-level = "error"\n'
        config_path = out / 'postgrest.PRIVATE.conf'
        config_path.write_text(config)
        config_path.chmod(0o644)
        docker(['exec', '-d', cid, '/postgrest', '/bench/postgrest.PRIVATE.conf'], text=True, timeout=10)
        docker(['exec', cid] + argv + ['prepare', mode, str(os.getuid()), str(os.getgid())], text=True, timeout=120)
        if mode == 'security':
            result = docker(['exec', cid] + argv + [test_phase, mode, str(os.getuid()), str(os.getgid())], text=True, timeout=180)
            save(out / 'SECURITY_CLIENT_EXIT.SAFE.json', {'exitCode': result.returncode, 'stdoutBytes': len(result.stdout), 'stderrBytes': len(result.stderr)})
        else:
            native['beforeWorkload'] = native_snapshot()
            save(out / 'NATIVE_BEFORE_WORKLOAD.SAFE.json', native['beforeWorkload'])
            settings = native['beforeWorkload']['settings']
            assert settings['server_version'].split()[0] == '17.6'
            assert settings['wal_compression'] == 'off'
            assert all(settings[key] == 'on' for key in ['full_page_writes', 'fsync', 'synchronous_commit'])
            assert native['beforeWorkload']['profileTableAbsent'] is True
            native['networkBeforeWorkload'] = network_snapshot()
            before = K.kernel_snapshot(parent)
            samples = []
            workload_start = time.monotonic()
            phase_argv = [str(K.NODE_ROOT / 'bin/node'), str(REPO / 'scripts/helmut-resource-meter/auth-state-read-path-case.js')] if read_path else argv
            child = subprocess.Popen(DOCKER + ['exec', cid] + phase_argv + [test_phase, mode, str(os.getuid()), str(os.getgid())], env=ENV, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            checkpoint_done = False
            try:
                while child.poll() is None:
                    if time.monotonic() - workload_start > 180:
                        raise RuntimeError('bounded96-logical-operation diagnostic timeout; do not repeat')
                    sample = K.kernel_snapshot(parent)
                    sample['unixMS'] = time.time() * 1000
                    try:
                        sample['progress'] = json.loads((out / 'PROGRESS.SAFE.json').read_text())
                    except (FileNotFoundError, json.JSONDecodeError):
                        sample['progress'] = {'completed': 0}
                    stat = K.key_values(K.validated_parent(parent) / 'memory.stat')
                    sample['memoryStat'] = {key: stat[key] for key in ['anon', 'file', 'inactive_file', 'active_file', 'kernel', 'shmem', 'file_dirty', 'file_writeback', 'workingset_refault_file'] if key in stat}
                    samples.append(sample)
                    if sample['memoryPeakBytes'] > 2048000000:
                        raise RuntimeError('small diagnostic common memory limit exceeded2048000000B; do not repeat')
                    if not checkpoint_done and (out / 'CHECKPOINT_REQUEST.SAFE.json').exists():
                        native['beforeCheckpoint'] = native_snapshot()
                        tick = time.monotonic()
                        sql('CHECKPOINT;')
                        native['checkpointCallWallMS'] = (time.monotonic() - tick) * 1000
                        native['afterCheckpoint'] = native_snapshot()
                        save(out / 'CHECKPOINT_DONE.SAFE.json', {'performedOnce': True, 'afterLogicalOperations': 48, 'actualCASCompleted': samples[-1]['progress'].get('actualCASCompleted'), 'noSecuritySettingChanged': True})
                        checkpoint_done = True
                    time.sleep(.05)
                stdout, stderr = child.communicate(timeout=10)
                if child.returncode != 0:
                    raise RuntimeError('small diagnostic client failed: ' + stderr[:200])
            finally:
                # Stopping own container in outer finally also terminates an
                # exec client if the host docker-exec wrapper became detached.
                if child.poll() is None:
                    child.terminate()
                    child.communicate(timeout=10)
                save(out / 'WRITE_PHASE_KERNEL.SAFE.json', {'before': before, 'after': K.kernel_snapshot(parent), 'samples': samples, 'clientExitCode': child.returncode, 'unchangedExistingKernelMeter': True, 'observerHostOutsideBothComparedFixtures': True})
            assert read_path or checkpoint_done
            time.sleep(1.2)
            native['afterWrites'] = native_snapshot()
            native['networkAfterWorkload'] = network_snapshot()
            result_file = 'READ_PATH_RESULT.SAFE.json' if read_path else 'HTTP_RESULT.SAFE.json'
            native['logicalDataVerifiedByActualNativeReader'] = json.loads((out / result_file).read_text())['nativeLogicalDataEqualsExpected']
            assert native['logicalDataVerifiedByActualNativeReader'] is True
            save(out / 'NATIVE_WAL_INTEGRITY.SAFE.json', native)
            stats = json.loads(sql("SELECT json_build_object('temporaryBytes',(SELECT temp_bytes FROM pg_stat_database WHERE datname=current_database()),'temporaryFiles',(SELECT temp_files FROM pg_stat_database WHERE datname=current_database()),'statements',(SELECT json_agg(json_build_object('query',query,'calls',calls,'rows',rows,'execMS',total_exec_time,'tempWriteBlocks',temp_blks_written,'tempReadBlocks',temp_blks_read,'walBytes',wal_bytes,'walFPI',wal_fpi))FROM pg_stat_statements WHERE query NOT LIKE '%pg_stat_statements%'));"))
            save(out / 'SQL_STATS.PRIVATE.json', stats)
        save(out / 'BENCHMARK_MEASURED.SAFE.json', {'mode': mode, 'testPhase': test_phase, 'workload': workload, 'smallMeasuredWallMS': (time.monotonic() - started_at) * 1000, 'scope': 'SMALL_OPERATIONS_NOT_UNIT60_AUTH30_OR_FULL500', 'noActivation': True, 'noGOClaim': True, 'noProduction': True})
    except BaseException as error:
        failure = error
        safe_error = {'name': type(error).__name__, 'message': str(error)[:300], 'automaticRepeat': False}
        if isinstance(error, subprocess.CalledProcessError):
            save(out / 'LAST_FAILURE.PRIVATE.json', {'exitCode': error.returncode, 'stdout': error.stdout.decode(errors='replace') if isinstance(error.stdout, bytes) else error.stdout, 'stderr': error.stderr.decode(errors='replace') if isinstance(error.stderr, bytes) else error.stderr})
        save(out / 'FAILED.SAFE.json', safe_error)
    finally:
        if cid:
            try:
                inspected = json.loads(docker(['inspect', '--format', '{{json .State}}', cid], text=True, timeout=10).stdout)
                if inspected['Running']:
                    docker(['stop', '--time', '15', cid], text=True, timeout=25)
                state = json.loads(docker(['inspect', '--format', '{{json .State}}', cid], text=True, timeout=10).stdout)
                cleanup['ownedContainerStopped'] = state['Running'] is False
                logs = docker(['logs', cid], timeout=10)
                payload = logs.stdout + logs.stderr
                log_path = out / 'DATABASE_SERVER.PRIVATE.log'
                log_path.write_bytes(payload)
                log_path.chmod(0o600)
                cleanup['logBytes'] = len(payload)
                cleanup['logSHA256'] = hashlib.sha256(payload).hexdigest()
            except BaseException as error:
                cleanup['error'] = {'name': type(error).__name__, 'message': str(error)[:200]}
                if failure is None:
                    failure = error
        try:
            if storage is not None:
                storage_final = bounded.finish(storage)
                save(out / 'BOUNDED_STORAGE_FINAL.SAFE.json', storage_final)
                cleanup['ownStorageHelperFinished'] = True
                cleanup['loopIdentityUnchanged'] = storage_final['identityUnchanged']
            elif storage_out is not None and storage_out.exists():
                # B.create can fail after creating its own holder but before
                # returning. Bind cleanup to this unique parent AND image.
                bounded.retire_nodes(storage_out)
                (storage_out / 'STOP').write_text('OWNED_SMALL_SETUP_FAILED\n')
                own_ids = docker(['ps', '--all', '--quiet', '--filter', 'name=helmut-meter-storage-'], text=True, timeout=15).stdout.split()
                owned = json.loads(docker(['inspect'] + own_ids, text=True, timeout=15).stdout) if own_ids else []
                closed = []
                for row in owned:
                    if row['HostConfig']['CgroupParent'] != '/' + parent + '/storage':
                        continue
                    assert row['Image'] == K.IMAGE and any(m['Source'] == str(storage_out / 'image.raw') for m in row['Mounts'])
                    if row['State']['Running']:
                        docker(['stop', '--time', '15', row['Id']], text=True, timeout=25)
                    state = json.loads(docker(['inspect', '--format', '{{json .State}}', row['Id']], text=True, timeout=10).stdout)
                    assert not state['Running'] and state['Pid'] == 0
                    closed.append(row['Id'])
                save(out / 'OWN_PARTIAL_STORAGE_SETUP_CLOSED.SAFE.json', {'containerIds': closed, 'exactUniqueParentAndImageOnly': True, 'noDetachOrDeletion': True})
            if K.validated_parent(parent).exists():
                snap = K.kernel_snapshot(parent, require_empty=True)
                save(out / 'KERNEL_FINAL.SAFE.json', snap)
                cleanup['kernelEmpty'] = snap['events']['populated'] == 0
                cleanup['wholeCPUUsec'] = snap['cpu']['usage_usec']
                cleanup['jointMemoryPeakBytes'] = snap['memoryPeakBytes']
                cleanup['fullLastProcessExitCovered'] = snap['fullLastProcessExitCovered']
                cleanup['commonStorageIncluded'] = loop_mode == '1'
        except BaseException as error:
            cleanup['storageOrKernelError'] = {'name': type(error).__name__, 'message': str(error)[:200]}
            if failure is None:
                failure = error
        cleanup['originalsUnmodified'] = all(pin(manifest[key]['path']) == manifest[key] for key in ['originalSourcePin', 'packetPin'])
        cleanup['fixtureUnmodified'] = pin(SOURCE) == manifest['sourcePin']
        if failure is None and not all(cleanup.get(key) is True for key in ['ownedContainerStopped', 'kernelEmpty', 'fullLastProcessExitCovered', 'originalsUnmodified', 'fixtureUnmodified']):
            failure = RuntimeError('small fixture final exit/original integrity proof incomplete')
        if failure is None and loop_mode == '1' and not all(cleanup.get(k) is True for k in ['ownStorageHelperFinished', 'loopIdentityUnchanged', 'commonStorageIncluded']):
            failure = RuntimeError('small fixture storage/helper closure incomplete')
        cleanup['fullOwnedLifetimeMS'] = (time.monotonic() - started_at) * 1000
        cleanup['activation'] = cleanup['full500'] = cleanup['GOClaimed'] = cleanup['production'] = False
        save(out / 'CLEANUP_AND_ORIGINALS.SAFE.json', cleanup)
    print(json.dumps({'directory': str(out), 'mode': mode, 'testPhase': test_phase, 'success': failure is None, 'cleanup': cleanup}), flush=True)
    if failure is not None:
        raise failure


if __name__ == '__main__':
    main()
