"use strict";
// Echte verschluesselte Offline-Fixtures; kein Production-GET oder Modell.
const A = require("node:assert/strict"), C = require("node:crypto");
const G = require("./github-blocker2-readonly500"), T = require("./privater-nachweis-transport");
const S = require("../lib/helmut/synthetik-500-profile"), B = require("../lib/helmut/briefing-speicher");
const pair = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
const privateKey = pair.privateKey.export({ format: "pem", type: "pkcs8" });
const publicKey = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const tag = "2026-10-11", now = new Date("2026-10-11T08:00:00Z"), targets = S.erzeuge().profile;
const active = { version: 1, hash: "d".repeat(64), heldPublications: 1 };
const env = { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_ID: "123456789",
  GITHUB_SHA: "a".repeat(40), HELMUT_PRODUCTION_COMMIT: "a".repeat(40),
  HELMUT_CRON_SECRET: "TEST_ONLY_SECRET", HELMUT_NACHWEIS_PUBLIC_KEY: publicKey };
function fixture({ policy, expectedHash, identityChange = x => x, inputChange = x => x, invalidBody } = {}) {
  policy = policy === undefined ? undefined : structuredClone(policy);
  const files = new Map(), calls = [], checkpoints = [];
  let identities = 0, inputs = 0;
  const args = { env: { ...env, ...(expectedHash === undefined ? {} : { HELMUT_PUBLICATION_ELIGIBILITY_HASH: expectedHash }) },
    now: () => now, expectedRecipient: T.publicKey(publicKey).fingerprint,
    writeEnvelope: (name, value) => { A(!files.has(name)); files.set(name, value); },
    persistCheckpoint: cp => checkpoints.push(cp), fetchFn: async (url, options) => {
      calls.push(url); A.equal(options.method, "GET"); A.equal(options.redirect, "error");
      A.equal(new URL(url).origin, "https://helmut-pilot.vercel.app");
      A.equal(options.headers["x-helmut-production-commit"], env.HELMUT_PRODUCTION_COMMIT);
      A.equal(options.headers["x-helmut-publication-eligibility-hash"], expectedHash || undefined);
      if (new URL(url).pathname === "/api/release/dip-resolver") {
        identities++;
        const x = { ok: true, commit: env.HELMUT_PRODUCTION_COMMIT, reinLesend: true,
          productionDataWrites: 0, paidModelCalls: 0, syntheticFixturesOnly: true, all500InputAcceptance: false,
          ...(policy === undefined ? {} : { sourceSafetyStandard: false, legacySourceFiltersActive: false }),
          ...(policy === undefined ? {} : { publicationEligibilityPolicy: policy }) };
        return new Response(JSON.stringify(identityChange(x, identities)));
      }
      inputs++;
      A.equal(new URL(url).pathname, "/api/cron/briefing-nachweis");
      const target = targets.find(t => t.mandatsId === new URL(url).searchParams.get("mandat")); A(target);
      const input = { mandat: target.mandatsId, tag, ...(policy === undefined ? {} : { publicationEligibilityPolicy: policy }) };
      const x = { art: "production-briefing-eingabe", productionCommit: env.HELMUT_PRODUCTION_COMMIT,
        reinLesend: true, schreibaufrufe: 0, modellaufrufe: 0, synthetisch: true, fachlicheFreigabe: false,
        funktionsnachweis500: false, all500InputAcceptance: false, transaktionalerSnapshot: false,
        ...(policy === undefined ? {} : { sourceSafetyStandard: false, legacySourceFiltersActive: false }),
        ...(policy === undefined ? {} : { publicationEligibilityPolicy: policy }),
        profile: { id: target.mandatsId, profileActive: false, synthetisch: true, parlament: target.parlament,
          herkunft: { person: "vollstaendig-fiktiv", amtlicherPersonenbeleg: false },
          szenario: { variante: "basis-v1" }, profilHash: "b".repeat(64), paketHash: "c".repeat(64) },
        result: { eingabe: { ...input, eingabeHash: B.hash(input) }, korrekturBasis: { kos: [] },
          briefing: { items: [{ text: "PRIVATE_POLICY_TEST" }] } } };
      if (invalidBody === "json") return new Response("not-json");
      if (invalidBody === "limit") return new Response("too-big", { headers: { "content-length": String(T.MAX_BYTES + 1) } });
      return new Response(JSON.stringify(inputChange(x, inputs)));
    } };
  const decode = (name, position = 1) => T.entschluesseln(files.get(name), privateKey,
    { runId: env.GITHUB_RUN_ID, commit: env.GITHUB_SHA, tag, abPosition: position, anzahl: 1 });
  return { args, files, calls, checkpoints, decode, inputs: () => inputs, identities: () => identities };
}
function safe(f, report) {
  A.equal(report.paidModelCalls, 0); A.equal(report.productionDataWrites, 0);
  A.equal(report.all500InputAcceptance, false); A.equal(report.fachlicheFreigabe, false);
  A(f.inputs() <= 500); A(f.identities() <= 2);
  A(!JSON.stringify([...f.files]).includes(env.HELMUT_CRON_SECRET));
}
(async () => {
  const empty = fixture({ expectedHash: "" }), old = await G.ausfuehrenDiagnose12(empty.args); safe(empty, old);
  A.equal(old.ok, true); A.equal(empty.inputs(), 1);
  A(!Object.hasOwn(old, "publicationEligibilityPolicy")); A(!Object.hasOwn(old, "expectedPublicationEligibilityHash"));
  A(!Object.hasOwn(empty.decode("0012.json", 12), "publicationEligibilityPolicy"));
  const good = fixture({ policy: active, expectedHash: active.hash }), all = await G.ausfuehren(good.args); safe(good, all);
  A.equal(all.ok, true); A.equal(all.attempted, 500); A.equal(all.counts.captured, 500);
  A.equal(good.calls.length, 502); A.equal(good.files.size, 501); A.equal(all.sourceSafetyStandard, false);
  A.deepEqual(all.publicationEligibilityPolicy, active); A.equal(all.expectedPublicationEligibilityHash, active.hash);
  for (let n = 1; n <= 500; n++) {
    const record = good.decode(String(n).padStart(4, "0") + ".json", n);
    A.deepEqual(record.publicationEligibilityPolicy, active); A.equal(record.sourceSafetyStandard, false);
    const payload = JSON.parse(record.response.rawBody);
    A.deepEqual(payload.publicationEligibilityPolicy, active); A.deepEqual(payload.result.eingabe.publicationEligibilityPolicy, active);
    const { eingabeHash, ...input } = payload.result.eingabe; A.equal(eingabeHash, B.hash(input));
    A.equal(record.all500InputAcceptance, false);
  }
  const final = good.decode("manifest.json");
  A.deepEqual(final.firstIdentity.publicationEligibilityPolicy, final.lastIdentity.publicationEligibilityPolicy);
  A.equal(final.sourceSafetyStandard, false); A.equal(final.all500InputAcceptance, false);
  for (const options of [{ policy: active }, { expectedHash: active.hash },
    { policy: { ...active, hash: "e".repeat(64) }, expectedHash: active.hash }]) {
    const f = fixture(options), r = await G.ausfuehrenDiagnose12(f.args); safe(f, r);
    A.equal(r.stopReason, "production-publication-policy-mismatch"); A.equal(f.inputs(), 0); A.equal(f.identities(), 1);
  }
  for (const policy of [null, [], { ...active, version: 2 }, { ...active, heldPublications: 0 },
    { ...active, heldPublications: 1.5 }, { ...active, hash: "invalid" }, { ...active, extra: true }]) {
    const f = fixture({ policy, expectedHash: active.hash }), r = await G.ausfuehrenDiagnose12(f.args); safe(f, r);
    A.equal(r.ok, false); A.equal(f.inputs(), 0); A.equal(f.identities(), 1);
  }
  for (const mutate of [p => { p.publicationEligibilityPolicy.hash = "e".repeat(64); },
    p => { delete p.publicationEligibilityPolicy; }, p => { p.publicationEligibilityPolicy = null; },
    p => { delete p.result.eingabe.publicationEligibilityPolicy; },
    p => { p.result.eingabe.publicationEligibilityPolicy = { ...active, heldPublications: 2 }; }]) {
    const f = fixture({ policy: active, expectedHash: active.hash,
      inputChange: (p, n) => { if (n === 3) mutate(p); return p; } }), r = await G.ausfuehren(f.args); safe(f, r);
    A.equal(r.stopReason, "production-publication-policy-drift"); A.equal(f.inputs(), 3); A.equal(f.identities(), 1);
    A.equal(r.counts.contradictory, 1); A.equal(r.counts["not-captured"], 497);
  }
  for (const policy of [undefined, { ...active, hash: "e".repeat(64) }, { ...active, heldPublications: 2 }]) {
    const f = fixture({ policy: active, expectedHash: active.hash,
      identityChange: (x, n) => n === 2 ? { ...x, publicationEligibilityPolicy: policy } : x });
    const r = await G.ausfuehrenDiagnose12(f.args); safe(f, r);
    A.equal(r.stopReason, "ending-production-publication-policy-drift"); A.equal(f.inputs(), 1); A.equal(f.identities(), 2);
  }
  for (const invalidBody of ["json", "limit"]) {
    const f = fixture({ policy: active, expectedHash: active.hash, invalidBody }), r = await G.ausfuehren(f.args); safe(f, r);
    A.equal(r.stopReason, "production-publication-policy-unconfirmed"); A.equal(f.inputs(), 1); A.equal(f.identities(), 1);
    A.equal(r.counts["not-captured"], 499);
  }
  const emptied = fixture({ policy: active, expectedHash: active.hash,
    inputChange: p => { p.result.briefing.items = []; return p; } });
  const emptyActive = await G.ausfuehren(emptied.args); safe(emptied, emptyActive);
  A.equal(emptyActive.stopReason, "production-input-empty"); A.equal(emptied.inputs(), 1); A.equal(emptied.identities(), 1);
  A.equal(emptyActive.counts.empty, 1); A.equal(emptyActive.counts["not-captured"], 499);
  for (const change of [p => { p.sourceSafetyStandard = true; }, p => { delete p.sourceSafetyStandard; },
    p => { p.legacySourceFiltersActive = true; }, p => { delete p.legacySourceFiltersActive; },
    p => { p.quellenkontext = { sourceSafetyStandard: true }; }]) {
    for (const atIdentity of [true, false]) {
      const f = fixture({ policy: active, expectedHash: active.hash,
        ...(atIdentity ? { identityChange: p => { change(p); return p; } }
          : { inputChange: p => { change(p); return p; } }) });
      const r = await G.ausfuehren(f.args); safe(f, r);
      A.equal(r.stopReason, atIdentity ? "production-source-safety-mismatch" : "production-source-safety-drift");
      A.equal(f.inputs(), atIdentity ? 0 : 1); A.equal(f.identities(), 1); A.equal(r.ok, false);
    }
  }
  const legacy = fixture({ identityChange: p => ({ ...p, sourceSafetyStandard: false }) });
  const legacyReport = await G.ausfuehren(legacy.args); safe(legacy, legacyReport);
  A.equal(legacyReport.stopReason, "production-source-safety-mismatch"); A.equal(legacy.inputs(), 0);
  const legacyDrift = fixture({ inputChange: p => ({ ...p, legacySourceFiltersActive: true }) });
  const legacyDriftReport = await G.ausfuehren(legacyDrift.args); safe(legacyDrift, legacyDriftReport);
  A.equal(legacyDriftReport.stopReason, "production-source-safety-drift"); A.equal(legacyDrift.inputs(), 1);
  const endingSafety = fixture({ policy: active, expectedHash: active.hash,
    identityChange: (p, n) => n === 2 ? { ...p, legacySourceFiltersActive: true } : p });
  const endingSafetyReport = await G.ausfuehrenDiagnose12(endingSafety.args); safe(endingSafety, endingSafetyReport);
  A.equal(endingSafetyReport.stopReason, "ending-production-source-safety-drift"); A.equal(endingSafety.inputs(), 1);
  for (const expectedHash of ["bad", " " + active.hash, null, 1]) {
    const f = fixture({ expectedHash }); await A.rejects(G.ausfuehren(f.args));
    A.equal(f.calls.length, 0); A.equal(f.files.size, 0);
  }
  console.log("B2 publication policy offline: default compatibility, explicit expected hash, all500 input bindings, both identities, malformed/drift/transport stop; no Production acceptance.");
})().catch(error => { console.error(error); process.exitCode = 1; });
