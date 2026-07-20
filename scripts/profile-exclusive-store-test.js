"use strict";

// Beweis-Suite fuer den Profil-Exklusivmodus (Stufe E des Entkopplungsplans,
// docs/profil-storage-entkopplung-architekturbericht.md).
//
// Diese Suite fuehrt den ECHTEN Code-Pfad end-to-end aus: saveProfile/getProfile/
// listProfiles -> saveProfileToDb/getProfileFromDb -> v3Upsert/tenantRequest ->
// supabaseRequest -> performSupabaseFetch -> global fetch. Statt eines echten
// Supabase-Servers wird global.fetch durch einen IN-MEMORY-Relationalstore ersetzt,
// der jeden HTTP-Aufruf protokolliert. Dadurch ist beweisbar, WELCHE Endpunkte
// beruehrt werden — insbesondere, dass im Exklusivmodus NIE /rest/v1/helmut_store
// (der globale Blob) geschrieben oder gelesen wird.
//
// WICHTIG: Env-Variablen, die als Modul-Konstante gelesen werden
// (HELMUT_STORE_CACHE_MS, Backend), werden VOR dem require gesetzt.

process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key-for-test";
process.env.HELMUT_V3_STORE = "1";
process.env.HELMUT_PROFILE_DB_MODE = "1";
// Exklusivmodus wird pro Phase gesetzt/entfernt.
delete process.env.HELMUT_PROFILE_DB_EXCLUSIVE;

const storage = require("../lib/helmut/storage");
const { testPoliticianOne, testPoliticianTwo } = require("./fixtures/test-profiles");

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

// --- In-Memory-Relationalstore hinter global.fetch ---------------------------
const profilesTable = new Map();   // id -> profiles-Zeile
const mandateTable = new Map();     // user_id -> mandate_profiles-Zeile
const blobRows = new Map();         // helmut_store id -> data
let calls = [];                     // protokollierte HTTP-Aufrufe
let failMandateOnce = false;        // Fehlerinjektion fuer strict-Test

function makeRes(status, payload) {
  const body = payload === undefined || payload === null ? "" : JSON.stringify(payload);
  return { ok: status >= 200 && status < 300, status, statusText: "OK", text: async () => body };
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
      const existing = profilesTable.get(body.id) || {};
      profilesTable.set(body.id, {
        created_at: existing.created_at || "2026-01-01T00:00:00Z",
        ...existing, ...body, updated_at: "2026-07-20T00:00:00Z"
      });
      return minimal ? makeRes(204, null) : makeRes(200, [profilesTable.get(body.id)]);
    }
  }

  if (path.startsWith("/rest/v1/mandate_profiles")) {
    if (method === "POST") {
      if (failMandateOnce) { failMandateOnce = false; return makeRes(500, { message: "injizierter Fehler" }); }
      const existing = mandateTable.get(body.user_id) || {};
      mandateTable.set(body.user_id, { ...existing, ...body, updated_at: "2026-07-20T00:00:00Z" });
      return minimal ? makeRes(204, null) : makeRes(200, [mandateTable.get(body.user_id)]);
    }
    if (method === "GET") return makeRes(200, [...mandateTable.values()]);
  }

  return makeRes(200, []);
}

function blobCalls() { return calls.filter((c) => c.path.startsWith("/rest/v1/helmut_store")); }
function blobWrites() { return blobCalls().filter((c) => c.method === "POST"); }
function endpointHit(re, methodFilter) {
  return calls.some((c) => re.test(c.path) && (!methodFilter || c.method === methodFilter));
}
function reset() { calls = []; }

