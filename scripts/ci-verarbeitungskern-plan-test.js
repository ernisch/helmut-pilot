"use strict";

// Nur neue CI-Auswahl, kleine Gegenbeispiele und ihre echten Workflow-Grenzen.
// Keine alten Fach-/Datenbank-/Browser-/Mengenpruefungen werden hier gestartet.
const A = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const C = require("./ci-verarbeitungskern-plan"), P = require("./ci-pruefplan");
const root = path.join(__dirname, "..");
const oid = char => char.repeat(40), entry = char => ({ mode: "100644", type: "blob", oid: oid(char) });
function fixture() {
  const reviewedTree = new Map([["server.js", entry("a")], ["package.json", entry("b")],
    ["scripts/lokal.js", entry("c")], ["vercel.json", entry("d")], ["docs/betrieb/native-witness-abi.inert.sql", entry("e")]]);
  for (const file of [...C.CI_FILES, ...C.DOC_FILES]) reviewedTree.set(file, entry("a"));
  return { expectedCommit: oid("f"), workflowSha: oid("f"), checkedOutHead: oid("f"),
    event: "workflow_dispatch", repository: C.REPOSITORY,
    pr: { number: C.PR, state: "open", base: { sha: C.BASE, ref: "main", repo: { full_name: C.REPOSITORY } },
      head: { sha: oid("f"), ref: "codex/verarbeitungskern-100-20261113", repo: { full_name: C.REPOSITORY } } },
    reviewedTree, headTree: new Map([...reviewedTree].map(([file,value]) => [file, { ...value }])) };
}
let count = 0;
const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7).split(",");
function test(name, fn) { if (only && !only.some(part => name.includes(part))) return; fn(); count++; console.log("PASS " + name); }
function denied(change, pattern = /verarbeitungskern-ci:/) { const f = fixture(); change(f); A.throws(() => C.validate(f), pattern); }

test("expliziter passender PR-Kopf erlaubt nur neue begrenzte Pruefungen", () => {
  const f = fixture(); f.headTree.set("scripts/ci-pruefplan.js", entry("b"));
  const p = C.validate(f); A.equal(p.verarbeitungskern, true);
  for (const key of ["standard", "core", "area", "database", "browser", "syntax", "npm"]) A.equal(p[key], false);
  A.match(p.reused.status, /NICHT ERNEUT/); A.equal(p.source.reviewed, C.REVIEWED);
});
test("kein automatischer Sonderweg durch PR-Ereignis oder Branchname", () => {
  denied(f => { f.event = "pull_request"; }); denied(f => { f.event = "push"; }); denied(f => { f.repository = "fremd/repo"; });
});
test("Anfrage Workflow Checkout und aktueller PR-Kopf muessen identisch sein", () => {
  for (const key of ["expectedCommit", "workflowSha", "checkedOutHead"]) denied(f => { f[key] = oid("1"); });
  denied(f => { f.expectedCommit = ""; }); denied(f => { f.pr.head.sha = oid("1"); });
});
test("anderer PR Basis Fork oder geschlossener PR bleibt gesperrt", () => {
  denied(f => { f.pr.number++; }); denied(f => { f.pr.base.sha = oid("1"); }); denied(f => { f.pr.state = "closed"; });
  denied(f => { f.pr.head.repo.full_name = "fremd/repo"; }); denied(f => { f.pr.base.ref = "andere-basis"; });
  denied(f => { f.pr.head.ref = "anderer-branch"; });
});
test("geaenderter Anwendungscode oder Abhaengigkeit kann begrenzten Modus nicht nutzen", () => {
  for (const file of ["server.js", "package.json", "scripts/lokal.js", "vercel.json"]) denied(f => { f.headTree.set(file, entry("f")); });
});
test("neue geloeschte umbenannte oder umchmodete Laufzeitdateien werden erkannt", () => {
  denied(f => { f.headTree.set("lib/helmut/neuer-code.js", entry("f")); });
  denied(f => { f.headTree.delete("server.js"); });
  denied(f => { f.headTree.set("server-neu.js", f.headTree.get("server.js")); f.headTree.delete("server.js"); });
  denied(f => { f.headTree.get("server.js").mode = "100755"; });
});
test("ausfuehrbare SQL unter docs und unbekannte CI-Dateien sind keine Dokumentausnahme", () => {
  denied(f => { f.headTree.set("docs/betrieb/native-witness-abi.inert.sql", entry("f")); });
  denied(f => { f.headTree.set(".github/workflows/neuer-workflow.yml", entry("f")); });
  denied(f => { f.headTree.set("scripts/neuer-ci-guard.js", entry("f")); });
});
test("fehlende oder verlinkte CI-Programme bleiben gesperrt", () => {
  for (const file of C.CI_FILES) {
    denied(f => { f.headTree.delete(file); });
    denied(f => { f.headTree.get(file).mode = "120000"; });
  }
});
test("unvollstaendiger expliziter CLI-Auftrag faellt nie auf breite Pruefung zurueck", () => {
  for (const argv of [["--verarbeitungskern-metadata"], ["--expected-commit"],
    ["--verarbeitungskern-metadata", "datei"], ["--expected-commit", oid("f")],
    ["--verarbeitungskern-metadata", "datei", "--expected-commit", oid("f"), "--files", "server.js"]]) {
    A.throws(() => P.validateRequestArgs(P.parseArgs(argv)), /request-unvollstaendig/);
  }
  A.equal(P.validateRequestArgs(P.parseArgs([])), false);
});
test("konservative Standardauswahl bleibt fuer andere Aenderungen erhalten", () => {
  for (const files of [[], ["scripts/ci-pruefplan.js"], ["supabase/migrations/neue.sql"], ["lib/helmut/unbekannt.js"]])
    A.equal(P.plan(files).standard, true);
  A.equal(P.plan(["docs/CURRENT_STATE.md"]).mode, "docs");
});

