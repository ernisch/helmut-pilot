#!/usr/bin/env python3
"""Only new connection guards; no Docker, DB, real GO or workflow."""
import concurrent.futures,hashlib,importlib.util,json,tempfile
from pathlib import Path
B=Path(__file__).parent

def mod(name,file):
 s=importlib.util.spec_from_file_location(name,B/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
I=mod('isolation','isolation.py');C=mod('connector','connect-local500.py');F=mod('controller','full500-controller.py')
W=C.AREA;case=W/'attempt-c618dbcee5f4';plan=json.loads((case/'FINAL_CONNECTION.SAFE.json').read_text());checks=[]
def rejected(name,fn):
 try:fn()
 except (RuntimeError,KeyError,FileExistsError):checks.append(name);return
 raise AssertionError('Accepted negative: '+name)
assert not I.ONCE.exists() and not I.SETUP_RESERVATION.exists()
I.verify_connection_files(plan);checks.append('all30actual immutable workflow pins match')
C.exact_case_binding(case,plan['targetDatabase'],plan['containerName'],plan['operationId']);checks.append('all four owned names share exact case suffix')
rejected('different target suffix',lambda:C.exact_case_binding(case,plan['targetDatabase'][:-1]+'0',plan['containerName'],plan['operationId']))
bad=json.loads(json.dumps(plan));bad['immutableWorkflowPins'][0]['sha256']='0'*64
rejected('staged code byte pin drift',lambda:I.verify_connection_files(bad))
bad=json.loads(json.dumps(plan));bad['immutableWorkflowPins']=bad['immutableWorkflowPins'][1:]
rejected('missing staged workflow file pin',lambda:I.verify_connection_files(bad))
bad=json.loads(json.dumps(plan));bad['originalPreflightPin']['sha256']='0'*64
rejected('archived preflight byte drift rejected before SQL',lambda:F.original_preflight(bad))
with tempfile.TemporaryDirectory(prefix='helmut-connection-authority-test-')as d:
 d=Path(d);p=d/'TEST_ONLY_RECIPE.json';p.write_text('{"scope":"owner-approved-local500-resources","TEST_ONLY":"NO_VALID_OWNER_AUTHORITY"}')
 previous=I.ONCE;I.ONCE=d/'TEST_ONLY_CLAIM.json';I.ONCE.write_text(json.dumps({'containerId':'TEST_ONLY','recipeSHA256':hashlib.sha256(p.read_bytes()).hexdigest()}))
 try:
  I.verify_final_recipe(p,'TEST_ONLY');checks.append('exact final recipe hash accepted by isolated claim-integrity helper only')
  p.write_text(p.read_text()+' ');rejected('late serialized recipe drift',lambda:I.verify_final_recipe(p,'TEST_ONLY'))
  p.write_text(p.read_text()[:-1]);rejected('foreign final container identity',lambda:I.verify_final_recipe(p,'OTHER_TEST_ONLY'))
 finally:I.ONCE=previous
 lock=d/'TEST_ONLY_SETUP_RESERVATION.json'
 def reserve(n):
  try:I.K.save_new(lock,{'scope':'TEST_ONLY_NOT_A_GO','n':n});return True
  except FileExistsError:return False
 with concurrent.futures.ThreadPoolExecutor(max_workers=8)as pool:results=list(pool.map(reserve,range(8)))
 assert sum(results)==1;checks.append('eight concurrent setup reservations have exactly one winner')
assert not I.ONCE.exists() and not I.SETUP_RESERVATION.exists()
r={'pass':True,'pureCases':len(checks),'checks':checks,'DockerCalls':0,'databaseCalls':0,'realOwnerGOCreated':False,'globalSetupReserved':False,'resourceGOConsumed':False,'full500Runs':0}
C.save(W/'CONNECTION_NEW_AUTHORITY_GUARDS.SAFE.json',r);print(json.dumps(r))
