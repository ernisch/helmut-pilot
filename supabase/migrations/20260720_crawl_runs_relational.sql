-- Helmut — P0-5 Stufe 2 (VORBEREITUNG) · Crawl-Läufe relational (Blob-Entlastung)
-- ==============================================================================
-- ZIEL (Audit R1/E3): die BETRIEBSdaten (Crawl-Läufe, Kosten, Locks, technische
-- Telemetrie) aus dem 1,24-MB-Monolith-Blob in relationale Tabellen ziehen, damit
-- der Blob schrumpft und die 10-s-Timeouts verschwinden. Diese Migration legt die
-- Zieltabelle fuer die Crawl-Läufe an (Locks: 20260719; LLM-Kosten: llm_budget_
-- counters/llm_usage; Prozess-Telemetrie: source_crawl_telemetry).
--
-- UEBERGANG (Dual-Write, siehe docs/betrieb/blob-relational-migration-plan.md):
--   Phase 1  nur Blob (heute)
--   Phase 2  Dual-Write (Blob + relational parallel) + Vergleichstest — HIER vorbereitet
--   Phase 3  Lesepfad auf relational umstellen
--   Phase 4  Blob-Key crawlRuns abschalten
-- Jede Phasen-Umschaltung ist ein eigener Freigabepunkt.
--
-- DSGVO: nur technische Betriebsmetadaten/Zähler + pseudonyme Mandatskennung —
-- KEINE Dokumentinhalte, keine Fehler-Rohtexte (nur error_count), keine PII.
--
-- FREIGABEPFLICHTIG: NICHT automatisch angewendet. Der Dual-Write ist zusätzlich
-- per Flag HELMUT_CRAWL_RUNS_RELATIONAL (Default AUS) gesperrt. Ohne Migration UND
-- ohne Flag = reiner No-Op. Rollback: 20260720_crawl_runs_relational_rollback.sql.
-- Idempotent.

begin;

create table if not exists public.crawl_runs (
  id                     bigint generated always as identity primary key,
  run_id                 text,
  created_at             timestamptz not null default now(),
  mode                   text,
  politician_id          text,        -- pseudonyme Mandatskennung (technisch)
  duration_ms            integer,     -- echte Wall-Clock-Gesamtdauer
  source_mode            text,        -- on | shadow | off
  checked_sources        integer,
  successful_sources     integer,
  failed_sources         integer,
  new_candidate_items    integer,
  saved_items            integer,
  loaded_items           integer,
  discarded_items        integer,
  duplicates             integer,
  google_url_attempted   integer,
  google_url_resolved    integer,
  understanding_processed integer,
  understanding_deferred  integer,
  understanding_reason    text,       -- kurzer Grund-Code (budget/eager-error/…), kein KI-Text
  error_count            integer      -- ANZAHL Quellenfehler (kein Roh-Fehlertext)
);

create index if not exists idx_crawl_runs_created on public.crawl_runs(created_at);
create index if not exists idx_crawl_runs_run on public.crawl_runs(run_id);

comment on table public.crawl_runs is
  'P0-5 Stufe 2 Zieltabelle: Crawl-Läufe relational (Blob-Entlastung R1). Nur technische Betriebsmetadaten/Zähler + pseudonyme Mandatskennung — kein Volltext/PII. Dual-Write freigabepflichtig (HELMUT_CRAWL_RUNS_RELATIONAL, Default aus).';

revoke all on table public.crawl_runs from public, anon, authenticated;

do $$
begin
  execute 'alter table public.crawl_runs enable row level security';
end $$;

commit;
