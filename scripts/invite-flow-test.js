"use strict";

// Invite-/Passwort-Flow-Test (Umsetzungsnotiz §6, P0 Zugang/Sicherheit).
// Muster wie admin-neue-routen-test.js: echter HTTP-Server (Loopback), echter
// Login, lokales Backend, Store-Hermetik. KEIN Netz nach aussen, KEINE KI.
//
// Geprueft:
//  - Admin legt Nutzer OHNE Passwort an -> Status "eingeladen", inviteUrl,
//    ehrlicher mail.sent=false (kein Mail-Dienst konfiguriert)
//  - Login ist gesperrt, bis das Passwort per Token gesetzt wurde
//  - /passwort-setzen ist oeffentlich; Token-Check-API minimal (kein PII-Leak)
//  - set-password: schwaches Passwort 400, gueltig 200 + Session, Token einmalig
//  - abgelaufene/verbrauchte Tokens -> 410 bzw. valid:false
//  - request-reset: immer 200 generisch (keine User-Enumeration), Interim-Link
//    NUR fuer den eingeloggten Besitzer der Adresse
//  - Admin-Zugangslink: invite fuer Konten ohne Passwort, reset fuer Konten mit
//  - /api/app/start traegt die echte Build-Version (§9)
//  - keine passwordHash/passwordSalt/tokenHash in Antworten

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
const storage = require("../lib/helmut/storage");

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

function parse(body) {
  try { return JSON.parse(body); } catch (_) { return {}; }
}

async function login(port, email, password) {
  const res = await req(port, "POST", "/api/auth/login", { body: { email, password } });
  if (res.status !== 200) throw new Error(`Login ${email} fehlgeschlagen: ${res.status} ${res.body.slice(0, 200)}`);
  return String(res.headers["set-cookie"][0]).split(";")[0];
}

function tokenFromUrl(inviteUrl) {
  return new URL(String(inviteUrl)).searchParams.get("token") || "";
}

