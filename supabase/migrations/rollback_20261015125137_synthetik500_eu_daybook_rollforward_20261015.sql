-- Remove only the new RPC. Never delete books, tickets or restore a stale CAS.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
drop function public.helmut_synthetik500_eu_daybook_rollforward_20261015(text,text,text,text,integer,bigint);
commit;
