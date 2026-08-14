"use strict";

// Helmut — Routentest POST /api/cron/worker-weck (Sicherheitskorrektur 2026-08-14).
// =============================================================================================
// Beweist am ECHTEN server.js-Handler (in-Prozess, lokaler Listener, kein Netz nach außen,
// keine Datenbank), dass das eingehende Wecksignal VOLLSTAENDIG geprueft wird, BEVOR
// irgendetwas verarbeitet wird:
//   §1 Autorisierung zuerst (falsches/fehlendes CRON_SECRET -> 403)
//   §2 Payload-Vertrag: exakt { jobId: <uuid>, schemaVersion: <int> } — fehlende Felder,
//      Zusatzfelder, Nicht-UUIDs, falsche Typen -> 400, geschlossen abgewiesen; es ist
//      DERSELBE zentrale Riegel wie beim Versand (jobDispatch.pruefeTransportPayload)
//   §3 Nicht unterstuetzte Schemaversion -> 409 (definitiver Fehlversuch beim Sender;
//      die Absicht bleibt offen und kommt nach dem Deployment-Wechsel wieder)
//   §4 Falscher Antrieb / fehlende Klassengrenzen -> 409 (Konfigurationsbefund)
//   §5 Reihenfolge: die Payload-Pruefung kommt VOR der Antriebspruefung
// Alle Faelle enden VOR jedem Datenbankzugriff — die Suite laeuft bewusst ohne
// SUPABASE_URL, ein versehentlicher Zugriff wuerde laut scheitern.

const assert = require("assert");
const http = require("http");
const path = require("path");
const crypto = require("crypto");

const SECRET = "weck-routentest-geheim";
process.env.CRON_SECRET = SECRET;
process.env.HELMUT_OFFLINE_TEST = "1";
process.env.HELMUT_SOURCE_MODE = "off";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_SCALABLE_PIPELINE;
delete process.env.HELMUT_JOB_DISPATCH_MODE;
delete process.env.HELMUT_KLASSEN_GRENZEN;

const root = path.join(__dirname, "..");
const handler = require(path.join(root, "server.js"));
const dispatch = require(path.join(root, "lib", "helmut", "job-dispatch"));

