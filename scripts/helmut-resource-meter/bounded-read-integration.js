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
  "scripts/helmut-resource-meter/bounded-read-cold-digest-source.json"];
const SHAPES = Object.freeze({
  helmut_auth_usage_checked_proof_local_v1: ["text", "jsonb", "s"],
  helmut_auth_state_graph_checked_local_v1: ["text, text, text, boolean", "jsonb", "s"],
  helmut_auth_state_graph_read_v1: ["jsonb", "jsonb", "s"]
});
const sha = x => createHash("sha256").update(x).digest("hex");
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
  assert.equal(sha(fs.readFileSync(path.join(ROOT, d.file))), d.sha256, "Cold digest candidate source drift");
  assert.match(d.functionBodySHA256, /^[a-f0-9]{64}$/);
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
    for (const evidence of [q.nativeDifferential, q.independentSafetyReview]) {
      const p = evidence.proofPin;
      assert(p && typeof p.name === "string" && path.basename(p.name) === p.name && p.name.length > 0);
      assert(Number.isSafeInteger(p.bytes) && p.bytes > 0);assert.match(p.sha256, /^[a-f0-9]{64}$/);
    }
  }
  return d;
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
