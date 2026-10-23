#!/usr/bin/env python3
"""Local command transport. Only this measured broker has the Docker socket.

The workload receives a CLI-compatible pipe client, never a daemon socket.
Only exec into the one owned DB and its fixed network inspect are allowed.
Private stdin/stdout pass through bounded frames; command arguments/data are
never retained in the safe audit. No shell interpretation in this transport.
"""
import hashlib,importlib.util,json,os,socket,struct,subprocess,sys,threading,time
from pathlib import Path

MAX=65536
OWNER_START='helmut-local-postgrest-owner-start'
OWNER_PYTHON='/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python'
OWNER_SUPERVISOR=str(Path(__file__).resolve().with_name('database-supervisor.py'))

def owner_enabled(cfg):
    return cfg.get('localPostgrestBackendPlanPin') is not None

def optional_backend(cfg):
    """Validate the explicit immutable producer before opening the broker."""
    if not owner_enabled(cfg):return None
    p=cfg['localPostgrestBackendPlanPin'];source=Path(p['path'])
    if (set(p)!={'path','bytes','sha256'} or source.resolve()!=source or source.is_symlink()
            or not source.is_file()):raise RuntimeError('exact optional backend plan pin required')
    raw=source.read_bytes()
    if len(raw)!=p['bytes'] or len(raw)>1024*1024 or hashlib.sha256(raw).hexdigest()!=p['sha256']:
        raise RuntimeError('optional backend plan drift')
    plan=json.loads(raw)
    spec=importlib.util.spec_from_file_location('broker_postgrest_backend',Path(__file__).with_name('local-postgrest-owner.py'))
    owner=importlib.util.module_from_spec(spec);spec.loader.exec_module(owner)
    owner.read_backend_plan(p,case_directory=plan['caseDirectory'],target_database=plan['targetDatabase'],operation_id=plan['operationId'])
    if cfg['containerName']!='helmut-meter-db-w20-'+Path(plan['caseDirectory']).name.removeprefix('attempt-'):
        raise RuntimeError('backend broker case differs')
    return plan
def exact(s,n):
    b=bytearray()
    while len(b)<n:
        v=s.recv(n-len(b))
        if not v:raise EOFError('truncated broker frame')
        b.extend(v)
    return bytes(b)

def allowed(argv,cfg):
    a=list(argv)
    if a[:1]==['--host=unix:///var/run/docker.sock']:a=a[1:]
    if a==[OWNER_START]:return owner_enabled(cfg)
    targets={cfg['containerName'],cfg['containerId']}
    if len(a)==4 and a[:2]==['inspect','--format']:
        return a[3] in targets and a[2] in ['{{json .NetworkSettings.Networks}}','{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}']
    if not a or a.pop(0)!='exec':return False
    while a and a[0].startswith('-'):
        flag=a.pop(0)
        if flag=='-d' and owner_enabled(cfg):return False
        if flag in ['-i','-d']:continue
        if flag=='-u' and a and a.pop(0)=='postgres':continue
        return False
    if len(a)<2 or a.pop(0) not in targets:return False
    cmd=a.pop(0)
    if cmd in ['psql','pg_dump','pg_restore']:return True
    if cmd=='sha256sum':return a==[cfg['postgrestBinary']]
    if cmd==cfg['postgrestBinary']:return not owner_enabled(cfg) and a==[cfg['postgrestConfig']]
    if cmd=='sh':return not owner_enabled(cfg) and a==['-c','umask 077; test ! -e '+cfg['postgrestConfig']+' && cat > '+cfg['postgrestConfig']]
    return False

def docker_arguments(argv,cfg):
    if not allowed(argv,cfg):raise RuntimeError('unapproved broker command')
    a=list(argv)
    if a[:1]==['--host=unix:///var/run/docker.sock']:a=a[1:]
    if a==[OWNER_START]:
        return ['exec','-i',cfg['containerId'],OWNER_PYTHON,OWNER_SUPERVISOR,'--submit-local-postgrest-request']
    return a

