"use strict";
// Neue Executornaehte ausschliesslich mit markierten Offlinefixturen.
// Bestehende Suiten werden nicht gestartet; nur deren reine Fixturefabrik.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process");
const E = require("../lib/helmut/synthetik-500-executor");
const P = require("../lib/helmut/synthetik-500-profile");
const A = require("../lib/helmut/synthetik-500-kosten-admission");
const N = require("../lib/helmut/synthetik-500-nachweis");
const F = require("./synthetik-500-runtime-test");
const CLI = require("./synthetik-500-executor");
const clone = structuredClone;
function fixture() {
  const f = F.fixture(), runtime = f.runtimeManifest;
  const sollplan = N.erzeugeSollplan(f.paket, { operationId: f.manifest.operationId,
    productionCommit: runtime.startbelegeGrundlinie.productionCommit,
    deploymentId: runtime.startbelegeGrundlinie.deploymentId, runtimeManifestHash: P.hash(runtime),
    definiertAm: "2026-10-01T09:55:00.000Z", startsAt: new Date(F.NOW).toISOString(),
    endsAt: f.manifest.endeAm, briefingFensterStart: "2026-10-01T00:00:00.000Z" });
  const runId = "nachlauf500-1790848860000";
  const intent = x => { const d = { ...x, model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 };
    return { id: A.intentHash(runId, d), ...d }; };
  const intents = f.paket.profile.flatMap(p => {
    const d = intent({ phase: "D", owner: p.mandatsId, inputVersionHash: P.hash(p), actualRequestHash: P.hash(["fixture-D", p]) });
    return [d, intent({ phase: "R", owner: p.mandatsId, inputVersionHash: null, actualRequestHash: null,
      dependsOn: d.id, contextVersionHash: d.inputVersionHash })];
  });
  intents.push(intent({ phase: "U", vorgangId: "fixture-vorgang", contractInputHash: "a".repeat(40), actualRequestHash: "b".repeat(64) }));
  const plan = { version: A.PLAN_VERSION, operationId: sollplan.operationId, runId,
    productionCommit: sollplan.productionCommit, runtimeManifestHash: sollplan.runtimeManifestHash,
    startsAtUTC: sollplan.startsAt, endsAtUTC: sollplan.endsAt, intents };
  const eingaben = { version: E.INPUT_VERSION, runtimeManifest: runtime, snapshot: f.snapshot, sollplan,
    kostenSlot: { version: A.VERSION, plan, planHash: P.hash(plan), consumed: {} }, kostenPlan: null };
  return { paket: f.paket, eingaben, now: F.NOW };
}
const basis = fixture();
function prepared() { const f = clone(basis); return { ...f, v: E.vorbereite(f.paket, f.eingaben) }; }
function rehashSlot(f) { f.eingaben.kostenSlot.planHash = P.hash(f.eingaben.kostenSlot.plan); }
function quittung(x, status = "fixture-quittiert") {
  return { intentId: x.intent.id, actualRequestHash: x.request.actualRequestHash,
    status, evidenceHash: P.hash(["explicit-local-fixture", x.intent.id]) };
}
let passed = 0;
async function test(name, fn) { if (process.argv[2] && !name.includes(process.argv[2])) return; await fn(); passed++; console.log("PASS " + name); }
async function main() {
  await test("Fehlende reale Eingaben bleiben null und sperren alle Productiontore", async () => {
    const v = E.vorbereite(basis.paket); assert.equal(v.erwartetePositionen.length, 1500);
    assert.equal(v.strukturVollstaendig, false); assert.equal(v.laufBindung, null);
    assert.equal(v.fehlendeEingaben.length, 5); assert.equal(v.startrecht, false);
    await assert.rejects(E.productionStart({ go: true }), /closed-selector-only/);
    assert.throws(() => CLI.argumente(["--start", "/tmp/anything"]), /argumente/);
  });
  await test("Vollkostenplan bleibt nullable offen und frei behauptete SHA ersetzt keinen echten Validator", () => {
    const { v, paket, eingaben } = prepared();
    assert.equal(v.kostenPlanHash, null); assert.equal(v.strukturVollstaendig, false);
    assert.equal(v.ablaufstrukturVollstaendig, true); assert(v.fehlendeEingaben.includes("vollstaendiger-kostenplan"));
    const bad = clone(eingaben); bad.kostenPlan = { planHash: "a".repeat(64), admissionCandidate: bad.kostenSlot };
    assert.throws(() => E.vorbereite(paket, bad));
  });
  await test("Eigener exakt500-Paketvertrag und geschuetzte501te Identitaet statt495/504", () => {
    const { v, paket, eingaben } = prepared();
    assert.deepEqual(v.paketBindung.verteilung, { bundestag: 330, "landtag-berlin": 120, "landtag-brandenburg": 50 });
    assert.equal(v.laufBindung.fremdId, "synthetik500-fremdprofil");
    assert.equal(v.laufBindung.admissionPlanHash, eingaben.kostenSlot.planHash);
    assert.equal(v.schedule.length, 1001); assert.equal(v.schedule[0].phase, "U");
    assert.deepEqual(v.schedule.slice(1, 5).map(x => x.phase), ["D", "R", "D", "R"]);
    const bad = clone(paket); bad.profile.splice(0, 5); assert.throws(() => E.vorbereite(bad));
    const afd = clone(paket); afd.profile[0].fraktion = "AfD"; assert.throws(() => E.vorbereite(afd));
    const fremd = clone(eingaben); fremd.snapshot.profiles.at(-1).name = "Drift";
    assert.throws(() => E.vorbereite(paket, fremd), /bindung|drift/);
  });
  await test("Lauf-/Runtime-/Commit-/Admission-/Sollplanbindungen und Hashdrift abgewiesen", () => {
    for (const mutate of [f => { f.eingaben.kostenSlot.plan.productionCommit = "d".repeat(40); rehashSlot(f); },
      f => { f.eingaben.kostenSlot.plan.runtimeManifestHash = "0".repeat(64); rehashSlot(f); },
      f => { f.eingaben.kostenSlot.plan.endsAtUTC = "2026-10-02T00:00:00.000Z"; rehashSlot(f); },
      f => { f.eingaben.kostenSlot.plan.intents.pop(); f.eingaben.kostenSlot.plan.intents.pop(); rehashSlot(f); },
      f => { f.eingaben.sollplan.kriteriensatz.quellenbindung = "optional"; }]) {
      const f = clone(basis); mutate(f); assert.throws(() => E.vorbereite(f.paket, f.eingaben));
    }
    const { v, paket } = prepared(); v.regeln.parallelitaet = 2; assert.throws(() => E.pruefe(v, paket), /drift/);
  });
  await test("Bereits verbrauchter echter Admission-Intent bleibt gesperrt", () => {
    const f = clone(basis), s = f.eingaben.kostenSlot, d = s.plan.intents.find(x => x.phase === "D");
    s.consumed[d.id] = { ticketId: "fixture-ticket", day: s.plan.startsAtUTC.slice(0, 10),
      consumedAtUTC: s.plan.startsAtUTC, actualRequestHash: d.actualRequestHash, reserved: 212000 };
    assert.throws(() => E.vorbereite(f.paket, f.eingaben), /bereits-verbraucht/);
  });
  await test("Sequenz1 reicht echte U40/D64-Admissionvertraege durch; R bleibt vor Callback gesperrt", async () => {
    const { v, paket, now } = prepared(); let active = 0, peak = 0; const seen = [];
    const r = await E.simuliere(v, paket, { modus: E.SIMULATION, jetzt: () => now, fixture: async x => {
      active++; peak = Math.max(peak, active); seen.push(x);
      assert(Object.isFrozen(x.request.admission)); await Promise.resolve(); active--; return quittung(x);
    } });
    assert.equal(peak, 1); assert.deepEqual(seen.map(x => x.intent.phase), ["U", "D"]);
    assert.equal(seen[0].request.contractInputHash.length, 40); assert.equal(seen[0].request.actualRequestHash.length, 64);
    assert.equal(seen[0].request.phase, null); assert.equal(seen[1].request.phase, "entwurf");
    assert.deepEqual(seen[1].request.admission, { operationId: v.laufBindung.operationId, planHash: v.laufBindung.admissionPlanHash });
    assert.equal(r.attempts, 2); assert.equal(r.quittungen.length, 1001);
    assert.equal(r.grund, "r-quittung-und-reserve-nicht-implementiert");
    assert.equal(r.positionen.length, 1500); assert.equal(r.fachbilanz.zaehlungen.fehlend, 1500);
    assert.equal(r.productionNachweisErfolgreich, false); assert.equal(r.productionQuittung, false);
  });
  await test("Throw/Unknown/Nichtsendung/falsche Quittung stoppen einmal und bilanzieren alle Positionen", async () => {
    for (const callback of [() => { throw Error("fixture-secret-never-log"); },
      x => quittung(x, "ausgang-unbekannt"), x => quittung(x, "nicht-gesendet"),
      x => ({ ...quittung(x), actualRequestHash: "0".repeat(64) })]) {
      const { v, paket, now } = prepared(); let calls = 0;
      const r = await E.simuliere(v, paket, { modus: E.SIMULATION, jetzt: () => now, fixture: x => { calls++; return callback(x); } });
      assert.equal(calls, 1); assert.equal(r.attempts, 1); assert.equal(r.quittungen.filter(q => q.attempt === 0).length, 1000);
      assert.equal(r.positionen.length, 1500); assert.equal(r.paidRetry, false);
      assert(!JSON.stringify(r).includes("fixture-secret"));
    }
  });
  await test("Haengender Fixturecallback endet begrenzt unbekannt ohne Folgecall oder Retry", async () => {
    const { v, paket, now } = prepared(); let calls = 0;
    const r = await E.simuliere(v, paket, { modus: E.SIMULATION, jetzt: () => now, timeoutMs: 5,
      fixture: () => { calls++; return new Promise(() => {}); } });
    assert.equal(calls, 1); assert.equal(r.quittungen[0].status, "ausgang-unbekannt");
    assert.equal(r.attempts, 1); assert.equal(r.positionen.length, 1500);
  });
  await test("Monotone Frist verwirft auch synchron verspaetete Callbackantwort bei stehender Fixtureuhr", async () => {
    const { v, paket, now } = prepared(); let calls = 0;
    const r = await E.simuliere(v, paket, { modus: E.SIMULATION, jetzt: () => now, timeoutMs: 5,
      fixture: x => { calls++; const until = performance.now() + 12; while (performance.now() < until) {} return quittung(x); } });
    assert.equal(calls, 1); assert.equal(r.quittungen[0].status, "ausgang-unbekannt");
    assert.equal(r.grund, "antwort-ausserhalb-zeitfenster"); assert.equal(r.positionen.length, 1500);
  });
  await test("Spaeter Start mit stehender Uhr und mehreren U nutzt nur einmal verbleibende Restzeit", async () => {
    const f = clone(basis), plan = f.eingaben.kostenSlot.plan;
    const old = plan.intents.find(x => x.phase === "U"), { id, ...descriptor } = old;
    const d = { ...descriptor, vorgangId: "fixture-second-u" };
    plan.intents.push({ id: A.intentHash(plan.runId, d), ...d }); rehashSlot(f);
    const v = E.vorbereite(f.paket, f.eingaben), late = Date.parse(plan.endsAtUTC) - 80; let calls = 0;
    const r = await E.simuliere(v, f.paket, { modus: E.SIMULATION, jetzt: () => late,
      fixture: x => { calls++; assert.equal(x.intent.phase, "U");
        const until = performance.now() + 50; while (performance.now() < until) {} return quittung(x); } });
    assert.equal(calls, 2); assert.equal(r.quittungen[0].status, "fixture-quittiert");
    assert.equal(r.quittungen[1].status, "ausgang-unbekannt");
    assert.equal(r.grund, "antwort-ausserhalb-zeitfenster"); assert.equal(r.positionen.length, 1500);
  });
  await test("Zeitfenster/UTC-Wechsel/Rueckwaertsuhr/Stop verhindern weiteren Attempt", async () => {
    for (const kind of ["before", "end", "backwards", "after", "stop", "unknown-stop"]) {
      const { v, paket, now } = prepared(); let reads = 0, calls = 0;
      const r = await E.simuliere(v, paket, { modus: E.SIMULATION,
        jetzt: () => { reads++; return kind === "before" ? now - 1 : kind === "end" ? Date.parse(v.laufBindung.endsAtUTC)
          : kind === "backwards" && reads > 1 ? now - 1 : kind === "after" && reads > 1 ? Date.parse("2026-10-02T00:00:00Z") : now; },
        stoppen: () => kind === "stop" ? true : kind === "unknown-stop" ? null : false,
        fixture: x => { calls++; return quittung(x); } });
      assert.equal(calls, ["backwards", "after"].includes(kind) ? 1 : 0); assert(r.grund);
      assert.equal(r.positionen.length, 1500);
      if (calls) assert.equal(r.quittungen[0].status, "ausgang-unbekannt");
    }
  });
  await test("Alle1500 Fachpositionen behalten unveraenderten Fehlend-/Doppelt-/Leer-/Fehlervertrag", () => {
    const { v, paket } = prepared(), s = v.eingaben.sollplan, pos = s.sollpositionen[0];
    const row = { mandatsId: pos.mandatsId, bereich: pos.bereich, text: "", leer: true,
      leerGrund: "fixture-leer", technischerFehler: "fixture-technisch" };
    const data = { ergebnisse: [row, clone(row)], sichten: [], urteile: [], belege: null };
    const expected = N.bilanziere({ paket, sollplan: s, ...data });
    assert.deepEqual(E.bilanziere(v, paket, data), expected);
    assert.equal(expected.zaehlungen.doppelt, 1); assert.equal(expected.zaehlungen.fehlend, 1499);
    assert.equal(expected.befundZaehlungen.leer, 2); assert.equal(expected.befundZaehlungen["technisch-fehlerhaft"], 2);
  });
  await test("Ungueltiger Istexport quittiert1500 unbekannte Ergebnisse statt Gruen", async () => {
    const { v, paket, now } = prepared();
    const r = await E.simuliere(v, paket, { modus: E.SIMULATION, jetzt: () => now, stoppen: () => true,
      fixture: () => assert.fail("must not call"), exportierteDaten: { ergebnisse: "bad" } });
    assert.equal(r.positionen.length, 1500); assert(r.positionen.every(x => x.status === "ausgang-unbekannt"));
    assert.equal(r.bilanzFehler, "fachbilanz-eingaben-ungueltig");
  });
  await test("CLI erzeugt nur private offene Vorlage; kein Startflag, keine Wiederverwendung oder Repoausgabe", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-executor-fixture-"));
    try {
      const input = path.join(dir, "paket.json"), out = path.join(dir, "vorbereitung.json");
      fs.writeFileSync(input, P.serialisiere(basis.paket), { mode: 0o600 });
      const cli = path.join(__dirname, "synthetik-500-executor.js");
      const run = spawnSync(process.execPath, [cli, "--paket", input, "--out", out], { encoding: "utf8" });
      assert.equal(run.status, 0, run.stderr); assert.equal(fs.statSync(out).mode & 0o777, 0o600);
      const result = JSON.parse(run.stdout); assert.equal(result.startrecht, false); assert.equal(result.modellaufrufe, 0);
      const again = spawnSync(process.execPath, [cli, "--paket", input, "--out", out], { encoding: "utf8" });
      assert.equal(again.status, 1); assert.equal(JSON.parse(fs.readFileSync(out)).strukturVollstaendig, false);
      const repo = spawnSync(process.execPath, [cli, "--paket", input, "--out", path.join(__dirname, "forbidden-executor.json")], { encoding: "utf8" });
      assert.equal(repo.status, 1); assert.equal(fs.existsSync(path.join(__dirname, "forbidden-executor.json")), false);
      fs.chmodSync(input, 0o644); assert.throws(() => CLI.lesePrivat(input), /private-eingabe/);
    } finally { fs.rmSync(dir, { recursive: true }); }
  });
  console.log(`${passed}/${passed} neue Executorgruppen gruen; keine DB-/Provider-/Productionausfuehrung.`);
}
if (require.main === module) main().catch(e => { console.error(e.stack); process.exitCode = 1; });
module.exports = { fixture, main };
