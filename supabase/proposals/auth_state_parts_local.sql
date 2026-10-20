-- INERT LOCAL EXPERIMENT ONLY. Not a Production migration.
-- Apply only to a NEW isolated diagnostic target with the accepted usage proposal.
begin;
-- Inert LOCAL proposal fragment. Root RPCs own every transaction seal.
-- server_encoding is fixed for a database. The explicit UTF8 guard makes the
-- byte conversion independent of session/client settings; textsend itself is
-- marked STABLE by PostgreSQL and cannot be used in a generated expression.
create function public.helmut_auth_state_payload_hash_local_v1(p text) returns text
language plpgsql immutable strict security invoker set search_path=pg_catalog as $f$
begin
  if current_setting('server_encoding')<>'UTF8' then raise exception 'auth-state-utf8-required';end if;
  return encode(sha256(convert_to(p,'UTF8')),'hex');
end;$f$;

-- Derived only from the actual immutable payload, never from caller metadata.
-- Its flat JSONB subvalue is materialized here; pg_column_size measures that
-- value, not a compressed/toasted heap attribute. Database encoding is fixed.
create function public.helmut_auth_state_leaf_info_local_v1(p text) returns jsonb
language plpgsql immutable strict security invoker set search_path=pg_catalog as $f$
declare b jsonb; leaf_value jsonb; visits integer; depth integer;
begin
  if current_setting('server_encoding')<>'UTF8' or octet_length(p)>4194304 then
    raise exception 'auth-state-leaf-input';end if;
  b:=p::jsonb;
  if jsonb_typeof(b) is distinct from 'array' or jsonb_array_length(b)<>2 then
    raise exception 'auth-state-node-shape';end if;
  if b->>0 is distinct from 'v' then return null;end if;
  leaf_value:=b->1;
  with recursive walk(v,d) as(
    select leaf_value,0 union all
    select c.v,w.d+1 from walk w cross join lateral(
      select value as v from jsonb_array_elements(case when jsonb_typeof(w.v)='array' then w.v else '[]'::jsonb end)
      union all select value as v from jsonb_each(case when jsonb_typeof(w.v)='object' then w.v else '{}'::jsonb end)
    ) c where w.d<64
  ), bounded as materialized(select v,d from walk limit 20001)
  select count(*),max(d+case when jsonb_typeof(v) in ('object','array') then 1 else 0 end)
    into visits,depth from bounded;
  if visits>20000 or depth>64 then raise exception 'auth-state-leaf-limit';end if;
  return jsonb_build_object('depth',depth,'textBytes',octet_length(leaf_value::text),'nativeBytes',pg_column_size(leaf_value));
end;$f$;

create function public.helmut_auth_state_children_local_v1(p text) returns text[]
language plpgsql immutable security invoker set search_path=pg_catalog as $f$
declare b jsonb; tag text; item jsonb; result text[]:='{}'; seen text[]:='{}'; label text;
begin
  if p is null or octet_length(p)>4194304 then raise exception 'auth-state-node-size'; end if;
  if not (p IS JSON ARRAY WITH UNIQUE KEYS) then raise exception 'auth-state-node-json';end if;
  b:=p::jsonb;
  if jsonb_typeof(b) is distinct from 'array' or jsonb_array_length(b)<>2
    or jsonb_typeof(b->0) is distinct from 'string' then raise exception 'auth-state-node-shape';end if;
  tag:=b->>0;
  if tag='v' then
    if (jsonb_typeof(b->1)='object' and octet_length(p)>16384)
      or (jsonb_typeof(b->1)='array' and octet_length(p)>65536) then raise exception 'auth-state-leaf-size';end if;
    return result;
  end if;
  if tag not in ('o','m','a','l') or jsonb_typeof(b->1) is distinct from 'array'
    or jsonb_array_length(b->1)>(case when tag in ('o','m') then 16 else 32 end) then
    raise exception 'auth-state-node-shape';end if;
  for item in select value from jsonb_array_elements(b->1) loop
    if tag in ('o','m') then
      if jsonb_typeof(item) is distinct from 'array' or jsonb_array_length(item)<>2
        or jsonb_typeof(item->0) is distinct from 'string' or jsonb_typeof(item->1) is distinct from 'string' then
        raise exception 'auth-state-node-pair';end if;
      label:=item->>0;
      if label=any(seen) or (tag='m' and label!~'^[0-9a-f]$') then raise exception 'auth-state-node-label';end if;
      seen:=array_append(seen,label);label:=item->>1;
    else
      if jsonb_typeof(item) is distinct from 'string' then raise exception 'auth-state-node-child';end if;
      label:=item#>>'{}';
    end if;
    if label is null or label!~'^[a-f0-9]{64}$' then raise exception 'auth-state-node-child';end if;
    result:=array_append(result,label);
  end loop;
  return result;
