"use strict";

// Admin-Bereich: Nutzer sicher loeschen koennen.
// Muster wie invite-flow-test.js / passwort-setzen-login-fix-test.js: echter
// HTTP-Server (Loopback), echter Login, lokales Backend, Store-Hermetik. KEIN
// Netz nach aussen, KEINE KI.
//
// Geprueft:
//  - Quelltext: dezenter, klar destruktiver "Nutzer löschen"-Button + Bestaetigung
//    mit Name/E-Mail/Sessions-Hinweis + Text "Nutzer wirklich löschen?"; Button
//    erscheint NICHT fuer Administratoren; Loeschung feuert erst nach Klick auf
//    den Bestaetigen-Button, nicht schon beim Start-Klick
//  - server.js: DELETE-Route ist admin-gated, loescht ueber die interne ID aus
//    dem Pfad (nicht ueber body.email)
//  - accounts.js: Selbstloeschung gesperrt, Administratoren gesperrt (inkl.
//    eigenstaendiger "letzter Administrator"-Schranke), atomare Loeschung mit
//    Verifikations-/Wiederholungsmuster (wie deleteAuthDataForPolitician)
//  - HTTP-End-zu-Ende: Admin loescht Testnutzer -> Nutzer weg aus der Liste,
//    Login danach unmoeglich, Sessions/Passworttokens/Zuweisungen entfernt,
//    ein ZWEITER Nutzer desselben Mandats + dessen Zuweisung und die
//    politischen Inhaltsdaten (Tagesinput) des Mandats bleiben unberuehrt
//  - Schutzregeln: Nicht-Admin -> 403; eigener Account -> 400; Administratoren
//    -> 403 (auch der letzte verbleibende, unabhaengig getestet); manipulierte/
//    fremde ID -> 404, keine Seiteneffekte
//  - Mobil/Desktop-Darstellung: echte Render-Funktion aus client.js extrahiert
//    und mit echtem styles.css in echtem Chromium gerendert (siehe Hinweis
//    unten zur Browser-Isolationstechnik)

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

// Store-Hermetik: lokale Daten sichern und am Ende wiederherstellen.
const dataDir = path.join(root, ".helmut-data");
const snapshots = new Map();
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) snapshots.set(f, fs.readFileSync(path.join(dataDir, f)));
}
function restoreStore() {
  try {
    if (!fs.existsSync(dataDir)) return;
    for (const f of fs.readdirSync(dataDir)) { if (!snapshots.has(f)) fs.unlinkSync(path.join(dataDir, f)); }
    for (const [f, buf] of snapshots) fs.writeFileSync(path.join(dataDir, f), buf);
  } catch (_) { /* best effort */ }
}
process.on("exit", restoreStore);
// Dieser Test prueft eine EXAKTE Administrator-ANZAHL ("letzter verbleibender
// Administrator"). Ein liegen gebliebener Admin-Account aus einem ANDEREN,
// nicht vollstaendig hermetischen Testlauf (bekanntes Muster, siehe PR #109-
// Bericht) wuerde diese Zaehlung verfaelschen. Deshalb hier zusaetzlich zum
// Snapshot/Restore: den Auth-Store aktiv auf einen frischen Stand zuruecksetzen,
// BEVOR dieser Test etwas anlegt — der urspruengliche Stand wird beim Exit
// unveraendert wiederhergestellt (siehe restoreStore oben).
try { fs.unlinkSync(path.join(dataDir, "auth.json")); } catch (_) { /* existierte nicht — ok */ }

const handler = require("../server.js");
const accounts = require("../lib/helmut/accounts");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
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
function tokenFromUrl(url) { return new URL(String(url)).searchParams.get("token") || ""; }

async function login(port, email, password) {
  const res = await req(port, "POST", "/api/auth/login", { body: { email, password } });
  if (res.status !== 200) throw new Error(`Login ${email} fehlgeschlagen: ${res.status} ${res.body.slice(0, 200)}`);
  return String(res.headers["set-cookie"][0]).split(";")[0];
}

function loadPlaywright() {
  const candidates = ["playwright", path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "playwright")];
  for (const c of candidates) { try { return require(c); } catch (_) {} }
  return null;
}

