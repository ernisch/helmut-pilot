"use strict";

// Helmut — Testsuite: Kapazität und Vollständigkeit des Lage-Checks (Sprint 05.09.2026).
// =============================================================================================
// ANLASS (Production, belegt):
//   Lauf `cron-lage-check-20260905100015-he8tk`, 10:00:15,104 → 10:04:16,853 UTC (241,7 s).
//   `kapazitaet: 1` — EIN Mandat begonnen (cem-ince), und dieses eine lief in seinen eigenen
//   240-s-Timeout. Vier Mandate: Ausgang `zeitbudget`, nie begonnen.
//   Also NICHT „1 von 5 erfolgreich", sondern 0 von 5 erfolgreich, 1 von 5 begonnen.
//   Gemessene Aufteilung dieser 240,5 s: Quellenabruf 19,5 s · Speichern/Telemetrie bis
//   10:00:42 · Verstehensfaltung 205,062 s, davon nur 52,077 s in vier Modellaufrufen (25 %)
//   und 152,985 s (75 %) NICHT-Modellzeit — im Wesentlichen der serielle Vormerk-Loop für
//   604 zurückgestellte Cluster.
//
// WAS DIESE SUITE PRÜFT — deterministisch, offline, ohne Netz, ohne Uhr, ohne KI:
//   1. Mandatsscheibe: kein Mandat kann die übrigen mehr aushungern (die Ursache selbst).
//   2. Vollständige Verarbeitung bei 5 und 25 Mandaten.
//   3. Fortsetzbarkeit bei 500 mit nachrechenbarer Obergrenze ceil(n/k).
//   4. Keine dauerhaften Auslassungen über viele Läufe.
//   5. Keine Doppelverarbeitung und keine Doppelspeicherung.
//   6. Wiederaufnahme nach Zeitgrenze.
//   7. Wiederaufnahme nach technischem Fehler.
//   8. Geteilte Erfassung: die Mandatssicht ist identisch zum Einzelabruf.
//   9. Kostenriegel unverändert erhalten.
//  10. Kommunikationsriegel unverändert erhalten.
//  11. `mandate_profiles.updated_at` ändert sich NUR bei tatsächlicher Änderung.
//
// WAS DIESE SUITE AUSDRÜCKLICH NICHT BEWEIST:
//   Keine Wanduhrzeit in Production. Die Kostenmodelle unten sind aus gemessenen
//   Production-Zahlen gebildet und ausdrücklich als RECHNUNG gekennzeichnet — sie belegen
//   die Struktur (kein Aushungern, beschränktes k, Fortsetzbarkeit), nicht die Laufzeit.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const F = require(path.join(ROOT, "lib", "helmut", "cron-fairness.js"));
const LE = require(path.join(ROOT, "lib", "helmut", "lage-erfassung.js"));
const GP = require(path.join(ROOT, "lib", "helmut", "cron-globalphase.js"));
const RIEGEL = require(path.join(ROOT, "lib", "helmut", "kommunikationsriegel.js"));
const { deduplicateRawItems, limitRawCandidates } = require(path.join(ROOT, "lib", "helmut", "crawler.js"));
const V = require(path.join(ROOT, "lib", "helmut", "vorgangskontext.js"));
const U = require(path.join(ROOT, "lib", "helmut", "understanding.js"));
const { toRawDocumentRow } = require(path.join(ROOT, "lib", "helmut", "dedup.js"));
const { laufBilanz } = require(path.join(ROOT, "lib", "helmut", "lauf-bilanz.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }
function lies(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

// ── Prüfstand: injizierte Uhr und injizierte Ablage ──────────────────────────────────────────
const BASIS_MS = Date.parse("2026-09-05T10:00:00.000Z");

function makeUhr(startMs = BASIS_MS) {
  let t = startMs;
  return { now: () => t, vor: (ms) => { t += ms; }, jetzt: () => t };
}

// Verhält sich wie `storage.saveCronFairnessState`: monotone Verschmelzung in den FRISCH
// gelesenen Stand. Kein Netz, kein Zufall.
function makeAblage(initial = {}) {
  let roh = JSON.parse(JSON.stringify(initial));
  return {
    load: async () => JSON.parse(JSON.stringify(roh)),
    save: async (patch, { pruefen = false } = {}) => {
      roh = F.mergeState(F.normalizeState(roh), patch, { nowMs: BASIS_MS });
      return pruefen ? { ok: true, state: JSON.parse(JSON.stringify(roh)) } : { ok: true };
    },
    dump: () => JSON.parse(JSON.stringify(roh))
  };
}

// Ein Lauf der Fairnessschleife mit einem KOSTENMODELL je Mandat. `deckelBeachten=false`
// bildet das VORHERIGE Verhalten nach (das Mandat läuft, bis es fertig ist — die Scheibe wird
// ignoriert); `true` bildet das neue nach (das Mandat wird an seiner Scheibe gekappt, so wie
// `withTimeout(runLageCheck, scheibeMs)` es in der Route tut).
async function lauf({
  ablage, uhr, tenants, kostenFn, deadlineMs = 240000, reserveMs = 15000,
  runId = "lauf", deckelBeachten = true, fehler = new Set(), cronName = "lage-check"
}) {
  const begonnen = [];
  const fertig = [];
  const gekappt = [];
  const ergebnis = await F.runTenantsFairly({
    cronName,
    tenantIds: tenants,
    runId,
    deadlineMs,
    reserveMs,
    startedMs: uhr.now(),
    now: uhr.now,
    loadState: ablage.load,
    saveState: ablage.save,
    perTenant: async (id, scheibe) => {
      begonnen.push(id);
      const bedarf = kostenFn(id, begonnen.length, scheibe && scheibe.scheibeMs);
      const deckel = deckelBeachten && scheibe && scheibe.scheibeMs > 0 ? scheibe.scheibeMs : Infinity;
      const verbraucht = Math.min(bedarf, deckel);
      uhr.vor(verbraucht);
      if (verbraucht < bedarf) { gekappt.push(id); return { bounded: true, reason: "lage-check-timeout" }; }
      if (fehler.has(id)) throw new Error(`mandat ${id} kaputt`);
      fertig.push(id);
      return { ok: true };
    }
  });
  return { begonnen, fertig, gekappt, ergebnis, fairness: ergebnis.fairness };
}

function mandate(n, praefix = "m") {
  return Array.from({ length: n }, (_, i) => `${praefix}-${String(i + 1).padStart(3, "0")}`);
}

// Echter Erfassungskoerper aus scheduler.js. Ersetzt sind ausschliesslich IO und Uhr;
// Quellenvereinigung, Mandatssichten, Kontextbildung, Clusterbildung und Bilanz sind echt.
// So faellt die neue globale Faltung selbst durch den Test, nicht nur ihre Textform.
function erfassungsProbe({ quellenJeProfil, itemsJeQuelle, kostenJeKontextMs = 10000, env = {}, echtesUnderstanding = false }) {
  const uhr = makeUhr();
  const aufrufe = [];
  const gruppen = [];
  const quittungen = [];
  let speicherAufrufe = 0;
  class ProbeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [uhr.now()])); }
    static now() { return uhr.now(); }
  }
  const src = lies("lib/helmut/scheduler.js");
  const erfassung = src.slice(src.indexOf("async function runGeteilteLageErfassung("), src.indexOf("async function runLageCheck("));
  const zusammenfassung = src.slice(src.indexOf("function fasseEagerErgebnisseZusammen("), src.indexOf("// Sperre der globalen Phase."));
  const ctx = vm.createContext({
    Date: ProbeDate, Map, Set, Object, Number, String, Array, Math,
    process: { env }, console: { log() {}, error() {} },
    lageErfassung: LE, cronGlobalphase: GP, vorgangskontext: V,
    lageCheckSourceLimit: 90, LAGE_VORMERK_BUDGET_MS: 20000, LAGE_ABSCHLUSS_RESERVE_MS: 5000,
    getActiveProfile: async (id) => ({ id }),
    getSourcesForProfile: async (profile) => quellenJeProfil[profile.id],
    selectLageCheckSources: (sources) => sources,
    googleHardeningConfig: () => ({ enabled: false }),
    crawlAllSources: async (sources) => ({
      checkedSources: sources.length, successfulSources: sources.length, failedSources: 0,
      results: sources.map((s) => ({ sourceId: s.id, ok: true, status: "ok", items: itemsJeQuelle[s.id] || [] }))
    }),
    rememberGoogleBreakerState() {}, deduplicateRawItems, limitRawCandidates, maxCrawlCandidates: 1000,
    saveRawItems: async (items) => { speicherAufrufe += 1; return items; },
    persistRawDocumentsShadow: async (items) => ({ persisted: items.length }),
    runUnderstandingShadow: async (items, options) => {
      aufrufe.push({ items, options, jetztMs: uhr.now() });
      if (echtesUnderstanding) {
        const originalNow = Date.now;
        Date.now = uhr.now;
        try {
          // Echter Unterpfad, ausschliesslich IO ersetzt. Jede einzelne Anfrage bleibt
          // knapp unter dem 10-s-Speichertimeout. Bereits seine Vorarbeiten kosten Zeit,
          // bevor die Modell- und Vormerk-Gates im Understanding erreicht werden.
          return await U.runUnderstandingShadow(items, {
            ...options, enabled: () => true, aiEnabled: () => true,
            acquireLock: async () => { uhr.vor(9999); return { granted: true }; },
            releaseLock: async () => { uhr.vor(9999); },
            gateMode: () => "shadow", recordGateShadow() {},
            recordGateShadowRows: async () => { uhr.vor(9999); },
            priorityEnabled: () => false, verstehenVertrag: () => null, verstehenParallelitaet: 1,
            requestUnderstanding: async () => { throw new Error("Unerwarteter Modellaufruf im Deadline-Test"); }
          });
        } finally {
          Date.now = originalNow;
        }
      }
      const clusters = U.clusterRawDocuments(items.map(toRawDocumentRow));
      gruppen.push(...clusters.map((c) => c.documents.map((d) => d.title)));
      const results = clusters.map((c) => ({ status: "saved", documents: c.documents.length }));
      uhr.vor(kostenJeKontextMs);
      return { clusters: clusters.length, processed: results.length, deferred: 0, vorgemerkt: 0,
        results, counts: { saved: results.length }, telemetrie: U.buildOutcomeTelemetry({ clusters, results }) };
    },
    savePendingKnowledgeObjectsBulk: async (entries) => {
      if (echtesUnderstanding) uhr.vor(9999);
      return { vorgemerkt: entries.length, fehlgeschlagen: 0 };
    },
    buildOutcomeTelemetry: U.buildOutcomeTelemetry, laufBilanz,
    recordProcessRun: async (entry) => { quittungen.push(entry); }, executionLocation: () => "offline-review"
  });
  vm.runInContext(`${zusammenfassung}\n${erfassung}\nthis.run = runGeteilteLageErfassung;`, ctx);
  return { run: () => ctx.run({ tenantIds: Object.keys(quellenJeProfil), runId: "lage-kontext-probe", deadlineMs: BASIS_MS + 240000 }),
    aufrufe, gruppen, quittungen, speicherAufrufe: () => speicherAufrufe };
}

