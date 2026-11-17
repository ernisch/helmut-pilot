"use strict";
// Deklarierte technische Fiktionen; echte Aufrufer/Parser, nur Speicher ersetzt.
// Keine amtlichen Neuabrufe, Rechtsfreigabe, Production- oder Modellaufrufe.
const A=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const E=require("../lib/helmut/quellen-bundestag-termine"),T=require("../lib/helmut/parlamentsbelege-produkt");
const S=require("../lib/helmut/storage"),DIP=require("../lib/helmut/dip"),D=require("../lib/helmut/dedup"),Scheduler=require("../lib/helmut/scheduler");
const H=require("../lib/helmut/quellen-hinweis"),C=require("../lib/helmut/briefingContract"),R=require("../lib/helmut/radarState"),L=require("../lib/helmut/lage");
const now=()=>Date.parse("2026-11-17T12:00:00Z"),q=E.QUELLEN[1],copy=structuredClone;
const profile={id:"synthetisches-mandat",parliamentType:"Bundestag",committees:["Ausschuss für Wirtschaft und Energie"]};
const original={id:"99008119",titel:"Synthetischer Testgegenstand",datum:"2026-11-10",drucksachetyp:"Antrag",dokumentart:"Drucksache",wahlperiode:21,
  fundstelle:{pdf_url:"https://dserver.bundestag.de/btd/21/081/2108119.pdf"},
  vorgangsbezug:[{id:"99988119",titel:"Synthetischer Testgegenstand",vorgangstyp:"Antrag"}]};
const doc=()=>D.toRawDocumentRow(Scheduler.dipDocToRawItem(DIP.normalizeDrucksache(original)));
const text=`Mitteilung\nBerlin, den 5. November 2026\nDie Tagesordnung der 59. Sitzung des Ausschusses
Mittwoch, dem 11. November 2026, 10:30 Uhr\nTagesordnungspunkt 1\nSynthetischer Testgegenstand
BT-Drucksache 21/8119\nVoten angefordert für den: 11.11.2026`;
const pd=()=>E.tagesordnung(q,{url:"https://www.bundestag.de/resource/blob/999999/fixture.pdf",listedMeeting:"59",revision:0,visibility:"nichtoeffentlich"},Buffer.from("%PDF-deklarierte-Fiktion"),[text]);
const stand=()=>E.baueStand(q,[pd()],new Date(now()).toISOString(),"a".repeat(64));
const katalog=()=>({retrievalPaths:[{id:q.retrievalPathId,legacy_source_id:q.id,publisher_id:"publisher-bundestag.de",url:q.url,method:q.crawlMethod,status:"healthy",activation_mode:"always_on"}]});
const seedPath=require.resolve("../lib/helmut/quellenarchitektur/seeds/fach-parteiquellen");
const seed=require(seedPath),savedSeed=require.cache[seedPath].exports;
const approval={id:q.id,url:q.url,rightsReviewRequired:false,usagePolicy:{scope:"structured_parliamentary_facts",commercialUseApproved:true,
  fullTextAllowed:false,imagesAllowed:false,aiTrainingAllowed:false,evidenceUrls:["https://example.test/deklarierter-testbeleg"]}};
