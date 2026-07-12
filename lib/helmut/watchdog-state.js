"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// Watchdog-Zustandsmodell (P1-4 / P1-5, audit/watchdog.md §4).
//
// Leitidee: NIE einen roten Gesamtausfall aus einem einzelnen (womöglich toten)
// Marker ableiten. Der Betriebszustand entsteht aus ZWEI orthogonalen Achsen
// aus LEBENDEN Signalen:
//   • INGEST  — kommen Rohdaten/Verständnis rein?  (Crawl-Frische, Raw-Docs 24h)
//   • OUTPUT  — entsteht ein nutzbares Briefing?    (available + jüngstes
//               complete-KO, NICHT die Build-Zeit `generatedAt`)
//
// Damit werden die zwei Audit-Kernfehler geschlossen:
//   1. Toter `pipelineDebugReports`-Marker als Hauptsignal  → hier gar nicht
//      mehr verwendet; "Pipeline durchgelaufen" = `crawlRuns[0].createdAt` (lebt).
//   2. `generatedAt = now` machte Briefing-Frische blind (false-green) → hier
//      wird OUTPUT-Frische am jüngsten complete-Knowledge-Object gemessen.
//
// Rein funktional, KEIN I/O → vollständig unit-testbar (scripts/watchdog-state-test.js).
// ═══════════════════════════════════════════════════════════════════════════

const STATES = {
  GESUND: "Gesund",
  RUHELAGE: "Ruhelage",
  TEILWEISE: "Teilweise gestört",
  VERALTET: "Veraltet",
  KRITISCH: "Kritisch",
  ERHOLT: "Erholt"
};

// Schwellen aus den vorhandenen server.js-Konstanten abgeleitet (14h/4h) und um
// die neue OUTPUT-Achse (24h/36h) ergänzt. Überschreibbar (Tests / ENV-Tuning).
const DEFAULT_THRESHOLDS = {
  crawlFreshMs: 14 * 3600e3, // <14h frisch
  crawlWarnMs: 28 * 3600e3, // 14–28h Warnung, >28h/nie kritisch
  outputFreshMs: 24 * 3600e3, // jüngstes complete-KO <24h frisch
  outputWarnMs: 36 * 3600e3, // 24–36h Warnung, >36h trotz Crawl = VERALTET
  lageFreshMs: 4 * 3600e3,
  lageWarnMs: 28 * 3600e3,
  minCheckedSources: 450,
  minSuccessfulSources: 405,
  maxFailureRatio: 0.1,
  errorSpike: 15
};

