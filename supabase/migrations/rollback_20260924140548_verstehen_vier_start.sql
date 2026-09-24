-- Entfernt nur den vorbereiteten Einstieg. Quittung, Kosten, KO und CAS bleiben erhalten.
-- Nie waehrend eines laufenden Viererauftrags anwenden.
begin;
drop function if exists public.helmut_verstehen_vier_start(text,text,text,text,text);
commit;
