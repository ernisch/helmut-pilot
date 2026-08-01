"use strict";

// Lokaler VISUELLER Nachweis der Helmut-Systemmails — braucht ein LAUFENDES Mailpit.
// =============================================================================================
// Aufruf (nachdem `mailpit` in einem zweiten Terminal laeuft):
//
//     npm run mail:vorschau
//
// WAS DAS SKRIPT TUT: Es erzeugt die sechs im Sprint verlangten Testnachrichten — Einladung
// und Passwort-Reset, jeweils mit Vornamen, ohne Vornamen, mit einem sehr langen Namen und
// mit Umlauten/Sonderzeichen — uebergibt sie ueber die ECHTE zentrale Versandlogik
// (lib/helmut/mail-transport.js) an das lokale Mailpit und liest jede Nachricht danach
// wieder aus, um beide Fassungen zu pruefen.
//
// Zusaetzlich werden die HTML-Fassungen als Dateien abgelegt (Standard: .helmut-mailvorschau/),
// damit man sie direkt im Browser ansehen oder als Screenshot sichern kann.
//
// GRENZEN, DIE DIESES SKRIPT EINHAELT:
//   - Es verlaesst KEINE Nachricht den lokalen Rechner: der Transport erzwingt Loopback und
//     ist in Production/Vercel technisch gesperrt.
//   - Ausschliesslich reservierte Adressen (RFC 2606: example.org / .test).
//   - Es wird KEIN Konto angelegt, KEIN Token erzeugt, KEIN Datenspeicher angefasst — die
//     Links sind offensichtliche Vorschau-Platzhalter.
//   - Es werden NUR die eigenen Nachrichten dieses Laufs wieder geloescht.
//
// WARUM DIESE DATEI NICHT AUF "-test.js" ENDET: scripts/run-offline-tests.js sammelt jede
// `*-test.js` in die CI-Offline-Suite ein. Dieses Skript braucht ein laufendes Mailpit und
// wuerde dort zwangslaeufig rot — es bleibt deshalb bewusst ausserhalb des Offline-Gates.

const fs = require("fs");
const path = require("path");

const MAILPIT_URL = String(process.env.HELMUT_MAILPIT_URL || "http://127.0.0.1:8025").replace(/\/+$/, "");
const ABSENDER = process.env.HELMUT_MAIL_FROM || "Helmut <noreply@helmut.test>";
const AUSGABE = process.env.HELMUT_MAIL_VORSCHAU_DIR || path.join(__dirname, "..", ".helmut-mailvorschau");

process.env.HELMUT_MAIL_TRANSPORT = "mailpit";
process.env.HELMUT_MAILPIT_URL = MAILPIT_URL;
process.env.HELMUT_MAIL_FROM = ABSENDER;

const inviteMail = require("../lib/helmut/invite-mail");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

const BASIS = "http://127.0.0.1:3000";
const LANGER_NAME = "Maximiliane-Charlotte Freifrau von und zu Sonnenberg-Hohenwaldau";

// Die sechs verlangten Faelle. Die Adressen sind reserviert, die Tokens sind sichtbar
// als Vorschauwerte gekennzeichnet und gehoeren zu keinem Konto.
const FAELLE = [
  { schluessel: "01-einladung-mit-vorname", art: "einladung", name: "Eva Eingeladen", was: "Einladung mit Vorname" },
  { schluessel: "02-einladung-ohne-vorname", art: "einladung", name: "", was: "Einladung ohne Vorname" },
  { schluessel: "03-reset-mit-vorname", art: "reset", name: "Eva Eingeladen", was: "Passwort-Reset mit Vorname" },
  { schluessel: "04-reset-ohne-vorname", art: "reset", name: "", was: "Passwort-Reset ohne Vorname" },
  { schluessel: "05-einladung-langer-name", art: "einladung", name: LANGER_NAME, was: "Einladung mit sehr langem Namen" },
  { schluessel: "06-reset-umlaute", art: "reset", name: "Renée Öçal-Großmann", was: "Passwort-Reset mit Umlaut und Sonderzeichen" }
];

async function mailpit(pfad, optionen) {
  const antwort = await fetch(`${MAILPIT_URL}${pfad}`, optionen);
  if (!antwort.ok) throw new Error(`Mailpit ${pfad} -> HTTP ${antwort.status}`);
  return antwort.json();
}

