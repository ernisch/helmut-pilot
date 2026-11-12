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
// PostgreSQL JSONB erhaelt Objekt-Schluesselreihenfolgen nicht. Jede bestaetigte
// Fixture-Mutation durchlaeuft dieselbe Laengen-/Byteordnung, auch verschachtelt.
function jsonbRoundtrip(value) {
  if (Array.isArray(value)) return value.map(jsonbRoundtrip);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b)
    || Buffer.compare(Buffer.from(a), Buffer.from(b))).map(key => [key, jsonbRoundtrip(value[key])]));
}
function fixture(contract = CONTRACT, persisted = null) {
  let auth = jsonbRoundtrip(persisted || { users: [{ id: "historisch" }], llmUsage: [], synthetik500KostenAdmission: { expired: true },
    testKostenTage: { alt: { reserved: 123456 } } }), queue = Promise.resolve(), now = new Date("2026-11-05T12:00:00.000Z");
  const f = { fail: false, profiles: [{ id: contract.profileId }], read: () => structuredClone(auth),
    advance: ms => { now = new Date(+now + ms); }, storage: {
      listFullProfiles: async () => f.profiles,
      mutateAuthStore(change) {
        const p = queue.then(async () => {
          const copy = structuredClone(auth), result = await change(copy);
          if (f.fail) throw new Error("CAS unknown");
          auth = jsonbRoundtrip(copy); return result;
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
    assert.equal(B.aktiv({ [B.ZULASSUNG_ENV]: "{}" }), true);
    await assert.rejects(B.reserviere(ARGS, { env: { [B.ZULASSUNG_ENV]: "{}" } }), { reason: "betriebskosten-vertrag-ungueltig" });
    for (const c of [{ ...CONTRACT, dailyLimitUsd: 1.01 }, { ...CONTRACT, totalLimitUsd: 31 },
      { ...CONTRACT, startsAt: "ungueltig" }, { ...CONTRACT, route: { ...CONTRACT.route, model: "gpt-4.1" } },
      { ...CONTRACT, route: { ...CONTRACT.route, provider: "openai" } }])
      assert.throws(() => B.vertrag({ [B.ENV]: JSON.stringify(c) }));
    const f = fixture(); await B.reserviere(ARGS, f.deps);
    await assert.rejects(B.reserviere(ARGS, { ...f.deps,
      env: { [B.ENV]: JSON.stringify({ ...CONTRACT, totalLimitUsd: 29 }) } }));
    assert.equal(Object.keys(f.read()[B.KEY].calls).length, 1);
  });
  await test("JSONB-Schluesselordnung erhaelt Vertragshash, native Abrechnung und Reserven nach Neustart", async () => {
    const legacyHash = value => require("node:crypto").createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const f = fixture(), contract = B.vertrag(f.deps.env);
    assert.equal(contract.contractHash, legacyHash(CONTRACT), "Bestehendes Hashformat bleibt unveraendert");
    assert.equal(B.vertrag({ [B.ENV]: JSON.stringify(jsonbRoundtrip(CONTRACT)) }).contractHash, contract.contractHash);
    const args = { ...ARGS, meta: { callType: "understanding", pipelineStep: "understanding", politicianId: null,
      runId: "cron-offline", betriebskostenProfileId: CONTRACT.profileId } };
    const ticket = await B.reserviere(args, f.deps), receipt = await f.receipt(ticket);
    const { contractHash, ...storedContract } = f.read()[B.KEY].contract;
    assert.notEqual(legacyHash(storedContract), contractHash, "Fixture reproduziert den bisherigen JSONB-Hashfehler");
    await B.abschliessen(ticket, receipt, f.deps);
    await B.abschliessen(ticket, receipt, f.deps);
    assert.equal(f.read()[B.KEY].calls[ticket.id].cost, 130);
    const pending = await B.reserviere(args, f.deps), missing = await f.receipt(pending);
    await assert.rejects(B.abschliessen(pending, missing, { ...f.deps,
      providerUsage: { input_tokens: null, output_tokens: 20 } }), { code: "BETRIEBSKOSTEN_UNKNOWN" });
    const restarted = fixture(CONTRACT, f.read());
    assert.equal(B.pruefeBuch(restarted.read()[B.KEY], restarted.read()[B.KEY].contract).total, 212130);
    const next = await B.reserviere(args, restarted.deps);
    await B.abschliessen(next, await restarted.receipt(next), restarted.deps);
    assert.equal(restarted.read()[B.KEY].calls[pending.id].status, "ungeklaert");
    assert.equal(B.pruefeBuch(restarted.read()[B.KEY], restarted.read()[B.KEY].contract).total, 212260);
  });
  await test("Gespeicherte Vertragsinhalte und exakte Felder bleiben bei Reserve und Abschluss gebunden", async () => {
    for (const change of [c => { c.totalLimitUsd = 29; }, c => { c.additional = true; },
      c => { c.route.additional = true; }, c => { c.route.model = "gpt-5-mini-eu"; },
      c => { delete c.startsAt; }, c => { c.contractHash = "f".repeat(64); }]) {
      const f = fixture(), ticket = await B.reserviere(ARGS, f.deps), receipt = await f.receipt(ticket);
      await f.storage.mutateAuthStore(a => { change(a[B.KEY].contract); });
      const before = f.read();
      await assert.rejects(B.reserviere(ARGS, f.deps));
      await assert.rejects(B.abschliessen(ticket, receipt, f.deps), { code: "BETRIEBSKOSTEN_UNKNOWN" });
      assert.deepEqual(f.read(), before, "Manipulierte Vertraege erzeugen weder Reserve noch Geldfreigabe");
    }
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
  await test("Quellengebundene Bueroentwuerfe nutzen denselben Tages- und Gesamtdeckel", async () => {
    const f = fixture(), before = f.read();
    const args = { ...ARGS, meta: { callType: "communicationDraft", politicianId: CONTRACT.profileId, office: true } };
    for (const meta of [{ ...args.meta, office: false }, { ...args.meta, office: "true" },
      { ...args.meta, politicianId: "fremd" }, { ...args.meta, callType: "unbekannt" }])
      await assert.rejects(B.reserviere({ ...args, meta }, f.deps), { reason: "betriebskosten-profil-oder-aufgabe-gesperrt" });
    assert.deepEqual(f.read(), before, "Abgelehnte Aufgaben buchen und veraendern nichts");
    const ticket = await B.reserviere(args, f.deps);
    B.pruefeSendung(ticket, args, f.deps);
    await B.abschliessen(ticket, await f.receipt(ticket), f.deps);
    assert.equal(f.read()[B.KEY].calls[ticket.id].cost, 130);
    assert.equal(f.read()[B.KEY].contractHash, B.vertrag(f.deps.env).contractHash);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => B.reserviere(args, f.deps)));
    assert.equal(results.filter(x => x.status === "fulfilled").length, 4);
    assert(results.filter(x => x.status === "rejected").every(x => x.reason.reason === "betriebskosten-grenze-erreicht"));
    assert.equal(B.pruefeBuch(f.read()[B.KEY], f.read()[B.KEY].contract).total, 848130);
    for (const k of ["users", "synthetik500KostenAdmission", "testKostenTage"]) assert.deepEqual(f.read()[k], before[k]);
    const limited = fixture({ ...CONTRACT, totalLimitUsd: 1 });
    for (let i = 0; i < 4; i++) await B.reserviere(args, limited.deps);
    limited.advance(24 * 60 * 60 * 1000);
    const full = limited.read();
    await assert.rejects(B.reserviere(args, limited.deps), { reason: "betriebskosten-grenze-erreicht" });
    assert.deepEqual(limited.read(), full, "Ein Tageswechsel setzt das Gesamtbudget nicht zurueck");
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
  const syntheticProfile = id => ({ id, fullName: `Isoliertes Profil ${id}`, party: "SPD", faction: "SPD",
    parliamentType: "Bundestag", state: "Berlin", constituency: "Synthetischer Wahlkreis",
    committees: ["Ausschuss fuer Arbeit"], profileActive: true });
  function admit(f, ids = [CONTRACT.profileId, "synthetisch-zwei"]) {
    const c = B.vertrag(f.deps.env);
    f.deps.env[B.ZULASSUNG_ENV] = JSON.stringify({ version: 1, budgetContractHash: c.contractHash, profileIds: ids });
    f.profiles = ids.map(syntheticProfile);
    return B.zulassung(c, f.deps.env);
  }
  await test("Getrennte Zulassung behaelt Geldvertrag, Altbelege, offene Reserven und UTC-Verbrauch", async () => {
    const f = fixture(), settled = await B.reserviere(ARGS, f.deps);
    await B.abschliessen(settled, await f.receipt(settled), f.deps);
    const unknown = await B.reserviere(ARGS, f.deps);
    await assert.rejects(B.abschliessen(unknown, null, f.deps));
    const before = f.read()[B.KEY], c = B.vertrag(f.deps.env);
    const a = admit(f);
    assert.equal(B.vertrag(f.deps.env).contractHash, before.contractHash);
    assert.equal(B.pruefeBuch(f.read()[B.KEY], c).total, before.bound);
    const next = await B.reserviere({ ...ARGS, meta: { ...META, politicianId: "synthetisch-zwei" } }, f.deps);
    const after = f.read()[B.KEY];
    assert.deepEqual(after.calls[settled.id], before.calls[settled.id]);
    assert.deepEqual(after.calls[unknown.id], before.calls[unknown.id]);
    assert.deepEqual(after.contract, before.contract);
    assert.equal(next.zulassungHash, a.contractHash);
    assert.equal(after.bound, before.bound + next.reserved);
    await B.abschliessen(next, await f.receipt(next), f.deps);
    assert.equal(f.read()[B.KEY].bound, before.bound + 130);
  });
  await test("Mehrere Profile und globale Lektuere teilen atomar EIN unveraendertes Tagesbudget", async () => {
    const f = fixture(); admit(f);
    const global = { ...ARGS, meta: { politicianId: null, callType: "understanding", pipelineStep: "understanding",
      betriebskostenProfileId: CONTRACT.profileId, runId: "cron-offline" } };
    const attempts = Array.from({ length: 12 }, (_, i) => B.reserviere(i % 3 === 0 ? global
      : { ...ARGS, meta: { ...META, politicianId: i % 2 ? CONTRACT.profileId : "synthetisch-zwei" } }, f.deps));
    const outcomes = await Promise.allSettled(attempts);
    assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 4);
    assert.equal(f.read()[B.KEY].bound, 848000);
    assert.equal(Object.keys(f.read()[B.KEY].calls).length, 4);
    assert.equal(Object.keys(f.read()).filter(k => k === B.KEY).length, 1);
  });
  await test("Zulassung verlangt echten aktiven nutzbaren Bestand und lehnt fremde oder ausgeschlossene Profile ab", async () => {
    const f = fixture(); admit(f);
    const baseline = f.read();
    for (const profiles of [f.profiles.slice(0, 1), [...f.profiles, syntheticProfile("nicht-freigegeben")],
      f.profiles.map((p, i) => i ? { ...p, profileActive: false } : p),
      f.profiles.map((p, i) => i ? { ...p, party: "AfD", faction: "AfD" } : p),
      f.profiles.map((p, i) => i ? { id: p.id, profileActive: true } : p), null]) {
      f.profiles = profiles;
      await assert.rejects(B.reserviere(ARGS, f.deps), { kiNichtGesendet: true });
      assert.deepEqual(f.read(), baseline, "Abgelehnte Zulassung schreibt keine Reserve");
    }
    f.profiles = [syntheticProfile(CONTRACT.profileId), syntheticProfile("synthetisch-zwei")];
    await assert.rejects(B.reserviere({ ...ARGS, meta: { ...META, politicianId: "nicht-freigegeben" } }, f.deps));
    await assert.rejects(B.reserviere({ ...ARGS, meta: { ...META, tenantId: "synthetisch-zwei" } }, f.deps));
    const globalMeta = { politicianId: null, callType: "understanding", pipelineStep: "understanding",
      betriebskostenProfileId: CONTRACT.profileId, profileId: CONTRACT.profileId };
    await assert.rejects(B.reserviere({ ...ARGS, meta: globalMeta }, f.deps), { reason: "betriebskosten-profilbezug-abweichend" });
  });
  await test("Zulassungswechsel braucht keinen neuen Geldvertrag und bindet Sender an denselben Freigabestand", async () => {
    const f = fixture(), c = B.vertrag(f.deps.env); admit(f);
    const ticket = await B.reserviere(ARGS, f.deps);
    B.pruefeSendung(ticket, ARGS, f.deps);
    assert.throws(() => B.pruefeSendung(ticket,
      { ...ARGS, meta: { ...META, politicianId: "synthetisch-zwei" } }, f.deps), { reason: "betriebskosten-sender-abweichend" });
    admit(f, [CONTRACT.profileId]);
    assert.equal(B.vertrag(f.deps.env).contractHash, c.contractHash);
    assert.throws(() => B.pruefeSendung(ticket, ARGS, f.deps), { reason: "betriebskosten-sender-abweichend" });
    // Ein alter bereits gestarteter Versuch bleibt auch nach neuem Zulassungsstand abrechenbar.
    await B.abschliessen(ticket, await f.receipt(ticket), f.deps);
    assert.equal(f.read()[B.KEY].bound, 130);
    const before = f.read();
    for (const a of [{ version: 1, budgetContractHash: "f".repeat(64), profileIds: [CONTRACT.profileId] },
      { version: 1, budgetContractHash: c.contractHash, profileIds: [] },
      { version: 1, budgetContractHash: c.contractHash, profileIds: [CONTRACT.profileId, CONTRACT.profileId] },
      { version: 1, budgetContractHash: c.contractHash, profileIds: [CONTRACT.profileId], dailyLimitUsd: 2 }]) {
      f.deps.env[B.ZULASSUNG_ENV] = JSON.stringify(a);
      await assert.rejects(B.reserviere(ARGS, f.deps));
      assert.deepEqual(f.read(), before);
    }
  });
  await test("Echter AI-Einstieg reserviert vor HTTPS und verarbeitet native Usage fail closed", async () => {
    const https = require("node:https"), storage = require("../lib/helmut/storage");
    const control = require("../lib/helmut/anbieter-steuerung"), ai = require("../lib/helmut/ai");
    const oldEnv = { ...process.env }, old = { request: https.request, mutate: storage.mutateAuthStore,
      profiles: storage.listFullProfiles, reserve: storage.reserveLlmCall, record: storage.recordLlmUsage,
      control: control.steuerungAktiv, canSpend: storage.canSpendLlmForTenant };
    const f = fixture({ ...CONTRACT, startsAt: new Date(Date.now() - 60000).toISOString() });
    let requests = 0, native = USAGE, transportError = false, modelResponse = '{"ok":true}';
    const sentTickets = [];
    try {
      Object.assign(process.env, f.deps.env, { AZURE_OPENAI_KEY: "offline", AZURE_OPENAI_ENDPOINT: "https://offline.openai.azure.com",
        AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini", AZURE_OPENAI_UNDERSTANDING_DEPLOYMENT: "gpt-5-mini" });
      storage.mutateAuthStore = f.storage.mutateAuthStore; storage.listFullProfiles = f.storage.listFullProfiles;
      storage.reserveLlmCall = async () => ({ allowed: true }); control.steuerungAktiv = () => false;
      storage.canSpendLlmForTenant = async () => ({ allowed: true });
      storage.recordLlmUsage = async info => {
        const r = storage.buildLlmUsageRecord(info);
        await f.storage.mutateAuthStore(a => { a.llmUsage.push(r); });
        return { ...r, _ablage: { blob: true } };
      };
      https.request = (_url, _options, callback) => {
        requests++;
        const pending = Object.values(f.read()[B.KEY].calls).filter(t => t.status === "reserviert");
        assert.equal(pending.length, 1); sentTickets.push(pending[0].id);
        const req = new EventEmitter(); req.write = () => {}; req.destroy = () => {};
        req.end = () => setImmediate(() => {
          if (transportError) { req.emit("error", Object.assign(new Error("offline"), { code: "ETIMEDOUT" })); return; }
          const res = new EventEmitter(); res.statusCode = 200; res.setEncoding = () => {};
          callback(res); res.emit("data", JSON.stringify({ status: "completed", usage: native,
            output: [{ content: [{ type: "output_text", text: modelResponse }] }] })); res.emit("end");
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
      const calls = sentTickets.map(id => f.read()[B.KEY].calls[id]);
      assert.equal(calls[0].cost, 130); assert.equal(calls[1].status, "ungeklaert");
      assert.equal(calls[2].status, "ungeklaert"); assert.equal(calls[3].cost, 130);
      modelResponse = JSON.stringify({ text: require("./fixtures/office-format-beispiele").texts.internal_line
        .replace(/^- /, "- Synthetischer quellengebundener Büroauftrag: "), rationale: "Offlinepruefung" });
      const decision = { title: "Synthetischer Anlass", sources: [{ url: "https://example.test/original",
        summary: "Synthetischer Originalauszug als Grundlage fuer diesen Bueroauftrag." }] };
      const input = { office: true, decision, profile: { id: CONTRACT.profileId }, channel: "internal_line" };
      const draft = await ai.generateCommunicationDraft(input);
      assert.equal(draft.aiEnabled, true); assert.match(draft.text, /Synthetischer quellengebundener/);
      assert.equal(requests, 5);
      const officeCall = f.read()[B.KEY].calls[sentTickets[4]];
      assert.equal(officeCall.callType, "communicationDraft");
      assert.equal(officeCall.politicianId, CONTRACT.profileId); assert.equal(officeCall.cost, 130);
      const blocked = await ai.generateCommunicationDraft({ ...input, office: false });
      assert.equal(blocked.fallbackReason, "entwurf-nicht-freigegeben");
      const sourceless = await ai.generateCommunicationDraft({ ...input, decision: { title: decision.title } });
      assert.equal(sourceless.fallbackReason, "quellenbasis-fehlt");
      assert.equal(requests, 5, "Freier Prompt und unbelegter Anlass erreichen keinen Anbieter");
    } finally {
      https.request = old.request; storage.mutateAuthStore = old.mutate; storage.listFullProfiles = old.profiles;
      storage.reserveLlmCall = old.reserve; storage.recordLlmUsage = old.record; control.steuerungAktiv = old.control;
      storage.canSpendLlmForTenant = old.canSpend;
      for (const k of Object.keys(process.env)) if (!(k in oldEnv)) delete process.env[k]; Object.assign(process.env, oldEnv);
    }
  });
  console.log(`${count}/${count} Betriebskosten-Gruppen bestanden. Ausschliesslich offline.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
