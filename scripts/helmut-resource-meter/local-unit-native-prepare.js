"use strict";

// Private SOURCE supervisor, preparation only. The only database statements
// this entry can submit are fixed read-only statements. No seed, admission
// installation, engine, model, HTTP transport or caller callback is exposed.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), v8 = require("node:v8");
const childProcess = require("node:child_process"), Module = require("node:module");
const ROOT = path.resolve(__dirname, "../.."), CONFIG = "/bench/PREPARE_CONFIG.PRIVATE.json", INPUT = "/bench/COMMAND_INPUT.PRIVATE.json";
const CLIENT = "/bench/client", CAP = 36 * 1024 * 1024, PIN_CAP = 256 * 1024 * 1024;
const READERS = ["helmut_auth_state_graph_read_v1", "helmut_auth_usage_read_v1"];
const CONTROL = ["synthetik500DispatchJournal", "synthetik500KostenAdmission", "testKostenAuftrag", "testKostenTage"];
const ORIGINAL_KEYS = ["packet", "install", "terminal", "preparedRequests", "actualRequestBindings", "providerFixtures"];
const ENTRY = Object.freeze({ source: "lib/helmut/local-unit-diagnostic-source.js", producer: "lib/helmut/local-unit-diagnostic-original-producer.js",
  command: "scripts/helmut-resource-meter/local-unit-native-command.js", usage: "lib/helmut/llm-usage-atomic.js", profile: "lib/helmut/synthetik-500-profile.js",
  storage: "lib/helmut/storage.js", ko: "lib/helmut/knowledge-object-version.js", inventory: "lib/helmut/synthetik-500-w-inventar.js" });
const ENV = new Set(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ", "SUPABASE_URL", "HELMUT_STORAGE_BACKEND", "HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE",
  "HELMUT_NATIVE_NODE_OLD_SPACE_MIB", "HELMUT_LLM_USAGE_STORAGE", "HELMUT_AUTH_STATE_STORAGE", "HELMUT_AUTH_HISTORY_READ_REUSE",
  "HELMUT_AUTH_GRAPH_READ_REUSE", "HELMUT_AUTH_SINGLE_WRITE_CAPTURE", "HELMUT_AUTH_CONTROL_READ", "HELMUT_PUBLICATION_ELIGIBILITY_JSON"]);
const exact = (x, keys) => x !== null && typeof x === "object" && !Array.isArray(x)
  && Reflect.ownKeys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const hash = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const utc = x => typeof x === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)
  && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
