"use strict";

// P1-7 — Alarm-Payload-Bauer (Datenschutz-Leitplanke für externe Alarmkanäle).
// ============================================================================
// Verbindlich (Abnahmekriterien #3/#10): CallMeBot, Webhooks und GitHub-Benach-
// richtigungen dürfen AUSSCHLIESSLICH technischen Systemstatus erhalten — NIE
// Nutzerinhalte, Briefingtexte, politische Profile, Dokumentinhalte oder Secrets.
//
// Dieser Bauer erzwingt das doppelt:
//   (1) ALLOWLIST: nur technische Skalar-/Zählfelder werden übernommen.
//   (2) REDACTION: der freie Statustext läuft zusätzlich durch redactSensitive
//       (entfernt Secrets/E-Mail/Telefon/Tokens, falls je eines in eine Statuszeile
//       geriete). Doppelter Boden.

const { redactSensitive } = require("./redact");

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
// Kappen OHNE ein Zeichen zu zerschneiden. Der Statustext traegt Emojis (⏰ 🧮 👤 📲);
// ein Schnitt mitten in einem Ersatzzeichenpaar hinterlaesst ein ALLEINSTEHENDES
// Surrogat. `encodeURIComponent` wirft darauf `URIError: URI malformed` — im
// CallMeBot-Versand ausserhalb jedes try/catch, wodurch der GESAMTE Gesundheitslauf
// mit 500 abbrach. Belegt im Routentest bei fuenf Mandaten (Abnahme 26.08.).
function kappeSicher(text, max) {
  const roh = String(text);
  if (!(max > 0) || roh.length <= max) return roh;
  const teil = roh.slice(0, max);
  const letzter = teil.charCodeAt(teil.length - 1);
  // Hohe Ersatzzeichen (D800–DBFF) ohne Partner: das halbe Zeichen faellt weg.
  return (letzter >= 0xd800 && letzter <= 0xdbff) ? teil.slice(0, -1) : teil;
}
const str = (v, max) => (v == null ? null : kappeSicher(v, max));

// Baut den technischen Alarm-Payload aus einem Health-Report. Der zurückgegebene
// Payload ist bewusst KLEIN und enthält ausschließlich Betriebs-Metadaten.
function buildAlarmPayload(report = {}, env = process.env) {
  const budget = report.budget && typeof report.budget === "object" ? report.budget : null;
  return {
    source: "helmut-health-report",
    // Der Statustext wird redigiert (doppelter Boden gegen versehentliche Inhalte).
    text: redactSensitive(str(report.text, 2000) || "", env),
    ok: report.ok === true,
    state: str(report.state, 40),
    severity: str(report.severity, 24),
    overdueCrons: Array.isArray(report.overdueCrons) ? report.overdueCrons.map((c) => str(c, 40)) : [],
    googleUrlResolutionRate: num(report.googleUrlResolutionRate),
    // P1-6-Achsen als reine Zähler (keine Inhalte):
    budget: budget ? { calls: num(budget.calls), limit: num(budget.limit), remaining: num(budget.remaining), skips: num(budget.skips), exhausted: budget.exhausted === true } : null,
    healthBlockers: Array.isArray(report.healthBlockers) ? report.healthBlockers.map((b) => str(b, 40)) : [],
    healthWarnings: Array.isArray(report.healthWarnings) ? report.healthWarnings.map((w) => str(w, 40)) : [],
    errors24: num(report.errors24),
    // Härtungs-Sprint: rollierende Crawl-Betrachtung — ausschließlich Zustands-
    // Slugs und Zähler (kein Freitext, keine Quellen-/Dokumentbezüge).
    rollingCrawl: report.rollingCrawl && typeof report.rollingCrawl === "object"
      ? {
          status: str(report.rollingCrawl.status, 40),
          alertLevel: str(report.rollingCrawl.alertLevel, 16),
          latestState: str(report.rollingCrawl.latestState, 32),
          windowRuns: num(report.rollingCrawl.windowRuns),
          degradedRuns: num(report.rollingCrawl.degradedRuns),
          stronglyDegradedRuns: num(report.rollingCrawl.stronglyDegradedRuns),
          recovered: report.rollingCrawl.recovered === true,
          worstState: str(report.rollingCrawl.worstRun && report.rollingCrawl.worstRun.state, 32),
          worstFailedSources: num(report.rollingCrawl.worstRun && report.rollingCrawl.worstRun.failedSources),
          worstCheckedSources: num(report.rollingCrawl.worstRun && report.rollingCrawl.worstRun.checkedSources)
        }
      : null
  };
}

// Redigierter, gekappter Text für Text-only-Kanäle (CallMeBot/WhatsApp).
function buildAlarmText(report = {}, env = process.env) {
  return redactSensitive(str(report.text, 2000) || "", env);
}

module.exports = { buildAlarmPayload, buildAlarmText, kappeSicher };
