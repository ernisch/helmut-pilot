-- Stellt den alten Einreihungsvertrag wieder her. Bereits vergebene Prioritaeten bleiben erhalten.
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
begin
  insert into public.helmut_jobs
    (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, priority, max_attempts, tenant_id)
  values
    (p_job_type, p_idempotency_key, p_freshness_window, coalesce(p_payload, '{}'::jsonb),
     coalesce(p_due_at, now()), coalesce(p_due_at, now()), coalesce(p_priority, 100::smallint),
     coalesce(p_max_attempts, 5), p_tenant_id)
  on conflict (idempotency_key) do nothing
  returning helmut_jobs.id into v_id;

  if v_id is not null then
    v_neu := true;
  else
    select j.id into v_id from public.helmut_jobs j where j.idempotency_key = p_idempotency_key;
    -- Kein Requeue, keine Versuchsruecknahme, kein Payload-Update. Derselbe Stand
    -- kann mehreren Tagesplaenen dienen; terminale Ergebnisse bleiben terminal.
    update public.helmut_jobs j set last_seen_window = p_freshness_window
      where j.id = v_id and coalesce(j.last_seen_window,j.freshness_window) < p_freshness_window;
  end if;

  return query select v_id, v_neu;
end;
$$;
alter table public.helmut_jobs drop column if exists quellen_prioritaet_tag;
commit;
