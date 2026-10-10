"use strict";
const A = require("node:assert/strict"), P = require("../lib/helmut/publication-eligibility");
const S = require("../lib/helmut/storage"), D = require("../lib/helmut/decisions");
const own = "https://publisher.example/article-123.html";
const policyText = JSON.stringify({ version: 1, holds: [{ publicationUrl: own,
  reason: "unresolved-event-relation", review: { id: "synthetic-review", receiptSHA256: "a".repeat(64),
    koSHA256: "b".repeat(64), sourceSHA256: "c".repeat(64) } }] });
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
const activate = () => { process.env[P.ENV] = policyText; };
const deactivate = () => { delete process.env[P.ENV]; };
const profile = { id: "publication-test", fullName: "Alex Beispiel", committees: ["Haushaltsausschuss"] };
const now = new Date();
const ko = (suffix, url = own) => ({ id: "ko-" + suffix, vorgang_id: "vg-" + suffix, status: "neu",
  understanding_status: "complete", headline: "Bundestag beraet Haushalt " + suffix,
  display_title: "Bundestag beraet Haushalt " + suffix, display_summary: "Der Bundestag beraet den Haushalt in erster Lesung.",
  was_ist_passiert: "Der Bundestag beraet den Haushalt in erster Lesung.", best_source_url: url,
  created_at: now.toISOString(), updated_at: now.toISOString(), recommendation: "Haushaltsunterlagen pruefen." });
const doc = (k, url = k.best_source_url) => ({ id: "rd-" + k.id, title: k.headline,
  summary: k.display_summary, url, canonical_url: url, published_at: now.toISOString() });
