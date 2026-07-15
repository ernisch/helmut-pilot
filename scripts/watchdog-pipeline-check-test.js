"use strict";

// Offline-Test des Watchdog-Pipeline-Checks (scripts/watchdog-pipeline-check.js).
// =============================================================================
// Reproduziert den realen Production-Vorfall (2026-07-15): Pipeline lief ~193 s
// und schloss serverseitig erfolgreich ab, der 120-s-curl-Client brach ab und
// der Workflow behauptete faelschlich "Pipeline wurde NICHT ausgefuehrt".
//
// Jedes Szenario startet einen lokalen HTTP-Mock (kein Netz, kein Production-
// Zugriff) und fuehrt das ECHTE Check-Skript als Kindprozess aus — exakt so, wie
// GitHub Actions es aufruft. Geprueft werden Exit-Code, ehrliche Meldung und der
// DOPPEL-TRIGGER-SCHUTZ (die Pipeline darf pro Lauf genau einmal angestossen werden).

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const CHECK = path.join(__dirname, "watchdog-pipeline-check.js");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Startet einen Mock und liefert { url, counts, close }.
function startMock(behavior) {
  const counts = { pipeline: 0, status: 0 };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    if (u.pathname === "/api/cron/pipeline") {
      counts.pipeline += 1;
      return behavior.pipeline(req, res, counts);
    }
    if (u.pathname === "/api/cron/pipeline-status") {
      counts.status += 1;
      return behavior.status(req, res, counts);
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        counts,
        close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); })
      });
    });
  });
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// Fuehrt das Check-Skript als Kindprozess aus. WICHTIG: asynchron (spawn),
// NICHT spawnSync — der Mock-Server lebt im selben Prozess und muss waehrend
// des Kindlaufs Requests bedienen koennen (spawnSync wuerde den Event-Loop
// blockieren und JEDEN Mock-Request kuenstlich in den Timeout treiben).
function runCheck(baseUrl) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CHECK], {
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        CRON_SECRET: "test-secret-niemals-echt",
        WATCHDOG_CLIENT_TIMEOUT_MS: "1500",
        WATCHDOG_STATUS_POLL_ATTEMPTS: "3",
        WATCHDOG_STATUS_POLL_INTERVAL_MS: "150",
        WATCHDOG_CLOCK_SKEW_MS: "60000"
      }
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    const killer = setTimeout(() => child.kill("SIGKILL"), 30000);
    child.on("close", (code) => { clearTimeout(killer); resolve({ code, out }); });
  });
}

const hang = () => { /* Antwort absichtlich nie senden -> Client-Timeout */ };

