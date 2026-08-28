#!/usr/bin/env node
"use strict";

// Helmut — ANBIETERSTEUERUNG IM FACHPFAD (Korrekturlauf 2026-08-14/3, Luecke 4).
// =============================================================================================
// DER BEFUND: die verteilte Anbietersteuerung existierte vollstaendig — aber sie hing an
// KEINEM echten Aufruf. Sie war ein Modul mit Tests, kein Schutz. Ein Motor mit 500 Mandaten
// haette die Anbietergrenzen ungebremst gerissen.
//
// DIE KORREKTUR: die Steuerung umschliesst JEDEN ausgehenden Aufruf — und zwar an genau den
// Stellen, an denen wirklich ins Netz gegangen wird:
//   * `crawler.fetchUrl`        — RSS, Webseiten, Google News, Google Suche
//                                  (fetchText und fetchHtmlPage rufen ausschliesslich fetchUrl),
//   * `crawler.fetchPardokText` — amtlicher PARDOK-Export (weiterer Anbieter),
//   * `crawler.postForm`        — Google-News-Aufloesung (batchexecute),
//   * `ai.requestOpenAI`        — jeder Modellaufruf (OpenAI und Azure gehen beide hier durch).
// Abschnitt 1 prueft, dass es GENAU DIESE Netzstellen gibt und keine weitere — eine vierte
// Netzstelle im Crawler laesst den Test fallen.
//
// OFFLINE: kein Netz. Die Netzgrenze (`fetchUrlRoh`) und die Datenbankgrenze werden ersetzt.

