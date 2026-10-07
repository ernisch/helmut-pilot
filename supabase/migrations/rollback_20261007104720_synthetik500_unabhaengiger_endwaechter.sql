-- Rueckweg nur nach geschlossenem Fenster und0aktiven Zielprofilen.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
lock table public.mandate_profiles in share row exclusive mode;
lock table helmut_end500_internal.bindings in share row exclusive mode;
do $$
declare h helmut_end500_internal.heartbeat;
begin
  if exists(select from helmut_end500_internal.bindings where stopped_am is null)
    or exists(select from public.mandate_profiles where user_id=any(helmut_end500_internal.ids()) and aktiv) then
    raise exception 'end500-rueckweg-nicht-null';
  end if;
  select * into h from helmut_end500_internal.heartbeat;
  if not exists(select from cron.job where jobid=h.job_id and jobname='helmut-end500-independent'
    and command='set statement_timeout=''15s''; set lock_timeout=''3s''; select helmut_end500_internal.tick();') then
    raise exception 'end500-rueckweg-job-drift';
  end if;
  perform cron.unschedule(h.job_id);
  -- Nur die von uns neu installierte Extension entfernen; spaetere fremde Jobs erhalten.
  if h.created_cron and not exists(select from cron.job) then drop extension pg_cron; end if;
end $$;
drop trigger end500_row on public.mandate_profiles;
drop trigger end500_statement on public.mandate_profiles;
drop function public.helmut_end500_status();
drop function public.helmut_end500_binden(text,text,text,timestamptz,timestamptz,text);
drop function public.helmut_end500_notstopp(text,text,text);
drop schema helmut_end500_internal cascade;
notify pgrst,'reload schema';
commit;
