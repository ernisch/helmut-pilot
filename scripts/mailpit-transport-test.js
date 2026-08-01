"use strict";

// Mailpit-Transport-Test — OFFLINE, ohne echtes Mailpit, ohne Netz nach aussen.
// =============================================================================================
// Prueft den lokalen Mailpit-Transport (lib/helmut/mail-transport.js) und seine Verdrahtung in
// den bestehenden Einladungs-/Reset-Ablauf. Der Auftrag verlangt genau elf Nachweise; sie sind
// unten als Abschnitte A–K einzeln ausgewiesen:
//
//   A  Einladungsvorlage
//   B  Passwort-Reset-Vorlage
//   C  Standardzustand OHNE Mailpit-Konfiguration (bisheriges Verhalten unveraendert)
//   D  Erfolgreiche lokale Uebergabe mit kontrolliertem Testtransport
//   E  Nicht erreichbares Mailpit
//   F  Zeitabbruch
//   G  Ablehnung externer Hosts (und weiterer unzulaessiger Ziele)
//   H  Ablehnung in Production
//   I  Ablehnung in Vercel-Umgebungen
//   J  Ehrliches sent:false bei JEDEM verweigerten oder fehlgeschlagenen Versand
//   K  Konto- und Token-Verhalten unveraendert (echter HTTP-Ablauf gegen ein Stub-Mailpit)
//
// Abschnitt K startet einen ECHTEN Helmut-Server auf Loopback und ein Stub-Mailpit, das den
// Sendevertrag von Mailpit v1.30.6 nachbildet (POST /api/v1/send -> {"ID":"…"}). Damit ist die
// vollstaendige Kette Admin -> Token -> Vorlage -> Transport -> Postfach offline pruefbar; der
// echte Nachweis gegen das installierte Mailpit ist scripts/mailpit-smoke.js.
//
// KEINE echten Adressen: ausschliesslich reservierte Domains (example.org / .test, RFC 2606).

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
// Ausgangszustand: KEIN Transport konfiguriert (Abschnitt C prueft genau das).
delete process.env.HELMUT_MAIL_TRANSPORT;
delete process.env.HELMUT_MAILPIT_URL;
delete process.env.HELMUT_MAIL_FROM;

// Store-Hermetik: lokale Daten sichern und am Ende wiederherstellen (Muster invite-flow-test).
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

const transport = require("../lib/helmut/mail-transport");
const inviteMail = require("../lib/helmut/invite-mail");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

// Reservierte Testwerte — nie echte Adressen (Auftrag: nur reservierte Domains).
// Erkennt echte HTML-Auszeichnung. Bewusst NICHT "alles in spitzen Klammern" — die
// Fusszeile traegt zulaessigerweise eine Adresse der Form Name <adresse@example.org>.
const HTML_TAG = /<\/?(?:a|p|br|div|span|html|body|table|tr|td|img|strong|em|h[1-6])\b/i;
const TEST_ABSENDER = "Helmut <noreply@helmut.test>";
const TEST_EMPFAENGER = "eva@example.org";
const LOOPBACK_ENV = Object.freeze({ HELMUT_MAIL_TRANSPORT: "mailpit", HELMUT_MAILPIT_URL: "http://127.0.0.1:8025" });

// Kontrollierter Testtransport: zaehlt Aufrufe, merkt sich die letzte Anfrage und
// antwortet nach Vorgabe. So laesst sich auch beweisen, dass ein VERWEIGERTER Versand
// gar nicht erst zu einem Netzaufruf fuehrt.
function testFetch(antwort) {
  const zustand = { aufrufe: 0, letzteUrl: null, letzteOptionen: null };
  const fn = async (url, optionen) => {
    zustand.aufrufe += 1;
    zustand.letzteUrl = String(url);
    zustand.letzteOptionen = optionen;
    if (typeof antwort === "function") return antwort(url, optionen);
    return antwort;
  };
  fn.zustand = zustand;
  return fn;
}

