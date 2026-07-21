"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Repraesentativer Startkatalog (Phase 6).
//
// Reine Daten + reiner Builder. KEIN Netz, keine KI, kein Storage-Write. Dies ist ein
// VORBEREITETER Seed (Fixture) — er wird NICHT automatisch in Production geschrieben.
//
// Prinzipien (Auftrag Phase 6):
//   * Kein vollstaendiger Deutschland-Import auf einmal, sondern ein repraesentativer,
//     ueberpruefbarer Startkatalog.
//   * Jede Quelle ist belegbar: reale, langjaehrig stabile oeffentliche Domains; discovery_origin
//     + evidence_url dokumentieren die Herkunft. KEINE erfundenen URLs.
//   * Keine Quelle springt auf 'active' ohne Prüfung: neue Quellen tragen ehrliche Prüfstatus
//     (viele amtliche Kernquellen sind bereits im Alt-Betrieb belegt -> 'active'; neue/ungeprüfte
//     tragen 'classified'/'released'/'restricted' etc.).
//   * Suchanbieter (Google News) erscheinen NUR dort, wo sie heute real die einzige Abdeckung
//     sind (Ausschuesse) — die Coverage-Matrix macht diese Abhaengigkeit sichtbar (Abnahme §9).
//
// Belegte Sonderfaelle: BMWE = bundeswirtschaftsministerium.de (2025 umbenannt, per Recherche
// verifiziert; alte Domain bmwi.de -> 'superseded'). BSW = bsw-vg.de (verifiziert).

const { buildSourceRecord } = require("../source-record");
const { POLITICAL_ENTITIES } = require("../../seeds/entities");
const { MASTER_ENTITIES_EXTRA } = require("./entities-extra");
const { GEOGRAPHIES } = require("../../seeds/geographies");
const { COMMITTEE_RELATIONS } = require("../../seeds/mandate-registry");

// Sprint 5 (Datenbefuellung): Ministeriums-Ressort -> Politikfelder (Ausschuss-Schluessel),
// ABGELEITET aus der EINEN Mandatswahrheit (Sprint 1, COMMITTEE_RELATIONS). Damit werden amtliche
// Ministerien zu belegten PRIMAERQUELLEN fuer ihr Fachgebiet — statt Google-News-Alleinversorgung
// der Ausschuesse. Nur belegte Ressortzuschnitte (keine Schaetzung); Politikfelder ohne belegtes
// Ministerium (Petitionen/Europa/Sport/…) bleiben ehrlich ungetaggt.
const MINISTRY_NAME_TO_ENTITY = {
  "BMWK": "ministry-bmwe", "BMJ": "ministry-bmj", "BMDV": "ministry-bmv", "BMUV": "ministry-bmuv",
  "BMBF": "ministry-bmbf", "BMVg": "ministry-bmvg", "BMEL": "ministry-bmel", "BMZ": "ministry-bmz",
  "BMWSB": "ministry-bmwsb", "Auswärtiges Amt": "ministry-auswaertiges-amt"
};
const MINISTRY_POLICY_TOPICS = (() => {
  const map = {};
  for (const [committeeKey, rel] of Object.entries(COMMITTEE_RELATIONS)) {
    if (!rel || !rel.policyField) continue; // Verfahrensgremien (Petitionen) haben kein Politikfeld
    const entity = rel.ministryEntity || (rel.ministry && MINISTRY_NAME_TO_ENTITY[rel.ministry]) || null;
    if (!entity) continue;                   // kein belegtes Ministerium -> ehrlich ungetaggt
    if (!map[entity]) map[entity] = [];
    if (!map[entity].includes(committeeKey)) map[entity].push(committeeKey);
  }
  return map;
})();

// Fester, injizierbarer Entdeckungszeitpunkt (Determinismus; kein Date.now() im Seed).
const SEED_DISCOVERED_AT = "2026-07-21";

const ALL_ENTITIES = [...POLITICAL_ENTITIES, ...MASTER_ENTITIES_EXTRA];
const ENTITY_BY_ID = new Map(ALL_ENTITIES.map((e) => [e.id, e]));

