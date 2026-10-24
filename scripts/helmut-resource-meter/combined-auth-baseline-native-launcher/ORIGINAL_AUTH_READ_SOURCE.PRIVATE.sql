-- INERT LOCAL-ONLY bounded-native-read-v1 candidate. No Production migration.
-- Apply ONLY to a fresh explicitly owned diagnostic/resource clone AFTER the
-- unchanged auth_usage_atomic_local.sql and auth_state_parts_local.sql.
-- Same caller snapshot, privileges, fresh checks and wire protocol. Writers,
-- costs, original data, history records and timing/RAM limits are unchanged.
begin;
create function public.helmut_auth_usage_checked_proof_local_v1(s text) returns jsonb
-- STABLE + SECURITY INVOKER preserve the caller's SAME snapshot and RLS.
-- This returns metadata only AFTER checking every persisted chain/payload.
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare a jsonb;m jsonb;seed text;n bigint;lo bigint;hi bigint;valid boolean;head text;
  actual_count bigint;actual_hashes boolean;
begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on'
    or current_setting('server_encoding')<>'UTF8' or current_setting('client_encoding')<>'UTF8' then
    raise exception 'atomic-usage-local-only';end if;
  if s is null or length(s) not between 1 and 256 then raise exception 'atomic-usage-read-input';end if;
  select data into strict a from public.helmut_store where id=s;
  m:=a->'_llmUsageRef';
  if m->>'version' is distinct from 'relational-atomic-v1' or a ? 'llmUsage' then
    raise exception 'atomic-usage-read-binding';end if;
  seed:=encode(sha256(convert_to(s||'|'||(m->>'generation')||'|'||(m->>'originalHash'),'UTF8')),'hex');
  with chain as(select usage_ordinal,usage_prev_hash,usage_record_hash,usage_chain_hash,
    lead(usage_chain_hash,1,seed)over(order by usage_ordinal desc)as expected_prev
    from public.llm_usage where usage_store_id=s and usage_generation=m->>'generation')
  select count(*),min(usage_ordinal),max(usage_ordinal),
    bool_and(usage_prev_hash=expected_prev and usage_chain_hash=encode(sha256((usage_prev_hash||usage_record_hash)::bytea),'hex'))
    into n,lo,hi,valid from chain;
  select usage_chain_hash into head from public.llm_usage where usage_store_id=s
    and usage_generation=m->>'generation' order by usage_ordinal desc limit 1;
  if n is distinct from (m->>'count')::bigint or (n>0 and(lo<>1 or hi<>n or not coalesce(valid,false)))
    or coalesce(head,seed)is distinct from m->>'head' then raise exception 'atomic-usage-native-history-corrupt';end if;
  select count(*),coalesce(bool_and(t.usage_record is not null and jsonb_typeof(t.usage_record)='object'
      and t.usage_record_hash is not null and t.usage_prev_hash is not null and t.usage_chain_hash is not null
      and t.usage_ordinal is not null and t.usage_ordinal between 1 and (m->>'count')::bigint
      and encode(sha256(substring(jsonb_send(t.usage_record)from 2)),'hex')=t.usage_record_hash),true)
    into actual_count,actual_hashes from public.llm_usage t
    where t.usage_store_id=s and t.usage_generation=m->>'generation';
  if actual_count<>(m->>'count')::bigint or not actual_hashes then
    raise exception 'auth-history-actual-content-mismatch';end if;
  return jsonb_build_object('proof',m-'version','revision',a->'_authStoreRevision');
end;$f$;

create function public.helmut_auth_state_graph_checked_local_v1(s text,g text,h text,omit_payloads boolean default false) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare node_row record; reachable text[]; hashes text[]; lookup jsonb; kinds text[]; sizes bigint[];
  native_sizes bigint[]; native_projected bigint; native_work bigint:=0;
  depths integer[]; graph_depths integer[]; n integer; found_n integer; payload_bytes bigint; i integer; j integer;
  b jsonb; tag text; child text; ch text[]; indexes integer[]; output_text text; output_value jsonb;
  projected bigint; work bigint:=0; depth_now integer; graph_now integer;
  components integer; actual_payloads boolean;
begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on'
    or current_setting('server_encoding')<>'UTF8' or current_setting('client_encoding')<>'UTF8' then raise exception 'auth-state-local-only';end if;
  if s is null or g is null or h is null or h!~'^[a-f0-9]{64}$' or omit_payloads is null then raise exception 'auth-state-expand-input';end if;
  -- Pull only 20001 unique hashes BEFORE loading/sorting/aggregating node bodies.
  with recursive reach(hash) as(
    select h union
    select unnest(t.children) from reach r join public.helmut_auth_state_nodes_local t
      on t.store_id=s and t.generation=g and t.node_hash=r.hash
  ), bounded as materialized(select hash from reach limit 20001)
  select array_agg(hash),count(*) into reachable,n from bounded;
  if n>20000 or n<1 then raise exception 'auth-state-node-limit';end if;
  select count(*),coalesce(sum(octet_length(payload)),0) into found_n,payload_bytes
    from public.helmut_auth_state_nodes_local where store_id=s and generation=g and node_hash=any(reachable);
  if found_n<>n then raise exception 'auth-state-node-missing';end if;
  if payload_bytes>33554432 then raise exception 'auth-state-payload-limit';end if;
  if omit_payloads then
    -- Bound all byte/hash work BEFORE hashing. These are the same actual rows
    -- in this stable statement snapshot, never client-supplied hash claims.
    select coalesce(bool_and(coalesce(encode(sha256(convert_to(payload,'UTF8')),'hex')=node_hash,false)),true)
      into actual_payloads from public.helmut_auth_state_nodes_local
      where store_id=s and generation=g and node_hash=any(reachable);
    if not actual_payloads then raise exception 'auth-state-actual-payload-hash';end if;
  end if;
  select array_agg(node_hash order by node_seq) into hashes
    from public.helmut_auth_state_nodes_local where store_id=s and generation=g and node_hash=any(reachable);
  select jsonb_object_agg(hash,ord) into lookup from unnest(hashes) with ordinality as x(hash,ord);
  kinds:=array_fill(null::text,array[n]);sizes:=array_fill(0::bigint,array[n]);
  native_sizes:=array_fill(0::bigint,array[n]);
  depths:=array_fill(0,array[n]);graph_depths:=array_fill(0,array[n]);
  i:=0;
  -- Stream one node body at a time; retain only bounded hashes and numeric
  -- metadata. No full body/ref/leaf-info arrays survive across iterations.
  for node_row in select node_hash,body,children,leaf_info from public.helmut_auth_state_nodes_local
      where store_id=s and generation=g and node_hash=any(reachable) order by node_seq loop
    i:=i+1;
    if i>n or node_row.node_hash is distinct from hashes[i] then raise exception 'auth-state-node-missing';end if;
    b:=node_row.body;tag:=b->>0;indexes:='{}';graph_now:=1;depth_now:=0;
    ch:=node_row.children;
    foreach child in array ch loop
      j:=(lookup->>child)::integer;
      if j is null or j>=i or kinds[j] is null then raise exception 'auth-state-node-postorder';end if;
      indexes:=array_append(indexes,j);graph_now:=greatest(graph_now,graph_depths[j]+1);
    end loop;
    if graph_now>64 then raise exception 'auth-state-depth-limit';end if;
    if tag='v' then
      kinds[i]:=jsonb_typeof(b->1);
      -- Generated from these exact bytes at INSERT and immutable thereafter.
      -- Depth/size decisions cannot be supplied or overridden by the client.
      if node_row.leaf_info is null then raise exception 'auth-state-leaf-info-missing';end if;
      projected:=(node_row.leaf_info->>'textBytes')::bigint;depth_now:=(node_row.leaf_info->>'depth')::integer;
    elsif tag in ('o','a') then
      kinds[i]:=case when tag='o' then 'object' else 'array' end;
      projected:=2;depth_now:=1;
      if cardinality(indexes)>0 then
        for j in 1..cardinality(indexes) loop
          projected:=projected+sizes[indexes[j]]+case when j>1 then 2 else 0 end;
          if tag='o' then projected:=projected+octet_length((b->1->(j-1)->0)::text)+2;end if;
          depth_now:=greatest(depth_now,depths[indexes[j]]+1);
        end loop;
      end if;
    else
      kinds[i]:=case when tag='m' then 'object' else 'array' end;
      projected:=2;components:=0;depth_now:=1;
      foreach j in array indexes loop
        if kinds[j] is distinct from (case when tag='m' then 'object' else 'array' end) then
          raise exception 'auth-state-child-type';end if;
        projected:=projected+sizes[j]-2;depth_now:=greatest(depth_now,depths[j]);
        if sizes[j]>2 then components:=components+1;end if;
      end loop;
      projected:=projected+greatest(0,components-1)*2;
    end if;
    -- JSON text length alone understates numeric/JEntry/container allocation.
    -- Bound a conservative native representation before building any parent.
    if tag='v' then native_projected:=(node_row.leaf_info->>'nativeBytes')::bigint;
    else
      native_projected:=16;
      if cardinality(indexes)>0 then for j in 1..cardinality(indexes) loop
        native_projected:=native_projected+native_sizes[indexes[j]]+16;
        if tag='o' then native_projected:=native_projected+octet_length(b->1->(j-1)->>0);end if;
      end loop;end if;
    end if;
    if projected>268435456 or work+projected>268435456 or depth_now>64
      or native_projected>268435456 or native_work+native_projected>268435456 then
      raise exception 'auth-state-expansion-limit';end if;
    work:=work+projected;native_work:=native_work+native_projected;native_sizes[i]:=native_projected;
    sizes[i]:=projected;depths[i]:=depth_now;graph_depths[i]:=graph_now;
  end loop;
  if i<>n then raise exception 'auth-state-node-missing';end if;
  -- Payload omission still requires fresh actual SHA checks and the same full
  -- reachability, order, child-type, depth, text and native-work bounds above.
  if omit_payloads then
    return jsonb_build_object('root',h,'nodeCount',n,'nodeDigest',
      encode(sha256(convert_to(array_to_string(hashes,'|'),'UTF8')),'hex'));
  end if;
  return (select jsonb_build_object('root',h,'nodes',jsonb_agg(
    jsonb_build_object('hash',node_hash,'payload',payload) order by node_seq))
    from public.helmut_auth_state_nodes_local
    where store_id=s and generation=g and node_hash=any(reachable));
