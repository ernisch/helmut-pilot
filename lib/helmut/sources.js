const { ausschussByKey } = require("./quellenarchitektur/seeds/bundestag-ausschuesse");
const { BUNDESTAG_21 } = require("./quellenarchitektur/seeds/parlamentszusammensetzung");
const { isStrictGoogleNewsUrl } = require("./provider-url");

// Neutrale, politikfeld-agnostische Default-Suchbegriffe für Medien-Quellen
// (site:...): allgemeine Bundespolitik statt sozialpolitischer Standardbegriffe.
// KEIN Sozialthema ist mehr allgemeiner Produktstandard.
const neutralPoliticsTerms = ["Bundestag", "Bundesregierung", "Gesetzentwurf", "Reform", "Politik", "Ausschuss"];

// Sozialpolitische Themenbegriffe — AUSSCHLIESSLICH zum Markieren themenspezifischer
// Quellen (theme-gating pro Profil in scheduler.getSourcesForProfile), NIE als
// allgemeiner Standard. Eine so markierte Quelle wird nur genutzt, wenn das
// Mandatsprofil ein passendes Thema/Ausschuss/Ministerium trägt (oder ein Demo-Profil).
// Matching erfolgt in scheduler.themeTermInTopic per WORTGRENZE (ganzes Wort oder
// Wortanfang eines Kompositums), nicht per blindem Substring. Deshalb deckt "pflege"
// bereits "Pflege"/"Pflegeversicherung"/"Pflegereform" (Wortanfang) ab, NICHT aber
// "Denkmalpflege"/"Landschaftspflege" (pflege als Suffix). Sozialpolitische
// Pflege-Komposita mit Suffix (Altenpflege/Krankenpflege) sind daher zusätzlich als
// eigene Begriffe gelistet, damit echte Pflegepolitik weiterhin matcht.
const SOCIAL_THEME_TERMS = [
  "arbeit und soziales", "soziales", "bmas", "bürgergeld", "buergergeld", "mindestlohn",
  "rente", "pflege", "pflegeversicherung", "altenpflege", "krankenpflege",
  "tarifbindung", "tariftreue", "arbeitsmarkt", "sozialstaat",
  "sozialpolitik", "armut", "gewerkschaft", "sozialversicherung", "grundsicherung",
  "sozialrecht", "arbeitsrecht", "arbeitszeit"
];

const googleNewsDefaultMaxItems = positiveInteger(process.env.HELMUT_GOOGLE_NEWS_MAX_ITEMS, 12);
const directRssDefaultMaxItems = positiveInteger(process.env.HELMUT_DIRECT_RSS_MAX_ITEMS, 16);
const topicRadarDefaultMaxItems = positiveInteger(process.env.HELMUT_TOPIC_RADAR_MAX_ITEMS, 16);
const sourceTarget = positiveInteger(process.env.HELMUT_SOURCE_TARGET, 560);

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function directSource(source) {
  return {
    rssUrls: source.rssUrl ? [source.rssUrl] : [],
    maxItems: source.crawlMethod === "html" ? 1 : directRssDefaultMaxItems,
    lastCrawledAt: null,
    ...source,
    active: source.active ?? true
  };
}

function googleNewsSource({ id, name, type = "media", query, priority = 65, url = "", maxItems = googleNewsDefaultMaxItems }) {
  const encoded = encodeURIComponent(query);
  const rssUrl = `https://news.google.com/rss/search?q=${encoded}&hl=de&gl=DE&ceid=DE:de`;
  return {
    id,
    name,
    type,
    url: url || `https://news.google.com/search?q=${encoded}`,
    rssUrl,
    rssUrls: [rssUrl],
    crawlMethod: "rss",
    priority,
    active: true,
    maxItems,
    lastCrawledAt: null
  };
}

