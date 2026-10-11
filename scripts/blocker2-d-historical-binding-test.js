"use strict";

const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const P = require("../lib/helmut/synthetik-500-profile");
const H = require("../lib/helmut/blocker2-d-historical-binding");
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }
const syntheticLeaf = position => ({ position, owner: "synthetic-proof-only-" + position,
  profileHash: P.hash({ test: "profile", position }), nativeProfileHash: P.hash({ test: "native", position }),
  bodySHA256: P.hash({ test: "body", position }), eingabeHash: P.hash({ test: "input", position }),
  basisHash: P.hash({ test: "basis", position }), capturedAtUTC: "2026-10-11T01:40:48.496Z" });
const leaves = Array.from({ length: 512 }, (_, index) => index < 500
  ? P.hash({ domain: "helmut-b2-accepted-snapshot-leaf/1", leaf: syntheticLeaf(index + 1) })
  : P.hash({ domain: "helmut-b2-accepted-snapshot-padding/1", position: index + 1 }));
const levels = [leaves];
while (levels.at(-1).length > 1) {
  const prev = levels.at(-1), next = [];
  for (let i = 0; i < prev.length; i += 2)
    next.push(P.hash({ domain: "helmut-b2-accepted-snapshot-node/1", left: prev[i], right: prev[i + 1] }));
  levels.push(next);
}
function proof(position) {
  let index = position - 1; const siblings = [];
  for (let level = 0; level < 9; level++) { siblings.push(levels[level][index ^ 1]); index = Math.floor(index / 2); }
  return { version: "helmut-b2-accepted-snapshot-proof/1", leaf: syntheticLeaf(position), siblings };
}
test("Merkle primitive preserves ordering and nine-level membership through both boundaries", () => {
  for (const position of [1, 2, 257, 499, 500]) assert.equal(H.recomputeRoot(proof(position)), levels.at(-1)[0]);
});
test("Changed owner, leaf position or sibling cannot retain the original proof root", () => {
  for (const change of [p => { p.leaf.owner += "-changed"; }, p => { p.leaf.position = 2; },
    p => { p.leaf.basisHash = P.hash("changed"); }, p => { p.siblings[0] = P.hash("changed"); },
    p => { p.siblings.reverse(); }]) {
    const altered = proof(1); change(altered); assert.notEqual(H.recomputeRoot(altered), levels.at(-1)[0]);
  }
});
test("Malformed and padding-position proofs fail closed", () => {
  for (const change of [p => { p.siblings.pop(); }, p => { p.siblings.push(P.hash("extra")); },
    p => { p.leaf.position = 501; }, p => { p.leaf.position = 0; }, p => { p.leaf.position = 1.5; },
    p => { p.extra = true; }, p => { p.leaf.extra = true; }, p => { p.leaf.bodySHA256 = "invalid"; },
    p => { p.leaf.capturedAtUTC = "2026-02-30T01:40:48.496Z"; }]) {
    const altered = proof(1); change(altered); assert.throws(() => H.recomputeRoot(altered), /historical-binding-/);
  }
});
test("A caller-created internally consistent synthetic tree receives no actual B2 admission", () => {
  const basis = { version: 2, briefing: {}, eingabe: {}, korrekturBasis: {}, acceptedSnapshot: proof(1) };
  assert.throws(() => H.verify(basis, {}, "synthetic-proof-only-1", new Date("2026-10-11T02:00:00.000Z")), /membership-root/);
  assert.throws(() => H.verify({ ...basis, urteil: { erfunden: true } }, {}, "synthetic-proof-only-1"), /basis-shape/);
  for (const invented of [null, undefined, {}, { version: H.VERSION }, proof(1)]) {
    assert.equal(H.isHistoricalSnapshot(invented), false);
    assert.throws(() => H.metadata(invented), /snapshot-token/);
  }
});

