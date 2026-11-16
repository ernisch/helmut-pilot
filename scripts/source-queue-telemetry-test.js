"use strict";

// Enger Queue-Handlernachweis mit echtem Telemetrie-Builder/-Flag/-Persist-Wrapper.
// Ausschliesslich injizierte Abruf-/Speicheradapter; kein Netz/Modell/Profilzugriff.
const assert = require("node:assert/strict");
const P = require("../lib/helmut/scalable-pipeline"), D = require("../lib/helmut/dedup");
const at = Date.parse("2026-11-15T12:54:00Z");
const source = { id: "queue-quelle", name: "Oeffentliche Testredaktion", type: "media", politicalLevel: "bund" };
const item = n => ({ sourceId: source.id, sourceName: source.name, sourceType: "media",
  title: `Oeffentlicher Testartikel ${n}`, url: `https://example.org/artikel-${n}`,
  content: "Dieser synthetische Dokumenttext und die Artikelueberschrift duerfen niemals in der technischen Quittung stehen.",
  publishedAt: "2026-11-15T10:00:00Z", author: "Nicht in Telemetrie uebernehmen" });
const first = item(1), second = item(2), id = x => D.toRawDocumentRow(x).id;
function fixture({ items = [first, first, second], result = {}, persistence, extra = {} } = {}) {
  const writes = [], calls = { crawl: 0, persist: 0, enqueue: 0 };
  const measured = { sourceId: source.id, sourceName: source.name, ok: true, status: items.length ? "ok" : "empty",
    itemCount: items.length, items, startedAt: "2026-11-15T12:54:00.000Z", finishedAt: "2026-11-15T12:54:00.321Z",
    durationMs: 321, retryCount: 2, duplicateItems: 1, ignoredItems: 0, ...result };
  const deps = P.workerDeps({ env: { HELMUT_SOURCE_MODE: "on", VERCEL_REGION: "test-region", HELMUT_SUPABASE_TIMEOUT_MS: "1000" },
    now: () => at, hardeningConfig: () => ({ enabled: false }),
    crawlAllSources: async () => { calls.crawl++; return { rawItems: items, results: [measured] }; },
    persistRohdokumente: async () => { calls.persist++; return persistence || {
      ok: true, neuIds: [id(first)], bestaetigteIds: [id(first), id(second)], vorhandene: 1 }; },
    enqueue: async () => { calls.enqueue++; return { verfuegbar: true, id: "next-job", neu: true }; },
    insertSourceCrawlTelemetry: async rows => { writes.push(rows); return { inserted: rows.length }; }, ...extra });
  const run = (kontext = { auftragsDeadlineMs: at + 10000 }, quelle = source) =>
    P.HANDLER.source_fetch({ id: "source-job", payload: { quelle } }, deps, kontext);
  return { run, writes, calls, deps, measured };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
(async () => {
  const originalFlag = process.env.HELMUT_SOURCE_TELEMETRY;
  try {
    process.env.HELMUT_SOURCE_TELEMETRY = "on";
    await test("Queue quittiert echte Messungen und nur bestaetigte neue Dokumentkennungen einmal je Quelle", async () => {
      const f = fixture(); const r = await f.run(); assert.equal(r.ok, true);
      assert.equal(f.writes.length, 1); assert.equal(f.writes[0].length, 1);
      const row = f.writes[0][0];
      assert.equal(row.run_id, "source-job"); assert.equal(row.source_id, source.id);
      assert.equal(row.started_at, f.measured.startedAt); assert.equal(row.finished_at, f.measured.finishedAt);
      assert.equal(row.duration_ms, 321); assert.equal(row.retry_count, 2);
      assert.equal(row.found_documents, 3); assert.equal(row.new_documents, 1);
      assert.equal(row.duplicate_documents, 1); assert.equal(row.ignored_documents, 0);
      assert.equal(row.status, "ok"); assert.equal(row.error_code, null);
      assert.equal(row.source_mode, "on"); assert.equal(row.execution_location, "test-region");
      assert.equal(row.planned_process, "source_fetch"); assert.equal(row.follow_up_process, "understanding");
      const text = JSON.stringify(row);
      for (const secret of [first.title, first.content, first.author, first.url, "payload", "tenantId"])
        assert(!text.includes(secret), secret);
    });
    await test("Vorhandenes Flag AUS sperrt den Writer, erfolgreiche Facharbeit bleibt unveraendert", async () => {
      process.env.HELMUT_SOURCE_TELEMETRY = "off";
      const f = fixture(); assert.equal((await f.run()).ok, true); assert.equal(f.writes.length, 0);
      assert.equal(f.calls.crawl, 1); assert.equal(f.calls.persist, 1);
      process.env.HELMUT_SOURCE_TELEMETRY = "on";
    });
    await test("Empty/Skip-Status und klassifizierter Abruffehler bleiben echte Crawl-Ergebnisse", async () => {
      for (const status of ["empty", "skipped-shared", "skipped-cooldown"]) {
        const f = fixture({ items: [], result: { status, duplicateItems: 0 } });
        assert.equal((await f.run()).ok, true); assert.equal(f.writes[0][0].status, status);
        assert.equal(f.writes[0][0].new_documents, 0); assert.equal(f.calls.persist, 0);
      }
      const f = fixture({ items: [], result: { ok: false, status: "error", error: "503 https://example.org/private" } });
      await assert.rejects(f.run(), /503/);
      assert.equal(f.writes[0][0].status, "error"); assert.equal(f.writes[0][0].error_code, "http-5xx");
      assert(!JSON.stringify(f.writes).includes("private"));
    });
    await test("Unbekannte Rohpersistenz wird nicht als gesunder Abruf oder neue Speicherung quittiert", async () => {
      const f = fixture({ persistence: { ok: false, grund: "unknown-rpc", neuIds: [id(first)] } });
      await assert.rejects(f.run(), /persistenz-fehlgeschlagen-oder-unbekannt/);
      assert.equal(f.writes[0][0].status, "error"); assert.equal(f.writes[0][0].error_code, "unknown");
      assert.equal(f.writes[0][0].new_documents, 0); assert.equal(f.calls.enqueue, 0);
    });
    await test("Telemetry-UNKNOWN/Writerfehler verwirft bestaetigte Facharbeit nicht", async () => {
      for (const insert of [async () => ({ skipped: true }), async () => { throw Error("write-unknown"); }]) {
        let writes = 0;
        const f = fixture({ extra: { insertSourceCrawlTelemetry: async rows => { writes++; return insert(rows); } } });
        assert.equal((await f.run()).ok, true);
        assert.equal(writes, 1); assert.equal(f.calls.crawl, 1); assert.equal(f.calls.persist, 1); assert.equal(f.calls.enqueue, 1);
      }
    });
    await test("Fehlende Messung oder Restzeit startet keinen Telemetrie-RPC und erfindet keine Quittung", async () => {
      const noMeasurement = fixture({ result: { startedAt: undefined } });
      assert.equal((await noMeasurement.run()).ok, true); assert.equal(noMeasurement.writes.length, 0);
      const short = fixture(); assert.equal((await short.run({ auftragsDeadlineMs: at + 1500 })).zurueckgestellt, true);
      assert.equal(short.writes.length, 0); assert.equal(short.calls.crawl, 0);
      // Die Fachphase beginnt rechtzeitig. Erst ihre bestaetigte Persistenz
      // verbraucht den Rest; das darf danach keinen Telemetrie-RPC starten.
      const afterWork = fixture(); let current = at;
      afterWork.deps.now = () => current;
      const persist = afterWork.deps.persistRohdokumente;
      afterWork.deps.persistRohdokumente = async () => { const result = await persist(); current += 8500; return result; };
      assert.equal((await afterWork.run()).ok, true); assert.equal(afterWork.writes.length, 0);
      assert.equal(afterWork.calls.persist, 1);
      const noDeadline = fixture(); assert.equal((await noDeadline.run({})).ok, true); assert.equal(noDeadline.writes.length, 0);
    });
    await test("Persoenliche Quellennamen gelangen nicht in die technische Allowlist", async () => {
      const f = fixture({ result: { sourceName: "Nicht speichern" } });
      assert.equal((await f.run(undefined, { ...source, type: "person", name: "Nicht speichern" })).ok, true);
      assert.equal(f.writes[0][0].source_name, null); assert(!JSON.stringify(f.writes).includes("Nicht speichern"));
    });
    await test("Langsame Telemetrie ist vor Auftragsfrist begrenzt und wiederholt keine erfolgreiche Fachphase", async () => {
      const f = fixture({ extra: { insertSourceCrawlTelemetry: () => new Promise(() => {}) } });
      assert.equal((await f.run()).ok, true);
      assert.equal(f.calls.crawl, 1); assert.equal(f.calls.persist, 1); assert.equal(f.calls.enqueue, 1);
    });
  } finally {
    if (originalFlag === undefined) delete process.env.HELMUT_SOURCE_TELEMETRY;
    else process.env.HELMUT_SOURCE_TELEMETRY = originalFlag;
  }
  console.log(`\n${passed}/${passed} Queue-Telemetriegruppen bestanden; kein Netz/Modell/Profilzugriff.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
