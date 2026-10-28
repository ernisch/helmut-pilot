#!/usr/bin/env python3
"""Pure routing regression: execute original guards with a recording transport, no DB."""
import ast,hashlib,importlib.util,inspect,json,pathlib,sys
sys.dont_write_bytecode=True
ROOT=pathlib.Path(__file__).resolve().parents[1]
driver=ROOT/'scripts/synthetik-500-w15-memory-forward.py'
tree=ast.parse(driver.read_text())
calls=[x for x in ast.walk(tree)if isinstance(x,ast.Call)and isinstance(x.func,ast.Attribute)
    and isinstance(x.func.value,ast.Name)and x.func.value.id=='M'and x.func.attr in ['read','sql']]
assert len(calls)==5
for c in calls:
    db=next((k.value for k in c.keywords if k.arg=='database'),None)
    assert db is not None,'w15-routing-explicit-database-missing'
    assert (c.func.attr=='read'and isinstance(db,ast.Name)and db.id=='DB')or(c.func.attr=='sql'and isinstance(db,ast.Constant)and db.value=='postgres')
spec=importlib.util.spec_from_file_location('forward_routing_only',driver)
n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
assert not n.WORK.exists(),'w15-routing-must-precede-new-attempt'
assert n.DB=='helmut_w15_memory_forward_20261028b'
assert n.CONTAINER=='w15-memory-forward-20261028b'
js=(ROOT/'scripts/synthetik-500-w15-memory-forward.js').read_text()
assert n.DB in js and n.BASE in js
old_default=inspect.signature(n.M.read).parameters['database'].default
assert old_default!=n.DB,'w15-routing-sticky-default-not-exercised'
recorded=[]
def record_transport(*args,**kwargs):
    recorded.append((args,kwargs));return b'0\n'
n.M.docker=record_transport
assert n.M.read('select 0;',database=n.DB)==0
assert recorded[-1][0][recorded[-1][0].index('-d')+1]==n.DB
assert recorded[-1][0][2]==n.CONTAINER
assert n.M.sql('select 0;',database='postgres')=='0'
assert recorded[-1][0][recorded[-1][0].index('-d')+1]=='postgres'
for kwargs in [{},{'database':'wrong_database'}]:
    count=len(recorded)
    try:n.M.read('select 0;',**kwargs)
    except AssertionError:pass
    else:raise AssertionError('w15-routing-wrong-target-accepted')
    assert len(recorded)==count,'w15-routing-rejection-must-precede-transport'
print(json.dumps({'status':'PASS_EXPLICIT_DB_ROUTING_AND_ORIGINAL_GUARDS','databaseCallSites':len(calls),
  'explicitReadSites':4,'administrativeSites':1,'realDatabaseQueries':0,'containerStarts':0,'units':0,
  'oldDefaultAndWrongTargetStillRejected':True,'driverSHA256':hashlib.sha256(driver.read_bytes()).hexdigest()}))
