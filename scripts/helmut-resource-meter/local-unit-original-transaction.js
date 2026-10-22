"use strict";

// Pure, private Owner-service transaction compiler. No process, connection,
// filesystem, HTTP, token, seed, result installation or execution entry point.
// Root must load the qualification from its genuine private verifier boundary.
// The initial authenticated PostgreSQL session is deliberately privileged;
// SET SESSION AUTHORIZATION does not erase that origin or confer independence.
const crypto = require("node:crypto"), { isDeepStrictEqual } = require("node:util");
const prepared = new WeakMap(), CAP = 36 * 1024 * 1024, OWN_CAP = 4 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA = value => crypto.createHash("sha256").update(value).digest("hex");
const ORIGINAL = Object.freeze([
  "helmut_auth_state_cas_v1", "helmut_auth_state_payload_hash_local_v1", "helmut_auth_state_leaf_info_local_v1",
  "helmut_auth_state_children_local_v1", "helmut_auth_state_nodes_guard_local_v1", "helmut_auth_state_put_nodes_local_v1",
  "helmut_auth_state_expand_local_v1", "helmut_auth_state_assert_root_local_v1", "helmut_auth_state_assert_data_local_v1",
  "helmut_auth_state_assert_graph_local_v1", "helmut_auth_state_auth_guard_local_v1", "helmut_auth_state_graph_checked_local_v1",
  "helmut_auth_usage_guard_local_v1", "helmut_auth_usage_insert_local_v1", "helmut_auth_usage_checked_proof_local_v1",
]);
// Exact AS $f$ body bytes in the accompanying reviewed inert proposal. Native
// pg_proc.prosrc is hashed again in the transaction, never trusted as JSON.
const HELPERS = Object.freeze({
  original_bridge_top_map_v1: Object.freeze({ args: "text, text, text", sha: "cbab4ee2943f898ce18d0673406bcf67c8c65c57f5545e4bb1262338106918bb", result: "jsonb" }),
  original_bridge_value_v1: Object.freeze({ args: "text, text, text, jsonb, boolean", sha: "7de36453e5e664d1040649d73d537be7b9ab0fd00429ad31e7ea19ca1bf4ac50", result: "jsonb" }),
  original_bridge_own_projection_v1: Object.freeze({ args: "text, text, text, text", sha: "8074531ee40f7fa2858dc7b82f4e7e455dd34254e3489d1c53c0c8347e874622", result: "jsonb" }),
  original_bridge_compare_delta_v1: Object.freeze({ args: "text, text, text, text, text, jsonb", sha: "563ca8e1000bfc253e8ef9deee1805d23481f681781db4715fccf2159f52820b", result: "void" }),
  original_bridge_receipt_v1: Object.freeze({ args: "text, text, text, text, bigint, text, text, text, text, text", sha: "7546b33c570717038e3ec54f4b9d5ba027b7fda05cec4d8526cb59cd4d497068", result: "void" }),
});
const NATIVE = Object.freeze(["contract", "authority_read", "runtime_read", "state_read", "state_cas", "artifact_insert", "artifact_read", "lease_acquire", "lease_release"]);
function need(ok, code) { if (!ok) throw Error("local-unit-original-transaction-" + code); }
const exact = (v, names) => v !== null && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).sort().join("|") === [...names].sort().join("|");
function canonical(v, depth = 0) {
  need(depth <= 64, "json-depth");
  if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") { need(Number.isFinite(v), "json-number"); return JSON.stringify(v); }
  if (Array.isArray(v)) return "[" + v.map(x => canonical(x, depth + 1)).join(",") + "]";
  need(v && typeof v === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(v)), "json-value");
  return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonical(v[k], depth + 1)).join(",") + "}";
}
function ownKeys(operationId) {
  const p = "localUnitDiagnostic:" + operationId.slice(-32) + ":";
  return ["localUnitDiagnosticConsumedGrantsV1", ...["journal", "costs", "reservation", "sendClaim", "review", "result"].map(k => p + k)];
}
function parsedCanonical(text, hash, cap) {
  need(typeof text === "string" && Buffer.byteLength(text) <= cap && HASH.test(hash || "") && SHA(text) === hash, "actual-canonical-hash");
  let value; try { value = JSON.parse(text); } catch { need(false, "canonical-json"); }
  need(canonical(value) === text, "exact-canonical-text"); return value;
}
function proof(p) { return exact(p, ["generation", "count", "head", "originalHash"]) && UUID.test(p.generation || "")
  && Number.isSafeInteger(p.count) && p.count >= 0 && HASH.test(p.head || "") && HASH.test(p.originalHash || ""); }
function state(p) { return exact(p, ["version", "generation", "root", "originalHash"]) && p.version === "merkle-auth-v1"
  && UUID.test(p.generation || "") && HASH.test(p.root || "") && HASH.test(p.originalHash || ""); }
