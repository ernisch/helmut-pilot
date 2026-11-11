"use strict";
// Echter lokaler Server und echte Automatikentscheidung, nur die Ablage/Arbeit ersetzt.
const assert = require("node:assert/strict"), http = require("node:http"), crypto = require("node:crypto");
Object.assign(process.env, { HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_SCALABLE_PIPELINE: "on",
  HELMUT_JOB_DISPATCH_MODE: "off", HELMUT_KLASSEN_GRENZEN: "on", HELMUT_QUELLEN_FENSTER_TAG: "8",
  HELMUT_QUELLEN_SEKUNDEN_TAG: "2400", HELMUT_ORIGINALABRUFE_TAG: "16", CRON_SECRET: "lokale-automatik",
  HELMUT_SOURCE_MODE: "off", HELMUT_OFFLINE_TEST: "1" });
const storage = require("../lib/helmut/storage"), pipeline = require("../lib/helmut/scalable-pipeline");
const handler = require("../server");
let now = Date.parse("2026-11-11T03:00:00Z"), leaseBis = 0, workers = 0, plans = 0, reservierungen = 0, fail = false, fertig = false, readsFail = false;
let counts = new Map(), runs = new Map(), zeitrest = false, workerUnbekannt = false;
const restore = [];
function replace(obj, key, fn) { const old = obj[key]; restore.push(() => obj[key] = old); obj[key] = fn; }
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log("PASS " + name); }
function reset() { now = Date.parse("2026-11-11T03:00:00Z"); leaseBis = workers = plans = reservierungen = 0; fail = fertig = readsFail = zeitrest = workerUnbekannt = false; counts = new Map(); runs = new Map(); }
async function main() {
  replace(Date, "now", () => now);
  replace(globalThis, "fetch", async () => assert.fail("kein externer Fachaufruf"));
  replace(require("../lib/helmut/tenant-context"), "resolveActiveTenant", async () => assert.fail("kein Profilread vor Zulassung"));
  replace(pipeline, "betriebsstatus", async () => ({ verfuegbar: true, zustand: "bereit" }));
  replace(pipeline, "klassenAdapter", () => ({ belege: async (_, o) => {
    if (leaseBis > now) return { erlaubt: false }; leaseBis = now + o.ttlMs; return { erlaubt: true, slot: "local" };
  }, gebeFrei: async () => { leaseBis = 0; } }));
  replace(storage, "anbieterReserviere", async o => {
    reservierungen++; const n = counts.get(o.schluessel) || 0;
    if (n + o.menge > o.grenzeTag) return { verfuegbar: true, erlaubt: false, grund: "tagesgrenze" };
    counts.set(o.schluessel, n + o.menge); return { verfuegbar: true, erlaubt: true };
  });
  replace(storage, "listProcessRunsRelational", async o => [...runs.values()].filter(r => r.process === o.process));
  replace(storage, "schreibeWarteschlangenLaufquittung", async r => {
    runs.set(r.runId, { ...r, finishedAt: r.finishedAt ? new Date(now).toISOString() : null }); return { ok: true };
  });
  replace(storage, "supabaseRequest", async (url, o) => {
    assert.equal(o, undefined); if (readsFail) throw Error("Leseausfall");
    if (url.startsWith("/rest/v1/helmut_anbieter_fenster?")) {
      return [...counts].filter(([k]) => k === "quellenarbeit|fenster" || k.startsWith("quellenarbeit|slot|"))
        .map(([schluessel, verbraucht]) => ({ schluessel, verbraucht }));
    }
    if (url.startsWith("/rest/v1/helmut_jobs?")) return [];
    assert.ok(url.startsWith("/rest/v1/helmut_store?"), url);
    if (!fertig || url.includes("zustand=eq.offen") && !zeitrest) return [];
    const data = { version: 1, tag: "2026-11-11", cursor: 0,
      auftraege: zeitrest ? [{ idempotencyKey: "synthetischer-planrest" }] : [], tagesplan: null, zustand: zeitrest ? "offen" : "fertig" };
    data.manifestHash = crypto.createHash("sha256").update(JSON.stringify([data.tag, data.auftraege, null])).digest("hex");
    return [{ id: "main-quellenplan-2026-11-11", data }];
  });
  replace(pipeline, "setzePlanungFort", async () => { plans++; fertig = true; return {
    ok: !fail && !zeitrest, neuGeplant: plans === 1, ausstehend: fail || zeitrest ? 1 : 0, geplant: 0, neu: zeitrest ? 1 : 0,
    grund: fail ? "planung-einreihung-nicht-bestaetigt" : zeitrest ? "planung-zeitbudget" : null, tagesplan: { plaetze: 1 } }; });
  replace(pipeline, "wiedervorlage", async () => ({ wiedervorgelegt: 0 }));
  replace(pipeline, "arbeite", async () => { workers++; return { verfuegbar: true, erledigt: 0, reserviert: 0,
    nichtUebernommen: workerUnbekannt ? 1 : 0, zurueckstellungNichtVerfuegbar: 0, stapelrestNichtZurueckgegeben: 0 }; });
  replace(require("../lib/helmut/quellenarchitektur/cron-abdeckung"), "runQuellenCronMitAbdeckung", async fn => fn());
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const request = () => new Promise((resolve, reject) => {
    http.get({ hostname: "127.0.0.1", port: server.address().port, path: "/api/cron/crawl?arbeitsfenster=1",
      headers: { authorization: "Bearer lokale-automatik" } }, res => {
      let body = ""; res.on("data", b => body += b); res.on("end", () => { assert.equal(res.statusCode, 200); resolve(JSON.parse(body)); });
    }).on("error", reject);
  });
  try {
    await check("echte Route startet einmal; sieben leere Folgetermine reservieren nichts", async () => {
      assert.equal((await request()).ok, true);
      for (let i = 0; i < 7; i++) { now += 15 * 60000; assert.equal((await request()).grund, "automatik-erledigt"); }
      assert.equal(plans, 1); assert.equal(workers, 1); assert.equal(reservierungen, 3);
    });
    await check("echter Planungsfehler stoppt Folgefenster ohne Zaehlerreset oder Wiederplanung", async () => {
      reset(); fail = true; assert.equal((await request()).ok, false);
      for (let i = 0; i < 7; i++) { now += 15 * 60000; assert.equal((await request()).grund, "automatik-startfehler"); }
      assert.equal(plans, 1); assert.equal(counts.get("quellenarbeit|fenster"), 1); assert.equal(reservierungen, 3);
    });
    await check("Ausfall des Bedarfslesers stoppt echte Route vor Reserve/Planung/Worker", async () => {
      reset(); readsFail = true; assert.equal((await request()).grund, "automatik-unbekannt");
      assert.equal(plans + workers + reservierungen, 0);
    });
    await check("echter Quittungsschreiber: fortsetzbarer Zeitrest darf weiterlaufen", async () => {
      reset(); zeitrest = true; await request();
      const r = [...runs.values()][0];
      assert.equal(r.status, "partial"); assert.equal(r.reason, "planung-zeitbudget-fortsetzbar");
      now += 15 * 60000; await request(); assert.equal(plans, 2);
    });
    await check("Zeitrest mit unbekanntem Workerabschluss wird nicht als fortsetzbar quittiert", async () => {
      reset(); zeitrest = workerUnbekannt = true; await request();
      assert.equal([...runs.values()][0].status, "failed");
      now += 15 * 60000; assert.equal((await request()).grund, "automatik-startfehler"); assert.equal(plans, 1);
    });
    console.log(`PASS ${passed}/${passed} echte Quellenautomatik-Route`);
  } finally { await new Promise(r => server.close(r)); for (const f of restore.reverse()) f(); }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
