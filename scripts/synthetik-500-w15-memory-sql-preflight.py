#!/usr/bin/env python3
"""Describe actual generated statements on existing PG17; never execute workload SQL."""
import ast,hashlib,importlib.util,json,os,pathlib,re,subprocess,sys
sys.dont_write_bytecode=True
ROOT=pathlib.Path(__file__).resolve().parents[1]
ASSETS=pathlib.Path('/workspace/shared/helmut-w15-memory-forward-20261028')
WORK=ASSETS/'sql-preflight-atomic-d'
EXISTING_CONTAINER='w15-atomic-integration-20261028d'
EXISTING_DB='helmut_w15_full500_20261028b'
ENV={'PATH':os.environ['PATH'],'LANG':'C.UTF-8'}
DOCKER=['docker','--host=unix:///var/run/docker.sock']
def run_psql(text):
    return subprocess.run(DOCKER+['exec','-i',EXISTING_CONTAINER,'psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',EXISTING_DB,'-f','-'],
      input=text.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV,timeout=180)
def main():
    assert not WORK.exists(),'preflight-output-already-exists'
    os.umask(0o077);WORK.mkdir(mode=0o700)
    spec=importlib.util.spec_from_file_location('forward_parse_only',ROOT/'scripts/synthetik-500-w15-memory-forward.py')
    n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
    assert not n.WORK.exists() and n.DB=='helmut_w15_memory_atomic_20261028c'
    js="const m=require('./scripts/synthetik-500-w15-memory-forward');process.stdout.write(JSON.stringify({sql:m.databaseStatsSQL(),db:m.database,base:m.base}));"
    r=subprocess.run(['node','--require','./scripts/lokaler-netzschutz.js','-e',js],cwd=ROOT,env=os.environ.copy(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20)
    assert r.returncode==0,'metadata-factory'
    metadata=json.loads(r.stdout);assert metadata['db']==n.DB and metadata['base']==n.BASE
    bound=json.loads((ASSETS/'END500_MEMORY_BOUND.SAFE.json').read_text())
    paths={}
    for k,pin in bound['protectedOutputPins'].items():
        p=pathlib.Path(pin['path']);b=p.read_bytes()
        assert len(b)==pin['bytes'] and hashlib.sha256(b).hexdigest()==pin['sha256']
        paths[k]=p
    # Execute only the exact existing file-generation AST, not main()/SQL/DB calls.
    tree=ast.parse((ROOT/'scripts/synthetik-500-w15-memory-forward.py').read_text())
    fn=next(x for x in tree.body if isinstance(x,ast.FunctionDef)and x.name=='main')
    body=next(x for x in fn.body if isinstance(x,ast.Try)).body
    start=next(i for i,x in enumerate(body)if isinstance(x,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='seed'for t in x.targets))
    stop=next(i for i in range(start,len(body))if isinstance(body[i],ast.With))
    fragment=ast.Module(body=body[start:stop+1],type_ignores=[])
    for call in [x for x in ast.walk(fragment)if isinstance(x,ast.Call)and isinstance(x.func,ast.Attribute)and isinstance(x.func.value,ast.Name)and x.func.value.id=='M']:
        assert call.func.attr=='literal','unsafe-generation-fragment'
    context={'WORK':WORK,'paths':paths,'M':n.M,'json':json,'os':os}
    exec(compile(ast.fix_missing_locations(fragment),str(ROOT/'scripts/synthetik-500-w15-memory-forward.py'),'exec'),context)
    queries=[('metadata',metadata['sql'])]
    # Capture the exact imported read/admin call expressions and real ID lists.
    for call in [x for x in ast.walk(fn)if isinstance(x,ast.Call)and isinstance(x.func,ast.Attribute)and isinstance(x.func.value,ast.Name)and x.func.value.id=='M'and x.func.attr in ['read','sql']]:
        # This exact proposal was already installed and bootstrapped successfully
        # on the fresh native integration copy. Do not ask Parse to accept a
        # multi-statement DDL transaction or apply it again to existing data.
        if isinstance(call.args[0],ast.Call)and isinstance(call.args[0].func,ast.Attribute)and call.args[0].func.attr=='read_text':
            current=(ROOT/'supabase/proposals/auth_usage_atomic_local.sql').read_bytes()
            tested=pathlib.Path('/workspace/shared/helmut-w15-atomic-integration-20261028d/stage/app/supabase/proposals/auth_usage_atomic_local.sql').read_bytes()
            assert current==tested,'local-proposal-not-identical-to-successful-native-install'
            continue
        key=next((k.value for k in call.keywords if k.arg=='database'),None)
        assert key is not None,'implicit-database-call'
        scopes=[{'DB':n.DB,'M':n.M}]
        if any(isinstance(x,ast.Name)and x.id=='ids'for x in ast.walk(call.args[0])):
            scopes=[{'DB':n.DB,'M':n.M,'table':'public.helmut_store'if k in ['evidenceRows','privateDraftStoreRows']else'public.briefings','ids':v}for k,v in context['row_ids'].items()]
        for scope in scopes:
            q=eval(compile(ast.Expression(call.args[0]),'<actual-query-expression>','eval'),scope)
            queries.append(('database-call',q))
    queries.append(('restore-deactivation','update public.mandate_profiles set aktiv=false where aktiv;'))
    with context['seed'].open()as f:
        for line in f:
            s=line.strip()
            if s not in ['begin;','commit;']:queries.append(('native-seed',s))
    # pg_restore and roles statements are unchanged pinned successful restore
    # inputs; PostgREST internal SQL is covered by prior genuine Auth/CAS proof.
    unique={hashlib.sha256(q.encode()).hexdigest():(label,q)for label,q in queries}
    assert sum(label=='native-seed'for label,q in unique.values())==3501
    previous_path=ASSETS/'sql-preflight-atomic-a/SQL_PREFLIGHT.SAFE.json'
    previous_bytes=previous_path.read_bytes()
    assert hashlib.sha256(previous_bytes).hexdigest()=='98d329bfa2bf7650ff34be02caa860886e38441b9134c3e69f0663d86992c720'
    previous=json.loads(previous_bytes)
    assert previous['status']=='PASS_ALL_GENERATED_DIAGNOSTIC_SQL_PARSE_DESCRIBE_NO_EXECUTION'
    cached={x['sha256']for x in previous['statementPins']}
    changed={h:v for h,v in unique.items()if h not in cached}
    assert 0<=len(changed)<=8 and all(label!='native-seed'for label,q in changed.values()),'unexpected-seed-sql-drift'
    script=WORK/'parse-only.PRIVATE.psql'
    with script.open('x')as f:
        os.chmod(script,0o600);f.write("begin read only;set local statement_timeout='15s';\n")
        for h,(label,q)in changed.items():
            # Deliberately NO semicolon before \gdesc. This sends Parse/Describe,
            # never Bind/Execute, including CREATE DATABASE and data-modifying CTEs.
            assert q.endswith(';')
            f.write('\\echo PARSE_'+h+'\n'+q[:-1]+'\n\\gdesc\n\\r\n')
        f.write('rollback;\n')
    # Read-only metadata checks are explicit; workload statements above are not run.
    metadata_sql="""begin read only;select jsonb_build_object(
      'database',current_database(),'readonly',current_setting('transaction_read_only'),
      'active',(select count(*)from public.mandate_profiles where aktiv),
      'profiles',(select count(*)from public.mandate_profiles),'identities',(select count(*)from public.profiles),
      'authMD5',(select md5(data::text)from public.helmut_store where id='main-auth'),
      'storeRows',(select count(*)from public.helmut_store),'briefingRows',(select count(*)from public.briefings),
      'usage',jsonb_array_length(public.helmut_auth_usage_read_v1(jsonb_build_object('id','main-auth'))->'data'->'llmUsage'),
      'newTargetAbsent',not exists(select from pg_database where datname='helmut_w15_memory_atomic_20261028c'),
      'createdb',(select rolcreatedb or rolsuper from pg_roles where rolname=current_user),
      'serviceCanSelect',has_table_privilege('service_role','public.helmut_store','SELECT'),
      'serviceCanUpdate',has_column_privilege('service_role','public.helmut_store','data','UPDATE'),
      'serviceCanInsert',has_table_privilege('service_role','public.helmut_store','INSERT'),
      'serviceSchema',has_schema_privilege('service_role','public','USAGE'),
      'authenticatorCanSetService',pg_has_role('authenticator','service_role','SET'),
      'postgresProfilesUpdate',has_column_privilege(current_user,'public.mandate_profiles','aktiv','UPDATE'),
      'postgresBriefingsInsert',has_table_privilege(current_user,'public.briefings','INSERT'),
      'postgresStoreUpdate',has_table_privilege(current_user,'public.helmut_store','UPDATE'));
      rollback;"""
    before=run_psql(metadata_sql);assert before.returncode==0,'metadata-permission-read'
    observed=json.loads(before.stdout);assert observed['database']==EXISTING_DB and observed['readonly']=='on'and observed['active']==0
    for k in ['newTargetAbsent','createdb','serviceCanSelect','serviceCanUpdate','serviceCanInsert','serviceSchema','authenticatorCanSetService','postgresProfilesUpdate','postgresBriefingsInsert','postgresStoreUpdate']:assert observed[k]is True,k
    parsed=run_psql(script.read_text())
    (WORK/'parser.PRIVATE.stdout').write_bytes(parsed.stdout);(WORK/'parser.PRIVATE.stderr').write_bytes(parsed.stderr)
    assert parsed.returncode==0,'native-parser-rejected-generated-query'
    markers=[line[6:]for line in parsed.stdout.decode().splitlines()if line.startswith('PARSE_')]
    assert markers==list(changed),'incomplete-parser-coverage'
    after=run_psql(metadata_sql);assert after.returncode==0
    assert json.loads(after.stdout)==observed,'parser-modified-source-data-or-target-created'
    report={'status':'PASS_ALL_GENERATED_DIAGNOSTIC_SQL_PARSE_DESCRIBE_NO_EXECUTION','statements':len(unique),
      'seedStatements':3501,'newlyParsedStatements':len(changed),'exactPriorHashReusedStatements':len(unique)-len(changed),
      'reusedParserReportSHA256':hashlib.sha256(previous_bytes).hexdigest(),'actualGeneratedQuerySites':len(queries),'workloadStatementsExecuted':0,'newDatabaseCreated':False,
      'method':'PostgreSQL17 Parse/Describe of every changed generated diagnostic SQL statement; every byte-identical generated SQL hash reuses the pinned successful atomic-A parser proof; only changed statements would be newly parsed. No workload Execute. Local SQL proposal reused byte-identical successful atomic bootstrap proof.',
      'existingParserDatabase':EXISTING_DB,'plannedDatabase':n.DB,'sourceSnapshotUnchanged':True,
      'metadataAndPermissionChecks':{k:v for k,v in observed.items()if k!='authMD5'},
      'coverageLimits':['Original pg_restore and roles SQL reuse unchanged successful pinned restore proof.','PostgREST internally generated SQL reuses successful native Auth/CAS proof; not claimed extracted from diagnostic source.','Parse-only does not execute constraints/triggers or demonstrate runtime memory.'],
      'statementPins':[{'kind':v[0],'sha256':h}for h,v in unique.items()],
      'sourcePins':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest()for p in ['scripts/synthetik-500-w15-memory-forward.js','scripts/synthetik-500-w15-memory-forward.py','scripts/synthetik-500-w15-memory-sql-preflight.py','scripts/fixtures/w15-durable-observations.js','scripts/fixtures/w15-owned-process-stop.js','scripts/fixtures/w15-local-memory-budget.json','scripts/synthetik-500-w15-full500-controller.py','scripts/synthetik-500-w15-full500-runtime.js']}}
    out=WORK/'SQL_PREFLIGHT.SAFE.json';out.write_text(json.dumps(report,indent=2)+'\n');out.chmod(0o600)
    print(json.dumps({k:v for k,v in report.items()if k not in ['statementPins','metadataAndPermissionChecks','sourcePins','coverageLimits']}))
if __name__=='__main__':main()