// ── Kostenmodell aus GEMESSENEN Production-Zahlen (05.09., Lauf lage-2026090510001) ──────────
// Ausdrücklich eine RECHNUNG, keine Messung dieser Suite.
const GEMESSEN = {
  abrufMs: 19500,        // Quellenabruf 90 Quellen
  vorphaseRestMs: 6000,  // Speichern + Quellen-Telemetrie bis 10:00:41,961
  rohdokumenteMs: 9400,  // persistRawDocumentsShadow (903 Dokumente)
  modellMs: 52077,       // 4 Modellaufrufe
  vormerkAltMs: 120000,  // 604 Cluster seriell, 2 Rundläufe je Cluster (~1,7 Cluster/s)
  vormerkNeuMs: 3000,    // Bulk-Pfad, wenige Chunk-Anfragen (konservativ)
  projektionMs: 2100     // Matching (~1,05 s) + Decision
};
const KOSTEN_VORHER = GEMESSEN.abrufMs + GEMESSEN.vorphaseRestMs + GEMESSEN.rohdokumenteMs
  + GEMESSEN.modellMs + GEMESSEN.vormerkAltMs + GEMESSEN.projektionMs;              // ≈ 209,1 s
// Nur das erste Mandat eines Laufs traegt die volle Rohdokument-Arbeit des frischen Bestands;
// die folgenden finden ihn bereits gespeichert vor (Dedup). Konservativ: ein Drittel.
const NACHLAUF_RESERVE_MS = 8000;   // LAGE_NACHLAUF_RESERVE_MS in scheduler.js

// NACHHER-Kosten eines Mandats. Das MODELLBUDGET folgt seit diesem Sprint der Zeitscheibe
// (`min(Regelbudget, Restzeit − Nachlaufreserve)`, scheduler.js) — genau das bildet diese
// Funktion nach. Ein Mandat kann seine Scheibe damit strukturell EINHALTEN, statt in sie
// hineinzulaufen und als fehlgeschlagen gebucht zu werden.
function kostenNachher() {
  // Rohdokumente und Verstehen sind GLOBALE Arbeit und laufen seit diesem Sprint EINMAL im
  // Vorlauf (siehe VORLAUF_MS unten). Je Mandat bleibt nur die Projektion: Matching und
  // Entscheidung — Production gemessen ~1,05 s + ~1,05 s.
  return GEMESSEN.projektionMs;
}
// Der Vorlauf traegt jetzt Abruf, Speichern, Rohdokumente, Verstehen und Vormerkung — alles
// genau einmal statt n-mal.
const VORLAUF_MS = GEMESSEN.abrufMs + GEMESSEN.vorphaseRestMs + GEMESSEN.rohdokumenteMs
  + GEMESSEN.modellMs + GEMESSEN.vormerkNeuMs;                                     // ≈ 90,0 s

