"use strict";

// Helmut — Statischer Vertrag fuer .github/workflows/verstehen-169-einmalig.yml
// =============================================================================================
// Reine Workflow-Infrastrukturpruefung, OFFLINE, keine Production-Wirkung. Sie beweist NUR die
// Vertragspunkte des manuellen Ausfuehrungswegs (Trigger, Bestaetigungswort, Bindung, Rechte,
// Concurrency, Secret-Referenzen, direkter Runner-Aufruf, unveraenderte Grenzen). Die
// Fachgrenzen selbst prueft der Runner (scripts/verstehen-einmalig-test.js, bereits gruen);
// sie werden hier NICHT nachgebaut. Kein Netz, keine Datenbank, kein Modell.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const YML = fs.readFileSync(path.join(ROOT, ".github/workflows/verstehen-169-einmalig.yml"), "utf8");
const V = require("../lib/helmut/verstehen-einmalig");
const BEDIENWEG = require("../scripts/verstehen-einmalig-169");
const IDS = JSON.parse(fs.readFileSync(path.join(ROOT, "belege/verstehen-169-ids.json"), "utf8"));
const BUDGET = fs.readFileSync(path.join(ROOT, "lib/helmut/testkosten-budget.js"), "utf8");

const WORT = "EINMALIGER_VERSTEHENSLAUF_169_RUHDOKUMENTE_BESTAETIGT";
let passed = 0;
function check(name, bedingung) {
  assert.ok(bedingung, name);
  passed += 1;
}

// 1 · Trigger — NUR workflow_dispatch, kein automatischer Weg.
check("nur workflow_dispatch vorhanden", /^\s*workflow_dispatch:/m.test(YML));
check("kein push-Trigger", !/^\s*push:/m.test(YML));
check("kein pull_request-Trigger", !/^\s*pull_request(_target)?:/m.test(YML));
check("kein schedule-Trigger", !/^\s*schedule:/m.test(YML));
check("kein workflow_run-Trigger", !/^\s*workflow_run:/m.test(YML));
check("kein repository_dispatch-Trigger", !/^\s*repository_dispatch:/m.test(YML));
check("confirm_text ist Pflichtinput", /inputs:[\s\S]*?confirm_text:[\s\S]*?required: true/.test(YML));
check("quittungsschluessel ist optionales Input (kein Zwang fuer den alten Auftrag)",
  /inputs:[\s\S]*?quittungsschluessel:[\s\S]*?required: false/.test(YML));
check("quittungsschluessel-Input nennt die alte Kennung als verbotenen Wert",
  YML.includes("verstehen169-20260922-a"));

// 2 · Exaktes Bestaetigungswort — kein Prefix, kein Alternativwort.
check("Job bindet exaktes Bestaetigungswort", YML.includes(`inputs.confirm_text == '${WORT}'`));
check("Preflight prueft exaktes Bestaetigungswort", YML.includes(`[ \"\${CONFIRM_TEXT}\" = \"${WORT}\" ]`));
check("kein Prefix-Match (startsWith) im Workflow", !YML.includes("startsWith"));
check("Runner-Bestaetigungswort unveraendert", BEDIENWEG.BESTAETIGUNG === WORT);

// 3 · Bindung: Repository, main, workflow_dispatch, run_attempt 1.
check("Repository ernisch/helmut-pilot gebunden", YML.includes("github.repository == 'ernisch/helmut-pilot'"));
check("Branch main gebunden", YML.includes("github.ref == 'refs/heads/main'"));
check("Event workflow_dispatch gebunden", YML.includes("github.event_name == 'workflow_dispatch'"));
check("run_attempt 1 gebunden", YML.includes("github.run_attempt == 1"));
check("Preflight prueft GITHUB_REF main", YML.includes('[ "${GITHUB_REF}" = "refs/heads/main" ]'));
check("Preflight prueft GITHUB_RUN_ATTEMPT 1", YML.includes('[ "${GITHUB_RUN_ATTEMPT}" = "1" ]'));

