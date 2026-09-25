"use strict";
// Ausschliesslich vom bereits lokal gebundenen PostgreSQL Pflichtnachweis.
// Eigene kurzlebige Datenbank; kein Importprogramm und keine echten Quellen.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const template = fs.readFileSync(path.join(__dirname, "quellenimport-vorbereitung.sql"), "utf8");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");

function pruefe({ psql, anzahl = 31, sqlTemplate = template, rueckweg = null }) {
  assert.ok([30, 31].includes(anzahl));
  const db = `helmut_test_quellenimport_${crypto.randomBytes(6).toString("hex")}`;
  const q = sql => psql(sql, db);
  let passed = 0;
  function test(name, fn) { fn(); passed++; console.log("PASS  " + name); }
  const now = new Date(Date.now() - 1000).toISOString();
  const rows = Array.from({ length: anzahl }, (_, i) => ({
    id: `fixture-31-${i}`, canonical_url: `https://example.org/quelle/${i}`,
    canonical_target_url: `https://example.org/quelle/${i}`, url: `https://example.org/quelle/${i}`,
    title: `Synthetischer Bericht ${i}`, summary: "Der Rat beraet einen Antrag. Eine Entscheidung steht noch aus.",
    source_id: "fixture-feed", source_name: "Synthetische Redaktion", source_type: "media",
    confidence: "medium", link_type: "direct", published_at: now, retrieved_at: now,
    content_fingerprint: hash(`fixture-${i}`), publisher_id: "fixture-publisher", finding_count: 1
  }));
  const input = { rows, findings: rows.map(r => ({ raw_document_id: r.id, source_id: r.source_id,
    retrieval_path_id: null, original_url: r.url, link_type: "direct", found_at: now })) };
  function sql(value = input) {
    const payload = JSON.stringify(value);
    assert(!payload.includes("$eingabe$"));
    return sqlTemplate.replace("__PAYLOAD__", payload).replace("__SHA256__", hash(payload));
  }
  function rejected(statement, reason) {
    assert.throws(() => q(statement), error => String(error.stderr).includes(reason), reason);
  }
  const counts = () => q("select (select count(*) from raw_documents)||'|'||(select count(*) from document_findings)");
  const protectedHash = () => q(`select encode(sha256(convert_to(jsonb_build_object(
    'p',(select jsonb_agg(to_jsonb(p) order by user_id) from mandate_profiles p),
    'i',(select jsonb_agg(to_jsonb(p) order by id) from profiles p),
    's',(select jsonb_agg(to_jsonb(p) order by id) from helmut_store p))::text,'UTF8')),'hex')`);
  psql(`create database ${db}`, "postgres");
  try {
    q(`create table raw_documents(id text primary key, canonical_url text, content_hash text,
      cluster_id text, title text, summary text, url text, source_name text, source_id text,
      source_type text, confidence text, link_type text, published_at timestamptz,
      retrieved_at timestamptz, document_type text, wahlperiode text,
      raw jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
      content_fingerprint text, publisher_id text, canonical_target_url text,
      finding_count integer not null default 1);
      create table document_findings(raw_document_id text not null references raw_documents(id) on delete cascade,
        source_id text not null, retrieval_path_id text, original_url text not null default '',
        link_type text, found_at timestamptz, created_at timestamptz not null default now(),
        primary key(raw_document_id,source_id,original_url));
      create table ko_document_links(raw_document_id text references raw_documents(id));
      create table mandate_profiles(user_id text primary key,aktiv boolean not null);
      insert into mandate_profiles select 'fixture-profil-'||i,false from generate_series(1,504) i;
      create table profiles(id text primary key);
      insert into profiles select 'fixture-identitaet-'||i from generate_series(1,505) i;
      create table helmut_store(id text primary key,data jsonb);
      insert into helmut_store values('main','{"erhalten":true}'),('main-auth','{"users":[],"sessions":[],"erhalten":true}');
      create table pipeline_locks(expires_at timestamptz);
      create table helmut_jobs(status text,lease_expires_at timestamptz);
      create table process_runs(finished_at timestamptz,started_at timestamptz);`);
    const before = protectedHash();
    test(`${anzahl} Quellen und Fundstellen werden atomar mit exakter Ruecklesung angelegt`, () => {
      q(sql()); assert.equal(counts(), `${anzahl}|${anzahl}`); assert.equal(protectedHash(), before);
    });
    test("Wiederholung und damit unbekannter vorheriger Ausgang erlauben keine zweite Anlage", () => {
      rejected(sql(), "quellenimport-bestandstreffer"); assert.equal(counts(), `${anzahl}|${anzahl}`);
    });
    if (rueckweg) {
      const back = rueckweg(JSON.stringify(input));
      test("30er Rueckweg verweigert nachtraegliche fachliche Verknuepfung", () => {
        q("insert into ko_document_links values('fixture-31-0')");
        rejected(back, "frische30-rueckweg-nicht-frei");
        assert.equal(counts(), "30|30"); q("delete from ko_document_links");
      });
      test("30er Rueckweg verweigert veraenderten Dokumentinhalt", () => {
        q("update raw_documents set cluster_id='spaetere-verarbeitung' where id='fixture-31-0'");
        rejected(back, "frische30-rueckweg-dokument-veraendert");
        assert.equal(counts(), "30|30"); q("update raw_documents set cluster_id=null");
      });
      test("30er Rueckweg entfernt nur die unveraenderte Neuanlage samt Fundstellen", () => {
        q(back); assert.equal(counts(), "0|0"); assert.equal(protectedHash(), before);
        rejected(back, "frische30-rueckweg-nicht-frei"); q(sql());
      });
    }
    q("truncate ko_document_links,document_findings,raw_documents");
    test("Andere Eingabe mit altem Hash wird vor jedem Schreiben abgewiesen", () => {
      rejected(sql().replace("Synthetischer Bericht 0", "Veraenderter Bericht"), "quellenimport-eingabehash");
      assert.equal(counts(), "0|0");
    });
    test("Aktive Profile und laufende Arbeit sperren den Import", () => {
      const cases = [
        ["update mandate_profiles set aktiv=true where user_id='fixture-profil-1'", "update mandate_profiles set aktiv=false"],
        ["insert into pipeline_locks values(now()+interval '1 minute')", "truncate pipeline_locks"],
        ["insert into helmut_jobs values('erledigt',now()+interval '1 minute')", "truncate helmut_jobs"],
        ["insert into helmut_jobs values('offen',null)", "truncate helmut_jobs"],
        ["insert into process_runs values(null,now())", "truncate process_runs"]
      ];
      for (const [setup, cleanup] of cases) {
        q(setup); rejected(sql(), "quellenimport-nicht-ruhend"); assert.equal(counts(), "0|0"); q(cleanup);
      }
    });
    test("Veraltete und zukuenftige Quellen werden nicht importiert", () => {
      for (const offset of [-49 * 3600000, 3600000]) {
        const date = new Date(Date.now() + offset).toISOString();
        for (const field of ["published_at", "retrieved_at"]) {
          const changed = structuredClone(input); changed.rows[0][field] = date;
          rejected(sql(changed), "quellenimport-nicht-frisch"); assert.equal(counts(), "0|0");
        }
      }
    });
    test("Fehler im Fundstellenstapel rollt auch alle zuvor angelegten Quellen zurueck", () => {
      q(`create function fixture_fundfehler() returns trigger language plpgsql as $$begin
        if new.raw_document_id='fixture-31-15' then raise exception 'fixture-mitten-im-stapel'; end if;
        return new; end$$;
        create trigger fixture_fundfehler before insert on document_findings for each row execute function fixture_fundfehler();`);
      rejected(sql(), "fixture-mitten-im-stapel"); assert.equal(counts(), "0|0");
      q("drop trigger fixture_fundfehler on document_findings");
    });
    test("Veraenderter Quelleninhalt wird durch die persistierte Ruecklesung erkannt", () => {
      q(`create function fixture_textfehler() returns trigger language plpgsql as $$begin new.summary='Unbelegter Ersatz.'; return new; end$$;
        create trigger fixture_textfehler before insert on raw_documents for each row execute function fixture_textfehler();`);
      rejected(sql(), "quellenimport-ruecklesung"); assert.equal(counts(), "0|0");
      q("drop trigger fixture_textfehler on raw_documents");
    });
    test("Unerwartete Profilmutation rollt Import und Fremdwirkung gemeinsam zurueck", () => {
      q(`create function fixture_fremdfehler() returns trigger language plpgsql as $$begin
        update mandate_profiles set aktiv=true where user_id='fixture-profil-1'; return new; end$$;
        create trigger fixture_fremdfehler before insert on raw_documents for each row execute function fixture_fremdfehler();`);
      rejected(sql(), "quellenimport-fremde-wirkung"); assert.equal(counts(), "0|0");
      assert.equal(protectedHash(), before);
    });
    return passed;
  } finally { psql(`drop database ${db} with (force)`, "postgres"); }
}

module.exports = { pruefe };
