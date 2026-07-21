-- Rollback: Universelles Mandatsregister (prepared/20260722_mandate_register.sql).
-- Entfernt beide additiven Tabellen vollstaendig. Idempotent. Kein Datenverlust an
-- bestehenden Tabellen — mandate_register/mandate_external_ids sind rein abgeleitet
-- (jederzeit aus mandate_profiles + Registry neu berechenbar). Der App-Code liest
-- sie nur, wenn eine spaetere Verdrahtung das ausdruecklich aktiviert; bis dahin ist
-- die Migration ohne Anwendung ein reiner No-Op.
begin;
drop table if exists public.mandate_external_ids cascade;
drop table if exists public.mandate_register cascade;
commit;
