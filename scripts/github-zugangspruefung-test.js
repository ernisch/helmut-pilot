"use strict";

const assert = require("assert/strict");
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { pruefe, PROJEKT_ORIGIN, LESEPFAD, TEXT_PROCESS } = require("./github-zugangspruefung");

async function main() {
  let pass = 0;
  const check = (value, message) => { assert.ok(value, message); pass++; };
  const secret = "SECRET_DARF_NIE_IM_BERICHT_STEHEN";
  const commit = "a".repeat(40);
  const env = { SUPABASE_URL: PROJEKT_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: secret,
    HELMUT_CRON_SECRET: secret, GITHUB_SHA: commit };
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    return url.endsWith(LESEPFAD)
      ? { status: 200, json: async () => [{ id: "main" }] }
      : { status: 200, json: async () => [{ run_id: "nachlauf500-34563444563",
        process: TEXT_PROCESS, status: "failed", reason: "nachlauf-vorige-ergebnisse-unlesbar",
        commit_ref: commit, processed_count: 0, failed_count: 1,
        started_at: "2026-09-11T04:46:00.000Z", finished_at: "2026-09-11T04:46:23.000Z" }] };
  };
  let r = await pruefe({ env, fetchFn, jetzt: new Date("2026-09-11T05:00:00.000Z") });
  check(r.supabase.erreicht === true && r.supabase.httpStatus === 200, "bestehende Betriebszeile belegt den Zugang");
  check(calls.length === 2, "genau zwei rein lesende Abrufe");
  check(calls[0].url === PROJEKT_ORIGIN + LESEPFAD, "nur festes Ziel und feste Spalten");
  check(calls[0].options.method === "GET" && !calls[0].options.body, "kein Schreibrequest");
  check(calls[0].options.redirect === "error", "keine Secret Weiterleitung");
  check(calls[0].options.signal instanceof AbortSignal, "Anfrage zeitlich begrenzt");
  check(calls[0].options.headers.Authorization === `Bearer ${secret}`, "geschuetzter Header");
  check(!JSON.stringify(r).includes(secret), "keine Secrets im Erfolgsbericht");
  check(r.letzterTextlauf?.grund === "nachlauf-vorige-ergebnisse-unlesbar"
    && r.letzterTextlauf.aktuellerCommit === true, "feste Textlaufursache sicher lesbar");
  check(calls[1].options.method === "GET" && !calls[1].options.body
    && /select=run_id,process,status,reason,commit_ref,processed_count,failed_count,started_at,finished_at/.test(calls[1].url)
    && !/user_id|telemetrie|data/.test(calls[1].url), "Textleser fordert keine Mandatsinhalte an");
  check(!r.scharferPfadFreigegeben && !r.cron.authentifiziert, "Zugang ist keine Aktivierungsfreigabe");
  check(r.modellaufrufe === 0 && r.schreibaufrufe === 0, "keine Facharbeit");
  for (const bad of ["https://anderes-projekt.supabase.co", `${PROJEKT_ORIGIN}/fremd`, `${PROJEKT_ORIGIN}?x=1`, `${PROJEKT_ORIGIN}#x`, `https://user:pass@ddckuvvpcytqbyfmbvie.supabase.co`, "http://ddckuvvpcytqbyfmbvie.supabase.co", ""]) {
    let count = 0;
    r = await pruefe({ env: { ...env, SUPABASE_URL: bad }, fetchFn: async () => { count++; } });
    check(!r.supabase.erreicht && count === 0, "abweichendes oder fehlendes Ziel vor Netz abgewiesen");
  }
  for (const missing of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    r = await pruefe({ env: { ...env, [missing]: "" }, fetchFn: async () => { throw Error("darf nicht laufen"); } });
    check(r.supabase.grund === "github-secrets-fehlen", "fehlender Zugang bleibt sichtbar");
  }
  for (const rows of [[], [{ id: "anders" }], [{ id: "main" }, { id: "main" }], { id: "main" }, null]) {
    r = await pruefe({ env, fetchFn: async () => ({ status: 200, json: async () => rows }) });
    check(!r.supabase.erreicht, "leere oder unpassende Antwort beweist keinen Zugang");
  }
  for (const status of [401, 403, 500, 503, 302]) {
    r = await pruefe({ env, fetchFn: async () => ({ status, json: async () => { throw Error(secret); } }) });
    check(!r.supabase.erreicht && r.supabase.httpStatus === status && !JSON.stringify(r).includes(secret), "HTTP Status ohne Rohtext");
  }
  for (const status of [secret, { text: secret }, undefined, NaN, 999]) {
    r = await pruefe({ env, fetchFn: async () => ({ status }) });
    check(!r.supabase.erreicht && r.supabase.httpStatus === null && !JSON.stringify(r).includes(secret), "ungueltige Statuswerte werden nicht ausgegeben");
  }
  r = await pruefe({ env, fetchFn: async () => { throw Error(secret); } });
  check(r.supabase.grund === "netz-oder-antwortfehler" && !JSON.stringify(r).includes(secret), "Netzfehler ohne Geheimnis");
  r = await pruefe({ env, fetchFn: async () => ({ status: 200, json: async () => { throw Error(secret); } }) });
  check(!r.supabase.erreicht && !JSON.stringify(r).includes(secret), "kaputte JSON Antwort ohne Geheimnis");
  r = await pruefe({ env, jetzt: new Date("2026-09-11T05:00:00.000Z"), fetchFn: async (url) => url.endsWith(LESEPFAD)
    ? ({ status: 200, json: async () => [{ id: "main" }] })
    : ({ status: 200, json: async () => [{ run_id: "nachlauf500-34563444563", process: TEXT_PROCESS,
      status: "failed", reason: secret, commit_ref: commit, processed_count: 0, failed_count: 1,
      started_at: "2026-09-11T04:46:00.000Z", finished_at: "2026-09-11T04:46:23.000Z" }] }) });
  check(r.letzterTextlauf?.grund === "nicht-freigegebene-diagnose"
    && !JSON.stringify(r).includes(secret), "freie Textlaufursache bleibt verdeckt");
  for (const arg of ["--scharf", "aktivierung", "--url=https://anders.invalid", "--help"]) {
    const child = spawnSync(process.execPath, [path.join(__dirname, "github-zugangspruefung.js"), arg], { env: { PATH: process.env.PATH }, encoding: "utf8" });
    check(child.status === 2 && !child.stdout, "CLI lehnt jeden Modus vor der Ausfuehrung ab");
  }
  const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/500-zugangspruefung.yml"), "utf8");
  check(!/^\s*(pull_request|pull_request_target|schedule):/m.test(workflow), "keine Secrets fuer PRs oder Zeitplaene");
  check(!/EXECUTE:|CONFIRM:|AZURE_OPENAI_KEY:|OPENAI_API_KEY:/.test(workflow), "keine scharfen Flags oder Modellkeys");
  check(/persist-credentials: false/.test(workflow), "kein Git Schreibcredential im Checkout");
  console.log(`github-zugangspruefung: ${pass} PASS / 0 FAIL`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
