"use strict";
// Keine Productionverbindung: echter Collector mit Fake-Responses und Testschluessel.
const A=require("node:assert/strict"),C=require("node:crypto"),F=require("node:fs"),G=require("./github-blocker2-readonly500"),T=require("./privater-nachweis-transport");
const S=require("../lib/helmut/synthetik-500-profile"),B=require("../lib/helmut/briefing-speicher"),target=S.erzeuge().profile[121];
const pair=C.generateKeyPairSync("rsa",{modulusLength:3072}),publicKey=pair.publicKey.export({format:"der",type:"spki"}).toString("base64"),key=pair.privateKey.export({format:"pem",type:"pkcs8"});
const env={GITHUB_REPOSITORY:"ernisch/helmut-pilot",GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"workflow_dispatch",GITHUB_RUN_ATTEMPT:"1",GITHUB_RUN_ID:"123456789",GITHUB_SHA:"a".repeat(40),HELMUT_PRODUCTION_COMMIT:"b".repeat(40),HELMUT_CRON_SECRET:"TEST_CRON_SECRET",HELMUT_NACHWEIS_PUBLIC_KEY:publicKey};
const tag="2026-10-08",fixed=new Date("2026-10-08T08:00:00Z"),context={runId:env.GITHUB_RUN_ID,commit:env.GITHUB_SHA,tag};
function payload(){const input={mandat:target.mandatsId,tag};return{art:"production-briefing-eingabe",productionCommit:env.HELMUT_PRODUCTION_COMMIT,reinLesend:true,schreibaufrufe:0,modellaufrufe:0,synthetisch:true,fachlicheFreigabe:false,funktionsnachweis500:false,all500InputAcceptance:false,transaktionalerSnapshot:false,
 profile:{id:target.mandatsId,profileActive:false,synthetisch:true,parlament:target.parlament,herkunft:{person:"vollstaendig-fiktiv",amtlicherPersonenbeleg:false},szenario:{variante:"basis-v1"},profilHash:"c".repeat(64),paketHash:"d".repeat(64)},result:{eingabe:{...input,eingabeHash:B.hash(input)},korrekturBasis:{kos:[]},briefing:{items:[{text:"PRIVATE_BODY"}]}}};}
function fixture(change){const files=new Map(),calls=[],checkpoints=[];const args={diagnose:true,env:{...env},now:()=>fixed,expectedRecipient:T.publicKey(publicKey).fingerprint,
 writeEnvelope:(n,e)=>{A(!files.has(n));files.set(n,e);},persistCheckpoint:r=>checkpoints.push(r),fetchFn:async(url,opt)=>{
  calls.push(url);A.equal(opt.method,"GET");A.equal(opt.redirect,"error");const u=new URL(url);A.equal(u.origin,"https://helmut-pilot.vercel.app");
  if(u.pathname==="/api/release/dip-resolver")return new Response(JSON.stringify({ok:true,commit:env.HELMUT_PRODUCTION_COMMIT,reinLesend:true,productionDataWrites:0,paidModelCalls:0,syntheticFixturesOnly:true,all500InputAcceptance:false}));
  A.equal(u.pathname,"/api/cron/briefing-nachweis");A.equal(u.searchParams.get("modus"),"eingabe");A.equal(u.searchParams.get("mandat"),"test-kohorte-synthetik-bt-122");A.equal(u.searchParams.get("tag"),tag);
  return change?change(payload()):new Response(JSON.stringify(payload()));}};return{args,files,calls,checkpoints};}
