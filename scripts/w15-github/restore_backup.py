"""Restore-only exports, private selection, sealing and bounded return channel.

No CLI, network, restore or other action on import. This separate closure never
weakens runtime_backup's full End500 service/zero/audit gates. Local authenticated
readback does not assert offhost durability or a complete Production backup.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import tarfile
import threading
import time
import uuid


def _load(name):
    spec = importlib.util.spec_from_file_location('w15_restore_backup_' + name,
                                                Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


R, T, Q = _load('runtime_backup'), _load('runtime_restore'), _load('restore_resources')
B, S = R.B, R.S
DOCKER, ACTIONS, OUTPUTS = R.DOCKER, R.ACTIONS, R.OUTPUTS
NODE_WORKER = R.NODE_WORKER
# PostgreSQL 17 builtins only. Hash each complete row, retain duplicates and
# hash the ordered fixed-width hashes. Sorts use the unchanged work_mem/temp
# contract; full row JSON is never concatenated into one giant string.
SNAPSHOT_SQL = r"""begin isolation level repeatable read read only;
set local statement_timeout='15s';set local lock_timeout='3s';
select jsonb_build_object('database',current_database(),
 'profiles',(select count(*) from public.mandate_profiles),
 'activeProfiles',(select count(*) from public.mandate_profiles where aktiv),
 'otherClientBackends',(select count(*) from pg_stat_activity
   where backend_type='client backend' and pid<>pg_backend_pid()),
 'rolesDigest',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by oid)::text,'null')) from pg_authid r),
 'readOnly',current_setting('transaction_read_only'),
 'foreignTables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where c.relkind='f' and n.nspname !~ '^pg_' and n.nspname<>'information_schema'),
 'tableInventory',(select coalesce(jsonb_agg(jsonb_build_object(
   'schema',n.nspname,'table',c.relname,
   'columns',(select coalesce(jsonb_agg(jsonb_build_object(
     'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
     'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated)
       order by a.attnum),'[]'::jsonb)
     from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
     where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'rows',(xpath('//rows/text()',q.x))[1]::text::bigint,
   'sha256',(xpath('//digest/text()',q.x))[1]::text)
   order by n.nspname collate "C",c.relname collate "C"),'[]'::jsonb)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   cross join lateral (select query_to_xml(format($w15table$
     select count(*) as rows,
       encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex') as digest
     from (select encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') as h from %I.%I t) hashed
     $w15table$,n.nspname,c.relname),false,true,'') as x) q
   where c.relkind in ('r','p','m') and n.nspname !~ '^pg_' and n.nspname<>'information_schema'),
 'sequenceInventory',(select coalesce(jsonb_agg(jsonb_build_object(
   'schema',n.nspname,'sequence',c.relname,
   'lastValue',(xpath('//last_value/text()',q.x))[1]::text,
   'isCalled',(xpath('//is_called/text()',q.x))[1]::text)
   order by n.nspname collate "C",c.relname collate "C"),'[]'::jsonb)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   cross join lateral (select query_to_xml(format('select last_value,is_called from %I.%I',
       n.nspname,c.relname),false,true,'') as x) q
   where c.relkind='S' and n.nspname !~ '^pg_' and n.nspname<>'information_schema'));
rollback;"""
_json, _pin, _sample, _write, _lifecycle = R._json, R._pin, R._sample, R._write, R._lifecycle
FINGERPRINT = '7E3998A6C2CB948C69A2EE51F4267ABF26796EDC'


class BackupRuntimeError(RuntimeError):
    pass


def require(value, code='RESTORE_BACKUP_REJECTED'):
    if not value:
        raise BackupRuntimeError(code)


def _context(context, *, expected_scope='ISOLATED_GITHUB_END500_BACKUP_ONLY'):
    B._context(context, expected_scope=expected_scope)
    require(context['recipientFingerprint'] == FINGERPRINT)


def _inventory(snapshot):
    """Closed complete table/sequence inventory, independent of local OIDs."""
    require(type(snapshot.get('foreignTables')) is int and snapshot['foreignTables'] == 0)
    tables, sequences = snapshot.get('tableInventory'), snapshot.get('sequenceInventory')
    require(isinstance(tables, list) and 0 < len(tables) <= 4096)
    names = []
    for table in tables:
        require(isinstance(table, dict) and set(table) == {'schema', 'table', 'columns', 'rows', 'sha256'})
        require(all(isinstance(table[k], str) and 0 < len(table[k].encode()) <= 63 for k in ('schema', 'table')))
        require(type(table['rows']) is int and 0 <= table['rows'] <= 1000000
                and isinstance(table['sha256'], str) and B.SHA.fullmatch(table['sha256']))
        require(isinstance(table['columns'], list) and 0 < len(table['columns']) <= 1600)
        column_names = []
        for column in table['columns']:
            require(isinstance(column, dict) and set(column) == {'name', 'type', 'notNull', 'default', 'identity', 'generated'})
            require(isinstance(column['name'], str) and bool(column['name']) and isinstance(column['type'], str)
                    and type(column['notNull']) is bool and (column['default'] is None or isinstance(column['default'], str))
                    and column['identity'] in ('', 'a', 'd') and column['generated'] in ('', 's'))
            column_names.append(column['name'])
        require(len(set(column_names)) == len(column_names))
        names.append((table['schema'], table['table']))
    require(names == sorted(set(names)))
    require(any(t['schema'] == 'public' and t['table'] == 'mandate_profiles' and t['rows'] == 500 for t in tables))
    require(isinstance(sequences, list) and len(sequences) <= 4096)
    names = []
    for sequence in sequences:
        require(isinstance(sequence, dict) and set(sequence) == {'schema', 'sequence', 'lastValue', 'isCalled'})
        require(all(isinstance(sequence[k], str) and bool(sequence[k]) for k in ('schema', 'sequence'))
                and isinstance(sequence['lastValue'], str) and re.fullmatch(r'-?[0-9]+', sequence['lastValue'])
                and sequence['isCalled'] in ('true', 'false'))
        names.append((sequence['schema'], sequence['sequence']))
    require(names == sorted(set(names)))
    return {'tableInventory': tables, 'sequenceInventory': sequences, 'foreignTables': 0}


def _restore_closure(work_fd):
    """Re-read all genuine five-step outputs/lifecycles; no caller PASS flag."""
    state_fd = restore_fd = None
    try:
        state_fd = os.open('state', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=work_fd)
        restore_fd = os.open('restore', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=state_fd)
        closure = _json(restore_fd, 'RESTORE_CLOSURE.PRIVATE.json')
        require(closure.get('schema') == 'helmut-w15-owned-isolated-restore/1'
                and closure.get('status') == 'PASS_OWNED_ISOLATED_RESTORE_500_INACTIVE_ONLY'
                and type(closure.get('profiles')) is int and closure['profiles'] == 500
                and type(closure.get('active')) is int and closure['active'] == 0
                and closure.get('steps') == 5)
        for key in ('fullRestoreAccepted', 'acceptedAsCompleteBackup', 'end500Started',
                    'mock500Started', 'executionAuthority'):
            require(closure.get(key) is False)
        for key in ('initialKernelSample', 'finalKernelSample'):
            Q.C.assess(closure[key])
        require(set(closure['pins']) == set(T.ACTIONS))
        for action in T.ACTIONS:
            receipt = _json(restore_fd, action + '.SAFE.json')
            fields = {'status', 'action', 'returncode', 'signal', 'output', 'stderr', 'identity', 'lifecycle'}
            require(set(receipt) == (fields | {'renderedSQL'} if action == 'restore-render' else fields)
                    and receipt['status'] == 'PASS_OWNED_ISOLATED_RESTORE_STEP'
                    and receipt['action'] == action and type(receipt['returncode']) is int
                    and receipt['returncode'] == 0 and receipt['signal'] is None)
            require(_pin(restore_fd, T.OUTPUTS[action]) == receipt['output'] == closure['pins'][action])
            require(_pin(restore_fd, action + '.PRIVATE.stderr') == receipt['stderr'])
            identity = _json(state_fd, action + '.node.SAFE.json')
            require(identity == receipt['identity'] == T._lifecycle(restore_fd, action))
            require(set(identity) == {'phase', 'pid', 'startTicks'} and identity['phase'] == action
                    and type(identity['pid']) is int and identity['pid'] > 1
                    and isinstance(identity['startTicks'], str) and identity['startTicks'].isdigit())
            require(_pin(restore_fd, action + '.lifecycle.PRIVATE.jsonl') == receipt['lifecycle'])
            if action == 'restore-render':
                require(_pin(restore_fd, 'rendered.PRIVATE.sql') == receipt['renderedSQL'])
        zero = _json(work_fd, 'RESTORED500_ZERO.SAFE.json')
        check = _json(restore_fd, T.OUTPUTS['restore-check'])
        require(zero == check == {'profiles': 500, 'active': 0})
        return closure
    finally:
        for fd in (restore_fd, state_fd):
            if fd is not None:
                os.close(fd)


def export_restore_database(context, *, expected_context, work, container, database, supervisor, run_owned, seconds=600):
    """Actually export once when called by the separately authorized controller.

    ``run_owned(argv, action, seconds)`` must execute, retain private output,
    and verify inner termination on every outcome; it returns CompletedProcess.
    It must support all ACTIONS in the existing owned-process lifecycle. No
    caller boolean can replace physical private output/receipt checks below.
    """
    _context(expected_context)
    require(context == expected_context, 'BACKUP_CONTEXT_MISMATCH')
    B.database_export_plan(context, database=database, container=container)
    require(callable(run_owned) and type(seconds) is int and 30 <= seconds <= 600)
    deadline = time.monotonic() + seconds
    work_fd = state_fd = output_fd = None
    try:
        work = Path(work)
        work_fd = S._directory(str(work), private=True)
        state_fd = S._directory(str(work / 'state'), private=True)
        _restore_closure(work_fd)
        before = _sample(supervisor)
        os.mkdir('final-backup', 0o700, dir_fd=state_fd)
        output_fd = os.open('final-backup', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=state_fd)
        os.fsync(state_fd)
        pins = {}
        for action in ACTIONS:
            _sample(supervisor)
            remaining = int(deadline - time.monotonic())
            require(remaining > 10, 'BACKUP_EXPORT_DEADLINE')
            # PID/timeout wrapper follows the existing qualified inner-stage
            # convention. The new action names need explicit lifecycle wiring.
            command = ('umask 077; set -Ce; echo $$ >' + B.BASE + '/state/' + action + '.pid; '
                       'exec timeout --signal=TERM --kill-after=5s ' + str(remaining - 5) + 's '
                       + B.BASE + '/node -e ' + shlex.quote(NODE_WORKER) + ' '
                       + ' '.join(shlex.quote(x) for x in (B.BASE, action, database, SNAPSHOT_SQL)))
            argv = list(DOCKER) + ['exec', '--user', '1000:1000', container, 'sh', '-c', command]
            process = run_owned(argv, action, remaining)
            require(isinstance(process, subprocess.CompletedProcess) and process.args == argv
                    and type(process.returncode) is int and process.returncode == 0, 'BACKUP_OWNED_EXECUTION_UNCONFIRMED')
            receipt = _json(output_fd, action + '.SAFE.json')
            require(set(receipt) == {'status', 'action', 'returncode', 'signal', 'output', 'stderr', 'identity', 'lifecycle'}
                    and receipt['status'] == 'PASS_OWNED_DATABASE_EXPORT_STEP'
                    and receipt['action'] == action and receipt['returncode'] == 0 and receipt['signal'] is None)
            pins[action] = _pin(output_fd, OUTPUTS[action])
            require(pins[action] == receipt['output'] and _pin(output_fd, action + '.PRIVATE.stderr') == receipt['stderr'])
            identity = _json(state_fd, action + '.node.SAFE.json')
            require(identity == receipt['identity'] == _lifecycle(output_fd, action)
                    and set(identity) == {'phase', 'pid', 'startTicks'} and identity['phase'] == action
                    and type(identity['pid']) is int and identity['pid'] > 1
                    and isinstance(identity['startTicks'], str) and identity['startTicks'].isdigit())
            require(_pin(output_fd, action + '.lifecycle.PRIVATE.jsonl') == receipt['lifecycle'])
            require(pins[action]['bytes'] > 0)
            _sample(supervisor)
        a, z = (_json(output_fd, OUTPUTS[k], limit=8 * 1024 * 1024) for k in ('backup-before', 'backup-after'))
        for observed in (a, z):
            require(set(observed) == {'database', 'profiles', 'activeProfiles', 'otherClientBackends',
                    'rolesDigest', 'readOnly', 'foreignTables', 'tableInventory', 'sequenceInventory'}
                    and observed['database'] == database and observed['profiles'] == 500
                    and observed['activeProfiles'] == observed['otherClientBackends'] == 0
                    and observed['readOnly'] == 'on' and isinstance(observed['rolesDigest'], str)
                    and len(observed['rolesDigest']) == 32)
            _inventory(observed)
        require(a == z, 'BACKUP_SNAPSHOT_CLOSURE_CHANGED')
        child, _ = S._file(output_fd, OUTPUTS['backup-dump'])
        try:
            require(os.read(child, 5) == b'PGDMP', 'BACKUP_CUSTOM_DUMP_HEADER')
        finally:
            os.close(child)
        final = _sample(supervisor)
        result = {'schema': 'helmut-w15-restore-database-export/1',
                  'status': 'PASS_DATABASE_AND_ROLES_EXPORTED_RESTORE_AND_READBACK_PENDING',
                  'context': context, 'database': database, 'pins': pins,
                  'beforeSnapshot': a, 'afterSnapshot': z, 'initialKernelSample': before,
                  'finalKernelSample': final, 'originalCommonLifetimeMonitorStillLive': True,
                  'consistentPgDumpTransaction': 'pg_dump default single consistent snapshot',
                  'databaseRestoreObserved': False, 'remoteReadbackObserved': False,
                  'acceptedAsCompleteBackup': False, 'executionAuthority': False,
                  'retryAllowed': False}
        _write(output_fd, 'SNAPSHOT_CLOSURE.PRIVATE.json', (json.dumps(result, sort_keys=True) + '\n').encode())
        return result
    except (Exception, KeyboardInterrupt):
        raise BackupRuntimeError('RESTORE_DATABASE_EXPORT_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED') from None
    finally:
        for fd in (output_fd, state_fd, work_fd):
            if fd is not None:
                os.close(fd)


def seal_restore_backup(collection, *, root, output, public_key, guard):
    """Reuse the existing seal format, recipient and GPG, with physical caps."""
    context = collection['context']
    _context(context)
    require(callable(guard) and collection['selectedPlaintextBytes'] <= Q.MAX_SELECTION_BYTES)
    require(hashlib.sha256(Path(public_key).read_bytes()).hexdigest()
            == '3075683711733f6c7fc5836c9b4f5f1d94eaf35dec7f9a401132f52995122443')
    def bounded():
        guard()
        try:
            value = Path(output).lstat()
        except FileNotFoundError:
            return
        require(stat.S_ISREG(value.st_mode) and value.st_size <= Q.MAX_CIPHER_BYTES,
                'RESTORE_BACKUP_CIPHER_LIMIT')
    sealed = S.seal(root=str(root), manifest='manifest.PRIVATE.json',
        manifest_sha256=collection['manifestSHA256'], public_key=str(public_key),
        recipient_fingerprint=context['recipientFingerprint'], commit=context['exactCommit'],
        run_id=context['runId'], input_manifest_sha256=context['inputManifestSHA'],
        output=str(output), guard=bounded)
    bounded()
    return sealed


def _manifest(raw, expected_manifest_sha256, context):
    require(isinstance(raw, bytes) and 0 < len(raw) <= S.MAX_MANIFEST)
    require(hashlib.sha256(raw).hexdigest() == expected_manifest_sha256)
    def unique(rows):
        result = {}
        for key, value in rows:
            require(key not in result)
            result[key] = value
        return result
    value = json.loads(raw, object_pairs_hook=unique)
    require(isinstance(value, dict) and set(value) == {'version', 'exactCommit', 'runId',
            'runAttempt', 'inputManifestSHA', 'recipientFingerprint', 'files'})
    require(type(value['version']) is int and value['version'] == 1)
    require(type(value['runAttempt']) is int and value['runAttempt'] == 1)
    require(all(value[k] == context[k] for k in ('exactCommit', 'runId', 'runAttempt',
                'inputManifestSHA', 'recipientFingerprint')))
    require(isinstance(value['files'], list) and 0 < len(value['files']) <= Q.MAX_ARCHIVE_MEMBERS)
    names = set()
    total = 0
    for row in value['files']:
        require(isinstance(row, dict) and set(row) == {'path', 'bytes', 'sha256'})
        B._path(row['path'])
        require(row['path'] not in names and type(row['bytes']) is int and row['bytes'] >= 0
                and isinstance(row['sha256'], str) and B.SHA.fullmatch(row['sha256']))
        names.add(row['path'])
        total += row['bytes']
    require(total <= Q.MAX_SELECTION_BYTES)
    return value


class _LimitedPipe:
    def __init__(self, stream, guard):
        self.stream, self.guard, self.size = stream, guard, 0

    def read(self, size):
        require(type(size) is int and 0 <= size <= S.CHUNK)
        self.guard()
        block = self.stream.read(size)
        self.size += len(block)
        require(self.size <= Q.MAX_CIPHER_BYTES)
        return block


def _destination_file(root_fd, relative, blocks, guard):
    """Private exclusive streaming write; no extractall, links or overwrite."""
    parts = B._path(relative)
    directory = os.dup(root_fd)
    try:
        for part in parts[:-1]:
            try:
                os.mkdir(part, 0o700, dir_fd=directory)
            except FileExistsError:
                pass
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = child
            S._private_directory(directory)
        child = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                        0o600, dir_fd=directory)
        size, digest = 0, hashlib.sha256()
        with os.fdopen(child, 'wb') as out:
            for block in blocks:
                guard()
                size += len(block)
                require(size <= Q.MAX_SELECTION_BYTES)
                digest.update(block)
                out.write(block)
            out.flush()
            os.fsync(out.fileno())
        os.fsync(directory)
        return {'bytes': size, 'sha256': digest.hexdigest()}
    finally:
        os.close(directory)


def authenticated_readback(cipher, *, cipher_bytes, cipher_sha256, expected_manifest,
        expected_manifest_sha256, context, destination, private_home, passphrase_file, guard,
        backup_scope='ISOLATED_GITHUB_END500_BACKUP_ONLY'):
    """Authenticate GPG and every archive byte into a NEW private return tree.

    ``expected_manifest`` is the independently retained manifest object from
    collection, never obtained only from the downloaded ciphertext itself.
    GPG failure leaves private partials and never produces a success receipt.
    Offhost status belongs to the caller's separately checked transport receipt.
    """
    _context(context, expected_scope=backup_scope)
    require(callable(guard) and type(cipher_bytes) is int and 0 < cipher_bytes <= Q.MAX_CIPHER_BYTES)
    require(isinstance(cipher_sha256, str) and B.SHA.fullmatch(cipher_sha256))
    expected_raw = (json.dumps(expected_manifest, sort_keys=True, separators=(',', ':')) + '\n').encode()
    _manifest(expected_raw, expected_manifest_sha256, context)
    deadline = time.monotonic() + 600
    def bounded():
        require(time.monotonic() < deadline, 'RESTORE_BACKUP_READBACK_DEADLINE')
        guard()
    Rcv = _load('receive')
    cipher_fd, cipher_snapshot = Rcv.private_open(cipher)
    home_fd = pass_fd = parent_fd = root_fd = None
    process = timer = None
    close_failed = False
    receipt = None
    try:
        bounded()
        require(cipher_snapshot[2] == cipher_bytes
                and S._hash_fd(cipher_fd, bounded) == (cipher_bytes, cipher_sha256))
        require(S._snapshot(os.fstat(cipher_fd)) == cipher_snapshot)
        os.lseek(cipher_fd, 0, os.SEEK_SET)
        home_fd = S._directory(str(private_home), private=True)
        home_identity = (os.fstat(home_fd).st_dev, os.fstat(home_fd).st_ino)
        pass_fd, pass_snapshot = Rcv.private_open(passphrase_file)
        require(0 < pass_snapshot[2] <= 4096)
        base = S._gpg_base(str(private_home)) + ['--disable-dirmngr']
        listed = subprocess.run(base + ['--with-colons', '--list-keys', FINGERPRINT],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=S._gpg_env(), timeout=30)
        require(listed.returncode == 0 and len(listed.stdout) <= 65536)
        primary, awaiting = [], False
        for line in listed.stdout.decode('ascii').splitlines():
            row = line.split(':')
            if row[0] == 'pub':
                require(row[1] not in ('r', 'e', 'd'))
                awaiting = True
            elif row[0] == 'fpr' and awaiting:
                primary.append(row[9])
                awaiting = False
        require(primary == [FINGERPRINT], 'RESTORE_BACKUP_RECIPIENT_MISMATCH')
        destination = S._absolute(destination)
        parent_fd = S._directory(os.path.dirname(destination), private=True)
        os.mkdir(os.path.basename(destination), 0o700, dir_fd=parent_fd)
        root_fd = os.open(os.path.basename(destination), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                          dir_fd=parent_fd)
        os.fsync(parent_fd)
        process = subprocess.Popen([arg for arg in base if arg != '--no-autostart'] +
            ['--pinentry-mode', 'loopback', '--passphrase-fd', str(pass_fd), '--decrypt'],
            stdin=cipher_fd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            pass_fds=(home_fd, pass_fd), env=S._gpg_env(), bufsize=0)
        timer = threading.Timer(600, process.kill)
        timer.daemon = True
        timer.start()
        with tarfile.open(fileobj=_LimitedPipe(process.stdout, bounded), mode='r|') as archive:
            member = archive.next()
            require(member is not None and member.name == 'W15_MANIFEST.PRIVATE.json'
                    and member.type in (tarfile.REGTYPE, tarfile.AREGTYPE) and member.sparse is None
                    and not member.linkname and not member.pax_headers
                    and member.offset_data == 512 and 0 < member.size <= S.MAX_MANIFEST)
            raw = archive.extractfile(member).read(S.MAX_MANIFEST + 1)
            manifest = _manifest(raw, expected_manifest_sha256, context)
            require(manifest == expected_manifest)
            _destination_file(root_fd, 'manifest.PRIVATE.json', [raw], bounded)
            offset = member.offset_data + ((member.size + 511) // 512) * 512
            for entry in manifest['files']:
                member = archive.next()
                require(member is not None and member.name == 'files/' + entry['path']
                        and member.type in (tarfile.REGTYPE, tarfile.AREGTYPE)
                        and member.sparse is None and not member.linkname and not member.pax_headers
                        and member.offset_data == offset + 512 and member.size == entry['bytes'])
                stream = archive.extractfile(member)
                def blocks():
                    while block := stream.read(S.CHUNK):
                        yield block
                pin = _destination_file(root_fd, entry['path'], blocks(), bounded)
                require(all(pin[k] == entry[k] for k in ('bytes', 'sha256')))
                offset = member.offset_data + ((member.size + 511) // 512) * 512
            require(archive.next() is None)
            tail = 0
            while block := archive.fileobj.read(S.CHUNK):
                require(not any(block))
                tail += len(block)
            require(tail >= 512)
        require(process.wait(timeout=15) == 0, 'RESTORE_BACKUP_GPG_INTEGRITY_FAILED')
        for row in manifest['files']:
            S._verify_file(root_fd, row, guard=bounded)
        require(S._snapshot(os.fstat(cipher_fd)) == cipher_snapshot
                and S._snapshot(os.fstat(pass_fd)) == pass_snapshot)
        check_fd = S._directory(str(private_home), private=True)
        try:
            require((os.fstat(check_fd).st_dev, os.fstat(check_fd).st_ino) == home_identity)
        finally:
            os.close(check_fd)
        bounded()
        receipt = {'schema': 'helmut-w15-backup-authenticated-readback/1',
            'status': 'PASS_AUTHENTICATED_BACKUP_BYTES_ONLY',
            'verifiedFiles': len(manifest['files']),
            'verifiedBytes': sum(row['bytes'] for row in manifest['files']),
            'cipherBytes': cipher_bytes, 'cipherSHA256': cipher_sha256,
            'manifestSHA256': expected_manifest_sha256,
            'localAuthenticatedReadbackObserved': True, 'remoteReadbackObserved': False,
            'databaseRestoreObserved': False, 'acceptedAsCompleteBackup': False,
            'executionAuthority': False, 'retryAllowed': False}
    except (Exception, KeyboardInterrupt):
        raise BackupRuntimeError('BACKUP_READBACK_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED') from None
    finally:
        if timer is not None:
            timer.cancel()
        if process is not None:
            if process.poll() is None:
                process.kill()
            process.stdout.close()
            process.wait(timeout=15)
        if home_fd is not None:
            try:
                result = subprocess.run(['/usr/bin/gpgconf', '--homedir', str(private_home), '--kill', 'gpg-agent'],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=S._gpg_env(), timeout=15)
                close_failed = result.returncode != 0
            except (OSError, subprocess.TimeoutExpired):
                close_failed = True
        for fd in (root_fd, parent_fd, pass_fd, home_fd, cipher_fd):
            if fd is not None:
                os.close(fd)
        require(not close_failed, 'RESTORE_BACKUP_GPG_AGENT_CLOSE_UNKNOWN')
    require(receipt is not None)
    return receipt


def _roles_for_fresh_cluster(raw):
    """Keep native export intact; skip only CREATE of the fresh bootstrap role.

    ALTER ROLE, passwords, privileges and every other CREATE remain unchanged.
    This adapter is never applied to a running/shared/Production database.
    """
    require(isinstance(raw, bytes) and 0 < len(raw) <= 4 * 1024 * 1024)
    lines = raw.splitlines(keepends=True)
    matches = [i for i, line in enumerate(lines) if line.rstrip(b'\r\n') == b'CREATE ROLE postgres;']
    require(len(matches) == 1, 'RESTORE_BOOTSTRAP_ROLE_EXPORT_UNKNOWN')
    index = matches[0]
    lines[index] = b'-- CREATE ROLE postgres already satisfied by this fresh isolated cluster.\n'
    return b''.join(lines)


def _canonical_roles(raw):
    require(isinstance(raw, bytes) and 0 < len(raw) <= 4 * 1024 * 1024)
    # Native pg_dumpall headers contain timestamps and optional per-invocation
    # psql restriction nonces. Neither changes the restored role attributes.
    rows = []
    for line in raw.splitlines():
        if not line.strip() or line.startswith(b'--'):
            continue
        if re.fullmatch(rb'\\(?:un)?restrict [A-Za-z0-9]+', line):
            continue
        rows.append(line)
    return b'\n'.join(rows) + b'\n'


def _private_bytes(path, maximum):
    Rcv = _load('receive')
    fd, snap = Rcv.private_open(path)
    try:
        require(0 < snap[2] <= maximum)
        result = os.read(fd, maximum + 1)
        require(len(result) == snap[2] and S._snapshot(os.fstat(fd)) == snap)
        return result
    finally:
        os.close(fd)


def _bind_disk_guard(watch, guard):
    original = watch.disk_check
    def checked():
        guard()
        return original()
    watch.disk_check = checked


def restore_readback(verified_root, *, context, controller_context, resources,
                     expected_manifest, expected_manifest_sha256, rollback_root, guard):
    """Actually restore the authenticated final dump in a NEW netless cluster.

    Reuses the native five-step restore, the owned runner, Watch, four-phase
    final export and bounded empty-container checks. No original endpoint,
    provider, activation or seed/main function is called. A fresh import keeps
    all output paths independent of the frozen original run tree.
    """
    _context(context)
    require(callable(guard) and callable(getattr(resources, 'sample', None)))
    guard()
    root, verified = Path(rollback_root), Path(verified_root)
    verified_fd = S._directory(str(verified), private=True)
    try:
        raw, _, entries = S._manifest(verified_fd, 'manifest.PRIVATE.json', expected_manifest_sha256,
            context['exactCommit'], context['runId'], context['inputManifestSHA'], context['recipientFingerprint'])
        require(_manifest(raw, expected_manifest_sha256, context) == expected_manifest)
        for entry in entries:
            S._verify_file(verified_fd, entry, guard=guard)
    finally:
        os.close(verified_fd)
    root_fd = S._directory(str(root), private=True)
    require(not os.listdir(root_fd), 'BACKUP_RECOVERY_ROOT_NOT_FRESH')
    os.close(root_fd)
    # Only immutable independently qualified repository code is imported.
    source = Path(__file__).resolve().parents[1] / 'synthetik-500-w15-memory-forward.py'
    spec = importlib.util.spec_from_file_location('w15_independent_backup_recovery_' + uuid.uuid4().hex, source)
    forward = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(forward)
    m = forward.M
    recovery_context = {**context, 'nonce': str(uuid.uuid4())}
    container = 'w15-end500-' + context['runId'] + '-' + uuid.UUID(recovery_context['nonce']).hex
    forward.WORK = m.WORK = root / 'work'
    forward.CONTAINER = m.CONTAINER = container
    m.IMAGE = controller_context['runtimePins']['imageId']
    require(re.fullmatch(r'sha256:[a-f0-9]{64}', m.IMAGE))
    work = m.WORK
    work.mkdir(mode=0o700)
    for name in ('pgdata', 'state'):
        (work / name).mkdir(mode=0o700)
    node = root / 'node'
    node_source = verified / 'prepare/runtime-files/node'
    source_pin = controller_context['runtimePins']['node']
    parent_fd = S._directory(str(node_source.parent), private=True)
    source_fd = root_fd = None
    try:
        source_fd, source_snapshot = S._file(parent_fd, node_source.name)
        root_fd = S._directory(str(root), private=True)
        def blocks():
            while block := os.read(source_fd, S.CHUNK):
                yield block
        pin = _destination_file(root_fd, 'node', blocks(), guard)
        require(all(pin[k] == source_pin[k] for k in ('bytes', 'sha256'))
                and S._snapshot(os.fstat(source_fd)) == source_snapshot)
        os.chmod(node, 0o700)
        original_roles = _private_bytes(verified / 'database/roles.PRIVATE.sql', 4 * 1024 * 1024)
        adapted_roles = _roles_for_fresh_cluster(original_roles)
        _write(root_fd, 'roles-fresh.PRIVATE.sql', adapted_roles)
        _write(root_fd, 'ROLE_ADAPTER.SAFE.json', (json.dumps({
            'status': 'FRESH_CLUSTER_BOOTSTRAP_CREATE_ONLY_SKIPPED',
            'originalSHA256': hashlib.sha256(original_roles).hexdigest(),
            'adaptedSHA256': hashlib.sha256(adapted_roles).hexdigest(),
            'originalModified': False, 'executionAuthority': False}, sort_keys=True) + '\n').encode())
    finally:
        for fd in (root_fd, source_fd, parent_fd):
            if fd is not None:
                os.close(fd)
    mounts = {
        '/var/lib/postgresql/data': (work / 'pgdata', False),
        m.BASE + '/state': (work / 'state', False),
        m.BASE + '/node': (node, True),
        m.BASE + '/app': (verified / 'prepare/runtime-files/app', True),
        m.BASE + '/input.PRIVATE.dump': (verified / 'database/final.PRIVATE.dump', True),
        m.BASE + '/roles.PRIVATE.sql': (root / 'roles-fresh.PRIVATE.sql', True),
    }
    mount_args = tuple(x for target, (path, readonly) in mounts.items()
                       for x in ('--mount', 'type=bind,src=' + str(path) + ',dst=' + target
                                 + (',readonly' if readonly else '')))
    labels = {'helmut.w15.scope': 'independent-backup-recovery-only',
              'helmut.w15.run': context['runId'], 'helmut.w15.commit': context['exactCommit'],
              'helmut.w15.recovery': recovery_context['nonce']}
    label_args = tuple(x for key, value in labels.items() for x in ('--label', key + '=' + value))
    owned_id = watch = None
    attempted = False
    failure = False
    result = None
    def inspect(identifier):
        info = json.loads(m.docker('inspect', identifier))[0]
        require(all(info['Config']['Labels'].get(k) == v for k, v in labels.items()) and info['Image'] == m.IMAGE)
        require(info['Name'] == '/' + container and re.fullmatch('[a-f0-9]{64}', info['Id']))
        require(owned_id is None or info['Id'] == owned_id)
        host = info['HostConfig']
        require(host['NetworkMode'] == 'none' and host['Memory'] == Q.C.LIMIT
                and host['MemorySwap'] == Q.C.LIMIT and host['CgroupParent'] == resources.unit
                and host['RestartPolicy']['Name'] == 'no')
        require(not info['NetworkSettings']['Ports'])
        require(len(info['Mounts']) == len(mounts))
        for row in info['Mounts']:
            require(row['Destination'] in mounts)
            path, readonly = mounts[row['Destination']]
            require(row['Source'] == str(path) and row['Type'] == 'bind' and row['RW'] is (not readonly))
        return info
    try:
        require(json.loads(m.docker('image', 'inspect', m.IMAGE))[0]['Id'] == m.IMAGE)
        require(not m.docker('ps', '-a', '--filter', 'name=^/' + container + '$', '--format', '{{.ID}}').strip())
        attempted = True
        m.docker('create', '--name', container, '--pull=never', '--network=none', '--restart=no',
            '--memory=' + str(Q.C.LIMIT), '--memory-swap=' + str(Q.C.LIMIT),
            '--cgroup-parent=' + resources.unit, *label_args, *mount_args,
            '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', m.IMAGE, 'postgres',
            '-c', 'helmut.local_usage_experiment=on', '-c', 'max_wal_size=128MB',
            '-c', 'work_mem=32MB', '-c', 'autovacuum_naptime=10s')
        owned_id = inspect(container)['Id']
        m.docker('start', owned_id)
        info = inspect(owned_id)
        require(info['State']['Running'] is True)
        resources.check_pid(info['State']['Pid'], owned_id)
        watch = forward.Watch(resources.path)
        watch.common_resources = resources
        _bind_disk_guard(watch, guard)
        watch.backup_runner = T.O.OwnedBackupRunner(watch, m, base=m.BASE, container=container,
                                                   database=m.DB, scope='end500-restore')
        watch.sample()
        watch.thread.start()
        for _ in range(100):
            guard()
            # Exclude the Unix-socket-only server used during fresh initdb.
            ready = subprocess.run(m.DOCKER + ['exec', owned_id, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '--timeout=1'],
                env=m.ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
            if ready.returncode == 0:
                break
            time.sleep(.2)
        require(ready.returncode == 0)
        m.docker('exec', owned_id, 'mkdir', '-p', m.BASE)
        m.docker('exec', owned_id, 'chmod', '700', m.BASE)
        m.docker('exec', owned_id, 'chown', '1000:1000', m.BASE)
        restored = T.restore_owned(m, watch, run_owned=watch.backup_runner.run_owned)
        require(restored['profiles'] == 500 and restored['active'] == 0)
        watch.backup_runner = T.O.OwnedBackupRunner(watch, m, base=m.BASE, container=container,
                                                   database=m.DB, scope='end500-backup')
        exported = export_restore_database(recovery_context, expected_context=recovery_context,
            work=work, container=container, database=m.DB, supervisor=watch,
            run_owned=watch.backup_runner.run_owned)
        source_snapshot = json.loads(_private_bytes(verified / 'database/SNAPSHOT_CLOSURE.PRIVATE.json', 8 * 1024 * 1024))
        require(source_snapshot.get('context') == context
                and source_snapshot.get('schema') in ('helmut-w15-runtime-database-export/1',
                                                      'helmut-w15-restore-database-export/1'))
        require(source_snapshot['beforeSnapshot'] == source_snapshot['afterSnapshot'])
        require(_inventory(source_snapshot['beforeSnapshot']) == _inventory(exported['beforeSnapshot']),
                'BACKUP_RECOVERY_COMPLETE_TABLE_OR_SEQUENCE_INTEGRITY_MISMATCH')
        recovered_roles = _private_bytes(work / 'state/final-backup/roles.PRIVATE.sql', 4 * 1024 * 1024)
        require(_canonical_roles(recovered_roles) == _canonical_roles(original_roles),
                'BACKUP_RECOVERY_ROLE_SEMANTICS_MISMATCH')
        guard()
        result = {'schema': 'helmut-w15-independent-backup-recovery/1',
            'status': 'PASS_AUTHENTICATED_FINAL_DUMP_RESTORED_500_ZERO_AND_ROLES',
            'restoreSteps': restored['steps'], 'profiles': 500, 'active': 0,
            'independentFreshPGDATA': True, 'rolesSemanticsMatched': True,
            'originalRolesUnchanged': True, 'nativeFinalDumpRestored': True,
            'completeTableAndSequenceInventoryMatched': True,
            'recoveryContext': recovery_context, 'databaseRestoreObserved': True,
            'acceptedAsCompleteBackup': False, 'independentAcceptanceRequired': True,
            'fullEnd500Accepted': False, 'mock500Accepted': False,
            'providerCalls': 0, 'profileActivations': 0, 'executionAuthority': False}
    except (Exception, KeyboardInterrupt):
        failure = True
    finally:
        if attempted:
            try:
                info = inspect(owned_id or container)
                owned_id = info['Id']
                if info['State']['Running']:
                    m.docker('stop', '--time', '5', owned_id, timeout=12)
                final = inspect(owned_id)
                require(final['State']['Running'] is False and final['State']['Pid'] == 0
                        and final['State'].get('OOMKilled') is False
                        and final['State'].get('ExitCode') == 0)
            except (Exception, KeyboardInterrupt):
                failure = True
        if watch is not None:
            for operation in (watch.sample, watch.stop):
                try:
                    operation()
                except (Exception, KeyboardInterrupt):
                    failure = True
            failure = failure or watch.failure is not None or watch.stop_failure is not None
        try:
            guard()
        except (Exception, KeyboardInterrupt):
            failure = True
    require(not failure and result is not None, 'BACKUP_RECOVERY_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED')
    return {**result, 'ownedRecoveryContainerStopped': True, 'recoveryWatchClosed': True}


def completion_hook(manifest, private_payload, disk_guard):
    """Executable same-parent full path; official transport is owned by Root.

    Neither closures nor callbacks grant permission. The manual workflow must
    validate the separately approved one-shot mode before invoking this hook.
    All inputs to the remote channel are already encrypted; the passphrase and
    private key are read from the existing original reception's private root.
    """
    require(callable(disk_guard) and isinstance(manifest, dict) and isinstance(private_payload, dict))
    used = False
    def complete(*, forward, inputs, resources, collection, sealed, cipher):
        nonlocal used
        require(not used, 'BACKUP_COMPLETION_REUSE_REJECTED')
        used = True
        disk_guard()
        inputs.check_sources()
        context = inputs.backup_context()
        _context(context)
        require(context['exactCommit'] == manifest['exactCommit']
                and context['runId'] == manifest['runId'] and context['runAttempt'] == 1)
        require(sealed['exactCommit'] == context['exactCommit'] and sealed['runId'] == context['runId']
                and sealed['runAttempt'] == 1 and sealed['recipientFingerprint'] == FINGERPRINT
                and sealed['inputManifestSHA'] == context['inputManifestSHA']
                and sealed['manifestSHA256'] == collection['manifestSHA256'])
        require(type(sealed['cipherBytes']) is int and 0 < sealed['cipherBytes'] <= Q.MAX_CIPHER_BYTES
                and collection['selectedPlaintextBytes'] <= Q.MAX_SELECTION_BYTES,
                'BACKUP_ACTUAL_SIZE_EXCEEDS_REVIEWED_BUDGET')
        # Published $0.25/GB/month, charged with a 28-day month and one extra
        # hour of rounding. No free artifact allowance is assumed.
        from decimal import Decimal
        price_bound = (Decimal(sealed['cipherBytes']) / Decimal(10**9)
                       * Decimal('0.25') * Decimal(25) / Decimal(28 * 24))
        require(price_bound <= Decimal('0.05'), 'BACKUP_STORAGE_PRICE_CEILING')
        backup_root = Path(manifest['backupRoot'])
        backup_fd = S._directory(str(backup_root), private=True)
        os.close(backup_fd)
        transport = _load('artifact_transport')
        node = Path(manifest['binaries']['node']['path'])
        node_pin = _source_pin(node, False, disk_guard)
        expected_node = inputs.controller_context()['runtimePins']['node']
        require(all(node_pin[k] == expected_node[k] == manifest['binaries']['node'][k]
                    for k in ('bytes', 'sha256')), 'BACKUP_TRANSPORT_NODE_PIN_MISMATCH')
        returned = transport.roundtrip(Path(cipher), destination=backup_root / 'remote',
            node=node,
            credentials=private_payload['artifactCredentials'], guard=disk_guard)
        require(returned['remoteReadbackObserved'] is True
                and type(returned['artifactId']) is int and returned['artifactId'] > 0
                and all(returned[k] == sealed[k] for k in ('cipherBytes', 'cipherSHA256')))
        # Received original inputs remain in a sibling tree of the existing
        # key home. No new key import, token, key system or retrieval is needed.
        received = Path(inputs.path('auth')).parent.parent
        receive_root = received.parent
        verified = backup_root / 'authenticated'
        readback = authenticated_readback(returned['cipher'], cipher_bytes=sealed['cipherBytes'],
            cipher_sha256=sealed['cipherSHA256'], expected_manifest=collection['manifest'],
            expected_manifest_sha256=collection['manifestSHA256'], context=context,
            destination=str(verified), private_home=str(receive_root / 'gnupg'),
            passphrase_file=str(receive_root / 'receiver-passphrase.PRIVATE'), guard=disk_guard)
        recovery = restore_readback(verified, context=context,
            controller_context=inputs.controller_context(), resources=resources,
            expected_manifest=collection['manifest'], expected_manifest_sha256=collection['manifestSHA256'],
            rollback_root=manifest['rollbackRoot'], guard=disk_guard)
        inputs.check_sources()
        for path in inputs.backup_input_files().values():
            require(Path(path).is_file())
        final = disk_guard()
        receipt = {'schema': 'helmut-w15-backup-return-completion/1',
            'status': 'PASS_ENCRYPTED_OFFHOST_AUTHENTICATED_READBACK_AND_FRESH_500_ZERO_RESTORE',
            'cipherBytes': sealed['cipherBytes'], 'cipherSHA256': sealed['cipherSHA256'],
            'artifactId': returned['artifactId'], 'artifactRetentionDays': 1,
            'publishedStorageUSDPerGBMonth': '0.25',
            'maximumStorageUSD': '0.05', 'actualSizeStorageUSDBound': str(price_bound),
            'remoteReadbackObserved': True, 'databaseRestoreObserved': True,
            'authenticatedReadback': readback, 'independentRecovery': recovery,
            'finalResourceSample': final, 'acceptedAsCompleteBackup': False,
            'independentAcceptanceRequired': True, 'end500Acceptance': False,
            'mock500Acceptance': False, 'productionAcceptance': False,
            'executionAuthority': False, 'retryAllowed': False}
        receipt_fd = S._directory(str(backup_root), private=True)
        try:
            _write(receipt_fd, 'BACKUP_RETURN.SAFE.json', (json.dumps(receipt, sort_keys=True) + '\n').encode())
        finally:
            os.close(receipt_fd)
        return receipt
    return complete


def restore_completion_hook(manifest, private_payload, disk_guard):
    """Restore-only export before stop, frozen collection and same return path."""
    finish = completion_hook(manifest, private_payload, disk_guard)
    used = False
    def complete(*, forward, inputs, resources, watch, restored):
        nonlocal used
        require(not used and restored['profiles'] == 500 and restored['active'] == 0)
        used = True
        disk_guard()
        context = inputs.backup_context()
        _bind_disk_guard(watch, disk_guard)
        watch.backup_runner = T.O.OwnedBackupRunner(watch, forward.M, base=forward.BASE,
            container=forward.CONTAINER, database=forward.DB, scope='end500-backup')
        export_restore_database(context, expected_context=context, work=forward.WORK,
            container=forward.CONTAINER, database=forward.DB, supervisor=watch,
            run_owned=watch.backup_runner.run_owned)
        # Freeze original private outputs before independently walking them.
        info = json.loads(forward.M.docker('inspect', forward.CONTAINER))[0]
        require(info['Image'] == forward.M.IMAGE and info['State']['Running'] is True
                and re.fullmatch('[a-f0-9]{64}', info['Id']))
        owned_id = info['Id']
        resources.check_pid(info['State']['Pid'], owned_id)
        require(info['HostConfig']['CgroupParent'] == resources.unit)
        forward.M.docker('stop', '--time', '5', owned_id, timeout=12)
        final = json.loads(forward.M.docker('inspect', owned_id))[0]
        require(final['Id'] == owned_id and final['State']['Running'] is False
                and final['State']['Pid'] == 0 and final['State'].get('OOMKilled') is False
                and final['State'].get('ExitCode') == 0)
        watch.sample()
        watch.stop()
        require(watch.failure is None and watch.stop_failure is None and watch.finished.is_set()
                and not watch.thread.is_alive() and not watch.reporter.is_alive())
        disk_guard()
        root = Path(manifest['backupRoot'])
        collection = collect_restore_backup(context, expected_context=context,
            input_files=inputs.backup_input_files(), work=forward.WORK, prepared=forward.PREP,
            provenance_files=inputs.backup_provenance_files(), destination=root / 'selection', guard=disk_guard)
        cipher = root / 'restore-complete.PRIVATE.gpg'
        sealed = seal_restore_backup(collection, root=root / 'selection', output=cipher,
            public_key=forward.ROOT / 'docs/betrieb/belege/w15-end500-transfer-20261029/receiver-public.asc',
            guard=disk_guard)
        result = finish(forward=forward, inputs=inputs, resources=resources,
            collection=collection, sealed=sealed, cipher=cipher)
        return {**result, 'watchClosed': True, 'ownedContainerStopped': True}
    return complete



_tree, _work_rows, _source_pin = R._tree, R._work_rows, R._source_pin


def _restore_selection_plan(context, selection, observed):
    _context(context)
    require(isinstance(selection, list) and 0 < len(selection) <= Q.MAX_ARCHIVE_MEMBERS)
    rows = []
    names = set()
    for row in selection:
        require(isinstance(row, dict) and set(row) == {'path', 'bytes', 'sha256', 'role'})
        B._path(row['path'])
        require(row['path'] not in names and type(row['bytes']) is int and row['bytes'] >= 0
                and isinstance(row['sha256'], str) and B.SHA.fullmatch(row['sha256']))
        names.add(row['path'])
        rows.append({k: row[k] for k in ('path', 'bytes', 'sha256')})
    require(sorted(rows, key=lambda x: x['path']) == sorted(observed, key=lambda x: x['path']))
    lookup = {row['path']: row for row in rows}
    required = {'work/RESTORED500_ZERO.SAFE.json',
                'work/state/restore/RESTORE_CLOSURE.PRIVATE.json',
                'database/final.PRIVATE.dump', 'database/roles.PRIVATE.sql',
                'database/SNAPSHOT_CLOSURE.PRIVATE.json'}
    for action in T.ACTIONS:
        required.update({'work/state/restore/' + action + suffix for suffix in
                         ('.SAFE.json', '.PRIVATE.stdout', '.PRIVATE.stderr', '.lifecycle.PRIVATE.jsonl')})
        required.add('work/state/' + action + '.node.SAFE.json')
    require(required <= names, 'RESTORE_BACKUP_REQUIRED_EVIDENCE_MISSING')
    for key, pin in B.input_pins().items():
        selected = lookup.get('inputs/' + key[6:] + '.PRIVATE')
        require(selected is not None and all(selected[k] == pin[k] for k in ('bytes', 'sha256')))
    total = sum(row['bytes'] for row in rows)
    require(total <= Q.MAX_SELECTION_BYTES, 'RESTORE_BACKUP_SELECTION_DISK_LIMIT')
    manifest = {'version': 1, **{key: context[key] for key in (
        'exactCommit', 'runId', 'runAttempt', 'inputManifestSHA', 'recipientFingerprint')},
        'files': sorted(rows, key=lambda x: x['path'])}
    raw = (json.dumps(manifest, sort_keys=True, separators=(',', ':')) + '\n').encode()
    require(len(raw) <= S.MAX_MANIFEST)
    return {'schema': 'helmut-w15-restore-backup-selection/1',
            'status': 'PASS_DECLARED_RESTORE_ROOTS_COLLECTED_ONLY',
            'context': context, 'manifest': manifest,
            'manifestSHA256': hashlib.sha256(raw).hexdigest(),
            'selectedPlaintextBytes': total, 'fileCount': len(rows),
            'inputFiles': 12, 'inputBytes': B.TOTAL_INPUT_BYTES,
            'databaseRestoreObserved': False, 'remoteReadbackObserved': False,
            'acceptedAsCompleteBackup': False, 'executionAuthority': False,
            'end500Started': False, 'mock500Started': False}


def collect_restore_backup(context, *, expected_context, input_files, work, prepared, provenance_files, destination, guard=None):
    """Copy complete declared roots into one NEW private seal tree, then recheck.

    Call only after the original database export and container closure; keep the same common parent observer live.
    No PGDATA/key tree is collected. A consistent logical final dump is required
    instead. This observes the declared roots, not arbitrary files elsewhere.
    The result still needs independent completeness, restore and remote review.
    """
    _context(context)
    require(guard is None or callable(guard))
    if guard is not None:
        guard()
    _context(expected_context)
    require(context == expected_context, 'BACKUP_CONTEXT_MISMATCH')
    require(set(input_files) == {key[6:] for key in B.input_pins()})
    work, prepared, destination = map(Path, (work, prepared, destination))
    require(destination.is_absolute() and all(os.path.commonpath([str(p), str(destination)]) != str(p)
            for p in (work, prepared)))
    # PGDATA must be accounted as a deliberate physical exclusion; never walk
    # it and never claim that copying live files produces a logical snapshot.
    work_fd = S._directory(str(work), private=True)
    try:
        names, rows = _work_rows(work, work_fd, guard=guard)
        prepared_rows = _tree(prepared, private=False, guard=guard)
        originals = [(work / row['path'], 'work/' + row['path'], row, True) for row in rows]
        originals += [(prepared / row['path'], 'prepare/' + row['path'], row, False) for row in prepared_rows]
        mappings = {'work/state/final-backup/final.PRIVATE.dump': B.REQUIRED['finalDump'],
                    'work/state/final-backup/roles.PRIVATE.sql': B.REQUIRED['finalRoles'],
                    'work/state/final-backup/SNAPSHOT_CLOSURE.PRIVATE.json': B.REQUIRED['snapshotEvidence']}
        for key, path in input_files.items():
            pin = B.input_pins()['input:' + key]
            originals.append((Path(path), 'inputs/' + key + '.PRIVATE', {**pin, 'role': 'input:' + key}, True))
        for name, path in provenance_files.items():
            B._path(name)
            source = Path(path)
            originals.append((source, 'provenance/' + name, {**_source_pin(source, False, guard), 'role': 'provenance'}, False))
        parent = S._directory(str(destination.parent), private=True)
        try:
            os.mkdir(destination.name, 0o700, dir_fd=parent)
            os.fsync(parent)
        finally:
            os.close(parent)
        dest_fd = S._directory(str(destination), private=True)
        selection, source_snapshots = [], []
        try:
            for source, relative, pin, private in originals:
                if guard is not None:
                    guard()
                relative = mappings.get(relative, relative)
                B._path(relative)
                role = pin.get('role') or next((key for key, value in B.REQUIRED.items() if value == relative), 'diagnostic')
                directory = os.dup(dest_fd)
                try:
                    parts = relative.split('/')
                    for part in parts[:-1]:
                        try:
                            os.mkdir(part, 0o700, dir_fd=directory)
                        except FileExistsError:
                            pass
                        child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
                        os.close(directory)
                        directory = child
                    source_parent = S._directory(str(source.parent), private=private)
                    try:
                        child = os.open(source.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=source_parent)
                    finally:
                        os.close(source_parent)
                    try:
                        before = S._snapshot(os.fstat(child))
                        require(stat.S_ISREG(before[5]) and before[6] == os.geteuid() and before[7] == 1
                                and stat.S_IMODE(before[5]) & 0o022 == 0)
                        if 'snapshot' in pin:
                            require(before == pin['snapshot'])
                        if private:
                            require(stat.S_IMODE(before[5]) == 0o600)
                        out = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
                        size, digest = 0, hashlib.sha256()
                        with os.fdopen(out, 'wb') as stream:
                            while block := os.read(child, S.CHUNK):
                                if guard is not None:
                                    guard()
                                size += len(block)
                                require(size <= pin['bytes'])
                                digest.update(block)
                                stream.write(block)
                            stream.flush()
                            os.fsync(stream.fileno())
                        require(size == pin['bytes'] and digest.hexdigest() == pin['sha256']
                                and S._snapshot(os.fstat(child)) == before)
                        selection.append({'role': role, 'path': relative, 'bytes': size, 'sha256': digest.hexdigest()})
                        source_snapshots.append((source, before))
                    finally:
                        os.close(child)
                finally:
                    os.close(directory)
            # A complete independent scan of the NEW destination detects omitted
            # or extra files. The source roots are also rescanned for drift.
            inventory = [{key: row[key] for key in ('path', 'bytes', 'sha256')} for row in _tree(destination, private=True, guard=guard)]
            require(_tree(prepared, private=False, guard=guard) == prepared_rows)
            require(_work_rows(work, work_fd, guard=guard) == (names, rows))
            for source, before in source_snapshots:
                require(S._snapshot(source.lstat()) == before)
            plan = _restore_selection_plan(context, selection, inventory)
            raw = (json.dumps(plan['manifest'], sort_keys=True, separators=(',', ':')) + '\n').encode()
            require(hashlib.sha256(raw).hexdigest() == plan['manifestSHA256'])
            _write(dest_fd, 'manifest.PRIVATE.json', raw)
            if guard is not None:
                guard()
            return {**plan, 'declaredRootsCollectedAndRechecked': True,
                    'physicalPGDATAExcludedInFavorOfLogicalDump': True,
                    'acceptedAsCompleteBackup': False}
        finally:
            os.close(dest_fd)
    except (Exception, KeyboardInterrupt):
        raise BackupRuntimeError('RESTORE_BACKUP_COLLECTION_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED') from None
    finally:
        os.close(work_fd)
