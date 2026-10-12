-- Remove only the dormant initializer RPC. Never delete initialized books,
-- lower capacity, restore an old Auth snapshot or release historical reserves.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
drop function public.helmut_synthetik500_eu_daybook_init(text,text,text,text,integer,bigint);
commit;
