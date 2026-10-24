#!/usr/bin/env python3
"""Explicit read-only capture of the existing frozen LOCAL fixture.

No original writes, tests, activation or claim. Export is preexisting fixture
input capture, outside the subsequently measured installation/workflow lifetime.
The NEW owned database restores this exact dump inside measured preparation.
"""
import hashlib,json,os,subprocess,time
from pathlib import Path

BASE=Path('/workspace/helmut-parallel-20261015')
SOURCE='helmut_fresh_input_fixture_d2e98984'
# The live historical container did not migrate. Bind the actual restored
# frozen-input server explicitly; its receipt links are provenance, never GO.
_binding_path=Path(__file__).resolve().with_name('local-source-runtime-binding.json')
if _binding_path.is_symlink() or not _binding_path.is_file():
    raise RuntimeError('regular restored source runtime binding required')
_binding_bytes=_binding_path.read_bytes()
if hashlib.sha256(_binding_bytes).hexdigest()!='f0740d9dd94ebff52ee273e3f20f7d24bba552f11f0dd8004f52957a672cffa9':
    raise RuntimeError('restored source runtime binding drift')
RUNTIME_BINDING_PIN={'path':str(_binding_path),'bytes':len(_binding_bytes),'sha256':hashlib.sha256(_binding_bytes).hexdigest()}
RUNTIME_BINDING=json.loads(_binding_bytes)
if (RUNTIME_BINDING.get('schema')!='helmut-restored-local-source-runtime-binding/1'
  or RUNTIME_BINDING.get('scope')!='READ_ONLY_RESTORED_FROZEN_INPUT_PROVENANCE_ONLY'
  or RUNTIME_BINDING.get('sourceDatabase')!=SOURCE
  or RUNTIME_BINDING.get('imageId')!='sha256:567d5d704a3e5a4864393b623a0d50eb1b5a4ad134cdac7cf19555cb2d8ffe9e'):
    raise RuntimeError('exact restored frozen source required')
CONTAINER=RUNTIME_BINDING['containerId']
DOCKER=['env','-u','DOCKER_HOST','-u','DOCKER_CONTEXT','-u','DOCKER_TLS','-u','DOCKER_TLS_VERIFY',
        '-u','DOCKER_CERT_PATH','docker','--host=unix:///var/run/docker.sock']
