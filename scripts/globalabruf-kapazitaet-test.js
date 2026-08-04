"use strict";

// Helmut — Testsuite OP-25 K2.1: KAPAZITAET des globalen Abrufpfads.
// =============================================================================================
// ANLASS (Production, belegt — nicht vermutet): der erste regulaere Wirkungslauf des globalen
// Abrufpfads (`/api/cron/pipeline`, 2026-08-03 16:00 UTC, Lauf
// `cron-pipeline-20260803160002-xm71n`) ist am Kapazitaetsnachweis gescheitert:
//
//   [cron/pipeline/globalphase] 267122ms status=teilweise quellen=181 rohdokumente=2179
//                               verstanden=0 budgetGlobalMs=221674 reserveMs=48000 restMs=2552
//   [cron/pipeline] Zeitbudget erschoepft — 6 von 6 Mandaten NICHT verarbeitet.
//
// ZERLEGUNG DER 267 s (aus `source_crawl_telemetry`, `raw_documents.created_at`,
// `document_findings.created_at`, `process_runs` und den Vercel-Runtime-Logs desselben Laufs;
// alle Zeiten relativ zum Start der globalen Phase 16:00:02.895 UTC):
//
//   Vorlauf (Sperre, 6 Profile, 6 Quellenplaene, Cooldown-Vorlauf)        3,10 s    1,2 %
//   Quellenabruf, 181 Quellen in 10 Stufen a 20                         112,11 s   42,0 %
//   DIP (6 Profile) + saveRawItems + Bestandsabruf + Dedup-Plan           5,41 s    2,0 %
//   raw_documents: 616 EINZELNE Upserts                                  89,89 s   33,6 %
//   document_findings (1 Bulk) + finding_count: ~108 x (GET+PATCH)       34,85 s   13,1 %
//   Lazy-Understanding: 14 Stapel geclustert, 1242 Cluster, 0 verarbeitet 15,94 s    6,0 %
//   Eager-Understanding (uebersprungen, Grund `zeitbudget`)               0,00 s    0,0 %
//   Lauftelemetrie + 181 Quellen-Telemetriezeilen                         5,19 s    1,9 %
//                                                                      --------
//                                                                       267,12 s
//
// HAUPTURSACHE, in einem Satz: 124,74 s (46,7 %) des Laufs sind SEQUENZIELLE
// EINZELZEILEN-ROUND-TRIPS gegen PostgREST — 834 Requests a ~149,6 ms —, obwohl derselbe
// Schreibpfad Bulk-Writes bereits kann und sie fuer `document_findings` in derselben Funktion
// auch benutzt. Die globale Phase ueberzog ihr Budget (221,674 s) um 45,45 s und verbrauchte
// damit die Mandatsreserve (48 s) vollstaendig: es blieben 2,552 s, die Fairnessschleife
// braucht je Mandat 15 s Vorlaufreserve — deshalb 0 von 6.
//
// WAS DIESE SUITE TUT:
//   1  Laufzeitvertrag        — die Zahlen des Vertrags am Code festgenagelt, nicht behauptet.
//   2  Schreibpfad            — der ECHTE Schreibpfad gegen 2 179 Dokumente, Round-Trips
//                               gezaehlt und mit simulierter Latenz bewertet.
//   3  Altkostenmodell        — REPRODUKTION des Fehlers: ein Request je Dokument ergibt
//                               267 s, restMs < Mandatsreserve, 0 von 6 Mandaten.
//   4  Heutiger Code          — derselbe Ablauf mit dem heutigen Schreibpfad.
//   5  Mandatsphase           — alle sechs Mandate durch die UNVERAENDERTE Fairnessschleife.
//   6  Ehrlichkeit            — ein teilweiser Lauf gilt nie als abgeschlossen.
//   7  Doppelarbeit           — keine Clusterbildung ohne Budget.
//
// Offline, deterministisch, ohne Netz, ohne KI, ohne Production-Daten. Die Zeit wird
// KONTROLLIERT simuliert (gemessene Production-Latenzen als Eingabe), die ZAHL der Operationen
// und die Ablaufstruktur stammen aus dem echten Produktionscode.
//
// GRENZE DIESER SUITE, ausdruecklich: der Quellenabruf wird mit den GEMESSENEN Stufenspannen des
// Production-Laufs verrechnet, nicht aus Gate-Parametern nachgebildet. Das ist fuer die
// Kapazitaetsaussage der genauere Weg (es ist der echte Netzaufwand), heisst aber auch: diese
// Suite bemerkt KEINE Regression, die die Nebenlaeufigkeit des Abrufs veraendert
// (`HELMUT_GOOGLE_CONCURRENCY`, `HELMUT_GOOGLE_MIN_SPACING_MS`, `CRAWLER_TIMEOUT_MS`,
// `HELMUT_GLOBALPHASE_ABRUF_STUFE`). Wer daran etwas aendert, braucht dafuer einen eigenen
// Nachweis. Zur Stufengroesse gibt es eine harte, datenunabhaengige Schranke, die hier in
// Abschnitt 1 mitgeprueft wird: eine Stufe wartet auf ihre langsamste Quelle, also ist
// `Summe der Stufenmaxima` eine Untergrenze der Abrufdauer — und diese Summe kann beim
// VERKLEINERN der Stufe nie sinken (`max(A ∪ B) <= max(A) + max(B)`). Am gescheiterten Lauf
// gemessen: Stufe 20 -> 71,3 s · Stufe 10 -> 90,2 s · Stufe 5 -> 153,0 s.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Der Schreibpfad liest Flag + Konfiguration beim Aufruf aus `process.env`. Beides muss VOR dem
// ersten `require` der Ablage stehen. Die Werte sind Testwerte, keine Geheimnisse: das Netz ist
// durch den Fetch-Ersatz unten vollstaendig abgeschnitten (CLAUDE.md §4.7).
process.env.HELMUT_V3_STORE = "on";
process.env.HELMUT_SOURCE_MODE = "on";
process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-test-kein-geheimnis";
process.env.HELMUT_GOOGLE_HARDENING = "off";
delete process.env.HELMUT_CRON_GLOBALPHASE;
delete process.env.HELMUT_CRON_GLOBALABRUF;

