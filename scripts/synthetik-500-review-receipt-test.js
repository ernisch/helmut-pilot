"use strict";

// Neue C-Naht: echte AI-/Geld-/Readback-Funktionen, nur isolierte CAS- und
// Immutable-History-Fixture plus HTTPS-Stub. Kein nativer Vertrag wird behauptet.
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const https = require("node:https");
const P = require("../lib/helmut/synthetik-500-profile");
const A = require("../lib/helmut/synthetik-500-kosten-admission");
const R = require("../lib/helmut/synthetik-500-review-receipt");
const K = require("../lib/helmut/testkosten-budget");
const D = require("../lib/helmut/lage-entwurfsbeleg");
const storage = require("../lib/helmut/storage");
const ai = require("../lib/helmut/ai");
const Q = require("../lib/helmut/lage-textqualitaet");
const provider = require("../lib/helmut/anbieter-steuerung");
const OWNER = "test-kohorte-synthetik-bt-001", RUN = "nachlauf500-1790935200000", COMMIT = "c".repeat(40);
const PROFILE = { id: OWNER, committees: ["Arbeit und Soziales"] };
const SOURCES = [{ vorgang_id: "vg-fictional", quellenbelege: [{ quelle_id: "q-fictional", url: "https://example.org/fictional",
  titel: "Die Quelle berichtet ueber einen Entwurf. Ein Termin ist noch nicht benannt.", quelle: "Offlinefixture" }] }];
const RAW = { paragraphs: ["Die Quelle berichtet ueber einen Entwurf.", "Ein Termin ist noch nicht benannt."].map(text => ({
  text, vorgang_ids: ["vg-fictional"], quelle_id: "q-fictional",
  auswahlbegruendung: "Institutionelle Passung zum Ausschuss Arbeit und Soziales.",
  mandatsbezug: { feld: "ausschuss", wert: "Arbeit und Soziales" } })) };
const REVIEW = { pruefungen: RAW.paragraphs.map((p, absatz) => ({ absatz, quelle_id: "q-fictional", belegfeld: "titel",
  vollstaendig_belegt: true, themenrein: true, profilbezug: true, textart: "konkreter_sachverhalt",
  pruefbegruendung: "Fiktiver Vorschlag mit Quellenbeleg.",
  mandatsbegruendung: "Der benannte Vorschlag betrifft die fachliche Aufgabe des Ausschusses Arbeit und Soziales." })),
  vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
    pruefbegruendung: "Der zweite Absatz nennt den noch offenen Termin." }] };
