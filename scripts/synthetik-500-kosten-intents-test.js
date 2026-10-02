"use strict";

const A = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const P = require("../lib/helmut/synthetik-500-profile");
const I = require("../lib/helmut/synthetik-500-kosten-intents");
const C = require("./synthetik-500-kosten-intents");
const paket = P.erzeuge();
const inputs = () => ({ version: I.INPUT_VERSION, runId: "nachlauf500-1790935200000",
  window: { startUTC: "2026-10-02T12:00:00.000Z", endUTC: "2026-10-02T16:00:00.000Z" },
  model: "gpt-5-mini", reviewMaxOutputTokens: 3000,
  lageInputs: paket.profile.map(p => ({ owner: p.mandatsId, inputVersionHash: P.hash({ fictionalInput: p }) })),
  understandingInputs: [{ vorgangId: "fixture-vorgang-1", inputVersionHash: P.hash("fictional-version-1") }] });
let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log("PASS " + name); };
function capture(fn) {
  const saved = console.log, lines = [];
  try { console.log = x => lines.push(String(x)); return { result: fn(), stdout: lines.join("\n") }; }
  finally { console.log = saved; }
}
function main() {
  const originalFetch = global.fetch;
  let httpCalls = 0;
  global.fetch = () => { httpCalls++; throw new Error("no-provider-in-preparation"); };
  try {
    test("Endliche Inventur500D/500R/expliziteU und1500Sollpositionen", () => {
      const p = I.vorbereite(paket, inputs());
      A.deepEqual(p.phaseInventory, { D: 500, R: 500, U: 1, knownPositions: 1001,
        unresolvedReviewInputVersions: 500, totalPositionsFinite: true });
      A.equal(new Set(p.intents.map(x => x.id)).size, 1001);
      A.equal(p.packageBinding.expectedOutputs, 1500);
      A.ok(p.intents.every(x => x.attemptLimit === 1));
    });
    test("R hat keinen erfundenen Prompthash und ist an genau seinenD/Kontext gebunden", () => {
      const p = I.vorbereite(paket, inputs()), drafts = new Map(p.intents.filter(x => x.phase === "D").map(x => [x.id, x]));
      for (const r of p.intents.filter(x => x.phase === "R")) {
        const d = drafts.get(r.dependsOn);
        A.equal(r.inputVersionHash, null); A.equal(d.owner, r.owner);
        A.equal(d.inputVersionHash, r.contextVersionHash);
        A.match(r.binding, /^pending-confirmed-draft/);
      }
    });
    test("U unbekannt bleibt fehlend; deklarierte leereListe beweist keinen Production-Ausschluss", () => {
      const e = inputs(); e.understandingInputs = null;
      const missing = I.vorbereite(paket, e);
      A.equal(missing.phaseInventory.U, null); A.equal(missing.phaseInventory.totalPositionsFinite, false);
      A.equal(missing.money.enumeratedTextConditionalGrossReserveMicroUsd, null);
      A.ok(missing.remainingGuards.includes("finite-understanding-input-version-list"));
      e.understandingInputs = [];
      const empty = I.vorbereite(paket, e);
      A.equal(empty.phaseInventory.U, 0); A.equal(empty.status.runtimeEnforcement, false);
      A.ok(empty.remainingGuards.includes("embedding-and-other-paid-paths-excluded-or-separately-bounded"));
    });
    test("Geldbeträge sind bedingte Bruttosummen,6/7 unverändert, Ganzbudget/GO leer", () => {
      const p = I.vorbereite(paket, inputs());
      A.equal(p.money.DAndRConditionalGrossReserveMicroUsd, 212000000);
      A.equal(p.money.enumeratedTextConditionalGrossReserveMicroUsd, 212212000);
      A.equal(p.money.dailyLimitMicroUsd, 6000000); A.equal(p.money.cumulativeLimitMicroUsd, 7000000);
      A.equal(p.money.wholeRunMaximumCostMicroUsd, null); A.equal(p.money.requestedBudgetMicroUsd, null);
      A.equal(p.status.executionReady, false); A.equal(p.status.paidGo, false); A.equal(p.status.budgetGo, false);
    });
    test("Bestehender6000Reviewmodus bleibt explizit,3000Standard unverändert", () => {
      const e = inputs(); e.reviewMaxOutputTokens = 6000;
      const p = I.vorbereite(paket, e);
      A.equal(p.money.DAndRConditionalGrossReserveMicroUsd, 218000000);
      A.ok(p.intents.filter(x => x.phase === "R").every(x => x.maxOutputTokens === 6000));
      for (const n of [0, 1500, 8000]) { e.reviewMaxOutputTokens = n; A.throws(() => I.vorbereite(paket, e), /qualitaetsmodus/); }
    });
    test("Ungeordnete echteBindungslisten erzeugen denselben deterministischenPlan", () => {
      const e = inputs(), expected = I.vorbereite(paket, e);
      e.lageInputs.reverse();
      A.deepEqual(I.vorbereite(paket, e), expected);
      A.deepEqual(JSON.parse(I.serialisiere(expected, paket)), expected);
    });
    test("Eine Inputversion verändert Plan und betroffeneD/RIdentität; alterBelegdrift stoppt", () => {
      const e = inputs(), old = I.vorbereite(paket, e), changed = structuredClone(e);
      changed.lageInputs[0].inputVersionHash = P.hash("changed-fixture-version");
      const newer = I.vorbereite(paket, changed);
      A.notEqual(newer.planHash, old.planHash);
      const a = old.intents.filter(x => x.owner === e.lageInputs[0].owner);
      const b = newer.intents.filter(x => x.owner === e.lageInputs[0].owner);
      A.notEqual(a[0].id, b[0].id); A.notEqual(a[1].id, b[1].id);
      const drift = structuredClone(old); drift.inputs = changed;
      A.throws(() => I.pruefe(drift, paket), /vorbereitung-drift/);
    });
    test("Doppelte/fremde/fehlendeProfile und duplizierteVorgangsversionen werden abgewiesen", () => {
      for (const mutate of [e => e.lageInputs.pop(), e => { e.lageInputs[1] = e.lageInputs[0]; },
        e => { e.lageInputs[0].owner = "real-profile"; }, e => { e.lageInputs[0].inputVersionHash = "invalid"; },
        e => e.understandingInputs.push({ ...e.understandingInputs[0], inputVersionHash: P.hash("other-version") })]) {
        const e = inputs(); mutate(e); A.throws(() => I.vorbereite(paket, e), /synthetik500-intents-/);
      }
    });
    test("VierStunden/sameUTC und gültigeDatumsfelder stopppen vorInventur", () => {
      for (const [start, end] of [["2026-10-02T12:00:00.000Z", "2026-10-02T16:00:00.001Z"],
        ["2026-10-02T23:00:00.000Z", "2026-10-03T01:00:00.000Z"],
        ["2026-10-02T12:00:00.000Z", "2026-10-02T12:00:00.000Z"],
        ["2026-02-30T12:00:00.000Z", "2026-02-30T13:00:00.000Z"]]) {
        const e = inputs(); e.window = { startUTC: start, endUTC: end };
        A.throws(() => I.vorbereite(paket, e), /utc-format|fenster-grenze/);
      }
    });
    test("ZusätzlicheGO/Budget/Intents/Kundenparameter werden nicht als Freigabe akzeptiert", () => {
      for (const field of ["paidGo", "budgetGo", "dailyLimitMicroUsd", "attemptLimit", "intents", "executionReady"]) {
        const e = inputs(); e[field] = true; A.throws(() => I.vorbereite(paket, e), /eingaben-format/);
      }
      const p = I.vorbereite(paket, inputs()); p.status.executionReady = true;
      A.throws(() => I.pruefe(p, paket), /vorbereitung-drift/);
    });
    test("PrivateCLI meldet nur Mengen/Hashes und erzeugt0600 ohne Überschreiben", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "synthetik500-intents-"));
      try {
        const pfile = path.join(dir, "paket.json"), efile = path.join(dir, "inputs.json"), out = path.join(dir, "plan.json");
        fs.writeFileSync(pfile, P.serialisiere(paket), { mode: 0o600 });
        fs.writeFileSync(efile, JSON.stringify(inputs()), { mode: 0o600 });
        const { result, stdout } = capture(() => C.main(["--paket", pfile, "--eingaben", efile, "--out", out]));
        A.equal(result.status.executionReady, false); A.equal(fs.statSync(out).mode & 0o777, 0o600);
        A.doesNotMatch(stdout, /test-kohorte-synthetik-|fixture-vorgang|Fiktive Testperson/);
        const before = fs.readFileSync(out);
        A.throws(() => capture(() => C.main(["--paket", pfile, "--eingaben", efile, "--out", out])));
        A.deepEqual(fs.readFileSync(out), before);
        fs.chmodSync(efile, 0o644); A.throws(() => C.lesePrivat(efile), /private-eingabe/);
        const link = path.join(dir, "link.json"); fs.symlinkSync(pfile, link);
        A.throws(() => C.lesePrivat(link), /private-eingabe/);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    test("CLI akzeptiert keine Runtime-/HTTP-/DB-Optionen oder relativen Eingabepfade", () => {
      for (const argv of [["--aktivieren", "true", "--eingaben", "/tmp/a"],
        ["--paket", "relative.json", "--eingaben", "/tmp/a"],
        ["--paket", "/tmp/a", "--paket", "/tmp/b"],
        ["--paket", "/tmp/a", "--eingaben", "/tmp/b", "--sql", "/tmp/x"]])
        A.throws(() => C.argumente(argv), /cli-argumente/);
      A.equal(httpCalls, 0);
    });
  } finally { global.fetch = originalFetch; }
  console.log(`${pass}/${pass} neue Kosteninventur-Tests gruen; keine atomare Runtime-Admission oder Production-Aufrufe geprueft.`);
}
if (require.main === module) { try { main(); } catch (error) { console.error("FAIL " + error.message); process.exitCode = 1; } }
module.exports = { main };
