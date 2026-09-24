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
      politicianId: "local-start-test", previewMode: false, response: {},
      handleAsync: (_res, work) => work(),
      activeProfile: async id => ({ id }),
      latestBriefingPayload: async () => ({ available: true }),
      withTimeout: promise => promise,
      buildLageBriefing: async (_profile, opts) => {
        calls.push(opts);
        if (!opts.cacheOnly) { liveCalls++; return lage; }
        cacheCalls++;
        if (state === "error") throw new Error("synthetischer Lesefehler");
        return structuredClone(lage);
      },
      getTasks: async () => [], getUserNotes: async () => [],
      getLatestCompleteKnowledgeObjectAt: async () => "2026-09-24T07:00:00Z",
      validateProfile: () => ({}), isAiEnabled: () => true, activeModelName: () => "gpt-5-mini",
      ASSET_VERSION: "lokaler-test", console: { error() {} }, Date
    };
    const out = await vm.runInNewContext(code, sandbox);
    await new Promise(resolve => setImmediate(resolve));
    A.equal(cacheCalls, 1); A.equal(liveCalls, 0);
    A(calls.every(o => o.politicianId === "local-start-test" && o.cacheOnly === true));
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
  console.log(`${passed} PASS, 0 FAIL`);
})().catch(error => { console.error(error); process.exitCode = 1; });
