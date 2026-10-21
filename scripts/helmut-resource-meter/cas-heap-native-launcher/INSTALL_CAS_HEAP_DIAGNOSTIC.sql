-- INERT CAS heap diagnostic overlay ONLY; two function bodies, no schema/data/privilege changes.
-- Guard exact fresh admitted clone and CURRENT NEW catalog before diagnostic CREATE OR REPLACE.
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
    AND current_setting('log_error_verbosity')='terse'
    AND current_setting('log_min_error_statement')='fatal'
    AND has_table_privilege('service_role','pg_catalog.pg_backend_memory_contexts','SELECT')
    AND has_function_privilege('service_role','pg_catalog.pg_get_backend_memory_contexts()','EXECUTE')
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
      p.provolatile::text=expected.volatility AND NOT p.prosecdef
      AND p.proconfig=ARRAY['search_path=pg_catalog']
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=expected.sha,false))
      FROM (VALUES
        ('public.helmut_auth_state_graph_checked_local_v1(text,text,text,boolean)'::regprocedure,
          '400db1de85d39b4141444250a356984bfafe068014b6ccfd8949f74a071bd9ec','s'),
        ('public.helmut_auth_state_graph_read_v1(jsonb)'::regprocedure,
          '4e2b9015790312d0b05e781ba6ef9a62cb13462167c47b6c9a998f27cdfb9ae0','s'),
        ('public.helmut_auth_usage_checked_proof_local_v1(text)'::regprocedure,
          '53400d66f398dcc30c44ea2ee4e48cfc52c6d065637dda886734e45887c6b936','s'),
        ('public.helmut_auth_state_expand_local_v1(text,text,text,boolean,boolean)'::regprocedure,
          'd02ac4844aaa10dd41c601a1e568398adf375f18810c6301bdab6040d11a1e32','s'),
        ('public.helmut_auth_state_cas_v1(jsonb)'::regprocedure,
          '8a13952bee9f305074d6ad9f2c2ee27e129a7e20ce3babb1d8f3a971719fcf6c','v')
      ) expected(oid,sha,volatility) LEFT JOIN pg_proc p ON p.oid=expected.oid)
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
  heap_context_text text;heap_context jsonb;heap_enabled boolean:=false;heap_log text;
  heap_count bigint;heap_total bigint;heap_used bigint;heap_free bigint;
  -- Only bounded traversal state and current-token/64KiB chunk buffers.
  renderer_stack_node integer[]:=array_fill(0,array[64]);
  renderer_stack_next integer[]:=array_fill(0,array[64]);
  renderer_stack_phase integer[]:=array_fill(0,array[64]);
  renderer_stack_flatten boolean[]:=array_fill(false,array[64]);
  renderer_stack_emitted boolean[]:=array_fill(false,array[64]);
  renderer_top integer; renderer_root integer; renderer_idx integer; renderer_child integer;
  renderer_slot integer; renderer_tag text; renderer_token text; renderer_fragment text;
  renderer_token_bytes bytea; renderer_bytepos integer; renderer_token_length integer; renderer_take integer;
  renderer_buffer text[]:='{}'; renderer_buffer_bytes integer:=0;
  renderer_chunks text[]:='{}';