end;$f$;

create table public.helmut_auth_state_nodes_local(
  store_id text not null check(length(store_id) between 1 and 256),
  generation text not null check(generation~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
  payload text not null check(octet_length(payload)<=4194304),
  node_hash text generated always as(public.helmut_auth_state_payload_hash_local_v1(payload)) stored,
  body jsonb generated always as(payload::jsonb) stored,
  leaf_info jsonb generated always as(public.helmut_auth_state_leaf_info_local_v1(payload)) stored,
  children text[] generated always as(public.helmut_auth_state_children_local_v1(payload)) stored,
  node_seq bigint generated always as identity,
  primary key(store_id,generation,node_hash)
);
alter table public.helmut_auth_state_nodes_local enable row level security;
revoke all on public.helmut_auth_state_nodes_local from public;
revoke all on sequence public.helmut_auth_state_nodes_local_node_seq_seq from public;
do $roles$ begin
  if exists(select from pg_roles where rolname='anon') then
    execute 'revoke all on public.helmut_auth_state_nodes_local from anon';
    execute 'revoke all on sequence public.helmut_auth_state_nodes_local_node_seq_seq from anon';end if;
  if exists(select from pg_roles where rolname='authenticated') then
    execute 'revoke all on public.helmut_auth_state_nodes_local from authenticated';
    execute 'revoke all on sequence public.helmut_auth_state_nodes_local_node_seq_seq from authenticated';end if;
end;$roles$;
grant select,insert on public.helmut_auth_state_nodes_local to service_role;
grant usage on sequence public.helmut_auth_state_nodes_local_node_seq_seq to service_role;
create policy helmut_auth_state_nodes_service_local on public.helmut_auth_state_nodes_local
  for all to service_role using(true) with check(true);

create function public.helmut_auth_state_nodes_guard_local_v1() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $f$
declare seal jsonb; child text; n bigint;
begin
  if tg_op<>'INSERT' then raise exception 'auth-state-nodes-immutable';end if;
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on'
    or current_setting('server_encoding')<>'UTF8' or current_setting('client_encoding')<>'UTF8' then
    raise exception 'auth-state-local-only';end if;
  seal:=nullif(current_setting('helmut.atomic_state_seal',true),'')::jsonb;
  if seal is null or jsonb_typeof(seal) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(seal))<>3
    or seal->>'id' is distinct from new.store_id or seal->>'gen' is distinct from new.generation
    or coalesce(seal->>'action','') not in ('bootstrap','write') then raise exception 'auth-state-node-seal';end if;
  -- Generated body/children are not available in a BEFORE trigger.
  foreach child in array public.helmut_auth_state_children_local_v1(new.payload) loop
    select node_seq into n from public.helmut_auth_state_nodes_local
      where store_id=new.store_id and generation=new.generation and node_hash=child;
    if n is null or n>=new.node_seq then raise exception 'auth-state-node-postorder';end if;
  end loop;
  return new;
