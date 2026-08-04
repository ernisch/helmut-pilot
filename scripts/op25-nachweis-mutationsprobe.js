"use strict";

// OP-25 — Mutationsprobe des Nachweisvertrags und der E3-Telemetrie.
// =============================================================================================
// ZWECK: belegen, dass `scripts/op25-nachweis-vertrag-test.js` und
// `scripts/op25-e3-dauerhaftigkeit-test.js` die zentralen Zusicherungen WIRKLICH absichern.
// Jede Probe verletzt GENAU EINE Zusage im Produktions-/Vertragscode und erwartet, dass die
// zugehoerige Suite ROT wird. Bleibt sie gruen, ist die Zusage nicht abgesichert — und genau
// das waere der Befund.
//
// Verfahren (Repo-Konvention, Muster globalphase-buendelung-mutationsprobe): der Code wird in
// ein WEGWERF-Verzeichnis kopiert, dort mutiert und die Suite gegen die Kopie gefahren.
// Das Repository selbst wird NIE veraendert. Kein Netz, keine KI, keine Production-Daten.
//
// Aufruf:  `node scripts/op25-nachweis-mutationsprobe.js`
// Ergebnis: „N von N rot" = die Suiten halten. Jede gruene Probe ist ein Loch.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ZU_KOPIEREN = ["lib", "scripts", "vercel.json", "helmut-flags.json", "package.json"];

function kopiere(quelle, ziel) {
  fs.mkdirSync(ziel, { recursive: true });
  for (const eintrag of fs.readdirSync(quelle, { withFileTypes: true })) {
    if (eintrag.name === "node_modules" || eintrag.name === ".git") continue;
    const q = path.join(quelle, eintrag.name);
    const z = path.join(ziel, eintrag.name);
    if (eintrag.isDirectory()) kopiere(q, z);
    else if (eintrag.isFile()) fs.copyFileSync(q, z);
  }
}

function baueArbeitskopie() {
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-op25-mutation-"));
  for (const name of ZU_KOPIEREN) {
    const q = path.join(ROOT, name);
    if (!fs.existsSync(q)) continue;
    const z = path.join(basis, name);
    if (fs.statSync(q).isDirectory()) kopiere(q, z);
    else { fs.mkdirSync(path.dirname(z), { recursive: true }); fs.copyFileSync(q, z); }
  }
  return basis;
}

// Eine Ersetzung im Quelltext. Wirft, wenn das Muster nicht (oder mehrdeutig) vorkommt —
// eine wirkungslose Mutation waere ein FALSCH GRUENES Ergebnis.
function ersetze(basis, datei, von, nach, { erwarteteTreffer = 1 } = {}) {
  const p = path.join(basis, datei);
  const src = fs.readFileSync(p, "utf8");
  const treffer = src.split(von).length - 1;
  if (treffer !== erwarteteTreffer) {
    throw new Error(`Mutation trifft ${treffer}x statt ${erwarteteTreffer}x in ${datei}: ${von.slice(0, 60)}…`);
  }
  fs.writeFileSync(p, src.split(von).join(nach));
}

function laeuftGruen(basis, suite) {
  try {
    execFileSync(process.execPath, [path.join(basis, "scripts", suite)], {
      stdio: "pipe", timeout: 180000, env: { ...process.env, HELMUT_STORAGE_BACKEND: "local" }
    });
    return true;
  } catch (_) {
    return false;
  }
}

const KERN = path.join("lib", "helmut", "op25-nachweis.js");
const SCHED = path.join("lib", "helmut", "scheduler.js");
const STORE = path.join("lib", "helmut", "storage.js");
const UNDER = path.join("lib", "helmut", "understanding.js");
const VERTRAG_SUITE = "op25-nachweis-vertrag-test.js";
const E3_SUITE = "op25-e3-dauerhaftigkeit-test.js";

