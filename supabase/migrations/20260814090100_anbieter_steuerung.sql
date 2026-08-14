-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- OP-30 HAERTUNGSSPRINT 2026-08-14 — VERTEILTE ANBIETERSTEUERUNG (Auftrag Phase 4)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- BESTAETIGTER BEFUND 4: `helmut_klasse_belege` begrenzt ausschliesslich GLEICHZEITIGE Arbeit.
-- Externe Anbieter begrenzen aber nach RATE (Anfragen/Minute, teils Tokens/Minute) und nach
-- TAGESKONTINGENT — und sie antworten bei Ueberschreitung mit Fehlern, nicht mit Warten.
-- Fuenf gleichzeitige Abrufe sind unter einer Minutenrate von z. B. 60 voellig verschieden
-- von fuenf gleichzeitigen Abrufen unter einer Rate von 6.
--
-- WAS DIESE MIGRATION ANLEGT:
--   1. helmut_anbieter_fenster — atomare Zaehler je (Schluessel, Fensterart, Fensterstart).
--      Der SCHLUESSEL ist bewusst frei zusammengesetzt und wird von der Anwendung gebildet:
--        anbieter[|modell][|klasse][|mandat]
--      Damit sind alle vom Auftrag geforderten Unterscheidungen (Anbieter, Modell/Endpunkt,
--      Auftragsklasse, Mandat) moeglich, OHNE fuer jede Kombination eine Spalte zu raten.
--   2. helmut_anbieter_reserviere — ATOMARE Reservierung gegen Minuten- UND Tagesgrenze mit
--      Rueckgabe des FRUEHESTEN zulaessigen naechsten Zeitpunkts (fuer die Vertagung).
--   3. helmut_anbieter_schutzschalter + helmut_anbieter_melde — Schutzschaltung bei
--      gehaeuften Timeouts/Anbieterfehlern, mit automatischer Erholung (halb offen -> zu).
--   4. helmut_anbieter_kennzahlen — rein lesende Betriebssicht.
--
-- KEINE ERFUNDENEN ANBIETERWERTE: die Grenzen sind PARAMETER, keine Konstanten in der
-- Datenbank. Die Anwendung reicht sie aus der Konfiguration ein; welche Production-Werte
-- gelten, ist eine Betreiberentscheidung anhand der echten Anbieterbedingungen
-- (dokumentiert in docs/betrieb/env-inventar.md und der Belegdatei §18).
--
-- ABGRENZUNG ZUM BESTEHENDEN KI-TAGESDECKEL: `helmut_reserve_llm_call` (20260717) bleibt
-- die EINE Engstelle fuer das KI-Tagesbudget. Diese Migration ersetzt sie NICHT und zaehlt
-- nicht doppelt — sie ergaenzt Raten- und Anbietergrenzen, die es bisher gar nicht gab.
--
-- Rollback: rollback_20260814090100_anbieter_steuerung.sql (gleiches Verzeichnis).
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 1 · ZAEHLERFENSTER
-- ───────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.helmut_anbieter_fenster (
  schluessel    text        not null,
  fensterart    text        not null,
  fenster_start timestamptz not null,
  verbraucht    bigint      not null default 0,
  updated_at    timestamptz not null default now(),
  constraint helmut_anbieter_fenster_pk primary key (schluessel, fensterart, fenster_start),
  constraint helmut_anbieter_fenster_art_check check (fensterart in ('minute', 'tag')),
  constraint helmut_anbieter_fenster_verbraucht_check check (verbraucht >= 0)
);

create index if not exists helmut_anbieter_fenster_aufraeumen_idx
  on public.helmut_anbieter_fenster (fenster_start);

comment on table public.helmut_anbieter_fenster is
  'OP-30: atomare Verbrauchszaehler je Anbieterschluessel und Zeitfenster (minute|tag). Der Schluessel wird von der Anwendung gebildet: anbieter[|modell][|klasse][|mandat]. Enthaelt KEINE politischen Inhalte.';

create table if not exists public.helmut_anbieter_schutzschalter (
  schluessel     text        not null primary key,
  zustand        text        not null default 'zu',
  fehler_folge   integer     not null default 0,
  erfolg_folge   integer     not null default 0,
  offen_bis      timestamptz,
  letzter_grund  text,
  updated_at     timestamptz not null default now(),
  constraint helmut_anbieter_schutzschalter_zustand_check
    check (zustand in ('zu', 'offen', 'halb'))
);

