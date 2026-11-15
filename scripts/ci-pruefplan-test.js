"use strict";

const assert = require("assert");
const P = require("./ci-pruefplan.js");

let pass = 0;
function check(name, fn) {
  fn();
  pass += 1;
  console.log("PASS", name);
}

check("Dokumentation startet keine grosse CI", () => {
  const p = P.plan(["docs/CURRENT_STATE.md", "AGENTS.md"]);
  assert.equal(p.mode, "docs");
  assert.equal(p.standard, false);
  assert.equal(p.core, false);
  assert.equal(p.database, false);
  assert.equal(p.browser, false);
  assert.equal(p.area, false);
});

check("Ausfuehrbare inerte Reader-SQL allein startet echte DB-Pruefung", () => {
  const p = P.plan(["docs/betrieb/native-witness-abi.inert.sql"]);
  assert.equal(p.mode, "full");
  assert.equal(p.standard, true);
  assert.equal(p.database, true);
  assert.equal(p.syntax, true);
});

check("Normale Fachdatei bekommt nur Bereichstests", () => {
  const p = P.plan(["lib/helmut/briefing-lauf.js"]);
  assert.equal(p.mode, "targeted");
  assert.equal(p.standard, false);
  assert.equal(p.core, true);
  assert.equal(p.database, false);
  assert.equal(p.browser, false);
  assert.equal(p.area, true);
  assert(p.bereiche.includes("briefing"));
});

check("UI bekommt Bereich plus Browser aber keine grosse Offline Suite", () => {
  const p = P.plan(["client.js", "styles.css"]);
  assert.equal(p.standard, false);
  assert.equal(p.core, true);
  assert.equal(p.database, false);
  assert.equal(p.browser, true);
  assert.equal(p.area, true);
});

check("Assets zaehlen als UI und nicht als unbekannter Volltest", () => {
  const p = P.plan(["assets/fonts/beispiel.ttf"]);
  assert.equal(p.standard, false);
  assert.equal(p.browser, true);
  assert.equal(p.area, true);
  assert(p.bereiche.includes("ui"));
});

check("Verwaltungsintegration bekommt Admin-Pruefung statt unnoetiger Vollsuite", () => {
  // Reale Dateiliste der vorherigen langsamen Verwaltungs-PR.
  const p = P.plan(["docs/CURRENT_STATE.md", "scripts/original-verwaltung-paket.js",
    "scripts/original-verwaltung-test.js", "verwaltung/original-adapter.mjs"]);
  assert.equal(p.mode, "targeted");
  assert.equal(p.standard, false);
  assert.equal(p.database, false);
  assert.equal(p.core, true);
  assert.equal(p.area, true);
  assert.equal(p.browser, false);
  assert.deepEqual(p.bereiche, ["admin"]);
  assert.deepEqual(p.unbekannt, []);
});

check("Verwaltungsdateien bleiben relevant, Gestaltung erhaelt Browserpruefung", () => {
  const adapter = P.plan(["verwaltung/original-adapter.mjs"]);
  assert.equal(adapter.mode, "targeted");
  assert.equal(adapter.core, true);
  assert.equal(adapter.area, true);
  assert.equal(adapter.database, false);
  const markup = P.plan(["verwaltung/index.html", "verwaltung/styles.css"]);
  assert.equal(markup.standard, false);
  assert.equal(markup.database, false);
  assert.equal(markup.browser, true);
  // Die vorhandene UI-Zuordnung erkennt Stylesheet und index.html ebenfalls.
  assert.deepEqual(markup.bereiche, ["admin", "ui"]);
});

check("Unbekannte Skripte behalten die konservative Vollpruefung", () => {
  const p = P.plan(["scripts/unbekannte-verwaltungsschnittstelle.js"]);
  assert.equal(p.mode, "full");
  assert.equal(p.standard, true);
  assert.equal(p.database, true);
  assert.deepEqual(p.unbekannt, ["scripts/unbekannte-verwaltungsschnittstelle.js"]);
});