(async () => {
  const clientSrc = fs.readFileSync(path.join(root, "client.js"), "utf8");
  const serverSrc = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const accountsSrc = fs.readFileSync(path.join(root, "lib/helmut/accounts.js"), "utf8");

  console.log("== Quelltext: Button + Bestaetigungsdialog ==");
  const deleteSectionSrc = (clientSrc.match(/function renderAdminUserDeleteSection\(user\) \{[\s\S]*?\n}\n/) || [""])[0];
  check("renderAdminUserDeleteSection existiert", deleteSectionSrc.length > 50);
  check("Button 'Nutzer löschen' vorhanden", /Nutzer löschen/.test(deleteSectionSrc));
  check("Button optisch als destruktiv erkennbar (adm-danger-btn), aber dezent (--ghost)",
    /adm-danger-btn adm-danger-btn--ghost/.test(deleteSectionSrc));
  check("Button erscheint NICHT fuer Administratoren (role admin -> leerer String)",
    /if \(user\.role === "admin"\) return "";/.test(deleteSectionSrc));
  check("Bestaetigungstext 'Nutzer wirklich löschen?' vorhanden", /Nutzer wirklich löschen\?/.test(deleteSectionSrc));
  check("Bestaetigung zeigt Name", /\$\{escapeHtml\(user\.name \|\| ""\)\}/.test(deleteSectionSrc));
  check("Bestaetigung zeigt E-Mail", /\$\{escapeHtml\(user\.email \|\| ""\)\}/.test(deleteSectionSrc));
  check("Bestaetigung weist auf Entfernung von Zugang UND Sitzungen hin",
    /Zugang und alle Sitzungen dieser Person werden entfernt/.test(deleteSectionSrc));
  check("Endgueltiger Loesch-Klick ist ein EIGENER Button (data-user-delete-confirm), getrennt vom Start-Button",
    /data-user-delete-confirm="\$\{escapeAttribute\(user\.id\)\}"/.test(deleteSectionSrc)
    && /data-user-delete-start="\$\{escapeAttribute\(user\.id\)\}"/.test(deleteSectionSrc));
  check("Panel nur sichtbar, wenn admUserDeleteConfirm.userId zu DIESEM Nutzer passt (kein globales Aufklappen)",
    /admUserDeleteConfirm && admUserDeleteConfirm\.userId === user\.id/.test(deleteSectionSrc));

  const editRowSrc = (clientSrc.match(/function renderAdminUserEditRow\(user, status, feedbackCount = 0\) \{[\s\S]*?\n}\n/) || [""])[0];
  check("renderAdminUserEditRow ruft renderAdminUserDeleteSection auf (Loesch-Bereich ist Teil der geoeffneten Nutzerkarte)",
    /\$\{renderAdminUserDeleteSection\(user\)\}/.test(editRowSrc));

  console.log("\n== Quelltext: Event-Bindung (kein Erfolg ohne Bestaetigung, kein Erfolg bei Fehler) ==");
  const bindSrc = (clientSrc.match(/function bindAdmActions\(\) \{[\s\S]*?\n}\n/) || [""])[0];
  check("bindAdmActions gefunden", bindSrc.length > 500);
  check("Start-Klick setzt nur den Bestaetigungs-Zustand, loest KEINE Loeschung aus",
    /data-user-delete-start[\s\S]{0,200}admUserDeleteConfirm = \{ userId: btn\.dataset\.userDeleteStart \};/.test(bindSrc));
  const confirmHandlerSrc = (bindSrc.match(/data-user-delete-confirm"\]\"\)\.forEach\(\(btn\) => \{[\s\S]*?\n  \}\);/) || [""])[0]
    || (bindSrc.match(/\[data-user-delete-confirm\][\s\S]*?\n  \}\);/) || [""])[0];
  check("Bestaetigen-Handler ruft DELETE /api/admin/users/:id auf",
    /apiSend\("DELETE", `\/api\/admin\/users\/\$\{encodeURIComponent\(userId\)\}/.test(bindSrc));
  check("Bei Fehler (res.ok false ODER json.ok !== true) wird KEIN Erfolg gemeldet — Karte bleibt offen, kein showToast",
    /if \(!res\.ok \|\| !res\.json \|\| res\.json\.ok !== true\) \{[\s\S]{0,220}return;\s*\n\s*\}/.test(bindSrc));
  check("Erfolg schliesst die Karte (expandedAdminUsers.delete) und aktualisiert die Liste (admAfterMutation)",
    /admUserDeleteConfirm = null;\s*\n\s*expandedAdminUsers\.delete\(userId\);\s*\n\s*await admAfterMutation\(\);/.test(bindSrc));
  check("Erfolgsmeldung erst NACH bestaetigtem Erfolg (showToast(\"Nutzer gelöscht.\"))",
    /showToast\("Nutzer gelöscht\."\);/.test(bindSrc));

  console.log("\n== Quelltext: Server-Route (admin-gated, ID aus dem Pfad, keine E-Mail-Loeschung) ==");
  const deleteRouteSrc = (serverSrc.match(/\/\/ Nutzer loeschen[\s\S]*?\n  \}\n/) || [""])[0];
  check("DELETE-Route gefunden", deleteRouteSrc.length > 100);
  check("Route verlangt Rolle admin (requireRoleOr403)", /requireRoleOr403\(response, authUser, "admin"\)/.test(deleteRouteSrc));
  check("Route ermittelt die Ziel-ID aus dem URL-Pfad (nicht aus dem Body)",
    /decodeURIComponent\(url\.pathname\.replace\("\/api\/admin\/users\/", ""\)\)/.test(deleteRouteSrc));
  check("Route liest KEINE E-Mail aus dem Body zur Identifikation", !/body\.email/.test(deleteRouteSrc));
  check("Route schreibt einen Audit-Eintrag bei Erfolg", /recordAudit\(\{ action: "admin\.user\.delete"/.test(deleteRouteSrc));

  console.log("\n== Quelltext: accounts.deleteUser (Schutzregeln + atomare Loeschung) ==");
  const assertDeletableFnSrc = (accountsSrc.match(/function assertUserDeletable\(store, userId, actingUserId\) \{[\s\S]*?\n}\n/) || [""])[0];
  check("assertUserDeletable existiert", assertDeletableFnSrc.length > 100);
  check("Selbstloeschung wird IMMER zuerst geprueft", /if \(actingUserId && target\.id === actingUserId\) \{/.test(assertDeletableFnSrc));
  check("Administratoren sind blockiert (target.role === \"admin\")", /if \(target\.role === "admin"\) \{/.test(assertDeletableFnSrc));
  check("Eigenstaendige 'letzter Administrator'-Schranke unabhaengig vom generellen Admin-Block",
    /const adminCount = \(store\.users \|\| \[\]\)\.filter\(\(entry\) => entry\.role === "admin"\)\.length;[\s\S]{0,80}if \(adminCount <= 1\) \{/.test(assertDeletableFnSrc));

  const deleteUserFnSrc = (accountsSrc.match(/async function deleteUser\(userId, actingUserId\) \{[\s\S]*?\n}\n/) || [""])[0];
  check("deleteUser existiert", deleteUserFnSrc.length > 200);
  const assertCallCount = (deleteUserFnSrc.match(/assertUserDeletable\(/g) || []).length;
  check("TOCTOU-Fix: assertUserDeletable wird MEHRFACH aufgerufen — beim ersten Lesen UND erneut in der Verifikations-/Wiederholungsschleife (nicht nur einmal am Anfang)",
    assertCallCount >= 2, `Aufrufe gefunden: ${assertCallCount}`);
  const retryLoopSrc = (deleteUserFnSrc.match(/for \(let attempt = 0; attempt < 2; attempt\+\+\) \{[\s\S]*?\n  \}\n/) || [""])[0];
  check("Verifikationsschleife pruefen die Schutzregeln ERNEUT, bevor sie ein zweites Mal loescht (Reihenfolge: assertUserDeletable VOR stripUserAndSideRows)",
    /assertUserDeletable\([\s\S]*?stripUserAndSideRows\(/.test(retryLoopSrc));
  check("Nur EIN Read+Write-Zyklus mit Verifikations-/Wiederholungsmuster (kein stilles Teil-Loeschen)",
    /for \(let attempt = 0; attempt < 2; attempt\+\+\) \{/.test(deleteUserFnSrc) && /Löschung konnte nicht eindeutig bestätigt werden/.test(deleteUserFnSrc));
  check("Loescht Sessions/Passworttokens/Zuweisungen NUR dieses Nutzers (Filter auf userId)",
    /stripUserAndSideRows/.test(deleteUserFnSrc));
  const stripFnSrc = (accountsSrc.match(/function stripUserAndSideRows\(store, userId\) \{[\s\S]*?\n}\n/) || [""])[0];
  check("stripUserAndSideRows ruehrt KEINE Mandatsinhalte an (kein dailyInputs/profile/llmUsage-Filter)",
    stripFnSrc.length > 20 && !/dailyInputs/.test(stripFnSrc) && !/llmUsage/.test(stripFnSrc) && !/profile/i.test(stripFnSrc));

  console.log("\n== HTTP-End-zu-Ende: echter Server, echte Loeschung ==");
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    await accounts.createUser({ email: "admin-del@example.org", name: "Admin Del", role: "admin", password: "sicher-genug-1" });
    const adminCookie = await login(port, "admin-del@example.org", "sicher-genug-1");
    const csrf = parse((await req(port, "GET", "/api/security/csrf", { headers: { Cookie: adminCookie } })).body).token;
    const adminWrite = { Cookie: adminCookie, "x-csrf-token": csrf };
    const adminMe = parse((await req(port, "GET", "/api/auth/session", { headers: { Cookie: adminCookie } })).body);
    const adminId = adminMe.user && adminMe.user.id;
    check("Admin-Session aufgeloest (id bekannt)", Boolean(adminId), JSON.stringify(adminMe));

    // --- Zwei Nutzer desselben Mandats: einer wird geloescht, einer bleibt Kontrollgruppe ---
    const politicianId = "mandat-loesch-test";
    const createU1 = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Test Nutzer Eins", email: "testnutzer1@example.org", role: "referent"
    } })).body);
    const createU2 = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Test Nutzer Zwei", email: "testnutzer2@example.org", role: "referent"
    } })).body);
    const u1Token = tokenFromUrl(createU1.inviteUrl);
    const u1SetPw = await req(port, "POST", "/api/auth/set-password", { body: { token: u1Token, password: "testpasswort-123" } });
    check("Testnutzer Eins: Passwort gesetzt, Session-Cookie erhalten", u1SetPw.status === 200 && Boolean(u1SetPw.headers["set-cookie"]));
    const u1Cookie = String(u1SetPw.headers["set-cookie"][0]).split(";")[0];

    await req(port, "POST", "/api/admin/assignments", { headers: adminWrite, body: { userId: createU1.id, politicianId } });
    await req(port, "POST", "/api/admin/assignments", { headers: adminWrite, body: { userId: createU2.id, politicianId } });
    // Zweiter, noch nicht verbrauchter Zugangslink fuer Nutzer Eins (Reset-Token) —
    // muss nach der Loeschung ebenfalls weg sein.
    const secondLink = parse((await req(port, "POST", `/api/admin/users/${createU1.id}/invite`, { headers: adminWrite, body: {} })).body);
    check("Zweiter Zugangslink fuer Nutzer Eins erstellt (Reset-Token)", Boolean(secondLink.inviteUrl), JSON.stringify(secondLink));
    const u1ResetToken = tokenFromUrl(secondLink.inviteUrl);

    // Politische Inhaltsdaten des Mandats — duerfen von der Nutzerloeschung nicht beruehrt werden.
    const dailyInput = parse((await req(port, "POST", `/api/daily-inputs?politicianId=${politicianId}`, { headers: adminWrite, body: {
      title: "Sitzungswoche-Termin", datetime: "2026-08-01T10:00", context: "Test", goal: "Test", desiredPrep: "Test"
    } })).body);
    check("Tagesinput fuer das Mandat angelegt", Boolean(dailyInput.id), JSON.stringify(dailyInput));

    // --- Schutzregel: Nicht-Administrator bekommt 403 ---
    const nonAdminDelete = await req(port, "DELETE", `/api/admin/users/${createU2.id}`, { headers: { Cookie: u1Cookie, "x-csrf-token": csrf } });
    check("Nicht-Administrator (referent) erhaelt 403 beim Loeschversuch", nonAdminDelete.status === 403, `status=${nonAdminDelete.status}`);

    // --- Schutzregel: Admin kann sich nicht selbst loeschen ---
    const selfDelete = await req(port, "DELETE", `/api/admin/users/${adminId}`, { headers: adminWrite });
    check("Admin kann sich NICHT selbst löschen (400, klare Fehlermeldung)",
      selfDelete.status === 400 && /eigene/i.test(parse(selfDelete.body).error || ""), `status=${selfDelete.status} body=${selfDelete.body}`);
    const listAfterSelfAttempt = parse((await req(port, "GET", "/api/admin/users", { headers: adminWrite })).body);
    check("Admin-Account existiert nach dem gescheiterten Selbstloeschversuch unveraendert weiter",
      listAfterSelfAttempt.some((u) => u.id === adminId));

    // --- Schutzregel: letzter verbleibender Administrator (unabhaengige Pruefung
    // direkt gegen accounts.deleteUser, da ueber HTTP nur Admins aufrufen koennen
    // und bei genau einem Administrator Aufrufer==Ziel waere — s. Root-Cause-Bericht) ---
    let lastAdminBlocked = false, lastAdminMessage = "";
    try {
      await accounts.deleteUser(adminId, "irgendeine-andere-id-als-das-ziel");
    } catch (error) {
      lastAdminBlocked = error.statusCode === 403;
      lastAdminMessage = error.publicMessage || error.message || "";
    }
    check("Letzter verbleibender Administrator kann NICHT gelöscht werden (auch mit fremdem actingUserId)",
      lastAdminBlocked && /letzte/i.test(lastAdminMessage), lastAdminMessage);

    // --- Schutzregel: ein ZWEITER Administrator ist ueber diesen Button ebenfalls
    // gesperrt (unabhaengig von der Sonderregel "letzter Administrator") ---
    const createAdmin2 = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Admin Zwei", email: "admin-zwei@example.org", role: "admin"
    } })).body);
    const otherAdminDelete = await req(port, "DELETE", `/api/admin/users/${createAdmin2.id}`, { headers: adminWrite });
    check("Ein ZWEITER Administrator ist ueber diesen Button ebenfalls nicht löschbar (403, andere Meldung als 'letzter')",
      otherAdminDelete.status === 403 && !/letzte/i.test(parse(otherAdminDelete.body).error || ""),
      `status=${otherAdminDelete.status} body=${otherAdminDelete.body}`);

    // --- TOCTOU-Fix (Security-Review, siehe Abschlussbericht): die Schutzregeln
    // muessen bei JEDEM Schreibversuch erneut gelten, nicht nur beim ersten Lesen.
    // Deterministisch simuliert (Aufruf-Zaehlung, KEIN Timing/Sleep) einen
    // parallelen Admin, dessen Rollen-Befoerderung GENAU zwischen dem ersten
    // Loesch-Schreibvorgang und der Verifikations-Lesephase landet (last-write-
    // wins des Voll-Blob-Stores lässt den Nutzer als Administrator wieder auftauchen). ---
    {
      const createRace = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
        name: "Race Nutzer", email: "race-nutzer@example.org", role: "referent"
      } })).body);
      const raceUserRaw = await accounts.getUserByIdRaw(createRace.id);
      const authFile = path.join(dataDir, "auth.json");
      const originalWriteFileSync = fs.writeFileSync;
      let interceptedFirstWrite = false;
      fs.writeFileSync = function (filePath, data, ...rest) {
        const result = originalWriteFileSync.call(fs, filePath, data, ...rest);
        if (!interceptedFirstWrite && String(filePath) === authFile) {
          interceptedFirstWrite = true;
          // Simuliert Admin B's parallele Befoerderung, deren Schreibvorgang
          // (last-write-wins) GENAU nach Admin A's erstem Loesch-Schreibvorgang
          // landet: der Nutzer taucht wieder auf, jetzt mit role:"admin".
          const resurrected = JSON.parse(data);
          resurrected.users = resurrected.users || [];
          resurrected.users.push({ ...raceUserRaw, role: "admin" });
          originalWriteFileSync.call(fs, filePath, JSON.stringify(resurrected, null, 2));
        }
        return result;
      };
      let raceBlocked = false, raceMessage = "";
      try {
        await accounts.deleteUser(createRace.id, adminId);
      } catch (error) {
        raceBlocked = error.statusCode === 403;
        raceMessage = error.publicMessage || error.message || "";
      } finally {
        fs.writeFileSync = originalWriteFileSync;
      }
      check("TOCTOU-Fix: eine waehrend der Verifikation erkannte Befoerderung zum Administrator bricht die Loeschung ab (kein stiller Erfolg)",
        raceBlocked, raceMessage);
      const afterRace = parse((await req(port, "GET", "/api/admin/users", { headers: adminWrite })).body);
      check("Der zwischenzeitlich befoerderte Nutzer bleibt nach dem abgebrochenen Loeschversuch als Administrator vollstaendig erhalten",
        afterRace.some((u) => u.id === createRace.id && u.role === "admin"));
    }

    // --- Schutzregel: manipulierte/fremde Nutzer-ID loescht kein anderes Konto ---
    const bogusDelete = await req(port, "DELETE", "/api/admin/users/user-existiert-nicht-abc123", { headers: adminWrite });
    check("Manipulierte/unbekannte Nutzer-ID -> 404, keine Loeschung", bogusDelete.status === 404, `status=${bogusDelete.status}`);
    const listAfterBogus = parse((await req(port, "GET", "/api/admin/users", { headers: adminWrite })).body);
    check("Nutzerliste nach dem 404-Versuch unveraendert (alle bisherigen Konten weiterhin vorhanden)",
      [adminId, createU1.id, createU2.id, createAdmin2.id].every((id) => listAfterBogus.some((u) => u.id === id)));

    // --- Die eigentliche Loeschung: Admin loescht Testnutzer Eins ---
    const deleteRes = await req(port, "DELETE", `/api/admin/users/${createU1.id}`, { headers: adminWrite });
    const deleteBody = parse(deleteRes.body);
    check("Admin kann normalen Testnutzer löschen (200, ok:true)", deleteRes.status === 200 && deleteBody.ok === true, `status=${deleteRes.status} body=${deleteRes.body}`);
    check("Antwort meldet entfernte Sessions/Passworttokens/Zuweisungen (>0)",
      deleteBody.removed && deleteBody.removed.sessions > 0 && deleteBody.removed.passwordTokens > 0 && deleteBody.removed.assignments > 0,
      JSON.stringify(deleteBody.removed));

    // 1. Nutzer verschwindet aus der Liste.
    const listAfterDelete = parse((await req(port, "GET", "/api/admin/users", { headers: adminWrite })).body);
    check("Nutzer verschwindet aus der Admin-Liste", !listAfterDelete.some((u) => u.id === createU1.id));
    check("Nutzer Zwei (Kontrollgruppe) bleibt unveraendert in der Liste", listAfterDelete.some((u) => u.id === createU2.id));

    // 2. Login danach unmoeglich.
    const loginAfterDelete = await req(port, "POST", "/api/auth/login", { body: { email: "testnutzer1@example.org", password: "testpasswort-123" } });
    check("Login mit der E-Mail des geloeschten Nutzers ist danach unmöglich (401)", loginAfterDelete.status === 401, `status=${loginAfterDelete.status}`);

    // 3. Sessions entfernt: die VOR der Loeschung ausgestellte Session ist ungueltig.
    const sessionAfterDelete = parse((await req(port, "GET", "/api/auth/session", { headers: { Cookie: u1Cookie } })).body);
    check("Alte Session des geloeschten Nutzers ist ungueltig (authenticated:false)", sessionAfterDelete.authenticated === false, JSON.stringify(sessionAfterDelete));
    const startAfterDelete = await req(port, "GET", "/api/app/start", { headers: { Cookie: u1Cookie } });
    check("Kein Datenzugriff mehr mit der alten Session-Cookie (401)", startAfterDelete.status === 401, `status=${startAfterDelete.status}`);

    // 4. Passworttokens entfernt: der zweite (Reset-)Link ist nach der Loeschung tot.
    const reuseResetToken = await req(port, "POST", "/api/auth/set-password", { body: { token: u1ResetToken, password: "neues-passwort-123" } });
    check("Passwort-Token des geloeschten Nutzers ist ungueltig (410)", reuseResetToken.status === 410, `status=${reuseResetToken.status}`);

    // 5. Assignments entfernt (nur Nutzer Eins — Nutzer Zwei bleibt zugewiesen).
    const assignmentsAfterDelete = parse((await req(port, "GET", "/api/admin/assignments", { headers: adminWrite })).body);
    check("Zuweisung von Nutzer Eins ist entfernt", !assignmentsAfterDelete.some((a) => a.userId === createU1.id));
    check("Zuweisung von Nutzer Zwei (selbes Mandat) bleibt unveraendert bestehen",
      assignmentsAfterDelete.some((a) => a.userId === createU2.id && a.politicianId === politicianId));

    // 6. Keine politischen Inhaltsdaten geloescht: der Tagesinput des Mandats bleibt.
    const dailyInputsAfterDelete = parse((await req(port, "GET", `/api/daily-inputs?politicianId=${politicianId}`, { headers: adminWrite })).body);
    check("Tagesinput des Mandats bleibt nach der Nutzerloeschung vollstaendig erhalten",
      Array.isArray(dailyInputsAfterDelete.inputs) && dailyInputsAfterDelete.inputs.some((entry) => entry.id === dailyInput.id));

    // Erneuter Loeschversuch derselben (nun nicht mehr existierenden) ID -> 404, kein Absturz.
    const secondDeleteAttempt = await req(port, "DELETE", `/api/admin/users/${createU1.id}`, { headers: adminWrite });
    check("Erneutes Loeschen derselben ID -> 404 (kein doppeltes Loeschen, kein Serverfehler)", secondDeleteAttempt.status === 404, `status=${secondDeleteAttempt.status}`);
  } finally {
    await new Promise((r) => server.close(r));
  }

  console.log("\n== Browser: Mobil/Desktop-Darstellung von Button + Bestaetigungsdialog ==");
  // Hinweis (Umgebungs-Einschraenkung, dokumentiert seit PR #109): der komplette
  // authentifizierte SPA-Boot (HELMUT_AUTH_MODE=accounts) laesst Chromium in dieser
  // Sandbox reproduzierbar abstuerzen ("Target crashed") — unabhaengig vom Code.
  // Deshalb wird HIER die ECHTE Render-Funktion aus client.js isoliert extrahiert
  // und mit dem ECHTEN styles.css in echtem Chromium gerendert (keine SPA-Boot-
  // Abhaengigkeit, aber echtes Markup + echtes CSS statt eines Mockups).
  const pw = loadPlaywright();
  if (!pw) {
    console.log("SKIP: Playwright nicht verfuegbar (Browser-Abschnitt uebersprungen, HTTP-Abschnitt bleibt massgeblich).");
  } else {
    const escapeHtmlSrc = (clientSrc.match(/function escapeHtml\(value\) \{[\s\S]*?\n}\n/) || [""])[0];
    const escapeAttributeSrc = (clientSrc.match(/function escapeAttribute\(value\) \{[\s\S]*?\n}\n/) || [""])[0];
    check("escapeHtml/escapeAttribute fuer die Isolations-Extraktion gefunden", escapeHtmlSrc.length > 10 && escapeAttributeSrc.length > 10);

    function renderFragment(user, confirmUserId) {
      const src = `
        ${escapeHtmlSrc}
        ${escapeAttributeSrc}
        let admUserDeleteConfirm = ${confirmUserId ? JSON.stringify({ userId: confirmUserId }) : "null"};
        ${deleteSectionSrc}
        return renderAdminUserDeleteSection(user);
      `;
      // eslint-disable-next-line no-new-func
      return new Function("user", src)(user);
    }

    const demoUser = { id: "user-demo123", name: "Erika Musterreferentin", email: "erika@example.org", role: "referent" };
    const adminUser = { id: "user-admin123", name: "Admin Beispiel", email: "admin@example.org", role: "admin" };
    const startFragment = renderFragment(demoUser, null);
    const confirmFragment = renderFragment(demoUser, demoUser.id);
    const adminFragment = renderFragment(adminUser, null);
    check("Isolierte Ausfuehrung liefert echtes Button-Markup", /Nutzer löschen/.test(startFragment));
    check("Isolierte Ausfuehrung liefert echtes Bestaetigungs-Markup mit Name/E-Mail", /Erika Musterreferentin/.test(confirmFragment) && /erika@example\.org/.test(confirmFragment));
    check("Isolierte Ausfuehrung: fuer Administratoren kein Button (leerer String)", adminFragment.trim() === "");

    const tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "helmut-del-ui-"));
    const stylesPath = path.join(root, "styles.css");
    function writePage(fragment, file) {
      fs.writeFileSync(path.join(tmpDir, file), `<!doctype html>
<html><head><meta charset="utf-8" />
<link rel="stylesheet" href="file://${stylesPath}" />
<style>body{background:#0b0f1a;padding:24px;max-width:640px;margin:0 auto;}</style>
</head><body><table><tbody>${fragment}</tbody></table></body></html>`);
    }
    writePage(`<tr><td>${startFragment}</td></tr>`, "start.html");
    writePage(`<tr><td>${confirmFragment}</td></tr>`, "confirm.html");

    const browser = await pw.chromium.launch({ args: ["--disable-dev-shm-usage", "--no-sandbox"] });
    for (const [label, width, height] of [["Desktop", 1280, 900], ["Mobil", 390, 844]]) {
      const page = await browser.newPage();
      await page.setViewportSize({ width, height });
      let crashed = false;
      page.on("crash", () => { crashed = true; });

      await page.goto(`file://${path.join(tmpDir, "start.html")}`, { waitUntil: "load", timeout: 15000 });
      const btn = page.locator(".adm-danger-btn.adm-danger-btn--ghost");
      check(`${label}: Loesch-Button ist sichtbar`, await btn.isVisible().catch(() => false));
      const btnColor = await btn.evaluate((el) => getComputedStyle(el).color).catch(() => "");
      check(`${label}: Button-Farbe nutzt den Danger-Farbton (#ff5967)`, /255, 89, 103/.test(btnColor), btnColor);
      const btnBox = await btn.boundingBox().catch(() => null);
      check(`${label}: Button hat eine ausreichend große Trefferflaeche (Höhe ≥ 30px)`, Boolean(btnBox) && btnBox.height >= 30, JSON.stringify(btnBox));
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      check(`${label}: keine horizontale Ueberbreite (scrollWidth ≤ Viewport-Breite)`, scrollWidth <= width + 1, `scrollWidth=${scrollWidth} viewport=${width}`);

      await page.goto(`file://${path.join(tmpDir, "confirm.html")}`, { waitUntil: "load", timeout: 15000 });
      const confirmText = await page.locator(".adm-danger-text").innerText().catch(() => "");
      check(`${label}: Bestaetigungsdialog zeigt Text, Name und E-Mail lesbar`,
        /Nutzer wirklich löschen\?/.test(confirmText) && /Erika Musterreferentin/.test(confirmText) && /erika@example\.org/.test(confirmText), confirmText);
      const confirmScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      check(`${label}: Bestaetigungsdialog ohne horizontale Ueberbreite`, confirmScrollWidth <= width + 1, `scrollWidth=${confirmScrollWidth} viewport=${width}`);
      check(`${label}: kein Chromium-Absturz beim Rendern der isolierten Seite`, !crashed);
      await page.close();
    }
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`\n${fail === 0 ? "ALLE GRÜN" : fail + " FEHLGESCHLAGEN"} — ${pass}/${pass + fail} Assertions`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
