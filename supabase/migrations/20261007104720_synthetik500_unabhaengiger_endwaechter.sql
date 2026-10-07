-- Endsteuerung allein: keine Profilaktivierung, kein Startrecht, keine Modellaufrufe.
-- Ein bestehendes Supabase-Projekt, SQL-Cron alle30s, ungebunden bis Operatorbindung.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
lock table public.mandate_profiles in share row exclusive mode;
do $$ begin
  if current_user<>'postgres' or exists(select from public.mandate_profiles where aktiv)
    or (select count(*) from public.mandate_profiles)<>500 then raise exception 'end500-installation-nicht-null'; end if;
end $$;
select set_config('helmut_end500.created_cron',case when exists(select from pg_extension where extname='pg_cron') then 'false' else 'true' end,true);
create extension if not exists pg_cron;
do $$ begin
  if current_setting('helmut_end500.created_cron')::boolean then
    revoke usage on schema cron from public,anon,authenticated,service_role;
  end if;
end $$;
create schema helmut_end500_internal;
revoke all on schema helmut_end500_internal from public,anon,authenticated;

create table helmut_end500_internal.heartbeat (
  singleton boolean primary key default true check(singleton),
  job_id bigint, last_tick timestamptz, ticks bigint not null default 0,
  created_cron boolean not null
);
create table helmut_end500_internal.bindings (
  operation_id text primary key check(operation_id ~ '^synthetik500-[A-Za-z0-9_-]{8,100}$'),
  manifest_hash text not null check(manifest_hash ~ '^[a-f0-9]{64}$'),
  production_commit text not null check(production_commit ~ '^[a-f0-9]{40}$'),
  start_am timestamptz not null, ende_am timestamptz not null,
  created_am timestamptz not null default clock_timestamp(),
  stopped_am timestamptz, reason text check(reason in ('frist','notstopp')),
  deactivated integer check(deactivated between 0 and 500),
  check(ende_am>start_am and ende_am-start_am<=interval '4 hours'),
  check((stopped_am is null and reason is null and deactivated is null)
    or (stopped_am is not null and reason is not null and deactivated is not null))
);
create unique index end500_one_open on helmut_end500_internal.bindings ((true)) where stopped_am is null;
alter table helmut_end500_internal.heartbeat enable row level security;
alter table helmut_end500_internal.bindings enable row level security;
insert into helmut_end500_internal.heartbeat(singleton,created_cron)
  values(true,current_setting('helmut_end500.created_cron')::boolean);

create function helmut_end500_internal.ids() returns text[]
language sql immutable security invoker set search_path=pg_catalog as $$
  select array_agg(id order by id collate "C") from (
    select 'test-kohorte-synthetik-bt-'||lpad(n::text,3,'0') id from generate_series(1,330) n
    union all select 'test-kohorte-synthetik-be-'||lpad(n::text,3,'0') from generate_series(1,120) n
    union all select 'test-kohorte-synthetik-bb-'||lpad(n::text,3,'0') from generate_series(1,50) n
  ) q;
$$;

do $$ begin
  if (select array_agg(user_id order by user_id collate "C") from public.mandate_profiles)
    is distinct from helmut_end500_internal.ids() then raise exception 'end500-installation-fremde-ids'; end if;
end $$;

-- Nur fest gebundene Metadaten und Zaehler; keine Profile/Snapshots/Secrets.
create function helmut_end500_internal.status() returns jsonb
language sql volatile security definer set search_path=pg_catalog as $$
  select jsonb_build_object('version','helmut-end500/1','observedAt',clock_timestamp(),
    'lastTick',h.last_tick,'ticks',h.ticks,'jobId',h.job_id,
    'recentSuccessfulRuns',(select count(*) from cron.job_run_details where jobid=h.job_id
      and status='succeeded' and end_time>=clock_timestamp()-interval '90 seconds'),
    'schedulerActive',coalesce((select active and schedule='30 seconds'
      and username='postgres' and database=current_database()
      and command='set statement_timeout=''15s''; set lock_timeout=''3s''; select helmut_end500_internal.tick();'
      from cron.job where jobid=h.job_id),false),
    'state',case when b.operation_id is null then 'standby' when b.stopped_am is null then 'armed' else 'stopped' end,
    'operationId',b.operation_id,'manifestHash',b.manifest_hash,'productionCommit',b.production_commit,
    'startAt',b.start_am,'endAt',b.ende_am,'stoppedAt',b.stopped_am,'reason',b.reason,
    'deactivated',b.deactivated,'targetCount',(select count(*) from public.mandate_profiles
      where user_id=any(helmut_end500_internal.ids())),
    'activeTargets',(select count(*) from public.mandate_profiles
      where user_id=any(helmut_end500_internal.ids()) and aktiv),
    'activationRight',false)
  from helmut_end500_internal.heartbeat h
  left join lateral (select * from helmut_end500_internal.bindings order by created_am desc,operation_id desc limit 1) b on true;
