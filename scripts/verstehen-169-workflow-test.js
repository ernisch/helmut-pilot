"use strict";

// Helmut — Statischer Vertrag fuer die ZWEI GETRENNTEN 169er-Ausfuehrungswege
// =============================================================================================
//   * `.github/workflows/verstehen-169-einmalig.yml` — der SCHARFE Lauf (SCHARF=1, mit
//     Bestaetigungswort und Quittungskennung); Abschnitte 1–11 unten.
//   * `.github/workflows/verstehen-169-plan.yml` — der REIN LESENDE Planlauf; Abschnitt 12 unten.
// Reine Workflow-Infrastrukturpruefung, OFFLINE, keine Production-Wirkung. Sie beweist NUR die
// Vertragspunkte beider manueller Ausfuehrungswege (Trigger, Bestaetigungswort, Bindung, Rechte,
// Concurrency, Secret-Referenzen, Trennung von Plan und Scharf, direkter Runner-Aufruf,
// unveraenderte Grenzen). Die Fachgrenzen selbst prueft der Runner
// (scripts/verstehen-einmalig-test.js, bereits gruen); sie werden hier NICHT nachgebaut.
// Kein Netz, keine Datenbank, kein Modell.

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
check("runtime_commit ist Pflichtinput (der Lauf braucht einen freigegebenen Code-Stand)",
  /inputs:[\s\S]*?runtime_commit:[\s\S]*?required: true/.test(YML));
check("runtime_commit-Input grenzt sich ausdruecklich vom Snapshot-Commit ab",
  /runtime_commit:[\s\S]*?NICHT der Dokument-Snapshot-Commit/.test(YML));

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
check("Checkout bindet GENAU den freigegebenen runtime_commit",
  YML.includes("ref: ${{ inputs.runtime_commit }}"));

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

