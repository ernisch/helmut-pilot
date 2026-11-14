"use strict";

// Neue Checkpointgegenfaelle: gebundene Ausgabe statt technischer Erfolg.
// Kein alter Suitenlauf, Netz, Modell, Hauptblob oder Schreiben der Historie.
const A = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const L = require("../lib/helmut/briefing-lauf"), B = require("../lib/helmut/briefing-speicher"),
  F = require("../lib/helmut/briefing-frische"), S = require("../lib/helmut/storage"),
  V = require("../lib/helmut/briefing-bereichsvertrag"), AI = require("../lib/helmut/ai");
if (process.argv.length !== 2) throw Error("Unbekannte Testauswahl");
const profile = { id: "synthetischer-fensterkunde", committees: ["Arbeit und Soziales"] };
const day = "2026-11-14", now = new Date(day + "T09:00:00Z"), clone = structuredClone;
const originalAI = { ...AI }, originalReserve = S.reserveLlmCall, forbidden = [];
for (const key of Object.keys(AI)) if (/^(generate|request|enrich|assess|extractKnowledgeObjectTags)/.test(key)
  && typeof AI[key] === "function") AI[key] = () => { forbidden.push(key); throw Error("Modell verboten"); };
S.reserveLlmCall = () => { forbidden.push("Kostenreserve"); throw Error("Kostenreserve verboten"); };
function stand(tag, kind = "gap") {
  const at = `${tag}T${tag === "2026-11-13" ? "22:05:05.483" : "08:26:31.371"}Z`;
  const primary = { id: "vg-synthetische-vorbereitung", title: "Synthetische angekuendigte Nachbesserungen",
    sourceIds: ["rd-synthetisch"], sourceUrl: "https://example.invalid/original/nachbesserungen" };
  const state = { profileId: profile.id, tenantId: profile.id, items: [], primaryItem: null, primaryVorgangId: null,
    status: "empty", qualityStatus: "empty", errorState: null, emptyState: { kind },
    versorgung: { version: 1, zustand: kind === "quiet" ? "kein-bekannter-rueckstand" : "offen" } };
  if (kind === "inhalt") Object.assign(state, { status: "stale", qualityStatus: "stale", emptyState: null,
    primaryItem: primary, primaryVorgangId: primary.id,
    tagesAnlass: { art: "angekuendigter-schritt", documentIds: ["rd-synthetisch"],
      recommendation: "Prüfen Sie, ob die angekündigten Nachbesserungen inzwischen vorliegen.",
      beleg: { documentId: "rd-synthetisch", url: primary.sourceUrl,
        publishedAt: "2026-11-06T03:57:00Z", text: "Nachbesserungen am benannten Entwurf wurden angekuendigt." } } });
  const briefing = { available: true, items: [{ vorgangId: primary.id }], currentHelmutState: state, currentRadarState: {} };
  const basis = { id: `bf-${profile.id}-mandatsbriefing-${tag}`, user_id: profile.id,
    slot: "mandatsbriefing", generated_at: at, briefing };
  const receipt = { id: L.laufId(profile.id, tag), user_id: profile.id, slot: L.SLOT_ERFOLG, generated_at: at,
    payload: L.quittung({ tenantId: profile.id, berlinTag: tag, erzeugtAm: at, status: L.STATUS_ERFOLG,
      fensterStart: "2026-11-13T22:05:05.483Z", ausgabeBeleg: { version: 1, mandat: profile.id,
        tag, paketId: basis.id, profilHash: B.profilHash(profile), briefingHash: B.hash(briefing) } }) };
  return { basis, receipt };
}
function welt(entries = []) {
  const map = new Map(entries.map(e => [e.receipt.payload.berlinTag, e])), reads = [], requests = [];
  const storage = {
    getRenderedBriefingV3: async (id, slot, tag, options) => {
      A.equal(id, profile.id); A.equal(slot, L.SLOT_ERFOLG); A.equal(options.strict, true);
      reads.push(tag); return clone(map.get(tag)?.receipt || null);
    },
    getBriefingFenstergrundlage: (id, tag) => S.getBriefingFenstergrundlage(id, tag, { bereit: true,
      request: async (url, options) => {
        A.equal(options, undefined); requests.push(url);
        const row = map.get(tag)?.basis; return row ? [clone(row)] : [];
      } })
  };
  return { map, reads, requests, storage, run: () => L.fensterFuerMorgen(storage, profile, day, { jetzt: now }) };
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
async function main() {
  await test("Gebundener Gap13 und heutiger Gap14 schliessen kein Fenster vor damaligem Vorbereitungsbriefing12", async () => {
    const a = stand("2026-11-12", "inhalt"), b = stand("2026-11-13"), c = stand(day);
    const w = welt([a,b,c]), before = JSON.stringify([...w.map]), result = await w.run();
    A.equal(result.fenster.start, a.receipt.payload.erzeugtAm); A.equal(result.heutiger.lauf.status, "erfolg");
    A.equal(result.heutiger.checkpoint.zustand, "offen"); A.deepEqual(w.reads, [day,"2026-11-13","2026-11-12"]);
    const doc = { id: "rd-neuer-originalbeleg", url: "https://example.invalid/original/neuer-beleg",
      title: "Synthetischer veroeffentlichter Entwurf", summary: "Ein benannter Entwurf wurde vorgelegt.", published_at: "2026-11-13T13:54:00Z" };
    A.equal(V.tagesAnlass([doc], now, { start: c.receipt.payload.fensterStart }), null);
    A.equal(V.tagesAnlass([doc], now, result.fenster).art, "neue-quelle");
    A.equal(JSON.stringify([...w.map]), before, "Historische Erfolgspakete und Quittungen bleiben unveraendert");
  });
  await test("Heutiger echter Inhaltsabschluss und ehrliche Ruhelage behalten ihr urspruengliches Fenster idempotent", async () => {
    for (const kind of ["inhalt", "quiet"]) {
      const entry = stand(day, kind), w = welt([entry]);
      const a = await w.run(), b = await w.run();
      A.equal(a.fenster.start, entry.receipt.payload.fensterStart); A.equal(a.fenster.quelle, "lauf-quittung");
      A.deepEqual(a,b); A.deepEqual(w.reads,[day,day]);
      A.equal(a.heutiger.checkpoint.art, kind === "quiet" ? "ruhelage" : "vorbereitungsstand");
    }
  });
  await test("Gebundener stale Vorbereitungsstand ist ein damaliger Abschluss ohne neue Frische oder sieben-Tage-Umdeutung", async () => {
    const e = stand("2026-11-12", "inhalt"), before = JSON.stringify(e);
    A.equal(L.qualifiziereFensterCheckpoint(e.receipt.payload,e.basis,{profile,tag:"2026-11-12",jetzt:now}).zustand,"abschluss");
    A.equal(e.basis.briefing.currentHelmutState.status,"stale");
    A.equal(e.basis.briefing.currentHelmutState.tagesAnlass.beleg.publishedAt,"2026-11-06T03:57:00Z");
    A.equal(JSON.stringify(e),before);
    const quiet = stand(day,"quiet"); quiet.basis.briefing.currentHelmutState.versorgung.zustand="offen";
    quiet.receipt.payload.ausgabeBeleg.briefingHash=B.hash(quiet.basis.briefing);
    A.equal(L.qualifiziereFensterCheckpoint(quiet.receipt.payload,quiet.basis,{profile,tag:day,jetzt:now}).zustand,"offen");
  });
  await test("Fehlende oder fremde Hash Profil Mandat Quellen und Speicherbindungen bleiben UNKNOWN statt einen Gap zu erraten", async () => {
    for (const change of [e=>{e.basis=null;},e=>{delete e.receipt.payload.ausgabeBeleg;},
      e=>{e.receipt.payload.ausgabeBeleg.briefingHash="f".repeat(64);},e=>{e.receipt.payload.ausgabeBeleg.profilHash="f".repeat(64);},
      e=>{e.basis.user_id="fremd";},e=>{e.receipt.payload.tenantId="fremd";},
      e=>{e.basis.briefing.currentHelmutState.profileId="fremd";e.receipt.payload.ausgabeBeleg.briefingHash=B.hash(e.basis.briefing);},
      e=>{e.basis.briefing.currentHelmutState.primaryItem.sourceUrl="https://example.invalid/";e.receipt.payload.ausgabeBeleg.briefingHash=B.hash(e.basis.briefing);},
      e=>{e.receipt.payload.fensterStart="ungueltig";},
      e=>{e.receipt.payload.fensterStart=day+"T08:40:00Z";}]) {
      const e=stand(day,"inhalt");change(e);const w=welt([e,stand("2026-11-12","inhalt")]);
      await A.rejects(w.run(),{code:"BRIEFING_FENSTER_UNBEKANNT"});A.deepEqual(w.reads,[day]);
    }
    const w=welt();w.storage.getRenderedBriefingV3=async()=>{throw Error("Transport unklar");};
    await A.rejects(w.run(),{code:"BRIEFING_FENSTER_UNBEKANNT"});
    const previousFlag=process.env.HELMUT_V3_STORE;process.env.HELMUT_V3_STORE="false";
    try {
      A.equal(S.v3StoreReady(),false);
      A.equal(await S.getRenderedBriefingV3(profile.id,L.SLOT_ERFOLG,day),null,"Nonstrict bleibt inert");
      const unavailable=welt(),attempts=[];
      unavailable.storage.getRenderedBriefingV3=(...args)=>{attempts.push(args[2]);return S.getRenderedBriefingV3(...args);};
      await A.rejects(unavailable.run(),{code:"BRIEFING_FENSTER_UNBEKANNT"});
      A.deepEqual(attempts,[day],"Unbereiter nativer Store ist UNKNOWN vor historischem Weiterlesen");
      A.equal(unavailable.requests.length,0);
    } finally {if(previousFlag===undefined)delete process.env.HELMUT_V3_STORE;else process.env.HELMUT_V3_STORE=previousFlag;}
  });
  await test("Ohne qualifizierten Abschluss bleibt der begrenzte Vorabendstandard und maximal zweitaegige Rueckblick unveraendert", async () => {
    const w=welt([stand("2026-11-11","inhalt")]);const result=await w.run();
    A.deepEqual(result.fenster,F.frischeFenster({jetzt:now}));
    A.deepEqual(w.reads,[day,"2026-11-13","2026-11-12"]);A.equal(w.requests.length,0);
  });
  await test("Nativer Paketleser projiziert genau einmal Briefing ohne Lage Historie oder Hauptblob und bleibt mandantengefiltert", async () => {
    const e=stand(day,"inhalt"),w=welt([e]);await w.run();A.equal(w.requests.length,1);
    const q=new URL(w.requests[0],"https://local.invalid");
    A.equal(q.searchParams.get("id"),"eq."+e.basis.id);A.equal(q.searchParams.get("user_id"),"eq."+profile.id);
    A.equal(q.searchParams.get("slot"),"eq.mandatsbriefing");
    A.equal(q.searchParams.get("select"),"id,user_id,slot,generated_at,briefing:payload->briefing");
    for(const rows of [[e.basis,e.basis],[{...e.basis,user_id:"fremd"}],[{...e.basis,id:"fremd"}],{}])
      await A.rejects(S.getBriefingFenstergrundlage(profile.id,day,{bereit:true,request:async()=>rows}));
  });
  await test("Der echte Morgenpfad waehlt die neue gebundene Fenstergrundlage und endet bei UNKNOWN vor jedem Build", async () => {
    const source=fs.readFileSync(require.resolve("../server"),"utf8");
    const start=source.indexOf("        const { heutiger, fenster } = briefingFrische.vertragAktiv()");
    const end=source.indexOf("        const briefing = await withTimeout",start);A(start>0&&end>start);
    const script=new vm.Script("(async()=>{"+source.slice(start,end)+"return {heutiger,fenster};})()");
    const w=welt([stand(day),stand("2026-11-13"),stand("2026-11-12","inhalt")]);
    const run=()=>script.runInNewContext({briefingFrische:{...F,vertragAktiv:()=>true},briefingLauf:L,
      storageModul:w.storage,profile,berlinTag:day,t0:now.getTime(),Date});
    A.equal((await run()).fenster.start,"2026-11-12T08:26:31.371Z");
    w.map.get(day).receipt.payload.ausgabeBeleg.briefingHash="0".repeat(64);
    await A.rejects(run(),{code:"BRIEFING_FENSTER_UNBEKANNT"});
  });
  A.equal(count,7);A.deepEqual(forbidden,[]);
  console.log(`${count}/${count} neue Checkpointgruppen bestanden; keine alten Tests Modelle Datenbank oder historischen Writes.`);
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>{
  Object.assign(AI,originalAI);S.reserveLlmCall=originalReserve;
});
