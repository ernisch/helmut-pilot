"use strict";

// Helmut — gemeinsames Layout fuer Systemmails (HTML + reiner Text).
// =============================================================================================
// ZWECK, IN EINEM SATZ: Es gibt GENAU EINE Stelle, die aus einer Inhaltsbeschreibung eine
// fertige Helmut-Mail baut — HTML und Textfassung entstehen aus DEMSELBEN Datensatz und
// koennen deshalb inhaltlich nicht auseinanderlaufen.
//
// WAS HIER NICHT PASSIERT: Es wird nichts versendet, nichts konfiguriert, nichts
// protokolliert. Die Transportauswahl steckt vollstaendig in mail-transport.js, die
// Wortlaute in invite-mail.js. Dieses Modul ist reine Formatierung.
//
// GESTALTUNGSENTSCHEIDUNGEN (begruendet, nicht beliebig):
//   1. TABELLENLAYOUT + DIREKTE STILE. Outlook (Word-Renderer) kann weder Flexbox noch Grid
//      und ignoriert `<style>`-Bloecke teilweise vollstaendig. Jede layoutrelevante Regel
//      steht deshalb als `style=""` direkt am Element; der `<style>`-Block traegt nur
//      Verbesserungen, ohne die die Mail trotzdem richtig aussieht (Mobil-Abstaende).
//   2. SYSTEMSCHRIFTEN. Keine extern geladene Schrift — das waere ein Ladevorgang zu einem
//      fremden Server und damit ein Rueckkanal, der verraet, wann eine Mail geoeffnet wurde.
//   3. KEINE BILDER, keine Grafiken, kein Zaehlpixel, keine Animation, keine Social-Links,
//      kein verstecktes Vorschautext-Element. Der Helmut-Schriftzug ist echter Text.
//   4. HELLER HINTERGRUND, schmale Spalte (max. 600 px). 600 px ist die Breite, ab der
//      Outlook-Leseansichten zuverlaessig nicht mehr umbrechen.
//   5. FARBEN AUS DEM BESTEHENDEN DESIGNSYSTEM (styles.css, Light-Mode-Tokens) — als
//      deckende Hex-Werte, weil `rgba()` und CSS-Variablen in Mailprogrammen unzuverlaessig
//      sind. Jede Text-/Hintergrundkombination erfuellt WCAG AA (Werte unten).
//
// SICHERHEIT:
//   - JEDER dynamische Wert (Name, Link, Absender) geht durch `escapeHtml`. Es gibt in
//     diesem Modul KEINEN Pfad, auf dem ein Wert unmaskiert in die HTML-Ausgabe gelangt.
//     Der Escaper ist bewusst der EINE bereits vorhandene im Repo (template.js) — eine
//     zweite, eigene Kopie wuerde frueher oder spaeter davon abweichen.
//   - Ziel-Links werden zusaetzlich geprueft: nur `http:`/`https:`. Ist der Link nicht
//     sicher, entfaellt Schaltflaeche UND Verlinkung; die Adresse erscheint dann nur noch
//     als maskierter Text (fail closed). Das ist relevant, weil die Basis-URL im lokalen
//     Betrieb aus der `Host`-Kopfzeile stammt.

const { escapeHtml } = require("./template");

// --- Markenwerte ---------------------------------------------------------------------------
// Herkunft: styles.css, Block `:root[data-theme="light"]`. Kontraste gegen #ffffff bzw.
// gegen die Schaltflaechenfarbe, gerechnet nach WCAG 2.1:
//   #0f1729 auf #ffffff  = 16,9:1   (Fliesstext, Schriftzug)
//   #4c5568 auf #ffffff  =  7,3:1   (Nebentext, Hinweis)
//   #ffffff auf #2c3f9e  =  9,0:1   (Schaltflaechenbeschriftung)
//   #2c3f9e auf #ffffff  =  9,0:1   (Links)
// Damit liegt jede Kombination ueber AA (4,5:1) und ueber AAA (7:1).
const FARBE = Object.freeze({
  seite: "#f4f6fb",        // --command-bg (light)
  karte: "#ffffff",        // --paper (light)
  linie: "#e2e6ef",        // --line (light), deckend gerechnet
  text: "#0f1729",         // --text (light)
  gedaempft: "#4c5568",    // --muted (light), deckend gerechnet
  akzent: "#2c3f9e",       // --accent-ink (light)
  aufAkzent: "#ffffff"     // --ink-button (light)
});

// Systemschriften. Bewusst mit Arial/Helvetica am Ende: Outlook faellt sonst auf Times zurueck.
const SCHRIFT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const MAX_BREITE = 600;

// --- Linkpruefung --------------------------------------------------------------------------

