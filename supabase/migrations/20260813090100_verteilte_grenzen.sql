-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  FREIGABEPFLICHTIG (Sprint „OP-30-Zielarchitektur", 2026-08-13) —
--     NICHT ANWENDEN OHNE AUSDRÜCKLICHE BETREIBERFREIGABE (CLAUDE.md §5).
--     Rollback: rollback_20260813090100_verteilte_grenzen.sql (gleiches Verzeichnis).
--     Voraussetzung: keine (eigenständig; von 20260813090000_jobqueue_outbox
--     unabhängig anwendbar).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- VERTEILTE ARBEITSKLASSENGRENZEN (OP-30, Zielarchitektur, Auftrag §12).
--
-- ANLASS: die bestehenden Parallelitätsgrenzen des Workers sind PROZESSLOKAL
-- (worker-betrieb.grenzenAusEnv klemmt 1–8 je Prozess; das Google-Gate in
-- google-news-hardening.js drosselt nur innerhalb eines Prozesses). Sobald
-- mehrere Worker-Instanzen gleichzeitig laufen (mehrere Serverless-
-- Invocations, ereignisgesteuerte Verbraucher, später ein externer Worker),
-- addieren sich diese Grenzen unkontrolliert: n Instanzen × 5 gleichzeitige
-- Google-Abrufe = 5n gegen denselben Anbieter. Das KI-Tagesbudget ist bereits
-- datenbankgestützt atomar (helmut_reserve_llm_call, 20260717, +
-- llm_reservations, 20260808) — diese Migration ergänzt das fehlende
-- Gegenstück für GLEICHZEITIGKEIT je Arbeitsklasse.
--
-- MODELL: ein Semaphor mit ablaufenden Slots.
--   * Ein Worker BELEGT vor der Arbeit einen Slot seiner Klasse
--     (helmut_klasse_belege) und GIBT ihn nach der Arbeit FREI
--     (helmut_klasse_gebe_frei).
--   * Jeder Slot trägt eine Ablaufzeit (TTL). Stürzt ein Worker ab, läuft
--     sein Slot ab und die Kapazität kehrt VON SELBST zurück — kein Reaper,
--     kein manueller Eingriff, keine dauerhafte Verklemmung.
--   * Die Zählung ist ATOMAR: alle Beleger einer Klasse serialisieren sich
--     über einen Row-Lock auf der Ankerzeile der Klasse (dasselbe bewährte
--     Muster wie der Row-Lock auf llm_budget_counters in
--     helmut_reserve_llm_result, Befund R4).
--   * FAIL CLOSED liegt in der App: ein DB-Fehler beim Belegen gilt als
--     „nicht erlaubt" — der Auftrag wird ehrlich zurückgestellt, nie ohne
--     Grenze gearbeitet (Auftrag §12.10).
--
-- WAS HIER BEWUSST NICHT LIEGT: Tages-/Kostendeckel (das ist die
-- llm_reservations-Schicht) und Fairness zwischen Mandaten (das ist der
-- Tagesplan aus llm-budget-fair). Diese Struktur begrenzt ausschließlich,
-- WIE VIELE Arbeiten einer Klasse GLEICHZEITIG laufen — anbieterbezogen und
-- instanzübergreifend.
--
-- DSGVO: Klassenname, Halter-Kennung (technische Worker-ID), Zeitstempel —
-- keine Inhalte, keine Mandate, keine URLs.

begin;

-- ── 1) Ankerzeile je Klasse (Serialisierungspunkt) ──────────────────────────
create table if not exists public.helmut_klassen_anker (
  klasse      text primary key,
  created_at  timestamptz not null default now()
);

comment on table public.helmut_klassen_anker is
  'OP-30: eine Ankerzeile je Arbeitsklasse. Ihr Row-Lock serialisiert alle Beleger derselben Klasse (Muster helmut_reserve_llm_result/R4).';