// Optional authenticated private bytes enable admission/guard tests without
// putting any accepted source or profile contents in Git or manufacturing PASS.
const flag = process.argv.indexOf("--private-fixture-base");
if (flag !== -1) {
  const base = process.argv[flag + 1]; assert(base && path.isAbsolute(base));
  const envelope = JSON.parse(fs.readFileSync(path.join(base, "recovery/decrypted/0006.json")));
  const body = JSON.parse(envelope.response.rawBody);
  const crypto = require("node:crypto");
  assert.equal(crypto.createHash("sha256").update(envelope.response.rawBody).digest("hex"), envelope.response.rawBodySHA256);
  const acceptedSnapshot = JSON.parse(fs.readFileSync(path.join(base, "contract/0006-proof.json")));
  const policyRecord = JSON.parse(fs.readFileSync(path.join(base,
    "analysis/shard36/restored/workspace/blocker2-replacement-root-20261011/renewed-policy-config-scope-runtime-adapter.json")));
  const savedEnv = process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON;
  process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON = policyRecord.environmentValue;
  try {
    const make = () => ({ version: 2, ...structuredClone(body.result), acceptedSnapshot: structuredClone(acceptedSnapshot) });
    const now = new Date(body.erfasstAm), owner = body.profile.id;
    test("Actual immutable private snapshot preserves input bytes and excludes provenance-only addresses", () => {
      const basis = make(), before = P.hash(basis), binding = H.verify(basis, body.profile, owner, now);
      assert.equal(P.hash(basis), before);
      assert.equal(binding.eingabeHash, body.result.eingabe.eingabeHash);
      assert.equal(binding.historicalSnapshot.bodySHA256, envelope.response.rawBodySHA256);
      assert.equal(binding.historicalSnapshot.excludedProvenanceSources, 8);
      assert.deepEqual(binding.ranked.map(k => k.vorgang_id), basis.briefing.items.map(i => i.vorgangId));
      for (const [vorgangId, sources] of Object.entries(binding.sources)) for (const source of sources) {
        const original = basis.korrekturBasis.sourcesByVorgang[vorgangId].find(d => d.id === source.id);
        assert.equal(source.summary, original.summary); assert.equal(source.published_at, original.published_at);
        const accepted = basis.eingabe.quellen.find(q => q.vorgangId === vorgangId && q.documentId === source.id);
        assert.equal(source.url, accepted.url); assert.equal(source.canonical_url, accepted.url);
      }
      assert.equal(binding.SOURCE_SCOPE.mode, "accepted-historical-background");
      assert.equal(H.isHistoricalSnapshot(binding.historicalSnapshot), true);
      assert.equal(Object.isFrozen(binding.historicalSnapshot), true);
      const snapshotCopy = structuredClone(binding.historicalSnapshot);
      assert.equal(H.isHistoricalSnapshot(snapshotCopy), false);
      assert.throws(() => H.metadata(snapshotCopy), /snapshot-token/);
      const copiedMetadata = H.metadata(binding.historicalSnapshot);
      assert.deepEqual(copiedMetadata, snapshotCopy);
      copiedMetadata.inputHash = "changed";
      assert.equal(H.metadata(binding.historicalSnapshot).inputHash, binding.eingabeHash);
      assert.equal(H.assertProjection(binding.historicalSnapshot, binding.ranked, binding.sources), true);
      const subset = binding.ranked.slice(0, 1), firstId = subset[0].vorgang_id;
      assert.equal(H.assertProjection(binding.historicalSnapshot, subset, { [firstId]: binding.sources[firstId] }), true);
      assert.throws(() => H.assertProjection(snapshotCopy, binding.ranked, binding.sources), /snapshot-token/);
      const changedKO = structuredClone(subset); changedKO[0].headline += " changed";
      assert.throws(() => H.assertProjection(binding.historicalSnapshot, changedKO, binding.sources), /projection-ko/);
      assert.throws(() => H.assertProjection(binding.historicalSnapshot, [...subset, ...subset], binding.sources), /projection-ko/);
      assert.throws(() => H.assertProjection(binding.historicalSnapshot, [{ ...subset[0], vorgang_id: "foreign" }], binding.sources), /projection-ko/);
      const changedSources = structuredClone(binding.sources);
      const sourcedId = Object.keys(changedSources).find(id => changedSources[id].length);
      changedSources[sourcedId][0].summary += " changed";
      assert.throws(() => H.assertProjection(binding.historicalSnapshot, binding.ranked, changedSources), /projection-sources/);
      assert.throws(() => H.assertProjection(binding.historicalSnapshot, subset, {}), /projection-sources/);
      assert.throws(() => H.assertProjection(binding.historicalSnapshot, subset, { ...binding.sources, foreign: [] }), /projection-sources/);
      assert.equal(H.verify(basis, { ...body.profile, profileActive: true }, owner, now).eingabeHash, binding.eingabeHash);
    });
    test("Actual proof rejects owner/profile/input/source/selection/proof/time/policy changes", () => {
      assert.throws(() => H.verify(make(), body.profile, owner + "-changed", now), /owner/);
      assert.throws(() => H.verify(make(), { ...body.profile, changedNativeField: true }, owner, now), /profile/);
      assert.throws(() => H.verify(make(), { ...body.profile, profileActive: "true" }, owner, now), /profile/);
      for (const change of [b => { b.eingabe.quellen[0].auszug += " changed"; },
        b => { b.briefing.items.reverse(); }, b => { b.korrekturBasis.kos[0].headline += " changed"; },
        b => { Object.values(b.korrekturBasis.sourcesByVorgang)[0][0].summary += " changed"; },
        b => { b.acceptedSnapshot.siblings[0] = P.hash("changed"); },
        b => { b.acceptedSnapshot.leaf.owner += " changed"; }]) {
        const altered = make(); change(altered); assert.throws(() => H.verify(altered, body.profile, owner, now), /historical-binding-/);
      }
      assert.throws(() => H.verify(make(), body.profile, owner, new Date(now.getTime() - 1)), /capture-day/);
      assert.throws(() => H.verify(make(), body.profile, owner, new Date("2026-10-11T22:00:00.000Z")), /capture-day/);
      assert.throws(() => H.verify(make(), body.profile, owner, new Date("invalid")), /capture-day/);
      delete process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON;
      assert.throws(() => H.verify(make(), body.profile, owner, now), /publication-policy/);
    });
  } finally {
    if (savedEnv === undefined) delete process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON;
    else process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON = savedEnv;
  }
} else console.log("SKIP actual private admission fixtures (supply --private-fixture-base)");
console.log(`${passed}/${passed} historical binding groups passed; no production/model/DB calls`);
