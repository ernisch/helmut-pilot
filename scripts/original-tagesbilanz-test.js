"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
assert.ok(process.env.NODE_OPTIONS?.includes("lokaler-netzschutz"));
const root = path.join(__dirname, "..");
const checks = [];
async function check(name, fn) { await fn(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
async function main() {
  const { buildDailyLedger, berlinDay } = await import(pathToFileURL(path.join(root, "verwaltung/original-daily-ledger.mjs")));
  const { mandatsErgebnis } = require("../lib/helmut/lage-laufdiagnose");
  const now = new Date("2026-11-04T12:00:00Z"), id = "daily-synthetic-alpha";
  const overview = { mandates: [{ id, profileActive: true }] };
  const base = { runId: "synthetic-run-1", process: "briefing-lage", status: "success", startedAt: "2026-11-04T06:00:00Z", finishedAt: "2026-11-04T06:01:00Z",
    mandatsErgebnisse: [mandatsErgebnis(id, { available: true, fromCache: true })] };
  const run = async (items, extra = {}) => buildDailyLedger({ overview, runs: { processRuns: items }, now, ...extra });
  await check("Echte vorhandene Lage-Produzentenbindung wird erkannt, Cache bleibt nur gemeldet", async () => {
    const d = await run([base]); assert.equal(d.rows[1].reportedStored, 1); assert.equal(d.rows[0].reportedStored, null);
    assert.equal(d.complete, false); assert.match(d.note, /Cachebestände/);
  });
  await check("Vollständigkeit, Qualität und Empfang bleiben trotz Speicherflag ungeprüft", async () => {
    const d = await run([base]); for (const row of d.rows) for (const key of ["completeness", "quality", "received"]) assert.equal(row[key], "Ungeprüft");
    assert.equal(d.rows[2].reportedStored, null);
  });
  await check("Aggregierter Erfolg oder processed:500 ist kein Einzelnachweis", async () => {
    const d = await run([{ ...base, mandatsErgebnisse: null, processed: 500 }]); assert.equal(d.rows[1].reportedStored, null); assert.equal(d.rows[1].readRuns, 1);
  });
  await check("Fremde und derzeit inaktive Profile liefern keinen positiven Zähler", async () => {
    let d = await run([{ ...base, mandatsErgebnisse: [mandatsErgebnis("daily-foreign", { available: true })] }]); assert.equal(d.rows[1].reportedStored, null);
    d = await run([base], { overview: { mandates: [{ id, profileActive: false }] } }); assert.equal(d.rows[1].reportedStored, null);
  });
  await check("Doppelte Übertragung und mehrere Läufe desselben Profils verdoppeln es nicht", async () => {
    const d = await run([base, base, { ...base, runId: "synthetic-run-2" }]); assert.equal(d.rows[1].reportedStored, 1); assert.equal(d.rows[1].readRuns, 2);
  });
  await check("Widersprüchliche Laufkennung und doppelte Profilzeilen zählen nicht", async () => {
    let d = await run([base, { ...base, status: "failed" }]); assert.equal(d.rows[1].reportedStored, null);
    d = await run([{ ...base, mandatsErgebnisse: [...base.mandatsErgebnisse, ...base.mandatsErgebnisse] }]); assert.equal(d.rows[1].reportedStored, null);
  });
  await check("Gestern, Zukunft, Tageswechsel und unvollständiger Lauf werden verworfen", async () => {
    for (const extra of [{ startedAt: "2026-11-03T07:00:00Z" }, { finishedAt: "2026-11-04T12:01:00Z" }, { startedAt: "2026-11-03T22:59:00Z" }, { finishedAt: null }, { status: "running" }]) {
      const d = await run([{ ...base, ...extra }]); assert.equal(d.rows[1].reportedStored, null);
    }
  });
  await check("Berliner Tag behandelt Sommer-/Winterzeit statt pauschalem24h-Fenster", () => {
    assert.equal(berlinDay("2026-10-24T22:30:00Z"), "2026-10-25");
    assert.equal(berlinDay("2026-10-25T22:30:00Z"), "2026-10-25");
    assert.equal(berlinDay("2026-10-25T23:00:00Z"), "2026-10-26");
  });
  await check("Lesefehler, fehlende Aktivflags und übergroßes Lesefenster bleiben unbekannt", async () => {
    for (const args of [{ overview: null }, { runs: null }, { overview: { mandates: [{ id }] } }, { runs: { processRuns: Array.from({ length: 21 }, () => base) } }]) {
      const d = await buildDailyLedger({ overview, runs: { processRuns: [base] }, now, ...args }); assert.equal(d.available, false); assert.equal(d.rows[1].reportedStored, null);
    }
  });
  await check("Leeres gelesenes Fenster bestätigt nur null gelesene Läufe", async () => {
    const d = await run([]); assert.equal(d.rows[1].readRuns, 0); assert.equal(d.rows[1].reportedStored, null); assert.equal(d.complete, false);
  });
  await check("Falscher Produzent und textuelle Booleans sind keine Speicherbestätigung", async () => {
    let d = await run([{ ...base, process: "unbekannt" }]); assert.equal(d.rows[1].reportedStored, null);
    d = await run([{ ...base, mandatsErgebnisse: [{ ...base.mandatsErgebnisse[0], lageGespeichert: "true" }] }]); assert.equal(d.rows[1].reportedStored, null);
  });
  await check("Vorhandener Nachlauf kann Briefing und Lage getrennt melden", async () => {
    const d = await run([{ ...base, process: "briefing-nachlauf-500", status: "partial", mandatsErgebnisse: [{ ...base.mandatsErgebnisse[0], briefingGespeichert: true }] }]);
    assert.equal(d.rows[0].reportedStored, 1); assert.equal(d.rows[1].reportedStored, 1); assert.equal(d.rows[0].failedRuns, 1);
  });
  const result = { checks, moduleSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "verwaltung/original-daily-ledger.mjs"))).digest("hex"),
    limitations: ["Nur begrenzte vorhandene Laufquittungen", "Keine Qualität-/Vollständigkeits-/Empfangs-/Production-Abnahme", "Keine Motorfunktion oder Datenablage verändert"] };
  if (process.env.HELMUT_PARALLEL_EVIDENCE) fs.writeFileSync(path.join(process.env.HELMUT_PARALLEL_EVIDENCE, "tagesbilanz-ergebnis.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(`${checks.length}/${checks.length} Tagesbilanzgruppen bestanden`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
