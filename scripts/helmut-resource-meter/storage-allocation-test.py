#!/usr/bin/env python3
"""Actual tiny host allocation plus pure format fault injection. No Docker/loop."""
import importlib.util,json,os,subprocess,tempfile,types
from pathlib import Path
from unittest.mock import patch
s=importlib.util.spec_from_file_location('bounded_allocation',Path(__file__).with_name('bounded-storage.py'))
B=importlib.util.module_from_spec(s);s.loader.exec_module(B)
with tempfile.TemporaryDirectory(prefix='helmut-backing-allocation-')as d:
 p=Path(d)/'image.raw';size=1024*1024
 fd=os.open(p,os.O_RDWR|os.O_CREAT|os.O_EXCL,0o600)
 try:os.posix_fallocate(fd,0,size);os.fsync(fd);initial=os.fstat(fd)
 finally:os.close(fd)
 assert B.allocation_witness(p,size,initial)['allocatedBytes']>=size
 calls=[]
 def fmt(args,**kwargs):
  calls.append(args);assert 'nodiscard,lazy_itable_init=0,lazy_journal_init=0'in args
  return subprocess.CompletedProcess(args,0,b'',b'')
 with patch.object(B.subprocess,'run',side_effect=fmt):
  _,a,b=B.format_image(p,size,initial,'TEST_SYNTHETIC_UUID');assert a==b
 assert len(calls)==1
 sparse=Path(d)/'sparse.raw';sparse.touch();os.truncate(sparse,size)
 try:B.allocation_witness(sparse,size,sparse.stat())
 except RuntimeError as e:assert 'allocation lost'in str(e)
 else:raise AssertionError('Sparse backing accepted')
 def discard(args,**kwargs):
  with p.open('wb')as f:f.truncate(size)
  return subprocess.CompletedProcess(args,0,b'',b'')
 with patch.object(B.subprocess,'run',side_effect=discard):
  try:B.format_image(p,size,initial,'TEST_SYNTHETIC_UUID')
  except RuntimeError as e:assert 'allocation lost'in str(e)
  else:raise AssertionError('Formatter allocation loss accepted')
 try:B.allocation_witness(sparse,size,initial)
 except RuntimeError as e:assert 'identity changed'in str(e)
 else:raise AssertionError('Replacement inode accepted')
spec=importlib.util.spec_from_file_location('owned_loop_io_modes',Path(__file__).with_name('hold-owned-loop.py'))
H=importlib.util.module_from_spec(spec);spec.loader.exec_module(H)
mode_cases=0
for flags,requested,accepted in [(0,False,True),(16,True,True),(0,True,False),
                                (4,False,False),(20,True,False),(8,False,False),(17,True,False)]:
 with patch.object(H,'info',return_value=types.SimpleNamespace(flags=flags)):
  try:r=H.io_mode(-1,requested)
  except RuntimeError:
   assert not accepted
  else:
   assert accepted and r['directIO']is requested and r['actualLoopFlags']==flags and r['autoclear']is False
 mode_cases+=1
with patch.object(B.K,'docker',side_effect=AssertionError('mode rejection must precede Docker')):
 try:B.create(B.BASE/'NEVER_CREATED_INVALID_IO_MODE',128*1024**2,4095,'helmut-meter-test-invalid-mode',direct_io='true')
 except RuntimeError as e:assert 'boolean'in str(e)
 else:raise AssertionError('non-boolean IO mode accepted')
assert not(B.BASE/'NEVER_CREATED_INVALID_IO_MODE').exists()
print(json.dumps(dict(pass_=True,cases=5+mode_cases+1,DockerCallsActuallyMade=0,devicesActuallyTouched=0,full500Runs=0)))