check("500er Schutzbereich bleibt voll abgesichert", () => {
  const p = P.plan(["lib/helmut/testnachweis.js"]);
  assert.equal(p.mode, "full");
  assert.equal(p.standard, true);
  assert.equal(p.database, true);
});

check("Migration bleibt voll abgesichert", () => {
  const p = P.plan(["supabase/migrations/20261004120000_test.sql"]);
  assert.equal(p.standard, true);
  assert.equal(p.database, true);
});

check("Unbekannter Code faellt sicher auf Vollpruefung zurueck", () => {
  const p = P.plan(["lib/helmut/neuer-unbekannter-pfad.js"]);
  assert.equal(p.standard, true);
  assert.equal(p.database, true);
  assert(p.unbekannt.length === 1);
});

check("CI Aenderung prueft die CI selbst voll", () => {
  const p = P.plan([".github/workflows/ci.yml"]);
  assert.equal(p.standard, true);
  assert.equal(p.database, true);
  assert.equal(p.browser, true);
});

check("GitHub Workflow Aenderungen bleiben konservativ", () => {
  for (const file of [".github/workflows/ci.yml", ".github/workflows/health-watch.yml"]) {
    const p = P.plan([file]);
    assert.equal(p.mode, "full", file);
    assert.equal(p.standard, true, file);
    assert.equal(p.database, true, file);
  }
});

check("Vercel Deploymentlogik erzwingt konservative Vollpruefung", () => {
  for (const file of ["vercel.json", "scripts/vercel-ignore-build.js", "scripts/vercel-ignore-build-test.js"]) {
    const p = P.plan([file]);
    assert.equal(p.mode, "full", file);
    assert.equal(p.standard, true, file);
    assert.equal(p.database, true, file);
  }
});

check("Leere Dateiliste ist fail closed", () => {
  const p = P.plan([]);
  assert.equal(p.mode, "full");
  assert.equal(p.standard, true);
  assert.equal(p.browser, true);
});


