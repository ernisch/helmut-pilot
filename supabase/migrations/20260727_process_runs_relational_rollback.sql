-- Rollback zu 20260727_process_runs_relational.sql
-- ==============================================================================
-- Entfernt die relationale Prozess-Lauftelemetrie wieder vollständig. Der Code
-- fällt dann fail-safe auf den Auth-Store-Blob zurück (Flag
-- HELMUT_PROCESS_RUNS_RELATIONAL zusätzlich auf off setzen bzw. entfernen).
-- ACHTUNG: löscht die seit der Migration relational geschriebenen Laufzeilen —
-- der Blob-Spiegel (Dual-Write Phase 2) enthält dieselben Abschluss-Einträge,
-- reine Startbelege (status=running) existieren nur relational und gehen verloren.
-- Idempotent.

begin;

drop table if exists public.process_runs;

commit;