const G = require(path.join(ROOT, "lib", "helmut", "cron-globalphase.js"));
const F = require(path.join(ROOT, "lib", "helmut", "cron-fairness.js"));
const storage = require(path.join(ROOT, "lib", "helmut", "storage.js"));
const scheduler = require(path.join(ROOT, "lib", "helmut", "scheduler.js"));
const dedupGlobal = require(path.join(ROOT, "lib", "helmut", "quellenarchitektur", "dedup-global.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }
function s(ms) { return `${(ms / 1000).toFixed(2)} s`; }

// ── Gemessene Production-Eingaben ────────────────────────────────────────────────────────────
// EINGABEN, keine Ergebnisse dieser Suite. Jede Zeile traegt ihre Herkunft. Die Suite MISST
// daraus nur die Zahl der Arbeitsschritte und rechnet sie zusammen — Messung und Rechnung
// bleiben getrennt.
const P = {
  // aus `source_crawl_telemetry` desselben Laufs, Stufenspannen bei Stufengroesse 20:
  abrufStufenMs: [5760, 4570, 5750, 6170, 5670, 5020, 5280, 7710, 53050, 13120],
  vorlaufMs: 3100,          // Start der globalen Phase -> erster Quellenabruf
  dipUndSpeichernMs: 5410,  // letzter Quellenabruf -> erster raw_documents-Insert
  // 124 740 ms / 834 Requests = 149,6 ms. Deckt Netzweg + PostgREST + Postgres je Round-Trip.
  roundTripMs: 150,
  clusterAufschlagMs: 15940, // [globalphase] lazy-understanding 15942ms, 1242 Cluster, 0 verarbeitet
  lazyJeClusterMs: 150,      // Annahme (uebernommen aus scripts/cron-globalphase-test.js)
  telemetrieMs: 5190,        // Eager-Ende -> Versiegelung (saveCrawlRun + 181 Telemetriezeilen)
  matchingMs: 1100,          // PRODUCTION GEMESSEN (matching_runs): 1 041 / 1 074 ms
  entscheidungenMs: 400,     // Annahme
  mandatsTelemetrieMs: 150,  // Annahme
  quellen: 181,              // [globalphase] Quellen vereinigt: gesamt=181 gemeinsam=140 mandatseigen=41
  alleMandate: 133,          // Quellen, die JEDES Mandat erhaelt -> 1 Kontext
  teilmengen: 7,             // Quellen fuer echte Teilmengen (Partei/Region/Ausschuss) -> 7 Kontexte
  dokumente: 2179,           // [globalphase/kontext] dokumente=2179
  mandate: 6,
  kontexte: 14               // [globalphase/kontext] kontexte=14 geteilt=8 mandatseigen=6 unbekannt=0
};

// Die 181 GEMESSENEN Quellendauern des gescheiterten Laufs, in der Reihenfolge des Laufs
// (`source_crawl_telemetry`, `run_id = cron-pipeline-20260803160002-xm71n-global`, sortiert nach
// `started_at`). Summe 391 303 ms, Maximum 41 892 ms, Mittel 2 162 ms. Rohdaten, keine Annahme —
// sie tragen die Stufenrechnung in Abschnitt 1 und machen sie nachrechenbar.
const QUELLENDAUERN = [
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

// Struktur des Dedup-Plans desselben Laufs: 2 179 Rohitems -> 724 zusammengefuehrte Dokumente,
// davon 616 neu (`raw_documents`-Inserts) und 108 Bestandstreffer (`finding_count`-Erhoehung);
// 724 Fundstellen (eine Bulk-Zeile). Die Suite baut Testdaten, die GENAU diesen Plan erzeugen,
// damit die gemessene Zahl der Round-Trips die Production-Zahl abbildet.
const PLAN = { dokumente: 724, neu: 616, bestandstreffer: 108, fundstellen: 724 };

// ── Uhr ──────────────────────────────────────────────────────────────────────────────────────
// HYBRID: sie laeuft mit der ECHTEN Zeit (damit realer CPU-Aufwand des Produktionscodes —
// Zusammenfuehrung, Dedup, Kontextplanung, Vertragsriegel — mitgezaehlt wird) UND nimmt
// zusaetzlich ausdrueckliche Aufschlaege fuer simulierte IO-Latenzen. Beides ist benannt; nichts
// wird geschoent.
const ECHTES_NOW = Date.now;
let uhrBasisReal = 0;
let uhrBasisFake = 0;
let uhrAufschlag = 0;
function uhrStart(startMs) {
  uhrBasisReal = ECHTES_NOW();
  uhrBasisFake = startMs;
  uhrAufschlag = 0;
}
function jetzt() { return uhrBasisFake + uhrAufschlag + (ECHTES_NOW() - uhrBasisReal); }
function berechne(ms) { uhrAufschlag += Math.max(0, Number(ms) || 0); }

// ── Fetch-Ersatz: zaehlt Round-Trips und verrechnet je Request die gemessene Latenz ─────────
// KEIN Netz: jeder Aufruf wird lokal beantwortet. Der Ersatz kennt genau die Endpunkte, die der
// Schreibpfad benutzt; ein unbekannter Endpunkt ist ein FEHLER (fail closed), damit ein
// stillschweigend neuer Request nicht unbemerkt bleibt.
const ECHTES_FETCH = global.fetch;
const requestLog = [];
let bestandsAntwort = [];
let findingCountBestand = new Map();

function antwort(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    text: () => Promise.resolve(body == null ? "" : JSON.stringify(body))
  });
}

function installFetchErsatz() {
  requestLog.length = 0;
  global.fetch = (url, options = {}) => {
    const method = String((options && options.method) || "GET").toUpperCase();
    const endpoint = String(url).replace("http://127.0.0.1:9", "");
    requestLog.push({ method, endpoint });
    berechne(P.roundTripMs);

    // 1) Bestandsabruf vor dem Dedup-Plan
    if (method === "GET" && /^\/rest\/v1\/raw_documents\?select=id,content_fingerprint/.test(endpoint)) {
      return antwort(bestandsAntwort);
    }
    // 2) finding_count lesen — Einzelform (Altcode) UND Mengenform (heutiger Code)
    if (method === "GET" && /^\/rest\/v1\/raw_documents\?id=(eq|in)\./.test(endpoint)) {
      const ids = idsAusFilter(endpoint);
      return antwort(ids.map((id) => ({ id, finding_count: findingCountBestand.get(id) || 0 })));
    }
    // 3) raw_documents schreiben (Einzel-Upsert wie Bulk-Upsert laufen ueber denselben Endpunkt)
    if (method === "POST" && /^\/rest\/v1\/raw_documents\?on_conflict=id/.test(endpoint)) {
      const rows = JSON.parse(String(options.body || "[]"));
      return antwort(Array.isArray(rows) ? rows : [rows]);
    }
    // 4) finding_count schreiben
    if (method === "PATCH" && /^\/rest\/v1\/raw_documents\?id=(eq|in)\./.test(endpoint)) {
      const ids = idsAusFilter(endpoint);
      return antwort(ids.map((id) => ({ id })));
    }
    // 5) Fundstellen
    if (method === "POST" && /^\/rest\/v1\/document_findings/.test(endpoint)) {
      return antwort(null, 204);
    }
    return Promise.reject(new Error(`Fetch-Ersatz: unbekannter Endpunkt ${method} ${endpoint}`));
  };
}

function idsAusFilter(endpoint) {
  const eq = /[?&]id=eq\.([^&]+)/.exec(endpoint);
  if (eq) return [decodeURIComponent(eq[1])];
  const inFilter = /[?&]id=in\.\(([^)]*)\)/.exec(endpoint);
  if (!inFilter) return [];
  return inFilter[1].split(",").map((v) => decodeURIComponent(v.trim().replace(/^"|"$/g, ""))).filter(Boolean);
}

