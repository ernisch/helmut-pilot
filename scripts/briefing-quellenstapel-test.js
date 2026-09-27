"use strict";
const A = require("node:assert/strict"), http = require("node:http");
const { once } = require("node:events"), S = require("../lib/helmut/storage");
// Echte Einzel- und Stapelleser; der lokale Transport bildet das Limit pro
// Elternobjekt ab. Insbesondere darf ein langer Vorgang andere nicht verdraengen.
(async () => {
  A.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv");
  const kos = Array.from({length:225}, (_,i) => ({id:`ko-vg-${i}`,vorgang_id:`vg-${i}`}));
  kos[1] = {id:"ko-vg-für-äöß",vorgang_id:"vg-für-äöß"};
  const daten = Object.fromEntries(kos.map((k,i) => [k.id,Array.from({length:i===0?41:i===224?0:2},(_,j)=>({
    raw_document_id:`rd-${String(j).padStart(2,"0")}`,
    raw_documents:{id:`rd-${String(j).padStart(2,"0")}`,title:"Unveraenderter Originaltitel",
      summary:"Ein vollstaendig erhaltener und belegter Quellentext.",
      published_at:j%2?"2026-09-27T06:00:00Z":"2026-09-27T07:00:00Z"}
  }))]));
  let mode="ok",reads=0,writes=0,active=0,peak=0;
  const server=http.createServer((req,res)=>{
    reads++;if(req.method!=="GET")writes++;active++;peak=Math.max(peak,active);
    const u=new URL(req.url,"http://127.0.0.1");let rows;
    if(u.pathname.endsWith("/ko_document_links")) {
      A.equal(u.searchParams.get("order"),"raw_document_id.asc");
      rows=daten[u.searchParams.get("knowledge_object_id").slice(3)].slice(0,Number(u.searchParams.get("limit")));
    } else {
      A.equal(u.searchParams.get("ko_document_links.order"),"raw_document_id.asc");
      A.equal(u.searchParams.get("ko_document_links.limit"),"40");
      const ids=JSON.parse("["+u.searchParams.get("id").slice(4,-1)+"]");
      A(ids.length<=25);
      rows=ids.map(id=>({id,vorgang_id:id.slice(3),ko_document_links:daten[id].slice(0,40)})).reverse();
      rows=JSON.parse(JSON.stringify(rows));
      if(mode==="missing")rows.pop();
      if(mode==="foreign")rows[0].ko_document_links[0].raw_documents.id="fremd";
      if(mode==="duplicate")rows[0].ko_document_links.push(rows[0].ko_document_links[0]);
      if(mode==="transport"){active--;res.writeHead(500);return res.end("{}");}
    }
    setTimeout(()=>{active--;res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify(rows));},5);
  });
  server.listen(0,"127.0.0.1");await once(server,"listening");
  const names=["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","HELMUT_V3_STORE"];
  const before=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  Object.assign(process.env,{SUPABASE_URL:"http://127.0.0.1:"+server.address().port,
    SUPABASE_SERVICE_ROLE_KEY:"rein-lokaler-testwert",HELMUT_V3_STORE:"1"});
  try {
    const einzeln={};for(const k of kos)einzeln[k.vorgang_id]=await S.getSourcesForVorgang(k.vorgang_id);
    const baselineReads=reads;
    A.deepEqual(await S.getPruefSourcesByVorgaenge(kos),einzeln);
    A.equal(reads-baselineReads,9);A(peak<=8);A.equal(einzeln["vg-0"].length,40);A.equal(einzeln["vg-224"].length,0);
    daten["ko-vg-0"][0].raw_documents.summary="Ein inzwischen veraenderter vollstaendiger Quellentext.";
    const frisch=await S.getPruefSourcesByVorgaenge(kos.slice(0,1));
    A.notDeepEqual(frisch["vg-0"],einzeln["vg-0"]);
    A.deepEqual(frisch["vg-0"],await S.getSourcesForVorgang("vg-0"));
    for(mode of ["missing","foreign","duplicate","transport"])await A.rejects(S.getPruefSourcesByVorgaenge(kos.slice(1,2)));
    mode="ok";
    const vorher=reads;
    for(const bad of [[kos[0],kos[0]],[{vorgang_id:'fremd")'}],Array(501).fill(kos[0])])await A.rejects(S.getPruefSourcesByVorgaenge(bad));
    A.equal(reads,vorher);A.equal(writes,0);
    console.log("PASS: 225 Eingaben vollstaendig identisch; 9 statt225 Reads; maximal8 parallel;40 je Vorgang; frische Aenderung sichtbar; fehlende/fremde/doppelte/fehlerhafte Daten gesperrt;0 Writes/Modelle.");
  } finally {
    for(const n of names)if(before[n]===undefined)delete process.env[n];else process.env[n]=before[n];
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exitCode=1});