let pass = 0;
let fail = 0;
async function check(name, fn) {
  try { await fn(); pass += 1; console.log(`  PASS  ${name}`); }
  catch (error) { fail += 1; console.log(`  FAIL  ${name} — ${error && error.message}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

function post(port, body, { auth = SECRET, roh = false } = {}) {
  return new Promise((resolve, reject) => {
    const daten = roh ? String(body) : JSON.stringify(body);
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: "/api/cron/worker-weck",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth == null ? {} : { Authorization: `Bearer ${auth}` })
      }
    }, (res) => {
      let text = "";
      res.on("data", (c) => { text += c; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(text); } catch (_) { /* Text bleibt */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    req.end(daten);
  });
}

async function main() {
  console.log("Helmut — Routentest /api/cron/worker-weck (vollstaendige Signalpruefung)");
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const UUID = crypto.randomUUID();
  const GUELTIG = { jobId: UUID, schemaVersion: dispatch.SCHEMA_VERSION };

  try {
    abschnitt("1 · Autorisierung zuerst");
    await check("1.1 Ohne Authorization-Header: 403, keine Verarbeitung", async () => {
      const r = await post(port, GUELTIG, { auth: null });
      assert.strictEqual(r.status, 403);
    });
    await check("1.2 Falsches Secret: 403", async () => {
      const r = await post(port, GUELTIG, { auth: "falsch" });
      assert.strictEqual(r.status, 403);
    });

    abschnitt("2 · Payload-Vertrag: geschlossen abgewiesen (400), zentraler Versand-Riegel");
    const KAPUTT = [
      ["leeres Objekt (beide Felder fehlen)", {}],
      ["schemaVersion fehlt", { jobId: UUID }],
      ["jobId fehlt", { schemaVersion: 1 }],
      ["Zusatzfeld neben den zwei erlaubten", { jobId: UUID, schemaVersion: 1, mandat: "x" }],
      ["jobId ist ein Idempotenzschluessel", { jobId: "source_fetch:geteilt:2026-08-14", schemaVersion: 1 }],
      ["jobId ist eine URL", { jobId: "https://example.com/feed.xml", schemaVersion: 1 }],
      ["jobId traegt freien Text", { jobId: "Cem Ince Morgenlage", schemaVersion: 1 }],
      ["schemaVersion als String", { jobId: UUID, schemaVersion: "1" }],
      ["schemaVersion 0", { jobId: UUID, schemaVersion: 0 }],
      ["schemaVersion nicht ganzzahlig", { jobId: UUID, schemaVersion: 1.5 }],
      ["Array statt Objekt", [UUID, 1]],
      ["null-Werte", { jobId: null, schemaVersion: null }]
    ];
    for (const [name, body] of KAPUTT) {
      await check(`2.x ${name} -> 400`, async () => {
        const r = await post(port, body);
        assert.strictEqual(r.status, 400, `erwartet 400, war ${r.status}: ${r.text.slice(0, 120)}`);
        assert.strictEqual(r.json && r.json.verarbeitet, false);
        assert.match(String(r.json && r.json.grund), /transport-payload-ungueltig|Ungültige Anfrage/);
      });
    }
    await check("2.y Kein JSON im Body -> 400", async () => {
      const r = await post(port, "kein json {", { roh: true });
      assert.strictEqual(r.status, 400);
    });

    abschnitt("3 · Nicht unterstuetzte Schemaversion: 409 (Absicht bleibt offen)");
    await check("3.1 schemaVersion neuer als dieses Deployment -> 409", async () => {
      const r = await post(port, { jobId: UUID, schemaVersion: dispatch.SCHEMA_VERSION + 1 });
      assert.strictEqual(r.status, 409);
      assert.strictEqual(r.json.grund, "schema-version-neuer-als-deployment");
    });

    abschnitt("4 · Antrieb und Klassengrenzen: Konfigurationsbefunde sind 409");
    await check("4.1 Antrieb bestand (kein Flag): 409, kein Drain", async () => {
      const r = await post(port, GUELTIG);
      assert.strictEqual(r.status, 409);
      assert.match(String(r.json.grund), /antrieb-bestand/);
    });
    await check("4.2 Antrieb cron-queue (Pipeline an, Dispatch shadow): 409", async () => {
      process.env.HELMUT_SCALABLE_PIPELINE = "on";
      process.env.HELMUT_JOB_DISPATCH_MODE = "shadow";
      try {
        const r = await post(port, GUELTIG);
        assert.strictEqual(r.status, 409);
        assert.match(String(r.json.grund), /antrieb-cron-queue/);
      } finally {
        delete process.env.HELMUT_SCALABLE_PIPELINE;
        delete process.env.HELMUT_JOB_DISPATCH_MODE;
      }
    });
    await check("4.3 Ereignis-Antrieb OHNE Klassengrenzen: 409 (fail closed, kein Datenbankzugriff)", async () => {
      process.env.HELMUT_SCALABLE_PIPELINE = "on";
      process.env.HELMUT_JOB_DISPATCH_MODE = "queue";
      try {
        const r = await post(port, GUELTIG);
        assert.strictEqual(r.status, 409);
        assert.match(String(r.json.grund), /klassengrenzen-aus/);
      } finally {
        delete process.env.HELMUT_SCALABLE_PIPELINE;
        delete process.env.HELMUT_JOB_DISPATCH_MODE;
      }
    });

    abschnitt("5 · Reihenfolge: Signalpruefung VOR jeder Verarbeitung");
    await check("5.1 Kaputtes Payload + falscher Antrieb -> 400 (Payload-Pruefung gewinnt)", async () => {
      // Antrieb waere bestand (409) — aber das regelwidrige Payload muss ZUERST fallen.
      const r = await post(port, { jobId: "kein-uuid", schemaVersion: 1, extra: true });
      assert.strictEqual(r.status, 400);
    });
    await check("5.2 Dasselbe Signal, das der Versand baut, passiert die Eingangspruefung", async () => {
      // Vertragsgleichheit Sender <-> Empfaenger: transportPayload ist exakt das, was die
      // Route akzeptiert (bis zur Antriebspruefung kommt, d. h. NICHT an 400 scheitert).
      const payload = dispatch.transportPayload(UUID);
      const r = await post(port, payload);
      assert.strictEqual(r.status, 409, "faellt erst an der Antriebspruefung, nie am Payload");
      assert.match(String(r.json.grund), /antrieb-/);
    });
  } finally {
    await new Promise((r) => server.close(r));
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error && error.message);
  process.exit(1);
});
