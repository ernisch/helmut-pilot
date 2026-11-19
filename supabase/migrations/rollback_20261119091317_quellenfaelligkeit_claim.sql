-- Entfernt den zusätzlichen Einsprung. Bereits entstandene Queue-Belege bleiben erhalten.
begin;
set local lock_timeout = '3s';
drop function if exists public.helmut_claim_quellenfaelligkeit(text,bigint,boolean);
commit;
