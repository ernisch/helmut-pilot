"use strict";
// Echte Aufnahme-/HTTP-Fehlerpfade mit privaten Sentinels, ausschliesslich offline.
const A=require("node:assert/strict"),P=require("../lib/helmut/briefing-pruefaufnahme"),S=require("../lib/helmut/storage");
const pack=require("../lib/helmut/synthetik-500-import").erzeugeZeilen(require("../lib/helmut/synthetik-500-profile").erzeuge());
const profile=S.fromMandateProfileRow(pack.profileRows[121],pack.mandateRows[121]);profile.updatedAt="2026-10-08T00:00:00Z";
const commit="a".repeat(40),tag="2026-10-08",time=new Date("2026-10-08T08:00:00Z");
const secret="PRIVATE_SQL_ROW_AND_TOKEN_SENTINEL";
function fixture(){let reads=0,builds=0;return{args:{userId:profile.id,tag,commit,expectedCommit:commit,production:true,now:()=>time,
 storage:{getProfile:async()=>{reads++;return structuredClone(profile);}},
 build:async()=>{builds++;return{eingabe:{mandat:profile.id,tag},korrekturBasis:{kos:[]},briefing:{items:[]}}}},counts:()=>({reads,builds})};}
async function capture(f,error){try{await P.erfasse(f.args);A.fail("expected original error");}catch(e){A.equal(e,error);return P.fehlerDiagnose(e);}}
(async()=>{
 const f=fixture(),good=await P.erfasse(f.args);A.deepEqual(f.counts(),{reads:2,builds:1});A.equal(good.profile.id,profile.id);A.equal(good.all500InputAcceptance,false);A.equal(good.diagnose,undefined);
 A.equal(P.fehlerDiagnose(new Error(secret)),null);A.equal(P.fehlerDiagnose(null),null);A.equal(P.fehlerDiagnose(secret),null);
 let bound;
 for(const [message,art,status]of [[`Supabase storage failed (503): ${secret}`,"speicher-http-fehler",503],
 [`Supabase storage timed out after 20000ms: /rest/v1/profiles?secret=${secret}`,"speicher-timeout",undefined],
 ["Supabase request deadline exceeded","speicher-timeout",undefined],[`Unknown SQL ${secret}`,"interner-lesefehler",undefined]]){
  const x=fixture(),error=new Error(message);x.args.storage.getProfile=async()=>{throw error;};const d=await capture(x,error);
  A.equal(d.phase,"profil-vorher-lesen");A.equal(d.art,art);A.equal(d.httpStatus,status);A(Object.isFrozen(d));A(!JSON.stringify(d).includes(secret));bound=error;
 }
 const shared=new Error(secret),before=fixture();before.args.storage.getProfile=async()=>{throw shared;};await capture(before,shared);
 const build=fixture();build.args.build=async()=>{throw shared;};A.equal((await capture(build,shared)).phase,"briefing-aufbauen");
 const after=fixture(),later=new Error(`Supabase storage failed (429): ${secret}`);let reads=0;
 after.args.storage.getProfile=async()=>{if(++reads===2)throw later;return structuredClone(profile);};
 const post=await capture(after,later);A.equal(post.phase,"profil-nachher-lesen");A.equal(post.httpStatus,429);A.equal(reads,2);
 const hostile={};for(const name of ["name","message","code"])Object.defineProperty(hostile,name,{get(){throw Error(secret);}});
 const h=fixture();h.args.build=async()=>{throw hostile;};A.equal((await capture(h,hostile)).art,"interner-lesefehler");
 const primitive=fixture();primitive.args.build=async()=>{throw secret;};A.equal(await capture(primitive,secret),null);
 for(const change of [p=>p.profileActive=true,p=>p.fullName=secret]){
  const bad=fixture(),mutated=structuredClone(profile);change(mutated);bad.args.storage.getProfile=async()=>mutated;
  try{await P.erfasse(bad.args);A.fail("protection must reject");}catch(e){A.equal(P.fehlerDiagnose(e).art,"schutz-widerspruch");A(!JSON.stringify(P.fehlerDiagnose(e)).includes(secret));}
  A.equal(bad.counts().builds,0);
 }
 // Echter HTTP-Einstieg vor Account-Vorlauf: nur die gebundene Diagnose kommt
 // in Antwort und Log. Die urspruengliche Ausnahme enthaelt private Inhalte.
 const saved=P.erfasse;process.env.CRON_SECRET="ONLY_OFFLINE_CRON_SECRET";process.env.VERCEL_ENV="production";process.env.VERCEL_GIT_COMMIT_SHA=commit;
 P.erfasse=async()=>{throw bound;};const server=require("../server"),logs=[],oldError=console.error;
 console.error=(...args)=>logs.push(args.join(" "));
 try{
  const response=await new Promise(resolve=>{const res={headersSent:false,writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;},end(body){resolve({status:this.status,body});}};
   server({method:"GET",url:`/api/cron/briefing-nachweis?modus=eingabe&mandat=${profile.id}&tag=${tag}`,headers:{host:"localhost",authorization:"Bearer ONLY_OFFLINE_CRON_SECRET","x-helmut-production-commit":commit}},res);});
  A.equal(response.status,500);const payload=JSON.parse(response.body);A.equal(payload.grund,"briefing-nachweis-nicht-lesbar");A.deepEqual(payload.diagnose,P.fehlerDiagnose(bound));
  A(!response.body.includes(secret));A(!logs.join(" ").includes(secret));A(!logs.join(" ").includes(profile.id));A.equal(logs.length,1);
 }finally{P.erfasse=saved;console.error=oldError;}
 console.log("Lesediagnose offline: originale Fehleridentitaet, echte Timeout-/HTTP-Klassen, wechselnde Phasen, hostile Getter, Profilsperren und geheimnisfreie HTTP-Antwort/Logs bestanden.");
})().catch(e=>{console.error(e);process.exitCode=1;});
