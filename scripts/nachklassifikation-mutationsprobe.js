"use strict";

// Mutationsprobe zu Sprint 21 — sind die Schutzregeln der Nachklassifikation tragend?
// =============================================================================
// Ein gruener Test beweist nichts, solange nicht gezeigt ist, dass er auch ROT
// werden kann. Diese Probe nimmt jede einzelne Schutzregel des Sprints zurueck
// und prueft, dass `nachklassifikation-test.js` die Ruecknahme bemerkt.
//
// Besonders wichtig ist das hier, weil dieser Sprint Production-Daten LOESCHEN
// darf. Jede Mutation unten beschreibt einen realen Schaden am Bestand.
//
// ARBEITSWEISE — die Arbeitskopie des Repos wird NICHT angefasst: fuer jede
// Mutation entsteht ein vollstaendiger Abzug in einem temporaeren Verzeichnis;
// mutiert und ausgefuehrt wird ausschliesslich dort.
//
// Aufruf:  node scripts/nachklassifikation-mutationsprobe.js [--verbose]
// Exit 0 nur, wenn JEDE Mutation die Suite rot macht.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SUITE = "nachklassifikation-test.js";
// Die Suite liest das Werkzeug als Modul UND als Quelltext — es muss mit.
const MIT_KOPIEREN = ["nachklassifikation.js"];

const MOD = "lib/helmut/quellenarchitektur/nachklassifikation.js";
const WERKZEUG = "scripts/nachklassifikation.js";

