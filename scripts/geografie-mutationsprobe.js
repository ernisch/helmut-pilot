"use strict";

// Mutationsprobe zu Sprint 20 — sind die Geografie-Tests tragend?
// =============================================================================
// Ein gruener Test beweist nichts, solange nicht gezeigt ist, dass er auch ROT
// werden kann. Diese Probe nimmt jede einzelne Garantie des Sprints zurueck und
// prueft, dass `geografie-gedaechtnis-test.js` die Ruecknahme bemerkt.
//
// ARBEITSWEISE — die Arbeitskopie des Repos wird NICHT angefasst: fuer jede
// Mutation entsteht ein vollstaendiger Abzug in einem temporaeren Verzeichnis;
// mutiert und ausgefuehrt wird ausschliesslich dort. Ein Abbruch mitten im Lauf
// kann damit keine mutierte Datei im Repo hinterlassen.
//
// Aufruf:  node scripts/geografie-mutationsprobe.js [--verbose]
// Exit 0 nur, wenn JEDE Mutation die Suite rot macht.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SUITE = "geografie-gedaechtnis-test.js";
// Die Suite liest diese Dateien als Beleg mit — sie muessen im Abzug liegen.
const MIT_KOPIEREN = ["berlin-beweislauf-auswertung.js"];

const GEO = "lib/helmut/quellenarchitektur/geografie-gedaechtnis.js";
const CLS = "lib/helmut/quellenarchitektur/classification.js";

// Jede Mutation nimmt GENAU EINE Garantie des Sprints zurueck.
const MUTATIONEN = [
  {
    name: "M1 · Quellengeografie darf wieder zur betroffenen Geografie werden",
    beschreibung: "Der strukturelle Ausschluss faellt weg — genau der Fehler, den Regel 4 verbietet: ein Berliner Abrufweg wuerde Berlin als betroffen behaupten.",
    datei: GEO,
    von: "    if (rolle === \"quelle\" || NUR_INDIZ_HERKUENFTE.has(e.herkunft)) {",
    nach: "    if (false) {"
  },
  {
    name: "M2 · Fail Closed abschalten: ein leeres Ergebnis loescht den Bestand",
    beschreibung: "Eine Aktualisierung ohne geografisches Signal wuerde eine bereits belastbar gespeicherte Region ueberschreiben (stiller Datenverlust, Regel 8).",
    datei: GEO,
    von: "  if (!k.betroffen.length) {\n    return fertig(b.betroffen, {",
    nach: "  if (!k.betroffen.length) {\n    return fertig(k.betroffen, {"
  },
  {
    name: "M3 · Eine blosse Erwaehnung gilt wieder als Betroffenheit",
    beschreibung: "Die Nennung des Ortes \"Berlin\" wuerde wieder Berliner Betroffenheit speichern (Regel 5).",
    datei: CLS,
    von: "    kandidaten.push({ ...g, herkunft: \"erwaehnung\", rolle: \"erwaehnt\" });",
    nach: "    kandidaten.push({ ...g, herkunft: \"erwaehnung\", rolle: \"betroffen\" });"
  },
  {
    name: "M4 · Bundesinstitutionen erzeugen wieder eine Geografie",
    beschreibung: "\"Bundestag\" wuerde wieder Deutschland als betroffene Geografie stiften — die verbotene Ableitung Ebene -> Geografie durch die Hintertuer (Regel 1/3).",
    datei: CLS,
    von: "  if (!geo || geo.level === \"bund\") return null;",
    nach: "  if (!geo) return null;"
  },
  {
    name: "M4b · Zweite Schranke aufheben: Bezeichnung muss die Region nicht mehr nennen",
    beschreibung: "Ein regionloses \"Senatskanzlei\" wuerde wieder Berlin stiften — eine Hamburger Meldung landete in Berlin (erfundene Zuordnung, Regel 3).",
    datei: CLS,
    von: "  return !!(b && g && b.includes(g));",
    nach: "  return !!(b && g);"
  },
  {
    name: "M4c · Landesinstitution im Fliesstext nicht mehr auswerten",
    beschreibung: "Der haeufigste reale Fall faellt weg: \"Abgeordnetenhaus von Berlin beschliesst …\" in der Schlagzeile bliebe geografisch unbelegt (verbindlicher Testfall 1).",
    datei: CLS,
    von: "  for (const g of geografienAusText(ko)) {",
    nach: "  for (const g of []) {"
  },
  {
    name: "M4d · Feldgrenze aufheben: Belege duerfen wieder ueber Felder hinweg entstehen",
    beschreibung: "Ein Ausschusseintrag \"Landtag\" neben einer getrennten Ortsnennung \"Brandenburg\" ergaebe die Phrase \"landtag brandenburg\" - dieselbe zufaellige Nachbarschaft, die B4-3/B4-4 verursacht hat.",
    datei: CLS,
    von: "  for (const feld of GEO_TEXTFELDER) {\n    const text = normText(ko[feld]);",
    nach: "  for (const feld of [\"__alles\"]) {\n    const text = koHaystack(ko);"
  },
  {
    name: "M5 · Gleich starke Nachweise verdraengen statt zu ergaenzen",
    beschreibung: "Eine zweite, gleich gut belegte Region wuerde die erste loeschen, statt neben ihr zu stehen (Regel 6).",
    datei: GEO,
    von: "  if (staerkeNeu > staerkeBestand) {",
    nach: "  if (staerkeNeu >= staerkeBestand) {"
  },
  {
    name: "M6 · Mehrfachzuordnung technisch auf eine Region kappen",
    beschreibung: "Ein Vorgang, der Berlin UND Brandenburg betrifft, wuerde auf eine Region reduziert (Regel 6).",
    datei: GEO,
    von: "    betroffen: betroffen.slice(0, MAX_BETROFFEN),",
    nach: "    betroffen: betroffen.slice(0, 1),"
  },
  {
    name: "M7 · KI-gelieferte geography_id ungeprueft uebernehmen",
    beschreibung: "Eine vom Modell erfundene Kennung wuerde als kanonische Referenz gespeichert (Regel 7, Belegpflicht).",
    datei: CLS,
    von: "  for (const g of resolveGeographies(namenAus(ai.affected_geographies))) {",
    nach: "  for (const g of (Array.isArray(ai.affected_geographies) ? ai.affected_geographies : [])) {"
  },
  {
    name: "M8 · Geografie-Konfidenz misst wieder die Erwaehnungen",
    beschreibung: "Drei genannte Staedte ohne jeden Betroffenheitsbeleg wuerden wieder als \"medium\" gemeldet — falsches Gruen.",
    datei: CLS,
    von: "    geography: geografieKonfidenz(geo),",
    nach: "    geography: geo.erwaehnt.length ? \"medium\" : \"low\","
  }
];

