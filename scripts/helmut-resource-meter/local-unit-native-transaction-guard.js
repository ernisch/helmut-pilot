"use strict";

// Explicit, once-only SOURCE compiler/receipt diagnostic in a fresh owned COPY.
// No Scope/Unit acceptance, provider, runtime injection, arbitrary SQL or retry.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), v8 = require("node:v8");
const childProcess = require("node:child_process");
const CONFIG = "/bench/TRANSACTION_GUARD_CONFIG.PRIVATE.json";
const INITIALIZATION = "/bench/ORIGINAL_SEED_INITIALIZATION.PRIVATE.json";
const CASES = Object.freeze(["state", "same-root-usage", "late-old-mirror", "late-outside"]);
const ROOT = path.resolve(__dirname, "../.."), CAP = 36 * 1024 * 1024;
const CODE = Object.freeze({ llmUsageAtomic: "llm-usage-atomic", authStateParts: "auth-state-parts", authStoreCas: "auth-store-cas",
  euServiceContract: "synthetik-500-eu-service-contract", profile: "synthetik-500-profile", streamingCanonicalHash: "streaming-canonical-hash",
  canonicalContentFacts: "canonical-content-facts", cpuEpoch: "synthetik-500-cpu-epoch", canonicalShaByteWriter: "canonical-sha-byte-writer" });
const READERS = Object.freeze(["helmut_auth_state_graph_read_v1", "helmut_auth_usage_read_v1"]);
const ENV = new Set(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ", "SUPABASE_URL", "HELMUT_STORAGE_BACKEND", "HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE",
  "HELMUT_NATIVE_NODE_OLD_SPACE_MIB", "HELMUT_LLM_USAGE_STORAGE", "HELMUT_AUTH_STATE_STORAGE", "HELMUT_AUTH_HISTORY_READ_REUSE",
  "HELMUT_AUTH_GRAPH_READ_REUSE", "HELMUT_AUTH_SINGLE_WRITE_CAPTURE", "HELMUT_AUTH_CONTROL_READ"]);
