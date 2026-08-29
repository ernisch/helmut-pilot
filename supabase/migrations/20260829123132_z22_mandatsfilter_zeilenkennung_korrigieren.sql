-- Helmut — vorwaerts gerichtete Z22-Korrektur fuer bereits angewendete Altstaende
-- ==============================================================================================
-- ANLASS: Im isolierten Z3b-Testprojekt wurde unter Version 20260827121931 bytegenau die
-- Fassung aus Commit 2a01ea9 angewendet. Sie behandelt eine leere oder nur aus U+0020
-- bestehende `p_mandat`-Kennung sicher als global, aber auf der Zeilenseite ausschliesslich
-- `tenant_id is null`. Leere, mit Leerzeichen gefuellte oder aus anderem Weissraum bestehende
-- Zeilenkennungen fallen dort aus der globalen Arbeit heraus. Das ist die unsichere Richtung:
-- ein Mandat wartet dann auf weniger Vorbedingungen.
--
-- Diese Migration ist der nachvollziehbare Konvergenzweg fuer Datenbanken, auf denen die alte
-- dreistellige Z22-Funktion bereits steht. Sie ist auf einem frischen Repository-Lauf nach
-- 20260826190000 wirkungsgleich und damit idempotent. Die angewendete Altversion wird niemals
-- ueberschrieben oder aus der Migrationshistorie umgedeutet.
--
-- VORAUSSETZUNG: Z22 muss bereits als genau eine dreistellige Funktion installiert sein.
-- Fehlt sie oder steht daneben noch die zweistellige Fassung, bricht die Transaktion ab. So
-- kann diese Korrektur niemals versehentlich Z22 selbst einfuehren oder einen mehrdeutigen
-- Zwei-Argument-Aufruf erzeugen.
--
-- RUECKWEG: rollback_20260829123132_z22_mandatsfilter_zeilenkennung_korrigieren.sql
-- stellt ausschliesslich die vorherige dreistellige Fassung wieder her. Der vollstaendige
-- Rueckbau von Z22 bleibt dem getrennten Rueckweg von 20260826190000 vorbehalten.

begin;

do $$
begin
  if to_regprocedure('public.helmut_jobs_offen(text[],text[],text)') is null then
    raise exception using
      errcode = '55000',
      message = 'Z22-Korrektur abgebrochen: helmut_jobs_offen(text[],text[],text) fehlt';
  end if;

  if to_regprocedure('public.helmut_jobs_offen(text[],text[])') is not null then
    raise exception using
      errcode = '55000',
      message = 'Z22-Korrektur abgebrochen: zweistellige und dreistellige Fassung stehen nebeneinander';
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
       nullif(btrim(p_mandat, E' \t\n\r\f\v'), '') is null
       or nullif(btrim(j.tenant_id, E' \t\n\r\f\v'), '') is null
       or btrim(j.tenant_id, E' \t\n\r\f\v') = btrim(p_mandat, E' \t\n\r\f\v')
     );
$$;

comment on function public.helmut_jobs_offen(text[], text[], text) is
  'OP-30/Z22: zaehlt offene/erledigte/fehlgeschlagene Auftraege ueber eine LISTE von Aktualitaetsfenstern, eine Typliste und OPTIONAL ein Mandat. Nur lesend. Ohne p_mandat oder mit einer nach dem Trimmen leeren Kennung verhaltensgleich zur zweistelligen Vorfassung (zaehlt alle Mandate). Mit p_mandat zaehlt sie globale Arbeit plus die Arbeit dieses Mandats — fremde mandatsgebundene Arbeit blockiert damit kein anderes Mandat mehr (Befund Z22). Global ist jede Zeile ohne brauchbaren Mandatsbezug: tenant_id null, leer oder nur Leerzeichen. Beide Seiten werden getrimmt; eine unbrauchbare Kennung fuehrt immer zu MEHR Warten, nie zu weniger (fail closed).';

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