$$;

create function helmut_end500_internal.bind(p_operation_id text,p_manifest_hash text,p_production_commit text,
  p_start_am timestamptz,p_ende_am timestamptz,p_bestaetigung text) returns jsonb
language plpgsql security definer set search_path=pg_catalog set statement_timeout='15s' set lock_timeout='3s' as $$
declare h helmut_end500_internal.heartbeat; s jsonb;
begin
  if p_bestaetigung is distinct from 'NUR_ENDSTEUERUNG_KEINE_AKTIVIERUNG'
    or p_operation_id is null or p_manifest_hash is null or p_production_commit is null
    or p_start_am is null or p_ende_am is null or p_start_am<clock_timestamp()-interval '1 minute'
    or p_start_am>clock_timestamp()+interval '5 minutes' or p_ende_am<=clock_timestamp()
    or p_ende_am<=p_start_am or p_ende_am-p_start_am>interval '4 hours' then
    raise exception 'end500-bindung-ungueltig';
  end if;
  -- Gleiche Reihenfolge wie Stop und Profilstatement: erst Profiltabelle, dann Bindung.
  lock table public.mandate_profiles in share row exclusive mode;
  lock table helmut_end500_internal.bindings in share row exclusive mode;
  select * into h from helmut_end500_internal.heartbeat;
  s:=helmut_end500_internal.status();
  if h.ticks<2 or h.last_tick is null or h.last_tick<clock_timestamp()-interval '90 seconds'
    or s->'schedulerActive' is distinct from 'true'::jsonb
    or (select count(*) from cron.job_run_details where jobid=h.job_id and status='succeeded'
      and end_time>=clock_timestamp()-interval '90 seconds')<2 then
    raise exception 'end500-kein-lebender-scheduler';
  end if;
  if (select count(*) from public.mandate_profiles)<>500
    or (select count(*) from public.mandate_profiles where user_id=any(helmut_end500_internal.ids())
      and aktiv=false and geloescht_at is null)<>500 then
    raise exception 'end500-nullbestand-fehlt';
  end if;
  insert into helmut_end500_internal.bindings(operation_id,manifest_hash,production_commit,start_am,ende_am)
    values(p_operation_id,p_manifest_hash,p_production_commit,p_start_am,p_ende_am);
  return helmut_end500_internal.status();
end $$;

create function helmut_end500_internal.stop(p_operation_id text,p_manifest_hash text,p_grund text,p_bestaetigung text) returns jsonb
language plpgsql security definer set search_path=pg_catalog set statement_timeout='15s' set lock_timeout='3s' as $$
declare b helmut_end500_internal.bindings; n integer;
begin
  if p_operation_id is null or p_manifest_hash is null or p_grund is null or p_grund not in ('frist','notstopp')
    or p_bestaetigung is distinct from 'GEBUNDENE_SYNTHETIK500_NUR_DEAKTIVIEREN' then
    raise exception 'end500-endauftrag';
  end if;
  lock table public.mandate_profiles in share row exclusive mode;
  select * into b from helmut_end500_internal.bindings where operation_id=p_operation_id for update;
  if not found or b.manifest_hash is distinct from p_manifest_hash then raise exception 'end500-fremde-bindung'; end if;
  if b.operation_id is distinct from (select operation_id from helmut_end500_internal.bindings
    order by created_am desc,operation_id desc limit 1) then raise exception 'end500-alte-bindung'; end if;
  if b.stopped_am is not null then return helmut_end500_internal.status(); end if;
  if p_grund='frist' and clock_timestamp()<b.ende_am then raise exception 'end500-frist-nicht-erreicht'; end if;
  -- Ende darf auch ohne Startquittung und trotz Fachfeld-/Teilaktivierungsdrift funktionieren.
  update public.mandate_profiles set aktiv=false where user_id=any(helmut_end500_internal.ids()) and aktiv;
  get diagnostics n=row_count;
  if exists(select 1 from public.mandate_profiles where user_id=any(helmut_end500_internal.ids()) and aktiv) then
    raise exception 'end500-null-nicht-erreicht';
  end if;
  update helmut_end500_internal.bindings set stopped_am=clock_timestamp(),reason=p_grund,deactivated=n
    where operation_id=p_operation_id;
  return helmut_end500_internal.status();
