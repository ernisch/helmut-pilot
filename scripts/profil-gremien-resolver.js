#!/usr/bin/env node
"use strict";

// Helmut — kleiner Node-Helfer fuer den Offline-Assembler der 500er Profil-Feldbelege.
//
// Zweck: Die Entscheidung "ist dieser Name ein staendiger Ausschuss der laufenden
// Wahlperiode?" darf NICHT im Python-Assembler nachgebaut werden. Sie kommt
// ausschliesslich aus dem vorhandenen Produktcode
// (lib/helmut/profile-readiness.js -> resolveBundestagsausschuss). Damit gibt es
// genau EINE Sollmenge; Resolver und Schwellen bleiben unveraendert.
//
// Der Helfer ist rein lesend: kein Netz, keine DB, kein Modell, kein Schreibzugriff.
// Er liest eine JSON-Anfrage von stdin ({"gremien": ["..."]} oder eine reine Liste)
// und schreibt die Klassifikation als JSON nach stdout.
//
// Aufruf aus dem Assembler:  node scripts/profil-gremien-resolver.js  (stdin/stdout)

const { resolveBundestagsausschuss } = require("../lib/helmut/profile-readiness.js");

function klassifiziere(namen) {
  if (!Array.isArray(namen)) {
    throw new Error("Erwartet eine Liste von Gremiennamen ({\"gremien\": [...]} oder [...]).");
  }
  const ergebnis = {};
  for (const name of namen) {
    const wert = String(name == null ? "" : name);
    if (Object.prototype.hasOwnProperty.call(ergebnis, wert)) continue;
    const treffer = resolveBundestagsausschuss(wert);
    ergebnis[wert] = treffer.ok
      ? { staendig: true, key: treffer.key, name: treffer.name }
      : { staendig: false, grund: treffer.grund };
  }
  return ergebnis;
}

function main(rohtext) {
  const anfrage = JSON.parse(rohtext);
  const namen = Array.isArray(anfrage) ? anfrage : anfrage && anfrage.gremien;
  return klassifiziere(namen);
}

module.exports = { klassifiziere, main };

if (require.main === module) {
  const fs = require("fs");
  const rohtext = fs.readFileSync(0, "utf8");
  process.stdout.write(JSON.stringify(main(rohtext)));
}
