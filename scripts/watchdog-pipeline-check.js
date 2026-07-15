"use strict";

// Watchdog-Pipeline-Check (Fix des falschen Client-Timeout-Alarms 2026-07-15).
// =============================================================================
// BEFUND: Der GitHub-Actions-Watchdog rief /api/cron/pipeline mit
// `curl --max-time 120` auf. Die Production-Pipeline lief ~193 s und schloss
// serverseitig mit HTTP 200 erfolgreich ab — der Client brach aber bei 120 s ab
// (HTTP_CODE "000") und der Workflow behauptete faelschlich "Pipeline wurde
// NICHT ausgefuehrt". Vercel erlaubt bis maxDuration=300 s (vercel.json); der
// Endpoint begrenzt sich intern auf 280 s, damit er IMMER antwortet.
//
// DIESES SKRIPT ersetzt die Inline-Bash-Logik des Workflows, damit sie lokal
// reproduzierbar testbar ist (scripts/watchdog-pipeline-check-test.js). Es
// unterscheidet VIER Endzustaende ehrlich:
//
//   1. SUCCESS                — HTTP 200 + fachlich ok (watchdog-eval)  -> exit 0
//   2. SUCCESS_AFTER_TIMEOUT  — Client-Timeout, aber der rein lesende
//      Statuspfad /api/cron/pipeline-status zeigt einen NACH Start dieses
//      Checks abgeschlossenen Lauf                                      -> exit 0
//   3. FAILED                 — echter Server-/Fachfehler (5xx, 429,
//      Auth, ok:false, 0 erfolgreiche Quellen)                          -> exit 1
//   4. UNKNOWN_OR_RUNNING     — Client-Timeout und kein bestaetigter
//      Abschluss sichtbar (Lauf laeuft evtl. noch)                      -> exit 1,
//      aber mit EHRLICHER Meldung (nie wieder "wurde nicht ausgefuehrt")
//
// SICHERHEITSREGELN:
//   - Die Pipeline wird GENAU EINMAL angestossen — nie ein automatischer
//     Zweit-Trigger, auch nicht nach Timeout (der erste Lauf koennte noch
//     laufen; ein Doppel-Lauf wuerde Last/Kosten verdoppeln).
//   - Der Statuspfad ist rein lesend (0 Writes, 0 KI) und mit demselben
//     CRON_SECRET autorisiert; existiert er noch nicht (404, Deploy-Stand vor
//     diesem Fix), wird das als "unbekannt" gemeldet — nicht als Pipeline-Fehler.
//   - Es werden NIE Secrets geloggt (nur Statuscodes + gekappte Antwort-Bodies;
//     die Pipeline-Antwort enthaelt keine Secrets).
//
// Konfiguration (Env; Defaults fuer Production-Watchdog):
//   BASE_URL                          Ziel-Deployment (Pflicht)
//   CRON_SECRET                       Cron-Secret (Pflicht)
//   WATCHDOG_CLIENT_TIMEOUT_MS        Default 330000 (330 s > Vercel-Max 300 s:
//                                     der Server antwortet IMMER vorher; ein
//                                     Timeout hier bedeutet Netz-/Infrastrukturproblem)
//   WATCHDOG_STATUS_POLL_ATTEMPTS     Default 6
//   WATCHDOG_STATUS_POLL_INTERVAL_MS  Default 30000
//   WATCHDOG_CLOCK_SKEW_MS            Default 60000 (Toleranz Runner- vs. Server-Uhr)

const { evaluatePipelineResponse } = require("./watchdog-eval");

const CLIENT_TIMEOUT_MS = envInt("WATCHDOG_CLIENT_TIMEOUT_MS", 330000);
const POLL_ATTEMPTS = envInt("WATCHDOG_STATUS_POLL_ATTEMPTS", 6);
const POLL_INTERVAL_MS = envInt("WATCHDOG_STATUS_POLL_INTERVAL_MS", 30000);
const CLOCK_SKEW_MS = envInt("WATCHDOG_CLOCK_SKEW_MS", 60000);

