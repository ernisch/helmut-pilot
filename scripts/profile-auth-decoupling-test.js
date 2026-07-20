"use strict";

// Beweis: Auth/Sessions funktionieren unabhaengig vom Profil-Speichermodus, und
// im Exklusivmodus wird der PROFIL-Blob (helmut_store id='main') nie geschrieben —
// waehrend der SEPARATE Auth-Store (helmut_store id='main-auth') wie bisher genutzt
// wird. Deliverable 4 des Umsetzungssprints.
//
// Fuehrt den echten accounts-Session-Pfad (createSession/resolveSession, ueber den
// Auth-Store) UND den Profil-Pfad (saveProfile/getProfile, relational) end-to-end
// gegen einen In-Memory-helmut_store hinter global.fetch aus.

process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key-for-test";
process.env.HELMUT_V3_STORE = "1";
process.env.HELMUT_PROFILE_DB_MODE = "1";
process.env.HELMUT_PROFILE_DB_EXCLUSIVE = "1";

const storage = require("../lib/helmut/storage");
const accounts = require("../lib/helmut/accounts");
const { testPoliticianOne } = require("./fixtures/test-profiles");

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const profilesTable = new Map();
const mandateTable = new Map();
const blobRows = new Map(); // key = helmut_store id (z. B. 'main', 'main-auth')

function makeRes(status, payload) {
  const body = payload == null ? "" : JSON.stringify(payload);
  return { ok: status >= 200 && status < 300, status, statusText: "OK", text: async () => body };
}

async function fakeFetch(url, options = {}) {
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : null;
  const prefer = String((options.headers && (options.headers.Prefer || options.headers.prefer)) || "");
  const minimal = prefer.includes("return=minimal");

  if (path.startsWith("/rest/v1/helmut_store")) {
    if (method === "GET") {
      const m = /id=eq\.([^&]+)/.exec(path);
      const id = m ? decodeURIComponent(m[1]) : null;
      return makeRes(200, id && blobRows.has(id) ? [{ data: blobRows.get(id) }] : []);
    }
    if (method === "POST") { if (body && body.id) blobRows.set(body.id, body.data); return minimal ? makeRes(204, null) : makeRes(200, [body]); }
  }
  if (path.startsWith("/rest/v1/profiles")) {
    if (method === "GET") {
      const idM = /id=eq\.([^&]+)/.exec(path);
      if (idM) {
        const id = decodeURIComponent(idM[1]);
        const p = profilesTable.get(id);
        return makeRes(200, p ? [{ ...p, mandate_profiles: mandateTable.has(id) ? [mandateTable.get(id)] : [] }] : []);
      }
      return makeRes(200, [...profilesTable.values()].map((p) => ({ ...p, mandate_profiles: mandateTable.has(p.id) ? [mandateTable.get(p.id)] : [] })));
    }
    if (method === "POST") { profilesTable.set(body.id, { ...(profilesTable.get(body.id) || {}), ...body }); return minimal ? makeRes(204, null) : makeRes(200, [profilesTable.get(body.id)]); }
  }
  if (path.startsWith("/rest/v1/mandate_profiles")) {
    if (method === "POST") { mandateTable.set(body.user_id, { ...(mandateTable.get(body.user_id) || {}), ...body }); return minimal ? makeRes(204, null) : makeRes(200, [mandateTable.get(body.user_id)]); }
    if (method === "GET") return makeRes(200, [...mandateTable.values()]);
  }
  return makeRes(200, []);
}

(async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  try {
    // Synthetischer Nutzer (klar kuenstlich) im Auth-Store.
    const user = { id: "user-alpha-1", email: "alpha@test.invalid", name: "Test User Alpha", role: "abgeordneter", politicianId: testPoliticianOne.id, active: true };
    await storage.writeAuthStore({ users: [user], sessions: [] });

    console.log("== 1) Session-Lifecycle funktioniert (waehrend Profil-Exklusivmodus aktiv) ==");
    check("Exklusivmodus aktiv", storage.profileDbExclusiveEnabled() === true);
    const { token } = await accounts.createSession(user.id, { ip: "127.0.0.1", userAgent: "test" });
    check("createSession liefert Token", typeof token === "string" && token.length > 10);
    const resolved = await accounts.resolveSession(token);
    check("resolveSession liefert den korrekten Nutzer", resolved && resolved.user && resolved.user.id === user.id);
    check("resolveSession liefert eine Session", resolved && resolved.session && resolved.session.userId === user.id);
    const badToken = await accounts.resolveSession("nicht-existentes-token");
    check("Ungueltiges Token -> null", badToken === null);

    console.log("== 2) Auth nutzt Auth-Store (main-auth), NICHT den Profil-Blob (main) ==");
    check("Auth-Store-Zeile 'main-auth' wurde geschrieben", blobRows.has("main-auth"));
    check("Profil-Blob-Zeile 'main' wurde NICHT geschrieben", blobRows.has("main") === false);

    console.log("== 3) Profil-Save/Read (relational) beruehrt den Profil-Blob nie ==");
    await storage.saveProfile(testPoliticianOne);
    const profile = await storage.getProfile(testPoliticianOne.id);
    check("Profil relational gespeichert + gelesen", profile && profile.party === "Testpartei Alpha");
    check("Profil-Blob 'main' weiterhin NICHT geschrieben (nur main-auth existiert)", blobRows.has("main") === false);
    check("Nur der Auth-Store liegt im Blob-Table", [...blobRows.keys()].join(",") === "main-auth");

    console.log("== 4) Session-Nutzer -> Anzeigename kommt relational (Profil-Switcher-Pfad) ==");
    // listAllowedProfiles ruft getProfile(politicianId); der Anzeigename stammt aus SQL.
    const display = (await storage.getProfile(user.politicianId))?.fullName;
    check("Anzeigename aus mandate_profiles/profiles", display === testPoliticianOne.fullName);

    console.log("== 5) Session bleibt nach Profil-Writes gueltig (keine Kopplung) ==");
    const stillValid = await accounts.resolveSession(token);
    check("Session nach Profil-Writes weiterhin gueltig", stillValid && stillValid.user.id === user.id);
    await accounts.destroySession(token);
    const afterLogout = await accounts.resolveSession(token);
    check("destroySession invalidiert die Session (Logout)", afterLogout === null);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("");
  const total = pass + fail;
  if (fail === 0) { console.log(`${pass}/${total} Auth-Entkopplungs-Assertions erfolgreich.`); process.exit(0); }
  console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
  process.exit(1);
})();
