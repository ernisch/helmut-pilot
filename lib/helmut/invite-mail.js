"use strict";

// Helmut — Wortlaute der beiden Systemmails (Einladung, Passwort zuruecksetzen).
// =============================================================================================
// Hier steht AUSSCHLIESSLICH, WAS in der Mail steht. WIE es aussieht, steckt in
// lib/helmut/mail-layout.js; WOHIN es geht, entscheidet lib/helmut/mail-transport.js.
// Jede Nachricht entsteht in beiden Fassungen aus DERSELBEN Beschreibung — HTML und reiner
// Text koennen deshalb nicht inhaltlich auseinanderlaufen.
//
// VERSAND: Es gibt weiterhin KEINEN aktivierten Production-Versand. Ohne ausdrueckliche
// Konfiguration liefert sendAccessMail unveraendert einen ehrlichen "nicht
// konfiguriert"-Status, und der Admin bekommt den Einladungs-Link kopierbar angezeigt
// (Interim laut §6). Dieser Kopierweg bleibt auch dann der Rueckfallweg, wenn ein echter
// Versand konfiguriert ist und scheitert.
//
// Die Transportauswahl steckt vollstaendig in lib/helmut/mail-transport.js — hier wird
// NICHTS entschieden, nur uebergeben:
//   HELMUT_MAIL_TRANSPORT=mailpit  lokales Testpostfach (docs/betrieb/lokale-mailtests-mailpit.md)
//   HELMUT_MAIL_TRANSPORT=resend   echter Versand ueber Resend, in Production NICHT aktiviert
//                                  (docs/betrieb/mailversand-resend.md)
// Ohne diese Variable wird kein Transport aufgerufen.
//
// KEINE GUELTIGKEITSDAUER IM TEXT — bewusst, und das ist eine Korrektur:
// Die frueheren Fassungen behaupteten "7 Tage gültig" bzw. "1 Stunde gültig". Beides sind
// nur die DEFAULTS von `HELMUT_INVITE_TOKEN_TTL_MS` / `HELMUT_RESET_TOKEN_TTL_MS`
// (lib/helmut/accounts.js) — wer eine der beiden Variablen setzt, bekommt eine Mail, die
// den Empfaenger nachweislich falsch informiert. Eine Zahl, die nicht dauerhaft korrekt
// gehalten wird, gehoert nach Belegpflicht/„kein falsches Gruen" nicht in die Mail.
// Der Hinweis nennt deshalb die Befristung, ohne eine Zahl zu behaupten.

const mailTransport = require("./mail-transport");
const mailLayout = require("./mail-layout");

// Platzhalter laut Notiz — wird beim Mail-Setup durch die echte Absender-Adresse ersetzt.
// Bewusst bei JEDEM Aufruf gelesen (nicht beim Laden des Moduls), damit lokale
// Testlaeufe den Absender setzen koennen, ohne den Prozess neu zu starten.
const MAIL_FROM_DEFAULT = "Helmut <no-reply@…de>";
const IMPRESSUM_URL = "https://helmut-website.vercel.app/impressum.html";

const BETREFF_EINLADUNG = "Ihre Einladung zu Helmut";
const BETREFF_RESET = "Neues Passwort für Helmut festlegen";

const LABEL_EINLADUNG = "Passwort setzen";
const LABEL_RESET = "Neues Passwort festlegen";

const GRUSS = Object.freeze(["Freundliche Grüße", "Helmut"]);

// Gemeinsamer Hinweis beider Mails. Er nennt die Befristung OHNE eine Zahl zu behaupten
// (Begruendung im Kopf dieser Datei) und die Einmaligkeit MIT klarer Aussage — die ist
// naemlich dauerhaft wahr und haengt an keiner Umgebungsvariablen:
// `accounts.setPasswordWithToken` setzt `usedAt`, jeder zweite Versuch endet mit 410.
const HINWEIS_BEFRISTUNG = "Der Link ist nur für Sie bestimmt, zeitlich begrenzt und kann nur einmal verwendet werden.";

function mailFrom(env = process.env) {
  return (env && env.HELMUT_MAIL_FROM) || MAIL_FROM_DEFAULT;
}

