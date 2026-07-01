const mandateTerms = [
  "Arbeit und Soziales",
  "BMAS",
  "Bürgergeld",
  "Mindestlohn",
  "Rente",
  "Pflege",
  "Tarifbindung",
  "Tariftreue",
  "Arbeitsmarkt",
  "Sozialstaat"
];

const googleNewsDefaultMaxItems = positiveInteger(process.env.HELMUT_GOOGLE_NEWS_MAX_ITEMS, 12);
const directRssDefaultMaxItems = positiveInteger(process.env.HELMUT_DIRECT_RSS_MAX_ITEMS, 16);
const personSearchDefaultMaxItems = positiveInteger(process.env.HELMUT_PERSON_NEWS_MAX_ITEMS, 40);
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

function siteSource(id, name, domain, priority = 62, extraTerms = mandateTerms) {
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

const coreSources = [
  directSource({
    id: "cem-ince-news",
    name: "Cem Ince News-Suche",
    type: "person",
    url: "https://news.google.com/search?q=%22Cem%20Ince%22",
    rssUrl: "https://news.google.com/rss/search?q=%22Cem%20Ince%22&hl=de&gl=DE&ceid=DE:de",
    crawlMethod: "rss",
    priority: 100,
    maxItems: personSearchDefaultMaxItems
  }),
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
    rssUrl: "https://www.bundesregierung.de/breg-de/service/rss",
    rssUrls: [
      "https://www.bundesregierung.de/breg-de/service/rss",
      "https://www.bundesregierung.de/breg-de/aktuelles/rss-feed"
    ],
    crawlMethod: "rss",
    priority: 95
  }),
  directSource({
    id: "bundestag",
    name: "Bundestag",
    type: "bundestag",
    url: "https://www.bundestag.de",
    rssUrl: "https://www.bundestag.de/rss",
    rssUrls: [
      "https://www.bundestag.de/rss",
      "https://www.bundestag.de/presse/hib/rss"
    ],
    crawlMethod: "rss",
    priority: 100
  }),
  directSource({
    id: "ausschuss-arbeit-soziales",
    name: "Ausschuss Arbeit und Soziales",
    type: "committee",
    url: "https://www.bundestag.de/ausschuesse/a11_arbeit_soziales",
    rssUrl: "",
    rssUrls: [],
    crawlMethod: "html",
    priority: 95
  }),
  directSource({
    id: "die-linke",
    name: "Die Linke",
    type: "party",
    url: "https://www.die-linke.de",
    rssUrl: "https://www.die-linke.de/start/presse/rss.xml",
    crawlMethod: "rss",
    priority: 90
  }),
  directSource({
    id: "linksfraktion",
    name: "Die Linke im Bundestag",
    type: "party",
    url: "https://www.dielinkebt.de",
    rssUrl: "https://www.dielinkebt.de/presse/pressemitteilungen/rss.xml",
    rssUrls: [
      "https://www.dielinkebt.de/presse/pressemitteilungen/rss.xml",
      "https://www.linksfraktion.de/presse/pressemitteilungen/rss.xml"
    ],
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
    rssUrl: "",
    rssUrls: [],
    crawlMethod: "html",
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

// Breite Abdeckung ALLER Bundestags-Ausschüsse/Politikfelder, damit jedes Mandat
// (jede Partei, jeder Ausschuss) relevante Rohartikel im geteilten Crawl findet.
const bundestagCommitteeSources = [
  ["gesundheit", "Gesundheit", "Gesundheit OR Krankenhaus OR Pflegeversicherung OR Krankenkasse OR Gesundheitsreform OR Bundesgesundheitsminister"],
  ["verteidigung", "Verteidigung", "Bundeswehr OR Verteidigung OR Wehrdienst OR Rüstung OR NATO OR Verteidigungsminister"],
  ["auswaertiges", "Auswärtiges", "Außenpolitik OR \"Auswärtiges Amt\" OR Diplomatie OR Außenminister"],
  ["inneres", "Inneres und Heimat", "Innenpolitik OR Migration OR Asyl OR Polizei OR Innenminister OR Bevölkerungsschutz"],
  ["recht", "Recht", "Justiz OR Rechtspolitik OR Justizminister OR Strafrecht OR Verfassung"],
  ["finanzen", "Finanzen", "Finanzpolitik OR Finanzminister OR Steuer OR Schuldenbremse OR Steuerreform"],
  ["haushalt", "Haushalt", "Bundeshaushalt OR Haushaltsausschuss OR Etat OR Haushaltsentwurf OR Sparhaushalt"],
  ["wirtschaft", "Wirtschaft und Energie", "Wirtschaftspolitik OR Energiepolitik OR Industrie OR Wirtschaftsminister OR Mittelstand"],
  ["klima-umwelt", "Klima und Umwelt", "Klimaschutz OR Umwelt OR Energiewende OR Naturschutz OR Klimapolitik"],
  ["landwirtschaft", "Ernährung und Landwirtschaft", "Landwirtschaft OR Ernährung OR Bauern OR Agrarpolitik OR Tierschutz"],
  ["familie", "Familie, Senioren, Frauen und Jugend", "Familienpolitik OR Kindergeld OR Kindergrundsicherung OR Jugend OR Gleichstellung"],
  ["bildung", "Bildung und Forschung", "Bildungspolitik OR Forschung OR Hochschule OR Wissenschaft OR BAföG OR Schule"],
  ["verkehr", "Verkehr", "Verkehrspolitik OR Bahn OR Deutschlandticket OR Autobahn OR Verkehrsminister"],
  ["digitales", "Digitales", "Digitalpolitik OR Digitalisierung OR \"Künstliche Intelligenz\" OR Datenschutz OR Breitband"],
  ["bau-wohnen", "Bauen und Wohnen", "Wohnungspolitik OR Mieten OR Wohnungsbau OR Mietpreisbremse OR Bauminister"],
  ["menschenrechte", "Menschenrechte und humanitäre Hilfe", "Menschenrechte OR \"humanitäre Hilfe\""],
  ["kultur-medien", "Kultur und Medien", "Kulturpolitik OR Medienpolitik OR Rundfunkbeitrag OR Kulturstaatsminister"],
  ["entwicklung", "Wirtschaftliche Zusammenarbeit und Entwicklung", "Entwicklungspolitik OR Entwicklungshilfe OR BMZ OR Entwicklungsminister"],
  ["europa", "Europäische Union", "Europapolitik OR \"Europäische Union\" OR EU-Kommission OR Brüssel"],
  ["tourismus", "Tourismus", "Tourismuspolitik OR Tourismusbranche"],
  ["sport", "Sport", "Sportpolitik OR Sportförderung OR Spitzensport"],
  ["petitionen", "Petitionen", "Petitionsausschuss OR \"Petition Bundestag\""]
].map(([id, label, terms]) => googleNewsSource({
  id: `committee-${id}`,
  name: `Ausschuss ${label}`,
  type: "committee",
  query: `(${terms}) (Bundestag OR Bundesregierung OR Gesetzentwurf OR Ausschuss OR Reform)`,
  priority: 80,
  maxItems: topicRadarDefaultMaxItems
}));

// Alle Bundestagsfraktionen, damit jede Partei ihre Positionen/Anträge findet.
const bundestagFractionSources = [
  ["cdu-csu", "CDU/CSU-Fraktion", "\"CDU/CSU\" OR Unionsfraktion OR CDU OR CSU"],
  ["spd", "SPD-Fraktion", "\"SPD-Bundestagsfraktion\" OR SPD-Fraktion OR SPD"],
  ["gruene", "Grüne-Fraktion", "\"Bündnis 90/Die Grünen\" OR Grünen-Fraktion OR \"Grüne Bundestag\""],
  ["linke", "Linksfraktion", "\"Die Linke\" OR Linksfraktion OR \"Die Linke im Bundestag\""],
  ["afd", "AfD-Fraktion", "\"AfD-Bundestagsfraktion\" OR AfD-Fraktion"],
  ["fdp", "FDP-Fraktion", "\"FDP-Bundestagsfraktion\" OR FDP-Fraktion OR FDP"],
  ["bsw", "BSW", "\"BSW\" OR \"Bündnis Sahra Wagenknecht\""],
  ["ssw", "SSW", "SSW Bundestag OR Südschleswigscher"]
].map(([id, label, terms]) => googleNewsSource({
  id: `fraction-${id}`,
  name: label,
  type: "party",
  query: `(${terms}) (Bundestag OR Fraktion OR Antrag OR Gesetzentwurf OR Position OR fordert)`,
  priority: 72,
  maxItems: topicRadarDefaultMaxItems
}));

// Allgemeine Bundespolitik als Grundrauschen für jedes Mandat.
const generalPoliticsSources = [
  googleNewsSource({ id: "general-bundestag-plenum", name: "Bundestag Plenum", type: "bundestag", query: "Bundestag (Plenum OR Debatte OR Abstimmung OR Tagesordnung)", priority: 80, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "general-bundesregierung-vorhaben", name: "Bundesregierung Vorhaben", type: "ministry", query: "Bundesregierung (Gesetzentwurf OR Eckpunkte OR Kabinettsbeschluss OR Reform)", priority: 80, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "general-bundeskabinett", name: "Bundeskabinett", type: "ministry", query: "Bundeskabinett (Beschluss OR Gesetzentwurf OR Sitzung)", priority: 78, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "general-koalition", name: "Koalition Bundespolitik", type: "party", query: "Koalition (Streit OR Einigung OR Bundesregierung OR Kompromiss)", priority: 72, maxItems: topicRadarDefaultMaxItems }),
  googleNewsSource({ id: "general-hib", name: "hib Bundestag", type: "bundestag", query: "site:bundestag.de/presse/hib", priority: 78, maxItems: topicRadarDefaultMaxItems })
];

// Kuratierung: reduziert die Quellenliste auf einen fokussierten, performanten Satz
// (~130 statt ~560), damit der Crawl Google News nicht überlastet und im Zeitlimit bleibt.
// Abschaltbar via HELMUT_SOURCE_CURATION=off -> volle Liste.
const sourceCurationEnabled = process.env.HELMUT_SOURCE_CURATION !== "off";

function isGoogleNewsSource(source) {
  return String(source.rssUrl || "").includes("news.google.com");
}

function keepCuratedSource(source) {
  // Alle Direkt-Feeds (kein Google News) immer behalten – zuverlässig, keine Drosselung.
  if (!isGoogleNewsSource(source)) return true;
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
  ...coreSources,
  ...bundestagCommitteeSources,
  ...bundestagFractionSources,
  ...generalPoliticsSources,
  ...officialSearchSources,
  ...mediaSources,
  ...broadGermanMediaSources,
  ...regionalSources,
  ...publicBroadcastRegionalSources,
  ...specialistSources,
  ...policySpecialistSources,
  ...associationSources,
  ...politicalActorSources,
  ...topicRadarSources,
  ...governmentProcessSources,
  ...stateAndConstituencySources,
  ...additionalInstitutionSources,
  ...socialPolicySignalSources,
  ...deepTopicSources
])
  .filter((source) => !sourceCurationEnabled || keepCuratedSource(source))
  .slice(0, sourceTarget);

module.exports = { v1Sources };
