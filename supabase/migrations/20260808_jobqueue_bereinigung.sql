-- Helmut — Arbeitswarteschlange: sichere Bereinigung mit Trockenlauf (OP-30, Abnahmesprint)
-- ==============================================================================================
-- WAS DIE BESTEHENDE FUNKTION SCHON KANN — und was ihr fehlt.
-- `helmut_prune_jobs(tage)` (Migration 20260808_scalable_job_queue.sql) loescht erledigte
-- Auftraege aelter als N Tage. Das ist richtig und bleibt unveraendert. Drei Dinge fehlen ihr
-- fuer einen Betrieb mit 1 000 Mandaten, und jedes einzelne ist ein Grund, sie nicht scharf
-- zu schalten:
--
--   1. KEIN TROCKENLAUF. Man kann nicht sehen, was sie loeschen WUERDE. Eine Loeschung ohne
--      Vorschau ist bei 66 000 Zeilen keine Aufraeumarbeit, sondern ein Risiko.
--   2. KEINE SCHUTZLISTE. Sie loescht nur `erledigt`, das ist gut — aber sie sagt nirgends,
--      WAS sie ausdruecklich nie anfasst. Eine Schutzzusage, die nur aus dem Weglassen einer
--      Bedingung besteht, ueberlebt die naechste Aenderung nicht.
--   3. KEINE OBERGRENZE. Ein einziger Aufruf koennte zehntausende Zeilen in EINER
--      Transaktion loeschen und dabei die Tabelle sperren, waehrend Worker darauf zugreifen.
--
-- WAS DIESE MIGRATION ERGAENZT: eine Bereinigung, die man ERST ANSCHAUEN und DANN ausfuehren
-- kann, mit ausdruecklicher Schutzliste und stapelweiser Loeschung.
--
-- WAS NIEMALS GELOESCHT WIRD (harte Bedingung, nicht Konvention):
--   * wartende Auftraege            — offene Arbeit
--   * laufende Auftraege            — Arbeit in fremder Hand
--   * zurueckgestellte Auftraege    — sie stehen auf `wartend` und sind damit geschuetzt
--   * endgueltig fehlgeschlagene    — sie sind der Fehlerbeleg. Wer sie loescht, loescht die
--                                     Antwort auf "warum fehlt dieses Briefing?"
--   * alles juenger als die Aufbewahrungsfrist
-- Ausserhalb dieser Tabelle wird NICHTS angefasst: keine Rohdokumente, keine Wissensobjekte,
-- keine Quellen, keine Kostenbelege, keine Reservierungen. Die Idempotenzschluessel
-- verschwinden mit den erledigten Zeilen — das ist gewollt und harmlos, weil der Schluessel
-- das Aktualitaetsfenster enthaelt und ein Fenster nach 14 Tagen nie wiederkehrt.
--
-- FREIGABEPFLICHTIG, DEFAULT AUS: die Funktion loescht nur, wenn sie ausdruecklich mit
-- `p_trockenlauf := false` gerufen wird. Der Standard ist der Trockenlauf.
-- Rollback: 20260808_jobqueue_bereinigung_rollback.sql
-- Voraussetzung: 20260808_scalable_job_queue.sql

begin;

