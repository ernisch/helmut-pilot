"use strict";
// Nur neue Abnahmeluecken: kleine injizierte Antworten, kein Quellen-/Modell-/DB-Lauf.
const A = require("node:assert/strict");
const S = require("../lib/helmut/storage"), W = require("../lib/helmut/worker-betrieb"), P = require("../lib/helmut/scalable-pipeline");
const F = require("../lib/helmut/quellen-arbeitsfenster");
const env = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_KLASSEN_GRENZEN: "on", HELMUT_QUELLEN_ARBEITSFENSTER: "on",
  HELMUT_JOB_DISPATCH_MODE: "shadow", HELMUT_QUELLEN_FENSTER_TAG: "8", HELMUT_QUELLEN_SEKUNDEN_TAG: "2400", HELMUT_ORIGINALABRUFE_TAG: "16" };
const zeros = { offen: 0, wartend: 0, laufend: 0, fehlgeschlagen: 0, erledigt: 0 };
let count = 0;
const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7);
async function test(name, fn) { if (only && !name.includes(only)) return; await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Kernvorflug liest ausschliesslich neue RPC mit leeren Filtern", async () => {
    let calls = 0;
    A.deepEqual(await S.jobQueueTageskernBereit({ bereit: true, rpc: async (name, args) => {
      calls++; A.equal(name, "helmut_jobs_tagesstand"); A.deepEqual(args, { p_fenster: [], p_typen: [], p_mandat: null }); return [zeros];
    } }), { verfuegbar: true }); A.equal(calls, 1);
  });
  await test("Fehlende Migration und unlesbare Antwort sind niemals bereit", async () => {
    for (const data of [null, [], [{}], [{ ...zeros, offen: "0" }], [zeros, zeros], [{ ...zeros, erledigt: 1 }]]) {
      A.equal((await S.jobQueueTageskernBereit({ bereit: true, rpc: async () => data })).verfuegbar, false);
    }
    A.equal((await S.jobQueueTageskernBereit({ bereit: true, rpc: async () => { throw Error("PGRST202 missing function"); } })).verfuegbar, false);
  });
  const old = P.betriebsstatus;
  try {
    await test("Alte Metriken reichen ohne neue Kernmigration nicht fuer Bereitschaft", async () => {
      let metrics = 0; P.betriebsstatus = async () => { metrics++; return { verfuegbar: true, zustand: "kritisch" }; };
      const r = await W.readiness({ env, deps: { tageskernBereit: async () => ({ verfuegbar: false, grund: "tageskern-migration-fehlt" }) } });
      A.equal(r.bereit, false); A.ok(r.gruende.includes("tageskern-migration-fehlt")); A.equal(metrics, 0);
      A.equal((await W.readiness({ env, deps: { tageskernBereit: async () => ({ verfuegbar: true }) } })).bereit, true); A.equal(metrics, 1);
    });
    await test("Fehlende Kernmigration verbraucht im echten Quellenfenster keine Quote", async () => {
      let reserved = 0, worked = false, freed = 0;
      const r = await F.fuehreAus({ env, deps: {
        now: () => Date.parse("2026-11-13T03:00:00Z"),
        klassen: { belege: async () => ({ erlaubt: true, slot: "test" }), gebeFrei: async () => { freed++; } },
        bereitschaft: () => W.readiness({ env, deps: { tageskernBereit: async () => ({ verfuegbar: false }) } }),
        reserviere: async () => { reserved++; return { erlaubt: true }; }
      }, arbeit: async () => { worked = true; return { ok: true }; } });
      A.equal(r.grund, "arbeitsfenster-vorflug-nicht-bereit"); A.equal(reserved, 0); A.equal(worked, false); A.equal(freed, 1);
    });
  } finally { P.betriebsstatus = old; }
  await test("Materialisierung reicht fehlende aktuelle Lage ausdruecklich als null weiter", async () => {
    let stored = false;
    const result = await P.HANDLER.briefing_materialization({ id: "synthetisch", tenantId: "test-abnahme",
      payload: { mandatsId: "test-abnahme" }, freshnessWindow: "2026-11-13T00Z", createdAt: "2026-11-13T05:00:00Z" }, {
      env: { HELMUT_SCALABLE_PIPELINE: "on" }, now: () => Date.parse("2026-11-13T05:15:00Z"),
      offeneVorbedingungen: async () => ({ verfuegbar: true, offen: 0 }),
      getActiveProfile: async () => ({ id: "test-abnahme" }), buildV3Briefing: async () => ({ available: false, items: [] }),
      lageNarrativ: async (_profile, opts) => { A.equal(opts.cacheOnly, true); return null; },
      materialisiereBriefing: async args => { A.equal(Object.hasOwn(args, "lageAnsicht"), true); A.equal(args.lageAnsicht, null);
        stored = true; return { ok: true, gespeichert: true }; }
    });
    A.equal(stored, true); A.equal(result.ok, true);
  });
  console.log(`${count}/${count} neue Bereitschafts-Abnahmefaelle bestanden.`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
