#!/usr/bin/env python3
"""An unrelated 384MiB process must not enter the small measured group."""
import importlib.util,json,secrets,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('kernel_meter',Path(__file__).with_name('kernel-meter.py'))
K=importlib.util.module_from_spec(spec);spec.loader.exec_module(K)
root=Path(sys.argv[1]).resolve();root.mkdir(mode=0o700,parents=True,exist_ok=False)
tag=secrets.token_hex(4);name='helmut-meter-foreign-'+tag;parent=name
K.initialize_parent(parent,name+'-bootstrap')
args=['create','--name',name,'--cgroup-parent=/'+parent,'--network','none','--cap-drop','ALL',
      '--security-opt','no-new-privileges','--entrypoint',str(K.NODE_ROOT/'bin/node')]
args+=K.common_mounts(root)
args+=[K.IMAGE,'-e','const b=Buffer.alloc(384*1024*1024,6);console.log(b.length);setTimeout(()=>{},5000)']
cid=K.docker(args).stdout.strip();K.docker(['start',cid])
for _ in range(50):
    if K.kernel_snapshot(parent)['memoryCurrentBytes']>384*1024*1024:break
    time.sleep(.05)
assert K.docker(['inspect','--format','{{.State.Running}}',cid]).stdout.strip()=='true'
r=K.run_probe(root/'measured','helmut-meter-small-'+tag,'helmut-meter-small-'+tag,
              'const b=Buffer.alloc(2*1024*1024,1);setTimeout(()=>console.log(b.length),100)')
assert K.docker(['inspect','--format','{{.State.Running}}',cid]).stdout.strip()=='true','foreign allocation must overlap whole measured case'
assert r['final']['memoryPeakBytes']<128*1024*1024,'foreign memory was included'
assert int(K.docker(['wait',cid],timeout=20).stdout.strip())==0
foreign=K.kernel_snapshot(parent,require_empty=True)
assert foreign['memoryPeakBytes']>384*1024*1024
result={'pass':True,'full500Runs':0,'unrelatedProcessConcurrent':True,
        'measuredPeakBytes':r['final']['memoryPeakBytes'],'foreignPeakBytes':foreign['memoryPeakBytes']}
K.save_new(root/'FOREIGN_EXCLUSION.SAFE.json',result);print(json.dumps(result))