// 4 · Minimale Berechtigungen + gepinnte Checkout-Actions ohne persistierte Credentials.
check("permissions: contents read", /permissions:[\s\S]*?contents: read/.test(YML));
check("checkout auf Repository-SHA gepinnt", YML.includes("actions/checkout@11d5960a326750d5838078e36cf38b85af677262"));
check("setup-node auf Repository-SHA gepinnt", YML.includes("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020"));
check("keine persistierten Git-Credentials", YML.includes("persist-credentials: false"));
check("Node 22 (Repository-Stand)", YML.includes('node-version: "22"'));

// 5 · Concurrency — bestehende globale Gruppe der kontrollierten Production-KI-Arbeit.
check("Concurrency-Gruppe helmut-500-kontrollierte-facharbeit", YML.includes("group: helmut-500-kontrollierte-facharbeit"));
check("cancel-in-progress: false", YML.includes("cancel-in-progress: false"));

// 6 · Timeout: nur geringfuegig ueber dem internen 35-min-Limit.
check("Job-Timeout 40 Minuten", YML.includes("timeout-minutes: 40"));

// 7 · Secret-Referenzen — Namen vorhanden, niemals Werte.
check("referenziert SUPABASE_URL", YML.includes("secrets.SUPABASE_URL"));
check("referenziert SUPABASE_SERVICE_ROLE_KEY", YML.includes("secrets.SUPABASE_SERVICE_ROLE_KEY"));
check("referenziert AZURE_OPENAI_KEY", YML.includes("secrets.AZURE_OPENAI_KEY"));
check("referenziert AZURE_OPENAI_ENDPOINT", YML.includes("secrets.AZURE_OPENAI_ENDPOINT"));
check("Azure Deployment ueber bestehendes Variable/Secret-Muster",
  YML.includes("vars.AZURE_OPENAI_DEPLOYMENT || secrets.AZURE_OPENAI_DEPLOYMENT"));
{
  const zeilen = YML.split("\n");
  const logAusgaben = zeilen.filter((z) => z.includes("echo") && (z.includes("secrets.") || z.includes("${{")));
  check("keine Secret-Werte werden geloggt", logAusgaben.length === 0);
}

// 8 · Direkter Runner-Aufruf — kein scripts/lokal.js, keine zweite Fachlogik.
check("startet den bestehenden Runner direkt", YML.includes("run: node scripts/verstehen-einmalig-169.js"));
check("kein scripts/lokal.js als Startweg", !/^\s*run:.*scripts\/lokal\.js/m.test(YML));
check("keine Inline-Fachlogik (kein require)", !YML.includes("require("));
check("keine Inline-Fachlogik (kein node -e)", !YML.includes("node -e"));
check("keine Resolver-Nachbildung", !/deriveVorgangId|clusterRawDocuments|sameVorgang/.test(YML));