(async () => {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    await accounts.createUser({ email: "admin-inv@example.org", name: "Admin Inv", role: "admin", password: "sicher-genug-1" });
    const adminCookie = await login(port, "admin-inv@example.org", "sicher-genug-1");
    const csrf = parse((await req(port, "GET", "/api/security/csrf", { headers: { Cookie: adminCookie } })).body).token;
    const adminWrite = { Cookie: adminCookie, "x-csrf-token": csrf };

    // A) Nutzer OHNE Passwort anlegen (Invite-Flow).
    const create = await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Eva Eingeladen", email: "eva@example.org", role: "abgeordneter", party: "SPD"
    } });
    const created = parse(create.body);
    check("A Anlage ohne Passwort -> 200", create.status === 200, `status=${create.status} ${create.body.slice(0, 150)}`);
    check("A Status ist 'eingeladen'", created.status === "eingeladen", `status=${created.status}`);
    check("A inviteUrl zeigt auf /passwort-setzen?token=…", String(created.inviteUrl || "").includes("/passwort-setzen?token="), `url=${created.inviteUrl}`);
    check("A Mail-Versand ehrlich nicht konfiguriert (sent=false)", created.mail && created.mail.sent === false, JSON.stringify(created.mail));
    check("A keine Passwort-/Token-Hashes in der Antwort", !/passwordHash|passwordSalt|tokenHash/.test(create.body));

    // B) Login gesperrt, solange kein Passwort gesetzt ist.
    const earlyLogin = await req(port, "POST", "/api/auth/login", { body: { email: "eva@example.org", password: "irgendwas-123" } });
    check("B Login vor Passwort-Setzen -> 401", earlyLogin.status === 401, `status=${earlyLogin.status}`);

    // C) Oeffentliche Seite + Token-Check.
    const page = await req(port, "GET", "/passwort-setzen?token=egal");
    check("C /passwort-setzen oeffentlich -> 200 HTML", page.status === 200 && /passwort/i.test(page.body), `status=${page.status}`);
    const inviteToken = tokenFromUrl(created.inviteUrl);
    const tokenCheck = parse((await req(port, "GET", `/api/auth/password-token?token=${encodeURIComponent(inviteToken)}`)).body);
    check("C Token-Check: gueltig + Zweck invite", tokenCheck.valid === true && tokenCheck.purpose === "invite", JSON.stringify(tokenCheck));
    check("C Token-Check leakt keine PII (keine E-Mail/kein Name)", !/eva@example.org|Eingeladen/.test(JSON.stringify(tokenCheck)));
    const badCheck = parse((await req(port, "GET", "/api/auth/password-token?token=unbekannt")).body);
    check("C unbekanntes Token -> valid:false", badCheck.valid === false);

    // D) Passwort setzen: schwach -> 400, gueltig -> 200 + Session, einmalig.
    const weak = await req(port, "POST", "/api/auth/set-password", { body: { token: inviteToken, password: "kurz" } });
    check("D schwaches Passwort -> 400", weak.status === 400, `status=${weak.status}`);
    const set = await req(port, "POST", "/api/auth/set-password", { body: { token: inviteToken, password: "eva-passwort-1" } });
    const setJson = parse(set.body);
    check("D gueltiges Passwort -> 200 + Session-Cookie", set.status === 200 && Boolean(set.headers["set-cookie"]), `status=${set.status}`);
    // publicUser() ist bewusst minimal (kein status-Feld) — active reicht hier;
    // der Status "aktiv" wird unten in F ueber die Admin-Uebersicht geprueft.
    check("D Nutzer danach aktiv", setJson.user && setJson.user.active === true, JSON.stringify(setJson.user || {}));
    const evaCookie = String((set.headers["set-cookie"] || [""])[0]).split(";")[0];
    const reuse = await req(port, "POST", "/api/auth/set-password", { body: { token: inviteToken, password: "zweiter-versuch-1" } });
    check("D Token ist einmalig -> zweite Nutzung 410", reuse.status === 410, `status=${reuse.status}`);
    const usedCheck = parse((await req(port, "GET", `/api/auth/password-token?token=${encodeURIComponent(inviteToken)}`)).body);
    check("D verbrauchtes Token -> valid:false", usedCheck.valid === false);
    const evaLogin = await req(port, "POST", "/api/auth/login", { body: { email: "eva@example.org", password: "eva-passwort-1" } });
    check("D Login mit gesetztem Passwort -> 200", evaLogin.status === 200, `status=${evaLogin.status}`);
    const audit = parse((await req(port, "GET", "/api/admin/audit?limit=50", { headers: { Cookie: adminCookie } })).body);
    check("D Audit traegt password.set", Array.isArray(audit.auditEvents) && audit.auditEvents.some((e) => e.action === "password.set"));

    // E) Echte Build-Version im App-Start (§9).
    const start = await req(port, "GET", "/api/app/start", { headers: { Cookie: evaCookie } });
    const startJson = parse(start.body);
    check("E /api/app/start -> 200 fuer neue Abgeordnete", start.status === 200, `status=${start.status}`);
    check("E App-Start traegt version = ASSET_VERSION", startJson.version === handler.__ASSET_VERSION(), `version=${startJson.version}`);

    // F) Admin-Liste: Einladungs-Metadaten nur fuer offene Einladungen.
    const create2 = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Otto Offen", email: "otto@example.org", role: "demo"
    } })).body);
    const overview = parse((await req(port, "GET", "/api/admin/overview", { headers: { Cookie: adminCookie } })).body);
    const ottoRow = (overview.users || []).find((u) => u.email === "otto@example.org");
    const evaRow = (overview.users || []).find((u) => u.email === "eva@example.org");
    check("F Overview: offene Einladung traegt invite.expiresAt", ottoRow && ottoRow.invite && typeof ottoRow.invite.expiresAt === "string", JSON.stringify(ottoRow && ottoRow.invite));
    check("F Overview: eingeloester Nutzer ohne invite-Metadaten", evaRow && evaRow.invite === null);
    check("F Overview: Status nach Passwort-Setzen 'aktiv'", evaRow && evaRow.status === "aktiv", `status=${evaRow && evaRow.status}`);
    check("F Overview leakt keine Hashes", !/passwordHash|passwordSalt|tokenHash/.test(JSON.stringify(overview.users || [])));

    // G) "Einladung erneut senden": neuer Link invalidiert den alten.
    const firstOttoToken = tokenFromUrl(create2.inviteUrl);
    const resend = parse((await req(port, "POST", `/api/admin/users/${encodeURIComponent(create2.id)}/invite`, { headers: adminWrite, body: {} })).body);
    check("G erneut senden -> purpose invite + neuer Link", resend.purpose === "invite" && Boolean(resend.inviteUrl), JSON.stringify(resend));
    const oldCheck = parse((await req(port, "GET", `/api/auth/password-token?token=${encodeURIComponent(firstOttoToken)}`)).body);
    check("G alter Link danach ungueltig", oldCheck.valid === false);

    // H) Zugangslink fuer Konto MIT Passwort -> Reset-Link (Admin fasst nie ein Passwort an).
    const evaId = created.id;
    const resetLink = parse((await req(port, "POST", `/api/admin/users/${encodeURIComponent(evaId)}/invite`, { headers: adminWrite, body: {} })).body);
    check("H Konto mit Passwort -> purpose reset", resetLink.purpose === "reset" && Boolean(resetLink.inviteUrl), JSON.stringify(resetLink));
    const resetToken = tokenFromUrl(resetLink.inviteUrl);
    const resetSet = await req(port, "POST", "/api/auth/set-password", { body: { token: resetToken, password: "eva-neu-passwort-1" } });
    check("H Reset-Link setzt neues Passwort -> 200", resetSet.status === 200, `status=${resetSet.status}`);
    const oldPw = await req(port, "POST", "/api/auth/login", { body: { email: "eva@example.org", password: "eva-passwort-1" } });
    const newPw = await req(port, "POST", "/api/auth/login", { body: { email: "eva@example.org", password: "eva-neu-passwort-1" } });
    check("H altes Passwort verworfen, neues gilt", oldPw.status === 401 && newPw.status === 200, `alt=${oldPw.status} neu=${newPw.status}`);
    // Review-Fix: Ein Passwort-Reset muss den bisherigen Sessioninhaber aussperren
    // (gestohlene/geteilte Session) — die Session aus Abschnitt D ist jetzt tot.
    const oldSession = parse((await req(port, "GET", "/api/auth/session", { headers: { Cookie: evaCookie } })).body);
    check("H Alt-Session nach Passwort-Reset ausgesperrt", oldSession.authenticated === false, JSON.stringify(oldSession));
    // Review-Fix (§6): Der Admin fasst nie ein Passwort an — der alte PATCH-Weg ist zu.
    const patchPw = await req(port, "PATCH", `/api/admin/users/${encodeURIComponent(evaId)}`, { headers: adminWrite, body: { password: "admin-setzt-was-1" } });
    check("H admin-seitiges Passwort-Setzen abgelehnt (400)", patchPw.status === 400, `status=${patchPw.status}`);
    // Review-Fix: System-Status "eingeladen" ist nicht manuell setzbar.
    const patchStatus = await req(port, "PATCH", `/api/admin/users/${encodeURIComponent(evaId)}`, { headers: adminWrite, body: { status: "eingeladen" } });
    check("H Status 'eingeladen' manuell -> 400", patchStatus.status === 400, `status=${patchStatus.status}`);

    // I) request-reset: keine User-Enumeration; Interim-Link nur fuer den Besitzer.
    const anonKnown = await req(port, "POST", "/api/auth/request-reset", { body: { email: "eva@example.org" } });
    const anonUnknown = await req(port, "POST", "/api/auth/request-reset", { body: { email: "gibtsnicht@example.org" } });
    check("I anonym bekannte Adresse -> 200 ohne resetUrl", anonKnown.status === 200 && !/resetUrl/.test(anonKnown.body), anonKnown.body.slice(0, 120));
    check("I anonym unbekannte Adresse -> identische generische Antwort", anonUnknown.status === 200 && anonUnknown.body === anonKnown.body);
    const evaCookie2 = String((newPw.headers["set-cookie"] || [""])[0]).split(";")[0];
    const own = parse((await req(port, "POST", "/api/auth/request-reset", { headers: { Cookie: evaCookie2 }, body: { email: "eva@example.org" } })).body);
    check("I eingeloggter Besitzer bekommt Interim-resetUrl", String(own.resetUrl || "").includes("/passwort-setzen?token="), JSON.stringify(own));

    // I2) Review-Fix: Solange kein Mail-Dienst existiert, darf ein ANONYMER
    // request-reset den einzigen Zustellweg (kopierter Invite-Link) nicht zerstoeren.
    const create3 = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Karl Kopierlink", email: "karl@example.org", role: "demo"
    } })).body);
    const karlToken = tokenFromUrl(create3.inviteUrl);
    await req(port, "POST", "/api/auth/request-reset", { body: { email: "karl@example.org" } });
    const karlCheck = parse((await req(port, "GET", `/api/auth/password-token?token=${encodeURIComponent(karlToken)}`)).body);
    check("I2 anonymer request-reset laesst den kopierten Invite-Link intakt", karlCheck.valid === true, JSON.stringify(karlCheck));

    // J) Abgelaufenes Token -> ehrlich abgelaufen (410 / valid:false).
    const expiredIssue = await accounts.createPasswordToken(create2.id, "invite");
    const authStore = await storage.readAuthStore();
    const entry = (authStore.passwordTokens || []).find((t) => t.userId === create2.id && !t.usedAt);
    entry.expiresAt = new Date(Date.now() - 1000).toISOString();
    await storage.writeAuthStore(authStore);
    const expiredCheck = parse((await req(port, "GET", `/api/auth/password-token?token=${encodeURIComponent(expiredIssue.token)}`)).body);
    check("J abgelaufenes Token -> valid:false", expiredCheck.valid === false);
    const expiredSet = await req(port, "POST", "/api/auth/set-password", { body: { token: expiredIssue.token, password: "trotzdem-lang-1" } });
    check("J abgelaufenes Token -> set-password 410", expiredSet.status === 410, `status=${expiredSet.status}`);

    // K) Admin-Seed-Pfad unveraendert: createUser MIT Passwort bleibt sofort aktiv.
    const withPw = await accounts.createUser({ email: "aktiv@example.org", name: "Aktiv Sofort", role: "demo", password: "sicher-genug-1" });
    check("K createUser mit Passwort -> Status aktiv", withPw.status === "aktiv");
    const withPwLogin = await req(port, "POST", "/api/auth/login", { body: { email: "aktiv@example.org", password: "sicher-genug-1" } });
    check("K Login sofort moeglich", withPwLogin.status === 200, `status=${withPwLogin.status}`);
  } finally {
    await new Promise((r) => server.close(r));
  }

  console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Invite-Flow-Assertions`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
