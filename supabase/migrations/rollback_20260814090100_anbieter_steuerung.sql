-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260814090100_anbieter_steuerung.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Kein fuehrender Zeitstempel: die Supabase CLI erkennt diese Datei NICHT als
-- Vorwaertsmigration und ueberspringt sie (empirisch belegt, Belegdatei §17.4).
--
-- Entfernt ausschliesslich, was die Vorwaertsmigration angelegt hat. helmut_jobs,
-- helmut_job_outbox, helmut_klassen_slots und llm_budget_counters werden NICHT angefasst —
-- der Rueckweg braucht keine Datenmigration. Die Zaehlerfenster sind reine Betriebsdaten
-- (keine politischen Inhalte, keine Mandatsdaten): ihr Verlust ist folgenlos, der naechste
-- Aufruf beginnt ein neues Fenster.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

drop function if exists public.helmut_anbieter_fenster_aufraeumen(integer, integer);
drop function if exists public.helmut_anbieter_kennzahlen();
drop function if exists public.helmut_anbieter_melde(text, boolean, integer, bigint, integer, text);
drop function if exists public.helmut_anbieter_reserviere(text, integer, integer, integer);

drop table if exists public.helmut_anbieter_schutzschalter;
drop table if exists public.helmut_anbieter_fenster;