end;$f$;
create trigger helmut_auth_state_nodes_immutable_local before insert or update or delete
  on public.helmut_auth_state_nodes_local for each row execute function public.helmut_auth_state_nodes_guard_local_v1();
alter table public.helmut_auth_state_nodes_local enable always trigger helmut_auth_state_nodes_immutable_local;
create trigger helmut_auth_state_nodes_no_truncate_local before truncate
  on public.helmut_auth_state_nodes_local for each statement execute function public.helmut_auth_state_nodes_guard_local_v1();
alter table public.helmut_auth_state_nodes_local enable always trigger helmut_auth_state_nodes_no_truncate_local;

create function public.helmut_auth_state_put_nodes_local_v1(s text,g text,nodes jsonb) returns void
language plpgsql volatile security invoker set search_path=pg_catalog as $f$
declare item jsonb; total bigint:=0; actual text; old_payload text;
begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on'
    or current_setting('server_encoding')<>'UTF8' or current_setting('client_encoding')<>'UTF8' then raise exception 'auth-state-local-only';end if;
  if s is null or length(s) not between 1 and 256 or g is null
    or g!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    or jsonb_typeof(nodes) is distinct from 'array' or jsonb_array_length(nodes)>20000 then raise exception 'auth-state-nodes-input';end if;
  -- Preflight the complete batch before native insertion; no helper creates a seal.
  for item in select value from jsonb_array_elements(nodes) loop
    if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>2
      or not(item?'hash' and item?'payload') or jsonb_typeof(item->'hash') is distinct from 'string'
      or jsonb_typeof(item->'payload') is distinct from 'string' or (item->>'hash')!~'^[a-f0-9]{64}$'
      or octet_length(item->>'payload')>4194304 then raise exception 'auth-state-nodes-input';end if;
    total:=total+octet_length(item->>'payload');
    if total>33554432 then raise exception 'auth-state-payload-limit';end if;
    if encode(sha256(convert_to(item->>'payload','UTF8')),'hex') is distinct from item->>'hash' then raise exception 'auth-state-node-hash';end if;
    perform public.helmut_auth_state_children_local_v1(item->>'payload');
  end loop;
  for item in select value from jsonb_array_elements(nodes) loop
    actual:=null;
    insert into public.helmut_auth_state_nodes_local(store_id,generation,payload)
      values(s,g,item->>'payload') on conflict(store_id,generation,node_hash) do nothing returning node_hash into actual;
    if actual is null then
      select payload into old_payload from public.helmut_auth_state_nodes_local
        where store_id=s and generation=g and node_hash=item->>'hash';
      if old_payload is distinct from item->>'payload' then raise exception 'auth-state-hash-collision';end if;
    elsif actual is distinct from item->>'hash' then raise exception 'auth-state-node-hash';end if;
  end loop;
end;$f$;

create function public.helmut_auth_state_expand_local_v1(s text,g text,h text,as_graph boolean default false,omit_payloads boolean default false) returns jsonb
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

revoke all on function public.helmut_auth_state_children_local_v1(text) from public;
revoke all on function public.helmut_auth_state_leaf_info_local_v1(text) from public;
revoke all on function public.helmut_auth_state_payload_hash_local_v1(text) from public;
revoke all on function public.helmut_auth_state_nodes_guard_local_v1() from public;
revoke all on function public.helmut_auth_state_put_nodes_local_v1(text,text,jsonb) from public;
revoke all on function public.helmut_auth_state_expand_local_v1(text,text,text,boolean,boolean) from public;
grant execute on function public.helmut_auth_state_payload_hash_local_v1(text),public.helmut_auth_state_leaf_info_local_v1(text),public.helmut_auth_state_children_local_v1(text),
  public.helmut_auth_state_put_nodes_local_v1(text,text,jsonb),
  public.helmut_auth_state_expand_local_v1(text,text,text,boolean,boolean) to service_role;

