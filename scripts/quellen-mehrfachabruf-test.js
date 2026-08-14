"use strict";

// Helmut — Testsuite: der MEHRFACHANFRAGEN-Vertrag einer Quelle und die Wirkung der Abrufstufe.
// =============================================================================================
// ANLASS: in der Bewertung des Kapazitätsfehlers vom 2026-08-03 stand die Behauptung, die
// schlechtestmoegliche Dauer EINER Abrufstufe sei
//
//     ceil(stufenGroesse / HELMUT_GOOGLE_CONCURRENCY) * CRAWLER_TIMEOUT_MS
//
// und eine kleinere Stufe binde die Ueberziehung damit an „ungefaehr eine Google-Runde"
// (~7 s). Diese Formel setzt voraus, dass EINE Quelle GENAU EINE HTTP-Anfrage ist. Das ist am
// Code nicht der Fall — und diese Suite weist es nach, statt es zu behaupten.
//
// WAS `CRAWLER_TIMEOUT_MS` WIRKLICH BEGRENZT (lib/helmut/crawler.js):
//   Es wird ausschliesslich als `timeout` an `client.get(...)` (`fetchUrl`, `fetchText`,
//   `fetchPardokText`) und `client.request(...)` (`postForm`) durchgereicht. Das ist ein
//   Node-Socket-Timeout je EINZELNER Anfrage (und dort ein INAKTIVITAETS-, kein
//   Gesamtdauer-Limit). Es begrenzt weder `crawlSource` noch eine Quelle noch eine Stufe.
//
// DIE ANFRAGENKETTE EINER GOOGLE-NEWS-QUELLE, am Code abgelesen:
//   1  je Feed-URL: ein Feed-Abruf (`parseRssFeed` -> `fetchText` -> `fetchUrl`)
//      — `personNewsSource` hat ZWEI Feed-URLs (Primaerfeed + Archivfeed `when:3m`),
//        und sie werden SEQUENZIELL abgearbeitet;
//      — unter dem Gate zusaetzlich `withGoogleRetry`: bis zu `retryMax` (2) Wiederholungen
//        mit Backoff-Schlafzeiten bis `retryCapMs` (8 s) bzw. `retryAfterCapMs` (15 s).
//   2  `resolveEntryUrls` je Eintrag, Nebenlaeufigkeit 4 INNERHALB der Quelle:
//      `resolveArticleUrl` = 1x `fetchUrl` (folgt bis zu 6 Weiterleitungen, jede eine eigene
//      Anfrage mit eigenem Timeout) + bis zu 2x `postForm` (batchexecute).
//   3  fuer `type: "person"`-Quellen danach `enrichPersonArticleImages` — eine VOLLSTAENDIG
//      SEQUENZIELLE Schleife ueber alle Eintraege, je Eintrag nochmals `resolveArticleUrl`
//      und ein `fetchText` fuer das Bild.
//   Mengengeruest: `HELMUT_GOOGLE_NEWS_MAX_ITEMS` 12, `HELMUT_PROFILE_NEWS_MAX_ITEMS` 24,
//   `HELMUT_PERSON_NEWS_MAX_ITEMS` 30 — je Feed.
//
// Die Suite treibt den ECHTEN `crawlAllSources`/`crawlSource` und das ECHTE Gate
// (`createGoogleNewsGate`) gegen eine ersetzte HTTP-Schicht (`https.get`/`https.request`).
// KEIN Netz. Jede simulierte Anfrage kostet eine feste, kleine Zeit `ANFRAGE_MS`; gemessen
// wird, wie viele ANFRAGE_MS eine Quelle bzw. eine Stufe dauert. Damit ist die Aussage
// masstabsfrei: was hier „N x ANFRAGE_MS" heisst, ist in Production „N x bis zu
// CRAWLER_TIMEOUT_MS".
//
// Aufbau:
//   1  Was CRAWLER_TIMEOUT_MS im Quelltext begrenzt
//   2  Eine Google-Quelle ueberschreitet die Dauer einer einzelnen Anfrage deutlich
//   3  Eine Personenquelle ist der schlechteste Fall (sequenzielle Anreicherung)
//   4  Stufengroesse: bremst eine kleinere Stufe die direkten/amtlichen Quellen aus?

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { EventEmitter } = require("events");

