"""Native preparation checks, invoked only by the separately authorized worker.

``qualify(query, database, nonce)`` calls ``query(database, sql, label)``. The
callback must execute the complete SQL with ON_ERROR_STOP, bounded time/output,
and return exactly one JSON object (or its UTF8 bytes/text). Each callback needs
a fresh administrator session that is disconnected/rolled back on every error.
The database must already be independently identified as the new owned copy;
the name check below is only an interlock. This module opens no connection,
starts no process, reads no original and has no CLI entry point.

The temporary principal and namespace exist in one rolled-back transaction.
No real authority/state/lease/artifact row is inserted or claimed. Consequently
successful CAS, concurrency, lost-ACK and TTL fencing remain explicitly unproven.
"""
import hashlib
import json
import re


class QualificationError(RuntimeError):
    """A bounded symbolic error; never include callback/SQL/Auth payloads."""


RPCS = (
    ("contract", "", "s"),
    ("authority_read", "text,text", "s"),
    ("runtime_read", "text,text", "s"),
    ("state_read", "text,text", "s"),
    ("state_cas", "text,text,text,bigint,text,text,text", "v"),
    ("artifact_insert", "text,text,text,text,text,text,text,text", "v"),
    ("artifact_read", "text,text,text,text,text", "s"),
    ("lease_acquire", "text,text,text,integer,text", "v"),
    ("lease_release", "text,text,text,uuid,text", "v"),
)
FLAGS = (
    "databaseMatches", "pg17", "utf8", "administrator", "ownerRoleSafe",
    "runtimeRoleSafe", "ownerPrivilegesExact", "ownerNoLegacyWrites", "runtimePrivilegesRestricted",
    "namespaceOwnerExact", "sixOwnedTables", "allOwnTablesRLS", "twelveAlwaysTriggers",
    "ownTablePrivilegesExact", "ownColumnPrivilegesExact", "noOwnTableInheritance",
    "nineRPCsExact", "publicRPCExecuteDenied", "runtimeRPCExecuteGranted",
    "qualificationRoleAbsent", "qualificationSchemaAbsent",
)
ROW_COUNTS = ("authorityRows", "observationRows", "stateRows", "artifactRows", "leaseRows")
TABLES = ("authority", "runtime_observations", "state", "artifacts", "leases", "legacy_read_rpcs")


def _q(value):
    return "'" + value.replace("'", "''") + "'"


