-- Tagesgebundene Prioritaet bei belegter Wiederbeobachtung. Keine Bestandsmutation durch diese Migration.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

do $guard$
declare
  v_body text;
  v_definer boolean;
begin
  select md5(prosrc), prosecdef into v_body, v_definer
    from pg_proc
    where oid = to_regprocedure('public.helmut_enqueue_job(text,text,text,jsonb,timestamptz,smallint,integer,text)');
  if v_body is null or v_body not in ('c2e01bf1edc204a03b66c96cb28eaec6', '83ba56b53b1cfc44afd580675298ae81')
    or v_definer is distinct from false then
    raise exception 'helmut_enqueue_job: unbekannter Ausgangsstand';
  end if;
end;
$guard$;

alter table public.helmut_jobs add column if not exists quellen_prioritaet_tag date;

create or replace function public.helmut_enqueue_job(
  p_job_type        text,
  p_idempotency_key text,
  p_freshness_window text,
  p_payload         jsonb,
  p_due_at          timestamptz default now(),
  p_priority        smallint    default 100,
  p_max_attempts    integer     default 5,
  p_tenant_id       text        default null
)
returns table(id uuid, neu boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id  uuid;
  v_neu boolean := false;
  v_tag date := (now() at time zone 'UTC')::date;
  v_prioritaet_tag date;
begin
  if p_job_type = 'document_understanding' and p_tenant_id is null
    and (p_priority = 80 or p_priority between 35 and 50)
    and p_freshness_window ~ ('^' || to_char(v_tag, 'YYYY-MM-DD') || 'T([01][0-9]|2[0-3])Z$')
    and p_payload->'dokumentIds' = jsonb_build_array(p_payload->'dokumentIds'->>0)
    and p_payload->'dokumentIds'->>0 ~ '^rd-[a-f0-9]{64}$'
    and p_payload->'quellenstaende'->>(p_payload->'dokumentIds'->>0) ~ '^[a-f0-9]{64}$'
    and not (p_payload ? 'artikelFehler')
  then
    v_prioritaet_tag := v_tag;
  end if;
  insert into public.helmut_jobs
    (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, priority, max_attempts, tenant_id,
     quellen_prioritaet_tag)
  values
    (p_job_type, p_idempotency_key, p_freshness_window, coalesce(p_payload, '{}'::jsonb),
     coalesce(p_due_at, now()), coalesce(p_due_at, now()), coalesce(p_priority, 100::smallint),
     coalesce(p_max_attempts, 5), p_tenant_id, v_prioritaet_tag)
  on conflict (idempotency_key) do nothing
  returning helmut_jobs.id into v_id;

  if v_id is not null then
    v_neu := true;
  else
    select j.id into v_id from public.helmut_jobs j where j.idempotency_key = p_idempotency_key;
    -- Die Prioritaet gilt fuer den Beobachtungstag. Hintergrundabrufe am
    -- Folgetag erben keine fruehere Morgenpflicht. Innerhalb desselben Tages
    -- kann ein bestaetigter amtlicher Abruf die Prioritaet nur verbessern.
    if v_prioritaet_tag is not null then
      update public.helmut_jobs j
        set last_seen_window = greatest(j.last_seen_window, j.freshness_window, p_freshness_window),
            quellen_prioritaet_tag = case when j.status in ('wartend','laeuft')
              then v_prioritaet_tag else j.quellen_prioritaet_tag end,
            priority = case
              when j.status not in ('wartend','laeuft') then j.priority
              when j.quellen_prioritaet_tag = v_prioritaet_tag
                or (j.quellen_prioritaet_tag is null and left(j.freshness_window,10) = left(p_freshness_window,10))
              then least(j.priority,p_priority) else p_priority end
        where j.id = v_id and j.job_type = p_job_type and j.tenant_id is null
          and (coalesce(j.last_seen_window, j.freshness_window) is null
            or coalesce(j.last_seen_window, j.freshness_window) < p_freshness_window
            or (j.status in ('wartend','laeuft')
              and (j.quellen_prioritaet_tag is distinct from v_prioritaet_tag or j.priority > p_priority)))
          and j.payload->'dokumentIds' = p_payload->'dokumentIds'
          and j.payload->'quellenstaende' = p_payload->'quellenstaende'
          and not (j.payload ? 'artikelFehler');
    else
      -- Andere Zwecke behalten ihren bisherigen monotonen Beobachtungsvertrag.
      -- Kein Requeue, kein Payload-Update und keine Versuchsruecknahme.
      update public.helmut_jobs j set last_seen_window = p_freshness_window
        where j.id = v_id and coalesce(j.last_seen_window,j.freshness_window) < p_freshness_window;
    end if;
  end if;

  return query select v_id, v_neu;
end;
$$;
commit;
