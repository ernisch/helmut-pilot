"use strict";

// Rein lesender Vertrag fuer eine separate fachliche Briefingpruefung.
// Diese Datei beurteilt keine Bedeutung durch Worttreffer. Sie prueft, ob ein
// extern erstelltes Urteil ALLE Ausgabetexte und genau ihren Kontext abdeckt.
// Kein Modell, kein Quellenabruf, kein Schreiben, kein automatisches Review.
const { hash, profilHash } = require("./briefing-speicher");
const { berlinTagKey } = require("./briefing-frische");
const VERSION = 2;
const SLOT = "briefing-aussagen";
const META = new Set(["id", "engine", "status", "reason", "url", "linkType", "link_type",
  "decision", "priority", "priorityType", "priority_type", "current_priority", "previous_priority",
  "action_type", "generatedAt", "generated_at", "updatedAt", "updated_at", "publishedAt",
  "published_at", "createdAt", "created_at", "sourceType", "source_type", "briefingType"]);
const TECHNISCH = /(?:Id|Ids|_id|_ids)$/;
const pfadteil = s => String(s).replace(/~/g, "~0").replace(/\//g, "~1");
const ENUMS = {
  riskLevel: ["unknown", "low", "medium", "high"], opportunityLevel: ["unknown", "low", "medium", "high"],
  recommendedChannel: ["internal", "none"], recommendedFormat: ["none"], actionType: ["unknown"],
  helmutQualityStatus: ["partial", "complete", "error"], qualityStatus: ["partial", "complete", "error"],
  priorityStatus: ["stable", "risk", "chance"], urgency: ["unknown", "low", "medium", "high"],
  priorityLabel: ["Relevant", "Beobachten", "Reagieren", "Ignorieren"], source: ["deterministic"]
};
// Nur bekannte Ausgabezusammenfassungen beziehen sich auf den Vertrag selbst.
// Unbekannte Fachfelder bleiben zwingend artikelgebundene Aussagen.
const AUSGABEPFAD = /^(?:\/helmutAssessment\/(?:greeting|assessment)|\/executiveSummary|\/currentRadarState\/(?:anzeige\/)?summary\/(?:line1|line2|text)|\/pruefumfang\/hinweis)$/;

function texte(briefing, { kos = [], quellen = [] } = {}) {
  const out = [];
  const vorgaenge = new Map(kos.map(k => [k.id, k.vorgang_id]));
  const vorgangIds = new Set([...kos.map(k => k.vorgang_id), ...quellen.map(q => q.vorgangId)]);
  function walk(value, path = "", vorgangId = null) {
    if (!value || typeof value !== "object") return;
    const bezug = value.vorgangId || value.vorgang_id || vorgaenge.get(value.knowledgeObjectId || value.signalId)
      || (vorgangIds.has(value.id) ? value.id : null) || value.primaryVorgangId || vorgangId;
    for (const [key, v] of Object.entries(value)) {
      const p = path + "/" + pfadteil(key);
      // Quellen werden separat wortgetreu gebunden. Radar rendert anzeige,
      // nicht die daneben erhaltenen internen Zuordnungen.
      if (["sources", "primarySource", "debugPrimary", "debugRadarRelations"].includes(key)) continue;
      if (key === "currentRadarState" && v?.anzeige) { walk(v.anzeige, p + "/anzeige", bezug); continue; }
      // Kennungsarrays sind ebenso Metadaten wie einzelne Kennungen.
      // Der vollstaendige DarstellungsHash bindet sie weiterhin.
      if (typeof v === "string" && (META.has(key) || TECHNISCH.test(key))) continue;
      if (TECHNISCH.test(key) && Array.isArray(v) && v.every(x => typeof x === "string")) continue;
      if (ENUMS[key]?.includes(v) || (key === "type" && /\/matchedFeatures\/\d+$/.test(path)
        && ["ausschuss", "thema", "wahlkreis", "partei", "person"].includes(v))) continue;
      if (["lastUpdatedAt", "lastUpdated", "meldungAt", "datenstandTag"].includes(key)
        && typeof v === "string" && /^\d{4}-\d{2}-\d{2}(?:T[\d:.+Z-]+)?$/.test(v) && Number.isFinite(Date.parse(v))) continue;
      if ((key === "sourceUrl" && quellen.some(q => q.url === v && (!bezug || q.vorgangId === bezug)))
        || (key === "sourceName" && quellen.some(q => q.herausgeber === v && (!bezug || q.vorgangId === bezug)))) continue;
      const auswertungsBezug = path === "/helmutAssessment"
        ? (["recommendation", "whyImportant"].includes(key) ? briefing.items?.[0]?.vorgangId
          : ["risk", "chance"].includes(key) ? briefing.items?.find(i => i.priorityType === key)?.vorgangId : null) : null;
      if (typeof v === "string" && v.trim())
        out.push({ pfad: p, text: v, vorgangId: AUSGABEPFAD.test(p) ? null : auswertungsBezug || bezug,
          art: AUSGABEPFAD.test(p) ? "ausgabe" : "fachaussage" });
      else if (v && typeof v === "object") walk(v, p, bezug);
    }
  }
  walk(briefing);
  return out;
}

function quellenVertrag(sourcesByVorgang = {}) {
  return Object.entries(sourcesByVorgang).sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([vorgangId, docs]) => (docs || []).map(d => ({ vorgangId, documentId: d.id,
      url: d.url || d.canonical_url || "", titel: d.title || "", auszug: d.summary || "",
      herausgeber: d.source_name || "", veroeffentlichtAm: d.published_at || null })))
    .sort((a, b) => `${a.vorgangId}:${a.documentId}`.localeCompare(`${b.vorgangId}:${b.documentId}`));
}

