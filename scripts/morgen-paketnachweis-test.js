"use strict";
// Echter Morgenhandler, Resolver, Fairness, Quittung und Paketmaterialisierer.
// Nur Speichertransport, Uhr, Briefingbau und Zustellung sind lokale Attrappen.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const S = require("../lib/helmut/storage");
const F = require("../lib/helmut/cron-fairness");
const B = require("../lib/helmut/briefing-speicher");
const L = require("../lib/helmut/briefing-lauf");
const E = require("../lib/helmut/lage-quellenbeleg");
const Q = require("../lib/helmut/lage-textqualitaet");
const T = require("../lib/helmut/tenant-context");
const day = "2026-09-17", startMs = Date.parse(day + "T05:00:00Z");
const serverPath = path.join(__dirname, "../server.js"), source = fs.readFileSync(serverPath, "utf8");
const start = source.indexOf('  if (url.pathname === "/api/cron/morning-briefing") {');
const end = source.indexOf('  if (url.pathname === "/api/cron/pipeline") {', start);
const ws = source.indexOf("async function runCronForTenants("), we = source.indexOf("\n}\n", ws) + 3;
assert(start > 0 && end > start && ws > 0);
const script = new vm.Script(source.slice(ws, we) + "\n(async () => {\n" + source.slice(start, end) + "\n})()");
const clone = value => structuredClone(value);
const clean = value => JSON.parse(JSON.stringify(value));
const profile = { id: "local-a", committees: ["Bildung"] };
const briefing = { available: true, items: [{ title: "Kita Beratung" }], currentHelmutState: {}, currentRadarState: {} };
function lage(id) {
  const quellen = [{ vorgang_id: "vg-test", quellenbelege: [
    { quelle_id: "q-test", titel: "Das Kabinett beraet ueber Kita Standards.", auszug: "", url: "https://example.org/kita" },
    { quelle_id: "q-other", titel: "Ein Verband legt einen Vorschlag zur Lehrerausbildung vor.", auszug: "", url: "https://example.org/lehrer" }
  ] }];
  const paragraphs = quellen[0].quellenbelege.map(q => ({ text: q.titel, vorgang_ids: ["vg-test"] }));
  const review = { vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
    pruefbegruendung: "Kita Standards und Lehrerausbildung sind eigenstaendige Sachverhalte." }],
    pruefungen: paragraphs.map((_, absatz) => ({ absatz, quelle_id: quellen[0].quellenbelege[absatz].quelle_id,
      belegfeld: "titel", vollstaendig_belegt: true, themenrein: true, profilbezug: true,
      textart: "konkreter_sachverhalt", pruefbegruendung: "Konkrete Beratung mit Bezug zum Bildungsausschuss." })) };
  const checked = Q.pruefe(paragraphs, quellen, review);
  assert.equal(checked.ok, true);
  return { id: `bf-${id}-lage-${day}`, user_id: id, slot: "lage", generated_at: day + "T06:00:00Z",
    payload: { ...checked, paragraphs: checked.paragraphs, qualitaet: checked.qualitaet, quellen,
      quellenVersion: E.VERSION, quellenHash: E.hashEingabe(quellen), koSetHash: "a".repeat(32) } };
}
function state() { return { rows: new Map(), fairness: {}, writes: [], pushes: [], telemetry: [] }; }
async function run(profiles = [profile], options = {}) {
  const saved = options.saved || state(); let now = options.nowMs || startMs; const calls = [];
  const st = {
    assertTenant: S.assertTenant,
    getRenderedBriefingV3: async (id, slot, tag) => {
      if (options.readError && slot === B.SLOT) throw new Error("offline-read-error");
      const row = saved.rows.get(`bf-${id}-${slot}-${tag}`);
      if (options.noReadback && slot === B.SLOT && row) return null;
      if (options.foreignReadback && slot === B.SLOT && row) return { ...clone(row), user_id: "foreign" };
      return clone(row || null);
    },
    insertRenderedBriefingV3: async row => {
      if (options.writeError) throw new Error("offline-write-error");
      if (saved.rows.has(row.id)) return { saved: false, reason: "existing-result" };
      saved.rows.set(row.id, clone(row)); saved.writes.push(row.slot); return { saved: true };
    },
    ergaenzeUnvollstaendigesBriefing: async (before, after) => {
      if (options.casConflict) throw new Error("briefing-ergaenzung-konflikt-oder-unklar");
      assert.deepEqual(saved.rows.get(before.id), before); assert.equal(before.payload.pruefung.strukturellVollstaendig, false);
      assert.deepEqual(after.payload.vorherigerStand, before);
      saved.rows.set(after.id, clone(after)); saved.writes.push(after.slot); return { saved: true };
    },
    saveRenderedBriefingV3: async row => {
      saved.writes.push(row.slot);
      if (!options.receiptError) saved.rows.set(row.id, clone(row));
      return { saved: true };
    }
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = vm.createContext({
    require: createRequire(serverPath), Date: Clock, console: { log() {}, warn() {}, error() {} },
    request: {}, response: {}, url: new URL("http://localhost/api/cron/morning-briefing"),
    authorizeCron: () => true, handleAsync: (_r, fn) => fn(), storageModul: st,
    briefingFrische: { ...require("../lib/helmut/briefing-frische"), vertragAktiv: () => options.contract !== false }, briefingLauf: L,
    withTimeout: p => p, sendBriefingReadyPush: async b => { saved.pushes.push(clone(b)); return { skipped: true }; },
    tenantContext: { resolveCronTenants: () => T.resolveCronTenants({ listProfiles: async () => {
      if (options.listError) throw new Error("offline-list-error"); return profiles;
    } }) },
    activeProfile: async id => options.currentProfiles?.[id] || profiles.find(p => p.id === id),
    validateProfile: p => ({ disabled: !T.isActiveMandate(p) }),
    buildV3Briefing: async p => { calls.push(p.id); now += options.advanceMs || 0;
      if (options.buildError) throw new Error("offline-build-error"); return clone(options.briefing || briefing); },
    cronFairness: { ...F, fairnessEnabled: () => options.fairness !== false,
      runTenantsFairly: args => F.runTenantsFairly({ ...args, now: () => now }) },
    readCronFairnessState: async () => ({ ok: !options.fairnessError, state: clone(saved.fairness) }),
    saveCronFairnessState: async patch => { saved.fairness = F.mergeState(saved.fairness, clean(patch), { nowMs: now });
      return { ok: true, state: clone(saved.fairness) }; },
    accounts: { recordSystemError: async () => {} }, helmutRunId: () => options.runId || "morning-local",
    helmutExecLocation: () => "local", recordProcessRun: async entry => {
      const auth = { processRuns: [] };
      return S.recordProcessRun(entry, { relationalAktiv: true, readAuth: async () => auth, writeAuth: async () => {},
        insertRelational: async row => { saved.telemetry.push(clone(row)); } });
    }
  });
  return { response: clean(await script.runInContext(context)), saved, calls, now };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
(async () => {
  await test("Morgenlauf speichert ein Paket und zaehlt fehlende Lage nicht als Vollversorgung", async () => {
    const r = await run();
    assert(r.saved.rows.has(`bf-${profile.id}-${B.SLOT}-${day}`));
    assert.equal(r.response.frischevertrag.belegt, 1);
    assert.equal(r.response.versorgung.paketeGespeichert, 1);
    assert.equal(r.response.versorgung.vollstaendigePakete, 0);
    assert.equal(r.response.versorgung.fehlt, 1);
    assert.equal(r.saved.telemetry[0].status, "partial");
  });
  await test("Spaeter gespeicherte Lage ergaenzt dasselbe Paket ohne zweiten Push", async () => {
    const first = await run(), before = clone(first.saved.rows.get(`bf-${profile.id}-${B.SLOT}-${day}`));
    const l = lage(profile.id); first.saved.rows.set(l.id, l);
    const second = await run([profile], { saved: first.saved, nowMs: startMs + 3600000, runId: "second" });
    assert.equal(second.response.versorgung.vollstaendig, true);
    assert.equal(second.response.versorgung.versorgt, 1);
    assert.equal(second.saved.telemetry.at(-1).status, "success");
    const row = second.saved.rows.get(before.id);
    assert.deepEqual(row.payload.vorherigerStand, before);
    assert.equal(row.payload.pruefung.bestanden, false);
    assert.equal(second.response.versorgung.fachlicheAbnahme, "offen");
    assert.equal(second.saved.pushes.length, 1);
    assert.equal(second.saved.writes.filter(s => s === L.SLOT_ERFOLG).length, 1);
    const writes = second.saved.writes.length;
    const third = await run([profile], { saved: second.saved, nowMs: startMs + 7200000, runId: "third" });
    assert.equal(third.response.versorgung.vollstaendig, true);
    assert.equal(third.saved.writes.length, writes);
    assert.equal(third.saved.pushes.length, 1);
  });
  await test("Quittung und Push folgen dem gespeicherten Inhalt bei eingefrorenem vollstaendigem Paket", async () => {
    const saved = state(), l = lage(profile.id); saved.rows.set(l.id, l);
    const first = await run([profile], { saved });
    const different = { ...briefing, currentHelmutState: { primaryVorgangId: "vg-new" } };
    assert.notEqual(L.inhaltsSignatur(briefing), L.inhaltsSignatur(different));
    const second = await run([profile], { saved, briefing: different, nowMs: startMs + 3600000, runId: "second" });
    assert.equal(second.response.frischevertrag.wiederholungen, 1);
    assert.equal(saved.pushes.length, 1);
    assert.equal(second.response.versorgung.versorgt, 1);
    assert.equal(saved.rows.get(`bf-${profile.id}-${B.SLOT}-${day}`).payload.briefing.currentHelmutState.primaryVorgangId, undefined);
  });
  for (const mode of ["writeError", "readError", "noReadback", "foreignReadback"]) {
    await test("Paketfehler ist weder Erfolgsquittung noch Zustellung: " + mode, async () => {
      const r = await run([profile], { [mode]: true });
      assert.equal(r.response.versorgung.versorgt, 0);
      assert.equal(r.response.versorgung.paketeGespeichert, 0);
      assert.equal(r.response.frischevertrag.belegt, 0);
      assert.equal(r.saved.telemetry[0].status, "failed");
      assert(!r.saved.rows.has(`bf-${profile.id}-${L.SLOT_ERFOLG}-${day}`));
      assert.equal(r.saved.pushes.length, 0);
    });
  }
  await test("Konflikt bei Ergaenzung erhaelt den alten Stand und meldet keinen Erfolg", async () => {
    const first = await run(), id = `bf-${profile.id}-${B.SLOT}-${day}`, before = clone(first.saved.rows.get(id));
    const l = lage(profile.id); first.saved.rows.set(l.id, l);
    const second = await run([profile], { saved: first.saved, casConflict: true, nowMs: startMs + 3600000 });
    assert.equal(second.response.versorgung.versorgt, 0);
    assert.equal(second.response.frischevertrag.belegt, 0);
    assert.equal(second.saved.telemetry.at(-1).status, "failed");
    assert.deepEqual(second.saved.rows.get(id), before);
    assert.equal(second.saved.pushes.length, 1);
  });
  await test("Unbestaetigte Quittung bleibt trotz vollstaendig gespeichertem Paket fehlgeschlagen", async () => {
    const saved = state(), l = lage(profile.id); saved.rows.set(l.id, l);
    const r = await run([profile], { saved, receiptError: true });
    assert.equal(r.response.versorgung.vollstaendigePakete, 1);
    assert.equal(r.response.frischevertrag.belegt, 0);
    assert.equal(r.response.versorgung.versorgt, 0);
    assert.equal(r.saved.telemetry[0].status, "failed");
    assert.equal(r.response.fairness.erfolgreich.length, 0);
  });
  await test("Leeres Briefing bleibt ein gespeicherter Leerstand ohne Vollversorgung", async () => {
    const r = await run([profile], { briefing: { available: false, items: [], currentHelmutState: {}, currentRadarState: {} } });
    assert.equal(r.response.versorgung.paketeGespeichert, 1);
    assert.equal(r.response.versorgung.vollstaendigePakete, 0);
    assert.equal(r.saved.telemetry[0].status, "partial");
  });
  await test("Alte Quellenversion wird nicht durch ein gespeichertes strukturelles Gruen akzeptiert", async () => {
    const saved = state(), l = lage(profile.id); saved.rows.set(l.id, l);
    await run([profile], { saved });
    const row = saved.rows.get(`bf-${profile.id}-${B.SLOT}-${day}`);
    row.payload.lage.quellenVersion = E.VERSION - 1;
    row.payload.inhaltHash = B.hash({ briefing: row.payload.briefing, lage: row.payload.lage });
    const before = clone(row);
    const r = await run([profile], { saved, nowMs: startMs + 3600000 });
    assert.equal(r.response.versorgung.vollstaendigePakete, 0);
    assert.equal(r.saved.telemetry.at(-1).status, "partial");
    assert.deepEqual(saved.rows.get(row.id), before, "Kein automatisches Umschreiben vollstaendiger Altbelege");
  });
  await test("500 aktive Profile behalten den vollen Nenner bei Zeitende und gespeicherter Fortsetzung", async () => {
    const profiles = Array.from({ length: 500 }, (_, i) => ({ ...profile, id: `local-${String(i).padStart(3, "0")}` }));
    profiles.push({ id: "inactive", aktiv: false }, { id: "deleted", deletedAt: day });
    const first = await run(profiles, { advanceMs: 20000 });
    assert.equal(first.response.versorgung.ziel, 500);
    assert(first.calls.length > 0 && first.calls.length < 500);
    assert.equal(first.response.versorgung.paketeGespeichert, first.calls.length);
    assert.equal(first.response.versorgung.fehlt, 500);
    assert.equal(first.saved.telemetry[0].status, "partial");
    const second = await run(profiles, { saved: first.saved, nowMs: first.now + 1000, advanceMs: 20000, runId: "second" });
    assert(second.calls.every(id => !first.calls.includes(id)));
    assert.equal(second.response.versorgung.ziel, 500);
  });
  await test("500 vollstaendige gespeicherte Pakete ergeben ausschliesslich technischen Erfolg", async () => {
    const profiles = Array.from({ length: 500 }, (_, i) => ({ ...profile, id: `local-${String(i).padStart(3, "0")}` }));
    const saved = state(); for (const p of profiles) { const l = lage(p.id); saved.rows.set(l.id, l); }
    const r = await run(profiles, { saved });
    assert.equal(r.response.versorgung.versorgt, 500);
    assert.equal(r.response.versorgung.quittungen, 500);
    assert.equal(r.response.versorgung.paketeGespeichert, 500);
    assert.equal(r.response.versorgung.vollstaendig, true);
    assert.equal(r.response.versorgung.fachlicheAbnahme, "offen");
    assert.equal(r.saved.telemetry[0].status, "success");
  });
  for (const mode of ["fairnessError", "fairness"]) {
    await test("Keine Facharbeit ohne bestaetigte Fortsetzung: " + mode, async () => {
      const r = await run([profile], { [mode]: mode === "fairness" ? false : true });
      assert.equal(r.calls.length, 0); assert.equal(r.saved.writes.length, 0);
      assert.equal(r.saved.telemetry[0].status, "failed");
    });
  }
  await test("Listenfehler ist kein erfolgreicher Leerlauf; Deaktivierung startet keinen Bau", async () => {
    const r = await run([profile], { listError: true });
    assert.equal(r.saved.telemetry[0].status, "failed");
    assert.equal(r.response.versorgung.vollstaendig, false);
    const empty = await run([{ ...profile, aktiv: false }]);
    assert.equal(empty.saved.telemetry[0].status, "success"); assert.equal(empty.calls.length, 0);
    const changed = await run([profile], { currentProfiles: { [profile.id]: { ...profile, aktiv: false } } });
    assert.equal(changed.calls.length, 0); assert.equal(changed.response.versorgung.vollstaendig, false);
  });
  await test("Baufehler und ausgeschalteter Frischevertrag erzeugen keine falsche Abnahme", async () => {
    const failed = await run([profile], { buildError: true });
    assert.equal(failed.response.frischevertrag.belegt, 0);
    assert.equal(failed.saved.telemetry[0].status, "failed");
    const off = await run([profile], { contract: false });
    assert.equal(off.response.frischevertrag.vertrag, "not-aus");
    assert.equal(off.response.frischevertrag.nichtPersistiert, 0);
    assert.equal(off.response.versorgung.vollstaendig, false);
    assert.equal(off.saved.writes.filter(s => s === L.SLOT_ERFOLG || s === L.SLOT_FEHLER).length, 0);
  });
  await test("Tageswechsel waehrend des Baus schreibt kein Paket fuer einen fremden Tag", async () => {
    const r = await run([profile], { nowMs: Date.parse(day + "T21:59:50Z"), advanceMs: 20000 });
    assert.equal(r.response.versorgung.paketeGespeichert, 0);
    assert.equal(r.saved.writes.filter(s => s === B.SLOT).length, 0);
    assert.equal(r.saved.telemetry[0].status, "failed");
  });
  console.log(`${passed} PASS, 0 FAIL`);
})().catch(e => { console.error(e); process.exitCode = 1; });
