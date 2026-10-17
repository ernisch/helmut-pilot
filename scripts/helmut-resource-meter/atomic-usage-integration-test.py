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
        self.args=dict(target='helmut_resource_fixture_20261017_0123456789ab',container='helmut-meter-db-w20-0123456789ab',
          operation='synthetik500-resources17-0123456789ab',day_rows_pin={'path':str(C.BASE/'wave13/NORMALIZED500_CURRENT_POLICY.PRIVATE.json')},
          owner_go_pin={'path':str(self.root/'NEVER_CREATED_OWNER_GO')})
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
 bindingColumns:0,auth:{bound:false,historyType:'array',historyCount:5},historyRows:5,uniqueHistoryIDs:5,overlappingIDs:0};AU.assertSourceReady(input);
for(const delta of [{uniqueHistoryIDs:4},{overlappingIDs:1},{historyRows:4},{bindingColumns:1}])assert.throws(()=>AU.assertSourceReady({...input,...delta}));
const p=JSON.parse(process.argv[1]);assert.equal(AU.environment({},p).HELMUT_LLM_USAGE_STORAGE,AU.MODE);
for(const env of [{VERCEL:'1'},{HELMUT_LLM_USAGE_STORAGE:'other'},{HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY:'NOT_A_KEY'}])assert.throws(()=>AU.environment(env,p));
"""
        subprocess.run(['node','-e',code,json.dumps(self.p)],cwd=C.REPO,check=True,capture_output=True,text=True)

if __name__=='__main__':unittest.main()
