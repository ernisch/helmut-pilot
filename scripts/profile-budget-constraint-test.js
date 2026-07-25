"use strict";

// Regressions-Beweis fuer den P1 aus dem adversarialen Merge-Review (PR #113):
// Ein UNGUELTIGER KI-Budgetwert (negativ, Dezimal, nicht-numerisch) darf im
// strict-Exklusivmodus NIEMALS zu einem HTTP 500 oder vollstaendigem Save-Verlust
// fuehren. Der tolerante Vertrag bleibt erhalten: ungueltige Budgets werden nicht
// als Serverfehler behandelt, alle uebrigen Felder werden gespeichert, der Rohwert
// geht nicht verloren (validateProfile kann ihn weiter melden).
//
// KERN DES TESTS (Test-Rigor-Fix aus dem Review): der In-Memory-Fake bildet die
// ECHTEN DB-Constraints der Spalte ki_budget_*_cent nach —
//   integer  UND  CHECK (spalte is null OR spalte > 0)
// (Migration supabase/migrations/20260712_mandate_profile_fields.sql). Ein
// constraint-verletzender Upsert antwortet mit 400 wie echtes PostgREST. Dadurch
// wuerde eine Regression (Rohwert fliesst wieder in die typisierte Spalte) im
// Exklusivmodus HART als throw auffallen — genau der Fehler, den die bisherige
// Suite mangels Constraint-Modellierung NICHT erkennen konnte.

process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key-for-test";
process.env.HELMUT_V3_STORE = "1";
process.env.HELMUT_PROFILE_DB_MODE = "1";
process.env.HELMUT_PROFILE_DB_EXCLUSIVE = "1";

const storage = require("../lib/helmut/storage");

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const profilesTable = new Map();
const mandateTable = new Map();
const blobRows = new Map();
let calls = [];

function makeRes(status, payload) {
  const body = payload === undefined || payload === null ? "" : JSON.stringify(payload);
  return { ok: status >= 200 && status < 300, status, statusText: status < 300 ? "OK" : "ERR", text: async () => body };
}

// Bildet die reale Spalten-Semantik von ki_budget_*_cent nach: integer + CHECK > 0.
// Rueckgabe true => der Wert wuerde die DB-Zeile ablehnen (400).
function budgetColumnRejects(value) {
  if (value === null || value === undefined) return false;         // NULL ist erlaubt (Systemdefault)
  if (typeof value !== "number") return true;                      // integer-Spalte: Nicht-Zahl -> Typfehler
  if (!Number.isFinite(value)) return true;                        // NaN/Infinity -> Typfehler
  if (!Number.isInteger(value)) return true;                       // Dezimal -> integer-Typfehler
  if (value <= 0) return true;                                     // CHECK (> 0)
  return false;
}

