"""Explicitly gated snapshot-SQL fixture for the existing CI PostgreSQL service.

Only --postgres-fixture contacts the fixed local synthetic service. It creates
and drops its own small UUID database; no controller, original, Auth, unit or
provider path is imported or executed. Native SQL output stays in memory.
"""
import sys
sys.dont_write_bytecode = True

import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import uuid

HERE = Path(__file__).absolute().parent
SERVICE = {'PGHOST': '127.0.0.1', 'PGPORT': '5433', 'PGUSER': 'helmut', 'PGPASSWORD': 'helmut'}
PHASES = {'service-binding', 'service-version', 'fixture-create', 'fixture-setup',
          'snapshot', 'inventory', 'row-integrity', 'sequence-integrity', 'cleanup'}
MAX_OUTPUT = 1024 * 1024

SETUP = """create schema snapshot_fixture;
create table public.mandate_profiles(id integer not null, aktiv boolean not null default false);
insert into public.mandate_profiles select i,false from generate_series(1,500) i;
create table snapshot_fixture.values_fixture(label text, payload jsonb, amount integer);
insert into snapshot_fixture.values_fixture values
 ('duplicate','{"fixture":["synthetic",null]}'::jsonb,7),
 ('duplicate','{"fixture":["synthetic",null]}'::jsonb,7),
 (null,null,null),
 ('Grüße ☃ — fiktiv','{"unicode":"北京","synthetic":true}'::jsonb,-3);
create sequence snapshot_fixture.sequence_fixture start with 41;
"""


class FixtureRejected(RuntimeError):
    pass


def need(value):
    if not value:
        raise FixtureRejected('SYNTHETIC_SNAPSHOT_FIXTURE_REJECTED')


