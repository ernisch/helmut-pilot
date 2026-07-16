"use strict";

// P0-1 — Laufzeitpersistenz der Batch-Prozesse (Understanding / Briefing / Lage).
//
// Belegt: recordProcessRun schreibt eine ECHTE, sanitisierte Wall-Clock-Dauer je
// Batch-Lauf in den kleinen Auth-Store (nicht in den grossen Blob), listProcessRuns
// liest sie zurueck, und die strenge Skalar-Allowlist verwirft jede untergeschobene
// PII/jeden Volltext (DSGVO-Datensparsamkeit). Nur SYNTHETISCHE Testdaten.
//
// KEIN Netz, KEINE KI, KEINE Supabase — laeuft gegen den lokalen Dateispeicher.

const fs = require("fs");
const path = require("path");

process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;

const storage = require("../lib/helmut/storage");
const { sanitizeProcessRun, recordProcessRun, listProcessRuns } = storage;

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── (1) sanitizeProcessRun: Skalar-Allowlist, PII/Volltext wird verworfen ──────
const dirty = sanitizeProcessRun({
  process: "understanding-eager",
  runId: "crawl-20260716T0403-abcde",
  mode: "full",
  durationMs: 48231,
  processed: 7,
  deferred: 3,
  skippedStore: 1,
  reason: "budget",
  status: "ok",
  // untergeschobene Fremd-/PII-Felder:
  briefingText: "VERTRAULICH voller Briefingtext …",
  userEmail: "synthetic@example.invalid",
  documentBody: "y".repeat(9000)
});
check("Allowlist: durationMs erhalten", dirty.durationMs === 48231);
check("Allowlist: processed/deferred/skippedStore erhalten", dirty.processed === 7 && dirty.deferred === 3 && dirty.skippedStore === 1);
check("Allowlist: reason/status erhalten", dirty.reason === "budget" && dirty.status === "ok");
check("Allowlist: Fremd-/PII-Felder verworfen", !("briefingText" in dirty) && !("userEmail" in dirty) && !("documentBody" in dirty));
check("Allowlist: kein Volltext/keine E-Mail im Serialisat",
  !JSON.stringify(dirty).includes("VERTRAULICH") && !JSON.stringify(dirty).includes("example.invalid"));
check("Allowlist: createdAt gesetzt", typeof dirty.createdAt === "string" && dirty.createdAt.length > 0);

// Sanitisierung von kaputten/ueberlangen Werten:
const s2 = sanitizeProcessRun({ process: "x".repeat(200), durationMs: "nope", reason: "z".repeat(400) });
check("process auf 40 gekappt", s2.process.length === 40);
check("durationMs nicht-numerisch -> null", s2.durationMs === null);
check("reason auf 120 gekappt", s2.reason.length === 120);
check("fehlender status -> 'ok' Default", s2.status === "ok");

// ── (2) Echter Persistenz-Roundtrip ueber Auth-Store ───────────────────────────
const dataDir = path.join(__dirname, "..", ".helmut-data");
const authFile = path.join(dataDir, "auth.json");
const backup = fs.existsSync(authFile) ? fs.readFileSync(authFile, "utf8") : null;

(async () => {
  try {
    await recordProcessRun({
      process: "understanding-eager", runId: "run-synth-1", mode: "full",
      durationMs: 12345, processed: 4, deferred: 2, skippedStore: 0, reason: null, status: "ok",
      leak: "sollte-nicht-persistiert-werden"
    });
    await recordProcessRun({
      process: "briefing-morning", runId: "run-synth-2", mode: "cron",
      durationMs: 210, processed: 6, status: "ok"
    });

    const all = await listProcessRuns({ limit: 100 });
    check("Roundtrip: >=2 Laeufe gespeichert", all.length >= 2);
    const eager = await listProcessRuns({ process: "understanding-eager", limit: 10 });
    check("Roundtrip: Filter nach Prozess", eager.length >= 1 && eager.every((r) => r.process === "understanding-eager"));
    const first = eager[0];
    check("Roundtrip: durationMs korrekt gelesen", first && first.durationMs === 12345);
    check("Roundtrip: processed/deferred korrekt", first && first.processed === 4 && first.deferred === 2);
    check("Roundtrip: kein untergeschobenes Feld persistiert", first && !("leak" in first));

    const briefing = await listProcessRuns({ process: "briefing-morning", limit: 10 });
    check("Roundtrip: Briefing-Aufbau-Dauer persistiert", briefing[0] && briefing[0].durationMs === 210);
  } finally {
    if (backup != null) fs.writeFileSync(authFile, backup);
    else if (fs.existsSync(authFile)) fs.unlinkSync(authFile);
  }

  console.log(`\n${passed}/${passed + failed} Prozess-Laufzeit-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})();
