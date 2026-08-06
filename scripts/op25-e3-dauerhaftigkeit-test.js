"use strict";

// OP-25 E3 — Dauerhaftigkeit zurueckgestellter Verstehensarbeit + Statussemantik.
// =============================================================================================
// Diese Suite belegt am ECHTEN Produktionscode (scheduler.runGlobaleErfassung,
// understanding.runUnderstandingShadow / runPendingUnderstandingShadow,
// cron-globalphase.datenstandVersiegeln, storage.compactCrawlRunForStore):
//
//   1. WO und WIE `datenstand.status` entsteht — mit unabhaengigen, hart kodierten
//      Soll-Werten (nicht aus derselben Fixture abgeleitet).
//   2. Dass zurueckgestellte Eager-Cluster VERBINDLICH als pending-Wissensobjekte MIT
//      Dokumentverknuepfung vorgemerkt werden (dauerhaft), dass ein erschoepftes
//      Vormerkbudget EHRLICH als `nichtVorgemerkt` gezaehlt wird (benannte Luecke)
//      und dass wiederholtes Vormerken NIE Duplikate erzeugt (idempotent).
//   3. Dass vorgemerkte Vorgaenge vom Nachholpfad ueber ihre VERKNUEPFUNG wieder
//      gefunden werden (Betriebsbefund B4) — nicht ueber eine fragile Neu-Clusterung.
//   4. Dass die NEUE additive Telemetrie (datenstandDetail, globalphase-Prozesszeile,
//      Eager-Bilanz) die E3-Unterscheidung traegt: Verstehensrueckstand vs.
//      Persistenz-/Quellenfehler — inkl. des Fixes „Persistenzfehler ist nie mehr
//      stilles Gruen".
//   5. Dass compactCrawlRunForStore die Nachweisfelder BEHAELT und Fremdfelder
//      weiterhin strippt (Datensparsamkeit).
//
// Deterministisch und offline: injizierte Uhr fuer die globale Phase; die einzige
// Echtzeit-Abhaengigkeit (Understanding-Budgetschleife) nutzt eine 25-ms-Verzoegerung
// gegen ein 1-ms-Budget (Faktor 25 — kein Flackerrisiko). Kein Netz, keine KI,
// keine Production-Daten.

const path = require("path");
process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;

const scheduler = require(path.join(__dirname, "..", "lib", "helmut", "scheduler.js"));
const U = require(path.join(__dirname, "..", "lib", "helmut", "understanding.js"));
const G = require(path.join(__dirname, "..", "lib", "helmut", "cron-globalphase.js"));
const storage = require(path.join(__dirname, "..", "lib", "helmut", "storage.js"));

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// =============================================================================================
console.log("== 1 · Statusableitung (datenstandVersiegeln) — unabhaengige Soll-Werte ==");
// =============================================================================================
{
  const neu = () => G.datenstandNeu({ laufId: "l", startAt: 1000, mandate: 5 });
  check("1.1 Ohne Fehler und ohne Budgeterschoepfung => 'abgeschlossen'",
    G.datenstandVersiegeln(neu(), { nowMs: 2000 }).status === "abgeschlossen");
  check("1.2 budgetErschoepft => 'teilweise'",
    G.datenstandVersiegeln(neu(), { nowMs: 2000, budgetErschoepft: true }).status === "teilweise");
  check("1.3 Nicht-fataler Fehler (z. B. abruf/persistenz) => 'teilweise'",
    G.datenstandVersiegeln(neu(), { nowMs: 2000, fehler: [{ schritt: "persistenz", grund: "x" }] }).status === "teilweise");
  check("1.4 Fehlerhaftes Profil => 'teilweise'",
    G.datenstandVersiegeln(neu(), { nowMs: 2000, fehlerhafteProfile: ["t-9"] }).status === "teilweise");
  check("1.5 Fataler Fehler (kontextvertrag/sperre/erfassung) => 'fehlgeschlagen'",
    G.datenstandVersiegeln(neu(), { nowMs: 2000, fehler: [{ schritt: "kontextvertrag", grund: "x", fatal: true }] }).status === "fehlgeschlagen");
  check("1.6 Versiegeln ist EINMALIG — ein zweiter Abschluss hebt nichts",
    (() => {
      const d = G.datenstandVersiegeln(neu(), { nowMs: 2000, budgetErschoepft: true });
      return G.datenstandVersiegeln(d, { nowMs: 3000, budgetErschoepft: false }).status === "teilweise";
    })());
  check("1.7 'teilweise' ist nie 'frisch' (kein falsches Gruen im Lesepfad)",
    G.datenstandFrisch(G.datenstandVersiegeln(neu(), { nowMs: 2000, budgetErschoepft: true })) === false);
  // Review-Haertung 3: Dauer UND Budget gehoeren in den VERSIEGELTEN Datenstand, damit der
  // Nachweis die Budgetgrenze nicht am vorher gebildeten `durationMs` pruefen muss.
  const versiegelt = G.datenstandVersiegeln(neu(), { nowMs: 9500, budgetMs: 221000 });
  check("1.9 Versiegeln setzt dauerMs = nowMs - startAt (hier 9500 - 1000 = 8500)",
    versiegelt.dauerMs === 8500, String(versiegelt.dauerMs));
  const vermerk = G.datenstandVermerk(versiegelt);
  check("1.10 Der Vermerk traegt versiegelte dauerMs UND budgetMs",
    vermerk.dauerMs === 8500 && vermerk.budgetMs === 221000, JSON.stringify({ d: vermerk.dauerMs, b: vermerk.budgetMs }));
  check("1.11 Ohne uebergebenes Budget bleibt budgetMs ehrlich null (keine erfundene 0)",
    G.datenstandVermerk(G.datenstandVersiegeln(neu(), { nowMs: 2000 })).budgetMs === null);
  check("1.8 Mandatsphase wirft auf fehlgeschlagenem Datenstand",
    (() => {
      const d = G.datenstandVersiegeln(neu(), { nowMs: 2000, fehler: [{ schritt: "erfassung", grund: "x", fatal: true }] });
      try { G.mandatsphaseBereit(d); return false; } catch (e) { return /fehlgeschlagen/.test(String(e.message)); }
    })());
}