async function fakeFetch(url, options = {}) {
  const u = String(url);
  const method = (options.method || "GET").toUpperCase();
  const path = u.replace(/^https?:\/\/[^/]+/, "");
  calls.push({ method, path });
  const body = options.body ? JSON.parse(options.body) : null;
  const prefer = String((options.headers && (options.headers.Prefer || options.headers.prefer)) || "");
  const minimal = prefer.includes("return=minimal");

  if (path.startsWith("/rest/v1/helmut_store")) {
    if (method === "GET") {
      const m = /id=eq\.([^&]+)/.exec(path);
      const id = m ? decodeURIComponent(m[1]) : null;
      const data = id && blobRows.has(id) ? blobRows.get(id) : null;
      return makeRes(200, data ? [{ data }] : []);
    }
    if (method === "POST") {
      if (body && body.id) blobRows.set(body.id, body.data);
      return minimal ? makeRes(204, null) : makeRes(200, [body]);
    }
  }

  if (path.startsWith("/rest/v1/profiles")) {
    if (method === "GET") {
      const idM = /id=eq\.([^&]+)/.exec(path);
      if (idM) {
        const id = decodeURIComponent(idM[1]);
        const p = profilesTable.get(id);
        if (!p) return makeRes(200, []);
        return makeRes(200, [{ ...p, mandate_profiles: mandateTable.has(id) ? [mandateTable.get(id)] : [] }]);
      }
      const rows = [...profilesTable.values()].map((p) => ({
        ...p, mandate_profiles: mandateTable.has(p.id) ? [mandateTable.get(p.id)] : []
      }));
      return makeRes(200, rows);
    }
    if (method === "POST") {
      if (!/on_conflict=id(?:&|$)/.test(path)) return makeRes(409, { message: "profiles: falsches on_conflict-Ziel" });
      const existing = profilesTable.get(body.id) || {};
      profilesTable.set(body.id, { ...existing, ...body, updated_at: "2026-07-20T00:00:00Z" });
      return minimal ? makeRes(204, null) : makeRes(200, [profilesTable.get(body.id)]);
    }
  }

  if (path.startsWith("/rest/v1/mandate_profiles")) {
    if (method === "POST") {
      if (!/on_conflict=user_id(?:&|$)/.test(path)) return makeRes(409, { message: "mandate_profiles: falsches on_conflict-Ziel" });
      // ECHTE Constraint-Durchsetzung: integer + CHECK (> 0) auf beiden Budget-Spalten.
      if (budgetColumnRejects(body.ki_budget_taeglich_cent)) {
        return makeRes(400, { code: "23514", message: `check/typ verletzt: ki_budget_taeglich_cent=${JSON.stringify(body.ki_budget_taeglich_cent)}` });
      }
      if (budgetColumnRejects(body.ki_budget_monatlich_cent)) {
        return makeRes(400, { code: "23514", message: `check/typ verletzt: ki_budget_monatlich_cent=${JSON.stringify(body.ki_budget_monatlich_cent)}` });
      }
      const existing = mandateTable.get(body.user_id) || {};
      mandateTable.set(body.user_id, { ...existing, ...body, updated_at: "2026-07-20T00:00:00Z" });
      return minimal ? makeRes(204, null) : makeRes(200, [mandateTable.get(body.user_id)]);
    }
    if (method === "GET") return makeRes(200, [...mandateTable.values()]);
  }

  return makeRes(200, []);
}

function blobCalls() { return calls.filter((c) => c.path.startsWith("/rest/v1/helmut_store")); }
function reset() { calls = []; profilesTable.clear(); mandateTable.clear(); blobRows.clear(); }

function baseProfile(overrides) {
  return {
    id: "test-budget-mandat",
    fullName: "Test Budget Mandat",
    party: "Testpartei Alpha",
    committees: ["Arbeit und Soziales"],
    focusTopics: ["Arbeit", "Soziales"],
    ...overrides
  };
}

