-- ROLLBACK zu 20260823043633_verstehen_aufgeben_erneut_freigegeben.sql —
-- stellt `helmut_verstehen_ausgang_aufloesen` byte-gleich in der Fassung aus
-- 20260814180000_verstehen_cas.sql wieder her (aufgeben ausschliesslich aus
-- `unbekannt`). KEIN DROP: die Funktion gehoert zum weiterhin angewendeten
-- CAS-Vertrag; entfernt wird nur die Erweiterung vom 2026-08-23.
--
-- WIRKUNG AUF DATEN: keine. Bereits per erweitertem `aufgeben` geschlossene
-- Zeilen (zustand='aufgegeben', letzter_grund='aufgegeben-nach-freigabe')
-- bleiben unveraendert stehen; `aufgegeben` war schon vorher ein gueltiger,
-- terminaler Zustand des Vertrags. Es entsteht kein Widerspruch — nur der
-- WEG dorthin aus `offen` ist danach wieder verschlossen.
--
-- WIRKUNG AUF DIE ANWENDUNG: keine Codeaenderung noetig; der einzige Aufrufer
-- (`storage.verstehenAusgangAufloesen`) reicht das Ergebnis unveraendert durch.
-- Ein `aufgeben` auf einen offenen markierten Vorgang meldet danach wieder
-- 'nicht-blockiert' (die Vertragsluecke aus Runbook §30.2 besteht dann erneut).

begin;

do $$
begin
  if to_regclass('public.helmut_verstehen_reservierungen') is null then
    raise exception 'rollback verstehen_aufgeben_erneut_freigegeben: public.helmut_verstehen_reservierungen fehlt — der CAS-Vertrag (20260814180000) ist nicht installiert, es gibt nichts zurueckzusetzen';
  end if;
end $$;

-- Wortgleiche Fassung aus 20260814180000_verstehen_cas.sql (§9).
create or replace function public.helmut_verstehen_ausgang_aufloesen(
  p_vorgang_id   text,
  p_entscheidung text
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r          public.helmut_verstehen_reservierungen%rowtype;
  v_ergebnis boolean;
begin
  select * into r
    from public.helmut_verstehen_reservierungen res
   where res.vorgang_id = p_vorgang_id
     for update;

  if not found then return 'unbekannter-vorgang'; end if;
  if r.zustand <> 'unbekannt' then return 'nicht-blockiert'; end if;

  -- Sichere Aufloesung zuerst: liegt das Ergebnis doch vor, braucht es keine
  -- Entscheidung und keinen zweiten Modellaufruf.
  select exists (
    select 1 from public.knowledge_objects k
     where k.vorgang_id = p_vorgang_id
       and coalesce(k.verstehen_fencing, -1) >= r.fencing
  ) into v_ergebnis;

  if v_ergebnis then
    update public.helmut_verstehen_reservierungen res
       set zustand = 'fertig', ergebnis_fencing = r.fencing, letzter_grund = 'ergebnis-nachtraeglich-belegt',
           updated_at = now()
     where res.vorgang_id = p_vorgang_id;
    return 'aufgeloest-ergebnis-vorhanden';
  end if;

  if p_entscheidung = 'erneut' then
    -- AUSDRUECKLICHE Zustimmung zu einem zweiten, bezahlten Modellaufruf.
    update public.helmut_verstehen_reservierungen res
       set zustand = 'offen', letzter_grund = 'erneut-freigegeben', updated_at = now()
     where res.vorgang_id = p_vorgang_id;
    return 'erneut-freigegeben';
  end if;

  if p_entscheidung = 'aufgeben' then
    update public.helmut_verstehen_reservierungen res
       set zustand = 'aufgegeben', letzter_grund = 'aufgegeben', updated_at = now()
     where res.vorgang_id = p_vorgang_id;
    return 'aufgegeben';
  end if;

  return 'entscheidung-unbekannt';
end;
$$;

comment on function public.helmut_verstehen_ausgang_aufloesen(text, text) is
  'Loest einen blockierten unbekannten Ausgang auf: automatisch, wenn das Ergebnis doch belegt vorliegt; sonst nur auf ausdrueckliche Entscheidung (erneut | aufgeben).';

-- Rechte erneut festschreiben (identische Lage wie 20260814180000).
revoke all on function public.helmut_verstehen_ausgang_aufloesen(text, text) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.helmut_verstehen_ausgang_aufloesen(text, text) to service_role';
  end if;
end $$;

commit;

-- Verifikation (rein lesend):
--   select public.helmut_verstehen_ausgang_aufloesen('gibt-es-nicht', 'aufgeben');
--     -- 'unbekannter-vorgang'
--   -- Ein offener Vorgang mit letzter_grund='erneut-freigegeben' meldet auf
--   -- 'aufgeben' danach wieder 'nicht-blockiert' (Altvertrag).
