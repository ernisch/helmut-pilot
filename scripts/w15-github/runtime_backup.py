"""Executable End500 backup helpers; no CLI and no actions on import.

The controller must supply an actual bounded owned-process executor. Its new
backup-* actions require PID registration and verified stop handling. Export
files are opened by Node inside the original container, so database children
and their file-cache writes stay in the original common cgroup. A successful
export/collection never means that restore or remote readback has succeeded.
"""
import sys
sys.dont_write_bytecode = True

import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shlex
import stat
import subprocess
import time


def _load(name):
    spec = importlib.util.spec_from_file_location('w15_runtime_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


B, S = _load('backup_contract'), _load('seal')
DOCKER = ('docker', '--host=unix:///var/run/docker.sock')
ACTIONS = ('backup-before', 'backup-dump', 'backup-roles', 'backup-after')
OUTPUTS = {
    'backup-before': 'before.PRIVATE.json',
    'backup-dump': 'final.PRIVATE.dump',
    'backup-roles': 'roles.PRIVATE.sql',
    'backup-after': 'after.PRIVATE.json',
}

SNAPSHOT_SQL = """begin isolation level repeatable read read only;
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

# Executed only through the controller's owned runner. Raw child output never
# reaches the Actions console. argv0 keeps every grouped native child bound to
# this BASE for the existing owned-process cmdline check.
NODE_WORKER = r'''"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),crypto=require("node:crypto");
const [base,action,database,sql]=process.argv.slice(1),root=base+"/state/final-backup";
const files={"backup-before":"before.PRIVATE.json","backup-dump":"final.PRIVATE.dump",
 "backup-roles":"roles.PRIVATE.sql","backup-after":"after.PRIVATE.json"};
function need(v){if(!v)throw Error("W15_BACKUP_REJECTED");}
function directory(path){let fd=fs.openSync("/",fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);
 try{for(const part of path.slice(1).split("/")){need(part&&part!=="."&&part!=="..");
  const next=fs.openSync("/proc/self/fd/"+fd+"/"+part,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  fs.closeSync(fd);fd=next;}const s=fs.fstatSync(fd);need(s.uid===process.getuid()&&(s.mode&511)===448);return fd;
 }catch(e){fs.closeSync(fd);throw e;}}
function hash(fd){const h=crypto.createHash("sha256"),buf=Buffer.alloc(65536);let n,size=0;
 while((n=fs.readSync(fd,buf,0,buf.length,null))){h.update(buf.subarray(0,n));size+=n;}
 return {bytes:size,sha256:h.digest("hex")};}
(async()=>{let dir,state,out,err,journal,child,term=false,journalFailed=false,sequence=0;
 const record=value=>{try{fs.writeFileSync(journal,JSON.stringify({sequence:sequence++,action,...value})+"\n");fs.fdatasyncSync(journal);}catch(e){journalFailed=true;throw e;}};
 const stop=()=>{term=true;try{record({event:"signal-received",signal:"SIGTERM"});}catch{}
   if(child&&child.exitCode===null&&child.signalCode===null)try{child.kill("SIGTERM");}catch{journalFailed=true;}};
 try{need(Object.hasOwn(files,action));dir=directory(root);state=directory(base+"/state");
  const open=name=>fs.openSync("/proc/self/fd/"+dir+"/"+name,
    fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_RDWR|fs.constants.O_NOFOLLOW,384);
  journal=open(action+".lifecycle.PRIVATE.jsonl");
  process.on("SIGTERM",stop);
  const stat=fs.readFileSync("/proc/self/stat","utf8"),fields=stat.slice(stat.lastIndexOf(") ")+2).split(" ");
  const identity={phase:action,pid:process.pid,startTicks:fields[19]};need(/^\d+$/.test(identity.startTicks));
  const identityFD=fs.openSync("/proc/self/fd/"+state+"/"+action+".node.SAFE.json",
    fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,384);
  try{fs.writeFileSync(identityFD,JSON.stringify(identity)+"\n");fs.fsyncSync(identityFD);}finally{fs.closeSync(identityFD);}
  fs.fsyncSync(state);record({event:"owned-handler-ready",identity});
  out=open(files[action]);err=open(action+".PRIVATE.stderr");
  const common=["--no-password","--host=/var/run/postgresql","--port=5432","--username=postgres"];
  let exe,args;
  if(action==="backup-dump"){exe="pg_dump";args=[...common,"--format=custom","--create","--dbname="+database];}
  else if(action==="backup-roles"){exe="pg_dumpall";args=[...common,"--database=postgres","--roles-only"];}
  else{exe="psql";args=["-X","-w","-qAt","-v","ON_ERROR_STOP=1",...common,"--dbname="+database,"--command="+sql];}
  need(!term);child=cp.spawn("/usr/lib/postgresql/17/bin/"+exe,args,{argv0:base+"/"+exe,stdio:["ignore",out,err],
    env:{PATH:"/usr/lib/postgresql/17/bin:/usr/bin:/bin",LANG:"C.UTF-8",LC_ALL:"C.UTF-8"}});
  let spawnError=false;child.once("error",()=>{spawnError=true;});
  record({event:"owned-child-spawned",pid:child.pid||null});
  const ended=await new Promise(resolve=>child.once("close",(code,signal)=>resolve({code,signal})));
  record({event:"owned-child-exit",code:ended.code,signal:ended.signal});
  fs.fsyncSync(out);fs.fsyncSync(err);
  fs.closeSync(out);out=undefined;fs.closeSync(err);err=undefined;
  need(!spawnError&&!term&&!journalFailed&&ended.code===0&&ended.signal===null);
  record({event:"owned-backup-closed",dataFilesOpen:0,termReceived:term});
  fs.closeSync(journal);journal=undefined;
  const read=name=>{const f=fs.openSync("/proc/self/fd/"+dir+"/"+name,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{return hash(f);}finally{fs.closeSync(f);}};
  const result={status:"PASS_OWNED_DATABASE_EXPORT_STEP",action,returncode:ended.code,signal:ended.signal,
    output:read(files[action]),stderr:read(action+".PRIVATE.stderr"),identity,
    lifecycle:read(action+".lifecycle.PRIVATE.jsonl")};
  const receipt=open(action+".SAFE.json");try{fs.writeFileSync(receipt,JSON.stringify(result)+"\n");fs.fsyncSync(receipt);}finally{fs.closeSync(receipt);}
  fs.fsyncSync(dir);
 }catch(e){if(child&&child.exitCode===null&&child.signalCode===null)try{child.kill("SIGTERM");}catch{}
   process.stderr.write("W15_BACKUP_STEP_FAILED\n");process.exitCode=1;}
 finally{process.removeListener("SIGTERM",stop);for(const fd of [out,err,journal,state,dir])if(fd!==undefined)try{fs.closeSync(fd);}catch{}}
})();'''


class BackupRuntimeError(Exception):
    """No private exception text may escape these helpers."""


def require(value, code='BACKUP_RUNTIME_REJECTED'):
    if not value:
        raise BackupRuntimeError(code)


def _json(fd, name, limit=65536):
    child, snap = S._file(fd, name)
    try:
        require(0 < snap[2] <= limit)
        raw = os.read(child, limit + 1)
        require(len(raw) == snap[2] and S._snapshot(os.fstat(child)) == snap)
        def pairs(items):
            out = {}
            for key, value in items:
                require(key not in out)
                out[key] = value
            return out
        return json.loads(raw, object_pairs_hook=pairs)
    finally:
        os.close(child)


def _pin(fd, name, guard=None):
    child, before = S._file(fd, name)
    try:
        size, digest = S._hash_fd(child, guard)
        require(size == before[2] and S._snapshot(os.fstat(child)) == before)
        return {'bytes': size, 'sha256': digest}
    finally:
        os.close(child)


def _lifecycle(fd, action):
    child, snap = S._file(fd, action + '.lifecycle.PRIVATE.jsonl')
    try:
        require(0 < snap[2] <= 65536)
        raw = os.read(child, 65537)
        require(len(raw) == snap[2] and S._snapshot(os.fstat(child)) == snap)
        rows = [json.loads(line) for line in raw.splitlines()]
        require(len(rows) == 4 and [x.get('sequence') for x in rows] == list(range(4))
                and all(x.get('action') == action for x in rows)
                and [x.get('event') for x in rows] == ['owned-handler-ready', 'owned-child-spawned',
                    'owned-child-exit', 'owned-backup-closed']
                and type(rows[1].get('pid')) is int and rows[1]['pid'] > 1
                and rows[2].get('code') == 0 and rows[2].get('signal') is None
                and rows[3].get('dataFilesOpen') == 0 and rows[3].get('termReceived') is False)
        return rows[0]['identity']
    finally:
        os.close(child)


def _write(fd, name, raw):
    child = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
    with os.fdopen(child, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    os.fsync(fd)


def _sample(supervisor):
    require(supervisor.thread.is_alive() and not supervisor.finished.is_set()
            and supervisor.disk_phase == 'processing', 'BACKUP_MONITOR_NOT_LIVE')
    supervisor.sample()
    value = supervisor.last
    require(isinstance(value, dict) and value.get('configuredLimit') == '2560000000'
            and value.get('swapMaximum') == '0' and value.get('swapCurrentBytes') == 0)
    require(all(type(value.get(k)) is int and 0 <= value[k] <= 2048000000
                for k in ('kernelLifetimePeakBytes', 'currentBytes')))
    events = value.get('events')
    require(isinstance(events, dict) and all(type(events.get(k)) is int and events[k] == 0
            for k in ('max', 'oom', 'oom_kill', 'oom_group_kill')))
    return json.loads(json.dumps(value))


def _closure(work):
    service = _json(work, 'SERVICE_CLOSURE.SAFE.json')
    require(service.get('status') == 'PASS_GENUINE_OWNED_SERVICE_EXIT')
    require(service['signalRequest']['accepted'] is True and service['signalRequest']['signal'] == 'SIGTERM')
    closed, drain = service['servicesStopped'], service['durableDrain']
    require(closed['confirmed'] is True and closed['forced'] is False
            and closed['openSockets'] == closed['agentSockets'] == closed['agentFreeSockets'] == 0)
    require(drain['confirmed'] is True and drain['journal']['closed'] is True
            and drain['journal']['status'] == 'DURABLE_ACKNOWLEDGED' and drain['journal']['pendingEntries'] == 0)
    for name in ('NATIVE_ZERO.SAFE.json', 'NATIVE_ZERO_AFTER_AUDIT.SAFE.json'):
        zero = _json(work, name)
        require(zero.get('activeProfiles') == 0 and zero.get('confirmed') is True)
    audit = _json(work, 'FINAL_NATIVE_AUDIT.SAFE.json')
    require(audit.get('status') == 'PASS_COMPLETE_LOSSLESS_NATIVE_POSTIMAGES_AND_ZERO_ONLY'
            and audit.get('captureComplete') is True and audit.get('actualPopenReturncode') == 0)
    archive_pin = _pin(work, 'FINAL_NATIVE_AUDIT.PRIVATE.jsonl.gz')
    require(all(archive_pin[k] == audit['gzipPin'][k] for k in ('bytes', 'sha256')))


def export_final_database(context, *, expected_context, work, container, database, supervisor, run_owned, seconds=600):
    """Actually export once when called by the separately authorized controller.

    ``run_owned(argv, action, seconds)`` must execute, retain private output,
    and verify inner termination on every outcome; it returns CompletedProcess.
    It must support all ACTIONS in the existing owned-process lifecycle. No
    caller boolean can replace physical private output/receipt checks below.
    """
    B._context(expected_context)
    require(context == expected_context, 'BACKUP_CONTEXT_MISMATCH')
    B.database_export_plan(context, database=database, container=container)
    require(callable(run_owned) and type(seconds) is int and 30 <= seconds <= 600)
    deadline = time.monotonic() + seconds
    work_fd = state_fd = output_fd = None
    try:
        work = Path(work)
        work_fd = S._directory(str(work), private=True)
        state_fd = S._directory(str(work / 'state'), private=True)
        _closure(work_fd)
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
            require(set(observed) == {'database', 'profiles', 'activeProfiles', 'otherClientBackends', 'rolesDigest', 'readOnly',
                    'foreignTables', 'tableInventory', 'sequenceInventory'}
                    and observed['database'] == database and observed['profiles'] == 500
                    and observed['activeProfiles'] == observed['otherClientBackends'] == 0
                    and observed['readOnly'] == 'on' and isinstance(observed['rolesDigest'], str)
                    and len(observed['rolesDigest']) == 32
                    and observed['foreignTables'] == 0
                    and isinstance(observed['tableInventory'], list) and observed['tableInventory']
                    and isinstance(observed['sequenceInventory'], list))
        require(a == z, 'BACKUP_SNAPSHOT_CLOSURE_CHANGED')
        child, _ = S._file(output_fd, OUTPUTS['backup-dump'])
        try:
            require(os.read(child, 5) == b'PGDMP', 'BACKUP_CUSTOM_DUMP_HEADER')
        finally:
            os.close(child)
        final = _sample(supervisor)
        result = {'schema': 'helmut-w15-runtime-database-export/1',
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
        raise BackupRuntimeError('DATABASE_EXPORT_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED') from None
    finally:
        for fd in (output_fd, state_fd, work_fd):
            if fd is not None:
                os.close(fd)


def _tree(root, *, private, prefix='', fd=None, guard=None):
    """Read the whole declared root; pgdata alone is deliberately not logical backup."""
    opened = fd is None
    if opened:
        fd = S._directory(str(root), private=private)
    rows = []
    try:
        value = os.fstat(fd)
        require(value.st_uid == os.geteuid() and stat.S_IMODE(value.st_mode) & 0o022 == 0)
        if private:
            require(stat.S_IMODE(value.st_mode) == 0o700)
        for name in sorted(os.listdir(fd)):
            if guard is not None:
                guard()
            relative = prefix + name
            B._path(relative)
            value = os.stat(name, dir_fd=fd, follow_symlinks=False)
            if stat.S_ISDIR(value.st_mode):
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                try:
                    rows.extend(_tree(root, private=private, prefix=relative + '/', fd=child, guard=guard))
                finally:
                    os.close(child)
            else:
                child = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
                try:
                    before = S._snapshot(os.fstat(child))
                    require(stat.S_ISREG(before[5]) and before[6] == os.geteuid() and before[7] == 1
                            and stat.S_IMODE(before[5]) & 0o022 == 0)
                    if private:
                        require(stat.S_IMODE(before[5]) == 0o600)
                    size, digest = S._hash_fd(child, guard)
                    require(size == before[2] and S._snapshot(os.fstat(child)) == before)
                    rows.append({'path': relative, 'bytes': size, 'sha256': digest, 'snapshot': before})
                finally:
                    os.close(child)
        return rows
    finally:
        if opened:
            os.close(fd)


def _work_rows(work, fd, guard=None):
    names, rows = os.listdir(fd), []
    require('pgdata' in names)
    for name in sorted(names):
        value = os.stat(name, dir_fd=fd, follow_symlinks=False)
        if name == 'pgdata':
            require(stat.S_ISDIR(value.st_mode))
            continue
        if stat.S_ISDIR(value.st_mode):
            rows.extend({**row, 'path': name + '/' + row['path']} for row in _tree(work / name, private=True, guard=guard))
        else:
            child, snap = S._file(fd, name)
            try:
                size, digest = S._hash_fd(child, guard)
                require(S._snapshot(os.fstat(child)) == snap)
                rows.append({'path': name, 'bytes': size, 'sha256': digest, 'snapshot': snap})
            finally:
                os.close(child)
    return sorted(names), rows


def _source_pin(source, private, guard=None):
    parent = S._directory(str(source.parent), private=private)
    child = None
    try:
        child = os.open(source.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        before = S._snapshot(os.fstat(child))
        require(stat.S_ISREG(before[5]) and before[6] == os.geteuid() and before[7] == 1
                and stat.S_IMODE(before[5]) & 0o022 == 0)
        if private:
            require(stat.S_IMODE(before[5]) == 0o600)
        size, digest = S._hash_fd(child, guard)
        require(S._snapshot(os.fstat(child)) == before)
        return {'bytes': size, 'sha256': digest, 'snapshot': before}
    finally:
        if child is not None:
            os.close(child)
        os.close(parent)


def collect_backup(context, *, expected_context, input_files, work, prepared, provenance_files, destination, guard=None):
    """Copy complete declared roots into one NEW private seal tree, then recheck.

    Call only after the final monitor has drained and controller result exists.
    No PGDATA/key tree is collected. A consistent logical final dump is required
    instead. This observes the declared roots, not arbitrary files elsewhere.
    The result still needs independent completeness, restore and remote review.
    """
    B._context(context)
    require(guard is None or callable(guard))
    if guard is not None:
        guard()
    B._context(expected_context)
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
            plan = B.selection_plan(context, selection, inventory, expected_context=context)
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
        raise BackupRuntimeError('BACKUP_COLLECTION_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED') from None
    finally:
        os.close(work_fd)
