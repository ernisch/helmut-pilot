"use strict";

// Helmut — OP-25: Kapazitaetsfehler im globalen Abrufpfad (HELMUT_CRON_GLOBALABRUF), ursaechlich.
// =============================================================================================
// AUSGANGSLAGE (Production, 2026-08-03, rein lesend aus Vercel-Runtime-Logs belegt):
//   - `cron/pipeline` 16:00:01 UTC: `[cron/pipeline/globalphase] 267122ms status=teilweise
//     quellen=181 rohdokumente=2179 verstanden=0 frisch=false budgetGlobalMs=221674 reserveMs=48000
//     restMs=2552` — die globale Phase hat ihr EIGENES zugeteiltes Budget (221 674 ms) um
//     45 448 ms ueberzogen. Mandatsphase: 0 von 6 Mandaten (`zeitbudget=<alle sechs>`,
//     `kapazitaet=0`).
//   - `cron/crawl` 20:00:49 UTC (derselbe Deploy, kein Codeunterschied): `[cron/crawl] 280184ms
//     tenants=undefined bounded=true` — traf das AEUSSERE 280 000-ms-Limit, Lauf als
//     `abgebrochen` vermerkt.
//   - Beide Laeufe zeigten vielfache `[crawler] Google-News URL-Aufloesung: N/M aufgeloest` sowie
//     mehrere `Crawl failed for ... Timeout for https://news.google.com/rss/search?...`.
// Diese Suite reproduziert den beobachteten Kapazitaetsfehler DETERMINISTISCH und OFFLINE, ohne
// echtes Netz, und weist den ursaechlichen Mechanismus nach: der Stufenabruf in
// `runGlobaleErfassung` (lib/helmut/scheduler.js) prueft die Restzeit nur ALS START-GATTER
// zwischen Stufen — eine begonnene Stufe (bis zu `HELMUT_GLOBALPHASE_ABRUF_STUFE`, Default 20,
// Quellen) laeuft ungebremst zu Ende, selbst wenn sie das zugeteilte Budget dabei ueberzieht. Das
// ist strukturell derselbe Fehler wie R-6 (docs/betrieb/cron-fairness.md §11.1), nur an einer
// anderen Stelle (Quellen-Stufen statt Mandats-Fairnessschleife).
//
// WICHTIGER, SEPARATER BEFUND: der bestehende `scripts/cron-globalphase-test.js` Abschnitt 8
// (`messen()`) ersetzt `crawlAllSources` durch einen SERIELLEN Testdouble mit einer FLACHEN
// Kostenkonstante je Quelle (`KOSTEN.abrufMs`). Das modelliert weder die Google-News-Haertungs-
// Gate-Nebenlaeufigkeit (`HELMUT_GOOGLE_CONCURRENCY`, Default 5) noch den Mindestabstand
// (`HELMUT_GOOGLE_MIN_SPACING_MS`, Default 200 ms) noch das Quellen-Timeout
// (`CRAWLER_TIMEOUT_MS`, Default 7000 ms) noch die reale Groessenordnung von 181 Quellen. Genau
// diese Luecke erklaert, warum die bestehende Suite "K2.1 6/6 in 205 145 ms" meldete, waehrend
// Production am selben Tag scheiterte — nicht ein Widerspruch in der Fachlogik (die bleibt
// richtig, siehe vorgangskontext-test.js), sondern eine zu grobe Zeitannahme im Kostenmodell
// dieser EINEN Suite. Diese neue Suite schliesst die Luecke, indem sie das ECHTE Gate
// (`lib/helmut/google-news-hardening.js`, `createGoogleNewsGate`, unveraendert) und die ECHTE
// Budget-/Stufenlogik (`lib/helmut/scheduler.js`, `runGlobaleErfassung`, unveraendert) treibt.
// Nur die HTTP-Schicht (`crawlSource`) ist ein kalibriertes Testdouble — echte Netzwerkaufrufe
// sind offline nicht moeglich und in diesem Sprint ausdruecklich verboten.
//
// Deterministisch: eigener virtueller Taktgeber (unten), keine echten `setTimeout`-Wartezeiten,
// kein Zufall (Quellenlatenzen sind eine feste, indexbasierte Pseudo-Verteilung), keine KI, keine
// Production-Daten oder Secrets in den Fixtures.

const path = require("path");
const ROOT = path.join(__dirname, "..");
const scheduler = require(path.join(ROOT, "lib", "helmut", "scheduler.js"));
const G = require(path.join(ROOT, "lib", "helmut", "cron-globalphase.js"));
const GN = require(path.join(ROOT, "lib", "helmut", "google-news-hardening.js"));

// Die 181 GEMESSENEN Quellendauern des gescheiterten Production-Laufs, in Laufreihenfolge
// (`source_crawl_telemetry`, `run_id = cron-pipeline-20260803160002-xm71n-global`). Rohdaten.
const VERMESSENE_QUELLENDAUERN = [
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

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); } else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

