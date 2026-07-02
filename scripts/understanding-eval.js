#!/usr/bin/env node
// =============================================================================
// C8 Understanding-Goldset-Evaluation
// =============================================================================
// Fuehrt JEDEN Goldset-Fall durch die ECHTE C8-Pipeline (Clustering -> Prompt ->
// Assemble -> Schema-Validierung) und meldet, ob die Analyse den knowledge_objects-
// Vertrag erfuellt und DSGVO-sauber ist.
//
// Zwei Modi:
//   - OHNE KI-Key (Default, offline): die im Goldset hinterlegte erwartete Analyse
//     wird als (perfekte) KI-Antwort simuliert. Prueft die Pipeline Ende-zu-Ende
//     ohne Netzwerk/Kosten -> deterministisches Regressionsnetz.
//   - MIT KI-Key + HELMUT_UNDERSTANDING_EVAL_LIVE=1: es wird der ECHTE Azure/OpenAI-
//     Understanding-Call gefahren (kostet Token!). Der Goldset-Text dient dann als
//     Eingabe, die KI-Antwort wird gegen das Schema geprueft.
//
// Ausfuehren:
//   node scripts/understanding-eval.js
//   npm run test:understanding-eval
//   HELMUT_UNDERSTANDING_EVAL_LIVE=1 npm run test:understanding-eval   # echte KI
//
// Exitcode 0 = alle Faelle valide, 1 = sonst.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const u = require(path.join(root, "lib/helmut/understanding.js"));
const ai = require(path.join(root, "lib/helmut/ai.js"));
const { KNOWLEDGE_OBJECT_SCHEMA } = require(path.join(root, "lib/helmut/understanding-schema.js"));
const GOLDSET_PATH = path.join(root, "scripts/goldset/understanding-goldset.json");

function flagOn(value) {
  return ["1", "true", "on", "yes"].includes(String(value || "").trim().toLowerCase());
}

async function main() {
  console.log("== Helmut C8 Understanding-Goldset-Evaluation ==\n");

  let goldset;
  try {
    goldset = JSON.parse(fs.readFileSync(GOLDSET_PATH, "utf8"));
  } catch (error) {
    console.log(`FAIL  Goldset nicht lesbar/JSON ungueltig — ${error.message}`);
    process.exit(1);
  }

  const live = flagOn(process.env.HELMUT_UNDERSTANDING_EVAL_LIVE) && ai.isAiEnabled();
  if (live) {
    console.log(`Modus: LIVE — echter Understanding-Call (${ai.understandingModelName()}). ACHTUNG: kostet Token.\n`);
  } else {
    console.log("Modus: OFFLINE — erwartete Analyse als perfekte KI-Antwort simuliert (keine Kosten).\n");
  }

  // requestUnderstanding: live -> echter KI-Call; offline -> erwartete Analyse.
  const requestUnderstanding = live
    ? (prompt) => ai.requestStructuredJson(prompt, KNOWLEDGE_OBJECT_SCHEMA, { callType: "understanding-eval", politicianId: null }, ai.understandingModelName())
    : (_prompt, caseObj) => ({ ...caseObj.expected });

  const report = await u.evaluateUnderstandingGoldset(goldset, requestUnderstanding);
  report.results.forEach((r) => {
    const status = r.valid ? "PASS" : "FAIL";
    console.log(`  ${status}  ${r.name} [${r.vorgangId}]${r.valid ? "" : ` — ${r.errors.join("; ")}`}`);
  });

  console.log(`\n${report.valid}/${report.total} Faelle valide.`);
  if (report.valid === report.total) {
    console.log("PASS  Die C8-Pipeline erfuellt fuer alle Goldset-Faelle den knowledge_objects-Vertrag (DSGVO-konform).");
    process.exit(0);
  }
  console.log("FAIL  Mindestens ein Fall erfuellt den Vertrag nicht.");
  process.exit(1);
}

main().catch((error) => {
  console.error("Understanding-Eval abgestuerzt:", error);
  process.exit(1);
});