let attempted = false;
// Only locally created assertion errors carry a closed diagnostic label. Never
// classify foreign errors by message/code/stack: those may contain SQL or data.
const guardFailureCodes = new WeakMap();
const FAILURE_CODES = new Set([
  "actual-heap-limit", "actual-own-after-ack", "actual-own-canonical",
  "actual-psql-process", "all-psql-children-closed", "bounded-serial-psql",
  "canonical-file", "cgroup-pin", "child-exit-identity",
  "closed-environment", "closed-error-enum", "closed-read-rpc",
  "code-closure", "configuration", "diagnostic-clock",
  "explicit-once-cli", "file-drift", "file-grew",
  "file-metadata", "file-pin", "fixed-code",
  "fixed-files", "fixed-read-row", "fixture-original-cas-only",
  "fixture-own-and-usage-unchanged", "fresh-outside-fixture-key", "fresh-seeded-copy-only",
  "genuine-D-request", "genuine-accepted-write", "genuine-auth-snapshot",
  "genuine-seed-and-parts", "genuine-single-cas", "json-invalid",
  "json-unique", "json-utf8", "library-path",
  "missing-read-pin", "native-claim-deadline", "native-owner-drift",
  "negative-complete-logical-rollback", "negative-write-once", "node-budget",
  "output-name", "output-short-write", "positive-state-committed",
  "postgres-pin", "process-id", "process-live",
  "psql-outcome-not-confirmed", "read-json", "read-pins",
  "read-source-pin", "request-path", "same-root-usage-actual-delta",
  "seed-initialization", "self-binding", "self-drift",
  "snapshot-catalog-binding", "state-old-history-preserved", "stdout-utf8",
  "symlink-component", "target-origin", "unchanged-read-capture-modes",
  "unexpected-table-delta", "write-retry-forbidden"
]);
const need = (ok, code) => {
  if (!ok) {
    const label = FAILURE_CODES.has(code) ? code : "unclassified";
    const error = Error("local-unit-transaction-guard-" + label);
    guardFailureCodes.set(error, label); throw error;
  }
};
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
const fields = ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"];
function canonicalPath(name) {
  need(typeof name === "string" && path.isAbsolute(name) && path.normalize(name) === name && fs.realpathSync(name) === name, "canonical-file");
  let current = path.parse(name).root;
  for (const part of name.slice(current.length).split(path.sep)) { current = path.join(current, part); need(!fs.lstatSync(current).isSymbolicLink(), "symlink-component"); }
}
function readFile(name, { pin = null, privateFile = false, cap = 1048576, keep = true, allowEmpty = false } = {}) {
  canonicalPath(name);
  if (pin) need(exact(pin, ["path", "bytes", "sha256"]) && pin.path === name && Number.isSafeInteger(pin.bytes)
    && pin.bytes > 0 && pin.bytes <= cap && hash(pin.sha256), "file-pin");
  const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const a = fs.fstatSync(fd, { bigint: true });
    need(a.isFile() && a.nlink === 1n && (a.size > 0n || allowEmpty && a.size === 0n) && a.size <= BigInt(cap)
      && (!pin || a.size === BigInt(pin.bytes)) && (!privateFile || a.uid === 1000n && (a.mode & 0o7777n) === 0o600n), "file-metadata");
    const buffer = Buffer.alloc(Math.min(Number(a.size) + 1, 65536)), blocks = [], digest = crypto.createHash("sha256"); let total = 0;
    while (true) {
      const count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, Number(a.size) - total + 1), null);
      if (!count) break; total += count; need(total <= Number(a.size), "file-grew");
      digest.update(buffer.subarray(0, count)); if (keep) blocks.push(Buffer.from(buffer.subarray(0, count)));
    }
    const b = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(name, { bigint: true }), hex = digest.digest("hex");
    need(total === Number(a.size) && fields.every(key => a[key] === b[key] && b[key] === named[key])
      && fs.realpathSync(name) === name && (!pin || hex === pin.sha256), "file-drift");
    return { bytes: keep ? Buffer.concat(blocks) : null, pin: { path: name, bytes: total, sha256: hex } };
  } finally { fs.closeSync(fd); }
}
function jsonFile(name, options) {
  const result = readFile(name, options), text = result.bytes.toString("utf8");
  need(Buffer.from(text).equals(result.bytes), "json-utf8");
  let value; try { value = JSON.parse(text); } catch { need(false, "json-invalid"); }
  need(JSON.stringify(value) === text, "json-unique"); return { value, pin: result.pin };
}
function processIdentity(pid) {
  need(Number.isSafeInteger(pid) && pid > 0, "process-id");
  const text = fs.readFileSync(`/proc/${pid}/stat`, "utf8"), values = text.slice(text.lastIndexOf(")") + 2).trim().split(/\s+/);
  need(Number(text.slice(0, text.indexOf(" "))) === pid && !["Z", "X"].includes(values[0]) && /^[0-9]+$/.test(values[19]), "process-live");
  return { pid, parentPID:Number(values[1]), startTicks: values[19], exe: fs.readlinkSync(`/proc/${pid}/exe`), membership: fs.readFileSync(`/proc/${pid}/cgroup`, "utf8") };
}
function nodeBudget() {
  need(process.version === "v24.19.0" && process.getuid() === 1000 && process.geteuid() === 1000
    && process.execArgv.length === 2 && process.execArgv[0] === "--max-old-space-size=384" && process.execArgv[1] === "--max-semi-space-size=16"
    && !Object.hasOwn(process.env, "NODE_OPTIONS") && process.env.HELMUT_NATIVE_NODE_OLD_SPACE_MIB === "384", "node-budget");
  const heap = v8.getHeapStatistics().heap_size_limit;
  need(Number.isSafeInteger(heap) && heap > 0 && heap <= 448 * 1024 * 1024, "actual-heap-limit");
  return { nodeVersion: process.version, execArgv: [...process.execArgv], oldSpaceMiB: 384, semiSpaceMiB: 16, heapSizeLimitBytes: heap };
}
function checkConfig(c) {
  need(exact(c, ["schema", "operationId", "commandHash", "database", "selfPin", "nodePin", "seedInitializationPin", "case",
    "codePins", "authorityPin", "transactionPin", "qualification", "requestPin", "readRPCPins", "psqlPin", "libraryPath", "measuredCgroup", "postgres"])
    && c.schema === "helmut-native-transaction-guard/1" && CASES.includes(c.case) && typeof c.operationId === "string" && /^localUnitDiagnostic-[a-f0-9]{32}$/.test(c.operationId)
    && hash(c.commandHash) && c.database === "helmut_unit_diagnostic_" + c.operationId.slice(-32), "configuration");
  need(Object.keys(process.env).every(key => ENV.has(key)) && process.env.HELMUT_STORAGE_BACKEND === "supabase"
    && process.env.HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE === c.database && process.env.HELMUT_LLM_USAGE_STORAGE === "relational-atomic-v1"
    && process.env.HELMUT_AUTH_STATE_STORAGE === "merkle-auth-v1", "closed-environment");
  need(process.env.HELMUT_AUTH_HISTORY_READ_REUSE === "verified-history-reuse-v1"
    && process.env.HELMUT_AUTH_CONTROL_READ === "verified-control-view-v1"
    && [undefined,"off"].includes(process.env.HELMUT_AUTH_GRAPH_READ_REUSE)
    && [undefined,"off"].includes(process.env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE), "unchanged-read-capture-modes");
  let origin; try { origin = new URL(process.env.SUPABASE_URL); } catch { need(false, "target-origin"); }
  need(origin.protocol === "http:" && !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/"
    && (/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(origin.hostname) || /^10\.\d+\.\d+\.\d+$/.test(origin.hostname)
      || /^192\.168\.\d+\.\d+$/.test(origin.hostname) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(origin.hostname)), "target-origin");
  need(c.selfPin.path === __filename && c.nodePin.path === fs.realpathSync(process.execPath)
    && c.authorityPin.path === path.join(ROOT, "lib/helmut/local-unit-diagnostic-authority.js")
    && c.transactionPin.path === path.join(__dirname, "local-unit-original-transaction.js")
    && c.qualification?.database === c.database
    && c.seedInitializationPin.path === INITIALIZATION && c.psqlPin.path === "/usr/lib/postgresql/17/bin/psql", "fixed-files");
  need(exact(c.postgres, ["pid", "startTicks", "exePin"]) && c.postgres.exePin.path === "/usr/lib/postgresql/17/bin/postgres"
    && typeof c.postgres.startTicks === "string" && /^[0-9]+$/.test(c.postgres.startTicks), "postgres-pin");
  need(exact(c.measuredCgroup, ["path", "device", "inode", "procMembership"]) && c.measuredCgroup.path === "/owned-group"
    && Number.isSafeInteger(c.measuredCgroup.device) && Number.isSafeInteger(c.measuredCgroup.inode) && c.measuredCgroup.inode > 0
    && c.measuredCgroup.procMembership === "0::/\n", "cgroup-pin");
  need(typeof c.libraryPath === "string" && c.libraryPath.length <= 1024 && c.libraryPath.split(":").every(value =>
    /^\/(?:ram\/jit-root|jit-root\/tree|usr\/lib\/x86_64-linux-gnu)(?:\/[a-zA-Z0-9_.-]+)*$/.test(value)), "library-path");
  need(exact(c.codePins, Object.keys(CODE)), "code-closure");
  for (const [key, base] of Object.entries(CODE)) need(c.codePins[key].path === path.join(ROOT, "lib/helmut", base + ".js"), "fixed-code");
  need(Array.isArray(c.readRPCPins) && c.readRPCPins.length === 2 && new Set(c.readRPCPins.map(pin => pin.name)).size === 2, "read-pins");
  for (const pin of c.readRPCPins) need(exact(pin, ["oid", "name", "identityArguments", "prosrcSHA256", "volatility", "returnType", "language", "config"])
    && typeof pin.oid === "string" && /^[1-9][0-9]{0,9}$/.test(pin.oid) && BigInt(pin.oid) <= 4294967295n
    && READERS.some(name => pin.name === "public." + name) && pin.identityArguments === "jsonb" && hash(pin.prosrcSHA256)
    && ["i", "s"].includes(pin.volatility) && pin.returnType === "jsonb" && ["sql", "plpgsql"].includes(pin.language)
    && Array.isArray(pin.config) && pin.config.length === 1 && pin.config[0] === "search_path=pg_catalog", "read-source-pin");
  need(c.requestPin?.path.startsWith("/bench/client/") && !c.requestPin.path.slice(14).includes("/"), "request-path");
  return origin.origin + "|main-auth";
}
function readonlySQL(c, endpoint, options) {
  const name = endpoint.startsWith("/rest/v1/rpc/") ? endpoint.slice(13) : null;
  need(READERS.includes(name) && exact(options, ["method", "body"]) && options.method === "POST" && typeof options.body === "string"
    && Buffer.byteLength(options.body) <= 65536, "closed-read-rpc");
  let args; try { args = JSON.parse(options.body); } catch { need(false, "read-json"); }
  need(args?.id === "main-auth" && JSON.stringify(args) === options.body && ["id", "knownProof", "readNonce", "knownGraph"].every(key =>
    key === "id" || !Object.hasOwn(args, key) || Object.hasOwn(args, "readNonce"))
    && Object.keys(args).every(key => ["id", "knownProof", "readNonce", "knownGraph"].includes(key))
    && (!Object.hasOwn(args, "readNonce") || uuid(args.readNonce)), "fixed-read-row");
  const p = c.readRPCPins.find(pin => pin.name === "public." + name), encoded = Buffer.from(options.body).toString("base64");
  need(p, "missing-read-pin");
  // All SQL names are from the closed list; all payload text is base64 data.
  return `BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='28000ms'; SET LOCAL lock_timeout='1000ms'; SET LOCAL helmut.local_usage_experiment='on';
DO $read_pin$ BEGIN
IF current_database()<>'${c.database}' OR session_user<>'postgres' OR current_user<>session_user OR NOT EXISTS(
SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
WHERE p.oid=${p.oid}::oid AND n.nspname='public' AND p.proname='${name}' AND NOT p.prosecdef
AND pg_get_function_identity_arguments(p.oid)='jsonb' AND pg_get_function_result(p.oid)='jsonb'
AND p.provolatile='${p.volatility}' AND p.provolatile IN('i','s') AND l.lanname='${p.language}'
AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='${p.prosrcSHA256}')
THEN RAISE EXCEPTION 'original-seed-read-source-drift'; END IF; END;$read_pin$;
SELECT public.${name}(convert_from(decode('${encoded}','base64'),'UTF8')::jsonb); COMMIT;`;
}

