-- Helmut — ROLLBACK zu 20260808_jobqueue_abhaengigkeiten.sql
-- ==============================================================================================
-- Nimmt die Vorbedingungszaehlung vollstaendig zurueck. Danach faellt der App-Code erkennbar
-- auf "keine Vorbedingungspruefung" zurueck (`verfuegbar:false, grund:'migration-fehlt'`) —
-- die Reihenfolge wird dann wieder allein ueber die Faelligkeit gesteuert, wie vor diesem
-- Sprint. Kein Datenverlust: die Funktion und der Index tragen keine eigenen Daten.
-- Idempotent: mehrfaches Einspielen ist harmlos.

begin;

drop function if exists public.helmut_defer_job(uuid, text, bigint, text);
drop index  if exists public.helmut_jobs_fenster_typ_idx;
drop function if exists public.helmut_jobs_offen(text, text[]);

commit;

-- Nachpruefung (lesend, beide muessen 0 liefern):
--   select count(*) from pg_proc   where proname   = 'helmut_jobs_offen';
--   select count(*) from pg_indexes where indexname = 'helmut_jobs_fenster_typ_idx';
