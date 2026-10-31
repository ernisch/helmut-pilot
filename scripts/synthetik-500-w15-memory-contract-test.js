"use strict";
// Arithmetic and saved-evidence assessment only. Never imports a running harness.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
assert(require.cache[require.resolve("./lokaler-netzschutz")]);
const ROOT=path.resolve(__dirname,".."),Memory=require("./fixtures/w15-memory-contract"),L=Memory.limits;
assert.equal(L.comparisonBudgetBytes,2048000000);assert.equal(L.minimumReservePercent,20);
assert.equal(L.requiredReserveBytes,409600000);assert.equal(L.maximumConsumptionBytes,1638400000);
const peaks=[0,L.maximumConsumptionBytes,L.maximumConsumptionBytes+1,L.comparisonBudgetBytes,1558614016];
const expected=[true,true,false,false,true];
peaks.forEach((peak,i)=>assert.equal(Memory.assess(peak).reserveMeetsContract,expected[i]));
for(const invalid of [-1,NaN,Infinity,1.5,"1558614016"])assert.throws(()=>Memory.assess(invalid));
// Evaluate only the actual controller's constant assignments in Python's AST.
// No controller entry point, Docker command, database or runtime is executed.
const python=String.raw`import ast,json,pathlib,sys
controller=pathlib.Path(sys.argv[1]);root=controller.resolve().parents[1]
tree=ast.parse(controller.read_text());names={'MEMORY_CONTRACT','MEMORY_LIMIT','MEMORY_RESERVE'}
assignments=[n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name)and t.id in names for t in n.targets)]
assert len(assignments)==3
scope={'ROOT':root,'json':json};exec(compile(ast.Module(body=assignments,type_ignores=[]),str(controller),'exec'),scope)
limit=scope['MEMORY_LIMIT'];reserve=scope['MEMORY_RESERVE'];peaks=json.loads(sys.argv[2])
print(json.dumps({'limit':limit,'reserve':reserve,'max':limit-reserve,'passes':[limit-p>=reserve for p in peaks]}))`;
const p=spawnSync("python3",["-I","-S","-B","-c",python,path.join(__dirname,"synthetik-500-w15-unit0-controller.py"),JSON.stringify(peaks)],{encoding:"utf8",timeout:10000,env:{PATH:process.env.PATH}});
assert.equal(p.status,0,p.stderr);assert.deepEqual(JSON.parse(p.stdout),{limit:L.comparisonBudgetBytes,reserve:L.requiredReserveBytes,max:L.maximumConsumptionBytes,passes:expected});
const source=path.join(ROOT,"docs/betrieb/belege/w15-processing-20261027/UNIT0B_RESULT.SAFE.json"),raw=fs.readFileSync(source),old=JSON.parse(raw);
assert.equal(old.status,"FAIL_COMMON_MEMORY_RESERVE");assert.equal(old.memory.requiredReserveBytes,500000000);
assert.equal(old.memory.comparisonReserveAtLeast500MB,false);assert.equal(old.memory.technicalCapEnforced,false);
const revised=Memory.assess(old.memory.kernelLifetimePeakBytes);assert.equal(revised.comparisonReserveBytes,489385984);
assert.equal(revised.comparisonReserveBytes-revised.requiredReserveBytes,79785984);assert.equal(revised.reserveMeetsContract,true);
assert.equal(old.full500Proof,false);
console.log("PASS:20% contract; boundary/off-by-one/invalid inputs; actual Python controller constants match; saved UNIT0B reserve passes new rule while historical FAIL and missing cap remain unchanged.");
const output=process.argv.find(x=>x.startsWith("--output="));
if(output){
 const file=path.resolve(output.slice(9));assert.equal(path.dirname(file),"/workspace/shared/helmut-w15-unit0b-20261027");
 fs.writeFileSync(file,JSON.stringify({schema:"helmut-w15-memory-reassessment/2",status:"PASS_RECALCULATED_RESERVE_ONLY",...revised,
  reservePercentOfLimit:100*revised.comparisonReserveBytes/revised.comparisonBudgetBytes,
  surplusAboveRequiredReserveBytes:revised.comparisonReserveBytes-revised.requiredReserveBytes,
  originalReport:{path:path.relative(ROOT,source),bytes:raw.length,sha256:crypto.createHash("sha256").update(raw).digest("hex"),status:old.status,requiredReserveBytes:old.memory.requiredReserveBytes,reservePassed:false},
  checks:["20percent-contract","exact-boundary-pass","one-byte-over-boundary-fail","invalid-peaks-reject","JS-and-actual-Python-constants-match","historical-FAIL-preserved","saved-peak-reassessed-no-new-measurement"],
  technicalCapEnforced:false,technicalMemoryAcceptanceComplete:false,full500Proof:false,newPerformanceTests:0,unitExecutions:0,profileActivations:0,databaseWrites:0,productionChanges:0,
  note:"Explicit operator criterion change. Historical report/measurement not edited. memory.max=max; no new run, freshness approval or hard-cap acceptance."},null,2)+"\n",{flag:"wx",mode:0o600});
}
