'use strict';
// New adapter delta only. Optional PG mode uses a network-none local container.
const A=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const L=require('../lib/helmut/synthetik-500-native-pin'),N=require('../lib/helmut/synthetik-500-native-preimage');
const G=require('./import-preflight-500-sql-generator'),J=require('./synthetik-500-native-import'),F=require('./synthetik-500-import-test');
let total=0; const test=(name,fn)=>{fn();total++;console.log('PASS '+name);};
function pinFixture(){
  const tables=[...G.SNAPSHOT_TABELLEN,...N.STEUERUNG], owner='10';
  const catalog={serverVersion:'170006',session:{currentUser:'postgres',sessionUser:'postgres',roleOid:owner,superuser:true,bypassRls:true},
    relations:tables.map((name,i)=>({name,oid:String(i+100),kind:'r',persistence:'p',partition:false,selectPrivilege:true,owner})),
    columns:G.SNAPSHOT_TABELLEN.flatMap(t=>[{table:t,attnum:1,name:N.pk(t),nullable:false,collation:'100',identity:'',generated:''}]),
    indexes:G.SNAPSHOT_TABELLEN.map(t=>({table:t,primary:true,unique:true,valid:true,ready:true,immediate:true,predicate:null,keys:'1',collations:'100',opclasses:'3126'})),
    opclasses:[{oid:'3126',opcdefault:true}],types:[],constraints:[],collations:[],operators:[],comparators:[],triggers:[],policies:[],extensions:[]};
  const rev=()=>({rows:0,revisionHash:'1'.repeat(64)}),revisionen=Object.fromEntries(G.SNAPSHOT_TABELLEN.map(t=>[t,rev()])),scopeRevisionen=Object.fromEntries(G.V2_SNAPSHOT_DATEIEN.map(t=>[t,rev()]));
  revisionen.profiles.rows=501;revisionen.mandate_profiles.rows=500;scopeRevisionen.profiles.rows=500;scopeRevisionen.mandate_profiles.rows=500;scopeRevisionen.fremd_profiles.rows=1;
  return {version:L.VERSION,operationId:'synthetik500-native-pin-unit',observedAt:new Date().toISOString(),catalog,revisionen,scopeRevisionen,
    mandatIds:Array.from({length:500},(_,i)=>'old-profile-'+i),fremdIds:['foreign-profile'],
    mainAuth:{rows:1,fullFieldSha256:'2'.repeat(64),xmins:['123']},controls:Object.fromEntries(N.STEUERUNG.map(t=>[t,0])),
    quiet:{jobs:0,locks:0,processes:0,outbox:0},migrationJournal:{count:1,versions:['20260101000000']},
    transaction:{readOnly:'on',isolation:'repeatable read',transactionTimeout:'17s',statementTimeout:'20s',lockTimeout:'2s',snapshot:'124:124:'}};
}
const input=a=>({paketBytes:F.paketBytes,nativePinBytes:JSON.stringify(a)});
function offline(){
  test('Pin is a native metadata contract, never a forged JSONL manifest',()=>{const c=L.pruefeNativePinEingabe(input(pinFixture()));A.equal(c.binding.version,'helmut-synthetik500-native-live-preimage/1');A.equal(c.binding.snapshotHash,c.binding.nativePinSha256);A.equal(c.sp.manifest.dateien,undefined);A.equal(c.sp.manifest.snapshotVertrag,undefined);});
  const invalid=[['unknown top key',a=>a.exportBinding={}],['missing control pin',a=>delete a.controls],['incomplete scope',a=>delete a.scopeRevisionen.briefings],['bad revision',a=>a.revisionen.decisions.revisionHash='bad'],['duplicate old ID',a=>a.mandatIds[1]=a.mandatIds[0]],['foreign overlap',a=>a.fremdIds[0]=a.mandatIds[0]],['new ID collision',a=>a.mandatIds[0]='test-kohorte-synthetik-bt-001'],['missing auth',a=>delete a.mainAuth],['bad auth xmin',a=>a.mainAuth.xmins=['wrong']],['control count invalid',a=>a.controls.process_runs=-1],['not quiet',a=>a.quiet.jobs=1],['journal duplicate',a=>{a.migrationJournal.count=2;a.migrationJournal.versions.push(a.migrationJournal.versions[0]);}],['journal count mismatch',a=>a.migrationJournal.count=2],['read-write receipt',a=>a.transaction.readOnly='off'],['unbounded transaction',a=>a.transaction.transactionTimeout='0'],['invisible actor',a=>{a.catalog.session.superuser=false;a.catalog.session.bypassRls=false;}],['wrong owner',a=>a.catalog.relations[0].owner='999'],['duplicate relation',a=>a.catalog.relations[0].name=a.catalog.relations[1].name],['broken primary index',a=>a.catalog.indexes[0].valid=false],['generated source column',a=>a.catalog.columns[0].generated='s']];
  for(const[name,mutate]of invalid)test(name+' fails closed',()=>{const a=pinFixture();mutate(a);A.throws(()=>L.pruefeNativePinEingabe(input(a)));});
  test('Byte bound fails before parsing oversized input',()=>A.throws(()=>L.pruefeNativePinEingabe({paketBytes:F.paketBytes,nativePinBytes:'x'.repeat(4*1024*1024+1)}),/bytes/));
  test('Mutated context and fabricated context cannot generate SQL',()=>{const c=L.pruefeNativePinEingabe(input(pinFixture()));c.a.mainAuth.xmins[0]='456';A.throws(()=>L.erzeugeSql(c),/context-drift/);A.throws(()=>L.erzeugeSql({}),/context-drift/);});
  test('Generated delta adds guards before private writes and preserves original SQL',()=>{const c=L.pruefeNativePinEingabe(input(pinFixture())),base=J.erzeugeSql(c),q=L.erzeugeSql(c),marker=`create schema ${N.ident(c.schema)};revoke all on schema`;
    const start=base.stage.indexOf(marker),end=q.stage.indexOf(marker);A(start>q.stage.indexOf('lock table'));A(end>start);A.equal(q.stage.slice(0,start)+q.stage.slice(end),base.stage);A.equal(q.forward,base.forward);A.equal(q.rollback,base.rollback);A.match(q.stage,/main-auth-drift/);A.match(q.stage,/control-drift/);A.match(q.stage,/journal-drift/);A.match(q.stage,/transaction_timeout='17s'/);});
}
function postgres(container,externalRun=null){
  if(!externalRun){A.equal(container,'helmut-pre500-carrier-local');const inspect=spawnSync('docker',['inspect','--format','{{.HostConfig.NetworkMode}} {{len .HostConfig.PortBindings}}',container],{encoding:'utf8'});A.equal(inspect.status,0);A.equal(inspect.stdout.trim(),'none 0');}
  const db='native_pin_delta_'+require('node:crypto').randomBytes(6).toString('hex');
  const run=externalRun?((sql,_database=db,error=null)=>externalRun(sql,error)):((sql,database=db,error=null)=>{const r=spawnSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-Atq','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:23000,maxBuffer:8*1024*1024});if(error){A.notEqual(r.status,0);A.match(r.stderr,error);}else A.equal(r.status,0,r.stderr);return r.stdout.trim();});
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'helmut-native-pin-delta-'));if(!externalRun)run('create database '+db+';','postgres');
  try{
    let seq=0;const seed=()=>{const f=F.fixture(path.join(tmp,'fixture-'+require('node:crypto').randomBytes(4).toString('hex')));run(F.bootstrap(f)+"create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key);truncate supabase_migrations.schema_migrations;insert into supabase_migrations.schema_migrations values('20260101000000');");return JSON.parse(run(L.aufnahmeSql('synthetik500-native-pin-pg-'+(++seq))));};
    test('New native pin runs preserved Stage, inactive replacement and exact return',()=>{const a=seed(),c=L.pruefeNativePinEingabe(input(a)),q=L.erzeugeSql(c);run(q.stage);run(q.forward);A.equal(run("select count(*)from mandate_profiles where aktiv is not false;"),'0');A.equal(run("select count(*)from profiles where id like 'test-kohorte-synthetik-%';"),'500');run(q.rollback);A.equal(run("select count(*)from profiles where id like 'alt-mandat-%';"),'500');A.equal(run("select count(*)from profiles where id='fremd-admin';"),'1');});
    for(const[name,change,error]of[
      ['auth no-op xmin drift',"update helmut_store set data=data where id='main-auth';",/main-auth-drift/],
      ['finished process count drift',"insert into process_runs values(now(),'success');",/control-drift/],
      ['migration journal drift',"insert into supabase_migrations.schema_migrations values('20260102000000');",/journal-drift/]
    ])test(name+' rejects before any private Stage effect',()=>{const a=seed(),c=L.pruefeNativePinEingabe(input(a)),q=L.erzeugeSql(c);run(change);run(q.stage,db,error);A.equal(run(`select count(*)from pg_namespace where nspname=${N.literal(c.schema)};`),'0');A.equal(run("select count(*)from profiles where id like 'alt-mandat-%';"),'500');});
  }finally{if(!externalRun)run('drop database '+db+';','postgres');fs.rmSync(tmp,{recursive:true,force:true});}
}
if(require.main===module){if(process.argv[4]!=='--skip-offline')offline();if(process.argv.length>2){A.equal(process.argv[2],'--postgres-container');A([4,5].includes(process.argv.length));if(process.argv.length===5)A.equal(process.argv[4],'--skip-offline');postgres(process.argv[3]);}console.log(total+'/'+total+' native pin delta checks passed');}
module.exports={offline,postgres};
