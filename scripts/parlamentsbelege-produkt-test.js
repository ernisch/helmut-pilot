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
const pd=()=>E.tagesordnung(q,{url:"https://www.bundestag.de/resource/blob/999999/fixture.pdf",listedDay:"2026-11-06",listedMeeting:"59",revision:0,visibility:"nichtoeffentlich"},Buffer.from("%PDF-deklarierte-Fiktion"),[text]);
const stand=()=>E.baueStand(q,[pd()],new Date(now()).toISOString(),"a".repeat(64));
const katalog=(qs=[q])=>({
  retrievalPaths:qs.map(s=>({id:s.retrievalPathId,legacy_source_id:s.id,publisher_id:"publisher-bundestag.de",
    url:s.url,method:s.crawlMethod,status:"needs_review",activation_mode:"auto"})),
  packages:[...new Set(qs.map(s=>s.packageId))].map(id=>({id,status:"active"})),
  packagePaths:qs.map(s=>({package_id:s.packageId,retrieval_path_id:s.retrievalPathId}))
});
const seedPath=require.resolve("../lib/helmut/quellenarchitektur/seeds/fach-parteiquellen");
const seed=require(seedPath),savedSeed=require.cache[seedPath].exports;
const ohneFreigabe={...seed,BUNDESTAG_TERMINE_NUTZUNGSBELEGE:[]};
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
async function normaleAppAusgabe(briefing, { suche = "", storage = S, zeit = now() } = {}) {
  // Der wirkliche HTTP-Leseeinstieg, gespeicherter Pakettransport ersetzt.
  // Die bestehenden Paket-/Quittungspruefungen werden dadurch nicht neu abgenommen.
  const src=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8"),start=src.indexOf("async function latestBriefingPayload("),end=src.indexOf("\n// opts.slot",start);
  A(start>0&&end>start);
  const fn=vm.runInNewContext(src.slice(start,end)+"\nlatestBriefingPayload",{
    require:name=>{
      if(name==="./lib/helmut/tagespaket-auslieferung")return{...require("../lib/helmut/tagespaket-auslieferung"),lese:async()=>({briefing,frischeKontext:null})};
      if(name==="./lib/helmut/briefing-speicher") {
        const B = require("../lib/helmut/briefing-speicher");
        return { ...B, lese: args => B.lese({ ...args, storage }) };
      }
      if(name==="./lib/helmut/publication-eligibility")return require("../lib/helmut/publication-eligibility");
      if(name==="./lib/helmut/parlamentsbelege-produkt")return T;
      throw Error("Unerwarteter Apppfad: "+name);
    },storageModul:storage,Date:class extends Date { constructor(){ super(zeit); } },prepareBriefingResponse:value=>value});
  return fn({politicianId:profile.id,profile,url:new URL("https://offline.invalid/api/briefing"+suche)});
}
async function main(){
  A.equal(process.env.HELMUT_LOKALER_SCHUTZ,"aktiv");
  require.cache[seedPath].exports=ohneFreigabe;
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
  require.cache[seedPath].exports={...seed,BUNDESTAG_TERMINE_NUTZUNGSBELEGE:[approval]};
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
    await test("Sitzungswochen aus der wirklichen Paket-Lage sind in der Morgenquittung gebunden", async () => {
      const kalender = E.QUELLEN[4], originalUrl = "https://www.bundestag.de/resource/blob/1103938/fixture.ics";
      const mandat = { ...profile, name: "Synthetisches Mandat", party: "Fraktionslos", focusTopics: ["Wirtschaft"] };
      const bytes = Buffer.from(["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:fixture.test",
        "DTSTAMP:20261116T080000Z", "DTSTART;VALUE=DATE:20261123", "DTEND;VALUE=DATE:20261128",
        "SUMMARY:Sitzungswoche Deutscher Bundestag", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n"));
      const kalenderstand = E.baueStand(kalender, [E.kalender(kalender, { url: originalUrl }, bytes)],
        new Date(now()).toISOString(), "b".repeat(64));
      const erlaubnis = { ...approval, id: kalender.id, url: kalender.url };
      const vorher = require.cache[seedPath].exports, flag = process.env.HELMUT_QUELLEN_ARBEITSFENSTER;
      const M = require("../lib/helmut/morgenversorgung"), B = require("../lib/helmut/briefing-speicher");
      const belege = require("../lib/helmut/briefing-ausgabebeleg");
      try {
        require.cache[seedPath].exports = { ...seed, BUNDESTAG_TERMINE_NUTZUNGSBELEGE: [erlaubnis] };
        process.env.HELMUT_QUELLEN_ARBEITSFENSTER = "on";
        const kontext = await T.leseKontext(mandat, { ...deps(), katalog: () => katalog([kalender]),
          request: async () => [row(kalenderstand)] });
        A.equal(kontext.belege[0].belegHash, kalenderstand.belegHash);
        A.deepEqual(T.quellenAusgabebelege(kontext, { ...profile, parliamentType: "Landtag" }, now()), []);
        let paket;
        const storage = {
          assertTenant: S.assertTenant,
          getRenderedBriefingV3: async (_id, slot) => slot === B.SLOT ? paket || null : null,
          insertRenderedBriefingV3: async zeile => { paket = structuredClone(zeile); return { saved: true }; }
        };
        const result = await M.speicherePaket({ profile: mandat, userId: mandat.id,
          briefing: { available: false, items: [], currentHelmutState: {}, currentRadarState: {} },
          lageAnsicht: { parlamentsKontext: kontext, vorgaenge: [] }, storage,
          tag: "2026-11-17", now: new Date(now()) });
        A.equal(paket.payload.briefing.amtlicheQuellenbelege[0].belegHash, kalenderstand.belegHash);
        A(belege.passt(result.ausgabeBeleg, paket));
        const vorwert = copy(paket);
        delete paket.payload.briefing.amtlicheQuellenbelege;
        paket.generated_at = paket.payload.erzeugtAm = new Date(now() + 60000).toISOString();
        paket.payload.vorherigerStand = vorwert;
        const paketLeser = require("../lib/helmut/tagespaket-auslieferung");
        paket.payload.quellenStand = paketLeser.quellenStand(paket.payload);
        paket.payload.inhaltHash = B.inhaltHash(paket.payload);
        A.equal(belege.passt(result.ausgabeBeleg, paket), false);
        const L = require("../lib/helmut/briefing-lauf");
        const tag = "2026-11-17";
        const lauf = L.quittung({ tenantId: mandat.id, berlinTag: tag, status: L.STATUS_ERFOLG,
          ausgabeBeleg: result.ausgabeBeleg, erzeugtAm: new Date(now() + 5000) });
        const zeit = now() + 120000;
        A.deepEqual(paketLeser.quittierterVorgaenger(paket, lauf,
          { day: tag, profile: mandat, now: zeit }), vorwert);
        A.equal(paketLeser.quittierterVorgaenger({ ...paket, payload: { ...paket.payload,
          vorherigerStand: { ...vorwert, user_id: "fremdes-mandat" } } }, lauf,
        { day: tag, profile: mandat, now: zeit }), false);
        const job = { id: "00000000-0000-4000-8000-000000000001", idempotency_key: "kalender", tenant_id: null,
          first_due_at: `${tag}T03:00:00Z`, finished_at: new Date(now()).toISOString(), priority: 40,
          status: "erledigt", payload: { art: "geteilt", quelle: kalender } };
        const Q = require("../lib/helmut/quellen-faelligkeit");
        const journal = Q.speicher({ storeId: "offline", request: async (_path, o) => [JSON.parse(o.body)] });
        const bestaetigt = await journal.sichern({ id: job.id, tenantId: null, firstDueAt: job.first_due_at, payload: job.payload },
          { art: "terminstand", belegHash: kalenderstand.belegHash, standHash: kalenderstand.standHash }, now());
        const abgleich = await require("../lib/helmut/quellenarchitektur/faelligkeitsabgleich").lese({
          catalog: katalog([kalender]), profiles: [mandat], jetztMs: zeit, now: () => zeit, deadlineAt: zeit + 3000,
          env: { HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_SUPABASE_STORE_ID: "offline" },
          storage: { supabaseRequest: async path => {
            if (path.includes("helmut_jobs?job_type=eq.source_fetch")) return [job];
            if (path.includes("helmut_store?id=in.")) return [{ id: journal.id(job.id), data: bestaetigt }];
            A(path.includes("helmut_store?id=eq.offline-quellenplan-")); return [];
          }, listRenderedBriefingsV3ForTenants: async (ids, slots, day) => {
            A.deepEqual(ids, [mandat.id]); A(slots.includes(L.SLOT_ERFOLG)); A.equal(day, tag);
            return [paket, { id: L.laufId(mandat.id, tag), user_id: mandat.id, slot: L.SLOT_ERFOLG, payload: lauf }];
          } }
        });
        A.equal(abgleich.faelligkeiten[0].produkt, "mandatspaket_belegt");
        A.equal(abgleich.faelligkeiten[0].grund, "morgenpaket_verspaetet");
      } finally {
        require.cache[seedPath].exports = vorher;
        if (flag === undefined) delete process.env.HELMUT_QUELLEN_ARBEITSFENSTER;
        else process.env.HELMUT_QUELLEN_ARBEITSFENSTER = flag;
      }
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
    await test("Belegter Ausschuss-TOP trägt Briefing und bleibt an den aktuellen Originalstand gebunden", async () => {
      const speichere = (inhalt, gelesenAm = new Date(now()).toISOString()) => {
        const pdf = E.tagesordnung(q, { url: pd().url, listedDay: "2026-11-06", listedMeeting: "59", revision: 0, visibility: "oeffentlich" },
          Buffer.from(inhalt), [inhalt]);
        return [row(E.baueStand(q, [pdf], gelesenAm, "a".repeat(64)))];
      };
      const inhalt = text.replace("11. November", "19. November").replace("11.11.2026", "18.11.2026, 11:00 Uhr");
      stored = speichere(inhalt);
      const [d] = await T.mitGespeichertenStaenden([doc()], deps());
      const ko = { id: "ko-synth", vorgang_id: "synth", status: "neu", understanding_status: "complete", display_title: d.title };
      const input = { profile, now: new Date(now()), decisions: [{ knowledge_object_id: ko.id, score: 50, decision: "Beobachten" }],
        kosById: { [ko.id]: ko }, sourcesByVorgang: { synth: [d] } };
      const briefing = C.toBriefingContractV3(input), stand = briefing.currentHelmutState;
      const anlass = stand.tagesAnlass;
      A.equal(stand.primaryItem.id, "synth");
      A.equal(anlass.art, "kommende-frist");
      A.equal(anlass.beleg.terminOriginal.dipVorgangId, original.vorgangsbezug[0].id);
      A.equal(anlass.beleg.terminOriginal.url, pd().url);
      A.equal(anlass.beleg.url, d.url);
      const html = client().renderUiBriefingHero(stand);
      A(html.includes(pd().url)); A(html.includes("Amtlicher Terminbeleg")); A(!html.includes("<blockquote>"));
      const lesen = (quellen, p = profile, zeit = input.now) => C.pruefeGespeichertenHelmutStand(stand, p, zeit, quellen);
      A.equal(lesen(input.sourcesByVorgang).abgewiesen, false);
      A.equal(lesen({}).abgewiesen, true);
      A.equal(lesen(input.sourcesByVorgang, { ...profile, committees: ["Gesundheit"] }).abgewiesen, true);
      A.equal(lesen(input.sourcesByVorgang, profile, new Date("2026-11-18T10:00:00Z")).abgewiesen, true);
      const B = require("../lib/helmut/briefing-speicher"), Paket = require("../lib/helmut/tagespaket-auslieferung");
      const rows = new Map(), storage = { assertTenant: S.assertTenant,
        getRenderedBriefingV3: async (id, slot, day) => copy(rows.get(`bf-${id}-${slot}-${day}`) || null),
        insertRenderedBriefingV3: async r => { rows.set(r.id, copy(r)); return { saved: true }; },
        getPruefSourcesByVorgaenge: async ids => {
          A.deepEqual(ids, [{ id: ko.id, vorgang_id: ko.vorgang_id }]);
          return { synth: await T.mitGespeichertenStaenden([doc()], deps()) };
        }
      };
      A.deepEqual([...Paket.vorgangIds({ beleg: anlass.beleg })], []);
      const paketAuftrag = { profile, userId: profile.id, storage, now: input.now };
      await B.materialisiere({ ...paketAuftrag, briefing });
      const vorher = copy([...rows]);
      const live = () => Paket.lese(paketAuftrag);
      const explizit = (auswahl, zeit) => normaleAppAusgabe(null, { suche: `?${auswahl}=2026-11-17`, storage, zeit });
      const auswahl = ["gespeichert", "aktuellGespeichert"];
      A.equal((await live()).briefing.currentHelmutState.tagesAnlass.beleg.terminOriginal.url, pd().url);
      for (const modus of auswahl) {
        const out = await explizit(modus);
        A.equal(out.currentHelmutState.tagesAnlass.beleg.terminOriginal.url, pd().url);
        A.equal(out.gespeicherterNachweis.inhaltHash, vorher[0][1].payload.inhaltHash);
        const heuteOffen = await explizit(modus, Date.parse("2026-11-18T08:00:00Z"));
        A.equal(heuteOffen.currentHelmutState.tagesAnlass?.art, "heutige-frist");
        A.deepEqual(heuteOffen.currentHelmutState.tagesAnlass.beleg.terminOriginal, anlass.beleg.terminOriginal);
        const abgelaufen = await explizit(modus, Date.parse("2026-11-18T10:00:00Z"));
        A.equal(abgelaufen.currentHelmutState.primaryItem, null);
        A.equal(abgelaufen.currentHelmutState.recommendation, "");
      }
      stored = speichere(inhalt.replace("19. November", "20. November"));
      A.equal(lesen({ synth: await T.mitGespeichertenStaenden([doc()], deps()) }).abgewiesen, true);
      A.equal((await live()).briefing.currentHelmutState.primaryItem, null);
      for (const modus of auswahl) A.equal((await explizit(modus)).currentHelmutState.primaryItem, null);
      A.deepEqual([...rows], vorher);
      stored = speichere(inhalt);
      const mitFreigabe = require.cache[seedPath].exports;
      require.cache[seedPath].exports = ohneFreigabe;
      try {
        A.equal(T.terminAnlaesse(d, profile, input.now).length, 0);
        A.equal((await live()).briefing.currentHelmutState.primaryItem, null);
        for (const modus of auswahl) A.equal((await explizit(modus)).currentHelmutState.primaryItem, null);
      } finally { require.cache[seedPath].exports = mitFreigabe; }
      stored = [];
      for (const modus of auswahl) A.equal((await explizit(modus)).currentHelmutState.primaryItem, null);
      A.deepEqual([...rows], vorher);
      stored = speichere(inhalt.replace("BT-Drucksache 21/8119", "BT-Drucksache 21/8118"));
      A.equal(lesen({ synth: await T.mitGespeichertenStaenden([doc()], deps()) }).abgewiesen, true);
      stored = speichere(inhalt.replace("59. Sitzung", "58. Sitzung"));
      const [konflikt] = await T.mitGespeichertenStaenden([doc()], deps());
      A.equal(T.terminAnlaesse(konflikt, profile, input.now).length, 0);
      stored = speichere(inhalt.split("\nVoten angefordert")[0]);
      const [sitzung] = await T.mitGespeichertenStaenden([doc()], deps());
      A.equal(T.terminAnlaesse(sitzung, profile, input.now)[0].art, "bevorstehender-schritt");
      A.equal(T.terminAnlaesse(sitzung, profile, new Date(now() + 86400001)).length, 0);
      stored = speichere(inhalt.replace("BT-Drucksache 21/8119", "BT-Drucksachen 21/8119, 21/8120"));
      const [mehrfach] = await T.mitGespeichertenStaenden([doc()], deps());
      A.equal(mehrfach.parlamentsOriginalbelege[0].sitzungen[0].tops[0].fristen.length, 0);
      A.equal(T.terminAnlaesse(mehrfach, profile, input.now)[0].art, "bevorstehender-schritt");
    });
    await test("Neue Fassung mit abweichendem oder unklarem Tag sperrt den alten Termin derselben Sitzung", async () => {
      const inhalt = text.replace("11. November", "19. November").split("\nVoten angefordert")[0];
      const link = { url: pd().url, listedDay: "2026-11-06", listedMeeting: "59", revision: 0, visibility: "oeffentlich" };
      const grundfassung = E.tagesordnung(q, link, Buffer.from(inhalt), [inhalt]);
      const anders = inhalt.replace("Mitteilung", "1. Änderungsmitteilung\nDie Tagesordnung wird wie folgt neu gefasst:")
        .replace("19. November", "20. November").replace("21/8119", "21/8118");
      const neufassung = E.tagesordnung(q, { ...link, url: link.url.replace("fixture.pdf", "neufassung.pdf"), revision: 1 },
        Buffer.from(anders), [anders]);
      const jetzt = new Date(now());
      const anlaesse = async (...originale) => {
        stored = [row(E.baueStand(q, [grundfassung, ...originale], jetzt.toISOString(), "a".repeat(64)))];
        const [d] = await T.mitGespeichertenStaenden([doc()], deps());
        return T.terminAnlaesse(d, profile, jetzt).map(a => a.termin);
      };
      A.deepEqual(await anlaesse(), ["2026-11-19"]);
      A.deepEqual(await anlaesse(neufassung), []);
      const unklar = anders.replace("Berlin, den 5.", "Berlin, den 6.").replace(", 10:30 Uhr", ", um 09:00 Uhr");
      const leseUnklar = (pdf, listedMeeting) => E.tagesordnung(q,
        { ...link, url: neufassung.url, listedMeeting, revision: 1, meetingDay: "2026-11-20" }, Buffer.from(pdf), [pdf]);
      const unklareNeufassung = leseUnklar(unklar, "59");
      A.equal(unklareNeufassung.meetings[0].day, null);
      A.deepEqual(await anlaesse(unklareNeufassung), []);
      A.deepEqual(await anlaesse(leseUnklar(unklar, null)), []);
      const andereSitzung = leseUnklar(unklar.replace("59. Sitzung", "60. Sitzung"), "60");
      A.deepEqual(await anlaesse(andereSitzung), ["2026-11-19"]);
      const gueltig = anders.replace("20. November", "19. November").replace("21/8118", "21/8119");
      const spaetereFassung = E.tagesordnung(q, { ...link, url: neufassung.url, revision: 1 }, Buffer.from(gueltig), [gueltig]);
      const frueherUnklar = inhalt.replace("Berlin, den 5.", "Berlin, den 4.").replace(", 10:30 Uhr", ", um 10:30 Uhr");
      const alteFassung = E.tagesordnung(q, { ...link, url: link.url.replace("fixture.pdf", "alte-fassung.pdf") },
        Buffer.from(frueherUnklar), [frueherUnklar]);
      A.deepEqual(await anlaesse(spaetereFassung, alteFassung), ["2026-11-19"]);

      const widerspruch = anders.replace("1. Änderungsmitteilung", "Änderungsmitteilung")
        .replace(", 10:30 Uhr", ", um 09:00 Uhr");
      const zweiteFassung = E.tagesordnung(q, {
        ...link, url: link.url.replace("fixture.pdf", "zweite-fassung.pdf"), revision: 2, meetingDay: "2026-11-20",
      }, Buffer.from(widerspruch), [widerspruch]);
      A.equal(zweiteFassung.publishedDay, spaetereFassung.publishedDay);
      A.equal(zweiteFassung.meetings[0].day, null);
      A(zweiteFassung.conflicts.includes("fassungsnummer-widerspruch"));
      A.deepEqual(await anlaesse(spaetereFassung, zweiteFassung), []);
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
      require.cache[seedPath].exports={...currentSeed,BUNDESTAG_TERMINE_NUTZUNGSBELEGE:[approval,...extra.map(s=>({...approval,id:s.id,url:s.url}))]};
      try{
        const page="Tagesordnung Stand: 12. November 2026\n"+[110,111,112,113].map((n,i)=>`${n}. Sitzung des Deutschen Bundestages\nam Dienstag, dem ${24+i}. November 2026, ${9+i} Uhr`).join("\n")
          +"\nTagesordnungspunkt 9\nSynthetischer Testgegenstand\nDrucksache 21/8119";
        const plenum=E.tagesordnung(extra[0],{url:"https://www.bundestag.de/resource/blob/999998/fixture.pdf",listedMeeting:null,revision:0,visibility:"oeffentlich"},Buffer.from("%PDF-Plenum-Fiktion"),[page]);
        const ics=Buffer.from("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:fixture.test\r\nDTSTAMP:20251216T100654Z\r\nDTSTART;VALUE=DATE:20261123\r\nDTEND;VALUE=DATE:20261128\r\nSUMMARY:Sitzungswoche Deutscher Bundestag\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n");
        const calendar=E.kalender(extra[1],{url:"https://www.bundestag.de/resource/blob/999997/fixture.ics"},ics);
        const stands=[stand(),E.baueStand(extra[0],[plenum],new Date(now()).toISOString(),"a".repeat(64)),E.baueStand(extra[1],[calendar],new Date(now()).toISOString(),"a".repeat(64))];
        const options={...deps(),katalog:()=>katalog([q,...extra]),
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
      require.cache[seedPath].exports=ohneFreigabe;
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
