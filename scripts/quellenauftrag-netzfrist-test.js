"use strict";
const A = require("node:assert/strict"), P = require("../lib/helmut/scalable-pipeline");
const gruppe = (process.argv.find(x => x.startsWith("--gruppe=")) || "").slice(9);
const source = { id: "synthetische-fristquelle", name: "Synthetische Quelle", type: "media", active: true,
  url: "https://example.org/feed", rssUrl: "https://example.org/feed" };
function welt(extra = {}) {
  let now = Date.parse("2026-11-16T03:00:00Z");
  const calls = { crawl: 0, class: 0, release: 0, persist: 0 };
  const result = { rawItems: [], results: [{ ok: true, sourceId: source.id, items: [], status: "empty" }] };
  const deps = P.workerDeps({ env: { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_SOURCE_MODE: "on", HELMUT_SUPABASE_TIMEOUT_MS: "1000" },
    sourceTelemetryEnabled: false, now: () => now, hardeningConfig: () => ({ enabled: false }),
    klassen: { belege: async () => { calls.class++; return { erlaubt: true, slot: "synthetischer-slot" }; },
      gebeFrei: async () => { calls.release++; } },
    crawlAllSources: async () => { calls.crawl++; return result; },
    persistRohdokumente: async () => { calls.persist++; throw Error("unerwartete-Persistenz"); },
    persistSourceCrawlTelemetry: async () => ({ ok: true }), ...extra });
  return { deps, calls, result, now: () => now, advance: ms => { now += ms; },
    run: ms => P.HANDLER.source_fetch({ id: "synthetischer-job", payload: { quelle: source } }, deps,
      ms === null ? {} : { auftragsDeadlineMs: now + ms }) };
}
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
test("knapp", async () => {
  const w = welt(); w.deps.env.HELMUT_SUPABASE_TIMEOUT_MS = "10000";
  const r = await w.run(5646);
  A.equal(r.zurueckgestellt, true); A.equal(r.zeitbudgetErschoepft, true);
  A.equal(w.calls.crawl, 0); A.equal(w.calls.class, 0); A.equal(w.calls.persist, 0);
});
test("klasse", async () => {
  const w = welt(); w.deps.klassen.belege = async () => { w.advance(8000); return { erlaubt: true, slot: "s" }; };
  const r = await w.run(10000);
  A.equal(r.zurueckgestellt, true); A.equal(w.calls.crawl, 0); A.equal(w.calls.release, 1);
});
test("abbruch", async () => {
  const { mock } = require("node:test"); mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.parse("2026-11-16T03:00:00Z") });
  try {
    const w = welt(); w.deps.now = Date.now; let options, settled = false;
    w.deps.crawlAllSources = async (_sources, opts) => {
      w.calls.crawl++; options = opts;
      await new Promise(resolve => opts.abbruchSignal.addEventListener("abort", resolve, { once: true }));
      settled = true; return w.result;
    };
    const promise = w.run(10000);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    A(options?.abbruchSignal instanceof AbortSignal);
    mock.timers.tick(7000);
    const r = await promise;
    A.equal(settled, true); A.equal(r.zurueckgestellt, true);
    A.equal(w.calls.persist, 0); A.equal(w.calls.release, 1);
  } finally { mock.timers.reset(); }
});
test("erfolg", async () => {
  const w = welt(); let options;
  w.deps.crawlAllSources = async (_sources, o) => { options = o; return w.result; };
  const r = await w.run(10000); A.equal(r.ok, true); A.equal(options.abbruchSignal.aborted, false);
  A.equal(w.calls.release, 1);
});
test("ohne-frist", async () => {
  const w = welt(); let options;
  w.deps.crawlAllSources = async (_sources, o) => { options = o; return w.result; };
  const r = await w.run(null); A.equal(r.ok, true); A.equal(options.abbruchSignal, undefined);
});
test("synchrone-frist", async () => {
  const w = welt(); w.deps.hardeningConfig = () => { w.advance(8000); return { enabled: false }; };
  const r = await w.run(10000); A.equal(r.zurueckgestellt, true);
  A.equal(w.calls.crawl, 0); A.equal(w.calls.release, 1);
});
test("eurlex-frist", async () => {
  const w = welt(); let caller, params;
  w.deps.enrichEurlexExcerpt = async (_items, _source, p) => { params = p; return []; };
  w.deps.crawlAllSources = async (_sources, opts) => {
    caller = opts; await opts.cellarExcerpt([], source, async (_u, _d, options) => {
      A(options.abbruchSignal instanceof AbortSignal); return { body: "synthetisch" };
    }); return w.result;
  };
  const deadline = w.now() + 10000;
  A.equal((await w.run(10000)).ok, true);
  A.equal(params.deadlineMs, deadline - 3000); A.equal(caller.deadlineMs, params.deadlineMs);
  const original = new AbortController(); original.abort(Error("synthetischer-Originalabbruch"));
  // Die native Originalreservierung und ihr Ausgang werden nicht zurueckgesetzt.
  let sent = false;
  w.deps.enrichEurlexExcerpt = async (_i, _s, p) => p.fetchUrl("https://example.org/original", 0, { abbruchSignal: original.signal });
  w.deps.crawlAllSources = async (_s, o) => { await o.cellarExcerpt([], source, async (_u, _d, opts) => {
    sent = true; A.equal(opts.abbruchSignal.aborted, true); throw opts.abbruchSignal.reason;
  }); };
  await A.rejects(w.run(10000), /synthetischer-Originalabbruch/); A.equal(sent, false);
});
test("speicherfehler", async () => {
  const w = welt(); const unknown = Error("persistenz-fehlgeschlagen-oder-unbekannt");
  const item = { sourceId: source.id, sourceName: source.name, sourceType: "media",
    title: "Synthetischer gespeicherter Artikel", url: "https://example.org/artikel", content: "Synthetischer Originalinhalt." };
  w.result.rawItems = [item]; w.result.results[0].items = [item];
  w.deps.persistRohdokumente = async () => { w.advance(20000); throw unknown; };
  await A.rejects(w.run(10000), e => e === unknown); A.equal(w.calls.release, 1);
});
test("native-vertagung", async () => {
  const { erzeugeSpeicherWarteschlange } = require("./fixtures/jobqueue-speicher-treiber");
  const w = welt(); w.deps.env.HELMUT_SUPABASE_TIMEOUT_MS = "10000";
  const q = erzeugeSpeicherWarteschlange({ now: w.now });
  const e = await q.enqueue({ jobType: "source_fetch", idempotencyKey: "neue-fristgrenze", payload: { quelle: source } });
  const claimed = await q.claim({ owner: "frist-owner", limit: 1, leaseMs: 300000 });
  A.equal(q.hole(e.id).attempts, 1);
  const deps = { ...w.deps, extendLease: q.extendLease, zurueckstellen: q.zurueckstellen, finish: q.finish };
  const r = await P.fuehreAuftragAus({ auftrag: claimed.auftraege[0], deps, besitzer: "frist-owner",
    leaseMs: 300000, restzeitMs: 5646 });
  A.equal(r.ausgang, "zurueckgestellt"); A.equal(q.hole(e.id).status, "wartend");
  A.equal(q.hole(e.id).attempts, 0); A.equal(w.calls.crawl, 0);
});
(async () => { let n = 0; for (const t of tests) {
  if (gruppe && t.name !== gruppe) continue;
  await t.fn(); n++; console.log("PASS " + t.name);
} A(n > 0); console.log(`${n} neue Quellenfristgruppen bestanden; keine externen Aufrufe.`);
})().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