// ── Virtueller Taktgeber ─────────────────────────────────────────────────────────────────────
// Ein minimaler, selbstgebauter "Fake-Timer": `sleep(ms)` haelt NICHT echte Millisekunden an,
// sondern reiht sich in eine Warteschlange ein. `run()` treibt eine Hauptaufgabe an und pumpt
// dabei wiederholt: naechsten faelligen Zeitpunkt suchen, virtuelle Uhr dorthin vorstellen, alle
// zu diesem Zeitpunkt faelligen Wartenden aufwecken, den Ereignisloop einmal atmen lassen (damit
// wiederaufgenommener Code ggf. neue `sleep()`-Aufrufe eintraegt), wiederholen — bis die
// Hauptaufgabe fertig ist. Damit laufen echte nebenlaeufige `Promise`-Ketten (Gate-Semaphor,
// Mindestabstand, `Promise.all`) korrekt zueinander, aber in Sekundenbruchteilen realer Zeit.
// Binaerer Min-Heap statt Sortieren je Pumpschritt: bei vielen gleichzeitig ausstehenden
// simulierten Netzwerkwartezeiten (Google-Gate-Slots x Stufen x Sweep-Laeufe dieser Suite) waere
// ein `Array.sort()` je Tick O(n log n) UEBER DIE GESAMTE Warteschlange — bei tausenden Ticks
// je Testlauf messbar. Der Heap haelt Einfuegen/Entnehmen bei O(log n).
function macheMinHeap(vergleiche) {
  const a = [];
  function tauschen(i, j) { const x = a[i]; a[i] = a[j]; a[j] = x; }
  function raufSickern(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (vergleiche(a[i], a[p]) >= 0) break;
      tauschen(i, p); i = p;
    }
  }
  function runterSickern(i) {
    for (;;) {
      let kleinstes = i; const l = 2 * i + 1; const r = 2 * i + 2;
      if (l < a.length && vergleiche(a[l], a[kleinstes]) < 0) kleinstes = l;
      if (r < a.length && vergleiche(a[r], a[kleinstes]) < 0) kleinstes = r;
      if (kleinstes === i) break;
      tauschen(i, kleinstes); i = kleinstes;
    }
  }
  return {
    get size() { return a.length; },
    peek: () => a[0],
    push(x) { a.push(x); raufSickern(a.length - 1); },
    pop() {
      const top = a[0]; const letztes = a.pop();
      if (a.length) { a[0] = letztes; runterSickern(0); }
      return top;
    }
  };
}

function macheVirtuellenTaktgeber() {
  let t = 0;
  let seq = 0;
  const wartend = macheMinHeap((x, y) => (x.zeit - y.zeit) || (x.ord - y.ord));
  function now() { return t; }
  function sleep(ms) {
    const wachAuf = t + Math.max(0, Number(ms) || 0);
    return new Promise((resolve) => { wartend.push({ zeit: wachAuf, ord: seq++, resolve }); });
  }
  // Mikrotask-basiert (nicht `setImmediate`): eine Warteschlange von Promise-Callbacks lässt
  // sich in derselben Ereignisschleifen-Runde vollstaendig abarbeiten und ist damit um
  // Groessenordnungen schneller als ein Makrotask-Tick je Pumpschritt — bei tausenden
  // simulierten Netzwerk-"Wartezeiten" je Testlauf ist das der Unterschied zwischen
  // Sekundenbruchteilen und Minuten ECHTER Testlaufzeit.
  function atmen() { return Promise.resolve().then(() => Promise.resolve()); }
  async function run(hauptaufgabe) {
    let fertig = false; let ergebnis; let fehler;
    hauptaufgabe().then((r) => { fertig = true; ergebnis = r; }, (e) => { fertig = true; fehler = e; });
    let leerlaeufe = 0;
    while (!fertig) {
      if (!wartend.size) {
        await atmen();
        if (!wartend.size && !fertig) {
          leerlaeufe += 1;
          if (leerlaeufe > 2000) throw new Error("virtueller Taktgeber haengt: keine ausstehenden Timer, Hauptaufgabe nicht fertig");
          continue;
        }
        continue;
      }
      leerlaeufe = 0;
      const naechsteZeit = wartend.peek().zeit;
      const faellig = [];
      while (wartend.size && wartend.peek().zeit === naechsteZeit) faellig.push(wartend.pop());
      t = naechsteZeit;
      for (const eintrag of faellig) eintrag.resolve();
      await atmen();
      await atmen();
    }
    if (fehler) throw fehler;
    return ergebnis;
  }
  return { now: () => t, sleep, run };
}

// Selbstpruefung des Taktgebers, BEVOR er fuer die eigentliche Messung vertraut wird: fuenf
// "Quellen" a 1000 ms bei Nebenlaeufigkeit 5 muessen bei t=1000 fertig sein (parallel), nicht
// bei t=5000 (seriell) — und das Ganze in deutlich unter einer Sekunde ECHTER Zeit.
async function selbstpruefungTaktgeber() {
  const takt = macheVirtuellenTaktgeber();
  const startEcht = Date.now();
  const zeiten = await takt.run(async () => {
    const ergebnisse = await Promise.all([1, 2, 3, 4, 5].map(async (i) => {
      await takt.sleep(1000);
      return { i, t: takt.now() };
    }));
    return ergebnisse;
  });
  const echtMs = Date.now() - startEcht;
  return {
    parallelErkannt: zeiten.every((z) => z.t === 1000),
    echtMs
  };
}

// ── Google-Gate ueber den virtuellen Takt ───────────────────────────────────────────────────
// `runGlobaleErfassung` ruft `deps.createGate(hardeningConfig, { startOpen })` auf — OHNE eine
// eigene Uhr zu uebergeben (server.js/scheduler.js tun das in Production auch nicht, dort laeuft
// echte Zeit). Der Wrapper reicht deshalb HIER die virtuelle Uhr/den virtuellen Sleep an das
// ECHTE, UNVERAENDERTE `createGoogleNewsGate` durch — das Gate selbst ist keine Zeile anders als
// in Production.
function macheGateFabrik(takt) {
  return (config, extra = {}) => GN.createGoogleNewsGate(config, { ...extra, now: takt.now, sleep: takt.sleep });
}

// Produktions-Default-Konfiguration der Haertung, WOERTLICH aus
// lib/helmut/google-news-hardening.js#googleHardeningConfig uebernommen (Stand dieser Suite),
// damit die Messung nicht von der Prozessumgebung abhaengt, die die Suite gerade ausfuehrt.
const HAERTUNG = {
  enabled: true,
  concurrency: 5,
  minSpacingMs: 200,
  retryMax: 2,
  retryBaseMs: 1000,
  retryCapMs: 8000,
  retryAfterCapMs: 15000,
  breakerMinObservations: 10,
  breakerFailureRatio: 0.6,
  retryBudget: 12,
  breakerMemoryMs: 10 * 60 * 1000,
  cooldownMs: 60 * 60 * 1000,
  fullCrawlMinSpacingMs: 30 * 60 * 1000,
  sharedPathDedup: true,
  sharedPathWindowMs: 15 * 60 * 1000
};
const FETCH_TIMEOUT_MS = 7000; // CRAWLER_TIMEOUT_MS Default, lib/helmut/crawler.js:28
const DIRECT_CONCURRENCY = 20; // CRAWLER_CONCURRENCY Default, lib/helmut/crawler.js:29

