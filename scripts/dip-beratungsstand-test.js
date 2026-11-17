"use strict";
// Echte produktive Aufrufer und nativer Speichertransport, nur HTTP ersetzt.
const assert=require("node:assert/strict"), fs=require("node:fs"), path=require("node:path"), vm=require("node:vm");
const F=require("../lib/helmut/dip-vorgangsfakten"), B=require("../lib/helmut/dip-beratungsstand");
const DIP=require("../lib/helmut/dip"), S=require("../lib/helmut/storage");
const H=require("../lib/helmut/quellen-hinweis"), D=require("../lib/helmut/dedup"), Scheduler=require("../lib/helmut/scheduler");
const fixture=require("./fixtures/dip-vorgangsfakten-amtlich.json");
const originalPosition=fixture.documents[0], id=originalPosition.vorgang_id;
const copy=v=>structuredClone(v), now=()=>Date.parse("2026-09-20T12:00:00.000Z");
const original={ id:"990099",titel:"Haushalt und Soziales",datum:"2026-09-08",drucksachetyp:"Gesetzentwurf",
  dokumentart:"Drucksache",wahlperiode:21,fundstelle:{ pdf_url:"https://dserver.bundestag.de/btd/21/078/2107860.pdf" },
  vorgangsbezug:[{ id,titel:originalPosition.titel,vorgangstyp:"Gesetzgebung" }] };
const root={ id,typ:"Vorgang",titel:originalPosition.titel,vorgangstyp:"Gesetzgebung",wahlperiode:21,
  beratungsstand:"Überwiesen",datum:"2026-09-08",aktualisiert:"2026-09-20T09:00:00+02:00" };
