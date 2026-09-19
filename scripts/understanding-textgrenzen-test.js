"use strict";

// Ganzer Inhalt oder sichtbarer Vertragsfehler; keine Fachbehauptung aus einem
// abgeschnittenen Praefix. Feste Gegenfaelle, keine Modelle oder Production.
const A = require("node:assert/strict");
const U = require("../lib/helmut/understanding");
const S = require("../lib/helmut/understanding-schema");
const id = "vg-textgrenze-neutral";
const quelle = { id: "rd-textgrenze-neutral", title: "Stadtrat beraet Schulsanierung",
  summary: "Der Stadtrat beraet einen Vorschlag zur Schulsanierung. Ein Beschluss steht noch aus.",
  url: "https://example.org/schulsanierung", source_name: "Testquelle", published_at: "2026-10-02T08:00:00Z" };
function basis() {
  return { headline: quelle.title, display_title: quelle.title, was_ist_passiert: quelle.summary,
    warum_wichtig: "Die Beratung betrifft die Schulsanierung.", wer_ist_betroffen: "Der Stadtrat.",
    handlungsempfehlung: "Die angekuendigte Beratung beobachten; ein Beschluss ist noch offen.",
    zeitdruck: "keiner", confidence_score: 60, display_summary: quelle.summary,
    why_relevant: "Die Quelle nennt eine Beratung zur Schulsanierung.",
    parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
    action_items: [], action_items_struct: [], recommended_communication_struct: {
      communicationLine: "Eine Entscheidung zur Schulsanierung steht noch aus.",
      recommendedChannel: "internal", recommendedFormat: "internalLine", suggestedOutputs: [] } };
}
function lang(max) {
  const anfang = "Die Vergabe ist beschlossen. ";
  return anfang + "Einzelheiten zum damaligen Bericht. ".repeat(Math.ceil(max / 30))
    + "Diese Behauptung weist die Quelle ausdruecklich als unzutreffend zurueck.";
}
const assemble = a => U.assembleKnowledgeObject(a, { documents: [quelle] }, id);
async function lauf(a, update = false) {
  const p = { writes: [], calls: 0, unknown: 0, failed: 0 };
  const existing = update ? { id: "ko-" + id, vorgang_id: id, ko_version: 3,
    was_ist_passiert: "Unveraenderter alter Sachstand.", headline: "Erhaltener Bestand" } : null;
  const before = structuredClone(existing), original = structuredClone(a);
  const v = { reserviere: async () => ({ erlaubt: true, fencing: 1 }),
    modellstart: async () => ({ erlaubt: true }), schreibrecht: async () => ({ erlaubt: true }),
    speichere: async ({ ko }) => { p.writes.push(ko); return { gespeichert: true, pruefbar: true }; },
    ausgangUnbekannt: async () => { p.unknown++; },
    freigabe: async () => { throw Error("Keine Freigabe eines bezahlten Ergebnisses"); },
    freigabeOhneAufruf: async () => { throw Error("Kein zweiter Modellversuch"); },
    vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
    vormerkungErhoehe: async () => {}, vormerkungLoese: async () => {} };
  const deps = { canSpend: async () => ({ allowed: true }),
    requestUnderstanding: async () => { p.calls++; return a; },
    save: async ko => { p.writes.push(ko); return { saved: true }; }, saveSources: async () => {},
    markFailed: async () => { p.failed++; }, logSkip: () => {}, modelName: () => "offline",
    findVorgangCandidates: async () => [], listVorgangDocuments: async () => [] };
  const c = { documents: [quelle] }, args = { vorgangId: id, existing, vertrag: v };
  const result = update ? await U.understandUpdate(c, deps,
    { ...args, neueDocs: [quelle], neueAnker: [], spur: {}, alleDocs: [quelle] })
    : await U.understandOneCluster(c, deps, args);
  A.deepEqual(existing, before); A.deepEqual(a, original); A.equal(p.calls, 1);
  return { result, ...p };
}
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("PASS " + name); }
  catch (e) { failed++; console.error("FAIL " + name + ": " + e.message); }
}
(async () => {
  await test("Alle optionalen Prosaobergrenzen erzeugen keinen falschen kurzen Praefix", () => {
    for (const field of ["display_summary", "why_relevant", "risk_of_no_action", "opportunity_summary", "recommended_communication"]) {
      const a = basis(), max = S.KNOWLEDGE_OBJECT_SCHEMA.properties[field].maxLength;
      a[field] = lang(max); delete a.recommended_communication_struct;
      const k = assemble(a);
      A.equal(k[field], "", field); A.equal(k.was_ist_passiert, quelle.summary);
      A.equal(k.warum_wichtig, a.warum_wichtig); A.equal(S.validateKnowledgeObject(k).valid, true);
    }
  });
  await test("Kernprosa jenseits800 Zeichen wird nicht als kuerzere Behauptung gespeichert", async () => {
    for (const field of ["was_ist_passiert", "warum_wichtig", "wer_ist_betroffen", "handlungsempfehlung"]) {
      for (const update of [false, true]) {
        const a = basis(); a[field] = lang(800); const r = await lauf(a, update);
        A.equal(r.result.status, "skipped-invalid"); A.equal(r.writes.length, 0);
        A.equal(r.unknown, 1); A.equal(r.failed, update ? 0 : 1);
      }
    }
  });
  await test("Ein ungueltiges Anzeigefeld verwirft keine sonst gueltige Analyse", async () => {
    for (const update of [false, true]) {
      const a = basis(); a.display_summary = lang(320); a.why_relevant = lang(260);
      const r = await lauf(a, update); A.equal(r.result.status, update ? "updated" : "saved");
      A.equal(r.writes.length, 1); A.equal(r.unknown, 0);
      A.equal(r.writes[0].display_summary, ""); A.equal(r.writes[0].why_relevant, "");
      A.equal(r.writes[0].was_ist_passiert, quelle.summary);
      A.equal(r.writes[0].warum_wichtig, a.warum_wichtig);
    }
  });
  await test("Listen behalten vollstaendige positive Eintraege statt abgeschnittener Risiken und Aktionen", () => {
    for (const field of ["risiken", "chancen", "action_items"]) {
      const a = basis(); a[field] = [lang(200), "Eine Entscheidung ist noch offen."];
      A.deepEqual(assemble(a)[field], ["Eine Entscheidung ist noch offen."], field);
    }
    const a = basis(); a.headline = lang(800); A.equal(assemble(a).headline, "");
    for (const field of ["parteien", "mentioned_people"]) {
      a[field] = ["Unteilbare Bezeichnung ".repeat(20)]; A.deepEqual(assemble(a)[field], []);
    }
  });
  await test("Strukturierte Handlung bleibt mit Bedingung und Frist unteilbar", () => {
    const gut = { title: "Beratung beobachten", description: "Der Stadtrat beraet erst; ein Beschluss steht aus.",
      dueHint: "", priority: "unknown", actionType: "monitor" };
    for (const [field, max] of Object.entries({ title: 160, description: 400, dueHint: 80 })) {
      const a = basis(); a.action_items_struct = [{ ...gut, [field]: lang(max) }, gut];
      const k = assemble(a); A.deepEqual(k.action_items_struct, [gut], field);
      A.deepEqual(k.action_items, [gut.title], "Kein Titel aus einer Handlung mit verlorener Bedingung");
    }
  });
  await test("Explizite zu lange Kommunikationslinie wird nicht durch einen kuerzeren Altwert ersetzt", () => {
    const a = basis(); a.recommended_communication = "Ein Beschluss ist noch offen.";
    a.recommended_communication_struct.communicationLine = lang(240);
    const k = assemble(a); A.equal(k.recommended_communication_struct.communicationLine, "");
    A.equal(k.recommended_communication, a.recommended_communication);
    a.recommended_communication_struct.communicationLine = "";
    A.equal(assemble(a).recommended_communication_struct.communicationLine, a.recommended_communication);
  });
  await test("Vollstaendige positive, bedingte und verneinte Aussagen bleiben an den Grenzen erhalten", async () => {
    const a = basis(); a.display_summary = "X".repeat(319) + ".";
    a.why_relevant = "Y".repeat(259) + ".";
    a.was_ist_passiert = "Z".repeat(799) + ".";
    const k = assemble(a); A.equal(k.display_summary, a.display_summary);
    A.equal(k.why_relevant, a.why_relevant); A.equal(k.was_ist_passiert, a.was_ist_passiert);
    for (const update of [false, true]) {
      const b = basis(), r = await lauf(b, update); A.equal(r.result.status, update ? "updated" : "saved");
      A.equal(r.writes[0].was_ist_passiert, b.was_ist_passiert);
      A.equal(r.writes[0].handlungsempfehlung, b.handlungsempfehlung);
    }
  });
  await test("Der Auswerter benutzt dieselbe ganze Darstellung und bleibt kein anderer Fachpfad", async () => {
    const a = basis(); a.display_summary = lang(320); let calls = 0;
    const r = await U.evaluateUnderstandingCase({ name: "textgrenze", raw_documents: [quelle] }, async () => { calls++; return a; });
    A.equal(calls, 1); A.equal(r.valid, true); A.equal(r.ko.display_summary, "");
    A.equal(r.ko.was_ist_passiert, quelle.summary);
  });
  console.log(`${passed} PASS, ${failed} FAIL`); if (failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
