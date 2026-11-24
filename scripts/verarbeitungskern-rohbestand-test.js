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
function attrappe(mode){
  const rows=new Map(),archive=new Map(),calls=[],findings=[];
  const request=async(url,opts={})=>{
    calls.push([url,opts.method||"GET"]);const method=opts.method||"GET";
    if(url.startsWith("/rest/v1/raw_documents")){
      if(method==="POST"){
        const batch=JSON.parse(opts.body);
        if(["batch","findings-fk","findings-write"].includes(mode)&&batch.some(r=>r.id===badId))throw Error("eine ungueltige Zeile");
        const neu=batch.filter(row=>!rows.has(row.id));
        for(const row of neu)rows.set(row.id,row);return neu.map(r=>({id:r.id}));
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
    if(url.startsWith("/rest/v1/document_findings")){
      const batch=JSON.parse(opts.body);
      // Wie der echte FK: eine fehlende Rohzeile verwirft den gesamten Batch.
      if(batch.some(row=>!rows.has(row.raw_document_id)))throw Error("document_findings_raw_document_id_fkey");
      if(mode==="findings-write")throw Error("Fundstellenantwort nicht bestaetigt");
      findings.push(...batch);return [];
    }
    throw Error("unerwarteter Zugriff "+url);
  };
  const context={require:req,process:{env:{HELMUT_SCALABLE_PIPELINE:"on"}},Buffer,Map,Set,Date,console,
    v3StoreReady:()=>true,v3SkipReason:()=>"offline",supabaseStoreId:"main",supabaseRequest:request,
    RAW_DOCUMENT_BULK_CHUNK:100,RAW_DOC_ID_CHUNK:100,
    V3_RAW_DOCUMENT_COLUMNS:Object.keys(normalized[0]),pickColumns:(row,cols)=>Object.fromEntries(cols.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]))};
  const persist=vm.runInNewContext(code+"\npersistiereRohdokumenteWarteschlange",context);
  return {persist,rows,archive,calls,findings,request};
}
async function scenario(mode){
  if (mode === "hib") return pruefeHibFund();
  const {persist,rows,archive,calls,findings}=attrappe(mode);
  const result=await persist(items);
  A.equal(result.ok,false);A.deepEqual(Array.from(result.bestaetigteIds),[goodId]);
  A.equal(result.artikelFehler.length,1);A.equal(result.artikelFehler[0].id,badId);
  A.match(result.artikelFehler[0].stand,/^[a-f0-9]{64}$/);A.equal(result.artikelFehler[0].grund,"quellenstand-nicht-bestaetigt");
  A.equal(result.quellenversionen.length,1);A.equal(result.quellenversionen[0].id,goodId);
  A.ok(archive.size>0);A.ok(calls.every(([url])=>!url.includes("main-auth")));
  if(mode==="findings-fk"){
    A.equal(result.fundstellenBestaetigt,true);
    A.deepEqual(findings.map(row=>row.raw_document_id),[goodId]);
    A.equal(rows.has(badId),false);
  }
  if(mode==="findings-write"){
    A.equal(result.fundstellenBestaetigt,false);A.equal(findings.length,0);
    const P=require("../lib/helmut/scalable-pipeline"),children=[];
    await A.rejects(P.HANDLER.source_fetch({id:"synthetischer-quellenjob",freshnessWindow:"2026-11-13T00Z",payload:{quelle:{id:"quelle-test"}}},{
      env:{HELMUT_SCALABLE_PIPELINE:"on"},now:()=>Date.parse("2026-11-13T04:00:00Z"),
      klassen:{belege:async()=>({erlaubt:true,slot:"synthetisch"}),gebeFrei:async()=>{}},
      hardeningConfig:()=>({enabled:false}),crawlAllSources:async()=>({rawItems:items,results:[{ok:true}]}),
      ladeRohdokumentStaende:async(ids,staende)=>[...archive.values()].map(r=>r.data)
        .filter(r=>ids.includes(r.dokument.id)&&staende[r.dokument.id]===r.quellenHash).map(r=>r.dokument),
      persistRohdokumente:async()=>result,enqueue:async job=>{children.push(job);return {verfuegbar:true,id:"synthetisches-kind",neu:true};}
    }),/fundstellen-persistenz-nicht-bestaetigt/);
    A.equal(children.length,2);A.equal(children.filter(job=>job.payload.artikelFehler).length,1);
  }
  if(mode==="batch"){
    const write=calls.findIndex(([url,method])=>url.includes("raw_documents")&&method==="POST");
    const next=calls[write+1];A.equal(next[1],"GET");A.match(next[0],/id=eq./);
  }
}
async function pruefeHibFund() {
  const { persist, rows, archive, request } = attrappe("hib");
  const D = req("./dedup"), R = req("./roh-quellenstaende"), P = req("./scalable-pipeline");
  const amtlich = { ...items[1], url: "https://www.bundestag.de/presse/hib/kurzmeldungen-1234",
    sourceId: "bundestag", sourceName: "Bundestag", sourceType: "bundestag", linkType: "direct", retrievalPathId: "rp-bundestag" };
  const suche = { ...amtlich, title: amtlich.title + " - Deutscher Bundestag", summary: null,
    sourceId: "general-hib", sourceName: "Deutscher Bundestag", retrievalPathId: "rp-general-hib", publishedAt: "2026-11-13T04:04:00Z" };
  const row = D.toRawDocumentRow(amtlich), originalHash = R.standHash(row), suchHash = R.standHash(D.toRawDocumentRow(suche));
  const now = () => Date.parse("2026-11-13T05:00:00Z");
  const jobs = new Map(), enqueues = [];
  const enqueue = async job => {
    enqueues.push(job);
    const neu = !jobs.has(job.idempotencyKey);
    if (neu) jobs.set(job.idempotencyKey, { id: "00000000-0000-4000-8000-" + String(jobs.size + 1).padStart(12, "0"),
      status: "wartend", finished_at: null, tenant_id: job.tenantId, job_type: job.jobType,
      idempotency_key: job.idempotencyKey, payload: structuredClone(job.payload) });
    return { verfuegbar: true, neu, id: jobs.get(job.idempotencyKey).id };
  };
  let abschlussLesungen = 0;
  const leseAbschluss = async (path, options) => {
    abschlussLesungen++;
    A.equal(options, undefined);
    const url = new URL(path, "https://local.invalid"), query = url.searchParams;
    A.equal(url.pathname, "/rest/v1/helmut_jobs");
    A.equal(query.get("job_type"), "eq.document_understanding");
    A.equal(query.get("tenant_id"), "is.null"); A.equal(query.get("status"), "eq.erledigt");
    const job = jobs.get(query.get("idempotency_key").slice(3));
    return job?.status === "erledigt" ? [job] : [];
  };
  const aktuelleZeile = () => [rows.get(row.id)];
  const run = (input, lesen = request, ladeAktuell = aktuelleZeile, jobLeser = leseAbschluss) => P.HANDLER.source_fetch({
    id: "synthetische-quelle", freshnessWindow: "2026-11-13T00Z", payload: { art: "geteilt", quelle: { id: "fixture" } } }, {
    env: { HELMUT_SCALABLE_PIPELINE: "on" }, now, hardeningConfig: () => ({ enabled: false }),
    request: jobLeser, crawlAllSources: async () => ({ rawItems: [input].flat(), results: [{ ok: true, items: [input].flat() }] }),
    persistRohdokumente: persist, ladeRohdokumentStaende: (ids, hashes) => req("./storage").ladeRohdokumentStaende(ids, hashes, {
      ladeAktuell, request: lesen
    }), enqueue, klassen: { belege: async () => ({ erlaubt: true, slot: "synthetisch" }), gebeFrei: async () => {} }
  });
  const erster = await run(amtlich), key = enqueues[0].idempotencyKey, erledigt = jobs.get(key);
  erledigt.status = "erledigt"; erledigt.finished_at = new Date(now() - 1000).toISOString();
  Object.assign(erledigt.payload, { quellenRestDokumentIds: [], quellenAbschnitte: {} });
  enqueues.length = 0;
  const wieder = await run(suche);
  A.equal(abschlussLesungen, 1);
  A.deepEqual(enqueues, []);
  A.notEqual(originalHash, suchHash);
  A.equal(erster.abrufErgebnis.analyse.length, 1);
  A.equal(erster.abrufErgebnis.analyse[0].stand, originalHash);
  A.deepEqual(wieder.abrufErgebnis.analyse, erster.abrufErgebnis.analyse);
  A.equal(wieder.teilfehler, undefined);
  A.equal(archive.size, 2);
  A.deepEqual(rows.get(row.id), row);
  jobs.delete(key);
  for (const status of [null, "wartend"]) {
    if (status) jobs.set(key, { ...erledigt, status });
    const offen = await run(suche);
    A.equal(offen.teilfehler, undefined);
    A.equal(offen.abrufErgebnis.analyse.length, 1);
    A.equal(offen.abrufErgebnis.analyse[0].stand, suchHash);
    A(enqueues.every(j => j.payload.artikelFehler === undefined));
  }
  const lesungenVorDoppelbeobachtung = abschlussLesungen;
  enqueues.length = 0;
  A.deepEqual((await run([suche, amtlich])).abrufErgebnis.analyse, erster.abrufErgebnis.analyse);
  A.deepEqual(enqueues.map(j => j.idempotencyKey), [key]);
  A.equal(abschlussLesungen, lesungenVorDoppelbeobachtung);
  for (const abweichung of [{ tenant_id: "fremd" }, { status: "laeuft" }, { id: "falsch" },
    { idempotency_key: key + "falsch" }, { finished_at: null }, { payload: { ...erledigt.payload, quellenstaende: { [row.id]: suchHash } } },
    { payload: { ...erledigt.payload, quellenRestDokumentIds: [row.id] } }]) {
    await A.rejects(run(suche, request, aktuelleZeile, () => [{ ...erledigt, ...abweichung }]), /verstehen-nicht-eingereiht/);
  }
  await A.rejects(run(suche, request, aktuelleZeile, () => [erledigt, erledigt]), /verstehen-nicht-eingereiht/);
  for (const item of [{ ...suche, summary: items[1].summary }, { ...suche, retrievalPathId: null },
    { ...suche, title: "Abweichende Meldung" }, { ...suche, publishedAt: "2026-11-13T04:16:00Z" }]) {
    const result = await run(item);
    A.equal(result.teilfehler, undefined);
    A.equal((result.abrufErgebnis?.analyse || []).length, 1);
  }
  await A.rejects(run(suche, url => url.includes(originalHash) ? [] : request(url)), /verstehen-nicht-eingereiht/);
  await A.rejects(run(suche, request, () => [row, { ...row, title: "Anderer Artikel" }]), /verstehen-nicht-eingereiht/);
}
(async()=>{
  const only=process.argv.find(arg=>arg.startsWith("--only="))?.slice(7);let n=0;
  for(const [mode,name] of [["archive","einzelner Archivfehler erhaelt folgenden brauchbaren Artikel"],
    ["batch","ungueltige Batchzeile wird nach Lesebestaetigung isoliert"],
    ["missing","ein fehlender Rohdatensatz blockiert bestaetigte Nachbarn nicht"],
    ["findings-fk","abgewiesene Rohzeile verwirft Fundstellen guter Nachbarn nicht"],
    ["findings-write","echter Fundstellenfehler behaelt Kinder, beendet Quelle aber nicht erfolgreich"],
    ["hib","textloser hib-Indexfund belegt denselben amtlichen Job mit seinem eigenen Archivhash"]]){
    if(only&&only!==mode)continue;await scenario(mode);console.log("PASS "+name);n++;
  }
  console.log(`${n}/${n} gezielte Rohartikelpruefungen bestanden.`);
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