// Kompakter Definitions-Helfer. d=Domain, u=URL (Default https://d), m=Methode, t=Typ.
function def(o) { return o; }

function urlFor(o) {
  if (o.u) return o.u;
  if (o.d) return `https://${o.d}`;
  return null;
}

// Reine Daten-/Statistikquellen verarbeiten keine personenbezogenen Mandatsdaten -> 'unbedenklich'
// (statt der ueberzogenen Default-Zusage 'oeffentliche_mandatsdaten'; Review-Fund). Alle uebrigen
// (politische Institutionen, Parteien, Medien, Gerichte, Verbaende) beziehen sich auf oeffentliche
// politische/Mandatsaktivitaet.
const NO_PERSONAL_DATA_TYPES = new Set(["datenportal", "behoerde"]);
function defaultPrivacy(sourceType) {
  return NO_PERSONAL_DATA_TYPES.has(sourceType) ? "unbedenklich" : "oeffentliche_mandatsdaten";
}

// --- 1) Amtliche Bundesinstitutionen ---------------------------------------------------------
const INSTITUTIONS = [
  def({ id: "seed-dip", d: "dip.bundestag.de", u: "https://search.dip.bundestag.de/api/v1", m: "api", t: "parlament", inst: "parliament-bundestag", rev: "active", lic: "offen_erlaubt", orig: "structured_dataset", ev: "https://dip.bundestag.de", tr: "hoch" }),
  def({ id: "seed-bundestag-html", d: "bundestag.de", m: "html", t: "parlament", inst: "parliament-bundestag", rev: "restricted", lic: "unbewertet", orig: "official_directory", ev: "https://www.bundestag.de", tr: "hoch", note: "Direkter HTML-Abruf im Alt-Betrieb bot-limitiert -> eingeschraenkt; DIP ist der belastbare Primaerweg." }),
  def({ id: "seed-bundesrat", d: "bundesrat.de", m: "html", t: "bundesrat", inst: "parliament-bundesrat", rev: "active", lic: "presse_erlaubt", orig: "official_directory", ev: "https://www.bundesrat.de", tr: "hoch" }),
  def({ id: "seed-bundesregierung", d: "bundesregierung.de", m: "html", t: "bundesregierung", inst: "government-bund", rev: "active", lic: "unbewertet", orig: "official_directory", ev: "https://www.bundesregierung.de", tr: "hoch", note: "Rechtliche Bewertung (Pressenutzung) noch offen -> als Luecke gefuehrt." }),
  def({ id: "seed-destatis", d: "destatis.de", m: "html", t: "datenportal", inst: "statoffice-destatis", rev: "active", lic: "offen_erlaubt", orig: "structured_dataset", ev: "https://www.destatis.de", tr: "hoch" }),
  def({ id: "seed-govdata", d: "govdata.de", m: "html", t: "datenportal", inst: "portal-govdata", rev: "released", lic: "offen_erlaubt", orig: "structured_dataset", ev: "https://www.govdata.de", tr: "hoch" }),
  def({ id: "seed-brh", d: "bundesrechnungshof.de", m: "html", t: "rechnungshof", inst: "authority-bundesrechnungshof", rev: "active", lic: "presse_erlaubt", orig: "official_directory", ev: "https://www.bundesrechnungshof.de", tr: "hoch" }),
  def({ id: "seed-bverfg", d: "bundesverfassungsgericht.de", m: "html", t: "gericht", inst: "court-bverfg", rev: "active", lic: "presse_erlaubt", orig: "official_directory", ev: "https://www.bundesverfassungsgericht.de", tr: "hoch" }),
  def({ id: "seed-ba-statistik", d: "statistik.arbeitsagentur.de", m: "html", t: "behoerde", inst: "authority-bundesagentur-arbeit", rev: "active", lic: "offen_erlaubt", orig: "structured_dataset", ev: "https://statistik.arbeitsagentur.de", tr: "hoch" })
];

