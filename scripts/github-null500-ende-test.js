"use strict";
const A = require("node:assert/strict");
const T = require("./github-null500-ende");
const F = require("./fixtures/nachweis-null500");
const { kostentag } = require("./fixtures/null500");
const D = require("../lib/helmut/testkohorte-direkt500");
const env = { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: F.manifest.productionCommit,
  HELMUT_PRODUCTION_COMMIT: F.manifest.productionCommit, HELMUT_TESTFENSTER_ID: F.manifest.laufId,
  HELMUT_MANIFEST_HASH: D.hash(F.manifest), HELMUT_TESTFENSTER_ENDE: F.manifest.endeAm,
  HELMUT_TESTENDE_EXECUTE: "1", HELMUT_TESTENDE_CONFIRM: T.CONFIRM };
let pass = 0;
function ok(s) { pass++; console.log("PASS " + s); }
function welt() {
  const w = { now: Date.parse("2026-09-19T12:00:20.000Z"), q: F.zeile().data,
    calls: [], meldungen: [], auth: { testKostenTage: { "2026-09-19": kostentag("2026-09-19") } } };
  w.profile = [...F.manifest.ids.map(user_id => ({ user_id, aktiv: true })),
    ...F.manifest.ausserhalb.map(user_id => ({ user_id, aktiv: false }))];
  w.a = T.auftrag(env, w.now);
  w.deps = { jetzt: () => w.now, warte: async ms => { w.now += ms; }, melde: r => w.meldungen.push(r),
    leseQuittung: async () => structuredClone(w.q), leseKosten: async () => w.auth,
    leseProfile: async () => structuredClone(w.profile),
    beende: async (m, grund) => {
      A.deepEqual(m, F.manifest); w.calls.push(grund);
      w.profile.filter(p => m.ids.includes(p.user_id)).forEach(p => { p.aktiv = false; });
      w.q = { ...w.q, zustand: "beendet", beendetAm: new Date(w.now).toISOString(), deaktiviert: 500 };
    } };
  return w;
}
async function run(w) { return T.steuere({ a: w.a, deps: w.deps }); }
async function main() {
  let w = welt(), r = await run(w);
  A.equal(r.ok, true); A.equal(r.zielAktiv, 0); A.equal(r.ausserhalbAktiv, 0);
  A.deepEqual(w.calls, ["frist"]); A.equal(w.now, w.a.ende); A.equal(w.meldungen[0].aktivierungsrecht, false);
  ok("Feste Frist stoppt genau einmal und bestaetigt alle500 plus vier Ausnahmen");
  for (const mutation of [w => { w.auth = {}; }, w => { w.deps.leseKosten = async () => { throw Error("offline"); }; },
    w => { Object.assign(w.auth.testKostenTage["2026-09-19"], { baseline: 4000000, spent: 4000000 }); }]) {
    w = welt(); mutation(w); r = await run(w); A.equal(r.ok, true); A.deepEqual(w.calls, ["notstopp"]);
  }
  ok("Fehlendes, unlesbares oder ausgeschoepftes Budget blockiert das sichere Ende nicht");
  w = welt(); const stop = w.deps.beende;
  w.deps.beende = async (...args) => { await stop(...args); throw Error("Antwort verloren"); };
  r = await run(w); A.equal(r.ok, true); A.equal(r.schreibversuche, 1); A.equal(w.calls.length, 1);
  ok("Verlorene Schreibantwort wird unabhaengig gelesen; kein Retry");
  w = welt(); w.deps.beende = async () => { w.calls.push("fehlgeschlagen"); throw Error("vor Write"); };
  r = await run(w); A.equal(r.ok, false); A.equal(r.zielAktiv, 500); A.equal(r.schreibversuche, 1);
  ok("Unbestaetigtes Ende bleibt Fehler mit500 Aktiven; kein falsches Gruen");
  w = welt(); w.profile[503].aktiv = true;
  r = await run(w); A.equal(r.ok, false); A.equal(r.zielAktiv, 0); A.equal(r.ausserhalbAktiv, 1);
  A.equal(w.profile[503].aktiv, true); ok("Fremdes aktives Profil bleibt erhalten und verhindert globalen Nullnachweis");
  w = welt(); w.q = null; r = await run(w);
  A.equal(r.ok, false); A.equal(r.schreibversuche, 0); A.equal(w.now, Date.parse("2026-09-19T12:05:20.000Z"));
  ok("Ohne Aktivierungsquittung nach fuenf Minuten Ende ohne Schreibrecht");
  w = welt(); w.q.manifest.productionCommit = "b".repeat(40); r = await run(w);
  A.equal(r.ok, false); A.equal(r.schreibversuche, 0); ok("Fremdes Manifest wird vor jedem Write abgewiesen");
  w = welt(); w.q = F.zeile("beendet").data; w.profile.forEach(p => { p.aktiv = false; });
  r = await run(w); A.equal(r.ok, true); A.equal(r.schreibversuche, 0);
  ok("Bereits manuell bestaetigtes Ende bleibt rein lesend");
  let netz = 0;
  r = await T.ausfuehren({ env, jetzt: () => Date.parse("2026-09-19T12:00:20.000Z"), fetchFn: async () => { netz++; } });
  A.equal(r.ok, true); A.equal(r.bewaffnet, false); A.equal(netz, 0);
  for (const patch of [{ HELMUT_TESTENDE_CONFIRM: "" }, { HELMUT_TESTENDE_EXECUTE: "0" },
    { GITHUB_REF: "refs/heads/feature" }, { HELMUT_PRODUCTION_COMMIT: "b".repeat(40) },
    { HELMUT_TESTFENSTER_ENDE: "2026-09-19T18:00:00.000Z" }]) {
    r = await T.ausfuehren({ scharf: true, env: { ...env, ...patch },
      jetzt: () => Date.parse("2026-09-19T12:00:20.000Z"), fetchFn: async () => { netz++; } });
    A.equal(r.ok, false); A.equal(r.schreibversuche, 0); A.equal(netz, 0);
  }
  ok("Standard ohne Netz; fehlende Freigabe, Branch, Commit und Ueberlaenge vor Netz gesperrt");
  w = welt(); const requests = [];
  r = await T.ausfuehren({ scharf: true, env: { ...env, SUPABASE_URL: require("./github-fachzyklus-a").PROJECT_URL,
    SUPABASE_SERVICE_ROLE_KEY: "isolierter-testschluessel" }, jetzt: w.deps.jetzt, warte: w.deps.warte,
    melde: w.deps.melde, fetchFn: async (url, opt) => {
      requests.push([url, opt.method]); let rows;
      if (url.includes("/rpc/")) {
        const b = JSON.parse(opt.body); A.equal(b.p_bestaetigung, T.CONFIRM);
        A.equal(b.p_lauf_id, F.manifest.laufId); await w.deps.beende(b.p_manifest, b.p_grund);
        throw Error("HTTP Antwort verloren");
      }
      if (url.includes("mandate_profiles?")) rows = w.profile;
      else if (url.includes("id=eq.main-auth")) rows = [{ data: w.auth }];
      else rows = [{ id: F.zeile().id, data: w.q }];
      return { status: 200, headers: { get: () => `0-${rows.length - 1}/${rows.length}` },
        json: async () => structuredClone(rows) };
    } });
  A.equal(r.ok, true); A.equal(requests.filter(x => x[1] === "POST").length, 1);
  A.ok(requests.every(([url, method]) => method === "GET" || url.endsWith("/rpc/helmut_testfenster_null500_ende")));
  A.ok(!JSON.stringify([r, w.meldungen]).includes("test-kohorte-"));
  ok("Echter Adapter hat genau einen engen RPC Write, Gegenlesung und keine Profilkennung im Bericht");
  console.log(`${pass} PASS, 0 FAIL; nur simulierte Uhr und Speicher, kein Production Aufruf.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
