'use strict';
// ONLY transport: actual staged proxy source + native PostgREST, zero profiles.
// Its activation-admission dependency is explicitly stubbed in an isolated VM;
// this is never a positive Helmut admission/GO/safety-control witness.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http'),
 assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const scope='TRANSPORT_TEST_ONLY_NO_OWNER_GO_OR_ACTIVATION';
const save=(p,v)=>fs.writeFileSync(p,JSON.stringify(v)+'\n',{flag:'wx',mode:0o600});
function request(url,token){return new Promise((resolve,reject)=>{
 const r=http.request(url,{agent:false,headers:{Authorization:'Bearer '+token}},res=>{
  const b=[];res.on('data',x=>b.push(Buffer.from(x)));res.on('end',()=>resolve({status:res.statusCode,bytes:Buffer.concat(b),complete:res.complete}));res.on('error',reject);
 });r.setTimeout(5000,()=>r.destroy(Error('LOCAL_PROBE_TIMEOUT')));r.on('error',reject);r.end();
});}
async function main(){
 const file=process.argv[2],cfg=JSON.parse(fs.readFileSync(file));assert.equal(cfg.scope,scope);
 assert(/^helmut_resource_fixture_20261017_[a-f0-9]{12}$/.test(cfg.database));
 assert(/^172\.(?:\d{1,3}\.){2}\d{1,3}$/.test(cfg.containerIP));assert.equal(cfg.port,38414);
 const source=fs.readFileSync(cfg.gatewaySourcePin.path);assert.equal(source.length,cfg.gatewaySourcePin.bytes);assert.equal(sha(source),cfg.gatewaySourcePin.sha256);
 const out='/meter-output/gateway-probe';fs.mkdirSync(out,{mode:0o700});fs.mkdirSync(out+'/runtime-candidates');fs.mkdirSync(out+'/runtime-candidates/generated-services');
 let onStop,exitResolve,readyResolve,admissionStubCalls=0;
 const exited=new Promise(resolve=>exitResolve=resolve),ready=new Promise(resolve=>readyResolve=resolve);
 const H={path,fs,assert,OUT:out,TARGET:cfg.database,
  pin(p){const b=fs.readFileSync(p);return{path:p,bytes:b.length,sha256:sha(b)};},
  privateJSON(p){const b=fs.readFileSync(p.path);assert.equal(b.length,p.bytes);assert.equal(sha(b),p.sha256);return JSON.parse(b);},
  activated(p){assert.equal(p.scope,scope);admissionStubCalls++;},
  save(p,v){save(p,v);readyResolve(v);}};
 const mod={exports:{}},localRequire=name=>{
  if(name==='./common')return H;if(name==='node:http')return http;throw Error('UNEXPECTED_PROBE_DEPENDENCY');
 };
 vm.runInNewContext(source.toString(),{require:localRequire,module:mod,exports:mod.exports,
  process:{pid:process.pid,on(event,handler){assert.equal(event,'SIGTERM');onStop=handler;},exit(code){assert.equal(code,0);exitResolve();}}},
  {filename:cfg.gatewaySourcePin.path,timeout:1000});
 mod.exports.start(file);
 let timer;const bounded=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('PROBE_BOUNDED_WAIT')),ms);})]).finally(()=>clearTimeout(timer));
 const gateway=await bounded(ready,15000);assert.equal(new URL(gateway.url).hostname,'127.0.0.1');
 assert.equal(gateway.database,cfg.database);assert.equal(admissionStubCalls,1);
 const token=fs.readFileSync(cfg.tokenFile,'utf8').trim(),url=gateway.url+'/rest/v1/meter_connection_probe?select=id&order=id';
 try{
  const positive=await request(url,token);assert.equal(positive.status,200);assert(positive.complete);assert.deepEqual(JSON.parse(positive.bytes),[{id:1},{id:2}]);
  const negative=await request(url,'INVALID_LOCAL_JWT_NEVER_PRODUCTION');assert.equal(negative.status,401);assert(negative.complete);
  const result={pass:true,scope,statuses:[positive.status,negative.status],replyBytes:[positive.bytes.length,negative.bytes.length],
   originalGatewaySourceSHA256:cfg.gatewaySourcePin.sha256,activationGuardStubbedForTransportOnly:true,
   notHelmutAdmissionOrActivationEvidence:true,profilesCreated:0,full500Runs:0,resourceGOConsumed:false,production:false};
  save('/meter-output/CONNECTION_SMOKE.SAFE.json',result);console.log(JSON.stringify(result));
 }finally{assert.equal(typeof onStop,'function');onStop();await bounded(exited,5000);}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({connectionSmokeFailed:true,errorType:e.name,code:e.code||null,
 location:String(e.stack||'').split('\n').find(x=>/^\s+at /.test(x))?.trim()||null,noSecretsEmitted:true}));process.exitCode=1;});
