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
function runCheck(baseUrl, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CHECK], {
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        CRON_SECRET: "test-secret-niemals-echt",
        WATCHDOG_CLIENT_TIMEOUT_MS: "1500",
        WATCHDOG_STATUS_POLL_ATTEMPTS: "3",
        WATCHDOG_STATUS_POLL_INTERVAL_MS: "150",
        WATCHDOG_CLOCK_SKEW_MS: "60000",
        ...extraEnv
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
  //     K7-integriert: die VORPRUEFUNG sieht zuerst einen VERALTETEN Lauf (deterministisch
  //     weit vor jedem Regel-Slot) => Ersatzlauf startet; nach dem Client-Timeout
  //     bestaetigt der Statuspfad den frischen Abschluss.
  {
    const startedIso = new Date().toISOString();
    const mock = await startMock({
      pipeline: hang, // Server "braucht laenger als der Client wartet"
      status: (req, res, counts) => json(res, 200, {
        ok: true,
        latestRun: counts.status === 1
          ? { createdAt: "2020-01-01T00:00:00.000Z", successfulSources: 100 } // Vorpruefung: veraltet
          : { createdAt: new Date().toISOString(), checkedSources: 140, successfulSources: 118, failedSources: 22, savedItems: 12 }
      })
    });
    const r = await runCheck(mock.url); const c = mock.counts; await mock.close();
    check("5 Vorpruefung 'veraltet' -> Trigger -> Timeout -> Statuspfad bestaetigt: exit 0 (GRUEN)",
      r.code === 0 && /VERALTET/.test(r.out) && /serverseitig ERFOLGREICH/.test(r.out), r.out.slice(-400));
    check("5b DOPPEL-TRIGGER-SCHUTZ: Pipeline exakt 1x angestossen", c.pipeline === 1, `pipeline-calls=${c.pipeline}`);
    check("5c Statuspfad wurde tatsaechlich befragt", c.status >= 2, `status-calls=${c.status} (seit ${startedIso})`);
  }

  // ── 6) Client-Timeout + kein neuer Lauf sichtbar: UNBEKANNT, ehrlich ─────
  {
    const uralt = "2020-01-01T00:00:00.000Z"; // deterministisch VOR jedem Regel-Slot
    const mock = await startMock({
      pipeline: hang,
      status: (req, res) => json(res, 200, { ok: true, latestRun: { createdAt: uralt, successfulSources: 100 } })
    });
    const r = await runCheck(mock.url); const c = mock.counts; await mock.close();
    check("6 Timeout + kein Abschluss: exit 1, Meldung 'LAEUFT MOEGLICHERWEISE NOCH'", r.code === 1 && /LAEUFT MOEGLICHERWEISE NOCH/.test(r.out), r.out.slice(-400));
    check("6b alte Laeufe zaehlen NICHT als Bestaetigung (Uhren-Skew-Fenster)", !/serverseitig ERFOLGREICH/.test(r.out));
    check("6c kein zweiter Pipeline-Trigger", c.pipeline === 1, `pipeline-calls=${c.pipeline}`);
    check("6d Statuspfad mehrfach gepollt (Poll-Schleife lebt)", c.status >= 2, `status-calls=${c.status}`);
  }

  // ── 7) K7: Statuspfad 404 VOR dem Trigger = LESEFEHLER -> fail closed, KEIN Ersatzlauf ──
  {
    const mock = await startMock({
      pipeline: hang,
      status: (req, res) => json(res, 404, { error: "not found" })
    });
    const r = await runCheck(mock.url); const c = mock.counts; await mock.close();
    check("7 Vorpruefung 404: exit 1, LESEFEHLER fail closed", r.code === 1 && /LESEFEHLER \(fail closed\)/.test(r.out), r.out.slice(-400));
    check("7b KEIN blinder schwerer Ersatzlauf auf unbekannter Faktenlage", c.pipeline === 0, `pipeline-calls=${c.pipeline}`);
  }

  // ── 7c) Der ALTE 404-Nachlauf-Pfad bleibt erreichbar (Betreiber-Force) ───
  {
    const mock = await startMock({
      pipeline: hang,
      status: (req, res) => json(res, 404, { error: "not found" })
    });
    const r = await runCheck(mock.url, { WATCHDOG_FORCE_RUN: "1" }); const c = mock.counts; await mock.close();
    check("7c FORCE: Timeout + Statuspfad 404: exit 1, ehrlich 'kann erfolgreich gewesen sein'",
      r.code === 1 && /kann serverseitig erfolgreich gewesen sein/.test(r.out), r.out.slice(-400));
    check("7d FORCE: kein zweiter Pipeline-Trigger", c.pipeline === 1, `pipeline-calls=${c.pipeline}`);
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

  // ── 10) K7: REGULAERER ERFOLG VORHANDEN -> KEIN Ersatzlauf, exit 0 ───────
  {
    const mock = await startMock({
      pipeline: (req, res) => json(res, 200, { successfulSources: 100 }),
      status: (req, res) => json(res, 200, {
        ok: true,
        latestRun: { createdAt: new Date().toISOString(), runId: "cron-crawl-x", successfulSources: 96, checkedSources: 140 }
      })
    });
    const r = await runCheck(mock.url); const c = mock.counts; await mock.close();
    check("10 Frischer regulaerer Erfolg: exit 0 OHNE schweren Ersatzlauf",
      r.code === 0 && /regulaerer Erfolg vorhanden/.test(r.out) && c.pipeline === 0,
      `pipeline-calls=${c.pipeline} · ${r.out.slice(-300)}`);
    check("10b Die Entscheidung ist protokolliert (Slot + letzter Lauf benannt)",
      /deckt den juengsten Regel-Slot/.test(r.out), r.out.slice(-300));
  }

  // ── 11) K7: frischer, aber UNBRAUCHBARER Lauf (0 Quellen) -> Ersatzlauf startet ──
  {
    const mock = await startMock({
      pipeline: (req, res) => json(res, 200, { checkedSources: 140, successfulSources: 120, understanding: { processed: 3 } }),
      status: (req, res) => json(res, 200, {
        ok: true,
        latestRun: { createdAt: new Date().toISOString(), successfulSources: 0, checkedSources: 140 }
      })
    });
    const r = await runCheck(mock.url); const c = mock.counts; await mock.close();
    check("11 Unbrauchbarer Erfolg (0 Quellen): Ersatzlauf startet und besteht",
      r.code === 0 && /UNBRAUCHBAR/.test(r.out) && c.pipeline === 1,
      `pipeline-calls=${c.pipeline} · ${r.out.slice(-300)}`);
  }

  // ── 11b) K7: frischer Lauf mit FATALEM Fehlerschritt -> unbrauchbar, Ersatzlauf startet ──
  {
    const mock = await startMock({
      pipeline: (req, res) => json(res, 200, { checkedSources: 140, successfulSources: 120, understanding: { processed: 3 } }),
      status: (req, res) => json(res, 200, {
        ok: true,
        latestRun: { createdAt: new Date().toISOString(), successfulSources: 181, checkedSources: 181, fatalerFehlerschritt: true }
      })
    });
    const r = await runCheck(mock.url); const c = mock.counts; await mock.close();
    check("11b Fataler Fehlerschritt trotz frischem Lauf + Quellen ok: Ersatzlauf startet",
      r.code === 0 && /UNBRAUCHBAR/.test(r.out) && /fatalem Fehlerschritt/.test(r.out) && c.pipeline === 1,
      `pipeline-calls=${c.pipeline} · ${r.out.slice(-300)}`);
  }

  // ── 12) K7: Lesefehler des Statuspfads (HTTP 500) -> fail closed, KEIN Ersatzlauf ──
  {
    const mock = await startMock({
      pipeline: (req, res) => json(res, 200, { successfulSources: 100 }),
      status: (req, res) => json(res, 500, { error: "kaputt" })
    });
    const r = await runCheck(mock.url); const c = mock.counts; await mock.close();
    check("12 Statuspfad 500: exit 1, LESEFEHLER fail closed, KEIN Ersatzlauf",
      r.code === 1 && /LESEFEHLER \(fail closed\)/.test(r.out) && c.pipeline === 0,
      `pipeline-calls=${c.pipeline} · ${r.out.slice(-300)}`);
  }

  // ── 13) K7: PARALLELER START — Vorpruefung 'veraltet', Server-Lock verweigert ──
  //     Der Ersatzlauf trifft auf einen bereits laufenden Lauf: skipped ist KEIN Fehler,
  //     KEIN weiterer Trigger (genau ein Anstoss, der Server schuetzt sich selbst).
  {
    const mock = await startMock({
      pipeline: (req, res) => json(res, 200, { skipped: true, reason: "already-running" }),
      status: (req, res) => json(res, 200, { ok: true, latestRun: { createdAt: "2020-01-01T00:00:00.000Z", successfulSources: 100 } })
    });
    const r = await runCheck(mock.url); const c = mock.counts; await mock.close();
    check("13 Paralleler Start: Vorpruefung veraltet -> genau 1 Trigger -> Lock-Skip ist kein Fehler (exit 0)",
      r.code === 0 && /uebersprungen/.test(r.out) && c.pipeline === 1,
      `pipeline-calls=${c.pipeline} · ${r.out.slice(-300)}`);
  }

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error("Testlauf-Fehler:", error);
  process.exit(1);
});