// --- 2) Bundesministerien (Basis 6 + Ergaenzung 9) -------------------------------------------
const MINISTRY_DEFS = [
  ["ministry-bmas", "bmas.de", "active", "presse_erlaubt"],
  ["ministry-bmg", "bundesgesundheitsministerium.de", "active", "presse_erlaubt"],
  ["ministry-bmf", "bundesfinanzministerium.de", "active", "presse_erlaubt"],
  ["ministry-bmi", "bmi.bund.de", "active", "presse_erlaubt"],
  ["ministry-auswaertiges-amt", "auswaertiges-amt.de", "active", "presse_erlaubt"],
  ["ministry-bmfsfj", "bmfsfj.de", "active", "presse_erlaubt"],
  ["ministry-bmwe", "bundeswirtschaftsministerium.de", "active", "presse_erlaubt"],
  ["ministry-bmuv", "bmuv.de", "released", "presse_erlaubt"],
  ["ministry-bmbf", "bmbf.de", "released", "presse_erlaubt"],
  ["ministry-bmvg", "bmvg.de", "classified", "unbewertet"],
  ["ministry-bmel", "bmel.de", "active", "presse_erlaubt"],
  ["ministry-bmz", "bmz.de", "classified", "unbewertet"],
  ["ministry-bmv", "bmdv.bund.de", "legally_checked", "presse_erlaubt"],
  ["ministry-bmwsb", "bmwsb.bund.de", "classified", "unbewertet"],
  ["ministry-bmj", "bmj.de", "active", "presse_erlaubt"]
].map(([inst, d, rev, lic]) => def({
  id: `seed-${inst}`, d, m: "html", t: "ministerium", inst, rev, lic,
  orig: "official_directory", ev: `https://www.${d.replace(/^www\./, "")}`, tr: "hoch",
  topics: MINISTRY_POLICY_TOPICS[inst] || [] // Sprint 5: Ressort-Politikfelder als Primaerquelle
}));

// Superseded-Beispiel (ehrlicher Zustand): alte Wirtschaftsministeriums-Domain, 2025 abgeloest.
const SUPERSEDED = [
  def({ id: "seed-bmwi-old", d: "bmwi.de", m: "html", t: "ministerium", inst: "ministry-bmwe", rev: "superseded", lic: "unbewertet", orig: "legacy_catalog", ev: "https://www.bundeswirtschaftsministerium.de", tr: "mittel", note: "Ersetzt durch bundeswirtschaftsministerium.de (Umbenennung 2025)." })
];

// --- 3) Parteien (alle 9 des Mandatsregisters) ----------------------------------------------
const PARTY_DEFS = [
  ["party-cdu", "cdu.de"], ["party-csu", "csu.de"], ["party-spd", "spd.de"],
  ["party-gruene", "gruene.de"], ["party-fdp", "fdp.de"], ["party-afd", "afd.de"],
  ["party-linke", "die-linke.de"], ["party-bsw", "bsw-vg.de"], ["party-ssw", "ssw.de"]
].map(([party, d]) => def({
  id: `seed-${party}`, d, m: "html", t: "partei", party, rev: "active", lic: "presse_erlaubt",
  orig: "official_directory", ev: `https://www.${d}`, tr: "mittel", stance: "position"
}));

// --- 4) Bundestagsfraktionen -----------------------------------------------------------------
// 21. Deutscher Bundestag (2025): Fraktionen sind CDU/CSU, SPD, Grüne, Die Linke, AfD. FDP und BSW
// haben den Wiedereinzug verpasst -> keine FDP-Bundestagsfraktion mehr. Die FDP-Fraktionsquelle wird
// daher als 'superseded' (veraltet) gefuehrt — ein realer Beleg fuer diesen Importzustand. BSW/SSW
// haben keine belegbare eigene Fraktions-Feed-Domain (s. Bericht); Ersatz ueber die Parteiseiten.
const GROUP_DEFS = [
  ["group-bt-cdu-csu", "cducsu.de", "active"],
  ["group-bt-spd", "spdfraktion.de", "active"],
  ["group-bt-gruene", "gruene-bundestag.de", "active"],
  ["group-bt-linke", "linksfraktion.de", "active"],
  ["group-bt-afd", "afdbundestag.de", "active"],
  ["group-bt-fdp", "fdpbt.de", "superseded"]
].map(([group, d, rev]) => def({
  id: `seed-${group}`, d, m: "html", t: "fraktion", group, rev,
  lic: rev === "active" ? "presse_erlaubt" : "unbewertet",
  orig: "official_directory", ev: `https://www.${d}`, tr: "mittel", stance: "position",
  note: rev === "superseded" ? "FDP im 21. Deutschen Bundestag (2025) nicht mehr als Fraktion vertreten (4,3% Zweitstimmen)." : null
}));

