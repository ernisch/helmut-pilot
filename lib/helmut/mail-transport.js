"use strict";

const kommunikationsriegel = require("./kommunikationsriegel");

// Helmut — zentrale Transportschicht fuer Einladungs- und Reset-Mails.
// =============================================================================================
// ZWECK, IN EINEM SATZ: Es gibt GENAU EINE Stelle, an der Helmut eine Nachricht uebergibt —
// mit einer ausdruecklichen Transportauswahl, ohne die niemals etwas versendet wird.
//
// ZWEI TRANSPORTE, beide Default AUS (`HELMUT_MAIL_TRANSPORT` ist leer):
//
//   `mailpit`  LOKALES Testpostfach fuer die Entwicklung. Verlaesst nie den eigenen Rechner,
//              ist in Production und auf Vercel technisch gesperrt.
//              Anleitung: docs/betrieb/lokale-mailtests-mailpit.md
//   `resend`   ECHTER Versand ueber Resend (https://resend.com). Vorbereitet, aber
//              NACH DIESEM SPRINT IN PRODUCTION NICHT AKTIVIERT — der Transport wird erst
//              wirksam, wenn ein Betreiber `HELMUT_MAIL_TRANSPORT=resend` setzt UND ein
//              gueltiger API-Schluessel in der Umgebung steht.
//              Anleitung: docs/betrieb/mailversand-resend.md
//
// OHNE ausdrueckliche Auswahl verhaelt sich Helmut exakt wie vor der Mail-Arbeit:
// `{ sent:false, reason:"mail-versand-nicht-konfiguriert" }`, Zustellweg ist der Kopierlink
// im Admin. Es gibt KEINEN Pfad, auf dem ein fehlender oder fehlerhafter Versand als Erfolg
// erscheint (kein falsches Gruen).
//
// TRANSPORTENTSCHEIDUNG (belegt, nicht vermutet):
//   Mailpit — HTTP-API `POST {basis}/api/v1/send`, gegen den Quellcode des Tags v1.30.6
//             geprueft (`server/server.go` Routentabelle, `server/apiv1/send.go`).
//   Resend  — HTTP-API `POST https://api.resend.com/emails`, Bearer-Authentifizierung,
//             Antwort `{"id":"…"}`.
//   Beide brauchen nur das in Node 22 vorhandene native `fetch`. KEINE SMTP-Bibliothek,
//   KEIN offizielles Resend-Paket, keine neue Abhaengigkeit — `package.json` bleibt
//   `"dependencies": {}`. Das offizielle Paket waere ein zusaetzlicher Lieferkettenpfad
//   fuer genau einen HTTP-Aufruf mit vier Feldern; der Aufwand steht in keinem Verhaeltnis.
//
// ADRESSFORMATE — die Anbieter unterscheiden sich, das ist kein Versehen:
//   Mailpit SENDEN:  {"Email": "…", "Name": "…"}
//   Mailpit LESEN:   {"Address": "…", "Name": "…"}  (Go `net/mail.Address`)
//   Resend SENDEN:   "Name <adresse@domain>" als eine Zeichenkette
//
// MEHRTEILIGE NACHRICHTEN (HTML + reiner Text) — auch hier heissen die Felder verschieden:
//   Mailpit SENDEN:  {"Text": "…", "HTML": "…"}   (gegen v1.30.6 `server/apiv1/send.go`
//                    geprueft und im lokalen Nachweis gegen ein laufendes Mailpit belegt)
//   Resend SENDEN:   {"text": "…", "html": "…"}   (Anbieterdokumentation; offline nicht
//                    gegenpruefbar, weil kein Test je die echte Resend-API aufruft)
//   Beide Felder sind OPTIONAL. Ohne HTML-Teil steht der Schluessel gar nicht erst im Rumpf,
//   das Verhalten ist dann byte-identisch zu der Fassung vor der HTML-Arbeit.
//
// SICHERHEITSGRENZEN — alle fail closed, jede einzeln offline getestet:
//   1. Kein Transport ohne ausdrueckliche Auswahl. Nur die exakten Werte `mailpit` bzw.
//      `resend` schalten ein (Gross-/Kleinschreibung und Leerraum egal, kein Praefix-Treffer).
//   2. Mailpit ist in Production und auf Vercel technisch gesperrt (`NODE_ENV=production`,
//      `VERCEL`, `VERCEL_ENV`) — die Sperre steht VOR jeder Zielpruefung.
//   3. Mailpit-Ziel darf ausschliesslich Loopback sein; fremde Hosts, Zugangsdaten in der URL,
//      fremde Protokolle und Weiterleitungen werden abgelehnt.
//   4. Das Resend-Ziel ist eine KONSTANTE (`https://api.resend.com/emails`) und bewusst NICHT
//      konfigurierbar — eine umstellbare Ziel-URL waere ein Ausleitungsweg fuer den
//      API-Schluessel. Weiterleitungen sind auch hier unterbunden.
//   5. Der API-Schluessel wird AUSSCHLIESSLICH aus der Umgebung gelesen
//      (`HELMUT_RESEND_API_KEY`), steht in KEINEM Konfigurations- oder Ergebnisobjekt und
//      wird ausschliesslich in die `Authorization`-Kopfzeile geschrieben.
//   6. Zeitlimits: Mailpit 3 s (lokal, darf keinen Admin-Klick haengen lassen),
//      Resend 10 s (externer Dienst).
//   7. JEDER verweigerte oder fehlgeschlagene Versand liefert `sent:false` mit einem Grund —
//      es gibt keinen Pfad, auf dem ein Fehler als erfolgreicher Versand erscheint.
//   8. Es wird NICHTS protokolliert: kein Empfaenger, kein Text, kein Token, kein Link,
//      kein Schluessel. Gruende sind feste Codes ohne Nutzdaten; Anbieterfehler werden
//      bereinigt (nur HTTP-Status und eine zeichenweise gefilterte Fehlerart).
//
// REINE LOGIK: Umgebung und `fetch` kommen als Parameter herein, damit jede Konstellation
// offline und ohne Netz pruefbar ist (`scripts/mailpit-transport-test.js`,
// `scripts/resend-transport-test.js`). Kein Test ruft je die echte Resend-API auf.

