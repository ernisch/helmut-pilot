"use strict";

// Genuine local RPC/storage/AI/EU completion seam. This separate synthetic
// Auth row is intentionally UNINSTALLED: no dispatch journal, profile, Unit,
// immutable-D contract or R authority is fabricated. Only HTTPS is simulated.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");
const https = require("node:https");
const { performance } = require("node:perf_hooks");
const IO = require("./auth-usage-split/support");

async function main(config) {
  assert(require.cache[require.resolve("./lokaler-netzschutz")], "atomic-eu-network-guard-preloaded");
  assert.deepEqual(require("./lokaler-netzschutz").pruefe(process.env), []);
  assert.equal(config.database, require("./fixtures/w15-atomic-integration-target.json").database);
  const local = new URL(config.gatewayUrl);
  assert.equal(local.protocol, "http:");assert.equal(local.hostname, "127.0.0.1");
  assert(!local.username && !local.password && !local.search && !local.hash);
  assert.match(config.commit, /^[a-f0-9]{40}$/);
  const sql = IO.sqlClient(config), literal = IO.literal;
  assert.equal(sql.json("begin read only;select to_jsonb(current_database());rollback;"), config.database);
  const active = () => sql.json("begin read only;select to_jsonb(count(*)) from public.mandate_profiles where aktiv;rollback;");
  assert.equal(active(), 0, "atomic-eu-requires-inactive-copy");
  const mainHash = () => sql.json("begin read only;select to_jsonb(encode(sha256(convert_to("
    + "public.helmut_auth_usage_read_v1(jsonb_build_object('id','main-auth'))::text,'UTF8')),'hex'));rollback;");
  const originalMainHash = mainHash();
  const rowId = "w15-eu-component-" + randomUUID();
  const originalEnv = { ...process.env }, originalRequest = https.request;
  Object.assign(process.env, { HELMUT_STORAGE_BACKEND: "supabase", SUPABASE_URL: config.gatewayUrl,
    SUPABASE_SERVICE_ROLE_KEY: config.token, HELMUT_SUPABASE_AUTH_STORE_ID: rowId,
    HELMUT_LLM_USAGE_STORAGE: "relational-atomic-v1", HELMUT_SOURCE_MODE: "off",
    VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: config.commit,
    VERCEL_URL: "helmut-w15-atomic-component-local.vercel.app", VERCEL_DEPLOYMENT_ID: "dpl_W15AtomicComponentOnly",
    HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", HELMUT_MAX_LLM_CALLS_PER_DAY: "2416",
    HELMUT_LLM_RESERVE_UNDERSTANDING: "702", HELMUT_TESTLAUF_VORRANG_REAL: "200",
    AZURE_OPENAI_ENDPOINT: "https://helmut-resource.openai.azure.com",
    AZURE_OPENAI_KEY: "LOCAL_MOCK_NOT_A_VALID_PROVIDER_KEY", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini-eu",
    HELMUT_UNDERSTANDING_MODEL: "gpt-5-mini-eu" });
  delete process.env.VERCEL;delete process.env.OPENAI_API_KEY;
  delete process.env.HELMUT_PRODUCTION_COMMIT;
  const EU = require("../lib/helmut/synthetik-500-eu-service-contract");
  Object.assign(process.env, { HELMUT_SYNTHETIK500_EU_SERVICE_CONTRACT: EU.HASH,
    HELMUT_SYNTHETIK500_EU_ORDER_RENEWAL: EU.ORDER_RENEWAL_HASH });
  // Do not disable enabled controls to make this test pass. The fresh process
  // must start with the existing default provider-rate flag unchanged/off.
  assert(!require("../lib/helmut/anbieter-steuerung").steuerungAktiv(), "atomic-eu-unexpected-provider-rate-configuration");
  assert(!require.cache[require.resolve("../lib/helmut/storage")], "atomic-eu-bind-target-before-storage-load");
  const S = require("../lib/helmut/storage"), P = require("../lib/helmut/synthetik-500-profile");
  const A = require("../lib/helmut/synthetik-500-kosten-admission"), K = require("../lib/helmut/testkosten-budget");
  const R = require("../lib/helmut/synthetik-500-review-receipt"), U = require("../lib/helmut/llm-usage-atomic");
  const ai = require("../lib/helmut/ai"), KO = require("../lib/helmut/knowledge-object-version");
  const observation = require("./synthetik-500-w15-full500-runtime").observeAuth(S, { expectedAuthRowId: rowId });
  const AuthReport = require("./fixtures/w15-auth-measurement-report");
  const originalRecord = S.recordLlmUsage, captured = [], bodies = [], checks = [];
  const check = (name, passed) => { assert(passed, name);checks.push(name); };
  const ownerIds = P.erzeuge().profile.map(p => p.mandatsId), owner = ownerIds[0];
  const now = new Date(), startsAtUTC = new Date(now.getTime() - 1000).toISOString(), day = now.toISOString().slice(0, 10);
  const endsAtUTC = new Date(Math.min(now.getTime() + 15 * 60000, Date.parse(day + "T23:59:59.999Z"))).toISOString();
  assert(Date.parse(endsAtUTC) - now.getTime() >= 5 * 60000, "atomic-eu-no-valid-current-day-window");
  const runId = "nachlauf500-" + now.getTime(), operationId = "synthetik500-w15-atomic-component-" + now.getTime();
  const profile = { id: owner, committees: ["Arbeit und Soziales"], synthetisch: true };
  const sources = [{ vorgang_id: "w15-atomic-synthetic-event", quellenbelege: [{ quelle_id: "w15-atomic-synthetic-source",
    url: "https://example.org/w15-atomic-synthetic-source", quelle: "Eindeutig synthetische Komponentenfixture, keine Nachrichtenquelle",
    titel: "Synthetischer Entwurf. Ein Termin ist nicht benannt." }] }];
  const raw = { paragraphs: ["Synthetischer Entwurf.", "Ein Termin ist nicht benannt."].map(text => ({ text,
    vorgang_ids: ["w15-atomic-synthetic-event"], quelle_id: "w15-atomic-synthetic-source",
    auswahlbegruendung: "Synthetischer Komponentenfall für den Ausschuss Arbeit und Soziales.",
    mandatsbezug: { feld: "ausschuss", wert: "Arbeit und Soziales" } })) };
  const meta = { politicianId: owner, runId, briefingDatum: now.toISOString() };
  const schema = structuredClone(ai.LAGE_BRIEFING_SCHEMA);
  delete schema.properties.paragraphs.minItems;delete schema.properties.paragraphs.maxItems;
  const payload = { model: EU.CONTRACT.model, input: ai.buildLageBriefingPrompt(sources, profile, meta),
    max_output_tokens: 3000, reasoning: { effort: "low" }, text: { format: { type: "json_schema",
      name: "knowledge_object", schema, strict: true } } };
  const inputHash = P.hash({ profile, sources }), requestHash = A.requestHash(JSON.stringify(payload));
  const runtimeManifestHash = P.hash({ scope: "SYNTHETIC_COMPONENT_NO_EXECUTION_AUTHORITY", operationId });
  const route = { provider: "azure", responsesUrl: EU.CONTRACT.responseURL, model: EU.CONTRACT.model,
    productionCommit: config.commit, deploymentHost: process.env.VERCEL_URL,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID, authMode: "api-key" };
  const make = descriptor => ({ id: A.intentHash(runId, descriptor), ...descriptor });
  const intents = ownerIds.flatMap(id => {
    const d = make({ phase: "D", owner: id, inputVersionHash: id === owner ? inputHash : P.hash({ synthetic: id }),
      actualRequestHash: id === owner ? requestHash : P.hash({ syntheticRequest: id }),
      model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 });
    return [d, make({ phase: "R", owner: id, inputVersionHash: null, actualRequestHash: null,
      dependsOn: d.id, contextVersionHash: d.inputVersionHash, model: "gpt-5-mini", maxOutputTokens: 3000,
      attemptLimit: 1, reviewRule: { version: R.RULE_VERSION, reasoningEffort: "low" } })];
  });
  const plan = { version: A.ROUTE_PLAN_VERSION, operationId, runId, productionCommit: config.commit,
    runtimeManifestHash, startsAtUTC, endsAtUTC, intents,
    sourceBinding: { inputVersion: A.ROUTE_INPUT_VERSION, inputHash: P.hash({ componentSources: sources }),
      projectionVersion: KO.VERSION, projectionFieldsetHash: KO.FIELDSET_HASH },
    routeContract: { version: EU.ROUTE_VERSION, serviceContractHash: EU.HASH, orderRenewalHash: EU.ORDER_RENEWAL_HASH,
      runtimeManifestHash, route, management: { modelFamily: "gpt-5-mini", versionPolicy: "fixed-eu-service-ceiling",
        contextTokens: 400000, maxInputTokens: 272000, inputReserveTokens: 272000, maxOutputTokens: 128000,
        reasoningIncludedInOutput: true, inputUsdPerMillion: 0.275, outputUsdPerMillion: 2.2,
        validFromUTC: startsAtUTC, validUntilUTC: endsAtUTC, modelVersion: EU.CONTRACT.modelVersion,
        sku: EU.CONTRACT.sku, region: EU.CONTRACT.region, versionUpgradeOption: "NoAutoUpgrade",
        evidencePins: Object.fromEntries(["rootAdmission", "management", "serviceContext", "price"]
          .map(name => [name, { name: "explicit-synthetic-component-" + name,
            sha256: P.hash({ componentOnly: name }), bytes: 1 }])) } } };
  const slot = { version: A.ROUTE_VERSION, plan, planHash: P.hash(plan), consumed: {},
    draftCompletions: {}, reviewBindings: {}, reviewBindingsHash: P.hash({}) };
  A.pruefeSlot(slot);
  const books = {};
  for (let ms = Date.parse(EU.CONTRACT.orderSinceUTC); ms <= Date.parse(day); ms += 86400000) {
    const d = new Date(ms).toISOString().slice(0, 10);
    books[d] = { version: EU.DAY_VERSION, day: d, tarif: EU.RATE_ID, limit: EU.DAY_MICRO_USD,
      serviceContractHash: EU.HASH, spent: 0, baseline: 0, baselineCalls: 0,
      manualCalls: 0, manualUntil: null, frozen: null, calls: {} };
  }
  const state = { _authStoreRevision: randomUUID(), users: [], sessions: [], assignments: [], dailyInputs: [],
    auditEvents: [], systemErrors: [], processRuns: [], pipelineLocks: {}, understandingRetries: {}, adminSettings: {},
    llmUsage: [], testKostenTage: books, synthetik500KostenAdmission: slot,
    testKostenAuftrag: { version: EU.ORDER_RENEWAL.orderVersion, id: EU.CONTRACT.orderId,
      abTag: EU.CONTRACT.orderSinceUTC, limit: EU.ORDER_MICRO_USD, externGebunden: 0,
      serviceContractHash: EU.HASH, privateReserveMicroUSD: EU.PRIVATE_MICRO_USD,
      bookCapacity: Object.keys(books).length, runDayUTC: day, orderRenewalHash: EU.ORDER_RENEWAL_HASH },
    componentOnly: { profilesActive: false, full500ExecutionAuthority: false, sourceQualityProof: false } };
  const Durable = require("./fixtures/w15-durable-observations"), path = require("node:path");
  const journal = Durable.open(path.dirname(config.resultFile), "eu-component"); journal.observe(observation);
  const removeAbort = AuthReport.retainOnTermination(() => ({ authTimings: AuthReport.summarize(observation),
    authMutations: observation.mutations, usageSinks: observation.usageSinks, casWrites: observation.casWrites }),
    value => { journal.write("termination-received", value);fs.writeFileSync(config.resultFile + ".ABORT", JSON.stringify(value), { flag: "wx", mode: 0o600 }); });
  journal.ready();
  const start = performance.now();let output, outcome;
  try {
    sql("insert into public.helmut_store(id,data) values(" + literal(rowId) + "," + literal(JSON.stringify(state)) + "::jsonb);");
    IO.bootstrap(sql, rowId);
    S.recordLlmUsage = async function(...args) { const value = await originalRecord.apply(this, args);captured.push(value);return value; };
    https.request = (url, options, callback) => {
      assert.equal(String(url), EU.CONTRACT.responseURL, "atomic-eu-mock-route-exact");
      assert.equal(options.method, "POST");const req = new EventEmitter();let body = "";
      req.destroy = () => {};req.write = bytes => { body += bytes; };
      req.end = () => {
        bodies.push(body);assert.equal(bodies.length, 1, "atomic-eu-exactly-one-local-response");
        assert.equal(A.requestHash(body), requestHash);assert.deepEqual(JSON.parse(body), payload);
        const claim = sql.json("begin read only;select public.helmut_auth_usage_read_v1(jsonb_build_object('id',"
          + literal(rowId) + "))->'data';rollback;");
        assert.equal(claim[A.KEY].consumed[intents[0].id].actualRequestHash, requestHash);
        const ticket = claim[A.KEY].consumed[intents[0].id].ticketId;
        assert.equal(claim[K.KEY][day].calls[ticket].status, "reserviert");
        setImmediate(() => { const res = new EventEmitter();res.statusCode = 200;
          res.setEncoding = () => {};res.destroy = () => {};callback(res);
          res.emit("data", JSON.stringify({ status: "completed", usage: { input_tokens: 100, output_tokens: 100 },
            output: [{ content: [{ type: "output_text", text: JSON.stringify(raw) }] }] }));res.emit("end"); });
      };return req;
    };
    const stop = new Error("atomic-eu-component-before-Dstore-and-review");stop.name = "DirektAbbruch";
    await assert.rejects(ai.generateLageBriefing(sources, profile, { ...meta,
      costAdmission: { operationId, planHash: slot.planHash, routeContractHash: P.hash(plan.routeContract) },
      costInputVersionHash: inputHash, onDraft: async value => { output = value;throw stop; } }), e => e === stop);
    const after = await S.readAuthStore({ strict: true }), completion = ai.readSynthetik500DraftCompletion(output);
    const receipt = captured[0], d = intents[0], consumed = after[A.KEY].consumed[d.id];
    check("real-private-relational-receipt-persisted", captured.length === 1 && U.confirmed(receipt) && U.persisted(after, receipt));
    check("forged-relational-receipt-rejected", !U.confirmed(structuredClone(receipt)) && !U.persisted(after, structuredClone(receipt)));
    check("genuine-AI-DraftCompletion-and-native-postimage-match", !!completion
      && P.hash(completion) === P.hash(after[A.KEY].draftCompletions[d.id])
      && completion.outputHash === P.hash(output) && completion.usageReceipt.id === receipt.id
      && completion.usageReceipt.recordHash === P.hash(after.llmUsage[0]));
    R.validateCompletion(completion, after[A.KEY]);
    const call = after[K.KEY][day].calls[consumed.ticketId], cost = EU.tokenCost(100, 100);
    check("EU-cost-ticket-accounted-with-exact-tariff-and-reserve", call.status === "abgerechnet"
      && call.cost === cost && call.reserved === EU.RESERVE_MICRO_USD && call.usageReceiptId === receipt.id
      && after[K.KEY][day].spent === cost && receipt.serviceContractHash === EU.HASH && receipt.tariffId === EU.RATE_ID);
    check("uninstalled-component-has-no-dispatch-journal-or-R-authority", !Object.hasOwn(after, "synthetik500DispatchJournal")
      && Object.keys(after[A.KEY].reviewBindings).length === 0 && Object.keys(after[A.KEY].consumed).length === 1);
    const other = intents[2], ticket = await K.reserviere({ model: EU.CONTRACT.model, maxOutputTokens: 3000,
      runId, politicianId: other.owner, phase: "entwurf", inputVersionHash: other.inputVersionHash,
      actualRequestHash: other.actualRequestHash, runtimeRouteSnapshot: route,
      admission: { operationId, planHash: slot.planHash, routeContractHash: P.hash(plan.routeContract) } });
    await assert.rejects(K.abschliessen(ticket, structuredClone(receipt)), { code: "TEST_USD_UNKNOWN" });
    const uncertain = await S.readAuthStore({ strict: true }), pending = uncertain[K.KEY][day].calls[ticket.id];
    check("unknown-completion-keeps-full-EU-reserve-without-DraftCompletion", pending.status === "ungeklaert"
      && pending.reserved === EU.RESERVE_MICRO_USD && pending.cost === undefined
      && uncertain[K.KEY][day].spent === cost && !Object.hasOwn(uncertain[A.KEY].draftCompletions, other.id));
    check("real-day-and-order-cost-ceilings-remain-valid", K.kontrolliere(uncertain, day).atomarerUsdRiegel === true
      && K.auftragsStand(uncertain, day).limitMicroUsd === EU.ORDER_MICRO_USD);
    check("original-main-auth-and-inactive-profiles-unchanged", mainHash() === originalMainHash && active() === 0);
    check("every-genuine-atomic-Auth-write-assigned-and-under30", observation.assessment().pass);
    outcome = { authTimings: AuthReport.summarize(observation), authCoverage: observation.assessment(),
      authMutations: observation.mutations, usageSinks: observation.usageSinks, casWrites: observation.casWrites, schema: "helmut-w15-atomic-EU-component-integration/1", status: "PASS_EU_D_COMPLETION_COMPONENT_NOT_INSTALLED_RUNTIME",
      checks, rowId, operationId, planHash: slot.planHash, providerMocks: bodies.length, paidModelCalls: 0,
      profileActivations: 0, unitExecutions: 0, complete500Attempts: 0, sourceQualityAcceptance: false,
      installedDStoreOrRProven: false, originalMainAuthUnchanged: true,
      acknowledgedUsageRows: after.llmUsage.length, costMicroUSD: cost, reservedUnknownMicroUSD: pending.reserved,
      completionHash: completion.completionHash, executionUTC: now.toISOString(), realElapsedMs: performance.now() - start };
    if (config.resultFile) fs.writeFileSync(config.resultFile, JSON.stringify(outcome, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(outcome));return outcome;
  } finally {
    removeAbort();
    https.request = originalRequest;S.recordLlmUsage = originalRecord;
    for (const key of Object.keys(process.env)) if (!Object.hasOwn(originalEnv, key)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
}
if (require.main === module) main(JSON.parse(fs.readFileSync(process.argv[2], "utf8"))).catch(error => {
  console.error(error.stack);process.exitCode = 1;
});
module.exports = { main };
