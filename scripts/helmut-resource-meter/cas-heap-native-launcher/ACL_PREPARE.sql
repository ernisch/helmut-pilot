\set ON_ERROR_STOP on
\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off
\if :{?root_clone_receipt_sha256}
\else
  \set root_clone_receipt_sha256 MISSING_CLONE_ADMISSION
\endif
-- Clone-only observer permissions. Requires the freshly captured exact before state.
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='1s';
SELECT 1/coalesce((
 :'root_clone_receipt_sha256'~'^[a-f0-9]{64}$' AND current_user='postgres' AND session_user='postgres'
 AND inet_server_addr() IS NULL AND inet_client_addr() IS NULL
 AND current_database()='helmut_resource_fixture_20261020_3b3bf56650bc'
 AND (SELECT oid FROM pg_database WHERE datname=current_database())=18405
 AND current_setting('data_directory')='/disk/pgdata' AND current_setting('server_version_num')='170006'
 AND current_setting('server_encoding')='UTF8' AND current_setting('client_encoding')='UTF8'
 AND current_setting('helmut.local_usage_experiment',true)='on'
 AND current_setting('log_error_verbosity')='terse' AND current_setting('log_min_error_statement')='fatal'
 )::integer,0) AS observer_clone_guard
\gset
WITH target_role AS (SELECT * FROM pg_catalog.pg_roles WHERE rolname='service_role'),
view_row AS (SELECT c.*,n.nspname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE c.oid='pg_catalog.pg_backend_memory_contexts'::regclass),
function_row AS (SELECT p.*,l.lanname,n.nspname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.oid='pg_catalog.pg_get_backend_memory_contexts()'::regprocedure),
memberships AS (SELECT coalesce(jsonb_agg(jsonb_build_object('oid',oid,'roleid',roleid,'member',member,'grantor',grantor,
  'adminOption',admin_option,'inheritOption',inherit_option,'setOption',set_option) ORDER BY oid),'[]'::jsonb) value,
  count(*) AS count FROM pg_catalog.pg_auth_members),
columns AS (SELECT jsonb_agg(jsonb_build_object('number',attnum,'name',attname,'typeOID',atttypid,
  'typeModifier',atttypmod,'notNull',attnotnull) ORDER BY attnum) value,
  array_agg(attname::text ORDER BY attnum) names,array_agg(atttypid::integer ORDER BY attnum) types
  FROM pg_catalog.pg_attribute WHERE attrelid='pg_catalog.pg_backend_memory_contexts'::regclass AND attnum>0 AND NOT attisdropped),
object_state AS (SELECT jsonb_build_object(
 'view',jsonb_build_object('oid',v.oid,'schema',v.nspname,'schemaOID',v.relnamespace,
   'schemaOwnerOID',(SELECT nspowner FROM pg_namespace WHERE oid=v.relnamespace),
   'kind',v.relkind,'ownerOID',v.relowner,
   'definition',pg_get_viewdef(v.oid,true),'definitionSHA256',encode(sha256(convert_to(pg_get_viewdef(v.oid,true),'UTF8')),'hex'),
   'columns',c.value,'rawACL',v.relacl::text,
   'aclExpanded',(SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',a.ord,'grantor',x.grantor,'grantee',x.grantee,
       'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY a.ord,x.privilege_type COLLATE "C"),'[]'::jsonb)
     FROM unnest(v.relacl) WITH ORDINALITY a(item,ord) CROSS JOIN LATERAL aclexplode(ARRAY[a.item]) x),
   'effective',has_table_privilege(r.oid,v.oid,'SELECT')),
 'function',jsonb_build_object('oid',f.oid,'schema',f.nspname,'schemaOID',f.pronamespace,
   'schemaOwnerOID',(SELECT nspowner FROM pg_namespace WHERE oid=f.pronamespace),
   'ownerOID',f.proowner,'name',f.proname,
   'language',f.lanname,'languageOID',f.prolang,'argumentCount',f.pronargs,'argumentTypes',f.proargtypes::text,'allArgumentTypes',f.proallargtypes::text,
   'argumentModes',f.proargmodes::text,'argumentNames',f.proargnames::text,'returnType',f.prorettype,
   'setReturning',f.proretset,'securityDefiner',f.prosecdef,'volatility',f.provolatile,'config',f.proconfig::text,
   'source',f.prosrc,'sourceSHA256',encode(sha256(convert_to(f.prosrc,'UTF8')),'hex'),'rawACL',f.proacl::text,
   'aclExpanded',(SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',a.ord,'grantor',x.grantor,'grantee',x.grantee,
       'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY a.ord,x.privilege_type COLLATE "C"),'[]'::jsonb)
     FROM unnest(f.proacl) WITH ORDINALITY a(item,ord) CROSS JOIN LATERAL aclexplode(ARRAY[a.item]) x),
   'effective',has_function_privilege(r.oid,f.oid,'EXECUTE'))) value,
 v.nspname='pg_catalog' AND v.relkind='v' AND v.relowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')
 AND f.nspname='pg_catalog' AND f.pronamespace=v.relnamespace
 AND (SELECT nspowner FROM pg_namespace WHERE oid=v.relnamespace)=v.relowner AND f.proowner=v.relowner AND f.lanname='internal' AND f.pronargs=0
 AND f.proretset AND f.prorettype='record'::regtype AND NOT f.prosecdef AND f.prosrc='pg_get_backend_memory_contexts'
 AND c.names=ARRAY['name','ident','parent','level','total_bytes','total_nblocks','free_bytes','free_chunks','used_bytes']
 AND c.types=ARRAY[25,25,25,23,20,20,20,20,20] AND NOT r.rolsuper AND r.rolinherit AS identity_ok
 FROM view_row v,function_row f,target_role r,columns c)
