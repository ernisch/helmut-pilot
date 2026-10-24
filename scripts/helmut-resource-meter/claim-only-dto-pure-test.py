"""AST-isolated new-mode/DTO guards only; no product module import or SQL execution."""
import ast
import base64
import copy
import hashlib
import json
from pathlib import Path
import re
import sys
import types

source_root_option=sys.argv.index('--source-root') if '--source-root' in sys.argv else None
if source_root_option is not None and (source_root_option+1>=len(sys.argv) or sys.argv[source_root_option+1].startswith('--')):
    raise ValueError('--source-root requires a path')
SOURCE_ROOT=(Path(__file__).resolve().parents[2] if source_root_option is None else Path(sys.argv[source_root_option+1]).resolve())
NATIVE_DIRECTORY=SOURCE_ROOT/'scripts'/'helmut-resource-meter'
TREES={k:ast.parse((NATIVE_DIRECTORY/k).read_text(),filename=k) for k in (
 'local-unit-native-execution-host.py','local-unit-native-execution-controller.py','local-unit-native-supervisor.py')}

class Reject(RuntimeError):pass

def need(ok,code):
    if not ok:raise Reject(code)

def function(tree,name):return next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name==name)
def isolated(nodes,ns):
    exec(compile(ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[])),'<pinned-source-guard>','exec'),ns)
    return ns

def wrapper(name,args,body):
    f=ast.parse('def '+name+'('+args+'):\n pass').body[0]
    f.body=copy.deepcopy(body);return f

def canon(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False)
def sha(v):return hashlib.sha256((v if isinstance(v,bytes) else v.encode())).hexdigest()

passed=failed=0

def check(name,action):
    global passed,failed
    if '--only-close-type' in sys.argv and name!='snapshot.closeExitCodeType':return
    if '--only-projection-admission' in sys.argv and name!='snapshot.projectionAdmissionSQL':return
    try:action();passed+=1;print(json.dumps({'id':name,'status':'PASS'}))
    except Exception as error:
        failed+=1;print(json.dumps({'id':name,'status':'FAIL','error':type(error).__name__,'message':str(error)[:240]}))

def rejects(action):
    try:action()
    except (Reject,RuntimeError,KeyError,TypeError,ValueError,AttributeError):return
    raise AssertionError('invalid DTO was accepted')

mode='fresh-claim-only-v1'
selection={'operationId':'localUnitDiagnostic-'+'a'*32,'commandHash':'b'*64}
false_fields=('unit60Qualified','auth30Qualified','independentFinalAcceptance','full500Accepted','production','paidProviderCallsAllowed','retryAllowed')
r={'mode':mode,**selection,'claimCallbackReached':True,'callbackCalls':1,'claimStillRunning':True,'authorityConsumed':True,
   **{k:0 for k in ('motorCalls','providerCalls','completedUnits','expectedPositions','controlCount')},**{k:False for k in false_fields}}
terminal={'schema':'helmut-local-unit-native-claim-only-terminal/1','status':'diagnosed','selection':selection,'errors':[],
 'unit60OrAuth30Acceptance':'CLAIM_ONLY_NOT_UNIT_OR_AUTH_ACCEPTANCE',
 **{k:False for k in ('full500Accepted','independentFinalAcceptance','production','paidProviderCallsAllowed','retryAllowed')},
 'result':r,'process':{'pid':7,'startTicks':'345','nspid':[7],'pidNamespace':'pid:[1234]'},
 'startedAtUTC':'2026-10-23T12:00:00.000Z','finishedAtUTC':'2026-10-23T12:00:01.000Z'}
close={'selection':selection,'process':terminal['process'],'exitCode':0,'signal':None,'stdoutEOF':True,'stderrEOF':True,'terminalCanonicalSHA256':sha(canon(terminal))}
dto={'schema':'helmut-native-claim-only-snapshot/1',**selection,'ownRevision':1,'ownHash':'c'*64,'claimIdSHA256':'d'*64,
     'journalState':'running','usageUnchanged':True,'artifacts':0,'claimStillRunning':True,'authorityConsumed':True,'unitAccepted':False}

# Exact existing Host _accept executes against an in-memory host, never its constructor.
host_ns={'need':need,'HASH':re.compile('[a-f0-9]{64}'),'window':lambda request:None,'time':types.SimpleNamespace(monotonic=lambda:10.0)}
isolated([function(TREES['local-unit-native-execution-host.py'],'_accept')],host_ns)

def accept(diagnostic,stage,body):
    calls=[];host=types.SimpleNamespace(config={'nonce':'a'*32},pending=None,seq=1,seen=set(),selection=selection,
       state='QUALIFIED' if stage=='ENTRY_START' else 'ENTRY',observed_at=9.0,_client=lambda value:calls.append(value))
    if diagnostic is not None:host.config['nativeDiagnosticMode']=diagnostic
    request={'schema':'helmut-local-unit-native-host-request/1','seq':1,'stage':stage,'nonce':'1'*64,'selection':selection,
       'issuedAtUTC':'2026-10-23T12:00:00.000Z','expiresAtUTC':'2026-10-23T12:00:03.000Z','body':body}
    host_ns['_accept'](host,request,'2'*64);return host,calls