begin
  -- Only the transaction-local context written by this diagnostic CAS enables snapshots.
  heap_context_text:=current_setting('helmut.local_cas_heap_context',true);
  if heap_context_text is not null and heap_context_text<>'' then
    if octet_length(heap_context_text)>3072 then raise exception 'cas-heap-context-limit';end if;
    heap_context:=heap_context_text::jsonb;heap_context_text:=null;
    if jsonb_typeof(heap_context) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(heap_context))<>14
      or not(heap_context ?& ARRAY['schema','backendPID','xid','expectedRevision','newRevision',
        'currentUser','sessionUser','rawProjection','rawDiagnosticScope','logErrorVerbosity','logMinErrorStatement','store','generation','root'])
      or heap_context->>'schema' is distinct from 'helmut-cas-heap-context/1'
      or heap_context->'backendPID' is distinct from to_jsonb(pg_backend_pid())
      or pg_current_xact_id_if_assigned() is null
      or jsonb_typeof(heap_context->'xid') is distinct from 'string'
      or jsonb_typeof(heap_context->'expectedRevision') is distinct from 'string'
      or jsonb_typeof(heap_context->'newRevision') is distinct from 'string'
      or jsonb_typeof(heap_context->'currentUser') is distinct from 'string'
      or jsonb_typeof(heap_context->'sessionUser') is distinct from 'string'
      or jsonb_typeof(heap_context->'store') is distinct from 'string'
      or jsonb_typeof(heap_context->'generation') is distinct from 'string'
      or jsonb_typeof(heap_context->'root') is distinct from 'string'
      or jsonb_typeof(heap_context->'rawProjection') not in ('null','string')
      or jsonb_typeof(heap_context->'rawDiagnosticScope') not in ('null','string')
      or current_setting('log_error_verbosity') is distinct from 'terse'
      or current_setting('log_min_error_statement') is distinct from 'fatal'
      or heap_context->>'logErrorVerbosity' is distinct from current_setting('log_error_verbosity')
      or heap_context->>'logMinErrorStatement' is distinct from current_setting('log_min_error_statement')
      or heap_context->>'xid' is distinct from pg_current_xact_id_if_assigned()::text
      or heap_context->>'xid'!~'^[1-9][0-9]{0,19}$'
      or heap_context->>'expectedRevision'!~'^[a-f0-9-]{36}$'
      or heap_context->>'newRevision'!~'^[a-f0-9-]{36}$'
      or heap_context->>'expectedRevision'=heap_context->>'newRevision'
      or heap_context->>'currentUser' is distinct from current_user
      or heap_context->>'sessionUser' is distinct from session_user
      or heap_context->>'rawProjection' is distinct from current_setting('helmut.local_auth_state_cas_projection',true)
      or heap_context->>'rawDiagnosticScope' is distinct from current_setting('helmut.local_diagnostic_scope',true)
      or current_setting('helmut.local_auth_state_cas_projection',true)='on'
      or heap_context->>'store' is distinct from s or heap_context->>'generation' is distinct from g
      or heap_context->>'root' is distinct from h or as_graph is distinct from false
      or omit_payloads is distinct from false then raise exception 'cas-heap-context-binding';end if;
    heap_enabled:=true;
  end if;
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
  -- All original graph/type/depth/text/native/cumulative-work checks above
  -- have completed. Traverse logical OCCURRENCES with a depth-64 stack;
  -- shared nodes are intentionally rendered again at every required position.
  -- A child's flatten flag belongs to its incoming edge: only m/l parents
  -- flatten their nonempty children. Leaves use PostgreSQL-normalized text.
  renderer_root:=(lookup->>h)::integer;
  renderer_top:=1;renderer_stack_node[1]:=renderer_root;
  while renderer_top>0 loop
    renderer_idx:=renderer_stack_node[renderer_top];
    renderer_tag:=bodies[renderer_idx]->>0;renderer_token:='';
    if renderer_stack_phase[renderer_top]=0 then
      if renderer_tag='v' then
        renderer_token:=(bodies[renderer_idx]->1)::text;
        if renderer_stack_flatten[renderer_top] then
          renderer_token:=substr(renderer_token,2,char_length(renderer_token)-2);
        end if;
        renderer_top:=renderer_top-1;
      else
        if not renderer_stack_flatten[renderer_top] then
          renderer_token:=case when kinds[renderer_idx]='object' then '{' else '[' end;
        end if;
        renderer_stack_phase[renderer_top]:=1;
        renderer_stack_next[renderer_top]:=0;renderer_stack_emitted[renderer_top]:=false;
      end if;
    else
      renderer_child:=null;
      while renderer_stack_next[renderer_top]<jsonb_array_length(refs[renderer_idx]) loop
        renderer_slot:=renderer_stack_next[renderer_top]+1;
        renderer_stack_next[renderer_top]:=renderer_slot;
        renderer_child:=(lookup->>(refs[renderer_idx]->>(renderer_slot-1)))::integer;
        if renderer_child is null then raise exception 'auth-state-node-postorder';end if;
        if renderer_tag not in ('m','l') or sizes[renderer_child]>2 then exit;end if;
        renderer_child:=null;
      end loop;
      if renderer_child is null then
        if not renderer_stack_flatten[renderer_top] then
          renderer_token:=case when kinds[renderer_idx]='object' then '}' else ']' end;
        end if;
        renderer_top:=renderer_top-1;
      else
        -- Leading separators produce exactly the old sorted-token text. An
        -- o/a parent counts empty values; only m/l skipped empty fragments.
        if renderer_stack_emitted[renderer_top] then renderer_token:=',';end if;
        renderer_stack_emitted[renderer_top]:=true;
        if renderer_tag='o' then
          renderer_token:=renderer_token||(bodies[renderer_idx]->1->(renderer_slot-1)->0)::text||':';
        end if;
        if renderer_top>=64 then raise exception 'auth-state-depth-limit';end if;
        renderer_top:=renderer_top+1;renderer_stack_node[renderer_top]:=renderer_child;
        renderer_stack_phase[renderer_top]:=0;
        renderer_stack_flatten[renderer_top]:=renderer_tag in ('m','l');
      end if;
    end if;
    if renderer_token='' then continue;end if;
    -- Current-token bytea permits O(slice length) cuts even for a 4MiB scalar.
    -- Positions are 1-based for substring; get_byte takes the 0-based FIRST
    -- EXCLUDED byte. Move left at most three continuation bytes, retaining
    -- complete codepoints without rescanning a growing text prefix.
    renderer_token_bytes:=convert_to(renderer_token,'UTF8');
    renderer_token:=null;renderer_bytepos:=1;
    renderer_token_length:=octet_length(renderer_token_bytes);
    while renderer_bytepos<=renderer_token_length loop
      if renderer_buffer_bytes=65536 then
        renderer_chunks:=array_append(renderer_chunks,array_to_string(renderer_buffer,''));
        renderer_buffer:='{}';renderer_buffer_bytes:=0;
      end if;
      renderer_take:=least(renderer_token_length-renderer_bytepos+1,65536-renderer_buffer_bytes);
      if renderer_bytepos+renderer_take<=renderer_token_length then
        while get_byte(renderer_token_bytes,renderer_bytepos+renderer_take-1) between 128 and 191 loop
          renderer_take:=renderer_take-1;
        end loop;
      end if;
      if renderer_take=0 then
        -- The <=3 free bytes cannot fit the next UTF8 codepoint. A fresh
        -- 64KiB buffer always can, so this branch must consume a nonempty one.
        if renderer_buffer_bytes=0 then raise exception 'auth-state-renderer-utf8-boundary';end if;
        renderer_chunks:=array_append(renderer_chunks,array_to_string(renderer_buffer,''));
        renderer_buffer:='{}';renderer_buffer_bytes:=0;
        continue;
      end if;
      renderer_fragment:=convert_from(substring(renderer_token_bytes from renderer_bytepos for renderer_take),'UTF8');
      -- Buffer logical bytes never exceed 64KiB. Fragment arrays avoid copying
      -- a growing 64KiB string for every one-byte punctuation token.
      renderer_buffer:=array_append(renderer_buffer,renderer_fragment);
      renderer_buffer_bytes:=renderer_buffer_bytes+renderer_take;
      renderer_bytepos:=renderer_bytepos+renderer_take;
      renderer_fragment:=null;
    end loop;
    renderer_token_bytes:=null;
  end loop;
  if renderer_buffer_bytes>0 then
    renderer_chunks:=array_append(renderer_chunks,array_to_string(renderer_buffer,''));
  end if;
  renderer_buffer:=null;renderer_token:=null;renderer_token_bytes:=null;renderer_fragment:=null;
  if heap_enabled then
    if heap_context->>'xid' is distinct from pg_current_xact_id_if_assigned()::text
      or heap_context->>'rawProjection' is distinct from current_setting('helmut.local_auth_state_cas_projection',true)
      or heap_context->>'rawDiagnosticScope' is distinct from current_setting('helmut.local_diagnostic_scope',true) then
      raise exception 'cas-heap-live-binding-drift';end if;
    -- The SRF internally traverses/materializes all contexts. This output count guard
    -- is NOT a bound on its own allocation; existing statement/native limits apply.
    select count(*),sum(total_bytes),sum(used_bytes),sum(free_bytes)
      into heap_count,heap_total,heap_used,heap_free from pg_catalog.pg_backend_memory_contexts;
    if heap_count is null or heap_count<1 or heap_count>4096 or heap_total is null
      or heap_used is null or heap_free is null or heap_total<0 or heap_used<0 or heap_free<0
      or heap_total<>heap_used+heap_free then raise exception 'cas-heap-context-counters';end if;
    heap_log:=((heap_context-ARRAY['store','generation','root'])||
      jsonb_build_object('schema','helmut-cas-heap-log/1','kind','heap','point','beforeOutputText',
        'contextCount',heap_count,'totalBytes',heap_total,'usedBytes',heap_used,'freeBytes',heap_free,
        'outputTextBytes',null::bigint,'outputValueBytes',null::bigint))::text;
    if octet_length(heap_log)>2048 then raise exception 'cas-heap-log-limit';end if;
    raise log 'HELMUT_CAS_HEAP_V1 %',heap_log;
    heap_log:=null;
  end if;
  output_text:=array_to_string(renderer_chunks,'');
  renderer_chunks:=null;
  if output_text is null or not(output_text IS JSON WITH UNIQUE KEYS) then raise exception 'auth-state-duplicate-key-or-invalid-json';end if;
  if octet_length(output_text)>sizes[(lookup->>h)::integer] then raise exception 'auth-state-actual-text-limit';end if;
  output_value:=output_text::jsonb;
  if heap_enabled then
    if heap_context->>'xid' is distinct from pg_current_xact_id_if_assigned()::text
      or heap_context->>'rawProjection' is distinct from current_setting('helmut.local_auth_state_cas_projection',true)
      or heap_context->>'rawDiagnosticScope' is distinct from current_setting('helmut.local_diagnostic_scope',true) then
      raise exception 'cas-heap-live-binding-drift';end if;
    -- The SRF internally traverses/materializes all contexts. This output count guard
    -- is NOT a bound on its own allocation; existing statement/native limits apply.
    select count(*),sum(total_bytes),sum(used_bytes),sum(free_bytes)
      into heap_count,heap_total,heap_used,heap_free from pg_catalog.pg_backend_memory_contexts;
    if heap_count is null or heap_count<1 or heap_count>4096 or heap_total is null
      or heap_used is null or heap_free is null or heap_total<0 or heap_used<0 or heap_free<0
      or heap_total<>heap_used+heap_free then raise exception 'cas-heap-context-counters';end if;
    heap_log:=((heap_context-ARRAY['store','generation','root'])||
      jsonb_build_object('schema','helmut-cas-heap-log/1','kind','heap','point','afterOutputValue',
        'contextCount',heap_count,'totalBytes',heap_total,'usedBytes',heap_used,'freeBytes',heap_free,
        'outputTextBytes',octet_length(output_text),'outputValueBytes',pg_column_size(output_value)))::text;
    if octet_length(heap_log)>2048 then raise exception 'cas-heap-log-limit';end if;
    raise log 'HELMUT_CAS_HEAP_V1 %',heap_log;
    heap_log:=null;
  end if;
  if pg_column_size(output_value)>native_sizes[(lookup->>h)::integer] then raise exception 'auth-state-actual-native-limit';end if;
  return output_value;
