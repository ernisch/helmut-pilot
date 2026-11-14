"use strict";

// Neue kleine Negativfaelle fuer genau diesen PR-Pruefvertrag; keine alten
// Fach-, Browser-, Datenbank- oder Mengenpruefungen werden hier gestartet.
const A = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const C = require("./ci-lieferreparatur-plan");
const args = process.argv.slice(2), nachtrag = args.length === 1 && args[0] === "--nur-nachtrag";
const dipOnly = args.length === 1 && args[0] === "--dip-only";
const mandatOnly = args.length === 1 && args[0] === "--mandat-only";
const teilstandOnly = args.length === 1 && args[0] === "--teilstand-only";
const frischeOnly = args.length === 1 && args[0] === "--frische-only";
A.ok(args.length === 0 || nachtrag || dipOnly || mandatOnly || teilstandOnly || frischeOnly, "Unbekannte Auswahl darf keine Pruefungen auslassen");
const oid = char => char.repeat(40), row = char => ({ mode: "100644", type: "blob", oid: oid(char) });
function fixture(profile = C) {
  const baseTree = new Map([["server.js", row("a")], ["package-lock.json", row("b")],
    ["scripts/lokal.js", row("c")], ["supabase/migrations/unveraenderte-basis.sql", row("d")]]);
  for (const file of Object.keys(profile.BLOBS)) baseTree.set(file, row("a"));
  baseTree.set(".github/workflows/ci.yml", row("a"));
  const headTree = new Map([...baseTree].map(([file, value]) => [file, { ...value }]));
  for (const [file, blob] of Object.entries(profile.BLOBS)) headTree.set(file, { ...row("a"), oid: blob });
  for (const file of C.CI_FILES) headTree.set(file, row("e"));
  return { event: "pull_request", repository: C.REPOSITORY, ref: `refs/pull/${profile.PR}/merge`,
    headRef: profile.BRANCH, baseRef: "main", prNumber: profile.PR, checkedOutHead: oid("f"),
    pr: { number: profile.PR, state: "open", draft: false,
      base: { sha: profile.BASE, ref: "main", repo: { full_name: C.REPOSITORY } },
      head: { sha: oid("f"), ref: profile.BRANCH, repo: { full_name: C.REPOSITORY } } },
    baseTree, headTree, evidenceTree: new Map([...headTree].filter(([file]) => !C.CI_FILES.includes(file))
      .map(([file, value]) => [file, { ...value }])) };
}
let count = 0;
function test(name, fn) {
  if (nachtrag && !name.startsWith("Nachtrag:")) return;
  if (dipOnly && !name.startsWith("DIP:")) return;
  if (mandatOnly && !name.startsWith("Mandat:")) return;
  if (teilstandOnly && !name.startsWith("Teilstand:")) return;
  if (frischeOnly && !name.startsWith("Frische:")) return;
  fn(); count++; console.log("PASS " + name);
}
function denied(change, profile = C) { const f = fixture(profile); change(f); A.throws(() => C.validate(f), /lieferreparatur-ci:/); }
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
test("DIP: exaktes zweites Profil aktiviert nur neue Artikelisolation ohne alte Pruefungen", () => {
  const p = C.validate(fixture(C.DIP));
  for (const key of C.OUTPUTS) A.equal(p[key], key === "dipartikelisolation");
  A.equal(p.source.pr, 1185); A.equal(p.source.base, C.DIP.BASE);
  A.match(p.reused.status, /Browser bewusst nicht erneut/);
});
test("DIP: falsche Base PR Branch Repo oder Ereignis stoppen ohne anderes Profil", () => {
  for (const change of [f => { f.pr.base.sha = C.BASE; }, f => { f.prNumber = C.PR; },
    f => { f.pr.number = C.PR; }, f => { f.headRef = C.BRANCH; }, f => { f.pr.head.ref = C.BRANCH; },
    f => { f.pr.head.repo.full_name = "fremd/repo"; }, f => { f.event = "workflow_dispatch"; },
    f => { f.repository = "fremd/repo"; }, f => { f.checkedOutHead = oid("1"); }]) denied(change, C.DIP);
});
test("DIP: unerwartete Dateien sowie falsche fehlende oder ausfuehrbare Abnahmeblobs bleiben gesperrt", () => {
  for (const file of Object.keys(C.DIP.BLOBS)) {
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.DIP);
    denied(f => { f.headTree.delete(file); }, C.DIP);
    denied(f => { f.headTree.get(file).mode = "100755"; }, C.DIP);
  }
  for (const file of ["package-lock.json", "scripts/lokal.js", "supabase/migrations/unveraenderte-basis.sql"])
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.DIP);
  denied(f => { f.headTree.set("lib/helmut/unerwartet.js", row("1")); }, C.DIP);
  denied(f => { f.headTree.set("scripts/browser-smoke-test.js", row("1")); }, C.DIP);
});
test("DIP: fehlender Belegbaum fremde Abhaengigkeiten und verlinkte CI Dateien stoppen", () => {
  denied(f => { f.evidenceTree = new Map(); }, C.DIP);
  denied(f => { f.evidenceTree.get("scripts/lokal.js").oid = oid("1"); }, C.DIP);
  for (const file of C.CI_FILES) {
    denied(f => { f.headTree.get(file).mode = "120000"; }, C.DIP);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.DIP);
  }
});
test("DIP: echter Offlinejob startet nur neue Profilgegenfaelle Artikelisolation und Syntax", () => {
  A.deepEqual(active("offline-suite", "browser-smoke", C.validate(fixture(C.DIP))), [
    "Prüfplan aus geänderten Dateien", "DIP - neue Artikelisolation und Profilbindung"
  ]);
  A.match(workflow, /ci-lieferreparatur-plan-test\.js --dip-only/);
  A.ok(workflow.includes("node scripts/lokal.js " + C.DIP.REGRESSION_FILES[0]));
  A.match(workflow, /ci-lieferreparatur-plan\.js --syntax/);
  A.match(workflow, /github\.event\.pull_request\.base\.sha == '73b34b02c7690656191a5d45d5efd32c954ff771'/);
});
test("DIP: Browserjob bestaetigt unveraenderte Eingaben ohne Installation oder alten Browserlauf", () => {
  A.deepEqual(active("browser-smoke", "synthetic-resource-diagnostic", C.validate(fixture(C.DIP))), [
    "Prüfplan aus geänderten Dateien", "DIP - Browser bewusst nicht erneut ausfuehren"
  ]);
  A.equal((workflow.match(/^          HELMUT_CI_PR_HEAD_REF:/gm) || []).length, 2);
  const scoped = workflow.slice(0, workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal(/pull-requests: write|checks: write|statuses: write/.test(scoped), false);
});
test("Mandat: drittes festes Profil aktiviert nur neue Workerpruefungen ohne alte Gruppen", () => {
  const p = C.validate(fixture(C.MANDAT));
  for (const key of C.OUTPUTS) A.equal(p[key], key === "mandatsarbeitvorrang");
  A.equal(p.source.pr, C.MANDAT.PR); A.equal(p.source.base, C.MANDAT.BASE);
  A.match(p.reused.status, /Browser bewusst nicht erneut/);
});
test("Mandat: falsche Profile Metadaten und Checkoutkoepfe bleiben gesperrt", () => {
  for (const change of [f => { f.pr.base.sha = C.DIP.BASE; }, f => { f.prNumber = C.DIP.PR; },
    f => { f.pr.number = C.PR; }, f => { f.headRef = C.DIP.BRANCH; }, f => { f.pr.head.ref = C.BRANCH; },
    f => { f.pr.base.ref = "anderer-branch"; }, f => { f.pr.base.repo.full_name = "fremd/repo"; },
    f => { f.pr.head.repo.full_name = "fremd/repo"; }, f => { f.pr.state = "closed"; },
    f => { delete f.pr.draft; }, f => { f.ref = "refs/heads/main"; }, f => { f.baseRef = "anderer-branch"; },
    f => { f.event = "push"; }, f => { f.event = "workflow_dispatch"; }, f => { f.event = "pull_request_target"; },
    f => { f.repository = "fremd/repo"; }, f => { f.checkedOutHead = oid("1"); }]) denied(change, C.MANDAT);
});
test("Mandat: jede Abnahmeblobabweichung und jede fremde Runtimeaenderung stoppen", () => {
  for (const file of Object.keys(C.MANDAT.BLOBS)) {
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.MANDAT);
    denied(f => { f.headTree.delete(file); }, C.MANDAT);
    denied(f => { f.headTree.get(file).mode = "100755"; }, C.MANDAT);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.MANDAT);
  }
  for (const file of ["package-lock.json", "scripts/lokal.js", "supabase/migrations/unveraenderte-basis.sql"])
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.MANDAT);
  denied(f => { f.headTree.set("lib/helmut/unerwartet.js", row("1")); }, C.MANDAT);
  denied(f => { f.headTree.set("scripts/browser-smoke-test.js", row("1")); }, C.MANDAT);
});
test("Mandat: fehlender Belegbaum fremde Abhaengigkeiten und ungueltige CI bleiben gesperrt", () => {
  denied(f => { f.evidenceTree = new Map(); }, C.MANDAT);
  denied(f => { f.evidenceTree.get("scripts/lokal.js").oid = oid("1"); }, C.MANDAT);
  for (const file of C.CI_FILES) {
    denied(f => { f.headTree.delete(file); }, C.MANDAT);
    denied(f => { f.headTree.get(file).mode = "120000"; }, C.MANDAT);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.MANDAT);
  }
});
test("Mandat: echter Offlinejob startet nur neue Profilgegenfaelle Workerregression und Syntax", () => {
  A.deepEqual(active("offline-suite", "browser-smoke", C.validate(fixture(C.MANDAT))), [
    "Prüfplan aus geänderten Dateien", "Mandat - begrenzte Ausgabephase und Profilbindung"
  ]);
  A.match(workflow, /ci-lieferreparatur-plan-test\.js --mandat-only/);
  A.ok(workflow.includes("node scripts/lokal.js " + C.MANDAT.REGRESSION_FILES[0]));
  A.match(workflow, /ci-lieferreparatur-plan\.js --syntax/);
  A.match(workflow, /github\.event\.pull_request\.base\.sha == 'cc283e0bae8ed7b9f25c551379a9ee1f8895a91c'/);
});
test("Mandat: Browserjob belegt unveraenderte Eingaben ohne alten Browser oder Mengenlauf", () => {
  A.deepEqual(active("browser-smoke", "synthetic-resource-diagnostic", C.validate(fixture(C.MANDAT))), [
    "Prüfplan aus geänderten Dateien", "Mandat - Browser bewusst nicht erneut ausfuehren"
  ]);
  A.equal((workflow.match(/^          HELMUT_CI_PR_HEAD_REF:/gm) || []).length, 2);
  const scoped = workflow.slice(0, workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal(/pull-requests: write|checks: write|statuses: write/.test(scoped), false);
});
test("Teilstand: nur das vierte feste Profil aktiviert neue Fach und Browsergegenfaelle", () => {
  const p = C.validate(fixture(C.TEILSTAND));
  for (const key of C.OUTPUTS) A.equal(p[key], key === "lageteilstand");
  A.equal(p.source.pr, C.TEILSTAND.PR); A.equal(p.source.base, C.TEILSTAND.BASE);
  A.equal(C.TEILSTAND.RUNTIME_FILES.length, 6); A.equal(C.TEILSTAND.REGRESSION_FILES.length, 1);
});
test("Teilstand: falsche Profile Metadaten Ereignisse und Checkoutkoepfe bleiben gesperrt", () => {
  for (const change of [f => { f.pr.base.sha = C.MANDAT.BASE; }, f => { f.prNumber = C.MANDAT.PR; },
    f => { f.pr.number = C.PR; }, f => { f.headRef = C.DIP.BRANCH; }, f => { f.pr.head.ref = C.BRANCH; },
    f => { f.pr.base.ref = "anderer-branch"; }, f => { f.pr.base.repo.full_name = "fremd/repo"; },
    f => { f.pr.head.repo.full_name = "fremd/repo"; }, f => { f.pr.state = "closed"; },
    f => { delete f.pr.draft; }, f => { f.ref = "refs/heads/main"; }, f => { f.baseRef = "anderer-branch"; },
    f => { f.event = "push"; }, f => { f.event = "workflow_dispatch"; }, f => { f.event = "pull_request_target"; },
    f => { f.repository = "fremd/repo"; }, f => { f.checkedOutHead = oid("1"); }]) denied(change, C.TEILSTAND);
});
test("Teilstand: jeder feste Blob ist erforderlich und fremde Runtime hat keine Ausnahme", () => {
  for (const file of Object.keys(C.TEILSTAND.BLOBS)) {
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.TEILSTAND);
    denied(f => { f.headTree.delete(file); }, C.TEILSTAND);
    denied(f => { f.headTree.get(file).mode = "100755"; }, C.TEILSTAND);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.TEILSTAND);
  }
  for (const file of ["package-lock.json", "scripts/lokal.js", "supabase/migrations/unveraenderte-basis.sql"])
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.TEILSTAND);
  for (const file of ["lib/helmut/lage-textqualitaet.js", "lib/helmut/ai.js", "lib/helmut/lage-quellenbeleg.js",
    "lib/helmut/lage-verarbeitungsbeleg.js", "lib/helmut/unerwartet.js"])
    denied(f => { f.headTree.set(file, row("1")); }, C.TEILSTAND);
});
test("Teilstand: fehlender Belegbaum und ungueltige CI bleiben gesperrt", () => {
  denied(f => { f.evidenceTree = new Map(); }, C.TEILSTAND);
  denied(f => { f.evidenceTree.get("scripts/lokal.js").oid = oid("1"); }, C.TEILSTAND);
  for (const file of C.CI_FILES) {
    denied(f => { f.headTree.delete(file); }, C.TEILSTAND);
    denied(f => { f.headTree.get(file).mode = "120000"; }, C.TEILSTAND);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.TEILSTAND);
  }
});
test("Teilstand: Offlinejob startet nur neue Profilgegenfaelle Fachregression und Syntax", () => {
  A.deepEqual(active("offline-suite", "browser-smoke", C.validate(fixture(C.TEILSTAND))), [
    "Prüfplan aus geänderten Dateien", "Teilstand - neue Fachgrenzen und Profilbindung"
  ]);
  A.match(workflow, /ci-lieferreparatur-plan-test\.js --teilstand-only/);
  A.ok(workflow.includes("node scripts/lokal.js " + C.TEILSTAND.REGRESSION_FILES[0]));
  A.match(workflow, /ci-lieferreparatur-plan\.js --syntax/);
  A.match(workflow, /github\.event\.pull_request\.base\.sha == '32311c78fb17843631f6851ec7103b5f9759ff68'/);
});
test("Teilstand: Browserjob startet nur neuen gespeicherten Teilstand auf Desktop und Mobil", () => {
  A.deepEqual(active("browser-smoke", "synthetic-resource-diagnostic", C.validate(fixture(C.TEILSTAND))), [
    "Prüfplan aus geänderten Dateien", "Abhängigkeiten installieren (aus package-lock.json)",
    "Playwright + Chromium installieren", "Teilstand - neuer gespeicherter Lagefall Desktop und Mobil"
  ]);
  A.match(workflow, /browser-smoke-test\.js --tagespaket-teilstand/);
  A.equal((workflow.match(/^          HELMUT_CI_PR_HEAD_REF:/gm) || []).length, 2);
  const scoped = workflow.slice(0, workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal(/pull-requests: write|checks: write|statuses: write/.test(scoped), false);
});
test("Frische: nur das fuenfte feste Profil aktiviert neue Fach und Browsergegenfaelle", () => {
  const p = C.validate(fixture(C.TAGESFRISCHE));
  for (const key of C.OUTPUTS) A.equal(p[key], key === "tagesfrische");
  A.equal(p.source.pr, C.TAGESFRISCHE.PR); A.equal(p.source.base, C.TAGESFRISCHE.BASE);
  A.equal(C.TAGESFRISCHE.RUNTIME_FILES.length, 3); A.equal(C.TAGESFRISCHE.REGRESSION_FILES.length, 1);
});
test("Frische: falsche Profile Metadaten Ereignisse und Checkoutkoepfe bleiben gesperrt", () => {
  for (const change of [f => { f.pr.base.sha = C.MANDAT.BASE; }, f => { f.prNumber = C.MANDAT.PR; },
    f => { f.pr.number = C.PR; }, f => { f.headRef = C.DIP.BRANCH; }, f => { f.pr.head.ref = C.BRANCH; },
    f => { f.pr.base.ref = "anderer-branch"; }, f => { f.pr.base.repo.full_name = "fremd/repo"; },
    f => { f.pr.head.repo.full_name = "fremd/repo"; }, f => { f.pr.state = "closed"; },
    f => { delete f.pr.draft; }, f => { f.ref = "refs/heads/main"; }, f => { f.baseRef = "anderer-branch"; },
    f => { f.event = "push"; }, f => { f.event = "workflow_dispatch"; }, f => { f.event = "pull_request_target"; },
    f => { f.repository = "fremd/repo"; }, f => { f.checkedOutHead = oid("1"); }]) denied(change, C.TAGESFRISCHE);
});
test("Frische: jeder feste Blob ist erforderlich und fremde Runtime hat keine Ausnahme", () => {
  for (const file of Object.keys(C.TAGESFRISCHE.BLOBS)) {
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.TAGESFRISCHE);
    denied(f => { f.headTree.delete(file); }, C.TAGESFRISCHE);
    denied(f => { f.headTree.get(file).mode = "100755"; }, C.TAGESFRISCHE);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.TAGESFRISCHE);
  }
  for (const file of ["package-lock.json", "scripts/lokal.js", "supabase/migrations/unveraenderte-basis.sql"])
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.TAGESFRISCHE);
  for (const file of ["lib/helmut/lage-textqualitaet.js", "lib/helmut/ai.js", "lib/helmut/lage-quellenbeleg.js",
    "lib/helmut/lage-verarbeitungsbeleg.js", "lib/helmut/unerwartet.js"])
    denied(f => { f.headTree.set(file, row("1")); }, C.TAGESFRISCHE);
});
test("Frische: fehlender Belegbaum und ungueltige CI bleiben gesperrt", () => {
  denied(f => { f.evidenceTree = new Map(); }, C.TAGESFRISCHE);
  denied(f => { f.evidenceTree.get("scripts/lokal.js").oid = oid("1"); }, C.TAGESFRISCHE);
  for (const file of C.CI_FILES) {
    denied(f => { f.headTree.delete(file); }, C.TAGESFRISCHE);
    denied(f => { f.headTree.get(file).mode = "120000"; }, C.TAGESFRISCHE);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.TAGESFRISCHE);
  }
});
test("Frische: Offlinejob startet nur neue Profilgegenfaelle Fachregression und Syntax", () => {
  A.deepEqual(active("offline-suite", "browser-smoke", C.validate(fixture(C.TAGESFRISCHE))), [
    "Prüfplan aus geänderten Dateien", "Tagesfrische - neue Archivgrenzen und Profilbindung"
  ]);
  A.match(workflow, /ci-lieferreparatur-plan-test\.js --frische-only/);
  A.ok(workflow.includes("node scripts/lokal.js " + C.TAGESFRISCHE.REGRESSION_FILES[0]));
  A.match(workflow, /ci-lieferreparatur-plan\.js --syntax/);
  A.match(workflow, /github\.event\.pull_request\.base\.sha == 'c97fbbd0e9a894e4072252be3863bffa29c625e8'/);
});
test("Frische: Browserjob startet nur neue Radar-Klarheit auf Desktop und Mobil", () => {
  A.deepEqual(active("browser-smoke", "synthetic-resource-diagnostic", C.validate(fixture(C.TAGESFRISCHE))), [
    "Prüfplan aus geänderten Dateien", "Abhängigkeiten installieren (aus package-lock.json)",
    "Playwright + Chromium installieren", "Radar - neuer verstaendlicher Quellenstand Desktop und Mobil"
  ]);
  A.match(workflow, /browser-smoke-test\.js --radar-frischeklarheit/);
  A.equal((workflow.match(/^          HELMUT_CI_PR_HEAD_REF:/gm) || []).length, 2);
  const scoped = workflow.slice(0, workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal(/pull-requests: write|checks: write|statuses: write/.test(scoped), false);
});
A.ok(count > 0);
console.log(`${count}/${count} ${frischeOnly ? "neue Frische-Profilgegenfaelle" : teilstandOnly ? "neue Teilstand-Profilgegenfaelle" : mandatOnly ? "neue Mandatsphasen-Profilgegenfaelle" : dipOnly ? "neue DIP-Profilgegenfaelle" : nachtrag ? "betroffene/neue Nachtragsfaelle" : "neue Lieferreparatur-Planpruefungen"} bestanden; keine Fach-/Mengenwiederholung.`);