-- Die Vorschau: was WUERDE geloescht? Rein lesend, jederzeit gefahrlos.
create or replace function public.helmut_jobs_bereinigung_vorschau(
  p_aelter_als_tage integer default 14
)
returns table(
  loeschbar          bigint,
  geschuetzt_wartend bigint,
  geschuetzt_laufend bigint,
  geschuetzt_fehler  bigint,
  zu_jung            bigint,
  gesamt             bigint,
  aeltester_loeschbar timestamptz,
  juengster_loeschbar timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with grenze as (select now() - (greatest(coalesce(p_aelter_als_tage, 14), 1) * interval '1 day') as t)
  select
    count(*) filter (where j.status = 'erledigt' and j.finished_at < (select t from grenze)),
    count(*) filter (where j.status = 'wartend'),
    count(*) filter (where j.status = 'laeuft'),
    count(*) filter (where j.status = 'fehlgeschlagen'),
    count(*) filter (where j.status = 'erledigt' and j.finished_at >= (select t from grenze)),
    count(*),
    min(j.finished_at) filter (where j.status = 'erledigt' and j.finished_at < (select t from grenze)),
    max(j.finished_at) filter (where j.status = 'erledigt' and j.finished_at < (select t from grenze))
    from public.helmut_jobs j;
$$;

comment on function public.helmut_jobs_bereinigung_vorschau(integer) is
  'OP-30: zeigt, was eine Bereinigung loeschen wuerde — und was sie ausdruecklich schuetzt. Rein lesend.';

-- Die Bereinigung selbst. STANDARD IST DER TROCKENLAUF.
-- `p_max_zeilen` begrenzt EINEN Aufruf, damit nie zehntausende Zeilen in einer Transaktion
-- haengen. Der Aufrufer wiederholt, bis `geloescht < p_max_zeilen`.
create or replace function public.helmut_jobs_bereinigen(
  p_aelter_als_tage integer default 14,
  p_trockenlauf     boolean default true,
  p_max_zeilen      integer default 5000
)
returns table(
  trockenlauf boolean,
  betroffen   bigint,
  geloescht   bigint,
  geschuetzt  bigint,
  grenze      timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_grenze timestamptz := now() - (greatest(coalesce(p_aelter_als_tage, 14), 1) * interval '1 day');
  v_max    integer     := greatest(coalesce(p_max_zeilen, 5000), 1);
  v_betroffen bigint;
  v_geschuetzt bigint;
  v_geloescht bigint := 0;
begin
  select count(*) into v_betroffen
    from public.helmut_jobs j
   where j.status = 'erledigt' and j.finished_at < v_grenze;

  -- Alles, was die Bereinigung ausdruecklich NICHT anfasst.
  select count(*) into v_geschuetzt
    from public.helmut_jobs j
   where j.status in ('wartend', 'laeuft', 'fehlgeschlagen')
      or (j.status = 'erledigt' and j.finished_at >= v_grenze);

  if coalesce(p_trockenlauf, true) then
    return query select true, v_betroffen, 0::bigint, v_geschuetzt, v_grenze;
    return;
  end if;

  -- Stapelweise loeschen. `for update skip locked` sorgt dafuer, dass die Bereinigung
  -- einem gleichzeitig arbeitenden Worker nie im Weg steht — sie nimmt sich nur Zeilen,
  -- die gerade niemand haelt.
  with kandidaten as (
    select j.id from public.helmut_jobs j
     where j.status = 'erledigt' and j.finished_at < v_grenze
     order by j.finished_at asc
     for update skip locked
     limit v_max
  )
  delete from public.helmut_jobs j using kandidaten k where j.id = k.id;
  get diagnostics v_geloescht = row_count;

  return query select false, v_betroffen, v_geloescht, v_geschuetzt, v_grenze;
end;
$$;

comment on function public.helmut_jobs_bereinigen(integer, boolean, integer) is
  'OP-30: sichere Bereinigung der Warteschlange. STANDARD IST TROCKENLAUF. Loescht ausschliesslich erledigte Auftraege jenseits der Aufbewahrungsfrist, stapelweise, und niemals offene, laufende, zurueckgestellte oder endgueltig fehlgeschlagene Arbeit.';

-- Index fuer genau diese Abfrage (Status + Abschlusszeitpunkt).
create index if not exists helmut_jobs_bereinigung_idx
  on public.helmut_jobs (status, finished_at)
  where status = 'erledigt';

revoke all on function public.helmut_jobs_bereinigung_vorschau(integer) from public, anon, authenticated;
revoke all on function public.helmut_jobs_bereinigen(integer, boolean, integer) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.helmut_jobs_bereinigung_vorschau(integer) to service_role';
    execute 'grant execute on function public.helmut_jobs_bereinigen(integer, boolean, integer) to service_role';
  end if;
end
$$;

commit;

-- Nachpruefung (lesend):
--   select * from public.helmut_jobs_bereinigung_vorschau(14);
--   select * from public.helmut_jobs_bereinigen(14);            -- Trockenlauf, loescht nichts
--   select * from public.helmut_jobs_bereinigen(14, false, 5000); -- loescht wirklich
