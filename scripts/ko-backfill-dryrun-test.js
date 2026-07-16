"use strict";

// P1-1 — KO-Klassifikations-Backfill: Trockenlauf + Idempotenz + Kostenneutralität.
//
// Belegt (mit injizierten In-Memory-Deps, KEIN Netz/KI/DB):
//  * Trockenlauf (Default): schreibt NICHTS, meldet aber die betroffenen Datensätze.
//  * Voller Idempotenz-Zyklus: execute klassifiziert die Kandidaten; ein ZWEITER
//    Lauf über denselben (nun klassifizierten) Bestand hat 0 Kandidaten/0 Writes.
//  * Kostenneutral (0 LLM): der Backfill-Code importiert/ruft KEIN ai-Modul; ein Lauf
//    mit throwendem global.fetch gelingt trotzdem (rein deterministisch, kein Netz).
//  * Bericht über betroffene Datensätze: nur complete-KOs OHNE decision_level.
//
// Die AUSFÜHRUNG auf Production ist freigabepflichtig (E2) — hier nur der Trockenlauf.

const fs = require("fs");
const path = require("path");
const { runKoClassificationBackfill } = require("../lib/helmut/ko-classification-backfill");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Synthetischer KO-Bestand: 3 Kandidaten (complete, ohne Ebene), 1 schon klassifiziert,
// 1 pending (nicht verstanden) -> nur 3 sind betroffen.
function makeStore() {
  return [
    { id: "ko-a", understanding_status: "complete", ausschuesse: ["Gesundheit"], mentioned_locations: ["Deutschland"], was_ist_passiert: "Gesetzentwurf" },
    { id: "ko-b", understanding_status: "complete", mentioned_organizations: ["Landtag Brandenburg"], mentioned_locations: ["Brandenburg"] },
    { id: "ko-c", understanding_status: "complete", mentioned_ministries: ["BMAS"] },
    { id: "ko-d", understanding_status: "complete", decision_level: "bund" }, // schon klassifiziert
    { id: "ko-e", understanding_status: "pending" }                            // nicht verstanden
  ];
}

(async () => {
  // ── Trockenlauf: kein Write, Bericht über betroffene Datensätze ─────────────
  const store = makeStore();
  let writes = 0;
  const dry = await runKoClassificationBackfill({ execute: false, limit: 100 }, {
    listKnowledgeObjects: async () => store,
    saveEnrichment: async () => { writes += 1; }
  });
  check("Trockenlauf: dryRun=true", dry.dryRun === true);
  check("Trockenlauf: schreibt NICHTS", writes === 0);
  check("Bericht: 3 betroffene Datensätze (nur complete ohne Ebene)", dry.candidates === 3);
  check("Bericht: Gesamtzahl KOs korrekt", dry.totalKos === 5);
  check("Trockenlauf: Vorschau ohne Write", Array.isArray(dry.preview) && dry.preview.length === 3 && dry.preview.every((p) => p.decision_level));

  // ── Kostenneutral: kein ai-Import, kein Netz ────────────────────────────────
  const backfillSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "ko-classification-backfill.js"), "utf8");
  check("Kostenneutral: Backfill importiert KEIN ai-Modul", !/require\(["']\.\/ai["']\)/.test(backfillSrc) && !backfillSrc.includes("requestStructuredJson"));
  const origFetch = global.fetch;
  global.fetch = () => { throw new Error("KEIN Netz im Backfill erlaubt"); };
  try {
    const noNet = await runKoClassificationBackfill({ execute: false, limit: 100 }, { listKnowledgeObjects: async () => store });
    check("Kostenneutral: Lauf gelingt ohne Netz (throwender fetch)", noNet.dryRun === true && noNet.candidates === 3);
  } finally { global.fetch = origFetch; }

  // ── Voller Idempotenz-Zyklus: execute -> re-run -> 0 Kandidaten ─────────────
  const written = {};
  const exec = await runKoClassificationBackfill({ execute: true, limit: 100 }, {
    listKnowledgeObjects: async () => store,
    saveEnrichment: async (id, patch) => { written[id] = patch; }
  });
  check("Execute: 3 verarbeitet, 0 Fehler", exec.processed === 3 && exec.failed === 0);
  check("Execute: jeder Kandidat erhält Feature-Vektor (embedding)",
    ["ko-a", "ko-b", "ko-c"].every((id) => Array.isArray(written[id].embedding) && written[id].embedding.length > 0));
  check("Execute: jeder Kandidat erhält decision_level", ["ko-a", "ko-b", "ko-c"].every((id) => typeof written[id].decision_level === "string"));
  check("Execute: schon klassifiziertes/pending KO NICHT angefasst", written["ko-d"] === undefined && written["ko-e"] === undefined);

  // Store aktualisieren (die verarbeiteten KOs haben jetzt decision_level) und ZWEITER Lauf.
  const storeAfter = store.map((ko) => (written[ko.id] ? { ...ko, decision_level: written[ko.id].decision_level } : ko));
  let writes2 = 0;
  const rerun = await runKoClassificationBackfill({ execute: true, limit: 100 }, {
    listKnowledgeObjects: async () => storeAfter,
    saveEnrichment: async () => { writes2 += 1; }
  });
  check("Idempotenz: zweiter Lauf 0 Kandidaten", rerun.candidates === 0 && rerun.processed === 0);
  check("Idempotenz: zweiter Lauf 0 Writes", writes2 === 0);

  console.log(`\n${passed}/${passed + failed} KO-Backfill-Trockenlauf-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})();
