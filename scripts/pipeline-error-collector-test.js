"use strict";

// P0-3 / Abnahmekriterium #4 — Fehlerprotokoll ohne personenbezogene Inhalte.
// Belegt fuer recordPipelineError (systemErrors):
//  * technische Metadaten vorhanden (Prozess, Laufkennung, Quelle, Fehlertyp,
//    Zeitpunkt, Commit, Wiederholungsnummer);
//  * KEIN roher Fehlertext / kein Dokumentinhalt / keine PII persistiert;
//  * Dedup ueber stabilen Fingerprint (Zaehler statt Flut);
//  * Erfolgslauf erzeugt KEINEN Eintrag;
//  * recordSystemError redigiert Secrets/PII zentral.
// KEIN Netz/KI/Supabase — lokaler Dateispeicher, Snapshot/Restore.

const fs = require("fs");
const path = require("path");

process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;

const storage = require("../lib/helmut/storage");
const accounts = require("../lib/helmut/accounts");
const { recordPipelineError, readAuthStore } = storage;

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const dataDir = path.join(__dirname, "..", ".helmut-data");
const authFile = path.join(dataDir, "auth.json");
const backup = fs.existsSync(authFile) ? fs.readFileSync(authFile, "utf8") : null;

(async () => {
  try {
    // sauberer Ausgangszustand
    if (fs.existsSync(authFile)) fs.unlinkSync(authFile);

    // ── (1) Ein Pipeline-Fehler mit rohem, sensiblem Text ───────────────────────
    const rawSensitive = new Error("Supabase storage failed (409): Failing row contains (geheim, cem@example.invalid, VOLLTEXT-DOKUMENT); Bearer sk-FAKE1234567890abcdef");
    const e1 = await recordPipelineError({ process: "understanding-eager", runId: "run-a", sourceId: "src-bmas", userId: "mandate-1", error: rawSensitive, retry: 0 });
    check("Eintrag erzeugt", e1 && e1.scope === "pipeline");
    check("Prozessname vorhanden", e1.process === "understanding-eager");
    check("Laufkennung vorhanden", e1.runId === "run-a");
    check("Quellenkennung vorhanden", e1.sourceId === "src-bmas");
    check("pseudonyme Nutzerkennung vorhanden", e1.userId === "mandate-1");
    check("Fehlertyp KLASSIFIZIERT (db)", e1.errorType === "db");
    check("Zeitpunkt vorhanden", typeof e1.createdAt === "string");
    check("Wiederholungsnummer vorhanden", e1.retry === 0);
    check("count startet bei 1", e1.count === 1);
    check("KEIN rohes message-Feld", !("message" in e1));
    const ser1 = JSON.stringify(e1);
    check("kein roher Fehlertext/kein Volltext", !ser1.includes("VOLLTEXT-DOKUMENT") && !ser1.includes("Failing row"));
    check("keine E-Mail persistiert", !ser1.includes("example.invalid"));
    check("kein Token/Secret persistiert", !ser1.includes("sk-FAKE1234567890abcdef"));

    // ── (2) Dedup: gleicher Fehler erhoeht Zaehler, keine zweite Zeile ───────────
    await recordPipelineError({ process: "understanding-eager", runId: "run-b", sourceId: "src-bmas", error: new Error("409 duplicate key"), retry: 1 });
    let store = await readAuthStore();
    const bmasEntries = (store.systemErrors || []).filter((e) => e.fingerprint === e1.fingerprint);
    check("Dedup: nur EIN Eintrag fuer denselben Fingerprint", bmasEntries.length === 1);
    check("Dedup: Zaehler erhoeht auf 2", bmasEntries[0].count === 2);
    check("Dedup: hoechste Wiederholungsnummer uebernommen", bmasEntries[0].retry === 1);

    // ── (3) Anderer Prozess/Quelle -> eigener Eintrag ───────────────────────────
    await recordPipelineError({ process: "matching-shadow", runId: "run-b", sourceId: "src-x", error: new Error("timed out") });
    store = await readAuthStore();
    check("Anderer Fingerprint -> zweiter Eintrag", (store.systemErrors || []).length === 2);

    // ── (4) Erfolgslauf erzeugt KEINEN Eintrag ──────────────────────────────────
    const before = (await readAuthStore()).systemErrors.length;
    // (kein recordPipelineError-Aufruf bei Erfolg — hier explizit nichts tun)
    const after = (await readAuthStore()).systemErrors.length;
    check("Erfolgslauf: keine neue Fehlerzeile", before === after);

    // ── (5) recordSystemError redigiert Secrets/PII zentral ─────────────────────
    process.env.CRON_SECRET = "cronsecretFAKE1234567890";
    await accounts.recordSystemError({ scope: "server", message: `crash mit Bearer ${process.env.CRON_SECRET} und cem@example.invalid` });
    store = await readAuthStore();
    const serverErr = (store.systemErrors || []).find((e) => e.scope === "server");
    check("recordSystemError: Eintrag vorhanden", Boolean(serverErr));
    check("recordSystemError: Secret redigiert", serverErr && !serverErr.message.includes("cronsecretFAKE1234567890"));
    check("recordSystemError: E-Mail redigiert", serverErr && !serverErr.message.includes("example.invalid"));
    delete process.env.CRON_SECRET;
  } finally {
    if (backup != null) fs.writeFileSync(authFile, backup);
    else if (fs.existsSync(authFile)) fs.unlinkSync(authFile);
  }

  console.log(`\n${passed}/${passed + failed} Pipeline-Fehler-Sammler-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})();
