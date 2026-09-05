"use strict";

const assert = require("assert/strict");
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { pruefe, PROJEKT_ORIGIN, LESEPFAD } = require("./github-zugangspruefung");

async function main() {
  let pass = 0;
  const check = (value, message) => { assert.ok(value, message); pass++; };
  const secret = "SECRET_DARF_NIE_IM_BERICHT_STEHEN";
  const env = { SUPABASE_URL: PROJEKT_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: secret, HELMUT_CRON_SECRET: secret };
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    return { status: 200, json: async () => [{ id: "main" }] };
  };
  let r = await pruefe({ env, fetchFn });
  check(r.supabase.erreicht === true, "bestehende Betriebszeile belegt den Zugang");
  check(calls.length === 1, "genau ein Abruf");
  check(calls[0].url === PROJEKT_ORIGIN + LESEPFAD, "nur festes Ziel und feste Spalten");
  check(calls[0].options.method === "GET" && !calls[0].options.body, "kein Schreibrequest");
  check(calls[0].options.redirect === "error", "keine Secret Weiterleitung");
  check(calls[0].options.signal instanceof AbortSignal, "Anfrage zeitlich begrenzt");
  check(calls[0].options.headers.Authorization === `Bearer ${secret}`, "geschuetzter Header");
  check(!JSON.stringify(r).includes(secret), "keine Secrets im Erfolgsbericht");
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
  for (const status of [401, 403, 500, 302]) {
    r = await pruefe({ env, fetchFn: async () => ({ status, json: async () => { throw Error(secret); } }) });
    check(!r.supabase.erreicht && !JSON.stringify(r).includes(secret), "HTTP Fehler ohne Rohtext");
  }
  r = await pruefe({ env, fetchFn: async () => { throw Error(secret); } });
  check(r.supabase.grund === "netz-oder-antwortfehler" && !JSON.stringify(r).includes(secret), "Netzfehler ohne Geheimnis");
  r = await pruefe({ env, fetchFn: async () => ({ status: 200, json: async () => { throw Error(secret); } }) });
  check(!r.supabase.erreicht && !JSON.stringify(r).includes(secret), "kaputte JSON Antwort ohne Geheimnis");
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