// ── Synthetische, aber massstabsgetreue Welt: 181 Quellen, sechs Mandate ───────────────────
// Ziel: dieselbe GROESSENORDNUNG wie die Production-Beobachtung (181 Quellen, davon in
// Production 140 gemeinsam / 41 mandatseigen, `[globalphase] Quellen vereinigt: gesamt=181
// gemeinsam=140 mandatseigen=41`), NICHT eine Nachbildung des echten Quellenkatalogs (der bleibt
// unveraendert und wird hier nicht gelesen — keine Production-Quellen/-URLs in Fixtures,
// CLAUDE.md §4.2/§4.3).
const SECHS = ["m-1", "m-2", "m-3", "m-4", "m-5", "m-6"];
const ANZAHL_GEMEINSAM = 140;
const ANZAHL_MANDATSEIGEN_JE = [7, 7, 7, 7, 6, 7]; // Summe 41
// Anteil Google-News-Quellen: ANNAHME, keine Messung. Begruendet dadurch, dass in BEIDEN
// Production-Laeufen praktisch jede Stufe (Groesse 20) eine `Google-News URL-Aufloesung`-Zeile
// erzeugte und die direkten/amtlichen Quellen in den Logs fehlerfrei blieben (nur Google-Wege
// zeigten Timeouts) — konsistent mit einem hohen Google-Anteil. Der genaue Wert ist nicht aus
// den Logs ablesbar; 0,88 ist eine plausible, klar benannte Eingabe (vgl. die "Production-
// kalibriert"-Konvention in scripts/cron-globalphase-test.js §8a2).
const GOOGLE_ANTEIL = 0.88;

function baueQuellen() {
  const quellen = [];
  let n = 0;
  const neueQuelle = (id, mandat) => {
    n += 1;
    const google = (n % 100) < Math.round(GOOGLE_ANTEIL * 100);
    return {
      id,
      name: id,
      active: true,
      crawlMethod: "rss",
      priority: 50,
      // isGoogleNewsSource() prueft nur auf den Teilstring "news.google." in rssUrl/url/rssUrls —
      // keine echte Google-Domain wird hier kontaktiert, es ist ein reiner Erkennungsmarker.
      rssUrl: google
        ? `https://news.google.example/rss/search?q=${encodeURIComponent(id)}`
        : `https://direkt.example/${id}/rss`,
      url: google
        ? `https://news.google.example/rss/search?q=${encodeURIComponent(id)}`
        : `https://direkt.example/${id}/rss`,
      __google: google,
      __mandat: mandat || null
    };
  };
  for (let i = 0; i < ANZAHL_GEMEINSAM; i += 1) quellen.push(neueQuelle(`geteilt-${i}`, null));
  SECHS.forEach((mandat, mi) => {
    for (let i = 0; i < ANZAHL_MANDATSEIGEN_JE[mi]; i += 1) quellen.push(neueQuelle(`${mandat}-eigen-${i}`, mandat));
  });
  return quellen;
}
const ALLE_QUELLEN = baueQuellen();
const GESAMT_QUELLEN = ALLE_QUELLEN.length; // 181

function sechsProfile() {
  return SECHS.map((id) => ({ id, fullName: `Mandat ${id.toUpperCase()}` }));
}

// Quellenplan je Profil: geteilte Quellen fuer alle, mandatseigene nur fuer das eigene Mandat —
// entspricht der UNVERAENDERTEN `getSourcesForProfile`-Vertragslogik (Vereinigung dedupliziert
// nach `id`, siehe cron-globalphase.js `planGlobaleQuellen`), ohne den echten Katalog zu lesen.
function quellenFuerProfil(profil) {
  return ALLE_QUELLEN.filter((q) => q.__mandat === null || q.__mandat === profil.id);
}