comment on table public.helmut_anbieter_schutzschalter is
  'OP-30 Schutzschaltung je Anbieterschluessel. zu = normal, offen = Anbieter gesperrt bis offen_bis, halb = Erholungsversuch. Enthaelt KEINE politischen Inhalte.';

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 2 · ATOMARE RESERVIERUNG (Minute + Tag) MIT FRUEHESTEM NAECHSTEN ZEITPUNKT
-- ───────────────────────────────────────────────────────────────────────────────────────────
-- Ein Grenzwert <= 0 bedeutet "diese Fensterart nicht pruefen" (z. B. kein Tageslimit).
-- Ein NEGATIVER Rueckgabewert existiert nicht: `frueheste_ms` ist immer >= 0.
--
-- REIHENFOLGE (wichtig fuer Determinismus unter Nebenlaeufigkeit): erst Tag, dann Minute —
-- beide Zeilen werden in derselben Transaktion per INSERT ... ON CONFLICT DO UPDATE
-- atomar hochgezaehlt und bei Ueberschreitung zurueckgerollt. Es gibt keinen Zwischenstand,
-- in dem der Tageszaehler steht und der Minutenzaehler nicht.
create or replace function public.helmut_anbieter_reserviere(
  p_schluessel     text,
  p_menge          integer default 1,
  p_grenze_minute  integer default 0,
  p_grenze_tag     integer default 0
)
returns table(erlaubt boolean, grund text, frueheste_ms bigint,
              minute_verbraucht bigint, tag_verbraucht bigint)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now        timestamptz := now();
  v_minute     timestamptz := date_trunc('minute', v_now);
  v_tag        timestamptz := date_trunc('day', v_now);
  v_menge      integer := greatest(coalesce(p_menge, 1), 1);
  v_min_stand  bigint := 0;
  v_tag_stand  bigint := 0;
  v_schalter   public.helmut_anbieter_schutzschalter%rowtype;
begin
  if p_schluessel is null or length(btrim(p_schluessel)) = 0 then
    return query select false, 'ungueltiger-schluessel'::text, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  -- SCHUTZSCHALTUNG ZUERST: ein offener Schalter reserviert gar nichts und nennt die
  -- Restzeit bis zum Erholungsversuch.
  select * into v_schalter
    from public.helmut_anbieter_schutzschalter s
   where s.schluessel = p_schluessel;
  if found and v_schalter.zustand = 'offen'
     and v_schalter.offen_bis is not null and v_schalter.offen_bis > v_now then
    return query select false, 'schutzschalter-offen'::text,
                        (extract(epoch from (v_schalter.offen_bis - v_now)) * 1000)::bigint,
                        0::bigint, 0::bigint;
    return;
  end if;

  -- TAGESFENSTER
  if coalesce(p_grenze_tag, 0) > 0 then
    insert into public.helmut_anbieter_fenster (schluessel, fensterart, fenster_start, verbraucht)
    values (p_schluessel, 'tag', v_tag, v_menge)
    on conflict (schluessel, fensterart, fenster_start)
      do update set verbraucht = public.helmut_anbieter_fenster.verbraucht + v_menge,
                    updated_at = v_now
    returning verbraucht into v_tag_stand;

    if v_tag_stand > p_grenze_tag then
      update public.helmut_anbieter_fenster f
         set verbraucht = greatest(f.verbraucht - v_menge, 0), updated_at = v_now
       where f.schluessel = p_schluessel and f.fensterart = 'tag' and f.fenster_start = v_tag;
      return query select false, 'tagesgrenze'::text,
                          (extract(epoch from ((v_tag + interval '1 day') - v_now)) * 1000)::bigint,
                          0::bigint, (v_tag_stand - v_menge)::bigint;
      return;
    end if;
  end if;

  -- MINUTENFENSTER
  if coalesce(p_grenze_minute, 0) > 0 then
    insert into public.helmut_anbieter_fenster (schluessel, fensterart, fenster_start, verbraucht)
    values (p_schluessel, 'minute', v_minute, v_menge)
    on conflict (schluessel, fensterart, fenster_start)
      do update set verbraucht = public.helmut_anbieter_fenster.verbraucht + v_menge,
                    updated_at = v_now
    returning verbraucht into v_min_stand;

    if v_min_stand > p_grenze_minute then
      update public.helmut_anbieter_fenster f
         set verbraucht = greatest(f.verbraucht - v_menge, 0), updated_at = v_now
       where f.schluessel = p_schluessel and f.fensterart = 'minute' and f.fenster_start = v_minute;
      -- Auch das TAGESFENSTER zuruecknehmen: die Reservierung als Ganzes findet nicht statt.
      if coalesce(p_grenze_tag, 0) > 0 then
        update public.helmut_anbieter_fenster f
           set verbraucht = greatest(f.verbraucht - v_menge, 0), updated_at = v_now
         where f.schluessel = p_schluessel and f.fensterart = 'tag' and f.fenster_start = v_tag;
        v_tag_stand := v_tag_stand - v_menge;
      end if;
      return query select false, 'minutengrenze'::text,
                          (extract(epoch from ((v_minute + interval '1 minute') - v_now)) * 1000)::bigint,
                          (v_min_stand - v_menge)::bigint, v_tag_stand::bigint;
      return;
    end if;
  end if;

  return query select true, 'reserviert'::text, 0::bigint, v_min_stand::bigint, v_tag_stand::bigint;
