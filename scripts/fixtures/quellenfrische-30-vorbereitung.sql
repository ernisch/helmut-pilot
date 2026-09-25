-- NICHT FREIGEGEBEN, NICHT AUSGEFUEHRT. Nur exakt diese30 Quellen und Fundstellen.
-- Roadmap 25.09.2026: frischer Schutzstand und konkretes Daten-GO erforderlich.
-- Kein Profilwrite, kein Modell, kein Auftrag, kein Retry bei unbekanntem Ausgang.
begin;
set local statement_timeout='15s';
set local lock_timeout='2s';
lock table public.raw_documents, public.document_findings in share row exclusive mode;
lock table public.mandate_profiles, public.helmut_jobs, public.pipeline_locks, public.process_runs in share mode;
do $import$
declare
  payload text := $eingabe$__PAYLOAD__$eingabe$;
  eingabe jsonb;
  n integer;
  grundlinie jsonb;
begin
  if encode(sha256(convert_to(payload,'UTF8')),'hex') <> '__SHA256__' then
    raise exception 'quellenimport-eingabehash';
  end if;
  eingabe := payload::jsonb;
  if jsonb_array_length(eingabe->'rows')<>30 or jsonb_array_length(eingabe->'findings')<>30 then
    raise exception 'quellenimport-anzahl';
  end if;
  if (select count(*) from public.mandate_profiles)<>504
    or exists(select 1 from public.mandate_profiles where aktiv)
    or exists(select 1 from public.pipeline_locks where expires_at>now())
    or exists(select 1 from public.helmut_jobs where status<>'erledigt' or lease_expires_at>now())
    or exists(select 1 from public.process_runs where finished_at is null and started_at>now()-interval '30 minutes') then
    raise exception 'quellenimport-nicht-ruhend';
  end if;
  grundlinie := jsonb_build_object(
    'profile',(select jsonb_agg(to_jsonb(p) order by user_id) from public.mandate_profiles p),
    'identitaeten',(select jsonb_agg(to_jsonb(p) order by id) from public.profiles p),
    'auth',(select data from public.helmut_store where id='main-auth'),
    'main',(select data from public.helmut_store where id='main'));
  if exists(select 1 from jsonb_array_elements(eingabe->'rows') x
    where (x->>'published_at')::timestamptz>now()
      or (x->>'published_at')::timestamptz<now()-interval '48 hours'
      or (x->>'retrieved_at')::timestamptz>now()
      or (x->>'retrieved_at')::timestamptz<now()-interval '48 hours') then
    raise exception 'quellenimport-nicht-frisch';
  end if;
  if exists(select 1 from jsonb_array_elements(eingabe->'rows') x join public.raw_documents r
    on r.id=x->>'id' or r.content_fingerprint=x->>'content_fingerprint'
      or r.canonical_target_url=x->>'canonical_url' or r.canonical_url=x->>'canonical_url') then
    raise exception 'quellenimport-bestandstreffer';
  end if;
  insert into public.raw_documents(canonical_target_url,canonical_url,confidence,content_fingerprint,finding_count,id,link_type,published_at,publisher_id,retrieved_at,source_id,source_name,source_type,summary,title,url)
    select p.canonical_target_url,p.canonical_url,p.confidence,p.content_fingerprint,p.finding_count,p.id,p.link_type,p.published_at,p.publisher_id,p.retrieved_at,p.source_id,p.source_name,p.source_type,p.summary,p.title,p.url from jsonb_populate_recordset(null::public.raw_documents,eingabe->'rows') p;
  get diagnostics n = row_count;
  if n<>30 then raise exception 'quellenimport-rohzahl'; end if;
  insert into public.document_findings(raw_document_id,source_id,retrieval_path_id,original_url,link_type,found_at)
    select p.raw_document_id,p.source_id,p.retrieval_path_id,p.original_url,p.link_type,p.found_at from jsonb_populate_recordset(null::public.document_findings,eingabe->'findings') p;
  get diagnostics n = row_count;
  if n<>30 then raise exception 'quellenimport-fundzahl'; end if;
  if exists(select 1 from jsonb_array_elements(eingabe->'rows') x
    left join public.raw_documents r on r.id=x->>'id'
    where r.id is null or exists(select 1 from jsonb_each(x) e
      where to_jsonb(r)->e.key is distinct from to_jsonb(jsonb_populate_record(null::public.raw_documents,x))->e.key)) then
    raise exception 'quellenimport-ruecklesung';
  end if;
  if exists(select 1 from jsonb_array_elements(eingabe->'findings') x
    left join public.document_findings r on r.raw_document_id=x->>'raw_document_id'
      and r.source_id=x->>'source_id' and r.original_url=x->>'original_url'
    where r.raw_document_id is null or exists(select 1 from jsonb_each(x) e
      where to_jsonb(r)->e.key is distinct from to_jsonb(jsonb_populate_record(null::public.document_findings,x))->e.key)) then
    raise exception 'quellenimport-fundruecklesung';
  end if;
  if grundlinie is distinct from jsonb_build_object(
    'profile',(select jsonb_agg(to_jsonb(p) order by user_id) from public.mandate_profiles p),
    'identitaeten',(select jsonb_agg(to_jsonb(p) order by id) from public.profiles p),
    'auth',(select data from public.helmut_store where id='main-auth'),
    'main',(select data from public.helmut_store where id='main')) then
    raise exception 'quellenimport-fremde-wirkung';
  end if;
end $import$;
commit;
