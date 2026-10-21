#!/usr/bin/env python3
"""Stage ONLY pinned existing local500 harness with exact owned bindings.

No Docker, activation, database, model, GO claim or execution on import/stage.
Original harness/data remain unchanged. Each textual delta is retained for
independent review; no application/engine file is edited.
"""
import hashlib,json,os,re,secrets,subprocess
from pathlib import Path
import importlib.util
_spec=importlib.util.spec_from_file_location('next_resource_stage',Path(__file__).with_name('next-resource-authority.py'))
A=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(A)
_cal_spec=importlib.util.spec_from_file_location('resource_calendar_binding',Path(__file__).with_name('local-calendar-binding.py'))
Calendar=importlib.util.module_from_spec(_cal_spec);_cal_spec.loader.exec_module(Calendar)

REPO=Path('/workspace/helmut-cpu-epoch-20261015')
BASE=Path('/workspace/helmut-parallel-20261015')
AREA=BASE/'wave20-resource-integration'
BIN=REPO/'scripts/helmut-resource-meter'
SOURCE='helmut_fresh_input_fixture_d2e98984'
RESTORE_SCHEMA='helmut-restored-staging-inputs/1'
RESTORE_TEMPLATES={
 'runtimeRequestTemplate':('ROOT_NEW_RUNTIME_REQUEST.PRIVATE.json',38673,'a7fef926d30d51bc93d3872e1ddc46e847b8eb355acbdc7f2c15064d03f0fd3a'),
 'contentAcceptanceTemplate':('ROOT_NEW_CONTENT_CODE_ACCEPTANCE.PRIVATE.json',3730,'d94b3330464af749224b1b28f3e4fc40668ab437992da380c79b664e684c22bd'),
 'localExternalTemplate':('ROOT_NEW_LOCAL_EXTERNAL_BINDING.PRIVATE.json',8840,'3f05996fdc5cb8bea88d3bff34c55760d8d97745335ebbb703662d7c6bf4b36c')}


def read_restored_staging_inputs(p,case):
    """Explicit migration inputs, never a replacement historical approval."""
    if p is None:return None
    case=Path(case)
    def checked(q):
        if not isinstance(q,dict)or set(q)!={'path','bytes','sha256'}:raise RuntimeError('exact restored staging pin required')
        source=Path(q['path'])
        if not source.is_absolute()or source.resolve()!=source or not source.is_relative_to(BASE)or source.is_relative_to(case):
            raise RuntimeError('restored staging input must be canonical outside case within evidence basis')
        if source.stat().st_mode&0o077:raise RuntimeError('private restored staging input required')
        if pin(source)!=q:raise RuntimeError('restored staging input drift')
    checked(p);d=read_pin(p)
    required={'schema',*RESTORE_TEMPLATES,'originalPreflight','jwtSecret','sourcePostgrestConfig'}
    if not isinstance(d,dict)or not required<=set(d)or set(d)-required-{'executionEnvironment'}or d['schema']!=RESTORE_SCHEMA:
        raise RuntimeError('exact restored staging inputs required')
    for key,q in d.items():
        if key!='schema':checked(q)
    for key,(name,size,digest)in RESTORE_TEMPLATES.items():
        expected={'path':str(BASE/'wave20-resource-integration/attempt-a2521b52a505'/name),'bytes':size,'sha256':digest}
        if d[key]!=expected:raise RuntimeError('exact preserved a252 staging template required')
    preflight=read_pin(d['originalPreflight'])
    if d['originalPreflight']['path']=='/workspace/helmut-resource-preflight-20261016/RESOURCE_START_PREFLIGHT.SAFE.json':
        raise RuntimeError('new restored read-only preflight required')
    if (preflight.get('schema')!='helmut-restored-original-resource-preflight/1'
        or preflight.get('status')!='ACTUAL_RESTORED_FROZEN_SOURCE_READONLY_VERIFIED'
        or not isinstance(preflight.get('verifiedReadOnly'),dict)):
        raise RuntimeError('genuine restored read-only preflight missing')
    verified=preflight['verifiedReadOnly']
    if (not isinstance(verified.get('originalInputPins'),list)or not verified['originalInputPins']
        or not isinstance(verified.get('frozenSourceDatabase'),dict)):
        raise RuntimeError('restored read-only preflight binding structure missing')
    for key,name in [('jwtSecret','jwt-secret.PRIVATE.txt'),('sourcePostgrestConfig','postgrest.PRIVATE.conf'),('executionEnvironment','EXECUTION_ENV.PRIVATE.json')]:
        if key in d and Path(d[key]['path']).name!=name:raise RuntimeError('exact restored material basename required')
    code="require(process.argv[1]).restoredServiceMaterials(JSON.parse(require('node:fs').readFileSync(0,'utf8')));"
    result=subprocess.run(['node','-e',code,str(BIN/'start-input-checks.js')],input=json.dumps(d),text=True,capture_output=True,timeout=30)
    if result.returncode:raise RuntimeError('restored service material contract rejected')
    return d