const num = (v) => {
  if (v === null || v === undefined || v === "") return null; // Number(null)===0 → hier abfangen
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Achsen-Bewertung: 'fresh' | 'warn' | 'dead'
function ingestAxis(ingest, t) {
  const ageMs = num(ingest?.crawlAgeMs);
  const checked = Number(ingest?.checkedSources || 0);
  const successful = Number(ingest?.successfulSources || 0);
  const ratio = Number.isFinite(Number(ingest?.failureRatio)) ? Number(ingest.failureRatio) : 1;
  const noCrawl = ageMs == null;
  const qualityOk = checked >= t.minCheckedSources && successful >= t.minSuccessfulSources && ratio <= t.maxFailureRatio;
  if (noCrawl || ageMs >= t.crawlWarnMs) return "dead";
  if (ageMs < t.crawlFreshMs && qualityOk) return "fresh";
  return "warn"; // 14–28h ODER frisch-aber-Qualität-schwach
}

function outputAxis(output, t) {
  const available = Boolean(output?.available);
  const ageMs = num(output?.newestCompleteKoAgeMs);
  if (!available) return "dead"; // kein nutzbares Briefing
  if (ageMs == null || ageMs >= t.outputWarnMs) return "dead"; // Understanding steht (>36h)
  if (ageMs < t.outputFreshMs) return "fresh";
  return "warn"; // 24–36h
}

function lageAxis(lageAgeMs, t) {
  const ageMs = num(lageAgeMs);
  if (ageMs == null) return "unknown";
  if (ageMs < t.lageFreshMs) return "fresh";
  if (ageMs < t.lageWarnMs) return "warn";
  return "dead";
}

// Rohzustand ohne Recovery-Overlay.
function rawState({ ingestS, outputS, lageS, storageOk, reactCount, situationalCount }) {
  if (!storageOk) return STATES.KRITISCH;
  if (ingestS === "dead" && outputS === "dead") return STATES.KRITISCH;
  if (ingestS === "dead") return STATES.KRITISCH; // kein Crawl >28h/nie → kein aktueller Stand
  // INGEST lebt (fresh/warn) ab hier:
  if (outputS === "dead") return STATES.VERALTET; // crawlt weiter, aber kein Briefing → stiller Ausfall
  // Genau eine Achse degradiert (warn) → teilweise gestört:
  if (ingestS === "warn" || outputS === "warn" || lageS === "dead" || lageS === "warn") return STATES.TEILWEISE;
  // Beide Achsen frisch:
  const react = Number(reactCount || 0);
  const situational = Number(situationalCount || 0);
  if (react === 0 && situational >= 0) return STATES.RUHELAGE; // gesund, aber keine akute Reaktion nötig
  return STATES.GESUND;
}

const GOOD = new Set([STATES.GESUND, STATES.RUHELAGE, STATES.ERHOLT]);
const BAD = new Set([STATES.VERALTET, STATES.KRITISCH]);

// Recovery-Hysterese: nach VERALTET/KRITISCH nicht sofort auf Grün springen,
// sondern erst ERHOLT (ein stabilisierender Zyklus), dann GESUND.
function applyRecovery(raw, previousState) {
  if (raw === STATES.GESUND || raw === STATES.RUHELAGE) {
    if (BAD.has(previousState)) return STATES.ERHOLT;
  }
  return raw;
}

// Menschliche Erklärung je Zustand: Was funktioniert / Was nicht / Wer betroffen /
// Was tun. Basiert auf den konkreten Signalen (keine erfundenen Aussagen).
function explain(state, ctx) {
  const { ingestS, outputS, lageS, storageOk, errors24, t } = ctx;
  const working = [];
  const notWorking = [];

  if (storageOk) working.push("Datenspeicher (Supabase) aktiv");
  else notWorking.push("Datenspeicher (Supabase) NICHT aktiv");

  if (ingestS === "fresh") working.push("Datenzufuhr läuft (Crawl frisch, genug Quellen)");
  else if (ingestS === "warn") notWorking.push("Datenzufuhr verzögert oder Quellenbasis dünn");
  else notWorking.push("Datenzufuhr steht (kein frischer Crawl > 28h / nie)");

  if (outputS === "fresh") working.push("Briefing/Verständnis wird aktuell erzeugt");
  else if (outputS === "warn") notWorking.push("Briefing/Verständnis leicht veraltet (24–36h)");
  else notWorking.push("Briefing/Verständnis steht (kein neues verstandenes Thema > 36h oder leer)");

  if (lageS === "fresh") working.push("Lage-Check frisch");
  else if (lageS === "warn" || lageS === "dead") notWorking.push("Lage-Check veraltet");

  if (num(errors24) != null && errors24 > t.errorSpike) notWorking.push(`Fehler-Spike: ${errors24} Systemfehler (24h)`);

  const affectedUsers = {
    [STATES.GESUND]: "Niemand — aktueller Stand für alle.",
    [STATES.RUHELAGE]: "Niemand — heute keine Reaktion nötig.",
    [STATES.ERHOLT]: "Niemand mehr — Betrieb wieder aktuell.",
    [STATES.TEILWEISE]: "Ein Teilbereich verzögert; App bleibt nutzbar.",
    [STATES.VERALTET]: "Alle — es kommt kein neuer Tagesstand mehr durch (Verständnis hängt).",
    [STATES.KRITISCH]: "Alle — kein aktueller Stand verfügbar."
  }[state] || "—";

  const action = {
    [STATES.GESUND]: "Keine.",
    [STATES.RUHELAGE]: "Keine — stabile Lage ohne neue Handlungspflicht.",
    [STATES.ERHOLT]: "Keine — Alarm auflösen, weiter beobachten.",
    [STATES.TEILWEISE]: "Beobachten. Crawl-Route bzw. Lage-Check im Blick behalten.",
    [STATES.VERALTET]: "Understanding-Lock / KI-Budget / OpenAI prüfen — Crawl läuft, aber es entsteht kein Briefing.",
    [STATES.KRITISCH]: storageOk ? "Pipeline/Cron/Crawl-Route prüfen." : "Supabase-Konfiguration prüfen (Speicher inaktiv)."
  }[state] || "Prüfen.";

  return { working, notWorking, affectedUsers, action };
}

// Haupteinstieg: klassifiziert den Betriebszustand aus den Live-Signalen.
// signals = {
//   storageOk: boolean,
//   ingest: { crawlAgeMs, checkedSources, successfulSources, failureRatio, rawItems24h },
//   output: { available, newestCompleteKoAgeMs, reactCount, situationalCount },
//   lageAgeMs, errors24, previousState
// }
function classifyOperationalState(signals = {}, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const ingestS = ingestAxis(signals.ingest, t);
  const outputS = outputAxis(signals.output, t);
  const lageS = lageAxis(signals.lageAgeMs, t);
  const storageOk = Boolean(signals.storageOk);
  const reactCount = signals.output?.reactCount;
  const situationalCount = signals.output?.situationalCount;

  const raw = rawState({ ingestS, outputS, lageS, storageOk, reactCount, situationalCount });
  const state = applyRecovery(raw, signals.previousState);

  const severity = BAD.has(state) ? "alarm" : state === STATES.TEILWEISE ? "watch" : "ok";
  const emoji = severity === "alarm" ? "⚠️" : severity === "watch" ? "🟡" : state === STATES.ERHOLT ? "🔄" : "✅";
  const { working, notWorking, affectedUsers, action } = explain(state, { ingestS, outputS, lageS, storageOk, errors24: signals.errors24, t });

  return {
    state,
    rawState: raw,
    label: state,
    severity, // 'ok' | 'watch' | 'alarm'
    emoji,
    ok: severity !== "alarm", // false NUR bei VERALTET/KRITISCH → löst Alarm aus
    axes: { ingest: ingestS, output: outputS, lage: lageS },
    working,
    notWorking,
    affectedUsers,
    action
  };
}

// Kompakte, menschenlesbare Zusammenfassung (WhatsApp/Log). Erklärt IMMER:
// Was funktioniert · Was nicht · Wer betroffen · Was tun.
function describeState(result) {
  const lines = [`${result.emoji} Helmut: ${result.label}.`];
  if (result.working.length) lines.push(`Funktioniert: ${result.working.join("; ")}.`);
  if (result.notWorking.length) lines.push(`Gestört: ${result.notWorking.join("; ")}.`);
  lines.push(`Betroffen: ${result.affectedUsers}`);
  lines.push(`Zu tun: ${result.action}`);
  return lines.join("\n");
}

module.exports = {
  STATES,
  DEFAULT_THRESHOLDS,
  classifyOperationalState,
  describeState,
  // intern exportiert für gezielte Tests:
  _ingestAxis: ingestAxis,
  _outputAxis: outputAxis,
  _lageAxis: lageAxis,
  _rawState: rawState,
  _applyRecovery: applyRecovery
};
