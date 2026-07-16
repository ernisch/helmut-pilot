-- Rollback: Crawl-Läufe relational (20260720_crawl_runs_relational.sql).
-- Entfernt die Zieltabelle vollstaendig. Der App-Code faellt (ohne Flag
-- HELMUT_CRAWL_RUNS_RELATIONAL) ohnehin auf den Blob-Pfad zurueck — kein
-- Nutzerpfad/kein Datenverlust am bestehenden Blob. Idempotent.
begin;
drop table if exists public.crawl_runs cascade;
commit;
