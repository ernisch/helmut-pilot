"use strict";
const assert = require("node:assert/strict");
const { lese } = require("../lib/helmut/dip-vorgangsfakten");
const { binde } = require("../lib/helmut/prosa-faktenplan");
const fixture = require("./fixtures/dip-vorgangsfakten-amtlich.json");
const p = fixture.documents.find(d => d.id === "699175");
const orig=global.fetch, key=process.env.DIP_API_KEY;
const tag="2026-09-20", positionIds=[p.id];
const basic = { id:"synthetisch",parliamentType:"Bundestag",deputyCommittees:["Haushaltsausschuss"] };
async function main() {
  assert.equal(process.env.HELMUT_LOKALER_SCHUTZ,"aktiv");
  process.env.DIP_API_KEY="offline-profil";
  global.fetch=async () => new Response(JSON.stringify(p),{headers:{"content-type":"application/json"}});
  const r = await lese({positionIds,tag,profile:basic});
  const relevant=r.fakten.filter(f=>f.formulierungen.profil);
  assert.equal(relevant.length,1);
  assert(relevant[0].formulierungen.profil.includes('unter den stellvertretenden Ausschussmitgliedschaften'));
  assert(relevant[0].formulierungen.profil.includes('"Haushaltsbegleitgesetz 2027"'));
  assert(!relevant[0].formulierungen.profil.includes("Vorsitz"));
  assert(!relevant[0].formulierungen.option);
  console.log("PASS Amtliche Ueberweisung trifft genau den hinterlegten stellvertretenden Ausschuss");
  for (const parliamentType of [undefined,"Landtag","Bundesregierung","Bundestag und Landtag"]) {
    const r=await lese({positionIds,tag,profile:{...basic,parliamentType}});
    assert(!r.fakten.some(f=>f.formulierungen.profil));
  }
  console.log("PASS Gleicher Ausschussname im Landtag oder ohne explizite Ebene erzeugt keinen Bezug");
  for (const patch of [{deputyCommittees:["Haushalt"]},{committees:["Haushaltsausschuss"]},
    {politische_ebene:"landtag"},{deputyCommittees:[]}]) {
    const r=await lese({positionIds,tag,profile:{...basic,...patch}});
    assert(!r.fakten.some(f=>f.formulierungen.profil));
  }
  console.log("PASS Themenwort, widerspruechliche Mitgliedschaft oder Ebenen werden nicht bestaetigt");
  const normal=await lese({positionIds,tag,profile:{id:"synthetisch",politische_ebene:"bundestag",ausschuesse:["Haushaltsausschuss"]}});
  assert(normal.fakten.find(f=>f.formulierungen.profil).formulierungen.profil.includes("unter den Ausschussmitgliedschaften"));
  console.log("PASS Aktuelles relationales Profilformat bleibt vom Stellvertretungsformat getrennt");
  const profile=structuredClone(basic);
  global.fetch=async () => { profile.deputyCommittees=[]; return new Response(JSON.stringify(p),{headers:{"content-type":"application/json"}}); };
  const before=await lese({positionIds,tag,profile});
  assert(before.fakten.some(f=>f.formulierungen.profil));
  assert.equal(profile.deputyCommittees.length,0);
  console.log("PASS Profilaufnahme bleibt waehrend des asynchronen Quellenabrufs konsistent");
  const f=relevant[0], args={...r,profile:basic,tag,
    feldvertrag:[{pfad:"/whyRelevant",zweck:"profil",vorgangId:f.vorgangId}]};
  const bound=binde(args);
  const plan={version:1,basisHash:bound.basisHash,felder:[{pfad:"/whyRelevant",zweck:"profil",faktId:f.id}]};
  assert.equal(bound.formuliere(plan).felder[0].text,f.formulierungen.profil);
  assert.throws(()=>binde({...args,profile:{...basic,id:"fremdes-mandat"}}),/profil-abweichend/);
  console.log("PASS Konkreter Profilbezug bindet an genau dieses Mandat, kein globaler Mandatstext");
  await assert.rejects(()=>lese({positionIds,tag,profile:{}}),/profil/);
  console.log("PASS Unbekannte Mandatsidentitaet wird abgelehnt");
  const ids=[p.id,"699347"], seen=[];
  global.fetch=async url=>{
    const id=new URL(url).pathname.split("/").pop(); seen.push(id);
    ids[1]="../../fremd"; ids.push("699366");
    return new Response(JSON.stringify(fixture.documents.find(d=>d.id===id)),{headers:{"content-type":"application/json"}});
  };
  const snapshot=await lese({positionIds:ids,tag,profile:basic});
  assert.deepEqual(seen,[p.id,"699347"]); assert.equal(snapshot.quellen.length,2);
  console.log("PASS Validierte Positionsauswahl kann waehrend des Abrufs weder ersetzt noch erweitert werden");
  console.log("8/8 begrenzte Profil und Aufnahmegruppen bestanden; kein individueller Auftrag und keine 36er Fachabnahme.");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
  global.fetch=orig; if(key===undefined)delete process.env.DIP_API_KEY;else process.env.DIP_API_KEY=key;
});
