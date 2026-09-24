"use strict";

// Neutraler Speicherpfadnachweis. Feste Antworten, kein Netz/Modell/Production.
const assert = require("node:assert/strict");
const U = require("../lib/helmut/understanding");
const LEVELS = ["international", "eu", "bund", "land", "kommune"];
const TEXTE = {
  international: "Mehrere Staaten beraten gemeinsam ueber Verkehrswege.",
  eu: "Das Europaeische Parlament beraet ueber Verkehrswege.",
  bund: "Die Bundesregierung beraet ueber Verkehrswege.",
  land: "Die Landesregierung beraet ueber Verkehrswege.",
  kommune: "Der Stadtrat beraet ueber Verkehrswege.",
  unknown: "Es gibt eine Debatte ueber Verkehrswege. Die handelnden Akteure bleiben offen."
};
const ID = "vg-neutrale-ebene";
const T0 = "2026-10-01T08:00:00Z";
function antwort(level) {
  const text = TEXTE[level || "unknown"];
  return { headline: "Debatte ueber Verkehrswege", display_title: "Debatte ueber Verkehrswege",
    was_ist_passiert: text, display_summary: text, warum_wichtig: "Der Bericht betrifft Verkehrswege.",
    wer_ist_betroffen: "Weitere Betroffene sind aus der Quelle nicht ableitbar.",
    handlungsempfehlung: "Keine Handlung aus der Quelle ableitbar.", zeitdruck: "keiner",
    parteien: [], mentioned_parties: [], ministerien: [], mentioned_ministries: [],
    ausschuesse: [], risiken: [], chancen: [], confidence_score: 60,
    ...(level ? { decision_level: level } : {}) };
}
function bestand(level, quelle = "ki") {
  return { id: "ko-" + ID, vorgang_id: ID, status: "neu", understanding_status: "complete",
    ko_version: 4, headline: "Erhaltener Inhalt", was_ist_passiert: "Erhaltener Sachstand.",
    decision_level: level, political_level: level,
    classification_confidence: { level: "high", level_quelle: quelle, level_ermittelt_am: T0 } };
}
async function lauf(modus, analyse, existing, cas = true) {
  const p = { calls: 0, writes: [], failed: 0, unknown: 0, frei: 0, updates: 0, geloest: 0, logs: [] };
  const vorher = structuredClone(existing), originalAntwort = structuredClone(analyse);
  const c = { documents: [{ id: "rd-verkehr", title: "Debatte ueber Verkehrswege",
    summary: analyse.was_ist_passiert, url: "https://example.org/verkehr",
    published_at: "2026-10-02T08:00:00Z", source_name: "Testmedium" }] };
  const originalQuellen = structuredClone(c);
  const v = {
    reserviere: async () => ({ erlaubt: true, fencing: 1 }),
    modellstart: async () => ({ erlaubt: true }), schreibrecht: async () => ({ erlaubt: true }),
    speichere: async ({ ko }) => { p.writes.push(ko); return { gespeichert: true, pruefbar: true }; },
    ausgangUnbekannt: async () => { p.unknown++; },
    freigabe: async () => { p.frei++; }, freigabeOhneAufruf: async () => { p.frei++; },
    vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
    vormerkungErhoehe: async ({ delta }) => { p.updates += delta; },
    vormerkungLoese: async () => { p.geloest++; }
  };
  const deps = {
    canSpend: async () => ({ allowed: true }),
    requestUnderstanding: async prompt => { p.calls++; p.prompt = prompt; return analyse; },
    save: async ko => { p.writes.push(ko); return { saved: true }; }, saveSources: async () => {},
    markFailed: async () => { p.failed++; }, logSkip: s => { p.logs.push(s); }, modelName: () => "attrappe",
    findVorgangCandidates: async () => [], listVorgangDocuments: async () => [{
      id: "rd-vorbericht", title: "Verkehrswege werden untersucht", summary: "Eine Studie untersucht vorhandene Verkehrswege.",
      url: "https://example.org/vorbericht", published_at: T0 }],
    readUpdateRetries: async () => ({}), writeUpdateRetries: async map => { p.updates = map[ID] || 0; }
  };
  // Oeffentlicher Einstieg fuer Erstverstehen, pending und echtes Update.
  const eingang = modus === "pending" ? { ...existing, status: "pending", understanding_status: "pending" } : existing;
  const originalEingang = structuredClone(eingang);
  const r = await U.understandOneCluster(c, deps, { vorgangId: ID, existing: eingang,
    vertrag: cas ? v : null, retriesCtx: {} });
  assert.deepEqual(existing, vorher); assert.deepEqual(eingang, originalEingang);
  assert.deepEqual(analyse, originalAntwort); assert.deepEqual(c, originalQuellen);
  assert.equal(p.calls, 1, "Genau ein Aufruf innerhalb der Verarbeitung: " + JSON.stringify(r));
  const q = p.prompt.split("\n").filter(l => l.startsWith('{"quelle_id":')).map(l => JSON.parse(l))
    .find(q => q.quelle_id === "rd-verkehr");
  assert.equal(q.auszug, analyse.was_ist_passiert, "Tatsaechlich gelieferte Quelle unveraendert");
  return { r, p };
}
function abgewiesen({ r, p }, modus, cas = true, fehler = "decision_level-antwortkonflikt") {
  assert.equal(r.status, "skipped-invalid", JSON.stringify({ status: r.status, writes: p.writes.map(k => ({
    decision_level: k.decision_level, was_ist_passiert: k.was_ist_passiert })) }));
  assert(r.errors.includes(fehler), JSON.stringify(r.errors));
  assert.equal(p.writes.length, 0); assert.equal(p.unknown, cas ? 1 : 0); assert.equal(p.frei, 0);
  assert.equal(p.failed, modus === "update" ? 0 : 1);
  assert.equal(p.updates, modus === "update" ? 1 : 0);
  assert.equal(p.geloest, 0); assert(p.logs.includes("skipped-understanding-invalid"));
}
function gespeichert({ r, p }, modus, analyse, level) {
  assert.equal(r.status, modus === "update" ? "updated" : "saved");
  assert.equal(p.writes.length, 1); assert.equal(p.unknown, 0); assert.equal(p.failed, 0);
  const ko = p.writes[0];
  assert.equal(ko.decision_level, level); assert.equal(ko.political_level, level);
  assert.equal(ko.was_ist_passiert, analyse.was_ist_passiert);
  assert.equal(ko.display_summary, analyse.display_summary);
  assert.equal(ko.ko_version, modus === "update" ? 5 : 1);
  return ko;
}
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
async function main() {
  await test("KI Bestand land plus neue Bundesantwort wird vor jeder Inhaltsspeicherung verworfen", async () => {
    for (const modus of ["update", "pending"]) abgewiesen(await lauf(modus, antwort("bund"), bestand("land")), modus);
  });
  await test("Alle 20 gerichteten Ebenenkonflikte sind in pending und Update gesperrt", async () => {
    for (const alt of LEVELS) for (const neu of LEVELS.filter(l => l !== alt)) for (const modus of ["pending", "update"])
      abgewiesen(await lauf(modus, antwort(neu), bestand(alt)), modus);
  });
  await test("Neutrale Erstermittlung und Bestaetigung aller fuenf Ebenen bleiben speicherbar", async () => {
    for (const level of LEVELS) for (const modus of ["erst", "pending", "update"]) {
      const a = antwort(level), s = await lauf(modus, a, modus === "erst" ? null : bestand(level));
      const ko = gespeichert(s, modus, a, level);
      if (modus !== "erst") assert.equal(ko.classification_confidence.level_ermittelt_am, T0);
    }
  });
  await test("Bestehender Herkunftsrang erlaubt weiterhin KI Korrektur eines Deriver Werts", async () => {
    for (const modus of ["pending", "update"]) for (const quelle of ["deriver", null]) {
      const a = antwort("bund"), ko = gespeichert(await lauf(modus, a, bestand("land", quelle)), modus, a, "bund");
      assert.equal(ko.classification_confidence.level_quelle, "ki");
      assert.equal(ko.classification_confidence.level_wiederverwendet, false);
    }
  });
  await test("Unbekannte oder fehlende neue Ebene stuft ermittelten Bestand nicht herab", async () => {
    for (const level of ["unknown", null]) for (const modus of ["pending", "update"]) {
      const a = antwort(level), ko = gespeichert(await lauf(modus, a, bestand("land")), modus, a, "land");
      assert.equal(ko.classification_confidence.level_wiederverwendet, true);
      assert.equal(ko.classification_confidence.level_ermittelt_am, T0);
    }
    const a = antwort("unknown"); gespeichert(await lauf("erst", a, null), "erst", a, "unknown");
  });
  await test("Alte Ebenenspalte und JSON Herkunft umgehen die Konfliktsperre nicht", async () => {
    const b = bestand("land"); delete b.decision_level; b.political_level = "  Land ";
    b.classification_confidence = JSON.stringify(b.classification_confidence);
    for (const modus of ["pending", "update"]) abgewiesen(await lauf(modus, antwort("bund"), b), modus);
  });
  await test("Ohne CAS bleibt der Konflikt sichtbar und der Inhaltsspeicher unangetastet", async () => {
    for (const modus of ["pending", "update"]) abgewiesen(await lauf(modus, antwort("bund"), bestand("land"), false), modus, false);
  });
  await test("Passende Ebene umgeht weder Quellenbindung noch Pflichtfelder", async () => {
    for (const modus of ["erst", "update"]) {
      const b = modus === "erst" ? null : bestand("bund");
      const a = { ...antwort("bund"), ausschuesse: ["Unbelegter Testausschuss"] };
      abgewiesen(await lauf(modus, a, b), modus, true, "quellenbeleg-ausschuesse");
      const s = await lauf(modus, { ...antwort("bund"), warum_wichtig: "" }, b);
      assert.equal(s.r.status, "skipped-invalid"); assert.equal(s.p.writes.length, 0);
    }
    const a = antwort("kommune");
    const r = await U.evaluateUnderstandingCase({ name: "neutraler-rat", raw_documents: [{
      id: "rd-rat", title: a.headline, summary: a.was_ist_passiert,
      url: "https://example.org/rat", published_at: T0 }] }, async () => a);
    assert.equal(r.valid, true); assert.equal(r.ko.decision_level, "kommune");
  });
  console.log(`${pass}/${pass} Gruppen erfolgreich`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
