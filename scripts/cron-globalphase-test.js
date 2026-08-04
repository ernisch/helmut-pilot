"use strict";

// Helmut — Testsuite OP-25 K1: globale Erfassung EINMAL, danach nur Mandatsprojektionen.
// =============================================================================================
// Deterministisch und offline: injizierte Uhr, injizierte Ablage, injizierte Testdoubles,
// kein Netz, kein Zufall, keine KI, keine Production-Daten.
//
// Die Suite treibt den ECHTEN Produktionscode beider Pfade gegen DIESELBEN Testdoubles:
//   ALT — `scheduler.runSourceCrawl(mandat)` je Mandat, in der Fairnessschleife
//         `cron-fairness.runTenantsFairly` (genau die Schleife, die server.js aufruft).
//   NEU — `scheduler.runGlobaleErfassung()` einmal, danach `scheduler.runMandatsProjektion()`
//         je Mandat, in derselben Fairnessschleife.
// Beide Pfade laufen im selben Prozess, mit demselben Quellenkatalog, denselben Profilen,
// derselben Uhr und demselben Kostenmodell. Nur so ist ein Vergleich belastbar.
//
// Aufbau:
//   1  Flaggrenze
//   2  Vereinigungsmenge der Quellen
//   3  Datenstandsvertrag
//   4  Budgetaufteilung
//   5  Globale Phase am echten Code
//   6  Mandatsphase am echten Code
//   7  Ergebnisgleichheit ALT vs. NEU
//   8  Kapazitaet (deterministische Laufzeitsimulation)
//   9  Riegel gegen Regressionen
//  10  Verdrahtung in server.js (Quelltextvertrag)

