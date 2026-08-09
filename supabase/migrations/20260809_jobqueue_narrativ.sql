-- Helmut — Arbeitswarteschlange: fuenfter Auftragstyp `tenant_narrative` (E1, 2026-08-09)
-- ==============================================================================================
-- ENTSCHEIDUNG E1 (Gruenderfreigabe nach dem Merge von PR #235): das Lage-Narrativ — der
-- einzige mandatsbezogene KI-Pfad, bisher ausschliesslich im Cron `lage-briefing` in EINEM
-- 300-Sekunden-Slot — wird als fuenfter Auftragstyp in die bestehende Warteschlange
-- integriert. Bei 200 Mandaten ist der Einzelslot eine eigene Kapazitaetsgrenze
-- (Production-Metadaten: Median 5,1 s, p95 24,3 s je Aufruf; einzelne Aufrufe liefen laenger
-- als der gesamte Slot — 4 von 134 ueber 120 s, Maximum 472 s).
--
-- WAS DIESE MIGRATION TUT — und ALLES, was sie tut: sie erweitert die CHECK-Menge der
-- Auftragstypen um `tenant_narrative`. Genau der "Ein-Zeilen-Migrationsschritt", den die
-- Basismigration 20260808_scalable_job_queue.sql fuer neue Typen vorgesehen hat (Kommentar
-- an `job_type`: "bewusst als CHECK statt ENUM"). Keine neue Tabelle, keine neue Spalte,
-- keine neue Funktion, keine Rechteaenderung: Einreihen, Reservieren, Abschluss,
-- Zurueckstellen, Vorbedingungen und Metriken sind typneutral gebaut und arbeiten mit dem
-- neuen Typ unveraendert.
--
-- VERHALTENSNEUTRAL OHNE FLAGS: die Migration allein erzeugt keinen einzigen Auftrag.
-- Auftraege des neuen Typs entstehen ausschliesslich, wenn ZWEI Flags gesetzt sind
-- (`HELMUT_SCALABLE_PIPELINE` UND `HELMUT_NARRATIV_QUEUE`, beide default AUS, fail closed).
--
-- FREIGABEPFLICHTIG: NICHT automatisch angewendet. Idempotent (drop + add desselben
-- Constraints; mehrfaches Einspielen ist harmlos).
-- DSGVO: reine Typmengen-Erweiterung an der eigenen Warteschlangentabelle — keine Inhalte,
-- keine personenbezogenen Daten, keine Loeschung.
-- Rollback: 20260809_jobqueue_narrativ_rollback.sql
-- Voraussetzung: 20260808_scalable_job_queue.sql ist eingespielt.
-- Reihenfolge zu 20260809_jobqueue_wiedervorlage.sql: beliebig (beide haengen nur an der
-- Basistabelle, nicht aneinander).

begin;

alter table public.helmut_jobs
  drop constraint if exists helmut_jobs_type_chk;

alter table public.helmut_jobs
  add constraint helmut_jobs_type_chk
  check (job_type in ('source_fetch', 'document_understanding',
                      'mandate_projection', 'briefing_materialization',
                      'tenant_narrative'));

comment on constraint helmut_jobs_type_chk on public.helmut_jobs is
  'Zulaessige Auftragstypen. tenant_narrative (E1, 2026-08-09): Lage-Narrativ je Mandat und 24-h-Fenster; Handler ruft die unveraenderte Produktionsfunktion lage.buildLageBriefing auf.';

commit;

-- Nachpruefung (lesend):
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'helmut_jobs_type_chk';
--   -- muss alle fuenf Typen enthalten.
