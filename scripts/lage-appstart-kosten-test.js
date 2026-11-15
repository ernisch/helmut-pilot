"use strict";

// Tatsächlicher Appstart-Handlerzweig mit kontrollierten Abhängigkeiten.
// Ein Cache-Miss darf auch NACH der Antwort keine bezahlte Arbeit anstossen.
const A = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../server"), "utf8");
const start = source.indexOf('  if (url.pathname === "/api/app/start") {');
const end = source.indexOf('  if (url.pathname === "/api/profile/current") {', start);
A(start > 0 && end > start);
const code = `(async () => { ${source.slice(start, end)} })()`;
let passed = 0;
(async () => {
  for (const state of ["miss", "hit", "error"]) {
    let liveCalls = 0, cacheCalls = 0;
    const calls = [];
    const lage = { available: true, pendingNarrative: state === "miss",
      paragraphs: state === "hit" ? [{ text: "Bereits gespeicherter Text." }] : [],
      vorgaenge: [{ id: "vg-lokal", displaySummary: "Belegte Fakten." }] };
    const sandbox = {
      url: { pathname: "/api/app/start" }, accountAuth: false, authUser: null,
      politicianId: "local-start-test", previewMode: false, response: { setHeader() {} },
      handleAsync: (_res, work) => work(),
      activeProfile: async id => ({ id }),
      latestBriefingPayload: async opts => {
        calls.push(opts); cacheCalls++;
        return { available: true, lageBriefing: state === "error"
          ? { available: false, reason: "error" } : structuredClone(lage) };
      },
      withTimeout: promise => promise,
      buildLageBriefing: async () => { liveCalls++; A.fail("Appstart darf keinen separaten Lagebau starten"); },
      getTasks: async () => [], getUserNotes: async () => [],
      getLatestCompleteKnowledgeObjectAt: async () => "2026-09-24T07:00:00Z",
      validateProfile: () => ({}), isAiEnabled: () => true, activeModelName: () => "gpt-5-mini",
      ASSET_VERSION: "lokaler-test", console: { error() {} }, Date
    };
    const out = await vm.runInNewContext(code, sandbox);
    await new Promise(resolve => setImmediate(resolve));
    A.equal(cacheCalls, 1); A.equal(liveCalls, 0);
    A(calls.every(o => o.politicianId === "local-start-test" && o.compact === true));
    A.equal(out.profile.id, "local-start-test");
    if (state === "error") {
      A.equal(out.briefing.lageBriefing.available, false);
      A.equal(out.briefing.lageBriefing.reason, "error");
    } else {
      A.equal(out.briefing.lageBriefing.vorgaenge[0].displaySummary, "Belegte Fakten.");
      A.equal(out.briefing.lageBriefing.paragraphs.length, state === "hit" ? 1 : 0);
      A.equal(out.briefing.lageBriefing.pendingNarrative, state === "miss");
    }
    console.log(`PASS Appstart ${state}: null Modellstarts, ehrliche Lageanzeige`); passed++;
  }
  // Keine Wandzeit-Schwelle: kontrollierte Promises belegen echte Parallelitaet
  // und dass vor dem Profil keine mandatsbezogenen Folgeabfragen starten.
  for (const failTasks of [false, true]) {
    const gates = {}, calls = [], headers = {};
    const hold = (name, value) => { calls.push(name); return new Promise((resolve, reject) => {
      gates[name] = () => failTasks && name === "tasks" ? reject(new Error("tasks-unavailable")) : resolve(value);
    }); };
    const sandbox = {
      url: { pathname: "/api/app/start" }, accountAuth: false, authUser: null,
      politicianId: "isolated-tenant", previewMode: false,
      response: { setHeader: (name, value) => { headers[name] = value; } },
      handleAsync: (_res, work) => work(), activeProfile: () => hold("profile", { id: "isolated-tenant" }),
      latestBriefingPayload: ({ politicianId }) => { A.equal(politicianId, "isolated-tenant"); return hold("briefing", { available: true, lageBriefing: { available: true, latestUpdatedAt: "2026-11-06T05:00:00Z" } }); },
      buildLageBriefing: () => A.fail("Kein zweiter Lageabruf im Appstart"),
      withTimeout: promise => promise,
      getTasks: id => { A.equal(id, "isolated-tenant"); return hold("tasks", [{ id: "task" }]); },
      getUserNotes: id => { A.equal(id, "isolated-tenant"); return hold("notes", [{ id: "note" }]); },
      getLatestCompleteKnowledgeObjectAt: () => A.fail("Kein unabhaengiger Frischestand neben dem gespeicherten Paket"),
      validateProfile: () => ({}), isAiEnabled: () => false, activeModelName: () => "", ASSET_VERSION: "test", Date, console
    };
    const result = vm.runInNewContext(code, sandbox);
    A.deepEqual(calls, ["profile"]); gates.profile();
    await new Promise(resolve => setImmediate(resolve));
    A.deepEqual(calls, ["profile", "briefing", "tasks", "notes"]);
    const observed = failTasks ? A.rejects(result, /tasks-unavailable/) : result;
    for (const name of ["notes", "tasks", "briefing"]) gates[name]();
    const out = await observed;
    if (!failTasks) {
      A.equal(out.tasks[0].id, "task"); A.equal(out.notes[0].id, "note");
      A.equal(out.briefing.lageBriefing.latestUpdatedAt, "2026-11-06T05:00:00Z");
      A.match(headers["Server-Timing"], /start;dur=\d+/);
      A(headers["Server-Timing"].split(", ").every(v => /^(profile|briefing|tasks|notes|start);dur=\d+$/.test(v)));
    } else A.equal(headers["Server-Timing"], undefined);
    console.log(`PASS paralleler Start: Profilgrenze, Mandat und ${failTasks ? "Fehler" : "vollstaendige Antwort und sichere Zeitmessung"}`); passed++;
  }
  console.log(`${passed} PASS, 0 FAIL`);
})().catch(error => { console.error(error); process.exitCode = 1; });
