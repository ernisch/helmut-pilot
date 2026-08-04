"use strict";

// Resend-Transport-Test — OFFLINE. Es wird NIE die echte Resend-API aufgerufen.
// =============================================================================================
// Prueft den vorbereiteten Production-Transport (lib/helmut/mail-transport.js, Transportname
// `resend`) und seine Verdrahtung in den bestehenden Einladungs-/Reset-Ablauf. Der Auftrag
// verlangt zwoelf Nachweise; sie sind unten als Abschnitte A–L einzeln ausgewiesen:
//
//   A  Transportauswahl — Resend nur bei ausdruecklicher Aktivierung
//   B  Ohne Aktivierung wird Resend NIE aufgerufen (auch nicht ueber das globale fetch)
//   C  Fehlender/ungueltiger API-Schluessel -> sent:false
//   D  Fehlender/ungueltiger Absender und fehlerhafte Antwortadresse -> sent:false
//   E  Erfolgreiche Resend-Antwort -> sent:true (samt geprueftem Anfrageformat)
//   F  Resend-Fehlerantworten -> sent:false mit BEREINIGTEM Grund
//   G  Netzwerkfehler -> sent:false
//   H  Zeitueberschreitung -> sent:false
//   I  Einladung und Passwort-Reset: richtiger Empfaenger, Betreff, Inhalt
//   J  Kein Schluessel, kein Token, kein Empfaenger in Logs oder Fehlermeldungen
//   K  Echter HTTP-Ablauf (Admin -> Konto -> Versand) gegen ein gestubbtes globales fetch,
//      inklusive Kopierlink als Rueckfallweg bei fehlgeschlagenem Versand
//   L  Der lokale Mailpit-Transport bleibt unveraendert
//
// WIE DER ECHTE VERSAND AUSGESCHLOSSEN IST — drei unabhaengige Schichten:
//   1. Jeder Aufruf bekommt ein eingespeistes `fetchImpl` (Abschnitte A–J) bzw. ein im
//      Testprozess ersetztes `globalThis.fetch` (Abschnitt K). Es gibt keinen Pfad zur echten
//      API.
//   2. Der API-Schluessel ist ein offensichtlicher Platzhalter ohne jede Gueltigkeit.
//   3. Im kanonischen Lauf (scripts/run-offline-tests.js) blockt der Netz-Guard jede
//      Nicht-Localhost-Verbindung technisch.
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
// Ausgangszustand: KEIN Transport konfiguriert (Abschnitt A/B pruefen genau das).
delete process.env.HELMUT_MAIL_TRANSPORT;
delete process.env.HELMUT_MAILPIT_URL;
delete process.env.HELMUT_MAIL_FROM;
delete process.env.HELMUT_MAIL_REPLY_TO;
delete process.env.HELMUT_RESEND_API_KEY;

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

// --- Testwerte: nichts davon ist echt --------------------------------------------------------
// Offensichtlicher Platzhalter. Kein gueltiger Schluessel, kein echtes Format-Praefix noetig —
// der Transport prueft bewusst nur Zeichenklasse und Laenge.
const TEST_SCHLUESSEL = "PLATZHALTER-kein-echter-resend-schluessel-0000";
const TEST_ABSENDER = "Helmut <noreply@helmut.test>";
const TEST_ANTWORT = "Helmut Buero <buero@helmut.test>";
const TEST_EMPFAENGER = "eva@example.org";
const RESEND_URL = "https://api.resend.com/emails";
const RESEND_ENV = Object.freeze({
  HELMUT_MAIL_TRANSPORT: "resend",
  HELMUT_RESEND_API_KEY: TEST_SCHLUESSEL,
  HELMUT_MAIL_FROM: TEST_ABSENDER
});
const MAILPIT_ENV = Object.freeze({ HELMUT_MAIL_TRANSPORT: "mailpit", HELMUT_MAILPIT_URL: "http://127.0.0.1:8025" });

