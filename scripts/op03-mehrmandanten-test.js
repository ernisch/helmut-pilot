"use strict";

// OP-03 (Zweitmandanten-Freigabepaket) — vollstaendiger lokaler Mehrmandantentest.
//
// Beweist auf HTTP-Ebene (echter Loopback-Server, Konten-Modus, lokaler
// Datei-Store), dass zwei PROVISIONIERTE synthetische Mandanten vollstaendig
// gegeneinander isoliert sind:
//   * A sieht ausschliesslich eigene Tasks/Notizen/Profil; B ebenso.
//   * Manipulierte Mandantenkennungen (?politicianId=B) werden ignoriert
//     (harte Session-Bindung), bekannte fremde Objekt-IDs geben 404.
//   * Fehlende/ungueltige Sessions -> 401; fremde Rollen -> 403.
//   * Ein Referent aus Mandat A kann Mandat B weder sehen noch verwalten.
//   * Einladung + Passwort-Setzen + Reset veraendern die Mandantenbindung nicht.
//   * Die OP-03-Provisionierungs-Vorbedingung (Konten-Modus + Admin-Konto)
//     lehnt gegen eine (simulierte) echte DB fail-closed ab.
//   * Genau EIN Abgeordneten-Konto je Mandat (updateUser-Eindeutigkeit).
//   * Kein Service-Role-Schluesselmaterial im Client oder in Antworten.
//
// KEIN Netz, KEINE echte DB, ausschliesslich synthetische "-synthetic"-Mandate.
// Ergaenzt (ohne Dopplung): cross-tenant-security-test.js (Storage-Guards),
// provision-tenant-test.js (Idempotenz/Rollback), invite-flow-test.js
// (Invite-/Reset-Mechanik), p1-security-check.js (pickPoliticianId-Matrix).

const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_V3_STORE;

// Store-Hermetik: lokale Daten sichern und am Ende byte-identisch wiederherstellen.
const dataDir = path.join(root, ".helmut-data");
const snapshots = new Map();
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) snapshots.set(f, fs.readFileSync(path.join(dataDir, f)));
}
function restoreStore() {
  try {
    if (!fs.existsSync(dataDir)) return;
    for (const f of fs.readdirSync(dataDir)) {
      if (!snapshots.has(f)) fs.unlinkSync(path.join(dataDir, f));
    }
    for (const [f, buf] of snapshots) fs.writeFileSync(path.join(dataDir, f), buf);
  } catch (_) { /* best effort */ }
}
process.on("exit", restoreStore);

const handler = require("../server.js");
const accounts = require("../lib/helmut/accounts");
const storage = require("../lib/helmut/storage");
const provisioning = require("../lib/helmut/provisioning");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

function req(port, method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : (typeof body === "string" ? body : JSON.stringify(body));
    const r = http.request({ host: "127.0.0.1", port, method, path: reqPath, headers: {
      ...(data != null ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
      ...headers
    }, timeout: 20000 }, (res) => {
      let out = "";
      res.on("data", (c) => { out += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: out, headers: res.headers }));
    });
    r.on("error", reject);
    r.on("timeout", () => { r.destroy(new Error("timeout")); });
    if (data != null) r.write(data);
    r.end();
  });
}
function parse(body) { try { return JSON.parse(body); } catch (_) { return {}; } }

async function login(port, email, password) {
  const res = await req(port, "POST", "/api/auth/login", { body: { email, password } });
  if (res.status !== 200) throw new Error(`Login ${email} fehlgeschlagen: ${res.status} ${res.body.slice(0, 200)}`);
  return String(res.headers["set-cookie"][0]).split(";")[0];
}
async function csrfFor(port, cookie) {
  return parse((await req(port, "GET", "/api/security/csrf", { headers: { Cookie: cookie } })).body).token;
}

const A = "op03-a-synthetic";
const B = "op03-b-synthetic";
// Eindeutige Marker, die NUR in den Daten des jeweiligen Mandanten vorkommen —
// jede Antwort an den jeweils anderen Mandanten darf sie nie enthalten.
const MARKER_A = "GEHEIM-MARKER-ALPHA-77341";
const MARKER_B = "GEHEIM-MARKER-BETA-88652";

