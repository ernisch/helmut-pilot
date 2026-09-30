"use strict";

// Offline-Test des eng begrenzten Operatorpfads. Keine DB, kein Netz, keine
// Environment-Aenderung und keine Production-Aktion.
const assert = require("assert/strict");
const operator = require("../lib/helmut/bb-nachweis-operator");

let pass = 0;
let fail = 0;
async function check(name, fn) {
  try { await fn(); pass += 1; console.log(`  PASS  ${name}`); }
  catch (error) { fail += 1; console.log(`  FAIL  ${name} — ${error.message}`); }
}

const envAn = { [operator.OPERATOR_FLAG]: "1" };
const body = (action, extra = {}) => ({ action, confirmation: operator.CONFIRMATION, ...extra });
function specs() {
  return operator.TARGET_IDS.map((id) => ({ id, aktiv: false, importfreigegeben: false }));
}
function fakeDeps(calls, extra = {}) {
  return {
    env: envAn,
    bereiteSpecsVor: specs,
    vorflug: () => { calls.push("vorflug"); return { sicher: true }; },
    provisioning: {
      provisionBatch: async (items, _deps, options) => {
        calls.push(`batch:${items.map((x) => x.id).join(",")}:${options.ausfuehren}`);
        return { ok: true, trockenlauf: !options.ausfuehren, bilanz: { geplant: items.length } };
      },
      activateTenant: async (id) => { calls.push(`aktiv:${id}`); return { ok: true, tenantId: id }; },
      deactivateTenant: async (id) => { calls.push(`deaktiv:${id}`); return { ok: true, tenantId: id }; },
      teardownTenant: async (id) => { calls.push(`rueckbau:${id}`); return { ok: true, tenantId: id }; }
    },
    storage: {
      getProfile: async (id) => ({ id, profileActive: true })
    },
    ...extra
  };
}

function callHandler(handler, pathname, { method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const request = {
      url: pathname,
      method,
      headers: { host: "localhost", ...headers },
      socket: { remoteAddress: "127.0.0.1" },
      on(event, callback) {
        if (event === "data" && body !== null) setImmediate(() => callback(Buffer.from(body)));
        if (event === "end") setImmediate(() => callback());
        return request;
      },
      once(event, callback) { return request.on(event, callback); },
      destroy() {}
    };
    let settled = false;
    const response = {
      statusCode: 0, headersSent: false, body: "",
      writeHead(status) { this.statusCode = status; this.headersSent = true; return this; },
      setHeader() { return this; }, getHeader() { return undefined; }, removeHeader() {},
      write(chunk) { this.body += String(chunk || ""); return true; },
      end(chunk) {
        if (chunk) this.body += String(chunk);
        if (!settled) { settled = true; resolve({ status: this.statusCode, body: this.body }); }
      }
    };
    try { handler(request, response); } catch (error) { reject(error); }
    setTimeout(() => { if (!settled) reject(new Error("keine Serverantwort")); }, 5000).unref?.();
  });
}

