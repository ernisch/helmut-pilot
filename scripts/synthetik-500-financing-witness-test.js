"use strict";
// Synthetic-only VM. Real pure validators; storage exposes only three readers.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto");
const EU=require("../lib/helmut/synthetik-500-eu-service-contract");
const C=require("../lib/helmut/synthetik-500-production-command"),K=require("../lib/helmut/testkosten-budget"),R=require("../lib/helmut/provider-runtime-attestation");
const SHA="a".repeat(40),HOST="synthetic-finance.vercel.app",BEARER="synthetic-finance-bearer-000000000000000000000000000";
const raw=fs.readFileSync(path.join(__dirname,"../lib/helmut/synthetik-500-financing-witness.js"),"utf8");
const nonce=raw.match(/operationNonce: "([a-f0-9-]+)"/)[1];
const source=raw.replace(/bearerSha256: "[a-f0-9]{64}"/,'bearerSha256: "'+crypto.createHash("sha256").update(BEARER).digest("hex")+'"').replace('expiresAtUTC: "2026-10-06T20:00:00.000Z"','expiresAtUTC: "2026-10-07T06:00:00.000Z"');
const zero=day=>({version:2,day,tarif:"azure-gpt5-mini-obergrenze-20260909",limit:6000000,spent:0,baseline:0,baselineCalls:0,manualCalls:0,manualUntil:null,calls:{},frozen:null});
function fixture(){const days={};for(let i=0;i<28;i++){const d=new Date(Date.UTC(2026,8,9+i)).toISOString().slice(0,10);days[d]=zero(d);}return {testKostenAuftrag:{version:4,id:"synthetic-finance-order",limit:20000000,abTag:"2026-09-25",externGebunden:6794258},testKostenTage:days,llmUsage:[],privateUsers:"never-export",secretKey:"never-export"};}
async function call(o={}){
 let reads=0,counters=0,backendChecks=0,clock=o.at||"2026-10-06T03:00:00.000Z";const day=clock.slice(0,10),auth=o.eu?require("./synthetik-500-eu-service-contract-test").fixture().read():fixture();o.edit?.(auth);
 const storage={llmDailyCallLimit:()=>o.raw??2416,llmUnderstandingReserve:()=>o.understanding??702,synthetik500ProductionBackend(){backendChecks++;if(o.badBackend)throw Error("private-failure");},async readAuthStore(args){assert.deepEqual(JSON.parse(JSON.stringify(args)),{strict:true});reads++;const a=structuredClone(auth);if(reads===2){o.afterEdit?.(a);if(o.afterTime)clock=o.afterTime;}return a;},async leseLlmTageszaehler(at){counters++;assert.equal(at.slice(0,10),day);return {ok:true,used:0,tag:day,...o.counter};}};
 const m={exports:{}};const deps={"./synthetik-500-production-command":C,"./testkosten-budget":K,"./provider-runtime-attestation":o.eu?{...R,operationAuthority:()=>({operationNonce:nonce,bearerSha256:crypto.createHash("sha256").update(BEARER).digest("hex"),expiresAtUTC:"2026-11-15T18:00:00.000Z"})}:R,"./storage":storage,
   "./mandatsklasse":require("../lib/helmut/mandatsklasse"),
   "./synthetik-500-eu-service-contract":require("../lib/helmut/synthetik-500-eu-service-contract")};
 vm.runInNewContext("(function(require,module,exports){"+source+"\n})",{Buffer,Date,process:{env:{}}})(name=>{assert(Object.hasOwn(deps,name));return deps[name];},m,m.exports);
 const req={method:o.method||"GET",headers:{authorization:"Bearer "+BEARER,"x-helmut-root-nonce":nonce,"x-helmut-root-admitted-at":clock,"x-helmut-root-deadline-at":new Date(Date.parse(clock)+1200000).toISOString(),"x-helmut-production-commit":SHA,"x-helmut-deployment-host":HOST,...o.headers}};
 const res={writeHead(code){this.code=code;},end(text){this.text=text;this.writableEnded=true;}};
 const env={VERCEL_ENV:"production",VERCEL_GIT_COMMIT_SHA:SHA,VERCEL_URL:HOST,HELMUT_TESTLAUF_KOMMUNIKATION:"gesperrt",...(o.eu?{HELMUT_SYNTHETIK500_EU_SERVICE_CONTRACT:EU.HASH,HELMUT_TESTLAUF_VORRANG_REAL:"200"}:{}),...o.env};
 await m.exports.handleRequest(req,res,new URL("https://"+HOST+"/api/cron/testnachweis-status"+(o.search||"?modus=synthetik500-finanzbindung")),{jsonHeaders:extra=>({"Cache-Control":"no-store",...extra}),env,now:()=>new Date(clock)});
 assert(!res.text.includes("never-export")&&!res.text.includes("private-failure")&&!res.text.includes(BEARER));
 return {code:res.code,json:JSON.parse(res.text),reads,counters,backendChecks,auth};
}
(async()=>{let groups=0;const good=await call();assert.equal(good.code,200);assert.equal(good.reads,2);assert.equal(good.counters,1);assert.equal(good.json.booksHash,C.booksHash(good.auth));assert.equal(good.json.controlHash,C.controlHash(good.auth));assert.equal(good.json.orderBoundMicroUsd,6794258);assert.equal(good.json.orderLimitMicroUsd,20000000);assert.equal(good.json.dayLimitMicroUsd,6000000);assert.equal(good.json.actual500Ready,false);assert(!Object.hasOwn(good.json,"privateUsers"));groups++;
 for(const o of [{method:"POST"},{search:"?modus=synthetik500-finanzbindung&x=1"},{headers:{authorization:"bad"}},{headers:{"content-length":"1"}},{headers:{"transfer-encoding":"chunked"}},{env:{VERCEL_ENV:"preview"}},{env:{HELMUT_TESTLAUF_KOMMUNIKATION:"offen"}},{headers:{"x-helmut-production-commit":"b".repeat(40)}},{headers:{"x-helmut-deployment-host":"other.vercel.app"}},{headers:{"x-helmut-root-nonce":"bad"}}]){const r=await call(o);assert.notEqual(r.code,200);assert.equal(r.backendChecks,0);assert.equal(r.reads,0);assert.equal(r.counters,0);}groups++;
 for(const o of [{badBackend:true},{counter:{ok:false}},{counter:{used:1}},{counter:{tag:"2026-10-05"}},{edit:a=>a.testKostenAuftrag.limit=7000000},{edit:a=>delete a.testKostenTage["2026-10-06"]},{edit:a=>a.testKostenTage["2026-10-06"].frozen="test-usd-fremde-sperre"},{afterEdit:a=>a.testKostenAuftrag.externGebunden++},{afterEdit:a=>a.synthetik500KostenAdmission={changed:true}},{afterTime:"2026-10-06T03:01:00.001Z"},{afterTime:"2026-10-06T02:59:59.999Z"},{at:"2026-10-06T23:50:00.000Z",afterTime:"2026-10-07T00:00:00.000Z"}]){const r=await call(o);assert.notEqual(r.code,200);}groups++;
 assert.equal((await call({headers:{"content-length":"0"}})).code,200);groups++;
 const eu=await call({eu:true,at:"2026-10-12T10:00:00.000Z"});assert.equal(eu.code,200);assert.equal(eu.json.serviceContractHash,EU.HASH);assert.equal(eu.json.dayLimitMicroUsd,82036000);assert.equal(eu.json.orderLimitMicroUsd,88845364);assert.equal(eu.json.dayBoundMicroUsd,636000);assert.equal(eu.json.orderBoundMicroUsd,7445364);assert.deepEqual(eu.json.globalPolicy,{raw:2416,understanding:702,realPriority:200,syntheticDR:1714,used:0});groups++;
 for(const x of [{raw:2415},{understanding:703},{env:{HELMUT_TESTLAUF_VORRANG_REAL:"201"}},{counter:{used:715}},{edit:a=>a.testKostenAuftrag.externGebunden++}])assert.notEqual((await call({eu:true,at:"2026-10-12T10:00:00.000Z",...x})).code,200);groups++;
 const expired=await call({eu:true,at:"2026-10-27T10:00:00.000Z"});
 assert.equal(expired.code,409);assert.deepEqual(expired.json.blockers,["order-window-expired","current-daybook-missing","daybook-capacity-exhausted"]);
 assert.equal(expired.json.actual500Ready,false);assert.equal(expired.json.paidTestGo,false);groups++;
 const renew=a=>require("./synthetik-500-order-renewal-test").renewed(a,"2026-10-27");
 const renewed=await call({eu:true,at:"2026-10-27T10:00:00.000Z",edit:renew,env:{HELMUT_SYNTHETIK500_EU_ORDER_RENEWAL:EU.ORDER_RENEWAL_HASH}});
 assert.equal(renewed.code,200);assert.equal(renewed.json.orderRenewalHash,EU.ORDER_RENEWAL_HASH);
 assert.equal(renewed.json.orderLimitMicroUsd,88845364);assert.equal(renewed.json.actual500Ready,false);assert.equal(renewed.json.paidTestGo,false);groups++;
 const noRenewalEnv=await call({eu:true,at:"2026-10-27T10:00:00.000Z",edit:renew});
 assert.equal(noRenewalEnv.code,409);assert.deepEqual(noRenewalEnv.json.blockers,["order-renewal-runtime-unbound"]);
 for(const edit of [a=>{renew(a);delete a.testKostenTage["2026-10-20"];},a=>{renew(a);a.testKostenAuftrag.orderRenewalHash="0".repeat(64);}])
   assert.equal((await call({eu:true,at:"2026-10-27T10:00:00.000Z",edit,env:{HELMUT_SYNTHETIK500_EU_ORDER_RENEWAL:EU.ORDER_RENEWAL_HASH}})).code,409);
 groups++;
 console.log("PASS financing witness: "+groups+" targeted groups; real pure hash/budget/verifier; zero real effects");
})().catch(e=>{console.error(e);process.exitCode=1;});
