"use strict";

// Offline-Vertragstest des VERDRÄNGUNGSSCHUTZES der fünf realen Mandate.
//
// Die Frage, die dieser Test beantwortet: können 495 synthetische Profile den
// fünf realen Mandaten etwas wegnehmen — beim KI-Budget, in der Warteschlange,
// bei der Laufzeit oder in der Priorisierung?
//
// Vier Ebenen, jede einzeln belegt:
//   A · KI-BUDGET       storage.reserveLlmCall + Vorrangreserve
//   B · WARTESCHLANGE   source-demand.mandatsPrioritaet (Anspruchsordnung)
//   C · LAUFZEIT        cron-fairness.planTenantOrder + Lage-Briefing-Schleife
//   D · INERTHEIT       ohne synthetische Zeilen ändert sich NICHTS
//
// Reine Rechenprüfung: kein Netz, keine Datenbank, kein Modellaufruf.

const fs = require("fs");
const path = require("path");
const M = require("../lib/helmut/mandatsklasse");
const sd = require("../lib/helmut/source-demand");
const fairness = require("../lib/helmut/cron-fairness");
const fair = require("../lib/helmut/llm-budget-fair");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const REAL = "ein-reales-mandat";
const SYNTH = "test-kohorte-c-400";

// Frische storage-Instanz mit gesetzter Umgebung. `reserveLlmCall` liest die
// Umgebung bei JEDEM Aufruf, der Zähler lebt aber im Modul — deshalb wird er
// zwischen den Fällen zurückgesetzt.
function mitUmgebung(werte, fn) {
  const sicherung = {};
  for (const k of Object.keys(werte)) { sicherung[k] = process.env[k]; process.env[k] = werte[k]; }
  try { return fn(); }
  finally {
    for (const k of Object.keys(werte)) {
      if (sicherung[k] === undefined) delete process.env[k]; else process.env[k] = sicherung[k];
    }
  }
}