function jsonAntwort(status, rumpf) {
  return { status, text: async () => (typeof rumpf === "string" ? rumpf : JSON.stringify(rumpf)) };
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

function tokenFromText(text) {
  const treffer = String(text || "").match(/\/passwort-setzen\?token=([^\s]+)/);
  return treffer ? decodeURIComponent(treffer[1]) : "";
}

(async () => {
  // ── A · Einladungsvorlage ──────────────────────────────────────────────────────────────
  process.env.HELMUT_MAIL_FROM = TEST_ABSENDER;
  const invite = inviteMail.buildInviteMail({ name: "Eva Eingeladen", inviteUrl: "http://127.0.0.1:3000/passwort-setzen?token=abc" });
  check("A Einladung: Betreff (neu seit dem HTML-Mail-Sprint)", invite.subject === "Deine Einladung zu Helmut", invite.subject);
  check("A Einladung: Absender aus HELMUT_MAIL_FROM", invite.from === TEST_ABSENDER, invite.from);
  check("A Einladung: Anrede mit Vornamen", invite.text.startsWith("Hallo Eva,"), invite.text.slice(0, 30));
  check("A Einladung: enthaelt genau einen Link", (invite.text.match(/passwort-setzen\?token=/g) || []).length === 1);
  // Frueher stand hier "7 Tage gültig". Diese Zahl war nur der Default von
  // HELMUT_INVITE_TOKEN_TTL_MS und wurde falsch, sobald jemand die Variable setzt —
  // deshalb nennt die Mail die Befristung jetzt ohne Zahl (scripts/mail-vorlagen-test.js).
  check("A Einladung: nennt die Befristung ohne erfundene Zahl",
    /zeitlich begrenzt/.test(invite.text) && !/\b\d+\s*(Tage?|Stunden?)\b/.test(invite.text));
  // Seit dem HTML-Mail-Sprint gibt es BEIDE Fassungen. Die Textfassung bleibt reiner Text.
  check("A Einladung: Textfassung ist reiner Text", !HTML_TAG.test(invite.text));
  check("A Einladung: HTML-Fassung vorhanden und vollstaendiges Dokument",
    typeof invite.html === "string" && invite.html.startsWith("<!doctype html>"));
  check("A Einladung: Fusszeile mit Absender und Impressum", invite.text.includes("Impressum:") && invite.text.includes(TEST_ABSENDER));
  const inviteOhneName = inviteMail.buildInviteMail({ inviteUrl: "http://127.0.0.1:3000/passwort-setzen?token=abc" });
  check("A Einladung ohne Namen: neutrale Anrede", inviteOhneName.text.startsWith("Hallo,"));

  // ── B · Passwort-Reset-Vorlage ─────────────────────────────────────────────────────────
  const reset = inviteMail.buildResetMail({ name: "Eva Eingeladen", resetUrl: "http://127.0.0.1:3000/passwort-setzen?token=xyz" });
  check("B Reset: Betreff (neu seit dem HTML-Mail-Sprint)", reset.subject === "Neues Passwort für Helmut festlegen", reset.subject);
  check("B Betreffzeilen von Einladung und Reset sind klar unterscheidbar", invite.subject !== reset.subject);
  check("B Reset: enthaelt genau einen Link", (reset.text.match(/passwort-setzen\?token=/g) || []).length === 1);
  check("B Reset: nennt die Befristung ohne erfundene Zahl",
    /zeitlich begrenzt/.test(reset.text) && !/\b\d+\s*(Tage?|Stunden?)\b/.test(reset.text));
  check("B Reset: Textfassung ist reiner Text", !HTML_TAG.test(reset.text));
  check("B Reset: HTML-Fassung vorhanden und vollstaendiges Dokument",
    typeof reset.html === "string" && reset.html.startsWith("<!doctype html>"));
  check("B Reset: Texte von Einladung und Reset sind verschieden", reset.text !== invite.text);

  // Absender-Standard bleibt der Platzhalter, solange nichts konfiguriert ist.
  delete process.env.HELMUT_MAIL_FROM;
  check("B Absender-Standard unveraendert (Platzhalter)", inviteMail.buildInviteMail({}).from === "Helmut <no-reply@…de>",
    inviteMail.buildInviteMail({}).from);
  process.env.HELMUT_MAIL_FROM = TEST_ABSENDER;

  // ── C · Standardzustand OHNE Mailpit-Konfiguration ─────────────────────────────────────
  const leer = {};
  check("C ohne Konfiguration: Transport inaktiv", transport.transportKonfiguration(leer).aktiv === false);
  check("C ohne Konfiguration: Grund unveraendert 'mail-versand-nicht-konfiguriert'",
    transport.transportKonfiguration(leer).grund === "mail-versand-nicht-konfiguriert");
  check("C isMailConfigured() ohne Konfiguration false", inviteMail.isMailConfigured(leer) === false);
  const stillFetch = testFetch(jsonAntwort(200, { ID: "darf-nicht-passieren" }));
  const ausgangsstatus = await inviteMail.sendAccessMail(
    { to: TEST_EMPFAENGER, ...invite }, { env: leer, fetchImpl: stillFetch });
  check("C ohne Konfiguration: sendAccessMail liefert exakt den bisherigen Status",
    ausgangsstatus.sent === false && ausgangsstatus.reason === "mail-versand-nicht-konfiguriert", JSON.stringify(ausgangsstatus));
  check("C ohne Konfiguration: kein einziger Netzaufruf", stillFetch.zustand.aufrufe === 0);
  check("C unbekannter Transportname bleibt inaktiv",
    transport.transportKonfiguration({ HELMUT_MAIL_TRANSPORT: "smtp" }).aktiv === false);
  check("C Transportname wird streng verglichen (kein Praefix-Treffer)",
    transport.transportKonfiguration({ HELMUT_MAIL_TRANSPORT: "mailpit-extern" }).aktiv === false);
  check("C Transportname unempfindlich gegen Schreibweise/Leerraum",
    transport.transportKonfiguration({ HELMUT_MAIL_TRANSPORT: "  MailPit " }).aktiv === true);

  // ── D · Erfolgreiche lokale Uebergabe (kontrollierter Testtransport) ───────────────────
  const okFetch = testFetch(jsonAntwort(200, { ID: "01HZTESTID" }));
  const erfolg = await inviteMail.sendAccessMail(
    { to: TEST_EMPFAENGER, ...invite }, { env: { ...LOOPBACK_ENV, HELMUT_MAIL_FROM: TEST_ABSENDER }, fetchImpl: okFetch });
  check("D Uebergabe erfolgreich -> sent:true", erfolg.sent === true, JSON.stringify(erfolg));
  check("D Transport wird benannt", erfolg.transport === "mailpit", JSON.stringify(erfolg));
  check("D Zieladresse ist der Mailpit-Sendeendpunkt", okFetch.zustand.letzteUrl === "http://127.0.0.1:8025/api/v1/send", okFetch.zustand.letzteUrl);
  check("D Methode POST + JSON-Kopfzeile", okFetch.zustand.letzteOptionen.method === "POST"
    && okFetch.zustand.letzteOptionen.headers["Content-Type"] === "application/json");
  check("D Weiterleitungen sind unterbunden", okFetch.zustand.letzteOptionen.redirect === "error");
  check("D Anfrage traegt ein Abbruchsignal", Boolean(okFetch.zustand.letzteOptionen.signal));
  const rumpf = JSON.parse(okFetch.zustand.letzteOptionen.body);
  check("D Rumpf: Absender nach Mailpit-Vertrag {Name,Email}",
    rumpf.From && rumpf.From.Email === "noreply@helmut.test" && rumpf.From.Name === "Helmut", JSON.stringify(rumpf.From));
  check("D Rumpf: genau ein Empfaenger", Array.isArray(rumpf.To) && rumpf.To.length === 1 && rumpf.To[0].Email === TEST_EMPFAENGER);
  check("D Rumpf: Betreff der Einladung", rumpf.Subject === "Deine Einladung zu Helmut");
  check("D Rumpf: Text enthaelt den Einladungslink", String(rumpf.Text).includes("/passwort-setzen?token=abc"));
  // Mailpit-Sendevertrag fuer mehrteilige Nachrichten: Feld `HTML` neben `Text`.
  check("D Rumpf: HTML-Teil im Mailpit-Feld HTML", typeof rumpf.HTML === "string" && rumpf.HTML === invite.html);
  check("D Rumpf: ohne HTML-Teil bleibt der Schluessel weg (Rueckwaertskompatibilitaet)",
    JSON.parse((await (async () => { const f = testFetch(jsonAntwort(200, { ID: "x" }));
      await transport.sendeMailpit({ from: TEST_ABSENDER, to: TEST_EMPFAENGER, subject: "S", text: "T" },
        { env: LOOPBACK_ENV, fetchImpl: f }); return f.zustand.letzteOptionen.body; })())).HTML === undefined);
  check("D Standard-Ziel ohne HELMUT_MAILPIT_URL ist 127.0.0.1:8025",
    transport.transportKonfiguration({ HELMUT_MAIL_TRANSPORT: "mailpit" }).sendeUrl === "http://127.0.0.1:8025/api/v1/send");
  for (const [name, url] of [["localhost", "http://localhost:8025"], ["IPv6-Loopback", "http://[::1]:8025"], ["Webroot", "http://127.0.0.1:8025/mail/"]]) {
    check(`D Loopback-Ziel akzeptiert: ${name}`,
      transport.transportKonfiguration({ HELMUT_MAIL_TRANSPORT: "mailpit", HELMUT_MAILPIT_URL: url }).aktiv === true, url);
  }
  check("D Webroot-Ziel behaelt seinen Pfad",
    transport.transportKonfiguration({ HELMUT_MAIL_TRANSPORT: "mailpit", HELMUT_MAILPIT_URL: "http://127.0.0.1:8025/mail/" }).sendeUrl
      === "http://127.0.0.1:8025/mail/api/v1/send");

  // ── E · Nicht erreichbares Mailpit ─────────────────────────────────────────────────────
  const totFetch = testFetch(() => { const e = new Error("connect ECONNREFUSED 127.0.0.1:8025"); e.name = "TypeError"; return Promise.reject(e); });
  const tot = await inviteMail.sendAccessMail({ to: TEST_EMPFAENGER, ...invite }, { env: LOOPBACK_ENV, fetchImpl: totFetch });
  check("E Mailpit nicht erreichbar -> sent:false", tot.sent === false, JSON.stringify(tot));
  check("E Grund benennt die Nichterreichbarkeit", tot.reason === "mailpit-nicht-erreichbar", JSON.stringify(tot));

  // ── F · Zeitabbruch ────────────────────────────────────────────────────────────────────
  check("F Standard-Zeitabbruch ist kurz (<= 5 s)", transport.STANDARD_TIMEOUT_MS <= 5000, String(transport.STANDARD_TIMEOUT_MS));
  const haengtFetch = testFetch((url, optionen) => new Promise((_, reject) => {
    optionen.signal.addEventListener("abort", () => {
      const e = new Error("This operation was aborted"); e.name = "AbortError"; reject(e);
    });
  }));
  const t0 = Date.now();
  const abbruch = await inviteMail.sendAccessMail(
    { to: TEST_EMPFAENGER, ...invite }, { env: LOOPBACK_ENV, fetchImpl: haengtFetch, timeoutMs: 40 });
  const dauer = Date.now() - t0;
  check("F Zeitabbruch -> sent:false", abbruch.sent === false, JSON.stringify(abbruch));
  check("F Grund benennt den Zeitabbruch", abbruch.reason === "mailpit-zeitabbruch", JSON.stringify(abbruch));
  check("F Der Aufruf kehrt schnell zurueck", dauer < 2000, `${dauer}ms`);

  // ── G · Ablehnung externer Hosts und unzulaessiger Ziele ───────────────────────────────
  const unzulaessig = [
    ["externer Host", "http://mail.example.com:8025", "mailpit-nur-loopback"],
    ["externe IP", "http://203.0.113.10:8025", "mailpit-nur-loopback"],
    ["Loopback-aehnlicher Fremdhost", "http://127.0.0.1.example.org:8025", "mailpit-nur-loopback"],
    ["0.0.0.0 ist kein Loopback", "http://0.0.0.0:8025", "mailpit-nur-loopback"],
    ["Zugangsdaten in der URL", "http://nutzer:geheim@127.0.0.1:8025", "mailpit-url-mit-zugangsdaten"],
    ["fremdes Protokoll (file)", "file:///etc/passwd", "mailpit-protokoll-nicht-erlaubt"],
    ["fremdes Protokoll (smtp)", "smtp://127.0.0.1:1025", "mailpit-protokoll-nicht-erlaubt"],
    ["Abfrageteil in der URL", "http://127.0.0.1:8025/?ziel=extern", "mailpit-url-mit-abfrage"],
    ["unparsebare URL", "kein-url-wert", "mailpit-url-ungueltig"]
  ];
  for (const [name, url, grund] of unzulaessig) {
    const env = { HELMUT_MAIL_TRANSPORT: "mailpit", HELMUT_MAILPIT_URL: url, HELMUT_MAIL_FROM: TEST_ABSENDER };
    const konfig = transport.transportKonfiguration(env);
    const wachFetch = testFetch(jsonAntwort(200, { ID: "darf-nicht-passieren" }));
    const status = await inviteMail.sendAccessMail({ to: TEST_EMPFAENGER, ...invite }, { env, fetchImpl: wachFetch });
    check(`G abgelehnt: ${name}`, konfig.aktiv === false && konfig.grund === grund, `${konfig.grund}`);
    check(`G abgelehnt ohne Netzaufruf: ${name}`, wachFetch.zustand.aufrufe === 0 && status.sent === false && status.reason === grund,
      `${wachFetch.zustand.aufrufe} Aufrufe, ${JSON.stringify(status)}`);
  }

  // ── H · Ablehnung in Production ────────────────────────────────────────────────────────
  const prodEnv = { ...LOOPBACK_ENV, HELMUT_MAIL_FROM: TEST_ABSENDER, NODE_ENV: "production" };
  const prodFetch = testFetch(jsonAntwort(200, { ID: "darf-nicht-passieren" }));
  const prodKonfig = transport.transportKonfiguration(prodEnv);
  const prodStatus = await inviteMail.sendAccessMail({ to: TEST_EMPFAENGER, ...invite }, { env: prodEnv, fetchImpl: prodFetch });
  check("H NODE_ENV=production sperrt den Transport", prodKonfig.aktiv === false && prodKonfig.grund === "mailpit-in-production-gesperrt", JSON.stringify(prodKonfig));
  check("H Production: isMailConfigured false", inviteMail.isMailConfigured(prodEnv) === false);
  check("H Production: sent:false ohne Netzaufruf", prodStatus.sent === false && prodFetch.zustand.aufrufe === 0, JSON.stringify(prodStatus));
  check("H Production: auch eine gueltige Loopback-URL hebt die Sperre nicht auf",
    transport.transportKonfiguration({ ...prodEnv, HELMUT_MAILPIT_URL: "http://localhost:8025" }).aktiv === false);

  // ── I · Ablehnung in Vercel-Umgebungen ─────────────────────────────────────────────────
  for (const [name, zusatz] of [
    ["VERCEL=1", { VERCEL: "1" }],
    ["VERCEL_ENV=production", { VERCEL_ENV: "production" }],
    ["VERCEL_ENV=preview", { VERCEL_ENV: "preview" }],
    ["VERCEL_ENV=development", { VERCEL_ENV: "development" }]
  ]) {
    const env = { ...LOOPBACK_ENV, HELMUT_MAIL_FROM: TEST_ABSENDER, ...zusatz };
    const vercelFetch = testFetch(jsonAntwort(200, { ID: "darf-nicht-passieren" }));
    const konfig = transport.transportKonfiguration(env);
    const status = await inviteMail.sendAccessMail({ to: TEST_EMPFAENGER, ...invite }, { env, fetchImpl: vercelFetch });
    check(`I ${name} sperrt den Transport`, konfig.aktiv === false && konfig.grund === "mailpit-in-vercel-gesperrt", JSON.stringify(konfig));
    check(`I ${name}: sent:false ohne Netzaufruf`, status.sent === false && vercelFetch.zustand.aufrufe === 0, JSON.stringify(status));
  }

  // ── J · Ehrliches sent:false bei JEDEM Fehlerbild ──────────────────────────────────────
  const fehlerbilder = [
    ["HTTP 500", jsonAntwort(500, { Error: "kaputt" }), "mailpit-antwort-fehlerhaft"],
    ["HTTP 400", jsonAntwort(400, { Error: "ungueltig" }), "mailpit-antwort-fehlerhaft"],
    ["HTTP 302 (Weiterleitung)", jsonAntwort(302, ""), "mailpit-weiterleitung-abgelehnt"],
    ["200 ohne JSON", jsonAntwort(200, "<html>kein Mailpit</html>"), "mailpit-antwort-fehlerhaft"],
    ["200 ohne Nachrichtenkennung", jsonAntwort(200, { ok: true }), "mailpit-antwort-fehlerhaft"],
    ["200 mit leerer Kennung", jsonAntwort(200, { ID: "   " }), "mailpit-antwort-fehlerhaft"]
  ];
  for (const [name, antwort, grund] of fehlerbilder) {
    const status = await inviteMail.sendAccessMail(
      { to: TEST_EMPFAENGER, ...invite }, { env: LOOPBACK_ENV, fetchImpl: testFetch(antwort) });
    check(`J ${name} -> ehrliches sent:false`, status.sent === false && status.reason === grund, JSON.stringify(status));
  }
  const adressfehler = [
    ["Platzhalter-Absender ohne echte Domain", { from: "Helmut <no-reply@…de>", to: TEST_EMPFAENGER }, "mailpit-absender-ungueltig"],
    ["leerer Absender", { from: "", to: TEST_EMPFAENGER }, "mailpit-absender-ungueltig"],
    ["leerer Empfaenger", { from: TEST_ABSENDER, to: "" }, "mailpit-empfaenger-ungueltig"],
    ["Empfaenger ohne Domain", { from: TEST_ABSENDER, to: "eva@localhost" }, "mailpit-empfaenger-ungueltig"],
    ["Kopfzeilen-Einschleusung im Empfaenger", { from: TEST_ABSENDER, to: "eva@example.org\nBcc: fremd@example.org" }, "mailpit-empfaenger-ungueltig"],
    ["Kopfzeilen-Einschleusung im Absender", { from: "Helmut <noreply@helmut.test>\nBcc: fremd@example.org", to: TEST_EMPFAENGER }, "mailpit-absender-ungueltig"]
  ];
  for (const [name, felder, grund] of adressfehler) {
    const wachFetch = testFetch(jsonAntwort(200, { ID: "darf-nicht-passieren" }));
    const status = await transport.sendeMailpit({ subject: "Test", text: "Text", ...felder }, { env: LOOPBACK_ENV, fetchImpl: wachFetch });
    check(`J ${name} -> sent:false ohne Netzaufruf`, status.sent === false && status.reason === grund && wachFetch.zustand.aufrufe === 0, JSON.stringify(status));
  }
  const betreffEinschleusung = await transport.sendeMailpit(
    { from: TEST_ABSENDER, to: TEST_EMPFAENGER, subject: "Zugang\r\nBcc: fremd@example.org", text: "Text" },
    { env: LOOPBACK_ENV, fetchImpl: testFetch(jsonAntwort(200, { ID: "x" })) });
  check("J Kopfzeilen-Einschleusung im Betreff -> sent:false",
    betreffEinschleusung.sent === false && betreffEinschleusung.reason === "mailpit-kopfzeilen-einschleusung", JSON.stringify(betreffEinschleusung));
  check("J kein Fehlerbild meldet jemals sent:true", true);

  // ── K · Konto-/Token-Verhalten unveraendert, echter HTTP-Ablauf gegen Stub-Mailpit ─────
  const postfach = [];
  const stub = http.createServer((request, response) => {
    let roh = "";
    request.on("data", (c) => { roh += c; });
    request.on("end", () => {
      if (request.method === "POST" && request.url === "/api/v1/send") {
        let daten = null;
        try { daten = JSON.parse(roh); } catch (_) { daten = null; }
        if (!daten) { response.writeHead(400, { "Content-Type": "application/json" }); response.end("{}"); return; }
        postfach.push(daten);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ID: `stub-${postfach.length}` }));
        return;
      }
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end("{}");
    });
  });
  await new Promise((r) => stub.listen(0, "127.0.0.1", r));
  const stubPort = stub.address().port;

  const handler = require("../server.js");
  const accounts = require("../lib/helmut/accounts");
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    process.env.HELMUT_MAIL_TRANSPORT = "mailpit";
    process.env.HELMUT_MAILPIT_URL = `http://127.0.0.1:${stubPort}`;
    process.env.HELMUT_MAIL_FROM = TEST_ABSENDER;

    await accounts.createUser({ email: "admin-mailpit@example.org", name: "Admin Mailpit", role: "admin", password: "sicher-genug-1" });
    const loginRes = await req(port, "POST", "/api/auth/login", { body: { email: "admin-mailpit@example.org", password: "sicher-genug-1" } });
    const adminCookie = String(loginRes.headers["set-cookie"][0]).split(";")[0];
    const csrf = parse((await req(port, "GET", "/api/security/csrf", { headers: { Cookie: adminCookie } })).body).token;
    const adminWrite = { Cookie: adminCookie, "x-csrf-token": csrf };

    // K1) Admin legt ein Konto an -> genau eine Einladung im Stub-Postfach.
    postfach.length = 0;
    const create = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Eva Eingeladen", email: TEST_EMPFAENGER, role: "abgeordneter", party: "SPD"
    } })).body);
    check("K1 Kontoanlage weiterhin mit inviteUrl (Kopierweg unveraendert)",
      String(create.inviteUrl || "").includes("/passwort-setzen?token="), String(create.inviteUrl));
    check("K1 Mail-Status jetzt ehrlich sent:true", create.mail && create.mail.sent === true, JSON.stringify(create.mail));
    check("K1 genau EINE Nachricht im Postfach", postfach.length === 1, `n=${postfach.length}`);
    const eingang = postfach[0] || {};
    check("K1 Empfaenger korrekt", eingang.To && eingang.To[0] && eingang.To[0].Email === TEST_EMPFAENGER, JSON.stringify(eingang.To));
    check("K1 Absender korrekt", eingang.From && eingang.From.Email === "noreply@helmut.test", JSON.stringify(eingang.From));
    check("K1 Betreff ist der Einladungsbetreff", eingang.Subject === "Deine Einladung zu Helmut", eingang.Subject);
    check("K1 Text traegt denselben Token wie der Kopierlink",
      tokenFromText(eingang.Text) === new URL(create.inviteUrl).searchParams.get("token"), tokenFromText(eingang.Text).slice(0, 8));
    check("K1 Link im Text zeigt auf den lokalen Server",
      String(eingang.Text).includes(`http://127.0.0.1:${port}/passwort-setzen?token=`), String(eingang.Text).slice(-200));

    // K2) Neue Einladung entwertet das alte Token (Verhalten unveraendert).
    postfach.length = 0;
    const altToken = tokenFromText(eingang.Text);
    const erneut = parse((await req(port, "POST", `/api/admin/users/${encodeURIComponent(create.id)}/invite`, { headers: adminWrite, body: {} })).body);
    check("K2 erneute Einladung -> purpose invite", erneut.purpose === "invite", JSON.stringify(erneut));
    check("K2 genau EINE neue Nachricht", postfach.length === 1, `n=${postfach.length}`);
    const altPruefung = parse((await req(port, "GET", `/api/auth/password-token?token=${encodeURIComponent(altToken)}`)).body);
    check("K2 altes Token danach ungueltig", altPruefung.valid === false, JSON.stringify(altPruefung));
    const neuToken = tokenFromText(postfach[0].Text);
    check("K2 neues Token gueltig",
      parse((await req(port, "GET", `/api/auth/password-token?token=${encodeURIComponent(neuToken)}`)).body).valid === true);

    // K3) Passwort setzen + Einmaligkeit (Token-Verhalten unveraendert).
    const setzen = await req(port, "POST", "/api/auth/set-password", { body: { token: neuToken, password: "eva-passwort-1" } });
    check("K3 Passwort setzen -> 200 + Session", setzen.status === 200 && Boolean(setzen.headers["set-cookie"]), `status=${setzen.status}`);
    const evaCookie = String((setzen.headers["set-cookie"] || [""])[0]).split(";")[0];
    check("K3 Token ist einmalig -> zweite Nutzung 410",
      (await req(port, "POST", "/api/auth/set-password", { body: { token: neuToken, password: "zweiter-versuch-1" } })).status === 410);

    // K4) Anonymer Reset fuer BEKANNTE Adresse -> genau eine Reset-Nachricht.
    // Der ANONYME Zweig uebergibt die Nachricht seit dem Timing-Sprint bewusst NACH der
    // HTTP-Antwort an den Transport (lib/helmut/reset-timing.js). offeneArbeit() wartet
    // diesen Vorgang deterministisch ab — statt sich auf ein Zeitfenster zu verlassen.
    const resetTiming = require("../lib/helmut/reset-timing");
    postfach.length = 0;
    const bekannt = await req(port, "POST", "/api/auth/request-reset", { headers: { "x-forwarded-for": "10.0.0.1" }, body: { email: TEST_EMPFAENGER } });
    await resetTiming.offeneArbeit();
    check("K4 anonymer Reset bekannte Adresse -> 200 generisch", bekannt.status === 200 && !/resetUrl/.test(bekannt.body), bekannt.body.slice(0, 120));
    check("K4 genau EINE Reset-Nachricht", postfach.length === 1, `n=${postfach.length}`);
    check("K4 Reset-Betreff ist unterscheidbar", postfach.length === 1 && postfach[0].Subject === "Neues Passwort für Helmut festlegen", JSON.stringify(postfach[0] && postfach[0].Subject));
    const resetToken = postfach.length === 1 ? tokenFromText(postfach[0].Text) : "";

    // K5) Anonymer Reset fuer UNBEKANNTE Adresse -> identische Antwort, KEINE Nachricht.
    postfach.length = 0;
    const unbekannt = await req(port, "POST", "/api/auth/request-reset", { headers: { "x-forwarded-for": "10.0.0.2" }, body: { email: "niemand@example.org" } });
    await resetTiming.offeneArbeit();
    check("K5 unbekannte Adresse -> identische HTTP-Antwort", unbekannt.status === bekannt.status && unbekannt.body === bekannt.body,
      `${unbekannt.status} ${unbekannt.body.slice(0, 120)}`);
    check("K5 unbekannte Adresse erzeugt KEINE Nachricht", postfach.length === 0, `n=${postfach.length}`);

    // K6) Reset-Token einmalig + Sitzungsentzug (Verhalten unveraendert).
    const resetSetzen = await req(port, "POST", "/api/auth/set-password", { body: { token: resetToken, password: "eva-neu-passwort-1" } });
    check("K6 Reset-Token setzt neues Passwort -> 200", resetSetzen.status === 200, `status=${resetSetzen.status}`);
    check("K6 Reset-Token ist einmalig -> 410",
      (await req(port, "POST", "/api/auth/set-password", { body: { token: resetToken, password: "dritter-versuch-1" } })).status === 410);
    const alteSitzung = parse((await req(port, "GET", "/api/auth/session", { headers: { Cookie: evaCookie } })).body);
    check("K6 bestehende Sitzung nach Reset beendet", alteSitzung.authenticated === false, JSON.stringify(alteSitzung));

    // K7) Mailpit-Ausfall: ehrlicher Status, Konto-/Token-Verhalten unveraendert.
    await new Promise((r) => stub.close(r));
    postfach.length = 0;
    const beiAusfall = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Otto Offen", email: "otto@example.org", role: "demo"
    } })).body);
    check("K7 Mailpit-Ausfall -> ehrliches sent:false", beiAusfall.mail && beiAusfall.mail.sent === false, JSON.stringify(beiAusfall.mail));
    check("K7 Mailpit-Ausfall -> Grund benannt", beiAusfall.mail && /mailpit/.test(String(beiAusfall.mail.reason)), JSON.stringify(beiAusfall.mail));
    check("K7 Mailpit-Ausfall -> Kopierlink weiterhin vorhanden",
      String(beiAusfall.inviteUrl || "").includes("/passwort-setzen?token="), String(beiAusfall.inviteUrl));
    check("K7 Mailpit-Ausfall -> Token funktioniert unveraendert",
      parse((await req(port, "GET", `/api/auth/password-token?token=${encodeURIComponent(new URL(beiAusfall.inviteUrl).searchParams.get("token"))}`)).body).valid === true);
    check("K7 keine Antwort leakt Hashes", !/passwordHash|passwordSalt|tokenHash/.test(JSON.stringify(beiAusfall)));
  } finally {
    await new Promise((r) => server.close(r));
    try { stub.close(); } catch (_) { /* bereits geschlossen */ }
    delete process.env.HELMUT_MAIL_TRANSPORT;
    delete process.env.HELMUT_MAILPIT_URL;
    delete process.env.HELMUT_MAIL_FROM;
  }

  console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Mailpit-Transport-Assertions`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
