-- OPERATOR, keine Migration. Nur nach eigener Freigabe und direktem arbeitsfreiem
-- Hetzner-Vorflug. Standard: Vorschau. Keine alte Lease wird als Laufrecht benutzt.
-- Der vorhandene native Claim mit limit=0 fuehrt nur die Leasebereinigung aus.
-- Vor Freigabe den Defer-Leasefix anwenden und eine FRISCHE Vorschau erzeugen.
-- modus=vorschau|freigeben|rueckweg, job_id=UUID, bindung=private JSON-Quittung.
\set ON_ERROR_STOP on
\if :{?modus}
\else
  \set modus vorschau
\endif
\if :{?job_id}
\else
  \set job_id ''
\endif
\if :{?bindung}
\else
  \set bindung '{}'
\endif
begin isolation level serializable;
set local time zone 'UTC';
set local lock_timeout='3s';
set local statement_timeout='15s';
create temporary table helmut_lease_parameter on commit drop as
  select :'modus'::text modus, :'job_id'::uuid job_id, :'bindung'::jsonb bindung;
create temporary table helmut_lease_quittung(ausgabe jsonb) on commit drop;
create function pg_temp.helmut_lease_stand(p_job uuid) returns jsonb
language sql stable as $stand$
  select jsonb_build_object(
    'job',(select to_jsonb(j) from public.helmut_jobs j where id=p_job),
    'andereLaufende',(select count(*) from public.helmut_jobs where status='laeuft' and id<>p_job),
    'wartendErschoepft',(select count(*) from public.helmut_jobs where status='wartend' and attempts>=max_attempts),
    'claimHash',encode(sha256(convert_to(pg_get_functiondef('public.helmut_claim_jobs(text,integer,bigint,text[])'::regprocedure),'UTF8')),'hex'),
    'deferHash',encode(sha256(convert_to(pg_get_functiondef('public.helmut_defer_job(uuid,text,bigint,text)'::regprocedure),'UTF8')),'hex'));
$stand$;
do $operation$
declare p record; b jsonb; v_vor jsonb; v_nach jsonb; v_job jsonb;
  v_jetzt timestamptz:=clock_timestamp(); v_tag text:=current_date::text;
  v_vor_hash text; v_nach_hash text; v_n integer;