async function main() {
  console.log("Helmut — Vertragstest des Verdrängungsschutzes der realen Mandate\n");
  const storage = require("../lib/helmut/storage");

  // ── A · KI-Budget ─────────────────────────────────────────────────────────
  console.log("A · KI-Budget: die Vorrangreserve ist laufzeitwirksam");

  // Ein Zähler, der den Tagesstand liefert — injiziert, damit nichts gelesen wird.
  const usageTodayFn = (stand) => async () => ({ calls: stand });

  async function reserviere({ stand, callType, politicianId, deckel, reserve, vorrang }) {
    return mitUmgebung({
      HELMUT_MAX_LLM_CALLS_PER_DAY: String(deckel),
      HELMUT_LLM_RESERVE_UNDERSTANDING: String(reserve),
      ...(vorrang === null ? {} : { HELMUT_TESTLAUF_VORRANG_REAL: String(vorrang) })
    }, async () => {
      storage.__resetLlmReservationForTests();
      return storage.reserveLlmCall({
        callType,
        politicianId,
        referenceIso: "2026-09-10T12:00:00.000Z",
        deps: { usageToday: usageTodayFn(stand) }
      });
    });
  }

  // Deckel 1000, Verstehens-Reserve 100, Vorrangreserve 200.
  //   reales Mandat (mandatsgebunden):  darf bis 1000 − 100 = 900
  //   synthetisches Mandat:             darf bis 1000 − 100 − 200 = 700
  //   geteilte Arbeit (understanding):  darf bis 1000 − 200 = 800
  const B = { deckel: 1000, reserve: 100, vorrang: 200 };

  const realBei699 = await reserviere({ ...B, stand: 699, callType: "lageBriefing", politicianId: REAL });
  const synthBei699 = await reserviere({ ...B, stand: 699, callType: "lageBriefing", politicianId: SYNTH });
  check("A1 Bei Stand 699 bekommen BEIDE noch einen Slot",
    realBei699.allowed === true && synthBei699.allowed === true);

  const realBei700 = await reserviere({ ...B, stand: 700, callType: "lageBriefing", politicianId: REAL });
  const synthBei700 = await reserviere({ ...B, stand: 700, callType: "lageBriefing", politicianId: SYNTH });
  check("A2 Ab Stand 700 ist das SYNTHETISCHE Profil gesperrt, das reale nicht",
    realBei700.allowed === true && synthBei700.allowed === false,
    `real=${realBei700.allowed}, synthetisch=${synthBei700.allowed}`);
  check("A3 Der Ablehnungsgrund benennt die Vorrangreserve",
    synthBei700.reason === "daily-llm-budget-reserved-for-real-mandates",
    String(synthBei700.reason));
  check("A4 Die wirksame Reserve steht im Ergebnis",
    synthBei700.vorrangreserveReal === 200 && realBei700.vorrangreserveReal === 0);

  const realBei899 = await reserviere({ ...B, stand: 899, callType: "lageBriefing", politicianId: REAL });
  const realBei900 = await reserviere({ ...B, stand: 900, callType: "lageBriefing", politicianId: REAL });
  check("A5 Das reale Mandat sieht unverändert die Verstehens-Reserve als Grenze (900)",
    realBei899.allowed === true && realBei900.allowed === false
      && realBei900.reason === "daily-llm-budget-reserved-for-understanding");

  const geteiltBei799 = await reserviere({ ...B, stand: 799, callType: "understanding", politicianId: null });
  const geteiltBei800 = await reserviere({ ...B, stand: 800, callType: "understanding", politicianId: null });
  check("A6 Auch die GETEILTE Arbeit darf die Vorrangreserve nicht aufbrauchen (800)",
    geteiltBei799.allowed === true && geteiltBei800.allowed === false,
    "Verstehen hat mit HELMUT_LLM_RESERVE_UNDERSTANDING eine eigene Reserve");

  const ohneKennung = await reserviere({ ...B, stand: 700, callType: "lageBriefing", politicianId: null });
  check("A7 Ein mandatsgebundener Aufruf OHNE Kennung bekommt fail-closed die strengere Grenze",
    ohneKennung.allowed === false);

  // Ohne gesetzte Reserve muss sich NICHTS ändern.
  const ohneReserveSynth = await reserviere({
    deckel: 1000, reserve: 100, vorrang: null, stand: 700, callType: "lageBriefing", politicianId: SYNTH
  });
  const ohneReserveReal = await reserviere({
    deckel: 1000, reserve: 100, vorrang: null, stand: 700, callType: "lageBriefing", politicianId: REAL
  });
  check("A8 OHNE gesetzte Vorrangreserve verhalten sich beide identisch (verhaltensneutral)",
    ohneReserveSynth.allowed === true && ohneReserveReal.allowed === true
      && ohneReserveSynth.vorrangreserveReal === 0);

  // Der belegte Grund, warum 5 nicht reicht.
  check("A9 Der gemessene Tagesbedarf der realen Mandate ist 170, nicht 5",
    M.VORRANG_REAL_MESSBEDARF_P95 === 170);

  // ── B · Warteschlange ─────────────────────────────────────────────────────
  console.log("\nB · Warteschlange: die Anspruchsordnung stellt reale Mandate davor");
  check("B1 Ein synthetischer mandatsgebundener Auftrag bekommt +1 auf die Priorität",
    sd.mandatsPrioritaet(200, SYNTH) === 201 && sd.mandatsPrioritaet(200, REAL) === 200);
  check("B2 Die Warteschlange zieht nach priority ASC — kleiner ist früher",
    (() => {
      const migration = fs.readFileSync(
        path.join(ROOT, "supabase", "migrations", "20260808_scalable_job_queue.sql"), "utf8");
      return /order by j\.priority asc, j\.due_at asc, j\.created_at asc/.test(migration);
    })(), "Beleg, dass +1 tatsaechlich hinten bedeutet");
  check("B3 GETEILTE Aufträge (ohne Mandatsbezug) bleiben unberührt",
    sd.mandatsPrioritaet(100, null) === 100 && sd.mandatsPrioritaet(80, "") === 80);
  check("B4 Der Aufschlag gilt für BEIDE mandatsgebundenen Auftragsarten",
    sd.mandatsPrioritaet(60, SYNTH) === 61 && sd.mandatsPrioritaet(300, SYNTH) === 301);
  check("B5 Keine Koerzierung: ein nicht-numerischer Wert bleibt unverändert",
    sd.mandatsPrioritaet(null, SYNTH) === null && sd.mandatsPrioritaet("hoch", SYNTH) === "hoch");

  // ── C · Laufzeit ──────────────────────────────────────────────────────────
  console.log("\nC · Laufzeit: wer bei hartem Zeitbudget zuerst drankommt");
  const gemischt = [SYNTH, REAL, "test-kohorte-a-001", "zweites-reales-mandat"];
  const ordnung = fairness.planTenantOrder({ cronName: "morning-briefing", tenantIds: gemischt, nowMs: 1000 });
  check("C1 cron-fairness stellt reale Mandate vor synthetische",
    ordnung.order.slice(0, 2).every((id) => !M.istSynthetischeKennung(id))
      && ordnung.order.slice(2).every((id) => M.istSynthetischeKennung(id)),
    ordnung.order.join(" > "));
  check("C2 Es fällt keine Kennung weg",
    ordnung.order.length === 4 && new Set(ordnung.order).size === 4);
  check("C3 Die Lage-Briefing-Schleife sortiert reale Profile nach vorn",
    (() => {
      const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
      return /profiles = mandatsklasse\.sortiereRealZuerst\(profiles, \(p\) => \(p && p\.id\) \|\| null\);/.test(server);
    })());
  check("C4 sortiereRealZuerst ist stabil innerhalb einer Klasse",
    (() => {
      const eingang = ["b-real", "test-kohorte-a-002", "a-real", "test-kohorte-a-001"];
      return JSON.stringify(M.sortiereRealZuerst(eingang))
        === JSON.stringify(["b-real", "a-real", "test-kohorte-a-002", "test-kohorte-a-001"]);
    })());
  check("C5 Synthetische Profile bauen KEINE eigenen Aussenquellen mehr",
    (() => {
      const scheduler = require("../lib/helmut/scheduler");
      return scheduler.profilQuellenErlaubt({ id: REAL }, {}) === true
        && scheduler.profilQuellenErlaubt({ id: SYNTH }, {}) === false
        && scheduler.profilQuellenErlaubt({ id: SYNTH }, { HELMUT_TESTKOHORTE_QUELLEN: "aktiv" }) === true;
    })(), "sonst 495 × 2 Google-News-Abrufe je Zyklus (OP-15-Klumpenrisiko)");

  // ── C2 · Der abgeschnittene Planungslauf ──────────────────────────────────
  console.log("\nC2 · Wer überlebt einen abgeschnittenen Planungslauf?");
  const pipelineQuelle = fs.readFileSync(path.join(ROOT, "lib/helmut/scalable-pipeline.js"), "utf8");
  check("C2a Die Einreihereihenfolge trennt real / geteilt / synthetisch",
    /const alle = \[\.\.\.realeArbeit, \.\.\.geteilteArbeit, \.\.\.synthetischeArbeit\];/.test(pipelineQuelle),
    "die mandatsgebundene Arbeit stand geschlossen am ENDE — sie fiele bei einem "
    + "abgeschnittenen Lauf als Erstes weg");
  check("C2b Die Zuordnung folgt derselben kanonischen Klassifizierung",
    /mandatsklasse\.istSynthetischeKennung\(tenant\)/.test(pipelineQuelle));
  check("C2c Der relationale Crawlplan wird je Lauf EINMAL gebaut, nicht je Profil",
    (() => {
      const schedulerQuelle = fs.readFileSync(path.join(ROOT, "lib/helmut/scheduler.js"), "utf8");
      return /opts\.planCache/.test(schedulerQuelle)
        && /const planCache = \{\};/.test(pipelineQuelle)
        && /getSourcesForProfile\(p, \{ planCache \}\)/.test(pipelineQuelle);
    })(), "sonst 1.500 Lesevorgänge bei 500 Profilen — in einer Phase mit hartem Zeitbudget");
  check("C2d Ohne Cache-Objekt verhält sich der Ladepfad unverändert",
    (() => {
      const schedulerQuelle = fs.readFileSync(path.join(ROOT, "lib/helmut/scheduler.js"), "utf8");
      return /const cache = opts\.planCache && typeof opts\.planCache === "object" \? opts\.planCache : null;/
        .test(schedulerQuelle);
    })());
  check("C2e Der Zwischenspeicher ist laufweit — kein Modulzustand, keine Uhr, keine TTL",
    (() => {
      const schedulerQuelle = fs.readFileSync(path.join(ROOT, "lib/helmut/scheduler.js"), "utf8");
      const block = schedulerQuelle.slice(
        schedulerQuelle.indexOf("async function loadRelationalSharedSources"),
        schedulerQuelle.indexOf("// ── KEINE EIGENEN AUSSENABRUFE"));
      return !/Date\.now\(\)/.test(block) && !/setTimeout/.test(block) && !/ttl/i.test(block);
    })());

  // ── D · Inertheit ─────────────────────────────────────────────────────────
  console.log("\nD · Inertheit im heutigen Production-Zustand (0 synthetische Zeilen)");
  const nurReal = ["m-eins", "m-zwei", "m-drei", "m-vier", "m-fuenf"];
  const ordnungReal = fairness.planTenantOrder({ cronName: "x", tenantIds: nurReal, nowMs: 5000 });
  check("D1 Bei rein realer Mandatsmenge greift keine Klassenordnung",
    ordnungReal.order.length === 5
      && ordnungReal.plan.every((k) => !M.istSynthetischeKennung(k.politicianId)));
  check("D2 Die Prioritätszahlen sind ohne Kohorte unverändert",
    nurReal.every((id) => sd.mandatsPrioritaet(200, id) === 200));
  check("D3 Der Tagesplan meldet eine reine Realklasse",
    (() => {
      const plan = fair.tagesplan({ mandate: nurReal, deckel: 100, tag: "2026-09-10" });
      return plan.klassen.real === 5 && plan.klassen.synthetisch === 0 && plan.klassen.gemischt === false;
    })());
  check("D4 Ohne gesetzte Umgebungsvariable ist die Vorrangreserve 0 (kein Deckelverlust)",
    M.vorrangreserveReal({}).wert === 0);

  // ── E · BEFUNDE DES ADVERSARIALEN DIFF-REVIEWS (02.09.) ────────────────────
  console.log("\nE · Vorrangreserve: ehrlich beschrieben und ohne stille Null");
  {
    // BEFUND 1: `mandatsklasse` zog die Reserve AUCH der geteilten Arbeit ab,
    // waehrend storage.js und die betreibersichtbare Ausgabe das Gegenteil
    // behaupteten. Zwei einander widersprechende Beschreibungen desselben
    // Schutzmechanismus — und die falsche stand an der Entscheidungsstelle.
    const storageQuelle = fs.readFileSync(path.join(ROOT, "lib/helmut/storage.js"), "utf8");
    check("E1 storage.js behauptet NICHT mehr, geteilte Arbeit sei ausgenommen",
      !/Reale Mandate und GETEILTE Arbeit \(Verstehen, Backfills\) sehen unveraendert/.test(storageQuelle));
    check("E2 storage.js benennt die geteilte Arbeit ausdruecklich als betroffen",
      /Die GETEILTE\n\/\/ Arbeit \(Verstehen, Backfills\) IST betroffen/.test(storageQuelle));
    const A = require("../lib/helmut/funktionstest-ablaufplan");
    const w = A.vorbereitung().vorrangreserve;
    check("E3 Die BETREIBERAUSGABE beschreibt es richtig",
      /GETEILTE Arbeit/.test(w.wirkung)
        && /AUSGENOMMEN ist allein die mandatsgebundene Arbeit REALER Mandate/.test(w.wirkung));
    check("E4 Sie warnt ausdruecklich vor einem Wert oberhalb des Deckels",
      typeof w.warnung === "string" && /KLEINER/.test(w.warnung) && /100/.test(w.warnung));

    // BEFUND 2: ohne Untergrenze ergab ein Vorrangwert >= Deckel fuer JEDEN
    // Verstehensaufruf effectiveMax = 0 — der Datenmotor auch der fuenf REALEN
    // Mandate haette stillgestanden, waehrend deren mandatsgebundene Aufrufe
    // weiterliefen. Die Reserve haette den Mandaten die Inhalte abgeschaltet.
    check("E5 Die Untergrenze steht im Code und schuetzt den geteilten/priorisierten Pfad",
      /const untergrenze = vorrang\.abzug > 0 && \(priority \|\| vorrang\.befund\.klasse === "geteilt"\)/
        .test(storageQuelle)
      && /Math\.max\(untergrenze, Math\.max\(0, rohMax - vorrang\.abzug\)\)/.test(storageQuelle));

    // BEFUND 3: startbereitschaft war ASYMMETRISCH — Vorrangreserve aus der
    // Umgebung, Deckel und Verstehens-Reserve nur aus dem Papier.
    const F = require("../lib/helmut/funktionstest-500");
    const huerde = (env) => F.startbereitschaft({ konfiguration: {}, env })
      .huerden.find((h) => h.name.includes("LAUFENDEN"));
    check("E6 Deckel 100 gegen Vorrang 200 wird jetzt erkannt",
      huerde({ HELMUT_MAX_LLM_CALLS_PER_DAY: "100", HELMUT_LLM_RESERVE_UNDERSTANDING: "30",
        HELMUT_TESTLAUF_VORRANG_REAL: "200" }).ok === false);
    check("E7 Die vorbereiteten Werte bestehen die Pruefung",
      huerde({ HELMUT_MAX_LLM_CALLS_PER_DAY: "2416", HELMUT_LLM_RESERVE_UNDERSTANDING: "702",
        HELMUT_TESTLAUF_VORRANG_REAL: "200" }).ok === true);
    check("E8 Ein fehlender Deckel ist NICHT bewertbar und damit nicht erfuellt",
      huerde({ HELMUT_TESTLAUF_VORRANG_REAL: "200" }).ok === false);
  }

  console.log("\nF · Rotation: die Klassentrennung darf niemanden verhungern lassen");
  {
    // BEFUND 4 (nachgemessen): der Versatz ist (tagesNummer * schritt) % laenge.
    // Teilen sich schritt und laenge einen Teiler, werden Positionen NIE
    // erreicht. Beim Aufteilen wandert die Laenge von 500 auf 495, die
    // Schrittweite bleibt — gemessen blieben 5 synthetische Profile ueber 30
    // Tage dauerhaft unbedient, entgegen dem Kommentar im Modul.
    const real = ["r-eins", "r-zwei", "r-drei", "r-vier", "r-fuenf"];
    const synth = Array.from({ length: 495 }, (_, i) => `test-kohorte-a-${String(i + 1).padStart(3, "0")}`);
    const alle = [...real, ...synth];
    const bedient = new Map(alle.map((id) => [id, 0]));
    for (let t = 0; t < 30; t += 1) {
      const plan = fair.tagesplan({ mandate: alle, deckel: 990, tag: `2026-10-${String(t + 1).padStart(2, "0")}` });
      for (const [id, z] of Object.entries(plan.zuteilung || {})) {
        if ((Number(z.notwendig) || 0) > 0) bedient.set(id, bedient.get(id) + 1);
      }
    }
    const nie = [...bedient.entries()].filter(([, n]) => n === 0);
    check("F1 Ueber 30 Tage bei Deckel 990 verhungert KEIN Mandat", nie.length === 0,
      nie.length ? `nie bedient: ${nie.slice(0, 5).map(([id]) => id).join(", ")}` : "0 unbedient");
    check("F2 Die realen Mandate werden an JEDEM Tag bedient",
      real.every((id) => bedient.get(id) === 30));
  }

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((fehler) => {
  console.error(`Unerwarteter Fehler: ${(fehler && fehler.stack) || fehler}`);
  process.exit(1);
});
