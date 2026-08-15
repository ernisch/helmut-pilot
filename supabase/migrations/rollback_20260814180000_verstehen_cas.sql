-- ROLLBACK zu 20260814180000_verstehen_cas.sql — den atomaren Verstehensvertrag
-- vollständig entfernen. Entfernt AUSSCHLIESSLICH die in der Vorwärtsmigration
-- angelegten Objekte.
--
-- WIRKUNG AUF DIE ANWENDUNG: `lib/helmut/verstehen-vertrag.js` behandelt fehlende
-- Funktionen FAIL CLOSED — ein Verstehenslauf wird dann ehrlich zurückgestellt
-- (`skipped-cluster-belegt`, Grund `vertrag-nicht-pruefbar`), nie ungeschützt
-- ausgeführt. Mit `HELMUT_VERSTEHEN_CAS` = aus (Standard) berührt der Rollback
-- gar nichts: der Altpfad (Karten-Store im Auth-Store) läuft unverändert weiter.
--
-- DATENVERLUST: die Reservierungs- und Vormerkungszeilen gehen verloren. Beides
-- ist ARBEITSZUSTAND, kein Inhalt — Wissensobjekte, Rohdokumente und
-- Verknüpfungen bleiben unangetastet. Ein verlorener `unbekannt`-Zustand würde
-- den betroffenen Vorgang beim nächsten Lauf allerdings wieder freigeben und
-- damit einen zweiten Modellaufruf erlauben; wer das vermeiden will, exportiert
-- vorher:
--   select vorgang_id, fencing, zustand, letzter_grund
--     from public.helmut_verstehen_reservierungen where zustand = 'unbekannt';
--
-- Die Spalte knowledge_objects.verstehen_fencing wird MIT entfernt, weil sie ohne
-- den Trigger keine Zusage mehr trägt und ein zurückbleibender Wert einen
-- späteren Neuaufbau des Vertrags verfälschen würde (alte, hohe Fencing-Werte
-- gegen einen wieder bei 0 startenden Zähler).

begin;

drop trigger if exists helmut_ko_fencing_wache_trg on public.knowledge_objects;
drop function if exists public.helmut_ko_fencing_wache();

drop function if exists public.helmut_verstehen_kennzahlen();
drop function if exists public.helmut_verstehen_vormerkung_loese(text, bigint);
drop function if exists public.helmut_verstehen_vormerkung_lese(text[]);
drop function if exists public.helmut_verstehen_vormerkung_erhoehe(text, integer, bigint);
drop function if exists public.helmut_verstehen_ausgang_aufloesen(text, text);
drop function if exists public.helmut_verstehen_ausgang_unbekannt(text, text, bigint, text);
drop function if exists public.helmut_verstehen_freigabe(text, text, bigint, text);
drop function if exists public.helmut_verstehen_freigabe_ohne_aufruf(text, text, bigint, text);
drop function if exists public.helmut_verstehen_abschluss(text, text, bigint, text);
drop function if exists public.helmut_verstehen_speichere(text, text, bigint, jsonb, text);
drop function if exists public.helmut_verstehen_schreibrecht(text, text, bigint, bigint);
drop function if exists public.helmut_verstehen_modellstart(text, text, bigint, bigint);
drop function if exists public.helmut_verstehen_reserviere(text, text, text, bigint);

drop table if exists public.helmut_verstehen_vormerkungen;
drop table if exists public.helmut_verstehen_reservierungen;

alter table public.knowledge_objects drop column if exists verstehen_fencing;

commit;

-- Verifikation (rein lesend):
--   select count(*) from information_schema.tables
--    where table_schema='public'
--      and table_name in ('helmut_verstehen_reservierungen','helmut_verstehen_vormerkungen');  -- 0
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname like 'helmut_verstehen%';                          -- 0
--   select count(*) from pg_trigger where tgname='helmut_ko_fencing_wache_trg';                -- 0
--   select count(*) from information_schema.columns
--    where table_name='knowledge_objects' and column_name='verstehen_fencing';                 -- 0
