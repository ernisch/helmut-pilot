"use strict";

const assert = require("node:assert/strict");
const B = require("../lib/helmut/betriebskosten-budget");
const A = require("../lib/helmut/betriebskosten-abgleich");

const CONTRACT = { version: 1, profileId: "pilot-offline", startsAt: "2026-11-05T00:00:00.000Z",
  dailyLimitUsd: 1, totalLimitUsd: 30,
  route: { provider: "azure", responsesUrl: "https://offline.openai.azure.com/openai/v1/responses", model: "gpt-5-mini" } };
const ARGS = { model: CONTRACT.route.model, maxOutputTokens: 3000, actualRequestHash: "a".repeat(64),
  runtimeRouteSnapshot: { ...CONTRACT.route, authMode: "api-key" },
  meta: { callType: "understanding", pipelineStep: "understanding", politicianId: null,
    runId: "cron-offline", betriebskostenProfileId: CONTRACT.profileId } };

function fixture(nowIso = "2026-11-05T12:00:00.000Z") {
  let now = new Date(nowIso);
  const auth = { users: [], llmUsage: [] };
  let queue = Promise.resolve();
  const storage = {
    listFullProfiles: async () => [{ id: CONTRACT.profileId }],
    mutateAuthStore(change) {
      const p = queue.then(async () => {
        const copy = structuredClone(auth);
        const result = await change(copy);
        Object.keys(auth).forEach(k => delete auth[k]);
        Object.assign(auth, copy);
        return result;
      });
      queue = p.catch(() => {});
      return p;
    }
  };
  const deps = { storage, env: { [B.ENV]: JSON.stringify(CONTRACT) },
    now: () => new Date(+now) };
  return { auth, storage, deps, advance: ms => { now = new Date(+now + ms); },
    read: () => structuredClone(auth) };
}

let count = 0;
async function test(name, fn) { await fn(); count += 1; console.log(`PASS ${name}`); }

(async () => {
  await test("eindeutiger Beleg rechnet ab und gibt die Reserve frei", async () => {
    const f = fixture();
    const ticket = await B.reserviere(ARGS, f.deps);
    assert.equal(f.read()[B.KEY].calls[ticket.id].status, "reserviert");
    const beleg = { id: "usage-1", createdAt: new Date(+new Date("2026-11-05T12:00:01.000Z")).toISOString(),
      model: ticket.model, runId: ticket.runId, callType: ticket.callType, politicianId: ticket.politicianId,
      promptTokens: 100, completionTokens: 20, totalTokens: 120 };
    await f.storage.mutateAuthStore(a => { a.llmUsage.push(beleg); });

    const jetzt = Date.parse("2026-11-05T12:00:00.000Z") + A.DEFAULT_STALENESS_MS + 1;
    const { aktionen } = A.bewerteOffene(f.read()[B.KEY], f.read().llmUsage, { jetztMs: jetzt });
    assert.equal(aktionen.length, 1);
    assert.equal(aktionen[0].art, "abrechnen");

    const ergebnis = await A.wendeAn(f.storage, aktionen);
    assert.equal(ergebnis.abgerechnet, 1);
    const call = f.read()[B.KEY].calls[ticket.id];
    assert.equal(call.status, "abgerechnet");
    assert.equal(call.cost, 130); // 100/2 + 20*4 Mikro-USD
    assert.equal(call.usageReceiptId, "usage-1");
    assert.doesNotThrow(() => B.pruefeBuch(f.read()[B.KEY], f.read()[B.KEY].contract));
  });

  await test("Abgleich ist idempotent", async () => {
    const f = fixture();
    const ticket = await B.reserviere(ARGS, f.deps);
    const beleg = { id: "usage-1", createdAt: "2026-11-05T12:00:01.000Z", model: ticket.model,
      runId: ticket.runId, callType: ticket.callType, politicianId: ticket.politicianId,
      promptTokens: 100, completionTokens: 20, totalTokens: 120 };
    await f.storage.mutateAuthStore(a => { a.llmUsage.push(beleg); });
    const jetzt = Date.parse("2026-11-05T12:00:00.000Z") + A.DEFAULT_STALENESS_MS + 1;
    const erste = A.bewerteOffene(f.read()[B.KEY], f.read().llmUsage, { jetztMs: jetzt }).aktionen;
    await A.wendeAn(f.storage, erste);
    const zweite = A.bewerteOffene(f.read()[B.KEY], f.read().llmUsage, { jetztMs: jetzt }).aktionen;
    assert.equal(zweite.length, 0);
    const erneut = await A.wendeAn(f.storage, erste);
    assert.deepEqual(erneut, { abgerechnet: 0, ungeklaert: 0 });
  });

  await test("mehrdeutiger Beleg wird ehrlich ungeklaert statt geraten", async () => {
    const f = fixture();
    const ticket = await B.reserviere(ARGS, f.deps);
    const basis = { model: ticket.model, runId: ticket.runId, callType: ticket.callType,
      politicianId: ticket.politicianId, promptTokens: 100, completionTokens: 20, totalTokens: 120 };
    await f.storage.mutateAuthStore(a => {
      a.llmUsage.push({ ...basis, id: "usage-a", createdAt: "2026-11-05T12:00:01.000Z" });
      a.llmUsage.push({ ...basis, id: "usage-b", createdAt: "2026-11-05T12:00:02.000Z" });
    });
    const jetzt = Date.parse("2026-11-05T12:00:00.000Z") + A.DEFAULT_STALENESS_MS + 1;
    const { aktionen } = A.bewerteOffene(f.read()[B.KEY], f.read().llmUsage, { jetztMs: jetzt });
    assert.equal(aktionen[0].art, "ungeklaert");
    const ergebnis = await A.wendeAn(f.storage, aktionen);
    assert.equal(ergebnis.ungeklaert, 1);
    assert.equal(f.read()[B.KEY].calls[ticket.id].status, "ungeklaert");
    assert.doesNotThrow(() => B.pruefeBuch(f.read()[B.KEY], f.read()[B.KEY].contract));
  });

  await test("frische Reservierung wird nicht angefasst", async () => {
    const f = fixture();
    const ticket = await B.reserviere(ARGS, f.deps);
    const beleg = { id: "usage-1", createdAt: "2026-11-05T12:00:01.000Z", model: ticket.model,
      runId: ticket.runId, callType: ticket.callType, politicianId: ticket.politicianId,
      promptTokens: 100, completionTokens: 20, totalTokens: 120 };
    await f.storage.mutateAuthStore(a => { a.llmUsage.push(beleg); });
    const jetzt = Date.parse("2026-11-05T12:00:00.000Z") + 60 * 1000; // erst 1 Minute alt
    const { aktionen } = A.bewerteOffene(f.read()[B.KEY], f.read().llmUsage, { jetztMs: jetzt });
    assert.equal(aktionen.length, 0);
  });

  console.log(`\n${count} Abgleich-Gruppen bestanden. Ausschliesslich offline.`);
})();
