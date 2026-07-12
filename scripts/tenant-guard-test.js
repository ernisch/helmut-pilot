"use strict";

// Tenant-Guard-Tests (P0-1, audit/fix-plan.md).
// Prüft die verpflichtende Mandantentrennung in den V3-Storage-Reads/-Writes:
//  1) fehlender userId  -> harte Ablehnung (kein stiller "alle Mandanten"-Fallback)
//  2) Cross-Tenant      -> userId=A liefert NUR A's Zeilen, nie B's
//  3) erlaubter Zugriff -> userId=A innerhalb desselben Tenants liefert A's Zeilen
//  4) Schreib-Guard     -> datentragende Zeile ohne user_id wird abgelehnt
//
// Deterministisch/offline: die Reads erhalten via optionalem deps-Parameter ein
// gefälschtes `request` (simuliert PostgREST-serverseitiges user_id=eq.-Filtern)
// und `ready: () => true`. Kein Netzwerk, keine echte DB.

const storage = require("../lib/helmut/storage");

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}
async function throwsTenant(name, fn) {
  try { await fn(); check(name + " -> wirft", false); }
  catch (e) {
    check(name + " -> wirft TenantContextError", e instanceof storage.TenantContextError || e.code === "TENANT_CONTEXT_REQUIRED");
  }
}
async function noThrow(name, fn) {
  try { const r = await fn(); check(name + " -> kein Fehler", true); return r; }
  catch (e) { check(name + " -> kein Fehler (war: " + e.message + ")", false); return undefined; }
}

// Gemischter Mehr-Mandanten-Datensatz (A + B) + eine fälschende request-Funktion,
// die den user_id=eq.-Filter aus dem Endpoint parst und serverseitig anwendet.
const MIXED = [
  { _table: "decisions", id: "dec-a-1", user_id: "mdb-a", score: 90 },
  { _table: "decisions", id: "dec-a-2", user_id: "mdb-a", score: 40 },
  { _table: "decisions", id: "dec-b-1", user_id: "mdb-b", score: 88 },
  { _table: "matching_results", id: "mr-a-1", user_id: "mdb-a" },
  { _table: "matching_results", id: "mr-b-1", user_id: "mdb-b" },
  { _table: "office_outputs", id: "office-mdb-a-vg1-rede", user_id: "mdb-a" },
  { _table: "office_outputs", id: "office-mdb-b-vg1-rede", user_id: "mdb-b" }
];
let lastEndpoint = null;
// Simuliert PostgREST: filtert serverseitig nach Tabelle (aus dem Pfad) UND nach
// dem user_id=eq.-Filter. Fehlt der Filter, kämen ALLE Mandanten zurück -> genau
// das darf der Guard nie zulassen.
function fakeRequest(endpoint) {
  lastEndpoint = endpoint;
  const tableMatch = /\/rest\/v1\/([a-z_]+)/.exec(endpoint);
  const table = tableMatch ? tableMatch[1] : null;
  const uidMatch = /user_id=eq\.([^&]+)/.exec(endpoint);
  return MIXED.filter((r) => (!table || r._table === table) && (!uidMatch || r.user_id === decodeURIComponent(uidMatch[1])));
}
const liveDeps = { ready: () => true, request: fakeRequest };

