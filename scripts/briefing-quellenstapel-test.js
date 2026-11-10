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
    if(mode==="all-errors" || (mode==="partial-error" && u.pathname.endsWith("/ko_document_links")
      && u.searchParams.get("knowledge_object_id")==="eq.ko-vg-2")) {
      active--;res.writeHead(500);return res.end("{}");
    }
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
      if(mode==="transport" || mode==="partial-error"){active--;res.writeHead(500);return res.end("{}");}
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
    // Echter Server-Ladehelfer: Batchfehler duerfen keine Quellen verlieren.
    const fs = require("node:fs"), vm = require("node:vm");
    const serverSource = fs.readFileSync(require.resolve("../server"), "utf8");
    const start = serverSource.indexOf("async function loadSourcesByVorgang(kos)");
    const end = serverSource.indexOf("\nasync function loadPruefSourcesByVorgang", start);
    A(start > 0 && end > start);
    let batchCalls = 0, singleCalls = 0;
    const load = vm.runInNewContext(serverSource.slice(start, end) + "; loadSourcesByVorgang", {
      storageModul: { getPruefSourcesByVorgaenge: async input => {
        batchCalls++; return S.getPruefSourcesByVorgaenge(input);
      } },
      getSourcesForVorgang: async (...args) => { singleCalls++; return S.getSourcesForVorgang(...args); }
    });
    const input = kos.slice(1, 3);
    const expected = await S.getPruefSourcesByVorgaenge(input);
    A.deepEqual(JSON.parse(JSON.stringify(await load(input))), expected);
    A.equal(batchCalls, 1); A.equal(singleCalls, 0);
    mode = "missing";
    A.deepEqual(JSON.parse(JSON.stringify(await load(input))), expected);
    A.equal(batchCalls, 2); A.equal(singleCalls, 2);
    mode = "ok";
    A.deepEqual(JSON.parse(JSON.stringify(await load([]))), {});
    A.equal(batchCalls, 2); A.equal(writes, 0);
    mode="all-errors";
    A.deepEqual(await S.getSourcesForVorgang("vg-1"), [], "Altaufrufer bleiben kompatibel");
    await A.rejects(S.getSourcesForVorgang("vg-1", {strict:true}), S.StorageReadError);
    await A.rejects(load(input), S.StorageReadError);
    mode="partial-error";
    await A.rejects(load(input), S.StorageReadError, "Ein fehlgeschlagener Teil ist keine bestaetigte Quellenleere");
    mode="missing";
    A.deepEqual(JSON.parse(JSON.stringify(await load([kos[224]]))), {"vg-224":[]});
    mode="all-errors";
    const ko={id:"ko-vg-1",vorgang_id:"vg-1",status:"neu",understanding_status:"complete",decision_level:"bund",
      headline:"Alex Muster berichtet zur Pflege",was_ist_passiert:"Alex Muster berichtet zur Finanzierung der Pflegeberatung.",
      recommendation:"Die vorliegenden Quellen prüfen.",ausschuesse:["Gesundheit"],parteien:["SPD"],tags:["Pflege"],confidence_score:90,
      created_at:"2026-11-09T03:00:00Z",updated_at:"2026-11-09T03:00:00Z"};
    S.listKnowledgeObjects=async()=>[ko];
    const build=require("../server").__buildV3Briefing;
    const profile={id:"test-quellenfehler",fullName:"Alex Muster",parliamentType:"Bundestag",committee:"Gesundheit",party:"SPD",focusTopics:["Pflege"]};
    await A.rejects(build(profile,profile.id,{now:new Date("2026-11-09T06:00:00Z")}),S.StorageReadError);
    const D=require("../lib/helmut/decisions"),decide=D.decideForUser;
    D.decideForUser=()=>[];
    try { await A.rejects(build(profile,profile.id,{now:new Date("2026-11-09T06:00:00Z")}),S.StorageReadError,
      "Auch der Erwaehnungs-Leerpfad reicht technische Lesefehler weiter"); }
    finally { D.decideForUser=decide; }
    A.equal(writes,0);
    mode="ok";
    console.log("PASS: Server verwendet Sammelleser; unvollstaendiger Stapel faellt verlustfrei auf Einzelquellen zurueck; leere Menge ohne IO.");
    console.log("PASS: 225 Eingaben vollstaendig identisch; 9 statt225 Reads; maximal8 parallel;40 je Vorgang; frische Aenderung sichtbar; fehlende/fremde/doppelte/fehlerhafte Daten gesperrt;0 Writes/Modelle.");
  } finally {
    for(const n of names)if(before[n]===undefined)delete process.env[n];else process.env[n]=before[n];
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exitCode=1});
