"use strict";

// Kein Modellurteil: prueft den Auftrag an der echten Aufrufgrenze mit Attrappen.
const assert = require("node:assert/strict");
const U = require("../lib/helmut/understanding");
const A = require("../lib/helmut/artikelkontext");
const cluster = { documents: [{ id: "rd-mandatsneutral", title: "Rat berät Verkehrsbericht",
  summary: "Der Rat diskutiert den Bericht zum Bahnverkehr.", source_name: "Testmedium",
  url: "https://example.org/verkehr/bericht", published_at: "2026-09-14T10:00:00Z" }] };
const antwort = {
  headline: "Rat berät Verkehrsbericht", was_ist_passiert: "Der Rat diskutiert den Bericht.",
  warum_wichtig: "Der Bericht behandelt den Bahnverkehr.", wer_ist_betroffen: "Der Rat",
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [], zeitdruck: "keiner",
  handlungsempfehlung: "Keine Handlung aus den gelieferten Quellen ableitbar.", confidence_score: 70,
  why_relevant: "", recommendation: "", risk_of_no_action: "", opportunity_summary: "",
  recommended_communication: "", action_items: [], risk_level: "unknown", opportunity_level: "unknown",
  recommended_communication_struct: { communicationLine: "", recommendedChannel: "unknown",
    recommendedFormat: "unknown", suggestedOutputs: [] }, action_items_struct: []
};
function anweisungen(prompt) { return prompt.split("\nQuellen:\n")[0]; }
function neutral(prompt) {
  const a = anweisungen(prompt);
  // Der vorherige Prompt erzwingt genau diese unbelegten Annahmen.
  for (const muster of [/fuer dieses Mandat politisch relevant/, /warum betrifft es dieses Profil/,
    /womit das Mandat sich glaubwuerdig besetzen kann/, /direkt zur\/zum Abgeordneten/,
    /professionellen Du/, /BRIEFING-TYP:/]) assert.doesNotMatch(a, muster);
  assert.match(a, /globale Analyse ohne Mandatsprofil/);
  assert.match(a, /Oeffentliche Akteure.*keine Identitaet oder Profilangaben/);
  assert.match(a, /in KEINEM Feld.*Reputation.*Positionierung.*Unterstuetzung/);
  assert.match(a, /Handlungsoptionen.*Voraussetzung/);
  assert.match(a, /optionale Texte leer, Listen \[\] und Stufen unknown/);
}
function kontext() {
  const d = cluster.documents[0];
  return { version: 1, dokumentId: d.id, quellenHash: A.quellenstandHash(d), artikelUrl: d.url,
    artikelTitel: d.title, herkunft: "manueller-originalvergleich", gelesenAm: "2026-09-18T10:00:00Z",
    absatzPosition: 1, text: "Die öffentliche Beratung des Rates ist beendet." };
}
function stand() {
  const p = { prompts: [], ko: [], starts: 0, frei: 0 };
  const vertrag = {
    reserviere: async () => ({ erlaubt: true, fencing: 1 }),
    modellstart: async () => { p.starts++; return { erlaubt: true }; },
    schreibrecht: async () => ({ erlaubt: true }),
    speichere: async ({ ko }) => { p.ko.push(ko); return { gespeichert: true, pruefbar: true }; },
    ausgangUnbekannt: async () => { throw new Error("Unerwarteter unbekannter Ausgang"); },
    freigabe: async () => { p.frei++; }, freigabeOhneAufruf: async () => { p.frei++; },
    vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
    vormerkungErhoehe: async () => {}, vormerkungLoese: async () => {}
  };
  const deps = { canSpend: async () => ({ allowed: true }),
    requestUnderstanding: async prompt => { neutral(prompt); p.prompts.push(prompt); return structuredClone(antwort); },
    save: async ko => { p.ko.push(ko); return true; }, saveSources: async () => {},
    markFailed: async () => { throw new Error("Unerwartete Fehlerablage"); }, logSkip: () => {}, modelName: () => "attrappe",
    findVorgangCandidates: async () => [], listVorgangDocuments: async () => [] };
  return { p, vertrag, deps };
}
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
async function main() {
  await test("Allgemeiner Auftrag erzwingt keinen unbekannten Mandatsbezug", () => neutral(U.buildUnderstandingPrompt(cluster)));
  await test("Tagesoptionen und fremde Profilfelder erzeugen kein persoenliches globales Wissensobjekt", () => {
    const base = U.buildUnderstandingPrompt(cluster);
    for (const briefingType of [undefined, "daily", "morning", "midday", "evening", "unbekannt"]) {
      const c = { ...cluster, profile: { name: "Nicht als Leser geliefert" } };
      const p = U.buildUnderstandingPrompt(c, { briefingType, profile: { wahlkreis: "Nicht geliefert" } });
      assert.equal(p, base); neutral(p);
    }
  });
  await test("Quellen bleiben woertlich erhalten, auch wenn ein Akteur ueber sein Mandat spricht", () => {
    const c = structuredClone(cluster);
    c.documents[0].summary = 'Der Redner sagte: "Mein Mandat ist betroffen."';
    const p = U.buildUnderstandingPrompt(c);
    const source = JSON.parse(p.split("\n").find(l => l.startsWith('{"quelle_id":')));
    assert.equal(source.auszug, c.documents[0].summary); neutral(p);
  });
  await test("Erstverstehen und Aktualisierung senden den neutralen Auftrag einmal, auch mit Artikelkontext", async () => {
    for (const update of [false, true]) for (const zusatz of [false, true]) {
      const s = stand(), vorgangId = "vg-mandatsneutral";
      const option = zusatz ? { artikelkontextVersuch: kontext() } : {};
      const existing = { id: "ko-" + vorgangId, ko_version: 3, headline: "Erhaltener Bestand" };
      const vorher = structuredClone(existing);
      const r = update ? await U.understandUpdate(cluster, s.deps, { vorgangId, existing,
        neueDocs: cluster.documents, neueAnker: [], spur: {}, alleDocs: cluster.documents, vertrag: s.vertrag, ...option })
        : await U.understandOneCluster(cluster, s.deps, { vorgangId, existing: null, vertrag: s.vertrag, ...option });
      assert.equal(r.status, update ? "updated" : "saved");
      assert.deepEqual(existing, vorher);
      assert.deepEqual(s.p.prompts, [U.buildUnderstandingPrompt(cluster, option)]);
      assert.equal(s.p.starts, 1); assert.equal(s.p.frei, 0); assert.equal(s.p.ko.length, 1);
      for (const feld of ["why_relevant", "recommendation", "risk_of_no_action", "opportunity_summary", "recommended_communication"])
        assert.equal(s.p.ko[0][feld], "");
      for (const feld of ["risiken", "chancen", "action_items", "action_items_struct"]) assert.deepEqual(s.p.ko[0][feld], []);
      assert.equal(s.p.ko[0].risk_level, "unknown"); assert.equal(s.p.ko[0].opportunity_level, "unknown");
      assert.equal(s.p.ko[0].handlungsempfehlung, antwort.handlungsempfehlung);
    }
  });
  await test("Auswertung verwendet denselben Auftrag ohne zusaetzlichen Aufruf", async () => {
    let count = 0;
    const r = await U.evaluateUnderstandingCase({ name: "mandatsneutral", raw_documents: cluster.documents }, async prompt => {
      count++; neutral(prompt); return structuredClone(antwort);
    });
    assert.equal(count, 1); assert.equal(r.valid, true);
  });
  console.log(`${pass}/${pass} Gruppen erfolgreich`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