let stored,calls,passed=0,browserHtml="";
const request=async(endpoint,opts={})=>{
  A(!opts.method||opts.method==="GET","Produktlesen bleibt GET");calls.push(endpoint);
  const u=new URL(endpoint,"https://offline.invalid");A.equal(u.pathname,"/rest/v1/helmut_store");
  if((u.searchParams.get("id")||"").includes("-dipstand-"))return [];
  A.equal(u.searchParams.get("data->>sourceId"),"eq."+q.id);A.equal(u.searchParams.get("limit"),"2");
  return copy(stored);
};
const deps=()=>({request,katalog,storeId:"offline",now});
const row=s=>({id:`offline-bt-terminstand-${s.belegHash}`,data:s});
async function test(name,run){stored=[row(stand())];calls=[];await run();passed++;console.log("PASS "+name);}
function client(){
  const root=path.resolve(__dirname,".."),source=fs.readFileSync(path.join(__dirname,"parlamentsdaten-quellen-ui-test.js"),"utf8");
  const code=source.slice(source.indexOf("function loadClient()"),source.indexOf("\nconst api = loadClient();"))
    .replace("{ renderSourceNotice,","{ renderParlamentsKontext,renderParlamentsOriginale,renderDipBeratungsstand,renderUiBriefingHero,renderSourceNotice,");
  return vm.runInNewContext(code+"\nloadClient()",{root,fs,vm,assert:A,console,path,URL,URLSearchParams,Intl,Date});
}
async function normaleAppAusgabe(briefing){
  // Der wirkliche HTTP-Leseeinstieg, gespeicherter Pakettransport ersetzt.
  // Die bestehenden Paket-/Quittungspruefungen werden dadurch nicht neu abgenommen.
  const src=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8"),start=src.indexOf("async function latestBriefingPayload("),end=src.indexOf("\n// opts.slot",start);
  A(start>0&&end>start);
  const fn=vm.runInNewContext(src.slice(start,end)+"\nlatestBriefingPayload",{
    require:name=>{
      if(name==="./lib/helmut/tagespaket-auslieferung")return{lese:async()=>({briefing,frischeKontext:null})};
      if(name==="./lib/helmut/parlamentsbelege-produkt")return T;
      throw Error("Unerwarteter Apppfad: "+name);
    },storageModul:S,prepareBriefingResponse:value=>value});
  return fn({politicianId:profile.id,profile,url:new URL("https://offline.invalid/api/briefing")});
}
async function main(){
  A.equal(process.env.HELMUT_LOKALER_SCHUTZ,"aktiv");
  await test("Drei Pilotrollen bleiben Hauptausschuss/Stellvertretungen; kein BT-Kontext im Landtag",async()=>{
    const p={parliamentType:"Bundestag",committee:"Arbeit und Soziales",deputyCommittees:["Wirtschaft und Energie","Digitales und Staatsmodernisierung"]};
    A.equal(T.rolle(p,E.QUELLEN[0]),"Hauptausschuss");A.equal(T.rolle(p,E.QUELLEN[1]),"Stellvertretung");A.equal(T.rolle(p,E.QUELLEN[2]),"Stellvertretung");
    A.equal(T.rolle({...p,parliamentType:"Landtag"},E.QUELLEN[0]),null);
    A.equal(T.rolle({parliamentType:"Bundestag",committees:[],committee:"Arbeit und Soziales"},E.QUELLEN[0]),null);
  });
  await test("Default ohne reale Nutzungsfreigabe: null Kontext, null Speicherzugriffe",async()=>{
    const d=doc();A.equal(await T.leseKontext(profile,deps()),null);A.deepEqual(await T.mitGespeichertenStaenden([d],deps()),[d]);A.equal(calls.length,0);
  });
  await test("Amtliche DIP-Vorgangsnummern sind keine internen Tagespaket-Abhaengigkeiten",async()=>{
    const ids=require("../lib/helmut/tagespaket-auslieferung").vorgangIds({vorgangId:"interner-sichtbarer-vorgang",
      sources:[{dipBeratungsstaende:[{vorgangId:"99988119"}]}]});
    A.deepEqual([...ids],["interner-sichtbarer-vorgang"]);
  });
  await test("Normaler gespeicherter Apppfad entfernt unbelegte Mengen auch ohne DIP und Rechteaktivierung",async()=>{
    const card={id:"synthetische-vorsorge",vorgangId:"synthetische-vorsorge",displaySummary:"Bestehende Vertraege laufen weiter.",
      whyRelevant:"Die Reform betrifft Millionen Vertraege.",summary:{warumWichtig:"Die Reform aendert neue Vorsorgeprodukte."},
      sources:[{name:"Synthetische Quelle",url:"https://example.test/vorsorge"}]};
    const paket={lageBriefing:{paragraphs:[{text:"Bestehender gepruefter Absatz"}],vorgaenge:[card]},
      gespeicherterNachweis:{inhaltHash:"deklarierter-originalhash"},paketStatus:{zustand:"partial"}};
    const before=copy(paket),old=S.getPruefSourcesByVorgaenge;let reads=0;
    S.getPruefSourcesByVorgaenge=async kos=>{reads++;A.deepEqual(kos.map(k=>k.vorgang_id),[card.id]);
      return {[card.id]:[{id:"synthetisches-dokument",url:card.sources[0].url,title:"Synthetische Vorsorge",
        summary:"Neue Vorsorgeprodukte werden vorgestellt. Bestehende Vertraege laufen weiter."}]};};
    try{
      const out=await normaleAppAusgabe(paket);
      A.equal(reads,1);A.equal(out.lageBriefing.vorgaenge[0].whyRelevant,"");
      A.equal(out.lageBriefing.vorgaenge[0].summary.warumWichtig,card.summary.warumWichtig);
      A.deepEqual(out.lageBriefing.paragraphs,paket.lageBriefing.paragraphs);
      A.deepEqual(out.gespeicherterNachweis,paket.gespeicherterNachweis);A.deepEqual(out.paketStatus,paket.paketStatus);
      A.deepEqual(paket,before);A.equal(out.lageBriefing.parlamentsKontext,undefined);A.equal(calls.length,0);
    }finally{S.getPruefSourcesByVorgaenge=old;}
  });
  require.cache[seedPath].exports={...seed,ZUSAETZLICHE_QUELLEN:[...seed.ZUSAETZLICHE_QUELLEN,approval]};
  const oldRequest=S.supabaseRequest,oldCatalog=S.listSourceArchitectureRows;
  S.supabaseRequest=request;S.listSourceArchitectureRows=katalog;
  try{
    await test("Metadaten lesen sichtbare Vorgangskennungen vor versteckten Altitems/Paketmetadaten",async()=>{
      let angefordert;
      const cached={items:Array.from({length:60},(_,i)=>({vorgangId:"verdeckter-altvorgang-"+i})),
        lageBriefing:{vorgaenge:[{vorgangId:"sichtbare-lage"}]},currentHelmutState:{primaryVorgangId:"sichtbares-briefing"},
        currentRadarState:{anzeige:{articles:[{vorgangId:"sichtbarer-radar"}]},articles:[{vorgangId:"verdeckter-rohradar"}]},
        paketStatus:{quellenStand:{abhaengigkeiten:[{vorgang_id:"reine-paketabhaengigkeit"}]}}};
      await T.ergaenzeAusgabe(cached,profile,{...deps(),storage:{getPruefSourcesByVorgaenge:async kos=>{angefordert=kos.map(k=>k.vorgang_id);return{};}}});
      A.deepEqual(angefordert,["sichtbare-lage","sichtbares-briefing","sichtbarer-radar"]);
    });
    await test("Neuester exakter gespeicherter Originalstand traegt GET-/Hash-/Zeitbindung",async()=>{
      A(E.freigabe(q,katalog()),"Deklarierte Zulassungsfixture muss den echten Vertrag bestehen");
      E.leseStand(stored[0].data);
      const r=await T.leseStaende(deps());A.equal(calls.length,1);
      A.equal(r[0].stand?.belegHash,stand().belegHash);
      const ctx=await T.leseKontext(profile,deps());A.equal(ctx.belege[0].rolle,"Hauptausschuss");A.equal(ctx.coverage,"partial");
      A.equal(ctx.belege[0].sitzungen[0].tops[0].fristen[0].status,"abgelaufen");
      A.equal(ctx.belege[0].sitzungen[0].tops[0].fristen[0].zeitpunkt,null);
    });
    await test("Falscher Namespace, geaenderter Hash, Zukunft und Zeitkonflikt werden unbekannt",async()=>{
      for(const change of [r=>r.id="fremd",r=>r.data.documents[0].meetings[0].day="2026-11-12",r=>{
        const s=E.baueStand(q,[pd()],"2026-11-18T12:00:00.000Z","a".repeat(64));Object.assign(r,row(s));}]){
        stored=[row(stand())];change(stored[0]);A.equal((await T.leseStaende(deps()))[0].stand,null);
      }
      const s=stand(),d=pd();d.meetings[0].startsAt="2026-11-11T09:00:00.000Z";
      const other=E.baueStand(q,[d],s.retrievedAt,"a".repeat(64));stored=[row(s),row(other)];
      A.equal((await T.leseStaende(deps()))[0].stand,null);
    });
    await test("Technische Inaktivitaet und Lesefehler behaupten keinen Beleg",async()=>{
      A.equal((await T.leseStaende({...deps(),katalog:()=>({retrievalPaths:[]})}))[0].stand,null);
      A.equal((await T.leseStaende({...deps(),request:()=>{throw Error("Speicher nicht lesbar");}}))[0].stand,null);
    });
    await test("Exakte BT-Drucksache/Vorgangszuordnung statt Titel, Bundesrat oder fremder Nummer",async()=>{
      A.equal(T.drucksache(doc()),"21/8119");
      const d=doc(),a=await T.mitGespeichertenStaenden([d],deps());A.equal(a[0].parlamentsOriginalbelege[0].dokumentnummer,"21/8119");
      const alt=copy(d);delete alt.raw.helmutDipQuellfelder;A.equal(T.drucksache(alt),null);
      const foreign=doc();foreign.url=foreign.canonical_url="https://dserver.bundestag.de/brd/21/081/2108119.pdf";A.equal(T.drucksache(foreign),null);
      const wrong=copy(original);wrong.fundstelle.pdf_url="https://dserver.bundestag.de/btd/21/081/2108120.pdf";
      const w=D.toRawDocumentRow(Scheduler.dipDocToRawItem(DIP.normalizeDrucksache(wrong)));
      A.equal((await T.mitGespeichertenStaenden([w],deps()))[0].parlamentsOriginalbelege.length,0);
      A.equal(d.parlamentsOriginalbelege,undefined,"Original nicht veraendern");
    });
    await test("Aktuelle Haupt-/Stellvertretungsrolle; Profilwechsel entzieht alte Bindung",async()=>{
      const d=(await T.mitGespeichertenStaenden([doc()],deps()))[0],src={v:[d]};
      const bound=T.fuerMandat(src,profile,new Date(now())).v[0];A.equal(bound.parlamentsBelege[0].rolle,"Hauptausschuss");
      const deputy={parliamentType:"Bundestag",stellvertretende_ausschuesse:["Wirtschaft und Energie"]};
      A.equal(T.fuerMandat(src,deputy,new Date(now())).v[0].parlamentsBelege[0].rolle,"Stellvertretung");
      for(const p of [{parliamentType:"Bundestag",committees:["Gesundheit"]},{...profile,parliamentType:"Landtag"},{}])
        A.equal(T.fuerMandat({v:[bound]},p,new Date(now())).v[0].parlamentsBelege,undefined);
      A.equal(d.parlamentsBelege,undefined);
      const changed=copy(d);changed.parlamentsOriginalbelege[0].sitzungen[0].tops[0].fristen[0].tag="2026-11-17";
      A.equal(T.fuerMandat({v:[changed]},profile,new Date(now())).v[0].parlamentsBelege,undefined);
    });
    await test("Lage/Radar/Briefing erhalten begrenzte Angaben; kein neuer Tagesauftrag",async()=>{
      const d=(await T.mitGespeichertenStaenden([doc()],deps()))[0];
      const ko={id:"ko-synth",vorgang_id:"vg-synth",status:"neu",understanding_status:"complete",display_title:d.title};
      const input={profile,now:new Date(now()),decisions:[{knowledge_object_id:ko.id,score:50,decision:"Beobachten",matched_features:[]}],kosById:{[ko.id]:ko},sourcesByVorgang:{[ko.vorgang_id]:[d]}};
      const radar=R.buildCurrentRadarState(input);A(radar.articles[0].parlamentsBelege);
      const brief=C.toBriefingContractV3(input);A.equal(brief.currentHelmutState.primaryItem,null);
      const bound=T.fuerMandat(input.sourcesByVorgang,profile,input.now)[ko.vorgang_id][0];
      const source=C.buildSources(ko,[bound])[0];A(source.parlamentsBelege);A(L.mapSource(bound).parlamentsBelege);
      const ui=client(),html=ui.renderDipBeratungsstand(source,source.url);
      A(html.includes("data-parlamentsbeleg"));A(html.includes("abgelaufen"));A(html.includes("Kein persönlicher Anwesenheits- oder Handlungsauftrag"));
      A(!html.includes("00:00"));A(!html.includes("Tagespriorität"));
      A.equal(ui.renderDipBeratungsstand(source,"https://fremd.test/"),"");
      const ctx=await T.leseKontext(profile,deps()),markup=ui.renderParlamentsKontext(ctx);
      A(markup.includes("keine Zuordnung zu einer bestimmten Meldung"));A.equal((markup.match(/data-parlamentskontext/g)||[]).length,1);
    });
    await test("Native Lage liefert den getrennten Mandatskontext auch ohne belegte Tagesprioritaet",async()=>{
      const previous=process.env.HELMUT_SUPABASE_STORE_ID;process.env.HELMUT_SUPABASE_STORE_ID="offline";
      try{
        const result=await L.buildLageBriefing(profile,{now:new Date(now())});
        A(result.parlamentsKontext);A.equal(result.parlamentsKontext.belege[0].rolle,"Hauptausschuss");
        A.equal(result.parlamentsKontext.belege[0].belegHash,stand().belegHash);
        browserHtml=client().renderParlamentsKontext(result.parlamentsKontext);
        A(browserHtml.includes("data-parlamentskontext"));A(browserHtml.includes("abgelaufen"));
        A.equal((await L.buildLageBriefing({...profile,parliamentType:"Landtag"},{now:new Date(now())})).parlamentsKontext,undefined);
      }finally{if(previous===undefined)delete process.env.HELMUT_SUPABASE_STORE_ID;else process.env.HELMUT_SUPABASE_STORE_ID=previous;}
    });
    await test("Alte Quellbeobachtung und Profilcache machen eine vergangene Frist nicht aktuell",async()=>{
      const s=E.baueStand(q,[pd()],"2026-11-10T12:00:00.000Z","a".repeat(64));stored=[row(s)];
      const d=(await T.mitGespeichertenStaenden([doc()],deps()))[0];
      const b=T.fuerMandat({v:[d]},profile,new Date(now())).v[0].parlamentsBelege[0];
      A.equal(b.aktuell,false);A.equal(b.sitzungen[0].tops[0].fristen[0].status,"abgelaufen");
      A(client().renderParlamentsOriginale([b]).includes("Kein aktueller Stand bestätigt"));
    });
    await test("Native Sammel- und Einzelquellen transportieren Terminbelege nur per GET",async()=>{
      const keys=["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","HELMUT_V3_STORE","HELMUT_SUPABASE_STORE_ID"];
      const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]])),oldFetch=global.fetch;
      Object.assign(process.env,{SUPABASE_URL:"https://offline.invalid",SUPABASE_SERVICE_ROLE_KEY:"offline",HELMUT_V3_STORE:"1",HELMUT_SUPABASE_STORE_ID:"offline"});
      const d=doc(),json=v=>new Response(JSON.stringify(v));
      global.fetch=async(url,options={})=>{A.equal(new URL(url).origin,"https://offline.invalid");A(!options.method||options.method==="GET");
        if(new URL(url).pathname==="/rest/v1/ko_document_links")return json([{raw_documents:d}]);
        if(new URL(url).pathname==="/rest/v1/knowledge_objects")return json([{id:"ko-synth",vorgang_id:"synth",ko_document_links:[{raw_document_id:d.id,raw_documents:d}]}]);
        throw Error("Unerwarteter Transport: "+new URL(url).pathname);};
      try{
        const single=await S.getSourcesForVorgang("synth",{strict:true});A(single[0].parlamentsOriginalbelege.length);
        const batch=await S.getPruefSourcesByVorgaenge([{id:"ko-synth",vorgang_id:"synth"}]);A(batch.synth[0].parlamentsOriginalbelege.length);
        const source={name:"DIP",url:d.url,title:d.title,publishedAt:d.published_at,quelleId:d.id};
        const paket={gespeicherterNachweis:{inhaltHash:"deklarierter-unveraenderter-testhash"},
          currentHelmutState:{primaryItem:null,recommendation:""},
          lageBriefing:{available:true,vorgaenge:[{vorgangId:"synth",displayTitle:"Bestehender Titel",displaySummary:"Bestehender unveraenderter Text",sources:[source]}]}};
        const vorher=JSON.stringify(paket),out=await normaleAppAusgabe(paket);
        A(out.lageBriefing.parlamentsKontext);A(out.lageBriefing.vorgaenge[0].sources[0].parlamentsBelege);
        A.equal(out.lageBriefing.vorgaenge[0].displaySummary,"Bestehender unveraenderter Text");
        A.deepEqual(out.gespeicherterNachweis,paket.gespeicherterNachweis);A.equal(JSON.stringify(paket),vorher);
        A.equal(out.currentHelmutState.primaryItem,null);A.equal(out.currentHelmutState.recommendation,"");
      }finally{global.fetch=oldFetch;for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
    });
    await test("Plenarprogramm erhaelt vier Sitzungen ohne erfundene TOP-/Tageszuordnung; Wochenende exklusiv",async()=>{
      const extra=[E.QUELLEN[3],E.QUELLEN[4]],currentSeed=require.cache[seedPath].exports;
      require.cache[seedPath].exports={...currentSeed,ZUSAETZLICHE_QUELLEN:[...currentSeed.ZUSAETZLICHE_QUELLEN,...extra.map(s=>({...approval,id:s.id,url:s.url}))]};
      try{
        const page="Tagesordnung Stand: 12. November 2026\n"+[110,111,112,113].map((n,i)=>`${n}. Sitzung des Deutschen Bundestages\nam Dienstag, dem ${24+i}. November 2026, ${9+i} Uhr`).join("\n")
          +"\nTagesordnungspunkt 9\nSynthetischer Testgegenstand\nDrucksache 21/8119";
        const plenum=E.tagesordnung(extra[0],{url:"https://www.bundestag.de/resource/blob/999998/fixture.pdf",listedMeeting:null,revision:0,visibility:"oeffentlich"},Buffer.from("%PDF-Plenum-Fiktion"),[page]);
        const ics=Buffer.from("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:fixture.test\r\nDTSTAMP:20251216T100654Z\r\nDTSTART;VALUE=DATE:20261123\r\nDTEND;VALUE=DATE:20261128\r\nSUMMARY:Sitzungswoche Deutscher Bundestag\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n");
        const calendar=E.kalender(extra[1],{url:"https://www.bundestag.de/resource/blob/999997/fixture.ics"},ics);
        const stands=[stand(),E.baueStand(extra[0],[plenum],new Date(now()).toISOString(),"a".repeat(64)),E.baueStand(extra[1],[calendar],new Date(now()).toISOString(),"a".repeat(64))];
        const options={...deps(),katalog:()=>({retrievalPaths:[q,...extra].map(s=>({...katalog().retrievalPaths[0],id:s.retrievalPathId,legacy_source_id:s.id,url:s.url,method:s.crawlMethod}))}),
          request:async(endpoint,opts={})=>{A(!opts.method||opts.method==="GET");const id=new URL(endpoint,"https://offline.invalid").searchParams.get("data->>sourceId").slice(3);return stands.filter(s=>s.sourceId===id).map(row);}};
        const ctx=await T.leseKontext(profile,options),p=ctx.belege.find(b=>b.art==="plenum"),cal=ctx.belege.find(b=>b.art==="kalender");
        A.equal(p.sitzungen.length,4);A(p.sitzungen.every(m=>m.tops.length===0));A.equal(p.sitzungszuordnung,"unbekannt");
        A.equal(cal.termine[0].von,"2026-11-23");A.equal(cal.termine[0].bisExklusiv,"2026-11-28");A.equal(cal.termine[0].ganztags,true);
        const h=client().renderParlamentsKontext(ctx);A(h.includes("Ende exklusiv"));A(h.includes("Zuordnung dieser Drucksache zu einem einzelnen Sitzungstag oder TOP nicht bestätigt"));
        const raw=(await T.mitGespeichertenStaenden([doc()],options))[0];A(!raw.parlamentsOriginalbelege.some(b=>b.art==="kalender"));
      }finally{require.cache[seedPath].exports=currentSeed;}
    });
    await test("Nummern-/Fassungskonflikt zeigt Originalangaben, aber keine aktuelle Frist",async()=>{
      const d=pd();d.conflicts.push("sitzungsnummer-widerspruch");stored=[row(E.baueStand(q,[d],new Date(now()).toISOString(),"a".repeat(64)))];
      const b=(await T.leseKontext(profile,deps())).belege[0];A.equal(b.sitzungen[0].stand,"ungeklaert");A.equal(b.sitzungen[0].tops.length,0);
      const h=client().renderParlamentsOriginale([b]);A(h.includes("Sitzungszuordnung ungeklärt"));A(h.includes("Original nennt Sitzung 59"));A(!h.includes("TOP 1"));
    });
    await test("Widerruf der Nutzungsfreigabe entfernt auch gecachte Metadaten",async()=>{
      const d=(await T.mitGespeichertenStaenden([doc()],deps()))[0];
      const bound=T.fuerMandat({v:[d]},profile,new Date(now())).v[0];
      const context=await T.leseKontext(profile,deps());
      require.cache[seedPath].exports=savedSeed;
      A.deepEqual(T.anzeige(bound,bound.url),{});A.equal(await T.leseKontext(profile,deps()),null);
      const previous={lageBriefing:{parlamentsKontext:context}};
      A.equal((await T.ergaenzeAusgabe(previous,profile,deps())).lageBriefing.parlamentsKontext,undefined);
      A(previous.lageBriefing.parlamentsKontext,"Gespeicherte Eingabe bleibt erhalten");
    });
  }finally{require.cache[seedPath].exports=savedSeed;S.supabaseRequest=oldRequest;S.listSourceArchitectureRows=oldCatalog;}
  if(process.argv.includes("--browser")){
    const {spawn}=require("node:child_process"),root=path.resolve(__dirname,".."),runner=fs.readFileSync(path.join(__dirname,"ui-preview-browser-check.js"),"utf8");
    const start=runner.indexOf("class CDP {"),end=runner.indexOf("\nasync function main()",start);
    const CDP=vm.runInNewContext(runner.slice(start,end)+"\nCDP",{setTimeout,clearTimeout});
    const dir=fs.mkdtempSync(path.join(require("node:os").tmpdir(),"parlamentsbelege-browser-"));
    const chrome=spawn("/usr/bin/chromium",["--headless","--no-sandbox","--disable-dev-shm-usage","--remote-debugging-pipe","--disable-background-networking","--disable-component-update","--disable-sync","--no-first-run","--no-proxy-server","--disable-features=Translate,MediaRouter,OptimizationHints","--user-data-dir="+dir],{env:{PATH:process.env.PATH,HOME:dir},stdio:["ignore","ignore","pipe","pipe","pipe"]});
    chrome.stderr.resume();const cdp=new CDP(chrome);
    try{
      const target=await cdp.send("Target.createTarget",{url:"about:blank"}),{sessionId}=await cdp.send("Target.attachToTarget",{targetId:target.targetId,flatten:true});
      await cdp.send("Page.enable",{},sessionId);await cdp.send("Runtime.enable",{},sessionId);await cdp.send("Network.enable",{},sessionId);
      await cdp.send("Network.setBlockedURLs",{urls:["*"]},sessionId);await cdp.send("Network.emulateNetworkConditions",{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0},sessionId);
      const {frameTree}=await cdp.send("Page.getFrameTree",{},sessionId),css=fs.readFileSync(path.join(root,"styles.css"),"utf8");
      for(const width of [390,1280]){
        await cdp.send("Emulation.setDeviceMetricsOverride",{width,height:844,deviceScaleFactor:1,mobile:width<500},sessionId);
        await cdp.send("Page.setDocumentContent",{frameId:frameTree.frame.id,html:`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>${css}</style><main style="padding:16px;max-width:800px">${browserHtml}</main>`},sessionId);
        const state=await cdp.evaluate(sessionId,"(()=>{document.querySelectorAll('details').forEach(x=>x.open=true);return{count:document.querySelectorAll('[data-parlamentsbeleg]').length,nested:document.querySelectorAll('a a').length,text:document.body.innerText,width:document.documentElement.scrollWidth,view:innerWidth}})()");
        A.equal(state.count,1);A.equal(state.nested,0);A(state.text.includes("abgelaufen"));A(state.width<=state.view);
      }
      console.log("PASS echter Chromium390/1280: sichtbarer parlamentarischer Kontext, historische Frist, getrennte Links, kein Ueberlauf; Renderer offline.");
    }finally{await cdp.send("Browser.close").catch(()=>{});chrome.kill("SIGTERM");fs.rmSync(dir,{recursive:true,force:true});}
  }
  console.log(`${passed}/${passed} gezielte parlamentarische Produktgruppen bestanden; keine Production-/Quellen-/Modellaufrufe.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
