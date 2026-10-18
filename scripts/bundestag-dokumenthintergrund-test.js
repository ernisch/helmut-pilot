"use strict";
// Public metadata fixture was created from the actually retained original.
// Optional original-byte CLI adds a real factory check, never mocked hashes.
const assert=require('node:assert/strict'),fs=require('node:fs'),H=require('../lib/helmut/bundestag-dokumenthintergrund');
const proof=require('./fixtures/bundestag-dokumenthintergrund-beleg.json');
const source=()=>({id:H.DOCUMENT_ID,content_hash:H.PDF_SHA256,title:H.TITLE,summary:H.EXCERPT,
 url:H.URL,canonical_url:H.URL,source_id:'bundestag',document_type:'Antwort der Bundesregierung',published_at:null,quellenauszug_beleg:structuredClone(proof)});
let count=0,actualBytes=false;
const test=(name,fn)=>{fn();count++;};
test('closed actual-source metadata accepted',()=>assert(H.lese(source())));
test('unrelated legacy source remains unchanged',()=>assert.equal(H.lese({url:'https://example.org/article',quellenauszug_beleg:{status:'ergaenzt'}}),null));
test('JSONB key reordering preserves proof',()=>{const d=source();d.quellenauszug_beleg=Object.fromEntries(Object.entries(proof).reverse());assert(H.lese(d));});
test('actual raw alias matches projected source',()=>{const d=source();d.raw={helmutQuellenkontext:structuredClone(proof)};assert(H.lese(d));delete d.quellenauszug_beleg;assert(H.lese(d));});
const reject=(name,change)=>test(name,()=>{const d=source();change(d);assert.throws(()=>H.lese(d),/^Error: bundestag-dokumenthintergrund-/);});
for(const [field,value]of Object.entries({id:'rd-foreign',content_hash:'0'.repeat(64),title:'Foreign title',summary:H.EXCERPT+' Changed',url:H.URL+'?x=1',canonical_url:'https://example.org/foreign',source_id:'dip',document_type:'Drucksache',published_at:'2026-10-08T00:00:00Z'}))reject('changed '+field,d=>d[field]=value);
for(const [field,value]of Object.entries({version:H.VERSION+'x',dokumentdatum:'2026-10-16',pdfSha256:'0'.repeat(64),hash:'0'.repeat(64),extra:true}))reject('changed proof '+field,d=>d.quellenauszug_beleg[field]=value);
reject('proof removed',d=>delete d.quellenauszug_beleg);
reject('proof primitive',d=>d.quellenauszug_beleg='bad');
reject('native and raw aliases conflict',d=>d.raw={helmutQuellenkontext:{...proof,dokumentdatum:'2026-10-16'}});
reject('NULL alias cannot override raw proof',d=>{d.raw={helmutQuellenkontext:proof};d.quellenauszug_beleg=null;});
reject('DIP namespace conflict',d=>d.dip_quellfelder={version:1});
reject('article stand conflict',d=>d.raw={helmutBundestagArtikelstand:{version:1}});
const q=()=>({url:H.URL,titel:H.TITLE,auszug:H.EXCERPT.replace(/\s+/g,' ').trim(),veroeffentlichtAm:null,dokumentangaben:H.quellenangaben(source())});
test('typed D source retains NULL publication',()=>assert(H.kontextGueltig(q())));
test('rehashed D metadata corruption rejected',()=>{const s=q();s.dokumentangaben.dokumentdatum='2026-10-16';assert.equal(H.kontextGueltig(s),false);});
test('D source cannot discard metadata or change quote/publication',()=>{for(const change of [s=>delete s.dokumentangaben,s=>s.auszug+=' extra',s=>s.veroeffentlichtAm='2026-10-16T00:00:00Z']){const s=q();change(s);assert.equal(H.kontextGueltig(s),false);}});
test('ordinary D source unaffected',()=>assert(H.kontextGueltig({url:'https://example.org/article'})));
test('whole Berlin day lies in original14day range',()=>assert(H.imFenster(source(),Date.parse('2026-10-02T01:00:00Z'),Date.parse('2026-10-16T01:00:00Z'))));
test('future or incomplete day rejected',()=>{assert.equal(H.imFenster(source(),Date.parse('2026-10-01T00:00:00Z'),Date.parse('2026-10-08T18:00:00Z')),false);assert.equal(H.imFenster(source(),Date.parse('2026-10-09T00:00:00Z'),Date.parse('2026-10-16T01:00:00Z')),false);});
test('factory requires actual original PDF and extracted bytes',()=>{assert.throws(()=>H.erzeugeBeleg(Buffer.alloc(H.PDF_BYTES),'not original'));assert.throws(()=>H.erzeugeBeleg('not a Buffer','not original'));});
if(process.argv.length>2){assert.equal(process.argv[2],'--pdf');assert.equal(process.argv[4],'--text');const pdf=fs.readFileSync(process.argv[3]),text=fs.readFileSync(process.argv[5],'utf8');test('actual full original byte factory matches retained public proof',()=>assert.deepEqual(H.erzeugeBeleg(pdf,text),proof));test('changed actual PDF rejected',()=>{const changed=Buffer.from(pdf);changed[100]^=1;assert.throws(()=>H.erzeugeBeleg(changed,text));});test('changed actual extraction rejected',()=>assert.throws(()=>H.erzeugeBeleg(pdf,text+' ')));actualBytes=true;}
console.log(JSON.stringify({pass:true,cases:count,actualOriginalBytesVerified:actualBytes,performanceProof:false,DBCalls:0,providerCalls:0}));
