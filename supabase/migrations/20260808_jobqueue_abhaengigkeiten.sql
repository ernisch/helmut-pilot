-- Helmut — Arbeitswarteschlange: offene Vorbedingungen zaehlen (OP-30, Sprint V3-Anbindung)
-- ==============================================================================================
-- WARUM: der skalierbare Pfad trennt Planung und Verarbeitung. Damit ist die Reihenfolge
--   Abruf -> Verstehen -> Projektion -> Briefing
-- nicht mehr durch den Programmablauf gesichert, sondern nur noch durch die Faelligkeit. Die
-- Faelligkeit ist eine gute Naeherung (Phasenfenster: Projektion ab 50 %, Briefing ab 75 %),
-- aber sie ist eine ANNAHME ueber die Laufzeit, kein Nachweis. Diese Funktion macht daraus
-- eine Pruefung: ein Projektions- oder Briefingauftrag fragt, ob seine Vorbedingungen im
-- SELBEN Aktualitaetsfenster wirklich fertig sind.
--
-- WAS SIE NICHT TUT: sie blockiert nichts von sich aus und sie schreibt nichts. Sie zaehlt.
-- Die Entscheidung "warten statt duenne Lage bauen" trifft der Handler im App-Code, und er
-- stellt den Auftrag dann EHRLICH zurueck (er bleibt faellig), statt ihn scheitern zu lassen.
--
-- FREIGABEPFLICHTIG: NICHT automatisch angewendet. Idempotent (create or replace).
-- DSGVO: liest ausschliesslich Zaehlstaende der eigenen Warteschlangentabelle — keine
-- Inhalte, keine personenbezogenen Daten.
-- Rollback: 20260808_jobqueue_abhaengigkeiten_rollback.sql
-- Voraussetzung: 20260808_scalable_job_queue.sql ist eingespielt.

begin;

-- Zaehlt offene (= nicht abgeschlossene) Auftraege. `offen` = wartend + laeuft.
-- Endgueltig fehlgeschlagene Auftraege zaehlen BEWUSST NICHT als offen: sie kommen nicht
-- wieder, und ein Briefing darf nicht ewig auf einen Abruf warten, der nie gelingt. Genau
-- deshalb liefert die Funktion `fehlgeschlagen` mit — der Aufrufer soll den Unterschied
-- zwischen "noch nicht fertig" und "wird nie fertig" sehen und ihn benennen koennen.
-- BELEGTER FEHLER (Abschlussreview 2026-08-08, Befund O3 — hier behoben):
-- Die erste Fassung nahm GENAU EIN Fenster (`p_fenster text`) und verglich mit `=`.
-- Ein Projektions- oder Briefingauftrag traegt aber das 24-h-Mandatsfenster (`…T00Z`),
-- waehrend die geteilten Abrufe in 8-h-Fenstern liegen (`…T00Z`, `…T08Z`, `…T16Z`) und die
-- daraus entstehenden Verstehensauftraege das Fenster ihres Abrufs erben. Die Zaehlung sah
-- damit nur EIN DRITTEL der geteilten Vorbedingungen; zwei Drittel waren unsichtbar. Folge:
-- ein Briefing hielt sich fuer vorbedingungsfrei, obwohl 2/3 seiner Abrufe noch liefen —
-- duennere Lage, aber ohne dass irgendetwas es gemeldet haette.
--
-- Deshalb nimmt die Funktion jetzt eine LISTE von Fenstern. Welche Fenster zu einem Auftrag
-- gehoeren, entscheidet der App-Code (`scalable-pipeline.enthalteneFenster`): genau die
-- Fenster der konfigurierten Breiten, die VOLLSTAENDIG im Fenster des Auftrags liegen. Das
-- schliesst das 7-Tage-Archivfenster bewusst aus — ein Briefing darf nicht auf eine
-- Hintergrundsuche mit Wochenkadenz warten.
--
-- Die alte Signatur wird ausdruecklich entfernt, damit kein Aufrufer versehentlich auf der
-- Ein-Fenster-Fassung landet (`create or replace` kann den Parametertyp nicht aendern).
drop function if exists public.helmut_jobs_offen(text, text[]);

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

