-- Nur Funktionsrueckweg; kein Slot-/Profil-/Fach-/Graphdatenverlust.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
lock table public.helmut_store in share row exclusive mode;
do $schutz$
begin
  if exists(select 1 from public.helmut_store where id like 'realkohorte500-runtime-real500-%'
    and data->>'zustand'='aktiv') then raise exception 'real500-runtime-rollback-aktiver-lauf'; end if;
end $schutz$;
drop function public.helmut_realkohorte500_ende(text,text,text,text,text);
drop function public.helmut_realkohorte500_lesung(text,text,text);
drop function helmut_real500_internal.status(jsonb,integer);
drop function helmut_real500_internal.pruefe(text,text,text);
drop function helmut_real500_internal.json_compact(jsonb);
drop schema helmut_real500_internal;
notify pgrst,'reload schema';
commit;
