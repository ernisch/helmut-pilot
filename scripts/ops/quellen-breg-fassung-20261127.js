"use strict";

// Inerter lokaler Vorpruefer. Keine Freigabe, kein Netz, kein Workerstart.
// Bestandsbindung ist keine historische KI-Lektuere und kein Neufetchbeleg.
const fs = require("node:fs");
const { isDeepStrictEqual: gleich } = require("node:util");
const R = require("../../lib/helmut/roh-quellenstaende");
const B = require("../../lib/helmut/ko-quellenfassung");
const Budget = require("../../lib/helmut/betriebskosten-budget");
const { createHash } = require("node:crypto");
const ZIEL = Object.freeze({
  raw: "rd-0477967d342ba91bd337044bd1a6ff70f7db589f8b7bd03ae35bfbf1a3054068",
  alt: "add680be81a04d0e6f3c9de92adc2c55d258401d4a2428191527ed7fc8fd5160",
  neu: "0968e51ad7faa8d8f2d74416e55ebcbb5a86312b6d2a8c1ba1d4ff44dbe6a795",
  kos: ["ko-vg-bundesregierung-20241119-743c6b", "ko-vg-entlastungen-20260417-6517e5"],
  kostenvertrag: "8c98b2e18ee5dc21c73561bbf5bad2d8cb6c76f8ccd533b3153270bbd7d9a348",
  alteCasHash: "76f8a7856e80e9ea9b614c1aa11b57af3029ad764570027c3f7ea9b13252af18",
  policyHash: "23e4bb853f7de2faafc471c0408e7de1e51875e8bc8e740d760796ee5dfb7bff",
  bestand: {"rawIds":"79487a377f2c9c41f84e46fc3213a052c4b5311a237949be0797febdd341b3f5","roh":"79cf43d3047b04c7058ab1d6964f226ee6ee5db76f82836ade583206d57b3012","kos":"bc3f4a5149fde1c30c93b407f3fb95d3550691ddcf021e221f16c3c5754b0461","kanten":"de63110037f2e603ba24d16e13c191899f5d4c732f62fe26e869e136823a1c28","zielKanten":"02b4c92e93e82a32d28d3cc893aa818a6a6af5446272c3ef693bbe18396c7110","archive":"81870ffc255031db45b29a2346f0d5edff9cbdb81cb8d8065ab86ec12fba5cac","findings":"0f1cdd8d050e69c25bf34022e90b6e3c11403c88902f35e13cd54fbae61dd530"}
});
const fordere = (ok, grund) => { if (!ok) throw Error("breg-fassung: " + grund); };
const hash = text => createHash("sha256").update(text).digest("hex");
const sort = (rows, key) => [...rows].sort((a,b)=>a[key]<b[key]?-1:a[key]>b[key]?1:0);
const daten = d => Object.fromEntries(Object.entries(d).map(([k,v]) =>
  [k, ["created_at","retrieved_at","published_at"].includes(k) && v != null
    ? new Date(v).toISOString() : v]));