// --- 5) Bundestagsausschuesse (alle 23) ------------------------------------------------------
// Heute real ueber Suchanbieter abgedeckt -> als Suchweg gefuehrt (ehrlich). Der Petitions-
// ausschuss hat eine belegbare eigene Direktquelle (ePetitionen) und zeigt das gemischte Modell.
const COMMITTEE_ENTITIES = ALL_ENTITIES.filter((e) => e.entity_type === "committee");
const COMMITTEE_SEARCH = COMMITTEE_ENTITIES.map((c) => def({
  id: `seed-${c.id}-search`, d: "news.google.com",
  u: `https://news.google.com/rss/search?q=${encodeURIComponent(`"${c.name}" Bundestag`)}&hl=de&gl=DE&ceid=DE:de`,
  m: "googlenews_search", t: "ausschuss", comm: [c.id], q: `"${c.name}" Bundestag`,
  rev: "active", lic: "unbewertet", priv: "oeffentliche_mandatsdaten",
  orig: "search_discovery", ev: "https://news.google.com", tr: "niedrig"
}));
const COMMITTEE_DIRECT = [
  def({ id: "seed-committee-petitionen-direct", d: "epetitionen.bundestag.de", m: "html", t: "ausschuss",
    comm: ["committee-bt-petitionen"], inst: "parliament-bundestag", rev: "active", lic: "presse_erlaubt",
    orig: "official_directory", ev: "https://epetitionen.bundestag.de", tr: "hoch" })
];

// --- 6) Ueberregionale Medien (Auswahl) ------------------------------------------------------
const MEDIA_UEBER = [
  ["tagesschau.de", "https://www.tagesschau.de/xml/rss2", "rss"],
  ["deutschlandfunk.de", "https://www.deutschlandfunk.de/politikportal-100.html", "html"],
  ["zeit.de", null, "html"], ["spiegel.de", "https://www.spiegel.de/politik/index.rss", "rss"],
  ["sueddeutsche.de", null, "html"], ["faz.net", null, "html"], ["taz.de", "https://taz.de/!p4608;rss/", "rss"]
].map(([d, u, m]) => def({
  id: `seed-media-${d.replace(/\W+/g, "-")}`, d, u, m, t: "medien_ueberregional",
  rev: "active", lic: "presse_erlaubt", orig: "manual_curation", ev: `https://www.${d}`, tr: "mittel", stance: "journalistic"
}));

// --- 7) Regionale Medien (Auswahl, mit Regionsbezug) -----------------------------------------
const MEDIA_REGIONAL = [
  ["rbb24.de", ["geo-land-berlin", "geo-land-brandenburg"]],
  ["tagesspiegel.de", ["geo-land-berlin"]],
  ["ndr.de", ["geo-land-niedersachsen", "geo-land-hamburg", "geo-land-schleswig-holstein", "geo-land-mecklenburg-vorpommern"]],
  ["swr.de", ["geo-land-baden-wuerttemberg", "geo-land-rheinland-pfalz"]],
  ["mdr.de", ["geo-land-sachsen", "geo-land-sachsen-anhalt", "geo-land-thueringen"]],
  ["wdr.de", ["geo-land-nordrhein-westfalen"]]
].map(([d, reg]) => def({
  id: `seed-region-${d.replace(/\W+/g, "-")}`, d, m: "html", t: "medien_regional", reg,
  political_level: "land", rev: "active", lic: "presse_erlaubt", orig: "manual_curation", ev: `https://www.${d}`, tr: "mittel", stance: "journalistic"
}));

