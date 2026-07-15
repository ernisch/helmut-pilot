"use strict";

// Hält das Env-Inventar (docs/betrieb/env-inventar.md) mit dem Code synchron
// (Audit-Folgebranch). Scannt ALLE process.env.<NAME>-Zugriffe im produktiven
// Code und stellt sicher, dass jede Variable im Inventar dokumentiert ist —
// sonst driftet das Wiederaufbau-Dokument still (Bus-Faktor). KEIN Netz.

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

function collectFiles(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(p, acc);
    else if (entry.name.endsWith(".js")) acc.push(p);
  }
  return acc;
}

const productiveFiles = [
  path.join(root, "server.js"),
  path.join(root, "api", "index.js"),
  ...collectFiles(path.join(root, "lib", "helmut"), [])
];

const envNames = new Set();
for (const file of productiveFiles) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) envNames.add(m[1]);
}

const inventory = fs.readFileSync(path.join(root, "docs/betrieb/env-inventar.md"), "utf8");

// Plattform-/Laufzeit-Variablen, die Vercel/Node selbst setzen — im Inventar
// als Gruppe genannt, aber nicht einzeln als Backtick-Token nötig.
const PLATFORM = new Set(["NODE_ENV", "PORT", "VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA", "VERCEL_GIT_COMMIT_REF"]);

const undocumented = [];
for (const name of [...envNames].sort()) {
  if (PLATFORM.has(name)) continue;
  if (!inventory.includes(name)) undocumented.push(name);
}

check(`Alle produktiven Env-Variablen sind im Inventar dokumentiert (${envNames.size} gefunden)`,
  undocumented.length === 0, undocumented.length ? "fehlen: " + undocumented.join(", ") : "");

// Gegenprobe: die betriebskritischen Variablen sind explizit gelistet.
for (const critical of ["SUPABASE_SERVICE_ROLE_KEY", "PILOT_SECRET", "CRON_SECRET", "HELMUT_MAX_LLM_CALLS_PER_DAY", "HELMUT_SOURCE_MODE", "CALLMEBOT_APIKEY", "VAPID_PRIVATE_KEY"]) {
  check(`Kritische Variable dokumentiert: ${critical}`, inventory.includes(critical));
}
check("Inventar warnt vor HELMUT_REVIEW_FIXTURE in Production", inventory.includes("HELMUT_REVIEW_FIXTURE"));
check("Pflicht-Mindestset ist benannt", /Pflicht-Mindestset/i.test(inventory));

console.log(`\n${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
