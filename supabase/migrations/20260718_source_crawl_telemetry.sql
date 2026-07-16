-- Helmut — P0-1 · Pro-Quellenabruf-Laufzeit-Telemetrie (Beobachtbarkeit)
-- ==============================================================================
-- Persistiert je EINZELNEM Quellenabruf eines Crawl-/Lage-Laufs eine Zeile mit
-- technischen Betriebsmetadaten (Laufkennung, Quelle, Ebene, Ausfuehrungsort,
-- geplanter/Folgeprozess, Start/Ende/Dauer, Status, gefundene/neue/doppelte/
-- ignorierte Dokumente, Fehlercode, Wiederholung, Quellenmodus). Grund: der
-- Audit (§8) belegt, dass HEUTE KEINE Pro-Quelle-Laufzeit persistiert wird —
-- fuer den ueberwachten Bundestagspiloten der groesste Beobachtbarkeits-Mangel.
--
-- WARUM RELATIONAL (nicht im Blob): der 1,24-MB-Monolith-Blob laeuft bereits in
-- 10-s-Timeouts (Audit R1). ~145 Zeilen je Lauf x 3 Laeufe/Tag gehoeren NICHT in
-- den Blob, sondern in eine dedizierte, indizierte Tabelle.
--
-- DSGVO / Datensparsamkeit (verbindliches Abnahmekriterium):
--   * NUR technische Metadaten. KEINE Dokumentinhalte, Titel, Volltexte,
--     Briefingtexte, Prompts, Namen, E-Mail, Telefon.
--   * Quellennamen sind oeffentliche Organisationsnamen (Ministerien/Medien/
--     Fraktionen) — keine personenbezogenen Kontaktdaten.
--   * Fehler werden als KLASSIFIZIERTER Code gespeichert (timeout/http-5xx/dns…),
--     der rohe Fehlertext (koennte eine aufgeloeste Publisher-URL enthalten) wird
--     im App-Code (source-telemetry.classifyCrawlError) verworfen.
--   * Aufbewahrung: technische Betriebstelemetrie, empfohlen 90 Tage
--     (siehe docs/helmut_datenschutz_technische_massnahmen.md, Datenklassen-Matrix).
--
-- FREIGABEPFLICHTIG: NICHT automatisch angewendet. Der App-Write ist zusaetzlich
-- per Flag HELMUT_SOURCE_TELEMETRY (Default AUS) gesperrt — ohne Migration UND
-- ohne Flag ist die Telemetrie ein reiner No-Op (kein Production-Daten-Write).
-- Rollback: 20260718_source_crawl_telemetry_rollback.sql. Idempotent: mehrfaches
-- Einspielen ist harmlos (CREATE TABLE/INDEX IF NOT EXISTS nehmen keine Sperren
-- auf bestehende App-Tabellen; erwartete Dauer < 1 s; keine Nutzerwirkung).

begin;

create table if not exists public.source_crawl_telemetry (
  id                  bigint generated always as identity primary key,
  created_at          timestamptz not null default now(),
  run_id              text,        -- stabile Laufkennung (korreliert mit crawlRun/processRun)
  source_id           text,        -- Quellenkennung
  source_name         text,        -- oeffentlicher Organisationsname (keine PII)
  source_category     text,        -- profil | offiziell | partei_fraktion | medien | regional
  political_level     text,        -- bund | land | kommune | eu | international | unknown (klein, P1-2-Kanon)
  execution_location  text,        -- Vercel-Region o. ae. (technisch, nie PII)
  planned_process     text,        -- full | lage-check | pipeline (geplanter Prozess)
  started_at          timestamptz, -- Beginn des einzelnen Quellenabrufs
  finished_at         timestamptz, -- Ende des einzelnen Quellenabrufs
  duration_ms         integer,     -- echte Wall-Clock-Dauer (keine Schaetzung)
  status              text,        -- ok | empty | error
  found_documents     integer,     -- von dieser Quelle roh eingesammelt
  new_documents       integer,     -- tatsaechlich NEU persistiert (ueber item.sourceId zugeordnet)
  duplicate_documents integer,     -- in-Lauf-Dubletten verworfen (exakt)
  ignored_documents   integer,     -- vom Kandidaten-Cap verworfen (exakt)
  error_code          text,        -- klassifiziert: timeout|http-4xx|http-5xx|dns|… (KEIN Rohtext)
  retry_count         integer,     -- Wiederholungsnummer des Abrufs (0 = keine)
  follow_up_process   text,        -- understanding | none
  source_mode         text         -- on | shadow | off (relational vs. Fallback dieses Laufs)
);

create index if not exists idx_source_crawl_telemetry_created on public.source_crawl_telemetry(created_at);
create index if not exists idx_source_crawl_telemetry_run on public.source_crawl_telemetry(run_id);
create index if not exists idx_source_crawl_telemetry_source on public.source_crawl_telemetry(source_id);
create index if not exists idx_source_crawl_telemetry_status on public.source_crawl_telemetry(status);

comment on table public.source_crawl_telemetry is
  'P0-1 Pro-Quellenabruf-Betriebstelemetrie (Beobachtbarkeit). NUR technische Metadaten/Zaehler — kein Volltext/PII. App-Write freigabepflichtig (HELMUT_SOURCE_TELEMETRY, Default aus). Empfohlene Aufbewahrung 90 Tage.';

-- Zugriff: NUR service_role (wie alle Backend-/Cron-Pfade). Explizit entziehen.
revoke all on table public.source_crawl_telemetry from public, anon, authenticated;

-- RLS: intern, service_role-only (konsistent mit gate_shadow_events/document_findings).
-- BEWUSST KEINE Policies — service_role umgeht RLS, alle anderen Rollen sehen nichts.
do $$
begin
  execute 'alter table public.source_crawl_telemetry enable row level security';
end $$;

commit;