async function main() {
  console.log("Helmut — Offline-Test BB-Nachweis-Operator\n");
  await check("1. Quelle liefert exakt die zwei erlaubten, inaktiven Nicht-AfD-Specs", () => {
    const result = operator.bereiteSpecsVor();
    assert.deepEqual(result.map((x) => x.id).sort(), [...operator.TARGET_IDS].sort());
    assert.ok(result.every((x) => x.aktiv === false && x.importfreigegeben === false));
  });
  await check("2. ohne temporäre Flag findet keine Aktion statt", async () => {
    const calls = [];
    const result = await operator.ausfuehren(body("provisionieren"), fakeDeps(calls, { env: {} }));
    assert.equal(result.ok, false); assert.equal(result.reason, "operator-flag-aus"); assert.deepEqual(calls, []);
  });
  await check("3. ohne exakte Bestaetigung findet keine Aktion statt", async () => {
    const calls = [];
    const result = await operator.ausfuehren({ action: "provisionieren" }, fakeDeps(calls));
    assert.equal(result.ok, false); assert.equal(result.reason, "bestaetigung-fehlt"); assert.deepEqual(calls, []);
  });
  await check("4. unbekannte Aktion wird abgelehnt", async () => {
    const calls = [];
    const result = await operator.ausfuehren(body("alles"), fakeDeps(calls));
    assert.equal(result.ok, false); assert.equal(result.reason, "aktion-nicht-erlaubt"); assert.deepEqual(calls, []);
  });
  await check("5. Vorschau schreibt nicht und laesst den Schreibvorflug aus", async () => {
    const calls = [];
    const result = await operator.ausfuehren(body("vorschau"), fakeDeps(calls));
    assert.equal(result.ok, true); assert.deepEqual(calls, [`batch:${operator.TARGET_IDS.join(",")}:false`]);
  });
  await check("6. Provisionierung nutzt nur beide festen IDs, vorher den Vorflug und bleibt inaktiv", async () => {
    const calls = [];
    const result = await operator.ausfuehren(body("provisionieren"), fakeDeps(calls));
    assert.equal(result.ok, true);
    assert.deepEqual(calls, ["vorflug", `batch:${operator.TARGET_IDS.join(",")}:true`]);
  });
  await check("7. Aktivierung kann keine fremde ID aus dem Request uebernehmen", async () => {
    const calls = [];
    const result = await operator.ausfuehren(body("aktivieren", { politicianId: "fremd" }), fakeDeps(calls));
    assert.equal(result.ok, true);
    assert.deepEqual(calls, ["vorflug", ...operator.TARGET_IDS.map((id) => `aktiv:${id}`)]);
  });
  await check("8. Rueckbau deaktiviert und entfernt nur beide festen IDs", async () => {
    const calls = [];
    const result = await operator.ausfuehren(body("rueckbau"), fakeDeps(calls));
    assert.equal(result.ok, true);
    assert.deepEqual(calls, ["vorflug", ...operator.TARGET_IDS.map((id) => `deaktiv:${id}`), ...operator.TARGET_IDS.map((id) => `rueckbau:${id}`)]);
  });
  await check("9. Gemeinsamer Nachweis-Lauf startet ausschliesslich beide festen Profile mit noPaidModel", async () => {
    const calls = [];
    const result = await operator.ausfuehren(body("nachweis-lauf"), fakeDeps(calls, {
      runSourceCrawl: async (id, options) => {
        calls.push(`crawl:${id}:${options.noPaidModel}`);
        return { runId: `run-${id}`, noPaidModel: true, paidModelCalls: 0, skippedPaidModelPhases: ["lazy-understanding", "eager-understanding"], checkedSources: 1, successfulSources: 1, failedSources: 0, savedItems: 1 };
      }
    }));
    assert.equal(result.ok, true);
    assert.deepEqual(calls, ["vorflug", ...operator.TARGET_IDS.map((id) => `crawl:${id}:true`)]);
    assert.ok(result.detail.every((entry) => entry.noPaidModel && entry.paidModelCalls === 0));
  });
  await check("10. Gemeinsamer Nachweis-Lauf bleibt ohne beide aktiven Zielprofile gesperrt", async () => {
    const calls = [];
    const result = await operator.ausfuehren(body("nachweis-lauf"), fakeDeps(calls, {
      storage: { getProfile: async (id) => ({ id, profileActive: id === operator.TARGET_IDS[0] }) },
      runSourceCrawl: async () => { calls.push("crawl"); return {}; }
    }));
    assert.equal(result.ok, false); assert.equal(result.reason, "zielprofil-nicht-aktiv");
    assert.deepEqual(calls, ["vorflug"]);
  });
  await check("11. Gemeinsamer Nachweis-Lauf gibt dieselbe absolute Deadline an jeden Crawl weiter", async () => {
    const deadlines = [];
    const result = await operator.ausfuehren(body("nachweis-lauf"), fakeDeps([], {
      now: () => 1_000_000,
      runSourceCrawl: async (id, options) => {
        deadlines.push(options.deadlineMs);
        return { runId: `run-${id}`, noPaidModel: true, paidModelCalls: 0, skippedPaidModelPhases: [], checkedSources: 1, successfulSources: 1, failedSources: 0, savedItems: 1 };
      }
    }));
    assert.equal(result.ok, true);
    // 240000 Gesamtbudget - 30000 Response-Reserve = +210000 ms, EINE gemeinsame Deadline.
    assert.deepEqual(deadlines, [1_000_000 + 210_000, 1_000_000 + 210_000]);
  });
  await check("12. Zweiter Nachweis-Crawl startet nicht ohne ausreichende Restzeit (fail-closed, kein Hintergrundlauf)", async () => {
    const calls = [];
    let jetzt = 0;
    const result = await operator.ausfuehren(body("nachweis-lauf"), fakeDeps(calls, {
      now: () => jetzt,
      nachweisBudgetMs: 1000,
      nachweisReserveMs: 100,
      nachweisMindestCrawlReserveMs: 300,
      runSourceCrawl: async (id, options) => {
        calls.push(`crawl:${id}:${options.noPaidModel}:${options.deadlineMs}`);
        jetzt += 700; // erster Crawl verbraucht fast das gesamte Fenster
        return { runId: `run-${id}`, noPaidModel: true, paidModelCalls: 0, skippedPaidModelPhases: [], checkedSources: 1, successfulSources: 1, failedSources: 0, savedItems: 1 };
      }
    }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "nachweis-zeitbudget-erschoepft");
    // crawlDeadline = 1000 - 100 = 900ms; nur der erste Crawl startet, mit dieser Deadline.
    assert.deepEqual(calls, ["vorflug", `crawl:${operator.TARGET_IDS[0]}:true:900`]);
    assert.deepEqual(result.detail.laeufe.map((x) => x.tenantId), [operator.TARGET_IDS[0]]);
    assert.deepEqual(result.detail.uebersprungen.map((x) => x.tenantId), [operator.TARGET_IDS[1]]);
  });
  await check("13. HTTP-Pfad bleibt ohne Bearer-Secret unsichtbar und ohne Bestaetigung schreibfrei", async () => {
    const old = {
      auth: process.env.HELMUT_AUTH_MODE,
      secret: process.env.HELMUT_ADMIN_SECRET,
      flag: process.env[operator.OPERATOR_FLAG]
    };
    try {
      process.env.HELMUT_AUTH_MODE = "accounts";
      process.env.HELMUT_ADMIN_SECRET = "offline-bb-operator-sentinel";
      process.env[operator.OPERATOR_FLAG] = "1";
      const handler = require("../server.js");
      const hidden = await callHandler(handler, "/api/ops/berlin-brandenburg-nachweis", { method: "POST", body: "{}" });
      assert.equal(hidden.status, 404);
      const wrongMethod = await callHandler(handler, "/api/ops/berlin-brandenburg-nachweis", {
        headers: { authorization: "Bearer offline-bb-operator-sentinel" }
      });
      assert.equal(wrongMethod.status, 405);
      const payload = JSON.stringify({ action: "provisionieren" });
      const missingConfirm = await callHandler(handler, "/api/ops/berlin-brandenburg-nachweis", {
        method: "POST",
        headers: { authorization: "Bearer offline-bb-operator-sentinel", "content-length": String(Buffer.byteLength(payload)) },
        body: payload
      });
      assert.equal(missingConfirm.status, 200);
      assert.deepEqual(JSON.parse(missingConfirm.body), {
        ok: false, action: "provisionieren", kohorte: "berlin-brandenburg-nachweis-2",
        targetIds: operator.TARGET_IDS, reason: "bestaetigung-fehlt"
      });
    } finally {
      if (old.auth === undefined) delete process.env.HELMUT_AUTH_MODE; else process.env.HELMUT_AUTH_MODE = old.auth;
      if (old.secret === undefined) delete process.env.HELMUT_ADMIN_SECRET; else process.env.HELMUT_ADMIN_SECRET = old.secret;
      if (old.flag === undefined) delete process.env[operator.OPERATOR_FLAG]; else process.env[operator.OPERATOR_FLAG] = old.flag;
    }
  });
  console.log(`\nErgebnis: ${pass} PASS, ${fail} FAIL`);
  if (fail) process.exitCode = 1;
}

main();
