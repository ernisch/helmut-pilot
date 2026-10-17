#!/usr/bin/env python3
"""Small kernel cases; no Helmut application, profiles or fixtures imported."""
import importlib.util
import json
import secrets
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location('kernel_meter', Path(__file__).with_name('kernel-meter.py'))
meter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(meter)
root = Path(sys.argv[1]).resolve()
root.mkdir(mode=0o700, parents=True, exist_ok=False)
tag = secrets.token_hex(4)
tail_code = r'''
const {Worker}=require('node:worker_threads'),{spawn}=require('node:child_process');
const hold=Buffer.alloc(32*1024*1024,5);
const worker=new Worker('const{parentPort}=require("node:worker_threads");const b=Buffer.alloc(24*1024*1024,3);setTimeout(()=>parentPort.postMessage(b.length),30);',{eval:true});
const child=spawn(process.execPath,['-e','const b=Buffer.alloc(48*1024*1024,4);setTimeout(()=>{},30)'],{stdio:'ignore'});
Promise.all([new Promise(r=>worker.once('exit',r)),new Promise(r=>child.once('exit',r))]).then(()=>console.log(JSON.stringify({root:true,worker:true,helper:true,held:hold.length})));
process.once('exit',()=>{const tail=Buffer.alloc(192*1024*1024,7);if(tail.at(-1)!==7)throw Error('tail');});
'''
tail = meter.run_probe(root / 'tail', 'helmut-meter-tail-' + tag,
                       'helmut-meter-tail-' + tag, tail_code)
assert tail['final']['memoryPeakBytes'] > 200 * 1024 * 1024, 'final exit allocation missing'
assert tail['final']['cpu']['usage_usec'] > 0
assert tail['final']['events']['populated'] == 0
assert tail['final']['memoryEvents']['oom_kill'] == 0
negative = meter.run_probe(root / 'negative', 'helmut-meter-negative-' + tag,
                           'helmut-meter-negative-' + tag,
                           'const b=Buffer.alloc(64*1024*1024,2);process.exit(7)', expected_exit=7)
assert negative['final']['memoryPeakBytes'] > 64 * 1024 * 1024
try:
    meter.run_probe(root / 'negative', 'helmut-meter-negative-' + tag,
                    'helmut-meter-negative-' + tag, 'process.exit(0)')
    raise AssertionError('reused output/run should have been rejected before effects')
except FileExistsError:
    pass
result = {'pass': True, 'smallCases': ['root_worker_helper_and_final_exit_tail',
          'error_exit_memory_coverage', 'no_automatic_retry'], 'full500Runs': 0,
          'tailPeakBytes': tail['final']['memoryPeakBytes'],
          'tailWholeCPUUsec': tail['final']['cpu']['usage_usec'],
          'negativePeakBytes': negative['final']['memoryPeakBytes']}
meter.save_new(root / 'TEST_RESULT.SAFE.json', result)
print(json.dumps(result))
