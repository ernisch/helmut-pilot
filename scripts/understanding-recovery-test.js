"use strict";

// Tests fuer den REIN LESENDEN Understanding-Recovery-Trockenlauf.
// Belegt: eindeutige/mehrdeutige/keine-Quelle-Klassifikation, Duplikat-Schutz,
// Idempotenz, Mandantentrennung, Datenschutz der Ausgabe, Schutz vor Write.
// Kein Netz, keine DB, keine KI — nur In-Memory-Fixtures.

const fs = require("fs");
const path = require("path");
const rec = require("../lib/helmut/understanding-recovery");
const lazy = require("../lib/helmut/lazyUnderstanding");

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
  // (a) Modul exportiert KEINE schreibende Funktion (Write-Verb-Praefixe;
  //     recoveryExecuteEnabled/recoverOne/planRecovery sind Lese-/Plan-/Kontroll-
  //     funktionen und duerfen NICHT als Schreibfunktion gelten).
  const writeLike = Object.keys(rec).filter((k) => /^(save|write|delete|insert|update|persist|mark|reset|patch)/i.test(k));
  check("8a · Modul exportiert keine schreibende Funktion", writeLike.length === 0, writeLike.join(","));

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

// (9) FELDBUG-FIX (lazyUnderstanding.clusterDocCount): documents.length statt documentCount.
(() => {
  check("9 · Feldbug-Fix: documents.length zaehlt (3)", lazy.clusterDocCount({ documents: [{}, {}, {}] }) === 3);
  check("9 · Feldbug-Fix: ohne documents -> 0", lazy.clusterDocCount({}) === 0 && lazy.clusterDocCount(undefined) === 0);
  check("9 · Feldbug-Fix: Fallback auf Skalar documentCount", lazy.clusterDocCount({ documentCount: 5 }) === 5);
  // Regression gegen den Alt-Bug: {documents:[a,b]} OHNE documentCount ergab frueher 0.
  check("9 · Regression: {documents:[a,b]} -> 2 (nicht 0)", lazy.clusterDocCount({ documents: [{}, {}] }) === 2);
})();

// (10) planRecovery-LOGIK: nur Allowlist, offene Faelle; nicht-offen/fehlend -> skip.
// Die planRecovery-MECHANIK wird mit einer EXPLIZITEN Test-Allowlist geprueft (opts.allowlist),
// entkoppelt von der auf 1 Fall verengten Production-Konstante (die separat in Test 12 geprueft wird).
(() => {
  const doc = (id, title, sn = "Q") => ({ id, title, summary: "", source_name: sn });
  const ALLOW = ["vg-steuerstrafrecht", "vg-medikamenten", "vg-sozialwohnungen", "vg-psychotherapie"];
  const cands = [
    { vorgang_id: "vg-steuerstrafrecht", understanding_status: "pending", headline: "Steuerstrafrecht Reform" },
    { vorgang_id: "vg-medikamenten", understanding_status: "pending", headline: "Medikamente GKV Zuzahlung" },
    { vorgang_id: "vg-einkommensteuer", understanding_status: "pending", headline: "Einkommensteuer Reform" }, // NICHT in Test-Allowlist
    { vorgang_id: "vg-sozialwohnungen", understanding_status: "complete", headline: "Sozialwohnungen" }        // nicht mehr offen
  ];
  const docs = [doc("d1", "Steuerstrafrecht Reform beschlossen"), doc("d2", "Medikamente Zuzahlung neue Regel")];
  const plan = rec.planRecovery(cands, docs, { allowlist: ALLOW });
  const execIds = plan.execute.map((e) => e.vorgangId);
  check("10 · nur Allowlist im Plan (kein vg-einkommensteuer)", !execIds.includes("vg-einkommensteuer"));
  check("10 · eindeutige/wahrscheinliche Allowlist-Faelle in execute", execIds.includes("vg-steuerstrafrecht") && execIds.includes("vg-medikamenten"));
  check("10 · nicht-mehr-offener Fall -> skip", plan.skip.some((s) => s.vorgangId === "vg-sozialwohnungen" && s.grund === "nicht-mehr-offen"));
  check("10 · fehlende Allowlist-Eintraege transparent -> skip nicht-gefunden", plan.skip.some((s) => s.vorgangId === "vg-psychotherapie" && s.grund === "nicht-gefunden"));
  check("10 · kiCalls == execute.length", plan.kiCalls === plan.execute.length);
})();

