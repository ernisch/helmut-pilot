"use strict";
const A = require("node:assert/strict"), vm = require("node:vm"), fs = require("node:fs");
const C = require("../lib/helmut/lage-verarbeitungsbeleg"), S = require("../lib/helmut/storage");
const clone = structuredClone;
const args = { userId: "synthetik-kern", tag: "2026-11-13", eingabe: { profile: "v1", sources: "v1" }, now: new Date("2026-11-13T05:00:00Z") };
let n = 0;
const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7);
async function test(name, fn) { if (only && !name.includes(only)) return; await fn(); n++; console.log("PASS " + name); }
function store() {
  const rows = new Map();
  return { rows, assertTenant: S.assertTenant,
    getLageVerarbeitungsbeleg: async (userId,id) => { const row = rows.get(id); A.ok(!row || row.user_id === userId); return clone(row || null); },
    insertLageVerarbeitungsbeleg: async row => { if (!rows.has(row.id)) rows.set(row.id,clone(row)); return { saved:true }; }
    ,loeseLageVerarbeitungsstart:async(userId,id,owner)=>{ const row=rows.get(id); if(row?.user_id===userId&&row.payload.owner===owner)rows.delete(id); }
  };
}
async function main() {
  await test("Neuer Prozess darf unklaren Entwurf nicht erneut bezahlen", async () => {
    const s=store(); await C.begin(args,s);
    await A.rejects(C.begin(args,s),{ code:"LAGE_AUSGANG_UNKLAR" }); A.equal(s.rows.size,1);
  });
  await test("Bestaetigter Entwurf bleibt nach Unterbrechung fortsetzbar", async () => {
    const s=store(), first=await C.begin(args,s), draft={ paragraphs:[{ text:"Synthetischer Quellenentwurf" }] };
    await first.onDraft(draft); const next=await C.begin(args,s);
    A.deepEqual(next.entwurf,draft); A.equal(next.pruefung,undefined);
    await next.beforeReview(); await A.rejects(C.begin(args,s),{ code:"LAGE_AUSGANG_UNKLAR" });
  });
  await test("Bestaetigte Pruefung und Entwurf ueberleben verlorenen Cache-Abschluss", async () => {
    const s=store(), first=await C.begin(args,s), draft={ paragraphs:[] }, review={ pruefungen:[] };
    await first.onDraft(draft); await first.beforeReview(); await first.onReview(review);
    const next=await C.begin(args,s); A.deepEqual(next.entwurf,draft); A.deepEqual(next.pruefung,review);
    await next.onDraft(draft); await next.beforeReview(); await next.onReview(review); A.equal(s.rows.size,4);
  });
  await test("Konkurrierende Prozesse erhalten nur eine Startfreigabe", async () => {
    const s=store(), results=await Promise.allSettled([C.begin(args,s),C.begin(args,s)]);
    A.equal(results.filter(r=>r.status==="fulfilled").length,1);
  });
  await test("Konkurrierende Fortsetzungen bezahlen hoechstens eine neue Pruefung", async () => {
    const s=store(), first=await C.begin(args,s); await first.onDraft({ paragraphs:[] });
    const a=await C.begin(args,s), b=await C.begin(args,s);
    const results=await Promise.allSettled([a.beforeReview(),b.beforeReview()]);
    A.equal(results.filter(r=>r.status==="fulfilled").length,1);
  });
  await test("Unklare Schreibantwort wird ausschliesslich lesend geklaert", async () => {
    const s=store(), insert=s.insertLageVerarbeitungsbeleg; let calls=0;
    s.insertLageVerarbeitungsbeleg=async row=>{ calls++; await insert(row); throw Error("Antwort verloren"); };
    await C.begin(args,s); A.equal(calls,1);
    const unavailable=store(); let denied=0;
    unavailable.insertLageVerarbeitungsbeleg=async()=>{ denied++; throw Error("nicht bestaetigt"); };
    await A.rejects(C.begin(args,unavailable),{ code:"LAGE_AUSGANG_UNKLAR" }); A.equal(denied,1);
  });
  await test("Manipulierter und fremder Beleg bleibt gesperrt", async () => {
    const s=store(), first=await C.begin(args,s); await first.onDraft({ paragraphs:[] });
    const row=[...s.rows.values()].find(row=>row.payload.phase==="entwurf"); row.payload.antwort={ manipuliert:true };
    await A.rejects(C.begin(args,s),{ code:"LAGE_AUSGANG_UNKLAR" });
    await A.rejects(S.getLageVerarbeitungsbeleg("fremd",row.id,{ bereit:true,request:async()=>[] }),/ziel-ungueltig/);
    await A.rejects(first.onDraft(null),{ code:"LAGE_AUSGANG_UNKLAR" });
  });
  await test("Storage nutzt ausschliesslich kleine mandatsgebundene Insert-only-Zeilen", async () => {
    const entry=C.eintrag({ ...args,eingabeHash:"a".repeat(64),phase:"start",owner:"12345678-1234-1234-1234-123456789012" });
    const request=async(url,opts)=>{ A.match(url,/user_id=eq.synthetik-kern/);
      if(opts){ A.equal(opts.method,"POST"); A.match(opts.headers.Prefer,/ignore-duplicates/); return [{id:entry.id,user_id:entry.user_id}]; }
      A.match(url,/id=eq.bf-synthetik-kern-lage-verarbeitung-/); return [entry]; };
    A.equal((await S.insertLageVerarbeitungsbeleg(entry,{bereit:true,request})).saved,true);
    A.deepEqual(await S.getLageVerarbeitungsbeleg(args.userId,entry.id,{bereit:true,request}),entry);
    await A.rejects(S.getLageVerarbeitungsbeleg(args.userId,entry.id,{bereit:true,request:async()=>[{...entry,user_id:"fremd"}]}));
  });
  await test("Neue Claim-RPCs: kein alter Fallback und kein synthetisches Feld im Fortschritts-CAS", async()=>{
    const source=fs.readFileSync(require.resolve("../lib/helmut/storage"),"utf8");
    const part=source.slice(source.indexOf("async function jobQueueClaimById("),source.indexOf("async function jobOutboxErneutVorlegen("));
    const code=part.slice(0,part.indexOf("\nasync function ",1)>0?part.indexOf("\nasync function ",1):undefined);
    const payload={ dokumentIds:["rd-test"],__helmutJobFenster:"2026-11-13T00Z",
      __helmutJobEntstanden:"2026-11-12T01:00:00Z",__helmutJobFaellig:"2026-11-12T03:00:00Z" };
    const context={jobQueueBereit:()=>true,isMissingReservationRpcError:()=>false,jobQueueRpc:async(name)=>{
      A.equal(name,"helmut_claim_tagesauftrag");return [{uebernommen:true,payload,id:"test"}]; }};
    const claim=vm.runInNewContext(code+"\njobQueueClaimById",context);
    const result=await claim({jobId:"test",owner:"worker"});
    A.equal(result.freshnessWindow,"2026-11-13T00Z"); A.equal(JSON.stringify(result.payload),JSON.stringify({dokumentIds:["rd-test"]}));
    A.equal(result.createdAt,"2026-11-12T01:00:00Z");A.equal(result.dueAt,"2026-11-12T03:00:00Z");
  });
  await test("Bestaetigte Draft-/Review-Fortsetzung ruft kein Modell auf und prueft Inhalt erneut", async()=>{
    process.env.HELMUT_AI_MODE="openai"; process.env.OPENAI_API_KEY="lokale-attrappe";
    const ai=require("../lib/helmut/ai");
    const paragraphs=[{text:"Die Quelle berichtet ueber einen Entwurf.",vorgang_ids:["vg-test"],quelle_id:"q-test",
      auswahlbegruendung:"Arbeit und Soziales: Institutionelle Passung zum Ausschuss Arbeit und Soziales.",
      mandatsbezug:{feld:"ausschuss",wert:"Arbeit und Soziales"}}];
    paragraphs.push({...paragraphs[0],text:"Ein Termin ist noch nicht benannt."});
    const sources=[{vorgang_id:"vg-test",quellenbelege:[{quelle_id:"q-test",url:"https://example.org/entwurf",titel:"Die Quelle berichtet ueber einen Entwurf. Ein Termin ist noch nicht benannt.",quelle:"Test"}]}];
    const review={pruefungen:[{absatz:0,quelle_id:"q-test",belegfeld:"titel",vollstaendig_belegt:true,themenrein:true,
      profilbezug:true,textart:"konkreter_sachverhalt",pruefbegruendung:"Benannter Vorschlag mit Quellenbeleg.",
      mandatsbegruendung:"Der benannte Vorschlag betrifft die fachliche Aufgabe des Ausschusses Arbeit und Soziales."}],vergleiche:[{
        erster_absatz:0,zweiter_absatz:1,eigenstaendige_sachverhalte:true,
        pruefbegruendung:"Der zweite Absatz nennt den noch offenen Termin als zusaetzliche Angabe."}]};
    review.pruefungen.push({...review.pruefungen[0],absatz:1});
    let drafts=0,reviews=0;
    const result=await ai.generateLageBriefing(sources,{committees:["Arbeit und Soziales"]},{politicianId:args.userId,
      gespeicherterEntwurf:{paragraphs},gespeichertePruefung:review,onDraft:async()=>drafts++,onReview:async()=>reviews++});
    A.equal(result.paragraphs.length,2); A.equal(drafts,1); A.equal(reviews,1);
    process.env.HELMUT_AI_MODE="off";delete process.env.OPENAI_API_KEY;
    A.equal((await ai.generateLageBriefing(sources,{committees:["Arbeit und Soziales"]},{gespeicherterEntwurf:{paragraphs},gespeichertePruefung:review})).paragraphs.length,2);
    process.env.HELMUT_AI_MODE="openai";process.env.OPENAI_API_KEY="lokale-attrappe";
    await A.rejects(ai.generateLageBriefing(sources,{committees:["Arbeit und Soziales"]},{gespeicherterEntwurf:{paragraphs},
      gespeichertePruefung:{pruefungen:[],vergleiche:[]}}),{code:"LAGE_AI_FAILURE"});
    await A.rejects(ai.generateLageBriefing(sources,{committees:["Arbeit und Soziales"]}, {gespeicherterEntwurf:{paragraphs},beforeReview:async()=>{throw Object.assign(Error("unklar"),{code:"LAGE_AUSGANG_UNKLAR"});}}),{code:"LAGE_AUSGANG_UNKLAR"});
    const denied=ai.markiereNichtGesendet(Error("Anbieter vor Versand gesperrt"));
    await A.rejects(ai.generateLageBriefing(sources,{committees:["Arbeit und Soziales"]},{gespeicherterEntwurf:{paragraphs},beforeReview:async()=>{throw denied;}}),error=>error===denied);
  });
  await test("Quellenstand nutzt keine frischen Bearbeitungszeitstempel",()=>{
    const D=require("../lib/helmut/tagespaket-auslieferung");
    A.equal(D.datenstand({briefing:{publishedAt:"2026-11-12T08:00:00Z",lastUpdated:"2026-11-13T08:00:00Z"}}),"2026-11-12T08:00:00Z");
  });
  await test("Lesende Wiederaufnahme legt ohne Modellbedarf keinen Start an",async()=>{
    const s=store(); A.equal(await C.begin({...args,nurLesen:true},s),null); A.equal(s.rows.size,0);
    const first=await C.begin(args,s); await first.onDraft({paragraphs:[]}); await first.beforeReview(); await first.onReview({pruefungen:[]});
    const saved=await C.begin({...args,nurLesen:true},s); A.deepEqual(saved.pruefung,{pruefungen:[]}); A.equal(s.rows.size,4);
  });
  await test("Globale Modellgrenze laesst hoechstens zwei wirkliche Arbeiten zu",async()=>{
    const G=require("../lib/helmut/modell-arbeitsgrenze"); let active=0,max=0,started=0; const finish=[];
    const backend={klasseBelege:async({max:limit,klasse,ttlMs})=>{
      A.equal(klasse,"modellaufruf");A.equal(limit,2);A.ok(ttlMs>300000);
      if(active>=limit)return {erlaubt:false};active++;max=Math.max(max,active);return {erlaubt:true,slot:String(active)};
    },klasseGebeFrei:async()=>{active--;}};
    const work=()=>G.begrenzt(()=>{started++;return new Promise(resolve=>finish.push(resolve));},backend);
    const a=work(),b=work();await new Promise(resolve=>setImmediate(resolve));
    await A.rejects(work(),{code:"LLM_BUDGET_EXHAUSTED",kiNichtGesendet:true});
    A.equal(active,2);A.equal(started,2);A.equal(max,2);
    // Ein aeusserer Zeitstopp beendet die eigentliche Arbeit nicht.
    await Promise.race([a,Promise.resolve("aeussere Frist")]);A.equal(active,2);
    finish.forEach(resolve=>resolve("fertig"));await Promise.all([a,b]);A.equal(active,0);
    let called=false;await A.rejects(G.begrenzt(()=>{called=true;},{klasseBelege:async()=>{throw Error("db");}}),{kiNichtGesendet:true});A.equal(called,false);
  });
  await test("Tagesversorgung liest keine unbeteiligten historischen Rueckstaende",async()=>{
    const V=require("../lib/helmut/quellen-versorgungsstand"),queries=[];
    const base={mandat:args.userId,jetztMs:args.now.getTime(),fenster:args.tag+"T00Z",
      env:{HELMUT_SCALABLE_PIPELINE:"on",HELMUT_QUELLEN_ARBEITSFENSTER:"on"},
      deps:{planungsrest:{lesen:async()=>({zustand:"fertig"}),offene:async()=>{throw Error("historischer Scan verboten");}},
        offeneVorbedingungen:async q=>{queries.push(q);A.ok(q.fenster);return {verfuegbar:true,offen:0,fehlgeschlagen:0};}}};
    A.equal((await V.lese(base)).zustand,"kein-bekannter-rueckstand");A.equal(queries.length,1);A.equal(queries[0].mandat,args.userId);
    base.deps.offeneVorbedingungen=async()=>({verfuegbar:true,offen:1,fehlgeschlagen:0});A.equal((await V.lese(base)).zustand,"offen");
    base.deps.offeneVorbedingungen=async()=>({verfuegbar:false});A.equal((await V.lese(base)).zustand,"unbekannt");
  });
  await test("Belegbar nicht gesendete Kapazitaetskollision gibt nur eigene Startphase frei",async()=>{
    const s=store(), first=await C.begin(args,s), ai=require("../lib/helmut/ai");
    A.equal(await first.nichtGesendet(Object.assign(Error("behauptet"),{kiNichtGesendet:true})),false); A.equal(s.rows.size,1);
    const denied=ai.markiereNichtGesendet(Error("vor Versand gesperrt"));
    A.equal(await first.nichtGesendet(denied),true);A.equal(s.rows.size,0);
    const retry=await C.begin(args,s);await retry.onDraft({paragraphs:[]});await retry.beforeReview();
    A.equal(s.rows.size,3);await retry.nichtGesendet(denied);A.equal(s.rows.size,2);
    const reviewRetry=await C.begin(args,s);A.deepEqual(reviewRetry.entwurf,{paragraphs:[]});
    await reviewRetry.beforeReview(); A.equal(s.rows.size,3);
    await A.rejects(C.begin(args,s),{code:"LAGE_AUSGANG_UNKLAR"});
    const id=[...s.rows.values()].find(r=>r.payload.phase==="pruefstart").id;
    await A.rejects(S.loeseLageVerarbeitungsstart(args.userId,id.replace(/pruefstart$/,"entwurf"),"12345678-1234-1234-1234-123456789012",{bereit:true}),/ungueltig/);
    let called=false;await S.loeseLageVerarbeitungsstart(args.userId,id,"12345678-1234-1234-1234-123456789012",{bereit:true,request:async(url,opts)=>{
      called=true;A.equal(opts.method,"DELETE");A.match(url,/user_id=eq.synthetik-kern/);A.match(url,/payload->>owner=eq./);return [];}});A.equal(called,true);
  });
  await test("Echter Modellzugang stoppt bei voller verteilter Grenze vor Kosten und Versand",async()=>{
    const ai=require("../lib/helmut/ai"),old=S.klasseBelege;
    const before={...process.env};let slots=0;
    process.env.HELMUT_SCALABLE_PIPELINE="on";process.env.HELMUT_KLASSEN_GRENZEN="on";
    process.env.HELMUT_AI_MODE="openai";process.env.OPENAI_API_KEY="lokale-attrappe";
    S.klasseBelege=async()=>{slots++;return {erlaubt:false};};
    try{await A.rejects(ai.requestText("synthetischer Test",{politicianId:args.userId},{model:"gpt-5-mini"}),error=>{
      A.equal(error.code,"LLM_BUDGET_EXHAUSTED");A.equal(ai.istInternerNichtversandBeleg(error),true);return true;
    });A.equal(slots,1);}
    finally{S.klasseBelege=old;for(const key of ["HELMUT_SCALABLE_PIPELINE","HELMUT_KLASSEN_GRENZEN","HELMUT_AI_MODE","OPENAI_API_KEY"]){if(Object.hasOwn(before,key))process.env[key]=before[key];else delete process.env[key];}}
  });
  await test("Bereits bezahlter Entwurf behaelt Reservierung bei spaeterem Budgetstopp",async()=>{
    const P=require("../lib/helmut/scalable-pipeline");
    for(const paid of [true,false]){
      const reports=[];
      const result=await P.HANDLER.tenant_narrative({id:"synthetisch",tenantId:args.userId,
        freshnessWindow:args.tag+"T00Z",payload:{mandatsId:args.userId},createdAt:args.now.toISOString()}, {
        env:{HELMUT_SCALABLE_PIPELINE:"on",HELMUT_NARRATIV_QUEUE:"on"},now:()=>args.now.getTime(),
        offeneVorbedingungen:async()=>({verfuegbar:true,offen:0}),getActiveProfile:async()=>({id:args.userId}),istDeaktiviert:()=>false,
        lageNarrativ:async()=>({available:false,reason:"budget",kostenPhaseBestaetigt:paid}),
        budget:{reserviere:async()=>({erlaubt:true}),melde:async r=>reports.push(r)}});
      A.equal(result.zurueckgestellt,true);A.equal(reports[0].ungenutzt,!paid);
    }
  });
  console.log(`${n}/${n} gezielte Beleg-/Kosten-/Adapterpruefungen bestanden.`);
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