function kopiereVerzeichnis(quelle, ziel) {
  fs.mkdirSync(ziel, { recursive: true });
  for (const eintrag of fs.readdirSync(quelle, { withFileTypes: true })) {
    const q = path.join(quelle, eintrag.name);
    const z = path.join(ziel, eintrag.name);
    if (eintrag.isDirectory()) kopiereVerzeichnis(q, z);
    else if (eintrag.isFile()) fs.copyFileSync(q, z);
  }
}

function baueAbzug() {
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-geo-mutation-"));
  kopiereVerzeichnis(path.join(ROOT, "lib"), path.join(basis, "lib"));
  kopiereVerzeichnis(path.join(ROOT, "supabase", "migrations"), path.join(basis, "supabase", "migrations"));
  fs.mkdirSync(path.join(basis, "scripts"), { recursive: true });
  for (const datei of [SUITE, ...MIT_KOPIEREN]) {
    fs.copyFileSync(path.join(ROOT, "scripts", datei), path.join(basis, "scripts", datei));
  }
  return basis;
}

function fuehreSuiteAus(basis) {
  const ergebnis = spawnSync(process.execPath, [path.join(basis, "scripts", SUITE)], {
    cwd: basis, encoding: "utf8", timeout: 120000,
    // Ohne Zugangsdaten und ohne Netz: die Suite ist reine Logik.
    env: { ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", HELMUT_V3_STORE: "" }
  });
  const text = `${ergebnis.stdout || ""}${ergebnis.stderr || ""}`;
  const rot = (text.match(/^FAIL /gm) || []).length;
  return { status: ergebnis.status, rot, text };
}

function main() {
  const verbose = process.argv.includes("--verbose");

  const referenz = baueAbzug();
  const rLauf = fuehreSuiteAus(referenz);
  fs.rmSync(referenz, { recursive: true, force: true });
  console.log(`\nMUTATIONSPROBE SPRINT 20 (Geografie) — Suite: scripts/${SUITE}\n`);
  console.log(`Referenzlauf (unmutiert): ${rLauf.status === 0 ? "GRUEN" : "ROT"} (${rLauf.rot} FAIL)`);
  if (rLauf.status !== 0) {
    console.error("\nAbbruch: die Suite ist schon unmutiert rot — die Probe waere ohne Aussage.");
    if (verbose) console.error(rLauf.text);
    process.exit(1);
  }

  let ueberlebt = 0;
  const zeilen = [];
  for (const m of MUTATIONEN) {
    const basis = baueAbzug();
    const ziel = path.join(basis, m.datei);
    const inhalt = fs.readFileSync(ziel, "utf8");
    if (!inhalt.includes(m.von)) {
      console.error(`\n${m.name}: Ankertext nicht gefunden in ${m.datei} — die Probe ist veraltet.`);
      console.error(`  gesucht: ${m.von}`);
      fs.rmSync(basis, { recursive: true, force: true });
      process.exit(2);
    }
    if (inhalt.split(m.von).length - 1 !== 1) {
      console.error(`\n${m.name}: Ankertext ist nicht eindeutig in ${m.datei}.`);
      fs.rmSync(basis, { recursive: true, force: true });
      process.exit(2);
    }
    fs.writeFileSync(ziel, inhalt.replace(m.von, m.nach));
    const lauf = fuehreSuiteAus(basis);
    fs.rmSync(basis, { recursive: true, force: true });
    const erkannt = lauf.status !== 0;
    if (!erkannt) ueberlebt += 1;
    zeilen.push({ name: m.name, erkannt, rot: lauf.rot, beschreibung: m.beschreibung });
    console.log(`${erkannt ? "ROT  " : "GRUEN"}  ${m.name}  — ${lauf.rot} Assertion(en) rot`);
    if (verbose && !erkannt) console.log(lauf.text);
  }

  console.log(`\n${MUTATIONEN.length - ueberlebt} von ${MUTATIONEN.length} Mutationen werden erkannt.`);
  for (const z of zeilen) console.log(`  ${z.erkannt ? "✓" : "✗"} ${z.name}\n      ${z.beschreibung}`);
  if (ueberlebt) {
    console.error(`\n${ueberlebt} Mutation(en) haben ueberlebt — die Garantie ist an dieser Stelle nicht durch Tests abgesichert.`);
    process.exit(1);
  }
  console.log("\nJede einzelne Ruecknahme wird von der Suite bemerkt.");
  console.log("Die Arbeitskopie des Repos wurde nicht veraendert (Mutation nur im temporaeren Abzug).");
  process.exit(0);
}

main();
