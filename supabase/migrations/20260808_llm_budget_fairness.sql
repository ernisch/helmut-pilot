-- Helmut — KI-Budget: ergebnisbezogene Reservierung und fairer Mandantenanteil (OP-30)
-- ==============================================================================================
-- VORAUSSETZUNG (nachgetragen 2026-08-08): 20260717_llm_budget_reservation.sql.
-- Diese Migration setzt `public.llm_budget_counters` voraus und schlaegt ohne sie fehl
-- ("relation public.llm_budget_counters does not exist"). Belegt beim Migrationsdurchlauf
-- auf frischer Datenbank am 2026-08-08 — die Voraussetzung stand vorher nirgends, obwohl
-- die uebrigen Migrationen dieses Sprints ihre Voraussetzung ausdruecklich nennen.
-- Rollback: 20260808_llm_budget_fairness_rollback.sql
-- WAS HIER FEHLT UND ERGAENZT WIRD.
-- Der bestehende Zaehler `public.llm_budget_counters` + `helmut_reserve_llm_call(day, scope, max)`
-- (Migration 20260717) loest genau EIN Problem: zwei gleichzeitige Aufrufe duerfen den Deckel
-- nicht gemeinsam ueberschreiten. Er loest DREI andere nicht:
--
--   1. IDEMPOTENZ JE ERGEBNIS. Wird ein Auftrag wiederholt (Absturz, Lease-Ablauf, Retry),
--      zieht er heute eine ZWEITE Reservierung fuer dasselbe beabsichtigte Ergebnis. Bei
--      1 000 Mandaten und fuenf erlaubten Versuchen ist das ein Faktor-5-Kostenrisiko.
--   2. ZWEI DECKEL IN EINEM SCHRITT. Mandantendeckel und globales Notfalllimit werden heute
--      nacheinander geprueft. Zwischen beiden Schritten kann ein anderer Worker dazwischen —
--      das Ergebnis ist ein gebuchter Mandantenanteil ohne globale Deckung (oder umgekehrt).
--   3. ABSTURZ ZWISCHEN RESERVIERUNG UND ABSCHLUSS. Heute ist eine Reservierung ein blosser
--      Zaehlerstand. Wer sie gezogen hat und ob daraus je ein Ergebnis wurde, steht nirgends.
--
-- WIE ES GELOEST WIRD.
-- Eine Reservierungszeile je BEABSICHTIGTEM ERGEBNIS (`result_key`), nicht je Aufruf. Der
-- Schluessel ist stabil und inhaltsbezogen (z. B. `understanding|<vorgangId>` oder
-- `lage|<mandat>|<fenster>`). Beide Deckel werden in EINEM Statementblock innerhalb DERSELBEN
-- Transaktion gezogen; scheitert einer, wird nichts gebucht.
--
-- DIE BEWUSSTE ENTSCHEIDUNG ZUM ABSTURZFALL.
-- Eine abgelaufene, nie abgeschlossene Reservierung wird NICHT automatisch zurueckgegeben.
-- Das waere die teure Variante: ein Absturz NACH dem Modellaufruf wuerde das Budget
-- zurueckgeben, obwohl das Geld ausgegeben ist. Stattdessen bleibt sie gebucht, und der
-- Wiederholungslauf findet sie ueber den `result_key` wieder und laeuft OHNE zweite Buchung
-- weiter. Das ist exakt die konservative Linie, die schon 20260717 gewaehlt hat
-- ("Eine verbrauchte Reservierung wird bei Fehlschlag BEWUSST nicht zurueckgegeben").
-- `helmut_reclaim_llm_reservations` gibt es trotzdem — aber nur fuer Reservierungen, die
-- AUSDRUECKLICH als "nie ausgefuehrt" gemeldet wurden.
--
-- WAS SICH FUER DEN BESTAND NICHT AENDERT.
-- `llm_budget_counters` und `helmut_reserve_llm_call` bleiben unveraendert. Der globale
-- Deckel bleibt das Notfalllimit. Solange der App-Code diese Funktionen nicht ruft (Flag aus),
-- ist diese Migration vollstaendig wirkungslos.
--
-- FREIGABEPFLICHTIG: NICHT automatisch angewendet. Idempotent.
-- DSGVO: nur Schluessel, Zaehlstaende und Zeitpunkte — keine Inhalte, keine PII. Der
-- `result_key` ist ein technischer Ableitungswert (Vorgangs-/Mandatskennung + Fenster).
-- Rollback: 20260808_llm_budget_fairness_rollback.sql

begin;

