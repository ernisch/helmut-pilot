"use strict";

// Beobachtete Quellen und transparente Solltiefe. Ein erfolgreicher RSS-Abruf ist
// weder eine kommerzielle Nutzungsfreigabe noch laufende Produktionstelemetrie.
const { STAENDIGE_AUSSCHUESSE } = require("./bundestag-ausschuesse");
const { normalizeParty, committeeMatchKey } = require("../../matching");
const FEED_BEOBACHTUNGEN = require("./fachfeeds-verifiziert.json");

// Match-Stem, historische stabile Quellen-ID, explizite Themenbegriffe.
// Keine beliebigen Substring-Treffer: z.B. Denkmalpflege ist keine Pflegepolitik.
const FACHZUORDNUNG = {
  "wahlpruefung-immunitaet-geschaeftsordnung": ["wahlpruefung", "wahlpruefung", ["Wahlprüfung", "Immunität", "Geschäftsordnung"]],
  "petitionen": ["petitionen", "petitionen", ["Petitionen", "Petitionsrecht"]],
  "auswaertiges": ["auswaertiges", "auswaertiges", ["Außenpolitik", "Diplomatie"]],
  "inneres-heimat": ["inneres", "inneres", ["Innenpolitik", "Migration", "Asyl", "Innere Sicherheit"]],
  "sport-ehrenamt": ["sport", "sport", ["Sport", "Ehrenamt"]],
  "recht-verbraucherschutz": ["recht", "recht", ["Rechtspolitik", "Verbraucherschutz", "Justiz"]],
  "finanzen": ["finanzen", "finanzen", ["Finanzpolitik", "Steuerpolitik", "Steuerrecht"]],
  "haushalt": ["haushalt", "haushalt", ["Haushalt", "Bundeshaushalt", "Schuldenbremse"]],
  "wirtschaft-energie": ["wirtschaft", "wirtschaft", ["Wirtschaftspolitik", "Energie", "Industriepolitik"]],
  "landwirtschaft-ernaehrung-heimat": ["ernaehrung", "landwirtschaft", ["Landwirtschaft", "Ernährung", "Agrarpolitik"]],
  "arbeit-soziales": ["arbeit-und-soziales", null, ["Arbeit und Soziales", "Soziales", "Sozialpolitik", "Bürgergeld", "Mindestlohn", "Rente", "Pflege", "Grundsicherung", "Sozialversicherung", "Tarif", "Arbeitsmarkt", "Armut", "Sozialstaat", "Arbeitsrecht", "Sozialrecht", "Arbeitszeit", "Gewerkschaft"]],
  "verteidigung": ["verteidigung", "verteidigung", ["Verteidigung", "Bundeswehr", "Sicherheitspolitik"]],
  "bildung-familie-senioren-frauen-jugend": ["familie", "familie", ["Bildung", "Familie", "Senioren", "Frauenpolitik", "Jugend", "Kinder", "Gleichstellung"]],
  "gesundheit": ["gesundheit", "gesundheit", ["Gesundheit", "Pflege", "Krankenhaus", "Arzneimittel"]],
  "verkehr": ["verkehr", "verkehr", ["Verkehr", "Mobilität", "Bahn", "Straßenbau"]],
  "umwelt-klimaschutz-naturschutz-nukleare-sicherheit": ["umwelt", "klima-umwelt", ["Umwelt", "Klima", "Naturschutz", "Nukleare Sicherheit"]],
  "menschenrechte-humanitaere-hilfe": ["menschenrechte", "menschenrechte", ["Menschenrechte", "Humanitäre Hilfe"]],
  "forschung-technologie-raumfahrt": ["forschung", "bildung", ["Forschung", "Technologie", "Raumfahrt", "Technikfolgenabschätzung"]],
  "wirtschaftliche-zusammenarbeit-entwicklung": ["entwicklung", "entwicklung", ["Entwicklungspolitik", "Entwicklungszusammenarbeit"]],
  "europaeische-union": ["europa", "europa", ["Europäische Union", "Europapolitik", "EU-Politik"]],
  "digitales-staatsmodernisierung": ["digitales", "digitales", ["Digitalisierung", "Digitalpolitik", "Staatsmodernisierung", "Künstliche Intelligenz"]],
  "kultur-medien": ["kultur", "kultur-medien", ["Kultur", "Medienpolitik", "Denkmalschutz", "Denkmalpflege"]],
  "tourismus": ["tourismus", "tourismus", ["Tourismus"]],
  "wohnen-stadtentwicklung-bauwesen-kommunen": ["wohnen", "bau-wohnen", ["Wohnen", "Wohnung", "Miete", "Stadtentwicklung", "Bauwesen", "Kommunalpolitik"]]
};