-- Index fuer genau diese Abfrage. Ohne ihn liest die Zaehlung bei 1 000 Mandaten (Groessen-
-- ordnung 66 000 Zeilen bei 14 Tagen Aufbewahrung) die ganze Tabelle, und zwar einmal je
-- Projektions- und Briefingauftrag — also 2 000-mal am Tag.
create index if not exists helmut_jobs_fenster_typ_idx
  on public.helmut_jobs (freshness_window, job_type, status);

-- ── ZURUECKSTELLEN statt Scheitern ───────────────────────────────────────────────────────
-- WARUM EINE EIGENE FUNKTION: `helmut_finish_job(..., p_ok := false, ...)` ist der Weg fuer
-- einen FEHLER — er zaehlt den Versuch, und nach `max_attempts` endet der Auftrag endgueltig
-- als `fehlgeschlagen`. Ein Auftrag, der nur auf seine Vorbedingung oder auf freies Budget
-- wartet, ist aber NICHT gescheitert. Wuerde man ihn ueber den Fehlerpfad zurueckstellen,
-- verbraeuchte reines Warten die Versuche und ein voellig gesunder Auftrag stuerbe nach
-- fuenf Runden Warten den Fehlertod — mit einem Fehlertext, der eine Stoerung behauptet,
-- die es nie gab.
--
-- Deshalb: eigener Weg, der den Versuch ZURUECKNIMMT. Der Auftrag kehrt in die Warteschlange
-- zurueck, mit neuer Faelligkeit und einem Vermerk, WARUM er wartet. Haltergebunden wie jeder
-- andere Abschluss: ein Fremder kann keinen laufenden Auftrag zurueckstellen.
create or replace function public.helmut_defer_job(
  p_id       uuid,
  p_owner    text,
  p_delay_ms bigint default 60000,
  p_grund    text default null
)
returns table(uebernommen boolean, neue_faelligkeit timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_due timestamptz;
begin
  update public.helmut_jobs j
     set status           = 'wartend',
         lease_owner      = null,
         lease_expires_at = null,
         -- Der Versuch wird zurueckgenommen: Warten ist kein Fehlversuch.
         attempts         = greatest(0, j.attempts - 1),
         due_at           = now() + (greatest(coalesce(p_delay_ms, 60000), 1000) * interval '1 millisecond'),
         last_error       = case when p_grund is null then j.last_error
                                 else 'zurueckgestellt: ' || left(p_grund, 200) end,
         updated_at       = now()
   where j.id = p_id
     and j.lease_owner = p_owner
     and j.status = 'laeuft'
  returning j.due_at into v_due;

  if v_due is null then
    return query select false, null::timestamptz;
    return;
  end if;
  return query select true, v_due;
end;
$$;

comment on function public.helmut_defer_job(uuid, text, bigint, text) is
  'OP-30: stellt einen laufenden Auftrag EHRLICH zurueck (Vorbedingung offen, Budget erschoepft) ohne ihn als Fehlversuch zu zaehlen. Haltergebunden.';

-- Kein Browserzugriff (identische Zusage wie die Basistabelle).
revoke all on function public.helmut_jobs_offen(text[], text[]) from public, anon, authenticated;
revoke all on function public.helmut_defer_job(uuid, text, bigint, text) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.helmut_jobs_offen(text[], text[]) to service_role';
    execute 'grant execute on function public.helmut_defer_job(uuid, text, bigint, text) to service_role';
  end if;
end
$$;

commit;

-- Nachpruefung (lesend):
--   select * from public.helmut_jobs_offen(array['2026-08-08T00Z','2026-08-08T08Z','2026-08-08T16Z'], array['source_fetch','document_understanding']);
--   select count(*) from pg_indexes where indexname = 'helmut_jobs_fenster_typ_idx';
