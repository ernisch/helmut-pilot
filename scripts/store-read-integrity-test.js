"use strict";

// Echte Speicherschicht, synthetischer HTTP Transport. Die Tests pruefen
// Datenverlust bei unklaren Antworten und die Trennung von Cache und Schreibstand.
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://speichertest.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-storage-test";
process.env.HELMUT_SUPABASE_STORE_ID = "main";
process.env.HELMUT_STORE_CACHE_MS = "10000";
process.env.HELMUT_BLOB_RETRY_BASE_MS = "1";

const assert = require("node:assert/strict");
const storage = require("../lib/helmut/storage");
const originalFetch = globalThis.fetch;
const rows = new Map();
const responses = new Map();
const readHooks = new Map();
const writeHooks = new Map();
let calls = [];
let passed = 0;
let failed = 0;
const copy = (data) => JSON.parse(JSON.stringify(data));
const rowId = (key) => key === "main" ? "main" : `main-${key}`;

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  assert.equal(url.hostname, "speichertest.invalid");
  assert.equal(url.pathname, "/rest/v1/helmut_store");
  const method = options.method || "GET";
  if (method === "GET") {
    const id = url.searchParams.get("id").replace(/^eq\./, "");
    calls.push({ method, id });
    const body = responses.has(id) ? copy(responses.get(id))
      : rows.has(id) ? [{ data: copy(rows.get(id)) }] : [];
    if (readHooks.has(id)) await readHooks.get(id)();
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  }
  assert.ok(method === "POST" || method === "PATCH");
  const body = JSON.parse(options.body);
  const id = body.id || url.searchParams.get("id").replace(/^eq\./, "");
  const data = body.data;
  calls.push({ method, id });
  if (method === "POST" && rows.has(id)) {
    return { ok: false, status: 409, text: async () => JSON.stringify({ code: "23505" }) };
  }
  if (method === "PATCH") {
    const expected = url.searchParams.get("data->>_storeRevision");
    const revision = rows.get(id)?._storeRevision ?? null;
    if (!rows.has(id) || (expected === "is.null" ? revision !== null : expected !== `eq.${revision}`)) {
      return { ok: true, status: 200, text: async () => "[]" };
    }
  }
  if (writeHooks.has(id)) await writeHooks.get(id)(copy(data));
  rows.set(id, copy(data));
  const represented = String(options.headers?.Prefer || "").includes("return=representation");
  return { ok: true, status: 201, text: async () => represented ? JSON.stringify([{ id }]) : "" };
};

