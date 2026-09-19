"use strict";

// Promptvertrag und Erhalt gueltiger Antworten, KEIN simuliertes Modellurteil.
// Die Antworten unten sind feste Offlinefixtures, keine generierten Ergebnisse.
const assert = require("node:assert/strict");
const U = require("../lib/helmut/understanding");
const A = require("../lib/helmut/artikelkontext");
const S = require("../lib/helmut/understanding-schema");
const basis = {
  warum_wichtig: "Der Vorgang betrifft die Schulsanierung.", wer_ist_betroffen: "Der Stadtrat",
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [], zeitdruck: "keiner",
  handlungsempfehlung: "Keine Handlung aus den gelieferten Quellen ableitbar.", confidence_score: 70,
  risk_of_no_action: "", recommendation: "", action_items: [], action_items_struct: []
};
const faelle = [
  { name: "diskussion", text: "Der Stadtrat diskutiert einen Vorschlag zur Schulsanierung. Eine Entscheidung steht aus.",
    titel: "Stadtrat diskutiert Schulsanierung", due: "", beschluss: false },
  { name: "beschluss", text: "Der Stadtrat hat die Schulsanierung beschlossen. Die Verwaltung muss bis zum 30. Oktober 2026 den Sanierungsplan vorlegen.",
    titel: "Stadtrat beschliesst Schulsanierung", due: "bis zum 30. Oktober 2026", beschluss: true },
  { name: "dementi", text: "Die Sprecherin bestreitet eine Einigung zur Schulsanierung. Eine Entscheidung fiel nicht.",
    titel: "Sprecherin bestreitet Einigung zur Schulsanierung", due: "", beschluss: false },
  { name: "relative-frist", text: "Der Stadtrat hat die Schulsanierung beschlossen. Die Verwaltung muss binnen zwei Wochen nach Zustellung des Beschlusses den Sanierungsplan vorlegen.",
    titel: "Stadtrat beschliesst Schulsanierung", due: "binnen zwei Wochen nach Zustellung des Beschlusses", beschluss: true }
];
function quelle(f) {
  return { id: "rd-vertrag-" + f.name, title: f.titel, summary: f.text, source_name: "Testmedium",
    url: "https://example.org/bildung/" + f.name, published_at: "2026-10-02T08:00:00Z" };
}
function antwort(f) {
  return { ...structuredClone(basis), headline: f.titel, display_title: f.titel,
    was_ist_passiert: f.text, display_summary: f.text,
    action_items_struct: f.due ? [{ title: "Sanierungsplan vorlegen",
      description: "Die Verwaltung muss den beschlossenen Sanierungsplan vorlegen.", dueHint: f.due,
      priority: "unknown", actionType: "unknown" }] : [] };
}
function vertrag(prompt) {
  const a = prompt.split("\nQuellen:\n")[0];
  // Die fruehere Fristaufforderung und die unbelegten Beispielableitungen sind
  // ein eigener Fehlanreiz, auch neben der vorhandenen allgemeinen Belegpflicht.
  assert.doesNotMatch(a, /grober Zeit-\/Faelligkeitshinweis, wenn moeglich mit Frist/);
  assert.doesNotMatch(a, /Laender bekraeftigen Unterstuetzung fuer Europa|Ministerium plant neue Arbeitsmarktreform/);
  assert.match(a, /AUSSAGENVERTRAG fuer ALLE Felder.*verschachtelte Strukturen/);
  assert.match(a, /Blickrichtung, Diskussion, Forderung oder Absicht belegen weder Beschluss/);
  assert.match(a, /Verneinung, Vorbehalt, Zitat und Zuschreibung erhalten/);
  assert.match(a, /aus einer Person keine Institution oder kollektive Position/);
  assert.match(a, /FRISTENVERTRAG fuer ALLE Felder/);
  assert.match(a, /Zuordnung zum Akteur und zur Handlung belegt/);
  assert.match(a, /Keine eigene Deadline vorschlagen/);
  assert.match(a, /Ereignistermin ist keine Handlungsfrist/);
  assert.match(a, /Ohne belegte Frist dueHint leer lassen/);
  assert.match(a, /Belegte Beschluesse und echte Fristen weiterhin konkret wiedergeben/);
}
function pruefeAntwort(ko, f) {
  assert.equal(ko.was_ist_passiert, f.text);
  assert.equal(ko.display_summary, f.text);
  assert.equal(ko.headline, f.titel);
  assert.equal(ko.display_title, f.titel);
  assert.deepEqual(ko.action_items_struct.map(x => x.dueHint), f.due ? [f.due] : []);
  assert.equal(S.validateKnowledgeObject(ko).valid, true);
}
function kontext(d, f) {
  return { version: 1, dokumentId: d.id, quellenHash: A.quellenstandHash(d), artikelUrl: d.url,
    artikelTitel: d.title, herkunft: "manueller-originalvergleich", gelesenAm: "2026-10-02T10:00:00Z",
    absatzPosition: 1, text: f.text };
}
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
async function main() {
  await test("Gemeinsamer Auftrag entfernt die widersprechenden Beschluss und Fristbeispiele", () => {
    for (const f of faelle) vertrag(U.buildUnderstandingPrompt({ documents: [quelle(f)] }));
  });
  await test("Diskussion, Dementi, Beschluss und echte Fristen bleiben als Quelldaten unveraendert", () => {
    for (const f of faelle) {
      const d = quelle(f), c = { documents: [d] }, vorher = structuredClone(c);
      for (const option of [{}, { artikelkontextVersuch: kontext(d, f) }]) {
        const p = U.buildUnderstandingPrompt(c, option); vertrag(p);
        const q = JSON.parse(p.split("\n").find(l => l.startsWith('{"quelle_id":')));
        assert.equal(q.titel, d.title); assert.equal(q.auszug, d.summary);
        assert.equal(q.zeitbezug.ereignisdatum, null);
        if (option.artikelkontextVersuch) assert.equal(q.artikelkontext.text, f.text);
      }
      assert.deepEqual(c, vorher);
    }
  });
  await test("Metadaten und ungenutzte Rohfelder bleiben vom Quellentext getrennt", () => {
    const f = faelle[0], d = quelle(f);
    d.url = "https://example.org/beschluss/bis-freitag";
    d.retrieved_at = "2026-10-09T14:00:00Z";
    d.raw = { deadline: "morgen", decision: "Einigung erzielt" };
    const p = U.buildUnderstandingPrompt({ documents: [d] }); vertrag(p);
    const q = JSON.parse(p.split("\n").find(l => l.startsWith('{"quelle_id":')));
    assert.equal(q.auszug, f.text); assert.equal(q.zeitbezug.ereignisdatum, null);
    assert.equal(q.deadline, undefined); assert.equal(q.raw, undefined);
  });
  for (const update of [false, true]) await test((update ? "Aktualisierung" : "Erstverstehen") +
    " sendet den Vertrag einmal und erhaelt belegte positive und vorsichtige Antworten", async () => {
    for (const f of faelle) for (const zusatz of [false, true]) {
      const d = quelle(f), c = { documents: [d] }, p = { prompts: [], gespeichert: [], start: 0, frei: 0 };
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
      const existing = { id: "ko-vertrag", ko_version: 3, headline: "Erhaltener Bestand" };
      const vorher = structuredClone(existing), vorgangId = "vg-vertrag-" + f.name;
      const r = update ? await U.understandUpdate(c, deps, { vorgangId, existing, neueDocs: [d],
        neueAnker: [], spur: {}, alleDocs: [d], vertrag: v, ...option })
        : await U.understandOneCluster(c, deps, { vorgangId, existing: null, vertrag: v, ...option });
      assert.equal(r.status, update ? "updated" : "saved");
      assert.deepEqual(existing, vorher); assert.equal(p.start, 1); assert.equal(p.frei, 0);
      assert.deepEqual(p.prompts, [U.buildUnderstandingPrompt(c, option)]);
      assert.equal(p.gespeichert.length, 1); pruefeAntwort(p.gespeichert[0], f);
    }
  });
  await test("Auswerter behaelt belegten Beschluss und beide echten Fristarten", async () => {
    for (const f of faelle.filter(x => x.beschluss)) {
      let count = 0;
      const r = await U.evaluateUnderstandingCase({ name: f.name, raw_documents: [quelle(f)] }, async prompt => {
        count++; vertrag(prompt); return antwort(f);
      });
      assert.equal(count, 1); assert.equal(r.valid, true); pruefeAntwort(r.ko, f);
    }
  });
  console.log(`${pass}/${pass} Gruppen erfolgreich`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
