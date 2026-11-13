-- Gezielter Verarbeitungskern fuer 100 aktive Kunden. NICHT auf Production angewendet.
-- Bestehende RPC-Signaturen, OIDs, ACL, RLS und Security-Invoker bleiben erhalten.
-- Eine skalare Relevanzspalte, zwei schmale Indizes und interne RPCs; kein Datenreset.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
-- Unbekannte aktuelle Funktionskoerper nicht still ueberschreiben. Die alte
-- oder genau diese neue Fassung ist zulaessig; Drift stoppt atomar vor DDL.
do $kern_guard$
declare v_sig text; v_alt text; v_neu text; v_hash text; v_definer boolean;
begin
  for v_sig,v_alt,v_neu in select * from (values
    ('public.helmut_claim_jobs(text,integer,bigint,text[])','c4c9a5270951de7717b990f6e37ed023','e01fcd12c6d0f8849f72ce6dfb73e421'),
    ('public.helmut_claim_job_by_id(uuid,text,bigint)','76982a28ea50df628a3547de293e13a1','88c193da5d23f51d35706957949b6199'),
    ('public.helmut_enqueue_job(text,text,text,jsonb,timestamptz,smallint,integer,text)','eae95f83c3216c217e6b434c8f3c19be','c2e01bf1edc204a03b66c96cb28eaec6')) f(sig,alt,neu) loop
    select md5(prosrc),prosecdef into v_hash,v_definer from pg_proc where oid=to_regprocedure(v_sig);
    if v_hash is null or v_hash not in (v_alt,v_neu) or v_definer then
      raise exception 'Verarbeitungskern: unbekannter Ausgangsstand fuer %',v_sig;
    end if;
  end loop;
end;
$kern_guard$;
-- Erstes Fenster bleibt unveraendert. Nur explizite Wiederbeobachtung derselben
-- Artikelversion macht offene Arbeit fuer einen neueren Tag relevant.
alter table public.helmut_jobs add column if not exists last_seen_window text;
create index if not exists helmut_jobs_tagesarbeit_idx
  on public.helmut_jobs ((coalesce(last_seen_window, freshness_window)), priority, due_at, created_at, id)
  where status = 'wartend';

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
  -- Quellenplanfenster sind UTC (YYYY-MM-DDTHHZ). Berliner Tag bindet das Tagespaket.
  v_tag text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  v_morgen text := to_char((now() at time zone 'UTC') + interval '1 day', 'YYYY-MM-DD');
  v_limit integer := least(200, greatest(coalesce(p_limit, 1), 0));
  v_frisch integer := 0;
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

  if v_limit = 0 then return; end if;

  -- Erst aktuelle Arbeit, unabhhaengig von der Prioritaet historischer Auftraege.
  -- Nur skalare Felder und der partielle Tagesindex; keine Payload-Materialisierung.
  return query
  with kandidaten as (
    select j.id from public.helmut_jobs j
     where j.status = 'wartend' and j.due_at <= v_now
       and j.attempts < j.max_attempts
       and coalesce(j.last_seen_window,j.freshness_window) >= v_tag and coalesce(j.last_seen_window,j.freshness_window) < v_morgen
       and (p_types is null or j.job_type = any(p_types))
     order by j.priority, j.due_at, j.created_at, j.id
     for update skip locked limit v_limit
  )
  update public.helmut_jobs j
     set status = 'laeuft', lease_owner = p_owner, lease_expires_at = v_now + v_lease,
         attempts = j.attempts + 1, first_claimed_at = coalesce(j.first_claimed_at, v_now)
    from kandidaten k where j.id = k.id returning j.*;
  get diagnostics v_frisch = row_count;

  -- Freie Plaetze bleiben fuer alte Arbeit verfuegbar. Bei voller Tagesarbeit kein
  -- Altauftrag; zurueckgestelltes due_at macht ein altes Fenster niemals aktuell.
  if v_frisch < v_limit then
    return query
    with kandidaten as (
      select j.id from public.helmut_jobs j
       where j.status = 'wartend' and j.due_at <= v_now
         and j.attempts < j.max_attempts
         and (p_types is null or j.job_type = any(p_types))
       order by j.priority, j.due_at, j.created_at, j.id
       for update skip locked limit (v_limit - v_frisch)
    )
    update public.helmut_jobs j
       set status = 'laeuft', lease_owner = p_owner, lease_expires_at = v_now + v_lease,
           attempts = j.attempts + 1, first_claimed_at = coalesce(j.first_claimed_at, v_now)
      from kandidaten k where j.id = k.id returning j.*;
  end if;
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

  -- Derselbe Tagesvorrang gilt auch fuer direkt adressierte Queue-Wecksignale.
  -- Ein alter Weckruf darf weder Versuche verbrauchen noch Tagesarbeit verdraengen.
  if v_zeile.attempts >= v_zeile.max_attempts then
    update public.helmut_jobs j set status = 'fehlgeschlagen', finished_at = now(),
      lease_owner = null, lease_expires_at = null,
      last_error = coalesce(j.last_error, 'versuche-erschoepft') where j.id = v_zeile.id;
    return query select false, 'bereits-fehlgeschlagen'::text, v_zeile.id, v_zeile.job_type,
      v_zeile.tenant_id, null::jsonb, v_zeile.attempts, v_zeile.max_attempts, null::timestamptz;
    return;
  end if;
  if (coalesce(v_zeile.last_seen_window,v_zeile.freshness_window) < to_char(now() at time zone 'UTC', 'YYYY-MM-DD')
      or coalesce(v_zeile.last_seen_window,v_zeile.freshness_window) >= to_char((now() at time zone 'UTC') + interval '1 day', 'YYYY-MM-DD'))
    and exists (select 1 from public.helmut_jobs j
      where j.status = 'wartend' and j.due_at <= now() and j.attempts < j.max_attempts
        and coalesce(j.last_seen_window,j.freshness_window) >= to_char(now() at time zone 'UTC', 'YYYY-MM-DD')
        and coalesce(j.last_seen_window,j.freshness_window) < to_char((now() at time zone 'UTC') + interval '1 day', 'YYYY-MM-DD')) then
    return query select false, 'frische-tagesarbeit-vorrang'::text, v_zeile.id, v_zeile.job_type,
      v_zeile.tenant_id, null::jsonb, v_zeile.attempts, v_zeile.max_attempts, v_zeile.lease_expires_at;
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
                      v_zeile.payload || jsonb_build_object('__helmutJobFenster', coalesce(v_zeile.last_seen_window,v_zeile.freshness_window), '__helmutJobEntstanden', v_zeile.created_at, '__helmutJobFaellig', v_zeile.first_due_at), v_zeile.attempts, v_zeile.max_attempts, v_zeile.lease_expires_at;