function baueEingabe({ briefing, sourcesByVorgang = {}, profile, userId, day, kos = [], korrekturHash = null }) {
  if (!profile || profile.id !== userId || !/^\d{4}-\d{2}-\d{2}$/.test(day || ""))
    throw new Error("briefing-aussagen-kontext-abweichend");
  const quellen = quellenVertrag(sourcesByVorgang);
  // Auch Rangfolge, Zahlen und Zuordnungen gehoeren zum geprueften Vertrag.
  // Nur der reine Abrufzeitstempel und optionale Debugausgaben sind fluechtig.
  function stabilerVertrag(v) {
    if (Array.isArray(v)) return v.map(stabilerVertrag);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v)
      .filter(([k]) => !["generatedAt", "debugPrimary", "debugRadarRelations"].includes(k))
      .map(([k, value]) => [k, stabilerVertrag(value)]));
    return v;
  }
  const inhalt = { version: VERSION, mandat: userId, tag: day, profilHash: profilHash(profile),
    profil: require("./lage-textqualitaet").profilKontext(profile),
    darstellungsHash: hash(stabilerVertrag(briefing)),
    aussagen: texte(briefing, { kos, quellen }), quellen, korrekturHash,
    korrekturKontext: require("./briefing-korrektur").kontext({ profile, kos,
      sichtbareVorgaenge: [...new Set((briefing.items || []).map(i => i.vorgangId).filter(Boolean))] }) };
  return { ...inhalt, eingabeHash: hash(inhalt) };
}

