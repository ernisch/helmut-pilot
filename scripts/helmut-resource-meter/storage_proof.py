"""Read-only actual guest-filesystem/device confinement and capacity witness.

The upper bound is the kernel block-device capacity, NOT sampled inode blocks
or an assertion of exact observed allocation peak. Host backing-FS overhead is
outside this dedicated guest-filesystem scope and is never assumed zero.
"""
import ctypes,hashlib,json,os
from pathlib import Path

def verify(pgdata,pin):
    p=Path(pin['path'])
    if p.is_symlink():raise RuntimeError('storage receipt symlink rejected')
    b=p.read_bytes()
    if len(b)!=pin['bytes'] or hashlib.sha256(b).hexdigest()!=pin['sha256']:raise RuntimeError('storage receipt drift')
    r=json.loads(b);capacity=r['capacityBytes']
    if r.get('schema')!='helmut-kernel-owned-block-capacity/1' or type(capacity)is not int or not 0<capacity<=8000000000 or int(r['capsAfterSetup'],16)!=0:
        raise RuntimeError('native owned-device capacity not established')
    pgdata=Path(pgdata)
    if pgdata.resolve()!=pgdata or pgdata.is_symlink():raise RuntimeError('PGDATA must be a real owned directory')
    device=pgdata.stat().st_dev
    if os.major(device)!=7 or os.minor(device)!=r['loopMinor']:raise RuntimeError('PGDATA is on a different block device')
    direct=r.get('ioMode',{}).get('directIO')is True
    if direct:
        if r['ioMode']!={'directIO':True,'actualLoopFlags':16,'autoclear':False,'bufferedFallbackAllowed':False}:
            raise RuntimeError('direct IO receipt mode differs')
        if(Path('/sys/block')/('loop'+str(r['loopMinor']))/'loop/dio').read_text().strip()!='1':
            raise RuntimeError('actual owned loop no longer uses direct IO')
    buf=ctypes.create_string_buffer(256);libc=ctypes.CDLL(None,use_errno=True)
    if libc.statfs(os.fsencode(pgdata),ctypes.byref(buf))!=0:raise OSError(ctypes.get_errno(),'statfs failed')
    fs_type=int.from_bytes(buf.raw[:8],'little',signed=True)
    if fs_type!=0xEF53:raise RuntimeError('named ext4 fixture filesystem not mounted')
    fs=os.statvfs(pgdata)
    if fs.f_blocks*fs.f_frsize>capacity:raise RuntimeError('filesystem larger than attested device')
    for root,dirs,files in os.walk(pgdata,followlinks=False):
        for name in dirs+files:
            q=Path(root)/name
            if q.is_symlink() or q.stat().st_dev!=device:raise RuntimeError('external PGDATA storage detected')
    result={'schema':'helmut-verified-owned-storage-upper/1','provenUpperBytes':capacity,
            'nativeFilesystemType':'ext4','nativeLoopMinor':r['loopMinor'],
            'nativeFilesystemBytes':fs.f_blocks*fs.f_frsize,
            'scope':'All blocks of this exclusive guest filesystem, including PGDATA,WAL and its filesystem metadata',
            'actualPeakIsNotClaimedEqualToUpper':True,'hostBackingFilesystemOverheadOutsideGuestScope':True,
            'externalPGDATASymlinksOrDevices':False}
    if direct:result['actualDirectIO']=True
    return result
