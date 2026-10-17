import pathlib,os,subprocess,json,time,uuid,hashlib,datetime,importlib.util
B=pathlib.Path('/workspace/helmut-parallel-20261015/wave28-usage-decoupling')
REPO=pathlib.Path('/workspace/helmut-cpu-epoch-20261015')
spec=importlib.util.spec_from_file_location('small_db_kernel',REPO/'scripts/helmut-resource-meter/kernel-meter.py');K=importlib.util.module_from_spec(spec);spec.loader.exec_module(K)
ENV=os.environ.copy()
for key in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:ENV.pop(key,None)
D=['docker','--host=unix:///var/run/docker.sock']
def docker(args,**kw):
 try:return subprocess.run(D+args,env=ENV,check=True,capture_output=True,**kw)
 except subprocess.CalledProcessError as e:
  if 'out'in globals():
   p=out/'LAST_FAILURE.PRIVATE.json';p.write_text(json.dumps({'exitCode':e.returncode,'stdout':e.stdout.decode(errors='replace')if isinstance(e.stdout,bytes)else e.stdout,'stderr':e.stderr.decode(errors='replace')if isinstance(e.stderr,bytes)else e.stderr}));p.chmod(0o600)
  raise
def sql(name,q,database='postgres'):return docker(['exec','-i','-u','postgres',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d',database],input=q,text=True).stdout.strip()
def save(p,x):
 with os.fdopen(os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w')as f:json.dump(x,f,indent=2);f.write('\n')
source=pathlib.Path('/workspace/helmut-parallel-20261015/wave24-db-temp-cause/BENCH_SOURCE_AUTH.PRIVATE.json')
assert source.is_file()
assert hashlib.sha256(source.read_bytes()).hexdigest()=='c7563525e2f86e4b6c2a634a50a0a267a0365c9c7c57151713ca4850c7f49863'

mode=os.environ['HELMUT_USAGE_COMPARE_MODE'];assert mode in ['baseline','atomic','security']
variant='scalar-rpc'
operations=96
trend=True
wal_trial=mode!='security'
wal_compression='off'
assert wal_compression in ['off','pglz']
assert not wal_trial or (variant=='scalar-rpc' and operations==96 and trend)
rollback_only=False
security=mode=='security'
assert not wal_trial or not security
assert not security or variant=='scalar-rpc'
assert variant in ['baseline','workmem8','scalar-rpc']
tag=uuid.uuid4().hex[:10];name='helmut-usage-'+mode+'-'+tag;parent='helmut-meter-usage-'+mode+'-'+tag
out=B/(mode+'-'+tag);out.mkdir(mode=0o700)
pg=out/'pgdata';pg.mkdir(mode=0o700)
K.initialize_parent(parent,name)
args=['create','--name',name,'--network','none','--cgroup-parent=/'+parent,
 '--security-opt','no-new-privileges','--mount','type=bind,src='+str(pg)+',dst=/var/lib/postgresql/data',
 '--mount','type=bind,src='+str(out)+',dst=/bench',
 '--mount','type=bind,src='+str(source)+',dst=/bench-input.json,readonly',
 '--mount','type=bind,src='+str(K.NODE_ROOT)+',dst='+str(K.NODE_ROOT)+',readonly',
 '--mount','type=bind,src='+str(K.PYTHON_ROOT)+',dst='+str(K.PYTHON_ROOT)+',readonly',
 '--mount','type=bind,src='+str(REPO)+',dst='+str(REPO)+',readonly',
 '--mount','type=bind,src=/workspace/helmut-parallel-20261015/wave20-resource-integration/source-capture/postgrest-pinned,dst=/postgrest,readonly',
 '--env','POSTGRES_HOST_AUTH_METHOD=trust','--env','PGDATA=/var/lib/postgresql/data',
 K.IMAGE,'postgres','-c','helmut.local_usage_experiment=on','-c','shared_preload_libraries=pg_stat_statements','-c','pg_stat_statements.track=all',
 '-c','log_temp_files=0','-c','track_io_timing=on','-c','work_mem='+('8MB'if variant=='workmem8'else'4MB')]
if wal_trial:
 # Same existing factory/namespace and image, one controlled setting differs.
 args+=['-c','wal_compression='+wal_compression,'-c','full_page_writes=on','-c','fsync=on','-c','synchronous_commit=on']
cid=docker(args,text=True).stdout.strip()
save(out/'STARTED.SAFE.json',{'scope':'SMALL_DATABASE_OPERATIONS_NO_ACTIVATION_NO_500_RUN','name':name,'cid':cid,'parent':parent,'variant':variant,'usageMode':mode,'operations':operations,'securityOnly':security,'walTrial':wal_trial,'walCompression':wal_compression if wal_trial else 'UNCHANGED','manualCheckpointAfter':48 if wal_trial else None,'originalInputSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'candidateSQLSHA256':hashlib.sha256((REPO/'supabase/proposals/auth_store_cas_scalar_jsonb.sql').read_bytes()).hexdigest()if variant=='scalar-rpc'else None,'harnessSHA256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'activation':False,'GOClaimed':False,'production':False})
native={}
def native_snapshot():
 return json.loads(sql(name,"""BEGIN READ ONLY;select jsonb_build_object(
 'atUTC',clock_timestamp(),'walLSN',pg_current_wal_lsn()::text,
 'wal',(select to_jsonb(w)from pg_stat_wal w),'checkpointer',(select to_jsonb(c)from pg_stat_checkpointer c),
 'settings',(select jsonb_object_agg(name,setting)from pg_settings where name in('server_version','wal_compression','full_page_writes','fsync','synchronous_commit','wal_level','shared_buffers','wal_buffers','checkpoint_timeout','max_wal_size','default_toast_compression')),
 'fullDataSHA256',(select encode(sha256(convert_to(data::text,'UTF8')),'hex')from public.helmut_store where id='main-auth'),
 'contentWithoutRevisionSHA256',(select encode(sha256(convert_to((data-'_authStoreRevision'-'llmUsage'-'_llmUsageRef'-'localUsageMeasure')::text,'UTF8')),'hex')from public.helmut_store where id='main-auth'),
 'logicalDataSHA256',(select encode(sha256(convert_to((case when data ? '_llmUsageRef' then public.helmut_auth_usage_read_v1(jsonb_build_object('id','main-auth'))->'data'else data end)::text,'UTF8')),'hex')from public.helmut_store where id='main-auth'),
 'rowCount',(select count(*)from public.helmut_store),'profileTableAbsent',to_regclass('public.mandate_profiles')is null,
 'functionHashes',(select jsonb_object_agg(p.proname,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'))from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname like 'helmut_%'),
 'triggers',(select jsonb_object_agg(tgname,tgenabled::text)from pg_trigger where tgrelid='public.helmut_store'::regclass and not tgisinternal),
 'databaseSizeBytes',pg_database_size(current_database()),'walFiles',(select jsonb_agg(jsonb_build_object('name',name,'bytes',size))from pg_ls_waldir()),
 'relations',(select jsonb_agg(jsonb_build_object('relation',c.relname,'totalBytes',pg_total_relation_size(c.oid),'heapBytes',pg_relation_size(c.oid),'indexBytes',pg_indexes_size(c.oid),'toastTotalBytes',case when c.reltoastrelid=0 then 0 else pg_total_relation_size(c.reltoastrelid)end,'insert',s.n_tup_ins,'update',s.n_tup_upd,'hotUpdate',s.n_tup_hot_upd,'delete',s.n_tup_del,'estimatedDead',s.n_dead_tup))from pg_class c left join pg_stat_all_tables s on c.oid=s.relid where c.relnamespace='public'::regnamespace and c.relkind='r'));
 ROLLBACK;"""))
try:
 docker(['start',cid],text=True)
 for _ in range(80):
  # initdb's temporary server also answers pg_isready. Wait for the final
  # entrypoint transition before using this fresh, disposable benchmark DB.
  log=docker(['logs',cid]).stdout
  if b'PostgreSQL init process complete; ready for start up.' not in log:
   time.sleep(.1);continue
  r=subprocess.run(D+['exec','-u','postgres',name,'pg_isready','-q'],env=ENV,capture_output=True)
  if r.returncode==0:break
  time.sleep(.1)
 else:raise RuntimeError('new small server not ready')
 sql(name,"create extension pg_stat_statements;create role bench_writer nologin;create role bench_denied nologin;create table public.helmut_store(id text primary key,data jsonb not null,updated_at timestamptz default now());alter table public.helmut_store enable row level security;grant usage on schema public to bench_writer;grant select,insert,update on public.helmut_store to bench_writer;create policy bench_auth on public.helmut_store to bench_writer using(id='main-auth')with check(id='main-auth');")
 if variant=='scalar-rpc':
  proposal=REPO/'supabase/proposals/auth_store_cas_scalar_jsonb.sql'
  sql(name,'create role service_role nologin;grant service_role to bench_writer;'+proposal.read_text())
 if security or wal_trial:
  sql(name,'create role anon nologin;create role authenticated nologin;'+(REPO/'supabase/proposals/synthetik500_stored_command_binding.sql').read_text())
 source_data=json.loads(source.read_text());body=json.dumps({'id':'main-auth','data':source_data['data'],'updated_at':source_data['updated_at']},separators=(',',':'))
 load="copy public.helmut_store(id,data,updated_at)from stdin with(format csv);\n"
 import csv,io
 stream=io.StringIO();csv.writer(stream,lineterminator='\n').writerow(['main-auth',json.dumps(source_data['data']),source_data['updated_at']]);load+=stream.getvalue()+'\\.\n'
 sql(name,load)
 schema=(REPO/'supabase/schema.sql').read_text();a=schema.index('create table if not exists public.llm_usage (');b=schema.index(');',a)+2
 sql(name,schema[a:b])
 sql(name,(REPO/'supabase/proposals/auth_usage_atomic_local.sql').read_text())
 sql(name,"create policy local_usage_bench on public.llm_usage to bench_writer using(usage_store_id='main-auth')with check(usage_store_id='main-auth');")
 sql(name,"select pg_stat_statements_reset();")
 config='db-uri = "postgresql://postgres@127.0.0.1:5432/postgres"\ndb-anon-role = "bench_writer"\ndb-schemas = "public"\nserver-host = "127.0.0.1"\nserver-port = 38419\ndb-plan-enabled = true\ndb-pool = 1\nlog-level = "error"\n'
 if security:config=config.replace('db-pool = 1','db-pool = 2')
 cp=out/'postgrest.PRIVATE.conf';cp.write_text(config);cp.chmod(0o644)
 docker(['exec','-d',name,'/postgrest','/bench/postgrest.PRIVATE.conf'],text=True)
 node=r'''const fs=require('fs'),{performance}=require('perf_hooks'),{randomUUID}=require('crypto');const variant=process.argv[2],operations=Number(process.argv[5]),walTrial=process.argv[6]==='wal-trial';
 if(walTrial&&process.version!=='v24.19.0')throw Error('Node patch drift');
 const input=JSON.parse(fs.readFileSync('/bench-input.json'));let data=input.data;
 async function request(method,path,body,extra={}){const start=performance.now(),cpu=process.cpuUsage();const encoded=body===undefined?undefined:JSON.stringify(body),encodedMS=performance.now()-start;const r=await fetch('http://127.0.0.1:38419'+path,{method,headers:{'Content-Type':'application/json',Prefer:'return=representation',...extra},body:encoded});const text=await r.text();return{status:r.status,wallMS:performance.now()-start,encodeMS:encodedMS,clientCPUUsec:process.cpuUsage(cpu),body:JSON.parse(text)};}
 (async()=>{let ready=false;for(let i=0;i<50;i++){try{let r=await request('GET','/helmut_store?select=id');if(r.status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('REST not ready');const result=[];
 for(let i=0;i<operations;i++){const old=data._authStoreRevision;const next={...data,_authStoreRevision:randomUUID()};const condition=old==null?'data-%3E%3E_authStoreRevision=is.null':'data-%3E%3E_authStoreRevision=eq.'+old;const r=variant==='scalar-rpc'?await request('POST','/rpc/helmut_auth_store_cas_v1',{id:'main-auth',expectedRevision:old??null,data:next}):await request('PATCH','/helmut_store?id=eq.main-auth&'+condition+'&select=id',{data:next});if(r.status!==200||r.body.length!==1||r.body[0].id!=='main-auth')throw Error('CAS request failed');result.push({index:i,status:r.status,wallMS:r.wallMS,encodeMS:r.encodeMS,clientCPUUsec:r.clientCPUUsec,sourceDataJSONBytes:Buffer.byteLength(JSON.stringify(next))});fs.writeFileSync('/bench/PROGRESS.SAFE.json',JSON.stringify({completed:i+1,unixMS:Date.now()}));data=next;
 if(walTrial&&i===47){fs.writeFileSync('/bench/CHECKPOINT_REQUEST.SAFE.json',JSON.stringify({completed:48}));const until=Date.now()+15000;while(!fs.existsSync('/bench/CHECKPOINT_DONE.SAFE.json')){if(Date.now()>until)throw Error('checkpoint barrier timeout');await new Promise(r=>setTimeout(r,20));}}
 }
 const next={...data,_authStoreRevision:randomUUID()};const extra={Accept:'application/vnd.pgrst.plan+json;for="application/json";options=analyze|buffers|wal'};
 const plan=variant==='scalar-rpc'?await request('POST','/rpc/helmut_auth_store_cas_v1',{id:'main-auth',expectedRevision:data._authStoreRevision??null,data:next},extra):await request('PATCH','/helmut_store?id=eq.main-auth&select=id',{data:next},extra);
 fs.writeFileSync('/bench/ACTUAL_PLAN.PRIVATE.json',JSON.stringify(plan.body,null,2),{mode:0o600});fs.writeFileSync('/bench/HTTP_RESULT.SAFE.json',JSON.stringify({scope:'SMALL_CAS_OPERATIONS_PLUS_ONE_PLAN_NO_ACTIVATION',requests:result,planHTTPStatus:plan.status,nodeMaxRSSBytes:process.resourceUsage().maxRSS*1024,paidProviderCalls:0,activation:false,production:false},null,2),{mode:0o600});for(const n of ['ACTUAL_PLAN.PRIVATE.json','HTTP_RESULT.SAFE.json'])fs.chownSync('/bench/'+n,Number(process.argv[3]),Number(process.argv[4]));})().catch(e=>{console.error(e.message);process.exitCode=1});'''
 np=out/'benchmark.js';np.write_text(node);np.chmod(0o644)
 prep=docker(['exec',name,str(K.NODE_ROOT/'bin/node'),str(REPO/'scripts/helmut-resource-meter/auth-usage-atomic-check.js'),'prepare',mode,str(os.getuid()),str(os.getgid())],text=True,timeout=80)
 start=time.monotonic()
 if wal_trial:
  native['beforeWorkload']=native_snapshot();settings=native['beforeWorkload']['settings']
  assert settings['wal_compression']==wal_compression
  assert all(settings[k]=='on'for k in ['full_page_writes','fsync','synchronous_commit'])
  expected={'server_version':'17.6 (Debian 17.6-1.pgdg13+1)','wal_level':'replica','shared_buffers':'16384','wal_buffers':'512','checkpoint_timeout':'300','max_wal_size':'1024','default_toast_compression':'pglz'}
  # The immutable image is17.6; the distro suffix is retained as evidence.
  assert settings['server_version'].split()[0]=='17.6'
  for key,value in expected.items():
   if key!='server_version':assert settings[key]==value,'unexpected actual setting:'+key
  assert native['beforeWorkload']['profileTableAbsent']and native['beforeWorkload']['rowCount']==1
 if security:
  extra=['--rollback-only']if rollback_only else []
  result=docker(['exec',name,str(K.NODE_ROOT/'bin/node'),str(REPO/'scripts/helmut-resource-meter/auth-usage-atomic-check.js'),'security',mode,str(os.getuid()),str(os.getgid())],text=True,timeout=80)
  print(result.stdout.strip(),flush=True)
 else:
  before=K.kernel_snapshot(parent);samples=[]
  child=subprocess.Popen(D+['exec',name,str(K.NODE_ROOT/'bin/node'),str(REPO/'scripts/helmut-resource-meter/auth-usage-atomic-check.js'),'measure',mode,str(os.getuid()),str(os.getgid())],env=ENV,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  checkpoint_done=False
  while child.poll()is None:
   if time.monotonic()-start>80:child.terminate();raise RuntimeError('bounded small operations timeout; no repeat')
   if trend:
    sample=K.kernel_snapshot(parent);sample['unixMS']=time.time()*1000
    try:sample['progress']=json.loads((out/'PROGRESS.SAFE.json').read_text())
    except(FileNotFoundError,json.JSONDecodeError):sample['progress']={'completed':0}
    stat=K.key_values(K.validated_parent(parent)/'memory.stat');sample['memoryStat']={k:stat[k]for k in ['anon','file','inactive_file','active_file','kernel','shmem','file_dirty','file_writeback','workingset_refault_file']if k in stat};samples.append(sample)
   if wal_trial and not checkpoint_done and(out/'CHECKPOINT_REQUEST.SAFE.json').exists():
    native['beforeCheckpoint']=native_snapshot();tick=time.monotonic();sql(name,'CHECKPOINT;');native['checkpointCallWallMS']=(time.monotonic()-tick)*1000;native['afterCheckpoint']=native_snapshot()
    save(out/'CHECKPOINT_DONE.SAFE.json',{'performedOnce':True,'afterRequests':48,'noSecuritySettingChanged':True});checkpoint_done=True
   time.sleep(.05)
  stdout,stderr=child.communicate()
  if child.returncode:raise RuntimeError('bounded small operations client failed: '+stderr[:200])
  after=K.kernel_snapshot(parent)
  save(out/'WRITE_PHASE_KERNEL.SAFE.json',{'before':before,'after':after,'samples':samples,'unchangedExistingKernelMeter':True,'observerHostOutsideBothComparedFixtures':True})
 time.sleep(1.2)
 stats=sql(name,"select json_build_object('workMem',current_setting('work_mem'),'temporaryBytes',(select temp_bytes from pg_stat_database where datname='postgres'),'temporaryFiles',(select temp_files from pg_stat_database where datname='postgres'),'statements',(select json_agg(json_build_object('query',query,'calls',calls,'rows',rows,'execMS',total_exec_time,'tempWriteBlocks',temp_blks_written,'tempReadBlocks',temp_blks_read,'sharedHitBlocks',shared_blks_hit))from pg_stat_statements where query not like '%pg_stat_statements%'));" )
 save(out/'SQL_STATS.PRIVATE.json',json.loads(stats));save(out/'BENCHMARK_MEASURED.SAFE.json',{'variant':variant,'smallMeasuredWallMS':(time.monotonic()-start)*1000,'scope':'SMALL_OPERATIONS_NOT_UNIT60_AUTH30_OR_FULL500','noActivation':True,'noGOClaim':True,'noProduction':True})
 if wal_trial:
  assert checkpoint_done;native['afterWrites']=native_snapshot()
  assert json.loads((out/'HTTP_RESULT.SAFE.json').read_text())['originalFieldsAndHistoryUnchanged']
  if mode=='atomic':
   # Targeted check of the ONLY query delta. Read-only proof and an actual
   # stored-record corruption in a transaction which MUST abort completely.
   q="begin;alter table public.llm_usage disable trigger helmut_usage_record_immutable_local;update public.llm_usage set usage_record=jsonb_set(usage_record,'{model}','\"local-tamper-proof\"')where usage_store_id='main-auth'and usage_ordinal=1;select public.helmut_auth_usage_read_v1('{\"id\":\"main-auth\"}');commit;"
   bad=subprocess.run(D+['exec','-i','-u','postgres',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','postgres'],env=ENV,input=q,text=True,capture_output=True)
   assert bad.returncode!=0 and 'atomic-usage-native-history-corrupt'in bad.stderr
   good=sql(name,"begin read only;select encode(sha256(convert_to((public.helmut_auth_usage_read_v1('{\"id\":\"main-auth\"}')->'data')::text,'UTF8')),'hex');rollback;")
   assert good==native['afterWrites']['logicalDataSHA256']
   assert sql(name,"select tgenabled from pg_trigger where tgrelid='public.llm_usage'::regclass and tgname='helmut_usage_record_immutable_local';")=='A'
   save(out/'TARGETED_READ_NEGATIVE.SAFE.json',{'actualStoredDataTamperRejected':True,'fullTransactionRolledBack':True,'readOnlyNativeLogicalHashSame':True,'rawImmutableTriggerStillAlways':True,'scope':'ONLY_READ_QUERY_DELTA_NOT_FULL500'})
  native['kernelBeforeDeliberateRecovery']=K.kernel_snapshot(parent)
  # Deliberate negative durability case on this NEW small fixture only.
  # The write workload is NEVER replayed. No old resource case is restarted.
  docker(['kill','--signal','KILL',cid],text=True);docker(['wait',cid],text=True,timeout=10)
  docker(['start',cid],text=True)
  for _ in range(100):
   ready=subprocess.run(D+['exec','-u','postgres',name,'pg_isready','-q'],env=ENV,capture_output=True)
   if ready.returncode==0:break
   time.sleep(.1)
  else:raise RuntimeError('new small fixture deliberate recovery failed; no replay')
  native['afterRecovery']=native_snapshot()
  assert native['afterRecovery']['fullDataSHA256']==native['afterWrites']['fullDataSHA256']
  assert native['afterRecovery']['logicalDataSHA256']==native['afterWrites']['logicalDataSHA256']
  assert native['afterRecovery']['contentWithoutRevisionSHA256']==native['afterWrites']['contentWithoutRevisionSHA256']
  assert native['afterRecovery']['profileTableAbsent']and native['afterRecovery']['rowCount']==1
  assert native['afterRecovery']['functionHashes']==native['beforeWorkload']['functionHashes']
  assert native['afterRecovery']['triggers']==native['beforeWorkload']['triggers']
  assert all(native['afterRecovery']['settings'][k]=='on'for k in ['full_page_writes','fsync','synchronous_commit'])
  assert native['afterRecovery']['settings']==native['beforeWorkload']['settings']
  recovery_logs=docker(['logs',cid]);recovery_text=recovery_logs.stdout+recovery_logs.stderr
  assert b'redo starts at' in recovery_text and b'redo done at' in recovery_text
  native['nativeRedoStartAndDoneObserved']=True
  native['deliberateOwnedFixtureCrashRecoveryVerified']=True
  save(out/'NATIVE_WAL_INTEGRITY.SAFE.json',native)
finally:
 docker(['stop','--time','15',cid],text=True,timeout=25)
 logs=docker(['logs',cid]).stdout+docker(['logs',cid]).stderr;lp=out/'DATABASE_SERVER.PRIVATE.log';lp.write_bytes(logs);lp.chmod(0o600)
 snap=K.kernel_snapshot(parent,require_empty=True);save(out/'KERNEL_FINAL.SAFE.json',snap)
docker(['rm',cid],text=True)
print(json.dumps({'directory':str(out),'usageMode':mode,'variant':variant,'peakBytes':snap['memoryPeakBytes'],'kernelEmpty':snap['events']['populated']==0,'activatedProfiles':0,'GOClaimed':False}))
