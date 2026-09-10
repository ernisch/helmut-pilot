"use strict";
// Geldinvarianten und echter KI Einstieg mit lokalem Transport. Keine Anbieteraufrufe.
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const B = require("../lib/helmut/testkosten-budget");
const ENV = { VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", AZURE_OPENAI_KEY: "offline" };
const START = "2026-09-09T12:00:00.000Z", DAY = START.slice(0, 10);
const ARGS = { model: "gpt-5-mini", maxOutputTokens: 3000, runId: "nachlauf500-123456789" };
const RECEIPT = { model: "gpt-5-mini", promptTokens: 100, completionTokens: 20, _ablage: { blob: true } };
function fixture() {
  let state = { llmUsage: [], users: [{ id: "bestehend" }] }, queue = Promise.resolve(), clock = Date.parse(START);
  const h = { counter: 0, fail: false, read: () => structuredClone(state), advance: n => { clock += n; } };
  h.storage = {
    leseLlmTageszaehler: async () => ({ ok: true, used: h.counter }),
    mutateAuthStore: fn => {
      const p = queue.then(async () => {
        if (h.fail) throw Error("offline Speicherfehler");
        const draft = structuredClone(state), result = await fn(draft);
        state = draft; return result;
      });
      queue = p.catch(() => {}); return p;
    }
  };
  h.deps = { env: ENV, storage: h.storage, now: () => new Date(clock) };
  h.day = () => h.read()[B.KEY][DAY];
  return h;
}
let count = 0;
async function test(name, fn) { await fn(); console.log("PASS " + name); count++; }
(async () => {
  await test("Inaktiv ohne Schreibwirkung; falsches Modell oder Limit vor Reservierung gesperrt", async () => {
    const h = fixture();
    assert.equal(await B.reserviere(ARGS, { ...h.deps, env: {} }), null);
    for (const args of [{ ...ARGS, model: "unbekannt" }, { ...ARGS, maxOutputTokens: 3001 }])
      await assert.rejects(B.reserviere(args, h.deps), { code: "LLM_BUDGET_EXHAUSTED", kiNichtGesendet: true });
    assert.equal(h.read()[B.KEY], undefined);
  });
  await test("40 parallele Reservierungen halten gemeinsam hoechstens 4 USD; bestaetigte Abrechnung gibt nur den Rest frei", async () => {
    const h = fixture();
    const r = await Promise.allSettled(Array.from({ length: 40 }, () => B.reserviere(ARGS, h.deps)));
    const ok = r.filter(x => x.status === "fulfilled");
    assert.equal(ok.length, 18); assert.equal(B.belegt(h.day()), 3816000);
    await B.abschliessen(ok[0].value, RECEIPT, h.deps);
    await B.abschliessen(ok[0].value, RECEIPT, h.deps);
    assert.equal(h.day().spent, 130, "Abrechnung ist idempotent");
    await B.reserviere(ARGS, h.deps);
    assert(B.belegt(h.day()) <= B.LIMIT_MICRO_USD);
    assert.deepEqual(h.read().users, [{ id: "bestehend" }]);
  });
  await test("Heutige historische Tokens verbrauchen denselben Deckel; Luecken und unbekannte Tokens sperren", async () => {
    const h = fixture(); h.counter = 1;
    await h.storage.mutateAuthStore(s => { s.llmUsage = [{ createdAt: START, model: "gpt-5-mini",
      promptTokens: 200000, completionTokens: 3000, estimatedCost: 0.056 }]; });
    await B.reserviere(ARGS, h.deps); assert.equal(h.day().baseline, 112000);
    for (const bad of [null, "100"]) {
      const f = fixture(); f.counter = 1;
      await f.storage.mutateAuthStore(s => { s.llmUsage = [{ createdAt: START, model: "gpt-5-mini",
        promptTokens: bad, completionTokens: 10, estimatedCost: 0.01 }]; });
      await assert.rejects(B.reserviere(ARGS, f.deps)); assert.equal(f.read()[B.KEY], undefined);
    }
    const f = fixture(); f.counter = 1;
    await assert.rejects(B.reserviere(ARGS, f.deps));
  });
  await test("Verlorene Antwort bleibt voll gebunden; andere Tickets nutzen nur den verbleibenden Deckel", async () => {
    for (const receipt of [null, { ...RECEIPT, _ablage: { blob: false } },
      { ...RECEIPT, completionTokens: null }]) {
      const h = fixture(), ticket = await B.reserviere(ARGS, h.deps);
      await assert.rejects(B.abschliessen(ticket, receipt, h.deps), { code: "TEST_USD_UNKNOWN" });
      assert.equal(h.day().calls[ticket.id].status, "ungeklaert");
      assert.equal(B.belegt(h.day()), 212000); assert.equal(h.day().frozen, null);
      await B.nichtGesendet(ticket, { kiNichtGesendet: true }, h.deps);
      assert.equal(B.belegt(h.day()), 212000, "Ungeklaerte Aufrufe werden nicht nachtraeglich kostenlos");
      const more = await Promise.allSettled(Array.from({ length: 40 }, () => B.reserviere(ARGS, h.deps)));
      assert.equal(more.filter(r => r.status === "fulfilled").length, 17);
      assert.equal(B.belegt(h.day()), 3816000);
      await assert.rejects(B.reserviere(ARGS, h.deps), { reason: "test-usd-grenze-erreicht" });
    }
  });
  await test("Belegte Ueberschreitung der reservierten Modellgrenzen stoppt weiterhin global", async () => {
    for (const receipt of [{ ...RECEIPT, completionTokens: 3001 },
      { ...RECEIPT, promptTokens: 400001 }, { ...RECEIPT, model: "anderes-modell" }]) {
      const h = fixture(), ticket = await B.reserviere(ARGS, h.deps);
      await assert.rejects(B.abschliessen(ticket, receipt, h.deps), { code: "TEST_USD_UNKNOWN" });
      await assert.rejects(B.reserviere(ARGS, h.deps), { reason: "test-usd-fremde-sperre" });
      assert.equal(B.belegt(h.day()), 212000);
    }
  });
  await test("Prozessabbruch und alter eingefrorener Tag behalten jede Reserve nach Neustart", async () => {
    for (const legacy of [false, true]) {
      const h = fixture(), ticket = await B.reserviere(ARGS, h.deps);
      if (legacy) await h.storage.mutateAuthStore(s => { s[B.KEY][DAY].frozen = "test-usd-ausgang-unklar"; });
      else h.advance(300000);
      const before = h.day().calls[ticket.id].reserved;
      await B.reserviere(ARGS, h.deps);
      assert.equal(h.day().calls[ticket.id].status, "ungeklaert");
      assert.equal(h.day().calls[ticket.id].reserved, before);
      assert.equal(B.belegt(h.day()), 424000); assert.equal(h.day().frozen, null);
      if (legacy) assert.equal(h.day().fruehereSperre.grund, "test-usd-ausgang-unklar");
      const report = B.kontrolliere(h.read(), DAY, 1);
      assert.equal(report.gebundenUsd, 0.424); assert.equal(report.unbekannteVollstaendigReserviert, true);
      assert.equal(report.anbieterrechnung, false);
      assert.throws(() => B.kontrolliere(h.read(), DAY, 3), { reason: "test-usd-ungeklaerte-reserve-fehlt" });
    }
  });
  await test("Nur belegbar nicht gesendete Aufrufe geben ihre Geldreserve frei", async () => {
    const h = fixture(), ticket = await B.reserviere(ARGS, h.deps);
    await B.nichtGesendet(ticket, Error("unbekannt"), h.deps); assert.equal(B.belegt(h.day()), 212000);
    await B.nichtGesendet(ticket, { kiNichtGesendet: true }, h.deps); assert.equal(B.belegt(h.day()), 0);
    assert.equal(h.day().manualCalls, 1, "Versuch bleibt in der unveraenderten Historie gezaehlt");
  });
  await test("Mehr als 1000 Versuche und abgelaufene alte sechs Stunden sperren kein gedecktes Geld", async () => {
    const h = fixture();
    for (let i = 0; i < 1001; i++) {
      const ticket = await B.reserviere({ ...ARGS, runId: "nachlauf500-" + (100000 + i) }, h.deps);
      await B.abschliessen(ticket, RECEIPT, h.deps);
    }
    assert.equal(h.day().manualCalls, 1001); assert.equal(h.day().spent, 130130);
    await h.storage.mutateAuthStore(s => { s[B.KEY][DAY].manualUntil = "2026-09-09T18:00:00.000Z"; });
    h.advance(6 * 60 * 60 * 1000);
    await B.reserviere(ARGS, h.deps);
    assert.equal(h.day().manualCalls, 1002); assert(B.belegt(h.day()) < B.LIMIT_MICRO_USD);
    assert.equal(B.konfiguration(ENV).maxManualCalls, null);
    assert.equal(B.konfiguration(ENV).maxWindowMs, null);
  });
  await test("Unbestaetigter Speicher verhindert Reservierung; korrumpierter Geldstand sperrt", async () => {
    const h = fixture(); h.fail = true;
    await assert.rejects(B.reserviere(ARGS, h.deps), { reason: "test-usd-reservierung-nicht-bestaetigt" });
    h.fail = false; const t = await B.reserviere(ARGS, h.deps); await B.abschliessen(t, RECEIPT, h.deps);
    await h.storage.mutateAuthStore(s => { s[B.KEY][DAY].spent = 0; });
    await assert.rejects(B.reserviere(ARGS, h.deps), { reason: "test-usd-buch-unlesbar" });
  });
  await test("Echter KI Einstieg reserviert vor HTTP und erhaelt unbekannte Kosten bei neuer Arbeit", async () => {
    const https = require("node:https"), storage = require("../lib/helmut/storage");
    const anbieter = require("../lib/helmut/anbieter-steuerung"), ai = require("../lib/helmut/ai");
    const old = { env: { ...process.env }, request: https.request, mutate: storage.mutateAuthStore,
      counter: storage.leseLlmTageszaehler, reserve: storage.reserveLlmCall, record: storage.recordLlmUsage,
      anbieter: anbieter.steuerungAktiv };
    let requests = 0, missing = false;
    const h = fixture();
    try {
      Object.assign(process.env, ENV, { AZURE_OPENAI_ENDPOINT: "https://offline.openai.azure.com",
        AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini" });
      storage.mutateAuthStore = h.storage.mutateAuthStore;
      storage.leseLlmTageszaehler = h.storage.leseLlmTageszaehler;
      storage.reserveLlmCall = async () => ({ allowed: true });
      anbieter.steuerungAktiv = () => false;
      storage.recordLlmUsage = async () => missing ? null : RECEIPT;
      https.request = (_url, _opts, cb) => {
        requests++;
        const today = new Date().toISOString().slice(0, 10), t = h.read()[B.KEY][today];
        assert(Object.values(t.calls).some(c => c.status === "reserviert"), "Bestaetigte Reserve VOR HTTP");
        const req = new EventEmitter(); req.write = () => {}; req.destroy = () => {};
        req.end = () => setImmediate(() => {
          const res = new EventEmitter(); res.statusCode = 200; res.setEncoding = () => {};
          cb(res); res.emit("data", JSON.stringify({ status: "completed", usage: { input_tokens: 100, output_tokens: 20 },
            output: [{ content: [{ type: "output_text", text: '{"ok":true}' }] }] })); res.emit("end");
        }); return req;
      };
      assert.deepEqual(await ai.requestStructuredJson("offline", { type: "object" }, { runId: ARGS.runId }), { ok: true });
      const today = new Date().toISOString().slice(0, 10);
      assert.equal(h.read()[B.KEY][today].spent, 130, "Ergebnis erst nach Abrechnung");
      missing = true;
      await assert.rejects(ai.requestStructuredJson("offline", {}, { runId: ARGS.runId }), { code: "TEST_USD_UNKNOWN" });
      missing = false;
      assert.deepEqual(await ai.requestStructuredJson("andere Arbeit", { type: "object" }, { runId: "nachlauf500-987654321" }), { ok: true });
      const current = h.read()[B.KEY][today];
      assert.equal(Object.values(current.calls).filter(c => c.status === "ungeklaert").length, 1);
      assert.equal(current.spent, 260);
      assert.equal(B.belegt(current), 212260, "Volle 3000 Token Reserve bleibt neben neuer Abrechnung gebunden");
      assert.equal(requests, 3, "Nur ausdrueckliche neue Aufrufe, kein automatischer Retry");
    } finally {
      https.request = old.request; storage.mutateAuthStore = old.mutate;
      storage.leseLlmTageszaehler = old.counter; storage.reserveLlmCall = old.reserve;
      storage.recordLlmUsage = old.record; anbieter.steuerungAktiv = old.anbieter;
      for (const key of Object.keys(process.env)) if (!(key in old.env)) delete process.env[key];
      Object.assign(process.env, old.env);
    }
  });
  console.log(`${count}/${count} Testkosten Gruppen bestanden. Kein Production Nachweis.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