do $roles$ begin
  if exists(select from pg_roles where rolname='anon') then
    execute 'revoke all on function public.helmut_auth_state_children_local_v1(text), public.helmut_auth_state_nodes_guard_local_v1(), public.helmut_auth_state_put_nodes_local_v1(text,text,jsonb), public.helmut_auth_state_expand_local_v1(text,text,text,boolean,boolean) from anon';end if;
  if exists(select from pg_roles where rolname='authenticated') then
    execute 'revoke all on function public.helmut_auth_state_children_local_v1(text), public.helmut_auth_state_nodes_guard_local_v1(), public.helmut_auth_state_put_nodes_local_v1(text,text,jsonb), public.helmut_auth_state_expand_local_v1(text,text,text,boolean,boolean) from authenticated';end if;
end;$roles$;

-- Local root protocol. Dependencies: unchanged atomic usage functions + nodes.
create function public.helmut_auth_state_assert_root_local_v1(a jsonb) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog as $f$
declare m jsonb;
begin
  if jsonb_typeof(a) is distinct from 'object' or (select count(*) from jsonb_object_keys(a))<>3
    or not(a ?& array['_authStoreRevision','_llmUsageRef','_authStateRef'])
    or jsonb_typeof(a->'_authStoreRevision') is distinct from 'string'
    or a->>'_authStoreRevision' !~ '^[a-f0-9-]{36}$'
    or jsonb_typeof(a->'_llmUsageRef') is distinct from 'object'
    or a#>>'{_llmUsageRef,version}' is distinct from 'relational-atomic-v1' then
    raise exception 'auth-state-physical-root-invalid'; end if;
  m:=a->'_authStateRef';
  if jsonb_typeof(m) is distinct from 'object' or (select count(*)from jsonb_object_keys(m))<>4
    or not(m ?& array['version','generation','root','originalHash'])
    or m->>'version' is distinct from 'merkle-auth-v1'
    or jsonb_typeof(m->'generation') is distinct from 'string' or m->>'generation' !~ '^[a-f0-9-]{36}$'
    or jsonb_typeof(m->'root') is distinct from 'string' or m->>'root' !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(m->'originalHash') is distinct from 'string' or m->>'originalHash' !~ '^[a-f0-9]{64}$' then
    raise exception 'auth-state-reference-invalid'; end if;
  return m;
end;$f$;

create function public.helmut_auth_state_assert_data_local_v1(d jsonb) returns void
language plpgsql immutable security invoker set search_path=pg_catalog as $f$
begin
  if jsonb_typeof(d) is distinct from 'object'
    or d ?| array['llmUsage','_llmUsageRef','_authStateRef','_authStoreRevision']
    or d#>>'{testKostenAuftrag,version}' is distinct from '5'
    or d#>>'{testKostenAuftrag,serviceContractHash}' is distinct from '78833d91aea2ad9c795cbb9790df031c230c98efd27d581faa79522c5da8175f' then
    raise exception 'auth-state-logical-root-invalid'; end if;
end;$f$;

-- LOCAL, opt-in CAS qualification only. No value cache and no caller claims.
-- The old renderer remains the default and the independent differential oracle.
create function public.helmut_auth_state_assert_graph_local_v1(s text,g text,h text) returns void
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare hashes text[]; bodies jsonb[]; lookup jsonb; keys jsonb[]; b jsonb; tag text;
  i integer; child text; pairs bigint; unique_pairs bigint; labels jsonb;
  root_i integer; cursor jsonb; field text; path text[]; actual text; expected text;
