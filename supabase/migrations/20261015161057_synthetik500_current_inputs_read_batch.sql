-- Exact full Source23/KO60 read transport for the closed EU500 context.
-- No data/role/RLS/default-setting changes. All application guards still run.
-- One fresh HTTP request per original guard; never retain a prior response.
begin;
do $native_id_type$
begin
  -- Existing native ABI has text primary keys. Do not cast indexed columns to
  -- text or silently switch to a different native type/JSON conversion.
  if (select a.atttypid from pg_catalog.pg_attribute a
      where a.attrelid=pg_catalog.to_regclass('public.raw_documents') and a.attname='id'
        and a.attnum>0 and not a.attisdropped) is distinct from 'text'::pg_catalog.regtype
     or (select a.atttypid from pg_catalog.pg_attribute a
      where a.attrelid=pg_catalog.to_regclass('public.knowledge_objects') and a.attname='id'
        and a.attnum>0 and not a.attisdropped) is distinct from 'text'::pg_catalog.regtype then
    raise exception using errcode='42804', message='synthetik500-current-inputs-native-id-type';
  end if;
end $native_id_type$;
create function public.helmut_synthetik500_current_inputs_v1(
  p_document_ids text[], p_knowledge_object_ids text[], p_read_nonce text
) returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog as $read_inputs$
declare
  v_documents jsonb := '[]'::jsonb;
  v_kos jsonb := '[]'::jsonb;
  v_batch jsonb;
  v_meta jsonb;
  v_offset integer;
  v_ids text[];
  v_response jsonb;
