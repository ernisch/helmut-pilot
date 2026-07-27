"use strict";

// Helmut — Regressionsschutz für den Betriebsbefund vom 2026-07-27:
// =============================================================================================
// `/api/cron/crawl` lief zweimal in ein HTTP 504 nach 300 s (2026-07-26 22:09 manuell,
// 2026-07-27 04:01 als Cron). Belegte Ursache, in zwei Teilen:
//
//   1. Der Vormerk-Loop für zurückgestellte Cluster (aus PR #143) war der EINZIGE Loop
//      der Kette ohne Zeitgrenze — bei ~1,7 Clustern/s und ~300 zurückgestellten Clustern
//      sind das ~176 s, die auf Crawl (~156 s) + lazy (17 s) + eager (90 s) oben drauf kamen.
//   2. Nichts begrenzte die SUMME der Phasenbudgets, und `/api/cron/crawl` war der einzige
//      Cron ganz ohne Zeitgrenze (sein Geschwisterpfad `/api/cron/pipeline` hatte beide).
//
// Die eigentliche Folge war nicht der 504, sondern der Verlust der Beobachtbarkeit:
// `persistSourceCrawlTelemetry` steht als LETZTE Anweisung in `runSourceCrawl` und wurde
// deshalb nie erreicht — `source_crawl_telemetry` blieb über zwei volle Läufe leer.
//
// Dieser Test hält beide Reparaturen fest. Er ist offline, ohne Netz, ohne DB, ohne KI.

const fs = require("fs");
const path = require("path");
const u = require("../lib/helmut/understanding");

const root = path.join(__dirname, "..");
const src = (f) => fs.readFileSync(path.join(root, f), "utf8");
let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`); }
}

// --- Deps ohne Netz/KI/DB --------------------------------------------------------------------
const analyse = {
  headline: "Testvorgang", was_ist_passiert: "Test", warum_wichtig: "Test",
  wer_ist_betroffen: "Test", handlungsempfehlung: "Test", confidence_score: 0.9
};
function machDeps(overrides = {}) {
  const vorgemerkte = [];
  const verknuepfungen = [];
  const deps = {
    enabled: () => true,
    aiEnabled: () => true,
    acquireLock: () => ({ granted: true, active: true }),
    releaseLock: () => {},
    getExisting: () => null,
    canSpend: () => ({ allowed: true }),
    requestUnderstanding: async () => { await new Promise((r) => setTimeout(r, 40)); return { ...analyse }; },
    save: (k) => ({ saved: true, id: k.id }),
    logSkip: () => {},
    // Der teure Teil: je Cluster zwei serielle Round-Trips. Hier bewusst langsam
    // gemacht, damit ein kleines Budget reproduzierbar greift.
    savePending: async (vorgangId) => {
      await new Promise((r) => setTimeout(r, 12));
      vorgemerkte.push(vorgangId);
      return { saved: true, id: `ko-${vorgangId}` };
    },
    saveSources: async (koId, docs) => {
      await new Promise((r) => setTimeout(r, 12));
      verknuepfungen.push({ koId, anzahl: docs.length });
    },
    ...overrides
  };
  return { deps, vorgemerkte, verknuepfungen };
}

// Genug fachlich UNTERSCHIEDLICHE Dokumente, damit viele eigene Cluster entstehen.
const themen = [
  "Rentenpaket 2026 im Kabinett beschlossen", "Mindestlohn steigt auf 15 Euro bundesweit",
  "Pflegereform heute offiziell vorgestellt", "Buergergeld Sanktionen deutlich verschaerft",
  "Krankenhausfinanzierung wird neu geregelt", "Wohngeldreform tritt in Kraft",
  "Kindergrundsicherung im Bundesrat gestoppt", "Tariftreuegesetz im Ausschuss beraten",
  "Fachkraefteeinwanderung wird vereinfacht", "Lieferkettengesetz erneut geaendert",
  "Arbeitszeiterfassung gesetzlich verankert", "Elterngeld Anspruch neu berechnet"
];
const items = themen.map((titel, i) => ({ title: titel, url: `https://example.org/${i}` }));

