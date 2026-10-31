"use strict";

// Focused integration against the eleven received originals and one explicitly
// isolated restored database. No activation, command installation, provider,
// substituted source fixtures or 500-unit loop. SQL writes are denied probes;
// every transaction ends in rollback. No HTTP/PostgREST qualification claimed.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const crypto = require("node:crypto"), vm = require("node:vm"), { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, ".."), sha = b => crypto.createHash("sha256").update(b).digest("hex");
const literal = s => "'" + String(s).replaceAll("'", "''") + "'";
const docker = args => spawnSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
  encoding: "utf8", timeout: 25000, maxBuffer: 20 * 1024 * 1024,
  env: { PATH: process.env.PATH, LANG: "C.UTF-8" }, stdio: ["pipe", "pipe", "pipe"]
});
function privateFile(file, root) {
  assert(path.resolve(file).startsWith(root + path.sep));
  assert.equal(fs.realpathSync(file), path.resolve(file));
  const st = fs.lstatSync(file); assert(st.isFile() && !st.isSymbolicLink());
  assert.equal(st.uid, process.getuid()); assert.equal(st.mode & 0o777, 0o600);
  return fs.readFileSync(file);
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const x of Object.values(value)) freeze(x); Object.freeze(value);
  }
  return value;
}
async function main() {
  // Requiring this script directly is never a substitute for the local starter.
  const guardPath = require.resolve("./lokaler-netzschutz"); assert(require.cache[guardPath], "Use scripts/lokal.js");
  assert.equal(process.env.HELMUT_SOURCE_MODE, "off"); assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local");
  assert.deepEqual(require(guardPath).pruefe(process.env), []);
  const container = process.env.HELMUT_SYNTHETIK500_PG_CONTAINER, database = process.env.HELMUT_W15_PG_DATABASE;
  assert.equal(process.env.HELMUT_SYNTHETIK500_PG_ISOLIERT, "JA");
  assert.match(container || "", /^synthetik500-runtime-pg-[a-f0-9]{8,16}$/);
  assert.match(database || "", /^helmut_w15_input_[0-9]{8}(?:_[a-f0-9]{8})?$/);
  const dataRoot = path.resolve(process.env.HELMUT_W15_DATA_ROOT || "");
  assert.match(dataRoot, /^\/workspace\/shared\/helmut-w15-receipt-[0-9]{8}\/files\/helmut-parallel-20261015$/);
  assert.equal(fs.realpathSync(dataRoot), dataRoot);
  const receiptRoot = path.dirname(path.dirname(dataRoot));
  const manifestPath = process.env.HELMUT_W15_RECEIPT_MANIFEST;
  assert.equal(path.resolve(manifestPath || ""), path.join(receiptRoot, "reports/W15_RECEPTION_REPORT.SAFE.json"));
  assert.match(process.env.HELMUT_W15_RECEIPT_SHA256 || "", /^[a-f0-9]{64}$/);
  const receiptBytes = privateFile(manifestPath, receiptRoot);
  assert.equal(sha(receiptBytes), process.env.HELMUT_W15_RECEIPT_SHA256);
  const receipt = JSON.parse(receiptBytes); assert.equal(receipt.status, "PASS_ALL_11_FILES_COMPLETE_RECEPTION");
  assert.equal(receipt.actualFileCount, 11); assert.equal(receipt.actualPayloadBytes, 96530256);
  const originals = new Map(receipt.files.map(x => [x.key, x])), originalPins = [];
  function original(key) {
    const pin = originals.get(key); assert(pin && pin.status === "PASS");
    assert.equal(path.resolve(pin.receivedPath), path.join(dataRoot, path.relative("/workspace/helmut-parallel-20261015", pin.originalPath)));
    const bytes = privateFile(pin.receivedPath, dataRoot); assert.equal(bytes.length, pin.expectedBytes);
    assert.equal(sha(bytes), pin.expectedSHA256); originalPins.push({ key, bytes: bytes.length, sha256: sha(bytes) });
    return JSON.parse(bytes);
  }
  const capture = original("readOnlyCapture"), native = original("actualSource23KO60");
  const predecessor = original("originalUPacket"), inventory = original("nativeInventoryHistoricalTemplate");
  assert.equal(native.database, "helmut_fresh_input_fixture_d2e98984");
  assert.equal(inventory.documents.length, 7); assert.equal(inventory.knowledgeObjects.length, 6);
  const expected = freeze({ documents: native.documents, knowledgeObjects: native.kos });
  assert.equal(expected.documents.length, 7); assert.equal(expected.knowledgeObjects.length, 6);
  const inspected = docker(["inspect", container]); assert.equal(inspected.status, 0, "Local container inspection failed");
  const info = JSON.parse(inspected.stdout)[0]; assert.equal(info.State.Running, true);
  assert.equal(info.Config.Image, "postgres:17.6-bookworm"); assert.equal(info.HostConfig.NetworkMode, "none");
  assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
  assert((info.Mounts || []).every(m => m.Type === "volume" && m.Destination === "/var/lib/postgresql/data"));
  function sql(text, { role = "postgres", readOnly = true, error = null } = {}) {
    assert(["postgres", "service_role", "anon", "authenticated"].includes(role));
    const input = `begin${readOnly ? " read only" : ""};set local statement_timeout='15s';set local lock_timeout='2s';`
      + `set local role ${role};${text}\nrollback;`;
    const r = spawnSync("docker", ["--host=unix:///var/run/docker.sock", "exec", "-i", container, "psql", "-X", "-w", "-qAt",
      "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-f", "-"], {
      input, encoding: "utf8", timeout: 20000, maxBuffer: 20 * 1024 * 1024,
      env: { PATH: process.env.PATH, LANG: "C.UTF-8" }, stdio: ["pipe", "pipe", "pipe"]
    });
    if (error) { assert.notEqual(r.status, 0); assert.match(r.stderr || "", error); return; }
    assert.equal(r.status, 0, "Isolated SQL query failed (private SQL output suppressed)"); return r.stdout.trim();
  }
  const query = (text, options) => JSON.parse(sql(text, options));
  const checks = [], pass = name => { checks.push({ name, status: "PASS" }); console.log("PASS " + name); };
  const operation = predecessor.command.slot.plan.operationId, rowId = "synthetik500-command-" + operation;
  assert.match(operation, /^synthetik500-[a-z0-9-]{8,80}$/);
  const tableHash = (table, key) => `(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t)order by ${key})::text,'null'),'UTF8')),'hex')from ${table} t)`;
  function state() {
    return query("select jsonb_build_object('database',current_database(),'serverVersion',current_setting('server_version_num'),"
      + "'profiles',(select count(*)from mandate_profiles),'active',(select count(*)from mandate_profiles where aktiv),"
      + "'identities',(select count(*)from profiles),'storeRows',(select count(*)from helmut_store),"
      + "'profileHash'," + tableHash("mandate_profiles", 'user_id collate "C"') + ","
      + "'identityHash'," + tableHash("profiles", 'id collate "C"') + ","
      + "'storeHash'," + tableHash("helmut_store", 'id collate "C"') + ","
      + "'rawDocumentHash'," + tableHash("raw_documents", 'id collate "C"') + ","
      + "'knowledgeObjectHash'," + tableHash("knowledge_objects", 'id collate "C"') + ","
      + "'budgetHash'," + tableHash("llm_budget_counters", 'day,scope collate "C"') + ","
      + "'mainAuthHash',(select encode(sha256(convert_to(data::text,'UTF8')),'hex')from helmut_store where id='main-auth'),"
      + "'uSHA',(select encode(sha256(convert_to(data::text,'UTF8')),'hex')from helmut_store where id=" + literal(rowId) + "));" );
  }
  const before = state(); assert.equal(before.database, database); assert.equal(before.serverVersion, "170006");
  for (const k of ["profiles", "active", "profileHash", "identityHash", "uSHA"]) assert.equal(before[k], capture.before[k], k + " original capture");
  assert.equal(before.profiles, 500); assert.equal(before.identities, 501); assert.equal(before.storeRows, 6);
  pass("original restored profiles, identities and U match frozen capture; baseline Auth/history/source/counter hashes captured");
  const C = require("../lib/helmut/synthetik-500-production-command"), B = require("../lib/helmut/synthetik-500-current-inputs-read-batch");
  C.validateSources(expected); assert.equal(B.eligible(expected), false);
  assert.equal(B.readBatches(expected, () => { throw Error("7/6 original context must not call fixed874/500 RPC"); }), null);
  pass("real Source23/KO60 originals validate and correctly keep the original7/6 reader");
  const storageFile = path.join(ROOT, "lib/helmut/storage.js"), storageText = fs.readFileSync(storageFile, "utf8");
  const start = storageText.indexOf("async function readSynthetik500CurrentInputs(expected) {"), end = storageText.indexOf("\n}\n", start) + 2;
  assert(start > 0 && end > start); const readerBody = storageText.slice(start, end);
  let requests = 0, omitted = false;
  async function request(endpoint, options) {
    assert.equal(options, undefined); requests++;
    const u = new URL(endpoint, "http://isolated.invalid"), table = u.pathname.split("/").pop();
    assert(["raw_documents", "knowledge_objects"].includes(table)); assert.equal(u.pathname, "/rest/v1/" + table);
    assert.equal(u.searchParams.get("order"), "id.asc"); const filter = u.searchParams.get("id");
    assert.match(filter || "", /^in\.\(.+\)$/); const ids = filter.slice(4, -1).split(",");
    assert(ids.every(id => /^[A-Za-z0-9_ÄÖÜäöüß-]{1,200}$/u.test(id)));
    assert.equal(u.searchParams.get("limit"), String(ids.length + 1));
    const columns = u.searchParams.get("select").split(",").map(field => {
      const m = /^([a-z][a-z0-9_]*)(?::([a-z][a-z0-9_]*)(?:->([A-Za-z][A-Za-z0-9_]*))?)?$/.exec(field); assert(m);
      return m[2] ? `t.${m[2]}${m[3] ? "->" + literal(m[3]) : ""} as ${m[1]}` : "t." + m[1];
    });
    return query("select coalesce(jsonb_agg(to_jsonb(q)order by q.id),'[]'::jsonb)from(select " + columns.join(",")
      + " from " + table + " t where t.id=any(array[" + ids.map(literal).join(",") + "]::text[])"
      + (omitted && table === "raw_documents" ? " and t.id<>" + literal(ids[0]) : "") + ")q;", { role: "service_role" });
  }
  const read = vm.runInThisContext("(function(require,synthetik500ProductionBackend,supabaseRequest,V3_KO_VERSION_SELECT_60,synthetik500SourceId){"
    + readerBody + ";return readSynthetik500CurrentInputs;})", { filename: storageFile + ":original-db-test" })(
    createRequire(storageFile), () => {}, request, require("../lib/helmut/knowledge-object-version").SELECT,
    id => typeof id === "string" && id.length > 0 && id.length <= 200 && !/[^A-Za-z0-9_ÄÖÜäöüß-]/u.test(id));
  const current = await read(expected); assert(C.same(current.documents, expected.documents.slice().sort((a, b) => a.id.localeCompare(b.id))));
  assert(C.same(current.knowledgeObjects, expected.knowledgeObjects.slice().sort((a, b) => a.id.localeCompare(b.id))));
  assert.equal(requests, 2); pass("unchanged storage reader verifies all original7 documents/6 KOs through actual local SQL transport");
  omitted = true; await assert.rejects(read(expected), /current-input-incomplete/); omitted = false;
  const drift = structuredClone(expected); drift.documents[0].content_hash = "0".repeat(64);
  await assert.rejects(read(drift), /current-input-drift/); pass("actual SQL incompleteness and changed expected source hash fail closed without database changes");
  const nativePins = require("../lib/helmut/synthetik-500-stored-command-native-pins.json").nativeSources;
  const nonce = crypto.randomBytes(32).toString("hex");
  const bindingCall = include => "select public.helmut_s500_read_command_binding_v1(" + literal(operation) + "," + literal(nonce) + "," + include + ");";
  const binding = query(bindingCall(true), { role: "service_role" }); assert.equal(binding.database, database);
  assert.equal(binding.rowId, rowId); assert.equal(binding.nonce, nonce); assert.equal(binding.storedSHA256, before.uSHA);
  assert.equal(Buffer.byteLength(binding.dataText), binding.storedBytes); assert.equal(sha(binding.dataText), binding.storedSHA256);
  assert.deepEqual(binding.nativeSources, nativePins); assert.equal(JSON.parse(binding.dataText).command.slot.plan.operationId, operation);
  const noBody = query(bindingCall(false), { role: "service_role" }); assert.equal(noBody.dataText, null);
  for (const k of ["tableOID", "xmin", "ctid", "storedSHA256", "storedBytes"]) assert.equal(noBody[k], binding[k]);
  for (const role of ["anon", "authenticated"]) sql(bindingCall(false), { role, error: /permission denied/ });
  pass("original U row native body/hash and physical binding verify against all three pinned function bodies; unauthorized roles denied");
  for (const statement of ["update helmut_store set data=data where id=" + literal(rowId) + ";", "delete from helmut_store where id=" + literal(rowId) + ";"])
    sql(statement, { readOnly: false, error: /synthetik500-command-immutable/ });
  sql("truncate helmut_store;", { readOnly: false, error: /synthetik500-command-truncate-denied/ });
  pass("original retained command refuses UPDATE, DELETE and TRUNCATE before mutation");
  const docIds = expected.documents.map(x => x.id), koIds = expected.knowledgeObjects.map(x => x.id);
  const batchCall = "select public.helmut_synthetik500_current_inputs_v1(array[" + docIds.map(literal).join(",") + "]::text[],array["
    + koIds.map(literal).join(",") + "]::text[]," + literal(crypto.randomBytes(16).toString("hex")) + ");";
  sql(batchCall, { role: "service_role", error: /synthetik500-current-inputs-selector/ });
  sql(batchCall, { role: "service_role", readOnly: false, error: /synthetik500-current-inputs-service-readonly-required/ });
  sql(batchCall, { role: "anon", error: /permission denied/ });
  pass("bounded batch RPC refuses unsupported original7/6 shape, read-write transaction and anonymous role; no fabricated874/500 data");
  const after = state(); assert.deepEqual(after, before); pass("complete profiles, identities, original U, Auth/history/store, source/KO and counter hashes unchanged");
  const result = { schema: "helmut-w15-original-db-functional-test/1", status: "PASS", passed: checks.length, checks,
    receiptSHA256: sha(receiptBytes), originalPins, database, container, originalCounts: { profiles: 500, identities: 501, documents: 7, knowledgeObjects: 6 },
    sqlTransportRequests: requests, before, after, unchanged: true, storageReaderBodySHA256: sha(readerBody),
    scope: "ACTUAL_RESTORED_ORIGINALS_AND_SQL_WITH_UNCHANGED_STORAGE_READER_BODY; TRANSPORT_ADAPTER_NOT_HTTP", batch874x500Qualified: false,
    applicationProfileActivations: 0, providerCalls: 0, full500Run: false, oldClaimsReset: false, productionActions: 0 };
  const output = process.argv.find(x => x.startsWith("--output="));
  if (output) {
    const p = path.resolve(output.slice(9)); assert(p.startsWith(receiptRoot + "/reports/"));
    assert.equal(fs.realpathSync(path.dirname(p)), path.dirname(p));
    fs.writeFileSync(p, JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  console.log(JSON.stringify(result)); return result;
}
if (require.main === module) main().catch(error => { console.error("W15 original DB functional check failed: " + error.message); process.exitCode = 1; });
module.exports = { main };