def mode_bodies():
    for stage in ('ENTRY_START','ENTRY_RESULT'):
        accept(mode,stage,{'diagnosticMode':mode});accept(None,stage,{})
        for body in ({},{'diagnosticMode':'other'},{'diagnosticMode':mode,'extra':True}):
            rejects(lambda:accept(mode,stage,body))
        rejects(lambda:accept(None,stage,{'diagnosticMode':mode}))
check('host.oppositeEntryBodies',mode_bodies)

# Only the new _client mode guard: its following container/FS code is not compiled.
client=function(TREES['local-unit-native-execution-host.py'],'_client')
ns=isolated([wrapper('mode_guard','self,mode',client.body[:2])],{'need':need})
def mode_guard_cases():
    for value in ('',False,{},'fresh-claim-only-v2'):
        rejects(lambda:ns['mode_guard'](types.SimpleNamespace(config={'nativeDiagnosticMode':value}),'entry'))
    ns['mode_guard'](types.SimpleNamespace(config={}), 'entry')
    ns['mode_guard'](types.SimpleNamespace(config={'nativeDiagnosticMode':mode}), 'entry')
check('host.exactModeEnum',mode_guard_cases)

# Extract only claim_only assignment and its actual terminal predicates from tick.
sequence=None
for n in ast.walk(TREES['local-unit-native-execution-host.py']):
    for _,v in ast.iter_fields(n):
        if isinstance(v,list):
            for i,a in enumerate(v):
                if isinstance(a,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='claim_only' for t in a.targets):
                    sequence=v[i:i+3]
assert sequence and isinstance(sequence[-1],ast.If)
terminal_ns=isolated([wrapper('terminal_guard','self,terminal',sequence)],{'need':need})
def guard(t,m=mode):return terminal_ns['terminal_guard'](types.SimpleNamespace(config={'nativeDiagnosticMode':m},selection=selection),t)
check('host.claimTerminalPositive',lambda:guard(copy.deepcopy(terminal)))
for name,path,value in [('unitSchema',('schema',),'helmut-local-unit-native-entry-terminal/1'),('unitStatus',('status',),'closed'),
 ('otherSelection',('selection','commandHash'),'f'*64),('badCountType',('result','callbackCalls'),True),('badCountValue',('result','callbackCalls'),2)]:
    def case(path=path,value=value):
        t=copy.deepcopy(terminal);target=t
        for k in path[:-1]:target=target[k]
        target[path[-1]]=value;rejects(lambda:guard(t))
    check('host.terminalReject.'+name,case)
check('host.normalModeRejectsClaimDiagnosed',lambda:rejects(lambda:guard(copy.deepcopy(terminal),None)))

# Exact source supervisor result guards, with all setup/native operations excluded.
main=function(TREES['local-unit-native-supervisor.py'],'main');guard_nodes=None
for n in ast.walk(main):
    for _,v in ast.iter_fields(n):
        if isinstance(v,list):
            for i,a in enumerate(v):
                if isinstance(a,ast.If) and ast.unparse(a.test).startswith("result.get('pass')"):
                    guard_nodes=v[i:i+4]
assert guard_nodes and all(isinstance(n,ast.If) for n in guard_nodes)
super_ns=isolated([wrapper('result_guard','args,result,bindings_mode,execution_mode',guard_nodes)],{})
actual={'pass':True,'schema':'helmut-local-unit-native-claim-only-result/1','diagnosticMode':mode,
 'genuineSourceInputsQualified':True,'readClosureQualified':True,'originalBridgeQualified':True,'executionAuthorityInstalled':True,
 'claimOnlyObserved':True,'claimStillRunning':True,'authorityConsumed':True,'reuseForbidden':True,'full500':False,
 **{k:False for k in ('unit60Qualified','auth30Qualified','independentFinalAcceptance','production')},
 **{k:0 for k in ('motorCalls','providerCalls','completedUnits','expectedPositions','controlCount')}}
def result_guard(value,diagnose):
    return super_ns['result_guard'](types.SimpleNamespace(run_native_single_unit=not diagnose,diagnose_native_claim_only=diagnose),value,True,True)
check('supervisor.claimResultPositive',lambda:result_guard(copy.deepcopy(actual),True))
check('supervisor.unitRejectsClaimResult',lambda:rejects(lambda:result_guard(copy.deepcopy(actual),False)))
for k,v in [('schema','helmut-local-unit-native-execution-result/1'),('diagnosticMode','other'),('unit60Qualified',True),('controlCount',16),('motorCalls',False)]:
    check('supervisor.reject.'+k,lambda k=k,v=v:rejects(lambda:result_guard({**actual,k:v},True)))