// --- 8) Fachoeffentlichkeit: Gewerkschaften / Arbeitgeber / Wissenschaft / Thinktank / NGO ----
const EXPERT = [
  def({ id: "seed-dgb", d: "dgb.de", m: "html", t: "gewerkschaft", inst: "union-dgb", rev: "active", lic: "presse_erlaubt", orig: "official_directory", ev: "https://www.dgb.de", tr: "mittel", stance: "position" }),
  def({ id: "seed-verdi", d: "verdi.de", m: "html", t: "gewerkschaft", inst: "union-verdi", rev: "active", lic: "presse_erlaubt", orig: "official_directory", ev: "https://www.verdi.de", tr: "mittel", stance: "position" }),
  def({ id: "seed-igmetall", d: "igmetall.de", m: "html", t: "gewerkschaft", inst: "union-ig-metall", rev: "active", lic: "presse_erlaubt", orig: "official_directory", ev: "https://www.igmetall.de", tr: "mittel", stance: "position" }),
  def({ id: "seed-bda", d: "arbeitgeber.de", m: "html", t: "arbeitgeberverband", inst: "association-bda", rev: "active", lic: "presse_erlaubt", orig: "official_directory", ev: "https://www.arbeitgeber.de", tr: "mittel", stance: "position" }),
  def({ id: "seed-bdi", d: "bdi.eu", m: "html", t: "arbeitgeberverband", inst: "association-bdi", rev: "active", lic: "presse_erlaubt", orig: "official_directory", ev: "https://bdi.eu", tr: "mittel", stance: "position" }),
  def({ id: "seed-vdk", d: "vdk.de", m: "html", t: "fachverband", inst: "association-vdk", rev: "active", lic: "presse_erlaubt", orig: "official_directory", ev: "https://www.vdk.de", tr: "mittel", stance: "position" }),
  def({ id: "seed-swp", d: "swp-berlin.org", m: "html", t: "wissenschaft", inst: "science-swp", rev: "released", lic: "presse_erlaubt", orig: "manual_curation", ev: "https://www.swp-berlin.org", tr: "hoch", stance: "analysis" }),
  def({ id: "seed-diw", d: "diw.de", m: "html", t: "wissenschaft", inst: "science-diw", rev: "released", lic: "presse_erlaubt", orig: "manual_curation", ev: "https://www.diw.de", tr: "hoch", stance: "analysis" }),
  def({ id: "seed-ifo", d: "ifo.de", m: "html", t: "wissenschaft", inst: "science-ifo", rev: "classified", lic: "unbewertet", orig: "manual_curation", ev: "https://www.ifo.de", tr: "hoch", stance: "analysis" }),
  def({ id: "seed-bertelsmann", d: "bertelsmann-stiftung.de", m: "html", t: "thinktank", rev: "classified", lic: "unbewertet", orig: "manual_curation", ev: "https://www.bertelsmann-stiftung.de", tr: "mittel", stance: "analysis" }),
  def({ id: "seed-transparency", d: "transparency.de", m: "html", t: "ngo", inst: "ngo-transparency", rev: "released", lic: "presse_erlaubt", orig: "manual_curation", ev: "https://www.transparency.de", tr: "mittel", stance: "position" })
];

// --- 9) Bundeslaender: ein offizielles Landesportal je Bundesland (alle 16) -------------------
const LAND_PORTAL_SOURCES = MASTER_ENTITIES_EXTRA
  .filter((e) => e.id.startsWith("landportal-"))
  .map((e) => def({
    id: `seed-${e.id}`, d: e.domain, m: "html", t: "bundesland", inst: e.id,
    reg: [e.geography_id], political_level: "land", rev: "released", lic: "presse_erlaubt",
    orig: "official_directory", ev: `https://www.${e.domain}`, tr: "hoch"
  }));

