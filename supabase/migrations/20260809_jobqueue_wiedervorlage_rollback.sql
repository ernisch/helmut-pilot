-- Helmut — ROLLBACK zu 20260809_jobqueue_wiedervorlage.sql
-- ==============================================================================================
-- Nimmt die Wiedervorlage vollstaendig zurueck. Danach verhaelt sich die Warteschlange wie
-- vor Befund O5: endgueltig gescheiterte Auftraege bleiben endgueltig gescheitert, und der
-- App-Code faellt erkennbar auf `verfuegbar:false, grund:'migration-fehlt'` zurueck — er
-- behauptet also NICHT, es sei alles in Ordnung.
--
-- KEIN DATENVERLUST AN ARBEIT: es wird keine Auftragszeile geloescht. Entfernt wird die
-- Zaehlspalte `wiedervorlagen` — das ist die Buchhaltung ueber die Wiedervorlagen selbst,
-- nicht der Fehlerbeleg. Der Fehlerbeleg steht in `last_error` und bleibt stehen; der
-- Praefix "wiedervorlage N nach: …" bleibt dort ebenfalls lesbar.
--
-- Idempotent: mehrfaches Einspielen ist harmlos.

begin;

drop function if exists public.helmut_jobs_blockiert(integer);
drop function if exists public.helmut_jobs_wiedervorlage(text[], integer, integer, integer, boolean);
drop function if exists public.helmut_jobs_wiedervorlage_vorschau(text[], integer, integer);
drop index    if exists public.helmut_jobs_wiedervorlage_idx;

alter table if exists public.helmut_jobs
  drop constraint if exists helmut_jobs_wiedervorlagen_chk;
alter table if exists public.helmut_jobs
  drop column if exists wiedervorlagen;

commit;

-- Nachpruefung (lesend, alle drei muessen 0 liefern):
--   select count(*) from pg_proc where proname like 'helmut_jobs_wiedervorlage%';
--   select count(*) from pg_proc where proname = 'helmut_jobs_blockiert';
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='helmut_jobs' and column_name='wiedervorlagen';
