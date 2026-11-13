"use strict";

// Neue kleine Negativfaelle fuer genau diesen PR-Pruefvertrag; keine alten
// Fach-, Browser-, Datenbank- oder Mengenpruefungen werden hier gestartet.
const A = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const C = require("./ci-lieferreparatur-plan");
const args = process.argv.slice(2), nachtrag = args.length === 1 && args[0] === "--nur-nachtrag";
A.ok(args.length === 0 || nachtrag, "Unbekannte Auswahl darf keine Pruefungen auslassen");
const oid = char => char.repeat(40), row = char => ({ mode: "100644", type: "blob", oid: oid(char) });
function fixture() {
  const baseTree = new Map([["server.js", row("a")], ["package-lock.json", row("b")],
    ["scripts/lokal.js", row("c")], ["supabase/migrations/unveraenderte-basis.sql", row("d")]]);
  for (const file of Object.keys(C.BLOBS)) baseTree.set(file, row("a"));
  baseTree.set(".github/workflows/ci.yml", row("a"));
  const headTree = new Map([...baseTree].map(([file, value]) => [file, { ...value }]));
  for (const [file, blob] of Object.entries(C.BLOBS)) headTree.set(file, { ...row("a"), oid: blob });
  for (const file of C.CI_FILES) headTree.set(file, row("e"));
  return { event: "pull_request", repository: C.REPOSITORY, ref: `refs/pull/${C.PR}/merge`,
    headRef: C.BRANCH, baseRef: "main", prNumber: C.PR, checkedOutHead: oid("f"),
    pr: { number: C.PR, state: "open", draft: false,
      base: { sha: C.BASE, ref: "main", repo: { full_name: C.REPOSITORY } },
      head: { sha: oid("f"), ref: C.BRANCH, repo: { full_name: C.REPOSITORY } } },
    baseTree, headTree, evidenceTree: new Map([...headTree].filter(([file]) => !C.CI_FILES.includes(file))
      .map(([file, value]) => [file, { ...value }])) };
}
let count = 0;
function test(name, fn) {
  if (nachtrag && !name.startsWith("Nachtrag:")) return;
  fn(); count++; console.log("PASS " + name);
}
function denied(change) { const f = fixture(); change(f); A.throws(() => C.validate(f), /lieferreparatur-ci:/); }
test("exakter PR erlaubt nur den neuen Reparaturmodus mit sichtbarer Belegwiederverwendung", () => {
  const p = C.validate(fixture());
  for (const key of C.OUTPUTS) A.equal(p[key], key === "lieferreparatur");
  A.equal(p.reused.cases, 24); A.match(p.reused.status, /NICHT ERNEUT/);
  A(p.reused.url.includes(C.LOCAL_EVIDENCE_COMMIT));
  const draft = fixture(); draft.pr.draft = true;
  A.equal(C.validate(draft).lieferreparatur, true);
});
test("fremdes Repo Push und manueller Dispatch erhalten keine PR-Ausnahme", () => {
  for (const event of ["push", "workflow_dispatch", "pull_request_target"]) denied(f => { f.event = event; });
  denied(f => { f.repository = "fremd/repo"; });
});
test("PR Nummer Branch Basis Fork und Zustand bleiben exakt gebunden", () => {
  for (const change of [f => { f.prNumber++; }, f => { f.pr.number++; }, f => { f.pr.base.sha = oid("1"); },
    f => { f.pr.base.ref = "anderer-branch"; }, f => { f.pr.base.repo.full_name = "fremd/repo"; },
    f => { f.pr.head.repo.full_name = "fremd/repo"; }, f => { f.pr.head.ref = "anderer-branch"; },
    f => { f.pr.state = "closed"; }, f => { delete f.pr.draft; }, f => { f.ref = "refs/heads/main"; },
    f => { f.headRef = "anderer-branch"; }, f => { f.baseRef = "anderer-branch"; }]) denied(change);
});
test("falscher oder unbekannter Checkoutkopf bleibt gesperrt", () => {
  denied(f => { f.checkedOutHead = oid("1"); }); denied(f => { f.pr.head.sha = oid("1"); });
  denied(f => { f.checkedOutHead = ""; });
});
test("jeder gebundene Runtime Test Browser Konfigurations und Belegblob ist verpflichtend", () => {
  for (const file of Object.keys(C.BLOBS)) {
    denied(f => { f.headTree.get(file).oid = oid("1"); });
    denied(f => { f.headTree.delete(file); });
    denied(f => { f.headTree.get(file).mode = "100755"; });
    denied(f => { f.headTree.get(file).type = "commit"; });
  }
});
test("neue geloeschte umbenannte und umchmodete Dateien stoppen statt breiter Auswahl", () => {
  denied(f => { f.headTree.set("lib/helmut/unerwartet.js", row("1")); });
  denied(f => { f.headTree.delete("server.js"); });
  denied(f => { f.headTree.set("server-neu.js", f.headTree.get("server.js")); f.headTree.delete("server.js"); });
  denied(f => { f.headTree.get("server.js").mode = "100755"; });
});
test("Datenbank Abhaengigkeiten Guards und fremde CI haben keine Ausnahme", () => {
  for (const file of ["package-lock.json", "scripts/lokal.js", "supabase/migrations/unveraenderte-basis.sql"])
    denied(f => { f.headTree.get(file).oid = oid("1"); });
  denied(f => { f.headTree.set(".github/workflows/unerwartet.yml", row("1")); });
});
test("nur drei regulaere CI Dateien sind von festen Blob IDs ausgenommen", () => {
  A.equal(C.CI_FILES.length, 3);
  for (const file of C.CI_FILES) {
    denied(f => { f.headTree.delete(file); });
    denied(f => { f.headTree.get(file).mode = "120000"; });
    denied(f => { f.headTree.get(file).type = "commit"; });
  }
});
test("fehlender oder veraenderter lokaler Belegbaum kann keinen lokalen Erfolg ersetzen", () => {
  denied(f => { f.evidenceTree = new Map(); });
  for (const file of [...C.RUNTIME_FILES, ...C.REGRESSION_FILES, C.LOCAL_EVIDENCE_PATH])
    denied(f => { f.evidenceTree.get(file).oid = oid("1"); });
  denied(f => { f.evidenceTree.get("scripts/lokal.js").oid = oid("1"); });
});
const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/ci.yml"), "utf8");
function active(job, next, plan) {
  const block = workflow.slice(workflow.indexOf("  " + job + ":"), workflow.indexOf("  " + next + ":"));
  return block.split(/(?=^      - )/m).filter(s => /^      - name:/m.test(s) && /^        run:/m.test(s)).filter(s => {
    const condition = /^        if: (.+)$/m.exec(s)?.[1];
    if (!condition) return true;
    const expression = condition.replace(/steps\.plan\.outputs\.([a-z]+)/g, (_, key) => JSON.stringify(String(Boolean(plan[key]))));
    return vm.runInNewContext(expression, { always: () => true }, { timeout: 50 }) === true;
  }).map(s => /^      - name: (.+)$/m.exec(s)[1]);
}
test("echter Offlinejob fuehrt nur neue Planfaelle und geaenderte JS Syntax aus", () => {
  A.deepEqual(active("offline-suite", "browser-smoke", C.validate(fixture())), [
    "Prüfplan aus geänderten Dateien", "Lieferreparatur - neue Planfaelle und geaenderte Syntax",
    "Lieferreparatur - lokale Nachweise sichtbar wiederverwenden"
  ]);
  A.match(workflow, /ci-lieferreparatur-plan-test\.js/);
  A.match(workflow, /ci-lieferreparatur-plan\.js --syntax/);
  A.match(workflow, /24 neue lokale Reparaturfaelle: WIEDERVERWENDET, NICHT ERNEUT AUSGEFUEHRT/);
});
test("echter Browserjob startet nur den neuen autorisierten JSONB Ruhelageweg", () => {
  A.deepEqual(active("browser-smoke", "synthetic-resource-diagnostic", C.validate(fixture())), [
    "Prüfplan aus geänderten Dateien", "Abhängigkeiten installieren (aus package-lock.json)",
    "Playwright + Chromium installieren", "Lieferreparatur - neuer Tagespaket JSONB Browserweg"
  ]);
  A.match(workflow, /browser-smoke-test\.js --tagespaket-jsonb/);
  A.match(workflow, /name: Syntax \+ Offline-Suiten/);
  A.match(workflow, /name: Browser-\/Mobile-Smoke \(Chromium\)/);
});
test("Nachtrag: beide Planer stoppen den Reparaturbranch vor der unveraenderten Standardauswahl", () => {
  A.equal((workflow.match(/node scripts\/ci-lieferreparatur-plan\.js --github-output/g) || []).length, 2);
  A.equal((workflow.match(/^          HELMUT_CI_PR_HEAD_REF:/gm) || []).length, 2);
  A.match(workflow, /node scripts\/lokal\.js scripts\/ci-lieferreparatur-plan-test\.js --nur-nachtrag/);
  A.match(workflow, /github\.event\.pull_request\.base\.sha == '597d7876d3f1ce963174fe749ffb28bd98f15065'/);
  const scoped = workflow.slice(0, workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal(/pull-requests: write|checks: write|statuses: write/.test(scoped), false);
});
A.ok(count > 0);
console.log(`${count}/${count} ${nachtrag ? "betroffene/neue Nachtragsfaelle" : "neue Lieferreparatur-Planpruefungen"} bestanden; keine Fach-/Mengenwiederholung.`);