begin
  if current_user is distinct from 'service_role'
     or current_setting('transaction_read_only') is distinct from 'on' then
    raise exception using errcode='42501', message='synthetik500-current-inputs-service-readonly-required';
  end if;
  -- Closed exact500 original-context transport. Other shapes use ORIGINAL Node path.
  if p_document_ids is null or p_knowledge_object_ids is null
     or array_ndims(p_document_ids) is distinct from 1
     or array_ndims(p_knowledge_object_ids) is distinct from 1
     or array_lower(p_document_ids,1) is distinct from 1
     or array_lower(p_knowledge_object_ids,1) is distinct from 1
     or cardinality(p_document_ids) <> 874 or cardinality(p_knowledge_object_ids) <> 500
     or p_read_nonce is null or p_read_nonce !~ '^[a-f0-9]{32}$'
     or exists(select 1 from unnest(p_document_ids || p_knowledge_object_ids) x(id)
       where id is null or char_length(id) not between 1 and 200
         or id ~ '[^A-Za-z0-9_ÄÖÜäöüß-]')
     or (select count(distinct id) from unnest(p_document_ids) x(id)) <> 874
     or (select count(distinct id) from unnest(p_knowledge_object_ids) x(id)) <> 500 then
    raise exception using errcode='22023', message='synthetik500-current-inputs-selector';
  end if;
  v_meta := jsonb_build_object(
    'version','helmut-synthetik500-current-input-batches/1',
    'readNonce',p_read_nonce, 'caller',current_user,
    'readOnly',current_setting('transaction_read_only'),
    'snapshot',pg_current_snapshot()::text,
    'statementAtUTC',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'codec',jsonb_build_object('serverVersionNum',current_setting('server_version_num'),
      'timeZone',current_setting('TimeZone'),'dateStyle',current_setting('DateStyle'),
      'extraFloatDigits',current_setting('extra_float_digits'),
      'clientEncoding',current_setting('client_encoding'),'serverEncoding',current_setting('server_encoding')));
  <<read_batches>>
  begin
  -- Preserve original D batches BEFORE KO batches, each up to100 IDs.
  -- 14 SQL reads remain; 13 network/gateway/transaction-start round trips disappear.
  for v_offset in 1..874 by 100 loop
    v_ids := p_document_ids[v_offset:least(v_offset+99,874)];
    select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) into v_batch
    from (select
      d.id,
      d.title,
      d.summary,
      d.canonical_url,
      d.url,
      d.content_hash,
      d.source_id,
      d.source_name,
      d.source_type,
      d.document_type,
      d.link_type,
      d.confidence,
      d.published_at,
      d.retrieved_at,
      d.created_at,
      d.raw -> 'helmutQuellenkontext' as quellenauszug_beleg,
      d.raw -> 'helmutDipQuellfelder' as dip_quellfelder,
      d.raw -> 'helmutBundestagArtikelstand' as bundestag_artikelstand,
      d.raw -> 'helmutBerlinArtikelstand' as berlin_artikelstand,
      d.raw -> 'helmutBrandenburgLandtagPresseArtikelstand' as brandenburg_artikelstand,
      d.retrieved_at as bundestag_abgerufen_at,
      d.retrieved_at as berlin_abgerufen_at,
      d.retrieved_at as brandenburg_abgerufen_at
      from public.raw_documents d where d.id=any(v_ids)) q;
    v_documents := v_documents || jsonb_build_array(v_batch);
    if jsonb_array_length(v_batch) <> cardinality(v_ids) then
      -- Original Node guard will raise its original current-input-incomplete
      -- on exactly this batch. Do not touch later KO tables after D incompleteness.
      exit read_batches;
    end if;
  end loop;
  for v_offset in 1..500 by 100 loop
    v_ids := p_knowledge_object_ids[v_offset:least(v_offset+99,500)];
    select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) into v_batch
    from (select
      k.id,
      k.vorgang_id,
      k.ko_version,
      k.headline,
      k.was_ist_passiert,
      k.warum_wichtig,
      k.wer_ist_betroffen,
      k.parteien,
      k.ausschuesse,
      k.ministerien,
      k.risiken,
      k.chancen,
      k.zeitdruck,
      k.handlungsempfehlung,
      k.confidence_score,
      k.source_document_count,
      k.status,
      k.understanding_status,
      k.mentioned_people,
      k.mentioned_mps,
      k.mentioned_parties,
      k.mentioned_committees,
      k.mentioned_ministries,
      k.mentioned_locations,
      k.mentioned_organizations,
      k.policy_field,
      k.political_level,
      k.instrument,
      k.stage,
      k.tags,
      k.deadline,
      k.best_source_url,
      k.best_link_type,
      k.source_trust,
      k.understanding_model,
      k.understanding_tokens,
      k.created_at,
      k.updated_at,
      k.display_title,
      k.display_summary,
      k.why_relevant,
      k.recommendation,
      k.display_category,
      k.risk_of_no_action,
      k.opportunity_summary,
      k.recommended_communication,
      k.action_items,
      k.risk_level,
      k.opportunity_level,
      k.recommended_communication_struct,
      k.action_items_struct,
      k.decision_level,
      k.related_levels,
      k.event_type,
      k.affected_geographies,
      k.mentioned_geographies,
      k.decision_entities,
      k.related_entities,
      k.classification_confidence,
      k.verstehen_fencing
      from public.knowledge_objects k where k.id=any(v_ids)) q;
    v_kos := v_kos || jsonb_build_array(v_batch);
    if jsonb_array_length(v_batch) <> cardinality(v_ids) then
      exit read_batches;
    end if;
  end loop;
  end read_batches;
  v_response := v_meta || jsonb_build_object('documents',v_documents,'knowledgeObjects',v_kos);
  -- Entire scalar JSONB response, not a subset/pg_column_size/row-count bound.
  -- The native PostgREST scalar UTF8 rendering must be checked before rollout.
  if octet_length(convert_to(v_response::text,'UTF8')) > 16777216 then
    raise exception using errcode='54000', message='synthetik500-current-inputs-response-cap';
  end if;
  return v_response;
end $read_inputs$;
revoke all on function public.helmut_synthetik500_current_inputs_v1(text[],text[],text) from public,anon,authenticated,service_role;
grant execute on function public.helmut_synthetik500_current_inputs_v1(text[],text[],text) to service_role;
comment on function public.helmut_synthetik500_current_inputs_v1(text[],text[],text) is 'Service-only read-only complete Source23/KO60 batches; fresh caller-statement snapshot; entire UTF8 response cap16777216 bytes; no authorization or result reuse';
commit;