const specA = {
  id: A, email: "op03-a@synthetic.test", name: "Testperson Alpha", password: "test-pass-a-1",
  party: "SPD", parliamentType: "Bundestag", state: "Berlin", constituency: "Mitte",
  committees: ["Arbeit und Soziales"], focusTopics: ["Rente"]
};
const specB = {
  id: B, email: "op03-b@synthetic.test", name: "Testperson Beta", password: "test-pass-b-1",
  party: "Die Linke", parliamentType: "Bundestag", state: "Sachsen", constituency: "Leipzig",
  committees: ["Haushalt"], focusTopics: ["Finanzen"]
};

(async () => {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    // ── 0) Betreiber-Admin + Provisionierung A und B (reproduzierbar) ─────────
    await accounts.createUser({ email: "op03-admin@synthetic.test", name: "OP03 Admin", role: "admin", password: "admin-pass-op03" });
    const rA = await provisioning.provisionTenant(specA);
    const rB = await provisioning.provisionTenant(specB);
    check("0 Mandant A provisioniert", rA.ok === true, JSON.stringify(rA.reason || rA.errors));
    check("0 Mandant B provisioniert", rB.ok === true, JSON.stringify(rB.reason || rB.errors));
    const rA2 = await provisioning.provisionTenant(specA);
    const usersA = (await accounts.listUsers()).filter((u) => u.politicianId === A);
    check("0 Wiederholung idempotent (1 Konto, kein Duplikat)", rA2.ok === true && rA2.updated === true && usersA.length === 1);

    // Mandantendaten mit eindeutigen Markern anlegen.
    await storage.saveTask({ id: "op03-task-a", politicianId: A, title: `Aufgabe ${MARKER_A}`, status: "open" });
    await storage.saveTask({ id: "op03-task-b", politicianId: B, title: `Aufgabe ${MARKER_B}`, status: "open" });
    await storage.saveUserNote({ politicianId: A, text: `Notiz ${MARKER_A}` });
    await storage.saveUserNote({ politicianId: B, text: `Notiz ${MARKER_B}` });

    // ── 1) Sichtbarkeit: A sieht nur A, B sieht nur B ─────────────────────────
    const cookieA = await login(port, specA.email, specA.password);
    const cookieB = await login(port, specB.email, specB.password);
    const startA = await req(port, "GET", "/api/app/start", { headers: { Cookie: cookieA } });
    const startB = await req(port, "GET", "/api/app/start", { headers: { Cookie: cookieB } });
    check("1 A: app/start liefert Profil A", parse(startA.body).profile && parse(startA.body).profile.id === A);
    check("1 B: app/start liefert Profil B", parse(startB.body).profile && parse(startB.body).profile.id === B);
    check("1 A sieht eigenen Marker, NIE den von B", startA.body.includes(MARKER_A) && !startA.body.includes(MARKER_B));
    check("1 B sieht eigenen Marker, NIE den von A", startB.body.includes(MARKER_B) && !startB.body.includes(MARKER_A));

    // ── 2) Manipulierte Mandantenkennung: harte Session-Bindung ───────────────
    const startAasB = await req(port, "GET", `/api/app/start?politicianId=${B}`, { headers: { Cookie: cookieA } });
    check("2 A mit ?politicianId=B bleibt an A gebunden", parse(startAasB.body).profile && parse(startAasB.body).profile.id === A);
    check("2 Antwort enthaelt keinen B-Marker", !startAasB.body.includes(MARKER_B));
    const tasksAasB = await req(port, "GET", `/api/tasks?politicianId=${B}`, { headers: { Cookie: cookieA } });
    check("2 /api/tasks ignoriert fremde Mandantenkennung", tasksAasB.status === 200 && !tasksAasB.body.includes(MARKER_B), `status=${tasksAasB.status}`);
    const profAasB = await req(port, "GET", `/api/profile/current?profileId=${B}`, { headers: { Cookie: cookieA } });
    check("2 /api/profile/current ignoriert fremde profileId", !profAasB.body.includes(MARKER_B) && !/Testperson Beta/.test(profAasB.body), `status=${profAasB.status}`);

    // ── 3) Bekannte fremde Objekt-IDs geben keinen Zugriff ───────────────────
    const csrfA = await csrfFor(port, cookieA);
    const patchForeign = await req(port, "PATCH", "/api/tasks/op03-task-b", {
      headers: { Cookie: cookieA, "x-csrf-token": csrfA }, body: { status: "done" }
    });
    check("3 A kann B-Task nicht schreiben (404)", patchForeign.status === 404, `status=${patchForeign.status}`);
    const bTasks = await storage.getTasks(B);
    check("3 B-Task blieb unveraendert (status=open)", bTasks.find((t) => t.id === "op03-task-b")?.status === "open");

    // ── 4) Fehlende/ungueltige Sitzung -> 401 ────────────────────────────────
    const noSession = await req(port, "GET", "/api/tasks");
    const badSession = await req(port, "GET", "/api/tasks", { headers: { Cookie: "helmut_session=gefaelscht-123" } });
    check("4 ohne Session -> 401", noSession.status === 401, `status=${noSession.status}`);
    check("4 gefaelschtes Session-Token -> 401", badSession.status === 401, `status=${badSession.status}`);
    // Abgelaufene Session: direkt im Auth-Store ablaufen lassen, dann anfragen.
    const expCookieRaw = await login(port, specB.email, specB.password);
    {
      const authStore = await storage.readAuthStore();
      for (const s of authStore.sessions || []) s.expiresAt = new Date(Date.now() - 1000).toISOString();
      await storage.writeAuthStore(authStore);
    }
    const expired = await req(port, "GET", "/api/tasks", { headers: { Cookie: expCookieRaw } });
    check("4 abgelaufene Session -> 401", expired.status === 401, `status=${expired.status}`);
    // Sessions von A/B neu aufbauen (oben wurden ALLE Sessions invalidiert).
    const cookieA2 = await login(port, specA.email, specA.password);
    const cookieB2 = await login(port, specB.email, specB.password);

    // ── 5) Rollen: Abgeordnete erreichen keine Admin-Funktionen ───────────────
    const adminAsA = await req(port, "GET", "/api/admin/users", { headers: { Cookie: cookieA2 } });
    check("5 A auf /api/admin/users -> 403", adminAsA.status === 403, `status=${adminAsA.status}`);
    // Rollenmanipulation ueber den einzigen Selbstbedienungs-PATCH: Body-Felder
    // ausser notificationSettings werden verworfen.
    const csrfA2 = await csrfFor(port, cookieA2);
    await req(port, "PATCH", "/api/user/notification-settings", {
      headers: { Cookie: cookieA2, "x-csrf-token": csrfA2 },
      body: { role: "admin", politicianId: B, briefing: false }
    });
    const aUser = (await accounts.listUsers()).find((u) => u.email === specA.email);
    check("5 Selbst-PATCH kann Rolle/Mandat NICHT aendern", aUser.role === "abgeordneter" && aUser.politicianId === A, JSON.stringify({ role: aUser.role, politicianId: aUser.politicianId }));
    const adminAfter = await req(port, "GET", "/api/admin/users", { headers: { Cookie: cookieA2 } });
    check("5 auch danach kein Admin-Zugriff", adminAfter.status === 403);

    // ── 6) Referent aus Mandat A kann B weder sehen noch verwalten ────────────
    const referent = await accounts.createUser({ email: "op03-ref-a@synthetic.test", name: "Referent Alpha", role: "referent", password: "ref-pass-a-1" });
    await accounts.addAssignment(referent.id, A);
    const cookieR = await login(port, "op03-ref-a@synthetic.test", "ref-pass-a-1");
    const startR = await req(port, "GET", `/api/app/start?politicianId=${B}`, { headers: { Cookie: cookieR } });
    check("6 Referent(A) mit ?politicianId=B faellt auf A zurueck", parse(startR.body).profile && parse(startR.body).profile.id === A, JSON.stringify(parse(startR.body).profile?.id));
    check("6 Referent(A) sieht keinen B-Marker", !startR.body.includes(MARKER_B));
    const adminAsR = await req(port, "GET", "/api/admin/users", { headers: { Cookie: cookieR } });
    check("6 Referent auf /api/admin/users -> 403", adminAsR.status === 403, `status=${adminAsR.status}`);
    const csrfR = await csrfFor(port, cookieR);
    const exportAsR = await req(port, "GET", "/api/privacy/export", { headers: { Cookie: cookieR, "x-csrf-token": csrfR } });
    check("6 Referent darf Mandatsdaten nicht exportieren (403)", exportAsR.status === 403, `status=${exportAsR.status}`);

    // ── 7) Einladung/Passwort-Reset bewahren die Mandantenbindung ────────────
    const adminCookie = await login(port, "op03-admin@synthetic.test", "admin-pass-op03");
    const adminCsrf = await csrfFor(port, adminCookie);
    const adminWrite = { Cookie: adminCookie, "x-csrf-token": adminCsrf };
    const invited = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Eingeladene Beta-Referentin", email: "op03-ref-b@synthetic.test", role: "referent"
    } })).body);
    check("7 Einladung erstellt (Status eingeladen)", invited.status === "eingeladen", JSON.stringify(invited.status));
    await accounts.addAssignment(invited.id, B);
    const inviteToken = new URL(String(invited.inviteUrl)).searchParams.get("token");
    const setRes = await req(port, "POST", "/api/auth/set-password", { body: { token: inviteToken, password: "ref-b-pass-1" } });
    check("7 Passwort-Setzen per Invite-Token -> 200", setRes.status === 200, `status=${setRes.status}`);
    const refB1 = (await accounts.listUsers()).find((u) => u.email === "op03-ref-b@synthetic.test");
    const refB1Assign = await accounts.assignmentsForUser(refB1.id);
    check("7 Bindung nach Aktivierung: Rolle referent, Zuweisung NUR B", refB1.role === "referent" && refB1Assign.length === 1 && refB1Assign[0].politicianId === B);
    // Reset-Link (Admin-Zugangslink) + erneutes Setzen: Bindung bleibt B.
    const resetIssued = parse((await req(port, "POST", `/api/admin/users/${encodeURIComponent(refB1.id)}/invite`, { headers: adminWrite, body: {} })).body);
    check("7 Reset-Link fuer aktives Konto (purpose=reset)", resetIssued.purpose === "reset", JSON.stringify(resetIssued.purpose));
    const resetToken = new URL(String(resetIssued.inviteUrl)).searchParams.get("token");
    const reset = await req(port, "POST", "/api/auth/set-password", { body: { token: resetToken, password: "ref-b-pass-2" } });
    check("7 Reset -> 200", reset.status === 200, `status=${reset.status}`);
    const refB2 = (await accounts.listUsers()).find((u) => u.email === "op03-ref-b@synthetic.test");
    const refB2Assign = await accounts.assignmentsForUser(refB2.id);
    check("7 Bindung nach Reset unveraendert (NUR B)", refB2.role === "referent" && refB2Assign.length === 1 && refB2Assign[0].politicianId === B);
    const cookieRefB = await login(port, "op03-ref-b@synthetic.test", "ref-b-pass-2");
    const startRefB = await req(port, "GET", "/api/app/start", { headers: { Cookie: cookieRefB } });
    check("7 Referent(B) landet auf B und sieht keinen A-Marker", parse(startRefB.body).profile?.id === B && !startRefB.body.includes(MARKER_A));

    // ── 8) Genau EIN Abgeordneten-Konto je Mandat (OP-03-Haertung) ───────────
    let dupErr = null;
    try {
      const bUser = (await accounts.listUsers()).find((u) => u.email === specB.email);
      await accounts.updateUser(bUser.id, { politicianId: A });
    } catch (e) { dupErr = e; }
    check("8 updateUser auf fremdes Mandat -> 409", dupErr && dupErr.statusCode === 409, String(dupErr && dupErr.message));
    const bStill = (await accounts.listUsers()).find((u) => u.email === specB.email);
    check("8 B-Konto blieb an B gebunden", bStill.politicianId === B);

    // ── 9) OP-03-Provisionierungs-Vorbedingung (fail-closed gegen echte DB) ──
    const fakeSupabaseStorage = Object.assign(Object.create(storage), storage, {
      getStorageStatus: () => ({ backend: "supabase", supabaseConfigured: true })
    });
    const legacyEnv = { HELMUT_AUTH_MODE: "" };
    const gate1 = await provisioning.pruefeKontenVorbedingung({ storage: fakeSupabaseStorage, env: legacyEnv });
    check("9 echte DB + Legacy-Gate -> auth-mode-not-accounts", gate1 && gate1.reason === "auth-mode-not-accounts", JSON.stringify(gate1));
    const gate2 = await provisioning.pruefeKontenVorbedingung({
      storage: fakeSupabaseStorage, env: { HELMUT_AUTH_MODE: "accounts" },
      accounts: { adminExists: async () => false }
    });
    check("9 echte DB + accounts, aber kein Admin -> kein-admin-konto", gate2 && gate2.reason === "kein-admin-konto", JSON.stringify(gate2));
    const gate3 = await provisioning.pruefeKontenVorbedingung({
      storage: fakeSupabaseStorage, env: { HELMUT_AUTH_MODE: "accounts" },
      accounts: { adminExists: async () => true }
    });
    check("9 echte DB + accounts + Admin -> Vorbedingung erfuellt", gate3 === null, JSON.stringify(gate3));
    const gate4 = await provisioning.pruefeKontenVorbedingung({
      storage: fakeSupabaseStorage, env: { HELMUT_AUTH_MODE: "accounts" },
      accounts: { adminExists: async () => { throw new Error("Store nicht lesbar"); } }
    });
    check("9 Kontenbestand nicht lesbar -> fail-closed (kein-admin-konto)", gate4 && gate4.reason === "kein-admin-konto", JSON.stringify(gate4));
    const usersBefore = (await accounts.listUsers()).length;
    const rBlocked = await provisioning.provisionTenant(
      { ...specA, id: "op03-blocked-synthetic", email: "op03-blocked@synthetic.test" },
      { storage: fakeSupabaseStorage, env: legacyEnv }
    );
    const usersAfter = (await accounts.listUsers()).length;
    check("9 provisionTenant lehnt im Legacy-Gate ab, KEIN Write", rBlocked.ok === false && rBlocked.reason === "auth-mode-not-accounts" && usersBefore === usersAfter, JSON.stringify(rBlocked.reason));
    check("9 lokaler Datei-Modus bleibt unberuehrt (A wurde oben provisioniert)", rA.ok === true);

    // ── 10) Kein Service-Role-Schluesselmaterial im Client / in Antworten ────
    // Statische Pruefung: client.js referenziert weder die Key-Variable noch ein
    // JWT-artiges Schluesselmaterial; die gepruefte app/start-Antwort ebenso wenig.
    const clientSrc = fs.readFileSync(path.join(root, "client.js"), "utf8");
    check("10 client.js enthaelt keinen SUPABASE_SERVICE_ROLE_KEY-Bezug", !clientSrc.includes("SUPABASE_SERVICE_ROLE_KEY"));
    check("10 client.js enthaelt kein JWT-Schluesselmaterial (eyJ…)", !/["']eyJ[A-Za-z0-9_-]{20,}/.test(clientSrc));
    check("10 app/start-Antwort enthaelt kein Schluesselmaterial", !/SERVICE_ROLE|eyJ[A-Za-z0-9_-]{20,}/.test(startA.body));

    // ── 11) Fehlerantworten verraten keine fremden Daten ─────────────────────
    check("11 404 auf fremden Task ist generisch (kein B-Inhalt)", !patchForeign.body.includes(MARKER_B) && !patchForeign.body.includes("Aufgabe"), patchForeign.body.slice(0, 120));
    check("11 403-Antworten sind generisch", !adminAsA.body.includes(MARKER_A) && !adminAsA.body.includes(MARKER_B));
  } catch (error) {
    failed += 1;
    console.error("FAIL  Unerwarteter Testfehler:", error);
  } finally {
    server.close();
  }

  console.log(`\n== Ergebnis: ${passed} PASS, ${failed} FAIL ==`);
  process.exit(failed ? 1 : 0);
})();
