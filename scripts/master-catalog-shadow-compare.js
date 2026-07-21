"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Shadow-Vergleich-Treiber (Werkzeug, KEIN Test).
//
// Vergleicht den BESTEHENDEN relationalen Quellenbestand (rein lesend adaptiert) gegen den neuen
// Master-Katalog (Seed) und beantwortet die sechs Auftragsfragen aus Phase 1. Reproduzierbar:
// gleiche Eingabe -> gleiches Ergebnis. Schreibt einen `vergleich.json`-Bericht und druckt eine
// kompakte Zusammenfassung. KEIN Netz, kein DB-Schreibzugriff, KEINE Production-Aenderung.
//
// Aufruf:
//   node scripts/master-catalog-shadow-compare.js [ausgabe-verzeichnis]
// Standard-Eingabe: der In-Memory-Abzug des Altbestands (quellenarchitektur.buildFullModel) —
// das ist die reale kuratierte v1Sources-Basis. (Ein echter DB-Snapshot koennte alternativ
// eingelesen werden; dieser Treiber bleibt bewusst offline + deterministisch.)

const fs = require("fs");
const path = require("path");
const quellenarchitektur = require("../lib/helmut/quellenarchitektur");
const master = require("../lib/helmut/quellenarchitektur/master");

function main() {
  const outDir = process.argv[2] || path.join(__dirname, "..", "audit");
  const full = quellenarchitektur.buildFullModel();
  const { comparison, oldAdapted, master: masterCat } = master.shadowAgainstRelational(full);

  const bericht = {
    erzeugtVon: "scripts/master-catalog-shadow-compare.js",
    hinweis: "Rein lesend. Alt = relationaler Bestand (adaptiert), Neu = Master-Seed (Sprint 3).",
    urteil: comparison.verdict,
    zusammenfassung: comparison.summary,
    zahlen: comparison.counts,
    // Die sechs Auftragsfragen (Phase 1):
    nurImAltenSystem: comparison.onlyOld,
    nurImNeuenModell: comparison.onlyNew,
    unterschiedlichKlassifiziert: comparison.differingClassification,
    widerspruechlicheUrls: comparison.conflictingUrls,
    vermutlichDoppelt: comparison.likelyDuplicates,
    abweichendeZuweisung: comparison.differingAssignment,
    altbestand: { adaptierteQuellen: oldAdapted.records.length, zuweisungen: oldAdapted.assignments.length },
    masterKatalog: { quellen: masterCat.records.length, pakete: masterCat.packages.length }
  };

  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "master-katalog-vergleich.json"), JSON.stringify(bericht, null, 2));
  } catch (e) {
    console.error("Konnte Bericht nicht schreiben:", e.message);
  }

  console.log("== Master-Katalog Shadow-Vergleich (Alt-relational vs. Master-Seed) ==");
  console.log(`Urteil: ${comparison.verdict}`);
  console.log(comparison.summary);
  console.log("");
  console.log(`1) nur im alten System:        ${comparison.counts.onlyOld}`);
  console.log(`2) nur im neuen Modell:        ${comparison.counts.onlyNew}`);
  console.log(`3) unterschiedlich klassifiz.: ${comparison.counts.differingClassification}`);
  console.log(`4) widerspruechliche URLs:     ${comparison.counts.conflictingUrls}`);
  console.log(`5) vermutlich doppelt:         ${comparison.counts.likelyDuplicates}`);
  console.log(`6) abweichende Zuweisung:      ${comparison.counts.differingAssignment}`);
  console.log("");
  console.log(`Bericht: ${path.join(outDir, "master-katalog-vergleich.json")}`);
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { main };
