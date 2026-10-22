-- LOCAL-ONLY rollback for bounded-native-read-v1, never an automatic retry.
-- Restores the exact original graph reader; data and history remain untouched.
begin;
create or replace function public.helmut_auth_state_graph_read_v1(jsonb) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare a jsonb;m jsonb;graph jsonb;u jsonb;s text; conditional boolean; known jsonb;
  reused boolean:=false; actual_count bigint; actual_hashes boolean; binding text; result jsonb;
  graph_conditional boolean; known_graph jsonb; graph_reused boolean:=false; graph_count integer; graph_digest text; graph_binding text;
begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on'
    or current_setting('server_encoding')<>'UTF8' or current_setting('client_encoding')<>'UTF8' then raise exception 'auth-state-local-only';end if;
  if jsonb_typeof($1) is distinct from 'object'
    or jsonb_typeof($1->'id') is distinct from 'string' or length($1->>'id') not between 1 and 256 then
    raise exception 'auth-state-read-input';end if;
  graph_conditional:=(select count(*)from jsonb_object_keys($1))=4 and $1 ?& array['id','knownProof','readNonce','knownGraph'];
  conditional:=graph_conditional or ((select count(*)from jsonb_object_keys($1))=3 and $1 ?& array['id','knownProof','readNonce']);
  if not conditional and (select count(*)from jsonb_object_keys($1))<>1 then raise exception 'auth-state-read-input';end if;
  if conditional then
    if jsonb_typeof($1->'readNonce') is distinct from 'string' or $1->>'readNonce' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or jsonb_typeof($1->'knownProof') not in ('null','object') then raise exception 'auth-history-reuse-input';end if;
    known:=nullif($1->'knownProof','null'::jsonb);
    if known is not null then
      if (select count(*)from jsonb_object_keys(known))<>4 or not(known ?& array['generation','count','head','originalHash'])
        or jsonb_typeof(known->'generation') is distinct from 'string' or known->>'generation' !~ '^[a-f0-9-]{36}$'
        or jsonb_typeof(known->'count') is distinct from 'number' or known->>'count' !~ '^(0|[1-9][0-9]*)$'
        or (known->>'count')::numeric>9007199254740991
        or jsonb_typeof(known->'head') is distinct from 'string' or known->>'head' !~ '^[a-f0-9]{64}$'
        or jsonb_typeof(known->'originalHash') is distinct from 'string' or known->>'originalHash' !~ '^[a-f0-9]{64}$' then
        raise exception 'auth-history-reuse-input';end if;
    end if;
  end if;
  if graph_conditional then
    if jsonb_typeof($1->'knownGraph') not in ('null','object') then raise exception 'auth-graph-reuse-input';end if;
    known_graph:=nullif($1->'knownGraph','null'::jsonb);
    if known_graph is not null then
      if (select count(*)from jsonb_object_keys(known_graph))<>3 or not(known_graph ?& array['state','nodeCount','nodeDigest'])
        or jsonb_typeof(known_graph->'state') is distinct from 'object'
        or (select count(*)from jsonb_object_keys(known_graph->'state'))<>4
        or not((known_graph->'state') ?& array['version','generation','root','originalHash'])
        or known_graph#>>'{state,version}' is distinct from 'merkle-auth-v1'
        or jsonb_typeof(known_graph#>'{state,generation}') is distinct from 'string'
        or known_graph#>>'{state,generation}' !~ '^[a-f0-9-]{36}$'
        or jsonb_typeof(known_graph#>'{state,root}') is distinct from 'string'
        or known_graph#>>'{state,root}' !~ '^[a-f0-9]{64}$'
        or jsonb_typeof(known_graph#>'{state,originalHash}') is distinct from 'string'
        or known_graph#>>'{state,originalHash}' !~ '^[a-f0-9]{64}$'
        or jsonb_typeof(known_graph->'nodeCount') is distinct from 'number'
        or known_graph->>'nodeCount' !~ '^[1-9][0-9]*$'
        or (known_graph->>'nodeCount')::numeric>20000
        or jsonb_typeof(known_graph->'nodeDigest') is distinct from 'string'
        or known_graph->>'nodeDigest' !~ '^[a-f0-9]{64}$' then raise exception 'auth-graph-reuse-input';end if;
    end if;
  end if;
  s:=$1->>'id';select data into strict a from public.helmut_store where id=s;
  m:=public.helmut_auth_state_assert_root_local_v1(a);
  -- Both existing complete fresh readers still run in this SAME MVCC snapshot.
  -- Only a state-identical graph can omit payload transport. Its full native
  -- reachability/bounds pass AND actual-payload SHA pass still execute freshly.
  graph_reused:=graph_conditional and known_graph is not null and known_graph->'state'=m;
  graph:=public.helmut_auth_state_expand_local_v1(s,m->>'generation',m->>'root',true,graph_reused);
  if graph_conditional then
    if graph_reused then
      graph_count:=(graph->>'nodeCount')::integer;graph_digest:=graph->>'nodeDigest';
      if graph_count<>(known_graph->>'nodeCount')::integer or graph_digest is distinct from known_graph->>'nodeDigest' then
        raise exception 'auth-graph-reuse-content-mismatch';end if;
    else
      graph_count:=jsonb_array_length(graph->'nodes');
      select encode(sha256(convert_to(string_agg(value->>'hash','|'order by ord),'UTF8')),'hex') into graph_digest
        from jsonb_array_elements(graph->'nodes')with ordinality e(value,ord);
    end if;
  end if;
  u:=public.helmut_auth_usage_read_v1(jsonb_build_object('id',s));
  if u->'proof' is distinct from (a->'_llmUsageRef')-'version'
    or u#>>'{data,_authStoreRevision}' is distinct from a->>'_authStoreRevision' then
    raise exception 'auth-state-usage-snapshot-mismatch';end if;
  if conditional then
    -- Recompute from EVERY actual persisted record, not from a supplied hash
    -- or the cached JSON. Generated hashes and the fresh complete chain must
    -- agree before any history bytes may be omitted from the response.
    select count(*),coalesce(bool_and(t.usage_record is not null and jsonb_typeof(t.usage_record)='object' and t.usage_record_hash is not null and t.usage_prev_hash is not null and t.usage_chain_hash is not null and t.usage_ordinal is not null and t.usage_ordinal between 1 and (u#>>'{proof,count}')::bigint and encode(sha256(substring(jsonb_send(t.usage_record)from 2)),'hex')=t.usage_record_hash),true)
      into actual_count,actual_hashes from public.llm_usage t
      where t.usage_store_id=s and t.usage_generation=u#>>'{proof,generation}';
    if actual_count<>(u#>>'{proof,count}')::bigint or not actual_hashes then raise exception 'auth-history-actual-content-mismatch';end if;
    reused:=known is not null and known=u->'proof';
  end if;
  result:=jsonb_build_object('data',case when reused then jsonb_build_object('_authStoreRevision',a->'_authStoreRevision')
      else jsonb_build_object('_authStoreRevision',a->'_authStoreRevision','llmUsage',u#>'{data,llmUsage}')end,
    'graph',case when graph_reused then 'null'::jsonb else graph end,'proof',u->'proof','state',m);
  if conditional then
    -- This digest binds response fields to this request. It is not a signature
    -- and does not replace the authenticated, pinned native database origin.
    binding:=encode(sha256(convert_to('verified-history-reuse-v1|'||($1->>'readNonce')||'|'
      ||encode(sha256(convert_to(s,'UTF8')),'hex')||'|'||(a->>'_authStoreRevision')||'|'
      ||(m->>'version')||'|'||(m->>'generation')||'|'||(m->>'root')||'|'||(m->>'originalHash')||'|'
      ||(u#>>'{proof,generation}')||'|'||((u#>>'{proof,count}')::bigint)::text||'|'||(u#>>'{proof,head}')||'|'
      ||(u#>>'{proof,originalHash}')||'|'||case when reused then '1'else '0'end,'UTF8')),'hex');
    result:=result||jsonb_build_object('historyReuse',jsonb_build_object('version','verified-history-reuse-v1',
      'nonce',$1->>'readNonce','reused',reused,'binding',binding));
  end if;
  if graph_conditional then
    -- Like the history digest, this binds fresh native results to this request;
    -- it is not a signature and never replaces the authenticated DB origin.
    graph_binding:=encode(sha256(convert_to('verified-graph-reuse-v1|'||($1->>'readNonce')||'|'
      ||encode(sha256(convert_to(s,'UTF8')),'hex')||'|'||(a->>'_authStoreRevision')||'|'
      ||(m->>'version')||'|'||(m->>'generation')||'|'||(m->>'root')||'|'||(m->>'originalHash')||'|'
      ||(u#>>'{proof,generation}')||'|'||((u#>>'{proof,count}')::bigint)::text||'|'||(u#>>'{proof,head}')||'|'||(u#>>'{proof,originalHash}')||'|'
      ||graph_count::text||'|'||graph_digest||'|'||(case when graph_reused then '1'else '0'end),'UTF8')),'hex');
    result:=result||jsonb_build_object('graphReuse',jsonb_build_object('version','verified-graph-reuse-v1',
      'nonce',$1->>'readNonce','reused',graph_reused,'actualPayloadsChecked',graph_reused,
      'nodeCount',graph_count,'nodeDigest',graph_digest,'binding',graph_binding));
  end if;
  return result;
end;$f$;
drop function public.helmut_auth_state_graph_checked_local_v1(text,text,text,boolean);
drop function public.helmut_auth_usage_checked_proof_local_v1(text);
commit;