def pin(file):
    p=Path(file)
    if p.is_symlink() or not p.is_file():raise RuntimeError('regular pinned file required')
    b=p.read_bytes();return {'path':str(p.resolve()),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}

def read_pin(p):
    if pin(p['path'])!=p:raise RuntimeError('input pin drift')
    return json.loads(Path(p['path']).read_text())

def read_atomic_descriptor(p):
    """Use the runtime's canonical validator before rendering ANY consumer."""
    candidate=read_pin(p)
    for source in candidate['sourcePins']:
        if pin(source['path'])!=source:raise RuntimeError('atomic usage source drift')
    code="const fs=require('node:fs');require(process.argv[1]).readDescriptor(JSON.parse(fs.readFileSync(0,'utf8')));"
    result=subprocess.run(['node','-e',code,str(BIN/'atomic-usage-integration.js')],
        input=json.dumps(p),text=True,capture_output=True,timeout=30)
    if result.returncode:raise RuntimeError('exact current local atomic usage descriptor required')
    return candidate

def read_postgrest_backend_plan(p,case,target,operation):
    """Optional explicit source/authority producer, checked before staging IO."""
    if p is None:return None
    spec=importlib.util.spec_from_file_location('stage_local_postgrest_backend',BIN/'local-postgrest-owner.py')
    owner=importlib.util.module_from_spec(spec);spec.loader.exec_module(owner)
    return owner.read_backend_plan(p,case_directory=str(case),target_database=target,operation_id=operation)

def save(p,value):
    p=Path(p)
    with p.open('x') as f:f.write(value if isinstance(value,str) else json.dumps(value,indent=2)+'\n')
    p.chmod(0o600);return pin(p)

def exact_case_binding(case,target,container,operation):
    case=Path(case)
    if case.parent!=AREA or case.resolve()!=case or not re.fullmatch('attempt-[a-f0-9]{12}',case.name):
        raise RuntimeError('exact fresh local case directory required')
    suffix=case.name.removeprefix('attempt-')
    if suffix!=A.CASE_SUFFIX:raise RuntimeError('only exact source-pinned current case required')
    if (target,container,operation)!=('helmut_resource_fixture_'+A.DATE_TAG+'_'+suffix,'helmut-meter-db-w20-'+suffix,'synthetik500-resources'+A.DAY[-2:]+'-'+suffix):
        raise RuntimeError('case/target/container/operation suffix mismatch')

