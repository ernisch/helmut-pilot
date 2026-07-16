"use strict";

// P0-5 Stufe 1 — Blob-Timeout-Robustheit: Retry + Backoff + kein stiller Verlust.
//
// Belegt fuer withStoreRetry / isRetryableStoreError:
//  * transienter Fehler (Timeout/5xx/Verbindung) loest begrenzten Retry aus und
//    gelingt beim spaeteren Versuch;
//  * permanenter Fehler (4xx) wird NICHT geretryt (sofort durchgereicht);
//  * nach erschoepften Retries: genau EIN technischer systemError (kein stiller
//    Lauf-Verlust) + der Fehler wird weitergeworfen;
//  * KEINE Endlosschleife (feste Obergrenze);
//  * Erfolg beim ersten Versuch erzeugt keinen Retry/Fehler.
//
// KEIN Netz. Nur synthetische Fehler; Auth-Store Snapshot/Restore fuer den
// systemError-Nachweis.

const fs = require("fs");
const path = require("path");

process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;
process.env.HELMUT_BLOB_RETRY_BASE_MS = "1"; // Test schnell halten

const storage = require("../lib/helmut/storage");
const { withStoreRetry, isRetryableStoreError, readAuthStore } = storage;

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── isRetryableStoreError: transient vs. permanent ─────────────────────────────
check("Timeout ist retrybar", isRetryableStoreError(new Error("Supabase storage timed out after 10000ms: /rest")) === true);
check("5xx ist retrybar", isRetryableStoreError(new Error("Supabase storage failed (503): busy")) === true);
check("Verbindungsabbruch ist retrybar", isRetryableStoreError(new Error("ECONNRESET socket hang up")) === true);
check("4xx ist NICHT retrybar (permanent)", isRetryableStoreError(new Error("Supabase storage failed (409): conflict")) === false);
check("leerer Fehler nicht retrybar", isRetryableStoreError(new Error("")) === false);

const dataDir = path.join(__dirname, "..", ".helmut-data");
const authFile = path.join(dataDir, "auth.json");
const backup = fs.existsSync(authFile) ? fs.readFileSync(authFile, "utf8") : null;

(async () => {
  try {
    if (fs.existsSync(authFile)) fs.unlinkSync(authFile);

    // ── (1) Erfolg beim ersten Versuch: kein Retry ───────────────────────────
    let calls = 0;
    const ok = await withStoreRetry(async () => { calls += 1; return "ok"; }, { label: "blob-write" });
    check("Erfolg 1. Versuch: Ergebnis durchgereicht", ok === "ok");
    check("Erfolg 1. Versuch: genau ein Aufruf", calls === 1);

    // ── (2) Transienter Fehler, dann Erfolg: begrenzter Retry gelingt ────────
    let attempt = 0;
    const eventualOk = await withStoreRetry(async () => {
      attempt += 1;
      if (attempt < 2) throw new Error("Supabase storage timed out after 10000ms");
      return "recovered";
    }, { label: "blob-write" });
    check("Transient dann Erfolg: recovered", eventualOk === "recovered");
    check("Transient: genau 2 Versuche (1 Retry)", attempt === 2);

    // ── (3) Permanenter 4xx-Fehler: sofort durchgereicht, KEIN Retry ─────────
    let permCalls = 0;
    let threw = false;
    try {
      await withStoreRetry(async () => { permCalls += 1; throw new Error("Supabase storage failed (409): conflict"); }, { label: "blob-write" });
    } catch (_) { threw = true; }
    check("4xx: wird geworfen", threw === true);
    check("4xx: KEIN Retry (genau 1 Versuch)", permCalls === 1);

    // ── (4) Erschoepfte Retries -> genau EIN systemError + Wurf ───────────────
    let exhaustCalls = 0;
    let exhaustThrew = false;
    const before = (await readAuthStore()).systemErrors.length;
    try {
      await withStoreRetry(async () => { exhaustCalls += 1; throw new Error("Supabase storage timed out after 10000ms"); }, { label: "blob-write", storeKey: "main" });
    } catch (_) { exhaustThrew = true; }
    const store = await readAuthStore();
    const after = store.systemErrors.length;
    // BLOB_RETRY_MAX default 2 -> 3 Versuche.
    check("Erschoepft: feste Obergrenze (3 Versuche, keine Endlosschleife)", exhaustCalls === 3);
    check("Erschoepft: Fehler wird weitergeworfen", exhaustThrew === true);
    check("Erschoepft: genau EIN neuer systemError (kein stiller Verlust)", after === before + 1);
    const err = store.systemErrors[0];
    check("systemError: Prozess blob-write", err && err.process === "blob-write");
    check("systemError: Fehlertyp timeout (klassifiziert)", err && err.errorType === "timeout");
    check("systemError: KEIN roher Text/kein Message-Feld", err && !("message" in err));
  } finally {
    if (backup != null) fs.writeFileSync(authFile, backup);
    else if (fs.existsSync(authFile)) fs.unlinkSync(authFile);
  }

  console.log(`\n${passed}/${passed + failed} Blob-Retry-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})();
