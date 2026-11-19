-- Separater Claim für den vorhandenen Abrufanteil der regulären Quellenfenster.
-- Kein Umbau der übrigen Queue-Verbraucher, kein neuer Termin und keine Datenkorrektur.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create function public.helmut_claim_quellenfaelligkeit(
  p_owner text, p_lease_ms bigint, p_alt_vorrang boolean
)
returns setof public.helmut_jobs
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_tag timestamptz := date_trunc('day', now(), 'UTC');
  v_lease interval := greatest(coalesce(p_lease_ms, 300000), 1000) * interval '1 millisecond';
begin
  if p_owner is null or btrim(p_owner) = '' then
    raise exception 'helmut_claim_quellenfaelligkeit: p_owner ist Pflicht';
  end if;
  return query
  with kandidat as (
    select j.id
      from public.helmut_jobs j
     where j.job_type = 'source_fetch' and j.due_at <= v_now
       and j.attempts < j.max_attempts
       and (j.status = 'wartend' or (j.status = 'laeuft' and j.lease_expires_at < v_now))
     order by
       case
         -- Zwei vorhandene Slots geben zuerst einem Altauftrag ohne
         -- amtlichen Originalvorrang Platz. Danach gilt wieder die Tagesfolge.
         when p_alt_vorrang and j.first_due_at < v_tag and j.priority not between 35 and 50
           and coalesce(j.payload->'quelle'->>'id','') not like 'bt-termine-%'
           and coalesce(j.payload->'quelle'->>'crawlMethod','') <> 'dip' then 0
         when j.first_due_at >= v_tag and j.priority between 35 and 50 then 1
         when j.first_due_at >= v_tag then 2
         else 3
       end,
       case
         when pg_input_is_valid(j.payload->'faelligkeit'->>'frist', 'timestamp with time zone')
           then (j.payload->'faelligkeit'->>'frist')::timestamptz
         when j.priority between 35 and 50 then date_trunc('day', j.first_due_at, 'UTC') + interval '5 hours'
         when j.payload->>'art' = 'person-archiv' then j.first_due_at + interval '7 days'
         else j.first_due_at + interval '24 hours'
       end,
       j.first_due_at, j.priority, j.created_at, j.id
     for update skip locked limit 1
  )
  update public.helmut_jobs j
     set status = 'laeuft', lease_owner = p_owner, lease_expires_at = v_now + v_lease,
         attempts = j.attempts + 1, first_claimed_at = coalesce(j.first_claimed_at, v_now)
    from kandidat k where j.id = k.id returning j.*;
end;
$$;

revoke all on function public.helmut_claim_quellenfaelligkeit(text,bigint,boolean) from public, anon, authenticated;
grant execute on function public.helmut_claim_quellenfaelligkeit(text,bigint,boolean) to service_role;
commit;