end $$;

create function helmut_end500_internal.tick() returns void
language plpgsql security invoker set search_path=pg_catalog as $$
declare b helmut_end500_internal.bindings;
begin
  select * into b from helmut_end500_internal.bindings where stopped_am is null;
  if found and clock_timestamp()>=b.ende_am then
    perform helmut_end500_internal.stop(b.operation_id,b.manifest_hash,'frist','GEBUNDENE_SYNTHETIK500_NUR_DEAKTIVIEREN');
  end if;
  update helmut_end500_internal.heartbeat set last_tick=clock_timestamp(),ticks=ticks+1;
end $$;

-- BEFORE STATEMENT sperrt vor Profilzeilen. End-UPDATE/DELETE und fachliche Updates
-- bleiben erlaubt; die Zeilenpruefung verbietet aktive Ziele ausserhalb des Fensters.
create function helmut_end500_internal.profile_statement() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform operation_id from helmut_end500_internal.bindings where stopped_am is null for share;
  return null;
end $$;
create function helmut_end500_internal.profile_row() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if tg_op='UPDATE' and old.user_id=any(helmut_end500_internal.ids()) and new.user_id is distinct from old.user_id then
    raise exception 'end500-zielidentitaet-unveraenderlich';
  end if;
  if new.aktiv and new.user_id=any(helmut_end500_internal.ids()) and not exists(
    select 1 from helmut_end500_internal.bindings where stopped_am is null
      and clock_timestamp()>=start_am and clock_timestamp()<ende_am) then
    raise exception 'end500-kein-offenes-fenster';
  end if;
  return new;
end $$;
create trigger end500_statement before insert or update on public.mandate_profiles
  for each statement execute function helmut_end500_internal.profile_statement();
create trigger end500_row before insert or update on public.mandate_profiles
  for each row execute function helmut_end500_internal.profile_row();

create function public.helmut_end500_status() returns jsonb
language sql volatile security invoker set search_path=pg_catalog as $$ select helmut_end500_internal.status(); $$;
create function public.helmut_end500_binden(p_operation_id text,p_manifest_hash text,p_production_commit text,
  p_start_am timestamptz,p_ende_am timestamptz,p_bestaetigung text) returns jsonb
language sql volatile security invoker set search_path=pg_catalog as $$
  select helmut_end500_internal.bind(p_operation_id,p_manifest_hash,p_production_commit,p_start_am,p_ende_am,p_bestaetigung);
$$;
create function public.helmut_end500_notstopp(p_operation_id text,p_manifest_hash text,p_bestaetigung text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if p_bestaetigung is distinct from 'GEBUNDENE_SYNTHETIK500_NUR_DEAKTIVIEREN' then
    raise exception 'end500-bestaetigung-fehlt';
  end if;
  return helmut_end500_internal.stop(p_operation_id,p_manifest_hash,'notstopp',p_bestaetigung);
end $$;

revoke all on all tables in schema helmut_end500_internal from public,anon,authenticated,service_role;
revoke all on all functions in schema helmut_end500_internal from public,anon,authenticated,service_role;
revoke all on function public.helmut_end500_status() from public,anon,authenticated;
revoke all on function public.helmut_end500_binden(text,text,text,timestamptz,timestamptz,text) from public,anon,authenticated;
revoke all on function public.helmut_end500_notstopp(text,text,text) from public,anon,authenticated;
grant usage on schema helmut_end500_internal to service_role;
grant execute on function helmut_end500_internal.status(),helmut_end500_internal.bind(text,text,text,timestamptz,timestamptz,text),
  helmut_end500_internal.stop(text,text,text,text) to service_role;
grant execute on function public.helmut_end500_status(),
  public.helmut_end500_binden(text,text,text,timestamptz,timestamptz,text),
  public.helmut_end500_notstopp(text,text,text) to service_role;

do $$ begin
  if exists(select 1 from cron.job where jobname='helmut-end500-independent') then raise exception 'end500-job-existiert'; end if;
  update helmut_end500_internal.heartbeat set job_id=cron.schedule('helmut-end500-independent','30 seconds',
    'set statement_timeout=''15s''; set lock_timeout=''3s''; select helmut_end500_internal.tick();');
end $$;
notify pgrst,'reload schema';
commit;
