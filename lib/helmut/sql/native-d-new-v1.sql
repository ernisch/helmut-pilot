-- NEW implementation (2026-10-07), not a recovered historical installer.
-- Inert: only private empty retention storage and the existing three RPCs.
-- Never run automatically. Native review, current catalog preimage and a private
-- fingerprint-bound rollback are required before a separate installation.
begin;
set local statement_timeout='15s';
set local transaction_timeout='17s';
set local lock_timeout='2s';
create schema helmut_native_d_new_v1;
revoke all on schema helmut_native_d_new_v1 from public,anon,authenticated,service_role;
create table helmut_native_d_new_v1.versions (
  owner text not null, id text not null, version_hash text not null,
  entry_canonical text not null, completion_preimage text not null,
  output_canonical text not null, sources_canonical text not null, usage_canonical text not null,
  contract_hash text not null, retained_at timestamptz not null default clock_timestamp(),
  primary key(owner,id,version_hash), unique(owner,id),
  check(version_hash ~ '^[a-f0-9]{64}$' and contract_hash ~ '^[a-f0-9]{64}$'),
  check(octet_length(entry_canonical)<=524288 and octet_length(completion_preimage)<=8192
    and octet_length(output_canonical)<=131072 and octet_length(sources_canonical)<=131072
    and octet_length(usage_canonical)<=16384)
);
alter table helmut_native_d_new_v1.versions enable row level security;
alter table helmut_native_d_new_v1.versions force row level security;
revoke all on helmut_native_d_new_v1.versions from public,anon,authenticated,service_role;

create function helmut_native_d_new_v1.reject_mutation() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $body$
begin raise exception 'native-D-retained-version-mutation'; end $body$;
create trigger retained_version before update or delete or truncate
on helmut_native_d_new_v1.versions for each statement execute function helmut_native_d_new_v1.reject_mutation();

-- Live catalog/ACL binding, including every own function body, physical column,
-- constraint, index, RLS/policy and trigger. Also binds the existing canonicalizer
-- and Auth table structure/owner/ACL; these are real installation dependencies.
create function helmut_native_d_new_v1.fingerprint() returns text
language sql stable security invoker set search_path=pg_catalog as $body$
select encode(sha256(convert_to(jsonb_build_object(
 'implementation','NEW-20261007/1',
 'namespaces',(select jsonb_agg(to_jsonb(n)-'oid' order by n.nspname) from pg_namespace n where n.nspname in ('helmut_native_d_new_v1','helmut_synthetik500_internal','public')),
 'roles',(select jsonb_agg(to_jsonb(r) order by r.rolname) from pg_roles r where r.rolname in ('service_role','anon','authenticated') or r.oid in
  (select proowner from pg_proc where pronamespace='helmut_native_d_new_v1'::regnamespace or oid in
   (to_regprocedure('public.helmut_immutable_d_contract_v1(text)'),to_regprocedure('public.helmut_store_immutable_d_v1(text,text,text,text,text,text,text,text,text)'),to_regprocedure('public.helmut_read_immutable_d_v1(text,text,text,text)')))),
 'memberships',(select jsonb_agg(to_jsonb(m) order by m.roleid,m.member) from pg_auth_members m where m.member in (select oid from pg_roles where rolname in ('service_role','anon','authenticated'))),
 'functions',(select jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'owner',p.proowner,'acl',coalesce(p.proacl,acldefault('f',p.proowner)),'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text collate "C") from pg_proc p where p.pronamespace='helmut_native_d_new_v1'::regnamespace or p.oid in
  (to_regprocedure('public.helmut_immutable_d_contract_v1(text)'),to_regprocedure('public.helmut_store_immutable_d_v1(text,text,text,text,text,text,text,text,text)'),to_regprocedure('public.helmut_read_immutable_d_v1(text,text,text,text)'),to_regprocedure('helmut_synthetik500_internal.json_compact(jsonb)'))),
 'tables',(select jsonb_agg(jsonb_build_object('identity',c.oid::regclass::text,'owner',c.relowner,'acl',c.relacl,'kind',c.relkind,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'options',c.reloptions) order by c.oid::regclass::text) from pg_class c where c.relnamespace='helmut_native_d_new_v1'::regnamespace or c.oid='public.helmut_store'::regclass),
 'columns',(select jsonb_agg(to_jsonb(a)-'attrelid' order by a.attrelid::regclass::text,a.attnum) from pg_attribute a where a.attnum>0 and (a.attrelid in(select oid from pg_class where relnamespace='helmut_native_d_new_v1'::regnamespace) or a.attrelid='public.helmut_store'::regclass)),
 'defaults',(select jsonb_agg(jsonb_build_object('table',d.adrelid::regclass::text,'column',d.adnum,'expression',pg_get_expr(d.adbin,d.adrelid)) order by d.adrelid::regclass::text,d.adnum) from pg_attrdef d where d.adrelid='helmut_native_d_new_v1.versions'::regclass),
 'constraints',(select jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_get_constraintdef(c.oid)) order by c.conname) from pg_constraint c where c.connamespace='helmut_native_d_new_v1'::regnamespace),
 'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid::regclass::text) from pg_index i where i.indrelid='helmut_native_d_new_v1.versions'::regclass),
 'policies',(select jsonb_agg(to_jsonb(p) order by p.polname) from pg_policy p where p.polrelid='helmut_native_d_new_v1.versions'::regclass),
 'triggers',(select jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid='helmut_native_d_new_v1.versions'::regclass)
)::text,'UTF8')),'hex');
$body$;