def render_templates(case,*,target,container,operation,day_rows_pin,owner_go_pin,atomic_usage_pin=None,restore_staging_inputs=None,native_memory_budget=None,local_postgrest_backend_plan_pin=None):
    """Actual deterministic staging transformation, without creating/writing files."""
    templates=json.loads((BIN/'legacy-harness-pins.json').read_text())['files']
    for p in templates:
        if pin(p['path'])!={k:p[k] for k in ['path','bytes','sha256']}:raise RuntimeError('original harness drift')
    case=Path(case);n=case/'native-end-preparation'
    backend=read_postgrest_backend_plan(local_postgrest_backend_plan_pin,case,target,operation)
    restored=read_restored_staging_inputs(restore_staging_inputs,case)
    replacements=[('helmut_fresh_runtime_fixture_b27c2026',target),('helmut-boundary-pg-bd7dd5da',container),
      ('synthetik500-localnative16-b27c20261016',operation),('2026-10-16',A.DAY),
      ("B+'/wave15/native-end-preparation'",repr(str(n))),
      ("B+'/wave13/NORMALIZED500_CURRENT_POLICY.PRIVATE.json'",repr(day_rows_pin['path'])),
      ("O+'/OWNER_LOCAL_GO.PRIVATE.json'",repr(owner_go_pin['path'])),
      ('/tmp/helmut-fresh-runtime-fixture-b27c2026.conf','/tmp/helmut-resource-fixture.conf')]
    deltas=[]
    if native_memory_budget is not None:
        spec=importlib.util.spec_from_file_location('rendered_native_budget',BIN/'native-memory-budget.py')
        budget=importlib.util.module_from_spec(spec);spec.loader.exec_module(budget);budget.validate_policy(native_memory_budget)
    candidate=read_atomic_descriptor(atomic_usage_pin) if atomic_usage_pin else None
    calendar=candidate.get('localCalendar') if candidate else None
    if calendar is not None:
        Calendar.validate_policy(calendar)
        if calendar['operationId']!=operation:raise RuntimeError('local calendar operation differs')
    for template in templates:
        original=Path(template['path']).read_text();text=original;changes=[]
        if native_memory_budget is not None and template['relative']=='native-end-preparation/run-reviewed-sequence.js':
            old="'--max-old-space-size=1536'";new="'--max-old-space-size=384','--max-semi-space-size=16'"
            if text.count(old)!=1:raise RuntimeError('exact original local Node heap option required')
            text=text.replace(old,new);changes.append({'from':old,'to':new,'count':1})
        for old,new in replacements:
            count=text.count(old)
            if count:text=text.replace(old,new);changes.append({'from':old,'to':new,'count':count})
        if native_memory_budget is not None:
            def observe_change(old,new):
                nonlocal text
                if text.count(old)!=1:raise RuntimeError('exact runtime memory observation point missing: '+template['relative'])
                text=text.replace(old,new);changes.append({'from':old,'to':new,'count':1})
            if template['relative']=='native-end-preparation/observe-app.js':
                # Reuse the already admitted/installed native Node observer.
                # Only the private staged template changes; no original rewrite.
                observe_change('let activeMutation=null,blockedExternalHTTPSAttempts=0;',
                    'let activeMutation=null,blockedExternalHTTPSAttempts=0;\n'
                    '  const memoryCounts=()=>({requests:requests.length,mutations:mutations.length,scopes:scopes.length,'
                    'validations:validations.length,predecessors:predecessors.length,units:units.length,events:events.length,errors:errors.length});\n'
                    "  const runtimeMemory=stage==='RUNTIME'?require("+json.dumps(str(BIN/'native-node-budget.js'))+
                    ').observeRuntime(memoryCounts()):null;')
                observe_change('console.log(JSON.stringify(row));};',
                    'console.log(JSON.stringify(row));if(runtimeMemory)runtimeMemory.event(name,details.index,memoryCounts());};')
                observe_change('selector,event,failure,state,metadata,',
                    'selector,event,closeRuntimeMemory:()=>runtimeMemory?.close(memoryCounts()),'
                    'beforeRuntimeExport:()=>runtimeMemory?.beforeExport(memoryCounts()),'
                    'runtimeMemoryExported:()=>runtimeMemory?.exportCompleted(),failure,state,metadata,')
            elif template['relative']=='native-end-preparation/measure-runtime.js':
                observe_change("  const result=require('./assess-runtime').assess(",
                    "  obs.beforeRuntimeExport();\n  const result=require('./assess-runtime').assess(")
                observe_change("obs.io.save('RUNTIME_RESULT.SAFE.json',result);",
                    "obs.io.save('RUNTIME_RESULT.SAFE.json',result);obs.runtimeMemoryExported();")
                observe_change('  const result={...obs.metadata(),pass:false,failure:obs.failure(error),responses,providerPhases,',
                    "  const primaryFailure=obs.failure(error);process.exitCode=1;\n"
                    "  process.stderr.write(JSON.stringify({failed:true,...primaryFailure})+'\\n');\n"
                    '  obs.beforeRuntimeExport();\n'
                    '  const result={...obs.metadata(),pass:false,failure:primaryFailure,responses,providerPhases,')
                observe_change("obs.io.save('RUNTIME_FAILURE.SAFE.json',result);process.stderr.write(JSON.stringify({failed:true,...obs.failure(error)})+'\\n');process.exitCode=1;",
                    "obs.io.save('RUNTIME_FAILURE.SAFE.json',result);obs.runtimeMemoryExported();")
                observe_change('\n});\n',
                    '\n}).finally(()=>{try{obs.closeRuntimeMemory();}'
                    "catch{process.exitCode=1;process.stderr.write('LOCAL_RUNTIME_MEMORY_CLOSE_FAILED\\n');}});")
        if template['relative']=='native-end-preparation/prepare-current-local-runtime.js':
            old="Date.parse(day+'T23:59:59.999Z'),berlinEnd)"
            new="Date.parse(day+'T23:59:59.999Z'),"+('' if calendar else 'berlinEnd,')+"Date.parse(ACTION.reviewedDayWindowEndUTC))"
            if text.count(old)!=1:raise RuntimeError('exact original window expression required')
            text=text.replace(old,new);changes.append({'from':old,'to':new,'count':1})
        if template['relative']=='native-end-preparation/runtime-candidates/start-services.candidate.js':
            old="H.assert(/^172\\.(?:\\d{1,3}\\.){2}\\d{1,3}$/.test(ips[0]));"
            # Preserve this guard unchanged: the private Docker bridge uses172/8.
            if text.count(old)!=1:raise RuntimeError('original internal-address guard missing')
        if template['relative']=='assemble-after-activation.js':
            old="const initialSourceBinding=require(R+'/lib/helmut/synthetik-500-content-runner').sourceBinding()"
            if text.count(old)!=1:raise RuntimeError('original assembly source binding missing')
        if template['relative']=='native-end-preparation/local-provider.js':
            old="      const deliver=()=>{"
            new="      record.mockResponsePayloadBytes=Buffer.byteLength(response);record.mockResponseDelivered=false;\n      const deliver=()=>{"
            if text.count(old)!=1:raise RuntimeError('original mock response observation point missing')
            text=text.replace(old,new);changes.append({'from':old,'to':new,'count':1})
            old="const reply=new EventEmitter();reply.statusCode=200;"
            new="record.mockResponseDelivered=true;const reply=new EventEmitter();reply.statusCode=200;"
            if text.count(old)!=1:raise RuntimeError('original mock delivery point missing')
            text=text.replace(old,new);changes.append({'from':old,'to':new,'count':1})
        if restored is not None:
            def migrate(old,new):
                nonlocal text
                if text.count(old)!=1:raise RuntimeError('exact restored staging integration point missing: '+template['relative'])
                text=text.replace(old,new);changes.append({'from':old,'to':new,'count':1})
            if template['relative']=='assemble-after-activation.js':
                for old,key in [("B+'/wave9/native-fixture/postgrest.PRIVATE.conf'",'sourcePostgrestConfig'),
                                ("B+'/wave2/db_proof_path/jwt-secret.PRIVATE.txt'",'jwtSecret')]:
                    migrate(old,json.dumps(restored[key]['path']))
                if 'executionEnvironment'in restored:
                    migrate("B+'/wave8/native-fixture/EXECUTION_ENV.PRIVATE.json'",json.dumps(restored['executionEnvironment']['path']))
            if template['relative']=='native-end-preparation/runtime-candidates/start-services.candidate.js':
                migrate("H.assert.equal(r.sourcePostgrestConfig.sha256,'aa4acc62bed10bb23e07a041955ec5ae75b267f5c5d0f620d3a9274107581136');",
                        'H.assert.equal(r.sourcePostgrestConfig.sha256,'+json.dumps(restored['sourcePostgrestConfig']['sha256'])+');')
        if atomic_usage_pin is not None:
            candidate=read_pin(atomic_usage_pin)
            if candidate.get('schema')!='helmut-local-atomic-usage-resource-input/1' or candidate.get('mode')!='relational-atomic-v1' or candidate.get('production')is not False:
                raise RuntimeError('exact local atomic usage descriptor required')
            for p in candidate['sourcePins']:
                if pin(p['path'])!=p:raise RuntimeError('atomic usage source drift')
            helper=json.dumps(str(BIN/'atomic-usage-integration.js'))
            descriptor=json.dumps(atomic_usage_pin,separators=(',',':'))
            state_mode=candidate.get('stateStorage')
            if state_mode not in (None,'merkle-auth-v1'):raise RuntimeError('unknown local auth state storage')
            history_mode=candidate.get('historyReadReuse')
            if history_mode is not None and (history_mode!='verified-history-reuse-v1' or state_mode!='merkle-auth-v1'):
                raise RuntimeError('unknown or unbound local history reuse mode')
            control_mode=candidate.get('controlRead')
            if control_mode is not None and (control_mode!='verified-control-view-v1' or state_mode!='merkle-auth-v1'
                    or history_mode!='verified-history-reuse-v1'):
                raise RuntimeError('unknown or unbound local control read mode')
            bounded_mode=candidate.get('boundedRead')
            if bounded_mode is not None and (bounded_mode!='bounded-native-read-v1' or control_mode!='verified-control-view-v1'):
                raise RuntimeError('unknown or unbound bounded native reader')
            sender_mode=candidate.get('senderClaimRead')
            if sender_mode is not None and (sender_mode!='verified-control-claim-v1' or bounded_mode!='bounded-native-read-v1'):
                raise RuntimeError('unknown or unbound sender control claim reader')
            lease=candidate.get('pipelineLockLease')
            if lease is not None and (not isinstance(lease,dict)or set(lease)!={'mode','acceptancePin'}
                    or lease['mode']!='invocation-lease-v1' or control_mode!='verified-control-view-v1'
                    or not candidate.get('localSourceDeltaPin')):
                raise RuntimeError('unknown or unbound local pipeline lease mode')
            lease_helper=json.dumps(str(BIN/'pipeline-lock-lease-integration.js'))
            lease_check=('const pipelineLeaseCatalog=read(require('+lease_helper+').catalogSQL());require('
                         +lease_helper+').assertCatalog(pipelineLeaseCatalog);assert.equal(pipelineLeaseCatalog.database,target.database);' if lease else '')
            catalog_options=',{boundedRead:'+json.dumps(bounded_mode)+'}' if bounded_mode else ''
            state_options=',{stateStorage:'+json.dumps(state_mode)+'}' if state_mode else ''
            def change(old,new):
                nonlocal text
                if text.count(old)!=1:raise RuntimeError('exact atomic usage integration point missing: '+template['relative'])
                text=text.replace(old,new);changes.append({'from':old,'to':new,'count':1})
            relative=template['relative']
            if relative=='native-end-preparation/root-io-bridge.js':
                change('  const memory=[];', '  require('+helper+').readDescriptor('+descriptor+');\n  const memory=[];')
                change('  function sql(query) {', '  function sql(query) {\n    query=require('+helper+').projectQuery(query'+state_options+');')
                change("    assert.equal(env.HELMUT_SUPABASE_AUTH_STORE_ID,'main-auth');",
                    '    assert.deepEqual(config.atomicUsageInput,'+descriptor+');Object.assign(env,require('+helper+').environment(env,config.atomicUsageInput));\n'
                    '    const receipt=G.json(config.atomicUsageReceipt);assert.equal(receipt.pass,true);assert.equal(receipt.targetDatabase,target.database);\n'
                    '    assert.deepEqual(receipt.candidatePin,config.atomicUsageInput);assert.equal(receipt.originalPhysicalHash,receipt.proof.originalHash);\n'
                    '    const catalog=read(require('+helper+').catalogSQL());require('+helper+').assertCatalog(catalog'+catalog_options+');\n'
                    +('    const stateCatalog=read(require('+helper+').stateCatalogSQL());require('+helper+').assertStateCatalog(stateCatalog'+catalog_options+');\n' if state_mode else '')+
                    ('    assert.equal(receipt.boundedReadReceipt?.mode,"bounded-native-read-v1");assert.equal(receipt.boundedReadReceipt.originalLogicalStatePreserved,true);\n' if bounded_mode else '')+
                    ('    assert.equal(receipt.pipelineLockLeaseReceipt?.mode,"invocation-lease-v1");assert.deepEqual(receipt.pipelineLockLeaseReceipt.acceptancePin,'+json.dumps(lease['acceptancePin'],separators=(',',':'))+');assert.equal(receipt.pipelineLockLeaseReceipt.originalStatePreserved,true);'+lease_check+'\n' if lease else '')+
                    '    const bound=read("SELECT "+require('+helper+').physicalWitnessExpression('+state_options[1:]+')+";");\n'
                    '    assert.equal(bound.proof.generation,receipt.proof.generation);assert.equal(bound.proof.originalHash,receipt.proof.originalHash);\n'
                    +('    assert(receipt.stateReceipt?.originalLogicalStatePreserved);assert.equal(bound.state.generation,receipt.stateReceipt.state.generation);assert.equal(bound.state.originalHash,receipt.stateReceipt.state.originalHash);\n' if state_mode else '')+
                    "    assert.equal(env.HELMUT_SUPABASE_AUTH_STORE_ID,'main-auth');")
                if lease:
                    # Baseline and final state are actual reads of the owned DB.
                    # Successful full-run acceptance cannot omit the empty final
                    # lease table or silently select an incompatible catalog.
                    change('  function readState(selector) {','  function readState(selector) {\n    '+lease_check)
                    change('  function readAllFinalEvidence(selector,count) {','  function readAllFinalEvidence(selector,count) {\n    '+lease_check)
                change("'authRevision',data->'_authStoreRevision','journal'",
                    "'nativeUsageBinding',\"+require("+helper+").physicalWitnessExpression("+state_options[1:]+")+\",'authRevision',data->'_authStoreRevision','journal'")
                if sender_mode:
                    # Only the extra sender observation changes. Baseline/final
                    # readState, native witnesses and all provider asserts stay.
                    start=text.index('  function readSenderClaim(selector,index,phase,body) {')
                    end=text.index('  function readAllFinalEvidence(',start)
                    change(text[start:end],
                        '  const readSenderClaim=require('+json.dumps(str(BIN/'sender-control-claim.js'))+').create({descriptorPin:'
                        +descriptor+',readControl:()=>require('+json.dumps(str(REPO/'lib/helmut/storage.js'))
                        +').readSynthetik500ControlStore()});\n')
            elif relative=='native-end-preparation/runtime-candidates/prepare-materials.candidate.js':
                change('  Object.assign(env,localBudgets);',
                    "  Object.assign(env,localBudgets);Object.assign(env,require("+helper+").environment(env,"+descriptor+"));")
            elif relative=='native-end-preparation/runtime-candidates/root-authority-stage.candidate.js':
                change("['HELMUT_PUBLICATION_ELIGIBILITY_JSON','HELMUT_SYNTHETIK500_CONTENT_PUBLIC_KEY']",
                    "['HELMUT_PUBLICATION_ELIGIBILITY_JSON','HELMUT_SYNTHETIK500_CONTENT_PUBLIC_KEY','HELMUT_LLM_USAGE_STORAGE','HELMUT_LOCAL_PIPELINE_LOCK_MODE','HELMUT_ATOMIC_LOCK'"+(",'HELMUT_AUTH_STATE_STORAGE'" if state_mode else '')+(",'HELMUT_AUTH_HISTORY_READ_REUSE'" if history_mode else '')+(",'HELMUT_AUTH_CONTROL_READ'" if control_mode else '')+(",'HELMUT_LOCAL_RESOURCE_CALENDAR_JSON'" if calendar else '')+"]")
            elif relative=='native-end-preparation/runtime-candidates/assemble-config.candidate.js':
                change('const config={...base,',
                    'const config={...base,atomicUsageInput:r.atomicUsageInput,atomicUsageReceipt:r.atomicUsageReceipt,')
            elif relative=='native-end-preparation/observe-app.js' and bounded_mode:
                # Observation only; the original Error is rethrown unchanged.
                # Additional cause fields are bounded and redact unknown text.
                change("  const failure=error=>({name:error?.name||null,code:error?.code||null,message:String(error?.message||'unknown').slice(0,240)});",
                    '  const failure=require('+json.dumps(str(BIN/'runtime-failure-receipt.js'))+').failure;')
                if lease:
                    # Only the explicitly admitted new lease case changes its
                    # observer. Original templates and native writer stay intact.
                    begin='  const originalMutate=storage.mutateAuthStore;\n'
                    end='  const expired=J.expiredUnclaimedPredecessor;'
                    if text.count(begin)!=1 or text.count(end)!=1:
                        raise RuntimeError('exact original CAS observer block required')
                    block=text[text.index(begin):text.index(end)]
                    if block.count('units.push(')!=1 or block.count('const finish=J.finish;')!=1:
                        raise RuntimeError('complete original CAS observer block required')
                    change(block,'  const casObserver=require('+json.dumps(str(BIN/'cas-unit-observer.js'))+
                        ').install({storage,J,mutations,units,event,failure});\n')
                    change('mutation:activeMutation?.index??null','mutation:casObserver.currentMutation()?.index??null')
                    change('let activeMutation=null,blockedExternalHTTPSAttempts=0;',
                        'let blockedExternalHTTPSAttempts=0;')
            elif relative=='assemble-after-activation.js':
                change(' const initialSourceBinding=',
                    " Object.assign(process.env,require("+helper+").environment(process.env,"+descriptor+"));\n const initialSourceBinding=")
                if calendar:
                    change('briefingDatum:runtime.start','briefingDatum:'+json.dumps(calendar['sourceViewAtUTC']))
                if bounded_mode:
                    # Exact same pinned500-row bytes and every original value.
                    # Only the explicitly admitted local candidate uses bounded
                    # decoding and immutable sharing; no source projection.
                    change('const rawRows=read('+repr(day_rows_pin['path'])+')',
                        'const rawRows=require('+json.dumps(str(BIN/'bounded-profile-rows.js'))+').readRows('
                        +json.dumps(day_rows_pin,separators=(',',':'))+')')
                change(' const shared={status:',
                    " const atomicUsageReceipt=pin(N+'/ATOMIC_USAGE_BOOTSTRAP.SAFE.json');\n const shared={atomicUsageInput:"+descriptor+",atomicUsageReceipt,status:")
            elif relative=='native-end-preparation/local-provider.js':
                if calendar:
                    # Load BEFORE the first hook so the helper captures native https.
                    change('function install(',"const localCalendar=require("+json.dumps(str(REPO/'lib/helmut/synthetik-500-local-calendar.js'))+");\nfunction install(")
                    change('  return{count:', '  localCalendar.registerLocalMockTransport(https.request);\n  return{count:')
                if sender_mode:
                    # Count the awaited observation inside the original sender
                    # interval. Cancellation settles once, including pre-timer
                    # cancellation; original Error identity is emitted once.
                    change('let destroyed=false,timer;', 'let destroyed=false,timer,ended=false,settled=false,errorSent=false;\n'
                        '    const settle=()=>{if(!settled){settled=true;pending--;}};\n'
                        "    const report=error=>{if(!errorSent){errorSent=true;queueMicrotask(()=>request.emit('error',error));}};")
                    change("request.destroy=error=>{destroyed=true;if(timer)clearTimeout(timer);if(error)queueMicrotask(()=>request.emit('error',error));return request;};",
                        'request.destroy=error=>{if(destroyed)return request;destroyed=true;if(timer)clearTimeout(timer);'
                        'if(ended)settle();if(error)report(error);return request;};')
                    change('    request.end=()=>{', '    request.end=()=>{\n'
                        '      if(ended||destroyed)return request;ended=true;pending++;\n'
                        '      const execute=async()=>{')
                    change('const claim=readSenderClaim(selector,index,phase,body);',
                        'const claim=await readSenderClaim(selector,index,phase,body);\n      if(destroyed)return;')
                    change('providerPhases.push(record);pending++;', 'providerPhases.push(record);')
                    change('      const deliver=()=>{', '      const deliver=()=>{\n        if(destroyed){settle();return;}')
                    change('pending--;if(destroyed)return;', 'settle();if(destroyed)return;')
                    change('    }; return request;',
                        '      };\n      void execute().catch(error=>{if(destroyed)return;destroyed=true;'
                        'if(timer)clearTimeout(timer);settle();report(error);});\n'
                        '      return request;\n    }; return request;')
            elif relative=='native-end-preparation/contracts.js':
                if calendar:
                    change("  assert.equal(berlin(times[1]),berlin(times[2]),'No Berlin day crossing');",
                        '  assert(times[1]>=Date.parse('+json.dumps(calendar['startsAtUTC'])+')'
                        '&&times[2]<=Date.parse('+json.dumps(calendar['endsAtUTC'])+'),"Exact accepted local UTC fixture window");')
                if bounded_mode:
                    change('function json(pin) { return JSON.parse(pinned(pin)); }',
                        'function json(pin) { if(pin.path==='+json.dumps(day_rows_pin['path'])+') {'
                        'assert.deepEqual(pin,'+json.dumps(day_rows_pin,separators=(',',':'))+');'
                        'return require('+json.dumps(str(BIN/'bounded-profile-rows.js'))+').readRows(pin);'
                        '} return JSON.parse(pinned(pin)); }')
        if backend is not None:
            def backend_change(old,new):
                nonlocal text
                if text.count(old)!=1:raise RuntimeError('exact optional supervised service integration point required: '+template['relative'])
                text=text.replace(old,new);changes.append({'from':old,'to':new,'count':1})
            if template['relative']=='native-end-preparation/runtime-candidates/start-services.candidate.js':
                begin='function start(file){';end='\nif(require.main===module)'
                if text.count(begin)!=1 or text.count(end)!=1:
                    raise RuntimeError('complete original local service start required')
                original_start=text[text.index(begin):text.index(end)]
                backend_change(original_start,'function start(file){return require('+json.dumps(str(BIN/'local-postgrest-services.js'))+
                    ').start({H,file,dirname:__dirname});}')
            elif template['relative']=='assemble-after-activation.js':
                backend_change(' const shared={',
                    ' const shared={localPostgrestBackendPlanPin:'+json.dumps(local_postgrest_backend_plan_pin,separators=(',',':'))+',')
                # Only the current-case generated secret signs the new app JWT.
                # Original template credentials remain retained provenance.
                old=('jwtSecret:pin('+json.dumps(restored['jwtSecret']['path'])+')' if restored
                    else "jwtSecret:pin(B+'/wave2/db_proof_path/jwt-secret.PRIVATE.txt')")
                backend_change(old,"jwtSecret:H.privateJSON(pin(N+'/runtime-candidates/generated-services/LOCAL_POSTGREST_SERVICES_STARTED.SAFE.json')).localJWTSecretPin")
        destination=case/template['relative']
        deltas.append({'original':{k:template[k] for k in ['path','bytes','sha256']},'destination':str(destination),'text':text,'replacements':changes})
    return deltas

