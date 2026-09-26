"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs");
const F = require("../lib/helmut/verstehen-frische30-vertrag"), V = require("../lib/helmut/verstehen-einmalig");
const C = require("./verstehen-frische30"), B = require("../lib/helmut/testkosten-budget");
let n = 0; const ok = (name, f) => Promise.resolve().then(f).then(() => { n++; console.log("PASS " + name); });
(async () => {
 await ok("Nur explizite Bedienformen, kein Import-GO als Modellstart", () => {
  assert.equal(C.argumente(["--plan"]), false); assert.equal(C.argumente(["--execute", C.BESTAETIGUNG]), true);
  for (const a of [[], ["--execute"], ["--execute", "GO"], ["--plan", "--execute"]]) assert.throws(() => C.argumente(a));
 });
 await ok("Runtime ist an ersten main-Dispatch gebunden", () => {
  const h="a".repeat(40), env={HELMUT_FRISCHE30_RUNTIME_COMMIT:h,GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"ernisch/helmut-pilot",GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"workflow_dispatch",GITHUB_RUN_ATTEMPT:"1",GITHUB_SHA:h};
  assert.equal(C.pruefeRuntime(env,h),h);
  for(const k of Object.keys(env)) assert.throws(()=>C.pruefeRuntime({...env,[k]:"falsch"},h));
 });
 await ok("30er Kennungsbindung aendert keinen169er Vertrag", async () => {
  const l=require("../belege/verstehen-frische30-ids.json");assert.equal(V.idsHash(l.ids),F.FRISCHE30.idHash);
  assert.equal(V.PINNED.dokumente,169);assert.equal(V.PINNED.maxModellaufrufe,113);
  assert.equal((await V.pruefeUndPlane({ids:l.ids,commit:F.FRISCHE30.commit})).ok,false);
  await assert.rejects(()=>V.pruefeUndPlane({erwartet:{...F.FRISCHE30}}));
  assert.equal(F.pruefeInhalt([]),false);
 });
 await ok("Fremde Quittung und fehlende30er Dokumente stoppen vor jedem Modell", async () => {
  let calls=0;const deps={requestUnderstanding:()=>{calls++;throw Error();}};
  const r=await V.fuehreAus({execute:true,erwartet:F.FRISCHE30,quittungsschluessel:V.QUITTUNG,deps});
  assert.equal(r.ok,false);assert.equal(calls,0);
  const l=require("../belege/verstehen-frische30-ids.json");
  const p=await V.pruefeUndPlane({ids:l.ids,commit:F.FRISCHE30.commit,erwartet:F.FRISCHE30,deps:{ladeDokumente:async()=>[]}});
  assert.equal(p.grund,"verstehen-dokumentanzahl-abweichend");
 });
 await ok("Eigener Kostenbezug bei freigegebenem6-USD-Riegel", () => {
  assert.equal(B.MANUELLE_RUN_ID.test("verstehen30-123456"),true);
  assert.equal(B.konfiguration({}).limitUsd,6);assert.equal(F.FRISCHE30.maxUsd,0.8);assert.equal(F.FRISCHE30.maxMs,900000);
 });
 await ok("Profilruhe und vorhandene Einmalquittung sind harte Sperren", async () => {
  const state={mandate_profiles:Array.from({length:504},(_,i)=>({user_id:String(i),aktiv:false,geloescht_at:null})),profiles:Array.from({length:505},(_,i)=>({id:String(i)})),helmut_jobs:[],pipeline_locks:[],process_runs:[],helmut_verstehen_reservierungen:[],helmut_store:[]};
  const read=async (t,q)=>{if(t==="process_runs")assert.equal(new URLSearchParams(q).get("select"),"run_id");return state[t];};assert.match(await C.ruhe(read),/^[a-f0-9]{64}$/);
  for(const t of ["helmut_jobs","pipeline_locks","process_runs","helmut_verstehen_reservierungen","helmut_store"]){state[t]=[{}];await assert.rejects(()=>C.ruhe(read));state[t]=[];}
  state.mandate_profiles[0].aktiv=true;await assert.rejects(()=>C.ruhe(read));
 });
 console.log(n+"/6 Fallgruppen bestanden; keine Production-Verbindung.");
})().catch(e=>{console.error(e);process.exitCode=1;});
