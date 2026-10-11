#!/usr/bin/env node
"use strict";

// Read authenticated private originals through the actual finite D sender.
// Stop before its first budget/model/write gate; this is no Production admission.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict");
const P = require("../lib/helmut/synthetik-500-profile");
const SENTINEL = "historical-preflight-stop-before-paid-work";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const EXPECTED_MISSING = [6,12,84,95,100,108,132,134,151,156,159,164,196,201,204,228,276,292,300,313,342,350,374,388,399,414,420,430,439,460,468,487];
const CODE_FILES = ["lage.js", "briefing-lagebindung.js", "blocker2-d-historical-binding.js", "lage-quellenbeleg.js",
  "ai.js", "lage-textqualitaet.js", "synthetik-500-lage-input.js", "synthetik-500-production-command.js",
  "knowledge-object-version.js", "publication-eligibility.js", "sourceSafety.js", "briefing-quellenqualitaet.js",
  "briefing-aussagenbindung.js", "briefing-ereignisteilmitglieder.js", "artikelstand.js", "quellen-zeitvertrag.js", "storage.js",
  "synthetik-500-profile.js", "streaming-canonical-hash.js", "briefing-speicher.js", "quellen-auszug.js", "briefing-frische.js"];
function codeHashes() {
  const files = CODE_FILES.map(name => path.resolve(__dirname, "../lib/helmut", name)).concat(__filename);
  return Object.fromEntries(files.map(file => [path.relative(path.resolve(__dirname, ".."), file), sha(fs.readFileSync(file))]));
}
function guardNetwork(counters) {
  const restorers = [], deny = () => { counters.forbiddenNetwork++; throw Error("historical-preflight-network-forbidden"); };
  for (const [object, keys] of [[globalThis, ["fetch", "WebSocket", "EventSource"]],
    [require("node:http"), ["request", "get"]], [require("node:https"), ["request", "get"]],
    [require("node:net"), ["connect", "createConnection"]], [require("node:tls"), ["connect"]],
    [require("node:child_process"), ["exec", "execFile", "spawn", "fork", "execSync", "execFileSync", "spawnSync"]]]) {
    for (const key of keys) { const original = object[key]; object[key] = deny; restorers.push(() => { object[key] = original; }); }
  }
  return () => restorers.reverse().forEach(restore => restore());
}
async function runPreflight({ privateBase, out, positions = Array.from({ length: 500 }, (_, i) => i + 1) }) {
  assert(path.isAbsolute(privateBase) && path.isAbsolute(out), "absolute private paths required");
  assert(path.resolve(out).startsWith(fs.realpathSync(privateBase) + path.sep), "receipt must remain inside private base");
  const initialCodeHashes = codeHashes(), counters = { forbiddenNetwork: 0, forbiddenStorage: 0,
    forbiddenModel: 0, cacheReads: 0, eligibilityReads: 0, localLocks: 0, localUnlocks: 0, beforeGenerateStops: 0 };
  const restoreNetwork = guardNetwork(counters), restorers = [];
  try {
  const sourceDir = path.join(privateBase, "current-source-binding");
  const nativeReceiptFile = path.join(sourceDir, "receipt.json"), nativeReceipt = read(nativeReceiptFile);
  const membershipFile = path.join(privateBase, "contract/membership-manifest.json"), membership = read(membershipFile);
  assert(sha(fs.readFileSync(nativeReceiptFile)) === "25d863375908f34d836917946d5840ef922600b1e7dd735873fa96533214fe3b",
    "original native read receipt");
  assert(P.hash(membership) === "4a8551f54487979610269d86e674f6b1622651fe454e23aa361c3ede7c8602b6",
    "accepted membership manifest");
  const boundFiles = ["native-response.json", "current-sources.json", "publication-identities.json", "field-comparison.json"];
  for (const name of boundFiles) {
    const expected = nativeReceipt.files.find(f => f.name === name), bytes = fs.readFileSync(path.join(sourceDir, name));
    assert(expected && bytes.length === expected.bytes && sha(bytes) === expected.sha256, "native archive hash: " + name);
  }
  assert(nativeReceipt.transaction.readOnly === "on" && nativeReceipt.transaction.isolation === "repeatable read");
  assert(nativeReceipt.all500OriginalFieldComparisons && nativeReceipt.fieldDifferences === 0);
  assert(nativeReceipt.scopeCounts.documents === 874 && nativeReceipt.scopeCounts.knowledgeObjects === 500
    && nativeReceipt.scopeCounts.publicationLinks === 972);
  assert(membership.acceptedProfiles === 500 && membership.rows.length === 500);
  const sources = read(path.join(sourceDir, "current-sources.json")), identities = read(path.join(sourceDir, "publication-identities.json"));
  const docs = new Map(sources.documents.map(d => [d.id, d])), kos = new Map(sources.knowledgeObjects.map(k => [k.id, k]));
  assert(P.hash(sources) === nativeReceipt.nativeVersionProjection.currentSourceCanonicalHash);
  const policyFile = path.join(privateBase, "analysis/shard36/restored/workspace/blocker2-replacement-root-20261011/renewed-policy-config-scope-runtime-adapter.json");
  const eligibility = require("../lib/helmut/publication-eligibility");
  const previousPolicy = process.env[eligibility.ENV], previousDemo = process.env.HELMUT_LAGE_DEMO;
  process.env[eligibility.ENV] = read(policyFile).environmentValue;
  process.env.HELMUT_LAGE_DEMO = "off";
  restorers.push(() => { if (previousPolicy === undefined) delete process.env[eligibility.ENV]; else process.env[eligibility.ENV] = previousPolicy;
    if (previousDemo === undefined) delete process.env.HELMUT_LAGE_DEMO; else process.env.HELMUT_LAGE_DEMO = previousDemo; });
  const policy = eligibility.current();
  assert(policy.hash === nativeReceipt.publication.policyHash && policy.hash === "274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04");
  const storage = require("../lib/helmut/storage"), ai = require("../lib/helmut/ai"), Q = require("../lib/helmut/lage-quellenbeleg");
  const L = require("../lib/helmut/briefing-lagebindung"), H = require("../lib/helmut/blocker2-d-historical-binding");
  const C = require("../lib/helmut/synthetik-500-production-command"), T = require("../lib/helmut/synthetik-500-lage-input");
  const Lage = require("../lib/helmut/lage"), R = require("../lib/helmut/lage-textqualitaet");
  C.validateSources(sources);
  assert.equal(typeof C.originalSourcesMatch, "function", "shared native Source23/KO60 projection guard must be exported");
  assert(membership.merkleRoot === H.recomputeRoot(read(path.join(privateBase, "contract/0001-proof.json"))));
  // Exercise the real native pagination/identity validator over the sealed SQL rows.
  const nativeLinks = read(path.join(sourceDir, "native-response.json"))[0].source_binding.publicationLinks;
  const replayedIdentities = await storage.getPublicationSourceIdentities(sources.knowledgeObjects, { request: async url => {
    const list = /knowledge_object_id=in\.\((.*?)\)&/.exec(url);
    assert(list, "unexpected native identity query");
    const group = list[1].split(",").map(x => JSON.parse(decodeURIComponent(x)));
    const offset = Number(/offset=(\d+)/.exec(url)[1]), limit = Number(/limit=(\d+)/.exec(url)[1]);
    return nativeLinks.filter(row => group.includes(row.knowledge_object_id)).slice(offset, offset + limit);
  } });
  assert(P.hash(replayedIdentities) === P.hash(identities), "complete native publication reader identity");
  const replace = (object, key, value) => { const original = object[key]; object[key] = value; restorers.push(() => { object[key] = original; }); };
  for (const [key, value] of Object.entries(storage)) if (typeof value === "function") replace(storage, key, () => {
    counters.forbiddenStorage++; throw Error("historical-preflight-storage-forbidden:" + key);
  });
  replace(storage, "v3StoreReady", () => true);
  replace(storage, "getPublicationSourceIdentities", async ranked => {
    counters.eligibilityReads++;
    return Object.fromEntries(ranked.map(ko => { assert(Object.hasOwn(identities, ko.id), "unknown native KO"); return [ko.id, structuredClone(identities[ko.id])]; }));
  });
  replace(storage, "getRenderedBriefingV3", async () => { counters.cacheReads++; return null; });
  replace(storage, "acquirePipelineLock", async () => { counters.localLocks++; return true; });
  replace(storage, "releasePipelineLock", async () => { counters.localUnlocks++; });
  for (const key of ["generateLageBriefing", "requestStructuredJson", "requestText"]) replace(ai, key, () => {
    counters.forbiddenModel++; throw Error("historical-preflight-model-forbidden:" + key);
  });
  let captured = null;
  const realHash = Q.hashEingabe;
  replace(Q, "hashEingabe", context => { captured = structuredClone(context); return realHash(context); });
  const rows = [], failures = [], fallbackPositions = [];
    for (const position of positions) {
      const file = path.join(privateBase, "recovery/decrypted", String(position).padStart(4, "0") + ".json");
      try {
        const record = read(file), rawBody = record.response.rawBody, body = JSON.parse(rawBody);
        const proof = read(path.join(privateBase, "contract", String(position).padStart(4, "0") + "-proof.json"));
        assert(sha(rawBody) === record.response.rawBodySHA256 && sha(rawBody) === proof.leaf.bodySHA256);
        assert(P.hash(proof.leaf) === P.hash(membership.rows[position - 1]) && proof.leaf.position === position);
        const basis = { version: 2, briefing: body.result.briefing, eingabe: body.result.eingabe,
          korrekturBasis: body.result.korrekturBasis, acceptedSnapshot: proof };
        const originalBasisHash = P.hash({ briefing: basis.briefing, eingabe: basis.eingabe, korrekturBasis: basis.korrekturBasis });
        assert(originalBasisHash === proof.leaf.basisHash && C.originalSourcesMatch(basis, docs, kos));
        const profile = { ...structuredClone(body.profile), profileActive: true }, briefingDatum = body.erfasstAm;
        const bound = L.pruefe(basis, profile, profile.id, new Date(briefingDatum), { acceptedSnapshot: true });
        const eligible = await eligibility.filterCandidates(storage, bound.ranked, policy);
        const baseline = Lage.prepareDContext(eligible, bound.sources, new Date(briefingDatum),
          { ...bound, historicalSnapshot: null }).koLite;
        captured = null;
        const before = counters.beforeGenerateStops;
        let stopped = false;
        try {
          const result = await Lage.buildLageBriefing(profile, { briefingEingabe: basis,
            synthetik500Input: T.create({ profile, briefingDatum, briefingEingabe: basis }), missingOnly: true,
            beforeGenerate: async owner => { assert(owner === profile.id); counters.beforeGenerateStops++; throw Error(SENTINEL); },
            beforeSave: async () => { counters.forbiddenStorage++; throw Error("historical-preflight-save-forbidden"); } });
          throw Error("sender returned before source handoff: " + (result?.reason || "unknown"));
        } catch (error) { if (error.message !== SENTINEL) throw error; stopped = true; }
        assert(stopped && counters.beforeGenerateStops === before + 1 && Array.isArray(captured) && captured.length);
        const historical = captured.some(v => v.historischerKontext);
        assert(captured.every(v => Boolean(v.historischerKontext) === historical));
        if (baseline.length) assert(P.hash(captured) === P.hash(baseline), "regular context changed");
        else { assert(historical, "empty ordinary context lacks scoped fallback"); fallbackPositions.push(position); }
        const dPrompt = ai.buildLageBriefingPrompt(captured, profile, { briefingDatum });
        const selected = captured.flatMap(v => v.quellenbelege.map(q => ({ vorgang_ids: [v.vorgang_id],
          quelle_id: q.quelle_id, text: "Offline-Pruefung der Kontextbindung" }))).slice(0, 2);
        const reviewSources = R.pruefQuellen(selected, captured), rPrompt = R.prompt(selected, captured, profile);
        assert(dPrompt.includes(Q.HISTORICAL_RULE) === historical && rPrompt.includes(Q.HISTORICAL_RULE) === historical);
        assert(reviewSources.length && reviewSources.every(v => Boolean(v.historischerKontext) === historical));
        for (const v of captured) {
          assert(v.quellenbelege.length > 0 && v.quellenbelege.length <= Q.MAX_BELEGE);
          for (const q of v.quellenbelege) assert(Q.artikelUrl(q.url) && q.titel && q.veroeffentlichtAm);
          if (historical) {
            assert(v.historischerKontext.inputHash === proof.leaf.eingabeHash
              && v.historischerKontext.sourceCaptureUTC === proof.leaf.capturedAtUTC);
          }
        }
        assert(JSON.stringify(captured).length <= Q.MAX_EINGABE_ZEICHEN, "finite sender context budget");
        assert(P.hash({ briefing: basis.briefing, eingabe: basis.eingabe, korrekturBasis: basis.korrekturBasis }) === originalBasisHash);
        rows.push({ position, bodySHA256: proof.leaf.bodySHA256, basisHash: originalBasisHash, inputHash: proof.leaf.eingabeHash,
          ordinaryContextHash: realHash(baseline), senderContextHash: realHash(captured), senderContextCount: captured.length,
          senderSourceCount: captured.reduce((sum, v) => sum + v.quellenbelege.length, 0), historical,
          dPromptHash: sha(dPrompt), rPromptHash: sha(rPrompt), reachedBeforeGenerate: true });
      } catch (error) { failures.push({ position, error: error.message }); }
      if (position % 25 === 0) process.stderr.write(JSON.stringify({ completed: rows.length, failed: failures.length, lastPosition: position }) + "\n");
    }
    assert.deepEqual(codeHashes(), initialCodeHashes, "runtime code changed during preflight");
    const full500 = positions.length === 500 && new Set(positions).size === 500 && positions.every(p => p >= 1 && p <= 500);
    const exactFallback = full500 && P.hash(fallbackPositions) === P.hash(EXPECTED_MISSING);
    const receipt = { version: "helmut-b2-d-historical-sender-preflight/1", observedAtUTC: new Date().toISOString(),
      execution: "local-offline-actual-buildLageBriefing-finite-token-stop-beforeGenerate", productionAdmission: false,
      paidCalls: 0, productionWrites: 0, expectedInputs: positions.length, full500, validNonemptyContexts: rows.length,
      ordinaryContextsUnchanged: rows.filter(row => !row.historical).length, historicalFallbackContexts: fallbackPositions.length,
      fallbackPositions, exactExpected32Fallback: exactFallback, failures, counters, rows,
      acceptedOriginalBinding: nativeReceipt.acceptedOriginalBinding,
      nativeReceiptSHA256: sha(fs.readFileSync(nativeReceiptFile)), membershipManifestHash: P.hash(membership),
      membershipManifestSHA256: sha(fs.readFileSync(membershipFile)), merkleRoot: membership.merkleRoot,
      currentSourcesHash: P.hash(sources), publicationIdentitiesHash: P.hash(identities), codeHashes: initialCodeHashes,
      limitations: ["Offline native read archive; no fresh Production sender/deployment acceptance.",
        "Stops before budget, command installation, Production activation, D/R calls, output review and storage."] };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    assert(fs.realpathSync(path.dirname(out)).startsWith(fs.realpathSync(privateBase) + path.sep), "private output parent");
    fs.writeFileSync(out, JSON.stringify(receipt, null, 2), { mode: 0o600, flag: "wx" });
    assert(failures.length === 0 && rows.length === positions.length && counters.forbiddenNetwork === 0
      && counters.forbiddenStorage === 0 && counters.forbiddenModel === 0 && counters.localLocks === counters.localUnlocks);
    if (full500) assert(exactFallback && receipt.ordinaryContextsUnchanged === 468 && receipt.historicalFallbackContexts === 32);
    return { out, bytes: fs.statSync(out).size, sha256: sha(fs.readFileSync(out)), full500,
      validNonemptyContexts: rows.length, ordinaryContextsUnchanged: receipt.ordinaryContextsUnchanged,
      historicalFallbackContexts: fallbackPositions.length, failures: failures.length };
  } finally { restorers.reverse().forEach(restore => restore()); restoreNetwork(); }
}
if (require.main === module) {
  const args = process.argv.slice(2), allowed = ["--private-base", "--out"];
  assert(args.length === 4 && allowed.every(flag => args.includes(flag)) && args.filter(x => x.startsWith("--")).every(x => allowed.includes(x)),
    "usage: --private-base ABSOLUTE_PRIVATE_DIR --out ABSOLUTE_PRIVATE_RECEIPT");
  runPreflight({ privateBase: args[args.indexOf("--private-base") + 1], out: args[args.indexOf("--out") + 1] })
    .then(summary => process.stdout.write(JSON.stringify(summary) + "\n"))
    .catch(error => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
}
module.exports = { runPreflight };
