"use strict";

// Erweiterung des vorhandenen lokalen PG17-/PostgREST-Pflichtnachweises.
// Keine eigene Datenbank/kein Dienst hier: der Kontoschutz-Harness stellt beides.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const DIR = path.join(__dirname, "../../supabase/migrations");
const migration = fs.readFileSync(path.join(DIR, "20261109173143_raw_document_cas.sql"), "utf8");
const rollback = fs.readFileSync(path.join(DIR, "rollback_20261109173143_raw_document_cas.sql"), "utf8");
const EXPECTED = ["url", "canonical_url", "title", "source_id", "source_name", "published_at", "retrieved_at", "summary", "raw"];
function bereiteVor({ psql }) {
  psql(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  end $$;`);
  psql(migration);
}
async function pruefe({ psql, base, token }) {
  assert.equal(new URL(base).hostname, "127.0.0.1");
  let count = 0;
  const pass = name => { count++; console.log("PASS  raw-document-cas: " + name); };
  const request = async (suffix, method = "GET", body) => {
    const r = await fetch(base + "/rest/v1/" + suffix, { method, redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { apikey: token, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await r.text();
    return { status: r.status, data: text ? JSON.parse(text) : null };
  };
  const expected = row => Object.fromEntries(EXPECTED.map(k => [k, row[k] ?? null]));
  const rpc = (row, next, before = expected(row)) => request("rpc/helmut_raw_document_cas", "POST",
    { p_id: row.id, p_expected: before, p_next: next });
  const read = async id => {
    const r = await request("raw_documents?id=eq." + encodeURIComponent(id));
    assert.equal(r.status, 200); assert.equal(r.data.length, 1); return r.data[0];
  };
  const make = id => ({ id, url: "https://example.invalid/quelle?x=a,b", canonical_url: "https://example.invalid/quelle?x=a,b",
    title: 'Synthetischer Artikel "Arbeit, Pflege"', source_id: "synthetischer-weg", source_name: "Synthetischer Herausgeber",
    published_at: "2026-11-09T01:00:00Z", retrieved_at: "2026-11-09T02:00:00Z",
    summary: "Unveraenderter alter Originaltext. ".repeat(700), raw: { verschachtelt: { erhalten: "ä &,\"{}" }, prioritaet: 3 } });
  const id = "rd-cas-grosser-vorwert", id2 = "rd-cas-nebenlaeufig";
  assert.equal((await request("raw_documents", "POST", [make(id), make(id2)])).status, 201);
  let before = await read(id);
  assert(Buffer.byteLength(JSON.stringify(expected(before))) > 16384);
  const next = "Zusammenhaengender neuer belegter Originaltext. ".repeat(900);
  const changed = await rpc(before, { summary: next, retrieved_at: "2026-11-09T03:00:00Z" });
  assert.equal(changed.status, 200); assert.deepEqual(changed.data, [{ id, uebernommen: true }]);
  let after = await read(id);
  assert.equal(after.summary, next); assert.equal(Date.parse(after.retrieved_at), Date.parse("2026-11-09T03:00:00Z"));
  assert.deepEqual(expected(after), { ...expected(before), summary: next, retrieved_at: after.retrieved_at });
  pass("grosser Vor-/Nachtext im POST, alle Herkunftsfelder unveraendert");

  const stale = await rpc(before, { summary: "Veralteter Writer darf nichts aendern." });
  assert.equal(stale.status, 200); assert.deepEqual(stale.data, [{ id, uebernommen: false }]);
  assert.deepEqual(await read(id), after); pass("veralteter Vorwert abgewiesen ohne Mutation");

  for (const k of EXPECTED) {
    const wrong = expected(after);
    wrong[k] = k === "raw" ? { falsch: true } : k.endsWith("_at") ? "2026-11-08T01:00:00Z" : "abweichender-vorwert";
    const r = await rpc(after, { summary: "Fremder Vorwert darf nichts schreiben." }, wrong);
    assert.equal(r.status, 200); assert.deepEqual(r.data, [{ id, uebernommen: false }]);
  }
  assert.deepEqual(await read(id), after); pass("alle neun Identitaets-/Inhaltsvorwerte exakt gebunden");

  for (const nextValue of [{ summary: "Fremde Quelle", url: "https://fremd.invalid/" },
    { summary: "Kein Rohdatenwrite", raw: {} }, { summary: "Kein Publikationswrite", published_at: "2027-01-01T00:00:00Z" },
    { retrieved_at: "2026-11-09T04:00:00Z" }, { summary: "" }, { summary: null },
    { summary: "Kein Abrufzeit-Rueckgang", retrieved_at: "2026-11-09T01:00:00Z" }]) {
    assert.equal((await rpc(after, nextValue)).status, 400);
  }
  const incomplete = expected(after); delete incomplete.raw;
  assert.equal((await rpc(after, { summary: "Fehlender Vorwert" }, incomplete)).status, 400);
  assert.deepEqual(await read(id), after); pass("enge Schreiballowlist, Typen und Abrufzeit-Rueckgang gesperrt");

  const concurrent = await read(id2);
  const attempts = await Promise.all([rpc(concurrent, { summary: "Erster atomarer Writer." }),
    rpc(concurrent, { summary: "Zweiter atomarer Writer." })]);
  assert(attempts.every(r => r.status === 200));
  assert.deepEqual(attempts.map(r => r.data[0].uebernommen).sort(), [false, true]);
  const winner = await read(id2);
  assert(["Erster atomarer Writer.", "Zweiter atomarer Writer."].includes(winner.summary));
  pass("echte parallele PostgREST-Schreibversuche ergeben genau einen Gewinner");

  psql(`insert into public.raw_documents(id,summary,raw) values ('rd-cas-null',null,'{}');`);
  const nullable = await read("rd-cas-null");
  const nullResult = await rpc(nullable, { summary: "Erstmals vorhandener Originaltext bleibt erhalten." });
  assert.equal(nullResult.status, 200); assert.deepEqual(nullResult.data, [{ id: "rd-cas-null", uebernommen: true }]);
  pass("SQL-Nullvorwerte werden exakt behandelt");

  for (const role of ["anon", "authenticated"]) {
    assert.equal(psql(`select has_function_privilege('${role}','public.helmut_raw_document_cas(text,jsonb,jsonb)','EXECUTE')`), "f");
    assert.throws(() => psql(`set role ${role}; select * from public.helmut_raw_document_cas('x','{}','{}');`));
  }
  assert.equal(psql("select has_function_privilege('service_role','public.helmut_raw_document_cas(text,jsonb,jsonb)','EXECUTE')"), "t");
  assert.equal(psql("select prosecdef from pg_proc where oid='public.helmut_raw_document_cas(text,jsonb,jsonb)'::regprocedure"), "f");
  assert.match(psql("select proconfig::text from pg_proc where oid='public.helmut_raw_document_cas(text,jsonb,jsonb)'::regprocedure"), /search_path=pg_catalog, public/);
  pass("Browserrollen verweigert, service_role bestaetigt, kein SECURITY DEFINER");

  const rowsBefore = psql("select md5(string_agg(row_to_json(r)::text,'' order by id)) from public.raw_documents r");
  psql(rollback); psql(rollback);
  assert.equal(psql("select to_regprocedure('public.helmut_raw_document_cas(text,jsonb,jsonb)') is null"), "t");
  assert.equal(psql("select md5(string_agg(row_to_json(r)::text,'' order by id)) from public.raw_documents r"), rowsBefore);
  psql(migration); psql(migration);
  assert.equal(psql("select has_function_privilege('anon','public.helmut_raw_document_cas(text,jsonb,jsonb)','EXECUTE')"), "f");
  pass("Rollback entfernt nur RPC, Daten bleiben, Migration wiederholbar");
  console.log(`Raw-document-CAS PostgreSQL/PostgREST: ${count} PASS, 0 FAIL.`);
  return count;
}
module.exports = { bereiteVor, pruefe };