def _sha(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _call(query, database, sql, label):
    try:
        raw = query(database, sql, label)
    except Exception:
        raise QualificationError("native-role-qualification-query-failed-" + label) from None
    if isinstance(raw, bytes):
        if len(raw) > 16384:
            raise QualificationError("native-role-qualification-output-cap")
        try:
            raw = raw.decode("utf-8", errors="strict")
        except UnicodeError:
            raise QualificationError("native-role-qualification-output-utf8") from None
    if isinstance(raw, str):
        try:
            size = len(raw.encode("utf-8", errors="strict"))
        except UnicodeError:
            raise QualificationError("native-role-qualification-output-utf8") from None
        if size > 16384:
            raise QualificationError("native-role-qualification-output-cap")
        try:
            def unique(pairs):
                result = {}
                for key, value in pairs:
                    if key in result:
                        raise ValueError("duplicate field")
                    result[key] = value
                return result
            raw = json.loads(raw, object_pairs_hook=unique)
        except (ValueError, TypeError):
            raise QualificationError("native-role-qualification-output-json") from None
    if type(raw) is not dict:
        raise QualificationError("native-role-qualification-output-object")
    return raw


def _catalog_sql(database, nonce, qualifier):
    owner = "helmut_ud_owner_" + nonce
    runtime = "helmut_ud_runtime_" + nonce
    schema = "helmut_ud_qualification_" + qualifier
    role = "helmut_ud_qualifier_" + qualifier
    signatures = ",".join("(" + _q("public.local_unit_diagnostic_" + name + "_v1(" + args + ")")
                          + "," + _q(volatility) + ")" for name, args, volatility in RPCS)
    names = ",".join(_q(name) for name in TABLES)
    values = {
        "databaseMatches": "current_database()=" + _q(database),
        "pg17": "current_setting('server_version_num')::integer between 170000 and 179999",
        "utf8": "current_setting('server_encoding')='UTF8' and current_setting('client_encoding')='UTF8'",
        "administrator": "exists(select from pg_roles where rolname=current_user and rolsuper)",
        "ownerRoleSafe": "exists(select from pg_roles where rolname=" + _q(owner) + " and not(rolsuper or rolcreaterole or rolcreatedb or rolbypassrls or rolreplication or rolcanlogin or rolinherit))",
        "runtimeRoleSafe": "exists(select from pg_roles where rolname=" + _q(runtime) + " and not(rolsuper or rolcreaterole or rolcreatedb or rolbypassrls or rolreplication or rolcanlogin or rolinherit))",
        "ownerPrivilegesExact": "has_database_privilege(" + _q(owner) + ",current_database(),'CREATE') and has_schema_privilege(" + _q(owner) + ",'helmut_unit_diagnostic','USAGE') and has_schema_privilege(" + _q(owner) + ",'helmut_unit_diagnostic','CREATE') and not exists(select from pg_auth_members where member=(select oid from pg_roles where rolname=" + _q(owner) + "))",
        "ownerNoLegacyWrites": "not exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_' and n.nspname not in ('information_schema','helmut_unit_diagnostic') and ((c.relkind in ('r','p','v','m','f') and (has_table_privilege(" + _q(owner) + ",c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') or has_any_column_privilege(" + _q(owner) + ",c.oid,'INSERT,UPDATE,REFERENCES'))) or (c.relkind='S' and has_sequence_privilege(" + _q(owner) + ",c.oid,'USAGE,UPDATE')))) and not exists(select from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname !~ '^pg_' and n.nspname not in ('information_schema','helmut_unit_diagnostic') and p.oid not in(select to_regprocedure(signature) from rpc_expected) and has_function_privilege(" + _q(owner) + ",p.oid,'EXECUTE'))",
        "runtimePrivilegesRestricted": "not has_database_privilege(" + _q(runtime) + ",current_database(),'CREATE,TEMPORARY') and not exists(select from pg_namespace where nspname !~ '^pg_' and nspname<>'information_schema' and has_schema_privilege(" + _q(runtime) + ",oid,'CREATE')) and not exists(select from pg_auth_members where member=(select oid from pg_roles where rolname=" + _q(runtime) + "))",
        "namespaceOwnerExact": "exists(select from pg_namespace where nspname='helmut_unit_diagnostic' and nspowner=(select oid from pg_roles where rolname=" + _q(owner) + "))",
        "sixOwnedTables": "(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='helmut_unit_diagnostic' and c.relkind in ('r','p','v','m','f','S'))=6 and (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='helmut_unit_diagnostic' and c.relname in (" + names + ") and c.relkind='r' and c.relowner=(select oid from pg_roles where rolname=" + _q(owner) + ") and not c.relispartition)=6",
        "allOwnTablesRLS": "not exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='helmut_unit_diagnostic' and c.relkind='r' and not c.relrowsecurity)",
        "twelveAlwaysTriggers": "(select count(*)=12 and bool_and(t.tgenabled='A') from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='helmut_unit_diagnostic' and not t.tgisinternal)",
        "ownTablePrivilegesExact": "not exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege) where n.nspname='helmut_unit_diagnostic' and c.relkind='r' and has_table_privilege(" + _q(runtime) + ",c.oid,p.privilege) is distinct from (p.privilege='SELECT' or (c.relname='state' and p.privilege='UPDATE') or (c.relname='artifacts' and p.privilege='INSERT') or (c.relname='leases' and p.privilege in ('INSERT','UPDATE'))))",
        "ownColumnPrivilegesExact": "not exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join (values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege) where n.nspname='helmut_unit_diagnostic' and c.relkind='r' and has_any_column_privilege(" + _q(runtime) + ",c.oid,p.privilege) is distinct from (p.privilege='SELECT' or (c.relname='state' and p.privilege='UPDATE') or (c.relname='artifacts' and p.privilege='INSERT') or (c.relname='leases' and p.privilege in ('INSERT','UPDATE'))))",
        "noOwnTableInheritance": "not exists(select from pg_inherits i join pg_class c on c.oid in(i.inhrelid,i.inhparent) join pg_namespace n on n.oid=c.relnamespace where n.nspname='helmut_unit_diagnostic')",
        "nineRPCsExact": "(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^local_unit_diagnostic_.*_v1$')=9 and (select count(*) from rpc_expected e join pg_proc p on p.oid=to_regprocedure(e.signature) where p.proowner=(select oid from pg_roles where rolname=" + _q(owner) + ") and not p.prosecdef and p.proconfig=array['search_path=pg_catalog']::text[] and p.provolatile::text=e.volatility and p.prorettype='jsonb'::regtype)=9",
        "publicRPCExecuteDenied": "not exists(select from rpc_expected e join pg_proc p on p.oid=to_regprocedure(e.signature) cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')",
        "runtimeRPCExecuteGranted": "not exists(select from rpc_expected e where not has_function_privilege(" + _q(runtime) + ",to_regprocedure(e.signature),'EXECUTE'))",
        "qualificationRoleAbsent": "not exists(select from pg_roles where rolname=" + _q(role) + ")",
        "qualificationSchemaAbsent": "not exists(select from pg_namespace where nspname=" + _q(schema) + ")",
    }
    pairs = ["'schema','helmut-local-unit-native-role-catalog/1'"]
    pairs += [_q(key) + ",(" + values[key] + ")" for key in FLAGS]
    for field, table in zip(ROW_COUNTS, TABLES[:5]):
        pairs.append(_q(field) + ",(select count(*) from helmut_unit_diagnostic." + table + ")")
    pairs.append("'nativeCatalogPin',encode(sha256(convert_to((select coalesce(jsonb_agg(jsonb_build_object('name',n.nspname||'.'||p.proname,'args',oidvectortypes(p.proargtypes),'body',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile,'owner',p.proowner,'acl',p.proacl) order by n.nspname,p.proname,oidvectortypes(p.proargtypes)),'[]'::jsonb) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='helmut_unit_diagnostic' or p.oid in(select to_regprocedure(signature) from rpc_expected))::text,'UTF8')),'hex')")
    pairs.append("'privilegeCatalogPin',encode(sha256(convert_to(jsonb_build_object('tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='helmut_unit_diagnostic' and c.relkind='r'),'policies',(select jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname) from pg_policies p where p.schemaname='helmut_unit_diagnostic'),'triggers',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='helmut_unit_diagnostic' and not t.tgisinternal),'constraints',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',k.conname,'definition',pg_get_constraintdef(k.oid)) order by c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='helmut_unit_diagnostic'),'reads',(select coalesce(jsonb_agg(to_jsonb(q) order by q.function_name),'[]'::jsonb) from helmut_unit_diagnostic.legacy_read_rpcs q))::text,'UTF8')),'hex')")
    pairs.append("'roleCatalogPin',encode(sha256(convert_to(jsonb_build_object('roles',(select jsonb_agg(jsonb_build_object('oid',r.oid,'name',r.rolname,'superuser',r.rolsuper,'bypassRLS',r.rolbypassrls,'createDB',r.rolcreatedb,'createRole',r.rolcreaterole,'inherit',r.rolinherit,'login',r.rolcanlogin,'replication',r.rolreplication) order by r.rolname) from pg_roles r where r.rolname in (" + _q(owner) + "," + _q(runtime) + ")),'memberships',(select jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor) from pg_auth_members m where m.roleid in(select oid from pg_roles where rolname in (" + _q(owner) + "," + _q(runtime) + ")) or m.member in(select oid from pg_roles where rolname in (" + _q(owner) + "," + _q(runtime) + "))),'databaseACL',(select datacl from pg_database where datname=current_database()),'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'owner',nspowner,'acl',nspacl) order by nspname) from pg_namespace where nspname in ('public','helmut_unit_diagnostic')))::text,'UTF8')),'hex')")
    return "WITH rpc_expected(signature,volatility) AS (VALUES " + signatures + ") SELECT jsonb_build_object(" + ",".join(pairs) + ");"


def _validate_catalog(value):
    expected = {"schema", "nativeCatalogPin", "privilegeCatalogPin", "roleCatalogPin", *FLAGS, *ROW_COUNTS}
    if set(value) != expected or value["schema"] != "helmut-local-unit-native-role-catalog/1":
        raise QualificationError("native-role-qualification-catalog-shape")
    if any(value[key] is not True for key in FLAGS):
        raise QualificationError("native-role-qualification-catalog-guard")
    if any(type(value[key]) is not int or value[key] != 0 for key in ROW_COUNTS):
        raise QualificationError("native-role-qualification-nonempty-authority-store")
    if any(type(value[key]) is not str or not re.fullmatch(r"[a-f0-9]{64}", value[key])
           for key in ("nativeCatalogPin", "privilegeCatalogPin", "roleCatalogPin")):
        raise QualificationError("native-role-qualification-catalog-pin")


def _expect(statement, sqlstate, message=None):
    # Catch only the expected SQLSTATE. A different error is a real failure.
    exact_message = ("GET STACKED DIAGNOSTICS detail_message=MESSAGE_TEXT; IF detail_message<>"
                     + _q(message) + " THEN RAISE EXCEPTION 'role-qualification-wrong-native-error'; END IF;") if message else ""
    return ("caught:=false; BEGIN " + statement + "; EXCEPTION WHEN SQLSTATE " + _q(sqlstate)
            + " THEN " + exact_message + " caught:=true; END; IF NOT caught THEN RAISE EXCEPTION 'role-qualification-expected-denial-missing'; END IF; checks:=checks+1;\n")


def _probe_sql(database, nonce, qualifier):
    owner, runtime = "helmut_ud_owner_" + nonce, "helmut_ud_runtime_" + nonce
    role, schema = "helmut_ud_qualifier_" + qualifier, "helmut_ud_qualification_" + qualifier
    scope, rpc_nonce, empty_hash = _sha("qualification-scope:" + database), _sha("qualification-request:" + nonce), _sha("{}")
    call = lambda name, args: "PERFORM public.local_unit_diagnostic_" + name + "_v1(" + args + ")"
    scope_arg, nonce_arg = _q(scope), _q(rpc_nonce)
    cases = [
        ("INSERT INTO helmut_unit_diagnostic.authority DEFAULT VALUES", "42501", None),
        ("UPDATE helmut_unit_diagnostic.authority SET scope_hash=scope_hash", "42501", None),
        ("DELETE FROM helmut_unit_diagnostic.authority", "42501", None),
        ("TRUNCATE helmut_unit_diagnostic.authority", "42501", None),
        ("INSERT INTO helmut_unit_diagnostic.runtime_observations DEFAULT VALUES", "42501", None),
        ("INSERT INTO helmut_unit_diagnostic.state DEFAULT VALUES", "42501", None),
        ("DELETE FROM helmut_unit_diagnostic.state", "42501", None),
        ("UPDATE helmut_unit_diagnostic.artifacts SET body=body", "42501", None),
        ("DELETE FROM helmut_unit_diagnostic.leases", "42501", None),
        ("INSERT INTO helmut_unit_diagnostic.legacy_read_rpcs DEFAULT VALUES", "42501", None),
        ("PERFORM value FROM " + schema + ".unrelated", "42501", None),
        ("UPDATE " + schema + ".unrelated SET value=2", "42501", None),
        ("CREATE TABLE " + schema + ".forbidden(id integer)", "42501", None),
        ("ALTER TABLE helmut_unit_diagnostic.state DISABLE TRIGGER ALL", "42501", None),
        ("EXECUTE 'SET LOCAL ROLE " + owner + "'", "42501", None),
        ("PERFORM helmut_unit_diagnostic.nonce('invalid')", "P0001", "local-unit-store-fresh-nonce-required"),
        ("PERFORM helmut_unit_diagnostic.utc('null'::jsonb)", "P0001", "local-unit-store-utc-type"),
        ("PERFORM helmut_unit_diagnostic.parse('{}','" + "0" * 64 + "',1024)", "P0001", "local-unit-store-actual-text-hash"),
        ("PERFORM helmut_unit_diagnostic.parse('{\"x\":1,\"x\":2}',helmut_unit_diagnostic.sha('{\"x\":1,\"x\":2}'),1024)", "P0001", "local-unit-store-actual-text-hash"),
        (call("authority_read", scope_arg + "," + nonce_arg), "P0002", None),
        (call("runtime_read", scope_arg + "," + nonce_arg), "P0002", None),
        (call("state_read", scope_arg + "," + nonce_arg), "P0002", None),
        (call("state_cas", ",".join([scope_arg, _q("0" * 64), _q("0" * 64), "0", "'{}'", _q("0" * 64), nonce_arg])), "P0001", "local-unit-store-actual-text-hash"),
        (call("state_cas", ",".join([scope_arg, _q("0" * 64), _q("0" * 64), "0", "'{}'", _q(empty_hash), nonce_arg])), "P0002", None),
        (call("artifact_insert", ",".join([scope_arg, _q("0" * 64), "'evidence'", "'qualification-only'", "'{}'", _q("0" * 64), "null", nonce_arg])), "P0001", "local-unit-store-actual-text-hash"),
        (call("artifact_insert", ",".join([scope_arg, _q("0" * 64), "'evidence'", "'qualification-only'", "'{}'", _q(empty_hash), "null", nonce_arg])), "P0002", None),
        (call("lease_acquire", ",".join([scope_arg, _q("0" * 64), "'qualification-only'", "0", nonce_arg])), "P0001", "local-unit-store-lease-ttl"),
        (call("lease_acquire", ",".join([scope_arg, _q("0" * 64), "'qualification-only'", "1000", nonce_arg])), "P0002", None),
        (call("lease_release", ",".join([scope_arg, _q("0" * 64), "'qualification-only'", "'00000000-0000-4000-8000-000000000000'::uuid", nonce_arg])), "P0002", None),
    ]
    sql = "BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='250ms';\n"
    sql += "CREATE ROLE " + role + " NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;\n"
    sql += "GRANT " + runtime + " TO " + role + " WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;\n"
    sql += "CREATE SCHEMA " + schema + "; CREATE TABLE " + schema + ".unrelated(id integer primary key,value integer not null); INSERT INTO " + schema + ".unrelated VALUES(1,1); GRANT USAGE ON SCHEMA " + schema + " TO " + runtime + ";\n"
    # A privileged login cannot qualify itself by merely SET ROLE runtime.
    sql += "SET LOCAL ROLE " + runtime + "; DO $privileged$ DECLARE caught boolean:=false; BEGIN BEGIN PERFORM helmut_unit_diagnostic.runtime_role(); EXCEPTION WHEN SQLSTATE '42501' THEN caught:=true; END; IF NOT caught THEN RAISE EXCEPTION 'role-qualification-privileged-session-accepted';END IF;END;$privileged$; RESET ROLE;\n"
    sql += "SET SESSION AUTHORIZATION " + role + "; SET LOCAL ROLE " + runtime + ";\n"
    sql += "DO $runtime$ DECLARE caught boolean; detail_message text; checks integer:=0; c jsonb; a jsonb; BEGIN\n"
    sql += "PERFORM helmut_unit_diagnostic.runtime_role(); c:=public.local_unit_diagnostic_contract_v1();\n"
    sql += "IF NOT helmut_unit_diagnostic.exact(c,ARRAY['version','database','databaseOID','sources','legacyReadRPCs','sourceQualified']) OR c->>'version' IS DISTINCT FROM 'helmut-local-unit-diagnostic-native-store/1' OR c->>'database' IS DISTINCT FROM " + _q(database) + " OR c->>'databaseOID' IS DISTINCT FROM (SELECT oid::text FROM pg_database WHERE datname=current_database()) OR c->'sourceQualified' IS DISTINCT FROM 'false'::jsonb OR jsonb_typeof(c->'sources') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(c->'sources')) NOT BETWEEN 9 AND 256 THEN RAISE EXCEPTION 'role-qualification-native-contract';END IF;\n"
    expected_rpc_oids = ",".join(_q("public.local_unit_diagnostic_" + name + "_v1(" + args + ")") + "::regprocedure" for name, args, _ in RPCS)
    sql += "IF c->'sources' IS DISTINCT FROM (SELECT jsonb_object_agg(n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='helmut_unit_diagnostic' OR p.oid IN (" + expected_rpc_oids + ")) AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname=" + _q(owner) + ") AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]) OR c->'legacyReadRPCs' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(jsonb_build_object('name',function_name,'oid',function_oid::text,'identityArguments',identity_arguments,'prosrcSHA256',prosrc_sha256,'qualificationPin',qualification_pin) ORDER BY function_name),'[]'::jsonb) FROM helmut_unit_diagnostic.legacy_read_rpcs WHERE http_exposed) THEN RAISE EXCEPTION 'role-qualification-contract-catalog-binding';END IF;\n"
    sql += "PERFORM set_config('helmut.role_qualification_sources',(SELECT count(*)::text FROM jsonb_object_keys(c->'sources')),true);\n"
    sql += "PERFORM set_config('helmut.role_qualification_contract_pin',encode(sha256(convert_to(c::text,'UTF8')),'hex'),true);\n"
    sql += "IF helmut_unit_diagnostic.sha('{}') IS DISTINCT FROM " + _q(empty_hash) + " OR helmut_unit_diagnostic.parse('{}'," + _q(empty_hash) + ",1024) IS DISTINCT FROM '{}'::jsonb THEN RAISE EXCEPTION 'role-qualification-actual-native-sha';END IF;\n"
    sql += "a:=public.local_unit_diagnostic_artifact_read_v1(" + scope_arg + ",'evidence','qualification-only',null," + nonce_arg + "); IF NOT helmut_unit_diagnostic.exact(a,ARRAY['version','scopeHash','kind','logicalId','missing','nonce']) OR a->>'version' IS DISTINCT FROM 'helmut-local-unit-diagnostic-artifact-witness/1' OR a->'missing' IS DISTINCT FROM 'true'::jsonb OR a->>'scopeHash' IS DISTINCT FROM " + scope_arg + " OR a->>'kind' IS DISTINCT FROM 'evidence' OR a->>'logicalId' IS DISTINCT FROM 'qualification-only' OR a->>'nonce' IS DISTINCT FROM " + nonce_arg + " THEN RAISE EXCEPTION 'role-qualification-empty-artifact-read';END IF;\n"
    sql += "".join(_expect(*case) for case in cases)
    sql += "PERFORM set_config('helmut.role_qualification_checks',checks::text,true); END;$runtime$; RESET ROLE; RESET SESSION AUTHORIZATION;\n"
    # The fresh principal must also be rejected if it gains an owner bridge.
    sql += "GRANT " + owner + " TO " + role + " WITH INHERIT FALSE, SET TRUE, ADMIN FALSE; SET SESSION AUTHORIZATION " + role + "; SET LOCAL ROLE " + runtime + ";\n"
    sql += "DO $owner_bridge$ DECLARE caught boolean:=false; BEGIN BEGIN PERFORM helmut_unit_diagnostic.runtime_role(); EXCEPTION WHEN SQLSTATE '42501' THEN caught:=true;END;IF NOT caught THEN RAISE EXCEPTION 'role-qualification-owner-bridge-accepted';END IF;END;$owner_bridge$;RESET ROLE;RESET SESSION AUTHORIZATION;\n"
    sql += "SELECT jsonb_build_object('schema','helmut-local-unit-native-role-probes/1','runtimeContractConfirmed',true,'contractSourceCount',current_setting('helmut.role_qualification_sources')::integer,'contractResponsePin',current_setting('helmut.role_qualification_contract_pin'),'executedNegativeCases',current_setting('helmut.role_qualification_checks')::integer+2,'emptyArtifactReadConfirmed',true,'nativeSHAConfirmed',true,'separateQualificationRole',true,'unrelatedSentinelUnchanged',(SELECT count(*)=1 AND min(value)=1 FROM " + schema + ".unrelated),'ownAuthorityRows',(SELECT count(*) FROM helmut_unit_diagnostic.authority),'ownStateRows',(SELECT count(*) FROM helmut_unit_diagnostic.state),'ownLeaseRows',(SELECT count(*) FROM helmut_unit_diagnostic.leases)); ROLLBACK;"
    return sql, len(cases) + 2


def qualify(query, database, nonce):
    """Return only sanitized measured checks/pins; never claim a full CAS proof."""
    if not callable(query) or type(database) is not str or type(nonce) is not str:
        raise QualificationError("native-role-qualification-arguments")
    if not re.fullmatch(r"[a-f0-9]{32}", nonce) or database != "helmut_unit_diagnostic_" + nonce:
        raise QualificationError("native-role-qualification-owned-database")
    qualifier = _sha("separate-role-qualification:" + database)[:32]
    catalog_sql = _catalog_sql(database, nonce, qualifier)
    before = _call(query, database, catalog_sql, "role-qualification-before")
    _validate_catalog(before)
    probe_sql, expected_cases = _probe_sql(database, nonce, qualifier)
    probes = _call(query, database, probe_sql, "role-qualification-native-probes")
    expected_fields = {"schema", "runtimeContractConfirmed", "contractSourceCount", "contractResponsePin", "executedNegativeCases",
                       "emptyArtifactReadConfirmed", "nativeSHAConfirmed", "separateQualificationRole",
                       "unrelatedSentinelUnchanged", "ownAuthorityRows", "ownStateRows", "ownLeaseRows"}
    if set(probes) != expected_fields or probes["schema"] != "helmut-local-unit-native-role-probes/1":
        raise QualificationError("native-role-qualification-probes-shape")
    if any(probes[key] is not True for key in ("runtimeContractConfirmed", "emptyArtifactReadConfirmed",
                                              "nativeSHAConfirmed", "separateQualificationRole", "unrelatedSentinelUnchanged")):
        raise QualificationError("native-role-qualification-probes-unconfirmed")
    if (type(probes["contractSourceCount"]) is not int or not 9 <= probes["contractSourceCount"] <= 256
            or type(probes["executedNegativeCases"]) is not int or probes["executedNegativeCases"] != expected_cases
            or any(type(probes[key]) is not int or probes[key] != 0 for key in ("ownAuthorityRows", "ownStateRows", "ownLeaseRows"))):
        raise QualificationError("native-role-qualification-probe-counts")
    if type(probes["contractResponsePin"]) is not str or not re.fullmatch(r"[a-f0-9]{64}", probes["contractResponsePin"]):
        raise QualificationError("native-role-qualification-contract-pin")
    after = _call(query, database, catalog_sql, "role-qualification-after-rollback")
    _validate_catalog(after)
    if before != after:
        raise QualificationError("native-role-qualification-catalog-changed")
    return {"schema": "helmut-local-unit-native-role-qualification/1", "executedChecksPassed": True,
            "negativeChecks": expected_cases, "contractSourceCount": probes["contractSourceCount"],
            "contractResponsePin": probes["contractResponsePin"],
            "nativeCatalogPin": before["nativeCatalogPin"], "privilegeCatalogPin": before["privilegeCatalogPin"],
            "roleCatalogPin": before["roleCatalogPin"],
            "qualificationScopeSHA256": _sha("qualification-scope:" + database), "probeSQLSHA256": _sha(probe_sql),
            "catalogSQLSHA256": _sha(catalog_sql), "rolledBackAndCatalogUnchanged": True,
            "actualAuthorityRowsConsumed": 0, "successfulCASMeasured": False, "CASRevisionConflictMeasured": False,
            "lostACKNoReplayMeasured": False, "leaseAcquisitionMeasured": False, "leaseTTLFencingMeasured": False,
            "concurrentInstanceFencingMeasured": False, "fullNativeStateMachineQualified": False,
            "unitExecutionAuthorized": False, "full500Accepted": False, "production": False}