end;$f$;

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
  graph:=public.helmut_auth_state_graph_checked_local_v1(s,m->>'generation',m->>'root',graph_reused);
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
  -- Validate every actual record first, without aggregating a complete JSON
  -- history. Only a genuinely changed/cold proof materializes the legacy data.
  u:=public.helmut_auth_usage_checked_proof_local_v1(s);
  if u->'proof' is distinct from (a->'_llmUsageRef')-'version'
    or u->>'revision' is distinct from a->>'_authStoreRevision' then
    raise exception 'auth-state-usage-snapshot-mismatch';end if;
  reused:=conditional and known is not null and known=u->'proof';
  if not reused then
    u:=public.helmut_auth_usage_read_v1(jsonb_build_object('id',s));
    if u->'proof' is distinct from (a->'_llmUsageRef')-'version'
      or u#>>'{data,_authStoreRevision}' is distinct from a->>'_authStoreRevision' then
      raise exception 'auth-state-usage-snapshot-mismatch';end if;
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
revoke all on function public.helmut_auth_usage_checked_proof_local_v1(text) from public;
revoke all on function public.helmut_auth_state_graph_checked_local_v1(text,text,text,boolean) from public;
grant execute on function public.helmut_auth_usage_checked_proof_local_v1(text) to service_role;
grant execute on function public.helmut_auth_state_graph_checked_local_v1(text,text,text,boolean) to service_role;
commit;
