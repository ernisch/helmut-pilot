"use strict";

// OP-25 K1/K4/K6/K8 — Vertragstest mit ECHTEM Scheduler-Laufpaar (Korrektursprint 2026-08-05).
// =============================================================================================
// Der gescheiterte Nachweis vom 2026-08-04/05 war moeglich, weil die Vertragstests NUR
// konstruierte Fixtures bewerteten — und diese Fixtures dieselbe falsche runId-Konvention
// kodierten wie der Bewertungskern (Falschbefund `mandatslauf-fehlt`, §7.7.6 Befund 1).
// Diese Suite schliesst genau die Luecke: sie erzeugt das Laufpaar (globaler Lauf +
// Mandatsprojektionen) mit dem ECHTEN Produktionscode (`scheduler.runGlobaleErfassung` /
// `runMandatsProjektion`), persistiert es durch die ECHTE Kompaktierung
// (`storage.compactCrawlRunForStore`) und bewertet es mit dem ECHTEN Bewertungskern.
//
//   1. K1 — die Mandatsprojektion traegt eine EIGENE runId (`projektion-…`) und bindet
//      ueber das persistierte `globalLaufId`; der Kern findet sie genau darueber.
//      Mutationsschutz: eine Rueckkehr zum alten Join (`m.runId === laufkennung`) macht
//      diese Suite zuverlaessig rot, weil die echten Datensaetze die alte Konvention
//      nachweislich NICHT tragen.
//   2. K6 — ein fehlgeschlagener `saveCrawlRun` der Projektion ist ein FEHLGESCHLAGENES
//      Ergebnis (failed:true, von der Fairnessschicht als Fehler gezaehlt), nie stilles
//      Gruen; ohne Doppelwirkung (kein zweiter Matching-/Decision-Lauf im selben Aufruf).
//   3. K4 — realistischer Rueckstand (>= 1213 echte Cluster, knappes Zeitbudget): der
//      GESAMTE Lazy-Rest wird in der Abschlussphase GEBUENDELT vorgemerkt (0 serielle
//      Einzelwrites), die Laufbilanz geht auf, `nichtVorgemerkt = 0`, und der Kern
//      wertet den Lauf als dauerhaft.
//   4. K8 — Verarbeitungsdeadline und Abschlussreserve sind getrennt: auch wenn die
//      fachliche Phase ihr Budget ausschoepft und die Abschlussschreiben mehrere
//      Sekunden kosten, versiegelt der Lauf INNERHALB seines Budgets; die Mandatsphase
//      bleibt erreichbar.
//
// Deterministisch und offline: injizierte Uhr; kein Netz, keine KI, keine Production-Daten.

const path = require("path");
process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;

