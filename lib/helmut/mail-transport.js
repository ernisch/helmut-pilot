"use strict";

// Helmut — LOKALER Mailpit-Transport fuer Einladungs- und Reset-Mails.
// =============================================================================================
// ZWECK, IN EINEM SATZ: Damit die bestehenden Einladungs- und Passwort-Reset-Ablaeufe waehrend
// der Entwicklung mit ECHTEN Nachrichten geprueft werden koennen, ohne dass jemals eine Mail
// den lokalen Rechner verlaesst.
//
// WAS DIESES MODUL NICHT IST: Es ist KEIN Production-Versand. Es faellt keine Entscheidung
// ueber Anbieter, Absenderdomaene, SPF/DKIM/DMARC, Zustellbarkeit, Bounces oder Versandlimits.
// Der echte Production-Versand ist ein eigener, freigabepflichtiger Sprint.
//
// TRANSPORTENTSCHEIDUNG (belegt, nicht vermutet): Mailpit besitzt seit Langem eine HTTP-API
// zum EINLIEFERN einer Nachricht — `POST {basis}/api/v1/send`, JSON rein, `{"ID":"…"}` raus.
// Fuer die vom Betreiber eingesetzte Version v1.30.6 gegen den Quellcode des Tags geprueft
// (`server/server.go` Routentabelle, `server/apiv1/send.go`). Damit genuegt das bereits
// vorhandene native `fetch`; es wird KEINE SMTP-Bibliothek und keine sonstige externe
// Paketabhaengigkeit gebraucht (`package.json` bleibt abhaengigkeitsfrei).
//
// ADRESSFORMATE — die zwei Seiten der Mailpit-API unterscheiden sich, das ist keine
// Nachlaessigkeit, sondern Mailpits Vertrag:
//   SENDEN (dieses Modul):        {"Email": "…", "Name": "…"}
//   LESEN  (Smoke-Test, Mailpit): {"Address": "…", "Name": "…"}  (Go `net/mail.Address`)
//
// SICHERHEITSGRENZEN — alle fail-closed, jede einzeln offline getestet:
//   1. Der Transport ist AUS, solange `HELMUT_MAIL_TRANSPORT` nicht ausdruecklich `mailpit` ist.
//      Ohne diese Variable verhaelt sich Helmut exakt wie vorher (ehrlicher `sent:false`).
//   2. Production und Vercel koennen den Transport technisch NICHT aktivieren
//      (`NODE_ENV=production`, `VERCEL`, `VERCEL_ENV`) — die Sperre steht VOR der Zielpruefung.
//   3. Ziel darf ausschliesslich Loopback sein (`127.0.0.1`, `localhost`, `::1`).
//   4. Fremde Hosts, Zugangsdaten in der URL, fremde Protokolle und HTTP-Weiterleitungen
//      werden abgelehnt (`redirect: "error"`), Zeilenumbrueche in Kopfzeilenfeldern ebenso.
//   5. Kurzer Zeitabbruch (Standard 3 s), damit ein nicht laufendes Mailpit niemanden blockiert.
//   6. JEDER verweigerte oder fehlgeschlagene Versand liefert `sent:false` mit einem Grund —
//      es gibt keinen Pfad, auf dem ein Fehler als erfolgreicher Versand erscheint.
//   7. Es wird NICHTS protokolliert: kein Empfaenger, kein Text, kein Token, kein Link.
//      Gruende sind feste Codes ohne Nutzdaten.
//
// REINE LOGIK: Umgebung und `fetch` kommen als Parameter herein, damit jede Konstellation
// offline und ohne Netz pruefbar ist (`scripts/mailpit-transport-test.js`).

const MAILPIT_STANDARD_URL = "http://127.0.0.1:8025";
const SENDE_PFAD = "/api/v1/send";

// Bewusst kurz: ein nicht laufendes Mailpit darf einen Admin-Klick nicht haengen lassen.
const STANDARD_TIMEOUT_MS = 3000;

// Genau die im Auftrag benannten Loopback-Schreibweisen. `0.0.0.0` ist bewusst NICHT dabei:
// das ist "alle Schnittstellen", nicht Loopback. Node liefert fuer IPv6 den Hostnamen
// einschliesslich Klammern (`[::1]`) — beide Schreibweisen werden akzeptiert.
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const ERLAUBTE_PROTOKOLLE = new Set(["http:", "https:"]);

