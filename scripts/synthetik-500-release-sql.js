"use strict";
// Offline SQL packaging only. No database client, network, profile, key or environment write.
// Generated SQL is an inert proposal, never an execution permission.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const ROOT = path.resolve(__dirname, ".."), pins = require("../lib/helmut/synthetik-500-stored-command-native-pins.json");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const original = fs.readFileSync(path.join(ROOT, "supabase/proposals/synthetik500_stored_command_binding.sql"), "utf8");
if (sha(original) !== pins.proposalSHA256) throw Error("release-native-proposal-drift");
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const names = Object.keys(pins.nativeSources).sort(), nameList = names.map(q).join(",");
const prefix = `-- INERT LOCAL REVIEW PROPOSAL. No Production GO; never execute automatically.
-- This marker binds the operator's separately reviewed, fresh quiescence receipt.
-- It does NOT itself prove external workers have stopped. That evidence is mandatory.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
lock table public.helmut_store in access exclusive mode;
lock table public.mandate_profiles in share mode;
do $release_preflight$
declare owner_oid oid; r pg_catalog.pg_roles%rowtype;
begin
  select relowner into strict owner_oid from pg_catalog.pg_class where oid='public.helmut_store'::regclass;
  if current_user<>pg_catalog.pg_get_userbyid(owner_oid) or current_user<>'postgres' then
    raise exception using errcode='42501', message='release-database-owner-required';
  end if;
  if coalesce(current_setting('helmut.release_quiescence_receipt_sha256',true),'') !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='55000', message='release-external-quiescence-receipt-required';
  end if;
  select * into strict r from pg_catalog.pg_roles where rolname='service_role';
  if r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolreplication
    or pg_catalog.pg_has_role('service_role',owner_oid,'MEMBER')
    or exists(select 1 from pg_catalog.pg_auth_members where member=r.oid) then
    raise exception using errcode='42501', message='release-runtime-role-drift';
  end if;
  if exists(select 1 from public.mandate_profiles where aktiv is distinct from false) then
    raise exception using errcode='55000', message='release-profiles-not-inactive';
  end if;
  if exists(select 1 from public.helmut_store where id like 'synthetik500-command-synthetik500-proof-%'
    or id like 'synthetik500-command-synthetik500-authority-%') then
    -- Intentionally conservative: expired/malformed rows also block. Never delete them here.
    raise exception using errcode='55000', message='release-proof-or-authority-present';
  end if;
end;
$release_preflight$;
`;
const hashes = JSON.stringify(pins.nativeSources);
function nativeInventory(requireReader = true) {
  return `do $release_native_inventory$
declare actual jsonb; n integer;
begin
  select count(*), jsonb_object_agg(p.proname,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'))
    into n,actual from pg_catalog.pg_proc p join pg_catalog.pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname in (${nameList});
  if n<>3 or actual is distinct from ${q(hashes)}::jsonb then
    raise exception using errcode='55000', message='release-native-source-drift';
  end if;
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname in (${nameList}) and (
      pg_catalog.pg_get_userbyid(p.proowner)<>'postgres' or p.prosecdef or p.proleakproof or p.proretset
      or p.proconfig is distinct from array['search_path=pg_catalog']::text[]
      or p.prokind<>'f' or p.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
      or (p.proname='helmut_s500_read_command_binding_v1' and
        (p.pronargs<>3 or p.proargtypes<>'25 25 16'::pg_catalog.oidvector or p.prorettype<>'pg_catalog.jsonb'::regtype or p.provolatile<>'s'))
      or (p.proname<>'helmut_s500_read_command_binding_v1' and
        (p.pronargs<>0 or p.prorettype<>'pg_catalog.trigger'::regtype or p.provolatile<>'v'))
      or pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') is distinct from
        (p.proname='helmut_s500_read_command_binding_v1' and ${requireReader ? 'true' : 'false'})
      or exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        where a.grantee<>p.proowner and not (p.proname='helmut_s500_read_command_binding_v1'
          and ${requireReader ? 'true' : 'false'} and a.grantee=(select oid from pg_catalog.pg_roles where rolname='service_role')
          and a.privilege_type='EXECUTE' and not a.is_grantable)))) then
    raise exception using errcode='55000', message='release-native-privilege-or-shape-drift';
  end if;
  if (select count(*) from pg_catalog.pg_trigger t where t.tgrelid='public.helmut_store'::regclass
      and t.tgname in ('helmut_s500_command_immutable_row_v1','helmut_s500_command_no_truncate_v1'))<>2
    or exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='public.helmut_store'::regclass
      and t.tgname in ('helmut_s500_command_immutable_row_v1','helmut_s500_command_no_truncate_v1') and (
        t.tgenabled<>'A' or t.tgisinternal or t.tgqual is not null or t.tgnargs<>0 or octet_length(t.tgargs)<>0
        or t.tgconstraint<>0 or t.tgconstrrelid<>0 or t.tgconstrindid<>0 or t.tgdeferrable or t.tginitdeferred
        or t.tgattr<>''::pg_catalog.int2vector or t.tgparentid<>0 or t.tgoldtable is not null or t.tgnewtable is not null
        or t.tgtype<>case when t.tgname='helmut_s500_command_immutable_row_v1' then 27 else 34 end
        or t.tgfoid<>case when t.tgname='helmut_s500_command_immutable_row_v1'
          then 'public.helmut_s500_command_immutable_row_v1()'::regprocedure
          else 'public.helmut_s500_command_no_truncate_v1()'::regprocedure end)) then
    raise exception using errcode='55000', message='release-native-trigger-drift';
  end if;
end;
$release_native_inventory$;
`;
}
const shape = `do $release_table_shape$
begin
 if not exists(select 1 from pg_catalog.pg_class where oid='public.helmut_store'::regclass
     and relkind='r' and not relispartition and relrowsecurity)
   or exists(select 1 from pg_catalog.pg_inherits where inhrelid='public.helmut_store'::regclass
     or inhparent='public.helmut_store'::regclass)
   or (select count(*) from pg_catalog.pg_attribute where attrelid='public.helmut_store'::regclass
     and not attisdropped and attnotnull and ((attname='id' and atttypid='pg_catalog.text'::regtype)
       or (attname='data' and atttypid='pg_catalog.jsonb'::regtype)))<>2
   or not exists(select 1 from pg_catalog.pg_constraint c join pg_catalog.pg_attribute a
     on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.conrelid='public.helmut_store'::regclass
       and c.contype='p' and not c.condeferrable and c.convalidated and cardinality(c.conkey)=1 and a.attname='id') then
   raise exception using errcode='55000', message='release-table-shape-drift';
 end if;
end;
$release_table_shape$;
`;
const absent = `do $release_absence$
begin
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in (${nameList}))
   or exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.helmut_store'::regclass
     and tgname in ('helmut_s500_command_immutable_row_v1','helmut_s500_command_no_truncate_v1')) then
   raise exception using errcode='55000', message='release-existing-or-partial-installation';
 end if;
end;
$release_absence$;
`;
function proposals() {
  const core = original.replace(/^([\s\S]*?)\bbegin;\s*/, "").replace(/\s*commit;\s*$/, "\n");
  if (!core.startsWith("create function ") || !core.endsWith("\n")) throw Error("release-proposal-envelope");
  const fullDrop = fs.readFileSync(path.join(ROOT,"supabase/proposals/synthetik500_stored_command_binding_rollback.sql"),"utf8")
    .replace(/^([\s\S]*?)\bbegin;\s*/, "").replace(/\s*commit;\s*$/, "\n");
  return {
    "synthetik500_stored_command_install_guarded.sql": prefix+shape+absent+core+nativeInventory(true)+"commit;\n",
    "synthetik500_stored_command_suspend_reader.sql": prefix+shape+nativeInventory(true)+
      "-- Safe preparation rollback: retain all immutable protections and original rows.\n"+
      "revoke all on function public.helmut_s500_read_command_binding_v1(text,text,boolean) from service_role;\n"+
      nativeInventory(false)+"commit;\n",
    "synthetik500_stored_command_remove_if_empty.sql": prefix+shape+nativeInventory(true)+
      "do $release_empty$ begin if exists(select 1 from public.helmut_store where id ~ '^synthetik500-command-synthetik500-[a-z0-9-]{8,80}$') then raise exception using errcode='55000',message='release-protected-history-prevents-drop'; end if; end $release_empty$;\n"+
      fullDrop+absent+"commit;\n"
  };
}
if(require.main===module){
 if(process.argv.length!==3 || process.argv[2]!=="--print-manifest")throw Error("offline-sql-packaging-only");
 console.log(JSON.stringify({scope:"INERT_SQL_PROPOSALS_NOT_EXECUTED",nativeProposalSHA256:sha(original),files:Object.entries(proposals()).map(([name,text])=>({name,bytes:Buffer.byteLength(text),sha256:sha(text)}))}));
}
module.exports={proposals};
