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
// Gebundene Publikationsfreigabe: echter Runtime-Konstruktor, keine Ersatzform.
// Nur die18 geschlossenen Gruende sind zugelassen.
const PUBLIKATIONS_CODE="PUBLICATION_ELIGIBILITY_UNAVAILABLE";
const PUBLIKATIONS_MELDUNG="publication-eligibility-source-response-invalid";
const PUBLIKATIONS_GRUENDE=["configuration-invalid","policy-drift","candidate-unchecked","source-reader-unavailable","source-read-unavailable","source-read-incomplete","candidate-limit-invalid","candidate-scan-limit","candidate-read-unavailable","candidate-window-drift","stored-policy-stale","capture-policy-mismatch","matching-source-incomplete","source-input-invalid","source-read-limit","source-response-invalid","candidates-invalid","matching-response-invalid"];
const {PublicationEligibilityError:PUBLIKATIONS_FEHLER}=require("../lib/helmut/publication-eligibility");
function publikationsFehler(message,reason){const e=new PUBLIKATIONS_FEHLER(reason);A.equal(e.code,PUBLIKATIONS_CODE);A.equal(e.message,message);A.equal(e.statusCode,503);return e;}
async function baueFehler(error){const f=fixture();let builds=0;f.args.build=async()=>{builds++;throw error;};const d=await capture(f,error);return{d,builds,reads:f.counts().reads};}
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
 // Gebundene Publikationsfreigabe: genau18 exakte Meldungen ergeben feste
 // Artlabel; Rohmessage/Grund werden nie kopiert, je Fehler genau ein Build und
 // genau ein Profilread, Original bleibt identisch und geheimnisfrei.
 A.equal(PUBLIKATIONS_GRUENDE.length,18);let publikationsBound=null;
 for(const reason of PUBLIKATIONS_GRUENDE){
  const message=`publication-eligibility-${reason}`,error=publikationsFehler(message,reason);
  const {d,builds,reads}=await baueFehler(error);
  A.equal(d.art,`publikations-${reason}`);A.equal(d.phase,"briefing-aufbauen");
  A.equal(d.version,"blocker2-briefing-read-diagnostic/1");A.equal(d.httpStatus,undefined);
  A(Object.isFrozen(d));A.equal(Object.keys(d).length,3);A(!JSON.stringify(d).includes(secret));A(!JSON.stringify(d).includes("publication-eligibility-"));
  A.equal(builds,1);A.equal(reads,1);
  if(reason==="source-response-invalid")publikationsBound=error;
 }
 A(publikationsBound);
 const unknown=await baueFehler(new PUBLIKATIONS_FEHLER("unknown-"+secret));A.equal(unknown.d.art,"interner-lesefehler");A(!JSON.stringify(unknown.d).includes(secret));
 // Unbekannte Meldungen, Suffixe, Whitespace/Zeilenumbruch, fremder Code,
 // Assertion-/Abort-Vorrang und feindliche Getter bleiben sicher generisch.
 const unSuffix=Object.assign(new Error(`${PUBLIKATIONS_MELDUNG}${secret}`),{name:"PublicationEligibilityError",code:PUBLIKATIONS_CODE,status:503});
 const us=await baueFehler(unSuffix);A.equal(us.d.art,"interner-lesefehler");A(!JSON.stringify(us.d).includes(secret));A.equal(us.builds,1);A.equal(us.reads,1);
 const unNewline=Object.assign(new Error(`${PUBLIKATIONS_MELDUNG}\n`),{name:"PublicationEligibilityError",code:PUBLIKATIONS_CODE,status:503});
 A.equal((await baueFehler(unNewline)).d.art,"interner-lesefehler");
 const unSpace=Object.assign(new Error(` ${PUBLIKATIONS_MELDUNG}`),{name:"PublicationEligibilityError",code:PUBLIKATIONS_CODE,status:503});
 A.equal((await baueFehler(unSpace)).d.art,"interner-lesefehler");
 const falscherCode=Object.assign(new Error(PUBLIKATIONS_MELDUNG),{name:"PublicationEligibilityError",code:"PUBLICATION_ELIGIBILITY_ANDERER",status:503});
 A.equal((await baueFehler(falscherCode)).d.art,"interner-lesefehler");
 const assertionVorrang=Object.assign(new Error(PUBLIKATIONS_MELDUNG),{name:"AssertionError",code:"ERR_ASSERTION"});
 A.equal((await baueFehler(assertionVorrang)).d.art,"schutz-widerspruch");
 const abortVorrang=Object.assign(new Error(PUBLIKATIONS_MELDUNG),{name:"AbortError",code:PUBLIKATIONS_CODE});
 A.equal((await baueFehler(abortVorrang)).d.art,"speicher-timeout");
 const hostileMessage={};Object.defineProperty(hostileMessage,"code",{value:PUBLIKATIONS_CODE,enumerable:true});Object.defineProperty(hostileMessage,"message",{get(){throw Error(secret);}});
 const hm=await baueFehler(hostileMessage);A.equal(hm.d.art,"interner-lesefehler");A(!JSON.stringify(hm.d).includes(secret));
 const hostileCode={};Object.defineProperty(hostileCode,"code",{get(){throw Error(secret);}});Object.defineProperty(hostileCode,"message",{value:PUBLIKATIONS_MELDUNG,enumerable:true});
 const hc=await baueFehler(hostileCode);A.equal(hc.d.art,"interner-lesefehler");A(!JSON.stringify(hc.d).includes(secret));
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
 // Repraesentativer gebundener Typfehler der Publikationsfreigabe (status503,
 // source-response-invalid): fester sicherer Artlabel, keine Rohmessage/URL/ID
 // in Antwort oder Log; die urspruengliche500-Wirkung bleibt bestehen.
 const savedP=P.erfasse;P.erfasse=async()=>{throw publikationsBound;};const logsP=[],oldErrorP=console.error;
 console.error=(...args)=>logsP.push(args.join(" "));
 try{
  const responseP=await new Promise(resolve=>{const res={headersSent:false,writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;},end(body){resolve({status:this.status,body});}};
   server({method:"GET",url:`/api/cron/briefing-nachweis?modus=eingabe&mandat=${profile.id}&tag=${tag}`,headers:{host:"localhost",authorization:"Bearer ONLY_OFFLINE_CRON_SECRET","x-helmut-production-commit":commit}},res);});
  A.equal(responseP.status,503);const payloadP=JSON.parse(responseP.body);A.equal(payloadP.grund,"briefing-nachweis-nicht-lesbar");
  A.deepEqual(payloadP.diagnose,P.fehlerDiagnose(publikationsBound));A.equal(payloadP.diagnose.art,"publikations-source-response-invalid");
  A(!responseP.body.includes(PUBLIKATIONS_MELDUNG));A(!responseP.body.includes(secret));A(!responseP.body.includes(profile.id));
  A(!logsP.join(" ").includes(PUBLIKATIONS_MELDUNG));A(!logsP.join(" ").includes(secret));A.equal(logsP.length,1);
 }finally{P.erfasse=savedP;console.error=oldErrorP;}
 console.log("Lesediagnose offline: originale Fehleridentitaet, echte Timeout-/HTTP-Klassen, wechselnde Phasen, hostile Getter, Profilsperren und geheimnisfreie HTTP-Antwort/Logs bestanden.");
 console.log("Publikationsfreigabe offline: 18 feste Artlabel, Originalidentitaet, genau ein Build/ein Profilread, unbekannte/feindliche Faelle und sicheres HTTP-Label geheimnisfrei bestanden.");
})().catch(e=>{console.error(e);process.exitCode=1;});