def server(config):
    cfg=json.loads(Path(config).read_text());out=Path(cfg['output']);s=socket.socket(socket.AF_UNIX)
    if not cfg['containerName'].startswith('helmut-meter-db-'):raise RuntimeError('only owned isolated database')
    optional_backend(cfg)
    s.bind(str(out/'socket'));os.chmod(out/'socket',0o600);s.listen(16);s.settimeout(.1)
    stats={'schema':'helmut-local-docker-command-broker/1','requests':0,'denied':0,'stdinBytes':0,'stdinWrittenBytes':0,'stdoutBytes':0,'stderrBytes':0,'errors':0,'argumentsAndPayloadsRetained':False,'bytesAreDockerIPCNotBillableNetwork':True}
    workers=[];lock=threading.Lock()
    def handle(c):
        sendlock=threading.Lock()
        def frame(kind,data):
            with sendlock:c.sendall(kind+struct.pack('!I',len(data))+data)
        try:
            n=struct.unpack('!I',exact(c,4))[0]
            if n>MAX:raise ValueError('header too large')
            argv=json.loads(exact(c,n))
            if not isinstance(argv,list) or not all(isinstance(x,str) and '\x00' not in x for x in argv) or not allowed(argv,cfg):
                with lock:stats['denied']+=1
                frame(b'X',b'64');return
            with lock:stats['requests']+=1
            child=subprocess.Popen(['/usr/local/bin/docker','--host=unix:///var/run/docker.sock',*docker_arguments(argv,cfg)],
                stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                env={'PATH':'/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8'})
            def input_copy():
                try:
                    while True:
                        data=c.recv(MAX)
                        if not data:break
                        with lock:stats['stdinBytes']+=len(data)
                        n=child.stdin.write(data);child.stdin.flush()
                        with lock:stats['stdinWrittenBytes']+=n
                except (OSError,ValueError):pass
                finally:
                    try:child.stdin.close()
                    except (OSError,ValueError):pass
            def output_copy(stream,kind,key):
                while True:
                    data=stream.read1(MAX)
                    if not data:break
                    with lock:stats[key]+=len(data)
                    frame(kind,data)
            threads=[threading.Thread(target=input_copy),threading.Thread(target=output_copy,args=(child.stdout,b'O','stdoutBytes')),
                     threading.Thread(target=output_copy,args=(child.stderr,b'E','stderrBytes'))]
            for t in threads:t.start()
            try:code=child.wait(timeout=150)
            except subprocess.TimeoutExpired:
                child.kill();code=child.wait()
                with lock:stats['errors']+=1
            c.shutdown(socket.SHUT_RD)
            for t in threads:t.join(timeout=5)
            if any(t.is_alive() for t in threads):raise RuntimeError('broker pipe exit incomplete')
            frame(b'X',str(code).encode())
        except Exception:
            with lock:stats['errors']+=1
            try:frame(b'X',b'70')
            except OSError:pass
        finally:c.close()
    while not (out/'STOP').exists():
        try:c,_=s.accept()
        except socket.timeout:continue
        workers=[t for t in workers if t.is_alive()]
        c.settimeout(180)
        t=threading.Thread(target=handle,args=(c,));t.start();workers.append(t)
    s.close()
    for t in workers:t.join(timeout=20)
    if any(t.is_alive() for t in workers):raise RuntimeError('broker still has owned work')
    stats['complete']=stats['errors']==0
    with (out/'BROKER_FINAL.SAFE.json').open('x') as f:f.write(json.dumps(stats))
    return 0 if stats['complete'] else 1

def client(argv):
    s=socket.socket(socket.AF_UNIX);s.connect('/meter-broker/socket')
    header=json.dumps(argv).encode()
    if len(header)>MAX:return 64
    s.sendall(struct.pack('!I',len(header))+header)
    def input_copy():
        try:
            while True:
                data=sys.stdin.buffer.read1(MAX)
                if not data:break
                s.sendall(data)
            s.shutdown(socket.SHUT_WR)
        except OSError:pass
    t=threading.Thread(target=input_copy,daemon=True);t.start()
    try:
        while True:
            kind=exact(s,1);n=struct.unpack('!I',exact(s,4))[0]
            if n>MAX:raise RuntimeError('invalid broker output')
            data=exact(s,n)
            if kind==b'X':return int(data)
            stream={b'O':sys.stdout.buffer,b'E':sys.stderr.buffer}.get(kind)
            if stream is None:raise RuntimeError('invalid broker channel')
            stream.write(data);stream.flush()
    finally:s.close()

if __name__=='__main__':
    try:sys.exit(server(sys.argv[2]) if sys.argv[1]=='server' else client(sys.argv[2:]))
    except Exception as error:
        sys.stderr.write(type(error).__name__+'\n');sys.exit(70)
