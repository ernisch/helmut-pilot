"use strict";
// Inert opt-in SQL source/catalog binding. No DB/network action on import.
// Acceptance is separate from the historical W50 reader/transport acceptance.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const ROOT = path.resolve(__dirname, "../.."), MODE = "bounded-native-read-v1";
const FILES = ["supabase/proposals/auth_read_bounded_local.sql", "supabase/proposals/auth_read_bounded_local.rollback.sql",
  "scripts/helmut-resource-meter/bounded-read-integration.js", "scripts/helmut-resource-meter/bounded-read-source-acceptance.json",
  "scripts/helmut-resource-meter/runtime-failure-receipt.js",
  "scripts/helmut-resource-meter/bounded-profile-rows.js"];
const SHAPES = Object.freeze({
  helmut_auth_usage_checked_proof_local_v1: ["text", "jsonb", "s"],
  helmut_auth_state_graph_checked_local_v1: ["text, text, text, boolean", "jsonb", "s"],
  helmut_auth_state_graph_read_v1: ["jsonb", "jsonb", "s"]
});
const sha = x => createHash("sha256").update(x).digest("hex");
function acceptance() {
  const a = JSON.parse(fs.readFileSync(path.join(ROOT, FILES[3]), "utf8"));
  assert.equal(a.schema, "helmut-bounded-native-read-source-acceptance/1");
  assert.equal(a.mode, MODE);assert.equal(a.production, false);assert.equal(a.full500Accepted, false);
  assert.equal(a.independentReview.model, "deepseek-v4-pro");assert.equal(a.independentReview.effort, "high");
  assert.equal(a.independentReview.status, "ok");assert.equal(a.nativeProof.exactWholeResponsesEqual, true);
  assert.equal(a.nativeProof.rollbackExactlyRestoresFunctionBodiesAndACLs, true);
  assert.equal(a.nativeProof.reviewRequestedNegativesPassed, true);assert.equal(a.nativeProof.allOwnedProcessesExited, true);
  for (const f of FILES.slice(0, 2)) {
    const b = fs.readFileSync(path.join(ROOT, f));
    assert.equal(sha(b), a.sqlSHA256[f], "Bounded reader independently reviewed SQL source drift: " + f);
  }
  return a;
}
function specs(mode) {
  assert.equal(mode, MODE);acceptance();
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
  assert.deepEqual(Object.keys(result).sort(), Object.keys(SHAPES).sort());return result;
}
module.exports = { MODE, FILES, acceptance, specs };