const decode=(e,pos=1)=>T.entschluesseln(e,key,{...context,abPosition:pos,anzahl:1});
(async()=>{
 const f=fixture(),r=await G.ausfuehren(f.args);A.equal(r.ok,true);A.equal(r.diagnosticOnly,true);A.equal(r.plannedInputGETs,1);A.equal(r.fixedProfilePosition,122);A.equal(r.attempted,1);A.equal(r.collectionCompleted,false);A.equal(r.all500InputAcceptance,false);
 A.equal(f.calls.length,3);A.equal(r.counts.captured,1);A.equal(r.counts["not-captured"],499);A.equal(f.files.size,501);
 A.equal(decode(f.files.get("0122.json"),122).status,"captured");A.equal(decode(f.files.get("0001.json")).fullBodyRetained,false);A.equal(decode(f.files.get("0500.json"),500).fullBodyRetained,false);
 A.equal(decode(f.checkpoints[0].envelope).attempted,0);A.equal(decode(f.checkpoints.at(-1).envelope).collectionCompleted,false);
 for(const change of [()=>new Response(JSON.stringify({ok:false,diagnose:{phase:"briefing-aufbauen",art:"speicher-http-fehler",httpStatus:503}}),{status:500}),
 ()=>new Response("denied",{status:401}),()=>{throw Error("PRIVATE_FETCH_ERROR");},()=>new Response("not-json"),p=>{p.profile.profileActive=true;return new Response(JSON.stringify(p));},p=>{p.modellaufrufe=1;return new Response(JSON.stringify(p));}]){
  const x=fixture(change),failed=await G.ausfuehren(x.args);A.equal(failed.ok,false);A.equal(failed.attempted,1);A.equal(x.calls.length,2);A.equal(failed.collectionCompleted,false);A.equal(failed.counts["not-captured"],499);A(!JSON.stringify(failed).includes("PRIVATE_FETCH_ERROR"));A(!JSON.stringify([...x.files]).includes(env.HELMUT_CRON_SECRET));
 }
 const noACK=fixture();noACK.args.persistCheckpoint=()=>{throw Error("noACK");};const stopped=await G.ausfuehren(noACK.args);A.equal(stopped.attempted,0);A.equal(noACK.calls.length,0);
 // Rohbody passt, aber JSON-Einbettung uebersteigt die Ciphergrenze: auch
 // dann vor einer weiteren Endidentitaet stoppen und ehrlich den Body verlieren.
 const escaped=fixture(p=>{p.padding='"'.repeat(2500000);const raw=JSON.stringify(p);A(Buffer.byteLength(raw)<T.MAX_BYTES);return new Response(raw);});
 const tooLarge=await G.ausfuehren(escaped.args);A.equal(tooLarge.stopReason,"production-input-transport-limit");A.equal(escaped.calls.length,2);A.equal(tooLarge.counts.technical,1);
 const limited=decode(escaped.files.get("0122.json"),122);A.equal(limited.fullBodyRetained,false);A.equal(limited.transportLimitExceeded,true);A.equal(limited.stopReason,tooLarge.stopReason);
 const deadline=fixture();let tick=0;deadline.args.now=()=>++tick<6?fixed:new Date(fixed.getTime()+3*60000);const expired=await G.ausfuehren(deadline.args);A(expired.attempted<=1);A.equal(expired.ok,false);A.equal(expired.stopReason,"day-or-duration-boundary");
 for(const [k,v]of [["GITHUB_RUN_ATTEMPT","2"],["GITHUB_REF","refs/heads/foreign"]]){const x=fixture();x.args.env[k]=v;await A.rejects(G.ausfuehren(x.args));A.equal(x.calls.length,0);}
 const yml=F.readFileSync(require("node:path").join(__dirname,"../.github/workflows/blocker2-readonly-diagnose.yml"),"utf8");A.match(yml,/workflow_dispatch:/);A.match(yml,/contents: read/);A.doesNotMatch(yml,/\bschedule:|cron:|profile_id:|mandat:/);A.match(yml,/blocker2-readonly-diagnose/);A.match(yml,/cancel-in-progress: false/);
 console.log("Feste Einzeldiagnose offline: nur BT122, maximal1 Eingabe/2 Identitaeten/3min, alle Cipherpositionen ehrlich bilanziert, kein500er Nachweis, ACK-/Fehler-/Drift-/Profil-/Modellstop bestanden.");
})().catch(e=>{console.error(e);process.exitCode=1;});