# Snapshot wrapper runs only scalar/DTO checks and constructs its real SQL string.
# _call is an explicit in-memory response, not a query/SQL interpreter/native proof.
c_ns={'need':need,'json':json,'hashlib':hashlib,'re':re,'base64':base64}
isolated([function(TREES['local-unit-native-execution-controller.py'],n) for n in ('canonical','sha','_q','_json_sql','_readonly','_claim_only_snapshot')],c_ns)
queries=[];sql_texts=[]
def snapshot(t=None,c=None,d=None):
    value=copy.deepcopy(dto if d is None else d)
    def no_query(worker,database,sql,label):
        assert sql.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;')
        assert "statement_timeout='8s'" in sql and "lock_timeout='500ms'" in sql
        assert label=='CLAIM_ONLY_READONLY_SNAPSHOT';queries.append(label);sql_texts.append(sql);return value
    c_ns['_call']=no_query
    return c_ns['_claim_only_snapshot'](None,'helmut_unit_diagnostic_'+'a'*32,copy.deepcopy(selection),{},
       {'initialState':{}},{'proof':{}},copy.deepcopy(terminal if t is None else t),copy.deepcopy(close if c is None else c))

def projection_admission_sql():
    before=len(queries);snapshot();assert len(queries)==before+1
    sql=sql_texts[-1]
    admit="SET LOCAL helmut.local_diagnostic_scope='bounded-cas-qualification-v1';"
    def contract(statement):
        assert statement.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;')
        assert statement.count(admit)==1
        assert statement.index('END;$boundary$;')<statement.index(admit)<statement.index('DO $claim_diagnostic$')
        assert statement.index(admit)<statement.index('PERFORM public.helmut_auth_state_assert_graph_local_v1(')
        assert "session_user<>'postgres' OR current_user<>session_user" in statement
        assert "statement_timeout='8s'" in statement and "lock_timeout='500ms'" in statement
        assert statement.endswith('\nROLLBACK;') and 'SET ROLE' not in statement
    contract(sql)
    for replacement in ('',"SET LOCAL helmut.local_diagnostic_scope='off';",
                         "SET LOCAL helmut.local_diagnostic_scope='other';"):
        try:contract(sql.replace(admit,replacement,1))
        except AssertionError:pass
        else:raise AssertionError('unadmitted projection SQL contract accepted')
    ordinary=c_ns['_readonly']('helmut_unit_diagnostic_'+'a'*32,'SELECT 1;')
    assert 'local_diagnostic_scope' not in ordinary
    original=(SOURCE_ROOT/'supabase/proposals/auth_state_parts_local.sql').read_text()
    guard=original.split('create function public.helmut_auth_state_assert_graph_local_v1(',1)[1].split('end;$f$;',1)[0]
    assert "current_setting('helmut.local_diagnostic_scope',true) is distinct from 'bounded-cas-qualification-v1'" in guard
    assert "raise exception 'auth-state-projection-not-admitted'" in guard
check('snapshot.projectionAdmissionSQL',projection_admission_sql)

check('snapshot.positiveDTOOnly',lambda:snapshot())
for k,v in [('ownRevision',True),('ownRevision','1'),('ownRevision',0),('ownRevision',2),('ownHash','x'*64),('claimIdSHA256',None),
 ('artifacts',False),('artifacts',1),('usageUnchanged',1),('journalState','closed'),('claimStillRunning',False),('authorityConsumed',False),('unitAccepted',True),
 ('commandHash','f'*64),('operationId','localUnitDiagnostic-'+'f'*32)]:
    check('snapshot.reject.'+k+'.'+str(v),lambda k=k,v=v:rejects(lambda:snapshot(d={**dto,k:v})))
check('snapshot.rejectExtraField',lambda:rejects(lambda:snapshot(d={**dto,'extra':True})))
for k,v in [('exitCode',1),('exitCode','0'),('signal','SIGTERM'),('stdoutEOF',False),('stderrEOF',False),('stdoutEOF',1),('stderrEOF',1),
 ('terminalCanonicalSHA256','0'*64),('selection',{**selection,'commandHash':'f'*64}),('process',{})]:
    check('snapshot.closeReject.'+k+'.'+str(v),lambda k=k,v=v:rejects(lambda:snapshot(c={**close,k:v})))
check('snapshot.closeExitCodeType',lambda:rejects(lambda:snapshot(c={**close,'exitCode':False})))
for k,v in [('schema','helmut-local-unit-native-entry-terminal/1'),('status','closed'),('errors',[{}]),('selection',{**selection,'commandHash':'f'*64})]:
    check('snapshot.terminalReject.'+k,lambda k=k,v=v:rejects(lambda:snapshot(t={**terminal,k:v})))
print(json.dumps({'schema':'helmut-fresh-claim-only-dto-pure-result/1','passed':passed,'failed':failed,'mockReadCalls':len(queries),'SQLExecuted':False,'nativeEvidence':False}))
raise SystemExit(1 if failed else 0)