// --- 10) Auswahl offizieller Landtags-/Landesregierungs-Quellen ------------------------------
const LAND_OFFICIAL = [
  def({ id: "seed-agh-berlin", d: "parlament-berlin.de", m: "html", t: "landtag", reg: ["geo-land-berlin"], political_level: "land", rev: "classified", lic: "unbewertet", orig: "official_directory", ev: "https://www.parlament-berlin.de", tr: "hoch", inst: "parliament-berlin-agh" }),
  def({ id: "seed-landtag-brandenburg", d: "landtag.brandenburg.de", m: "html", t: "landtag", reg: ["geo-land-brandenburg"], political_level: "land", rev: "classified", lic: "unbewertet", orig: "official_directory", ev: "https://www.landtag.brandenburg.de", tr: "hoch", inst: "parliament-brandenburg-landtag" }),
  def({ id: "seed-landtag-nrw", d: "landtag.nrw.de", m: "html", t: "landtag", reg: ["geo-land-nordrhein-westfalen"], political_level: "land", rev: "released", lic: "presse_erlaubt", orig: "official_directory", ev: "https://www.landtag.nrw.de", tr: "hoch" })
];

// --- 11) EU-Ebene (Sprint 5): belegte Primaerquelle fuer das Politikfeld Europa ---------------
// Das Politikfeld "Europa" hat kein Bundesministerium (Register: ministry null) und war damit
// bisher nur ueber Suchanbieter gedeckt. Das Europaeische Parlament ist die belegte Primaerquelle.
const EU_SOURCES = [
  def({ id: "seed-europarl", d: "europarl.europa.eu", u: "https://www.europarl.europa.eu/news/de", m: "html",
    t: "parlament", political_level: "eu", topics: ["europa"],
    rev: "released", lic: "presse_erlaubt", orig: "official_directory", ev: "https://www.europarl.europa.eu", tr: "hoch" })
];

const SEED_SOURCE_DEFS = [
  ...INSTITUTIONS, ...MINISTRY_DEFS, ...SUPERSEDED, ...PARTY_DEFS, ...GROUP_DEFS,
  ...COMMITTEE_SEARCH, ...COMMITTEE_DIRECT, ...MEDIA_UEBER, ...MEDIA_REGIONAL,
  ...EXPERT, ...LAND_PORTAL_SOURCES, ...LAND_OFFICIAL, ...EU_SOURCES
];

// Baut die kanonischen Records aus den Definitionen. Loest political_level/region/institution
// aus den referenzierten Entitaeten auf, wo nicht explizit gesetzt.
function buildSeedCatalog(opts = {}) {
  const clock = opts.clock || SEED_DISCOVERED_AT;
  const records = SEED_SOURCE_DEFS.map((o) => {
    const inst = o.inst ? ENTITY_BY_ID.get(o.inst) : null;
    const level = o.political_level || (inst && inst.level) || (o.party || o.group ? "bund" : "bund");
    const regions = o.reg || (inst && inst.geography_id ? [inst.geography_id] : []);
    return buildSourceRecord({
      id: o.id,
      url: urlFor(o),
      method: o.m,
      query: o.q || null,
      source_type: o.t,
      political_level: level,
      institution_id: o.inst && inst && ["ministry", "parliament", "government", "authority", "statistical_office", "committee", "other_institution"].includes(inst.entity_type) ? o.inst : (o.inst || null),
      party_id: o.party || null,
      group_id: o.group || null,
      committee_ids: o.comm || [],
      topics: o.topics || [],
      region_ids: regions,
      language: "de",
      discovery_origin: o.orig,
      discovered_at: clock,
      trust: o.tr || null,
      license_status: o.lic || "unbewertet",
      privacy_status: o.priv || defaultPrivacy(o.t),
      review_status: o.rev || "classified",
      release_status: o.rev === "active" ? "auto_freigegeben" : (["released", "restricted"].includes(o.rev) ? "manuell_freigegeben" : "unfreigegeben"),
      responsible: "regel:master-seed-sprint3",
      evidence_url: o.ev || null,
      content_stance: o.stance || null,
      note: o.note || null
    }, { clock });
  });
  return { records, entities: ALL_ENTITIES, extraEntities: MASTER_ENTITIES_EXTRA, geographies: GEOGRAPHIES, sourceCount: records.length, discoveredAt: clock };
}

module.exports = { buildSeedCatalog, SEED_SOURCE_DEFS, SEED_DISCOVERED_AT, ALL_ENTITIES };
