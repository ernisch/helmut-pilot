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
-- ── KORREKTUR 2026-08-09 (Befund R4 und R4b) ────────────────────────────────────────────────
-- R4 (DOPPELTE VERBUCHUNG, an echter PostgreSQL 16.13 gemessen): die erste Fassung dieser
-- Migration erhoehte `llm_budget_counters` SELBST — und der tatsaechliche Modellaufruf laeuft
-- danach durch den Choke-Point `helmut_reserve_llm_call` (ai.js `requestOpenAI`, der EINZIGE
-- Ort, an dem ein Modell gerufen wird), der DIESELBE Zeile ein zweites Mal erhoeht. Ein
-- fachlicher Aufruf ergab `global.used = 2`. Der dokumentierte Deckelbedarf war damit in
-- Zaehlereinheiten doppelt so hoch, und ein Tagesdeckel haette bei der HAELFTE der Aufrufe
-- geschlossen.
--
-- DIE REGEL, DIE DARAUS FOLGT — EIN BUCH, EIN SCHREIBER:
--   * `llm_budget_counters` ist das Buch der TATSAECHLICH GETAETIGTEN Modellaufrufe. Einziger
--     Schreiber bleibt `helmut_reserve_llm_call` am Choke-Point. Diese Migration schreibt die
--     Tabelle NICHT MEHR — sie liest sie nur und nimmt auf der globalen Zeile den Row-Lock,
--     der alle Reservierer und den Choke-Point gegeneinander serialisiert.
--   * `llm_reservations` ist das Buch der ABSICHTEN (Reservierungen). Es traegt die
--     Idempotenz je Ergebnis und den Bereichsverbrauch (Mandantenanteil, Verstehensanteil).
--   * BELEGUNG des Tagesdeckels = getaetigte Aufrufe (`llm_budget_counters.global`)
--     + laufende Reservierungen (`status = 'reserviert'`). Nach dem Abschluss einer
--     Reservierung steht die Buchung genau EINMAL im Buch — die des Choke-Points.
--   * Es gibt KEINE ausgleichende Ruecknahme mehr (kein `used = used - 1`). Genau diese
--     Lesen-Aendern-Schreiben-Kompensation ist die Bauform, vor der CLAUDE.md §4.10 warnt.
--   * SELBSTKORRIGIEREND: scheiterte ein Auftrag VOR dem Modellaufruf, hat der Choke-Point
--     nichts gebucht — die Belegung faellt beim Abschluss von selbst auf den wahren Stand
--     zurueck. Ein Aufruf, der stattfand und scheiterte, bleibt gebucht (die Kosten sind
--     entstanden und duerfen nicht verschwinden).
--
-- R4b (STILL WIRKUNGSLOSER DECKEL): `p_scope_max` wurde nur fuer `p_scope <> 'global'`
-- ausgewertet. Der App-Code uebergibt fuer GLOBALE Arbeit (Verstehen) aber genau dort den
-- `globalerTopf` — die Reserve, die verhindert, dass das Verstehen den Tagesdeckel leerraeumt
-- und die sichtbaren Lage-Narrative ausfallen. Dieser Deckel wurde berechnet, uebergeben und
-- in SQL verworfen. Er gilt jetzt fuer JEDEN Bereich, `global` eingeschlossen.
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
-- p_scope_max  = Deckel DIESES Bereichs am Tag (Mandantenanteil bzw. Verstehensanteil;
--                null = kein Bereichsdeckel)
-- p_global_max = globales Notfalllimit         (null = kein globales Limit)
--
-- ATOMARITAET (beide Deckel in einem Schritt): die Funktion nimmt als ERSTES den Row-Lock auf
-- `llm_budget_counters(p_day,'global')`. Ueber dieselbe Zeile laeuft der Choke-Point
-- `helmut_reserve_llm_call`; damit sind Reservierer untereinander UND gegen den tatsaechlichen
-- Aufruf serialisiert. Zwischen Pruefung und Eintrag der Reservierung kann niemand dazwischen.
-- Geschrieben wird die Zaehlertabelle hier NICHT (Befund R4, siehe Kopf).
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
  v_gebucht   integer := 0;   -- tatsaechlich getaetigte Aufrufe des Tages (Choke-Point)
  v_offen     integer := 0;   -- laufende Reservierungen des Tages
  v_global    integer := 0;   -- Belegung des Tagesdeckels = gebucht + offen
  v_scope     integer := 0;   -- Belegung dieses Bereichs (aus dem Reservierungsbuch)