create function helmut_native_d_new_v1.check_contract(p_hash text) returns void
language plpgsql stable security invoker set search_path=pg_catalog as $body$
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'native-D-service-role-only'; end if;
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_hash is distinct from helmut_native_d_new_v1.fingerprint()
 then raise exception 'native-D-contract-drift'; end if;
end $body$;

create function public.helmut_immutable_d_contract_v1(p_expected_contract_hash text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $body$
begin
 perform helmut_native_d_new_v1.check_contract(p_expected_contract_hash);
 return jsonb_build_object('version','helmut-synthetik500-immutable-D-storage/1','contractHash',p_expected_contract_hash);
end $body$;

-- Only persisted Auth provenance can authorize a version. Caller-supplied
-- completion/usage/owner/source hashes alone are never sufficient.
create function public.helmut_store_immutable_d_v1(p_owner text,p_id text,p_version_hash text,p_entry_canonical text,
 p_completion_preimage text,p_output_canonical text,p_sources_canonical text,p_usage_canonical text,p_expected_contract_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $body$
declare a jsonb; s jsonb; j jsonb; d jsonb; c jsonb; e jsonb; u jsonb; ticket jsonb; consumed jsonb; prior helmut_native_d_new_v1.versions%rowtype; h text; n integer;
begin
 perform helmut_native_d_new_v1.check_contract(p_expected_contract_hash);
 if p_owner is null or p_owner !~ '^test-kohorte-synthetik-(bt|be|bb)-[0-9]{3}$' or p_id is null or length(p_id)>400 or p_id='' or p_version_hash is null or p_version_hash !~ '^[a-f0-9]{64}$'
  or p_entry_canonical is null or p_completion_preimage is null or p_output_canonical is null or p_sources_canonical is null or p_usage_canonical is null
  or octet_length(p_entry_canonical)>524288 or octet_length(p_completion_preimage)>8192 or octet_length(p_output_canonical)>131072 or octet_length(p_sources_canonical)>131072 or octet_length(p_usage_canonical)>16384
 then raise exception 'native-D-input'; end if;
 e:=p_entry_canonical::jsonb; c:=p_completion_preimage::jsonb; u:=p_usage_canonical::jsonb;
 if p_entry_canonical is distinct from helmut_synthetik500_internal.json_compact(e)
  or p_completion_preimage is distinct from helmut_synthetik500_internal.json_compact(c)
  or p_output_canonical is distinct from helmut_synthetik500_internal.json_compact(p_output_canonical::jsonb)
  or p_sources_canonical is distinct from helmut_synthetik500_internal.json_compact(p_sources_canonical::jsonb)
  or p_usage_canonical is distinct from helmut_synthetik500_internal.json_compact(u)
  or encode(sha256(convert_to(p_entry_canonical,'UTF8')),'hex') is distinct from p_version_hash
 then raise exception 'native-D-canonical-version'; end if;
 h:=encode(sha256(convert_to(p_completion_preimage,'UTF8')),'hex');
 -- Lock current Auth against concurrent CAS until this append commits.
 select data into strict a from public.helmut_store where id='main-auth' for share;
 s:=a->'synthetik500KostenAdmission'; j:=a->'synthetik500DispatchJournal';
 if j->>'version' is distinct from 'helmut-synthetik500-dispatch-journal/1' then raise exception 'native-D-journal'; end if;
 j:=j->'operations'->(j->>'activeOperationId');
 select count(*),jsonb_agg(v)->0 into n,d from jsonb_array_elements(s->'plan'->'intents') x(v) where v->>'id'=c->>'dIntentId';
 ticket:=a->'testKostenTage'->(c->'dTicket'->>'day')->'calls'->(c->'dTicket'->>'id');
 consumed:=s->'consumed'->(c->>'dIntentId');
 if n<>1 or d->>'phase' is distinct from 'D' or d->>'owner' is distinct from p_owner
  or d->>'inputVersionHash' is distinct from c->>'contextHash'
  or c->>'version' is distinct from 'helmut-synthetik500-D-completion/1'
  or c->>'planHash' is distinct from s->>'planHash' or c->>'operationId' is distinct from s->'plan'->>'operationId' or c->>'runId' is distinct from s->'plan'->>'runId'
  or (s->'draftCompletions'->(c->>'dIntentId')) is distinct from c||jsonb_build_object('completionHash',h)
  or j->>'operationId' is distinct from c->>'operationId' or j->>'planHash' is distinct from c->>'planHash'
  or j->>'state' is distinct from 'running' or j->'stopRequested' is distinct from 'false'::jsonb or nullif(j->>'claimId','') is null
  or j->'units'->((j->>'index')::integer)->>'subject' is distinct from p_owner
  or j->'inFlight'->>'index' is distinct from j->>'index' or not coalesce(j->'inFlight'->'intentIds' ? (c->>'dIntentId'),false)
  or j->'attempts'->(c->>'dIntentId')->>'status' is distinct from 'accounted'
  or j->'attempts'->(c->>'dIntentId')->>'ticketId' is distinct from c->'dTicket'->>'id'
  or j->'attempts'->(c->>'dIntentId')->>'day' is distinct from c->'dTicket'->>'day'
  or consumed->>'ticketId' is distinct from c->'dTicket'->>'id' or consumed->>'day' is distinct from c->'dTicket'->>'day'
  or consumed->>'actualRequestHash' is distinct from d->>'actualRequestHash'
  or not coalesce(clock_timestamp()>=(s->'plan'->>'startsAtUTC')::timestamptz and clock_timestamp()<(s->'plan'->>'endsAtUTC')::timestamptz,false)
 then raise exception 'native-D-current-completion'; end if;
 if ticket->>'status' is distinct from 'abgerechnet' or ticket->'cost' is distinct from c->'costMicroUsd'
  or ticket->'admission'->>'intentId' is distinct from c->>'dIntentId' or ticket->'admission'->>'planHash' is distinct from c->>'planHash'
  or jsonb_typeof(c->'costMicroUsd') is distinct from 'number' or (c->>'costMicroUsd')::numeric<0
  or (c->>'costMicroUsd')::numeric<>trunc((c->>'costMicroUsd')::numeric) or jsonb_typeof(d->'maxOutputTokens') is distinct from 'number' or (c->>'costMicroUsd')::numeric>200000+4*(d->>'maxOutputTokens')::numeric
  or c->'dTicket'->>'day' is distinct from left(s->'plan'->>'startsAtUTC',10) or c->'dTicket'->>'day' is distinct from to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD')
  or left(c->>'completedAtUTC',10) is distinct from c->'dTicket'->>'day' or (c->>'completedAtUTC')::timestamptz>clock_timestamp()
  or (select count(*) from jsonb_array_elements(a->'llmUsage') x(v) where v->>'id'=c->'usageReceipt'->>'id')<>1
  or not exists(select from jsonb_array_elements(a->'llmUsage') x(v) where v=u)
  or u->>'id' is distinct from c->'usageReceipt'->>'id' or u->'success' is distinct from 'true'::jsonb
  or u->>'runId' is distinct from c->>'runId' or u->>'politicianId' is distinct from p_owner or left(u->>'createdAt',10) is distinct from c->'dTicket'->>'day'
  or encode(sha256(convert_to(p_usage_canonical,'UTF8')),'hex') is distinct from c->'usageReceipt'->>'recordHash'
 then raise exception 'native-D-cost-usage'; end if;
 if e->>'id' is distinct from p_id or e->>'user_id' is distinct from p_owner or c->>'owner' is distinct from p_owner
  or e->>'slot' is distinct from 'lage-pruefentwurf' or e->'payload'->>'phase' is distinct from 'entwurf'
  or e->'payload'->'auslieferbar' is distinct from 'false'::jsonb or e->'payload'->'qualitaetBestanden' is distinct from 'false'::jsonb
  or e->'payload'->>'runId' is distinct from c->>'runId' or e->'payload'->>'profilHash' is distinct from c->'sourceContext'->>'profileHash'
  or e->'payload'->'antwort' is distinct from p_output_canonical::jsonb or e->'payload'->'quellen' is distinct from p_sources_canonical::jsonb
  or encode(sha256(convert_to(p_output_canonical,'UTF8')),'hex') is distinct from c->>'outputHash'
  or encode(sha256(convert_to(p_sources_canonical,'UTF8')),'hex') is distinct from c->'sourceContext'->>'sourcesHash'
 then raise exception 'native-D-owner-output-source'; end if;
 insert into helmut_native_d_new_v1.versions(owner,id,version_hash,entry_canonical,completion_preimage,output_canonical,sources_canonical,usage_canonical,contract_hash)
 values(p_owner,p_id,p_version_hash,p_entry_canonical,p_completion_preimage,p_output_canonical,p_sources_canonical,p_usage_canonical,p_expected_contract_hash)
 on conflict(owner,id) do nothing;
 select * into strict prior from helmut_native_d_new_v1.versions where owner=p_owner and id=p_id;
 if prior.version_hash is distinct from p_version_hash or prior.entry_canonical is distinct from p_entry_canonical or prior.completion_preimage is distinct from p_completion_preimage
  or prior.output_canonical is distinct from p_output_canonical or prior.sources_canonical is distinct from p_sources_canonical or prior.usage_canonical is distinct from p_usage_canonical or prior.contract_hash is distinct from p_expected_contract_hash
 then raise exception 'native-D-existing-version-conflict'; end if;
 return jsonb_build_object('id',p_id,'versionHash',p_version_hash,'contractHash',p_expected_contract_hash);
end $body$;

create function public.helmut_read_immutable_d_v1(p_owner text,p_id text,p_version_hash text,p_expected_contract_hash text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $body$
declare v helmut_native_d_new_v1.versions%rowtype; a jsonb; j jsonb;
begin
 perform helmut_native_d_new_v1.check_contract(p_expected_contract_hash);
 select data into strict a from public.helmut_store where id='main-auth';
 j:=a->'synthetik500DispatchJournal';j:=j->'operations'->(j->>'activeOperationId');
 if j->>'state' is distinct from 'running' or j->'stopRequested' is distinct from 'false'::jsonb
  or j->'units'->((j->>'index')::integer)->>'subject' is distinct from p_owner
  or not coalesce(clock_timestamp()>=(a->'synthetik500KostenAdmission'->'plan'->>'startsAtUTC')::timestamptz and clock_timestamp()<(a->'synthetik500KostenAdmission'->'plan'->>'endsAtUTC')::timestamptz,false)
 then raise exception 'native-D-read-owner-window'; end if;
 select * into strict v from helmut_native_d_new_v1.versions where owner=p_owner and id=p_id and version_hash=p_version_hash and contract_hash=p_expected_contract_hash;
 if (v.completion_preimage::jsonb)->>'operationId' is distinct from j->>'operationId'
  or (v.completion_preimage::jsonb)->>'planHash' is distinct from j->>'planHash'
  or encode(sha256(convert_to(v.entry_canonical,'UTF8')),'hex') is distinct from p_version_hash then raise exception 'native-D-read-version'; end if;
 return v.entry_canonical::jsonb;
end $body$;
revoke all on all functions in schema helmut_native_d_new_v1 from public,anon,authenticated,service_role;
revoke all on function public.helmut_immutable_d_contract_v1(text),public.helmut_store_immutable_d_v1(text,text,text,text,text,text,text,text,text),public.helmut_read_immutable_d_v1(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.helmut_immutable_d_contract_v1(text),public.helmut_store_immutable_d_v1(text,text,text,text,text,text,text,text,text),public.helmut_read_immutable_d_v1(text,text,text,text) to service_role;
commit;
