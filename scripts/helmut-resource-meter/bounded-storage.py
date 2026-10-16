#!/usr/bin/env python3
"""Explicit local owned fixed-capacity filesystem setup; no profiles or run GO.

No effect on import. Fresh image/volume names only. No old loop mapping is ever
detached/reassigned. Setup helper has only one block-device rule, no host /dev,
PID or network and no daemon socket; all capabilities are dropped before ready.
"""
import hashlib,importlib.util,json,os,secrets,stat,subprocess,sys,time
from pathlib import Path
s=importlib.util.spec_from_file_location('K',Path(__file__).with_name('kernel-meter.py'))
K=importlib.util.module_from_spec(s);s.loader.exec_module(K)
BASE=Path('/workspace/helmut-parallel-20261015/wave19-resource-meter')
TOOLS=Path('/tmp/helmut-meter-filesystem-tools')

def create(out,size,minor,parent,hold=900):
    out=Path(out).resolve()
    if out.parent!=BASE or out.is_symlink() or type(size)is not int or not 128*1024*1024<=size<=8000000000 or size%4096:
        raise RuntimeError('new bounded workspace image only')
    if type(minor)is not int or not 0<=minor<=4095:raise RuntimeError('exact single loop device required')
    fs=os.statvfs(BASE)
    if fs.f_bavail*fs.f_frsize<size+8*1024**3:raise RuntimeError('preserve8GiB free workspace reserve before fixture creation')
    out.mkdir(mode=0o755,exist_ok=False);out.chmod(0o755);image=out/'image.raw'
    fd=os.open(image,os.O_CREAT|os.O_EXCL|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:os.posix_fallocate(fd,0,size);os.fsync(fd);initial=os.fstat(fd)
    finally:os.close(fd)
    if not stat.S_ISREG(initial.st_mode) or initial.st_nlink!=1:raise RuntimeError('new regular image only')
    uuid=secrets.token_hex(16);uuid=uuid[:8]+'-'+uuid[8:12]+'-'+uuid[12:16]+'-'+uuid[16:20]+'-'+uuid[20:]
    fmt=subprocess.run([str(TOOLS/'mke2fs'),'-q','-t','ext4','-F','-b','4096','-m','0','-U',uuid,
        '-E','lazy_itable_init=0,lazy_journal_init=0',str(image)],
        env={'PATH':'/usr/bin:/bin','LD_LIBRARY_PATH':str(TOOLS/'lib'),'MKE2FS_CONFIG':str(TOOLS/'mke2fs.conf')},
        capture_output=True,timeout=120,check=True)
    K.save_new(out/'FORMAT.SAFE.json',{'newImageOnly':True,'imageBytes':size,'filesystem':'ext4','filesystemUUID':uuid,
        'formatStdoutBytes':len(fmt.stdout),'formatStderrBytes':len(fmt.stderr),
        'formatterSHA256':hashlib.sha256((TOOLS/'mke2fs').read_bytes()).hexdigest(),'production':False})
    cfg={'schema':'helmut-owned-new-loop-setup/1','production':False,'loopMinor':minor,'bytes':size,
        'imageInode':initial.st_ino,'imageDevice':initial.st_dev,'maximumHoldSeconds':hold}
    K.save_new(out/'CONFIG.SAFE.json',cfg)
    name='helmut-meter-storage-'+secrets.token_hex(4);K.initialize_parent(parent,name+'-unused')
    args=['create','--name',name,'--network','none','--cap-drop','ALL','--cap-add','MKNOD','--cap-add','SYS_ADMIN','--cap-add','DAC_OVERRIDE',
          '--security-opt','no-new-privileges','--device-cgroup-rule','b 7:'+str(minor)+' rwm','--cgroup-parent=/'+parent,
          '--entrypoint',str(K.PYTHON_ROOT/'bin/python'),
          '--mount','type=bind,src='+str(K.PYTHON_ROOT)+',dst='+str(K.PYTHON_ROOT)+',readonly',
          '--mount','type=bind,src='+str(Path(__file__).with_name('hold-owned-loop.py'))+',dst=/meter-loop-setup.py,readonly',
          '--mount','type=bind,src='+str(out)+',dst=/meter-setup',
          '--mount','type=bind,src='+str(image)+',dst=/meter-image',K.IMAGE,'/meter-loop-setup.py']
    cid=K.docker(args).stdout.strip();K.docker(['start',cid])
    ready=out/'STORAGE_READY.SAFE.json'
    r=None
    for _ in range(100):
        try:r=json.loads(ready.read_text())
        except (FileNotFoundError,json.JSONDecodeError):pass
        if r is not None:break
        if K.docker(['inspect','--format','{{.State.Running}}',cid]).stdout.strip()!='true':break
        time.sleep(.1)
    if r is None:raise RuntimeError('owned loop setup failed; retain evidence, never reassign or retry automatically')
    if r['capacityBytes']!=size or int(r['capsAfterSetup'],16)!=0:raise RuntimeError('kernel capacity/privilege receipt missing')
    if K.docker(['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}',cid]).stdout.strip()!='true|0':
        raise RuntimeError('stale readiness receipt; helper is no longer live')
    volume=name+'-filesystem'
    if K.docker(['volume','inspect',volume],check=False).returncode==0:raise RuntimeError('never reuse existing volume')
    K.docker(['volume','create','--driver','local','--opt','type=ext4','--opt','device='+str(out/'nodes/LOOP_DEVICE'),
              '--opt','o=noatime',volume])
    if K.docker(['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}',cid]).stdout.strip()!='true|0':
        raise RuntimeError('helper exited while creating owned volume; do not mount or start any database')
    result={'schema':'helmut-owned-bounded-storage/1','out':str(out),'image':str(image),'bytes':size,'loopMinor':minor,
            'volume':volume,'name':name,'containerId':cid,'parent':parent,'filesystemUUID':uuid,
            'kernelReadyReceipt':{'path':str(ready),'bytes':ready.stat().st_size,'sha256':hashlib.sha256(ready.read_bytes()).hexdigest()},
            'actualPeakIsNotClaimedEqualToCapacity':True,'full500Runs':0,'resourceGOConsumed':False,'production':False}
    K.save_new(out/'BOUNDED_STORAGE_READY.SAFE.json',result);return result

def finish(storage):
    out=Path(storage['out'])
    # Retire the named mount path even if the holder crashed. The image and
    # own mapping are retained; no future volume mount can follow a stale node.
    if (out/'nodes').exists():os.rename(out/'nodes',out/'RETIRED-nodes')
    (out/'STOP').write_text('OWNED_TEST_INFRASTRUCTURE_FINISHED\n')
    code=int(K.docker(['wait',storage['containerId']],timeout=30).stdout.strip())
    final=json.loads((out/'STORAGE_FINAL.SAFE.json').read_text())
    if code or not final['identityUnchanged']:raise RuntimeError('owned storage final identity/exit incomplete')
    return final

if __name__=='__main__':
    result=create(Path(sys.argv[1]),int(sys.argv[2]),int(sys.argv[3]),sys.argv[4])
    print(json.dumps(result))
