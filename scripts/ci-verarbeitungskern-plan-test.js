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
  for (const file of [...C.CI_FILES, ...C.DOC_FILES, C.BROWSER_FILE, ...Object.keys(C.SQL_BLOBS)]) reviewedTree.set(file, entry("a"));
  const headTree = new Map([...reviewedTree].map(([file,value]) => [file, { ...value }]));
  for (const [file,blob] of Object.entries(C.SQL_BLOBS)) headTree.set(file, { ...entry("a"), oid: blob });
  return { expectedCommit: oid("f"), workflowSha: oid("f"), checkedOutHead: oid("f"),
    event: "workflow_dispatch", repository: C.REPOSITORY,
    pr: { number: C.PR, state: "open", base: { sha: C.BASE, ref: "main", repo: { full_name: C.REPOSITORY } },
      head: { sha: oid("f"), ref: "codex/verarbeitungskern-100-20261113", repo: { full_name: C.REPOSITORY } } },
    reviewedTree, headTree, previousTree: new Map([...reviewedTree].map(([file,value]) => [file, { ...value }])),
    run: { id: C.PREVIOUS_RUN, head_sha: C.PREVIOUS, event: "workflow_dispatch", path: ".github/workflows/ci.yml",
      repository: { full_name: C.REPOSITORY }, run_attempt: 1, status: "completed", conclusion: "success" },
    jobs: { total_count: 3, jobs: [{ id: 132084761727, run_id: C.PREVIOUS_RUN,
      name: "Browser-/Mobile-Smoke (Chromium)", status: "completed", conclusion: "success",
      steps: [{ number: 9, name: "Gespeichertes Tagespaket - neuer Desktop-/Mobilweg", status: "completed", conclusion: "success" }] },
      { id: 132084761049 }, { id: 132084763627 }] } };
}
let count = 0;
const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7).split(",");
const nachtrag = process.argv.includes("--nachtrag");
function test(name, fn) {
  if (nachtrag && !name.startsWith("Nachtrag:")) return;
  if (only && !only.some(part => name.includes(part))) return;
  fn(); count++; console.log("PASS " + name);
}
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
    "Begrenzter SQL-Nachtrag - drei neue Production-Kommentarfaelle",
    "Wiederverwendete Kernnachweise sichtbar abgrenzen"
  ]);
  A.match(workflow, /image: \$\{\{ inputs\.mode != 'verarbeitungskern' && 'postgres:17' \|\| '' \}\}/);
});
test("echter Browserjob prueft den gebundenen alten Paketbeleg ohne erneuten Browserlauf", () => {
  A.deepEqual(activeRunNames("browser-smoke", "synthetic-resource-diagnostic", C.validate(fixture())), [
    "Prüfplan aus geänderten Dateien", "Gespeichertes Tagespaket - gebundenen Browserbeleg wiederverwenden"
  ]);
  A.match(workflow, /In diesem Job kein Chromium installiert oder gestartet/);
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
  A.match(scoped, /Browser: 29\/29 aus CI43483196284 auf f7f3d6eb WIEDERVERWENDET, NICHT ERNEUT AUSGEFUEHRT/);
});

