"use strict";

// Beweis-Suite (Folge-Fix P0): deleteProfileData/deleteTenantScopedData fuehren im
// Exklusivmodus KEINEN unnoetigen main-Blob-Write mehr aus, wenn keine Blob-
// Profilkopie existiert und keine eigenen rawItems entfernt werden — waehrend die
// autoritative relationale Loeschung (profiles/mandate_profiles) unveraendert laeuft.
// Kontrollfaelle beweisen, dass der main-Write bei stale Kopie / eigenen rawItems /
// Flag-off weiterhin erfolgt (kein falsches Weglassen).

process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
process.env.HELMUT_V3_STORE = "1";
process.env.HELMUT_PROFILE_DB_MODE = "1";
process.env.HELMUT_PROFILE_DB_EXCLUSIVE = "1";

const storage = require("../lib/helmut/storage");
const { testPoliticianOne } = require("./fixtures/test-profiles");

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name}`); } }

const profilesTable = new Map(), mandateTable = new Map(), blobRows = new Map();
let calls = [];
function res(s, p) { const b = p == null ? "" : JSON.stringify(p); return { ok: s >= 200 && s < 300, status: s, statusText: "OK", text: async () => b }; }

globalThis.fetch = async (url, opt = {}) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  const method = (opt.method || "GET").toUpperCase();
  const body = opt.body ? JSON.parse(opt.body) : null;
  const prefer = String((opt.headers && (opt.headers.Prefer || opt.headers.prefer)) || "");
  let storeId = null;
  if (path.startsWith("/rest/v1/helmut_store")) {
    const m = /id=eq\.([^&]+)/.exec(path);
    storeId = m ? decodeURIComponent(m[1]) : (method === "POST" && body ? body.id : null);
  }
  calls.push({ method, path, storeId });
  if (path.startsWith("/rest/v1/helmut_store")) {
    if (method === "GET") return res(200, storeId && blobRows.has(storeId) ? [{ data: blobRows.get(storeId) }] : []);
    if (method === "POST") { if (body && body.id) blobRows.set(body.id, body.data); return prefer.includes("return=minimal") ? res(204, null) : res(200, [body]); }
  }
  if (path.startsWith("/rest/v1/profiles")) {
    if (method === "GET") {
      const im = /id=eq\.([^&]+)/.exec(path);
      if (im) { const id = decodeURIComponent(im[1]); const p = profilesTable.get(id); return res(200, p ? [{ ...p, mandate_profiles: mandateTable.has(id) ? [mandateTable.get(id)] : [] }] : []); }
      return res(200, [...profilesTable.values()].map((p) => ({ ...p, mandate_profiles: mandateTable.has(p.id) ? [mandateTable.get(p.id)] : [] })));
    }
    if (method === "POST") { profilesTable.set(body.id, { ...(profilesTable.get(body.id) || {}), ...body }); return prefer.includes("return=minimal") ? res(204, null) : res(200, [profilesTable.get(body.id)]); }
    if (method === "DELETE") { const im = /id=eq\.([^&]+)/.exec(path); const id = im ? decodeURIComponent(im[1]) : null; const had = profilesTable.delete(id); return res(200, had ? [{ id }] : []); }
  }
  if (path.startsWith("/rest/v1/mandate_profiles")) {
    if (method === "POST") { mandateTable.set(body.user_id, { ...(mandateTable.get(body.user_id) || {}), ...body }); return prefer.includes("return=minimal") ? res(204, null) : res(200, [mandateTable.get(body.user_id)]); }
    if (method === "DELETE") { const im = /user_id=eq\.([^&]+)/.exec(path); const id = im ? decodeURIComponent(im[1]) : null; const had = mandateTable.delete(id); return res(200, had ? [{ user_id: id }] : []); }
    if (method === "GET") return res(200, [...mandateTable.values()]);
  }
  return res(200, []); // andere Kindtabellen-DELETEs / main-auth-Handling: leer
};

const id = testPoliticianOne.id;
function reset() { calls = []; }
function mainPosts() { return calls.filter((c) => c.method === "POST" && c.storeId === "main").length; }
function relDelete(table) { return calls.some((c) => c.method === "DELETE" && c.path.startsWith(table)); }
function emptyMain() { return { profiles: {}, mandateProfiles: {}, rawItems: [] }; }

(async () => {
  try {
    console.log("== A) Exklusiv, keine Blob-Kopie, keine eigenen rawItems -> KEIN main-Write ==");
    profilesTable.clear(); mandateTable.clear(); blobRows.clear();
    blobRows.set("main", emptyMain());
    blobRows.set(`main-p-${id}`, {}); // leerer Politiker-Store (kein Seed, kein pStore-Write)
    await storage.saveProfile(testPoliticianOne); // exklusiv: nur SQL
    reset();
    const rA = await storage.deleteProfileData(id);
    check("A: KEIN main-Blob-POST", mainPosts() === 0);
    check("A: relationale Loeschung profiles (DELETE)", relDelete("/rest/v1/profiles"));
    check("A: relationale Loeschung mandate_profiles (DELETE)", relDelete("/rest/v1/mandate_profiles"));
    check("A: SQL-Zeilen tatsaechlich entfernt", profilesTable.size === 0 && mandateTable.size === 0);
    check("A: Loeschung meldet ok", rA && rA.ok === true);

    console.log("== B) Exklusiv, aber STALE Blob-Kopie vorhanden -> main-Write entfernt sie ==");
    profilesTable.clear(); mandateTable.clear(); blobRows.clear();
    blobRows.set("main", { profiles: { [id]: { id, fullName: "Stale" } }, mandateProfiles: { [id]: { user_id: id } }, rawItems: [] });
    blobRows.set(`main-p-${id}`, {});
    await storage.saveProfile(testPoliticianOne);
    reset();
    await storage.deleteProfileData(id);
    check("B: main-Blob-POST erfolgt (stale Kopie entfernen)", mainPosts() >= 1);
    check("B: stale Blob-Kopie danach weg", !blobRows.get("main").profiles[id] && !blobRows.get("main").mandateProfiles[id]);

    console.log("== C) Exklusiv, eigenes rawItem im Blob -> main-Write (rawItems geaendert) ==");
    profilesTable.clear(); mandateTable.clear(); blobRows.clear();
    blobRows.set("main", { profiles: {}, mandateProfiles: {}, rawItems: [{ id: "r1", politicianId: id }] });
    blobRows.set(`main-p-${id}`, {});
    await storage.saveProfile(testPoliticianOne);
    reset();
    await storage.deleteProfileData(id);
    check("C: main-Blob-POST erfolgt (rawItems entfernt)", mainPosts() >= 1);
    check("C: eigenes rawItem entfernt", (blobRows.get("main").rawItems || []).length === 0);

    console.log("== D) Kontrolle Flag-off: main-Write erfolgt wie bisher (Regressionsschutz) ==");
    delete process.env.HELMUT_PROFILE_DB_EXCLUSIVE;
    delete process.env.HELMUT_PROFILE_DB_MODE;
    profilesTable.clear(); mandateTable.clear(); blobRows.clear();
    blobRows.set("main", { profiles: { [id]: { id, fullName: "Blob" } }, mandateProfiles: { [id]: { user_id: id } }, rawItems: [] });
    blobRows.set(`main-p-${id}`, {});
    reset();
    await storage.deleteProfileData(id);
    check("D: main-Blob-POST erfolgt (Blob-Profil vorhanden)", mainPosts() >= 1);
    process.env.HELMUT_PROFILE_DB_MODE = "1";
    process.env.HELMUT_PROFILE_DB_EXCLUSIVE = "1";

    console.log("== E) deleteTenantScopedData: exklusiv ohne Blob-Kopie/rawItems -> KEIN main-Write ==");
    profilesTable.clear(); mandateTable.clear(); blobRows.clear();
    blobRows.set("main", emptyMain());
    blobRows.set(`main-p-${id}`, {});
    await storage.saveProfile(testPoliticianOne);
    reset();
    const rE = await storage.deleteTenantScopedData(id);
    check("E: KEIN main-Blob-POST", mainPosts() === 0);
    check("E: relationale Loeschung profiles (DELETE)", relDelete("/rest/v1/profiles"));
    check("E: SQL-Zeilen entfernt", profilesTable.size === 0 && mandateTable.size === 0);
    check("E: Ergebnis vorhanden", rE && rE.politicianId === id);
  } finally {
    // fetch bleibt im Testprozess ersetzt; Prozess endet ohnehin.
  }

  console.log("");
  const total = pass + fail;
  if (fail === 0) { console.log(`${pass}/${total} Delete-Blob-Assertions erfolgreich.`); process.exit(0); }
  console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
  process.exit(1);
})();
