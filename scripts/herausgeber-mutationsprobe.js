"use strict";

// Mutationsprobe zum Hotfix B4-4 — sind die neuen Tests tragend?
// =============================================================================
// Ein gruener Test beweist nichts, solange nicht gezeigt ist, dass er auch ROT
// werden kann. Diese Probe nimmt den Fix einzeln zurueck und prueft, dass die
// Suite `herausgeber-identitaet-test.js` jede Ruecknahme bemerkt.
//
// ARBEITSWEISE — die Arbeitskopie des Repos wird NICHT angefasst:
// Fuer jede Mutation entsteht ein vollstaendiger Abzug von `lib/` und der
// Testdatei in einem temporaeren Verzeichnis; mutiert und ausgefuehrt wird
// ausschliesslich dort. Damit kann ein Abbruch mitten im Lauf keine mutierte
// Datei im Repo hinterlassen.
//
// Aufruf:  node scripts/herausgeber-mutationsprobe.js [--verbose]
// Exit 0 nur, wenn JEDE Mutation die Suite rot macht.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SUITE = "herausgeber-identitaet-test.js";

// Jede Mutation nimmt GENAU EINEN Teil des Fixes zurueck.
const MUTATIONEN = [
  {
    name: "M1 · Titelsuffix nicht mehr abschneiden (der Originaldefekt)",
    beschreibung: "docAnchors liest wieder den ungekuerzten Titel — genau der Zustand, in dem \"tagesspiegel\" zum starken Anker wurde.",
    datei: "lib/helmut/vorgang-identity.js",
    von: "return anchorTokens(`${titelRumpf(doc)} ${(doc && doc.summary) || \"\"}`);",
    nach: "return anchorTokens(`${(doc && doc.title) || \"\"} ${(doc && doc.summary) || \"\"}`);"
  },
  {
    name: "M2 · Mediennamen wieder als spezifisch werten",
    beschreibung: "istGenerisch() kennt die Herausgeberliste nicht mehr — der zweite Riegel faellt weg.",
    datei: "lib/helmut/vorgang-identity.js",
    von: "  if (istHerausgeberAnker(a)) return true;",
    nach: "  if (false && istHerausgeberAnker(a)) return true;"
  },
  {
    name: "M3 · Gattungswoerter des Verlagswesens nicht mehr erkennen",
    beschreibung: "\"Zeitung\", \"Rundschau\", \"Morgenpost\" wirken wieder wie Sachbegriffe.",
    datei: "lib/helmut/herausgeber.js",
    von: "  return HERAUSGEBER_NAMEN.has(a) || HERAUSGEBER_GATTUNG.has(a);",
    nach: "  return HERAUSGEBER_NAMEN.has(a);"
  },
  {
    name: "M4 · Suffixbeleg ueber den Quellennamen abschalten",
    beschreibung: "Der staerkste strukturelle Beleg (Metadaten des Dokuments selbst) faellt weg; nur noch Listen und Domainform wirken.",
    datei: "lib/helmut/herausgeber.js",
    von: "  if (quelle && schluessel === quelle) return \"quellenname\";",
    nach: "  if (false && schluessel === quelle) return \"quellenname\";"
  },
  {
    name: "M5 · Domainform im Suffix nicht mehr als Beleg zaehlen",
    beschreibung: "\"SZ.de\", \"tagesschau.de\", \"Vietnam.vn\" gelten wieder als Sachtext.",
    datei: "lib/helmut/herausgeber.js",
    von: "  if (DOMAINFORM.test(text)) return \"domainform\";",
    nach: "  if (false && DOMAINFORM.test(text)) return \"domainform\";"
  },
  {
    name: "M6 · Wortgrenze des schwaechsten Suffixbelegs aufheben",
    beschreibung: "Ein einzelnes Gattungswort belegt wieder ein beliebig langes Segment — damit wuerde eine echte Schlagzeile hinter einer Dachzeile abgeschnitten.",
    datei: "lib/helmut/herausgeber.js",
    von: "  if (teile.length <= SUFFIX_GATTUNG_MAX_WOERTER && teile.some((w) => HERAUSGEBER_GATTUNG.has(w) || SUFFIX_NAMEN.has(w))) return \"gattung\";",
    nach: "  if (teile.some((w) => HERAUSGEBER_GATTUNG.has(w) || SUFFIX_NAMEN.has(w))) return \"gattung\";"
  },
  {
    name: "M7 · Laengenschranke beider Seiten beim Teilnamen aufheben",
    beschreibung: "Ein zweistelliges Quellenkuerzel belegt wieder jeden Suffix, in dem es zufaellig als Buchstabenfolge steckt.",
    datei: "lib/helmut/herausgeber.js",
    von: "  if (quelle.length >= 4 && schluessel.length >= 4 && (quelle.includes(schluessel) || schluessel.includes(quelle))) return \"quellenname-teil\";",
    nach: "  if (quelle.length >= 1 && schluessel.length >= 1 && (quelle.includes(schluessel) || schluessel.includes(quelle))) return \"quellenname-teil\";"
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
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-mutation-"));
  kopiereVerzeichnis(path.join(ROOT, "lib"), path.join(basis, "lib"));
  fs.mkdirSync(path.join(basis, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "scripts", SUITE), path.join(basis, "scripts", SUITE));
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

  // 0. Referenzlauf: unmutiert MUSS die Suite gruen sein.
  const referenz = baueAbzug();
  const rLauf = fuehreSuiteAus(referenz);
  fs.rmSync(referenz, { recursive: true, force: true });
  console.log(`\nMUTATIONSPROBE B4-4 — Suite: scripts/${SUITE}\n`);
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
    console.error(`\n${ueberlebt} Mutation(en) haben ueberlebt — der Fix ist an dieser Stelle nicht durch Tests abgesichert.`);
    process.exit(1);
  }
  console.log("\nJede einzelne Ruecknahme des Fixes wird von der Suite bemerkt.");
  console.log("Die Arbeitskopie des Repos wurde nicht veraendert (Mutation nur im temporaeren Abzug).");
  process.exit(0);
}

if (require.main === module) main();

module.exports = { MUTATIONEN };
