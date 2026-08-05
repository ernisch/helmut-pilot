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

const fs = require("fs");
const path = require("path");
const { evaluatePipelineResponse } = require("./watchdog-eval");
// K7: Slot-Rechnung mit den PUREN Vertragsfunktionen des OP-25-Kerns (kein IO dort) —
// Watchdog und Nachweis rechnen die Regel-Slots damit identisch.
const vertrag = require("../lib/helmut/op25-nachweis");

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

// --- K7 (OP-25, Ursachenanalyse §7.7.6 Befund 3): BEDINGTER Ersatzlauf -------------------
// Der Watchdog feuerte bisher BEDINGUNGSLOS die volle Pipeline (ein planmaessiger vierter
// schwerer Lauf pro Tag, der Laufbelege aus der Retention verdraengte). Jetzt prueft er
// VOR dem Trigger rein lesend, ob der regulaere Erfolg, den er absichern soll, bereits
// vorhanden und gueltig ist:
//   * Referenz ist der JUENGSTE regulaere schwere Slot (vercel.json, crawl/pipeline) vor
//     jetzt — beim planmaessigen 05:30-UTC-Lauf also der 04:00-Crawl, bei GitHub-Verzug
//     entsprechend spaeter.
//   * VORHANDEN + brauchbar (Lauf nach dem Slot abgeschlossen, nicht 0 erfolgreiche
//     Quellen) -> der Watchdog endet ERFOLGREICH ohne Ersatzlauf (Exit 0).
//   * FEHLT / VERALTET / UNBRAUCHBAR -> der Ersatzlauf startet (bisheriges Verhalten).
//   * LESEFEHLER (Netz, Auth, 404, unlesbare Antwort, keine Kadenz) -> FAIL CLOSED:
//     KEIN blinder schwerer Ersatzlauf, Exit 1 mit ehrlicher Meldung (E-Mail an den
//     Betreiber) — ein Ersatzlauf auf unbekannter Faktenlage koennte einen laufenden
//     Lauf doppeln und verdraengt sicher Laufbelege.
// Der aeussere Zeitplan (05:30 UTC, briefing-watchdog.yml) bleibt UNVERAENDERT.
// WATCHDOG_FORCE_RUN=1 (manueller workflow_dispatch) ueberspringt die Vorpruefung bewusst.

function juengsterRegelSlotMs(nowMs) {
  const datei = path.join(__dirname, "..", "vercel.json");
  const crons = JSON.parse(fs.readFileSync(datei, "utf8")).crons;
  const kadenz = vertrag.schwereKadenz(Array.isArray(crons) ? crons : []);
  if (!kadenz.length || kadenz.some((k) => !k.plan)) return null;
  // Slots der letzten 48 h bis jetzt: der juengste vergangene ist die Referenz.
  const slots = vertrag.erwarteteLaeufe({ vonMs: nowMs - 48 * 3600 * 1000, bisMs: nowMs, crons });
  if (!slots || !slots.length) return null;
  return slots[slots.length - 1].geplantMs;
}

