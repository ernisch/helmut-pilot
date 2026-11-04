// Nur vorhandene, pseudonyme Laufquittungen aus dem Verwaltungsleser auswerten.
// Das begrenzte Lesefenster ist KEIN vollständiger Tages-/Qualitätsnachweis.
export function berlinDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = type => parts.find(p => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function emptyDailyLedger(now = new Date()) {
  return { day: berlinDay(now), available: false, complete: false, expected: null, windowLimit: 20,
    note: "Keine vollständige Tagesbilanz. Fehlende, leere, doppelte oder brauchbare Ergebnisse sind hier nicht geprüft.",
    rows: ["Briefing", "Lage", "Zustellung"].map(label => ({ label, reportedStored: null, readRuns: null, failedRuns: null,
      completeness: "Ungeprüft", quality: "Ungeprüft", received: "Ungeprüft" })) };
}

export async function buildDailyLedger({ overview, runs, now = new Date(), digest = globalThis.crypto?.subtle } = {}) {
  const report = emptyDailyLedger(now);
  if (!report.day || !Array.isArray(overview?.mandates) || !Array.isArray(runs?.processRuns) || runs.processRuns.length > 20 || !digest) return report;
  const profiles = overview.mandates;
  if (profiles.some(p => !p || typeof p.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,119}$/i.test(p.id) || typeof p.profileActive !== "boolean")
      || new Set(profiles.map(p => p.id)).size !== profiles.length) return report;
  const active = profiles.filter(p => p.profileActive);
  const known = new Set();
  for (const p of active) {
    // Kanonischer Produzent: lage-laufdiagnose.js und testkohorte-textnachlauf.js.
    const bytes = await digest.digest("SHA-256", new TextEncoder().encode(JSON.stringify(p.id)));
    known.add(Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join(""));
  }
  const clock = new Date(now).getTime(), unique = new Map(), conflicts = new Set();
  for (const run of runs.processRuns) {
    if (!run || typeof run.runId !== "string" || !run.runId || run.runId.length > 80) continue;
    const encoded = JSON.stringify(run);
    if (unique.has(run.runId) && unique.get(run.runId).encoded !== encoded) conflicts.add(run.runId);
    else unique.set(run.runId, { run, encoded });
  }
  const today = [];
  for (const { run } of unique.values()) {
    if (conflicts.has(run.runId)) continue;
    if (typeof run.startedAt !== "string" || typeof run.finishedAt !== "string") continue;
    const start = Date.parse(run.startedAt), finish = Date.parse(run.finishedAt);
    if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start || finish > clock
        || berlinDay(start) !== report.day || berlinDay(finish) !== report.day) continue;
    if (!["success", "partial", "failed", "ok", "completed"].includes(run.status)) continue;
    today.push(run);
  }
  const definitions = [
    { label: "Briefing", processes: ["briefing-morning", "briefing-nachlauf-500"], field: "briefingGespeichert", writers: ["briefing-nachlauf-500"] },
    { label: "Lage", processes: ["briefing-lage", "briefing-nachlauf-500"], field: "lageGespeichert", writers: ["briefing-lage", "briefing-nachlauf-500"] }
  ];
  report.rows = definitions.map(def => {
    const relevant = today.filter(run => def.processes.includes(run.process));
    const positive = new Set(); let witnessed = false;
    for (const run of relevant.filter(run => def.writers.includes(run.process))) {
      const rows = run.mandatsErgebnisse;
      if (!Array.isArray(rows) || rows.length > 500) continue;
      const ids = rows.map(row => row?.mandatHash);
      if (new Set(ids).size !== ids.length) continue;
      for (const row of rows) {
        if (!row || !known.has(row.mandatHash) || row.gestartet !== true || typeof row[def.field] !== "boolean") continue;
        witnessed = true;
        if (row[def.field] === true) positive.add(row.mandatHash);
      }
    }
    return { label: def.label, reportedStored: witnessed ? positive.size : null, readRuns: relevant.length,
      failedRuns: relevant.filter(run => ["partial", "failed"].includes(run.status)).length,
      completeness: "Ungeprüft", quality: "Ungeprüft", received: "Ungeprüft" };
  }).concat(report.rows[2]);
  report.available = true; report.expected = active.length;
  report.note = `Berliner Tag ${report.day} · nur die letzten ${report.windowLimit} gelesenen Laufbelege. „Gemeldet“ zählt vorhandene Speicherangaben für aktive Profile; auch Cachebestände können enthalten sein. Qualität und tatsächlicher Empfang bleiben ungeprüft.`;
  return report;
}