// 9 · Auftragswerte des Runners — unveraenderte Grenzen, nur die sechs erlaubten Env-Keys.
check("Dokument-Snapshot-Commit ea84f26c im Workflow (unveraendert)", YML.includes('HELMUT_VERSTEHEN_169_COMMIT: "ea84f26ccc380e22961335926e2d4e585cee2308"'));
check("gebundene Liste im Workflow", YML.includes('HELMUT_VERSTEHEN_169_LISTE: "belege/verstehen-169-ids.json"'));
check("kein Durchschnittspreis als harte Obergrenze im Workflow", !YML.includes("HELMUT_VERSTEHEN_169_PREIS_USD"));
check("SCHARF-Flag auf 1", YML.includes('HELMUT_VERSTEHEN_169_SCHARF: "1"'));
check("Bestaetigungswort kommt aus dem Input", YML.includes("HELMUT_VERSTEHEN_169_BESTAETIGT: ${{ inputs.confirm_text }}"));
check("Quittungskennung kommt ausschliesslich aus dem Input",
  YML.includes("HELMUT_VERSTEHEN_169_QUITTUNG: ${{ inputs.quittungsschluessel }}"));
{
  const erlaubt = new Set(["COMMIT", "RUNTIME_COMMIT", "LISTE", "SCHARF", "BESTAETIGT", "QUITTUNG"]);
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

// 9a · Runtime-Commit-Bindung — der Lauf prueft den ECHTEN Checkout, nicht nur einen String.
check("Preflight prueft den Runtime-Commit als vollen Git-SHA",
  YML.includes("grep -Eq '^[0-9a-f]{40}$'"));
check("Preflight vergleicht den echten Checkout mit dem Runtime-Commit",
  YML.includes("git rev-parse HEAD"));
check("Preflight bricht bei Abweichung ab",
  YML.includes('[ "${ECHTER_COMMIT}" = "${RUNTIME_COMMIT}" ]'));
check("Runtime-Commit des Runners kommt ausschliesslich aus dem Input",
  YML.includes("HELMUT_VERSTEHEN_169_RUNTIME_COMMIT: ${{ inputs.runtime_commit }}"));
check("der Runtime-Commit wird NICHT im Workflow hart kodiert",
  !/HELMUT_VERSTEHEN_169_RUNTIME_COMMIT: "[0-9a-f]{40}"/.test(YML));
check("Snapshot-Commit und Runtime-Commit sind zwei getrennte Env-Werte",
  YML.includes('HELMUT_VERSTEHEN_169_COMMIT: "ea84f26ccc380e22961335926e2d4e585cee2308"')
  && YML.includes("HELMUT_VERSTEHEN_169_RUNTIME_COMMIT: ${{ inputs.runtime_commit }}"));
check("der Kern erfindet keinen Runtime-Commit (keine hart kodierte 40-Hex-Bindung)",
  !/runtimeCommit\s*=\s*"[0-9a-f]{40}"/.test(fs.readFileSync(path.join(ROOT, "lib/helmut/verstehen-einmalig.js"), "utf8")));
check("der Bedienweg prueft den Runtime-Commit gegen den echten Checkout (reine Funktion)",
  typeof BEDIENWEG.pruefeRuntimeCommit === "function" && typeof BEDIENWEG.echterCommit === "function");
{
  const echt = BEDIENWEG.echterCommit();
  check("der Bedienweg kann den echten Checkout-Commit lesen",
    echt === null || /^[0-9a-f]{40}$/.test(echt));
  check("ohne Runtime-Commit bricht der scharfe Lauf fail closed ab",
    BEDIENWEG.pruefeRuntimeCommit("", echt, true).grund === "verstehen-runtime-commit-fehlt");
  check("ein falscher Runtime-Commit bricht fail closed ab",
    BEDIENWEG.pruefeRuntimeCommit("0".repeat(40), echt, true).grund === "verstehen-runtime-commit-abweichend");
  check("ein unlesbarer Checkout ist nicht pruefbar (fail closed)",
    BEDIENWEG.pruefeRuntimeCommit("0".repeat(40), null, true).grund === "verstehen-runtime-commit-nicht-pruefbar");
}

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

// ── 12 · Der GETRENNTE rein lesende PLAN-Workflow ──────────────────────────────────────────
// Zwei strikt getrennte Bedienwege, bewusst OHNE gemeinsame Umschaltung. Dieser Abschnitt beweist
// statisch, dass der Planlauf den BESTEHENDEN Runner ohne SCHARF aufruft, Production nur lesend
// anspricht und technisch keinen scharfen Lauf ausloesen kann (die Scharf-Variablen werden gar
// nicht gesetzt; der Laufschritt bricht zusaetzlich ab, falls sie doch gesetzt waeren).
const PLAN = fs.readFileSync(path.join(ROOT, ".github/workflows/verstehen-169-plan.yml"), "utf8");

check("Plan-Workflow existiert und ist nicht leer", PLAN.trim().length > 0);
check("Plan: nur workflow_dispatch", /^\s*workflow_dispatch:/m.test(PLAN));
check("Plan: kein push-Trigger", !/^\s*push:/m.test(PLAN));
check("Plan: kein pull_request-Trigger", !/^\s*pull_request(_target)?:/m.test(PLAN));
check("Plan: kein schedule-Trigger", !/^\s*schedule:/m.test(PLAN));
check("Plan: kein workflow_run-Trigger", !/^\s*workflow_run:/m.test(PLAN));
check("Plan: kein repository_dispatch-Trigger", !/^\s*repository_dispatch:/m.test(PLAN));
check("Plan: Repository gebunden", PLAN.includes("github.repository == 'ernisch/helmut-pilot'"));
check("Plan: Branch main gebunden", PLAN.includes("github.ref == 'refs/heads/main'"));
check("Plan: Event workflow_dispatch gebunden", PLAN.includes("github.event_name == 'workflow_dispatch'"));
check("Plan: run_attempt 1 gebunden", PLAN.includes("github.run_attempt == 1"));
check("Plan: Preflight prueft GITHUB_REF main", PLAN.includes('[ "${GITHUB_REF}" = "refs/heads/main" ]'));
check("Plan: Preflight prueft GITHUB_RUN_ATTEMPT 1", PLAN.includes('[ "${GITHUB_RUN_ATTEMPT}" = "1" ]'));
check("Plan: contents read", /permissions:[\s\S]*?contents: read/.test(PLAN));
check("Plan: checkout auf Repository-SHA gepinnt", PLAN.includes("actions/checkout@11d5960a326750d5838078e36cf38b85af677262"));
check("Plan: setup-node auf Repository-SHA gepinnt", PLAN.includes("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020"));
check("Plan: keine persistierten Git-Credentials", PLAN.includes("persist-credentials: false"));
check("Plan: Concurrency-Gruppe helmut-500-kontrollierte-facharbeit", PLAN.includes("group: helmut-500-kontrollierte-facharbeit"));
check("Plan: cancel-in-progress: false", PLAN.includes("cancel-in-progress: false"));
check("Plan: Job-Timeout gesetzt", /^\s*timeout-minutes:\s*\d+\s*$/m.test(PLAN));
check("Plan: runtime_commit ist Pflichtinput", /inputs:[\s\S]*?runtime_commit:[\s\S]*?required: true/.test(PLAN));
check("Plan: Checkout bindet GENAU den runtime_commit", PLAN.includes("ref: ${{ inputs.runtime_commit }}"));
check("Plan: Preflight prueft den vollen Git-SHA", PLAN.includes("grep -Eq '^[0-9a-f]{40}$'"));
check("Plan: Preflight vergleicht den echten Checkout", PLAN.includes("git rev-parse HEAD"));
check("Plan: Preflight bricht bei Abweichung ab", PLAN.includes('[ "${ECHTER_COMMIT}" = "${RUNTIME_COMMIT}" ]'));

// 12c · Bindung an den DISPATCH: nur der main-Commit, auf dem der Workflow gestartet wurde.
// Ohne diese Bindung koennte JEDER syntaktisch gueltige 40-stellige SHA — auch ein aelterer oder
// fremder Repository-Commit — ausgecheckt und mit den Production-Lesekennungen ausgefuehrt werden.
check("Plan: Job-if bindet runtime_commit an den main-Dispatch-SHA",
  PLAN.includes("inputs.runtime_commit == github.sha"));
check("Plan: Dispatch-SHA stammt aus dem echten Workflow-Kontext",
  PLAN.includes("DISPATCH_SHA: ${{ github.sha }}"));
check("Plan: Preflight prueft runtime_commit gegen den Dispatch-SHA",
  PLAN.includes('[ "${RUNTIME_COMMIT}" = "${DISPATCH_SHA}" ]'));
check("Plan: fehlender Dispatch-SHA bricht ab",
  PLAN.includes('[ -n "${DISPATCH_SHA:-}" ] || fail "Dispatch-SHA fehlt"'));
check("Plan: dreiseitige Bindung vollstaendig (angefordert = Dispatch = Checkout)", (() => {
  const dispatcher = PLAN.includes("inputs.runtime_commit == github.sha");
  const preflight = PLAN.includes('[ "${RUNTIME_COMMIT}" = "${DISPATCH_SHA}" ]');
  const checkout = PLAN.includes('[ "${ECHTER_COMMIT}" = "${RUNTIME_COMMIT}" ]');
  return dispatcher && preflight && checkout;
})());
check("Plan: die Dispatch-Bindung ist VOR dem Runner-Aufruf geprueft", (() => {
  // Eindeutige Anker: der Abgleich im Preflight, danach der Laufschritt, darin der Aufruf.
  // (Der Kopfkommentar nennt den Runner ebenfalls — deshalb NICHT indexOf auf den Aufruf.)
  const bindung = PLAN.indexOf('[ "${RUNTIME_COMMIT}" = "${DISPATCH_SHA}" ]');
  const schritt = PLAN.indexOf("- name: Rein lesender 169er Planlauf");
  const aufruf = PLAN.lastIndexOf("node scripts/verstehen-einmalig-169.js");
  return bindung > 0 && schritt > bindung && aufruf > schritt;
})());
check("Plan: kein beliebiger SHA als alleinige Zulassung (Formatpruefung genuegt nicht)", (() => {
  // Die reine Formatpruefung bleibt, ist aber NICHT die Zulassung: die Zulassung ist der
  // Dispatch-Vergleich. Beide muessen vorhanden sein.
  const format = PLAN.includes("grep -Eq '^[0-9a-f]{40}$'");
  const zugelassen = PLAN.includes('[ "${RUNTIME_COMMIT}" = "${DISPATCH_SHA}" ]');
  return format && zugelassen;
})());
check("Plan: Dokument-Snapshot-Commit unveraendert",
  PLAN.includes('HELMUT_VERSTEHEN_169_COMMIT: "ea84f26ccc380e22961335926e2d4e585cee2308"'));
check("Plan: gebundene Liste unveraendert",
  PLAN.includes('HELMUT_VERSTEHEN_169_LISTE: "belege/verstehen-169-ids.json"'));
check("Plan: Runtime-Commit kommt ausschliesslich aus dem Input",
  PLAN.includes("HELMUT_VERSTEHEN_169_RUNTIME_COMMIT: ${{ inputs.runtime_commit }}"));
check("Plan: Production-Lesezugang ueber die bestehenden Supabase-Secrets",
  PLAN.includes("SUPABASE_URL: ${{ secrets.SUPABASE_URL }}")
  && PLAN.includes("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"));
check("Plan: Production-Speicher korrekt gesetzt",
  PLAN.includes('HELMUT_V3_STORE: "1"') && PLAN.includes('HELMUT_STORAGE_BACKEND: "supabase"')
  && PLAN.includes('HELMUT_SUPABASE_STORE_ID: "main"'));
check("Plan: ruft den BESTEHENDEN Runner direkt", PLAN.includes("node scripts/verstehen-einmalig-169.js"));
check("Plan: kein scripts/lokal.js als Startweg", !/^\s*run:.*scripts\/lokal\.js/m.test(PLAN));
check("Plan: keine Inline-Fachlogik (kein require/node -e)",
  !PLAN.includes("require(") && !PLAN.includes("node -e"));
check("Plan: keine Resolution-/Cluster-Nachbildung",
  !/deriveVorgangId|clusterRawDocuments|sameVorgang/.test(PLAN));

// 12a · Die Trennung ist STRUKTURELL, nicht nur kommentiert: der Planlauf setzt KEINE
// Scharf-Variable, KEIN Bestaetigungswort, KEINE Quittung und KEINE Modellzugangsdaten.
{
  const zuweisungen = PLAN.split("\n")
    .map((z) => (z.match(/^\s*([A-Za-z0-9_-]+)\s*:/) || [])[1])
    .filter(Boolean);
  const verboten = zuweisungen.filter((k) =>
    /^HELMUT_VERSTEHEN_169_(SCHARF|BESTAETIGT|QUITTUNG)$/.test(k));
  check("Plan: setzt keine Scharf-/Bestaetigungs-/Quittungsvariable", verboten.length === 0);
  const keys169 = zuweisungen.filter((k) => k.startsWith("HELMUT_VERSTEHEN_169_"));
  check("Plan: setzt genau die drei erlaubten 169er-Keys (Snapshot, Runtime, Liste)",
    keys169.length === 3
    && ["HELMUT_VERSTEHEN_169_COMMIT", "HELMUT_VERSTEHEN_169_RUNTIME_COMMIT",
      "HELMUT_VERSTEHEN_169_LISTE"].every((k) => keys169.includes(k)));
}
check("Plan: keine Azure-/Modell-Secrets",
  !/secrets\.(AZURE_[A-Z_]+|OPENAI[A-Z_]*)/.test(PLAN)
  && !/AZURE_OPENAI_DEPLOYMENT|vars\.AZURE_OPENAI/.test(PLAN));
check("Plan: keine Quittungskennung", !/verstehen169-\d{8}-[a-z0-9-]+/.test(PLAN));
check("Plan: keine Profil-/Lock-/CAS-/Budget-/Env-Schreibfreigaben",
  !/HELMUT_ANBIETER|HELMUT_LLM_|HELMUT_MAX_LLM_CALLS_PER_DAY|HELMUT_TESTLAUF|HELMUT_VERSTEHEN_CAS|HELMUT_UNDERSTANDING_LOCK|VERCEL_ENV|HELMUT_SUPABASE_AUTH_STORE_ID/.test(PLAN));
check("Plan: harte Sperre gegen SCHARF im Laufschritt",
  PLAN.includes('echo "STOPP: HELMUT_VERSTEHEN_169_SCHARF ist in diesem Workflow nicht zulaessig."'));
check("Plan: keine mode-Umschaltung als Eingabe", !/^\s*mode:\s*$/m.test(PLAN));
check("Plan: keine Secret-Werte werden geloggt",
  PLAN.split("\n").filter((z) => z.includes("echo") && (z.includes("secrets.") || z.includes("${{"))).length === 0);
check("Plan: kein Prefix-Match (startsWith)", !PLAN.includes("startsWith"));
check("Plan: keine 169er-Fachwerte dupliziert (Bound bleibt im Runner)",
  !/maxModellaufrufe|0\.8\s*USD|maxUsd|idHash|5f3878409cc9dbe742a3c9b465e54fff53b3e7622065f90c04915eb01ac2aed9/.test(PLAN));

// 12b · Beide Wege bleiben getrennt: der scharfe Workflow behaelt seine Scharf-Variable.
// Geprueft werden ECHTE Zuweisungen — Kommentare duerfen den fremden Wert erklaeren.
check("Scharf und Plan sind getrennt (SCHARF nur im scharfen Workflow gesetzt)", (() => {
  const planZuw = PLAN.split("\n")
    .map((z) => (z.match(/^\s*([A-Za-z0-9_-]+)\s*:/) || [])[1])
    .filter(Boolean);
  return YML.includes('HELMUT_VERSTEHEN_169_SCHARF: "1"')
    && !planZuw.includes("HELMUT_VERSTEHEN_169_SCHARF");
})());

console.log(`verstehen-169-workflow-test: ${passed} von ${passed} Pruefungen gruen.`);
