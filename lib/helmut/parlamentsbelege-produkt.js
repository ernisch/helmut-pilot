"use strict";

// Nur vorhandene amtliche Belege lesen. Keine Abrufe, Auftraege, Modelle oder
// persoenlichen Termine. Eine Planung ist weder Beschluss noch Anwesenheitspflicht.
const E = require("./quellen-bundestag-termine");
const Q = require("./dip-quellfelder");
const { committeeMatchKey } = require("./matching");
const namen = { "arbeit-soziales":"Arbeit und Soziales", "wirtschaft-energie":"Wirtschaft und Energie",
  "digitales-staatsmodernisierung":"Digitales und Staatsmodernisierung" };
const list = v => Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : [];
function rolle(profile, q) {
  if (!/^bundestag$/i.test(String(profile?.parliamentType || profile?.politische_ebene || profile?.politicalLevel || ""))) return null;
  if (q.art !== "ausschuss") return "Bundestagsmandat";
  const key = committeeMatchKey(namen[q.key]);
  if (list(profile.committees || profile.ausschuesse || profile.committee).some(v => committeeMatchKey(v) === key)) return "Hauptausschuss";
  return list(profile.deputyCommittees || profile.stellvertretende_ausschuesse).some(v => committeeMatchKey(v) === key) ? "Stellvertretung" : null;
}
function nutzbar(q) {
  const s = E.codeNutzungsbeleg(q.id), p = s?.usagePolicy;
  return s?.url === q.url && s.preparedOnly !== true && s.rightsReviewRequired === false
    && p?.scope === "structured_parliamentary_facts" && p.commercialUseApproved === true
    && p.fullTextAllowed === false && p.imagesAllowed === false && p.aiTrainingAllowed === false
    && Array.isArray(p.evidenceUrls) && p.evidenceUrls.length > 0 && p.evidenceUrls.every(u => typeof u === "string" && /^https:\/\//.test(u));
}
function tag(now) { return require("./briefing-frische").berlinTagKey(new Date(now)); }
function pruefeProjektion(b) {
  if (!b || typeof b !== "object") return false;
  const { projektionsHash,rolle,aktuell,...basis } = b;
  return /^[a-f0-9]{64}$/.test(projektionsHash || "") && E.hash(basis) === projektionsHash
    && b.belegHash === E.hash([b.standHash,b.gelesenAm]) && Number.isFinite(Date.parse(b.gelesenAm));
}
function drucksache(doc) {
  const q = Q.lese(doc);
  if (!q || q.dokumentart !== "Drucksache" || !q.vorgangsbezug?.length) return null;
  const u = new URL(q.bindung.url), m = /^\/btd\/(\d{2})\/(\d{3})\/(\d+)\.pdf$/.exec(u.pathname);
  if (!m || u.search || u.hash || !m[3].startsWith(m[1])) return null;
  const nr = m[3].slice(m[1].length);
  return /^\d{5,7}$/.test(nr) && nr.startsWith(m[2]) && Number(nr) > 0 ? `${Number(m[1])}/${Number(nr)}` : null;
}
async function leseStaende(deps = {}) {
  const now = deps.now?.() ?? Date.now();
  const qs = E.QUELLEN.filter(nutzbar);
  if (!qs.length) return [];
  const S = require("./storage"), request = deps.request || S.supabaseRequest;
  const storeId = deps.storeId || process.env.HELMUT_SUPABASE_STORE_ID || "main";
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(storeId) || storeId.includes("-p-")) return [];
  let katalog;
  try { katalog = await (deps.katalog || S.listSourceArchitectureRows)(); } catch { return qs.map(q => ({ q, stand:null })); }
  return Promise.all(qs.map(async q => {
    if (!E.freigabe(q, katalog)) return { q, stand:null };
    try {
      const rows = await request(`/rest/v1/helmut_store?id=like.${storeId}-bt-terminstand-*`
        + `&data-%3E%3EsourceId=eq.${q.id}&select=id,data&order=data-%3E%3EretrievedAt.desc,id.desc&limit=2`);
      if (!Array.isArray(rows) || rows.length > 2) throw Error("antwort");
      const checked = rows.map(r => {
        if (Buffer.byteLength(JSON.stringify(r.data)) > 512*1024) throw Error("groesse");
        const s = E.leseStand(r.data);
        if (s.sourceId !== q.id || r.id !== `${storeId}-bt-terminstand-${s.belegHash}`
          || Date.parse(s.retrievedAt) > now || s.documents.some(d => d.publishedDay && d.publishedDay > tag(now))) throw Error("bindung");
        return s;
      });
      if (checked.length === 2 && (checked[0].retrievedAt < checked[1].retrievedAt
        || checked[0].retrievedAt === checked[1].retrievedAt && checked[0].standHash !== checked[1].standHash)) throw Error("zeitkonflikt");
      return { q, stand:checked[0] || null };
    } catch { return { q, stand:null }; }
  }));
}
function projektion(q, s, now, nummer = null) {
  const aktuell = now - Date.parse(s.retrievedAt) >= 0 && now - Date.parse(s.retrievedAt) <= 24*3600000;
  const datum = tag(now), original = s.documents.filter(d => !nummer || d.references?.includes(nummer));
  if (nummer && !original.length) return null;
  const termine = q.art === "kalender" ? s.documents.flatMap(d => d.events)
    .filter(e => e.endDayExclusive > datum).sort((a,b) => a.startDay.localeCompare(b.startDay)).slice(0,3)
    .map(e => ({ von:e.startDay,bisExklusiv:e.endDayExclusive,status:e.status,ganztags:true })) : [];
  const meetings = s.meetings.filter(m => !nummer || m.topVersions.some(t => t.references.includes(nummer))
    || q.art === "plenum" && m.documents.some(d => original.some(o => o.url === d.url && o.byteHash === d.byteHash)));
  const sitzungen = meetings.slice(0,12).map(m => ({ kennung:m.key,stand:m.state,
    beginn:m.startsAt,oeffentlichkeit:m.visibility,konflikte:m.conflicts,
    tops:m.tops.filter(t => !nummer || t.references.includes(nummer)).slice(0,8).map(t => ({ nummer:t.number,
      originalUrl:t.sourceUrl,byteHash:t.byteHash,fristen:t.deadlines.map(f => ({ art:f.kind,tag:f.day,
        zeitpunkt:f.at,zeitzone:f.timezone,status:f.day < datum ? "abgelaufen" : !aktuell ? "unbestaetigt" : "geplant" })) })) }));
  const base = { version:1,sourceId:q.id,name:namen[q.key] || (q.art === "plenum" ? "Plenum" : "Sitzungswochen"),
    art:q.art,sourceUrl:q.url,standHash:s.standHash,belegHash:s.belegHash,gelesenAm:s.retrievedAt,
    aktuell,coverage:"partial",dokumentnummer:nummer,sitzungszuordnung:q.art === "plenum" ? "unbekannt" : "amtlicher Ausschussstand",
    originale:original.map(d => ({ url:d.url,hash:d.byteHash,veroeffentlicht:d.publishedDay,
      sitzungen:(d.meetings || []).map(m => ({ nummer:m.number,tag:m.day,beginn:m.startsAt })) })),
    sitzungen,termine,folgestand:"unbekannt",anwesenheitspflicht:false,beschluss:false };
  const { aktuell:_,...basis } = base;
  return { ...base,projektionsHash:E.hash(basis) };
}
async function mitGespeichertenStaenden(docs, deps = {}) {
  if (!Array.isArray(docs) || !docs.some(drucksache)) return docs;
  const staende = await leseStaende(deps), now = deps.now?.() ?? Date.now();
  if (!staende.length) return docs;
  return docs.map(d => {
    const nr = drucksache(d);
    if (!nr) return d;
    return { ...d,parlamentsOriginalbelege:staende.filter(r => r.stand && r.q.art !== "kalender")
      .map(r => projektion(r.q,r.stand,now,nr)).filter(Boolean) };
  });
}
function fuerMandat(sources, profile, now = new Date()) {
  return Object.fromEntries(Object.entries(sources || {}).map(([id,docs]) => [id,(Array.isArray(docs) ? docs : []).map(d => {
    if (!d || typeof d !== "object") return d;
    const { parlamentsBelege,parlamentsDokumentUrl,...clean } = d;
    const nr = drucksache(d);
    const belege = (Array.isArray(d.parlamentsOriginalbelege) ? d.parlamentsOriginalbelege : []).flatMap(b => {
      const q = E.QUELLEN.find(q => q.id === b.sourceId), r = q && rolle(profile,q);
      if (!r || !nutzbar(q) || !pruefeProjektion(b) || !nr || nr !== b.dokumentnummer || b.sourceUrl !== q.url
        || Date.parse(b.gelesenAm) > new Date(now).getTime()) return [];
      const aktuell = new Date(now).getTime()-Date.parse(b.gelesenAm) <= 24*3600000;
      const next = { ...b,rolle:r,aktuell,sitzungen:b.sitzungen.map(m => ({ ...m,tops:m.tops.map(t => ({ ...t,
        fristen:t.fristen.map(f => ({ ...f,status:f.tag < tag(now) ? "abgelaufen" : aktuell ? "geplant" : "unbestaetigt" })) })) })) };
      const { projektionsHash,rolle:profilRolle,aktuell:_,...basis } = next;
      next.projektionsHash = E.hash(basis);
      return [next];
    });
    return belege.length ? { ...clean,parlamentsBelege:belege,parlamentsDokumentUrl:Q.lese(d).bindung.url } : clean;
  })]));
}
function anzeige(doc, url) {
  const nr = drucksache(doc);
  const belege = (Array.isArray(doc?.parlamentsBelege) ? doc.parlamentsBelege : []).filter(b => {
    const q = E.QUELLEN.find(q => q.id === b.sourceId);
    return q && nutzbar(q) && pruefeProjektion(b) && b.dokumentnummer === nr
      && ["Hauptausschuss","Stellvertretung","Bundestagsmandat"].includes(b.rolle);
  });
  return nr && url === doc.parlamentsDokumentUrl && belege.length ? { parlamentsBelege:belege,parlamentsDokumentUrl:url } : {};
}
function terminAnlaesse(doc, profile, now) {
  if (!doc?.parlamentsOriginalbelege?.length) return [];
  const dip = Q.lese(doc), jetzt = new Date(now).getTime();
  if (dip?.vorgangsbezug?.length !== 1 || !doc.id || !Number.isFinite(jetzt)) return [];
  const heute = tag(jetzt), horizont = Date.parse(heute) + 7 * 864e5;
  const imFenster = t => t >= heute && Date.parse(t) <= horizont;
  const datumsanzeige = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
  const { v: [gebunden] } = fuerMandat({ v: [doc] }, profile, now);
  return (gebunden.parlamentsBelege || []).filter(b => b.art === "ausschuss" && b.aktuell).flatMap(b =>
    b.sitzungen.flatMap(s => {
      const beginn = Date.parse(s.beginn);
      if (s.stand !== "geplant" || s.konflikte.length || !(beginn > jetzt) || !imFenster(tag(beginn)) || s.tops.length !== 1) return [];
      const top = s.tops[0];
      const original = b.originale.find(o => o.url === top.originalUrl && o.hash === top.byteHash
        && o.veroeffentlicht && o.sitzungen.some(m => m.beginn === s.beginn && `${m.nummer}|${m.tag}` === s.kennung));
      if (!original || top.fristen.length > 1) return [];
      const f = top.fristen[0], schluss = Date.parse(f?.zeitpunkt);
      const offen = f && f.status === "geplant" && imFenster(f.tag) && f.tag <= tag(beginn)
        && (f.zeitpunkt ? schluss > jetzt && schluss <= beginn && tag(schluss) === f.tag : f.tag > heute);
      const frist = offen ? f : null;
      const termin = frist?.tag || tag(beginn), zeitpunkt = frist ? frist.zeitpunkt : s.beginn;
      const art = frist ? (termin === heute ? "heutige-frist" : "kommende-frist") : "bevorstehender-schritt";
      const fristart = frist?.art === "Stellungnahmen bis:" ? "Stellungnahmefrist" : "Votenfrist";
      const zeit = zeitpunkt ? datumsanzeige.format(new Date(zeitpunkt)) + " Uhr" : termin.split("-").reverse().join(".");
      const text = `${b.name}, ${top.nummer === "einzig" ? "einziger TOP" : `TOP ${top.nummer}`}, Drucksache ${b.dokumentnummer}. `
        + `${frist ? fristart : "Geplanter Sitzungsbeginn"} am ${zeit}.`;
      const satz = b.rolle === "Hauptausschuss" ? `Der TOP betrifft Ihren Hauptausschuss ${b.name}.`
        : `Der TOP betrifft Ihre Stellvertretung im Ausschuss ${b.name}.`;
      return [{ art, termin, documentIds: [doc.id], text: `${satz} ${text}`,
        recommendation: "Prüfen Sie die Drucksache und halten Sie die offenen Fragen für die Ausschussvorbereitung fest.",
        beleg: { documentId: doc.id, url: dip.bindung.url, publishedAt: doc.published_at, text,
          terminOriginal: { url: original.url, byteHash: original.hash, standHash: b.standHash,
            dipVorgangId: dip.vorgangsbezug[0].id, zeitpunkt } },
        profilbezug: { satz, belege: [{ art: b.rolle === "Hauptausschuss" ? "haupt" : "stellvertretung", text: satz }] } }];
    })).sort((a, b) => a.termin.localeCompare(b.termin)
      || (Date.parse(a.beleg.terminOriginal.zeitpunkt) || Infinity) - (Date.parse(b.beleg.terminOriginal.zeitpunkt) || Infinity));
}
async function leseKontext(profile, deps = {}) {
  if (!E.QUELLEN.some(q => rolle(profile,q) && nutzbar(q))) return null;
  const now = deps.now?.() ?? Date.now(), staende = await leseStaende(deps);
  const belege = staende.flatMap(({q,stand}) => {
    const r = rolle(profile,q);
    return r ? [{ ...(stand ? projektion(q,stand,now) : { sourceId:q.id,name:namen[q.key]||q.art,
      art:q.art,sourceUrl:q.url,aktuell:false,sitzungen:[],termine:[],originale:[],gelesenAm:null }),rolle:r }] : [];
  });
  return { version:1,coverage:"partial",belege,hinweis:"Planungsangaben; Durchführung, Beschlüsse und spätere Änderungen sind nicht bestätigt. Kein persönlicher Anwesenheits- oder Handlungsauftrag." };
}
async function ergaenzeAusgabe(briefing, profile, deps = {}) {
  if (!briefing || typeof briefing !== "object") return briefing;
  const kartenbeleg = require("./lage-kartenbeleg");
  const hatDipQuelle = value => value && typeof value === "object" && (
    value.parlamentsKontext || value.parlamentsBelege ||
    (value.name || value.sourceName) && /^https:\/\/dserver\.bundestag\.de\//.test(value.sourceUrl || value.url || "")
    || Object.values(value).some(v => v && typeof v === "object" && hatDipQuelle(v)));
  if (!hatDipQuelle(briefing) && !E.QUELLEN.some(q => rolle(profile,q) && nutzbar(q))
    && !(briefing.lageBriefing?.vorgaenge || []).some(kartenbeleg.hatGroessenordnung)) return briefing;
  const out = structuredClone(briefing), now = new Date(deps.now?.() ?? Date.now());
  if (out.lageBriefing) delete out.lageBriefing.parlamentsKontext;
  const kontext = await leseKontext(profile,deps);
  if (kontext) out.lageBriefing = { ...(out.lageBriefing || {}),parlamentsKontext:kontext };
  const state = briefing.currentHelmutState || {}, radar = briefing.currentRadarState || {};
  const idsSet = require("./tagespaket-auslieferung").vorgangIds({ lage:briefing.lageBriefing,
    briefing:state,radar:radar.anzeige || radar });
  // Helmut-Items tragen die interne Kennung auch als id. Verdeckte globale
  // Altitems/Paketabhaengigkeiten sind keine sichtbare Quellenanfrage.
  for (const item of [state.primaryItem,...(state.relatedItems || []),...(state.items || [])])
    if (typeof item?.id === "string") idsSet.add(item.id);
  const ids = [...idsSet].filter(id => /^[\p{L}\p{N}_-]{1,200}$/u.test(id)).slice(0,50);
  let sources = {};
  try { if (ids.length) sources = await (deps.storage || require("./storage")).getPruefSourcesByVorgaenge(
    ids.map(vorgang_id => ({ id:`ko-${vorgang_id}`,vorgang_id }))); } catch { /* Keine neue Metadatenbestaetigung. */ }
  sources = fuerMandat(sources,profile,now);
  if (Array.isArray(out.lageBriefing?.vorgaenge)) out.lageBriefing.vorgaenge = out.lageBriefing.vorgaenge.map(card => {
    if (!kartenbeleg.hatGroessenordnung(card)) return card;
    const docs = (sources[card.vorgangId || card.id] || []).filter(d => (card.sources || [])
      .some(s => s.url && (s.url === d.url || s.url === d.canonical_url)));
    return kartenbeleg.begrenzeEinordnung(card,docs);
  });
  const docs = [...new Map(Object.values(sources).flat().filter(d => Q.lese(d)).map(d => [d.id,d])).values()];
  const walk = value => {
    if (!value || typeof value !== "object") return;
    // Nur bereits ausgegebene Quellen bzw. quellgebundene Anzeigeobjekte;
    // keine Belegsaetze, Originaltexte, Hash-/Quittungsobjekte veraendern.
    const url = value.sourceUrl || value.url;
    if (typeof url === "string" && (value.name || value.sourceName)) {
      const id = value.documentId || value.quelleId;
      const matches = docs.filter(d => (d.url === url || d.canonical_url === url)
        && (id ? d.id === id : Array.isArray(value.sourceIds) ? value.sourceIds.includes(d.id)
          : value.title === d.title && value.publishedAt && Date.parse(value.publishedAt) === Date.parse(d.published_at)));
      delete value.parlamentsBelege;delete value.parlamentsDokumentUrl;
      if (matches.length === 1) {
        const d = matches[0], dip = require("./dip-beratungsstand").anzeige(d,url);
        if (dip) Object.assign(value,{ dipBeratungsstaende:dip,dipDokumentUrl:url });
        Object.assign(value,anzeige(d,url));
      }
    }
    for (const [key,v] of Object.entries(value)) {
      if (["gespeicherterNachweis","paketStatus","tagespaketGrundlage","vorherigerStand","parlamentsKontext",
        "parlamentsBelege","dipBeratungsstaende"].includes(key)) continue;
      if (v && typeof v === "object") walk(v);
    }
  };
  walk(out);
  return out;
}
module.exports = { rolle,drucksache,leseStaende,mitGespeichertenStaenden,fuerMandat,anzeige,terminAnlaesse,leseKontext,ergaenzeAusgabe };