begin
  if current_setting('helmut.local_diagnostic_scope',true) is distinct from 'bounded-cas-qualification-v1' then
    raise exception 'auth-state-projection-not-admitted';end if;
  -- SAME native pass: all reachable actual payload SHAs, postorder, child types,
  -- depth, payload/text/native expansion AND cumulative work bounds, fresh.
  perform public.helmut_auth_state_expand_local_v1(s,g,h,true,true);
  with recursive reach(hash) as(
    select h union select unnest(t.children) from reach r
      join public.helmut_auth_state_nodes_local t on t.store_id=s and t.generation=g and t.node_hash=r.hash
  ) select array_agg(t.node_hash order by t.node_seq),array_agg(t.body order by t.node_seq)
    into hashes,bodies from reach r join public.helmut_auth_state_nodes_local t
      on t.store_id=s and t.generation=g and t.node_hash=r.hash;
  select jsonb_object_agg(hash,ord) into lookup from unnest(hashes) with ordinality x(hash,ord);
  keys:=array_fill(null::jsonb,array[cardinality(hashes)]);
  -- Only object KEY SETS are materialized, never their logical values. Check
  -- EVERY reachable object, including objects nested under arrays/other fields.
  -- Repeated edges retain multiplicity: flattening the same nonempty object
  -- twice is a duplicate too. Shared valid subtrees need checking only once.
  for i in 1..cardinality(hashes) loop
    b:=bodies[i];tag:=b->>0;
    if tag='v' and jsonb_typeof(b->1)='object' then
      select coalesce(jsonb_object_agg(k,true),'{}'::jsonb) into labels from jsonb_object_keys(b->1) x(k);
      keys[i]:=labels;
    elsif tag='o' then
      select count(*),count(distinct (value->>0) collate "C"),coalesce(jsonb_object_agg(value->>0,true),'{}'::jsonb)
        into pairs,unique_pairs,labels from jsonb_array_elements(b->1);
      if pairs<>unique_pairs then raise exception 'auth-state-duplicate-key-or-invalid-json';end if;
      keys[i]:=labels;
    elsif tag='m' then
      select count(*),count(distinct k collate "C"),coalesce(jsonb_object_agg(k,true),'{}'::jsonb)
        into pairs,unique_pairs,labels from jsonb_array_elements(b->1) e
        cross join lateral jsonb_object_keys(keys[(lookup->>(e.value->>1))::integer]) x(k);
      if pairs<>unique_pairs then raise exception 'auth-state-duplicate-key-or-invalid-json';end if;
      keys[i]:=labels;
    end if;
  end loop;
  root_i:=(lookup->>h)::integer;b:=bodies[root_i];
  if keys[root_i] is null or keys[root_i] ?| array['llmUsage','_llmUsageRef','_authStateRef','_authStoreRevision'] then
    raise exception 'auth-state-logical-root-invalid';end if;
  -- Exact #>> semantics for these two paths: a leaf may contain a compact
  -- object, an object may be split into virtual map buckets, and numeric5 is
  -- accepted exactly as by the original text comparison (5.0 remains different).
  foreach field in array array['version','serviceContractHash'] loop
    path:=array['testKostenAuftrag',field];cursor:=jsonb_build_object('hash',h);
    foreach child in array path loop
      if cursor ? 'value' then
        cursor:=case when jsonb_typeof(cursor->'value')='object' and (cursor->'value')?child
          then jsonb_build_object('value',cursor->'value'->child) else null end;
      else
        with recursive flat(hash) as(
          select cursor->>'hash' union
          select unnest(t.children) from flat f join public.helmut_auth_state_nodes_local t
            on t.store_id=s and t.generation=g and t.node_hash=f.hash where t.body->>0='m'
        ), selected as(
          select jsonb_build_object('value',t.body->1->child) v from flat f
            join public.helmut_auth_state_nodes_local t on t.store_id=s and t.generation=g and t.node_hash=f.hash
            where t.body->>0='v' and jsonb_typeof(t.body->1)='object' and (t.body->1)?child
          union all
          select jsonb_build_object('hash',e.value->>1) from flat f
            join public.helmut_auth_state_nodes_local t on t.store_id=s and t.generation=g and t.node_hash=f.hash
            cross join lateral jsonb_array_elements(case when t.body->>0='o' then t.body->1 else '[]'::jsonb end) e
            where (e.value->>0) collate "C"=child collate "C"
        ) select v into cursor from selected;
      end if;
      exit when cursor is null;
    end loop;
    actual:=null;
    if cursor ? 'value' then actual:=cursor->'value'#>>'{}';
    elsif cursor ? 'hash' then
      b:=bodies[(lookup->>(cursor->>'hash'))::integer];
      if b->>0='v' then actual:=b->1#>>'{}';end if;
    end if;
    expected:=case when field='version' then '5' else '78833d91aea2ad9c795cbb9790df031c230c98efd27d581faa79522c5da8175f' end;
    if actual is distinct from expected then raise exception 'auth-state-logical-root-invalid';end if;
  end loop;
