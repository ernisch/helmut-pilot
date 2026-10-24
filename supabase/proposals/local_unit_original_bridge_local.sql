-- INERT COPY-ONLY PROPOSAL. Not a migration, seed, authority or unit approval.
-- Root must review the actual unchanged legacy invoker/trigger closure first.
-- Set helmut.local_unit_original_bridge_install_target to this exact NEW owned
-- database and helmut.local_unit_original_bridge_install to the qualified JSON:
-- {schema:"helmut-local-unit-original-bridge-install/1",database,operationId,
--  commandHash,originalSources:[{oid,name,identityArguments,prosrcSHA256,
--  volatility,returnType,language,config}]}. All grants resolve checked OIDs.
-- The qualification is privileged Root input, not a self-authenticating flag.
-- No original function, trigger, row, generation or history is replaced.
begin;
do $install$
declare q jsonb; p record; r jsonb; db text:=current_database(); suffix text:=right(db,32);
  writer text:='helmut_ud_bridge_writer_'||suffix; owner_name text:='helmut_ud_owner_'||suffix;
  needed text[]:=array['helmut_auth_state_cas_v1','helmut_auth_state_payload_hash_local_v1',
    'helmut_auth_state_leaf_info_local_v1','helmut_auth_state_children_local_v1',
    'helmut_auth_state_nodes_guard_local_v1','helmut_auth_state_put_nodes_local_v1',
    'helmut_auth_state_expand_local_v1','helmut_auth_state_assert_root_local_v1',
    'helmut_auth_state_assert_data_local_v1','helmut_auth_state_assert_graph_local_v1',
    'helmut_auth_state_auth_guard_local_v1','helmut_auth_state_graph_checked_local_v1',
    'helmut_auth_usage_guard_local_v1','helmut_auth_usage_insert_local_v1',
    'helmut_auth_usage_checked_proof_local_v1']; seen text[]:='{}';