const metadata = async rows => Object.fromEntries(rows.map(k => [k.id, [doc(k)]]));
const callWitness = async env => {
  const W = require("../lib/helmut/dip-resolver-runtime-witness");
  let result;
  await W.handleRequest({ method: "GET", headers: { "x-helmut-production-commit": "d".repeat(40),
    ...(env[P.ENV] ? { "x-helmut-publication-eligibility-hash": P.parse(env[P.ENV]).hash } : {}) } },
  { writeHead(status) { this.status = status; }, end(body) { result = { status: this.status, body: JSON.parse(body) }; } },
  new URL("https://fixture.invalid" + W.PATH), { jsonHeaders: x => x, env: { VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_SHA: "d".repeat(40), VERCEL_DEPLOYMENT_ID: "dpl_fixture", ...env } });
  return result;
};
(async () => {
  deactivate();
  await test("Default/empty identical, strict bounded malformed policy and canonical identity", () => {
    A.deepEqual(P.parse(undefined), P.parse("")); A.deepEqual(P.parse(""), P.parse('{"version":1,"holds":[]}'));
    A.equal(P.identity("https://www.publisher.example/article-123.html?utm_source=test#picture"), own);
    A.notEqual(P.identity(own + "?issue=2"), own);
    A.equal(P.identity(own + "?igshid=one&mc_cid=two&mc_eid=three"), own);
    A.equal(P.identity("http://www.publisher.example/article-123.html?utm_medium=x#photo"), own);
    for (const raw of [" ", "null", "{}", '{"version":2,"holds":[]}', policyText.replace("https:", "http:"),
      policyText.replace("unresolved-event-relation", "irrelevant"), policyText.replace('"a'.concat("a".repeat(63)), '"bad')])
      A.throws(() => P.parse(raw), e => e.statusCode === 503);
    const double = JSON.parse(policyText); double.holds.push(double.holds[0]); A.throws(() => P.parse(JSON.stringify(double)));
  });
  await test("Complete link read sees held secondary source beyond40; no source/KO mutation", async () => {
    activate(); const k = Object.freeze(ko("mixed", "https://other.example/safe")), original = JSON.stringify(k);
    const rows = Array.from({ length: 41 }, (_, i) => ({ knowledge_object_id: k.id, raw_document_id: "rd-" + i,
      raw_documents: { id: "rd-" + i, url: i === 40 ? own : "https://other.example/" + i, canonical_url: null } }));
    const sources = await S.getPublicationSourceIdentities([k], { request: async path => {
      A(path.includes("limit=1000")); A(!path.includes("limit=40")); const offset = Number(new URL(path, "https://fixture.invalid").searchParams.get("offset"));
      return rows.slice(offset, offset + 40); } });
    A.equal((await P.filterCandidates({ getPublicationSourceIdentities: async () => sources }, [k])).length, 0);
    A.equal(JSON.stringify(k), original);
    await A.rejects(P.filterCandidates({ getPublicationSourceIdentities: async () => ({}) }, [k]));
    await A.rejects(S.getPublicationSourceIdentities([k], { request: async () => [...rows, rows[0]] }));
  });
  await test("Re-intake/newKO/newSource/changedcontent stays withheld, unrelated remains unchanged", async () => {
    const target = ko("new-id"), safe = Object.freeze(ko("safe", "https://other.example/safe"));
    target.display_summary = "Changed article contents";
    const before = JSON.stringify([target, safe]);
    const eligible = await P.filterCandidates({ getPublicationSourceIdentities: metadata }, [target, safe]);
    A.deepEqual(eligible.map(k => k.id), [safe.id]); A(P.known(eligible[0])); A(P.known({ ...eligible[0] }));
    A.equal(JSON.stringify([target, safe]), before); A.equal(JSON.stringify(eligible[0]), JSON.stringify(safe));
    A.throws(() => P.assertKnown(safe));
    const transported = ko("http", "http://www.publisher.example/article-123.html?utm_campaign=x");
    A.equal((await P.filterCandidates({ getPublicationSourceIdentities: async () => ({ [transported.id]: [] }) }, [transported])).length, 0);
    A.equal((await P.filterCandidates({ getPublicationSourceIdentities: async () => ({ [safe.id]: [{ url: transported.best_source_url, canonical_url: safe.best_source_url }] }) }, [safe])).length, 0);
  });
  await test("Window refills before ranking and complete metadata pagination is bounded", async () => {
    const rows = [ko("held"), ko("safe1", "https://other.example/1"), ko("safe2", "https://other.example/2")];
    const calls = [];
    const out = await P.listCandidates({ getPublicationSourceIdentities: metadata,
      listKnowledgeObjects: async opts => { A.equal(opts._signalError, true); calls.push([opts.limit, opts.offset]); return rows.slice(opts.offset, opts.offset + opts.limit); }
    }, { limit: 2 });
    A.deepEqual(out.map(k => k.id), ["ko-safe1", "ko-safe2"]); A.deepEqual(calls, [[2,0],[1,2]]);
    const capped = await P.listCandidates({ getPublicationSourceIdentities: metadata,
      listKnowledgeObjects: async opts => rows.slice(opts.offset, opts.offset + 1) }, { limit: 2 });
    A.deepEqual(capped.map(k => k.id), ["ko-safe1", "ko-safe2"]);
    let pages = 0;
    const graph = await S.getPublicationSourceIdentities([rows[1]], { request: async path => {
      const offset = Number(new URL(path, "https://fixture.invalid").searchParams.get("offset")); pages++;
      return Array.from({ length: offset === 0 ? 1000 : offset === 1000 ? 1 : 0 }, (_, i) => ({ knowledge_object_id: rows[1].id,
        raw_document_id: "rd-" + (offset + i), raw_documents: { id: "rd-" + (offset + i), url: "https://other.example/" + (offset + i) } })); } });
    A.equal(graph[rows[1].id].length, 1001); A.equal(pages, 3);
    await A.rejects(P.listCandidates({ listKnowledgeObjects: async () => ({ __storeError: true }) }, { limit: 2 }));
  });
  await test("Malformed/configdrift/readfailure fail closed, cache and explicit release bound", async () => {
    const before = P.current(), cache = P.bindCache("old-cache"); A.notEqual(cache, "old-cache");
    A.throws(() => P.assertRecorded(undefined)); P.assertRecorded(P.publicInfo());
    const safe = ko("safe", "https://other.example/safe");
    await A.rejects(P.filterCandidates({ getPublicationSourceIdentities: async () => { deactivate(); return metadata([safe]); } }, [safe], before));
    A.equal(P.bindCache("old-cache"), "old-cache"); A.throws(() => P.assertRecorded(P.publicInfo(before)));
    activate(); await A.rejects(P.filterCandidates({ getPublicationSourceIdentities: async () => { throw new Error("offline failure"); } }, [safe]));
    A.throws(() => P.assertCaptureHeader({})); P.assertCaptureHeader({ "x-helmut-publication-eligibility-hash": P.current().hash });
    deactivate(); A.throws(() => P.assertCaptureHeader({ "x-helmut-publication-eligibility-hash": before.hash }));
  });
  await test("Release identity active snapshot and legacyfilter evidence, empty default unchanged", async () => {
    const normal = await callWitness({}); A.equal(normal.status, 200); A(!Object.hasOwn(normal.body, "publicationEligibilityPolicy"));
    const active = await callWitness({ [P.ENV]: policyText }); A.equal(active.status, 200);
    A.deepEqual(active.body.publicationEligibilityPolicy, P.publicInfo(P.parse(policyText)));
    A.equal(active.body.sourceSafetyStandard, false); A.equal(active.body.legacySourceFiltersActive, false);
    const legacy = await callWitness({ [P.ENV]: policyText, HELMUT_SOURCE_BLOCKLIST: "publisher.example" });
    A.equal(legacy.body.legacySourceFiltersActive, true);
  });
  // The actual builders with synthetic in-memory DB reads only.
  let candidates = [ko("held"), ko("safe", "https://other.example/safe")];
  const before = JSON.stringify(candidates); let forbidden = 0;
  global.fetch = () => { forbidden++; throw Error("network forbidden"); };
  for (const name of ["saveKnowledgeObject", "saveRawDocument", "saveRenderedBriefingV3", "insertRenderedBriefingV3",
    "saveDecisions", "acquirePipelineLock"]) S[name] = () => { forbidden++; throw Error("write forbidden"); };
  for (const key of Object.keys(require("../lib/helmut/ai")))
    if (typeof require("../lib/helmut/ai")[key] === "function") require("../lib/helmut/ai")[key] = () => { forbidden++; throw Error("model forbidden"); };
  S.v3StoreReady = () => true; S.getPublicationSourceIdentities = metadata;
  S.listKnowledgeObjects = async ({ limit = 500, offset = 0 } = {}) => candidates.slice(offset, offset + limit);
  S.getSourcesForVorgang = async id => [doc(candidates.find(k => k.vorgang_id === id))];
  S.listMatchingResults = async () => candidates.map(k => ({ knowledge_object_id: k.id }));
  S.listKnowledgeObjectsByIds = async ids => candidates.filter(k => ids.includes(k.id));
  S.listAktuelleLageQuellen = async ids => candidates.filter(k => ids.includes(k.id))
    .map(k => ({ knowledge_object_id: k.id, raw_documents: doc(k) }));
  S.getRenderedBriefingV3 = async () => null;
  D.decideForUser = (_p, rows) => rows.map((k, i) => ({ knowledge_object_id: k.id, vorgang_id: k.vorgang_id,
    score: 90 - i, decision: "Beobachten", priority_type: "watch", matched_features: [] }));
  S.getProfile = async () => profile;
  const server = require("../server");
  const build = () => server.__buildV3Briefing(profile, profile.id, { now, aussagenEingabe: true });
  await test("Actual normal Briefing/Helmut/Radar removes held item/actions, defaultbyteequivalent", async () => {
    deactivate(); const original = await build(); process.env[P.ENV] = '{"version":1,"holds":[]}';
    A.equal(JSON.stringify(await build()), JSON.stringify(original)); activate(); const active = await build();
    A.deepEqual(active.briefing.items.map(i => i.vorgangId), ["vg-safe"]);
    A(!JSON.stringify(active.briefing).includes("vg-held"));
    A.deepEqual(active.eingabe.publicationEligibilityPolicy, P.publicInfo());
    A(!active.eingabe.aussagen.some(a => a.text === P.current().hash));
    A.equal(JSON.stringify(candidates), before); A.equal(forbidden, 0);
  });
  await test("Actual Lage storedmatch refill and independent Radar path remain usable", async () => {
    const L = require("../lib/helmut/lage");
    const out = await L.loadRankedVorgaenge(S, require("../lib/helmut/matching").matchProfileToKnowledgeObjects, profile, profile.id);
    A.deepEqual(out.map(k => k.id), ["ko-safe"]);
    const r = await require("../lib/helmut/radar").buildRadarForUser({ profile, limit: 60 });
    A(!JSON.stringify(r).includes("vg-held")); A.equal(forbidden, 0);
    const defaultCache = P.bindCache("old-cached-source-set"); deactivate(); A.notEqual(defaultCache, P.bindCache("old-cached-source-set"));
  });
  await test("Actual active Matching RPC refills safe ranks and propagates policy/read failures", async () => {
    activate(); const rows = candidates.map((k, i) => ({ id: k.id, similarity: 1 - i / 10 })), requests = [];
    const deps = { storeReady: () => true, request: async (_path, opts) => {
      const n = JSON.parse(opts.body).match_count; requests.push(n); return rows.slice(0, n);
    } };
    const out = await S.matchKnowledgeObjectsByEmbedding({ embedding: [0.5], matchCount: 1 }, deps);
    A.deepEqual(out.results.map(r => r.id), ["ko-safe"]); A.deepEqual(requests, [1,2]);
    for (const matchCount of [Infinity, 501, 0, 1.5])
      await A.rejects(S.matchKnowledgeObjectsByEmbedding({ embedding: [0.5], matchCount }, deps), e => e.code === "PUBLICATION_ELIGIBILITY_UNAVAILABLE");
    const reader = S.getPublicationSourceIdentities;
    S.getPublicationSourceIdentities = async () => { throw new Error("source outage"); };
    try { await A.rejects(S.matchKnowledgeObjectsByEmbedding({ embedding: [0.5], matchCount: 1 }, deps), e => e.statusCode === 503); }
    finally { S.getPublicationSourceIdentities = reader; }
    deactivate(); requests.length = 0;
    A.deepEqual((await S.matchKnowledgeObjectsByEmbedding({ embedding: [0.5], matchCount: 1 }, deps)).results, [rows[0]]);
    A.deepEqual(requests, [1]); activate(); A.equal(forbidden, 0);
  });
  await test("Actual current stored GET rebuilds pre-policy and same-policy changedsource without writes/models", async () => {
    activate(); const B = require("../lib/helmut/briefing-speicher"), oldLese = B.lese;
    process.env.CRON_SECRET = "synthetic-publication-test-secret";
    const oldBriefing = (await build()).briefing;
    oldBriefing.items = [{ vorgangId: "vg-held", title: "OLD HELD STORED ARTICLE" }];
    const serialized = JSON.stringify(oldBriefing);
    try {
      for (const samePolicy of [false, true]) {
        const stored = JSON.parse(serialized);
        if (!samePolicy) delete stored.publicationEligibilityPolicy;
        B.lese = async () => ({ id: "stored-fixture", payload: { briefing: stored }, generated_at: now.toISOString() });
        const result = await new Promise(resolve => server({ method: "GET",
          url: "/api/cron/briefing-nachweis?mandat=publication-test&tag=" + now.toISOString().slice(0,10),
          headers: { host: "localhost", authorization: "Bearer synthetic-publication-test-secret",
            "x-helmut-publication-eligibility-hash": P.current().hash } },
          { headersSent: false, writeHead(status) { this.status = status; this.headersSent = true; },
            end(body) { resolve({ status: this.status, body: JSON.parse(body) }); } }));
        A.equal(result.status, 200); A(!JSON.stringify(result.body).includes("vg-held"));
        A.deepEqual(result.body.publicationEligibilityPolicy, P.publicInfo());
        A.equal(result.body.aktuellerLesestand.reinLesend, true);
        A.equal(result.body.lageBriefing.available, true);
        A.equal(result.body.lageBriefing.fromCache, false);
        A.equal(result.body.lageBriefing.pendingNarrative, true);
        A.deepEqual(result.body.lageBriefing.paragraphs, []);
        A.deepEqual(result.body.lageBriefing.vorgaenge.map(v => v.vorgangId), ["vg-safe"]);
        A.equal(result.body.aktuellerLesestand.gespeicherterStandVeraltet, !samePolicy);
        A.equal(JSON.stringify(stored), JSON.stringify(samePolicy ? JSON.parse(serialized) : (() => { const copy = JSON.parse(serialized); delete copy.publicationEligibilityPolicy; return copy; })()));
      }
      A.equal(forbidden, 0);
    } finally { B.lese = oldLese; delete process.env.CRON_SECRET; }
  });
  await test("Actual active Lage rejects stale stored narrative and policy drift", async () => {
    const L = require("../lib/helmut/lage"), oldRead = S.getRenderedBriefingV3;
    S.getRenderedBriefingV3 = async () => ({ payload: { koSetHash: "old-cache", paragraphs: [{ text: "OLD HELD STORED ARTICLE", vorgang_ids: ["vg-held"] }] } });
    try {
      const current = await L.buildLageBriefing(profile, { politicianId: profile.id, cacheOnly: true });
      A(!JSON.stringify(current).includes("OLD HELD")); A(!JSON.stringify(current).includes("vg-held"));
      A.equal(current.pendingNarrative, true); A.equal(forbidden, 0);
      S.getRenderedBriefingV3 = async () => { deactivate(); return null; };
      await A.rejects(L.buildLageBriefing(profile, { politicianId: profile.id, cacheOnly: true }), e => e.message === "publication-eligibility-policy-drift");
      activate();
    } finally { S.getRenderedBriefingV3 = oldRead; }
  });
  deactivate(); console.log(`${passed}/${passed} publication eligibility groups passed`);
})().catch(e => { deactivate(); console.error(e); process.exitCode = 1; });
