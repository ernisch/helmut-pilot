"use strict";
const A = require("node:assert/strict"), C = require("node:crypto");
const P = require("./github-b055-einzelabschluss"), T = require("./b055-aufnahme/transport");
const pair = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
const commit = "a".repeat(40), date = new Date("2026-09-14T22:30:00Z");
const env = { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_ID: "123456789",
  GITHUB_SHA: commit, HELMUT_PRODUCTION_COMMIT: commit, HELMUT_CRON_SECRET: "synthetischer-schluessel",
  HELMUT_EINZEL_AUFTRAG_HASH: "c".repeat(64),
  HELMUT_EINZEL_BESTAETIGUNG: require("../lib/helmut/b055-einzelabschluss").CONFIRM,
  HELMUT_NACHWEIS_PUBLIC_KEY: pair.publicKey.export({ format: "der", type: "spki" }).toString("base64") };
const runtime = { ok: true, schemaVersion: 1, reinLesend: true, production: true, commit,
  storageSupabase: true, v3Bereit: true, profileRelational: true, profileExclusive: true,
  retentionGueltig: true, kommunikationGesperrt: true, kohortenQuellenGesperrt: true,
  retention: 36, tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal: 200,
  quellenkontext: { version: 1, scoring: "off", relevanzordnung: false, koScan: 500,
    lageMax: 12, relevanzTage: 14, sourceSafetyStandard: true, atomicLock: true },
  testKosten: { version: 2, aktiv: true, limitUsd: 4, maxManualCalls: null,
    maxWindowMs: null, unbekanntBleibtReserviert: true } };
const payload = { ok: true, productionCommit: commit, userId: "test-kohorte-b-055",
  freigegebeneModelle: 2, briefing: { gespeichert: true }, privat: "Privater synthetischer Text" };
let calls = [];
const fetchFn = async (url, opts) => {
  calls.push(url); A.equal(opts.redirect, "error");
  A.equal(opts.headers.Authorization, `Bearer ${env.HELMUT_CRON_SECRET}`);
  if (url.endsWith("/testnachweis-status")) return { status: 200, json: async () => runtime };
  A.equal(url, "https://helmut-pilot.vercel.app/api/cron/b055-einzelabschluss");
  A.equal(opts.method, "POST"); A.equal(opts.headers["x-helmut-auftrag-hash"], env.HELMUT_EINZEL_AUFTRAG_HASH);
  A.equal(opts.headers["x-helmut-bestaetigung"], env.HELMUT_EINZEL_BESTAETIGUNG);
  A.equal(opts.headers["x-helmut-production-commit"], commit);
  return { status: 200, text: async () => JSON.stringify(payload) };
};
(async () => {
  const r = await P.ausfuehren({ env, fetchFn, now: () => date });
  A.equal(calls.length, 3); A(!JSON.stringify(r).includes("Privater synthetischer Text"));
  const plain = T.decrypt(r.envelope, pair.privateKey.export({ format: "pem", type: "pkcs8" }),
    { purpose: "b055-einzelabschluss-v1", runId: env.GITHUB_RUN_ID, workflowCommit: commit, productionCommit: commit });
  A.deepEqual(plain.payload, payload);
  for (const changes of [{ GITHUB_REF: "refs/heads/fremd" }, { GITHUB_RUN_ATTEMPT: "2" },
    { HELMUT_PRODUCTION_COMMIT: "b".repeat(40) }, { HELMUT_NACHWEIS_PUBLIC_KEY: "ungueltig" }]) {
    calls = []; await A.rejects(P.ausfuehren({ env: { ...env, ...changes }, fetchFn, now: () => date })); A.equal(calls.length, 0);
  }
  payload.ok = false;
  const negative = await P.ausfuehren({ env, fetchFn }); A.equal(negative.ok, false);
  A(!JSON.stringify(negative).includes("Privater synthetischer Text"));
  let posts = 0; await A.rejects(P.ausfuehren({ env, fetchFn: async (url, opts) => {
    if (opts.method === "POST") { posts++; throw new Error("Timeout"); } return fetchFn(url, opts);
  } })); A.equal(posts, 1);
  const ctx = { purpose: "b055-einzelabschluss-v1", runId: env.GITHUB_RUN_ID, workflowCommit: commit, productionCommit: commit };
  A.throws(() => T.decrypt(r.envelope, pair.privateKey.export({ format: "pem", type: "pkcs8" }),
    { ...ctx, purpose: "b055-eingabeaufnahme-v1" }));
  console.log("4/4 Transportgruppen: genau ein POST, exakter Productionkontext, verschluesselte Fehlerbelege, Timeout ohne Wiederholung.");
})().catch(e => { console.error(e); process.exitCode = 1; });
