'use strict';
// Pure local evidence transfer. Proposal issues NO positive judgment or GO.
// Adoption needs a separately reviewed Root+independent exact proposal pin.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ROOT='/workspace/helmut-cpu-epoch-20261015',A=require(ROOT+'/lib/helmut/briefing-aussagenbindung'),
 F=require(ROOT+'/lib/helmut/briefing-fachurteil'),B=require(ROOT+'/lib/helmut/briefing-speicher'),
 L=require(ROOT+'/lib/helmut/briefing-lagebindung'),T=require(ROOT+'/lib/helmut/briefing-bereichsvertrag');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function pin(file){const s=fs.lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink());const b=fs.readFileSync(file);return{path:path.resolve(file),bytes:b.length,sha256:sha(b)};}
function read(p){const actual=pin(p.path);assert.deepEqual(actual,p);return JSON.parse(fs.readFileSync(p.path));}
function equal(a,b){assert.deepEqual(a,b);}
function currentDisplay(briefing,instant,windowStartUTC){
 const next=structuredClone(briefing),state=next.currentHelmutState;
 assert(state?.primaryItem&&Array.isArray(state.items));
 assert.equal(state.frische?.fenster?.start,windowStartUTC,'Original explicit source window required');
 const current=require(ROOT+'/lib/helmut/briefing-frische').ordneMeldungen(
  [state.primaryItem,...state.items],state.frische.fenster,new Date(instant));
 state.primaryItem=current.items[0];state.items=current.items.slice(1);state.frische.kennzahlen=current.kennzahlen;
 return next;
}
const relativePath=/^\/currentHelmutState\/(?:primaryItem|items\/\d+)\/(?:zeitLabel|frischeKlasse|frischeLabel)$/;
function propose(rows,{oldDay,day,startsAtUTC,endsAtUTC,windowStartUTC}){
 assert.equal(oldDay,'2026-10-16');assert(['2026-10-17','2026-10-18','2026-10-19'].includes(day),'Only explicitly prepared local days17/18/19 are supported');
 assert.equal(windowStartUTC,'2026-10-13T00:00:00.000Z','Existing explicit source window must not change');
 for(const t of [startsAtUTC,endsAtUTC])assert.equal(new Date(t).toISOString(),t);
 assert(startsAtUTC<endsAtUTC&&Date.parse(endsAtUTC)-Date.parse(startsAtUTC)<=9*3600000);
 assert.equal(startsAtUTC.slice(0,10),day);assert.equal(endsAtUTC.slice(0,10),day);
 const berlin=require(ROOT+'/lib/helmut/briefing-frische').berlinTagKey;
 assert.equal(berlin(new Date(startsAtUTC)),day);assert.equal(berlin(new Date(endsAtUTC)),day);
 assert.equal(rows.length,500);assert.equal(new Set(rows.map(r=>r.profile.id)).size,500);
 const proposed=[],mapping=[],variants=new Map(),reasons=new Map(),sources=new Map();
 for(let i=0;i<rows.length;i++){
  const old=rows[i],b=old.briefingEingabe;assert.equal(b.version,1);assert.equal(b.eingabe.tag,oldDay);
  assert(A.pruefe(b.eingabe,b.urteil).bereit);assert(F.pruefe(b,b.urteil).bereit);
  L.pruefe(b,old.profile,old.profile.id,new Date(oldDay+'T06:00:00.000Z'));
  assert.throws(()=>L.pruefe(b,old.profile,old.profile.id,new Date(startsAtUTC)),'Old-day input must remain rejected');
  const state=b.briefing.currentHelmutState,ko=b.korrekturBasis.kos.find(k=>k.vorgang_id===state.primaryVorgangId);
  assert(ko,'Exact existing selected KO required');const docs=b.korrekturBasis.sourcesByVorgang[ko.vorgang_id];assert(docs?.length);
  for(const instant of [startsAtUTC,endsAtUTC]){
   const occasion=T.tagesAnlass(docs,new Date(instant),{start:windowStartUTC},ko);
   assert(occasion,'No valid occasion on proposed day');equal(occasion,state.tagesAnlass);
  }
  const next=structuredClone(old),n=next.briefingEingabe;
  n.briefing=currentDisplay(b.briefing,startsAtUTC,windowStartUTC);
  equal(n.briefing,currentDisplay(b.briefing,endsAtUTC,windowStartUTC));
  n.eingabe=A.baueEingabe({briefing:n.briefing,...n.korrekturBasis,profile:next.profile,userId:next.profile.id,day,korrekturHash:b.eingabe.korrekturHash});
  const displayDeltas=n.eingabe.aussagen.filter(a=>{
   const prior=b.eingabe.aussagen.find(x=>x.pfad===a.pfad);assert(prior);
   if(prior.text===a.text){equal(prior,a);return false;}
   assert(relativePath.test(a.pfad),'Unreviewed nonrelative visible change');
   equal({...a,text:prior.text},prior);return true;
  });
  assert.equal(n.eingabe.aussagen.length,b.eingabe.aussagen.length);
  const compare=structuredClone(n.eingabe);compare.tag=b.eingabe.tag;compare.eingabeHash=b.eingabe.eingabeHash;
  compare.aussagen=b.eingabe.aussagen;compare.darstellungsHash=b.eingabe.darstellungsHash;
  equal(compare,b.eingabe);equal(next.profile,old.profile);equal(next.sources,old.sources);equal(n.korrekturBasis,b.korrekturBasis);
  const displayBefore=structuredClone(b.briefing),displayAfter=structuredClone(n.briefing);
  for(const v of [displayBefore,displayAfter])for(const item of [v.currentHelmutState.primaryItem,...v.currentHelmutState.items])
   for(const key of ['zeitLabel','frischeKlasse','frischeLabel'])delete item[key];
  equal(displayBefore,displayAfter);
  n.urteil=null;assert.equal(A.pruefe(n.eingabe,null).bereit,false);
  mapping.push({owner:old.profile.id,oldInputHash:b.eingabe.eingabeHash,newInputHash:n.eingabe.eingabeHash,
   profileHash:B.hash(old.profile),displayHash:b.eingabe.darstellungsHash,newDisplayHash:n.eingabe.darstellungsHash,sourcesHash:B.hash(b.eingabe.quellen),
   sourceRowsHash:B.hash(b.korrekturBasis.sourcesByVorgang),knowledgeHash:B.hash(b.korrekturBasis.kos),
   oldJudgmentHash:B.hash(b.urteil),positions:n.eingabe.aussagen.length,actualOccasion:state.tagesAnlass,displayDeltas});
  for(const a of n.eingabe.aussagen){const key=JSON.stringify(a);if(!variants.has(key))variants.set(key,{claim:a,ownerIndexes:[]});variants.get(key).ownerIndexes.push(i);}
  for(const q of b.eingabe.quellen)sources.set(B.hash(q),q);
  for(const a of b.urteil.aussagen){const key=JSON.stringify(a);if(!reasons.has(key))reasons.set(key,{judgment:a,ownerIndexes:[]});reasons.get(key).ownerIndexes.push(i);}
  proposed.push(next);
 }
 const count=proposed.reduce((n,r)=>n+r.briefingEingabe.eingabe.aussagen.length,0);
 assert.equal([...variants.values()].reduce((n,r)=>n+r.ownerIndexes.length,0),count);
 return{rows:proposed,review:{status:'PROPOSAL_NO_POSITIVE_JUDGMENT',oldDay,day,startsAtUTC,endsAtUTC,windowStartUTC,
  profiles:500,positions:count,mapping,claims:[...variants.values()],sources:[...sources.values()],
  inheritedJudgmentVariants:[...reasons.values()],profileSourceAndNonrelativeVisibleContentUnchanged:true,
  relativeDisplayRecomputedByOriginalOrdneMeldungen:true,
  oldDayInputsRejectedForNewDay:500,occasionsRecomputedAtBothWindowEnds:500,positiveJudgmentsCreated:0,
  scope:'Technical current-day local mock fixture only; no new article/event or native Understanding/Production acceptance'}};
}
function adopt({oldRowsPin,proposalPin,rootAcceptancePin}){
 const oldRows=read(oldRowsPin),proposal=read(proposalPin),acceptance=read(rootAcceptancePin);
 assert.equal(acceptance.status,'ROOT_AND_INDEPENDENT_ACCEPTED_EXACT_CURRENT_DAY_TRANSFER');
 equal(acceptance.oldRowsPin,oldRowsPin);equal(acceptance.proposalPin,proposalPin);
 assert(['2026-10-17','2026-10-18','2026-10-19'].includes(acceptance.day));equal(acceptance.day,proposal.review.day);
 assert.equal(acceptance.profiles,500);assert.equal(acceptance.allPositionsReviewed,true);
 assert.equal(acceptance.currentTemporalJudgmentAccepted,true);assert.equal(acceptance.production,false);
 const independent=read(acceptance.independentReview);
 assert.equal(independent.model,'deepseek-v4-pro');assert.equal(independent.route.effort,'high');assert.equal(independent.payload.summary.status,'ok');
 assert(typeof acceptance.timeReason==='string'&&acceptance.timeReason.length>=100);
 const rebuilt=propose(oldRows,proposal.review);equal(rebuilt,proposal);
 return proposal.rows.map((row,i)=>{
  const next=structuredClone(row),b=next.briefingEingabe,old=oldRows[i].briefingEingabe;
  b.urteil=structuredClone(old.urteil);b.urteil.eingabeHash=b.eingabe.eingabeHash;
  for(const verdict of b.urteil.aussagen){
   const actual=b.eingabe.aussagen.find(a=>a.pfad===verdict.pfad);assert(actual);
   if(verdict.text!==actual.text){assert(relativePath.test(actual.pfad));verdict.text=actual.text;verdict.begruendung=acceptance.timeReason;}
   if(actual.art==='ausgabe')verdict.ausgabeBeleg=b.eingabe.darstellungsHash;
  }
  b.urteil.gesamtpruefung.kriterien.zeitbezug={bestanden:true,begruendung:acceptance.timeReason};
  b.urteil.gesamtpruefung.umfang=F.umfang(b,b.urteil);
  assert(A.pruefe(b.eingabe,b.urteil).bereit);assert(F.pruefe(b,b.urteil).bereit);
  for(const when of [proposal.review.startsAtUTC,proposal.review.endsAtUTC])L.pruefe(b,next.profile,next.profile.id,new Date(when));
  return next;
 });
}
module.exports={pin,read,propose,adopt,currentDisplay};
