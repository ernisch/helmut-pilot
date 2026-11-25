"use strict";

const Radar = require("./radarState");
const Schutz = require("./publication-eligibility");
const { trustForSource } = require("./sourceSafety");
const { v1Sources } = require("./sources");
const { berlinTagKey } = require("./briefing-frische");
const { canonicalizeUrl, briefingArticleIdentity } = require("./dedup");

const ANZEIGE_LIMIT = 3;
const LESE_LIMIT = 24;
const FENSTER_MS = 7 * 864e5;

async function freigegebeneKarten(kandidaten, storage, policy) {
  if (!policy.hash) return kandidaten.map(k => k.karte);
  const belegt = kandidaten.filter(k => Array.isArray(k.links) && k.links.every(l =>
    l?.knowledge_objects?.id === l?.knowledge_object_id
    && typeof l?.knowledge_objects?.vorgang_id === "string" && l.knowledge_objects.vorgang_id));
  const kos = new Map(belegt.flatMap(k => k.links.map(l => [l.knowledge_object_id, l.knowledge_objects])));
  const erlaubt = kos.size ? await Schutz.filterCandidates(storage, [...kos.values()], policy) : [];
  const ids = new Set(erlaubt.map(k => k.id));
  return belegt.filter(k => k.links.every(l => ids.has(l.knowledge_object_id))).map(k => k.karte);
}

async function lese(profile, { now, storage }) {
  const parties = Radar.radarProfileTerms(profile).parties;
  if (!parties.size) return [];
  const quellen = new Map(v1Sources.filter(q => q.crawlMethod === "rss" && q.type === "party")
    .map(q => [q.id, Radar.radarParteiQuellenursprung({ url: q.rssUrl }, parties)])
    .filter(([, ursprung]) => ursprung));
  if (!quellen.size) return [];

  const policy = Schutz.current();
  const ende = now.getTime(), start = new Date(ende - FENSTER_MS);
  // Eine Analyse ändert nichts am Original. Bei aktiven Sperren zusätzlich
  // die vollständige Publikationsbindung verknüpfter Vorgänge prüfen.
  const verknuepfungen = policy.hash
    ? ",ko_document_links(knowledge_object_id,knowledge_objects(id,vorgang_id,best_source_url))" : "";
  const query = new URLSearchParams({
    select: "id,title,url,canonical_url,source_id,link_type,published_at,document_findings!inner(source_id,original_url,link_type)"
      + verknuepfungen,
    source_id: `in.(${[...quellen.keys()].join(",")})`,
    link_type: "eq.direct",
    "document_findings.link_type": "eq.direct",
    published_at: `gte.${start.toISOString()}`,
    order: "published_at.desc,id.asc",
    limit: String(LESE_LIMIT)
  });
  query.append("published_at", `lte.${now.toISOString()}`);
  const docs = await storage.supabaseRequest("/rest/v1/raw_documents?" + query, { timeoutMs: 1800 });
  Schutz.assertSame(policy);
  if (!Array.isArray(docs) || docs.length > LESE_LIMIT) throw new Error("radar-veroeffentlichungen-leseantwort");

  const kandidaten = docs.flatMap(doc => {
    const registriert = quellen.get(doc?.source_id), url = Radar.oeffnendeArtikelUrl(doc?.url);
    const ursprung = Radar.radarParteiQuellenursprung({ url }, parties);
    const title = typeof doc?.title === "string" ? doc.title.trim() : "";
    const zeit = Date.parse(doc?.published_at), identity = Schutz.identity(url);
    if (!registriert || ursprung?.publisherId !== registriert.publisherId || !identity
      || typeof doc.id !== "string" || !doc.id || !title || doc.link_type !== "direct"
      || !(zeit >= start.getTime() && zeit <= ende)
      || trustForSource({ url }) === "blockiert" || Schutz.held(null, [doc], policy)
      || !Array.isArray(doc.document_findings)
      || !doc.document_findings.some(f => f?.source_id === doc.source_id && f.link_type === "direct"
        && Schutz.identity(f.original_url) === identity)) return [];
    const fraktion = ursprung.relationType === "faction";
    return [{ links: doc.ko_document_links, karte: {
      id: "radar-veroeffentlichung-" + doc.id, documentId: doc.id, title, sourceUrl: url,
      sourceName: ursprung.publisherName, publishedAt: new Date(zeit).toISOString(),
      linkType: doc.link_type, sourceCategoryType: ursprung.relationType,
      sourceCategory: Radar.sourceCategoryLabel(ursprung.relationType), relationType: ursprung.relationType,
      relationLabel: fraktion ? "Veröffentlichung Ihrer Fraktion" : "Veröffentlichung Ihrer Partei",
      evidence: fraktion ? "Ihre Fraktion hat diese Meldung auf ihrer Website veröffentlicht."
        : "Ihre Partei hat diese Meldung auf ihrer Website veröffentlicht.",
      beobachtungsBeleg: { art: "eigene-veroeffentlichung", documentIds: [doc.id] },
      ursprungsBeleg: { ...ursprung, documentId: doc.id, url }
    } }];
  });
  return freigegebeneKarten(kandidaten, storage, policy);
}

function artikelSchluessel(item) {
  return [item.documentId && "id:" + item.documentId,
    item.sourceUrl && canonicalizeUrl(item.sourceUrl), briefingArticleIdentity(item.sourceUrl)].filter(Boolean);
}

function ergaenze(briefing, meldungen, now) {
  const roh = briefing.currentRadarState, ansicht = roh?.anzeige || roh;
  if (!ansicht || ansicht.environment?.party?.length || !meldungen?.length) return briefing;
  const environment = { constituency: [], committees: [], ...ansicht.environment, party: [] };
  const andere = [ansicht.mentions, ansicht.dynamics, ansicht.articles, environment.constituency,
    environment.committees].flat().filter(Boolean);
  const gesehen = new Set(andere.flatMap(artikelSchluessel));
  for (const meldung of meldungen) {
    const schluessel = artikelSchluessel(meldung);
    if (schluessel.some(key => gesehen.has(key))) continue;
    schluessel.forEach(key => gesehen.add(key));
    environment.party.push(meldung);
    if (environment.party.length === ANZEIGE_LIMIT) break;
  }
  if (!environment.party.length) return briefing;
  const count = environment.party.length;
  const hinweis = count === 1 ? "Eine Veröffentlichung Ihrer Partei oder Fraktion ist abrufbar."
    : `${count} Veröffentlichungen Ihrer Partei oder Fraktion sind abrufbar.`;
  const line1 = andere.length ? ansicht.summary?.line1 || hinweis : hinweis;
  const line2 = andere.length ? [ansicht.summary?.line2, line1 === hinweis ? "" : hinweis].filter(Boolean).join(" ") : "";
  const lastUpdated = [...andere, ...environment.party].map(item => item.publishedAt || item.lastUpdatedAt)
    .filter(t => Number.isFinite(Date.parse(t)) && Date.parse(t) <= now.getTime())
    .sort((a,b) => Date.parse(b) - Date.parse(a))[0];
  const status = roh.status === "error" ? "error" : berlinTagKey(lastUpdated) === berlinTagKey(now) ? "fresh" : "stale";
  return { ...briefing, currentRadarState: { ...roh, available: true, lastUpdated, status, emptyState: undefined,
    anzeige: { ...ansicht, available: true, lastUpdated, status, emptyState: undefined, environment,
      summary: { line1, line2, text: [line1, line2].filter(Boolean).join(" ") } } } };
}

module.exports = { lese, ergaenze };