(async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  try {
    // ================= PHASE 1: EXKLUSIVMODUS (Stufe E) =================
    process.env.HELMUT_PROFILE_DB_EXCLUSIVE = "1";
    check("Exklusivmodus aktiv (profileDbExclusiveEnabled)", storage.profileDbExclusiveEnabled() === true);

    console.log("\n== 1) Profil-WRITE ohne helmut_store (Deliverable 5) ==");
    reset();
    const saved = await storage.saveProfile(testPoliticianOne);
    check("saveProfile schreibt profiles (POST)", endpointHit(/^\/rest\/v1\/profiles/, "POST"));
    check("saveProfile schreibt mandate_profiles (POST)", endpointHit(/^\/rest\/v1\/mandate_profiles/, "POST"));
    check("saveProfile schreibt KEINEN helmut_store-Blob", blobWrites().length === 0);
    check("saveProfile beruehrt helmut_store GAR NICHT", blobCalls().length === 0);
    check("saveProfile liefert Profil zurueck", saved && saved.id === testPoliticianOne.id);

    console.log("\n== 2) Profil-READ ohne helmut_store (Deliverable 3) ==");
    reset();
    const read = await storage.getProfile(testPoliticianOne.id);
    check("getProfile liest aus mandate_profiles", read && read.party === "Testpartei Alpha");
    check("getProfile Roundtrip: Ausschuss erhalten", read && Array.isArray(read.committees) && read.committees.includes("Arbeit und Soziales"));
    check("getProfile Roundtrip: Wahlkreis erhalten", read && read.constituency === "Testkreis Nord");
    check("getProfile Roundtrip: focusTopics vollstaendig", read && Array.isArray(read.focusTopics) && read.focusTopics.length === testPoliticianOne.focusTopics.length);
    check("getProfile beruehrt helmut_store GAR NICHT", blobCalls().length === 0);

    console.log("\n== 3) READ eines unbekannten Mandats -> null, kein Blob-Fallback ==");
    reset();
    const missing = await storage.getProfile("kein-solches-mandat");
    check("Unbekanntes Mandat -> null (kein Blob-Fallback im Exklusivmodus)", missing === null);
    check("Unbekannt-READ beruehrt helmut_store GAR NICHT", blobCalls().length === 0);

    console.log("\n== 4) Idempotente Saves erzeugen keine Duplikate ==");
    profilesTable.clear(); mandateTable.clear();
    await storage.saveProfile(testPoliticianOne);
    await storage.saveProfile(testPoliticianOne);
    await storage.saveProfile(testPoliticianOne);
    check("3x Save -> genau 1 profiles-Zeile", profilesTable.size === 1);
    check("3x Save -> genau 1 mandate_profiles-Zeile", mandateTable.size === 1);
    check("Feld nach mehrfachem Save unveraendert", (await storage.getProfile(testPoliticianOne.id)).party === "Testpartei Alpha");

    console.log("\n== 5) Parallele Updates verschiedener Mandanten (Root-Cause-Regression) ==");
    profilesTable.clear(); mandateTable.clear();
    reset();
    await Promise.all([
      storage.saveProfile(testPoliticianOne),
      storage.saveProfile(testPoliticianTwo)
    ]);
    const a = await storage.getProfile(testPoliticianOne.id);
    const b = await storage.getProfile(testPoliticianTwo.id);
    check("Parallel: Mandant A erhalten", a && a.party === "Testpartei Alpha");
    check("Parallel: Mandant B erhalten", b && b.party === "Testpartei Beta");
    check("Parallel: beide Zeilen vorhanden (kein Lost Update)", profilesTable.size === 2 && mandateTable.size === 2);
    check("Parallel: KEIN globaler Blob-Write (Amplification eliminiert)", blobWrites().length === 0);

    console.log("\n== 6) Cross-Tenant-Isolation: Save von B aendert A nicht ==");
    profilesTable.clear(); mandateTable.clear();
    await storage.saveProfile(testPoliticianOne);
    const aBefore = JSON.stringify(mandateTable.get(testPoliticianOne.id));
    await storage.saveProfile(testPoliticianTwo);
    const aAfter = JSON.stringify(mandateTable.get(testPoliticianOne.id));
    check("Save von B laesst A-Zeile byte-identisch", aBefore === aAfter);
    check("mandate_profiles-Zeile von B traegt korrekten user_id", mandateTable.get(testPoliticianTwo.id).user_id === testPoliticianTwo.id);

    console.log("\n== 7) Strict: relationaler Fehler wirft (kein stiller Verlust) ==");
    failMandateOnce = true;
    let threw = false;
    try { await storage.saveProfile(testPoliticianOne); } catch (_) { threw = true; }
    check("saveProfile wirft bei relationalem Fehler (Exklusivmodus, strict)", threw === true);
    failMandateOnce = false;

    console.log("\n== 8) listProfiles/listFullProfiles lesen relational (kein Blob) ==");
    profilesTable.clear(); mandateTable.clear();
    await storage.saveProfile(testPoliticianOne);
    await storage.saveProfile(testPoliticianTwo);
    reset();
    const list = await storage.listProfiles();
    const full = await storage.listFullProfiles();
    check("listProfiles liefert beide Mandate", list.length === 2 && list.every((p) => p.id && p.fullName));
    check("listFullProfiles liefert vollstaendige Profile", full.length === 2 && full.every((p) => p.party));
    check("Listing beruehrt helmut_store GAR NICHT", blobCalls().length === 0);

    console.log("\n== 9) Auth-Kopplung: getProfile-Anzeigename ohne Blob ==");
    reset();
    const displayName = (await storage.getProfile(testPoliticianOne.id))?.fullName;
    check("Anzeigename aus SQL (Profil-Switcher-Pfad)", displayName === testPoliticianOne.fullName);
    check("Anzeigename-Read ohne helmut_store", blobCalls().length === 0);

    // ================= PHASE 2: DUAL-WRITE-KONTROLLE (Stufe D) =================
    // Beweist, dass der Test-Harness Blob-Writes UEBERHAUPT erkennt — sonst waeren
    // die "kein Blob"-Assertions oben ein falsch-positives Ergebnis.
    console.log("\n== 10) Kontrolle Dual-Write (Stufe D): helmut_store WIRD geschrieben ==");
    delete process.env.HELMUT_PROFILE_DB_EXCLUSIVE;
    check("Exklusivmodus jetzt AUS", storage.profileDbExclusiveEnabled() === false);
    check("DB-Modus weiterhin AN", storage.profileDbModeEnabled() === true);
    blobRows.set("main", { profiles: {}, mandateProfiles: {} });
    reset();
    await storage.saveProfile(testPoliticianOne);
    check("Dual-Write schreibt helmut_store-Blob (Harness erkennt Blob-Writes)", blobWrites().length >= 1);
    check("Dual-Write schreibt ZUSAETZLICH mandate_profiles", endpointHit(/^\/rest\/v1\/mandate_profiles/, "POST"));

    // ================= PHASE 3: BASELINE-KONTROLLE (Flag ganz aus) =============
    console.log("\n== 11) Kontrolle Baseline (Flags aus): nur Blob, kein SQL ==");
    delete process.env.HELMUT_PROFILE_DB_MODE;
    check("DB-Modus AUS", storage.profileDbModeEnabled() === false);
    blobRows.set("main", { profiles: {}, mandateProfiles: {} });
    reset();
    await storage.saveProfile(testPoliticianTwo);
    check("Baseline schreibt helmut_store-Blob", blobWrites().length >= 1);
    check("Baseline schreibt KEINE profiles/mandate_profiles", !endpointHit(/^\/rest\/v1\/(profiles|mandate_profiles)/, "POST"));
    process.env.HELMUT_PROFILE_DB_MODE = "1";

  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("");
  const total = pass + fail;
  if (fail === 0) { console.log(`${pass}/${total} Exklusiv-Store-Assertions erfolgreich.`); process.exit(0); }
  console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
  process.exit(1);
})();