-- ── 2) Belegte Slots ────────────────────────────────────────────────────────
create table if not exists public.helmut_klassen_slots (
  id          uuid        primary key default gen_random_uuid(),
  klasse      text        not null,
  owner       text        not null,
  belegt_bis  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists helmut_klassen_slots_klasse_idx
  on public.helmut_klassen_slots (klasse, belegt_bis);

comment on table public.helmut_klassen_slots is
  'OP-30: aktive Gleichzeitigkeits-Slots je Arbeitsklasse. Abgelaufene Slots (belegt_bis < now) zaehlen nicht und werden beim naechsten Belegen derselben Klasse geloescht.';

-- ── 3) Slot belegen (atomar) ────────────────────────────────────────────────
create or replace function public.helmut_klasse_belege(
  p_klasse text,
  p_max    integer,
  p_ttl_ms bigint,
  p_owner  text
)
returns table(erlaubt boolean, slot uuid, belegt integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_belegt integer := 0;
  v_slot   uuid;
begin
  if p_klasse is null or length(trim(p_klasse)) = 0 then
    raise exception 'helmut_klasse_belege: p_klasse ist Pflicht';
  end if;
  if p_owner is null or length(trim(p_owner)) = 0 then
    raise exception 'helmut_klasse_belege: p_owner ist Pflicht';
  end if;

  -- Serialisierungspunkt: Ankerzeile anlegen (idempotent) und sperren. Ab
  -- hier kann kein zweiter Beleger derselben Klasse zwischen Zählung und
  -- Eintrag geraten.
  insert into public.helmut_klassen_anker (klasse) values (p_klasse)
  on conflict (klasse) do nothing;

  perform 1 from public.helmut_klassen_anker a
    where a.klasse = p_klasse
    for update;

  -- Abgelaufene Slots dieser Klasse aufräumen (Absturz-Selbstheilung).
  delete from public.helmut_klassen_slots s
   where s.klasse = p_klasse and s.belegt_bis < now();

  select count(*)::integer into v_belegt
    from public.helmut_klassen_slots s
   where s.klasse = p_klasse;

  if p_max is not null and v_belegt >= greatest(p_max, 0) then
    return query select false, null::uuid, v_belegt;
    return;
  end if;

  insert into public.helmut_klassen_slots (klasse, owner, belegt_bis)
  values (p_klasse, p_owner,
          now() + (greatest(coalesce(p_ttl_ms, 120000), 1000) * interval '1 millisecond'))
  returning id into v_slot;

  return query select true, v_slot, v_belegt + 1;
end;
$$;

comment on function public.helmut_klasse_belege(text, integer, bigint, text) is
  'Belegt atomar einen Gleichzeitigkeits-Slot der Klasse (Row-Lock auf der Ankerzeile). erlaubt=false wenn p_max erreicht. Abgelaufene Slots heilen sich beim naechsten Belegen selbst.';

-- ── 4) Slot freigeben (haltergebunden) ──────────────────────────────────────
create or replace function public.helmut_klasse_gebe_frei(
  p_slot  uuid,
  p_owner text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  delete from public.helmut_klassen_slots s
   where s.id = p_slot and s.owner = p_owner;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.helmut_klasse_gebe_frei(uuid, text) is
  'Gibt einen Slot frei — nur der eingetragene Halter. false = Slot war bereits abgelaufen/geraeumt (kein Fehler: die TTL hat uebernommen).';

-- ── 5) Kennzahlen (rein lesend) ─────────────────────────────────────────────
create or replace function public.helmut_klassen_kennzahlen()
returns table(klasse text, aktiv bigint, aeltester_s numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select s.klasse,
         count(*) filter (where s.belegt_bis >= now()),
         coalesce(max(extract(epoch from (now() - s.created_at))), 0)
    from public.helmut_klassen_slots s
   group by s.klasse;
$$;

comment on function public.helmut_klassen_kennzahlen() is
  'Aktive Slots je Arbeitsklasse (rein lesend).';

-- ── 6) Zugriff: ausschließlich serverseitig (zwei unabhängige Riegel) ───────
alter table public.helmut_klassen_anker enable row level security;
alter table public.helmut_klassen_anker force row level security;
alter table public.helmut_klassen_slots enable row level security;
alter table public.helmut_klassen_slots force row level security;
revoke all on table public.helmut_klassen_anker from public, anon, authenticated;
revoke all on table public.helmut_klassen_slots from public, anon, authenticated;

revoke all on function public.helmut_klasse_belege(text, integer, bigint, text) from public, anon, authenticated;
revoke all on function public.helmut_klasse_gebe_frei(uuid, text)               from public, anon, authenticated;
revoke all on function public.helmut_klassen_kennzahlen()                       from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.helmut_klassen_anker to service_role';
    execute 'grant select, insert, update, delete on table public.helmut_klassen_slots to service_role';
    execute 'grant execute on function public.helmut_klasse_belege(text, integer, bigint, text) to service_role';
    execute 'grant execute on function public.helmut_klasse_gebe_frei(uuid, text) to service_role';
    execute 'grant execute on function public.helmut_klassen_kennzahlen() to service_role';
  end if;
end $$;

commit;

-- ── Verifikation nach der Anwendung (rein lesend) ───────────────────────────
--   select count(*) from information_schema.tables
--    where table_schema='public'
--      and table_name in ('helmut_klassen_anker','helmut_klassen_slots');   -- 2
--   select relname, relrowsecurity, relforcerowsecurity from pg_class
--    where relname in ('helmut_klassen_anker','helmut_klassen_slots');      -- t/t je Zeile
--   select count(*) from information_schema.role_table_grants
--    where table_name in ('helmut_klassen_anker','helmut_klassen_slots')
--      and grantee in ('anon','authenticated','PUBLIC');                    -- 0
