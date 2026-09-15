'use strict';
const A = require('node:assert/strict'), C = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
const {collect,localNeed} = require('./b055-aufnahme/aufnahme'), {gate} = require('./b055-aufnahme/auftrag-pruefen');
const P = require('./b055-aufnahme/b055-aufnahme-pruefer'), T = require('./b055-aufnahme/transport');
const root = path.resolve(__dirname,'..'), storageText = require('./fixtures/b055-historischer-storage')();
const aktuellerStorageText = fs.readFileSync(path.join(root,'lib/helmut/storage.js'),'utf8');
const pair = C.generateKeyPairSync('rsa',{modulusLength:3072});
const publicKey = pair.publicKey.export({format:'der',type:'spki'}).toString('base64');
const pem = pair.privateKey.export({format:'pem',type:'pkcs8'});
const request = {version:1,mandat:'test-kohorte-b-055',productionCommit:P.COMMIT,freigegeben:true,
  nonce:'a'.repeat(32),publicKey,codeCommit:'b'.repeat(40),gueltigBisUtc:'2026-09-14T12:00:00Z'};
const env = {SUPABASE_URL:'https://ddckuvvpcytqbyfmbvie.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetischer-db-schluessel',HELMUT_CRON_SECRET:'synthetischer-status-schluessel',
  GITHUB_RUN_ID:'123456789',GITHUB_SHA:'b'.repeat(40),GITHUB_REPOSITORY:'ernisch/helmut-pilot',GITHUB_REF:'refs/heads/codex/b055-relative-fristen-20260914',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1'};
const report = {ok:true,schemaVersion:1,reinLesend:true,production:true,commit:P.COMMIT,
  storageSupabase:true,v3Bereit:true,profileRelational:true,profileExclusive:true,retentionGueltig:true,kommunikationGesperrt:true,kohortenQuellenGesperrt:true,
  retention:36,tagesdeckel:2416,understandingReserve:702,vorrangreserveReal:200,
  quellenkontext:{version:1,scoring:'off',relevanzordnung:false,koScan:500,lageMax:12,relevanzTage:14,sourceSafetyStandard:true,atomicLock:true},
  testKosten:{version:2,aktiv:true,limitUsd:4,maxManualCalls:null,maxWindowMs:null,unbekanntBleibtReserviert:true}};
const ko = {id:'ko-vg-synthetisch-aufnahme',vorgang_id:'vg-synthetisch-aufnahme',status:'active',understanding_status:'complete',headline:'Digitalisierung im Innenausschuss',was_ist_passiert:'Der Innenausschuss berät die Digitalisierung.',warum_wichtig:'Digitalisierung betrifft die Verwaltung.',ausschuesse:['Innenausschuss'],tags:['Digitalisierung'],policy_field:'Inneres',confidence_score:90,source_document_count:1,updated_at:'2026-09-14T06:00:00Z',recommendation:'Unterlagen lesen.'};
const identity = {id:request.mandat,name:'Synthetisches Testprofil',updated_at:'2026-09-14T06:00:00Z'};
const mandate = {user_id:request.mandat,aktiv:false,geloescht_at:null,politische_ebene:'bundestag',rolle:'Abgeordnete',ausschuesse:['Innenausschuss'],fachpolitische_schwerpunkte:['Digitalisierung']};
const doc = {id:'synthetischer-beleg',title:ko.headline,summary:ko.was_ist_passiert,url:'https://www.bundestag.de/dokumente/synthetisch-aufnahme',published_at:'2026-09-14T06:00:00Z',source_name:'Synthetischer Ausschuss'};
function setup(options={}) {
  const calls=[]; let ticks=Date.parse('2026-09-14T07:00:00Z'), runtimeCalls=0;
  const fetchFn = async(url,opts)=>{
    calls.push({url,method:opts.method}); A.equal(opts.method,'GET'); A.equal(opts.redirect,'error'); A(!opts.body);
    let value;
    if(url.endsWith('/api/cron/testnachweis-status')) {runtimeCalls++; value=structuredClone(report);if(options.badRuntime || (options.runtimeSwitch && runtimeCalls===2))value.quellenkontext.scoring='on';}
    else {
      A.equal(opts.credentials,'omit'); const u=new URL(url); A.equal(u.origin,env.SUPABASE_URL);
      A.equal(opts.headers.apikey,env.SUPABASE_SERVICE_ROLE_KEY);
      if(u.pathname==='/rest/v1/profiles'){A.equal(u.searchParams.get('id'),'eq.'+request.mandat);A.equal(u.searchParams.get('select'),'id,name,updated_at');value=[options.identity||identity];}
      else if(u.pathname==='/rest/v1/mandate_profiles'){A.equal(u.searchParams.get('user_id'),'eq.'+request.mandat);value=options.mandates||[mandate];}
      else if(u.pathname==='/rest/v1/knowledge_objects'){A.equal(u.searchParams.get('order'),'updated_at.desc');A.equal(u.searchParams.get('limit'),'500');A(!u.searchParams.get('select').includes('embedding'));value=options.kos||[ko];}
      else if(u.pathname==='/rest/v1/ko_document_links'){A.equal(u.searchParams.get('knowledge_object_id'),'eq.'+ko.id);A.equal(u.searchParams.get('limit'),'40');A(!u.searchParams.has('order'));value=[{raw_documents:doc}];if(options.sourceError)throw new Error('SYNTHETISCHER_PRIVATER_FEHLERTEXT');}
      else throw new Error('unerwarteter-endpoint');
    }
    return {status:200,headers:{get:()=> 'application/json; charset=utf-8'},text:async()=>JSON.stringify(value),json:async()=>value};
  };
  const buildNeed = options.realRoot ? input=>localNeed(input,options.realRoot) : async input=>({
    requestedVorgangIds:[ko.vorgang_id],inputEvidence:{profileSha256:P.hash(JSON.stringify({identity:input.identity,mandateRow:input.mandateRow})),kosSha256:P.hash(JSON.stringify(input.kos)),quellenbedarfSha256:P.hash(JSON.stringify([ko.vorgang_id]))}});
  return {calls,args:{request:{...request,...options.request},env:{...env,...options.env},storageText:options.storageText||storageText,fetchFn,buildNeed,now:()=>new Date(ticks+=1000)}};
}
function plain(result){return T.decrypt(result.envelope,pem,{purpose:'b055-eingabeaufnahme-v1',runId:env.GITHUB_RUN_ID,workflowCommit:env.GITHUB_SHA,productionCommit:P.COMMIT});}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
(async()=>{
  await test('vollständige verschlüsselte GET Aufnahme bindet Daten und beide Commits',async()=>{const s=setup(),r=await collect(s.args),p=plain(r);A.equal(r.ok,true,JSON.stringify({failure:p.failure,calls:s.calls}));A.equal(s.calls.length,6);A.equal(p.complete,true);A.equal(p.packet.responses[0].rawBody,JSON.stringify([{raw_documents:doc}]));A.equal(p.input.identity.updated_at,identity.updated_at);A.equal(p.productionMitschnittBestaetigt,false);A.equal(p.fachlicheFreigabe,false);A(!JSON.stringify(r).includes(identity.name));A(!JSON.stringify(p).includes(env.SUPABASE_SERVICE_ROLE_KEY));});
  await test('neuer Productioncode reaktiviert den gepinnten alten Auftrag nicht',async()=>{const s=setup({storageText:aktuellerStorageText});A.notEqual(P.hash(aktuellerStorageText),P.hash(storageText));await A.rejects(collect(s.args));A.equal(s.calls.length,0);});
  for(const [name,options] of [['fehlender Schlüssel',{env:{SUPABASE_SERVICE_ROLE_KEY:''}}],['falscher Ursprung',{env:{SUPABASE_URL:'https://example.invalid'}}],['fremdes Mandat',{request:{mandat:'fremd'}}],['falscher Code',{storageText:'fremd'}],['ausgeschalteter Auftrag',{request:{freigegeben:false}}],['falscher Empfänger',{request:{publicKey:'unbrauchbar'}}]])
    await test(name+' vor HTTP abgelehnt',async()=>{const s=setup(options);await A.rejects(collect(s.args));A.equal(s.calls.length,0);});
  for(const [name,options,phase,count] of [
    ['abweichende Laufzeit',{badRuntime:true},'laufzeit-vorher',1],
    ['fremde Identität',{identity:{...identity,id:'fremd'}},'profil',2],
    ['aktives Profil',{mandates:[{...mandate,aktiv:true}]},'profil',3],
    ['gelöschtes Profil',{mandates:[{...mandate,geloescht_at:'2026-01-01'}]},'profil',3],
    ['mehrdeutiges Profil',{mandates:[mandate,mandate]},'profil',3],
    ['doppelte KOs',{kos:[ko,ko]},'wissensobjekte',4],
    ['Quellenfehler',{sourceError:true},'quellen',5],
    ['Laufzeitwechsel',{runtimeSwitch:true},'laufzeit-nachher',6]])
    await test(name+' bleibt als verschlüsselte Teilaufnahme erhalten',async()=>{const s=setup(options),r=await collect(s.args),p=plain(r);A.equal(r.ok,false);A.equal(p.failure.phase,phase);A.equal(s.calls.length,count);A(!JSON.stringify(r).includes('SYNTHETISCHER_PRIVATER_FEHLERTEXT'));});
  await test('Manipulation und falscher Ausführungskontext verhindern Entschlüsselung',async()=>{const r=await collect(setup().args),bad=structuredClone(r);bad.envelope.tag=Buffer.alloc(16).toString('base64');A.throws(()=>plain(bad));bad.envelope.meta.workflowCommit='c'.repeat(40);A.throws(()=>plain(bad));});
  await test('Starttor verlangt eigenen Branch ersten Versuch Frist und geprüften Code',async()=>{
    let calls=0;const git=()=>{calls++;},now=new Date('2026-09-14T07:00:00Z');A.equal(gate(request,env,now,git),true);A.equal(calls,1);
    A.equal(gate({...request,freigegeben:false},env,now,git),false);A.equal(calls,1);
    for(const e of [{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/main'},{GITHUB_REPOSITORY:'fremd/repo'}])A.throws(()=>gate(request,{...env,...e},now,git));
    A.throws(()=>gate({...request,gueltigBisUtc:'2026-09-13T07:00:00Z'},env,now,git));A.throws(()=>gate(request,env,now,()=>{throw new Error('code-geaendert');}));
  });
  if(process.env.HELMUT_B055_TEST_ROOT) await test('echter isolierter Builder bestimmt Quellenbedarf der vollständigen Aufnahme',async()=>{const s=setup({realRoot:process.env.HELMUT_B055_TEST_ROOT}),r=await collect(s.args),p=plain(r);A.equal(r.ok,true,JSON.stringify(p.failure));A.deepEqual(p.need.requestedVorgangIds,[ko.vorgang_id]);});
  console.log(`ERGEBNIS ${passed}/${passed}; ausschließlich synthetisch, kein Production Nachweis.`);
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