const env={ DIP_API_KEY:"offline-dip",HELMUT_ANBIETER_STEUERUNG:"on" };
let rows, calls, payload, list, snapshot, passed=0, loseWrite=false, browserHtml="";
const json=v=>new Response(JSON.stringify(v),{ headers:{"content-type":"application/json"} });
async function api(url,opts) {
  calls.push({url,method:opts?.method||"GET"});
  const u=new URL(url); assert.equal(u.origin,"https://search.dip.bundestag.de");
  assert.equal(opts.redirect,"error"); assert.equal(opts.headers.Authorization,"ApiKey offline-dip");
  assert(!url.includes("offline-dip"));
  if (u.pathname.endsWith("/drucksache")) return json({documents:[original],cursor:""});
  if (u.pathname.endsWith("/vorgang/"+id)) return json(payload);
  assert.equal(u.pathname,"/api/v1/vorgangsposition"); assert.equal(u.searchParams.get("f.vorgang"),id);
  return json(list);
}
async function request(endpoint,opts={}) {
  calls.push({url:endpoint,method:opts.method||"GET"});
  const u=new URL(endpoint,"http://localhost"); assert.equal(u.pathname,"/rest/v1/helmut_store");
  if (opts.method==="POST") {
    const row=JSON.parse(opts.body);
    assert.equal(opts.headers.Prefer,"resolution=ignore-duplicates,return=representation");
    if (!rows.has(row.id)) rows.set(row.id,row);
    if (loseWrite) throw Error("Antwort verloren");
    return [row];
  }
  assert(!opts.method || opts.method==="GET");
  const filter=u.searchParams.get("id");
  if (filter.startsWith("eq.")) return rows.has(filter.slice(3)) ? [copy(rows.get(filter.slice(3)))] : [];
  assert(filter.startsWith("like.")); assert.equal(u.searchParams.get("order"),"data->>gelesenAm.desc,id.desc");
  const prefix=filter.slice(5,-1);
  return [...rows.values()].filter(r=>r.id.startsWith(prefix))
    .sort((a,b)=>b.data.gelesenAm.localeCompare(a.data.gelesenAm)).slice(0,1).map(copy);
}
const store=()=>B.speicher({request,storeId:"offline"});
const read=()=>F.lese({vorgangId:id,tag:"2026-09-20"},{env,fetch:api,now,deadlineMs:now()+30000});
const doc=()=>D.toRawDocumentRow(Scheduler.dipDocToRawItem(DIP.normalizeDrucksache(original)));
async function test(name,run) {
  rows=new Map();calls=[];payload=copy(root);list={numFound:1,cursor:"",documents:[copy(originalPosition)]};loseWrite=false;
  await run();passed++;console.log("PASS "+name);
}
function client() {
  // Vorhandenen Client-Bootstrap statt eines zweiten UI-Mocks verwenden.
  const root=path.resolve(__dirname,".."), source=fs.readFileSync(path.join(__dirname,"parlamentsdaten-quellen-ui-test.js"),"utf8");
  const code=source.slice(source.indexOf("function loadClient()"),source.indexOf("\nconst api = loadClient();"))
    .replace("{ renderSourceNotice,","{ renderDipBeratungsstand, renderUiBriefingHero, renderHstandItems, renderSourceNotice,");
  return vm.runInNewContext(code+"\nloadClient()",{root,fs,vm,assert,console,path,URL,URLSearchParams,Intl,Date});
}
async function main() {
  assert.equal(process.env.HELMUT_LOKALER_SCHUTZ,"aktiv");
  await test("Vorgangsidentitaet, Stand, Dokumentdatum, Abrufzeit und Originalposition sind getrennt gebunden",async()=>{
    snapshot=await read();F.pruefeVorgangsstand(snapshot);
    assert.equal(snapshot.vorgang.id,id);assert.equal(snapshot.vorgang.beratungsstand,"Überwiesen");
    assert.equal(snapshot.vorgang.dokumentdatum,"2026-09-08");assert.equal(snapshot.gelesenAm,"2026-09-20T12:00:00.000Z");
    assert.equal(snapshot.positionen[0].beschluesse[0].beschlusstenor,"Überweisung");
    assert.equal(snapshot.positionen[0].ueberweisungen.filter(u=>u.federfuehrung).length,1);
    assert.equal(calls.length,3);assert(!JSON.stringify(snapshot).includes("aktivitaet_anzeige"));
  });
  await test("Falscher Vorgang, fremde Position und zukunftiger Stand ergeben keinen Beleg",async()=>{
    payload.id="123";await assert.rejects(read,/vorgang/);
    payload=copy(root);list.documents[0].vorgang_id="123";await assert.rejects(read,/stand-positionen/);
    list.documents=[copy(originalPosition)];payload.aktualisiert="2026-09-21T09:00:00Z";await assert.rejects(read,/stand-zeit/);
  });
  await test("Begrenzte oder unvollstaendige Positionsliste wird niemals zum vollstaendigen Verlauf",async()=>{
    list.numFound=13;const s=await read();assert.equal(s.positionenVollstaendig,false);assert.deepEqual(s.positionen,[]);
    assert.equal(s.vorgang.beratungsstand,"Überwiesen");
    list.numFound=0;await assert.rejects(read,/positionsliste/);
  });
  await test("Waehrend der Aufnahme geaenderter Vorgang erzeugt keinen gemischten Stand",async()=>{
    let roots=0;
    await assert.rejects(()=>F.lese({vorgangId:id,tag:"2026-09-20"},{env,now,deadlineMs:now()+30000,
      fetch:async(url,opts)=>{
        if(url.includes("/vorgang/") && ++roots===2) payload.beratungsstand="Abgeschlossen";
        return api(url,opts);
      }}),/vorgang-waehrend-abruf-geaendert/);
  });
  await test("Fehlender Beratungsstand bleibt unbekannt; Dokumenttitel erfindet keinen Beschluss",async()=>{
    delete payload.beratungsstand;list.documents[0].beschlussfassung=[];
    const s=await read(), d={...doc(),dipBeratungsstaende:[s]};
    assert.equal(B.anzeige(d)[0].stand,"unbekannt");assert.deepEqual(s.positionen[0].beschluesse,[]);
  });
  await test("Hashdrift, Zusatzfeld und manipulierte Federfuehrung werden verworfen",async()=>{
    const s=await read();for (const change of [x=>x.vorgang.beratungsstand="Abgeschlossen",x=>x.fremd=true,
      x=>x.positionen[0].ueberweisungen[0].federfuehrung="false"]){const b=copy(s);change(b);assert.throws(()=>F.pruefeVorgangsstand(b));}
  });
  await test("Insert-only, bestaetigter Readback und verlorene Schreibantwort erhalten vorhandene Originale",async()=>{
    const s=await read();loseWrite=true;assert.deepEqual(await store().speichern(s),s);
    const before=JSON.stringify([...rows.values()]);await store().speichern(s);assert.equal(JSON.stringify([...rows.values()]),before);
    assert(calls.every(c=>!["PATCH","DELETE"].includes(c.method)));
  });
  await test("Fehlender Ruecklesebeleg ist kein Speichererfolg",async()=>{
    const s=await read(), bad=B.speicher({storeId:"offline",request:async(url,o)=>o?.method==="POST" ? [] : []});
    await assert.rejects(()=>bad.speichern(s),/speicher/);
  });
  await test("Produktleser verwendet nur gespeicherte, exakt verknuepfte Vorgangsbelege",async()=>{
    const s=await read();await store().speichern(s);calls=[];
    const [d]=await B.mitGespeichertenStaenden([doc()],{speicher:store()});
    const view=H.quellenhinweisFelder(d,d.url).dipBeratungsstaende[0];
    assert.equal(view.vorgangId,id);assert.equal(view.folgestand,"unbekannt");assert.equal(view.gelesenAm,s.gelesenAm);
    assert(calls.every(c=>c.method==="GET" && c.url.startsWith("/rest/v1/helmut_store")));
    assert.equal(B.anzeige({...d,source_id:"fremd"}),null);assert.equal(B.anzeige(d,"https://fremd.example/"),null);
    const changed=copy(d);changed.dipBeratungsstaende[0].vorgang.id="123";
    assert.equal(B.anzeige(changed)[0].stand,"unbekannt");
  });
  await test("Fehlende Ablage und Speicherstoerung lassen den Originalinhalt sichtbar, den Folgestand unbekannt",async()=>{
    const d=doc();d.summary="Ein vorhandener amtlicher Originalauszug bleibt unverändert lesbar.";
    const [out]=await B.mitGespeichertenStaenden([d],{speicher:{lesen:async()=>{throw Error("offline");}}});
    assert.equal(out.summary,d.summary);assert.equal(B.anzeige(out)[0].stand,"unbekannt");
  });
  await test("Regulaere Folgeaufnahme ueberspringt frische Belege und erreicht weitere Vorgangsidentitaeten mit demselben Deckel",async()=>{
    const ids=["490001","490002","490003","490004"], seen=[];
    const docs=ids.map(id=>DIP.normalizeDrucksache({...original,vorgangsbezug:[{...original.vorgangsbezug[0],id}]}));
    const deps={env,now,deadlineMs:now()+30000,speicher:store(),fetch:async url=>{
      const u=new URL(url), selected=u.pathname.split("/").at(-1)==="vorgangsposition"
        ? u.searchParams.get("f.vorgang") : u.pathname.split("/").at(-1);
      seen.push(selected);
      return u.pathname.endsWith("/vorgangsposition")
        ? json({numFound:1,cursor:"",documents:[{...originalPosition,vorgang_id:selected}]})
        : json({...root,id:selected});
    }};
    assert.deepEqual(await B.aktualisiere(docs,deps),ids.slice(0,2));assert.equal(rows.size,2);
    assert.deepEqual(await B.aktualisiere(docs,deps),ids.slice(2));assert.equal(rows.size,4);
    assert.equal(seen.length,12);assert(ids.every(id=>seen.filter(v=>v===id).length===3));
    seen.length=0;await B.aktualisiere(docs,{...deps,deadlineMs:now()+24999});assert.equal(seen.length,0);
  });
  await test("Alte DIP-Dokumente ohne Vorgangsreferenz bleiben sichtbar und ausdruecklich unbekannt",async()=>{
    const raw={...original};delete raw.vorgangsbezug;
    const d=D.toRawDocumentRow(Scheduler.dipDocToRawItem(DIP.normalizeDrucksache(raw)));
    const dto={...d,...H.quellenhinweisFelder(d,d.url)};
    assert(client().lageSourceRow(dto).includes("Aktueller Beratungsstand unbekannt"));
    calls=[];assert.deepEqual(await B.mitGespeichertenStaenden([d]),[d]);assert.equal(calls.length,0);
    const legacy=copy(d);delete legacy.raw.helmutDipQuellfelder;
    assert(client().lageSourceRow({...legacy,...H.quellenhinweisFelder(legacy,legacy.url)}).includes("Aktueller Beratungsstand unbekannt"));
    assert.equal(B.anzeige(legacy,"https://fremd.example/"),null);
    assert.equal(B.anzeige({...legacy,source_id:"fremd"}),null);
  });
  await test("Echter Lage-/Briefing-/Radar-Quellenrenderer zeigt Datum, Beschluss, Ueberweisung und getrennte sichere Links",async()=>{
    const s=await read(), d={...doc(),dipBeratungsstaende:[s]}, view=H.quellenhinweisFelder(d,d.url);
    const dto={...d,...view,name:"DIP",sourceName:"DIP",sourceUrl:d.url,itemUrl:d.url,href:d.url,publishedAt:d.published_at};
    const L=require("../lib/helmut/lage"), C=require("../lib/helmut/briefingContract"), R=require("../lib/helmut/radarState");
    const ko={id:"offline-ko",vorgang_id:"offline-vorgang",understanding_status:"complete",status:"neu",display_title:d.title};
    const contract=R.buildCurrentRadarState({profile:{id:"offline-mandat"},now:new Date(now()),
      decisions:[{knowledge_object_id:ko.id,score:50,decision:"Beobachten",matched_features:[]}],
      kosById:{[ko.id]:ko},sourcesByVorgang:{[ko.vorgang_id]:[d]}});
    const radar=contract.articles[0];assert(radar);
    assert.deepEqual(radar.dipBeratungsstaende,view.dipBeratungsstaende);
    assert.deepEqual(C.oeffnendeHelmutQuelle(ko,[d]).dipBeratungsstaende,view.dipBeratungsstaende);
    const ui=client();for(const [render,serverDto] of [[ui.lageSourceRow,L.mapSource(d)],
      [ui.vsheetSourceRow,C.buildSources(ko,[d])[0]],[ui.renderRadarArticleRow,radar]]){
      const html=render(serverDto);assert(html.includes("data-dip-beratungsstand"));assert(html.includes("Spätere Änderungen sind nicht bestätigt"));
      assert(html.includes("2026-09-08"));assert(html.includes("mit Federführung"));assert(html.includes("ohne Federführung"));
      assert(html.includes("Beschluss: Überweisung"));assert(html.includes("Originalbeleg"));
      assert(html.includes("Deutscher Bundestag · Plenarprotokoll"));
      assert(html.includes("Deutscher Bundestag/Bundesrat – DIP"));assert(html.includes("Originaldaten kostenlos"));
      assert(html.includes("für diese Anzeige ausgewählt und gegliedert"));
      browserHtml+=html;
    }
    const bad=copy(dto);bad.dipBeratungsstaende[0].originalUrl="https://fremd.example/";assert.equal(ui.renderDipBeratungsstand(bad,d.url),"");
  });
  await test("Bundesratsbeschluss, Fortsetzung und Nachtrag verlieren ihre Institution und Einschraenkung nicht",async()=>{
    // Deklarierter synthetischer Gegenfall, kein neuer amtlicher Bundesratsbeleg.
    const p=list.documents[0];p.zuordnung="BR";p.fundstelle.herausgeber="BR";
    p.fundstelle.pdf_url="https://dserver.bundestag.de/brp/26/0000-26.pdf";
    p.fortsetzung=true;p.nachtrag=true;
    const s=await read(),d={...doc(),dipBeratungsstaende:[s]}, dto={...d,...H.quellenhinweisFelder(d,d.url)};
    const html=client().lageSourceRow(dto);
    assert(html.includes("Bundesrat · Plenarprotokoll · Fortsetzung · Nachtrag"));
    assert(!html.includes("Deutscher Bundestag · Plenarprotokoll"));
    assert(html.includes(p.fundstelle.pdf_url));assert(html.includes("Beschluss: Überweisung"));
  });
  await test("Sichtbarer Radarvertrag behaelt DIP-Stand auch nach erneuter Artikelbindung",async()=>{
    // Deklarierte synthetische Drucksache, amtliche Positionsfixture unveraendert.
    payload.datum="2026-09-19";const s=await read();
    const fresh=D.toRawDocumentRow(Scheduler.dipDocToRawItem(DIP.normalizeDrucksache({...original,
      titel:"Alex Beispiel zu Haushalt und Soziales",datum:"2026-09-19"})));
    const d={...fresh,dipBeratungsstaende:[s]}, R=require("../lib/helmut/radarState"), C=require("../lib/helmut/briefingContract");
    const ko={id:"offline-person-ko",vorgang_id:"offline-person-vorgang",understanding_status:"complete",status:"neu",
      display_title:d.title,mentioned_people:["Alex Beispiel"]};
    const args={profile:{id:"offline-mandat",fullName:"Alex Beispiel"},now:new Date(now()),
      decisions:[{knowledge_object_id:ko.id,score:50,decision:"Beobachten",matched_features:[]}],
      kosById:{[ko.id]:ko},sourcesByVorgang:{[ko.vorgang_id]:[d]}};
    const r=R.buildCurrentRadarState(args), visible=r.anzeige.mentions[0];assert(visible);
    assert.deepEqual(visible.dipBeratungsstaende,H.quellenhinweisFelder(d,d.url).dipBeratungsstaende);
    const ui=client(), html=ui.renderRadarMentionCard(visible);assert(html.includes("Beschluss: Überweisung"));
    const source=C.oeffnendeHelmutQuelle(ko,[d]);
    const sourceItem={...source,title:d.title,sourceUrl:source.url};
    assert(ui.renderHstandPrimary({primaryItem:sourceItem}).includes("Beschluss: Überweisung"));
    assert(ui.renderUiBriefingHero({primaryItem:sourceItem}).includes("Beschluss: Überweisung"));
    assert(ui.renderHstandItems({items:[sourceItem]}).includes("Beschluss: Überweisung"));
    browserHtml+=html+ui.renderUiBriefingHero({primaryItem:sourceItem})+ui.renderHstandItems({items:[sourceItem]});
    // Ein Beratungsstand oder eine Nennung allein darf keine Tagesprioritaet erzeugen.
    assert.equal(C.buildCurrentHelmutState(args).primaryItem,null);
  });
  if(process.argv.includes("--browser")) {
    const {spawn}=require("node:child_process");
    const root=path.resolve(__dirname,".."), runner=fs.readFileSync(path.join(__dirname,"ui-preview-browser-check.js"),"utf8");
    const start=runner.indexOf("class CDP {"),end=runner.indexOf("\nasync function main()",start);
    assert(start>=0&&end>start);
    const CDP=vm.runInNewContext(runner.slice(start,end)+"\nCDP",{setTimeout,clearTimeout});
    const dir=fs.mkdtempSync(path.join(require("node:os").tmpdir(),"dip-browser-"));
    const chrome=spawn("/usr/bin/chromium",["--headless","--no-sandbox","--disable-dev-shm-usage","--remote-debugging-pipe",
      "--disable-background-networking","--disable-component-update","--disable-sync","--no-first-run","--no-proxy-server",
      "--disable-features=Translate,MediaRouter,OptimizationHints","--user-data-dir="+dir],
      {env:{PATH:process.env.PATH,HOME:dir},stdio:["ignore","ignore","pipe","pipe","pipe"]});
    chrome.stderr.resume();const cdp=new CDP(chrome);
    try {
      const target=await cdp.send("Target.createTarget",{url:"about:blank"});
      const {sessionId}=await cdp.send("Target.attachToTarget",{targetId:target.targetId,flatten:true});
      await cdp.send("Page.enable",{},sessionId);await cdp.send("Runtime.enable",{},sessionId);
      await cdp.send("Network.enable",{},sessionId);await cdp.send("Network.setBlockedURLs",{urls:["*"]},sessionId);
      await cdp.send("Network.emulateNetworkConditions",{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0},sessionId);
      const {frameTree}=await cdp.send("Page.getFrameTree",{},sessionId);
      const css=fs.readFileSync(path.join(root,"styles.css"),"utf8");
      for(const width of [390,1280]) {
        await cdp.send("Emulation.setDeviceMetricsOverride",{width,height:844,deviceScaleFactor:1,mobile:width<500},sessionId);
        await cdp.send("Page.setDocumentContent",{frameId:frameTree.frame.id,html:`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>${css}</style><main style="padding:16px;max-width:800px">${browserHtml}</main>`},sessionId);
        const state=await cdp.evaluate(sessionId,"({count:document.querySelectorAll('[data-dip-beratungsstand]').length,nested:document.querySelectorAll('a a').length,text:document.body.innerText,width:document.documentElement.scrollWidth,view:innerWidth})");
        assert.equal(state.count,6);assert.equal(state.nested,0);assert(state.text.includes("Spätere Änderungen sind nicht bestätigt"));
        assert(state.width<=state.view,JSON.stringify({width:state.width,view:state.view}));
      }
      console.log("PASS echter Chromium Desktop/Mobil: drei Quellenansichten plus sichtbarer Radar und Briefing-Haupt-/Folgeitem, Folgestandhinweis, sichere getrennte Links, kein Ueberlauf; Renderer-Netz offline.");
    } finally {await cdp.send("Browser.close").catch(()=>{});chrome.kill("SIGTERM");fs.rmSync(dir,{recursive:true,force:true});}
  }
  await test("Regulaerer DIP-Aufrufer bindet Anbieterwache, wirklichen Faktenleser, Originalablage und Produktleser",async()=>{
    const A=require("../lib/helmut/anbieter-steuerung"), old={reserviere:A.reserviere,melde:A.melde,starteLeaseWache:A.starteLeaseWache};
    const oldRequest=S.supabaseRequest;let admits=0;const savedEnv={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY,HELMUT_SUPABASE_STORE_ID:process.env.HELMUT_SUPABASE_STORE_ID};
    A.reserviere=async()=>{admits++;return {erlaubt:true};};A.melde=async()=>({});
    A.starteLeaseWache=()=>({signal:new AbortController().signal,verloren:()=>false,beenden(){}});
    S.supabaseRequest=request;process.env.HELMUT_SUPABASE_STORE_ID="offline";
    try {
      const docs=await DIP.getQueueDocuments({committee:"Haushalt"},{env,now,deadlineMs:now()+30000,fetch:api});
      assert.equal(docs.length,1);assert.equal(admits,4);assert.equal(rows.size,1);
      const native=doc();calls=[];
      const [out]=await B.mitGespeichertenStaenden([native]);assert.equal(H.quellenhinweisFelder(out,out.url).dipBeratungsstaende[0].stand,"Überwiesen");
      assert(calls.every(c=>c.method==="GET"));
      // Dokumentcache bleibt nutzbar, aber erlaubt keine unbewachten Metadatenabrufe.
      calls=[];rows.clear();admits=0;A.reserviere=async()=>{admits++;return {erlaubt:false};};
      const cached=await DIP.getQueueDocuments({committee:"Haushalt"},{env,now,deadlineMs:now()+30000,fetch:api});
      assert.equal(cached.length,1);assert.equal(admits,1);assert.equal(rows.size,0);
      assert(calls.every(c=>c.url.startsWith("/rest/v1/helmut_store")));
    } finally {Object.assign(A,old);S.supabaseRequest=oldRequest;for(const[k,v]of Object.entries(savedEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
  });
  await test("Nativer produktseitiger Storage-Leser liefert den gebundenen Stand ohne Quellen- oder Modellabruf",async()=>{
    const s=await read();await store().speichern(s);const native=doc();
    const keys=["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","HELMUT_V3_STORE","HELMUT_SUPABASE_STORE_ID"];
    const oldEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]])), oldFetch=global.fetch;
    process.env.SUPABASE_URL="https://offline.invalid";process.env.SUPABASE_SERVICE_ROLE_KEY="offline";
    process.env.HELMUT_V3_STORE="1";process.env.HELMUT_SUPABASE_STORE_ID="offline";
    calls=[];
    global.fetch=async(url,opts)=>{
      const u=new URL(url);assert.equal(u.origin,"https://offline.invalid");
      assert(!opts.method || opts.method==="GET");
      if(u.pathname==="/rest/v1/ko_document_links") return json([{raw_documents:native}]);
      return json(await request(u.pathname+u.search,opts));
    };
    try {
      const docs=await S.getSourcesForVorgang("declared-offline-vorgang",{strict:true});
      assert.equal(docs.length,1);assert.equal(H.quellenhinweisFelder(docs[0],docs[0].url).dipBeratungsstaende[0].vorgangId,id);
      assert(calls.every(c=>c.method==="GET"));
    } finally {global.fetch=oldFetch;for(const[k,v]of Object.entries(oldEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
  });
  console.log(`${passed}/${passed} gezielte DIP-Integrationsgruppen bestanden; keine Production-/Modellaufrufe.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