// =============================================================================================
console.log("\n== 2 · Globale Phase (echter Code, injizierte Uhr): E3-Telemetrie und Zaehlung ==");
// =============================================================================================

// Welt: 2 Mandate, 1 geteilte + 2 eigene Quellen => KONTEXTE: 1 geteilt + 2 mandatseigen = 3.
// (Harte Erwartung aus der Kontextdefinition, nicht aus dem Lauf abgeleitet.)
function baueWelt(config = {}) {
  const T0 = Date.parse("2026-08-10T16:00:03Z");
  const uhr = { t: T0 };
  const welt = {
    T0,
    uhr,
    lazyCalls: [],
    eagerCalls: [],
    crawlRuns: [],
    processRuns: [],
    pipelineFehler: []
  };
  const items = [
    { id: "i-1", sourceId: "geteilt-1", sourceName: "Geteilt", title: "Gemeinsames Thema Alpha Anhoerung", url: "https://example.org/a1", publishedAt: "2026-08-10T10:00:00Z" },
    { id: "i-2", sourceId: "t-1-eigen", sourceName: "EigenA", title: "Voellig anderes Thema Beta Gesetzentwurf", url: "https://example.org/b1", publishedAt: "2026-08-10T10:05:00Z" },
    { id: "i-3", sourceId: "t-2-eigen", sourceName: "EigenB", title: "Drittes unabhaengiges Thema Gamma Debatte", url: "https://example.org/c1", publishedAt: "2026-08-10T10:10:00Z" }
  ];
  welt.deps = {
    now: () => uhr.t,
    listFullProfiles: async () => [
      { id: "t-1", fullName: "Test Eins", profileActive: true },
      { id: "t-2", fullName: "Test Zwei", profileActive: true }
    ],
    quellenFuerProfil: async (profil) => [
      { id: "geteilt-1", type: "rss", url: "https://example.org/feed" },
      { id: `${profil.id}-eigen`, type: "rss", url: `https://example.org/${profil.id}` }
    ],
    crawlAllSources: async (sources) => {
      const ids = new Set(sources.map((s) => s.id));
      const rawItems = items.filter((i) => ids.has(i.sourceId));
      return {
        results: sources.map((s) => ({ sourceId: s.id, sourceName: s.id, ok: true, itemCount: rawItems.filter((i) => i.sourceId === s.id).length })),
        rawItems,
        checkedSources: sources.length,
        successfulSources: sources.length,
        failedSources: 0,
        newCandidateItems: rawItems.length,
        skippedSources: 0,
        circuitOpenSources: 0,
        sharedSkippedSources: 0,
        retriesTotal: 0,
        googleGate: null,
        googleUrlResolution: null
      };
    },
    fetchDipItems: async () => [],
    dipAktiv: () => false,
    saveRawItems: async (x) => x,
    persistRawDocuments: config.persistWirft
      ? async () => { throw new Error("persist kaputt (Test)"); }
      : async (x) => ({ persisted: x.length, deduped: x.length, candidates: x.length, schreibAnfragen: 2, einzelnNachgezogen: 0, zaehlerVerfehlt: config.zaehlerVerfehlt || 0, bestandsTreffer: 0 }),
    lazyUnderstanding: async (args) => {
      welt.lazyCalls.push(args.vorgangId);
      if (config.lazyDauerMs) uhr.t += config.lazyDauerMs;
      return { ok: true };
    },
    eagerUnderstanding: async (dokumente, opts) => {
      welt.eagerCalls.push({ n: dokumente.length, budgetMs: opts.budgetMs });
      if (config.eagerDauerMs) uhr.t += config.eagerDauerMs;
      return {
        processed: config.eagerVerarbeitet != null ? config.eagerVerarbeitet : 1,
        deferred: config.eagerZurueckgestellt != null ? config.eagerZurueckgestellt : 0,
        vorgemerkt: config.eagerVorgemerkt != null ? config.eagerVorgemerkt : 0,
        nichtVorgemerkt: config.eagerNichtVorgemerkt != null ? config.eagerNichtVorgemerkt : 0,
        counts: {}
      };
    },
    saveCrawlRun: async (run) => {
      const saved = { ...run, createdAt: new Date(uhr.t).toISOString() };
      welt.crawlRuns.unshift(saved);
      return saved;
    },
    listCrawlRuns: async () => [],
    recordProcessRun: async (entry) => { welt.processRuns.push(entry); return { ok: true, vollstaendig: true }; },
    recordPipelineError: async (e) => { welt.pipelineFehler.push(e); return { ok: true }; },
    acquireLock: async () => true,
    releaseLock: async () => {},
    hardeningConfig: () => ({ enabled: false }),
    createGate: () => null,
    evaluateCooldown: () => ({ active: false, skipGoogle: false, reason: null }),
    sharedLedger: () => null,
    persistSourceCrawlTelemetry: async () => ({ ok: true }),
    insertSourceCrawlTelemetry: async () => ({ ok: true })
  };
  return welt;
}