(async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  try {
    check("Exklusivmodus aktiv (Vorbedingung)", storage.profileDbExclusiveEnabled() === true);

    // ── 0) Selbsttest des Harness: der Fake lehnt einen constraint-verletzenden
    //      Direkt-Upsert wirklich ab (sonst waere der Test wertlos / falsch-gruen).
    console.log("\n== 0) Harness-Selbsttest: Fake erzwingt CHECK(>0) + integer ==");
    reset();
    let harnessRejected = false;
    try {
      await storage.saveProfileToDb({ id: "harness-x", fullName: "X",
        // toMandateProfileRow wuerde -5 sanitisieren; hier den Upsert mit
        // manipuliertem deps.upsert umgehen, um die reine Fake-Ablehnung zu zeigen:
      }, { strict: true, upsert: async (table, row, onConflict) => {
        const res = await fakeFetch(`https://example.invalid/rest/v1/${table}?on_conflict=${onConflict}`, {
          method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(table === "mandate_profiles" ? { ...row, user_id: "harness-x", ki_budget_taeglich_cent: -5 } : row)
        });
        if (!res.ok) throw new Error(`fake ${res.status}`);
        return row;
      } });
    } catch (_) { harnessRejected = true; }
    check("Fake lehnt ki_budget_taeglich_cent=-5 ab (Constraint scharf)", harnessRejected === true);

    // ── 1) Ungueltiges TAEGLICHES Budget: kein throw, kein 500, kein Blob, Spalte null,
    //      uebrige Felder gespeichert, Rohwert im Round-Trip erhalten.
    for (const badDaily of [-5, 12.5]) {
      console.log(`\n== 1) Ungueltiges Tagesbudget (${JSON.stringify(badDaily)}) speichert tolerant ==`);
      reset();
      let threw = false; let saved = null;
      try { saved = await storage.saveProfile(baseProfile({ aiBudgetDailyCents: badDaily })); }
      catch (_) { threw = true; }
      check(`Tagesbudget ${badDaily}: saveProfile wirft NICHT (kein 500/Save-Verlust)`, threw === false);
      check(`Tagesbudget ${badDaily}: profiles-Zeile geschrieben`, profilesTable.has("test-budget-mandat"));
      check(`Tagesbudget ${badDaily}: mandate_profiles-Zeile geschrieben`, mandateTable.has("test-budget-mandat"));
      check(`Tagesbudget ${badDaily}: Spalte auf null gesetzt (CHECK-konform)`,
        mandateTable.get("test-budget-mandat") && (mandateTable.get("test-budget-mandat").ki_budget_taeglich_cent === null || mandateTable.get("test-budget-mandat").ki_budget_taeglich_cent === undefined));
      check(`Tagesbudget ${badDaily}: uebrige Felder gespeichert (party)`, saved && saved.party === "Testpartei Alpha");
      check(`Tagesbudget ${badDaily}: KEIN helmut_store-Blob beruehrt`, blobCalls().length === 0);
      const readBack = await storage.getProfile("test-budget-mandat");
      check(`Tagesbudget ${badDaily}: Round-Trip erhaelt Rohwert (validateProfile kann melden)`, readBack && readBack.aiBudgetDailyCents === badDaily);
      check(`Tagesbudget ${badDaily}: gueltige Felder ueberleben Round-Trip`, readBack && Array.isArray(readBack.committees) && readBack.committees.includes("Arbeit und Soziales"));
    }

    // ── 2) Ungueltiges MONATLICHES Budget: analog.
    console.log("\n== 2) Ungueltiges Monatsbudget (-1) speichert tolerant ==");
    reset();
    let threw2 = false;
    try { await storage.saveProfile(baseProfile({ aiBudgetMonthlyCents: -1 })); } catch (_) { threw2 = true; }
    check("Monatsbudget -1: saveProfile wirft NICHT", threw2 === false);
    check("Monatsbudget -1: Spalte auf null gesetzt", mandateTable.get("test-budget-mandat") && (mandateTable.get("test-budget-mandat").ki_budget_monatlich_cent == null));
    const rb2 = await storage.getProfile("test-budget-mandat");
    check("Monatsbudget -1: Rohwert im Round-Trip erhalten", rb2 && rb2.aiBudgetMonthlyCents === -1);

    // ── 3) GUELTIGES Budget bleibt unveraendert in der typisierten Spalte (keine Regression).
    console.log("\n== 3) Gueltiges Budget landet weiterhin in der Spalte ==");
    reset();
    let threw3 = false;
    try { await storage.saveProfile(baseProfile({ aiBudgetDailyCents: 250, aiBudgetMonthlyCents: 5000 })); } catch (_) { threw3 = true; }
    check("Gueltiges Budget: kein throw", threw3 === false);
    check("Gueltiges Budget: Tagesspalte = 250", mandateTable.get("test-budget-mandat").ki_budget_taeglich_cent === 250);
    check("Gueltiges Budget: Monatsspalte = 5000", mandateTable.get("test-budget-mandat").ki_budget_monatlich_cent === 5000);
    const rb3 = await storage.getProfile("test-budget-mandat");
    check("Gueltiges Budget: Round-Trip = 250/5000", rb3 && rb3.aiBudgetDailyCents === 250 && rb3.aiBudgetMonthlyCents === 5000);
    check("Gueltiges Budget: NICHT in profil_extras dupliziert", !("aiBudgetDailyCents" in ((mandateTable.get("test-budget-mandat").profil_extras) || {})));

    // ── 4) Kein Budget gesetzt: Spalte null, kein Fehler, kein extras-Muell.
    console.log("\n== 4) Ohne Budget: Spalte null, sauber ==");
    reset();
    let threw4 = false;
    try { await storage.saveProfile(baseProfile({})); } catch (_) { threw4 = true; }
    check("Ohne Budget: kein throw", threw4 === false);
    check("Ohne Budget: Tagesspalte null", mandateTable.get("test-budget-mandat").ki_budget_taeglich_cent == null);
    const rb4 = await storage.getProfile("test-budget-mandat");
    check("Ohne Budget: kein aiBudgetDailyCents rekonstruiert", rb4 && rb4.aiBudgetDailyCents === undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("");
  const total = pass + fail;
  if (fail === 0) { console.log(`${pass}/${total} Budget-Constraint-Assertions erfolgreich.`); process.exit(0); }
  console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
  process.exit(1);
})();
