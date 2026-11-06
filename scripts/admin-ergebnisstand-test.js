"use strict";
// Ergebnisstand der Verwaltung: Briefing · Zustellung · Lage je Profil und Tag, Radar im Briefing.
const assert = require("node:assert/strict");
const S = require("../lib/helmut/admin-ergebnisstand");
const A = require("../lib/helmut/briefing-ausgabebeleg");
const B = require("../lib/helmut/briefing-speicher");
const L = require("../lib/helmut/briefing-lauf");
const E = require("../lib/helmut/lage-quellenbeleg");
const Q = require("../lib/helmut/lage-textqualitaet");
const tag = "2026-09-19", zeit = "2026-09-19T05:02:00.000Z";

function fixture(userId = "synthetic-ergebnis") {
  const profile = { id: userId, committees: ["Bildung"] };
  const quellen = [{ vorgang_id: "vg-test", quellenbelege: [
    { quelle_id: "q-test", titel: "Das Kabinett beraet ueber Kita Standards.", auszug: "", url: "https://example.org/kita" },
    { quelle_id: "q-other", titel: "Ein Verband legt einen Vorschlag zur Lehrerausbildung vor.", auszug: "", url: "https://example.org/lehrer" }
  ] }];
  const paragraphs = quellen[0].quellenbelege.map(q => ({ text: q.titel, vorgang_ids: ["vg-test"] }));
  const checked = Q.pruefe(paragraphs, quellen, {
    vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
      pruefbegruendung: "Kita Standards und Lehrerausbildung sind verschiedene Sachverhalte." }],
    pruefungen: paragraphs.map((_, absatz) => ({ absatz, quelle_id: quellen[0].quellenbelege[absatz].quelle_id,
      belegfeld: "titel", vollstaendig_belegt: true, themenrein: true, profilbezug: true,
      textart: "konkreter_sachverhalt", pruefbegruendung: "Konkrete Beratung mit Bezug zum Bildungsausschuss." }))
  });
  assert.equal(checked.ok, true);
  const lage = { ...checked, quellen, quellenVersion: E.VERSION, quellenHash: E.hashEingabe(quellen), koSetHash: "a".repeat(32), generatedAt: zeit };
  const briefing = { available: true, items: [{ title: "Synthetischer Briefingpunkt" }],
    currentHelmutState: { tagesAnlass: { art: "neue-quelle", documentIds: ["rd-fixture"], text: "Synthetischer Tagesanlass." } },
    currentRadarState: { anzeige: { mentions: [], environment: { party: [{ title: "Umfeldtreffer", sourceUrl: "https://example.org/u" }], constituency: [], committees: [] },
      dynamics: [{ title: "Dynamik ohne Quelle" }], articles: [{ title: "Artikel", sourceUrl: "https://example.org/a" }] } } };
  const rows = { profile, briefing, lage };
  rows.neu = () => {
    const payload = { version: B.VERSION, mandat: userId, tag, profilHash: B.profilHash(profile), profilHashVersion: 2,
      briefing: rows.briefing, lage: rows.lage, inhaltHash: B.hash({ briefing: rows.briefing, lage: rows.lage }),
      pruefung: B.pruefeInhalt(rows.briefing, rows.lage), erzeugtAm: zeit };
    const paket = { id: `bf-${userId}-mandatsbriefing-${tag}`, user_id: userId, slot: B.SLOT, generated_at: zeit, payload };
    const q = L.quittung({ tenantId: userId, berlinTag: tag, status: L.STATUS_ERFOLG, erzeugtAm: zeit,
      signatur: L.inhaltsSignatur(rows.briefing), ausgabeBeleg: A.ausPaket(paket) });
    return [paket, { id: `bf-${userId}-lage-${tag}`, user_id: userId, slot: "lage", generated_at: zeit, payload: rows.lage },
      { id: L.laufId(userId, tag), user_id: userId, slot: L.SLOT_ERFOLG, generated_at: zeit, payload: q }].map(r => structuredClone(r));
  };
  return rows;
}
const run = (rows, userId = "synthetic-ergebnis") => S.bewerte({ userId, tag, rows });
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }

test("Drei vollständige Positionen enden bei Stufe 3 · nicht beurteilt, nie Stufe 4", () => {
  const r = run(fixture().neu());
  for (const p of S.POSITIONEN) assert.deepEqual(r.positionen[p], { stufe: 3, ursache: null, code: null }, p);
  const bilanz = S.zaehle(S.leereBilanz(), r.positionen);
  for (const p of S.POSITIONEN) { assert.equal(bilanz[p].nichtBeurteilt, 1); assert.equal(bilanz[p].brauchbar, 0); }
  assert.equal(r.letzterErfolg, zeit);
});
test("Radar ist Teil des Briefings: Abschnitte, Einträge ohne Quelle, leer ist kein Fehler", () => {
  const r = run(fixture().neu());
  assert.equal(r.radar.vorhanden, true);
  assert.deepEqual(r.radar.abschnitte.map(a => [a.label, a.anzahl]), [["Über dich", 0], ["Umfeld", 1], ["Dynamiken", 1], ["Artikel", 1]]);
  assert.equal(r.radar.ohneQuelle, 1); assert.equal(r.radar.wiederholung, false);
  assert.equal(Object.hasOwn(r.positionen, "radar"), false);
});
test("Fehlende Zeilen: Fehlt; Fehlerlauf: technischer Fehler", () => {
  let r = run([]);
  for (const p of S.POSITIONEN) assert.deepEqual([r.positionen[p].stufe, r.positionen[p].ursache], [0, "fehlt"]);
  assert.equal(r.radar.vorhanden, null); assert.equal(r.letzterErfolg, null);
  r = run([{ id: L.laufId("synthetic-ergebnis", tag, L.SLOT_FEHLER), user_id: "synthetic-ergebnis", slot: L.SLOT_FEHLER, payload: {} }]);
  assert.equal(r.positionen.briefing.ursache, "fehler"); assert.equal(r.positionen.zustellung.ursache, "fehler");
});
test("Briefing ohne Fachinhalt ist Leer; Wiederholung zwischen Ansichten wird benannt", () => {
  let f = fixture(); f.briefing = { ...f.briefing, available: false, items: [] };
  assert.deepEqual(run(f.neu()).positionen.briefing, { stufe: 1, ursache: "leer", code: "briefing-ohne-fachinhalt" });
  f = fixture(); const satz = "Wiederholter Text, der lang genug ist, um als Wiederholung zwischen Lage und Briefing zu zählen.";
  f.briefing = structuredClone(f.briefing); f.briefing.currentHelmutState.summary = satz;
  f.lage = structuredClone(f.lage); f.lage.paragraphs[0].text = satz;
  const r = run(f.neu());
  assert.equal(r.positionen.briefing.ursache, "wiederholung"); assert.equal(r.positionen.briefing.stufe, 2);
});
test("Veraltetes gespeichertes Strukturgrün wird frisch geprüft", () => {
  const f = fixture(), rows = f.neu(), p = rows[0].payload;
  delete p.briefing.currentHelmutState.tagesAnlass;
  p.inhaltHash = B.hash({ briefing: p.briefing, lage: p.lage });
  assert.equal(p.pruefung.strukturellVollstaendig, true);
  assert.equal(run(rows).positionen.briefing.ursache, "unvollstaendig");
});
test("Ruhiger Tag: ausdrücklich ohne Tagesanlass ist vollständig, andere Lücken bleiben sichtbar", () => {
  let f = fixture(); f.briefing = structuredClone(f.briefing);
  f.briefing.currentHelmutState = { status: "empty", emptyState: { kind: "quiet", headline: "Kein belegter Tagesanlass für ein Briefing" } };
  let r = run(f.neu());
  assert.deepEqual(r.positionen.briefing, { stufe: 3, ursache: null, code: null, hinweis: "ruhiger-tag" });
  assert.equal(r.positionen.zustellung.stufe, 3);
  assert.equal(S.zaehle(S.leereBilanz(), r.positionen).briefing.nichtBeurteilt, 1);
  // Ohne Ruhe-Kennzeichen bleibt fehlender Tagesanlass unvollständig.
  f = fixture(); f.briefing = structuredClone(f.briefing); delete f.briefing.currentHelmutState.tagesAnlass;
  assert.equal(run(f.neu()).positionen.briefing.code, "briefing-ohne-tagesanlass");
  // Ruhiger Tag plus weiterer Befund (Lage fehlt im Paket) bleibt unvollständig.
  f = fixture(); f.briefing = structuredClone(f.briefing); f.lage = null;
  f.briefing.currentHelmutState = { status: "empty", emptyState: { kind: "quiet" } };
  const rows = f.neu().filter(x => x.slot !== "lage");
  assert.equal(run(rows).positionen.briefing.ursache, "unvollstaendig");
});
test("Zustellung: abweichende Quittung und fehlende Inhaltsbindung sind Nicht zugestellt", () => {
  let rows = fixture().neu(); rows[2].payload.status = L.STATUS_FEHLER;
  assert.deepEqual(run(rows).positionen.zustellung, { stufe: 0, ursache: "nicht-zugestellt", code: "morgen-quittung-abweichend" });
  rows = fixture().neu(); rows[2].payload.signatur = "0".repeat(32);
  assert.deepEqual(run(rows).positionen.zustellung, { stufe: 1, ursache: "nicht-zugestellt", code: "morgen-inhaltsbindung-fehlt" });
  rows = fixture().neu(); rows[0].payload.inhaltHash = "f".repeat(64);
  const r = run(rows);
  assert.equal(r.positionen.briefing.code, "briefing-nachweis-abweichend");
  assert.equal(r.positionen.zustellung.code, "morgen-inhaltsbindung-fehlt"); assert.equal(r.radar.vorhanden, null);
  const bilanz = S.zaehle(S.leereBilanz(), r.positionen);
  assert.equal(bilanz.zustellung.nichtZugestellt, 1); assert.equal(bilanz.briefing.unvollstaendig, 1);
});
test("Lage: ohne Absätze Leer, ungültiger Quellenvertrag Unvollständig", () => {
  let rows = fixture().neu(); rows[1].payload.paragraphs = [];
  assert.deepEqual(run(rows).positionen.lage, { stufe: 1, ursache: "leer", code: "lage-text-fehlt" });
  rows = fixture().neu(); rows[1].payload.quellenHash = "0".repeat(64);
  assert.equal(run(rows).positionen.lage.ursache, "unvollstaendig");
});
test("Mandantentrennung: fremde Zeilen zählen nie, ungültiger Tag wird abgelehnt", () => {
  const fremd = fixture("synthetic-fremd").neu().map(r => ({ ...r, id: r.id.replace("synthetic-fremd", "synthetic-ergebnis") }));
  const r = run(fremd);
  for (const p of S.POSITIONEN) assert.equal(r.positionen[p].ursache, "fehlt");
  assert.throws(() => S.bewerte({ userId: "synthetic-ergebnis", tag: "heute", rows: [] }), /ergebnis-tag-ungueltig/);
  assert.throws(() => S.bewerte({ userId: "", tag, rows: [] }));
});
console.log(`${passed}/9 Ergebnisstand-Prüfungen bestanden.`);