// Liefert die URL zurueck, wenn sie gefahrlos in ein `href` darf, sonst null.
// Bewusst eng: nur http/https, keine Steuerzeichen, kein Leerraum. `javascript:`, `data:`
// und `vbscript:` scheitern damit an der Protokollpruefung, nicht an einer Musterliste.
function sichereZielUrl(roh) {
  const wert = String(roh == null ? "" : roh).trim();
  if (wert === "") return null;
  // Steuerzeichen (inkl. CR/LF/TAB) und Leerraum koennen Parser in Mailprogrammen
  // auseinanderlaufen lassen — `java\nscript:` ist der klassische Fall.
  if (/[\s\u0000-\u001F\u007F]/.test(wert)) return null;
  let url;
  try {
    url = new URL(wert);
  } catch (_) {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return wert;
}

// --- Bausteine -----------------------------------------------------------------------------

function absatzHtml(inhalt, { gedaempft = false, oben = 0 } = {}) {
  const farbe = gedaempft ? FARBE.gedaempft : FARBE.text;
  const groesse = gedaempft ? "14px" : "16px";
  const hoehe = gedaempft ? "22px" : "26px";
  return `<p style="margin:${oben}px 0 0 0;padding:0;font-family:${SCHRIFT};font-size:${groesse};`
    + `line-height:${hoehe};color:${farbe};">${inhalt}</p>`;
}

// Schaltflaeche nach dem in Mailprogrammen belastbaren Muster: die Hintergrundfarbe sitzt
// auf der Tabellenzelle (Outlook ignoriert `background` auf `<a>`), die Beschriftung im
// `<a>` mit `display:inline-block` und eigenem Innenabstand.
function schaltflaecheHtml(label, url) {
  const beschriftung = escapeHtml(label);
  const ziel = escapeHtml(url);
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0 0;">`,
    `<tr><td align="center" bgcolor="${FARBE.akzent}" style="background-color:${FARBE.akzent};border-radius:6px;">`,
    `<a href="${ziel}" class="h-knopf" style="display:inline-block;padding:14px 30px;font-family:${SCHRIFT};`,
    `font-size:16px;font-weight:600;line-height:20px;color:${FARBE.aufAkzent};text-decoration:none;`,
    `border-radius:6px;">${beschriftung}</a>`,
    `</td></tr></table>`
  ].join("");
}

// Sichtbarer Rueckfallweg unter der Schaltflaeche: die vollstaendige Adresse im Klartext.
// `word-break` verhindert, dass ein langer Token die 600-px-Spalte sprengt.
function rueckfallHtml(url, verlinkbar) {
  const sichtbar = escapeHtml(url);
  const adresse = verlinkbar
    ? `<a href="${sichtbar}" style="color:${FARBE.akzent};text-decoration:underline;word-wrap:break-word;word-break:break-all;">${sichtbar}</a>`
    : `<span style="color:${FARBE.gedaempft};word-wrap:break-word;word-break:break-all;">${sichtbar}</span>`;
  return [
    absatzHtml("Falls die Schaltfläche nicht funktioniert, kopiere diese Adresse in deinen Browser:",
      { gedaempft: true, oben: 24 }),
    `<p style="margin:6px 0 0 0;padding:0;font-family:${SCHRIFT};font-size:14px;line-height:22px;`,
    `color:${FARBE.akzent};word-wrap:break-word;word-break:break-all;">${adresse}</p>`
  ].join("");
}

// --- Zusammenbau ---------------------------------------------------------------------------

/**
 * Baut HTML- und Textfassung EINER Helmut-Systemmail aus derselben Beschreibung.
 *
 * @param {object} spec
 * @param {string} spec.titel            Betreff (nur fuer <title>, erscheint nicht im Rumpf)
 * @param {string} spec.anrede           z. B. "Hallo Eva," oder "Hallo,"
 * @param {string[]} spec.absaetze       Fliesstext, ein Eintrag je Absatz
 * @param {string} spec.aktionLabel      Beschriftung der Schaltflaeche
 * @param {string} spec.aktionUrl        Ziel der Schaltflaeche (vollstaendige URL)
 * @param {string[]} spec.hinweise       gedaempfte Hinweisabsaetze unter der Trennlinie
 * @param {string[]} spec.gruss          Grussformel, ein Eintrag je Zeile
 * @param {string} spec.absender         Absenderangabe fuer die Fusszeile
 * @param {string} spec.impressumUrl     Impressum-Link fuer die Fusszeile
 * @returns {{html: string, text: string}}
 */