(async () => {
  // ══ 1 · Mandatsscheibe: die Ursache selbst ════════════════════════════════════════════════
  abschnitt("1) Mandatsscheibe — kein Mandat kann die übrigen mehr aushungern");
  {
    const s5 = F.mandatsScheibeMs({ jetztMs: 0, deadlineMs: 240000, offen: 5 });
    check("Bei 5 offenen Mandaten bekommt jedes den fairen Anteil (48 s)", s5.scheibeMs === 48000, JSON.stringify(s5));
    check("Bei 5 Mandaten ist die Scheibe NICHT durch die Untergrenze gekürzt", s5.gekuerzt === false);

    const s25 = F.mandatsScheibeMs({ jetztMs: 0, deadlineMs: 240000, offen: 25 });
    check("Bei 25 Mandaten hebt die Untergrenze den fairen Anteil auf 15 s an",
      s25.fairMs === 9600 && s25.scheibeMs === 15000 && s25.gekuerzt === true, JSON.stringify(s25));

    const s500 = F.mandatsScheibeMs({ jetztMs: 0, deadlineMs: 240000, offen: 500 });
    check("Bei 500 Mandaten bleibt die Scheibe bei der Untergrenze (kein Stillstand)",
      s500.scheibeMs === 15000 && s500.startbar === true, JSON.stringify(s500));

    const s1 = F.mandatsScheibeMs({ jetztMs: 0, deadlineMs: 240000, offen: 1 });
    check("Das LETZTE offene Mandat darf die volle Restzeit nutzen", s1.scheibeMs === 240000);

    // Die Startbedingung ist wörtlich die bisherige: `Restzeit >= mindestMs`.
    check("Startbedingung unverändert: genau an der Schwelle wird noch begonnen",
      F.mandatsScheibeMs({ jetztMs: 0, deadlineMs: 15000, offen: 3, mindestMs: 15000 }).startbar === true);
    check("Startbedingung unverändert: eine Millisekunde darunter nicht mehr",
      F.mandatsScheibeMs({ jetztMs: 0, deadlineMs: 14999, offen: 3, mindestMs: 15000 }).startbar === false);
    check("Verstrichene Frist ist nicht startbar (negative Restzeit)",
      F.mandatsScheibeMs({ jetztMs: 100, deadlineMs: 50, offen: 2, mindestMs: 0 }).startbar === false);
    check("Restzeit genau 0 bleibt bei Untergrenze 0 startbar (Altverhalten)",
      F.mandatsScheibeMs({ jetztMs: 50, deadlineMs: 50, offen: 2, mindestMs: 0 }).startbar === true);
    check("Die Scheibe ist nie negativ", F.mandatsScheibeMs({ jetztMs: 999, deadlineMs: 1, offen: 2 }).scheibeMs === 0);
  }

  // ══ 2 · Der Vorfall vom 05.09. — vorher und nachher ═══════════════════════════════════════
  abschnitt("2) Der belegte Vorfall: 5 Mandate, ein langsames");
  {
    // Welches Mandat zuerst drankommt, entscheidet die Fairnessplanung (Losentscheid bei
    // Gleichstand), nicht der Name. Das langsame Mandat ist deshalb das ERSTE der Planung —
    // genau so lag der Fall am 05.09. (cem-ince stand vorn).
    const FUENF = mandate(5);
    const erstes = F.planTenantOrder({
      cronName: "lage-check", tenantIds: FUENF, state: {}, nowMs: BASIS_MS
    }).order[0];
    const kostenVorfall = (id) => (id === erstes ? 240500 : KOSTEN_VORHER);

    // VORHER: die Scheibe wird ignoriert (so wie der feste 240-s-Timeout es tat).
    const uhrA = makeUhr();
    const a = await lauf({
      ablage: makeAblage(), uhr: uhrA, tenants: FUENF, deckelBeachten: false,
      kostenFn: kostenVorfall
    });
    check("VORHER reproduziert: genau EIN Mandat wird begonnen", a.begonnen.length === 1, a.begonnen.join(","));
    check("VORHER reproduziert: vier Mandate erhalten den Ausgang `zeitbudget`",
      a.fairness.zeitbudget.length === 4, a.fairness.zeitbudget.join(","));
    check("VORHER reproduziert: die Kapazität des Laufs ist 1", a.fairness.kapazitaet === 1);

    // NACHHER: dieselben Kosten, aber die Scheibe greift.
    const uhrB = makeUhr();
    const b = await lauf({
      ablage: makeAblage(), uhr: uhrB, tenants: FUENF, deckelBeachten: true,
      kostenFn: kostenVorfall
    });
    check("NACHHER: ALLE fünf Mandate werden begonnen", b.begonnen.length === 5, b.begonnen.join(","));
    check("NACHHER: kein Mandat erhält mehr den Ausgang `zeitbudget`",
      b.fairness.zeitbudget.length === 0, b.fairness.zeitbudget.join(","));
    check("NACHHER: das langsame Mandat wird gekappt, nicht die anderen verdrängt",
      b.gekappt.includes(erstes), b.gekappt.join(","));
    check("NACHHER: der Lauf überschreitet sein Budget nicht wesentlich",
      (uhrB.now() - BASIS_MS) <= 240000 + GEMESSEN.projektionMs, `${uhrB.now() - BASIS_MS} ms`);
  }

  // ══ 3 · Vollständige Verarbeitung bei 5 und 25 Mandaten ═══════════════════════════════════
  abschnitt("3) Vollständige Verarbeitung — 5 und 25 Mandate (Rechnung, keine Messung)");
  {
    for (const n of [5, 25]) {
      // VORHER: je Mandat der volle Einzelabruf.
      const uhrV = makeUhr();
      const v = await lauf({
        ablage: makeAblage(), uhr: uhrV, tenants: mandate(n), deckelBeachten: false,
        kostenFn: () => KOSTEN_VORHER
      });
      check(`VORHER bei ${n} Mandaten: NICHT alle werden begonnen`, v.begonnen.length < n,
        `${v.begonnen.length} von ${n}`);

      // NACHHER: geteilte Erfassung (einmal im Vorlauf) + Vormerk-Riegel.
      const uhrN = makeUhr();
      // Der Vorlauf kostet die globale Arbeit EINMAL; er läuft vor der Schleife.
      uhrN.vor(VORLAUF_MS);
      const nRun = await lauf({
        ablage: makeAblage(), uhr: uhrN, tenants: mandate(n), deckelBeachten: true,
        deadlineMs: 240000 - VORLAUF_MS,
        kostenFn: () => kostenNachher()
      });
      check(`NACHHER bei ${n} Mandaten: ALLE ${n} werden begonnen`, nRun.begonnen.length === n,
        `${nRun.begonnen.length} von ${n}`);
      check(`NACHHER bei ${n} Mandaten: ALLE ${n} werden vollständig fertig`, nRun.fertig.length === n,
        `${nRun.fertig.length} fertig, ${nRun.gekappt.length} gekappt`);
      check(`NACHHER bei ${n} Mandaten: kein Ausgang \`zeitbudget\``, nRun.fairness.zeitbudget.length === 0);
    }
  }

  // ══ 4 · 500 Mandate: fortsetzbar mit nachrechenbarer Obergrenze ═══════════════════════════
  abschnitt("4) 500 Mandate — fortsetzbar, keine dauerhaften Auslassungen");
  {
    const N = 500;
    const alle = mandate(N);
    const ablage = makeAblage();
    const begonnenGesamt = new Map();
    let laeufe = 0;
    let kapazitaetErsterLauf = 0;

    // Jeder Lauf beginnt frisch bei t0 (ein Cron-Slot). Die Reihenfolge kommt aus der
    // persistierten Fairness — genau wie in Production.
    while (begonnenGesamt.size < N && laeufe < 200) {
      const uhr = makeUhr(BASIS_MS + laeufe * 24 * 60 * 60 * 1000);
      uhr.vor(VORLAUF_MS);
      const r = await lauf({
        ablage, uhr, tenants: alle, deckelBeachten: true, runId: `lauf-${laeufe}`,
        deadlineMs: 240000 - VORLAUF_MS,
        kostenFn: () => kostenNachher()
      });
      if (laeufe === 0) kapazitaetErsterLauf = r.begonnen.length;
      for (const id of r.begonnen) begonnenGesamt.set(id, (begonnenGesamt.get(id) || 0) + 1);
      laeufe += 1;
    }
    check("500 Mandate: jedes wird innerhalb endlich vieler Läufe begonnen",
      begonnenGesamt.size === N, `${begonnenGesamt.size} von ${N} nach ${laeufe} Läufen`);
    const obergrenze = Math.ceil(N / Math.max(1, kapazitaetErsterLauf));
    check("500 Mandate: die tatsächliche Zahl der Läufe hält die Obergrenze ceil(n/k) ein",
      laeufe <= obergrenze, `${laeufe} Läufe, Obergrenze ${obergrenze} (k=${kapazitaetErsterLauf})`);
    check("500 Mandate: kein Mandat wird bevorzugt (Streuung der Beginne höchstens 1)",
      Math.max(...begonnenGesamt.values()) - Math.min(...begonnenGesamt.values()) <= 1,
      `min ${Math.min(...begonnenGesamt.values())} max ${Math.max(...begonnenGesamt.values())}`);
    check("500 Mandate: die Kapazität je Lauf ist echt größer als 1 (kein k=1 mehr)",
      kapazitaetErsterLauf > 1, `k=${kapazitaetErsterLauf}`);

    // Ehrliche Gegenprobe: die Obergrenze ist eine BEGINN-Garantie, keine Erfolgsgarantie.
    check("500 Mandate: die Garantie ist ausdrücklich `begonnen`, nicht `erfolgreich`",
      /werden je regulaerem Lauf mindestens|begonnen/i.test(lies("lib/helmut/cron-fairness.js")));
  }

  // ══ 5 · Keine Doppelverarbeitung ══════════════════════════════════════════════════════════
  abschnitt("5) Keine Doppelverarbeitung und keine Doppelspeicherung");
  {
    const uhr = makeUhr();
    // Die Mandatsliste enthält absichtlich ein Duplikat.
    const r = await lauf({
      ablage: makeAblage(), uhr, tenants: ["m-001", "m-002", "m-001", "m-003"],
      kostenFn: () => 5000
    });
    const zaehlung = r.begonnen.reduce((m, id) => m.set(id, (m.get(id) || 0) + 1), new Map());
    check("Ein Mandat wird innerhalb EINES Laufs höchstens einmal begonnen",
      [...zaehlung.values()].every((n) => n === 1), JSON.stringify([...zaehlung]));

    // Speicherauftrag: dasselbe Element aus zwei Mandatssichten wird EINMAL gespeichert.
    const item = (hash, sourceId) => ({ hash, sourceId, title: `t-${hash}` });
    const auftrag = LE.speicherAuftrag([
      { rawItems: [item("a", "q1"), item("b", "q2")] },
      { rawItems: [item("b", "q2"), item("c", "q3")] }
    ]);
    check("Der Speicherauftrag enthält jedes Element genau einmal",
      auftrag.length === 3 && new Set(auftrag.map((i) => i.hash)).size === 3,
      auftrag.map((i) => i.hash).join(","));
    check("Der Speicherauftrag verliert kein Element eines zweiten Mandats",
      auftrag.some((i) => i.hash === "c"));
  }

  // ══ 6 · Wiederaufnahme nach Zeitgrenze ════════════════════════════════════════════════════
  abschnitt("6) Wiederaufnahme nach Zeitgrenze");
  {
    // 40 Mandate zu je 15 s: in ein 240-s-Budget passen 16, der Rest muss warten. Genau
    // dieser Rest ist der Prüfgegenstand — er darf nicht verloren gehen.
    const ablage = makeAblage();
    const N6 = 40;
    const alle = mandate(N6);
    const uhr1 = makeUhr();
    const l1 = await lauf({ ablage, uhr: uhr1, tenants: alle, kostenFn: () => 15000, runId: "l1" });
    check("Lauf 1: nur ein Teil wird begonnen", l1.begonnen.length > 0 && l1.begonnen.length < N6,
      `${l1.begonnen.length} von ${N6}`);
    check("Lauf 1: die übrigen erhalten den Ausgang `zeitbudget`",
      l1.fairness.zeitbudget.length === N6 - l1.begonnen.length,
      `${l1.fairness.zeitbudget.length} gegen ${N6 - l1.begonnen.length}`);

    const uhr2 = makeUhr(BASIS_MS + 24 * 60 * 60 * 1000);
    const l2 = await lauf({ ablage, uhr: uhr2, tenants: alle, kostenFn: () => 15000, runId: "l2" });
    check("Lauf 2: beginnt AUSSCHLIESSLICH Mandate, die Lauf 1 nicht begonnen hat",
      l2.begonnen.every((id) => !l1.begonnen.includes(id)),
      `${l1.begonnen.join(",")} -> ${l2.begonnen.join(",")}`);

    // Ein übersprungenes Mandat trägt KEINEN Versuchsvermerk und steht deshalb vorn.
    const zustand = ablage.dump();
    const uebersprungenL1 = l1.fairness.zeitbudget[0];
    check("Ein wegen Zeitgrenze übersprungenes Mandat wird begonnen, sobald es dran ist",
      l2.begonnen.includes(uebersprungenL1) || Object.keys(zustand.crons["lage-check"] || {}).includes(uebersprungenL1),
      uebersprungenL1);
  }

  // ══ 7 · Wiederaufnahme nach technischem Fehler ════════════════════════════════════════════
  abschnitt("7) Wiederaufnahme nach technischem Fehler");
  {
    const ablage = makeAblage();
    const alle = mandate(4);
    const uhr1 = makeUhr();
    const l1 = await lauf({
      ablage, uhr: uhr1, tenants: alle, kostenFn: () => 10000, runId: "f1",
      fehler: new Set(["m-001"])
    });
    check("Ein technischer Fehler isoliert NUR das eigene Mandat", l1.begonnen.length === 4,
      l1.begonnen.join(","));
    check("Das gescheiterte Mandat ist als fehlgeschlagen gebucht, nicht als Erfolg",
      l1.fairness.fehlgeschlagen.includes("m-001") && !l1.fairness.erfolgreich.includes("m-001"));

    const uhr2 = makeUhr(BASIS_MS + 24 * 60 * 60 * 1000);
    const l2 = await lauf({ ablage, uhr: uhr2, tenants: alle, kostenFn: () => 10000, runId: "f2" });
    check("Im Folgelauf wird das gescheiterte Mandat erneut begonnen",
      l2.begonnen.includes("m-001"), l2.begonnen.join(","));
    check("Ein Dauerfehler verdrängt die übrigen Mandate nicht (Sortierung nach VERSUCH)",
      l2.begonnen.length === 4, l2.begonnen.join(","));
  }

  // ══ 8 · Geteilte Erfassung: identisch zum Einzelabruf ═════════════════════════════════════
  abschnitt("8) Geteilte Erfassung — die Mandatssicht ist identisch zum Einzelabruf");
  {
    const quelle = (id) => ({ id, name: `Quelle ${id}`, url: `https://beispiel.invalid/${id}`, active: true });
    const erg = (id, ok, items, status = "ok", retryCount = 0) => ({
      sourceId: id, sourceName: `Quelle ${id}`, ok, itemCount: items.length, items, status, retryCount
    });
    const it = (hash, sourceId) => ({ hash, id: hash, sourceId, title: `T ${hash}`, publishedAt: "2026-09-05T09:00:00.000Z" });

    // Zwei Mandate: A hat q1,q2 · B hat q2,q3 — q2 ist geteilt.
    const profilQuellen = [
      { politicianId: "A", quellen: [quelle("q1"), quelle("q2")] },
      { politicianId: "B", quellen: [quelle("q2"), quelle("q3")] }
    ];
    const plan = GP.planGlobaleQuellen({ profilQuellen });
    check("Die Vereinigung enthält jede Quelle genau einmal", plan.gesamt === 3,
      plan.quellen.map((q) => q.id).join(","));
    check("Die Vereinigung lässt keinen Weg eines Mandats aus",
      GP.fehlendeQuellen({ profilQuellen, vereinigung: plan.quellen }).length === 0);
    check("Die geteilte Quelle ist als gemeinsam ausgewiesen", plan.gemeinsam === 1);

    const alleErgebnisse = [
      erg("q1", true, [it("h1", "q1")]),
      erg("q2", true, [it("h2", "q2"), it("h3", "q2")]),
      erg("q3", false, [], "error", 2)
    ];
    const zuordnung = LE.quellenJeMandat(plan.herkunft);
    check("Die Zuordnung Mandat -> Quellen ist die Umkehrung der Herkunft",
      [...zuordnung.get("A")].sort().join(",") === "q1,q2"
      && [...zuordnung.get("B")].sort().join(",") === "q2,q3",
      JSON.stringify([...zuordnung].map(([k, v]) => [k, [...v]])));

    const sichtA = LE.mandatsSicht({
      ergebnisse: alleErgebnisse, quellen: plan.quellen, quellenIds: zuordnung.get("A"),
      dedupe: deduplicateRawItems, cap: limitRawCandidates, maxKandidaten: 1000
    });
    const sichtB = LE.mandatsSicht({
      ergebnisse: alleErgebnisse, quellen: plan.quellen, quellenIds: zuordnung.get("B"),
      dedupe: deduplicateRawItems, cap: limitRawCandidates, maxKandidaten: 1000
    });
    check("Mandat A sieht genau seine zwei Quellen", sichtA.checkedSources === 2);
    check("Mandat A sieht NUR die Elemente seiner Quellen",
      sichtA.rawItems.every((i) => ["q1", "q2"].includes(i.sourceId)) && sichtA.rawItems.length === 3,
      sichtA.rawItems.map((i) => i.hash).join(","));
    check("Mandat B sieht den Fehlschlag seiner eigenen Quelle",
      sichtB.failedSources === 1 && sichtB.successfulSources === 1, JSON.stringify({
        f: sichtB.failedSources, s: sichtB.successfulSources
      }));
    check("Der Fehlschlag von Mandat B taucht bei Mandat A NICHT auf", sichtA.failedSources === 0);
    check("Retries werden je Mandat korrekt zugeordnet",
      sichtA.retriesTotal === 0 && sichtB.retriesTotal === 2);
    check("Die Quellenobjekte des Mandats liegen bei (für Telemetrie und sourceLimit)",
      sichtA.quellen.map((q) => q.id).sort().join(",") === "q1,q2");
    check("Die Sicht ist als geteilt gekennzeichnet (nicht mit einem Einzelabruf verwechselbar)",
      sichtA.geteilt === true);

    // Übersprungene Wege zählen weder als Erfolg noch als Fehler — wie im Crawler.
    const mitSkip = LE.mandatsSicht({
      ergebnisse: [erg("q1", true, [], "skipped-shared")], quellen: [quelle("q1")], quellenIds: ["q1"],
      dedupe: deduplicateRawItems, cap: limitRawCandidates
    });
    check("Ein übersprungener Weg zählt weder als Erfolg noch als Fehler",
      mitSkip.checkedSources === 1 && mitSkip.successfulSources === 0 && mitSkip.failedSources === 0
      && mitSkip.skippedSources === 1);

    // Die Zuordnung neuer Elemente je Mandat.
    const gespeichert = [it("h1", "q1"), it("h2", "q2"), it("h9", "q3")];
    check("Neue Elemente werden je Mandat richtig geschnitten",
      LE.neueElementeJeMandat(gespeichert, ["q1", "q2"]).map((i) => i.hash).join(",") === "h1,h2");

    // Brauchbarkeit — fail-safe.
    check("Eine offene Erfassung ist NICHT brauchbar",
      LE.sichtBrauchbar({ status: LE.ERFASSUNG_OFFEN, sichten: { A: {} } }, "A").brauchbar === false);
    check("Eine gescheiterte Erfassung ist NICHT brauchbar",
      LE.sichtBrauchbar({ status: LE.ERFASSUNG_FEHLGESCHLAGEN, sichten: { A: {} } }, "A").brauchbar === false);
    check("Ein nicht erfasstes Mandat ist NICHT brauchbar",
      LE.sichtBrauchbar({ status: LE.ERFASSUNG_ABGESCHLOSSEN, sichten: { A: {} } }, "B").brauchbar === false);
    check("Fehlende Erfassung ist NICHT brauchbar (Handlauf, Einzelroute, Tests)",
      LE.sichtBrauchbar(null, "A").brauchbar === false
      && LE.sichtBrauchbar(undefined, "A").brauchbar === false);
    check("Eine abgeschlossene Erfassung des Mandats IST brauchbar",
      LE.sichtBrauchbar({ status: LE.ERFASSUNG_ABGESCHLOSSEN, sichten: { A: {} } }, "A").brauchbar === true);
    check("Eine TEILWEISE Erfassung ist für die erfassten Mandate brauchbar",
      LE.sichtBrauchbar({ status: LE.ERFASSUNG_TEILWEISE, sichten: { A: {} } }, "A").brauchbar === true);
  }

  abschnitt("8b) Echte Lage-Erfassung wahrt die Sichtbarkeitskontexte (K1-Regression F9)");
  {
    const quelle = (id) => ({ id, active: true });
    const item = (id, sourceId, title, summary, stunde) => ({
      id, hash: id, sourceId, sourceName: sourceId, title, summary,
      url: `https://beispiel.invalid/${id}`, publishedAt: `2026-09-05T${stunde}:00:00.000Z`, linkType: "article"
    });
    // Bestehende F9-Fallfamilie: zwei Personenquellen, zwei unabhaengige Ereignisse.
    const a = item("f9-a", "mandat-a-news", "Abgeordneter besucht Pflegeheim in Spandau",
      "Der Abgeordnete besuchte ein Pflegeheim in Spandau und sprach mit Beschaeftigten ueber die Personalsituation.", "09");
    const b = item("f9-b", "mandat-b-news", "Abgeordnete besucht Jugendzentrum in Harburg",
      "Die Abgeordnete besuchte ein Jugendzentrum in Harburg und sprach mit Jugendlichen ueber die Freizeitangebote.", "10");
    const gemeinsam = item("geteilt", "katalog", "Bundesbank legt Waehrungsbericht vor",
      "Die Bundesbank berichtet ueber Wechselkurse und Waehrungsreserven.", "08");
    const probe = erfassungsProbe({
      quellenJeProfil: { A: [quelle("mandat-a-news"), quelle("katalog")], B: [quelle("mandat-b-news"), quelle("katalog")] },
      itemsJeQuelle: { "mandat-a-news": [a], "mandat-b-news": [b], katalog: [gemeinsam] }
    });
    const ergebnis = await probe.run();
    check("Der echte Erfassungsweg verschmilzt F9 nicht zu einem Vorgang",
      !probe.gruppen.some((g) => g.includes(a.title) && g.includes(b.title)), JSON.stringify(probe.gruppen));
    check("Mandatseigene Quellen und geteilte Katalogquellen bilden drei getrennte Kontexte",
      probe.aufrufe.length === 3, String(probe.aufrufe.length));
    check("Jedes neue Dokument erreicht exakt einen Understanding-Batch",
      probe.aufrufe.flatMap((r) => r.items).length === 3
      && new Set(probe.aufrufe.flatMap((r) => r.items.map((i) => i.hash))).size === 3);
    check("Die Mandatssichten bleiben trotz getrennter Faltung vollstaendig",
      ergebnis.sichten.A.rawItems.length === 2 && ergebnis.sichten.B.rawItems.length === 2);
    check("Die globale Telemetrie bilanziert alle Kontexte und bleibt zaehlbar",
      probe.quittungen.length === 1 && probe.quittungen[0].status === "success"
      && probe.quittungen[0].gespeichert === 3 && probe.quittungen[0].telemetrie.cluster === 3);
    const deadlines = probe.aufrufe.map((r) => r.options.deadlineMs);
    check("Alle Kontexte teilen dieselbe absolute Modellfrist statt eines neuen Einzelbudgets",
      deadlines.length === 3 && new Set(deadlines).size === 1 && deadlines[0] === BASIS_MS + 60000,
      JSON.stringify(deadlines));
    check("Das verbleibende Modellbudget schrumpft nach der Arbeit im vorigen Kontext",
      probe.aufrufe.map((r) => r.options.budgetMs).join(",") === "60000,50000,40000",
      probe.aufrufe.map((r) => r.options.budgetMs).join(","));
    check("Auch die Vormerkung teilt eine einzige absolute Frist",
      new Set(probe.aufrufe.map((r) => r.options.vormerkDeadlineMs)).size === 1
      && probe.aufrufe[0].options.vormerkDeadlineMs === BASIS_MS + 80000);
    const geteilt = erfassungsProbe({
      quellenJeProfil: { A: [quelle("katalog")], B: [quelle("katalog")] }, itemsJeQuelle: { katalog: [gemeinsam] }
    });
    await geteilt.run();
    check("Eine von allen gesehene Quelle wird weiterhin genau einmal verstanden und gespeichert",
      geteilt.aufrufe.length === 1 && geteilt.aufrufe[0].items.length === 1 && geteilt.speicherAufrufe() === 1);
    const mehrfach = erfassungsProbe({
      quellenJeProfil: { A: [quelle("mandat-a-news"), quelle("katalog")], B: [quelle("mandat-b-news"), quelle("katalog")] },
      itemsJeQuelle: { "mandat-a-news": [a], "mandat-b-news": [{ ...a, sourceId: "mandat-b-news" }], katalog: [gemeinsam] }
    });
    await mehrfach.run();
    check("Mehrfachherkunft ueber verschiedene Quellen bleibt nach Hash-Dedup gemeinsam sichtbar",
      mehrfach.aufrufe.length === 1 && mehrfach.aufrufe[0].items.length === 2);
    const ungueltig = erfassungsProbe({
      quellenJeProfil: { A: [quelle("katalog")] }, itemsJeQuelle: { katalog: [gemeinsam] },
      env: { HELMUT_LAGE_UNDERSTAND_BUDGET_MS: "ungueltig", HELMUT_LAGE_VORMERK_BUDGET_MS: "ungueltig" }
    });
    await ungueltig.run();
    check("Ungueltige Budgetwerte erzeugen keine unbegrenzte Modell- oder Vormerkfrist",
      ungueltig.aufrufe[0].options.deadlineMs === BASIS_MS + 60000
      && ungueltig.aufrufe[0].options.vormerkDeadlineMs === BASIS_MS + 80000);

    const vieleProfile = {};
    const vieleItems = {};
    for (let i = 0; i < 10; i += 1) {
      vieleProfile[`m${i}`] = [quelle(`q${i}`)];
      vieleItems[`q${i}`] = [item(`d${i}`, `q${i}`, `Vorlage ${i} zur Pruefung des Haushalts`,
        `Der Ausschuss beraet die Vorlage ${i}.`, "09")];
    }
    const langsam = erfassungsProbe({ quellenJeProfil: vieleProfile, itemsJeQuelle: vieleItems, echtesUnderstanding: true });
    const begrenzt = await langsam.run();
    check("Nach der gemeinsamen Vormerkfrist beginnt kein weiterer echter Understanding-Kontext",
      langsam.aufrufe.length === 3 && langsam.aufrufe.every((r) => r.jetztMs < r.options.vormerkDeadlineMs),
      `${langsam.aufrufe.length} Kontexte, ${begrenzt.dauerMs} ms`);
    check("Langsames IO beendet den Vorlauf nach dem letzten bereits begonnenen Kontext",
      begrenzt.dauerMs === 109989, String(begrenzt.dauerMs));
    check("Die sieben nicht begonnenen Kontexte und Dokumente werden genau gezaehlt",
      begrenzt.globalTelemetrie.nichtBegonneneKontexte === 7
      && begrenzt.globalTelemetrie.nichtBegonneneDokumente === 7);
    const nichtBegonnen = (langsam.quittungen[0].telemetrie.kontextBilanzen || []).filter((k) => k.begonnen === false);
    check("Nicht begonnene Kontexte erhalten keine erfundene Clusterzahl",
      nichtBegonnen.length === 7 && nichtBegonnen.every((k) => k.cluster === null && k.dokumente === 1));
    check("Eine Vormerkluecke bleibt als bekannter offener Cluster sichtbar",
      begrenzt.globalTelemetrie.nichtVorgemerkteCluster === 1);
    check("Ohne fertigen Vorgang bleiben alle zehn Dokumente im Lauf offen, auch die zwei vorgemerkten",
      begrenzt.globalTelemetrie.offeneDokumente === 10);
    check("Erfassung und persistierte Quittung melden den unvollstaendigen Lauf als teilweise",
      begrenzt.status === LE.ERFASSUNG_TEILWEISE
      && begrenzt.globalTelemetrie.status === "partial" && langsam.quittungen[0].status === "partial");
  }

  // ══ 9 · Kostenriegel bleibt erhalten ══════════════════════════════════════════════════════
  abschnitt("9) Kostenriegel — unverändert erhalten");
  {
    const storageSrc = lies("lib/helmut/storage.js");
    const aiSrc = lies("lib/helmut/ai.js");
    const schedulerSrc = lies("lib/helmut/scheduler.js");
    const erfassungSrc = schedulerSrc.slice(
      schedulerSrc.indexOf("async function runGeteilteLageErfassung"),
      schedulerSrc.indexOf("async function runLageCheck")
    );
    check("Der Tagesdeckel ist weiterhin fail-closed (Schutzlimit statt unbegrenzt)",
      /const LLM_LIMIT_FALLBACK = 50;/.test(storageSrc));
    check("Die Reservierung ist weiterhin atomar (ein Schreibvorgang mit Bedingung)",
      /used < p_max|ON CONFLICT[\s\S]{0,200}WHERE/i.test(storageSrc));
    check("Der Modellaufruf geht weiterhin durch die Budgetreservierung",
      /reserveLlmBudgetOrThrow/.test(aiSrc));
    // Die geteilte Erfassung faltet den Korpus global — sie ruft also SEHR WOHL das Modell.
    // Entscheidend ist, dass sie das ausschliesslich ueber denselben Weg tut wie jeder andere
    // Modellaufruf: `runUnderstandingShadow` -> `requestStructuredJson` -> `requestOpenAI` ->
    // Budgetreservierung. Ein DIREKTER Weg am Choke-Point vorbei waere der Fehler.
    check("Die geteilte Erfassung oeffnet KEINEN direkten Modellweg am Choke-Point vorbei",
      !/requestOpenAI|requestStructuredJson|requestText|api\.openai\.com|azure/i.test(erfassungSrc));
    check("Sie erreicht das Modell ausschliesslich ueber runUnderstandingShadow",
      /runUnderstandingShadow/.test(erfassungSrc));
    check("Ihr Modellbudget nimmt hoechstens die HAELFTE der Restzeit (Mandatsphase bleibt uebrig)",
      /Math\.floor\(restMs \/ 2\)/.test(erfassungSrc));
    check("Ihr Vormerk-Loop ist ebenfalls gedeckelt (kein unbegrenzter serieller Loop)",
      /vormerkBudgetMs:[\s\S]{0,120}vormerkDeadlineMs:[\s\S]{0,120}savePendingBulk:/.test(erfassungSrc));
    check("Die geteilte Erfassung ruft KEINEN Aussenkanal auf",
      !/sendPush|sendMail|sendeMail|invokeLambda|webhook/i.test(erfassungSrc));
    check("Das Modellbudget des Lage-Checks ist unverändert (60 s Default)",
      /HELMUT_LAGE_UNDERSTAND_BUDGET_MS \|\| 60000/.test(schedulerSrc));
  }

  // ══ 10 · Kommunikationsriegel bleibt erhalten ═════════════════════════════════════════════
  abschnitt("10) Kommunikationsriegel — unverändert erhalten");
  {
    // Ohne JEDE Umgebungsvariable: eine synthetische Kennung bleibt gesperrt.
    // Zweites Argument ist die UMGEBUNG — hier bewusst LEER: die Sperre muss ohne jede
    // Umgebungsvariable greifen.
    const kohorte = RIEGEL.pruefe({ kanal: "push", kennung: "test-kohorte-a-001" }, {});
    check("Synthetische Kennung ist OHNE Umgebungsvariable gesperrt",
      kohorte.erlaubt === false && kohorte.grund === RIEGEL.GRUND.SYNTHETISCH,
      JSON.stringify(kohorte));
    for (const kanal of RIEGEL.KANAELE) {
      const e = RIEGEL.pruefe({ kanal, kennung: "test-kohorte-a-007" }, {});
      check(`Kanal \`${kanal}\`: die Kohorte bleibt ohne Umgebungsvariable gesperrt`,
        e.erlaubt === false, JSON.stringify(e));
    }
    check("Ein unbekannter Aussenkanal wird gesperrt, nicht durchgelassen",
      RIEGEL.pruefe({ kanal: "brieftaube", kennung: "test-kohorte-a-001" }, {}).erlaubt === false);
    check("Ein REALES Mandat bleibt ohne Testfenster erlaubt (der Riegel sperrt nicht pauschal)",
      RIEGEL.pruefe({ kanal: "push", kennung: "cem-ince" }, {}).erlaubt === true);
    check("Im Testfenster schweigt auch das reale Mandat",
      RIEGEL.pruefe({ kanal: "push", kennung: "cem-ince" },
        { [RIEGEL.SCHALTER]: RIEGEL.SCHALTER_WERT_GESPERRT }).erlaubt === false);
    const src = lies("lib/helmut/kommunikationsriegel.js");
    check("Unlesbare Umgebung führt weiterhin zur STRENGEREN Stellung (fail-closed)",
      /catch[\s\S]{0,200}MODUS_TESTFENSTER/.test(src));
    const serverSrc = lies("server.js");
    check("Der Lage-Check stellt weiterhin je Mandat einzeln zu (Riegel bleibt im Pfad)",
      /sendLageChangePush\(lageCheck, profile\)/.test(serverSrc));
    check("Die geteilte Erfassung läuft VOR der Mandatsschleife und stellt nichts zu",
      serverSrc.indexOf("runGeteilteLageErfassung") > 0
      && !/runGeteilteLageErfassung[\s\S]{0,400}sendLageChangePush/.test(serverSrc));
  }

  // ══ 11 · mandate_profiles.updated_at ══════════════════════════════════════════════════════
  abschnitt("11) updated_at ändert sich NUR bei tatsächlicher Profiländerung");
  {
    const S = require(path.join(ROOT, "lib", "helmut", "storage.js"));
    const bestand = {
      user_id: "m-1", partei: "Testpartei", aktiv: true,
      ausschuesse: ["Innenausschuss", "Finanzausschuss"],
      themen_prioritaeten: { b: 2, a: 1 },
      naechste_termine: [], geloescht_at: null,
      created_at: "2026-09-04T11:38:24.218261+00", updated_at: "2026-09-04T11:38:24.218261+00"
    };
    const gleich = { user_id: "m-1", partei: "Testpartei", aktiv: true,
      ausschuesse: ["Innenausschuss", "Finanzausschuss"],
      themen_prioritaeten: { a: 1, b: 2 }, naechste_termine: [], geloescht_at: null };

    check("Inhaltsgleicher Schreibvorgang gilt NICHT als Änderung",
      S.mandateProfileZeileGeaendert(gleich, bestand).geaendert === false,
      JSON.stringify(S.mandateProfileZeileGeaendert(gleich, bestand)));
    check("Schlüsselreihenfolge in JSONB ist keine Änderung",
      S.mandateProfileZeileGeaendert({ ...gleich, themen_prioritaeten: { b: 2, a: 1 } }, bestand).geaendert === false);
    check("Die Aktivierung (aktiv false -> true) IST eine Änderung",
      S.mandateProfileZeileGeaendert({ ...gleich, aktiv: true }, { ...bestand, aktiv: false }).geaendert === true);
    check("Die Änderung benennt das betroffene Feld",
      S.mandateProfileZeileGeaendert({ ...gleich, aktiv: true }, { ...bestand, aktiv: false }).felder.join(",") === "aktiv");
    check("Die REIHENFOLGE einer Array-Spalte ist Inhalt, also eine Änderung",
      S.mandateProfileZeileGeaendert({ ...gleich, ausschuesse: ["Finanzausschuss", "Innenausschuss"] }, bestand).geaendert === true);
    check("Ein zusätzliches Element in einer Array-Spalte ist eine Änderung",
      S.mandateProfileZeileGeaendert({ ...gleich, ausschuesse: ["Innenausschuss", "Finanzausschuss", "Sportausschuss"] }, bestand).geaendert === true);
    check("Eine noch nicht vorhandene Zeile gilt als Änderung",
      S.mandateProfileZeileGeaendert(gleich, null).geaendert === true);
    check("null, undefined und Leerzeichenkette fallen zusammen (PostgREST liefert null)",
      S.mandateProfileZeileGeaendert({ user_id: "m-1", partei: "" }, { partei: null }).geaendert === false);
    check("Zeitzonenschreibweise ist keine Änderung (+00 gegen Z)",
      S.mandateProfileZeileGeaendert(
        { user_id: "m-1", geloescht_at: "2026-09-04T11:38:24.000Z" },
        { geloescht_at: "2026-09-04 11:38:24+00" }
      ).geaendert === false);
    check("Eine gewöhnliche Zeichenkette wird NICHT als Zeitstempel gedeutet",
      S.mandateProfileZeileGeaendert({ user_id: "m-1", bundesland: "Berlin" }, { bundesland: "Bayern" }).geaendert === true);
    check("created_at wird nie verglichen und nie geschrieben",
      S.mandateProfileZeileGeaendert({ user_id: "m-1", created_at: "2020-01-01T00:00:00Z" },
        { created_at: "2026-09-04T11:38:24+00" }).geaendert === false);

    const storageSrc = lies("lib/helmut/storage.js");
    check("updated_at wird NUR im Änderungsfall in die Zeile geschrieben",
      /if \(vergleich\.geaendert\) zeile\.updated_at = new Date\(\)\.toISOString\(\);/.test(storageSrc));
    check("created_at steht in keinem Schreibpfad von mandate_profiles",
      !/zeile\.created_at\s*=/.test(storageSrc));
    check("Der Bestand wird mit ausdrücklichem Mandantenfilter gelesen (CLAUDE.md §4.1)",
      /mandate_profiles\?user_id=eq\.\$\{encodeURIComponent\(id\)\}/.test(storageSrc));
    check("Ein Lesefehler setzt den Zeitstempel (sichere Richtung) und wird protokolliert",
      /bestandGelesen = false;[\s\S]{0,200}console\.warn/.test(storageSrc));
    check("Eine FREMDE Zeile wird nicht als Bestand akzeptiert (Mandantenprüfung auf der Antwort)",
      /String\(zeile\.user_id\) === String\(profile\.id\)/.test(storageSrc));
  }

  // ══ 12 · Der Vormerk-Riegel ist im Lage-Pfad verdrahtet ═══════════════════════════════════
  abschnitt("12) Vormerk-Riegel im Lage-Pfad (die gemessene Hauptsenke)");
  {
    const schedulerSrc = lies("lib/helmut/scheduler.js");
    const fold = schedulerSrc.slice(
      schedulerSrc.indexOf("async function foldLageItemsIntoV3"),
      schedulerSrc.indexOf("async function runGeteilteLageErfassung")
    );
    check("Der Lage-Pfad reicht `savePendingBulk` durch (kein serieller Loop mehr)",
      /savePendingBulk: savePendingKnowledgeObjectsBulk/.test(fold));
    check("Der Lage-Pfad reicht ein Vormerk-BUDGET durch", /vormerkBudgetMs/.test(fold));
    check("Der Lage-Pfad reicht eine absolute Vormerk-Deadline durch", /vormerkDeadlineMs/.test(fold));
    check("Das Vormerk-Budget wirkt auch OHNE absolute Deadline (fail-closed)",
      /HELMUT_LAGE_VORMERK_BUDGET_MS \|\| LAGE_VORMERK_BUDGET_MS/.test(schedulerSrc)
      && /const LAGE_VORMERK_BUDGET_MS = 20000;/.test(schedulerSrc));

    const understandingSrc = lies("lib/helmut/understanding.js");
    check("Nicht mehr Vorgemerktes wird GEZÄHLT, nicht verschwiegen",
      /nichtVorgemerkt/.test(understandingSrc));
    check("Ein Speicherfehler zählt NICHT als Vormerkung (kein falsches Grün)",
      /vormerkFehlgeschlagen/.test(understandingSrc));
  }

  // ══ 13 · Was NICHT geändert wurde ═════════════════════════════════════════════════════════
  abschnitt("13) Grenzen des Sprints — was ausdrücklich unverändert bleibt");
  {
    const vercel = JSON.parse(lies("vercel.json"));
    check("Keine Cron-Zeit und keine Cron-Reihenfolge geändert",
      vercel.crons.map((c) => `${c.path}@${c.schedule}`).sort().join("|") === [
        "/api/cron/crawl@0 4 * * *", "/api/cron/crawl@0 20 * * *",
        "/api/cron/pipeline@0 16 * * *", "/api/cron/morning-briefing@0 5 * * *",
        "/api/cron/health-report@0 6 * * *", "/api/cron/lage-check@0 10 * * *",
        "/api/cron/lage-briefing@45 5 * * *",
        "/api/cron/understanding@30 21 * * *", "/api/cron/understanding@30 5 * * *",
        "/api/cron/lage-briefing-nachlauf@10 6 * * *", "/api/cron/lage-briefing-nachlauf@22 6 * * *",
        "/api/cron/understanding-rueckstand@30 11 * * *", "/api/cron/understanding-rueckstand@30 17 * * *"
      ].sort().join("|"));
    check("Funktionslimit unverändert (maxDuration 300)", vercel.functions["api/index.js"].maxDuration === 300);
    check("Zeitbudget des Lage-Checks unverändert (240 000 ms)",
      /deadlineMs: 240000,\s*\n\s*runId: laufId/.test(lies("server.js")));
    check("Äussere Zeitgrenze unverändert (280 000 ms)", /280000, "cron-lage-check-gesamt"/.test(lies("server.js")));

    const migrationen = fs.readdirSync(path.join(ROOT, "supabase", "migrations"))
      .filter((f) => f.endsWith(".sql") && !f.startsWith("rollback_"));
    check("Keine neue Migration in diesem Sprint",
      !migrationen.some((f) => /2026090[5-9]/.test(f)), migrationen.filter((f) => /202609/.test(f)).join(","));

    const flags = JSON.parse(lies("helmut-flags.json"));
    check("Kein neues Flag scharfgeschaltet",
      !Object.keys(flags).some((k) => /LAGE_ERFASSUNG|LAGE_VORMERK|TENANT_SLICE/.test(k)),
      Object.keys(flags).join(","));
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  if (!fail) {
    console.log("Offline bestanden: Fairnessrechnung fuer 5/25/500 und Kontextvertraege des Lage-Checks.");
    console.log("Die tatsaechliche Laufzeit und vollstaendige Versorgung brauchen Production-Belege.");
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER:", e && e.stack); process.exit(1); });