def load(name):
    spec = importlib.util.spec_from_file_location('w15_snapshot_fixture_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_fixture():
    phase, failure, created, dropped, checks, snapshots = 'service-binding', None, False, False, 0, 0
    creation_attempted = False
    database = 'w15_snapshot_fixture_' + uuid.uuid4().hex
    command = None
    try:
        need(all(os.environ.get(key) == value for key, value in SERVICE.items()))
        psql = shutil.which('psql')
        need(psql is not None)
        environment = {'PATH': os.defpath, 'LC_ALL': 'C.UTF-8', 'PGCLIENTENCODING': 'UTF8',
                       'PGCONNECT_TIMEOUT': '3', 'PGAPPNAME': 'w15-synthetic-snapshot-fixture', **SERVICE}

        def command(target, sql):
            # SQL and native output never become shell arguments or console logs.
            result = subprocess.run([psql, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
                '-P', 'pager=off', '--dbname', target], input=sql.encode('utf-8'),
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                timeout=25, close_fds=True, env=environment, check=False)
            need(result.returncode == 0 and len(result.stdout) <= MAX_OUTPUT and len(result.stderr) <= MAX_OUTPUT)
            return result.stdout.decode('utf-8').strip()

        phase = 'service-version'
        version = command('postgres', 'show server_version_num;')
        need(re.fullmatch('[0-9]+', version) and 170000 <= int(version) < 180000)
        checks += 1
        phase = 'fixture-create'
        need(command('postgres', "select exists(select 1 from pg_database where datname='" + database + "');") == 'f')
        creation_attempted = True
        command('postgres', 'create database "' + database + '" template template0 encoding \'UTF8\';')
        created = True
        phase = 'fixture-setup'
        command(database, SETUP)
        backup, restore = load('runtime_backup'), load('restore_backup')
        need(type(backup.SNAPSHOT_SQL) is str and bool(backup.SNAPSHOT_SQL))

        def snapshot():
            nonlocal phase, snapshots
            phase = 'snapshot'
            # The production helper supplies this exact SQL string unchanged.
            value = json.loads(command(database, backup.SNAPSHOT_SQL))
            need(type(value) is dict and set(value) == {'database', 'profiles', 'activeProfiles',
                 'otherClientBackends', 'rolesDigest', 'readOnly', 'foreignTables',
                 'tableInventory', 'sequenceInventory'})
            need(value['database'] == database and type(value['profiles']) is int and value['profiles'] == 500
                 and type(value['activeProfiles']) is int and value['activeProfiles'] == 0
                 and type(value['otherClientBackends']) is int and value['otherClientBackends'] >= 0
                 and type(value['rolesDigest']) is str and re.fullmatch('[a-f0-9]{32}', value['rolesDigest'])
                 and value['readOnly'] == 'on')
            phase = 'inventory'
            inventory = restore._inventory(value)
            snapshots += 1
            return inventory

        baseline = snapshot()
        expected_columns = {
            ('public', 'mandate_profiles'): [('id', 'integer', True, None), ('aktiv', 'boolean', True, 'false')],
            ('snapshot_fixture', 'values_fixture'): [('label', 'text', False, None),
                ('payload', 'jsonb', False, None), ('amount', 'integer', False, None)]}
        tables = {(row['schema'], row['table']): row for row in baseline['tableInventory']}
        need(set(tables) == set(expected_columns))
        for name, columns in expected_columns.items():
            actual = tables[name]
            need(actual['rows'] == (500 if name[0] == 'public' else 4)
                 and [(c['name'], c['type'], c['notNull'], c['default']) for c in actual['columns']] == columns
                 and all(c['identity'] == c['generated'] == '' for c in actual['columns']))
        need(baseline['sequenceInventory'] == [{'schema': 'snapshot_fixture', 'sequence': 'sequence_fixture',
             'lastValue': '41', 'isCalled': 'false'}])
        checks += 1
        need(snapshot() == baseline)
        checks += 1

        phase = 'row-integrity'
        # Change physical order without changing the duplicate/NULL/Unicode multiset.
        command(database, 'begin; create temporary table reversed_values as select * from '
            'snapshot_fixture.values_fixture order by ctid desc; truncate snapshot_fixture.values_fixture; '
            'insert into snapshot_fixture.values_fixture select * from reversed_values; commit;')
        need(snapshot() == baseline)
        checks += 1
        phase = 'row-integrity'
        command(database, "delete from snapshot_fixture.values_fixture where ctid=(select ctid from "
            "snapshot_fixture.values_fixture where label='duplicate' limit 1);")
        fewer = snapshot()
        changed_table = next(row for row in fewer['tableInventory'] if row['schema'] == 'snapshot_fixture')
        need(changed_table['rows'] == 3 and changed_table['sha256'] != tables[('snapshot_fixture', 'values_fixture')]['sha256']
             and fewer['sequenceInventory'] == baseline['sequenceInventory']
             and fewer['tableInventory'][0] == baseline['tableInventory'][0])
        checks += 1
        phase = 'row-integrity'
        command(database, "insert into snapshot_fixture.values_fixture values "
            "('duplicate','{\"fixture\":[\"synthetic\",null]}'::jsonb,7);")
        need(snapshot() == baseline)
        checks += 1
        phase = 'row-integrity'
        command(database, "update snapshot_fixture.values_fixture set label='' where label is null;")
        changed_null = snapshot()
        null_table = next(row for row in changed_null['tableInventory'] if row['schema'] == 'snapshot_fixture')
        need(null_table['rows'] == 4 and null_table['sha256'] != tables[('snapshot_fixture', 'values_fixture')]['sha256'])
        checks += 1
        phase = 'sequence-integrity'
        command(database, 'select nextval(\'snapshot_fixture.sequence_fixture\');')
        called = snapshot()
        need(called['tableInventory'] == changed_null['tableInventory']
             and called['sequenceInventory'] == [{'schema': 'snapshot_fixture', 'sequence': 'sequence_fixture',
                 'lastValue': '41', 'isCalled': 'true'}])
        checks += 1
    except (Exception, KeyboardInterrupt):
        failure = phase if phase in PHASES else 'service-binding'
    finally:
        if creation_attempted:
            try:
                # Also close an unknown CREATE outcome; never touch another name.
                command('postgres', 'drop database if exists "' + database + '";')
                need(command('postgres', "select exists(select 1 from pg_database where datname='" + database + "');") == 'f')
                dropped = True
            except (Exception, KeyboardInterrupt):
                failure = failure or 'cleanup'
    if failure is None and not (created and dropped and checks == 8 and snapshots == 7):
        failure = 'inventory'
    if failure is not None:
        return {'status': 'FAIL_SYNTHETIC_BACKUP_SNAPSHOT_FIXTURE', 'phase': failure,
                'checksPassed': checks, 'snapshotsValidated': snapshots, 'fixtureDatabaseDropped': dropped,
                'executionAuthority': False, 'end500Acceptance': False, 'mock500Acceptance': False}, 1
    return {'status': 'PASS_SYNTHETIC_BACKUP_SNAPSHOT_SQL_ONLY', 'checksPassed': checks,
            'snapshotsValidated': snapshots, 'syntheticProfiles': 500, 'activeProfiles': 0,
            'tablesVerified': 2, 'sequencesVerified': 1, 'fixtureDatabaseDropped': True,
            'originalDataRead': False, 'executionAuthority': False,
            'end500Acceptance': False, 'mock500Acceptance': False}, 0


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv in ([], ['--plan']):
        value, code = {'status': 'BLOCKED_EXPLICIT_POSTGRES_FIXTURE_ARGUMENT_REQUIRED',
            'databaseStarted': False, 'originalDataRead': False, 'executionAuthority': False}, 0
    elif argv == ['--postgres-fixture']:
        value, code = run_fixture()
    else:
        value, code = {'status': 'FAIL_SYNTHETIC_BACKUP_SNAPSHOT_FIXTURE_ARGUMENTS',
            'databaseStarted': False, 'executionAuthority': False}, 2
    print(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