end;
$$;

comment on function public.helmut_anbieter_reserviere(text, integer, integer, integer) is
  'OP-30: atomare Anbieterreservierung gegen Minuten- und Tagesgrenze. Grenze <= 0 = nicht pruefen. Bei Ablehnung liefert frueheste_ms die Wartezeit bis zum naechsten zulaessigen Versuch (fuer die Vertagung des Auftrags, nie fuer eine Warteschleife in der Function).';

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 3 · SCHUTZSCHALTUNG MIT AUTOMATISCHER ERHOLUNG
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.helmut_anbieter_melde(
  p_schluessel    text,
  p_ok            boolean,
  p_schwelle      integer default 5,
  p_offen_ms      bigint  default 60000,
  p_erholung      integer default 2,
  p_grund         text    default null
)
returns table(zustand text, fehler_folge integer, offen_bis timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now     timestamptz := now();
  v_zeile   public.helmut_anbieter_schutzschalter%rowtype;
  v_schwelle integer := greatest(coalesce(p_schwelle, 5), 1);
  v_erholung integer := greatest(coalesce(p_erholung, 2), 1);
  v_offen   interval := (greatest(coalesce(p_offen_ms, 60000), 1000) || ' milliseconds')::interval;
begin
  insert into public.helmut_anbieter_schutzschalter (schluessel)
  values (p_schluessel)
  on conflict (schluessel) do nothing;

  select * into v_zeile
    from public.helmut_anbieter_schutzschalter s
   where s.schluessel = p_schluessel
   for update;

  -- Abgelaufene Sperre: Erholungsversuch zulassen (halb offen).
  if v_zeile.zustand = 'offen' and (v_zeile.offen_bis is null or v_zeile.offen_bis <= v_now) then
    v_zeile.zustand := 'halb';
    v_zeile.erfolg_folge := 0;
  end if;

  if coalesce(p_ok, false) then
    v_zeile.fehler_folge := 0;
    v_zeile.erfolg_folge := v_zeile.erfolg_folge + 1;
    if v_zeile.zustand = 'halb' and v_zeile.erfolg_folge >= v_erholung then
      v_zeile.zustand := 'zu';            -- vollstaendig erholt
      v_zeile.offen_bis := null;
    elsif v_zeile.zustand = 'zu' then
      v_zeile.offen_bis := null;
    end if;
  else
    v_zeile.erfolg_folge := 0;
    v_zeile.fehler_folge := v_zeile.fehler_folge + 1;
    -- Ein Fehler IM Erholungsversuch sperrt sofort wieder.
    if v_zeile.zustand = 'halb' or v_zeile.fehler_folge >= v_schwelle then
      v_zeile.zustand := 'offen';
      v_zeile.offen_bis := v_now + v_offen;
    end if;
  end if;

  update public.helmut_anbieter_schutzschalter s
     set zustand = v_zeile.zustand,
         fehler_folge = v_zeile.fehler_folge,
         erfolg_folge = v_zeile.erfolg_folge,
         offen_bis = v_zeile.offen_bis,
         letzter_grund = case when coalesce(p_ok, false) then s.letzter_grund
                              else left(coalesce(p_grund, 'unbekannt'), 200) end,
         updated_at = v_now
   where s.schluessel = p_schluessel
   returning * into v_zeile;

  return query select v_zeile.zustand, v_zeile.fehler_folge, v_zeile.offen_bis;
end;
$$;

comment on function public.helmut_anbieter_melde(text, boolean, integer, bigint, integer, text) is
  'OP-30 Schutzschaltung: meldet Erfolg/Fehler eines Anbieteraufrufs. Ab p_schwelle aufeinanderfolgenden Fehlern wird fuer p_offen_ms gesperrt; danach ein Erholungsversuch (halb), der nach p_erholung Erfolgen vollstaendig schliesst.';

create or replace function public.helmut_anbieter_kennzahlen()
returns table(schluessel text, fensterart text, verbraucht bigint,
              zustand text, offen_bis timestamptz)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select f.schluessel, f.fensterart, f.verbraucht,
         coalesce(s.zustand, 'zu'), s.offen_bis
    from public.helmut_anbieter_fenster f
    left join public.helmut_anbieter_schutzschalter s on s.schluessel = f.schluessel
   where (f.fensterart = 'minute' and f.fenster_start = date_trunc('minute', now()))
      or (f.fensterart = 'tag'    and f.fenster_start = date_trunc('day', now()))
   order by f.schluessel, f.fensterart;
$$;

comment on function public.helmut_anbieter_kennzahlen() is
  'OP-30: rein lesende Betriebssicht der aktuellen Anbieterfenster und Schutzschalter.';

-- Aufraeumen alter Fensterzeilen (gedeckelt, terminal, ohne automatischen Aufrufer).
create or replace function public.helmut_anbieter_fenster_aufraeumen(
  p_alter_stunden integer default 48,
  p_limit         integer default 5000
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_grenze timestamptz := now() - (greatest(coalesce(p_alter_stunden, 48), 1) || ' hours')::interval;
  v_del bigint := 0;
begin
  with alt as (
    select f.schluessel, f.fensterart, f.fenster_start
      from public.helmut_anbieter_fenster f
     where f.fenster_start < v_grenze
     order by f.fenster_start asc
     limit greatest(coalesce(p_limit, 5000), 1)
  )
  delete from public.helmut_anbieter_fenster f
   using alt a
   where f.schluessel = a.schluessel and f.fensterart = a.fensterart
     and f.fenster_start = a.fenster_start;
  get diagnostics v_del = row_count;
  return v_del;
end;
$$;

comment on function public.helmut_anbieter_fenster_aufraeumen(integer, integer) is
  'OP-30: loescht abgelaufene Zaehlerfenster (gedeckelt). Kein automatischer Aufrufer.';

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 4 · SICHERHEIT — RLS an und erzwungen, keine Policy, service_role ueber Funktionen
-- ───────────────────────────────────────────────────────────────────────────────────────────
alter table public.helmut_anbieter_fenster        enable row level security;
alter table public.helmut_anbieter_fenster        force row level security;
alter table public.helmut_anbieter_schutzschalter enable row level security;
alter table public.helmut_anbieter_schutzschalter force row level security;

revoke all on table public.helmut_anbieter_fenster        from public, anon, authenticated;
revoke all on table public.helmut_anbieter_schutzschalter from public, anon, authenticated;

revoke all on function public.helmut_anbieter_reserviere(text, integer, integer, integer)      from public, anon, authenticated;
revoke all on function public.helmut_anbieter_melde(text, boolean, integer, bigint, integer, text) from public, anon, authenticated;
revoke all on function public.helmut_anbieter_kennzahlen()                                     from public, anon, authenticated;
revoke all on function public.helmut_anbieter_fenster_aufraeumen(integer, integer)             from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.helmut_anbieter_fenster to service_role';
    execute 'grant select, insert, update, delete on table public.helmut_anbieter_schutzschalter to service_role';
    execute 'grant execute on function public.helmut_anbieter_reserviere(text, integer, integer, integer) to service_role';
    execute 'grant execute on function public.helmut_anbieter_melde(text, boolean, integer, bigint, integer, text) to service_role';
    execute 'grant execute on function public.helmut_anbieter_kennzahlen() to service_role';
    execute 'grant execute on function public.helmut_anbieter_fenster_aufraeumen(integer, integer) to service_role';
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- VERIFIKATION
-- ───────────────────────────────────────────────────────────────────────────────────────────
-- select relname, relrowsecurity, relforcerowsecurity from pg_class
--  where relname in ('helmut_anbieter_fenster','helmut_anbieter_schutzschalter');
-- -> beide true/true
