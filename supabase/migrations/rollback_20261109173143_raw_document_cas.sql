-- Entfernt ausschliesslich den vorbereiteten RPC; Rohdokumente bleiben erhalten.
begin;
drop function if exists public.helmut_raw_document_cas(text,jsonb,jsonb);
commit;
