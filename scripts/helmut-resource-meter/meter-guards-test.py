#!/usr/bin/env python3
"""Pure small guard tests. No Docker, database, valid GO or500 recipe."""
import copy,hashlib,importlib.util,json,sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from http_receipts import HTTPReceiptValidationError,validate
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
baseline=copy.deepcopy(row)
(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(row));assert len(validate(out,True,True)[0])==1;n+=1
row['connectionResetErrors']=1;(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(row))
rejected(lambda:validate(out,True,True));n+=1
row['pid']=101;(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(row))
rejected(lambda:validate(out));n+=1
row.update(pid=100,connectionResetErrors=0);row['unrecognizedFutureCounter']=1
(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(row));rejected(lambda:validate(out,True,True));n+=1
row={**baseline,'schema':'helmut-local-http-meter/2','connectionResetErrors':2,
     'idleConnectionResetErrors':2,'incompleteConnectionResetErrors':0}
(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(row))
accepted,count=validate(out,True,True)
assert count==1 and accepted[0]['connectionResetErrors']==2;n+=1
for delta in [{'incompleteConnectionResetErrors':1,'idleConnectionResetErrors':1},
              {'incompleteResponses':1},{'parseErrors':1},{'unfinishedActiveHTTPParsers':1},
              {'unparsedResponseBytes':1},{'idleConnectionResetErrors':3}]:
    candidate={**row,**delta};(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(candidate))
    try:validate(out,True,True)
    except HTTPReceiptValidationError as error:
        assert error.start_count==1 and error.rows==[candidate]
    else:raise AssertionError('incomplete HTTP classification accepted')
    n+=1
legacy={k:v for k,v in row.items() if k not in ['idleConnectionResetErrors','incompleteConnectionResetErrors']}
legacy['schema']='helmut-local-http-meter/1'
(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(legacy));rejected(lambda:validate(out,True,True));n+=1
legacy['connectionResetErrors']=0;(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(legacy))
assert validate(out,True,True)[1]==1;n+=1
missing=dict(row);del missing['idleConnectionResetErrors']
(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(missing));rejected(lambda:validate(out,True,True));n+=1
candidate={**row,'idleConnectionResetErrors':True}
(out/'HTTP_100_0.SAFE.json').write_text(json.dumps(candidate));rejected(lambda:validate(out,True,True));n+=1
row=dict(baseline);row.pop('responseHeaderBytes')
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
# Exercise actual runner error handling with a fake exited child and passive
# in-memory dependencies. No process, socket, DB, claim or owner GO is started.
rundir=out/'runner-diagnostic';rundir.mkdir()
recipe_path=rundir/'TEST_ONLY_RECIPE.json'
recipe_path.write_text(json.dumps({'scope':'small-meter-validation','stages':[
    {'name':'TEST_ONLY_FAILED_STAGE','argv':['node','NEVER_EXECUTED'],'timeoutSeconds':1}]}))
original_rows=[{**legacy,'pid':200+i,'connectionResetErrors':1} for i in range(12)]
with patch.object(runner,'Path',side_effect=lambda p:rundir if str(p)=='/meter-output' else Path(p)), \
     patch.object(runner.sys,'argv',['TEST_ONLY',str(recipe_path)]), \
     patch.object(runner.subprocess,'Popen',return_value=SimpleNamespace(wait=lambda **kw:None,returncode=7)), \
     patch.object(runner,'finish_children',return_value={'graceful':True,'ownedSurvivorsSignalled':0}), \
     patch.object(runner,'network',return_value={}), \
     patch.object(runner,'settled_network',side_effect=RuntimeError('TEST_ONLY_NETWORK_TAIL')), \
     patch.object(runner,'validate_http_receipts',side_effect=HTTPReceiptValidationError('TEST_ONLY_STRICT_REJECTION',original_rows,12)):
    assert runner.run_workflow()==1
diagnostic=json.loads((rundir/'RUNNER_RESULT.SAFE.json').read_text())
assert diagnostic['failure']=='STAGE_EXIT'
assert diagnostic['failures']==['STAGE_EXIT','HTTP_RECEIPTS_INCOMPLETE_OR_INVALID','NETWORK_TAIL_INCOMPLETE']
assert diagnostic['HTTPStartedReceiptCount']==12 and diagnostic['httpProcessCounters']==original_rows
assert diagnostic['httpReceiptCountersAvailable']is True and diagnostic['httpReceiptValidationPassed']is False
n+=1
iso=load('isolation');before=iso.ONCE.exists()
def fixture(name,value):
    p=out/('TEST_ONLY_'+name+'.json');p.write_text(json.dumps(value));b=p.read_bytes()
    return {'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
empty=fixture('EMPTY',{})
acceptance=fixture('BAD_ACCEPTANCE',{'status':'NOT_ACCEPTED_TEST_ONLY','sourcePins':[],
    'independentReviews':{},'fullConnectionReviews':{}})
request=fixture('REQUEST',{'sourcePins':[],'primaries':{}})
connection=fixture('CONNECTION',{'immutableWorkflowPins':[],'applicationReadOnlyPins':[],
    'stagedHarness':empty,'runtimeRequest':request,'sourceCapture':empty,
    'caseDirectory':str(out/'TEST_ONLY_NOT_AN_EXECUTABLE_CASE')})
owner=fixture('UNAUTHORIZED_OWNER',{'previousConsumedMarkers':[]})
day=fixture('DAY',{'independentReview':empty})
invalid_recipe={'independentMeterAcceptance':acceptance,'fixtureConnectionPin':connection,
    'recipeTemplatePin':empty,'sourcePins':[],'freshOwnerGO':owner,'dayBindingAcceptance':day}
# Only isolate the fixed original-data lookup; the actual shared manifest
# opens/hashes every fixture above before the intended acceptance-status gate.
with patch.object(iso.A,'capture_data_pins',return_value=[]):
    try:iso.verify_full_authority(invalid_recipe)
    except RuntimeError as error:assert str(error)=='independent complete meter acceptance missing'
    else:raise AssertionError('unaccepted meter authority accepted')
n+=1
assert iso.ONCE.exists()==before
result={'pass':True,'smallGuardCases':n,'DockerOrDatabaseCalls':0,'validOwnerGOCreated':False,'full500Runs':0,'resourceGOConsumed':False}
(out/'GUARD_ACCEPTANCE.SAFE.json').write_text(json.dumps(result));print(json.dumps(result))