// Kontrollierter Testtransport: zaehlt Aufrufe, merkt sich die letzte Anfrage und antwortet
// nach Vorgabe. So laesst sich auch beweisen, dass ein VERWEIGERTER Versand gar nicht erst zu
// einem Netzaufruf fuehrt.
function testFetch(antwort) {
  const zustand = { aufrufe: 0, letzteUrl: null, letzteOptionen: null, urls: [] };
  const fn = async (url, optionen) => {
    zustand.aufrufe += 1;
    zustand.letzteUrl = String(url);
    zustand.urls.push(String(url));
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

// Faengt ALLE Konsolenausgaben waehrend eines Aufrufs ein (Abschnitt J).
async function mitProtokollmitschnitt(fn) {
  const zeilen = [];
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
  for (const name of Object.keys(orig)) {
    console[name] = (...args) => { zeilen.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")); };
  }
  try {
    const ergebnis = await fn();
    return { ergebnis, protokoll: zeilen.join("\n") };
  } finally {
    for (const [name, f] of Object.entries(orig)) console[name] = f;
  }
}

(async () => {
  // ── A · Transportauswahl ────────────────────────────────────────────────────────────────
  check("A ohne Konfiguration: Transport inaktiv, Grund unveraendert",
    transport.transportKonfiguration({}).aktiv === false
    && transport.transportKonfiguration({}).grund === "mail-versand-nicht-konfiguriert");
  check("A 'resend' mit vollstaendiger Konfiguration ist aktiv",
    transport.transportKonfiguration(RESEND_ENV).aktiv === true, JSON.stringify(transport.transportKonfiguration(RESEND_ENV)));
  check("A aktive Konfiguration benennt den Transport",
    transport.transportKonfiguration(RESEND_ENV).transport === "resend");
  check("A Transportname unempfindlich gegen Schreibweise/Leerraum",
    transport.transportKonfiguration({ ...RESEND_ENV, HELMUT_MAIL_TRANSPORT: "  ReSend " }).aktiv === true);
  for (const name of ["resend-extern", "resendx", "re", "send", "smtp", "sendgrid", "mailpit-resend"]) {
    const konfig = transport.transportKonfiguration({ ...RESEND_ENV, HELMUT_MAIL_TRANSPORT: name });
    check(`A unbekannter Transportname bleibt inaktiv: ${name}`,
      konfig.aktiv === false && konfig.grund === "mail-transport-unbekannt", JSON.stringify(konfig));
  }
  check("A Resend-Ziel ist die feste Konstante (nicht konfigurierbar)",
    transport.RESEND_API_URL === RESEND_URL && transport.transportKonfiguration(RESEND_ENV).sendeUrl === RESEND_URL);
  check("A eine erfundene Ziel-Variable aendert das Ziel nicht",
    transport.transportKonfiguration({ ...RESEND_ENV, HELMUT_RESEND_URL: "https://boese.example.org/x" }).sendeUrl === RESEND_URL);
  check("A Resend ist NICHT pauschal in Production gesperrt (es ist der Production-Transport)",
    transport.transportKonfiguration({ ...RESEND_ENV, NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production" }).aktiv === true);
  check("A isMailConfigured() folgt der Transportauswahl",
    inviteMail.isMailConfigured(RESEND_ENV) === true && inviteMail.isMailConfigured({}) === false);
  check("A Konfigurationsobjekt enthaelt NIE den API-Schluessel",
    !JSON.stringify(transport.transportKonfiguration(RESEND_ENV)).includes(TEST_SCHLUESSEL),
    JSON.stringify(transport.transportKonfiguration(RESEND_ENV)));
  check("A Konfiguration meldet nur DASS ein Schluessel da ist",
    transport.transportKonfiguration(RESEND_ENV).schluesselVorhanden === true);

  // ── B · Ohne ausdrueckliche Aktivierung wird Resend NIE aufgerufen ───────────────────────
  const ohneAktivierung = [
    ["gar keine Konfiguration", {}, "mail-versand-nicht-konfiguriert"],
    ["Schluessel gesetzt, aber kein Transport", { HELMUT_RESEND_API_KEY: TEST_SCHLUESSEL, HELMUT_MAIL_FROM: TEST_ABSENDER }, "mail-versand-nicht-konfiguriert"],
    ["leerer Transportname", { ...RESEND_ENV, HELMUT_MAIL_TRANSPORT: "" }, "mail-versand-nicht-konfiguriert"],
    ["nur Leerraum als Transportname", { ...RESEND_ENV, HELMUT_MAIL_TRANSPORT: "   " }, "mail-versand-nicht-konfiguriert"],
    ["fremder Transportname", { ...RESEND_ENV, HELMUT_MAIL_TRANSPORT: "sendgrid" }, "mail-transport-unbekannt"],
    ["Praefix-Treffer reicht nicht", { ...RESEND_ENV, HELMUT_MAIL_TRANSPORT: "resendx" }, "mail-transport-unbekannt"]
  ];
  for (const [name, env, grund] of ohneAktivierung) {
    const wachFetch = testFetch(jsonAntwort(200, { id: "darf-nicht-passieren" }));
    const status = await inviteMail.sendAccessMail(
      { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" }, { env, fetchImpl: wachFetch });
    check(`B ${name}: sent:false ohne jeden Aufruf`,
      status.sent === false && status.reason === grund && wachFetch.zustand.aufrufe === 0,
      `${wachFetch.zustand.aufrufe} Aufrufe, ${JSON.stringify(status)}`);
  }

  // Gegenprobe ueber das GLOBALE fetch: ohne Aktivierung darf nicht einmal der Default-Pfad
  // eine Verbindung versuchen (kein eingespeistes fetchImpl).
  const globalOriginal = globalThis.fetch;
  const globalSpion = { aufrufe: 0, urls: [] };
  globalThis.fetch = async (url) => {
    globalSpion.aufrufe += 1;
    globalSpion.urls.push(String(url));
    return jsonAntwort(200, { id: "darf-nicht-passieren" });
  };
  try {
    for (const [, env] of ohneAktivierung) {
      await inviteMail.sendAccessMail({ to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" }, { env });
    }
    check("B kein einziger Aufruf ueber das globale fetch ohne Aktivierung",
      globalSpion.aufrufe === 0, globalSpion.urls.join(", "));

    // Und mit MAILPIT-Auswahl darf ebenfalls nie Resend angesprochen werden.
    await inviteMail.sendAccessMail({ to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" },
      { env: { ...MAILPIT_ENV, HELMUT_RESEND_API_KEY: TEST_SCHLUESSEL, HELMUT_MAIL_FROM: TEST_ABSENDER } });
    check("B mit Mailpit-Auswahl geht nichts an Resend — auch nicht bei vorhandenem Schluessel",
      globalSpion.urls.every((u) => !u.includes("resend.com")) && globalSpion.urls.some((u) => u.includes("127.0.0.1:8025")),
      globalSpion.urls.join(", "));
  } finally {
    globalThis.fetch = globalOriginal;
  }

  // ── C · API-Schluessel ──────────────────────────────────────────────────────────────────
  const schluesselfaelle = [
    ["Schluessel fehlt ganz", undefined, "resend-api-schluessel-fehlt"],
    ["Schluessel leer", "", "resend-api-schluessel-fehlt"],
    ["Schluessel nur Leerraum", "    ", "resend-api-schluessel-fehlt"],
    ["Schluessel zu kurz", "re_x", "resend-api-schluessel-ungueltig"],
    ["Schluessel mit Leerzeichen", "re_abc def ghi jkl", "resend-api-schluessel-ungueltig"],
    ["Schluessel mit Zeilenumbruch", "re_abcdefghijkl\nBcc: fremd@example.org", "resend-api-schluessel-ungueltig"]
  ];
  for (const [name, wert, grund] of schluesselfaelle) {
    const env = { ...RESEND_ENV };
    if (wert === undefined) delete env.HELMUT_RESEND_API_KEY; else env.HELMUT_RESEND_API_KEY = wert;
    const wachFetch = testFetch(jsonAntwort(200, { id: "darf-nicht-passieren" }));
    const konfig = transport.transportKonfiguration(env);
    const status = await inviteMail.sendAccessMail(
      { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" }, { env, fetchImpl: wachFetch });
    check(`C ${name}: Konfiguration inaktiv mit klarem Grund`,
      konfig.aktiv === false && konfig.grund === grund, JSON.stringify(konfig));
    check(`C ${name}: sent:false ohne Aufruf`,
      status.sent === false && status.reason === grund && wachFetch.zustand.aufrufe === 0, JSON.stringify(status));
  }
  check("C isMailConfigured() ist ohne Schluessel false (kein falsches Gruen)",
    inviteMail.isMailConfigured({ HELMUT_MAIL_TRANSPORT: "resend", HELMUT_MAIL_FROM: TEST_ABSENDER }) === false);
  // Auch ein von aussen hereingereichtes, gefaelschtes Konfigurationsobjekt sendet nicht ohne Schluessel.
  const gefaelscht = await transport.sendeResend(
    { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" },
    { env: { HELMUT_MAIL_TRANSPORT: "resend" },
      konfiguration: { aktiv: true, transport: "resend", sendeUrl: RESEND_URL },
      fetchImpl: testFetch(jsonAntwort(200, { id: "darf-nicht-passieren" })) });
  check("C gefaelschte Konfiguration ohne Schluessel -> sent:false",
    gefaelscht.sent === false && gefaelscht.reason === "resend-api-schluessel-fehlt", JSON.stringify(gefaelscht));
  // Ausleitungsschutz: selbst ein Konfigurationsobjekt mit fremdem Ziel darf den Schluessel
  // nicht an einen anderen Host schicken — das Ziel ist eine Konstante, kein Konfigurationswert.
  const umleitFetch = testFetch(jsonAntwort(200, { id: "sollte-nicht-woanders-landen" }));
  const umgeleitet = await transport.sendeResend(
    { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" },
    { env: RESEND_ENV,
      konfiguration: { aktiv: true, transport: "resend", sendeUrl: "https://boese.example.org/sammeln" },
      fetchImpl: umleitFetch });
  check("C gefaelschtes Ziel wird ignoriert — Aufruf geht an die Resend-Konstante",
    umleitFetch.zustand.letzteUrl === RESEND_URL && umgeleitet.sent === true, umleitFetch.zustand.letzteUrl);
  check("C gefaelschtes Ziel bekommt den Schluessel nicht zu sehen",
    umleitFetch.zustand.urls.every((u) => !u.includes("boese.example.org")), umleitFetch.zustand.urls.join(", "));

  // ── D · Absender und Antwortadresse ─────────────────────────────────────────────────────
  const absenderfaelle = [
    ["Absender fehlt", { HELMUT_MAIL_FROM: undefined }, "resend-absender-ungueltig"],
    ["Absender leer", { HELMUT_MAIL_FROM: "" }, "resend-absender-ungueltig"],
    ["Absender ist der Code-Platzhalter ohne gueltige Domain", { HELMUT_MAIL_FROM: "Helmut <no-reply@…de>" }, "resend-absender-ungueltig"],
    ["Absender ohne Domain-Punkt", { HELMUT_MAIL_FROM: "helmut@localhost" }, "resend-absender-ungueltig"],
    ["Absender mit Kopfzeilen-Einschleusung", { HELMUT_MAIL_FROM: "Helmut <noreply@helmut.test>\nBcc: fremd@example.org" }, "resend-absender-ungueltig"],
    ["Antwortadresse ungueltig", { HELMUT_MAIL_REPLY_TO: "kein-adresswert" }, "resend-antwortadresse-ungueltig"],
    ["Antwortadresse mit Kopfzeilen-Einschleusung", { HELMUT_MAIL_REPLY_TO: "buero@helmut.test\r\nBcc: fremd@example.org" }, "resend-antwortadresse-ungueltig"]
  ];
  for (const [name, zusatz, grund] of absenderfaelle) {
    const env = { ...RESEND_ENV, ...zusatz };
    if (zusatz.HELMUT_MAIL_FROM === undefined && "HELMUT_MAIL_FROM" in zusatz) delete env.HELMUT_MAIL_FROM;
    const wachFetch = testFetch(jsonAntwort(200, { id: "darf-nicht-passieren" }));
    const konfig = transport.transportKonfiguration(env);
    const status = await inviteMail.sendAccessMail(
      { to: TEST_EMPFAENGER, from: env.HELMUT_MAIL_FROM, subject: "Test", text: "Text" }, { env, fetchImpl: wachFetch });
    check(`D ${name}: inaktiv mit klarem Grund`, konfig.aktiv === false && konfig.grund === grund, JSON.stringify(konfig));
    check(`D ${name}: sent:false ohne Aufruf`,
      status.sent === false && status.reason === grund && wachFetch.zustand.aufrufe === 0, JSON.stringify(status));
  }
  const empfaengerfaelle = [
    ["Empfaenger leer", "", "resend-empfaenger-ungueltig"],
    ["Empfaenger ohne Domain", "eva@localhost", "resend-empfaenger-ungueltig"],
    ["Empfaenger mit Kopfzeilen-Einschleusung", "eva@example.org\nBcc: fremd@example.org", "resend-empfaenger-ungueltig"]
  ];
  for (const [name, an, grund] of empfaengerfaelle) {
    const wachFetch = testFetch(jsonAntwort(200, { id: "darf-nicht-passieren" }));
    const status = await transport.sendeResend(
      { to: an, from: TEST_ABSENDER, subject: "Test", text: "Text" }, { env: RESEND_ENV, fetchImpl: wachFetch });
    check(`D ${name}: sent:false ohne Aufruf`,
      status.sent === false && status.reason === grund && wachFetch.zustand.aufrufe === 0, JSON.stringify(status));
  }
  const betreffEinschleusung = await transport.sendeResend(
    { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Zugang\r\nBcc: fremd@example.org", text: "Text" },
    { env: RESEND_ENV, fetchImpl: testFetch(jsonAntwort(200, { id: "x" })) });
  check("D Kopfzeilen-Einschleusung im Betreff -> sent:false",
    betreffEinschleusung.sent === false && betreffEinschleusung.reason === "resend-kopfzeilen-einschleusung", JSON.stringify(betreffEinschleusung));

  // ── E · Erfolgreicher Versand ───────────────────────────────────────────────────────────
  const okFetch = testFetch(jsonAntwort(200, { id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c" }));
  const erfolg = await transport.sendeResend(
    { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Dein Zugang zu Helmut steht bereit", text: "Hallo Eva,\nLink: http://x.test/passwort-setzen?token=abc" },
    { env: RESEND_ENV, fetchImpl: okFetch });
  check("E erfolgreiche Antwort -> sent:true", erfolg.sent === true, JSON.stringify(erfolg));
  check("E Transport wird benannt", erfolg.transport === "resend", JSON.stringify(erfolg));
  check("E genau EIN Aufruf", okFetch.zustand.aufrufe === 1, String(okFetch.zustand.aufrufe));
  check("E Ziel ist die Resend-API", okFetch.zustand.letzteUrl === RESEND_URL, okFetch.zustand.letzteUrl);
  check("E Methode POST + JSON-Kopfzeile", okFetch.zustand.letzteOptionen.method === "POST"
    && okFetch.zustand.letzteOptionen.headers["Content-Type"] === "application/json");
  check("E Authentifizierung als Bearer-Kopfzeile",
    okFetch.zustand.letzteOptionen.headers.Authorization === `Bearer ${TEST_SCHLUESSEL}`);
  check("E Schluessel steht NICHT in der URL", !okFetch.zustand.letzteUrl.includes(TEST_SCHLUESSEL));
  check("E Schluessel steht NICHT im Rumpf", !String(okFetch.zustand.letzteOptionen.body).includes(TEST_SCHLUESSEL));
  check("E Weiterleitungen sind unterbunden", okFetch.zustand.letzteOptionen.redirect === "error");
  check("E Anfrage traegt ein Abbruchsignal", Boolean(okFetch.zustand.letzteOptionen.signal));
  const eRumpf = JSON.parse(okFetch.zustand.letzteOptionen.body);
  check("E Rumpf: Absender als eine Zeichenkette (Resend-Vertrag)", eRumpf.from === TEST_ABSENDER, JSON.stringify(eRumpf.from));
  check("E Rumpf: genau ein Empfaenger", Array.isArray(eRumpf.to) && eRumpf.to.length === 1 && eRumpf.to[0] === TEST_EMPFAENGER);
  check("E Rumpf: Betreff unveraendert", eRumpf.subject === "Dein Zugang zu Helmut steht bereit");
  check("E Rumpf: Text enthaelt den Link", String(eRumpf.text).includes("/passwort-setzen?token=abc"));
  // Diese Nachricht hat bewusst KEINEN HTML-Teil: dann steht der Schluessel auch nicht
  // im Rumpf — das Verhalten ist byte-identisch zu der Fassung vor dem HTML-Mail-Sprint.
  check("E Rumpf: ohne HTML-Teil kein html-Schluessel", eRumpf.html === undefined);
  check("E ohne Antwortadresse kein reply_to-Feld", eRumpf.reply_to === undefined, JSON.stringify(eRumpf.reply_to));
  check("E Nachrichtenkennung wird NICHT zurueckgegeben", !JSON.stringify(erfolg).includes("4ef9a417"), JSON.stringify(erfolg));

  const antwortFetch = testFetch(jsonAntwort(200, { id: "abc" }));
  await transport.sendeResend({ to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" },
    { env: { ...RESEND_ENV, HELMUT_MAIL_REPLY_TO: TEST_ANTWORT }, fetchImpl: antwortFetch });
  check("E konfigurierte Antwortadresse landet als reply_to im Rumpf",
    JSON.parse(antwortFetch.zustand.letzteOptionen.body).reply_to === TEST_ANTWORT,
    antwortFetch.zustand.letzteOptionen.body);
  const nurAdresseFetch = testFetch(jsonAntwort(200, { id: "abc" }));
  await transport.sendeResend({ to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" },
    { env: { ...RESEND_ENV, HELMUT_MAIL_REPLY_TO: "buero@helmut.test" }, fetchImpl: nurAdresseFetch });
  check("E Antwortadresse ohne Anzeigenamen bleibt die blanke Adresse",
    JSON.parse(nurAdresseFetch.zustand.letzteOptionen.body).reply_to === "buero@helmut.test");
  check("E 201 gilt ebenfalls als Erfolg",
    (await transport.sendeResend({ to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "T", text: "T" },
      { env: RESEND_ENV, fetchImpl: testFetch(jsonAntwort(201, { id: "neu" })) })).sent === true);

  // ── F · Resend-Fehlerantworten (bereinigt) ──────────────────────────────────────────────
  const fehlerbilder = [
    ["HTTP 422 Domain nicht verifiziert",
      jsonAntwort(422, { statusCode: 422, message: "The helmut.test domain is not verified. Please verify eva@example.org", name: "validation_error" }),
      "resend-abgelehnt", 422, "validation_error"],
    ["HTTP 400 fehlerhafte Anfrage",
      jsonAntwort(400, { statusCode: 400, message: "Missing `to` field", name: "missing_required_field" }),
      "resend-abgelehnt", 400, "missing_required_field"],
    ["HTTP 401 Schluessel abgelehnt",
      jsonAntwort(401, { statusCode: 401, message: "API key is invalid", name: "restricted_api_key" }),
      "resend-nicht-autorisiert", 401, "restricted_api_key"],
    ["HTTP 403 verboten", jsonAntwort(403, { name: "forbidden" }), "resend-nicht-autorisiert", 403, "forbidden"],
    ["HTTP 429 Tageslimit erreicht",
      jsonAntwort(429, { statusCode: 429, message: "Too many requests", name: "rate_limit_exceeded" }),
      "resend-limit-erreicht", 429, "rate_limit_exceeded"],
    ["HTTP 500 Anbieterstoerung", jsonAntwort(500, { name: "internal_server_error" }), "resend-abgelehnt", 500, "internal_server_error"],
    ["HTTP 502 ohne JSON", jsonAntwort(502, "<html>Bad Gateway</html>"), "resend-abgelehnt", 502, undefined]
  ];
  for (const [name, antwort, grund, status, art] of fehlerbilder) {
    const ergebnis = await transport.sendeResend(
      { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" }, { env: RESEND_ENV, fetchImpl: testFetch(antwort) });
    check(`F ${name} -> ehrliches sent:false`, ergebnis.sent === false && ergebnis.reason === grund, JSON.stringify(ergebnis));
    check(`F ${name} -> HTTP-Status wird benannt`, ergebnis.status === status, JSON.stringify(ergebnis));
    check(`F ${name} -> Fehlerart bereinigt`, ergebnis.fehlerart === art, JSON.stringify(ergebnis));
    check(`F ${name} -> kein Anbietertext, keine Adresse im Ergebnis`,
      !/Please verify|Missing `to`|Bad Gateway|is invalid|Too many/.test(JSON.stringify(ergebnis))
      && !JSON.stringify(ergebnis).includes(TEST_EMPFAENGER), JSON.stringify(ergebnis));
  }
  const boesartig = await transport.sendeResend(
    { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" },
    { env: RESEND_ENV, fetchImpl: testFetch(jsonAntwort(422, { name: `fehler <script> ${TEST_EMPFAENGER} ${TEST_SCHLUESSEL}` })) });
  check("F boesartige Fehlerart wird komplett verworfen",
    boesartig.sent === false && boesartig.fehlerart === undefined
    && !JSON.stringify(boesartig).includes(TEST_EMPFAENGER) && !JSON.stringify(boesartig).includes(TEST_SCHLUESSEL),
    JSON.stringify(boesartig));
  const schluesselEcho = await transport.sendeResend(
    { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" },
    { env: RESEND_ENV, fetchImpl: testFetch(jsonAntwort(401, { message: `key ${TEST_SCHLUESSEL} rejected`, name: "restricted_api_key" })) });
  check("F ein im Fehlertext gespiegelter Schluessel verlaesst den Transport nicht",
    !JSON.stringify(schluesselEcho).includes(TEST_SCHLUESSEL), JSON.stringify(schluesselEcho));
  const antwortfehler = [
    ["200 ohne JSON", jsonAntwort(200, "<html>kein Resend</html>")],
    ["200 ohne Kennung", jsonAntwort(200, { ok: true })],
    ["200 mit leerer Kennung", jsonAntwort(200, { id: "   " })],
    ["200 mit Kennung falschen Typs", jsonAntwort(200, { id: 12345 })],
    ["Antwort ohne Statuscode", { text: async () => "{}" }]
  ];
  for (const [name, antwort] of antwortfehler) {
    const ergebnis = await transport.sendeResend(
      { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" }, { env: RESEND_ENV, fetchImpl: testFetch(antwort) });
    check(`F ${name} -> sent:false (fail closed)`,
      ergebnis.sent === false && ergebnis.reason === "resend-antwort-fehlerhaft", JSON.stringify(ergebnis));
  }
  const weiterleitung = await transport.sendeResend(
    { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" },
    { env: RESEND_ENV, fetchImpl: testFetch(jsonAntwort(302, "")) });
  check("F Weiterleitung wird abgelehnt",
    weiterleitung.sent === false && weiterleitung.reason === "resend-weiterleitung-abgelehnt", JSON.stringify(weiterleitung));
  check("F kein einziges Fehlerbild meldet jemals sent:true", true);

  // ── G · Netzwerkfehler ──────────────────────────────────────────────────────────────────
  const netzfehler = [
    ["DNS-Fehler", () => { const e = new Error("getaddrinfo ENOTFOUND api.resend.com"); e.name = "TypeError"; return Promise.reject(e); }, "resend-nicht-erreichbar"],
    ["Verbindung abgelehnt", () => { const e = new Error("connect ECONNREFUSED"); e.name = "TypeError"; return Promise.reject(e); }, "resend-nicht-erreichbar"],
    ["TLS-Fehler", () => { const e = new Error("unable to verify the first certificate"); e.name = "Error"; return Promise.reject(e); }, "resend-nicht-erreichbar"],
    ["unterbundene Weiterleitung (undici)", () => { const e = new Error("unexpected redirect"); e.name = "TypeError"; return Promise.reject(e); }, "resend-weiterleitung-abgelehnt"]
  ];
  for (const [name, impl, grund] of netzfehler) {
    const ergebnis = await transport.sendeResend(
      { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" }, { env: RESEND_ENV, fetchImpl: testFetch(impl) });
    check(`G ${name} -> sent:false mit klarem Grund`, ergebnis.sent === false && ergebnis.reason === grund, JSON.stringify(ergebnis));
  }
  // Laufzeit ohne verfuegbares fetch (aeltere Node-Version): ehrlich sent:false statt Absturz.
  const fetchWeg = globalThis.fetch;
  globalThis.fetch = undefined;
  const ohneFetch = await transport.sendeResend(
    { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" }, { env: RESEND_ENV });
  globalThis.fetch = fetchWeg;
  check("G ohne verfuegbares fetch -> sent:false",
    ohneFetch.sent === false && ohneFetch.reason === "resend-fetch-fehlt", JSON.stringify(ohneFetch));

  // ── H · Zeitueberschreitung ─────────────────────────────────────────────────────────────
  check("H Standard-Zeitlimit ist gesetzt und angemessen (5–20 s)",
    transport.RESEND_TIMEOUT_MS >= 5000 && transport.RESEND_TIMEOUT_MS <= 20000, String(transport.RESEND_TIMEOUT_MS));
  const haengtFetch = testFetch((url, optionen) => new Promise((_, reject) => {
    optionen.signal.addEventListener("abort", () => {
      const e = new Error("This operation was aborted"); e.name = "AbortError"; reject(e);
    });
  }));
  const t0 = Date.now();
  const abbruch = await transport.sendeResend(
    { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" },
    { env: RESEND_ENV, fetchImpl: haengtFetch, timeoutMs: 40 });
  const dauer = Date.now() - t0;
  check("H Zeitueberschreitung -> sent:false", abbruch.sent === false, JSON.stringify(abbruch));
  check("H Grund benennt den Zeitabbruch", abbruch.reason === "resend-zeitabbruch", JSON.stringify(abbruch));
  check("H Der Aufruf kehrt schnell zurueck", dauer < 2000, `${dauer}ms`);
  check("H das Abbruchsignal wird tatsaechlich ausgeloest",
    haengtFetch.zustand.letzteOptionen.signal.aborted === true);
  // Ein Zeitabbruch nach dem Absenden (Antwort kommt nie an) meldet ebenfalls sent:false —
  // ein moeglicherweise doch zugestellter Versand darf NIE als Erfolg erscheinen.
  const nachAbbruch = await transport.sendeResend(
    { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" },
    { env: RESEND_ENV, timeoutMs: 40, fetchImpl: testFetch((url, optionen) => new Promise((_, reject) => {
      optionen.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })));
    })) });
  check("H TimeoutError wird ebenso ehrlich gemeldet",
    nachAbbruch.sent === false && nachAbbruch.reason === "resend-zeitabbruch", JSON.stringify(nachAbbruch));

  // ── I · Einladung und Passwort-Reset ueber die zentrale Versandlogik ─────────────────────
  const inviteUrl = "https://helmut-pilot.vercel.app/passwort-setzen?token=einladungs-token-1";
  const resetUrl = "https://helmut-pilot.vercel.app/passwort-setzen?token=reset-token-2";
  process.env.HELMUT_MAIL_FROM = TEST_ABSENDER;
  const einladung = inviteMail.buildInviteMail({ name: "Eva Eingeladen", inviteUrl });
  const zuruecksetzen = inviteMail.buildResetMail({ name: "Eva Eingeladen", resetUrl });
  delete process.env.HELMUT_MAIL_FROM;

  const inviteFetch = testFetch(jsonAntwort(200, { id: "id-invite" }));
  const inviteStatus = await inviteMail.sendAccessMail({ to: TEST_EMPFAENGER, ...einladung }, { env: RESEND_ENV, fetchImpl: inviteFetch });
  const inviteRumpf = JSON.parse(inviteFetch.zustand.letzteOptionen.body);
  check("I Einladung -> sent:true ueber Resend", inviteStatus.sent === true && inviteStatus.transport === "resend", JSON.stringify(inviteStatus));
  check("I Einladung: richtiger Empfaenger", inviteRumpf.to[0] === TEST_EMPFAENGER, JSON.stringify(inviteRumpf.to));
  check("I Einladung: richtiger Absender", inviteRumpf.from === TEST_ABSENDER, inviteRumpf.from);
  check("I Einladung: richtiger Betreff", inviteRumpf.subject === "Deine Einladung zu Helmut", inviteRumpf.subject);
  // Frueher wurde hier "7 Tage gültig" erwartet. Die Zahl war nur der Default von
  // HELMUT_INVITE_TOKEN_TTL_MS und stand damit potenziell falsch in der Mail.
  check("I Einladung: Anrede und Befristungshinweis im Text",
    inviteRumpf.text.startsWith("Hallo Eva,") && /zeitlich begrenzt/.test(inviteRumpf.text));
  check("I Einladung: genau ein Link, und zwar der richtige",
    (inviteRumpf.text.match(/passwort-setzen\?token=/g) || []).length === 1 && inviteRumpf.text.includes(inviteUrl));
  check("I Einladung: Fusszeile mit Absender und Impressum",
    inviteRumpf.text.includes("Impressum:") && inviteRumpf.text.includes(TEST_ABSENDER));

  const resetFetch = testFetch(jsonAntwort(200, { id: "id-reset" }));
  const resetStatus = await inviteMail.sendAccessMail({ to: TEST_EMPFAENGER, ...zuruecksetzen }, { env: RESEND_ENV, fetchImpl: resetFetch });
  const resetRumpf = JSON.parse(resetFetch.zustand.letzteOptionen.body);
  check("I Reset -> sent:true ueber Resend", resetStatus.sent === true, JSON.stringify(resetStatus));
  check("I Reset: richtiger Empfaenger", resetRumpf.to[0] === TEST_EMPFAENGER);
  check("I Reset: richtiger Betreff", resetRumpf.subject === "Neues Passwort für Helmut festlegen", resetRumpf.subject);
  check("I Reset: Befristungshinweis im Text", /zeitlich begrenzt/.test(resetRumpf.text));
  check("I Reset: genau ein Link, und zwar der richtige",
    (resetRumpf.text.match(/passwort-setzen\?token=/g) || []).length === 1 && resetRumpf.text.includes(resetUrl));
  check("I Einladung und Reset sind klar unterscheidbar",
    inviteRumpf.subject !== resetRumpf.subject && inviteRumpf.text !== resetRumpf.text);
  // Seit dem HTML-Mail-Sprint tragen beide Nachrichten BEIDE Fassungen. Resend erwartet
  // den HTML-Teil im Feld `html` (Anbietervertrag) neben `text`.
  check("I beide Nachrichten tragen HTML- UND Textfassung",
    typeof inviteRumpf.html === "string" && inviteRumpf.html === einladung.html
    && typeof resetRumpf.html === "string" && resetRumpf.html === zuruecksetzen.html);
  check("I der HTML-Teil traegt denselben Link wie die Textfassung",
    inviteRumpf.html.includes(inviteUrl) && resetRumpf.html.includes(resetUrl));
  check("I der Schluessel steht in keinem der beiden Rumpfe",
    !JSON.stringify([inviteRumpf, resetRumpf]).includes(TEST_SCHLUESSEL));

  // ── J · Keine Protokollierung, kein Leck ────────────────────────────────────────────────
  const mitschnitte = [];
  for (const [name, env, fetchImpl] of [
    ["Erfolg", RESEND_ENV, testFetch(jsonAntwort(200, { id: "id-log" }))],
    ["Anbieterfehler", RESEND_ENV, testFetch(jsonAntwort(422, { message: `bad ${TEST_EMPFAENGER}`, name: "validation_error" }))],
    ["Netzfehler", RESEND_ENV, testFetch(() => Promise.reject(new Error(`ENOTFOUND ${TEST_SCHLUESSEL}`)))],
    ["ohne Schluessel", { ...RESEND_ENV, HELMUT_RESEND_API_KEY: "" }, testFetch(jsonAntwort(200, { id: "x" }))],
    ["ohne Konfiguration", {}, testFetch(jsonAntwort(200, { id: "x" }))]
  ]) {
    const { ergebnis, protokoll } = await mitProtokollmitschnitt(() =>
      inviteMail.sendAccessMail({ to: TEST_EMPFAENGER, ...einladung }, { env, fetchImpl }));
    mitschnitte.push([name, ergebnis, protokoll]);
    check(`J ${name}: keine einzige Protokollzeile`, protokoll === "", protokoll.slice(0, 200));
    const alsText = JSON.stringify(ergebnis);
    check(`J ${name}: kein API-Schluessel im Ergebnis`, !alsText.includes(TEST_SCHLUESSEL), alsText);
    check(`J ${name}: kein Token und kein Link im Ergebnis`,
      !alsText.includes("einladungs-token-1") && !alsText.includes("passwort-setzen"), alsText);
    check(`J ${name}: kein Empfaenger im Ergebnis`, !alsText.includes(TEST_EMPFAENGER), alsText);
    check(`J ${name}: Ergebnis traegt nur Statusfelder`,
      Object.keys(ergebnis).every((k) => ["sent", "reason", "transport", "status", "fehlerart"].includes(k)), alsText);
  }
  check("J Gruende sind nutzdatenfreie Codes",
    mitschnitte.every(([, e]) => e.reason === undefined || /^[a-z0-9-]+$/.test(String(e.reason))),
    JSON.stringify(mitschnitte.map(([, e]) => e.reason)));
  check("J redact kennt HELMUT_RESEND_API_KEY als Secret",
    require("../lib/helmut/redact").SECRET_ENV_NAMES.includes("HELMUT_RESEND_API_KEY"));
  check("J redact entfernt einen versehentlich eingebetteten Schluessel",
    !require("../lib/helmut/redact")
      .redactSensitive(`Fehler mit key=${TEST_SCHLUESSEL}`, { HELMUT_RESEND_API_KEY: TEST_SCHLUESSEL })
      .includes(TEST_SCHLUESSEL));

  // ── K · Echter HTTP-Ablauf gegen ein gestubbtes globales fetch ───────────────────────────
  // Der Serverpfad kann kein fetchImpl entgegennehmen — deshalb wird hier das globale fetch
  // im Testprozess ersetzt. Nicht-Resend-Ziele laufen unveraendert weiter (Loopback).
  const gesendet = [];
  let stubAntwort = jsonAntwort(200, { id: "e2e-1" });
  const echtesFetch = globalThis.fetch;
  globalThis.fetch = async (url, optionen) => {
    if (String(url).startsWith("https://api.resend.com/")) {
      gesendet.push({ url: String(url), optionen, rumpf: JSON.parse(optionen.body) });
      if (typeof stubAntwort === "function") return stubAntwort();
      return stubAntwort;
    }
    return echtesFetch(url, optionen);
  };

  const handler = require("../server.js");
  const accounts = require("../lib/helmut/accounts");
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    process.env.HELMUT_MAIL_TRANSPORT = "resend";
    process.env.HELMUT_RESEND_API_KEY = TEST_SCHLUESSEL;
    process.env.HELMUT_MAIL_FROM = TEST_ABSENDER;
    process.env.HELMUT_MAIL_REPLY_TO = TEST_ANTWORT;
    // NEUE VORBEDINGUNG seit 2026-08-04 (Befund B1, Host-Header-Poisoning): Der echte
    // Versand verlangt eine Basis-URL, die NICHT aus dem faelschbaren `Host`-Kopf stammt.
    // Ohne diesen Wert antwortet der Server hier korrekt mit
    // `mail-basis-url-nicht-vertrauenswuerdig` und sendet nichts — dieser Abschnitt will
    // aber den Versandpfad pruefen. Die Sperre selbst ist in
    // scripts/resend-mail-haertung-test.js Abschnitt C festgenagelt (beide Richtungen).
    process.env.HELMUT_PUBLIC_URL = "https://helmut.example.org";

    await accounts.createUser({ email: "admin-resend@example.org", name: "Admin Resend", role: "admin", password: "sicher-genug-1" });
    const loginRes = await req(port, "POST", "/api/auth/login", { body: { email: "admin-resend@example.org", password: "sicher-genug-1" } });
    const adminCookie = String(loginRes.headers["set-cookie"][0]).split(";")[0];
    const csrf = parse((await req(port, "GET", "/api/security/csrf", { headers: { Cookie: adminCookie } })).body).token;
    const adminWrite = { Cookie: adminCookie, "x-csrf-token": csrf };

    // K1) Admin legt ein Konto an -> genau eine Nachricht an Resend.
    gesendet.length = 0;
    const create = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Eva Eingeladen", email: TEST_EMPFAENGER, role: "abgeordneter", party: "SPD"
    } })).body);
    check("K1 Kontoanlage liefert weiterhin den Kopierlink", String(create.inviteUrl || "").includes("/passwort-setzen?token="), String(create.inviteUrl));
    check("K1 Mail-Status ehrlich sent:true", create.mail && create.mail.sent === true, JSON.stringify(create.mail));
    check("K1 genau EINE Nachricht an Resend", gesendet.length === 1, `n=${gesendet.length}`);
    check("K1 Ziel ist die Resend-API", gesendet.length === 1 && gesendet[0].url === RESEND_URL, gesendet[0] && gesendet[0].url);
    check("K1 Bearer-Kopfzeile gesetzt",
      gesendet.length === 1 && gesendet[0].optionen.headers.Authorization === `Bearer ${TEST_SCHLUESSEL}`);
    check("K1 Empfaenger korrekt", gesendet.length === 1 && gesendet[0].rumpf.to[0] === TEST_EMPFAENGER, JSON.stringify(gesendet[0] && gesendet[0].rumpf.to));
    check("K1 Absender und Antwortadresse korrekt",
      gesendet.length === 1 && gesendet[0].rumpf.from === TEST_ABSENDER && gesendet[0].rumpf.reply_to === TEST_ANTWORT,
      JSON.stringify(gesendet[0] && [gesendet[0].rumpf.from, gesendet[0].rumpf.reply_to]));
    check("K1 Betreff ist der Einladungsbetreff", gesendet.length === 1 && gesendet[0].rumpf.subject === "Deine Einladung zu Helmut");
    check("K1 Text traegt denselben Token wie der Kopierlink",
      gesendet.length === 1 && tokenFromText(gesendet[0].rumpf.text) === new URL(create.inviteUrl).searchParams.get("token"));
    check("K1 HTTP-Antwort verraet weder Schluessel noch Anbieterkennung",
      !JSON.stringify(create).includes(TEST_SCHLUESSEL) && !JSON.stringify(create).includes("e2e-1"), "");

    // K2) Anbieterfehler -> ehrliches sent:false, Kopierlink bleibt der Rueckfallweg.
    stubAntwort = jsonAntwort(422, { statusCode: 422, message: "domain not verified", name: "validation_error" });
    gesendet.length = 0;
    const fehler = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Otto Offen", email: "otto@example.org", role: "demo"
    } })).body);
    check("K2 Anbieterfehler -> ehrliches sent:false", fehler.mail && fehler.mail.sent === false, JSON.stringify(fehler.mail));
    check("K2 Grund und Status sind benannt",
      fehler.mail && fehler.mail.reason === "resend-abgelehnt" && fehler.mail.status === 422, JSON.stringify(fehler.mail));
    check("K2 Kopierlink weiterhin vorhanden (Rueckfallweg)",
      String(fehler.inviteUrl || "").includes("/passwort-setzen?token="), String(fehler.inviteUrl));
    check("K2 Token funktioniert unveraendert",
      parse((await req(port, "GET", `/api/auth/password-token?token=${encodeURIComponent(new URL(fehler.inviteUrl).searchParams.get("token"))}`)).body).valid === true);
    check("K2 keine Antwort leakt Hashes oder Anbietertext",
      !/passwordHash|passwordSalt|tokenHash|domain not verified/.test(JSON.stringify(fehler)), "");

    // K3) Netzausfall bei Resend -> ehrliches sent:false, Konto- und Tokenverhalten unveraendert.
    stubAntwort = () => Promise.reject(Object.assign(new Error("getaddrinfo ENOTFOUND api.resend.com"), { name: "TypeError" }));
    gesendet.length = 0;
    const ausfall = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Nina Netzlos", email: "nina@example.org", role: "demo"
    } })).body);
    check("K3 Netzausfall -> ehrliches sent:false", ausfall.mail && ausfall.mail.sent === false, JSON.stringify(ausfall.mail));
    check("K3 Grund benennt die Nichterreichbarkeit", ausfall.mail && ausfall.mail.reason === "resend-nicht-erreichbar", JSON.stringify(ausfall.mail));
    check("K3 Kopierlink weiterhin vorhanden", String(ausfall.inviteUrl || "").includes("/passwort-setzen?token="));

    // K4) Ohne Transportvariable geht wieder GAR nichts an Resend.
    delete process.env.HELMUT_MAIL_TRANSPORT;
    stubAntwort = jsonAntwort(200, { id: "darf-nicht-passieren" });
    gesendet.length = 0;
    const ohne = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Paul Papierlos", email: "paul@example.org", role: "demo"
    } })).body);
    check("K4 ohne Transportvariable: kein Aufruf an Resend", gesendet.length === 0, `n=${gesendet.length}`);
    check("K4 ohne Transportvariable: bisheriger Status unveraendert",
      ohne.mail && ohne.mail.sent === false && ohne.mail.reason === "mail-versand-nicht-konfiguriert", JSON.stringify(ohne.mail));
    check("K4 ohne Transportvariable: Kopierlink unveraendert", String(ohne.inviteUrl || "").includes("/passwort-setzen?token="));
  } finally {
    await new Promise((r) => server.close(r));
    globalThis.fetch = echtesFetch;
    delete process.env.HELMUT_MAIL_TRANSPORT;
    delete process.env.HELMUT_RESEND_API_KEY;
    delete process.env.HELMUT_MAIL_FROM;
    delete process.env.HELMUT_MAIL_REPLY_TO;
    delete process.env.HELMUT_PUBLIC_URL;
  }

  // ── L · Der lokale Mailpit-Transport bleibt unveraendert ─────────────────────────────────
  check("L Mailpit-Standardziel unveraendert",
    transport.transportKonfiguration(MAILPIT_ENV).aktiv === true
    && transport.transportKonfiguration({ HELMUT_MAIL_TRANSPORT: "mailpit" }).sendeUrl === "http://127.0.0.1:8025/api/v1/send");
  check("L Mailpit bleibt in Production gesperrt",
    transport.transportKonfiguration({ ...MAILPIT_ENV, NODE_ENV: "production" }).grund === "mailpit-in-production-gesperrt");
  check("L Mailpit bleibt auf Vercel gesperrt",
    transport.transportKonfiguration({ ...MAILPIT_ENV, VERCEL: "1" }).grund === "mailpit-in-vercel-gesperrt");
  check("L Mailpit lehnt fremde Ziele weiterhin ab",
    transport.transportKonfiguration({ HELMUT_MAIL_TRANSPORT: "mailpit", HELMUT_MAILPIT_URL: "http://mail.example.com:8025" }).grund === "mailpit-nur-loopback");
  const mailpitFetch = testFetch(jsonAntwort(200, { ID: "mailpit-1" }));
  const mailpitStatus = await inviteMail.sendAccessMail(
    { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "Text" },
    { env: { ...MAILPIT_ENV, HELMUT_MAIL_FROM: TEST_ABSENDER }, fetchImpl: mailpitFetch });
  check("L Mailpit-Versand funktioniert unveraendert",
    mailpitStatus.sent === true && mailpitStatus.transport === "mailpit", JSON.stringify(mailpitStatus));
  check("L Mailpit-Rumpf traegt weiterhin den Mailpit-Vertrag",
    JSON.parse(mailpitFetch.zustand.letzteOptionen.body).From.Email === "noreply@helmut.test"
    && Array.isArray(JSON.parse(mailpitFetch.zustand.letzteOptionen.body).To));
  check("L Mailpit-Anfrage traegt KEINE Authorization-Kopfzeile",
    mailpitFetch.zustand.letzteOptionen.headers.Authorization === undefined);
  const verwechselt1 = await transport.sendeMailpit({ to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "T", text: "T" },
    { env: RESEND_ENV, fetchImpl: testFetch(jsonAntwort(200, { ID: "x" })) });
  check("L Resend-Konfiguration kann nicht ueber den Mailpit-Pfad senden",
    verwechselt1.sent === false && verwechselt1.reason === "mail-transport-fehlgeleitet", JSON.stringify(verwechselt1));
  const verwechselt2 = await transport.sendeResend({ to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "T", text: "T" },
    { env: { ...MAILPIT_ENV, HELMUT_MAIL_FROM: TEST_ABSENDER }, fetchImpl: testFetch(jsonAntwort(200, { id: "x" })) });
  check("L Mailpit-Konfiguration kann nicht ueber den Resend-Pfad senden",
    verwechselt2.sent === false && verwechselt2.reason === "mail-transport-fehlgeleitet", JSON.stringify(verwechselt2));

  console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Resend-Transport-Assertions`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
