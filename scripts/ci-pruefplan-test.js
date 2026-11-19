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

check("Alte Datenbank-Mengenläufe bleiben im Workflow erhalten und bei jedem Ereignis gesperrt", () => {
  const workflow = require("node:fs").readFileSync(require("node:path").join(__dirname, "../.github/workflows/ci.yml"), "utf8");
  const steps = workflow.split(/^      - name: /m).slice(1);
  const alt = /scripts\/(?:auth-store-cas-datenbank|testfenster-null500-datenbank|realkohorte-500-(?:endweg|runtime)-datenbank|synthetik-500-(?:import-test|runtime-datenbank|native-import-test|native-d-new-datenbank|eu-time-datenbank)|end500-unabhaengig-datenbank)/;
  const mengen = steps.filter(step => alt.test(step));
  assert.equal(mengen.length, 10);
  assert(mengen.every(step => /^        if: \$\{\{ false \}\}/m.test(step)));
  assert(!workflow.includes("node scripts/test-synthetik-500-resource-diagnostic.js"));
  for (const suite of ["auth-quellen-kern-datenbank-test.js", "anbietersteuerung-datenbank-test.js",
    "lage-quellen-rest-datenbank-test.js", "vorbedingung-mandatsfilter-datenbank-test.js"]) {
    assert(steps.some(step => step.includes(suite) && /^        if: steps\.plan\.outputs\.database == 'true'$/m.test(step)), suite);
  }
  assert(steps.some(step => step.startsWith("Queue-Leases,") && step.includes("--network none")
    && step.includes("verarbeitungskern-claim-datenbank-test.js") && /^        if: steps\.plan\.outputs\.database == 'true'$/m.test(step)));
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
function sourceFixture(push = false, profile = Q) {
  const row = oid => ({ mode: "100644", type: "blob", oid });
  const baseTree = new Map([["server.js", row("a".repeat(40))], ["client.js", row("b".repeat(40))],
    ["supabase/migrations/unveraendert.sql", row("c".repeat(40))]]);
  for (const file of Object.keys(profile.BLOBS)) baseTree.set(file, row("d".repeat(40)));
  const evidenceTree = new Map(baseTree);
  for (const [file, hash] of Object.entries(profile.BLOBS)) evidenceTree.set(file, row(hash));
  const headTree = new Map(evidenceTree);
  for (const file of profile.CI_FILES) headTree.set(file, row("e".repeat(40)));
  const branchHead = "f".repeat(40), head = push ? "9".repeat(40) : branchHead;
  return { event: push ? "push" : "pull_request", repository: profile.REPOSITORY,
    ref: push ? "refs/heads/main" : `refs/pull/${profile.PR}/merge`, headRef: push ? undefined : profile.BRANCH,
    head, before: profile.BASE, message: profile.MERGE_TITLE,
    pr: { number: profile.PR, state: push ? "closed" : "open", draft: false, merged: push,
      merge_commit_sha: push ? head : null,
      base: { sha: profile.BASE, ref: "main", repo: { full_name: profile.REPOSITORY } },
      head: { sha: branchHead, ref: profile.BRANCH, repo: { full_name: profile.REPOSITORY } } },
    parents: push ? [profile.BASE, branchHead] : [profile.EVIDENCE], baseTree, evidenceTree, headTree,
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
  assert.match(workflow, /name: Native automation boundary qualification \(synthetic\)\n[^\n]+steps\.plan\.outputs\.inaktivequellen != 'true'/);
});


check("Inaktive Quellen: echter Workflow-Selektor faengt falschen Mainmergetitel vor breitem Plan ab", () => {
  const workflow = require("node:fs").readFileSync(require("node:path").join(__dirname, "../.github/workflows/ci.yml"), "utf8");
  const blocks = [...workflow.matchAll(/if \[ "\$\{HELMUT_CI_PR_NUMBER:-\}" = 1207 \][\s\S]*?\n          fi/g)].map(m => m[0]);
  assert.equal(blocks.length, 2); assert.equal(blocks[0], blocks[1]);
  const script = `set -e
  git() {
    case "$1" in
      log) printf '%s' "$TEST_MESSAGE";;
      rev-parse) printf '%s' "$TEST_PARENT";;
      merge-base) return "$TEST_EVIDENCE_EXIT";;
      *) return 99;;
    esac
  }
  node() { printf 'GUARD'; return 23; }
  ${blocks[0]}
  printf 'BROAD'`;
  const run = (message, parent, evidence) => require("node:child_process").spawnSync("bash", ["-c", script], {
    encoding: "utf8", env: { PATH: process.env.PATH, GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main",
      GITHUB_OUTPUT: "/dev/null", TEST_MESSAGE: message, TEST_PARENT: parent, TEST_EVIDENCE_EXIT: String(evidence) }
  });
  for (const message of [Q.MERGE_TITLE, "Merge pull request #1207", "Tippfehler"]) {
    const r = run(message, Q.BASE, 0);
    assert.equal(r.status, 23, r.stderr); assert.equal(r.stdout, "GUARD");
  }
  const unrelated = run("Anderer PR", Q.BASE, 1);
  assert.equal(unrelated.status, 0, unrelated.stderr); assert.equal(unrelated.stdout, "BROAD");
  const later = run("Spaeterer Maincommit", "8".repeat(40), 0);
  assert.equal(later.status, 0, later.stderr); assert.equal(later.stdout, "BROAD");
});


const T = require("./ci-quellenquittung-plan");
check("Quellenquittung: nur gebundener Hook und seine Regression ohne Mengen-/DBlauf", () => {
  const p = T.validate(sourceFixture(false, T));
  assert.equal(p.mode, "quellenquittung"); assert.equal(p.quellenquittung, true); assert.equal(p.core, true);
  for (const key of ["standard", "area", "database", "browser"]) assert.equal(p[key], false);
});
for (const [name, mutate] of [
  ["fremder Kopf", f => { f.head = "2".repeat(40); }],
  ["andere Basis", f => { f.pr.base.sha = "3".repeat(40); }],
  ["abweichender zentraler Hook", f => { f.headTree.set("lib/helmut/scalable-pipeline.js", { mode: "100644", type: "blob", oid: "4".repeat(40) }); }],
  ["fremde Runtime", f => { f.headTree.delete("server.js"); }],
  ["fremde Migration", f => { f.headTree.delete("supabase/migrations/unveraendert.sql"); }]
]) check("Quellenquittung: " + name + " stoppt fail closed", () => {
  const f = sourceFixture(false, T); mutate(f); assert.throws(() => T.validate(f), /quellenquittung-ci:/);
});
check("Quellenquittung: echter identischer Mainmerge erlaubt, falscher Titel abgelehnt", () => {
  const f=sourceFixture(true,T); assert.equal(T.validate(f).mode,"quellenquittung");
  f.message="Merge pull request #1217";assert.throws(()=>T.validate(f),/quellenquittung-ci:/);
});
check("Quellenquittung: Workflowselektor sperrt falschen Titel vor pauschaler CI", () => {
  const workflow=require("node:fs").readFileSync(require("node:path").join(__dirname,"../.github/workflows/ci.yml"),"utf8");
  const blocks=[...workflow.matchAll(/if \[ "\$\{HELMUT_CI_PR_NUMBER:-\}" = 1217 \][\s\S]*?\n          fi/g)].map(m=>m[0]);
  assert.equal(blocks.length,2);assert.equal(blocks[0],blocks[1]);
  const script=`set -e
    git() { case "$1" in log) printf '%s' "$TEST_MESSAGE";;rev-parse) printf '%s' "$TEST_PARENT";;merge-base) return "$TEST_EVIDENCE_EXIT";;*) return 99;;esac; }
    node() { printf 'GUARD';return 23; }
    ${blocks[0]}
    printf 'BROAD'`;
  for(const message of [T.MERGE_TITLE,"Merge pull request #1217"]){
    const r=require("node:child_process").spawnSync("bash",["-c",script],{encoding:"utf8",env:{PATH:process.env.PATH,GITHUB_EVENT_NAME:"push",GITHUB_REF:"refs/heads/main",GITHUB_OUTPUT:"/dev/null",TEST_MESSAGE:message,TEST_PARENT:T.BASE,TEST_EVIDENCE_EXIT:"0"}});
    assert.equal(r.status,23,r.stderr);assert.equal(r.stdout,"GUARD");
  }
  assert.match(workflow,/name: Native automation boundary qualification \(synthetic\)\n[^\n]+steps\.plan\.outputs\.quellenquittung != 'true'/);
  for(const file of ["source-queue-telemetry-test.js","source-telemetry-test.js","artikel-versionskonflikt-test.js","warteschlange-blob-entkopplung-test.js"]) assert(workflow.includes(file));
});

const U = require("./ci-quellenabschluss-plan");
check("Quellenabschluss: nur exakt gebundene Einmalfenstererweiterung ohne Mengenlauf", () => {
  const p = U.validate(sourceFixture(false, U));
  assert.equal(p.mode, "quellenabschluss"); assert.equal(p.quellenabschluss, true);
  assert.equal(p.core, true);
  for (const key of ["standard", "area", "database", "browser"]) assert.equal(p[key], false);
});
for (const [name, mutate] of [
  ["anderes Repository", f => { f.repository = "fremd/repo"; }],
  ["falscher PR", f => { f.pr.number++; }],
  ["fremder Kopf", f => { f.head = "2".repeat(40); }],
  ["andere Basis", f => { f.pr.base.sha = "3".repeat(40); }],
  ["anderer Branch", f => { f.pr.head.ref = "fremd"; }],
  ["abweichende Fensterlogik", f => { f.headTree.set("lib/helmut/quellen-arbeitsfenster.js", { mode: "100644", type: "blob", oid: "4".repeat(40) }); }],
  ["fremde Runtime", f => { f.headTree.delete("server.js"); }],
  ["fremde Migration", f => { f.headTree.delete("supabase/migrations/unveraendert.sql"); }],
  ["neue unbekannte Datei", f => { f.headTree.set("fremd.js", { mode: "100644", type: "blob", oid: "5".repeat(40) }); }],
  ["Symlink", f => { f.headTree.set("scripts/ci-quellenabschluss-plan.js", { mode: "120000", type: "blob", oid: "5".repeat(40) }); }]
]) check("Quellenabschluss: " + name + " stoppt geschlossen", () => {
  const f = sourceFixture(false, U); mutate(f); assert.throws(() => U.validate(f), /quellenabschluss-ci:/);
});
check("Quellenabschluss: Main braucht echten identischen PR-Merge und exakten Titel", () => {
  const f = sourceFixture(true, U); assert.equal(U.validate(f).mode, "quellenabschluss");
  for (const mutate of [x => { x.message = "Anderer Merge"; }, x => { x.parents.reverse(); },
    x => { x.prHeadTree.delete("server.js"); }, x => { x.before = "1".repeat(40); }]) {
    const invalid = sourceFixture(true, U); mutate(invalid);
    assert.throws(() => U.validate(invalid), /quellenabschluss-ci:/);
  }
});
check("Quellenabschluss: beide Workflowselektoren stoppen Drift vor pauschaler CI", () => {
  const workflow = require("node:fs").readFileSync(require("node:path").join(__dirname, "../.github/workflows/ci.yml"), "utf8");
  const blocks = [...workflow.matchAll(/if \[ "\$\{HELMUT_CI_PR_NUMBER:-\}" = 1223 \][\s\S]*?\n          fi/g)].map(m => m[0]);
  assert.equal(blocks.length, 2); assert.equal(blocks[0], blocks[1]);
  const script = `set -e
    git() { case "$1" in log) printf '%s' "$TEST_MESSAGE";;rev-parse) printf '%s' "$TEST_PARENT";;merge-base) return "$TEST_EVIDENCE_EXIT";;*) return 99;;esac; }
    node() { printf 'GUARD';return 23; }
    ${blocks[0]}
    printf 'BROAD'`;
  const run = (message, parent, evidence) => require("node:child_process").spawnSync("bash", ["-c", script], {
    encoding: "utf8", env: { PATH: process.env.PATH, GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main",
      GITHUB_OUTPUT: "/dev/null", TEST_MESSAGE: message, TEST_PARENT: parent, TEST_EVIDENCE_EXIT: String(evidence) }
  });
  for (const message of [U.MERGE_TITLE, "Merge pull request #1223", "Tippfehler"]) {
    const r = run(message, U.BASE, 0); assert.equal(r.status, 23, r.stderr); assert.equal(r.stdout, "GUARD");
  }
  const later = run("Spaeterer Maincommit", "8".repeat(40), 0);
  assert.equal(later.status, 0, later.stderr); assert.equal(later.stdout, "BROAD");
  assert.match(workflow, /name: Native automation boundary qualification \(synthetic\)\n[^\n]+steps\.plan\.outputs\.quellenabschluss != 'true'/);
  for (const file of ["quellen-einmalfenster-test.js", "quellen-echtlauf-einmal-test.js", "quellen-arbeitsfenster-test.js", "quellen-arbeitsfenster-route-test.js", "quellen-adminstart-test.js"]) assert(workflow.includes(file));
});


const V = require("./ci-quellendauerbetrieb-plan");
check("Quellen-Dauerbetrieb: beide Pflichtjobs mit Kern und gezielten Quellenpruefungen", () => {
  const p = V.validate(sourceFixture(false, V));
  assert.equal(p.mode, "quellendauerbetrieb"); assert.equal(p.core, true);
  for (const key of ["standard", "area", "database", "browser"]) assert.equal(p[key], false);
});
for (const [name, mutate] of [
  ["Repository", f => { f.repository = "fremd/repo"; }],
  ["PR", f => { f.pr.number++; }], ["Branch", f => { f.pr.head.ref = "fremd"; }],
  ["Basis", f => { f.pr.base.sha = "1".repeat(40); }],
  ["Kopf", f => { f.head = "2".repeat(40); }],
  ["Fremdereignis", f => { f.event = "workflow_dispatch"; }],
  ["Runtime-Drift", f => { f.headTree.delete(Object.keys(V.BLOBS)[0]); }],
  ["Beleg-Drift", f => { f.evidenceTree.delete(Object.keys(V.BLOBS)[0]); }],
  ["Auth-/UI-Drift", f => { f.headTree.delete("server.js"); }],
  ["Migration", f => { f.headTree.delete("supabase/migrations/unveraendert.sql"); }],
  ["unbekannte Datei", f => { f.headTree.set("fremd.js", { mode: "100644", type: "blob", oid: "5".repeat(40) }); }],
  ["CI-Symlink", f => { f.headTree.set(V.CI_FILES[1], { mode: "120000", type: "blob", oid: "6".repeat(40) }); }]
]) check("Quellen-Dauerbetrieb: " + name + " stoppt geschlossen", () => {
  const f = sourceFixture(false, V); mutate(f); assert.throws(() => V.validate(f), /quellendauerbetrieb-ci:/);
});
check("Quellen-Dauerbetrieb: jeder gebundene Runtime-/Testblob ist erforderlich", () => {
  for (const file of Object.keys(V.BLOBS)) {
    const f = sourceFixture(false, V); f.headTree.set(file, { mode: "100644", type: "blob", oid: "0".repeat(40) });
    assert.throws(() => V.validate(f), /quellendauerbetrieb-ci:/);
  }
});
check("Quellen-Dauerbetrieb: nur echter Mainmerge mit identischem Kopfbaum", () => {
  assert.equal(V.validate(sourceFixture(true, V)).mode, "quellendauerbetrieb");
  for (const mutate of [f => { f.message = "Anderer Merge"; }, f => { f.parents.reverse(); },
    f => { f.prHeadTree.delete("server.js"); }, f => { f.before = "1".repeat(40); }, f => { f.pr.merged = false; }]) {
    const f = sourceFixture(true, V); mutate(f); assert.throws(() => V.validate(f), /quellendauerbetrieb-ci:/);
  }
});
check("Quellen-Dauerbetrieb: identische Selektoren stoppen vor Mengenrueckfall", () => {
  const workflow = require("node:fs").readFileSync(require("node:path").join(__dirname, "../.github/workflows/ci.yml"), "utf8");
  const blocks = [...workflow.matchAll(/if \[ "\$\{HELMUT_CI_PR_NUMBER:-\}" = 1225 \][\s\S]*?\n          fi/g)].map(m => m[0]);
  assert.equal(blocks.length, 2); assert.equal(blocks[0], blocks[1]);
  const script = `set -e
    git() { case "$1" in log) printf '%s' "$TEST_MESSAGE";;rev-parse) printf '%s' "$TEST_PARENT";;merge-base) return "$TEST_EVIDENCE_EXIT";;*) return 99;;esac; }
    node() { printf 'GUARD';return 23; }
    ${blocks[0]}
    printf 'BROAD'`;
  const run = (message, parent, evidence) => require("node:child_process").spawnSync("bash", ["-c", script], {
    encoding: "utf8", env: { PATH: process.env.PATH, GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main",
      GITHUB_OUTPUT: "/dev/null", TEST_MESSAGE: message, TEST_PARENT: parent, TEST_EVIDENCE_EXIT: String(evidence) }
  });
  for (const message of [V.MERGE_TITLE, "Merge pull request #1225", "Tippfehler"]) {
    const r = run(message, V.BASE, 0); assert.equal(r.status, 23, r.stderr); assert.equal(r.stdout, "GUARD");
  }
  const unrelated = run("Anderer Merge", "8".repeat(40), 1);
  assert.equal(unrelated.status, 0, unrelated.stderr); assert.equal(unrelated.stdout, "BROAD");
  const later = run("Spaeterer Maincommit", "8".repeat(40), 0);
  assert.equal(later.status, 0, later.stderr); assert.equal(later.stdout, "BROAD");
  assert.match(workflow, /name: Native automation boundary qualification \(synthetic\)\n[^\n]+steps\.plan\.outputs\.quellendauerbetrieb != 'true'/);
  for (const file of ["crawler-hardening-test.js", "source-queue-telemetry-test.js", "source-telemetry-test.js", "quellen-eurlex-cellar-test.js", "parlamentsdaten-quellen-test.js", "source-failure-test.js", "google-news-hardening-test.js", "warteschlange-blob-entkopplung-test.js"])
    assert(workflow.includes("scripts/" + file));
  const step = workflow.split("      - name: Quellen-Dauerbetrieb -")[1].split("      - name: Quellenabschluss -")[0];
  assert(!step.includes("source-demand-test.js"));
  assert(step.includes("scripts/warteschlange-blob-entkopplung-test.js --gezielt"));
});

const X = require("./ci-bmgwiedergewinnung-plan");
check("BMG-Wiedergewinnung: beide Pflichtjobs mit Kern und gezielten Quellenpruefungen", () => {
  const p = X.validate(sourceFixture(false, X));
  assert.equal(p.mode, "bmgwiedergewinnung"); assert.equal(p.core, true);
  for (const key of ["standard", "area", "database", "browser"]) assert.equal(p[key], false);
});
for (const [name, mutate] of [
  ["Repository", f => { f.repository = "fremd/repo"; }],
  ["PR", f => { f.pr.number++; }], ["Branch", f => { f.pr.head.ref = "fremd"; }],
  ["Basis", f => { f.pr.base.sha = "1".repeat(40); }],
  ["Kopf", f => { f.head = "2".repeat(40); }],
  ["Fremdereignis", f => { f.event = "workflow_dispatch"; }],
  ["Runtime-Drift", f => { f.headTree.delete(Object.keys(X.BLOBS)[0]); }],
  ["Beleg-Drift", f => { f.evidenceTree.delete(Object.keys(X.BLOBS)[0]); }],
  ["Auth-/UI-Drift", f => { f.headTree.delete("server.js"); }],
  ["Migration", f => { f.headTree.delete("supabase/migrations/unveraendert.sql"); }],
  ["unbekannte Datei", f => { f.headTree.set("fremd.js", { mode: "100644", type: "blob", oid: "5".repeat(40) }); }],
  ["CI-Symlink", f => { f.headTree.set(X.CI_FILES[1], { mode: "120000", type: "blob", oid: "6".repeat(40) }); }]
]) check("BMG-Wiedergewinnung: " + name + " stoppt geschlossen", () => {
  const f = sourceFixture(false, X); mutate(f); assert.throws(() => X.validate(f), /bmgwiedergewinnung-ci:/);
});
check("BMG-Wiedergewinnung: jeder gebundene Runtime-/Testblob ist erforderlich", () => {
  for (const file of Object.keys(X.BLOBS)) {
    const f = sourceFixture(false, X); f.headTree.set(file, { mode: "100644", type: "blob", oid: "0".repeat(40) });
    assert.throws(() => X.validate(f), /bmgwiedergewinnung-ci:/);
  }
});
check("BMG-Wiedergewinnung: nur echter Mainmerge mit identischem Kopfbaum", () => {
  assert.equal(X.validate(sourceFixture(true, X)).mode, "bmgwiedergewinnung");
  for (const mutate of [f => { f.message = "Anderer Merge"; }, f => { f.parents.reverse(); },
    f => { f.prHeadTree.delete("server.js"); }, f => { f.before = "1".repeat(40); }, f => { f.pr.merged = false; }]) {
    const f = sourceFixture(true, X); mutate(f); assert.throws(() => X.validate(f), /bmgwiedergewinnung-ci:/);
  }
});
check("BMG-Wiedergewinnung: identische Selektoren stoppen vor Mengenrueckfall", () => {
  const workflow = require("node:fs").readFileSync(require("node:path").join(__dirname, "../.github/workflows/ci.yml"), "utf8");
  const blocks = [...workflow.matchAll(/if \[ "\$\{HELMUT_CI_PR_NUMBER:-\}" = 1227 \][\s\S]*?\n          fi/g)].map(m => m[0]);
  assert.equal(blocks.length, 2); assert.equal(blocks[0], blocks[1]);
  const script = `set -e
    git() { case "$1" in log) printf '%s' "$TEST_MESSAGE";;rev-parse) printf '%s' "$TEST_PARENT";;merge-base) return "$TEST_EVIDENCE_EXIT";;*) return 99;;esac; }
    node() { printf 'GUARD';return 23; }
    ${blocks[0]}
    printf 'BROAD'`;
  const run = (message, parent, evidence) => require("node:child_process").spawnSync("bash", ["-c", script], {
    encoding: "utf8", env: { PATH: process.env.PATH, GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main",
      GITHUB_OUTPUT: "/dev/null", TEST_MESSAGE: message, TEST_PARENT: parent, TEST_EVIDENCE_EXIT: String(evidence) }
  });
  for (const message of [X.MERGE_TITLE, "Merge pull request #1227", "Tippfehler"]) {
    const r = run(message, X.BASE, 0); assert.equal(r.status, 23, r.stderr); assert.equal(r.stdout, "GUARD");
  }
  const unrelated = run("Anderer Merge", "8".repeat(40), 1);
  assert.equal(unrelated.status, 0, unrelated.stderr); assert.equal(unrelated.stdout, "BROAD");
  const later = run("Spaeterer Maincommit", "8".repeat(40), 0);
  assert.equal(later.status, 0, later.stderr); assert.equal(later.stdout, "BROAD");
  assert.match(workflow, /name: Native automation boundary qualification \(synthetic\)\n[^\n]+steps\.plan\.outputs\.bmgwiedergewinnung != 'true'/);
  const step = workflow.split("      - name: BMG-Wiedergewinnung -")[1].split("      - name: Quellen-Dauerbetrieb -")[0];
  assert(step.includes("scripts/artikelkontext-quellenlayout-test.js --bmg"));
  assert(step.includes("scripts/artikel-wiedergewinnung-test.js"));
  assert(!step.includes("source-demand-test.js"));
  assert(!step.includes("--extended"));
});

const Y = require("./ci-eurlexoriginal-plan");
check("EUR-Lex-Original: beide Pflichtjobs mit Kern und gezielten Quellenpruefungen", () => {
  const p = Y.validate(sourceFixture(false, Y));
  assert.equal(p.mode, "eurlexoriginal"); assert.equal(p.core, true);
  for (const key of ["standard", "area", "database", "browser"]) assert.equal(p[key], false);
});
for (const [name, mutate] of [
  ["Repository", f => { f.repository = "fremd/repo"; }],
  ["PR", f => { f.pr.number++; }], ["Branch", f => { f.pr.head.ref = "fremd"; }],
  ["Basis", f => { f.pr.base.sha = "1".repeat(40); }],
  ["Kopf", f => { f.head = "2".repeat(40); }],
  ["Fremdereignis", f => { f.event = "workflow_dispatch"; }],
  ["Runtime-Drift", f => { f.headTree.delete(Object.keys(Y.BLOBS)[0]); }],
  ["Beleg-Drift", f => { f.evidenceTree.delete(Object.keys(Y.BLOBS)[0]); }],
  ["Auth-/UI-Drift", f => { f.headTree.delete("server.js"); }],
  ["Migration", f => { f.headTree.delete("supabase/migrations/unveraendert.sql"); }],
  ["unbekannte Datei", f => { f.headTree.set("fremd.js", { mode: "100644", type: "blob", oid: "5".repeat(40) }); }],
  ["CI-Symlink", f => { f.headTree.set(Y.CI_FILES[1], { mode: "120000", type: "blob", oid: "6".repeat(40) }); }]
]) check("EUR-Lex-Original: " + name + " stoppt geschlossen", () => {
  const f = sourceFixture(false, Y); mutate(f); assert.throws(() => Y.validate(f), /eurlexoriginal-ci:/);
});
check("EUR-Lex-Original: jeder gebundene Runtime-/Testblob ist erforderlich", () => {
  for (const file of Object.keys(Y.BLOBS)) {
    const f = sourceFixture(false, Y); f.headTree.set(file, { mode: "100644", type: "blob", oid: "0".repeat(40) });
    assert.throws(() => Y.validate(f), /eurlexoriginal-ci:/);
  }
});
check("EUR-Lex-Original: nur echter Mainmerge mit identischem Kopfbaum", () => {
  assert.equal(Y.validate(sourceFixture(true, Y)).mode, "eurlexoriginal");
  for (const mutate of [f => { f.message = "Anderer Merge"; }, f => { f.parents.reverse(); },
    f => { f.prHeadTree.delete("server.js"); }, f => { f.before = "1".repeat(40); }, f => { f.pr.merged = false; }]) {
    const f = sourceFixture(true, Y); mutate(f); assert.throws(() => Y.validate(f), /eurlexoriginal-ci:/);
  }
});
check("EUR-Lex-Original: identische Selektoren stoppen vor Mengenrueckfall", () => {
  const workflow = require("node:fs").readFileSync(require("node:path").join(__dirname, "../.github/workflows/ci.yml"), "utf8");
  const blocks = [...workflow.matchAll(/if \[ "\$\{HELMUT_CI_PR_NUMBER:-\}" = 1229 \][\s\S]*?\n          fi/g)].map(m => m[0]);
  assert.equal(blocks.length, 2); assert.equal(blocks[0], blocks[1]);
  const script = `set -e
    git() { case "$1" in log) printf '%s' "$TEST_MESSAGE";;rev-parse) printf '%s' "$TEST_PARENT";;merge-base) return "$TEST_EVIDENCE_EXIT";;*) return 99;;esac; }
    node() { printf 'GUARD';return 23; }
    ${blocks[0]}
    printf 'BROAD'`;
  const run = (message, parent, evidence) => require("node:child_process").spawnSync("bash", ["-c", script], {
    encoding: "utf8", env: { PATH: process.env.PATH, GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main",
      GITHUB_OUTPUT: "/dev/null", TEST_MESSAGE: message, TEST_PARENT: parent, TEST_EVIDENCE_EXIT: String(evidence) }
  });
  for (const message of [Y.MERGE_TITLE, "Merge pull request #1229", "Tippfehler"]) {
    const r = run(message, Y.BASE, 0); assert.equal(r.status, 23, r.stderr); assert.equal(r.stdout, "GUARD");
  }
  const unrelated = run("Anderer Merge", "8".repeat(40), 1);
  assert.equal(unrelated.status, 0, unrelated.stderr); assert.equal(unrelated.stdout, "BROAD");
  const later = run("Spaeterer Maincommit", "8".repeat(40), 0);
  assert.equal(later.status, 0, later.stderr); assert.equal(later.stdout, "BROAD");
  assert.match(workflow, /name: Native automation boundary qualification \(synthetic\)\n[^\n]+steps\.plan\.outputs\.eurlexoriginal != 'true'/);
  const step = workflow.split("      - name: EUR-Lex-Original -")[1].split("      - name: BMG-Wiedergewinnung -")[0];
  for (const name of ["quellen-eurlex-original", "quellen-eurlex-transport", "quellen-eurlex-auszug", "parlamentsdaten-quellen", "abdeckungspruefung", "briefing-artikelidentitaet", "briefing-fr-artikelidentitaet"]) assert(step.includes("scripts/" + name + "-test.js"));
  assert(!step.includes("source-demand-test.js"));
  assert(!step.includes("--extended"));
});

const Z = require("./ci-eurlexleser-plan");
check("EUR-Lex-Leser: beide Pflichtjobs mit Kern und gezielten Quellenpruefungen", () => {
  const p = Z.validate(sourceFixture(false, Z));
  assert.equal(p.mode, "eurlexleser"); assert.equal(p.core, true);
  for (const key of ["standard", "area", "database", "browser"]) assert.equal(p[key], false);
});
for (const [name, mutate] of [
  ["Repository", f => { f.repository = "fremd/repo"; }],
  ["PR", f => { f.pr.number++; }], ["Branch", f => { f.pr.head.ref = "fremd"; }],
  ["Basis", f => { f.pr.base.sha = "1".repeat(40); }],
  ["Kopf", f => { f.head = "2".repeat(40); }],
  ["Fremdereignis", f => { f.event = "workflow_dispatch"; }],
  ["Runtime-Drift", f => { f.headTree.delete(Object.keys(Z.BLOBS)[0]); }],
  ["Beleg-Drift", f => { f.evidenceTree.delete(Object.keys(Z.BLOBS)[0]); }],
  ["Auth-/UI-Drift", f => { f.headTree.delete("server.js"); }],
  ["Migration", f => { f.headTree.delete("supabase/migrations/unveraendert.sql"); }],
  ["unbekannte Datei", f => { f.headTree.set("fremd.js", { mode: "100644", type: "blob", oid: "5".repeat(40) }); }],
  ["CI-Symlink", f => { f.headTree.set(Z.CI_FILES[1], { mode: "120000", type: "blob", oid: "6".repeat(40) }); }]
]) check("EUR-Lex-Leser: " + name + " stoppt geschlossen", () => {
  const f = sourceFixture(false, Z); mutate(f); assert.throws(() => Z.validate(f), /eurlexleser-ci:/);
});
check("EUR-Lex-Leser: jeder gebundene Runtime-/Testblob ist erforderlich", () => {
  for (const file of Object.keys(Z.BLOBS)) {
    const f = sourceFixture(false, Z); f.headTree.set(file, { mode: "100644", type: "blob", oid: "0".repeat(40) });
    assert.throws(() => Z.validate(f), /eurlexleser-ci:/);
  }
});
check("EUR-Lex-Leser: nur echter Mainmerge mit identischem Kopfbaum", () => {
  assert.equal(Z.validate(sourceFixture(true, Z)).mode, "eurlexleser");
  for (const mutate of [f => { f.message = "Anderer Merge"; }, f => { f.parents.reverse(); },
    f => { f.prHeadTree.delete("server.js"); }, f => { f.before = "1".repeat(40); }, f => { f.pr.merged = false; }]) {
    const f = sourceFixture(true, Z); mutate(f); assert.throws(() => Z.validate(f), /eurlexleser-ci:/);
  }
});
check("EUR-Lex-Leser: identische Selektoren stoppen vor Mengenrueckfall", () => {
  const workflow = require("node:fs").readFileSync(require("node:path").join(__dirname, "../.github/workflows/ci.yml"), "utf8");
  const blocks = [...workflow.matchAll(/if \[ "\$\{HELMUT_CI_PR_NUMBER:-\}" = 1231 \][\s\S]*?\n          fi/g)].map(m => m[0]);
  assert.equal(blocks.length, 2); assert.equal(blocks[0], blocks[1]);
  const script = `set -e
    git() { case "$1" in log) printf '%s' "$TEST_MESSAGE";;rev-parse) printf '%s' "$TEST_PARENT";;merge-base) return "$TEST_EVIDENCE_EXIT";;*) return 99;;esac; }
    node() { printf 'GUARD';return 23; }
    ${blocks[0]}
    printf 'BROAD'`;
  const run = (message, parent, evidence) => require("node:child_process").spawnSync("bash", ["-c", script], {
    encoding: "utf8", env: { PATH: process.env.PATH, GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main",
      GITHUB_OUTPUT: "/dev/null", TEST_MESSAGE: message, TEST_PARENT: parent, TEST_EVIDENCE_EXIT: String(evidence) }
  });
  for (const message of [Z.MERGE_TITLE, "Merge pull request #1231", "Tippfehler"]) {
    const r = run(message, Z.BASE, 0); assert.equal(r.status, 23, r.stderr); assert.equal(r.stdout, "GUARD");
  }
  const unrelated = run("Anderer Merge", "8".repeat(40), 1);
  assert.equal(unrelated.status, 0, unrelated.stderr); assert.equal(unrelated.stdout, "BROAD");
  const later = run("Spaeterer Maincommit", "8".repeat(40), 0);
  assert.equal(later.status, 0, later.stderr); assert.equal(later.stdout, "BROAD");
  assert.match(workflow, /name: Native automation boundary qualification \(synthetic\)\n[^\n]+steps\.plan\.outputs\.eurlexleser != 'true'/);
  const step = workflow.split("      - name: EUR-Lex-Leser -")[1].split("      - name: EUR-Lex-Original -")[0];
  for (const name of ["quellen-eurlex-auszug", "quellen-auszug", "quellen-native-datum"]) assert(step.includes("scripts/" + name + "-test.js"));
  assert(!step.includes("source-demand-test.js"));
  assert(!step.includes("--extended"));
});

console.log("\n" + pass + " PASS / 0 FAIL");