// Ausschliesslich dieser neue Nachtrag wird erneut ausgefuehrt. Die historischen
// 15 Gruppen bleiben erhalten; der erfolgreiche CI-Vorbeleg wird live geprueft.
test("Nachtrag: exakt zwei SQL-Blobs und erfolgreicher Browser-Vorbeleg sind zulaessig", () => {
  const f = fixture(), p = C.validate(f);
  A.equal(Object.keys(C.SQL_BLOBS).length, 2);
  A.equal(p.reused.run, C.PREVIOUS_RUN); A.equal(p.reused.head, C.PREVIOUS);
  A.match(p.reused.status, /NICHT ERNEUT/);
  for (const key of ["standard", "core", "area", "database", "browser", "syntax", "npm"]) A.equal(p[key], false);
});
test("Nachtrag: veraenderter fehlender oder ausfuehrbarer SQL-Blob bleibt gesperrt", () => {
  for (const file of Object.keys(C.SQL_BLOBS)) {
    denied(f => { f.headTree.get(file).oid = oid("f"); }, /sql-nachtrag/);
    denied(f => { f.headTree.delete(file); }, /sql-nachtrag|anwendungscode/);
    denied(f => { f.headTree.get(file).mode = "100755"; }, /sql-nachtrag/);
  }
  denied(f => { f.headTree.set("supabase/migrations/anderer-nachtrag.sql", entry("f")); });
});
test("Nachtrag: Browserprogramm und alle uebrigen Laufzeitdateien bleiben exakt gebunden", () => {
  denied(f => { f.headTree.get(C.BROWSER_FILE).oid = oid("f"); }, /browserprogramm/);
  denied(f => { f.headTree.delete(C.BROWSER_FILE); });
  denied(f => { f.headTree.get("server.js").oid = oid("f"); });
  const f = fixture(); f.headTree.get("server.js").oid = oid("f");
  A.throws(() => C.validateReuse(f), /seit-ci-lauf-abweichend/);
});
test("Nachtrag: fehlender fremder laufender oder erfolgloser CI-Vorbeleg wird nicht wiederverwendet", () => {
  for (const change of [f => { delete f.run; }, f => { f.run.id++; },
    f => { f.run.head_sha = oid("f"); }, f => { f.run.event = "push"; },
    f => { f.run.path = ".github/workflows/anderer.yml"; }, f => { f.run.run_attempt = 2; },
    f => { f.run.repository.full_name = "fremd/repo"; }, f => { f.run.status = "in_progress"; },
    f => { f.run.conclusion = "failure"; }]) {
    const f = fixture(); change(f); A.throws(() => C.validateReuse(f), /alter-ci-lauf/);
  }
});
test("Nachtrag: wirklicher erfolgreicher Browserjob und Paketpruefschritt sind Pflicht", () => {
  for (const change of [f => { delete f.jobs; }, f => { f.jobs.total_count = 4; },
    f => { f.jobs.jobs[0].id++; }, f => { f.jobs.jobs[0].run_id++; },
    f => { f.jobs.jobs[0].name = "falscher Browserjob"; },
    f => { f.jobs.jobs[0].conclusion = "skipped"; }, f => { f.jobs.jobs[0].status = "in_progress"; },
    f => { f.jobs.jobs[0].steps = []; }, f => { f.jobs.jobs[0].steps[0].number++; },
    f => { f.jobs.jobs[0].steps[0].name = "anderer Test"; },
    f => { f.jobs.jobs[0].steps[0].status = "in_progress"; },
    f => { f.jobs.jobs[0].steps[0].conclusion = "skipped"; }]) {
    const f = fixture(); change(f); A.throws(() => C.validateReuse(f), /alte-ci-jobs|alter-browserbeleg/);
  }
});
test("Nachtrag: echte Workflowauswahl startet nur neue Policy- und drei neue SQL-Guardfaelle", () => {
  const p = C.validate(fixture());
  A.deepEqual(activeRunNames("offline-suite", "browser-smoke", p), [
    "Prüfplan aus geänderten Dateien", "Begrenzte Kernabnahme - neue CI-Auswahl und Negativfaelle",
    "Begrenzter SQL-Nachtrag - drei neue Production-Kommentarfaelle", "Wiederverwendete Kernnachweise sichtbar abgrenzen"
  ]);
  A.deepEqual(activeRunNames("browser-smoke", "synthetic-resource-diagnostic", p), [
    "Prüfplan aus geänderten Dateien", "Gespeichertes Tagespaket - gebundenen Browserbeleg wiederverwenden"
  ]);
  A.match(workflow, /ci-verarbeitungskern-plan-test\.js --nachtrag/);
  A.match(workflow, /verarbeitungskern-claim-datenbank-test\.js --production-kommentarstand/);
  A.match(workflow, /docker run -d --network none/);
  A.match(workflow, /actions: read/);
  A.match(workflow, /WIEDERVERWENDET, NICHT ERNEUT AUSGEFUEHRT/);
  A.match(workflow, /In diesem Job kein Chromium installiert oder gestartet/);
});
test("Nachtrag: geaenderte CI- und SQL-Testprogramme sind syntaktisch gueltig", () => {
  for (const file of [...C.CI_FILES, ...Object.keys(C.SQL_BLOBS)].filter(file => file.endsWith(".js")))
    new vm.Script(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
});
A.ok(count > 0, "Keine ausgewaehlte Pruefung darf als Erfolg gelten");
console.log(`${count}/${count} neue begrenzte CI-Auswahlpruefungen bestanden; keine alten Fach-/Mengenlaeufe.`);