function fachPaketKey(key) { return key === "arbeit-soziales" ? "arbeit-und-soziales" : `fach-${key}`; }
function norm(value) {
  return String(value || "").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss")
    .replace(/&/g,"und").replace(/[^a-z0-9]+/g," ").trim();
}
function list(...values) { return values.flatMap((v) => Array.isArray(v) ? v : v == null ? [] : [v]); }
function wordStart(text, term) {
  const h = norm(text), t = norm(term);
  return !!t && new RegExp(`(^| )${t}`).test(h);
}

const FACHPAKETE = STAENDIGE_AUSSCHUESSE.map((a) => {
  const [matchKey, sourceSuffix, topics] = FACHZUORDNUNG[a.key];
  const procedural = ["petitionen", "wahlpruefung-immunitaet-geschaeftsordnung"].includes(a.key);
  return {
    id: `pkg-${fachPaketKey(a.key)}`, key: fachPaketKey(a.key), ausschussKey: a.key,
    name: a.name, aliases: [a.name, a.key, matchKey], matchKey, topics,
    sourceIds: [sourceSuffix ? `committee-${sourceSuffix}` : "ausschuss-arbeit-soziales", `bt-fach-${a.key}-rss`],
    status: a.key === "arbeit-soziales" ? "active" : "prepared",
    is_base: false, political_level: "bund", geography_id: "geo-bund",
    purpose: `Fachliche Vertiefung: ${a.name}. Amtliche Vorgänge, Fachjournalismus und fachbezogene Daten/Forschung; offene Rollen bleiben als Lücke sichtbar.`,
    required_classes: ["bundestagsausschuesse", "fachmedien", ...(procedural ? [] : ["amtliche_daten"])],
    required_evidence_roles: procedural ? ["official_primary", "journalistic"] : ["official_primary", "data_source", "journalistic"],
    ...(procedural ? { scope_reason: "Verfahrens- und Kontrollgremium: kein allgemeines Statistikangebot als sachfremde Pflichtquelle." } : {})
  };
});

const PARTEIEN = [
  ["cdu", "CDU", "cdu.de", "cdu-csu"], ["csu", "CSU", "csu.de", "cdu-csu"],
  ["spd", "SPD", "spd.de", "spd"], ["gruene", "Bündnis 90/Die Grünen", "gruene.de", "gruene"],
  ["linke", "Die Linke", "die-linke.de", "linke"], ["afd", "AfD", "afd.de", "afd"],
  ["fdp", "FDP", "fdp.de", null], ["bsw", "BSW", "bsw-vg.de", null],
  ["ssw", "SSW", "ssw.de", null],
  ["freie-waehler", "FREIE WÄHLER", "freiewaehler.eu", null]
];
// Das Impressum belegt die Bundespartei, keinen RSS-Zugang oder Inhaltsrechte.
// Kommunale Wählervereinigungen sind nicht automatisch diese Partei.
const PARTEI_DOMAIN_BELEGE = {
  "freie-waehler": {
    checkedAt: "2026-11-06T11:45:41Z", url: "https://www.freiewaehler.eu/impressum/",
    publisherName: "FREIE WÄHLER Bundesvereinigung", httpStatus: 200,
    evidence: "Impressum nennt die registrierte Partei FREIE WÄHLER und ihre Kurzbezeichnung FREIE WÄHLER."
  }
};
const PARTEIPAKETE = PARTEIEN.map(([party, name, domain, faction]) => ({
  id: `pkg-${party === "linke" ? "die-linke-bund" : `partei-${party}-bund`}`,
  key: party === "linke" ? "die-linke-bund" : `partei-${party}-bund`, name: `${name} Bund`,
  partyKeys: [party], party_keys: [party], party, domain, faction,
  sourceIds: [`partei-${party}-originalsuche`, ...(faction ? [`fraction-${faction}`] : []), ...(party === "linke" ? ["die-linke", "linksfraktion"] : [])],
  status: party === "linke" ? "active" : "prepared", is_base: false,
  political_level: "bund", geography_id: "geo-bund",
  purpose: `Direkte Positionen ${name}, getrennt von unabhängigen Belegen. Beobachtung als Quelle, keine Kundenzulassung.`,
  required_classes: ["parteiquellen_bund"], required_evidence_roles: ["direct_interest"]
}));

