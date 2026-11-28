"use strict";

// Inerter lokaler Vorpruefer. Keine Freigabe, kein Netz, kein Workerstart.
// Bestandsbindung ist keine historische KI-Lektuere und kein Neufetchbeleg.
const fs = require("node:fs");
const { isDeepStrictEqual: gleich } = require("node:util");
const R = require("../../lib/helmut/roh-quellenstaende");
const B = require("../../lib/helmut/ko-quellenfassung");
const Budget = require("../../lib/helmut/betriebskosten-budget");
const { createHash } = require("node:crypto");
// Exakt zwei amtliche27.11.-Fassungen; sechs alte CAS sind keine sieben Geldbindungen.
const ZIEL = Object.freeze({
  "ziele": [
    {
      "raw": "rd-ae70b6b4d33681010ddad490ad590ef97e57fdc5e5d7deb5b18aed704442f419",
      "alt": "35259c74f38dfcf170a2acfe62cd7778c3dad38a332f87b7bc93374ace2db8c6",
      "neu": "5898b3a8f99b9c6c5c3c5345d2a8a8f09d190a2855b63c2a14a0baf588022da1",
      "url": "https://www.bundesregierung.de/breg-de/aktuelles/zuckergetraenkesteuer-2457018",
      "canonical": "https://bundesregierung.de/breg-de/aktuelles/zuckergetraenkesteuer-2457018",
      "titel": "Zuckergetränkesteuer soll Gesundheitssystem entlasten",
      "publikation": "2026-11-27T13:51:00.000Z"
    },
    {
      "raw": "rd-c66a3f3dbbd3cfdb5840e8c4c05c967568b08bbdb7337d04d7a00a69dfbe89ed",
      "alt": "b7281f43c377e8c083925d6e92ae51a6afa2f6600b1df6ceb481cab831c5e0b5",
      "neu": "77b6d776a4cad0d4e7a54c48fa17dc9fdbfcdb1729d521b421b91a5bc47ef74a",
      "url": "https://www.bundesregierung.de/breg-de/aktuelles/bundeshaushalt-2027-2446026",
      "canonical": "https://bundesregierung.de/breg-de/aktuelles/bundeshaushalt-2027-2446026",
      "titel": "Etat im Zeichen von Wohlstand und Sicherheit",
      "publikation": "2026-11-27T11:45:00.000Z"
    }
  ],
  "kos": [
    "ko-vg-bundesregierung-20250214-99d246",
    "ko-vg-bundestag-20260706-471792",
    "ko-vg-bundestag-20260902-5c7905",
    "ko-vg-bundestag-20260907-7f5511",
    "ko-vg-bundestag-20260908-1f3c5c",
    "ko-vg-bundestag-20260908-774a55",
    "ko-vg-bundestag-20260908-f28fbd",
    "ko-vg-wirtschaft-20260423-351f14"
  ],
  "koStaende": [
    {
      "id": "ko-vg-bundesregierung-20250214-99d246",
      "version": 5,
      "status": "complete",
      "fencing": 5,
      "kanten": 13
    },
    {
      "id": "ko-vg-bundestag-20260706-471792",
      "version": 1,
      "status": "complete",
      "fencing": 1,
      "kanten": 20
    },
    {
      "id": "ko-vg-bundestag-20260902-5c7905",
      "version": 1,
      "status": "failed",
      "fencing": null,
      "kanten": 60
    },
    {
      "id": "ko-vg-bundestag-20260907-7f5511",
      "version": 1,
      "status": "pending",
      "fencing": null,
      "kanten": 13
    },
    {
      "id": "ko-vg-bundestag-20260908-1f3c5c",
      "version": 1,
      "status": "pending",
      "fencing": null,
      "kanten": 11
    },
    {
      "id": "ko-vg-bundestag-20260908-774a55",
      "version": 1,
      "status": "pending",
      "fencing": null,
      "kanten": 10
    },
    {
      "id": "ko-vg-bundestag-20260908-f28fbd",
      "version": 1,
      "status": "complete",
      "fencing": 1,
      "kanten": 17
    },
    {
      "id": "ko-vg-wirtschaft-20260423-351f14",
      "version": 1,
      "status": "pending",
      "fencing": null,
      "kanten": 11
    }
  ],
  "maxNeueArchive": 103,
  "kostenvertrag": "8c98b2e18ee5dc21c73561bbf5bad2d8cb6c76f8ccd533b3153270bbd7d9a348",
  "kostenBuchHash": "9bc11b140211e2d9be9ef3381c0baf23dd4c08cf82f9b52db2c8074ad525b6ad",
  "gebunden": 11047633,
  "alteCasHash": "749b4607fa96cc192b3633ebaf8aca1debf61411065d8c0f0055a7588a2e7b34",
  "alteCasAnzahl": 6,
  "policyHash": "23e4bb853f7de2faafc471c0408e7de1e51875e8bc8e740d760796ee5dfb7bff",
  "anker": {
    "archive": [
      "1b9978f551e1a6cc343bbffbff80158529431f80302f36772ff12b0b3978fe8b",
      "312ce3a1e4699747cce7aaf8acd20d45d6192e12995956d0bbfa7d16d8d502aa",
      "4fc203bc2bb0a5471ab4a4caf5b6a08e853b085829c646c14ee114fb27123e0b",
      "5230582bdf37733d094a0c827fd401f581f68c8bbb1802e4e671cb4fb59fa08a",
      "59b4f87c7f681b9bd3bfef67415f3b6985fb81e925357240bc5a15306243fffc",
      "63c98beae3e3598430bde8444123336d1b2ae40518fd111bba89cb51191a7a87",
      "67f65c8ebce4cd06c94d6f90a94366a79c1e6b7e9e468994fb47aec044831370",
      "721a4bc540961921bdeac71fa6c764e66d9d5cf860622bf7c199a90cca32fc3a",
      "8bc9a34fc0e2b072bc0a6be13a9ff6850dfc3540ab6afd2b45022343076facc1",
      "a6c4fd461e51a8ac450ada0756bdf1c6d4f9ce199a96353a7cef776f877bfe81",
      "a8363f606ed5e5ab6f74149d39edfc5e4122e44b4396358823f66f780e1be55e",
      "b21a995a604e76028cb196cf1e2848d798ca7d43c8e42f3554865d122bd0a8b9",
      "bcade632a1931a579f9108bb4630ec7984e7021d6e0afa550f99721019fd4a26",
      "bea3c34294ff17e6f2ca8d22210c2cf0f0b07660d59e8e93631169fcedefeaf9",
      "c67c313bbc4fa6a80faa508bd8aebae18aa8ded8e1e0ce801806df0c655f47b3",
      "e4088a56a6ec2eade991affcd80e98dea4ff1e27bf155c45db9f913cae2639b6",
      "f1422a83fae5453d754c2362b3ed7d564f6aacfd7d9521c4e18ad9fff388571f",
      "f75567e09dfcfbbfe0d32d100ceea68bc90cac3085e53e2255c9d3bc3f6ec30a",
      "fbe6ef84520a680baab94e6342496bce8c3132201a70463220a842e6be6917d8"
    ]
  },
  "bestand": {
    "roh": "11f210abe771cdcc19bda10a3a0ee28b07ffae021a94cb6478240290909f9572",
    "kos": "08db9f7d144232eeef794d03f5a5f19bbcc1e05ca64fc8574b37173195a7b23f",
    "kanten": "3d68d219bbb075620a786f50bcc87ffadde4247e48f743827a70d99528c06ea7",
    "rawIds": "f06fbd003513e784226879654861c99d4c957af8fcbe946e31da55b32eec1d2b",
    "zielKanten": "6819185745a5e3be42281b03be59c16cf4a9f987ab424ee238f7d11cd1028aa1",
    "archive": "e592eb5b6dd53701afe4cebcb6eb8cbf75f683479b483edf040bc14ce18e8252",
    "findings": "799fdce2f011a6b3904716f9e3c56f805f4cdbede0fa7fd68edc88084c952fcc"
  }
});
const fordere = (ok, grund) => { if (!ok) throw Error("breg-neufassungen: " + grund); };
const hash = text => createHash("sha256").update(text).digest("hex");
const sort = (rows, key) => [...rows].sort((a,b)=>a[key]<b[key]?-1:a[key]>b[key]?1:0);
const daten = d => Object.fromEntries(Object.entries(d).map(([k,v]) =>
  [k, ["created_at","retrieved_at","published_at"].includes(k) && v != null
    ? new Date(v).toISOString() : v]));