const TRANSPORT_MAILPIT = "mailpit";
const TRANSPORT_RESEND = "resend";

const MAILPIT_STANDARD_URL = "http://127.0.0.1:8025";
const SENDE_PFAD = "/api/v1/send";

// Bewusst NICHT konfigurierbar (siehe Sicherheitsgrenze 4).
const RESEND_API_URL = "https://api.resend.com/emails";

// Bewusst kurz: ein nicht laufendes Mailpit darf einen Admin-Klick nicht haengen lassen.
const STANDARD_TIMEOUT_MS = 3000;
// Externer Dienst: mehr Luft als lokal, aber kurz genug, dass eine Kontoanlage nicht haengt.
const RESEND_TIMEOUT_MS = 10000;

// Genau die im Auftrag benannten Loopback-Schreibweisen. `0.0.0.0` ist bewusst NICHT dabei:
// das ist "alle Schnittstellen", nicht Loopback. Node liefert fuer IPv6 den Hostnamen
// einschliesslich Klammern (`[::1]`) — beide Schreibweisen werden akzeptiert.
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const ERLAUBTE_PROTOKOLLE = new Set(["http:", "https:"]);

// Gruende sind stabile, nutzdatenfreie Codes (sie landen in HTTP-Antworten und duerfen
// deshalb nichts ueber Empfaenger, Inhalt, Token oder Schluessel verraten).
const GRUND = Object.freeze({
  NICHT_KONFIGURIERT: "mail-versand-nicht-konfiguriert",
  TRANSPORT_UNBEKANNT: "mail-transport-unbekannt",
  TRANSPORT_FALSCH: "mail-transport-fehlgeleitet",
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
  ANTWORT: "mailpit-antwort-fehlerhaft",
  // --- Resend -------------------------------------------------------------------------
  RESEND_SCHLUESSEL_FEHLT: "resend-api-schluessel-fehlt",
  RESEND_SCHLUESSEL_UNGUELTIG: "resend-api-schluessel-ungueltig",
  RESEND_ABSENDER: "resend-absender-ungueltig",
  RESEND_ANTWORTADRESSE: "resend-antwortadresse-ungueltig",
  RESEND_EMPFAENGER: "resend-empfaenger-ungueltig",
  RESEND_KOPFZEILEN: "resend-kopfzeilen-einschleusung",
  RESEND_KEIN_FETCH: "resend-fetch-fehlt",
  RESEND_ZEITABBRUCH: "resend-zeitabbruch",
  RESEND_NICHT_ERREICHBAR: "resend-nicht-erreichbar",
  RESEND_WEITERLEITUNG: "resend-weiterleitung-abgelehnt",
  RESEND_NICHT_AUTORISIERT: "resend-nicht-autorisiert",
  RESEND_LIMIT: "resend-limit-erreicht",
  RESEND_ABGELEHNT: "resend-abgelehnt",
  RESEND_ANTWORT: "resend-antwort-fehlerhaft"
});

