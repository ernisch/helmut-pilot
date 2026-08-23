-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  FREIGABEPFLICHTIG (Sprint „Vertragslücke aufgeben aus offen", 2026-08-23) —
--     NICHT ANWENDEN OHNE AUSDRÜCKLICHE BETREIBERFREIGABE (CLAUDE.md §5).
--     Rollback: rollback_20260823043633_verstehen_aufgeben_erneut_freigegeben.sql
--     (gleiches Verzeichnis — stellt die Funktionsfassung aus 20260814180000
--     byte-gleich wieder her).
--     Voraussetzung: 20260814180000_verstehen_cas.sql ist angewendet UND das
--     Kernschema (knowledge_objects, ko_document_links) existiert.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ANLASS (belegt im Betreibersprint 2026-08-22, Runbook §30.2 und CURRENT_STATE):
-- `helmut_verstehen_ausgang_aufloesen` ist der EINZIGE Schreiber von
-- `zustand='aufgegeben'` und löst bisher AUSSCHLIESSLICH `zustand='unbekannt'`
-- auf. Runbook §30.2 verspricht aber: „ein strukturell unlösbarer Vorgang bleibt
-- in der Liste, bis ein Betreiber ihn per `aufgeben` schließt." Der Fall ist
-- real: `df1a6700` steht auf `offen` mit `letzter_grund='erneut-freigegeben'`,
-- hat kein Wissensobjekt und keine verknüpften Dokumente; der reguläre
-- Wiederaufnahmepfad bietet ihn korrekt an und beendet ihn jedes Mal kostenfrei
-- als `skipped-no-cluster`. Der zugesagte Betreiberabschluss (`aufgeben`) war
-- vertraglich unmöglich — die Behandlung am 22.08. endete deshalb BLOCKIERT.
--
-- WAS DIESE MIGRATION ÄNDERT — genau EINE Erweiterung, sonst nichts:
--
--   `aufgeben` wird zusätzlich erlaubt für exakt den Fall
--     * zustand = 'offen'
--     * letzter_grund = 'erneut-freigegeben'  (der Marker, den NUR der
--       kanonische Betreiberweg `aufloesen(..., 'erneut')` schreibt; die
--       App-Freigaben schreiben andere Literale bzw. den Präfix
--       'belegt-ohne-aufruf:')
--     * kein Besitzer und keine Lease (besitzer IS NULL, lease_bis IS NULL)
--     * kein Wissensobjekt zu dieser Vorgangskennung
--     * keine verknüpften Dokumente zu dieser Vorgangskennung
--     * ausdrückliche Entscheidung p_entscheidung = 'aufgeben'
--   Alle Bedingungen werden ATOMAR unter dem bestehenden Row-Lock der
--   Vorgangszeile geprüft (SELECT … FOR UPDATE — unverändert dieselbe
--   Sperrlogik wie bisher; `reserviere`/`speichere` serialisieren auf
--   derselben Zeile, ein zeitgleicher Lauf kann daher keinen Widerspruch
--   erzeugen: gewinnt die Reservierung, ist der Marker verbraucht und
--   `aufgeben` läuft ins Leere; gewinnt `aufgeben`, verweigert `reserviere`
--   mit grund='aufgegeben').
--
-- WAS SICH NICHT ÄNDERT:
--   * Signatur (text, text), Rückgabetyp text, LANGUAGE plpgsql,
--     SECURITY INVOKER, search_path = public, pg_temp (Supabase-Best-Practice:
--     invoker + fester search_path; Doku „Database Functions", Stand 2026-08).
--   * Rechte: EXECUTE nur service_role; public/anon/authenticated bleiben
--     entzogen (wird unten erneut festgeschrieben — CREATE OR REPLACE erhält
--     ACLs, die erneute Festschreibung macht die Datei selbsttragend).
--   * Das Verhalten für JEDEN anderen Zustand und jede andere Entscheidung:
--     `unbekannt` + pruefen/erneut/aufgeben, die automatische Auflösung bei
--     belegtem Ergebnis, `nicht-blockiert` für fertig/reserviert/modell-laeuft
--     und für offene Vorgänge OHNE den Marker — alles byte-gleich zur Fassung
--     aus 20260814180000.
--   * Zähler und Werte: versuche, ki_aufrufe, fencing, ergebnis_fencing,
--     ergebnis_hash, eingabe_hash werden vom neuen Pfad nicht berührt.
--
-- WAS DIESE MIGRATION AUSDRÜCKLICH NICHT ERMÖGLICHT:
--   * beliebige offene Vorgänge aufzugeben (Marker-Pflicht),
--   * einen laufenden/reservierten Vorgang aufzugeben (zustand='offen'-Pflicht
--     plus Besitzer-/Lease-Riegel; reserviert/modell-laeuft bleiben
--     'nicht-blockiert'),
--   * einen Vorgang mit Dokumentgrundlage abzubrechen (Wissensobjekt- und
--     Verknüpfungsriegel — die `ba50848e`-Klasse mit bestehendem complete-KO
--     bleibt dem Wiederaufnahmepfad vorbehalten),
--   * Rechteausweitung (identische GRANT-/REVOKE-Lage),
--   * Mandanten-/Fremdzugriff (die Tabellen tragen keine Mandantenspalte; ein
--     Vorgang wird global genau einmal verstanden, und aufrufbar bleibt die
--     Funktion ausschließlich für service_role).
--
-- EHRLICHE GRENZE: Die Datenbank prüft die PERSISTIERTE Grundlage DIESER
-- Vorgangskennung (knowledge_objects.vorgang_id und deren ko_document_links).
-- Die app-seitige Kennungssuche des Wiederaufnahmepfads (Präfix-Rückfallebene)
-- kann sie nicht nachbilden — muss sie auch nicht: ein Präfix-Treffer wäre die
-- Grundlage eines ANDEREN Vorgangs, und hätte die Rückfallebene für DIESEN
-- Vorgang etwas gefunden, wäre er reserviert worden und der Marker verbraucht.
-- Ein stehender Marker bei leerer Grundlage ist genau der §30.2-Fall.
--
-- DSGVO: unverändert — Vorgangskennung, Zustände, Zeitstempel. Keine Inhalte,
-- keine Mandate, keine URLs, keine Namen.

begin;

-- ── 0) Vorbedingungen: dies ist ein NACHTRAG zu 20260814180000 ──────────────
-- Ohne den installierten CAS-Vertrag (oder ohne Kernschema) bricht die
-- Migration laut ab, statt eine alleinstehende Funktion zu erzeugen.
do $$
begin
  if to_regclass('public.helmut_verstehen_reservierungen') is null then
    raise exception 'verstehen_aufgeben_erneut_freigegeben: public.helmut_verstehen_reservierungen fehlt — zuerst 20260814180000_verstehen_cas.sql anwenden';
  end if;
  if to_regprocedure('public.helmut_verstehen_ausgang_aufloesen(text, text)') is null then
    raise exception 'verstehen_aufgeben_erneut_freigegeben: public.helmut_verstehen_ausgang_aufloesen(text, text) fehlt — zuerst 20260814180000_verstehen_cas.sql anwenden';
  end if;
  if to_regclass('public.knowledge_objects') is null then
    raise exception 'verstehen_aufgeben_erneut_freigegeben: public.knowledge_objects fehlt — diese Migration setzt das Kernschema voraus';
  end if;
  if to_regclass('public.ko_document_links') is null then
    raise exception 'verstehen_aufgeben_erneut_freigegeben: public.ko_document_links fehlt — diese Migration setzt das Kernschema voraus';
  end if;
end $$;

-- ── 1) Die erweiterte Funktion ──────────────────────────────────────────────
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

  -- ── ENGE AUSNAHME (2026-08-23, Runbook §30.2): Betreiberabschluss einer ────
  --    dauerhaft folgenlosen Wiederaufnahme-Freigabe.
  --
  -- `offen` + `letzter_grund='erneut-freigegeben'` ist der Marker, den
  -- AUSSCHLIESSLICH der kanonische Betreiberweg (`aufloesen(..., 'erneut')`)
  -- schreibt. Bleibt er stehen, hat KEIN Lauf den Vorgang je reserviert
  -- (`reserviere` setzt letzter_grund bei jeder Übernahme auf NULL) — die
  -- Freigabe war folgenlos. Fehlt zusätzlich jede persistierte Grundlage
  -- (kein Wissensobjekt, keine Dokumentverknüpfung), endet jeder künftige Lauf
  -- ehrlich als `skipped-no-cluster`, ohne Modellaufruf, für immer. Genau
  -- diesen einen Fall darf der Betreiber ausdrücklich beenden.
  --
  -- Alles andere an `offen` bleibt unverändert 'nicht-blockiert' — auch
  -- `pruefen`/`erneut` auf einem markierten Vorgang, auch `aufgeben` auf einem
  -- offenen Vorgang ohne Marker.
  if r.zustand = 'offen' then
    if p_entscheidung is distinct from 'aufgeben'
       or r.letzter_grund is distinct from 'erneut-freigegeben' then
      return 'nicht-blockiert';
    end if;
    -- Zweiter Riegel gegen einen laufenden/vorgemerkten Halter. Nach dem
    -- Vertrag ist beides in `offen` bereits NULL (alle Wege nach `offen`
    -- räumen Besitzer und Lease); steht hier trotzdem etwas, ist die Zeile
    -- vertragswidrig verändert worden — dann wird NICHT aufgegeben.
    if r.besitzer is not null or r.lease_bis is not null then
      return 'aufgeben-verweigert-besitz';
    end if;
    -- Dokumentgrundlage: Wissensobjekt zu dieser Kennung ODER verknüpfte
    -- Dokumente (ko_document_links hängt per FK am Wissensobjekt; die zweite
    -- Prüfung ist ein eigenständiger Riegel für den Fall, dass diese Kopplung
    -- je gelockert wird). Ein Vorgang mit Grundlage gehört dem
    -- Wiederaufnahmepfad, nie diesem Abschluss.
    if exists (
         select 1 from public.knowledge_objects k
          where k.vorgang_id = p_vorgang_id
       )
       or exists (
         select 1
           from public.ko_document_links l
           join public.knowledge_objects k2 on k2.id = l.knowledge_object_id
          where k2.vorgang_id = p_vorgang_id
       ) then
      return 'aufgeben-verweigert-dokumentgrundlage';
    end if;
    -- Alle Riegel offen: ausdrücklicher Betreiberabschluss. Zähler
    -- (versuche, ki_aufrufe), fencing und ergebnis_* bleiben unberührt;
    -- `letzter_grund` dokumentiert die Herkunft dieses Abschlusses und nimmt
    -- die Zeile zugleich aus der Wiederaufnahmeliste (§30.2-Filter).
    update public.helmut_verstehen_reservierungen res
       set zustand       = 'aufgegeben',
           letzter_grund = 'aufgegeben-nach-freigabe',
           updated_at    = now()
     where res.vorgang_id = p_vorgang_id;
    return 'aufgegeben';
  end if;

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
  'Loest einen blockierten unbekannten Ausgang auf: automatisch, wenn das Ergebnis doch belegt vorliegt; sonst nur auf ausdrueckliche Entscheidung (erneut | aufgeben). Zusaetzlich (2026-08-23, Runbook §30.2) schliesst aufgeben genau EINEN offenen Fall: zustand=offen mit letzter_grund=erneut-freigegeben ohne Besitzer, Lease, Wissensobjekt und Dokumentverknuepfung.';

-- ── 2) Rechte erneut festschreiben (identische Lage wie 20260814180000) ─────
-- CREATE OR REPLACE erhaelt bestehende ACLs; die erneute Festschreibung macht
-- diese Datei unabhaengig von der Anwendungsreihenfolge selbsttragend und
-- verhindert jede stille Rechteausweitung.
revoke all on function public.helmut_verstehen_ausgang_aufloesen(text, text) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.helmut_verstehen_ausgang_aufloesen(text, text) to service_role';
  end if;
end $$;

commit;

-- ── Verifikation nach der Anwendung (rein lesend) ───────────────────────────
--   select prosecdef, proconfig from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname='helmut_verstehen_ausgang_aufloesen';
--     -- f | {"search_path=public, pg_temp"}
--   select count(*) from information_schema.routine_privileges
--    where routine_name='helmut_verstehen_ausgang_aufloesen'
--      and grantee in ('anon','authenticated','PUBLIC');                        -- 0
--   -- Der Zielfall (df1a6700) wird damit aufloesbar; ANWENDUNG AUF PRODUCTION
--   -- UND der anschliessende Aufruf bleiben einzeln freigabepflichtig:
--   --   select public.helmut_verstehen_ausgang_aufloesen('<vorgang>', 'aufgeben');
