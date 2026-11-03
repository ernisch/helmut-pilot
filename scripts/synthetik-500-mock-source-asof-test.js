"use strict";
// Synthetic inputs and an explicit local verifier only: no originals, DB or model.
const A = require("node:assert/strict");
const Replay = require("../lib/helmut/synthetik-500-mock-source-replay");
const Input = require("../lib/helmut/synthetik-500-lage-input");
const B = require("../lib/helmut/briefing-lagebindung");
const Statements = require("../lib/helmut/briefing-aussagenbindung");
const P = require("../lib/helmut/synthetik-500-profile");
const L = require("../lib/helmut/lage"), S = require("../lib/helmut/storage"), ai = require("../lib/helmut/ai");
const Q = require("../lib/helmut/lage-quellenbeleg");
const now = new Date(), iso = ms => new Date(ms).toISOString();
const day = require("../lib/helmut/briefing-frische").berlinTagKey(now);
const sourceAsOfISO = iso(now.getTime() - 21 * 86400000);
const utcEnd = Date.parse(now.toISOString().slice(0, 10) + "T23:59:59.999Z");
let endDay = utcEnd;
while (require("../lib/helmut/briefing-frische").berlinTagKey(new Date(endDay)) !== day) endDay -= 60000;
const starts = Math.min(now.getTime() - 1000, endDay - 12600000);
const window = { startsAtUTC: iso(starts), endsAtUTC: iso(starts + 10800000 - 1),
  completionDeadlineUTC: iso(starts + 12600000 - 1) };
if (now.getTime() >= Date.parse(window.endsAtUTC)) {
  console.log("SKIP positive live-clock capability cases outside admissible processing day"); process.exit(0);
}
function row(index) {
  const profile = { id: "source-asof-synthetic-" + index, committees: ["Haushaltsausschuss"] };
  const ko = { id: "ko-synthetic", vorgang_id: "vg-synthetic", headline: "Synthetische Haushaltsberatung",
    was_ist_passiert: "Eine synthetische Beratung zum Haushalt ist vorgesehen.", understanding_status: "complete",
    status: "ready", updated_at: sourceAsOfISO };
  const sourcesByVorgang = { [ko.vorgang_id]: [{ id: "doc-synthetic", title: ko.headline,
    summary: ko.was_ist_passiert, source_name: "Synthetischer Bundestag", url: "https://www.bundestag.de/dokumente/synthetic-asof-test",
    published_at: iso(Date.parse(sourceAsOfISO) - 3600000) }] };
  const briefing = { available: true, items: [{ vorgangId: ko.vorgang_id, title: ko.headline, summary: ko.was_ist_passiert }] };
  const eingabe = Statements.baueEingabe({ briefing, kos: [ko], sourcesByVorgang, profile, userId: profile.id, day });
  const urteil = { version: Statements.VERSION, eingabeHash: eingabe.eingabeHash, ursprungHash: eingabe.eingabeHash,
    ausgelasseneVorgaenge: [], aussagen: eingabe.aussagen.map(a => ({ ...a, sachlichGetragen: true,
      kontextGetragen: true, mandatsbezugGetragen: true, begruendung: "Fiktives technisches Urteil.",
      belege: [{ vorgangId: ko.vorgang_id, documentId: "doc-synthetic", feld: "auszug", text: ko.was_ist_passiert }] })) };
  const result = { briefing, eingabe, korrekturBasis: { kos: [ko], sourcesByVorgang } };
  urteil.gesamtpruefung = require("./fixtures/briefing-fachurteil")(result, urteil);
  return { profile, briefingDatum: now.toISOString(), briefingEingabe: B.baue(result, urteil) };
}
const rows = Array.from({ length: 500 }, (_, index) => row(index));
const bounds = rows.map(r => B.pruefe(r.briefingEingabe, r.profile, r.profile.id, now));
const authorization = { schema: Replay.AUTH_SCHEMA, contract: Replay.CONTRACT,
  branch: "refs/heads/codex/w15-github-end500-preparation-20261028", exactCommit: "a".repeat(40), runId: "12345678",
  runAttempt: 1, nonce: "12345678-1234-4123-8123-123456789abc", approvalSHA256: "b".repeat(64),
  sourceQualificationSHA256: "c".repeat(64), productionAllowed: false, paidModelsAllowed: false };