const MUTATIONEN = [
  {
    name: "M1 · Schutz belegter Werte aufheben",
    beschreibung: "Ein Eintrag mit echter Herkunft (Rang >= ki) waere nicht mehr geschuetzt — eine nachgewiesene Deutschland-Betroffenheit koennte geloescht werden.",
    datei: MOD,
    von: "    if (e.hatHerkunft && herkunftRang(e.herkunft) >= HERKUNFT_RANG.ki) {",
    nach: "    if (false) {"
  },
  {
    name: "M2 · Nachweisprüfung vor dem Loeschen entfernen",
    beschreibung: "Ein Altwert wuerde auch dann als Ebenen-Ableitung geloescht, wenn ein echter inhaltlicher Nachweis fuer genau diese Region vorliegt.",
    datei: MOD,
    von: "    if (nachweisSchluessel.has(geoSchluessel(e))) {",
    nach: "    if (false) {"
  },
  {
    name: "M3 · Unbekannte Muster wie einen bekannten Altfehler behandeln",
    beschreibung: "Statt fail closed wuerde jeder nicht wiedererkannte Altwert als Ebenen-Ableitung eingestuft und geloescht — ein pauschales Ueberschreiben des Bestands, genau das, was der Auftrag verbietet.",
    datei: MOD,
    von: "    behalten.push(e);\n    aenderungen.push(bau(\"affected_geographies\", alt, alt, \"geo-unklar-manuell\", e.herkunft, e.herkunft, false));",
    nach: "    aenderungen.push(bau(\"affected_geographies\", alt, null, \"geo-ebenen-ableitung-bund\", e.herkunft, null, true));"
  },
  {
    name: "M4 · Verschobene Ortsnennung wieder als Betroffenheit einspeisen",
    beschreibung: "Die als Betroffenheit fehlgespeicherte Ortsnennung kaeme ueber die Kandidatenliste sofort als betroffen zurueck — die Bereinigung waere wirkungslos (Regel 6).",
    datei: MOD,
    von: "    kandidaten: [...alleKandidaten, ...verschoben.map((v) => ({ ...v, rolle: \"erwaehnt\" }))],",
    nach: "    kandidaten: [...alleKandidaten, ...verschoben.map((v) => ({ ...v, rolle: \"betroffen\", herkunft: \"inhalt\" }))],"
  },
  {
    name: "M5 · Manuelle Prueffaelle automatisch schreiben",
    beschreibung: "Die Einstufung waere wirkungslos: auch 'erfordert-manuelle-pruefung' und 'erfordert-ki-neuanalyse' wuerden automatisch geschrieben.",
    datei: MOD,
    von: "const AUTOMATISCH_ERLAUBT = new Set([EINSTUFUNG.SICHER]);",
    nach: "const AUTOMATISCH_ERLAUBT = new Set(Object.values(EINSTUFUNG));"
  },
  {
    name: "M6 · Sprint-19-Gedaechtnis umgehen (Ebene direkt ueberschreiben)",
    beschreibung: "Die politische Ebene wuerde neu berechnet statt wiederverwendet — ein belastbares 'bund' koennte auf 'unknown' zurueckfallen (Sprint-19-Regression).",
    datei: MOD,
    von: "  const ebene = entscheideEbene({\n    bestand: ko,",
    nach: "  const ebene = entscheideEbene({\n    bestand: null,"
  },
  {
    name: "M7 · Sprint-20-Gedaechtnis umgehen (Bestand nicht durchreichen)",
    beschreibung: "Der bereinigte Bestand ginge verloren; eine belastbare Region wuerde bei leerer Nachweissuche geloescht statt erhalten (Sprint-20-Regression).",
    datei: MOD,
    von: "    bestand: bereinigterBestand,",
    nach: "    bestand: null,"
  },
  {
    name: "M8 · Idempotenz brechen: immer schreiben",
    beschreibung: "Jeder Lauf wuerde jedes Objekt anfassen — ein zweiter Lauf erzeugte Schreibvorgaenge ohne Sachgrund und schriebe updated_at fort.",
    datei: MOD,
    von: "  const schreibbar = aenderungen.filter((a) => a.aenderungSchreibt\n    && istAutomatischSicher(a.klasse)",
    nach: "  const schreibbar = aenderungen.filter((a) => true\n    && true"
  },
  {
    name: "M9 · Entitaeten nicht mehr additiv behandeln",
    beschreibung: "Ein gespeicherter, nicht aufloesbarer Entitaetseintrag wuerde beim Neuschreiben verschwinden.",
    datei: MOD,
    von: "    ergebnis.push(e);\n  }\n\n  // Kanonische Entitaeten",
    nach: "  }\n\n  // Kanonische Entitaeten"
  },
  {
    name: "M9b · Protokollfelder unkontrolliert erweitern",
    beschreibung: "Die abgeschlossene Feldliste des Protokolls faellt weg; ein neues Feld koennte unbemerkt Vorgangstext mitfuehren.",
    datei: MOD,
    von: "    aenderungen: (plan.aenderungen || []).map((a) => maskiereWert(a, env))",
    nach: "    aenderungen: (plan.aenderungen || []).map((a) => maskiereWert(a, env)),\n    zusatzfeld: 1"
  },
  {
    name: "M10 · DSGVO-Maskierung des Protokolls abschalten",
    beschreibung: "Personennamen, E-Mail-Adressen und Telefonnummern koennten in Protokoll, PR und Doku landen.",
    datei: MOD,
    von: "  if (typeof wert === \"string\") return redactSensitive(wert, env);",
    nach: "  if (typeof wert === \"string\") return wert;"
  },
  {
    name: "M11 · Personennamen nicht mehr ersetzen",
    beschreibung: "Eine Personenzuordnung ginge ueber ihren Klarnamen ins Protokoll und damit potenziell in PR und Doku.",
    datei: MOD,
    von: "  const istPersonensatz = String(wert.type || \"\").trim().toLowerCase() === \"person\";",
    nach: "  const istPersonensatz = false;"
  },
  {
    name: "M12 · Vorschau ist nicht mehr der Standard",
    beschreibung: "Ein Aufruf ohne jeden Schalter wuerde in Production schreiben.",
    datei: WERKZEUG,
    von: "    ausfuehren: false, json: false, alle: false, limit: 4000",
    nach: "    ausfuehren: true, json: false, alle: false, limit: 4000"
  },
  {
    name: "M13 · Mengengrenze wird zur stillen Kappung",
    beschreibung: "Statt abzubrechen wuerde das Werkzeug irgendwelche N Objekte verarbeiten — ein unerwartet grosser Bestand liefe unbemerkt durch.",
    datei: WERKZEUG,
    von: "    kandidaten: liste, fehlend: [], ueberMax: liste.length > max, gesamt: liste.length,",
    nach: "    kandidaten: liste.slice(0, max), fehlend: [], ueberMax: false, gesamt: liste.length,"
  },
  {
    name: "M14 · --ids erst NACH der Mengenkappung anwenden",
    beschreibung: "Genau der Defekt aus B4-3: ein gezielter Lauf verarbeitete still eine andere Menge als angefordert.",
    datei: WERKZEUG,
    von: "  if (ids) {\n    const gesucht = new Set(ids);",
    nach: "  if (ids) {\n    liste = liste.slice(0, max);\n    const gesucht = new Set(ids);"
  },
  {
    name: "M15 · Mandantenbegrenzung nicht mehr fail closed",
    beschreibung: "Ein Mandant ohne Zuordnung wuerde still zu einem Lauf ueber ALLE Mandanten — ein Massenlauf unter dem Etikett eines gezielten Laufs.",
    datei: WERKZEUG,
    von: "    if (!mandantIds.length) {",
    nach: "    if (false) {"
  },
  {
    name: "M16 · Ungeblaettert lesen und Lesefehler verschlucken",
    beschreibung: "Doppelter Werkzeugbefund W-1: PostgREST kappt still bei 1 000 Zeilen (bei 1 230 Objekten fehlten 230), und ein DNS-/Timeout-Fehler saehe aus wie ein leerer Bestand.",
    datei: WERKZEUG,
    von: "    objekte = await storage.listKnowledgeObjectsSeitenweise({ limit: args.limit });",
    nach: "    objekte = await storage.listKnowledgeObjects({ limit: args.limit }).catch(() => []);"
  },
  {
    name: "M17 · Kollisionsschutz entfernen",
    beschreibung: "Ein Objekt, das die regulaere Verarbeitung parallel geaendert hat, wuerde ueberschrieben.",
    datei: WERKZEUG,
    von: "        const aktuell = await storage.getKnowledgeObjectById(plan.id);",
    nach: "        const aktuell = { updated_at: undefined };"
  },
  {
    name: "M17b · Unverstandene Vorgaenge mitklassifizieren",
    beschreibung: "Aus der blossen Schlagzeile eines nie verstandenen Vorgangs entstuende eine gespeicherte politische Ebene — wegen der Sprint-19-Monotonie waere die Vermutung ab dann das Gedaechtnis.",
    datei: WERKZEUG,
    von: "  let liste = alle.filter((k) => k.understanding_status === VERWERTBARER_ZUSTAND);",
    nach: "  let liste = alle.slice();"
  },
  {
    name: "M17c · Klassen-Positivliste unwirksam machen",
    beschreibung: "Eine auf einzelne Fehlerklassen begrenzte Freigabe waere wirkungslos — der Lauf veraenderte auch Klassen, die der Betreiber nicht freigegeben hat.",
    datei: MOD,
    von: "    && (!erlaubt || erlaubt.has(a.klasse)));",
    nach: "    );"
  },
  {
    name: "M18 · Production-Schreibgate entfernen",
    beschreibung: "Ein Schreiblauf koennte mit lokalem Betriebsspeicher gegen Production laufen — der Kostendeckel startete bei 0 (Befund B4-3, Phase 6).",
    datei: WERKZEUG,
    von: "    erzwingeSchreibgate(process.env, { zweck: \"Nachklassifikation (Sprint 21)\", exitCode: 6 });",
    nach: "    // Gate absichtlich entfernt"
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
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-nachklass-mutation-"));
  kopiereVerzeichnis(path.join(ROOT, "lib"), path.join(basis, "lib"));
  fs.mkdirSync(path.join(basis, "scripts"), { recursive: true });
  for (const datei of [SUITE, ...MIT_KOPIEREN]) {
    fs.copyFileSync(path.join(ROOT, "scripts", datei), path.join(basis, "scripts", datei));
  }
  return basis;
}

function fuehreSuiteAus(basis) {
  const ergebnis = spawnSync(process.execPath, [path.join(basis, "scripts", SUITE)], {
    cwd: basis, encoding: "utf8", timeout: 120000,
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
  console.log(`\nMUTATIONSPROBE SPRINT 21 (Nachklassifikation) — Suite: scripts/${SUITE}\n`);
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