const crypto = require("crypto");
const scheduler = require(path.join(__dirname, "..", "lib", "helmut", "scheduler.js"));
const storage = require(path.join(__dirname, "..", "lib", "helmut", "storage.js"));
const cronFairness = require(path.join(__dirname, "..", "lib", "helmut", "cron-fairness.js"));
const V = require(path.join(__dirname, "..", "lib", "helmut", "op25-nachweis.js"));

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- Welt: identisches Muster wie die E3-Suite (injizierte Uhr, echte Kernfunktionen) --------
function baueWelt(config = {}) {
  const T0 = Date.parse("2026-08-10T16:00:03Z");
  const uhr = { t: T0 };
  const welt = { T0, uhr, crawlRuns: [], processRuns: [], pipelineFehler: [], bulkAufrufe: [], savePendingCalls: [] };
  const items = config.items || [
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
    persistRawDocuments: async (x) => ({ persisted: x.length, deduped: x.length, candidates: x.length, schreibAnfragen: 2, einzelnNachgezogen: 0, zaehlerVerfehlt: 0, bestandsTreffer: 0 }),
    lazyUnderstanding: async (args) => {
      if (config.lazyDauerMs) uhr.t += config.lazyDauerMs;
      return { ok: true };
    },
    eagerUnderstanding: config.eagerUnderstanding || (async () => ({ processed: 0, deferred: 0, vorgemerkt: 0, nichtVorgemerkt: 0, counts: {} })),
    savePendingBulk: config.savePendingBulk || (async (eintraege) => {
      welt.bulkAufrufe.push(eintraege.length);
      if (config.bulkDauerMs) uhr.t += config.bulkDauerMs;
      return {
        vorgemerkt: eintraege.length, bereitsVorhanden: 0, fehlgeschlagen: 0,
        verknuepfteDokumente: eintraege.length, anfragen: Math.ceil(eintraege.length / 200) * 2
      };
    }),
    matching: config.matching || (async () => ({ candidates: 2, saved: 1 })),
    decisions: async () => ({ count: 1 }),
    getActiveProfile: async (id) => ({ id, fullName: `Profil ${id}`, profileActive: true }),
    saveCrawlRun: config.saveCrawlRun || (async (run) => {
      if (config.schreibDauerMs) uhr.t += config.schreibDauerMs;
      const saved = { ...run, createdAt: new Date(uhr.t).toISOString() };
      welt.crawlRuns.unshift(saved);
      return saved;
    }),
    listCrawlRuns: async () => [],
    recordProcessRun: async (entry) => {
      if (config.prozessSchreibDauerMs) uhr.t += config.prozessSchreibDauerMs;
      welt.processRuns.push(entry);
      return { ok: true, vollstaendig: true };
    },
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

const LAUFKENNUNG = "cron-pipeline-20260810160003-testr";
const GLOBAL_ID = `${LAUFKENNUNG}-global`;

async function laufGlobal(welt, extra = {}) {
  return scheduler.runGlobaleErfassung({
    tenantIds: ["t-1", "t-2"],
    budgetMs: extra.budgetMs || 221668,
    startedMs: welt.T0,
    runId: GLOBAL_ID,
    buendelung: "kontext",
    deps: welt.deps,
    ...extra
  });
}

// Bewertet das ECHTE, KOMPAKTIERTE Laufpaar mit dem echten Kern gegen den 16:00-Slot.
function bewertePaar(welt, { jetztMs }) {
  const kompakt = welt.crawlRuns.map((r) => storage.compactCrawlRunForStore(r));
  const globalerLauf = kompakt.find((r) => r.mode === "global") || null;
  const prozess = welt.processRuns.filter((p) => p.process === "globalphase").map((p) => ({
    runId: p.runId, process: p.process, status: p.status, durationMs: p.durationMs,
    createdAt: p.finishedAt, commit: null
  }));
  return V.bewerteLauf({
    slot: { cronName: "pipeline", geplantMs: Date.parse("2026-08-10T16:00:00Z") },
    globalerLauf,
    prozessLauf: prozess.find((p) => globalerLauf && p.runId === globalerLauf.runId) || null,
    mandatsLaeufe: kompakt.filter((r) => r.mode === "mandat"),
    frozen: V.mandatsSignatur(["t-1", "t-2"]),
    kontextErklaerung: null,
    jetztMs
  });
}

(async () => {
  // ===========================================================================================
  console.log("== 1 · K1: echtes Laufpaar — eigene runId, Bindung ueber globalLaufId ==");
  // ===========================================================================================
  {
    const welt = baueWelt();
    const { datenstand } = await laufGlobal(welt);
    check("1.1 Globale Phase versiegelt 'abgeschlossen'",
      datenstand.versiegelt === true && datenstand.status === "abgeschlossen", datenstand.status);
    const p1 = await scheduler.runMandatsProjektion("t-1", datenstand, { deps: welt.deps, ausloeser: "pipeline" });
    const p2 = await scheduler.runMandatsProjektion("t-2", datenstand, { deps: welt.deps, ausloeser: "pipeline" });
    check("1.2 Beide Projektionen laufen (kein Skip, kein Fehler)",
      !p1.skipped && !p2.skipped && !p1.failed && !p2.failed);
    const mandate = welt.crawlRuns.filter((r) => r.mode === "mandat");
    check("1.3 Mandatsprojektion traegt eine EIGENE runId (projektion-…)",
      mandate.length === 2 && mandate.every((m) => /^projektion-\d{14}-[a-z0-9]+$/.test(m.runId)),
      JSON.stringify(mandate.map((m) => m.runId)));
    check("1.4 Die alte Fixture-Konvention (runId == Laufkennung) kommt in ECHT nicht vor",
      mandate.every((m) => m.runId !== LAUFKENNUNG && m.runId !== GLOBAL_ID));
    check("1.5 Bindung liegt im persistierten globalLaufId (== runId des globalen Laufs)",
      mandate.every((m) => m.globalLaufId === GLOBAL_ID));
    const kompaktMandat = storage.compactCrawlRunForStore(mandate[0]);
    check("1.6 Kompaktierung erhaelt runId UND globalLaufId (Ablageform = Bewertungsform)",
      /^projektion-/.test(kompaktMandat.runId) && kompaktMandat.globalLaufId === GLOBAL_ID);
    const ergebnis = bewertePaar(welt, { jetztMs: welt.uhr.t + 1000 });
    check("1.7 Der Kern findet BEIDE Mandatslaeufe ueber globalLaufId (kein mandatslauf-fehlt)",
      !ergebnis.befunde.some((b) => b.grund === "mandatslauf-fehlt"),
      JSON.stringify(ergebnis.befunde.slice(0, 3)));
    check("1.8 Bewertung des echten Paars: vollstaendig, keine Vertragsverletzung",
      ergebnis.einstufung === "vollstaendig", JSON.stringify(ergebnis.befunde.slice(0, 3)));
  }

  // ===========================================================================================
  console.log("\n== 2 · K1 fail closed: Mehrdeutigkeit und fehlende Bindung ==");
  // ===========================================================================================
  {
    const welt = baueWelt();
    const { datenstand } = await laufGlobal(welt);
    await scheduler.runMandatsProjektion("t-1", datenstand, { deps: welt.deps });
    await scheduler.runMandatsProjektion("t-2", datenstand, { deps: welt.deps });
    // Kuenstliche Mehrdeutigkeit: derselbe Mandats-Datensatz doppelt (z. B. Doppel-Write).
    const doppel = { ...welt.crawlRuns.find((r) => r.mode === "mandat"), runId: "projektion-20260810160099-zzzzz" };
    welt.crawlRuns.unshift(doppel);
    const ergebnis = bewertePaar(welt, { jetztMs: welt.uhr.t + 1000 });
    check("2.1 Zwei Datensaetze desselben Mandats am selben globalen Lauf => blockiert (mehrdeutig)",
      ergebnis.befunde.some((b) => b.grund === "mandatslauf-mehrdeutig" && b.schwere === "blockiert"),
      JSON.stringify(ergebnis.befunde.slice(0, 3)));
  }

  // ===========================================================================================
  console.log("\n== 3 · K6: nicht gespeicherter Mandatslauf ist NIE stilles Gruen ==");
  // ===========================================================================================
  {
    // (a) Kontrollierter Fehler: saveCrawlRun wirft NUR fuer den Mandatslauf.
    const welt = baueWelt();
    const echteSave = welt.deps.saveCrawlRun;
    const { datenstand } = await laufGlobal(welt);
    let matchingAufrufe = 0;
    welt.deps.matching = async () => { matchingAufrufe += 1; return { candidates: 2, saved: 1 }; };
    welt.deps.saveCrawlRun = async (run) => {
      if (run.mode === "mandat") throw new Error("blob kaputt (Test) sk-GEHEIM-123");
      return echteSave(run);
    };
    const ergebnis = await scheduler.runMandatsProjektion("t-1", datenstand, { deps: welt.deps });
    check("3.1 Ergebnis ist FEHLGESCHLAGEN (failed:true, persistenz fehlgeschlagen), kein Throw",
      ergebnis && ergebnis.failed === true && ergebnis.persistenz === "fehlgeschlagen"
      && ergebnis.grund === "mandatslauf-nicht-gespeichert");
    check("3.2 Die Fairnessschicht zaehlt es als Fehler (ergebnisFehlgeschlagen greift)",
      cronFairness.ergebnisFehlgeschlagen(ergebnis) === true);
    check("3.3 Der Persistenzfehler ist als Pipeline-Fehler protokolliert",
      welt.pipelineFehler.some((e) => e.process === "mandatsprojektion" && e.errorType === "mandatslauf-nicht-gespeichert"));
    check("3.4 KEINE Doppelwirkung: Matching lief genau einmal", matchingAufrufe === 1, String(matchingAufrufe));
    check("3.5 Kein Geheimnis/Fehlertext in der Ergebnisstruktur (nur stabiler Grund)",
      !JSON.stringify(ergebnis).includes("sk-GEHEIM-123"));
    // (b) Erfolgreicher Write bleibt Erfolg.
    welt.deps.saveCrawlRun = echteSave;
    const ok = await scheduler.runMandatsProjektion("t-2", datenstand, { deps: welt.deps });
    check("3.6 Erfolgreicher Write => kein failed, Datensatz vorhanden",
      !ok.failed && welt.crawlRuns.some((r) => r.mode === "mandat" && r.politicianId === "t-2"));
    // (c) Teilweiser Fehler: Matching scheitert, der Lauf wird trotzdem ehrlich gespeichert.
    welt.deps.matching = async () => { throw new Error("matching kaputt (Test)"); };
    const teil = await scheduler.runMandatsProjektion("t-1", datenstand, { deps: welt.deps });
    check("3.7 Teilfehler (Matching) => gespeicherter Lauf, matching leer, NICHT failed",
      !teil.failed && teil.matching === null,
      JSON.stringify({ failed: teil.failed, matching: teil.matching }));
  }

  // ===========================================================================================
  console.log("\n== 4 · K4/K8: >=1213 echte Cluster, knappes Budget — alles dauerhaft, Budget haelt ==");
  // ===========================================================================================
  {
    const alteEnv = process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS;
    process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS = "999999999";
    try {
      // 1250 in sich verschiedene Dokumente EINER geteilten Quelle => 1250 echte Cluster.
      const items = [];
      for (let i = 0; i < 1250; i += 1) {
        const wort = () => crypto.createHash("md5").update(`w${i}-${items.length}-${Math.sin(i)}`).digest("hex").slice(0, 10);
        items.push({
          id: `d-${i}`, sourceId: "geteilt-1", sourceName: "Geteilt",
          title: `${wort()} ${wort()} ${wort()} ${wort()}`,
          url: `https://example.org/d${i}`,
          publishedAt: new Date(Date.parse("2026-08-10T00:00:00Z") + i * 60000).toISOString()
        });
      }
      const budgetMs = 221668;
      const welt = baueWelt({
        items,
        // Lazy: der ERSTE Cluster verbraucht die gesamte Lazy-Scheibe => Rest wird Rueckstand.
        lazyDauerMs: 61000,
        // Eager: schoepft sein GESAMTES fachliches Budget aus (Deadline-Auslastung).
        eagerUnderstanding: async (dokumente, opts) => {
          weltRef.uhr.t += opts.budgetMs;
          return { processed: 0, deferred: 0, vorgemerkt: 0, nichtVorgemerkt: 0, counts: {} };
        },
        // Bulk-Vormerkung + Abschlussschreiben kosten realistische Zeit.
        bulkDauerMs: 15000,
        schreibDauerMs: 3000,
        prozessSchreibDauerMs: 1000
      });
      const weltRef = welt;
      const { datenstand } = await laufGlobal(welt, { budgetMs });
      const g = welt.crawlRuns.find((r) => r.mode === "global");
      const vb = g && g.datenstandDetail && g.datenstandDetail.vormerkung;
      check("4.1 Realistischer Rueckstand: >= 1213 gebaute, nicht verarbeitete Lazy-Cluster",
        vb && vb.lazyRestCluster >= 1213, vb && String(vb.lazyRestCluster));
      check("4.2 GESAMTER Rueckstand vorgemerkt: nichtVorgemerkt=0, fehlgeschlagen=0",
        vb && vb.nichtVorgemerkt === 0 && vb.fehlgeschlagen === 0, vb && JSON.stringify(vb));
      check("4.3 Laufbilanz geht auf: kandidaten = vorgemerkt + bereitsVorhanden + fehlgeschlagen + nichtVorgemerkt",
        vb && vb.kandidaten === vb.vorgemerkt + vb.bereitsVorhanden + vb.fehlgeschlagen + vb.nichtVorgemerkt);
      check("4.4 Kandidaten decken den Lazy-Rest vollstaendig", vb && vb.kandidaten >= vb.lazyRestCluster);
      check("4.5 GEBUENDELT, nicht seriell: genau EIN Bulk-Aufruf, 0 serielle savePending-Aufrufe",
        welt.bulkAufrufe.length === 1 && welt.bulkAufrufe[0] >= 1213 && welt.savePendingCalls.length === 0,
        JSON.stringify({ bulk: welt.bulkAufrufe, seriell: welt.savePendingCalls.length }));
      // K8: trotz ausgeschoepftem fachlichem Budget + 15 s Vormerkung + 6 s Abschluss-
      // schreiben versiegelt der Lauf INNERHALB seines Budgets (getrennte Reserven).
      check("4.6 Versiegelung INNERHALB des Budgets (Abschlussreserve nicht verbraucht)",
        datenstand.versiegelt === true && datenstand.dauerMs <= budgetMs,
        JSON.stringify({ dauerMs: datenstand.dauerMs, budgetMs }));
      check("4.7 Ehrlicher Status: 'teilweise' (Rueckstand bleibt Rueckstand — nur dauerhaft)",
        datenstand.status === "teilweise", datenstand.status);
      // Der ECHTE Kern wertet den Lauf: Rueckstand vollstaendig dauerhaft => Warnung, kein rot.
      const p1 = await scheduler.runMandatsProjektion("t-1", datenstand, { deps: welt.deps });
      const p2 = await scheduler.runMandatsProjektion("t-2", datenstand, { deps: welt.deps });
      check("4.8 Mandatsphase bleibt ERREICHBAR (beide Projektionen nach der globalen Phase)",
        !p1.failed && !p2.failed && !p1.skipped && !p2.skipped);
      const ergebnis = bewertePaar(welt, { jetztMs: welt.uhr.t + 1000 });
      check("4.9 Kern: KEIN rueckstand-nicht-dauerhaft (E3 erfuellt trotz 1213+ Clustern Rueckstand)",
        !ergebnis.befunde.some((b) => b.grund === "rueckstand-nicht-dauerhaft"),
        JSON.stringify(ergebnis.befunde.slice(0, 3)));
      check("4.10 Kern: keine Vertragsverletzung, Warnung nennt die dauerhafte Vormerkung",
        ergebnis.einstufung !== "vertragsverletzung"
        && ergebnis.warnungen.some((w) => w.includes("dauerhaft vorgemerkt")),
        JSON.stringify({ einstufung: ergebnis.einstufung, warnungen: ergebnis.warnungen.slice(0, 2) }));
      check("4.11 K8-Gegenprobe: kein globalphase-budget-ueberzogen",
        !ergebnis.befunde.some((b) => b.grund === "globalphase-budget-ueberzogen"));
    } finally {
      if (alteEnv === undefined) delete process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS;
      else process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS = alteEnv;
    }
  }

  // ===========================================================================================
  console.log("\n== 5 · K4: Speicherfehler der Bulk-Vormerkung ist NIE Erfolg ==");
  // ===========================================================================================
  {
    const welt = baueWelt({
      lazyDauerMs: 61000,
      savePendingBulk: async (eintraege) => ({
        vorgemerkt: 0, bereitsVorhanden: 0, fehlgeschlagen: eintraege.length,
        verknuepfteDokumente: 0, anfragen: 1
      })
    });
    const { datenstand } = await laufGlobal(welt);
    const g = welt.crawlRuns.find((r) => r.mode === "global");
    const vb = g && g.datenstandDetail && g.datenstandDetail.vormerkung;
    check("5.1 Fehlgeschlagene Vormerkungen werden GEZAEHLT (nicht als vorgemerkt gewertet)",
      vb && vb.fehlgeschlagen >= 1 && vb.vorgemerkt === 0, vb && JSON.stringify(vb));
    await scheduler.runMandatsProjektion("t-1", datenstand, { deps: welt.deps });
    await scheduler.runMandatsProjektion("t-2", datenstand, { deps: welt.deps });
    const ergebnis = bewertePaar(welt, { jetztMs: welt.uhr.t + 1000 });
    check("5.2 Kern: rueckstand-nicht-dauerhaft (Speicherfehler faerbt nichts gruen)",
      ergebnis.befunde.some((b) => b.grund === "rueckstand-nicht-dauerhaft"),
      JSON.stringify(ergebnis.befunde.slice(0, 3)));
  }

  console.log(`\n${passed + failed} Pruefpunkte · ${passed} PASS · ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((fehler) => {
  console.error("SUITE-FEHLER:", fehler && fehler.stack);
  process.exit(1);
});
