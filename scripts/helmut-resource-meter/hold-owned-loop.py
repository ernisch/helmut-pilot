#!/usr/bin/env python3
"""Attach only a new regular image to one UNBOUND loop; then drop all caps.

Used only by an explicitly launched local meter-setup helper. No daemon socket,
host PID/network, host /dev mount or wildcard block-device permission is needed.
No LOOP_CLR_FD, CHANGE_FD, forced detach, mount or format operation exists here.
"""
import ctypes,fcntl,json,os,stat,sys,time
from pathlib import Path

class Info(ctypes.Structure):
    _fields_=[(n,ctypes.c_uint64) for n in ['device','inode','rdevice','offset','sizelimit']]+[(n,ctypes.c_uint32) for n in ['number','encrypt_type','key_size','flags']]+[('file_name',ctypes.c_char*64),('crypt_name',ctypes.c_char*64),('key',ctypes.c_char*32),('init',ctypes.c_uint64*2)]
class Config(ctypes.Structure):
    _fields_=[('fd',ctypes.c_uint32),('block_size',ctypes.c_uint32),('info',Info),('reserved',ctypes.c_uint64*8)]
class CapHeader(ctypes.Structure):_fields_=[('version',ctypes.c_uint32),('pid',ctypes.c_int)]
class CapData(ctypes.Structure):_fields_=[('effective',ctypes.c_uint32),('permitted',ctypes.c_uint32),('inheritable',ctypes.c_uint32)]
LO_FLAGS_DIRECT_IO=0x10
LO_FLAGS_AUTOCLEAR=0x4

def save(path,data):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644)
    try:os.write(fd,(json.dumps(data)+'\n').encode());os.fsync(fd)
    finally:os.close(fd)

def save_fd(fd,data):
    b=(json.dumps(data)+'\n').encode();offset=0
    while offset<len(b):offset+=os.write(fd,b[offset:])
    os.fsync(fd);os.close(fd)

def info(fd):
    b=bytearray(ctypes.sizeof(Info));fcntl.ioctl(fd,0x4C05,b,True);return Info.from_buffer_copy(b)

def identity(fd):
    i=info(fd);b=bytearray(8);fcntl.ioctl(fd,0x80081272,b,True)
    return {'imageDevice':int(i.device),'imageInode':int(i.inode),'loopMinor':int(i.number),
            'offset':int(i.offset),'sizeLimit':int(i.sizelimit),'capacityBytes':int.from_bytes(b,'little')}

def io_mode(fd,requested):
    flags=int(info(fd).flags)
    if flags&LO_FLAGS_AUTOCLEAR or flags!=(LO_FLAGS_DIRECT_IO if requested else 0):
        raise RuntimeError('actual owned loop IO flags differ; no buffered fallback')
    return {'directIO':requested,'actualLoopFlags':flags,'autoclear':False,
            'bufferedFallbackAllowed':False}

def main():
    out=Path('/meter-setup');cfg=json.loads((out/'CONFIG.SAFE.json').read_text())
    if cfg['schema']!='helmut-owned-new-loop-setup/1' or cfg['production'] is not False:raise RuntimeError('local setup only')
    n=cfg['loopMinor'];size=cfg['bytes']
    direct_io=cfg.get('directIO',False)
    if type(direct_io)is not bool:raise RuntimeError('explicit boolean direct IO mode required')
    if type(n)is not int or not 0<=n<=4095 or type(size)is not int or size<128*1024*1024 or size>8000000000 or size%4096:
        raise RuntimeError('bounded image configuration invalid')
    if type(cfg['maximumHoldSeconds'])is not int or not 1<=cfg['maximumHoldSeconds']<=12*3600:
        raise RuntimeError('bounded helper lifetime required')
    assert ctypes.sizeof(Info)==232 and ctypes.sizeof(Config)==304
    image=os.open('/meter-image',os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC)
    s=os.fstat(image)
    if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size!=size or s.st_ino!=cfg['imageInode'] or s.st_dev!=cfg['imageDevice']:
        raise RuntimeError('exclusive new image binding mismatch')
    nodes=out/'nodes';nodes.mkdir(mode=0o755);node_dir=os.open(nodes,os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC)
    device=nodes/'LOOP_DEVICE';os.mknod(device,stat.S_IFBLK|0o600,os.makedev(7,n))
    fd=os.open(device,os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC)
    # LOOP_CONFIGURE is atomic and returns EBUSY for an already-bound device.
    # Never detach/reassign any mapping, even after a failed setup.
    # Keep the OWN mapping after crashes. Autoclear would allow minor reuse
    # while a retained Docker volume still names its old device path.
    c=Config();c.fd=image;c.block_size=4096;c.info.sizelimit=size;c.info.flags=LO_FLAGS_DIRECT_IO if direct_io else 0
    c.info.file_name=b'HELMUT_OWN_NEW_LOCAL_METER'
    fcntl.ioctl(fd,0x4C0A,bytes(c))
    before=identity(fd)
    mode_before=io_mode(fd,direct_io)
    if before!={'imageDevice':s.st_dev,'imageInode':s.st_ino,'loopMinor':n,'offset':0,'sizeLimit':size,'capacityBytes':size}:
        raise RuntimeError('kernel loop mapping/capacity mismatch')
    read_only=os.open(device,os.O_RDONLY|os.O_CLOEXEC);os.close(fd);os.close(image)
    # Open result descriptors before dropping DAC_OVERRIDE. The controller
    # waits for a complete JSON receipt, never for mere file existence.
    ready_fd=os.open(out/'STORAGE_READY.SAFE.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644)
    final_fd=os.open(out/'STORAGE_FINAL.SAFE.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644)
    header=CapHeader(0x20080522,0);data=(CapData*2)();libc=ctypes.CDLL(None,use_errno=True)
    if libc.capset(ctypes.byref(header),ctypes.byref(data))!=0:raise OSError(ctypes.get_errno(),'capability drop failed')
    caps=next(x.split(':',1)[1].strip() for x in Path('/proc/self/status').read_text().splitlines() if x.startswith('CapEff:'))
    if int(caps,16)!=0:raise RuntimeError('setup privileges not dropped')
    save_fd(ready_fd,{'schema':'helmut-kernel-owned-block-capacity/1',**before,
         'ioMode':mode_before,
         'capsAfterSetup':caps,'boundIsCapacityNotMeasuredPeak':True,'backingFilesystemOverheadOutsideGuestScope':True,
         'ownedGuestFilesystemIncludesPGDATAWALAndFilesystemMetadata':True,'production':False})
    until=time.monotonic()+cfg['maximumHoldSeconds']
    while not (out/'STOP').exists() and time.monotonic()<until:time.sleep(.1)
    after=identity(read_only)
    mode_after=io_mode(read_only,direct_io)
    os.unlink('LOOP_DEVICE',dir_fd=node_dir);os.close(node_dir)
    save_fd(final_fd,{'identityUnchanged':after==before,'identity':after,'ownerRequestedStop':(out/'STOP').exists(),
         'ioMode':mode_after,'ioModeUnchanged':mode_after==mode_before,
         'deviceNodeRetiredBeforeExit':True,'ownedMappingRetainedForSafeRecovery':True,
         'boundIsCapacityNotMeasuredPeak':True,'full500RunAuthority':False,'production':False})
    os.close(read_only)
    return 0 if after==before else 1

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as e:
        save(Path('/meter-setup/SETUP_FAILURE.SAFE.json'),{'type':type(e).__name__,'errno':getattr(e,'errno',None),'noForcedDetachOrReassign':True})
        raise
