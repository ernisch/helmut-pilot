"""Small, explicitly gated fixture on the existing CI PostgreSQL17 service.

No profiles, Original data, processing, model, controller or production access.
Only newly created owned databases may be modified or dropped.
"""
import sys
sys.dont_write_bytecode = True
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[2]
SERVICE = {'PGHOST': '127.0.0.1', 'PGPORT': '5433', 'PGUSER': 'helmut', 'PGPASSWORD': 'helmut'}
MOCK_DB = 'helmut_w15_full500_20261028b'
SERVICE_HASH = '78833d91aea2ad9c795cbb9790df031c230c98efd27d581faa79522c5da8175f'
MOCK_HASH = 'bd4ef2b3e73a9d64e6e2567eb8ad0c8ff717f2e63f7e8b60cac0f970f4eb850e'
OLD_HASH = 'a649603fa8f18c6a3db65aab09b67e15d6bda80befa20e5394bce7eeda1d6415'


def need(value):
    if not value:
        raise RuntimeError('SYNTHETIC_MOCK_CALENDAR_SQL_REJECTED')


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def raw_json(value):
    return literal(json.dumps(value, ensure_ascii=True)) + '::jsonb'


SETUP = """create table public.helmut_store(id text primary key,data jsonb not null);
create table public.llm_usage(id text primary key,created_at timestamptz not null,
tenant_id text,profile_id text,run_id text,pipeline_step text,politician_id text,user_id text,
model text,call_type text,prompt_tokens integer,completion_tokens integer,total_tokens integer,
estimated_cost numeric,duration_ms integer,success boolean,error text);
"""