end;$f$;
revoke all on function public.helmut_auth_state_assert_graph_local_v1(text,text,text) from public;
grant execute on function public.helmut_auth_state_assert_graph_local_v1(text,text,text) to service_role;

create function public.helmut_auth_state_auth_guard_local_v1() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $f$
declare old_ref jsonb; new_ref jsonb; seal jsonb;
begin
  if tg_op='TRUNCATE' then
    if exists(select from public.helmut_store where data ? '_authStateRef') then
      raise exception 'auth-state-truncate-forbidden'; end if;
    return null;
  end if;
  if tg_op<>'INSERT' then old_ref:=old.data->'_authStateRef'; end if;
  if tg_op<>'DELETE' then new_ref:=new.data->'_authStateRef'; end if;
  if old_ref is null and new_ref is null then
    if tg_op='DELETE' then return old;else return new;end if;
  end if;
  if tg_op='DELETE' then raise exception 'auth-state-delete-forbidden';end if;
  seal:=nullif(current_setting('helmut.atomic_state_seal',true),'')::jsonb;
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on'
    or seal is null or seal->>'id' is distinct from new.id
    or (old_ref is not null and old_ref->>'generation' is distinct from seal->>'gen') then
    raise exception 'auth-state-direct-root-write-forbidden';end if;
  if new_ref is null then
    if seal->>'action' is distinct from 'restore' or old_ref is null
      or new.data ? 'llmUsage' or new.data->'_llmUsageRef' is distinct from old.data->'_llmUsageRef'
      or new.data->>'_authStoreRevision' is not distinct from old.data->>'_authStoreRevision' then
      raise exception 'auth-state-restore-binding-invalid';end if;
  else
    perform public.helmut_auth_state_assert_root_local_v1(new.data);
    if new_ref->>'generation' is distinct from seal->>'gen'
      or (old_ref is null and seal->>'action' is distinct from 'bootstrap')
      or (old_ref is not null and (seal->>'action' is distinct from 'write'
        or new_ref->>'originalHash' is distinct from old_ref->>'originalHash')) then
      raise exception 'auth-state-root-binding-invalid';end if;
  end if;
  return new;
end;$f$;
create trigger helmut_auth_state_root_bound_local before insert or update or delete on public.helmut_store
  for each row execute function public.helmut_auth_state_auth_guard_local_v1();
alter table public.helmut_store enable always trigger helmut_auth_state_root_bound_local;
create trigger helmut_auth_state_root_no_truncate_local before truncate on public.helmut_store
  for each statement execute function public.helmut_auth_state_auth_guard_local_v1();
alter table public.helmut_store enable always trigger helmut_auth_state_root_no_truncate_local;