function requestsSeit(marke) { return requestLog.length - marke; }

// ── Welt: 6 Mandate, 181 Quellen, 2 179 Rohitems ────────────────────────────────────────────
// Mandatskennungen sind neutrale Testkennungen (CLAUDE.md §4.2: kein realer Mandant im Code).
const MANDATE = ["mandat-a", "mandat-b", "mandat-c", "mandat-d", "mandat-e", "mandat-f"];

function profil(id) {
  return { id, fullName: `Testmandat ${id}`, party: "TP", faction: "TP", committee: "Test", topics: ["Test"] };
}
const PROFILE = MANDATE.map(profil);

// Quellenwelt mit der SICHTBARKEITSSTRUKTUR des Production-Laufs (kontexte=14):
//   133 Quellen fuer ALLE sechs Mandate            -> 1 geteilter Kontext
//     7 Quellen fuer je eine echte Teilmenge       -> 7 geteilte Kontexte
//    41 mandatseigene Quellen (5 x 7 + 1 x 6)      -> 6 mandatseigene Kontexte
//   ------------------------------------------------------------------------
//   181 Quellen, davon 140 von mehr als einem Mandat angefordert (= `gemeinsam`)
const TEILMENGEN = [[0, 1], [0, 2], [1, 2], [3, 4], [3, 5], [4, 5], [0, 1, 2, 3]];

function eigeneQuellenAnzahl(index) { return index === MANDATE.length - 1 ? 6 : 7; }

function quellenFuerProfil(profile) {
  const index = MANDATE.indexOf(String(profile.id));
  const alle = Array.from({ length: P.alleMandate }, (_, i) => ({
    id: `alle-${i}`, name: `Bundesquelle ${i}`, active: true, url: `https://bund${i}.example.org/rss`
  }));
  const teilmengen = TEILMENGEN
    .map((mandate, i) => ({ mandate, i }))
    .filter(({ mandate }) => mandate.includes(index))
    .map(({ i }) => ({ id: `teil-${i}`, name: `Teilmengenquelle ${i}`, active: true, url: `https://teil${i}.example.org/rss` }));
  const eigene = Array.from({ length: eigeneQuellenAnzahl(index) }, (_, i) => ({
    id: `${profile.id}-news-${i}`, name: `Eigene Quelle ${i} (${profile.id})`, active: true,
    url: `https://${profile.id}-${i}.example.org/rss`
  }));
  return [...alle, ...teilmengen, ...eigene];
}

// Alle 181 Quellenkennungen in der Reihenfolge der Vereinigungsmenge.
function alleQuellenIds() {
  const ids = [];
  for (const p of PROFILE) for (const q of quellenFuerProfil(p)) if (!ids.includes(q.id)) ids.push(q.id);
  return ids;
}