// 9 · Auftragswerte des Runners — unveraenderte Grenzen, nur die fuenf erlaubten Env-Keys.
check("Commit ea84f26c im Workflow", YML.includes('HELMUT_VERSTEHEN_169_COMMIT: "ea84f26ccc380e22961335926e2d4e585cee2308"'));
check("gebundene Liste im Workflow", YML.includes('HELMUT_VERSTEHEN_169_LISTE: "belege/verstehen-169-ids.json"'));
check("kein Durchschnittspreis als harte Obergrenze im Workflow", !YML.includes("HELMUT_VERSTEHEN_169_PREIS_USD"));
check("SCHARF-Flag auf 1", YML.includes('HELMUT_VERSTEHEN_169_SCHARF: "1"'));
check("Bestaetigungswort kommt aus dem Input", YML.includes("HELMUT_VERSTEHEN_169_BESTAETIGT: ${{ inputs.confirm_text }}"));
check("Quittungskennung kommt ausschliesslich aus dem Input",
  YML.includes("HELMUT_VERSTEHEN_169_QUITTUNG: ${{ inputs.quittungsschluessel }}"));
{
  const erlaubt = new Set(["COMMIT", "LISTE", "SCHARF", "BESTAETIGT", "QUITTUNG"]);
  const alle = [...YML.matchAll(/HELMUT_VERSTEHEN_169_([A-Z0-9_]+)/g)].map((m) => m[1]);
  const fremde = alle.filter((k) => !erlaubt.has(k));
  check("keine fremden 169er-Env-Keys", fremde.length === 0 && alle.length > 0);
}
// Der Preflight erlaubt den neuen Schluessel NUR im engen Muster (einstelliger Suffix genuegt)
// und niemals die alte Kennung.
check("Preflight prueft das Kennungsmuster verstehen169-JJJJMMTT-suffix",
  YML.includes("grep -Eq '^verstehen169-[0-9]{8}-[a-z0-9]([a-z0-9-]*[a-z0-9])?$'"));
check("Preflight verbietet die alte Kennung",
  YML.includes('[ "${QUITTUNGSSCHLUESSEL}" != "verstehen169-20260922-a" ]'));
check("113 unveraendert (PINNED)", V.PINNED.maxModellaufrufe === 113);
check("0,80 USD unveraendert (PINNED)", V.PINNED.maxUsd === 0.8);
check("35 Minuten unveraendert (PINNED)", V.PINNED.maxMs === 35 * 60 * 1000);
check("169/122/Hash unveraendert (PINNED)",
  V.PINNED.dokumente === 169 && V.PINNED.cluster === 122
  && V.PINNED.idHash === "5f3878409cc9dbe742a3c9b465e54fff53b3e7622065f90c04915eb01ac2aed9");
check("Quittungsschluessel unveraendert", V.PINNED && V.QUITTUNG === "verstehen169-20260922-a");
check("Gebundene Liste traegt exakt denselben Commit und Hash",
  IDS.productionCommit === V.PINNED.commit && IDS.idHash === V.PINNED.idHash && IDS.documentCount === 169);

// 10 · 4-USD-Tagesriegel unveraendert, Workflow setzt keinen eigenen Riegelwert.
check("4-USD-Riegel unveraendert (LIMIT_MICRO_USD = 4000000)", /LIMIT_MICRO_USD\s*=\s*4000000/.test(BUDGET));
check("Workflow setzt keinen eigenen USD-Riegel", !/4000000|LIMIT_MICRO_USD|USD_RIEGEL|USD_LIMIT/.test(YML));

// 11 · Verpflichtende fail-closed-Laufwerte des Auftrags.
for (const wert of [
  'HELMUT_V3_STORE: "1"',
  'HELMUT_STORAGE_BACKEND: "supabase"',
  'HELMUT_SUPABASE_STORE_ID: "main"',
  'HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth"',
  'VERCEL_ENV: "production"',
  'HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt"',
  'HELMUT_MAX_LLM_CALLS_PER_DAY: "2416"',
  'HELMUT_LLM_RESERVE_UNDERSTANDING: "702"',
  'HELMUT_TESTLAUF_VORRANG_REAL: "200"',
  'HELMUT_ANBIETER_STEUERUNG: "on"',
  'HELMUT_ANBIETER_AZURE_MINUTE: "20"',
  'HELMUT_ANBIETER_AZURE_TAG: "0"',
  'HELMUT_LLM_BUDGET_FAIL_CLOSED: "1"',
  'HELMUT_VERSTEHEN_CAS: "on"',
  'HELMUT_UNDERSTANDING_LOCK: "on"'
]) {
  check(`Laufwert gesetzt: ${wert}`, YML.includes(wert));
}

console.log(`verstehen-169-workflow-test: ${passed} von ${passed} Pruefungen gruen.`);
