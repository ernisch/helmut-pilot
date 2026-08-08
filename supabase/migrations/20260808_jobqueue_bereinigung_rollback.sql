-- Helmut — ROLLBACK zu 20260808_jobqueue_bereinigung.sql
-- ==============================================================================================
-- Nimmt Vorschau, Bereinigung und Index zurueck. Die BESTEHENDE `helmut_prune_jobs` aus
-- 20260808_scalable_job_queue.sql bleibt unangetastet — nach dem Rollback ist also weiterhin
-- eine (einfachere) Bereinigung vorhanden, nur ohne Trockenlauf und ohne Stapelgrenze.
-- KEIN Datenverlust: beide Funktionen und der Index tragen keine eigenen Daten.
-- Idempotent.

begin;

drop index    if exists public.helmut_jobs_bereinigung_idx;
drop function if exists public.helmut_jobs_bereinigen(integer, boolean, integer);
drop function if exists public.helmut_jobs_bereinigung_vorschau(integer);

commit;

-- Nachpruefung (lesend):
--   select count(*) from pg_proc where proname like 'helmut_jobs_bereinig%';   -- muss 0 sein
--   select count(*) from pg_proc where proname = 'helmut_prune_jobs';          -- muss 1 sein