(async () => {
  console.log(`Mailpit-Vorschau — Ziel: ${MAILPIT_URL}\n`);

  try {
    const info = await mailpit("/api/v1/info");
    console.log(`Mailpit erreichbar: ${info.Version}\n`);
  } catch (error) {
    console.error(`ABBRUCH  Mailpit ist unter ${MAILPIT_URL} nicht erreichbar.`);
    console.error("         Starte es in einem zweiten Terminal mit `mailpit` und versuche es erneut.");
    console.error(`         (${error && error.message})`);
    process.exit(2);
  }

  fs.mkdirSync(AUSGABE, { recursive: true });
  const empfaenger = [];

  for (const fall of FAELLE) {
    const adresse = `vorschau-${fall.schluessel}@example.org`;
    empfaenger.push(adresse);
    const url = `${BASIS}/passwort-setzen?token=vorschau-${fall.schluessel}-kein-echtes-token`;
    const nachricht = fall.art === "einladung"
      ? inviteMail.buildInviteMail({ name: fall.name, inviteUrl: url })
      : inviteMail.buildResetMail({ name: fall.name, resetUrl: url });

    const status = await inviteMail.sendAccessMail({ to: adresse, ...nachricht });
    check(`${fall.schluessel} · ${fall.was}: an Mailpit uebergeben`, status.sent === true, JSON.stringify(status));
    if (!status.sent) continue;

    // Zurueckgelesen wird, was Mailpit TATSAECHLICH gespeichert hat — nicht, was wir
    // gesendet zu haben glauben.
    const treffer = await mailpit(`/api/v1/search?query=${encodeURIComponent(`to:${adresse}`)}`);
    const ids = (treffer.messages || []).map((m) => m.ID);
    check(`${fall.schluessel}: genau EINE Nachricht im Postfach`, ids.length === 1, `n=${ids.length}`);
    if (ids.length !== 1) continue;

    const voll = await mailpit(`/api/v1/message/${ids[0]}`);
    const text = String(voll.Text || "");
    const html = String(voll.HTML || "");
    const erwarteteAnrede = inviteMail.anredeAus(fall.name);
    const label = fall.art === "einladung" ? inviteMail.LABEL_EINLADUNG : inviteMail.LABEL_RESET;
    const betreff = fall.art === "einladung" ? inviteMail.BETREFF_EINLADUNG : inviteMail.BETREFF_RESET;

    check(`${fall.schluessel}: Betreff korrekt`, voll.Subject === betreff, voll.Subject);
    check(`${fall.schluessel}: Mailpit zeigt eine TEXT-Fassung`, text.length > 0);
    check(`${fall.schluessel}: Mailpit zeigt eine HTML-Fassung`, html.startsWith("<!doctype html>"), html.slice(0, 40));
    check(`${fall.schluessel}: Anrede „${erwarteteAnrede}“ in beiden Fassungen`,
      text.startsWith(erwarteteAnrede) && html.includes(erwarteteAnrede.replace(/&/g, "&amp;")));
    check(`${fall.schluessel}: Schaltflaeche „${label}“ im HTML`, html.includes(`>${label}</a>`));
    check(`${fall.schluessel}: vollstaendiger Link in BEIDEN Fassungen`, text.includes(url) && html.includes(url));
    check(`${fall.schluessel}: HTML laedt nichts von aussen`,
      !/<img\b|<script\b|<link\b|@import|url\s*\(/i.test(html));
    check(`${fall.schluessel}: Umlaute kommen unversehrt an`,
      !/Ã|â€|�/.test(`${text}${html}`), "Zeichensatz");

    fs.writeFileSync(path.join(AUSGABE, `${fall.schluessel}.html`), html);
    fs.writeFileSync(path.join(AUSGABE, `${fall.schluessel}.txt`), text);
  }

  // Nur die EIGENEN Nachrichten dieses Laufs wieder entfernen.
  for (const adresse of empfaenger) {
    try {
      await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${adresse}`)}`, { method: "DELETE" });
    } catch (_) { /* Aufraeumen ist best effort */ }
  }

  console.log(`\nHTML- und Textfassungen abgelegt in: ${AUSGABE}`);
  console.log(`Mailpit-Oberflaeche: ${MAILPIT_URL}`);
  console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Vorschau-Assertions`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error("Vorschau-Lauf abgebrochen:", error && error.message);
  process.exit(1);
});
