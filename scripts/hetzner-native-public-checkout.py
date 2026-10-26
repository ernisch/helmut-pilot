#!/usr/bin/env python3
"""Fixed public PR942 ingestion only; import/default invocation performs no I/O."""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import posixpath
import re
import selectors
import signal
import stat
import subprocess
import sys
import time

BASE = Path('/opt/helmut-native-test/automation-20261026')
REPOSITORY = 'https://github.com/ernisch/helmut-pilot.git'
COMMIT = '29b05ac0281347f8cde82b903b12f57e8cd5d8c9'
TREE = 'bf8551601236d89f30745d83020544e49482785f'
PARENT, LEAF = 'public-code', 'pr942-29b05ac0'
ATTEMPT = 'PUBLIC_CODE_PR942_ATTEMPT.SAFE.json'
ERROR = 'PUBLIC_CODE_PR942_FIRST_ERROR.PRIVATE.json'
PENDING, READY = 'PUBLIC_CODE_PR942_RECEIPT.PENDING.SAFE.json', 'PUBLIC_CODE_PR942_READY.SAFE.json'
FLAG = '--prepare-fixed-public-checkout-once'
FLOOR, TOTAL_CAP, FILE_CAP, COUNT_CAP = 8*1024**3, 512*1024**2, 32*1024**2, 30000
OUT_CAP, ERR_CAP = 4*1024**2, 65536
D = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME | os.O_CLOEXEC
R = os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_NONBLOCK | os.O_CLOEXEC
W = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC
ENV = {'PATH':'/usr/bin:/bin','LC_ALL':'C','HOME':'/nonexistent',
       'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_SYSTEM':'/dev/null','GIT_CONFIG_GLOBAL':'/dev/null',
       'GIT_ATTR_NOSYSTEM':'1','GIT_TERMINAL_PROMPT':'0','GIT_ASKPASS':'/bin/false',
       'SSH_ASKPASS':'/bin/false','GIT_OPTIONAL_LOCKS':'0','GIT_LFS_SKIP_SMUDGE':'1'}
OPTIONS = ('core.hooksPath=/dev/null','core.fsmonitor=false','maintenance.auto=false','gc.auto=0',
           'credential.helper=','credential.interactive=false','core.askPass=/bin/false',
           'core.attributesFile=/dev/null','core.excludesFile=/dev/null','core.autocrlf=false',
           'submodule.recurse=false','protocol.allow=never','protocol.https.allow=always',
           'http.followRedirects=false','http.sslVerify=true','filter.lfs.process=',
           'filter.lfs.smudge=','filter.lfs.clean=','filter.lfs.required=false')


class Stop(Exception):
    def __init__(self, code, stdout=b'', stderr=b''):
        self.code, self.stdout, self.stderr = code, stdout[:2048], stderr[:2048]


def need(value, code):
    if not value:raise Stop(code)


