-- Rollback: Pro-Quellenabruf-Telemetrie (20260718_source_crawl_telemetry.sql).
-- Entfernt die Telemetrie-Tabelle vollstaendig. Idempotent. Kein Datenverlust an
-- bestehenden Tabellen (die Tabelle ist rein additiv; der App-Code faellt bei
-- fehlender Tabelle erkennbar/geloggt auf No-Op zurueck — kein Nutzerpfad betroffen).
begin;
drop table if exists public.source_crawl_telemetry cascade;
commit;
