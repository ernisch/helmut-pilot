"use strict";
const assert = require("node:assert/strict");
const F = require("./github-testfenster-500");
const D = require("../lib/helmut/testkohorte-direkt500");
const T = require("../lib/helmut/testkohorte-testende");
const { welt, env, SHA } = require("./fixtures/direkt500");
let basis, passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
function adapter() {
  const snapshot = structuredClone(basis), calls = [], posts = [];
  const config = { ok: true, schemaVersion: 1, reinLesend: true, production: true, commit: SHA,
    storageSupabase: true, v3Bereit: true, profileRelational: true, profileExclusive: true,
    retentionGueltig: true, retention: 36, kommunikationGesperrt: true,
    kohortenQuellenGesperrt: true, tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal: 200,
    testKosten: { version: 2, aktiv: true, limitUsd: 4, maxManualCalls: null,
      maxWindowMs: null, unbekanntBleibtReserviert: true } };
  const h = { snapshot, calls, posts, config, zeit: F.ENDE, runs: [], postFehler: false,
    status: { sha: SHA, statuses: [{ context: "Vercel", state: "success",
      target_url: "https://vercel.com/nohut/helmut-pilot/deployment123" }] }, head: SHA };
  h.args = { env: { ...env("aktivierung"), GITHUB_TOKEN: "nur-test", GITHUB_RUN_ATTEMPT: "1",
    GITHUB_EVENT_NAME: "schedule", HELMUT_TIMER_CRON: F.END_CRON,
    GITHUB_WORKFLOW_REF: "ernisch/helmut-pilot/.github/workflows/500-testfenster.yml@refs/heads/main" },
  now: () => h.zeit, warten: async ms => { assert(ms > 0 && ms <= 30000); h.zeit += ms; },
  fetchFn: async (url, opts) => {
    calls.push({ url, method: opts.method });
    assert.equal(opts.redirect, "error");
    if (opts.method === "POST") {
      if (h.args.env.HELMUT_TIMER_DISPATCH_PROBE !== "true") assert.equal(h.zeit >= F.ENDE, true);
      assert.equal(url, "https://api.github.com/repos/ernisch/helmut-pilot/actions/workflows/500-testende.yml/dispatches");
      posts.push(JSON.parse(opts.body));
      if (h.postFehler) throw new Error("unbekannter Ausgang");
      return { status: 200, json: async () => ({ workflow_run_id: 123,
        html_url: "https://github.com/ernisch/helmut-pilot/actions/runs/123" }) };
    }
    assert.equal(opts.method, "GET");
    const p = new URL(url).pathname; let body;
    if (p.endsWith("/branches/main")) body = { commit: { sha: h.head } };
    else if (p.endsWith("/status")) body = h.status;
    else if (p.endsWith("/runs")) body = { workflow_runs: h.runs };
    else if (p.endsWith("/testnachweis-status")) body = config;
    else if (p.endsWith("/mandate_profiles")) body = snapshot.mandate;
    else if (p.endsWith("/profiles")) body = snapshot.identitaeten;
    else if (p.endsWith("/helmut_store")) body = [{ data: snapshot.auth }];
    else throw new Error("unerwarteter Netzpfad " + p);
    return { status: 200, json: async () => body };
  } };
  return h;
}
(async () => {
  const w = welt();
  for (const vorgang of ["provisionierung", "aktivierung"]) {
    assert.equal((await D.fuehreAus({ vorgang, env: env(vorgang), abnahmeA: w.beleg, deps: w.deps })).ok, true);
  }
  basis = w.snapshot();
  await test("Nur bestaetigtes Ende fordert genau den vorhandenen Abschluss an", async () => {
    const h = adapter(), vorher = JSON.stringify(h.snapshot);
    const r = await F.ausfuehren(h.args);
    assert.equal(r.abschlussAngefordert, true, JSON.stringify(r));
    assert.equal(r.testendeBestaetigt, false); assert.equal(r.aktiv, 500);
    assert.deepEqual(h.posts, [{ ref: "main", inputs: { schritt: "deaktivierung",
      production_commit: SHA, bestaetigung: T.CONFIRM } }]);
    assert.equal(JSON.stringify(h.snapshot), vorher);
  });
  await test("Vorpruefung und Stundenkontrolle schreiben auch nach Endzeit niemals", async () => {
    for (const event of ["workflow_dispatch", "schedule"]) {
      const h = adapter(); h.args.env.GITHUB_EVENT_NAME = event; h.args.env.HELMUT_TIMER_CRON = F.MONITOR_CRON;
      const r = await F.ausfuehren(h.args); assert.equal(r.ok, true); assert.equal(r.reinLesend, true);
      assert.equal(h.posts.length, 0);
    }
  });
  await test("Frueh gestarteter Endtimer wartet bis zur realen Endzeit", async () => {
    const h = adapter(); h.zeit = F.ENDE - 17 * 60000;
    assert.equal((await F.ausfuehren(h.args)).abschlussAngefordert, true);
    assert.equal(h.zeit, F.ENDE); assert.equal(h.posts.length, 1);
  });
  await test("Fremder Kontext, Wiederholung und falscher Termin bleiben gesperrt", async () => {
    for (const patch of [{ GITHUB_REF: "refs/heads/fremd" }, { GITHUB_EVENT_NAME: "push" },
      { GITHUB_WORKFLOW_REF: "fremd" }, { GITHUB_RUN_ATTEMPT: "2" }, { HELMUT_TIMER_CRON: "* * * * *" }]) {
      const h = adapter(); Object.assign(h.args.env, patch);
      assert.equal((await F.ausfuehren(h.args)).ok, false); assert.equal(h.calls.length, 0);
    }
    for (const zeit of [F.START - 1, F.ENDE + 2 * 3600000, Date.parse("2027-09-16T11:00:00Z")]) {
      const h = adapter(); h.zeit = zeit;
      assert.equal((await F.ausfuehren(h.args)).reinLesend, true); assert.equal(h.calls.length, 0);
    }
  });
  await test("Freigegebene manuelle Dispatchprobe fordert nur eine echte Nurlesevorpruefung an", async () => {
    const h = adapter(); h.zeit = F.START + 60000;
    h.args.env.GITHUB_EVENT_NAME = "workflow_dispatch"; h.args.env.HELMUT_TIMER_DISPATCH_PROBE = "true";
    const r = await F.ausfuehren(h.args);
    assert.equal(r.vorpruefungAngefordert, true); assert.equal(r.abschlussAngefordert, false);
    assert.equal(h.posts[0].inputs.schritt, "vorpruefung"); assert.equal(h.posts[0].inputs.bestaetigung, "");
    const a = adapter(); a.args.env.HELMUT_TIMER_DISPATCH_PROBE = "true";
    assert.equal((await F.ausfuehren(a.args)).ok, false); assert.equal(a.calls.length, 0);
  });
  await test("Neuer Main, Vercel Fehler oder fremder Appcommit verhindern Dispatch", async () => {
    for (const art of ["main", "vercel", "app"]) {
      const h = adapter();
      if (art === "main") h.head = "b".repeat(40);
      if (art === "vercel") h.status.statuses[0].state = "pending";
      if (art === "app") h.config.commit = "b".repeat(40);
      assert.equal((await F.ausfuehren(h.args)).ok, false); assert.equal(h.posts.length, 0);
    }
  });
  await test("Kontenschutz und unvollstaendige Kohorte verhindern Dispatch", async () => {
    for (const art of ["konto", "profil"]) {
      const h = adapter();
      if (art === "konto") h.snapshot.auth.users.find(u => u.email.endsWith("@test-kohorte.invalid")).active = true;
      else h.snapshot.mandate.pop();
      assert.equal((await F.ausfuehren(h.args)).ok, false); assert.equal(h.posts.length, 0);
    }
  });
  await test("Beendeter Bestand und schon angeforderte Abschluesse werden nicht erneut ausgeloest", async () => {
    const h = adapter();
    for (const m of h.snapshot.mandate) if (T.KOHORTE_KENNUNGEN.includes(m.user_id)) m.aktiv = false;
    assert.equal((await F.ausfuehren(h.args)).synthetischInaktiv, 495); assert.equal(h.posts.length, 0);
    for (const status of ["queued", "in_progress", "completed"]) {
      const a = adapter(); a.runs = [{ status, created_at: new Date(F.ENDE).toISOString() }];
      assert.equal((await F.ausfuehren(a.args)).ok, false); assert.equal(a.posts.length, 0);
    }
  });
  await test("Unbekannter POST Ausgang bleibt offen und wird nicht wiederholt", async () => {
    const h = adapter(); h.postFehler = true;
    const r = await F.ausfuehren(h.args);
    assert.equal(r.ok, false); assert.equal(r.ausgangUnbekannt, true);
    assert.equal(r.automatischeWiederholung, false); assert.equal(h.posts.length, 1);
  });
  await test("Kostenfreie Beendigung bleibt bei fehlendem Kostenbuch moeglich", async () => {
    const h = adapter(); delete h.snapshot.auth.testKostenTage;
    const r = await F.ausfuehren(h.args);
    assert.equal(r.abschlussAngefordert, true); assert.equal(r.tageskosten.kostenbuchNichtBestaetigt, true);
  });
  console.log(`${passed}/${passed} Testfensterpruefungen bestanden`);
})().catch(e => { console.error(e); process.exitCode = 1; });
