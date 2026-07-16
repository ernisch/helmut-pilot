"use strict";

// P0-2 — compactStore-Roundtrip (Beobachtbarkeit + DSGVO-Datensparsamkeit).
//
// Belegt zweierlei:
//  (1) Die fuenf Diagnosefelder durationMs / understanding / googleUrlResolution /
//      sourceMode / runId ueberleben das Verdichten beim Speichern (vorher wurden
//      sie von compactStore sofort gestrippt -> pipeline-status.durationMs=null,
//      toter Google-News-Monitor). Nachweis sowohl auf der reinen Funktion
//      compactCrawlRunForStore als auch ueber einen echten writeStore->readStore.
//  (2) Datensparsamkeit: compactStore verwirft an einem crawlRun haengende
//      Fremdfelder (simulierte PII/Volltext) — die Allowlist laesst NUR technische
//      Metadaten durch. Es werden ausschliesslich SYNTHETISCHE Testdaten benutzt.
//
// KEIN Netz, KEINE KI, KEINE Supabase — laeuft rein gegen den lokalen Dateispeicher.

const fs = require("fs");
const path = require("path");

// Dateispeicher erzwingen (kein Supabase) — im Offline-Runner ohnehin der Fall,
// hier defensiv gesetzt, damit der Test auch lokal deterministisch bleibt.
process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;

const storage = require("../lib/helmut/storage");
const { compactStore, compactCrawlRunForStore } = storage;

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Ein synthetischer Crawl-Lauf mit ALLEN Diagnosefeldern + bewusst untergeschobenen
// Fremdfeldern, die NICHT persistiert werden duerfen (Data-Minimization-Nachweis).
const syntheticRun = {
  mode: "full",
  checkedSources: 145,
  successfulSources: 145,
  failedSources: 0,
  newCandidateItems: 1012,
  savedItems: 55,
  createdAt: "2026-07-16T04:03:00.000Z",
  errors: [{ sourceName: "Testquelle", error: "HTTP 503" }],
  // --- die fuenf Pflicht-Diagnosefelder (P0-2) ---
  durationMs: 48231,
  runId: "run-20260716-0403-synthetic",
  sourceMode: "on",
  googleUrlResolution: { attempted: 40, resolved: 38 },
  understanding: { processed: 7, deferred: 3, reason: "budget" },
  // --- Fremdfelder, die die Allowlist verwerfen MUSS (synthetische PII/Volltext) ---
  briefingText: "VERTRAULICH: kompletter Briefingtext von Testnutzer …",
  userEmail: "synthetic-tester@example.invalid",
  vollerDokumentInhalt: "x".repeat(5000),
  promptRaw: "System-Prompt sollte nie in Telemetrie landen"
};

// ── (1a) Pure Funktion: alle fuenf Felder ueberleben, sanitisiert ──────────────
const compacted = compactCrawlRunForStore(syntheticRun);
check("durationMs bleibt erhalten (Zahl)", compacted.durationMs === 48231);
check("runId bleibt erhalten", compacted.runId === "run-20260716-0403-synthetic");
check("sourceMode bleibt erhalten", compacted.sourceMode === "on");
check("googleUrlResolution bleibt erhalten (attempted/resolved)",
  compacted.googleUrlResolution && compacted.googleUrlResolution.attempted === 40 && compacted.googleUrlResolution.resolved === 38);
check("understanding bleibt erhalten (Zaehler)",
  compacted.understanding && compacted.understanding.processed === 7 && compacted.understanding.deferred === 3 && compacted.understanding.reason === "budget");

// ── (1b) Bestandsfelder bleiben unveraendert ──────────────────────────────────
check("mode/checkedSources/savedItems unveraendert",
  compacted.mode === "full" && compacted.checkedSources === 145 && compacted.savedItems === 55);
check("createdAt unveraendert", compacted.createdAt === "2026-07-16T04:03:00.000Z");
check("errors bleibt (max 20)", Array.isArray(compacted.errors) && compacted.errors.length === 1);

