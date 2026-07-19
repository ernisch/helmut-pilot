"use strict";

// Korrektur-Sprint: "Schnellstart" raus aus dem Admin-Formular "Nutzer anlegen".
// Muster wie invite-flow-test.js: echter HTTP-Server (Loopback), echter Login,
// lokales Backend, Store-Hermetik. KEIN Netz nach aussen, KEINE KI.
//
// Geprueft:
//  - UI-Quelltext: das Formular zeigt NUR Vorname/Nachname/E-Mail/Rolle + Button
//    "Nutzer einladen" — kein Passwortfeld, kein Schnellstart-Block, keine
//    verwaisten Schnellstart-CSS-Klassen mehr
//  - Der Submit-Handler sendet keine Schnellstart-Felder mehr (party/committee/
//    constituency/state/focusTopics tauchen im Handler nicht mehr auf)
//  - Trotzdem funktioniert die Einladung end-to-end unveraendert: Status
//    "eingeladen", inviteUrl korrekt, Login gesperrt bis Passwort gesetzt
//  - Server-Route bleibt kompatibel: nimmt Schnellstart-Felder von ANDEREN
//    Aufrufern (API-Altpfade) weiterhin optional an (Beweis: gleiches Verhalten
//    wie vor dem Sprint, hier direkt gegen den Server getestet)
//  - Die politischen Profilfelder (Partei/Ausschuss/Wahlkreis/Bundesland/
//    Schwerpunktthemen) bleiben an ihren eigentlichen Stellen verfuegbar:
//    Onboarding-Formular und Profilbearbeitung (renderProfileSettingsView)

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
    for (const f of fs.readdirSync(dataDir)) {
      if (!snapshots.has(f)) fs.unlinkSync(path.join(dataDir, f));
    }
    for (const [f, buf] of snapshots) fs.writeFileSync(path.join(dataDir, f), buf);
  } catch (_) { /* best effort */ }
}
process.on("exit", restoreStore);

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

function parse(body) {
  try { return JSON.parse(body); } catch (_) { return {}; }
}

async function login(port, email, password) {
  const res = await req(port, "POST", "/api/auth/login", { body: { email, password } });
  if (res.status !== 200) throw new Error(`Login ${email} fehlgeschlagen: ${res.status} ${res.body.slice(0, 200)}`);
  return String(res.headers["set-cookie"][0]).split(";")[0];
}

