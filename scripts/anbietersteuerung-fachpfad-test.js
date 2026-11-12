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
  HELMUT_ANBIETER_STEUERUNG: "on"
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
    /async function fetchText\(url\)\s*\{\s*\n\s*const result = await fetchUrl\(url\);/.test(crawlerQuelle));
  check("1.4b fetchHtmlPage geht ueber fetchText",
    /async function fetchHtmlPage\(url\)\s*\{\s*\n\s*const html = await fetchText\(url\);/.test(crawlerQuelle));
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
  check("4.3b Meldung und Reservierung binden denselben Schutzschalter", gemeldet[0].schluessel === reserviert[0].schluessel,
    JSON.stringify({ reserviert: reserviert[0].schluessel, gemeldet: gemeldet[0].schluessel }));
  check("4.4 Der Abruf bekommt ein echtes Abbruchsignal",
    letztesSignal && typeof letztesSignal.aborted === "boolean");

  // Derselbe exakte Schluessel wie im nativen SQL: Fehler unter einem
  // anderen Schluessel duerfen nicht bloss eine unbenutzte Sperre erzeugen.
  const schalter = new Map(); let versuche = 0;
  const circuitDeps = abrufDeps({
    reserviere: async o => ({ verfuegbar: true, erlaubt: (schalter.get(o.schluessel) || 0) < 5,
      grund: "schutzschalter-offen", fruehesteMs: 60000 }),
    melde: async o => { schalter.set(o.schluessel, o.ok ? 0 : (schalter.get(o.schluessel) || 0) + 1); return { verfuegbar: true }; },
    netz: async () => { versuche++; return { statusCode: 503, body: "isolierter Anbieterfehler", headers: {} }; }
  });
  for (let i = 0; i < 5; i++) await crawler.fetchUrl("https://example.org/feed", 0, circuitDeps);
  let circuitFehler = null;
  await crawler.fetchUrl("https://example.org/feed", 0, circuitDeps).catch(e => { circuitFehler = e; });
  check("4.4b Fuenf Fehler sperren den sechsten echten Transportaufruf", versuche === 5 &&
    /schutzschalter-offen/.test(circuitFehler?.anbieterVertagung?.grund || ""),
  JSON.stringify({ versuche, grund: circuitFehler?.anbieterVertagung?.grund }));
  let gemeldeterBereich;
  await steuerung.melde({ anbieter: "azure-openai", modell: "synthetisch", klasse: "ki", mandat: "synthetisch",
    ok: false, env: ENV_AN, deps: { melde: async o => { gemeldeterBereich = o.schluessel; return { verfuegbar: true }; } } });
  check("4.4c Auch KI und Mandatsdimension bleiben im Meldeschluessel gebunden",
    gemeldeterBereich === steuerung.grenzSchluessel({ anbieter: "azure-openai", modell: "synthetisch", klasse: "ki", mandat: "synthetisch" }));

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

  // WEITERLEITUNGEN laufen INNERHALB derselben Reservierung.
  const reserviertU = [];
  netzAufrufe = 0;
  await crawler.fetchUrl("https://www.tagesschau.de/x", 0, abrufDeps({
    reserviere: async (o) => { reserviertU.push(o); return { verfuegbar: true, erlaubt: true }; },
    netz: async (url, tiefe, deps2) => {
      netzAufrufe += 1;
      if (tiefe < 3) return crawler.fetchUrl("https://www.tagesschau.de/y", tiefe + 1, deps2);
      return { statusCode: 200, body: "ok", headers: {} };
    }
  }));
  check("4.9 Eine Umleitungskette verbraucht GENAU EIN Kontingent",
    reserviertU.length === 1 && netzAufrufe === 4, `res=${reserviertU.length} netz=${netzAufrufe}`);

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

  // Echter Uebergang vom Source-Handler in den gemeinsamen Worker. Die alten
  // Quelltextwaechter oben sehen nicht, ob der Handler die Metadaten verliert.
  const SP = require(path.join(ROOT, "lib", "helmut", "scalable-pipeline.js"));
  async function quellenFall(vertagung, deferVerfuegbar = true) {
    const finish = [], defer = [], frei = []; let persist = 0;
    const auftrag = { id: "quelle-synthetisch", job_type: "source_fetch", attempts: 5,
      max_attempts: 5, payload: { quelle: { id: "synthetisch", active: true } } };
    const deps = {
      now: () => Date.now(), handler: SP.HANDLER,
      hardeningConfig: () => ({ enabled: false }),
      crawlAllSources: async () => ({ rawItems: [], results: [{ ok: false,
        error: "abruf-grenze-oder-stoerung", anbieterVertagung: vertagung }] }),
      persistRohdokumente: async () => { persist++; throw Error("unerwartete Persistenz"); },
      klassen: { belege: async () => ({ erlaubt: true, slot: "slot-synthetisch" }),
        gebeFrei: async slot => { frei.push(slot); } },
      finish: async args => { finish.push(args); return { verfuegbar: true,
        uebernommen: true, neuerStatus: "fehlgeschlagen" }; },
      zurueckstellen: async args => { defer.push(args); return { verfuegbar: deferVerfuegbar }; }
    };
    const result = await SP.fuehreAuftragAus({ auftrag, deps, besitzer: "worker-synthetisch" });
    return { result, finish, defer, frei, persist };
  }
  const minute = await quellenFall({ bereich: { anbieter: "google", modell: "news", klasse: "quellenabruf" },
    grund: "anbietergrenze-minutengrenze", wartenMs: 59000, vorAbruf: true });
  check("8.4 Echte Source-Handler/Worker-Kette vertagt auch am letzten erlaubten Versuch",
    minute.result.ausgang === "zurueckgestellt" && minute.result.bilanz.endgueltigFehlgeschlagen === 0);
  check("8.5 Anbieterpause ruft nur die versuchserhaltende Vertagung mit derselben Lease auf",
    minute.finish.length === 0 && minute.defer.length === 1
    && minute.defer[0].id === "quelle-synthetisch" && minute.defer[0].owner === "worker-synthetisch"
    && minute.defer[0].grund === "anbietergrenze: anbietergrenze-minutengrenze");
  check("8.6 Kein Dokumentwrite und Klassenslot auch bei Vertagung freigegeben",
    minute.persist === 0 && minute.frei.length === 1 && minute.frei[0] === "slot-synthetisch");
  const lang = await quellenFall({ grund: "anbietergrenze-tag", wartenMs: 86400000, vorAbruf: true });
  check("8.7 Lange Anbieterpause behaelt die vorhandene lange Worker-Wiedervorlage",
    lang.result.ausgang === "zurueckgestellt" && lang.defer[0]?.delayMs === SP.BUDGET_WARTE_MS);
  const normal = await quellenFall(null);
  check("8.8 Ein echter Abruffehler ohne Vertagungsbeleg bleibt ein Fehlversuch",
    normal.result.ausgang === "endgueltig-fehlgeschlagen" && normal.defer.length === 0
    && normal.finish.length === 1 && normal.finish[0].ok === false);
  const ohneDefer = await quellenFall({ grund: "anbietergrenze-minutengrenze", wartenMs: 30000 }, false);
  check("8.9 Unverfuegbare Vertagung meldet die Luecke und schliesst nichts erfolgreich ab",
    ohneDefer.result.ausgang === "zurueckgestellt"
    && ohneDefer.result.bilanz.zurueckstellungNichtVerfuegbar === 1 && ohneDefer.finish.length === 0);
  const ungueltig = await quellenFall("kein-strukturierter-Beleg");
  check("8.10 Ungueltige Metadaten werden nicht zu einer Anbieterpause umgedeutet",
    ungueltig.result.ausgang === "endgueltig-fehlgeschlagen" && ungueltig.defer.length === 0);

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((fehler) => {
  console.error("FATAL:", fehler);
  process.exit(1);
});
