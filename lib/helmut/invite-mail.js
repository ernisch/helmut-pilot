"use strict";

// Mail-Texte fuer den Invite-/Reset-Flow (Umsetzungsnotiz §6, Helmut-Ton, "du",
// keine Emoji). Der eigentliche Versand ist bewusst NICHT implementiert: es gibt
// noch keine eigene Domain / keinen Mail-Dienst (Betreiber-Entscheidung offen).
// Bis dahin liefert sendAccessMail einen ehrlichen "nicht konfiguriert"-Status,
// und der Admin bekommt den Einladungs-Link kopierbar angezeigt (Interim laut §6).

// Platzhalter laut Notiz — wird beim Mail-Setup durch die echte Absender-Adresse ersetzt.
const MAIL_FROM = process.env.HELMUT_MAIL_FROM || "Helmut <no-reply@…de>";
const IMPRESSUM_URL = "https://helmut-website.vercel.app/impressum.html";

function firstNameOf(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function footer() {
  return `—\nAbsender: ${MAIL_FROM} · Impressum: ${IMPRESSUM_URL}`;
}

// A · Einladung
function buildInviteMail({ name, inviteUrl } = {}) {
  const vorname = firstNameOf(name);
  const anrede = vorname ? `Hallo ${vorname},` : "Hallo,";
  return {
    from: MAIL_FROM,
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
      footer()
    ].join("\n")
  };
}

// B · Passwort zurücksetzen
function buildResetMail({ name, resetUrl } = {}) {
  const vorname = firstNameOf(name);
  const anrede = vorname ? `Hallo ${vorname},` : "Hallo,";
  return {
    from: MAIL_FROM,
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
      footer()
    ].join("\n")
  };
}

function isMailConfigured() {
  // Wird beim Mail-Setup (Domain + Dienst) durch eine echte Transport-Pruefung ersetzt.
  return false;
}

// Ehrlicher Versand-Status: solange kein Transport existiert, wird NICHTS gesendet
// und der Aufrufer weiss es ({ sent:false }). Die Mail wird bewusst nicht geloggt
// (sie enthaelt den Klartext-Link, DSGVO/Secret-Hygiene).
async function sendAccessMail() {
  if (!isMailConfigured()) {
    return { sent: false, reason: "mail-versand-nicht-konfiguriert" };
  }
  return { sent: false, reason: "kein-transport" };
}

module.exports = { buildInviteMail, buildResetMail, sendAccessMail, isMailConfigured };