SELECT jsonb_build_object('schema','helmut-cas-heap-observer-acl-state/1',
 'binding',jsonb_build_object('cloneReceiptSHA256',:'root_clone_receipt_sha256','database',current_database(),
   'databaseOID',(SELECT oid FROM pg_database WHERE datname=current_database()),'dataDirectory',current_setting('data_directory'),
   'serverVersionNum',current_setting('server_version_num'),'currentUser',current_user,'sessionUser',session_user,
   'logErrorVerbosity',current_setting('log_error_verbosity'),'logMinErrorStatement',current_setting('log_min_error_statement')),
 'role',jsonb_build_object('oid',r.oid,'name',r.rolname,'super',r.rolsuper,'inherit',r.rolinherit,
   'createRole',r.rolcreaterole,'createDB',r.rolcreatedb,'canLogin',r.rolcanlogin,'replication',r.rolreplication,
   'bypassRLS',r.rolbypassrls,'connectionLimit',r.rolconnlimit,'validUntil',r.rolvaliduntil::text,'config',r.rolconfig::text),
 'memberships',m.value,'objects',o.value) AS observer_state,
 (o.identity_ok AND m.count<=128) AS observer_identity_ok
 FROM target_role r,memberships m,object_state o
\gset
SELECT 1/coalesce((:'observer_identity_ok'::boolean AND octet_length(:'observer_state')<=32768
 AND (SELECT bool_and((value->>'rawACL' IS NULL OR octet_length(value->>'rawACL')<=8192)
   AND jsonb_array_length(value->'aclExpanded')<=128) FROM jsonb_each(:'observer_state'::jsonb->'objects')))::integer,0) AS observer_cap_guard
