"use strict";
// Local PostgreSQL17.6 only. This fixture has no Supabase connection or secrets.
// Its pins are local test facts; they never admit a Production read or operation.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const V = require("../lib/helmut/realkohorte-500-vertrag"), COUNTER = require("../lib/helmut/starttor-counter-head");
const container = process.env.HELMUT_STARTTOR_PG_CONTAINER;
const dockerEnv = { PATH: process.env.PATH, LANG: "C.UTF-8" };
const quote = s => "'" + String(s).replace(/'/g, "''") + "'";
const json = o => quote(JSON.stringify(o)) + "::jsonb";
function sql(input) {
  return execFileSync("docker", ["--host=unix:///var/run/docker.sock", "exec", "-i", container,
    "psql", "-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-f", "-"],
  { input, encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024, env: dockerEnv, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function main() {
  assert.equal(process.env.HELMUT_STARTTOR_PG_ISOLIERT, "JA");
  assert.match(container || "", /^starttor-native-pg-[a-f0-9]{8,16}$/);
  const info = JSON.parse(execFileSync("docker", ["--host=unix:///var/run/docker.sock", "inspect", container],
    { encoding: "utf8", env: dockerEnv }))[0];
  assert(["postgres:17.6", "postgres:17.6-bookworm"].includes(info.Config.Image));
  assert.equal(info.HostConfig.NetworkMode, "none");
  assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
  assert(info.Mounts.every(m => m.Destination === "/var/lib/postgresql/data" && ["tmpfs", "volume"].includes(m.Type)));
  assert.equal(sql("show server_version_num;"), "170006");
  assert.equal(sql("select to_regclass('public.helmut_store') is null;"), "t", "fresh disposable postgres only");
  const source = fs.readFileSync(path.join(__dirname, "../docs/betrieb/native-witness-abi.inert.sql"), "utf8");
  assert.equal((source.match(/expected_\w+ (?:text|oid) := NULL;/g) || []).length, 6);
  const runtime = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261001172619_synthetik500_end_runtime.sql"), "utf8");
  const compact = runtime.slice(runtime.indexOf("create function helmut_synthetik500_internal.json_compact"),
    runtime.indexOf("create function helmut_synthetik500_internal.pruefe"));
  let passed = 0; const ok = name => { passed++; console.log("PASS " + name); };
  sql(`create role service_role nologin bypassrls;create role authenticator nologin noinherit;
    create role anon nologin;create role authenticated nologin;grant service_role to authenticator;
    create table public.helmut_store(id text primary key,data jsonb);
    create table public.llm_budget_counters(day text,scope text,used integer,primary key(day,scope));
    create table public.pipeline_locks(expires_at timestamptz);
    create table public.helmut_jobs(status text,lease_expires_at timestamptz);
    create table public.process_runs(status text,finished_at timestamptz);
    create table public.helmut_job_outbox(status text);
    grant select on all tables in schema public to service_role;
    create schema helmut_synthetik500_internal;revoke all on schema helmut_synthetik500_internal from public;
    grant usage on schema helmut_synthetik500_internal to service_role;` + compact + `
    -- Pure fictional metadata dependency, not a reconstruction of an old receipt.
    create function public.helmut_postgrest_identity_probe_v1(uuid) returns jsonb
    language plpgsql stable security invoker set search_path=pg_catalog as $probe$
    begin return jsonb_build_object('nonce',$1,'actor',current_user);end;$probe$;
    grant execute on function helmut_synthetik500_internal.json_compact(jsonb) to service_role;`);
  sql(source);
  const nonce = "11111111-2222-4333-8444-555555555555";
  const rpc = args => "select public.helmut_starttor_original_state_witness(" + args.map(quote).join(",") + ");";
  const read = (args, readOnly = true, role = "service_role", timeout = "15s") => sql(`begin ${readOnly ? "read only" : "read write"};
    set local statement_timeout=${quote(timeout)};
    set session authorization authenticator;set local role ${role};
    set local request.jwt.claims='{"role":"service_role"}';` + rpc(args) + "commit;");
  assert.throws(() => read([nonce, ...Array(3).fill("a".repeat(64))]), /permission denied/);
  sql("grant execute on function public.helmut_starttor_original_state_witness(text,text,text,text) to service_role;");
  assert.throws(() => read([nonce, ...Array(3).fill("a".repeat(64))]), /starttor-original-state-closed/);
  ok("Inert default is non-executable by public roles and stops before absent business rows");
  // Derive the descriptor from the same finite catalog query as the source.
  // Hash stays in PostgreSQL's JSONB::text domain, never V.hash(descriptor).
  let catalogQuery = source.slice(source.indexOf("WITH wanted("), source.indexOf(" v_catalog:=v_catalog-"));
  catalogQuery = catalogQuery.replace("\nSELECT jsonb_build_object('observedAtUTC'", ", native_descriptor AS (SELECT jsonb_build_object('observedAtUTC'")
    .replace(" INTO v_catalog;", " AS item)");
  const namespaces = `(select jsonb_agg(jsonb_build_object('name',nspname,'oid',oid,'xmin',xmin::text,
    'owner',pg_get_userbyid(nspowner),'acl',nspacl::text,'usage',has_schema_privilege('service_role',oid,'USAGE'))
    order by nspname collate "C") from pg_namespace where nspname in ('pg_catalog','public','helmut_synthetik500_internal'))`;
  const descriptor = `item-array['observedAtUTC','caller','readOnly']||jsonb_build_object('namespaces',${namespaces})`;
  const catalog = () => JSON.parse(sql(catalogQuery + `select jsonb_build_object('descriptor',${descriptor},
    'catalogNativeSha256',encode(sha256(convert_to((${descriptor})::text,'UTF8')),'hex')) from native_descriptor;`));
  const facts = catalog();
  const serializer = facts.descriptor.functions.find(f => f.schema === "helmut_synthetik500_internal");
  const values = { expected_actor: "service_role", expected_session_actor: "authenticator", expected_jwt_role: "service_role",
    expected_catalog_native_sha256: facts.catalogNativeSha256, expected_serializer_oid: serializer.oid,
    expected_serializer_source_sha256: serializer.sourceSHA256 };
  const materialize = facts => {
    let result = source;
    for (const [key, value] of Object.entries(facts)) result = result.replace(
      new RegExp("(" + key + " (?:text|oid) := )NULL;"), "$1" + quote(value) + ";");
    return result;
  };
  const installed = materialize(values);
  sql(installed);
  const abi = JSON.parse(sql(`select jsonb_build_object('oid',oid::text,'bodySha256',encode(sha256(convert_to(prosrc,'UTF8')),'hex'),
    'config',proconfig) from pg_proc where oid='public.helmut_starttor_original_state_witness(text,text,text,text)'::regprocedure;`));
  const pin = () => ({ sha256: "f".repeat(64), bytes: 1 });
  const auth = { _authStoreRevision: "fixture-only", synthetik500KostenAdmission: { fixtureOnly: true },
    synthetik500DispatchJournal: { historicalUnknown: { state: "unknown", inFlight: { fixtureOnly: true } } },
    privateSentinel: "synthetic-original-never-export" };
  const mainObject = { fixtureOnly: true, _storeRevision: null };
  sql(`insert into public.helmut_store values ('main-auth',${json(auth)}),('main',${json(mainObject)});`);
  const authHead = JSON.parse(sql(`select jsonb_build_object('id',id,'tableOid',tableoid::oid::text,'xmin',xmin::text,
    'revisionPresent',true,'revision',data->'_authStoreRevision') from public.helmut_store where id='main-auth';`));
  const counterOid = sql("select 'public.llm_budget_counters'::regclass::oid::text;");
  const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
  const counter = { day, scope: "global", tableOid: counterOid, rowCount: 0, used: 0 };
  const packet = { version: "helmut-original-state-witness-root-packet/3-counter-absence", operationNonce: nonce,
    rootExecutor: "/root", purpose: "original-auth-main-js-native-hash-and-quiet-bridge",
    admittedAtUTC: new Date(now - 1000).toISOString(), expiresAtUTC: new Date(now + 60000).toISOString(),
    runtime: { commit: "a".repeat(40), deploymentId: "dpl_fixture", immutableHost: "fictional.vercel.app",
      projectRef: "ddckuvvpcytqbyfmbvie", actualReviewPin: pin() },
    nativeAbi: { version: "helmut-original-state-native-witness/2-counter-absence", name: "helmut_starttor_original_state_witness",
      oid: abi.oid, bodySha256: abi.bodySha256, catalogNativeSha256: facts.catalogNativeSha256,
      serializerOid: serializer.oid, serializerBodySha256: serializer.sourceSHA256,
      actor: "service_role", sessionActor: "authenticator", jwtRole: "service_role", actualReviewPin: pin() },
    finance: { observedAtUTC: new Date(now - 1000).toISOString(), authHead, counterHead: counter, actualReviewPin: pin() },
    scopeEvidence: { observedAtUTC: new Date(now - 1000).toISOString(), paidRoutes: pin(), workerAndManual: pin(),
      github: pin(), cronWindow: pin(), endGuard: pin() },
    authorization: { version: "helmut-original-state-internal-read-authorization/1", specificOriginalInternalReadApproved: true,
      originalUserEvidencePin: pin() },
    startschutz: { paketUtf8: "fictional", input: { manifest: {}, snapshot: {}, belege: { kosten: { auth: null } } },
      quietReference: {}, financeReference: {} },
    gates: { independentSourceReviewPin: pin(), rootReadAdmissionPin: pin(), specificReadAuthorizationAccepted: true,
      installedNativeAbiAccepted: true, finiteCurrentNativeCatalogAccepted: true, completeFreshFinanceAccepted: true,
      controlledPaidInflightScopeAccepted: true, endGuardReadyAccepted: true },
    preservedControls: { version: "helmut-original-state-preserved-controls/1",
      controlHash: V.hash({ slot: auth.synthetik500KostenAdmission, journal: auth.synthetik500DispatchJournal }), actualReviewPin: pin() } };
  const seed = p => sql(`insert into public.helmut_store values (${quote("synthetik500-original-state-" + nonce)},${json(p)})
    on conflict(id) do update set data=excluded.data;`);
  const args = p => [nonce, V.hash(p), V.hash(auth), V.hash(mainObject)];
  seed(packet);
  const witness = JSON.parse(read(args(packet)));
  assert.equal(witness.version, packet.nativeAbi.version); assert.equal(witness.packetHash, V.hash(packet));
  assert.equal(witness.auth.compactHash, V.hash(auth)); assert.equal(witness.main.compactHash, V.hash(mainObject));
  assert.equal(witness.auth.compactBytes, Buffer.byteLength(V.stabil(auth)));
  assert.deepEqual(witness.auth.head, authHead); assert.deepEqual(witness.counter, counter);
  assert.equal(COUNTER.pruefe(witness.counter, day, true), 0); assert(!Object.hasOwn(witness.counter, "xmin"));
  assert.equal(witness.signature.readOnly, "on"); assert.equal(witness.signature.actor, "service_role");
  assert.equal(witness.signature.sessionActor, "authenticator"); assert.equal(witness.signature.jwtRole, "service_role");
  assert.equal(witness.abi.bodySha256, abi.bodySha256); assert.equal(witness.catalogNativeSha256, facts.catalogNativeSha256);
  assert(!JSON.stringify(witness).includes(auth.privateSentinel)); assert(Buffer.byteLength(JSON.stringify(witness)) < 8192);
  assert.deepEqual(JSON.parse(sql("select data from public.helmut_store where id='main-auth';")), auth);
  ok("Single STABLE native absent-row witness binds actual local heads, source, roles and full original hashes");
  const largePacket = structuredClone(packet);
  largePacket.startschutz.paketUtf8 = "x".repeat(1500000);
  assert(Buffer.byteLength(V.stabil(largePacket)) > 1048576);
  assert(Buffer.byteLength(V.stabil(largePacket)) < 2097152);
  seed(largePacket);
  const largeWitness = JSON.parse(read(args(largePacket), true, "service_role", "8s"));
  assert.equal(largeWitness.packetHash, V.hash(largePacket));
  assert.deepEqual(largeWitness.counter, counter);
  const oversizedPacket = structuredClone(packet);
  oversizedPacket.startschutz.paketUtf8 = "x".repeat(2097152);
  seed(oversizedPacket);
  assert.throws(() => read(args(oversizedPacket)), /starttor-original-state-closed/);
  seed(packet);
  ok("Native v3 packet larger than1MiB succeeds with pre-statement8s timeout; over2MiB closes");
  const rejected = mutate => { const p = structuredClone(packet); mutate(p); seed(p);
    assert.throws(() => read(args(p)), /starttor-original-state-closed/); };
  for (const key of Object.keys(packet.gates).filter(k => k.endsWith("Accepted"))) {
    rejected(p => { delete p.gates[key]; }); rejected(p => { p.gates[key] = false; });
  }
  rejected(p => { p.authorization.specificOriginalInternalReadApproved = null; });
  rejected(p => { p.finance.counterHead = null; });
  rejected(p => { p.nativeAbi.bodySha256 = "0".repeat(64); });
  rejected(p => { p.preservedControls.controlHash = "0".repeat(64); });
  rejected(p => { p.runtime.unreviewed = true; });
  rejected(p => { p.nativeAbi.actualReviewPin.bytes = 0; });
  rejected(p => { p.finance.observedAtUTC = new Date(now - 61000).toISOString(); });
  rejected(p => { p.expiresAtUTC = new Date(now - 1).toISOString(); });
  seed(packet);
  assert.throws(() => read([nonce, "0".repeat(64), ...args(packet).slice(2)]), /starttor-original-state-closed/);
  assert.throws(() => read([nonce, V.hash(packet), "0".repeat(64), V.hash(mainObject)]), /starttor-original-state-closed/);
  assert.throws(() => read(args(packet), false), /starttor-original-state-closed/);
  for (const timeout of ["0", "16s"]) assert.throws(() => read(args(packet), true, "service_role", timeout), /starttor-original-state-closed/);
  for (const role of ["anon", "authenticated"]) assert.throws(() => read(args(packet), true, role), /permission denied/);
  ok("Missing/false gates, permission, hashes, stale finance, read-write and missing/excessive caller timeout close");
  sql(`insert into public.llm_budget_counters values (${quote(day)},'global',3);`);
  assert.throws(() => read(args(packet)), /starttor-original-state-closed/);
  const present = JSON.parse(sql(`select jsonb_build_object('day',day,'scope',scope,'tableOid',tableoid::oid::text,
    'xmin',xmin::text,'used',used) from public.llm_budget_counters;`));
  const presentPacket = structuredClone(packet); presentPacket.finance.counterHead = present; seed(presentPacket);
  const presentWitness = JSON.parse(read(args(presentPacket)));
  assert.deepEqual(presentWitness.counter, present); assert.equal(COUNTER.pruefe(presentWitness.counter, day, true), 3);
  sql("delete from public.llm_budget_counters;"); seed(packet);
  ok("Real counter insertion invalidates absence; explicit actual present head remains supported");
  for (const dirty of ["insert into public.helmut_jobs values(null,null)",
    "insert into public.helmut_jobs values('erledigt',clock_timestamp()+interval '1 minute')",
    "insert into public.pipeline_locks values(null)",
    "insert into public.pipeline_locks values(clock_timestamp()+interval '1 minute')",
    "insert into public.process_runs values('running',null)",
    "insert into public.process_runs values('unknown',null)",
    "insert into public.helmut_job_outbox values(null)"]) {
    sql(dirty); assert.throws(() => read(args(packet)), /starttor-original-state-closed/);
    sql("truncate public.helmut_jobs,public.pipeline_locks,public.process_runs,public.helmut_job_outbox;");
  }
  ok("Whole-table jobs, locks, leases, processes and outbox scans reject live or unknown rows");
  sql("revoke usage on schema helmut_synthetik500_internal from service_role;");
  assert.throws(() => read(args(packet)), /starttor-original-state-closed/);
  sql("grant usage on schema helmut_synthetik500_internal to service_role;");
  // The accepted catalog pin remains closed after any DDL/ACL drift: no silent rebaseline.
  assert.throws(() => read(args(packet)), /starttor-original-state-closed/);
  sql("create domain public.fixture_counter_type as integer;alter table public.llm_budget_counters alter used type public.fixture_counter_type;");
  // Rebind this LOCAL fixture's new descriptor; the old ACL xmin mismatch
  // must not mask the independent stock-type barrier.
  const domainCatalog = catalog();
  assert(domainCatalog.descriptor.types.some(t => t.name === "fixture_counter_type" && t.kind === "d"));
  sql(materialize({ ...values, expected_catalog_native_sha256: domainCatalog.catalogNativeSha256 }));
  const domainPacket = structuredClone(packet);
  domainPacket.nativeAbi.catalogNativeSha256 = domainCatalog.catalogNativeSha256;
  domainPacket.nativeAbi.bodySha256 = sql("select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='public.helmut_starttor_original_state_witness(text,text,text,text)'::regprocedure;");
  seed(domainPacket);
  assert.throws(() => read(args(domainPacket)), /starttor-original-state-closed/);
  ok("Newly rebound LOCAL domain catalog still fails independent stock-type barrier");
  // The previously accepted stock packet cannot call the changed source.
  assert.throws(() => read(args(packet)), /starttor-original-state-closed/);
  ok("Schema ACL/catalog drift and changed source cannot revive an old packet");
  console.log(`PASS ${passed}/${passed} local PostgreSQL17.6 groups; Production acceptance and 500 authority remain absent`);
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.stack); process.exitCode = 1; } }
