#!/usr/bin/env python3
"""One small loop-control metadata probe, never a mount/format or500 run.

No SYS_ADMIN, block-device rule, host /dev mount, host PID/network or daemon
socket inside the helper. Only MKNOD and read/mknod for loop-control10:237.
GET_FREE never attaches a backing file or modifies an existing loop mapping.
"""
import importlib.util,json,secrets,subprocess,sys
from pathlib import Path
s=importlib.util.spec_from_file_location('kernel',Path(__file__).with_name('kernel-meter.py'))
K=importlib.util.module_from_spec(s);s.loader.exec_module(K)
out=Path(sys.argv[1]);out.mkdir(mode=0o700,parents=True,exist_ok=False)
name='helmut-meter-loop-probe-'+secrets.token_hex(4)
code='''import os,stat,fcntl,json
p='/tmp/helmut-loop-control'
try:
 os.mknod(p,stat.S_IFCHR|0o600,os.makedev(10,237))
 fd=os.open(p,os.O_RDONLY|os.O_CLOEXEC)
 try:n=fcntl.ioctl(fd,0x4C82)
 finally:os.close(fd)
 print(json.dumps({'loopControlReadable':True,'freeLoopIndex':n,'backingFileAttached':False,'mountsOrFormats':0}))
except OSError as e:
 print(json.dumps({'loopControlReadable':False,'errno':e.errno,'reason':e.strerror,'backingFileAttached':False,'mountsOrFormats':0}))
'''
args=['create','--name',name,'--network','none','--cap-drop','ALL','--cap-add','MKNOD',
      '--security-opt','no-new-privileges','--device-cgroup-rule','c 10:237 rm',
      '--cgroup-parent=/'+name,'--entrypoint',str(K.PYTHON_ROOT/'bin/python'),
      '--mount','type=bind,src='+str(K.PYTHON_ROOT)+',dst='+str(K.PYTHON_ROOT)+',readonly',K.IMAGE,'-c',code]
cid=K.docker(args).stdout.strip();K.docker(['start',cid]);exitcode=int(K.docker(['wait',cid],timeout=20).stdout.strip())
logs=K.docker(['logs',cid]);native=json.loads(logs.stdout)
r={'scope':'tiny loop-control metadata capability probe only','containerId':cid,'exitCode':exitcode,'native':native,
   'SYS_ADMIN':False,'blockDeviceAccess':False,'hostDeviceMount':False,'network':'none',
   'full500Runs':0,'resourceGOConsumed':False,'production':False,'kernelAfterExit':K.kernel_snapshot(name,require_empty=True)}
K.save_new(out/'LOOP_CAPABILITY.SAFE.json',r);print(json.dumps(r))
