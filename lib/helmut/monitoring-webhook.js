"use strict";

const kommunikationsriegel = require("./kommunikationsriegel");

// Zweiter Alarmkanal — gehärteter Monitoring-Webhook (Sprint 2026-07, F5-Vorbereitung).
// ============================================================================
// AKTIVIERUNG BLEIBT F5: ohne gesetzte HELMUT_MONITORING_WEBHOOK_URL ist dieses
// Modul ein reiner No-Op (sauber übersprungen) — es wird hier NICHTS aktiviert.
//
// Gegenüber dem bisherigen Einmal-POST ergänzt dieses Modul die vom Betrieb
// geforderten Eigenschaften:
//   1. STABILE EREIGNISKENNUNG (event_id) gegen doppelte Alarme: ein grüner
//      Tagesreport = ein Heartbeat-Ereignis pro Tag; ein Alarm = ein Ereignis je
//      (Tag + Zustand + Blocker) — eine erneute Zustellung desselben Ereignisses
//      (z. B. manuell nachgefeuerter Health-Report) wird übersprungen, ein
//      GEÄNDERTER Zustand erzeugt eine neue Kennung und wird zugestellt.
//   2. ZUSTELLSTATUS: jedes Zustellergebnis (eventId, versucht, gesendet, HTTP-
//      Status, Zeitpunkt) wird über injizierte load/save-Deps persistiert
//      (Auth-Store, nur technische Metadaten).
//   3. BEGRENZTE WIEDERHOLUNG: max. HELMUT_MONITORING_WEBHOOK_RETRY_MAX (Default 2)
//      Wiederholungen mit exponentiellem Backoff; 4xx (außer 429) wird NICHT
//      wiederholt (dauerhafter Fehler); harte Obergrenze, keine Endlosschleife.
//   4. META-HEARTBEAT: auch ein GRÜNER Report wird zugestellt (event_type
//      "heartbeat") — bleibt der tägliche Heartbeat beim Empfänger aus, ist der
//      Alarmweg selbst tot (die Gegenprüfung übernimmt der Empfänger/Watchdog).
//
// DATENSCHUTZ: Der Payload wird ausschließlich über buildAlarmPayload gebaut
// (Allowlist technischer Felder + Redaction) — keine Namen, Nutzerprofile,
// politischen Inhalte, Dokumenttitel, Briefingtexte, Secrets oder vollständigen
// URLs mit sensiblen Parametern. Der Umschlag ergänzt nur event_id/event_type/
// attempt/sent_at (technische Metadaten). KEINE DSGVO-Konformitätsbehauptung —
// die rechtliche Bewertung bleibt beim Betreiber.
//
// Fail-safe: Fehler hier brechen den Health-Cron NIE ab; fetch ist mit 8-s-Timeout
// gedeckelt. Alle Deps (fetch, Uhr, Sleep, State) injizierbar -> offline testbar
// mit lokalem Mock-Webhook.

const crypto = require("crypto");
const { buildAlarmPayload } = require("./alarm-payload");

