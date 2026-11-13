-- Nur gezielter Rueckweg der beiden Claim-Koerper, keine Daten-/ACL-Aenderung.
begin;
drop function if exists public.helmut_claim_tagesarbeit(text,integer,bigint,text[]);
drop function if exists public.helmut_claim_tagesauftrag(uuid,text,bigint);
set local lock_timeout = '3s';
drop function if exists public.helmut_jobs_tagesstand(text[],text[],text);
create or replace function public.helmut_claim_jobs(
  p_owner    text,
  p_limit    integer,
  p_lease_ms bigint,
  p_types    text[] default null
)
returns setof public.helmut_jobs
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now   timestamptz := now();
  v_lease interval    := (greatest(p_lease_ms, 1000) * interval '1 millisecond');
begin
  if p_owner is null or length(trim(p_owner)) = 0 then
    raise exception 'helmut_claim_jobs: p_owner ist Pflicht (Lease-Besitzer)';
  end if;

  -- (a) ABGELAUFENE LEASES ZURUECK IN DIE WARTESCHLANGE.
  --     Warum als eigener Schritt und nicht als `or`-Zweig der Reservierung: eine Bedingung
  --     `status='wartend' or status='laeuft'` macht den partiellen Claim-Index unbrauchbar.
  --     GEMESSEN an 5 000 Zeilen (PostgreSQL 16.13, `explain analyze`): die frueher hier
  --     stehende Oder-Abfrage lief als **Seq Scan** ueber alle Zeilen. Bei 1 000 Mandaten
  --     traegt die Tabelle mit 14 Tagen Aufbewahrung rund 66 000 Zeilen, und der Claim laeuft
  --     mehrfach je Lauf — der Index MUSS greifen. Nach dieser Umstellung liest die
  --     Reservierung nur noch `status='wartend'` und benutzt `helmut_jobs_claim_idx`.
  --     Dieser Schritt selbst ist ueber `helmut_jobs_lease_idx` indiziert.
  --     Die Fachlogik ist unveraendert: ein Auftrag mit abgelaufener Lease wird wieder
  --     vergeben, und der naechste Claim erhoeht `attempts` wie zuvor.
  update public.helmut_jobs j
     set status = 'wartend',
         lease_owner = null,
         lease_expires_at = null
   where j.status = 'laeuft'
     and j.lease_expires_at < v_now;

  -- (b) Erschoepft = endgueltig fehlgeschlagen, VOR der Ausgabe. Nach Schritt (a) sind alle
  --     betroffenen Auftraege `wartend`, die Bedingung braucht deshalb keinen Oder-Zweig mehr.
  update public.helmut_jobs j
     set status      = 'fehlgeschlagen',
         finished_at = v_now,
         lease_owner = null,
         lease_expires_at = null,
         last_error  = coalesce(j.last_error, 'versuche-erschoepft')
   where j.status = 'wartend'
     and j.attempts >= j.max_attempts;

  -- (c) Reservieren — jetzt indexgestuetzt.
  return query
  with kandidaten as (
    select j.id
      from public.helmut_jobs j
     where j.status = 'wartend'
       and j.due_at <= v_now
       and j.attempts < j.max_attempts
       and (p_types is null or j.job_type = any(p_types))
     order by j.priority asc, j.due_at asc, j.created_at asc
     for update skip locked
     limit greatest(coalesce(p_limit, 1), 0)
  )
  update public.helmut_jobs j
     set status           = 'laeuft',
         lease_owner      = p_owner,
         lease_expires_at = v_now + v_lease,
         attempts         = j.attempts + 1,
         first_claimed_at = coalesce(j.first_claimed_at, v_now)
    from kandidaten k
   where j.id = k.id
  returning j.*;
end;
$$;

