'use strict';
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('./b055-aufnahme/b055-aufnahme-pruefer');
const source=require('./fixtures/b055-historischer-storage')();
const aktuellerSource=fs.readFileSync(path.join(__dirname,'../lib/helmut/storage.js'),'utf8');
// Ausschließlich synthetische Antworten; kein gespeicherter politischer Inhalt.
const vid='vg-synthetisch-aufnahme';
const report={ok:true,reinLesend:true,httpStatus:200,grund:'production-laufzeit-gelesen',commit:P.COMMIT,
 profileRelational:true,profileExclusive:true,v3Bereit:true,kommunikationGesperrt:true,kohortenQuellenGesperrt:true,
 scharferPfadFreigegeben:false,quellenkontext:{version:1,scoring:'off',relevanzordnung:false,koScan:500,lageMax:12,relevanzTage:14,sourceSafetyStandard:true,atomicLock:true}};
const select='raw_documents(id,title,url,canonical_url,source_name,source_type,published_at,document_type,link_type,confidence,summary)';
function fixture(docs){const ids=[vid],body=JSON.stringify(docs.map(d=>({raw_documents:d})),null,2);return {version:1,mandat:'test-kohorte-b-055',commit:P.COMMIT,
 runtimeBefore:{receivedAt:'2026-09-14T07:00:00Z',report:structuredClone(report),evidenceRef:'synthetischer-vorbeleg'},
 runtimeAfter:{receivedAt:'2026-09-14T07:01:00Z',report:structuredClone(report),evidenceRef:'synthetischer-nachbeleg'},
 requestedVorgangIds:ids,inputEvidence:{profileSha256:'a'.repeat(64),kosSha256:'b'.repeat(64),quellenbedarfSha256:P.hash(JSON.stringify(ids))},responses:[{vorgangId:vid,method:'GET',httpStatus:200,contentType:'application/json',requestedAt:'2026-09-14T07:00:01Z',receivedAt:'2026-09-14T07:00:02Z',endpoint:`/rest/v1/ko_document_links?knowledge_object_id=eq.ko-${vid}&select=${select}&limit=40`,rawBody:body,rawBodySha256:P.hash(body)}]};}
const docs=[{id:'synthetisch-alt',published_at:'2026-09-12T00:00:00Z',title:'Synthetischer alter Beleg'}, {id:'synthetisch-neu',published_at:'2026-09-13T00:00:00Z',title:'Synthetischer neuer Beleg'}];
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
async function rejects(change,code=source){let f=fixture(docs);change(f);await A.rejects(P.pruefe(f,code));}
(async()=>{
 await test('aktuelle Speicherdatei ist kein historischer Verbrauchercode',async()=>{A.notEqual(P.hash(aktuellerSource),P.hash(source));await rejects(()=>{},aktuellerSource);});
 await test('Rohbytes und Reihenfolge bleiben erhalten; echter Leser sortiert Verbrauch',async()=>{const f=fixture(docs),before=JSON.stringify(f),r=await P.pruefe(f,source);A.equal(JSON.stringify(f),before);A.equal(r.responses[0].rawBody,f.responses[0].rawBody);A.deepEqual(r.responses[0].responseRowIds,['synthetisch-alt','synthetisch-neu']);A.deepEqual(r.responses[0].consumedIds,['synthetisch-neu','synthetisch-alt']);A.equal(r.productionMitschnittBestaetigt,false);A.equal(r.fachlicheFreigabe,false);});
 await test('Gleiche Zeitstempel erhalten die tatsächliche Antwortreihenfolge',async()=>{const f=fixture(docs.map(d=>({...d,published_at:'2026-09-13T00:00:00Z'})));const r=await P.pruefe(f,source);A.deepEqual(r.responses[0].consumedIds,docs.map(d=>d.id));});
 await test('Exakt40 Zeilen sind vollständig für den begrenzten Leser',async()=>{const f=fixture(Array.from({length:40},(_,i)=>({id:'s-'+i,published_at:'2026-09-13T00:00:00Z'})));A.equal((await P.pruefe(f,source)).responses[0].consumedDocs.length,40);});
 await test('Leere Quellenantwort bleibt belegter Leerzustand',async()=>{A.equal((await P.pruefe(fixture([]),source)).responses[0].consumedDocs.length,0);});
 await test('41 Zeilen werden nicht still abgeschnitten',async()=>{await A.rejects(P.pruefe(fixture(Array.from({length:41},(_,i)=>({id:'s-'+i}))),source));});
 await test('Veränderte Rohbytes abgelehnt',()=>rejects(f=>{f.responses[0].rawBody+=' ';}));
 await test('Abweichender Endpoint oder zusätzliches order abgelehnt',()=>rejects(f=>{f.responses[0].endpoint+='&order=raw_document_id.asc';}));
 await test('Schreibmethode abgelehnt',()=>rejects(f=>{f.responses[0].method='POST';}));
 await test('Fehlerantwort abgelehnt',()=>rejects(f=>{f.responses[0].httpStatus=503;}));
 await test('Fehlende Quellenantwort abgelehnt',()=>rejects(f=>{f.responses=[];}));
 await test('Fremde Quelle abgelehnt',()=>rejects(f=>{f.responses[0].vorgangId='vg-fremd';}));
 await test('Doppelte Dokumentkennung abgelehnt',async()=>{await A.rejects(P.pruefe(fixture([docs[0],docs[0]]),source));});
 await test('Falscher Commit abgelehnt',()=>rejects(f=>{f.commit='f'.repeat(40);}));
 await test('Veränderter tatsächlicher Leser abgelehnt',()=>rejects(()=>{},source+'\n'));
 await test('Fehlender Zeitbeleg abgelehnt',()=>rejects(f=>{delete f.responses[0].receivedAt;}));
 await test('Veralteter Laufzeitbeleg außerhalb Aufnahme abgelehnt',()=>rejects(f=>{f.responses[0].receivedAt='2026-09-14T08:00:00Z';}));
 await test('Konfigurationswechsel abgelehnt',()=>rejects(f=>{f.runtimeAfter.report.quellenkontext.koScan=499;}));
 await test('Fehlende Eingabebindung abgelehnt',()=>rejects(f=>{delete f.inputEvidence.profileSha256;}));
 await test('Fremdes Profil abgelehnt',()=>rejects(f=>{f.mandat='synthetisch-fremd';}));
 await test('JSON mit UTF8 Charset akzeptiert',async()=>{const f=fixture(docs);f.responses[0].contentType='application/json; charset=utf-8';await P.pruefe(f,source);});
 await test('Leere eingebettete Quelle bleibt im Antwortprotokoll erhalten',async()=>{const f=fixture([null,...docs]);const r=await P.pruefe(f,source);A.equal(r.responses[0].responseRowIds[0],null);A.equal(r.responses[0].consumedDocs.length,2);});
 console.log('ERGEBNIS '+passed+'/'+passed+' synthetische Gruppen; kein Transport und keine Production Abnahme.');
})().catch(e=>{console.error(e);process.exitCode=1;});
