'use strict';
// Real Prepare/reporter functions, bounded Pipe packet and real Action. No DB.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm'),cp=require('node:child_process'),{createRequire}=require('node:module');
const P=require('./mock500_prepare_failure'),root=path.resolve(__dirname,'../..');
const CANARY='FICTIONAL_PRIVATE_SQL_URL_TOKEN_MUST_NOT_ESCAPE';
const source=fs.readFileSync(path.join(root,'scripts/synthetik-500-w15-full500-runtime.js'),'utf8');
const reporter=source.slice(source.indexOf('function retainPrepareFailure('),source.indexOf('const Bound ='));
const prepare=source.slice(source.indexOf('async function prepare()'),source.indexOf('\nfunction claimQuery('));
const main=source.slice(source.indexOf('async function main(action)'),source.indexOf('if (require.main === module)'));
const fixed=(extra={})=>({schema:'helmut-w15-mock500-prepare-failure/1',stage:'stored-command',
  category:'PREPARE_STORED_CHECK_123',kind:'assertion',...extra});
function error(file='lib/helmut/synthetik-500-stored-command.js',line=123){
  const e=new assert.AssertionError({message:CANARY});
  e.stack=CANARY+'\n    at need ('+path.join(root,file)+':2:1)\n    at validate ('+path.join(root,file)+':'+line+':5)';return e;
}
function runtime({fail=null,cleanup=null,recordingFailure=false,calendar=null}={}){
  const frames=[],saved=[];const c={commit:'b'.repeat(40)},m={database:'FICTIONAL',productionCommit:c.commit,
    selector:{},controlHash:'CONTROL',booksHash:'BOOKS'};
  const S={prepareSynthetik500StoredCommand:async()=>{if(fail)throw fail;return{executionAuthorized:false,metrics:{wallMs:1}};},
    withSynthetik500InstallationCommand:async(_s,work)=>work(),loadSynthetik500ProductionCommand:async()=>({command:{drafts:[{sources:{}}]}}),
    readSynthetik500CurrentInputs:async()=>{},readAuthStore:async()=>({})};
  const C={controlHash:()=>m.controlHash,booksHash:()=>m.booksHash,DIRECT_GATES:[]};
  const context={console,assert,performance,
    process:{env:{}},fs:{readFileSync:()=>Buffer.from('{}'),existsSync:()=>false,writeSync:(_fd,line)=>frames.push(JSON.parse(line))},
    read:name=>name==='configuration.PRIVATE.json'?c:m,file:()=>'/FICTIONAL',STATE:'/FICTIONAL',PRIV:'FICTIONAL_KEY',DB:m.database,
    ownerGo(){},environment(){},guard(){},setup(){},gateway(){},run(){},atomicPrepared0Check(){},
    AuthReport:{retainOnTermination:()=>()=>{},summarize:()=>({})},ATOMIC_PREPARED0:false,
    observeAuth:()=>({assessment:()=>({pass:true,usageEnvelopes:0})}),
    Durable:{open:()=>({observe(){},ready(){},write(){}}),monitor:()=>()=>{if(cleanup)throw cleanup;}},
    BOUND:calendar?{simulationCalendarAuthorization:true}:null,memory:()=>({}),memoryAccepted:()=>true,
    sha:()=> 'd'.repeat(64),save:(name,value)=>{saved.push({name,value});return{sha256:'e'.repeat(64)};},
    require(name){
      if(name==='./w15-github/mock500_prepare_failure')return recordingFailure?{project(){throw Error(CANARY);}}:P;
      if(name==='../lib/helmut/storage')return S;
      if(name==='../lib/helmut/synthetik-500-production-command')return C;
      if(name==='../lib/helmut/synthetik-500-production-adapter')return{install:async()=>{}};
      if(name==='./w15-github/mock500_calendar')return{withBound(){throw calendar;}};
      throw Error('UNEXPECTED_FICTIONAL_REQUIRE');
    }};
  vm.createContext(context);vm.runInContext('let prepareStage="entry",firstPrepareFailure=null;\n'+reporter+prepare+main,context);
  return {context,frames,saved};
}
async function checks(){
  const primary=error(),secondary=Error('FICTIONAL_LATER_CLEANUP');
  const r=runtime({fail:primary,cleanup:secondary});
  await assert.rejects(r.context.prepare(),e=>e===secondary);
  r.context.retainPrepareFailure(secondary);
  assert.equal(r.frames.length,1);assert.deepEqual(r.frames[0].failure,fixed());
  assert(Buffer.byteLength(JSON.stringify(r.frames[0])+'\n')<=512);
  assert(!JSON.stringify(r.frames).includes(CANARY));
  const broken=runtime({fail:primary,recordingFailure:true});
  await assert.rejects(broken.context.prepare(),e=>e===primary);assert.equal(broken.frames.length,0);
  const success=runtime();await success.context.prepare();assert.equal(success.frames.length,0);
  assert.equal(success.saved.at(-1).name,'PREPARE.SAFE.json');assert.equal(success.saved.at(-1).value.status,'PASS');
  const calendar=error('lib/helmut/synthetik-500-mock-calendar.js',42),cal=runtime({calendar});
  await assert.rejects(cal.context.main('prepare'),e=>e===calendar);cal.context.retainPrepareFailure(calendar);
  assert.equal(cal.frames[0].failure.stage,'calendar');assert.equal(cal.frames[0].failure.category,'PREPARE_CALENDAR_CHECK_42');

  for(const n of [1,65535])assert.equal(P.project(error('lib/helmut/storage.js',n),'auth-read').category,'PREPARE_STORAGE_CHECK_'+n);
  for(const n of [0,65536])assert.equal(P.project(error('lib/helmut/storage.js',n),'auth-read').category,'PREPARE_UNMAPPED');
  const hidden={message:CANARY,stack:CANARY+'\n    at private (/PRIVATE/'+CANARY+':123:1)'};
  assert.equal(P.project(hidden,'setup').category,'PREPARE_UNMAPPED');
  assert.equal(P.project({get stack(){throw Error(CANARY);},get code(){throw Error(CANARY);}},'setup').kind,'unknown');
  for(const [code,kind]of [['MODULE_NOT_FOUND','module'],['EACCES','filesystem'],['ETIMEDOUT','timeout'],['ABORT_ERR','aborted']])
    assert.equal(P.project({code},'setup').kind,kind);
  const bare=error();bare.stack=CANARY+'\n    at '+path.join(root,'lib/helmut/storage.js')+':52:1';
  assert.equal(P.project(bare,'setup').category,'PREPARE_STORAGE_CHECK_52');
  const values=[fixed(),fixed({category:'PREPARE_RUNTIME_CHECK_65535'}),fixed({category:'PREPARE_UNMAPPED'}),
    {...fixed(),message:CANARY},fixed({category:'PREPARE_STORED_CHECK_65536'}),fixed({category:'PREPARE_STORED_CHECK_123\n'}),
    fixed({category:'PREPARE_STORED_CHECK_0123'}),fixed({kind:[]}),fixed({stage:CANARY}),null,[],{}];
  const py=`import importlib.util,json,sys\nfrom pathlib import Path\np=Path(sys.argv[1]);s=importlib.util.spec_from_file_location('fictional_prepare_parity',p/'runner_diagnostics.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nprint(json.dumps([m.prepare_failure(v)for v in json.load(sys.stdin)]))`;
  const python=JSON.parse(cp.execFileSync('python3',['-I','-B','-c',py,__dirname],{input:JSON.stringify(values),encoding:'utf8',timeout:10000}));
  assert.deepEqual(values.map(P.closed),python);

  const fixtures=JSON.parse(cp.execFileSync('python3',['-I','-B',path.join(__dirname,'test_mock500_prepare_failure.py'),'--public-fixtures'],{encoding:'utf8',timeout:10000}));
  const action=path.join(root,'.github/actions/w15-mock500/index.js'),realRequire=createRequire(action);
  function publicAction(receipt){
    const lines=[],process={env:{W15_MODE:'mock500-full-host-functional-gated',EXPECTED_COMMIT:'a'.repeat(40),GITHUB_RUN_ID:'123456789',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/FICTIONAL',GITHUB_EVENT_PATH:'/FICTIONAL',W15_IMAGE_ID:'sha256:'+'b'.repeat(64),W15_NODE_SOURCE:'/FICTIONAL/node',W15_POSTGREST_SOURCE:'/FICTIONAL/postgrest',HELMUT_W15_RECEIVER_PROTECTED_KEY_B64:CANARY,HELMUT_W15_RECEIVER_PASSPHRASE:CANARY,GITHUB_TOKEN:CANARY}};
    const declared={sourceQualification:{},approval:{},limits:{},maximumWallSeconds:12600,bindings:{}};
    vm.runInNewContext(fs.readFileSync(action,'utf8'),{process,Buffer,console:{log:x=>lines.push(x)},require(name){
      if(name==='node:fs')return{readFileSync:()=>JSON.stringify({inputs:{w15_request:JSON.stringify(declared),w15_cipher_index:CANARY}})};
      if(name==='node:child_process')return{spawnSync:(_cmd,_args,opts)=>{
        for(const key of ['HELMUT_W15_RECEIVER_PROTECTED_KEY_B64','HELMUT_W15_RECEIVER_PASSPHRASE','GITHUB_TOKEN'])assert.equal(opts.env[key],undefined);
        return{status:1,stdout:JSON.stringify(receipt)};
      }};
      return realRequire(name);
    }},{filename:action,timeout:3000});
    assert.equal(process.exitCode,1);assert(!lines.join('\n').includes(CANARY));return JSON.parse(lines.at(-1));
  }
  for(const receipt of fixtures){
    const observed=publicAction(receipt);assert.equal(observed.worker.phase,'mock500-controller-prepare');
    assert.deepEqual(observed.runner?.prepareFailure,receipt.runner?.prepareFailure);
    assert.equal(observed.executionAuthority,false);assert.equal(observed.retryAllowed,false);
  }
  const bad=structuredClone(fixtures[0]);bad.runner.prepareFailure.raw=CANARY;
  assert.equal(publicAction(bad).runner.prepareFailure,undefined);
  bad.runner.prepareFailure=fixed();bad.worker.phase='mock500-controller-run';
  assert.equal(publicAction(bad).runner.prepareFailure,undefined);
  console.log('PASS 7 Prepare groups: real body/finally, calendar, closed source mapping, malformed/getter inputs, JS/Python parity, bounded real Pipe, real public Action; 0 original work');
}
checks().catch(error=>{console.error(error);process.exitCode=1;});
