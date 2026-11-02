'use strict';
// Actual runtime functions with fictional private files. No key generation or DB.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const filename=path.resolve(__dirname,'../synthetik-500-w15-full500-runtime.js'),actual=createRequire(filename);
const D='mock500-materials-diagnostic-gated';
const diagGo={confirmation:'GO_ONE_ISOLATED_MATERIALS_DIAGNOSTIC_AND_RETURN_TO_ZERO',
 targetDatabase:'helmut_w15_full500_20261028b',maximumUnits:0,temporarySyntheticProfiles:500,
 paidModelsAllowed:false,productionAllowed:false,full500Allowed:false};
function runtime({diagnostic=true,go=diagGo,mode=D}={}){
 let keysGenerated=0;
 const mod={exports:{}},sandbox={module:mod,exports:mod.exports,__filename:filename,__dirname:path.dirname(filename),
  Buffer,console,process:{argv:['node',filename],getuid:()=>1000,env:{}},require(name){
   if(name==='node:fs')return {lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false,uid:1000,mode:0o100600}),
    readFileSync:p=>Buffer.from(JSON.stringify(path.basename(p)==='OWNER_GO.PRIVATE.json'?go:{commit:'a'.repeat(40)}))};
   if(name==='node:crypto')return {...actual(name),generateKeyPairSync(){keysGenerated++;throw Error('SYNTHETIC_SETUP_KEY_BOUNDARY_NO_KEY_CREATED')}};
   if(name==='./w15-github/mock500_bindings')return {...actual(name),readBound:()=>({materialsDiagnosticOnly:diagnostic,
    functionalResourceContract:{mode}})};
   return actual(name);
  }};
 vm.runInNewContext(fs.readFileSync(filename,'utf8')+'\nmodule.exports.probe={ownerGo,setup,main};guard=()=>{throw Error("SYNTHETIC_UNCHANGED_RUNTIME_GUARD_BOUNDARY")};',sandbox,{filename});
 return {probe:mod.exports.probe,keys:()=>keysGenerated};
}
(async()=>{
 const diag=runtime();assert.equal(diag.probe.ownerGo({materialsDiagnostic:true}).maximumUnits,0);
 await assert.rejects(diag.probe.setup(),/SYNTHETIC_SETUP_KEY_BOUNDARY_NO_KEY_CREATED/);
 assert.equal(diag.keys(),1); // callback entered, no real crypto called
 for(const action of ['prepare','run','atomic-check'])await assert.rejects(diag.probe.main(action),/w15-materials-diagnostic-runtime-action/);
 await assert.rejects(diag.probe.main('gateway'),/SYNTHETIC_UNCHANGED_RUNTIME_GUARD_BOUNDARY/);
 assert.throws(()=>diag.probe.ownerGo());
 assert.throws(()=>runtime({mode:'mock500-full-host-functional-gated'}).probe.ownerGo({materialsDiagnostic:true}));
 for(const change of [{maximumUnits:500},{full500Allowed:true},{paidModelsAllowed:true},{temporarySyntheticProfiles:0}])
  assert.throws(()=>runtime({go:{...diagGo,...change}}).probe.ownerGo({materialsDiagnostic:true}));
 const full={...diagGo,confirmation:'GO_EXACTLY_ONE_ISOLATED_W15_FULL500_MOCK_RUN_AND_RETURN_TO_ZERO',maximumUnits:500,full500Allowed:true};
 assert.equal(runtime({diagnostic:false,go:full}).probe.ownerGo().maximumUnits,500);
 assert.throws(()=>runtime({diagnostic:false,go:diagGo}).probe.ownerGo());
 console.log('PASS bounded diagnostic setup reaches existing key boundary; unit/run gates remain closed; full GO remains strict; no keys or DB created');
})().catch(error=>{console.error(error);process.exitCode=1;});
