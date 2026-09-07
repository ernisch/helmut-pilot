"use strict";

const assert = require("node:assert/strict");
const { leseWarteschlangenStatus, pruefeWarteschlangenLauf } = require("../lib/helmut/pipeline-status");
const { pruefeRegulaerenErfolg } = require("./watchdog-pipeline-check");
const slot = Date.parse("2026-09-07T04:00:00Z"), jetzt = Date.parse("2026-09-07T10:34:00Z");
const row = { run_id: "cron-crawl-20260907040028-ph8vi", process: "warteschlange-crawl",
  status: "success", started_at: "2026-09-07T04:00:28Z", finished_at: "2026-09-07T04:04:10Z",
  processed_count: 273, failed_count: 0, deferred_count: 20, duration_ms: 222000 };
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
const options = { seitMs: slot, jetztMs: jetzt, toleranzMs: 60000 };
const read = r => leseWarteschlangenStatus({ request: async (url, opts) => {
  assert.equal(opts.method, "GET"); assert.equal(opts.body, undefined);
  assert(url.includes("process=in.(warteschlange-crawl,warteschlange-pipeline)"));
  assert(url.includes("order=started_at.desc,run_id.desc&limit=1"));
  return r;
} });

(async () => {
  await test("Aktiver Motor liest kanonische Laufzeile ohne alte Blobs oder Schreibvorgang", async () => {
    const r = await read([row]);
    assert.equal(r.ok, true); assert.equal(r.quelle, "process_runs");
    assert.equal(r.latestRun.processedCount, 273);
    assert.equal(pruefeWarteschlangenLauf(r.latestRun, options).ausgang, "vorhanden");
    assert.equal((await read([])).latestRun, null);
  });
  await test("Lesefehler und ungueltige Antwort erzeugen keinen behaupteten Leerbestand", async () => {
    assert.equal((await leseWarteschlangenStatus({ request: async () => { throw new Error("secret"); } })).ok, false);
    assert.equal((await read({})).ok, false);
    assert.equal((await read([row, row])).ok, false);
    for (const r of [null, 0, "falsch", []]) assert.equal((await read([r])).ok, false);
  });
  for (const [name, patch, erwartet] of [
    ["unbekannte Fehlerzahl", { failedCount: null }, "lesefehler"],
    ["fehlender Abschluss", { createdAt: null }, "lesefehler"],
    ["fremder Prozesstyp", { process: "understanding-cron" }, "lesefehler"],
    ["unbekannter Status", { status: "irgendwas" }, "lesefehler"],
    ["Zeitpunkt in Zukunft", { createdAt: "2026-09-08T04:05:00Z" }, "lesefehler"],
    ["alter Beginn trotz neuem Abschluss", { startedAt: "2026-09-06T20:00:00Z" }, "veraltet"],
    ["keine Verarbeitung", { processedCount: 0 }, "unbrauchbar"],
    ["Fehler", { failedCount: 1 }, "unbrauchbar"],
    ["Teilabschluss", { status: "partial" }, "unbrauchbar"]
  ]) await test(name, async () => {
    const r = await read([row]); Object.assign(r.latestRun, patch);
    assert.equal(pruefeWarteschlangenLauf(r.latestRun, options).ausgang, erwartet);
  });
  await test("Echter Watchdog verwertet Warteschlange und verweigert unbekannte Fehlerzahl", async () => {
    const r = await read([row]);
    const check = () => pruefeRegulaerenErfolg("http://localhost", {}, jetzt, {
      slotFn: () => slot, fetchJsonFn: async () => ({ status: 200, data: r })
    });
    assert.equal((await check()).ausgang, "vorhanden");
    r.latestRun.failedCount = null;
    assert.equal((await check()).ausgang, "lesefehler");
  });
  await test("Tatsaechliche Statusroute liest beim aktiven Motor keine veralteten Crawl Blobs", async () => {
    const fs = require("node:fs"), path = require("node:path");
    const code = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
    const start = code.indexOf('  if (url.pathname === "/api/cron/pipeline-status") {');
    const ende = code.indexOf('\n  // Morgen-Health-Report', start);
    assert(start > 0 && ende > start);
    let reads = 0;
    const invoke = new Function("url", "request", "response", "authorizeCron", "handleAsync", "scalablePipeline", "getLatestCrawlRun", "require", "process",
      `return (async () => { ${code.slice(start, ende)} })()`);
    const args = [{ pathname: "/api/cron/pipeline-status" }, {}, {}, () => true, (_res, fn) => fn(),
      { skalierbarerPfadAktiv: () => true }, () => { throw new Error("alter Blob darf nicht gelesen werden"); },
      name => { assert.equal(name, "./lib/helmut/pipeline-status"); return { leseWarteschlangenStatus: () => { reads++; return read([row]); } }; }, { env: {} }];
    assert.equal((await invoke(...args)).latestRun.runId, row.run_id); assert.equal(reads, 1);
    args[3] = () => false;
    assert.equal(await invoke(...args), undefined); assert.equal(reads, 1);
  });
  console.log(`${passed}/${passed} Pipeline Statuspruefungen bestanden`);
})().catch(e => { console.error(e); process.exitCode = 1; });