end;
$$;
-- Eigene Einspruenge verhindern ein stilles Arbeiten mit der alten Claim-Logik,
-- wenn die Migration beim spaeteren Rollout noch fehlt. Kein Fallback im Adapter.
create or replace function public.helmut_claim_tagesarbeit(p_owner text,p_limit integer,p_lease_ms bigint,p_types text[] default null)
returns setof public.helmut_jobs language sql security invoker set search_path = public, pg_temp
as $$ select * from public.helmut_claim_jobs(p_owner,p_limit,p_lease_ms,p_types); $$;
create or replace function public.helmut_claim_tagesauftrag(p_job_id uuid,p_owner text,p_lease_ms bigint default 300000)
returns table(uebernommen boolean,grund text,id uuid,job_type text,tenant_id text,payload jsonb,attempts integer,max_attempts integer,lease_expires_at timestamptz)
language sql security invoker set search_path = public, pg_temp
as $$ select * from public.helmut_claim_job_by_id(p_job_id,p_owner,p_lease_ms); $$;
revoke all on function public.helmut_claim_tagesarbeit(text,integer,bigint,text[]) from public,anon,authenticated;
revoke all on function public.helmut_claim_tagesauftrag(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.helmut_claim_tagesarbeit(text,integer,bigint,text[]) to service_role;
grant execute on function public.helmut_claim_tagesauftrag(uuid,text,bigint) to service_role;
create index if not exists helmut_jobs_tagesstand_idx
  on public.helmut_jobs ((coalesce(last_seen_window,freshness_window)),job_type,status);
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

create or replace function public.helmut_jobs_tagesstand(
  p_fenster text[] default null,
  p_typen   text[] default null,
  p_mandat  text   default null
)
returns table(
  offen            bigint,
  wartend          bigint,
  laufend          bigint,
  fehlgeschlagen   bigint,
  erledigt         bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where j.status in ('wartend','laeuft'))  as offen,
    count(*) filter (where j.status = 'wartend')              as wartend,
    count(*) filter (where j.status = 'laeuft')               as laufend,
    count(*) filter (where j.status = 'fehlgeschlagen')       as fehlgeschlagen,
    count(*) filter (where j.status = 'erledigt')             as erledigt
    from public.helmut_jobs j
   where (p_fenster is null or coalesce(j.last_seen_window,j.freshness_window) = any(p_fenster))
     and (p_typen   is null or j.job_type = any(p_typen))
     and (
       nullif(btrim(p_mandat, E' \t\n\r\f\v'), '') is null
       or nullif(btrim(j.tenant_id, E' \t\n\r\f\v'), '') is null
       or btrim(j.tenant_id, E' \t\n\r\f\v') = btrim(p_mandat, E' \t\n\r\f\v')
     );
$$;
revoke all on function public.helmut_jobs_tagesstand(text[],text[],text) from public,anon,authenticated;
grant execute on function public.helmut_jobs_tagesstand(text[],text[],text) to service_role;

commit;
