#!/usr/bin/env node
// =============================================================================
// Understanding-Goldset-Test (V3, Commit C7b)
// =============================================================================
// Prueft die STRUKTUR des Goldsets gegen das knowledge_objects-Schema. KEINE KI,
// kein Netzwerk, kein Produktverhalten. Reines Regressionsnetz, das der spaetere
// echte understandDocument()-Call (C7) erfuellen muss.
//
// Ausfuehren:
//   node scripts/goldset-test.js
//   npm run test:goldset
//
// Exitcode 0 = alle Faelle valide & alle Fall-Typen abgedeckt, 1 = sonst.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const { validateGoldset, GOLDSET_CASE_TYPES } = require(path.join(root, "lib/helmut/understanding-schema.js"));
const GOLDSET_PATH = path.join(root, "scripts/goldset/understanding-goldset.json");

function main() {
  console.log("== Helmut Understanding-Goldset-Test ==\n");
  let goldset;
  try {
    goldset = JSON.parse(fs.readFileSync(GOLDSET_PATH, "utf8"));
  } catch (error) {
    console.log(`FAIL  Goldset nicht lesbar/JSON ungueltig — ${error.message}`);
    process.exit(1);
  }

  const result = validateGoldset(goldset);
  const cases = Array.isArray(goldset.cases) ? goldset.cases : [];
  console.log(`Faelle: ${cases.length}`);
  console.log(`Abgedeckte Fall-Typen: ${result.caseTypes.length}/${GOLDSET_CASE_TYPES.length} (${result.caseTypes.join(", ")})`);
  cases.forEach((c) => console.log(`  - ${c.name} [${c.case_type}] — ${Array.isArray(c.raw_documents) ? c.raw_documents.length : 0} Rohdok.`));

  if (result.valid) {
    console.log(`\nPASS  Goldset valide: alle ${cases.length} Faelle erfuellen das Schema, alle Fall-Typen abgedeckt, DSGVO-Regeln eingehalten.`);
    process.exit(0);
  }
  console.log(`\n${result.errors.length} Problem(e):`);
  result.errors.forEach((e) => console.log(`  FAIL  ${e}`));
  process.exit(1);
}

main();