const SCHEMA = { type: "object" }, clone = x => structuredClone(x);
const INPUT = P.hash({ profile: PROFILE, sources: SOURCES });
const ENV = { VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", HELMUT_PRODUCTION_COMMIT: COMMIT,
  AZURE_OPENAI_KEY: "offline-fixture-key", AZURE_OPENAI_ENDPOINT: "https://offline.openai.azure.com", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini" };
function fixture({ generation = true, tokens = 3000, v1 = false } = {}) {
  const start = new Date(Date.now() - 1000).toISOString(), day = start.slice(0, 10);
  const end = new Date(Math.min(Date.parse(start) + 3600000, Date.parse(day + "T23:59:59.999Z"))).toISOString();
  const meta = { politicianId: OWNER, runId: RUN, briefingDatum: start };
  const schema = generation ? clone(ai.LAGE_BRIEFING_SCHEMA) : SCHEMA;
  if (generation) { delete schema.properties.paragraphs.minItems; delete schema.properties.paragraphs.maxItems; }
  const prompt = generation ? ai.buildLageBriefingPrompt(SOURCES, PROFILE, meta) : "OFFLINE-D";
  const body = JSON.stringify({ model: "gpt-5-mini", input: prompt, max_output_tokens: 3000, reasoning: { effort: "low" },
    text: { format: { type: "json_schema", name: "knowledge_object", schema, strict: true } } });
  const make = descriptor => ({ id: A.intentHash(RUN, descriptor), ...descriptor });
  const d = make({ phase: "D", owner: OWNER, inputVersionHash: INPUT, actualRequestHash: A.requestHash(body),
    model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 });
  const rule = { version: R.RULE_VERSION, reasoningEffort: tokens === 6000 ? "medium" : "low" };
  const r = make({ phase: "R", owner: OWNER, inputVersionHash: null, actualRequestHash: null, dependsOn: d.id,
    contextVersionHash: INPUT, model: "gpt-5-mini", maxOutputTokens: tokens, attemptLimit: 1,
    ...(!v1 ? { reviewRule: rule } : {}) });
  const plan = { version: v1 ? A.PLAN_VERSION : A.REVIEW_PLAN_VERSION, operationId: "synthetik500-review-offline-20261002",
    runId: RUN, productionCommit: COMMIT, runtimeManifestHash: P.hash("fictional-runtime"), startsAtUTC: start, endsAtUTC: end, intents: [d, r] };
  let state = { llmUsage: [], users: [{ id: "unrelated-fixture" }],
    [K.AUFTRAG_KEY]: { version: 3, id: "offline-order", abTag: day, limit: 7000000, externGebunden: 0 },
    [A.KEY]: { version: v1 ? A.VERSION : A.REVIEW_VERSION, plan, planHash: P.hash(plan), consumed: {},
      ...(!v1 ? { draftCompletions: {}, reviewBindings: {}, reviewBindingsHash: P.hash({}) } : {}) } };
  let queue = Promise.resolve(), serial = 0, clock = Date.parse(start), callbackRuns = 0;
  const rows = new Map(), history = new Map(), bodies = [];
  const contract = { version: R.STORAGE_VERSION, contractHash: P.hash("offline-enforced-immutable-history-only") };
  const h = { failCost: false, forgeUsage: false, lostCommit: false, corruptImmutable: false, contractMissing: false, conflict: false,
    d, r, rule, prompt, schema, meta, day, start, end, rows, history, bodies, contract,
    read: () => clone(state), mutate: fn => fn(state), advance: ms => { clock += ms; }, callbackRuns: () => callbackRuns };
  h.storage = {
    readAuthStore: async () => h.read(),
    leseLlmTageszaehler: async () => ({ ok: true, used: 0 }),
    mutateAuthStore: fn => {
      const pending = queue.then(async () => {
        let working = h.read(); callbackRuns++; let result = await fn(working);
        if (h.conflict) { h.conflict = false; working = h.read(); callbackRuns++; result = await fn(working); }
        state = working;
        if (h.lostCommit) { h.lostCommit = false; throw Error("fixture-commit-response-lost"); }
        return result;
      }); queue = pending.catch(() => {}); return pending;
    },
    recordLlmUsage: async info => {
      const record = storage.buildLlmUsageRecord(info, { id: "fixture-usage-" + (++serial), createdAt: new Date(clock).toISOString() });
      if (h.failCost) return null;
      if (!h.forgeUsage) await h.storage.mutateAuthStore(auth => { auth.llmUsage.unshift(record); });
      return { ...record, _ablage: { blob: true } };
    },
    reserveLlmCall: async () => ({ allowed: true }),
    insertLageEntwurfsbeleg: async entry => {
      if (rows.has(entry.id)) return { saved: false, reason: "existing-result" };
      rows.set(entry.id, clone(entry)); return { saved: true, id: entry.id };
    },
    getLageEntwurfsbeleg: async (owner, id) => {
      const row = rows.get(id); assert.ok(!row || row.user_id === owner); return row ? clone(row) : null;
    },
    synthetik500ReviewStorageContract: () => h.contractMissing ? null : contract,
    storeSynthetik500ImmutableDraft: async (entry, completion, contractHash) => {
      assert.equal(contractHash, contract.contractHash); assert.equal(completion.outputHash, P.hash(entry.payload.antwort));
      const versionHash = P.hash(entry), key = entry.id + ":" + versionHash;
      if (!history.has(key)) history.set(key, clone(entry));
      assert.equal(P.hash(history.get(key)), versionHash); // Anlegen/Retention, kein Ersatz/DELETE.
      return { id: entry.id, versionHash, contractHash };
    },
    getSynthetik500ImmutableDraft: async (owner, id, hash, contractHash) => {
      assert.equal(contractHash, contract.contractHash); const row = clone(history.get(id + ":" + hash));
      assert.equal(row.user_id, owner); if (h.corruptImmutable) row.payload.antwort.paragraphs[0].text += " DRIFT";
      return row;
    }
  };
  h.deps = { storage: h.storage, env: ENV, now: () => new Date(clock), id: () => "fixture-ticket-" + (++serial) };
  h.admission = { operationId: plan.operationId, planHash: P.hash(plan) };
  h.dMeta = { callType: "lageBriefing", politicianId: OWNER, runId: RUN, testKostenPhase: "entwurf",
    costAdmission: h.admission, costInputVersionHash: INPUT };
  h.reserveArgs = receipt => ({ model: "gpt-5-mini", maxOutputTokens: tokens, runId: RUN, politicianId: OWNER, phase: "pruefung",
    admission: h.admission, inputVersionHash: INPUT, actualRequestHash: P.hash(JSON.parse(reviewBody(h))), reviewReceipt: receipt });
  return h;
}
function reviewBody(h) {
  return JSON.stringify({ model: "gpt-5-mini", input: ai.prepareLageReviewInput(RAW, SOURCES, PROFILE).prompt,
    max_output_tokens: h.r.maxOutputTokens, reasoning: { effort: h.rule.reasoningEffort },
    text: { format: { type: "json_schema", name: "knowledge_object", schema: Q.SCHEMA, strict: true } } });
}
async function withFixture(h, fn, { status = "completed", output = RAW } = {}) {
  const env = { ...process.env }, oldRequest = https.request, oldActive = provider.steuerungAktiv;
  const old = Object.fromEntries(Object.keys(h.storage).map(k => [k, storage[k]]));
  try {
    Object.assign(process.env, ENV); Object.assign(storage, h.storage); provider.steuerungAktiv = () => false;
    https.request = (_url, _options, cb) => {
      const req = new EventEmitter(); req.destroy = () => {};
      req.write = body => {
        const slot = h.read()[A.KEY]; assert.ok(Object.keys(slot.consumed).length >= 1, "Consumption vor Sendung"); h.bodies.push(body);
      };
      req.end = () => setImmediate(() => {
        const res = new EventEmitter(); res.statusCode = 200; res.setEncoding = () => {}; res.destroy = () => {};
        cb(res); res.emit("data", JSON.stringify({ status, usage: { input_tokens: 100, output_tokens: 20 },
          output: [{ content: [{ type: "output_text", text: typeof output === "string" ? output : JSON.stringify(h.bodies.length > 1 ? REVIEW : output) }] }] })); res.emit("end");
      }); return req;
    };
    return await fn();
  } finally {
    https.request = oldRequest; provider.steuerungAktiv = oldActive; Object.assign(storage, old);
    for (const k of Object.keys(process.env)) if (!Object.hasOwn(env, k)) delete process.env[k]; Object.assign(process.env, env);
  }
}
async function completedDraft(h) {
  let raw, save;
  const stopped = new Error("offline-before-review"); stopped.name = "DirektAbbruch";
  try {
    await ai.generateLageBriefing(SOURCES, PROFILE, { ...h.meta, costAdmission: h.admission, costInputVersionHash: INPUT,
      onDraft: async value => {
        raw = value; save = await D.speichere({ userId: OWNER, runId: RUN, phase: "entwurf", antwort: raw, quellen: SOURCES, profile: PROFILE });
        return save;
      }, beforeReview: async () => { throw stopped; } });
  } catch (error) { if (error !== stopped) throw error; }
  assert.ok(raw && save); return { raw, save };
}
const prepare = (h, x, overrides = {}) => R.prepareReview(x.raw, x.save, { sources: SOURCES, profile: PROFILE, owner: OWNER,
  runId: RUN, contextHash: INPUT, rule: h.rule, maxOutputTokens: h.r.maxOutputTokens, ...overrides });
async function nativeContractRemainsClosed() {
  // The dormant storage seam now delegates asynchronously to the guarded
  // native adapter. Exercise that real seam with fake Auth; no transport reads.
  const native = require("../lib/helmut/synthetik-500-native-d-store"), J = require("../lib/helmut/synthetik-500-dispatch-journal");
  const real = native.contract;
  let seamCalls = 0, authReads = 0, commandReads = 0, rpcCalls = 0;
  try {
    for (const state of [null, { state: "installed", stopRequested: false }, { state: "running", stopRequested: true }]) {
      native.contract = io => {
        seamCalls++; assert.equal(typeof io.auth, "function"); assert.equal(typeof io.command, "function"); assert.equal(typeof io.rpc, "function");
        return real({ auth: async () => {
          authReads++;
          return state ? { [J.KEY]: { version: J.VERSION, activeOperationId: "fictional-unclaimed",
            operations: { "fictional-unclaimed": { operationId: "fictional-unclaimed", units: [], attempts: {}, ...state } } } } : {};
        }, command: async () => { commandReads++; throw Error("fixture-forbidden-command-read"); },
        rpc: async () => { rpcCalls++; throw Error("fixture-forbidden-native-rpc"); } });
      };
      await assert.rejects(storage.synthetik500ReviewStorageContract(), /synthetik500-production-native-D-no-claim/);
    }
    assert.equal(seamCalls, 3); assert.equal(authReads, 3); assert.equal(commandReads, 0); assert.equal(rpcCalls, 0);
  } finally { native.contract = real; }
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
async function main() {
  await nativeContractRemainsClosed(); assert.equal(A.status().reviewAdmission, false);
  await test("Legacy-Entwurfsreadback bleibt bool; /1 wird nicht als neue R-Freigabe umgedeutet", async () => {
    const h = fixture({ v1: true });
    await withFixture(h, async () => {
      const x = await completedDraft(h); assert.deepEqual(x.save, { gespeichert: true });
      await assert.rejects(K.reserviere(h.reserveArgs({ trusted: true }), h.deps), /review-receipt-unimplemented/);
      assert.equal(h.bodies.length, 1);
    });
  });
  await test("Echter D-Provider/CAS/Readback liefert Completion und reale Identitaet, kein Callerbool", async () => {
    const h = fixture(); await withFixture(h, async () => {
      const x = await completedDraft(h), c = h.read()[A.KEY].draftCompletions[h.d.id];
      assert.equal(c.outputHash, P.hash(x.raw)); assert.equal(c.costMicroUsd, 130);
      assert.equal(x.save.identity.versionHash, P.hash(h.rows.get(x.save.identity.id)));
      await assert.rejects(prepare(h, { raw: x.raw, save: { gespeichert: true, identity: x.save.identity } }), /D-save-receipt-forged/);
      await assert.rejects(prepare(h, { raw: clone(x.raw), save: x.save }), /D-save-receipt-forged/);
      await assert.rejects(prepare(h, x, { owner: "foreign-owner" }), /D-save-receipt-forged/);
    });
  });
  await test("Fehlender tatsächlicher nativer Vertrag blockiert R vor Immutable-/Provideraufruf", async () => {
    const h = fixture(); h.contractMissing = true;
    await withFixture(h, async () => { const x = await completedDraft(h); await assert.rejects(prepare(h, x), /review-storage-contract-unavailable/);
      assert.equal(h.history.size, 0); assert.equal(h.bodies.length, 1); });
  });
  await test("Callback-Kostenbehauptung ohne echte Usagezeile und unbekannter Abschluss attestieren kein D", async () => {
    for (const flag of ["forgeUsage", "failCost"]) {
      const h = fixture(); h[flag] = true;
      await withFixture(h, async () => { await assert.rejects(completedDraft(h)); assert.deepEqual(h.read()[A.KEY].draftCompletions, {});
        assert.equal(h.bodies.length, 1); assert.equal(h.read()[K.KEY][h.day].calls[Object.keys(h.read()[K.KEY][h.day].calls)[0]].status, flag === "failCost" ? "ungeklaert" : "reserviert"); });
    }
  });
  await test("Unvollstaendige/unparsebare D-Antwort bleibt kostenwirksam aber ohne R-Provenienz", async () => {
    for (const options of [{ status: "incomplete" }, { output: "not-valid-JSON" }]) {
      const h = fixture(); await withFixture(h, async () => { await assert.rejects(completedDraft(h));
        assert.deepEqual(h.read()[A.KEY].draftCompletions, {}); assert.equal(h.bodies.length, 1); }, options);
    }
  });
  await test("Gespeicherte Vollversion, Parentoutput, Quellen und Profil dürfen nicht driften", async () => {
    const h = fixture(); await withFixture(h, async () => {
      const x = await completedDraft(h); h.corruptImmutable = true;
      await assert.rejects(prepare(h, x), /D-stored-version-drift/); h.corruptImmutable = false;
      await assert.rejects(prepare(h, x, { profile: { ...PROFILE, committees: ["Haushalt"] } }), /D-source-profile-drift/);
      x.raw.paragraphs[0].text += " DRIFT"; await assert.rejects(prepare(h, x), /D-save-receipt-forged/);
    });
  });
  await test("R-Binding/Reserve/Consumption atomar, immutable Planhash unveraendert, separater Bindinghash", async () => {
    const h = fixture(); await withFixture(h, async () => {
      const x = await completedDraft(h), prepared = await prepare(h, x), before = h.read()[A.KEY]; h.conflict = true;
      const count = h.callbackRuns(), ticket = await K.reserviere(h.reserveArgs(prepared.receipt), h.deps), slot = h.read()[A.KEY];
      assert.equal(h.callbackRuns(), count + 2); assert.equal(slot.planHash, before.planHash); assert.deepEqual(slot.plan, before.plan);
      assert.equal(slot.reviewBindingsHash, P.hash(slot.reviewBindings)); assert.equal(slot.reviewBindings[h.r.id].storedD.outputHash, P.hash(RAW));
      assert.equal(slot.consumed[h.r.id].ticketId, ticket.id); assert.equal(slot.consumed[h.r.id].reviewBindingHash, ticket.admission.reviewBindingHash);
      assert.doesNotThrow(() => A.pruefeSlot(slot)); assert.equal(h.bodies.length, 1);
    });
  });
  await test("Konkurrierende R-Reservierungen verbrauchen genau einmal, ein Gewinner bleibt sendbar", async () => {
    const h = fixture(); await withFixture(h, async () => {
      const prepared = await prepare(h, await completedDraft(h));
      const results = await Promise.allSettled([K.reserviere(h.reserveArgs(prepared.receipt), h.deps), K.reserviere(h.reserveArgs(prepared.receipt), h.deps)]);
      assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
      const ticket = results.find(x => x.status === "fulfilled").value;
      A.pruefeSendung(ticket, A.requestHash(reviewBody(h)), h.start, COMMIT, prepared.receipt);
      assert.throws(() => A.pruefeSendung(ticket, A.requestHash(reviewBody(h)), h.start, COMMIT, prepared.receipt), /R-sender-receipt-drift/);
      assert.equal(Object.keys(h.read()[A.KEY].reviewBindings).length, 1);
    });
  });
  await test("Nicht-Senden entlastet Geld, bewaehrt weder Intent noch R-Beleg erneut", async () => {
    const h = fixture(); await withFixture(h, async () => {
      const prepared = await prepare(h, await completedDraft(h)); const ticket = await K.reserviere(h.reserveArgs(prepared.receipt), h.deps);
      await K.nichtGesendet(ticket, ai.markiereNichtGesendet(new Error("offline-no-send")), h.deps);
      assert.throws(() => A.pruefeSendung(ticket, A.requestHash(reviewBody(h)), h.start, COMMIT, prepared.receipt), /R-sender-receipt-drift/);
      await assert.rejects(K.reserviere(h.reserveArgs(prepared.receipt), h.deps));
      const state = h.read(); assert.equal(state[K.KEY][h.day].calls[ticket.id].status, "nicht-gesendet");
      assert.equal(state[A.KEY].consumed[h.r.id].ticketId, ticket.id); assert.equal(state[A.KEY].reviewBindings[h.r.id].bindingHash, ticket.admission.reviewBindingHash);
    });
  });
  await test("Unbekannter R-CAS-Ausgang setzt nichts zurueck und erlaubt keinen erneuten Versuch", async () => {
    const h = fixture(); await withFixture(h, async () => {
      const prepared = await prepare(h, await completedDraft(h)); h.lostCommit = true;
      await assert.rejects(K.reserviere(h.reserveArgs(prepared.receipt), h.deps), /reservierung-nicht-bestaetigt/);
      await assert.rejects(K.reserviere(h.reserveArgs(prepared.receipt), h.deps));
      assert.equal(Object.keys(h.read()[A.KEY].reviewBindings).length, 1); assert.equal(h.bodies.length, 1);
    });
  });
  await test("R-Schema-/Payload-/Ticketdrift und freie Reviewreceipts bleiben vor Sender geschlossen", async () => {
    const h = fixture(); await withFixture(h, async () => {
      const prepared = await prepare(h, await completedDraft(h)), args = h.reserveArgs(prepared.receipt);
      await assert.rejects(K.reserviere({ ...args, reviewReceipt: { trusted: true } }, h.deps), /R-receipt-forged/);
      await assert.rejects(K.reserviere({ ...args, actualRequestHash: P.hash({ changedSchema: true }) }, h.deps), /R-payload-drift/);
      assert.equal(Object.keys(h.read()[A.KEY].reviewBindings).length, 0); assert.equal(h.bodies.length, 1);
    });
  });
  await test("Tatsächlicher D-Kostenausgang und UTC-Fenster werden unter frischem CAS erneut geprueft", async () => {
    for (const mode of ["cost", "UTC"]) {
      const h = fixture(); await withFixture(h, async () => {
        const prepared = await prepare(h, await completedDraft(h));
        if (mode === "cost") h.mutate(s => { s[K.KEY][h.day].calls[s[A.KEY].draftCompletions[h.d.id].dTicket.id].status = "ungeklaert"; });
        else h.advance(Date.parse(h.end) - Date.parse(h.start));
        await assert.rejects(K.reserviere(h.reserveArgs(prepared.receipt), h.deps)); assert.equal(Object.keys(h.read()[A.KEY].reviewBindings).length, 0);
      });
    }
  });
  await test("Echter Generator benutzt gespeicherten D-Readback und exakt gebundenen R-Body,3000/6000 bleiben", async () => {
    for (const tokens of [3000, 6000]) {
      const h = fixture({ generation: true, tokens }); await withFixture(h, async () => {
        const result = await ai.generateLageBriefing(SOURCES, PROFILE, { ...h.meta, costAdmission: h.admission,
          costInputVersionHash: INPUT, pruefaufwandNachweis: tokens === 6000, beforeReview: async () => {},
          onDraft: raw => D.speichere({ userId: OWNER, runId: RUN, phase: "entwurf", antwort: raw, quellen: SOURCES, profile: PROFILE }) });
        assert.equal(result.paragraphs.length, 2); assert.equal(h.bodies.length, 2); assert.equal(h.bodies[1], reviewBody(h));
        assert.equal(JSON.parse(h.bodies[1]).max_output_tokens, tokens);
        assert.equal(JSON.parse(h.bodies[1]).reasoning.effort, tokens === 6000 ? "medium" : "low");
        assert.equal(h.read()[A.KEY].planHash, h.admission.planHash); assert.equal(A.status().reviewAdmission, false);
      });
    }
  });
  await test("Freier onDraft-Callback attestiert kein D; fixe6000-Regel kann keine Qualitaet absenken", async () => {
    const h = fixture({ generation: true }); await withFixture(h, async () => {
      await assert.rejects(ai.generateLageBriefing(SOURCES, PROFILE, { ...h.meta, costAdmission: h.admission,
        costInputVersionHash: INPUT, onDraft: async () => ({ gespeichert: true, trusted: true }) }), /D-save-receipt-forged/);
      assert.equal(h.bodies.length, 1); assert.equal(h.history.size, 0); assert.equal(Object.keys(h.read()[A.KEY].reviewBindings).length, 0);
    });
    const f = fixture({ tokens: 6000 }), slot = f.read()[A.KEY]; slot.plan.intents[1].reviewRule.reasoningEffort = "low";
    slot.plan.intents[1].id = A.intentHash(RUN, slot.plan.intents[1]); slot.planHash = P.hash(slot.plan);
    assert.throws(() => A.pruefeSlot(slot), /r-derivation-rule/);
  });
  await nativeContractRemainsClosed(); assert.equal(A.status().reviewAdmission, false);
  console.log("synthetik500-review-receipt: " + passed + "/" + passed + " neue Offlinefälle;0 echte Provider/DB/Native-Aufrufe;ProductionRgeschlossen");
  return { passed, productionReviewAdmission: false };
}
async function criticalMain() {
  await test("Keine Export-Mintautoritaet: freie Tickets/JSON/Kostenzeile ohne HTTPS-Ende attestieren kein D", async () => {
    for (const name of ["providerCompletion", "buildCompletion", "confirmCompletion", "attachOutput", "savedDraft"])
      assert.equal(R[name], undefined);
    assert.equal(ai.readSynthetik500ProviderCompletion(Object.freeze({})), null);
    assert.equal(ai.readSynthetik500DraftCompletion(clone(RAW)), null);
    assert.equal(D.readSynthetik500StoredDraftReceipt({ gespeichert: true, trusted: true }), null);
    const h = fixture(); await withFixture(h, async () => {
      const ticket = await K.reserviere({ model: "gpt-5-mini", maxOutputTokens: 3000, runId: RUN, politicianId: OWNER,
        phase: "entwurf", admission: h.admission, inputVersionHash: INPUT, actualRequestHash: h.d.actualRequestHash }, h.deps);
      const usage = await storage.recordLlmUsage({ model: "gpt-5-mini", success: true, runId: RUN, politicianId: OWNER,
        usage: { input_tokens: 100, output_tokens: 20 } });
      await assert.rejects(K.abschliessen(ticket, usage, { ...h.deps, internalProviderCompletion: Object.freeze({}) }), /abschluss-nicht-bestaetigt/);
      assert.deepEqual(h.read()[A.KEY].draftCompletions, {}); assert.equal(h.bodies.length, 0);
      const forgedRaw = clone(RAW), save = await D.speichere({ userId: OWNER, runId: RUN, phase: "entwurf",
        antwort: forgedRaw, quellen: SOURCES, profile: PROFILE });
      assert.deepEqual(save, { gespeichert: true });
      await assert.rejects(prepare(h, { raw: forgedRaw, save }), /D-save-receipt-forged/);
    });
    // Selbst ein echter generischer Structured-JSON-Aufruf hat keinen privaten
    // Lage-Promptkontext und kann diesen Herkunftsvertrag nicht nachtraeglich minten.
    const generic = fixture(); await withFixture(generic, async () => {
      const raw = await ai.requestStructuredJson(generic.prompt, generic.schema, generic.dMeta, "gpt-5-mini",
        { strict: true, reasoningEffort: "low", _completionSink: { trusted: true } });
      assert.equal(ai.readSynthetik500DraftCompletion(raw), null);
      assert.deepEqual(generic.read()[A.KEY].draftCompletions, {});
    });
  });
  await test("Ticketklon-Nicht-Senden stoppt Original und Klon; entfernte Admission entlastet keine R-Reserve", async () => {
    const h = fixture(); await withFixture(h, async () => {
      const x = await completedDraft(h);
      const injected = await D.speichere({ userId: OWNER, runId: RUN, phase: "entwurf", antwort: x.raw,
        quellen: SOURCES, profile: PROFILE }, h.storage);
      assert.deepEqual(injected, { gespeichert: true });
      assert.equal(D.readSynthetik500StoredDraftReceipt(injected), null);
      const prepared = await prepare(h, x), ticket = await K.reserviere(h.reserveArgs(prepared.receipt), h.deps);
      const stripped = clone(ticket); delete stripped.admission;
      await assert.rejects(K.nichtGesendet(stripped, ai.markiereNichtGesendet(new Error("offline")), h.deps));
      assert.equal(h.read()[K.KEY][h.day].calls[ticket.id].status, "reserviert");
      await K.nichtGesendet(clone(ticket), ai.markiereNichtGesendet(new Error("offline")), h.deps);
      for (const candidate of [ticket, clone(ticket)]) assert.throws(() => A.pruefeSendung(candidate,
        A.requestHash(reviewBody(h)), h.start, COMMIT, prepared.receipt), /R-sender-receipt-drift/);
      const state = h.read(); assert.equal(state[K.KEY][h.day].calls[ticket.id].status, "nicht-gesendet");
      assert.equal(state[A.KEY].consumed[h.r.id].ticketId, ticket.id);
      assert.equal(Object.keys(state[A.KEY].reviewBindings).length, 1); assert.equal(h.bodies.length, 1);
    });
  });
  await test("Originaler Vor-HTTP-Profil-/Quellenkontext verhindert Rebinding; echte3000/6000-Kette bleibt gebunden", async () => {
    for (const mode of ["sources", "profile"]) {
      const h = fixture(), sources = clone(SOURCES), profile = clone(PROFILE);
      await withFixture(h, async () => {
        await assert.rejects(ai.generateLageBriefing(sources, profile, { ...h.meta, costAdmission: h.admission,
          costInputVersionHash: INPUT, onDraft: raw => {
            if (mode === "sources") sources[0].quellenbelege[0].titel += " Geaenderter Kontext nach D.";
            else profile.committees = ["Haushalt"];
            return D.speichere({ userId: OWNER, runId: RUN, phase: "entwurf", antwort: raw, quellen: sources, profile });
          } }), /lage-entwurfsbeleg-nicht-bestaetigt/);
        const c = h.read()[A.KEY].draftCompletions[h.d.id];
        assert.equal(c.sourceContext.sourcesHash, P.hash(SOURCES));
        assert.equal(c.sourceContext.profileHash, require("../lib/helmut/briefing-speicher").profilHash(PROFILE));
        assert.equal(h.bodies.length, 1); assert.equal(h.history.size, 0);
      });
    }
    for (const tokens of [3000, 6000]) {
      const h = fixture({ tokens }); await withFixture(h, async () => {
        const result = await ai.generateLageBriefing(SOURCES, PROFILE, { ...h.meta, costAdmission: h.admission,
          costInputVersionHash: INPUT, pruefaufwandNachweis: tokens === 6000, beforeReview: async () => {},
          onDraft: raw => D.speichere({ userId: OWNER, runId: RUN, phase: "entwurf", antwort: raw, quellen: SOURCES, profile: PROFILE }) });
        assert.equal(result.paragraphs.length, 2); assert.equal(h.bodies[1], reviewBody(h));
        assert.equal(h.read()[A.KEY].planHash, h.admission.planHash);
        assert.doesNotThrow(() => A.pruefeSlot(h.read()[A.KEY]));
      });
    }
    await nativeContractRemainsClosed(); assert.equal(A.status().reviewAdmission, false);
  });
  console.log("synthetik500-review-receipt-critical: " + passed + "/3 neue kritische Offlinefälle;0 echte Provider/DB/Native-Aufrufe;ProductionRgeschlossen");
}
async function allMain() { await main(); passed = 0; await criticalMain(); }
if (require.main === module) (process.argv.includes("--critical-only") ? criticalMain() : allMain())
  .catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main: allMain, criticalMain };