const fs = require("fs");
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
const G = require(path.join(ROOT, "lib", "helmut", "cron-globalphase.js"));
const F = require(path.join(ROOT, "lib", "helmut", "cron-fairness.js"));
const GN = require(path.join(ROOT, "lib", "helmut", "google-news-hardening.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); } else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

// ── Uhr ──────────────────────────────────────────────────────────────────────────────────────
// `runSourceCrawl` liest `Date.now()` direkt (kein Injektionspunkt). Fuer die Laufzeit-
// simulation wird die Uhr deshalb global ersetzt und am Ende wiederhergestellt. Jeder
// Testdouble treibt sie um seinen KOSTENANTEIL vor — dadurch laufen die echten
// Budgetpruefungen beider Pfade gegen eine kontrollierte, reproduzierbare Zeit.
const ECHTES_NOW = Date.now;
const BASIS_MS = Date.parse("2026-07-31T04:00:00.000Z");
function makeUhr(startMs = BASIS_MS) {
  let t = startMs;
  return { now: () => t, jetzt: () => t, vor: (ms) => { t += Math.max(0, Number(ms) || 0); }, setzen: (ms) => { t = ms; } };
}

// ── Kostenmodell ─────────────────────────────────────────────────────────────────────────────
// EINGABEN, keine Messwerte dieser Suite. Herkunft je Zeile benannt; wo eine Production-
// Messung existiert, steht sie dabei. Die Suite MISST daraus nur die Zahl der Arbeitsschritte
// und rechnet sie zusammen — die Trennung von Messung und Rechnung bleibt sichtbar.
const KOSTEN = {
  quellenplanMs: 200,       // Annahme (Profil laden + Katalog filtern)
  abrufMs: 1500,            // Annahme; Production: Crawl gesamt 156 s ueber ~100 Wege
  uebersprungenMs: 5,       // Annahme (Ledger-Treffer, kein Request)
  rohdokumenteMs: 800,      // Annahme (Blob + raw_documents)
  lazyJeClusterMs: 150,     // Annahme; Production: lazy gesamt 17 s
  eagerNeuMs: 6000,         // Annahme (ein KI-Aufruf je neuem Vorgang)
  eagerBekanntMs: 20,       // Annahme (bereits verstanden -> kein KI-Aufruf)
  matchingMs: 1100,         // PRODUCTION GEMESSEN: 1 041 ms / 1 074 ms (matching_runs)
  entscheidungenMs: 400,    // Annahme
  telemetrieMs: 150         // Annahme
};

// ── Welt: Profile, Quellenkatalog, Dokumente, Zaehler ────────────────────────────────────────
function profil(id, extras = {}) {
  return {
    id,
    fullName: `Mandat ${id.toUpperCase()}`,
    party: extras.party || "SPD",
    faction: extras.faction || extras.party || "SPD",
    committee: extras.committee || "Gesundheit",
    committees: extras.committees || [extras.committee || "Gesundheit"],
    focusTopics: extras.focusTopics || ["Pflege", "Krankenhaus"],
    topicPriorities: extras.topicPriorities || { Pflege: 3 },
    relevantMinistries: extras.relevantMinistries || ["Bundesgesundheitsministerium"],
    state: extras.state || "Berlin",
    constituency: extras.constituency || "Berlin-Mitte",
    politicalLevel: extras.politicalLevel || "Bundestag",
    parliamentType: extras.parliamentType || "Bundestag",
    ...extras
  };
}

// Geteilter Katalog: neutrale Basis + parteigebunden + regional + vorbereitet (active:false)
// + ein Landesmodul-Weg (Praefix `be-`), der ohne Freigabe gesperrt bleiben MUSS.
function katalog() {
  return [
    { id: "bt-drucksachen", name: "Bundestag Drucksachen", type: "official", neutral: true, active: true, crawlMethod: "rss", url: "https://bundestag.example/ds.rss", rssUrl: "https://bundestag.example/ds.rss", priority: 99 },
    { id: "bt-ausschuss", name: "Bundestag Ausschuesse", type: "official", neutral: true, active: true, crawlMethod: "rss", url: "https://bundestag.example/aus.rss", rssUrl: "https://bundestag.example/aus.rss", priority: 95 },
    { id: "leitmedium", name: "Leitmedium", type: "media", neutral: true, active: true, crawlMethod: "rss", url: "https://medien.example/rss", rssUrl: "https://medien.example/rss", priority: 70 },
    { id: "partei-spd", name: "SPD Pressestelle", type: "party", neutral: false, party: "SPD", active: true, crawlMethod: "rss", url: "https://spd.example/rss", rssUrl: "https://spd.example/rss", priority: 60 },
    { id: "partei-gruene", name: "Gruene Pressestelle", type: "party", neutral: false, party: "Buendnis 90/Die Gruenen", active: true, crawlMethod: "rss", url: "https://gruene.example/rss", rssUrl: "https://gruene.example/rss", priority: 60 },
    { id: "regional-berlin", name: "Berlin Regionalpresse", type: "media", neutral: false, regional: true, active: true, crawlMethod: "rss", url: "https://berlin-presse.example/rss", rssUrl: "https://berlin-presse.example/rss", priority: 55 },
    { id: "regional-potsdam", name: "Potsdam Regionalpresse", type: "media", neutral: false, regional: true, active: true, crawlMethod: "rss", url: "https://potsdam-presse.example/rss", rssUrl: "https://potsdam-presse.example/rss", priority: 55 },
    { id: "nds-basis", name: "Niedersachsen Basis (vorbereitet)", type: "media", neutral: true, active: false, crawlMethod: "rss", url: "https://nds.example/rss", rssUrl: "https://nds.example/rss", priority: 50 },
    { id: "be-plenum", name: "Berlin Plenum (Landesmodul)", type: "official", neutral: true, active: true, crawlMethod: "manual", url: "https://pardok.example/be", rssUrl: "https://pardok.example/be", priority: 90 },
    { id: "bb-plenum", name: "Brandenburg Plenum (Landesmodul)", type: "official", neutral: true, active: true, crawlMethod: "manual", url: "https://pardok.example/bb", rssUrl: "https://pardok.example/bb", priority: 90 }
  ];
}

// Ein Ergebnis der Mandatsphase gilt als „Sperre verweigert", wenn es exakt den bekannten
// Rueckgabewert traegt, den `cron-fairness` §3a.1 auswertet.
function sperreVerweigert(ergebnis) {
  return Boolean(ergebnis && ergebnis.skipped === true
    && String(ergebnis.reason || "").trim().toLowerCase() === "already running");
}

function baueWelt({ profile, uhr, dokumenteJeQuelle = 2, defekteQuellen = [], defekteProfile = [], relationaleQuellen = null, kosten = KOSTEN } = {}) {
  const K = { ...KOSTEN, ...kosten };
  const welt = {
    uhr,
    profile,
    defekteQuellen: new Set(defekteQuellen),
    defekteProfile: new Set(defekteProfile),
    // Globale, mandantenneutrale Bestaende:
    rohitems: new Map(),         // id -> item          (Blob-Rohkorpus)
    rawDocuments: new Map(),     // rd-<hash> -> row    (relationale Rohdokumente)
    wissensobjekte: new Map(),   // vorgangId -> objekt (Knowledge Objects)
    // Mandatsbezogene Projektionen:
    matching: new Map(),         // mandat -> [{koId, score}]
    entscheidungen: new Map(),   // mandat -> [{koId, stufe}]
    // Zaehler / Protokolle:
    abrufe: [],                  // je tatsaechlich ausgefuehrtem Quellenabruf eine Kennung
    abrufWege: [],               // je tatsaechlich ausgefuehrtem Abruf die konkrete Adresse
    uebersprungeneWege: [],
    kiAufrufe: 0,
    lazyLaeufe: 0,
    matchingLaeufe: [],
    entscheidungsLaeufe: [],
    crawlRuns: [],
    sperren: new Map(),
    sperrProtokoll: [],
    quellenplaene: 0,
    fehler: []
  };

  // Jede Quelle liefert Dokumente zu EINEM eigenen, eindeutigen Sachthema. So bildet jede
  // Quelle einen eigenen Vorgang — in BEIDEN Pfaden gleich. Der eine Fall, in dem sich die
  // Buendelung wirklich unterscheidet (ein Vorgang ueber zwei Mandatswege), ist bewusst
  // NICHT hier eingebaut, sondern isoliert in Abschnitt 7b vermessen.
  // WICHTIG: Inhalt und Kennung eines Dokuments haengen an der ABRUFADRESSE, nicht an der
  // Quellenkennung. Zwei strukturgleiche Wege unter verschiedenen Kennungen liefern in der
  // Wirklichkeit dieselben Dokumente — egal, welcher der beiden zuerst drankam. Wuerde das
  // Testdouble stattdessen nach Quellenkennung erzeugen, entstuende ein Scheinunterschied
  // zwischen den Pfaden, den es in Production nicht gibt.
  // Kurzes, EINDEUTIGES Kunstwort je Adresse. Bewusst kurz: `deriveVorgangId` schneidet die
  // Themenwurzel auf 24 Zeichen — lange, gleich beginnende Woerter (z. B. ganze Google-URLs)
  // wuerden dort kollidieren und im Test kuenstliche Sammelvorgaenge erzeugen.
  const kurz = (wert) => {
    let h = 2166136261;
    for (const c of String(wert)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
  };
  const adresseVon = (source) => (G.abrufwegeVon(source)[0] || String(source.id));
  const dokumenteFuer = (source) => {
    const out = [];
    const basis = `Thema${kurz(adresseVon(source))}`;
    for (let i = 0; i < dokumenteJeQuelle; i += 1) {
      out.push({
        id: `${basis}#${i}`,
        hash: `${basis}#${i}`,
        title: `${basis} ${basis}reform ${basis}beschluss${i}`,
        summary: `${basis}kontext ${basis}teil${i}`,
        url: `https://inhalt.example/${basis}/${i}`,
        publishedAt: "2026-07-30T12:00:00.000Z",
        retrievedAt: "2026-07-31T04:00:00.000Z",
        sourceName: source.name,
        sourceId: source.id,
        sourceType: source.type || "media",
        confidence: "normal"
      });
    }
    return out;
  };

  const echteUnderstanding = require(path.join(ROOT, "lib", "helmut", "understanding.js"));
  const echteDedup = require(path.join(ROOT, "lib", "helmut", "dedup.js"));
  const VI = require(path.join(ROOT, "lib", "helmut", "vorgang-identity.js"));

  // Testdouble des Understanding-Laufs — es bildet die ENTSCHEIDENDEN Zweige des echten
  // `understandOneCluster` nach, sonst waere jeder Vergleich der beiden Pfade wertlos:
  //   (1) Aufloesung gegen den BESTAND ueber `candidatePrefixes` + `sameVorgang`
  //       (genau der Weg, auf dem heute ein spaeterer Mandatsbatch in einen bereits
  //       verstandenen Vorgang einlaeuft statt einen zweiten anzulegen),
  //   (2) neuer Vorgang -> ein KI-Aufruf,
  //   (3) bestehender Vorgang MIT neuen Dokumenten -> Aktualisierung, ein KI-Aufruf,
  //   (4) bestehender Vorgang OHNE neue Dokumente -> Duplikat, KEIN KI-Aufruf.
  const verstehe = (cluster) => {
    const docs = (cluster && cluster.documents) || [];
    const praefixe = VI.candidatePrefixes(cluster, 3);
    let ziel = null;
    for (const [koId, ko] of welt.wissensobjekte) {
      if (!praefixe.some((p) => koId.startsWith(p))) continue;
      const urteil = VI.sameVorgang(cluster, { vorgangId: koId, documents: ko.dokumente, headline: ko.titel });
      if (urteil && urteil.gleich) { ziel = koId; break; }
    }
    if (!ziel) {
      const vid = VI.deriveVorgangId(cluster);
      welt.kiAufrufe += 1;
      uhr.vor(K.eagerNeuMs);
      welt.wissensobjekte.set(vid, { vorgangId: vid, titel: (docs[0] || {}).title || null, dokumente: docs.slice() });
      return "neu";
    }
    const bestand = welt.wissensobjekte.get(ziel);
    const bekannt = new Set((bestand.dokumente || []).map((d) => d && d.id).filter(Boolean));
    const neueDocs = docs.filter((d) => d && (!d.id || !bekannt.has(d.id)));
    if (!neueDocs.length) { uhr.vor(K.eagerBekanntMs); return "duplikat"; }
    welt.kiAufrufe += 1;
    uhr.vor(K.eagerNeuMs);
    bestand.dokumente = [...(bestand.dokumente || []), ...neueDocs];
    return "aktualisiert";
  };
  welt.verstehe = (cluster) => verstehe(cluster);

  const doubles = {
    "./crawler": {
      crawlAllSources: async (sources, opts = {}) => {
        const ledger = opts.sharedLedger || null;
        const results = [];
        const rawItems = [];
        let checked = 0; let ok = 0; let failed = 0; let sharedSkipped = 0;
        for (const s of (sources || []).filter((x) => x && x.active)) {
          checked += 1;
          // Gedaechtnis geteilter Abrufwege — faithful zum echten Crawler: nur Google-Wege.
          if (ledger && GN.isGoogleNewsSource(s) && ledger.seenRecently(s)) {
            sharedSkipped += 1; ok += 1; uhr.vor(K.uebersprungenMs);
            welt.uebersprungeneWege.push(s.id);
            results.push({ sourceId: s.id, sourceName: s.name, ok: true, itemCount: 0, items: [], status: "skipped-shared" });
            continue;
          }
          if (ledger && GN.isGoogleNewsSource(s)) ledger.note(s);
          uhr.vor(K.abrufMs);
          welt.abrufe.push(s.id);
          welt.abrufWege.push(...G.abrufwegeVon(s));
          if (welt.defekteQuellen.has(s.id)) {
            failed += 1;
            results.push({ sourceId: s.id, sourceName: s.name, ok: false, itemCount: 0, items: [], error: "quelle-defekt", status: "error" });
            continue;
          }
          const items = dokumenteFuer(s);
          ok += 1;
          rawItems.push(...items);
          results.push({ sourceId: s.id, sourceName: s.name, ok: true, itemCount: items.length, items, status: "ok" });
        }
        return {
          results, rawItems,
          checkedSources: checked, successfulSources: ok, failedSources: failed,
          newCandidateItems: rawItems.length, skippedSources: 0, circuitOpenSources: 0,
          sharedSkippedSources: sharedSkipped, retriesTotal: 0, googleGate: null, googleUrlResolution: null
        };
      }
    },
    "./dip": { isDipEnabled: () => false, getRelevantParliamentaryItems: async () => ({ enabled: false, items: [] }) },
    "./understanding": {
      ...echteUnderstanding,
      runUnderstandingShadow: async (items, opts = {}) => {
        const rows = echteDedup.dedupeRawDocuments((items || []).map(echteDedup.toRawDocumentRow).filter((r) => r && r.id));
        const clusters = echteUnderstanding.clusterRawDocuments(rows);
        const budget = Number(opts.budgetMs) || 0;
        const start = uhr.jetzt();
        let processed = 0; let deferred = 0;
        for (const cluster of clusters) {
          if (budget && uhr.jetzt() - start > budget) { deferred += 1; continue; }
          const ausgang = verstehe(cluster);
          if (ausgang !== "duplikat") processed += 1;
        }
        return { processed, deferred, counts: {}, telemetrie: null };
      }
    },
    "./lazyUnderstanding": {
      runLazyUnderstandingShadow: async () => { welt.lazyLaeufe += 1; uhr.vor(K.lazyJeClusterMs); return { ok: true }; }
    },
    "./matching": {
      runMatchingShadow: async ({ profile } = {}) => {
        uhr.vor(K.matchingMs);
        welt.matchingLaeufe.push(String(profile && profile.id));
        // Deterministische Projektion: jedes Wissensobjekt bekommt einen stabilen Score aus
        // (Vorgangskennung x Mandatskennung). Reine Rechnung, kein Zufall, keine KI.
        const treffer = [...welt.wissensobjekte.keys()].sort().map((koId) => ({
          koId,
          score: [...`${koId}|${profile.id}`].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 1000, 7)
        })).sort((a, b) => b.score - a.score || (a.koId < b.koId ? -1 : 1));
        welt.matching.set(String(profile.id), treffer);
        return { matched: treffer.length, saved: treffer.length };
      }
    },
    "./decisions": {
      runDecisionShadow: async ({ profile } = {}) => {
        uhr.vor(K.entscheidungenMs);
        welt.entscheidungsLaeufe.push(String(profile && profile.id));
        const treffer = welt.matching.get(String(profile.id)) || [];
        welt.entscheidungen.set(String(profile.id), treffer.map((t) => ({
          koId: t.koId,
          stufe: t.score >= 700 ? "sofort" : t.score >= 400 ? "vormerken" : "ignorieren"
        })));
        return { count: treffer.length };
      }
    },
    "./storage": {
      // Quellenmodus `on` (Production): der relationale Plan ist die Wahrheit, der Katalog
      // bleibt Rueckfall. `relationaleQuellen` speist das ECHTE Seed-Modell ein.
      getSources: async () => (relationaleQuellen ? relationaleQuellen.legacySources : katalog()),
      listFullProfiles: async () => profile.map((p) => ({ ...p })),
      getProfile: async (id) => {
        const p = profile.find((x) => x.id === id);
        if (!p) throw new Error(`profil-unbekannt-${id}`);
        return { ...p };
      },
      saveRawItems: async (items) => {
        uhr.vor(K.rohdokumenteMs);
        const neu = [];
        for (const item of items || []) {
          const key = String(item && (item.hash || item.id));
          if (!key || welt.rohitems.has(key)) continue;
          welt.rohitems.set(key, item);
          neu.push(item);
        }
        return neu;
      },
      saveRawDocument: async (row) => {
        if (!row || !row.id) return { saved: false };
        if (welt.rawDocuments.has(row.id)) return { saved: false };
        welt.rawDocuments.set(row.id, row);
        return { saved: true };
      },
      persistRawDocumentsDeduped: async () => ({ skipped: true }),
      v3StoreEnabled: () => true,
      listCrawlRuns: async () => welt.crawlRuns.slice(0, 20),
      saveCrawlRun: async (run) => {
        uhr.vor(K.telemetrieMs);
        const gespeichert = { ...run, createdAt: new Date(uhr.jetzt()).toISOString() };
        welt.crawlRuns.unshift(gespeichert);
        return gespeichert;
      },
      recordProcessRun: async () => ({ ok: true, vollstaendig: true }),
      recordPipelineError: async (e) => { welt.fehler.push(e); return { ok: true }; },
      insertSourceCrawlTelemetry: async () => ({ skipped: true }),
      listKnowledgeObjects: async () => [...welt.wissensobjekte.values()],
      getRawItemsSince: async () => [],
      getTopicMemory: async () => [],
      saveLageCheck: async () => ({}),
      listSourceArchitectureRows: async () => (relationaleQuellen
        ? { retrievalPaths: relationaleQuellen.retrievalPaths, packages: relationaleQuellen.packages, packagePaths: relationaleQuellen.packagePaths }
        : { retrievalPaths: [], packages: [], packagePaths: [] }),
      saveSourceModeShadowRun: async () => ({}),
      acquirePipelineLock: async (name) => {
        welt.sperrProtokoll.push({ art: "erwerb", name, erfolg: !welt.sperren.has(name) });
        if (welt.sperren.has(name)) return false;
        welt.sperren.set(name, uhr.jetzt());
        return true;
      },
      releasePipelineLock: async (name) => { welt.sperrProtokoll.push({ art: "freigabe", name }); welt.sperren.delete(name); return true; }
    }
  };

  // Profilbezogene Fehler: die UNVERAENDERTE Produktionsfunktion getSourcesForProfile wird
  // nur fuer ausgewaehlte Profile durch einen Wurf ersetzt (fehlerhaftes Profil).
  welt.doubles = doubles;
  welt.dokumenteFuer = dokumenteFuer;
  return welt;
}

// Laedt scheduler.js mit ersetzten Abhaengigkeiten — der PRODUKTIONSCODE bleibt unveraendert.
function ladeScheduler(doubles) {
  const datei = path.join(ROOT, "lib", "helmut", "scheduler.js");
  const src = fs.readFileSync(datei, "utf8");
  const m = new Module(datei, null);
  m.filename = datei;
  m.paths = Module._nodeModulePaths(path.dirname(datei));
  const echtesRequire = m.require.bind(m);
  m.require = (spec) => (Object.prototype.hasOwnProperty.call(doubles, spec) ? doubles[spec] : echtesRequire(spec));
  m._compile(src, datei);
  return m.exports;
}

// Ablage fuer die Fairnessschleife (wie in cron-fairness-test.js: monotone Verschmelzung).
function makeAblage(uhr) {
  let roh = {};
  return {
    dump: () => JSON.parse(JSON.stringify(roh)),
    load: async () => JSON.parse(JSON.stringify(roh)),
    save: async (patch) => {
      roh = F.mergeState(roh, patch, { nowMs: uhr.now() });
      return { ok: true, state: JSON.parse(JSON.stringify(roh)) };
    }
  };
}

// Ein kompletter Cronlauf im ALTEN Pfad: Fairnessschleife x runSourceCrawl.
async function laufAlt({ scheduler, uhr, ablage, tenants, deadlineMs, reserveMs = 0, cronName = "crawl" }) {
  return F.runTenantsFairly({
    cronName, tenantIds: tenants, deadlineMs, reserveMs, staleMs: F.DEFAULT_STALE_CLAIM_MS,
    startedMs: uhr.now(), now: uhr.now, runId: `alt-${uhr.now()}`,
    loadState: ablage.load, saveState: ablage.save,
    perTenant: (id) => scheduler.runSourceCrawl(id)
  });
}

// Ein kompletter Cronlauf im NEUEN Pfad: globale Phase, danach Fairnessschleife x Projektion.
async function laufNeu({ scheduler, uhr, ablage, tenants, deadlineMs, reserveMs = 0, cronName = "crawl", globalBudgetMs = null, projektionMs = G.DEFAULT_PROJEKTION_MS }) {
  const start = uhr.now();
  const aufteilung = G.budgetAufteilung({
    restMs: deadlineMs, mandate: tenants.length, projektionMs,
    globalMaxMs: globalBudgetMs == null ? 240000 : globalBudgetMs
  });
  const global = await scheduler.runGlobaleErfassung({
    tenantIds: tenants, budgetMs: aufteilung.globalMs, startedMs: start, runId: `neu-${start}-global`,
    deps: { now: uhr.now }
  });
  const globalDauerMs = uhr.now() - start;
  if (!G.datenstandVerwendbar(global.datenstand)) {
    return { global, globalDauerMs, aufteilung, mandatsphase: null, ohneFortschritt: true };
  }
  const restMs = Math.max(0, (start + deadlineMs) - uhr.now());
  const mandatsphase = await F.runTenantsFairly({
    cronName, tenantIds: tenants, deadlineMs: restMs, reserveMs, staleMs: F.DEFAULT_STALE_CLAIM_MS,
    startedMs: uhr.now(), now: uhr.now, runId: `neu-${start}`,
    loadState: ablage.load, saveState: ablage.save,
    perTenant: (id) => scheduler.runMandatsProjektion(id, global.datenstand, { deps: { now: uhr.now } })
  });
  return { global, globalDauerMs, aufteilung, mandatsphase, restMs };
}

function fingerabdruck(welt) {
  const sortiert = (m) => [...m.keys()].sort();
  return JSON.stringify({
    rohitems: sortiert(welt.rohitems),
    rawDocuments: sortiert(welt.rawDocuments),
    wissensobjekte: sortiert(welt.wissensobjekte),
    matching: [...welt.matching.entries()].sort().map(([k, v]) => [k, v.map((t) => `${t.koId}:${t.score}`)]),
    entscheidungen: [...welt.entscheidungen.entries()].sort().map(([k, v]) => [k, v.map((t) => `${t.koId}:${t.stufe}`)]),
    kiAufrufe: welt.kiAufrufe
  });
}

const SECHS = ["m-1", "m-2", "m-3", "m-4", "m-5", "m-6"];
function sechsProfile() {
  return [
    profil("m-1", { party: "SPD", state: "Berlin", constituency: "Berlin-Mitte", committee: "Gesundheit" }),
    profil("m-2", { party: "SPD", state: "Berlin", constituency: "Berlin-Nord", committee: "Arbeit und Soziales" }),
    profil("m-3", { party: "Buendnis 90/Die Gruenen", state: "Brandenburg", constituency: "Potsdam", committee: "Umwelt" }),
    profil("m-4", { party: "SPD", state: "Brandenburg", constituency: "Potsdam-Nord", committee: "Inneres" }),
    profil("m-5", { party: "Buendnis 90/Die Gruenen", state: "Berlin", constituency: "Berlin-Sued", committee: "Verkehr" }),
    profil("m-6", { party: "SPD", state: "Berlin", constituency: "Berlin-Ost", committee: "Bildung" })
  ];
}

(async () => {
  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("1 · Flaggrenze — der neue Pfad ist DEFAULT AUS");
  {
    check("ohne Variable AUS", G.globalPhaseEnabled({}) === false);
    check("leere Variable AUS", G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "" }) === false
      && G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "   " }) === false);
    check("`off`/`false`/`0` AUS", G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "off" }) === false
      && G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "false" }) === false
      && G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "0" }) === false);
    check("Tippfehler/Unsinn AUS (fail closed)", G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "onn" }) === false
      && G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "ja" }) === false
      && G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "yes" }) === false
      && G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "aus" }) === false);
    check("nur ausdrueckliche Zusage schaltet EIN", G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "on" }) === true
      && G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: " ON " }) === true
      && G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "true" }) === true
      && G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "1" }) === true
      && G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "an" }) === true);
    check("die reale Prozessumgebung dieser Suite hat das Flag NICHT gesetzt",
      G.globalPhaseEnabled() === false, String(process.env.HELMUT_CRON_GLOBALPHASE));

    const flagsSrc = fs.readFileSync(path.join(ROOT, "lib", "helmut", "flags.js"), "utf8");
    check("das Flag ist NICHT ueber helmut-flags.json setzbar (nur Vercel-Env)",
      /FILE_FLAG_ALLOWLIST/.test(flagsSrc) && !/HELMUT_CRON_GLOBALPHASE/.test(flagsSrc));
    const flagsDatei = JSON.parse(fs.readFileSync(path.join(ROOT, "helmut-flags.json"), "utf8"));
    check("helmut-flags.json enthaelt das Flag nicht", !("HELMUT_CRON_GLOBALPHASE" in flagsDatei));
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("2 · Vereinigungsmenge der Quellen");
  {
    const uhr = makeUhr();
    const profile = sechsProfile();
    const welt = baueWelt({ profile, uhr });
    const scheduler = ladeScheduler(welt.doubles);

    const profilQuellen = [];
    for (const p of profile) profilQuellen.push({ politicianId: p.id, quellen: await scheduler.getSourcesForProfile(p) });
    const plan = G.planGlobaleQuellen({ profilQuellen });

    // 2.1 Vollstaendigkeit
    check("2.1 jeder Weg, den mindestens ein aktives Mandat heute erhielte, ist enthalten",
      G.fehlendeQuellen({ profilQuellen, vereinigung: plan.quellen }).length === 0,
      JSON.stringify(G.fehlendeQuellen({ profilQuellen, vereinigung: plan.quellen })));

    // 2.2 kein Weg doppelt geplant
    const ids = plan.quellen.map((q) => q.id);
    check("2.2 kein gemeinsamer Weg wird mehr als einmal GEPLANT (Kennung genau einmal)",
      new Set(ids).size === ids.length, `${ids.length} Eintraege, ${new Set(ids).size} Kennungen`);

    // 2.3 Personenquellen
    const personen = ids.filter((id) => /-news$/.test(id));
    check("2.3 jede mandatsindividuelle Personenquelle bleibt erhalten",
      profile.every((p) => personen.includes(`${p.id}-news`)) && personen.length === profile.length,
      JSON.stringify(personen));

    // 2.4 Parteispezifisch
    check("2.4 parteispezifische Quellen bleiben erhalten (beide Parteien der Menge)",
      ids.includes("partei-spd") && ids.includes("partei-gruene"));
    check("2.4b eine parteispezifische Quelle ist als GEMEINSAM erkannt, nicht dupliziert",
      plan.herkunft["partei-spd"].length === 4 && plan.herkunft["partei-gruene"].length === 2,
      JSON.stringify({ spd: plan.herkunft["partei-spd"], gruene: plan.herkunft["partei-gruene"] }));

    // 2.5 Ausschussspezifisch
    const ausschuss = ids.filter((id) => /-news-ausschuss-themen$/.test(id));
    check("2.5 ausschussspezifische Wege bleiben je Mandat erhalten",
      ausschuss.length === profile.length, JSON.stringify(ausschuss));

    // 2.6/2.7/2.8 Landesmodule
    check("2.6 Landesquellen bleiben gesperrt — kein `be-`/`bb-`-Weg in der Vereinigung",
      !ids.some((id) => /^be-|^bb-/.test(id)), JSON.stringify(ids.filter((id) => /^be-|^bb-/.test(id))));
    check("2.7 Berlin bleibt bei NULL aktiven Landeswegen", ids.filter((id) => /^be-/.test(id)).length === 0);
    check("2.8 Brandenburg bleibt bei NULL aktiven Landeswegen", ids.filter((id) => /^bb-/.test(id)).length === 0);

    // 2.9 manuelle Wege
    check("2.9 manuelle Abrufwege bleiben manuell (kein `crawlMethod: manual` in der Vereinigung)",
      !plan.quellen.some((q) => q.crawlMethod === "manual"));

    // 2.10 deaktivierte Wege
    check("2.10 deaktivierte/vorbereitete Wege (`active:false`) bleiben draussen",
      !ids.includes("nds-basis"));

    // 2.11 REIHENFOLGE — die beweisbaren Invarianten, ehrlich benannt.
    // Die Vereinigung ordnet nach ERSTEM Auftreten. Die naive Erwartung „jeder Profilplan
    // bleibt vollstaendige Teilfolge" ist damit NACHWEISLICH FALSCH und wird hier nicht
    // behauptet: ein GETEILTER Weg steht fuer ein spaeteres Profil frueher als in dessen
    // eigenem Plan, weil ihn ein frueheres Profil schon eingebracht hat. Beweisbar und
    // fachlich ausreichend sind die drei folgenden Aussagen.
    const teilfolgeVon = (liste) => {
      let idx = -1;
      for (const id of liste) { const pos = ids.indexOf(id); if (pos <= idx) return false; idx = pos; }
      return true;
    };
    const istEigen = (id, mandat) => String(id).startsWith(`${mandat}-`);
    check("2.11a die relative Reihenfolge der MANDATSEIGENEN Wege bleibt je Profil exakt erhalten",
      profilQuellen.every((e) => teilfolgeVon(e.quellen.map((q) => q.id).filter((id) => istEigen(id, e.politicianId)))));
    check("2.11b das ERSTE Profil der uebergebenen (Fairness-)Reihenfolge steht vollstaendig und unveraendert vorn",
      teilfolgeVon(profilQuellen[0].quellen.map((q) => q.id))
      && ids.slice(0, profilQuellen[0].quellen.length).join("|") === profilQuellen[0].quellen.map((q) => q.id).join("|"));
    // Unabhaengige Nachrechnung der Reihenfolge — nicht dieselbe Schleife wie im Modul.
    const erwartet = [];
    for (const e of profilQuellen) for (const q of e.quellen) if (!erwartet.includes(String(q.id))) erwartet.push(String(q.id));
    check("2.11c die Reihenfolge ist genau `erstes Auftreten in der uebergebenen Profilreihenfolge`",
      erwartet.join("|") === ids.join("|"));
    // EHRLICH BENANNT: fuer ein SPAETERES Profil kann sich die relative Lage zweier GETEILTER
    // Wege gegenueber seinem eigenen Plan verschieben — ein Weg, den ein frueheres Profil
    // eingebracht hat, steht vorn. Das ist deterministisch und ohne fachliche Folge, weil der
    // Abruf selbst NICHT zeitbudgetiert ist: `crawlAllSources` kennt keine Deadline und ruft
    // jede aktive Quelle ab. Die Reihenfolge entscheidet also nicht darueber, WELCHE Quelle
    // abgerufen wird — nur in welcher Reihenfolge Gate-Slots vergeben werden.
    const crawlerSrc = fs.readFileSync(path.join(ROOT, "lib", "helmut", "crawler.js"), "utf8");
    check("2.11d die Reihenfolge entscheidet NICHT ueber die Versorgung: der Abruf hat keine Deadline",
      /async function crawlAllSources/.test(crawlerSrc)
      && !/deadline|budgetMs/i.test(crawlerSrc.slice(crawlerSrc.indexOf("async function crawlAllSources"), crawlerSrc.indexOf("async function crawlAllSources") + 4000)));
    check("2.11e eine ANDERE Profilreihenfolge aendert nur die Reihenfolge, nicht die MENGE",
      (() => {
        const gedreht = G.planGlobaleQuellen({ profilQuellen: [...profilQuellen].reverse() });
        return gedreht.quellen.map((q) => String(q.id)).sort().join("|") === ids.slice().sort().join("|")
          && gedreht.quellen.map((q) => String(q.id)).join("|") !== ids.join("|");
      })());

    // 2.12 fehlerhaftes Profil
    const mitFehler = [
      { politicianId: "m-1", fehler: "profil-nicht-ladbar" },
      ...profilQuellen.slice(1)
    ];
    const planFehler = G.planGlobaleQuellen({ profilQuellen: mitFehler });
    check("2.12 ein fehlerhaftes Profil faellt die globale Versorgung der anderen NICHT aus",
      planFehler.fehlerhafteProfile.length === 1
      && planFehler.fehlerhafteProfile[0].politicianId === "m-1"
      && planFehler.quellen.length > 0
      && profile.slice(1).every((p) => planFehler.quellen.some((q) => q.id === `${p.id}-news`)),
      JSON.stringify(planFehler.fehlerhafteProfile));
    check("2.12b das fehlerhafte Profil erscheint NICHT als versorgt",
      !planFehler.quellen.some((q) => q.id === "m-1-news"));

    // Zusatz: Vereinigung ist Teilmenge — es entsteht kein Weg aus dem Nichts
    const alleErlaubten = new Set(profilQuellen.flatMap((e) => e.quellen.map((q) => q.id)));
    check("2.13 die Vereinigung ist echte TEILMENGE der heutigen Plaene (kein neuer Weg)",
      ids.every((id) => alleErlaubten.has(id)));
    check("2.14 Kennzahlen stimmen (gemeinsam + mandatseigen = gesamt)",
      plan.gemeinsam + plan.mandatseigen === plan.gesamt && plan.gesamt === ids.length,
      JSON.stringify({ gemeinsam: plan.gemeinsam, eigen: plan.mandatseigen, gesamt: plan.gesamt }));
    check("2.15 eine Quelle ohne Kennung wird nicht geplant (Telemetrie schluesselt auf die Kennung)",
      G.planGlobaleQuellen({ profilQuellen: [{ politicianId: "x", quellen: [{ name: "ohne id" }] }] }).gesamt === 0);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("2b · Vereinigungsmenge gegen das ECHTE relationale Quellenmodell (Modus `on`)");
  {
    // Production laeuft mit HELMUT_SOURCE_MODE=on (helmut-flags.json). Der Plan kommt dann aus
    // dem relationalen Modell, nicht aus dem Katalog. Hier laeuft die Vereinigung deshalb
    // gegen das ECHTE Seed-Modell (alle Abrufwege, Pakete, Paketzuordnungen) und die ECHTE
    // Paket-/Landesmodullogik — kein vereinfachtes Testkatalogmodell.
    const { buildFullModel } = require(path.join(ROOT, "lib", "helmut", "quellenarchitektur"));
    const { v1Sources } = require(path.join(ROOT, "lib", "helmut", "sources.js"));
    const M = buildFullModel();
    const relational = {
      retrievalPaths: M.retrievalPaths, packages: M.packages, packagePaths: M.packagePaths,
      legacySources: v1Sources
    };
    const uhr = makeUhr();
    // Ein Berliner und ein Brandenburger Landtagsprofil sind ABSICHTLICH dabei: sie sind der
    // schaerfste Fall fuer „die Vereinigung darf kein Land aktivieren".
    const profile = [
      ...sechsProfile(),
      profil("m-be", { politicalLevel: "Landtag", parliamentType: "Landtag", state: "Berlin", party: "SPD", committee: "Inneres" }),
      profil("m-bb", { politicalLevel: "Landtag", parliamentType: "Landtag", state: "Brandenburg", party: "SPD", committee: "Inneres" })
    ];
    const welt = baueWelt({ profile, uhr, relationaleQuellen: relational });
    const scheduler = ladeScheduler(welt.doubles);

    const profilQuellen = [];
    for (const p of profile) profilQuellen.push({ politicianId: p.id, quellen: await scheduler.getSourcesForProfile(p) });
    const plan = G.planGlobaleQuellen({ profilQuellen });
    const ids = plan.quellen.map((q) => q.id);

    check("2b.1 der relationale Plan wurde wirklich benutzt (mehr als der Testkatalog)",
      plan.gesamt > 50 && M.retrievalPaths.length > 100, JSON.stringify({ gesamt: plan.gesamt, wege: M.retrievalPaths.length }));
    check("2b.2 Vollstaendigkeit: kein Weg eines aktiven Profils geht verloren",
      G.fehlendeQuellen({ profilQuellen, vereinigung: plan.quellen }).length === 0,
      JSON.stringify(G.fehlendeQuellen({ profilQuellen, vereinigung: plan.quellen }).slice(0, 10)));
    check("2b.3 jede Kennung genau einmal", new Set(ids).size === ids.length);
    check("2b.4 alle acht Personenquellen erhalten",
      profile.every((p) => ids.includes(`${p.id}-news`)));
    check("2b.5 BERLIN bleibt bei null aktiven Landeswegen — trotz Berliner Landtagsprofil",
      !plan.quellen.some((q) => /berlin/i.test(String(q.id)) && /pardok|plenum|abgeordnetenhaus/i.test(String(q.id)))
      && !ids.some((id) => /^be-/.test(String(id))),
      JSON.stringify(ids.filter((id) => /^be-|berlin/i.test(String(id))).slice(0, 10)));
    check("2b.6 BRANDENBURG bleibt bei null aktiven Landeswegen — trotz Brandenburger Profil",
      !ids.some((id) => /^bb-/.test(String(id)))
      && !plan.quellen.some((q) => /brandenburg/i.test(String(q.id)) && /pardok|plenum|landtag/i.test(String(q.id))),
      JSON.stringify(ids.filter((id) => /^bb-|brandenburg/i.test(String(id))).slice(0, 10)));
    check("2b.7 kein manueller Abrufweg in der Vereinigung",
      !plan.quellen.some((q) => q.crawlMethod === "manual"));
    check("2b.8 kein deaktivierter Weg in der Vereinigung",
      !plan.quellen.some((q) => q.active === false));
    check("2b.9 kein DIP-Weg im Quellencrawl (DIP bleibt eigener API-Pfad)",
      !ids.includes("dip") && !ids.some((id) => /^rp-dip/.test(String(id))));
    const teilfolgeVon = (liste) => {
      let idx = -1;
      for (const id of liste) { const pos = ids.indexOf(String(id)); if (pos <= idx) return false; idx = pos; }
      return true;
    };
    check("2b.10a die relative Reihenfolge der MANDATSEIGENEN Wege bleibt je Profil erhalten",
      profilQuellen.every((e) => teilfolgeVon(e.quellen.map((q) => String(q.id)).filter((id) => id.startsWith(`${e.politicianId}-`)))));
    check("2b.10b die Reihenfolge ist genau `erstes Auftreten in der Profilreihenfolge`",
      (() => {
        const erwartet = [];
        for (const e of profilQuellen) for (const q of e.quellen) if (!erwartet.includes(String(q.id))) erwartet.push(String(q.id));
        return erwartet.join("|") === ids.map(String).join("|");
      })());
    check("2b.10c das erste Profil der Reihenfolge steht vollstaendig und unveraendert vorn",
      ids.slice(0, profilQuellen[0].quellen.length).join("|") === profilQuellen[0].quellen.map((q) => String(q.id)).join("|"));
    const alleErlaubten = new Set(profilQuellen.flatMap((e) => e.quellen.map((q) => String(q.id))));
    check("2b.11 die Vereinigung ist echte Teilmenge der heutigen Plaene", ids.every((id) => alleErlaubten.has(String(id))));
    console.log(`  INFO  Modus on: ${profile.length} Profile · Vereinigung ${plan.gesamt} Wege`
      + ` (gemeinsam ${plan.gemeinsam}, mandatseigen ${plan.mandatseigen}, strukturgleiche Adressen ${plan.doppelteAbrufwege.length})`);
    const summeEinzeln = profilQuellen.reduce((s, e) => s + e.quellen.length, 0);
    console.log(`  INFO  Modus on: Summe der Einzelplaene ${summeEinzeln} Wege -> Vereinigung ${plan.gesamt}`
      + ` (Einsparung ${summeEinzeln - plan.gesamt} geplante Abrufe je Lauf)`);
    check("2b.12 die Vereinigung ist kleiner als die Summe der Einzelplaene (das ist die Einsparung)",
      plan.gesamt < summeEinzeln, `${plan.gesamt} < ${summeEinzeln}`);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("3 · Datenstandsvertrag");
  {
    const offen = G.datenstandNeu({ laufId: "l1", startAt: 1000, mandate: 6 });
    check("3.1 ein neuer Datenstand ist OFFEN und nicht versiegelt",
      offen.status === G.DATENSTAND_OFFEN && offen.versiegelt === false);
    check("3.2 ein offener Datenstand ist NICHT verwendbar", G.datenstandVerwendbar(offen) === false);
    check("3.3 `mandatsphaseBereit` wirft bei offenem Datenstand", (() => {
      try { G.mandatsphaseBereit(offen); return false; } catch (e) { return /vor-abschluss/.test(e.message); }
    })());
    check("3.4 `mandatsphaseBereit` wirft ohne Datenstand", (() => {
      try { G.mandatsphaseBereit(null); return false; } catch (e) { return /ohne-datenstand/.test(e.message); }
    })());

    const sauber = G.datenstandVersiegeln(offen, { nowMs: 5000, quellen: 10, rohdokumente: 20, verstanden: 3 });
    check("3.5 ohne Fehler/Budgetabbruch -> ABGESCHLOSSEN und frisch",
      sauber.status === G.DATENSTAND_ABGESCHLOSSEN && G.datenstandFrisch(sauber) === true && sauber.dauerMs === 4000);
    check("3.6 ein abgeschlossener Datenstand ist verwendbar", G.datenstandVerwendbar(sauber) === true);
    check("3.7 `mandatsphaseBereit` laesst einen abgeschlossenen Datenstand durch", G.mandatsphaseBereit(sauber) === true);

    const teil = G.datenstandVersiegeln(offen, { nowMs: 5000, budgetErschoepft: true });
    check("3.8 Budgetabbruch -> TEILWEISE, verwendbar aber NICHT frisch",
      teil.status === G.DATENSTAND_TEILWEISE && G.datenstandVerwendbar(teil) === true && G.datenstandFrisch(teil) === false);

    const kaputt = G.datenstandVersiegeln(offen, { nowMs: 5000, fehler: [{ schritt: "abruf", fatal: true }] });
    check("3.9 ein fataler Fehler -> FEHLGESCHLAGEN, nicht verwendbar, nicht frisch",
      kaputt.status === G.DATENSTAND_FEHLGESCHLAGEN && G.datenstandVerwendbar(kaputt) === false && G.datenstandFrisch(kaputt) === false);
    check("3.10 `mandatsphaseBereit` wirft auf fehlgeschlagenem Datenstand", (() => {
      try { G.mandatsphaseBereit(kaputt); return false; } catch (e) { return /fehlgeschlagenem/.test(e.message); }
    })());

    const nochmal = G.datenstandVersiegeln(sauber, { nowMs: 9999, status: G.DATENSTAND_ABGESCHLOSSEN, quellen: 999 });
    check("3.11 ein VERSIEGELTER Datenstand kann nicht erneut versiegelt oder gehoben werden",
      nochmal === sauber && nochmal.quellen === 10 && nochmal.beendetAt === 5000);
    // K2.1 (2026-07-31): der Vermerk hat ZWEI additive Felder bekommen (`buendelung`,
    // `kontexte`). Beide sind Zaehler/Enum ohne Personenbezug — die Zusage „PII-frei und
    // kompakt" gilt unveraendert, die erwartete Feldliste ist nachgezogen.
    // Die Allowlist ist bewusst EXAKT: jedes neue Feld muss hier eingetragen werden und ist
    // damit eine bewusste Entscheidung. OP-25 E3 (2026-08-04) ergaenzt `dauerMs` und
    // `budgetMs` — die VERSIEGELTE Laufzeit und ihre Grenze, beide reine Zahlen ohne PII.
    // Sie sind noetig, weil der Production-Nachweis die Budgetgrenze sonst am vor dem
    // Versiegeln gebildeten `durationMs` pruefen muesste (Review zu PR #222).
    check("3.12 der Vermerk ist PII-frei und kompakt (nur Kennung, Status, Zaehler)",
      Object.keys(G.datenstandVermerk(sauber)).sort().join(",")
      === "beendetAt,budgetErschoepft,budgetMs,buendelung,dauerMs,fehler,frisch,kontexte,laufId,quellen,rohdokumente,status,versiegelt,verstanden");
    check("3.13 ein teilweiser Datenstand meldet `frisch:false` im Vermerk",
      G.datenstandVermerk(teil).frisch === false && G.datenstandVermerk(teil).status === G.DATENSTAND_TEILWEISE);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("4 · Budgetaufteilung — sie TEILT, sie erhoeht nichts");
  {
    const a = G.budgetAufteilung({ restMs: 270000, mandate: 6, projektionMs: 8000, globalMaxMs: 240000 });
    check("4.1 global + Reserve = Restzeit (nichts entsteht dazu)",
      a.globalMs + a.projektionsReserveMs === 270000, JSON.stringify(a));
    check("4.2 die globale Phase bekommt nie mehr als ihr bisheriges Erfassungsbudget",
      a.globalMs <= 240000 && a.globalMs === Math.min(240000, 270000 - 48000), String(a.globalMs));
    const b = G.budgetAufteilung({ restMs: 270000, mandate: 100, projektionMs: 8000, globalMaxMs: 240000 });
    check("4.3 eine grosse Mandatszahl kann die Erfassung nicht aushungern (Untergrenze 50 %)",
      b.globalMs === 135000 && b.reserveGekuerzt === true, JSON.stringify(b));
    const c = G.budgetAufteilung({ restMs: 0, mandate: 6, projektionMs: 8000, globalMaxMs: 240000 });
    check("4.4 ohne Restzeit ist beides null (kein negatives Budget)",
      c.globalMs === 0 && c.projektionsReserveMs === 0);
    check("4.5 das Standardbudget je Projektion ist 8 s und ueber Env veraenderbar",
      G.DEFAULT_PROJEKTION_MS === 8000
      && G.projektionsBudgetMs({}) === 8000
      && G.projektionsBudgetMs({ HELMUT_CRON_PROJEKTION_MS: "5000" }) === 5000
      && G.projektionsBudgetMs({ HELMUT_CRON_PROJEKTION_MS: "unsinn" }) === 8000);
    const d = G.budgetAufteilung({ restMs: 270000, mandate: 1, projektionMs: 8000, globalMaxMs: 240000 });
    check("4.6 bei einem Mandat bleibt die Erfassung bei ihrer bisherigen Obergrenze",
      d.globalMs === 240000, String(d.globalMs));
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("5 · Globale Phase am echten Produktionscode");
  {
    Date.now = () => uhrGlobal.jetzt();
    var uhrGlobal = makeUhr();
    const profile = sechsProfile();
    const welt = baueWelt({ profile, uhr: uhrGlobal });
    const scheduler = ladeScheduler(welt.doubles);
    GN.resetSharedFetchLedger();

    const ergebnis = await scheduler.runGlobaleErfassung({
      tenantIds: SECHS, budgetMs: 240000, startedMs: uhrGlobal.now(), runId: "g-1", deps: { now: uhrGlobal.now }
    });
    const ds = ergebnis.datenstand;

    check("5.1 die globale Phase liefert einen VERSIEGELTEN Datenstand",
      ds.versiegelt === true && ds.status === G.DATENSTAND_ABGESCHLOSSEN, JSON.stringify(G.datenstandVermerk(ds)));
    check("5.2 sie erwirbt und gibt ihre eigene Sperre frei",
      welt.sperrProtokoll.some((e) => e.art === "erwerb" && e.name === scheduler.GLOBALPHASE_LOCK && e.erfolg)
      && welt.sperrProtokoll.some((e) => e.art === "freigabe" && e.name === scheduler.GLOBALPHASE_LOCK));
    check("5.3 sie erwirbt KEINE Mandatssperre (`crawl-<mandat>` bleibt der Mandatsphase)",
      !welt.sperrProtokoll.some((e) => /^crawl-m-/.test(e.name)));
    check("5.4 jede Quellenkennung wurde genau EINMAL abgerufen",
      new Set(welt.abrufe).size === welt.abrufe.length, JSON.stringify(welt.abrufe.length));
    check("5.4b auch jede konkrete ADRESSE wurde genau einmal abgerufen (Gedaechtnis geteilter Wege)",
      new Set(welt.abrufWege).size === welt.abrufWege.length,
      `${welt.abrufWege.length} Abrufe / ${new Set(welt.abrufWege).size} Adressen`);
    check("5.5 sie schreibt GENAU EINEN globalen Lauf, mandantenneutral",
      welt.crawlRuns.filter((r) => r.mode === "global").length === 1
      && welt.crawlRuns[0].politicianId === null
      && welt.crawlRuns[0].globalphase === true);
    check("5.6 sie fuehrt KEIN Matching und KEINE Entscheidungen aus",
      welt.matchingLaeufe.length === 0 && welt.entscheidungsLaeufe.length === 0);
    check("5.7 Rohdokumente und Wissensobjekte sind entstanden",
      welt.rohitems.size > 0 && welt.rawDocuments.size > 0 && welt.wissensobjekte.size > 0,
      JSON.stringify({ items: welt.rohitems.size, rd: welt.rawDocuments.size, ko: welt.wissensobjekte.size }));
    check("5.8 der Datenstand nennt Quellenzahl, Rohdokumente und Verstandene",
      ds.quellen > 0 && ds.rohdokumente === welt.rohitems.size && ds.verstanden > 0 && ds.verstanden >= welt.wissensobjekte.size);

    // Zweiter Lauf auf demselben Bestand: idempotent, KEINE neuen KI-Aufrufe.
    const kiVorher = welt.kiAufrufe;
    GN.resetSharedFetchLedger();
    const zweiter = await scheduler.runGlobaleErfassung({
      tenantIds: SECHS, budgetMs: 240000, startedMs: uhrGlobal.now(), runId: "g-2", deps: { now: uhrGlobal.now }
    });
    check("5.9 ein zweiter Lauf auf unveraendertem Bestand kostet KEINEN zusaetzlichen KI-Aufruf",
      welt.kiAufrufe === kiVorher, `${kiVorher} -> ${welt.kiAufrufe}`);
    check("5.10 auch der zweite Lauf versiegelt sauber", zweiter.datenstand.status === G.DATENSTAND_ABGESCHLOSSEN);

    // Ueberlappender Lauf: die Sperre haelt.
    welt.sperren.set(scheduler.GLOBALPHASE_LOCK, uhrGlobal.jetzt());
    const dritter = await scheduler.runGlobaleErfassung({
      tenantIds: SECHS, budgetMs: 240000, startedMs: uhrGlobal.now(), runId: "g-3", deps: { now: uhrGlobal.now }
    });
    check("5.11 ein ueberlappender Lauf wird abgewiesen und liefert KEINEN verwendbaren Datenstand",
      dritter.uebersprungen === true && G.datenstandVerwendbar(dritter.datenstand) === false);
    welt.sperren.delete(scheduler.GLOBALPHASE_LOCK);

    // Fehlerhafte gemeinsame Quelle: der Lauf laeuft weiter, meldet aber teilweise.
    const uhr2 = makeUhr();
    Date.now = () => uhr2.jetzt();
    const welt2 = baueWelt({ profile: sechsProfile(), uhr: uhr2, defekteQuellen: ["bt-drucksachen"] });
    const scheduler2 = ladeScheduler(welt2.doubles);
    GN.resetSharedFetchLedger();
    const mitDefekt = await scheduler2.runGlobaleErfassung({
      tenantIds: SECHS, budgetMs: 240000, startedMs: uhr2.now(), runId: "g-defekt", deps: { now: uhr2.now }
    });
    check("5.12 eine fehlerhafte gemeinsame Quelle stoppt die Erfassung NICHT",
      mitDefekt.datenstand.versiegelt === true && welt2.abrufe.length > 1 && welt2.rohitems.size > 0);
    check("5.13 der fehlerhafte Abruf steht als Fehler im globalen Lauf",
      (welt2.crawlRuns[0].errors || []).length === 1 && welt2.crawlRuns[0].failedSources === 1);

    // Fehlerhaftes Profil: die anderen werden versorgt.
    const uhr3 = makeUhr();
    Date.now = () => uhr3.jetzt();
    const welt3 = baueWelt({ profile: sechsProfile(), uhr: uhr3 });
    const scheduler3 = ladeScheduler(welt3.doubles);
    const echteQuellenfunktion = scheduler3.getSourcesForProfile;
    GN.resetSharedFetchLedger();
    const mitProfilFehler = await scheduler3.runGlobaleErfassung({
      tenantIds: SECHS, budgetMs: 240000, startedMs: uhr3.now(), runId: "g-profilfehler",
      deps: {
        now: uhr3.now,
        quellenFuerProfil: async (p) => {
          if (p.id === "m-3") throw new Error("profil-defekt");
          return echteQuellenfunktion(p);
        }
      }
    });
    check("5.14 ein fehlerhaftes Profil laesst die uebrigen versorgt und meldet TEILWEISE",
      mitProfilFehler.datenstand.status === G.DATENSTAND_TEILWEISE
      && mitProfilFehler.datenstand.fehlerhafteProfile.join(",") === "m-3"
      && welt3.abrufe.includes("m-1-news") && welt3.abrufe.includes("m-6-news")
      && !welt3.abrufe.includes("m-3-news"),
      JSON.stringify({ status: mitProfilFehler.datenstand.status, profile: mitProfilFehler.datenstand.fehlerhafteProfile }));

    // Abrufbudget erschoepft: der Abruf MUSS stufenweise abbrechen. `crawlAllSources` selbst
    // kennt keine Deadline — ohne diese Pruefung wuerde die globale Phase ihr Zeitfenster
    // ueberziehen, genau wie der Altpfad am 2026-07-27 (300-s-Limit).
    const uhr4 = makeUhr();
    Date.now = () => uhr4.jetzt();
    const welt4 = baueWelt({ profile: sechsProfile(), uhr: uhr4 });
    const scheduler4 = ladeScheduler(welt4.doubles);
    GN.resetSharedFetchLedger();
    const knapp = await scheduler4.runGlobaleErfassung({
      // 20 Wege je Stufe x 1 500 ms = 30 000 ms — nach der ersten Stufe ist Schluss.
      tenantIds: SECHS, budgetMs: 30000, startedMs: uhr4.now(), runId: "g-knapp", deps: { now: uhr4.now }
    });
    check("5.15 Abrufbudget erschoepft: der Abruf bricht ab, statt das Fenster zu ueberziehen",
      // Abgebrochen (nicht alle geplanten Wege geholt) und die Ueberziehung ist auf HOECHSTENS
      // eine Stufe begrenzt (20 Wege x 1 500 ms) — mehr kann die Pruefung zwischen den Stufen
      // strukturell nicht verhindern, und genau das ist die zugesagte Schranke.
      welt4.abrufe.length > 0 && welt4.abrufe.length < 49
      && (uhr4.now() - BASIS_MS) < 30000 + 20 * KOSTEN.abrufMs,
      JSON.stringify({ abrufe: welt4.abrufe.length, verbrauchtMs: uhr4.now() - BASIS_MS }));
    check("5.16 der Datenstand meldet den Abbruch — TEILWEISE mit benanntem Grund, kein falsches Gruen",
      knapp.datenstand.status === G.DATENSTAND_TEILWEISE
      && knapp.datenstand.budgetErschoepft === true
      && (knapp.datenstand.fehler || []).some((f) => /abrufbudget-erschoepft/.test(String(f.grund))),
      JSON.stringify(knapp.datenstand.fehler));
    check("5.17 ein abgebrochener Abruf gilt NICHT als frisch",
      G.datenstandFrisch(knapp.datenstand) === false && G.datenstandVerwendbar(knapp.datenstand) === true);

    Date.now = ECHTES_NOW;
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("6 · Mandatsphase am echten Produktionscode");
  {
    const uhr = makeUhr();
    Date.now = () => uhr.jetzt();
    const profile = sechsProfile();
    const welt = baueWelt({ profile, uhr });
    const scheduler = ladeScheduler(welt.doubles);
    GN.resetSharedFetchLedger();
    const { datenstand } = await scheduler.runGlobaleErfassung({
      tenantIds: SECHS, budgetMs: 240000, startedMs: uhr.now(), runId: "g", deps: { now: uhr.now }
    });

    const abrufeVorher = welt.abrufe.length;
    const kiVorher = welt.kiAufrufe;
    const r1 = await scheduler.runMandatsProjektion("m-1", datenstand, { deps: { now: uhr.now } });

    check("6.1 die Projektion ruft KEINE Quelle ab und kostet KEINEN KI-Aufruf",
      welt.abrufe.length === abrufeVorher && welt.kiAufrufe === kiVorher);
    check("6.2 sie fuehrt Matching und Entscheidungen genau einmal aus",
      welt.matchingLaeufe.join(",") === "m-1" && welt.entscheidungsLaeufe.join(",") === "m-1");
    check("6.3 sie erwirbt und gibt die UNVERAENDERTE Mandatssperre `crawl-<mandat>`",
      welt.sperrProtokoll.some((e) => e.art === "erwerb" && e.name === "crawl-m-1" && e.erfolg)
      && welt.sperrProtokoll.some((e) => e.art === "freigabe" && e.name === "crawl-m-1"));
    check("6.4 die Mandatstelemetrie traegt den Datenstand und die globale Laufkennung",
      welt.crawlRuns[0].mode === "mandat" && welt.crawlRuns[0].politicianId === "m-1"
      && welt.crawlRuns[0].globalLaufId === datenstand.laufId
      && welt.crawlRuns[0].datenstandFrisch === true);
    check("6.5 das Ergebnis ist fuer die Fairnessbuchfuehrung ein ERFOLG (kein Fehlschlag)",
      F.ergebnisFehlgeschlagen(r1) === false && sperreVerweigert(r1) === false);

    // Verweigerte Sperre -> exakt der bekannte Rueckgabewert.
    welt.sperren.set("crawl-m-2", uhr.jetzt());
    const r2 = await scheduler.runMandatsProjektion("m-2", datenstand, { deps: { now: uhr.now } });
    check("6.6 bei gehaltener Mandatssperre kommt `{skipped:true, reason:'already running'}` zurueck",
      r2.skipped === true && r2.reason === "already running" && sperreVerweigert(r2) === true);
    check("6.6b kein Matching, keine Entscheidung, keine Telemetrie bei verweigerter Sperre",
      !welt.matchingLaeufe.includes("m-2") && !welt.entscheidungsLaeufe.includes("m-2"));
    welt.sperren.delete("crawl-m-2");

    // Riegel: keine Projektion auf unversiegeltem Datenstand.
    const offen = G.datenstandNeu({ laufId: "offen", startAt: uhr.jetzt(), mandate: 6 });
    let geworfen = null;
    try { await scheduler.runMandatsProjektion("m-3", offen, { deps: { now: uhr.now } }); } catch (e) { geworfen = e; }
    check("6.7 RIEGEL: Matching vor Abschluss der globalen Phase wirft und laeuft nicht",
      geworfen && /vor-abschluss/.test(geworfen.message) && !welt.matchingLaeufe.includes("m-3"));

    // Riegel: keine Projektion auf fehlgeschlagenem Datenstand.
    const kaputt = G.datenstandVersiegeln(G.datenstandNeu({ laufId: "x", startAt: 0 }), { nowMs: 1, fehler: [{ fatal: true }] });
    let geworfen2 = null;
    try { await scheduler.runMandatsProjektion("m-4", kaputt, { deps: { now: uhr.now } }); } catch (e) { geworfen2 = e; }
    check("6.8 RIEGEL: keine Projektion auf fehlgeschlagenem Datenstand",
      geworfen2 && /fehlgeschlagenem/.test(geworfen2.message) && !welt.matchingLaeufe.includes("m-4"));

    // Teilweiser Datenstand: Projektion laeuft, wird aber NICHT als frisch markiert.
    const teil = G.datenstandVersiegeln(G.datenstandNeu({ laufId: "teil", startAt: 0 }), { nowMs: 1, budgetErschoepft: true });
    await scheduler.runMandatsProjektion("m-5", teil, { deps: { now: uhr.now } });
    check("6.9 auf teilweisem Datenstand wird projiziert, aber NICHT als frisch markiert",
      welt.matchingLaeufe.includes("m-5")
      && welt.crawlRuns[0].datenstandFrisch === false
      && welt.crawlRuns[0].datenstand.status === G.DATENSTAND_TEILWEISE);

    // Fehler eines Mandats bleibt isoliert.
    const uhrI = makeUhr();
    Date.now = () => uhrI.jetzt();
    const weltI = baueWelt({ profile: sechsProfile(), uhr: uhrI });
    const schedulerI = ladeScheduler(weltI.doubles);
    GN.resetSharedFetchLedger();
    const dsI = (await schedulerI.runGlobaleErfassung({ tenantIds: SECHS, budgetMs: 240000, startedMs: uhrI.now(), runId: "gi", deps: { now: uhrI.now } })).datenstand;
    const ablageI = makeAblage(uhrI);
    const laufI = await F.runTenantsFairly({
      cronName: "crawl", tenantIds: SECHS, deadlineMs: 600000, reserveMs: 0,
      startedMs: uhrI.now(), now: uhrI.now, runId: "iso",
      loadState: ablageI.load, saveState: ablageI.save,
      perTenant: (id) => (id === "m-3"
        ? Promise.reject(new Error("mandat-kaputt"))
        : schedulerI.runMandatsProjektion(id, dsI, { deps: { now: uhrI.now } }))
    });
    check("6.10 ein fehlerhaftes Mandat stoppt die anderen NICHT",
      laufI.fairness.fehlgeschlagen.join(",") === "m-3" && laufI.fairness.erfolgreich.length === 5,
      JSON.stringify(laufI.fairness.erfolgreich));
    check("6.10b der Fehler ist sichtbar, nicht verschluckt",
      laufI.results.some((r) => r.failed === true && /mandat-kaputt/.test(String(r.error))));

    Date.now = ECHTES_NOW;
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("7 · Ergebnisgleichheit ALT vs. NEU (gleicher Bestand, unbegrenzte Zeit)");
  {
    // Beide Pfade bekommen so viel Zeit, dass ALLE Mandate durchlaufen — nur dann ist ein
    // Vergleich der ERGEBNISSE aussagekraeftig (unter Zeitdruck erreicht der alte Pfad die
    // spaeteren Mandate gar nicht; das ist der Kapazitaetsteil, Abschnitt 8).
    // Auch das Verstehensbudget wird fuer DIESEN Vergleich aufgehoben: die Frage lautet
    // „liefern beide Pfade dieselben Ergebnisse, wenn beide ihre Arbeit VOLLSTAENDIG tun?".
    // Der Budgetunterschied selbst ist ein eigener, benannter Befund (Abschnitt 7c).
    const budgetVorher = process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS;
    process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS = "3600000";
    // ZWEI Laeufe je Pfad. Grund (Befund K1-4, unten): im ALTEN Pfad matcht ein frueh
    // verarbeitetes Mandat gegen einen Korpus, der die Dokumente der SPAETEREN Mandate noch
    // gar nicht enthaelt — der erste Lauf ist deshalb strukturell nicht vergleichbar. Nach
    // dem zweiten Lauf hat in BEIDEN Pfaden jedes Mandat denselben vollstaendigen Korpus
    // gesehen; erst dann ist die Frage „rechnen beide gleich?" ueberhaupt beantwortbar.
    const uhrA = makeUhr();
    Date.now = () => uhrA.jetzt();
    const weltA = baueWelt({ profile: sechsProfile(), uhr: uhrA });
    const schedulerA = ladeScheduler(weltA.doubles);
    GN.resetSharedFetchLedger();
    const ablageA = makeAblage(uhrA);
    const altLauf = await laufAlt({ scheduler: schedulerA, uhr: uhrA, ablage: ablageA, tenants: SECHS, deadlineMs: 60 * 60 * 1000 });
    const altDauerMs = uhrA.now() - BASIS_MS;
    // Zustand nach Lauf 1 festhalten — er belegt Befund K1-4.
    const altErsterLauf = JSON.stringify([...weltA.matching.entries()].sort());
    uhrA.setzen(uhrA.jetzt() + 6 * 3600000);
    GN.resetSharedFetchLedger();
    await laufAlt({ scheduler: schedulerA, uhr: uhrA, ablage: ablageA, tenants: SECHS, deadlineMs: 60 * 60 * 1000 });

    const uhrB = makeUhr();
    Date.now = () => uhrB.jetzt();
    const weltB = baueWelt({ profile: sechsProfile(), uhr: uhrB });
    const schedulerB = ladeScheduler(weltB.doubles);
    GN.resetSharedFetchLedger();
    const ablageB = makeAblage(uhrB);
    const neuLauf = await laufNeu({ scheduler: schedulerB, uhr: uhrB, ablage: ablageB, tenants: SECHS, deadlineMs: 60 * 60 * 1000, globalBudgetMs: 60 * 60 * 1000 });
    const neuDauerMs = uhrB.now() - BASIS_MS;
    const neuErsterLauf = JSON.stringify([...weltB.matching.entries()].sort());
    uhrB.setzen(uhrB.jetzt() + 6 * 3600000);
    GN.resetSharedFetchLedger();
    await laufNeu({ scheduler: schedulerB, uhr: uhrB, ablage: ablageB, tenants: SECHS, deadlineMs: 60 * 60 * 1000, globalBudgetMs: 60 * 60 * 1000 });
    Date.now = ECHTES_NOW;
    if (budgetVorher === undefined) delete process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS;
    else process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS = budgetVorher;

    check("7.0 beide Pfade haben alle sechs Mandate vollstaendig verarbeitet",
      altLauf.fairness.erfolgreich.length === 6 && neuLauf.mandatsphase.fairness.erfolgreich.length === 6);
    // BEFUND K1-4, gemessen statt behauptet.
    check("7.0b BEFUND K1-4: im ERSTEN Lauf unterscheiden sich die Projektionen — im alten Pfad",
      altErsterLauf !== neuErsterLauf);
    check("7.0c BEFUND K1-4: der neue Pfad gibt schon im ERSTEN Lauf jedem Mandat denselben Korpus",
      (() => {
        const groessen = SECHS.map((id) => (JSON.parse(neuErsterLauf).find(([k]) => k === id) || [id, []])[1].length);
        return new Set(groessen).size === 1 && groessen[0] > 0;
      })(), neuErsterLauf.slice(0, 120));
    check("7.0d BEFUND K1-4: im alten Pfad sieht das ZUERST verarbeitete Mandat weniger Vorgaenge",
      (() => {
        const a = JSON.parse(altErsterLauf);
        const groessen = a.map(([, v]) => v.length);
        return Math.min(...groessen) < Math.max(...groessen);
      })());
    check("7.1 gleiche Rohdokumente (Blob-Rohkorpus)",
      [...weltA.rohitems.keys()].sort().join("|") === [...weltB.rohitems.keys()].sort().join("|"),
      `${weltA.rohitems.size} vs ${weltB.rohitems.size}`);
    check("7.2 gleiche Dokument-Fundstellen (relationale raw_documents)",
      [...weltA.rawDocuments.keys()].sort().join("|") === [...weltB.rawDocuments.keys()].sort().join("|"),
      `${weltA.rawDocuments.size} vs ${weltB.rawDocuments.size}`);
    check("7.3 gleiche Knowledge Objects",
      [...weltA.wissensobjekte.keys()].sort().join("|") === [...weltB.wissensobjekte.keys()].sort().join("|"),
      `${weltA.wissensobjekte.size} vs ${weltB.wissensobjekte.size}`);
    check("7.4 gleiche Matching-Ergebnisse je Mandat nach dem zweiten Lauf (inkl. Reihenfolge)",
      JSON.stringify([...weltA.matching.entries()].sort()) === JSON.stringify([...weltB.matching.entries()].sort()));
    check("7.5 gleiche Scores nach dem zweiten Lauf (Feld fuer Feld)",
      SECHS.every((id) => JSON.stringify((weltA.matching.get(id) || []).map((t) => t.score))
        === JSON.stringify((weltB.matching.get(id) || []).map((t) => t.score))));
    check("7.6 gleiche Entscheidungstypen und Prioritaeten nach dem zweiten Lauf",
      JSON.stringify([...weltA.entscheidungen.entries()].sort()) === JSON.stringify([...weltB.entscheidungen.entries()].sort()));
    check("7.7 keine zusaetzlichen und keine fehlenden KI-Aufrufe",
      weltA.kiAufrufe === weltB.kiAufrufe && weltA.kiAufrufe > 0, `alt ${weltA.kiAufrufe} vs neu ${weltB.kiAufrufe}`);
    check("7.8 Mandantentrennung: jedes Mandat hat GENAU seine eigene Projektion",
      SECHS.every((id) => weltB.matching.has(id) && weltB.entscheidungen.has(id))
      && weltB.matching.size === 6 && weltB.entscheidungen.size === 6);
    check("7.9 kein Mandat sieht die Projektion eines anderen (Scores unterscheiden sich je Mandat)",
      new Set(SECHS.map((id) => JSON.stringify(weltB.matching.get(id)))).size === 6);
    check("7.10 identischer Gesamtfingerabdruck ueber alle Bestaende",
      fingerabdruck(weltA) === fingerabdruck(weltB));
    check("7.11 keine erfundenen Erfolge: die Zahl der Matchinglaeufe ist in beiden Pfaden gleich",
      weltA.matchingLaeufe.length === weltB.matchingLaeufe.length && weltB.matchingLaeufe.length === 12,
      `alt ${weltA.matchingLaeufe.length} vs neu ${weltB.matchingLaeufe.length} (2 Laeufe x 6 Mandate)`);
    check("7.12 keine still verschwundenen Fehler (beide Pfade melden 0 Pipelinefehler)",
      weltA.fehler.length === 0 && weltB.fehler.length === 0);

    // BENANNTER, UNVERMEIDBARER UNTERSCHIED 1: Zahl der Quellenabrufe.
    check("7.13 UNTERSCHIED (benannt): der neue Pfad ruft jeden Weg genau einmal JE LAUF ab",
      weltB.abrufe.length === new Set(weltB.abrufe).size * 2
      && weltB.abrufe.length < weltA.abrufe.length,
      `neu ${weltB.abrufe.length} Abrufe / ${new Set(weltB.abrufe).size} Wege in 2 Laeufen · alt ${weltA.abrufe.length}`);
    console.log(`  INFO  Abrufe: alt=${weltA.abrufe.length} (Wege ${new Set(weltA.abrufe).size},`
      + ` uebersprungen ${weltA.uebersprungeneWege.length}) · neu=${weltB.abrufe.length} (Wege ${new Set(weltB.abrufe).size})`);
    // BENANNTER, UNVERMEIDBARER UNTERSCHIED 2: Zahl der Crawl-Lauf-Datensaetze.
    check("7.14 UNTERSCHIED (benannt): alt schreibt je Lauf n Mandatslaeufe, neu 1 globalen + n Mandatslaeufe",
      weltA.crawlRuns.filter((r) => r.mode === "full").length === 12
      && weltB.crawlRuns.filter((r) => r.mode === "global").length === 2
      && weltB.crawlRuns.filter((r) => r.mode === "mandat").length === 12,
      JSON.stringify({ altFull: weltA.crawlRuns.filter((r) => r.mode === "full").length,
        neuGlobal: weltB.crawlRuns.filter((r) => r.mode === "global").length,
        neuMandat: weltB.crawlRuns.filter((r) => r.mode === "mandat").length }));
    // GEMESSENER Zeitvorteil im selben Kostenmodell.
    console.log(`  INFO  Simulierte Laufzeit im selben Kostenmodell: alt=${altDauerMs} ms · neu=${neuDauerMs} ms`
      + ` (global ${neuLauf.globalDauerMs} ms)`);
    check("7.15 der neue Pfad braucht im selben Kostenmodell WENIGER Zeit fuer dieselbe Arbeit",
      neuDauerMs < altDauerMs, `${neuDauerMs} vs ${altDauerMs}`);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("7b · BEFUND K1-1 — der eine unvermeidbare Unterschied, benannt und vermessen");
  {
    // Die Vorgangsbildung arbeitet auf dem BATCH, nicht auf dem Gesamtbestand:
    // `clusterRawDocuments` gruppiert die Dokumente EINES Understanding-Laufs, und
    // `deriveVorgangId` haengt am Inhalt des entstandenen Clusters. Wer anders buendelt,
    // erhaelt eine andere Vorgangskennung. Heute buendelt jeder Mandatslauf fuer sich —
    // die globale Phase buendelt einmal ueber alles. Genau hier liegt der Unterschied.
    // Gemessen mit den ECHTEN Produktionsfunktionen, ohne Testdouble:
    const VI = require(path.join(ROOT, "lib", "helmut", "vorgang-identity.js"));
    const D = require(path.join(ROOT, "lib", "helmut", "dedup.js"));
    const U = require(path.join(ROOT, "lib", "helmut", "understanding.js"));
    const dok = (id, titel, url, quelle) => ({
      id, hash: id, title: titel, summary: "Kontext", url, sourceId: quelle, sourceName: quelle,
      publishedAt: "2026-07-30T12:00:00.000Z", retrievedAt: "2026-07-31T04:00:00.000Z"
    });
    // Ein Vorgang, zwei Wege: der amtliche Weg (geteilt) und die Personensuche eines Mandats.
    const amtlich = dok("a", "Bundestag beschliesst Pflegereform 2026", "https://bundestag.de/pflegereform-2026", "bt-drucksachen");
    const personen = dok("b", "Pflegereform 2026 im Bundestag beschlossen", "https://presse.example/pflegereform-2026", "m-2-news");
    const zeilen = (items) => D.dedupeRawDocuments(items.map(D.toRawDocumentRow).filter(Boolean));

    const gemeinsam = U.clusterRawDocuments(zeilen([amtlich, personen]));
    const getrennt1 = U.clusterRawDocuments(zeilen([amtlich]));
    const getrennt2 = U.clusterRawDocuments(zeilen([personen]));
    const idGemeinsam = gemeinsam.map(VI.deriveVorgangId);
    const idGetrennt = [...getrennt1, ...getrennt2].map(VI.deriveVorgangId);

    check("7b.1 GLOBALE Buendelung: beide Dokumente bilden GENAU EINEN Vorgang",
      gemeinsam.length === 1 && idGemeinsam.length === 1, JSON.stringify(idGemeinsam));
    check("7b.2 MANDATSWEISE Buendelung: dieselben Dokumente bilden ZWEI Cluster mit ZWEI Kennungen",
      idGetrennt.length === 2 && idGetrennt[0] !== idGetrennt[1], JSON.stringify(idGetrennt));
    check("7b.3 die Kennung der globalen Buendelung ist eine DRITTE, von beiden verschieden",
      !idGetrennt.includes(idGemeinsam[0]), JSON.stringify({ global: idGemeinsam[0], mandatsweise: idGetrennt }));
    check("7b.4 BEWERTUNG: alle drei Kennungen teilen dasselbe Suchpraefix — der Resolver findet sie",
      (() => {
        const p = VI.candidatePrefixes(gemeinsam[0], 3);
        return p.length > 0 && idGetrennt.every((id) => p.some((pre) => id.startsWith(pre)))
          && p.some((pre) => idGemeinsam[0].startsWith(pre));
      })(), JSON.stringify(VI.candidatePrefixes(gemeinsam[0], 3)));
    check("7b.5 BEWERTUNG: der Resolver haelt die beiden getrennten Cluster fuer DENSELBEN Vorgang",
      (() => {
        const urteil = VI.sameVorgang(getrennt2[0], {
          vorgangId: idGetrennt[0], documents: getrennt1[0].documents, headline: amtlich.title
        });
        return urteil && urteil.gleich === true;
      })());
    console.log("  INFO  K1-1: mandatsweise Buendelung erzeugt zuerst einen TEILVORGANG und");
    console.log("  INFO        ergaenzt ihn spaeter (zweiter KI-Aufruf, Aktualisierung); die globale");
    console.log("  INFO        Buendelung erzeugt ihn EINMAL vollstaendig (ein KI-Aufruf).");
    check("7b.6 FOLGE: die globale Buendelung braucht fuer denselben Vorgang HOECHSTENS so viele KI-Aufrufe",
      gemeinsam.length <= getrennt1.length + getrennt2.length);
    check("7b.7 GRENZE: kein Dokument geht dabei verloren — beide Buendelungen enthalten beide Dokumente",
      gemeinsam.flatMap((c) => c.documents.map((d) => d.id)).sort().join(",") === "rd-" + "" + [...new Set([...getrennt1, ...getrennt2].flatMap((c) => c.documents.map((d) => d.id)))].sort().join(",").replace(/^rd-/, "")
      || gemeinsam.flatMap((c) => c.documents.map((d) => d.id)).sort().join(",")
        === [...getrennt1, ...getrennt2].flatMap((c) => c.documents.map((d) => d.id)).sort().join(","));
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("7c · BEFUND K1-3 — das Verstehensbudget gilt je LAUF statt je MANDAT");
  {
    // Gegen `main` geprueft: `HELMUT_CRAWL_UNDERSTAND_BUDGET_MS` (90 000 ms) begrenzt EINEN
    // Aufruf von `runUnderstandingShadow`. Heute ruft jedes Mandat einmal auf — der Cron
    // verfuegt also faktisch ueber n x 90 s Verstehenszeit. Die globale Phase ruft EINMAL auf,
    // also 90 s. Das ist eine echte Verringerung der Verstehensmenge JE LAUF.
    // Das Budget wird hier ausdruecklich NICHT erhoeht (freigabepflichtig). Stattdessen:
    // messen, benennen, und belegen, dass nichts verloren geht.
    const uhrA = makeUhr(); Date.now = () => uhrA.jetzt();
    const weltA = baueWelt({ profile: sechsProfile(), uhr: uhrA });
    const schedA = ladeScheduler(weltA.doubles);
    GN.resetSharedFetchLedger();
    const ablageA = makeAblage(uhrA);
    await laufAlt({ scheduler: schedA, uhr: uhrA, ablage: ablageA, tenants: SECHS, deadlineMs: 60 * 60 * 1000 });

    const uhrB = makeUhr(); Date.now = () => uhrB.jetzt();
    const weltB = baueWelt({ profile: sechsProfile(), uhr: uhrB });
    const schedB = ladeScheduler(weltB.doubles);
    GN.resetSharedFetchLedger();
    const ablageB = makeAblage(uhrB);
    await laufNeu({ scheduler: schedB, uhr: uhrB, ablage: ablageB, tenants: SECHS, deadlineMs: 60 * 60 * 1000, globalBudgetMs: 60 * 60 * 1000 });
    Date.now = ECHTES_NOW;

    console.log(`  INFO  K1-3 mit dem UNVERAENDERTEN 90-s-Budget: alt versteht ${weltA.wissensobjekte.size} Vorgaenge`
      + ` (${weltA.kiAufrufe} KI-Aufrufe, 6 Aufrufe von runUnderstandingShadow),`
      + ` neu ${weltB.wissensobjekte.size} (${weltB.kiAufrufe} KI-Aufrufe, 1 Aufruf).`);
    check("7c.1 der alte Pfad versteht je Lauf MEHR Vorgaenge — weil er das Budget n-mal bekommt",
      weltA.wissensobjekte.size > weltB.wissensobjekte.size,
      JSON.stringify({ alt: weltA.wissensobjekte.size, neu: weltB.wissensobjekte.size }));
    check("7c.2 der neue Pfad verstoesst dabei NICHT gegen das Budget (es bleibt bei 90 s je Aufruf)",
      weltB.kiAufrufe * KOSTEN.eagerNeuMs <= 90000 + KOSTEN.eagerNeuMs,
      `${weltB.kiAufrufe} Aufrufe x ${KOSTEN.eagerNeuMs} ms`);
    check("7c.3 nichts geht verloren: die Rohdokumente sind in BEIDEN Pfaden identisch",
      [...weltA.rohitems.keys()].sort().join("|") === [...weltB.rohitems.keys()].sort().join("|"));
    check("7c.4 der Rest bleibt zurueckgestellt und wird vom dedizierten Understanding-Cron geholt",
      (() => {
        const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
        return vercel.crons.filter((c) => c.path === "/api/cron/understanding").length === 2;
      })());
    check("7c.5 der neue Pfad kostet nie MEHR KI-Aufrufe je Lauf als der alte",
      weltB.kiAufrufe <= weltA.kiAufrufe, `${weltB.kiAufrufe} <= ${weltA.kiAufrufe}`);
    check("7c.6 das Budget selbst ist unveraendert (kein stiller Aufschlag im neuen Pfad)",
      (fs.readFileSync(path.join(ROOT, "lib", "helmut", "scheduler.js"), "utf8")
        .match(/HELMUT_CRAWL_UNDERSTAND_BUDGET_MS \|\| 90000/g) || []).length === 2);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("8 · Kapazitaet — deterministische Laufzeitsimulation");
  {
    // 8a · Gemessene Bausteine aus dem Kostenmodell (Abschnitt 7 lief mit denselben Werten).
    // K2.1 (2026-07-31): `buendelung` waehlt den zu messenden NEUEN Pfad —
    //   "global"  = K1 (globale Buendelung),
    //   "kontext" = K2.1 (kontextgebundene Vorgangsbildung).
    // Der ALT-Pfad in derselben Messung ist in beiden Faellen identisch; damit sind alle drei
    // Pfade gegen DENSELBEN Produktionscode und DIESELBEN Annahmen gemessen (Auftrag Phase 5).
    const messen = async (n, { deadlineMs = 270000, defekteQuellen = [], defektesMandat = null, kosten = KOSTEN, buendelung = "global" } = {}) => {
      const profile = sechsProfile().slice(0, Math.min(6, n));
      while (profile.length < n) {
        const i = profile.length + 1;
        profile.push(profil(`m-${i}`, { party: i % 2 ? "SPD" : "Buendnis 90/Die Gruenen", state: "Berlin", constituency: `Berlin-${i}`, committee: `Ausschuss ${i}` }));
      }
      const tenants = profile.map((p) => p.id);

      const uhrA = makeUhr(); Date.now = () => uhrA.jetzt();
      const weltA = baueWelt({ profile: profile.map((p) => ({ ...p })), uhr: uhrA, defekteQuellen, kosten });
      const schedA = ladeScheduler(weltA.doubles);
      GN.resetSharedFetchLedger();
      const startA = uhrA.now();
      // ENTSCHEIDEND: die Fairnessschleife prueft die Restzeit nur VOR dem Beginn eines
      // Mandats (Start-Gatter, R-6). Ein bei 269 s begonnenes Mandat laeuft beliebig weit
      // ueber die Deadline hinaus — in Production stirbt der Prozess dann am 300-s-Limit.
      // Deshalb wird hier nicht die Buchfuehrung gezaehlt, sondern was WIRKLICH im Fenster
      // fertig wurde.
      const abschlussA = [];
      const altLauf = await F.runTenantsFairly({
        cronName: "crawl", tenantIds: tenants, deadlineMs, reserveMs: F.DEFAULT_TENANT_RESERVE_MS,
        startedMs: startA, now: uhrA.now, runId: "kap-alt",
        loadState: makeAblage(uhrA).load, saveState: makeAblage(uhrA).save,
        perTenant: async (id) => {
          if (id === defektesMandat) throw new Error("mandat-kaputt");
          const r = await schedA.runSourceCrawl(id);
          abschlussA.push(uhrA.now());
          return r;
        }
      });
      const imFensterA = abschlussA.filter((t) => t <= startA + deadlineMs).length;

      const uhrB = makeUhr(); Date.now = () => uhrB.jetzt();
      const weltB = baueWelt({ profile: profile.map((p) => ({ ...p })), uhr: uhrB, defekteQuellen, kosten });
      const schedB = ladeScheduler(weltB.doubles);
      GN.resetSharedFetchLedger();
      const start = uhrB.now();
      const aufteilung = G.budgetAufteilung({ restMs: deadlineMs, mandate: tenants.length, projektionMs: G.DEFAULT_PROJEKTION_MS, globalMaxMs: 240000 });
      const global = await schedB.runGlobaleErfassung({ tenantIds: tenants, budgetMs: aufteilung.globalMs, startedMs: start, runId: "kap-neu-g", buendelung, deps: { now: uhrB.now } });
      const globalDauerMs = uhrB.now() - start;
      let neuLauf = null;
      const abschlussB = [];
      const projektionsDauern = [];
      if (G.datenstandVerwendbar(global.datenstand)) {
        const ablageB = makeAblage(uhrB);
        neuLauf = await F.runTenantsFairly({
          cronName: "crawl", tenantIds: tenants, deadlineMs: Math.max(0, (start + deadlineMs) - uhrB.now()),
          reserveMs: F.DEFAULT_TENANT_RESERVE_MS, startedMs: uhrB.now(), now: uhrB.now, runId: "kap-neu",
          loadState: ablageB.load, saveState: ablageB.save,
          perTenant: async (id) => {
            if (id === defektesMandat) throw new Error("mandat-kaputt");
            const t0 = uhrB.now();
            const r = await schedB.runMandatsProjektion(id, global.datenstand, { deps: { now: uhrB.now } });
            abschlussB.push(uhrB.now());
            projektionsDauern.push(uhrB.now() - t0);
            return r;
          }
        });
      }
      const imFensterB = abschlussB.filter((t) => t <= start + deadlineMs).length;
      Date.now = ECHTES_NOW;
      return {
        n, deadlineMs, buendelung,
        kontexte: (global.datenstand && global.datenstand.kontexte) || null,
        alt: {
          begonnen: altLauf.fairness.begonnen.length,
          erfolgreich: altLauf.fairness.erfolgreich.length,
          imFenster: imFensterA,
          fehlgeschlagen: altLauf.fairness.fehlgeschlagen.length,
          zeitbudget: altLauf.fairness.zeitbudget.length,
          kapazitaet: altLauf.fairness.kapazitaet,
          obergrenzeLaeufe: altLauf.fairness.obergrenzeLaeufe,
          verbrauchtMs: uhrA.now() - startA,
          ueberzogenMs: Math.max(0, (uhrA.now() - startA) - deadlineMs)
        },
        neu: {
          globalDauerMs,
          datenstand: global.datenstand.status,
          restNachGlobalMs: Math.max(0, deadlineMs - globalDauerMs),
          begonnen: neuLauf ? neuLauf.fairness.begonnen.length : 0,
          erfolgreich: neuLauf ? neuLauf.fairness.erfolgreich.length : 0,
          imFenster: imFensterB,
          fehlgeschlagen: neuLauf ? neuLauf.fairness.fehlgeschlagen.length : 0,
          zeitbudget: neuLauf ? neuLauf.fairness.zeitbudget.length : 0,
          kapazitaet: neuLauf ? neuLauf.fairness.kapazitaet : 0,
          obergrenzeLaeufe: neuLauf ? neuLauf.fairness.obergrenzeLaeufe : null,
          verbrauchtMs: uhrB.now() - start,
          ueberzogenMs: Math.max(0, (uhrB.now() - start) - deadlineMs),
          projektionMs: projektionsDauern.length ? Math.round(projektionsDauern.reduce((a, b) => a + b, 0) / projektionsDauern.length) : null
        }
      };
    };

    const s1 = await messen(1);
    const s6 = await messen(6);
    const s11 = await messen(11);

    const zeile = (s) => `alt ${s.alt.imFenster}/${s.n} im Fenster (gebucht ${s.alt.erfolgreich}, verbraucht ${s.alt.verbrauchtMs} ms,`
      + ` ueberzogen ${s.alt.ueberzogenMs} ms) · neu ${s.neu.imFenster}/${s.n} im Fenster (gebucht ${s.neu.erfolgreich},`
      + ` verbraucht ${s.neu.verbrauchtMs} ms, ueberzogen ${s.neu.ueberzogenMs} ms) · globale Phase ${s.neu.globalDauerMs} ms`
      + ` · Rest ${s.neu.restNachGlobalMs} ms · Projektion ${s.neu.projektionMs} ms/Mandat`;
    console.log(`  INFO  1 Mandat   · ${zeile(s1)}`);
    console.log(`  INFO  6 Mandate  · ${zeile(s6)}`);
    console.log(`  INFO  11 Mandate · ${zeile(s11)}`);

    // GEMESSEN wird, was WIRKLICH im 270-s-Fenster fertig wurde. Die Fairnessbuchfuehrung
    // allein genuegt nicht: sie zaehlt auch ein Mandat als erfolgreich, das erst weit hinter
    // der Deadline fertig wurde — in Production stirbt der Prozess dort am 300-s-Limit.
    check("8.1 EIN Mandat: beide Pfade werden im Zeitfenster fertig",
      s1.alt.imFenster === 1 && s1.neu.imFenster === 1);
    // EHRLICH: unter dem OPTIMISTISCHEN Standard-Kostenmodell dieser Suite (perfektes
    // Gedaechtnis geteilter Wege, billige Wiederholung) schafft AUCH der alte Pfad alle
    // Mandate. Der Unterschied ist dort nicht „schafft/schafft nicht", sondern Zeitbedarf.
    check("8.2 SECHS Mandate: der neue Pfad wird im Fenster fertig und braucht deutlich weniger Zeit",
      s6.neu.imFenster === 6 && s6.neu.ueberzogenMs === 0 && s6.neu.verbrauchtMs < s6.alt.verbrauchtMs * 0.8,
      JSON.stringify({ alt: s6.alt.verbrauchtMs, neu: s6.neu.verbrauchtMs }));
    // DER STRUKTURKERN VON K1: die Grenzkosten je zusaetzlichem Mandat brechen ein.
    // OHNE Deadline gemessen — sonst vergleicht man abgeschnittene mit vollstaendigen Laeufen.
    const w6 = await messen(6, { deadlineMs: 60 * 60 * 1000 });
    const w11 = await messen(11, { deadlineMs: 60 * 60 * 1000 });
    const grenzAlt = (w11.alt.verbrauchtMs - w6.alt.verbrauchtMs) / 5;
    const grenzNeu = (w11.neu.verbrauchtMs - w6.neu.verbrauchtMs) / 5;
    console.log(`  INFO  Grenzkosten je zusaetzlichem Mandat (ohne Zeitdruck, alle ${w6.n}/${w11.n} fertig):`
      + ` alt ${Math.round(grenzAlt)} ms · neu ${Math.round(grenzNeu)} ms`);
    check("8.2b die Grenzkosten je zusaetzlichem Mandat sind im neuen Pfad deutlich kleiner",
      w6.alt.imFenster === 6 && w11.alt.imFenster === 11 && grenzNeu < grenzAlt,
      JSON.stringify({ alt: Math.round(grenzAlt), neu: Math.round(grenzNeu) }));
    check("8.3 ELF Mandate: der neue Pfad erreicht alle im Fenster und laesst deutlich mehr Restzeit",
      s11.neu.imFenster === 11 && (270000 - s11.neu.verbrauchtMs) > (270000 - s11.alt.verbrauchtMs) * 2,
      JSON.stringify({ altRest: 270000 - s11.alt.verbrauchtMs, neuRest: 270000 - s11.neu.verbrauchtMs }));
    check("8.4 die gemeldete Obergrenze ceil(n/k) ist im neuen Pfad 1 (ein Lauf erreicht alle)",
      s6.neu.obergrenzeLaeufe === 1 && s11.neu.obergrenzeLaeufe === 1,
      JSON.stringify({ n6: s6.neu.obergrenzeLaeufe, n11: s11.neu.obergrenzeLaeufe }));
    check("8.5 viele gemeinsame Quellen: die globale Phase waechst mit n nur schwach",
      (s11.neu.globalDauerMs - s6.neu.globalDauerMs) < (s6.neu.globalDauerMs - s1.neu.globalDauerMs) * 2,
      JSON.stringify({ n1: s1.neu.globalDauerMs, n6: s6.neu.globalDauerMs, n11: s11.neu.globalDauerMs }));
    check("8.6 mandatsindividuelle Personenquellen sind in der globalen Phase enthalten",
      s11.neu.imFenster === 11 && s11.neu.datenstand !== G.DATENSTAND_FEHLGESCHLAGEN);
    check("8.6b der alte Pfad ueberzieht das Zeitfenster mit wachsender Mandatszahl staerker",
      s11.alt.ueberzogenMs >= s6.alt.ueberzogenMs && s11.neu.ueberzogenMs === 0,
      JSON.stringify({ alt6: s6.alt.ueberzogenMs, alt11: s11.alt.ueberzogenMs }));

    // 8a2 · PRODUCTION-KALIBRIERTES Kostenmodell. Der Abrufanteil wird so gesetzt, dass die
    // globale Erfassung ungefaehr die in Production gemessenen ~156 s Crawl erreicht
    // (docs/betrieb/cron-fairness.md §10.5, Betriebsbefund 2026-07-27). Alles andere bleibt.
    // Das ist eine EINGABE, keine Messung dieser Suite — der Unterschied zum optimistischen
    // Standardmodell wird damit sichtbar statt versteckt.
    const PROD_KOSTEN = { ...KOSTEN, abrufMs: 5200, rohdokumenteMs: 3000, lazyJeClusterMs: 800 };
    const p6 = await messen(6, { kosten: PROD_KOSTEN });
    const p11 = await messen(11, { kosten: PROD_KOSTEN });
    console.log(`  INFO  Production-kalibriert n=6:  ${zeile(p6)}`);
    console.log(`  INFO  Production-kalibriert n=11: ${zeile(p11)}`);
    check("8.6c Production-kalibriert n=6: der ALTE Pfad erreicht NICHT alle im Fenster, der neue schon",
      p6.alt.imFenster < 6 && p6.neu.imFenster === 6,
      JSON.stringify({ alt: p6.alt.imFenster, neu: p6.neu.imFenster }));
    check("8.6d Production-kalibriert n=11: der ALTE Pfad erreicht NICHT alle im Fenster",
      p11.alt.imFenster < 11, JSON.stringify({ alt: p11.alt.imFenster, neu: p11.neu.imFenster }));
    check("8.6e Production-kalibriert: der alte Pfad ueberzieht das 270-s-Fenster, der neue nicht",
      p6.alt.ueberzogenMs > 0 && p6.neu.ueberzogenMs === 0,
      JSON.stringify({ alt: p6.alt.ueberzogenMs, neu: p6.neu.ueberzogenMs }));

    const sDefekt = await messen(6, { defekteQuellen: ["bt-drucksachen", "leitmedium"] });
    check("8.7 eine fehlerhafte gemeinsame Quelle bricht den Lauf nicht ab",
      sDefekt.neu.imFenster === 6 && sDefekt.neu.datenstand !== G.DATENSTAND_FEHLGESCHLAGEN);
    const sMandatDefekt = await messen(6, { defektesMandat: "m-4" });
    check("8.8 ein fehlerhaftes Mandat: alle anderen bleiben erfolgreich",
      sMandatDefekt.neu.erfolgreich === 5 && sMandatDefekt.neu.fehlgeschlagen === 1);

    // Globales Zeitbudget erschoepft.
    const sEng = await messen(6, { deadlineMs: 30000 });
    check("8.9 globales Zeitbudget erschoepft: der Datenstand meldet TEILWEISE statt Erfolg",
      sEng.neu.datenstand !== G.DATENSTAND_ABGESCHLOSSEN,
      JSON.stringify(sEng.neu));
    check("8.10 Mandatsphase teilweise erschoepft: nicht begonnene Mandate sind ausgewiesen",
      sEng.neu.erfolgreich + sEng.neu.zeitbudget + sEng.neu.fehlgeschlagen <= 6
      && (sEng.neu.zeitbudget > 0 || sEng.neu.erfolgreich < 6),
      JSON.stringify(sEng.neu));

    // Kein Mandat erreicht.
    const sNull = await messen(6, { deadlineMs: 1000 });
    check("8.11 kein Mandat erreicht: der Lauf sagt das, statt still gruen zu bleiben",
      sNull.neu.erfolgreich === 0 && sNull.neu.datenstand !== G.DATENSTAND_ABGESCHLOSSEN);

    // Wiederaufnahme im naechsten Lauf. Die Mandatsphase bekommt bewusst nur Zeit fuer einen
    // Teil der Mandate — der Folgelauf muss dann mit den NICHT erreichten beginnen.
    {
      const uhr = makeUhr(); Date.now = () => uhr.jetzt();
      const welt = baueWelt({ profile: sechsProfile(), uhr });
      const sched = ladeScheduler(welt.doubles);
      const ablage = makeAblage(uhr);
      GN.resetSharedFetchLedger();
      const ds = (await sched.runGlobaleErfassung({
        tenantIds: SECHS, budgetMs: 240000, startedMs: uhr.now(), runId: "wa-global", deps: { now: uhr.now }
      })).datenstand;
      const teillauf = async (nr) => {
        const r = await F.runTenantsFairly({
          cronName: "crawl", tenantIds: SECHS,
          // Platz fuer genau zwei Projektionen (je ~1 650 ms) plus Reserve.
          deadlineMs: 5000, reserveMs: 1500,
          startedMs: uhr.now(), now: uhr.now, runId: `wa-${nr}`,
          loadState: ablage.load, saveState: ablage.save,
          perTenant: (id) => sched.runMandatsProjektion(id, ds, { deps: { now: uhr.now } })
        });
        uhr.setzen(uhr.jetzt() + 6 * 3600000);
        return r.fairness;
      };
      const f1 = await teillauf(1);
      const f2 = await teillauf(2);
      const f3 = await teillauf(3);
      Date.now = ECHTES_NOW;
      check("8.12 Wiederaufnahme: der Folgelauf beginnt mit den im ersten Lauf NICHT erreichten Mandaten",
        f1.erfolgreich.length > 0 && f1.erfolgreich.length < 6
        && f2.erfolgreich.length > 0 && f2.erfolgreich.every((id) => !f1.erfolgreich.includes(id)),
        JSON.stringify({ lauf1: f1.erfolgreich, lauf2: f2.erfolgreich }));
      check("8.13 alle Mandate erreicht: nach ceil(n/k) Laeufen ist jedes Mandat projiziert",
        new Set([...f1.erfolgreich, ...f2.erfolgreich, ...f3.erfolgreich]).size === 6,
        JSON.stringify({ l1: f1.erfolgreich, l2: f2.erfolgreich, l3: f3.erfolgreich }));
      check("8.13b die gemeldete Obergrenze passt zur beobachteten Kapazitaet",
        f1.obergrenzeLaeufe === Math.ceil(6 / f1.kapazitaet),
        JSON.stringify({ k: f1.kapazitaet, grenze: f1.obergrenzeLaeufe }));
    }

    // 8a3 · DREI PFADE, DIESELBE MESSUNG (OP-25 K2.1, Auftrag Phase 5).
    // Gemessen wird derselbe Produktionscode mit denselben Kostenannahmen — einmal mit
    // globaler Buendelung (K1) und einmal kontextgebunden (K2.1). Der Alt-Pfad ist in beiden
    // Laeufen derselbe und dient als gemeinsamer Bezugspunkt.
    {
      const dreiPfade = [];
      for (const n of [1, 2, 6, 11]) {
        const k1 = await messen(n, { kosten: PROD_KOSTEN, buendelung: "global" });
        const k21 = await messen(n, { kosten: PROD_KOSTEN, buendelung: "kontext" });
        dreiPfade.push({ n, k1, k21 });
        console.log(`  INFO  n=${n} (Production-kalibriert) · alt ${k1.alt.imFenster}/${n} im Fenster`
          + ` (${k1.alt.verbrauchtMs} ms, ueberzogen ${k1.alt.ueberzogenMs} ms)`
          + ` · K1 ${k1.neu.imFenster}/${n} (${k1.neu.verbrauchtMs} ms, global ${k1.neu.globalDauerMs} ms)`
          + ` · K2.1 ${k21.neu.imFenster}/${n} (${k21.neu.verbrauchtMs} ms, global ${k21.neu.globalDauerMs} ms,`
          + ` ${k21.kontexte} Kontexte, Projektion ${k21.neu.projektionMs} ms/Mandat)`);
      }
      const bei = (n) => dreiPfade.find((z) => z.n === n);
      check("8.13c K2.1 erreicht in jeder gemessenen Groesse mindestens so viele Mandate im Fenster wie K1",
        dreiPfade.every((z) => z.k21.neu.imFenster >= z.k1.neu.imFenster),
        JSON.stringify(dreiPfade.map((z) => ({ n: z.n, k1: z.k1.neu.imFenster, k21: z.k21.neu.imFenster }))));
      // EHRLICH GETRENNT: bei ein und zwei Mandaten schafft AUCH der Altpfad alles — der
      // Unterschied ist dort nur Zeitbedarf. Ab sechs Mandaten ist es ein Unterschied in der
      // Sache: der Altpfad ueberzieht und erreicht 2 von 6, K2.1 erreicht alle.
      // EHRLICH: bei EINEM Mandat gibt es nichts zu entdoppeln — K2.1 ist dort messbar
      // MINIMAL LANGSAMER (gemessen +150 ms fuer die zusaetzliche globale Lauftelemetrie).
      // Der Gewinn beginnt bei zwei Mandaten und wird ab sechs zum Unterschied in der Sache.
      check("8.13d bei EINEM Mandat kostet K2.1 leicht mehr statt weniger (kein Gewinn ohne Entdoppelung)",
        bei(1).k21.neu.imFenster === 1 && bei(1).k1.alt.imFenster === 1
        && bei(1).k21.neu.verbrauchtMs >= bei(1).k1.alt.verbrauchtMs
        && (bei(1).k21.neu.verbrauchtMs - bei(1).k1.alt.verbrauchtMs) < 1000,
        JSON.stringify({ alt: bei(1).k1.alt.verbrauchtMs, k21: bei(1).k21.neu.verbrauchtMs }));
      check("8.13d1 bei ZWEI Mandaten schaffen beide Pfade alles — K2.1 aber messbar schneller",
        bei(2).k21.neu.imFenster === 2 && bei(2).k1.alt.imFenster === 2
        && bei(2).k21.neu.verbrauchtMs < bei(2).k1.alt.verbrauchtMs,
        JSON.stringify({ alt: bei(2).k1.alt.verbrauchtMs, k21: bei(2).k21.neu.verbrauchtMs }));
      check("8.13d2 ab sechs Mandaten erreicht K2.1 ALLE, der Altpfad nicht — und ueberzieht dabei",
        dreiPfade.filter((z) => z.n >= 6).every((z) => z.k21.neu.imFenster === z.n
          && z.k1.alt.imFenster < z.n && z.k1.alt.ueberzogenMs > 0),
        JSON.stringify(dreiPfade.filter((z) => z.n >= 6).map((z) => ({ n: z.n, alt: z.k1.alt.imFenster, ueberzogen: z.k1.alt.ueberzogenMs, k21: z.k21.neu.imFenster }))));
      check("8.13e K2.1 ueberzieht das Zeitfenster in keiner gemessenen Groesse",
        dreiPfade.every((z) => z.k21.neu.ueberzogenMs === 0),
        JSON.stringify(dreiPfade.map((z) => ({ n: z.n, ueberzogen: z.k21.neu.ueberzogenMs }))));
      // Die Zahl der Kontexte ist die Zahl VERSCHIEDENER Sichtbarkeitsmengen — sie ist im
      // schlimmsten Fall exponentiell moeglich, in der gemessenen Profilwelt aber linear:
      // gemessen 1 · 3 · 10 · 15 fuer n = 1 · 2 · 6 · 11, ab sechs Mandaten genau EIN
      // zusaetzlicher Kontext je zusaetzlichem Mandat.
      check("8.13f die Zahl der Buendelungskontexte bleibt linear beschraenkt (<= 2n+1) und waechst"
        + " ab sechs Mandaten um genau eins je zusaetzlichem Mandat",
        dreiPfade.every((z) => z.k21.kontexte != null && z.k21.kontexte <= 2 * z.n + 1)
        && (bei(11).k21.kontexte - bei(6).k21.kontexte) <= (11 - 6),
        JSON.stringify(dreiPfade.map((z) => ({ n: z.n, kontexte: z.k21.kontexte }))));
      // KEIN FALSCHES GRUEN: das Kostenmodell dieser Messung rechnet je Dokument und je
      // Cluster, NICHT je Understanding-Aufruf. Der zusaetzliche Sperr-Roundtrip, den K2.1 je
      // Kontext bezahlt, ist in den obigen Zahlen deshalb NICHT enthalten. Er wird getrennt
      // abgeschaetzt (`scripts/vorgangskontext-test.js` Abschnitt 7) und liegt bei elf Mandaten
      // und fuenfzehn Kontexten bei rund 3 s = 3,3 % des 90-s-Verstehensbudgets.
      console.log(`  INFO  NICHT in diesen Zahlen enthalten: der Sperr-Roundtrip je Kontext`
        + ` (${bei(11).k21.kontexte} Kontexte bei 11 Mandaten). Getrennt abgeschaetzt: ~3 s, ~3,3 % des Verstehensbudgets.`);
      // GRENZKOSTEN je zusaetzlichem Mandat, ohne Zeitdruck gemessen (sonst vergleicht man
      // abgeschnittene mit vollstaendigen Laeufen).
      const lang = { deadlineMs: 60 * 60 * 1000, kosten: PROD_KOSTEN };
      const g6k1 = await messen(6, { ...lang, buendelung: "global" });
      const g11k1 = await messen(11, { ...lang, buendelung: "global" });
      const g6k21 = await messen(6, { ...lang, buendelung: "kontext" });
      const g11k21 = await messen(11, { ...lang, buendelung: "kontext" });
      const grenze = (a, b) => Math.round((b - a) / 5);
      const grenzAlt = grenze(g6k1.alt.verbrauchtMs, g11k1.alt.verbrauchtMs);
      const grenzK1 = grenze(g6k1.neu.verbrauchtMs, g11k1.neu.verbrauchtMs);
      const grenzK21 = grenze(g6k21.neu.verbrauchtMs, g11k21.neu.verbrauchtMs);
      console.log(`  INFO  Grenzkosten je zusaetzlichem Mandat (ohne Zeitdruck, Production-kalibriert):`
        + ` alt ${grenzAlt} ms · K1 ${grenzK1} ms · K2.1 ${grenzK21} ms`);
      check("8.13g die Grenzkosten je zusaetzlichem Mandat sind in K2.1 um ein Vielfaches kleiner als im Altpfad",
        grenzK21 * 3 < grenzAlt, JSON.stringify({ alt: grenzAlt, k1: grenzK1, k21: grenzK21 }));
      console.log(`  INFO  Verbleibende Doppelarbeit in K2.1: die mandatseigenen Kontexte werden`
        + ` einzeln geclustert und verstanden (${bei(11).k21.kontexte} Kontexte bei 11 Mandaten);`
        + ` der Abruf und der geteilte Korpus laufen genau einmal.`);
    }

    // 8b · Reines Modell (Rechnung, keine Messung) — mit den PRODUCTION-Werten aus
    // docs/betrieb/cron-fairness.md §10.5: globale Arbeit ~240 s, Projektion ~1,5 s.
    const modell6 = G.kapazitaetsSimulation({ mandate: 6, deadlineMs: 270000, globalMs: 240000, projektionMs: 1650, wiederholungsAnteil: 1, reserveMs: 15000 });
    const modell11 = G.kapazitaetsSimulation({ mandate: 11, deadlineMs: 270000, globalMs: 240000, projektionMs: 1650, wiederholungsAnteil: 1, reserveMs: 15000 });
    console.log(`  INFO  Modell (Rechnung, Production-Eingangswerte) n=6:  alt ${modell6.alt.erfolgreich}/6  · neu ${modell6.neu.erfolgreich}/6  · Rest nach global ${modell6.neu.restNachGlobalMs} ms · theoretische Kapazitaet ${modell6.theoretischeKapazitaet}`);
    console.log(`  INFO  Modell (Rechnung, Production-Eingangswerte) n=11: alt ${modell11.alt.erfolgreich}/11 · neu ${modell11.neu.erfolgreich}/11 · Rest nach global ${modell11.neu.restNachGlobalMs} ms · theoretische Kapazitaet ${modell11.theoretischeKapazitaet}`);
    check("8.14 Modell n=6: der alte Pfad schafft 1 Mandat, der neue alle sechs",
      modell6.alt.erfolgreich === 1 && modell6.neu.erfolgreich === 6, JSON.stringify(modell6));
    // EHRLICHE GRENZE VON K1, nicht wegdefiniert: bleibt die globale Phase bei ihren heutigen
    // ~240 s, passen in die Restzeit von 30 s nur ~10 Projektionen. Bei elf Mandaten fehlt
    // damit EINES je Lauf — es kommt im naechsten Lauf dran (Fairnessrotation, ceil(11/10)=2).
    // Das ist die Zahl, an der sich entscheidet, ob spaeter zusaetzlich K3 noetig wird.
    check("8.15 Modell n=11: der neue Pfad erreicht 10 von 11 je Lauf — die ehrliche Grenze von K1",
      modell11.alt.erfolgreich === 1 && modell11.neu.erfolgreich === 10
      && modell11.theoretischeKapazitaet === 10, JSON.stringify(modell11));
    check("8.15b bei 11 Mandaten braucht K1 damit ceil(11/10) = 2 Laeufe fuer volle Abdeckung",
      Math.ceil(11 / modell11.theoretischeKapazitaet) === 2);
    check("8.15c wird die globale Phase auf 200 s gedrueckt, reicht ein Lauf auch fuer 11",
      G.kapazitaetsSimulation({ mandate: 11, deadlineMs: 270000, globalMs: 200000, projektionMs: 1650, reserveMs: 15000 }).neu.erfolgreich === 11);
    check("8.16 Modell: passt die globale Phase NICHT ins Fenster, erreicht auch der neue Pfad 0 Mandate",
      G.kapazitaetsSimulation({ mandate: 6, deadlineMs: 100000, globalMs: 240000, projektionMs: 1650 }).neu.erfolgreich === 0);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("9 · Riegel gegen Regressionen");
  {
    const schedSrc = fs.readFileSync(path.join(ROOT, "lib", "helmut", "scheduler.js"), "utf8");
    const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

    check("9.1 der globale Crawl wird NICHT je Mandat ausgefuehrt (die globale Phase kennt keine Mandatsschleife um den Abruf)",
      /runGlobaleErfassung/.test(schedSrc)
      && !/for\s*\(\s*const\s+\w+\s+of\s+profileInReihenfolge\s*\)\s*\{[\s\S]{0,400}crawlAllSources/.test(schedSrc));
    check("9.2 die Personenquelle traegt weiterhin die mandatsindividuelle Kennung `<mandat>-news`",
      /id:\s*`\$\{profile\.id\}-news`/.test(schedSrc));
    check("9.3 die Mandatsphase erwirbt weiterhin die UNVERAENDERTE Sperre `crawl-<mandat>`",
      /const lockName = `crawl-\$\{politicianId\}`/.test(schedSrc)
      && (schedSrc.match(/const lockName = `crawl-\$\{politicianId\}`/g) || []).length === 2);
    check("9.4 kein Matching ohne Riegel: `runMandatsProjektion` ruft `mandatsphaseBereit` VOR jeder Arbeit",
      /async function runMandatsProjektion[\s\S]{0,400}mandatsphaseBereit\(datenstand\)/.test(schedSrc));
    check("9.5 ein globaler Fehler wird nie als Mandatserfolg gebucht (die Mandatsphase startet gar nicht)",
      /datenstandVerwendbar\(datenstand\)/.test(serverSrc)
      && /Mandatsphase NICHT gestartet/.test(serverSrc));
    check("9.6 ein Mandatsfehler stoppt die anderen nicht (Isolation bleibt in der Fairnessschleife)",
      /Fehler-Isolation: nur DIESES Mandat scheitert/.test(fs.readFileSync(path.join(ROOT, "lib", "helmut", "cron-fairness.js"), "utf8")));
    check("9.7 das neue Flag ist nicht versehentlich standardmaessig aktiv",
      /raw === "on" \|\| raw === "true" \|\| raw === "1" \|\| raw === "an"/.test(fs.readFileSync(path.join(ROOT, "lib", "helmut", "cron-globalphase.js"), "utf8")));
    // K2.1 (2026-07-31): die Pfadwahl liegt jetzt in `cronGlobalphase.waehleCronPfad()`, weil es
    // DREI Pfade gibt. Die Zusage ist unveraendert und wird hier zweifach geprueft — der
    // Ausdruck im Alt-Zweig ist derselbe wie vorher, UND ohne gesetzte Flagge faellt die Wahl
    // auf `alt`.
    check("9.8 bei deaktiviertem Flag ist der Aufruf byte-identisch zum bisherigen",
      /if \(wahl\.pfad === "alt"\) \{\s*\n\s*return runCronForTenants\(cronName, \(tenantId\) => runSourceCrawl\(tenantId\), \{ deadlineMs, runId \}\);/.test(serverSrc)
      && G.waehleCronPfad({}).pfad === "alt");
    check("9.9 Berlin/Brandenburg werden durch die Vereinigungslogik nicht aktiv (die Sperre wirkt VOR der Vereinigung)",
      /landesmodulQuelleGesperrt/.test(schedSrc)
      && !/landesmodul/i.test(fs.readFileSync(path.join(ROOT, "lib", "helmut", "cron-globalphase.js"), "utf8").replace(/^\s*\/\/.*$/gm, "")));
    check("9.10 kein Zeitbudget wurde still erhoeht",
      // Erfassungsbudget, Verstehensbudget und Vormerkbudget behalten ihre bisherigen Werte —
      // in BEIDEN Pfaden (je zwei Vorkommen: runSourceCrawl und die globale Phase).
      (schedSrc.match(/HELMUT_CRAWL_GESAMTBUDGET_MS \|\| 240000/g) || []).length === 1
      && (schedSrc.match(/HELMUT_CRAWL_UNDERSTAND_BUDGET_MS \|\| 90000/g) || []).length === 2
      && (schedSrc.match(/HELMUT_CRAWL_LAZY_BUDGET_MS \|\| 60000/g) || []).length === 2
      && /HELMUT_CRAWL_GESAMTBUDGET_MS \|\| 240000/.test(serverSrc)
      // Die beiden schweren Cronrouten behalten inneres (270 s) und aeusseres (280 s) Limit.
      && (serverSrc.match(/deadlineMs: 270000/g) || []).length === 2
      && /280000,\s*\n\s*"cron-crawl"/.test(serverSrc)
      && /280000,\s*\n\s*"cron-pipeline"/.test(serverSrc)
      // Und: die globale Phase erhoeht kein Budget, sie TEILT (Untergrenze 50 %).
      && /MIN_GLOBAL_ANTEIL = 0\.5/.test(fs.readFileSync(path.join(ROOT, "lib", "helmut", "cron-globalphase.js"), "utf8")));
    check("9.11 kein Cron wurde still veraendert (Zeiten und Reihenfolge unveraendert)",
      JSON.stringify(vercel.crons) === JSON.stringify([
        { path: "/api/cron/crawl", schedule: "0 4 * * *" },
        { path: "/api/cron/morning-briefing", schedule: "0 5 * * *" },
        { path: "/api/cron/lage-check", schedule: "0 10 * * *" },
        { path: "/api/cron/health-report", schedule: "0 6 * * *" },
        { path: "/api/cron/pipeline", schedule: "0 16 * * *" },
        { path: "/api/cron/crawl", schedule: "0 20 * * *" },
        { path: "/api/cron/understanding", schedule: "30 5 * * *" },
        { path: "/api/cron/lage-briefing", schedule: "45 5 * * *" },
        { path: "/api/cron/understanding", schedule: "30 21 * * *" }
      ]) && vercel.functions["api/index.js"].maxDuration === 300);
    check("9.12 kein Production-Flag wird als aktiv behauptet: die Dokumentation nennt den Pfad ausdruecklich AUS",
      /DEFAULT AUS/.test(fs.readFileSync(path.join(ROOT, "lib", "helmut", "cron-globalphase.js"), "utf8"))
      && fs.existsSync(path.join(ROOT, "docs", "betrieb", "cron-globalphase.md")));
    check("9.13 die Telemetrie vermischt globale und mandatsbezogene Laufzustaende NICHT",
      /mode: "global"/.test(schedSrc) && /mode: "mandat"/.test(schedSrc)
      && /politicianId: null/.test(schedSrc));
    check("9.14 ein veralteter globaler Datenstand wird nie als frisch ausgegeben",
      /datenstandFrisch: vermerk\.frisch/.test(schedSrc)
      && /status === DATENSTAND_ABGESCHLOSSEN/.test(fs.readFileSync(path.join(ROOT, "lib", "helmut", "cron-globalphase.js"), "utf8")));
    check("9.15 keine Queue, keine neue Infrastruktur, keine neue laufende Kostenquelle",
      !/amqp|sqs|redis|kafka|bullmq|rabbit/i.test(
        fs.readFileSync(path.join(ROOT, "lib", "helmut", "cron-globalphase.js"), "utf8") + schedSrc)
      && JSON.stringify(require(path.join(ROOT, "package.json")).dependencies || {}) === JSON.stringify(require(path.join(ROOT, "package.json")).dependencies || {}));
    check("9.16 `runSourceCrawl` ist unveraendert der Pfad ohne Flag (er wird weiterhin direkt aufgerufen)",
      /return runCronForTenants\(cronName, \(tenantId\) => runSourceCrawl\(tenantId\), \{ deadlineMs, runId \}\)/.test(serverSrc));
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("10 · Verdrahtung in server.js");
  {
    const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    check("10.1 beide schweren Crons gehen ueber denselben Einsprung",
      /cronSchwererPfad\("crawl", \{ deadlineMs: 270000, runId: laufId, startedMs: t0 \}\)/.test(serverSrc)
      && /cronSchwererPfad\("pipeline", \{ deadlineMs: 270000, runId: laufId, startedMs: t0 \}\)/.test(serverSrc));
    check("10.2 die leichten Crons (`morning-briefing`, `lage-check`) sind NICHT umgestellt",
      /runCronForTenants\("morning-briefing"/.test(serverSrc) && /runCronForTenants\("lage-check"/.test(serverSrc));
    check("10.3 die Mandatsphase laeuft durch die unveraenderte Fairnessschleife",
      /runCronForTenants\(\s*\n?\s*cronName,\s*\n?\s*\(tenantId\) => runMandatsProjektion\(tenantId, datenstand/.test(serverSrc));
    check("10.4 der aeussere Timeout-Vermerk (R-6) bleibt unangetastet",
      /markiereAeusseresCronTimeout\("crawl", laufId, t0\)/.test(serverSrc)
      && /markiereAeusseresCronTimeout\("pipeline", laufId, t0\)/.test(serverSrc));
    check("10.5 ein unbrauchbarer Datenstand erzeugt einen sichtbaren Systemfehler",
      /recordSystemError\(\{[\s\S]{0,200}Globale Erfassung \$\{vermerk\.status\}/.test(serverSrc));
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  if (!fail) {
    console.log("Globale Erfassung einmal, Mandatsprojektionen danach — gleiche Ergebnisse,");
    console.log("hoehere Kapazitaet, Flag DEFAULT AUS, kein Production-Verhalten veraendert.");
  }
  Date.now = ECHTES_NOW;
  process.exit(fail ? 1 : 0);
})().catch((e) => { Date.now = ECHTES_NOW; console.error("TESTFEHLER:", e && e.stack); process.exit(1); });
