-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260825101500_jobqueue_ankunftskennzahl.sql
--
-- KEINE VORWÄRTSMIGRATION. Der Dateiname beginnt mit `rollback_` und trägt
-- deshalb keinen 14-stelligen Zeitstempel am Anfang — ein regulärer
-- Supabase-CLI-Lauf führt ihn nie als Vorwärtsmigration aus
-- (CLAUDE.md §4.8, testgesichert durch scripts/migrations-organisation-test.js).
--
-- WIRKUNG: entfernt genau die eine additiv angelegte Funktion. Da die Migration
-- nichts anderes anfasst — keine Tabelle, keine Spalte, keinen Index, keinen
-- Trigger, keine bestehende Funktion — ist das Zurücknehmen vollständig und
-- ohne Datenverlust. `helmut_job_metrics` und alle bestehenden Aufrufer bleiben
-- unberührt, weil die Migration sie nie verändert hat.
--
-- IDEMPOTENT: `if exists` — ein zweiter Lauf ist wirkungslos und bricht nicht ab.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

drop function if exists public.helmut_job_ankunft(integer);

commit;
