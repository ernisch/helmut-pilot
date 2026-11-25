"use strict";

const Radar = require("./radarState");
const Schutz = require("./publication-eligibility");
const { trustForSource } = require("./sourceSafety");
const { v1Sources, radarOrteNachQuelle } = require("./sources");
const { slug } = require("./matching");
const { quellenAusgabebelege } = require("./parlamentsbelege-produkt");
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
  const { parties, constituencies } = Radar.radarProfileTerms(profile);
  const parteiquellen = new Map(v1Sources.filter(q => q.crawlMethod === "rss" && q.type === "party")
    .map(q => [q.id, Radar.radarParteiQuellenursprung({ url: q.rssUrl }, parties)])
    .filter(([, ursprung]) => ursprung));
  const regionalquellen = new Map(Object.entries(radarOrteNachQuelle)
    .filter(([, ort]) => constituencies.has(slug(ort))));
  const listen = await Promise.all([
    leseQuellen(parteiquellen, { now, storage, parties }).catch(() => []),
    leseQuellen(regionalquellen, { now, storage }).catch(() => [])
  ]);
  return listen.flat();
}

async function leseQuellen(quellen, { now, storage, parties }) {
  if (!quellen.size) return [];
  const regional = !parties;
  const policy = Schutz.current();
  const ende = now.getTime(), start = new Date(ende - FENSTER_MS);
  // Eine Analyse ändert nichts am Original. Bei aktiven Sperren zusätzlich
  // die vollständige Publikationsbindung verknüpfter Vorgänge prüfen.
  const verknuepfungen = policy.hash
    ? ",ko_document_links(knowledge_object_id,knowledge_objects(id,vorgang_id,best_source_url))" : "";
  const query = new URLSearchParams({
    select: "id,title,url,canonical_url,source_id,link_type,published_at,document_findings!inner(source_id,original_url,retrieval_path_id,link_type)"
      + (regional ? ",aufgeloester_fund:raw->>originalUrl" : "") + verknuepfungen,
    [regional ? "document_findings.source_id" : "source_id"]: `in.(${[...quellen.keys()].join(",")})`,
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
    const url = Radar.oeffnendeArtikelUrl(doc?.url);
    const title = typeof doc?.title === "string" ? doc.title.trim() : "";
    const zeit = Date.parse(doc?.published_at), identity = Schutz.identity(url);
    if (!identity || typeof doc.id !== "string" || !doc.id || !title || doc.link_type !== "direct"
      || !(zeit >= start.getTime() && zeit <= ende) || trustForSource({ url }) === "blockiert"
      || Schutz.held(null, [doc], policy) || !Array.isArray(doc.document_findings)) return [];
    const bezug = regional ? regionalBezug(doc, quellen, url, identity) : parteiBezug(doc, quellen, parties, url, identity);
    if (!bezug) return [];
    return [{ links: doc.ko_document_links, karte: {
      id: "radar-veroeffentlichung-" + doc.id, documentId: doc.id, title, sourceUrl: url,
      publishedAt: new Date(zeit).toISOString(), linkType: doc.link_type, ...bezug
    } }];
  });
  return freigegebeneKarten(kandidaten, storage, policy);
}

function parteiBezug(doc, quellen, parties, url, identity) {
  const registriert = quellen.get(doc.source_id), ursprung = Radar.radarParteiQuellenursprung({ url }, parties);
  if (!registriert || ursprung?.publisherId !== registriert.publisherId
    || !doc.document_findings.some(f => f?.source_id === doc.source_id && f.link_type === "direct"
      && Schutz.identity(f.original_url) === identity)) return null;
  const fraktion = ursprung.relationType === "faction";
  return { sourceName: ursprung.publisherName, sourceCategoryType: ursprung.relationType,
    sourceCategory: Radar.sourceCategoryLabel(ursprung.relationType), relationType: ursprung.relationType,
    relationLabel: fraktion ? "Veröffentlichung der Fraktion" : "Veröffentlichung Ihrer Partei",
    evidence: fraktion ? "Die Fraktion hat diese Meldung auf ihrer Website veröffentlicht."
      : "Ihre Partei hat diese Meldung auf ihrer Website veröffentlicht.",
    beobachtungsBeleg: { art: "eigene-veroeffentlichung", documentIds: [doc.id] },
    ursprungsBeleg: { ...ursprung, documentId: doc.id, url } };
}

function regionalBezug(doc, quellen, url, identity) {
  const aufgeloest = Schutz.identity(doc.aufgeloester_fund);
  const fund = doc.document_findings.find(f => {
    const ort = quellen.get(f?.source_id), fundUrl = Schutz.identity(f?.original_url);
    return ort && f.link_type === "direct" && fundUrl && Radar.docStuetztWahlkreis({ title: doc.title }, ort)
      && (fundUrl === identity || (fundUrl.startsWith("https://news.google.com/rss/articles/")
        && fundUrl === aufgeloest && f.retrieval_path_id === "rp-" + f.source_id));
  });
  if (!fund) return null;
  const ort = quellen.get(fund.source_id);
  return { segment: "constituency", sourceName: new URL(url).hostname.replace(/^www\./, ""),
    sourceCategoryType: "local", sourceCategory: Radar.sourceCategoryLabel("local"), relationType: "constituency",
    relationLabel: "Meldung aus dem Wahlkreis", evidence: `Der Originaltitel nennt ${ort}.`,
    beobachtungsBeleg: { art: "wahlkreis-veroeffentlichung", documentIds: [doc.id] } };
}

