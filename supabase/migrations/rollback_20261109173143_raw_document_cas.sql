-- Entfernt ausschliesslich beide vorbereiteten RPCs; Rohdokumente/Planreste bleiben erhalten.
begin;
drop function if exists public.helmut_quellenplan_cursor_cas(text,text,integer);
drop function if exists public.helmut_raw_document_cas(text,jsonb,jsonb);
commit;