NATIVE=BASE/'wave12/native-pdf-inputs/ACTUAL_NATIVE_SOURCE23_KO60_WITH_PDF.PRIVATE.json'
BIN='/tmp/helmut-unit-fixture-postgrest-03693bea'
BIN_SHA='870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617'
def pin(p):
    b=Path(p).read_bytes();return {'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def verify_runtime_binding():
    if pin(_binding_path)!=RUNTIME_BINDING_PIN:raise RuntimeError('restored source binding changed')
    r=subprocess.run(DOCKER+['inspect','--format','{{.Id}}|{{.Name}}|{{.Image}}|{{.HostConfig.NetworkMode}}',CONTAINER],
       capture_output=True,text=True,check=True,timeout=15)
    if r.stdout.strip().split('|')!=[CONTAINER,'/'+RUNTIME_BINDING['containerName'],RUNTIME_BINDING['imageId'],'none']:
        raise RuntimeError('actual restored source container differs')
    return RUNTIME_BINDING_PIN
def sql(text):
    verify_runtime_binding()
    r=subprocess.run(DOCKER+['exec','-i',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',SOURCE,'-f','-'],
       input="begin read only;set local statement_timeout='15s';\n"+text+'\nrollback;',text=True,capture_output=True,check=True,timeout=30)
    return json.loads(r.stdout)
def lit(x):return "'"+str(x).replace("'","''")+"'"
def identity():
    return sql("select jsonb_build_object('profiles',(select count(*)from mandate_profiles),'active',(select count(*)from mandate_profiles where aktiv),'profileHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)order by user_id collate \"C\")::text,'UTF8')),'hex')from mandate_profiles p),'identityHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)order by id collate \"C\")::text,'UTF8')),'hex')from profiles p),'uSHA',(select encode(sha256(convert_to(data::text,'UTF8')),'hex')from helmut_store where id='synthetik500-command-synthetik500-one-u-preparation-1791311693883')); ")
def capture(out):
    out=Path(out).resolve()
    if out!=BASE/'wave20-resource-integration/source-capture':raise RuntimeError('exact new local capture destination required')
    out.mkdir(mode=0o700,exist_ok=False);began=time.monotonic();before=identity()
    expected=json.loads((BASE/'wave15/native-end-preparation/LOCAL_ACTIVATION_RESULT.SAFE.json').read_text())['sourceBefore']
    if any(before[k]!=expected[k] for k in before):raise RuntimeError('frozen source identity drift')
    native=json.loads(NATIVE.read_text());native_checks={}
    # Source23 is the existing application projection of18 physical columns
    # plus raw metadata. Compare the COMPLETE original18-column witness,
    # rather than pretending those derived23 names are SQL columns.
    for key,table in [('kos','knowledge_objects'),('rawDocumentsRows','raw_documents')]:
        rows=native[key];fields=list(rows[0])
        # PG functions accept at most100 arguments. Keep each object below
        # that bound while projecting every one of the actual60 KO fields.
        projection='||'.join('jsonb_build_object('+','.join(lit(k)+',d."'+k+'"' for k in fields[i:i+40])+')' for i in range(0,len(fields),40))
        actual=sql('select coalesce(jsonb_agg(('+projection+')order by d.id),\'[]\'::jsonb)from '+table+' d where d.id in('+','.join(lit(r['id']) for r in rows)+');')
        if sorted(actual,key=lambda r:r['id'])!=sorted(rows,key=lambda r:r['id']):raise RuntimeError('actual native source/KO drift: '+key)
        native_checks[key]=len(rows)
    roles=sql("select jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,'createDB',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypassRLS',rolbypassrls)order by rolname)from pg_roles where rolname in('authenticator','anon','authenticated','service_role');")
    if len(roles)!=4:raise RuntimeError('original local roles missing')
    role_text=[]
    for r in roles:
        flags=['SUPERUSER' if r['super'] else 'NOSUPERUSER','INHERIT' if r['inherit'] else 'NOINHERIT','CREATEROLE' if r['createRole'] else 'NOCREATEROLE','CREATEDB' if r['createDB'] else 'NOCREATEDB','LOGIN' if r['login'] else 'NOLOGIN','REPLICATION' if r['replication'] else 'NOREPLICATION','BYPASSRLS' if r['bypassRLS'] else 'NOBYPASSRLS']
        role_text.append('CREATE ROLE "'+r['name']+'" '+ ' '.join(flags)+';')
    members=sql("select coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'member',m.rolname,'admin',a.admin_option,'inherit',a.inherit_option,'set',a.set_option)order by r.rolname,m.rolname),'[]'::jsonb)from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member where r.rolname in('authenticator','anon','authenticated','service_role')and m.rolname in('authenticator','anon','authenticated','service_role');")
    for r in members:
        role_text.append('GRANT "'+r['role']+'" TO "'+r['member']+'" WITH ADMIN '+str(r['admin']).upper()+', INHERIT '+str(r['inherit']).upper()+', SET '+str(r['set']).upper()+';')
    roles_path=out/'EXACT_LOCAL_ROLES.PRIVATE.sql';roles_path.write_text('\n'.join(role_text)+'\n');roles_path.chmod(0o600)
    dump=out/'FROZEN_SOURCE.PRIVATE.dump'
    with dump.open('xb') as f:
        subprocess.run(DOCKER+['exec',CONTAINER,'pg_dump','-U','postgres','-Fc','-d',SOURCE],stdout=f,stderr=subprocess.PIPE,check=True,timeout=120)
    dump.chmod(0o600)
    binary=out/'postgrest-pinned';subprocess.run(DOCKER+['cp',CONTAINER+':'+BIN,str(binary)],capture_output=True,check=True,timeout=30)
    binary.chmod(0o700)
    if pin(binary)['sha256']!=BIN_SHA:raise RuntimeError('existing PostgREST binary drift')
    after=identity()
    if before!=after:raise RuntimeError('original source changed during read-only capture')
    result={'schema':'helmut-original-local-fixture-readonly-capture/1','scope':'PREEXISTING_INPUT_CAPTURE_NOT_MEASURED_500_WORKFLOW',
      'source':SOURCE,'originalContainer':CONTAINER,'before':before,'after':after,'nativeEquality':native_checks,
      'sourceDump':pin(dump),'localRolesSQL':pin(roles_path),'postgrestBinary':pin(binary),'roles':roles,'memberships':members,
      'captureWallMS':(time.monotonic()-began)*1000,'sourceWrites':0,'tests':0,'profileActivations':0,
      'resourceGOConsumed':False,'production':False,'newOwnedRestoreWillBeMeasured':True}
    p=out/'READ_ONLY_SOURCE_CAPTURE.SAFE.json';p.write_text(json.dumps(result,indent=2));p.chmod(0o600);return result
if __name__=='__main__':raise SystemExit('IMPORT_ONLY_EXACT_READ_ONLY_CAPTURE_REQUIRED')