const fs = require("fs");
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
const steuerung = require(path.join(ROOT, "lib", "helmut", "anbieter-steuerung"));
const storage = require(path.join(ROOT, "lib", "helmut", "storage"));
const providerUrl = require(path.join(ROOT, "lib", "helmut", "provider-url"));
const SP = require(path.join(ROOT, "lib", "helmut", "scalable-pipeline"));
const hardeningModul = require(path.join(ROOT, "lib", "helmut", "google-news-hardening"));
const { erzeugeSpeicherWarteschlange } = require(path.join(ROOT, "scripts", "fixtures", "jobqueue-speicher-treiber"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }
function ohneKommentare(text) {
  return text.split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");
}

// Laedt ein Modul FRISCH mit ersetzten Teilen — so laesst sich `fetchUrlRoh` austauschen,
// ohne die echte Datei zu veraendern.
function ladeMitErsatz(relativ, ersetze) {
  const datei = path.join(ROOT, relativ);
  let quelle = fs.readFileSync(datei, "utf8");
  for (const [suchen, ersatz] of ersetze) {
    if (!quelle.includes(suchen)) throw new Error(`Ersatzstelle nicht gefunden: ${suchen.slice(0, 60)}`);
    quelle = quelle.split(suchen).join(ersatz);
  }
  const m = new Module(datei, null);
  m.filename = datei;
  m.paths = Module._nodeModulePaths(path.dirname(datei));
  m._compile(quelle, datei);
  return m.exports;
}

const ENV_AN = {
  HELMUT_SCALABLE_PIPELINE: "on",
  HELMUT_ANBIETER_STEUERUNG: "on",
  // Fuer Google ist Aufnahmebetrieb nur mit zwei positiven, expliziten
  // Grenzen zulaessig. Testwerte sind Sicherheitsdeckel, keine Anbieterzusage.
  HELMUT_ANBIETER_GOOGLE_MINUTE: "30",
  HELMUT_ANBIETER_GOOGLE_TAG: "3000"
};

async function main() {
  console.log("Helmut — Anbietersteuerung im Fachpfad (offline)\n");

  // ── 1 · ES GIBT NUR ZWEI ENGSTELLEN, UND SIE SIND VERDRAHTET ─────────────────────────────
  abschnitt("1 · Die Steuerung haengt an den echten Aufrufen");
  const crawlerQuelle = ohneKommentare(fs.readFileSync(path.join(ROOT, "lib", "helmut", "crawler.js"), "utf8"));
  const aiQuelle = ohneKommentare(fs.readFileSync(path.join(ROOT, "lib", "helmut", "ai.js"), "utf8"));

  check("1.1 crawler.fetchUrl reserviert vor dem Abruf",
    /async function fetchUrl\(/.test(crawlerQuelle) && /anbieterSteuerung\.reserviere\(/.test(crawlerQuelle));
  check("1.2 ai.requestOpenAI reserviert vor dem Modellaufruf",
    /anbieterSteuerung\.reserviere\(/.test(aiQuelle));
  // VOLLSTAENDIGKEIT: der Crawler hat genau drei Netzstellen, und JEDE davon liegt in einer
  // Rohfassung, die nur ueber die Umschliessung erreichbar ist. Kaeme eine vierte hinzu,
  // faellt dieser Test — genau das soll er.
  const netzStellen = (crawlerQuelle.match(/client\.(request|get)\(/g) || []).length;
  check("1.3 Im Crawler gibt es GENAU DREI Netzstellen", netzStellen === 3, String(netzStellen));
  for (const roh of ["fetchUrlRoh", "fetchPardokTextRoh", "postFormRoh"]) {
    check(`1.3b ${roh} ist umschlossen (anbieterUmschlossen)`,
      new RegExp(`anbieterUmschlossen\\([\\s\\S]{0,200}?${roh}\\(`).test(crawlerQuelle));
  }
  check("1.3c Die Umschliessung steht GENAU EINMAL (keine zweite Implementierung)",
    (crawlerQuelle.match(/async function anbieterUmschlossen/g) || []).length === 1);
  check("1.3d Jede Netzstelle verdrahtet das Abbruchsignal wirklich",
    (crawlerQuelle.match(/verdrahteAbbruch\(request, deps\.abbruchSignal/g) || []).length === 3,
    String((crawlerQuelle.match(/verdrahteAbbruch\(request, deps\.abbruchSignal/g) || []).length));
  check("1.4 fetchText geht ueber fetchUrl (keine zweite Abrufimplementierung)",
    /async function fetchText\(url, deps = \{\}\)\s*\{\s*\n\s*const result = await fetchUrl\(url, 0, deps\);/.test(crawlerQuelle));
  check("1.4b fetchHtmlPage geht ueber fetchText",
    /async function fetchHtmlPage\(url, deps = \{\}\)\s*\{\s*\n\s*const html = await fetchText\(url, deps\);/.test(crawlerQuelle));
  // KEIN DOPPELZAEHLEN: das Tagesbudget bleibt allein bei reserveLlmBudgetOrThrow. Die
  // Anbietergrenze kennt fuer KI-Anbieter KEINE eigene Tagesgrenze — sonst zaehlte derselbe
  // Aufruf zweimal gegen zwei Toepfe.
  const kiBereich = (aiQuelle.match(/anbieterSteuerung\.reserviere\(\{[^}]*\}/) || [""])[0];
  check("1.5 Kein doppelter KI-Aufruf gezaehlt (Anbietergrenze setzt fuer KI keine Tagesgrenze)",
    !/grenzeTag/.test(kiBereich), kiBereich.slice(0, 100));
  check("1.6 Das Tagesbudget bleibt beim bestehenden Riegel (nur EINE Stelle)",
    (aiQuelle.match(/reserveLlmBudgetOrThrow|_budgetReserved/g) || []).length >= 2);
  // Eine kaputte Buchung darf ein BEZAHLTES Modellergebnis nie zerstoeren.
  check("1.7 Beide Meldungen im KI-Pfad schlucken ihren eigenen Fehler",
    (aiQuelle.match(/\.catch\(\(\) => \(\{\}\)\)/g) || []).length === 2,
    String((aiQuelle.match(/\.catch\(\(\) => \(\{\}\)\)/g) || []).length));

  // ── 2 · ANBIETERZUORDNUNG ────────────────────────────────────────────────────────────────
  abschnitt("2 · Anbieterzuordnung aus der URL");
  const faelle = [
    ["https://news.google.com/rss/search?q=x", "google", "news"],
    ["https://www.google.com/search?q=x", "google", "suche"],
    ["https://www.tagesschau.de/inland/artikel.html", "quelle", "www.tagesschau.de"],
    ["https://rss.sueddeutsche.de/rss/Politik", "quelle", "rss.sueddeutsche.de"],
    ["https://www.parlament-berlin.de/ados/export.xml", "quelle", "www.parlament-berlin.de"]
  ];
  for (const [url, anbieter, modell] of faelle) {
    const z = steuerung.anbieterAusUrl(url);
    check(`2.x ${url.slice(0, 46)} -> ${anbieter}/${modell}`,
      z.anbieter === anbieter && z.modell === modell, JSON.stringify(z));
  }
  // Google News und Google Suche sind GETRENNTE Toepfe — eine erschoepfte Newsgrenze darf
  // die Suche nicht mitreissen (und umgekehrt).
  check("2.6 Google News und Google Suche sind getrennte Bereiche",
    steuerung.anbieterAusUrl("https://news.google.com/x").modell
    !== steuerung.anbieterAusUrl("https://www.google.com/search").modell);
  // Jeder Host bekommt seinen eigenen Topf: eine langsame Quelle bremst nie alle anderen.
  check("2.7 Jeder Quellenhost hat seinen eigenen Bereich",
    steuerung.anbieterAusUrl("https://a.de/x").modell !== steuerung.anbieterAusUrl("https://b.de/x").modell);
  const urlTraps = [
    "http://news.google.com/rss/search?q=x",
    "https://news.google.com:444/rss/search?q=x",
    "https://nutzer@news.google.com/rss/search?q=x",
    "https://news.google.com.evil.example/rss/search?q=x",
    "https://sub.news.google.com/rss/search?q=x",
    "https://evil.example/?next=https://news.google.com/rss/search?q=x",
    "https://news.google.com@evil.example/rss/search?q=x"
  ];
  check("2.8 Nur HTTPS/443 + exakt news.google.com ist ein Google-News-Bereich",
    providerUrl.isStrictGoogleNewsUrl("https://NEWS.GOOGLE.COM:443/rss/search?q=x")
    && urlTraps.every((url) => !providerUrl.isStrictGoogleNewsUrl(url)
      && steuerung.anbieterAusUrl(url).modell !== "news"));

  // ── 3 · WAS ALS ANBIETERFEHLER ZAEHLT ────────────────────────────────────────────────────
  abschnitt("3 · Anbieterfehler vs. fachlich leeres Ergebnis");
  check("3.1 HTTP 429 ist ein Anbieterfehler", steuerung.istAnbieterFehler(429) === true);
  check("3.2 HTTP 500/502/503 sind Anbieterfehler",
    [500, 502, 503].every((s) => steuerung.istAnbieterFehler(s) === true));
  check("3.3 HTTP 200/301/404 sind KEINE Anbieterfehler",
    [200, 301, 404].every((s) => steuerung.istAnbieterFehler(s) === false));
  check("3.4 Ein Zeitueberlauf ist ein Anbieterfehler",
    steuerung.istAnbieterFehler(new Error("Request timeout after 15000ms")) === true
    && steuerung.istAnbieterFehler(new Error("connect ETIMEDOUT 1.2.3.4:443")) === true);
  check("3.5 Ein Verbindungsabbruch ist ein Anbieterfehler",
    steuerung.istAnbieterFehler(new Error("read ECONNRESET")) === true
    && steuerung.istAnbieterFehler(new Error("socket hang up")) === true);
  // DAS IST DER WICHTIGE FALL: ein Anbieter, der ordentlich antwortet, aber fachlich nichts
  // liefert, ist GESUND. Wer das als Fehler zaehlt, drosselt sich ohne Grund selbst.
  check("3.6 Ein fachlich leeres Ergebnis ist KEIN Anbieterfehler",
    steuerung.istAnbieterFehler(new Error("keine Treffer")) === false
    && steuerung.istAnbieterFehler(new Error("Feed enthaelt 0 Eintraege")) === false);

  // ── 4 · DER ECHTE ABRUFPFAD ──────────────────────────────────────────────────────────────
  abschnitt("4 · Der echte Abrufpfad (crawler.fetchUrl)");
  let netzAufrufe = 0;
  let letztesSignal = null;
  const crawler = ladeMitErsatz("lib/helmut/crawler.js", [[
    "async function fetchUrlRoh(url, redirectDepth = 0, deps = {}) {",
    `async function fetchUrlRoh(url, redirectDepth = 0, deps = {}) {
       if (deps.__netz) return deps.__netz(url, redirectDepth, deps);`
  ]]);

  function abrufDeps({ reserviere, melde, klassen, netz, klassenSlot } = {}) {
    return {
      env: ENV_AN,
      klassen: klassen === undefined ? null : klassen,
      klassenSlot: klassenSlot || null,
      reserviere: reserviere || (async () => ({ verfuegbar: true, erlaubt: true, wartenMs: 0 })),
      melde: melde || (async () => ({ verfuegbar: true })),
      __netz: netz || (async (url, tiefe, deps2) => {
        netzAufrufe += 1;
        letztesSignal = deps2.abbruchSignal || null;
        return { statusCode: 200, body: "ok", headers: {} };
      })
    };
  }

  const reserviert = [];
  const gemeldet = [];
  netzAufrufe = 0;
  const ok = await crawler.fetchUrl("https://news.google.com/rss/search?q=test", 0, abrufDeps({
    reserviere: async (o) => { reserviert.push(o); return { verfuegbar: true, erlaubt: true }; },
    melde: async (o) => { gemeldet.push(o); return { verfuegbar: true }; }
  }));
  // Der Schluessel traegt die drei Dimensionen: Anbieter | Bereich | Klasse.
  check("4.1 Vor dem Abruf wird unter dem richtigen Schluessel reserviert", reserviert.length === 1
    && reserviert[0].schluessel === "google|news|quellenabruf", JSON.stringify(reserviert[0]));
  check("4.2 Der Abruf hat stattgefunden", netzAufrufe === 1 && ok.statusCode === 200);
  check("4.3 Danach wird ERFOLG gemeldet", gemeldet.length === 1 && gemeldet[0].ok === true,
    JSON.stringify(gemeldet[0]));
  check("4.3b Reservierung und Meldung verwenden exakt denselben Breaker-Schluessel inkl. Klasse",
    reserviert.length === 1 && gemeldet.length === 1
    && reserviert[0].schluessel === "google|news|quellenabruf"
    && gemeldet[0].schluessel === reserviert[0].schluessel,
    `reserve=${reserviert[0] && reserviert[0].schluessel} report=${gemeldet[0] && gemeldet[0].schluessel}`);
  check("4.4 Der Abruf bekommt ein echtes Abbruchsignal",
    letztesSignal && typeof letztesSignal.aborted === "boolean");

  // ERSCHOEPFTE GRENZE: der Auftrag wird VERTAGT, nicht als Fehler verbucht.
  netzAufrufe = 0;
  let vertagung = null;
  await crawler.fetchUrl("https://news.google.com/rss/search?q=test", 0, abrufDeps({
    reserviere: async () => ({ verfuegbar: true, erlaubt: false, grund: "minutengrenze", wartenMs: 42000 })
  })).catch((f) => { vertagung = f; });
  check("4.5 Bei erschoepfter Grenze findet KEIN Abruf statt", netzAufrufe === 0);
  check("4.6 Der Fehler traegt eine Vertagung mit fruehestem Zeitpunkt",
    vertagung && vertagung.anbieterVertagung && Number(vertagung.anbieterVertagung.wartenMs) > 0
    && /minutengrenze/.test(String(vertagung.anbieterVertagung.grund)),
    JSON.stringify(vertagung && vertagung.anbieterVertagung));

  // HTTP 429 wird als ANBIETERFEHLER gemeldet, HTTP 404 nicht.
  for (const [status, erwartetOk] of [[429, false], [503, false], [404, true], [200, true]]) {
    const meldungen = [];
    await crawler.fetchUrl("https://www.tagesschau.de/x", 0, abrufDeps({
      melde: async (o) => { meldungen.push(o); return { verfuegbar: true }; },
      netz: async () => ({ statusCode: status, body: "", headers: {} })
    })).catch(() => {});
    check(`4.7 HTTP ${status} wird als ${erwartetOk ? "gesund" : "Anbieterfehler"} gemeldet`,
      meldungen.length === 1 && meldungen[0].ok === erwartetOk, JSON.stringify(meldungen[0]));
  }

  // Ein Netzfehler wird gemeldet UND weitergereicht (kein stilles Schlucken).
  const meldungenF = [];
  let weitergereicht = null;
  await crawler.fetchUrl("https://www.tagesschau.de/x", 0, abrufDeps({
    melde: async (o) => { meldungenF.push(o); return { verfuegbar: true }; },
    netz: async () => { const e = new Error("socket hang up"); e.code = "ECONNRESET"; throw e; }
  })).catch((f) => { weitergereicht = f; });
  check("4.8 Ein Netzfehler wird als Anbieterfehler gemeldet und weitergereicht",
    meldungenF.length === 1 && meldungenF[0].ok === false && weitergereicht instanceof Error,
    JSON.stringify(meldungenF[0]));

  // JEDE WEITERLEITUNG ist ein eigener HTTP-Versuch und braucht deshalb vor
  // ihrem Socket eine eigene Reservierung unter dem tatsaechlichen Zielhost.
  const reserviertU = [];
  const gemeldetU = [];
  netzAufrufe = 0;
  await crawler.fetchUrl("https://www.tagesschau.de/x", 0, abrufDeps({
    reserviere: async (o) => { reserviertU.push(o); return { verfuegbar: true, erlaubt: true }; },
    melde: async (o) => { gemeldetU.push(o); return { verfuegbar: true }; },
    netz: async (url, tiefe) => {
      netzAufrufe += 1;
      if (tiefe < 3) {
        return { statusCode: 302, body: "", headers: { location: `/hop-${tiefe + 1}` } };
      }
      return { statusCode: 200, body: "ok", headers: {} };
    }
  }));
  check("4.9 Jeder Redirect-Hop wird vor seinem Socket reserviert und gleichschluesselig gemeldet",
    reserviertU.length === 4 && gemeldetU.length === 4 && netzAufrufe === 4
    && reserviertU.every((r, i) => r.schluessel === gemeldetU[i].schluessel),
    `res=${reserviertU.length} report=${gemeldetU.length} netz=${netzAufrufe}`);

  const providerWechselReserviert = [];
  let googleSockets = 0;
  await crawler.fetchUrl("https://redirect.example/start", 0, abrufDeps({
    reserviere: async (o) => {
      providerWechselReserviert.push(o.schluessel);
      return { verfuegbar: true, erlaubt: true };
    },
    netz: async (url) => {
      if (url === "https://redirect.example/start") {
        return {
          statusCode: 302, body: "",
          headers: { location: "https://news.google.com/rss/search?q=redirect" }
        };
      }
      googleSockets += 1;
      return { statusCode: 200, body: "ok", headers: {} };
    }
  }));
  check("4.10 Ein Klassenwechsel per Redirect reserviert Quelle und Google News getrennt",
    providerWechselReserviert.join(",")
      === "quelle|redirect.example|quellenabruf,google|news|quellenabruf"
    && googleSockets === 1,
    `res=${providerWechselReserviert.join(",")} googleSockets=${googleSockets}`);

  let socketsOhneGoogleDeckel = 0;
  let redirectVertagung = null;
  await crawler.fetchUrl("https://redirect.example/start", 0, {
    env: { HELMUT_ANBIETER_STEUERUNG: "on" },
    reserviere: async () => ({ verfuegbar: true, erlaubt: true }),
    melde: async () => ({ verfuegbar: true }),
    __netz: async (url) => {
      socketsOhneGoogleDeckel += 1;
      return url === "https://redirect.example/start"
        ? {
            statusCode: 302, body: "",
            headers: { location: "https://news.google.com/rss/search?q=fail-closed" }
          }
        : { statusCode: 200, body: "ok", headers: {} };
    }
  }).catch((error) => { redirectVertagung = error; });
  check("4.11 Klassenwechsel zu Google ohne Deckel stoppt vor dem zweiten Socket",
    socketsOhneGoogleDeckel === 1 && redirectVertagung && redirectVertagung.anbieterVertagung
    && /anbietergrenzen-nicht-aufnahmebereit/.test(redirectVertagung.anbieterVertagung.grund),
    `sockets=${socketsOhneGoogleDeckel} vertagung=${JSON.stringify(redirectVertagung && redirectVertagung.anbieterVertagung)}`);

  const retryReserviert = [];
  const retryGemeldet = [];
  let retrySockets = 0;
  const retryQuelle = {
    id: "provider-retry", name: "Provider Retry", type: "media", active: true,
    crawlMethod: "rss", url: "https://news.google.com/rss/search?q=provider-retry",
    rssUrl: "https://news.google.com/rss/search?q=provider-retry"
  };
  const retryRun = await crawler.crawlAllSources([retryQuelle], {
    googleGate: hardeningModul.createGoogleNewsGate({
      concurrency: 1, minSpacingMs: 0, breakerMinObservations: 999, retryBudget: 1
    }),
    hardeningConfig: { retryMax: 1, retryBaseMs: 0, retryCapMs: 0, retryAfterCapMs: 0 },
    requestDeps: abrufDeps({
      reserviere: async (o) => {
        retryReserviert.push(o);
        return { verfuegbar: true, erlaubt: true };
      },
      melde: async (o) => { retryGemeldet.push(o); return { verfuegbar: true }; },
      netz: async (url) => {
        retrySockets += 1;
        if (retrySockets === 1) {
          const error = new Error(`HTTP 429 for ${url}`);
          error.statusCode = 429;
          error.retryAfterMs = 0;
          throw error;
        }
        return {
          statusCode: 200, headers: {}, finalUrl: url,
          body: '<?xml version="1.0"?><rss><channel></channel></rss>'
        };
      }
    })
  });
  check("4.12 Jeder Retry-Versuch reserviert und meldet vor seinem eigenen Socket",
    retryRun.results[0].ok === true && retrySockets === 2
    && retryReserviert.length === 2 && retryGemeldet.length === 2
    && retryReserviert.every((r, i) => r.schluessel === retryGemeldet[i].schluessel)
    && retryGemeldet[0].ok === false && retryGemeldet[1].ok === true,
    `sockets=${retrySockets} res=${retryReserviert.length} report=${retryGemeldet.length}`);

  const aufloesungReserviert = [];
  const aufloesungGemeldet = [];
  let aufloesungGet = 0;
  let aufloesungPost = 0;
  const artikelToken = "A".repeat(32);
  const artikelUrl = `https://news.google.com/rss/articles/${artikelToken}`;
  await crawler.resolveArticleUrl(artikelUrl, "Testartikel", {
    ...abrufDeps({
      reserviere: async (o) => {
        aufloesungReserviert.push(o);
        return { verfuegbar: true, erlaubt: true };
      },
      melde: async (o) => { aufloesungGemeldet.push(o); return { verfuegbar: true }; },
      netz: async (url) => {
        aufloesungGet += 1;
        return {
          statusCode: 200, headers: {}, finalUrl: url,
          body: '<div data-n-a-id="AAAAAAAAAAAAAAAAAAAAAAAA" '
            + 'data-n-a-ts="1785773000" data-n-a-sg="signatur">x</div>'
        };
      }
    }),
    requestPost: async (url) => {
      aufloesungPost += 1;
      const error = new Error(`HTTP 503 for ${url}`);
      error.statusCode = 503;
      throw error;
    }
  });
  check("4.13 Feed-Aufloesung und beide POST-Versuche werden einzeln gleichschluesselig begrenzt",
    aufloesungGet === 1 && aufloesungPost === 2
    && aufloesungReserviert.length === 3 && aufloesungGemeldet.length === 3
    && aufloesungReserviert.every((r, i) => r.schluessel === "google|news|quellenabruf"
      && r.schluessel === aufloesungGemeldet[i].schluessel)
    && aufloesungGemeldet[0].ok === true
    && aufloesungGemeldet.slice(1).every((m) => m.ok === false),
    `get=${aufloesungGet} post=${aufloesungPost} res=${aufloesungReserviert.length} report=${aufloesungGemeldet.length}`);

  const pardokCrawler = ladeMitErsatz("lib/helmut/crawler.js", [[
    "async function fetchPardokTextRoh(url, opts = {}, redirectDepth = 0, deps = {}) {",
    `async function fetchPardokTextRoh(url, opts = {}, redirectDepth = 0, deps = {}) {
       if (deps.__pardok) return deps.__pardok(url, opts, redirectDepth, deps);`
  ]]);
  const pardokReserviert = [];
  const pardokGemeldet = [];
  let pardokSockets = 0;
  await pardokCrawler.fetchPardokText("https://pardok-a.example/export", {}, 0, {
    env: ENV_AN,
    reserviere: async (o) => {
      pardokReserviert.push(o);
      return { verfuegbar: true, erlaubt: true };
    },
    melde: async (o) => { pardokGemeldet.push(o); return { verfuegbar: true }; },
    __pardok: async (url) => {
      pardokSockets += 1;
      return url === "https://pardok-a.example/export"
        ? { statusCode: 302, body: "", headers: { location: "https://pardok-b.example/export" } }
        : { statusCode: 200, body: "ok", headers: {} };
    }
  });
  check("4.14 Auch jeder PARDOK-Redirect reserviert den exakten Zielhost vor dem Socket",
    pardokSockets === 2
    && pardokReserviert.map((r) => r.schluessel).join(",")
      === "quelle|pardok-a.example|quellenabruf,quelle|pardok-b.example|quellenabruf"
    && pardokReserviert.every((r, i) => r.schluessel === pardokGemeldet[i].schluessel),
    `sockets=${pardokSockets} res=${pardokReserviert.map((r) => r.schluessel).join(",")}`);

  for (const [name, ziel] of [
    ["http", "http://www.google.com/search?q=x"],
    ["sonderport", "https://www.google.com:444/search?q=x"],
    ["credentials", "https://nutzer@www.google.com/search?q=x"],
    ["dns-punkt", "https://www.google.com./search?q=x"]
  ]) {
    let sockets = 0;
    let fehler = null;
    await crawler.fetchUrl("https://redirect.example/start", 0, abrufDeps({
      netz: async (url) => {
        sockets += 1;
        return url === "https://redirect.example/start"
          ? { statusCode: 302, body: "", headers: { location: ziel } }
          : { statusCode: 200, body: "ok", headers: {} };
      }
    })).catch((error) => { fehler = error; });
    check(`4.15 Google-Suche-Redirect ${name} stoppt geschlossen vor dem Zielsocket`,
      sockets === 1 && fehler && fehler.code === "GOOGLE_SEARCH_URL_INVALID",
      `sockets=${sockets} code=${fehler && fehler.code}`);
  }

  let autoFollowSockets = 0;
  let autoFollowFehler = null;
  await crawler.fetchUrl("https://redirect.example/start", 0, abrufDeps({
    netz: async () => {
      autoFollowSockets += 1;
      return {
        statusCode: 200, headers: {}, body: "ok",
        finalUrl: "https://news.google.com/rss/search?q=adapter-auto-follow"
      };
    }
  })).catch((error) => { autoFollowFehler = error; });
  check("4.16 Ein auto-followender Adapter kann keinen unreservierten Providerwechsel verstecken",
    autoFollowSockets === 1 && autoFollowFehler
    && autoFollowFehler.code === "TRANSPORT_AUTO_REDIRECT_FORBIDDEN",
    `sockets=${autoFollowSockets} code=${autoFollowFehler && autoFollowFehler.code}`);

  let pardokFachpfadSocket = 0;
  let pardokFachpfadVertagung = null;
  await pardokCrawler.crawlSource({
    id: "be-plenum", name: "Berlin PARDOK", type: "parliament", active: true,
    crawlMethod: "structured_download", url: "https://pardok-a.example/export"
  }, {
    env: { ...ENV_AN, HELMUT_PARDOK_DISPATCH: "shadow" },
    reserviere: async () => ({
      verfuegbar: true, erlaubt: false, grund: "minutengrenze", fruehesteMs: 42000
    }),
    melde: async () => ({ verfuegbar: true }),
    __pardok: async () => {
      pardokFachpfadSocket += 1;
      return { statusCode: 200, body: "<Export></Export>", headers: {} };
    }
  }).catch((error) => { pardokFachpfadVertagung = error; });
  check("4.17 PARDOK reicht Provider-Vertagung bis zum Fachpfad durch, ohne leeren Erfolg",
    pardokFachpfadSocket === 0 && pardokFachpfadVertagung
    && pardokFachpfadVertagung.anbieterVertagung
    && pardokFachpfadVertagung.anbieterVertagung.wartenMs === 42000,
    `sockets=${pardokFachpfadSocket} vertagung=${JSON.stringify(pardokFachpfadVertagung && pardokFachpfadVertagung.anbieterVertagung)}`);

  // ── 5 · KLASSEN-LEASE UND ABBRUCH ────────────────────────────────────────────────────────
  abschnitt("5 · Lease halten, erneuern, bei Verlust abbrechen");
  let erneuerungen = 0;
  const klassenGut = {
    erneuere: async () => { erneuerungen += 1; return { erneuert: true }; },
    belege: async () => ({ erlaubt: true, slot: "s" }), gebeFrei: async () => ({})
  };
  // STEUERBARE UHR: die echte Wache erneuert fruehestens alle 5 s. Der Test ersetzt
  // ausschliesslich den Zeitgeber — die Logik bleibt die echte.
  const schnelleUhr = {
    setInterval: (fn) => { const id = setInterval(fn, 5); return id; },
    clearInterval: (id) => clearInterval(id)
  };
  const wache = steuerung.starteLeaseWache({
    klassen: klassenGut, klasse: "quellenabruf", slot: "s", ttlMs: 15000, deps: schnelleUhr });
  await new Promise((r) => setTimeout(r, 60));
  check("5.1 Eine gehaltene Lease wird erneuert, nicht neu belegt",
    wache.verloren() === false && wache.signal && wache.signal.aborted === false);
  wache.beenden();

  const klassenVerloren = {
    erneuere: async () => ({ erneuert: false }),
    belege: async () => ({ erlaubt: true, slot: "s" }), gebeFrei: async () => ({})
  };
  const wache2 = steuerung.starteLeaseWache({
    klassen: klassenVerloren, klasse: "quellenabruf", slot: "s", ttlMs: 3000, deps: schnelleUhr });
  await new Promise((r) => setTimeout(r, 60));
  check("5.2 Eine VERLORENE Lease bricht die laufende Anfrage ab",
    wache2.verloren() === true && wache2.signal.aborted === true);
  wache2.beenden();

  const meldungenL = [];
  let leaseFehler = null;
  await crawler.fetchUrl("https://www.tagesschau.de/x", 0, {
    ...abrufDeps({
      klassen: klassenVerloren, klassenSlot: "s",
      melde: async (o) => { meldungenL.push(o); return { verfuegbar: true }; },
      netz: async (url, tiefe, deps2) => {
        // Der Abruf laeuft, bis das ECHTE Abbruchsignal kommt — genau wie eine haengende
        // HTTP-Anfrage, die von verdrahteAbbruch() zerrissen wird.
        await new Promise((r) => {
          if (deps2.abbruchSignal) deps2.abbruchSignal.addEventListener("abort", r, { once: true });
          setTimeout(r, 2000);
        });
        throw new Error("Abgebrochen (Klassen-Lease verloren)");
      }
    }),
    ...schnelleUhr
  }).catch((f) => { leaseFehler = f; });
  check("5.3 Bricht die Lease weg, ist das ein eigener Befund (kein Anbieterfehler)",
    leaseFehler && leaseFehler.anbieterVertagung
    && leaseFehler.anbieterVertagung.grund === "klassen-lease-verloren" && meldungenL.length === 0,
    JSON.stringify(leaseFehler && leaseFehler.anbieterVertagung));
  check("5.4 Kein Wartezyklus im Abrufpfad (keine Schleife, die Zeit verbrennt)",
    !/while\s*\([^)]*\)\s*\{[^}]*await[^}]*(sleep|setTimeout)/.test(crawlerQuelle));
  check("5.5 Die Wache wird IMMER beendet (finally)",
    /finally\s*\{\s*\n?\s*wache\.beenden\(\);/.test(crawlerQuelle));

  // ── 6 · OHNE FLAG IST PRODUCTION UNVERAENDERT ────────────────────────────────────────────
  abschnitt("6 · Ohne Flag ist Production unveraendert");
  let reserviertAus = 0;
  netzAufrufe = 0;
  const rAus = await crawler.fetchUrl("https://news.google.com/rss/search?q=x", 0, {
    env: {},                                    // KEIN Flag
    reserviere: async () => { reserviertAus += 1; return { erlaubt: false }; },
    __netz: async () => { netzAufrufe += 1; return { statusCode: 200, body: "ok", headers: {} }; }
  });
  check("6.1 Ohne Flag wird NICHT reserviert", reserviertAus === 0);
  check("6.2 Ohne Flag laeuft der Abruf genau wie im Bestand", netzAufrufe === 1 && rAus.statusCode === 200);
  check("6.3 steuerungAktiv() ist ohne Flag falsch",
    steuerung.steuerungAktiv({}) === false && steuerung.steuerungAktiv(ENV_AN) === true);

  // ── 7 · DATENBANKFEHLER STOPPT GESCHLOSSEN ODER VERTAGT SICHER ───────────────────────────
  abschnitt("7 · Datenbankfehler stoppt geschlossen");
  netzAufrufe = 0;
  let dbFehler = null;
  await crawler.fetchUrl("https://news.google.com/rss/search?q=x", 0, abrufDeps({
    reserviere: async () => ({ verfuegbar: false, erlaubt: false, grund: "reservierung-nicht-verfuegbar", wartenMs: 30000 })
  })).catch((f) => { dbFehler = f; });
  check("7.1 Ist die Reservierung nicht verfuegbar, wird NICHT abgerufen", netzAufrufe === 0);
  check("7.2 Der Auftrag wird sicher vertagt (kein Fehlversuch, kein ungebremster Abruf)",
    dbFehler && dbFehler.anbieterVertagung && Number(dbFehler.anbieterVertagung.wartenMs) > 0,
    JSON.stringify(dbFehler && dbFehler.anbieterVertagung));
  // Eine fehlgeschlagene MELDUNG darf ein gelungenes Ergebnis nicht zerstoeren.
  netzAufrufe = 0;
  const trotzdem = await crawler.fetchUrl("https://www.tagesschau.de/x", 0, abrufDeps({
    melde: async () => { throw new Error("datenbank weg"); }
  })).catch(() => null);
  check("7.3 Eine fehlgeschlagene Meldung zerstoert kein gelungenes Ergebnis",
    trotzdem && trotzdem.statusCode === 200 && netzAufrufe === 1, JSON.stringify(trotzdem));

  // ── 7b · AUFNAHMEBEREITSCHAFT: 0/LEER/UNGUELTIG IST NIE UNBEGRENZT ────────────────────────
  abschnitt("7b · Google-Grenzen sperren geschlossen");
  for (const [name, env] of [
    ["fehlend", { HELMUT_ANBIETER_STEUERUNG: "on" }],
    ["leer", { HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_GOOGLE_MINUTE: "", HELMUT_ANBIETER_GOOGLE_TAG: "" }],
    ["null", { HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_GOOGLE_MINUTE: "0", HELMUT_ANBIETER_GOOGLE_TAG: "0" }],
    ["ungueltig", { HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_GOOGLE_MINUTE: "viel", HELMUT_ANBIETER_GOOGLE_TAG: "NaN" }],
    ["exponential", { HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_GOOGLE_MINUTE: "1e3", HELMUT_ANBIETER_GOOGLE_TAG: "3000" }],
    ["hexadezimal", { HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_GOOGLE_MINUTE: "0x10", HELMUT_ANBIETER_GOOGLE_TAG: "3000" }],
    ["postgres-overflow", { HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_GOOGLE_MINUTE: "30", HELMUT_ANBIETER_GOOGLE_TAG: "2147483648" }],
    ["js-overflow", { HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_GOOGLE_MINUTE: "30", HELMUT_ANBIETER_GOOGLE_TAG: "1e308" }]
  ]) {
    const b = steuerung.aufnahmeBereitschaft({ anbieter: "google", env });
    check(`7b.${name} sperrt die Aufnahmebereitschaft`, b.bereit === false, JSON.stringify(b));
  }
  const bereit = steuerung.aufnahmeBereitschaft({ anbieter: "google", env: ENV_AN });
  check("7b.5 Nur zwei positive explizite Grenzen sind aufnahmebereit",
    bereit.bereit === true && bereit.minute === 30 && bereit.tag === 3000, JSON.stringify(bereit));
  let ungebremsteReservierung = 0;
  const ohneDeckel = await steuerung.reserviere({
    anbieter: "google", modell: "news", klasse: "quellenabruf",
    env: { HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_GOOGLE_MINUTE: "0", HELMUT_ANBIETER_GOOGLE_TAG: "" },
    deps: { reserviere: async () => { ungebremsteReservierung += 1; return { erlaubt: true, verfuegbar: true }; } }
  });
  check("7b.6 Ungueltige Grenzen stoppen vor DB und Netz statt 0 als unbegrenzt zu senden",
    ohneDeckel.erlaubt === false && ohneDeckel.vertagen === true && ungebremsteReservierung === 0,
    JSON.stringify(ohneDeckel));

  // Auch bei ausgeschalteter Anbietersteuerung darf eine formal Google-aehnliche,
  // aber unsichere Transportadresse den Socket nicht erreichen.
  let unsichererTransport = 0;
  let unsichererFehler = null;
  await require(path.join(ROOT, "lib", "helmut", "crawler")).fetchUrl(
    "http://news.google.com/rss/search?q=x", 0,
    { env: {}, requestGet: async () => { unsichererTransport += 1; return { body: "" }; } }
  ).catch((error) => { unsichererFehler = error; });
  check("7b.7 Unsicherer echter Google-Host wird vor dem Fake-Socket abgelehnt",
    unsichererTransport === 0 && unsichererFehler && unsichererFehler.code === "GOOGLE_NEWS_URL_INVALID");
  const rpcGrenzfaelle = [
    { schluessel: "x", menge: 1.5, grenzeMinute: 30, grenzeTag: 3000 },
    { schluessel: "x", menge: 1, grenzeMinute: 2147483648, grenzeTag: 3000 },
    { schluessel: "x", menge: 1, grenzeMinute: 30, grenzeTag: Number.POSITIVE_INFINITY },
    { schluessel: "x", menge: 1, grenzeMinute: "30", grenzeTag: 3000 }
  ];
  const rpcGrenzergebnisse = await Promise.all(
    rpcGrenzfaelle.map((werte) => storage.anbieterReserviere(werte)));
  check("7b.8 Die letzte RPC-Grenze verwirft Bruch, String und int4-Overflow vor dem Request",
    rpcGrenzergebnisse.every((r) => r.verfuegbar === false
      && r.grund === "anbieterparameter-ausserhalb-postgresql-integer"),
    JSON.stringify(rpcGrenzergebnisse));

  // ── 8 · DIE VERTAGUNG KOMMT IM AUFTRAGSLAUF AN ───────────────────────────────────────────
  abschnitt("8 · Die Vertagung erreicht den Auftragslauf");
  const pipelineQuelle = ohneKommentare(
    fs.readFileSync(path.join(ROOT, "lib", "helmut", "scalable-pipeline.js"), "utf8"));
  check("8.1 fuehreAuftragAus erkennt eine Anbietervertagung",
    /anbieterVertagung/.test(pipelineQuelle));
  check("8.2 Sie wird als ZURUECKSTELLUNG behandelt, nicht als Fehlversuch",
    /anbieterVertagung[\s\S]{0,400}?zurueckgestellt:\s*true/.test(pipelineQuelle));
  check("8.3 Der Grund benennt die Anbietergrenze ehrlich",
    /anbietergrenze:/.test(pipelineQuelle));

  // ── 9 · VOLLER source_fetch-PFAD BIS ZUR QUEUE-VERTAGUNG (KEIN SOCKET) ────────────────────
  abschnitt("9 · Providervertagung bleibt im vollstaendigen source_fetch-Pfad erhalten");
  const t0 = Date.parse("2026-08-28T12:00:00Z");
  const q = erzeugeSpeicherWarteschlange({ now: () => t0 });
  await q.enqueue({
    jobType: "source_fetch", idempotencyKey: "provider-vertagung-e2e", freshnessWindow: "2026-08-28T12Z",
    payload: { quelle: {
      id: "google-m1-fake", name: "Google M1 Fake", type: "media", active: true,
      crawlMethod: "rss", url: "https://news.google.com/rss/search?q=fake",
      rssUrl: "https://news.google.com/rss/search?q=fake", rssUrls: ["https://news.google.com/rss/search?q=fake"]
    } }, priority: 60, maxAttempts: 5, dueAt: new Date(t0).toISOString()
  });
  const claim = await q.claim({ owner: "provider-worker", limit: 1, leaseMs: 120000 });
  const job = claim.auftraege[0];
  let fakeTransport = 0;
  let finishAufrufe = 0;
  const deferAufrufe = [];
  const lauf = await SP.fuehreAuftragAus({
    auftrag: job, besitzer: "provider-worker", leaseMs: 120000, restzeitMs: 60000,
    deps: {
      now: () => t0,
      handler: { source_fetch: SP.HANDLER.source_fetch },
      extendLease: q.extendLease,
      finish: async (o) => { finishAufrufe += 1; return q.finish(o); },
      zurueckstellen: async (o) => { deferAufrufe.push(o); return q.zurueckstellen(o); },
      hardeningConfig: () => ({
        enabled: true, sharedPathDedup: true, sharedPathWindowMs: 900000,
        concurrency: 1, minSpacingMs: 0, breakerMinObservations: 999,
        breakerFailureRatio: 1, retryMax: 0, retryBudget: 0
      }),
      createGate: hardeningModul.createGoogleNewsGate,
      sharedLedger: () => { throw new Error("Queuepfad darf das Prozess-Ledger nicht anfordern"); },
      crawlAllSources: require(path.join(ROOT, "lib", "helmut", "crawler")).crawlAllSources,
      crawlerRequestDeps: {
        env: ENV_AN,
        reserviere: async () => ({
          verfuegbar: true, erlaubt: false, grund: "minutengrenze", fruehesteMs: 42000
        }),
        melde: async () => ({ verfuegbar: true }),
        requestGet: async () => { fakeTransport += 1; return { body: "", finalUrl: "" }; }
      }
    }
  });
  const nachVertagung = q.alle().find((z) => z.id === job.id);
  check("9.1 Die Anbieterablehnung erreicht die Queue als Vertagung, nicht als Retry",
    lauf.ausgang === "zurueckgestellt" && lauf.bilanz.zurueckgestellt === 1
    && lauf.bilanz.wiederholt === 0 && finishAufrufe === 0, JSON.stringify(lauf));
  check("9.2 Der exakte wartenMs-Wert bleibt bis helmut_defer_job erhalten",
    deferAufrufe.length === 1 && deferAufrufe[0].delayMs === 42000,
    JSON.stringify(deferAufrufe));
  check("9.3 Die Grenze stoppt vor dem Transport und verbraucht keinen Versuch",
    fakeTransport === 0 && nachVertagung && nachVertagung.attempts === 0
    && nachVertagung.status === "wartend",
    `transport=${fakeTransport} attempts=${nachVertagung && nachVertagung.attempts} status=${nachVertagung && nachVertagung.status}`);

  // ── 10 · SHARED-LEDGER MARKIERT NUR BELEGTEN ERFOLG ───────────────────────────────────────
  abschnitt("10 · Fehlgeschlagener Shared-Fetch bleibt wiederholbar");
  const echterCrawler = require(path.join(ROOT, "lib", "helmut", "crawler"));
  const ledger = hardeningModul.createSharedFetchLedger({ windowMs: 900000 });
  const quelle = {
    id: "shared-retry", name: "Shared Retry", type: "media", active: true, crawlMethod: "rss",
    url: "https://news.google.com/rss/search?q=shared-retry",
    rssUrl: "https://news.google.com/rss/search?q=shared-retry"
  };
  let abrufe = 0;
  const leererFeed = "<?xml version=\"1.0\"?><rss><channel></channel></rss>";
  const requestDeps = {
    env: {},
    requestGet: async (url) => {
      abrufe += 1;
      if (abrufe === 1) throw new Error(`Timeout for ${url}`);
      return { body: leererFeed, finalUrl: url };
    }
  };
  const neueGate = () => hardeningModul.createGoogleNewsGate({
    concurrency: 1, minSpacingMs: 0, breakerMinObservations: 999,
    breakerFailureRatio: 1, retryBudget: 0
  });
  const erster = await echterCrawler.crawlAllSources([quelle], {
    googleGate: neueGate(), hardeningConfig: { retryMax: 0 }, sharedLedger: ledger, requestDeps
  });
  const zweiter = await echterCrawler.crawlAllSources([quelle], {
    googleGate: neueGate(), hardeningConfig: { retryMax: 0 }, sharedLedger: ledger, requestDeps
  });
  const dritter = await echterCrawler.crawlAllSources([quelle], {
    googleGate: neueGate(), hardeningConfig: { retryMax: 0 }, sharedLedger: ledger, requestDeps
  });
  check("10.1 Fehlgeschlagener Erstabruf markiert das Ledger nicht",
    erster.results[0].ok === false && zweiter.results[0].status !== "skipped-shared"
    && abrufe === 2, `abrufe=${abrufe} status2=${zweiter.results[0].status}`);
  check("10.2 Der Retry fuehrt den Fake-Transport aus und kann ehrlich leer gelingen",
    zweiter.results[0].ok === true && zweiter.results[0].status === "empty");
  check("10.3 Erst nach diesem Erfolg darf ein Folgeabruf skipped-shared sein",
    dritter.results[0].ok === true && dritter.results[0].status === "skipped-shared" && abrufe === 2);

  const ledgerMehrfach = hardeningModul.createSharedFetchLedger({ windowMs: 900000 });
  const feedA = "https://news.google.com/rss/search?q=shared-a";
  const feedB = "https://news.google.com/rss/search?q=shared-b";
  const mehrfachQuelle = {
    id: "shared-multi-retry", name: "Shared Multi Retry", type: "media", active: true,
    crawlMethod: "rss", url: feedA, rssUrl: feedA, rssUrls: [feedA, feedB]
  };
  const mehrfachAbrufe = new Map([[feedA, 0], [feedB, 0]]);
  const rss = (titel, url) => `<?xml version="1.0"?><rss><channel><item>`
    + `<title>${titel}</title><link>${url}</link>`
    + `<pubDate>Fri, 28 Aug 2026 12:00:00 GMT</pubDate><description>Test</description>`
    + `</item></channel></rss>`;
  const mehrfachDeps = {
    env: {},
    requestGet: async (url) => {
      mehrfachAbrufe.set(url, (mehrfachAbrufe.get(url) || 0) + 1);
      if (url === feedB && mehrfachAbrufe.get(url) === 1) throw new Error(`Timeout for ${url}`);
      return {
        statusCode: 200, headers: {}, finalUrl: url,
        body: rss(url === feedA ? "Feed A" : "Feed B", url === feedA
          ? "https://publisher-a.example/artikel" : "https://publisher-b.example/artikel")
      };
    }
  };
  const multiErster = await echterCrawler.crawlAllSources([mehrfachQuelle], {
    googleGate: neueGate(), hardeningConfig: { retryMax: 0 },
    sharedLedger: ledgerMehrfach, requestDeps: mehrfachDeps
  });
  const multiZweiter = await echterCrawler.crawlAllSources([mehrfachQuelle], {
    googleGate: neueGate(), hardeningConfig: { retryMax: 0 },
    sharedLedger: ledgerMehrfach, requestDeps: mehrfachDeps
  });
  const multiDritter = await echterCrawler.crawlAllSources([mehrfachQuelle], {
    googleGate: neueGate(), hardeningConfig: { retryMax: 0 },
    sharedLedger: ledgerMehrfach, requestDeps: mehrfachDeps
  });
  check("10.4 Ein partieller Mehrfachfeed-Fehler markiert das Shared-Ledger nicht als Erfolg",
    multiErster.results[0].ok === false && multiZweiter.results[0].status !== "skipped-shared",
    `erster=${multiErster.results[0].status} zweiter=${multiZweiter.results[0].status}`);
  check("10.5 Der Folgeabruf wiederholt beide Feeds und belegt erst dann den Gesamterfolg",
    multiZweiter.results[0].ok === true && multiZweiter.results[0].itemCount === 2
    && mehrfachAbrufe.get(feedA) === 2 && mehrfachAbrufe.get(feedB) === 2,
    `a=${mehrfachAbrufe.get(feedA)} b=${mehrfachAbrufe.get(feedB)} items=${multiZweiter.results[0].itemCount}`);
  check("10.6 Erst der vollstaendige Mehrfachfeed-Erfolg darf spaeter skipped-shared werden",
    multiDritter.results[0].status === "skipped-shared"
    && mehrfachAbrufe.get(feedA) === 2 && mehrfachAbrufe.get(feedB) === 2,
    `status=${multiDritter.results[0].status} a=${mehrfachAbrufe.get(feedA)} b=${mehrfachAbrufe.get(feedB)}`);

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((fehler) => {
  console.error("FATAL:", fehler);
  process.exit(1);
});