// Namen und offizielle kurze Bezeichnungen werden exakt aufgelöst, keine
// Teilwortsuche und kein Fallback auf eine bevorzugte Partei.
function partyKeys(value) {
  const s = norm(value).replace(/^(fraktion|partei) /, "").replace(/ bundestagsfraktion$/, "").replace(/ im bundestag$/, "");
  if (!s || ["fraktionslos", "parteilos", "unabhaengig", "keine"].includes(s)) return [];
  if (["cdu csu", "union", "unionsfraktion"].includes(s)) return ["cdu", "csu"];
  if (["suedschleswigscher waehlerverband", "ssw"].includes(s)) return ["ssw"];
  const fullNames = { "sozialdemokratische partei deutschlands": "spd",
    "christlich demokratische union": "cdu", "christlich demokratische union deutschlands": "cdu",
    "christlich soziale union": "csu", "christlich soziale union in bayern": "csu",
    "freie waehler bundesvereinigung": "freie-waehler", "bundesvereinigung freie waehler": "freie-waehler" };
  if (fullNames[s]) return [fullNames[s]];
  const key = normalizeParty(s);
  return PARTEIEN.some(([p]) => p === key) ? [key] : [];
}
function resolveParteipakete(profile = {}) {
  const explicit = list(profile.partei, profile.party).filter((v) => norm(v));
  // Explizit parteilos bleibt parteilos; aus einer Fraktion keine Mitgliedschaft erfinden.
  const values = explicit.length ? explicit : list(profile.fraktion, profile.faction);
  const keys = new Set(values.flatMap(partyKeys));
  return PARTEIPAKETE.filter((p) => p.partyKeys.some((k) => keys.has(k))).map((p) => p.key);
}
function unresolvedPartyLabels(profile = {}) {
  const explicit = list(profile.partei, profile.party).filter((v) => norm(v));
  const values = explicit.length ? explicit : list(profile.fraktion, profile.faction);
  const intentional = new Set(["fraktionslos", "parteilos", "unabhaengig", "keine"]);
  return [...new Set(values.filter((v) => norm(v) && !intentional.has(norm(v)) && !partyKeys(v).length).map(String))];
}
function resolveFachpakete(profile = {}) {
  const committees = list(profile.ausschuesse, profile.committees, profile.committee, profile.stellvertretende_ausschuesse, profile.deputyCommittees);
  const topics = list(profile.fachpolitische_schwerpunkte, profile.berichterstatter_themen, profile.focusTopics, profile.reportingTopics, profile.themen, profile.regionale_themen);
  return FACHPAKETE.filter((p) => committees.some((c) => p.aliases.some((a) => norm(a) === norm(c)) || committeeMatchKey(c) === p.matchKey)
    || topics.some((t) => p.aliases.some((alias) => norm(t) === norm(alias)) || p.topics.some((term) => wordStart(t, term)))).map((p) => p.key);
}

