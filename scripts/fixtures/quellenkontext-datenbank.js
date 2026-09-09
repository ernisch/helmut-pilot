"use strict";
// Nur der vorhandene lokale PostgreSQL/PostgREST Pflichtnachweis ruft dies auf.
const assert = require("node:assert/strict");
const { casQuery, plannedAfter } = require("../github-quellenkontext-500");
function bereiteVor({ psql }) {
  psql("create table public.raw_documents(id text primary key, summary text, raw jsonb, url text, canonical_url text, title text, published_at timestamptz, content_hash text); grant select,insert,update on public.raw_documents to service_role;");
}
async function pruefe({ base, token }) {
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const request = async (suffix, method = "GET", body) => {
    const r = await fetch(base + "/rest/v1/raw_documents" + suffix, { method, redirect: "error",
      signal: AbortSignal.timeout(5000), headers: { apikey: token, Authorization: `Bearer ${token}`,
        "Content-Type": "application/json", Prefer: "return=representation" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert([200, 201].includes(r.status), "lokaler Quellenrequest nicht bestaetigt");
    return r.json();
  };
  const make = id => ({ id, summary: null, raw: { sourcePriority: 5, nested: { erhalten: "ä & ," } },
    url: "https://example.org/artikel?q=a,b", canonical_url: "https://example.org/artikel?q=a,b",
    title: 'Parlament beraet "Pflege, vor Ort"', published_at: "2026-09-10T21:00:00Z", content_hash: "fixture" });
  await request("", "POST", [make("rd-quelle-eins"), make("rd-quelle-zwei")]);
  const before = (await request("?id=eq.rd-quelle-eins"))[0];
  const after = plannedAfter(before, { ok: true, summary: "Der Ausschuss hoert am Dienstag Fachleute zur Finanzierung der Beratungsstellen an.", origin: "artikel-metadaten" }, { tag: "2026-09-10" });
  const body = { summary: after.summary, raw: after.raw };
  const first = await request("?" + casQuery(before), "PATCH", body);
  assert.deepEqual(first, [after]);
  assert.deepEqual(await request("?id=eq.rd-quelle-eins"), [after]);
  assert.deepEqual(await request("?" + casQuery(before), "PATCH", body), []);
  console.log("PASS  echte PostgREST JSONB CAS Ergaenzung, exakte Ruecklesung und Ablehnung alter Writes");

  const stale = (await request("?id=eq.rd-quelle-zwei"))[0];
  await request("?id=eq.rd-quelle-zwei", "PATCH", { title: "Zwischenzeitlich geaenderte Artikelidentitaet" });
  assert.deepEqual(await request("?" + casQuery(stale), "PATCH", body), []);
  const preserved = (await request("?id=eq.rd-quelle-zwei"))[0];
  assert.equal(preserved.summary, null); assert.deepEqual(preserved.raw, stale.raw);
  console.log("PASS  konkurrierende Artikelidentitaet verhindert Quellenueberschreibung");
}
module.exports = { bereiteVor, pruefe };
