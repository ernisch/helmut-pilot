-- Additive Migration fuer native Quellenauftraege. Kein Backfill.
begin;
set local lock_timeout = '2s';

create table if not exists public.helmut_quellen_dlq (
  job_id uuid primary key,
  attempts integer not null check (attempts >= 0),
  max_attempts integer not null check (max_attempts > 0),
  failed_at timestamptz not null,
  failure_kind text not null check (failure_kind in ('lease-ausgang-offen', 'quellenauftrag-fehlgeschlagen'))
);
alter table public.helmut_quellen_dlq enable row level security;
alter table public.helmut_quellen_dlq force row level security;
revoke all on public.helmut_quellen_dlq from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert on public.helmut_quellen_dlq to service_role;
  end if;
end;
$$;

create or replace function public.helmut_quellen_versuchsgrenze()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.max_attempts := least(new.max_attempts, 3);
  return new;
end;
$$;
revoke all on function public.helmut_quellen_versuchsgrenze() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.helmut_quellen_versuchsgrenze() to service_role;
  end if;
end;
$$;

drop trigger if exists helmut_quellen_versuchsgrenze on public.helmut_jobs;
create trigger helmut_quellen_versuchsgrenze
before insert on public.helmut_jobs for each row
when (new.job_type = 'source_fetch')
execute function public.helmut_quellen_versuchsgrenze();

create or replace function public.helmut_quellen_dlq_erfassen()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Original und Fehlertext bleiben in helmut_jobs. Die Quarantaene besitzt
  -- keine Payload, URL, Mandatsdaten oder Berechtigung zur Wiedervorlage.
  insert into public.helmut_quellen_dlq (job_id, attempts, max_attempts, failed_at, failure_kind)
  values (new.id, new.attempts, new.max_attempts, coalesce(new.finished_at, clock_timestamp()),
    case when new.last_error = 'versuche-erschoepft' then 'lease-ausgang-offen'
    else 'quellenauftrag-fehlgeschlagen' end)
  on conflict (job_id) do nothing;
  return new;
end;
$$;
revoke all on function public.helmut_quellen_dlq_erfassen() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.helmut_quellen_dlq_erfassen() to service_role;
  end if;
end;
$$;

drop trigger if exists helmut_quellen_dlq_erfassen on public.helmut_jobs;
create trigger helmut_quellen_dlq_erfassen
after update of status on public.helmut_jobs for each row
when (old.status is distinct from new.status and new.status = 'fehlgeschlagen'
  and new.job_type = 'source_fetch')
execute function public.helmut_quellen_dlq_erfassen();

