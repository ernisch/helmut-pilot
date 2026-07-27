-- Helmut — W-2 (Werkzeug-Härtung 2026-07-27) · Prozess-Lauftelemetrie relational
-- ==============================================================================
-- BEFUND W-2: der Prozess-Laufzeit-Ring `processRuns` lebt im Auth-Store-Blob
-- (Zeile `main-auth` in helmut_store). Jeder Auth-Store-Writer (LLM-Nutzungslog
-- bei JEDEM KI-Call, Sessions, systemErrors, Locks im Blob-Modus, Retry-Zähler …)
-- ersetzt die komplette data-Spalte mit seinem Lesestand — ein parallel
-- geschriebener processRuns-Eintrag geht dabei OHNE Fehler verloren
-- (Last-Write-Wins). In Production fehlten so mindestens zwei echte
-- Schreiblauf-Nachweise (CURRENT_STATE 2026-07-27, Befund W-2).
--
-- ZIEL: EINE Zeile je Lauf, atomar per Upsert auf (run_id, process) —
-- append-only, idempotent, parallel-sicher, unabhängig von der Blob-Größe.
-- Der 4-Phasen-Übergang folgt docs/betrieb/blob-relational-migration-plan.md
-- (gleiches Muster wie 20260720_crawl_runs_relational.sql):
--   Phase 1  nur Blob (heute)
--   Phase 2  Dual-Write (relational kanonisch + Blob-Spiegel) — HIER vorbereitet
--   Phase 3  Lesepfad bevorzugt relational (im Code bereits als Dual-Read angelegt)
--   Phase 4  Blob-Key processRuns abschalten
--
-- DSGVO: ausschließlich technische Skalare/Zähler und klassifizierte Fehler-
-- klassen — KEINE Dokumentinhalte, KEINE Roh-Fehlertexte, KEINE PII, KEINE Secrets.
--
-- FREIGABEPFLICHTIG: NICHT automatisch angewendet. Der Dual-Write ist zusätzlich
-- per Flag HELMUT_PROCESS_RUNS_RELATIONAL (Default AUS) gesperrt. Ohne Migration
-- UND ohne Flag = reiner No-Op (Code fällt fail-safe auf den Blob zurück).
-- Rollback: 20260727_process_runs_relational_rollback.sql. Idempotent.

begin;

create table if not exists public.process_runs (
  run_id              text not null,
  process             text not null,
  -- Kanonische Zustände; "ok"/"skipped" aus dem Blob werden im Code abgebildet
  -- (ok -> success, skipped -> blocked). Unbekannte Werte weist der Constraint
  -- sichtbar ab — kein stilles Umdeuten.
  status              text not null default 'running'
                      check (status in ('running','success','partial','failed','blocked','rolled_back')),
  mode                text,
  location            text,
  started_at          timestamptz,
  finished_at         timestamptz,
  created_at          timestamptz not null default now(),  -- Zeitpunkt des (letzten) Telemetrie-Schreibens
  duration_ms         integer,
  target_count        integer,      -- Zielmenge des Laufs
  processed_count     integer,
  saved_count         integer,
  skipped_count       integer,
  failed_count        integer,
  deferred_count      integer,
  skipped_store_count integer,
  reason              text,         -- kurzer Grund-Code (budget/lock/…), kein Rohtext
  error_class         text,         -- klassifizierte Fehlerklasse (redact.js), nie Rohtext
  backend             text,         -- supabase | local
  commit_ref          text,         -- Deployment-Kontext, soweit verfügbar
  run_id_derived      boolean not null default false,
  telemetrie          jsonb,        -- NUR sanitisierte Zähler/Zählerkarten (sanitizeProcessRun)
  -- Idempotenz-Anker: wiederholtes Schreiben derselben Laufkennung aktualisiert
  -- die EINE Zeile (Start -> Abschluss), dupliziert nie.
  primary key (run_id, process)
);

create index if not exists idx_process_runs_created on public.process_runs(created_at);
create index if not exists idx_process_runs_process on public.process_runs(process, created_at);

comment on table public.process_runs is
  'W-2 Werkzeug-Härtung: Prozess-Lauftelemetrie relational (Ablösung des Last-Write-Wins-Blob-Rings processRuns). Eine Zeile je (run_id, process), atomarer Upsert, append-only, idempotent. Nur technische Skalare/Zähler und klassifizierte Fehlerklassen — kein Volltext/PII. Dual-Write freigabepflichtig (HELMUT_PROCESS_RUNS_RELATIONAL, Default aus).';

-- Rechte entziehen. anon/authenticated existieren nur in Supabase — der lokale
-- Prüfcluster (scripts/process-runs-pgverify.sh) kennt sie nicht; fehlende
-- Rollen sind dort kein Fehler, in Supabase wird real entzogen.
revoke all on table public.process_runs from public;
do $$
begin
  begin
    execute 'revoke all on table public.process_runs from anon, authenticated';
  exception when undefined_object then
    null;
  end;
  execute 'alter table public.process_runs enable row level security';
end $$;

commit;