async function pruefeRegulaerenErfolg(baseUrl, headers, nowMs, { fetchJsonFn = fetchJson, slotFn = juengsterRegelSlotMs } = {}) {
  let slotMs;
  try {
    slotMs = slotFn(nowMs);
  } catch (error) {
    return { ausgang: "lesefehler", grund: `vercel.json nicht lesbar (${error && error.message})` };
  }
  if (slotMs == null) return { ausgang: "lesefehler", grund: "Regel-Kadenz aus vercel.json nicht ermittelbar" };
  let res;
  try {
    res = await fetchJsonFn(`${baseUrl}/api/cron/pipeline-status`, { headers, timeoutMs: 30000 });
  } catch (error) {
    return { ausgang: "lesefehler", grund: `Statuspfad nicht erreichbar (${error && error.name}: ${String(error && error.message).slice(0, 120)})` };
  }
  if (res.status !== 200 || !res.data || res.data.ok !== true) {
    return { ausgang: "lesefehler", grund: `Statuspfad HTTP ${res.status} — Zustand nicht belegbar` };
  }
  const latest = res.data.latestRun || null;
  if (!latest || !latest.createdAt) {
    return { ausgang: "fehlt", grund: "kein abgeschlossener Lauf sichtbar", slotMs };
  }
  const createdMs = Date.parse(latest.createdAt);
  if (!Number.isFinite(createdMs)) {
    return { ausgang: "lesefehler", grund: `createdAt des letzten Laufs nicht lesbar (${latest.createdAt})` };
  }
  if (createdMs < slotMs - CLOCK_SKEW_MS) {
    return {
      ausgang: "veraltet", slotMs, latest,
      grund: `letzter Lauf ${latest.createdAt} liegt VOR dem juengsten Regel-Slot ${new Date(slotMs).toISOString()}`
    };
  }
  const successful = Number(latest.successfulSources);
  if (Number.isFinite(successful) && successful <= 0) {
    return {
      ausgang: "unbrauchbar", slotMs, latest,
      grund: `letzter Lauf ${latest.createdAt} ohne erfolgreiche Quelle (successfulSources=${latest.successfulSources})`
    };
  }
  // Ein Lauf mit FATALEM Fehlerschritt (kontextvertrag/erfassung/sperre) hat KEINE
  // Mandatsprojektion erzeugt — frisches createdAt und erfolgreiche Quellen taeuschen
  // dann einen brauchbaren Erfolg nur vor. Aeltere Deployments liefern das Feld nicht
  // (undefined) — dann gilt weiter die bisherige Bewertung (kein Fail-closed auf Altstand).
  if (latest.fatalerFehlerschritt === true) {
    return {
      ausgang: "unbrauchbar", slotMs, latest,
      grund: `letzter Lauf ${latest.createdAt} endete mit fatalem Fehlerschritt — kein brauchbarer regulaerer Erfolg`
    };
  }
  return {
    ausgang: "vorhanden", slotMs, latest,
    grund: `letzter Lauf ${latest.createdAt} (runId=${latest.runId || "?"}, successfulSources=${latest.successfulSources ?? "?"})`
      + ` deckt den juengsten Regel-Slot ${new Date(slotMs).toISOString()}`
  };
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

  // K7: VORPRUEFUNG — nur bei fehlendem/veraltetem/unbrauchbarem regulaerem Erfolg
  // startet der schwere Ersatzlauf. Die Entscheidung wird IMMER protokolliert.
  if (String(process.env.WATCHDOG_FORCE_RUN || "") === "1") {
    log("Vorpruefung UEBERSPRUNGEN (WATCHDOG_FORCE_RUN=1, manueller Betreiberlauf) — Ersatzlauf startet.");
  } else {
    const vorpruefung = await pruefeRegulaerenErfolg(baseUrl, headers, startedAtMs);
    if (vorpruefung.ausgang === "vorhanden") {
      notice(`Watchdog OK — regulaerer Erfolg vorhanden, KEIN Ersatzlauf gestartet: ${vorpruefung.grund}.`);
      return 0;
    }
    if (vorpruefung.ausgang === "lesefehler") {
      fail(`Watchdog LESEFEHLER (fail closed) — ${vorpruefung.grund}. Es wurde bewusst KEIN schwerer`
        + " Ersatzlauf gestartet: auf unbekannter Faktenlage koennte er einen laufenden Lauf doppeln."
        + " Bitte Statuspfad/Deployment pruefen.");
      return 1;
    }
    log(`Vorpruefung: regulaerer Erfolg ${vorpruefung.ausgang.toUpperCase()} (${vorpruefung.grund}) — Ersatzlauf startet.`);
  }

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

module.exports = { main, confirmViaStatusPath, describeHttpFailure, pruefeRegulaerenErfolg, juengsterRegelSlotMs };