// ── (2) Datensparsamkeit: KEINE Fremd-/PII-Felder in der persistierten Form ────
const leakedKeys = Object.keys(compacted).filter((k) => ["briefingText", "userEmail", "vollerDokumentInhalt", "promptRaw"].includes(k));
check("Data-Minimization: Fremd-/PII-Felder werden verworfen", leakedKeys.length === 0, `geleakt: ${leakedKeys.join(", ")}`);
const serialized = JSON.stringify(compacted);
check("Data-Minimization: kein Volltext/keine E-Mail im Serialisat",
  !serialized.includes("VERTRAULICH") && !serialized.includes("example.invalid") && !serialized.includes("System-Prompt"));

// ── Sanitisierung: Ueberlange/kaputte Werte werden gekappt bzw. genullt ────────
const dirty = compactCrawlRunForStore({
  createdAt: "2026-07-16T04:03:00.000Z",
  durationMs: "nicht-numerisch",
  runId: "r".repeat(500),
  sourceMode: "s".repeat(500),
  understanding: { processed: "7", deferred: null, reason: "z".repeat(500) },
  googleUrlResolution: "kaputt"
});
check("durationMs nicht-numerisch -> null", dirty.durationMs === null);
check("runId wird auf 80 Zeichen gekappt", dirty.runId.length === 80);
check("sourceMode wird auf 24 Zeichen gekappt", dirty.sourceMode.length === 24);
check("understanding.reason wird auf 120 Zeichen gekappt", dirty.understanding.reason.length === 120);
check("understanding.processed als String -> Zahl", dirty.understanding.processed === 7);
check("googleUrlResolution kaputt -> null", dirty.googleUrlResolution === null);

// ── (1c) compactStore auf Store-Ebene: crawlRuns-Array wird verdichtet ─────────
const storeCompacted = compactStore({ crawlRuns: [syntheticRun] });
check("compactStore verdichtet crawlRuns[0].durationMs", storeCompacted.crawlRuns[0].durationMs === 48231);
check("compactStore verdichtet crawlRuns[0].understanding", storeCompacted.crawlRuns[0].understanding.processed === 7);
check("compactStore: kein Fremdfeld im crawlRun", !("briefingText" in storeCompacted.crawlRuns[0]));

// ── (1d) Echter Speicher->Lese-Roundtrip ueber writeStore/readStore ────────────
// Bestehenden Store sichern und am Ende byte-genau wiederherstellen, damit die
// uebrigen Offline-Suiten unveraendert weiterlaufen.
const dataDir = path.join(__dirname, "..", ".helmut-data");
const storeFile = path.join(dataDir, "store.json");
const backup = fs.existsSync(storeFile) ? fs.readFileSync(storeFile, "utf8") : null;

(async () => {
  try {
    const base = await storage.getLatestCrawlRun().catch(() => null); // liest/erzeugt Store
    void base;
    await storage.saveCrawlRun({ ...syntheticRun });                  // schreibt + compactStore
    const readBack = await storage.getLatestCrawlRun();               // liest erneut
    check("Roundtrip: durationMs nach Speichern+Lesen vorhanden", readBack && readBack.durationMs === 48231);
    check("Roundtrip: runId nach Speichern+Lesen vorhanden", readBack && readBack.runId === "run-20260716-0403-synthetic");
    check("Roundtrip: googleUrlResolution nach Speichern+Lesen vorhanden",
      readBack && readBack.googleUrlResolution && readBack.googleUrlResolution.resolved === 38);
    check("Roundtrip: understanding nach Speichern+Lesen vorhanden",
      readBack && readBack.understanding && readBack.understanding.processed === 7);
    check("Roundtrip: kein Fremd-/PII-Feld persistiert", readBack && !("briefingText" in readBack) && !("userEmail" in readBack));
  } finally {
    // Store wiederherstellen (oder entfernen, falls vorher keiner existierte).
    if (backup != null) fs.writeFileSync(storeFile, backup);
    else if (fs.existsSync(storeFile)) fs.unlinkSync(storeFile);
  }

  console.log(`\n${passed}/${passed + failed} compactStore-Roundtrip-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})();
