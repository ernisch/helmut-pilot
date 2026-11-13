"use strict";
// Echte Storagefunktion mit kleinem lokalem Transport: Fehler zwischen dem
// relationalen Artikel und seinem unveraenderlichen Archiv, keine externen Daten.
const A=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const {createRequire}=require("node:module");
const filename=require.resolve("../lib/helmut/storage"),text=fs.readFileSync(filename,"utf8"),req=createRequire(filename);
const start=text.indexOf("async function persistiereRohdokumenteWarteschlange("),end=text.indexOf("\n// `finding_count`",start);
const code=text.slice(start,end);
const items=["fehlerhaft","brauchbar"].map((name,i)=>({id:"input-"+i,title:"Synthetischer Artikel "+name,
  url:"https://example.invalid/artikel/"+name,sourceId:"quelle-test",sourceName:"Synthetik",
  publishedAt:"2026-11-13T04:00:00Z",retrievedAt:"2026-11-13T04:10:00Z",
  summary:"Ein synthetischer politischer Bericht beschreibt einen konkreten Entwurf mit geplanter Beratung im Parlament und benennt die zustaendige Institution."}));
const normalized=items.map(req("./dedup").toRawDocumentRow),badId=normalized[0].id,goodId=normalized[1].id;
async function scenario(mode){
  const rows=new Map(),archive=new Map(),calls=[];
  const request=async(url,opts={})=>{
    calls.push([url,opts.method||"GET"]);const method=opts.method||"GET";
    if(url.startsWith("/rest/v1/raw_documents")){
      if(method==="POST"){
        const batch=JSON.parse(opts.body);
        if(mode==="batch"&&batch.some(r=>r.id===badId))throw Error("eine ungueltige Zeile");
        for(const row of batch)rows.set(row.id,row);return batch.map(r=>({id:r.id}));
      }
      const filter=new URL(url,"http://local").searchParams.get("id");
      if(filter?.startsWith("eq.")){const row=rows.get(filter.slice(3));return row?[row]:[];}
      return [...rows.values()].filter(r=>filter?.includes(r.id)&&(mode!=="missing"||r.id!==badId));
    }
    if(url.startsWith("/rest/v1/helmut_store")){
      if(method==="POST"){
        const row=JSON.parse(opts.body);
        if(mode==="archive"&&row.data.dokument.id===badId)throw Error("ein Archivfehler");
        archive.set(row.id,row);return [{id:row.id}];
      }
      const id=new URL(url,"http://local").searchParams.get("id").slice(3);return archive.has(id)?[archive.get(id)]:[];
    }
    if(url.startsWith("/rest/v1/document_findings"))return [];
    throw Error("unerwarteter Zugriff "+url);
  };
  const context={require:req,process:{env:{HELMUT_SCALABLE_PIPELINE:"on"}},Buffer,Map,Set,Date,console,
    v3StoreReady:()=>true,v3SkipReason:()=>"offline",supabaseStoreId:"main",supabaseRequest:request,
    RAW_DOCUMENT_BULK_CHUNK:100,RAW_DOC_ID_CHUNK:100,
    V3_RAW_DOCUMENT_COLUMNS:Object.keys(normalized[0]),pickColumns:(row,cols)=>Object.fromEntries(cols.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]))};
  const persist=vm.runInNewContext(code+"\npersistiereRohdokumenteWarteschlange",context);
  const result=await persist(items);
  A.equal(result.ok,false);A.deepEqual(Array.from(result.bestaetigteIds),[goodId]);
  A.equal(result.artikelFehler.length,1);A.equal(result.artikelFehler[0].id,badId);
  A.match(result.artikelFehler[0].stand,/^[a-f0-9]{64}$/);A.equal(result.artikelFehler[0].grund,"quellenstand-nicht-bestaetigt");
  A.equal(result.quellenversionen.length,1);A.equal(result.quellenversionen[0].id,goodId);
  A.ok(archive.size>0);A.ok(calls.every(([url])=>!url.includes("main-auth")));
  if(mode==="batch"){
    const write=calls.findIndex(([url,method])=>url.includes("raw_documents")&&method==="POST");
    const next=calls[write+1];A.equal(next[1],"GET");A.match(next[0],/id=eq./);
  }
}
(async()=>{
  const only=process.argv.find(arg=>arg.startsWith("--only="))?.slice(7);let n=0;
  for(const [mode,name] of [["archive","einzelner Archivfehler erhaelt folgenden brauchbaren Artikel"],
    ["batch","ungueltige Batchzeile wird nach Lesebestaetigung isoliert"],
    ["missing","ein fehlender Rohdatensatz blockiert bestaetigte Nachbarn nicht"]]){
    if(only&&only!==mode)continue;await scenario(mode);console.log("PASS "+name);n++;
  }
  console.log(`${n}/${n} gezielte Rohartikelpruefungen bestanden.`);
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
