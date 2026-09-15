"use strict";
const A = require("node:assert/strict"), C = require("node:crypto");
const P = require("./github-b055-productionaufnahme"), T = require("./b055-aufnahme/transport");
const pair = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
const commit = "a".repeat(40), date = new Date("2026-09-14T22:30:00Z");
const env = { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_ID: "123456789",
  GITHUB_SHA: commit, HELMUT_PRODUCTION_COMMIT: commit, HELMUT_CRON_SECRET: "synthetischer-schluessel",
  HELMUT_NACHWEIS_PUBLIC_KEY: pair.publicKey.export({ format: "der", type: "spki" }).toString("base64") };
const runtime = { ok: true, schemaVersion: 1, reinLesend: true, production: true, commit,
  storageSupabase: true, v3Bereit: true, profileRelational: true, profileExclusive: true,
  retentionGueltig: true, kommunikationGesperrt: true, kohortenQuellenGesperrt: true,
  retention: 36, tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal: 200,
  quellenkontext: { version: 1, scoring: "off", relevanzordnung: false, koScan: 500,
    lageMax: 12, relevanzTage: 14, sourceSafetyStandard: true, atomicLock: true },
  testKosten: { version: 2, aktiv: true, limitUsd: 4, maxManualCalls: null,
    maxWindowMs: null, unbekanntBleibtReserviert: true } };
const payload = { art: "production-briefing-eingabe", reinLesend: true, productionCommit: commit,
  profile: { id: "test-kohorte-b-055", profileActive: false },
  result: { eingabe: { mandat: "test-kohorte-b-055", tag: "2026-09-15" }, privat: "Privater synthetischer Text" } };
let calls = [];
const fetchFn = async (url, opts) => {
  calls.push(url); A.equal(opts.method, "GET"); A.equal(opts.redirect, "error");
  A.equal(opts.headers.Authorization, `Bearer ${env.HELMUT_CRON_SECRET}`);
  if (url.endsWith("/testnachweis-status")) return { status: 200, json: async () => runtime };
  A.equal(url, "https://helmut-pilot.vercel.app/api/cron/briefing-nachweis?mandat=test-kohorte-b-055&tag=2026-09-15&modus=eingabe");
  A.equal(opts.headers["x-helmut-production-commit"], commit);
  return { status: 200, text: async () => JSON.stringify(payload) };
};
(async () => {
  const r = await P.erfasse({ env, fetchFn, now: () => date });
  A.equal(calls.length, 3); A(!JSON.stringify(r).includes("Privater synthetischer Text"));
  const plain = T.decrypt(r.envelope, pair.privateKey.export({ format: "pem", type: "pkcs8" }),
    { purpose: "b055-eingabeaufnahme-v1", runId: env.GITHUB_RUN_ID, workflowCommit: commit, productionCommit: commit });
  A.deepEqual(plain.payload, payload); A.equal(plain.response.rawBody, JSON.stringify(payload));
  const app = { available: true, items: [{ title: "Gespeicherte Karte" }], currentHelmutState: {}, currentRadarState: {},
    lageBriefing: { paragraphs: [{ text: "Tatsaechliche gespeicherte Appausgabe" }] },
    gespeicherterNachweis: { id: "bf-test-kohorte-b-055-mandatsbriefing-2026-09-15",
      pruefung: { strukturellVollstaendig: true, bestanden: false } } };
  let outputCalls = 0;
  const outputFetch = async (url, opts) => {
    if (!url.endsWith("&modus=eingabe") && url.includes("/briefing-nachweis?")) {
      outputCalls++; A.equal(opts.method, "GET"); A.equal(opts.redirect, "error");
      A.equal(opts.headers.Authorization, `Bearer ${env.HELMUT_CRON_SECRET}`);
      return { status: 200, text: async () => JSON.stringify(app) };
    }
    return fetchFn(url, opts);
  };
  const output = await P.erfasse({ env: { ...env, HELMUT_NACHWEIS_MODUS: "ausgabe" }, fetchFn: outputFetch, now: () => date });
  A.equal(outputCalls, 1); A(!JSON.stringify(output).includes(app.lageBriefing.paragraphs[0].text));
  const outputPlain = T.decrypt(output.envelope, pair.privateKey.export({ format: "pem", type: "pkcs8" }),
    { purpose: "b055-eingabeaufnahme-v1", runId: env.GITHUB_RUN_ID, workflowCommit: commit, productionCommit: commit });
  A.deepEqual(outputPlain.ausgabe.payload, app);
  A.equal(outputPlain.ausgabe.rawBodySha256, C.createHash("sha256").update(JSON.stringify(app)).digest("hex"));
  app.gespeicherterNachweis.id = "bf-fremder-mandant-mandatsbriefing-2026-09-15";
  await A.rejects(P.erfasse({ env: { ...env, HELMUT_NACHWEIS_MODUS: "ausgabe" }, fetchFn: outputFetch, now: () => date }));
  app.gespeicherterNachweis.id = "bf-test-kohorte-b-055-mandatsbriefing-2026-09-15";
  app.available = false;
  await A.rejects(P.erfasse({ env: { ...env, HELMUT_NACHWEIS_MODUS: "ausgabe" }, fetchFn: outputFetch, now: () => date }));
  for (const changes of [{ GITHUB_REF: "refs/heads/fremd" }, { GITHUB_RUN_ATTEMPT: "2" },
    { HELMUT_PRODUCTION_COMMIT: "b".repeat(40) }, { HELMUT_NACHWEIS_PUBLIC_KEY: "ungueltig" }, { HELMUT_NACHWEIS_MODUS: "schreiben" }]) {
    calls = []; await A.rejects(P.erfasse({ env: { ...env, ...changes }, fetchFn, now: () => date })); A.equal(calls.length, 0);
  }
  payload.profile.profileActive = true;
  await A.rejects(P.erfasse({ env, fetchFn, now: () => date })); payload.profile.profileActive = false;
  runtime.testKosten.aktiv = false;
  await A.rejects(P.erfasse({ env, fetchFn, now: () => date }));
  console.log("7/7 Transportgruppen: reine GETs, exakter Productionkontext, verschluesselte Eingabe und Appausgabe, falscher Mandant und fehlende Ausgabe abgewiesen.");
})().catch(e => { console.error(e); process.exitCode = 1; });