create or replace function public.helmut_claim_job_by_id(
  p_job_id    uuid,
  p_owner     text,
  p_lease_ms  bigint default 300000
)
returns table(
  uebernommen  boolean,
  grund        text,
  id           uuid,
  job_type     text,
  tenant_id    text,
  payload      jsonb,
  attempts     integer,
  max_attempts integer,
  lease_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_lease interval := (greatest(coalesce(p_lease_ms, 300000), 1000) || ' milliseconds')::interval;
  v_zeile public.helmut_jobs%rowtype;
begin
  if p_job_id is null or p_owner is null or length(btrim(p_owner)) = 0 then
    return query select false, 'ungueltige-parameter'::text, null::uuid, null::text, null::text,
                        null::jsonb, null::integer, null::integer, null::timestamptz;
    return;
  end if;

  -- SKIP LOCKED: laeuft bereits ein anderer Verbraucher auf genau dieser Zeile, wird NICHT
  -- gewartet (eine Lambda-Invocation darf nie an einer Zeilensperre haengen) — die Nachricht
  -- kommt nach der Sichtbarkeitszeit von selbst wieder.
  select * into v_zeile
    from public.helmut_jobs j
   where j.id = p_job_id
   for update skip locked;

  if not found then
    -- Entweder unbekannt oder gerade von jemand anderem gesperrt. Beides bedeutet:
    -- dieser Verbraucher arbeitet jetzt nicht — die Unterscheidung liefert der Nachschlag.
    if exists (select 1 from public.helmut_jobs j where j.id = p_job_id) then
      return query select false, 'gesperrt'::text, p_job_id, null::text, null::text,
                          null::jsonb, null::integer, null::integer, null::timestamptz;
    else
      return query select false, 'unbekannt'::text, p_job_id, null::text, null::text,
                          null::jsonb, null::integer, null::integer, null::timestamptz;
    end if;
    return;
  end if;

  -- IDEMPOTENZ BEI MEHRFACHER ZUSTELLUNG: ein terminaler Auftrag wird NIE erneut bearbeitet.
  if v_zeile.status in ('erledigt', 'fehlgeschlagen') then
    return query select false, ('bereits-' || v_zeile.status)::text, v_zeile.id, v_zeile.job_type,
                        v_zeile.tenant_id, null::jsonb, v_zeile.attempts, v_zeile.max_attempts,
                        v_zeile.lease_expires_at;
    return;
  end if;

  -- Ein LAUFENDER Auftrag mit gueltiger Lease gehoert einem anderen Verbraucher.
  if v_zeile.status = 'laeuft'
     and v_zeile.lease_expires_at is not null
     and v_zeile.lease_expires_at > now() then
    return query select false, 'lease-fremd'::text, v_zeile.id, v_zeile.job_type, v_zeile.tenant_id,
                        null::jsonb, v_zeile.attempts, v_zeile.max_attempts, v_zeile.lease_expires_at;
    return;
  end if;

  -- Noch nicht faellig: der Weckruf war zu frueh (Fälligkeitskopplung der Outbox verhindert
  -- das im Normalfall). Nicht arbeiten, nicht verbrauchen.
  if v_zeile.status = 'wartend' and v_zeile.due_at > now() then
    return query select false, 'nicht-faellig'::text, v_zeile.id, v_zeile.job_type, v_zeile.tenant_id,
                        null::jsonb, v_zeile.attempts, v_zeile.max_attempts, v_zeile.lease_expires_at;
    return;
  end if;

  -- Uebernahme: identische Buchfuehrung wie helmut_claim_jobs (Versuch zaehlt, Lease setzen).
  update public.helmut_jobs j
     set status           = 'laeuft',
         lease_owner      = p_owner,
         lease_expires_at = now() + v_lease,
         attempts         = j.attempts + 1,
         first_claimed_at = coalesce(j.first_claimed_at, now())
   where j.id = v_zeile.id
   returning * into v_zeile;

  return query select true, 'uebernommen'::text, v_zeile.id, v_zeile.job_type, v_zeile.tenant_id,
                      v_zeile.payload, v_zeile.attempts, v_zeile.max_attempts, v_zeile.lease_expires_at;
end;
$$;
drop index if exists public.helmut_jobs_tagesarbeit_idx;
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
  end if;

  return query select v_id, v_neu;
end;
$$;
drop index if exists public.helmut_jobs_tagesstand_idx;
alter table public.helmut_jobs drop column if exists last_seen_window;
commit;