const FEED_NAMES = { "dlf-wirtschaft": "Deutschlandfunk Wirtschaft", "dlf-wissen": "Deutschlandfunk Wissen", "dlf-kultur": "Deutschlandfunk Kultur", "dlf-sport": "Deutschlandfunk Sport", "g-ba": "Gemeinsamer Bundesausschuss", "swp": "Stiftung Wissenschaft und Politik", "dji": "Deutsches Jugendinstitut", "lto": "Legal Tribune Online", "aerztezeitung": "Ärzte Zeitung Politik", "rki": "Robert Koch-Institut", "uba": "Umweltbundesamt Presse" };
const DATA_FEEDS = new Set(["swp", "dji", "rki"]);
const ZUSAETZLICHE_QUELLEN = [
  ...FEED_BEOBACHTUNGEN.map((v) => {
    const committee = STAENDIGE_AUSSCHUESSE.find((a) => a.key === v.ausschussKey);
    const fachgebietKeys = v.fachgebietKeys || (v.ausschussKey ? [v.ausschussKey] : []);
    const partyPackage = v.partyKey && PARTEIPAKETE.find((p) => p.party === v.partyKey);
    const role = partyPackage ? "direct_interest" : committee || ["g-ba", "uba"].includes(v.id) ? "official_primary" : DATA_FEEDS.has(v.id) ? "data_source" : "journalistic";
    return {
      id: committee ? `bt-fach-${committee.key}-rss` : partyPackage ? `partei-${v.partyKey}-direkt-rss` : `fach-${v.id}-rss`,
      name: committee ? `${committee.name} — amtlicher RSS` : partyPackage ? `${partyPackage.name} — Direktfeed` : FEED_NAMES[v.id] || v.id,
      url: v.rssUrl, type: partyPackage ? "party" : committee ? "committee" : role === "journalistic" ? "media" : "official",
      priority: 80, active: false, preparedOnly: true, neutral: false,
      packageKeys: partyPackage ? [partyPackage.key] : fachgebietKeys.map(fachPaketKey), fachgebietKeys,
      ...(partyPackage ? { party: v.partyKey, partyKeys: [v.partyKey], partyPackageOnly: true } : {}),
      ...(committee ? { ausschussKey: committee.key } : {}), evidenceRole: role,
      coverageClasses: [partyPackage ? "parteiquellen_bund" : committee ? "bundestagsausschuesse" : role === "journalistic" ? "fachmedien" : role === "data_source" ? "amtliche_daten" : "fachparlamentsvorgaenge"],
      rightsReviewRequired: true,
      usagePolicy: { status: "review_required", commercialUseApproved: false, fullTextAllowed: false,
        note: v.nutzungsgrenze || "Technischer Zugang geprüft; Nutzungsrechte vor Aktivierung prüfen. Keine Paywall-Umgehung.", evidenceUrls: v.usageDocumentation || [] },
      verification: { checkedAt: v.checkedAt, discoveredOn: v.discoveredOn, httpStatus: v.httpStatus, feedParsed: v.feedParsed, itemCount: v.itemCount, sampleArticleUrl: v.sampleArticleUrl, latestPublishedAt: v.latestPublishedAt, latestPublishedAgeDays: v.latestPublishedAgeDays, freshnessStatus: v.freshnessStatus || (v.latestPublishedAgeDays > 30 ? "older_than_30_days" : v.latestPublishedAt ? "dated_items_observed" : "publication_date_missing"), status: "technically_verified_rights_pending" }
    };
  }),
  ...PARTEIPAKETE.map((p) => ({
    id: `partei-${p.party}-originalsuche`, name: `${p.name} — Originalpositionen (Suchweg)`,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(`site:${p.domain}`)}&hl=de&gl=DE&ceid=DE:de`,
    query: `site:${p.domain}`, type: "party", party: p.party, partyKeys: p.partyKeys,
    priority: 80, active: false, preparedOnly: true, partyPackageOnly: true,
    packageKeys: [p.key], evidenceRole: "direct_interest", coverageClasses: ["parteiquellen_bund"],
    rightsReviewRequired: true, usagePolicy: { status: "review_required", commercialUseApproved: false, fullTextAllowed: false, note: "Suchweg zum Originalherausgeber; kein bestätigter Direktfeed und keine Inhaltslizenz." },
    verification: { status: "search_fallback_unverified", discoveredOn: `https://www.${p.domain}/`, feedParsed: false,
      ...(PARTEI_DOMAIN_BELEGE[p.party] ? { issuerVerification: PARTEI_DOMAIN_BELEGE[p.party] } : {}) }
  }))
];

module.exports = { FACHPAKETE, PARTEIPAKETE, ZUSAETZLICHE_QUELLEN, FACHZUORDNUNG, resolveFachpakete, resolveParteipakete, fachPaketKey, partyKeys, unresolvedPartyLabels };