function sourceShape(s, kind) {
  need(exact(s, ["oid", "name", "identityArguments", "prosrcSHA256", "volatility", "returnType", "language", "config"])
    && typeof s.oid === "string" && /^[1-9][0-9]{0,9}$/.test(s.oid) && BigInt(s.oid) <= 4294967295n
    && typeof s.name === "string" && /^(?:public|helmut_unit_diagnostic)\.[a-z][a-z0-9_]{0,62}$/.test(s.name)
    && typeof s.identityArguments === "string" && /^[a-z0-9_., \[\]]{0,512}$/.test(s.identityArguments)
    && typeof s.returnType === "string" && /^[a-z0-9_. \[\]]{1,128}$/.test(s.returnType)
    && typeof s.prosrcSHA256 === "string" && HASH.test(s.prosrcSHA256)
    && ["i", "s", "v"].includes(s.volatility) && ["sql", "plpgsql"].includes(s.language)
    && (s.config === null || isDeepStrictEqual(s.config, ["search_path=pg_catalog"])), "source-pin-shape");
  if (kind !== "original") need(s.config !== null, "native-helper-search-path");
}
function qualification(q, r) {
  need(exact(q, ["schema", "database", "operationId", "commandHash", "originalSources", "helperSources", "nativeSources"])
    && q.schema === "helmut-local-unit-original-bridge-qualification/1"
    && q.database === "helmut_unit_diagnostic_" + r.operationId.slice(-32)
    && q.operationId === r.operationId && q.commandHash === r.commandHash, "qualified-owned-target");
  for (const [key, minimum, maximum] of [["originalSources", 15, 32], ["helperSources", 5, 5], ["nativeSources", 14, 128]]) {
    need(Array.isArray(q[key]) && q[key].length >= minimum && q[key].length <= maximum, "source-pin-count");
    const oids = new Set(), names = new Set();
    for (const s of q[key]) { sourceShape(s, key === "originalSources" ? "original" : "native");
      need(!oids.has(s.oid) && !names.has(s.name), "source-pin-duplicate"); oids.add(s.oid); names.add(s.name); }
  }
  for (const name of ORIGINAL) { const s = q.originalSources.find(x => x.name === "public." + name);
    need(s && isDeepStrictEqual(s.config, ["search_path=pg_catalog"]), "original-closure-required"); }
  for (const s of q.originalSources) need(s.name.startsWith("public.") && (ORIGINAL.includes(s.name.slice(7)) || s.returnType === "trigger"), "extra-original-trigger-only");
  for (const [name, p] of Object.entries(HELPERS)) {
    const h = q.helperSources.find(s => s.name === "helmut_unit_diagnostic." + name);
    need(h && h.identityArguments === p.args && h.prosrcSHA256 === p.sha && h.returnType === p.result
      && h.volatility === "s" && h.language === "plpgsql", "exact-projection-source-required");
    need(q.nativeSources.some(s => isDeepStrictEqual(s, h)), "native-helper-source-required");
  }
  for (const name of NATIVE) need(q.nativeSources.some(s => s.name === "public.local_unit_diagnostic_" + name + "_v1"), "native-rpc-source-required");
  for (const s of q.nativeSources) need(s.name.startsWith("helmut_unit_diagnostic.")
    || NATIVE.some(n => s.name === "public.local_unit_diagnostic_" + n + "_v1"), "native-source-namespace");
}
function validate(r, q) {
  need(exact(r, ["schema", "mode", "operationId", "commandHash", "claimId", "originalCAS", "ownBefore", "ownNext", "artifact"])
    && r.schema === "helmut-local-unit-original-write/1" && ["state", "usage"].includes(r.mode)
    && typeof r.operationId === "string" && /^localUnitDiagnostic-[a-f0-9]{32}$/.test(r.operationId)
    && typeof r.commandHash === "string" && HASH.test(r.commandHash)
    && typeof r.claimId === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(r.claimId), "request-scope-seed-result-blocked");
  qualification(q, r);
  need(exact(r.ownBefore, ["hash", "revision"]) && HASH.test(r.ownBefore.hash || "")
    && Number.isSafeInteger(r.ownBefore.revision) && r.ownBefore.revision >= 0
    && exact(r.ownNext, ["canonical", "hash"]), "own-compare-and-swap");
  const next = parsedCanonical(r.ownNext.canonical, r.ownNext.hash, OWN_CAP), keys = ownKeys(r.operationId);
  need(exact(next, keys), "own-seven-only");
  const p = "localUnitDiagnostic:" + r.operationId.slice(-32) + ":";
  need(next[p + "journal"]?.claimId === r.claimId && isDeepStrictEqual(next[p + "result"], { state: "pending", evidenceHash: null, positions: [] })
    && next[p + "journal"]?.state !== "closed", "result-transition-blocked");
  const cas = r.originalCAS;
  need(exact(cas, ["id", "expectedRevision", "expectedProof", "expectedState", "revision", "root", "nodes", "additions"])
    && cas.id === "main-auth" && UUID.test(cas.expectedRevision || "") && UUID.test(cas.revision || "")
    && cas.revision !== cas.expectedRevision && proof(cas.expectedProof) && state(cas.expectedState)
    && HASH.test(cas.root || "") && Array.isArray(cas.nodes) && cas.nodes.length <= 20000
    && Array.isArray(cas.additions), "actual-original-eight-key-cas");
  const seen = new Set(); let nodeBytes = 0;
  for (const n of cas.nodes) {
    need(exact(n, ["hash", "payload"]) && HASH.test(n.hash || "") && typeof n.payload === "string"
      && Buffer.byteLength(n.payload) <= 4194304 && SHA(n.payload) === n.hash && !seen.has(n.hash), "actual-original-node-bytes");
    seen.add(n.hash); nodeBytes += Buffer.byteLength(n.payload); need(nodeBytes <= 33554432, "actual-original-node-cap");
  }
  if (r.mode === "state") {
    need(r.artifact === null && cas.additions.length === 0 && r.ownNext.hash !== r.ownBefore.hash && cas.root !== cas.expectedState.root, "state-delta-only");
  } else {
    const a = r.artifact;
    need(exact(a, ["kind", "logicalId", "canonical", "sha256", "parentHash"]) && ["usage-D", "usage-R"].includes(a.kind)
      && typeof a.logicalId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(a.logicalId) && a.parentHash === null
      && cas.additions.length === 1 && cas.root === cas.expectedState.root && cas.nodes.length === 0
      && r.ownNext.hash === r.ownBefore.hash, "one-usage-delta-only");
    const body = parsedCanonical(a.canonical, a.sha256, 2097152), phase = a.kind.slice(-1), costs = next[p + "costs"], journal = next[p + "journal"];
    need(isDeepStrictEqual(body, cas.additions[0]) && body.scopeHash === r.commandHash && body.budgetTicketId === a.logicalId
      && body.costPhase === phase && body.costBasis === "local-fixture-simulation-not-provider-charge"
      && costs?.calls?.[a.logicalId]?.status === "sent" && journal?.attempts?.[phase]?.status === "sent"
      && journal.attempts[phase].ticketId === a.logicalId && next[p + "sendClaim"]?.[phase]?.ticketId === a.logicalId
      && body.costRequestHash === next[p + "sendClaim"][phase].requestHash, "actual-own-ticket-usage");
  }
  need(Buffer.byteLength(canonical(r)) <= CAP && Buffer.byteLength(canonical(q)) <= 1024 * 1024, "bounded-request");
  return next;
}
function literal(value) { need(typeof value === "string" && !value.includes("\0"), "sql-text"); return "'" + value.replace(/'/g, "''") + "'"; }

function compile(r, q, nonce) {
  const suffix = r.operationId.slice(-32), writer = "helmut_ud_bridge_writer_" + suffix;
  const auth = "helmut_ud_authenticator_" + suffix, runtime = "helmut_ud_runtime_" + suffix;
  const requestText = canonical(r), qualificationText = canonical(q);
  return `BEGIN;
SET LOCAL standard_conforming_strings=on;
SET LOCAL search_path=pg_catalog;
SET LOCAL row_security=on;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='500ms';
SET LOCAL idle_in_transaction_session_timeout='2s';
SET LOCAL helmut.local_usage_experiment='on';
SET LOCAL helmut.local_auth_state_cas_projection='on';
SET LOCAL helmut.local_diagnostic_scope='bounded-cas-qualification-v1';
CREATE TEMP TABLE original_bridge_args(request_text text not null,request_hash text not null,qualification jsonb not null,nonce text not null,backend_pid integer not null,transaction_id xid8 not null) ON COMMIT DROP;
CREATE TEMP TABLE original_bridge_results(phase text primary key,value jsonb not null) ON COMMIT PRESERVE ROWS;
INSERT INTO pg_temp.original_bridge_args VALUES(${literal(requestText)},${literal(SHA(requestText))},${literal(qualificationText)}::jsonb,${literal(nonce)},pg_backend_pid(),pg_current_xact_id());
DO $root$
DECLARE q jsonb; r jsonb; s jsonb; p record; scope text; t record; roles_safe integer; expected_native oid[]; actual_native oid[];
  acl_target oid; acl_entry record; temp_name name;
BEGIN
  IF current_database()<>${literal(q.database)} OR session_user<>'postgres' OR current_user<>session_user
    OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=session_user AND rolsuper) THEN RAISE EXCEPTION 'original-bridge-initial-superuser-origin-required';END IF;
  SELECT qualification,request_text::jsonb INTO STRICT q,r FROM pg_temp.original_bridge_args;
  IF encode(sha256(convert_to((SELECT request_text FROM pg_temp.original_bridge_args),'UTF8')),'hex')
    IS DISTINCT FROM (SELECT request_hash FROM pg_temp.original_bridge_args) THEN RAISE EXCEPTION 'original-bridge-actual-request-hash';END IF;
  SELECT count(*) INTO roles_safe FROM pg_roles WHERE rolname IN(${literal(writer)},${literal(runtime)})
    AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit OR rolcanlogin OR rolreplication);
  IF roles_safe<>2 OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=${literal(auth)} AND rolcanlogin
    AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication))
    OR EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=${literal(writer)}))
    OR EXISTS(SELECT FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname=${literal(writer)}))
    OR pg_has_role(${literal(auth)},${literal(writer)},'MEMBER') THEN RAISE EXCEPTION 'original-bridge-no-privileged-role-bridge';END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(q->'originalSources') UNION ALL SELECT value FROM jsonb_array_elements(q->'nativeSources') LOOP
    SELECT p0.*,n.nspname,l.lanname INTO STRICT p FROM pg_proc p0 JOIN pg_namespace n ON n.oid=p0.pronamespace
      JOIN pg_language l ON l.oid=p0.prolang WHERE p0.oid=(s->>'oid')::oid;
    IF p.nspname||'.'||p.proname IS DISTINCT FROM s->>'name' OR oidvectortypes(p.proargtypes) IS DISTINCT FROM s->>'identityArguments'
      OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM s->>'prosrcSHA256'
      OR p.prosecdef OR to_jsonb(p.proconfig) IS DISTINCT FROM nullif(s->'config','null'::jsonb)
      OR p.provolatile::text IS DISTINCT FROM s->>'volatility' OR format_type(p.prorettype,null) IS DISTINCT FROM s->>'returnType'
      OR p.lanname IS DISTINCT FROM s->>'language' THEN RAISE EXCEPTION 'original-bridge-actual-qualified-source-mismatch';END IF;
  END LOOP;
  SELECT array_agg((value->>'oid')::oid ORDER BY (value->>'oid')::oid) INTO expected_native FROM jsonb_array_elements(q->'nativeSources');
  SELECT array_agg(p.oid ORDER BY p.oid) INTO actual_native FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='helmut_unit_diagnostic' OR (n.nspname='public' AND p.proname=ANY(ARRAY[${NATIVE.map(n => literal("local_unit_diagnostic_" + n + "_v1")).join(",")} ]));
  IF actual_native IS DISTINCT FROM expected_native THEN RAISE EXCEPTION 'original-bridge-complete-native-source-set';END IF;
  IF EXISTS(SELECT FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN
    ('public.helmut_store'::regclass,'public.helmut_auth_state_nodes_local'::regclass,'public.llm_usage'::regclass)
    AND NOT EXISTS(SELECT FROM jsonb_array_elements(q->'originalSources') s0 WHERE (s0->>'oid')::oid=t.tgfoid)) THEN
    RAISE EXCEPTION 'original-bridge-complete-original-trigger-set';END IF;
  IF (SELECT count(*) FROM pg_class WHERE oid IN ('public.helmut_store'::regclass,'public.helmut_auth_state_nodes_local'::regclass,'public.llm_usage'::regclass)
    AND relrowsecurity AND relkind='r')<>3 THEN RAISE EXCEPTION 'original-bridge-legacy-rls-required';END IF;
  SELECT nspname INTO STRICT temp_name FROM pg_namespace WHERE oid=pg_my_temp_schema();
  FOR acl_entry IN SELECT DISTINCT a.grantee FROM pg_namespace ns CROSS JOIN LATERAL aclexplode(coalesce(ns.nspacl,acldefault('n',ns.nspowner))) a
    WHERE ns.oid=pg_my_temp_schema() AND a.grantee<>ns.nspowner LOOP
    IF acl_entry.grantee=0 THEN EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC',temp_name);
    ELSE EXECUTE format('REVOKE ALL ON SCHEMA %I FROM %I',temp_name,(SELECT rolname FROM pg_roles WHERE oid=acl_entry.grantee));END IF;
  END LOOP;
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM postgres',temp_name);
  EXECUTE format('GRANT ALL ON SCHEMA %I TO postgres',temp_name);
  FOREACH acl_target IN ARRAY ARRAY['pg_temp.original_bridge_args'::regclass::oid,'pg_temp.original_bridge_results'::regclass::oid] LOOP
    FOR acl_entry IN SELECT DISTINCT a.grantee FROM pg_class cl CROSS JOIN LATERAL aclexplode(coalesce(cl.relacl,acldefault('r',cl.relowner))) a
      WHERE cl.oid=acl_target AND a.grantee<>cl.relowner LOOP
      IF acl_entry.grantee=0 THEN EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC',acl_target::regclass);
      ELSE EXECUTE format('REVOKE ALL ON TABLE %s FROM %I',acl_target::regclass,(SELECT rolname FROM pg_roles WHERE oid=acl_entry.grantee));END IF;
    END LOOP;
    EXECUTE format('REVOKE ALL ON TABLE %s FROM postgres',acl_target::regclass);
    EXECUTE format('GRANT ALL ON TABLE %s TO postgres',acl_target::regclass);
  END LOOP;
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I,%I',temp_name,${literal(writer)},${literal(runtime)});
  EXECUTE format('GRANT SELECT ON pg_temp.original_bridge_args TO %I,%I',${literal(writer)},${literal(runtime)});
  EXECUTE format('GRANT SELECT,INSERT ON pg_temp.original_bridge_results TO %I,%I',${literal(writer)},${literal(runtime)});
  ALTER TABLE pg_temp.original_bridge_results ENABLE ROW LEVEL SECURITY;
  ALTER TABLE pg_temp.original_bridge_results FORCE ROW LEVEL SECURITY;
  EXECUTE format('CREATE POLICY original_bridge_read ON pg_temp.original_bridge_results FOR SELECT TO %I,%I USING(true)',${literal(writer)},${literal(runtime)});
  EXECUTE format('CREATE POLICY original_bridge_auth_insert ON pg_temp.original_bridge_results FOR INSERT TO %I WITH CHECK(phase=''authAck'')',${literal(writer)});
  EXECUTE format('CREATE POLICY original_bridge_own_insert ON pg_temp.original_bridge_results FOR INSERT TO %I WITH CHECK(phase=''ownAck'')',${literal(runtime)});
END;$root$;
SET SESSION AUTHORIZATION ${writer};
DO $original$
DECLARE r jsonb; c jsonb; d jsonb; a jsonb; m jsonb; u jsonb; old_own jsonb; ack jsonb; after_root jsonb; after_usage jsonb;
  own_row helmut_unit_diagnostic.state%rowtype; authority_row helmut_unit_diagnostic.authority%rowtype; prefix text; phase text; ticket text; usage_row record;
BEGIN
  IF session_user<>${literal(writer)} OR current_user<>session_user THEN RAISE EXCEPTION 'original-bridge-writer-principal';END IF;
  SELECT request_text::jsonb INTO STRICT r FROM pg_temp.original_bridge_args;c:=r->'originalCAS';d:=(r#>>'{ownNext,canonical}')::jsonb;
  prefix:='localUnitDiagnostic:'||right(r->>'operationId',32)||':';
  -- Fixed shared lock order: own state, main-auth, then usage/artifact/results.
  SELECT * INTO STRICT own_row FROM helmut_unit_diagnostic.state WHERE scope_hash=r->>'commandHash' FOR UPDATE;
  SELECT data INTO STRICT a FROM public.helmut_store WHERE id='main-auth' FOR UPDATE;
  SELECT * INTO STRICT authority_row FROM helmut_unit_diagnostic.authority WHERE scope_hash=r->>'commandHash';
  IF own_row.body_hash IS DISTINCT FROM r#>>'{ownBefore,hash}' OR own_row.revision::text IS DISTINCT FROM r#>>'{ownBefore,revision}'
    OR own_row.body IS DISTINCT FROM own_row.canonical_text::jsonb
    OR encode(sha256(convert_to(own_row.canonical_text,'UTF8')),'hex') IS DISTINCT FROM own_row.body_hash
    OR authority_row.operation_id IS DISTINCT FROM r->>'operationId' OR clock_timestamp()>=authority_row.expires_at
    OR encode(sha256(convert_to(r#>>'{ownNext,canonical}','UTF8')),'hex') IS DISTINCT FROM r#>>'{ownNext,hash}' THEN
    RAISE EXCEPTION 'original-bridge-own-before-or-next-mismatch';END IF;
  IF own_row.body#>>ARRAY[prefix||'journal','claimId'] IS DISTINCT FROM r->>'claimId' THEN
    IF (r->>'mode'='state' AND own_row.body#>>ARRAY[prefix||'journal','state']='installed'
      AND own_row.body#>ARRAY[prefix||'journal','claimId']='null'::jsonb) IS NOT TRUE THEN RAISE EXCEPTION 'original-bridge-own-current-claim';END IF;
  END IF;
  m:=public.helmut_auth_state_assert_root_local_v1(a);u:=public.helmut_auth_usage_checked_proof_local_v1('main-auth');
  IF a->>'_authStoreRevision' IS DISTINCT FROM c->>'expectedRevision' OR m IS DISTINCT FROM c->'expectedState'
    OR u->'proof' IS DISTINCT FROM c->'expectedProof' OR u->>'revision' IS DISTINCT FROM c->>'expectedRevision' THEN
    RAISE EXCEPTION 'original-bridge-original-before-stale';END IF;
  old_own:=helmut_unit_diagnostic.original_bridge_own_projection_v1('main-auth',m->>'generation',m->>'root',r->>'operationId');
  IF old_own IS DISTINCT FROM own_row.body THEN RAISE EXCEPTION 'original-bridge-old-full-auth-mirror';END IF;
  IF r->>'mode'='state' THEN
    IF c->'additions'<>'[]'::jsonb OR d IS NOT DISTINCT FROM own_row.body THEN RAISE EXCEPTION 'original-bridge-no-state-noop-or-usage';END IF;
  ELSE
    IF jsonb_array_length(c->'additions')<>1 OR d IS DISTINCT FROM own_row.body OR c->>'root' IS DISTINCT FROM m->>'root'
      OR c->'nodes'<>'[]'::jsonb OR c#>'{additions,0}' IS DISTINCT FROM (r#>>'{artifact,canonical}')::jsonb THEN
      RAISE EXCEPTION 'original-bridge-one-identical-usage-record';END IF;
    phase:=right(r#>>'{artifact,kind}',1);ticket:=r#>>'{artifact,logicalId}';
    IF own_row.body#>>ARRAY[prefix||'costs','calls',ticket,'status'] IS DISTINCT FROM 'sent'
      OR own_row.body#>>ARRAY[prefix||'journal','attempts',phase,'status'] IS DISTINCT FROM 'sent'
      OR own_row.body#>>ARRAY[prefix||'journal','attempts',phase,'ticketId'] IS DISTINCT FROM ticket
      OR own_row.body#>>ARRAY[prefix||'sendClaim',phase,'ticketId'] IS DISTINCT FROM ticket
      OR c#>>'{additions,0,budgetTicketId}' IS DISTINCT FROM ticket OR c#>>'{additions,0,scopeHash}' IS DISTINCT FROM r->>'commandHash'
      OR c#>>'{additions,0,costRequestHash}' IS DISTINCT FROM own_row.body#>>ARRAY[prefix||'sendClaim',phase,'requestHash']
      OR c#>>'{additions,0,costBasis}' IS DISTINCT FROM 'local-fixture-simulation-not-provider-charge' THEN
      RAISE EXCEPTION 'original-bridge-real-current-ticket';END IF;
  END IF;
  ack:=public.helmut_auth_state_cas_v1(c);
  IF jsonb_typeof(ack) IS DISTINCT FROM 'array' OR jsonb_array_length(ack)<>1
    OR NOT helmut_unit_diagnostic.exact(ack->0,ARRAY['id','revision','proof','state'])
    OR NOT helmut_unit_diagnostic.exact(ack#>'{0,proof}',ARRAY['generation','count','head','originalHash'])
    OR coalesce(ack#>>'{0,proof,count}','')!~'^(0|[1-9][0-9]{0,15})$'
    OR coalesce(ack#>>'{0,proof,head}','')!~'^[a-f0-9]{64}$' OR ack#>>'{0,id}' IS DISTINCT FROM 'main-auth'
    OR ack#>>'{0,revision}' IS DISTINCT FROM c->>'revision' OR ack#>'{0,state}' IS DISTINCT FROM (m||jsonb_build_object('root',c->>'root'))
    OR ack#>>'{0,proof,generation}' IS DISTINCT FROM u#>>'{proof,generation}'
    OR ack#>>'{0,proof,originalHash}' IS DISTINCT FROM u#>>'{proof,originalHash}'
    OR (ack#>>'{0,proof,count}')::bigint<>(u#>>'{proof,count}')::bigint+jsonb_array_length(c->'additions') THEN
    RAISE EXCEPTION 'original-bridge-original-ack-unconfirmed';END IF;
  IF (r->>'mode'='state' AND ack#>>'{0,proof,head}' IS DISTINCT FROM u#>>'{proof,head}')
    OR (r->>'mode'='usage' AND ack#>>'{0,proof,head}' IS NOT DISTINCT FROM u#>>'{proof,head}') THEN
    RAISE EXCEPTION 'original-bridge-original-history-head';END IF;
  SELECT data INTO STRICT a FROM public.helmut_store WHERE id='main-auth';
  after_root:=public.helmut_auth_state_assert_root_local_v1(a);after_usage:=public.helmut_auth_usage_checked_proof_local_v1('main-auth');
  IF after_root IS DISTINCT FROM ack#>'{0,state}' OR after_usage->'proof' IS DISTINCT FROM ack#>'{0,proof}'
    OR after_usage->>'revision' IS DISTINCT FROM c->>'revision' OR a->>'_authStoreRevision' IS DISTINCT FROM c->>'revision'
    OR coalesce(current_setting('helmut.atomic_state_seal',true),'')<>'' OR coalesce(current_setting('helmut.atomic_usage_seal',true),'')<>'' THEN
    RAISE EXCEPTION 'original-bridge-original-readback-unconfirmed';END IF;
  PERFORM helmut_unit_diagnostic.original_bridge_compare_delta_v1('main-auth',m->>'generation',m->>'root',after_root->>'root',r->>'operationId',d);
  IF r->>'mode'='usage' THEN
    SELECT * INTO STRICT usage_row FROM public.llm_usage WHERE usage_store_id='main-auth' AND usage_generation=u#>>'{proof,generation}'
      AND usage_ordinal=(u#>>'{proof,count}')::bigint+1;
    IF usage_row.id IS DISTINCT FROM c#>>'{additions,0,id}' OR usage_row.usage_record IS DISTINCT FROM c#>'{additions,0}'
      OR usage_row.usage_prev_hash IS DISTINCT FROM u#>>'{proof,head}' OR usage_row.usage_chain_hash IS DISTINCT FROM after_usage#>>'{proof,head}' THEN
      RAISE EXCEPTION 'original-bridge-exact-original-usage-row';END IF;
  END IF;
  INSERT INTO pg_temp.original_bridge_results VALUES('authAck',ack);
END;$original$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION ${auth};
SET LOCAL ROLE ${runtime};
DO $own$
DECLARE r jsonb; n text; ack jsonb; claim_hash text; current_body jsonb; current_hash text; current_revision bigint;
BEGIN
  IF session_user<>${literal(auth)} OR current_user<>${literal(runtime)} THEN RAISE EXCEPTION 'original-bridge-runtime-principal';END IF;
  SELECT request_text::jsonb,nonce INTO STRICT r,n FROM pg_temp.original_bridge_args;
  claim_hash:=encode(sha256(convert_to(r->>'claimId','UTF8')),'hex');
  IF r->>'mode'='state' THEN
    ack:=public.local_unit_diagnostic_state_cas_v1(r->>'commandHash',claim_hash,r#>>'{ownBefore,hash}',
      (r#>>'{ownBefore,revision}')::bigint,r#>>'{ownNext,canonical}',r#>>'{ownNext,hash}',n);
    SELECT body,body_hash,revision INTO STRICT current_body,current_hash,current_revision FROM helmut_unit_diagnostic.state WHERE scope_hash=r->>'commandHash';
    IF NOT helmut_unit_diagnostic.exact(ack,ARRAY['version','scopeHash','hash','revision','claimHash','nonce'])
      OR ack->>'version' IS DISTINCT FROM 'helmut-local-unit-diagnostic-state-ack/1' OR ack->>'claimHash' IS DISTINCT FROM claim_hash
      OR coalesce(ack->>'revision','')!~'^(0|[1-9][0-9]{0,15})$'
      OR ack->>'hash' IS DISTINCT FROM r#>>'{ownNext,hash}' OR (ack->>'revision')::bigint<>(r#>>'{ownBefore,revision}')::bigint+1
      OR current_body IS DISTINCT FROM (r#>>'{ownNext,canonical}')::jsonb OR current_hash IS DISTINCT FROM ack->>'hash'
      OR current_revision IS DISTINCT FROM (ack->>'revision')::bigint THEN RAISE EXCEPTION 'original-bridge-own-cas-ack';END IF;
  ELSE
    ack:=public.local_unit_diagnostic_artifact_insert_v1(r->>'commandHash',claim_hash,r#>>'{artifact,kind}',r#>>'{artifact,logicalId}',
      r#>>'{artifact,canonical}',r#>>'{artifact,sha256}',null,n);
    IF NOT helmut_unit_diagnostic.exact(ack,ARRAY['version','scopeHash','kind','logicalId','hash','stateRevision','nonce'])
      OR ack->>'version' IS DISTINCT FROM 'helmut-local-unit-diagnostic-artifact-ack/1'
      OR coalesce(ack->>'stateRevision','')!~'^(0|[1-9][0-9]{0,15})$'
      OR ack->>'kind' IS DISTINCT FROM r#>>'{artifact,kind}' OR ack->>'logicalId' IS DISTINCT FROM r#>>'{artifact,logicalId}'
      OR ack->>'hash' IS DISTINCT FROM r#>>'{artifact,sha256}' OR (ack->>'stateRevision')::bigint<>(r#>>'{ownBefore,revision}')::bigint
      OR NOT EXISTS(SELECT FROM helmut_unit_diagnostic.artifacts WHERE scope_hash=r->>'commandHash' AND kind=r#>>'{artifact,kind}'
        AND logical_id=r#>>'{artifact,logicalId}' AND body_hash=r#>>'{artifact,sha256}' AND parent_hash IS NULL
        AND canonical_text=r#>>'{artifact,canonical}' AND body=(r#>>'{artifact,canonical}')::jsonb) THEN RAISE EXCEPTION 'original-bridge-own-usage-artifact-ack';END IF;
  END IF;
  IF ack->>'scopeHash' IS DISTINCT FROM r->>'commandHash' OR ack->>'nonce' IS DISTINCT FROM n THEN RAISE EXCEPTION 'original-bridge-own-ack-scope';END IF;
  INSERT INTO pg_temp.original_bridge_results VALUES('ownAck',ack);
END;$own$;
RESET ROLE;
RESET SESSION AUTHORIZATION;
DO $final$
BEGIN
  IF session_user<>'postgres' OR current_user<>session_user OR (SELECT count(*) FROM pg_temp.original_bridge_results)<>2 THEN
    RAISE EXCEPTION 'original-bridge-complete-atomic-result-required';END IF;
END;$final$;
COMMIT;
SELECT jsonb_build_object('schema','helmut-local-unit-original-write-result/1',
  'authAck',(SELECT value FROM pg_temp.original_bridge_results WHERE phase='authAck'),
  'ownAck',(SELECT value FROM pg_temp.original_bridge_results WHERE phase='ownAck'));
`;
}
function prepare(request, inputQualification) {
  validate(request, inputQualification);
  const requestCopy = JSON.parse(canonical(request)), q = JSON.parse(canonical(inputQualification)), nonce = crypto.randomBytes(32).toString("hex");
  const sql = compile(requestCopy, q, nonce), packet = Object.freeze({ schema: "helmut-local-unit-original-transaction-plan/1",
    database: q.database, sql, sqlSHA256: SHA(sql), requestSHA256: SHA(canonical(requestCopy)), qualificationSHA256: SHA(canonical(q)),
    requiredInitialRole: "postgres", requiredInitialSuperuser: true, originallyUnprivileged: false,
    preparedOnly: true, seedBlocked: true, resultTransitionBlocked: true, unitExecutionAuthorized: false, full500: false });
  prepared.set(packet, { request: requestCopy, nonce }); return packet;
}
function acceptResult(packet, raw) {
  // Payload validation only. The private Owner service MUST first observe its
  // single psql process exit 0, both pipe EOFs and successful COMMIT completion.
  // The sole result SELECT follows COMMIT. Partial stdout or this pure function
  // alone still confers no independent native execution/commit authority.
  const d = prepared.get(packet); need(d, "private-prepared-plan-required"); prepared.delete(packet);
  if (Buffer.isBuffer(raw)) { need(raw.length <= 65536 && Buffer.from(raw.toString("utf8")).equals(raw), "result-utf8-cap"); raw = raw.toString("utf8"); }
  need(typeof raw === "string" && Buffer.byteLength(raw) <= 65536, "result-bytes");
  let value; try { value = JSON.parse(raw); } catch { need(false, "result-json"); }
  const r = d.request, c = r.originalCAS;
  need(exact(value, ["schema", "authAck", "ownAck"]) && value.schema === "helmut-local-unit-original-write-result/1"
    && Array.isArray(value.authAck) && value.authAck.length === 1, "result-shape");
  const a = value.authAck[0], w = value.ownAck;
  need(exact(a, ["id", "revision", "proof", "state"]) && a.id === "main-auth" && a.revision === c.revision && proof(a.proof) && state(a.state)
    && a.proof.generation === c.expectedProof.generation && a.proof.originalHash === c.expectedProof.originalHash
    && a.proof.count === c.expectedProof.count + c.additions.length
    && (r.mode === "state" ? a.proof.head === c.expectedProof.head : a.proof.head !== c.expectedProof.head)
    && isDeepStrictEqual(a.state, { ...c.expectedState, root: c.root }), "result-original-ack");
  if (r.mode === "state") need(exact(w, ["version", "scopeHash", "hash", "revision", "claimHash", "nonce"])
    && w.version === "helmut-local-unit-diagnostic-state-ack/1" && w.hash === r.ownNext.hash
    && w.revision === r.ownBefore.revision + 1 && w.claimHash === SHA(r.claimId), "result-native-state-ack");
  else need(exact(w, ["version", "scopeHash", "kind", "logicalId", "hash", "stateRevision", "nonce"])
    && w.version === "helmut-local-unit-diagnostic-artifact-ack/1" && w.kind === r.artifact.kind
    && w.logicalId === r.artifact.logicalId && w.hash === r.artifact.sha256 && w.stateRevision === r.ownBefore.revision, "result-native-artifact-ack");
  need(w.scopeHash === r.commandHash && w.nonce === d.nonce, "result-native-scope-nonce");
  return value;
}
module.exports = Object.freeze({ prepare, acceptResult });