// Gruende sind stabile, nutzdatenfreie Codes (sie landen in HTTP-Antworten und duerfen
// deshalb nichts ueber Empfaenger, Inhalt oder Token verraten).
const GRUND = Object.freeze({
  NICHT_KONFIGURIERT: "mail-versand-nicht-konfiguriert",
  TRANSPORT_UNBEKANNT: "mail-transport-unbekannt",
  PRODUCTION_GESPERRT: "mailpit-in-production-gesperrt",
  VERCEL_GESPERRT: "mailpit-in-vercel-gesperrt",
  URL_UNGUELTIG: "mailpit-url-ungueltig",
  PROTOKOLL: "mailpit-protokoll-nicht-erlaubt",
  NUR_LOOPBACK: "mailpit-nur-loopback",
  URL_ZUGANGSDATEN: "mailpit-url-mit-zugangsdaten",
  URL_ABFRAGE: "mailpit-url-mit-abfrage",
  ABSENDER: "mailpit-absender-ungueltig",
  EMPFAENGER: "mailpit-empfaenger-ungueltig",
  KOPFZEILEN: "mailpit-kopfzeilen-einschleusung",
  KEIN_FETCH: "mailpit-fetch-fehlt",
  ZEITABBRUCH: "mailpit-zeitabbruch",
  NICHT_ERREICHBAR: "mailpit-nicht-erreichbar",
  WEITERLEITUNG: "mailpit-weiterleitung-abgelehnt",
  ANTWORT: "mailpit-antwort-fehlerhaft"
});

// --- Umgebungserkennung -------------------------------------------------------------------

// Production/Vercel-Erkennung. Bewusst grosszuegig: JEDER nicht leere Wert von `VERCEL` bzw.
// `VERCEL_ENV` gilt als Deployment — auf Vercel sind diese Variablen immer gesetzt, lokal nie.
function deploymentGrund(env) {
  const e = env || {};
  if (String(e.NODE_ENV || "").trim().toLowerCase() === "production") return GRUND.PRODUCTION_GESPERRT;
  if (String(e.VERCEL || "").trim() !== "") return GRUND.VERCEL_GESPERRT;
  if (String(e.VERCEL_ENV || "").trim() !== "") return GRUND.VERCEL_GESPERRT;
  return null;
}

// --- Zielpruefung -------------------------------------------------------------------------

// Prueft die Mailpit-Basis-URL. Rueckgabe: { ok:true, basis, sendeUrl } | { ok:false, grund }.
// `basis` ist die normalisierte URL ohne abschliessende Schraegstriche (Mailpit kann unter
// einem Webroot laufen), `sendeUrl` der vollstaendige Endpunkt.
function pruefeZiel(roh) {
  const wert = String(roh == null || String(roh).trim() === "" ? MAILPIT_STANDARD_URL : roh).trim();
  let url;
  try {
    url = new URL(wert);
  } catch (_) {
    return { ok: false, grund: GRUND.URL_UNGUELTIG };
  }
  if (!ERLAUBTE_PROTOKOLLE.has(url.protocol)) return { ok: false, grund: GRUND.PROTOKOLL };
  if (url.username || url.password) return { ok: false, grund: GRUND.URL_ZUGANGSDATEN };
  if (url.search || url.hash) return { ok: false, grund: GRUND.URL_ABFRAGE };
  // Exakter Vergleich des Hostnamens — kein `endsWith`, sonst passierte `127.0.0.1.example.org`.
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) return { ok: false, grund: GRUND.NUR_LOOPBACK };
  const basis = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  return { ok: true, basis, sendeUrl: `${basis}${SENDE_PFAD}` };
}

// --- Konfiguration ------------------------------------------------------------------------

// Loest die effektive Transportkonfiguration auf. Wirft nie.
// Rueckgabe: { aktiv:boolean, transport:string, grund:string|null, basis?:string, sendeUrl?:string }
function transportKonfiguration(env = process.env) {
  const e = env || {};
  const transport = String(e.HELMUT_MAIL_TRANSPORT || "").trim().toLowerCase();
  if (transport === "") return { aktiv: false, transport: "", grund: GRUND.NICHT_KONFIGURIERT };
  if (transport !== "mailpit") return { aktiv: false, transport, grund: GRUND.TRANSPORT_UNBEKANNT };

  // Deployment-Sperre VOR der Zielpruefung: in Production/Vercel gibt es keinen Pfad,
  // auf dem eine gueltige Loopback-URL den Transport doch noch scharf schalten koennte.
  const gesperrt = deploymentGrund(e);
  if (gesperrt) return { aktiv: false, transport, grund: gesperrt };

  const ziel = pruefeZiel(e.HELMUT_MAILPIT_URL);
  if (!ziel.ok) return { aktiv: false, transport, grund: ziel.grund };
  return { aktiv: true, transport, grund: null, basis: ziel.basis, sendeUrl: ziel.sendeUrl };
}

function transportAktiv(env = process.env) {
  return transportKonfiguration(env).aktiv === true;
}

// --- Adress- und Kopfzeilenpruefung --------------------------------------------------------

// Kopfzeilen-Einschleusung: CR/LF (und NUL) haben in Absender, Empfaenger und Betreff nichts
// zu suchen. Der Text der Mail ist davon ausgenommen — er ist Nutzlast, keine Kopfzeile.
function hatSteuerzeichen(wert) {
  return /[\r\n\0]/.test(String(wert == null ? "" : wert));
}