function envInt(name, fallback) {
  const n = Number(String(process.env[name] ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function log(line) { console.log(line); }
function notice(msg) { console.log(`::notice::${msg}`); }
function fail(msg) { console.error(`::error::${msg}`); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, { headers, timeoutMs }) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { /* Nicht-JSON bleibt sichtbar via textSnippet */ }
  return { status: res.status, data, textSnippet: text.slice(0, 1200) };
}

// Klassifiziert einen Nicht-200-Status EHRLICH (Fehlerart statt Pauschalurteil).
function describeHttpFailure(status) {
  if (status === 401 || status === 403) return `Autorisierung fehlgeschlagen (HTTP ${status}) — CRON_SECRET pruefen. Die Pipeline wurde NICHT gestartet.`;
  if (status === 429) return `Rate-Limit (HTTP 429) — der Server hat den Aufruf abgewiesen. Die Pipeline wurde NICHT gestartet. KEIN automatischer Retry (naechster Cron-Lauf uebernimmt).`;
  if (status === 503) return `Dienst nicht verfuegbar (HTTP 503) — Endpoint deaktiviert oder Deployment nicht bereit.`;
  if (status >= 500) return `Serverfehler (HTTP ${status}) — die Pipeline ist serverseitig FEHLGESCHLAGEN oder der Server ist gestoert.`;
  return `Unerwarteter HTTP-Status ${status}.`;
}

// Prueft nach einem Client-Timeout ueber den rein lesenden Statuspfad, ob der
// Lauf serverseitig abgeschlossen wurde. Loest die Pipeline NIE erneut aus.
async function confirmViaStatusPath(baseUrl, headers, startedAtMs) {
  const statusUrl = `${baseUrl}/api/cron/pipeline-status`;
  let sawStatusPath = false;
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await sleep(POLL_INTERVAL_MS);
    let res;
    try {
      res = await fetchJson(statusUrl, { headers, timeoutMs: 30000 });
    } catch (error) {
      log(`Statuspfad-Versuch ${attempt}/${POLL_ATTEMPTS}: Netzfehler (${error && error.name}) — weiter.`);
      continue;
    }
    if (res.status === 404) {
      // Deploy-Stand VOR diesem Fix: Statuspfad existiert noch nicht.
      return { confirmed: false, statusPathMissing: true };
    }
    if (res.status !== 200 || !res.data) {
      log(`Statuspfad-Versuch ${attempt}/${POLL_ATTEMPTS}: HTTP ${res.status} — weiter.`);
      continue;
    }
    sawStatusPath = true;
    const latest = res.data.latestRun || null;
    const createdMs = latest && latest.createdAt ? Date.parse(latest.createdAt) : NaN;
    log(`Statuspfad-Versuch ${attempt}/${POLL_ATTEMPTS}: letzter Lauf ${latest && latest.createdAt ? latest.createdAt : "(keiner)"}.`);
    if (Number.isFinite(createdMs) && createdMs >= startedAtMs - CLOCK_SKEW_MS) {
      return { confirmed: true, latest };
    }
  }
  return { confirmed: false, statusPathMissing: !sawStatusPath ? null : false };
}

async function main() {
  const baseUrl = String(process.env.BASE_URL || "").replace(/\/+$/, "");
  const secret = String(process.env.CRON_SECRET || "");
  if (!baseUrl) { fail("BASE_URL ist nicht gesetzt."); return 1; }
  if (!secret) { fail("CRON_SECRET ist nicht gesetzt."); return 1; }
  const headers = { Authorization: `Bearer ${secret}` };

  const startedAtMs = Date.now();
  log(`Rufe Pipeline auf: ${baseUrl}/api/cron/pipeline (Client-Timeout ${Math.round(CLIENT_TIMEOUT_MS / 1000)} s; Vercel-Serverdeckel 300 s)`);

  let res = null;
  let clientTimeout = false;
  try {
    res = await fetchJson(`${baseUrl}/api/cron/pipeline`, { headers, timeoutMs: CLIENT_TIMEOUT_MS });
  } catch (error) {
    // AbortSignal.timeout -> TimeoutError; alles andere = Netz-/DNS-Fehler.
    clientTimeout = true;
    const kind = error && (error.name === "TimeoutError" || error.name === "AbortError") ? "Client-Timeout" : `Netzfehler (${error && error.name}: ${String(error && error.message).slice(0, 200)})`;
    log(`Pipeline-Aufruf ohne Antwort beendet: ${kind} nach ${Math.round((Date.now() - startedAtMs) / 1000)} s.`);
  }

  if (!clientTimeout && res) {
    log(`HTTP-Status: ${res.status}`);
    log(`--- Antwort (gekuerzt) ---`);
    log(res.textSnippet);
    if (res.status === 200) {
      const verdict = evaluatePipelineResponse(res.data);
      if (verdict.ok) { notice(`Watchdog OK — ${verdict.reason}`); return 0; }
      fail(`Watchdog FEHLER — ${verdict.reason}`);
      return 1;
    }
    fail(`Watchdog FEHLER — ${describeHttpFailure(res.status)}`);
    return 1;
  }

  // Client-Timeout/Netzabbruch: NICHT behaupten, die Pipeline sei nicht gelaufen.
  // Der Server arbeitet nach einem Client-Abbruch weiter (Vercel bricht die
  // Function nicht ab) — jetzt den Abschluss ueber den Statuspfad verifizieren.
  log(`Pruefe serverseitigen Abschluss ueber den rein lesenden Statuspfad (${POLL_ATTEMPTS} Versuche, alle ${Math.round(POLL_INTERVAL_MS / 1000)} s) — KEIN zweiter Pipeline-Trigger.`);
  const confirm = await confirmViaStatusPath(baseUrl, headers, startedAtMs);
  if (confirm.confirmed) {
    const r = confirm.latest || {};
    const okSources = r.successfulSources == null || Number(r.successfulSources) > 0;
    if (okSources) {
      notice(`Watchdog OK — Client-Timeout, aber der Lauf wurde serverseitig ERFOLGREICH abgeschlossen (createdAt=${r.createdAt}, successfulSources=${r.successfulSources ?? "?"}, checkedSources=${r.checkedSources ?? "?"}).`);
      return 0;
    }
    fail(`Watchdog FEHLER — Lauf serverseitig abgeschlossen, aber ohne erfolgreiche Quelle (successfulSources=${r.successfulSources}).`);
    return 1;
  }
  if (confirm.statusPathMissing) {
    fail(`Watchdog UNBEKANNT — Client-Timeout nach ${Math.round(CLIENT_TIMEOUT_MS / 1000)} s UND der Statuspfad /api/cron/pipeline-status ist auf diesem Deployment noch nicht verfuegbar (404). Der Lauf kann serverseitig erfolgreich gewesen sein — bitte Vercel-Logs pruefen. Es wurde bewusst KEIN zweiter Lauf ausgeloest.`);
    return 1;
  }
  fail(`Watchdog UNBEKANNT — Client-Timeout und innerhalb des Poll-Fensters kein abgeschlossener Lauf sichtbar. Der Lauf LAEUFT MOEGLICHERWEISE NOCH oder ist abgebrochen — bitte Vercel-Logs pruefen. Es wurde bewusst KEIN zweiter Lauf ausgeloest (Doppel-Lauf-Schutz).`);
  return 1;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (error) => { fail(`Watchdog-Skriptfehler: ${error && error.message}`); process.exit(1); }
  );
}

module.exports = { main, confirmViaStatusPath, describeHttpFailure };
