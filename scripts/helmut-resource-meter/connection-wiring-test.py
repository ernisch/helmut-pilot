#!/usr/bin/env python3
"""Small NEW wiring test only: zero profiles/Helmut commands/GO claims."""
import base64,hashlib,hmac,importlib.util,json,re,secrets,subprocess,time,sys
from pathlib import Path

BIN=Path(__file__).parent
def load(n,f):
    s=importlib.util.spec_from_file_location(n,BIN/f);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
I=load('iso','isolation.py');S=load('storage','bounded-storage.py');C=load('connector','connect-local500.py')
W=C.AREA
def main():
    active=json.loads((W/'CURRENT_STAGED_CONNECTION.SAFE.json').read_text());fullcase=Path(active['caseDirectory'])
    full=json.loads((fullcase/'FINAL_CONNECTION.SAFE.json').read_text());capture=C.read_pin(full['sourceCapture'])
    metadata=Path(sys.argv[1]).resolve()
    if not metadata.is_relative_to(W) or metadata.name!='LOOP_CAPABILITY.SAFE.json':raise RuntimeError('explicit fresh small-probe metadata required')
    minor=json.loads(metadata.read_text())['native']['freeLoopIndex']
    tag=secrets.token_hex(4);case=W/('attempt-probe-'+tag);case.mkdir(mode=0o700)
    parent='helmut-meter-connection17-'+tag;network='helmut-meter-net-probe-'+tag
    storage=S.create(I.ONCE.parent/('small-connection-owned-storage-'+tag),512*1024*1024,minor,parent+'/storage',hold=900)
    gateway_pin=C.pin(Path(full['workflowDirectory'])/'runtime-candidates/gateway.candidate.js')
    fixture={'caseDirectory':str(case),'databaseReadOnlyPins':[capture['postgrestBinary']],'applicationReadOnlyPins':[gateway_pin]}
    I.create_network(network,subnet='172.16.250.0/24');db=I.create_database(case/'database','helmut-meter-db-probe-'+tag,parent+'/database',network,storage=storage,fixture=fixture)
    def psql(database,sql):
        r=subprocess.run(I.K.DOCKER+['exec','-i',db['name'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',database,'-f','-'],
          input=sql,capture_output=True,text=True,check=True,timeout=30);return r.stdout.strip()
    psql('postgres',Path(capture['localRolesSQL']['path']).read_text());target=full['targetDatabase'];psql('postgres','CREATE DATABASE "'+target+'";')
    psql(target,'BEGIN;CREATE TABLE public.meter_connection_probe(id integer primary key);INSERT INTO public.meter_connection_probe VALUES(1),(2);ALTER TABLE public.meter_connection_probe ENABLE ROW LEVEL SECURITY;GRANT SELECT ON public.meter_connection_probe TO service_role;COMMIT;')
    original=(C.BASE/'wave9/native-fixture/postgrest.PRIVATE.conf').read_text()
    if original.count('helmut_u_start_fixture_005821f5')!=1 or original.count('server-port = 38410')!=1:raise RuntimeError('actual original native config shape changed')
    body=original.replace('helmut_u_start_fixture_005821f5',target).replace('server-port = 38410','server-port = 38414')
    conf='/tmp/helmut-resource-fixture.conf'
    subprocess.run(I.K.DOCKER+['exec','-i',db['name'],'sh','-c','umask 077; test ! -e '+conf+' && cat > '+conf],input=body,text=True,capture_output=True,check=True,timeout=20)
    I.K.docker(['exec','-d',db['name'],'/tmp/helmut-unit-fixture-postgrest-03693bea',conf])
    ip=I.K.docker(['inspect','--format','{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',db['name']]).stdout.strip()
    secret=re.search(r'^jwt-secret\s*=\s*"([^"]+)"',body,re.M)
    if not secret:raise RuntimeError('local native JWT config missing')
    enc=lambda b:base64.urlsafe_b64encode(b).rstrip(b'=')
    header=enc(b'{"alg":"HS256","typ":"JWT"}');payload=enc(json.dumps({'role':'service_role','iss':'supabase','aud':'authenticated','iat':int(time.time()),'exp':int(time.time())+600}).encode())
    message=header+b'.'+payload;token=message+b'.'+enc(hmac.new(secret.group(1).encode(),message,hashlib.sha256).digest())
    appout=case/'application-input';appout.mkdir(mode=0o700);token_path=case/'LOCAL_PROBE_TOKEN.PRIVATE.txt';token_path.write_bytes(token);token_path.chmod(0o600)
    cfg={'scope':'TRANSPORT_TEST_ONLY_NO_OWNER_GO_OR_ACTIVATION','database':target,'containerIP':ip,'port':38414,'gatewaySourcePin':gateway_pin,'tokenFile':str(token_path),'workflowDirectory':full['workflowDirectory']}
    C.save(case/'PROBE_CONFIG.PRIVATE.json',cfg)
    recipe={'scope':'small-meter-validation','sourcePins':[C.pin(BIN/'connection-smoke-test.js')],
      'stages':[{'name':'actual-new-connection-transport','argv':['taskset','-c','0','node',str(BIN/'connection-smoke-test.js'),str(case/'PROBE_CONFIG.PRIVATE.json')],'timeoutSeconds':30}]}
    app=I.launch_application(case/'application','helmut-meter-app-probe-'+tag,parent+'/application',network,recipe,db)
    result=I.finalize(app,timeout=90)
    proof=json.loads((case/'application/CONNECTION_SMOKE.SAFE.json').read_text())
    if not result['pass'] or proof['pass'] is not True:raise RuntimeError('new connection smoke failed; preserve and do not retry automatically')
    final={'pass':True,'scope':'ACTUAL_NATIVE_TRANSPORT_ONLY_ZERO_PROFILE_NOT500_ADMISSION',
      'caseDirectory':str(case),'nativeDatabaseRows':2,'profileRowsCreated':0,'full500Runs':0,'resourceGOConsumed':False,
      'checks':['pinned existing native PostgREST binary mounted readonly','exact owned DB broker/native observer','original staged HTTP gateway source','native JWT success and invalid-JWT401','original taskset CPU0 plus Node24 runtime','closed process/traffic/HTTP receipts through final exit'],
      'activationGuardExplicitlyStubbedOnlyForIsolatedVMTransport':True,
      'notAnEngineAuthorizationOr500ControlTest':True,'result':C.pin(case/'application/COMPLETE_RESOURCE_RESULT.SAFE.json'),
      'smoke':C.pin(case/'application/CONNECTION_SMOKE.SAFE.json'),'simultaneousOwnedPeakBytes':result['simultaneousApplicationAndInfrastructureKernel']['memoryPeakBytes']}
    C.save(W/'CONNECTION_SMALL_TRANSPORT_ACCEPTANCE.SAFE.json',final);print(json.dumps(final))
if __name__=='__main__':main()
