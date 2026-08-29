-- ROLLBACK zu 20260829123132_z22_mandatsfilter_zeilenkennung_korrigieren.sql
-- ==============================================================================================
-- Stellt die unmittelbar vorherige dreistellige Z22-Fassung wieder her. Diese Fassung entspricht
-- der im isolierten Z3b-Testprojekt unter 20260827121931 angewendeten Datei aus Commit 2a01ea9:
-- eine leere `p_mandat`-Kennung zaehlt global, auf der Zeilenseite aber nur `tenant_id is null`.
--
-- Dieser Rueckweg entfernt Z22 bewusst NICHT und stellt die zweistellige Vor-Z22-Funktion nicht
-- wieder her. Dafuer existiert getrennt
-- rollback_20260826190000_jobqueue_vorbedingung_mandatsfilter.sql.

begin;

do $$
begin
  if to_regprocedure('public.helmut_jobs_offen(text[],text[],text)') is null then
    raise exception using
      errcode = '55000',
      message = 'Z22-Korrekturrueckweg abgebrochen: helmut_jobs_offen(text[],text[],text) fehlt';
  end if;

  if to_regprocedure('public.helmut_jobs_offen(text[],text[])') is not null then
    raise exception using
      errcode = '55000',
      message = 'Z22-Korrekturrueckweg abgebrochen: zweistellige und dreistellige Fassung stehen nebeneinander';
  end if;
end
$$;

create or replace function public.helmut_jobs_offen(
  p_fenster text[] default null,
  p_typen   text[] default null,
  p_mandat  text   default null
)
returns table(
  offen            bigint,
  wartend          bigint,
  laufend          bigint,
  fehlgeschlagen   bigint,
  erledigt         bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where j.status in ('wartend','laeuft'))  as offen,
    count(*) filter (where j.status = 'wartend')              as wartend,
    count(*) filter (where j.status = 'laeuft')               as laufend,
    count(*) filter (where j.status = 'fehlgeschlagen')       as fehlgeschlagen,
    count(*) filter (where j.status = 'erledigt')             as erledigt
    from public.helmut_jobs j
   where (p_fenster is null or j.freshness_window = any(p_fenster))
     and (p_typen   is null or j.job_type = any(p_typen))
     and (
       nullif(btrim(p_mandat), '') is null
       or j.tenant_id is null
       or j.tenant_id = btrim(p_mandat)
     );
$$;

comment on function public.helmut_jobs_offen(text[], text[], text) is
  'OP-30/Z22: zaehlt offene/erledigte/fehlgeschlagene Auftraege ueber eine LISTE von Aktualitaetsfenstern, eine Typliste und OPTIONAL ein Mandat. Nur lesend. Ohne p_mandat oder mit einer nach dem Trimmen leeren Kennung verhaltensgleich zur zweistelligen Vorfassung (zaehlt alle Mandate). Mit p_mandat zaehlt sie globale Arbeit (tenant_id is null) plus die Arbeit dieses Mandats — fremde mandatsgebundene Arbeit blockiert damit kein anderes Mandat mehr (Befund Z22).';

revoke all on function public.helmut_jobs_offen(text[], text[], text) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.helmut_jobs_offen(text[], text[], text) to service_role';
  end if;
end
$$;

commit;

-- Nachpruefung (lesend):
--   select p.oid::regprocedure, p.prosecdef, p.provolatile, p.proconfig
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'helmut_jobs_offen';