async function laufGlobal(welt, extra = {}) {
  return scheduler.runGlobaleErfassung({
    tenantIds: ["t-1", "t-2"],
    budgetMs: 240000,
    startedMs: welt.T0,
    runId: "cron-pipeline-20260810160003-testr-global",
    buendelung: "kontext",
    deps: welt.deps,
    ...extra
  });
}

(async () => {
  // ---- 2a: vollstaendiger Lauf --------------------------------------------------------------
  {
    const welt = baueWelt();
    const { datenstand } = await laufGlobal(welt);
    check("2a.1 Vollstaendiger Lauf versiegelt als 'abgeschlossen'",
      datenstand.versiegelt === true && datenstand.status === "abgeschlossen", datenstand.status);
    const g = welt.crawlRuns.find((r) => r.mode === "global");
    check("2a.2 Globaler Laufdatensatz traegt datenstandDetail", Boolean(g && g.datenstandDetail));
    check("2a.3 Kontexttelemetrie: GENAU 3 Kontexte = 1 geteilt + 2 mandatseigen + 0 unbekannt",
      g && g.datenstandDetail.kontext
      && g.datenstandDetail.kontext.kontexte === 3
      && g.datenstandDetail.kontext.geteilt === 1
      && g.datenstandDetail.kontext.mandatseigen === 2
      && g.datenstandDetail.kontext.unbekannt === 0,
      g && JSON.stringify(g.datenstandDetail.kontext));
    check("2a.4 Persistenz belegt: ergebnis=ok, zaehlerVerfehlt=0",
      g && g.datenstandDetail.persistenz.ergebnis === "ok" && g.datenstandDetail.persistenz.zaehlerVerfehlt === 0);
    check("2a.5 Lazy-Vormerkphase vollstaendig: 3 Cluster, 3 verarbeitet, 0 uebersprungen",
      g && g.datenstandDetail.lazy.cluster === 3 && g.datenstandDetail.lazy.verarbeitet === 3
      && g.datenstandDetail.lazy.uebersprungeneStapel === 0,
      g && JSON.stringify(g.datenstandDetail.lazy));
    const zeile = welt.processRuns.find((p) => p.process === "globalphase");
    check("2a.6 DAUERHAFTE globalphase-Prozesszeile geschrieben (ueberlebt Blob-Retention)",
      Boolean(zeile) && zeile.runId === "cron-pipeline-20260810160003-testr-global" && zeile.mode === "global");
    check("2a.7 Prozesszeile: status=success, reason traegt die Ursachenzerlegung",
      zeile && zeile.status === "success" && /status=abgeschlossen/.test(zeile.reason) && /persistenz=ok/.test(zeile.reason));
    // Review-Haertung 3: die dauerhafte Zeile traegt die VERSIEGELTE Dauer, nicht die
    // vorher gebildete — sie wird nach `datenstandVersiegeln` geschrieben.
    check("2a.8 Prozesszeile traegt die VERSIEGELTE Dauer (= datenstand.dauerMs)",
      zeile && zeile.durationMs === datenstand.dauerMs, `${zeile && zeile.durationMs} vs ${datenstand.dauerMs}`);
    // Review-Haertung 2: der Laufdatensatz traegt die Mandats-IDENTITAETEN, nicht nur die Zahl.
    check("2a.9 quellenVereinigung traegt die geplanten Mandatskennungen (nicht nur die Anzahl)",
      g && g.quellenVereinigung && Array.isArray(g.quellenVereinigung.mandateIds)
      && g.quellenVereinigung.mandateIds.join(",") === "t-1,t-2"
      && g.quellenVereinigung.mandate === 2,
      g && JSON.stringify(g.quellenVereinigung));
    // Review-Haertung 3: der versiegelte Datenstand traegt sein eigenes Budget.
    check("2a.10 Versiegelter Datenstand traegt budgetMs (Dauer und Grenze aus EINER Quelle)",
      datenstand.budgetMs === 240000 && datenstand.dauerMs != null, JSON.stringify({ b: datenstand.budgetMs, d: datenstand.dauerMs }));
  }

  // ---- 2b: Lazy-Stapel uebersprungen => ehrliches teilweise + exakte Zaehlung ---------------
  {
    const welt = baueWelt({ lazyDauerMs: 70000 });
    const { datenstand } = await laufGlobal(welt);
    check("2b.1 Uebersprungene Lazy-Stapel => status 'teilweise' (nie stilles Gruen)",
      datenstand.status === "teilweise", datenstand.status);
    const g = welt.crawlRuns.find((r) => r.mode === "global");
    check("2b.2 Zaehlung exakt: 1 Stapel verarbeitet, 2 uebersprungen, 2 Dokumente",
      g && g.datenstandDetail.lazy.verarbeitet === 1
      && g.datenstandDetail.lazy.uebersprungeneStapel === 2
      && g.datenstandDetail.lazy.uebersprungeneDokumente === 2,
      g && JSON.stringify(g.datenstandDetail.lazy));
    check("2b.3 budgetErschoepft ist wahr, Fehlerliste bleibt LEER (Rueckstand != Fehler)",
      datenstand.budgetErschoepft === true && (datenstand.fehler || []).length === 0);
    const zeile = welt.processRuns.find((p) => p.process === "globalphase");
    check("2b.4 Prozesszeile: status=partial, reason nennt lazyskip=2",
      zeile && zeile.status === "partial" && /lazyskip=2/.test(zeile.reason), zeile && zeile.reason);
  }

  // ---- 2c: Persistenzfehler ist NIE mehr stilles Gruen --------------------------------------
  {
    const welt = baueWelt({ persistWirft: true });
    const { datenstand } = await laufGlobal(welt);
    check("2c.1 Persistenzfehler => status 'teilweise' (vorher: konnte 'abgeschlossen' werden)",
      datenstand.status === "teilweise", datenstand.status);
    check("2c.2 Fehlerschritt 'persistenz' ist benannt",
      (datenstand.fehler || []).some((f) => f.schritt === "persistenz"));
    const g = welt.crawlRuns.find((r) => r.mode === "global");
    check("2c.3 datenstandDetail.persistenz.ergebnis = 'fehlend' und newRawDocuments = null",
      g && g.datenstandDetail.persistenz.ergebnis === "fehlend" && g.newRawDocuments === null,
      g && JSON.stringify(g.datenstandDetail.persistenz));
    check("2c.4 fehlerSchritte im Laufdatensatz tragen 'persistenz' (E3-Unterscheidung moeglich)",
      g && g.datenstandDetail.fehlerSchritte.some((f) => f.schritt === "persistenz"));
    const zeile = welt.processRuns.find((p) => p.process === "globalphase");
    check("2c.5 Prozesszeile: status=partial, reason nennt persistenz=fehlend",
      zeile && zeile.status === "partial" && /persistenz=fehlend/.test(zeile.reason), zeile && zeile.reason);
  }

  // ---- 2d: CAS-Kollisionen werden gezaehlt und benannt --------------------------------------
  {
    const welt = baueWelt({ zaehlerVerfehlt: 4 });
    await laufGlobal(welt);
    const g = welt.crawlRuns.find((r) => r.mode === "global");
    check("2d.1 zaehlerVerfehlt=4 steht im Laufdatensatz (CLAUDE.md §4.10: benannt, nie ueberschrieben)",
      g && g.datenstandDetail.persistenz.zaehlerVerfehlt === 4);
    const zeile = welt.processRuns.find((p) => p.process === "globalphase");
    check("2d.2 Prozesszeile nennt cas=4", zeile && /cas=4/.test(zeile.reason), zeile && zeile.reason);
  }

  // ---- 2e: Eager-Stapel-Skip wird mit Dokumentzahl gezaehlt ---------------------------------
  {
    // Der erste Eager-Aufruf verbraucht das gesamte Eager-Budget: die uebrigen Stapel
    // bekommen teilBudget <= 0 und werden uebersprungen — mit Dokumentzahl.
    const welt = baueWelt({ eagerDauerMs: 120000, eagerVerarbeitet: 1, eagerZurueckgestellt: 0 });
    await laufGlobal(welt);
    const g = welt.crawlRuns.find((r) => r.mode === "global");
    check("2e.1 Eager-Bilanz: 1 Stapel gelaufen, 2 uebersprungen, 2 Dokumente gezaehlt",
      g && g.datenstandDetail.eager.uebersprungeneStapel === 2
      && g.datenstandDetail.eager.uebersprungeneDokumente === 2
      && welt.eagerCalls.length === 1,
      g && JSON.stringify(g.datenstandDetail.eager));
  }

  // ---- 2f: Vormerkbilanz wandert in die Eager-Bilanz ----------------------------------------
  {
    const welt = baueWelt({ eagerVerarbeitet: 0, eagerZurueckgestellt: 1, eagerVorgemerkt: 1, eagerNichtVorgemerkt: 0 });
    await laufGlobal(welt);
    const g = welt.crawlRuns.find((r) => r.mode === "global");
    check("2f.1 vorgemerkt/nichtVorgemerkt werden ueber alle Stapel summiert (3/0)",
      g && g.datenstandDetail.eager.vorgemerkt === 3 && g.datenstandDetail.eager.nichtVorgemerkt === 0,
      g && JSON.stringify(g.datenstandDetail.eager));
    const welt2 = baueWelt({ eagerVerarbeitet: 0, eagerZurueckgestellt: 1, eagerVorgemerkt: 0, eagerNichtVorgemerkt: 1 });
    await laufGlobal(welt2);
    const g2 = welt2.crawlRuns.find((r) => r.mode === "global");
    check("2f.2 nichtVorgemerkt > 0 ist zaehlbar (Grundlage der fail-closed Dauerhaftigkeitsregel)",
      g2 && g2.datenstandDetail.eager.nichtVorgemerkt === 3);
  }

  // =============================================================================================
  console.log("\n== 3 · Vormerk-Dauerhaftigkeit am echten Understanding-Code ==");
  // =============================================================================================

  function baueUnderstandingWelt() {
    const welt = { kos: new Map(), koDocs: new Map(), savePendingCalls: [], saveSourcesCalls: [] };
    welt.deps = {
      enabled: () => true,
      aiEnabled: () => true,
      acquireLock: async () => ({ granted: true }),
      releaseLock: async () => {},
      getExisting: async (vorgangId) => welt.kos.get(vorgangId) || null,
      // Deterministische Verzoegerung je Cluster: 25 ms >> 1 ms Budget. Sie sitzt im
      // Kandidaten-Lookup, den der Eager-Pfad fuer JEDEN Cluster aufruft.
      findVorgangCandidates: async () => { await sleep(25); return []; },
      listVorgangDocuments: async (koId) => welt.koDocs.get(koId) || [],
      listPending: async () => [...welt.kos.values()].filter((k) => k.status === "pending"),
      savePending: async (vorgangId, meta) => {
        welt.savePendingCalls.push(vorgangId);
        const vorhanden = welt.kos.get(vorgangId);
        if (vorhanden) return { saved: false, reason: "exists", id: vorhanden.id };
        const ko = { id: `ko-${vorgangId}`, vorgang_id: vorgangId, status: "pending", ...meta };
        welt.kos.set(vorgangId, ko);
        return { saved: true, id: ko.id };
      },
      canSpend: async () => ({ allowed: false, reason: "test-kein-budget" }),
      requestUnderstanding: async () => { throw new Error("kein KI-Call im Test"); },
      save: async () => { throw new Error("kein Save im Test"); },
      saveSources: async (koId, docs) => {
        welt.saveSourcesCalls.push({ koId, n: docs.length });
        welt.koDocs.set(koId, docs);
        return { linked: docs.length };
      },
      markFailed: async () => ({}),
      readUpdateRetries: async () => ({}),
      writeUpdateRetries: async () => ({}),
      modelName: () => "test-model",
      logSkip: () => {},
      gateMode: () => "off",
      recordGateShadow: () => {},
      recordGateShadowRows: () => {}
    };
    return welt;
  }

  const DOKUMENTE = [
    { id: "d-1", sourceId: "s-1", title: "Erstes Thema Anhoerung Bundestag", url: "https://example.org/x1", publishedAt: "2026-08-10T10:00:00Z" },
    { id: "d-2", sourceId: "s-2", title: "Zweites Thema Gesetzentwurf Verkehr", url: "https://example.org/x2", publishedAt: "2026-08-10T10:05:00Z" },
    { id: "d-3", sourceId: "s-3", title: "Drittes Thema Debatte Haushalt", url: "https://example.org/x3", publishedAt: "2026-08-10T10:10:00Z" }
  ];

  // ---- 3a: zurueckgestellte Cluster werden vorgemerkt UND verknuepft ------------------------
  {
    const welt = baueUnderstandingWelt();
    const ergebnis = await U.runUnderstandingShadow(DOKUMENTE, { ...welt.deps, budgetMs: 1 });
    check("3a.1 Budget 1 ms: mindestens ein Cluster zurueckgestellt",
      ergebnis.deferred >= 1, JSON.stringify({ deferred: ergebnis.deferred, processed: ergebnis.processed }));
    check("3a.2 JEDER zurueckgestellte Cluster ist vorgemerkt (nichtVorgemerkt=0)",
      ergebnis.vorgemerkt === ergebnis.deferred && ergebnis.nichtVorgemerkt === 0,
      JSON.stringify({ vorgemerkt: ergebnis.vorgemerkt, nichtVorgemerkt: ergebnis.nichtVorgemerkt }));
    check("3a.3 Vormerkung ist DAUERHAFT: pending-KO existiert je zurueckgestelltem Cluster",
      [...welt.kos.values()].filter((k) => k.status === "pending").length === ergebnis.deferred);
    check("3a.4 Dokumentverknuepfung existiert (spaetere Wiederauffindung ueber die Verknuepfung)",
      welt.saveSourcesCalls.length === ergebnis.deferred && welt.saveSourcesCalls.every((c) => c.n >= 1));
  }

  // ---- 3b: E3-NEUFASSUNG (K4, Korrektursprint 2026-08-05) -----------------------------------
  // Die ALTE Fassung dieses Teils schrieb das schwaechere Verhalten („vormerken, solange
  // Restzeit reicht, sonst ehrlich zaehlen") als SOLL fest — genau damit war die E3-Zusage
  // in Production strukturell unerfuellbar (§7.7.6, Befund 5). JETZT gilt: die Vormerkung
  // hat eine RESERVIERTE Abschlusszeit (scheduler.VORMERK_RESERVE_MS/ABSCHLUSS_RESERVE_MS);
  // ein Lauf, dessen Deadline vor der Vormerkung verstrichen ist, ist ABNORMAL und BESTEHT
  // DEN VERTRAG NICHT — die ehrliche Zaehlung bleibt, aber sie ist ein Fehlbefund, kein Soll.
  {
    const welt = baueUnderstandingWelt();
    const ergebnis = await U.runUnderstandingShadow(DOKUMENTE, {
      ...welt.deps,
      budgetMs: 1,
      vormerkDeadlineMs: Date.now() - 1000 // Deadline bereits verstrichen (abnormal)
    });
    check("3b.1 Verstrichene Vormerk-Deadline (abnormal): nichts behauptet, Luecke GEZAEHLT",
      ergebnis.vorgemerkt === 0 && [...welt.kos.values()].length === 0
      && ergebnis.nichtVorgemerkt === ergebnis.deferred && ergebnis.deferred >= 1,
      JSON.stringify({ nichtVorgemerkt: ergebnis.nichtVorgemerkt, deferred: ergebnis.deferred }));
    // NEU: der Nachweisvertrag AKZEPTIERT diesen Zustand nicht mehr — ein Lauf mit
    // nichtVorgemerkt > 0 ist `rueckstand-nicht-dauerhaft`, kein bestehensfaehiges Ergebnis.
    const V = require(path.join(__dirname, "..", "lib", "helmut", "op25-nachweis.js"));
    const kernErgebnis = V.bewerteLauf({
      slot: { cronName: "pipeline", geplantMs: Date.parse("2026-08-10T16:00:00Z") },
      globalerLauf: {
        mode: "global", runId: "cron-pipeline-20260810160003-abn01-global",
        savedItems: 100, newRawDocuments: 50, failedSources: 0, runState: "gesund",
        quellenVereinigung: { mandate: 2, mandateIds: ["t-1", "t-2"] },
        datenstandDetail: {
          budgetMs: 221000, nichtAbgerufen: 0, fehlerSchritte: [], fehlerhafteProfile: [],
          persistenz: { ergebnis: "ok", zaehlerVerfehlt: 0 },
          lazy: { cluster: 10, verarbeitet: 5, uebersprungeneStapel: 0, uebersprungeneDokumente: 0 },
          eager: { stapel: 1, verarbeitet: 0, zurueckgestellt: ergebnis.deferred, vorgemerkt: 0, nichtVorgemerkt: ergebnis.nichtVorgemerkt, uebersprungeneStapel: 0, uebersprungeneDokumente: 0, andereSkips: 0 },
          kontext: { kontexte: 3, geteilt: 1, mandatseigen: 2, unbekannt: 0, dokumente: 100, ohneSichtbarkeit: 0 },
          buendelung: "kontext"
        }
      },
      prozessLauf: { runId: "cron-pipeline-20260810160003-abn01-global", status: "partial", durationMs: 200000 },
      mandatsLaeufe: [],
      frozen: V.mandatsSignatur([]),
      jetztMs: Date.parse("2026-08-12T13:00:00Z")
    });
    check("3b.2 NEU: der Vertrag wertet die verstrichene Deadline als rueckstand-nicht-dauerhaft (kein Soll mehr)",
      kernErgebnis.befunde.some((b) => b.grund === "rueckstand-nicht-dauerhaft"),
      JSON.stringify(kernErgebnis.befunde.slice(0, 3)));
  }

  // ---- 3b2: REGULAERER Lauf (K4-Soll): Bulk-Vormerkung, keine seriellen Einzelwrites --------
  {
    const welt = baueUnderstandingWelt();
    const bulkAufrufe = [];
    const ergebnis = await U.runUnderstandingShadow(DOKUMENTE, {
      ...welt.deps,
      budgetMs: 1,
      vormerkDeadlineMs: Date.now() + 60000, // Deadline NICHT verstrichen (Regelfall)
      savePendingBulk: async (eintraege) => {
        bulkAufrufe.push(eintraege.length);
        for (const e of eintraege) welt.kos.set(e.vorgangId, { id: `ko-${e.vorgangId}`, vorgang_id: e.vorgangId, status: "pending" });
        return { vorgemerkt: eintraege.length, bereitsVorhanden: 0, fehlgeschlagen: 0, verknuepfteDokumente: eintraege.length, anfragen: 2 };
      }
    });
    check("3b2.1 Regulaerer Lauf: der GESAMTE Rueckstand ist vorgemerkt (nichtVorgemerkt=0)",
      ergebnis.deferred >= 1 && ergebnis.vorgemerkt === ergebnis.deferred && ergebnis.nichtVorgemerkt === 0,
      JSON.stringify({ deferred: ergebnis.deferred, vorgemerkt: ergebnis.vorgemerkt, nichtVorgemerkt: ergebnis.nichtVorgemerkt }));
    check("3b2.2 GEBUENDELT: genau EIN Bulk-Aufruf, NULL serielle savePending-Einzelwrites",
      bulkAufrufe.length === 1 && welt.savePendingCalls.length === 0,
      JSON.stringify({ bulk: bulkAufrufe, seriell: welt.savePendingCalls.length }));
    check("3b2.3 Ein Speicherfehler im Bulk wird GEZAEHLT, nie als vorgemerkt gewertet",
      await (async () => {
        const w2 = baueUnderstandingWelt();
        const r2 = await U.runUnderstandingShadow(DOKUMENTE, {
          ...w2.deps, budgetMs: 1, vormerkDeadlineMs: Date.now() + 60000,
          savePendingBulk: async (eintraege) => ({ vorgemerkt: 0, bereitsVorhanden: 0, fehlgeschlagen: eintraege.length, verknuepfteDokumente: 0, anfragen: 1 })
        });
        return r2.vormerkFehlgeschlagen === r2.deferred && r2.vorgemerkt === 0 && r2.deferred >= 1;
      })());
  }

  // ---- 3c: Wiederholtes Vormerken erzeugt NIE Duplikate (idempotent) ------------------------
  {
    const welt = baueUnderstandingWelt();
    await U.runUnderstandingShadow(DOKUMENTE, { ...welt.deps, budgetMs: 1 });
    const stand = [...welt.kos.keys()].sort().join("|");
    const anzahl = welt.kos.size;
    const zweiter = await U.runUnderstandingShadow(DOKUMENTE, { ...welt.deps, budgetMs: 1 });
    check("3c.1 Zweiter Lauf ueber dieselben Dokumente: KEIN zusaetzliches KO (idempotent)",
      welt.kos.size === anzahl && [...welt.kos.keys()].sort().join("|") === stand,
      `vorher=${anzahl} nachher=${welt.kos.size}`);
    check("3c.2 Bestehende Vormerkung zaehlt erneut als vorgemerkt (reason=exists), nie als Verlust",
      zweiter.nichtVorgemerkt === 0);
  }

  // ---- 3d: Nachholpfad findet vorgemerkte Vorgaenge ueber die VERKNUEPFUNG ------------------
  {
    const welt = baueUnderstandingWelt();
    await U.runUnderstandingShadow(DOKUMENTE, { ...welt.deps, budgetMs: 1 });
    const pendingVorher = [...welt.kos.values()].filter((k) => k.status === "pending");
    // Der Nachholpfad bekommt eine ANDERE (leere) Dokumentmenge — die Wiederauffindung
    // darf NICHT von einer identischen Neu-Clusterung abhaengen (Betriebsbefund B4),
    // sondern muss ueber die persistierte Verknuepfung laufen.
    const nachhol = await U.runPendingUnderstandingShadow([], { ...welt.deps });
    check("3d.1 ALLE vorgemerkten Vorgaenge werden gefunden und bearbeitet",
      nachhol.pending === pendingVorher.length && (nachhol.results || []).length === pendingVorher.length,
      JSON.stringify({ pending: nachhol.pending, results: (nachhol.results || []).length }));
    check("3d.2 Wiederauffindung laeuft ueber die VERKNUEPFUNG (nicht ueber Kennungs-Glueck)",
      (nachhol.results || []).every((r) => r.clusterHerkunft === "verknuepfung"),
      JSON.stringify(nachhol.clusterHerkunft));
    check("3d.3 Kein Vorgang geht verloren, keiner dupliziert (KO-Bestand unveraendert)",
      [...welt.kos.values()].filter((k) => k.status === "pending").length === pendingVorher.length);
  }

  // =============================================================================================
  console.log("\n== 4 · compactCrawlRunForStore: Nachweisfelder bleiben, Fremdfelder fallen ==");
  // =============================================================================================
  {
    const { compactCrawlRunForStore } = storage;
    const detail = {
      budgetMs: 221000,
      nichtAbgerufen: 0,
      fehlerSchritte: [{ schritt: "persistenz", fatal: false, grundVollText: "DARF NICHT PERSISTIERT WERDEN" }],
      fehlerhafteProfile: ["t-9"],
      persistenz: { ergebnis: "ok", anfragen: 10, einzelnNachgezogen: 1, zaehlerVerfehlt: 0, bestandsTreffer: 5 },
      lazy: { cluster: 1242, verarbeitet: 60, uebersprungeneStapel: 2, uebersprungeneDokumente: 300 },
      eager: { stapel: 14, verarbeitet: 30, zurueckgestellt: 1212, vorgemerkt: 1212, nichtVorgemerkt: 0, uebersprungeneStapel: 0, uebersprungeneDokumente: 0, andereSkips: 0 },
      kontext: { kontexte: 14, geteilt: 7, mandatseigen: 6, unbekannt: 1, dokumente: 2179, ohneSichtbarkeit: 2 },
      buendelung: "kontext"
    };
    const kompakt = compactCrawlRunForStore({
      mode: "global",
      runId: "cron-pipeline-20260810160003-testr-global",
      globalphase: true,
      datenstandDetail: detail,
      quellenVereinigung: {
        gesamt: 181, gemeinsam: 140, mandatseigen: 41, doppelteAbrufwege: 3,
        fehlerhafteProfile: [], mandate: 5, mandateIds: ["m-a", "m-b", "m-c", "m-d", "m-e"]
      },
      geheimesFeld: "DARF NICHT PERSISTIERT WERDEN"
    });
    check("4.1 datenstandDetail ueberlebt die Kompaktierung (Zaehler exakt)",
      kompakt.datenstandDetail
      && kompakt.datenstandDetail.lazy.cluster === 1242
      && kompakt.datenstandDetail.eager.nichtVorgemerkt === 0
      && kompakt.datenstandDetail.kontext.unbekannt === 1
      && kompakt.datenstandDetail.persistenz.zaehlerVerfehlt === 0);
    check("4.2 quellenVereinigung + globalphase-Kennzeichen ueberleben",
      kompakt.quellenVereinigung && kompakt.quellenVereinigung.mandate === 5 && kompakt.globalphase === true);
    check("4.2b Mandats-IDENTITAETEN ueberleben die Kompaktierung (Review-Haertung 2)",
      kompakt.quellenVereinigung.mandateIds
      && kompakt.quellenVereinigung.mandateIds.join(",") === "m-a,m-b,m-c,m-d,m-e");
    check("4.3 Fremd-/Textfelder werden weiterhin GESTRIPPT (Datensparsamkeit)",
      !("geheimesFeld" in kompakt)
      && !("grundVollText" in (kompakt.datenstandDetail.fehlerSchritte[0] || {}))
      && kompakt.datenstandDetail.fehlerSchritte[0].schritt === "persistenz");
    const mandatKompakt = compactCrawlRunForStore({
      mode: "mandat",
      politicianId: "t-1",
      runId: "cron-pipeline-20260810160003-testr",
      globalLaufId: "cron-pipeline-20260810160003-testr-global",
      datenstandFrisch: false,
      datenstand: { laufId: "cron-pipeline-20260810160003-testr-global", status: "teilweise", versiegelt: true, frisch: false, beendetAt: 5, quellen: 181, rohdokumente: 2179, verstanden: 30, budgetErschoepft: true, fehler: 0, buendelung: "kontext", kontexte: 14, dauerMs: 197190, budgetMs: 221674 }
    });
    check("4.4 Mandatslauf behaelt datenstand-Vermerk + globalLaufId + datenstandFrisch",
      mandatKompakt.datenstand && mandatKompakt.datenstand.status === "teilweise"
      && mandatKompakt.datenstand.versiegelt === true
      && mandatKompakt.globalLaufId === "cron-pipeline-20260810160003-testr-global"
      && mandatKompakt.datenstandFrisch === false);
    check("4.5 VERSIEGELTE Dauer und Budget ueberleben die Kompaktierung (Review-Haertung 3)",
      mandatKompakt.datenstand.dauerMs === 197190 && mandatKompakt.datenstand.budgetMs === 221674,
      JSON.stringify({ d: mandatKompakt.datenstand.dauerMs, b: mandatKompakt.datenstand.budgetMs }));
  }

  console.log(`\n${passed + failed} Pruefpunkte · ${passed} PASS · ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((fehler) => {
  console.error("SUITE-FEHLER:", fehler && fehler.stack);
  process.exit(1);
});