// --- Anrede ---------------------------------------------------------------------------------
//
// Es gibt in Helmut KEIN getrenntes Vornamensfeld: `accounts.createUser` speichert genau ein
// `name`-Feld — und faellt, wenn es leer ist, auf die E-Mail-Adresse zurueck
// (`name: String(name||"").trim() || normalizedEmail`). Der Vorname muss deshalb hergeleitet
// werden, und das darf nur passieren, wenn dabei etwas Brauchbares herauskommt.
//
// Es wird NICHTS erfunden: kommt kein plausibler Vorname heraus, gruesst Helmut neutral.

// Titel und Abkuerzungen, die vor dem Vornamen stehen koennen. „Hallo Dr.," waere keine
// natuerliche Anrede — bei Mandatstraegern ist der Doktortitel im Namensfeld haeufig.
const TITEL = new Set([
  "dr", "prof", "herr", "frau", "mdb", "mdl", "med", "habil", "rer", "nat", "phil",
  "dipl", "ing", "hc", "h.c", "jur", "pol"
]);

// Grosszuegig, aber endlich: kein realer Vorname ist laenger. Verhindert nebenbei, dass ein
// absurd langes Namensfeld die Mail aufblaeht oder die Spalte sprengt.
const MAX_VORNAME = 64;

// So sieht ein Vorname aus: Buchstabe am Anfang, danach nur noch Buchstaben, diakritische
// Zeichen, Bindestriche und Apostrophe. „Jean-Luc", „Renée", „O'Brien", „Ayşe" gehen durch.
//
// Was diese Klasse ABSICHTLICH aussperrt — und warum das mehr ist als Kosmetik:
//   `http://example.org`, `www.example.org`  Mailprogramme verlinken so etwas AUTOMATISCH.
//                                            Ein Anzeigename waere damit ein Klickziel in
//                                            einer Mail, die von Helmut zu kommen scheint.
//   `<script>…`, `"><img …`                  Maskierung faengt das ohnehin ab; hier wird es
//                                            zusaetzlich gar nicht erst zur Anrede.
//   `123`, `---`, `kontakt@example.org`      keine Namen.
// Die Maskierung in mail-layout.js bleibt trotzdem DIE Schutzmassnahme — diese Klasse ist
// eine zweite, unabhaengige Schicht, keine Ersatzmassnahme.
const VORNAME_MUSTER = /^\p{L}[\p{L}\p{M}'’´`‐-―-]*$/u;

// Traegt genau einen Wortlauf die Vornamensrolle? Liefert "" wenn nicht.
function ersterBrauchbarerToken(teil) {
  for (const token of String(teil).split(/\s+/)) {
    const sauber = token.replace(/[,;]+$/, "");
    if (sauber === "") continue;
    // Abkuerzungen („Dr.", „h.c.") und bekannte Titel ueberspringen.
    if (sauber.endsWith(".")) continue;
    if (TITEL.has(sauber.toLowerCase())) continue;
    if (!VORNAME_MUSTER.test(sauber)) continue;
    if (sauber.length > MAX_VORNAME) return "";
    return sauber;
  }
  return "";
}

function firstNameOf(name) {
  const roh = String(name == null ? "" : name).trim();
  if (roh === "") return "";
  // Notnagel aus accounts.createUser: eine Adresse ist kein Vorname. Lieber neutral
  // gruessen als „Hallo kontakt@example.org,".
  if (roh.includes("@")) return "";

  // Sortierform „Nachname, Vorname" — in Mandats- und Ausschusslisten die Regel, nicht die
  // Ausnahme. Ohne diese Behandlung gruesste Helmut mit dem NACHnamen.
  // Reihenfolge mit Bedacht: erst hinter dem Komma suchen, dann davor. Damit bleibt
  // „Eva Müller, MdB" richtig (hinter dem Komma steht nur ein Titel, also greift der Teil
  // davor) und „Müller, Eva" wird ebenfalls richtig.
  const komma = roh.indexOf(",");
  if (komma >= 0) {
    const dahinter = ersterBrauchbarerToken(roh.slice(komma + 1));
    if (dahinter) return dahinter;
    return ersterBrauchbarerToken(roh.slice(0, komma));
  }
  return ersterBrauchbarerToken(roh);
}

function anredeAus(name) {
  const vorname = firstNameOf(name);
  return vorname ? `Guten Tag ${vorname},` : "Guten Tag,";
}

// A · Einladung
function buildInviteMail({ name, inviteUrl } = {}) {
  const from = mailFrom();
  const { html, text } = mailLayout.baueLayout({
    titel: BETREFF_EINLADUNG,
    ueberschrift: "Willkommen bei Helmut.",
    anrede: anredeAus(name),
    absaetze: [
      "Ihr Zugang zu Helmut ist vorbereitet.",
      "Legen Sie jetzt Ihr persönliches Passwort in der Helmut App fest. Zur Bestätigung geben Sie es zweimal ein.",
      "Danach sind Sie angemeldet. Künftig melden Sie sich mit Ihrer E-Mail-Adresse und Ihrem Passwort an."
    ],
    aktionLabel: LABEL_EINLADUNG,
    aktionUrl: String(inviteUrl == null ? "" : inviteUrl),
    hinweise: [
      HINWEIS_BEFRISTUNG,
      "Falls Sie diese Einladung nicht erwartet haben, können Sie diese Nachricht ignorieren."
    ],
    gruss: GRUSS,
    absender: from,
    impressumUrl: IMPRESSUM_URL
  });
  return { from, subject: BETREFF_EINLADUNG, text, html };
}

// B · Passwort zurücksetzen
function buildResetMail({ name, resetUrl } = {}) {
  const from = mailFrom();
  const { html, text } = mailLayout.baueLayout({
    titel: BETREFF_RESET,
    ueberschrift: "Ein neues Passwort.",
    anrede: anredeAus(name),
    absaetze: [
      // Abweichung vom Auftragswortlaut („Helmut Zugang"), bewusst und begruendet:
      // Getrenntschreibung waere im Deutschen falsch, und Helmut schreibt sauberes Deutsch.
      "für Ihren Helmut-Zugang wurde ein neues Passwort angefordert.",
      "Über den folgenden Link können Sie ein neues Passwort festlegen."
    ],
    aktionLabel: LABEL_RESET,
    aktionUrl: String(resetUrl == null ? "" : resetUrl),
    hinweise: [
      HINWEIS_BEFRISTUNG,
      "Falls Sie kein neues Passwort angefordert haben, können Sie diese Nachricht ignorieren. Ihr bisheriges Passwort bleibt unverändert."
    ],
    gruss: GRUSS,
    absender: from,
    impressumUrl: IMPRESSUM_URL
  });
  return { from, subject: BETREFF_RESET, text, html };
}

// Wahr genau dann, wenn ein Transport ausdruecklich konfiguriert UND zulaessig ist.
// Ohne HELMUT_MAIL_TRANSPORT bleibt das Ergebnis false — wie bisher.
function isMailConfigured(env = process.env) {
  return mailTransport.transportAktiv(env);
}

// Ehrlicher Versand-Status: ohne konfigurierten Transport wird NICHTS gesendet und der
// Aufrufer weiss es ({ sent:false, reason }). Mit ausdruecklich gewaehltem Transport geht
// genau eine Nachricht an genau diesen Transport; jeder Fehler (nicht erreichbar,
// Zeitabbruch, fremdes Ziel, Production/Vercel, Anbieterfehler, fehlender Schluessel)
// bleibt ebenfalls { sent:false } mit einem nutzdatenfreien Grundcode.
// Es wird NIE etwas protokolliert — die Mail enthaelt den Klartext-Link (DSGVO/Secret-Hygiene).
// Der Kanal wird hier gesetzt, nicht vom Aufrufer: Einladungs- und
// Passwortnachrichten sind fuer den Kommunikationsriegel ein EIGENER Kanal.
// Die Mandatskennung muss der Aufrufer mitgeben (opts.kennung) — ohne sie
// traegt der Riegel auf diesem Weg nur noch das Adresssignal, und genau das
// soll nicht die einzige Absicherung sein.
async function sendAccessMail(nachricht = {}, opts = {}) {
  const env = opts.env || process.env;
  return mailTransport.sendeMail(nachricht, { kanal: "einladung", ...opts, env });
}

module.exports = {
  buildInviteMail,
  buildResetMail,
  sendAccessMail,
  isMailConfigured,
  mailFrom,
  // fuer gezielte Tests:
  firstNameOf,
  anredeAus,
  BETREFF_EINLADUNG,
  BETREFF_RESET,
  LABEL_EINLADUNG,
  LABEL_RESET
};