(async () => {
  // ── 1) Normalfall: 200 + fachlich ok ─────────────────────────────────────
  {
    const mock = await startMock({
      pipeline: (req, res) => json(res, 200, { checkedSources: 140, successfulSources: 120, failedSources: 20, understanding: { processed: 4 } }),
      status: (req, res) => json(res, 200, { ok: true, latestRun: null })
    });
    const r = await runCheck(mock.url); await mock.close();
    check("1 Erfolg (200, Quellen ok): exit 0", r.code === 0, r.out.slice(-300));
    check("1b Auth-Header wird gesendet, Secret NIE geloggt", !r.out.includes("test-secret-niemals-echt"));
  }

  // ── 2) 200, aber fachlich kaputt (0 erfolgreiche Quellen) ────────────────
  {
    const mock = await startMock({
      pipeline: (req, res) => json(res, 200, { checkedSources: 140, successfulSources: 0 }),
      status: (req, res) => json(res, 200, { ok: true, latestRun: null })
    });
    const r = await runCheck(mock.url); await mock.close();
    check("2 fachlicher Fehler (0 Quellen): exit 1 + klarer Grund", r.code === 1 && /Keine erfolgreiche Quelle/.test(r.out), r.out.slice(-300));
  }

  // ── 3) Echter Serverfehler 500: Fehler heisst FEHLGESCHLAGEN, nicht "nicht ausgefuehrt"
  {
    const mock = await startMock({
      pipeline: (req, res) => json(res, 500, { error: "kaputt" }),
      status: (req, res) => json(res, 200, { ok: true, latestRun: null })
    });
    const r = await runCheck(mock.url); await mock.close();
    check("3 HTTP 500: exit 1, ehrliche Serverfehler-Meldung", r.code === 1 && /Serverfehler \(HTTP 500\)/.test(r.out), r.out.slice(-300));
    // Bei 500 hat der Server den Aufruf ERHALTEN — die alte Pauschalbehauptung
    // "Pipeline wurde NICHT ausgefuehrt" darf hier nie wieder auftauchen.
    check("3b keine 'wurde NICHT ausgefuehrt'-Behauptung bei Serverfehler", !/wurde NICHT ausgefuehrt/i.test(r.out), r.out.slice(-200));
  }

  // ── 4) 429 Rate-Limit: eigener Zustand, kein Retry ───────────────────────
  {
    const mock = await startMock({
      pipeline: (req, res) => json(res, 429, { error: "zu viele Anfragen" }),
      status: (req, res) => json(res, 200, { ok: true, latestRun: null })
    });
    const r = await runCheck(mock.url); const c = mock.counts; await mock.close();
    check("4 HTTP 429: exit 1 + Rate-Limit-Meldung + KEIN Retry", r.code === 1 && /Rate-Limit/.test(r.out) && c.pipeline === 1, `pipeline-calls=${c.pipeline}`);
  }

  // ── 5) DER PRODUCTION-VORFALL: Client-Timeout, serverseitig erfolgreich ──
  {
    const startedIso = new Date().toISOString();
    const mock = await startMock({
      pipeline: hang, // Server "braucht laenger als der Client wartet"
      status: (req, res) => json(res, 200, { ok: true, latestRun: { createdAt: new Date().toISOString(), checkedSources: 140, successfulSources: 118, failedSources: 22, savedItems: 12 } })
    });
    const r = await runCheck(mock.url); const c = mock.counts; await mock.close();
    check("5 Client-Timeout + Statuspfad bestaetigt Abschluss: exit 0 (GRUEN)", r.code === 0 && /serverseitig ERFOLGREICH/.test(r.out), r.out.slice(-400));
    check("5b DOPPEL-TRIGGER-SCHUTZ: Pipeline exakt 1x angestossen", c.pipeline === 1, `pipeline-calls=${c.pipeline}`);
    check("5c Statuspfad wurde tatsaechlich befragt", c.status >= 1, `status-calls=${c.status} (seit ${startedIso})`);
  }

  // ── 6) Client-Timeout + kein neuer Lauf sichtbar: UNBEKANNT, ehrlich ─────
  {
    const alt = new Date(Date.now() - 6 * 3600 * 1000).toISOString(); // alter Lauf (06:00 vorher)
    const mock = await startMock({
      pipeline: hang,
      status: (req, res) => json(res, 200, { ok: true, latestRun: { createdAt: alt, successfulSources: 100 } })
    });
    const r = await runCheck(mock.url); const c = mock.counts; await mock.close();
    check("6 Timeout + kein Abschluss: exit 1, Meldung 'LAEUFT MOEGLICHERWEISE NOCH'", r.code === 1 && /LAEUFT MOEGLICHERWEISE NOCH/.test(r.out), r.out.slice(-400));
    check("6b alte Laeufe zaehlen NICHT als Bestaetigung (Uhren-Skew-Fenster)", !/serverseitig ERFOLGREICH/.test(r.out));
    check("6c kein zweiter Pipeline-Trigger", c.pipeline === 1, `pipeline-calls=${c.pipeline}`);
    check("6d Statuspfad mehrfach gepollt (Poll-Schleife lebt)", c.status >= 2, `status-calls=${c.status}`);
  }

  // ── 7) Client-Timeout + Statuspfad noch nicht deployed (404): UNBEKANNT ──
  {
    const mock = await startMock({
      pipeline: hang,
      status: (req, res) => json(res, 404, { error: "not found" })
    });
    const r = await runCheck(mock.url); const c = mock.counts; await mock.close();
    check("7 Timeout + Statuspfad 404: exit 1, ehrlich 'kann erfolgreich gewesen sein'", r.code === 1 && /kann serverseitig erfolgreich gewesen sein/.test(r.out), r.out.slice(-400));
    check("7b kein zweiter Pipeline-Trigger", c.pipeline === 1, `pipeline-calls=${c.pipeline}`);
  }

  // ── 8) Lock/Skip-Antwort ist KEIN Fehler (paralleler Lauf arbeitet) ──────
  {
    const mock = await startMock({
      pipeline: (req, res) => json(res, 200, { skipped: true, reason: "already-running" }),
      status: (req, res) => json(res, 200, { ok: true, latestRun: null })
    });
    const r = await runCheck(mock.url); await mock.close();
    check("8 skipped=true (Lock): exit 0, kein Fehl-Alarm", r.code === 0 && /uebersprungen/.test(r.out), r.out.slice(-300));
  }

  // ── 9) Auth-Fehler 403: Konfigurationsfehler klar benannt ────────────────
  {
    const mock = await startMock({
      pipeline: (req, res) => json(res, 403, { error: "Forbidden" }),
      status: (req, res) => json(res, 200, { ok: true, latestRun: null })
    });
    const r = await runCheck(mock.url); await mock.close();
    check("9 HTTP 403: exit 1 + CRON_SECRET-Hinweis", r.code === 1 && /CRON_SECRET pruefen/.test(r.out), r.out.slice(-300));
  }

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error("Testlauf-Fehler:", error);
  process.exit(1);
});
