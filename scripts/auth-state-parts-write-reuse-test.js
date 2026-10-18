'use strict';
// Pure adversarial writer-reuse regressions. No DB, process activation or GO.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const file=path.resolve(__dirname,'../lib/helmut/auth-state-parts.js'),source=fs.readFileSync(file,'utf8');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x));
const normalize=x=>Object.fromEntries(Object.entries(copy(x)).filter(([k])=>!['llmUsage','_llmUsageRef','_authStateRef','_authStoreRevision'].includes(k)));
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
function load({spy=false,patches=[],text=source}={}){
  for(const[from,to]of patches){assert.equal(text.split(from).length,2,'Test patch must match exactly once');text=text.replace(from,to);}
  const m=new Module(file,module);m.filename=file;m.paths=module.paths;m.__testProbe={hits:0};
  if(spy){const hook='function reuseNode(hash) {';assert.equal(text.split(hook).length,2);text=text.replace(hook,hook+'\n    module.__testProbe.hits++;');}
  m._compile(text,file);return{C:m.exports,probe:m.__testProbe};
}
function checkGraph(graph){
  assert.ok(graph.hashes instanceof Set);assert.ok(graph.nodes.length<=20000);const map=new Map(),values=new Map(),depths=new Map();let total=0,work=0;
  for(const n of graph.nodes){assert.equal(n.hash===sha(n.payload),true,'actual payload hash');assert.equal(map.has(n.hash),false,'unique nodes');const bytes=Buffer.byteLength(n.payload);total+=bytes;assert.ok(bytes<=4*1024*1024);assert.ok(total<=32*1024*1024);const[tag,v]=JSON.parse(n.payload);assert.equal(n.payload===canonical([tag,v]),true,'canonical node payload');let out,refs=[];
    if(tag==='v')out=v;
    else if(tag==='o'||tag==='m'){out=Object.create(null);assert.ok(v.length<=16);const labels=new Set();for(const[k,h]of v){assert.equal(labels.has(k),false);labels.add(k);assert.equal(values.has(h),true,'postorder');refs.push(h);if(tag==='o'){Object.defineProperty(out,k,{value:values.get(h),enumerable:true,writable:true,configurable:true});}else{const child=values.get(h);assert.ok(child&&typeof child==='object'&&!Array.isArray(child));for(const key of Object.keys(child)){assert.equal(Object.hasOwn(out,key),false,'no duplicate merge keys');Object.defineProperty(out,key,{value:child[key],enumerable:true,writable:true,configurable:true});}}}}
    else{assert.ok(tag==='a'||tag==='l');assert.ok(v.length<=32);out=[];for(const h of v){assert.equal(values.has(h),true,'postorder');refs.push(h);if(tag==='a')out.push(values.get(h));else{assert.equal(Array.isArray(values.get(h)),true);for(const item of values.get(h))out.push(item);}}}
    const depth=1+Math.max(0,...refs.map(h=>depths.get(h)));assert.ok(depth<=64);work+=Buffer.byteLength(JSON.stringify(out));assert.ok(work<=256*1024*1024);map.set(n.hash,n.payload);values.set(n.hash,out);depths.set(n.hash,depth);
  }
  const reached=new Set(),todo=[graph.root];while(todo.length){const h=todo.pop();if(reached.has(h))continue;reached.add(h);assert.equal(map.has(h),true);const[t,v]=JSON.parse(map.get(h));if(t==='a'||t==='l')todo.push(...v);else if(t==='o'||t==='m')todo.push(...v.map(p=>p[1]));}assert.equal(reached.size,map.size);assert.equal([...graph.hashes].every(h=>map.has(h)),true);assert.equal(graph.hashes.size,map.size);
  return{map,data:JSON.parse(JSON.stringify(values.get(graph.root))),values};
}
function equalGraphs(actual,expected){assert.equal(actual.root===expected.root,true,'same canonical root');const a=checkGraph(actual),b=checkGraph(expected);assert.equal(a.map.size,b.map.size,'same unique node count');for(const[h,p]of a.map)assert.equal(b.map.get(h)===p,true,'same exact node payload map');return a;}
const namespace='pure-writer-target|generation-one',groups=[],selectedGroups=process.env.WRITE_REUSE_TEST_GROUPS?.split(',');
function test(name,fn){if(selectedGroups&&!selectedGroups.includes(name))return;try{const detail=fn();groups.push({name,passed:true,...(detail||{})});}catch(e){e.message=name+': '+e.message;throw e;}}
function warm(C,input,ns=namespace){const graph=C.build(input),actual=C.decode(graph,graph.root,ns);assert.equal(canonical(actual.data)===canonical(normalize(input)),true);return{graph,data:actual.data};}
function compare(seed,mutate,{requireHit=true}={}){
  const{C,probe}=load({spy:true}),base=warm(C,seed),input=copy(base.data);mutate(input);probe.hits=0;
  const actual=C.build(input,{namespace,root:base.graph.root}),expected=load().C.build(input),checked=equalGraphs(actual,expected);
  assert.equal(canonical(checked.data)===canonical(normalize(input)),true);if(requireHit)assert.ok(probe.hits>0,'actual private reuse branch must execute');
  const fresh=C.decode(actual,actual.root,namespace);assert.equal(canonical(fresh.data)===canonical(normalize(input)),true);
  return{nodes:actual.nodes.length,reuseBranchCalls:probe.hits,exactRootAndPayloadMap:true,validPostorder:true};
}
const base=()=>({stable:{payload:'x'.repeat(20000),nested:{keep:true}},changing:{tiny:1,status:'old'},independent:{payload:'y'.repeat(20000)}});
test('unchanged-root-reuses-complete-verified-closure',()=>compare(base(),()=>{}));
test('tiny-and-large-nested-changes-remain-identical-to-cold-full-build',()=>{const cases=[compare(base(),x=>{x.changing.tiny++;}),compare(base(),x=>{x.stable.payload+='changed';}),compare(base(),x=>{delete x.changing.status;x.changing.nil=null;x.newField={deep:[1,null,{}]};})];return{cases};});
test('virtual-object-hash-buckets-never-become-standalone-canonical-values',()=>{
  const zero={},one={};for(let i=0;Object.keys(zero).length<160||Object.keys(one).length<160;i++){const key='bucket-key-'+i,b=sha(key)[0];if(b==='0'&&Object.keys(zero).length<160)zero[key]={data:'z'.repeat(300)};if(b==='1'&&Object.keys(one).length<160)one[key]={data:'o'.repeat(300)};}
  const big={...zero,...one},seed={map:big,stable:{payload:'p'.repeat(20000)}};
  const a=compare(seed,x=>{x.newStandalone=zero;}),b=compare({...seed,ordinaryZero:zero},x=>{delete x.ordinaryZero;x.map.extra={data:'new'};});return{cases:[a,b],bucketKeys:320};
});
test('virtual-concatenation-groups-never-replace-small-standalone-arrays',()=>{
  const rows=Array.from({length:4000},(_,i)=>i),seed={rows,stable:{payload:'p'.repeat(20000)}};
  const a=compare(seed,x=>{x.newStandalone=rows.slice(-1024);});
  const b=compare({...seed,ordinarySubset:rows.slice(-1024)},x=>{delete x.ordinarySubset;x.newStandalone=rows.slice(0,928);});return{cases:[a,b],longArrayItems:4000};
});
test('prepend-append-clip-and-reorder300-compare-actual-payload-sets',()=>{
  const rows=Array.from({length:300},(_,i)=>({id:i,text:'row'.repeat(28)})),seed={rows,stable:{payload:'s'.repeat(20000)}},cases={};
  for(const[k,fn]of Object.entries({prepend:x=>{x.rows=[{id:-1,text:'new'},...x.rows];},append:x=>{x.rows=[...x.rows,{id:300,text:'new'}];},clip:x=>{x.rows=[{id:-1,text:'new'},...x.rows].slice(0,300);},reorder:x=>{x.rows.reverse();}}))cases[k]=compare(seed,fn);return{cases};
});
test('aliases-and-literal-prototype-numeric-keys-retain-exact-transport-content',()=>{
  const literal=JSON.parse('{"__proto__":{"literal":true},"constructor":{"prototype":false},"10":"ten","2":"two"}');literal.body='v'.repeat(20000);
  const result=compare({a:literal,b:literal,stable:{payload:'x'.repeat(20000)}},x=>{x.a.__proto__.literal=false;Object.defineProperty(x.a,'newLiteral',{value:{constructor:true},enumerable:true});});assert.equal({}.literal,undefined);return result;
});
test('wrong-namespace-or-base-root-and-restart-use-full-build-fallback',()=>{
  const results=[];for(const kind of['wrong-namespace','wrong-root','cold-restart','namespace-replaced']){let{C,probe}=load({spy:true});const first=warm(C,base()),input=copy(first.data);input.changing.tiny++;
    let reuse={namespace,root:first.graph.root};if(kind==='wrong-namespace')reuse.namespace+='-other';if(kind==='wrong-root')reuse.root='0'.repeat(64);if(kind==='cold-restart')({C,probe}=load({spy:true}));if(kind==='namespace-replaced')warm(C,{...base(),another:true},namespace+'-other');probe.hits=0;
    equalGraphs(C.build(input,reuse),load().C.build(input));assert.equal(probe.hits,0,'wrong/cold namespace must never use cache');results.push({kind,reuseBranchCalls:0,exactFallback:true});}
  return{cases:results};
});
test('caller-source-and-detached-read-mutations-cannot-poison-private-cache',()=>{
  const{C,probe}=load({spy:true}),input=base(),first=warm(C,input);input.stable.nested.keep=false;first.data.changing.tiny=2;
  probe.hits=0;const a=C.build(input,{namespace,root:first.graph.root});equalGraphs(a,load().C.build(input));assert.notEqual(a.root,first.graph.root);assert.ok(probe.hits>0);
  const b=C.build(first.data,{namespace,root:first.graph.root});equalGraphs(b,load().C.build(first.data));assert.notEqual(b.root,first.graph.root);return{sourceMutationDetected:true,detachedReadMutationDetected:true};
});
test('deduplicated-array-metadata-survives-both-ordinary-and-chunk-positions',()=>{
  const a=Array(32).fill('x'.repeat(400)),seed={a,b:[...a,...a],stable:{payload:'s'.repeat(20000)}};
  const x=compare(seed,v=>{v.counter=1;}),y=compare(seed,v=>{v.a=[...v.a,'changed'];});return{cases:[x,y]};
});
test('cached-subtrees-still-count-toward-every-global-budget',()=>{
  const cases=[];
  for(const item of[
    {name:'work',patch:['MAX_EXPANDED_BYTES = 256 * 1024 * 1024','MAX_EXPANDED_BYTES = 64 * 1024'],seed:{stable:'x'.repeat(20000)},next:x=>({outer:{inner:x}}),code:'AUTH_STATE_WORK_LIMIT'},
    {name:'unique-node-count',patch:['MAX_NODES = 20000','MAX_NODES = 5'],seed:{stable:{payload:'x'.repeat(20000)}},next:x=>({...x,extra1:{payload:'y'.repeat(20000)},extra2:{payload:'z'.repeat(20000)}}),code:'AUTH_STATE_NODES_LIMIT'},
    {name:'unique-payload-bytes',patch:['MAX_UNIQUE_BYTES = 32 * 1024 * 1024','MAX_UNIQUE_BYTES = 16 * 1024'],seed:{keep:'x'.repeat(4000)},next:x=>({keep:x,extra:'y'.repeat(13000)}),code:'AUTH_STATE_PAYLOAD_LIMIT'},
    {name:'logical-depth',patch:['MAX_DEPTH = 64','MAX_DEPTH = 8'],seed:{stable:{nested:{keep:true}}},next:x=>{for(let i=0;i<7;i++)x={wrapper:x};return x;},code:'AUTH_STATE_DEPTH_LIMIT'}]){
    const{C,probe}=load({spy:true,patches:[item.patch]}),first=warm(C,item.seed),next=item.next(copy(first.data));probe.hits=0;
    assert.throws(()=>C.build(next,{namespace,root:first.graph.root}),{code:item.code});assert.throws(()=>load({patches:[item.patch]}).C.build(next),{code:item.code});
    if(item.name!=='logical-depth')assert.ok(probe.hits>0,'budget must account actual reused closure');cases.push({name:item.name,expectedCode:item.code,reuseBranchCalls:probe.hits,testOnlyStricterLimit:true});}
  return{cases,productionLimitsUnchanged:true,largestSyntheticSourceBytes:100000};
});
test('state-mode-default-and-source-file-remain-unchanged',()=>{const{C}=load();assert.equal(C.enabled({}),false);assert.throws(()=>C.enabled({HELMUT_AUTH_STATE_STORAGE:'merkle-auth-v1',HELMUT_LLM_USAGE_STORAGE:'relational-atomic-v1',SUPABASE_URL:'https://example.com',VERCEL:'1'}));assert.equal(fs.readFileSync(file,'utf8'),source);return{defaultOff:true};});
const fixtureIndex=process.argv.indexOf('--fixture');if(fixtureIndex>=0)test('optional-local-existing-diagnostic-fixture-metadata-only',()=>{assert.ok(process.argv[fixtureIndex+1]);const d=JSON.parse(fs.readFileSync(process.argv[fixtureIndex+1])).data;return compare(d,x=>{x.localWriterRegression=1;});});
const oracleIndex=process.argv.indexOf('--oracle');if(oracleIndex>=0)test('optional-local-prior-codec-oracle-has-identical-canonical-layout',()=>{assert.ok(process.argv[oracleIndex+1]);const previous=fs.readFileSync(process.argv[oracleIndex+1],'utf8');let comparisons=0;for(const seed of[base(),{rows:Array.from({length:300},(_,i)=>({id:i,text:'row'.repeat(28)})),stable:{payload:'s'.repeat(20000)}},{a:Array(32).fill('x'.repeat(400)),b:Array(64).fill('x'.repeat(400))}]){equalGraphs(load().C.build(seed),load({text:previous}).C.build(seed));comparisons++;}return{previousCodecSHA256:sha(previous),comparisons};});
const result={schema:'helmut-pure-writer-reuse-regression/1',timestamp:new Date().toISOString(),codecSHA256:sha(source),pass:true,groups,claims:{database:false,network:false,activation:false,full500:false,GOClaimed:false,performanceAcceptance:false,production:false},cacheHitEvidence:'Private branch counter in isolated test-only source copy; payload/root equality from actual source against cold full build. No runtime API/source modification.'};
const resultIndex=process.argv.indexOf('--result');if(resultIndex>=0){assert.ok(process.argv[resultIndex+1]);fs.writeFileSync(process.argv[resultIndex+1],JSON.stringify(result,null,2)+'\n');}console.log(JSON.stringify(result,null,2));
