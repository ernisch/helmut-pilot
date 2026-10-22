"use strict";
// Inert opt-in SQL source/catalog binding. No DB/network action on import.
// Acceptance is separate from the historical W50 reader/transport acceptance.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const ROOT = path.resolve(__dirname, "../.."), MODE = "bounded-native-read-v1";
const FILES = ["supabase/proposals/auth_read_bounded_local.sql", "supabase/proposals/auth_read_bounded_local.rollback.sql",
  "scripts/helmut-resource-meter/bounded-read-integration.js", "scripts/helmut-resource-meter/bounded-read-source-acceptance.json",
  "scripts/helmut-resource-meter/runtime-failure-receipt.js",
  "scripts/helmut-resource-meter/bounded-profile-rows.js",
  "scripts/helmut-resource-meter/bounded-read-cold-digest-source.json",
  "scripts/helmut-resource-meter/cold-digest-native-qualification-20261020.SAFE.json",
  "scripts/helmut-resource-meter/cold-digest-sol-review-20261020.SAFE.json"];
const SHAPES = Object.freeze({
  helmut_auth_usage_checked_proof_local_v1: ["text", "jsonb", "s"],
  helmut_auth_state_graph_checked_local_v1: ["text, text, text, boolean", "jsonb", "s"],
  helmut_auth_state_graph_read_v1: ["jsonb", "jsonb", "s"]
});
const sha = x => createHash("sha256").update(x).digest("hex");
function qualificationProof(file, p) {
  assert(p && p.name === path.basename(file));
  assert(Number.isSafeInteger(p.bytes) && p.bytes > 0 && p.bytes <= 256 * 1024);
  assert.match(p.sha256, /^[a-f0-9]{64}$/);
  const absolute = path.join(ROOT, file);
  assert(fs.lstatSync(absolute).isFile());
  assert.equal(fs.realpathSync(absolute), path.join(fs.realpathSync(ROOT), file));
  // Fixed repo paths only; reject symlinks/nonregular files and bound the read.
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);assert(st.isFile());assert.equal(st.size, p.bytes);
    const b = Buffer.alloc(p.bytes + 1);let n = 0, got;
    while (n < b.length && (got = fs.readSync(fd, b, n, b.length - n, null)) > 0) n += got;
    assert.equal(n, p.bytes);const bytes = b.subarray(0, n);
    assert.equal(sha(bytes), p.sha256, "Cold digest qualification proof drift");
    return JSON.parse(bytes.toString("utf8"));
  } finally { fs.closeSync(fd); }
}
function historicalAcceptance() {
  const a = JSON.parse(fs.readFileSync(path.join(ROOT, FILES[3]), "utf8"));
  assert.equal(a.schema, "helmut-bounded-native-read-source-acceptance/1");
  assert.equal(a.mode, MODE);assert.equal(a.production, false);assert.equal(a.full500Accepted, false);
  assert.equal(a.independentReview.model, "deepseek-v4-pro");assert.equal(a.independentReview.effort, "high");
  assert.equal(a.independentReview.status, "ok");assert.equal(a.nativeProof.exactWholeResponsesEqual, true);
  assert.equal(a.nativeProof.rollbackExactlyRestoresFunctionBodiesAndACLs, true);
  assert.equal(a.nativeProof.reviewRequestedNegativesPassed, true);assert.equal(a.nativeProof.allOwnedProcessesExited, true);
  // Forward SQL below is a new explicit delta. The old native/model proof
  // remains bound ONLY to its original forward hash; rollback is unchanged.
  assert.equal(sha(fs.readFileSync(path.join(ROOT, FILES[1]))), a.sqlSHA256[FILES[1]], "Bounded reader rollback source drift");
  return a;
}
function currentDeltaAcceptance({ sourceOnly = false } = {}) {
  assert.equal(typeof sourceOnly, "boolean");
  const historical = historicalAcceptance();
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, FILES[6]), "utf8"));
  assert.equal(d.schema, "helmut-bounded-read-cold-digest-delta/1");assert.equal(d.mode, MODE);
  assert.equal(d.file, FILES[0]);assert.equal(d.function, "helmut_auth_state_graph_read_v1");
  assert.equal(d.originalSHA256, historical.sqlSHA256[FILES[0]]);
  assert.equal(d.originalFunctionBodySHA256, "1644ff690fb4ae70ab2511b3ccf41353e622595bc9fed2d61005c4f655171af0");
  assert.equal(d.production, false);assert.equal(d.full500Accepted, false);
  assert.equal(d.requiresFreshIntegrationAcceptance, true);
  const sql = fs.readFileSync(path.join(ROOT, d.file));
  assert.equal(sha(sql), d.sha256, "Cold digest candidate source drift");
  const bodies = [...sql.toString("utf8").matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.helmut_auth_state_graph_read_v1\(jsonb\)\s+returns\s+jsonb[\s\S]*?\bas\s+(\$\w*\$)([\s\S]*?)\1\s*;/gi)];
  assert.equal(bodies.length, 1);
  assert.equal(sha(bodies[0][2]), d.functionBodySHA256, "Cold digest actual prosrc drift");
  if (!sourceOnly) {
    // No descriptor authority from sourceOnly. Do not set these fields until
    // new native/negative and independent safety evidence actually exists.
    const q = d.currentQualification;
    assert.equal(q.qualified, true, "Cold digest delta is NOT_QUALIFIED for normal admission");
    assert.equal(q.nativeDifferential.status, "passed");
    assert.equal(q.nativeDifferential.exactWholeResponsesEqual, true);
    assert.equal(q.nativeDifferential.identicalErrors, true);
    assert.equal(q.nativeDifferential.originalStateUnchanged, true);
    assert.equal(q.nativeDifferential.requestedNegativesPassed, true);
    assert.equal(q.independentSafetyReview.status, "accepted");
    const native = qualificationProof(FILES[7], q.nativeDifferential.proofPin);
    const review = qualificationProof(FILES[8], q.independentSafetyReview.proofPin);
    assert.equal(native.schema, "helmut-cold-digest-native-qualification/1");
    assert.equal(review.schema, "helmut-cold-digest-sol-review/1");
    const adapterSHA256 = sha(fs.readFileSync(path.join(ROOT, FILES[2])));
    for (const proof of [native, review]) {
      assert.equal(proof.scope, "LOCAL_SOURCE_ONLY");assert.equal(proof.mode, MODE);
      assert.equal(proof.production, false);assert.equal(proof.full500Accepted, false);
      assert.equal(proof.file, d.file);assert.equal(proof.sqlSHA256, sha(sql));
      assert.equal(proof.function, d.function);assert.equal(proof.functionBodySHA256, sha(bodies[0][2]));
      assert.equal(proof.originalSQLSHA256, d.originalSHA256);
      assert.equal(proof.originalFunctionBodySHA256, d.originalFunctionBodySHA256);
      assert.equal(proof.adapterSHA256, adapterSHA256);
    }
    assert.equal(native.status, "passed");assert.equal(native.caseCount, 19);
    for (const key of ["exactWholeResponsesEqual", "identicalErrors", "requestedNegativesPassed",
      "originalStateUnchanged", "fullCatalogRestored", "onlyFunctionBodyCatalogDelta",
      "allOwnedProcessesExited", "namespacesEmpty"]) assert.equal(native[key], true);
    assert.equal(review.status, "accepted");assert.equal(review.independent, true);
    assert.equal(review.model, "gpt-6.1-sol");
    assert.deepEqual(review.nativeProofPin, q.nativeDifferential.proofPin);
  }
  // Source-only derivation never asserts qualification, even after future proof admission.
  return sourceOnly ? { ...d, currentQualification: { ...d.currentQualification, qualified: false }, localSourceOnly: true } : d;
}
function acceptance() {
  return { schema: "helmut-bounded-native-read-current-acceptance/1", mode: MODE,
    production: false, full500Accepted: false, historicalAcceptance: historicalAcceptance(),
    currentDeltaAcceptance: currentDeltaAcceptance() };
}
function specs(mode, { localSourceOnly = false } = {}) {
  assert.equal(mode, MODE);assert.equal(typeof localSourceOnly, "boolean");
  if (localSourceOnly) currentDeltaAcceptance({ sourceOnly: true });
  else acceptance();
  const sql = fs.readFileSync(path.join(ROOT, FILES[0]), "utf8"), result = {};
  const pattern = /create\s+(?:or\s+replace\s+)?function\s+public\.(helmut_auth_\w+)\([^)]*\)\s+returns\s+[\w\[\]]+[\s\S]*?\bas\s+(\$\w*\$)([\s\S]*?)\2\s*;/gi;
  let match;
  while ((match = pattern.exec(sql))) {
    const name = match[1];assert(Object.hasOwn(SHAPES, name));assert(!Object.hasOwn(result, name));
    const [args, type, volatility] = SHAPES[name];
    result[name] = { hash: sha(match[3]), definer: false, config: ["search_path=pg_catalog"], arguments: args,
      result: type, volatility, owner: "postgres", publicExecute: false, anonExecute: false,
      customerExecute: false, serviceExecute: true };
  }
  assert.deepEqual(Object.keys(result).sort(), Object.keys(SHAPES).sort());
  assert.equal(result.helmut_auth_state_graph_read_v1.hash, currentDeltaAcceptance({ sourceOnly: true }).functionBodySHA256);
  return result;
}
module.exports = { MODE, FILES, acceptance, currentDeltaAcceptance, specs };