function typgleich(archiv, raw) {
  return gleich(daten(Object.fromEntries(Object.keys(raw).map(k=>[k,archiv[k]??null]))), daten(raw));
}
// Generischer, rein lokaler Fachkern fuer synthetische Gegenfaelle. Der
// Produktwrapper darunter bindet zusaetzlich ausschliesslich den festen Bestand.
function plane(s, ziel) {
  fordere(Array.isArray(s.roh) && s.roh.length === 60 && new Set(s.roh.map(r=>r.id)).size === 60
    && Array.isArray(s.kos) && s.kos.length === 2 && Array.isArray(s.kanten) && s.kanten.length === 61
    && Array.isArray(s.archive) && s.archive.length === 17 && gleich(s.bindungen, []), "Bestand60/2/61/17 ohne Vorbindung");
  const ids = sort(s.roh,"id").map(r=>r.id);
  fordere(gleich(ids,ziel.rawIds) && gleich(sort(s.kos,"id").map(k=>k.id),ziel.kos)
    && new Set(s.kanten.map(l=>l.knowledge_object_id+"|"+l.raw_document_id)).size === 61,
  "feste Quellen-/Kantenmenge");
  for (const [i,id] of ziel.kos.entries()) {
    const k=s.kos.find(k=>k.id===id), links=s.kanten.filter(l=>l.knowledge_object_id===id);
    fordere(k.ko_version===1 && k.understanding_status==="complete" && links.length===(i?1:60)
      && k.verstehen_fencing===(i?1:null) && (i?links[0].raw_document_id===ziel.raw:
        gleich(links.map(l=>l.raw_document_id).sort(),ids)), "vollstaendige alte KO-Versionen");
  }
  fordere(gleich(sort(s.zielKanten,"knowledge_object_id"),sort(s.kanten.filter(l=>l.raw_document_id===ziel.raw),"knowledge_object_id")),
    "keine weiteren ungeschuetzten Zielkanten");
  const neueArchive=[], zuordnung=new Map();
  for(const raw of s.roh) {
    const stand=R.standHash(raw), id=B.pointer(raw.id,stand);
    const a=s.archive.find(a=>a.id===id);
    if(a) {
      fordere(a.data.version===1 && a.data.quellenHash===stand && R.standHash(a.data.dokument)===stand
        && typgleich(a.data.dokument,raw), "bestehender Archivkonflikt");
      zuordnung.set(raw.id,{id,sha256:B.digest(a.data)});
    } else {
      // Kein blindes Wiederverwenden einer anderen historischen Fassung.
      fordere(!s.archive.some(a=>a.data?.dokument?.id===raw.id), "Archiv ohne exakte heutige Originalbindung");
      const data={version:1,quellenHash:stand,dokument:raw};
      neueArchive.push({id,data});zuordnung.set(raw.id,{id,sha256:B.digest(data)});
    }
  }
  fordere(neueArchive.length===47 && zuordnung.size===60,"genau47 heutige Bestandssnapshots");
  const alt=s.roh.find(r=>r.id===ziel.raw), neu=s.archive.find(a=>a.id===B.pointer(ziel.raw,ziel.neu));
  fordere(R.standHash(alt)===ziel.alt && neu?.data?.quellenHash===ziel.neu
    && R.standHash(neu.data.dokument)===ziel.neu && neu.data.dokument.id===ziel.raw
    && alt.url===neu.data.dokument.url && alt.canonical_url===neu.data.dokument.canonical_url,
  "exakte Alt-/Neufassung derselben Quelle");
  const bindungen=[];
  for(const k of s.kos) {
    const links=s.kanten.filter(l=>l.knowledge_object_id===k.id).map(l=>({
      raw_document_id:l.raw_document_id,raw_source_version_id:zuordnung.get(l.raw_document_id).id,
      raw_source_version_sha256:zuordnung.get(l.raw_document_id).sha256}));
    const manifest=B.manifest(links), digest=B.digest(manifest);
    bindungen.push(...manifest.map(l=>({...l,knowledge_object_id:k.id,ko_version:1,quellen_count:links.length,manifest_sha256:digest})));
  }
  const nach={...alt};
  for(const key of ["title","source_id","source_name","source_type","published_at","summary","retrieved_at","raw"])
    nach[key]=neu.data.dokument[key]??null;
  nach.content_fingerprint=null;
  for(const key of ["published_at","retrieved_at"])
    if(nach[key]!=null) nach[key]=new Date(nach[key]).toISOString().replace(/(\.\d*?)0+Z$/,"$1Z").replace(/\.Z$/,"Z").replace(/Z$/,"+00:00");
  fordere(R.standHash(nach)===ziel.neu,"Promotionsfelder");
  return {neueArchive:sort(neueArchive,"id"),bindungen:bindungen.sort((a,b)=>
    (a.knowledge_object_id+"|"+a.raw_document_id).localeCompare(b.knowledge_object_id+"|"+b.raw_document_id)),alt,nach};
}
function pruefe(v,{jetztMs=Date.now()}={}) {
  fordere(v?.version===1 && v.modus==="vorschau" && typeof v.inhalt==="string"
    && Buffer.byteLength(v.inhalt)<=16*1024*1024 && hash(v.inhalt)===v.digest,"Vorschauhash");
  fordere(Number.isFinite(jetztMs) && Date.parse(v.gelesenAm)<=jetztMs
    && Date.parse(v.gelesenAm)>=jetztMs-300000
    && new Date(jetztMs).toISOString().slice(0,10)===v.tag,"frischer Fuenfminuten-Vorwert");
  const s=JSON.parse(v.inhalt);
  for(const key of ["roh","kos","kanten","zielKanten","archive","findings"])
    fordere(B.digest(s[key])===ZIEL.bestand[key],"fester Originalbestand "+key);
  const ruhe=s.sicherung;
  fordere(ruhe && ["aktiveJobs","aktiveSlots","aktiveLlm","aktiveLocks"].every(k=>gleich(ruhe[k],[])),
    "keine aktive Workerarbeit");
  const cas=ruhe.aktiveCas;
  fordere(Array.isArray(cas) && (!cas.length || cas.length===7 && B.digest(cas)===ZIEL.alteCasHash
    && cas.every(c=>["reserviert","modell-laeuft"].includes(c.zustand) && typeof c.besitzer==="string"
      && c.besitzer && Number.isFinite(Date.parse(c.lease_bis)) && Date.parse(c.lease_bis)<jetztMs)),
  "nur exakt bekannte abgelaufene CAS");
  const buch=ruhe.kostenBuch, stand=Budget.pruefeBuch(buch,buch?.contract);
  fordere(buch.contractHash===ZIEL.kostenvertrag && buch.contract.dailyLimitUsd===1
    && buch.contract.totalLimitUsd===30 && buch.frozen===null && stand.total<=30000000
    && (stand.days[v.tag]||0)<=1000000 && Number.isSafeInteger(ruhe.globalUsed) && ruhe.globalUsed<=100
    && ruhe.globalUsed>=0 && Number.isSafeInteger(ruhe.originalUsed) && ruhe.originalUsed>=0
    && ruhe.originalUsed<=16,"unveraenderter1/30USD/100/16-Vertrag");
  const ziel={...ZIEL,rawIds:s.roh.map(r=>r.id).sort()};
  const plan=plane(s,ziel), d=s.archive.find(a=>a.id===B.pointer(ZIEL.raw,ZIEL.neu)).data.dokument;
  fordere(d.source_id==="bundesregierung" && d.source_name==="Bundesregierung" && d.source_type==="ministry"
    && d.raw?.retrievalPathId==="rp-bundesregierung" && typeof d.summary==="string" && d.summary.trim(),
  "gespeicherte amtliche RSSfassung");
  return {version:1,modus:"vorbereitet",aktiviert:false,gelesenAm:v.gelesenAm,tag:v.tag,
    digest:v.digest,planDigest:B.digest(plan),
    hinweis:"Kein GO. Vollstaendige Vorschau privat erhalten. Erst nach Migration und beiden frischen Plattformbelegen aktivieren."};
}
module.exports={ZIEL,plane,pruefe,typgleich};
if(require.main===module)try{console.log(JSON.stringify(pruefe(JSON.parse(fs.readFileSync(0,"utf8")))));}
catch(e){console.error(e.message);process.exitCode=1;}