// (11) planRecovery-LOGIK: Duplikat/mehrdeutig/keine-quelle werden ausgeschlossen (explizite Test-Allowlist).
(() => {
  const doc = (id, title, sn = "Q") => ({ id, title, summary: "", source_name: sn });
  const ALLOW = ["vg-medikamenten", "vg-steuerstrafrecht", "vg-psychotherapie"];
  const cands = [
    { vorgang_id: "vg-medikamenten", understanding_status: "pending", headline: "Medikamente GKV" },          // -> duplikat (completeTopicSet)
    { vorgang_id: "vg-steuerstrafrecht", understanding_status: "pending", headline: "Steuerstrafrecht" },      // -> keine-quelle (kein doc)
    { vorgang_id: "vg-psychotherapie", understanding_status: "pending", headline: "Krankenversicherung Pflegeversicherung" } // -> mehrdeutig
  ];
  const docs = [doc("a", "Krankenversicherung Beitrag"), doc("b", "Pflegeversicherung Leistung", "Q2")];
  const plan = rec.planRecovery(cands, docs, { allowlist: ALLOW, completeTopicSet: new Set(["vg-medikamenten"]) });
  check("11 · Duplikat-Fall NICHT im Plan", !plan.execute.some((e) => e.vorgangId === "vg-medikamenten")
    && plan.skip.some((s) => s.vorgangId === "vg-medikamenten" && s.grund === "duplikat-complete-existiert"));
  check("11 · keine-Quelle-Fall NICHT im Plan", plan.skip.some((s) => s.vorgangId === "vg-steuerstrafrecht" && s.grund === "keine-quelldokumente"));
  check("11 · mehrdeutiger Fall NICHT im Plan", plan.skip.some((s) => s.vorgangId === "vg-psychotherapie" && s.grund === "mehrdeutig-manuell"));
  check("11 · execute leer (alle ausgeschlossen)", plan.execute.length === 0);
})();