function typgleich(archiv, raw) {
  return gleich(daten(Object.fromEntries(Object.keys(raw).map(k=>[k,archiv[k]??null]))), daten(raw));
}
function pruefeAnker(rows, anker, art) {
  fordere(Array.isArray(rows)&&Array.isArray(anker),"Originalanker "+art);
  const vorhanden=rows.map(B.digest);
  for(const h of anker){const i=vorhanden.indexOf(h);
    fordere(i>=0,"unveraenderte Originalanker "+art);vorhanden.splice(i,1);}
}
function autoritaet(d) {
  return [d.source_id??null,d.source_name??null,d.source_type??null,d.link_type??null,d.publisher_id??null,
    d.raw?.retrievalPathId??null,d.raw?.sourcePriority??null,d.raw?.originalUrl??null];
}
const kantenSort = rows => [...rows].sort((a,b) => {
  const x=a.knowledge_object_id+"|"+a.raw_document_id,y=b.knowledge_object_id+"|"+b.raw_document_id;
  return x<y?-1:x>y?1:0;
});
// Rein lokale Planung. Der Wrapper bindet zusaetzlich den festen Originalbestand.
// Auch pending/failed bleiben unveraendert; Bindung ist keine historische KI-Lektuere.
function plane(s, ziel) {
  fordere(Array.isArray(s.roh) && s.roh.length===110 && new Set(s.roh.map(r=>r.id)).size===110
    && Array.isArray(s.kos) && s.kos.length===8 && Array.isArray(s.kanten) && s.kanten.length===155
    && Array.isArray(s.archive) && s.archive.length>=ziel.anker.archive.length
    && Array.isArray(s.findings) && gleich(s.bindungen,[]),"Bestand110/8/155 ohne Vorbindung");
  const ids=sort(s.roh,"id").map(r=>r.id);
  fordere(gleich(ids,ziel.rawIds) && gleich(sort(s.kos,"id").map(k=>k.id),ziel.kos)
    && new Set(s.kanten.map(l=>l.knowledge_object_id+"|"+l.raw_document_id)).size===155
    && s.kanten.every(l=>ziel.kos.includes(l.knowledge_object_id)&&ids.includes(l.raw_document_id)),
    "feste Quellen-/Kantenmenge");
  for(const erwartung of ziel.koStaende) {
    const k=s.kos.find(k=>k.id===erwartung.id),links=s.kanten.filter(l=>l.knowledge_object_id===erwartung.id);
    fordere(k && k.ko_version===erwartung.version && k.understanding_status===erwartung.status
      && k.verstehen_fencing===erwartung.fencing && links.length===erwartung.kanten,
      "vollstaendige vorhandene KO-Versionen ohne Statuskorrektur");
  }
  fordere(gleich(kantenSort(s.zielKanten),kantenSort(s.kanten.filter(l=>ziel.ziele.some(z=>z.raw===l.raw_document_id)))),
    "keine weiteren ungeschuetzten Zielkanten");
  pruefeAnker(s.archive,ziel.anker.archive,"archive");
  fordere(B.digest(s.findings)===ziel.bestand.findings,"vollstaendige feste Findings");
  fordere(new Set(s.archive.map(a=>a.id)).size===s.archive.length
    && s.findings.every(f=>ids.includes(f.raw_document_id)),"eindeutige Archive und feste Findings-Identitaeten");
  for(const a of s.archive) {
    const data=a.data,d=data?.dokument,raw=s.roh.find(r=>r.id===d?.id);
    fordere(data?.version===1 && Object.keys(data).sort().join()==="dokument,quellenHash,version"
      && raw && data.quellenHash===R.standHash(d) && a.id===B.pointer(d.id,data.quellenHash)
      && !Object.hasOwn(d,B.FELD),"Archivschema/RawID/Standhash");
    if(!ziel.anker.archive.includes(B.digest(a)))
      fordere(d.url===raw.url && d.canonical_url===raw.canonical_url && gleich(autoritaet(d),autoritaet(raw)),
        "zusaetzliches Archiv mit gleicher Quellenautoritaet");
  }
  const neueArchive=[],zuordnung=new Map();
  for(const raw of s.roh) {
    const stand=R.standHash(raw),id=B.pointer(raw.id,stand),a=s.archive.find(a=>a.id===id);
    if(a) {
      fordere(a.data.version===1 && a.data.quellenHash===stand && R.standHash(a.data.dokument)===stand
        && typgleich(a.data.dokument,raw),"bestehender Archivkonflikt");
      zuordnung.set(raw.id,{id,sha256:B.digest(a.data)});
    } else {
      const data={version:1,quellenHash:stand,dokument:raw};
      neueArchive.push({id,data});zuordnung.set(raw.id,{id,sha256:B.digest(data)});
    }
  }
  fordere(neueArchive.length<=ziel.maxNeueArchive && zuordnung.size===110,"hoechstens103 fehlende Bestandssnapshots");
  const bindungen=[];
  for(const k of s.kos) {
    const links=s.kanten.filter(l=>l.knowledge_object_id===k.id).map(l=>({raw_document_id:l.raw_document_id,
      raw_source_version_id:zuordnung.get(l.raw_document_id).id,raw_source_version_sha256:zuordnung.get(l.raw_document_id).sha256}));
    const manifest=B.manifest(links),digest=B.digest(manifest);
    bindungen.push(...manifest.map(l=>({...l,knowledge_object_id:k.id,ko_version:k.ko_version,
      quellen_count:links.length,manifest_sha256:digest})));
  }
  const promotionen=[];
  for(const z of ziel.ziele) {
    const alt=s.roh.find(r=>r.id===z.raw),neu=s.archive.find(a=>a.id===B.pointer(z.raw,z.neu)),d=neu?.data?.dokument;
    fordere(alt && R.standHash(alt)===z.alt && neu?.data?.quellenHash===z.neu
      && R.standHash(d)===z.neu && d.id===z.raw && d.url===z.url && d.canonical_url===z.canonical
      && alt.url===z.url && alt.canonical_url===z.canonical && d.title===z.titel && d.published_at===z.publikation
      && d.source_id==="bundesregierung" && d.source_name==="Bundesregierung" && d.source_type==="ministry"
      && d.link_type==="direct" && d.raw?.retrievalPathId==="rp-bundesregierung"
      && /^https:\/\/www\.bundesregierung\.de\/breg-de\/aktuelles\/[^?#]+$/.test(d.url)
      && typeof d.summary==="string" && d.summary.trim(),"exakte amtliche Alt-/Neufassung derselben direkten Quelle");
    const nach={...alt};
    for(const key of ["title","source_id","source_name","source_type","published_at","summary","retrieved_at","raw"])
      nach[key]=d[key]??null;
    nach.content_fingerprint=null;
    for(const key of ["published_at","retrieved_at"])
      if(nach[key]!=null) nach[key]=new Date(nach[key]).toISOString().replace(/(\.\d*?)0+Z$/,"$1Z").replace(/\.Z$/,"Z").replace(/Z$/,"+00:00");
    fordere(R.standHash(nach)===z.neu,"Promotionsfelder");promotionen.push({alt,nach});
  }
  fordere(promotionen.length===2 && bindungen.length===155,"exakt155 Bindungen und zwei Promotionen");
  return {neueArchive:sort(neueArchive,"id"),bindungen:kantenSort(bindungen),promotionen,
    anzahl:{vorarchive:s.archive.length,neueArchive:neueArchive.length,findings:s.findings.length,bindungen:155,promotionen:2}};
}
function pruefe(v,{jetztMs=Date.now()}={}) {
  fordere(v?.version===1 && v.modus==="vorschau" && typeof v.inhalt==="string"
    && Buffer.byteLength(v.inhalt)<=16*1024*1024 && hash(v.inhalt)===v.digest,"Vorschauhash");
  fordere(Number.isFinite(jetztMs) && Date.parse(v.gelesenAm)<=jetztMs
    && Date.parse(v.gelesenAm)>=jetztMs-300000
    && new Date(jetztMs).toISOString().slice(0,10)===v.tag,"frischer Fuenfminuten-Vorwert");
  const s=JSON.parse(v.inhalt);
  for(const key of ["roh","kos","kanten","zielKanten","findings"])
    fordere(B.digest(s[key])===ZIEL.bestand[key],"fester Originalbestand "+key);
  const ruhe=s.sicherung;
  fordere(ruhe && ["aktiveJobs","aktiveSlots","aktiveLlm","aktiveLocks"].every(k=>gleich(ruhe[k],[])),
    "keine aktive Workerarbeit");
  fordere(B.digest(s.roh.map(r=>r.id).sort())===ZIEL.bestand.rawIds,"feste RawIDs");
  const cas=ruhe.aktiveCas;
  fordere(Array.isArray(cas) && (cas.length===ZIEL.alteCasAnzahl && B.digest(cas)===ZIEL.alteCasHash
    && cas.every(c=>["reserviert","modell-laeuft"].includes(c.zustand) && typeof c.besitzer==="string"
      && c.besitzer && Number.isFinite(Date.parse(c.lease_bis)) && Date.parse(c.lease_bis)<jetztMs)),
  "nur exakt sechs bekannte abgelaufene CAS; sieben Geldbindungen bleiben unveraendert");
  const buch=ruhe.kostenBuch, stand=Budget.pruefeBuch(buch,buch?.contract);
  fordere(B.digest(buch)===ZIEL.kostenBuchHash && stand.total===ZIEL.gebunden
    && buch.contractHash===ZIEL.kostenvertrag && buch.contract.dailyLimitUsd===1
    && buch.contract.totalLimitUsd===30 && buch.frozen===null && stand.total<=30000000
    && (stand.days[v.tag]||0)<=1000000 && Number.isSafeInteger(ruhe.globalUsed) && ruhe.globalUsed<=100
    && ruhe.globalUsed>=0 && Number.isSafeInteger(ruhe.originalUsed) && ruhe.originalUsed>=0
    && ruhe.originalUsed<=16,"unveraenderter1/30USD/100/16-Vertrag");
  const ziel={...ZIEL,rawIds:s.roh.map(r=>r.id).sort()};
  const plan=plane(s,ziel);
  return {version:1,modus:"vorbereitet",aktiviert:false,gelesenAm:v.gelesenAm,tag:v.tag,
    digest:v.digest,planDigest:B.digest(plan),
    hinweis:"Kein GO. Vollstaendige Vorschau privat erhalten. Nur neues konkretes GO, bestehende Migration und beide frischen Plattformbelege koennen den getrennten Bestandsoperator freigeben."};
}
module.exports={ZIEL,plane,pruefe,typgleich,pruefeAnker};
if(require.main===module)try{console.log(JSON.stringify(pruefe(JSON.parse(fs.readFileSync(0,"utf8")))));}
catch(e){console.error(e.message);process.exitCode=1;}