// 2 179 Rohitems, die den Dedup-Plan des Production-Laufs erzeugen:
//   724 Stories; jede Story mehrfach ueber DENSELBEN Abrufweg gefunden. `dedupeRawDocuments`
//   fuehrt sie ueber den content_hash auf 724 Zeilen zusammen (-> genau EINE Fundstelle je
//   Story, wie in Production: 724 Fundstellen bei 2 179 Rohitems); die ersten 108 Stories
//   liegen bereits im Bestand (-> finding_count-Erhoehung), die uebrigen 616 sind neu.
// Jede Story traegt einen EIGENEN Titelwortschatz: damit kann die Titelaehnlichkeitsregel (C)
// keine zwei Stories zusammenziehen und der Plan bleibt exakt reproduzierbar.
// Die Stories werden reihum ueber ALLE 181 Quellen verteilt — jeder der 14 Kontexte bekommt
// dadurch Dokumente.
function baueRohitems() {
  const quellen = alleQuellenIds();
  const items = [];
  const proStory = new Array(PLAN.dokumente).fill(3);
  for (let i = 0; i < P.dokumente - 3 * PLAN.dokumente; i += 1) proStory[i] += 1;
  for (let j = 0; j < PLAN.dokumente; j += 1) {
    const quelleId = quellen[j % quellen.length];
    const url = `https://p${j}.example.org/artikel-${j}`;
    for (let k = 0; k < proStory[j]; k += 1) {
      items.push({
        id: `item-${j}-${k}`,
        hash: `hash-${j}-${k}`,
        title: `Alpha${j} Beta${j} Gamma${j} Delta${j}`,
        summary: `Epsilon${j} Zeta${j} Eta${j}.`,
        url,
        originalUrl: url,
        sourceId: quelleId,
        sourceName: `Quelle ${quelleId}`,
        linkType: "direct",
        confidence: "high",
        publishedAt: "2026-08-03T06:00:00.000Z",
        retrievedAt: "2026-08-03T16:00:00.000Z"
      });
    }
  }
  return items;
}

// Bestand: die ersten 108 Stories existieren bereits (Match ueber content_fingerprint).
function baueBestand(items) {
  const proStory = new Map();
  for (const it of items) {
    const j = Number(String(it.id).split("-")[1]);
    if (!proStory.has(j)) proStory.set(j, it);
  }
  const bestand = [];
  findingCountBestand = new Map();
  for (let j = 0; j < PLAN.bestandstreffer; j += 1) {
    const id = `bestand-${j}`;
    bestand.push({
      id,
      content_fingerprint: dedupGlobal.fingerprint(proStory.get(j)),
      canonical_target_url: null
    });
    findingCountBestand.set(id, 1);
  }
  return bestand;
}

const ROHITEMS = baueRohitems();

// ── Testdoubles fuer die globale Phase ───────────────────────────────────────────────────────
// Alles, was Netz/DB/KI braucht, wird ersetzt UND verrechnet. Der Schreibpfad
// (`persistRawDocuments`) wird ABSICHTLICH NICHT ersetzt: genau er ist der Messgegenstand und
// laeuft als echter Produktionscode gegen den Fetch-Ersatz.
function baueDeps(protokoll) {
  return {
    now: jetzt,
    listFullProfiles: async () => {
      // Die Clusterbildung (`clusterRawDocuments`) liegt INNERHALB von `runGlobaleErfassung` und
      // ist nicht injizierbar. Ihr in Production gemessener Anteil wird deshalb an der
      // unmittelbar davorliegenden Dep-Grenze verrechnet — dem zweiten `listFullProfiles`-Aufruf
      // aus dem Lazy-Block. Benannt statt versteckt; die Rechnung wird dadurch KONSERVATIV
      // (sie belastet den Lauf auch dann, wenn der Code die Clusterbildung spaeter ueberspringt).
      protokoll.profilAufrufe += 1;
      if (protokoll.profilAufrufe === 1) berechne(0);
      else berechne(P.clusterAufschlagMs);
      return PROFILE;
    },
    quellenFuerProfil,
    crawlAllSources: async (quellen) => {
      const stufe = protokoll.abrufStufen;
      protokoll.abrufStufen += 1;
      protokoll.abgerufeneQuellen += quellen.length;
      berechne(P.abrufStufenMs[stufe] != null
        ? P.abrufStufenMs[stufe]
        : Math.round(P.abrufStufenMs.reduce((a, b) => a + b, 0) / P.quellen) * quellen.length);
      const von = protokoll.ausgelieferteItems;
      const bis = Math.min(ROHITEMS.length, Math.round((protokoll.abgerufeneQuellen / P.quellen) * ROHITEMS.length));
      protokoll.ausgelieferteItems = bis;
      return {
        results: quellen.map((q) => ({ sourceId: q.id, sourceName: q.name, ok: true, itemCount: 0, items: [], durationMs: 0, retryCount: 0, status: "ok" })),
        rawItems: ROHITEMS.slice(von, bis),
        checkedSources: quellen.length, successfulSources: quellen.length, failedSources: 0,
        newCandidateItems: bis - von, skippedSources: 0, circuitOpenSources: 0,
        sharedSkippedSources: 0, retriesTotal: 0, googleGate: null, googleUrlResolution: null
      };
    },
    dipAktiv: () => false,
    fetchDipItems: async () => [],
    saveRawItems: async (items) => { berechne(P.dipUndSpeichernMs); return items; },
    lazyUnderstanding: async () => { berechne(P.lazyJeClusterMs); protokoll.lazyAufrufe += 1; },
    eagerUnderstanding: async (dokumente, opts = {}) => {
      protokoll.eagerAufrufe += 1;
      const budget = Math.max(0, Number(opts.budgetMs) || 0);
      berechne(Math.min(budget, 2000));
      return { skipped: false, processed: 1, deferred: 0, counts: {} };
    },
    matching: async () => { berechne(P.matchingMs); return { ok: true }; },
    decisions: async () => { berechne(P.entscheidungenMs); return { ok: true }; },
    getActiveProfile: async (id) => profil(id),
    // Der globale Laufdatensatz kostet in Production 5,19 s (Lauf + 181 Quellen-Telemetriezeilen),
    // ein Mandatsdatensatz ist eine einzelne Zeile.
    saveCrawlRun: async (run) => {
      berechne(run && run.mode === "global" ? P.telemetrieMs : P.mandatsTelemetrieMs);
      protokoll.laeufe.push(run);
      return run;
    },
    listCrawlRuns: async () => [],
    recordProcessRun: async () => ({ ok: true }),
    recordPipelineError: async () => ({ ok: true }),
    acquireLock: async (name) => { protokoll.sperren.push(name); return true; },
    releaseLock: async (name) => { protokoll.freigaben.push(name); },
    hardeningConfig: () => ({ enabled: false }),
    createGate: () => null,
    evaluateCooldown: () => ({ active: false, skipGoogle: false, reason: null }),
    sharedLedger: () => null,
    persistSourceCrawlTelemetry: async () => ({ ok: true }),
    insertSourceCrawlTelemetry: async () => ({ ok: true })
  };
}