function siteSource(id, name, domain, priority = 62, extraTerms = neutralPoliticsTerms) {
  return googleNewsSource({
    id,
    name,
    url: `https://${domain}`,
    query: `site:${domain} (${extraTerms.join(" OR ")})`,
    priority
  });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function uniqueSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    if (!source?.id || seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
}

// SaaS-Quellen-Meta: markiert Quellen als neutrale Basis (für JEDES Mandat) oder
// als profil-/themen-/regional-/partei-gebunden. scheduler.getSourcesForProfile
// entscheidet damit pro Profil, welche geteilten Quellen genutzt werden.
function tagSources(sources, meta) {
  return (sources || []).map((s) => ({ ...s, ...meta }));
}

// coreSources sind gemischt: neutrale Institutionen (immer), sozial-thematische
// Direktquellen (nur bei passendem Profil) und Partei-spezifische Quellen (nur
// bei passender Partei). Personenquellen kommen NIE aus dem geteilten Katalog.
function tagCoreSources(sources) {
  const NEUTRAL = new Set(["bundesregierung", "bundestag", "tagesschau-politik", "deutschlandfunk-politik"]);
  const SOCIAL = new Set(["bmas", "ausschuss-arbeit-soziales", "dgb"]);
  const LINKE = new Set(["die-linke", "linksfraktion"]);
  return sources.map((s) => {
    if (NEUTRAL.has(s.id)) return { ...s, neutral: true };
    if (SOCIAL.has(s.id)) return { ...s, neutral: false, themeTerms: SOCIAL_THEME_TERMS };
    if (LINKE.has(s.id)) return { ...s, neutral: false, party: "Die Linke" };
    // Sicherheitsnetz: eine (heute nicht mehr vorhandene) Personenquelle im
    // geteilten Katalog wuerde nie neutral an alle Mandate verteilt.
    if (s.type === "person") return { ...s, neutral: false, demoOnly: true };
    return { ...s, neutral: true };
  });
}

function topicBundleSources(topics, contexts) {
  return topics.flatMap((topic) =>
    contexts.map((context) => googleNewsSource({
      id: `bundle-${slugify(context.id)}-${slugify(topic.id || topic.label)}`,
      name: `${topic.label} · ${context.name}`,
      type: context.type,
      query: `${topic.query || topic.label} (${context.query})`,
      priority: Math.min(96, Math.max(48, (context.priority || 60) + (topic.boost || 0))),
      maxItems: context.maxItems || 8
    }))
  );
}

// Personenbezogene Suchen stehen NICHT im geteilten Katalog: die Personenquelle
// eines Mandats wird zur Laufzeit aus seinem Profil erzeugt
// (scheduler.personNewsSource, id "<mandats-id>-news") — kein Nutzer ist hier
// hartkodiert.
const coreSources = [
  directSource({
    id: "bmas",
    name: "BMAS",
    type: "ministry",
    url: "https://www.bmas.de",
    rssUrl: "https://www.bmas.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/RSSNewsfeed.xml",
    crawlMethod: "rss",
    priority: 95
  }),
  directSource({
    id: "bundesregierung",
    name: "Bundesregierung",
    type: "ministry",
    url: "https://www.bundesregierung.de",
    // P1-5 (Architektur-Audit 29): verifizierte Reparatur uebernommen (Sprint 9B, real HTTP 200,
    // 20 Items). Direkter Feed war real 404 (Pfad umgezogen) -> googlenews-Ersatz, site:-Filter
    // haelt die Herausgeber-Identitaet bundesregierung.de (siehe bundeswege-reparaturen.js).
    rssUrl: "https://news.google.com/rss/search?q=site:bundesregierung.de&hl=de&gl=DE&ceid=DE:de",
    crawlMethod: "rss",
    priority: 95
  }),
  directSource({
    id: "bundestag",
    name: "Bundestag",
    type: "bundestag",
    url: "https://www.bundestag.de",
    // P1-5: verifizierte Reparatur uebernommen (Sprint 9B, real HTTP 200, 15 Items, 3 Tage alt).
    // Kurzpfad /rss lieferte nur Landing/Redirect + Bot-403; echter RSS-Pfad umgezogen.
    rssUrl: "https://www.bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss",
    rssUrls: [
      "https://www.bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss",
      "https://www.bundestag.de/presse/hib/rss"
    ],
    crawlMethod: "rss",
    priority: 100
  }),
  directSource({
    id: "ausschuss-arbeit-soziales",
    // Amtliche Bezeichnung + stabile Ausschusskennung aus der Sollmenge
    // (seeds/bundestag-ausschuesse.js). Dieser Ausschuss ist der einzige, der nicht aus
    // bundestagCommitteeSources kommt: er ist zugleich die hoechstpriorisierte Fachquelle des
    // Themenpakets "arbeit-und-soziales".
    name: ausschussByKey("arbeit-soziales").name,
    ausschussKey: "arbeit-soziales",
    type: "committee",
    url: "https://www.bundestag.de/ausschuesse/a11_arbeit_soziales",
    // P1-5: verifizierte Reparatur uebernommen (Sprint 9B, real HTTP 200, 20 Items, 0 Tage).
    // HTML-Scrape gegen Bot-403 + kein stabiler Ausschuss-Feed -> googlenews-Ersatz.
    // Editions-/Sprachpinning (&hl=de&gl=DE&ceid=DE:de) wie bei JEDER anderen Google-News-URL
    // im Katalog (googleNewsSource(), oben). Ohne diese Parameter waehlt Google Ausgabe und
    // Sprache anhand der Egress-IP des Runners — im Zweifel eine leere oder englische Ausgabe.
    rssUrl: "https://news.google.com/rss/search?q=site:bundestag.de%20%22Ausschuss%20f%C3%BCr%20Arbeit%20und%20Soziales%22&hl=de&gl=DE&ceid=DE:de",
    crawlMethod: "rss",
    priority: 95
  }),
  directSource({
    id: "die-linke",
    name: "Die Linke",
    type: "party",
    url: "https://www.die-linke.de",
    // P1-5: verifizierte Reparatur uebernommen (Sprint 9B, real HTTP 200, 20 Items, 0 Tage).
    // Direktfeed bot-gesperrt (429, NICHT umgangen) -> googlenews-Ersatz.
    rssUrl: "https://news.google.com/rss/search?q=site:die-linke.de&hl=de&gl=DE&ceid=DE:de",
    crawlMethod: "rss",
    priority: 90
  }),
  directSource({
    id: "linksfraktion",
    name: "Die Linke im Bundestag",
    type: "party",
    url: "https://www.dielinkebt.de",
    // P1-5: verifizierte Reparatur uebernommen (Sprint 9B, real HTTP 200, 15 Items, 0 Tage alt).
    // Alte historische Domain linksfraktion.de ist veraltet -> NICHT mehr referenziert.
    rssUrl: "https://www.dielinkebt.de/presse/pressemitteilungen/feed.rss",
    crawlMethod: "rss",
    priority: 90
  }),
  directSource({
    id: "tagesschau-politik",
    name: "Tagesschau Politik",
    type: "media",
    url: "https://www.tagesschau.de/inland/",
    rssUrl: "https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml",
    rssUrls: [
      "https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml",
      "https://www.tagesschau.de/xml/rss2"
    ],
    crawlMethod: "rss",
    priority: 70
  }),
  directSource({
    id: "deutschlandfunk-politik",
    name: "Deutschlandfunk Politik",
    type: "media",
    url: "https://www.deutschlandfunk.de/politik-100.html",
    rssUrl: "https://www.deutschlandfunk.de/nachrichten-100.rss",
    crawlMethod: "rss",
    priority: 70
  }),
  directSource({
    id: "dgb",
    name: "DGB",
    type: "association",
    url: "https://www.dgb.de",
    // P1-5: verifizierte Reparatur uebernommen (Sprint 9B, real HTTP 200, 20 Items, 0 Tage).
    // Startseiten-Scrape unzuverlaessig + CMS-Relaunch + 403; direkter OPML-Feed lieferte HTML
    // -> googlenews-Ersatz (bereits dokumentierte Korrektur, keine neue Recherche).
    rssUrl: "https://news.google.com/rss/search?q=site:dgb.de&hl=de&gl=DE&ceid=DE:de",
    crawlMethod: "rss",
    priority: 75
  })
];

const officialSearchSources = [
  googleNewsSource({ id: "news-bundesrat-soziales", name: "Bundesrat Sozialpolitik", type: "bundestag", query: "site:bundesrat.de (Arbeit OR Soziales OR Bürgergeld OR Rente OR Pflege OR Mindestlohn)", priority: 88 }),
  googleNewsSource({ id: "news-arbeitsagentur", name: "Bundesagentur für Arbeit", type: "official", query: "site:arbeitsagentur.de (Arbeitsmarkt OR Beschäftigung OR Bürgergeld OR Ausbildung)", priority: 82 }),
  googleNewsSource({ id: "news-destatis-soziales", name: "Destatis Sozialdaten", type: "official", query: "site:destatis.de (Armut OR Einkommen OR Arbeitsmarkt OR Pflege OR Rente)", priority: 82 }),
  googleNewsSource({ id: "news-iab", name: "IAB Arbeitsmarkt", type: "official", query: "site:iab.de (Arbeitsmarkt OR Mindestlohn OR Bürgergeld OR Beschäftigung)", priority: 82 }),
  googleNewsSource({ id: "news-deutsche-rentenversicherung", name: "Deutsche Rentenversicherung", type: "official", query: "site:deutsche-rentenversicherung.de (Rente OR Rentenpaket OR Sozialversicherung)", priority: 80 }),
  googleNewsSource({ id: "news-bundesgesundheitsministerium-pflege", name: "BMG Pflege", type: "ministry", query: "site:bundesgesundheitsministerium.de (Pflege OR Pflegeversicherung OR Pflegekräfte)", priority: 80 }),
  googleNewsSource({ id: "news-bmfsfj-soziales", name: "BMFSFJ Soziales", type: "ministry", query: "site:bmfsfj.de (Kindergrundsicherung OR Familie OR Armut OR Pflege)", priority: 76 }),
  googleNewsSource({ id: "news-bundesfinanzministerium-sozialstaat", name: "BMF Sozialstaat", type: "ministry", query: "site:bundesfinanzministerium.de (Sozialstaat OR Rente OR Bürgergeld OR Pflege OR Haushalt)", priority: 76 })
];

const mediaSources = [
  siteSource("news-spiegel", "Spiegel", "www.spiegel.de", 70),
  siteSource("news-zeit", "ZEIT Online", "www.zeit.de", 70),
  siteSource("news-sueddeutsche", "Süddeutsche Zeitung", "www.sueddeutsche.de", 70),
  siteSource("news-faz", "FAZ", "www.faz.net", 70),
  siteSource("news-handelsblatt", "Handelsblatt", "www.handelsblatt.com", 70),
  siteSource("news-welt", "WELT", "www.welt.de", 68),
  siteSource("news-taz", "taz", "taz.de", 68),
  siteSource("news-rnd", "RND", "www.rnd.de", 66),
  siteSource("news-ntv", "ntv", "www.n-tv.de", 64),
  siteSource("news-zdfheute", "ZDFheute", "www.zdfheute.de", 66),
  siteSource("news-ard", "ARD", "www.ard.de", 64),
  siteSource("news-phoenix", "Phoenix", "www.phoenix.de", 62),
  siteSource("news-politico", "Politico Deutschland", "www.politico.eu", 68),
  siteSource("news-table-media", "Table.Media", "table.media", 68),
  siteSource("news-thepioneer", "The Pioneer", "www.thepioneer.de", 62),
  siteSource("news-focus", "Focus", "www.focus.de", 60),
  siteSource("news-stern", "Stern", "www.stern.de", 60),
  siteSource("news-tagesspiegel", "Tagesspiegel", "www.tagesspiegel.de", 64),
  siteSource("news-berliner-zeitung", "Berliner Zeitung", "www.berliner-zeitung.de", 60),
  siteSource("news-frankfurter-rundschau", "Frankfurter Rundschau", "www.fr.de", 60),
  siteSource("news-junge-welt", "junge Welt", "www.jungewelt.de", 58),
  siteSource("news-nd", "nd", "www.nd-aktuell.de", 58),
  siteSource("news-jacobin", "JACOBIN", "jacobin.de", 56)
];

const broadGermanMediaSources = [
  siteSource("news-dw", "Deutsche Welle", "www.dw.com", 62),
  siteSource("news-t-online", "t-online", "www.t-online.de", 60),
  siteSource("news-webde", "WEB.DE News", "web.de", 54),
  siteSource("news-merkur", "Merkur", "www.merkur.de", 56),
  siteSource("news-rheinische-post", "Rheinische Post", "rp-online.de", 58),
  siteSource("news-augsburger-allgemeine", "Augsburger Allgemeine", "www.augsburger-allgemeine.de", 56),
  siteSource("news-lvz", "Leipziger Volkszeitung", "www.lvz.de", 54),
  siteSource("news-noz", "NOZ", "www.noz.de", 54),
  siteSource("news-weser-kurier", "Weser-Kurier", "www.weser-kurier.de", 54),
  siteSource("news-frankenpost", "Frankenpost", "www.frankenpost.de", 52),
  siteSource("news-mainpost", "Main-Post", "www.mainpost.de", 52),
  siteSource("news-nordkurier", "Nordkurier", "www.nordkurier.de", 52),
  siteSource("news-volksstimme", "Volksstimme", "www.volksstimme.de", 52),
  siteSource("news-freitag", "der Freitag", "www.freitag.de", 58),
  siteSource("news-overton", "Overton Magazin", "overton-magazin.de", 52),
  siteSource("news-correctiv", "CORRECTIV", "correctiv.org", 56)
];

const regionalSources = [
  siteSource("news-braunschweiger-zeitung", "Braunschweiger Zeitung", "www.braunschweiger-zeitung.de", 60),
  siteSource("news-salzgitter-zeitung", "Salzgitter Zeitung", "www.salzgitter-zeitung.de", 60),
  siteSource("news-regionalheute", "regionalHeute", "regionalheute.de", 58),
  siteSource("news-haz", "Hannoversche Allgemeine", "www.haz.de", 58),
  siteSource("news-neue-presse", "Neue Presse", "www.neuepresse.de", 56),
  siteSource("news-waz", "WAZ", "www.waz.de", 56),
  siteSource("news-ksta", "Kölner Stadt-Anzeiger", "www.ksta.de", 54),
  siteSource("news-mopo", "Hamburger Morgenpost", "www.mopo.de", 54),
  siteSource("news-abendblatt", "Hamburger Abendblatt", "www.abendblatt.de", 54),
  siteSource("news-saarbruecker", "Saarbrücker Zeitung", "www.saarbruecker-zeitung.de", 54),
  siteSource("news-mdr", "MDR", "www.mdr.de", 56),
  siteSource("news-rbb24", "rbb24", "www.rbb24.de", 56),
  siteSource("news-ndr", "NDR", "www.ndr.de", 56),
  siteSource("news-wdr", "WDR", "www1.wdr.de", 56)
];

const publicBroadcastRegionalSources = [
  siteSource("news-br", "BR24", "www.br.de", 56),
  siteSource("news-swr", "SWR", "www.swr.de", 56),
  siteSource("news-hr", "hessenschau", "www.hessenschau.de", 54),
  siteSource("news-sr", "SR", "www.sr.de", 52),
  siteSource("news-radio-bremen", "buten un binnen", "www.butenunbinnen.de", 52),
  siteSource("news-rbb-inforadio", "rbb Inforadio", "www.inforadio.de", 52)
];

const specialistSources = [
  siteSource("news-wirtschaftswoche", "WirtschaftsWoche", "www.wiwo.de", 64, ["Arbeitsmarkt", "Rente", "Sozialabgaben", "Mindestlohn", "Pflege"]),
  siteSource("news-manager-magazin", "manager magazin", "www.manager-magazin.de", 58, ["Arbeitsmarkt", "Sozialabgaben", "Mindestlohn", "Tarif", "Beschäftigung"]),
  siteSource("news-capital", "Capital", "www.capital.de", 56, ["Arbeitsmarkt", "Rente", "Sozialabgaben", "Beschäftigung"]),
  siteSource("news-heise", "heise online", "www.heise.de", 54, ["Arbeitsmarkt", "KI", "Digitalisierung", "Beschäftigung", "Sozialstaat"]),
  siteSource("news-netzpolitik", "netzpolitik.org", "netzpolitik.org", 54, ["Arbeit", "Soziales", "Digitalisierung", "Bundesregierung"]),
  siteSource("news-lto", "Legal Tribune Online", "www.lto.de", 58, ["Arbeitsrecht", "Sozialrecht", "Bundestag", "Gesetzentwurf"]),
  siteSource("news-juve", "JUVE", "www.juve.de", 52, ["Arbeitsrecht", "Sozialrecht", "Tarif"]),
  siteSource("news-personalwirtschaft", "Personalwirtschaft", "www.personalwirtschaft.de", 52, ["Arbeitsmarkt", "Mindestlohn", "Arbeitszeit", "Tarif"]),
  siteSource("news-haufe", "Haufe", "www.haufe.de", 52, ["Arbeitsrecht", "Sozialversicherung", "Mindestlohn", "Arbeitszeit"]),
  siteSource("news-aerzteblatt", "Ärzteblatt", "www.aerzteblatt.de", 58, ["Pflege", "Gesundheit", "Pflegeversicherung", "Sozialversicherung"])
];

const policySpecialistSources = [
  siteSource("news-sozialpolitik-aktuell", "Sozialpolitik aktuell", "www.sozialpolitik-aktuell.de", 62, ["Bürgergeld", "Rente", "Pflege", "Arbeitsmarkt", "Sozialstaat"]),
  siteSource("news-sozialrecht-justament", "Sozialrecht Justament", "www.sozialrecht-justament.de", 54, ["Bürgergeld", "Sozialrecht", "Rente", "Arbeitsmarkt"]),
  siteSource("news-arbeit-und-arbeitsrecht", "Arbeit und Arbeitsrecht", "www.arbeit-und-arbeitsrecht.de", 54, ["Arbeitsrecht", "Arbeitszeit", "Mindestlohn", "Tarif"]),
  siteSource("news-bund-verlag", "Bund-Verlag", "www.bund-verlag.de", 56, ["Arbeitsrecht", "Betriebsrat", "Tarif", "Mindestlohn"]),
  siteSource("news-gegenblende", "Gegenblende", "gegenblende.dgb.de", 58, ["Arbeit", "Soziales", "Gewerkschaften", "Tarif", "Rente"])
];

const associationSources = [
  googleNewsSource({ id: "news-verdi", name: "ver.di", type: "association", query: "site:verdi.de (Tarif OR Mindestlohn OR Pflege OR Arbeitszeit OR Sozialstaat)", priority: 76 }),
  googleNewsSource({ id: "news-ig-metall", name: "IG Metall", type: "association", query: "site:igmetall.de (Tarif OR Arbeitszeit OR Transformation OR Beschäftigung)", priority: 76 }),
  googleNewsSource({ id: "news-sozialverband-vdk", name: "Sozialverband VdK", type: "association", query: "site:vdk.de (Rente OR Pflege OR Armut OR Sozialstaat)", priority: 74 }),
  googleNewsSource({ id: "news-paritaet", name: "Der Paritätische", type: "association", query: "site:der-paritaetische.de (Armut OR Bürgergeld OR Pflege OR Sozialstaat)", priority: 74 }),
  googleNewsSource({ id: "news-caritas", name: "Caritas", type: "association", query: "site:caritas.de (Armut OR Pflege OR Sozialstaat OR Bürgergeld)", priority: 70 }),
  googleNewsSource({ id: "news-diakonie", name: "Diakonie", type: "association", query: "site:diakonie.de (Armut OR Pflege OR Sozialstaat OR Bürgergeld)", priority: 70 }),
  googleNewsSource({ id: "news-sozialverband-deutschland", name: "SoVD", type: "association", query: "site:sovd.de (Rente OR Pflege OR Armut OR Sozialstaat)", priority: 70 }),
  googleNewsSource({ id: "news-bda", name: "BDA", type: "association", query: "site:arbeitgeber.de (Arbeitszeit OR Mindestlohn OR Tarif OR Sozialversicherung)", priority: 68 }),
  googleNewsSource({ id: "news-bdi", name: "BDI", type: "association", query: "site:bdi.eu (Arbeitsmarkt OR Sozialabgaben OR Industrie OR Beschäftigung)", priority: 64 }),
  googleNewsSource({ id: "news-zdh", name: "ZDH", type: "association", query: "site:zdh.de (Mindestlohn OR Fachkräfte OR Ausbildung OR Sozialabgaben)", priority: 64 })
];

const politicalActorSources = [
  googleNewsSource({ id: "news-spd-fraktion-arbeit", name: "SPD-Fraktion Arbeit und Soziales", type: "party", query: "site:spdfraktion.de (Arbeit OR Soziales OR Bürgergeld OR Mindestlohn OR Rente OR Pflege)", priority: 72 }),
  googleNewsSource({ id: "news-cducsu-fraktion-arbeit", name: "CDU/CSU-Fraktion Arbeit und Soziales", type: "party", query: "site:cducsu.de (Arbeit OR Soziales OR Bürgergeld OR Mindestlohn OR Rente OR Pflege)", priority: 72 }),
  googleNewsSource({ id: "news-gruene-fraktion-arbeit", name: "Grüne Bundestagsfraktion Arbeit und Soziales", type: "party", query: "site:gruene-bundestag.de (Arbeit OR Soziales OR Bürgergeld OR Mindestlohn OR Rente OR Pflege)", priority: 70 }),
  googleNewsSource({ id: "news-fdp-fraktion-arbeit", name: "FDP-Fraktion Arbeit und Soziales", type: "party", query: "site:fdpbt.de (Arbeit OR Soziales OR Bürgergeld OR Mindestlohn OR Rente OR Pflege)", priority: 68 }),
  googleNewsSource({ id: "news-afd-fraktion-arbeit", name: "AfD-Fraktion Arbeit und Soziales", type: "party", query: "site:afdbundestag.de (Arbeit OR Soziales OR Bürgergeld OR Rente OR Pflege)", priority: 58 }),
  googleNewsSource({ id: "news-spd-arbeit", name: "SPD Arbeit und Soziales", type: "party", query: "site:spd.de (Arbeit OR Soziales OR Bürgergeld OR Mindestlohn OR Rente OR Pflege)", priority: 66 }),
  googleNewsSource({ id: "news-cdu-arbeit", name: "CDU Arbeit und Soziales", type: "party", query: "site:cdu.de (Arbeit OR Soziales OR Bürgergeld OR Mindestlohn OR Rente OR Pflege)", priority: 66 }),
  googleNewsSource({ id: "news-gruene-arbeit", name: "Grüne Arbeit und Soziales", type: "party", query: "site:gruene.de (Arbeit OR Soziales OR Bürgergeld OR Mindestlohn OR Rente OR Pflege)", priority: 64 })
];

const topicRadarSources = [
  googleNewsSource({ id: "radar-bmas-vorhaben", name: "BMAS Vorhaben Radar", query: "\"Bundesministerium für Arbeit und Soziales\" (Gesetzentwurf OR Eckpunkte OR Reform OR Verordnung)", priority: 88, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "radar-buergergeld", name: "Bürgergeld Radar", query: "Bürgergeld (Bundesregierung OR BMAS OR Gesetzentwurf OR Reform OR Sanktionen)", priority: 82, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "radar-mindestlohn", name: "Mindestlohn Radar", query: "Mindestlohn (Bundesregierung OR BMAS OR Kommission OR Tarif OR Kontrolle)", priority: 82, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "radar-rente", name: "Renten Radar", query: "Rente Rentenpaket Rentenreform Bundesregierung", priority: 82, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "radar-pflege", name: "Pflege Radar", query: "Pflege Pflegereform Pflegeversicherung Bundesregierung", priority: 82, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "radar-tariftreue", name: "Tariftreue Radar", query: "Tariftreue Tarifbindung Bundestariftreuegesetz Bundesregierung", priority: 82, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "radar-arbeitszeit", name: "Arbeitszeit Radar", query: "Arbeitszeitgesetz Arbeitszeit Reform BMAS Arbeitgeber Gewerkschaften", priority: 80, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "radar-arbeitsmarkt", name: "Arbeitsmarkt Radar", query: "Arbeitsmarkt Beschäftigung Arbeitslosigkeit Bundesagentur Bundesregierung", priority: 78, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "radar-armut", name: "Armuts Radar", query: "Armut Sozialstaat Bürgergeld Sozialverband Bundesregierung", priority: 78, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "radar-ausschuss-arbeit-soziales", name: "Ausschuss Arbeit und Soziales Radar", query: "\"Ausschuss für Arbeit und Soziales\" Bundestag Anhörung Tagesordnung", priority: 86, maxItems: topicRadarDefaultMaxItems })
];

const intelligenceTopics = [
  { id: "arbeit-soziales", label: "Arbeit und Soziales", query: "\"Arbeit und Soziales\"", boost: 8 },
  { id: "bmas-vorhaben", label: "BMAS Vorhaben", query: "\"Bundesministerium für Arbeit und Soziales\" OR BMAS", boost: 10 },
  { id: "bundesregierung-vorhaben", label: "Bundesregierung Vorhaben", query: "Bundesregierung (Vorhaben OR Gesetzentwurf OR Eckpunkte OR Reform)", boost: 8 },
  { id: "buergergeld", label: "Bürgergeld", boost: 7 },
  { id: "mindestlohn", label: "Mindestlohn", boost: 7 },
  { id: "rente", label: "Rente", query: "Rente OR Rentenpaket OR Rentenreform", boost: 7 },
  { id: "tarifbindung", label: "Tarifbindung", boost: 7 },
  { id: "tariftreue", label: "Tariftreue", query: "Tariftreue OR Bundestariftreuegesetz", boost: 7 },
  { id: "arbeitsmarkt", label: "Arbeitsmarkt", boost: 6 },
  { id: "pflege", label: "Pflege", query: "Pflege OR Pflegeversicherung OR Pflegekräfte", boost: 6 },
  { id: "sozialstaat", label: "Sozialstaat", boost: 6 },
  { id: "armut", label: "Armut", query: "Armut OR Kinderarmut OR Altersarmut", boost: 6 },
  { id: "gewerkschaften", label: "Gewerkschaften", boost: 5 },
  { id: "arbeitszeit", label: "Arbeitszeit", query: "Arbeitszeit OR Arbeitszeitgesetz", boost: 5 },
  { id: "ausbildung", label: "Ausbildung", query: "Ausbildung OR Fachkräfte OR Weiterbildung", boost: 4 },
  { id: "wohnungslosigkeit", label: "Wohnungslosigkeit", query: "Wohnungslosigkeit OR Wohngeld OR soziale Sicherung", boost: 4 },
  { id: "sozialversicherung", label: "Sozialversicherung", boost: 5 },
  { id: "lohnentwicklung", label: "Lohnentwicklung", query: "Lohnentwicklung OR Reallohn OR Tariflohn", boost: 4 },
  { id: "grundsicherung", label: "Grundsicherung", boost: 6 },
  { id: "inklusion", label: "Inklusion", query: "Inklusion OR Teilhabe OR Schwerbehinderung", boost: 4 },
  { id: "migration-arbeit", label: "Migration und Arbeit", query: "Migration Arbeitsmarkt OR Fachkräfteeinwanderung", boost: 3 },
  { id: "ost-west-lohn", label: "Ost-West-Lohn", query: "Ost West Lohn OR Tarif Ost West", boost: 3 },
  { id: "haushalt-soziales", label: "Sozialhaushalt", query: "Haushalt Sozialetat OR Sozialausgaben", boost: 5 },
  { id: "ausschuss-anhoerung", label: "Ausschussanhörung", query: "Ausschuss Anhörung Arbeit Soziales", boost: 7 },
  { id: "opposition-linie", label: "Oppositionslinie", query: "Opposition Bundesregierung Arbeit Soziales", boost: 4 }
];

const intelligenceContexts = [
  { id: "bundesregierung", name: "Bundesregierung", type: "ministry", query: "Bundesregierung OR Bundeskabinett OR Regierung", priority: 86 },
  { id: "bmas", name: "BMAS", type: "ministry", query: "BMAS OR \"Bundesministerium für Arbeit und Soziales\"", priority: 90 },
  { id: "bundestag", name: "Bundestag", type: "bundestag", query: "Bundestag OR Plenum OR Tagesordnung", priority: 86 },
  { id: "ausschuss", name: "Ausschuss Arbeit und Soziales", type: "committee", query: "\"Ausschuss für Arbeit und Soziales\" OR Ausschuss", priority: 88 },
  { id: "linke", name: "Die Linke", type: "party", query: "\"Die Linke\" OR Linksfraktion OR \"Die Linke im Bundestag\"", priority: 82 },
  { id: "koalition", name: "Koalition", type: "party", query: "SPD OR CDU OR CSU OR Koalition", priority: 72 },
  { id: "gruene-fdp", name: "Grüne/FDP", type: "party", query: "Grüne OR FDP OR Bundestagsfraktion", priority: 66 },
  { id: "afd", name: "AfD", type: "party", query: "AfD OR AfD-Bundestagsfraktion", priority: 56 },
  { id: "dgb", name: "DGB und Gewerkschaften", type: "association", query: "DGB OR ver.di OR IG Metall OR Gewerkschaft", priority: 76 },
  { id: "sozialverbaende", name: "Sozialverbände", type: "association", query: "VdK OR SoVD OR Paritätischer OR Diakonie OR Caritas", priority: 74 },
  { id: "arbeitgeber", name: "Arbeitgeberverbände", type: "association", query: "BDA OR BDI OR Arbeitgeber OR Gesamtmetall", priority: 66 },
  { id: "leitmedien", name: "Leitmedien", type: "media", query: "Tagesschau OR Deutschlandfunk OR Spiegel OR ZEIT OR FAZ OR Süddeutsche", priority: 68 },
  { id: "regional", name: "Regionalmedien", type: "local", query: "Niedersachsen OR Salzgitter OR Wolfenbüttel OR Braunschweig", priority: 68 },
  { id: "fachmedien", name: "Fachmedien", type: "media", query: "Arbeitsrecht OR Sozialrecht OR Sozialpolitik OR Pflegepolitik", priority: 64 }
];

const deepTopicSources = topicBundleSources(intelligenceTopics, intelligenceContexts);

const governmentProcessSources = [
  googleNewsSource({ id: "process-gesetzentwurf-arbeit-soziales", name: "Gesetzentwürfe Arbeit und Soziales", type: "ministry", query: "(Gesetzentwurf OR Referentenentwurf OR Kabinettsbeschluss) (Arbeit OR Soziales OR BMAS OR Bürgergeld OR Rente OR Pflege)", priority: 90, maxItems: 10 }),
  googleNewsSource({ id: "process-eckpunkte-arbeit-soziales", name: "Eckpunkte Arbeit und Soziales", type: "ministry", query: "(Eckpunkte OR Reformpaket OR Verordnung) (BMAS OR Bundesregierung OR Arbeit OR Soziales)", priority: 88, maxItems: 10 }),
  googleNewsSource({ id: "process-bundeskabinett-sozialpolitik", name: "Bundeskabinett Sozialpolitik", type: "ministry", query: "Bundeskabinett (Bürgergeld OR Rente OR Mindestlohn OR Pflege OR Sozialstaat)", priority: 88, maxItems: 10 }),
  googleNewsSource({ id: "process-bundestag-tagesordnung-soziales", name: "Bundestag Tagesordnung Sozialpolitik", type: "bundestag", query: "Bundestag Tagesordnung (Arbeit und Soziales OR Bürgergeld OR Rente OR Mindestlohn OR Pflege)", priority: 86, maxItems: 10 }),
  googleNewsSource({ id: "process-hib-arbeit-soziales", name: "hib Arbeit und Soziales", type: "bundestag", query: "site:bundestag.de/presse/hib (Arbeit und Soziales OR Bürgergeld OR Rente OR Pflege OR Mindestlohn)", priority: 88, maxItems: 10 }),
  googleNewsSource({ id: "process-anhoerung-sozialausschuss", name: "Anhörungen Sozialausschuss", type: "committee", query: "(Anhörung OR Sachverständige OR Tagesordnung) \"Ausschuss für Arbeit und Soziales\"", priority: 90, maxItems: 10 }),
  googleNewsSource({ id: "process-kleine-anfrage-sozialpolitik", name: "Kleine Anfragen Sozialpolitik", type: "bundestag", query: "\"Kleine Anfrage\" (Bürgergeld OR Rente OR Mindestlohn OR Pflege OR Arbeitsmarkt)", priority: 74, maxItems: 8 }),
  googleNewsSource({ id: "process-bundesrat-sozialpolitik", name: "Bundesrat Verfahren Sozialpolitik", type: "bundestag", query: "Bundesrat (Arbeit OR Soziales OR Rente OR Pflege OR Bürgergeld) (Gesetz OR Verordnung)", priority: 82, maxItems: 8 })
];

const stateAndConstituencySources = [
  "Niedersachsen", "Salzgitter", "Wolfenbüttel", "Braunschweig", "Goslar", "Peine", "Helmstedt", "Hannover", "Hildesheim", "Wolfsburg", "Harz",
  "Baden-Württemberg", "Bayern", "Berlin", "Brandenburg", "Bremen", "Hamburg", "Hessen", "Mecklenburg-Vorpommern", "Nordrhein-Westfalen",
  "Rheinland-Pfalz", "Saarland", "Sachsen", "Sachsen-Anhalt", "Schleswig-Holstein", "Thüringen"
].map((region) => googleNewsSource({
  id: `region-${slugify(region)}-arbeit-soziales`,
  name: `${region} Arbeit und Soziales`,
  type: ["Niedersachsen", "Salzgitter", "Wolfenbüttel", "Braunschweig", "Goslar", "Peine", "Helmstedt", "Hannover", "Hildesheim", "Wolfsburg", "Harz"].includes(region) ? "local" : "media",
  query: `${region} (Arbeit OR Soziales OR Pflege OR Rente OR Bürgergeld OR Mindestlohn OR Arbeitsmarkt)`,
  priority: ["Salzgitter", "Wolfenbüttel", "Braunschweig", "Niedersachsen"].includes(region) ? 72 : 58,
  maxItems: 8
}));

const additionalInstitutionSources = [
  googleNewsSource({ id: "institution-bundesagentur-statistik", name: "BA Statistik", type: "official", query: "site:statistik.arbeitsagentur.de (Arbeitsmarkt OR Beschäftigung OR Arbeitslosigkeit)", priority: 82, maxItems: 8 }),
  googleNewsSource({ id: "institution-minijob-zentrale", name: "Minijob-Zentrale", type: "official", query: "site:minijob-zentrale.de (Minijob OR Mindestlohn OR Beschäftigung)", priority: 66, maxItems: 8 }),
  googleNewsSource({ id: "institution-zoll-finanzkontrolle", name: "Finanzkontrolle Schwarzarbeit", type: "official", query: "site:zoll.de (Mindestlohn OR Schwarzarbeit OR Finanzkontrolle)", priority: 76, maxItems: 8 }),
  googleNewsSource({ id: "institution-bmas-forschungsberichte", name: "BMAS Forschungsberichte", type: "ministry", query: "site:bmas.de Forschungsbericht (Arbeitsmarkt OR Rente OR Bürgergeld OR Sozialstaat)", priority: 82, maxItems: 8 }),
  googleNewsSource({ id: "institution-bundesrechnungshof-soziales", name: "Bundesrechnungshof Sozialausgaben", type: "official", query: "site:bundesrechnungshof.de (Sozialausgaben OR Rente OR Bürgergeld OR Pflege)", priority: 70, maxItems: 8 }),
  googleNewsSource({ id: "institution-deutscher-verein", name: "Deutscher Verein Sozialpolitik", type: "association", query: "site:deutscher-verein.de (Sozialpolitik OR Bürgergeld OR Pflege OR Armut)", priority: 72, maxItems: 8 }),
  googleNewsSource({ id: "institution-wsi", name: "WSI", type: "association", query: "site:wsi.de (Tarifbindung OR Mindestlohn OR Arbeitsmarkt OR Lohn)", priority: 74, maxItems: 8 }),
  googleNewsSource({ id: "institution-boeckler", name: "Hans-Böckler-Stiftung", type: "association", query: "site:boeckler.de (Tarif OR Arbeit OR Soziales OR Mitbestimmung)", priority: 72, maxItems: 8 }),
  googleNewsSource({ id: "institution-bertelsmann-soziales", name: "Bertelsmann Stiftung Sozialpolitik", type: "association", query: "site:bertelsmann-stiftung.de (Armut OR Pflege OR Arbeitsmarkt OR Sozialstaat)", priority: 60, maxItems: 8 }),
  googleNewsSource({ id: "institution-oecd-arbeit", name: "OECD Arbeit und Soziales", type: "official", query: "site:oecd.org Germany (labour OR social OR pension OR employment)", priority: 60, maxItems: 8 }),
  googleNewsSource({ id: "institution-ilo-deutschland", name: "ILO Deutschland", type: "official", query: "ILO Deutschland (Arbeit OR Tarif OR Mindestlohn OR Beschäftigung)", priority: 62, maxItems: 8 }),
  googleNewsSource({ id: "institution-eurofound-deutschland", name: "Eurofound Deutschland", type: "official", query: "Eurofound Deutschland (Arbeitsmarkt OR Arbeitszeit OR Tarif)", priority: 58, maxItems: 8 })
];

const socialPolicySignalSources = [
  googleNewsSource({ id: "signal-sozialproteste", name: "Sozialproteste", type: "media", query: "(Protest OR Kritik OR Demonstration) (Bürgergeld OR Rente OR Pflege OR Mindestlohn OR Sozialstaat)", priority: 58, maxItems: 8 }),
  googleNewsSource({ id: "signal-medienkritik-buergergeld", name: "Bürgergeld Kritik Medienlage", type: "media", query: "Bürgergeld (Kritik OR Sanktionen OR Debatte OR Streit)", priority: 64, maxItems: 10 }),
  googleNewsSource({ id: "signal-rentenstreit", name: "Rentenstreit Medienlage", type: "media", query: "Rentenpaket OR Rentenreform (Streit OR Kritik OR Finanzierung)", priority: 66, maxItems: 10 }),
  googleNewsSource({ id: "signal-pflegekrise", name: "Pflegekrise Medienlage", type: "media", query: "Pflege (Krise OR Reform OR Beiträge OR Personalmangel)", priority: 64, maxItems: 10 }),
  googleNewsSource({ id: "signal-mindestlohnkommission", name: "Mindestlohnkommission", type: "association", query: "Mindestlohnkommission (Empfehlung OR Beschluss OR Kritik OR Gewerkschaft)", priority: 76, maxItems: 10 }),
  googleNewsSource({ id: "signal-tarifflucht", name: "Tarifflucht", type: "association", query: "Tarifflucht OR Tarifbindung (DGB OR Arbeitgeber OR Bundesregierung)", priority: 72, maxItems: 10 }),
  googleNewsSource({ id: "signal-armutsbericht", name: "Armutsbericht", type: "association", query: "Armutsbericht OR Armutsquote OR Kinderarmut OR Altersarmut", priority: 70, maxItems: 10 }),
  googleNewsSource({ id: "signal-sozialhaushalt", name: "Sozialhaushalt Debatte", type: "media", query: "Sozialhaushalt OR Sozialetat (Kürzung OR Haushalt OR Bundesregierung)", priority: 70, maxItems: 10 }),
  googleNewsSource({ id: "signal-lohnentwicklung", name: "Lohnentwicklung", type: "official", query: "Lohnentwicklung OR Reallöhne OR Tariflöhne (Destatis OR WSI OR DGB)", priority: 70, maxItems: 10 }),
  googleNewsSource({ id: "signal-arbeitslosigkeit", name: "Arbeitslosigkeit", type: "official", query: "Arbeitslosigkeit OR Arbeitsmarktbericht (Bundesagentur OR Bundesregierung)", priority: 70, maxItems: 10 }),
  googleNewsSource({ id: "signal-ost-west-soziales", name: "Ost-West Sozialpolitik", type: "media", query: "Ost West (Lohn OR Rente OR Pflege OR Arbeitsmarkt)", priority: 56, maxItems: 8 }),
  googleNewsSource({ id: "signal-junge-beschaeftigte", name: "Junge Beschäftigte", type: "media", query: "Ausbildung OR junge Beschäftigte OR Azubi (Mindestlohn OR Tarif OR Arbeit)", priority: 54, maxItems: 8 })
];

// Breite Abdeckung ALLER staendigen Bundestagsausschuesse, damit jedes Mandat (jede Partei,
// jeder Ausschuss) relevante Rohartikel im geteilten Crawl findet.
//
// VERBINDLICHE SOLLMENGE: seeds/bundestag-ausschuesse.js — die 24 staendigen Ausschuesse des
// 21. Deutschen Bundestages nach Drucksache 21/150 (Einsetzungsbeschluss 15.05.2025). Die
// `name`-Angabe jeder Quelle ist die AMTLICHE Bezeichnung und wird aus der Sollmenge geholt,
// nicht hier gepflegt — so kann eine Umbenennung nicht in einer von zwei Listen haengenbleiben.
//
// Korrektur 2026-07-26 (Punkt 13): Diese Liste fuehrte 22 Eintraege mit Bezeichnungen und
// Zuschnitten der 20. Wahlperiode. Zusammen mit der Kernquelle `ausschuss-arbeit-soziales`
// waren das 23 Ausschuesse — der 21. Bundestag hat 24. Es fehlte der Ausschuss fuer
// Wahlpruefung, Immunitaet und Geschaeftsordnung; ausserdem waren mehrere Zuschnitte veraltet
// (Bildung ist zur 21. WP in den Familienausschuss gewandert, Forschung/Technologie/Raumfahrt
// bildet einen eigenen Ausschuss, Landwirtschaft/Recht/Digitales/Sport/Umwelt/Wohnen sind
// umbenannt bzw. erweitert).
//
// Die Katalog-Ids (`committee-<slug>`) sind ABSICHTLICH UNVERAENDERT geblieben, auch wo der
// Slug nicht mehr zum Ausschussnamen passt (`committee-bildung` traegt jetzt den
// Forschungsausschuss). Eine Id-Aenderung wuerde beim Seed-Einspielen eine NEUE
// retrieval_paths-Zeile anlegen und die alte als Waise im Pflichtpaket zuruecklassen — sie
// wuerde weiter gecrawlt. Die fachliche Bindung laeuft deshalb ueber `ausschussKey`, nicht
// ueber den Slug.
const bundestagCommitteeSources = [
  // [Katalog-Id (eingefroren), stabile Ausschusskennung, Suchbegriffe des Politikfelds]
  ["gesundheit", "gesundheit", "Gesundheit OR Krankenhaus OR Pflegeversicherung OR Krankenkasse OR Gesundheitsreform OR Bundesgesundheitsminister"],
  ["verteidigung", "verteidigung", "Bundeswehr OR Verteidigung OR Wehrdienst OR Rüstung OR NATO OR Verteidigungsminister"],
  ["auswaertiges", "auswaertiges", "Außenpolitik OR \"Auswärtiges Amt\" OR Diplomatie OR Außenminister"],
  ["inneres", "inneres-heimat", "Innenpolitik OR Migration OR Asyl OR Polizei OR Innenminister OR Bevölkerungsschutz"],
  ["recht", "recht-verbraucherschutz", "Justiz OR Rechtspolitik OR Justizminister OR Strafrecht OR Verfassung OR Verbraucherschutz"],
  ["finanzen", "finanzen", "Finanzpolitik OR Finanzminister OR Steuer OR Schuldenbremse OR Steuerreform"],
  ["haushalt", "haushalt", "Bundeshaushalt OR Haushaltsausschuss OR Etat OR Haushaltsentwurf OR Sparhaushalt"],
  ["wirtschaft", "wirtschaft-energie", "Wirtschaftspolitik OR Energiepolitik OR Industrie OR Wirtschaftsminister OR Mittelstand"],
  ["klima-umwelt", "umwelt-klimaschutz-naturschutz-nukleare-sicherheit", "Klimaschutz OR Umwelt OR Energiewende OR Naturschutz OR Klimapolitik OR \"nukleare Sicherheit\""],
  ["landwirtschaft", "landwirtschaft-ernaehrung-heimat", "Landwirtschaft OR Ernährung OR Bauern OR Agrarpolitik OR Tierschutz OR Heimat"],
  // 21. WP: Bildung liegt beim Familienausschuss (BMBFSFJ-Zuschnitt), nicht mehr bei Forschung.
  ["familie", "bildung-familie-senioren-frauen-jugend", "Familienpolitik OR Kindergeld OR Kindergrundsicherung OR Jugend OR Gleichstellung OR Bildungspolitik OR Schule OR BAföG"],
  // 21. WP: eigener Ausschuss fuer Forschung/Technologie/Raumfahrt (Id bleibt aus Bestandsschutz).
  ["bildung", "forschung-technologie-raumfahrt", "Forschungspolitik OR Forschung OR Technologie OR Raumfahrt OR Technikfolgenabschätzung OR Hochschule OR Wissenschaft"],
  ["verkehr", "verkehr", "Verkehrspolitik OR Bahn OR Deutschlandticket OR Autobahn OR Verkehrsminister"],
  ["digitales", "digitales-staatsmodernisierung", "Digitalpolitik OR Digitalisierung OR \"Künstliche Intelligenz\" OR Datenschutz OR Breitband OR Staatsmodernisierung"],
  ["bau-wohnen", "wohnen-stadtentwicklung-bauwesen-kommunen", "Wohnungspolitik OR Mieten OR Wohnungsbau OR Mietpreisbremse OR Bauminister OR Stadtentwicklung OR Kommunen"],
  ["menschenrechte", "menschenrechte-humanitaere-hilfe", "Menschenrechte OR \"humanitäre Hilfe\""],
  ["kultur-medien", "kultur-medien", "Kulturpolitik OR Medienpolitik OR Rundfunkbeitrag OR Kulturstaatsminister"],
  ["entwicklung", "wirtschaftliche-zusammenarbeit-entwicklung", "Entwicklungspolitik OR Entwicklungshilfe OR BMZ OR Entwicklungsminister"],
  ["europa", "europaeische-union", "Europapolitik OR \"Europäische Union\" OR EU-Kommission OR Brüssel"],
  ["tourismus", "tourismus", "Tourismuspolitik OR Tourismusbranche"],
  ["sport", "sport-ehrenamt", "Sportpolitik OR Sportförderung OR Spitzensport OR Ehrenamt"],
  ["petitionen", "petitionen", "Petitionsausschuss OR \"Petition Bundestag\""],
  // NEU 2026-07-26: der bisher fehlende 24. staendige Ausschuss. Suchbegriffe strikt aus der
  // amtlichen Bezeichnung abgeleitet — keine erfundenen Themen.
  ["wahlpruefung", "wahlpruefung-immunitaet-geschaeftsordnung", "Wahlprüfung OR Immunität OR Geschäftsordnung OR Wahlrecht"]
].map(([id, ausschussKey, terms]) => {
  const ausschuss = ausschussByKey(ausschussKey);
  if (!ausschuss) throw new Error(`Unbekannte Ausschusskennung im Katalog: ${ausschussKey}`);
  return {
    ...googleNewsSource({
      id: `committee-${id}`,
      // Amtliche Bezeichnung aus der Sollmenge. Der Name beginnt bei den meisten Ausschuessen
      // mit "Ausschuss …"; die vier Kurzformen (Auswärtiger Ausschuss, Petitionsausschuss,
      // Finanzausschuss, Haushaltsausschuss, Verteidigungsausschuss) tragen die
      // Institutionsbezeichnung im Wort selbst.
      name: ausschuss.name,
      type: "committee",
      query: `(${terms}) (Bundestag OR Bundesregierung OR Gesetzentwurf OR Ausschuss OR Reform)`,
      priority: 80,
      maxItems: topicRadarDefaultMaxItems
    }),
    ausschussKey
  };
});

// Die FRAKTIONEN des Bundestages, damit jede Fraktion ihre Positionen/Anträge findet.
//
// VERBINDLICHE SOLLMENGE: seeds/parlamentszusammensetzung.js — die 5 Fraktionen des
// 21. Deutschen Bundestages (amtliche Sitzverteilung, 630 Sitze). Jede dieser Quellen traegt
// eine stabile `fraktionKey`-Kennung; die Vollzaehligkeitspruefung von "bund-basis" laeuft
// gegen die Sollmenge, nicht gegen diese Liste.
//
// Korrektur 2026-07-26 (Punkt 13): diese Liste fuehrte ACHT Eintraege als Fraktionen und wurde
// als "8 von 8 Fraktionen" gemessen. Fachlich falsch: FDP (4,3 %) und BSW (4,97 %) sind im
// 21. Bundestag ueberhaupt nicht vertreten, und der SSW hat mit einem Mandat keinen
// Fraktionsstatus. Die drei Quellen bleiben erhalten (sie liefern politisch relevante
// Parteiberichterstattung), zaehlen aber NICHT mehr als Fraktion — sie stehen unten in
// `parteienOhneFraktionsstatusSources`.
const bundestagFractionSources = [
  // [Katalog-Id-Suffix (eingefroren), Fraktionskennung der Sollmenge, Suchbegriffe]
  ["cdu-csu", "cdu-csu", "\"CDU/CSU\" OR Unionsfraktion OR CDU OR CSU"],
  ["spd", "spd", "\"SPD-Bundestagsfraktion\" OR SPD-Fraktion OR SPD"],
  ["gruene", "gruene", "\"Bündnis 90/Die Grünen\" OR Grünen-Fraktion OR \"Grüne Bundestag\""],
  ["linke", "linke", "\"Die Linke\" OR Linksfraktion OR \"Die Linke im Bundestag\""],
  ["afd", "afd", "\"AfD-Bundestagsfraktion\" OR AfD-Fraktion"]
].map(([id, fraktionKey, terms]) => {
  const f = BUNDESTAG_21.fraktionen.find((x) => x.key === fraktionKey);
  if (!f) throw new Error(`Unbekannte Fraktionskennung im Katalog: ${fraktionKey}`);
  return {
    ...googleNewsSource({
      id: `fraction-${id}`,
      // "Fraktion <amtliche Bezeichnung>": die Sollmenge fuehrt die Plenarbezeichnung
      // ("CDU/CSU", "Die Linke"), die Quellenbezeichnung benennt den Zusammenschluss. Einheitlich
      // vorangestellt, damit die amtliche Bezeichnung woertlich enthalten bleibt und keine
      // Kunstform entsteht ("Bündnis 90/Die Grünen-Fraktion").
      name: `Fraktion ${f.name}`,
      type: "party",
      query: `(${terms}) (Bundestag OR Fraktion OR Antrag OR Gesetzentwurf OR Position OR fordert)`,
      priority: 72,
      maxItems: topicRadarDefaultMaxItems
    }),
    fraktionKey
  };
});

// Parteien OHNE Fraktionsstatus im 21. Bundestag. Bewusst als eigener Block: sie sind
// politisch beobachtungswuerdig, aber keine Fraktion. Ohne diese Trennung waeren sie weiter
// als Fraktion gezaehlt worden (Ursache der falschen "8 von 8"-Angabe). Die Suchdefinitionen
// bleiben unveraendert — es aendert sich nur die fachliche Einordnung und die Bezeichnung.
const parteienOhneFraktionsstatusSources = [
  ["fdp", "FDP", "\"FDP-Bundestagsfraktion\" OR FDP-Fraktion OR FDP"],
  ["bsw", "BSW", "\"BSW\" OR \"Bündnis Sahra Wagenknecht\""],
  ["ssw", "SSW", "SSW Bundestag OR Südschleswigscher"]
].map(([id, label, terms]) => ({
  ...googleNewsSource({
    id: `fraction-${id}`,
    name: label,
    type: "party",
    query: `(${terms}) (Bundestag OR Fraktion OR Antrag OR Gesetzentwurf OR Position OR fordert)`,
    priority: 72,
    maxItems: topicRadarDefaultMaxItems
  }),
  ohneFraktionsstatus: true
}));

// Allgemeine Bundespolitik als Grundrauschen für jedes Mandat.
const generalPoliticsSources = [
  googleNewsSource({ id: "general-bundestag-plenum", name: "Bundestag Plenum", type: "bundestag", query: "Bundestag (Plenum OR Debatte OR Abstimmung OR Tagesordnung)", priority: 80, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "general-bundesregierung-vorhaben", name: "Bundesregierung Vorhaben", type: "ministry", query: "Bundesregierung (Gesetzentwurf OR Eckpunkte OR Kabinettsbeschluss OR Reform)", priority: 80, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "general-bundeskabinett", name: "Bundeskabinett", type: "ministry", query: "Bundeskabinett (Beschluss OR Gesetzentwurf OR Sitzung)", priority: 78, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "general-koalition", name: "Koalition Bundespolitik", type: "party", query: "Koalition (Streit OR Einigung OR Bundesregierung OR Kompromiss)", priority: 72, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "general-hib", name: "hib Bundestag", type: "bundestag", query: "site:bundestag.de/presse/hib", priority: 78, maxItems: topicRadarDefaultMaxItems })
];

// --- Regionalpaket Niedersachsen: benannte Herausgeber, VORBEREITET und INAKTIV ------------
//
// Befund (Punkt 13): das Paket "regional-niedersachsen" enthielt ausschliesslich
// Google-News-THEMENsuchen ("Salzgitter Arbeit und Soziales"). Deren Herausgeber ist der
// Aggregator — das Paket hatte damit 0 benannte Herausgeber, 0 amtliche und 0 journalistische
// Beleglage, obwohl sein Zweck "Regionale Beobachtung Niedersachsen" ist.
//
// Diese Basis schliesst die Luecke mit BENANNTEN Herausgebern. Zwei Grundsaetze:
//   1. WIEDERVERWENDUNG vor Neuanlage: fuenf der sieben Wege sind bereits im Katalog
//      vorhanden (regionalSources / publicBroadcastRegionalSources) und wurden nur von der
//      Kuratierungsschwelle entfernt. Sie werden hier angereichert, nicht neu erfunden.
//   2. VORBEREITET, NICHT AKTIV: jeder Weg traegt `preparedOnly` -> der Katalog-Mapper setzt
//      `status='paused'` + `activation_mode='manual'`, und `active: false` haelt ihn aus
//      `getSources()` (Fallback-Pfad) heraus. Damit entsteht in BEIDEN Crawlpfaden kein
//      zusaetzlicher Abruf: buildRelationalCrawlPlan schliesst `paused` in Regel 4 aus,
//      isPathActive liefert false. Die Aktivierung ist eine eigene Freigabeentscheidung.
//
// Die beiden amtlichen Wege sind `site:`-gebundene Google-News-Suchen auf die verifizierten
// amtlichen Domains — kein geratener Feed-Pfad. Belege:
//   landtag-niedersachsen.de  — Niedersaechsischer Landtag (amtliche Website)
//   niedersachsen.de          — Portal Niedersachsen / Niedersaechsische Landesregierung
// Ein direkter RSS-Pfad ist von hier aus nicht verifizierbar (kein Netzzugang auf die
// Domains); eine geratene Feed-URL waere eine erfundene Quelle. Derselbe Weg wie im
// Landesmodul BE/BB ("googlenews-Ersatz site:…, kein Direkt-Feed auffindbar").
const NDS_PAKET = "regional-niedersachsen";

// Bereits vorhandene Katalogquellen, die die Niedersachsen-Basis tragen: Id -> Pflichtklasse.
const NDS_BESTANDSQUELLEN = {
  "news-haz": "regionale_leitmedien",              // Hannoversche Allgemeine (Landeshauptstadt)
  "news-ndr": "oer_landesberichterstattung",       // NDR (oeffentlich-rechtliche Landesredaktion)
  "news-braunschweiger-zeitung": "wahlkreismedien",
  "news-salzgitter-zeitung": "wahlkreismedien",
  "news-regionalheute": "wahlkreismedien"
};
const NDS_BESTANDS_IDS = new Set(Object.keys(NDS_BESTANDSQUELLEN));

// Amtliche Landesebene — im Katalog bisher nicht vorhanden, deshalb neu angelegt.
const niedersachsenAmtlicheSources = [
  {
    id: "nds-landtag", name: "Niedersächsischer Landtag", domain: "landtag-niedersachsen.de",
    klasse: "landesparlament",
    terms: ["Landtag", "Plenum", "Ausschuss", "Drucksache", "Gesetzentwurf", "Anfrage"]
  },
  {
    id: "nds-landesregierung", name: "Niedersächsische Landesregierung", domain: "niedersachsen.de",
    klasse: "landesregierung",
    terms: ["Landesregierung", "Staatskanzlei", "Ministerium", "Kabinett", "Landespolitik"]
  }
].map((e) => ({
  ...googleNewsSource({
    id: e.id,
    name: e.name,
    // Legacy-Typ 'government' -> Entitaetstyp 'government' (nicht 'authority'), damit die
    // Belegfunktion zusammen mit category='offiziell' auf official_primary faellt.
    type: "government",
    url: `https://${e.domain}`,
    query: `site:${e.domain} (${e.terms.join(" OR ")})`,
    priority: 70,
    maxItems: topicRadarDefaultMaxItems
  }),
  category: "offiziell",
  regionalKlasse: e.klasse,
  regionalPaket: NDS_PAKET,
  preparedOnly: true,
  active: false
}));

// Anreicherung der fuenf Bestandsquellen: identische URL/Query, ergaenzt um Pflichtklasse,
// Paketbindung und den vorbereiteten (inaktiven) Zustand.
function niedersachsenBestandsSources() {
  const alle = [...regionalSources, ...publicBroadcastRegionalSources];
  return Object.keys(NDS_BESTANDSQUELLEN).map((id) => {
    const basis = alle.find((s) => s.id === id);
    if (!basis) throw new Error(`Niedersachsen-Basisquelle fehlt im Katalog: ${id}`);
    return {
      ...basis,
      regionalKlasse: NDS_BESTANDSQUELLEN[id],
      regionalPaket: NDS_PAKET,
      preparedOnly: true,
      active: false
    };
  });
}

// Kuratierung: reduziert die Quellenliste auf einen fokussierten, performanten Satz
// (~130 statt ~560), damit der Crawl Google News nicht überlastet und im Zeitlimit bleibt.
// Abschaltbar via HELMUT_SOURCE_CURATION=off -> volle Liste.
const sourceCurationEnabled = process.env.HELMUT_SOURCE_CURATION !== "off";

function isGoogleNewsSource(source) {
  return isStrictGoogleNewsUrl(source.rssUrl);
}

function keepCuratedSource(source) {
  // Alle Direkt-Feeds (kein Google News) immer behalten – zuverlässig, keine Drosselung.
  if (!isGoogleNewsSource(source)) return true;
  // Vorbereitete Pflichtquellen eines Regionalpakets bleiben im Katalog, damit das Paket
  // fachlich vollstaendig ist. Sie erzeugen KEINE Crawl-Last: `preparedOnly` -> status
  // 'paused' im Abrufweg und `active: false` -> nicht in getSources(). Ohne diese Ausnahme
  // haette die Prioritaetsschwelle unten (media ab 64) sie wieder entfernt — genau das war
  // die Ursache dafuer, dass das Paket nur Aggregator-Wege enthielt.
  if (source.regionalKlasse) return true;
  if (source.type === "person" || source.type === "official") return true;
  // Themen-x-Kontext-Matrix ("Thema · Kontext"): nur EINEN Kontext behalten -> keine Dubletten.
  if (/ · /.test(source.name)) return /· Ausschuss Arbeit und Soziales$/.test(source.name);
  if (["ministry", "committee", "bundestag"].includes(source.type)) return source.priority >= 78;
  if (source.type === "association") return source.priority >= 64;
  if (source.type === "party") return source.priority >= 72;
  if (source.type === "media") return source.priority >= 64;
  if (source.type === "local") return source.priority >= 68;
  return false;
}

const v1Sources = uniqueSources([
  // Neutrale Basis (für JEDES Mandat sinnvoll): Institutionen, ALLE Ausschüsse,
  // ALLE Fraktionen, allgemeine Bundespolitik, Leitmedien (neutralisierte Queries).
  ...tagCoreSources(coreSources),
  ...tagSources(bundestagCommitteeSources, { neutral: true }),
  ...tagSources(bundestagFractionSources, { neutral: true }),
  ...tagSources(parteienOhneFraktionsstatusSources, { neutral: true }),
  ...tagSources(generalPoliticsSources, { neutral: true }),
  ...tagSources(mediaSources, { neutral: true }),
  ...tagSources(broadGermanMediaSources, { neutral: true }),
  // Thematisch (sozialpolitisch) — NUR bei passendem Profil/Demo, kein Standard.
  ...tagSources(officialSearchSources, { neutral: false, themeTerms: SOCIAL_THEME_TERMS }),
  ...tagSources(specialistSources, { neutral: false, themeTerms: SOCIAL_THEME_TERMS }),
  ...tagSources(policySpecialistSources, { neutral: false, themeTerms: SOCIAL_THEME_TERMS }),
  ...tagSources(associationSources, { neutral: false, themeTerms: SOCIAL_THEME_TERMS }),
  ...tagSources(politicalActorSources, { neutral: false, themeTerms: SOCIAL_THEME_TERMS }),
  ...tagSources(topicRadarSources, { neutral: false, themeTerms: SOCIAL_THEME_TERMS }),
  ...tagSources(governmentProcessSources, { neutral: false, themeTerms: SOCIAL_THEME_TERMS }),
  ...tagSources(additionalInstitutionSources, { neutral: false, themeTerms: SOCIAL_THEME_TERMS }),
  ...tagSources(socialPolicySignalSources, { neutral: false, themeTerms: SOCIAL_THEME_TERMS }),
  ...tagSources(deepTopicSources, { neutral: false, themeTerms: SOCIAL_THEME_TERMS }),
  // Regional — NUR wenn das Profil eine passende Region/Lokalmedien trägt.
  // Die benannte Niedersachsen-Basis zuerst und die fuenf Bestands-Ids aus den Alt-Listen
  // herausgenommen: so gibt es je Id genau EINE Definition (kein Verlass auf Dedup-Reihenfolge).
  ...tagSources(niedersachsenAmtlicheSources, { neutral: false, regional: true }),
  ...tagSources(niedersachsenBestandsSources(), { neutral: false, regional: true }),
  ...tagSources(regionalSources.filter((s) => !NDS_BESTANDS_IDS.has(s.id)), { neutral: false, regional: true }),
  ...tagSources(publicBroadcastRegionalSources.filter((s) => !NDS_BESTANDS_IDS.has(s.id)), { neutral: false, regional: true }),
  ...tagSources(stateAndConstituencySources, { neutral: false, regional: true, themeTerms: SOCIAL_THEME_TERMS })
])
  .filter((source) => !sourceCurationEnabled || keepCuratedSource(source))
  .slice(0, sourceTarget);

module.exports = { v1Sources };