const need = (ok, code) => { if (!ok) throw Error("local-unit-native-prepare-" + code); };
const META = ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"];
let attempted = false, phase = "not-started";
function canonicalPath(name) {
  need(typeof name === "string" && path.isAbsolute(name) && path.normalize(name) === name && fs.realpathSync(name) === name, "canonical-path");
  let current = path.parse(name).root;
  for (const part of name.slice(current.length).split(path.sep)) { current = path.join(current, part); need(!fs.lstatSync(current).isSymbolicLink(), "symlink-component"); }
}
function pinShape(p, cap = PIN_CAP) {
  need(exact(p, ["path", "bytes", "sha256"]) && typeof p.path === "string" && path.isAbsolute(p.path)
    && path.normalize(p.path) === p.path && Number.isSafeInteger(p.bytes) && p.bytes > 0 && p.bytes <= cap && hash(p.sha256), "file-pin");
}
function readFile(name, { pin = null, privateFile = false, cap = 1048576, keep = true } = {}) {
  if (pin) { pinShape(pin, cap); need(pin.path === name, "pin-path"); }
  canonicalPath(name);
  const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const a = fs.fstatSync(fd, { bigint: true });
    need(a.isFile() && a.nlink === 1n && a.size > 0n && a.size <= BigInt(cap)
      && (!pin || a.size === BigInt(pin.bytes)) && (!privateFile || a.uid === 1000n && (a.mode & 0o7777n) === 0o600n), "file-metadata");
    const digest = crypto.createHash("sha256"), buffer = Buffer.alloc(Math.min(Number(a.size) + 1, 65536)), blocks = []; let total = 0;
    while (true) {
      const n = fs.readSync(fd, buffer, 0, Math.min(buffer.length, Number(a.size) - total + 1), null);
      if (!n) break; total += n; need(total <= Number(a.size), "file-grew"); digest.update(buffer.subarray(0, n));
      if (keep) blocks.push(Buffer.from(buffer.subarray(0, n)));
    }
    const b = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(name, { bigint: true }), hex = digest.digest("hex");
    need(total === Number(a.size) && META.every(k => a[k] === b[k] && b[k] === named[k])
      && fs.realpathSync(name) === name && (!pin || hex === pin.sha256), "file-drift");
    return { bytes: keep ? Buffer.concat(blocks) : null, pin: { path: name, bytes: total, sha256: hex } };
  } finally { fs.closeSync(fd); }
}
function jsonFile(name, options) {
  const { pretty = false, ...readOptions } = options || {};
  const result = readFile(name, readOptions), text = result.bytes.toString("utf8");
  need(Buffer.from(text).equals(result.bytes), "json-utf8");
  let value; try { value = JSON.parse(text); } catch { need(false, "json-invalid"); }
  let syntax = text;
  if (pretty) { syntax = ""; let quoted = false, escaped = false;
    for (const ch of text) { if (quoted || !/\s/.test(ch)) syntax += ch;
      if (quoted && escaped) escaped = false; else if (quoted && ch === "\\") escaped = true; else if (ch === '"') quoted = !quoted; }
  }
  need(JSON.stringify(value) === syntax, "json-unique"); return { value, pin: result.pin };
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
  const heapSizeLimitBytes = v8.getHeapStatistics().heap_size_limit;
  need(Number.isSafeInteger(heapSizeLimitBytes) && heapSizeLimitBytes > 0 && heapSizeLimitBytes <= 448 * 1024 * 1024, "actual-heap-limit");
  return { nodeVersion: process.version, execArgv: [...process.execArgv], oldSpaceMiB: 384, semiSpaceMiB: 16, heapSizeLimitBytes };
}
function checkConfig(c) {
  need(exact(c, ["schema", "nonce", "runId", "database", "issuedAtUTC", "expiresAtUTC", "selfPin", "nodePin", "psqlPin", "sourceCodePins", "readRPCPins",
    "postgres", "measuredCgroup", "libraryPath", "originalPins", "originalPublicationPolicyPin"])
    && c.schema === "helmut-local-unit-native-prepare/1" && typeof c.nonce === "string" && /^[a-f0-9]{32}$/.test(c.nonce)
    && typeof c.runId === "string" && /^nachlauf500-[0-9]{5,20}$/.test(c.runId) && c.database === "helmut_unit_diagnostic_" + c.nonce, "configuration");
  need(utc(c.issuedAtUTC) && utc(c.expiresAtUTC) && Date.parse(c.issuedAtUTC) <= Date.now() && Date.now() - Date.parse(c.issuedAtUTC) <= 10000
    && Date.parse(c.expiresAtUTC) > Date.now() && Date.parse(c.expiresAtUTC) - Date.parse(c.issuedAtUTC) <= 180000, "configuration-window");
  need(Object.keys(process.env).every(k => ENV.has(k)) && process.env.HELMUT_STORAGE_BACKEND === "supabase"
    && process.env.HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE === c.database && process.env.HELMUT_LLM_USAGE_STORAGE === "relational-atomic-v1"
    && process.env.HELMUT_AUTH_STATE_STORAGE === "merkle-auth-v1" && process.env.HELMUT_AUTH_CONTROL_READ === "verified-control-view-v1"
    && process.env.HELMUT_AUTH_HISTORY_READ_REUSE === "verified-history-reuse-v1"
    && (!process.env.HELMUT_AUTH_GRAPH_READ_REUSE || process.env.HELMUT_AUTH_GRAPH_READ_REUSE === "off")
    && (!process.env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE || process.env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE === "off"), "closed-environment");
  let origin; try { origin = new URL(process.env.SUPABASE_URL); } catch { need(false, "local-origin"); }
  need(origin.protocol === "http:" && !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/"
    && (/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(origin.hostname) || /^10\.\d+\.\d+\.\d+$/.test(origin.hostname)
      || /^192\.168\.\d+\.\d+$/.test(origin.hostname) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(origin.hostname)), "local-origin");
  for (const p of [c.selfPin, c.nodePin, c.psqlPin, c.originalPublicationPolicyPin]) pinShape(p);
  need(c.selfPin.path === __filename && c.nodePin.path === fs.realpathSync(process.execPath)
    && c.psqlPin.path === "/usr/lib/postgresql/17/bin/psql" && c.originalPublicationPolicyPin.bytes === 493, "fixed-files");
  need(exact(c.postgres, ["pid", "startTicks", "exePin"]) && c.postgres.exePin.path === "/usr/lib/postgresql/17/bin/postgres"
    && typeof c.postgres.startTicks === "string" && /^[0-9]+$/.test(c.postgres.startTicks), "postgres-pin"); pinShape(c.postgres.exePin);
  need(exact(c.measuredCgroup, ["path", "device", "inode", "procMembership"]) && c.measuredCgroup.path === "/owned-group"
    && Number.isSafeInteger(c.measuredCgroup.device) && Number.isSafeInteger(c.measuredCgroup.inode) && c.measuredCgroup.inode > 0
    && c.measuredCgroup.procMembership === "0::/\n", "cgroup-pin");
  need(typeof c.libraryPath === "string" && c.libraryPath.length <= 1024 && c.libraryPath.split(":").every(p =>
    /^\/(?:ram\/jit-root|jit-root\/tree|usr\/lib\/x86_64-linux-gnu)(?:\/[a-zA-Z0-9_.-]+)*$/.test(p)), "library-path");
  need(exact(c.originalPins, ORIGINAL_KEYS), "original-pins"); for (const p of Object.values(c.originalPins)) pinShape(p, 16 * 1024 * 1024);
  need(Array.isArray(c.sourceCodePins) && c.sourceCodePins.length >= Object.keys(ENTRY).length && c.sourceCodePins.length <= 4096, "source-code-pins");
  const names = new Set(); for (const p of c.sourceCodePins) {
    pinShape(p, 16 * 1024 * 1024); need(!names.has(p.path) && p.path.startsWith(ROOT + path.sep)
      && /\.(?:js|json)$/.test(p.path), "source-code-path"); names.add(p.path);
  }
  for (const relative of Object.values(ENTRY)) need(names.has(path.join(ROOT, relative)), "required-source-code");
  need(Array.isArray(c.readRPCPins) && c.readRPCPins.length === 2 && new Set(c.readRPCPins.map(p => p.name)).size === 2, "read-pins");
  for (const p of c.readRPCPins) need(exact(p, ["oid", "name", "identityArguments", "prosrcSHA256", "volatility", "returnType", "language", "config"])
    && typeof p.oid === "string" && /^[1-9][0-9]{0,9}$/.test(p.oid) && BigInt(p.oid) <= 4294967295n
    && READERS.some(n => p.name === "public." + n) && p.identityArguments === "jsonb" && hash(p.prosrcSHA256)
    && ["i", "s"].includes(p.volatility) && p.returnType === "jsonb" && ["sql", "plpgsql"].includes(p.language)
    && Array.isArray(p.config) && p.config.length === 1 && p.config[0] === "search_path=pg_catalog", "read-source-pin");
  return origin.origin + "|main-auth";
}
function sourceLoader(c) {
  const pins = new Map(c.sourceCodePins.map(p => [p.path, p])), original = Module._load;
  need(Object.keys(Module._cache).every(name => name === __filename), "fresh-module-cache");
  for (const p of pins.values()) readFile(p.path, { pin: p, cap: 16 * 1024 * 1024, keep: false });
  function pinnedLoad(request, parent, isMain) {
    if (!Module.isBuiltin(request)) {
      const name = Module._resolveFilename(request, parent, isMain), p = pins.get(name);
      need(p, "unqualified-source-import"); readFile(name, { pin: p, cap: 16 * 1024 * 1024, keep: false });
    }
    return Reflect.apply(original, this, arguments);
  }
  Module._load = pinnedLoad;
  return { check() { need(Module._load === pinnedLoad, "loader-drift"); for (const name of Object.keys(Module._cache)) need(name === __filename || pins.has(name), "cache-drift"); },
    close() { need(Module._load === pinnedLoad, "loader-drift"); Module._load = original; } };
}
function rpcSQL(c, endpoint, options) {
  const name = endpoint.startsWith("/rest/v1/rpc/") ? endpoint.slice(13) : null;
  need(READERS.includes(name) && exact(options, ["method", "body"]) && options.method === "POST" && typeof options.body === "string"
    && Buffer.byteLength(options.body) <= 65536, "closed-read-rpc");
  let args; try { args = JSON.parse(options.body); } catch { need(false, "read-json"); }
  need(args?.id === "main-auth" && JSON.stringify(args) === options.body && Object.keys(args).every(k => ["id", "knownProof", "readNonce", "knownGraph"].includes(k))
    && ["knownProof", "knownGraph"].every(k => !Object.hasOwn(args, k) || Object.hasOwn(args, "readNonce"))
    && (!Object.hasOwn(args, "readNonce") || typeof args.readNonce === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(args.readNonce)), "fixed-read-row");
  const p = c.readRPCPins.find(p => p.name === "public." + name), encoded = Buffer.from(options.body).toString("base64"); need(p, "missing-read-pin");
  return `DO $pin$ BEGIN IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
WHERE p.oid=${p.oid}::oid AND n.nspname='public' AND p.proname='${name}' AND NOT p.prosecdef AND oidvectortypes(p.proargtypes)='jsonb'
AND format_type(p.prorettype,null)='jsonb' AND p.provolatile='${p.volatility}' AND l.lanname='${p.language}'
AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='${p.prosrcSHA256}')
THEN RAISE EXCEPTION 'native-prepare-read-source-drift';END IF;END;$pin$;
SELECT public.${name}(convert_from(decode('${encoded}','base64'),'UTF8')::jsonb);`;
}
function psqlRead(c, statement, guard, children) {
  guard(); readFile(c.psqlPin.path, { pin: c.psqlPin, cap: PIN_CAP, keep: false });
  const sql = `BEGIN READ ONLY;SET LOCAL search_path=pg_catalog;SET LOCAL statement_timeout='28000ms';SET LOCAL lock_timeout='1000ms';SET LOCAL helmut.local_usage_experiment='on';
DO $target$ BEGIN IF current_database()<>'${c.database}' OR session_user<>'postgres' OR current_user<>session_user THEN RAISE EXCEPTION 'native-prepare-owned-target';END IF;END;$target$;
${statement}\nCOMMIT;`;
  const child = childProcess.spawn(c.psqlPin.path, ["-X", "-qAt", "-w", "-h", "/ram/socket", "-p", "5432", "-U", "postgres", "-d", c.database,
    "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=terse", "-f", "-"], { env: { PATH: "/usr/lib/postgresql/17/bin:/usr/bin:/bin", LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8", PGCLIENTENCODING: "UTF8", PGCONNECT_TIMEOUT: "3", LD_LIBRARY_PATH: c.libraryPath, HOME: "/ram", TMPDIR: "/ram" }, stdio: ["pipe", "pipe", "pipe"] });
  children.add(child);
  return new Promise((resolve, reject) => {
    const blocks = []; let total = 0, errors = 0, outEOF = false, errEOF = false, done = false, failed = false, killer;
    const deadline = setTimeout(abort, 28000), terminal = setTimeout(() => {
      if (done) return; done = true; child.kill("SIGKILL"); for (const stream of [child.stdin, child.stdout, child.stderr]) stream.destroy();
      clearTimeout(deadline); clearTimeout(killer); reject(Error("local-unit-native-prepare-read-close-unknown"));
    }, 34000);
    function abort() { if (done) return; failed = true; child.kill("SIGTERM"); killer ||= setTimeout(() => child.kill("SIGKILL"), 3000); }
    child.stdout.on("data", b => { if (done) return; total += b.length; if (total > CAP) abort(); else blocks.push(b); });
    child.stderr.on("data", b => { errors += b.length; if (errors > 131072) abort(); });
    child.stdout.once("end", () => { outEOF = true; }); child.stderr.once("end", () => { errEOF = true; });
    for (const stream of [child.stdin, child.stdout, child.stderr]) stream.once("error", abort); child.once("error", abort);
    child.once("close", (code, signal) => {
      children.delete(child); clearTimeout(deadline); clearTimeout(terminal); clearTimeout(killer); if (done) return; done = true;
      try { guard(); need(!failed && code === 0 && !signal && outEOF && errEOF, "read-close-unknown");
        const bytes = Buffer.concat(blocks), text = bytes.toString("utf8"); need(Buffer.from(text).equals(bytes), "read-utf8"); resolve(JSON.parse(text));
      } catch { reject(Error("local-unit-native-prepare-read-not-confirmed")); }
    });
    child.stdin.end(sql);
  });
}
function idsSQL(ids) {
  need(Array.isArray(ids) && ids.length <= 4000 && new Set(ids).size === ids.length && ids.every(id => typeof id === "string" && id.length > 0 && id.length <= 200), "source-ids");
  return `SELECT jsonb_array_elements_text(convert_from(decode('${Buffer.from(JSON.stringify(ids)).toString("base64")}','base64'),'UTF8')::jsonb)`;
}
async function nativeSelection(c, selected, modules, guard, children) {
  const { storage, profile: P, ko: KO, inventory } = modules, owner = selected.draft.profile.id;
  need(typeof storage.fromMandateProfileRow === "function" && Array.isArray(KO.VERSION_FIELDS) && Array.isArray(inventory.SOURCE_VERSION_FIELDS), "pure-native-normalizers");
  const ownerQuery = idsSQL([owner]);
  const rows = await psqlRead(c, `SELECT coalesce(jsonb_agg(jsonb_build_object('profile',to_jsonb(p),'mandate',to_jsonb(m))),'[]'::jsonb)
FROM public.profiles p JOIN public.mandate_profiles m ON m.user_id=p.id WHERE p.id IN(${ownerQuery});`, guard, children);
  need(Array.isArray(rows) && rows.length === 1 && rows[0].profile?.id === owner && rows[0].mandate?.user_id === owner, "actual-native-profile");
  const actualProfile = storage.fromMandateProfileRow(rows[0].profile, rows[0].mandate);
  need(P.hash(actualProfile) === P.hash(selected.draft.profile), "native-profile-drift");
  const aliases = Object.freeze({ quellenauszug_beleg: "helmutQuellenkontext", dip_quellfelder: "helmutDipQuellfelder",
    bundestag_artikelstand: "helmutBundestagArtikelstand", berlin_artikelstand: "helmutBerlinArtikelstand",
    brandenburg_artikelstand: "helmutBrandenburgLandtagPresseArtikelstand" });
  const actualSources = {};
  for (const [key, table, fields] of [["documents", "raw_documents", inventory.SOURCE_VERSION_FIELDS], ["knowledgeObjects", "knowledge_objects", KO.VERSION_FIELDS]]) {
    need(fields.length > 0 && fields.length <= 80 && fields.every(k => typeof k === "string" && /^[a-z][a-z0-9_]*$/.test(k)), "native-projection-fields");
    const expression = fields.map(k => {
      const value = table === "raw_documents" && Object.hasOwn(aliases, k) ? `t.raw->'${aliases[k]}'`
        : table === "raw_documents" && ["bundestag_abgerufen_at", "berlin_abgerufen_at", "brandenburg_abgerufen_at"].includes(k) ? "to_jsonb(t.retrieved_at)" : `to_jsonb(t.${k})`;
      return `'${k}',${value}`;
    }).join(",");
    const expected = selected.draft.sources[key], ids = expected.map(row => row.id);
    const actual = await psqlRead(c, `SELECT coalesce(jsonb_agg(jsonb_build_object(${expression}) ORDER BY t.id COLLATE "C"),'[]'::jsonb)
FROM public.${table} t WHERE t.id IN(${idsSQL(ids)});`, guard, children);
    need(Array.isArray(actual) && actual.length === ids.length && new Set(actual.map(row => row?.id)).size === ids.length
      && actual.every(row => ids.includes(row.id)), "native-source-cardinality");
    if (key === "knowledgeObjects") for (const row of actual) KO.pruefe(row);
    const order = rows => [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    need(P.hash(order(actual)) === P.hash(order(expected)), "native-source-drift"); actualSources[key] = actual;
  }
  // Preserve historical ordering after proving actual native row equality.
  for (const key of Object.keys(actualSources)) {
    const byId = new Map(actualSources[key].map(row => [row.id, row])); actualSources[key] = selected.draft.sources[key].map(row => byId.get(row.id));
  }
  return { selectedProfileHash: P.hash(actualProfile), selectedSourcesHash: P.hash(actualSources) };
}
function clientDirectory() {
  canonicalPath(CLIENT); const s = fs.lstatSync(CLIENT, { bigint: true });
  need(s.isDirectory() && s.uid === 1000n && (s.mode & 0o022n) === 0n, "private-client-directory"); return s;
}
function writeClient(c, name, bytes) {
  need(/^(?:[DR]_(?:REQUEST|RESPONSE|LATENCY)|PREPARED_COMMAND)\.PRIVATE\.json$/.test(name)
    && Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 16 * 1024 * 1024, "closed-output");
  const directory = clientDirectory(), filename = path.join(CLIENT, name);
  const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
  try {
    const a = fs.fstatSync(fd, { bigint: true }); need(a.isFile() && a.nlink === 1n && a.uid === 1000n && (a.mode & 0o7777n) === 0o600n && a.size === 0n, "output-metadata");
    let written = 0; while (written < bytes.length) { const n = fs.writeSync(fd, bytes, written, bytes.length - written, null); need(n > 0, "output-short-write"); written += n; }
    fs.fsyncSync(fd); const b = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(filename, { bigint: true }), after = clientDirectory();
    need(b.size === BigInt(bytes.length) && ["dev", "ino", "mode", "uid", "gid", "nlink"].every(k => a[k] === b[k])
      && META.every(k => b[k] === named[k]) && directory.dev === after.dev && directory.ino === after.ino, "output-drift");
  } finally { fs.closeSync(fd); }
  const pin = { path: filename, bytes: bytes.length, sha256: sha(bytes) }; readFile(filename, { pin, privateFile: true, cap: 16 * 1024 * 1024, keep: false });
  return { ...pin, path: "/workspace/helmut-unit-diagnostic-native/" + c.nonce + "/" + name };
}
async function waitCommand(guard) {
  const started = process.hrtime.bigint();
  while (true) {
    guard(); need(process.hrtime.bigint() - started < 15000000000n, "command-input-deadline");
    try { fs.lstatSync(INPUT); return jsonFile(INPUT, { privateFile: true, cap: 8 * 1024 * 1024 }); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
function commandInput(c, value) {
  need(exact(value, ["schema", "nowUTC", "window", "target", "gatePins", "codeCommit", "runtimeManifestPin", "authPin", "freshGrantId"])
    && value.schema === "helmut-local-unit-native-command-input/1" && utc(value.nowUTC) && Math.abs(Date.now() - Date.parse(value.nowUTC)) <= 3000
    && value.target?.database === c.database, "fresh-command-input");
  return { ...value, nonce: c.nonce, runId: c.runId };
}
function sourceGate(c, input, originalControlHash) {
  const p = input.gatePins?.source; pinShape(p, 16 * 1024 * 1024);
  const logical = "/workspace/helmut-unit-diagnostic-native/" + c.nonce + "/";
  need(p.path.startsWith(logical) && !p.path.slice(logical.length).includes("/"), "source-gate-path");
  const physical = path.join(CLIENT, p.path.slice(logical.length));
  const value = jsonFile(physical, { pin: { ...p, path: physical }, cap: 16 * 1024 * 1024, pretty: true }).value;
  need(value.schema === "helmut-local-unit-native-source-gate/1" && value.originalControlHash === originalControlHash, "source-control-gate");
}
async function start() {
  need(!attempted && arguments.length === 0, "once-only"); attempted = true;
  phase = "configuration";
  need(process.argv.length === 3 && process.argv[2] === "--prepare-own-native-copy" && require.main?.filename === __filename, "explicit-cli");
  process.umask(0o077);
  const actualNodeBudget = nodeBudget(), { value: c, pin: configPin } = jsonFile(CONFIG, { privateFile: true }), target = checkConfig(c);
  need(!fs.existsSync(INPUT), "new-command-input-required"); clientDirectory();
  const self = processIdentity(process.pid), began = process.hrtime.bigint(), children = new Set();
  need(self.exe === c.nodePin.path && self.membership === c.measuredCgroup.procMembership, "self-binding");
  for (const p of [c.selfPin, c.nodePin, c.psqlPin, c.postgres.exePin]) readFile(p.path, { pin: p, cap: PIN_CAP, keep: false });
  const policy = readFile(c.originalPublicationPolicyPin.path, { pin: c.originalPublicationPolicyPin, cap: 493 }).bytes;
  need(Buffer.from(policy.toString("utf8")).equals(policy) && (!process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON
    || process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON === policy.toString("utf8")), "original-policy-bytes");
  process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON = policy.toString("utf8");
  const loader = sourceLoader(c);
  const guard = () => {
    loader.check(); need(JSON.stringify(processIdentity(process.pid)) === JSON.stringify(self), "self-drift");
    const pg = processIdentity(c.postgres.pid), group = fs.statSync(c.measuredCgroup.path);
    need(pg.startTicks === c.postgres.startTicks && pg.exe === c.postgres.exePin.path && pg.membership === self.membership
      && group.dev === c.measuredCgroup.device && group.ino === c.measuredCgroup.inode
      && Date.now() < Date.parse(c.expiresAtUTC) && process.hrtime.bigint() - began < 180000000000n
      && process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON === policy.toString("utf8"), "native-source-drift");
    readFile(CONFIG, { pin: configPin, privateFile: true, keep: false });
  };
  try {
    phase = "source-derivation";
    const modules = Object.fromEntries(Object.entries(ENTRY).map(([key, name]) => [key, require(path.join(ROOT, name))])); guard();
    const original = Object.fromEntries(Object.entries(c.originalPins).map(([key, pin]) => [key, readFile(pin.path, { pin, cap: 16 * 1024 * 1024 }).bytes]));
    const sourceHandle = modules.source.extractPinnedSource({ packetBytes: original.packet, packetPath: c.originalPins.packet.path,
      installPinsBytes: original.install, installPin: c.originalPins.install, terminalBytes: original.terminal, diagnosticNonce: c.nonce, preparedAtUTC: new Date().toISOString() });
    const producerResult = modules.producer.derive({ sourceHandle, preparedBytes: original.preparedRequests, bindingBytes: original.actualRequestBindings, fixtureBytes: original.providerFixtures });
    const selected = modules.source.readSelection(sourceHandle), sourceBinding = modules.source.sourceBinding(sourceHandle), P = modules.profile;
    need(selected.sourceIndex === 499 && selected.diagnosticUnit === 0 && producerResult.sourceIndex === 499 && producerResult.diagnosticUnit === 0, "selected-source-unit");
    need(modules.usage.enabled() === true && modules.usage.controlReadEnabled() === true, "genuine-control-mode"); let reads = 0;
    const control = await modules.usage.readControl({ rowId: "main-auth", target, request: (endpoint, options) => {
      need(++reads <= 3, "control-read-count"); return psqlRead(c, rpcSQL(c, endpoint, options), guard, children);
    } });
    guard(); need(reads > 0 && exact(control, [...CONTROL, "_authStoreRevision"]), "genuine-control-projection");
    const originalControlHash = P.hash(Object.fromEntries(CONTROL.map(k => [k, control[k]])));
    phase = "native-source-read";
    const selectedHashes = await nativeSelection(c, selected, modules, guard, children); guard();
    const derivedPins = {};
    for (const phase of ["D", "R"]) {
      const value = producerResult.phases?.[phase]; need(exact(value, ["requestBytes", "responseBytes", "latencyBytes", "responseStatus", "latencyMs"]), "producer-phase");
      derivedPins[phase] = Object.fromEntries(["request", "response", "latency"].map(kind => [kind, writeClient(c, phase + "_" + kind.toUpperCase() + ".PRIVATE.json", value[kind + "Bytes"])]));
    }
    guard(); const ready = { schema: "helmut-local-unit-native-prepare-ready/1", nonce: c.nonce, runId: c.runId, database: c.database, process: self,
      configPin, derivedPins, sourceProofHash: P.hash(sourceBinding), producerProofHash: P.hash(producerResult.proof), selectionHash: sourceBinding.selectionSHA256,
      ...selectedHashes, originalControlHash, actualNodeBudget, configuredReadRole: "postgres", originallyUnprivileged: false,
      prepared: true, authorityInstalled: false, nativeBridgeQualified: false, unitExecutionQualified: false, full500Qualified: false };
    phase = "command-input-wait"; process.stdout.write(JSON.stringify(ready) + "\n");
    const input = await waitCommand(guard); guard();
    for (const p of [c.selfPin, c.nodePin, c.psqlPin, c.postgres.exePin, ...c.sourceCodePins, ...Object.values(c.originalPins), c.originalPublicationPolicyPin])
      readFile(p.path, { pin: p, cap: PIN_CAP, keep: false });
    phase = "command-build";
    const { schema, ...args } = commandInput(c, input.value); sourceGate(c, input.value, originalControlHash);
    const built = modules.command.build({ ...args, sourceHandle, producerResult }); guard();
    need(built?.selection?.operationId === "localUnitDiagnostic-" + c.nonce && built.command?.target?.database === c.database
      && P.hash(built.command) === built.selection.commandHash && P.hash(built.sourceBinding) === ready.sourceProofHash
      && Buffer.byteLength(P.kanonisch(built.initialState)) <= 4 * 1024 * 1024, "prepared-command-binding");
    readFile(INPUT, { pin: input.pin, privateFile: true, cap: 8 * 1024 * 1024, keep: false });
    writeClient(c, "PREPARED_COMMAND.PRIVATE.json", Buffer.from(JSON.stringify(built))); guard();
    need(children.size === 0, "children-exit-open");
    phase = "command-prepared";
    return { schema: "helmut-local-unit-native-prepare-result/1", phase, prepared: true, authorityInstalled: false, unitExecutionQualified: false };
  } finally {
    for (const child of children) child.kill("SIGKILL"); loader.close();
  }
}
module.exports = Object.freeze({ start });
if (require.main === module) start().catch(() => {
  process.exitCode = 1; process.stderr.write(JSON.stringify({ schema: "helmut-local-unit-native-prepare-failure/1", phase,
    state: "preparation-not-confirmed", authorityInstalled: false, retryAllowed: false }) + "\n");
});