(async () => {
  console.log("== UI-Quelltext: Formular zeigt nur Vorname/Nachname/E-Mail/Rolle ==");
  const clientSrc = fs.readFileSync(path.join(root, "client.js"), "utf8");
  const formMatch = clientSrc.match(/<form class="admin-create-form" id="createUserForm">[\s\S]*?<\/form>/);
  check("createUserForm im Quelltext gefunden", Boolean(formMatch));
  const formHtml = formMatch ? formMatch[0] : "";

  check("Vorname-Feld vorhanden", /name="firstName"/.test(formHtml));
  check("Nachname-Feld vorhanden", /name="lastName"/.test(formHtml));
  check("E-Mail-Feld vorhanden", /name="email"/.test(formHtml));
  check("Rolle-Feld vorhanden", /name="role"/.test(formHtml));
  check("Button 'Nutzer einladen' vorhanden", /Nutzer einladen/.test(formHtml));

  check("KEIN Passwortfeld im Formular", !/type="password"/.test(formHtml) && !/name="password"/.test(formHtml));
  check("KEIN Schnellstart-Block im Formular", !/admin-quickstart/.test(formHtml) && !/Schnellstart/.test(formHtml));
  check("KEIN Partei-Feld im Formular", !/name="party"/.test(formHtml));
  check("KEIN Ausschuss-Feld im Formular", !/name="committee"/.test(formHtml));
  check("KEIN Wahlkreis-Feld im Formular", !/name="constituency"/.test(formHtml));
  check("KEIN Bundesland-Feld im Formular", !/name="state"/.test(formHtml));
  check("KEIN Schwerpunktthemen-Feld im Formular", !/name="focusTopics"/.test(formHtml));

  // Genau 4 <input>/<select> je einmal, keine weiteren Formularfelder.
  const fieldNames = [...formHtml.matchAll(/name="([a-zA-Z]+)"/g)].map((m) => m[1]);
  check("genau 4 Formularfelder (firstName, lastName, email, role)",
    fieldNames.length === 4 && new Set(fieldNames).size === 4, JSON.stringify(fieldNames));

  console.log("== Verwaiste Schnellstart-CSS-Klassen entfernt ==");
  const stylesSrc = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  check("keine .admin-quickstart-Regeln mehr in styles.css", !/admin-quickstart/.test(stylesSrc));

  console.log("== Submit-Handler sendet keine Schnellstart-Felder mehr ==");
  const handlerMatch = clientSrc.match(/const createUserForm = app\.querySelector\("#createUserForm"\);[\s\S]*?\n  }\n/);
  const handlerSrc = handlerMatch ? handlerMatch[0] : "";
  check("Handler-Block gefunden", Boolean(handlerMatch));
  check("Handler sendet party NICHT mehr", !/body\.party/.test(handlerSrc));
  check("Handler sendet committee NICHT mehr", !/body\.committee/.test(handlerSrc));
  check("Handler sendet constituency NICHT mehr", !/body\.constituency/.test(handlerSrc));
  check("Handler sendet state NICHT mehr", !/body\.state/.test(handlerSrc));
  check("Handler sendet focusTopics NICHT mehr", !/body\.focusTopics|fd\.get\("focusTopics"\)/.test(handlerSrc));
  check("Handler baut weiterhin fullName aus firstName+lastName", /fd\.get\("firstName"\)/.test(handlerSrc) && /fd\.get\("lastName"\)/.test(handlerSrc));

  console.log("== Bestehende Profilfelder bleiben an ihren eigentlichen Stellen (Erstkonfiguration) ==");
  // Die politischen Profilfelder werden NICHT im Admin-Anlegen-Formular, sondern in
  // der Erstkonfiguration (Onboarding-Flow, .ho-* / data-onb-*) erhoben. Nach dem
  // Umbau auf den 14-Schritt-Flow prüfen wir dieselbe Absicht gegen die neue Markup.
  check("Erstkonfiguration erhebt weiterhin Partei", /onbSelect\("party"/.test(clientSrc));
  check("Erstkonfiguration erhebt weiterhin Ausschuss", /onbRow\("committees"/.test(clientSrc));
  check("Erstkonfiguration erhebt weiterhin Wahlkreis", /data-onb-input="constituency"/.test(clientSrc));
  check("Erstkonfiguration erhebt weiterhin Bundesland", /onbSelect\("state"/.test(clientSrc));
  check("renderProfileSettingsView existiert weiterhin (Profilbearbeitung unangetastet)", /function renderProfileSettingsView\(\)/.test(clientSrc));

  console.log("== End-to-End: Einladung funktioniert weiterhin unveraendert (echter HTTP-Flow) ==");
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    await accounts.createUser({ email: "admin-qs@example.org", name: "Admin QS", role: "admin", password: "sicher-genug-1" });
    const adminCookie = await login(port, "admin-qs@example.org", "sicher-genug-1");
    const csrf = parse((await req(port, "GET", "/api/security/csrf", { headers: { Cookie: adminCookie } })).body).token;
    const adminWrite = { Cookie: adminCookie, "x-csrf-token": csrf };

    // Payload exakt wie der bereinigte Handler ihn jetzt baut: nur name/email/role.
    const create = await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Nina Neuling", email: "nina@example.org", role: "abgeordneter"
    } });
    const created = parse(create.body);
    check("Einladung ohne Schnellstart-Felder -> 200", create.status === 200, `status=${create.status} ${create.body.slice(0, 150)}`);
    check("Status 'eingeladen' bleibt erhalten", created.status === "eingeladen", `status=${created.status}`);
    check("inviteUrl wird weiterhin korrekt erstellt", String(created.inviteUrl || "").includes("/passwort-setzen?token="), `url=${created.inviteUrl}`);
    check("kein Profil-Schnellstart ungewollt ausgeloest (kein Absturz, sauberer Response)", !("error" in created));

    const earlyLogin = await req(port, "POST", "/api/auth/login", { body: { email: "nina@example.org", password: "irgendwas-123" } });
    check("Login vor Passwort-Setzen weiterhin gesperrt -> 401", earlyLogin.status === 401, `status=${earlyLogin.status}`);

    // Serverkompatibilitaet (Task-Vorgabe #6): ANDERE Aufrufer duerfen Schnellstart-
    // Felder weiterhin optional mitsenden — das Formular sendet sie nur nicht mehr.
    const createWithLegacyFields = await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Lisa Altpfad", email: "lisa@example.org", role: "abgeordneter",
      party: "SPD", committee: "Gesundheit", constituency: "Köln I", state: "NRW", focusTopics: ["Rente"]
    } });
    check("Server nimmt Schnellstart-Felder von anderen Aufrufern weiterhin an -> 200",
      createWithLegacyFields.status === 200, `status=${createWithLegacyFields.status} ${createWithLegacyFields.body.slice(0, 150)}`);
    const legacyProfile = parse((await req(port, "GET", `/api/admin/profile/${encodeURIComponent(parse(createWithLegacyFields.body).politicianId)}`, { headers: { Cookie: adminCookie } })).body);
    check("Server schreibt die mitgesendeten Schnellstart-Felder weiterhin ins Profil",
      legacyProfile.profile && legacyProfile.profile.party === "SPD" && legacyProfile.profile.committee === "Gesundheit",
      JSON.stringify(legacyProfile.profile || {}));
  } finally {
    await new Promise((r) => server.close(r));
  }

  console.log(`\n${fail === 0 ? "ALLE GRÜN" : fail + " FEHLGESCHLAGEN"} — ${pass}/${pass + fail} Assertions`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