function ausschussOriginale(kontext, profile, now) {
  if (!Array.isArray(kontext?.belege) || !kontext.belege.length) return [];
  const belege = new Set(quellenAusgabebelege(kontext, profile, now.getTime()).map(b => b.sourceId));
  if (!belege.size) return [];
  let policy;
  try { policy = Schutz.current(); } catch { return []; }
  const beginn = berlinTagKey(new Date(now.getTime() - FENSTER_MS));
  const tag = berlinTagKey(now);
  return (kontext?.belege || []).filter(b => b.art === "ausschuss" && belege.has(b.sourceId)).flatMap(b =>
    b.originale.flatMap(d => {
      const url = Radar.oeffnendeArtikelUrl(d.url), publiziert = d.veroeffentlicht;
      if (!url || !publiziert || publiziert < beginn || publiziert > tag
        || trustForSource({ url }) === "blockiert" || Schutz.held(null, [{ url }], policy)) return [];
      const titel = `Amtliche Unterlage des Ausschusses für ${b.name}`;
      return [{ id: "radar-ausschuss-" + d.hash, segment: "committees", title: titel, sourceUrl: url,
        sourceName: "Deutscher Bundestag", publishedAt: publiziert, linkType: "direct",
        sourceCategoryType: "committee", sourceCategory: Radar.sourceCategoryLabel("committee"), relationType: "committee",
        relationLabel: b.rolle === "Stellvertretung" ? "Stellvertretung im Ausschuss" : "Unterlage Ihres Ausschusses",
        evidence: `Der Deutsche Bundestag hat die Unterlage für ${b.name} veröffentlicht.`,
        beobachtungsBeleg: { art: "ausschuss-veroeffentlichung", standHash: b.standHash } }];
    })).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function artikelSchluessel(item) {
  return [item.documentId && "id:" + item.documentId,
    item.sourceUrl && canonicalizeUrl(item.sourceUrl), briefingArticleIdentity(item.sourceUrl)].filter(Boolean);
}

function ergaenze(briefing, meldungen, now, profile = null) {
  const roh = briefing.currentRadarState, ansicht = roh?.anzeige || roh;
  if (!ansicht) return briefing;
  const segmente = ["party", "constituency", "committees"];
  const environment = Object.fromEntries(segmente.map(k => [k,
    Array.isArray(ansicht.environment?.[k]) ? ansicht.environment[k] : []]));
  const andere = [ansicht.mentions, ansicht.dynamics, ansicht.articles, ...Object.values(environment)].flat().filter(Boolean);
  const gesehen = new Set(andere.flatMap(artikelSchluessel));
  const kandidaten = [...(meldungen || []), ...(profile && !environment.committees.length
    ? ausschussOriginale(briefing.lageBriefing?.parlamentsKontext, profile, now) : [])];
  const neu = [];
  for (const segment of segmente) {
    if (environment[segment].length) continue;
    const karten = [];
    for (const meldung of kandidaten) {
      if ((meldung.segment || "party") !== segment) continue;
      const schluessel = artikelSchluessel(meldung);
      if (schluessel.some(key => gesehen.has(key))) continue;
      schluessel.forEach(key => gesehen.add(key));
      karten.push(meldung);
      if (karten.length === ANZEIGE_LIMIT) break;
    }
    neu.push(...karten);
    environment[segment] = karten;
  }
  if (!neu.length) return briefing;
  const count = neu.length;
  const hinweis = count === 1 ? "Eine Originalveröffentlichung aus Ihrem Umfeld ist abrufbar."
    : `${count} Originalveröffentlichungen aus Ihrem Umfeld sind abrufbar.`;
  const line1 = andere.length ? ansicht.summary?.line1 || hinweis : hinweis;
  const line2 = andere.length ? [ansicht.summary?.line2, line1 === hinweis ? "" : hinweis].filter(Boolean).join(" ") : "";
  const lastUpdated = [...andere, ...neu].map(item => item.publishedAt || item.lastUpdatedAt)
    .filter(t => Number.isFinite(Date.parse(t)) && Date.parse(t) <= now.getTime())
    .sort((a,b) => Date.parse(b) - Date.parse(a))[0];
  const status = roh.status === "error" ? "error" : berlinTagKey(lastUpdated) === berlinTagKey(now) ? "fresh" : "stale";
  return { ...briefing, currentRadarState: { ...roh, available: true, lastUpdated, status, emptyState: undefined,
    anzeige: { ...ansicht, available: true, lastUpdated, status, emptyState: undefined, environment,
      summary: { line1, line2, text: [line1, line2].filter(Boolean).join(" ") } } } };
}

module.exports = { lese, ergaenze };
