"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { betreibe, einmal, konfigurationsfehler, pruefeEinmalZiel, pruefeProduktionsstand } = require("../worker");

async function pruefeSchleife() {
  const stunden = [6, 6, 6, 6, 7, 7, 7, 7], minuten = [29, 30, 31, 45, 0, 29, 30, 45];
  // 06:45 bis 07:30 Berliner Zeit ist die redaktionelle Sperre. Im Winter
  // liegt der Schadenfall um 06:30 Berlin im Pruefslot vor dieser Sperre.
  const minutenBerlin = stunden.map((stunde, i) =>
    Date.UTC(2026, 10, 23, stunde - 1, minuten[i]));
  const controller = new AbortController();
  let index = 0;
  const gestartet = [], logs = [];
  await betreibe({ signal: controller.signal, jetzt: () => minutenBerlin[index],
    lauf: async () => {
      gestartet.push(index);
      if (index === 1) throw Error("isolierter Testfehler");
      if (index === 7) controller.abort();
      return { ok: true, arbeitsfenster: {}, verarbeitung: { erledigt: 1 } };
    },
    pause: async ms => { assert(ms > 0 && ms <= 30000); assert(++index < stunden.length); },
    log: eintrag => logs.push(JSON.parse(eintrag)) });
  assert.deepEqual(gestartet, [1, 6, 7]);
  assert.equal(logs[0].ereignis, "quellenfenster-fehler");
  assert.equal(logs[2].erledigt, 1);
}

async function pruefeEinmalmodus(env) {
  assert.doesNotThrow(() => pruefeEinmalZiel(env));
  assert.throws(() => pruefeEinmalZiel({ ...env, HELMUT_CRAWL_EXECUTOR: "hetzner" }),
    /einmaltest-erfordert-standby/);
  const prod = "ddckuvvpcytqbyfmbvie.supabase.co";
  assert.throws(() => pruefeEinmalZiel({ ...env, HELMUT_WORKER_SUPABASE_HOST: prod }),
    /einmaltest-erfordert-testdatenbank/);
  const child = spawn(process.execPath, ["worker.js", "--once"],
    { env: { ...process.env, HELMUT_CRAWL_EXECUTOR: "", SUPABASE_URL: "" } });
  const fertig = once(child, "close");
  const meldungen = [];
  child.stderr.on("data", d => meldungen.push(d));
  assert.deepEqual(await fertig, [1, null]);
  assert.match(Buffer.concat(meldungen).toString(), /supabase-url-fehlt-oder-ungueltig/);

  const signal = new AbortController().signal;
  const jetzt = () => Date.UTC(2026, 10, 23, 5, 30);
  let starts = 0;
  const meldung = [];
  const ergebnis = { arbeitsfenster: {}, ok: true, lauf: { laufId: "testlauf" },
    lauftelemetrie: { ende: true, status: "success" }, verarbeitung: { erledigt: 1 } };
  const lauf = async () => { starts++; return ergebnis; };
  const log = wert => meldung.push(JSON.parse(wert));
  assert.equal(await einmal({ signal, jetzt, lauf, log }), true);
  assert.equal(starts, 1);
  assert.equal(meldung[0].quittungGespeichert, true);
  ergebnis.lauftelemetrie.ende = false;
  assert.equal(await einmal({ signal, jetzt, lauf, log }), false);
  await assert.rejects(einmal({ signal, jetzt: () => Date.UTC(2026, 10, 23, 5, 45), lauf, log }),
    /ausserhalb-quellenarbeitsfenster/);
  assert.equal(starts, 2);
}

function pruefeCronRoute() {
  process.env.HELMUT_CRAWL_EXECUTOR = "hetzner";
  process.env.CRON_SECRET = "lokaler-testwert";
  const handler = require("../server");
  function aufruf(url, authorization, method = "GET") {
    return new Promise(resolve => {
      const req = { url, method, headers: { host: "localhost", authorization } };
      const res = { writeHead(status) { this.status = status; },
        end(body) { resolve({ status: this.status, body: JSON.parse(body) }); } };
      handler(req, res);
    });
  }
  return Promise.all([
    aufruf("/api/cron/crawl?arbeitsfenster=1&betrieb=24h", "Bearer lokaler-testwert"),
    aufruf("/api/cron/crawl", "Bearer falsch"),
    aufruf("/api/cron/worker-weck", "Bearer lokaler-testwert", "POST"),
    aufruf("/api/cron/quellen-operator", "Bearer lokaler-testwert", "POST")
  ]).then(([crawl, verweigert, weck, operator]) => {
    assert.deepEqual(crawl, { status: 200,
      body: { ok: true, uebersprungen: true, grund: "quellenlauf-auf-hetzner" } });
    assert.equal(verweigert.status, 403);
    for (const result of [weck, operator]) {
      assert.equal(result.status, 503);
      assert.equal(result.body.verarbeitet, false);
    }
  });
}

