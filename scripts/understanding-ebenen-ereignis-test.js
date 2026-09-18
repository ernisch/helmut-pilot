"use strict";

// Prueft Auftrag, Datenweitergabe und Erhalt korrekter fester Antworten.
// Kein echter Modellaufruf und kein Beweis semantischer Modellbefolgung.
const assert = require("node:assert/strict");
const U = require("../lib/helmut/understanding");
const A = require("../lib/helmut/artikelkontext");
const S = require("../lib/helmut/understanding-schema");
const faelle = [
  { name: "offen", titel: "Koalition streitet nach Regionalwahl", auszug: "",
    text: "Die Quelle berichtet von einem Koalitionsstreit nach einer Regionalwahl. Die Ebene und konkrete Streitpunkte bleiben offen.",
    level: "unknown" },
  { name: "bund", titel: "Bundesregierung diskutiert Verkehrspolitik",
    auszug: "Die Bundesregierung diskutiert Verkehrspolitik nach einer Debatte im Landtag. Der Bericht behandelt die bestehende Bundesregierung, keine Regierungsbildung im Land.",
    text: "Die bestehende Bundesregierung diskutiert Verkehrspolitik.", level: "bund" },
  { name: "land", titel: "Landesregierung verhandelt Verkehrsprogramm",
    auszug: "Die Landesregierung verhandelt ein Verkehrsprogramm. Eine fruehere Debatte der Bundesregierung dient nur als Vergleich.",
    text: "Die Landesregierung verhandelt ein Verkehrsprogramm.", level: "land" },
  { name: "kommune", titel: "Stadtrat beschliesst Verkehrsprogramm",
    auszug: "Der Stadtrat beschliesst ein Verkehrsprogramm. Die Diskussion in der Bundesregierung wird als Hintergrund erwaehnt.",
    text: "Der Stadtrat beschliesst ein Verkehrsprogramm.", level: "kommune" }
];
function quelle(f) {
  return { id: "rd-ebene-" + f.name, title: f.titel, summary: f.auszug,
    source_name: "Testmedium", url: "https://example.org/verkehr/" + f.name,
    published_at: "2026-10-02T08:00:00Z" };
}
function antwort(f) {
  return { headline: f.titel, display_title: f.titel, display_summary: f.text,
    was_ist_passiert: f.text, warum_wichtig: "Weitergehende Bedeutung aus dieser Quelle nicht ableitbar.",
    wer_ist_betroffen: "Weitere Betroffene aus dieser Quelle nicht ableitbar.",
    parteien: [], ministerien: [], ausschuesse: [], risiken: [], chancen: [], zeitdruck: "keiner",
    handlungsempfehlung: "Keine Handlung aus den gelieferten Quellen ableitbar.",
    confidence_score: 60, decision_level: f.level, related_levels: [], event_type: "unknown" };
}
function vertrag(prompt) {
  const auftrag = prompt.split("\nQuellen:\n")[0];
  assert.match(auftrag, /EBENEN UND EREIGNISVERTRAG fuer ALLE Felder/);
  assert.match(auftrag, /Anlass, Ort und Vergleich sind nicht automatisch das beschriebene Ereignis/);
  assert.match(auftrag, /Regionalwahl belegt keine Koalitionsbildung/);
  assert.match(auftrag, /handelnden Institution.*belegten Rolle/);
  assert.match(auftrag, /Blosse Erwaehnung einer Institution bestimmt keine Entscheidungsebene/);
  assert.match(auftrag, /bleibt decision_level unknown/);
  assert.match(auftrag, /keine Ersatzebene oder neue Verhandlung erfinden/);
  assert.doesNotMatch(auftrag, /Bundestag\/Bundesregierung\/Bundesministerium\/Bundestagsausschuss -> 'bund'/);
}
function kontext(d, f) {
  return { version: 1, dokumentId: d.id, quellenHash: A.quellenstandHash(d), artikelUrl: d.url,
    artikelTitel: d.title, herkunft: "manueller-originalvergleich", gelesenAm: "2026-10-02T10:00:00Z",
    absatzPosition: 1, text: f.auszug || f.titel };
}
function pruefeErgebnis(ko, f) {
  assert.equal(ko.was_ist_passiert, f.text); assert.equal(ko.display_summary, f.text);
  assert.equal(ko.decision_level, f.level); assert.equal(ko.political_level, f.level);
  assert.equal(S.validateKnowledgeObject(ko).valid, true);
}
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
async function main() {
  await test("Auftrag bindet Ebene und Ereignis an die Rolle statt an Institutionsnennung", () => {
    for (const f of faelle) vertrag(U.buildUnderstandingPrompt({ documents: [quelle(f)] }));
  });
  await test("Titel ohne Auszug bleibt unveraendert und wird nicht durch Metadaten ergaenzt", () => {
    const f = faelle[0], d = quelle(f);
    d.url = "https://example.org/bundesregierung/landesregierung";
    d.source_name = "Bundestag"; d.full_text = "Der Landtag hat entschieden.";
    const c = { documents: [d] }, vorher = structuredClone(c);
    const prompt = U.buildUnderstandingPrompt(c); vertrag(prompt);
    const q = JSON.parse(prompt.split("\n").find(l => l.startsWith('{"quelle_id":')));
    assert.equal(q.titel, f.titel); assert.equal(q.auszug, ""); assert.equal(q.full_text, undefined);
    assert.deepEqual(c, vorher);
  });
  for (const update of [false, true]) await test((update ? "Aktualisierung" : "Erstverstehen") +
    " erhaelt neutrale Antworten fuer Bund, Land, Kommune und unbekannte Ebene", async () => {
    for (const f of faelle) for (const zusatz of [false, true]) {
      const d = quelle(f), c = { documents: [d] }, original = structuredClone(c);
      const p = { prompts: [], gespeichert: [], start: 0, frei: 0 };
      const v = {
        reserviere: async () => ({ erlaubt: true, fencing: 1 }),
        modellstart: async () => { p.start++; return { erlaubt: true }; },
        schreibrecht: async () => ({ erlaubt: true }),
        speichere: async ({ ko }) => { p.gespeichert.push(ko); return { gespeichert: true, pruefbar: true }; },
        ausgangUnbekannt: async () => { throw Error("Unerwarteter unbekannter Ausgang"); },
        freigabe: async () => { p.frei++; }, freigabeOhneAufruf: async () => { p.frei++; },
        vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
        vormerkungErhoehe: async () => {}, vormerkungLoese: async () => {}
      };
      const deps = { canSpend: async () => ({ allowed: true }),
        requestUnderstanding: async prompt => { vertrag(prompt); p.prompts.push(prompt); return antwort(f); },
        save: async ko => { p.gespeichert.push(ko); return true; }, saveSources: async () => {},
        markFailed: async () => { throw Error("Unerwartete Fehlerablage"); }, logSkip: () => {}, modelName: () => "attrappe",
        findVorgangCandidates: async () => [], listVorgangDocuments: async () => [] };
      const option = zusatz ? { artikelkontextVersuch: kontext(d, f) } : {};
      // Gleiche belegte Ebene bleibt im Update erhalten. Kein Ueberschreiben
      // einer widersprechenden Bestandsklassifikation durch Testvorbereitung.
      const existing = { id: "ko-ebene", ko_version: 3, headline: "Erhaltener Bestand",
        decision_level: f.level, classification_confidence: { level_quelle: "ki", level: "high" } };
      const vorher = structuredClone(existing), vorgangId = "vg-ebene-" + f.name;
      const r = update ? await U.understandUpdate(c, deps, { vorgangId, existing, neueDocs: [d],
        neueAnker: [], spur: {}, alleDocs: [d], vertrag: v, ...option })
        : await U.understandOneCluster(c, deps, { vorgangId, existing: null, vertrag: v, ...option });
      assert.equal(r.status, update ? "updated" : "saved");
      assert.equal(p.start, 1); assert.equal(p.frei, 0); assert.equal(p.gespeichert.length, 1);
      assert.deepEqual(p.prompts, [U.buildUnderstandingPrompt(c, option)]);
      assert.deepEqual(c, original); assert.deepEqual(existing, vorher);
      pruefeErgebnis(p.gespeichert[0], f);
      const q = JSON.parse(p.prompts[0].split("\n").find(l => l.startsWith('{"quelle_id":')));
      assert.equal(q.titel, d.title); assert.equal(q.auszug, d.summary);
      if (zusatz) assert.equal(q.artikelkontext.text, option.artikelkontextVersuch.text);
      else assert.equal(q.artikelkontext, undefined);
    }
  });
  await test("Auswerter verwendet denselben Vertrag und erhaelt alle vier korrekten Antworten", async () => {
    for (const f of faelle) {
      let count = 0;
      const r = await U.evaluateUnderstandingCase({ name: f.name, raw_documents: [quelle(f)] }, async prompt => {
        count++; vertrag(prompt); return antwort(f);
      });
      assert.equal(count, 1); assert.equal(r.valid, true); pruefeErgebnis(r.ko, f);
    }
  });
  console.log(`${pass}/${pass} Gruppen erfolgreich`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
