"use strict";
const A = require("node:assert/strict");
const { isDeepStrictEqual } = require("node:util");
const J = require("../lib/helmut/quellen-planungsrest");
const tag = "2026-11-09";
const jobs = n => Array.from({ length: n }, (_, i) => ({ jobType: "source_fetch", idempotencyKey: `isolierter-weg-${i}`,
  payload: { quelle: { id: `synthetisch-${i}` } }, dueAt: `${tag}T04:00:00Z` }));
function fixture() {
  const rows = new Map(), f = { failPost: false, unknownPost: false, failPatch: false, unknownPatch: false,
    writes: 0, rows };
  f.request = async (path, options = {}) => {
    const u = new URL(path, "http://isoliert.invalid"), method = options.method || "GET";
    if (u.pathname === "/rest/v1/rpc/helmut_quellenplan_cursor_cas" && method === "POST") {
      f.writes++;
      A(path.length < 100, "Manifestvorwert darf nicht in der Adresse stehen");
      if (f.failPatch) throw Error("cursor-abgelehnt");
      const { p_id, p_expected, p_next_cursor } = JSON.parse(options.body);
      const old = rows.get(p_id);
      A.equal(typeof p_expected, "string");
      const match = old && isDeepStrictEqual(old.data, JSON.parse(p_expected));
      if (match) {
        A.equal(p_next_cursor, old.data.cursor + 1);
        rows.set(p_id, { id: p_id, data: { ...old.data, cursor: p_next_cursor,
          zustand: p_next_cursor === old.data.auftraege.length ? "fertig" : "offen" } });
      }
      if (f.unknownPatch) throw Error("cursor-antwort-verloren");
      return [{ id: p_id, uebernommen: Boolean(match) }];
    }
    if (method === "POST") {
      f.writes++;
      const row = JSON.parse(options.body);
      if (f.failPost || rows.has(row.id)) throw Error("post-abgelehnt");
      rows.set(row.id, structuredClone(row));
      if (f.unknownPost) throw Error("post-antwort-verloren");
      return [{ id: row.id }];
    }
    const id = (u.searchParams.getAll("id").find(x => x.startsWith("eq.")) || "").slice(3);
    if (method === "PATCH") throw Error("URL-CAS darf nicht verwendet werden");
    if (id) return rows.has(id) ? [structuredClone(rows.get(id))] : [];
    return [...rows.values()].filter(r => r.data.zustand === "offen")
      .sort((a, b) => a.id.localeCompare(b.id)).slice(0, Number(u.searchParams.get("limit"))).map(r => structuredClone(r));
  };
  f.journal = J.erzeugePlanungsrest({ request: f.request, storeId: "isolierter-store" });
  return f;
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Vollstaendiges Manifest mit mehr als25Wegen wird vor Enqueue bestaetigt und nach Neustart fortgesetzt", async () => {
    const f = fixture(), plan = jobs(36), delivered = new Set();
    let state = await f.journal.sichereManifest(tag, { auftraege: plan, tagesplan: { scopeMax: { global: 4 } } });
    A.deepEqual(state.auftraege, plan); A.equal(state.cursor, 0);
    for (let i = 0; i < 13; i++) {
      delivered.add(state.auftraege[state.cursor].idempotencyKey);
      state = await f.journal.bewegeCursor(tag, state, state.cursor + 1);
    }
    const restarted = J.erzeugePlanungsrest({ request: f.request, storeId: "isolierter-store" });
    state = await restarted.lesen(tag); A.equal(state.cursor, 13);
    while (state.cursor < state.auftraege.length) {
      delivered.add(state.auftraege[state.cursor].idempotencyKey);
      state = await restarted.bewegeCursor(tag, state, state.cursor + 1);
    }
    A.equal(delivered.size, 36); A.equal(state.zustand, "fertig");
  });
  await test("Erster Tagesplan bleibt unveraenderlich auch bei neuer Planung und JSONB-Schluesselordnung", async () => {
    const f = fixture(), first = await f.journal.sichereManifest(tag, { auftraege: jobs(2), tagesplan: { b: 1, a: 2 } });
    const row = [...f.rows.values()][0];
    row.data = Object.fromEntries(Object.entries(row.data).reverse());
    row.data.tagesplan = { a: 2, b: 1 };
    const again = await f.journal.sichereManifest(tag, { auftraege: jobs(4), tagesplan: { neu: true } });
    A.equal(again.manifestHash, first.manifestHash); A.equal(again.auftraege.length, 2); A.equal(f.writes, 1);
  });
  await test("Unbekannter Manifestwrite wird nur mit Ruecklesebeleg angenommen, fehlender Write stoppt", async () => {
    const f = fixture(); f.unknownPost = true;
    A.equal((await f.journal.sichereManifest(tag, { auftraege: jobs(2) })).cursor, 0);
    const absent = fixture(); absent.failPost = true;
    await A.rejects(absent.journal.sichereManifest(tag, { auftraege: jobs(2) }), /manifest-unbestaetigt/);
    A.equal(await absent.journal.lesen(tag), null);
  });
  await test("Enqueue vor Crash darf idempotent wiederkehren, Cursor wird nie vorbestaetigt", async () => {
    const f = fixture(), delivered = new Set();
    const old = await f.journal.sichereManifest(tag, { auftraege: jobs(3) });
    delivered.add(old.auftraege[0].idempotencyKey);
    f.failPatch = true;
    await A.rejects(f.journal.bewegeCursor(tag, old, 1), /fortschritt-unbestaetigt/);
    A.equal((await f.journal.lesen(tag)).cursor, 0);
    f.failPatch = false; f.unknownPatch = true;
    delivered.add(old.auftraege[0].idempotencyKey);
    const state = await f.journal.bewegeCursor(tag, old, 1);
    A.equal(state.cursor, 1); A.equal(delivered.size, 1);
    A.equal((await f.journal.bewegeCursor(tag, old, 1)).cursor, 1, "Doppelte Zustellung verliert keinen Cursor");
  });
  await test("CAS verweigert Cursorspruenge, fremde Tage, manipulierte Auftraege und Daten", async () => {
    const f = fixture(), old = await f.journal.sichereManifest(tag, { auftraege: jobs(3) });
    await A.rejects(f.journal.bewegeCursor(tag, old, 2), /cursor-sprung/);
    await A.rejects(f.journal.bewegeCursor("2026-11-10", old, 1), /stand-ungueltig/);
    const row = [...f.rows.values()][0]; row.data.auftraege[0].payload.quelle.id = "veraendert";
    await A.rejects(f.journal.lesen(tag), /stand-ungueltig/);
  });
  await test("Tageswechsel findet alte offene Plaene; weitere Seiten werden sichtbar gemeldet", async () => {
    const f = fixture();
    for (let d = 1; d <= 9; d++) await f.journal.sichereManifest(`2026-11-0${d}`, { auftraege: jobs(1) });
    const pending = await f.journal.offene({ bisTag: tag, limit: 7 });
    A.equal(pending.plaene.length, 7); A.equal(pending.weitereVorhanden, true);
    A.equal(pending.plaene[0].tag, "2026-11-01");
    const first = pending.plaene[0]; await f.journal.bewegeCursor(first.tag, first, 1);
    A.equal((await f.journal.offene({ bisTag: tag })).plaene[0].tag, "2026-11-02");
  });
  await test("Grosser zulaessiger Vorwert bleibt vollstaendig im RPC-Body; Konkurrenz und Neustart bleiben monoton", async () => {
    const f = fixture(), plan = jobs(3); plan[0].payload.text = "Belegter synthetischer Plan. ".repeat(6000);
    const old = await f.journal.sichereManifest(tag, { auftraege: plan });
    A(Buffer.byteLength(JSON.stringify(old)) > 128 * 1024);
    const [a, b] = await Promise.all([f.journal.bewegeCursor(tag, old, 1), f.journal.bewegeCursor(tag, old, 1)]);
    A.equal(a.cursor, 1); A.equal(b.cursor, 1);
    const restarted = J.erzeugePlanungsrest({ request: f.request, storeId: "isolierter-store" });
    const read = await restarted.lesen(tag);
    A.deepEqual(read.auftraege, plan);
    A.equal((await restarted.bewegeCursor(tag, read, 2)).cursor, 2);
    const foreign = structuredClone(read); foreign.tagesplan = { neu: true };
    // Selbst ein intern valider fremder Plan muss am gespeicherten exakten Vorwert scheitern.
    const crypto = require("node:crypto");
    const sorted = v => Array.isArray(v) ? v.map(sorted) : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;
    foreign.manifestHash = crypto.createHash("sha256").update(JSON.stringify(sorted([tag, foreign.auftraege, foreign.tagesplan]))).digest("hex");
    await A.rejects(restarted.bewegeCursor(tag, foreign, 2), /fortschritt-unbestaetigt/);
    A.equal((await restarted.lesen(tag)).cursor, 2);
  });
  await test("Zu grosse oder widerspruechliche Manifeste werden niemals gekuerzt gespeichert", async () => {
    const f = fixture(), oversized = jobs(2); oversized[0].payload.text = "x".repeat(J.MAX_BYTES);
    await A.rejects(f.journal.sichereManifest(tag, { auftraege: oversized }), /stand-ungueltig|manifest-zu-gross/);
    await A.rejects(f.journal.sichereManifest(tag, { auftraege: [...jobs(1), ...jobs(1)] }), /stand-ungueltig/);
    A.equal(f.writes, 0); A.equal(f.rows.size, 0);
  });
  console.log(`${count}/${count} Planungsrestgruppen bestanden; keine Netz-/DB-/Modellaufrufe.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
