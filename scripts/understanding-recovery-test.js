"use strict";

// Tests fuer den REIN LESENDEN Understanding-Recovery-Trockenlauf.
// Belegt: eindeutige/mehrdeutige/keine-Quelle-Klassifikation, Duplikat-Schutz,
// Idempotenz, Mandantentrennung, Datenschutz der Ausgabe, Schutz vor Write.
// Kein Netz, keine DB, keine KI — nur In-Memory-Fixtures.

const fs = require("fs");
const path = require("path");
const rec = require("../lib/helmut/understanding-recovery");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Fixtures ------------------------------------------------------------------
const doc = (id, title, summary = "", source_name = "Quelle") => ({ id, title, summary, source_name });

// (1) EINDEUTIG: 1 Dokument, abgeleitete vorgang_id == gespeicherte.
(() => {
  const cand = { vorgang_id: "vg-tariftreuegesetz", understanding_status: "pending", headline: "Tariftreuegesetz" };
  const docs = [doc("d1", "Neues Tariftreuegesetz beschlossen", "Details zum Tariftreuegesetz")];
  const a = rec.assessCandidate(cand, docs, {});
  check("1 · eindeutige Rekonstruktion -> klasse=eindeutig", a.klasse === "eindeutig", JSON.stringify(a));
  check("1 · abgeleitete id trifft die gespeicherte (idMatch)", a.idMatch === true && a.derivedIds.includes("vg-tariftreuegesetz"));
  check("1 · Empfehlung recovery", a.empfehlung === "recovery");
})();

// (2) MEHRDEUTIG: zwei nicht-zusammenhaengende Dokumentgruppen matchen denselben Kandidaten.
(() => {
  const cand = { vorgang_id: "vg-sozialversicherung", understanding_status: "pending",
    headline: "Krankenversicherung und Pflegeversicherung Reform" };
  const docs = [
    doc("a", "Krankenversicherung Beitragserhoehung", "Krankenversicherung teurer"),
    doc("b", "Pflegeversicherung Leistungskuerzung", "Pflegeversicherung geplant", "AndereQuelle")
  ];
  const a = rec.assessCandidate(cand, docs, {});
  check("2 · mehrdeutige Zuordnung -> klasse=mehrdeutig", a.klasse === "mehrdeutig", JSON.stringify(a));
  check("2 · clusterCount>1 (Konfliktrisiko sichtbar)", a.clusterCount > 1);
  check("2 · Empfehlung manuell (nicht automatisch recovern)", a.empfehlung === "manuell");
})();

// (3) KEINE QUELLE: kein Dokument teilt einen Anker mit dem Kandidaten.
(() => {
  const cand = { vorgang_id: "vg-verwaltungsdigitalisierung", understanding_status: "pending",
    headline: "Verwaltungsdigitalisierung im Ministerium" };
  const docs = [doc("x", "Fussball Bundesliga Ergebnisse", "Spieltag Zusammenfassung")];
  const a = rec.assessCandidate(cand, docs, {});
  check("3 · kein passendes Dokument -> klasse=keine-quelle", a.klasse === "keine-quelle", JSON.stringify(a));
  check("3 · docCount=0", a.docCount === 0);
  check("3 · Empfehlung manuell", a.empfehlung === "manuell");
})();

// (4) DUPLIKAT-SCHUTZ: Thema traegt bereits ein complete-KO -> nicht recovern.
(() => {
  const cand = { vorgang_id: "vg-einkommensteuer", understanding_status: "pending", headline: "Einkommensteuer Senkung" };
  const docs = [doc("e", "Einkommensteuer Reform beschlossen", "Einkommensteuer sinkt")];
  const completeKos = [{ headline: "Einkommensteuer Reform 2027 im Kabinett" }];
  const set = rec.completeTopicSet([cand], completeKos);
  check("4 · completeTopicSet erkennt das Themen-Duplikat", set.has("vg-einkommensteuer"));
  const a = rec.assessAll([cand], docs, { completeTopicSet: set })[0];
  check("4 · Duplikat-Schutz -> klasse=duplikat-risiko", a.klasse === "duplikat-risiko", JSON.stringify(a));
  check("4 · Empfehlung verwerfen (kein Duplikat anlegen)", a.empfehlung === "verwerfen");
  // Gegenprobe: ohne complete-KO wuerde derselbe Fall recovern.
  const b = rec.assessAll([cand], docs, { completeTopicSet: new Set() })[0];
  check("4 · Gegenprobe ohne complete-KO -> recovery", b.empfehlung === "recovery" && b.klasse !== "duplikat-risiko");
})();