// (12) Gating (Default AUS + Token) und recoverOne (Idempotenz/Dedup, Write-Sperre) — async.
(async () => {
  check("12 · recoveryExecuteEnabled Default false", rec.recoveryExecuteEnabled({}) === false);
  check("12 · recoveryExecuteEnabled bei 'on' true", rec.recoveryExecuteEnabled({ HELMUT_RECOVERY_EXECUTE: "on" }) === true);
  check("12 · recoveryConfirmed nur exaktes Token", rec.recoveryConfirmed("RECOVER_SOZIALWOHNUNGEN_CONFIRMED") === true && rec.recoveryConfirmed("RECOVER_6_CONFIRMED") === false && rec.recoveryConfirmed("x") === false && rec.recoveryConfirmed("") === false);
  // Nach der korrigierten Bewertung (2026-07-17) ist die Allowlist auf GENAU EINEN
  // freigegebenen Fall (vg-sozialwohnungen) verengt — die anderen 5 sind hinfaellig.
  check("12 · Allowlist genau 1 Fall: vg-sozialwohnungen", rec.RECOVERY_ALLOWLIST.length === 1 && rec.RECOVERY_ALLOWLIST[0] === "vg-sozialwohnungen");
  // planRecovery darf ausserhalb der Allowlist NICHTS einplanen (kein medikamenten/umstellungen).
  (() => {
    const cands = [
      { vorgang_id: "vg-sozialwohnungen", understanding_status: "pending", headline: "Weniger Sozialwohnungen" },
      { vorgang_id: "vg-medikamenten", understanding_status: "pending", headline: "Medikamenten Zuzahlung" }
    ];
    const docs = [
      { id: "s1", title: "Weniger Sozialwohnungen 2025", summary: "Sozialwohnungen" },
      { id: "m1", title: "Medikamenten Zuzahlung neu", summary: "Medikamenten" }
    ];
    const plan = rec.planRecovery(cands, docs, {});
    const planned = plan.execute.map((e) => e.vorgangId);
    check("12 · planRecovery plant nur Allowlist-Faelle (kein medikamenten)", !planned.includes("vg-medikamenten"));
  })();

  // recoverOne ohne verdrahteten Write-Pfad -> kein Write/KI (freigabepflichtig).
  const r1 = await rec.recoverOne({ vorgangId: "vg-steuerstrafrecht" }, { getExisting: async () => null });
  check("12 · recoverOne ohne understandAndSave -> kein Write, aiCalls 0", r1.wrote === false && r1.aiCalls === 0 && r1.grund === "write-pfad-nicht-verdrahtet-freigabepflichtig");

  // recoverOne idempotent: bereits complete -> skip, understandAndSave NICHT aufgerufen.
  let called = 0;
  const r2 = await rec.recoverOne({ vorgangId: "vg-medikamenten" },
    { getExisting: async () => ({ understanding_status: "complete" }), understandAndSave: async () => { called += 1; return {}; } });
  check("12 · recoverOne idempotent: complete -> skip, 0 KI-Call", r2.wrote === false && r2.aiCalls === 0 && r2.grund === "bereits-complete-idempotent" && called === 0);

  // recoverOne mit injizierten Deps -> genau EIN understand+save (nur im Test, kein echtes Prod/KI).
  let saved = 0;
  const r3 = await rec.recoverOne({ vorgangId: "vg-umstellungen" },
    { getExisting: async () => null, understandAndSave: async () => { saved += 1; return { wrote: true, aiCalls: 1, status: "saved" }; } });
  check("12 · recoverOne mit Deps -> genau 1 understand+save", r3.wrote === true && r3.aiCalls === 1 && r3.status === "saved" && saved === 1);
  // recoverOne zaehlt einen KI-Skip korrekt als 0 Writes.
  const r4 = await rec.recoverOne({ vorgangId: "vg-medikamenten" },
    { getExisting: async () => null, understandAndSave: async () => ({ wrote: false, aiCalls: 0, status: "no-cluster" }) });
  check("12 · recoverOne: no-cluster -> kein Write, 0 KI", r4.wrote === false && r4.aiCalls === 0);

  // (13) Ausfuehrungs-SKRIPT: Understand/Write-Pfad erst NACH der Flag+Token-Sperre.
  const src = fs.readFileSync(path.join(__dirname, "understanding-recovery-execute.js"), "utf8");
  check("13 · Execute-Skript ist Default-gesperrt (Flag+Token)", /recoveryExecuteEnabled/.test(src) && /recoveryConfirmed/.test(src));
  const guardIdx = src.indexOf("if (!enabled || !confirmed)");
  const writeIdx = src.indexOf("await understanding.understandOneCluster");
  check("13 · Understand/Write-Pfad (Call) erst NACH der Flag+Token-Sperre", guardIdx > 0 && writeIdx > guardIdx);
  check("13 · Execute-Skript ruft keine Storage-Schreibfunktion DIREKT auf",
    !/storage\.(saveKnowledgeObject|saveKoDocumentLinks|markUnderstandingFailed|deleteRetention|resetUnderstanding|markUnderstandingTerminal)\b/.test(src));
  // Dry-Run-Skript schreibt garantiert nie (kein --execute, keine Storage-Schreibaufrufe).
  const drySrc = fs.readFileSync(path.join(__dirname, "understanding-recovery-dryrun.js"), "utf8");
  check("13 · Dry-Run-Skript: kein Write, kein understandOneCluster", !/understandOneCluster/.test(drySrc) && /KEINEN --execute|schreibt niemals/i.test(drySrc));

  // (14) reconstructCluster: passende Docs aus dem Pool; kein Treffer -> null.
  const doc = (id, title, sn = "Q") => ({ id, title, summary: "", source_name: sn });
  const pool = [doc("d1", "Steuerstrafrecht Reform beschlossen"), doc("x", "Fussball Weltmeisterschaft"), doc("d2", "Steuerstrafrecht Details geklaert")];
  const cl = rec.reconstructCluster({ vorgang_id: "vg-steuerstrafrecht", headline: "Steuerstrafrecht Reform" }, pool);
  check("14 · reconstructCluster findet genau die passenden Docs (2)", cl && cl.documents.length === 2);
  check("14 · reconstructCluster: kein Treffer -> null", rec.reconstructCluster({ vorgang_id: "vg-x", headline: "Voelligfremdesthema Randnotiz" }, pool) === null);

  console.log(`\n${passed}/${passed + failed} Understanding-Recovery-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})();
