"use strict";

// Mutationsprobe zu Punkt 26A — traegt der Berliner Ende-zu-Ende-Vertrag wirklich?
// =============================================================================
// Ein gruener Test beweist nichts, solange nicht gezeigt ist, dass er auch ROT
// werden kann. Diese Probe nimmt die zentralen Garantien des 26A-Vertrags einzeln
// zurueck und prueft, dass `berlin-e2e-vertrag-test.js` jede Ruecknahme bemerkt.
//
// ARBEITSWEISE (Konvention wie geografie-mutationsprobe.js): die Arbeitskopie des
// Repos wird NICHT angefasst — fuer jede Mutation entsteht ein vollstaendiger Abzug
// in einem temporaeren Verzeichnis; mutiert und ausgefuehrt wird ausschliesslich dort.
//
// Aufruf:  node scripts/berlin-e2e-mutationsprobe.js [--verbose]
// Exit 0 nur, wenn JEDE Mutation die Suite rot macht.
//
// BEWUSST NICHT im Offline-Runner: die Probe fuehrt die Suite (10+1)x aus — sie ist
// ein gezielter Beweislauf je Sprint, kein Dauertest. (Der Runner sammelt nur
// *-test.js ein; diese Datei endet absichtlich auf -mutationsprobe.js.)

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SUITE = "berlin-e2e-vertrag-test.js";

const KLASSEN = "lib/helmut/quellenarchitektur/pardok-dokumentklassen.js";
const CLS = "lib/helmut/quellenarchitektur/classification.js";
const MATCHING = "lib/helmut/matching.js";
const UNDERSTANDING = "lib/helmut/understanding.js";
const AUDIT = "lib/helmut/matching-audit.js";
const DECISIONS = "lib/helmut/decisions.js";
const ERKLAERUNG = "lib/helmut/matching-erklaerung.js";