\gset
SELECT 1/coalesce((:'observer_state'::jsonb=:'observer_before_json'::jsonb
 AND (((:'observer_state'::jsonb#>>'{objects,view,effective}')::boolean) OR :'observer_state'::jsonb#>'{objects,view,rawACL}'<>'null'::jsonb)
 AND (((:'observer_state'::jsonb#>>'{objects,function,effective}')::boolean) OR :'observer_state'::jsonb#>'{objects,function,rawACL}'<>'null'::jsonb))::integer,0) AS observer_before_guard
\gset
SELECT (NOT (:'observer_state'::jsonb#>>'{objects,view,effective}')::boolean) AS observer_add_view,
 (NOT (:'observer_state'::jsonb#>>'{objects,function,effective}')::boolean) AS observer_add_function
\gset
\if :observer_add_view
GRANT SELECT ON pg_catalog.pg_backend_memory_contexts TO service_role;
\endif
\if :observer_add_function
GRANT EXECUTE ON FUNCTION pg_catalog.pg_get_backend_memory_contexts() TO service_role;
\endif
WITH target_role AS (SELECT * FROM pg_catalog.pg_roles WHERE rolname='service_role'),
view_row AS (SELECT c.*,n.nspname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE c.oid='pg_catalog.pg_backend_memory_contexts'::regclass),
function_row AS (SELECT p.*,l.lanname,n.nspname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.oid='pg_catalog.pg_get_backend_memory_contexts()'::regprocedure),
memberships AS (SELECT coalesce(jsonb_agg(jsonb_build_object('oid',oid,'roleid',roleid,'member',member,'grantor',grantor,
  'adminOption',admin_option,'inheritOption',inherit_option,'setOption',set_option) ORDER BY oid),'[]'::jsonb) value,
  count(*) AS count FROM pg_catalog.pg_auth_members),
columns AS (SELECT jsonb_agg(jsonb_build_object('number',attnum,'name',attname,'typeOID',atttypid,
  'typeModifier',atttypmod,'notNull',attnotnull) ORDER BY attnum) value,
  array_agg(attname::text ORDER BY attnum) names,array_agg(atttypid::integer ORDER BY attnum) types
  FROM pg_catalog.pg_attribute WHERE attrelid='pg_catalog.pg_backend_memory_contexts'::regclass AND attnum>0 AND NOT attisdropped),
object_state AS (SELECT jsonb_build_object(
 'view',jsonb_build_object('oid',v.oid,'schema',v.nspname,'schemaOID',v.relnamespace,
   'schemaOwnerOID',(SELECT nspowner FROM pg_namespace WHERE oid=v.relnamespace),
   'kind',v.relkind,'ownerOID',v.relowner,
   'definition',pg_get_viewdef(v.oid,true),'definitionSHA256',encode(sha256(convert_to(pg_get_viewdef(v.oid,true),'UTF8')),'hex'),
   'columns',c.value,'rawACL',v.relacl::text,
   'aclExpanded',(SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',a.ord,'grantor',x.grantor,'grantee',x.grantee,
       'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY a.ord,x.privilege_type COLLATE "C"),'[]'::jsonb)
     FROM unnest(v.relacl) WITH ORDINALITY a(item,ord) CROSS JOIN LATERAL aclexplode(ARRAY[a.item]) x),
   'effective',has_table_privilege(r.oid,v.oid,'SELECT')),
 'function',jsonb_build_object('oid',f.oid,'schema',f.nspname,'schemaOID',f.pronamespace,
   'schemaOwnerOID',(SELECT nspowner FROM pg_namespace WHERE oid=f.pronamespace),
   'ownerOID',f.proowner,'name',f.proname,
   'language',f.lanname,'languageOID',f.prolang,'argumentCount',f.pronargs,'argumentTypes',f.proargtypes::text,'allArgumentTypes',f.proallargtypes::text,
   'argumentModes',f.proargmodes::text,'argumentNames',f.proargnames::text,'returnType',f.prorettype,
   'setReturning',f.proretset,'securityDefiner',f.prosecdef,'volatility',f.provolatile,'config',f.proconfig::text,
   'source',f.prosrc,'sourceSHA256',encode(sha256(convert_to(f.prosrc,'UTF8')),'hex'),'rawACL',f.proacl::text,
   'aclExpanded',(SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',a.ord,'grantor',x.grantor,'grantee',x.grantee,
       'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY a.ord,x.privilege_type COLLATE "C"),'[]'::jsonb)
     FROM unnest(f.proacl) WITH ORDINALITY a(item,ord) CROSS JOIN LATERAL aclexplode(ARRAY[a.item]) x),
   'effective',has_function_privilege(r.oid,f.oid,'EXECUTE'))) value,
 v.nspname='pg_catalog' AND v.relkind='v' AND v.relowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')
 AND f.nspname='pg_catalog' AND f.pronamespace=v.relnamespace
 AND (SELECT nspowner FROM pg_namespace WHERE oid=v.relnamespace)=v.relowner AND f.proowner=v.relowner AND f.lanname='internal' AND f.pronargs=0
 AND f.proretset AND f.prorettype='record'::regtype AND NOT f.prosecdef AND f.prosrc='pg_get_backend_memory_contexts'
 AND c.names=ARRAY['name','ident','parent','level','total_bytes','total_nblocks','free_bytes','free_chunks','used_bytes']
 AND c.types=ARRAY[25,25,25,23,20,20,20,20,20] AND NOT r.rolsuper AND r.rolinherit AS identity_ok
 FROM view_row v,function_row f,target_role r,columns c)
SELECT jsonb_build_object('schema','helmut-cas-heap-observer-acl-state/1',
 'binding',jsonb_build_object('cloneReceiptSHA256',:'root_clone_receipt_sha256','database',current_database(),
   'databaseOID',(SELECT oid FROM pg_database WHERE datname=current_database()),'dataDirectory',current_setting('data_directory'),
   'serverVersionNum',current_setting('server_version_num'),'currentUser',current_user,'sessionUser',session_user,
   'logErrorVerbosity',current_setting('log_error_verbosity'),'logMinErrorStatement',current_setting('log_min_error_statement')),
 'role',jsonb_build_object('oid',r.oid,'name',r.rolname,'super',r.rolsuper,'inherit',r.rolinherit,
   'createRole',r.rolcreaterole,'createDB',r.rolcreatedb,'canLogin',r.rolcanlogin,'replication',r.rolreplication,
   'bypassRLS',r.rolbypassrls,'connectionLimit',r.rolconnlimit,'validUntil',r.rolvaliduntil::text,'config',r.rolconfig::text),
 'memberships',m.value,'objects',o.value) AS observer_state,
 (o.identity_ok AND m.count<=128) AS observer_identity_ok
 FROM target_role r,memberships m,object_state o
\gset
SELECT 1/coalesce((:'observer_identity_ok'::boolean AND octet_length(:'observer_state')<=32768
 AND (SELECT bool_and((value->>'rawACL' IS NULL OR octet_length(value->>'rawACL')<=8192)
   AND jsonb_array_length(value->'aclExpanded')<=128) FROM jsonb_each(:'observer_state'::jsonb->'objects')))::integer,0) AS observer_cap_guard
\gset
SELECT 1/coalesce(((:'observer_state'::jsonb-'objects')=(:'observer_before_json'::jsonb-'objects') AND (((:'observer_state'::jsonb->'objects'->'view')-ARRAY['rawACL','aclExpanded','effective'])=((:'observer_before_json'::jsonb->'objects'->'view')-ARRAY['rawACL','aclExpanded','effective']) AND (((:'observer_state'::jsonb->'objects'->'view')=(:'observer_before_json'::jsonb->'objects'->'view')) OR (((:'observer_state'::jsonb->'objects'->'view')->>'effective')::boolean AND (SELECT coalesce(jsonb_agg(z ORDER BY z::text COLLATE "C"),'[]'::jsonb) FROM (SELECT x-'ordinal' AS z FROM jsonb_array_elements((:'observer_state'::jsonb->'objects'->'view')->'aclExpanded') x) q)=(SELECT coalesce(jsonb_agg(z ORDER BY z::text COLLATE "C"),'[]'::jsonb) FROM (SELECT x-'ordinal' z FROM jsonb_array_elements((:'observer_before_json'::jsonb->'objects'->'view')->'aclExpanded') x UNION SELECT jsonb_build_object('grantor',((:'observer_before_json'::jsonb->'objects'->'view')->>'ownerOID')::oid,'grantee',(:'observer_before_json'::jsonb#>>'{role,oid}')::oid,'privilege','SELECT','grantable',false) WHERE NOT ((:'observer_before_json'::jsonb->'objects'->'view')->>'effective')::boolean) q)))) AND (((:'observer_state'::jsonb->'objects'->'function')-ARRAY['rawACL','aclExpanded','effective'])=((:'observer_before_json'::jsonb->'objects'->'function')-ARRAY['rawACL','aclExpanded','effective']) AND (((:'observer_state'::jsonb->'objects'->'function')=(:'observer_before_json'::jsonb->'objects'->'function')) OR (((:'observer_state'::jsonb->'objects'->'function')->>'effective')::boolean AND (SELECT coalesce(jsonb_agg(z ORDER BY z::text COLLATE "C"),'[]'::jsonb) FROM (SELECT x-'ordinal' AS z FROM jsonb_array_elements((:'observer_state'::jsonb->'objects'->'function')->'aclExpanded') x) q)=(SELECT coalesce(jsonb_agg(z ORDER BY z::text COLLATE "C"),'[]'::jsonb) FROM (SELECT x-'ordinal' z FROM jsonb_array_elements((:'observer_before_json'::jsonb->'objects'->'function')->'aclExpanded') x UNION SELECT jsonb_build_object('grantor',((:'observer_before_json'::jsonb->'objects'->'function')->>'ownerOID')::oid,'grantee',(:'observer_before_json'::jsonb#>>'{role,oid}')::oid,'privilege','EXECUTE','grantable',false) WHERE NOT ((:'observer_before_json'::jsonb->'objects'->'function')->>'effective')::boolean) q)))) AND (:'observer_state'::jsonb#>>'{objects,view,effective}')::boolean AND (:'observer_state'::jsonb#>>'{objects,function,effective}')::boolean)::integer,0) AS observer_selected_guard
\gset
SELECT jsonb_build_object('schema','helmut-cas-heap-observer-acl-prepare/1','before',:'observer_before_json'::jsonb,
 'selected',:'observer_state'::jsonb,'addedViewSELECT',:'observer_add_view'::boolean,'addedFunctionEXECUTE',:'observer_add_function'::boolean);
COMMIT;
