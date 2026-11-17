"use strict";

// Oeffentliche, unveraenderliche DIP-Belege. Keine Kunden-/Modellinhalte.
// Schreibzugriff nur aus dem regulaeren DIP-Quellenauftrag; Produktzugriff nur GET.
const F = require("./dip-vorgangsfakten");
const Q = require("./dip-quellfelder");
const { isDeepStrictEqual:same } = require("node:util");
const fail = () => { throw new Error("dip-beratungsstand-speicher"); };
function speicher({ request, storeId }) {
  if (typeof request !== "function" || !/^[a-zA-Z0-9_-]{1,100}$/.test(storeId||"") || storeId.includes("-p-")) fail();
  const prefix=id=> { if (!/^[1-9]\d{0,11}$/.test(id||"")) fail(); return `${storeId}-dipstand-${id}-`; };
  function pruefe(rows,id) {
    if (!Array.isArray(rows) || rows.length>1) fail();
    if (!rows.length) return null;
    const s=F.pruefeVorgangsstand(rows[0].data);
    if (s.vorgang.id!==id || rows[0].id!==prefix(id)+s.hash) fail();
    return s;
  }
  return {
    async lesen(id) {
      return pruefe(await request(`/rest/v1/helmut_store?id=like.${prefix(id)}*`
        +"&select=id,data&order=data-%3E%3EgelesenAm.desc,id.desc&limit=1"),id);
    },
    async speichern(value) {
      const s=F.pruefeVorgangsstand(value), id=prefix(s.vorgang.id)+s.hash;
      // Insert-only. Selbst eine verlorene Antwort wird nur durch exaktes Ruecklesen bestaetigt.
      try { await request("/rest/v1/helmut_store?on_conflict=id",{ method:"POST",
        headers:{ Prefer:"resolution=ignore-duplicates,return=representation" },body:JSON.stringify({ id,data:s }) }); }
      catch { /* Unbekannter Schreibausgang: kein erneuter Schreibversuch. */ }
      const read=pruefe(await request(`/rest/v1/helmut_store?id=eq.${id}&select=id,data`),s.vorgang.id);
      if (!same(read,s)) fail();
      return read;
    }
  };
}
function standardSpeicher() {
  const S=require("./storage");
  return speicher({ request:S.supabaseRequest,storeId:process.env.HELMUT_SUPABASE_STORE_ID||"main" });
}
function bezuege(doc) { return Q.lese(doc)?.vorgangsbezug || []; }
async function aktualisiere(documents,deps={}) {
  const now=deps.now||Date.now, store=deps.speicher||standardSpeicher(), gelesen=[];
  const ids=[...new Set(documents.flatMap(d=>bezuege({ ...d,sourceId:"dip",publishedAt:d.date,documentType:d.type }).map(v=>v.id)))].slice(0,12);
  let versucht=0;
  for (const id of ids) {
    if (versucht>=2 || !Number.isFinite(deps.deadlineMs) || deps.deadlineMs-now()<25000) break;
    try {
      const old=await store.lesen(id);
      if (old && now()-Date.parse(old.gelesenAm)>=0 && now()-Date.parse(old.gelesenAm)<30*60000) continue;
      versucht++;
      const s=await F.lese({ vorgangId:id,tag:new Date(now()).toISOString().slice(0,10) },deps);
      await store.speichern(s); gelesen.push(id);
    } catch {
      // Gesunder Dokumentinhalt bleibt erhalten; fehlender Stand wird nie rekonstruiert.
      // Kein Nachladen durch Produktleser und keine Wiederholung in diesem Auftrag.
    }
  }
  return gelesen;
}
async function mitGespeichertenStaenden(documents,deps={}) {
  if (!Array.isArray(documents) || !documents.some(d=>bezuege(d).length)) return documents;
  const store=deps.speicher||standardSpeicher(), byId=new Map();
  for (const id of [...new Set(documents.flatMap(d=>bezuege(d).map(v=>v.id)))].slice(0,12)) {
    try { byId.set(id,await store.lesen(id)); } catch { byId.set(id,null); }
  }
  return documents.map(d=>bezuege(d).length ? { ...d,dipBeratungsstaende:bezuege(d).map(v=>byId.get(v.id)||null) } : d);
}
function anzeige(doc,displayedUrl) {
  const q=Q.lese(doc);
  if (!q || displayedUrl && displayedUrl!==q.bindung.url) return null;
  if (!q.vorgangsbezug?.length) return [];
  return q.vorgangsbezug.map((ref,i)=> {
    const unknown={ version:1,vorgangId:ref.id,titel:ref.titel,artikelUrl:q.bindung.url,
      originalUrl:`https://dip.bundestag.de/vorgang/-/${ref.id}`,stand:"unbekannt",
      folgestand:"unbekannt",dokumentdatum:null,aktualisiert:null,gelesenAm:null,positionenVollstaendig:false,schritte:[] };
    try {
      const s=F.pruefeVorgangsstand(doc.dipBeratungsstaende?.[i]);
      if (s.vorgang.id!==ref.id || s.vorgang.vorgangstyp!==ref.vorgangstyp
        || Date.parse(s.gelesenAm)>Date.now()) return unknown;
      return { ...unknown,titel:s.vorgang.titel,stand:s.vorgang.beratungsstand||"unbekannt",
        dokumentdatum:s.vorgang.dokumentdatum,aktualisiert:s.vorgang.aktualisiert,gelesenAm:s.gelesenAm,
        positionenVollstaendig:s.positionenVollstaendig,
        schritte:s.positionen.map(p=>({ id:p.id,datum:p.dokumentdatum,phase:p.vorgangsposition,
          originalUrl:p.fundstelle.pdf_url,dokumentnummer:p.fundstelle.dokumentnummer,
          beschluesse:p.beschluesse,ueberweisungen:p.ueberweisungen })) };
    } catch { return unknown; }
  });
}
module.exports={ speicher,aktualisiere,mitGespeichertenStaenden,anzeige };
