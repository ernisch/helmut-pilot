"use strict";

// P0-4 — Atomarer Pipeline-Lock: Parallelitaet + fail-closed.
//
// Belegt auf App-Ebene (der SQL-Beweis ist ein Production-Beweislauf, §8):
//  * Zwei GLEICHZEITIG gestartete Acquire-Aufrufe fuer denselben Job -> GENAU EINER
//    gewinnt (atomarer Contract, kein Read-modify-write).
//  * Zwei gleichzeitige "runSourceCrawl"-artige Ablaeufe -> GENAU EINE Verarbeitung.
//  * FAIL-CLOSED: bei DB-Fehler verweigert der atomare Modus (return false).
//  * TTL-Uebernahme: nach Ablauf gewinnt der naechste Lauf.
//  * Token-gebundenes Release: nur der Halter gibt frei.
//  * Default (Flag AUS) = bisheriges Blob-Verhalten, fail-OPEN (unveraendert).
//
// Der injizierte Fake bildet die Semantik von helmut_acquire_pipeline_lock exakt
// nach (INSERT..ON CONFLICT..WHERE expires_at < now). KEIN Netz, KEINE DB.

process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;

const storage = require("../lib/helmut/storage");
const { acquirePipelineLock, releasePipelineLock } = storage;

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Faithful in-memory Nachbildung der atomaren SQL-Funktion. Der Check-and-Set
// laeuft SYNCHRON (kein await zwischen Lesen und Schreiben) — exakt die
// Atomaritaets-Garantie, die Postgres ueber den Row-Lock des Upserts gibt.
function makeFakeAtomicDb(startClock = 1000) {
  const rows = new Map(); // job -> { expiresAt, token }
  let clock = startClock;
  let seq = 0;
  return {
    advance: (ms) => { clock += ms; },
    request: async (endpoint, opts) => {
      const body = JSON.parse(opts.body);
      if (endpoint.includes("helmut_acquire_pipeline_lock")) {
        const now = clock;
        const existing = rows.get(body.p_job);
        if (!existing || existing.expiresAt < now) {
          const token = `tok-${++seq}`;
          rows.set(body.p_job, { expiresAt: now + body.p_ttl_ms, token });
          return [{ acquired: true, token }];
        }
        return [{ acquired: false, token: null }];
      }
      if (endpoint.includes("helmut_release_pipeline_lock")) {
        const existing = rows.get(body.p_job);
        if (existing && existing.token === body.p_token) { rows.delete(body.p_job); return [true]; }
        return [false];
      }
      throw new Error("unbekannter Endpoint");
    }
  };
}

(async () => {
  // ── Atomarer Modus aktiv ────────────────────────────────────────────────────
  process.env.HELMUT_ATOMIC_LOCK = "on";
  check("atomicLockEnabled true bei Flag on", storage.atomicLockEnabled() === true);

  // (1) Zwei gleichzeitige Acquire fuer denselben Job -> genau einer gewinnt.
  {
    const db = makeFakeAtomicDb();
    const [a, b] = await Promise.all([
      acquirePipelineLock("crawl-tenant-alpha", 600000, { request: db.request }),
      acquirePipelineLock("crawl-tenant-alpha", 600000, { request: db.request })
    ]);
    check("Parallel-Acquire: genau EINER gewinnt", (a === true) !== (b === true), `a=${a} b=${b}`);
    check("Parallel-Acquire: nicht beide true", !(a && b));
  }

  // (2) Zwei "runSourceCrawl"-artige Ablaeufe -> genau EINE Verarbeitung.
  {
    const db = makeFakeAtomicDb();
    let processed = 0;
    const run = async () => {
      const locked = await acquirePipelineLock("crawl-run", 600000, { request: db.request });
      if (!locked) return "skipped";
      try { processed += 1; return "processed"; }
      finally { await releasePipelineLock("crawl-run", { request: db.request }); }
    };
    const [r1, r2] = await Promise.all([run(), run()]);
    check("Parallel-Run: genau EINE Verarbeitung", processed === 1, `processed=${processed}`);
    check("Parallel-Run: einer processed, einer skipped", [r1, r2].sort().join(",") === "processed,skipped");
  }

  // (3) FAIL-CLOSED: DB-Fehler -> Acquire verweigert (kein fail-open mehr).
  {
    const throwing = { request: async () => { throw new Error("Supabase storage timed out after 10000ms"); } };
    const locked = await acquirePipelineLock("crawl-failclosed", 600000, throwing);
    check("Fail-closed: DB-Fehler -> Acquire=false (nicht mehr fail-open)", locked === false);
  }

  // (4) TTL-Uebernahme: nach Ablauf gewinnt der naechste Lauf.
  {
    const db = makeFakeAtomicDb();
    const first = await acquirePipelineLock("crawl-ttl", 1000, { request: db.request });
    const blockedWhileValid = await acquirePipelineLock("crawl-ttl", 1000, { request: db.request });
    db.advance(2000); // Lock abgelaufen
    const afterExpiry = await acquirePipelineLock("crawl-ttl", 1000, { request: db.request });
    check("TTL: erster Acquire gewinnt", first === true);
    check("TTL: waehrend gueltig blockiert", blockedWhileValid === false);
    check("TTL: nach Ablauf uebernimmt der naechste", afterExpiry === true);
  }

  // (5) Token-gebundenes Release: nur der Halter gibt frei.
  {
    const db = makeFakeAtomicDb();
    const got = await acquirePipelineLock("crawl-token", 600000, { request: db.request });
    check("Release-Vorbereitung: Lock gehalten", got === true);
    // Fremdes Release (falscher Token) darf den Lock NICHT loeschen.
    const foreign = await db.request("/rest/v1/rpc/helmut_release_pipeline_lock", { body: JSON.stringify({ p_job: "crawl-token", p_token: "tok-fremd" }) });
    check("Fremd-Release loescht nicht", foreign[0] === false);
    // Der Halter gibt korrekt frei (Token aus der internen Map).
    await releasePipelineLock("crawl-token", { request: db.request });
    const reacquire = await acquirePipelineLock("crawl-token", 600000, { request: db.request });
    check("Nach Halter-Release wieder erwerbbar", reacquire === true);
  }

  // ── Default (Flag AUS): bisheriges Blob-Verhalten, fail-OPEN (unveraendert) ──
  {
    delete process.env.HELMUT_ATOMIC_LOCK;
    check("atomicLockEnabled false ohne Flag", storage.atomicLockEnabled() === false);
    // Blob-Pfad, injizierter Fehler ueber kaputten readAuthStore ist nicht noetig:
    // wir pruefen nur, dass der Default-Pfad NICHT den atomaren (fail-closed) nimmt.
    // Ein normaler Acquire im lokalen Dateispeicher gelingt (fail-open Semantik bleibt).
    const fs = require("fs");
    const path = require("path");
    const authFile = path.join(__dirname, "..", ".helmut-data", "auth.json");
    const backup = fs.existsSync(authFile) ? fs.readFileSync(authFile, "utf8") : null;
    try {
      const locked = await acquirePipelineLock("crawl-blob-default", 600000);
      check("Default-Modus: Blob-Acquire gelingt (unveraendert)", locked === true);
      await releasePipelineLock("crawl-blob-default");
    } finally {
      if (backup != null) fs.writeFileSync(authFile, backup);
      else if (fs.existsSync(authFile)) fs.unlinkSync(authFile);
    }
  }

  console.log(`\n${passed}/${passed + failed} Atomarer-Lock-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})();
