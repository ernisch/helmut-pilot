-- Rollback: Understanding-Gate Shadow-Telemetrie (20260716_gate_shadow_telemetry.sql).
-- Entfernt die Telemetrie-Tabelle vollstaendig. Idempotent. Kein Datenverlust an bestehenden
-- Tabellen (die Tabelle ist rein additiv und wird nur im Shadow-Modus beschrieben).
begin;
drop table if exists public.gate_shadow_events cascade;
commit;