async function check(name, run) {
  calls = [];
  try { await run(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { failed += 1; console.error(`FAIL  ${name}: ${error.message}`); }
}

(async () => {
  try {
    for (const [index, payload] of [null, {}, { error: "unvollstaendig" }, [null],
      [{}], [{ data: null }], [{ data: [] }], [{ data: "ungueltig" }],
      [{ data: {} }, { data: {} }]].entries()) {
      const key = `p-invalid-${index}`;
      const id = rowId(key);
      const baseline = { userNotes: [{ id: "behalten", text: "unveraendert" }] };
      rows.set(id, copy(baseline));
      responses.set(id, payload);
      await check(`Ungueltige Leseantwort ${index + 1} ist Fehler und schreibt nichts`, async () => {
        await assert.rejects(storage.readStore(key));
        assert.deepEqual(rows.get(id), baseline);
        assert.equal(calls.filter((call) => call.method !== "GET").length, 0);
      });
    }

    for (const key of ["main", "p-missing"]) {
      await check(`Fehlende Zeile ${key} bleibt beim Lesen unangetastet`, async () => {
        const result = await storage.readStore(key);
        assert.deepEqual(result.userNotes, []);
        assert.equal(rows.has(rowId(key)), false);
        assert.deepEqual(calls.map((call) => call.method), ["GET"]);
      });
    }

    await check("Leerer Lesestand ueberschreibt keine parallel entstandene Zeile", async () => {
      const key = "p-insert-race";
      const id = rowId(key);
      const created = { userNotes: [{ id: "parallel", text: "erhalten" }] };
      readHooks.set(id, () => rows.set(id, copy(created)));
      await storage.readStore(key);
      assert.deepEqual(rows.get(id), created);
      assert.equal(calls.filter((call) => call.method !== "GET").length, 0);
    });

    await check("Unvollstaendige Main Antwort erzeugt keinen Ersatzbestand", async () => {
      // Eigene Modulinstanz umgeht ausschliesslich den Cache der vorigen Leerprobe.
      delete require.cache[require.resolve("../lib/helmut/storage")];
      const other = require("../lib/helmut/storage");
      const baseline = { profiles: { test: { id: "test" } }, crawlRuns: [{ id: "lauf" }] };
      rows.set("main", copy(baseline));
      responses.set("main", { message: "kein Datenbestand" });
      await assert.rejects(other.readStore());
      assert.deepEqual(rows.get("main"), baseline);
      assert.equal(calls.filter((call) => call.method !== "GET").length, 0);
      responses.delete("main");
    });

    await check("Leser koennen den gemeinsamen Cache auch verschachtelt nicht veraendern", async () => {
      const key = "p-cache-read";
      rows.set(rowId(key), { userNotes: [{ id: "notiz", nested: { text: "gespeichert" } }] });
      const first = await storage.readStore(key);
      first.userNotes[0].nested.text = "nur lokal";
      const second = await storage.readStore(key);
      assert.equal(second.userNotes[0].nested.text, "gespeichert");
      second.userNotes.push({ id: "andere lokale Aenderung" });
      assert.equal((await storage.readStore(key)).userNotes.length, 1);
      assert.equal(calls.length, 1, "der Cache spart weiterhin den Datenbankabruf");
    });

    await check("Sechs gleichzeitige Leser teilen einen Abruf und erhalten eigene Kopien", async () => {
      const key = "p-shared-read"; const id = rowId(key);
      rows.set(id, { userNotes: [{ id: "notiz", nested: { text: "gespeichert" } }] });
      let finish;
      const held = new Promise((resolve) => { finish = resolve; });
      readHooks.set(id, () => held);
      const reading = Promise.all(Array.from({ length: 6 }, () => storage.readStore(key)));
      await new Promise((resolve) => setImmediate(resolve));
      const simultaneous = calls.length;
      finish();
      const results = await reading;
      assert.equal(simultaneous, 1, "ein kalter Cache darf keine sechs Blob-Abfragen starten");
      results[0].userNotes[0].nested.text = "nur lokal";
      assert.equal(results[1].userNotes[0].nested.text, "gespeichert");
      assert.equal((await storage.readStore(key)).userNotes[0].nested.text, "gespeichert");
      // Auch geteilte Leser behalten ihre unveraenderlichen CAS-Lesemarken.
      await storage.writeStore(results[0], key);
      await assert.rejects(storage.writeStore(results[1], key), { code: "STORE_WRITE_CONFLICT" });
    });

    await check("Frisches Lesen teilt keinen schon laufenden alten Abruf", async () => {
      const key = "p-shared-fresh"; const id = rowId(key);
      rows.set(id, { userNotes: [{ id: "alt" }] });
      let finish;
      const held = new Promise((resolve) => { finish = resolve; });
      readHooks.set(id, () => held);
      const old = storage.readStore(key);
      await new Promise((resolve) => setImmediate(resolve));
      rows.set(id, { userNotes: [{ id: "neu" }] });
      readHooks.delete(id);
      const fresh = await storage.readStore(key, { fresh: true });
      finish();
      const previous = await old;
      assert.equal(previous.userNotes[0].id, "alt");
      assert.equal(fresh.userNotes[0].id, "neu");
      assert.equal(calls.length, 2);
    });

    await check("Geteilte Lesefehler bleiben Fehler und sperren keinen spaeteren Abruf", async () => {
      const key = "p-shared-error"; const id = rowId(key);
      responses.set(id, { message: "ungueltiger Bestand" });
      const results = await Promise.allSettled(Array.from({ length: 6 }, () => storage.readStore(key)));
      assert.equal(results.filter((result) => result.status === "rejected").length, 6);
      const failedReads = calls.length;
      responses.delete(id);
      rows.set(id, { userNotes: [{ id: "wieder lesbar" }] });
      assert.equal((await storage.readStore(key)).userNotes[0].id, "wieder lesbar");
      assert.equal(failedReads, 1);
      assert.equal(calls.length, 2);
    });

    await check("Verschiedene Speicher werden auch ohne Cache nie zusammengefasst", async () => {
      const oldTtl = process.env.HELMUT_STORE_CACHE_MS;
      process.env.HELMUT_STORE_CACHE_MS = "0";
      delete require.cache[require.resolve("../lib/helmut/storage")];
      const other = require("../lib/helmut/storage");
      process.env.HELMUT_STORE_CACHE_MS = oldTtl;
      const keys = ["main", "p-shared-b"];
      for (const key of keys) rows.set(rowId(key), { userNotes: [{ id: key }] });
      const results = await Promise.all(keys.flatMap((key) => [other.readStore(key), other.readStore(key)]));
      assert.deepEqual(results.map((store) => store.userNotes[0].id), [keys[0], keys[0], keys[1], keys[1]]);
      assert.equal(calls.length, 2);
      await other.readStore(keys[0]);
      assert.equal(calls.length, 3, "Cache=0 liest nach Abschluss wieder aus der Datenbank");
    });

    await check("Gleichzeitige Leser teilen auch einen transienten Wiederholungsversuch", async () => {
      const key = "p-shared-retry"; const id = rowId(key);
      rows.set(id, { userNotes: [{ id: "erhalten" }] });
      let attempts = 0;
      readHooks.set(id, () => {
        if (++attempts === 1) throw new Error("Supabase storage failed (503): synthetic retry");
      });
      const results = await Promise.all(Array.from({ length: 6 }, () => storage.readStore(key)));
      assert.ok(results.every((store) => store.userNotes[0].id === "erhalten"));
      assert.equal(attempts, 2);
    });

    await check("Ein Write trennt laufende Lesegenerationen; alter Abschluss entfernt keine neue", async () => {
      process.env.HELMUT_STORE_CACHE_MS = "0";
      delete require.cache[require.resolve("../lib/helmut/storage")];
      const other = require("../lib/helmut/storage");
      process.env.HELMUT_STORE_CACHE_MS = "10000";
      const key = "p-read-generation"; const id = rowId(key);
      rows.set(id, { userNotes: [{ id: "alt" }] });
      const writeBase = await other.readStore(key);
      let finishOld; let finishNew; let reads = 0;
      const oldHeld = new Promise((resolve) => { finishOld = resolve; });
      const newHeld = new Promise((resolve) => { finishNew = resolve; });
      readHooks.set(id, () => ++reads === 1 ? oldHeld : newHeld);
      const old = other.readStore(key);
      await new Promise((resolve) => setImmediate(resolve));
      await other.writeStore({ ...writeBase, userNotes: [{ id: "neu" }] }, key);
      const next = other.readStore(key);
      await new Promise((resolve) => setImmediate(resolve));
      finishOld();
      const stale = await old;
      const joined = other.readStore(key);
      await new Promise((resolve) => setImmediate(resolve));
      const readCount = reads;
      finishNew();
      const results = await Promise.all([next, joined]);
      assert.equal(stale.userNotes[0].id, "alt");
      assert.ok(results.every((store) => store.userNotes[0].id === "neu"));
      assert.equal(readCount, 2);
      await assert.rejects(other.writeStore(stale, key), { code: "STORE_WRITE_CONFLICT" });
    });

    await check("Gescheiterter Schreibvorgang wird nicht als gespeicherter Cache sichtbar", async () => {
      const key = "p-cache-failure";
      const id = rowId(key);
      rows.set(id, { userNotes: [{ id: "alt", text: "gespeichert" }] });
      const store = await storage.readStore(key);
      store.userNotes[0].text = "nicht gespeichert";
      writeHooks.set(id, async () => { throw new Error("Supabase storage failed (400): Testfehler"); });
      await assert.rejects(storage.writeStore(store, key), /Testfehler/);
      assert.equal((await storage.readStore(key)).userNotes[0].text, "gespeichert");
      assert.equal(calls.filter((call) => call.method === "GET" && call.id === id).length, 2,
        "nach unklarem Schreiben wird der tatsaechliche Stand neu gelesen");
    });

    await check("Auch erfolgreicher Schreibaufruf und Rueckgabe besitzen keinen Cache Verweis", async () => {
      const key = "p-cache-write";
      rows.set(rowId(key), { userNotes: [{ id: "notiz", nested: { text: "alt" } }] });
      const store = await storage.readStore(key);
      store.userNotes[0].nested.text = "gespeichert";
      const saved = await storage.writeStore(store, key);
      store.userNotes[0].nested.text = "spaetere Aenderung am Eingang";
      saved.userNotes[0].nested.text = "spaetere Aenderung an der Rueckgabe";
      assert.equal((await storage.readStore(key)).userNotes[0].nested.text, "gespeichert");
      assert.equal(rows.get(rowId(key)).userNotes[0].nested.text, "gespeichert");
    });

    await check("Verlorene Schreibantwort wird nicht mit einem veralteten Blob wiederholt", async () => {
      const key = "p-lost-response";
      const id = rowId(key);
      rows.set(id, { userNotes: [{ id: "notiz", text: "alt" }] });
      const store = await storage.readStore(key);
      store.userNotes[0].text = "erster Schreibvorgang";
      let attempts = 0;
      writeHooks.set(id, async (data) => {
        attempts += 1;
        if (attempts === 1) {
          // Der erste Write ist gespeichert, ein anderer Prozess schreibt danach.
          // Nur die erste Antwort geht verloren. Ein blinder Retry loescht den Zusatz.
          rows.set(id, { ...data, userNotes: [...data.userNotes, { id: "parallel", text: "behalten" }] });
          throw new Error("ECONNRESET Testantwort verloren");
        }
      });
      await assert.rejects(storage.writeStore(store, key), /ECONNRESET/);
      assert.equal(attempts, 1);
      assert.equal(rows.get(id).userNotes.at(-1).id, "parallel");
      assert.equal((await storage.readStore(key)).userNotes.at(-1).id, "parallel");
    });

    await check("Aenderungen am Eingang waehrend des Writes gelangen nicht in den bestaetigten Cache", async () => {
      const key = "p-write-input"; const id = rowId(key);
      rows.set(id, { userNotes: [] });
      const input = await storage.readStore(key);
      input.userNotes.push({ id: "gesendet" });
      writeHooks.set(id, () => input.userNotes.push({ id: "nicht-gesendet" }));
      await storage.writeStore(input, key);
      assert.deepEqual(rows.get(id).userNotes.map((n) => n.id), ["gesendet"]);
      assert.deepEqual((await storage.readStore(key)).userNotes.map((n) => n.id), ["gesendet"]);
    });

    await check("Ein ausdruecklicher Schreibauftrag kann einen fehlenden Mandatsspeicher anlegen", async () => {
      const key = "p-explicit-create";
      const store = await storage.readStore(key);
      store.userNotes.push({ id: "neu", text: "beauftragt" });
      await storage.writeStore(store, key);
      assert.equal(rows.get(rowId(key)).userNotes[0].id, "neu");
      assert.equal(calls.filter((call) => call.method === "POST").length, 1);
    });

    await check("Gleichzeitige Aenderungen derselben Instanz melden einen veralteten Lesestand", async () => {
      const key = "p-concurrent-cache";
      const id = rowId(key);
      rows.set(id, { userNotes: [] });
      const first = await storage.readStore(key);
      const second = await storage.readStore(key);
      first.userNotes.push({ id: "erste", text: "erhalten" });
      second.userNotes.push({ id: "zweite", text: "erneut anwenden" });
      const results = await Promise.allSettled([
        storage.writeStore(first, key), storage.writeStore(second, key)
      ]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(results.find((result) => result.status === "rejected")?.reason.code, "STORE_WRITE_CONFLICT");
      assert.deepEqual(rows.get(id).userNotes.map((note) => note.id), ["erste"]);
      const fresh = await storage.readStore(key);
      fresh.userNotes.push({ id: "zweite", text: "nach frischem Lesen" });
      await storage.writeStore(fresh, key);
      assert.deepEqual(rows.get(id).userNotes.map((note) => note.id).sort(), ["erste", "zweite"]);
    });

    await check("Spaeter fertig werdender alter Abruf ersetzt keinen neueren Cachestand", async () => {
      const key = "p-late-read";
      const id = rowId(key);
      rows.set(id, { userNotes: [{ id: "alt" }] });
      const writeBase = await storage.readStore(key);
      let finishRead;
      const held = new Promise((resolve) => { finishRead = resolve; });
      let readStarted;
      const started = new Promise((resolve) => { readStarted = resolve; });
      readHooks.set(id, async () => { readStarted(); await held; });
      const reading = storage.readStore(key, { fresh: true });
      await started;
      await storage.writeStore({ ...writeBase, userNotes: [{ id: "neu" }] }, key);
      finishRead();
      const stale = await reading;
      assert.equal(stale.userNotes[0].id, "alt");
      assert.equal((await storage.readStore(key)).userNotes[0].id, "neu");
      await assert.rejects(storage.writeStore(stale, key), { code: "STORE_WRITE_CONFLICT" });
      assert.equal(rows.get(id).userNotes[0].id, "neu");
    });
  } finally { globalThis.fetch = originalFetch; }
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
