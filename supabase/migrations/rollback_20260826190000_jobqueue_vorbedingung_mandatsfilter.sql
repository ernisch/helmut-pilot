-- ROLLBACK zu 20260826190000_jobqueue_vorbedingung_mandatsfilter.sql
-- ==============================================================================================
-- Stellt die zweistellige Fassung von `public.helmut_jobs_offen` wieder her — Wortlaut
-- identisch zu 20260808_jobqueue_abhaengigkeiten.sql. Danach zaehlt die Vorbedingungspruefung
-- wieder ueber ALLE Mandate (Zustand vor Befund Z22).
--
-- WICHTIG: der Anwendungscode bleibt danach lauffaehig. `storage.jobQueueOffeneVorbedingungen`
-- erkennt die fehlende dreistellige Fassung an PostgREST-Fehler `PGRST202` und fragt genau
-- einmal ohne `p_mandat` nach — also global, wie vor der Migration. Ein Rollback der Datenbank
-- ohne Rollback des Codes fuehrt deshalb NICHT zu einem Ausfall, sondern zum alten,
-- konservativeren Verhalten (mehr warten, nie weniger).
--
-- Diese Datei beginnt bewusst NICHT mit einem Zeitstempel: ein normaler Supabase-CLI-Lauf darf
-- sie nie als Vorwaertsmigration ausfuehren (CLAUDE.md §4.8, testgesichert durch
-- scripts/migrations-organisation-test.js).

begin;

drop function if exists public.helmut_jobs_offen(text[], text[], text);

create or replace function public.helmut_jobs_offen(
  p_fenster text[] default null,
  p_typen   text[] default null
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
     and (p_typen   is null or j.job_type = any(p_typen));
$$;

comment on function public.helmut_jobs_offen(text[], text[]) is
  'OP-30: zaehlt offene/erledigte/fehlgeschlagene Auftraege ueber eine LISTE von Aktualitaetsfenstern und Typen. Nur lesend. Grundlage der Reihenfolgezusage "Projektion und Briefing erst nach ihren Voraussetzungen". Die Liste ist noetig, weil geteilte Abrufe in 8-h-Fenstern liegen, mandatsbezogene Arbeit aber in einem 24-h-Fenster (Befund O3).';

revoke all on function public.helmut_jobs_offen(text[], text[]) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.helmut_jobs_offen(text[], text[]) to service_role';
  end if;
end
$$;

commit;

-- Nachpruefung (lesend):
--   select p.pronargs from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'helmut_jobs_offen';   -- erwartet: 2
