"use strict";
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const B = require("../lib/helmut/betriebskosten-budget");
const CONTRACT = { version: 1, profileId: "pilot-offline", startsAt: "2026-11-05T00:00:00.000Z",
  dailyLimitUsd: 1, totalLimitUsd: 30,
  route: { provider: "azure", responsesUrl: "https://offline.openai.azure.com/openai/v1/responses", model: "gpt-5-mini" } };
const META = { politicianId: CONTRACT.profileId, callType: "lageBriefing", runId: "cron-offline" };
const ARGS = { meta: META, model: CONTRACT.route.model, maxOutputTokens: 3000,
  actualRequestHash: "a".repeat(64), runtimeRouteSnapshot: { ...CONTRACT.route, authMode: "api-key" } };
const USAGE = { input_tokens: 100, output_tokens: 20, total_tokens: 120 };
function fixture(contract = CONTRACT) {
  let auth = { users: [{ id: "historisch" }], llmUsage: [], synthetik500KostenAdmission: { expired: true },
    testKostenTage: { alt: { reserved: 123456 } } }, queue = Promise.resolve(), now = new Date("2026-11-05T12:00:00.000Z");
  const f = { fail: false, profiles: [{ id: contract.profileId }], read: () => structuredClone(auth),
    advance: ms => { now = new Date(+now + ms); }, storage: {
      listFullProfiles: async () => f.profiles,
      mutateAuthStore(change) {
        const p = queue.then(async () => {
          const copy = structuredClone(auth), result = await change(copy);
          if (f.fail) throw new Error("CAS unknown");
          auth = copy; return result;
        });
        queue = p.catch(() => {}); return p;
      }
    } };
  f.deps = { storage: f.storage, env: { [B.ENV]: JSON.stringify(contract) }, now: () => now, providerUsage: USAGE };
  f.receipt = async (ticket, patch = {}) => {
    const receipt = { id: `usage-${ticket.id}`, createdAt: now.toISOString(), model: ticket.model,
      promptTokens: 100, completionTokens: 20, totalTokens: 120, runId: ticket.runId,
      callType: ticket.callType, politicianId: ticket.politicianId, ...patch };
    await f.storage.mutateAuthStore(a => { a.llmUsage.push(receipt); });
    return { ...receipt, _ablage: { blob: true } };
  };
  return f;
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log(`PASS ${name}`); }
(async () => {
  await test("Vertrag ist explizit, endlich, Azure-only; Aenderung setzt Buch nicht zurueck", async () => {
    assert.equal(B.aktiv({}), false); assert.equal(B.aktiv({ [B.ENV]: "" }), true);
    for (const c of [{ ...CONTRACT, dailyLimitUsd: 1.01 }, { ...CONTRACT, totalLimitUsd: 31 },
      { ...CONTRACT, startsAt: "ungueltig" }, { ...CONTRACT, route: { ...CONTRACT.route, model: "gpt-4.1" } },
      { ...CONTRACT, route: { ...CONTRACT.route, provider: "openai" } }])
      assert.throws(() => B.vertrag({ [B.ENV]: JSON.stringify(c) }));
    const f = fixture(); await B.reserviere(ARGS, f.deps);
    await assert.rejects(B.reserviere(ARGS, { ...f.deps,
      env: { [B.ENV]: JSON.stringify({ ...CONTRACT, totalLimitUsd: 29 }) } }));
    assert.equal(Object.keys(f.read()[B.KEY].calls).length, 1);
  });
  await test("Jede Reserve bindet Profilbestand, Aufgabe und exakten Route/Request", async () => {
    const f = fixture();
    for (const meta of [{ ...META, politicianId: "fremd" }, { ...META, callType: "communicationDraft" },
      { ...META, costAdmission: {} }, { ...META, budgetExempt: true }, { ...META, runId: "nachlauf500-123456" },
      { callType: "understanding", pipelineStep: "understanding", politicianId: null }])
      await assert.rejects(B.reserviere({ ...ARGS, meta }, f.deps), { kiNichtGesendet: true });
    for (const profiles of [[], [{ id: CONTRACT.profileId }, { id: "fremd" }], [{ id: CONTRACT.profileId, aktiv: false }]]) {
      f.profiles = profiles; await assert.rejects(B.reserviere(ARGS, f.deps));
    }
    f.profiles = [{ id: CONTRACT.profileId }, { id: "fremd", profileActive: false }, { id: "geloescht", deletedAt: "alt" }];
    const ticket = await B.reserviere({ ...ARGS, meta: { callType: "understanding", pipelineStep: "understanding",
      politicianId: null, betriebskostenProfileId: CONTRACT.profileId } }, f.deps);
    assert.equal(ticket.reserved, 212000);
    assert.throws(() => B.pruefeSendung(ticket, { ...ARGS, actualRequestHash: "b".repeat(64) }, f.deps));
  });
  await test("Parallele CAS Reserven halten 1USD/UTC-Tag; alte Belege bleiben identisch", async () => {
    const f = fixture(), before = f.read();
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => B.reserviere(ARGS, f.deps)));
    assert.equal(results.filter(x => x.status === "fulfilled").length, 4);
    const after = f.read();
    for (const k of ["users", "synthetik500KostenAdmission", "testKostenTage"]) assert.deepEqual(after[k], before[k]);
    assert.equal(B.pruefeBuch(after[B.KEY], after[B.KEY].contract).total, 848000);
  });
  await test("Bekannte native Tokens werden einmal abgerechnet, doppelte Quittung gesperrt", async () => {
    const f = fixture(), t = await B.reserviere(ARGS, f.deps), r = await f.receipt(t);
    await B.abschliessen(t, r, f.deps); await B.abschliessen(t, r, f.deps);
    assert.equal(f.read()[B.KEY].calls[t.id].cost, 130);
    const second = await B.reserviere(ARGS, f.deps);
    await assert.rejects(B.abschliessen(second, r, f.deps), { code: "BETRIEBSKOSTEN_UNKNOWN" });
    assert.equal(f.read()[B.KEY].calls[second.id].status, "ungeklaert");
  });
  await test("Fehlende, NULL, string oder unbestaetigte Usage haelt die volle Reserve", async () => {
    for (const usage of [undefined, { input_tokens: null, output_tokens: 20 },
      { input_tokens: "100", output_tokens: 20 }, { input_tokens: 100, output_tokens: 20, total_tokens: 999 }]) {
      const f = fixture(), t = await B.reserviere(ARGS, f.deps), r = await f.receipt(t);
      await assert.rejects(B.abschliessen(t, r, { ...f.deps, providerUsage: usage }));
      await B.nichtGesendet(t, { kiNichtGesendet: true }, f.deps);
      assert.equal(f.read()[B.KEY].calls[t.id].status, "ungeklaert");
      assert.equal(B.pruefeBuch(f.read()[B.KEY], f.read()[B.KEY].contract).total, 212000);
    }
  });
  await test("Nur belegt nicht Gesendetes gibt Reserve frei; CAS Unknown niemals", async () => {
    const f = fixture(), t = await B.reserviere(ARGS, f.deps);
    await B.nichtGesendet(t, Error("transport unknown"), f.deps);
    assert.equal(f.read()[B.KEY].calls[t.id].status, "reserviert");
    f.fail = true; await assert.rejects(B.abschliessen(t, null, f.deps));
    assert.equal(f.read()[B.KEY].calls[t.id].status, "reserviert");
    await assert.rejects(B.reserviere(ARGS, f.deps), { kiNichtGesendet: true });
    f.fail = false; await B.nichtGesendet(t, { kiNichtGesendet: true }, f.deps);
    assert.equal(f.read()[B.KEY].calls[t.id].cost, 0);
  });
  await test("Native Obergrenzenverletzung friert das Buch ein, Rueckdatierung ist gesperrt", async () => {
    const f = fixture(), t = await B.reserviere(ARGS, f.deps);
    const r = await f.receipt(t, { completionTokens: 3001, totalTokens: 3101 });
    await assert.rejects(B.abschliessen(t, r, { ...f.deps,
      providerUsage: { input_tokens: 100, output_tokens: 3001, total_tokens: 3101 } }));
    assert.equal(f.read()[B.KEY].frozen, "beleg-obergrenze-verletzt");
    await assert.rejects(B.reserviere(ARGS, f.deps));
    const fresh = fixture();
    await fresh.storage.mutateAuthStore(a => { a.llmUsage.push({ createdAt: CONTRACT.startsAt, model: "gpt-5-mini" }); });
    await assert.rejects(B.reserviere(ARGS, fresh.deps), { reason: "betriebskosten-start-hat-ungebuchte-nutzung" });
    assert.equal(fresh.read()[B.KEY], undefined);
  });
  await test("30USD Gesamtgrenze erhaelt alle offenen Reserven ueber UTC-Tage/Neustart", async () => {
    const f = fixture();
    for (let i = 0; i < 141; i++) {
      if (i && i % 4 === 0) f.advance(86400000);
      await B.reserviere(ARGS, f.deps);
    }
    f.advance(86400000);
    await assert.rejects(B.reserviere(ARGS, f.deps), { reason: "betriebskosten-grenze-erreicht" });
    const book = f.read()[B.KEY]; assert.equal(B.pruefeBuch(book, book.contract).total, 29892000);
  });
  await test("Echter AI-Einstieg reserviert vor HTTPS und verarbeitet native Usage fail closed", async () => {
    const https = require("node:https"), storage = require("../lib/helmut/storage");
    const control = require("../lib/helmut/anbieter-steuerung"), ai = require("../lib/helmut/ai");
    const oldEnv = { ...process.env }, old = { request: https.request, mutate: storage.mutateAuthStore,
      profiles: storage.listFullProfiles, reserve: storage.reserveLlmCall, record: storage.recordLlmUsage,
      control: control.steuerungAktiv };
    const f = fixture({ ...CONTRACT, startsAt: new Date(Date.now() - 60000).toISOString() });
    let requests = 0, native = USAGE, transportError = false;
    try {
      Object.assign(process.env, f.deps.env, { AZURE_OPENAI_KEY: "offline", AZURE_OPENAI_ENDPOINT: "https://offline.openai.azure.com",
        AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini", AZURE_OPENAI_UNDERSTANDING_DEPLOYMENT: "gpt-5-mini" });
      storage.mutateAuthStore = f.storage.mutateAuthStore; storage.listFullProfiles = f.storage.listFullProfiles;
      storage.reserveLlmCall = async () => ({ allowed: true }); control.steuerungAktiv = () => false;
      storage.recordLlmUsage = async info => {
        const r = storage.buildLlmUsageRecord(info);
        await f.storage.mutateAuthStore(a => { a.llmUsage.push(r); });
        return { ...r, _ablage: { blob: true } };
      };
      https.request = (_url, _options, callback) => {
        requests++;
        assert(Object.values(f.read()[B.KEY].calls).some(t => t.status === "reserviert"));
        const req = new EventEmitter(); req.write = () => {}; req.destroy = () => {};
        req.end = () => setImmediate(() => {
          if (transportError) { req.emit("error", Object.assign(new Error("offline"), { code: "ETIMEDOUT" })); return; }
          const res = new EventEmitter(); res.statusCode = 200; res.setEncoding = () => {};
          callback(res); res.emit("data", JSON.stringify({ status: "completed", usage: native,
            output: [{ content: [{ type: "output_text", text: '{"ok":true}' }] }] })); res.emit("end");
        }); return req;
      };
      assert.deepEqual(await ai.requestStructuredJson("offline", {}, META), { ok: true });
      native = { input_tokens: null, output_tokens: 20 };
      await assert.rejects(ai.requestStructuredJson("offline", {}, META), { code: "BETRIEBSKOSTEN_UNKNOWN" });
      for (const meta of [{ ...META, politicianId: "fremd" }, { ...META, costAdmission: {} },
        { callType: "communicationDraft", politicianId: CONTRACT.profileId }])
        await assert.rejects(ai.requestStructuredJson("blocked", {}, meta));
      assert.equal(requests, 2);
      native = USAGE; transportError = true;
      await assert.rejects(ai.requestStructuredJson("offline timeout", {}, META), { code: "BETRIEBSKOSTEN_UNKNOWN" });
      transportError = false;
      assert.deepEqual(await ai.requestStructuredJson("expliziter neuer Versuch", {}, META), { ok: true });
      assert.equal(requests, 4, "Jeder tatsaechliche Versuch hat eine eigene Vollreserve, kein Auto-Retry");
      const calls = Object.values(f.read()[B.KEY].calls);
      assert.equal(calls[0].cost, 130); assert.equal(calls[1].status, "ungeklaert");
      assert.equal(calls[2].status, "ungeklaert"); assert.equal(calls[3].cost, 130);
    } finally {
      https.request = old.request; storage.mutateAuthStore = old.mutate; storage.listFullProfiles = old.profiles;
      storage.reserveLlmCall = old.reserve; storage.recordLlmUsage = old.record; control.steuerungAktiv = old.control;
      for (const k of Object.keys(process.env)) if (!(k in oldEnv)) delete process.env[k]; Object.assign(process.env, oldEnv);
    }
  });
  console.log(`${count}/${count} Betriebskosten-Gruppen bestanden. Ausschliesslich offline.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