end;$f$;

create or replace function public.helmut_auth_state_cas_v1(jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog as $f$
declare a jsonb;d jsonb;m jsonb;u jsonb;r jsonb;s text;h text;n bigint;
  heap_projection text;heap_scope text;heap_xid text;heap_context jsonb;heap_log text;
begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on'
    or current_setting('server_encoding')<>'UTF8' or current_setting('client_encoding')<>'UTF8' then raise exception 'auth-state-local-only';end if;
  if jsonb_typeof($1) is distinct from 'object' or (select count(*)from jsonb_object_keys($1))<>8
    or not($1 ?& array['id','expectedRevision','expectedProof','expectedState','revision','root','nodes','additions'])
    or jsonb_typeof($1->'id') is distinct from 'string' or length($1->>'id') not between 1 and 256
    or jsonb_typeof($1->'expectedRevision') is distinct from 'string' or $1->>'expectedRevision' !~ '^[a-f0-9-]{36}$'
    or jsonb_typeof($1->'revision') is distinct from 'string' or $1->>'revision' !~ '^[a-f0-9-]{36}$'
    or $1->>'revision'=$1->>'expectedRevision' or jsonb_typeof($1->'expectedProof') is distinct from 'object'
    or jsonb_typeof($1->'expectedState') is distinct from 'object' or jsonb_typeof($1->'root') is distinct from 'string'
    or $1->>'root' !~ '^[a-f0-9]{64}$' or jsonb_typeof($1->'nodes') is distinct from 'array'
    or jsonb_typeof($1->'additions') is distinct from 'array' or jsonb_array_length($1->'additions')>1000 then
    raise exception 'auth-state-write-input';end if;
  s:=$1->>'id';select data into a from public.helmut_store where id=s for update;
  if not found then return '[]'::jsonb;end if;
  m:=public.helmut_auth_state_assert_root_local_v1(a);u:=a->'_llmUsageRef';
  if a->>'_authStoreRevision' is distinct from $1->>'expectedRevision' or m is distinct from $1->'expectedState'
    or (u-'version')is distinct from $1->'expectedProof' then return '[]'::jsonb;end if;
  -- Diagnostic-only guard; never force OFF or enter the unsafe projection branch.
  if current_setting('log_error_verbosity') is distinct from 'terse'
    or current_setting('log_min_error_statement') is distinct from 'fatal' then
    raise exception 'cas-heap-terse-log-required';end if;
  heap_projection:=current_setting('helmut.local_auth_state_cas_projection',true);
  heap_scope:=current_setting('helmut.local_diagnostic_scope',true);
  if heap_projection='on' then raise exception 'cas-heap-projection-on-forbidden';end if;
  if (heap_projection is not null and octet_length(heap_projection)>128)
    or (heap_scope is not null and octet_length(heap_scope)>128)
    or octet_length(current_user)>63 or octet_length(session_user)>63 then
    raise exception 'cas-heap-session-scalar-limit';end if;
  if coalesce(current_setting('helmut.local_cas_heap_context',true),'')<>'' then
    raise exception 'cas-heap-preexisting-context';end if;
  if not has_table_privilege(current_user,'pg_catalog.pg_backend_memory_contexts','SELECT')
    or not has_function_privilege(current_user,'pg_catalog.pg_get_backend_memory_contexts()','EXECUTE') then
    raise exception 'cas-heap-existing-invoker-privilege-required';end if;
  perform set_config('helmut.atomic_state_seal',jsonb_build_object('id',s,'gen',m->>'generation','action','write')::text,true);
  perform public.helmut_auth_state_put_nodes_local_v1(s,m->>'generation',$1->'nodes');
  heap_xid:=pg_current_xact_id_if_assigned()::text;
  if heap_xid is null or heap_xid!~'^[1-9][0-9]{0,19}$' then
    raise exception 'cas-heap-assigned-xid-required';end if;
  heap_context:=jsonb_build_object('schema','helmut-cas-heap-context/1',
    'backendPID',pg_backend_pid(),'xid',heap_xid,
    'expectedRevision',$1->>'expectedRevision','newRevision',$1->>'revision',
    'currentUser',current_user,'sessionUser',session_user,
    'rawProjection',heap_projection,'rawDiagnosticScope',heap_scope,
    'logErrorVerbosity',current_setting('log_error_verbosity'),
    'logMinErrorStatement',current_setting('log_min_error_statement'),
    'store',s,'generation',m->>'generation','root',$1->>'root');
  if octet_length(heap_context::text)>3072 then raise exception 'cas-heap-context-limit';end if;
  perform set_config('helmut.local_cas_heap_context',heap_context::text,true);
  heap_log:=((heap_context-ARRAY['store','generation','root'])||
    jsonb_build_object('schema','helmut-cas-heap-log/1','kind','cas','point','session'))::text;
  if octet_length(heap_log)>2048 then raise exception 'cas-heap-log-limit';end if;
  raise log 'HELMUT_CAS_HEAP_V1 %',heap_log;
  heap_log:=null;
  if current_setting('helmut.local_auth_state_cas_projection',true) is distinct from heap_projection
    or current_setting('helmut.local_diagnostic_scope',true) is distinct from heap_scope then
    raise exception 'cas-heap-session-setting-drift';end if;
  if current_setting('helmut.local_auth_state_cas_projection',true)='on' then
    perform public.helmut_auth_state_assert_graph_local_v1(s,m->>'generation',$1->>'root');
  else
    select public.helmut_auth_state_expand_local_v1(s,m->>'generation',$1->>'root') into d;
    perform public.helmut_auth_state_assert_data_local_v1(d);
  end if;
  perform set_config('helmut.local_cas_heap_context','',true);
  heap_context:=null;
  n:=(u->>'count')::bigint;h:=u->>'head';
  perform set_config('helmut.atomic_usage_seal',jsonb_build_object('id',s,'gen',u->>'generation','action','write')::text,true);
  for r in select value from jsonb_array_elements($1->'additions')with ordinality e(value,ord)order by ord desc loop
    n:=n+1;h:=public.helmut_auth_usage_insert_local_v1(s,u->>'generation',n,h,r);
  end loop;
  u:=u||jsonb_build_object('count',n,'head',h);m:=m||jsonb_build_object('root',$1->>'root');
  update public.helmut_store set data=jsonb_build_object('_authStoreRevision',$1->>'revision','_llmUsageRef',u,'_authStateRef',m)where id=s;
  perform set_config('helmut.atomic_usage_seal','',true);perform set_config('helmut.atomic_state_seal','',true);
  return jsonb_build_array(jsonb_build_object('id',s,'revision',$1->>'revision','proof',u-'version','state',m));
end;$f$;
COMMIT;
