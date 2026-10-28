"use strict";
// Read-only readiness/dry invocation. Never writes Auth or enters an engine Unit.
const fs = require("node:fs"), assert = require("node:assert/strict");
async function main(file, flag) {
  const guard = require.resolve("./lokaler-netzschutz");
  assert(require.cache[guard]);assert.deepEqual(require(guard).pruefe(process.env), []);
  const stat = fs.lstatSync(file);assert(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 511) === 384);
  const c = JSON.parse(fs.readFileSync(file)), url = new URL(c.url);
  assert.equal(url.protocol, "http:");assert.equal(url.hostname, "127.0.0.1");
  assert.equal(c.database, require("./fixtures/w15-atomic-integration-target.json").database);
  assert(typeof c.serviceToken === "string" && c.serviceToken.length > 100);
  assert(flag === undefined || flag === "--dry-run");
  if (flag === "--dry-run") return console.log(JSON.stringify({ status: "PASS_ACTUAL_LOCAL_DRY_FILE_CALL", argvConfigIndex: 2, httpRequests: 0, databaseChanges: 0, profileActivations: 0 }));
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(c.url + "/rest/v1/", { headers: { Authorization: "Bearer " + c.serviceToken,
        Accept: "application/openapi+json" }, signal: AbortSignal.timeout(1000) });
      const v = await r.json();
      if (r.ok && v.paths?.["/rpc/helmut_auth_usage_read_v1"] && v.paths?.["/rpc/helmut_auth_usage_cas_v1"])
        return console.log("PASS_TRUE_RPC_CACHE_READY");
    } catch { /* bounded schema-readiness only, never replay a write */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error("atomic-rpc-cache-not-ready");
}
if (require.main === module) main(process.argv[2], process.argv[3]).catch(() => { console.error("atomic-rpc-readiness-failed");process.exitCode = 1; });
module.exports = { main };
