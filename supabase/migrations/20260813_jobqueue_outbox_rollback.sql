-- ROLLBACK zu 20260813_jobqueue_outbox.sql — Outbox vollständig entfernen.
-- Entfernt AUSSCHLIESSLICH die in der Vorwärtsmigration angelegten Objekte.
-- helmut_jobs und alle bestehenden Funktionen bleiben unberührt: der
-- Cron-Rückfallweg arbeitet ohne Outbox unverändert weiter — kein Auftrag
-- geht durch diesen Rollback verloren (die Outbox trägt keine Auftragsdaten,
-- nur Versandabsichten).

begin;

drop function if exists public.helmut_outbox_kennzahlen();
drop function if exists public.helmut_outbox_abgleich(integer, integer);
drop function if exists public.helmut_outbox_bestaetige(uuid, boolean, text);
drop function if exists public.helmut_outbox_naechste(integer, text);
drop function if exists public.helmut_enqueue_job_mit_outbox(text, text, text, jsonb, timestamptz, smallint, integer, text, integer);

drop trigger if exists helmut_job_outbox_kappen_trg on public.helmut_job_outbox;
drop function if exists public.helmut_job_outbox_kappen();

drop table if exists public.helmut_job_outbox;

commit;

-- Verifikation (rein lesend):
--   select count(*) from information_schema.tables
--    where table_schema='public' and table_name='helmut_job_outbox';  -- 0
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname like 'helmut_outbox%';    -- 0
