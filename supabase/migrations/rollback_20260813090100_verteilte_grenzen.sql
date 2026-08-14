-- ROLLBACK zu 20260813090100_verteilte_grenzen.sql — Klassengrenzen vollständig
-- entfernen. Entfernt AUSSCHLIESSLICH die in der Vorwärtsmigration angelegten
-- Objekte. Die App behandelt fehlende Funktionen fail closed als „Grenze
-- nicht verfügbar" und stellt betroffene Arbeit ehrlich zurück — es geht
-- kein Auftrag verloren.

begin;

drop function if exists public.helmut_klassen_kennzahlen();
drop function if exists public.helmut_klasse_gebe_frei(uuid, text);
drop function if exists public.helmut_klasse_belege(text, integer, bigint, text);

drop table if exists public.helmut_klassen_slots;
drop table if exists public.helmut_klassen_anker;

commit;

-- Verifikation (rein lesend):
--   select count(*) from information_schema.tables
--    where table_schema='public'
--      and table_name in ('helmut_klassen_anker','helmut_klassen_slots');  -- 0
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname like 'helmut_klasse%';         -- 0
