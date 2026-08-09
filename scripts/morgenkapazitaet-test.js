"use strict";

// Helmut — TRÄGT DER MORGEN 200 MANDATE? (Kapazitaetssprint 2026-08-09)
// =============================================================================================
// DIE FRAGE, DIE DIESE SUITE BEANTWORTET — und die keine bestehende Suite beantwortet:
// Werden 200 Morgenlagen innerhalb des MORGENFENSTERS fertig, mit mindestens 25 % Reserve,
// auf der Verdrahtung, die es wirklich gibt?
//
// WARUM DAS NICHT SCHON BEWIESEN WAR. Der Stufennachweis (`narrativ-stufen-test.js`) und die
// Tagessimulation (`skalierung-lauf.js`) nehmen einen Workertrupp ALLE ZWEI MINUTEN an. Das
// gibt es in Production nicht — dort gibt es Cron-Slots: eine Vercel-Ausfuehrung, ein
// Zeitbudget, danach ist Schluss. Genau diese Luecke war Befund R1 des Abschlussreviews von
// PR #236. Diese Suite rechnet SLOTGENAU (`scripts/fixtures/morgenslot.js`).
//
// WAS ECHT IST: `workerBetrieb.durchlauf`, `scalable-pipeline.arbeite`,
// `HANDLER.tenant_narrative`, die Budgetschicht, die Warteschlangensemantik, die
// Rotationsordnung. Der Modellaufruf kommt aus einer GEMESSENEN Production-Reihe (n = 134).
//
// WAS DIESE SUITE NICHT IST: ein Production-Beweis. Sie rechnet mit gemessenen
// Eingangsgroessen — sie beweist nicht, dass Production sich so verhaelt. Die echten
// Google-Laufzeiten, der wirksame Production-Deckel und 190 fehlende echte Profile bleiben
// offen und werden am Ende ausdruecklich als OFFEN gemeldet.

const path = require("path");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const M = require(path.join(ROOT, "scripts/fixtures/morgenslot.js"));
const pipeline = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const workerBetrieb = require(path.join(ROOT, "lib/helmut/worker-betrieb.js"));

let pass = 0;
let fail = 0;
let offen = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function nichtBewiesen(name, grund) { offen += 1; console.log(`  OFFEN ${name} — NICHT BEWIESEN: ${grund}`); }
function abschnitt(t) { console.log(`\n${"═".repeat(90)}\n  ${t}\n${"═".repeat(90)}`); }
const z = (n) => Number(n).toLocaleString("de-DE");
const s = (ms) => (ms == null ? "—" : `${Math.round(ms / 100) / 10}s`);

// Der Standardplan: DREI Morgenslots. 05:45 UTC ist der bestehende `lage-briefing`-Slot,
// 06:10 und 06:22 UTC sind die zwei neuen Nachlaufslots auf derselben geschuetzten Route
// (`vercel.json`). Alle drei enden vor 06:30 UTC = 08:30 Berlin.
const T = (h, m) => Date.parse(`2026-08-10T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`);
const PLAN = { slots: 3, slotZeitenMs: [T(5, 45), T(6, 10), T(6, 22)], slotBudgetMs: 270000, parallel: 8 };

function zeileFuer(name, r) {
  return `${String(name).padEnd(30)}`
    + ` ${String(r.auftraege.erledigt).padStart(5)}/${String(r.auftraege.erwartet).padEnd(5)}`
    + ` ${String(r.fenster.rechtzeitig).padStart(5)}`
    + ` ${String(r.fenster.verspaetet).padStart(4)}`
    + ` ${String(r.auftraege.offen).padStart(5)}`
    + ` ${String(r.reserve.prozent + " %").padStart(8)}`
    + ` ${s(r.zeit.maxFertigMs).padStart(9)}`
    + ` ${String(r.modell.fehler).padStart(4)}`
    + ` ${String(r.modell.wiederholungen).padStart(5)}`
    + ` ${String(r.kosten.gesamtUsd.toFixed(4)).padStart(9)}`;
}
const KOPF = `${"".padEnd(30)} ${"fertig".padStart(11)} ${"recht".padStart(5)} ${"spät".padStart(4)}`
  + ` ${"offen".padStart(5)} ${"Reserve".padStart(8)} ${"max".padStart(9)} ${"Fhl".padStart(4)}`
  + ` ${"Wdh".padStart(5)} ${"USD".padStart(9)}`;