begin
  if p_result_key is null or length(trim(p_result_key)) = 0 then
    raise exception 'helmut_reserve_llm_result: p_result_key ist Pflicht';
  end if;
  if p_day is null or length(trim(p_day)) = 0 then
    raise exception 'helmut_reserve_llm_result: p_day ist Pflicht';
  end if;

  -- (0) SERIALISIERUNGSPUNKT. Die globale Tageszeile ist der EINE Punkt, an dem sich
  --     Reservierer und Choke-Point treffen. Ein Row-Lock darauf macht alles Folgende
  --     atomar — ohne dass hier ein Zaehler geschrieben wuerde. Die Zeile wird bei Bedarf
  --     mit `used = 0` angelegt; das ist KEINE Buchung, sondern nur der Ankerpunkt des
  --     Locks (`helmut_reserve_llm_call` verhaelt sich auf einer vorhandenen 0-Zeile exakt
  --     wie auf einer fehlenden).
  insert into public.llm_budget_counters (day, scope, used)
  values (p_day, 'global', 0)
  on conflict (day, scope) do nothing;

  select c.used into v_gebucht from public.llm_budget_counters c
   where c.day = p_day and c.scope = 'global'
   for update;

  -- (1) IDEMPOTENZ. Existiert schon eine Reservierung fuer dieses Ergebnis, wird sie
  --     WIEDERVERWENDET — egal ob sie noch offen ist oder bereits verbraucht wurde. Eine
  --     Wiederholung desselben Auftrags kostet damit NICHTS zusaetzlich.
  select * into v_vorhanden from public.llm_reservations r
   where r.result_key = p_result_key
   for update;

  if found and v_vorhanden.status = 'zurueckgegeben' then
    -- Ausdruecklich zurueckgegeben (der Aufrufer hat gemeldet: Aufruf fand NIE statt).
    -- Dann darf und muss neu reserviert werden — dafuer faellt die Zeile unten wieder an.
    delete from public.llm_reservations where result_key = p_result_key;
  elsif found then
    select count(*)::integer into v_offen from public.llm_reservations r
     where r.day = p_day and r.status = 'reserviert';
    select count(*)::integer into v_scope from public.llm_reservations r
     where r.day = p_day and r.scope = p_scope
       and r.status in ('reserviert','verbraucht','fehlgeschlagen');
    return query select true, true, 'bereits-reserviert'::text,
                        coalesce(v_gebucht,0) + v_offen, v_scope;
    return;
  end if;

  -- (2) BELEGUNG ERMITTELN. Zwei Zahlen, beide unter demselben Lock gelesen:
  --     global = was heute wirklich gerufen wurde + was gerade laeuft;
  --     bereich = was dieser Bereich heute an Absichten verbucht hat (laufend, verbraucht
  --     oder gescheitert — eine zurueckgegebene Absicht zaehlt bewusst NICHT).
  select count(*)::integer into v_offen from public.llm_reservations r
   where r.day = p_day and r.status = 'reserviert';
  v_global := coalesce(v_gebucht, 0) + v_offen;

  select count(*)::integer into v_scope from public.llm_reservations r
   where r.day = p_day and r.scope = p_scope
     and r.status in ('reserviert','verbraucht','fehlgeschlagen');

  -- (3) BEREICHSDECKEL zuerst. Der engere Deckel wird zuerst geprueft; er gilt fuer JEDEN
  --     Bereich — auch fuer `global`, wo er den Verstehensanteil begrenzt (Befund R4b).
  if p_scope_max is not null and v_scope >= greatest(p_scope_max, 0) then
    return query select false, false,
      (case when p_scope = 'global' then 'verstehensanteil-erschoepft'
            else 'mandantenanteil-erschoepft' end)::text,
      v_global, v_scope;
    return;
  end if;

  -- (4) GLOBALES NOTFALLLIMIT.
  if p_global_max is not null and v_global >= greatest(p_global_max, 0) then
    return query select false, false, 'globales-notfalllimit-erreicht'::text, v_global, v_scope;
    return;
  end if;

  -- (5) Die Reservierung festschreiben. Erst JETZT — beide Deckel haben getragen. Der Lock
  --     aus (0) haelt bis zum Ende der Transaktion, deshalb kann zwischen Pruefung und
  --     Eintrag kein zweiter Reservierer dazwischenkommen.
  insert into public.llm_reservations (result_key, day, scope, work_class, status, expires_at)
  values (p_result_key, p_day, p_scope, coalesce(p_work_class, 'notwendig'), 'reserviert',
          now() + (greatest(coalesce(p_ttl_ms, 900000), 1000) * interval '1 millisecond'))
  on conflict (result_key) do nothing;

  return query select true, false, null::text, v_global + 1, v_scope + 1;
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
begin
  -- Seit der R4-Korrektur ist die Rueckgabe ein reiner Zustandswechsel: die Belegung
  -- errechnet sich aus den Buechern, es gibt keinen Zaehler zurueckzudrehen. Damit
  -- verschwindet auch die letzte Lesen-Aendern-Schreiben-Kompensation (CLAUDE.md §4.10) —
  -- eine zurueckgegebene Absicht zaehlt weder global (`status <> 'reserviert'`) noch im
  -- Bereich (`status not in ('reserviert','verbraucht','fehlgeschlagen')`).
  update public.llm_reservations r
     set status = 'zurueckgegeben', settled_at = now(), note = coalesce(p_note, r.note)
   where r.result_key = p_result_key
     and r.status = 'reserviert';

  if not found then
    return query select false;
    return;
  end if;

  return query select true;
