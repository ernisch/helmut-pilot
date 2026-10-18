#!/usr/bin/env python3
"""Pure staged-code/descriptor tests. No resources, GO, activation or DB."""
import hashlib,importlib.util,json,subprocess,tempfile,unittest
from pathlib import Path

BIN=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('atomic_staging_connector',BIN/'connect-local500.py')
C=importlib.util.module_from_spec(spec);spec.loader.exec_module(C)

class AtomicIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.descriptor=self.root/'candidate.json'
        value=subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require(process.argv[1]).descriptor()))",str(BIN/'atomic-usage-integration.js')],text=True)
        self.descriptor.write_text(value);self.p=C.pin(self.descriptor)
        self.case=C.AREA/'attempt-0123456789ab';self.assertFalse(self.case.exists())
        self.args=dict(target='helmut_resource_fixture_20261018_0123456789ab',container='helmut-meter-db-w20-0123456789ab',
          operation='synthetik500-resources18-0123456789ab',day_rows_pin={'path':str(C.BASE/'wave13/NORMALIZED500_CURRENT_POLICY.PRIVATE.json')},
          owner_go_pin={'path':str(self.root/'NEVER_CREATED_OWNER_GO_V5')})
    def test_all26_consumers_replay_and_parse_without_running(self):
        plain=C.render_templates(self.case,**self.args)
        changed=C.render_templates(self.case,**self.args,atomic_usage_pin=self.p)
        self.assertEqual(len(plain),26);self.assertEqual(len(changed),26)
        modified={Path(a['destination']).relative_to(self.case).as_posix()for a,b in zip(changed,plain)if a['text']!=b['text']}
        self.assertEqual(modified,{'native-end-preparation/root-io-bridge.js','native-end-preparation/runtime-candidates/prepare-materials.candidate.js',
          'native-end-preparation/runtime-candidates/root-authority-stage.candidate.js','native-end-preparation/runtime-candidates/assemble-config.candidate.js','assemble-after-activation.js'})
        for row in changed:
            text=Path(row['original']['path']).read_text()
            for delta in row['replacements']:
                self.assertEqual(text.count(delta['from']),delta['count']);text=text.replace(delta['from'],delta['to'])
            self.assertEqual(text,row['text'])
            self.assertEqual(C.pin(row['original']['path']),row['original'])
        source=[a['text']for a in changed if a['destination'].endswith('.js')]
        command="const vm=require('vm'),fs=require('fs');for(const s of JSON.parse(fs.readFileSync(0,'utf8')))new vm.Script(s);"
        subprocess.run(['node','-e',command],input=json.dumps(source),text=True,check=True,capture_output=True)
        self.assertFalse(self.case.exists());self.assertFalse(Path(self.args['owner_go_pin']['path']).exists())
    def test_descriptor_drift_cannot_enter_renderer(self):
        d=json.loads(self.descriptor.read_text());d['sourcePins'][0]['sha256']='0'*64;self.descriptor.write_text(json.dumps(d))
        with self.assertRaisesRegex(RuntimeError,'source drift'):C.render_templates(self.case,**self.args,atomic_usage_pin=C.pin(self.descriptor))
    def test_scope_cannot_be_promoted_to_production(self):
        d=json.loads(self.descriptor.read_text());d['production']=True;self.descriptor.write_text(json.dumps(d))
        with self.assertRaisesRegex(RuntimeError,'local atomic'):C.render_templates(self.case,**self.args,atomic_usage_pin=C.pin(self.descriptor))
    def test_rendered_native_and_environment_paths_are_both_bound(self):
        rows=C.render_templates(self.case,**self.args,atomic_usage_pin=self.p)
        files={Path(r['destination']).relative_to(self.case).as_posix():r['text']for r in rows}
        bridge=files['native-end-preparation/root-io-bridge.js']
        self.assertIn('projectQuery(query)',bridge);self.assertIn('physicalWitnessExpression()',bridge)
        self.assertIn('assertCatalog(catalog)',bridge);self.assertIn('config.atomicUsageReceipt',bridge)
        self.assertIn("env.HELMUT_LLM_USAGE_STORAGE='relational-atomic-v1'",bridge)
        self.assertIn("'HELMUT_LLM_USAGE_STORAGE'",files['native-end-preparation/runtime-candidates/root-authority-stage.candidate.js'])
        self.assertIn('atomicUsageReceipt:r.atomicUsageReceipt',files['native-end-preparation/runtime-candidates/assemble-config.candidate.js'])
    def test_runtime_source_binding_changes_with_mode_and_actual_atomic_code(self):
        code=r"""
const fs=require('fs'),assert=require('assert/strict'),r=require('./lib/helmut/synthetik-500-content-runner');
delete process.env.HELMUT_LLM_USAGE_STORAGE;const base=r.sourceBinding();
process.env.HELMUT_LLM_USAGE_STORAGE='relational-atomic-v1';const atomic=r.sourceBinding();assert.notEqual(base,atomic);
const original=fs.readFileSync;fs.readFileSync=function(file,...rest){const b=original.call(this,file,...rest);return String(file).endsWith('/llm-usage-atomic.js')?Buffer.concat([b,Buffer.from('\n// in-memory drift only')]):b;};
try{assert.notEqual(r.sourceBinding(),atomic);}finally{fs.readFileSync=original;}
"""
        subprocess.run(['node','-e',code],cwd=C.REPO,check=True,capture_output=True,text=True)
    def test_actual_native_catalog_rejects_privilege_expression_and_guard_changes(self):
        code=r"""
const fs=require('fs'),assert=require('assert/strict'),AU=require('./scripts/helmut-resource-meter/atomic-usage-integration');
const c=JSON.parse(fs.readFileSync('./scripts/fixtures/helmut-atomic-usage-catalog.json')).catalog;AU.assertCatalog(c);
for(const mutate of [x=>x.functions.helmut_auth_usage_read_v1.definer=true,
 x=>x.functions.helmut_auth_usage_cas_v1.publicExecute=true,
 x=>x.functions.helmut_auth_usage_cas_v1.config=['search_path=public'],
 x=>x.generated.usage_record_hash.expression="encode(sha256('fake'::bytea),'hex')",
 x=>x.triggers.helmut_usage_record_immutable_local.table='public.other',
 x=>x.triggers.helmut_usage_auth_bound_local.state='D']){
 const bad=structuredClone(c);mutate(bad);assert.throws(()=>AU.assertCatalog(bad));
}
assert.throws(()=>AU.projectQuery('DELETE FROM helmut_store'));
"""
        subprocess.run(['node','-e',code],cwd=C.REPO,check=True,capture_output=True,text=True)
    def test_new_preconditions_reject_duplicate_ids_collisions_and_vercel_mode(self):
        code=r"""
const AU=require('./scripts/helmut-resource-meter/atomic-usage-integration'),assert=require('assert/strict');
const input={catalog:{serverVersion:'17.6',serverEncoding:'UTF8',clientEncoding:'UTF8',functions:null,generated:null,triggers:null},
 bindingColumns:0,stateArtifacts:{functions:0,table:false,sequence:false,bound:false},auth:{bound:false,historyType:'array',historyCount:5},historyRows:5,uniqueHistoryIDs:5,overlappingIDs:0};AU.assertSourceReady(input);
for(const delta of [{uniqueHistoryIDs:4},{overlappingIDs:1},{historyRows:4},{bindingColumns:1}])assert.throws(()=>AU.assertSourceReady({...input,...delta}));
const p=JSON.parse(process.argv[1]);assert.equal(AU.environment({},p).HELMUT_LLM_USAGE_STORAGE,AU.MODE);
for(const env of [{VERCEL:'1'},{HELMUT_LLM_USAGE_STORAGE:'other'},{HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY:'NOT_A_KEY'}])assert.throws(()=>AU.environment(env,p));
"""
        subprocess.run(['node','-e',code,json.dumps(self.p)],cwd=C.REPO,check=True,capture_output=True,text=True)

    def test_state_renderer_keeps_all26_sources_and_pins_state_native_paths(self):
        value=subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require(process.argv[1]).descriptor({stateStorage:'merkle-auth-v1'})))",str(BIN/'atomic-usage-integration.js')],text=True)
        self.descriptor.write_text(value);state_pin=C.pin(self.descriptor)
        rows=C.render_templates(self.case,**self.args,atomic_usage_pin=state_pin)
        self.assertEqual(len(rows),26)
        for row in rows:
            text=Path(row['original']['path']).read_text()
            for delta in row['replacements']:
                self.assertEqual(text.count(delta['from']),delta['count']);text=text.replace(delta['from'],delta['to'])
            self.assertEqual(text,row['text']);self.assertEqual(C.pin(row['original']['path']),row['original'])
        files={Path(r['destination']).relative_to(self.case).as_posix():r['text']for r in rows}
        bridge=files['native-end-preparation/root-io-bridge.js']
        self.assertIn('projectQuery(query,{stateStorage:"merkle-auth-v1"})',bridge)
        self.assertIn('physicalWitnessExpression({stateStorage:"merkle-auth-v1"})',bridge)
        self.assertIn('receipt.stateReceipt?.originalLogicalStatePreserved',bridge)
        self.assertIn("env.HELMUT_AUTH_STATE_STORAGE='merkle-auth-v1'",bridge)
        self.assertIn("'HELMUT_AUTH_STATE_STORAGE'",files['native-end-preparation/runtime-candidates/root-authority-stage.candidate.js'])
        self.assertIn("process.env.HELMUT_AUTH_STATE_STORAGE='merkle-auth-v1'",files['assemble-after-activation.js'])
        sources=[r['text']for r in rows if r['destination'].endswith('.js')]
        subprocess.run(['node','-e',"const vm=require('vm'),fs=require('fs');for(const s of JSON.parse(fs.readFileSync(0,'utf8')))new vm.Script(s);"],input=json.dumps(sources),text=True,check=True,capture_output=True)
        code=r"""
const AU=require('./scripts/helmut-resource-meter/atomic-usage-integration'),assert=require('assert/strict');
const p=JSON.parse(process.argv[1]),env=AU.environment({},p);assert.equal(env.HELMUT_AUTH_STATE_STORAGE,'merkle-auth-v1');
assert.match(AU.projectQuery("SELECT data FROM helmut_store",{stateStorage:'merkle-auth-v1'}),/helmut_auth_state_read_v1/);
assert.match(AU.projectQuery("WITH RECURSIVE x AS(SELECT 1)SELECT data FROM helmut_store",{stateStorage:'merkle-auth-v1'}),/^WITH RECURSIVE helmut_store/);
assert.match(AU.physicalWitnessExpression({stateStorage:'merkle-auth-v1'}),/'state',p.data->'_authStateRef'/);
assert.throws(()=>AU.environment({HELMUT_AUTH_STATE_STORAGE:'other'},p));
assert.throws(()=>AU.projectQuery('SELECT 1',{stateStorage:'unknown'}));
"""
        subprocess.run(['node','-e',code,json.dumps(state_pin)],cwd=C.REPO,check=True,capture_output=True,text=True)
        self.assertFalse(self.case.exists());self.assertFalse(Path(self.args['owner_go_pin']['path']).exists())
    def test_state_catalog_contract_rejects_native_security_drift(self):
        code=r"""
const fs=require('fs'),assert=require('assert/strict'),AU=require('./scripts/helmut-resource-meter/atomic-usage-integration');
const none=Object.fromEntries(['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'].map(k=>[k,false]));
const seqNone={USAGE:false,SELECT:false,UPDATE:false},field=(type,notNull,generated='',expression=null,identity='')=>({type,notNull,identity,generated,expression});
const c={serverVersion:'17.6',serverEncoding:'UTF8',clientEncoding:'UTF8',localGate:'on',functions:AU.stateFunctionSpecs(),functionCount:14,
 table:{kind:'r',owner:'postgres',rls:true,forceRls:false,publicPrivileges:false,service:{...none,SELECT:true,INSERT:true},anon:none,customer:none},
 sequence:{kind:'S',owner:'postgres',publicPrivileges:false,service:{...seqNone,USAGE:true},anon:seqNone,customer:seqNone},
 columns:{store_id:field('text',true),generation:field('text',true),payload:field('text',true),node_hash:field('text',true,'s','helmut_auth_state_payload_hash_local_v1(payload)'),body:field('jsonb',false,'s','(payload)::jsonb'),leaf_info:field('jsonb',false,'s','helmut_auth_state_leaf_info_local_v1(payload)'),children:field('text[]',false,'s','helmut_auth_state_children_local_v1(payload)'),node_seq:field('bigint',true,'',null,'a')},
 primaryKeys:[['store_id','generation','node_hash']],policies:{helmut_auth_state_nodes_service_local:{permissive:'PERMISSIVE',roles:['service_role'],command:'ALL',using:'true',check:'true'}},triggers:{}};
for(const [name,table,fn,type]of[['helmut_auth_state_nodes_immutable_local','helmut_auth_state_nodes_local','helmut_auth_state_nodes_guard_local_v1',31],['helmut_auth_state_nodes_no_truncate_local','helmut_auth_state_nodes_local','helmut_auth_state_nodes_guard_local_v1',34],['helmut_auth_state_root_bound_local','helmut_store','helmut_auth_state_auth_guard_local_v1',31],['helmut_auth_state_root_no_truncate_local','helmut_store','helmut_auth_state_auth_guard_local_v1',34]])c.triggers[name]={state:'A',table:'public.'+table,function:'public.'+fn,type,condition:null,arguments:0};
AU.assertStateCatalog(c);
for(const mutate of[x=>x.functions.helmut_auth_state_read_v1.hash='0'.repeat(64),x=>x.functions.helmut_auth_state_cas_v1.definer=true,
 x=>x.functions.helmut_auth_state_expand_local_v1.volatility='v',x=>x.functions.helmut_auth_state_bootstrap_v1.publicExecute=true,
 x=>x.functions.helmut_auth_state_restore_v1.customerExecute=true,x=>x.functions.helmut_auth_state_payload_hash_local_v1.config=['search_path=public'],
 x=>x.functionCount++,x=>x.table.rls=false,x=>x.table.service.UPDATE=true,x=>x.table.anon.INSERT=true,
 x=>x.sequence.publicPrivileges=true,x=>x.sequence.service.UPDATE=true,x=>x.columns.node_hash.expression="'fake'::text",
 x=>x.columns.node_hash.generated='',x=>x.columns.leaf_info.generated='',x=>x.columns.leaf_info.expression="'fake'::jsonb",x=>x.columns.node_seq.identity='',x=>x.primaryKeys=[['node_hash']],
 x=>x.policies.helmut_auth_state_nodes_service_local.roles=['public'],x=>x.triggers.helmut_auth_state_nodes_immutable_local.state='D',
 x=>x.triggers.helmut_auth_state_root_bound_local.function='public.other',x=>x.triggers.helmut_auth_state_root_no_truncate_local.type=32]){
 const bad=structuredClone(c);mutate(bad);assert.throws(()=>AU.assertStateCatalog(bad));}
const ready={catalog:{serverVersion:'17.6',serverEncoding:'UTF8',clientEncoding:'UTF8',functions:null,generated:null,triggers:null},bindingColumns:0,stateArtifacts:{functions:0,table:false,sequence:false,bound:false},auth:{bound:false,historyType:'array',historyCount:5},historyRows:5,uniqueHistoryIDs:5,overlappingIDs:0};AU.assertSourceReady(ready);
for(const delta of[{functions:1},{table:true},{sequence:true},{bound:true}])assert.throws(()=>AU.assertSourceReady({...ready,stateArtifacts:{...ready.stateArtifacts,...delta}}));
const sql=AU.stateCatalogSQL();assert.match(sql,/pg_proc/);assert.match(sql,/pg_policies/);assert.match(sql,/pg_trigger/);assert.match(sql,/pg_get_expr/);assert.match(sql,/has_sequence_privilege/);
"""
        subprocess.run(['node','-e',code],cwd=C.REPO,check=True,capture_output=True,text=True)

    def test_state_initial_source_binding_matches_real_assembly_mode_and_restores_environment(self):
        value=subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require(process.argv[1]).descriptor({stateStorage:'merkle-auth-v1'})))",str(BIN/'atomic-usage-integration.js')],text=True)
        self.descriptor.write_text(value);state_pin=C.pin(self.descriptor)
        code=r"""
const assert=require('assert/strict'),crypto=require('crypto');
const S=require('./scripts/helmut-resource-meter/start-input-checks');
const R=require('./lib/helmut/synthetik-500-content-runner'),p=JSON.parse(process.argv[1]);
const keys=['HELMUT_LLM_USAGE_STORAGE','HELMUT_AUTH_STATE_STORAGE'];
for(const k of keys)delete process.env[k];
const plain=R.sourceBinding();
process.env.HELMUT_LLM_USAGE_STORAGE='relational-atomic-v1';process.env.HELMUT_AUTH_STATE_STORAGE='merkle-auth-v1';
const expected=R.sourceBinding();assert.notEqual(expected,plain);
for(const k of keys)delete process.env[k];
assert.equal(S.actualSourceBinding({atomicUsageInput:p}),expected);
for(const k of keys)assert.equal(process.env[k],undefined);
const hash=crypto.createHash('sha256').update(expected).digest('hex');
S.initialSourceBinding({atomicUsageInput:p,expectedInitialSourceBindingSHA256:hash});
assert.throws(()=>S.initialSourceBinding({atomicUsageInput:p,expectedInitialSourceBindingSHA256:crypto.createHash('sha256').update(plain).digest('hex')}));
process.env.HELMUT_LLM_USAGE_STORAGE='caller-sentinel';
assert.equal(S.actualSourceBinding({atomicUsageInput:p}),expected);
assert.equal(process.env.HELMUT_LLM_USAGE_STORAGE,'caller-sentinel');assert.equal(process.env.HELMUT_AUTH_STATE_STORAGE,undefined);
const fs=require('fs'),real=fs.readFileSync;
try{fs.readFileSync=function(file,...args){
 if(String(file).endsWith('/synthetik-500-cpu-source-pins.json')&&process.env.HELMUT_AUTH_STATE_STORAGE==='merkle-auth-v1')throw Error('source-read-failure');
 return real.call(this,file,...args);
};assert.throws(()=>S.actualSourceBinding({atomicUsageInput:p}),/source-read-failure/);}
finally{fs.readFileSync=real;}
assert.equal(process.env.HELMUT_LLM_USAGE_STORAGE,'caller-sentinel');assert.equal(process.env.HELMUT_AUTH_STATE_STORAGE,undefined);
assert.throws(()=>S.actualSourceBinding({atomicUsageInput:{...p,sha256:'0'.repeat(64)}}));
assert.equal(process.env.HELMUT_LLM_USAGE_STORAGE,'caller-sentinel');assert.equal(process.env.HELMUT_AUTH_STATE_STORAGE,undefined);
"""
        result=subprocess.run(['node','-e',code,json.dumps(state_pin)],cwd=C.REPO,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

if __name__=='__main__':unittest.main()