CREATE OR REPLACE FUNCTION public.helmut_extend_job_lease(p_id uuid, p_owner text, p_lease_ms bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rows integer;
begin
  update public.helmut_jobs
     set lease_expires_at = now() + (greatest(p_lease_ms, 1000) * interval '1 millisecond')
   where id = p_id and lease_owner = p_owner and status = 'laeuft'
     and lease_expires_at > clock_timestamp();
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$function$;

CREATE OR REPLACE FUNCTION public.helmut_finish_job(p_id uuid, p_owner text, p_ok boolean, p_error text DEFAULT NULL::text, p_retry_delay_ms bigint DEFAULT 0)
 RETURNS TABLE(uebernommen boolean, neuer_status text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_now      timestamptz := now();
  v_attempts integer;
  v_max      integer;
  v_status   text;
  v_rows     integer;
begin
  select j.attempts, j.max_attempts into v_attempts, v_max
    from public.helmut_jobs j
   where j.id = p_id and j.lease_owner = p_owner and j.status = 'laeuft' and j.lease_expires_at > clock_timestamp()
   for update;

  if not found then
    -- Lease verloren oder schon abgeschlossen.
    -- `return query` FUEHRT DIE FUNKTION FORT — ohne das folgende `return;` liefe der
    -- Rumpf weiter und haenge am Ende eine ZWEITE Zeile an. Der Aufrufer saehe dann
    -- zwei widerspruechliche Antworten auf eine Frage (belegt: Abschnitt 6 der Suite
    -- jobqueue-datenbank-test.js meldete `f` UND `t`). Deshalb hier hart beenden.
    return query select false, null::text;
    return;
  end if;

  if p_ok then
    v_status := 'erledigt';
    update public.helmut_jobs
       set status = 'erledigt', finished_at = v_now,
           lease_owner = null, lease_expires_at = null, last_error = null
     where id = p_id;
  elsif v_attempts >= v_max then
    v_status := 'fehlgeschlagen';
    update public.helmut_jobs
       set status = 'fehlgeschlagen', finished_at = v_now,
           lease_owner = null, lease_expires_at = null, last_error = p_error
     where id = p_id;
  else
    v_status := 'wartend';
    update public.helmut_jobs
       set status = 'wartend',
           due_at = v_now + (greatest(coalesce(p_retry_delay_ms, 0), 0) * interval '1 millisecond'),
           lease_owner = null, lease_expires_at = null, last_error = p_error
     where id = p_id;
  end if;

  get diagnostics v_rows = row_count;
  return query select v_rows > 0, v_status;
end;
$function$;

CREATE OR REPLACE FUNCTION public.helmut_jobs_wiedervorlage(p_typen text[] DEFAULT ARRAY['document_understanding'::text], p_aelter_als_stunden integer DEFAULT 24, p_max_wiedervorlagen integer DEFAULT 2, p_max_zeilen integer DEFAULT 500, p_trockenlauf boolean DEFAULT true)
 RETURNS TABLE(gefunden bigint, wiedervorgelegt bigint, trockenlauf boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_grenze timestamptz := now() - (greatest(coalesce(p_aelter_als_stunden, 24), 1) * interval '1 hour');
  v_max_wv integer     := greatest(coalesce(p_max_wiedervorlagen, 2), 0);
  v_max    integer     := greatest(coalesce(p_max_zeilen, 500), 1);
  v_gefunden bigint;
  v_getan    bigint := 0;
begin
  select count(*) into v_gefunden
    from public.helmut_jobs j
   where j.status = 'fehlgeschlagen'
     and (p_typen is null or j.job_type = any(p_typen))
     and j.finished_at < v_grenze
     and j.wiedervorlagen < v_max_wv
     and not exists (select 1 from public.helmut_quellen_dlq d where d.job_id = j.id);

  if coalesce(p_trockenlauf, true) then
    return query select v_gefunden, 0::bigint, true;
    return;
  end if;

  with kandidaten as (
    select j.id
      from public.helmut_jobs j
     where j.status = 'fehlgeschlagen'
       and (p_typen is null or j.job_type = any(p_typen))
       and j.finished_at < v_grenze
       and j.wiedervorlagen < v_max_wv
       and not exists (select 1 from public.helmut_quellen_dlq d where d.job_id = j.id)
     order by j.finished_at asc
     limit v_max
     -- Nebenlaeufigkeitsfest wie der Claim: zwei gleichzeitige Wiedervorlagen duerfen
     -- denselben Auftrag nicht zweimal nehmen.
     for update skip locked
  )
  update public.helmut_jobs j
     set status         = 'wartend',
         -- Der Auftrag beginnt mit einem frischen Versuchskonto, sonst waere er nach dem
         -- ersten neuen Fehlversuch sofort wieder endgueltig gescheitert.
         attempts       = 0,
         due_at         = now(),
         -- `first_due_at` bleibt UNVERAENDERT: die Rueckstandsmessung soll weiterhin sehen,
         -- wie lange diese Arbeit insgesamt offen ist. Genau das war Befund B2.
         finished_at    = null,
         lease_owner    = null,
         lease_expires_at = null,
         wiedervorlagen = j.wiedervorlagen + 1,
         -- DER BELEG BLEIBT. Der bisherige Fehlertext wird nicht geloescht, sondern
         -- ausdruecklich als Vorgeschichte gekennzeichnet.
         last_error     = 'wiedervorlage ' || (j.wiedervorlagen + 1)::text
                          || ' nach: ' || left(coalesce(j.last_error, 'unbekannt'), 180),
         updated_at     = now()
    from kandidaten k
   where j.id = k.id;

  get diagnostics v_getan = row_count;
  return query select v_gefunden, v_getan, false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.helmut_jobs_wiedervorlage_vorschau(p_typen text[] DEFAULT ARRAY['document_understanding'::text], p_aelter_als_stunden integer DEFAULT 24, p_max_wiedervorlagen integer DEFAULT 2)
 RETURNS TABLE(kandidaten bigint, dauerhaft_blockiert bigint, noch_zu_jung bigint, aeltester timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with grenze as (
    select now() - (greatest(coalesce(p_aelter_als_stunden, 24), 1) * interval '1 hour') as t
  )
  select
    count(*) filter (
      where j.finished_at < (select t from grenze)
        and d.job_id is null and j.wiedervorlagen < greatest(coalesce(p_max_wiedervorlagen, 2), 0)),
    count(*) filter (
      where d.job_id is not null or j.wiedervorlagen >= greatest(coalesce(p_max_wiedervorlagen, 2), 0)),
    count(*) filter (
      where j.finished_at >= (select t from grenze)
        and d.job_id is null and j.wiedervorlagen < greatest(coalesce(p_max_wiedervorlagen, 2), 0)),
    min(j.finished_at)
    from public.helmut_jobs j
    left join public.helmut_quellen_dlq d on d.job_id = j.id
   where j.status = 'fehlgeschlagen'
     and (p_typen is null or j.job_type = any(p_typen));
$function$;

CREATE OR REPLACE FUNCTION public.helmut_jobs_blockiert(p_max_wiedervorlagen integer DEFAULT 2)
 RETURNS TABLE(blockiert bigint, nach_typ jsonb, aeltester timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- BEFUND B15 (Review PR #235). Die vorherige Fassung verband die blockierten Zeilen ueber
  -- ein UNKORRELIERTES `left join lateral` mit ihrer eigenen Typaufstellung. Die Unterabfrage
  -- liefert eine Zeile JE TYP — und zwar fuer JEDE Zeile von `j`. `count(*)` zaehlte damit
  -- das Kreuzprodukt: bei zwei blockierten Auftragstypen das Doppelte, bei dreien das
  -- Dreifache. Gemessen an echter PostgreSQL 16.13: 5 blockierte Zeilen ⇒ gemeldet 10,
  -- 9 ⇒ 27. Bei genau EINEM Typ stimmte die Zahl zufaellig — deshalb blieb der Fehler
  -- unentdeckt, denn alle Bestandstests kannten nur `document_understanding`.
  -- Die Gesamtzahl widersprach dabei ihrer eigenen Aufstellung `nach_typ` (die korrekt war).
  -- Jetzt wird die Menge EINMAL bestimmt und daraus beides abgeleitet — kein Join, kein
  -- Kreuzprodukt, Gesamtzahl und Aufstellung koennen nicht mehr auseinanderlaufen.
  with blockierte as (
    select j.job_type, j.finished_at
      from public.helmut_jobs j
     where j.status = 'fehlgeschlagen'
       and (j.wiedervorlagen >= greatest(coalesce(p_max_wiedervorlagen, 2), 0)
         or exists (select 1 from public.helmut_quellen_dlq d where d.job_id = j.id))
  ), je_typ as (
    select b.job_type, count(*) as n from blockierte b group by b.job_type
  )
  select
    (select count(*) from blockierte),
    coalesce((select jsonb_object_agg(je_typ.job_type, je_typ.n) from je_typ), '{}'::jsonb),
    (select min(b.finished_at) from blockierte b);
$function$;

commit;
