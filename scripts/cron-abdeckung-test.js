"use strict";

// Echte HTTP-Abschlussblöcke + echte Dispatchfunktion aus server.js. Nur die
// externen Arbeitsschritte sind Stubs; Persistenz nutzt echte Sanitizer/Projektionen.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const audit = require("../lib/helmut/quellenarchitektur/cron-abdeckung");
const storage = require("../lib/helmut/storage");
const { relationalRowToProcessRun } = require("../lib/helmut/blob-relational");
const NOW = Date.parse("2026-11-06T12:00:00Z");
const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const dispatchStart = serverSource.indexOf("function cronSchwererPfad(");
const dispatchEnd = serverSource.indexOf("// OP-30 — SCHWERER CRON", dispatchStart);
const dispatchCode = serverSource.slice(dispatchStart, dispatchEnd);
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }

function fixture() {
  const calls = [], rows = new Map(), auth = { processRuns: [] };
  const store = {
    listSourceArchitectureRows: async () => { calls.push("catalog"); return { publishers: [], retrievalPaths: [], packages: [], packagePaths: [] }; },
    listFullProfiles: async () => { calls.push("profiles"); return []; },
    listSourceCrawlTelemetry: async (opts) => { calls.push("telemetry"); assert.deepEqual(opts, { days: 14, limit: 1000 }); return []; },
    listRawDocuments: async (opts) => { calls.push("documents"); assert.deepEqual(opts, { days: 30, limit: 800 }); return []; },
    recordProcessRun: async (entry) => {
      calls.push("save");
      return storage.recordProcessRun(entry, {
        relationalAktiv: true,
        insertRelational: async (row) => { rows.set(`${row.run_id}|${row.process}`, row); },
        mutateAuth: async (change) => { await change(auth); }
      });
    }
  };
  return { store, calls, rows, auth, deps: { storage: store, now: () => NOW } };
}

function routeBlock(cronName) {
  const start = serverSource.indexOf(`if (url.pathname === "/api/cron/${cronName}")`);
  const body = serverSource.indexOf("const result = await", start);
  const end = serverSource.indexOf(`console.log(\`[cron/${cronName}]`, body);
  assert(start > 0 && body > start && end > body, "realer Cron-Abschluss gefunden");
  return serverSource.slice(body, end);
}

async function runRoute(cronName, selected, f, fails = false) {
  const work = async (name) => {
    f.calls.push(`dispatch:${name}`);
    if (fails) throw new Error("synthetic-source-failure");
    return { ok: true, path: name };
  };
  const sandbox = {
    console, Date, t0: NOW, laufId: `fixture-${cronName}-${selected}`,
    require: (id) => {
      assert.equal(id, "./lib/helmut/quellenarchitektur/cron-abdeckung");
      return { runQuellenCronMitAbdeckung: (execute, opts) => audit.runQuellenCronMitAbdeckung(execute, opts, f.deps) };
    },
    scalablePipeline: { skalierbarerPfadAktiv: () => selected === "warteschlange" },
    cronGlobalphase: { waehleCronPfad: () => ({ pfad: selected, widerspruch: false }) },
    runCronUeberWarteschlange: () => work("warteschlange"),
    runCronForTenants: async (_, fn) => fn("synthetic-mandat"),
    runSourceCrawl: () => work("alt"),
    runCronMitGlobalerPhase: (_, opts) => work(opts.buendelung === "kontext" ? "kontext" : "globalphase"),
    withTimeout: (promise) => promise,
    markiereAeusseresCronTimeout: async () => ({ ok: true })
  };
  vm.createContext(sandbox);
  return vm.runInContext(`${dispatchCode}\n(async () => { ${routeBlock(cronName)} return result; })()`, sandbox);
}

