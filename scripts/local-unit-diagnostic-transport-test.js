"use strict";

// Fully fictional byte fixtures and private-proof stand-ins. No original file,
// native database, execution authority or provider qualification is claimed.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const vm = require("node:vm"), Module = require("node:module"), crypto = require("node:crypto");
const root = path.resolve(__dirname, ".."), P = require("../lib/helmut/synthetik-500-profile");
const sha = b => crypto.createHash("sha256").update(b).digest("hex"), pin = b => ({ bytes: b.length, sha256: sha(b) });
let checks = 0, nativeHTTPSCalls = 0;
async function check(name, fn) { await fn(); checks++; process.stdout.write("PASS " + name + "\n"); }
function load(file, overrides = {}, extra = {}) {
  const filename = path.join(root, file), output = { exports: {} }, localRequire = Module.createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { module: output, exports: output.exports, Buffer, URL, Date,
    setTimeout, clearTimeout, setImmediate, clearImmediate, queueMicrotask, structuredClone, console,
    process: { env: {}, version: process.version }, ...extra,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : localRequire(name) }, { filename });
  return output.exports;
}
function fixture({ dBody = null, rBody = null, dResponse = null, responseStatus = 200, latencyMs = 1, mutateActual = null } = {}) {
  const bodies = { D: Buffer.from(dBody || JSON.stringify({ model: "gpt-5-mini-eu", input: "FICTIONAL D", max_output_tokens: 3000 })),
    R: Buffer.from(rBody || JSON.stringify({ model: "gpt-5-mini-eu", input: "FICTIONAL R", max_output_tokens: 6000 })) };
  const response = dResponse || JSON.stringify({ status: "completed", model: "gpt-5-mini-eu", usage: { input_tokens: 10, output_tokens: 4 },
    output: [{ content: [{ type: "output_text", text: '{"fictional":true}' }] }] });
  const sourceHandle = Object.freeze({}), source = { sourceIndex: 499, diagnosticUnit: 0, sourceDay: "2026-10-21" };
  const sourceSelection = { intents: [{ id: sha("original D") }, { id: sha("original R") }] };
  const command = { version: "helmut-local-unit-diagnostic-command/1", mode: "D-R-1-local-fixture", source,
    requestPins: { D: pin(bodies.D), R: pin(bodies.R) },
    slot: { plan: { operationId: "localUnitDiagnostic-" + "e".repeat(32), productionCommit: "c".repeat(40),
      intents: [{ maxOutputTokens: 3000 }, { maxOutputTokens: 6000 }] } } };
  const selection = { operationId: command.slot.plan.operationId, commandHash: P.hash(command) };
  const fakePin = name => ({ path: "/tmp/fictional-" + name + ".json", bytes: 1, sha256: sha(name) });
  const actual = { schema: "helmut-local-unit-diagnostic-transport-originals/1", selection, sourceHandle,
    originalPins: { preparedRequests: fakePin("prepared"), actualRequestBindings: fakePin("bindings"), providerFixtures: fakePin("provider") },
    phases: Object.fromEntries(["D", "R"].map((phase, i) => [phase, { sourceIntentId: sourceSelection.intents[i].id,
      requestBytes: bodies[phase], responseBytes: Buffer.from(response), latencyBytes: Buffer.from("FICTIONAL_LATENCY_" + phase),
      responseStatus, latencyMs }])) };
  if (mutateActual) mutateActual(actual);
  const proof = Object.freeze({}), tickets = new WeakSet(); let active = null, handle = null, clockAllowed = true;
  const sourceApi = { verifyCommandSource: (c, token) => { assert.equal(c, command); assert.equal(token, sourceHandle); },
    readSelection: token => { assert.equal(token, sourceHandle); return sourceSelection; } };
  const storage = { readLocalUnitDiagnosticTransportOriginals: async () => proof,
    consumeLocalUnitDiagnosticTransportOriginals: value => { assert.equal(value, proof); return actual; } };
  const scope = { currentVerified: () => active, transportHandle: () => { assert(active); return handle; },
    assertClock: () => { assert(clockAllowed, "closed actual unit window"); },
    assertTicket: ticket => assert(tickets.has(ticket), "opaque actual ticket required") };
  const transport = load("lib/helmut/local-unit-diagnostic-transport.js", {
    "./storage": storage, "./local-unit-diagnostic-source": sourceApi, "./local-unit-diagnostic-scope": scope
  });
  return { transport, command, selection, actual, storage, bodies, response, scope,
    prepare: async () => { handle = await transport.prepareOriginals(selection, command); return handle; },
    activate: () => { active = { command, selection }; }, close: () => { active = null; },
    expire: () => { clockAllowed = false; },
    ticket: phase => { const ticket = { admission: { phase, actualRequestHash: P.hash(JSON.parse(bodies[phase])) },
      execution: { version: "helmut-local-unit-diagnostic-execution/1", ...selection } }; tickets.add(ticket); return ticket; }
  };
}
function options(h, phase) { return { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": h.bodies[phase].length }, timeout: 20000 }; }
async function receive(h, phase, ticket = h.ticket(phase)) {
  const route = h.transport.route("gpt-5-mini-eu");
  return new Promise((resolve, reject) => {
    const request = h.transport.request(ticket, route.apiUrl, options(h, phase), response => {
      const bytes = []; response.on("data", b => bytes.push(Buffer.from(b))); response.on("end", () => resolve(Buffer.concat(bytes)));
      response.on("error", reject);
    });
    request.on("error", reject); request.write(h.bodies[phase]); request.end();
  });
}
async function transportTests() {
  await check("native original consumer is required before any capability exists", async () => {
    const transport = load("lib/helmut/local-unit-diagnostic-transport.js", { "./storage": {}, "./local-unit-diagnostic-source": {} });
    const h = fixture(); await assert.rejects(transport.prepareOriginals(h.selection, h.command), /native-original-consumer-missing/);
  });
  await check("data preparation grants no scope and JSON cannot forge its handle", async () => {
    const h = fixture(), handle = await h.prepare(); assert.equal(h.transport.active(), false);
    assert.throws(() => h.transport.verifyHandle({}, h.command));
    assert.throws(() => h.transport.verifyHandle(JSON.parse(JSON.stringify(handle)), h.command));
    assert.throws(() => h.transport.route("gpt-5-mini-eu"));
  });
  await check("unavailable full original responses and invalid UTF8 are rejected", async () => {
    for (const mutate of [a => { a.phases.D.responseBytes = null; }, a => { a.phases.R.latencyBytes = Buffer.from([255]); },
      a => { a.phases.D.sourceIntentId = sha("different original"); }, a => { a.originalPins = {}; }]) {
      const h = fixture({ mutateActual: mutate }); await assert.rejects(h.prepare());
    }
  });
  await check("active route has no credentials and no valid live HTTP protocol", async () => {
    const h = fixture(); await h.prepare(); h.activate(); const route = h.transport.route("gpt-5-mini-eu");
    assert(route.apiUrl.startsWith("local-unit-fixture://")); assert.equal(route.snapshot.provider, "local-fixture");
    assert.equal(Object.keys(route.authHeader).length, 0); assert.throws(() => h.transport.route("gpt-4.1"));
  });
  await check("canonical equality cannot replace exact original request bytes", async () => {
    const h = fixture(); await h.prepare(); h.activate(); const ticket = h.ticket("D"), route = h.transport.route("gpt-5-mini-eu");
    h.transport.assertSend(ticket, h.bodies.D.toString(), route);
    assert.throws(() => h.transport.assertSend(ticket, JSON.stringify(JSON.parse(h.bodies.D), null, 2), route), /actual-request-bytes/);
    assert.throws(() => h.transport.assertSend(structuredClone(ticket), h.bodies.D.toString(), route));
  });
  await check("D then R deliver only copied original bytes, with no repeat", async () => {
    const h = fixture(); await h.prepare(); h.activate();
    const r = h.ticket("R"), route = h.transport.route("gpt-5-mini-eu");
    assert.throws(() => h.transport.request(r, route.apiUrl, options(h, "R"), () => {}));
    const expected = Buffer.from(h.response); h.actual.phases.D.responseBytes.fill(88);
    assert((await receive(h, "D")).equals(expected)); assert((await receive(h, "R", r)).equals(expected));
    assert.throws(() => h.transport.request(h.ticket("D"), route.apiUrl, options(h, "D"), () => {}));
  });
  await check("late unit clock blocks new send but permits receipt identity checks", async () => {
    const h = fixture(); await h.prepare(); h.activate(); const ticket = h.ticket("D"), route = h.transport.route("gpt-5-mini-eu");
    h.expire(); assert.equal(h.transport.active(), true); h.transport.assertTicket(ticket);
    assert.throws(() => h.transport.route("gpt-5-mini-eu"));
    assert.throws(() => h.transport.assertSend(ticket, h.bodies.D.toString(), route));
    assert.throws(() => h.transport.request(ticket, route.apiUrl, options(h, "D"), () => {}));
  });
  await check("a destroyed request cannot later emit fixture bytes or reopen live HTTP", async () => {
    const h = fixture({ latencyMs: 5 }); await h.prepare(); h.activate(); let responses = 0;
    const route = h.transport.route("gpt-5-mini-eu");
    const request = h.transport.request(h.ticket("D"), route.apiUrl, options(h, "D"), () => { responses++; });
    request.write(h.bodies.D); request.end(); request.destroy();
    await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(responses, 0);
  });
}
async function aiTests() {
  function actualAI(h) {
    const receipts = new WeakMap(), calls = { reserves: 0, sends: 0, accounts: 0, globalReserves: 0 };
    let ai;
    const storage = { recordLocalUnitDiagnosticUsage: async (info, serviceTicket) => {
      const receipt = Object.freeze({}); receipts.set(receipt, { ticket: serviceTicket, info }); return receipt;
    }, recordLlmUsage: () => { throw Error("source usage must stay readonly"); },
    reserveLlmCall: async () => { calls.globalReserves++; throw Error("source counter must stay readonly"); } };
    const budget = { confirmedUsageReceipt: (receipt, ticket) => receipts.get(receipt)?.ticket === ticket,
      pruefeSendung: (ticket, hash, review, bytes) => {
        h.scope.assertTicket(ticket); assert.equal(P.hash(JSON.parse(bytes)), hash);
        assert(bytes.equals(h.bodies[ticket.admission.phase]));
      } };
    const costs = { reserviere: async request => {
      calls.reserves++; assert(Buffer.isBuffer(request.requestBytes));
      assert(request.requestBytes.equals(h.bodies[request.phase === "entwurf" ? "D" : "R"]));
      return h.ticket(request.phase === "entwurf" ? "D" : "R");
    }, nichtGesendet: async () => {}, abschliessen: async (ticket, receipt, internals) => {
      calls.accounts++; assert(budget.confirmedUsageReceipt(receipt, ticket));
      if (!internals.internalProviderCompletion) return null;
      const provenance = ai.readSynthetik500ProviderCompletion(internals.internalProviderCompletion);
      assert(provenance && provenance.ticket.execution.commandHash === h.selection.commandHash);
      return { outputHash: provenance.outputHash, providerResponseHash: provenance.providerResponseHash,
        providerTextHash: provenance.providerTextHash, sourceContext: provenance.sourceContext };
    } };
    ai = load("lib/helmut/ai.js", { https: { request: () => { nativeHTTPSCalls++; throw Error("LIVE HTTPS FORBIDDEN"); } },
      "./local-unit-diagnostic-transport": h.transport, "./storage": storage, "./testkosten-budget": costs,
      "./local-unit-diagnostic-budget": budget,
      "./briefing-speicher": { profilHash: profile => P.hash(profile) },
      "./local-unit-diagnostic-adapter": { beforeSend: async ticket => { h.scope.assertTicket(ticket); calls.sends++; } },
      "./lage-textqualitaet": load("lib/helmut/lage-textqualitaet.js", {
        "./synthetik-500-local-calendar": { sourceViewDate: () => new Date("2026-10-21T10:00:00.000Z") }
      }),
      "./anbieter-steuerung": { steuerungAktiv: () => { throw Error("external provider state must stay readonly"); } }
    });
    return { ai, calls };
  }
  const schema = { type: "object" }, options = { strict: true, reasoningEffort: "low", maxOutputTokens: 3000 };
  const body = JSON.stringify({ model: "gpt-5-mini-eu", input: "FICTIONAL ONLY", max_output_tokens: 3000,
    reasoning: { effort: "low" }, text: { format: { type: "json_schema", name: "knowledge_object", schema, strict: true } } });
  await check("actual AI payload/parser use scoped credentials-free transport and own receipts", async () => {
    const h = fixture({ dBody: body }); await h.prepare(); h.activate(); const { ai, calls } = actualAI(h);
    assert.equal(ai.isAiEnabled(), true); assert.equal(ai.activeModelName(), "gpt-5-mini-eu");
    assert.equal(ai.understandingModelName(), "gpt-5-mini-eu"); assert.equal(ai.aiProviderName(), "local-fixture");
    const result = await ai.requestStructuredJson("FICTIONAL ONLY", schema,
      { callType: "lageBriefing", testKostenPhase: "entwurf" }, undefined, options);
    assert.equal(result.fictional, true); assert.equal(calls.reserves, 1); assert.equal(calls.sends, 1);
    assert.equal(calls.accounts, 1); assert.equal(calls.globalReserves, 0);
  });
  await check("actual AI HTTP400 cannot invoke its legacy model fallback", async () => {
    const h = fixture({ dBody: body, responseStatus: 400 }); await h.prepare(); h.activate(); const { ai, calls } = actualAI(h);
    await assert.rejects(ai.requestStructuredJson("FICTIONAL ONLY", schema,
      { callType: "lageBriefing", testKostenPhase: "entwurf" }, undefined, options), /HTTP 400/);
    assert.equal(calls.reserves, 1); assert.equal(calls.sends, 1); assert.equal(calls.accounts, 1);
  });
  await check("actual AI D-completion still comes from its private provider-end chain", async () => {
    const sources = [{ vorgang_id: "vg-fictional", quellenbelege: [{ quelle_id: "q-fictional", url: "https://example.org/fictional",
      titel: "Die Quelle berichtet ueber einen Entwurf. Ein Termin ist noch nicht benannt.", quelle: "Offlinefixture" }] }];
    const profile = { id: "fictional-owner", committees: ["Arbeit und Soziales"] };
    const raw = { paragraphs: ["Die Quelle berichtet ueber einen Entwurf.", "Ein Termin ist noch nicht benannt."].map(text => ({
      text, vorgang_ids: ["vg-fictional"], quelle_id: "q-fictional",
      auswahlbegruendung: "Institutionelle Passung zum Ausschuss Arbeit und Soziales.",
      mandatsbezug: { feld: "ausschuss", wert: "Arbeit und Soziales" } })) };
    const h = fixture(); const { ai, calls } = actualAI(h);
    const meta = { politicianId: profile.id, runId: "nachlauf500-1792605600000", briefingDatum: "2026-10-21T10:00:00.000Z" };
    const draftSchema = structuredClone(ai.LAGE_BRIEFING_SCHEMA);
    delete draftSchema.properties.paragraphs.minItems; delete draftSchema.properties.paragraphs.maxItems;
    const dBody = JSON.stringify(ai.responsesPayload(ai.buildLageBriefingPrompt(sources, profile, meta), "gpt-5-mini-eu",
      { jsonSchema: draftSchema, jsonSchemaName: "knowledge_object", maxOutputTokens: 3000, strictJsonSchema: true, reasoningEffort: "low" }));
    const dResponse = JSON.stringify({ status: "completed", model: "gpt-5-mini-eu", usage: { input_tokens: 10, output_tokens: 4 },
      output: [{ content: [{ type: "output_text", text: JSON.stringify(raw) }] }] });
    const actual = fixture({ dBody, dResponse }); await actual.prepare(); actual.activate(); const real = actualAI(actual);
    const stop = new Error("synthetic-before-R"); stop.name = "DirektAbbruch"; let completion = null;
    await assert.rejects(real.ai.generateLageBriefing(sources, profile, { ...meta,
      onDraft: async value => { completion = real.ai.readSynthetik500DraftCompletion(value); return null; },
      beforeReview: async () => { throw stop; } }), error => error === stop);
    assert(completion && completion.outputHash === P.hash(raw));
    assert.equal(real.ai.readSynthetik500DraftCompletion(structuredClone(raw)), null);
    assert.equal(real.calls.reserves, 1); assert.equal(real.calls.accounts, 1);
    assert.equal(calls.reserves, 0);
  });
}
transportTests().then(aiTests).then(() => {
  assert.equal(nativeHTTPSCalls, 0);
  process.stdout.write(JSON.stringify({ syntheticChecks: checks, nativeHTTPSCalls, databaseCalls: 0, actualProviderCalls: 0,
    executionAuthority: false, nativeQualification: false, full500Accepted: false }) + "\n");
}).catch(error => { console.error(error); process.exitCode = 1; });
