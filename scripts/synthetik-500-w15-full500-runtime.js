"use strict";
// One owner-authorized isolated sequence. No action runs on import. Real motor,
// clocks, native guards and conditional writers; only HTTPS outputs are mocked.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), { AsyncLocalStorage } = require("node:async_hooks");
const { performance } = require("node:perf_hooks");
const Memory = require("./fixtures/w15-memory-contract");
const DIR = "/tmp/w15-full500-20261028c", STATE = path.join(DIR, "state");
const DB = "helmut_w15_full500_20261028b", PUB = "HELMUT_SYNTHETIK500_CONTENT_PUBLIC_KEY";
const PRIV = "HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY";
const CONFIRMATION = "GO_EXACTLY_ONE_ISOLATED_W15_FULL500_MOCK_RUN_AND_RETURN_TO_ZERO";
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const literal = x => "'" + String(x).replaceAll("'", "''") + "'";
const file = name => path.join(STATE, name);
function safeError(e) {
  const reason = String(e?.message || "");
  return { name: e?.name || "Error", reason: /^[a-z][a-z0-9-]{1,180}$/.test(reason) ? reason : "w15-full500-error-details-retained-private" };
}
function read(name) {
  const p = file(name), s = fs.lstatSync(p);
  assert(s.isFile() && !s.isSymbolicLink() && s.uid === process.getuid() && (s.mode & 511) === 384, "w15-full500-private-file");
  return JSON.parse(fs.readFileSync(p));
}
function save(name, value) {
  const b = Buffer.from(JSON.stringify(value, null, 2) + "\n");
  fs.writeFileSync(file(name), b, { flag: "wx", mode: 384 });
  return { path: file(name), bytes: b.length, sha256: sha(b) };
}
function event(name, fields = {}) {
  const value = { name, observedAtUTC: new Date().toISOString(), ...fields };
  fs.appendFileSync(file("runtime-progress.SAFE.jsonl"), JSON.stringify(value) + "\n", { mode: 384 });
  console.log(JSON.stringify({ name, index: fields.index, status: fields.status }));
}
function memory() {
  const at = name => fs.readFileSync("/sys/fs/cgroup/" + name, "utf8").trim();
  const peak = Number(at("memory.peak"));
  return { currentBytes: Number(at("memory.current")), configuredLimit: at("memory.max"),
    swapMaximum: at("memory.swap.max"), swapCurrentBytes: Number(at("memory.swap.current")),
    events: Object.fromEntries(at("memory.events").split("\n").map(s => s.split(/\s+/)).map(([k, v]) => [k, Number(v)])),
    ...Memory.assess(peak) };
}
function memoryAccepted(m) {
  return m.configuredLimit === String(Memory.limits.comparisonBudgetBytes) && m.swapMaximum === "0"
    && m.swapCurrentBytes === 0 && m.reserveMeetsContract
    && ["oom", "oom_kill", "oom_group_kill", "max"].every(k => m.events[k] === 0);
}
function ownerGo() {
  const go = read("OWNER_GO.PRIVATE.json");
  assert.equal(go.confirmation, CONFIRMATION); assert.equal(go.targetDatabase, DB);
  assert.equal(go.maximumUnits, 500); assert.equal(go.temporarySyntheticProfiles, 500);
  assert.equal(go.paidModelsAllowed, false); assert.equal(go.productionAllowed, false); assert.equal(go.full500Allowed, true);
  return go;
}
function guard() {
  const name = require.resolve("./lokaler-netzschutz");
  assert(require.cache[name], "w15-full500-preloaded-local-guard");
  assert.deepEqual(require(name).pruefe(process.env), []);
  for (const p of [DIR, STATE]) { const s = fs.lstatSync(p); assert(s.isDirectory() && !s.isSymbolicLink()
    && s.uid === process.getuid() && (s.mode & 511) === 448, "w15-full500-private-directory"); }
  assert.equal(process.version, "v24.19.0"); assert(memoryAccepted(memory()), "w15-full500-common-memory-precondition");
}
function environment(config) {
  require("./synthetik-500-w15-signed-chain-test").localEnvironment(config);
  assert(!process.env[PRIV]); assert.equal(config.database, DB);
}
function azure(on) {
  if (on) Object.assign(process.env, { AZURE_OPENAI_ENDPOINT: "https://helmut-resource.openai.azure.com",
    AZURE_OPENAI_KEY: "LOCAL_MOCK_NOT_A_VALID_PROVIDER_KEY", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini-eu" });
  else for (const name of ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_KEY", "AZURE_OPENAI_DEPLOYMENT"]) delete process.env[name];
}
function sql(query) {
  const r = require("node:child_process").spawnSync("psql", ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB, "-f", "-"], {
    input: "begin read only;set local statement_timeout='15s';set local lock_timeout='3s';" + query + "rollback;",
    encoding: "utf8", timeout: 20000, maxBuffer: 24 * 1024 * 1024, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } });
  assert.equal(r.status, 0, "w15-full500-readonly-sql"); return JSON.parse(r.stdout.trim());
}
function checkpointAssessment(points) {
  const checkpointKinds = {};
  if (Array.isArray(points)) for (const p of points) checkpointKinds[p.kind] = (checkpointKinds[p.kind] || 0) + 1;
  return { count: Array.isArray(points) ? points.length : 0, checkpointKinds,
    original16FreshControls: Array.isArray(points) && points.length === 16
      && checkpointKinds.load === 10 && checkpointKinds.admission === 6
      && Object.keys(checkpointKinds).length === 2
      && points.every((p, i) => Number.isFinite(p.observedAt) && (i === 0 || p.observedAt >= points[i - 1].observedAt)) };
}
function authCoverageAssessment({ mutations, usageSinks, casWrites }) {
  const envelopes = [...mutations, ...usageSinks], byId = new Map(envelopes.map(e => [e.id, e]));
  const allEnvelopesAcknowledgedUnder30 = envelopes.length > 0 && byId.size === envelopes.length && envelopes.every(e => e.acknowledged === true
    && Number.isFinite(e.beginMS) && Number.isFinite(e.ackMS) && Number.isFinite(e.endMS)
    && e.beginMS <= e.ackMS && e.ackMS <= e.endMS && Number.isFinite(e.wallMs) && e.wallMs < 30000 && e.wallMs >= 0
    && (e.kind !== "usage-sink" || e.blobAcknowledged === true));
  const allWritesAssigned = casWrites.length > 0 && casWrites.every(w => byId.has(w.envelopeId) && w.rowId === "main-auth");
  const allWritesAcknowledged = casWrites.length > 0 && casWrites.every(w => w.acknowledged === true
    && [w.beginMS, w.ackMS, w.endMS, w.wallMs].every(Number.isFinite)
    && w.beginMS <= w.ackMS && w.ackMS <= w.endMS && w.wallMs >= 0 && w.wallMs < 30000);
  const allWritesBoundedByEnvelope = casWrites.every(w => { const e = byId.get(w.envelopeId);
    return e && w.beginMS >= e.beginMS && w.ackMS <= e.ackMS && w.endMS <= e.endMS; });
  const eachEnvelopeHasWrite = envelopes.every(e => casWrites.some(w => w.envelopeId === e.id));
  return { allEnvelopesAcknowledgedUnder30, allWritesAssigned, allWritesAcknowledged, allWritesBoundedByEnvelope,
    eachEnvelopeHasWrite, observedCASWrites: casWrites.length, mutationEnvelopes: mutations.length, usageEnvelopes: usageSinks.length,
    usage1000: usageSinks.length === 1000,
    pass: allEnvelopesAcknowledgedUnder30 && allWritesAssigned && allWritesAcknowledged && allWritesBoundedByEnvelope && eachEnvelopeHasWrite };
}
function observeAuth(S, { currentIndex = () => null, onFinalACK = () => {} } = {}) {
  const contexts = new AsyncLocalStorage(), mutations = [], usageSinks = [], casWrites = [];
  const Cas = require("../lib/helmut/auth-store-cas"), actualWrite = Cas.writeConditional;
  let nextId = 0;
  Cas.writeConditional = async function(...args) {
    const context = contexts.getStore(), row = { id: casWrites.length, envelopeId: context?.id ?? null,
      index: context?.index ?? currentIndex(), rowId: args[1]?.rowId, beginMS: performance.now() };
    casWrites.push(row);
    try { const value = await actualWrite.apply(this, args); row.acknowledged = true; row.ackMS = performance.now(); return value; }
    catch (e) { row.failure = safeError(e); throw e; }
    finally { row.endMS = performance.now(); row.wallMs = row.endMS - row.beginMS; }
  };
  const actualMutate = S.mutateAuthStore;
  S.mutateAuthStore = function(fn, ...rest) {
    const row = { id: ++nextId, kind: "public-mutation", index: currentIndex(), beginMS: performance.now(), callbackRuns: 0 };
    mutations.push(row);
    return contexts.run(row, async () => {
      try { const result = await actualMutate.call(this, async (...args) => {
        row.callbackRuns++; const begin = performance.now();
        try { return await fn(...args); } finally { row.callbackMs = (row.callbackMs || 0) + performance.now() - begin; }
      }, ...rest);
        row.acknowledged = true; row.ackMS = performance.now();
        if (row.finishIndex !== undefined) onFinalACK(row.finishIndex, row.ackMS);
        return result;
      } catch (e) { row.failure = safeError(e); throw e; }
      finally { row.endMS = performance.now(); row.wallMs = row.endMS - row.beginMS; }
    });
  };
  const actualUsage = S.recordLlmUsage;
  S.recordLlmUsage = function(...args) {
    const row = { id: ++nextId, kind: "usage-sink", index: currentIndex(), beginMS: performance.now() };
    usageSinks.push(row);
    return contexts.run(row, async () => {
      try { const result = await actualUsage.apply(this, args);
        row.blobAcknowledged = result?._ablage?.blob === true; row.acknowledged = row.blobAcknowledged;
        row.usageReceiptId = result?.id || null; row.ackMS = performance.now(); return result;
      } catch (e) { row.failure = safeError(e); throw e; }
      finally { row.endMS = performance.now(); row.wallMs = row.endMS - row.beginMS; }
    });
  };
  // These genuine lock APIs call lexical writeAuthStore rather than the
  // exported mutation API. Preserve their behavior and measure the whole call
  // as the acknowledged upper bound, just like the existing usage sink.
  for (const name of ["acquirePipelineLock", "releasePipelineLock"]) {
    const actual = S[name]; assert.equal(typeof actual, "function");
    S[name] = function(...args) {
      const row = { id: ++nextId, kind: "pipeline-lock", api: name,
        lockKeyHash: sha(String(args[0])), index: currentIndex(), beginMS: performance.now() };
      mutations.push(row);
      return contexts.run(row, async () => {
        try {
          const value = await actual.apply(this, args);
          const writes = casWrites.filter(w => w.envelopeId === row.id);
          row.blobAcknowledged = writes.length > 0 && writes.every(w => w.acknowledged === true);
          row.acknowledged = row.blobAcknowledged && (name !== "acquirePipelineLock" || value === true);
          if (name === "acquirePipelineLock") row.acquired = value === true;
          row.ackMS = performance.now(); return value;
        } catch (e) { row.failure = safeError(e); throw e; }
        finally { row.endMS = performance.now(); row.wallMs = row.endMS - row.beginMS; }
      });
    };
  }
  return { mutations, usageSinks, casWrites, context: () => contexts.getStore(),
    assessment: () => authCoverageAssessment({ mutations, usageSinks, casWrites }) };
}
async function setup() {
  ownerGo(); const metadata = read("setup-input.PRIVATE.json"); assert.match(metadata.commit, /^[a-f0-9]{40}$/);
  const EU = require("../lib/helmut/synthetik-500-eu-service-contract"), key = crypto.generateKeyPairSync("ed25519");
  const secret = crypto.randomBytes(48).toString("hex"), now = Math.floor(Date.now() / 1000), b64 = x => Buffer.from(JSON.stringify(x)).toString("base64url");
  const unsigned = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ role: "service_role", iat: now, exp: now + 14400 });
  const serviceToken = unsigned + "." + crypto.createHmac("sha256", secret).update(unsigned).digest("base64url");
  fs.writeFileSync(file("signing-key.PRIVATE.pem"), key.privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 384 });
  const policy = fs.readFileSync(file("publication-policy.PRIVATE.json"), "utf8");
  assert.equal(sha(policy), "274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04");
  save("configuration.PRIVATE.json", { database: DB, publicKey: key.publicKey.export({ type: "spki", format: "pem" }), policy,
    serviceToken, adminSecret: crypto.randomBytes(32).toString("hex"), euHash: EU.HASH, renewalHash: EU.ORDER_RENEWAL_HASH,
    commit: metadata.commit, host: "helmut-w15-full500-local.vercel.app", deploymentId: "dpl_W15Full500LocalNotProduction" });
  fs.writeFileSync(file("postgrest.PRIVATE.conf"), 'db-uri = "postgresql://authenticator@localhost/' + DB + '?host=/var/run/postgresql"\n'
    + 'db-schemas = "public"\nserver-host = "127.0.0.1"\nserver-port = 3210\ndb-pool = 3\njwt-secret = "' + secret + '"\n', { flag: "wx", mode: 384 });
  save("SETUP.SAFE.json", { status: "READY", publicKeySHA256: sha(key.publicKey.export({ type: "spki", format: "der" })),
    privateKeyExported: false, database: DB, memory: memory() });
}
async function gateway() {
  const c = read("configuration.PRIVATE.json");
  const g = await require("./fixtures/z3-plattform").starteDatenbankTor({ postgrestPort: 3210 }); c.url = g.url;
  fs.writeFileSync(file("configuration.PRIVATE.json"), JSON.stringify(c), { mode: 384 });
  save("runtime-public.PRIVATE.json", { ...c, serviceToken: "LOCAL_INPUT_ASSEMBLER_NO_SERVICE_ACCESS", adminSecret: "UNUSED_INPUT_ASSEMBLER" });
  fs.writeFileSync(file("gateway.pid"), String(process.pid), { mode: 384 });
  process.on("SIGTERM", async () => { await g.stoppe(); process.exit(0); });
}
async function prepare() {
  ownerGo(); const c = read("configuration.PRIVATE.json"), m = read("processing-materials.PRIVATE.json"); environment(c);
  assert.equal(m.database, DB); assert.equal(m.productionCommit, c.commit);
  process.env[PRIV] = fs.readFileSync(file("signing-key.PRIVATE.pem"), "utf8");
  const S = require("../lib/helmut/storage"), C = require("../lib/helmut/synthetik-500-production-command");
  const observation = observeAuth(S); const begin = performance.now();
  try {
    const prepared = await S.prepareSynthetik500StoredCommand(m.selector);
    assert.equal(prepared.executionAuthorized, false); assert(prepared.metrics.wallMs < 90000, "w15-full500-offline90");
    const installationOpenStart = performance.now(); let installationOpenMs;
    await S.withSynthetik500InstallationCommand(m.selector, async () => {
      installationOpenMs = performance.now() - installationOpenStart;
      assert(installationOpenMs < 60000, "w15-full500-installation-open60");
      const packet = await S.loadSynthetik500ProductionCommand(m.selector.operationId, m.selector.commandHash);
      await S.readSynthetik500CurrentInputs(packet.command.drafts[0].sources);
    });
    const auth = await S.readAuthStore({ strict: true });
    assert.equal(C.controlHash(auth), m.controlHash); assert.equal(C.booksHash(auth), m.booksHash);
    const primary = save("local-approval.PRIVATE.json", { scope: "EXACTLY_ONE_USER_AUTHORIZED_LOCAL_MOCK_FULL500_SEQUENCE_NOT_PRODUCTION",
      selector: m.selector, full500DispatchAuthorized: true, maximumUnits: 500, profileActivationAuthorized: true,
      paidModelsAllowed: false, ownerGoSHA256: sha(fs.readFileSync(file("OWNER_GO.PRIVATE.json"))), sourceReceiptSHA256: m.sourceReceiptSHA256 });
    const go = save("local-go.PRIVATE.json", { version: "helmut-synthetik500-test-go/1", operationId: m.selector.operationId,
      productionCommit: c.commit, deploymentId: c.deploymentId, planHash: m.planHash, paketHash: m.paketHash,
      startsAtUTC: m.startsAtUTC, endsAtUTC: m.endsAtUTC, authorizedAtUTC: new Date().toISOString(),
      authorizationReference: "EXPLICIT_USER_ONE_ISOLATED_MOCK_FULL500_GO:" + primary.sha256,
      confirmation: "SEPARATES_GO_EXAKT500_SYNTHETIK_PRODUCTION_TEST" });
    const gates = {}, evidencePins = {};
    for (const purpose of C.DIRECT_GATES) { gates[purpose] = true; evidencePins[purpose] = save("gate-" + purpose + ".PRIVATE.json", {
      version: C.ACTUAL_GATE_VERSION, purpose, rootExecutor: "/root", operationId: m.selector.operationId, runId: m.runId,
      productionCommit: c.commit, planHash: m.planHash, commandHash: m.selector.commandHash, acceptedActualScope: true,
      primaryEvidencePins: [purpose === "testGo" ? go : primary] }); }
    const admission = save("admission.PRIVATE.json", { version: C.ADMISSION_VERSION, executor: "/root", purpose: "finite-D-R-500",
      commandHash: m.selector.commandHash, planHash: m.planHash, productionCommit: c.commit, admittedAtUTC: new Date().toISOString(),
      expiresAtUTC: m.endsAtUTC, controlHash: m.controlHash, booksHash: m.booksHash, gates, evidencePins });
    const bytes = fs.readFileSync(file("current-command.PRIVATE.json"));
    await require("../lib/helmut/synthetik-500-production-adapter").install({ path: file("current-command.PRIVATE.json"), bytes: bytes.length, sha256: sha(bytes) }, admission);
    const coverage = observation.assessment(); assert(coverage.pass && coverage.usageEnvelopes === 0, "w15-full500-install-auth30-coverage");
    assert(memoryAccepted(memory()), "w15-full500-preparation-common-memory");
    save("PREPARE.SAFE.json", { status: "PASS", selector: m.selector, fullC: prepared.metrics, installationOpenMs, fullStageWallMs: performance.now() - begin,
      authMutations: observation.mutations, usageSinks: observation.usageSinks, casWrites: observation.casWrites, authCoverage: coverage,
      actualSource23AndKO60PostimagesMatchDerivedInputs: true, providerCalls: 0, unitEntries: 0, memory: memory() });
  } finally { delete process.env[PRIV]; }
}
function claimQuery(selector, index, phase) {
  assert(Number.isInteger(index) && index >= 0 && index < 500); assert(["D", "R"].includes(phase));
  const offset = phase === "D" ? 0 : 1;
  return "with a as(select data from helmut_store where id='main-auth'),o as(select data,data->'synthetik500DispatchJournal'->'operations'->"
    + literal(selector.operationId) + " op from a),t as(select *,op->'attempts'->(op->'units'->" + index + "->'intentIds'->>" + offset
    + ") attempt from o),c as(select *,data->'testKostenTage'->(attempt->>'day')->'calls'->(attempt->>'ticketId') call from t)"
    + " select jsonb_build_object('operationId',op->>'operationId','commandHash',op->>'commandHash','index',(op->'inFlight'->>'index')::int,"
    + "'journalState',op->>'state','attemptStatus',attempt->>'status','reservationStatus',call->>'status','actualRequestHash',call->'admission'->>'actualRequestHash',"
    + "'planHash',call->'admission'->>'planHash','intentId',call->'admission'->>'intentId','expectedIntentId',op->'units'->" + index + "->'intentIds'->>" + offset + ")from c;";
}
async function run() {
  ownerGo(); const c = read("configuration.PRIVATE.json"), m = read("processing-materials.PRIVATE.json"); environment(c);
  assert.equal(m.database, DB); assert.equal(m.productionCommit, c.commit); assert(!process.env[PRIV]);
  const fixtures = read("mock-fixtures.PRIVATE.json"); assert(Array.isArray(fixtures) && fixtures.length === 500);
  assert.equal(new Set(fixtures.map(f => f.owner)).size, 500);
  for (let i = 0; i < 500; i++) assert.equal(fixtures[i].index, i);
  const S = require("../lib/helmut/storage"), J = require("../lib/helmut/synthetik-500-dispatch-journal");
  const P = require("../lib/helmut/synthetik-500-profile"), A = require("../lib/helmut/synthetik-500-kosten-admission");
  const H = require("./fixtures/w15-full500-provider"), unitReports = [], scopeReports = [], responses = [], providerPhases = [], errors = [];
  let index = -1, activeScope = null, memoryViolation = null;
  const observation = observeAuth(S, { currentIndex: () => index, onFinalACK: (finished, ack) => {
    const unit = unitReports.find(u => u.index === finished); assert(unit, "w15-full500-finish-without-entry");
    unit.finalACKMS = ack; unit.endCheckpointCount = S.synthetik500PreparedDiagnostics()?.checkpoints.length;
  } });
  const Lage = require("../lib/helmut/lage"), actualLage = Lage.buildLageBriefing;
  Lage.buildLageBriefing = async function(...args) {
    try { const result = await actualLage.apply(this, args);
      if (result?.available !== true) errors.push({ index, phase: "buildLageBriefing", available: false,
        reason: /^[a-z0-9-]{1,120}$/.test(result?.reason || "") ? result.reason : "unavailable" });
      return result;
    } catch (e) { errors.push({ index, phase: "buildLageBriefing", ...safeError(e) }); throw e; }
  };
  const enter = J.enter, finish = J.finish;
  J.enter = function(...args) {
    const beginMS = performance.now(), startCheckpointCount = S.synthetik500PreparedDiagnostics()?.checkpoints.length;
    const result = enter(...args);
    assert.equal(args[3], index, "w15-full500-unexpected-entry-index"); assert.equal(unitReports.length, index, "w15-full500-no-unit-reentry");
    unitReports.push({ index, owner: fixtures[index].owner, beginMS, startCheckpointCount, enteredAtUTC: args[4],
      deadlineAtUTC: J.current(args[0]).inFlight.deadlineAtUTC, finalACKMS: null }); return result;
  };
  J.finish = function(...args) {
    const result = finish(...args), context = observation.context();
    assert(context?.kind === "public-mutation", "w15-full500-finish-envelope"); context.finishIndex = args[3]; return result;
  };
  const actualScope = S.withSynthetik500PreparedCommand;
  S.withSynthetik500PreparedCommand = async function(args, work) {
    const row = { index, beginMS: performance.now() }; scopeReports.push(row); activeScope = row;
    try { return await actualScope.call(this, args, async () => { row.openedMS = performance.now();
      try { return await work(); } finally { row.diagnostics = S.synthetik500PreparedDiagnostics(); }
    }); } catch (e) { row.failure = safeError(e); throw e; }
    finally { row.endMS = performance.now(); row.wallMS = row.endMS - row.beginMS; activeScope = null; }
  };
  for (const name of ["readSynthetik500Runtime", "readSynthetik500CurrentInputs", "getProfileFromDb", "synthetik500ReviewStorageContract",
    "storeSynthetik500ImmutableDraft", "getSynthetik500ImmutableDraft", "insertLageEntwurfsbeleg", "retainSynthetik500ProductionEvidence"]) {
    const real = S[name]; S[name] = async function(...args) { try { return await real.apply(this, args); }
      catch (e) { errors.push({ index, phase: name, ...safeError(e) }); throw e; } };
  }
  const before = sql("select jsonb_build_object('active',(select count(*)from mandate_profiles where aktiv),'journal',data->'synthetik500DispatchJournal'->'operations'->"
    + literal(m.selector.operationId) + ",'route',data->'synthetik500KostenAdmission'->'plan'->'routeContract'->'route','usageRows',jsonb_array_length(data->'llmUsage'))from helmut_store where id='main-auth';");
  assert.equal(before.active, 500); assert.equal(before.journal.state, "installed"); assert.equal(before.journal.claimId, null);
  assert.equal(before.journal.commandHash, m.selector.commandHash); assert.equal(before.usageRows, 5000);
  const starts = Date.parse(m.startsAtUTC), ends = Date.parse(m.endsAtUTC);
  assert(starts <= Date.now() && Date.now() < ends && ends - starts <= 10800000, "w15-full500-fixed-active-window");
  const berlin = require("../lib/helmut/briefing-frische").berlinTagKey;
  assert.equal(berlin(new Date(starts)), berlin(new Date(ends + 1800000)), "w15-full500-cleanup-berlin-day");
  assert.equal(new Date(starts).toISOString().slice(0, 10), new Date(ends + 1800000).toISOString().slice(0, 10), "w15-full500-cleanup-utc-day");
  azure(true);
  const ai = require("../lib/helmut/ai"), configuration = ai.runtimeProviderConfiguration().resolved;
  assert(configuration.sendEnabled && configuration.providerForSend === "azure" && configuration.azureConfigurationUsable,
    "w15-full500-local-azure-config");
  const senderRoute = { provider: configuration.providerForSend, responsesUrl: configuration.responsesURL,
    model: ai.understandingModelName(), productionCommit: process.env.VERCEL_GIT_COMMIT_SHA,
    deploymentHost: process.env.VERCEL_URL, deploymentId: process.env.VERCEL_DEPLOYMENT_ID, authMode: "api-key" };
  assert.deepEqual(senderRoute, before.route); A.pruefeRouteSnapshot(senderRoute);
  const http = require("node:http"), server = http.createServer(require("../server"));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const memoryBefore = memory(), poll = setInterval(() => { try { const mem = memory();
    if (!memoryAccepted(mem) && memoryViolation === null) { memoryViolation = mem; event("memory-limit-or-reserve-failure", { index }); }
  } catch (e) { memoryViolation ||= { error: safeError(e) }; } }, 1000);
  let provider = null;
  const started = performance.now();
  try {
    for (index = 0; index < 500; index++) {
      assert(!memoryViolation && memoryAccepted(memory()), "w15-full500-common-memory-before-next");
      assert(Date.now() < ends, "w15-full500-fixed-window-expired");
      const fixture = fixtures[index], phaseOffset = providerPhases.length, mutationOffset = observation.mutations.length;
      const usageOffset = observation.usageSinks.length, casOffset = observation.casWrites.length;
      const readSenderClaim = ({ phase, body, index: actualIndex }) => {
        assert.equal(actualIndex, index); const row = sql(claimQuery(m.selector, index, phase));
        assert.equal(row.planHash, m.planHash); assert.equal(row.intentId, row.expectedIntentId);
        assert.equal(row.actualRequestHash, A.requestHash(body)); return row;
      };
      provider = H.install({ fixture, selector: m.selector, readSenderClaim, providerPhases });
      const t = performance.now(), action = index === 0 ? "start" : "next";
      let status, body;
      try {
        const response = await fetch("http://127.0.0.1:" + server.address().port + "/api/ops/synthetik500-direkt", {
          method: "POST", headers: { Authorization: "Bearer " + c.adminSecret, "Content-Type": "application/json", Connection: "close" },
          body: JSON.stringify({ action, ...m.selector }), signal: AbortSignal.timeout(120000) });
        status = response.status; body = await response.json();
      } finally { provider.restore(); }
      const response = { index, action, status, ok: body?.ok === true, completedUnits: body?.result?.completedUnits,
        dispatchedUnits: body?.result?.dispatchedUnits, state: body?.result?.state, wallMs: performance.now() - t, providerCalls: provider.count() };
      responses.push(response);
      assert.equal(status, 200, "w15-full500-http-first-failure-stop"); assert.equal(body?.ok, true);
      assert.equal(body.result.completedUnits, index + 1); assert.equal(body.result.dispatchedUnits, 1);
      assert.equal(provider.count(), 2); assert.equal(provider.pending(), 0); provider = null;
      const unit = unitReports[index], scope = scopeReports[index];
      assert(unit && scope && scope.diagnostics, "w15-full500-missing-finish-observation");
      assert(Number.isInteger(unit.startCheckpointCount) && Number.isInteger(unit.endCheckpointCount), "w15-full500-checkpoint-bounds");
      unit.checkpoints = scope.diagnostics.checkpoints.slice(unit.startCheckpointCount, unit.endCheckpointCount);
      Object.assign(unit, checkpointAssessment(unit.checkpoints));
      unit.wallMS = unit.finalACKMS === null ? null : unit.finalACKMS - unit.beginMS;
      unit.under60 = unit.wallMS !== null && unit.wallMS < 60000;
      assert(unit.under60 && unit.original16FreshControls, "w15-full500-unit-time-or-control-count");
      assert(scope.openedMS - scope.beginMS < 60000, "w15-full500-prepared-open60");
      assert(scope.beginMS <= unit.beginMS && scope.endMS >= unit.finalACKMS, "w15-full500-unit-outside-scope");
      const phases = providerPhases.slice(phaseOffset);
      assert.equal(phases.length, 2); assert.deepEqual(phases.map(p => p.phase), ["D", "R"]);
      assert(phases.every(p => p.index === index && p.nativePermanentSendClaim && p.nativeCostReservation), "w15-full500-actual-send-claims");
      if ([0, 499].includes(index)) assert(phases.every(p => p.actualDelayMS >= 19900 && p.actualDelayMS < 20000), "w15-full500-worst-provider-delays");
      const unitAuth = { mutations: observation.mutations.slice(mutationOffset), usageSinks: observation.usageSinks.slice(usageOffset), casWrites: observation.casWrites.slice(casOffset) };
      const authCheck = authCoverageAssessment(unitAuth);
      assert(authCheck.pass && unitAuth.usageSinks.length === 2, "w15-full500-all-unit-auth30-cas-assigned");
      const post = sql("with a as(select data from helmut_store where id='main-auth'),o as(select data->'synthetik500DispatchJournal'->'operations'->"
        + literal(m.selector.operationId) + " op from a),e as(select data from helmut_store where id=" + literal("synthetik500-evidence-" + m.selector.operationId + "-" + index)
        + ") select jsonb_build_object('active',(select count(*)from mandate_profiles where aktiv),'completedIndex',(op->>'index')::int,'state',op->>'state','inFlight',op->'inFlight',"
        + "'positionMetadata',(select jsonb_agg(p-'row')from e,jsonb_array_elements(e.data->'positions')as entries(p)),'evidenceActive',(select(data->'activeRuntime'->>'aktiv')::int from e),"
        + "'twoAccounted',(select count(*)=2 from jsonb_array_elements_text(op->'units'->" + index + "->'intentIds')as ids(intent_id) where op->'attempts'->ids.intent_id->>'status'='accounted'))from o;");
      assert.equal(post.active, 500); assert.equal(post.evidenceActive, 500); assert.equal(post.completedIndex, index + 1);
      assert.equal(post.inFlight, null); assert.equal(post.twoAccounted, true);
      assert.equal(post.state, index === 499 ? "closed" : "running");
      assert(Array.isArray(post.positionMetadata) && post.positionMetadata.length === 3
        && new Set(post.positionMetadata.map(p => p.bereich)).size === 3
        && P.BEREICHE.every(area => post.positionMetadata.some(p => p.bereich === area))
        && post.positionMetadata.every(p => p.mandatsId === fixture.owner && p.status === "stored-unreviewed" && /^[a-f0-9]{64}$/.test(p.ergebnisHash)), "w15-full500-three-persistent-positions");
      unit.positions = post.positionMetadata; unit.authCoverage = authCheck;
      scope.openMs = scope.openedMS - scope.beginMS;
      scope.restorePhases = scope.diagnostics.metrics?.phases || [];
      // Preserve bounded metadata only. The native evidence retains full rows.
      delete scope.diagnostics;
      event("unit-final-ack-accepted", { index, status: "PASS", unit, response, authCoverage: authCheck });
      assert(errors.length === 0 && !memoryViolation && memoryAccepted(memory()), "w15-full500-observed-failure-before-next");
    }
    const final = sql("select jsonb_build_object('active',(select count(*)from mandate_profiles where aktiv),'journal',data->'synthetik500DispatchJournal'->'operations'->"
      + literal(m.selector.operationId) + ",'usageRows',jsonb_array_length(data->'llmUsage'))from helmut_store where id='main-auth';");
    const op = final.journal, coverage = observation.assessment(), mem = memory();
    const checks = { exactly500ClosedFinalACKs: unitReports.length === 500 && op.index === 500 && op.state === "closed" && op.inFlight === null
        && op.units.length === 500 && op.units.every(u => u.entered) && Object.keys(op.outputs).length === 500,
      exactly1000AccountedCalls: Object.keys(op.attempts).length === 1000 && Object.values(op.attempts).every(a => a.status === "accounted") && providerPhases.length === 1000,
      all8000FreshControls: unitReports.every(u => u.original16FreshControls) && unitReports.reduce((n, u) => n + u.count, 0) === 8000,
      all500UnitsUnder60: unitReports.every(u => u.under60), all500PreparedOpenUnder60: scopeReports.length === 500 && scopeReports.every(s => s.openMs < 60000),
      coldThenWarm: scopeReports[0].restorePhases.some(p => p.name === "restoreFullTWithoutC") && scopeReports.slice(1).every(s => s.restorePhases.length === 0),
      everyAuthAssignedAndUnder30: coverage.pass && coverage.usage1000,
      exactly500UniqueFinishACKs: observation.mutations.filter(m => m.finishIndex !== undefined).length === 500
        && new Set(observation.mutations.filter(m => m.finishIndex !== undefined).map(m => m.finishIndex)).size === 500,
      usageHistoryNotTruncated: final.usageRows === before.usageRows + 1000,
      active500AtLastRead: final.active === 500, sharedCapAnd20PercentReserve: memoryAccepted(mem),
      noObservedErrors: errors.length === 0 && memoryViolation === null, privateKeyAbsent: !process.env[PRIV] };
    const result = { schema: "helmut-w15-full500-runtime/1", status: Object.values(checks).every(Boolean) ? "PASS_RUNTIME_AUDIT_AND_CLEANUP_PENDING" : "FAIL_OR_UNKNOWN",
      selector: m.selector, runId: m.runId, checks, unitReports, scopeReports, responses, providerPhases,
      authMutations: observation.mutations, usageSinks: observation.usageSinks, casWrites: observation.casWrites, authCoverage: coverage,
      errors, memoryBefore, memoryAfter: mem, actualSequenceWallMs: performance.now() - started,
      summedHTTPWallMs: responses.reduce((n, r) => n + r.wallMs, 0), summedUnitWallMs: unitReports.reduce((n, u) => n + u.wallMS, 0),
      technicallyStoredPositions: unitReports.reduce((n, u) => n + u.positions.length, 0), activeProfilesAtLastRead: final.active,
      modelCalls: 0, localSimulations: providerPhases.length, completedUnits: op.index, journalState: op.state,
      independent1500RowAcceptance: false, cleanupConfirmed: false, professionalAcceptance: false, productionProof: false,
      noAutomaticRetry: true, runtimeMemoryIncludesAudit: false, note: "Independent bounded1500-row audit and bound native cleanup must follow in the same capped container; final common peak remains open." };
    save("FULL500_RUNTIME_RESULT.SAFE.json", result);
    assert(Object.values(checks).every(Boolean), "w15-full500-runtime-first-failure-stop");
  } catch (e) {
    save("FULL500_RUNTIME_FAILURE.SAFE.json", { status: "FAIL_OR_UNKNOWN", error: safeError(e), selector: m.selector,
      currentIndex: index, completedHTTPRequests: responses.length, unitReports, scopeReports, responses, providerPhases,
      authMutations: observation.mutations, usageSinks: observation.usageSinks, casWrites: observation.casWrites,
      authCoverage: observation.assessment(), errors, memory: memory(), memoryViolation,
      noAutomaticRetry: true, independent1500RowAcceptance: false, cleanupConfirmed: false, productionProof: false });
    throw e;
  } finally {
    clearInterval(poll); if (provider) provider.restore(); azure(false);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
async function main(action) {
  assert(["setup", "gateway", "prepare", "run"].includes(action), "w15-full500-runtime-action"); guard();
  return ({ setup, gateway, prepare, run })[action]();
}
if (require.main === module) main(process.argv[2]).catch(e => {
  try { save(process.argv[2] + "-FIRST-FAILURE.SAFE.json", { status: "FAIL_OR_UNKNOWN", error: safeError(e),
    atUTC: new Date().toISOString(), noAutomaticRetry: true, cleanupConfirmed: false }); } catch { /* first report retained */ }
  console.error(JSON.stringify(safeError(e))); process.exitCode = 1;
});
module.exports = { checkpointAssessment, authCoverageAssessment, observeAuth };
