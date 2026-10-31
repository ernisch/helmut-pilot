"use strict";

// Bounded OLD/NEW component comparison, never a 500-profile engine run.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PerformanceObserver } = require("node:perf_hooks");
const A = require("../../lib/helmut/llm-usage-atomic");
const CAS = require("../../lib/helmut/auth-store-cas");
const { fixture, record, withoutRevision, hash, entropy } = require("./fixture");
const S = require("./support");
const { ready } = require("./native-check");
async function main(config) {
  assert(["old","new"].includes(config.mode));
  const sql = S.sqlClient(config), request = S.requester(config), rowId = "component-auth", target = config.apiBase + "|" + rowId;
  const kernelAtEntry = S.kernel(), processAtEntry = process.cpuUsage(), wallAtEntry = performance.now();
  // Disclose a conservative volume surrogate, not a reconstruction of private
  // End500 contents or shapes. The publicly recorded End500 minified size is
  // retained while the majority of this fixture stays in the still-written
  // nonusage state. This avoids a near-100%-usage best-case comparison.
  const historyCount = 6000, targetFixtureBytes = 13616853, data = fixture({ historyCount, paddingBytes: 0 });
  const originalHistoryHash = hash(data.llmUsage);
  const retainedFieldHashes = Object.fromEntries(Object.entries(data)
    .filter(([key]) => !["_authStoreRevision", "llmUsage", "adminSettings"].includes(key))
    .map(([key, value]) => [key, hash(value)]));
  data.componentInertRestVolume = { fixtureOnly: true, executionAuthority: false,
    shapeOrOriginalReconstruction: false, purpose: "DECLARED_SYNTHETIC_NONUSAGE_VOLUME_SURROGATE", padding: "" };
  const paddingBytes = targetFixtureBytes - Buffer.byteLength(JSON.stringify(data));assert(paddingBytes > 0);
  data.componentInertRestVolume.padding = entropy(paddingBytes, "component-inert-rest-volume-v1");
  const fixtureJSONBytes = Buffer.byteLength(JSON.stringify(data));assert.equal(fixtureJSONBytes, targetFixtureBytes);
  const usageJSONBytes = Buffer.byteLength(JSON.stringify(data.llmUsage));
  const restVolumeHash = hash(data.componentInertRestVolume), paddingSHA256 = hash(data.componentInertRestVolume.padding);
  assert.equal(sql.json("SELECT to_jsonb(current_setting('work_mem'));"), "4MB");
  S.createFixtureTables(sql);S.seed(sql, rowId, data);
  // Apply the same DDL to both cases. OLD remains unconverted, NEW explicitly bootstraps.
  S.installProposal(sql);if (config.mode === "new") S.bootstrap(sql, rowId);
  sql("NOTIFY pgrst,'reload schema';");await ready(request);
  const setupWallMs = performance.now() - wallAtEntry;
  process.env.HELMUT_LLM_USAGE_STORAGE = config.mode === "new" ? A.VERSION : "blob";
  process.env.SUPABASE_URL = config.apiBase;delete process.env.VERCEL;
  // OLD reader uses exactly one complete GET and preserves its private revision.
  async function oldRead() {
    const rows = await request(`/rest/v1/helmut_store?id=eq.${rowId}&select=data`), value = rows[0].data;
    return CAS.attachSnapshot(value, { exists: true, revision: value[CAS.REVISION], target });
  }
  const readStore = config.mode === "new" ? () => A.read({ request, rowId, target }) : oldRead;
  const writeStore = store => config.mode === "new" ? A.write(store, { request, rowId, target })
    : CAS.writeConditional(store, { request, rowId, target });
  const dbStats = () => sql.json(`SELECT jsonb_build_object(
    'lsn',pg_current_wal_insert_lsn()::text,'tempBytes',(SELECT temp_bytes FROM pg_stat_database WHERE datname=current_database()),
    'tempFiles',(SELECT temp_files FROM pg_stat_database WHERE datname=current_database()),
    'walDirectoryBytes',(SELECT sum(size) FROM pg_ls_waldir()),
    'storeRelationBytes',pg_total_relation_size('public.helmut_store'),
    'usageRelationBytes',pg_total_relation_size('public.llm_usage'));`);
  const gc = [];const observer = new PerformanceObserver(list => { for (const e of list.getEntries()) gc.push({ kind: e.detail.kind, durationMs: e.duration }); });
  observer.observe({ entryTypes: ["gc"] });
  const beforeDB = dbStats(), beforeKernel = S.kernel(), beforeCPU = process.cpuUsage(), beforeWire = { ...request.stats };
  const start = performance.now(), operations = [], expected = JSON.parse(JSON.stringify(data));let final;
  for (let i = 0; i < 24; i++) {
    const began = performance.now(), current = await readStore();
    current.adminSettings.componentMutation = i;expected.adminSettings.componentMutation = i;
    if ([5,11,17,23].includes(i)) {
      const added = record(`component-append-${i}`, 0);
      current.llmUsage = [added, ...current.llmUsage];expected.llmUsage = [added, ...expected.llmUsage];
    }
    const accepted = await writeStore(current), readback = await readStore();
    final = readback;
    assert.deepEqual(withoutRevision(readback), withoutRevision(expected));
    assert.equal(readback._authStoreRevision, accepted._authStoreRevision);
    operations.push({ ordinal: i + 1, wallMs: performance.now() - began, historyCount: readback.llmUsage.length,
      acknowledged: true, completePostimageEqual: true });
  }
  await new Promise(resolve => setImmediate(resolve));observer.disconnect();
  const wallMs = performance.now() - start, cpu = process.cpuUsage(beforeCPU), afterDB = dbStats(), afterKernel = S.kernel();
  const walDeltaBytes = sql.json(`SELECT to_jsonb(pg_wal_lsn_diff(${S.literal(afterDB.lsn)},${S.literal(beforeDB.lsn)})::bigint);`);
  assert.equal(final.llmUsage.length, 6004);assert.equal(hash(final.llmUsage.slice(4)), originalHistoryHash);
  assert.equal(hash(final.componentInertRestVolume), restVolumeHash);
  for (const [key, value] of Object.entries(retainedFieldHashes)) assert.equal(hash(final[key]), value);
  const wire = Object.fromEntries(Object.keys(request.stats).map(k => [k, request.stats[k] - beforeWire[k]]));
  const result = { schema: "helmut-auth-usage-split-component-comparison/1", pass: true, mode: config.mode,
    scope: "Synthetic same-fixture24 full-state mutations/four appends; no profiles or500-program; common lifetime peak includes setup",
    fixture: { fixtureJSONBytes, historyCount, sha256: hash(withoutRevision(data)), originalHistoryHash,
      usageJSONBytes, usageFraction: usageJSONBytes / fixtureJSONBytes,
      nonusageJSONBytes: fixtureJSONBytes - usageJSONBytes, declaredSyntheticPaddingBytes: paddingBytes,
      paddingSHA256, restVolumeHash, retainedFieldHashes, perUsagePaddingBytes: 0,
      historicalTargetSizeSource: "PR972 FORWARD_PREPARATION_20261028.SAFE.json fixtureAuthBytes=13616853",
      shapeOrOriginalReconstruction: false, representativeOriginalDataClaim: false,
      description: "6000 inert technical component receipts plus declared pseudorandom nonusage padding; matches only recorded total byte volume, not private shapes or runtime authority" },
    result: { completePostimageHash: hash(withoutRevision(final)), historyCount: final.llmUsage.length,
      originalHistoryRetained: true, all24ACKAndFullReadback: true },
    setupWallMs, wallMs, maximumOperationMs: Math.max(...operations.map(x => x.wallMs)), cpu, wire,
    database: { before: beforeDB, after: afterDB, walDeltaBytes,
      tempDeltaBytes: afterDB.tempBytes - beforeDB.tempBytes, tempFilesDelta: afterDB.tempFiles - beforeDB.tempFiles },
    kernel: { atEntry: kernelAtEntry, beforeWorkload: beforeKernel, afterWorkload: afterKernel,
      commonScopeVerifiedByThisDriver: false, requiresLauncherSameCgroupEvidence: true },
    process: { node: process.version, maxRSSBytes: process.resourceUsage().maxRSS * 1024,
      finalMemoryUsage: process.memoryUsage(), totalCPU: process.cpuUsage(processAtEntry) },
    naturalGC: gc, operations, forcedGC: false, cacheClearing: false, memorySubtraction: false,
    workMem: "4MB", profiles: 0, engineUnits: 0, providerCalls: 0, complete500Attempts: 0 };
  if (config.resultFile) fs.writeFileSync(config.resultFile, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(result));return result;
}
if (require.main === module) main(S.readConfig(process.argv[2])).catch(error => { console.error(error.stack);process.exitCode = 1; });
module.exports = { main };
