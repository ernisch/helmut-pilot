"use strict";

// Echte Serverroute/Workerverdrahtung, ausschliesslich lokales HTTP und injizierte
// Ablage. Kein Quellenabruf, Modell oder Zugriff auf Production.
const assert = require("node:assert/strict");
const http = require("node:http");
process.env.CRON_SECRET = "isoliertes-quellenfenster";
process.env.HELMUT_OFFLINE_TEST = "1";
process.env.HELMUT_SOURCE_MODE = "off";
for (const key of ["HELMUT_QUELLEN_ARBEITSFENSTER", "HELMUT_SCALABLE_PIPELINE", "HELMUT_JOB_DISPATCH_MODE"]) delete process.env[key];
const pipeline = require("../lib/helmut/scalable-pipeline");
const storage = require("../lib/helmut/storage");
const coverage = require("../lib/helmut/quellenarchitektur/cron-abdeckung");
const tenantContext = require("../lib/helmut/tenant-context");
const handler = require("../server");
const changes = [];
function ersetze(obj, key, fn) { const old = obj[key]; changes.push(() => { obj[key] = old; }); obj[key] = fn; }
let pass = 0;
async function check(name, fn) { await fn(); pass++; console.log(`PASS ${name}`); }
async function main() {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const request = (path, auth = process.env.CRON_SECRET) => new Promise((resolve, reject) => {
    const req = http.get({ hostname: "127.0.0.1", port: server.address().port, path,
      headers: auth ? { authorization: `Bearer ${auth}` } : {} }, res => {
      let body = ""; res.on("data", b => { body += b; });
      res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(body) }));
    }); req.on("error", reject);
  });
  let zeit = Date.parse("2026-11-09T03:15:00Z"), leaseBis = 0, reservations = 0, workers = 0, initial = 0, resume = 0, retry = 0;
  const counts = new Map(); let planVorhanden = false, queueReady = true;
  try {
    ersetze(tenantContext, "resolveActiveTenant", async () => assert.fail("kein Mandatsread vor Fensterzulassung"));
    ersetze(Date, "now", () => zeit);
    ersetze(require("../lib/helmut/quellen-automatik"), "pruefe", async () => ({ erlaubt: true }));
    ersetze(storage, "anbieterReserviere", async o => {
      reservations++; const n = counts.get(o.schluessel) || 0;
      if (n + o.menge > o.grenzeTag) return { verfuegbar: true, erlaubt: false, grund: "tagesgrenze" };
      counts.set(o.schluessel, n + o.menge); return { verfuegbar: true, erlaubt: true };
    });
    ersetze(pipeline, "klassenAdapter", () => ({
      belege: async (_, { ttlMs }) => { if (leaseBis > zeit) return { erlaubt: false }; leaseBis = zeit + ttlMs; return { erlaubt: true, slot: "local-slot" }; },
      gebeFrei: async () => { leaseBis = 0; }
    }));
    ersetze(storage, "schreibeWarteschlangenLaufquittung", async () => ({ ok: true }));
    ersetze(coverage, "runQuellenCronMitAbdeckung", async execute => execute());
    ersetze(pipeline, "planeArbeit", async () => assert.fail("keine volle Neuplanung ueber Altpfad"));
    ersetze(pipeline, "setzePlanungFort", async o => {
      assert.equal(o.darfNeuPlanen, true); resume++;
      const neuGeplant = !planVorhanden;
      if (neuGeplant) { initial++; planVorhanden = true; }
      return { ok: true, neuGeplant, ausstehend: 0, profile: 3, tagesplan: { plaetze: 3 }, geplant: neuGeplant ? 40 : 0 };
    });
    ersetze(pipeline, "wiedervorlage", async () => { retry++; return { wiedervorgelegt: 0 }; });
    ersetze(pipeline, "arbeite", async o => {
      workers++; assert.equal(o.stapel, 1); return { erledigt: 12, reserviert: 12, verfuegbar: true };
    });
    ersetze(pipeline, "betriebsstatus", async () => ({ verfuegbar: queueReady, zustand: "bereit" }));

    await check("Fortsetzung Default AUS beendet vor jedem Speicherzugriff", async () => {
      const r = await request("/api/cron/crawl?arbeitsfenster=1");
      assert.equal(r.status, 200); assert.equal(r.json.grund, "arbeitsfenster-aus"); assert.equal(reservations, 0); assert.equal(workers, 0);
    });
    await check("gleiche Cronauth auch fuer Fortsetzung", async () => {
      const r = await request("/api/cron/crawl?arbeitsfenster=1", "falsch"); assert.equal(r.status, 403); assert.equal(reservations, 0);
    });
    Object.assign(process.env, {
      HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "off",
      HELMUT_QUELLEN_FENSTER_TAG: "8", HELMUT_QUELLEN_SEKUNDEN_TAG: "2400", HELMUT_ORIGINALABRUFE_TAG: "16",
      HELMUT_KLASSEN_GRENZEN: "on", HELMUT_WORKER_PARALLEL: "4", HELMUT_WORKER_BATCH: "25"
    });
    await check("Queue-Lesefehler stoppt echte Route vor Quote, Planung und Worker", async () => {
      queueReady = false;
      const r = await request("/api/cron/crawl?arbeitsfenster=1");
      assert.equal(r.status, 200); assert.equal(r.json.grund, "arbeitsfenster-vorflug-nicht-bereit");
      assert.equal(reservations, 0); assert.equal(workers, 0); assert.equal(resume, 0); assert.equal(retry, 0);
      queueReady = true;
    });
    await check("verpasster03:00-Termin:03:15 startet gesicherten Planweg und Worker", async () => {
      const r = await request("/api/cron/crawl?arbeitsfenster=1");
      assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.equal(initial, 1); assert.equal(workers, 1);
      assert.equal(r.json.arbeitsfenster.reservierteSekunden, 300); assert.equal(retry, 1);
    });
    await check("doppelte Zustellung startet weder Plan noch Worker", async () => {
      const r = await request("/api/cron/crawl?arbeitsfenster=1");
      assert.equal(r.json.ok, false); assert.equal(workers, 1); assert.equal(resume, 1);
    });
    await check("Folgetermin nutzt Fortsetzung und keine erneute Tageswiedervorlage", async () => {
      zeit += 15 * 60000;
      const r = await request("/api/cron/crawl?arbeitsfenster=1");
      assert.equal(r.json.ok, true); assert.equal(initial, 1); assert.equal(resume, 2); assert.equal(workers, 2); assert.equal(retry, 1);
    });
    await check("manueller Pipelinepfad kann dasselbe globale Fenster nicht umgehen", async () => {
      const r = await request("/api/cron/pipeline"); assert.equal(r.json.ok, false); assert.equal(workers, 2);
    });
    await check("nach Morgenfenster keine Planung/Arbeit/Abdeckungsabfragen", async () => {
      zeit = Date.parse("2026-11-09T05:00:00Z"); const vorher = reservations;
      const r = await request("/api/cron/crawl"); assert.equal(r.json.grund, "ausserhalb-quellenarbeitsfenster"); assert.equal(reservations, vorher);
    });
    await check("unvollstaendiger Plan laesst nur Quellen/Verstehen zu, keine Kundenausgabe", async () => {
      zeit = Date.parse("2026-11-09T03:45:00Z");
      ersetze(pipeline, "setzePlanungFort", async () => ({ ok: false, neuGeplant: false, ausstehend: 7,
        tagesplan: { plaetze: 3 }, grund: "planung-zeitbudget" }));
      ersetze(pipeline, "arbeite", async o => {
        // Quellenmodus ist im isolierten Lauf aus; vom zulässigen Paar bleibt
        // genau Understanding. Insbesondere keine Projektion/Materialisierung.
        assert.deepEqual(o.types, ["document_understanding"]);
        return { erledigt: 1, reserviert: 1, verfuegbar: true };
      });
      const r = await request("/api/cron/crawl?arbeitsfenster=1"); assert.equal(r.json.ok, false);
      assert.deepEqual(r.json.verarbeitung.typen, ["document_understanding"]);
    });
    console.log(`PASS ${pass}/${pass} Quellenfenster-Route; nur lokales HTTP`);
  } finally {
    for (const restore of changes.reverse()) restore();
    await new Promise(r => server.close(r));
  }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
