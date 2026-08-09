"use strict";

// Hält das Env-Inventar (docs/betrieb/env-inventar.md) mit dem Code synchron
// (Audit-Folgebranch). Scannt ALLE process.env.<NAME>-Zugriffe im produktiven
// Code und stellt sicher, dass jede Variable im Inventar dokumentiert ist —
// sonst driftet das Wiederaufbau-Dokument still (Bus-Faktor). KEIN Netz.
//
// Zusätzlich (Prüfungs-Folgefix): auch DYNAMISCH gelesene Variablen werden
// erkannt — das wörtliche process.env.NAME-Muster war blind für
//   (a) envList("NAME")            (lib/helmut/sourceSafety.js: SOURCE_BLOCK-/ALLOWLIST),
//   (b) flagValue("NAME")/flagInfo (lib/helmut/flags.js: SOURCE_MODE, GATE, DISPATCH),
//   (c) env.NAME auf injizierten env-Parametern (scoring.js, supply-shadow-compare.js).
// Genau so konnte HELMUT_SOURCE_BLOCKLIST/ALLOWLIST unbemerkt im Inventar fehlen.

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
const dynamicNames = new Set();
for (const file of productiveFiles) {
  const src = fs.readFileSync(file, "utf8");
  // (1) Wörtlicher Zugriff: process.env.NAME
  for (const m of src.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) envNames.add(m[1]);
  // (2) Dynamischer Zugriff über Helfer mit String-Literal: envList("NAME"),
  //     flagValue("NAME"), flagInfo("NAME") — die Helfer lesen intern
  //     process.env[name] und sind für Muster (1) unsichtbar.
  for (const m of src.matchAll(/\b(?:envList|flagValue|flagInfo)\(\s*["']([A-Z_][A-Z0-9_]*)["']/g)) {
    envNames.add(m[1]); dynamicNames.add(m[1]);
  }
  // (3) Property-Zugriff auf injizierte env-Parameter: env.NAME (Default-Wert
  //     process.env), z. B. scoring.js env.HELMUT_SCORING_MODE. Der Lookbehind
  //     schließt das bereits von (1) erfasste process.env.NAME aus.
  for (const m of src.matchAll(/(?<!process\.)\benv\.([A-Z_][A-Z0-9_]*)/g)) {
    envNames.add(m[1]); dynamicNames.add(m[1]);
  }
}

// DYNAMISCHE Lesarten (Review-Fix): der Regex oben sieht nur woertliche
// process.env.NAME-Zugriffe. Diese Namen werden ueber process.env[name] bzw.
// den Flag-Resolver (lib/helmut/flags.js flagValue) gelesen und muessen
// trotzdem im Inventar stehen — die Liste hier haelt den Scanner ehrlich.
const DYNAMIC_ENV_READS = [
  "HELMUT_SOURCE_BLOCKLIST", "HELMUT_SOURCE_ALLOWLIST",          // sourceSafety.js process.env[name]
  "HELMUT_SOURCE_MODE", "HELMUT_UNDERSTANDING_GATE", "HELMUT_PARDOK_DISPATCH", // flags.js flagValue(name)
  // Abschlussreview 2026-08-08: `lib/helmut/worker-betrieb.js` liest ueber einen eigenen
  // Helfer (`zahl("NAME", …)` -> `env[name]`). Keines der drei Muster oben sieht das — die
  // vier Namen fehlten deshalb unbemerkt im Inventar, waehrend der Scanner „vollstaendig"
  // meldete. Genau dafuer existiert diese Liste.
  "HELMUT_WORKER_PARALLEL", "HELMUT_WORKER_BUDGET_MS",
  "HELMUT_WORKER_LEASE_MS", "HELMUT_WORKER_STAPEL"
];
for (const name of DYNAMIC_ENV_READS) envNames.add(name);

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

// Dynamisch gelesene Betreiber-Schalter: Muster (2)/(3) MÜSSEN sie finden UND
// das Inventar MUSS sie dokumentieren. Schutz gegen künftige Drift, falls die
// Lesestellen umgebaut werden (dann schlägt dieser explizite Check an).
for (const dyn of ["HELMUT_SOURCE_BLOCKLIST", "HELMUT_SOURCE_ALLOWLIST", "HELMUT_SOURCE_MODE", "HELMUT_SCORING_MODE"]) {
  check(`Dynamisch gelesene Variable vom Scan erfasst: ${dyn}`, dynamicNames.has(dyn) || envNames.has(dyn));
  check(`Dynamisch gelesene Variable dokumentiert: ${dyn}`, inventory.includes(dyn));
}

// Struktur-Checks der Prüfungs-Folgeabschnitte (Rekonstruktions-/Betriebslisten).
check("Abschnitt 'Werkzeug-/Script-Variablen' existiert", /Werkzeug-\/Script-Variablen/.test(inventory));
check("Abschnitt 'Veraltete Variablen' existiert", /## .*Veraltete Variablen/.test(inventory));
check("Abschnitt 'Kritische Production-Variablen' existiert", /## .*Kritische Production-Variablen/.test(inventory));
check("Werkzeug-Abschnitt nennt TARGET_SUPABASE_SERVICE_ROLE_KEY", inventory.includes("TARGET_SUPABASE_SERVICE_ROLE_KEY"));
check("Werkzeug-Abschnitt nennt VERCEL_TOKEN", inventory.includes("VERCEL_TOKEN"));
check("Werkzeug-Abschnitt nennt HELMUT_PROD_URL (GitHub-Variable)", inventory.includes("HELMUT_PROD_URL"));
check("CRON_SECRET-Doppelpflege (GitHub HELMUT_CRON_SECRET) ist dokumentiert", inventory.includes("HELMUT_CRON_SECRET"));

// Phantom-Regression: HELMUT_MONITORING_EMAIL existiert im Code nicht — im
// Inventar darf sie nur noch als Veraltet-/Phantom-Hinweis auftauchen, nie im
// Pflicht-Mindestset (dort gehört HELMUT_MONITORING_WEBHOOK_URL hin).
const mindestset = inventory.split(/## .*Pflicht-Mindestset/)[1]?.split(/\n## /)[0] || "";
check("Pflicht-Mindestset nennt HELMUT_MONITORING_WEBHOOK_URL statt Phantom-Variable",
  mindestset.includes("HELMUT_MONITORING_WEBHOOK_URL") && !mindestset.includes("HELMUT_MONITORING_EMAIL"));

// Budget-Semantik: das Inventar darf den abgeschafften "kein Limit"-Zustand
// nicht mehr behaupten (real: fehlend/leer/0/ungültig => Schutzlimit 50).
check("Inventar dokumentiert Schutzlimit 50 (fail-closed) fuer HELMUT_MAX_LLM_CALLS_PER_DAY",
  /Schutzlimit 50/.test(inventory) && !/Leer\/0 = kein Limit/.test(inventory));

// Rotations-Runbook existiert und deckt die Kern-Secrets ab.
const rotationPath = path.join(root, "docs/betrieb/secret-rotation.md");
check("docs/betrieb/secret-rotation.md existiert", fs.existsSync(rotationPath));
if (fs.existsSync(rotationPath)) {
  const rotation = fs.readFileSync(rotationPath, "utf8");
  for (const secret of ["PILOT_SECRET", "CRON_SECRET", "HELMUT_ADMIN_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "CALLMEBOT_APIKEY", "VAPID_PRIVATE_KEY", "DIP_API_KEY", "VERCEL_TOKEN", "TARGET_SUPABASE_SERVICE_ROLE_KEY"]) {
    check(`Rotations-Runbook behandelt ${secret}`, rotation.includes(secret));
  }
}

console.log(`\n${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