end;
$$;

-- ── Kennzahlen (nur lesend) ──────────────────────────────────────────────────────────────
-- `global_verbraucht` ist seit der R4-Korrektur, was der Name sagt: die Zahl der
-- TATSAECHLICH getaetigten Modellaufrufe des Tages (das Buch des Choke-Points). Die Belegung
-- des Deckels steht daneben als `global_belegt` = verbraucht + laufende Reservierungen.
-- Die Mandantenzahlen kommen aus dem Reservierungsbuch, nicht mehr aus der Zaehlertabelle —
-- dort schreibt die Fairnessschicht nichts mehr.
-- Rueckgabetyp geaendert -> `drop` vor `create` (`create or replace` kann ihn nicht aendern).
drop function if exists public.helmut_llm_budget_kennzahlen(text);
create function public.helmut_llm_budget_kennzahlen(p_day text default null)
returns table(
  tag                    text,
  global_verbraucht      integer,
  global_belegt          integer,
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
  with tag as (select coalesce(p_day, to_char(now() at time zone 'utc', 'YYYY-MM-DD')) as d),
  bereich as (
    select r.scope, count(*)::integer as belegt
      from public.llm_reservations r, tag
     where r.day = tag.d and r.scope <> 'global'
       and r.status in ('reserviert','verbraucht','fehlgeschlagen')
     group by r.scope
  )
  select
    (select d from tag),
    coalesce((select c.used from public.llm_budget_counters c, tag where c.day = tag.d and c.scope = 'global'), 0),
    coalesce((select c.used from public.llm_budget_counters c, tag where c.day = tag.d and c.scope = 'global'), 0)
      + (select count(*)::integer from public.llm_reservations r, tag where r.day = tag.d and r.status = 'reserviert'),
    (select count(*) from bereich),
    (select count(*) from public.llm_reservations r, tag where r.day = tag.d),
    (select count(*) from public.llm_reservations r, tag where r.day = tag.d and r.status = 'reserviert'),
    (select count(*) from public.llm_reservations r, tag where r.day = tag.d and r.status = 'verbraucht'),
    (select count(*) from public.llm_reservations r, tag where r.day = tag.d and r.status = 'fehlgeschlagen'),
    (select count(*) from public.llm_reservations r, tag where r.day = tag.d and r.status = 'zurueckgegeben'),
    (select count(*) from public.llm_reservations r, tag where r.day = tag.d and r.work_class = 'notwendig'),
    (select count(*) from public.llm_reservations r, tag where r.day = tag.d and r.work_class = 'optional'),
    coalesce((select max(belegt) from bereich), 0);
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
