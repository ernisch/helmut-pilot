"use strict";

// Ein begrenzter Quellenreparaturschritt im bestehenden manuellen Controller.
// Nur bei geschlossener Kohorte; keinerlei Textmodellaufruf oder Auftragseinreihung.
const D = require("../lib/helmut/testkohorte-direkt500");
const Q = require("../lib/helmut/lage-quellenbeleg");
const E = require("../lib/helmut/quellen-auszug");
const { PROJECT_URL, kostenBefund } = require("./github-fachzyklus-a");
const LOCK = "500-quellenkontext", MAX_FETCH = 40, MAX_MS = 480000;
const payloadHash = s => D.hash({ mandate:s.mandate, identitaeten:s.identitaeten, users:s.auth.users });

function pruefeQuellenKosten(auth, counter, tag, config) {
  const kosten = kostenBefund(auth, counter, tag);
  D.fordere(kosten.aufrufbelege <= kosten.reservierungen, "quellenkontext-kosten-unklar");
  if (auth.testKostenTage?.[tag]) {
    D.fordere(config.testKosten?.version === 2 && config.testKosten.aktiv === true
      && config.testKosten.limitUsd === 4 && config.testKosten.unbekanntBleibtReserviert === true,
    "quellenkontext-kostenregel-abweichend");
    try { Object.assign(kosten, require("../lib/helmut/testkosten-budget")
      // Fehlende Nutzungszeilen sind unbekannte Kosten. Jede braucht eine
      // eigene volle Reserve; die Ticketdeckung gilt fuer den echten Zaehler.
      .kontrolliere(auth, tag, kosten.unbekannteKosten + kosten.reservierungsluecke,
        kosten.reservierungen)); }
    catch { D.fordere(false, "quellenkontext-kosten-unklar"); }
  } else D.fordere(kosten.reservierungsluecke === 0 && kosten.unbekannteKosten === 0,
    "quellenkontext-kosten-unklar");
  return kosten;
}