async function pruefeProzess() {
  const env = { ...process.env, HELMUT_CRAWL_EXECUTOR: "", SUPABASE_URL: "" };
  const child = spawn(process.execPath, ["worker.js"], { env });
  const fertig = once(child, "exit");
  const [ausgabe] = await once(child.stdout, "data");
  assert.match(String(ausgabe), /"ereignis":"standby"/);
  assert.equal(child.kill("SIGTERM"), true);
  assert.deepEqual(await fertig, [0, null]);
}

async function main() {
  const env = {
    SUPABASE_URL: "https://testprojekt.supabase.co",
    HELMUT_WORKER_SUPABASE_HOST: "testprojekt.supabase.co",
    HELMUT_STORAGE_BACKEND: "supabase",
    SUPABASE_SERVICE_ROLE_KEY: "testwert",
    HELMUT_QUELLEN_ARBEITSFENSTER: "on",
    HELMUT_QUELLEN_FENSTER_TAG: "8",
    HELMUT_QUELLEN_SEKUNDEN_TAG: "2400",
    HELMUT_ORIGINALABRUFE_TAG: "16",
    AZURE_OPENAI_ENDPOINT: "https://testing.openai.azure.com",
    AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
    AZURE_OPENAI_KEY: "testwert",
    HELMUT_BETRIEBSKOSTENVERTRAG_JSON: JSON.stringify({
      version: 1, profileId: "testprofil", startsAt: "2026-11-23T00:00:00.000Z",
      dailyLimitUsd: 1, totalLimitUsd: 30, route: { provider: "azure",
        responsesUrl: "https://testing.openai.azure.com/openai/v1/responses", model: "gpt-5-mini" }
    })
  };
  assert.equal(konfigurationsfehler(env), null);
  const prod = { ...env, HELMUT_WORKER_SUPABASE_HOST: "ddckuvvpcytqbyfmbvie.supabase.co",
    HELMUT_VERSTEHEN_CAS: "on", HELMUT_SOURCE_TELEMETRY: "on", HELMUT_COMMIT_SHA: "a".repeat(40) };
  assert.equal(pruefeProduktionsstand(env), null);
  assert.equal(pruefeProduktionsstand(prod), null);
  assert.equal(pruefeProduktionsstand({ ...prod, HELMUT_VERSTEHEN_CAS: "off" }), "verstehen-cas-erforderlich");
  assert.equal(pruefeProduktionsstand({ ...prod, HELMUT_SOURCE_TELEMETRY: "" }), "quellentelemetrie-deaktiviert");
  assert.equal(pruefeProduktionsstand({ ...prod, HELMUT_COMMIT_SHA: "abcdef" }), "worker-commit-unbekannt");
  assert.equal(konfigurationsfehler({ ...env, HELMUT_WORKER_SUPABASE_HOST: "falsch.supabase.co" }),
    "supabase-ziel-nicht-bestaetigt");
  assert.equal(konfigurationsfehler({ ...env, VERCEL: "1" }), "vercel-laufzeit");
  assert.equal(konfigurationsfehler({ ...env, HELMUT_BETRIEBSKOSTENVERTRAG_JSON: "" }),
    "geldvertrag-nicht-bestaetigt");
  assert.equal(konfigurationsfehler({ ...env, AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini-eu" }),
    "azure-route-weicht-vom-geldvertrag-ab");
  await pruefeSchleife();
  await pruefeEinmalmodus(env);
  await pruefeCronRoute();
  await pruefeProzess();
  console.log("PASS Konfiguration, Viertelstunden, Redaktionssperre, Fehlerisolierung, Einmalmodus, Cron und SIGTERM");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
