"""Two synthetic boundaries for the existing native role-export stop guard.

The real stop module runs in a Node VM with a fictional /proc and signal
adapter. No real process, database or container is contacted. The native export
fixture separately verifies the worker's real PostgreSQL command execution.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest

STOP_SOURCE = Path(__file__).absolute().parents[2] / 'scripts/fixtures/w15-owned-process-stop.js'

HARNESS = r'''"use strict";
const assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs");
const input=JSON.parse(fs.readFileSync(0,"utf8"));
const base="/tmp/w15-memory-atomic-20261028d",action="backup-roles";
const database="helmut_w15_memory_atomic_20261028d",state=base+"/state";
const group=940001,nodePID=940002,rolesPID=940003,versionPID=940004;
const commands=new Map([
 [group,["timeout","55s",base+"/node","-e","SYNTHETIC_WORKER",base,action,database]],
 [nodePID,[base+"/node","-e","SYNTHETIC_WORKER",base,action,database]],
 [rolesPID,["/usr/lib/postgresql/17/bin/pg_dumpall","--no-password",
   "--host=/var/run/postgresql","--port=5432","--username=postgres",
   "--database=postgres","--roles-only","--dbname=application_name="+base+"/pg_dumpall"]]
]);
assert(["bound-role-export","unbound-version-child"].includes(input.case));
if(input.case==="unbound-version-child")commands.set(versionPID,["/usr/lib/postgresql/17/bin/pg_dump","-V"]);
const signals=[],records=[];
let closed=false,marker=false;
const fakeFS={
 openSync(path,mode,permissions){assert.equal(path,state+"/stop-"+action+".SAFE.jsonl");
   assert.equal(mode,"a");assert.equal(permissions,384);return 41;},
 existsSync(path){if(path===state+"/STOP_REQUESTED.SAFE.json")return marker;
   assert([state+"/"+action+".pid",state+"/"+action+".node.SAFE.json"].includes(path));return true;},
 writeFileSync(target,data,options){if(typeof target==="number"){
     assert.equal(target,41);records.push(JSON.parse(data));return;}
   assert.equal(target,state+"/STOP_REQUESTED.SAFE.json");
   assert.equal(options.flag,"wx");assert.equal(options.mode,384);marker=true;},
 fdatasyncSync(fd){assert.equal(fd,41);},closeSync(fd){assert.equal(fd,41);},
 readdirSync(path){assert.equal(path,"/proc");return closed?[]:[...commands.keys()].map(String);},
 readFileSync(path,encoding){
   if(path===state+"/"+action+".node.SAFE.json"){
     assert.equal(encoding,undefined);
     return Buffer.from(JSON.stringify({phase:action,pid:nodePID,startTicks:"940005"}));}
   assert.equal(encoding,"utf8");
   if(path===state+"/"+action+".pid")return String(group);
   const pieces=path.split("/");
   assert.equal(pieces.length,4);assert.equal(pieces[1],"proc");
   const pid=Number(pieces[2]);assert(commands.has(pid));
   if(pieces[3]==="stat")return pid+" (fictional-owned-child) S 1 "+group+" 1 0";
   assert.equal(pieces[3],"cmdline");return commands.get(pid).join("\0")+"\0";
 }
};
const moduleObject={exports:{}};
const sandbox={module:moduleObject,
 require(name){if(name==="node:fs")return fakeFS;if(name==="node:assert/strict")return assert;
   assert.equal(name,"./w15-durable-observations");return {startTicks(pid){assert.equal(pid,nodePID);return "940005";}};},
 process:{kill(pid,signal){assert.equal(pid,nodePID);assert.equal(signal,"SIGTERM");
   signals.push({pid,signal});closed=true;}},
 setTimeout(callback){callback();return 1;},clearTimeout(){}
};
(async()=>{
 vm.runInNewContext(input.source,sandbox,{filename:"w15-owned-process-stop.js",timeout:1000});
 let failure;
 try{await moduleObject.exports.stop(base,action,database,"active","end500-backup");}
 catch(error){failure=error.stopFailure;}
 if(input.case==="bound-role-export"){
   assert.equal(failure,undefined);assert.deepEqual(signals,[{pid:nodePID,signal:"SIGTERM"}]);
   assert(records.some(row=>row.status==="SIGNAL_REQUEST_ACCEPTED"&&row.target==="registered-node"));
   assert(records.some(row=>row.status==="OWNED_PROCESS_EXIT_CONFIRMED"));
   process.stdout.write(JSON.stringify({status:"PASS_BOUND_ROLE_EXPORT_STOP_ONLY",syntheticSignals:1,actualSignals:0}));
 }else{
   assert(failure);assert.equal(failure.status,"STOP_FAILURE");assert.equal(failure.phase,"proc-ownership");
   assert.equal(failure.reason,"unowned-live-process");assert.equal(signals.length,0);
   assert(records.some(row=>row.status==="STOP_FAILURE"&&row.reason==="unowned-live-process"));
   process.stdout.write(JSON.stringify({status:"PASS_UNBOUND_VERSION_CHILD_REJECTED_ONLY",syntheticSignals:0,actualSignals:0}));
 }
})().catch(()=>{process.stdout.write('{"status":"FAIL_SYNTHETIC_ROLE_EXPORT_STOP_BOUNDARY"}');process.exitCode=1;});'''


class RoleExportStopBoundaryChecks(unittest.TestCase):
    def observe(self, case):
        node = shutil.which('node')
        self.assertIsNotNone(node, 'Node is required for the synthetic stop-boundary test')
        payload = json.dumps({'source': STOP_SOURCE.read_text(), 'case': case}).encode()
        result = subprocess.run([node, '-e', HARNESS], input=payload,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10, close_fds=True,
            env={'PATH': os.defpath, 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8'})
        self.assertEqual(result.returncode, 0, 'Synthetic stop-boundary harness rejected its fixed case')
        self.assertEqual(result.stderr, b'', 'Synthetic stop-boundary harness must not emit raw errors')
        return json.loads(result.stdout)

    def test_real_role_binary_with_base_conninfo_retains_registered_node_stop(self):
        self.assertEqual(self.observe('bound-role-export'), {
            'status': 'PASS_BOUND_ROLE_EXPORT_STOP_ONLY', 'syntheticSignals': 1, 'actualSignals': 0})

    def test_unbound_native_version_descendant_stays_closed_before_any_signal(self):
        self.assertEqual(self.observe('unbound-version-child'), {
            'status': 'PASS_UNBOUND_VERSION_CHILD_REJECTED_ONLY', 'syntheticSignals': 0, 'actualSignals': 0})


if __name__ == '__main__':
    unittest.main()
