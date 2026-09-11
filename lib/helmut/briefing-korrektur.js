"use strict";

// Rein lokaler/lesender Entwurfsadapter. Die Bindung ersetzt KEIN Fachurteil.
// Ganze Ersatzobjekte verhindern, dass unbelegte Altanalysen weitervererbt werden.
const { hash } = require("./briefing-speicher");
const VERSION = 1;
const fail = () => { throw new Error("briefing-korrektur-abweichend"); };
const keys = (v, names) => v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).every(k => names.includes(k)) && names.every(k => Object.hasOwn(v, k));
const text = v => typeof v === "string" && v.trim().length > 0;
const unique = a => Array.isArray(a) && a.every(text) && new Set(a).size === a.length;
const sameSet = (a, b) => unique(a) && unique(b) && a.length === b.length && a.every(x => b.includes(x));

function kontext({ profile, kos, sichtbareVorgaenge }) {
  return { profilDatenHash: hash(profile), wissensDatenHash: hash(kos), sichtbareVorgaenge };
}

function wendeAn({ eingabe, profile, kos, sourcesByVorgang, korrektur }) {
  const { eingabeHash, ...inhalt } = eingabe || {};
  if (!eingabeHash || hash(inhalt) !== eingabeHash || profile?.id !== eingabe.mandat
    || !keys(korrektur, ["version", "ursprungHash", "entwuerfe", "auslassungen"])
    || korrektur.version !== VERSION || korrektur.ursprungHash !== eingabeHash
    || hash(eingabe.korrekturKontext) !== hash(kontext({ profile, kos,
      sichtbareVorgaenge: eingabe.korrekturKontext?.sichtbareVorgaenge }))) fail();
  const quellen = require("./briefing-aussagenbindung").quellenVertrag(sourcesByVorgang);
  if (hash(quellen) !== hash(eingabe.quellen)) fail();
  const { entwuerfe, auslassungen } = korrektur;
  if (!Array.isArray(entwuerfe) || !entwuerfe.length || !Array.isArray(auslassungen)
    || auslassungen.some(a => !keys(a, ["vorgangId", "begruendung"]) || !text(a.begruendung))) fail();
  const ids = [...entwuerfe, ...auslassungen].map(r => r?.vorgangId);
  if (!sameSet(ids, eingabe.korrekturKontext.sichtbareVorgaenge)) fail();
  const nextKos = [], nextSources = {};
  for (const r of entwuerfe) {
    if (!keys(r, ["vorgangId", "begruendung", "quellenIds", "inhalt"]) || !text(r.begruendung)
      || !unique(r.quellenIds) || !r.quellenIds.length) fail();
    const old = kos.filter(k => k.vorgang_id === r.vorgangId);
    if (old.length !== 1) fail();
    const d = r.inhalt;
    if (!keys(d, ["titel", "zusammenfassung", "mandatsbezug", "handlung", "kommunikation", "ausschuesse", "ebene"])
      || ![d.titel, d.zusammenfassung, d.mandatsbezug, d.handlung, d.kommunikation].every(text)
      || !unique(d.ausschuesse) || !["bund", "land", "kommune", "eu", "international"].includes(d.ebene)) fail();
    const docs = r.quellenIds.map(id => {
      const found = (sourcesByVorgang[r.vorgangId] || []).filter(q => q.id === id);
      if (found.length !== 1 || !require("./lage-quellenbeleg").artikelUrl(found[0].url || found[0].canonical_url)) fail();
      return structuredClone(found[0]);
    });
    // Doppelte URLs oder identische gespeicherte Inhalte zaehlen nicht mehrfach.
    if (new Set(docs.map(q => q.url || q.canonical_url)).size !== docs.length
      || new Set(docs.map(q => hash({ title: q.title, summary: q.summary }))).size !== docs.length) fail();
    const k = old[0];
    nextKos.push({ id: k.id, vorgang_id: k.vorgang_id, status: k.status,
      understanding_status: "complete", created_at: k.created_at, updated_at: k.updated_at,
      display_title: d.titel, headline: d.titel, display_summary: d.zusammenfassung,
      was_ist_passiert: d.zusammenfassung, why_relevant: d.mandatsbezug, warum_wichtig: d.mandatsbezug,
      recommendation: d.handlung, handlungsempfehlung: d.handlung,
      recommended_communication: d.kommunikation,
      recommended_communication_struct: { communicationLine: d.kommunikation,
        recommendedChannel: "internal", recommendedFormat: "none", suggestedOutputs: [] },
      action_items: [d.handlung], action_items_struct: [], ausschuesse: [...d.ausschuesse],
      decision_level: d.ebene, political_level: d.ebene, mentioned_committees: [],
      risiken: [], chancen: [], deadline: null, zeitdruck: "", risk_of_no_action: "", opportunity_summary: "",
      risk_level: "unknown", opportunity_level: "unknown", confidence_score: null, classification_confidence: null,
      source_document_count: docs.length, best_source_url: docs[0].url || docs[0].canonical_url, best_link_type: "direct" });
    nextSources[r.vorgangId] = docs;
  }
  return { kos: nextKos, sourcesByVorgang: nextSources, korrekturHash: hash(korrektur),
    umfang: { eingeleseneVorgaenge: kos.length, vorherSichtbar: ids.length, entwuerfe: entwuerfe.length,
      zurueckgehalten: auslassungen.length, ausserhalbDerAuswahl: kos.length - ids.length,
      vollstaendigeFaktenpruefung: false,
      hinweis: `Diese Entwurfsansicht umfasst ${entwuerfe.length} von ${ids.length} zuvor angezeigten Vorgängen. `
        + `${auslassungen.length} Vorgänge wurden zur Klärung zurückgehalten. Weitere Vorgänge sind nicht einbezogen. `
        + "Die fachliche Abnahme steht aus." } };
}

module.exports = { VERSION, kontext, wendeAn };
