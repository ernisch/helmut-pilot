"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const Q = require("../lib/helmut/lage-quellenbeleg"), Lage = require("../lib/helmut/lage");
const P = require("../lib/helmut/synthetik-500-profile"), H = require("../lib/helmut/blocker2-d-historical-binding");
const L = require("../lib/helmut/briefing-lagebindung"), C = require("../lib/helmut/synthetik-500-production-command");
assert.throws(() => Q.baueEingabe([], {}, new Date(), {}, {}), /historischer-kontext-ungeprueft/);
assert.throws(() => Q.baueEingabe([], {}, new Date("invalid")), /quellenzeit-ungueltig/);
assert.throws(() => L.pruefe({ version: 2 }, { id: "offline-only" }, "offline-only"), /lagebindung-abweichend/);
console.log("PASS ordinary callers cannot admit snapshot JSON or invalid time");
const flag = process.argv.indexOf("--private-fixture-base");
if (flag !== -1) {
  const base = process.argv[flag + 1]; assert(path.isAbsolute(base));
  const read = file => JSON.parse(fs.readFileSync(path.join(base, file), "utf8"));
  const original = read("recovery/decrypted/0006.json"), body = JSON.parse(original.response.rawBody);
  const basis = { version: 2, ...body.result, acceptedSnapshot: read("contract/0006-proof.json") };
  const profile = { ...body.profile, profileActive: true }, now = new Date(body.erfasstAm);
  const saved = process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON;
  process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON = read("analysis/shard36/restored/workspace/blocker2-replacement-root-20261011/renewed-policy-config-scope-runtime-adapter.json").environmentValue;
  try {
    const before = P.hash(basis), bound = L.pruefe(basis, profile, profile.id, now, { acceptedSnapshot: true });
    assert.equal(Q.baueEingabe(bound.ranked, bound.sources, now, { HELMUT_BRIEFING_RELEVANZ_TAGE: "14" }).length, 0);
    const context = Lage.prepareDContext(bound.ranked, bound.sources, now, bound).koLite;
    assert(context.length && context.every(v => v.historischerKontext.inputHash === basis.eingabe.eingabeHash));
    assert(JSON.stringify(context).length <= Q.MAX_EINGABE_ZEICHEN);
    const closed = env => Q.baueEingabe(bound.ranked, bound.sources, now, env, bound.historicalSnapshot);
    assert.deepEqual(closed({}), closed({ HELMUT_BRIEFING_RELEVANZ_TAGE: "999999" }));
    assert.throws(() => Q.baueEingabe(bound.ranked, bound.sources, new Date("invalid"), {}, bound.historicalSnapshot), /quellenzeit-ungueltig/);
    assert.throws(() => Q.baueEingabe(bound.ranked, bound.sources, new Date(now.getTime() - 1), {}, bound.historicalSnapshot), /kontext-kuenftig/);
    assert.throws(() => Q.baueEingabe(bound.ranked, bound.sources, now, {}, structuredClone(bound.historicalSnapshot)), /kontext-ungeprueft/);
    const tampered = structuredClone(bound.sources);
    for (const rows of Object.values(tampered)) for (const row of rows) row.published_at = now.toISOString();
    assert.throws(() => Lage.prepareDContext(bound.ranked, tampered, now, bound), /projection-sources/);
    const native = read("current-source-binding/current-sources.json"); C.validateSources(native);
    const docs = new Map(native.documents.map(d => [d.id, d])), kos = new Map(native.knowledgeObjects.map(k => [k.id, k]));
    assert(C.originalSourcesMatch(basis, docs, kos));
    const first = Object.values(basis.korrekturBasis.sourcesByVorgang)[0][0];
    docs.set(first.id, { ...docs.get(first.id), title: "changed native title" });
    assert.equal(C.originalSourcesMatch(basis, docs, kos), false);
    assert.equal(P.hash(basis), before); assert.equal(H.isHistoricalSnapshot(bound.historicalSnapshot), true);
    console.log("PASS authenticated historical scope, finite context, immutable dates, opaque token and native projection guards");
  } finally {
    if (saved === undefined) delete process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON;
    else process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON = saved;
  }
} else console.log("SKIP private accepted snapshot (supply --private-fixture-base)");