const ROOT = path.join(__dirname, "..");

process.env.HELMUT_GOOGLE_HARDENING = "on";

const crawler = require(path.join(ROOT, "lib", "helmut", "crawler.js"));
const GN = require(path.join(ROOT, "lib", "helmut", "google-news-hardening.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

// Kosten EINER simulierten HTTP-Anfrage. Steht stellvertretend fuer `CRAWLER_TIMEOUT_MS`
// (Production 7 000 ms): die Suite misst VIELFACHE davon, keine Absolutzeiten.
const ANFRAGE_MS = 12;

// ── HTTP-Ersatz ──────────────────────────────────────────────────────────────────────────────
// Ersetzt `https.get`/`https.request` (und die http-Varianten) durch eine lokale Antwort.
// Es entsteht KEINE Verbindung; der Netz-Guard der Offline-Suite bleibt unberuehrt.
const ECHT = { httpsGet: https.get, httpsRequest: https.request, httpGet: http.get, httpRequest: http.request };
let anfragen = [];

function urlAus(arg, options) {
  if (typeof arg === "string") return arg;
  if (arg instanceof URL) return arg.toString();
  const o = arg && typeof arg === "object" ? arg : options || {};
  const host = o.hostname || o.host || "localhost";
  return `https://${host}${o.path || "/"}`;
}

// Ein Google-News-Eintragslink, dessen Kennung sich NICHT lokal dekodieren laesst — genau der
// Fall, der `resolveArticleUrl` in den Netzweg zwingt (Token >= 20 Zeichen, dekodiert aber zu
// keiner URL).
function eintragsLink(i) {
  return `https://news.google.com/rss/articles/${"A".repeat(24)}${String(i).padStart(4, "0")}`;
}

function rssFeed(anzahl) {
  const items = Array.from({ length: anzahl }, (_, i) =>
    `<item><title>Meldung ${i}</title><link>${eintragsLink(i)}</link>`
    + `<pubDate>Sun, 03 Aug 2026 06:00:00 GMT</pubDate><description>Text ${i}</description></item>`).join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
}

// Artikelseite von news.google.com MIT den Dekodier-Parametern: dadurch versucht
// `decodeGoogleNewsPageUrl` den batchexecute-Weg (bis zu zwei POSTs).
const ARTIKEL_HTML = '<html><body><div data-n-a-id="AAAAAAAAAAAAAAAAAAAAAAAA" '
  + 'data-n-a-ts="1785773000" data-n-a-sg="signatur">x</div></body></html>';

function antwortFuer(url, method) {
  if (method === "POST") return ")]}'\n\n[[\"wrb.fr\",\"Fbv4je\",\"[]\"]]"; // liefert KEINE brauchbare URL
  if (/news\.google\.com\/rss\/search/.test(url)) return rssFeed(FEED_ITEMS);
  if (/news\.google\.com\/rss\/articles/.test(url)) return ARTIKEL_HTML;
  return "<html><head><title>Direkt</title></head><body>ok</body></html>";
}

let FEED_ITEMS = 12;

function macheAntwort(body) {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.setEncoding = () => {};
  res.resume = () => {};
  res.destroy = () => {};
  process.nextTick(() => { res.emit("data", body); res.emit("end"); });
  return res;
}

function stubbe(arg, options, cb) {
  if (typeof options === "function") { cb = options; options = {}; }
  const url = urlAus(arg, options);
  const method = String((arg && arg.method) || (options && options.method) || "GET").toUpperCase();
  anfragen.push({ url, method });
  const req = new EventEmitter();
  req.write = () => {};
  req.end = () => {};
  req.destroy = () => {};
  req.setTimeout = () => {};
  // Die simulierte Antwortzeit ist ECHTE Wartezeit — dadurch bilden Nebenlaeufigkeit
  // (Gate-Semaphor, `mapWithConcurrency`) und Sequenz sich korrekt in der Messung ab.
  setTimeout(() => { if (cb) cb(macheAntwort(antwortFuer(url, method))); }, ANFRAGE_MS);
  return req;
}

function installiereHttpErsatz() {
  anfragen = [];
  https.get = stubbe; https.request = stubbe;
  http.get = stubbe; http.request = stubbe;
}
function entferneHttpErsatz() {
  https.get = ECHT.httpsGet; https.request = ECHT.httpsRequest;
  http.get = ECHT.httpGet; http.request = ECHT.httpRequest;
}

// ── Quellen ──────────────────────────────────────────────────────────────────────────────────
function googleSuchQuelle(id, extras = {}) {
  const q = encodeURIComponent(`"Thema ${id}"`);
  return {
    id, name: `Suche ${id}`, type: "media", category: "medien", active: true, crawlMethod: "rss",
    url: `https://news.google.com/search?q=${q}`,
    rssUrl: `https://news.google.com/rss/search?q=${q}&hl=de&gl=DE&ceid=DE:de`,
    rssUrls: [`https://news.google.com/rss/search?q=${q}&hl=de&gl=DE&ceid=DE:de`],
    priority: 90, maxItems: 12, ...extras
  };
}

// Wie `scheduler.personNewsSource`: ZWEI Feeds und `type: "person"` (sequenzielle Anreicherung).
function personenQuelle(id) {
  const q = encodeURIComponent(`"Person ${id}"`);
  const qa = encodeURIComponent(`"Person ${id}" when:3m`);
  return {
    id, name: `Personensuche ${id}`, type: "person", category: "profil", active: true,
    crawlMethod: "rss",
    url: `https://news.google.com/search?q=${q}`,
    rssUrl: `https://news.google.com/rss/search?q=${q}&hl=de&gl=DE&ceid=DE:de`,
    rssUrls: [
      `https://news.google.com/rss/search?q=${q}&hl=de&gl=DE&ceid=DE:de`,
      `https://news.google.com/rss/search?q=${qa}&hl=de&gl=DE&ceid=DE:de`
    ],
    priority: 100, maxItems: 12, queryTerms: [`Person ${id}`, "Meldung"]
  };
}

function direkteQuelle(id) {
  return {
    id, name: `Direktquelle ${id}`, type: "media", category: "amtlich", active: true,
    crawlMethod: "rss",
    url: `https://amt${id}.example.org/`,
    rssUrl: `https://amt${id}.example.org/feed.xml`,
    rssUrls: [`https://amt${id}.example.org/feed.xml`],
    priority: 80, maxItems: 12
  };
}

// Gate mit der ECHTEN Nebenlaeufigkeit (5). Der Mindestabstand ist fuer die Laufzeit dieser
// Suite herunterskaliert und ausdruecklich benannt — er veraendert die BARRIERE-Wirkung nicht,
// die hier gemessen wird, sondern nur die absolute Dauer.
const GATE_CONFIG = { ...GN.googleHardeningConfig(), concurrency: 5, minSpacingMs: 1, retryMax: 0, retryBudget: 0 };

// Ein vollstaendiger Stufenabruf wie in `runGlobaleErfassung`: `plan.quellen` wird UNABHAENGIG
// vom Quellentyp in Stufen geschnitten, jede Stufe ist ein eigener `crawlAllSources`-Aufruf und
// damit eine Barriere. Gemessen wird die ECHTE Start-/Endzeit JE QUELLE (`results[].startedAt`
// /`finishedAt`), nicht das Ende der Stufe — sonst misst man die Stufe statt der Quelle.
async function stufenlauf(quellen, stufenGroesse) {
  const gate = GN.createGoogleNewsGate(GATE_CONFIG, {});
  const start = Date.now();
  const startBei = new Map();
  const fertigBei = new Map();
  for (let i = 0; i < quellen.length; i += stufenGroesse) {
    const stufe = await crawler.crawlAllSources(quellen.slice(i, i + stufenGroesse), {
      googleGate: gate, cooldown: null, hardeningConfig: GATE_CONFIG, sharedLedger: null
    });
    for (const r of stufe.results) {
      startBei.set(r.sourceId, Date.parse(r.startedAt) - start);
      fertigBei.set(r.sourceId, Date.parse(r.finishedAt) - start);
    }
  }
  return { dauerMs: Date.now() - start, startBei, fertigBei };
}

// Die 181 GEMESSENEN Quellendauern des gescheiterten Production-Laufs, in Laufreihenfolge
// (`source_crawl_telemetry`, `run_id = cron-pipeline-20260803160002-xm71n-global`).
// Rohdaten, keine Annahme. Positionen der fuenf DIREKTEN Quellen (die einzigen ohne
// news.google.-Weg, am Katalog gegengeprueft): 0, 1, 20, 99, 120.
const PROD_DAUERN = [
  67, 102, 2592, 2441, 2099, 1958, 2130, 1662, 1628, 833, 698, 668, 704, 729, 902, 701, 790, 576,
  650, 619, 155, 602, 708, 631, 739, 634, 619, 644, 702, 745, 654, 637, 824, 619, 458, 985, 991,
  926, 1038, 969, 994, 1232, 929, 747, 757, 812, 1154, 1421, 1357, 885, 1380, 1372, 1174, 1312,
  801, 1105, 1851, 1254, 1305, 1287, 1212, 1235, 1376, 1427, 1236, 1505, 1441, 1144, 1612, 1109,
  1332, 1578, 1176, 1221, 1310, 1264, 1477, 1307, 1468, 1179, 989, 742, 1230, 1220, 1024, 632,
  801, 1200, 1182, 770, 738, 942, 1183, 1247, 1195, 1267, 1551, 1439, 1370, 1227, 26, 1148, 1195,
  769, 837, 1029, 927, 816, 778, 829, 676, 1089, 884, 1208, 1084, 1135, 1127, 945, 1023, 1060, 55,
  1223, 990, 1001, 984, 898, 1342, 904, 968, 1042, 1104, 827, 1117, 1137, 986, 1193, 958, 1190,
  1105, 1207, 1374, 1216, 1000, 818, 822, 578, 5054, 2111, 2090, 191, 2003, 1991, 1898, 586, 1952,
  1699, 206, 1173, 1666, 1550, 0, 1725, 1978, 226, 1966, 8625, 1918, 3174, 1624, 1668, 173, 41340,
  8397, 1648, 41892, 1493, 35005, 174, 7001, 40851, 13115
];
const PROD_DIREKT = [0, 1, 20, 99, 120];

// Untergrenze der Startzeit der Quelle an Position `idx` bei Stufengroesse `g`: sie kann nicht
// beginnen, bevor alle vorangehenden Stufen fertig sind, und eine Stufe ist nie kuerzer als
// ihre langsamste Quelle.
function startUntergrenze(dauern, g, idx) {
  let t = 0;
  for (let k = 0; k < Math.floor(idx / g); k += 1) t += Math.max(...dauern.slice(k * g, (k + 1) * g));
  return t;
}
function abrufUntergrenze(dauern, g) {
  let t = 0;
  for (let k = 0; k * g < dauern.length; k += 1) t += Math.max(...dauern.slice(k * g, (k + 1) * g));
  return t;
}

(async () => {
  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("1 · Was CRAWLER_TIMEOUT_MS im Quelltext begrenzt");
  {
    const src = fs.readFileSync(path.join(ROOT, "lib", "helmut", "crawler.js"), "utf8");
    const stellen = (src.match(/timeout: fetchTimeoutMs/g) || []).length;
    check("1.1 `CRAWLER_TIMEOUT_MS` wird ausschliesslich als `timeout` EINZELNER Anfragen benutzt",
      stellen >= 3 && !/fetchTimeoutMs[\s\S]{0,40}(Date\.now|deadline|budget)/i.test(src),
      `${stellen} Verwendungen, alle als Socket-Timeout`);
    // Seit dem Korrekturlauf 2026-08-14/3 heisst die Rohfassung `fetchUrlRoh`; `fetchUrl` ist
    // die Anbieter-Umschliessung darum. Am Zeitverhalten aendert das NICHTS: jede Weiterleitung
    // bleibt eine eigene Anfrage mit eigenem Timeout. Neu ist nur, dass die GANZE Kette
    // innerhalb EINER Anbieterreservierung laeuft (sonst kostete eine 6er-Kette 6 Kontingente).
    check("1.2 `fetchUrl` folgt Weiterleitungen rekursiv — jede Weiterleitung ist eine EIGENE"
      + " Anfrage mit EIGENEM Timeout (bis zu 6 Hops)",
      /redirectDepth > 6/.test(src) && /fetchUrlRoh\(nextUrl, redirectDepth \+ 1, deps\)/.test(src));
    check("1.2b Die gesamte Weiterleitungskette laeuft in EINER Anbieterreservierung",
      /if \(redirectDepth > 0\) return fetchUrlRoh\(url, redirectDepth, deps\);/.test(src));
    check("1.3 `resolveArticleUrl` kann je Eintrag 1x `fetchUrl` + bis zu 2x `postForm` ausloesen",
      /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/.test(src) && /await postForm\(/.test(src));
    check("1.4 `enrichPersonArticleImages` ist eine SEQUENZIELLE Schleife mit Netzarbeit je Eintrag",
      /for \(const item of items\) \{[\s\S]{0,900}?await resolveArticleUrl\([\s\S]{0,900}?await fetchText\(/.test(src));
    check("1.5 es gibt in `crawlSource` KEINE Restzeit-/Deadlinepruefung",
      !/async function crawlSource[\s\S]{0,4000}?(deadline|verbleibendMs|restMs)/.test(src));
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("2 · Eine Google-Suchquelle dauert ein Vielfaches EINER Anfrage");
  let faktorSuche = 0;
  {
    installiereHttpErsatz();
    FEED_ITEMS = 12;
    const gate = GN.createGoogleNewsGate(GATE_CONFIG, {});
    const t0 = Date.now();
    const bilanz = await crawler.crawlAllSources([googleSuchQuelle("suche-1")], {
      googleGate: gate, cooldown: null, hardeningConfig: GATE_CONFIG, sharedLedger: null
    });
    const dauerMs = Date.now() - t0;
    entferneHttpErsatz();
    faktorSuche = dauerMs / ANFRAGE_MS;
    const posts = anfragen.filter((a) => a.method === "POST").length;
    console.log(`  [Messung] EINE Google-Suchquelle mit ${FEED_ITEMS} Eintraegen:`
      + ` ${anfragen.length} HTTP-Anfragen (davon ${posts} POST/batchexecute),`
      + ` Dauer ${dauerMs} ms = ${faktorSuche.toFixed(1)} x ANFRAGE_MS`);
    check("2.1 die Quelle loest deutlich MEHR als eine HTTP-Anfrage aus",
      anfragen.length >= 3 * FEED_ITEMS, `${anfragen.length} Anfragen`);
    check("2.2 die Quelle dauert laenger als EINE Anfrage — die 7-s-Grenze traegt nicht",
      faktorSuche > 2, `${faktorSuche.toFixed(1)} x ANFRAGE_MS`);
    check("2.3 der Feedabruf hat Eintraege geliefert (der Test misst echte Arbeit)",
      bilanz.checkedSources === 1 && bilanz.newCandidateItems > 0,
      `items=${bilanz.newCandidateItems}`);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("3 · Eine Personenquelle ist der schlechteste Fall");
  let faktorPerson = 0;
  {
    installiereHttpErsatz();
    FEED_ITEMS = 12;
    const gate = GN.createGoogleNewsGate(GATE_CONFIG, {});
    const t0 = Date.now();
    await crawler.crawlAllSources([personenQuelle("person-1")], {
      googleGate: gate, cooldown: null, hardeningConfig: GATE_CONFIG, sharedLedger: null
    });
    const dauerMs = Date.now() - t0;
    entferneHttpErsatz();
    faktorPerson = dauerMs / ANFRAGE_MS;
    console.log(`  [Messung] EINE Personenquelle (2 Feeds, ${FEED_ITEMS} Eintraege je Feed):`
      + ` ${anfragen.length} HTTP-Anfragen, Dauer ${dauerMs} ms = ${faktorPerson.toFixed(1)} x ANFRAGE_MS`);
    check("3.1 die Personenquelle ist teurer als die reine Suchquelle",
      faktorPerson > faktorSuche, `${faktorPerson.toFixed(1)} vs ${faktorSuche.toFixed(1)}`);
    check("3.2 sie dauert ein VIELFACHES einer einzelnen Anfrage (>= 10 x)",
      faktorPerson >= 10, `${faktorPerson.toFixed(1)} x ANFRAGE_MS`);
    check("3.3 auf Production uebertragen: eine Quelle kann das Anfrage-Zeitlimit"
      + " um ein Vielfaches ueberschreiten — belegt auch in der Production-Telemetrie"
      + " (41 892 / 41 340 / 40 851 / 35 005 ms bei CRAWLER_TIMEOUT_MS = 7 000 ms, retry_count 0)",
      41892 > 5 * 7000);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("4 · Stufengroesse: bremst eine kleinere Stufe die direkten Quellen aus?");
  {
    // 4a — RECHNUNG AUF DEN GEMESSENEN PRODUCTION-DAUERN. Keine Simulation, keine Annahme:
    // eine Quelle kann nicht beginnen, bevor alle vorangehenden Stufen fertig sind, und eine
    // Stufe ist nie kuerzer als ihre langsamste Quelle.
    console.log("  [Rechnung auf den 181 gemessenen Production-Dauern]");
    for (const g of [20, 10, 5]) {
      const starts = PROD_DIREKT.map((i) => (startUntergrenze(PROD_DAUERN, g, i) / 1000).toFixed(2));
      console.log(`    Stufe ${String(g).padStart(2)}: ${Math.ceil(PROD_DAUERN.length / g)} Stufen ·`
        + ` Abruf-Untergrenze ${(abrufUntergrenze(PROD_DAUERN, g) / 1000).toFixed(1)} s ·`
        + ` Startuntergrenze der direkten Quellen [${starts.join(", ")}] s`);
    }
    const spaeteste = (g) => Math.max(...PROD_DIREKT.map((i) => startUntergrenze(PROD_DAUERN, g, i)));
    check("4.1 die Untergrenze des GESAMTEN Abrufs steigt, wenn die Stufe kleiner wird",
      abrufUntergrenze(PROD_DAUERN, 5) > abrufUntergrenze(PROD_DAUERN, 10)
      && abrufUntergrenze(PROD_DAUERN, 10) > abrufUntergrenze(PROD_DAUERN, 20),
      `20 -> ${(abrufUntergrenze(PROD_DAUERN, 20) / 1000).toFixed(1)} s,`
      + ` 5 -> ${(abrufUntergrenze(PROD_DAUERN, 5) / 1000).toFixed(1)} s`);
    check("4.2 die DIREKTEN/amtlichen Quellen starten bei Stufe 5 nachweislich SPAETER",
      spaeteste(5) > spaeteste(10) && spaeteste(10) > spaeteste(20),
      `spaeteste direkte Quelle: Stufe 20 ${(spaeteste(20) / 1000).toFixed(2)} s,`
      + ` Stufe 10 ${(spaeteste(10) / 1000).toFixed(2)} s, Stufe 5 ${(spaeteste(5) / 1000).toFixed(2)} s`);
    check("4.3 die Verzoegerung der direkten Quellen ist erheblich (Faktor >= 2)",
      spaeteste(5) >= 2 * spaeteste(20),
      `${(spaeteste(5) / 1000).toFixed(2)} s gegen ${(spaeteste(20) / 1000).toFixed(2)} s`);

    // 4b — DIESELBE FRAGE AM LAUFENDEN CODE. `crawlAllSources` und das echte Gate werden in
    // Stufen von 20 bzw. 5 getrieben; die Quellenkosten sind aus den gemessenen
    // Production-Dauern abgeleitet (Eintragszahl proportional zur echten Dauer), damit die
    // Kostenspreizung des echten Laufs erhalten bleibt — bei GLEICH teuren Quellen kann eine
    // Barriere naturgemaess nichts kosten.
    const items = PROD_DAUERN.map((d) => Math.max(1, Math.min(28, Math.round(d / 1500))));
    const direktSet = new Set(PROD_DIREKT);
    const quellen = PROD_DAUERN.map((_, i) => (direktSet.has(i)
      ? direkteQuelle(`direkt-${i}`)
      : googleSuchQuelle(`google-${i}`, { maxItems: items[i] })));
    const direkteIds = PROD_DIREKT.map((i) => `direkt-${i}`);

    // Der Feed liefert immer 40 Eintraege; wie viele davon gelesen werden, entscheidet
    // `maxItems` je Quelle (`sourceMaxItems` -> `parseRssItems`) — also der echte Produktionsweg.
    FEED_ITEMS = 40;
    installiereHttpErsatz();
    const lauf20 = await stufenlauf(quellen, 20);
    const anfragen20 = anfragen.length;
    const lauf5 = await stufenlauf(quellen, 5);
    const anfragen5 = anfragen.length - anfragen20;
    entferneHttpErsatz();

    const letzteDirekte20 = Math.max(...direkteIds.map((id) => lauf20.fertigBei.get(id) || 0));
    const letzteDirekte5 = Math.max(...direkteIds.map((id) => lauf5.fertigBei.get(id) || 0));
    console.log(`  [Messung am laufenden Code] Stufe 20: Gesamtlauf ${lauf20.dauerMs} ms,`
      + ` letzte direkte Quelle fertig nach ${letzteDirekte20} ms, ${anfragen20} Anfragen`);
    console.log(`  [Messung am laufenden Code] Stufe  5: Gesamtlauf ${lauf5.dauerMs} ms,`
      + ` letzte direkte Quelle fertig nach ${letzteDirekte5} ms, ${anfragen5} Anfragen`);

    check("4.4 beide Stufengroessen rufen dieselbe Menge ab — der Vergleich ist fair",
      anfragen20 === anfragen5, `${anfragen20} vs ${anfragen5}`);
    check("4.5 alle 181 Quellen werden in beiden Faellen abgerufen",
      lauf20.fertigBei.size === 181 && lauf5.fertigBei.size === 181,
      `${lauf20.fertigBei.size} / ${lauf5.fertigBei.size}`);
    check("4.6 am laufenden Code: die kleinere Stufe macht den Gesamtabruf NICHT schneller",
      lauf5.dauerMs >= lauf20.dauerMs,
      `Stufe 5: ${lauf5.dauerMs} ms, Stufe 20: ${lauf20.dauerMs} ms`);
    check("4.7 am laufenden Code: die direkten/amtlichen Quellen sind bei Stufe 5 spaeter fertig",
      letzteDirekte5 > letzteDirekte20, `${letzteDirekte5} ms gegen ${letzteDirekte20} ms`);
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  if (!fail) {
    console.log("Eine Quelle ist NICHT eine Anfrage: CRAWLER_TIMEOUT_MS begrenzt weder eine Quelle");
    console.log("noch eine Stufe. Eine kleinere Abrufstufe verzoegert zusaetzlich die direkten Quellen.");
  }
  entferneHttpErsatz();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  entferneHttpErsatz();
  console.error("TESTFEHLER:", e && e.stack);
  process.exit(1);
});
