"use strict";
// Current single-profile operating schedule; retain the historical pause/restore evidence.
// No provider, DB or HTTP calls.
const assert = require("node:assert/strict"), fs = require("node:fs"), crypto = require("node:crypto"), path = require("node:path");
const root = path.join(__dirname, "..");
const hash = x => crypto.createHash("sha256").update(x).digest("hex");
const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
assert.deepEqual(config.crons, [
  { path: "/api/cron/crawl", schedule: "0 4 * * *" },
  { path: "/api/cron/lage-briefing", schedule: "0 5 * * *" },
  { path: "/api/cron/morning-briefing", schedule: "15 5 * * *" }
], "Only the ordered daily supply chain may run; no old backlog or 500-profile schedule");
const others = structuredClone(config); delete others.crons;
assert.equal(config.git.deploymentEnabled["fix/cem-single-profile-20261106"], false);
const historicalPath = path.join(__dirname, "fixtures/scheduled-crons-before-pre500-pause.json");
const historicalBytes = fs.readFileSync(historicalPath);
assert.equal(hash(historicalBytes), "f543bcca088d3881b4d7bab959b82a28ec153f267f7bc17117db20d01ff484de", "Full parent restore schedule must remain exact");
const historical = JSON.parse(historicalBytes);
assert.equal(historical.length, 13);
const restored = { ...config, crons: historical };
assert.deepEqual(Object.fromEntries(Object.entries(restored).filter(([k]) => k !== "crons")), others);
const workflow = fs.readFileSync(path.join(root, ".github/workflows/briefing-watchdog.yml"), "utf8");
assert.doesNotMatch(workflow, /^  schedule:/m);
assert.match(workflow, /^  workflow_dispatch:/m);
const pauseComments = "  # Zeitplan temporaer pausiert: kontrollierte Vorbereitung des synthetischen500er Nachweises.\n  # Manuelle Dispatchs bleiben unveraendert; Rueckweg nur der schedule-Block aus26d57b69.\n";
assert.equal(workflow.split(pauseComments).length, 2);
assert.equal(hash(workflow.replace(pauseComments, "")), "2a91476999fa614c874177cf930c7d2bb8e29011a6d6f36e59fca32db9ea13da", "All manual workflow and job bytes remain unchanged");
const F = require("../lib/helmut/funktionstest-500");
const paused = F.pruefeStartfenster({ startUtc: "2026-09-10T13:00:00Z", dauerMinuten: 30, crons: [], minimalCronAktiv: false });
assert.equal(paused.startErlaubt, false);
assert.ok(paused.konflikte.some(x => x.art === "cronliste-fehlt"));
assert.equal(F.pruefeStartfenster({ startUtc: "2026-09-10T13:00:00Z", dauerMinuten: 30, crons: [{path:"/api/x",schedule:"invalid"}] }).startErlaubt, false);
assert.equal(F.pruefeStartfenster({ startUtc: "2026-09-10T13:00:00Z", dauerMinuten: 30, crons: historical, minimalCronAktiv: false }).startErlaubt, true);
assert.equal(require("./vercel-ignore-build").shouldSkip(["vercel.json", ".github/workflows/briefing-watchdog.yml"]), false);
console.log(JSON.stringify({ status: "PASS_SINGLE_PROFILE_SCHEDULE_AND_HISTORICAL_RESTORE", liveCronCount: 3, restoreCronCount: 13,
  remainingWorkflowBytesUnchanged: true, historicalEmptyScheduleFailsClosed: true, productionCalls: 0 }));
