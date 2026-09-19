"use strict";
// Nur der vorhandene lokale PostgreSQL/PostgREST Pflichtnachweis ruft dies auf.
const assert = require("node:assert/strict");
const { casQuery, plannedAfter } = require("../github-quellenkontext-500");
function bereiteVor({ psql }) {
  psql(`create table public.raw_documents(id text primary key, summary text, raw jsonb,
    url text, canonical_url text, title text, published_at timestamptz, content_hash text,
    source_name text, source_id text, source_type text, confidence text, link_type text,
    retrieved_at timestamptz, document_type text, wahlperiode integer, cluster_id text,
    content_fingerprint text, publisher_id text, canonical_target_url text, finding_count integer,
    created_at timestamptz default now());
    create table public.document_findings(raw_document_id text not null references public.raw_documents(id),
      source_id text not null, retrieval_path_id text, original_url text not null default '',
      link_type text, found_at timestamptz, created_at timestamptz default now(),
      primary key(raw_document_id,source_id,original_url));
    grant select,insert,update on public.raw_documents,public.document_findings to service_role;`);
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

  // Derselbe JSONB Pfad wie in allen Quellenlesern, gegen echtes PostgREST.
  const fragment = after.summary + " Anschliessend soll";
  await request("", "POST", { ...make("rd-quelle-satz"), summary: fragment, raw: after.raw });
  const selected = await request("?id=eq.rd-quelle-satz&select=id,title,summary,quellenauszug_beleg:raw->helmutQuellenkontext");
  assert.deepEqual(selected[0].quellenauszug_beleg, after.raw.helmutQuellenkontext);
  const used = require("../../lib/helmut/quellen-auszug").geleseneQuelle(selected[0]);
  assert.equal(used.summary, after.summary);
  assert.equal(Object.hasOwn(used, "quellenauszug_beleg"), false);
  assert.equal((await request("?id=eq.rd-quelle-satz"))[0].summary, fragment);
  console.log("PASS  echte JSONB Herkunftsprojektion und Satzpruefung ohne Datenkorrektur");

  const storage = require("../../lib/helmut/storage");
  const D = require("../../lib/helmut/dedup");
  const previousFlag = process.env.HELMUT_V3_STORE;
  process.env.HELMUT_V3_STORE = "on";
  try {
    const item = { title: "Ausschuss laedt zur Anhoerung", url: "https://example.org/anhoerung",
      content: "Der Ausschuss hoert am Dienstag Fachleute zur Finanzierung der Beratungsstellen an.",
      sourceId: "quelle-db", sourceName: "Amtliche Quelle", sourceType: "rss",
      linkType: "direct", confidence: "high", publishedAt: "2026-09-19T12:00:00Z" };
    const row = D.toRawDocumentRow(item);
    const globalResult = await storage.persistRawDocumentsDeduped([row]);
    assert.equal(globalResult.persisted, 1); assert.equal(globalResult.fundstellen, 1);
    const actual = (await request("?id=eq." + row.id))[0];
    for (const field of ["title", "summary", "url", "source_name", "source_id", "source_type", "link_type", "confidence"]) assert.equal(actual[field], row[field], field);
    console.log("PASS  globaler Quellenpfad speichert echten Kontext samt Metadaten in PostgreSQL");

    // Ausserhalb des 14 Tage Suchfensters: auch dann keinen bestaetigten
    // Artikelbeleg durch einen spaeteren oder leeren Feedtext ersetzen.
    await request("?id=eq." + row.id, "PATCH", { created_at: "2000-01-01T00:00:00Z", raw: after.raw });
    const protectedRow = (await request("?id=eq." + row.id))[0];
    for (const content of ["Ein spaeterer anderer Auszug.", ""]) {
      const result = await storage.persistRawDocumentsDeduped([D.toRawDocumentRow({ ...item, content })]);
      assert.equal(result.persisted, 0);
      assert.deepEqual(await request("?id=eq." + row.id), [protectedRow]);
    }
    console.log("PASS  ID Konflikt ausserhalb des Bestandsfensters erhaelt Auszug und Herkunft atomar");

    const sibling = { ...item, url: "https://example.org/warteschlange" };
    const siblingRow = D.toRawDocumentRow(sibling);
    const queued = await storage.persistiereRohdokumenteWarteschlange([sibling]);
    assert.equal(queued.ok, true); assert.deepEqual(queued.neuIds, [siblingRow.id]);
    const saved = (await request("?id=eq." + siblingRow.id))[0];
    for (const field of ["summary", "source_name", "source_type", "link_type", "confidence"]) assert.equal(saved[field], actual[field], field);
    console.log("PASS  Warteschlangenpfad bestaetigt denselben Quellenkontext gegen echtes PostgreSQL");
  } finally {
    if (previousFlag === undefined) delete process.env.HELMUT_V3_STORE;
    else process.env.HELMUT_V3_STORE = previousFlag;
  }
}
module.exports = { bereiteVor, pruefe };
