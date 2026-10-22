"use strict";

// Private SourceSupervisor entry for one new COPY namespace. No caller SQL,
// transport, authority producer, provider, store callback or retry is exposed.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), net = require("node:net"), v8 = require("node:v8");
const childProcess = require("node:child_process");
const CONFIG = "/bench/ORIGINAL_SEED_CONFIG.PRIVATE.json", SERVICE = "/bench/ORIGINAL_SERVICE_CONFIG.PRIVATE.json";
const INITIALIZATION = "/bench/ORIGINAL_SEED_INITIALIZATION.PRIVATE.json", SOCKET = "/ram/helmut-original-write-bridge.sock";
const ROOT = path.resolve(__dirname, "../.."), CAP = 36 * 1024 * 1024, FRAME_CAP = 50 * 1024 * 1024, OWN_CAP = 4 * 1024 * 1024;
const CODE = Object.freeze({ llmUsageAtomic: "llm-usage-atomic", authStateParts: "auth-state-parts", authStoreCas: "auth-store-cas",
  euServiceContract: "synthetik-500-eu-service-contract", profile: "synthetik-500-profile", streamingCanonicalHash: "streaming-canonical-hash",
  canonicalContentFacts: "canonical-content-facts", cpuEpoch: "synthetik-500-cpu-epoch", canonicalShaByteWriter: "canonical-sha-byte-writer" });
const READERS = Object.freeze(["helmut_auth_state_graph_read_v1", "helmut_auth_usage_read_v1"]);
const CAS_KEYS = ["id", "expectedRevision", "expectedProof", "expectedState", "revision", "root", "nodes", "additions"];
const ENV = new Set(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ", "SUPABASE_URL", "HELMUT_STORAGE_BACKEND", "HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE",
  "HELMUT_NATIVE_NODE_OLD_SPACE_MIB", "HELMUT_LLM_USAGE_STORAGE", "HELMUT_AUTH_STATE_STORAGE", "HELMUT_AUTH_HISTORY_READ_REUSE",
  "HELMUT_AUTH_GRAPH_READ_REUSE", "HELMUT_AUTH_SINGLE_WRITE_CAPTURE", "HELMUT_AUTH_CONTROL_READ"]);