function baueLayout(spec = {}) {
  const titel = String(spec.titel || "");
  const anrede = String(spec.anrede || "");
  const absaetze = Array.isArray(spec.absaetze) ? spec.absaetze.map((a) => String(a)) : [];
  const hinweise = Array.isArray(spec.hinweise) ? spec.hinweise.map((h) => String(h)) : [];
  const gruss = Array.isArray(spec.gruss) ? spec.gruss.map((g) => String(g)) : [];
  const aktionLabel = String(spec.aktionLabel || "");
  const aktionUrlRoh = String(spec.aktionUrl || "");
  const absender = String(spec.absender || "");
  const impressumUrl = String(spec.impressumUrl || "");

  const zielUrl = sichereZielUrl(aktionUrlRoh);
  const verlinkbar = zielUrl !== null;
  // Angezeigt wird IMMER der uebergebene Wert (Ehrlichkeit); verlinkt wird nur der gepruefte.
  const anzeigeUrl = aktionUrlRoh;

  // --- HTML ---------------------------------------------------------------------------------
  // Schriftzug + Haarlinie in EINER Zeile: der Rahmen sitzt am unteren Rand der Zelle,
  // die Linie steht damit in festem Abstand unter dem Wort — ohne Leerzeile dazwischen.
  const kopf = [
    `<tr><td style="padding:0 0 18px 0;border-bottom:1px solid ${FARBE.linie};">`,
    `<span style="font-family:${SCHRIFT};font-size:20px;font-weight:700;letter-spacing:.01em;`,
    `line-height:26px;color:${FARBE.text};">Helmut</span>`,
    `</td></tr>`
  ].join("");

  const koerper = [
    absatzHtml(escapeHtml(anrede), { oben: 24 }),
    ...absaetze.map((a) => absatzHtml(escapeHtml(a), { oben: 16 })),
    verlinkbar ? schaltflaecheHtml(aktionLabel, zielUrl) : "",
    rueckfallHtml(anzeigeUrl, verlinkbar)
  ].join("");

  const hinweisBlock = hinweise.length
    ? [
      // Leerzeile mit unterer Haarlinie: gleicher Abstand ober- und unterhalb der Trennung.
      `<tr><td style="padding:26px 0 0 0;border-bottom:1px solid ${FARBE.linie};font-size:0;line-height:0;">&nbsp;</td></tr>`,
      `<tr><td style="padding:20px 0 0 0;">`,
      hinweise.map((h, i) => absatzHtml(escapeHtml(h), { gedaempft: true, oben: i === 0 ? 0 : 12 })).join(""),
      `</td></tr>`
    ].join("")
    : "";

  const grussBlock = gruss.length
    ? `<tr><td style="padding:28px 0 0 0;">`
      + gruss.map((g, i) => absatzHtml(escapeHtml(g), { oben: i === 0 ? 0 : 4 })).join("")
      + `</td></tr>`
    : "";

  const fussBlock = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${MAX_BREITE}px;">`,
    `<tr><td style="padding:20px 8px 0 8px;font-family:${SCHRIFT};font-size:12px;line-height:20px;color:${FARBE.gedaempft};">`,
    `Absender: ${escapeHtml(absender)}`,
    impressumUrl
      ? ` &middot; <a href="${escapeHtml(impressumUrl)}" style="color:${FARBE.gedaempft};text-decoration:underline;">Impressum</a>`
      : "",
    `</td></tr></table>`
  ].join("");

  const html = [
    `<!doctype html>`,
    `<html lang="de">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<meta name="color-scheme" content="light">`,
    `<meta name="supported-color-schemes" content="light">`,
    `<title>${escapeHtml(titel)}</title>`,
    // Nur Verbesserungen: faellt der Block weg (manche Programme entfernen ihn), bleibt das
    // Layout durch die direkten Stile trotzdem korrekt.
    `<style>`,
    `@media only screen and (max-width:620px){`,
    `.h-huelle{padding:16px 10px !important;}`,
    `.h-karte{padding:24px 20px !important;}`,
    `.h-knopf{display:block !important;text-align:center !important;}`,
    `}`,
    `</style>`,
    `</head>`,
    `<body style="margin:0;padding:0;width:100%;background-color:${FARBE.seite};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${FARBE.seite};">`,
    `<tr><td class="h-huelle" align="center" style="padding:32px 16px;">`,
    `<table role="presentation" width="${MAX_BREITE}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${MAX_BREITE}px;background-color:${FARBE.karte};border:1px solid ${FARBE.linie};border-top:3px solid ${FARBE.akzent};border-radius:8px;">`,
    `<tr><td class="h-karte" style="padding:32px 36px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">`,
    kopf,
    `<tr><td style="padding:0;">${koerper}</td></tr>`,
    hinweisBlock,
    grussBlock,
    `</table>`,
    `</td></tr></table>`,
    fussBlock,
    `</td></tr></table>`,
    `</body>`,
    `</html>`
  ].join("");

  // --- Reiner Text --------------------------------------------------------------------------
  // Semantisch DERSELBE Inhalt, aus DERSELBEN Beschreibung. Keine HTML-Reste, keine
  // Maskierung (Text ist Text) — und der vollstaendige Link steht auch hier.
  const textZeilen = [anrede, ""];
  for (const a of absaetze) textZeilen.push(a, "");
  textZeilen.push(`${aktionLabel}:`, anzeigeUrl, "");
  for (const h of hinweise) textZeilen.push(h, "");
  for (const g of gruss) textZeilen.push(g);
  textZeilen.push("", "—", `Absender: ${absender}${impressumUrl ? ` · Impressum: ${impressumUrl}` : ""}`);

  return { html, text: textZeilen.join("\n") };
}

module.exports = { baueLayout, sichereZielUrl, FARBE, SCHRIFT, MAX_BREITE };