function neuesProtokoll() {
  return {
    abrufStufen: 0, abgerufeneQuellen: 0, ausgelieferteItems: 0,
    profilAufrufe: 0, lazyAufrufe: 0, eagerAufrufe: 0,
    laeufe: [], sperren: [], freigaben: []
  };
}

// EIN vollstaendiger schwerer Cronlauf: globale Phase, danach die Mandatsphase durch die
// UNVERAENDERTE Fairnessschleife `cron-fairness.runTenantsFairly` — genau die Schleife, die
// `server.js` (`runCronForTenants`) benutzt. Die Budgetaufteilung stammt aus dem echten
// `cron-globalphase.budgetAufteilung`, die Reserve je Mandat aus `cron-fairness`.
async function laufeSchwererCron({ deadlineMs = 270000, altkostenmodell = false } = {}) {
  const startMs = Date.parse("2026-08-03T16:00:02.895Z");
  uhrStart(startMs);
  Date.now = jetzt;
  installFetchErsatz();
  bestandsAntwort = baueBestand(ROHITEMS);

  const protokoll = neuesProtokoll();
  const aufteilung = G.budgetAufteilung({
    restMs: deadlineMs,
    mandate: MANDATE.length,
    projektionMs: G.projektionsBudgetMs(),
    globalMaxMs: Number(process.env.HELMUT_CRAWL_GESAMTBUDGET_MS || 240000)
  });

  const deps = baueDeps(protokoll);
  if (altkostenmodell) {
    // REPRODUKTION DES GESCHEITERTEN LAUFS: der Schreibpfad, wie er sich in Production
    // verhalten hat — EIN Round-Trip je neuem Dokument plus zwei je Bestandstreffer.
    // Kein Aufruf des heutigen Codes; das Kostenmodell ist die gemessene Production-Struktur.
    deps.persistRawDocuments = async (items) => {
      const requests = 1 + PLAN.neu + 1 + 2 * PLAN.bestandstreffer;
      berechne(requests * P.roundTripMs);
      protokoll.altRequests = requests;
      return { persisted: PLAN.neu, deduped: items.length, candidates: items.length };
    };
  }

  const globalStart = jetzt();
  const requestMarke = requestLog.length;
  const global = await scheduler.runGlobaleErfassung({
    tenantIds: MANDATE,
    budgetMs: aufteilung.globalMs,
    startedMs: globalStart,
    runId: "test-global",
    buendelung: "kontext",
    deps
  });
  const globalDauerMs = jetzt() - globalStart;
  const schreibRequests = altkostenmodell ? protokoll.altRequests : requestsSeit(requestMarke);
  const datenstand = global && global.datenstand;

  const restMs = Math.max(0, (startMs + deadlineMs) - jetzt());
  let mandatsErgebnis = { erfolgreich: [], begonnen: [] };
  if (G.datenstandVerwendbar(datenstand)) {
    const zusammenfassung = await F.runTenantsFairly({
      cronName: "pipeline",
      tenantIds: MANDATE,
      perTenant: (tenantId) => scheduler.runMandatsProjektion(tenantId, datenstand, { ausloeser: "pipeline", deps }),
      runId: "test-lauf",
      deadlineMs: restMs,
      startedMs: jetzt(),
      now: jetzt,
      loadState: async () => ({}),
      saveState: async () => {}
    });
    mandatsErgebnis = {
      erfolgreich: (zusammenfassung.results || []).filter((r) => r && r.ok !== false && !r.skipped).map((r) => r.tenantId || r.politicianId),
      begonnen: zusammenfassung.begonnen || [],
      zusammenfassung
    };
  }

  const gesamtMs = jetzt() - startMs;
  Date.now = ECHTES_NOW;
  global.fetch = ECHTES_FETCH;
  return { aufteilung, datenstand, globalDauerMs, gesamtMs, restMs, schreibRequests, protokoll, mandatsErgebnis };
}

