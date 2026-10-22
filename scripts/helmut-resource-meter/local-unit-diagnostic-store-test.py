#!/usr/bin/env python3
"""Bounded static contract audit and pure JS negative capability checks.

No database, Docker, network, engine, provider or private source inputs.

This is deliberately not SQL parsing/execution or native acceptance. It checks
the owned-only DDL boundary and security-critical emitted SQL properties, with
negative mutations proving that each relevant boundary is actually checked.
"""
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

SQL = Path(__file__).with_name("local-unit-diagnostic-store.sql")
RPCS = {
    "contract": "",
    "authority_read": "p_scope_hash text,p_nonce text",
    "runtime_read": "p_scope_hash text,p_nonce text",
    "state_read": "p_scope_hash text,p_nonce text",
    "state_cas": "p_scope_hash text,p_claim_hash text,p_old_hash text,p_old_revision bigint,p_next_canonical text,p_next_hash text,p_nonce text",
    "artifact_insert": "p_scope_hash text,p_claim_hash text,p_kind text,p_logical_id text,p_canonical text,p_sha256 text,p_parent_hash text,p_nonce text",
    "artifact_read": "p_scope_hash text,p_kind text,p_logical_id text,p_expected_sha256 text,p_nonce text",
    "lease_acquire": "p_scope_hash text,p_claim_hash text,p_job text,p_ttl_ms integer,p_nonce text",
    "lease_release": "p_scope_hash text,p_claim_hash text,p_job text,p_token uuid,p_nonce text",
}


def need(ok, reason):
    if not ok:
        raise ValueError(reason)


def strip_comments(text):
    # Preserve literal contents: guards and error codes are part of this audit.
    return re.sub(r"--[^\n]*", "", text)