-- ── Reservierungen je beabsichtigtem Ergebnis ────────────────────────────────────────────
create table if not exists public.llm_reservations (
  result_key   text        primary key,             -- STABIL und inhaltsbezogen (Idempotenz)
  day          text        not null,                -- UTC-Kalendertag, identisch zu dayKey()
  scope        text        not null,                -- 'global' | 'tenant:<id>'
  work_class   text        not null default 'notwendig',
  status       text        not null default 'reserviert',
  job_id       uuid,                                -- optionaler Bezug auf helmut_jobs
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  settled_at   timestamptz,
  note         text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'llm_reservations_status_chk') then
    alter table public.llm_reservations add constraint llm_reservations_status_chk
      check (status in ('reserviert','verbraucht','fehlgeschlagen','zurueckgegeben'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'llm_reservations_class_chk') then
    alter table public.llm_reservations add constraint llm_reservations_class_chk
      check (work_class in ('notwendig','optional'));
  end if;
end
$$;

create index if not exists llm_reservations_tag_idx    on public.llm_reservations (day, scope);
create index if not exists llm_reservations_status_idx on public.llm_reservations (status, expires_at);

comment on table public.llm_reservations is
  'OP-30: eine Zeile je BEABSICHTIGTEM KI-Ergebnis. Macht eine Wiederholung kostenneutral (Idempotenz ueber result_key) und bindet Mandantenanteil und globales Notfalllimit in EINEN atomaren Schritt. Nur Schluessel/Zaehler/Zeitpunkte — keine Inhalte.';

-- ── Die atomare Reservierung ─────────────────────────────────────────────────────────────
-- p_scope_max  = fairer Anteil DIESES Mandanten am Tag (null = kein Mandantendeckel)
-- p_global_max = globales Notfalllimit           (null = kein globales Limit)
-- Beide Zaehler liegen in `llm_budget_counters` — derselben Tabelle wie 20260717, damit es
-- NICHT zwei konkurrierende Wahrheiten ueber den Tagesverbrauch gibt.
create or replace function public.helmut_reserve_llm_result(
  p_result_key  text,
  p_day         text,
  p_scope       text default 'global',
  p_work_class  text default 'notwendig',
  p_global_max  integer default null,
  p_scope_max   integer default null,
  p_ttl_ms      bigint  default 900000
)
returns table(
  erlaubt           boolean,
  wiederverwendet   boolean,
  grund             text,
  global_verbraucht integer,
  scope_verbraucht  integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_vorhanden public.llm_reservations%rowtype;
  v_global    integer := 0;
  v_scope     integer := 0;
  v_ok        boolean;
begin
  if p_result_key is null or length(trim(p_result_key)) = 0 then
    raise exception 'helmut_reserve_llm_result: p_result_key ist Pflicht';
  end if;
  if p_day is null or length(trim(p_day)) = 0 then
    raise exception 'helmut_reserve_llm_result: p_day ist Pflicht';
  end if;

  -- (1) IDEMPOTENZ. Existiert schon eine Reservierung fuer dieses Ergebnis, wird sie
  --     WIEDERVERWENDET — egal ob sie noch offen ist oder bereits verbraucht wurde. Eine
  --     Wiederholung desselben Auftrags kostet damit NICHTS zusaetzlich.
  select * into v_vorhanden from public.llm_reservations r
   where r.result_key = p_result_key
   for update;

  if found then
    select coalesce(c.used, 0) into v_global from public.llm_budget_counters c
      where c.day = p_day and c.scope = 'global';
    select coalesce(c.used, 0) into v_scope from public.llm_budget_counters c
      where c.day = p_day and c.scope = p_scope;
    if v_vorhanden.status = 'zurueckgegeben' then
      -- Ausdruecklich zurueckgegeben (der Aufrufer hat gemeldet: Aufruf fand NIE statt).
      -- Dann darf und muss neu gebucht werden — dafuer faellt die Zeile unten wieder an.
      delete from public.llm_reservations where result_key = p_result_key;
    else
      return query select true, true, 'bereits-reserviert'::text, coalesce(v_global,0), coalesce(v_scope,0);
      return;
    end if;
  end if;

  -- (2) MANDANTENANTEIL zuerst. Der engere Deckel wird zuerst gezogen: scheitert er, wurde
  --     das globale Notfalllimit gar nicht erst angefasst.
  if p_scope <> 'global' and p_scope_max is not null then
    if p_scope_max <= 0 then
      select coalesce(c.used, 0) into v_scope from public.llm_budget_counters c
        where c.day = p_day and c.scope = p_scope;
      select coalesce(c.used, 0) into v_global from public.llm_budget_counters c
        where c.day = p_day and c.scope = 'global';
      return query select false, false, 'mandantenanteil-erschoepft'::text, coalesce(v_global,0), coalesce(v_scope,0);
      return;
    end if;
    insert into public.llm_budget_counters as c (day, scope, used)
    values (p_day, p_scope, 1)
    on conflict (day, scope) do update
       set used = c.used + 1, updated_at = now()
     where c.used < p_scope_max
    returning c.used into v_scope;
    if v_scope is null then
      select coalesce(c.used, 0) into v_scope from public.llm_budget_counters c
        where c.day = p_day and c.scope = p_scope;
      select coalesce(c.used, 0) into v_global from public.llm_budget_counters c
        where c.day = p_day and c.scope = 'global';
      return query select false, false, 'mandantenanteil-erschoepft'::text, coalesce(v_global,0), coalesce(v_scope,0);
      return;
    end if;
  end if;

  -- (3) GLOBALES NOTFALLLIMIT. Scheitert es, wird der eben gezogene Mandantenanteil in
  --     DERSELBEN Transaktion wieder zurueckgenommen — es darf kein Anteil verbraucht sein,
  --     ohne dass daraus ein Aufruf werden durfte.
  if p_global_max is not null and p_global_max <= 0 then
    v_ok := false;
  else
    insert into public.llm_budget_counters as c (day, scope, used)
    values (p_day, 'global', 1)
    on conflict (day, scope) do update
       set used = c.used + 1, updated_at = now()
     where p_global_max is null or c.used < p_global_max
    returning c.used into v_global;
    v_ok := v_global is not null;
  end if;

  if not v_ok then
    if p_scope <> 'global' and p_scope_max is not null then
      update public.llm_budget_counters c set used = greatest(0, c.used - 1), updated_at = now()
       where c.day = p_day and c.scope = p_scope;
      select coalesce(c.used, 0) into v_scope from public.llm_budget_counters c
        where c.day = p_day and c.scope = p_scope;
    end if;
    select coalesce(c.used, 0) into v_global from public.llm_budget_counters c
      where c.day = p_day and c.scope = 'global';
    return query select false, false, 'globales-notfalllimit-erreicht'::text, coalesce(v_global,0), coalesce(v_scope,0);
    return;
  end if;

  -- (4) Die Reservierung festschreiben. Erst JETZT — beide Deckel haben getragen.
  insert into public.llm_reservations (result_key, day, scope, work_class, status, expires_at)
  values (p_result_key, p_day, p_scope, coalesce(p_work_class, 'notwendig'), 'reserviert',
          now() + (greatest(coalesce(p_ttl_ms, 900000), 1000) * interval '1 millisecond'))
  on conflict (result_key) do nothing;

  return query select true, false, null::text, coalesce(v_global,0), coalesce(v_scope,0);
end;
$$;

-- ── Abschluss einer Reservierung ─────────────────────────────────────────────────────────
create or replace function public.helmut_settle_llm_reservation(
  p_result_key text,
  p_ok         boolean default true,
  p_note       text default null
)
returns table(uebernommen boolean, neuer_status text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  update public.llm_reservations r
     set status = case when p_ok then 'verbraucht' else 'fehlgeschlagen' end,
         settled_at = now(),
         note = coalesce(p_note, r.note)
   where r.result_key = p_result_key
     and r.status = 'reserviert'
  returning r.status into v_status;

  if v_status is null then
    select r.status into v_status from public.llm_reservations r where r.result_key = p_result_key;
    return query select false, v_status;
    return;
  end if;
  return query select true, v_status;
end;
$$;

-- ── Ausdrueckliche Rueckgabe: der Aufruf fand NACHWEISLICH nicht statt ───────────────────
-- Nur fuer den Fall, den der Aufrufer BEWEISEN kann (z. B. der Vorgang war bereits verstanden
-- und der Kurzschluss griff VOR dem Modellaufruf). Niemals als Aufraeumautomatik fuer
-- abgelaufene Reservierungen — siehe Kopfkommentar.
create or replace function public.helmut_release_llm_reservation(
  p_result_key text,
  p_note       text default null
)
returns table(zurueckgegeben boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_scope text;
  v_day   text;
begin
  select r.scope, r.day into v_scope, v_day from public.llm_reservations r
   where r.result_key = p_result_key and r.status = 'reserviert'
   for update;
  if not found then
    return query select false;
    return;
  end if;

  update public.llm_budget_counters c set used = greatest(0, c.used - 1), updated_at = now()
   where c.day = v_day and c.scope = 'global';
  if v_scope <> 'global' then
    update public.llm_budget_counters c set used = greatest(0, c.used - 1), updated_at = now()
     where c.day = v_day and c.scope = v_scope;
  end if;

  update public.llm_reservations r
     set status = 'zurueckgegeben', settled_at = now(), note = coalesce(p_note, r.note)
   where r.result_key = p_result_key;

  return query select true;
end;
$$;

-- ── Kennzahlen (nur lesend) ──────────────────────────────────────────────────────────────
create or replace function public.helmut_llm_budget_kennzahlen(p_day text default null)
returns table(
  tag                    text,
  global_verbraucht      integer,
  mandanten_mit_verbrauch bigint,
  reservierungen         bigint,
  offen                  bigint,
  verbraucht             bigint,
  fehlgeschlagen         bigint,
  zurueckgegeben         bigint,
  notwendig              bigint,
  optional               bigint,
  groesster_mandantenanteil integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with tag as (select coalesce(p_day, to_char(now() at time zone 'utc', 'YYYY-MM-DD')) as d)
  select
    (select d from tag),
    coalesce((select c.used from public.llm_budget_counters c, tag where c.day = tag.d and c.scope = 'global'), 0),
    (select count(*) from public.llm_budget_counters c, tag where c.day = tag.d and c.scope <> 'global' and c.used > 0),
    (select count(*) from public.llm_reservations r, tag where r.day = tag.d),
    (select count(*) from public.llm_reservations r, tag where r.day = tag.d and r.status = 'reserviert'),
    (select count(*) from public.llm_reservations r, tag where r.day = tag.d and r.status = 'verbraucht'),
    (select count(*) from public.llm_reservations r, tag where r.day = tag.d and r.status = 'fehlgeschlagen'),
    (select count(*) from public.llm_reservations r, tag where r.day = tag.d and r.status = 'zurueckgegeben'),
    (select count(*) from public.llm_reservations r, tag where r.day = tag.d and r.work_class = 'notwendig'),
    (select count(*) from public.llm_reservations r, tag where r.day = tag.d and r.work_class = 'optional'),
    coalesce((select max(c.used) from public.llm_budget_counters c, tag where c.day = tag.d and c.scope <> 'global'), 0);
$$;

-- ── Aufraeumen alter Zeilen (Aufbewahrung) ───────────────────────────────────────────────
create or replace function public.helmut_prune_llm_reservations(p_tage integer default 30)
returns table(geloescht bigint)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_n bigint;
begin
  delete from public.llm_reservations r
   where r.created_at < now() - (greatest(coalesce(p_tage, 30), 1) * interval '1 day');
  get diagnostics v_n = row_count;
  return query select v_n;
end;
$$;

-- ── Sicherheit: identische Zusagen wie die Warteschlangentabelle ─────────────────────────
alter table public.llm_reservations enable row level security;
alter table public.llm_reservations force  row level security;
-- KEINE Policy: ohne Policy ist bei aktivem RLS jeder Zugriff ausser dem des Besitzers
-- verboten. Zusammen mit dem Rechteentzug unten sind das zwei unabhaengige Riegel.

revoke all on table public.llm_reservations from public, anon, authenticated;
revoke all on function public.helmut_reserve_llm_result(text, text, text, text, integer, integer, bigint) from public, anon, authenticated;
revoke all on function public.helmut_settle_llm_reservation(text, boolean, text) from public, anon, authenticated;
revoke all on function public.helmut_release_llm_reservation(text, text)          from public, anon, authenticated;
revoke all on function public.helmut_llm_budget_kennzahlen(text)                  from public, anon, authenticated;
revoke all on function public.helmut_prune_llm_reservations(integer)              from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.llm_reservations to service_role';
    execute 'grant execute on function public.helmut_reserve_llm_result(text, text, text, text, integer, integer, bigint) to service_role';
    execute 'grant execute on function public.helmut_settle_llm_reservation(text, boolean, text) to service_role';
    execute 'grant execute on function public.helmut_release_llm_reservation(text, text) to service_role';
    execute 'grant execute on function public.helmut_llm_budget_kennzahlen(text) to service_role';
    execute 'grant execute on function public.helmut_prune_llm_reservations(integer) to service_role';
  end if;
end
$$;

commit;

-- Nachpruefung (lesend):
--   select relrowsecurity, relforcerowsecurity from pg_class where relname = 'llm_reservations';
--   select count(*) from information_schema.role_table_grants
--    where table_name = 'llm_reservations' and grantee in ('anon','authenticated','PUBLIC');   -- muss 0 sein
--   select * from public.helmut_llm_budget_kennzahlen();