function publish(name, bytes) {
  need(/^TRANSACTION_GUARD_[A-Z0-9_]+\.(?:PRIVATE\.(?:json|log)|SAFE\.json)$/.test(name), "output-name");
  const filename = path.join("/bench", name), fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    need(fs.writeSync(fd, bytes) === bytes.length, "output-short-write"); fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  const directory=fs.openSync("/bench",fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  try{fs.fsyncSync(directory);}finally{fs.closeSync(directory);}
  return readFile(filename, { privateFile: true, cap: CAP, keep: false, allowEmpty: true }).pin;
}
function errorMatches(bytes, reason) {
  need(["original-bridge-old-full-auth-mirror", "original-bridge-outside-keyset-changed"].includes(reason), "closed-error-enum");
  const text = bytes.toString("utf8");
  return Buffer.from(text).equals(bytes) && new RegExp("^(?:psql:<stdin>:[1-9][0-9]*: )?ERROR:  " + reason + "\\n$").test(text);
}
function confirmedClose(row, negative = null, stderr = Buffer.alloc(0)) {
  return row.exitObserved === true && row.exitSignal === null && row.stdoutEOF === true && row.stderrEOF === true
    && row.failure === null && (negative ? row.exitCode === 3 && errorMatches(stderr, negative) : row.exitCode === 0);
}
function readPrefix(c) {
  return `BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='500ms';
DO $guard$ BEGIN IF current_database()<>'${c.database}' OR session_user<>'postgres' OR current_user<>session_user
THEN RAISE EXCEPTION 'transaction-guard-read-context'; END IF; END;$guard$;\n`;
}
function ownSQL(c) {
  return readPrefix(c) + `SELECT jsonb_build_object('body',body,'canonical',canonical_text,'hash',body_hash,'revision',revision)
FROM helmut_unit_diagnostic.state WHERE scope_hash='${c.commandHash}'; COMMIT;`;
}
function snapshotSQL(c) {
  // Complete logical row multisets, not page hashes or a substitute for a CAS.
  // Per-row SHA plus sorted concatenation/count retains duplicate multiplicity.
  // MATERIALIZED is a projection fence: only 64-hex h enters a spool/sort.
  // No password/auth field is selected from system catalogs.
  return readPrefix(c) + `DO $snapshot$
DECLARE t record; count_rows bigint; digest text; tables jsonb:='{}'::jsonb; source_catalog jsonb; own_row record;
BEGIN
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind='r' AND ((n.nspname='public' AND c.relname IN('helmut_store','helmut_auth_state_nodes_local','llm_usage','briefings','profiles'))
     OR n.nspname='helmut_unit_diagnostic') ORDER BY n.nspname,c.relname LOOP
   IF NOT (t.nspname||'.'||t.relname=ANY(ARRAY[
     'helmut_unit_diagnostic.artifacts','helmut_unit_diagnostic.authority','helmut_unit_diagnostic.leases',
     'helmut_unit_diagnostic.legacy_read_rpcs','helmut_unit_diagnostic.runtime_observations','helmut_unit_diagnostic.state',
     'public.briefings','public.helmut_auth_state_nodes_local','public.helmut_store','public.llm_usage','public.profiles']))
     THEN RAISE EXCEPTION 'transaction-guard-unexpected-snapshot-relation';END IF;
   -- PRIVATE psql stderr only; one fixed enum before each of exactly eleven hashes.
   RAISE NOTICE 'HELMUT_TRANSACTION_GUARD_SNAPSHOT_TABLE_V1 %',t.nspname||'.'||t.relname;
   EXECUTE format($row_digest$WITH row_hashes AS MATERIALIZED (
     SELECT encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') AS h FROM %I.%I r
   ) SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') FROM row_hashes$row_digest$,t.nspname,t.relname)
     INTO count_rows,digest;
   tables:=tables||jsonb_build_object(t.nspname||'.'||t.relname,jsonb_build_object('count',count_rows,'sha256',digest));
 END LOOP;
 IF (SELECT count(*) FROM jsonb_object_keys(tables))<>11 THEN RAISE EXCEPTION 'transaction-guard-complete-table-set';END IF;
 RAISE NOTICE 'HELMUT_TRANSACTION_GUARD_SNAPSHOT_CATALOG_V1';
 SELECT jsonb_build_object(
   'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='helmut_unit_diagnostic' OR (n.nspname='public' AND (p.proname LIKE 'helmut_auth_%' OR p.proname LIKE 'local_unit_diagnostic_%'))),
   'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,
     'createDB',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypassRLS',rolbypassrls,'limit',rolconnlimit,
     'validUntil',rolvaliduntil,'config',rolconfig) ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'helmut_ud_%'),
   'relations',helmut_unit_diagnostic.original_bridge_relations_v1(),
   'triggers',(SELECT jsonb_agg(to_jsonb(g) ORDER BY g.oid) FROM pg_trigger g JOIN pg_class r ON r.oid=g.tgrelid
      JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='helmut_unit_diagnostic'
      OR (n.nspname='public' AND r.relname IN('helmut_store','helmut_auth_state_nodes_local','llm_usage','briefings','profiles')))) INTO source_catalog;
 SELECT body_hash,revision INTO STRICT own_row FROM helmut_unit_diagnostic.state WHERE scope_hash='${c.commandHash}';
 PERFORM set_config('helmut.transaction_guard_snapshot',jsonb_build_object('schema','helmut-native-transaction-logical-snapshot/1',
   'database',current_database(),'databaseOID',(SELECT oid::text FROM pg_database WHERE datname=current_database()),
   'tables',tables,'catalogSHA256',encode(sha256(convert_to(source_catalog::text,'UTF8')),'hex'),
   'ownHash',own_row.body_hash,'ownRevision',own_row.revision,
   'root',(SELECT data->'_authStateRef' FROM public.helmut_store WHERE id='main-auth'),
   'authRevision',(SELECT data->>'_authStoreRevision' FROM public.helmut_store WHERE id='main-auth'),
   'usage',public.helmut_auth_usage_checked_proof_local_v1('main-auth')->'proof')::text,true);
END;$snapshot$;
SELECT current_setting('helmut.transaction_guard_snapshot')::jsonb; COMMIT;`;
}
function assertDelta(before, after, allowed) {
  need(before.schema === after.schema && before.database === after.database && before.databaseOID === after.databaseOID
    && before.catalogSHA256 === after.catalogSHA256 && Object.keys(before.tables).sort().join() === Object.keys(after.tables).sort().join(), "snapshot-catalog-binding");
  for (const name of Object.keys(before.tables)) if (!allowed.includes(name))
    need(JSON.stringify(before.tables[name]) === JSON.stringify(after.tables[name]), "unexpected-table-delta");
}
async function start() {
  const began = process.hrtime.bigint(), beganUTC = Date.now();
  need(!attempted && process.argv.length === 3 && process.argv[2] === "--probe-native-transaction-guard", "explicit-once-cli"); attempted = true;
  const actualNodeBudget = nodeBudget(), { value: c, pin: configPin } = jsonFile(CONFIG, { privateFile: true });
  const target = checkConfig(c), self = processIdentity(process.pid);
  let lastUTC = beganUTC, serial = 0, children = new Set(), captures = [], transactions = [], claimConfirmed = false;
  need(self.exe === c.nodePin.path && self.membership === c.measuredCgroup.procMembership, "self-binding");
  for (const pin of [c.selfPin,c.nodePin,c.authorityPin,c.transactionPin,c.psqlPin,c.postgres.exePin,...Object.values(c.codePins)])
    readFile(pin.path, { pin, cap: 256 * 1024 * 1024, keep: false });
  const init = jsonFile(INITIALIZATION, { pin:c.seedInitializationPin, privateFile:true, cap:8*1024*1024 }).value;
  need(exact(init,["schema","initialState","authority","observation"]) && init.schema === "helmut-local-unit-original-seed-initialization/1", "seed-initialization");
  const A = require(c.authorityPin.path), P = require(c.codePins.profile.path), U = require(c.codePins.llmUsageAtomic.path), Parts = require(c.codePins.authStateParts.path);
  const T = require(c.transactionPin.path), selection = { operationId:c.operationId, commandHash:c.commandHash }, keys = [A.GRANTS_KEY,...Object.values(A.keys(c.operationId))];
  const command = JSON.parse(init.authority.commandCanonical), prefix = "localUnitDiagnostic:" + c.operationId.slice(-32) + ":";
  need(P.hash(command) === c.commandHash && command.target.database === c.database && P.hash(A.LIMITS) === P.hash(command.limits)
    && exact(init.initialState,keys) && U.enabled() === true && Parts.enabled() === true, "genuine-seed-and-parts");
  A.validateAdmission(command,JSON.parse(init.authority.admissionCanonical),new Date().toISOString());
  function guard() {
    const at = Date.now(), ns = process.hrtime.bigint()-began;
    // Stricter diagnostic cap, never a reset of the unchanged 30s/60s contracts.
    need(ns >= 0n && ns < 28000000000n && at >= lastUTC && at-beganUTC < 28000
      && at < Date.parse(command.calendar.endsAtUTC), "diagnostic-clock"); lastUTC = at;
    need(JSON.stringify(processIdentity(process.pid)) === JSON.stringify(self), "self-drift");
    const pg = processIdentity(c.postgres.pid), group = fs.statSync(c.measuredCgroup.path);
    need(pg.startTicks === c.postgres.startTicks && pg.exe === c.postgres.exePin.path && pg.membership === self.membership
      && group.dev === c.measuredCgroup.device && group.ino === c.measuredCgroup.inode, "native-owner-drift");
    readFile(CONFIG,{pin:configPin,privateFile:true,keep:false});
    readFile(INITIALIZATION,{pin:c.seedInitializationPin,privateFile:true,cap:8*1024*1024,keep:false});
    if (claimConfirmed) need(at < Date.parse(claimConfirmed.deadlineAtUTC), "native-claim-deadline");
  }
  async function psql(sql, label, negative = null) {
    guard(); need(/^[A-Z_]{1,40}$/.test(label) && Buffer.byteLength(sql)<=CAP && children.size===0 && serial<32, "bounded-serial-psql");
    readFile(c.psqlPin.path,{pin:c.psqlPin,cap:256*1024*1024,keep:false});
    const index = serial++, child = childProcess.spawn(c.psqlPin.path,["-X","-qAt","-w","-h","/ram/socket","-p","5432","-U","postgres","-d",c.database,
      "-v","ON_ERROR_STOP=1","-v","VERBOSITY=terse","-f","-"], {env:{PATH:"/usr/lib/postgresql/17/bin:/usr/bin:/bin",LANG:"C.UTF-8",LC_ALL:"C.UTF-8",
      PGCLIENTENCODING:"UTF8",PGCONNECT_TIMEOUT:"3",LD_LIBRARY_PATH:c.libraryPath,HOME:"/ram",TMPDIR:"/ram"},stdio:["pipe","pipe","pipe"]});
    children.add(child);
    return new Promise((resolve,reject) => {
      const out=[],err=[], row={index,label,pid:child.pid,sqlSHA256:sha(sql),exitObserved:false,exitCode:null,exitSignal:null,stdoutEOF:false,stderrEOF:false,failure:null};
      let outBytes=0,errBytes=0,done=false,killer, identity;
      const abort = () => { row.failure ||= "capture-unknown"; if (!done && child.exitCode===null && child.signalCode===null) {
        child.kill("SIGTERM"); killer ||= setTimeout(()=>child.kill("SIGKILL"),1000); } };
      const timer=setTimeout(abort,Math.max(1,Math.min(10000,28000-(Date.now()-beganUTC))));
      // Unknown terminal close fails; the SOURCE worker's existing cleanup still owns this subtree.
      const terminal=setTimeout(()=>{if(!done){done=true;abort();child.kill("SIGKILL");reject(Error("transaction-guard-child-close-unknown"));}},14000);
      try { identity=processIdentity(child.pid); need(identity.parentPID===process.pid && identity.exe===c.psqlPin.path && identity.membership===self.membership,"actual-psql-process"); row.process=identity; }
      catch { abort(); }
      child.once("error",abort); child.stdin.once("error",abort);
      for (const stream of [child.stdout,child.stderr]) stream.once("error",abort);
      child.stdout.on("data",b=>{outBytes+=b.length;if(outBytes>CAP)abort();else out.push(b);});
      child.stderr.on("data",b=>{errBytes+=b.length;if(errBytes>131072)abort();else err.push(b);});
      child.stdout.once("end",()=>{row.stdoutEOF=true;}); child.stderr.once("end",()=>{row.stderrEOF=true;});
      child.once("exit",(code,signal)=>{row.exitObserved=true;row.exitCode=code;row.exitSignal=signal;});
      child.once("close",(code,signal)=>{
        clearTimeout(timer);clearTimeout(terminal);clearTimeout(killer);children.delete(child);
        if(done)return;done=true;
        try {
          need(identity && row.exitCode===code && row.exitSignal===signal && child.exitCode===code && child.signalCode===signal,"child-exit-identity");
          const stdout=Buffer.concat(out),stderr=Buffer.concat(err);
          // Empty streams are also retained with exact byte pins.
          const stem="TRANSACTION_GUARD_"+String(index).padStart(2,"0")+"_"+label;
          if(["AUTH_READ","OWN_READ"].includes(label)) row.stdoutDigest={bytes:stdout.length,sha256:sha(stdout),payloadRetained:false};
          else row.stdoutPin=publish(stem+"_STDOUT.PRIVATE.log",stdout);
          row.stderrPin=publish(stem+"_STDERR.PRIVATE.log",stderr);
          row.expectedDiagnosticFailure=negative;captures.push(row);guard();
          need(confirmedClose(row,negative,stderr) && (!negative || stdout.length===0),"psql-outcome-not-confirmed");
          need(Buffer.from(stdout.toString("utf8")).equals(stdout),"stdout-utf8");resolve({stdout,row});
        } catch(error){reject(error);}
      });
      child.stdin.end(Buffer.from(sql));
    });
  }
  const jsonQuery=async(sql,label)=>JSON.parse((await psql(sql,label)).stdout.toString("utf8"));
  async function ownRead() {
    const b=await jsonQuery(ownSQL(c),"OWN_READ");
    need(exact(b,["body","canonical","hash","revision"]) && exact(b.body,keys) && Number.isSafeInteger(b.revision) && b.revision>=0
      && P.kanonisch(b.body)===b.canonical && P.hash(b.body)===b.hash,"actual-own-canonical"); A.current(b.body,selection);return b;
  }
  const authRead=()=>U.read({rowId:"main-auth",target,request:async(endpoint,options)=>jsonQuery(readonlySQL(c,endpoint,options),"AUTH_READ")});
  const snapshot=()=>jsonQuery(snapshotSQL(c),"SNAPSHOT");
  const seen=new Set(), rejected=new Set();
  async function write(label,next,record=null,negative=null) {
    need(!seen.has(label),"write-retry-forbidden");seen.add(label);guard();
    const before=await ownRead(), auth=await authRead(), history=auth.llmUsage;
    need(U.hasSnapshot(auth) && Array.isArray(history),"genuine-auth-snapshot");
    for(const key of keys)auth[key]=next[key];
    if(c.case==="late-outside") {
      const key="nativeTransactionGuardOutside_"+c.operationId.slice(-32);need(!Object.hasOwn(auth,key),"fresh-outside-fixture-key");auth[key]={diagnostic:true};
    }
    if(record)auth.llmUsage=[record,...history]; // Preserve every immutable historical record in its original order.
    let calls=0, ack=null;
    try {
      const accepted=await U.write(auth,{rowId:"main-auth",target,request:async(endpoint,options)=>{
        need(++calls===1 && endpoint==="/rest/v1/rpc/helmut_auth_state_cas_v1" && exact(options,["method","body"]) && options.method==="POST","genuine-single-cas");
        const originalCAS=JSON.parse(options.body), canonical=P.kanonisch(next), hash=P.hash(next);
        const request={schema:"helmut-local-unit-original-write/1",mode:record?"usage":"state",...selection,claimId:next[prefix+"journal"].claimId,
          originalCAS,ownBefore:{hash:before.hash,revision:before.revision},ownNext:{canonical,hash},
          artifact:record?{kind:"usage-D",logicalId:record.budgetTicketId,canonical:P.kanonisch(record),sha256:P.hash(record),parentHash:null}:null};
        const packet=T.prepare(request,c.qualification);
        // Execute EXACT compiler bytes: no replacement, injected SQL, marker or synthetic response.
        const result=await psql(packet.sql,label,negative);
        const proof={label,mode:request.mode,sqlSHA256:packet.sqlSHA256,requestSHA256:packet.requestSHA256,
          qualificationSHA256:packet.qualificationSHA256,captureIndex:result.row.index,originalCASReturnedByQualifiedSQLOrder:negative!==null};
        transactions.push(proof);
        if(negative){const error=Error("expected-native-receipt-rejection");rejected.add(error);throw error;}
        ack=T.acceptResult(packet,result.stdout);return ack.authAck;
      }});
      need(!negative && calls===1 && U.hasSnapshot(accepted) && ack,"genuine-accepted-write");
      const after=await ownRead();
      need(after.hash===P.hash(next) && after.revision===before.revision+(record?0:1) && P.kanonisch(after.body)===P.kanonisch(next),"actual-own-after-ack");
      return {ack,before,after};
    } catch(error){if(negative && rejected.delete(error)){need(calls===1,"negative-write-once");return {rejected:true,before};}throw error;}
  }
  const initial=await snapshot(), own=await ownRead();
  need(initial.databaseOID===JSON.parse(init.observation.proofCanonical).databaseOID
    && own.revision===0 && P.kanonisch(own.body)===P.kanonisch(init.initialState),"fresh-seeded-copy-only");
  let fixture=null;
  if(c.case==="late-old-mirror") {
    // Deliberate isolated COPY fixture: real Original CAS changes its mirror only.
    // Native own rows/triggers/roles/functions remain untouched and are compared.
    const auth=await authRead();auth[prefix+"journal"].reason="native-transaction-guard-mirror-fixture";let calls=0;
    await U.write(auth,{rowId:"main-auth",target,request:async(endpoint,options)=>{
      need(++calls===1 && endpoint==="/rest/v1/rpc/helmut_auth_state_cas_v1" && options.method==="POST","fixture-original-cas-only");
      const encoded=Buffer.from(options.body).toString("base64"), writer="helmut_ud_bridge_writer_"+c.operationId.slice(-32);
      const sql=`BEGIN; SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='500ms';
SET LOCAL helmut.local_usage_experiment='on'; SET LOCAL helmut.local_auth_state_cas_projection='on';
SET LOCAL helmut.local_diagnostic_scope='bounded-cas-qualification-v1';
SET SESSION AUTHORIZATION ${writer}; SELECT public.helmut_auth_state_cas_v1(convert_from(decode('${encoded}','base64'),'UTF8')::jsonb);
RESET SESSION AUTHORIZATION; COMMIT;`;
      return JSON.parse((await psql(sql,"MIRROR_FIXTURE")).stdout.toString("utf8"));
    }});
    const after=await snapshot();assertDelta(initial,after,["public.helmut_store","public.helmut_auth_state_nodes_local"]);
    need(calls===1 && after.ownHash===initial.ownHash && after.ownRevision===initial.ownRevision && JSON.stringify(after.usage)===JSON.stringify(initial.usage),"fixture-own-and-usage-unchanged");
    fixture={kind:"explicit-synthetic-original-mirror-divergence-in-owned-copy",before:initial,after};
  }
  const before=await snapshot(), next=structuredClone(own.body), claimId=crypto.randomUUID(), enteredAtUTC=new Date().toISOString();
  const claim=A.claim(next,selection,claimId,enteredAtUTC);
  const negative=c.case==="late-old-mirror"?"original-bridge-old-full-auth-mirror":c.case==="late-outside"?"original-bridge-outside-keyset-changed":null;
  await write("CLAIM_STATE",next,null,negative);
  let usageBefore=null,usageAfter=null;
  if(!negative){claimConfirmed=claim;guard();}
  if(c.case==="same-root-usage") {
    const bytes=readFile(c.requestPin.path,{pin:c.requestPin,privateFile:true,cap:16*1024*1024}).bytes;
    need(bytes.length===command.requestPins.D.bytes && sha(bytes)===command.requestPins.D.sha256,"genuine-D-request");
    const requestHash=command.slot.plan.intents[0].actualRequestHash,ticketId=crypto.randomUUID();
    const reserved=structuredClone((await ownRead()).body),ticket=A.reserve(reserved,selection,claimId,"D",ticketId,requestHash,new Date().toISOString(),null,bytes);
    await write("RESERVE_D",reserved);
    const sent=structuredClone((await ownRead()).body);A.send(sent,ticket,new Date().toISOString());await write("SEND_D",sent);
    usageBefore=await snapshot();
    const record={id:crypto.randomUUID(),createdAt:new Date().toISOString(),model:init.authority.requestModels.D,promptTokens:0,completionTokens:0,totalTokens:0,
      estimatedCost:0,success:true,...{scopeHash:c.commandHash,budgetTicketId:ticket.id,costIntentId:ticket.admission.intentId,costPlanHash:ticket.admission.planHash,
        costRequestHash:ticket.admission.actualRequestHash,costPhase:"D",runId:ticket.admission.runId,politicianId:command.units[0].subject,
        costBasis:"local-fixture-simulation-not-provider-charge"}};
    await write("SAME_ROOT_USAGE",sent,record);usageAfter=await snapshot();
    assertDelta(usageBefore,usageAfter,["public.helmut_store","public.llm_usage","helmut_unit_diagnostic.artifacts"]);
    need(JSON.stringify(usageBefore.root)===JSON.stringify(usageAfter.root) && usageBefore.ownHash===usageAfter.ownHash
      && usageBefore.ownRevision===usageAfter.ownRevision && usageAfter.usage.count===usageBefore.usage.count+1
      && usageAfter.usage.head!==usageBefore.usage.head,"same-root-usage-actual-delta");
  }
  const after=await snapshot();
  if(negative)need(JSON.stringify(before)===JSON.stringify(after),"negative-complete-logical-rollback");
  else {
    assertDelta(before,after,["public.helmut_store","public.helmut_auth_state_nodes_local","helmut_unit_diagnostic.state",
      ...(c.case==="same-root-usage"?["public.llm_usage","helmut_unit_diagnostic.artifacts"]:[])]);
    need(after.ownRevision===before.ownRevision+(c.case==="state"?1:3) && JSON.stringify(before.root)!==JSON.stringify(after.root),"positive-state-committed");
    if(c.case==="state")need(JSON.stringify(before.usage)===JSON.stringify(after.usage),"state-old-history-preserved");
  }
  guard();need(children.size===0,"all-psql-children-closed");
  const report={schema:"helmut-native-transaction-guard-report/1",pass:true,case:c.case,selection,configPin,initializationPin:c.seedInitializationPin,
    actualNodeBudget,process:self,fixture,before,after,usageBefore,usageAfter,captures,transactions,
    originalCompilerSQLUnchanged:true,realCompilerResultConsumer:negative===null,noAcknowledgementAccepted:negative!==null,
    negativeCompleteLogicalRollback:negative!==null,
    lateReceiptError:negative,scopeExecutionQualified:false,unit60Qualified:false,auth30Qualified:false,full500Qualified:false,
    nativeProviderCalls:0,actualEntryCalls:0,motorCalls:0,retryAllowed:false,reuseForbidden:true,
    elapsedNs:String(process.hrtime.bigint()-began),scope:"GENUINE_SQL_ATOMICITY_ONLY_NOT_SCOPE_OR_PERFORMANCE_ACCEPTANCE"};
  const reportPin=publish("TRANSACTION_GUARD_REPORT.PRIVATE.json",Buffer.from(JSON.stringify(report)));
  return {schema:"helmut-native-transaction-guard-published/1",pass:true,case:c.case,selection,configPin,reportPin};
}
module.exports=Object.freeze({start,CASES,errorMatches,confirmedClose,snapshotSQL,assertDelta});
if(require.main===module)start().then(result=>process.stdout.write(JSON.stringify(result)+"\n")).catch(error=>{
  process.exitCode=1;process.stderr.write(JSON.stringify({schema:"helmut-native-transaction-guard-failure/1",
    code:guardFailureCodes.get(error)||"unclassified",retryAllowed:false})+"\n");
});