async function mapBounded(items, fn, parallel = 5) {
  const result = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({length:Math.min(parallel,items.length)}, async () => {
    while (cursor < items.length) { const i = cursor++; result[i] = await fn(items[i],i); }
  }));
  return result;
}
function publisherHost(url) {
  try {
    const u = new URL(url), host = u.hostname.replace(/^www\./, "");
    if (u.protocol !== "https:" || u.username || u.password || u.port
      || require("node:net").isIP(host.replace(/^\[|\]$/g,""))
      || !/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(host)
      || /(?:^|\.)(?:localhost|local|internal|invalid|test|example)$/i.test(host)) return null;
    return host;
  } catch { return null; }
}
function plannedAfter(before, result, meta) {
  D.fordere(before && !before.summary, "quellenauszug-bereits-vorhanden");
  D.fordere(before.raw===null || (before.raw && typeof before.raw==="object" && !Array.isArray(before.raw)),
    "quellenkontext-altmetadaten-ungueltig");
  D.fordere(!result.ok || (typeof result.summary === "string" && result.summary.length <= E.MAX), "quellenauszug-ungueltig");
  return { ...before, ...(result.ok ? {summary:result.summary} : {}),
    raw:{...(before.raw || {}),helmutQuellenkontext:{version:1,...meta,
      status:result.ok ? "ergaenzt" : result.reason,
      methode:result.method || null, herkunft:result.origin || null,
      auszugHash:result.ok ? D.hash(result.summary) : null,
      ...(before.raw?.helmutQuellenkontext ? {vorherigerVersuch:before.raw.helmutQuellenkontext} : {})}} };
}
function casQuery(before) {
  // Auch die Artikelidentitaet muss noch zum geprueften Inhalt passen.
  return ["id", "summary", "raw", "url", "canonical_url", "title", "published_at", "content_hash"]
    .map(key => {
      D.fordere(before[key] !== undefined, "quellenkontext-cas-feld-fehlt");
      return key + "=" + (before[key] === null ? "is.null" : "eq." +
        encodeURIComponent(key === "raw" ? JSON.stringify(before[key]) : String(before[key])));
    }).join("&");
}
async function ausfuehren({ bestand, config, env, db, fetchFn, now, pruefeBetrieb, snapshot,
  fortschritt = null, deps = {} }) {
  const start=now(), end=start.getTime()+MAX_MS, tag=start.toISOString().slice(0,10);
  const report={...D.plan("quellenkontext"),ok:false,ausgeloest:false,zustandUnbekannt:false,modellaufrufe:null,
    gepruefteProfile:0,geplanteQuellen:0,artikelAbrufe:0,ergaenzt:0,nichtErgaenzbar:0,bereitsGeprueft:0};
  let locked=false, patchPending=false;
  const storage=deps.storage || require("../lib/helmut/storage");
  const read=async path=>{ D.fordere(now().getTime()+20000<end,"quellenkontext-zeitbudget"); return db(path); };
  try {
    D.fordere(config.quellenkontext?.version===1 && config.quellenkontext.scoring==="off"
      && config.quellenkontext.relevanzordnung===false && config.quellenkontext.koScan===500
      && config.quellenkontext.lageMax===12 && config.quellenkontext.relevanzTage===14 && config.quellenkontext.atomicLock===true,
    "quellenkontext-lesepfad-nicht-bestaetigt");
    D.fordere(config.quellenkontext.sourceSafetyStandard===true
      && ![process.env.HELMUT_SOURCE_BLOCKLIST,process.env.HELMUT_SOURCE_ALLOWLIST]
        .some(v=>String(v||"").split(",").some(x=>x.trim())),"quellenkontext-quellenschutz-abweichend");
    D.fordere(require("../lib/helmut/scoring").scoringMode()==="off"
      && !require("../lib/helmut/relevanzordnung").relevanzordnungAktiv()
      && Number(process.env.HELMUT_KO_SCAN_LIMIT||500)===500
      && Number(process.env.HELMUT_LAGE_MAX_VORGAENGE||12)===12
      && require("../lib/helmut/briefing-frische").relevanzTage()===14,"quellenkontext-lokaler-lesepfad-abweichend");
    D.fordere(env.GITHUB_RUN_ATTEMPT==="1" && /^[0-9]{5,20}$/.test(env.GITHUB_RUN_ID||""),"quellenkontext-keine-wiederholung");
    D.fordere(new Date(end+60000).toISOString().slice(0,10)===tag,"quellenkontext-tageswechsel");
    const F=require("../lib/helmut/funktionstest-500");
    D.fordere(F.pruefeStartfenster({startUtc:start.toISOString(),dauerMinuten:10,
      crons:require("../vercel.json").crons,maxLaufzeitMs:480000}).startErlaubt,"quellenkontext-cronkonkurrenz");
    const target=bestand.mandate.filter(p=>D.ALLE_KENNUNGEN.includes(p.user_id)||p.aktiv);
    D.fordere(target.length===500 && target.filter(p=>p.aktiv).length===5,"quellenkontext-zielmenge-abweichend");
    const profileHash=payloadHash(bestand), counterBefore=await read("llm_budget_counters?select=used&scope=eq.global&day=eq."+tag);
    D.fordere(counterBefore.length===1,"quellenkontext-kostenzaehler-fehlt");
    const costBefore=pruefeQuellenKosten(bestand.auth,counterBefore[0].used,tag,config);
    const kostenbuchHash=D.hash(bestand.auth.testKostenTage?.[tag] || null);
    locked=await storage.acquirePipelineLock(LOCK,600000);
    D.fordere(locked,"quellenkontext-bereits-aktiv");
    const guard=async(reserve=120000)=>{
      D.fordere(now().getTime()+reserve<end && now().toISOString().slice(0,10)===tag,"quellenkontext-zeitbudget");
      await pruefeBetrieb(LOCK);
      const own=await read("pipeline_locks?select=job_name&job_name=eq."+LOCK+"&expires_at=gt."+encodeURIComponent(now().toISOString()));
      D.fordere(own.length===1,"quellenkontext-sperre-verloren");
    };
    await guard();
    const kos=await storage.listKnowledgeObjects({limit:500,_signalError:true});
    D.fordere(Array.isArray(kos),"quellenkontext-vorgaenge-unlesbar");
    const matchRows=[];
    for(let i=0;i<target.length;i+=50){
      const ids=target.slice(i,i+50).map(p=>p.user_id);
      const rows=await read("matching_results?select=*&aktuell=is.true&user_id=in.("
        +encodeURIComponent(ids.map(id=>JSON.stringify(id)).join(","))+ ")&order=user_id.asc,rank.asc.nullslast,id.asc&limit=2001");
      D.fordere(rows.length<2001 && rows.every(r=>ids.includes(r.user_id)),"quellenkontext-treffer-unvollstaendig");
      matchRows.push(...rows);
    }
    const lage=require("../lib/helmut/lage"), matcher=require("../lib/helmut/matching").matchProfileToKnowledgeObjects;
    const profiles=new Map(bestand.identitaeten.map(p=>[p.id,p]));
    // Derselbe gezielte Leser wie im Lagepfad. Geteilte Treffer werden in
    // diesem einen Lauf nur einmal gelesen, auch wenn viele Profile sie nutzen.
    const koCache=new Map(kos.map(k=>[k.id,k]));
    const leseTreffer=async ids=>{
      const fehlend=[...new Set(ids.filter(id=>!koCache.has(id)))];
      if(fehlend.length){
        const rows=await storage.listKnowledgeObjectsByIds(fehlend);
        D.fordere(Array.isArray(rows)&&rows.every(k=>k&&fehlend.includes(k.id))
          &&new Set(rows.map(k=>k.id)).size===rows.length,"quellenkontext-treffer-unlesbar");
        fehlend.forEach(id=>koCache.set(id,null));
        rows.forEach(k=>koCache.set(k.id,k));
      }
      return ids.map(id=>koCache.get(id)).filter(Boolean);
    };
    const ranked=[];
    for(const m of target){
      D.fordere(now().getTime()+120000<end,"quellenkontext-zeitbudget");
      const p=storage.fromMandateProfileRow(profiles.get(m.user_id),m);
      ranked.push(await lage.loadRankedVorgaenge({listKnowledgeObjects:async()=>kos,
        listKnowledgeObjectsByIds:leseTreffer,
        listMatchingResults:async()=>matchRows.filter(r=>r.user_id===p.id).slice(0,12)},matcher,p,p.id));
    }
    report.gepruefteProfile=ranked.length;
    const unique=[...new Map(ranked.flat().map(k=>[k.vorgang_id,k])).values()];
    const sources=Object.fromEntries(await mapBounded(unique,async k=>{
      D.fordere(now().getTime()+120000<end,"quellenkontext-zeitbudget");
      // Gleicher Quellenzugriff wie storage.getSourcesForVorgang, aber ein
      // Transportfehler darf hier nicht als leere Quellenliste weiterlaufen.
      const select="raw_documents(id,title,url,canonical_url,source_name,source_type,published_at,document_type,link_type,confidence,summary)";
      const rows=await read("ko_document_links?knowledge_object_id=eq."+encodeURIComponent("ko-"+k.vorgang_id)
        +"&select="+select+"&limit=40");
      D.fordere(rows.length<=40 && rows.every(r=>r?.raw_documents?.id),"quellenkontext-quellen-unvollstaendig");
      const docs=rows.map(r=>r.raw_documents).sort((a,b)=>String(b.published_at||"").localeCompare(String(a.published_at||"")));
      return [k.vorgang_id,docs];
    }));
    const safety=require("../lib/helmut/sourceSafety");
    const inputs=()=>ranked.map(list=>Q.baueEingabe(list.filter(k=>
      safety.guardKnowledgeObject(k,sources[k.vorgang_id]||[]).status!=="quarantine"),sources,start));
    const sourceIds=new Set();
    for(const input of inputs()) for(const v of input) for(const q of v.quellenbelege){
      const row=(sources[v.vorgang_id]||[]).find(d=>d.url===q.url || d.canonical_url===q.url);
      D.fordere(row?.id,"quellenkontext-quellbindung-fehlt");sourceIds.add(row.id);
    }
    report.geplanteQuellen=sourceIds.size;
    D.fordere(sourceIds.size>0 && sourceIds.size<=500,"quellenkontext-quellenumfang-abweichend");
    const allDocs=[...new Map(Object.values(sources).flat().map(d=>[d.id,d])).values()];
    const plan=allDocs.filter(d=>sourceIds.has(d.id)&&!d.summary).sort((a,b)=>a.id.localeCompare(b.id));
    report.leereQuellenVorher=plan.length;
    for(const document of plan){
      if(report.ergaenzt+report.nichtErgaenzbar>=MAX_FETCH || now().getTime()+120000>=end) break;
      await guard();
      const rows=await read("raw_documents?select=*&id=eq."+encodeURIComponent(document.id)+"&limit=2");
      D.fordere(rows.length===1,"quellenkontext-quellzeile-fehlt");
      const before=rows[0];
      if(before.summary) continue;
      // Weder ein neuer Tag noch ein Codecommit erlaubt die Wiederholung
      // eines bekannten oder unklaren Abrufs. Der gespeicherte Versuch bleibt
      // unveraendert; nur Quellen ohne bisherigen Versuch kommen weiter.
      if(before.raw?.helmutQuellenkontext){report.bereitsGeprueft++;continue;}
      let result=E.fromMirror(before,bestand.main.rawItems||[]);
      if(!result.ok){
        const url=Q.artikelUrl(before.canonical_url)||Q.artikelUrl(before.url), host=publisherHost(url);
        if(!host) result={ok:false,reason:"artikelziel-nicht-freigegeben"};
        else {
          report.artikelAbrufe++;
          try { result=E.fromHtml(before,await (deps.fetchArticle || require("../lib/helmut/crawler").fetchUrl)(url,0,
            {allowedHost:host,abbruchSignal:AbortSignal.timeout(20000)})); }
          catch { result={ok:false,reason:"artikelabruf-nicht-bestaetigt"}; }
        }
      }
      await guard(60000);
      const after=plannedAfter(before,result,{tag,commit:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,geprueftAm:now().toISOString()});
      const query=casQuery(before);
      patchPending=true;report.ausgeloest=true;
      const response=await fetchFn(PROJECT_URL+"/rest/v1/raw_documents?"+query,{
        method:"PATCH",redirect:"error",signal:AbortSignal.timeout(20000),headers:{
          apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type":"application/json",Prefer:"return=representation"},
        body:JSON.stringify({summary:after.summary,raw:after.raw})});
      D.fordere(response.status===200,"quellenkontext-schreibausgang-unbekannt");
      const written=await response.json();
      D.fordere(Array.isArray(written)&&written.length===1,"quellenkontext-cas-konflikt");
      const checked=await read("raw_documents?select=*&id=eq."+encodeURIComponent(before.id)+"&limit=2");
      D.fordere(checked.length===1 && D.hash(checked[0])===D.hash(after),"quellenkontext-ruecklesung-abweichend");
      patchPending=false;
      if(result.ok){report.ergaenzt++;for(const list of Object.values(sources))for(const d of list)if(d.id===before.id)d.summary=result.summary;}
      else report.nichtErgaenzbar++;
      if(fortschritt && (report.ergaenzt+report.nichtErgaenzbar)%10===0)fortschritt({vorgang:"quellenkontext",ergaenzt:report.ergaenzt,nichtErgaenzbar:report.nichtErgaenzbar,artikelAbrufe:report.artikelAbrufe});
    }
    const coverage=inputs().map(v=>v.flatMap(x=>x.quellenbelege).filter(q=>q.auszug).length);
    report.profileMitZweiAuszuegen=coverage.filter(n=>n>=2).length;
    report.profileOhneAuszug=coverage.filter(n=>n===0).length;
    report.leereQuellenNachher=plan.length-report.ergaenzt;
    report.nochNichtVersucht=plan.length-report.ergaenzt-report.nichtErgaenzbar-report.bereitsGeprueft;
    const after=await snapshot(),counterAfter=await db("llm_budget_counters?select=used&scope=eq.global&day=eq."+tag);
    D.fordere(payloadHash(after)===profileHash,"quellenkontext-profilbestand-veraendert");
    D.fordere(counterAfter.length===1 && counterAfter[0].used===counterBefore[0].used
      && D.hash(pruefeQuellenKosten(after.auth,counterAfter[0].used,tag,config))===D.hash(costBefore)
      && D.hash(after.auth.testKostenTage?.[tag] || null)===kostenbuchHash,"quellenkontext-modellkosten-veraendert");
    report.kosten=costBefore;
    report.modellaufrufe=0;
    report.ok=true;
  }catch(error){report.grund=error instanceof D.DirektAbbruch?error.grund:"quellenkontext-netz-speicher-oder-antwortfehler";report.zustandUnbekannt=patchPending;}
  finally {
    if(locked){
      await storage.releasePipelineLock(LOCK);
      try {
        const remaining=await db("pipeline_locks?select=job_name&job_name=eq."+LOCK+"&expires_at=gt."+encodeURIComponent(now().toISOString()));
        D.fordere(remaining.length===0,"quellenkontext-sperre-nicht-freigegeben");
      }catch { report.ok=false;report.grund="quellenkontext-sperre-nicht-freigegeben"; }
    }
  }
  return report;
}
module.exports={ausfuehren,mapBounded,publisherHost,plannedAfter,casQuery,MAX_FETCH,MAX_MS};
