'use strict';
const A=require('node:assert/strict'),M=require('./bereichspaket-vorstart');
const now=Date.parse('2026-09-27T08:00:00Z'),commit='a'.repeat(40),input='b'.repeat(64);
const env={HELMUT_BEREICHSPAKET_COMMIT:commit,GITHUB_SHA:commit,GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'ernisch/helmut-pilot',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123456789',HELMUT_BEREICHSPAKET_PROFIL:M.PROFIL_HASH,HELMUT_BEREICHSPAKET_EINGABE:input,HELMUT_BEREICHSPAKET_URTEIL:'c'.repeat(64)};
let n=0; const test=async(name,fn)=>{await fn();console.log('PASS '+name);n++};
function stand(){return {calls:0,start:now,jetzt:now,laufkosten:0,bestand:'bestand',grundlinie:'bestand',kosten:{startklar:true,offeneReservierungen:0,limitUsd:6,gebundenUsd:0.02},auftrag:{id:'autonom-bis500-20260926',limitMicroUsd:7000000,gebundenMicroUsd:6387592}}}
function harness(){
 const p={id:'fiktiv',profileActive:false},cfg={...M.konfiguration(env,commit,now),profilHash:M.bindung(p)},s=stand();let time=now;
 const counts={imports:0,claims:0,calls:0,saves:0,packets:0,releases:0,finishes:0};let receipt,stored=null;const hooks={};
 const d={execute:true,now:()=>time,ruhe:async()=>s.bestand,profile:async()=>p,quittung:async()=>null,tagessatz:async()=>({}),
 fachlicheEingabe:async()=>{await hooks.read?.();return {eingabe:{eingabeHash:input,quellen:[]},briefing:{items:[]}}},
 kosten:async()=>s.kosten,auftrag:async()=>s.auftrag,laufkosten:async()=>s.laufkosten,bestand:async()=>s.bestand,
 acquire:async()=>({granted:true,active:true}),release:async()=>{counts.releases++},claim:async()=>{counts.claims++;return true},finish:async r=>{counts.finishes++;receipt=r},
 importiere:async(_p,gate)=>{await gate();counts.imports++;return {verwendbar:true,gespeichert:true}},eingabe:async()=>({bereit:true,eingabeHash:input,lageEingabe:{},briefing:{}}),
 lage:async(_p,o)=>{await o.beforeGenerate(p.id);counts.calls++;time+=10000;await o.beforeGenerate(p.id);counts.calls++;time+=10000;await hooks.beforeSave?.();await o.beforeSave(p.id);counts.saves++;stored={payload:{briefingEingabeHash:input}};return {available:true,fromCache:false}},
 lageSatz:async()=>stored,textGueltig:()=>true,materialisiere:async()=>{counts.packets++;return {gespeichert:true,vollstaendig:true}}};
 return {cfg,d,s,p,counts,hooks,receipt:()=>receipt,time:t=>{time=t}};
}
(async()=>{
 await test('Runtime, Auftragstag, Profil und beide Urteilsbindungen sind fest',()=>{
  A.equal(M.konfiguration(env,commit,now).tag,'2026-09-27');
  for(const patch of [{GITHUB_SHA:'d'.repeat(40)},{GITHUB_REF:'refs/heads/fremd'},{GITHUB_RUN_ATTEMPT:'2'},{HELMUT_BEREICHSPAKET_PROFIL:'d'.repeat(64)},{HELMUT_BEREICHSPAKET_EINGABE:''},{HELMUT_BEREICHSPAKET_URTEIL:''}])A.throws(()=>M.konfiguration({...env,...patch},commit,now));
  A.throws(()=>M.konfiguration(env,commit,Date.parse('2026-09-28T08:00:00Z')));
  A.throws(()=>M.konfiguration(env,commit,Date.parse('2026-09-26T23:00:00Z')));
  A.throws(()=>M.konfiguration(env,commit,Date.parse('2026-09-27T21:58:00Z')));
 });
 await test('Zwei Reserven passen; Fremdauftrag, offener Posten oder Ueberbudget sperren',()=>{
  A.equal(M.volleReserveUsd(),0.436);M.pruefeAufruf(stand());
  for(const mutate of [s=>s.auftrag.gebundenMicroUsd=6600000,s=>s.auftrag.id='fremd',s=>s.kosten.offeneReservierungen=1,s=>s.kosten.limitUsd=7,s=>s.kosten.gebundenUsd=5.6,s=>s.bestand='neu',s=>s.laufkosten=0.437,s=>s.calls=2,s=>s.jetzt+=110000]){const s=stand();mutate(s);A.throws(()=>M.pruefeAufruf(s));}
  const review=stand();review.calls=1;review.auftrag.gebundenMicroUsd=6750000;M.pruefeAufruf(review);
 });
 await test('Nach zwei Aufrufen ist Speichern kein dritter Aufruf und braucht keine neue Reserve',()=>{
  const s=stand();s.calls=2;s.auftrag.gebundenMicroUsd=6999999;s.laufkosten=0.436;M.pruefeSpeichern(s);A.throws(()=>M.pruefeAufruf(s));s.calls=1;A.throws(()=>M.pruefeSpeichern(s));
 });
 await test('Plan ruft weder Import, Lock, Modell noch Speicher auf',async()=>{
  const h=harness();h.d.execute=false;h.d.acquire=()=>{throw Error('lock im plan')};const r=await M.einmallauf(h.cfg,h.d);A.equal(r.plan,true);A(Object.values(h.counts).every(x=>x===0));
 });
 await test('Echter Hookablauf erlaubt genau zwei Aufrufe und danach Speichern plus Paket',async()=>{
  const h=harness(),r=await M.einmallauf(h.cfg,h.d);A.equal(r.ok,true);A.deepEqual(h.counts,{imports:1,claims:1,calls:2,saves:1,packets:1,releases:1,finishes:1});A.equal(h.receipt().fachlichPositiv,false);A.equal(r.funktionsnachweis500,false);
 });
 await test('Aktives Profil, verbrauchter Auftrag und bestehende Tagessaetze sperren vor Writes',async()=>{
  for(const change of [h=>h.p.profileActive=true,h=>h.d.quittung=async()=>({}),h=>h.d.tagessatz=async()=>({urteil:{}}),h=>h.cfg.eingabeBindung='f'.repeat(64)]){const h=harness();change(h);await A.rejects(M.einmallauf(h.cfg,h.d));A.equal(h.counts.claims,0);A.equal(h.counts.calls,0)}
 });
 await test('Abgelehnter Import startet kein Modell und schliesst den Auftrag ohne Wiederholung',async()=>{
  const h=harness();h.d.importiere=async()=>({verwendbar:false});const r=await M.einmallauf(h.cfg,h.d);A.equal(r.ok,false);A.equal(h.counts.calls,0);A.equal(h.receipt().status,'gestoppt');
 });
 await test('Profil- und Kostendrift nach Review verhindern den tatsaechlichen beforeSave',async()=>{
  for(const change of [h=>h.s.bestand='drift',h=>h.s.kosten.offeneReservierungen=1,h=>h.s.laufkosten=0.437,h=>h.time(now+235000)]){const h=harness();h.hooks.beforeSave=()=>change(h);const r=await M.einmallauf(h.cfg,h.d);A.equal(r.ok,false);A.equal(h.counts.calls,2);A.equal(h.counts.saves,0);A.equal(h.counts.packets,0);A.equal(h.counts.releases,1);A.equal(h.counts.finishes,1)}
 });
 await test('Dritter Aufruf und fehlende Ruecklesung erzeugen kein vollstaendiges Paket',async()=>{
  const h=harness();h.d.lage=async(p,o)=>{await o.beforeGenerate(p.id);await o.beforeGenerate(p.id);await o.beforeGenerate(p.id)};A.equal((await M.einmallauf(h.cfg,h.d)).ok,false);A.equal(h.counts.packets,0);
  const k=harness();k.d.lageSatz=async()=>null;A.equal((await M.einmallauf(k.cfg,k.d)).ok,false);A.equal(k.counts.packets,0);
 });
 await test('Lange Vorlesung verliert ihre fruehere Transportfreigabe',async()=>{
  const h=harness();let reads=0;h.hooks.read=()=>{if(++reads===2)h.time(now+110000)};await A.rejects(M.einmallauf(h.cfg,h.d));A.equal(h.counts.calls,0);
 });
 console.log(`${n}/${n} Einmallaufgruppen bestanden; keine Production und keine Modellaufrufe.`);
})().catch(e=>{console.error(e);process.exitCode=1});