function pruefe(eingabe, urteil) {
  const fehler = new Set();
  const fail = grund => ({ bereit: false, grund, fehler: [...fehler], vollstaendigeFaktenpruefung: false });
  if (!urteil) return fail("briefing-aussagenpruefung-fehlt");
  const { eingabeHash, ...inhalt } = eingabe || {};
  if (inhalt.version !== VERSION || eingabeHash !== hash(inhalt)
    || urteil.version !== VERSION || urteil.eingabeHash !== eingabeHash)
    return fail("briefing-aussagenpruefung-veraltet");
  const rows = urteil.aussagen;
  if (!eingabe.aussagen?.length || !Array.isArray(rows) || rows.length !== eingabe.aussagen.length
    || new Set(rows.map(r => r?.pfad)).size !== rows.length)
    return fail("briefing-aussagenpruefung-unvollstaendig");
  for (const a of eingabe.aussagen) {
    const r = rows.find(x => x?.pfad === a.pfad);
    if (!r || r.text !== a.text || typeof r.begruendung !== "string" || !r.begruendung.trim()) {
      fehler.add("aussage-nicht-geprueft"); continue;
    }
    // Getrennte positive Sachurteile sind zwingend. Ein gueltiges Teilzitat
    // darf ein negatives Urteil ueber Rollen, Ereignisse oder Folgen nie heilen.
    if (r.sachlichGetragen !== true) fehler.add("aussage-unbelegt");
    if (r.kontextGetragen !== true) fehler.add("aussage-kontext-abweichend");
    if (r.mandatsbezugGetragen !== true) fehler.add("mandatsbezug-unbelegt");
    if (a.art === "ausgabe") {
      // Zaehler, Begruessung und Auswahleinschraenkung werden gegen die
      // komplette Ausgabe fachlich geprueft, nicht mit beliebigen Artikelzitaten.
      if (r.ausgabeBeleg !== eingabe.darstellungsHash) fehler.add("ausgabebezug-fehlt");
      continue;
    }
    if (!Array.isArray(r.belege) || !r.belege.length) fehler.add("belegstelle-fehlt");
    for (const b of r.belege || []) {
      const docs = eingabe.quellen.filter(q => q.vorgangId === b?.vorgangId && q.documentId === b?.documentId);
      const q = docs.length === 1 && docs[0];
      const original = q && ["titel", "auszug"].includes(b.feld) && q[b.feld];
      if (!q || (a.vorgangId && a.vorgangId !== q.vorgangId)
        || !require("./lage-quellenbeleg").artikelUrl(q.url)
        || typeof original !== "string" || typeof b.text !== "string" || b.text.trim().length < 12
        || !original.includes(b.text)) fehler.add("belegstelle-ungueltig");
    }
  }
  if (fehler.size) return fail("briefing-aussagenpruefung-abgelehnt");
  return { bereit: true, grund: null, fehler: [], eingabeHash, gepruefteAussagen: rows.length,
    methode: "separates-fachurteil-und-exakte-belegstellen", vollstaendigeFaktenpruefung: false };
}

// Eine Auslassung betrifft einen ganzen Vorgang VOR Ranking und Vertragsbau.
// So verschwinden auch seine Handlung, Begruendung und saemtliche UI Aliase.
function auslassungen(eingabe, urteil) {
  const ids = urteil?.ausgelasseneVorgaenge;
  const bekannte = new Set((eingabe?.quellen || []).map(q => q.vorgangId));
  if (urteil?.ursprungHash !== eingabe?.eingabeHash || !Array.isArray(ids)
    || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string" || !bekannte.has(id)))
    throw new Error("briefing-aussagen-auslassung-abweichend");
  return [...ids];
}

async function leseFuerNachlauf({ profile, userId, build, storage = require("./storage"), now = new Date() }) {
  storage.assertTenant(userId, "briefingAussagenLesen");
  if (profile?.id !== userId) throw new Error("briefing-aussagen-kontext-abweichend");
  const day = berlinTagKey(now);
  const row = await storage.getRenderedBriefingV3(userId, SLOT, day, { strict: true });
  if (!row) return { bereit: false, grund: "briefing-aussagenpruefung-fehlt" };
  if (row.user_id !== userId || row.slot !== SLOT || row.id !== `bf-${userId}-${SLOT}-${day}`)
    throw new Error("briefing-aussagen-kontext-abweichend");
  const original = await build(profile, userId, { aussagenEingabe: true, now });
  if (row.payload?.korrektur) {
    const result = await build(profile, userId, { aussagenEingabe: true, now,
      aussagenKorrektur: row.payload.korrektur });
    if (row.payload.korrektur.ursprungHash !== original.eingabe.eingabeHash)
      throw new Error("briefing-korrektur-abweichend");
    const check = pruefe(result.eingabe, row.payload);
    if (!result.briefing?.available) return { bereit: false, grund: "briefing-aussagen-ohne-fachinhalt" };
    return { ...check, ...(check.bereit ? { briefing: result.briefing } : {}) };
  }
  const ids = auslassungen(original.eingabe, row.payload);
  const result = ids.length ? await build(profile, userId,
    { aussagenEingabe: true, aussagenAuslassungen: ids, now }) : original;
  const check = pruefe(result.eingabe, row.payload);
  if (!result.briefing?.available) return { bereit: false, grund: "briefing-aussagen-ohne-fachinhalt" };
  return { ...check, ...(check.bereit ? { briefing: result.briefing } : {}) };
}

module.exports = { VERSION, SLOT, texte, quellenVertrag, baueEingabe, pruefe, auslassungen, leseFuerNachlauf };
