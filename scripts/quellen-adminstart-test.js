"use strict";

// Nur lokales HTTP, Queue/Storage-Mocks und optional die ausgelieferte Original-UI.
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const path = require("node:path");
process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_OFFLINE_TEST = "1";
Object.assign(process.env, { CRON_SECRET: "synthetischer-adminstart", HELMUT_SCALABLE_PIPELINE: "on",
  HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_KLASSEN_GRENZEN: "on", HELMUT_JOB_DISPATCH_MODE: "off",
  HELMUT_QUELLEN_FENSTER_TAG: "8", HELMUT_QUELLEN_SEKUNDEN_TAG: "2400", HELMUT_ORIGINALABRUFE_TAG: "16" });
const auth = require("../lib/helmut/auth"), storage = require("../lib/helmut/storage");
const pipeline = require("../lib/helmut/scalable-pipeline"), windowGate = require("../lib/helmut/quellen-arbeitsfenster");
const admin = require("../lib/helmut/quellen-adminstart");
const handler = require("../server");
const restores = [];
function replace(obj, key, value) { const old = obj[key]; restores.push(() => obj[key] = old); obj[key] = value; }
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
const auftrag = () => ({ auftragId: crypto.randomUUID(), tag: "2026-11-11" });

async function main() {
  let now = Date.parse("2026-11-11T14:20:00Z"), user = { id: "synthetic-admin", role: "admin" };
  let leaseBis = 0, plans = 0, workers = 0, retries = 0, ready = true, hold = null;
  const counts = new Map(), receipts = new Map(), errors = [];
  replace(Date, "now", () => now);
  replace(auth, "getAuthContext", async () => ({ user }));
  replace(auth, "getAllowedPoliticianIds", async () => "all");
  replace(auth, "pickPoliticianId", () => "synthetic-profile");
  replace(globalThis, "fetch", async () => assert.fail("kein externer Aufruf"));
  replace(require("../lib/helmut/accounts"), "recordSystemError", async e => { errors.push(e); });
  replace(storage, "anbieterReserviere", async o => {
    const key = new Date(now).toISOString().slice(0, 10) + "|" + o.schluessel;
    const n = counts.get(key) || 0;
    if (n + o.menge > o.grenzeTag) return { verfuegbar: true, erlaubt: false, grund: "tagesgrenze" };
    counts.set(key, n + o.menge); return { verfuegbar: true, erlaubt: true };
  });
  replace(pipeline, "klassenAdapter", () => ({
    belege: async (klasse, o) => { assert.equal(klasse, "worker-drain"); if (leaseBis > now) return { erlaubt: false };
      leaseBis = now + o.ttlMs; return { erlaubt: true, slot: "synthetic-lease" }; },
    gebeFrei: async () => { leaseBis = 0; }
  }));
  replace(pipeline, "betriebsstatus", async () => ({ verfuegbar: ready, zustand: "bereit" }));
  replace(pipeline, "planeArbeit", async () => assert.fail("kein alternativer Planpfad"));
  replace(pipeline, "setzePlanungFort", async o => { assert.equal(o.darfNeuPlanen, true); plans++;
    return { ok: true, neuGeplant: plans === 1, ausstehend: 0, geplant: 3, profile: 1, tagesplan: { plaetze: 1 } }; });
  replace(pipeline, "wiedervorlage", async () => { retries++; return { wiedervorgelegt: 0 }; });
  replace(pipeline, "arbeite", async o => { workers++; assert.equal(o.stapel, 1); if (hold) await hold;
    assert.ok(!o.types?.includes("source_fetch"), "Quellenmodus off bleibt wirksam");
    return { verfuegbar: true, erledigt: 3, reserviert: 3 }; });
  replace(storage, "schreibeWarteschlangenLaufquittung", async r => { receipts.set(r.runId, r); return { ok: true }; });
  replace(storage, "listProcessRunsRelational", async () => [...receipts.values()]);
  replace(require("../lib/helmut/quellenarchitektur/cron-abdeckung"), "runQuellenCronMitAbdeckung", async fn => fn());
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  function request(route, method = "GET", body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(base + route, { method, headers: { "Content-Type": "application/json", ...headers } }, res => {
        let text = ""; res.on("data", c => text += c); res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
      }); req.on("error", reject); req.end(body ? JSON.stringify(body) : undefined);
    });
  }
  const url = "/api/admin/quellenlauf";
  let csrf;
  const send = a => request(url, "POST", a, { "X-CSRF-Token": csrf });
  const status = a => request(`${url}?${new URLSearchParams(a)}`);
  const advance = () => { now += 7 * 60000; };
  try {
    csrf = (await request("/api/security/csrf")).body.token;
    await check("ohne Adminsession auch mit Cronsecret kein Start oder Statusread", async () => {
      for (const role of [null, "abgeordneter", "referent", "demo"]) {
        user = role ? { id: "synthetic-member", role } : null;
        for (const method of ["GET", "POST"]) {
          const r = await request(url, method, method === "POST" ? auftrag() : null, { Authorization: "Bearer synthetischer-adminstart", "X-CSRF-Token": csrf });
          assert.equal(r.status, role ? 403 : 401);
        }
      }
      assert.equal(counts.size, 0); assert.equal(plans, 0); user = { id: "synthetic-admin", role: "admin" };
    });
    await check("CSRF, POST-Methode, strikter Auftrag und Tagesbindung", async () => {
      assert.equal((await request(url, "POST", auftrag())).status, 403);
      assert.equal((await request(url, "DELETE")).status, 405);
      assert.equal((await send({ ...auftrag(), force: true })).status, 400);
      assert.equal((await send({ ...auftrag(), tag: "2026-11-10" })).body.zustand, "gesperrt");
      assert.equal(counts.size, 0); assert.equal(workers, 0);
    });
    await check("GET liest ausschliesslich; fehlender Beleg bleibt unbekannt", async () => {
      assert.equal((await status(auftrag())).body.grund, "kein-laufbeleg"); assert.equal(counts.size, 0);
    });
    await check("fehlende Bereitschaft sperrt vor Kontingent und Planung", async () => {
      ready = false; assert.equal((await send(auftrag())).body.grund, "arbeitsfenster-vorflug-nicht-bereit"); ready = true;
      assert.equal(counts.size, 0); assert.equal(plans, 0);
    });
    let first;
    await check("Nachmittagsstart nutzt produktive Planung/Worker/Quittung und dieselben Limits", async () => {
      first = auftrag(); const r = await send(first);
      assert.equal(r.status, 200); assert.equal(r.body.zustand, "abgeschlossen"); assert.equal(r.body.verarbeitet, 3);
      assert.equal(plans, 1); assert.equal(workers, 1); assert.equal(retries, 1);
      assert.equal(counts.get("2026-11-11|" + windowGate.SCHLUESSEL.fenster), 1);
      assert.equal(counts.get("2026-11-11|" + windowGate.SCHLUESSEL.sekunden), 300);
      assert.equal((await status(first)).body.zustand, "abgeschlossen");
    });
    await check("Cron und zweiter Admin teilen die gehaltene Sperre", async () => {
      assert.equal((await send(auftrag())).body.grund, "arbeitsfenster-belegt-oder-unbekannt");
      now = Date.parse("2026-11-11T03:15:00Z");
      assert.equal((await request("/api/cron/crawl", "GET", null, { Authorization: "Bearer synthetischer-adminstart" })).body.ok, false);
      now = Date.parse("2026-11-11T14:27:00Z"); assert.equal(workers, 1);
    });
    await check("gleiche Kennung startet nach Leaseablauf keine zweite Arbeit", async () => {
      assert.equal((await send(first)).body.zustand, "gesperrt"); assert.equal(workers, 1); assert.equal(plans, 1);
    });
    await check("laufender Auftrag liefert korrelierten Fortschritt; Parallelstart bleibt gesperrt", async () => {
      const a = auftrag(); let release; hold = new Promise(r => release = r);
      const running = send(a); while (workers < 2) await new Promise(r => setTimeout(r, 1));
      assert.equal((await status(a)).body.zustand, "laeuft");
      assert.equal((await send(auftrag())).body.zustand, "gesperrt");
      release(); hold = null; assert.equal((await running).body.zustand, "abgeschlossen"); advance();
    });
    await check("erschoepfte Fensterquote sperrt ohne Planung, Refund oder Zaehleraenderung", async () => {
      const key = "2026-11-11|" + windowGate.SCHLUESSEL.fenster; counts.set(key, 8);
      const before = plans, r = await send(auftrag());
      assert.equal(r.body.zustand, "gesperrt"); assert.equal(r.body.grund, "fensterkontingent-erschoepft");
      assert.equal(plans, before); assert.equal(counts.get(key), 8);
    });
    await check("Originalkontingent bleibt gesperrt; Teilstand oder fehlende Endquittung wird kein Erfolg", async () => {
      const sources = await windowGate.reserviereOriginal({ deps: { reserviere: async () => ({ verfuegbar: true, erlaubt: false, grund: "tagesgrenze" }) } });
      assert.equal(sources.erlaubt, false);
      assert.equal(admin.ergebnis(first, { ok: true, lauftelemetrie: { status: "partial", ende: true } }).zustand, "teilweise");
      assert.equal(admin.ergebnis(first, { ok: true, lauftelemetrie: { status: "success", ende: false } }).zustand, "unbekannt");
    });
    await check("Statuslesefehler und fehlende Zaehler erzeugen keinen Erfolg", async () => {
      assert.equal((await admin.leseStatus(first, { lese: async () => { throw Error("secret must not leak"); } })).grund, "laufbeleg-nicht-lesbar");
      assert.equal(admin.ergebnis(first, {}).verarbeitet, null);
      const r = await admin.leseStatus(first, { lese: async () => [{ runId: admin.laufId(first), process: "warteschlange-crawl", status: "success" }] });
      assert.equal(r.zustand, "unbekannt");
      assert.equal((await admin.leseStatus(first, { lese: async () => ({}) })).grund, "laufbeleg-nicht-lesbar");
      assert.equal((await admin.leseStatus(first, { lese: async () => [{ runId: admin.laufId(first), process: "warteschlange-crawl",
        status: "running", startedAt: new Date(now - 300001).toISOString() }] })).zustand, "unbekannt");
      now = Date.parse("2026-11-11T23:56:00Z"); assert.equal((await send(auftrag())).body.grund, "adminauftrag-tagesende");
      now = Date.parse("2026-11-12T14:20:00Z"); csrf = (await request("/api/security/csrf")).body.token;
      assert.equal((await send(first)).body.zustand, "gesperrt");
    });
    await check("UI sendet einmal, behaelt unbekannten Auftrag beim Reload und fragt nur lesend nach", async () => {
      const { createQuellenlauf, quellenlaufText } = await import("../verwaltung/original-quellenlauf.mjs");
      const memo = new Map(), calls = []; let release;
      const host = { crypto, sessionStorage: { getItem: k => memo.get(k), setItem: (k, v) => memo.set(k, v), removeItem: k => memo.delete(k) } };
      const client = createQuellenlauf({ host, fetcher: async (url, o) => {
        calls.push([url, o.method || "GET"]);
        if (url === "/api/security/csrf") return { ok: true, json: async () => ({ token: "synthetic-csrf-for-unit-test" }) };
        await new Promise(r => release = r); throw Error("lost response");
      } });
      const firstPost = client.start(); while (!release) await Promise.resolve();
      await client.start(); assert.equal(calls.filter(c => c[1] === "POST").length, 1);
      release(); await firstPost; assert.equal(client.state().zustand, "unbekannt"); client.dispose();
      const restored = createQuellenlauf({ host, fetcher: async (url, o) => {
        assert.equal(o.method, undefined); assert.match(url, /^\/api\/admin\/quellenlauf\?/);
        const a = JSON.parse([...memo.values()][0]); return { ok: true, json: async () => ({ laufId: admin.laufId(a), zustand: "abgeschlossen", verarbeitet: 3 }) };
      } });
      restored.restore(); await restored.status(); assert.equal(restored.state().zustand, "abgeschlossen");
      assert.match(quellenlaufText({ zustand: "gesperrt", grund: "arbeitslimit-tagesgrenze" }), /Keine Sonderfreigabe/);
      assert.equal(memo.size, 0); restored.dispose();
    });
    await check("spaeter Statusfehler ueberschreibt keinen bestaetigten POST-Abschluss", async () => {
      const { createQuellenlauf } = await import("../verwaltung/original-quellenlauf.mjs");
      const memo = new Map(); let finishPost, failStatus, a;
      const host = { crypto, sessionStorage: { getItem: k => memo.get(k), setItem: (k, v) => memo.set(k, v), removeItem: k => memo.delete(k) } };
      const client = createQuellenlauf({ host, fetcher: async (url, o) => {
        if (url === "/api/security/csrf") return { ok: true, json: async () => ({ token: "synthetic-csrf-for-unit-test" }) };
        if (o.method === "POST") { a = JSON.parse(o.body); await new Promise(r => finishPost = r);
          return { ok: true, json: async () => ({ ...a, zustand: "abgeschlossen", verarbeitet: 3 }) }; }
        return await new Promise((resolve, reject) => failStatus = reject);
      } });
      const post = client.start(); while (!finishPost) await Promise.resolve();
      const read = client.status(); while (!failStatus) await Promise.resolve();
      finishPost(); await post; failStatus(Error("spaeter Lesefehler")); await read;
      assert.equal(client.state().zustand, "abgeschlossen"); assert.equal(client.state().offen, false); client.dispose();
    });
    await check("unerwarteter Workerfehler erhaelt Erstfehler im bestehenden sicheren Fehlerkanal", async () => {
      now = Date.parse("2026-11-11T16:20:00Z"); leaseBis = 0; counts.clear();
      const old = pipeline.arbeite;
      pipeline.arbeite = async () => { throw Error("synthetischer-erster-workerfehler"); };
      try {
        const r = await send(auftrag()); assert.equal(r.status, 500);
        assert.ok(errors.some(e => e.message === "synthetischer-erster-workerfehler"));
        assert.ok(!JSON.stringify(r.body).includes("synthetischer-erster-workerfehler"));
      } finally { pipeline.arbeite = old; }
    });
    if (process.argv.includes("--browser")) {
      const { browserCheck } = require("./quellen-adminstart-browser-cases");
      await browserCheck({ base, check, request, reset() {
        now = Date.parse("2026-11-11T14:20:00Z"); leaseBis = 0; counts.clear();
      }, setHold(value) { hold = value; }, advance, plans: () => plans });
    }
    console.log(`PASS ${passed}/${passed} Admin-Quellenstart; kein externer Aufruf`);
  } finally { await new Promise(r => server.close(r)); for (const restore of restores.reverse()) restore(); }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
