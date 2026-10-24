#!/usr/bin/env python3
"""Tiny native PG/HTTP/Worker integration on owned capped filesystem; no profiles."""
import importlib.util,json,secrets,sys,hashlib
from pathlib import Path
s=importlib.util.spec_from_file_location('I',Path(__file__).with_name('isolation.py'))
I=importlib.util.module_from_spec(s);s.loader.exec_module(I)
out=Path(sys.argv[1]);out.mkdir(mode=0o700,parents=True,exist_ok=False)
storage=json.loads(Path(sys.argv[2]).read_text());parent=storage['parent'].rsplit('/',1)[0]
tag=secrets.token_hex(4);net='helmut-meter-net-'+tag;I.create_network(net)
db=I.create_database(out/'database','helmut-meter-db-'+tag,parent+'/database',net,storage=storage)
ip=I.K.docker(['inspect','--format','{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',db['name']]).stdout.strip()
pins=[{'path':str(p),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in I.BIN.iterdir() if p.is_file()]
sql="BEGIN;CREATE TABLE meter_probe AS SELECT g,repeat(md5(g::text),128)t FROM generate_series(1,2048)g;ROLLBACK;"
recipe={'scope':'small-meter-validation','sourcePins':pins,'databaseSampleIntervalSeconds':.2,'stages':[
 {'name':'native-sql-transient-rollback','argv':['docker','--host=unix:///var/run/docker.sock','exec','-u','postgres',db['name'],'psql','-X','-v','ON_ERROR_STOP=1','-d','postgres','-c',sql],'timeoutSeconds':30},
 {'name':'native-network-response','argv':['/usr/lib/postgresql/17/bin/psql','-h',ip,'-U','postgres','-d','postgres','-X','-At','-c',"SELECT repeat('m',32768)"],'timeoutSeconds':30},
 {'name':'http-reset-framing-callback','argv':['node',str(I.BIN/'http-meter-test.js'),'/meter-output/http'],'timeoutSeconds':30},
 {'name':'worker-and-last-exit','argv':['node','-e','const{Worker}=require("worker_threads");const w=new Worker("const b=Buffer.alloc(8*1024*1024)",{eval:true});w.on("exit",()=>process.once("exit",()=>Buffer.alloc(16*1024*1024,3)));'],'timeoutSeconds':30}]}
app=I.launch_application(out/'application','helmut-meter-app-'+tag,parent+'/application',net,recipe,db)
r=I.finalize(app)
assert r['pass'] and r['databaseFinal']['storageBound']['provenUpperBytes']==storage['bytes']
assert r['ownedBoundedStorageFinal']['identityUnchanged'] and r['ownedBoundedStorageFinal']['deviceNodeRetiredBeforeExit']
result={'pass':True,'full500Runs':0,'syntheticProfilesCreated':0,'kernelSimultaneousAllOwnedPeakBytes':r['simultaneousApplicationAndInfrastructureKernel']['memoryPeakBytes'],
 'appAndMeasurementPeakBytes':r['applicationKernelAfterLastExit']['memoryPeakBytes'],
 'databasePeakBytes':r['databaseKernelAfterLastExit']['memoryPeakBytes'],
 'kernelStorageUpperBytes':r['databaseFinal']['storageBound']['provenUpperBytes'],
 'nativeLoopMinor':r['databaseFinal']['storageBound']['nativeLoopMinor'],
 'allOwnedUserProcessGroupsEmptyAtEnd':r['simultaneousApplicationAndInfrastructureKernel']['fullLastProcessExitCovered'],
 'completeWALGenerationUpperBytes':r['completeWALGenerationConservativeUpperBytes'],
 'safeRetirement':r['ownedBoundedStorageFinal'],'resourceGOConsumed':False}
I.K.save_new(out/'BOUNDED_SMALL_ACCEPTANCE.SAFE.json',result);print(json.dumps(result))
