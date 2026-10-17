#!/usr/bin/env python3
"""Pure small guard tests. No Docker, database, valid GO or500 recipe."""
import hashlib,importlib.util,json,sys
from pathlib import Path
from http_receipts import validate
from network_meter import settled_network

out=Path(sys.argv[1]);out.mkdir(mode=0o700,parents=True,exist_ok=False)
def load(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def rejected(fn):
    try:fn()
    except RuntimeError:return
    raise AssertionError('negative case accepted')
n=0
rejected(lambda:validate(out,required=True));n+=1
start={'schema':'helmut-local-http-meter-start/1','pid':100,'threadId':0}
(out/'HTTP_100_0.STARTED.SAFE.json').write_text(json.dumps(start))
rejected(lambda:validate(out));n+=1
row=json.loads(Path(sys.argv[2]).read_text());row.update(pid=100,threadId=0)
(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(row));assert len(validate(out,True,True)[0])==1;n+=1
row['connectionResetErrors']=1;(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(row))
rejected(lambda:validate(out,True,True));n+=1
row['pid']=101;(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(row))
rejected(lambda:validate(out));n+=1
row.update(pid=100,connectionResetErrors=0);row['unrecognizedFutureCounter']=1
(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(row));rejected(lambda:validate(out,True,True));n+=1
row.pop('unrecognizedFutureCounter');row.pop('responseHeaderBytes')
(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(row));rejected(lambda:validate(out,True,True));n+=1
clean={'lo':{k:0 for k in ['rx_bytes','tx_bytes','rx_packets','tx_packets','rx_errors','tx_errors','rx_dropped','tx_dropped']}}
assert settled_network(timeout=.2,quiet=.001,read=lambda:clean,active=lambda:0)['errorAndDropCountersZero'];n+=1
bad={'lo':{**clean['lo'],'rx_dropped':1}}
rejected(lambda:settled_network(timeout=.2,quiet=.001,read=lambda:bad,active=lambda:0));n+=1
rejected(lambda:settled_network(timeout=.06,quiet=.001,read=lambda:clean,active=lambda:1));n+=1
runner=load('process-runner');body=b'TEST_ONLY_NO_AUTHORITY'
recipe={'freshOwnerGO':{'TEST_ONLY':'no owner authority'},'independentMeterAcceptance':{'TEST_ONLY':'no review'}}
claim={'schema':'helmut-local-resource-attempt-claim/1','containerId':'a'*64,'recipeSHA256':hashlib.sha256(body).hexdigest(),**recipe}
runner.assert_claim_identity(body,recipe,claim,'a'*12);n+=1
rejected(lambda:runner.assert_claim_identity(body,recipe,{},'a'*12));n+=1
rejected(lambda:runner.assert_claim_identity(b'DRIFT',recipe,claim,'a'*12));n+=1
rejected(lambda:runner.assert_claim_identity(body,recipe,claim,'b'*12));n+=1
iso=load('isolation');before=iso.ONCE.exists();assert not before
p=out/'TEST_ONLY_BAD_ACCEPTANCE.SAFE.json';p.write_text(json.dumps({'status':'NOT_ACCEPTED_TEST_ONLY'}));b=p.read_bytes()
rejected(lambda:iso.verify_full_authority({'independentMeterAcceptance':{'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}}));n+=1
assert iso.ONCE.exists()==before
result={'pass':True,'smallGuardCases':n,'DockerOrDatabaseCalls':0,'validOwnerGOCreated':False,'full500Runs':0,'resourceGOConsumed':False}
(out/'GUARD_ACCEPTANCE.SAFE.json').write_text(json.dumps(result));print(json.dumps(result))
