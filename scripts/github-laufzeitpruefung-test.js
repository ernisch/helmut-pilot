"use strict";
const assert = require("assert/strict");
const http = require("http");
const { pruefe, STATUS_URL } = require("./github-laufzeitpruefung");

async function main() {
  let pass = 0;
  const check = (v, m) => { assert.ok(v, m); pass++; };
  const sha = "a".repeat(40);
  const geheim = "NIE_AUSGEBEN_abcdef";
  const env = { HELMUT_PRODUCTION_COMMIT: sha, GITHUB_SHA: sha, HELMUT_CRON_SECRET: geheim };
  const payload = { ok: true, schemaVersion: 1, reinLesend: true, production: true, commit: sha,
    storageSupabase: true, v3Bereit: true, profileRelational: true, profileExclusive: false,
    retentionGueltig: true, retention: 36, tagesdeckel: 2416, understandingReserve: 702,
    kommunikationGesperrt: true, secret: geheim };
  let calls = 0;
  const fetchFn = async (url, opts) => {
    calls++;
    check(url === STATUS_URL && opts.method === "GET" && !opts.body, "nur fester GET");
    check(opts.redirect === "error", "keine Redirects");
    return { status: 200, json: async () => payload };
  };
  let r = await pruefe({ env, fetchFn });
  check(r.ok && r.tagesdeckel === 2416 && r.understandingReserve === 702, "Laufzeitwerte erhalten");
  check(!JSON.stringify(r).includes(geheim) && !r.scharferPfadFreigegeben, "keine fremden Felder oder Freigabe");
  check(calls === 1, "genau ein Request");
  for (const changed of [{ GITHUB_SHA: "b".repeat(40) }, { HELMUT_PRODUCTION_COMMIT: "" }, { HELMUT_CRON_SECRET: "" }]) {
    calls = 0;
    r = await pruefe({ env: { ...env, ...changed }, fetchFn });
    check(!r.ok && calls === 0, "fehlende Voraussetzung vor Netz abgefangen");
  }
  for (const changed of [{ commit: "b".repeat(40) }, { production: false }, { reinLesend: false }, { tagesdeckel: geheim }, { kommunikationGesperrt: "true" }]) {
    r = await pruefe({ env, fetchFn: async () => ({ status: 200, json: async () => ({ ...payload, ...changed }) }) });
    check(!r.ok && !JSON.stringify(r).includes(geheim), "falsche Antwort ohne Rohdaten abgewiesen");
  }
  for (const status of [401, 503]) {
    r = await pruefe({ env, fetchFn: async () => ({ status, json: async () => { throw Error(geheim); } }) });
    check(!r.ok && r.httpStatus === status && !JSON.stringify(r).includes(geheim), "HTTP Status ohne Antworttext");
  }
  for (const status of [geheim, { text: geheim }, undefined, NaN, 999]) {
    r = await pruefe({ env, fetchFn: async () => ({ status }) });
    check(!r.ok && r.httpStatus === null && !JSON.stringify(r).includes(geheim), "ungueltiger HTTP Status ohne Rohdaten");
  }
  r = await pruefe({ env, fetchFn: async () => { throw Error(geheim); } });
  check(!r.ok && !JSON.stringify(r).includes(geheim), "Netzfehler ohne Secret");

  process.env.HELMUT_AUTH_MODE = "accounts";
  process.env.CRON_SECRET = geheim;
  process.env.VERCEL_GIT_COMMIT_SHA = sha;
  process.env.VERCEL_ENV = "production";
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "2416";
  process.env.HELMUT_LLM_RESERVE_UNDERSTANDING = "702";
  process.env.HELMUT_CRAWL_RUN_RETENTION = "36";
  process.env.HELMUT_TESTLAUF_KOMMUNIKATION = "gesperrt";
  const accounts = require("../lib/helmut/accounts");
  const storage = require("../lib/helmut/storage");
  let writes = 0;
  const verboten = async () => { writes++; throw Error("Schreibpfad erreicht"); };
  accounts.ensureAdminSeed = verboten;
  accounts.recordSystemError = verboten;
  storage.getLatestCrawlRun = verboten;
  const handler = require("../server");
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const request = (method, token) => new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: server.address().port,
      path: "/api/cron/testnachweis-status", method, headers: token ? { Authorization: `Bearer ${token}` } : {} }, (res) => {
      let text = ""; res.on("data", (c) => { text += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    }); req.on("error", reject); req.end();
  });
  try {
    r = await request("GET", geheim);
    check(r.status === 200 && r.body.reinLesend === true && r.body.commit === sha, "echter Handler erreicht Status");
    check(r.body.tagesdeckel === 2416 && r.body.understandingReserve === 702, "echte Budgetfunktionen");
    check(r.body.retention === 36 && r.body.kommunikationGesperrt === true, "echte Schutzfunktionen");
    check(!JSON.stringify(r).includes(geheim), "HTTP Antwort ohne Secret");
    check((await request("GET", "falsch")).status === 403, "falsche Autorisierung geschlossen");
    check((await request("GET", null)).status === 403, "fehlende Autorisierung geschlossen");
    check((await request("POST", geheim)).status === 405, "kein POST Pfad");
    delete process.env.CRON_SECRET;
    check((await request("GET", geheim)).status === 503, "fehlende Serverkonfiguration geschlossen");
    process.env.CRON_SECRET = geheim;
    const original = storage.llmDailyCallLimit;
    storage.llmDailyCallLimit = () => { throw Error(geheim); };
    r = await request("GET", geheim);
    check(r.status === 500 && !JSON.stringify(r).includes(geheim), "Fehler ohne Rohtext oder Auditwrite");
    storage.llmDailyCallLimit = original;
    check(writes === 0, "Adminseed, Blobleser und Fehlerpersistierung nie erreicht");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(`github-laufzeitpruefung: ${pass} PASS / 0 FAIL`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