def delimiters(text):
    """Check the outer SQL lexical envelope; PL/pgSQL still needs a real PG17."""
    i = 0
    parens = 0
    while i < len(text):
        if text.startswith("--", i):
            end = text.find("\n", i)
            i = len(text) if end == -1 else end + 1
        elif text[i] in "'\"":
            q = text[i]
            i += 1
            while i < len(text):
                if text[i] == q:
                    if i + 1 < len(text) and text[i + 1] == q:
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            else:
                raise ValueError("unclosed quoted string")
        elif text[i] == "$":
            tag = re.match(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$", text[i:])
            need(tag is not None, "unexpected dollar")
            end = text.find(tag[0], i + len(tag[0]))
            need(end != -1, "unclosed dollar body")
            i = end + len(tag[0])
        else:
            parens += (text[i] == "(") - (text[i] == ")")
            need(parens >= 0, "unbalanced parenthesis")
            i += 1
    need(parens == 0, "unclosed parenthesis")


def audit(text):
    need(len(text.encode()) <= 128 * 1024, "bounded source")
    delimiters(text)
    code = strip_comments(text)
    need(code.lstrip().startswith("begin;"), "transaction")
    need(code.rstrip().endswith("reset role;\ncommit;"), "transaction closure")
    need("^helmut_unit_diagnostic_[a-f0-9]{32}$" in code, "owned database name")
    need("local_unit_diagnostic_install_target" in code and "is distinct from db" in code, "exact installation interlock")
    need("server_version_num')::integer < 170000" in code, "PG17 requirement")
    need("nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls" in code, "unprivileged roles")
    need(not re.search(r"security\s+definer", code, re.I), "no SECURITY DEFINER")
    need(not re.search(r"\b(?:update|delete\s+from|insert\s+into|truncate)\s+public\.", code, re.I), "no legacy row writes")
    need(not re.search(r"(?:drop|create\s+or\s+replace)\s+(?:function|table|trigger|schema)", code, re.I), "no replacing old objects")
    tables = re.findall(r"create table\s+([\w.]+)\(", code, re.I)
    need(set(tables) == {"helmut_unit_diagnostic." + x for x in ("authority", "runtime_observations", "state", "artifacts", "leases", "legacy_read_rpcs")}, "exact owned tables")
    need("grant_id text not null unique" in code, "global grant single use")
    need("request_models jsonb not null" in code
         and "exact(new.request_models,array['D','R'])" in code
         and "new.request_models->>'R' is distinct from new.request_models->>'D'" in code,
         "immutable original per-phase model binding")
    need("new.body->>'model' is distinct from a.request_models->>phase" in code,
         "usage model is actual bound model, not alias")
    need("'requestModels',a.request_models" in code, "native original-model witness")
    need("c#>'{limits,maxOutputTokens}' is distinct from '{\"D\":3000,\"R\":6000}'::jsonb" in code
         and "c#>'{limits,reservePerPhaseMicroUsd}' is distinct from '{\"D\":81400,\"R\":88000}'::jsonb" in code,
         "phase-exact new fixture-only contract")
    need("phase_reserved:=case when phase='D' then 81400 else 88000 end" in code
         and "phase_output:=case when phase='D' then 3000 else 6000 end" in code
         and "total+reserved_total>169400" in code, "phase-exact native reservation and total cap")
    need("coalesce((t->>'maxOutputTokens')::bigint,-1)" in code, "usage output is bounded by actual own ticket")
    need("::bigint>(case when phase='D' then 3000 else 6000 end)" in code,
         "PLpgSQL IF comparison keeps CASE parenthesized")
    need("unique(scope_hash,kind)" in code and "primary key(scope_hash,owner_id,kind,logical_id)" in code, "artifact physical namespace")
    need("not(t is json object with unique keys)" in code, "recursive duplicate-key rejection")
    need("encode(sha256(convert_to(t,'UTF8')),'hex')" in code, "actual UTF8 hash")
    need("jsonb::text" not in code, "no reserialized hash")
    need("for update" in code.lower() and "revision=revision+1" in code, "locked versioned CAS")
    need("s.body_hash is distinct from p_old_hash" in code, "old-hash CAS")
    need("s.revision is distinct from p_old_revision" in code and "revision=p_old_revision" in code, "revision prevents ABA before mutation")
    need("returning * into strict s" in code, "persisted state ACK")
    need("or new.body is not distinct from old.body" in code, "logical state no-op rejected")
    need("helmut_unit_diagnostic.sha(nj->>'claimId'),'state',old.body_hash,old.revision" in code,
         "state mutation requires genuine original transaction receipt")
    need("helmut_unit_diagnostic.sha(j->>'claimId'),'usage',own_row.body_hash,own_row.revision" in code,
         "usage artifact requires genuine original transaction receipt")
    need(code.count("perform helmut_unit_diagnostic.original_bridge_receipt_v1(") == 2,
         "both original persistence hooks are present")
    need("local-unit-store-no-reopen-or-reclaim" in code and "local-unit-store-native-once-claim" in code, "claim lifecycle")
    need("local-unit-store-call-once" in code and "local-unit-store-native-deadline" in code, "phase lifecycle")
    need("local-unit-store-reserve-running-window" in code and "local-unit-store-send-running-window" in code, "no reserve/send after stop")
    need("local-unit-store-new-send-claim-exact-transition" in code, "no fabricated send claim on unknown call")
    need("jsonb_typeof(v) is distinct from 'string'" in code and "not isfinite(answer)" in code, "NULL/type/nonfinite timestamp rejection")
    need("perform helmut_unit_diagnostic.utc(j->'claimedAtUTC')" in code, "claim timestamp is mandatory")
    need("perform helmut_unit_diagnostic.utc(j#>'{inFlight,enteredAtUTC}')" in code, "entered timestamp is mandatory")
    need("perform helmut_unit_diagnostic.utc(j#>'{inFlight,deadlineAtUTC}')" in code, "deadline timestamp is mandatory")
    need(code.count("::timestamptz") == 1, "all JSON time casts use rejecting helper")
    need("local-unit-store-only-own-seven-keys" in code, "no legacy auth projection")
    need("local-unit-store-accounted-usage-artifact" in code and "local-unit-store-result-artifacts" in code, "native parent receipts")
    need("revoke execute on all routines in schema %I from public" in code, "deny old PUBLIC mutators in owned copy")
    need("create policy runtime_update on helmut_unit_diagnostic.state" in code, "state RLS")
    need("create policy runtime_insert on helmut_unit_diagnostic.artifacts" in code, "artifact RLS")
    need("enable row level security" in code, "RLS enabled")
    need("revoke all on function %s from public" in code, "no public EXECUTE")
    need("alter default privileges revoke execute on functions from public" in code, "global owner function defaults")
    need("p.proowner=(select oid from pg_roles where rolname=current_user)" in code
         and "p.proname like" not in code, "no prefix grants to copied hostile functions")
    need("rolname=session_user" in code and "login_role.rolsuper" in code, "actual connection principal")
    need("revoke all on all sequences" in code and "revoke create on schema" in code
         and "revoke create,temporary on database" in code, "no inherited PUBLIC mutation/shadowing")
    need("grant execute on function %s to %I" in code, "exact runtime role grant")
    need("runtime-observation-stale" in code and "interval '30 seconds'" in code, "fresh runtime witness")
    need("codeManifestHash" in code and "runtimeManifestHash" in code and "databaseOID" in code, "current runtime/code/database binding")
    need("local-unit-store-lease-successor-token" in code and "local-unit-store-lease-release-owner" in code, "native successor fencing")
    need("local-unit-store-qualified-read-identity" in code and "legacy_read_rpcs q where q.function_oid=p.oid" in code, "qualified readonly OIDs only")
    need("local-unit-store-auth30" in code and "local-unit-store-final-verification" in code and "local-unit-store-sixteen-controls" in code, "native Auth30/control receipt binding")
    need(len(re.findall(r"enable always trigger", code, re.I)) == 12, "all twelve native guards enabled")
    found = re.findall(r"create function public\.local_unit_diagnostic_(\w+)_v1\(([^)]*)\)", code)
    need(dict(found) == RPCS, "exact closed RPC ABI; no runtime installer")
    insert = code.split("create function public.local_unit_diagnostic_artifact_insert_v1", 1)[1].split("create function public.", 1)[0]
    need("insert into helmut_unit_diagnostic.artifacts" in insert and "returning * into strict row_saved" in insert, "actual INSERT ACK")
    need(not re.search(r"\bon\s+conflict\b|\bupsert\b", insert, re.I), "no conflict normalization")


class StaticStoreContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SQL.read_text(encoding="utf-8")

    def test_static_owned_contract(self):
        audit(self.source)

    def test_negative_security_boundaries(self):
        mutations = [
            ("local-unit-store-lease-successor-token", "unchecked-lease-successor"),
            ("local-unit-store-qualified-read-identity", "unchecked-readonly-OID"),
            ("local-unit-store-final-verification", "unchecked-final-verification"),
            ("grant_id text not null unique", "grant_id text not null"),
            ("request_models jsonb not null", "request_models jsonb"),
            ("new.body->>'model' is distinct from a.request_models->>phase", "false"),
            ("total+reserved_total>169400", "false"),
            ("::bigint>(case when phase='D' then 3000 else 6000 end)", "::bigint>case when phase='D' then 3000 else 6000 end"),
            ("not(t is json object with unique keys)", "not(t is json object)"),
            ("s.body_hash is distinct from p_old_hash", "false"),
            ("s.revision is distinct from p_old_revision", "false"),
            ("returning * into strict s", "returning * into s"),
            ("or new.body is not distinct from old.body", "or false"),
            ("helmut_unit_diagnostic.sha(nj->>'claimId'),'state',old.body_hash,old.revision", "null,'state',null,null"),
            ("helmut_unit_diagnostic.sha(j->>'claimId'),'usage',own_row.body_hash,own_row.revision", "null,'usage',null,null"),
            ("perform helmut_unit_diagnostic.original_bridge_receipt_v1(", "perform helmut_unit_diagnostic.unchecked_receipt_v1("),
            ("local-unit-store-no-reopen-or-reclaim", "unchecked-reopen"),
            ("local-unit-store-native-deadline", "unchecked-time"),
            ("revoke execute on all routines in schema %I from public", "select 1"),
            ("revoke all on function %s from public", "select 1"),
            ("security invoker", "security definer"),
            ("enable row level security", "disable row level security"),
            ("create function public.local_unit_diagnostic_state_read_v1", "create function public.local_unit_diagnostic_runtime_install_v1"),
            ("p_old_hash text", "p_unchecked_old_hash text"),
            ("jsonb_typeof(v) is distinct from 'string'", "v is not null"),
            ("not isfinite(answer)", "false"),
            ("perform helmut_unit_diagnostic.utc(j->'claimedAtUTC');", ""),
            ("perform helmut_unit_diagnostic.utc(j#>'{inFlight,enteredAtUTC}');", ""),
            ("perform helmut_unit_diagnostic.utc(j#>'{inFlight,deadlineAtUTC}');", ""),
            ("local-unit-store-send-running-window", "unchecked-stopped-send"),
            ("local-unit-store-reserve-running-window", "unchecked-stopped-reserve"),
            ("local-unit-store-new-send-claim-exact-transition", "unchecked-unknown-claim"),
        ]
        for before, after in mutations:
            with self.subTest(before=before):
                self.assertIn(before, self.source)
                with self.assertRaises(ValueError):
                    audit(self.source.replace(before, after))

    def test_no_legacy_write_or_runtime_installer(self):
        for addition in ("\nupdate public.helmut_store set data='{}';", "\ninsert into public.briefings values (null);",
                         "\ncreate function public.local_unit_diagnostic_install_v1() returns void language sql as $$select 1$$;"):
            with self.subTest(addition=addition):
                with self.assertRaises(ValueError):
                    audit(self.source.replace("reset role;\ncommit;", addition + "\nreset role;\ncommit;"))

    def test_outer_lexical_damage_rejected(self):
        for damage in ("'unterminated", "$unclosed$", "(", ")"):
            with self.subTest(damage=damage), self.assertRaises(ValueError):
                delimiters(damage)

    def test_private_js_consumers_reject_unminted_json(self):
        root = Path(__file__).resolve().parents[2]
        script = r"""
const assert = require('node:assert/strict');
const S = require('./lib/helmut/local-unit-diagnostic-store');
const selector = { operationId: 'localUnitDiagnostic-' + 'a'.repeat(32), commandHash: 'b'.repeat(64) };
for (const counterfeit of [{}, { qualified: true }, JSON.parse('{"native":true,"authority":true}')]) {
  assert.throws(() => S.consumeAuthority(counterfeit, selector), /private-authority-proof/);
  assert.throws(() => S.consumeRuntime(counterfeit, selector, {}), /private-runtime-proof/);
  assert.throws(() => S.consumeTransportOriginals(counterfeit, selector, {}), /private-original-transport-proof/);
  assert.equal(S.readUsageReceipt(counterfeit, {}), null);
  assert.equal(S.usagePersisted({}, counterfeit, {}), false);
}
assert.equal(S.rpc, undefined);
assert.equal(S.install, undefined);
assert.equal(S.bindTransport, undefined);
assert.equal(S.mintReceipt, undefined);
assert.throws(() => S.denyLegacyWrite(), /legacy-write-forbidden/);
(async () => {
  await assert.rejects(S.readState({ operationId: 'old500', commandHash: 'b'.repeat(64) }), /selector/);
  await assert.rejects(S.readRuntime(selector), /native-admission-not-consumed/);
  await assert.rejects(S.readTransportOriginals(selector), /native-admission-not-consumed/);
})().catch(() => { process.exitCode = 1; });
"""
        result = subprocess.run(["node", "-e", script], cwd=root, capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, "pure JS counterfeit-capability checks failed")

    def test_only_known_two_gib_postrun_uses_streaming_exception(self):
        root = Path(__file__).resolve().parents[2]
        source = (root / "lib/helmut/local-unit-diagnostic-store.js").read_text()
        self.assertIn("const POSTRUN_BYTES = 2147483648;", source)
        self.assertIn('const POSTRUN_SHA256 = "54df2ecc0e4fdc22adf75f2ce3491d3c921e38296510543dcdadd48db3f37693";', source)
        self.assertIn("bytes === false && p?.bytes === POSTRUN_BYTES && p?.sha256 === POSTRUN_SHA256", source)
        self.assertIn('path.basename(p.path) === "image.raw"', source)
        self.assertIn("Buffer.alloc(Math.min(p.bytes, 1024 * 1024))", source)
        self.assertIn("if (bytes) blocks.push", source)
        self.assertIn("readPin(command.target.postrunPin, { privateFile: true, originalPostrun: true })", source)
        self.assertEqual(source.count("originalPostrun: true"), 1)
        self.assertIn("pin(p, originalPostrun ? POSTRUN_BYTES : bytes ? cap : 1024 ** 3)", source)

    def test_usage_keeps_actual_transport_model_before_native_io(self):
        # Isolated synthetic module dependencies test the consumer boundary;
        # this does not mint a genuine Scope/Transport or a persisted receipt.
        root = Path(__file__).resolve().parents[2]
        script = r"""
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const filename = require.resolve('./lib/helmut/local-unit-diagnostic-store');
const selector = { operationId: 'localUnitDiagnostic-' + 'a'.repeat(32), commandHash: 'b'.repeat(64) };
const ticket = { id: 'synthetic-ticket', maxOutputTokens: 3000, execution: { commandHash: selector.commandHash },
  admission: { phase: 'D', intentId: 'd', planHash: 'c'.repeat(64), actualRequestHash: 'd'.repeat(64), runId: 'synthetic-run' } };
const scope = { currentVerified: () => ({ selection: selector, command: { units: [{ subject: 'synthetic-owner' }] } }),
  assertTicket: value => assert.equal(value, ticket) };
const transport = { assertTicket: scope.assertTicket, model: () => 'gpt-5-mini-eu' };
const isolated = { exports: {} };
const localRequire = name => name.endsWith('/local-unit-diagnostic-scope.js') || name === './local-unit-diagnostic-scope' ? scope
  : name === './local-unit-diagnostic-transport' ? transport
  : name === './synthetik-500-profile' ? require('./lib/helmut/synthetik-500-profile')
  : name === 'node:fs' ? { ...fs, existsSync: () => true } : require(name);
vm.runInNewContext('(function(require,module,exports,__filename,__dirname){' + fs.readFileSync(filename, 'utf8') + '\n})',
  { Buffer, structuredClone, URL, process: { env: {} }, setTimeout, clearTimeout })(
  localRequire, isolated, isolated.exports, filename, require('node:path').dirname(filename));
const entry = { model: 'gpt-5-mini-eu', politicianId: 'synthetic-owner', runId: 'synthetic-run',
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }, success: true };
(async () => {
  await assert.rejects(isolated.exports.recordUsage({ ...entry, model: 'gpt-5-mini' }, ticket), /usage-original-metadata/);
  for (const usage of [undefined, null, { input_tokens: null, output_tokens: 1 },
    { input_tokens: 1, output_tokens: null }, { input_tokens: '1', output_tokens: 1 },
    { input_tokens: 1, output_tokens: 1, total_tokens: null }, { input_tokens: 1, output_tokens: 1, total_tokens: 3 }])
    await assert.rejects(isolated.exports.recordUsage({ ...entry, usage, promptTokens: 1, completionTokens: 1 }, ticket), /actual-usage-unavailable/);
  // Exact model survives unchanged to the deliberately absent native target.
  await assert.rejects(isolated.exports.recordUsage(entry, ticket), /owned-local-target/);
  await assert.rejects(isolated.exports.recordUsage({ ...entry, usage: { input_tokens: 0, output_tokens: 0 } }, ticket), /owned-local-target/);
  await assert.rejects(isolated.exports.recordUsage({ ...entry, usage: { input_tokens: 272000, output_tokens: 3001 } }, ticket), /actual-usage-unavailable/);
  ticket.admission.phase = 'R'; ticket.maxOutputTokens = 6000;
  await assert.rejects(isolated.exports.recordUsage({ ...entry, usage: { input_tokens: 272000, output_tokens: 6000 } }, ticket), /owned-local-target/);
  await assert.rejects(isolated.exports.recordUsage({ ...entry, usage: { input_tokens: 272000, output_tokens: 6001 } }, ticket), /actual-usage-unavailable/);
  ticket.maxOutputTokens = 3000;
  await assert.rejects(isolated.exports.recordUsage(entry, ticket), /actual-usage-unavailable/);
})().catch(() => { process.exitCode = 1; });
"""
        result = subprocess.run(["node", "-e", script], cwd=root, capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, "isolated actual-model consumer boundary failed")

    def test_absent_root_owned_endpoint_still_blocks_every_request(self):
        root = Path(__file__).resolve().parents[2]
        script = r"""
const assert = require('node:assert/strict'), http = require('node:http');
let transportCalls = 0;
http.request = () => { transportCalls++; throw Error('synthetic-negative-must-not-send'); };
const S = require('./lib/helmut/local-unit-diagnostic-store');
process.env.HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE = 'helmut_unit_diagnostic_' + 'a'.repeat(32);
process.env.HELMUT_STORAGE_BACKEND = 'supabase'; process.env.SUPABASE_URL = 'http://127.0.0.1:1/';
// Explicit synthetic negative only: the value must never reach any transport.
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-negative-never-sent'; delete process.env.VERCEL;
(async () => {
  await assert.rejects(S.readState({ operationId: 'localUnitDiagnostic-' + 'a'.repeat(32), commandHash: 'b'.repeat(64) }),
    /local-unit-diagnostic-endpoint-(unprivileged-client-required|readonly-trust-mount|root-directory)/);
  assert.equal(transportCalls, 0);
})().catch(() => { process.exitCode = 1; });
"""
        result = subprocess.run(["node", "-e", script], cwd=root, capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, "missing endpoint attestation must prevent every request")

    def test_private_pin_reader_rejects_fifo_and_changed_named_inode(self):
        root = Path(__file__).resolve().parents[2]
        script = r"""
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const path = require('node:path'), crypto = require('node:crypto'), createRequire = require('node:module').createRequire;
const filename = require.resolve('./lib/helmut/local-unit-diagnostic-store'), nativeRequire = createRequire(filename);
const dir = process.argv[1], regular = path.join(dir, 'regular'), fifo = path.join(dir, 'fifo');
function isolated(io) {
  const module = { exports: {} };
  vm.runInNewContext('(function(require,module,exports,__filename,__dirname){' + fs.readFileSync(filename, 'utf8')
    + '\nmodule.exports = readPin;\n})', { Buffer, structuredClone, URL, process, setTimeout, clearTimeout })(
    name => name === 'node:fs' ? io : nativeRequire(name), module, module.exports, filename, path.dirname(filename));
  return module.exports;
}
const bytes = Buffer.from('synthetic-pin-only'), hash = crypto.createHash('sha256').update(bytes).digest('hex');
assert.throws(() => isolated(fs)({ path: fifo, bytes: bytes.length, sha256: hash }), /named-file-not-regular|original-file-metadata/);
fs.writeFileSync(regular, bytes, { mode: 0o600 });
let stats = 0;
const swapped = { ...fs, fstatSync(...args) {
  const result = fs.fstatSync(...args);
  if (++stats === 2) {
    fs.renameSync(regular, path.join(dir, 'detached'));
    fs.writeFileSync(regular, bytes, { mode: 0o600 });
  }
  return result;
} };
assert.throws(() => isolated(swapped)({ path: regular, bytes: bytes.length, sha256: hash }), /actual-file-drift/);
assert.equal(stats, 2);
"""
        with tempfile.TemporaryDirectory(prefix="helmut-native-pin-negative-") as tmp:
            import os
            os.mkfifo(Path(tmp) / "fifo", 0o600)
            result = subprocess.run(["node", "-e", script, tmp], cwd=root, capture_output=True, text=True, timeout=3)
            self.assertEqual(result.returncode, 0, "isolated pin reader must reject FIFO and named-file replacement")


if __name__ == "__main__":
    unittest.main()
