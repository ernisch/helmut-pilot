"use strict";
// Real, isolated PostgreSQL17 ABI check. Synthetic fixtures do not admit a
// Production operation. No provider call, profile activation or external data.
const assert = require("node:assert/strict"), crypto = require("node:crypto"), fs = require("node:fs"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const P = require("../lib/helmut/synthetik-500-profile"), N = require("../lib/helmut/synthetik-500-native-d-new"), C = require("../lib/helmut/synthetik-500-production-command");
const db = "helmut_native_d_" + crypto.randomBytes(8).toString("hex");
const container = process.env.HELMUT_SYNTHETIK500_PG_CONTAINER;
const literal = s => "'" + String(s).replace(/'/g, "''") + "'";
function sql(s, database = db) {
  assert.ok([db, "postgres"].includes(database));
  const args = ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-f", "-"];
  return execFileSync("docker", ["--host=unix:///var/run/docker.sock", "exec", "-i", container, "psql", ...args], {
    input: s, encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH, LANG: "C.UTF-8", PGCONNECT_TIMEOUT: "5", PGOPTIONS: "-c statement_timeout=15000 -c transaction_timeout=17000 -c lock_timeout=2000" }
  }).trim();
}
function main() {
  assert.equal(process.env.HELMUT_SYNTHETIK500_PG_ISOLIERT, "JA");
  assert.match(container || "", /^synthetik500-runtime-pg-[a-f0-9]{8,16}$/);
  const info = JSON.parse(execFileSync("docker", ["--host=unix:///var/run/docker.sock", "inspect", container], { encoding: "utf8", env: { PATH: process.env.PATH } }))[0];
  assert.equal(info.Config.Image, "postgres:17.6-bookworm"); assert.equal(info.HostConfig.NetworkMode, "none");
  assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
  assert.ok(info.Mounts.every(m => m.Type === "volume" && m.Destination === "/var/lib/postgresql/data"));
  assert.ok(Number(sql("show server_version_num;", "postgres")) >= 170000);
  sql(`create database ${db} template template0 lc_collate 'C' lc_ctype 'C';`, "postgres");
  let count = 0; const ok = label => { count++; console.log("PASS " + label); };
  try {
    sql(`do $$ begin
     if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin;end if;
     if not exists(select from pg_roles where rolname='anon') then create role anon nologin;end if;
     if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;
     end $$;create table public.helmut_store(id text primary key,data jsonb not null);grant usage on schema public to service_role;`);
    // Use precisely the installed dependency's public repository body, not an
    // invented historical installer or reconstructed private Production data.
    const runtime = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261001172619_synthetik500_end_runtime.sql"), "utf8");
    const compact = runtime.slice(runtime.indexOf("create function helmut_synthetik500_internal.json_compact"), runtime.indexOf("create function helmut_synthetik500_internal.pruefe"));
    sql("create schema helmut_synthetik500_internal;" + compact); sql(N.source());
    const contractHash = sql("select helmut_native_d_new_v1.fingerprint();"); assert.match(contractHash, /^[a-f0-9]{64}$/);
    const rpc = (name, args) => "set role service_role;select public." + name + "(" + args.map(literal).join(",") + ");";
    const contractCall = rpc(C.NATIVE_ABI.contract.name, [contractHash]);
    assert.deepEqual(JSON.parse(sql(contractCall)), { version: "helmut-synthetik500-immutable-D-storage/1", contractHash });
    for (const role of ["anon", "authenticated"]) assert.throws(() => sql(contractCall.replace("set role service_role", "set role " + role)), /permission denied/);
    assert.equal(sql("select has_table_privilege('service_role','helmut_native_d_new_v1.versions','INSERT');"), "f");
    assert.equal(sql("select has_schema_privilege('service_role','helmut_native_d_new_v1','USAGE');"), "f");
    ok("Exact public ABI + service-only access; no direct table or private-function access");
    const now = new Date(), day = now.toISOString().slice(0, 10), owner = "test-kohorte-synthetik-bt-001", id = "fixture-d";
    const output = { paragraphs: ["Vollständig synthetische SQL-Probe"] }, sources = [{ id: "fictional-source", text: "Keine echte Quelle" }];
    const entry = { id, user_id: owner, slot: "lage-pruefentwurf", generated_at: now.toISOString(), payload: { runId: "fixture-run", phase: "entwurf", auslieferbar: false, qualitaetBestanden: false, profilHash: P.hash("fixture-profile"), antwort: output, quellen: sources } };
    const usage = { id: "fixture-usage", success: true, runId: "fixture-run", politicianId: owner, createdAt: now.toISOString() };
    const intent = { id: "fixture-D", phase: "D", owner, inputVersionHash: P.hash("fixture-context"), actualRequestHash: P.hash("fixture-request"), maxOutputTokens: 3000 };
    const base = { version: "helmut-synthetik500-D-completion/1", planHash: P.hash("fixture-plan"), operationId: "fixture-operation", runId: "fixture-run", dIntentId: intent.id, dTicket: { id: "fixture-ticket", day }, owner, contextHash: intent.inputVersionHash, providerResponseHash: P.hash("synthetic-response"), providerTextHash: P.hash("synthetic-text"), outputHash: P.hash(output), sourceContext: { profileHash: entry.payload.profilHash, sourcesHash: P.hash(sources) }, usageReceipt: { id: usage.id, recordHash: P.hash(usage) }, costMicroUsd: 20, completedAtUTC: now.toISOString() };
    const completion = { ...base, completionHash: P.hash(base) }, slot = { planHash: base.planHash, plan: { operationId: base.operationId, runId: base.runId, startsAtUTC: new Date(now.getTime() - 1000).toISOString(), endsAtUTC: new Date(now.getTime() + 60000).toISOString(), intents: [intent] }, consumed: { [intent.id]: { ticketId: base.dTicket.id, day, actualRequestHash: intent.actualRequestHash } }, draftCompletions: { [intent.id]: completion } };
    const journal = { operationId: base.operationId, planHash: base.planHash, state: "running", claimId: "synthetic-claim", stopRequested: false, index: 0, units: [{ subject: owner }], inFlight: { index: 0, intentIds: [intent.id] }, attempts: { [intent.id]: { status: "accounted", ticketId: base.dTicket.id, day } } };
    const auth = { synthetik500KostenAdmission: slot, synthetik500DispatchJournal: { version: "helmut-synthetik500-dispatch-journal/1", activeOperationId: base.operationId, operations: { [base.operationId]: journal } }, testKostenTage: { [day]: { calls: { [base.dTicket.id]: { status: "abgerechnet", cost: 20, admission: { intentId: intent.id, planHash: base.planHash } } } } }, llmUsage: [usage] };
    const seed = value => sql("insert into public.helmut_store values('main-auth'," + literal(JSON.stringify(value)) + "::jsonb) on conflict(id) do update set data=excluded.data;"); seed(auth);
    const args = [owner, id, P.hash(entry), P.kanonisch(entry), P.kanonisch(base), P.kanonisch(output), P.kanonisch(sources), P.kanonisch(usage), contractHash];
    const store = () => rpc(C.NATIVE_ABI.store.name, args), read = () => rpc(C.NATIVE_ABI.read.name, [owner, id, P.hash(entry), contractHash]);
    assert.deepEqual(JSON.parse(sql(store())), { id, versionHash: P.hash(entry), contractHash });
    assert.deepEqual(JSON.parse(sql(read())), entry); assert.deepEqual(JSON.parse(sql(store())), { id, versionHash: P.hash(entry), contractHash });
    assert.equal(sql("select count(*) from helmut_native_d_new_v1.versions;"), "1");
    ok("Real append, exact owner/version readback and idempotent identical append");
    for (const mutate of [a => a.llmUsage.push(usage), a => a.testKostenTage[day].calls[base.dTicket.id].cost++, a => a.synthetik500DispatchJournal.operations[base.operationId].stopRequested = true, a => delete a.synthetik500KostenAdmission.draftCompletions[intent.id], a => a.synthetik500KostenAdmission.plan.intents[0].owner = "foreign"]) {
      const bad = structuredClone(auth); mutate(bad); seed(bad); assert.throws(() => sql(store()), /native-D-/); assert.equal(sql("select count(*) from helmut_native_d_new_v1.versions;"), "1");
    } seed(auth);
    ok("Persisted completion, accounted cost, unique usage, owner and live journal fail closed");
    const expectRejected = altered => { assert.throws(() => sql(rpc(C.NATIVE_ABI.store.name, altered)), /native-D-/); assert.equal(sql("select count(*) from helmut_native_d_new_v1.versions;"), "1"); };
    for (const index of [0, 2, 5, 6, 7, 8]) { const bad = [...args]; bad[index] = index === 0 ? "test-kohorte-synthetik-be-001" : [2, 8].includes(index) ? "a".repeat(64) : P.kanonisch({ wrong: true }); expectRejected(bad); }
    const noncanonical = [...args]; noncanonical[3] = JSON.stringify(entry); expectRejected(noncanonical);
    assert.throws(() => sql(rpc(C.NATIVE_ABI.read.name, ["test-kohorte-synthetik-be-001", id, P.hash(entry), contractHash])), /read-owner-window/);
    // Rebind an internally consistent new completion/version in this isolated
    // fixture: the already retained owner/id still cannot be replaced.
    const alternateOutput = { paragraphs: ["Anderer synthetischer Entwurf"] }, alternateEntry = structuredClone(entry), alternateAuth = structuredClone(auth), alternateBase = { ...base, outputHash: P.hash(alternateOutput) };
    alternateEntry.payload.antwort = alternateOutput; alternateAuth.synthetik500KostenAdmission.draftCompletions[intent.id] = { ...alternateBase, completionHash: P.hash(alternateBase) }; seed(alternateAuth);
    const conflicting = [...args]; conflicting[2] = P.hash(alternateEntry); conflicting[3] = P.kanonisch(alternateEntry); conflicting[4] = P.kanonisch(alternateBase); conflicting[5] = P.kanonisch(alternateOutput); expectRejected(conflicting); seed(auth);
    assert.deepEqual(JSON.parse(sql(read())), entry);
    ok("Wrong owner/hash/output/sources/usage/canonical bytes and consistent conflicting version rejected atomically");
    for (const statement of ["update helmut_native_d_new_v1.versions set owner='foreign';", "delete from helmut_native_d_new_v1.versions;", "truncate helmut_native_d_new_v1.versions;"]) assert.throws(() => sql(statement), /retained-version-mutation/);
    assert.throws(() => sql(N.rollback(contractHash)), /rollback-retained-evidence/);
    ok("UPDATE/DELETE/TRUNCATE and rollback cannot remove retained evidence");
    sql("alter function public.helmut_read_immutable_d_v1(text,text,text,text) set statement_timeout='10s';");
    assert.throws(() => sql(contractCall), /contract-drift/); assert.throws(() => sql(read()), /contract-drift/);
    ok("Actual function-catalog drift closes contract/read RPCs");
    // Separate empty installation verifies the safe rollback path; retained
    // fixture is removed only by dropping this disposable test schema/database.
    sql("drop function public.helmut_immutable_d_contract_v1(text);drop function public.helmut_store_immutable_d_v1(text,text,text,text,text,text,text,text,text);drop function public.helmut_read_immutable_d_v1(text,text,text,text);drop schema helmut_native_d_new_v1 cascade;");
    sql(N.source()); const emptyHash = sql("select helmut_native_d_new_v1.fingerprint();");
    assert.throws(() => sql(N.rollback("a".repeat(64))), /rollback-catalog-drift/);
    sql(N.rollback(emptyHash)); assert.equal(sql("select to_regnamespace('helmut_native_d_new_v1') is null;"), "t");
    assert.deepEqual(JSON.parse(sql("select data from public.helmut_store where id='main-auth';")), auth);
    ok("Fingerprint-bound empty rollback removes own objects and preserves complete Auth");
    console.log(`${count}/${count} echte isolierte PostgreSQL17-Gruppen; keine Production-/Zulassungsabnahme.`);
  } finally { sql(`drop database ${db};`, "postgres"); }
}
if (require.main === module) main();
module.exports = { main };