begin
  select * into strict p from helmut_lease_parameter;
  if p.modus not in ('vorschau','freigeben','rueckweg') then
    raise exception 'lease: Modus ungueltig'; end if;
  if p.modus<>'vorschau' then
    lock table public.helmut_jobs in share row exclusive mode;
  end if;
  v_vor:=pg_temp.helmut_lease_stand(p.job_id); v_job:=v_vor->'job'; b:=p.bindung;
  v_vor_hash:=encode(sha256(convert_to(v_vor::text,'UTF8')),'hex');
  if v_vor->>'claimHash'<>'a388e5e2f7e63d3a8c3e9c3e5352190fbe9629c98eafa4a4e98c6901d5c3c238'
    or v_job='null'::jsonb or v_job->>'job_type' is distinct from 'document_understanding'
    or v_job->'tenant_id' is distinct from 'null'::jsonb
    or v_vor->'andereLaufende'<>'0'::jsonb or v_vor->'wartendErschoepft'<>'0'::jsonb
  then raise exception 'lease: unbekannter Claim oder weiterer Arbeitszustand'; end if;
  if p.modus='vorschau' then
    insert into helmut_lease_quittung values(jsonb_build_object('version',1,'modus','vorschau',
      'tag',v_tag,'jobId',p.job_id,'gelesenAm',v_jetzt,'vor',v_vor,'digest',v_vor_hash));
    return;
  end if;
  if b->'version' is distinct from '1'::jsonb or b->>'tag' is distinct from v_tag
    or b->>'jobId' is distinct from p.job_id::text
    or coalesce(b->>'geprueftAm',b->>'gelesenAm') is null
    or coalesce(b->>'geprueftAm',b->>'gelesenAm')::timestamptz>v_jetzt
    or coalesce(b->>'geprueftAm',b->>'gelesenAm')::timestamptz<v_jetzt-interval '15 minutes'
    or v_vor->>'deferHash'<>'6af2bcdb614ef003f8aa612bc58cd8cc17c65e8035512daef345631c541be434'
  then raise exception 'lease: frische Freigabe oder Defer-Leasefix fehlt'; end if;
  if p.modus='freigeben' then
    if b->>'modus' is distinct from 'vorschau' or b->'vor' is distinct from v_vor
      or b->>'digest' is distinct from v_vor_hash
      or v_job->>'status' is distinct from 'laeuft' or v_job->>'lease_owner' is null
      or v_job->>'lease_expires_at' is null
      or (v_job->>'lease_expires_at')::timestamptz>=clock_timestamp()
      or v_job->>'finished_at' is not null
      or (v_job->>'attempts')::int not between 1 and (v_job->>'max_attempts')::int-1
    then raise exception 'lease: abgelaufener Einzelvorwert abweichend'; end if;
    select count(*) into v_n from public.helmut_claim_jobs(
      'operator-lease-'||p.job_id::text,0,1000,array[]::text[]);
    if v_n<>0 then raise exception 'lease: unerwarteter neuer Claim'; end if;
  else
    if b->>'modus' is distinct from 'freigegeben' or b->'nach' is distinct from v_vor
      or b->>'nachDigest' is distinct from v_vor_hash
      or b->>'vorDigest' is distinct from encode(sha256(convert_to((b->'vor')::text,'UTF8')),'hex')
      or v_job->>'status' is distinct from 'wartend'
      or v_job->>'lease_owner' is not null or v_job->>'lease_expires_at' is not null
      or b->'vor'->'job'->>'status' is distinct from 'laeuft'
      or b->'vor'->'job'->>'lease_owner' is null or b->'vor'->'job'->>'lease_expires_at' is null
      or (b->'vor'->'job'->>'lease_expires_at')::timestamptz>=clock_timestamp()
      or (v_vor-'job') is distinct from ((b->'vor')-'job')
      or (v_job-array['status','lease_owner','lease_expires_at','updated_at'])
        is distinct from ((b->'vor'->'job')-array['status','lease_owner','lease_expires_at','updated_at'])
    then raise exception 'lease: Rueckweg nach Drift oder Folgearbeit gesperrt'; end if;
    update public.helmut_jobs set status='laeuft',
      lease_owner=b->'vor'->'job'->>'lease_owner',
      lease_expires_at=(b->'vor'->'job'->>'lease_expires_at')::timestamptz,
      updated_at=clock_timestamp() where id=p.job_id;
    get diagnostics v_n=row_count;
    if v_n<>1 then raise exception 'lease: Rueckweg unbestaetigt'; end if;
  end if;
  v_nach:=pg_temp.helmut_lease_stand(p.job_id);
  if (v_vor-'job') is distinct from (v_nach-'job')
    or ((v_vor->'job')-array['status','lease_owner','lease_expires_at','updated_at'])
      is distinct from ((v_nach->'job')-array['status','lease_owner','lease_expires_at','updated_at'])
    or p.modus='freigeben' and (v_nach->'job'->>'status' is distinct from 'wartend'
      or v_nach->'job'->>'lease_owner' is not null or v_nach->'job'->>'lease_expires_at' is not null)
  then raise exception 'lease: Nachwert oder geschuetzte Substanz abweichend'; end if;
  v_nach_hash:=encode(sha256(convert_to(v_nach::text,'UTF8')),'hex');
  insert into helmut_lease_quittung values(jsonb_build_object('version',1,
    'modus',case p.modus when 'freigeben' then 'freigegeben' else 'zurueckgenommen' end,
    'tag',v_tag,'jobId',p.job_id,'geprueftAm',v_jetzt,
    'vor',v_vor,'nach',v_nach,'vorDigest',v_vor_hash,'nachDigest',v_nach_hash));
end;
$operation$;
select ausgabe from helmut_lease_quittung;
commit;