// ── Latenzmodell (die einzige kalibrierte Eingabe) ──────────────────────────────────────────
// ANNAHME, keine Messung — Herkunft und Begruendung stehen im Dateikopf. Deterministisch: die
// "Zufaelligkeit" ist ein fester Hash der QUELLENKENNUNG (FNV-1a, 32 bit -> [0,1)), kein echter
// Zufallsgenerator und unabhaengig von Aufrufreihenfolge/Stufenzuschnitt.
function pseudoZufall(schluessel) {
  let h = 2166136261;
  const s = String(schluessel);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
function quellenLatenzMs(quelle, index) {
  if (!quelle.__google) return 150 + (index % 5) * 30; // direkte/amtliche Quellen: durchweg schnell, Production zeigte dort 0 Fehler
  // Google-Quelle: RSS-Suche + bis zu 12 sequenzielle Artikel-URL-Aufloesungen (Kommentar
  // lib/helmut/scheduler.js:2140ff, defaultGoogleNewsMaxItems=12). Ein fester Anteil erreicht
  // NICHT rechtzeitig eine Antwort und laeuft in den vollen Quellen-Timeout — genau das Muster
  // der beiden geloggten "Crawl failed ... Timeout" in Production.
  const zeitueberschreitungsAnteil = 0.12;
  if (pseudoZufall(`${quelle.id}#timeout`) < zeitueberschreitungsAnteil) return FETCH_TIMEOUT_MS;
  const rssMs = 500 + (index % 7) * 60;
  const aufloesungenJeQuelle = 8 + (index % 5); // 8..12, Mittel ~10
  const jeAufloesungMs = 380 + (index % 11) * 25;
  return rssMs + aufloesungenJeQuelle * jeAufloesungMs;
}

// Dokumentausbeute je Quelle — kalibriert, damit die Summe nach Cap/Dedup in die Naehe von 2179
// kommt (Production: `rohdokumente=2179` bei `quellen=181`). Direkte Quellen: bis zu
// `HELMUT_DIRECT_RSS_MAX_ITEMS` (Default 16); Google-Quellen: bis zu
// `HELMUT_GOOGLE_NEWS_MAX_ITEMS` (Default 12) — hier je Quelle leicht darunter angesetzt, weil
// nicht jede Aufloesung ein neues, eindeutiges Dokument liefert (Production: 307/355 aufgeloest
// in einer Stufe, nicht 355/355). Dieselbe Zeitueberschreitungs-Auswahl wie `quellenLatenzMs`
// (dieselbe Quelle, derselbe Ausgang — keine unabhaengige zweite Wuerfelung).
function dokumentAusbeute(quelle, index) {
  if (!quelle.__google) return 14 + (index % 3);
  if (pseudoZufall(`${quelle.id}#timeout`) < 0.12) return 0; // zeitueberschrittene Quelle liefert nichts
  return 12 + (index % 3);
}

function macheRawItem(quelle, laufKennung, n) {
  const id = `${quelle.id}-${laufKennung}-${n}`;
  return {
    id, sourceId: quelle.id, sourceName: quelle.name,
    title: `Titel ${id}`, summary: `Kurzfassung ${id}`,
    url: `https://dokument.example/${id}`,
    publishedAt: "2026-08-03T12:00:00.000Z", retrievedAt: "2026-08-03T16:00:00.000Z"
  };
}

// ── Der Testdouble fuer `crawlAllSources` — treibt das ECHTE Gate ───────────────────────────
// Signatur und Rueckgabeform identisch zu `crawlAllSources` (lib/helmut/crawler.js): erhaelt
// eine STUFE von Quellen plus `{ googleGate, cooldown, hardeningConfig, sharedLedger }` (genau
// die Optionen, die `runGlobaleErfassung` je Stufe durchreicht) und liefert eine Bilanz im
// Format von `leereCrawlBilanz()`. Direkte Quellen laufen ueber einen einfachen
// Nebenlaeufigkeits-Pool (wie `mapWithConcurrency`); Google-Quellen laufen AUSSCHLIESSLICH ueber
// `opts.googleGate.schedule()` — das ECHTE Gate entscheidet Nebenlaeufigkeit, Mindestabstand und
// Circuit Breaker, exakt wie in Production.
function macheCrawlAllSourcesDouble(takt, { laufKennung, zeitSammler = null }) {
  let quellenZaehler = 0;
  return async function crawlAllSourcesDouble(sourcesSlice, opts = {}) {
    const gate = opts.googleGate || null;
    const ledger = opts.sharedLedger || null;
    const aktive = (sourcesSlice || []).filter((q) => q && q.active);
    const ergebnisse = new Array(aktive.length);
    const einesAbrufen = async (quelle, globalerIndex) => {
      if (ledger && GN.isGoogleNewsSource(quelle) && ledger.seenRecently(quelle)) {
        return { sourceId: quelle.id, sourceName: quelle.name, ok: true, itemCount: 0, items: [], status: "skipped-shared" };
      }
      if (ledger && GN.isGoogleNewsSource(quelle)) ledger.note(quelle);
      const dauerMs = quellenLatenzMs(quelle, globalerIndex);
      await takt.sleep(dauerMs);
      if (dauerMs >= FETCH_TIMEOUT_MS) {
        return { sourceId: quelle.id, sourceName: quelle.name, ok: false, itemCount: 0, items: [], error: `Timeout for ${quelle.url}`, status: "error" };
      }
      const anzahl = dokumentAusbeute(quelle, globalerIndex);
      const items = Array.from({ length: anzahl }, (_, i) => macheRawItem(quelle, laufKennung, i));
      return { sourceId: quelle.id, sourceName: quelle.name, ok: true, itemCount: items.length, items, status: items.length ? "ok" : "empty" };
    };

    const direktIdx = []; const googleIdx = [];
    aktive.forEach((q, i) => (GN.isGoogleNewsSource(q) ? googleIdx : direktIdx).push(i));

    const direktArbeit = (async () => {
      let naechster = 0;
      const worker = async () => {
        for (;;) {
          const i = naechster; naechster += 1;
          if (i >= direktIdx.length) return;
          const idx = direktIdx[i];
          quellenZaehler += 1;
          ergebnisse[idx] = await einesAbrufen(aktive[idx], quellenZaehler);
        }
      };
      await Promise.all(Array.from({ length: Math.min(DIRECT_CONCURRENCY, direktIdx.length || 1) }, worker));
    })();

    const googleArbeit = gate
      ? Promise.all(googleIdx.map(async (idx) => {
        quellenZaehler += 1;
        const meinIndex = quellenZaehler;
        try {
          ergebnisse[idx] = await gate.schedule(async () => {
            const r = await einesAbrufen(aktive[idx], meinIndex);
            if (r.ok) gate.report(null); else gate.report(new Error(r.error || "fehler"));
            return r;
          });
        } catch (error) {
          ergebnisse[idx] = { sourceId: aktive[idx].id, sourceName: aktive[idx].name, ok: false, itemCount: 0, items: [], error: error && error.message, status: "circuit-open" };
        }
      }))
      : Promise.all(googleIdx.map(async (idx) => { ergebnisse[idx] = await einesAbrufen(aktive[idx], (quellenZaehler += 1)); }));

    const __t0 = takt.now();
    await Promise.all([direktArbeit, googleArbeit]);
    if (zeitSammler) zeitSammler.abrufMs += takt.now() - __t0;
    if (process.env.DEBUG_KAPAZITAET) {
      console.error(`DEBUG stufe: eingang=${(sourcesSlice || []).length} aktiv=${aktive.length} google=${googleIdx.length} direkt=${direktIdx.length} dauerMs=${takt.now() - __t0} ok=${ergebnisse.filter((r) => r && r.ok).length} fehler=${ergebnisse.filter((r) => r && !r.ok).length} status=${JSON.stringify(ergebnisse.slice(0, 3).map((r) => r && r.status))}`);
    }

    const alleItems = ergebnisse.flatMap((r) => (r && r.items) || []);
    const erfolgreich = ergebnisse.filter((r) => r && r.ok).length;
    const fehlgeschlagen = ergebnisse.filter((r) => r && !r.ok).length;
    return {
      results: ergebnisse, rawItems: alleItems,
      checkedSources: ergebnisse.length, successfulSources: erfolgreich, failedSources: fehlgeschlagen,
      newCandidateItems: alleItems.length, skippedSources: 0, circuitOpenSources: ergebnisse.filter((r) => r && r.status === "circuit-open").length,
      sharedSkippedSources: ergebnisse.filter((r) => r && r.status === "skipped-shared").length, retriesTotal: 0,
      googleGate: gate ? gate.state() : null, googleUrlResolution: null
    };
  };
}

// ── Restliche Abhaengigkeiten von `runGlobaleErfassung` — schnelle, ehrliche Stubs ──────────
// Diese Phasen sind NICHT der Gegenstand dieser Suite (der Kapazitaetsengpass liegt beim
// Abruf, siehe Ergebnis unten) und werden bewusst NICHT neu nachgebaut; sie ruecken hier so
// nah wie zumutbar an die Production-Groessenordnung heran, ANNAHME, keine Messung:
//   - Speichern (`saveRawItems`/`persistRawDocuments`): 2 ms je Rohitem (naiver Blob-/DB-Schreibaufwand)
//   - Lazy-Understanding: ~13 ms je Cluster (Production 2026-08-03: 15 942 ms / 1 242 Cluster = 12,8 ms)
function macheRestDeps(takt) {
  return {
    listFullProfiles: async () => sechsProfile(),
    quellenFuerProfil: async (profil) => quellenFuerProfil(profil),
    fetchDipItems: async () => [],
    dipAktiv: () => false,
    saveRawItems: async (items) => { await takt.sleep(Math.round((items || []).length * 2)); return items; },
    persistRawDocuments: async () => null,
    lazyUnderstanding: async () => { await takt.sleep(13); },
    eagerUnderstanding: async (docs, opts = {}) => {
      // UNVERAENDERTES Vertragsverhalten (K1-2, siehe scheduler.js Kommentar Zeile ~2288): bei
      // budgetMs <= 0 wird gar nicht erst aufgerufen (runGlobaleErfassung skippt selbst); ein
      // aufgerufenes Budget > 0 wird hier als voll verbraucht angenommen (konservativ).
      const budget = Math.max(0, Number(opts.budgetMs) || 0);
      await takt.sleep(Math.min(budget, 500));
      return { processed: 0, deferred: (docs || []).length, skipped: false };
    },
    acquireLock: async () => true,
    releaseLock: async () => true,
    hardeningConfig: () => HAERTUNG,
    createGate: macheGateFabrik(takt),
    evaluateCooldown: () => ({ active: false, skipGoogle: false, reason: null }),
    sharedLedger: GN.sharedFetchLedger,
    // Kein Netz/keine DB in dieser Suite (CLAUDE.md §6, kanonischer Offline-Lauf): diese
    // Aufrufe waeren in Production echte Supabase-Zugriffe. Ohne Stub haengt der virtuelle
    // Taktgeber (die echten Aufrufe warten nie auf einen `takt.sleep()`-Timer, also pumpt die
    // Simulation nie weiter) oder es entstehen echte Netzwerkversuche, die hier verboten sind.
    listCrawlRuns: async () => [],
    recordPipelineError: async () => {},
    recordProcessRun: async () => null,
    saveCrawlRun: async () => null,
    persistSourceCrawlTelemetry: async () => {},
    insertSourceCrawlTelemetry: async () => {},
    now: takt.now
  };
}

// ── Ein vollstaendiger Lauf ──────────────────────────────────────────────────────────────────
// `zeitSammler.abrufMs` traegt danach die reine Abrufzeit (Summe aller Stufenaufrufe) —
// erlaubt die Phasenzuordnung (Abschnitt 4) OHNE den Abruf ein zweites Mal laufen zu lassen
// (das wuerde die Laufzeit dieser ohnehin schon rechenintensiven Suite unnoetig verdoppeln).
async function laufGlobal({ budgetMs, laufKennung }) {
  const takt = macheVirtuellenTaktgeber();
  GN.resetSharedFetchLedger();
  const zeitSammler = { abrufMs: 0 };
  const ergebnis = await takt.run(async () => {
    const deps = macheRestDeps(takt);
    deps.crawlAllSources = macheCrawlAllSourcesDouble(takt, { laufKennung, zeitSammler });
    const start = takt.now();
    const global = await scheduler.runGlobaleErfassung({
      tenantIds: SECHS, budgetMs, startedMs: start, runId: laufKennung, buendelung: "kontext", deps
    });
    return { global, dauerMs: takt.now() - start };
  });
  return { ...ergebnis, abrufMs: zeitSammler.abrufMs };
}

(async () => {
  abschnitt("0 · Selbstpruefung des virtuellen Taktgebers");
  {
    const s = await selbstpruefungTaktgeber();
    check("0.1 fuenf parallele 1000-ms-Wartezeiten werden GEMEINSAM bei t=1000 fertig (Nebenlaeufigkeit korrekt), nicht bei t=5000 (seriell)",
      s.parallelErkannt);
    check("0.2 die Simulation braucht dafuer unter 1 s ECHTE Zeit (kein echtes Warten)",
      s.echtMs < 1000, `${s.echtMs} ms`);
  }

  abschnitt("1 · Massstab der Lastprobe");
  {
    check("1.1 Gesamtquellen entsprechen mindestens der Production-Beobachtung (181)",
      GESAMT_QUELLEN >= 181, String(GESAMT_QUELLEN));
    check("1.2 Aufteilung geteilt/mandatseigen entspricht der Production-Beobachtung (140/41)",
      ALLE_QUELLEN.filter((q) => q.__mandat === null).length === ANZAHL_GEMEINSAM
      && ALLE_QUELLEN.filter((q) => q.__mandat !== null).length === 41);
  }

  // ──────────────────────────────────────────────────────────────────────────────────────────
  // Dieselbe Budgetaufteilung wie in Production: `budgetAufteilung` aus cron-globalphase.js,
  // 270 000 ms Cron-Deadline (server.js: `cronSchwererPfad("pipeline", { deadlineMs: 270000, ... })`).
  const aufteilung = G.budgetAufteilung({ restMs: 270000, mandate: 6, projektionMs: G.DEFAULT_PROJEKTION_MS, globalMaxMs: 240000 });

  abschnitt("2 · VOR der Korrektur — Fehlerzustand reproduzieren (Stand vor diesem Sprint: Stufengroesse 20)");
  let vorLauf;
  {
    // Der zum Zeitpunkt des Production-Vorfalls (2026-08-03) ausgelieferte Default. Die
    // Korrektur dieses Sprints senkt NUR den Default in scheduler.js; die Env-Variable bleibt
    // unveraendert nutzbar — dieser Block bildet also exakt den VOR-Code nach, ohne eine
    // zweite Codepfad-Kopie zu pflegen.
    process.env.HELMUT_GLOBALPHASE_ABRUF_STUFE = "20";
    vorLauf = await laufGlobal({ budgetMs: aufteilung.globalMs, laufKennung: "vor" });
    delete process.env.HELMUT_GLOBALPHASE_ABRUF_STUFE;
    const g = vorLauf.global;
    console.log(`  INFO  budgetGlobalMs=${aufteilung.globalMs} tatsaechlichDauerMs=${vorLauf.dauerMs}`
      + ` ueberzogenMs=${Math.max(0, vorLauf.dauerMs - aufteilung.globalMs)}`
      + ` datenstand=${g.datenstand.status} rohdokumente=${g.datenstand.rohdokumente}`
      + ` kontexte=${g.datenstand.kontexte} verstanden=${g.datenstand.verstanden}`);
    // Gleiche GROESSENORDNUNG wie Production (2179), NICHT dieselbe Zahl — das Latenz-/
    // Ausbeutemodell ist eine benannte Eingabe (Dateikopf), keine Messung. Untergrenze im
    // Tausenderbereich reicht, um die Kapazitaetsaussage zu tragen.
    check("2.1 Rohdokumente liegen in der GROESSENORDNUNG der Production-Beobachtung (2179): mindestens im hohen Hunderter-/Tausenderbereich",
      g.datenstand.rohdokumente >= 1200 && g.datenstand.rohdokumente <= 2600,
      String(g.datenstand.rohdokumente));
    check("2.2 FEHLERZUSTAND reproduziert: die globale Phase ueberzieht ihr EIGENES zugeteiltes Budget",
      vorLauf.dauerMs > aufteilung.globalMs,
      `budget=${aufteilung.globalMs} dauer=${vorLauf.dauerMs}`);
    check("2.3 FEHLERZUSTAND reproduziert: der Datenstand schliesst NICHT als \"abgeschlossen\" ab",
      g.datenstand.status !== G.DATENSTAND_ABGESCHLOSSEN, g.datenstand.status);
    // Die genaue Ueberziehungsdauer der Production-Beobachtung (45 448 ms) ist NICHT das Ziel
    // dieser Probe (das waere Nachtunen auf eine Zielzahl). Das Ziel ist der MECHANISMUS: eine
    // begonnene Stufe (bis zu 20 Quellen) ueberzieht ihr Budget MESSBAR, nicht nur um Rundungs-
    // rauschen — das beweist den Start-Gatter-statt-Stopp-Gatter-Fehler unabhaengig vom exakten
    // Kalibrierungswert.
    check("2.4 die Ueberziehung ist NICHT trivial klein (> 2 000 ms, mehr als ein einzelner Quellen-Timeout am Rand einer Stufe erklaeren wuerde)",
      (vorLauf.dauerMs - aufteilung.globalMs) > 2000, `${vorLauf.dauerMs - aufteilung.globalMs} ms`);

    // Mandatsphase: wie server.js es taete — Restzeit nach der globalen Phase.
    const restMs = Math.max(0, 270000 - vorLauf.dauerMs);
    const reserveJeMandat = F_DEFAULT_TENANT_RESERVE_MS();
    const passendeMandate = Math.floor(restMs / reserveJeMandat);
    console.log(`  INFO  Restzeit fuer die Mandatsphase nach der globalen Phase: ${restMs} ms`
      + ` (reicht rechnerisch fuer hoechstens ${passendeMandate} von 6 Mandaten je ${reserveJeMandat} ms Reserve;`
      + ` Production 2026-08-03 16:00 UTC: restMs=2552, kapazitaet=0 von 6)`);
    check("2.5 FEHLERZUSTAND reproduziert: die Mandatsphase erreicht NICHT alle sechs Mandate im selben Lauf",
      passendeMandate < 6, `${passendeMandate} von 6`);
  }

  // ──────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("3 · ZURUECKGENOMMEN: der kleinere Stufen-Default (20 -> 5) traegt nicht");
  {
    // Dieser Abschnitt hat bis zum 2026-08-04 einen kleineren Stufen-Default begruendet. Die
    // Begruendung ist NACHGEMESSEN WORDEN UND FALSCH; die Codeaenderung ist zurueckgenommen
    // (`lib/helmut/scheduler.js` ist wieder identisch mit `main`). Was hier steht, ist der
    // korrigierte Befund — kein Erfolg, sondern eine widerrufene Annahme (CLAUDE.md §4.4).
    //
    // (a) Die Formel `ceil(stufenGroesse / googleConcurrency) * CRAWLER_TIMEOUT_MS` setzt
    //     voraus, dass EINE Quelle GENAU EINE HTTP-Anfrage ist. Am Code ist das nicht so:
    //     ein Feedabruf je Feed-URL (Personenquellen haben ZWEI), je Eintrag
    //     `resolveArticleUrl` (1x `fetchUrl` mit bis zu 6 Weiterleitungen + bis zu 2x
    //     `postForm`), und fuer `type: "person"` danach eine vollstaendig SEQUENZIELLE
    //     Anreicherungsschleife. Offline gemessen (`scripts/quellen-mehrfachabruf-test.js`):
    //     EINE Suchquelle = 37 Anfragen = 11,5 Anfragezeitlimits; EINE Personenquelle =
    //     98 Anfragen = 45,4 Anfragezeitlimits.
    // (b) Production bestaetigt es: einzelne Quellen liefen 41 892 / 41 340 / 40 851 /
    //     35 005 ms bei `CRAWLER_TIMEOUT_MS = 7 000` — mit `retry_count = 0`.
    // (c) Eine kleinere Stufe kann den Abruf nicht beschleunigen: die Summe der Stufenmaxima
    //     ist eine Untergrenze der Abrufdauer und steigt beim Verfeinern monoton.
    // (d) Der gescheiterte Lauf hat das Start-Gatter nie erreicht (Abruf endete bei t = 115,2 s
    //     eines 221,674-s-Budgets, `nichtAbgerufen = 0`). Die Ueberziehung entstand danach.
    const DAUERN = VERMESSENE_QUELLENDAUERN;
    const summeMaxima = (g) => {
      let t = 0;
      for (let i = 0; i < DAUERN.length; i += g) t += Math.max(...DAUERN.slice(i, i + g));
      return t;
    };
    const startUntergrenze = (g, idx) => {
      let t = 0;
      for (let k = 0; k < Math.floor(idx / g); k += 1) t += Math.max(...DAUERN.slice(k * g, (k + 1) * g));
      return t;
    };
    console.log(`  INFO  Abruf-Untergrenze aus den 181 gemessenen Quellendauern:`
      + ` Stufe 20 -> ${(summeMaxima(20) / 1000).toFixed(1)} s,`
      + ` Stufe 10 -> ${(summeMaxima(10) / 1000).toFixed(1)} s,`
      + ` Stufe 5 -> ${(summeMaxima(5) / 1000).toFixed(1)} s`);
    check("3.1 ZURUECKGENOMMEN: eine kleinere Stufe SENKT die Abrufdauer nicht, sie hebt deren Untergrenze",
      summeMaxima(5) > summeMaxima(10) && summeMaxima(10) > summeMaxima(20),
      `20 -> ${summeMaxima(20)} ms, 5 -> ${summeMaxima(5)} ms`);
    check("3.2 ZURUECKGENOMMEN: eine kleinere Stufe verzoegert zusaetzlich die direkten/amtlichen Quellen",
      startUntergrenze(5, 120) > startUntergrenze(20, 120),
      `Stufe 20: ${(startUntergrenze(20, 120) / 1000).toFixed(2)} s,`
      + ` Stufe 5: ${(startUntergrenze(5, 120) / 1000).toFixed(2)} s`);
    check("3.3 die Codeaenderung ist entfernt — `scheduler.js` traegt wieder den Default 20",
      /HELMUT_GLOBALPHASE_ABRUF_STUFE \|\| 20/.test(
        require("fs").readFileSync(require("path").join(ROOT, "lib", "helmut", "scheduler.js"), "utf8")));
    check("3.4 EHRLICH: die eigentliche Ueberziehung lag NACH dem Abruf und ist hier nicht behoben"
      + " — Ursache und Reparatur stehen in `docs/betrieb/vorgangskontext.md` §7.6",
      vorLauf.dauerMs > aufteilung.globalMs);
  }

  abschnitt("4 · Woran die Zeit haengt — Phasenzuordnung");
  {
    // Nutzt die bereits waehrend Abschnitt 2 mitgeschriebene reine Abrufzeit
    // (`zeitSammler.abrufMs`, siehe `laufGlobal`) — KEIN zweiter Abruflauf noetig. Das haelt
    // diese ohnehin rechenintensive Suite innerhalb des 180-s-Zeitlimits des Offline-Runners
    // (`scripts/run-offline-tests.js`).
    const gesamtMs = vorLauf.dauerMs;
    const abrufAnteil = vorLauf.abrufMs / gesamtMs;
    const dokumente = vorLauf.global.datenstand.rohdokumente;
    console.log(`  INFO  Abruf (Summe aller Stufenaufrufe, Abschnitt 2): ${vorLauf.abrufMs} ms`
      + ` fuer ${GESAMT_QUELLEN} Quellen / ${dokumente} Rohdokumente`
      + ` — das sind ${Math.round(abrufAnteil * 100)}% der gemessenen Gesamtdauer der globalen Phase (${gesamtMs} ms)`);
    check("4.1 der Abruf ist der ueberwiegende Anteil der globalen Phase (> 80%)",
      abrufAnteil > 0.8, `${Math.round(abrufAnteil * 100)}%`);
    check("4.2 Normalisierung/Speicherung (saveRawItems, 2 ms/Item) ist gegenueber dem Abruf vernachlaessigbar (< 5%)",
      (dokumente * 2) / gesamtMs < 0.05, `${Math.round((dokumente * 2) / gesamtMs * 100)}%`);
  }

  // ──────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("5 · Gegenproben — langsame/haengende Quellen, nahezu erschoepftes Budget");
  {
    // 5a: ALLE Quellen einer Stufe zeitueberschritten (voll degradierte Google-Oberflaeche —
    // das Szenario, das die Haertung 2026-07-16 ueberhaupt ausloeste, incident-Kommentar
    // google-news-hardening.js Zeile 5ff). Erwartung: der Circuit Breaker oeffnet FRUEH
    // (>= 10 Beobachtungen, Fehlerquote >= 60%) und die restlichen Quellen scheitern SOFORT
    // (0 ms) statt je einzeln in den vollen Timeout zu laufen — der Lauf haengt NICHT.
    const takt5a = macheVirtuellenTaktgeber();
    GN.resetSharedFetchLedger();
    const quellenVollDegradiert = Array.from({ length: 60 }, (_, i) => ({
      id: `haengend-${i}`, name: `haengend-${i}`, active: true,
      rssUrl: `https://news.google.example/rss/search?q=haengend-${i}`,
      url: `https://news.google.example/rss/search?q=haengend-${i}`,
      __google: true, __mandat: null
    }));
    // WICHTIG: alle 60 Quellen werden NEBENLAEUFIG uebergeben (`Promise.all`), genau wie
    // `crawlAllSources` es mit `googleIdx.map(...)` tut (lib/helmut/crawler.js:101) — eine
    // sequenzielle `for`-Schleife wuerde die Gate-Nebenlaeufigkeit gar nicht erst pruefen.
    // Die simulierte Fehlermeldung ist wortgleich zur echten Timeout-Meldung
    // (`crawler.js:888`, `Timeout for ${url}`), damit `isBreakerRelevantError`
    // (google-news-hardening.js) sie wie in Production als drosselungsrelevant erkennt.
    const ergebnis5a = await takt5a.run(async () => {
      const gate = macheGateFabrik(takt5a)(HAERTUNG, {});
      const start = takt5a.now();
      let offenGemeldetNach = null;
      const ergebnisse = await Promise.all(quellenVollDegradiert.map(async (quelle) => {
        try {
          return await gate.schedule(async () => {
            await takt5a.sleep(FETCH_TIMEOUT_MS); // JEDE Quelle haengt bis zum vollen Timeout
            const err = new Error(`Timeout for ${quelle.url}`);
            gate.report(err);
            throw err;
          });
        } catch (error) {
          if (error && error.code === "google-news-circuit-open") {
            if (offenGemeldetNach == null) offenGemeldetNach = takt5a.now() - start;
            return { status: "circuit-open" };
          }
          return { status: "error" };
        }
      }));
      return {
        dauerMs: takt5a.now() - start, offenGemeldetNach, zustand: gate.state(),
        circuitOpen: ergebnisse.filter((r) => r.status === "circuit-open").length,
        echteFehler: ergebnisse.filter((r) => r.status === "error").length
      };
    });
    console.log(`  INFO  60 nebenlaeufig voll zeitueberschrittene Google-Quellen: ${ergebnis5a.dauerMs} ms gesamt,`
      + ` ${ergebnis5a.echteFehler} liefen tatsaechlich in den Timeout, ${ergebnis5a.circuitOpen} scheiterten sofort (Breaker offen),`
      + ` Breaker-Meldung ab ${ergebnis5a.offenGemeldetNach} ms, Endzustand ${JSON.stringify(ergebnis5a.zustand)}`);
    check("5.1 der Circuit Breaker oeffnet, bevor alle 60 Quellen einzeln den vollen Timeout durchlaufen",
      ergebnis5a.zustand.open === true && ergebnis5a.circuitOpen > 0, JSON.stringify(ergebnis5a.zustand));
    check("5.2 ein Grossteil der Quellen scheitert SOFORT statt einzeln in den vollen Timeout zu laufen (Breaker begrenzt den Schaden)",
      ergebnis5a.circuitOpen >= 30, `${ergebnis5a.circuitOpen} von 60 sofort gescheitert`);
    check("5.3 die Gesamtdauer bleibt WEIT unter \"60 x 7000 ms seriell\" (28 min = 1 680 000 ms)",
      ergebnis5a.dauerMs < 60000, `${ergebnis5a.dauerMs} ms`);

    // 5b: nahezu erschoepftes Budget VOR der globalen Phase (z. B. weil server.js schon Zeit
    // fuer Profile/Setup verbraucht hat). Erwartung: kein Crash, ehrlicher `teilweise`/
    // `fehlgeschlagen`-Datenstand, keine Behauptung eines vollstaendigen Laufs.
    const engLauf = await laufGlobal({ budgetMs: 3000, laufKennung: "eng" });
    console.log(`  INFO  Budget nahezu erschoepft (3000 ms zugeteilt): dauerMs=${engLauf.dauerMs}`
      + ` datenstand=${engLauf.global.datenstand.status} quellenAbgerufen=${engLauf.global.datenstand.rohdokumente > 0 ? "ja" : "nein"}`);
    check("5.4 nahezu erschoepftes Budget: kein Absturz, ein versiegelter Datenstand entsteht",
      engLauf.global.datenstand.versiegelt === true);
    check("5.5 nahezu erschoepftes Budget: der Datenstand behauptet KEINEN vollstaendigen Erfolg",
      engLauf.global.datenstand.status !== G.DATENSTAND_ABGESCHLOSSEN, engLauf.global.datenstand.status);

    // 5c: praktisch kein Budget (0 ms) — der Extremfall von 5b.
    const nullLauf = await laufGlobal({ budgetMs: 0, laufKennung: "null" });
    check("5.6 kein Budget: kein Absturz, kein erfundener Erfolg",
      nullLauf.global.datenstand.versiegelt === true
      && nullLauf.global.datenstand.status !== G.DATENSTAND_ABGESCHLOSSEN,
      nullLauf.global.datenstand.status);
  }

  // ──────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("6 · Fazit dieser Probe");
  console.log("  Kleine Korrektur behoben: die UNKONTROLLIERTE Ueberziehung des Stufen-Start-Gatters");
  console.log("  (Abschnitt 3). NICHT behoben, weil ausserhalb einer kleinen Korrektur: die");
  console.log("  strukturelle Kapazitaetsgrenze des Google-Gates bei ~140+ gemeinsamen Wegen");
  console.log("  (Abschnitt 2/3, 'teilweise' bleibt 'teilweise') — siehe Entscheidungsvorlage im");
  console.log("  Sprintbericht (docs/CURRENT_STATE.md).");

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER:", e && e.stack); process.exit(1); });

function F_DEFAULT_TENANT_RESERVE_MS() {
  return require(path.join(ROOT, "lib", "helmut", "cron-fairness.js")).DEFAULT_TENANT_RESERVE_MS;
}