// (5) IDEMPOTENZ: gleiche Eingabe -> byte-identische Ausgabe, mehrfach.
(() => {
  const cands = [
    { vorgang_id: "vg-tariftreuegesetz", understanding_status: "pending", headline: "Tariftreuegesetz" },
    { vorgang_id: "vg-mindestlohn", understanding_status: "failed", headline: "Mindestlohn Erhoehung" }
  ];
  const docs = [doc("d1", "Tariftreuegesetz beschlossen"), doc("m1", "Mindestlohn steigt deutlich")];
  const r1 = JSON.stringify(rec.assessAll(cands, docs, {}).map(rec.redactAssessment));
  const r2 = JSON.stringify(rec.assessAll(cands, docs, {}).map(rec.redactAssessment));
  check("5 · Idempotenz: zwei Laeufe identisch", r1 === r2);
  check("5 · geschaetzte KI-Calls deterministisch", rec.summarize(rec.assessAll(cands, docs, {})).geschaetzteKiCalls === rec.summarize(rec.assessAll(cands, docs, {})).geschaetzteKiCalls);
})();

// (6) MANDANTENTRENNUNG: die Analyse ist mandantenlos (globale Vorgaenge). Ein
// tenant-/user-Feld an einem Dokument aendert weder Klassifikation noch Ausgabe.
(() => {
  const cand = { vorgang_id: "vg-tariftreuegesetz", understanding_status: "pending", headline: "Tariftreuegesetz" };
  const plain = [doc("d1", "Tariftreuegesetz beschlossen")];
  const tenantTagged = [{ ...doc("d1", "Tariftreuegesetz beschlossen"), userId: "user-A", mandateId: "mandat-B", tenant: "geheim" }];
  const a = rec.redactAssessment(rec.assessCandidate(cand, plain, {}));
  const b = rec.redactAssessment(rec.assessCandidate(cand, tenantTagged, {}));
  check("6 · Klassifikation ignoriert tenant/user-Felder", JSON.stringify(a) === JSON.stringify(b));
  const outKeys = Object.keys(b);
  const forbiddenKeys = outKeys.filter((k) => /user|tenant|mandate|mandat|email|person/i.test(k));
  check("6 · Ausgabe traegt keine tenant/user-Schluessel", forbiddenKeys.length === 0, forbiddenKeys.join(","));
  check("6 · kein tenant-Wert in der Ausgabe", !JSON.stringify(b).includes("geheim") && !JSON.stringify(b).includes("user-A"));
})();

// (7) DATENSCHUTZ DER AUSGABE: keine Rohtitel/PII (Name/E-Mail/Geburtsjahr) im Bericht.
(() => {
  const cand = { vorgang_id: "vg-krankenversicherung", understanding_status: "pending",
    headline: "Angela Musterfrau (geb. 1970) zur Krankenversicherung, musterfrau@example.invalid" };
  const docs = [doc("p", "Krankenversicherung: Angela Musterfrau, musterfrau@example.invalid", "geb. 1970 Beitrag")];
  const out = JSON.stringify(rec.redactAssessment(rec.assessCandidate(cand, docs, {})));
  check("7 · kein Personenname in der Ausgabe", !out.includes("Musterfrau"));
  check("7 · keine E-Mail in der Ausgabe", !out.toLowerCase().includes("example.invalid") && !out.includes("@"));
  check("7 · kein Geburtsjahr/Rohtext in der Ausgabe", !out.includes("1970") && !out.toLowerCase().includes("geb."));
  check("7 · Ausgabe enthaelt nur Slugs/Zahlen/Klassen", /"vorgangId":"vg-krankenversicherung"/.test(out) && /"klasse":/.test(out));
})();

// (8) SCHUTZ VOR VERSEHENTLICHEM WRITE.
(() => {
  // (a) Modul exportiert KEINE Schreibfunktion.
  const writeLike = Object.keys(rec).filter((k) => /save|write|delete|insert|update|^mark|reset|patch|persist|execute/i.test(k));
  check("8a · Modul exportiert keine Schreib-/Execute-Funktion", writeLike.length === 0, writeLike.join(","));

  // (b) Eingaben werden nicht mutiert (tief eingefroren -> Mutation wuerde werfen).
  const cand = Object.freeze({ vorgang_id: "vg-tariftreuegesetz", understanding_status: "pending", headline: "Tariftreuegesetz" });
  const docs = Object.freeze([Object.freeze(doc("d1", "Tariftreuegesetz beschlossen"))]);
  let threw = false;
  try { rec.assessAll([cand], docs, {}); } catch (e) { threw = true; }
  check("8b · mutiert Eingaben nicht (kein Wurf bei eingefrorenen Objekten)", threw === false);

  // (c) Das Skript hat einen harten --execute-Abbruch und importiert keine Schreibfunktion.
  const src = fs.readFileSync(path.join(__dirname, "understanding-recovery-dryrun.js"), "utf8");
  check("8c · Skript verweigert --execute", src.includes("--execute") && /KEINEN --execute|schreibt niemals/i.test(src));
  const badCalls = src.match(/storage\.(save|write|delete|mark\w*Failed|resetUnderstanding|markUnderstandingTerminal|saveKoDocumentLinks|deleteRetention)\w*/g) || [];
  check("8c · Skript ruft keine Storage-Schreibfunktion auf", badCalls.length === 0, badCalls.join(","));
})();

console.log(`\n${passed}/${passed + failed} Understanding-Recovery-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