def run_fixture():
    need(all(os.environ.get(k) == v for k, v in SERVICE.items()))
    psql = shutil.which('psql'); need(psql)
    env = {'PATH': os.defpath, 'LC_ALL': 'C.UTF-8', 'PGCLIENTENCODING': 'UTF8',
           'PGCONNECT_TIMEOUT': '3', 'PGAPPNAME': 'w15-synthetic-calendar-fixture', **SERVICE}
    owned = []; checks = 0

    def command(db, sql, *, reject=False):
        prefix = "set helmut.local_usage_experiment='on';"
        p = subprocess.run([psql, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '--dbname', db],
                           input=(prefix + sql).encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           env=env, timeout=20, close_fds=True)
        need(len(p.stdout) <= 1024 * 1024 and len(p.stderr) <= 1024 * 1024)
        if reject:
            need(p.returncode != 0); return None
        need(p.returncode == 0); return p.stdout.decode().strip()

    def query(db, sql):
        return json.loads(command(db, sql))

    def create(db):
        need(re.fullmatch('[a-z0-9_]{1,63}', db))
        need(command('postgres', 'select exists(select 1 from pg_database where datname=' + literal(db) + ');') == 'f')
        command('postgres', 'create database "' + db + '";')
        marker = 'w15-synthetic-calendar-' + uuid.uuid4().hex
        command('postgres', 'comment on database "' + db + '" is ' + literal(marker) + ';')
        owned.append((db, marker))
        command(db, SETUP + (ROOT / 'supabase/proposals/auth_usage_atomic_local.sql').read_text())

    def auth(version=7, renewal=MOCK_HASH):
        order = {'version': version, 'serviceContractHash': SERVICE_HASH}
        if version != 5:
            order['orderRenewalHash'] = renewal
        return {'testKostenAuftrag': order, 'llmUsage': [{'id': 'old-inert', 'createdAt': '2026-10-28T12:00:00.000Z',
                'keinAufruf': True, 'success': False, 'estimatedCost': 0}], 'fixture': {'preserved': True}}

    def seed(db, key, value):
        value = json.loads(json.dumps(value))
        for row in value['llmUsage']: row['id'] = key + '-' + row['id']
        command(db, 'insert into public.helmut_store values(' + literal(key) + ',' + raw_json(value) + ');')

    def physical(db, key):
        return command(db, "select encode(sha256(convert_to(data::text,'UTF8')),'hex') from public.helmut_store where id=" + literal(key) + ';')

    def bootstrap_sql(key):
        return "select public.helmut_auth_usage_bootstrap_v1(jsonb_build_object('id'," + literal(key) + ", 'expectedHash',encode(sha256(convert_to(data::text,'UTF8')),'hex'))) from public.helmut_store where id=" + literal(key) + ';'

    def read(db, key):
        return query(db, 'select public.helmut_auth_usage_read_v1(' + raw_json({'id': key}) + ');')

    try:
        need(170000 <= int(command('postgres', 'show server_version_num;')) < 180000)
        for role in ('service_role', 'anon', 'authenticated'):
            command('postgres', "do $f$ begin if not exists(select 1 from pg_roles where rolname=" + literal(role)
                    + ') then create role ' + role + '; end if; end;$f$;')
        create(MOCK_DB)
        seed(MOCK_DB, 'new-calendar', auth()); query(MOCK_DB, bootstrap_sql('new-calendar'))
        before = read(MOCK_DB, 'new-calendar'); need(before['data']['fixture'] == {'preserved': True}); checks += 1
        data = {k: v for k, v in before['data'].items() if k != 'llmUsage'}
        data['_authStoreRevision'] = str(uuid.uuid4())
        entry = {'id': 'synthetic-inert-receipt', 'createdAt': '2026-11-03T12:00:00.000Z',
                 'keinAufruf': True, 'success': False, 'estimatedCost': 0}
        request = {'id': 'new-calendar', 'expectedRevision': before['data']['_authStoreRevision'],
                   'expectedProof': before['proof'], 'data': data, 'additions': [entry]}
        result = query(MOCK_DB, 'select public.helmut_auth_usage_cas_v1(' + raw_json(request) + ');')
        need(len(result) == 1)
        after = read(MOCK_DB, 'new-calendar'); need(after['data']['llmUsage'] == [entry] + before['data']['llmUsage'])
        need(after['data']['fixture'] == {'preserved': True}); checks += 1
        saved = physical(MOCK_DB, 'new-calendar')
        need(query(MOCK_DB, 'select public.helmut_auth_usage_cas_v1(' + raw_json(request) + ');') == [])
        need(physical(MOCK_DB, 'new-calendar') == saved); checks += 1
        for patch in ({'version': 8}, {'orderRenewalHash': '0' * 64}, {'serviceContractHash': '0' * 64}):
            bad = json.loads(json.dumps(request)); bad['data']['testKostenAuftrag'].update(patch)
            command(MOCK_DB, 'select public.helmut_auth_usage_cas_v1(' + raw_json(bad) + ');', reject=True)
            need(physical(MOCK_DB, 'new-calendar') == saved); checks += 1
        for version, renewal in ((5, None), (6, OLD_HASH)):
            key = 'legacy-' + str(version); value = auth(version, renewal)
            seed(MOCK_DB, key, value); query(MOCK_DB, bootstrap_sql(key))
            need(read(MOCK_DB, key)['data']['testKostenAuftrag'] == value['testKostenAuftrag']); checks += 1
        for suffix, value in (('wrong-hash', auth(7, '0' * 64)), ('wrong-version', auth(8))):
            seed(MOCK_DB, suffix, value); saved_bad = physical(MOCK_DB, suffix)
            command(MOCK_DB, bootstrap_sql(suffix), reject=True)
            need(physical(MOCK_DB, suffix) == saved_bad); checks += 1
        negative = 'w15_calendar_wrong_' + uuid.uuid4().hex
        create(negative); seed(negative, 'forged-calendar', auth()); saved_bad = physical(negative, 'forged-calendar')
        command(negative, bootstrap_sql('forged-calendar'), reject=True)
        need(physical(negative, 'forged-calendar') == saved_bad); checks += 1
    finally:
        for db, marker in reversed(owned):
            need(command('postgres', "select shobj_description(oid,'pg_database') from pg_database where datname=" + literal(db) + ';') == marker)
            command('postgres', 'drop database "' + db + '";')
    return {'status': 'PASS_NATIVE_MOCK_CALENDAR_SQL_BINDINGS', 'checks': checks,
            'ownedDatabasesDropped': len(owned), 'profiles': 0, 'units': 0, 'modelCalls': 0, 'executionAuthority': False}


if __name__ == '__main__':
    if sys.argv[1:] != ['--postgres-fixture']:
        raise SystemExit('EXPLICIT_LOCAL_POSTGRES_FIXTURE_REQUIRED')
    try:
        print(json.dumps(run_fixture(), sort_keys=True))
    except Exception:
        print(json.dumps({'status': 'FAIL_OR_UNKNOWN_NATIVE_MOCK_CALENDAR_SQL', 'executionAuthority': False}))
        raise SystemExit(1)