(async () => {
  for (const cronName of ["crawl", "pipeline"]) for (const selected of ["warteschlange", "alt", "globalphase", "kontext"]) {
    await test(`${cronName}/${selected}: echter Dispatch, genau eine Prüfung, Prozessbeleg bleibt erhalten`, async () => {
      const f = fixture(); const result = await runRoute(cronName, selected, f);
      assert.equal(result.path, selected);
      assert.equal(f.calls.filter((c) => c.startsWith("dispatch:")).length, 1);
      for (const call of ["catalog", "profiles", "telemetry", "documents", "save"]) assert.equal(f.calls.filter((c) => c === call).length, 1);
      assert.equal(result.quellenAbdeckung.status, "ohne_aktiven_bedarf");
      assert.equal(result.quellenAbdeckung.persistenz.gespeichert, true);
      const row = [...f.rows.values()][0];
      assert.equal(row.process, "quellen-abdeckung");
      assert.equal(row.run_id, `fixture-${cronName}-${selected}`);
      assert.equal(row.reason, "ohne_aktiven_bedarf");
      const readBack = audit.abdeckungAusProzesslauf(relationalRowToProcessRun(row));
      assert.equal(readBack.erhobenAm, new Date(NOW).toISOString());
      assert.equal(readBack.status, result.quellenAbdeckung.status);
      assert.deepEqual(readBack.summary, result.quellenAbdeckung.summary);
      assert.deepEqual(readBack.findingCodes, result.quellenAbdeckung.findingCodes);
      assert.equal(f.auth.processRuns.length, 1);
    });
  }
  await test("Gleiche Laufkennung bleibt beim erneuten Abschluss idempotent", async () => {
    const f = fixture(); await runRoute("crawl", "warteschlange", f); await runRoute("crawl", "warteschlange", f);
    assert.equal(f.rows.size, 1); assert.equal(f.auth.processRuns.length, 1);
  });
  await test("Fehlgeschlagener Dispatch wird weiterhin geprüft und nicht zum erfolgreichen Quellenlauf umgedeutet", async () => {
    const f = fixture(); const r = await runRoute("crawl", "alt", f, true);
    assert.equal(r.ok, false); assert.equal(r.reason, "crawl-timeout");
    assert.equal(r.quellenAbdeckung.status, "unbekannt");
    assert(r.quellenAbdeckung.findingCodes.includes("quellenlauf_unvollstaendig"));
    assert.equal(f.calls.filter((c) => c === "save").length, 1);
  });
  const opts = { runId: "fixture-budget", cronName: "crawl", deadlineAt: NOW + 10000 };
  await test("Unlesbare Profile erzeugen unbekannt statt keinen Bedarf", async () => {
    const f = fixture(); f.store.listFullProfiles = async () => { throw new Error("synthetic-read-failure"); };
    const r = await audit.runQuellenCronMitAbdeckung(async () => ({ ok: true }), opts, f.deps);
    assert.equal(r.quellenAbdeckung.status, "unbekannt");
    assert(r.quellenAbdeckung.findingCodes.includes("pruefung_lesefehler"));
    assert.equal([...f.rows.values()][0].status, "blocked");
  });
  await test("Fehlender relationaler Katalog wird niemals aus Seeds als Ist ersetzt", async () => {
    const f = fixture(); f.store.listSourceArchitectureRows = async () => null;
    const r = await audit.runQuellenCronMitAbdeckung(async () => ({ ok: true }), opts, f.deps);
    assert.equal(r.quellenAbdeckung.status, "unbekannt"); assert.equal(r.quellenAbdeckung.summary, null);
  });
  await test("Erschöpftes Lesebudget startet keine Datenlesung, nutzt nur verbleibende Quittungsreserve", async () => {
    const f = fixture();
    const r = await audit.runQuellenCronMitAbdeckung(async () => ({ ok: true }), { ...opts, deadlineAt: NOW + 300 }, f.deps);
    assert.deepEqual(f.calls, ["save"]);
    assert.equal(r.quellenAbdeckung.status, "unbekannt");
    assert(r.quellenAbdeckung.findingCodes.includes("pruefung_zeitbudget"));
  });
  await test("Komplett abgelaufener Slot behauptet keinen gespeicherten Prüflauf", async () => {
    const f = fixture();
    const r = await audit.runQuellenCronMitAbdeckung(async () => ({ ok: true }), { ...opts, deadlineAt: NOW }, f.deps);
    assert.deepEqual(f.calls, []);
    assert.equal(r.quellenAbdeckung.status, "unbekannt");
    assert.equal(r.quellenAbdeckung.persistenz.gespeichert, null);
  });
  await test("Zeitüberschreitung einer Leseanfrage bleibt bounded und startet keinen späten Prüfschreibzweig", async () => {
    const f = fixture(); f.store.listFullProfiles = () => new Promise(() => {});
    const r = await audit.runQuellenCronMitAbdeckung(async () => ({ ok: true }), { ...opts, maxReadMs: 100 }, f.deps);
    assert.equal(r.quellenAbdeckung.status, "unbekannt");
    assert(r.quellenAbdeckung.findingCodes.includes("pruefung_zeitbudget"));
    assert.equal(f.calls.filter((c) => c === "save").length, 1);
  });
  await test("Speicherfehler bleibt ausdrücklich sichtbar", async () => {
    const f = fixture(); f.store.recordProcessRun = async () => ({ ok: false, vollstaendig: false });
    const r = await audit.runQuellenCronMitAbdeckung(async () => ({ ok: true }), opts, f.deps);
    assert.equal(r.quellenAbdeckung.persistenz.gespeichert, false);
    assert.equal(r.quellenAbdeckung.persistenz.grund, "pruefung_speicherfehler");
  });
  await test("Prozessfilter wird vor dem relationalen Leselimit angewendet", async () => {
    let query;
    const rows = await storage.listProcessRuns({ process: "quellen-abdeckung", limit: 1 }, {
      relationalAktiv: true, readAuth: async () => ({ processRuns: [] }),
      listRelational: async (opts) => { query = opts; return []; }
    });
    assert.equal(query.process, "quellen-abdeckung"); assert.deepEqual(rows, []);
    const storageCode = fs.readFileSync(path.join(__dirname, "../lib/helmut/storage.js"), "utf8");
    assert(storageCode.includes("&process=eq.${encodeURIComponent(proc)}"));
  });
  await test("Admin liest den echten Prozessbeleg, Globalphase erzeugt keine zweite Prüfung", async () => {
    assert(serverSource.includes('listProcessRuns({ process: "quellen-abdeckung", limit: 1 })'));
    const scheduler = fs.readFileSync(path.join(__dirname, "../lib/helmut/scheduler.js"), "utf8");
    assert(!scheduler.includes("quellenAbdeckung"));
    assert.equal(audit.abdeckungAusProzesslauf({ process: "anderer-prozess" }), null);
  });
  console.log(`\n${passed}/${passed} Quellencron-Abdeckungsprüfungen bestanden.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