create function public.helmut_auth_state_read_v1(jsonb) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare a jsonb;m jsonb;d jsonb;u jsonb;s text;
begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on'
    or current_setting('server_encoding')<>'UTF8' or current_setting('client_encoding')<>'UTF8' then raise exception 'auth-state-local-only';end if;
  if jsonb_typeof($1) is distinct from 'object' or (select count(*)from jsonb_object_keys($1))<>1
    or jsonb_typeof($1->'id') is distinct from 'string' or length($1->>'id') not between 1 and 256 then
    raise exception 'auth-state-read-input';end if;
  s:=$1->>'id';select data into strict a from public.helmut_store where id=s;
  m:=public.helmut_auth_state_assert_root_local_v1(a);
  d:=public.helmut_auth_state_expand_local_v1(s,m->>'generation',m->>'root');
  perform public.helmut_auth_state_assert_data_local_v1(d);
  u:=public.helmut_auth_usage_read_v1($1);
  if u->'proof' is distinct from (a->'_llmUsageRef')-'version'
    or u#>>'{data,_authStoreRevision}' is distinct from a->>'_authStoreRevision' then
    raise exception 'auth-state-usage-snapshot-mismatch';end if;
  return jsonb_build_object('data',d||jsonb_build_object('_authStoreRevision',a->'_authStoreRevision','llmUsage',u#>'{data,llmUsage}'),
    'proof',u->'proof','state',m);
end;$f$;

create function public.helmut_auth_state_graph_read_v1(jsonb) returns jsonb
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

create function public.helmut_auth_state_bootstrap_v1(jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog as $f$
declare a jsonb;d jsonb;m jsonb;s text;g text;original text;
begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on'
    or current_setting('server_encoding')<>'UTF8' or current_setting('client_encoding')<>'UTF8' then raise exception 'auth-state-local-only';end if;
  if jsonb_typeof($1) is distinct from 'object' or (select count(*)from jsonb_object_keys($1))<>4
    or not($1 ?& array['id','expectedHash','root','nodes'])
    or jsonb_typeof($1->'id') is distinct from 'string' or length($1->>'id') not between 1 and 256
    or jsonb_typeof($1->'expectedHash') is distinct from 'string' or $1->>'expectedHash' !~ '^[a-f0-9]{64}$'
    or jsonb_typeof($1->'root') is distinct from 'string' or $1->>'root' !~ '^[a-f0-9]{64}$'
    or jsonb_typeof($1->'nodes') is distinct from 'array' then raise exception 'auth-state-bootstrap-input';end if;
  s:=$1->>'id';select data into strict a from public.helmut_store where id=s for update;
  original:=encode(sha256(convert_to(a::text,'UTF8')),'hex');
  if original is distinct from $1->>'expectedHash' or a ? '_authStateRef' or a ? 'llmUsage'
    or a#>>'{_llmUsageRef,version}' is distinct from 'relational-atomic-v1' then raise exception 'auth-state-bootstrap-state';end if;
  -- Validate the unchanged existing native history before converting the root.
  perform public.helmut_auth_usage_read_v1(jsonb_build_object('id',s));
  g:=gen_random_uuid()::text;
  if exists(select from public.helmut_auth_state_nodes_local where store_id=s and generation=g) then
    raise exception 'auth-state-generation-already-exists';end if;
  perform set_config('helmut.atomic_state_seal',jsonb_build_object('id',s,'gen',g,'action','bootstrap')::text,true);
  perform public.helmut_auth_state_put_nodes_local_v1(s,g,$1->'nodes');
  -- A separate SPI SELECT obtains command visibility for the just-inserted nodes.
  select public.helmut_auth_state_expand_local_v1(s,g,$1->>'root') into d;
  perform public.helmut_auth_state_assert_data_local_v1(d);
  if d::text is distinct from (a-'_authStoreRevision'-'_llmUsageRef')::text then
    raise exception 'auth-state-bootstrap-original-data-different';end if;
  m:=jsonb_build_object('version','merkle-auth-v1','generation',g,'root',$1->>'root','originalHash',original);
  perform set_config('helmut.atomic_usage_seal',jsonb_build_object('id',s,'gen',a#>>'{_llmUsageRef,generation}','action','write')::text,true);
  update public.helmut_store set data=jsonb_build_object('_authStoreRevision',gen_random_uuid()::text,
    '_llmUsageRef',a->'_llmUsageRef','_authStateRef',m)where id=s;
  perform set_config('helmut.atomic_usage_seal','',true);perform set_config('helmut.atomic_state_seal','',true);
  return jsonb_build_object('id',s,'state',m);
end;$f$;

create function public.helmut_auth_state_cas_v1(jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog as $f$
declare a jsonb;d jsonb;m jsonb;u jsonb;r jsonb;s text;h text;n bigint;
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
  perform set_config('helmut.atomic_state_seal',jsonb_build_object('id',s,'gen',m->>'generation','action','write')::text,true);
  perform public.helmut_auth_state_put_nodes_local_v1(s,m->>'generation',$1->'nodes');
  if current_setting('helmut.local_auth_state_cas_projection',true)='on' then
    perform public.helmut_auth_state_assert_graph_local_v1(s,m->>'generation',$1->>'root');
  else
    select public.helmut_auth_state_expand_local_v1(s,m->>'generation',$1->>'root') into d;
    perform public.helmut_auth_state_assert_data_local_v1(d);
  end if;
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

create function public.helmut_auth_state_restore_v1(jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog as $f$
declare a jsonb;d jsonb;m jsonb;s text;
begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on'
    or current_setting('server_encoding')<>'UTF8' or current_setting('client_encoding')<>'UTF8' then raise exception 'auth-state-local-only';end if;
  if jsonb_typeof($1) is distinct from 'object' or (select count(*)from jsonb_object_keys($1))<>3
    or not($1 ?& array['id','expectedRevision','expectedState']) or jsonb_typeof($1->'id') is distinct from 'string'
    or length($1->>'id') not between 1 and 256 or jsonb_typeof($1->'expectedRevision') is distinct from 'string'
    or jsonb_typeof($1->'expectedState') is distinct from 'object' then raise exception 'auth-state-restore-input';end if;
  s:=$1->>'id';select data into strict a from public.helmut_store where id=s for update;
  m:=public.helmut_auth_state_assert_root_local_v1(a);
  if a->>'_authStoreRevision' is distinct from $1->>'expectedRevision' or m is distinct from $1->'expectedState' then
    raise exception 'auth-state-restore-conflict';end if;
  d:=public.helmut_auth_state_read_v1(jsonb_build_object('id',s))->'data';
  perform set_config('helmut.atomic_state_seal',jsonb_build_object('id',s,'gen',m->>'generation','action','restore')::text,true);
  perform set_config('helmut.atomic_usage_seal',jsonb_build_object('id',s,'gen',a#>>'{_llmUsageRef,generation}','action','write')::text,true);
  update public.helmut_store set data=(d-'llmUsage')||jsonb_build_object('_llmUsageRef',a->'_llmUsageRef','_authStoreRevision',gen_random_uuid()::text)where id=s;
  perform set_config('helmut.atomic_usage_seal','',true);perform set_config('helmut.atomic_state_seal','',true);
  return jsonb_build_object('id',s,'restored',true,'nodesRetained',true);
end;$f$;

revoke all on function public.helmut_auth_state_assert_root_local_v1(jsonb) from public;
revoke all on function public.helmut_auth_state_assert_data_local_v1(jsonb) from public;
revoke all on function public.helmut_auth_state_auth_guard_local_v1() from public;
revoke all on function public.helmut_auth_state_read_v1(jsonb) from public;
revoke all on function public.helmut_auth_state_graph_read_v1(jsonb) from public;
revoke all on function public.helmut_auth_state_bootstrap_v1(jsonb) from public;
revoke all on function public.helmut_auth_state_cas_v1(jsonb) from public;
revoke all on function public.helmut_auth_state_restore_v1(jsonb) from public;
grant execute on function public.helmut_auth_state_assert_root_local_v1(jsonb),public.helmut_auth_state_assert_data_local_v1(jsonb),
 public.helmut_auth_state_read_v1(jsonb),public.helmut_auth_state_graph_read_v1(jsonb),public.helmut_auth_state_bootstrap_v1(jsonb),public.helmut_auth_state_cas_v1(jsonb),public.helmut_auth_state_restore_v1(jsonb) to service_role;

commit;