// Konservative Adresspruefung: genau ein `@`, beide Seiten nicht leer, keine Leerzeichen,
// keine spitzen Klammern, Punkt in der Domaene. Bewusst strenger als RFC 5322 — hier geht es
// um lokale Testadressen, nicht um Vollstaendigkeit.
function istAdresse(wert) {
  return /^[^\s<>@,;:"()[\]\\]+@[^\s<>@,;:"()[\]\\]+\.[^\s<>@,;:"()[\]\\]+$/.test(String(wert || "").trim());
}

// Zerlegt die vorhandene Absenderkonfiguration (`HELMUT_MAIL_FROM`) in Name + Adresse.
// Akzeptiert `Name <adresse@example.org>` und `adresse@example.org`.
// Rueckgabe: { ok:true, name, email } | { ok:false }.
function parseAbsender(roh) {
  const wert = String(roh || "").trim();
  if (!wert || hatSteuerzeichen(wert)) return { ok: false };
  const spitz = wert.match(/^(.*?)\s*<([^<>]+)>$/);
  const name = spitz ? spitz[1].trim().replace(/^"|"$/g, "") : "";
  const email = (spitz ? spitz[2] : wert).trim();
  if (!istAdresse(email)) return { ok: false };
  return { ok: true, name, email };
}

// --- Versand ------------------------------------------------------------------------------

// Uebergibt EINE Nachricht an das lokale Mailpit. Wirft nie; liefert immer einen ehrlichen
// Status. `opts.fetchImpl`/`opts.env`/`opts.timeoutMs` existieren ausschliesslich fuer Tests.
async function sendeMailpit(nachricht = {}, opts = {}) {
  const env = opts.env || process.env;
  const konfig = opts.konfiguration || transportKonfiguration(env);
  if (!konfig.aktiv) return { sent: false, reason: konfig.grund };

  const von = parseAbsender(nachricht.from);
  if (!von.ok) return { sent: false, reason: GRUND.ABSENDER };

  const an = String(nachricht.to || "").trim();
  if (!istAdresse(an)) return { sent: false, reason: GRUND.EMPFAENGER };

  const betreff = String(nachricht.subject || "");
  if (hatSteuerzeichen(betreff) || hatSteuerzeichen(an)) return { sent: false, reason: GRUND.KOPFZEILEN };

  const fetchImpl = opts.fetchImpl || (typeof globalThis.fetch === "function" ? globalThis.fetch : null);
  if (!fetchImpl) return { sent: false, reason: GRUND.KEIN_FETCH };

  const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : STANDARD_TIMEOUT_MS;
  const controller = new AbortController();
  let abgebrochen = false;
  const timer = setTimeout(() => { abgebrochen = true; controller.abort(); }, timeoutMs);

  try {
    const antwort = await fetchImpl(konfig.sendeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Mailpit-Sendevertrag (v1.30.6): From {Name,Email}, To [{Name,Email}], Subject, Text.
      body: JSON.stringify({
        From: { Name: von.name, Email: von.email },
        To: [{ Email: an }],
        Subject: betreff,
        Text: String(nachricht.text || "")
      }),
      // Keine Weiterleitung: ein Redirect koennte das Ziel aus dem Loopback herausfuehren.
      redirect: "error",
      signal: controller.signal
    });
    if (!antwort || typeof antwort.status !== "number") return { sent: false, reason: GRUND.ANTWORT };
    if (antwort.status >= 300 && antwort.status < 400) return { sent: false, reason: GRUND.WEITERLEITUNG };
    if (!(antwort.status >= 200 && antwort.status < 300)) return { sent: false, reason: GRUND.ANTWORT };

    // Fail closed: nur eine echte Mailpit-Antwort mit Nachrichtenkennung gilt als Versand.
    let rumpf = "";
    try {
      rumpf = typeof antwort.text === "function" ? await antwort.text() : "";
    } catch (_) {
      return { sent: false, reason: GRUND.ANTWORT };
    }
    let id = "";
    try {
      const daten = JSON.parse(rumpf);
      id = daten && typeof daten.ID === "string" ? daten.ID.trim() : "";
    } catch (_) {
      return { sent: false, reason: GRUND.ANTWORT };
    }
    if (!id) return { sent: false, reason: GRUND.ANTWORT };
    // Die Kennung wird bewusst NICHT zurueckgegeben — der Aufrufer braucht nur den Status.
    return { sent: true, transport: "mailpit" };
  } catch (error) {
    if (abgebrochen || (error && (error.name === "AbortError" || error.name === "TimeoutError"))) {
      return { sent: false, reason: GRUND.ZEITABBRUCH };
    }
    // Undici meldet eine unterbundene Weiterleitung als TypeError mit "redirect" im Text.
    if (error && /redirect/i.test(String(error.message || ""))) {
      return { sent: false, reason: GRUND.WEITERLEITUNG };
    }
    return { sent: false, reason: GRUND.NICHT_ERREICHBAR };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  MAILPIT_STANDARD_URL,
  STANDARD_TIMEOUT_MS,
  GRUND,
  pruefeZiel,
  parseAbsender,
  istAdresse,
  transportKonfiguration,
  transportAktiv,
  sendeMailpit
};
