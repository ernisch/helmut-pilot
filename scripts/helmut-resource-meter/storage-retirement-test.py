#!/usr/bin/env python3
"""Pure fault injection: no Docker, device, database, profiles or valid GO."""
import importlib.util,json,os,subprocess,tempfile
from pathlib import Path
from unittest.mock import patch

s=importlib.util.spec_from_file_location('bounded',Path(__file__).with_name('bounded-storage.py'))
B=importlib.util.module_from_spec(s);s.loader.exec_module(B)

with tempfile.TemporaryDirectory(prefix='helmut-meter-retirement-') as temporary:
    base=Path(temporary);out=base/'fixture';calls=[];inspects=0
    class Free:
        f_bavail=32*1024**3
        f_frsize=1
    def fake_docker(argv,**kwargs):
        global inspects
        calls.append(argv)
        if argv[0]=='create':return subprocess.CompletedProcess(argv,0,'a'*64+'\n','')
        if argv[0]=='start':
            (out/'nodes').mkdir()
            (out/'nodes/LOOP_DEVICE').write_text('TEST_REGULAR_FILE_NO_DEVICE\n')
            (out/'STORAGE_READY.SAFE.json').write_text(json.dumps({'capacityBytes':128*1024*1024,'capsAfterSetup':'0'}))
        if argv[0]=='inspect':
            inspects+=1
            return subprocess.CompletedProcess(argv,0,'true|0' if inspects==1 else 'false|1','')
        if argv[:2]==['volume','inspect']:return subprocess.CompletedProcess(argv,1,'','not found')
        return subprocess.CompletedProcess(argv,0,'','')
    with patch.object(B,'BASE',base),patch.object(B.os,'statvfs',return_value=Free()),\
         patch.object(B.os,'posix_fallocate',side_effect=lambda fd,offset,size:os.ftruncate(fd,size)),\
         patch.object(B.subprocess,'run',return_value=subprocess.CompletedProcess([],0,b'',b'')),\
         patch.object(B.K,'save_new',side_effect=lambda p,v:Path(p).write_text(json.dumps(v))),\
         patch.object(B.K,'initialize_parent'),patch.object(B.K,'docker',side_effect=fake_docker):
        try:B.create(out,128*1024*1024,17,'TEST_NO_CGROUP')
        except RuntimeError as error:assert 'helper exited while creating' in str(error)
        else:raise AssertionError('dead holder accepted')
    assert any(a[:2]==['volume','create'] for a in calls)
    assert not (out/'nodes').exists()
    assert (out/'RETIRED-nodes/LOOP_DEVICE').is_file()
    assert not (out/'BOUNDED_STORAGE_READY.SAFE.json').exists()
    assert not any(a[0] in ['exec','run','stop','rm'] for a in calls)
    # Retirement is idempotent and does not detach/reassign/delete the image.
    before=(out/'RETIRED-nodes/LOOP_DEVICE').read_bytes()
    B.retire_nodes(out)
    assert (out/'RETIRED-nodes/LOOP_DEVICE').read_bytes()==before
    assert (out/'image.raw').is_file()
print(json.dumps({'pass':True,'cases':2,'fault':'holder exits during volume creation',
    'noUsableRetainedDevicePath':True,'DockerCallsActuallyMade':0,'devicesActuallyTouched':0,
    'full500Runs':0,'resourceGOConsumed':False}))