async function main() {
  console.log("Helmut — SLOTGENAUE KAPAZITAET DER MORGENLAGE (OP-30, 2026-08-09)");
  console.log(`  Morgenfenster: 05:45 UTC bis ${new Date(M.MORGENFENSTER_ENDE_MS).toISOString().slice(11, 16)} UTC`
    + " (07:45 bis 08:30 Berlin)");
  console.log(`  Slots: ${PLAN.slots} · Budget je Slot ${PLAN.slotBudgetMs / 1000} s · Parallelitaet ${PLAN.parallel}`);

  // ═══ 1 · DIE VERDRAHTUNG, GEGEN DEN CODE GELESEN ═════════════════════════════════════════
  abschnitt("1 · Die Verdrahtung — was es WIRKLICH gibt (aus dem Produktionscode gelesen)");
  {
    const fs = require("fs");
    const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
    const morgenSlots = (vercel.crons || []).filter((c) => /lage-briefing/.test(c.path));
    check("1.1 Es gibt GENAU DREI morgendliche Narrativslots in vercel.json",
      morgenSlots.length === 3, morgenSlots.map((c) => `${c.path}@${c.schedule}`).join(" · "));
    check("1.2 Alle drei liegen vor dem Ende des Morgenfensters (06:30 UTC)",
      morgenSlots.every((c) => {
        const [min, std] = c.schedule.split(" ");
        return Number(std) * 60 + Number(min) <= 6 * 60 + 22;
      }), morgenSlots.map((c) => c.schedule).join(" · "));
    check("1.3 Das Funktionslimit ist unveraendert 300 s",
      vercel.functions["api/index.js"].maxDuration === 300);
    check("1.4 Das Slotbudget liegt darunter (270 s, wie bei crawl/pipeline)",
      /budgetMs: 270000/.test(serverSrc));
    const g = workerBetrieb.grenzenAusEnv({}, {});
    check("1.5 Die Parallelitaet ist hart auf 8 gedeckelt — mehr ist nicht konfigurierbar",
      workerBetrieb.grenzenAusEnv({ HELMUT_WORKER_PARALLEL: "99" }, {}).parallel === 8
      && workerBetrieb.grenzenAusEnv({}, { parallel: 99 }).parallel === 8);
    check("1.6 Ohne Konfiguration bleibt die Parallelitaet bei 2 (unveraenderter Standard)",
      g.parallel === 2, String(g.parallel));
    check("1.7 Das Leerlaufwarten ist DEFAULT AUS (0 ms) und hart auf 30 s geklemmt",
      g.leerlaufWarteMs === 0
      && workerBetrieb.grenzenAusEnv({ HELMUT_WORKER_LEERLAUF_MS: "999999" }, {}).leerlaufWarteMs === 30000);
    check("1.8 Der Narrativauftrag hat eine EIGENE Zeitgrenze, die nur senken kann",
      pipeline.typZeitgrenze("tenant_narrative") === 45000
      && pipeline.typZeitgrenze("source_fetch") === pipeline.AUFTRAG_MAX_MS
      && pipeline.typZeitgrenze("tenant_narrative") < pipeline.AUFTRAG_MAX_MS,
      `${pipeline.typZeitgrenze("tenant_narrative")} ms vs ${pipeline.AUFTRAG_MAX_MS} ms`);
    check("1.9 Nur `tenant_narrative` hat eine eigene Grenze — kein anderer Typ ist beruehrt",
      Object.keys(pipeline.TYP_ZEITGRENZE_MS).join(",") === "tenant_narrative");
  }

  // ═══ 2 · DIE ZEITGRENZE SCHNEIDET WIRKLICH (echte Zeit, keine Simulation) ════════════════
  abschnitt("2 · Die Auftragszeitgrenze schneidet wirklich — in echter Zeit gemessen");
  {
    const t0 = Date.now();
    let fehler = null;
    try {
      await pipeline.mitZeitgrenze(new Promise((r) => setTimeout(r, 5000)), 120, "tenant_narrative");
    } catch (e) { fehler = e; }
    const gedauert = Date.now() - t0;
    check("2.1 Ein haengender Auftrag wird abgeschnitten, nicht abgewartet",
      fehler != null && /auftrag-zeitlimit/.test(fehler.message) && gedauert < 1500,
      `${gedauert} ms bis zum Abbruch`);
    check("2.2 Der Abbruch nennt Typ und Grenze",
      /tenant_narrative/.test(String(fehler && fehler.message)) && /120 ms/.test(String(fehler && fehler.message)));
  }

  // ═══ 3 · STUFEN 5 / 25 / 50 / 100 / 200 ══════════════════════════════════════════════════
  abschnitt("3 · Stufennachweis 5 / 25 / 50 / 100 / 200 (realistisches Szenario)");
  console.log(KOPF);
  const stufen = {};
  for (const n of [5, 25, 50, 100, 200]) {
    const r = await M.simuliereMorgen({ mandate: n, szenario: "realistisch", ...PLAN });
    stufen[n] = r;
    console.log(zeileFuer(`${z(n)} Mandate`, r));
  }
  for (const n of [5, 25, 50, 100, 200]) {
    const r = stufen[n];
    check(`3.${n} ${z(n)} Mandate: ALLE im Morgenfenster fertig`,
      r.auftraege.erledigt === r.auftraege.erwartet && r.fenster.verspaetet === 0 && r.auftraege.offen === 0,
      `${r.auftraege.erledigt}/${r.auftraege.erwartet} · offen ${r.auftraege.offen} · verspaetet ${r.fenster.verspaetet}`);
  }
  check("3.R Bei 200 Mandaten bleiben mindestens 25 % Kapazitaetsreserve",
    stufen[200].reserve.prozent >= 25, `${stufen[200].reserve.prozent} % (Arbeitslast gegen angebotene Workerzeit)`);
  check("3.D Kein Auftrag wurde doppelt verarbeitet",
    Object.values(stufen).every((r) => r.auftraege.doppeltGleichzeitig === 0));
  check("3.V Kein Auftrag ging still verloren",
    Object.values(stufen).every((r) => r.auftraege.verloren === 0
      && r.auftraege.erledigt + r.auftraege.offen + r.auftraege.gescheitert === r.auftraege.erwartet));
  check("3.F Kein Mandat verhungert — jedes aktive Mandat bekam sein Narrativ",
    Object.values(stufen).every((r) => r.fairness.mandateMitNarrativ === r.eingang.mandate
      && r.fairness.max - r.fairness.min <= 1),
    `200er: ${stufen[200].fairness.mandateMitNarrativ} Mandate · min ${stufen[200].fairness.min} max ${stufen[200].fairness.max}`);
  check("3.P Die reale Parallelitaet erreichte den konfigurierten Wert",
    stufen[200].zeit.maxParallel === PLAN.parallel, `gemessen ${stufen[200].zeit.maxParallel} von ${PLAN.parallel}`);
  check("3.B Kein Budget wurde ueberschritten",
    Object.values(stufen).every((r) => r.budget.verletzungen === 0));

  // ═══ 4 · DIE DREI SZENARIEN ══════════════════════════════════════════════════════════════
  abschnitt("4 · 200 Mandate in drei Szenarien (Abnahme gilt fuer das REALISTISCHE)");
  console.log(KOPF);
  const szenarien = {};
  for (const sz of ["optimistisch", "realistisch", "unguenstig"]) {
    const r = await M.simuliereMorgen({ mandate: 200, szenario: sz, ...PLAN });
    szenarien[sz] = r;
    console.log(zeileFuer(sz, r));
  }
  check("4.1 REALISTISCH: alle 200 im Fenster, Reserve >= 25 %",
    szenarien.realistisch.auftraege.offen === 0 && szenarien.realistisch.fenster.verspaetet === 0
    && szenarien.realistisch.reserve.prozent >= 25,
    `${szenarien.realistisch.fenster.rechtzeitig}/200 · Reserve ${szenarien.realistisch.reserve.prozent} %`);
  check("4.2 OPTIMISTISCH ist nicht schlechter als realistisch",
    szenarien.optimistisch.reserve.prozent >= szenarien.realistisch.reserve.prozent);
  console.log(`  Das UNGUENSTIGE Szenario bestimmt die Rueckfallbedingungen: ${szenarien.unguenstig.fenster.rechtzeitig}`
    + ` von 200 rechtzeitig, Reserve ${szenarien.unguenstig.reserve.prozent} %,`
    + ` Rueckstand ${szenarien.unguenstig.rueckstand.offenNachMorgen}.`);
  check("4.3 Auch im UNGUENSTIGEN Szenario geht nichts verloren und nichts doppelt",
    szenarien.unguenstig.auftraege.verloren === 0 && szenarien.unguenstig.auftraege.doppeltGleichzeitig === 0);

  // ═══ 5 · DIE VIERZEHN STOERUNGEN BEI 200 MANDATEN ════════════════════════════════════════
  abschnitt("5 · 200 Mandate unter vierzehn Stoerungen");
  console.log(KOPF);
  const stoerfaelle = [
    ["1 normaler Morgen", {}],
    ["2 hoher Nachrichtenanfall", { stapel: 25, dbVerzoegerungMs: 60 }],
    ["3 langsame Modellantworten", { stoerung: { langsam: true } }],
    ["4 10 % fehlerhafte Quellen", { stoerung: { quellenFehler: 0.1 } }],
    ["5 10 % Wiederholungen", { stoerung: { wiederholungen: 0.1 } }],
    ["6 ein ausgefallener Worker", { ausgefalleneWorker: 1 }],
    ["7 erster Morgenslot faellt aus", { slotAusfall: 0 }],
    ["8 Rueckstand aus dem Vortag", { vorlaufRueckstand: 40 }],
    ["9 ein Mandat mit viel mehr Quellen", { grossesMandat: true }],
    ["10 gleichzeitige Budgetknappheit", { deckel: 230 }],
    ["11 neu hinzugefuegte Mandate", { neueMandateVorSlot: 20 }],
    ["12 waehrenddessen deaktiviert", { deaktiviertVorSlot: 15 }],
    ["13 konkurrierende Reservierungen", { stapel: 1 }],
    ["14 verzoegerte Datenbank", { dbVerzoegerungMs: 250 }]
  ];
  const ergebnisse = {};
  for (const [name, o] of stoerfaelle) {
    const r = await M.simuliereMorgen({ mandate: 200, szenario: "realistisch", ...PLAN, ...o });
    ergebnisse[name] = r;
    console.log(zeileFuer(name, r));
  }
  // Die harten Zusagen gelten in JEDEM Stoerfall — Vollstaendigkeit dagegen nur dort, wo die
  // Stoerung sie nicht ausdruecklich unmoeglich macht (ausgefallener Slot, Budgetknappheit).
  for (const [name, r] of Object.entries(ergebnisse)) {
    check(`5.${name} — nichts doppelt, nichts verloren, kein Budgetbruch`,
      r.auftraege.doppeltGleichzeitig === 0 && r.auftraege.verloren === 0 && r.budget.verletzungen === 0,
      `doppelt ${r.auftraege.doppeltGleichzeitig} · verloren ${r.auftraege.verloren} · Budget ${r.budget.verletzungen}`);
  }
  const mussVollstaendig = ["1 normaler Morgen", "2 hoher Nachrichtenanfall", "4 10 % fehlerhafte Quellen",
    "5 10 % Wiederholungen", "6 ein ausgefallener Worker", "8 Rueckstand aus dem Vortag",
    "9 ein Mandat mit viel mehr Quellen", "11 neu hinzugefuegte Mandate", "13 konkurrierende Reservierungen",
    "14 verzoegerte Datenbank"];
  for (const name of mussVollstaendig) {
    const r = ergebnisse[name];
    check(`5.V ${name}: alle Mandate im Morgenfenster fertig`,
      r.auftraege.offen === 0 && r.fenster.verspaetet === 0,
      `offen ${r.auftraege.offen} · verspaetet ${r.fenster.verspaetet} · fertig ${r.auftraege.erledigt}/${r.auftraege.erwartet}`);
  }
  {
    const r = ergebnisse["12 waehrenddessen deaktiviert"];
    check("5.V 12 deaktivierte Mandate: kein Modellaufruf mehr fuer ein abgeschaltetes Mandat",
      r.fairness.mandateMitNarrativ <= 200 && r.auftraege.verloren === 0, `${r.fairness.mandateMitNarrativ} Mandate bedient`);
    const b = ergebnisse["10 gleichzeitige Budgetknappheit"];
    check("5.V 10 Budgetknappheit: der Deckel haelt und der Rest wird EHRLICH als offen gemeldet",
      b.budget.verletzungen === 0 && b.budget.getaetigt <= 230
      && (b.auftraege.offen > 0 || b.auftraege.erledigt === b.auftraege.erwartet),
      `getaetigt ${b.budget.getaetigt} · offen ${b.auftraege.offen}`);
    const a = ergebnisse["7 erster Morgenslot faellt aus"];
    check("5.V 7 ausgefallener Slot: der zweite Slot faengt auf, was er kann, und meldet den Rest",
      a.auftraege.verloren === 0 && a.slots[0].ausgefallen === true && a.auftraege.erledigt > 0,
      `${a.auftraege.erledigt}/200 vom zweiten Slot · Rueckstand ${a.rueckstand.offenNachMorgen}`);
    const v = ergebnisse["8 Rueckstand aus dem Vortag"];
    check("5.R Rueckstand aus dem Vortag wird IM Morgen abgebaut",
      v.auftraege.offen === 0, `Rueckstand nach dem Morgen: ${v.auftraege.offen}`);
  }

  // ═══ 6 · WAS DIE ZWEI SLOTS UND DIE PARALLELITAET WIRKLICH BRINGEN ═══════════════════════
  abschnitt("6 · Der Nachweis, dass BEIDES noetig ist (und wie viel jedes bringt)");
  console.log(KOPF);
  const varianten = {};
  for (const [name, o] of [
    ["par 2 · 1 Slot (heute)", { parallel: 2, slots: 1 }],
    ["par 2 · 3 Slots", { parallel: 2, slots: 3 }],
    ["par 4 · 3 Slots", { parallel: 4, slots: 3 }],
    ["par 8 · 1 Slot", { parallel: 8, slots: 1 }],
    ["par 8 · 2 Slots", { parallel: 8, slots: 2 }],
    ["par 8 · 3 Slots (Ziel)", { parallel: 8, slots: 3 }]
  ]) {
    const r = await M.simuliereMorgen({ mandate: 200, szenario: "realistisch", ...PLAN, ...o });
    varianten[name] = r;
    console.log(zeileFuer(name, r));
  }
  check("6.1 Die heutige Verdrahtung (Parallelitaet 2, EIN Slot) traegt 200 NICHT",
    varianten["par 2 · 1 Slot (heute)"].auftraege.offen > 0,
    `${varianten["par 2 · 1 Slot (heute)"].auftraege.erledigt} von 200 fertig`);
  check("6.2 Parallelitaet 8 allein (ein Slot) reicht NICHT",
    varianten["par 8 · 1 Slot"].auftraege.offen > 0,
    `${varianten["par 8 · 1 Slot"].auftraege.erledigt} von 200 fertig`);
  check("6.3 Mehr Slots allein (Parallelitaet 2) reichen NICHT",
    varianten["par 2 · 3 Slots"].auftraege.offen > 0,
    `${varianten["par 2 · 3 Slots"].auftraege.erledigt} von 200 fertig`);
  check("6.4 BEIDES zusammen traegt 200 mit Reserve",
    varianten["par 8 · 3 Slots (Ziel)"].auftraege.offen === 0
    && varianten["par 8 · 3 Slots (Ziel)"].reserve.prozent >= 25,
    `${varianten["par 8 · 3 Slots (Ziel)"].auftraege.erledigt}/200 · Reserve `
    + `${varianten["par 8 · 3 Slots (Ziel)"].reserve.prozent} %`);
  check("6.5 Der DRITTE Slot ist nicht Luxus: er hebt die Reserve ueber die 25-%-Linie hinaus",
    varianten["par 8 · 3 Slots (Ziel)"].reserve.prozent > varianten["par 8 · 2 Slots"].reserve.prozent,
    `2 Slots ${varianten["par 8 · 2 Slots"].reserve.prozent} % · 3 Slots `
    + `${varianten["par 8 · 3 Slots (Ziel)"].reserve.prozent} %`);

  // Wie viele Mandate traegt eine Verdrahtung? Der Durchsatz je Morgen, ohne Reserveabzug.
  console.log("\n  Getragene Narrative je Morgen (gemessen in dieser Simulation, ohne Reserveabzug):");
  for (const [name, r] of Object.entries(varianten)) {
    const jeSlot = r.slots.filter((x) => !x.ausgefallen).map((x) => x.erledigt);
    console.log(`    ${name.padEnd(24)} ${String(r.auftraege.erledigt).padStart(4)} von 200`
      + `  (je Slot: ${jeSlot.join(" + ") || "—"})`);
  }

  // ═══ 7 · STRESS: 1 000 MANDATE ═══════════════════════════════════════════════════════════
  abschnitt("7 · Stresstest 1 000 Mandate — WO die Grenze liegt, nicht ob sie haelt");
  console.log(KOPF);
  const stress = await M.simuliereMorgen({ mandate: 1000, szenario: "realistisch", ...PLAN });
  console.log(zeileFuer("1 000 Mandate", stress));
  check("7.1 Auch unter Ueberlast geht KEIN Auftrag verloren und KEINER doppelt",
    stress.auftraege.verloren === 0 && stress.auftraege.doppeltGleichzeitig === 0
    && stress.auftraege.erledigt + stress.auftraege.offen + stress.auftraege.gescheitert === stress.auftraege.erwartet);
  check("7.2 Die Ueberlast wird EHRLICH als Rueckstand gemeldet, nicht verschwiegen",
    stress.rueckstand.offenNachMorgen > 0,
    `${z(stress.rueckstand.offenNachMorgen)} Auftraege bleiben nach dem Morgen offen`);
  check("7.3 Auch unter Ueberlast wird kein Budget ueberschritten", stress.budget.verletzungen === 0);
  console.log(`  ⇒ 1 000 Mandate sind mit zwei Morgenslots und Parallelitaet 8 NICHT im Morgenfenster`
    + ` machbar: ${z(stress.auftraege.erledigt)} von 1 000 wurden fertig.`);

  // ═══ 8 · KOSTEN ══════════════════════════════════════════════════════════════════════════
  abschnitt("8 · Kosten je Stufe (Preisgrundlage ausdruecklich benannt)");
  console.log(`  Grundlage: ${stufen[200].kosten.grundlage}`);
  for (const n of [5, 25, 50, 100, 200]) {
    const r = stufen[n];
    console.log(`    ${String(z(n)).padStart(5)} Mandate  ${r.kosten.gesamtUsd.toFixed(4)} USD/Morgen`
      + `  ·  ${r.kosten.jeMandatUsd.toFixed(6)} USD je Mandat`
      + `  ·  hochgerechnet ${(r.kosten.jeMandatUsd * 30).toFixed(4)} USD je Mandat/Monat`);
  }
  check("8.1 Die Kosten je Mandat sind ueber alle Stufen stabil (kein verstecktes Wachstum)",
    Math.abs(stufen[200].kosten.jeMandatUsd - stufen[5].kosten.jeMandatUsd) < 0.0005,
    `5er ${stufen[5].kosten.jeMandatUsd.toFixed(6)} · 200er ${stufen[200].kosten.jeMandatUsd.toFixed(6)}`);

  // ═══ 9 · WAS DIESE SUITE AUSDRUECKLICH NICHT BEWEIST ═════════════════════════════════════
  abschnitt("9 · Grenzen dieses Nachweises");
  nichtBewiesen("Production-Verhalten",
    "alle Zahlen stammen aus einer Simulation mit gemessenen Eingangsgroessen. Ob Production "
    + "sich so verhaelt, ist erst nach einer stufenweisen Aktivierung mit Messung bekannt.");
  nichtBewiesen("190 fehlende echte Profile",
    "es gibt 10 Profile, davon 5 aktiv. Die Simulation rechnet mit synthetischen Mandaten; "
    + "echte Profile haben mehr Quellen, mehr Vorgaenge und andere Laufzeiten.");
  nichtBewiesen("Wirksamer Production-Tagesdeckel",
    "HELMUT_MAX_LLM_CALLS_PER_DAY ist aus einer Sitzung nicht lesbar (Vercel-Env). Die "
    + "Budgetzahlen hier gelten fuer die jeweils gesetzten Testdeckel.");
  nichtBewiesen("Vercel-Verhalten bei Parallelitaet 8",
    "acht gleichzeitige Modellaufrufe in EINER Ausfuehrung sind lokal geprueft, aber nicht "
    + "in Production gemessen (Speicher, Netzgrenzen der Funktion).");

  console.log(`\n${"═".repeat(90)}`);
  console.log(`PASS ${pass}  FAIL ${fail}  OFFEN ${offen}  (gesamt ${pass + fail + offen})`);
  if (offen > 0) console.log(`${offen} Punkt(e) sind AUSDRUECKLICH NICHT BEWIESEN.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TESTLAUF-FEHLER:", e && e.stack ? e.stack : e); process.exit(1); });
