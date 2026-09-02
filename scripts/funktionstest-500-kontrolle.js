#!/usr/bin/env node
"use strict";

// Helmut — BETREIBER-CLI: die kurze Sicherheitskontrolle zwischen den Stufen.
// =============================================================================
// Zwei Schritte, streng getrennt:
//
//   sql     druckt das REIN LESENDE Erhebungs-SQL. Es wird gedruckt, NICHT
//           ausgeführt — genau wie bei `testkohorte-495.js sql`.
//   pruefe  wertet die erhobenen Zahlen gegen alle fünfzehn Abbruchregeln aus.
//
// Dieses Werkzeug schreibt nichts, ruft kein Modell auf, öffnet kein Netz und
// aktiviert nichts. Eine Regel ohne Messwert ist NICHT grün, sondern nicht
// bewertbar — und das bricht die Stufe ab.
//
// Aufrufe:
//   node scripts/lokal.js -- node scripts/funktionstest-500-kontrolle.js sql --seit=2026-09-10T11:36:00Z
//   node scripts/lokal.js -- node scripts/funktionstest-500-kontrolle.js pruefe \
//        --quellen=quellen.json --grenzen=grenzen.json [--stufe=a]
//   node scripts/lokal.js -- node scripts/funktionstest-500-kontrolle.js herkunft

const fs = require("fs");
const K = require("../lib/helmut/funktionstest-kontrolle");

const WERKZEUGE = ["sql", "pruefe", "herkunft"];

function argument(argv, name) {
  const treffer = argv.find((a) => a.startsWith(`--${name}=`));
  return treffer ? treffer.slice(name.length + 3) : "";
}

function liesJson(pfad, name) {
  if (!pfad) {
    console.error(`--${name}=<datei.json> fehlt.`);
    process.exit(2);
  }
  try {
    return JSON.parse(fs.readFileSync(pfad, "utf8"));
  } catch (fehler) {
    console.error(`${name} nicht lesbar (${pfad}): ${(fehler && fehler.message) || fehler}`);
    process.exit(2);
  }
  return null;
}

function main() {
  const argv = process.argv.slice(2);
  const werkzeug = (argv[0] || "").trim();
  if (!WERKZEUGE.includes(werkzeug)) {
    console.error(`Werkzeug fehlt oder ist unbekannt. Erlaubt: ${WERKZEUGE.join(", ")}`);
    process.exit(2);
  }

  if (werkzeug === "sql") {
    const seit = argument(argv, "seit") || "<STUFENBEGINN-UTC>";
    console.log(K.erhebungsSql({ seitIso: seit }));
    return;
  }

  if (werkzeug === "herkunft") {
    console.log("\n=== Herkunft der fünfzehn Beobachtungsgrößen ===");
    for (const [messwert, quelle] of Object.entries(K.HERKUNFT)) {
      console.log(`  ${messwert.padEnd(28)} ${quelle}`);
    }
    return;
  }

  const quellen = liesJson(argument(argv, "quellen"), "quellen");
  const grenzen = liesJson(argument(argv, "grenzen"), "grenzen");
  const stufe = argument(argv, "stufe") || null;
  const befund = K.kontrolliere({ stufe, quellen, grenzen });

  console.log(`\n=== Sicherheitskontrolle${stufe ? ` Stufe ${stufe.toUpperCase()}` : ""} ===`);
  for (const f of befund.befunde) {
    const marke = !f.bewertbar ? "?" : (f.ausgeloest ? "×" : "·");
    console.log(`  ${marke} ${f.id}  ${f.meldung}`);
  }
  if (befund.fehlendeMesswerte.length) {
    console.log("\nFEHLENDE MESSWERTE (jeder einzelne blockiert die Stufe):");
    for (const h of befund.herkunftFehlender) console.log(`  ${h.messwert.padEnd(28)} ← ${h.quelle}`);
  }
  console.log(`\n${befund.meldung}`);
  process.exit(befund.bestanden ? 0 : 1);
}

try {
  main();
} catch (fehler) {
  console.error(`Abbruch: ${(fehler && fehler.message) || fehler}`);
  process.exit(1);
}