// Ein exakter inaktiver Quellenstand darf ohne fremde DB-/Mengenpruefungen
// geprueft werden. Jede abweichende Runtime, SQL oder Mergebindung stoppt.
const Q = require("./ci-inaktive-quellen-plan");
function sourceFixture(push = false) {
  const row = oid => ({ mode: "100644", type: "blob", oid });
  const baseTree = new Map([["server.js", row("a".repeat(40))], ["client.js", row("b".repeat(40))],
    ["supabase/migrations/unveraendert.sql", row("c".repeat(40))]]);
  for (const file of Object.keys(Q.BLOBS)) baseTree.set(file, row("d".repeat(40)));
  const evidenceTree = new Map(baseTree);
  for (const [file, hash] of Object.entries(Q.BLOBS)) evidenceTree.set(file, row(hash));
  const headTree = new Map(evidenceTree);
  for (const file of Q.CI_FILES) headTree.set(file, row("e".repeat(40)));
  const branchHead = "f".repeat(40), head = push ? "9".repeat(40) : branchHead;
  return { event: push ? "push" : "pull_request", repository: Q.REPOSITORY,
    ref: push ? "refs/heads/main" : `refs/pull/${Q.PR}/merge`, headRef: push ? undefined : Q.BRANCH,
    head, before: Q.BASE, message: Q.MERGE_TITLE,
    pr: { number: Q.PR, state: push ? "closed" : "open", draft: false, merged: push,
      merge_commit_sha: push ? head : null,
      base: { sha: Q.BASE, ref: "main", repo: { full_name: Q.REPOSITORY } },
      head: { sha: branchHead, ref: Q.BRANCH, repo: { full_name: Q.REPOSITORY } } },
    parents: push ? [Q.BASE, branchHead] : [Q.EVIDENCE], baseTree, evidenceTree, headTree,
    prHeadTree: push ? new Map(headTree) : undefined };
}
function sourceDenied(change, push = false) {
  const f = sourceFixture(push); change(f); assert.throws(() => Q.validate(f), /inaktive-quellen-ci:/);
}
check("Inaktive Quellen: exakter PR behaelt beide Pflichtjobs und nur Kern/Quellen", () => {
  const p = Q.validate(sourceFixture());
  assert.equal(p.inaktivequellen, true); assert.equal(p.core, true);
  for (const key of ["standard", "area", "database", "browser"]) assert.equal(p[key], false);
});
for (const [name, change] of [
  ["Repository", f => { f.repository = "fremd/repo"; }],
  ["PR", f => { f.pr.number++; }],
  ["Basis", f => { f.pr.base.sha = "1".repeat(40); }],
  ["Branch", f => { f.pr.head.ref = "fremd"; }],
  ["Checkout", f => { f.head = "2".repeat(40); }],
  ["Ereignis", f => { f.event = "workflow_dispatch"; }],
  ["Baum", f => { f.headTree = null; }],
  ["Quellenblob", f => { f.headTree.set(Object.keys(Q.BLOBS)[0], { mode: "100644", type: "blob", oid: "3".repeat(40) }); }],
  ["SQLblob", f => { f.headTree.delete("supabase/seeds/20260713_source_architecture_seed.sql"); }],
  ["Belegbaum", f => { f.evidenceTree.delete(Object.keys(Q.BLOBS)[1]); }],
  ["fremde Runtime", f => { f.headTree.delete("server.js"); }],
  ["fremde UI", f => { f.headTree.set("client.js", { mode: "100644", type: "blob", oid: "4".repeat(40) }); }],
  ["Migration", f => { f.headTree.delete("supabase/migrations/unveraendert.sql"); }],
  ["unbekannte Datei", f => { f.headTree.set("lib/helmut/fremd.js", { mode: "100644", type: "blob", oid: "5".repeat(40) }); }],
  ["CI-Symlink", f => { f.headTree.set(Q.CI_FILES[0], { mode: "120000", type: "blob", oid: "6".repeat(40) }); }]
]) check(`Inaktive Quellen: ${name} stoppt statt Mengenrueckfall`, () => sourceDenied(change));
check("Inaktive Quellen: wirklicher Mainmerge mit identischem PR-Baum erlaubt", () => {
  assert.equal(Q.validate(sourceFixture(true)).mode, "inaktive-quellen");
});
for (const [name, change] of [
  ["nicht gemergter PR", f => { f.pr.merged = false; }],
  ["anderer Titel", f => { f.message += " fremd"; }],
  ["anderer Vater", f => { f.parents[0] = "7".repeat(40); }],
  ["fremder Mergebaum", f => { f.prHeadTree.delete("client.js"); }],
  ["andere Vorgeschichte", f => { f.before = "8".repeat(40); }]
]) check(`Inaktive Quellen: Main ${name} gesperrt`, () => sourceDenied(change, true));
check("Inaktive Quellen: Workflow benutzt dieselbe Bindung in beiden Pflichtjobs", () => {
  const workflow = require("node:fs").readFileSync(require("node:path").join(__dirname, "../.github/workflows/ci.yml"), "utf8");
  assert.equal((workflow.match(/node scripts\/ci-inaktive-quellen-plan\.js --github-output/g) || []).length, 2);
  assert(workflow.includes("steps.plan.outputs.inaktivequellen == 'true'"));
  assert(workflow.includes("scripts/run-offline-tests.js --nur-bereich --bereich quellen"));
  assert(workflow.includes("name: Syntax + Offline-Suiten"));
  assert(workflow.includes("name: Browser-/Mobile-Smoke (Chromium)"));
  assert(workflow.includes(Q.MERGE_TITLE));
});

console.log("\n" + pass + " PASS / 0 FAIL");
