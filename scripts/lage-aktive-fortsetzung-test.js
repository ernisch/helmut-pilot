"use strict";

// Echte Route, echter Mandantenresolver und Fairnessablauf; ausschliesslich
// lokaler Speicher und deterministische Fachattrappen, keine Modellaufrufe.
const assert = require("node:assert/strict");
const F = require("../lib/helmut/cron-fairness");
const { run } = require("./lage-cron-testhilfe");
const nowMs = Date.parse("2026-09-17T05:45:00Z");
const profiles = [{ id: "local-a" }, { id: "local-b" }, { id: "local-c" }];
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log("PASS " + name); }

(async () => {
  await check("Inaktive, geloeschte und doppelte Profile vergroessern die Zielmenge nicht", async () => {
    const r = await run([...profiles, profiles[0], {}, { id: "local-off", aktiv: false },
      { id: "local-deleted", deletedAt: "2026-09-16" }], { nowMs });
    assert.equal(r.response.zielmenge, 3);
    assert.deepEqual(r.calls.slice().sort(), profiles.map(p => p.id));
    assert.equal(r.response.vollstaendig, true);
  });
  await check("Leere aktive Menge bleibt von Ladefehler unterscheidbar", async () => {
    const empty = await run([{ id: "local-off", profileActive: false }], { nowMs });
    const broken = await run(profiles, { nowMs, listError: true });
    assert.equal(empty.response.vollstaendig, true);
    assert.equal(empty.rows[0].status, "success");
    assert.equal(empty.saved.writes, 0);
    assert.equal(broken.response.vollstaendig, false);
    assert.equal(broken.response.reason, "mandanten-liste-nicht-ladbar");
    assert.equal(broken.rows[0].status, "failed");
    assert.equal(broken.calls.length, 0);
  });
  await check("Nach Zeitbudget beginnt ein neuer Prozess mit den bisher nicht begonnenen Profilen", async () => {
    const mixed = [{ id: "local-real" }, ...Array.from({ length: 499 }, (_, i) =>
      ({ id: "test-kohorte-c-" + String(i + 1).padStart(3, "0") }))];
    const first = await run(mixed, { nowMs, advanceMs: 20000, runId: "first" });
    const second = await run(mixed, { nowMs: first.now + 1000, saved: first.saved, advanceMs: 20000, runId: "second" });
    assert(first.calls.length > 0 && first.calls.length < 500);
    assert(second.calls.length > 0);
    assert(second.calls.every(id => !first.calls.includes(id)));
    assert.equal(first.response.fairness.geplant.length, 500);
    assert.equal(first.response.zielmenge, 500);
    assert.equal(first.rows[0].status, "partial");
    assert.equal(first.response.vollstaendig, false);
  });
  await check("Frisch versuchtes reales Profil verdraengt kein unversuchtes synthetisches Profil", async () => {
    const saved = { writes: 0, state: F.finishPatch({ cronName: "lage-briefing", tenantId: "local-real",
      runId: "old", erfolg: true, startedMs: nowMs - 10000, nowMs: nowMs - 5000 }) };
    const r = await run([{ id: "local-real" }, { id: "test-kohorte-c-001" }], { saved, nowMs, advanceMs: 240001 });
    assert.deepEqual(r.calls, ["test-kohorte-c-001"]);
  });
  for (const mode of ["readError", "writeError", "claimError", "noEcho", "fairness"]) {
    await check("Keine Facharbeit bei unbestaetigter Fortsetzung: " + mode, async () => {
      const r = await run(profiles, { nowMs, [mode]: mode === "fairness" ? false : true });
      assert.equal(r.calls.length, 0);
      assert.equal(r.response.prewarmed, 0);
      assert.equal(r.response.vollstaendig, false);
      assert.equal(r.rows[0].status, "failed");
      assert.equal(r.response.fairness.fortschrittsgarantie, false);
      if (mode === "readError" || mode === "fairness") assert.equal(r.saved.writes, 0);
      if (mode === "noEcho" || mode === "claimError") {
        const reconstructed = F.rekonstruiereLauf(r.saved.state, "lage-briefing", { nowMs });
        assert.equal(reconstructed.status, "teilweise");
        assert.equal(reconstructed.begonnen.length, 0);
        assert.equal(reconstructed.nichtBegonnen.length, 3);
      }
    });
  }
  await check("Ein fremder persistenter Claim verhindert doppelte Facharbeit", async () => {
    const saved = { writes: 0, state: F.claimPatch({ cronName: "lage-briefing", tenantId: "local-a", runId: "other", nowMs }) };
    const r = await run(profiles, { nowMs: nowMs + 1000, saved, runId: "this" });
    assert(!r.calls.includes("local-a"));
    assert.equal(r.calls.length, 2);
    assert.equal(r.response.vollstaendig, false);
    assert(r.response.fairness.laeuftBereits.includes("local-a"));
  });
  await check("Ein waehrend des Claims gewonnener Fremdhalter wird ebenfalls respektiert", async () => {
    const r = await run([profiles[0]], { nowMs, runId: "this", onSave: async (saved, patch, opts) => {
      if (opts.pruefen) saved.state.crons["lage-briefing"]["local-a"].letzteLaufkennung = "other";
    } });
    assert.equal(r.calls.length, 0);
    assert.deepEqual(r.response.fairness.laeuftBereits, ["local-a"]);
    assert.equal(r.response.vollstaendig, false);
  });
  await check("Zwischenzeitlich deaktiviertes Profil wird vor der Facharbeit erneut geprueft", async () => {
    const r = await run([profiles[0]], { nowMs, currentProfiles: {
      "local-a": { id: "local-a", profileActive: false }
    } });
    assert.equal(r.calls.length, 0);
    assert.equal(r.response.vollstaendig, false);
    assert.equal(r.response.prewarmed, 0);
    assert.equal(r.response.fairness.erfolgreich.length, 0);
  });
  await check("Demo, ausstehendes Narrativ und fehlende Quellen sind kein Versorgungserfolg", async () => {
    const r = await run(profiles, { nowMs, results: {
      "local-a": { available: true, demo: true },
      "local-b": { available: true, pendingNarrative: true },
      "local-c": { available: false, reason: "no-current-sources" }
    } });
    assert.equal(r.response.prewarmed, 0);
    assert.equal(r.response.vollstaendig, false);
    assert.equal(r.response.fairness.erfolgreich.length, 0);
  });
  await check("Warteschlangenzweig startet keine zusaetzliche Direktverarbeitung", async () => {
    const r = await run(profiles, { nowMs, queue: true });
    assert.equal(r.response.pfad, "warteschlange");
    assert.equal(r.calls.length, 0);
    assert.equal(r.saved.writes, 0);
  });
  console.log(`\n${passed} PASS, 0 FAIL`);
})().catch(error => { console.error(error); process.exitCode = 1; });