(async () => {
  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("1 · Laufzeitvertrag (am Code festgenagelt)");
  {
    const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    check("1.1 aeusseres Zeitlimit beider schwerer Crons ist 270 000 ms",
      (serverSrc.match(/cronSchwererPfad\("(?:crawl|pipeline)", \{ deadlineMs: 270000,/g) || []).length === 2);
    check("1.2 die globale Phase bekommt hoechstens HELMUT_CRAWL_GESAMTBUDGET_MS (240 000 ms)",
      /globalMaxMs: Number\(process\.env\.HELMUT_CRAWL_GESAMTBUDGET_MS \|\| 240000\)/.test(serverSrc));

    const a = G.budgetAufteilung({ restMs: 270000, mandate: 6, projektionMs: G.DEFAULT_PROJEKTION_MS, globalMaxMs: 240000 });
    check("1.3 bei 6 Mandaten teilt der Vertrag 221 674 ms +/- Rundung global und 48 000 ms Reserve zu",
      a.globalMs === 222000 && a.projektionsReserveMs === 48000, `globalMs=${a.globalMs} reserve=${a.projektionsReserveMs}`);
    check("1.4 die Reserve je Mandat ist 8 000 ms (Projektion) — Production gemessen: Matching ~1,1 s",
      G.DEFAULT_PROJEKTION_MS === 8000);
    check("1.5 die Fairnessschleife beginnt ein Mandat nur mit 15 000 ms Vorlaufreserve",
      F.DEFAULT_TENANT_RESERVE_MS === 15000);
    check("1.6 der Production-Lauf blieb mit restMs=2 552 unter dieser Vorlaufreserve — deshalb 0 von 6",
      2552 < F.DEFAULT_TENANT_RESERVE_MS);
    check("1.7 nur ein VOLLSTAENDIGER Datenstand gilt als frisch",
      G.datenstandFrisch({ versiegelt: true, status: G.DATENSTAND_ABGESCHLOSSEN }) === true
      && G.datenstandFrisch({ versiegelt: true, status: G.DATENSTAND_TEILWEISE }) === false);
    check("1.8 ein teilweiser Datenstand bleibt projizierbar, ein fehlgeschlagener nicht",
      G.datenstandVerwendbar({ versiegelt: true, status: G.DATENSTAND_TEILWEISE }) === true
      && G.datenstandVerwendbar({ versiegelt: true, status: G.DATENSTAND_FEHLGESCHLAGEN }) === false);

    // Untergrenze der Abrufdauer je Stufengroesse: eine Stufe wartet auf ihre langsamste Quelle,
    // also ist die SUMME der Stufenmaxima eine untere Schranke. Sie kann beim Verkleinern der
    // Stufe nie sinken — `max(A ∪ B) <= max(A) + max(B)`. Gerechnet auf den gemessenen
    // Quellendauern des gescheiterten Laufs; die Reihenfolge ist die des Laufs.
    const summeStufenmaxima = (groesse) => {
      let summe = 0;
      for (let i = 0; i < QUELLENDAUERN.length; i += groesse) {
        summe += Math.max(...QUELLENDAUERN.slice(i, i + groesse));
      }
      return summe;
    };
    const u20 = summeStufenmaxima(20);
    const u10 = summeStufenmaxima(10);
    const u5 = summeStufenmaxima(5);
    console.log(`  [Messung] Untergrenze des Abrufs je Stufengroesse: 20 -> ${s(u20)},`
      + ` 10 -> ${s(u10)}, 5 -> ${s(u5)} (gemessen wurden ${s(112110)})`);
    check("1.9 eine KLEINERE Abrufstufe kann die Abrufdauer nie senken — sie hebt die Untergrenze",
      u5 >= u10 && u10 >= u20, `${s(u20)} / ${s(u10)} / ${s(u5)}`);
    check("1.10 die heutige Stufengroesse 20 hat die niedrigste dieser Untergrenzen",
      u20 === Math.min(u20, u10, u5));
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("2 · Schreibpfad: Round-Trips am ECHTEN Code, Production-Groessenordnung");
  let schreibMessung = null;
  {
    uhrStart(Date.parse("2026-08-03T16:00:00.000Z"));
    const echtesNow = Date.now;
    Date.now = jetzt;
    installFetchErsatz();
    bestandsAntwort = baueBestand(ROHITEMS);

    // Der ECHTE Schreibpfad des Crawls, inklusive `toRawDocumentRow`, `dedupeRawDocuments`
    // und `persistRawDocumentsDeduped` — kein Testdouble dazwischen.
    const t0 = jetzt();
    const ergebnis = await scheduler.persistRawDocumentsShadow(ROHITEMS, { runId: "test-schreibpfad" });
    const dauerMs = jetzt() - t0;
    Date.now = echtesNow;
    global.fetch = ECHTES_FETCH;
    schreibMessung = { ergebnis, dauerMs, requests: requestLog.length };

    console.log(`  [Messung] ${P.dokumente} Rohitems -> ${ergebnis.persisted} neue Dokumente,`
      + ` ${ergebnis.bestandsTreffer} Bestandstreffer, ${ergebnis.fundstellen} Fundstellen`);
    console.log(`  [Messung] ${requestLog.length} Round-Trips, simuliert ${s(dauerMs)}`
      + ` (Production 2026-08-03: 834 Round-Trips, 124,74 s)`);

    check("2.1 der Testbestand erzeugt den Dedup-Plan des Production-Laufs (616 neu, 108 Bestandstreffer)",
      ergebnis.persisted === PLAN.neu && ergebnis.bestandsTreffer === PLAN.bestandstreffer,
      `persisted=${ergebnis.persisted} bestand=${ergebnis.bestandsTreffer}`);
    check("2.2 alle 2 179 Rohitems sind verrechnet — kein Dokument geht still verloren",
      ergebnis.persisted + ergebnis.bestandsTreffer === PLAN.dokumente
      && ergebnis.fundstellen === PLAN.fundstellen,
      `${ergebnis.persisted}+${ergebnis.bestandsTreffer} fundstellen=${ergebnis.fundstellen}`);
    check("2.3 der Schreibpfad braucht hoechstens 20 Round-Trips fuer 2 179 Dokumente"
      + " (Production-Altstand: 834)",
      requestLog.length <= 20, `${requestLog.length} Round-Trips`);
    check("2.4 der Schreibpfad bleibt damit unter 5 s (Production-Altstand: 124,74 s)",
      dauerMs <= 5000, s(dauerMs));
    check("2.5 kein unbekannter Endpunkt — der Schreibweg ist vollstaendig bekannt",
      requestLog.every((r) => /raw_documents|document_findings/.test(r.endpoint)));
    check("2.6 die Fundstellen gehen als GENAU EIN Bulk-Write hinaus",
      requestLog.filter((r) => /document_findings/.test(r.endpoint)).length === 1);
    check("2.7 der Bestandsabruf vor dem Dedup-Plan bleibt genau ein Request",
      requestLog.filter((r) => r.method === "GET" && /select=id,content_fingerprint/.test(r.endpoint)).length === 1);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("3 · REPRODUKTION des gescheiterten Laufs (Altkostenmodell: ein Request je Dokument)");
  let alt = null;
  {
    alt = await laufeSchwererCron({ altkostenmodell: true });
    console.log(`  [Messung] globale Phase ${s(alt.globalDauerMs)} bei Budget ${s(alt.aufteilung.globalMs)},`
      + ` Schreibpfad ${alt.schreibRequests} Round-Trips, restMs ${s(alt.restMs)}`);
    console.log(`  [Messung] Production 2026-08-03: 267,12 s / Budget 221,67 s / restMs 2,55 s`);

    check("3.1 die globale Phase ueberzieht ihr Budget", alt.globalDauerMs > alt.aufteilung.globalMs,
      `${s(alt.globalDauerMs)} > ${s(alt.aufteilung.globalMs)}`);
    check("3.2 sie landet in der Groessenordnung des Production-Laufs (240–290 s)",
      alt.globalDauerMs >= 240000 && alt.globalDauerMs <= 290000, s(alt.globalDauerMs));
    check("3.3 die Mandatsreserve ist aufgebraucht — restMs unter der Vorlaufreserve von 15 s",
      alt.restMs < F.DEFAULT_TENANT_RESERVE_MS, s(alt.restMs));
    check("3.4 0 von 6 Mandaten werden verarbeitet",
      alt.mandatsErgebnis.erfolgreich.length === 0, `${alt.mandatsErgebnis.erfolgreich.length}`);
    check("3.5 der Datenstand ist NICHT abgeschlossen (kein falsches Gruen)",
      alt.datenstand.status !== G.DATENSTAND_ABGESCHLOSSEN && alt.datenstand.budgetErschoepft === true,
      alt.datenstand.status);
    check("3.6 die Quellen wurden dabei vollstaendig abgerufen — der Fehler liegt NICHT im Abruf",
      alt.protokoll.abgerufeneQuellen === P.quellen, `${alt.protokoll.abgerufeneQuellen}`);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("4 · Derselbe Lauf mit dem heutigen Schreibpfad");
  let neu = null;
  {
    neu = await laufeSchwererCron({});
    console.log(`  [Messung] globale Phase ${s(neu.globalDauerMs)} bei Budget ${s(neu.aufteilung.globalMs)},`
      + ` Schreibpfad ${neu.schreibRequests} Round-Trips, restMs ${s(neu.restMs)},`
      + ` Gesamtlauf ${s(neu.gesamtMs)}`);

    check("4.1 die globale Phase bleibt in ihrem Budget",
      neu.globalDauerMs <= neu.aufteilung.globalMs,
      `${s(neu.globalDauerMs)} > ${s(neu.aufteilung.globalMs)}`);
    // Die globale Phase wird NICHT einfach um die volle Ersparnis kuerzer: die gewonnene Zeit
    // faellt dem Verstehen zu, das im gescheiterten Lauf gar nicht mehr lief (lazy 0 Cluster,
    // eager `zeitbudget`). Gemessen wird deshalb der Block, der die Ursache trug.
    check("4.2 die Persistenz ist um mindestens 100 s schneller als im Altkostenmodell",
      alt.datenstand.phasen.persistenzMs - neu.datenstand.phasen.persistenzMs >= 100000,
      `${s(alt.datenstand.phasen.persistenzMs)} -> ${s(neu.datenstand.phasen.persistenzMs)}`);
    check("4.2b im gescheiterten Lauf lief das Verstehen gar nicht, jetzt schon",
      alt.datenstand.verstanden === 0 && neu.datenstand.verstanden > 0,
      `alt=${alt.datenstand.verstanden} neu=${neu.datenstand.verstanden}`);
    check("4.3 der Schreibpfad braucht hoechstens 20 statt 834 Round-Trips",
      neu.schreibRequests <= 20, `${neu.schreibRequests}`);
    check("4.4 alle 181 Quellen werden abgerufen — keine stille Reduktion",
      neu.protokoll.abgerufeneQuellen === P.quellen && neu.datenstand.quellen === P.quellen,
      `abgerufen=${neu.protokoll.abgerufeneQuellen} datenstand=${neu.datenstand.quellen}`);
    check("4.5 alle 2 179 Dokumente sind im Datenstand — keine stille Reduktion",
      neu.datenstand.rohdokumente === P.dokumente, `${neu.datenstand.rohdokumente}`);
    check("4.6 der Gesamtlauf bleibt unter dem aeusseren Zeitlimit von 270 s",
      neu.gesamtMs < 270000, s(neu.gesamtMs));
    check("4.7 nach der globalen Phase bleibt eine belastbare Reserve (>= 30 s)",
      neu.restMs >= 30000, s(neu.restMs));
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("5 · Mandatsphase: alle sechs Mandate durch die unveraenderte Fairnessschleife");
  {
    check("5.1 alle sechs Mandate werden vollstaendig verarbeitet",
      neu.mandatsErgebnis.erfolgreich.length === MANDATE.length,
      `${neu.mandatsErgebnis.erfolgreich.length} von ${MANDATE.length}`);
    check("5.2 jedes Mandat genau einmal — keine Doppelverarbeitung",
      new Set(neu.mandatsErgebnis.erfolgreich).size === MANDATE.length);
    check("5.3 jede Mandatssperre wird erworben und wieder freigegeben",
      MANDATE.every((m) => neu.protokoll.sperren.includes(`crawl-${m}`) && neu.protokoll.freigaben.includes(`crawl-${m}`)));
    check("5.4 die Sperre der globalen Phase wird genau einmal erworben und freigegeben",
      neu.protokoll.sperren.filter((n) => n === scheduler.GLOBALPHASE_LOCK).length === 1
      && neu.protokoll.freigaben.filter((n) => n === scheduler.GLOBALPHASE_LOCK).length === 1);
    check("5.5 die Mandatsphase schreibt je Mandat genau einen Laufdatensatz `mode: \"mandat\"`",
      neu.protokoll.laeufe.filter((r) => r && r.mode === "mandat").length === MANDATE.length);
    check("5.6 die globale Phase schreibt genau EINEN mandantenneutralen Laufdatensatz",
      neu.protokoll.laeufe.filter((r) => r && r.mode === "global" && r.politicianId === null).length === 1);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("6 · Ehrlichkeit: ein teilweiser Lauf gilt nie als abgeschlossen");
  let knappLauf = null;
  {
    knappLauf = await laufeSchwererCron({ deadlineMs: 130000 });
    const knapp = knappLauf;
    console.log(`  [Messung] knappes Zeitlimit 130 s: globale Phase ${s(knapp.globalDauerMs)},`
      + ` Status ${knapp.datenstand.status}, abgerufen ${knapp.protokoll.abgerufeneQuellen} Quellen`);
    check("6.1 bei zu knappem Zeitlimit bricht der Abruf ab und der Datenstand ist NICHT abgeschlossen",
      knapp.datenstand.status !== G.DATENSTAND_ABGESCHLOSSEN, knapp.datenstand.status);
    check("6.2 der Abbruch wird benannt statt verschwiegen",
      knapp.datenstand.budgetErschoepft === true || (knapp.datenstand.fehler || []).length > 0);
    check("6.3 ein nicht abgeschlossener Datenstand gilt nie als frisch",
      G.datenstandFrisch(knapp.datenstand) === false);
    check("6.4 ein versiegelter Datenstand laesst sich nicht nachtraeglich heben",
      G.datenstandVersiegeln(knapp.datenstand, { nowMs: jetzt(), status: G.DATENSTAND_ABGESCHLOSSEN }).status
      === knapp.datenstand.status);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("7 · Doppelarbeit: keine Clusterbildung ohne Budget");
  {
    const src = fs.readFileSync(path.join(ROOT, "lib", "helmut", "scheduler.js"), "utf8");
    const lazyBlock = /for \(const \[index, teil\] of stapel\.entries\(\)\) \{[\s\S]*?clusterRawDocuments/.exec(src);
    check("7.1 die Stapelschleife prueft das Restbudget VOR der Clusterbildung",
      Boolean(lazyBlock) && /verbleibendMs\(\) <= 0/.test(lazyBlock[0]),
      "in Production wurden 1 242 Cluster gebildet und 0 verarbeitet (15,94 s reine Doppelarbeit)");
    // Wirkungsnachweis statt Quelltextlesen: bei erschoepftem Budget wird kein Stapel geclustert.
    check("7.1b bei erschoepftem Budget wird KEIN Stapel mehr geclustert",
      knappLauf.datenstand.lazy.cluster === 0
      && knappLauf.datenstand.lazy.uebersprungeneStapel === P.kontexte,
      JSON.stringify(knappLauf.datenstand.lazy));
    check("7.1c die uebersprungenen Dokumente werden benannt, nicht verschwiegen",
      knappLauf.datenstand.lazy.uebersprungeneDokumente === knappLauf.datenstand.rohdokumente,
      `${knappLauf.datenstand.lazy.uebersprungeneDokumente} von ${knappLauf.datenstand.rohdokumente}`);
    check("7.1d bei ausreichendem Budget wird weiterhin geclustert und verstanden",
      neu.datenstand.lazy.cluster > 0 && neu.datenstand.lazy.verarbeitet > 0
      && neu.datenstand.lazy.uebersprungeneStapel === 0,
      JSON.stringify(neu.datenstand.lazy));
    check("7.2 ein uebersprungener Stapel wird gezaehlt und macht den Datenstand teilweise",
      /lazyUebersprungeneStapel/.test(src) && /budgetErschoepft:[\s\S]{0,200}lazyUebersprungeneStapel/.test(src));
    check("7.3 der Datenstand weist die Kontexte des Laufs aus (Partition bleibt sichtbar)",
      neu.datenstand.kontexte === P.kontexte, `kontexte=${neu.datenstand.kontexte}`);
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  if (!fail) {
    console.log("Der globale Abruf bleibt in seinem Budget, alle sechs Mandate werden verarbeitet,");
    console.log("alle 181 Quellen und 2 179 Dokumente bleiben enthalten, ein teilweiser Lauf bleibt teilweise.");
  }
  Date.now = ECHTES_NOW;
  global.fetch = ECHTES_FETCH;
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  Date.now = ECHTES_NOW;
  global.fetch = ECHTES_FETCH;
  console.error("TESTFEHLER:", e && e.stack);
  process.exit(1);
});
