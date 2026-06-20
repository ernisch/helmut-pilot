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

function directSource(source) {
  return {
    rssUrls: source.rssUrl ? [source.rssUrl] : [],
    maxItems: source.crawlMethod === "html" ? 1 : 8,
    lastCrawledAt: null,
    ...source,
    active: source.active ?? true
  };
}

function googleNewsSource({ id, name, type = "media", query, priority = 65, url = "", maxItems = 6 }) {
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

const coreSources = [
  directSource({
    id: "cem-ince-news",
    name: "Cem Ince News-Suche",
    type: "person",
    url: "https://news.google.com/search?q=%22Cem%20Ince%22",
    rssUrl: "https://news.google.com/rss/search?q=%22Cem%20Ince%22&hl=de&gl=DE&ceid=DE:de",
    crawlMethod: "rss",
    priority: 100,
    maxItems: 12
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
  googleNewsSource({ id: "radar-bmas-vorhaben", name: "BMAS Vorhaben Radar", query: "\"Bundesministerium für Arbeit und Soziales\" (Gesetzentwurf OR Eckpunkte OR Reform OR Verordnung)", priority: 88, maxItems: 8 }),
  googleNewsSource({ id: "radar-buergergeld", name: "Bürgergeld Radar", query: "Bürgergeld (Bundesregierung OR BMAS OR Gesetzentwurf OR Reform OR Sanktionen)", priority: 82 }),
  googleNewsSource({ id: "radar-mindestlohn", name: "Mindestlohn Radar", query: "Mindestlohn (Bundesregierung OR BMAS OR Kommission OR Tarif OR Kontrolle)", priority: 82 }),
  googleNewsSource({ id: "radar-rente", name: "Renten Radar", query: "Rente Rentenpaket Rentenreform Bundesregierung", priority: 82 }),
  googleNewsSource({ id: "radar-pflege", name: "Pflege Radar", query: "Pflege Pflegereform Pflegeversicherung Bundesregierung", priority: 82 }),
  googleNewsSource({ id: "radar-tariftreue", name: "Tariftreue Radar", query: "Tariftreue Tarifbindung Bundestariftreuegesetz Bundesregierung", priority: 82 }),
  googleNewsSource({ id: "radar-arbeitszeit", name: "Arbeitszeit Radar", query: "Arbeitszeitgesetz Arbeitszeit Reform BMAS Arbeitgeber Gewerkschaften", priority: 80 }),
  googleNewsSource({ id: "radar-arbeitsmarkt", name: "Arbeitsmarkt Radar", query: "Arbeitsmarkt Beschäftigung Arbeitslosigkeit Bundesagentur Bundesregierung", priority: 78 }),
  googleNewsSource({ id: "radar-armut", name: "Armuts Radar", query: "Armut Sozialstaat Bürgergeld Sozialverband Bundesregierung", priority: 78 }),
  googleNewsSource({ id: "radar-ausschuss-arbeit-soziales", name: "Ausschuss Arbeit und Soziales Radar", query: "\"Ausschuss für Arbeit und Soziales\" Bundestag Anhörung Tagesordnung", priority: 86 })
];

const v1Sources = [
  ...coreSources,
  ...officialSearchSources,
  ...mediaSources,
  ...regionalSources,
  ...specialistSources,
  ...associationSources,
  ...politicalActorSources,
  ...topicRadarSources
];

module.exports = { v1Sources };