def stage(case,*,target,container,operation,day_rows_pin,day_acceptance_pin,owner_go_pin,prepare_only=False,atomic_usage_pin=None,restore_staging_inputs=None,native_budget_runtime_pin=None,local_postgrest_backend_plan_pin=None):
    case=Path(case).resolve()
    restored=read_restored_staging_inputs(restore_staging_inputs,case)
    exact_case_binding(case,target,container,operation)
    if case.parent!=AREA or not re.fullmatch('attempt-[a-f0-9]{12}',case.name):raise RuntimeError('exact fresh local case directory required')
    if not re.fullmatch('helmut_resource_fixture_'+A.DATE_TAG+'_[a-f0-9]{12}',target):raise RuntimeError('new owned target required')
    if not re.fullmatch('helmut-meter-db-w20-[a-f0-9]{12}',container):raise RuntimeError('new owned container required')
    if not re.fullmatch('synthetik500-resources'+A.DAY[-2:]+'-[a-f0-9]{12}',operation):raise RuntimeError('new operation required')
    read_pin(day_rows_pin)
    day=read_pin(day_acceptance_pin)
    descriptor=read_pin(atomic_usage_pin) if atomic_usage_pin else None
    local=Calendar.admit(day,read_pin,descriptor=descriptor,operation=operation,rows_pin=day_rows_pin)
    if (local is None and day.get('status')!='ROOT_AND_INDEPENDENT_ACCEPTED_EXACT_CURRENT_DAY_TRANSFER') or day.get('day')!=A.DAY:raise RuntimeError('accepted exact current-day binding missing')
    if day.get('adoptedRowsPin')!=day_rows_pin:raise RuntimeError('accepted exact current inputs required')
    owner=read_pin(owner_go_pin)
    A.validate_owner(owner,{'caseDirectory':str(case),'targetDatabase':target,'operationId':operation,'sourceCapture':owner['sourceCapturePin'],'preparedWithoutGO':prepare_only,'sourceCommit':owner.get('sourceCommit'),'dayBindingAcceptance':day_acceptance_pin},planning=prepare_only)
    if owner.get('allowDispose') is not False:raise RuntimeError('explicit allowDispose=false required before staging')
    if owner.get('production') is not False or owner.get('syntheticProfiles')!=500 or owner.get('targetDatabase')!=target:
        raise RuntimeError('existing once GO exact new local binding required')
    budget=None
    if native_budget_runtime_pin is not None:
        spec=importlib.util.spec_from_file_location('staged_native_budget',BIN/'native-memory-budget.py')
        budget=importlib.util.module_from_spec(spec);spec.loader.exec_module(budget)
        budget.validate_runtime(read_pin(native_budget_runtime_pin))
    rendered=render_templates(case,target=target,container=container,operation=operation,day_rows_pin=day_rows_pin,owner_go_pin={'path':owner['finalOwnerGOPath']},atomic_usage_pin=atomic_usage_pin,restore_staging_inputs=restore_staging_inputs,native_memory_budget=budget.policy()if budget else None,local_postgrest_backend_plan_pin=local_postgrest_backend_plan_pin)
    case.mkdir(mode=0o700,exist_ok=False);n=case/'native-end-preparation';n.mkdir(mode=0o700);(n/'runtime-candidates').mkdir(mode=0o700)
    deltas=[]
    for item in rendered:
        destination=Path(item['destination']);save(destination,item['text'])
        deltas.append({'original':item['original'],'staged':pin(destination),'replacements':item['replacements']})
    original_action=json.loads((BASE/'wave15/native-end-preparation/LOCAL_ACTIVATION_ACTION.SAFE.json').read_text())
    action={**original_action,'container':container,'sourceDatabaseReadOnly':SOURCE,'onlyNewTargetDatabase':target,
      'newOperationId':operation,'reviewedDayWindowEndUTC':day['endsAtUTC'],
      'status':'AWAITING_NEW_RESOURCE_GO_NOT_AUTHORIZED'if prepare_only else'BOUND_EXISTING_UNUSED_ONE_TIME_LOCAL_RESOURCES_GO_ONLY','requiredGOConfirmation':
      'GO_LOCAL_ONLY_CREATE_'+target+'_AND_ACTIVATE_EXACTLY500_SYNTHETIC_ONCE','authorized':not prepare_only,
      'allowedLocalEffectsAfterGO':[str(x).replace('16Oct',A.DAY[-2:]+'Oct') for x in original_action['allowedLocalEffectsAfterGO']]}
    save(n/'LOCAL_ACTIVATION_ACTION.SAFE.json',action)
    plan={'schema':'helmut-exact-local500-connection/1','scope':'STAGED_NOT_EXECUTED','caseDirectory':str(case),
      'workflowDirectory':str(n),'sourceDatabase':SOURCE,'targetDatabase':target,'containerName':container,
      'operationId':operation,'day':A.DAY,'dayAcceptance':day_acceptance_pin,'dayRows':day_rows_pin,
      'ownerGOPath':owner_go_pin['path'],'ownerGOPin':owner_go_pin,'sourceCommit':owner.get('sourceCommit'),'executionOwnerGOPath':owner['finalOwnerGOPath'],'originalAction':pin(BASE/'wave15/native-end-preparation/LOCAL_ACTIVATION_ACTION.SAFE.json'),
      'action':pin(n/'LOCAL_ACTIVATION_ACTION.SAFE.json'),'templateDeltas':deltas,
      'freshSelectorComesFromPinnedActualAssembly':True,'full500RunStarted':False,'resourceGOConsumed':False,
      'engineModified':bool(local),'originalFilesModified':False,'production':False,'preparedWithoutGO':prepare_only}
    if atomic_usage_pin is not None:plan['atomicUsageInput']=atomic_usage_pin
    if local_postgrest_backend_plan_pin is not None:plan['localPostgrestBackendPlanPin']=local_postgrest_backend_plan_pin
    if restored is not None:plan['restoreStagingInputs']=restore_staging_inputs
    if budget is not None:plan.update(nativeMemoryBudget=budget.policy(),nativeBudgetRuntimePin=native_budget_runtime_pin)
    save(case/'STAGED_CONNECTION.SAFE.json',plan);return plan

if __name__=='__main__':
    raise SystemExit('IMPORT_ONLY_EXACT_ROOT_REVIEWED_STAGE_CALL_REQUIRED')
