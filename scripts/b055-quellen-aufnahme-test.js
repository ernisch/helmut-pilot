'use strict';
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const T=require('./b055-aufnahme/b055-quellen-aufnahme'),P=require('./b055-aufnahme/b055-aufnahme-pruefer');
const storageText=require('./fixtures/b055-historischer-storage')();
const aktuellerStorageText=fs.readFileSync(path.join(__dirname,'../lib/helmut/storage.js'),'utf8');
let pass=0;
async function test(name,fn){await fn();pass++;console.log('PASS '+name);}
function setup(extra={}){let calls=[];const raw='[ {"raw_documents":{"id":"synthetisch-1","title":"Synthetischer Beleg","published_at":"2026-09-14T00:00:00Z"}} ]';
 const args={mandat:'test-kohorte-b-055',commit:P.COMMIT,ids:['vg-synthetisch'],storageText,serviceKey:'synthetischer-schluessel',now:()=>new Date('2026-09-14T07:00:01Z'),
 fetchFn:async(url,options)=>{calls.push({url,options});return {status:200,headers:{get:()=> 'application/json; charset=utf-8'},text:async()=>raw};},...extra};return {args,calls,raw};}
(async()=>{
 await test('neuer Speicherstand sperrt historischen Transport vor HTTP',async()=>{const x=setup({storageText:aktuellerStorageText});A.notEqual(P.hash(aktuellerStorageText),P.hash(storageText));await A.rejects(T.erfasse(x.args));A.equal(x.calls.length,0);});
 await test('Echter Leser erzeugt unveränderten GET; Rohtext ohne Schlüssel gesichert',async()=>{let x=setup();let r=await T.erfasse(x.args);A.equal(r.ok,true);A.equal(x.calls.length,1);A.equal(x.calls[0].options.method,'GET');A.equal(x.calls[0].options.redirect,'error');A.equal(x.calls[0].options.credentials,'omit');const u=new URL(x.calls[0].url);A.equal(u.origin,'https://ddckuvvpcytqbyfmbvie.supabase.co');A.equal(u.searchParams.get('order'),null);A.equal(u.searchParams.get('limit'),'40');A.equal(r.responses[0].rawBody,x.raw);A(!JSON.stringify(r).includes(x.args.serviceKey));});
 await test('HTTP Fehler wird trotz geschlucktem Leserfehler kein Leerbeleg und nicht wiederholt',async()=>{let n=0,x=setup({fetchFn:async()=>{n++;return {status:503};}});const r=await T.erfasse(x.args);A.equal(r.ok,false);A.equal(n,1);A.deepEqual(r.responses,[]);});
 await test('Teilaufnahme bleibt nach späterem Fehler erhalten',async()=>{let n=0,x=setup({ids:['vg-eins','vg-zwei']});const good=x.args.fetchFn;x.args.fetchFn=async(...a)=>++n===1?good(...a):Promise.reject(new Error('synthetischer Fehler'));const r=await T.erfasse(x.args);A.equal(r.ok,false);A.equal(r.responses.length,1);A.equal(r.failedVorgangId,'vg-zwei');A.equal(n,2);});
 await test('Falsches Zielprofil sperrt vor jedem Request',async()=>{let x=setup({mandat:'fremd'});await A.rejects(T.erfasse(x.args));A.equal(x.calls.length,0);});
 await test('Falscher Code sperrt vor jedem Request',async()=>{let x=setup({storageText:storageText+'\n'});await A.rejects(T.erfasse(x.args));A.equal(x.calls.length,0);});
 await test('Fehlender expliziter Transport wird nicht durch global.fetch ersetzt',async()=>{let x=setup({fetchFn:undefined});await A.rejects(T.erfasse(x.args));A.equal(x.calls.length,0);});
 console.log('ERGEBNIS '+pass+'/'+pass+' synthetische Transportgruppen; keine echten Requests.');
})().catch(e=>{console.error(e);process.exitCode=1;});
