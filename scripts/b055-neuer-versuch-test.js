"use strict";
const A=require('node:assert/strict'),{fixture}=require('./b055-einzelabschluss-test'),
 E=require('../lib/helmut/b055-einzelabschluss'),B=require('../lib/helmut/briefing-speicher'),
 Q=require('../lib/helmut/briefing-aussagenbindung'),D=require('../lib/helmut/testkohorte-direkt500');
function neu(){
 const h=fixture(), oldRun=h.c.runId, tag=h.c.tag, stamp=h.now.toISOString();
 const start={id:E.START_ID,user_id:E.MANDAT,slot:E.SLOT,generated_at:stamp,payload:{version:1,runId:oldRun}};
 const draft={id:`bf-${E.MANDAT}-lage-pruefentwurf-${tag}-${oldRun}-entwurf`,user_id:E.MANDAT,
 slot:'lage-pruefentwurf',generated_at:stamp,payload:{runId:oldRun,auslieferbar:false,qualitaetBestanden:false}};
 const u={id:`bf-${E.MANDAT}-${Q.SLOT}-${tag}`,user_id:E.MANDAT,slot:Q.SLOT,generated_at:stamp,
 payload:{urteil:structuredClone(h.c.urteil),importbeleg:{version:1,tag,productionCommit:h.c.productionCommit,
 freigabeHash:'a'.repeat(64),urteilHash:B.hash(h.c.urteil),kontextHash:h.c.kontextHash}}};
 h.rows.set(start.id,start);h.rows.set(draft.id,draft);h.rows.set(u.id,u);
 h.c.version=2;h.c.id=E.COMMAND_NEU;h.c.runId='nachlauf500-202609150056';
 h.c.vorgaenger={runId:oldRun,tag,startHash:B.hash(start),entwurfHash:B.hash(draft),urteilHash:B.hash(u),costMicroUsd:1000};
 const book=h.s.auth.testKostenTage[tag];book.calls.alt={status:'abgerechnet',reserved:212000,maxOutputTokens:3000,
 manual:true,createdAt:stamp,cost:1000,bezug:{version:1,runId:oldRun,mandatHash:D.hash(E.MANDAT),phase:'entwurf'}};
 book.manualCalls=1;book.spent=1000;h.counter=1;h.s.auth.llmUsage.push({createdAt:stamp,model:'gpt-5-mini',estimatedCost:.001});
 h.previous={run_id:oldRun,process:'briefing-einzelabschluss',status:'failed',reason:'einzellage-abgelehnt',finished_at:stamp,target_count:1,saved_count:0};
 const get=h.args.deps.get; h.args.deps.get=async p=>p.startsWith('process_runs?select=*&process=')?[structuredClone(h.previous)]:get(p);
 h.args.confirmation=E.CONFIRM_NEU;h.approve();return h;
}
module.exports = { neu };
if (require.main === module) (async()=>{
 let passed=0;
 const h=neu(),old=[E.START_ID,...[...h.rows.keys()].filter(x=>x.includes('pruefentwurf')||x.includes('briefing-aussagen'))].map(k=>[k,B.hash(h.rows.get(k))]);
 const r=await E.ausfuehren(h.args); A.equal(r.ok,true,JSON.stringify(r));A.equal(h.calls,2);A.equal(h.imports,0);A.equal(r.importbericht.wiederverwendet,true);
 for(const[k,hash]of old)A.equal(B.hash(h.rows.get(k)),hash);
 A(h.rows.has(E.START_NEU));A.equal((await E.ausfuehren(h.args)).ok,false);A.equal(h.calls,2);passed++;
 for(const mutate of [
 h=>{h.previous.status='running'},h=>{h.c.vorgaenger.entwurfHash='a'.repeat(64)},
 h=>{h.c.vorgaenger.costMicroUsd=999},h=>{h.rows.delete(E.START_ID)},
 h=>{h.rows.set(E.START_NEU,{payload:{}})},h=>{h.c.runId=h.c.vorgaenger.runId},
 h=>{h.rows.get(`bf-${E.MANDAT}-${Q.SLOT}-${h.c.tag}`).payload.urteil.eingabeHash='b'.repeat(64)},
 h=>{h.c.maxMicroUsd=424001},h=>{h.args.confirmation=E.CONFIRM}
 ]){const t=neu();mutate(t);t.approve();const out=await E.ausfuehren(t.args);A.equal(out.ok,false);A.equal(t.calls,0);A.equal(t.writes,0);passed++;}
 const successor=neu(), oldU=successor.rows.get(`bf-${E.MANDAT}-${Q.SLOT}-${successor.c.tag}`);
 oldU.payload.urteil.korrektur.ursprungHash='e'.repeat(64);
 oldU.payload.importbeleg.urteilHash=B.hash(oldU.payload.urteil);
 successor.c.vorgaenger.urteilHash=B.hash(oldU);successor.approve();
 const oldHash=B.hash(oldU);successor.args.deps.storage.v3StoreReady=()=>true;
 successor.args.deps.storage.tenantRequest=async(url,id,opts)=>{
  A.equal(id,E.MANDAT);A(url.includes('user_id=eq.'+E.MANDAT));
  if(opts?.method==='POST'){const row=JSON.parse(opts.body);A(!successor.rows.has(row.id));successor.rows.set(row.id,row);return [row];}
  const key=new URL('https://offline.invalid'+url).searchParams.get('id').slice(3);
  return successor.rows.has(key)?[structuredClone(successor.rows.get(key))]:[];
 };
 const next=await E.ausfuehren(successor.args);A.equal(next.ok,true,JSON.stringify(next));
 A.equal(next.importbericht.nachfolger,true);A.equal(B.hash(oldU),oldHash);A.equal(successor.calls,2);passed++;
 const lost=neu();lost.hooks.afterStart=()=>{throw Error('Antwort verloren')};A.equal((await E.ausfuehren(lost.args)).ok,false);
 delete lost.hooks.afterStart;A.equal((await E.ausfuehren(lost.args)).grund,'einzelstart-bereits-verbraucht');A.equal(lost.calls,0);A.equal(lost.writes,1);passed++;
 console.log(passed+'/'+passed+' neuer Einzelversuch: Altdaten, echte Urteilsvalidierung, Kostenbindung, Doppelstart und unbekannter Ausgang');
})().catch(e=>{console.error(e);process.exitCode=1});