// Jede Mutation nimmt GENAU EINE Garantie des Vertrags zurueck.
const MUTATIONEN = [
  {
    name: "M1 · Herkunft (BLN) faellt aus dem Rohdokument-Vertrag",
    beschreibung: "Ohne raw.herkunft verloere das Berliner Dokument seinen Herkunftsnachweis — Vertragsstufe C2.",
    datei: KLASSEN,
    von: "      herkunft: LAND_HERKUNFT[String(doc.land || \"\").toLowerCase()] || null,",
    nach: "      herkunft: null,"
  },
  {
    name: "M2 · Landes-Institutionen stiften keine Ebene mehr",
    beschreibung: "\"Abgeordnetenhaus/Senatsverwaltung\" wuerde keine Landesebene mehr ergeben — der Berliner Vorgang verloere decision_level=land (D5/D7).",
    datei: CLS,
    von: "const LAND_INSTITUTION_TERMS = [\"landtag\", \"abgeordnetenhaus\", \"senat\", \"landesregierung\", \"staatskanzlei\", \"senatskanzlei\", \"senatsverwaltung\", \"landesministerium\"];",
    nach: "const LAND_INSTITUTION_TERMS = [];"
  },
  {
    name: "M3 · Institutionsnennung im Fliesstext stiftet keine Geografie mehr",
    beschreibung: "\"Abgeordnetenhaus von Berlin\" im Text ergaebe keine betroffene Geografie Berlin mehr (D6).",
    datei: CLS,
    von: "    for (const eintrag of SUBNATIONALE_INSTITUTIONSPHRASEN) {",
    nach: "    for (const eintrag of []) {"
  },
  {
    name: "M4 · Ausschuss-Ueberschneidung erzeugt kein matched_feature mehr",
    beschreibung: "Der wichtigste Beleg (Dein Ausschuss) verschwaende aus Matching, Erklaerung und Entscheidung (F5/F8/I2).",
    datei: MATCHING,
    von: "  overlapLabels(pf.committees, kf.committees, slugCommittee).forEach((v) => feats.push({ type: \"ausschuss\", value: v }));",
    nach: "  ;"
  },
  {
    name: "M5 · Vollstaendige Duplikate gelten wieder als neue Arbeit",
    beschreibung: "Ein identischer Zweitlauf wuerde denselben Vorgang erneut anfassen — Idempotenz des Understandings gebrochen (E1/E2).",
    datei: UNDERSTANDING,
    von: "      if (!neueDocs.length) {\n        return { vorgangId, status: \"duplicate\", documents: clusterDocs.length, ...spur };\n      }",
    nach: "      if (false) {\n        return { vorgangId, status: \"duplicate\", documents: clusterDocs.length, ...spur };\n      }"
  },
  {
    name: "M6 · Matching-Idempotenz entfaellt",
    beschreibung: "Ein identischer Eingabefingerabdruck erzeugte wieder eine neue Generation samt Schreibvorgaengen (G1/G2).",
    datei: AUDIT,
    von: "  if (vorhanden && vorhanden.id) {",
    nach: "  if (false) {"
  },
  {
    name: "M7 · Mandanten-/Profilpruefung der Audit-Schicht entfaellt",
    beschreibung: "Ein Lauf mit fremder Profilkennung wuerde nicht mehr abgelehnt — Mandantentrennung durchbrochen (H6).",
    datei: AUDIT,
    von: "  if (!deps.profileBelongsToTenant(descriptor.mandateProfileId, descriptor.tenantId)) {",
    nach: "  if (false) {"
  },
  {
    name: "M8 · Publish-Fehler wird verschluckt statt gemeldet",
    beschreibung: "Ein Abbruch waehrend der Veroeffentlichung saehe wie ein vollstaendiger Lauf aus — falsches Gruen (K5/K6).",
    datei: AUDIT,
    von: "      error.auditStatus = contract.RUN_STATUS.FEHLGESCHLAGEN;\n      throw error;",
    nach: "      return { idempotent: false, runId, status: contract.RUN_STATUS.VOLLSTAENDIG, fingerprint: descriptor.fingerprint, veroeffentlicht: 0, abgeloest: 0, wiederholungen: 0 };"
  },
  {
    name: "M9 · Entscheidungsschwelle entfaellt: alles ist sofort wichtig",
    beschreibung: "Auch der irrelevante Berliner Vorgang und der fremde Mandant bekaemen \"Sofort reagieren\" (I4/I5).",
    datei: DECISIONS,
    von: "  return score >= 60 ? \"Sofort reagieren\" : score >= 40 ? \"Beobachten\" : \"Ignorieren\";",
    nach: "  return \"Sofort reagieren\";"
  },
  {
    name: "M10 · Erklaerung ohne Beleg erfindet einen Ersatztext",
    beschreibung: "Eine Zeile ohne matched_features bekaeme eine behauptete Relevanz — Belegpflicht gebrochen (F9).",
    datei: ERKLAERUNG,
    von: "  const belege = belegeAus(signale);\n  if (!belege.length) return null;",
    nach: "  const belege = belegeAus(signale);\n  if (!belege.length) return { satz: \"Für dich relevant.\", belege: [{ art: \"thema\", text: \"Dein Schwerpunkt: Politik\" }] };"
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
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-e2e-mutation-"));
  kopiereVerzeichnis(path.join(ROOT, "lib"), path.join(basis, "lib"));
  kopiereVerzeichnis(path.join(ROOT, "test", "fixtures", "pardok"), path.join(basis, "test", "fixtures", "pardok"));
  fs.mkdirSync(path.join(basis, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "scripts", SUITE), path.join(basis, "scripts", SUITE));
  // helmut-flags.json wird von lib/helmut/flags.js gelesen (Datei-Flags) — mitkopieren,
  // damit der Abzug dieselben Default-AUS-Flags sieht wie das Repo.
  for (const datei of ["helmut-flags.json"]) {
    const q = path.join(ROOT, datei);
    if (fs.existsSync(q)) fs.copyFileSync(q, path.join(basis, datei));
  }
  return basis;
}

function fuehreSuiteAus(basis) {
  const ergebnis = spawnSync(process.execPath, [path.join(basis, "scripts", SUITE)], {
    cwd: basis, encoding: "utf8", timeout: 180000,
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
  console.log(`\nMUTATIONSPROBE PUNKT 26A (Berliner E2E-Vertrag) — Suite: scripts/${SUITE}\n`);
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