const PROBEN = [
  {
    name: "M1 Dauerhaftigkeitsregel: nichtVorgemerkt wird ignoriert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "&& Number(eager.nichtVorgemerkt) === 0;",
      "&& true;")
  },
  {
    name: "M2 24-h-Mindestfenster wird auf 1 h gelockert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "const MIN_FENSTER_MS = 24 * 60 * 60 * 1000;",
      "const MIN_FENSTER_MS = 1 * 60 * 60 * 1000;")
  },
  {
    name: "M3 Harte Untergrenze 2026-08-04 (03.08-Lauf-Schutz) faellt",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      'const FRUEHESTER_FENSTERSTART_MS = Date.parse("2026-08-04T00:00:00Z");',
      'const FRUEHESTER_FENSTERSTART_MS = Date.parse("2026-08-01T00:00:00Z");')
  },
  {
    name: "M4 Vorrang kippt: Belegluecke schlaegt bewiesene Verletzung",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (hat(AUSGANG_NICHT_BESTANDEN)) return ergebnis(AUSGANG_NICHT_BESTANDEN, laufErgebnisse);\n  if (hat(AUSGANG_BLOCKIERT)) return ergebnis(AUSGANG_BLOCKIERT, laufErgebnisse);",
      "  if (hat(AUSGANG_BLOCKIERT)) return ergebnis(AUSGANG_BLOCKIERT, laufErgebnisse);\n  if (hat(AUSGANG_NICHT_BESTANDEN)) return ergebnis(AUSGANG_NICHT_BESTANDEN, laufErgebnisse);")
  },
  {
    name: "M5 Persistenz 'fehlend' gilt ploetzlich als belegt",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      'if (!p || p.ergebnis !== "ok") {',
      "if (false) {")
  },
  {
    name: "M6 Fehlende Mandatslaeufe werden nicht mehr geprueft",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "if (fehlend.length) {",
      "if (false) {")
  },
  {
    name: "M13 Unbekannte Kontexte brauchen keine Erklaerung mehr",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "if ((Number(k.unbekannt) || 0) > 0 && !kontextErklaerung) {",
      "if (false) {")
  },
  {
    name: "M14 Slot-Toleranz waechst auf 6 h — manuelle Laeufe wuerden regulaere ersetzen",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "const SLOT_TOLERANZ_MS = 15 * 60 * 1000;",
      "const SLOT_TOLERANZ_MS = 6 * 60 * 60 * 1000;")
  },
  {
    name: "M7 budgetErschoepft ignoriert uebersprungene Lazy-Stapel",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, SCHED,
      "budgetErschoepft: verbleibendMs() <= 0 || lazyRan < lazyCluster || lazyUebersprungeneStapel > 0,",
      "budgetErschoepft: verbleibendMs() <= 0 || lazyRan < lazyCluster,")
  },
  {
    name: "M8 Persistenzfehler wird wieder stilles Gruen",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, SCHED,
      'if (savedItems.length && !persistenzOk) {\n      fehler.push({ schritt: "persistenz", grund: "persistenz-fehlgeschlagen-oder-unbekannt" });\n    }',
      "")
  },
  {
    name: "M9 Uebersprungene Eager-Stapel verlieren ihre Dokumentzahl",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, SCHED,
      'eagerErgebnisse.push({ skipped: true, reason: "zeitbudget", processed: 0, deferred: 0, dokumente: teil.dokumente.length });',
      'eagerErgebnisse.push({ skipped: true, reason: "zeitbudget", processed: 0, deferred: 0 });')
  },
  {
    name: "M10 Eager-Bilanz verschluckt nichtVorgemerkt wieder",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, SCHED,
      "nichtVorgemerkt: eagerErgebnisse.reduce((s, e) => s + (Number(e && e.nichtVorgemerkt) || 0), 0),",
      "nichtVorgemerkt: 0,")
  },
  {
    name: "M11 compactCrawlRunForStore strippt datenstandDetail wieder",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, STORE,
      "datenstandDetail: compactDatenstandDetail(run.datenstandDetail),",
      "datenstandDetail: null,")
  },
  {
    name: "M12 Zurueckgestellte Cluster werden nicht mehr vorgemerkt",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, UNDER,
      "const vermerk = await deps.savePending(vorgangId, {",
      "const vermerk = null && await deps.savePending(vorgangId, {")
  }
];

let rot = 0;
let gruen = 0;
console.log("OP-25 Mutationsprobe — jede Probe MUSS die Suite rot machen");
console.log("=".repeat(78));
for (const probe of PROBEN) {
  const basis = baueArbeitskopie();
  try {
    probe.mutiere(basis);
    const bestehtNoch = laeuftGruen(basis, probe.suite);
    if (bestehtNoch) {
      gruen += 1;
      console.log(`GRUEN (LOCH!)  ${probe.name}`);
    } else {
      rot += 1;
      console.log(`rot            ${probe.name}`);
    }
  } finally {
    fs.rmSync(basis, { recursive: true, force: true });
  }
}

console.log("=".repeat(78));
console.log(`${rot} von ${PROBEN.length} Proben rot · ${gruen} Loecher`);
process.exit(gruen ? 1 : 0);