(async () => {
  console.log("== 1) assertTenant / assertTenantRows (Einheit) ==");
  for (const bad of [null, undefined, "", "   "]) {
    check(`assertTenant(${JSON.stringify(bad)}) wirft`, (() => {
      try { storage.assertTenant(bad, "t"); return false; } catch (e) { return e.code === "TENANT_CONTEXT_REQUIRED"; }
    })());
  }
  check("assertTenant('mdb-a') gibt String zurück", storage.assertTenant("mdb-a", "t") === "mdb-a");
  check("assertTenantRows([]) ok (leer)", (() => { try { storage.assertTenantRows([], "w"); return true; } catch { return false; } })());
  check("assertTenantRows([{id,user_id}]) ok", (() => { try { storage.assertTenantRows([{ id: "x", user_id: "mdb-a" }], "w"); return true; } catch { return false; } })());
  check("assertTenantRows([{id ohne user_id}]) wirft", (() => { try { storage.assertTenantRows([{ id: "x" }], "w"); return false; } catch (e) { return e.code === "TENANT_CONTEXT_REQUIRED"; } })());

  console.log("== 2) Reads OHNE userId -> harte Ablehnung ==");
  await throwsTenant("listDecisions({})", () => storage.listDecisions({}, liveDeps));
  await throwsTenant("listDecisions({userId:null})", () => storage.listDecisions({ userId: null }, liveDeps));
  await throwsTenant("listMatchingResults({})", () => storage.listMatchingResults({}, liveDeps));
  await throwsTenant("listOfficeOutputsByUser()", () => storage.listOfficeOutputsByUser(undefined, null, liveDeps));

  console.log("== 3) Cross-Tenant-Isolation: userId=A liefert NUR A ==");
  const decA = await noThrow("listDecisions(A)", () => storage.listDecisions({ userId: "mdb-a" }, liveDeps));
  check("listDecisions(A): nur mdb-a Zeilen", Array.isArray(decA) && decA.length === 2 && decA.every((r) => r.user_id === "mdb-a"));
  check("listDecisions(A): KEINE mdb-b Zeile enthalten", Array.isArray(decA) && !decA.some((r) => r.user_id === "mdb-b"));
  check("listDecisions(A): Endpoint trägt user_id=eq.mdb-a", /user_id=eq\.mdb-a/.test(lastEndpoint || ""));

  const mrA = await noThrow("listMatchingResults(A)", () => storage.listMatchingResults({ userId: "mdb-a" }, liveDeps));
  check("listMatchingResults(A): nur mdb-a", Array.isArray(mrA) && mrA.length === 1 && mrA[0].user_id === "mdb-a");

  const offA = await noThrow("listOfficeOutputsByUser(A)", () => storage.listOfficeOutputsByUser("mdb-a", null, liveDeps));
  check("listOfficeOutputsByUser(A): nur mdb-a", Array.isArray(offA) && offA.length === 1 && offA[0].user_id === "mdb-a");

  // Gegenprobe: B sieht nur B.
  const decB = await noThrow("listDecisions(B)", () => storage.listDecisions({ userId: "mdb-b" }, liveDeps));
  check("listDecisions(B): nur mdb-b", Array.isArray(decB) && decB.length === 1 && decB[0].user_id === "mdb-b");

  console.log("== 4) erlaubter Zugriff innerhalb desselben Tenants ==");
  check("A erhält seine 2 Decisions", Array.isArray(decA) && decA.length === 2);
  check("A erhält seinen Match", Array.isArray(mrA) && mrA.length === 1);

  console.log("== 5) Reads MIT userId, aber Store nicht bereit -> [] (kein Fehler) ==");
  const offGuardOnly = await noThrow("listDecisions(A, store aus)", () => storage.listDecisions({ userId: "mdb-a" }, { ready: () => false, request: fakeRequest }));
  check("Store aus + userId -> leer, kein Leak", Array.isArray(offGuardOnly) && offGuardOnly.length === 0);

  console.log("== 6) Schreib-Guard: tenant-lose Zeile -> Ablehnung ==");
  await throwsTenant("saveDecisions([{id ohne user_id}])", () => storage.saveDecisions([{ id: "dec-x", score: 10 }]));
  await throwsTenant("saveMatchingResults([{id ohne user_id}])", () => storage.saveMatchingResults([{ id: "mr-x" }]));
  await noThrow("saveDecisions([]) (leer) ok", () => storage.saveDecisions([]));
  await noThrow("saveDecisions([{id,user_id}]) (store aus -> skipped) ok", () => storage.saveDecisions([{ id: "dec-y", user_id: "mdb-a", score: 10 }]));

  console.log("== 7) Keyed Reads (getProfileEmbedding/getOfficeOutput/canSpendOfficeOutput) ==");
  // OHNE userId -> harte Ablehnung (kein stiller null/allowed-Fallback mehr).
  await throwsTenant("getProfileEmbedding()", () => storage.getProfileEmbedding(undefined));
  await throwsTenant("getProfileEmbedding('')", () => storage.getProfileEmbedding(""));
  await throwsTenant("getOfficeOutput(undefined, vg, ch)", () => storage.getOfficeOutput(undefined, "vg1", "rede"));
  await throwsTenant("canSpendOfficeOutput()", () => storage.canSpendOfficeOutput(null));
  // MIT userId, Store aus -> sicherer Default OHNE Netzwerk, kein Fehler, kein Leak.
  check("getProfileEmbedding(A, store aus) -> null", (await storage.getProfileEmbedding("mdb-a")) === null);
  check("getOfficeOutput(A, store aus) -> null", (await storage.getOfficeOutput("mdb-a", "vg1", "rede")) === null);
  const spend = await storage.canSpendOfficeOutput("mdb-a");
  check("canSpendOfficeOutput(A, store aus) -> allowed, used 0", spend && spend.allowed === true && spend.used === 0);

  console.log("");
  const total = pass + fail;
  if (fail === 0) { console.log(`${pass}/${total} Tenant-Guard-Assertions erfolgreich.`); process.exit(0); }
  else { console.log(`${fail} von ${total} Tenant-Guard-Assertions FEHLGESCHLAGEN.`); process.exit(1); }
})();
