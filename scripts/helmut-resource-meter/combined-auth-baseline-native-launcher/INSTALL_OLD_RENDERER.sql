-- INERT combined Auth OLD renderer install only; exact frozen prosrc.
-- Six statements, clone/adoption/version/settings/original catalog guards; no data writes.
\set ON_ERROR_STOP on
\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off
\if :{?root_clone_receipt_sha256}
\else
  \set root_clone_receipt_sha256 MISSING_NEW_CLONE_ADMISSION
\endif

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '1s';
SELECT jsonb_build_object('kind','bound-original-state',
  'qualified',1 / coalesce((
    :'root_clone_receipt_sha256' ~ '^[a-f0-9]{64}$'
    AND inet_server_addr() IS NULL AND inet_client_addr() IS NULL
    AND current_user='postgres' AND current_setting('data_directory')='/disk/pgdata'
    AND current_database()='helmut_resource_fixture_20261020_3b3bf56650bc'
    AND (SELECT oid FROM pg_database WHERE datname=current_database())=18405
    AND current_setting('transaction_read_only')='off'
    AND current_setting('server_version_num')='170006'
    AND current_setting('server_encoding')='UTF8'
    AND current_setting('client_encoding')='UTF8'
    AND current_setting('helmut.local_usage_experiment',true)='on'
    AND current_setting('work_mem')='4MB'
    AND current_setting('temp_file_limit')='128MB'
    AND current_setting('shared_buffers')='128MB'
    AND current_setting('max_parallel_workers_per_gather')='0'
    AND current_setting('jit')='on' AND pg_jit_available()
    AND current_setting('fsync')='on'
    AND current_setting('full_page_writes')='on'
    AND current_setting('synchronous_commit')='on'
    AND current_setting('autovacuum')='off'
    AND (SELECT count(*) FROM public.helmut_store WHERE id='main-auth')=1
    AND (SELECT octet_length(data::text)=606
      AND encode(sha256(convert_to(data::text,'UTF8')),'hex')=
        '9b62ab352733025f1b752e637f6360d7813b10ea86f134168698e8f4f0d11bc9'
      AND data->>'_authStoreRevision'='603ee863-ecaf-43be-8b3a-8d6c5ca76d0d'
      AND data#>>'{_authStateRef,root}'=
        '24bea8f26ed99b234b4d0c557ce8f80cbba205bc093797daff329b398b851633'
      AND data#>>'{_authStateRef,generation}'='6593701f-3f25-4e43-9e17-e9eda4306554'
      AND data#>>'{_authStateRef,originalHash}'=
        '840b1c9cfbf91e7c90de3ee8b866e77c6829d9f67a049fd310c8351fa285ed85'
      AND data#>>'{_llmUsageRef,generation}'='e46b536a-9768-420e-a468-85a20805e2fa'
      AND data#>>'{_llmUsageRef,count}'='6000'
      AND data#>>'{_llmUsageRef,head}'=
        '6221c7e746c196e01d36fdb13d86bec88cce3709e150ed86c687971afd9795fa'
      AND data#>>'{_llmUsageRef,originalHash}'=
        '77a65c6ffe5d36777e3dd41c178e10cdc669fa03f931297b45b2eb5063a23aae'
      FROM public.helmut_store WHERE id='main-auth')
    AND (SELECT bool_and(coalesce(
      p.provolatile='s' AND NOT p.prosecdef
      AND p.proconfig=ARRAY['search_path=pg_catalog']
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=expected.sha,false))
      FROM (VALUES
        ('public.helmut_auth_state_graph_checked_local_v1(text,text,text,boolean)'::regprocedure,
          '400db1de85d39b4141444250a356984bfafe068014b6ccfd8949f74a071bd9ec'),
        ('public.helmut_auth_state_graph_read_v1(jsonb)'::regprocedure,
          '1644ff690fb4ae70ab2511b3ccf41353e622595bc9fed2d61005c4f655171af0'),
        ('public.helmut_auth_usage_checked_proof_local_v1(text)'::regprocedure,
          '53400d66f398dcc30c44ea2ee4e48cfc52c6d065637dda886734e45887c6b936'),
        ('public.helmut_auth_state_expand_local_v1(text,text,text,boolean,boolean)'::regprocedure,
          'b3157fffe12d3bc8f5b2c1d2443b97e44830082a3c6aca73124f60b260345a6a')
      ) expected(oid,sha) LEFT JOIN pg_proc p ON p.oid=expected.oid)
  )::int,0),
  'database',current_database(),'databaseOID',18405,'backendPID',pg_backend_pid(),
  'cloneReceiptSHA256',:'root_clone_receipt_sha256');

create or replace function public.helmut_auth_state_expand_local_v1(s text,g text,h text,as_graph boolean default false,omit_payloads boolean default false) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare reachable text[]; hashes text[]; bodies jsonb[]; refs jsonb[]; leaf_infos jsonb[]; lookup jsonb; kinds text[]; sizes bigint[];
  native_sizes bigint[]; native_projected bigint; native_work bigint:=0;
  depths integer[]; graph_depths integer[]; n integer; found_n integer; payload_bytes bigint; i integer; j integer;
  b jsonb; tag text; child text; ch text[]; indexes integer[]; output_text text; output_value jsonb;
  projected bigint; work bigint:=0; depth_now integer; graph_now integer;
  components integer; actual_payloads boolean;
begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on'
    or current_setting('server_encoding')<>'UTF8' or current_setting('client_encoding')<>'UTF8' then raise exception 'auth-state-local-only';end if;
  if s is null or g is null or h is null or h!~'^[a-f0-9]{64}$' or as_graph is null
    or omit_payloads is null or (omit_payloads and not as_graph) then raise exception 'auth-state-expand-input';end if;
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
  select array_agg(node_hash order by node_seq),array_agg(body order by node_seq),array_agg(to_jsonb(children) order by node_seq),array_agg(leaf_info order by node_seq) into hashes,bodies,refs,leaf_infos
    from public.helmut_auth_state_nodes_local where store_id=s and generation=g and node_hash=any(reachable);
  select jsonb_object_agg(hash,ord) into lookup from unnest(hashes) with ordinality as x(hash,ord);
  kinds:=array_fill(null::text,array[n]);sizes:=array_fill(0::bigint,array[n]);
  native_sizes:=array_fill(0::bigint,array[n]);
  depths:=array_fill(0,array[n]);graph_depths:=array_fill(0,array[n]);
  for i in 1..n loop
    b:=bodies[i];tag:=b->>0;indexes:='{}';graph_now:=1;depth_now:=0;
    ch:=array(select value from jsonb_array_elements_text(refs[i]) with ordinality as x(value,ord) order by ord);
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
      if leaf_infos[i] is null then raise exception 'auth-state-leaf-info-missing';end if;
      projected:=(leaf_infos[i]->>'textBytes')::bigint;depth_now:=(leaf_infos[i]->>'depth')::integer;
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
    if tag='v' then native_projected:=(leaf_infos[i]->>'nativeBytes')::bigint;
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
  -- The wire reader uses the SAME complete fresh bounds pass, but transports
  -- the actual immutable payloads instead of expanding and re-encoding them.
  -- The client verifies every payload SHA and reconstructs the logical value;
  -- no client-provided hash list or permission snapshot is trusted here.
  if as_graph then
    if omit_payloads then
      -- Hashes are fixed-width lowercase SHA256 strings in actual node_seq
      -- postorder. The separator therefore gives one unambiguous preimage.
      return jsonb_build_object('root',h,'nodeCount',n,'nodeDigest',
        encode(sha256(convert_to(array_to_string(hashes,'|'),'UTF8')),'hex'));
    end if;
    return (select jsonb_build_object('root',h,'nodes',jsonb_agg(
      jsonb_build_object('hash',node_hash,'payload',payload) order by node_seq))
      from public.helmut_auth_state_nodes_local
      where store_id=s and generation=g and node_hash=any(reachable));
  end if;
  -- Every old type/depth/text/native-work bound has passed BEFORE expanding
  -- occurrences. Shared nodes still occur at every required logical position.
  -- Assemble text with one native aggregate instead of copying large decoded
  -- JSONB parents into an ever-growing intermediate array. Leaf text is prepared
  -- once per actual immutable node. The final UNIQUE KEYS check precedes the
  -- JSONB cast, so neither flattened nor nested duplicate keys can be hidden.
  with recursive leaf_texts as materialized(
    select ord as idx,(bodies[ord]->1)::text as value_text
      from generate_subscripts(bodies,1) as a(ord) where bodies[ord]->>0='v'
  ), walk(idx,sort_path,flatten) as(
    select (lookup->>h)::integer,array[]::integer[],false
    union all
    select (lookup->>e.hash)::integer,w.sort_path||array[1,e.ord::integer,1],bodies[w.idx]->>0 in ('m','l')
      from walk w cross join lateral jsonb_array_elements_text(refs[w.idx])with ordinality as e(hash,ord)
      where bodies[w.idx]->>0<>'v' and(bodies[w.idx]->>0 not in ('m','l') or sizes[(lookup->>e.hash)::integer]>2)
  ), tokens(sort_path,token) as(
    select w.sort_path||array[0],case when bodies[w.idx]->>0='v' then
      case when w.flatten then substr(t.value_text,2,char_length(t.value_text)-2) else t.value_text end
      else case when w.flatten then '' when kinds[w.idx]='object' then '{' else '[' end end
      from walk w left join leaf_texts t on t.idx=w.idx
    union all
    select w.sort_path||array[2],case when w.flatten then '' when kinds[w.idx]='object' then '}' else ']' end
      from walk w where bodies[w.idx]->>0<>'v'
    union all
    select w.sort_path||array[1,e.ord::integer,0],(bodies[w.idx]->1->(e.ord::integer-1)->0)::text||':'
      from walk w cross join lateral jsonb_array_elements_text(refs[w.idx])with ordinality as e(hash,ord)
      where bodies[w.idx]->>0='o'
    union all
    select w.sort_path||array[1,e.ord::integer,2],','
      from walk w cross join lateral jsonb_array_elements_text(refs[w.idx])with ordinality as e(hash,ord)
      where(bodies[w.idx]->>0 in ('o','a') and e.ord<jsonb_array_length(refs[w.idx]))
      or(bodies[w.idx]->>0 in ('m','l') and sizes[(lookup->>e.hash)::integer]>2 and exists(
        select from jsonb_array_elements_text(refs[w.idx])with ordinality as later(hash,ord)
          where later.ord>e.ord and sizes[(lookup->>later.hash)::integer]>2))
  ) select string_agg(token,'' order by sort_path) into output_text from tokens;
  if output_text is null or not(output_text IS JSON WITH UNIQUE KEYS) then raise exception 'auth-state-duplicate-key-or-invalid-json';end if;
  if octet_length(output_text)>sizes[(lookup->>h)::integer] then raise exception 'auth-state-actual-text-limit';end if;
  output_value:=output_text::jsonb;
  if pg_column_size(output_value)>native_sizes[(lookup->>h)::integer] then raise exception 'auth-state-actual-native-limit';end if;
  return output_value;
end;$f$;
COMMIT;