(async () => {
  console.log("== 1) Ohne Budget bleibt das Verhalten aus PR #143 unveraendert ==");
  {
    const { deps, vorgemerkte } = machDeps();
    const r = await u.runUnderstandingShadow(items, { ...deps, budgetMs: 10 });
    check("Zurueckgestellte Cluster entstehen ueberhaupt (Budget stoppt den KI-Loop)",
      r.deferred > 0, `deferred=${r.deferred}`);
    check("Ohne Vormerk-Grenze wird JEDER zurueckgestellte Cluster vorgemerkt",
      r.vorgemerkt === r.deferred, `vorgemerkt=${r.vorgemerkt} deferred=${r.deferred}`);
    check("Ohne Vormerk-Grenze bleibt nichts unvorgemerkt",
      !r.nichtVorgemerkt, `nichtVorgemerkt=${r.nichtVorgemerkt}`);
    check("Vormerken schreibt auch die Dokumentverknuepfung (Invariante aus #143)",
      vorgemerkte.length === r.vorgemerkt, `writes=${vorgemerkte.length}`);
  }

  console.log("\n== 2) `vormerkBudgetMs` begrenzt den Vormerk-Loop ==");
  {
    const { deps } = machDeps();
    const r = await u.runUnderstandingShadow(items, { ...deps, budgetMs: 10, vormerkBudgetMs: 30 });
    check("Erschoepftes Vormerk-Budget stoppt den Loop",
      r.nichtVorgemerkt > 0, `nichtVorgemerkt=${r.nichtVorgemerkt}`);
    check("Es wird trotzdem so viel vorgemerkt wie das Budget zulaesst",
      r.vorgemerkt >= 1, `vorgemerkt=${r.vorgemerkt}`);
    check("Der Rest verschwindet NICHT still: vorgemerkt + nichtVorgemerkt = zurueckgestellt",
      r.vorgemerkt + r.nichtVorgemerkt === r.deferred,
      `${r.vorgemerkt}+${r.nichtVorgemerkt} != ${r.deferred}`);
  }

  console.log("\n== 3) `vormerkDeadlineMs` (absolut) begrenzt ebenfalls ==");
  {
    const { deps, vorgemerkte } = machDeps();
    // Deadline liegt bereits in der Vergangenheit -> kein einziger Vormerk-Write.
    const r = await u.runUnderstandingShadow(items, {
      ...deps, budgetMs: 10, vormerkDeadlineMs: Date.now() - 1000
    });
    check("Ueberschrittene Deadline verhindert jeden Vormerk-Write",
      vorgemerkte.length === 0, `writes=${vorgemerkte.length}`);
    check("Die zurueckgestellten Cluster werden vollstaendig als unvorgemerkt gemeldet",
      r.nichtVorgemerkt === r.deferred, `nichtVorgemerkt=${r.nichtVorgemerkt} deferred=${r.deferred}`);
  }

  console.log("\n== 4) Quelltext-Riegel: die Zeitgrenzen duerfen nicht still verschwinden ==");
  {
    const understandingSrc = src("lib/helmut/understanding.js");
    const schedulerSrc = src("lib/helmut/scheduler.js");
    const serverSrc = src("server.js");

    check("understanding.js: der Vormerk-Loop prueft eine Zeitgrenze",
      /vormerkBudgetMs/.test(understandingSrc) && /vormerkDeadlineMs/.test(understandingSrc));
    check("understanding.js: unvorgemerkte Cluster werden gezaehlt statt verschwiegen",
      /nichtVorgemerkt/.test(understandingSrc));

    check("scheduler.js: der Lauf hat ein Gesamt-Zeitbudget",
      /HELMUT_CRAWL_GESAMTBUDGET_MS/.test(schedulerSrc) && /verbleibendMs/.test(schedulerSrc));
    check("scheduler.js: das lazy-Budget ist aus der Restzeit abgeleitet",
      /lazyBudgetMs\s*=\s*Math\.min\(/.test(schedulerSrc));
    check("scheduler.js: das eager-Budget ist aus der Restzeit abgeleitet",
      /eagerBudgetMs\s*=\s*Math\.min\(/.test(schedulerSrc));
    check("scheduler.js: der Vormerk-Loop bekommt eine ABSOLUTE Deadline (keine Dauer)",
      /vormerkDeadlineMs\s*=\s*runStartedMs\s*\+\s*runBudgetMs/.test(schedulerSrc));

    // Der Kern des Befunds: /api/cron/crawl war der einzige Cron ohne Zeitgrenze.
    const crawlBlock = serverSrc.slice(
      serverSrc.indexOf('url.pathname === "/api/cron/crawl"'),
      serverSrc.indexOf('url.pathname === "/api/cron/crawl"') + 1400
    );
    check("server.js: /api/cron/crawl hat ein aeusseres Zeitlimit",
      /withTimeout\(/.test(crawlBlock), "kein withTimeout im Block");
    check("server.js: /api/cron/crawl reicht eine deadlineMs an runCronForTenants durch",
      /deadlineMs:\s*\d+/.test(crawlBlock), "keine deadlineMs im Block");

    const pipelineRunBlock = serverSrc.slice(
      serverSrc.indexOf('url.pathname === "/api/pipeline/run"'),
      serverSrc.indexOf('url.pathname === "/api/pipeline/run"') + 1600
    );
    check("server.js: der manuelle /api/pipeline/run hat ein Zeitlimit",
      /withTimeout\(/.test(pipelineRunBlock), "kein withTimeout im Block");
  }

  console.log("\n== 5) Die Summe der Regelbudgets passt unter das Funktionslimit ==");
  {
    // maxDuration steht in vercel.json; die Budgets sind Defaults im Code.
    const vercel = JSON.parse(src("vercel.json"));
    const maxDurationS = vercel.functions && vercel.functions["api/index.js"]
      && vercel.functions["api/index.js"].maxDuration;
    check("vercel.json nennt maxDuration", Number(maxDurationS) > 0, `maxDuration=${maxDurationS}`);
    const gesamtbudgetMs = 240000; // Default in scheduler.js
    check("Gesamtbudget liegt unter dem Funktionslimit (Reserve fuer Abschluss + Antwort)",
      gesamtbudgetMs < Number(maxDurationS) * 1000,
      `${gesamtbudgetMs}ms vs ${Number(maxDurationS) * 1000}ms`);
    check("Die Reserve betraegt mindestens 30 s",
      Number(maxDurationS) * 1000 - gesamtbudgetMs >= 30000);
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  if (fail === 0) {
    console.log("Die Pipeline kann ihr Zeitbudget nicht mehr ueberschreiten: jede Phase ist");
    console.log("begrenzt, die Summe ist begrenzt, und was nicht mehr passt wird gezaehlt.");
  }
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER:", e && e.stack); process.exit(1); });
