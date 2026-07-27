"use strict";

// Sprint 19 — Politische Ebene dauerhaft speichern (Ebenen-Gedaechtnis).
//
// Belegt den NEUEN Speicherpfad, nicht nur die neue Funktion:
//   A) Die reinen Entscheidungsregeln (lib/helmut/quellenarchitektur/ebenen-gedaechtnis.js).
//   B) Die Einbindung in die Klassifikation (classifyKnowledgeObject).
//   C) Den echten Produktionspfad: understandOneCluster -> understandUpdate ->
//      assembleKnowledgeObject -> gespeichertes KO. Inklusive REGRESSIONSBEWEIS:
//      derselbe Fall OHNE Bestand faellt auf 'unknown' zurueck (der Zustand vor
//      diesem Sprint) — mit Bestand bleibt die Ebene erhalten.
//   D) Die Lese-Projektion des Kandidatenpfads (ohne die Klassifikationsspalten
//      koennte die Wiederverwendung im haeufigsten Aktualisierungspfad nie greifen).
//   E) Die ehrliche Abdeckungskennzahl (kein falsches Gruen durch 'unknown').
//
// KEIN Netz, KEINE KI, KEINE DB. Nur synthetische Daten und injizierte Deps.

const fs = require("fs");
const path = require("path");

const G = require("../lib/helmut/quellenarchitektur/ebenen-gedaechtnis");
const C = require("../lib/helmut/quellenarchitektur/classification");
const U = require("../lib/helmut/understanding");
const { validateKnowledgeObject } = require("../lib/helmut/understanding-schema");
const { coverageAxis } = require("../lib/helmut/health-axes");
const { buildClassificationPatch } = require("../lib/helmut/ko-classification-backfill");

const root = path.join(__dirname, "..");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-07-27T12:00:00.000Z";