const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
function activeRunNames(job, next, plan) {
  const block = workflow.slice(workflow.indexOf("  " + job + ":"), workflow.indexOf("  " + next + ":"));
  return block.split(/(?=^      - )/m).filter(s => /^      - name:/m.test(s) && /^        run:/m.test(s)).filter(s => {
    const cond = /^        if: (.+)$/m.exec(s)?.[1];
    if (!cond) return true;
    const expression = cond.replace(/steps\.plan\.outputs\.([a-z]+)/g, (_,key) => JSON.stringify(String(Boolean(plan[key]))));
    return vm.runInNewContext(expression, { always: () => true }, { timeout: 50 }) === true;
  }).map(s => /^      - name: (.+)$/m.exec(s)[1]);
}
test("echter Offlinejob startet im begrenzten Modus keine alte Standard- Bereichs- oder Mengenpruefung", () => {
  A.deepEqual(activeRunNames("offline-suite", "browser-smoke", C.validate(fixture())), [
    "Prüfplan aus geänderten Dateien", "Begrenzte Kernabnahme - neue CI-Auswahl und Negativfaelle",
    "Wiederverwendete Kernnachweise sichtbar abgrenzen"
  ]);
  A.match(workflow, /image: \$\{\{ inputs\.mode != 'verarbeitungskern' && 'postgres:17' \|\| '' \}\}/);
});
test("echter Browserjob startet ausschliesslich den neuen Paketweg mit benoetigten Werkzeugen", () => {
  A.deepEqual(activeRunNames("browser-smoke", "synthetic-resource-diagnostic", C.validate(fixture())), [
    "Prüfplan aus geänderten Dateien", "Abhängigkeiten installieren (aus package-lock.json)",
    "Playwright + Chromium installieren", "Gespeichertes Tagespaket - neuer Desktop-/Mobilweg"
  ]);
  A.match(workflow, /run: node scripts\/lokal\.js scripts\/browser-smoke-test\.js --tagespaket/);
});
test("unbekannter manueller Modus stoppt beide Planer und Pflichtnamen bleiben erhalten", () => {
  A.equal((workflow.match(/Unbekannter manueller CI-Modus: gestoppt/g) || []).length, 2);
  A.equal((workflow.match(/--verarbeitungskern-metadata/g) || []).length, 2);
  A.match(workflow, /name: Syntax \+ Offline-Suiten/); A.match(workflow, /name: Browser-\/Mobile-Smoke \(Chromium\)/);
  A.match(workflow, /pull-requests: read/);
  // Der unveraenderte historische Mockjob besitzt eigene Schreibrechte. Die
  // beiden hier ausgewaehlten Pflichtjobs erhalten ausschliesslich Leserechte.
  const readOnlyScope = workflow.slice(0, workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal(/pull-requests: write|checks: write/.test(readOnlyScope), false, "Schreibrecht in der begrenzten Auswahl");
});
test("geaenderte CI-JavaScriptprogramme sind syntaktisch gueltig", () => {
  for (const file of C.CI_FILES.filter(f => f.endsWith(".js"))) new vm.Script(fs.readFileSync(path.join(root,file), "utf8"), { filename: file });
});
test("Metadaten-Token bleibt im begrenzten Modus nicht im Checkout und kein Browsererfolg wird vorweggenommen", () => {
  const scoped = workflow.slice(0, workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal((scoped.match(/persist-credentials: \$\{\{ inputs\.mode != 'verarbeitungskern' \}\}/g) || []).length, 2);
  A.match(scoped, /Browser-Pflichtjob vorgesehen; Ergebnis dort/);
});
console.log(`${count}/${count} neue begrenzte CI-Auswahlpruefungen bestanden; keine alten Fach-/Mengenlaeufe.`);
