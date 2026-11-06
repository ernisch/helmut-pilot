"use strict";

// Ein Abschluss für ALLE Quellencron-Pfade. Keine neue Planung, kein Crawl,
// kein Modellaufruf. Der vorhandene Prozesslauf-Speicher ist CAS-/Upsert-gesichert.
const { buildBetriebsabdeckung, summarizeBetriebsabdeckung } = require("./betriebsabdeckung");
const PROCESS = "quellen-abdeckung";
const STATUS = new Set(["unbekannt", "ohne_aktiven_bedarf", "eingeschraenkt", "versorgung_belegt"]);
const SUMMARY_FIELDS = ["activeProfiles", "demandedPackages", "catalogPackages", "missingAssignments", "missingExpectedPackages", "errors", "warnings", "unknownPaths", "findings", "omittedFindings", "configurationDrift"];
function zaehlerkarte(value) {
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(SUMMARY_FIELDS.filter((key) => Number.isFinite(value[key])).map((key) => [key, value[key]]));
}
function codekarte(codes) {
  return Object.fromEntries([...new Set((codes || []).filter((code) => typeof code === "string" && /^[a-z_]{1,32}$/.test(code)))].slice(0, 20).map((code) => [code, 1]));
}
function unbekannt(now, code) {
  return { erhobenAm: new Date(now()).toISOString(), status: "unbekannt", summary: null, findingCodes: [code] };
}
async function begrenzt(work, budgetMs) {
  if (!(budgetMs > 0)) throw Object.assign(new Error("zeitbudget"), { zeitbudget: true });
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("zeitbudget"), { zeitbudget: true })), budgetMs); })
    ]);
  } finally { clearTimeout(timer); }
}

async function runQuellenCronMitAbdeckung(execute, { runId, deadlineAt, cronName, maxReadMs = 6500, maxWriteMs = 2500 } = {}, deps = {}) {
  // execute bleibt die echte, bereits begrenzte Pfadwahl. Auch der bestehende
  // Timeout-Abschluss liefert ein Ergebnis, das die Prüfung anschließend ergänzt.
  const result = await execute();
  const now = deps.now || Date.now;
  const started = now();
  const storage = deps.storage || require("../storage");
  const remaining = () => Math.max(0, Number(deadlineAt) - now());
  const readBudget = Math.min(Math.max(0, maxReadMs), Math.max(0, remaining() - maxWriteMs));
  let report;
  if (!runId || !["crawl", "pipeline"].includes(cronName)) return result;
  if (readBudget < 100) report = unbekannt(now, "pruefung_zeitbudget");
  else {
    try {
      const inputs = await begrenzt(async () => {
        // Eine begrenzte Telemetrieseite, maximal 800 Rohbelege. Laufende reine
        // Leseanfragen können nach dem Zeitlimit enden; es folgt dann KEIN Schreiben
        // aus diesem verworfenen Zweig und kein nachträglicher Modell-/Quellenabruf.
        const [catalog, profiles, telemetrie, documents] = await Promise.all([
          storage.listSourceArchitectureRows(), storage.listFullProfiles(),
          storage.listSourceCrawlTelemetry({ days: 14, limit: 1000 }),
          storage.listRawDocuments({ days: 30, limit: 800 })
        ]);
        if (!Array.isArray(profiles) || !Array.isArray(telemetrie) || !Array.isArray(documents)) throw new Error("lesedaten-fehlen");
        return { catalog, profiles, telemetrie, documents };
      }, readBudget);
      report = summarizeBetriebsabdeckung((deps.buildReport || buildBetriebsabdeckung)({ ...inputs, now: now(), sampleLimit: 800 }));
    } catch (error) {
      report = unbekannt(now, error?.zeitbudget ? "pruefung_zeitbudget" : "pruefung_lesefehler");
    }
  }
  if (result?.ok === false || result?.bounded === true) {
    // Historische Messwerte dürfen nach einem abgebrochenen Quellenlauf keine
    // vollständige aktuelle Versorgung bestätigen.
    report = { ...report, status: "unbekannt",
      findingCodes: [...new Set([...(report.findingCodes || []), "quellenlauf_unvollstaendig"])] };
  }
  const entry = {
    process: PROCESS, runId, mode: cronName,
    startedAt: new Date(started).toISOString(), finishedAt: report.erhobenAm,
    durationMs: Math.max(0, now() - started),
    status: report.status === "unbekannt" ? "blocked" : report.status === "eingeschraenkt" ? "partial" : "success",
    reason: STATUS.has(report.status) ? report.status : "unbekannt",
    telemetrie: { ergebnisse: zaehlerkarte(report.summary), aufloesungen: codekarte(report.findingCodes) }
  };
  let persistenz = { gespeichert: null, vollstaendig: false, grund: "pruefung_speicherzeitbudget" };
  const writeBudget = Math.min(Math.max(0, maxWriteMs), remaining());
  if (writeBudget >= 100) {
    try {
      const saved = await begrenzt(() => storage.recordProcessRun(entry), writeBudget);
      persistenz = { gespeichert: saved?.ok === true, vollstaendig: saved?.vollstaendig === true,
        grund: saved?.ok === true ? null : "pruefung_speicherfehler" };
    } catch (error) {
      // Eine gestartete atomare Quittung kann nach Ablauf noch erfolgreich enden.
      // Deshalb bei Timeout unbekannt, kein behaupteter Schreibfehlschlag.
      persistenz = { gespeichert: error?.zeitbudget ? null : false, vollstaendig: false,
        grund: error?.zeitbudget ? "pruefung_speicherzeitbudget" : "pruefung_speicherfehler" };
    }
  }
  return { ...result, quellenAbdeckung: { ...report, persistenz } };
}

function abdeckungAusProzesslauf(row) {
  if (!row || row.process !== PROCESS) return null;
  return { erhobenAm: row.finishedAt || row.createdAt || null,
    status: STATUS.has(row.reason) ? row.reason : "unbekannt",
    summary: zaehlerkarte(row.ergebnisse), findingCodes: Object.keys(codekarte(Object.keys(row.aufloesungen || {}))) };
}

module.exports = { PROCESS, runQuellenCronMitAbdeckung, abdeckungAusProzesslauf };