begin
  if db !~ '^helmut_unit_diagnostic_[a-f0-9]{32}$'
    or current_setting('helmut.local_unit_original_bridge_install_target',true) is distinct from db
    or current_setting('helmut.local_usage_experiment',true) is distinct from 'on'
    or current_setting('server_version_num')::integer not between 170000 and 179999
    or current_setting('server_encoding')<>'UTF8' or current_setting('client_encoding')<>'UTF8'
    or current_user<>session_user or not exists(select from pg_roles where rolname=current_user and rolsuper)
    or not exists(select from pg_namespace where nspname='helmut_unit_diagnostic' and nspowner=(select oid from pg_roles where rolname=owner_name))
    or (select count(*) from pg_class where oid in ('public.helmut_store'::regclass,'public.helmut_auth_state_nodes_local'::regclass,'public.llm_usage'::regclass,'public.briefings'::regclass) and relrowsecurity and relkind='r')<>4
    or exists(select from pg_roles where rolname=writer)
    or exists(select from pg_proc proc_src join pg_namespace n on n.oid=proc_src.pronamespace where n.nspname='helmut_unit_diagnostic' and proc_src.proname like 'original_bridge_%') then
    raise exception 'original-bridge-new-owned-copy-required';end if;
  if not exists(select from pg_constraint fk where fk.conrelid='public.briefings'::regclass and fk.confrelid='public.profiles'::regclass
    and fk.contype='f' and fk.convalidated and not fk.condeferrable and not fk.condeferred
    and fk.conkey=array[(select attnum from pg_attribute where attrelid=fk.conrelid and attname='user_id' and not attisdropped)]::smallint[]
    and fk.confkey=array[(select attnum from pg_attribute where attrelid=fk.confrelid and attname='id' and not attisdropped)]::smallint[]) then
    raise exception 'original-bridge-actual-briefing-profile-fk-required';end if;
  q:=nullif(current_setting('helmut.local_unit_original_bridge_install',true),'')::jsonb;
  if not helmut_unit_diagnostic.exact(q,array['schema','database','operationId','commandHash','originalSources'])
    or q->>'schema' is distinct from 'helmut-local-unit-original-bridge-install/1'
    or q->>'database' is distinct from db or q->>'operationId' is distinct from 'localUnitDiagnostic-'||suffix
    or coalesce(q->>'commandHash','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(q->'originalSources') is distinct from 'array' or jsonb_array_length(q->'originalSources') not between cardinality(needed) and 32 then
    raise exception 'original-bridge-qualified-install-input';end if;
  for r in select value from jsonb_array_elements(q->'originalSources') loop
    if not helmut_unit_diagnostic.exact(r,array['oid','name','identityArguments','prosrcSHA256','volatility','returnType','language','config'])
      or coalesce(r->>'oid','') !~ '^[1-9][0-9]{0,9}$' or coalesce(r->>'prosrcSHA256','') !~ '^[a-f0-9]{64}$' then
      raise exception 'original-bridge-qualified-source-shape';end if;
    select p0.*,n.nspname,l.lanname into strict p from pg_proc p0 join pg_namespace n on n.oid=p0.pronamespace
      join pg_language l on l.oid=p0.prolang where p0.oid=(r->>'oid')::oid;
    if p.nspname<>'public' or p.proname=any(seen)
      or (p.proname<>all(needed) and not exists(select from pg_trigger t where not t.tgisinternal and t.tgfoid=p.oid
        and t.tgrelid in ('public.helmut_store'::regclass,'public.helmut_auth_state_nodes_local'::regclass,'public.llm_usage'::regclass,'public.briefings'::regclass)))
      or r->>'name' is distinct from 'public.'||p.proname or oidvectortypes(p.proargtypes) is distinct from r->>'identityArguments'
      or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') is distinct from r->>'prosrcSHA256'
      or p.prosecdef or to_jsonb(p.proconfig) is distinct from nullif(r->'config','null'::jsonb)
      or (p.proname=any(needed) and p.proconfig is distinct from array['search_path=pg_catalog']::text[])
      or (p.proconfig is not null and p.proconfig is distinct from array['search_path=pg_catalog']::text[])
      or p.provolatile::text is distinct from r->>'volatility' or format_type(p.prorettype,null) is distinct from r->>'returnType'
      or p.lanname is distinct from r->>'language' then raise exception 'original-bridge-qualified-source-mismatch';end if;
    seen:=array_append(seen,p.proname);
  end loop;
  if not seen@>needed then raise exception 'original-bridge-qualified-closure-incomplete';end if;
  if exists(select from pg_trigger t where not t.tgisinternal and t.tgrelid in
    ('public.helmut_store'::regclass,'public.helmut_auth_state_nodes_local'::regclass,'public.llm_usage'::regclass,'public.briefings'::regclass)
    and not exists(select from jsonb_array_elements(q->'originalSources') r0 where (r0->>'oid')::oid=t.tgfoid)) then
    raise exception 'original-bridge-qualified-trigger-closure-incomplete';end if;
  execute format('create role %I nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls',writer);
  perform set_config('role',owner_name,true);
end;$install$;

-- Only object partition containers are flattened. Repeated containers are an
-- error; ordinary value children may be shared. No last-wins key aggregation.
create function helmut_unit_diagnostic.original_bridge_top_map_v1(s text,g text,h text) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare stack text[]:=array[h]; seen text[]:='{}'; current_hash text; b jsonb; tag text; e jsonb; k text;
  result jsonb:='{}'; n integer:=0; payload text;
begin
  if s is distinct from 'main-auth' or g is null or h is null or h!~'^[a-f0-9]{64}$' then raise exception 'original-bridge-top-input';end if;
  perform public.helmut_auth_state_graph_checked_local_v1(s,g,h,true);
  while cardinality(stack)>0 loop
    current_hash:=stack[cardinality(stack)];stack:=trim_array(stack,1);n:=n+1;
    if n>20000 or current_hash=any(seen) then raise exception 'original-bridge-container-repeated';end if;
    seen:=array_append(seen,current_hash);
    select t.body,t.payload into strict b,payload from public.helmut_auth_state_nodes_local t
      where t.store_id=s and t.generation=g and t.node_hash=current_hash;
    if encode(sha256(convert_to(payload,'UTF8')),'hex')<>current_hash then raise exception 'original-bridge-actual-node-hash';end if;
    tag:=b->>0;
    if tag='m' then
      for e in select value from jsonb_array_elements(b->1) loop stack:=array_append(stack,e->>1);end loop;
    elsif tag='o' or (tag='v' and jsonb_typeof(b->1)='object' and octet_length(payload)<=16384) then
      for e in select value from jsonb_array_elements(case when tag='o' then b->1 else
        (select coalesce(jsonb_agg(jsonb_build_array(key,current_hash)),'[]'::jsonb) from jsonb_each(b->1)) end) loop
        k:=e->>0;
        if result?k or k=any(array['llmUsage','_llmUsageRef','_authStateRef','_authStoreRevision']) then raise exception 'original-bridge-top-key';end if;
        result:=result||jsonb_build_object(k,jsonb_build_object('nodeHash',case when tag='o' then e->>1 else current_hash end,'inline',tag='v'));
        if octet_length(result::text)>4194304 then raise exception 'original-bridge-top-map-limit';end if;
      end loop;
    else raise exception 'original-bridge-top-object-required';end if;
  end loop;
  return result;
end;$f$;

-- Actual leaf values remain internal. Direct non-own references may only be
-- compared with v leaves; no arbitrary legacy subtree expansion is permitted.
-- Own references have a separate pre-expansion native/text/work bound.
create function helmut_unit_diagnostic.original_bridge_value_v1(s text,g text,k text,ref jsonb,small boolean) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare b jsonb; payload text; r record; reachable text[]; lookup jsonb; sizes bigint[]; native_sizes bigint[];
  n integer; found_n integer; payload_bytes bigint; i integer:=0; j integer; child text; indexes integer[];
  tag text; text_size bigint; native_size bigint; text_work bigint:=0; native_work bigint:=0; components integer;
begin
  if s is distinct from 'main-auth' or g is null or k is null or small is null
    or not helmut_unit_diagnostic.exact(ref,array['nodeHash','inline'])
    or coalesce(ref->>'nodeHash','')!~'^[a-f0-9]{64}$' or jsonb_typeof(ref->'inline') is distinct from 'boolean' then
    raise exception 'original-bridge-value-input';end if;
  select t.body,t.payload into strict b,payload from public.helmut_auth_state_nodes_local t
    where t.store_id=s and t.generation=g and t.node_hash=ref->>'nodeHash';
  if encode(sha256(convert_to(payload,'UTF8')),'hex') is distinct from ref->>'nodeHash' then raise exception 'original-bridge-actual-node-hash';end if;
  if (ref->>'inline')::boolean then
    if b->>0 is distinct from 'v' or jsonb_typeof(b->1) is distinct from 'object' or not(b->1?k) or octet_length(payload)>16384 then
      raise exception 'original-bridge-inline-leaf';end if;
    return b->1->k;
  end if;
  if not small then
    if b->>0 is distinct from 'v' or octet_length(payload)>65536 then raise exception 'original-bridge-mixed-leaf-required';end if;
    return b->1;
  end if;
  -- Pull bounded references before bodies. Preserve edge multiplicity in each
  -- size calculation, including shared value children and flattened maps/lists.
  with recursive reach(hash) as(select ref->>'nodeHash' union select unnest(t.children) from reach r0
    join public.helmut_auth_state_nodes_local t on t.store_id=s and t.generation=g and t.node_hash=r0.hash),
    bounded as materialized(select hash from reach limit 2001)
    select array_agg(hash),count(*) into reachable,n from bounded;
  if n<1 or n>2000 then raise exception 'original-bridge-own-node-limit';end if;
  select count(*),sum(octet_length(t.payload)) into found_n,payload_bytes from public.helmut_auth_state_nodes_local t
    where t.store_id=s and t.generation=g and t.node_hash=any(reachable);
  if found_n<>n or payload_bytes>2097152 then raise exception 'original-bridge-own-payload-limit';end if;
  select jsonb_object_agg(t.node_hash,x.ord) into lookup from
    (select node_hash,row_number()over(order by node_seq) ord from public.helmut_auth_state_nodes_local
      where store_id=s and generation=g and node_hash=any(reachable)) x join public.helmut_auth_state_nodes_local t
      on t.store_id=s and t.generation=g and t.node_hash=x.node_hash;
  sizes:=array_fill(0::bigint,array[n]);native_sizes:=array_fill(0::bigint,array[n]);
  for r in select t.* from public.helmut_auth_state_nodes_local t where t.store_id=s and t.generation=g
    and t.node_hash=any(reachable) order by t.node_seq loop
    i:=i+1;b:=r.body;tag:=b->>0;indexes:='{}';
    if encode(sha256(convert_to(r.payload,'UTF8')),'hex')<>r.node_hash then raise exception 'original-bridge-actual-node-hash';end if;
    foreach child in array r.children loop
      j:=(lookup->>child)::integer;if j is null or j>=i then raise exception 'original-bridge-own-postorder';end if;
      indexes:=array_append(indexes,j);
    end loop;
    if tag='v' then text_size:=(r.leaf_info->>'textBytes')::bigint;native_size:=(r.leaf_info->>'nativeBytes')::bigint;
    elsif tag in ('o','a') then
      text_size:=2;native_size:=16;
      if cardinality(indexes)>0 then for j in 1..cardinality(indexes) loop
        text_size:=text_size+sizes[indexes[j]]+case when j>1 then 2 else 0 end;
        native_size:=native_size+native_sizes[indexes[j]]+16;
        if tag='o' then text_size:=text_size+octet_length((b->1->(j-1)->0)::text)+2;
          native_size:=native_size+octet_length(b->1->(j-1)->>0);end if;
      end loop;end if;
    elsif tag in ('m','l') then
      text_size:=2;native_size:=16;components:=0;
      foreach j in array indexes loop text_size:=text_size+sizes[j]-2;native_size:=native_size+native_sizes[j]+16;
        if sizes[j]>2 then components:=components+1;end if;end loop;
      text_size:=text_size+greatest(0,components-1)*2;
    else raise exception 'original-bridge-own-node-kind';end if;
    if text_size is null or native_size is null or text_size>4194304 or native_size>8388608
      or text_work+text_size>8388608 or native_work+native_size>16777216 then raise exception 'original-bridge-own-expansion-limit';end if;
    sizes[i]:=text_size;native_sizes[i]:=native_size;text_work:=text_work+text_size;native_work:=native_work+native_size;
  end loop;
  return public.helmut_auth_state_expand_local_v1(s,g,ref->>'nodeHash',false,false);
end;$f$;

create function helmut_unit_diagnostic.original_bridge_own_projection_v1(s text,g text,h text,operation_id text) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare m jsonb; result jsonb:='{}'; k text; prefix text; own_keys text[];
begin
  if operation_id is distinct from 'localUnitDiagnostic-'||right(current_database(),32) then raise exception 'original-bridge-own-operation';end if;
  prefix:='localUnitDiagnostic:'||right(operation_id,32)||':';
  own_keys:=array['localUnitDiagnosticConsumedGrantsV1',prefix||'journal',prefix||'costs',prefix||'reservation',prefix||'sendClaim',prefix||'review',prefix||'result'];
  m:=helmut_unit_diagnostic.original_bridge_top_map_v1(s,g,h);
  foreach k in array own_keys loop
    if not(m?k) then raise exception 'original-bridge-own-key-missing-seed-blocked';end if;
    result:=result||jsonb_build_object(k,helmut_unit_diagnostic.original_bridge_value_v1(s,g,k,m->k,true));
    if octet_length(result::text)>4194304 then raise exception 'original-bridge-own-projection-limit';end if;
  end loop;
  return result;
end;$f$;

-- Called by the native receipt after its complete Root/temp/source/ACK checks.
-- Both maps remain genuine database reads in that receipt's stable snapshot.
-- The locked own row is still OLD inside the native BEFORE UPDATE trigger.
-- The receipt supplies its freshly hash/revision/canonical-checked DB body;
-- this read-only helper cannot turn caller-provided values into a receipt.
create function helmut_unit_diagnostic.original_bridge_compare_delta_v1(s text,g text,old_root text,new_root text,operation_id text,expected_own jsonb,verified_old_own jsonb) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare old_map jsonb; new_map jsonb; old_own jsonb:='{}'; actual_own jsonb:='{}'; k text; prefix text; own_keys text[]; a jsonb; b jsonb;
begin
  if operation_id is distinct from 'localUnitDiagnostic-'||right(current_database(),32) then raise exception 'original-bridge-delta-operation';end if;
  if session_user is distinct from 'helmut_ud_authenticator_'||right(current_database(),32)
    or current_user is distinct from 'helmut_ud_runtime_'||right(current_database(),32) then
    raise exception 'original-bridge-delta-runtime-principal';end if;
  prefix:='localUnitDiagnostic:'||right(operation_id,32)||':';
  own_keys:=array['localUnitDiagnosticConsumedGrantsV1',prefix||'journal',prefix||'costs',prefix||'reservation',prefix||'sendClaim',prefix||'review',prefix||'result'];
  if not helmut_unit_diagnostic.exact(expected_own,own_keys) or octet_length(expected_own::text)>4194304 then raise exception 'original-bridge-exact-own-seven';end if;
  if not helmut_unit_diagnostic.exact(verified_old_own,own_keys) or octet_length(verified_old_own::text)>4194304 then raise exception 'original-bridge-exact-old-own-seven';end if;
  old_map:=helmut_unit_diagnostic.original_bridge_top_map_v1(s,g,old_root);
  if old_root=new_root then new_map:=old_map;
  else new_map:=helmut_unit_diagnostic.original_bridge_top_map_v1(s,g,new_root);end if;
  foreach k in array own_keys loop
    if not(old_map?k) or not(new_map?k) then raise exception 'original-bridge-own-key-missing-seed-blocked';end if;
    old_own:=old_own||jsonb_build_object(k,helmut_unit_diagnostic.original_bridge_value_v1(s,g,k,old_map->k,true));
    if octet_length(old_own::text)>4194304 then raise exception 'original-bridge-own-projection-limit';end if;
  end loop;
  if old_own is distinct from verified_old_own then raise exception 'original-bridge-old-full-auth-mirror';end if;
  if (select array_agg(key collate "C" order by key collate "C") from jsonb_object_keys(old_map) key where not(key=any(own_keys)))
    is distinct from (select array_agg(key collate "C" order by key collate "C") from jsonb_object_keys(new_map) key where not(key=any(own_keys))) then
    raise exception 'original-bridge-outside-keyset-changed';end if;
  for k in select key from jsonb_object_keys(old_map) key where not(key=any(own_keys)) loop
    a:=old_map->k;b:=new_map->k;
    if a=b then continue;end if;
    if a->'inline'='false'::jsonb and b->'inline'='false'::jsonb then raise exception 'original-bridge-outside-child-hash-changed';end if;
    if helmut_unit_diagnostic.original_bridge_value_v1(s,g,k,a,false) is distinct from
      helmut_unit_diagnostic.original_bridge_value_v1(s,g,k,b,false) then raise exception 'original-bridge-outside-inline-value-changed';end if;
  end loop;
  if old_root=new_root then actual_own:=old_own;
  else
    foreach k in array own_keys loop
      actual_own:=actual_own||jsonb_build_object(k,helmut_unit_diagnostic.original_bridge_value_v1(s,g,k,new_map->k,true));
      if octet_length(actual_own::text)>4194304 then raise exception 'original-bridge-own-projection-limit';end if;
    end loop;
  end if;
  if actual_own is distinct from expected_own then raise exception 'original-bridge-own-projection-mismatch';end if;
  return actual_own;
end;$f$;

-- Seed is private Owner initialization only: all seven names must be absent
-- before the unchanged original CAS. Normal state/usage never use this helper.
create function helmut_unit_diagnostic.original_bridge_compare_seed_v1(s text,g text,old_root text,new_root text,operation_id text,expected_own jsonb) returns void
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare old_map jsonb; new_map jsonb; actual_own jsonb:='{}'; k text; prefix text; own_keys text[]; a jsonb; b jsonb;
begin
  if operation_id is distinct from 'localUnitDiagnostic-'||right(current_database(),32) then raise exception 'original-bridge-seed-operation';end if;
  prefix:='localUnitDiagnostic:'||right(operation_id,32)||':';
  own_keys:=array['localUnitDiagnosticConsumedGrantsV1',prefix||'journal',prefix||'costs',prefix||'reservation',prefix||'sendClaim',prefix||'review',prefix||'result'];
  if not helmut_unit_diagnostic.exact(expected_own,own_keys) or octet_length(expected_own::text)>4194304 then raise exception 'original-bridge-exact-own-seven';end if;
  old_map:=helmut_unit_diagnostic.original_bridge_top_map_v1(s,g,old_root);
  new_map:=helmut_unit_diagnostic.original_bridge_top_map_v1(s,g,new_root);
  if (select array_agg(key collate "C" order by key collate "C") from jsonb_object_keys(old_map) key where not(key=any(own_keys)))
    is distinct from (select array_agg(key collate "C" order by key collate "C") from jsonb_object_keys(new_map) key where not(key=any(own_keys))) then
    raise exception 'original-bridge-outside-keyset-changed';end if;
  for k in select key from jsonb_object_keys(old_map) key where not(key=any(own_keys)) loop
    a:=old_map->k;b:=new_map->k;
    if a=b then continue;end if;
    if a->'inline'='false'::jsonb and b->'inline'='false'::jsonb then raise exception 'original-bridge-outside-child-hash-changed';end if;
    if helmut_unit_diagnostic.original_bridge_value_v1(s,g,k,a,false) is distinct from
      helmut_unit_diagnostic.original_bridge_value_v1(s,g,k,b,false) then raise exception 'original-bridge-outside-inline-value-changed';end if;
  end loop;
  foreach k in array own_keys loop
    if old_map?k or not(new_map?k) then raise exception 'original-bridge-seed-all-seven-must-be-new';end if;
    actual_own:=actual_own||jsonb_build_object(k,helmut_unit_diagnostic.original_bridge_value_v1(s,g,k,new_map->k,true));
    if octet_length(actual_own::text)>4194304 then raise exception 'original-bridge-own-projection-limit';end if;
  end loop;
  if actual_own is distinct from expected_own then raise exception 'original-bridge-own-projection-mismatch';end if;
end;$f$;

-- Catalog JSON is an actual native structure, not a purported JS byte hash.
-- Root captures it privately after installation and binds it in qualification.
create function helmut_unit_diagnostic.original_bridge_relations_v1() returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare answer jsonb;
begin
  select jsonb_agg(jsonb_build_object('name','public.'||c.relname,'oid',c.oid::text,'owner',c.relowner::text,
    'kind',c.relkind::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'persistence',c.relpersistence::text,
    'partition',c.relispartition,'acl',to_jsonb(c.relacl),
    'columns',(select coalesce(jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',a.atttypid::text,
      'modifier',a.atttypmod,'notNull',a.attnotnull,'dropped',a.attisdropped,'identity',a.attidentity::text,
      'generated',a.attgenerated::text,'collation',a.attcollation::text,'acl',to_jsonb(a.attacl),
      'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]'::jsonb)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0),
    'constraints',(select coalesce(jsonb_agg(jsonb_build_object('oid',x.oid::text,'name',x.conname,'type',x.contype::text,
      'validated',x.convalidated,'deferrable',x.condeferrable,'deferred',x.condeferred,'definition',pg_get_constraintdef(x.oid,false)) order by x.oid),'[]'::jsonb)
      from pg_constraint x where x.conrelid=c.oid),
    'policies',(select coalesce(jsonb_agg(jsonb_build_object('oid',x.oid::text,'name',x.polname,'command',x.polcmd::text,
      'permissive',x.polpermissive,'roles',to_jsonb(x.polroles),'using',pg_get_expr(x.polqual,x.polrelid),
      'check',pg_get_expr(x.polwithcheck,x.polrelid)) order by x.oid),'[]'::jsonb) from pg_policy x where x.polrelid=c.oid),
    'triggers',(select coalesce(jsonb_agg(jsonb_build_object('oid',x.oid::text,'name',x.tgname,'functionOid',x.tgfoid::text,
      'enabled',x.tgenabled::text,'internal',x.tgisinternal,'type',x.tgtype,'arguments',encode(x.tgargs,'hex'),
      'source',(select jsonb_build_object('args',oidvectortypes(f.proargtypes),'sha256',encode(sha256(convert_to(f.prosrc,'UTF8')),'hex'),
        'config',to_jsonb(f.proconfig),'definer',f.prosecdef,'volatility',f.provolatile::text,'result',format_type(f.prorettype,null),
        'language',(select lanname from pg_language where oid=f.prolang)) from pg_proc f where f.oid=x.tgfoid),
      'definition',pg_get_triggerdef(x.oid,false)) order by x.oid),'[]'::jsonb) from pg_trigger x where x.tgrelid=c.oid),
    'parents',(select coalesce(jsonb_agg(i.inhparent::text order by i.inhseqno),'[]'::jsonb) from pg_inherits i where i.inhrelid=c.oid))
    order by c.relname collate "C") into answer from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any(array['helmut_store','helmut_auth_state_nodes_local','llm_usage','briefings','profiles']);
  if jsonb_array_length(answer) is distinct from 5 or exists(select from jsonb_array_elements(answer) x
    where x->>'kind'<>'r' or x->>'persistence'<>'p' or x->>'partition'<>'false' or x->'parents'<>'[]'::jsonb) then
    raise exception 'original-bridge-actual-original-relations';end if;
  return answer;
end;$f$;

-- Fixed kind-to-table mapping and original public ID formulas. No caller can
-- choose a table, original row ID, private operation or unbound output owner.
create function helmut_unit_diagnostic.original_bridge_row_v1(s text,kind text,logical_id text,body jsonb) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare a helmut_unit_diagnostic.authority%rowtype; c jsonb; owner_id text; day text; run_id text; expected_id text; slot_name text; phase text;
begin
  select * into strict a from helmut_unit_diagnostic.authority where scope_hash=s;c:=a.command_canonical::jsonb;
  if a.operation_id is distinct from 'localUnitDiagnostic-'||right(current_database(),32) or kind is null or logical_id is null
    or jsonb_typeof(body) is distinct from 'object' then raise exception 'original-bridge-original-row-scope';end if;
  owner_id:=c#>>'{units,0,subject}';day:=c#>>'{calendar,executionDayUTC}';run_id:=c#>>'{slot,plan,runId}';
  if kind in ('immutable-D','evidence') then
    if kind='immutable-D' then
      if logical_id is distinct from c#>>'{slot,plan,intents,0,id}' then raise exception 'original-bridge-private-D-intent';end if;
      expected_id:='local-unit-diagnostic-'||a.operation_id||'-immutable-D-'||logical_id;
    else
      if logical_id is distinct from 'diagnostic-result' or body->>'schema' is distinct from 'helmut-local-unit-diagnostic-evidence/1'
        or body->>'operationId' is distinct from a.operation_id or body->>'commandHash' is distinct from s then raise exception 'original-bridge-private-evidence-scope';end if;
      expected_id:='local-unit-diagnostic-'||a.operation_id||'-evidence-0';
    end if;
    return jsonb_build_object('table','helmut_store','id',expected_id,'body',jsonb_build_object('id',expected_id,'data',body));
  end if;
  if kind in ('draft','review') then
    phase:=case when kind='draft' then 'entwurf' else 'pruefung' end;slot_name:='lage-pruefentwurf';
    expected_id:='bf-'||owner_id||'-lage-pruefentwurf-'||day||'-'||run_id||'-'||phase;
    if body#>>'{payload,phase}' is distinct from phase or body#>>'{payload,runId}' is distinct from run_id
      or body#>>'{payload,tag}' is distinct from day or body#>'{payload,auslieferbar}' is distinct from 'false'::jsonb
      or body#>'{payload,qualitaetBestanden}' is distinct from 'false'::jsonb then raise exception 'original-bridge-original-draft-body';end if;
  elsif kind in ('lage','mandatsbriefing','morgenbriefing') then
    slot_name:=case when kind='morgenbriefing' then 'morgenlage' else kind end;
    expected_id:='bf-'||owner_id||'-'||slot_name||'-'||day;
  else raise exception 'original-bridge-seven-original-row-kinds';end if;
  if not helmut_unit_diagnostic.exact(body,array['id','user_id','slot','generated_at','payload'])
    or body->>'id' is distinct from expected_id or logical_id is distinct from expected_id or body->>'user_id' is distinct from owner_id
    or body->>'slot' is distinct from slot_name or jsonb_typeof(body->'payload') is distinct from 'object'
    or helmut_unit_diagnostic.utc(body->'generated_at')<helmut_unit_diagnostic.utc(c#>'{slot,plan,startsAtUTC}')
    or helmut_unit_diagnostic.utc(body->'generated_at')>=helmut_unit_diagnostic.utc(c#>'{slot,plan,endsAtUTC}')
    or left(body->>'generated_at',10) is distinct from day then raise exception 'original-bridge-original-briefing-body';end if;
  return jsonb_build_object('table','briefings','id',expected_id,'body',body);
end;$f$;

-- Retained/closed state requires actual original rows as well as immutable own
-- artifacts and full native controls. A failed evidence row never qualifies.
create function helmut_unit_diagnostic.original_bridge_result_v1(s text,next_own jsonb) returns void
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare a helmut_unit_diagnostic.authority%rowtype; k text; result jsonb; x record; row_dto jsonb; actual_body jsonb; actual_time timestamptz; evidence jsonb; position_row jsonb;
begin
  select * into strict a from helmut_unit_diagnostic.authority where scope_hash=s;k:='localUnitDiagnostic:'||right(a.operation_id,32)||':';
  result:=next_own->(k||'result');
  if result->>'state'='pending' then return;end if;
  if result->>'state' is distinct from 'retained-unreviewed' then raise exception 'original-bridge-final-result-state';end if;
  perform helmut_unit_diagnostic.validate_state(s,next_own);
  select body into strict evidence from helmut_unit_diagnostic.artifacts where scope_hash=s and kind='evidence' and body_hash=result->>'evidenceHash';
  if evidence?'failure' then raise exception 'original-bridge-no-failure-final-result';end if;
  perform helmut_unit_diagnostic.verify_controls(evidence->'verification',s,next_own#>>array[k||'journal','claimId']);
  if evidence->>'schema' is distinct from 'helmut-local-unit-diagnostic-evidence/1' or evidence->>'operationId' is distinct from a.operation_id
    or evidence->>'commandHash' is distinct from s or evidence->'sourceIndex' is distinct from '499'::jsonb
    or evidence->'diagnosticUnit' is distinct from '0'::jsonb or evidence->'production' is distinct from 'false'::jsonb
    or evidence->'full500Accepted' is distinct from 'false'::jsonb or evidence->'independentFinalAcceptance' is distinct from 'false'::jsonb
    or evidence#>'{result,available}' is distinct from 'true'::jsonb
    or evidence#>'{result,fromCache}'='true'::jsonb or jsonb_typeof(evidence->'positions') is distinct from 'array'
    or jsonb_array_length(evidence->'positions')<>3
    or (select count(distinct value->>'bereich') from jsonb_array_elements(evidence->'positions'))<>3 then
    raise exception 'original-bridge-success-evidence-three-positions';end if;
  for position_row in select value from jsonb_array_elements(evidence->'positions') loop
    if not helmut_unit_diagnostic.exact(position_row,array['mandatsId','bereich','status','row','ergebnisHash','fachstatus'])
      or position_row->>'bereich' not in ('lage','mandatsbriefing','morgenbriefing')
      or position_row->>'mandatsId' is distinct from a.command_canonical::jsonb#>>'{units,0,subject}'
      or position_row->>'status' is distinct from 'stored-unreviewed' or position_row->>'fachstatus' is distinct from 'ausstehend'
      or not exists(select from helmut_unit_diagnostic.artifacts artifact_row where artifact_row.scope_hash=s and artifact_row.kind=position_row->>'bereich'
        and artifact_row.body=position_row->'row' and artifact_row.body_hash=position_row->>'ergebnisHash')
      or not exists(select from jsonb_array_elements(result->'positions') p where p->>'bereich'=position_row->>'bereich'
        and p->>'owner'=position_row->>'mandatsId' and p->>'hash'=position_row->>'ergebnisHash') then
      raise exception 'original-bridge-success-evidence-position_row-row';end if;
  end loop;
  if (select count(*) from helmut_unit_diagnostic.artifacts where scope_hash=s and kind in
    ('draft','immutable-D','review','lage','mandatsbriefing','morgenbriefing','evidence'))<>7 then raise exception 'original-bridge-seven-original-results-required';end if;
  for x in select * from helmut_unit_diagnostic.artifacts where scope_hash=s and kind in
    ('draft','immutable-D','review','lage','mandatsbriefing','morgenbriefing','evidence') loop
    if x.body is distinct from x.canonical_text::jsonb or encode(sha256(convert_to(x.canonical_text,'UTF8')),'hex') is distinct from x.body_hash then
      raise exception 'original-bridge-final-actual-artifact-hash';end if;
    row_dto:=helmut_unit_diagnostic.original_bridge_row_v1(s,x.kind,x.logical_id,x.body);
    if row_dto->>'table'='briefings' then
      select jsonb_build_object('id',t.id,'user_id',t.user_id,'slot',t.slot,
        'generated_at',to_char(t.generated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'payload',t.payload),t.generated_at
        into strict actual_body,actual_time from public.briefings t where t.id=row_dto->>'id';
      if actual_time is distinct from helmut_unit_diagnostic.utc(x.body->'generated_at') then raise exception 'original-bridge-final-native-time';end if;
    else
      select jsonb_build_object('id',t.id,'data',t.data) into strict actual_body from public.helmut_store t where t.id=row_dto->>'id';
    end if;
    if actual_body is distinct from row_dto->'body' then raise exception 'original-bridge-final-original-row-readback';end if;
  end loop;
end;$f$;

-- A name, JSON value or session GUC is never a receipt. Only the fresh private
-- Root-created temporary relations, immutable arguments, role-separated INSERT
-- policies and an actual main-auth tuple written by this backend transaction
-- can bind the current original ACK to the following runtime mutation.
create function helmut_unit_diagnostic.original_bridge_receipt_v1(p_scope text,p_claim_hash text,p_mode text,p_old_hash text,p_old_revision bigint,p_canonical text,p_hash text,p_kind text,p_logical_id text,p_parent_hash text) returns void
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare args_oid oid; results_oid oid; temp_oid oid; root_oid oid; writer_oid oid; runtime_oid oid; schema_acl aclitem[];
  db text:=current_database(); suffix text:=right(db,32); writer text:='helmut_ud_bridge_writer_'||suffix;
  runtime_name text:='helmut_ud_runtime_'||suffix; expected_acl jsonb; actual_acl jsonb; rel record; target oid;
  request_text text; request_hash text; q jsonb; r jsonb; c jsonb; n text; receipt_pid integer; receipt_tx xid8; ack jsonb;
  backend_tx xid8; auth_data jsonb; auth_xmin text; auth_state jsonb; auth_usage jsonb; actual_own jsonb; next_own jsonb;
  own_row helmut_unit_diagnostic.state%rowtype; s jsonb; proc record; native_oids oid[]; expected_oids oid[]; prefix text; usage_row record;
  receipt_phase text:=case when p_mode='artifact' then 'originalRowAck' else 'authAck' end; row_dto jsonb; actual_body jsonb; original_xmin text;
  actual_time timestamptz; actual_meta jsonb; row_ack jsonb;
begin
  perform helmut_unit_diagnostic.runtime_role();
  if db!~'^helmut_unit_diagnostic_[a-f0-9]{32}$' or session_user<>'helmut_ud_authenticator_'||suffix
    or current_user<>runtime_name or p_mode is null or p_mode not in ('state','usage','artifact')
    or p_scope is null or p_scope!~'^[a-f0-9]{64}$' or p_claim_hash is null or p_claim_hash!~'^[a-f0-9]{64}$'
    or p_old_hash is null or p_old_hash!~'^[a-f0-9]{64}$' or p_old_revision is null or p_old_revision<0
    or p_hash is null or p_hash!~'^[a-f0-9]{64}$' or p_canonical is null or octet_length(p_canonical)>4194304
    or encode(sha256(convert_to(p_canonical,'UTF8')),'hex')<>p_hash then raise exception 'original-bridge-receipt-input';end if;
  select oid into strict root_oid from pg_roles where rolname='postgres' and rolsuper;
  select oid into strict writer_oid from pg_roles where rolname=writer and not(rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolinherit or rolcanlogin or rolreplication);
  select oid into strict runtime_oid from pg_roles where rolname=runtime_name;
  temp_oid:=pg_my_temp_schema();args_oid:=to_regclass('pg_temp.original_bridge_args');results_oid:=to_regclass('pg_temp.original_bridge_results');
  if temp_oid=0 or args_oid is null or results_oid is null or args_oid=results_oid
    or not exists(select from pg_namespace where oid=temp_oid and nspname~'^pg_temp_[0-9]+$' and nspowner=root_oid)
    or (select count(*) from pg_class where relnamespace=temp_oid and relkind in ('r','p','v','m','f','S'))<>2 then
    raise exception 'original-bridge-root-temp-relations-required';end if;
  select nspacl into schema_acl from pg_namespace where oid=temp_oid;
  select jsonb_agg(jsonb_build_array(grantor,grantee,privilege_type,is_grantable) order by grantor,grantee,privilege_type,is_grantable)
    into actual_acl from aclexplode(coalesce(schema_acl,acldefault('n',root_oid)));
  select jsonb_agg(jsonb_build_array(grantor,grantee,privilege_type,is_grantable) order by grantor,grantee,privilege_type,is_grantable)
    into expected_acl from (select * from aclexplode(acldefault('n',root_oid)) union all
      select root_oid,writer_oid,'USAGE',false union all select root_oid,runtime_oid,'USAGE',false) x;
  if actual_acl is distinct from expected_acl then raise exception 'original-bridge-temp-schema-acl';end if;
  foreach target in array array[args_oid,results_oid] loop
    select * into strict rel from pg_class where oid=target;
    if rel.relnamespace<>temp_oid or rel.relowner<>root_oid or rel.relkind<>'r' or rel.relpersistence<>'t' or rel.relispartition
      or exists(select from pg_inherits where inhrelid=target or inhparent=target)
      or exists(select from pg_trigger where tgrelid=target and not tgisinternal)
      or exists(select from pg_rewrite where ev_class=target)
      or exists(select from pg_attrdef where adrelid=target) then raise exception 'original-bridge-temp-relation-identity';end if;
    if target=args_oid then
      if rel.relrowsecurity or rel.relforcerowsecurity
        or (select count(*) from pg_attribute where attrelid=target and attnum>0)<>6
        or (select array_agg(attname::text order by attnum) from pg_attribute where attrelid=target and attnum>0)
          is distinct from array['request_text','request_hash','qualification','nonce','backend_pid','transaction_id']
        or (select array_agg(format_type(atttypid,atttypmod) order by attnum) from pg_attribute where attrelid=target and attnum>0)
          is distinct from array['text','text','jsonb','text','integer','xid8']
        or exists(select from pg_constraint where conrelid=target) then raise exception 'original-bridge-temp-args-shape';end if;
    else
      if not rel.relrowsecurity or not rel.relforcerowsecurity
        or (select count(*) from pg_attribute where attrelid=target and attnum>0)<>2
        or (select array_agg(attname::text order by attnum) from pg_attribute where attrelid=target and attnum>0) is distinct from array['phase','value']
        or (select array_agg(format_type(atttypid,atttypmod) order by attnum) from pg_attribute where attrelid=target and attnum>0) is distinct from array['text','jsonb']
        or (select count(*) from pg_constraint where conrelid=target)<>1
        or not exists(select from pg_constraint where conrelid=target and contype='p' and conkey=array[1]::smallint[] and not condeferrable and not condeferred and convalidated)
        or (select count(*) from pg_policy where polrelid=target)<>3
        or not exists(select from pg_policy where polrelid=target and polname='original_bridge_read' and polcmd='r' and polpermissive
          and cardinality(polroles)=2 and polroles@>array[writer_oid,runtime_oid] and pg_get_expr(polqual,polrelid)='true' and polwithcheck is null)
        or not exists(select from pg_policy where polrelid=target and polname='original_bridge_auth_insert' and polcmd='a' and polpermissive
          and polroles=array[writer_oid] and polqual is null and pg_get_expr(polwithcheck,polrelid)=case when p_mode='artifact' then '(phase = ''originalRowAck''::text)' else '(phase = ''authAck''::text)' end)
        or not exists(select from pg_policy where polrelid=target and polname='original_bridge_own_insert' and polcmd='a' and polpermissive
          and polroles=array[runtime_oid] and polqual is null and pg_get_expr(polwithcheck,polrelid)='(phase = ''ownAck''::text)') then
        raise exception 'original-bridge-temp-results-policy-shape';end if;
    end if;
    if exists(select from pg_attribute where attrelid=target and attnum>0 and (attisdropped or not attnotnull or attacl is not null or attidentity<>'' or attgenerated<>'')) then
      raise exception 'original-bridge-temp-column-acl-or-shape';end if;
    select jsonb_agg(jsonb_build_array(grantor,grantee,privilege_type,is_grantable) order by grantor,grantee,privilege_type,is_grantable)
      into actual_acl from aclexplode(coalesce(rel.relacl,acldefault('r',root_oid)));
    select jsonb_agg(jsonb_build_array(grantor,grantee,privilege_type,is_grantable) order by grantor,grantee,privilege_type,is_grantable)
      into expected_acl from (select * from aclexplode(acldefault('r',root_oid)) union all
        select root_oid,writer_oid,'SELECT',false union all select root_oid,runtime_oid,'SELECT',false union all
        select root_oid,writer_oid,'INSERT',false where target=results_oid union all
        select root_oid,runtime_oid,'INSERT',false where target=results_oid) x;
    if actual_acl is distinct from expected_acl then raise exception 'original-bridge-temp-table-acl';end if;
  end loop;
  if (select count(*) from pg_temp.original_bridge_args)<>1 or (select count(*) from pg_temp.original_bridge_results)<>1
    or not exists(select from pg_temp.original_bridge_results where phase=receipt_phase) then raise exception 'original-bridge-pre-own-receipt-count';end if;
  select a.request_text,a.request_hash,a.qualification,a.nonce,a.backend_pid,a.transaction_id
    into strict request_text,request_hash,q,n,receipt_pid,receipt_tx from pg_temp.original_bridge_args a;
  backend_tx:=pg_current_xact_id_if_assigned();
  if receipt_pid<>pg_backend_pid() or backend_tx is null or receipt_tx is distinct from backend_tx
    or octet_length(request_text)>37748736 or encode(sha256(convert_to(request_text,'UTF8')),'hex') is distinct from request_hash
    or n is null or n!~'^[a-f0-9]{64}$' then raise exception 'original-bridge-receipt-backend-transaction-or-bytes';end if;
  r:=request_text::jsonb;c:=r->'originalCAS';next_own:=(r#>>'{ownNext,canonical}')::jsonb;prefix:='localUnitDiagnostic:'||suffix||':';
  if not helmut_unit_diagnostic.exact(r,array['schema','mode','operationId','commandHash','claimId','originalCAS','ownBefore','ownNext','artifact'])
    or r->>'schema' is distinct from 'helmut-local-unit-original-write/1' or r->>'operationId' is distinct from 'localUnitDiagnostic-'||suffix
    or r->>'commandHash' is distinct from p_scope or r->>'mode' is distinct from p_mode
    or encode(sha256(convert_to(r->>'claimId','UTF8')),'hex') is distinct from p_claim_hash
    or r#>>'{ownBefore,hash}' is distinct from p_old_hash or r#>>'{ownBefore,revision}' is distinct from p_old_revision::text
    or (p_mode<>'artifact' and (not helmut_unit_diagnostic.exact(c,array['id','expectedRevision','expectedProof','expectedState','revision','root','nodes','additions'])
      or c->>'id' is distinct from 'main-auth' or c->>'revision' is not distinct from c->>'expectedRevision'))
    or (p_mode='artifact' and c is distinct from 'null'::jsonb)
    or encode(sha256(convert_to(r#>>'{ownNext,canonical}','UTF8')),'hex') is distinct from r#>>'{ownNext,hash}'
    or not helmut_unit_diagnostic.exact(q,array['schema','database','operationId','commandHash','originalSources','helperSources','nativeSources','originalRelations'])
    or q->>'schema' is distinct from 'helmut-local-unit-original-bridge-qualification/1'
    or q->>'database' is distinct from db or q->>'operationId' is distinct from r->>'operationId' or q->>'commandHash' is distinct from p_scope then
    raise exception 'original-bridge-receipt-dto-scope';end if;
  for s in select value from jsonb_array_elements(q->'originalSources') union all select value from jsonb_array_elements(q->'nativeSources') loop
    select p0.*,ns.nspname,l.lanname into strict proc from pg_proc p0 join pg_namespace ns on ns.oid=p0.pronamespace
      join pg_language l on l.oid=p0.prolang where p0.oid=(s->>'oid')::oid;
    if proc.nspname||'.'||proc.proname is distinct from s->>'name' or oidvectortypes(proc.proargtypes) is distinct from s->>'identityArguments'
      or encode(sha256(convert_to(proc.prosrc,'UTF8')),'hex') is distinct from s->>'prosrcSHA256' or proc.prosecdef
      or to_jsonb(proc.proconfig) is distinct from nullif(s->'config','null'::jsonb) or proc.provolatile::text is distinct from s->>'volatility'
      or format_type(proc.prorettype,null) is distinct from s->>'returnType' or proc.lanname is distinct from s->>'language' then
      raise exception 'original-bridge-receipt-actual-source';end if;
  end loop;
  select array_agg((value->>'oid')::oid order by (value->>'oid')::oid) into expected_oids from jsonb_array_elements(q->'nativeSources');
  select array_agg(p.oid order by p.oid) into native_oids from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='helmut_unit_diagnostic'
    or (ns.nspname='public' and p.proname=any(array['local_unit_diagnostic_contract_v1','local_unit_diagnostic_authority_read_v1',
      'local_unit_diagnostic_runtime_read_v1','local_unit_diagnostic_state_read_v1','local_unit_diagnostic_state_cas_v1',
      'local_unit_diagnostic_artifact_insert_v1','local_unit_diagnostic_artifact_read_v1','local_unit_diagnostic_lease_acquire_v1','local_unit_diagnostic_lease_release_v1']));
  if native_oids is distinct from expected_oids or exists(select from pg_trigger t where not t.tgisinternal and t.tgrelid in
    ('public.helmut_store'::regclass,'public.helmut_auth_state_nodes_local'::regclass,'public.llm_usage'::regclass,'public.briefings'::regclass)
    and not exists(select from jsonb_array_elements(q->'originalSources') sp where (sp->>'oid')::oid=t.tgfoid)) then
    raise exception 'original-bridge-receipt-complete-sources';end if;
  if helmut_unit_diagnostic.original_bridge_relations_v1() is distinct from q->'originalRelations' then
    raise exception 'original-bridge-receipt-native-relations-changed';end if;
  select value into strict ack from pg_temp.original_bridge_results where phase=receipt_phase;
  if p_mode='artifact' then
    select * into strict own_row from helmut_unit_diagnostic.state where scope_hash=p_scope;
    if own_row.body_hash is distinct from p_old_hash or own_row.revision<>p_old_revision
      or own_row.body is distinct from next_own or own_row.body_hash is distinct from r#>>'{ownNext,hash}'
      or own_row.canonical_text is distinct from r#>>'{ownNext,canonical}'
      or own_row.body#>>array[prefix||'journal','claimId'] is distinct from r->>'claimId'
      or p_canonical is distinct from r#>>'{artifact,canonical}' or p_hash is distinct from r#>>'{artifact,sha256}'
      or p_kind is distinct from r#>>'{artifact,kind}' or p_logical_id is distinct from r#>>'{artifact,logicalId}'
      or p_parent_hash is distinct from r#>>'{artifact,parentHash}' then raise exception 'original-bridge-artifact-receipt-scope';end if;
    row_dto:=helmut_unit_diagnostic.original_bridge_row_v1(p_scope,p_kind,p_logical_id,p_canonical::jsonb);
    if row_dto->>'table'='briefings' then
      select jsonb_build_object('id',t.id,'user_id',t.user_id,'slot',t.slot,
        'generated_at',to_char(t.generated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'payload',t.payload),t.generated_at,t.xmin::text
        into strict actual_body,actual_time,original_xmin from public.briefings t where t.id=row_dto->>'id';
      if actual_time is distinct from helmut_unit_diagnostic.utc(p_canonical::jsonb->'generated_at') then raise exception 'original-bridge-artifact-native-time';end if;
    else
      select jsonb_build_object('id',t.id,'data',t.data),t.xmin::text into strict actual_body,original_xmin from public.helmut_store t where t.id=row_dto->>'id';
    end if;
    if actual_body is distinct from row_dto->'body' or original_xmin is distinct from mod(backend_tx::text::numeric,4294967296)::text
      or not helmut_unit_diagnostic.exact(ack,array['ack','authBefore','authAfter','originalXmin'])
      or ack->>'originalXmin' is distinct from original_xmin then raise exception 'original-bridge-artifact-real-original-row';end if;
    row_ack:=ack->'ack';
    if not helmut_unit_diagnostic.exact(row_ack,array['version','scopeHash','kind','id','hash','stateRevision','nonce'])
      or row_ack->>'version' is distinct from 'helmut-local-unit-diagnostic-original-row-ack/1'
      or row_ack->>'scopeHash' is distinct from p_scope or row_ack->>'kind' is distinct from p_kind or row_ack->>'id' is distinct from row_dto->>'id'
      or row_ack->>'hash' is distinct from p_hash or row_ack->>'stateRevision' is distinct from p_old_revision::text
      or row_ack->>'nonce' is distinct from n then raise exception 'original-bridge-artifact-original-row-ack';end if;
    select data,xmin::text into strict auth_data,auth_xmin from public.helmut_store where id='main-auth';
    auth_state:=public.helmut_auth_state_assert_root_local_v1(auth_data);auth_usage:=public.helmut_auth_usage_checked_proof_local_v1('main-auth');
    actual_meta:=jsonb_build_object('revision',auth_data->>'_authStoreRevision','state',auth_state,'proof',auth_usage->'proof','xmin',auth_xmin);
    if actual_meta is distinct from ack->'authBefore' or actual_meta is distinct from ack->'authAfter'
      or auth_usage->>'revision' is distinct from auth_data->>'_authStoreRevision'
      or helmut_unit_diagnostic.original_bridge_own_projection_v1('main-auth',auth_state->>'generation',auth_state->>'root',r->>'operationId') is distinct from own_row.body then
      raise exception 'original-bridge-artifact-main-auth-must-be-unchanged';end if;
    return;
  end if;
  select data,xmin::text into strict auth_data,auth_xmin from public.helmut_store where id='main-auth';
  if auth_xmin is distinct from mod(backend_tx::text::numeric,4294967296)::text then raise exception 'original-bridge-auth-not-written-in-this-transaction';end if;
  auth_state:=public.helmut_auth_state_assert_root_local_v1(auth_data);auth_usage:=public.helmut_auth_usage_checked_proof_local_v1('main-auth');
  if jsonb_typeof(ack) is distinct from 'array' or jsonb_array_length(ack)<>1
    or not helmut_unit_diagnostic.exact(ack->0,array['id','revision','proof','state']) or ack#>>'{0,id}' is distinct from 'main-auth'
    or ack#>>'{0,revision}' is distinct from c->>'revision' or auth_data->>'_authStoreRevision' is distinct from c->>'revision'
    or auth_state is distinct from ack#>'{0,state}' or auth_state is distinct from ((c->'expectedState')||jsonb_build_object('root',c->>'root'))
    or auth_usage->'proof' is distinct from ack#>'{0,proof}' or auth_usage->>'revision' is distinct from c->>'revision'
    or ack#>>'{0,proof,generation}' is distinct from c#>>'{expectedProof,generation}'
    or ack#>>'{0,proof,originalHash}' is distinct from c#>>'{expectedProof,originalHash}'
    or (ack#>>'{0,proof,count}')::bigint is distinct from (c#>>'{expectedProof,count}')::bigint+jsonb_array_length(c->'additions') then
    raise exception 'original-bridge-receipt-real-original-ack';end if;
  select * into strict own_row from helmut_unit_diagnostic.state where scope_hash=p_scope;
  if own_row.body_hash is distinct from p_old_hash or own_row.revision is distinct from p_old_revision
    or own_row.body is distinct from own_row.canonical_text::jsonb
    or encode(sha256(convert_to(own_row.canonical_text,'UTF8')),'hex') is distinct from own_row.body_hash then raise exception 'original-bridge-receipt-real-own-before';end if;
  actual_own:=helmut_unit_diagnostic.original_bridge_compare_delta_v1('main-auth',auth_state->>'generation',
    c#>>'{expectedState,root}',auth_state->>'root',r->>'operationId',next_own,own_row.body);
  if actual_own is distinct from next_own or next_own#>>array[prefix||'journal','claimId'] is distinct from r->>'claimId' then
    raise exception 'original-bridge-receipt-real-own-projection';end if;
  if p_mode='state' then
    -- State includes normal mutations, exact terminal stop and the final CAS.
    -- The unchanged state trigger validates the transition; retained/closed
    -- results additionally require all seven actual rows and sixteen controls.
    perform helmut_unit_diagnostic.original_bridge_result_v1(p_scope,next_own);
    if p_canonical is distinct from r#>>'{ownNext,canonical}' or p_hash is distinct from r#>>'{ownNext,hash}'
      or p_kind is not null or p_logical_id is not null or p_parent_hash is not null or c->'additions' is distinct from '[]'::jsonb
      or next_own is not distinct from own_row.body or ack#>>'{0,proof,head}' is distinct from c#>>'{expectedProof,head}' then
      raise exception 'original-bridge-receipt-state-mutation';end if;
  else
    -- Usage still cannot introduce a retained result or close the unit.
    if next_own#>>array[prefix||'journal','state']='closed'
      or next_own->(prefix||'result') is distinct from '{"state":"pending","evidenceHash":null,"positions":[]}'::jsonb
      or p_canonical is distinct from r#>>'{artifact,canonical}' or p_hash is distinct from r#>>'{artifact,sha256}'
      or r#>>'{ownNext,hash}' is distinct from p_old_hash or r#>>'{ownNext,canonical}' is distinct from own_row.canonical_text
      or p_kind is distinct from r#>>'{artifact,kind}' or p_kind not in ('usage-D','usage-R') or p_logical_id is distinct from r#>>'{artifact,logicalId}'
      or p_parent_hash is not null or r#>'{artifact,parentHash}' is distinct from 'null'::jsonb or jsonb_array_length(c->'additions')<>1
      or c#>'{additions,0}' is distinct from p_canonical::jsonb or next_own is distinct from own_row.body
      or c->>'root' is distinct from c#>>'{expectedState,root}' or c->'nodes' is distinct from '[]'::jsonb
      or ack#>>'{0,proof,head}' is not distinct from c#>>'{expectedProof,head}' then raise exception 'original-bridge-receipt-usage-mutation';end if;
    select t.*,t.xmin::text as native_xmin into strict usage_row from public.llm_usage t where t.usage_store_id='main-auth'
      and t.usage_generation=c#>>'{expectedProof,generation}' and t.usage_ordinal=(c#>>'{expectedProof,count}')::bigint+1;
    if usage_row.native_xmin is distinct from mod(backend_tx::text::numeric,4294967296)::text
      or usage_row.id is distinct from c#>>'{additions,0,id}' or usage_row.usage_record is distinct from p_canonical::jsonb
      or usage_row.usage_prev_hash is distinct from c#>>'{expectedProof,head}' or usage_row.usage_chain_hash is distinct from ack#>>'{0,proof,head}' then
      raise exception 'original-bridge-receipt-exact-usage-row';end if;
  end if;
end;$f$;

revoke all on function helmut_unit_diagnostic.original_bridge_relations_v1() from public;
revoke all on function helmut_unit_diagnostic.original_bridge_row_v1(text,text,text,jsonb) from public;
revoke all on function helmut_unit_diagnostic.original_bridge_result_v1(text,jsonb) from public;
revoke all on function helmut_unit_diagnostic.original_bridge_top_map_v1(text,text,text) from public;
revoke all on function helmut_unit_diagnostic.original_bridge_value_v1(text,text,text,jsonb,boolean) from public;
revoke all on function helmut_unit_diagnostic.original_bridge_own_projection_v1(text,text,text,text) from public;
revoke all on function helmut_unit_diagnostic.original_bridge_compare_delta_v1(text,text,text,text,text,jsonb,jsonb) from public;
revoke all on function helmut_unit_diagnostic.original_bridge_compare_seed_v1(text,text,text,text,text,jsonb) from public;
revoke all on function helmut_unit_diagnostic.original_bridge_receipt_v1(text,text,text,text,bigint,text,text,text,text,text) from public;
reset role;

do $grants$
declare q jsonb:=current_setting('helmut.local_unit_original_bridge_install')::jsonb;
  suffix text:=right(current_database(),32); writer text:='helmut_ud_bridge_writer_'||suffix;
  runtime_name text:='helmut_ud_runtime_'||suffix; r jsonb; p oid; seq oid; seq_count integer; scope text:=q->>'commandHash';
begin
  execute format('grant usage on schema public,helmut_unit_diagnostic to %I',writer);
  -- PostgreSQL column ACLs also cover xmin. Preserve the narrow user-column
  -- grants: the artifact consumer needs xmin, not table-wide SELECT.
  execute format('grant select(id,data,xmin),update(data) on public.helmut_store to %I',writer);
  execute format('grant select,insert(store_id,generation,payload) on public.helmut_auth_state_nodes_local to %I',writer);
  execute format('grant select,insert(id,created_at,tenant_id,profile_id,run_id,pipeline_step,politician_id,user_id,model,call_type,prompt_tokens,completion_tokens,total_tokens,estimated_cost,duration_ms,success,error,usage_store_id,usage_generation,usage_ordinal,usage_record,usage_prev_hash) on public.llm_usage to %I',writer);
  select count(*),min(s.oid::bigint)::oid into seq_count,seq from pg_class s join pg_depend d on d.objid=s.oid and d.deptype='i'
    and d.classid='pg_class'::regclass and d.refclassid='pg_class'::regclass
    join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid
    where s.relkind='S' and a.attrelid='public.helmut_auth_state_nodes_local'::regclass and a.attname='node_seq';
  if seq_count<>1 then raise exception 'original-bridge-exact-node-identity-sequence';end if;
  execute format('grant usage on sequence %s to %I',seq::regclass,writer);
  for r in select value from jsonb_array_elements(q->'originalSources') loop
    p:=(r->>'oid')::oid;execute format('grant execute on function %s to %I',p::regprocedure,writer);
  end loop;
  for p in select f.oid from pg_proc f join pg_namespace n on n.oid=f.pronamespace
    where n.nspname='helmut_unit_diagnostic' and f.proname in ('original_bridge_top_map_v1','original_bridge_value_v1',
      'original_bridge_own_projection_v1','original_bridge_compare_delta_v1','original_bridge_receipt_v1',
      'original_bridge_relations_v1','original_bridge_row_v1','original_bridge_result_v1','exact','utc') loop
    execute format('grant execute on function %s to %I,%I',p::regprocedure,writer,runtime_name);
  end loop;
  execute format('grant execute on function helmut_unit_diagnostic.original_bridge_compare_seed_v1(text,text,text,text,text,jsonb) to %I',writer);
  for p in select f.oid from pg_proc f join pg_namespace n on n.oid=f.pronamespace
    where n.nspname='helmut_unit_diagnostic' and f.proname in ('validate_state','verify_controls','verification_canonical','sha','parse','object_count') loop
    execute format('grant execute on function %s to %I',p::regprocedure,writer);
  end loop;
  execute format('grant select on helmut_unit_diagnostic.authority,helmut_unit_diagnostic.state,helmut_unit_diagnostic.artifacts to %I',writer);
  execute format('grant update(scope_hash) on helmut_unit_diagnostic.state to %I',writer);
  execute format('create policy original_bridge_auth_read on public.helmut_store for select to %I using(id=''main-auth'')',writer);
  execute format('create policy original_bridge_auth_write on public.helmut_store for update to %I using(id=''main-auth'') with check(id=''main-auth'')',writer);
  execute format('create policy original_bridge_nodes_read on public.helmut_auth_state_nodes_local for select to %I using(store_id=''main-auth'' and generation=(select data#>>''{_authStateRef,generation}'' from public.helmut_store where id=''main-auth''))',writer);
  execute format('create policy original_bridge_nodes_insert on public.helmut_auth_state_nodes_local for insert to %I with check(store_id=''main-auth'' and generation=(select data#>>''{_authStateRef,generation}'' from public.helmut_store where id=''main-auth''))',writer);
  execute format('create policy original_bridge_usage_read on public.llm_usage for select to %I using(usage_store_id=''main-auth'' and usage_generation=(select data#>>''{_llmUsageRef,generation}'' from public.helmut_store where id=''main-auth''))',writer);
  execute format('create policy original_bridge_usage_insert on public.llm_usage for insert to %I with check(usage_store_id=''main-auth'' and usage_generation=(select data#>>''{_llmUsageRef,generation}'' from public.helmut_store where id=''main-auth'') and usage_record->>''scopeHash''=%L)',writer,scope);
  execute format('create policy original_bridge_authority_read on helmut_unit_diagnostic.authority for select to %I using(scope_hash=%L)',writer,scope);
  execute format('create policy original_bridge_state_read on helmut_unit_diagnostic.state for select to %I using(scope_hash=%L)',writer,scope);
  execute format('create policy original_bridge_state_lock on helmut_unit_diagnostic.state for update to %I using(scope_hash=%L) with check(false)',writer,scope);
  execute format('create policy original_bridge_artifacts_read on helmut_unit_diagnostic.artifacts for select to %I using(scope_hash=%L)',writer,scope);
  execute format('grant select(id,user_id,slot,generated_at,payload,xmin),insert(id,user_id,slot,generated_at,payload) on public.briefings to %I',writer);
  execute format('grant insert(id,data) on public.helmut_store to %I',writer);
  execute format('grant select(id,data) on public.helmut_store to %I',runtime_name);
  -- The invoker receipt re-reads the original row after switching to runtime.
  -- It needs the same xmin witness, with no table SELECT or write privilege.
  execute format('grant select(id,user_id,slot,generated_at,payload,xmin) on public.briefings to %I',runtime_name);
  -- Fixed ID predicates depend on the genuine native authority, not a caller
  -- table or caller-selected original row. There is no UPDATE/DELETE grant.
  execute format($policy$create policy original_bridge_private_read on public.helmut_store for select to %I,%I using(exists(
    select from helmut_unit_diagnostic.authority a where a.scope_hash=%L and id=any(array[
      'local-unit-diagnostic-'||a.operation_id||'-immutable-D-'||(a.command_canonical::jsonb#>>'{slot,plan,intents,0,id}'),
      'local-unit-diagnostic-'||a.operation_id||'-evidence-0'])))$policy$,writer,runtime_name,scope);
  execute format($policy$create policy original_bridge_private_insert on public.helmut_store for insert to %I with check(exists(
    select from helmut_unit_diagnostic.authority a where a.scope_hash=%L and id=any(array[
      'local-unit-diagnostic-'||a.operation_id||'-immutable-D-'||(a.command_canonical::jsonb#>>'{slot,plan,intents,0,id}'),
      'local-unit-diagnostic-'||a.operation_id||'-evidence-0'])))$policy$,writer,scope);
  for p in select oid from pg_roles where rolname in(writer,runtime_name) loop
    execute format($policy$create policy original_bridge_briefings_read_%s on public.briefings for select to %I using(exists(
      select from helmut_unit_diagnostic.authority a where a.scope_hash=%L and user_id=a.command_canonical::jsonb#>>'{units,0,subject}'
      and id=any(array['bf-'||user_id||'-lage-'||(a.command_canonical::jsonb#>>'{calendar,executionDayUTC}'),
        'bf-'||user_id||'-mandatsbriefing-'||(a.command_canonical::jsonb#>>'{calendar,executionDayUTC}'),
        'bf-'||user_id||'-morgenlage-'||(a.command_canonical::jsonb#>>'{calendar,executionDayUTC}'),
        'bf-'||user_id||'-lage-pruefentwurf-'||(a.command_canonical::jsonb#>>'{calendar,executionDayUTC}')||'-'||(a.command_canonical::jsonb#>>'{slot,plan,runId}')||'-entwurf',
        'bf-'||user_id||'-lage-pruefentwurf-'||(a.command_canonical::jsonb#>>'{calendar,executionDayUTC}')||'-'||(a.command_canonical::jsonb#>>'{slot,plan,runId}')||'-pruefung'])))$policy$,
        p,(select rolname from pg_roles where oid=p),scope);
  end loop;
  execute format($policy$create policy original_bridge_briefings_insert on public.briefings for insert to %I with check(exists(
    select from helmut_unit_diagnostic.authority a where a.scope_hash=%L and user_id=a.command_canonical::jsonb#>>'{units,0,subject}'
      and id=any(array['bf-'||user_id||'-lage-'||(a.command_canonical::jsonb#>>'{calendar,executionDayUTC}'),
        'bf-'||user_id||'-mandatsbriefing-'||(a.command_canonical::jsonb#>>'{calendar,executionDayUTC}'),
        'bf-'||user_id||'-morgenlage-'||(a.command_canonical::jsonb#>>'{calendar,executionDayUTC}'),
        'bf-'||user_id||'-lage-pruefentwurf-'||(a.command_canonical::jsonb#>>'{calendar,executionDayUTC}')||'-'||(a.command_canonical::jsonb#>>'{slot,plan,runId}')||'-entwurf',
        'bf-'||user_id||'-lage-pruefentwurf-'||(a.command_canonical::jsonb#>>'{calendar,executionDayUTC}')||'-'||(a.command_canonical::jsonb#>>'{slot,plan,runId}')||'-pruefung'])))$policy$,writer,scope);
  -- No role membership, BYPASSRLS, ownership or legacy mutation reaches runtime.
  if exists(select from pg_auth_members where member=(select oid from pg_roles where rolname=runtime_name)
    or roleid=(select oid from pg_roles where rolname=writer)) then raise exception 'original-bridge-role-membership-forbidden';end if;
end;$grants$;
commit;
