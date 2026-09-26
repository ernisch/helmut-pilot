'use strict';
// Einmalige Betreiberaufnahme. Kein Serverimport im Prozess mit Zugangsdaten.
const A = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const cp = require('node:child_process'), os = require('node:os'), vm = require('node:vm');
const P = require('./b055-aufnahme-pruefer'), Q = require('./b055-quellen-aufnahme');
const T = require('./transport'), R = require('../github-laufzeitpruefung');
const K = require('../../lib/helmut/testkosten-budget');
const { publicKey } = require('../privater-nachweis-transport');
const MANDAT = 'test-kohorte-b-055', ORIGIN = 'https://ddckuvvpcytqbyfmbvie.supabase.co';
const BRANCH = 'refs/heads/codex/b055-relative-fristen-20260914';
const STORAGE_SHA = 'd34f24f396c7939443b023e1ca9098d86bdd6111ecef675e54daab37de9be888';
function validateRequest(req) {
  A.equal(req?.version,1); A.equal(req.mandat,MANDAT); A.equal(req.productionCommit,P.COMMIT);
  A.equal(req.freigegeben,true); A.match(req.nonce,/^[a-f0-9]{32}$/); publicKey(req.publicKey);
}
function validateRuntime(r) {
  A(r?.ok && r.reinLesend && r.httpStatus === 200 && r.commit === P.COMMIT);
  for(const k of ['storageSupabase','v3Bereit','profileRelational','profileExclusive','kommunikationGesperrt','kohortenQuellenGesperrt']) A.equal(r[k],true);
  A.equal(r.scharferPfadFreigegeben,false);
  A.deepEqual(r.quellenkontext,{version:1,scoring:'off',relevanzordnung:false,koScan:500,lageMax:12,relevanzTage:14,sourceSafetyStandard:true,atomicLock:true});
  A(K.tagespolitikGueltig(r.testKosten) && r.testKosten.aktiv === true);
}
// Der gepinnte Produktleser erzeugt auch die KO Anfrage selbst.
async function getKoEndpoint(storageText) {
  A.equal(P.hash(storageText),STORAGE_SHA);
  const c = storageText.slice(storageText.indexOf('const V3_KNOWLEDGE_OBJECT_COLUMNS = ['),storageText.indexOf('// Schreib-Projektion:'));
  const start = storageText.indexOf('async function listKnowledgeObjects('), end = storageText.indexOf('// SPRINT 23C-2A',start);
  let endpoint;
  const reader = vm.runInNewContext(c + '\nconst V3_KO_READ_SELECT=V3_KNOWLEDGE_OBJECT_COLUMNS.join(",");\n' + storageText.slice(start,end) + '\nlistKnowledgeObjects',{
    v3StoreReady:()=>true,KO_REIHENFOLGEN:{neueste:'updated_at.desc'},
    supabaseRequest:async e=>{A(!endpoint);endpoint=e;return [];},console:{error:()=>{}}
  },{timeout:1000});
  await reader({limit:500,_signalError:true}); A(endpoint); return endpoint;
}
function localNeed(input, root) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'helmut-b055-'));
  try {
    const file = path.join(temp,'input.json'); fs.writeFileSync(file,JSON.stringify(input),{mode:0o600,flag:'wx'});
    // Ausschließlich notwendige Prozessumgebung. Keine geerbten Secrets oder NODE_OPTIONS.
    const env = {PATH:process.env.PATH,LANG:'C.UTF-8',TZ:'UTC'};
    const r = cp.spawnSync(process.execPath,[path.join(root,'scripts/lokal.js'),'--',process.execPath,
      path.join(__dirname,'b055-aufnahme-lokal.js'),file,root],{cwd:root,env,encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024});
    A.equal(r.status,0,'lokaler-bedarf-fehlgeschlagen'); return JSON.parse(r.stdout);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
}
async function collect({request,env,storageText,fetchFn,buildNeed,now=()=>new Date()}) {
  validateRequest(request); A.equal(env.SUPABASE_URL,ORIGIN); A(env.SUPABASE_SERVICE_ROLE_KEY && env.HELMUT_CRON_SECRET);
  A.equal(P.hash(storageText),STORAGE_SHA); A.equal(typeof fetchFn,'function'); A.equal(typeof buildNeed,'function');
  const ctx = T.context({purpose:'b055-eingabeaufnahme-v1',runId:env.GITHUB_RUN_ID,workflowCommit:env.GITHUB_SHA,productionCommit:P.COMMIT});
  const payload = {version:1,context:ctx,requestNonce:request.nonce,complete:false,rawInputs:[],
    productionMitschnittBestaetigt:false,fachlicheFreigabe:false,transaktionalerSnapshot:false};
  let phase = 'laufzeit-vorher', totalBytes = 0;
  const budget = AbortSignal.timeout(240000);
  const get = async (url,opts) => {
    A.equal(opts.method,'GET'); A.equal(opts.redirect,'error');
    A(url.startsWith(ORIGIN+'/rest/v1/') || url === R.STATUS_URL);
    return fetchFn(url,{...opts,signal:AbortSignal.any([budget,...(opts.signal?[opts.signal]:[])])});
  };
  const runtime = async label => {
    const report = await R.pruefe({env:{HELMUT_PRODUCTION_COMMIT:P.COMMIT,GITHUB_SHA:P.COMMIT,HELMUT_CRON_SECRET:env.HELMUT_CRON_SECRET},fetchFn:get});
    const evidence = {report,receivedAt:now().toISOString(),evidenceRef:`github:${env.GITHUB_RUN_ID}:${label}`};
    payload[label] = evidence; validateRuntime(report); return evidence;
  };
  const read = async (name,endpoint,max) => {
    const requestedAt = now().toISOString();
    const response = await get(ORIGIN+endpoint,{method:'GET',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000),
      headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,Accept:'application/json'}});
    A.equal(response.status,200); const contentType = response.headers.get('content-type') || '';
    A.match(contentType,/^application\/json(?:\s*;\s*charset=utf-8)?$/i);
    const rawBody = await response.text(); totalBytes += Buffer.byteLength(rawBody); A(totalBytes <= 16*1024*1024);
    const record = {name,method:'GET',endpoint,httpStatus:200,contentType,requestedAt,receivedAt:now().toISOString(),rawBody,rawBodySha256:P.hash(rawBody)};
    payload.rawInputs.push(record); const rows = JSON.parse(rawBody); A(Array.isArray(rows) && rows.length <= max); return rows;
  };
  try {
    const before = await runtime('runtimeBefore');
    phase = 'profil';
    // Expliziter B055 Filter. Nur die Identitätsfelder, die der echte Mapper liest.
    const identityRows = await read('identity',`/rest/v1/profiles?id=eq.${MANDAT}&select=id,name,updated_at&limit=2`,2);
    A.equal(identityRows.length,1); A.equal(identityRows[0]?.id,MANDAT);
    const mandateRows = await read('mandate',`/rest/v1/mandate_profiles?user_id=eq.${MANDAT}&select=*&limit=2`,2);
    A.equal(mandateRows.length,1); A.equal(mandateRows[0]?.user_id,MANDAT);
    A.equal(mandateRows[0].aktiv,false); A.equal(mandateRows[0].geloescht_at,null);
    phase = 'wissensobjekte';
    const kos = await read('kos',await getKoEndpoint(storageText),500);
    A(kos.every(k=>k && typeof k.id==='string')); A.equal(new Set(kos.map(k=>k.id)).size,kos.length);
    const input = {identity:identityRows[0],mandateRow:mandateRows[0],kos,runtime:before.report,now:now().toISOString()};
    payload.input = input;
    phase = 'lokaler-bedarf'; const need = await buildNeed(input); payload.need = need;
    A.equal(need.inputEvidence.profileSha256,P.hash(JSON.stringify({identity:input.identity,mandateRow:input.mandateRow})));
    A.equal(need.inputEvidence.kosSha256,P.hash(JSON.stringify(kos)));
    phase = 'quellen';
    // Gesamte Antwortgröße begrenzen, ohne Antworttext umzuschreiben.
    const sourceFetch = async (url,opts) => {
      const response = await get(url,opts);
      return {status:response.status,headers:response.headers,text:async()=>{const s=await response.text();totalBytes+=Buffer.byteLength(s);A(totalBytes<=16*1024*1024);return s;}};
    };
    const taken = await Q.erfasse({mandat:MANDAT,commit:P.COMMIT,ids:need.requestedVorgangIds,storageText,fetchFn:sourceFetch,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,now});
    payload.sources = taken; A.equal(taken.ok,true);
    phase = 'laufzeit-nachher'; const after = await runtime('runtimeAfter');
    const packet = {version:1,mandat:MANDAT,commit:P.COMMIT,referenceTime:input.now,runtimeBefore:before,runtimeAfter:after,
      requestedVorgangIds:need.requestedVorgangIds,inputEvidence:need.inputEvidence,responses:taken.responses};
    phase = 'aufnahmepruefung'; await P.pruefe(packet,storageText); payload.packet = packet; delete payload.sources; payload.complete = true;
  } catch {
    payload.failure = {phase,reason:'aufnahme-nicht-vollstaendig-bestaetigt',keinAutomatischerWiederholungsversuch:true};
  }
  // Kein Rohinhalt und keine originale Fehlermeldung darf die öffentliche Ausgabe erreichen.
  return {ok:payload.complete,envelope:T.encrypt(payload,request.publicKey,ctx),klartextImLog:false};
}
async function main() {
  A.equal(process.argv.length,4);
  const request = JSON.parse(fs.readFileSync(process.argv[2],'utf8')), root = path.resolve(process.argv[3]);
  validateRequest(request);
  A.equal(process.env.GITHUB_REPOSITORY,'ernisch/helmut-pilot'); A.equal(process.env.GITHUB_REF,BRANCH);
  A.equal(process.env.GITHUB_EVENT_NAME,'push'); A.equal(process.env.GITHUB_RUN_ATTEMPT,'1');
  const git = args => cp.execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  A.equal(git(['rev-parse','HEAD']),P.COMMIT); A.equal(git(['status','--porcelain']),'');
  const result = await collect({request,env:process.env,storageText:fs.readFileSync(path.join(root,'lib/helmut/storage.js'),'utf8'),fetchFn:global.fetch,buildNeed:i=>localNeed(i,root)});
  console.log('B055_ENVELOPE_BEGIN'); console.log(JSON.stringify(result,null,2)); console.log('B055_ENVELOPE_END');
  process.exitCode = result.ok ? 0 : 1;
}
if(require.main===module) main().catch(()=>{console.error('B055 Aufnahme abgebrochen; keine privaten Fehlerdaten im Log.');process.exitCode=1;});
module.exports = {collect,validateRequest,validateRuntime,getKoEndpoint,localNeed};
