"""Small SQL integration for the new backup inventory; existing CI PostgreSQL.

Three fictional profiles, two data rows; no 500 run, external data or models.
Run explicitly with --ci-postgres-only. The new private logical test database
is dropped in finally; no existing database or user table is modified.
"""
import sys
sys.dont_write_bytecode = True
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import uuid


def main():
    assert sys.argv[1:] == ['--ci-postgres-only']
    assert os.environ.get('PGHOST') == '127.0.0.1' and os.environ.get('PGPORT') == '5433'
    spec = importlib.util.spec_from_file_location('w15_sql_inventory', Path(__file__).with_name('restore_backup.py'))
    backup = importlib.util.module_from_spec(spec); spec.loader.exec_module(backup)
    assert backup.SNAPSHOT_SQL == backup.R.SNAPSHOT_SQL
    database = 'w15_inventory_' + uuid.uuid4().hex
    def sql(text, db=database):
        result = subprocess.run(['psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '--dbname=' + db],
            input=text.encode(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=25)
        assert result.returncode == 0
        return result.stdout
    created = False
    try:
        sql('CREATE DATABASE ' + database, db='postgres'); created = True
        sql('''CREATE TABLE public.mandate_profiles(id int primary key, aktiv bool NOT NULL);
          INSERT INTO public.mandate_profiles VALUES(1,false),(2,false),(3,false);
          CREATE SCHEMA "quoted & schema";
          CREATE TABLE "quoted & schema"."test rows"(id int, value text NOT NULL DEFAULT 'fixed');
          INSERT INTO "quoted & schema"."test rows" VALUES(2,'two'),(1,'eins & <xml>');
          CREATE SEQUENCE public.fixture_sequence;
          SELECT nextval('public.fixture_sequence');''')
        first = json.loads(sql(backup.SNAPSHOT_SQL))
        assert first['profiles'] == 3 and first['activeProfiles'] == first['foreignTables'] == 0
        assert first['readOnly'] == 'on' and first['otherClientBackends'] == 0
        assert len(first['tableInventory']) == 2 and len(first['sequenceInventory']) == 1
        for table in first['tableInventory']:
            assert len(table['sha256']) == 64 and table['columns']
        sql('''TRUNCATE "quoted & schema"."test rows";
          INSERT INTO "quoted & schema"."test rows" VALUES(1,'eins & <xml>'),(2,'two');''')
        reordered = json.loads(sql(backup.SNAPSHOT_SQL))
        assert reordered == first
        sql('''UPDATE "quoted & schema"."test rows" SET value='changed' WHERE id=1;
          SELECT nextval('public.fixture_sequence');''')
        changed = json.loads(sql(backup.SNAPSHOT_SQL))
        assert changed['tableInventory'] != first['tableInventory']
        assert changed['sequenceInventory'] != first['sequenceInventory']
        assert changed['profiles'] == first['profiles']
        print('PASS_NEW_BACKUP_SQL_ALL_ROWS_ORDER_INDEPENDENCE_AND_SEQUENCE_DRIFT_ONLY')
    finally:
        if created:
            sql('DROP DATABASE ' + database, db='postgres')


if __name__ == '__main__': main()
