\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='1s';
SELECT 1/coalesce((current_database()='helmut_resource_fixture_20261020_3b3bf56650bc'
  AND (SELECT oid FROM pg_database WHERE datname=current_database())=18405
  AND current_setting('helmut.local_usage_experiment',true)='on'
  AND current_setting('data_directory')='/disk/pgdata'
  AND current_setting('hba_file')='/disk/pgdata/pg_hba.conf'
  AND current_setting('ident_file')='/disk/pgdata/pg_ident.conf'
  AND (SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')=
    '9b62ab352733025f1b752e637f6360d7813b10ea86f134168698e8f4f0d11bc9'
    FROM public.helmut_store WHERE id='main-auth')
  AND (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex')=
    'b3157fffe12d3bc8f5b2c1d2443b97e44830082a3c6aca73124f60b260345a6a'
    FROM pg_proc WHERE oid='public.helmut_auth_state_expand_local_v1(text,text,text,boolean,boolean)'::regprocedure)
  )::int,0);
create or replace function public.helmut_auth_state_expand_local_v1(s text,g text,h text,as_graph boolean default false,omit_payloads boolean default false) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare reachable text[]; hashes text[]; bodies jsonb[]; refs jsonb[]; leaf_infos jsonb[]; lookup jsonb; kinds text[]; sizes bigint[];
  native_sizes bigint[]; native_projected bigint; native_work bigint:=0;
  depths integer[]; graph_depths integer[]; n integer; found_n integer; payload_bytes bigint; i integer; j integer;
  b jsonb; tag text; child text; ch text[]; indexes integer[]; output_text text; output_value jsonb;
  projected bigint; work bigint:=0; depth_now integer; graph_now integer;
  components integer; actual_payloads boolean;
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
  output_text:=array_to_string(renderer_chunks,'');
  renderer_chunks:=null;
  if output_text is null or not(output_text IS JSON WITH UNIQUE KEYS) then raise exception 'auth-state-duplicate-key-or-invalid-json';end if;
  if octet_length(output_text)>sizes[(lookup->>h)::integer] then raise exception 'auth-state-actual-text-limit';end if;
  output_value:=output_text::jsonb;
  if pg_column_size(output_value)>native_sizes[(lookup->>h)::integer] then raise exception 'auth-state-actual-native-limit';end if;
  return output_value;
end;$f$;
COMMIT;