function nonNegInt(raw, fallback) {
  const s = String(raw ?? "").trim();
  if (s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

// Stabile Ereigniskennung: grün -> ein Heartbeat je Tag; Alarm -> Hash über
// (Tag, Zustand, Schweregrad, Blocker, überfällige Crons, rollierender Status).
// Bewusst OHNE freien Text (der variiert je Lauf) — gleiche Störung = gleiche id.
function buildWebhookEventId(report = {}, nowMs = Date.now()) {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  if (report.ok === true) return `hb-${day}`;
  const basis = [
    String(report.state || ""),
    String(report.severity || ""),
    ...(Array.isArray(report.healthBlockers) ? report.healthBlockers.map(String) : []),
    ...(Array.isArray(report.overdueCrons) ? report.overdueCrons.map(String) : []),
    String(report.rollingCrawl && report.rollingCrawl.status || "")
  ].join("|");
  const hash = crypto.createHash("sha256").update(basis).digest("hex").slice(0, 12);
  return `al-${day}-${hash}`;
}

// Zustellung mit Ereigniskennung, Dedupe, begrenztem Retry und Statuspersistenz.
// deps: { env, fetch, now, sleep, loadState(), saveState(entry) } — alle optional.
async function deliverMonitoringWebhook(report, deps = {}) {
  const env = deps.env || process.env;
  // KOMMUNIKATIONSRIEGEL VOR DER ZIELPRUEFUNG: im scharfen Testfenster schweigt
  // auch der Betreiberkanal, unabhaengig davon ob eine URL gesetzt ist.
  const riegel = kommunikationsriegel.pruefe({
    kanal: "monitoring-webhook",
    ziel: String(env.HELMUT_MONITORING_WEBHOOK_URL || "")
  }, env);
  if (!riegel.erlaubt) {
    return { sent: false, skipped: true, gesperrt: true, reason: riegel.grund, riegel };
  }
  const targetUrl = String(env.HELMUT_MONITORING_WEBHOOK_URL || "").trim();
  // unconfigured unterscheidet "Kanal nicht eingerichtet" von anderen Skips
  // (z. B. duplicate-event) — der Health-Cron braucht diese Unterscheidung für
  // die "kein Alarmkanal konfiguriert"-Fehlermeldung.
  if (!targetUrl) return { sent: false, skipped: true, unconfigured: true, reason: "HELMUT_MONITORING_WEBHOOK_URL nicht gesetzt." };

  const fetchFn = deps.fetch || fetch;
  const now = deps.now || Date.now;
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const loadState = deps.loadState || (async () => null);
  const saveState = deps.saveState || (async () => {});
  const retryMax = nonNegInt(env.HELMUT_MONITORING_WEBHOOK_RETRY_MAX, 2);

  const eventId = buildWebhookEventId(report, now());
  const eventType = report.ok === true ? "heartbeat" : "alarm";

  // Dedupe: dasselbe Ereignis wurde bereits erfolgreich zugestellt -> nicht
  // erneut. Gedächtnis = LISTE der zuletzt zugestellten Ereigniskennungen
  // (Review-Fix): mit nur EINEM Merkplatz würde ein Flattern (Alarm ->
  // Heartbeat -> derselbe Alarm) jede Wiederholung erneut zustellen.
  let previous = null;
  try { previous = await loadState(); } catch { previous = null; }
  const deliveredIds = Array.isArray(previous && previous.recentEventIds)
    ? previous.recentEventIds.filter(Boolean).map(String)
    : (previous && previous.sent === true && previous.eventId ? [String(previous.eventId)] : []);
  if (deliveredIds.includes(eventId)) {
    return { sent: false, skipped: true, reason: "duplicate-event", eventId };
  }

  const basePayload = { ...buildAlarmPayload(report, env), event_id: eventId, event_type: eventType };
  let attempts = 0;
  let lastStatus = null;
  let lastReason = null;

  for (let attempt = 0; attempt <= retryMax; attempt += 1) {
    attempts += 1;
    try {
      const res = await fetchFn(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Timeout: „fail-safe" muss auch Hänger abdecken — ein hängender Webhook
        // darf den Health-Cron nie blockieren.
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ ...basePayload, attempt: attempts, sent_at: new Date(now()).toISOString() })
      });
      lastStatus = res.status;
      if (res.ok) {
        const delivery = {
          eventId, eventType, sent: true, status: res.status, attempts, at: new Date(now()).toISOString(),
          // Ereignis-Gedächtnis fortschreiben (Kappung: die ids tragen den Tag,
          // alte Einträge werden dadurch ohnehin nie wieder erzeugt).
          recentEventIds: [eventId, ...deliveredIds].slice(0, 20)
        };
        try { await saveState(delivery); } catch { /* Statuspersistenz ist best effort */ }
        return delivery;
      }
      // Dauerhafte Client-Fehler (4xx außer 429) nicht wiederholen.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
    } catch (error) {
      lastReason = error && error.message;
    }
    if (attempt < retryMax) await sleep(500 * Math.pow(2, attempt));
  }

  const delivery = {
    eventId, eventType, sent: false, status: lastStatus, reason: lastReason, attempts,
    at: new Date(now()).toISOString(),
    // fehlgeschlagene Zustellung: das Zustell-Gedächtnis bleibt unverändert
    // (das Ereignis darf beim nächsten Report erneut versucht werden).
    recentEventIds: deliveredIds
  };
  try { await saveState(delivery); } catch { /* best effort */ }
  return delivery;
}

module.exports = { buildWebhookEventId, deliverMonitoringWebhook };