// Ein Bestandsvorgang, wie ihn die Datenbank liefert.
function bestand(ebene, quelle = "deriver", konfidenz = "high", ermitteltAm = T0) {
  return {
    id: "ko-vg-x", vorgang_id: "vg-x", decision_level: ebene,
    classification_confidence: { level: konfidenz, level_quelle: quelle, level_ermittelt_am: ermitteltAm }
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// A · Reine Entscheidungsregeln
// ══════════════════════════════════════════════════════════════════════════════
console.log("\nA · Entscheidungsregeln (rein)");

check("A1 'unknown' gilt NICHT als ermittelt", G.istErmittelt("unknown") === false && G.istErmittelt("") === false && G.istErmittelt(null) === false);
check("A2 echte Ebenen gelten als ermittelt", ["bund", "land", "eu", "kommune", "international"].every((l) => G.istErmittelt(l)));

const a3 = G.entscheideEbene({ bestand: null, neu: { level: "bund", quelle: "deriver", konfidenz: "high" }, jetzt: T1 });
check("A3 kein Bestand + Signal -> Erstermittlung, Zeitpunkt gesetzt",
  a3.ebene === "bund" && a3.grund === "erstermittlung" && a3.ermittelt === true
  && a3.ermittelt_am === T1 && a3.wiederverwendet === false, JSON.stringify(a3));

const a4 = G.entscheideEbene({ bestand: null, neu: { level: "unknown", quelle: "deriver", konfidenz: "unknown" }, jetzt: T1 });
check("A4 kein Bestand + kein Signal -> ehrlich 'unknown', KEIN Zeitpunkt",
  a4.ebene === "unknown" && a4.ermittelt === false && a4.ermittelt_am === null && a4.grund === "nicht-ermittelbar");

// >>> KERNREGEL DIESES SPRINTS <<<
const a5 = G.entscheideEbene({ bestand: bestand("bund"), neu: { level: "unknown", quelle: "deriver", konfidenz: "unknown" }, jetzt: T1 });
check("A5 FAIL CLOSED: ermittelte Ebene wird NIE durch 'unknown' ersetzt",
  a5.ebene === "bund" && a5.wiederverwendet === true && a5.geaendert === false
  && a5.grund === "bestand-bleibt-kein-neues-signal" && a5.ermittelt_am === T0, JSON.stringify(a5));

const a6 = G.entscheideEbene({ bestand: bestand("bund"), neu: { level: "bund", quelle: "deriver", konfidenz: "medium" }, jetzt: T1 });
check("A6 gleiche Ebene -> bestaetigt, Zeitpunkt der Erstermittlung bleibt",
  a6.ebene === "bund" && a6.grund === "bestaetigt" && a6.ermittelt_am === T0 && a6.wiederverwendet === true);

const a7 = G.entscheideEbene({ bestand: bestand("bund", "deriver"), neu: { level: "land", quelle: "ki", konfidenz: "high" }, jetzt: T1 });
check("A7 hoeherwertige Herkunft (KI > Deriver) darf korrigieren",
  a7.ebene === "land" && a7.grund === "hoeherwertige-herkunft" && a7.geaendert === true && a7.ermittelt_am === T1);

const a8 = G.entscheideEbene({ bestand: bestand("land", "ki"), neu: { level: "bund", quelle: "ki", konfidenz: "high" }, jetzt: T1 });
check("A8 gleiche Herkunft -> Bestand bleibt stabil (kein Flackern)",
  a8.ebene === "land" && a8.grund === "bestand-stabil" && a8.geaendert === false);

const a9 = G.entscheideEbene({ bestand: bestand("land", "ki"), neu: { level: "bund", quelle: "deriver", konfidenz: "high" }, jetzt: T1 });
check("A9 geringerwertige Herkunft darf NICHT korrigieren", a9.ebene === "land" && a9.grund === "bestand-stabil");

// Monotonie: nach der Korrektur deriver -> ki ist der Wert endgueltig stabil.
const a10a = G.entscheideEbene({ bestand: bestand("bund", "deriver"), neu: { level: "land", quelle: "ki", konfidenz: "high" }, jetzt: T1 });
const a10b = G.entscheideEbene({
  bestand: { decision_level: a10a.ebene, classification_confidence: { level: a10a.konfidenz, level_quelle: a10a.quelle, level_ermittelt_am: a10a.ermittelt_am } },
  neu: { level: "eu", quelle: "ki", konfidenz: "high" }, jetzt: "2026-08-01T00:00:00.000Z"
});
check("A10 Monotonie: hoechstens EIN Wechsel (danach stabil)", a10b.ebene === "land" && a10b.grund === "bestand-stabil");

// Alt-Daten
check("A11 Alt-Casing 'Bund' wird als ermittelt gelesen und klein zurueckgegeben",
  G.entscheideEbene({ bestand: { decision_level: "  Bund " }, neu: { level: "unknown", quelle: "deriver" } }).ebene === "bund");
check("A12 Alt-Zeile nur mit political_level verliert ihre Ebene nicht",
  G.entscheideEbene({ bestand: { political_level: "land" }, neu: { level: "unknown", quelle: "deriver" } }).ebene === "land");
check("A13 Alt-Zeile ohne Herkunft zaehlt als 'deriver' (KI darf spaeter korrigieren)",
  G.entscheideEbene({ bestand: { decision_level: "bund" }, neu: { level: "eu", quelle: "ki", konfidenz: "high" }, jetzt: T1 }).ebene === "eu");
check("A14 classification_confidence als JSON-Zeichenkette wird gelesen",
  G.entscheideEbene({ bestand: { decision_level: "bund", classification_confidence: '{"level_quelle":"ki"}' }, neu: { level: "eu", quelle: "ki", konfidenz: "high" } }).ebene === "bund");
check("A15 kaputtes jsonb wirft nicht und verliert die Ebene nicht",
  G.entscheideEbene({ bestand: { decision_level: "bund", classification_confidence: "{kaputt" }, neu: { level: "unknown", quelle: "deriver" } }).ebene === "bund");
check("A16 unsinnige Herkunft faellt auf 'deriver' zurueck (kein stiller Vorrang)",
  G.entscheideEbene({ bestand: bestand("bund", "ki"), neu: { level: "eu", quelle: "orakel", konfidenz: "high" } }).ebene === "bund");

// Idempotenz: gleiche Eingabe -> byte-gleiche Ausgabe.
const idemA = G.entscheideEbene({ bestand: bestand("bund"), neu: { level: "unknown", quelle: "deriver" }, jetzt: T1 });
const idemB = G.entscheideEbene({ bestand: bestand("bund"), neu: { level: "unknown", quelle: "deriver" }, jetzt: T1 });
check("A17 idempotent: gleiche Eingabe -> identisches Ergebnis", JSON.stringify(idemA) === JSON.stringify(idemB));

// ══════════════════════════════════════════════════════════════════════════════
// B · Einbindung in die Klassifikation
// ══════════════════════════════════════════════════════════════════════════════
console.log("\nB · classifyKnowledgeObject");

const koOhneSignal = { headline: "Sommerfest des Vereins", was_ist_passiert: "Ein Fest fand statt." };
const koMitAusschuss = { ausschuesse: ["Arbeit und Soziales"], headline: "Bundestag beschliesst Rentenpaket" };

check("B1 unveraendertes Altverhalten ohne opts (Ausschuss -> bund/high)", (() => {
  const r = C.classifyKnowledgeObject(koMitAusschuss, {});
  return r.decision_level === "bund" && r.classification_confidence.level === "high";
})());
check("B2 unveraendertes Altverhalten ohne opts (kein Signal -> unknown)",
  C.classifyKnowledgeObject(koOhneSignal, {}).decision_level === "unknown");

const b3 = C.classifyKnowledgeObject(koOhneSignal, {}, { bestand: bestand("bund"), jetzt: T1 });
check("B3 mit Bestand: Ebene wird wiederverwendet statt neu berechnet",
  b3.decision_level === "bund" && b3.level_entscheidung.wiederverwendet === true, b3.decision_level);
check("B4 Herkunft/Zeitpunkt/Wiederverwendung stehen im classification_confidence (keine neue Spalte)",
  b3.classification_confidence.level_quelle === "deriver"
  && b3.classification_confidence.level_ermittelt_am === T0
  && b3.classification_confidence.level_wiederverwendet === true);
// SPRINT 20 — ANGEPASST. Die alte Erwartung lautete "affected = Deutschland" und
// schrieb damit genau die Vermischung fest, die Sprint 20 aufloest: aus der
// (wiederverwendeten) Ebene 'bund' wurde eine Geografie ERZEUGT. Ebene und
// Geografie sind jetzt getrennt — die Ebene bleibt wiederverwendet 'bund', die
// Geografie bleibt ehrlich UNBEKANNT, weil dieses KO keinen einzigen
// geografischen Nachweis traegt.
check("B5 Folgefelder konsistent: Ebene 'bund' wiederverwendet, Geografie bleibt UNBEKANNT",
  b3.decision_level === "bund"
  && b3.affected_geographies.length === 0
  && b3.classification_confidence.geography === "unknown"
  && !b3.related_levels.includes("bund"));

const b6 = C.classifyKnowledgeObject(koOhneSignal, {}, { bestand: bestand("bund"), jetzt: T1 });
check("B6 idempotent: zweiter Lauf schreibt exakt denselben Ebenenblock",
  JSON.stringify(b6.classification_confidence) === JSON.stringify(b3.classification_confidence));

check("B7 KI-Wert korrigiert einen Deriver-Bestand (hoeherwertige Herkunft)",
  C.classifyKnowledgeObject(koOhneSignal, { decision_level: "eu" }, { bestand: bestand("bund", "deriver"), jetzt: T1 }).decision_level === "eu");

// Backfill: kann eine bereits ermittelte Ebene nicht mehr herabstufen.
const b8 = buildClassificationPatch({ id: "ko-alt", decision_level: "bund", headline: "Sommerfest" }, { embed: () => [] });
check("B8 Backfill stuft eine gespeicherte Ebene nicht herab",
  b8.decision_level === "bund" && b8.political_level === "bund", b8.decision_level);

// ══════════════════════════════════════════════════════════════════════════════
// C · Echter Produktionspfad (understandOneCluster -> understandUpdate)
// ══════════════════════════════════════════════════════════════════════════════
console.log("\nC · Produktionspfad Aktualisierung");

// Schema-valide KI-Antwort OHNE jedes Ebenen-Signal (kein Ausschuss, kein
// Ministerium, keine Institution im Text) -> der Deriver liefert hier 'unknown'.
const aiOhneSignal = {
  was_ist_passiert: "Der Verein hat sein Sommerfest gefeiert.",
  warum_wichtig: "Die Veranstaltung war gut besucht und wurde lokal wahrgenommen.",
  wer_ist_betroffen: "Mitglieder des Vereins und Anwohner des Stadtteils.",
  handlungsempfehlung: "Keine politische Reaktion erforderlich, Vorgang beobachten.",
  zeitdruck: "niedrig", status: "neu", confidence_score: 60,
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
  mentioned_people: [], mentioned_mps: [], mentioned_parties: [], mentioned_committees: [],
  mentioned_ministries: [], mentioned_locations: [], mentioned_organizations: []
};

const gespeichert = [];
let kiAufrufe = 0;
const deps = {
  enabled: () => true,
  aiEnabled: () => true,
  acquireLock: () => ({ granted: true, active: true }),
  releaseLock: () => {},
  getExisting: () => null,
  canSpend: () => ({ allowed: true }),
  requestUnderstanding: () => { kiAufrufe += 1; return { ...aiOhneSignal }; },
  save: (k) => { gespeichert.push(k); return { saved: true, id: k.id }; },
  saveSources: () => ({ saved: true }),
  markFailed: () => ({ saved: true }),
  modelName: () => "gpt-5-mini",
  logSkip: () => {},
  listVorgangDocuments: () => [{ id: "rd-1", title: "Rentenpaket 2026 im Kabinett beschlossen" }]
};

const updCluster = { documents: [
  { id: "rd-1", title: "Rentenpaket 2026 im Kabinett beschlossen" },
  { id: "rd-2", title: "Verein feiert Sommerfest im Stadtteilpark" }
] };

// Bestandsvorgang mit ermittelter Ebene 'bund' — so, wie ihn der Kandidatenpfad liefert.
const bestandsKo = {
  id: "ko-vg-x", vorgang_id: "vg-x", status: "neu", understanding_status: "complete", ko_version: 1,
  decision_level: "bund", political_level: "bund",
  classification_confidence: { level: "high", level_quelle: "deriver", level_ermittelt_am: T0 }
};

(async () => {
  const upd = await U.understandOneCluster(updCluster, deps, { vorgangId: "vg-x", existing: { ...bestandsKo } });
  check("C1 Aktualisierung laeuft (updated) mit GENAU einem KI-Aufruf",
    upd.status === "updated" && kiAufrufe === 1, `status=${upd.status} calls=${kiAufrufe}`);
  const ko1 = gespeichert[gespeichert.length - 1];
  check("C2 KERNBEWEIS: die gespeicherte Ebene bleibt 'bund' (kein Rueckfall auf 'unknown')",
    ko1 && ko1.decision_level === "bund" && ko1.political_level === "bund", ko1 && ko1.decision_level);
  check("C3 der Datensatz weist die Wiederverwendung nach",
    ko1.classification_confidence.level_wiederverwendet === true
    && ko1.classification_confidence.level_ermittelt_am === T0);
  check("C4 das gespeicherte KO bleibt schema-valide", validateKnowledgeObject(ko1).valid === true,
    JSON.stringify(validateKnowledgeObject(ko1).errors || []).slice(0, 200));

  // REGRESSIONSBEWEIS: derselbe Lauf ohne Bestand ergibt 'unknown'. Ohne diesen
  // Gegenbeweis koennte C2 auch dann gruen sein, wenn der Cluster ein Bundessignal
  // traegt — die Pruefung waere wertlos.
  const ohneBestand = U.assembleKnowledgeObject({ ...aiOhneSignal }, updCluster, "vg-x", { understanding_status: "complete" });
  check("C5 Gegenbeweis: ohne Bestand faellt derselbe Fall auf 'unknown' zurueck (Zustand vor Sprint 19)",
    ohneBestand.decision_level === "unknown", ohneBestand.decision_level);

  // Zweiter Aktualisierungslauf auf dem Ergebnis des ersten -> identischer Ebenenblock.
  const zweiter = await U.understandOneCluster(
    { documents: [...updCluster.documents, { id: "rd-3", title: "Nachbericht zum Sommerfest im Stadtteil" }] },
    { ...deps, listVorgangDocuments: () => updCluster.documents },
    { vorgangId: "vg-x", existing: { ...ko1, status: "neu", understanding_status: "complete" } }
  );
  const ko2 = gespeichert[gespeichert.length - 1];
  check("C6 idempotent ueber Laeufe: zweite Aktualisierung schreibt denselben Ebenenblock",
    zweiter.status === "updated" && ko2.decision_level === "bund"
    && ko2.classification_confidence.level_ermittelt_am === T0
    && ko2.classification_confidence.level_quelle === "deriver");

  // Terminal/failed-Pfade bleiben unberuehrt (kein neuer KI-Aufruf, kein Write).
  const vorher = kiAufrufe;
  const terminal = await U.understandOneCluster(updCluster, deps, {
    vorgangId: "vg-x", existing: { ...bestandsKo, understanding_status: "failed-final" }
  });
  check("C7 terminale Vorgaenge bleiben unberuehrt (kein KI-Aufruf, kein Write)",
    terminal.status === "skipped-terminal" && kiAufrufe === vorher);

  // ════════════════════════════════════════════════════════════════════════════
  // D · Lese-Projektion des Kandidatenpfads
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\nD · Lese-Projektion");
  const storageSrc = fs.readFileSync(path.join(root, "lib/helmut/storage.js"), "utf8");
  const projektion = storageSrc.split("async function listKnowledgeObjectsByVorgangPrefix")[1] || "";
  const colsZeile = (projektion.match(/const cols = "([^"]+)"/) || [])[1] || "";
  check("D1 Kandidatenpfad liest decision_level (sonst kann nichts wiederverwendet werden)",
    colsZeile.split(",").includes("decision_level"), colsZeile);
  check("D2 Kandidatenpfad liest classification_confidence (Herkunft/Zeitpunkt)",
    colsZeile.split(",").includes("classification_confidence"));
  check("D3 Kandidatenpfad liest political_level (Alt-Zeilen)",
    colsZeile.split(",").includes("political_level"));
  check("D4 kein Volltext/Vektor in der Kandidatenprojektion (Kosten/Perf)",
    !colsZeile.includes("embedding") && !colsZeile.includes("was_ist_passiert"));

  // ════════════════════════════════════════════════════════════════════════════
  // E · Ehrliche Abdeckung (kein falsches Gruen)
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\nE · Abdeckungskennzahl");
  const falschGruen = coverageAxis({ total: 100, withLevel: 100, withEstablishedLevel: 20, levelCoverage: 1, establishedLevelCoverage: 0.2, missingLevel: 0, unknownLevel: 80 });
  check("E1 100 % gefuellte Spalte, aber nur 20 % ermittelt -> WARN (kein falsches Gruen)",
    falschGruen.warn === true && falschGruen.status === "niedrig" && falschGruen.unknownLevel === 80);
  const echtOk = coverageAxis({ total: 100, withLevel: 100, withEstablishedLevel: 90, levelCoverage: 1, establishedLevelCoverage: 0.9, missingLevel: 0, unknownLevel: 10 });
  check("E2 90 % ermittelt -> ok", echtOk.warn === false && echtOk.status === "ok");
  const altAufrufer = coverageAxis({ total: 100, withLevel: 90, levelCoverage: 0.9, missingLevel: 10 });
  check("E3 Alt-Aufrufer ohne neue Kennzahl -> unveraendertes Verhalten",
    altAufrufer.available === true && altAufrufer.warn === false && altAufrufer.establishedLevelCoverage === null);
  check("E4 unbekannte Abdeckung bleibt 'unbekannt'", coverageAxis(null).status === "unbekannt");

  const storageQuery = storageSrc.split("async function getClassificationCoverage")[1] || "";
  check("E5 die Zaehlung schliesst 'unknown' aus (nicht nur not.is.null)",
    /decision_level=neq\.unknown/.test(storageQuery));

  console.log(`\n${passed}/${passed + failed} Ebenen-Gedaechtnis-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch((e) => {
  console.error("FEHLGESCHLAGEN (Ausnahme):", e && e.stack);
  process.exit(1);
});