function record(purpose = "EXECUTION") {
  return { schema: Replay.GRANT_SCHEMA, contract: Replay.CONTRACT, purpose, authorization: { ...authorization },
    sourceAsOfISO, executionISO: now.toISOString(), window: { ...window }, qualificationPins: { ...Replay.PINS },
    operationId: purpose === "EXECUTION" ? "synthetik500-source-asof-fixture" : null,
    commandHash: purpose === "EXECUTION" ? "d".repeat(64) : null,
    bindings: rows.map((r, index) => ({ index, owner: r.profile.id, profileHash: P.hash(r.profile),
      briefingEingabeHash: P.hash(r.briefingEingabe), briefingDatum: r.briefingDatum,
      sourceProjectionSHA256: P.hash({ ranked: bounds[index].ranked, sources: bounds[index].sources }),
      requestBodySHA256: purpose === "EXECUTION" ? "e".repeat(64) : null,
      reviewRequestBodySHA256: purpose === "EXECUTION" ? "f".repeat(64) : null })) };
}
function selection(r, index = 0) {
  return { index, runId: r.authorization.runId, runAttempt: 1, nonce: r.authorization.nonce,
    exactCommit: r.authorization.exactCommit, operationId: r.operationId, commandHash: r.commandHash };
}
function issue(r = record()) { const issuer = Replay.createIssuer(() => r); return { issuer, grant: issuer.issue(), r }; }
function attach(g, index = 0, d = rows[index]) {
  const token = Input.create(d); Input.bindMockSourceReplay(token, g.grant, selection(g.r, index)); return token;
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
(async () => {
  await test("ordinary API/env metadata and cloned grants cannot authorize a source clock", async () => {
    A.throws(() => Replay.createIssuer({ verified: true }), /trusted-verifier/);
    A.throws(() => Input.bindMockSourceReplay(Input.create(rows[0]), record(), selection(record())), /grant/);
    process.env.HELMUT_MOCK_SOURCE_ASOF = sourceAsOfISO;
    const finite = Input.read(Input.create(rows[0]), rows[0].profile);
    A.equal(finite.mockSourceReplay, undefined); delete process.env.HELMUT_MOCK_SOURCE_ASOF;
    const g = issue(); A.throws(() => Input.bindMockSourceReplay(Input.create(rows[0]), structuredClone(g.grant), selection(g.r)), /grant/);
    A.throws(() => Input.read({}, rows[0].profile), /forged/);
  });
  await test("all500 bindings are complete and immutable and share the one historical source time", async () => {
    const g = issue(record("PREPARATION")), inputHashes = rows.map(P.hash);
    for (let index = 0; index < 500; index++) {
      const token = attach(g, index), b = bounds[index];
      const p = L.projectFiniteDContext(b.ranked, b.sources, now, b, token, rows[index].profile, { preparation: true });
      A.equal(p.koLite.length, 1); A.equal(p.koLite[0].historischerKontext.sourceCaptureUTC, sourceAsOfISO);
      A.equal(p.koLite[0].historischerKontext.currentSourceAcceptance, false);
      A.equal(Input.read(token, rows[index].profile, { preparation: true }).briefingDatum, now.toISOString());
    }
    A.deepEqual(rows.map(P.hash), inputHashes);
    g.r.sourceAsOfISO = now.toISOString();
    A.equal(Input.read(attach(g, 499), rows[499].profile, { preparation: true }).mockSourceReplay.sourceAsOfISO, sourceAsOfISO);
    for (const mutate of [r => r.bindings.pop(), r => r.bindings[499].owner = r.bindings[0].owner,
      r => r.qualificationPins.reportSHA256 = "0".repeat(64), r => r.sourceAsOfISO = iso(Date.now() + 86400000)]) {
      const r = record(); mutate(r); A.throws(() => issue(r), /mock-source-replay/);
    }
  });
  await test("actual build rejects PREPARATION authority before model or storage work", async () => {
    const g = issue(record("PREPARATION")), token = attach(g);
    A.throws(() => Input.read(token, rows[0].profile), /preparation-not-execution/);
    const ready = S.v3StoreReady; S.v3StoreReady = () => true;
    try { await A.rejects(L.buildLageBriefing(rows[0].profile, { synthetik500Input: token, preparation: true }), /preparation-not-execution/); }
    finally { S.v3StoreReady = ready; }
  });
  await test("expired, revoked, wrong tuple, owner/input drift and unit replay fail closed", async () => {
    const expired = record(); expired.window.startsAtUTC = iso(Date.now() - 10800001);
    expired.window.endsAtUTC = iso(Date.now() - 2); expired.window.completionDeadlineUTC = iso(Date.now() + 1799998);
    A.throws(() => issue(expired), /window|execution-time/);
    const g = issue(), token = attach(g);
    A.throws(() => attach(g), /unit-replayed/);
    for (const change of [{ nonce: authorization.nonce.replace("12345678", "aaaaaaaa") }, { runId: "87654321" },
      { runAttempt: 2 }, { exactCommit: "b".repeat(40) }, { operationId: "synthetik500-other-fixture" }, { commandHash: "a".repeat(64) }])
      A.throws(() => Input.bindMockSourceReplay(Input.create(rows[1]), g.grant,
        { ...selection(g.r, 1), ...change }), /run-binding|selector/);
    const wrong = structuredClone(rows[2]); wrong.briefingEingabe.eingabe.tag = "2000-01-01";
    A.throws(() => attach(g, 2, wrong), /input-binding/);
    A.throws(() => Input.read(token, { ...rows[0].profile, id: "another" }), /profile-drift/);
    g.issuer.revoke(g.grant); A.throws(() => Input.read(token, rows[0].profile), /grant/);
    A.throws(() => g.issuer.issue(), /issuer-reused/);
  });
  await test("shared real projector preserves stale default and rejects projection drift", async () => {
    const b = bounds[0]; A.equal(L.prepareDContext(b.ranked, b.sources, now, b).koLite.length, 0);
    const g = issue(), token = attach(g);
    const result = L.projectFiniteDContext(b.ranked, b.sources, now, b, token, rows[0].profile);
    A.equal(result.koLite.length, 1);
    const changed = structuredClone(b.sources); changed["vg-synthetic"][0].summary += " drift";
    A.throws(() => L.projectFiniteDContext(b.ranked, changed, now, b, token, rows[0].profile), /projection-drift/);
    A.equal(L.prepareDContext(b.ranked, b.sources, now, b).koLite.length, 0);
    const stillOld = record("PREPARATION"); stillOld.sourceAsOfISO = iso(now.getTime() - 86400000);
    const oldGrant = issue(stillOld), oldToken = attach(oldGrant);
    A.equal(L.projectFiniteDContext(b.ranked, b.sources, now, b, oldToken, rows[0].profile,
      { preparation: true }).koLite.length, 0, "old-at-capture sources must still fail the unchanged age filter");
  });
  await test("real Lage stores and returns an explicit historical label with real generatedAt; default does not reuse it", async () => {
    let cache = null, calls = 0, writes = 0;
    S.v3StoreReady = () => true; S.getRenderedBriefingV3 = async () => structuredClone(cache);
    S.acquirePipelineLock = async () => true; S.releasePipelineLock = async () => {};
    S.canSpendLlmForTenant = async () => ({ allowed: true });
    S.insertRenderedBriefingV3 = async entry => { cache = structuredClone(entry); writes++; return { saved: true }; };
    S.saveRenderedBriefingV3 = async () => { throw Error("unexpected overwrite"); };
    ai.generateLageBriefing = async input => { calls++; return { paragraphs: input.map(v => ({
      text: v.quellenbelege[0].titel, vorgang_ids: [v.vorgang_id], quellen_ids: [v.quellenbelege[0].quelle_id],
      belegstellen: [{ quelle_id: v.quellenbelege[0].quelle_id, text: v.quellenbelege[0].titel }] })),
      qualitaet: { version: require("../lib/helmut/lage-textqualitaet").VERSION } }; };
    const options = token => ({ synthetik500Input: token, briefingEingabe: rows[0].briefingEingabe,
      missingOnly: true, repairIncomplete: true, beforeGenerate: async () => {}, beforeSave: async () => {} });
    const ordinary = await L.buildLageBriefing(rows[0].profile, options(Input.create(rows[0])));
    A.equal(ordinary.reason, "no-current-sources"); A.equal(calls + writes, 0);
    const g = issue(), token = attach(g), begun = Date.now();
    const result = await L.buildLageBriefing(rows[0].profile, options(token));
    A.equal(result.available, true); A.equal(calls, 1); A.equal(writes, 1);
    A.equal(cache.payload.mockHistoricalSourceContext.currentSourceAcceptance, false);
    A.equal(result.mockHistoricalSourceContext.sourceAsOfISO, sourceAsOfISO);
    A(Date.parse(cache.generated_at) >= begun && Date.parse(cache.generated_at) <= Date.now());
    A.equal(cache.payload.quellen[0].historischerKontext.version, Replay.CONTRACT);
    const baseHash = require("../lib/helmut/publication-eligibility").bindCache(
      require("../lib/helmut/briefing-speicher").hash({ ranked: bounds[0].ranked, briefingEingabeHash: bounds[0].eingabeHash }).slice(0, 32),
      require("../lib/helmut/publication-eligibility").current());
    A.notEqual(cache.payload.koSetHash, baseHash);
    const again = await L.buildLageBriefing(rows[0].profile, options(Input.create(rows[0])));
    A.equal(again.available, false); A(["no-current-sources", "existing-result"].includes(again.reason)); A.equal(calls, 1);
    A.equal(Q.baueEingabe(bounds[0].ranked, bounds[0].sources, now).length, 0);
  });
  await test("revocation during real application work prevents the result write", async () => {
    let writes = 0; S.getRenderedBriefingV3 = async () => null;
    S.insertRenderedBriefingV3 = async () => { writes++; return { saved: true }; };
    const g = issue(), token = attach(g);
    await A.rejects(L.buildLageBriefing(rows[0].profile, { synthetik500Input: token,
      briefingEingabe: rows[0].briefingEingabe, missingOnly: true, repairIncomplete: true,
      beforeGenerate: async () => {}, beforeSave: async () => g.issuer.revoke(g.grant) }), /mock-source-replay-grant/);
    A.equal(writes, 0);
  });
  console.log("PASS " + passed + " focused Mock source-AsOf groups; no original/DB/model execution");
})().catch(error => { console.error(error); process.exitCode = 1; });
