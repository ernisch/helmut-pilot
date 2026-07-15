-- Helmut — LLM-Budget: atomare Call-Reservierung (Race-Fix)
-- ==============================================================================
-- BEFUND (Production, belegt): Das Budget-Gate war Read-then-Decide ueber dem
-- llmUsage-Log im Auth-Store-JSON-Dokument. Parallele Requests lasen denselben
-- alten Zaehlerstand und wurden gleichzeitig freigegeben; zusaetzlich konnte der
-- Voll-Upsert des Auth-Stores (last-write-wins) parallele Log-Eintraege
-- verlieren. Ergebnis: Limit 20, aber bis zu 185 echte Calls an einem Tag.
--
-- FIX: Dedizierter Tageszaehler + atomare Reservierungsfunktion. Die Reservierung
-- ist EIN INSERT..ON CONFLICT..WHERE-Statement — Postgres serialisiert
-- konkurrierende Upserts derselben (day,scope)-Zeile ueber den Row-Lock, korrekt
-- ueber beliebig viele Server-Instanzen/Vercel-Invocations hinweg.
--
-- FREIGABEPFLICHTIG: NICHT automatisch angewendet (Freigabepunkt, siehe
-- docs/betrieb/llm-budget-reservierung.md — dort auch Vorpruefung/Nachpruefung/
-- Rollback-Anleitung). Idempotent: mehrfaches Einspielen ist harmlos.
-- Sperrverhalten: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION nehmen
-- keine Sperren auf bestehende App-Tabellen; erwartete Dauer < 1 s; keine
-- Nutzerwirkung waehrend des Einspielens.
-- DSGVO: nur Zaehlerstaende pro Tag/Scope — keine Inhalte, keine PII.
-- Rollback: 20260717_llm_budget_reservation_rollback.sql (der App-Code faellt
-- dann erkennbar und geloggt auf das bisherige nicht-atomare Verhalten zurueck).

begin;

create table if not exists public.llm_budget_counters (
  day        text not null,                       -- UTC-Kalendertag "YYYY-MM-DD" (identisch zu dayKey() im App-Code)
  scope      text not null,                       -- 'global' heute; 'tenant:<id>' fuer spaetere Mandant-2-Unterdeckel reserviert
  used       integer not null default 0,          -- reservierte (= gestartete) Calls des Tages
  updated_at timestamptz not null default now(),
  primary key (day, scope)
);

comment on table public.llm_budget_counters is
  'Atomarer LLM-Tageszaehler (Race-Fix 2026-07). Eine Zeile pro Tag+Scope; Reservierung ausschliesslich ueber helmut_reserve_llm_call. Nur Zaehler — keine Inhalte/PII. Das llmUsage-Log im Auth-Store bleibt die Kosten-/Audit-Quelle.';

-- Atomare Reservierung: p_max = wirksamer Deckel fuer DIESE Reservierung
-- (Prioritaetsklassen setzt der App-Code: Understanding = volles Limit, alle
-- anderen Pfade = Limit minus Understanding-Reserve). p_max null = kein Limit
-- (Zaehler laeuft mit, immer erlaubt).
create or replace function public.helmut_reserve_llm_call(p_day text, p_scope text, p_max integer)
returns table(allowed boolean, used integer)
language plpgsql
as $$
declare
  v_used integer;
begin
  -- Deckel 0: nie ueber INSERT eine erste Reservierung zulassen.
  if p_max is not null and p_max <= 0 then
    select c.used into v_used from public.llm_budget_counters c
      where c.day = p_day and c.scope = p_scope;
    return query select false, coalesce(v_used, 0);
    return;
  end if;

  -- Das eigentliche atomare Statement: existiert die Zeile nicht, wird sie mit
  -- used=1 angelegt; existiert sie, wird NUR unterhalb des Deckels inkrementiert.
  -- Greift die WHERE-Bedingung nicht, liefert RETURNING keine Zeile -> abgelehnt.
  insert into public.llm_budget_counters as c (day, scope, used)
  values (p_day, p_scope, 1)
  on conflict (day, scope) do update
    set used = c.used + 1, updated_at = now()
    where p_max is null or c.used < p_max
  returning c.used into v_used;

  if v_used is not null then
    return query select true, v_used;
    return;
  end if;

  select c.used into v_used from public.llm_budget_counters c
    where c.day = p_day and c.scope = p_scope;
  return query select false, coalesce(v_used, 0);
end;
$$;

comment on function public.helmut_reserve_llm_call(text, text, integer) is
  'Reserviert atomar genau einen LLM-Call fuer (Tag, Scope) unterhalb p_max. Rueckgabe (allowed, used). Konkurrenzsicher ueber den Row-Lock des Upserts.';

-- Zugriff: NUR service_role (wie alle Backend-Pfade der App). Funktionen erhalten
-- in Postgres per Default EXECUTE fuer PUBLIC — das wird hier explizit entzogen.
revoke all on function public.helmut_reserve_llm_call(text, text, integer) from public, anon, authenticated;
revoke all on table public.llm_budget_counters from public, anon, authenticated;

-- RLS: intern, service_role-only (konsistent mit gate_shadow_events). BEWUSST
-- KEINE Policies — service_role umgeht RLS, alle anderen Rollen sehen nichts.
do $$
begin
  execute 'alter table public.llm_budget_counters enable row level security';
end $$;

commit;