// --- Umgebungserkennung -------------------------------------------------------------------

// Production/Vercel-Erkennung. Bewusst grosszuegig: JEDER nicht leere Wert von `VERCEL` bzw.
// `VERCEL_ENV` gilt als Deployment — auf Vercel sind diese Variablen immer gesetzt, lokal nie.
// Gilt NUR fuer Mailpit: Resend ist der vorgesehene Production-Transport und darf dort nicht
// pauschal gesperrt sein — seine Sperre ist die ausdrueckliche Auswahl plus der Schluessel.
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

// --- Adress- und Kopfzeilenpruefung --------------------------------------------------------

// Kopfzeilen-Einschleusung: CR/LF (und NUL) haben in Absender, Empfaenger und Betreff nichts
// zu suchen. Der Text der Mail ist davon ausgenommen — er ist Nutzlast, keine Kopfzeile.
function hatSteuerzeichen(wert) {
  return /[\r\n\0]/.test(String(wert == null ? "" : wert));
}

// Konservative Adresspruefung: genau ein `@`, beide Seiten nicht leer, keine Leerzeichen,
// keine spitzen Klammern, Punkt in der Domaene. Bewusst strenger als RFC 5322 — hier geht es
// um Zugangsmails an bekannte Konten, nicht um Vollstaendigkeit.
function istAdresse(wert) {
  return /^[^\s<>@,;:"()[\]\\]+@[^\s<>@,;:"()[\]\\]+\.[^\s<>@,;:"()[\]\\]+$/.test(String(wert || "").trim());
}

// Zerlegt eine Adresskonfiguration (`HELMUT_MAIL_FROM`, `HELMUT_MAIL_REPLY_TO`) in
// Name + Adresse. Akzeptiert `Name <adresse@example.org>` und `adresse@example.org`.
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

// Baut die EINE Zeichenkette, die Resend als Adressfeld erwartet. Anzeigenamen mit
// Sonderzeichen werden konservativ in Anfuehrungszeichen gesetzt (RFC 5322 quoted-string);
// Steuerzeichen sind bereits durch parseAbsender ausgeschlossen.
function formatAdresse(name, email) {
  const n = String(name || "").trim();
  if (!n) return email;
  if (/^[A-Za-z0-9ÄÖÜäöüß .\-]+$/.test(n)) return `${n} <${email}>`;
  return `"${n.replace(/["\\]/g, "")}" <${email}>`;
}

// API-Schluessel: nur druckbares ASCII ohne Leerraum, vernuenftige Laenge. Bewusst KEINE
// Pruefung auf das heutige `re_`-Praefix — ein Anbieterwechsel des Formats wuerde sonst den
// Versand ohne Not blockieren. Der Wert wird nie geloggt, nie zurueckgegeben.
function istApiSchluessel(wert) {
  return /^[\x21-\x7E]{10,512}$/.test(String(wert || ""));
}

// --- Konfiguration ------------------------------------------------------------------------

// Resend-Teilkonfiguration. Enthaelt NIE den Schluessel — nur die Aussage, dass einer da ist.
function resendKonfiguration(e) {
  const schluessel = String(e.HELMUT_RESEND_API_KEY || "").trim();
  if (schluessel === "") return { grund: GRUND.RESEND_SCHLUESSEL_FEHLT };
  if (!istApiSchluessel(schluessel)) return { grund: GRUND.RESEND_SCHLUESSEL_UNGUELTIG };

  const von = parseAbsender(e.HELMUT_MAIL_FROM);
  if (!von.ok) return { grund: GRUND.RESEND_ABSENDER };

  const antwortRoh = String(e.HELMUT_MAIL_REPLY_TO || "").trim();
  let antwortAdresse = "";
  if (antwortRoh !== "") {
    const antwort = parseAbsender(antwortRoh);
    if (!antwort.ok) return { grund: GRUND.RESEND_ANTWORTADRESSE };
    antwortAdresse = formatAdresse(antwort.name, antwort.email);
  }

  return {
    ok: true,
    sendeUrl: RESEND_API_URL,
    absender: formatAdresse(von.name, von.email),
    antwortAdresse,
    schluesselVorhanden: true
  };
}

// Loest die effektive Transportkonfiguration auf. Wirft nie. Enthaelt NIE ein Secret.
// Rueckgabe: { aktiv:boolean, transport:string, grund:string|null, sendeUrl?, basis?,
//              absender?, antwortAdresse?, schluesselVorhanden? }
function transportKonfiguration(env = process.env) {
  const e = env || {};
  const transport = String(e.HELMUT_MAIL_TRANSPORT || "").trim().toLowerCase();
  if (transport === "") return { aktiv: false, transport: "", grund: GRUND.NICHT_KONFIGURIERT };

  if (transport === TRANSPORT_MAILPIT) {
    // Deployment-Sperre VOR der Zielpruefung: in Production/Vercel gibt es keinen Pfad,
    // auf dem eine gueltige Loopback-URL den Transport doch noch scharf schalten koennte.
    const gesperrt = deploymentGrund(e);
    if (gesperrt) return { aktiv: false, transport, grund: gesperrt };

    const ziel = pruefeZiel(e.HELMUT_MAILPIT_URL);
    if (!ziel.ok) return { aktiv: false, transport, grund: ziel.grund };
    return { aktiv: true, transport, grund: null, basis: ziel.basis, sendeUrl: ziel.sendeUrl };
  }

  if (transport === TRANSPORT_RESEND) {
    const resend = resendKonfiguration(e);
    if (!resend.ok) return { aktiv: false, transport, grund: resend.grund };
    return {
      aktiv: true,
      transport,
      grund: null,
      sendeUrl: resend.sendeUrl,
      absender: resend.absender,
      antwortAdresse: resend.antwortAdresse,
      schluesselVorhanden: true
    };
  }

  return { aktiv: false, transport, grund: GRUND.TRANSPORT_UNBEKANNT };
}

function transportAktiv(env = process.env) {
  return transportKonfiguration(env).aktiv === true;
}

// --- Nachrichtenteile ------------------------------------------------------------------------

// Der HTML-Teil einer Nachricht, oder "" wenn es keinen gibt.
//
// WICHTIG — der HTML-Teil ist NUTZLAST, keine Kopfzeile: er wird deshalb (wie `text`) NICHT
// auf CR/LF geprueft. Zeilenumbrueche gehoeren in HTML hinein; die Kopfzeilenpruefung gilt
// weiterhin ausschliesslich fuer Absender, Empfaenger und Betreff. Die Maskierung
// dynamischer Werte passiert eine Schicht hoeher (lib/helmut/mail-layout.js) — dieser
// Transport reicht durch, er formatiert nicht.
function htmlAnteil(nachricht) {
  return String((nachricht && nachricht.html) || "");
}

// Baut den Mailpit-Sendevertrag. Ohne HTML-Teil ist das Ergebnis byte-identisch zu der
// Fassung vor der HTML-Arbeit — deshalb wird der Schluessel nur bei Inhalt gesetzt.
function mailpitRumpf(von, an, betreff, nachricht) {
  const rumpf = {
    From: { Name: von.name, Email: von.email },
    To: [{ Email: an }],
    Subject: betreff,
    Text: String((nachricht && nachricht.text) || "")
  };
  const html = htmlAnteil(nachricht);
  if (html) rumpf.HTML = html;
  return rumpf;
}

// --- Versand: Mailpit (lokal) ---------------------------------------------------------------

// Uebergibt EINE Nachricht an das lokale Mailpit. Wirft nie; liefert immer einen ehrlichen
// Status. `opts.fetchImpl`/`opts.env`/`opts.timeoutMs` existieren ausschliesslich fuer Tests.
async function sendeMailpit(nachricht = {}, opts = {}) {
  const env = opts.env || process.env;
  const konfig = opts.konfiguration || transportKonfiguration(env);
  if (!konfig.aktiv) return { sent: false, reason: konfig.grund };
  // Verwechslungsschutz: eine Resend-Konfiguration darf hier niemals landen.
  if (konfig.transport !== TRANSPORT_MAILPIT) return { sent: false, reason: GRUND.TRANSPORT_FALSCH };

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
      // Mailpit-Sendevertrag (v1.30.6): From {Name,Email}, To [{Name,Email}], Subject,
      // Text, HTML. `HTML` steht NUR im Rumpf, wenn es auch Inhalt gibt — ohne HTML-Teil
      // ist die Anfrage byte-identisch zu vorher.
      body: JSON.stringify(mailpitRumpf(von, an, betreff, nachricht)),
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
    return { sent: true, transport: TRANSPORT_MAILPIT };
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

// --- Versand: Resend (echter Versand, nur nach ausdruecklicher Aktivierung) -------------------

// Bereinigt die Fehlerart aus einer Resend-Fehlerantwort. Resend liefert dort einen festen
// Bezeichner (z. B. `validation_error`); wir uebernehmen ihn NUR, wenn er einer engen
// Zeichenklasse entspricht. Alles andere (Freitext, Adressen, Zitate der Nutzlast) faellt weg.
function bereinigteFehlerart(rumpf) {
  let daten = null;
  try { daten = JSON.parse(rumpf); } catch (_) { return ""; }
  const roh = daten && typeof daten.name === "string" ? daten.name.trim() : "";
  return /^[a-z][a-z0-9_]{0,39}$/.test(roh) ? roh : "";
}

// Uebergibt EINE Nachricht an Resend. Wirft nie; liefert immer einen ehrlichen Status.
// Der API-Schluessel wird hier — und NUR hier — aus der Umgebung gelesen und ausschliesslich
// in die Authorization-Kopfzeile geschrieben. Er steht in keiner Rueckgabe und in keinem Log.
async function sendeResend(nachricht = {}, opts = {}) {
  const env = opts.env || process.env;
  const konfig = opts.konfiguration || transportKonfiguration(env);
  if (!konfig.aktiv) return { sent: false, reason: konfig.grund };
  // Verwechslungsschutz: ohne ausdrueckliche Resend-Auswahl gibt es hier keinen Versand.
  if (konfig.transport !== TRANSPORT_RESEND) return { sent: false, reason: GRUND.TRANSPORT_FALSCH };

  const von = parseAbsender(nachricht.from);
  if (!von.ok) return { sent: false, reason: GRUND.RESEND_ABSENDER };

  const an = String(nachricht.to || "").trim();
  if (!istAdresse(an)) return { sent: false, reason: GRUND.RESEND_EMPFAENGER };

  const betreff = String(nachricht.subject || "");
  if (hatSteuerzeichen(betreff) || hatSteuerzeichen(an)) return { sent: false, reason: GRUND.RESEND_KOPFZEILEN };

  // Zweite, unabhaengige Schluesselpruefung (die erste steckt in der Konfiguration): auch ein
  // von aussen hereingereichtes Konfigurationsobjekt kann so keinen Versand ohne Schluessel
  // ausloesen.
  const schluessel = String(env.HELMUT_RESEND_API_KEY || "").trim();
  if (schluessel === "") return { sent: false, reason: GRUND.RESEND_SCHLUESSEL_FEHLT };
  if (!istApiSchluessel(schluessel)) return { sent: false, reason: GRUND.RESEND_SCHLUESSEL_UNGUELTIG };

  const fetchImpl = opts.fetchImpl || (typeof globalThis.fetch === "function" ? globalThis.fetch : null);
  if (!fetchImpl) return { sent: false, reason: GRUND.RESEND_KEIN_FETCH };

  const rumpfDaten = {
    from: formatAdresse(von.name, von.email),
    to: [an],
    subject: betreff,
    text: String(nachricht.text || "")
  };
  // Resend-Vertrag: `html` und `text` duerfen gemeinsam gesetzt sein (mehrteilige Nachricht).
  // Das Feld steht NUR im Rumpf, wenn es auch Inhalt gibt.
  const htmlTeil = htmlAnteil(nachricht);
  if (htmlTeil) rumpfDaten.html = htmlTeil;
  if (konfig.antwortAdresse) rumpfDaten.reply_to = konfig.antwortAdresse;

  const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : RESEND_TIMEOUT_MS;
  const controller = new AbortController();
  let abgebrochen = false;
  const timer = setTimeout(() => { abgebrochen = true; controller.abort(); }, timeoutMs);

  try {
    // Ziel ist die KONSTANTE, nicht `konfig.sendeUrl` — ein gefaelschtes Konfigurationsobjekt
    // kann den Schluessel damit nicht an einen fremden Host schicken.
    const antwort = await fetchImpl(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${schluessel}`
      },
      body: JSON.stringify(rumpfDaten),
      redirect: "error",
      signal: controller.signal
    });
    if (!antwort || typeof antwort.status !== "number") return { sent: false, reason: GRUND.RESEND_ANTWORT };

    let rumpf = "";
    try {
      rumpf = typeof antwort.text === "function" ? await antwort.text() : "";
    } catch (_) {
      rumpf = "";
    }

    if (antwort.status >= 300 && antwort.status < 400) return { sent: false, reason: GRUND.RESEND_WEITERLEITUNG };
    if (!(antwort.status >= 200 && antwort.status < 300)) {
      // Bereinigt: nur der HTTP-Status und eine zeichengefilterte Fehlerart verlassen diese
      // Funktion. Der Antworttext von Resend wird NIE weitergereicht.
      const ergebnis = { sent: false, reason: GRUND.RESEND_ABGELEHNT, status: antwort.status };
      if (antwort.status === 401 || antwort.status === 403) ergebnis.reason = GRUND.RESEND_NICHT_AUTORISIERT;
      if (antwort.status === 429) ergebnis.reason = GRUND.RESEND_LIMIT;
      const art = bereinigteFehlerart(rumpf);
      if (art) ergebnis.fehlerart = art;
      return ergebnis;
    }

    // Fail closed: nur eine Antwort mit echter Nachrichtenkennung gilt als Versand.
    let id = "";
    try {
      const daten = JSON.parse(rumpf);
      id = daten && typeof daten.id === "string" ? daten.id.trim() : "";
    } catch (_) {
      return { sent: false, reason: GRUND.RESEND_ANTWORT };
    }
    if (!id) return { sent: false, reason: GRUND.RESEND_ANTWORT };
    // Die Kennung wird bewusst NICHT zurueckgegeben — der Aufrufer braucht nur den Status.
    return { sent: true, transport: TRANSPORT_RESEND };
  } catch (error) {
    if (abgebrochen || (error && (error.name === "AbortError" || error.name === "TimeoutError"))) {
      return { sent: false, reason: GRUND.RESEND_ZEITABBRUCH };
    }
    if (error && /redirect/i.test(String(error.message || ""))) {
      return { sent: false, reason: GRUND.RESEND_WEITERLEITUNG };
    }
    // Netzfehler, DNS, TLS: ehrlich, aber ohne Anbietertext.
    return { sent: false, reason: GRUND.RESEND_NICHT_ERREICHBAR };
  } finally {
    clearTimeout(timer);
  }
}

// --- Zentrale Auswahl -----------------------------------------------------------------------

// Die EINE Stelle, an der entschieden wird, welcher Transport eine Nachricht bekommt.
// Ohne aktive, ausdrueckliche Konfiguration wird KEIN Transport aufgerufen.
async function sendeMail(nachricht = {}, opts = {}) {
  const env = opts.env || process.env;
  // KOMMUNIKATIONSRIEGEL VOR JEDER KONFIGURATIONSPRUEFUNG. Ein "nicht
  // konfiguriert" ist kein Sicherheitsnachweis — deshalb entscheidet der Riegel
  // zuerst und unabhaengig davon, ob ein Transport eingerichtet ist.
  const riegel = kommunikationsriegel.pruefe({
    kanal: opts.kanal === "einladung" ? "einladung" : "mail",
    kennung: opts.kennung || nachricht.kennung || "",
    empfaenger: nachricht.to
  }, env);
  if (!riegel.erlaubt) return { sent: false, gesperrt: true, reason: riegel.grund, riegel };
  const konfig = opts.konfiguration || transportKonfiguration(env);
  if (!konfig.aktiv) return { sent: false, reason: konfig.grund };
  const weiter = { ...opts, env, konfiguration: konfig };
  if (konfig.transport === TRANSPORT_MAILPIT) return sendeMailpit(nachricht, weiter);
  if (konfig.transport === TRANSPORT_RESEND) return sendeResend(nachricht, weiter);
  // Unerreichbar, solange transportKonfiguration nur bekannte Namen aktiv setzt —
  // steht hier als letzte fail-closed-Zeile.
  return { sent: false, reason: GRUND.TRANSPORT_UNBEKANNT };
}

module.exports = {
  kommunikationsriegel,
  TRANSPORT_MAILPIT,
  TRANSPORT_RESEND,
  MAILPIT_STANDARD_URL,
  RESEND_API_URL,
  STANDARD_TIMEOUT_MS,
  RESEND_TIMEOUT_MS,
  GRUND,
  pruefeZiel,
  parseAbsender,
  formatAdresse,
  istAdresse,
  istApiSchluessel,
  transportKonfiguration,
  transportAktiv,
  sendeMailpit,
  sendeResend,
  sendeMail
};