let attempted = false;
const need = (ok, code) => { if (!ok) throw Error("local-unit-original-seed-" + code); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
const utc = value => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const fields = ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"];
function canonicalPath(name) {
  need(typeof name === "string" && path.isAbsolute(name) && path.normalize(name) === name && fs.realpathSync(name) === name, "canonical-file");
  let current = path.parse(name).root;
  for (const part of name.slice(current.length).split(path.sep)) { current = path.join(current, part); need(!fs.lstatSync(current).isSymbolicLink(), "symlink-component"); }
}
function readFile(name, { pin = null, privateFile = false, cap = 1048576, keep = true } = {}) {
  canonicalPath(name);
  if (pin) need(exact(pin, ["path", "bytes", "sha256"]) && pin.path === name && Number.isSafeInteger(pin.bytes)
    && pin.bytes > 0 && pin.bytes <= cap && hash(pin.sha256), "file-pin");
  const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const a = fs.fstatSync(fd, { bigint: true });
    need(a.isFile() && a.nlink === 1n && a.size > 0n && a.size <= BigInt(cap)
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
  return { pid, startTicks: values[19], exe: fs.readlinkSync(`/proc/${pid}/exe`), membership: fs.readFileSync(`/proc/${pid}/cgroup`, "utf8") };
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
  need(exact(c, ["schema", "operationId", "commandHash", "database", "selfPin", "nodePin", "originalServiceConfigPin", "seedInitializationPin",
    "codePins", "readRPCPins", "psqlPin", "libraryPath", "measuredCgroup", "postgres"])
    && c.schema === "helmut-local-unit-original-seed/1" && typeof c.operationId === "string" && /^localUnitDiagnostic-[a-f0-9]{32}$/.test(c.operationId)
    && hash(c.commandHash) && c.database === "helmut_unit_diagnostic_" + c.operationId.slice(-32), "configuration");
  need(Object.keys(process.env).every(key => ENV.has(key)) && process.env.HELMUT_STORAGE_BACKEND === "supabase"
    && process.env.HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE === c.database && process.env.HELMUT_LLM_USAGE_STORAGE === "relational-atomic-v1"
    && process.env.HELMUT_AUTH_STATE_STORAGE === "merkle-auth-v1", "closed-environment");
  let origin; try { origin = new URL(process.env.SUPABASE_URL); } catch { need(false, "target-origin"); }
  need(origin.protocol === "http:" && !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/"
    && (/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(origin.hostname) || /^10\.\d+\.\d+\.\d+$/.test(origin.hostname)
      || /^192\.168\.\d+\.\d+$/.test(origin.hostname) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(origin.hostname)), "target-origin");
  need(c.selfPin.path === __filename && c.nodePin.path === fs.realpathSync(process.execPath) && c.originalServiceConfigPin.path === SERVICE
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
function psqlRead(c, sql, guard) {
  guard(); readFile(c.psqlPin.path, { pin: c.psqlPin, cap: 256 * 1024 * 1024, keep: false });
  const child = childProcess.spawn(c.psqlPin.path, ["-X", "-qAt", "-w", "-h", "/ram/socket", "-p", "5432", "-U", "postgres", "-d", c.database,
    "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=terse", "-f", "-"], { env: { PATH: "/usr/lib/postgresql/17/bin:/usr/bin:/bin", LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8", PGCLIENTENCODING: "UTF8", PGCONNECT_TIMEOUT: "3", LD_LIBRARY_PATH: c.libraryPath, HOME: "/ram", TMPDIR: "/ram" }, stdio: ["pipe", "pipe", "pipe"] });
  return new Promise((resolve, reject) => {
    const blocks = []; let size = 0, errorSize = 0, outEOF = false, errEOF = false, failure = false, done = false, killer;
    const deadline = setTimeout(() => abort(), 28000), terminal = setTimeout(() => {
      if (done) return; done = true; child.kill("SIGKILL"); child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
      clearTimeout(deadline); clearTimeout(killer); reject(Error("local-unit-original-seed-read-close-unknown"));
    }, 34000);
    function abort() { if (done) return; failure = true; child.kill("SIGTERM"); killer ||= setTimeout(() => child.kill("SIGKILL"), 3000); }
    child.stdout.on("data", bytes => { if (done) return; size += bytes.length; if (size > CAP) abort(); else blocks.push(bytes); });
    child.stderr.on("data", bytes => { errorSize += bytes.length; if (errorSize > 131072) abort(); });
    child.stdout.once("end", () => { outEOF = true; }); child.stderr.once("end", () => { errEOF = true; });
    for (const stream of [child.stdin, child.stdout, child.stderr]) stream.once("error", abort); child.once("error", abort);
    child.once("close", (code, signal) => {
      clearTimeout(deadline); clearTimeout(terminal); clearTimeout(killer); if (done) return; done = true;
      try {
        guard(); need(!failure && code === 0 && !signal && outEOF && errEOF, "read-close-unknown");
        const bytes = Buffer.concat(blocks), text = bytes.toString("utf8"); need(Buffer.from(text).equals(bytes), "read-utf8"); resolve(JSON.parse(text));
      } catch { reject(Error("local-unit-original-seed-read-not-confirmed")); }
    });
    child.stdin.end(sql);
  });
}
function ownerWrite(c, key, request, guard) {
  guard(); canonicalPath(SOCKET); const socketStat = fs.lstatSync(SOCKET, { bigint: true });
  need(socketStat.isSocket() && socketStat.uid === 1000n && (socketStat.mode & 0o7777n) === 0o666n, "private-owner-socket");
  const body = Buffer.from(JSON.stringify(request)); need(body.length <= CAP, "owner-request-cap");
  const nonce = crypto.randomBytes(32).toString("hex"), unsigned = { version: "helmut-local-original-owner-request/1", nonce,
    atUTC: new Date().toISOString(), bodyBase64: body.toString("base64") };
  const mac = object => crypto.createHmac("sha256", key).update(JSON.stringify(object)).digest("hex");
  const bytes = Buffer.from(JSON.stringify({ ...unsigned, hmacSHA256: mac(unsigned) }) + "\n"); need(bytes.length <= FRAME_CAP + 1, "owner-frame-cap");
  return new Promise((resolve, reject) => {
    const blocks = []; let total = 0, eof = false, done = false;
    const socket = net.createConnection({ path: SOCKET });
    const timer = setTimeout(() => fail(), 30000);
    function fail() { if (done) return; done = true; clearTimeout(timer); socket.destroy(); reject(Error("local-unit-original-seed-owner-outcome-unknown")); }
    socket.once("connect", () => { try { guard(); socket.end(bytes); } catch { fail(); } });
    socket.on("data", block => { total += block.length; if (total > FRAME_CAP + 1) fail(); else blocks.push(block); });
    socket.once("end", () => { eof = true; }); socket.once("error", fail);
    socket.once("close", hadError => {
      if (done) return; done = true; clearTimeout(timer);
      try {
        guard(); need(!hadError && eof, "owner-eof-unknown"); const raw = Buffer.concat(blocks);
        need(raw.at(-1) === 10 && raw.indexOf(10) === raw.length - 1 && Buffer.from(raw.toString("utf8")).equals(raw), "owner-response-line");
        const text = raw.subarray(0, -1).toString("utf8"), response = JSON.parse(text);
        need(exact(response, ["schema", "nonce", "status", "bodyBase64", "hmacSHA256"]) && response.schema === "helmut-local-original-owner-response/1"
          && response.nonce === nonce && response.status === 200 && typeof response.bodyBase64 === "string" && hash(response.hmacSHA256)
          && JSON.stringify(response) === text, "owner-response-binding");
        const typed = { schema: response.schema, nonce: response.nonce, status: response.status, bodyBase64: response.bodyBase64 };
        need(crypto.timingSafeEqual(Buffer.from(response.hmacSHA256, "hex"), Buffer.from(mac(typed), "hex")), "owner-response-mac");
        const result = Buffer.from(response.bodyBase64, "base64");
        need(result.length <= 1048576 && result.toString("base64") === response.bodyBase64 && Buffer.from(result.toString("utf8")).equals(result), "owner-response-bytes");
        const resultText = result.toString("utf8"), value = JSON.parse(resultText);
        need(JSON.stringify(value) === resultText && exact(value, ["schema", "authAck", "ownAck"])
          && value.schema === "helmut-local-unit-original-write-result/1", "owner-result"); resolve(value);
      } catch { reject(Error("local-unit-original-seed-owner-response-unknown")); }
    });
  });
}
async function start() {
  need(!attempted && arguments.length === 0, "once-only"); attempted = true;
  need(process.argv.length === 3 && process.argv[2] === "--seed-own-native-copy", "explicit-cli");
  const actualNodeBudget = nodeBudget(), { value: c, pin: configPin } = jsonFile(CONFIG, { privateFile: true }), target = checkConfig(c);
  const self = processIdentity(process.pid);
  need(self.exe === c.nodePin.path && self.membership === c.measuredCgroup.procMembership, "self-binding");
  for (const p of [c.selfPin, c.nodePin, c.psqlPin, c.postgres.exePin, ...Object.values(c.codePins)]) readFile(p.path, { pin: p, cap: 256 * 1024 * 1024, keep: false });
  const service = jsonFile(SERVICE, { pin: c.originalServiceConfigPin, privateFile: true }).value;
  need(service.operationId === c.operationId && service.commandHash === c.commandHash && service.database === c.database
    && typeof service.secretHex === "string" && hash(service.secretHex) && utc(service.issuedAtUTC) && utc(service.expiresAtUTC)
    && Date.now() >= Date.parse(service.issuedAtUTC) && Date.now() < Date.parse(service.expiresAtUTC)
    && Date.parse(service.expiresAtUTC) - Date.parse(service.issuedAtUTC) <= 180000, "service-scope");
  need(JSON.stringify(service.postgres) === JSON.stringify(c.postgres) && JSON.stringify(service.measuredCgroup) === JSON.stringify(c.measuredCgroup)
    && JSON.stringify(service.psqlPin) === JSON.stringify(c.psqlPin) && service.libraryPath === c.libraryPath, "same-owner-processes");
  const key = Buffer.from(service.secretHex, "hex"); need(key.length === 32, "owner-key");
  const init = jsonFile(INITIALIZATION, { pin: c.seedInitializationPin, privateFile: true, cap: 8 * 1024 * 1024 }).value;
  need(exact(init, ["schema", "initialState", "authority", "observation"]) && init.schema === "helmut-local-unit-original-seed-initialization/1", "initialization");
  const U = require(c.codePins.llmUsageAtomic.path), P = require(c.codePins.profile.path), Parts = require(c.codePins.authStateParts.path);
  need(U.enabled() === true && Parts.enabled() === true, "genuine-parts-mode");
  const prefix = "localUnitDiagnostic:" + c.operationId.slice(-32) + ":", grantKey = "localUnitDiagnosticConsumedGrantsV1";
  const ownKeys = [grantKey, ...["journal", "costs", "reservation", "sendClaim", "review", "result"].map(name => prefix + name)];
  need(exact(init.initialState, ownKeys), "initial-seven");
  const canonical = P.kanonisch(init.initialState), ownHash = sha(canonical), a = init.authority, o = init.observation;
  need(Buffer.byteLength(canonical) <= OWN_CAP && P.hash(init.initialState) === ownHash
    && exact(a, ["grantId", "commandCanonical", "admissionCanonical", "admissionHash", "sourceHash", "targetHash", "postrunHash", "sourceProofHash",
      "codeManifestPin", "runtimeManifestPin", "gateHashes", "verifierCodeHash", "requestModels", "verifiedAtUTC", "expiresAtUTC"])
    && exact(o, ["proofCanonical", "proofHash", "observedAtUTC"]) && hash(a.grantId) && sha(a.commandCanonical) === c.commandHash
    && sha(a.admissionCanonical) === a.admissionHash && sha(o.proofCanonical) === o.proofHash, "initial-source-binding");
  const record = init.initialState[prefix + "reservation"], journal = init.initialState[prefix + "journal"], costs = init.initialState[prefix + "costs"];
  need(P.kanonisch(record.command) === a.commandCanonical && P.kanonisch(record.admission) === a.admissionCanonical
    && record.operationId === c.operationId && record.commandHash === c.commandHash && record.command.mode === "D-R-1-local-fixture"
    && record.command.target.database === c.database && record.command.limits.units === 1 && record.command.limits.production === false
    && record.command.limits.paidProviderCallsAllowed === false && record.admission.grantId === a.grantId
    && exact(init.initialState[grantKey], [a.grantId]) && journal.state === "installed" && journal.claimId === null && journal.index === 0
    && journal.inFlight === null && exact(journal.attempts, []) && journal.stopRequested === false && costs.spent === 0
    && exact(costs.calls, []) && exact(init.initialState[prefix + "sendClaim"], []) && exact(init.initialState[prefix + "review"], [])
    && P.kanonisch(init.initialState[prefix + "result"]) === P.kanonisch({ state: "pending", evidenceHash: null, positions: [] }), "fresh-installed-state");
  const guard = () => {
    need(JSON.stringify(processIdentity(process.pid)) === JSON.stringify(self), "self-drift");
    const pg = processIdentity(c.postgres.pid), group = fs.statSync(c.measuredCgroup.path);
    need(pg.startTicks === c.postgres.startTicks && pg.exe === c.postgres.exePin.path && pg.membership === self.membership
      && group.dev === c.measuredCgroup.device && group.ino === c.measuredCgroup.inode && Date.now() < Date.parse(service.expiresAtUTC), "native-owner-drift");
    readFile(CONFIG, { pin: configPin, privateFile: true, keep: false });
    readFile(SERVICE, { pin: c.originalServiceConfigPin, privateFile: true, keep: false });
    readFile(INITIALIZATION, { pin: c.seedInitializationPin, privateFile: true, cap: 8 * 1024 * 1024, keep: false });
  };
  guard(); let reads = 0;
  const auth = await U.read({ rowId: "main-auth", target, request: (endpoint, options) => {
    need(++reads <= 3, "read-count"); return psqlRead(c, readonlySQL(c, endpoint, options), guard);
  } });
  guard(); need(reads > 0 && U.hasSnapshot(auth) && Array.isArray(auth.llmUsage) && ownKeys.every(name => !Object.hasOwn(auth, name)), "fresh-original-snapshot");
  const history = auth.llmUsage;
  for (const name of ownKeys) auth[name] = init.initialState[name]; // Keep the genuine snapshot and every old history object.
  let writes = 0, ownAck = null;
  const accepted = await U.write(auth, { rowId: "main-auth", target, request: async (endpoint, options) => {
    guard(); need(++writes === 1 && endpoint === "/rest/v1/rpc/helmut_auth_state_cas_v1" && exact(options, ["method", "body"])
      && options.method === "POST" && typeof options.body === "string", "genuine-write-abi");
    const cas = JSON.parse(options.body);
    need(exact(cas, CAS_KEYS) && JSON.stringify(cas) === options.body && cas.id === "main-auth" && Array.isArray(cas.additions)
      && cas.additions.length === 0 && auth.llmUsage === history, "genuine-eight-cas");
    const response = await ownerWrite(c, key, { schema: "helmut-local-unit-original-write/1", mode: "seed", operationId: c.operationId,
      commandHash: c.commandHash, claimId: null, originalCAS: cas, ownBefore: null, ownNext: { canonical, hash: ownHash }, artifact: null,
      privateOwnerInitialization: { authority: a, observation: o } }, guard);
    ownAck = response.ownAck; return response.authAck; // Genuine service ACK only; never fabricate one to extract a CAS body.
  } });
  guard(); need(writes === 1 && U.hasSnapshot(accepted) && accepted.llmUsage.length === history.length
    && history.every((record, index) => accepted.llmUsage[index] === record)
    && P.kanonisch(Object.fromEntries(ownKeys.map(name => [name, accepted[name]]))) === canonical, "original-seed-write-unconfirmed");
  need(exact(ownAck, ["version", "scopeHash", "operationId", "revision", "hash", "nonce"])
    && ownAck.version === "helmut-local-unit-diagnostic-seed-ack/1" && ownAck.scopeHash === c.commandHash && ownAck.operationId === c.operationId
    && ownAck.revision === 0 && ownAck.hash === ownHash && hash(ownAck.nonce), "native-seed-unknown");
  return { schema: "helmut-local-unit-original-seed-result/1", nativeSeed: true, operationId: c.operationId, commandHash: c.commandHash,
    ownHash, revision: 0, configPin, serviceConfigPin: c.originalServiceConfigPin, initializationPin: c.seedInitializationPin, actualNodeBudget,
    originalWrites: 1, oldHistoryPreserved: true, claimConsumed: false, unitExecutionQualified: false, full500Qualified: false };
}
module.exports = Object.freeze({ start });
if (require.main === module) start().then(result => { process.stdout.write(JSON.stringify(result) + "\n"); }).catch(() => {
  process.exitCode = 1; process.stderr.write('{"schema":"helmut-local-unit-original-seed-failure/1","state":"terminal-unknown","nativeSeed":false,"retryAllowed":false}\n');
});
