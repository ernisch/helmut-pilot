"use strict";

// Mail-Texte fuer den Invite-/Reset-Flow (Umsetzungsnotiz §6, Helmut-Ton, "du",
// keine Emoji).
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

const mailTransport = require("./mail-transport");

// Platzhalter laut Notiz — wird beim Mail-Setup durch die echte Absender-Adresse ersetzt.
// Bewusst bei JEDEM Aufruf gelesen (nicht beim Laden des Moduls), damit lokale
// Testlaeufe den Absender setzen koennen, ohne den Prozess neu zu starten.
const MAIL_FROM_DEFAULT = "Helmut <no-reply@…de>";
const IMPRESSUM_URL = "https://helmut-website.vercel.app/impressum.html";

function mailFrom(env = process.env) {
  return (env && env.HELMUT_MAIL_FROM) || MAIL_FROM_DEFAULT;
}

function firstNameOf(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function footer(from) {
  return `—\nAbsender: ${from} · Impressum: ${IMPRESSUM_URL}`;
}

// A · Einladung
function buildInviteMail({ name, inviteUrl } = {}) {
  const vorname = firstNameOf(name);
  const anrede = vorname ? `Hallo ${vorname},` : "Hallo,";
  const from = mailFrom();
  return {
    from,
    subject: "Dein Zugang zu Helmut steht bereit",
    text: [
      anrede,
      "",
      "für dich wurde vom Helmut-Team ein Zugang eingerichtet. Helmut liest morgens den politischen Informationsfluss und sagt dir, was heute zählt — sechs Minuten, dann ist der Tag sortiert.",
      "",
      "Setz zum Start dein Passwort:",
      `Passwort setzen: ${inviteUrl}`,
      "",
      "Der Link ist 7 Tage gültig und funktioniert nur einmal. Wenn du keinen Zugang erwartest, ignoriere diese E-Mail einfach — es passiert nichts.",
      "",
      "— Helmut",
      "",
      footer(from)
    ].join("\n")
  };
}

// B · Passwort zurücksetzen
function buildResetMail({ name, resetUrl } = {}) {
  const vorname = firstNameOf(name);
  const anrede = vorname ? `Hallo ${vorname},` : "Hallo,";
  const from = mailFrom();
  return {
    from,
    subject: "Passwort zurücksetzen",
    text: [
      anrede,
      "",
      "du hast angefragt, dein Helmut-Passwort zurückzusetzen. Hier geht es weiter:",
      `Neues Passwort setzen: ${resetUrl}`,
      "",
      "Der Link ist 1 Stunde gültig und funktioniert nur einmal. Hast du das nicht angefordert, ignoriere diese E-Mail — dein Passwort bleibt unverändert.",
      "",
      "— Helmut",
      "",
      footer(from)
    ].join("\n")
  };
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
async function sendAccessMail(nachricht = {}, opts = {}) {
  const env = opts.env || process.env;
  return mailTransport.sendeMail(nachricht, { ...opts, env });
}

module.exports = { buildInviteMail, buildResetMail, sendAccessMail, isMailConfigured, mailFrom };
