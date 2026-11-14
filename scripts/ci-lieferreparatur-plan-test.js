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
const frischeNachtrag = args.length === 1 && args[0] === "--frische-nachtrag-only";
const abrufOnly = args.length === 1 && args[0] === "--abrufanteil-only";
const konfliktOnly = args.length === 1 && args[0] === "--versionskonflikt-only";
const ergaenzungOnly = args.length === 1 && args[0] === "--ergaenzung-only";
const kostenOnly = args.length === 1 && args[0] === "--kostenvertrag-plan-only";
const kundenOnly = args.length === 1 && args[0] === "--kundenansichten-only";
const radarartikelOnly = args.length === 1 && args[0] === "--radarartikel-only";
const radarartikelNachtrag = args.length === 1 && args[0] === "--radarartikel-nachtrag-only";
const volltextOnly = args.length === 1 && args[0] === "--volltextschutz-only";
const fensterOnly = args.length === 1 && args[0] === "--briefingfenster-only";
const kundenRunnerOnly = args.length === 1 && args[0] === "--kundenansichten-runner-only";
A.ok(args.length === 0 || nachtrag || dipOnly || mandatOnly || teilstandOnly || frischeOnly || frischeNachtrag || abrufOnly || konfliktOnly || ergaenzungOnly || kostenOnly || kundenOnly || kundenRunnerOnly || fensterOnly || volltextOnly || radarartikelOnly || radarartikelNachtrag, "Unbekannte Auswahl darf keine Pruefungen auslassen");
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
  if (frischeNachtrag && !/^Frische: (?:Offlinejob|Browserjob)/.test(name)) return;
  if (abrufOnly && !name.startsWith("Abrufanteil:")) return;
  if (konfliktOnly && !name.startsWith("Versionskonflikt:")) return;
  if (ergaenzungOnly && !name.startsWith("Ergaenzung:")) return;
  if (kostenOnly && !name.startsWith("Kostenvertrag:")) return;
  if (radarartikelOnly && !name.startsWith("Radarartikel:")) return;
  if (radarartikelNachtrag && !name.startsWith("Radarartikel: Offlinejob")) return;
  if (volltextOnly && !name.startsWith("Volltextschutz:")) return;
  if (fensterOnly && !name.startsWith("Briefingfenster:")) return;
  if (kundenOnly && !name.startsWith("Kundenansicht:")) return;
  if (kundenRunnerOnly && !/^Kundenansicht: (?:Offlinejob|kompatibler Runner)/.test(name)) return;
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
  A.match(workflow, /ci-lieferreparatur-plan-test\.js --frische-nachtrag-only/);
  A.ok(workflow.includes("node scripts/lokal.js " + C.TAGESFRISCHE.REGRESSION_FILES[0] + " --nur-offene"));
  A.match(workflow, /ci-lieferreparatur-plan\.js --syntax/);
  A.match(workflow, /github\.event\.pull_request\.base\.sha == 'c97fbbd0e9a894e4072252be3863bffa29c625e8'/);
});
test("Frische: Browserjob bewahrt den bestaetigten unveraenderten Radar-Klarheitsbeleg", () => {
  A.deepEqual(active("browser-smoke", "synthetic-resource-diagnostic", C.validate(fixture(C.TAGESFRISCHE))), [
    "Prüfplan aus geänderten Dateien", "Radar - bestaetigten Browserbeleg wiederverwenden"
  ]);
  A.match(workflow, /43537245306\/job\/132269105907/);
  A.match(workflow, /kein neuer Browser-PASS behauptet/);
  A.equal((workflow.match(/^          HELMUT_CI_PR_HEAD_REF:/gm) || []).length, 2);
  const scoped = workflow.slice(0, workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal(/pull-requests: write|checks: write|statuses: write/.test(scoped), false);
});
test("Abrufanteil: nur sechstes exaktes Profil aktiviert die neue Workerpruefung", () => {
  const p = C.validate(fixture(C.ABRUFANTEIL));
  for (const key of C.OUTPUTS) A.equal(p[key], key === "quellenabrufanteil");
  A.equal(p.source.pr, 1189); A.equal(p.source.base, C.ABRUFANTEIL.BASE);
  A.equal(C.ABRUFANTEIL.RUNTIME_FILES.length, 1); A.equal(C.ABRUFANTEIL.REGRESSION_FILES.length, 1);
  A.match(p.reused.status, /Browser bewusst nicht erneut/);
});
test("Abrufanteil: fremde Metadaten Ereignisse und Koepfe erhalten keine Ausnahme", () => {
  for (const change of [f => { f.pr.base.sha = C.TAGESFRISCHE.BASE; }, f => { f.prNumber = C.TAGESFRISCHE.PR; },
    f => { f.pr.number = C.PR; }, f => { f.headRef = C.TAGESFRISCHE.BRANCH; }, f => { f.pr.head.ref = C.BRANCH; },
    f => { f.pr.base.ref = "fremd"; }, f => { f.pr.base.repo.full_name = "fremd/repo"; },
    f => { f.pr.head.repo.full_name = "fremd/repo"; }, f => { f.pr.state = "closed"; },
    f => { delete f.pr.draft; }, f => { f.ref = "refs/heads/main"; }, f => { f.baseRef = "fremd"; },
    f => { f.event = "push"; }, f => { f.event = "workflow_dispatch"; }, f => { f.event = "pull_request_target"; },
    f => { f.repository = "fremd/repo"; }, f => { f.checkedOutHead = oid("1"); }]) denied(change, C.ABRUFANTEIL);
});
test("Abrufanteil: jeder Abnahmeblob und unveraenderte Runtime bleiben strikt gebunden", () => {
  for (const file of Object.keys(C.ABRUFANTEIL.BLOBS)) {
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.ABRUFANTEIL);
    denied(f => { f.headTree.delete(file); }, C.ABRUFANTEIL);
    denied(f => { f.headTree.get(file).mode = "100755"; }, C.ABRUFANTEIL);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.ABRUFANTEIL);
  }
  for (const file of ["package-lock.json", "scripts/lokal.js", "supabase/migrations/unveraenderte-basis.sql"])
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.ABRUFANTEIL);
  for (const file of ["client.js", "scripts/browser-smoke-test.js", "lib/helmut/ai.js", "lib/helmut/scalable-pipeline.js",
    "lib/helmut/storage.js", "lib/helmut/tagespaket-auslieferung.js"])
    denied(f => { f.headTree.set(file, row("1")); }, C.ABRUFANTEIL);
});
test("Abrufanteil: fehlende Belege und ungueltige CI stoppen geschlossen", () => {
  denied(f => { f.evidenceTree = new Map(); }, C.ABRUFANTEIL);
  denied(f => { f.evidenceTree.get("scripts/lokal.js").oid = oid("1"); }, C.ABRUFANTEIL);
  for (const file of C.CI_FILES) {
    denied(f => { f.headTree.delete(file); }, C.ABRUFANTEIL);
    denied(f => { f.headTree.get(file).mode = "120000"; }, C.ABRUFANTEIL);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.ABRUFANTEIL);
  }
});
test("Abrufanteil: Offlinejob fuehrt ausschliesslich neue Gegenfaelle Fairness und Syntax aus", () => {
  A.deepEqual(active("offline-suite", "browser-smoke", C.validate(fixture(C.ABRUFANTEIL))), [
    "Prüfplan aus geänderten Dateien", "Abrufanteil - neue Fairness und Profilbindung"
  ]);
  A.match(workflow, /ci-lieferreparatur-plan-test\.js --abrufanteil-only/);
  A.ok(workflow.includes("node scripts/lokal.js " + C.ABRUFANTEIL.REGRESSION_FILES[0]));
  A.match(workflow, /github\.event\.pull_request\.base\.sha == '5a734cc38549c0e6f922bf7471d44042ed3b5deb'/);
});
test("Abrufanteil: Browserjob bestaetigt unveraenderte Eingaben ohne erneuten Browserlauf", () => {
  A.deepEqual(active("browser-smoke", "synthetic-resource-diagnostic", C.validate(fixture(C.ABRUFANTEIL))), [
    "Prüfplan aus geänderten Dateien", "Abrufanteil - Browser bewusst nicht erneut ausfuehren"
  ]);
  A.match(workflow, /43537245306\/job\/132269105907/);
  A.equal((workflow.match(/^          HELMUT_CI_PR_HEAD_REF:/gm) || []).length, 2);
  const scoped = workflow.slice(0, workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal(/pull-requests: write|checks: write|statuses: write/.test(scoped), false);
});
test("Versionskonflikt: nur siebtes exaktes Profil aktiviert nur die neue Artikelisolation", () => {
  const p = C.validate(fixture(C.VERSIONSKONFLIKT));
  for (const key of C.OUTPUTS) A.equal(p[key], key === "artikelversionskonflikt");
  A.equal(p.source.pr, 1190); A.equal(p.source.base, C.VERSIONSKONFLIKT.BASE);
  A.equal(C.VERSIONSKONFLIKT.RUNTIME_FILES.length, 2); A.equal(C.VERSIONSKONFLIKT.REGRESSION_FILES.length, 1);
  A.match(p.reused.status, /Browser bewusst nicht erneut/);
});
test("Versionskonflikt: fremde Metadaten Ereignisse und Koepfe erhalten keine Ausnahme", () => {
  for (const change of [f => { f.pr.base.sha = C.TAGESFRISCHE.BASE; }, f => { f.prNumber = C.TAGESFRISCHE.PR; },
    f => { f.pr.number = C.PR; }, f => { f.headRef = C.TAGESFRISCHE.BRANCH; }, f => { f.pr.head.ref = C.BRANCH; },
    f => { f.pr.base.ref = "fremd"; }, f => { f.pr.base.repo.full_name = "fremd/repo"; },
    f => { f.pr.head.repo.full_name = "fremd/repo"; }, f => { f.pr.state = "closed"; },
    f => { delete f.pr.draft; }, f => { f.ref = "refs/heads/main"; }, f => { f.baseRef = "fremd"; },
    f => { f.event = "push"; }, f => { f.event = "workflow_dispatch"; }, f => { f.event = "pull_request_target"; },
    f => { f.repository = "fremd/repo"; }, f => { f.checkedOutHead = oid("1"); }]) denied(change, C.VERSIONSKONFLIKT);
});
test("Versionskonflikt: jeder Abnahmeblob und unveraenderte Runtime bleiben strikt gebunden", () => {
  for (const file of Object.keys(C.VERSIONSKONFLIKT.BLOBS)) {
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.VERSIONSKONFLIKT);
    denied(f => { f.headTree.delete(file); }, C.VERSIONSKONFLIKT);
    denied(f => { f.headTree.get(file).mode = "100755"; }, C.VERSIONSKONFLIKT);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.VERSIONSKONFLIKT);
  }
  for (const file of ["package-lock.json", "scripts/lokal.js", "supabase/migrations/unveraenderte-basis.sql"])
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.VERSIONSKONFLIKT);
  for (const file of ["client.js", "scripts/browser-smoke-test.js", "lib/helmut/ai.js", "lib/helmut/scalable-pipeline.js",
    "lib/helmut/storage.js", "lib/helmut/tagespaket-auslieferung.js"])
    denied(f => { f.headTree.set(file, row("1")); }, C.VERSIONSKONFLIKT);
});
test("Versionskonflikt: fehlende Belege und ungueltige CI stoppen geschlossen", () => {
  denied(f => { f.evidenceTree = new Map(); }, C.VERSIONSKONFLIKT);
  denied(f => { f.evidenceTree.get("scripts/lokal.js").oid = oid("1"); }, C.VERSIONSKONFLIKT);
  for (const file of C.CI_FILES) {
    denied(f => { f.headTree.delete(file); }, C.VERSIONSKONFLIKT);
    denied(f => { f.headTree.get(file).mode = "120000"; }, C.VERSIONSKONFLIKT);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.VERSIONSKONFLIKT);
  }
});
test("Versionskonflikt: Offlinejob fuehrt ausschliesslich neue Gegenfaelle Artikelkonflikte und Syntax aus", () => {
  A.deepEqual(active("offline-suite", "browser-smoke", C.validate(fixture(C.VERSIONSKONFLIKT))), [
    "Prüfplan aus geänderten Dateien", "Versionskonflikt - neue Artikelisolation und Profilbindung"
  ]);
  A.match(workflow, /ci-lieferreparatur-plan-test\.js --versionskonflikt-only/);
  A.ok(workflow.includes("node scripts/lokal.js " + C.VERSIONSKONFLIKT.REGRESSION_FILES[0]));
  A.match(workflow, /github\.event\.pull_request\.base\.sha == '441ed0af2bf4bd1a5dbd137d8eb7ac4c3d87b616'/);
});
test("Versionskonflikt: Browserjob bestaetigt unveraenderte Eingaben ohne erneuten Browserlauf", () => {
  A.deepEqual(active("browser-smoke", "synthetic-resource-diagnostic", C.validate(fixture(C.VERSIONSKONFLIKT))), [
    "Prüfplan aus geänderten Dateien", "Versionskonflikt - Browser bewusst nicht erneut ausfuehren"
  ]);
  A.match(workflow, /43537245306\/job\/132269105907/);
  A.equal((workflow.match(/^          HELMUT_CI_PR_HEAD_REF:/gm) || []).length, 2);
  const scoped = workflow.slice(0, workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal(/pull-requests: write|checks: write|statuses: write/.test(scoped), false);
});
test("Ergaenzung: nur achtes exaktes Profil aktiviert nur die neue Lage-Ergaenzung", () => {
  const p = C.validate(fixture(C.LAGEERGAENZUNG));
  for (const key of C.OUTPUTS) A.equal(p[key], key === "lageergaenzung");
  A.equal(p.source.pr, 1191); A.equal(p.source.base, C.LAGEERGAENZUNG.BASE);
  A.equal(C.LAGEERGAENZUNG.RUNTIME_FILES.length, 3); A.equal(C.LAGEERGAENZUNG.REGRESSION_FILES.length, 1);
  A.match(p.reused.status, /Browser bewusst nicht erneut/);
});
test("Ergaenzung: fremde Metadaten Ereignisse und Koepfe erhalten keine Ausnahme", () => {
  for (const change of [f => { f.pr.base.sha = C.TAGESFRISCHE.BASE; }, f => { f.prNumber = C.TAGESFRISCHE.PR; },
    f => { f.pr.number = C.PR; }, f => { f.headRef = C.TAGESFRISCHE.BRANCH; }, f => { f.pr.head.ref = C.BRANCH; },
    f => { f.pr.base.ref = "fremd"; }, f => { f.pr.base.repo.full_name = "fremd/repo"; },
    f => { f.pr.head.repo.full_name = "fremd/repo"; }, f => { f.pr.state = "closed"; },
    f => { delete f.pr.draft; }, f => { f.ref = "refs/heads/main"; }, f => { f.baseRef = "fremd"; },
    f => { f.event = "push"; }, f => { f.event = "workflow_dispatch"; }, f => { f.event = "pull_request_target"; },
    f => { f.repository = "fremd/repo"; }, f => { f.checkedOutHead = oid("1"); }]) denied(change, C.LAGEERGAENZUNG);
});
test("Ergaenzung: jeder Abnahmeblob und unveraenderte Runtime bleiben strikt gebunden", () => {
  for (const file of Object.keys(C.LAGEERGAENZUNG.BLOBS)) {
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.LAGEERGAENZUNG);
    denied(f => { f.headTree.delete(file); }, C.LAGEERGAENZUNG);
    denied(f => { f.headTree.get(file).mode = "100755"; }, C.LAGEERGAENZUNG);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.LAGEERGAENZUNG);
  }
  for (const file of ["package-lock.json", "scripts/lokal.js", "supabase/migrations/unveraenderte-basis.sql"])
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.LAGEERGAENZUNG);
  for (const file of ["client.js", "scripts/browser-smoke-test.js", "lib/helmut/ai.js", "lib/helmut/scalable-pipeline.js",
    "lib/helmut/storage.js", "lib/helmut/tagespaket-auslieferung.js"])
    denied(f => { f.headTree.set(file, row("1")); }, C.LAGEERGAENZUNG);
});
test("Ergaenzung: fehlende Belege und ungueltige CI stoppen geschlossen", () => {
  denied(f => { f.evidenceTree = new Map(); }, C.LAGEERGAENZUNG);
  denied(f => { f.evidenceTree.get("scripts/lokal.js").oid = oid("1"); }, C.LAGEERGAENZUNG);
  for (const file of C.CI_FILES) {
    denied(f => { f.headTree.delete(file); }, C.LAGEERGAENZUNG);
    denied(f => { f.headTree.get(file).mode = "120000"; }, C.LAGEERGAENZUNG);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.LAGEERGAENZUNG);
  }
});
test("Ergaenzung: Offlinejob fuehrt ausschliesslich neue Gegenfaelle Ergaenzungsinteraktionen und Syntax aus", () => {
  A.deepEqual(active("offline-suite", "browser-smoke", C.validate(fixture(C.LAGEERGAENZUNG))), [
    "Prüfplan aus geänderten Dateien", "Ergaenzung - neue Phaseninteraktionen und Profilbindung"
  ]);
  A.match(workflow, /ci-lieferreparatur-plan-test\.js --ergaenzung-only/);
  A.ok(workflow.includes("node scripts/lokal.js " + C.LAGEERGAENZUNG.REGRESSION_FILES[0]));
  A.match(workflow, /github\.event\.pull_request\.base\.sha == '0339f19e6167d9f0f9eff67b7acfb0e997af1180'/);
});
test("Ergaenzung: Browserjob bestaetigt unveraenderte Eingaben ohne erneuten Browserlauf", () => {
  A.deepEqual(active("browser-smoke", "synthetic-resource-diagnostic", C.validate(fixture(C.LAGEERGAENZUNG))), [
    "Prüfplan aus geänderten Dateien", "Ergaenzung - Browser bewusst nicht erneut ausfuehren"
  ]);
  A.match(workflow, /43537245306\/job\/132269105907/);
  A.equal((workflow.match(/^          HELMUT_CI_PR_HEAD_REF:/gm) || []).length, 2);
  const scoped = workflow.slice(0, workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal(/pull-requests: write|checks: write|statuses: write/.test(scoped), false);
});
test("Kostenvertrag: nur neuntes exaktes Profil aktiviert nur den neuen Kostenvertragsanschluss", () => {
  const p = C.validate(fixture(C.LAGEKOSTEN));
  for (const key of C.OUTPUTS) A.equal(p[key], key === "lagekostenvertrag");
  A.equal(p.source.pr, 1192); A.equal(p.source.base, C.LAGEKOSTEN.BASE);
  A.equal(C.LAGEKOSTEN.RUNTIME_FILES.length, 1); A.equal(C.LAGEKOSTEN.REGRESSION_FILES.length, 1);
  A.match(p.reused.status, /Browser bewusst nicht erneut/);
});
test("Kostenvertrag: fremde Metadaten Ereignisse und Koepfe erhalten keine Ausnahme", () => {
  for (const change of [f => { f.pr.base.sha = C.TAGESFRISCHE.BASE; }, f => { f.prNumber = C.TAGESFRISCHE.PR; },
    f => { f.pr.number = C.PR; }, f => { f.headRef = C.TAGESFRISCHE.BRANCH; }, f => { f.pr.head.ref = C.BRANCH; },
    f => { f.pr.base.ref = "fremd"; }, f => { f.pr.base.repo.full_name = "fremd/repo"; },
    f => { f.pr.head.repo.full_name = "fremd/repo"; }, f => { f.pr.state = "closed"; },
    f => { delete f.pr.draft; }, f => { f.ref = "refs/heads/main"; }, f => { f.baseRef = "fremd"; },
    f => { f.event = "push"; }, f => { f.event = "workflow_dispatch"; }, f => { f.event = "pull_request_target"; },
    f => { f.repository = "fremd/repo"; }, f => { f.checkedOutHead = oid("1"); }]) denied(change, C.LAGEKOSTEN);
});
test("Kostenvertrag: jeder Abnahmeblob und unveraenderte Runtime bleiben strikt gebunden", () => {
  for (const file of Object.keys(C.LAGEKOSTEN.BLOBS)) {
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.LAGEKOSTEN);
    denied(f => { f.headTree.delete(file); }, C.LAGEKOSTEN);
    denied(f => { f.headTree.get(file).mode = "100755"; }, C.LAGEKOSTEN);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.LAGEKOSTEN);
  }
  for (const file of ["package-lock.json", "scripts/lokal.js", "supabase/migrations/unveraenderte-basis.sql"])
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.LAGEKOSTEN);
  for (const file of ["client.js", "scripts/browser-smoke-test.js", "lib/helmut/ai.js", "lib/helmut/scalable-pipeline.js",
    "lib/helmut/storage.js", "lib/helmut/tagespaket-auslieferung.js"])
    denied(f => { f.headTree.set(file, row("1")); }, C.LAGEKOSTEN);
});
test("Kostenvertrag: fehlende Belege und ungueltige CI stoppen geschlossen", () => {
  denied(f => { f.evidenceTree = new Map(); }, C.LAGEKOSTEN);
  denied(f => { f.evidenceTree.get("scripts/lokal.js").oid = oid("1"); }, C.LAGEKOSTEN);
  for (const file of C.CI_FILES) {
    denied(f => { f.headTree.delete(file); }, C.LAGEKOSTEN);
    denied(f => { f.headTree.get(file).mode = "120000"; }, C.LAGEKOSTEN);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.LAGEKOSTEN);
  }
});
test("Kostenvertrag: Offlinejob fuehrt ausschliesslich neue Gegenfaelle Ergaenzungsinteraktionen und Syntax aus", () => {
  A.deepEqual(active("offline-suite", "browser-smoke", C.validate(fixture(C.LAGEKOSTEN))), [
    "Prüfplan aus geänderten Dateien", "Kostenvertrag - neue native Vertragsinteraktionen und Profilbindung"
  ]);
  A.match(workflow, /ci-lieferreparatur-plan-test\.js --kostenvertrag-plan-only/);
  A.ok(workflow.includes("node scripts/lokal.js " + C.LAGEKOSTEN.REGRESSION_FILES[0] + " --kostenvertrag-only"));
  A.match(workflow, /github\.event\.pull_request\.base\.sha == '21816be73c5a7a759b35e907b9030a37d5c9b294'/);
});
test("Kostenvertrag: Browserjob bestaetigt unveraenderte Eingaben ohne erneuten Browserlauf", () => {
  A.deepEqual(active("browser-smoke", "synthetic-resource-diagnostic", C.validate(fixture(C.LAGEKOSTEN))), [
    "Prüfplan aus geänderten Dateien", "Kostenvertrag - Browser bewusst nicht erneut ausfuehren"
  ]);
  A.match(workflow, /43537245306\/job\/132269105907/);
  A.equal((workflow.match(/^          HELMUT_CI_PR_HEAD_REF:/gm) || []).length, 2);
  const scoped = workflow.slice(0, workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal(/pull-requests: write|checks: write|statuses: write/.test(scoped), false);
});
test("Kundenansicht: nur zehntes exaktes Profil aktiviert nur neue Kundenansichten", () => {
  const p = C.validate(fixture(C.KUNDENANSICHTEN));
  for (const key of C.OUTPUTS) A.equal(p[key], key === "kundenansichten");
  A.equal(p.source.pr, 1193); A.equal(p.source.base, C.KUNDENANSICHTEN.BASE);
  A.equal(C.KUNDENANSICHTEN.RUNTIME_FILES.length, 3); A.equal(C.KUNDENANSICHTEN.REGRESSION_FILES.length, 3);
  A.match(p.reused.status, /Neue Browserfaelle werden ausgefuehrt/);
});
test("Kundenansicht: fremde Metadaten Ereignisse und Koepfe erhalten keine Ausnahme", () => {
  for (const change of [f => { f.pr.base.sha = C.TAGESFRISCHE.BASE; }, f => { f.prNumber = C.TAGESFRISCHE.PR; },
    f => { f.pr.number = C.PR; }, f => { f.headRef = C.TAGESFRISCHE.BRANCH; }, f => { f.pr.head.ref = C.BRANCH; },
    f => { f.pr.base.ref = "fremd"; }, f => { f.pr.base.repo.full_name = "fremd/repo"; },
    f => { f.pr.head.repo.full_name = "fremd/repo"; }, f => { f.pr.state = "closed"; },
    f => { delete f.pr.draft; }, f => { f.ref = "refs/heads/main"; }, f => { f.baseRef = "fremd"; },
    f => { f.event = "push"; }, f => { f.event = "workflow_dispatch"; }, f => { f.event = "pull_request_target"; },
    f => { f.repository = "fremd/repo"; }, f => { f.checkedOutHead = oid("1"); }]) denied(change, C.KUNDENANSICHTEN);
});
test("Kundenansicht: jeder Abnahmeblob und unveraenderte Runtime bleiben strikt gebunden", () => {
  for (const file of Object.keys(C.KUNDENANSICHTEN.BLOBS)) {
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.KUNDENANSICHTEN);
    denied(f => { f.headTree.delete(file); }, C.KUNDENANSICHTEN);
    denied(f => { f.headTree.get(file).mode = "100755"; }, C.KUNDENANSICHTEN);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.KUNDENANSICHTEN);
  }
  for (const file of ["package-lock.json", "scripts/lokal.js", "supabase/migrations/unveraenderte-basis.sql"])
    denied(f => { f.headTree.get(file).oid = oid("1"); }, C.KUNDENANSICHTEN);
  for (const file of ["client.js", "scripts/browser-smoke-test.js", "lib/helmut/ai.js", "lib/helmut/scalable-pipeline.js",
    "lib/helmut/storage.js", "lib/helmut/tagespaket-auslieferung.js"])
    denied(f => { f.headTree.set(file, row("1")); }, C.KUNDENANSICHTEN);
});
test("Kundenansicht: fehlende Belege und ungueltige CI stoppen geschlossen", () => {
  denied(f => { f.evidenceTree = new Map(); }, C.KUNDENANSICHTEN);
  denied(f => { f.evidenceTree.get("scripts/lokal.js").oid = oid("1"); }, C.KUNDENANSICHTEN);
  for (const file of C.CI_FILES) {
    denied(f => { f.headTree.delete(file); }, C.KUNDENANSICHTEN);
    denied(f => { f.headTree.get(file).mode = "120000"; }, C.KUNDENANSICHTEN);
    denied(f => { f.headTree.get(file).type = "commit"; }, C.KUNDENANSICHTEN);
  }
});
test("Kundenansicht: Offlinejob fuehrt ausschliesslich neue Gegenfaelle Radarbestandsinteraktionen und Syntax aus", () => {
  A.deepEqual(active("offline-suite", "browser-smoke", C.validate(fixture(C.KUNDENANSICHTEN))), [
    "Prüfplan aus geänderten Dateien", "Kundenansichten - neue Radarbestandsfaelle und Profilbindung"
  ]);
  A.match(workflow, /ci-lieferreparatur-plan-test\.js --kundenansichten-runner-only/);
  A.ok(!workflow.includes("node scripts/lokal.js " + C.KUNDENANSICHTEN.REGRESSION_FILES[0]));
  A.match(workflow, /43576427744/); A.match(workflow, /132391553513/);
  A.match(workflow, /git diff --exit-code fe9e0eb0a01cfd25ecd464c77dceadb3e62052d1 HEAD/);
  A.match(workflow, /github\.event\.pull_request\.base\.sha == '097d14e29be63e0c19d7c8fedae9e7eb16195c57'/);
});
test("Kundenansicht: Browserjob fuehrt nur neue Kundenansichten mit Browserpflicht aus", () => {
  A.deepEqual(active("browser-smoke", "synthetic-resource-diagnostic", C.validate(fixture(C.KUNDENANSICHTEN))), [
    "Prüfplan aus geänderten Dateien", "Abhängigkeiten installieren (aus package-lock.json)",
    "Playwright + Chromium installieren", "Kundenansichten - neue sichtbare Lage und ehrlicher Radarbestand"
  ]);
  A.match(workflow, /43537245306\/job\/132269105907/);
  A.equal((workflow.match(/^          HELMUT_CI_PR_HEAD_REF:/gm) || []).length, 2);
  const scoped = workflow.slice(0, workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal(/pull-requests: write|checks: write|statuses: write/.test(scoped), false);
});
test("Kundenansicht: kompatibler Runner ist nur am exakten1193Tupel gepinnt und Browser bleibt Pflicht", () => {
  const browser = workflow.slice(workflow.indexOf("  browser-smoke:"), workflow.indexOf("  synthetic-resource-diagnostic:"));
  const runner = browser.split("\n").find(line => line.startsWith("    runs-on:"));
  A.equal(runner, "    runs-on: ${{ github.event_name == 'pull_request' && github.repository == 'ernisch/helmut-pilot' && ((github.event.number == 1193 && github.event.pull_request.base.sha == '097d14e29be63e0c19d7c8fedae9e7eb16195c57' && github.event.pull_request.head.ref == 'codex/kundenansichten-20261114') || (github.event.number == 1194 && github.event.pull_request.base.sha == '4a49cbefa84950128116599dd667b181f79909be' && github.event.pull_request.head.ref == 'codex/briefing-fenster-20261114') || (github.event.number == 1196 && github.event.pull_request.base.sha == '87505694ae9318d660f2052e634613d720729c03' && github.event.pull_request.head.ref == 'codex/radar-artikelanzeige-20261114')) && 'ubuntu-24.04' || 'ubuntu-latest' }}");
  A.match(browser, /playwright@1\.56\.1/); A.match(browser, /HELMUT_REQUIRE_BROWSER: "1"/);
  A.match(browser, /node scripts\/lokal\.js scripts\/browser-smoke-test\.js --kundenansichten/);
});


test("Briefingfenster: exaktes Profil prueft nur neue Bindungsfaelle und Syntax", () => {
  const p=C.validate(fixture(C.BRIEFINGFENSTER));
  for(const key of C.OUTPUTS) A.equal(p[key],key==="briefingfenster");
  A.equal(p.source.pr,1194);A.equal(p.source.base,C.BRIEFINGFENSTER.BASE);
  A.equal(C.BRIEFINGFENSTER.RUNTIME_FILES.length,7);A.equal(C.BRIEFINGFENSTER.REGRESSION_FILES.length,4);
  A.match(p.reused.status,/Lokale neue Checkpoint/);A.match(p.reused.status,/nicht erneut/);
});
test("Briefingfenster: fremde Ereignisse Metadaten Basen und Koepfe bleiben gesperrt", () => {
  for(const change of [f=>{f.pr.base.sha=C.LAGEKOSTEN.BASE;},f=>{f.prNumber++;},f=>{f.pr.number++;},
    f=>{f.headRef="fremd";},f=>{f.pr.head.ref="fremd";},f=>{f.pr.base.ref="fremd";},
    f=>{f.pr.base.repo.full_name="fremd/repo";},f=>{f.pr.head.repo.full_name="fremd/repo";},
    f=>{f.pr.state="closed";},f=>{delete f.pr.draft;},f=>{f.ref="refs/heads/main";},
    f=>{f.event="push";},f=>{f.event="workflow_dispatch";},f=>{f.event="pull_request_target";},
    f=>{f.repository="fremd/repo";},f=>{f.checkedOutHead=oid("1");}])denied(change,C.BRIEFINGFENSTER);
});
test("Briefingfenster: jeder Abnahmeblob und alle unveraenderten Abhaengigkeiten sind verpflichtend", () => {
  for(const file of Object.keys(C.BRIEFINGFENSTER.BLOBS)) for(const change of [
    f=>{f.headTree.get(file).oid=oid("1");},f=>{f.headTree.delete(file);},
    f=>{f.headTree.get(file).mode="100755";},f=>{f.headTree.get(file).type="commit";}])denied(change,C.BRIEFINGFENSTER);
  for(const file of ["package-lock.json","scripts/lokal.js","supabase/migrations/unveraenderte-basis.sql"])
    denied(f=>{f.headTree.get(file).oid=oid("1");},C.BRIEFINGFENSTER);
  for(const file of ["styles.css","lib/helmut/ai.js","lib/helmut/scalable-pipeline.js"])
    denied(f=>{f.headTree.set(file,row("1"));},C.BRIEFINGFENSTER);
});
test("Briefingfenster: fehlende Evidence und ungueltige CI Dateien stoppen geschlossen", () => {
  denied(f=>{f.evidenceTree=new Map();},C.BRIEFINGFENSTER);
  denied(f=>{f.evidenceTree.get("scripts/lokal.js").oid=oid("1");},C.BRIEFINGFENSTER);
  for(const file of C.CI_FILES) for(const change of [f=>{f.headTree.delete(file);},
    f=>{f.headTree.get(file).mode="120000";},f=>{f.headTree.get(file).type="commit";}])denied(change,C.BRIEFINGFENSTER);
});
test("Briefingfenster: Offlinejob wiederholt keine bestandenen lokalen Fach oder Mengenpruefungen", () => {
  A.deepEqual(active("offline-suite","browser-smoke",C.validate(fixture(C.BRIEFINGFENSTER))),[
    "Prüfplan aus geänderten Dateien","Briefingfenster - neue Profilbindung und geaenderte Syntax"]);
  A.match(workflow,/ci-lieferreparatur-plan-test\.js --briefingfenster-only/);
  const section=workflow.slice(workflow.indexOf("      - name: Briefingfenster - neue Profilbindung"),workflow.indexOf("      - name: Kundenansichten - neue Radarbestandsfaelle"));
  for(const file of C.BRIEFINGFENSTER.REGRESSION_FILES)A.equal(section.includes("node scripts/lokal.js "+file),false);
  A.match(section,/WIEDERVERWENDET/);A.match(section,/ci-lieferreparatur-plan\.js --syntax/);
  A.match(workflow,/github\.event\.pull_request\.base\.sha == '4a49cbefa84950128116599dd667b181f79909be'/);
});
test("Briefingfenster: Browserjob prueft nur neue gebundene Briefingteilstaende Desktop und Mobil", () => {
  A.deepEqual(active("browser-smoke","synthetic-resource-diagnostic",C.validate(fixture(C.BRIEFINGFENSTER))),[
    "Prüfplan aus geänderten Dateien","Abhängigkeiten installieren (aus package-lock.json)",
    "Playwright + Chromium installieren","Briefingfenster - neuer gepruefter Teilstand Desktop und Mobil"]);
  const scoped=workflow.slice(0,workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal(/pull-requests: write|checks: write|statuses: write/.test(scoped),false);
  A.match(workflow,/node scripts\/lokal\.js scripts\/browser-smoke-test\.js --briefing-teilstand/);
  const browser=workflow.slice(workflow.indexOf("  browser-smoke:"),workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.match(browser,/HELMUT_REQUIRE_BROWSER: "1"/);
  A.ok(browser.includes("runs-on: ${{ github.event_name == 'pull_request' && github.repository == 'ernisch/helmut-pilot' && ((github.event.number == 1193 && github.event.pull_request.base.sha == '097d14e29be63e0c19d7c8fedae9e7eb16195c57' && github.event.pull_request.head.ref == 'codex/kundenansichten-20261114') || (github.event.number == 1194 && github.event.pull_request.base.sha == '4a49cbefa84950128116599dd667b181f79909be' && github.event.pull_request.head.ref == 'codex/briefing-fenster-20261114') || (github.event.number == 1196 && github.event.pull_request.base.sha == '87505694ae9318d660f2052e634613d720729c03' && github.event.pull_request.head.ref == 'codex/radar-artikelanzeige-20261114')) && 'ubuntu-24.04' || 'ubuntu-latest' }}"));
});


test("Volltextschutz: exaktes Profil bindet allein Bestandsschutz und neue Regression",()=>{
  const p=C.validate(fixture(C.VOLLTEXTSCHUTZ));for(const key of C.OUTPUTS)A.equal(p[key],key==="briefingvolltext");
  A.equal(p.source.pr,1195);A.equal(p.source.base,C.VOLLTEXTSCHUTZ.BASE);
  A.deepEqual(C.VOLLTEXTSCHUTZ.RUNTIME_FILES,["lib/helmut/briefing-speicher.js"]);
  A.deepEqual(C.VOLLTEXTSCHUTZ.REGRESSION_FILES,["scripts/briefing-volltext-erhalt-test.js"]);
  A.match(p.reused.status,/nicht erneut/);A.match(p.reused.urls[0],/43584269849/);
});
test("Volltextschutz: fremde Ereignisse Metadaten Basen Koepfe und Forks bleiben gesperrt",()=>{
  for(const change of [f=>{f.pr.base.sha=C.BRIEFINGFENSTER.BASE;},f=>{f.prNumber++;},f=>{f.pr.number++;},
    f=>{f.headRef="fremd";},f=>{f.pr.head.ref="fremd";},f=>{f.pr.base.ref="fremd";},
    f=>{f.pr.base.repo.full_name="fremd/repo";},f=>{f.pr.head.repo.full_name="fremd/repo";},
    f=>{f.pr.state="closed";},f=>{delete f.pr.draft;},f=>{f.ref="refs/heads/main";},
    f=>{f.event="push";},f=>{f.event="workflow_dispatch";},f=>{f.event="pull_request_target";},
    f=>{f.repository="fremd/repo";},f=>{f.checkedOutHead=oid("1");}])denied(change,C.VOLLTEXTSCHUTZ);
});
test("Volltextschutz: alle fuenf Abnahmeblobs und der uebrige Dateibaum bleiben streng",()=>{
  for(const file of Object.keys(C.VOLLTEXTSCHUTZ.BLOBS))for(const change of [
    f=>{f.headTree.get(file).oid=oid("1");},f=>{f.headTree.delete(file);},
    f=>{f.headTree.get(file).mode="100755";},f=>{f.headTree.get(file).type="commit";}])denied(change,C.VOLLTEXTSCHUTZ);
  for(const file of ["server.js","package-lock.json","scripts/lokal.js","supabase/migrations/unveraenderte-basis.sql"])
    denied(f=>{f.headTree.get(file).oid=oid("1");},C.VOLLTEXTSCHUTZ);
  for(const file of ["client.js","lib/helmut/ai.js","lib/helmut/storage.js","lib/helmut/tagespaket-auslieferung.js","scripts/browser-smoke-test.js"])
    denied(f=>{f.headTree.set(file,row("1"));},C.VOLLTEXTSCHUTZ);
});
test("Volltextschutz: fehlende Evidence und ungueltige CI Dateien stoppen geschlossen",()=>{
  denied(f=>{f.evidenceTree=new Map();},C.VOLLTEXTSCHUTZ);
  denied(f=>{f.evidenceTree.get("scripts/lokal.js").oid=oid("1");},C.VOLLTEXTSCHUTZ);
  for(const file of C.CI_FILES)for(const change of [f=>{f.headTree.delete(file);},
    f=>{f.headTree.get(file).mode="120000";},f=>{f.headTree.get(file).type="commit";}])denied(change,C.VOLLTEXTSCHUTZ);
});
test("Volltextschutz: Offlinejob prueft nur neue Planfaelle Syntax und wiederholt keinen Fachfall",()=>{
  A.deepEqual(active("offline-suite","browser-smoke",C.validate(fixture(C.VOLLTEXTSCHUTZ))),[
    "Prüfplan aus geänderten Dateien","Briefingvolltext - neue Profilbindung und geaenderte Syntax"]);
  const section=workflow.slice(workflow.indexOf("      - name: Briefingvolltext - neue Profilbindung"),workflow.indexOf("      - name: Briefingfenster - neue Profilbindung"));
  A.match(section,/ci-lieferreparatur-plan-test\.js --volltextschutz-only/);
  A.match(section,/ci-lieferreparatur-plan\.js --syntax/);A.match(section,/WIEDERVERWENDET/);
  A.equal(section.includes("node scripts/lokal.js scripts/briefing-volltext-erhalt-test.js"),false);
  A.match(workflow,/github\.event\.pull_request\.base\.sha == 'e148640fb195b9a713f613e868965e5990ee9c9a'/);
});
test("Volltextschutz: Browserjob behaelt unveraenderte Belege ohne neuen Browser oder Mengenlauf",()=>{
  A.deepEqual(active("browser-smoke","synthetic-resource-diagnostic",C.validate(fixture(C.VOLLTEXTSCHUTZ))),[
    "Prüfplan aus geänderten Dateien","Briefingvolltext - unveraenderten Browserbeleg erhalten"]);
  const scoped=workflow.slice(0,workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.equal(/pull-requests: write|checks: write|statuses: write/.test(scoped),false);
  A.match(workflow,/Kein neuer Browser-PASS/);
});


test("Radarartikel: exaktes Profil bindet nur Quellenanzeige und neue Regression",()=>{
  const p=C.validate(fixture(C.RADARARTIKEL));for(const key of C.OUTPUTS)A.equal(p[key],key==="radarartikel");
  A.equal(p.source.pr,1196);A.equal(p.source.base,C.RADARARTIKEL.BASE);
  A.equal(C.RADARARTIKEL.RUNTIME_FILES.length,2);A.equal(C.RADARARTIKEL.REGRESSION_FILES.length,2);
  A.match(p.reused.status,/Nur neue Radarartikel/);
});
test("Radarartikel: fremde Ereignisse Metadaten Basen Koepfe und Forks bleiben gesperrt",()=>{
  for(const change of [f=>{f.pr.base.sha=C.VOLLTEXTSCHUTZ.BASE;},f=>{f.prNumber++;},f=>{f.pr.number++;},
    f=>{f.headRef="fremd";},f=>{f.pr.head.ref="fremd";},f=>{f.pr.base.ref="fremd";},
    f=>{f.pr.base.repo.full_name="fremd/repo";},f=>{f.pr.head.repo.full_name="fremd/repo";},
    f=>{f.pr.state="closed";},f=>{delete f.pr.draft;},f=>{f.ref="refs/heads/main";},
    f=>{f.event="push";},f=>{f.event="workflow_dispatch";},f=>{f.event="pull_request_target";},
    f=>{f.repository="fremd/repo";},f=>{f.checkedOutHead=oid("1");}])denied(change,C.RADARARTIKEL);
});
test("Radarartikel: alle sieben Abnahmeblobs und uebrige Abhaengigkeiten bleiben strikt",()=>{
  for(const file of Object.keys(C.RADARARTIKEL.BLOBS))for(const change of [
    f=>{f.headTree.get(file).oid=oid("1");},f=>{f.headTree.delete(file);},
    f=>{f.headTree.get(file).mode="100755";},f=>{f.headTree.get(file).type="commit";}])denied(change,C.RADARARTIKEL);
  for(const file of ["server.js","package-lock.json","scripts/lokal.js","supabase/migrations/unveraenderte-basis.sql"])
    denied(f=>{f.headTree.get(file).oid=oid("1");},C.RADARARTIKEL);
  for(const file of ["client.js","lib/helmut/ai.js","lib/helmut/storage.js","lib/helmut/briefing-speicher.js"])
    denied(f=>{f.headTree.set(file,row("1"));},C.RADARARTIKEL);
});
test("Radarartikel: fehlende Evidence und ungueltige CI Dateien stoppen geschlossen",()=>{
  denied(f=>{f.evidenceTree=new Map();},C.RADARARTIKEL);
  denied(f=>{f.evidenceTree.get("scripts/lokal.js").oid=oid("1");},C.RADARARTIKEL);
  for(const file of C.CI_FILES)for(const change of [f=>{f.headTree.delete(file);},
    f=>{f.headTree.get(file).mode="120000";},f=>{f.headTree.get(file).type="commit";}])denied(change,C.RADARARTIKEL);
});
test("Radarartikel: Offlinejob prueft nur neue Planfaelle und Syntax ohne Fachwiederholung",()=>{
  A.deepEqual(active("offline-suite","browser-smoke",C.validate(fixture(C.RADARARTIKEL))),[
    "Prüfplan aus geänderten Dateien","Radarartikel - neue Profilbindung und geaenderte Syntax"]);
  const section=workflow.slice(workflow.indexOf("      - name: Radarartikel - neue Profilbindung"),workflow.indexOf("      - name: Briefingvolltext - neue Profilbindung"));
  A.match(section,/ci-lieferreparatur-plan-test\.js --radarartikel-nachtrag-only/);
  for(const file of ["scripts/browser-smoke-test.js","scripts/ci-lieferreparatur-plan.js","scripts/ci-lieferreparatur-plan-test.js"])A.ok(section.includes("node scripts/lokal.js -- node --check "+file));
  A.match(section,/43589058224/);A.equal(section.includes("ci-lieferreparatur-plan.js --syntax"),false);
  A.match(section,/WIEDERVERWENDET/);A.equal(section.includes("node scripts/lokal.js scripts/radar-einzelartikel-titelbindung-test.js"),false);
  A.match(workflow,/github\.event\.pull_request\.base\.sha == '87505694ae9318d660f2052e634613d720729c03'/);
});
test("Radarartikel: Browserjob prueft nur neue Artikelanzeige mit PflichtChromium auf exaktem1196Runner",()=>{
  A.deepEqual(active("browser-smoke","synthetic-resource-diagnostic",C.validate(fixture(C.RADARARTIKEL))),[
    "Prüfplan aus geänderten Dateien","Abhängigkeiten installieren (aus package-lock.json)",
    "Playwright + Chromium installieren","Radarartikel - neue Artikelbindung Desktop und Mobil"]);
  const browser=workflow.slice(workflow.indexOf("  browser-smoke:"),workflow.indexOf("  synthetic-resource-diagnostic:"));
  A.match(browser,/HELMUT_REQUIRE_BROWSER: "1"/);A.match(browser,/playwright@1\.56\.1/);
  A.match(browser,/node scripts\/lokal\.js scripts\/browser-smoke-test\.js --radar-artikelbindung/);
  A.ok(browser.includes("runs-on: ${{ github.event_name == 'pull_request' && github.repository == 'ernisch/helmut-pilot' && ((github.event.number == 1193 && github.event.pull_request.base.sha == '097d14e29be63e0c19d7c8fedae9e7eb16195c57' && github.event.pull_request.head.ref == 'codex/kundenansichten-20261114') || (github.event.number == 1194 && github.event.pull_request.base.sha == '4a49cbefa84950128116599dd667b181f79909be' && github.event.pull_request.head.ref == 'codex/briefing-fenster-20261114') || (github.event.number == 1196 && github.event.pull_request.base.sha == '87505694ae9318d660f2052e634613d720729c03' && github.event.pull_request.head.ref == 'codex/radar-artikelanzeige-20261114')) && 'ubuntu-24.04' || 'ubuntu-latest' }}"));
  A.equal(/pull-requests: write|checks: write|statuses: write/.test(workflow.slice(0,workflow.indexOf("  synthetic-resource-diagnostic:"))),false);
});

A.ok(count > 0);
console.log(`${count}/${count} ${radarartikelNachtrag ? "geaenderte Radarartikel-Nachtragsgruppe" : radarartikelOnly ? "neue Radarartikel-Profilgegenfaelle" : volltextOnly ? "neue Volltextschutz-Profilgegenfaelle" : fensterOnly ? "neue Briefingfenster-Profilgegenfaelle" : kundenRunnerOnly ? "neue/geaenderte Kundenansicht-Runnergruppen" : kundenOnly ? "neue Kundenansicht-Profilgegenfaelle" : kostenOnly ? "neue Kostenvertrags-Profilgegenfaelle" : ergaenzungOnly ? "neue Ergaenzungs-Profilgegenfaelle" : konfliktOnly ? "neue Versionskonflikt-Profilgegenfaelle" : abrufOnly ? "neue Abrufanteil-Profilgegenfaelle" : frischeNachtrag ? "geaenderte Frische-Nachtragsgruppen" : frischeOnly ? "neue Frische-Profilgegenfaelle" : teilstandOnly ? "neue Teilstand-Profilgegenfaelle" : mandatOnly ? "neue Mandatsphasen-Profilgegenfaelle" : dipOnly ? "neue DIP-Profilgegenfaelle" : nachtrag ? "betroffene/neue Nachtragsfaelle" : "neue Lieferreparatur-Planpruefungen"} bestanden; keine Fach-/Mengenwiederholung.`);
