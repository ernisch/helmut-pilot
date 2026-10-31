"""Connect the existing isolated restore commands to owned native stages.

No CLI and no action on import. Restore receipts are distinct from final backup
closure and cannot accept a complete backup, End500, Mock500 or runtime GO.
"""
import sys
sys.dont_write_bytecode = True

import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import time


def _load(name):
    spec = importlib.util.spec_from_file_location('w15_restore_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


B, O = _load('runtime_backup'), _load('runtime_owned_backup')
BASE, DATABASE = B.B.BASE, B.B.DATABASE
DOCKER = B.DOCKER
ACTIONS = O.RESTORE_ACTIONS
OUTPUTS = {action: action + '.PRIVATE.stdout' for action in ACTIONS}
CHECK_SQL = "select jsonb_build_object('profiles',count(*),'active',count(*)filter(where aktiv))from public.mandate_profiles;"


class RestoreRuntimeError(RuntimeError):
    def __init__(self, code='ISOLATED_RESTORE_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED', *, actionName=None,
                 runnerReturncode=None):
        self.actionName = actionName if type(actionName) is str and actionName in ACTIONS else None
        # Direct docker-exec client observation only. No cached supervisor status
        # can establish a PostgreSQL/native exit, including a cached zero.
        self.runnerReturncode = runnerReturncode if type(runnerReturncode) is int and -255 <= runnerReturncode <= 255 else None
        self.nativeExit = None
        super().__init__(code)


def require(value):
    if not value:
        raise RestoreRuntimeError('ISOLATED_RESTORE_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED')


def restore_legacy(controller):
    """The original restore commands, unchanged in content and order."""
    M, DB, CONTAINER, BASE = controller, controller.DB, controller.CONTAINER, controller.BASE
    M.sql('create database '+DB+';',database='postgres')
    M.docker('exec',CONTAINER,'psql','-X','-w','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',DB,'-f',BASE+'/roles.PRIVATE.sql')
    M.docker('exec',CONTAINER,'pg_restore','--exit-on-error','--file='+BASE+'/restore.PRIVATE.sql',BASE+'/input.PRIVATE.dump')
    M.docker('exec',CONTAINER,'psql','-X','-w','-q','-v','ON_ERROR_STOP=1','--single-transaction','-U','postgres','-d',DB,
      '-f',BASE+'/restore.PRIVATE.sql','-c','update public.mandate_profiles set aktiv=false where aktiv;')
    restored=M.read(CHECK_SQL,database=DB)
    assert restored=={'profiles':500,'active':0},'w15-forward-restored500-zero'
    M.save('RESTORED500_ZERO.SAFE.json',restored)
    return restored


# Same owned Node/native-child lifecycle as the existing backup worker. SQL and
# executable choices are fixed here; no caller-supplied shell or SQL is accepted.
NODE_WORKER = r'''"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),crypto=require("node:crypto");
const [base,action,database]=process.argv.slice(1),root=base+"/state/restore";
const actions=["restore-create","restore-roles","restore-render","restore-apply","restore-check"];
function need(v){if(!v)throw Error("W15_RESTORE_REJECTED");}
function directory(path){let fd=fs.openSync("/",fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);
 try{for(const part of path.slice(1).split("/")){need(part&&part!=="."&&part!=="..");
  const next=fs.openSync("/proc/self/fd/"+fd+"/"+part,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  fs.closeSync(fd);fd=next;}const s=fs.fstatSync(fd);need(s.uid===process.getuid()&&(s.mode&511)===448);return fd;
 }catch(e){fs.closeSync(fd);throw e;}}
function hash(fd){const h=crypto.createHash("sha256"),buf=Buffer.alloc(65536);let n,size=0;
 while((n=fs.readSync(fd,buf,0,buf.length,null))){h.update(buf.subarray(0,n));size+=n;}
 return {bytes:size,sha256:h.digest("hex")};}
function read(fd,name){const f=fs.openSync("/proc/self/fd/"+fd+"/"+name,
  fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{const s=fs.fstatSync(f);need(s.isFile()&&s.uid===process.getuid()&&s.nlink===1&&(s.mode&511)===384);
  const pin=hash(f),z=fs.fstatSync(f);need(s.dev===z.dev&&s.ino===z.ino&&s.size===z.size
    &&s.mtimeMs===z.mtimeMs&&s.ctimeMs===z.ctimeMs&&pin.bytes===s.size);return pin;
 }finally{fs.closeSync(f);}}
(async()=>{let dir,state,out,err,journal,child,closed,term=false,journalFailed=false,sequence=0;
 const record=value=>{try{fs.writeFileSync(journal,JSON.stringify({sequence:sequence++,action,...value})+"\n");fs.fdatasyncSync(journal);}catch(e){journalFailed=true;throw e;}};
 const stop=()=>{term=true;try{record({event:"signal-received",signal:"SIGTERM"});}catch{}
   if(child&&child.exitCode===null&&child.signalCode===null)try{child.kill("SIGTERM");}catch{journalFailed=true;}};
 try{need(process.argv.slice(1).length===3&&/^\/tmp\/w15-[a-z0-9-]+$/.test(base)
      &&database==="helmut_w15_memory_atomic_20261028d"&&actions.includes(action));
  need(!fs.existsSync(base+"/state/STOP_REQUESTED.SAFE.json"));
  dir=directory(root);state=directory(base+"/state");
  const open=name=>fs.openSync("/proc/self/fd/"+dir+"/"+name,
    fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_RDWR|fs.constants.O_NOFOLLOW,384);
  journal=open(action+".lifecycle.PRIVATE.jsonl");process.on("SIGTERM",stop);
  const stat=fs.readFileSync("/proc/self/stat","utf8"),fields=stat.slice(stat.lastIndexOf(") ")+2).split(" ");
  const identity={phase:action,pid:process.pid,startTicks:fields[19]};need(/^\d+$/.test(identity.startTicks));
  const identityFD=fs.openSync("/proc/self/fd/"+state+"/"+action+".node.SAFE.json",
    fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,384);
  try{fs.writeFileSync(identityFD,JSON.stringify(identity)+"\n");fs.fsyncSync(identityFD);}finally{fs.closeSync(identityFD);}
  fs.fsyncSync(state);record({event:"owned-handler-ready",identity});
  out=open(action+".PRIVATE.stdout");err=open(action+".PRIVATE.stderr");
  if(action==="restore-apply"){const rendered=JSON.parse(fs.readFileSync("/proc/self/fd/"+dir+"/restore-render.SAFE.json","utf8"));
    need(rendered.status==="PASS_OWNED_ISOLATED_RESTORE_STEP"&&rendered.action==="restore-render");
    const baseFD=directory(base);try{need(JSON.stringify(read(baseFD,"restore.PRIVATE.sql"))===JSON.stringify(rendered.renderedSQL));}finally{fs.closeSync(baseFD);}}
  let exe="psql",args,sql;
  const common=["-X","-w","-q","-v","ON_ERROR_STOP=1"];
  if(action==="restore-create"){args=["-X","-w","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres","-f","-"];sql="create database "+database+";";}
  else if(action==="restore-roles"){args=[...common,"-U","postgres","-d",database,"-f",base+"/roles.PRIVATE.sql"];}
  else if(action==="restore-render"){exe="pg_restore";args=["--exit-on-error","--file="+base+"/restore.PRIVATE.sql",base+"/input.PRIVATE.dump"];}
  else if(action==="restore-apply"){args=[...common,"--single-transaction","-U","postgres","-d",database,"-f",base+"/restore.PRIVATE.sql","-c","update public.mandate_profiles set aktiv=false where aktiv;"];}
  else{args=["-X","-w","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",database,"-f","-"];
    sql="begin read only;set local statement_timeout='15s';set local lock_timeout='3s';select jsonb_build_object('profiles',count(*),'active',count(*)filter(where aktiv))from public.mandate_profiles;rollback;";}
  need(!term&&!fs.existsSync(base+"/state/STOP_REQUESTED.SAFE.json"));
  child=cp.spawn("/usr/lib/postgresql/17/bin/"+exe,args,{argv0:base+"/"+exe,
    stdio:[sql===undefined?"ignore":"pipe",out,err],
    env:{PATH:"/usr/lib/postgresql/17/bin:/usr/bin:/bin",LANG:"C.UTF-8",LC_ALL:"C.UTF-8"}});
  let spawnError=false,stdinError=false;child.once("error",()=>{spawnError=true;});
  closed=new Promise(resolve=>child.once("close",(code,signal)=>resolve({code,signal})));
  if(child.stdin){child.stdin.once("error",()=>{stdinError=true;});child.stdin.end(sql);}
  record({event:"owned-child-spawned",pid:child.pid||null});
  const ended=await closed;record({event:"owned-child-exit",code:ended.code,signal:ended.signal});
  fs.fsyncSync(out);fs.fsyncSync(err);fs.closeSync(out);out=undefined;fs.closeSync(err);err=undefined;
  need(!spawnError&&!stdinError&&!term&&!journalFailed&&ended.code===0&&ended.signal===null);
  const result={status:"PASS_OWNED_ISOLATED_RESTORE_STEP",action,returncode:ended.code,signal:ended.signal,
    output:read(dir,action+".PRIVATE.stdout"),stderr:read(dir,action+".PRIVATE.stderr"),identity};
  if(action==="restore-render"){const baseFD=directory(base);let src,dest;
    try{src=fs.openSync("/proc/self/fd/"+baseFD+"/restore.PRIVATE.sql",fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
      const s=fs.fstatSync(src);need(s.isFile()&&s.uid===process.getuid()&&s.nlink===1&&(s.mode&511)===384);
      dest=open("rendered.PRIVATE.sql");const h=crypto.createHash("sha256"),buf=Buffer.alloc(65536);let n,size=0;
      while((n=fs.readSync(src,buf,0,buf.length,null))){need(!term&&!journalFailed);let at=0;
        while(at<n){const written=fs.writeSync(dest,buf,at,n-at);need(written>0);at+=written;}h.update(buf.subarray(0,n));size+=n;need(size<=s.size);}
      const z=fs.fstatSync(src);need(size===s.size&&s.dev===z.dev&&s.ino===z.ino&&s.size===z.size&&s.mtimeMs===z.mtimeMs&&s.ctimeMs===z.ctimeMs);
      fs.fsyncSync(dest);result.renderedSQL={bytes:size,sha256:h.digest("hex")};
      need(JSON.stringify(read(baseFD,"restore.PRIVATE.sql"))===JSON.stringify(result.renderedSQL));
    }finally{for(const fd of [src,dest,baseFD])if(fd!==undefined)fs.closeSync(fd);}}
  need(!term&&!journalFailed);
  record({event:"owned-restore-closed",dataFilesOpen:0,termReceived:term});
  fs.closeSync(journal);journal=undefined;
  result.lifecycle=read(dir,action+".lifecycle.PRIVATE.jsonl");
  const receipt=open(action+".SAFE.json");try{fs.writeFileSync(receipt,JSON.stringify(result)+"\n");fs.fsyncSync(receipt);}finally{fs.closeSync(receipt);}
  fs.fsyncSync(dir);
 }catch(e){if(child&&closed){if(child.exitCode===null&&child.signalCode===null)try{child.kill("SIGTERM");}catch{}
    const force=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)try{child.kill("SIGKILL");}catch{}},4000);
    try{await closed;}finally{clearTimeout(force);}}
   process.stderr.write("W15_RESTORE_STEP_FAILED\n");process.exitCode=1;
 }finally{process.removeListener("SIGTERM",stop);for(const fd of [out,err,journal,state,dir])if(fd!==undefined)try{fs.closeSync(fd);}catch{}}
})();'''


def _lifecycle(fd, action):
    child, snap = B.S._file(fd, action + '.lifecycle.PRIVATE.jsonl')
    try:
        require(0 < snap[2] <= 65536)
        raw = os.read(child, 65537)
        require(len(raw) == snap[2] and B.S._snapshot(os.fstat(child)) == snap)
        rows = [json.loads(line) for line in raw.splitlines()]
        require(len(rows) == 4 and [row.get('sequence') for row in rows] == list(range(4))
                and all(row.get('action') == action for row in rows)
                and [row.get('event') for row in rows] == ['owned-handler-ready', 'owned-child-spawned',
                    'owned-child-exit', 'owned-restore-closed']
                and type(rows[1].get('pid')) is int and rows[1]['pid'] > 1
                and rows[2].get('code') == 0 and rows[2].get('signal') is None
                and rows[3].get('dataFilesOpen') == 0 and rows[3].get('termReceived') is False)
        return rows[0]['identity']
    finally:
        os.close(child)


def restore_owned(controller, supervisor, *, run_owned):
    """Five fixed restore actions only, through the existing owned-stage runner."""
    work_fd = state_fd = restore_fd = None
    action = observed_returncode = None
    failure = result = None
    try:
        require(controller.BASE == BASE and controller.DB == DATABASE
                and re.fullmatch(r'w15-end500-[1-9][0-9]{4,19}-[a-f0-9]{32}', controller.CONTAINER)
                and controller.DOCKER == list(DOCKER))
        runner = supervisor.backup_runner
        require(callable(run_owned) and getattr(run_owned, '__self__', None) is runner
                and runner.scope == 'end500-restore' and runner.actions == ACTIONS
                and runner.controller is controller and supervisor.common_resources is not None)
        deadline = time.monotonic() + 600
        def guard():
            require(time.monotonic() < deadline)
            return B._sample(supervisor)
        first = guard()
        work = Path(controller.WORK)
        work_fd = B.S._directory(str(work), private=True)
        state_fd = B.S._directory(str(work / 'state'), private=True)
        os.mkdir('restore', 0o700, dir_fd=state_fd)
        restore_fd = os.open('restore', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=state_fd)
        os.fsync(state_fd)
        pins = {}
        for action in ACTIONS:
            observed_returncode = None
            guard()
            remaining = int(deadline - time.monotonic())
            require(remaining > 10)
            command = ('umask 077; set -Ce; echo $$ >' + BASE + '/state/' + action + '.pid; '
                       'exec timeout --signal=TERM --kill-after=5s ' + str(remaining - 5) + 's '
                       + BASE + '/node -e ' + shlex.quote(NODE_WORKER) + ' '
                       + ' '.join(shlex.quote(value) for value in (BASE, action, DATABASE)))
            argv = list(DOCKER) + ['exec', '--user', '1000:1000', controller.CONTAINER, 'sh', '-c', command]
            try:
                process = run_owned(argv, action, remaining)
            except subprocess.CalledProcessError as error:
                if type(error) is subprocess.CalledProcessError and error.cmd == argv:
                    observed_returncode = error.returncode
                raise
            if type(process) is subprocess.CompletedProcess and process.args == argv:
                observed_returncode = process.returncode
            require(isinstance(process, subprocess.CompletedProcess) and process.args == argv
                    and type(process.returncode) is int and process.returncode == 0)
            receipt = B._json(restore_fd, action + '.SAFE.json')
            fields = {'status', 'action', 'returncode', 'signal', 'output', 'stderr', 'identity', 'lifecycle'}
            require(set(receipt) == (fields | {'renderedSQL'} if action == 'restore-render' else fields)
                    and receipt['status'] == 'PASS_OWNED_ISOLATED_RESTORE_STEP'
                    and receipt['action'] == action and type(receipt['returncode']) is int
                    and receipt['returncode'] == 0 and receipt['signal'] is None)
            pin = B._pin(restore_fd, OUTPUTS[action], guard)
            require(pin == receipt['output'] and B._pin(restore_fd, action + '.PRIVATE.stderr', guard) == receipt['stderr'])
            identity = B._json(state_fd, action + '.node.SAFE.json')
            require(identity == receipt['identity'] == _lifecycle(restore_fd, action)
                    and set(identity) == {'phase', 'pid', 'startTicks'} and identity['phase'] == action
                    and type(identity['pid']) is int and identity['pid'] > 1
                    and isinstance(identity['startTicks'], str) and identity['startTicks'].isdigit())
            require(B._pin(restore_fd, action + '.lifecycle.PRIVATE.jsonl', guard) == receipt['lifecycle'])
            pins[action] = pin
            if action == 'restore-render':
                # The original BASE SQL stays in place for the unchanged apply
                # command; this additional private state copy permits independent
                # host readback and is covered by the existing state backup walk.
                require(B._pin(restore_fd, 'rendered.PRIVATE.sql', guard) == receipt['renderedSQL']
                        and type(receipt['renderedSQL']) is dict
                        and set(receipt['renderedSQL']) == {'bytes', 'sha256'}
                        and type(receipt['renderedSQL']['bytes']) is int and receipt['renderedSQL']['bytes'] > 0
                        and re.fullmatch('[a-f0-9]{64}', receipt['renderedSQL']['sha256']))
            guard()
        # Whole-restore closure failures are not failures of whichever action
        # happened to run last.
        action = observed_returncode = None
        restored = B._json(restore_fd, OUTPUTS['restore-check'])
        require(set(restored) == {'profiles', 'active'}
                and type(restored['profiles']) is int and restored['profiles'] == 500
                and type(restored['active']) is int and restored['active'] == 0)
        controller.save('RESTORED500_ZERO.SAFE.json', restored)
        closed = {'schema': 'helmut-w15-owned-isolated-restore/1',
                  'status': 'PASS_OWNED_ISOLATED_RESTORE_500_INACTIVE_ONLY',
                  'profiles': 500, 'active': 0, 'steps': len(ACTIONS),
                  'initialKernelSample': first, 'finalKernelSample': guard(), 'pins': pins,
                  'fullRestoreAccepted': False, 'acceptedAsCompleteBackup': False,
                  'end500Started': False, 'mock500Started': False, 'executionAuthority': False}
        B._write(restore_fd, 'RESTORE_CLOSURE.PRIVATE.json', (json.dumps(closed, sort_keys=True) + '\n').encode())
        result = {key: value for key, value in closed.items()
                if key not in ('pins', 'initialKernelSample', 'finalKernelSample')}
    except (Exception, KeyboardInterrupt) as error:
        if type(error) is RestoreRuntimeError and error.actionName is not None:
            action, observed_returncode = error.actionName, error.runnerReturncode
        failure = RestoreRuntimeError('ISOLATED_RESTORE_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED',
            actionName=action, runnerReturncode=observed_returncode)
    finally:
        for fd in (restore_fd, state_fd, work_fd):
            if fd is not None:
                try: os.close(fd)
                except (OSError, KeyboardInterrupt):
                    failure = failure or RestoreRuntimeError('ISOLATED_RESTORE_CLEANUP_UNCONFIRMED')
    if failure is not None:
        raise failure from None
    return result
