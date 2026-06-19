const v1Sources = [
  {
    id: "cem-ince-news",
    name: "Cem Ince News-Suche",
    type: "person",
    url: "https://news.google.com/search?q=%22Cem%20Ince%22",
    rssUrl: "https://news.google.com/rss/search?q=%22Cem%20Ince%22&hl=de&gl=DE&ceid=DE:de",
    rssUrls: [
      "https://news.google.com/rss/search?q=%22Cem%20Ince%22&hl=de&gl=DE&ceid=DE:de"
    ],
    crawlMethod: "rss",
    priority: 100,
    active: true,
    lastCrawledAt: null
  },
  {
    id: "bmas",
    name: "BMAS",
    type: "ministry",
    url: "https://www.bmas.de",
    rssUrl: "https://www.bmas.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/RSSNewsfeed.xml",
    crawlMethod: "rss",
    priority: 95,
    active: true,
    lastCrawledAt: null
  },
  {
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
    priority: 95,
    active: true,
    lastCrawledAt: null
  },
  {
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
    priority: 100,
    active: true,
    lastCrawledAt: null
  },
  {
    id: "ausschuss-arbeit-soziales",
    name: "Ausschuss Arbeit und Soziales",
    type: "committee",
    url: "https://www.bundestag.de/ausschuesse/a11_arbeit_soziales",
    rssUrl: "",
    crawlMethod: "html",
    priority: 95,
    active: true,
    lastCrawledAt: null
  },
  {
    id: "die-linke",
    name: "Die Linke",
    type: "party",
    url: "https://www.die-linke.de",
    rssUrl: "https://www.die-linke.de/start/presse/rss.xml",
    rssUrls: [
      "https://www.die-linke.de/start/presse/rss.xml"
    ],
    crawlMethod: "rss",
    priority: 90,
    active: true,
    lastCrawledAt: null
  },
  {
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
    priority: 90,
    active: true,
    lastCrawledAt: null
  },
  {
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
    priority: 70,
    active: true,
    lastCrawledAt: null
  },
  {
    id: "deutschlandfunk-politik",
    name: "Deutschlandfunk Politik",
    type: "media",
    url: "https://www.deutschlandfunk.de/politik-100.html",
    rssUrl: "https://www.deutschlandfunk.de/nachrichten-100.rss",
    rssUrls: [
      "https://www.deutschlandfunk.de/nachrichten-100.rss"
    ],
    crawlMethod: "rss",
    priority: 70,
    active: true,
    lastCrawledAt: null
  },
  {
    id: "dgb",
    name: "DGB",
    type: "association",
    url: "https://www.dgb.de",
    rssUrl: "",
    rssUrls: [],
    crawlMethod: "html",
    priority: 75,
    active: true,
    lastCrawledAt: null
  }
];

module.exports = { v1Sources };