def encoded(value):
    return (json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode('ascii')


def root_owner(info):return info.st_uid == info.st_gid == 0


def directory(info, private=False):
    need(stat.S_ISDIR(info.st_mode) and root_owner(info)
         and (stat.S_IMODE(info.st_mode)==0o700 if private else not info.st_mode & 0o022),'UNTRUSTED_DIRECTORY')


def root_required():
    need(os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0,'ROOT_REQUIRED')


def open_base():
    fd=os.open('/',D)
    try:
        directory(os.fstat(fd))
        for part in str(BASE).strip('/').split('/'):
            child=os.open(part,D,dir_fd=fd);os.close(fd);fd=child;directory(os.fstat(fd))
        directory(os.fstat(fd),True)
        return fd
    except BaseException:os.close(fd);raise


def missing(fd,name):
    try:os.stat(name,dir_fd=fd,follow_symlinks=False)
    except FileNotFoundError:return True
    return False


def write_new(fd,name,data):
    need(type(data) is bytes and len(data)<=16384,'RECEIPT_BOUND')
    out=os.open(name,W,0o600,dir_fd=fd)
    try:
        offset=0
        while offset<len(data):
            count=os.write(out,data[offset:]);need(count>0,'SHORT_WRITE');offset+=count
        os.fsync(out)
    finally:os.close(out)
    os.fsync(fd)


def readback(fd,name,expected):
    item=os.open(name,R,dir_fd=fd)
    try:
        before=os.fstat(item)
        need(stat.S_ISREG(before.st_mode) and root_owner(before) and before.st_nlink==1
             and stat.S_IMODE(before.st_mode)==0o600 and before.st_size==len(expected),'RECEIPT_IDENTITY')
        data=bytearray()
        while len(data)<=len(expected):
            block=os.read(item,len(expected)+1-len(data))
            if not block:break
            data.extend(block)
        need(bytes(data)==expected and before==os.fstat(item),'RECEIPT_READBACK')
    finally:os.close(item)


def capacity(deadline,extra=0):
    need(time.monotonic()<deadline,'DEADLINE')
    info=os.statvfs(BASE)
    need(info.f_bavail*info.f_frsize>=FLOOR+extra,'DISK_FLOOR')


def git(arguments,repo,deadline):
    argv=['/usr/bin/git']
    for option in (*OPTIONS,'safe.directory='+str(repo)):argv+=['-c',option]
    argv+=list(arguments)
    process=subprocess.Popen(argv,cwd=repo,env=ENV,stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True,close_fds=True)
    output=[bytearray(),bytearray()]
    try:
        with selectors.DefaultSelector() as selector:
            for i,pipe in enumerate((process.stdout,process.stderr)):
                os.set_blocking(pipe.fileno(),False);selector.register(pipe,selectors.EVENT_READ,i)
            while selector.get_map():
                capacity(deadline)
                for key,_ in selector.select(min(.1,max(0,deadline-time.monotonic()))):
                    block=os.read(key.fileobj.fileno(),65536)
                    if not block:selector.unregister(key.fileobj);continue
                    output[key.data].extend(block)
                    need(len(output[key.data])<=(OUT_CAP if key.data==0 else ERR_CAP),'GIT_OUTPUT_BOUND')
            capacity(deadline)
            code=process.wait(timeout=max(.01,deadline-time.monotonic()))
            need(code==0,'GIT_FAILED')
        return bytes(output[0])
    except BaseException as error:
        failure=Stop(error.code if isinstance(error,Stop) else 'GIT_EXECUTION_FAILED',*map(bytes,output))
        try:
            try:os.killpg(process.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            process.wait(timeout=5)
        except Exception:pass
        raise failure from None
    finally:
        process.stdout.close();process.stderr.close()


def records(raw,index=False):
    need(type(raw) is bytes and len(raw)<=OUT_CAP and raw.endswith(b'\0'),'INDEX_FORMAT')
    result={}
    for entry in raw[:-1].split(b'\0'):
        header,path=entry.split(b'\t',1)
        need(len(header.split(b' '))==3,'INDEX_FORMAT')
        mode,kind,oid=(header.split(b' ') if not index else
                       (header.split(b' ')[0],b'blob',header.split(b' ')[1]))
        need(not index or header.split(b' ')[2]==b'0','INDEX_STAGE')
        name=path.decode('utf8')
        need(name and not name.startswith('/') and posixpath.normpath(name)==name
             and not any(c=='\\' or ord(c)<32 for c in name)
             and all(p not in ('.','..','.git') for p in name.split('/')),'TRACKED_PATH')
        need(mode in (b'100644',b'100755',b'120000') and kind==b'blob'
             and re.fullmatch(b'[a-f0-9]{40}',oid) and name not in result,'TRACKED_MODE_OR_OBJECT')
        result[name]=(mode.decode(),oid.decode())
    need(0<len(result)<=COUNT_CAP,'TRACKED_COUNT')
    return result


def validate_files(repo,expected,deadline):
    found={};dirs={''};links={};total=0;manifest=hashlib.sha256()
    allowed_dirs={''}
    for name in expected:
        parent=posixpath.dirname(name)
        while parent:allowed_dirs.add(parent);parent=posixpath.dirname(parent)
    def walk(path,prefix=''):
        nonlocal total
        fd=os.open(path,D)
        try:
            for name in sorted(os.listdir(fd)):
                capacity(deadline);rel=prefix+name;info=os.stat(name,dir_fd=fd,follow_symlinks=False)
                if not prefix and name=='.git':continue
                need(stat.S_ISDIR(info.st_mode) or rel in expected,'UNTRACKED_PATH')
                if stat.S_ISDIR(info.st_mode):
                    need(rel not in expected and rel in allowed_dirs,'TRACKED_TYPE');dirs.add(rel)
                    walk(path/name,rel+'/');os.chown(name,1000,1000,dir_fd=fd,follow_symlinks=False)
                    os.chmod(name,0o755,dir_fd=fd,follow_symlinks=False)
                    continue
                mode,oid=expected[rel];need(info.st_nlink==1 and root_owner(info),'TRACKED_HARDLINK')
                if mode=='120000':
                    need(stat.S_ISLNK(info.st_mode),'TRACKED_TYPE')
                    data=os.readlink(name,dir_fd=fd).encode('utf8');links[rel]=data.decode('utf8')
                else:
                    need(stat.S_ISREG(info.st_mode) and 0<=info.st_size<=FILE_CAP,'TRACKED_SIZE_OR_TYPE')
                    item=os.open(name,R,dir_fd=fd)
                    try:
                        before=os.fstat(item);need(before==info,'TRACKED_CHANGED')
                        digest=hashlib.sha1(b'blob '+str(info.st_size).encode()+b'\0');prefix_bytes=b'';count=0
                        while True:
                            capacity(deadline);block=os.read(item,65536)
                            if not block:break
                            count+=len(block);need(count<=info.st_size,'TRACKED_CHANGED');digest.update(block)
                            prefix_bytes=(prefix_bytes+block)[:128]
                        need(count==info.st_size and before==os.fstat(item),'TRACKED_CHANGED')
                        need(not prefix_bytes.startswith(b'version https://git-lfs.github.com/spec/v1'),'LFS_POINTER')
                    finally:os.close(item)
                    need(digest.hexdigest()==oid,'TRACKED_HASH')
                    data=None
                if data is not None:
                    need(len(data)<=4096 and hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==oid,'TRACKED_HASH')
                total+=info.st_size;need(total<=TOTAL_CAP,'TRACKED_TOTAL')
                os.chown(name,1000,1000,dir_fd=fd,follow_symlinks=False)
                if mode!='120000':
                    os.chmod(name,0o755 if mode=='100755' else 0o644,dir_fd=fd,follow_symlinks=False)
                    item=os.open(name,R,dir_fd=fd)
                    try:os.fsync(item)
                    finally:os.close(item)
                after=os.stat(name,dir_fd=fd,follow_symlinks=False)
                need(after.st_uid==after.st_gid==1000 and (mode=='120000' or
                     stat.S_IMODE(after.st_mode)==(0o755 if mode=='100755' else 0o644)),'TRACKED_METADATA')
                found[rel]=expected[rel];manifest.update(encoded({'path':rel,'mode':mode,'oid':oid}))
            os.fsync(fd)
        finally:os.close(fd)
    walk(repo)
    need(found==expected,'TRACKED_CLOSURE')
    for name,target in links.items():
        current=posixpath.normpath(posixpath.join(posixpath.dirname(name),target))
        parents=current.split('/')
        need(target and target==posixpath.normpath(target) and not target.startswith('/')
             and current!='..' and not current.startswith('../') and '\\' not in target and current not in links
             and all('/'.join(parents[:i]) not in links for i in range(1,len(parents)))
             and '.git' not in current.split('/') and (current in expected or current in dirs),'UNQUALIFIED_SYMLINK')
    return len(found),total,manifest.hexdigest()


def own_admin(path,deadline):
    fd=os.open(path,D)
    try:
        for name in os.listdir(fd):
            capacity(deadline);info=os.stat(name,dir_fd=fd,follow_symlinks=False)
            need(not stat.S_ISLNK(info.st_mode),'GIT_ADMIN_LINK')
            if stat.S_ISDIR(info.st_mode):own_admin(path/name,deadline)
            else:
                need(stat.S_ISREG(info.st_mode) and info.st_nlink==1,'GIT_ADMIN_TYPE')
                item=os.open(name,R,dir_fd=fd)
                try:os.fsync(item)
                finally:os.close(item)
                os.chmod(name,0o600,dir_fd=fd,follow_symlinks=False)
            os.chown(name,1000,1000,dir_fd=fd,follow_symlinks=False)
        os.fchown(fd,1000,1000);os.fchmod(fd,0o700);os.fsync(fd)
    finally:os.close(fd)


def publish(fd):
    lib=ctypes.CDLL(None,use_errno=True);rename=lib.renameat2
    rename.argtypes=(ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint)
    rename.restype=ctypes.c_int
    need(rename(fd,PENDING.encode(),fd,READY.encode(),1)==0,'PUBLICATION_FAILED')


def create_public_checkout():
    base=parent=None;published=record_error=False;old=os.umask(0o077);deadline=time.monotonic()+180
    result={'schema':'helmut-fixed-public-checkout-v1','status':'FAIL_KEEP_STATE_NO_RETRY',
            'native_qualified':False,'commit':COMMIT,'tree':TREE,'repository':str(BASE/PARENT/LEAF)}
    try:
        root_required();base=open_base();capacity(deadline,2*TOTAL_CAP)
        need(all(missing(base,n) for n in (ATTEMPT,ERROR,PENDING,READY)),'ALREADY_ATTEMPTED')
        record_error=True
        if not missing(base,PARENT):
            parent=os.open(PARENT,D,dir_fd=base);directory(os.fstat(parent),True)
            need(missing(parent,LEAF),'OUTPUT_EXISTS')
        attempt=encoded({'schema':'helmut-public-checkout-attempt-v1','commit':COMMIT,'tree':TREE,'state':'UNKNOWN_NO_RETRY'})
        write_new(base,ATTEMPT,attempt);readback(base,ATTEMPT,attempt)
        if parent is None:
            os.mkdir(PARENT,0o700,dir_fd=base);os.fsync(base)
            parent=os.open(PARENT,D,dir_fd=base);directory(os.fstat(parent),True)
        os.mkdir(LEAF,0o700,dir_fd=parent);os.fsync(parent);repo=BASE/PARENT/LEAF
        git(('init','--quiet','--template=','.'),repo,deadline)
        git(('fetch','--quiet','--no-tags','--depth=1','--no-recurse-submodules','--no-write-fetch-head',REPOSITORY,COMMIT),repo,deadline)
        need(git(('rev-parse','--verify',COMMIT+'^{commit}'),repo,deadline)==(COMMIT+'\n').encode(),'COMMIT_PIN')
        need(git(('rev-parse','--verify',COMMIT+'^{tree}'),repo,deadline)==(TREE+'\n').encode(),'TREE_PIN')
        expected=records(git(('ls-tree','-rz','--full-tree',COMMIT),repo,deadline))
        git(('checkout','--quiet','--detach','--no-recurse-submodules',COMMIT),repo,deadline)
        need(git(('rev-parse','--verify','HEAD'),repo,deadline)==(COMMIT+'\n').encode(),'HEAD_PIN')
        need(records(git(('ls-files','--stage','-z'),repo,deadline),True)==expected,'INDEX_TREE')
        count,total,manifest=validate_files(repo,expected,deadline);own_admin(repo/'.git',deadline)
        os.chown(repo,1000,1000);os.chmod(repo,0o700)
        need(git(('status','--porcelain=v1','--untracked-files=all','--ignore-submodules=none','-z'),repo,deadline)==b'','DIRTY_CHECKOUT')
        result.update(status='PUBLIC_CHECKOUT_READY_NOT_NATIVE_QUALIFIED',files=count,bytes=total,manifest_sha256=manifest)
        raw=encoded(result);write_new(base,PENDING,raw);readback(base,PENDING,raw);capacity(deadline)
        publish(base);published=True
        return result
    except Exception as error:
        result.update(status='FAIL_KEEP_STATE_NO_RETRY',code=error.code if isinstance(error,Stop) else 'FILESYSTEM_OR_FORMAT_FAILURE')
        if base is not None and record_error:
            try:
                record={**result,'stdout_prefix_hex':getattr(error,'stdout',b'').hex(),
                        'stderr_prefix_hex':getattr(error,'stderr',b'').hex(),
                        'exception_type':type(error).__name__,'errno':getattr(error,'errno',None)}
                write_new(base,ERROR,encoded(record))
            except Exception:pass
        return result
    finally:
        os.umask(old)
        for fd in (parent,base):
            if fd is not None:
                try:os.close(fd)
                except OSError:
                    if not published:raise


def main(argv=None):
    if (sys.argv[1:] if argv is None else argv)!=[FLAG]:
        print('{"status":"NOT_EXECUTED_EXPLICIT_ONCE_FLAG_REQUIRED"}');return 2
    result=create_public_checkout();print(json.dumps(result,sort_keys=True))
    return 0 if result['status']=='PUBLIC_CHECKOUT_READY_NOT_NATIVE_QUALIFIED' else 1


if __name__=='__main__':raise SystemExit(main())
