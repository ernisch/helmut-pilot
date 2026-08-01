"use strict";

// Mailvorlagen-Test — OFFLINE, ohne Netz, ohne laufendes Mailpit, ohne Resend.
// =============================================================================================
// Prueft die beiden Helmut-Systemmails (Einladung, Passwort zuruecksetzen) als HTML UND als
// reinen Text: lib/helmut/mail-layout.js (Layout, Maskierung, Linkpruefung) und
// lib/helmut/invite-mail.js (Wortlaut, Anrede) — sowie die Frage, ob beide Fassungen
// unveraendert durch die zentrale Versandlogik kommen.
//
// ABSCHNITTE (die Nummern in Klammern sind die Nachweispunkte des Auftrags):
//   A  Einladung: Betreff, Anrede, Link, Schaltflaeche                 (1,2,3,4)
//   B  Passwort-Reset: Betreff, Anrede, Link, Schaltflaeche            (5,6,7,8)
//   C  HTML und Text tragen dieselben wesentlichen Informationen       (9,10)
//   D  Maskierung dynamischer Werte, keine Einschleusung               (11,12)
//   E  Keine externen Bilder, Schriften, Zaehlpixel                    (13)
//   F  Keine internen Kennungen, keine Tokens in Logs/Fehlern          (14,15)
//   G  Layoutregeln (600 px, Tabellen, Kontraste, Systemschriften)
//   H  Beide Fassungen kommen unveraendert durch Mailpit und Resend    (16)
//   I  Linkpruefung: unsichere Ziele werden nicht verlinkt (fail closed)
//
// KEIN NETZ: `fetch` wird ueberall eingespeist. Es gibt in dieser Datei keinen Aufruf, der
// ein echtes Mailpit oder die echte Resend-API erreichen koennte.
// KEINE ECHTEN ADRESSEN: ausschliesslich reservierte Domains (RFC 2606 / RFC 6761).

const layout = require("../lib/helmut/mail-layout");
const inviteMail = require("../lib/helmut/invite-mail");
const transport = require("../lib/helmut/mail-transport");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

// Wächter gegen eine erfundene Gültigkeitsdauer. Bewusst breiter als „Ziffer + Einheit":
// „sieben Tage", „30 Minuten" und „einen Monat" müssen genauso auffallen — sonst genügt eine
// andere Schreibweise, um die Garantie dieses Sprints zu unterlaufen.
const DAUER_MUSTER = new RegExp(
  "\\b(\\d+|ein|eine|einen|einem|einer|zwei|drei|vier|f\u00fcnf|sechs|sieben|acht|neun|zehn|elf|zw\u00f6lf"
  + "|vierundzwanzig|drei\u00dfig|sechzig|neunzig|hundert)\\s*"
  + "(Minute|Minuten|Stunde|Stunden|Tag|Tage|Tagen|Woche|Wochen|Monat|Monate|Monaten|h|min)\\b", "i");

const TEST_ABSENDER = "Helmut <noreply@helmut.test>";
const TEST_EMPFAENGER = "eva@example.org";
const INVITE_URL = "https://helmut.example/passwort-setzen?token=einladungs-token-1";
const RESET_URL = "https://helmut.example/passwort-setzen?token=reset-token-2";

const RESEND_ENV = Object.freeze({
  HELMUT_MAIL_TRANSPORT: "resend",
  HELMUT_RESEND_API_KEY: "re_offline_platzhalter_kein_echter_schluessel",
  HELMUT_MAIL_FROM: TEST_ABSENDER
});
const MAILPIT_ENV = Object.freeze({
  HELMUT_MAIL_TRANSPORT: "mailpit",
  HELMUT_MAILPIT_URL: "http://127.0.0.1:8025",
  HELMUT_MAIL_FROM: TEST_ABSENDER
});

function testFetch(antwort) {
  const zustand = { aufrufe: 0, letzteUrl: null, letzteOptionen: null };
  const fn = async (url, optionen) => {
    zustand.aufrufe += 1;
    zustand.letzteUrl = String(url);
    zustand.letzteOptionen = optionen;
    return typeof antwort === "function" ? antwort(url, optionen) : antwort;
  };
  fn.zustand = zustand;
  return fn;
}

function jsonAntwort(status, rumpf) {
  return { status, text: async () => JSON.stringify(rumpf) };
}

// Entfernt alle Auszeichnungen und liefert den SICHTBAREN Text einer HTML-Mail.
// Bewusst simpel: die Vorlage ist selbst erzeugt, hier wird nichts Fremdes geparst.
function sichtbarerText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Alle href-Ziele der Mail.
function hrefs(html) {
  return Array.from(String(html).matchAll(/href="([^"]*)"/g)).map((m) => m[1]);
}

(async () => {
  process.env.HELMUT_MAIL_FROM = TEST_ABSENDER;

  const einladung = inviteMail.buildInviteMail({ name: "Eva Eingeladen", inviteUrl: INVITE_URL });
  const einladungOhneName = inviteMail.buildInviteMail({ inviteUrl: INVITE_URL });
  const reset = inviteMail.buildResetMail({ name: "Eva Eingeladen", resetUrl: RESET_URL });
  const resetOhneName = inviteMail.buildResetMail({ resetUrl: RESET_URL });

  // ── A · Einladung ───────────────────────────────────────────────────────────────────────
  check("A1 Einladung: Betreff ist „Deine Einladung zu Helmut“",
    einladung.subject === "Deine Einladung zu Helmut", einladung.subject);
  check("A2 Einladung: persoenliche Anrede im Text", einladung.text.startsWith("Hallo Eva,"),
    einladung.text.slice(0, 30));
  check("A2 Einladung: persoenliche Anrede im HTML", sichtbarerText(einladung.html).includes("Hallo Eva,"));
  check("A2 Einladung ohne Namen: neutrale Anrede in beiden Fassungen",
    einladungOhneName.text.startsWith("Hallo,") && sichtbarerText(einladungOhneName.html).includes("Hallo,")
    && !/Hallo\s+\S/.test(einladungOhneName.text.split("\n")[0].replace("Hallo,", "")),
    einladungOhneName.text.slice(0, 20));
  check("A3 Einladung: genau der vorgesehene Aktivierungslink im Text",
    (einladung.text.match(/passwort-setzen\?token=/g) || []).length === 1 && einladung.text.includes(INVITE_URL));
  check("A3 Einladung: Schaltflaeche zeigt auf genau diesen Link",
    (einladung.html.match(/<a href="([^"]*)"[^>]*class="h-knopf"/) || [])[1] === INVITE_URL,
    String((einladung.html.match(/<a href="([^"]*)"[^>]*class="h-knopf"/) || [])[1]));
  check("A3 Einladung: kein zweites, fremdes Linkziel",
    hrefs(einladung.html).every((h) => h === INVITE_URL || h === "https://helmut-website.vercel.app/impressum.html"),
    JSON.stringify(hrefs(einladung.html)));
  check("A4 Einladung: Schaltflaechenbeschriftung „Passwort festlegen“",
    />Passwort festlegen<\/a>/.test(einladung.html) && einladung.text.includes("Passwort festlegen:"));
  check("A Einladung: fuehrt Helmut ein, ohne etwas zu erfinden",
    einladung.text.includes("du wurdest eingeladen, Helmut zu nutzen.")
    && einladung.text.includes("politische Entwicklungen einzuordnen"));
  check("A Einladung: Hinweistext zur Befristung ohne erfundene Zahl",
    einladung.text.includes("Der Link ist nur für dich bestimmt und zeitlich begrenzt.")
    && !DAUER_MUSTER.test(einladung.text) && !DAUER_MUSTER.test(sichtbarerText(einladung.html)),
    einladung.text);
  check("A Einladung: Ignorier-Hinweis vorhanden",
    einladung.text.includes("Falls du diese Einladung nicht erwartet hast"));
  check("A Einladung: Grussformel", einladung.text.includes("Viele Grüße")
    && sichtbarerText(einladung.html).includes("Viele Grüße"));

  // ── B · Passwort-Reset ──────────────────────────────────────────────────────────────────
  check("B5 Reset: Betreff ist „Neues Passwort für Helmut festlegen“",
    reset.subject === "Neues Passwort für Helmut festlegen", reset.subject);
  check("B5 Betreffzeilen sind klar unterscheidbar", einladung.subject !== reset.subject);
  check("B6 Reset: persoenliche Anrede in beiden Fassungen",
    reset.text.startsWith("Hallo Eva,") && sichtbarerText(reset.html).includes("Hallo Eva,"));
  check("B6 Reset ohne Namen: neutrale Anrede in beiden Fassungen",
    resetOhneName.text.startsWith("Hallo,") && sichtbarerText(resetOhneName.html).includes("Hallo,"));
  check("B7 Reset: genau der vorgesehene Reset-Link im Text",
    (reset.text.match(/passwort-setzen\?token=/g) || []).length === 1 && reset.text.includes(RESET_URL));
  check("B7 Reset: Schaltflaeche zeigt auf genau diesen Link",
    (reset.html.match(/<a href="([^"]*)"[^>]*class="h-knopf"/) || [])[1] === RESET_URL,
    String((reset.html.match(/<a href="([^"]*)"[^>]*class="h-knopf"/) || [])[1]));
  check("B7 Reset traegt NICHT den Einladungslink", !reset.text.includes(INVITE_URL) && !reset.html.includes(INVITE_URL));
  check("B8 Reset: Schaltflaechenbeschriftung „Neues Passwort festlegen“",
    />Neues Passwort festlegen<\/a>/.test(reset.html) && reset.text.includes("Neues Passwort festlegen:"));
  check("B Reset: nennt den Anlass, ohne etwas zu erfinden",
    reset.text.includes("für deinen Helmut-Zugang wurde ein neues Passwort angefordert."));
  check("B Reset: Hinweis, dass das bisherige Passwort unveraendert bleibt",
    reset.text.includes("Dein bisheriges Passwort bleibt unverändert."));
  check("B Reset: Befristungshinweis ohne erfundene Zahl",
    reset.text.includes("Der Link ist nur für dich bestimmt und zeitlich begrenzt.")
    && !DAUER_MUSTER.test(reset.text) && !DAUER_MUSTER.test(sichtbarerText(reset.html)), reset.text);
  check("B Einladung und Reset sind in beiden Fassungen verschieden",
    reset.text !== einladung.text && reset.html !== einladung.html);

  // ── C · HTML und Text tragen dieselben wesentlichen Informationen ───────────────────────
  for (const [name, mail, url, label] of [
    ["Einladung", einladung, INVITE_URL, "Passwort festlegen"],
    ["Reset", reset, RESET_URL, "Neues Passwort festlegen"]
  ]) {
    const html = sichtbarerText(mail.html);
    check(`C9 ${name}: beide Fassungen tragen Anrede, Schaltflaechentext und Grussformel`,
      html.includes("Hallo Eva,") && mail.text.includes("Hallo Eva,")
      && html.includes(label) && mail.text.includes(label)
      && html.includes("Viele Grüße") && mail.text.includes("Viele Grüße"));
    // BEIDE Richtungen. Nur Text->HTML zu pruefen liesse HTML-only-Inhalt unentdeckt, nur
    // HTML->Text liesse Textverlust unentdeckt. Verglichen wird strukturell: jeder
    // Inhaltsabsatz der HTML-Fassung ist genau ein <p>-Element.
    const textAbsaetze = mail.text.split("\n").map((z) => z.trim())
      .filter((z) => z.length > 25 && !z.includes("http") && !z.startsWith("Absender:"));
    const fehltImHtml = textAbsaetze.filter((z) => !html.includes(z));
    check(`C9 ${name}: jeder Text-Absatz steht auch im HTML (Richtung Text -> HTML)`,
      textAbsaetze.length >= 4 && fehltImHtml.length === 0,
      `n=${textAbsaetze.length} fehlt: ${fehltImHtml.join(" | ")}`);
    // Rueckrichtung: KEIN <p> der HTML-Fassung darf Inhalt tragen, den die Textfassung nicht
    // hat. Ausgenommen ist einzig die Erklaerung des Rueckfallwegs — sie ist reines Layout.
    const RUECKFALL_ERKLAERUNG = "Falls die Schaltfläche nicht funktioniert";
    const htmlAbsaetze = Array.from(mail.html.matchAll(/<p [^>]*>([\s\S]*?)<\/p>/g))
      .map((m) => sichtbarerText(m[1]))
      .filter((z) => z.length > 25 && !z.includes("http") && !z.startsWith(RUECKFALL_ERKLAERUNG));
    const fehltImText = htmlAbsaetze.filter((z) => !mail.text.includes(z));
    check(`C9 ${name}: kein HTML-Absatz traegt Inhalt, den die Textfassung nicht hat (HTML -> Text)`,
      htmlAbsaetze.length >= 4 && fehltImText.length === 0,
      `n=${htmlAbsaetze.length} fehlt: ${fehltImText.join(" | ")}`);
    check(`C10 ${name}: vollstaendiger Link sichtbar in BEIDEN Fassungen`,
      mail.text.includes(url) && html.includes(url), url);
    const posKnopf = mail.html.indexOf(`>${label}</a>`);
    const posRueckfall = mail.html.indexOf("kopiere diese Adresse in deinen Browser");
    check(`C10 ${name}: der sichtbare Rueckfallweg steht unter der Schaltflaeche`,
      posKnopf >= 0 && posRueckfall >= 0 && posKnopf < posRueckfall, `${posKnopf} / ${posRueckfall}`);
    check(`C ${name}: Textfassung enthaelt keine HTML-Auszeichnung`,
      !/<\/?(?:a|p|br|div|span|html|body|table|tr|td|img|style)\b/i.test(mail.text));
    check(`C ${name}: HTML ist ein vollstaendiges Dokument mit UTF-8`,
      mail.html.startsWith("<!doctype html>") && mail.html.includes('<meta charset="utf-8">')
      && mail.html.trim().endsWith("</html>"));
    check(`C ${name}: Umlaute stehen als echte Zeichen, nicht als Entitaet`,
      mail.html.includes("Viele Grüße") && !mail.html.includes("&uuml;"));
  }

  // ── D · Maskierung und Einschleusung ────────────────────────────────────────────────────
  const boesartig = '<script>alert("x")</script>';
  // SCHICHT 1 — die Maskierung im Layout. Sie ist DIE Schutzmassnahme und wird deshalb
  // direkt am Layout festgenagelt, unabhaengig davon, was invite-mail vorher herausfiltert.
  {
    const roh = layout.baueLayout({
      titel: `T ${boesartig}`,
      anrede: `Hallo ${boesartig},`,
      absaetze: [`Absatz ${boesartig}`],
      aktionLabel: `Los ${boesartig}`,
      aktionUrl: 'https://a.test/x?t=1"><script>alert(1)</script>',
      hinweise: [`Hinweis ${boesartig}`],
      gruss: [`Gruss ${boesartig}`],
      absender: `Helmut ${boesartig} <x@a.test>`,
      impressumUrl: 'https://a.test/i?x="><script>alert(1)</script>'
    });
    check("D11 Layout: KEIN Feld laesst Auszeichnung durch (neun Einsetzstellen auf einmal)",
      !/<script/i.test(roh.html) && !/<\/script/i.test(roh.html));
    check("D11 Layout: die Auszeichnung erscheint maskiert, geht also nicht verloren",
      (roh.html.match(/&lt;script&gt;/g) || []).length >= 9,
      String((roh.html.match(/&lt;script&gt;/g) || []).length));
    check("D12 Layout: keine Ereignis-Attribute (onload/onerror/onclick)", !/\son[a-z]+\s*=/i.test(roh.html));
    check("D12 Layout: kein javascript:-Ziel irgendwo im HTML", !/javascript:/i.test(roh.html));
    check("D11 Layout: Anfuehrungszeichen brechen kein Attribut auf",
      !/<img/i.test(layout.baueLayout({
        titel: "T", anrede: '"><img src=x onerror=alert(1)>', absaetze: ["A"], aktionLabel: "L",
        aktionUrl: "https://a.test/x", hinweise: ["H"], gruss: ["G"], absender: "H <x@a.test>", impressumUrl: ""
      }).html));
    check("D11 Layout: Kaufmanns-Und wird maskiert",
      layout.baueLayout({
        titel: "T", anrede: "Hallo Eva&Otto,", absaetze: ["A"], aktionLabel: "L",
        aktionUrl: "https://a.test/x", hinweise: ["H"], gruss: ["G"], absender: "H <x@a.test>", impressumUrl: ""
      }).html.includes("Hallo Eva&amp;Otto,"));
    check("D11 der Maskierer verhaelt sich wie erwartet (fuenf Zeichen)",
      require("../lib/helmut/template").escapeHtml('<>&"\'') === "&lt;&gt;&amp;&quot;&#39;",
      require("../lib/helmut/template").escapeHtml('<>&"\''));
  }
  // SCHICHT 2 — invite-mail laesst einen solchen Wert gar nicht erst zur Anrede werden.
  // Zweite, UNABHAENGIGE Schicht; sie ersetzt die Maskierung nicht.
  const boese = inviteMail.buildInviteMail({ name: `${boesartig} Eva`, inviteUrl: INVITE_URL });
  check("D12 manipulierter Namensteil wird gar nicht erst zur Anrede",
    boese.text.startsWith("Hallo Eva,") && !boese.html.includes("script"), boese.text.slice(0, 40));
  check("D12 kein ausfuehrbares script-Element in der Mail",
    !/<script/i.test(boese.html) && !/<\/script/i.test(boese.html));
  check("D12 keine Ereignis-Attribute (onload/onerror/onclick)", !/\son[a-z]+\s*=/i.test(boese.html));
  check("D12 kein javascript:-Ziel irgendwo im HTML", !/javascript:/i.test(boese.html));
  check("D12 URL-artiger Namensteil wird nicht zur Anrede (Mailprogramme verlinken das)",
    inviteMail.anredeAus("http://evil.example Eva") === "Hallo Eva,"
    && inviteMail.anredeAus("www.evil.example Eva") === "Hallo Eva,"
    && inviteMail.anredeAus("http://evil.example") === "Hallo,",
    inviteMail.anredeAus("http://evil.example Eva"));
  {
    // Nicht nur der Name ist ein Fremdwert: die Basis-URL entsteht im lokalen Betrieb aus
    // der `Host`-Kopfzeile (server.js publicBaseUrl) und ist damit von aussen beeinflussbar.
    // Der Link muss deshalb an JEDER Stelle maskiert sein — Schaltflaeche UND Rueckfallweg.
    const boeseUrl = 'http://a.example/passwort-setzen?token=x"><script>alert(1)</script>';
    const mitBoeserUrl = inviteMail.buildInviteMail({ name: "Eva", inviteUrl: boeseUrl });
    check("D11 Sonderzeichen im Link brechen weder Attribut noch Textfluss auf",
      !mitBoeserUrl.html.includes('"><script>') && !/<script/i.test(mitBoeserUrl.html)
      && mitBoeserUrl.html.includes("&quot;&gt;&lt;script&gt;"), "");
    check("D11 der Link ist an JEDER Stelle maskiert (Schaltflaeche, Rueckfall-Ziel, Rueckfall-Text)",
      (mitBoeserUrl.html.match(/&quot;&gt;&lt;script&gt;/g) || []).length === 3,
      String((mitBoeserUrl.html.match(/&quot;&gt;&lt;script&gt;/g) || []).length));
  }
  check("D Umlaute und Sonderzeichen im Namen bleiben lesbar",
    inviteMail.buildInviteMail({ name: "Renée Öçal-Groß", inviteUrl: INVITE_URL }).text.startsWith("Hallo Renée,"));
  check("D E-Mail-Adresse als Namensfeld ergibt KEINE Adress-Anrede",
    inviteMail.buildInviteMail({ name: "kontakt@example.org", inviteUrl: INVITE_URL }).text.startsWith("Hallo,"));
  check("D Titel im Namensfeld werden uebersprungen",
    inviteMail.anredeAus("Dr. h.c. Maximiliane-Charlotte von Sonnenberg") === "Hallo Maximiliane-Charlotte,",
    inviteMail.anredeAus("Dr. h.c. Maximiliane-Charlotte von Sonnenberg"));
  check("D absurd langer Vorname faellt auf die neutrale Anrede zurueck",
    inviteMail.anredeAus(`${"x".repeat(200)} Eva`) === "Hallo,");
  check("D Namensfeld ohne einen einzigen Buchstaben ergibt die neutrale Anrede",
    inviteMail.anredeAus("123 456") === "Hallo," && inviteMail.anredeAus("--") === "Hallo,");
  check("D Sortierform „Nachname, Vorname“ gruesst mit dem VORnamen",
    inviteMail.anredeAus("Müller, Eva") === "Hallo Eva,"
    && inviteMail.anredeAus("Mustermann, Erika Dr.") === "Hallo Erika,",
    inviteMail.anredeAus("Müller, Eva"));
  check("D „Vorname Nachname, Titel“ bleibt trotzdem richtig",
    inviteMail.anredeAus("Eva Müller, MdB") === "Hallo Eva,", inviteMail.anredeAus("Eva Müller, MdB"));
  check("D gaengige Vornamensformen gehen durch (Bindestrich, Apostroph, nicht-lateinisch)",
    inviteMail.anredeAus("Jean-Luc Picard") === "Hallo Jean-Luc,"
    && inviteMail.anredeAus("O’Brien Eva") === "Hallo O’Brien,"
    && inviteMail.anredeAus("Ayşe Yılmaz") === "Hallo Ayşe,",
    [inviteMail.anredeAus("Jean-Luc Picard"), inviteMail.anredeAus("O’Brien Eva"), inviteMail.anredeAus("Ayşe Yılmaz")].join(" | "));

  // ── E · Keine externen Ressourcen, kein Zaehlpixel ──────────────────────────────────────
  for (const [name, mail] of [["Einladung", einladung], ["Reset", reset]]) {
    check(`E13 ${name}: kein Bild-Element`, !/<img\b/i.test(mail.html));
    check(`E13 ${name}: keine externe Schriftart (@font-face / fonts.googleapis)`,
      !/@font-face/i.test(mail.html) && !/fonts\.(googleapis|gstatic)/i.test(mail.html));
    check(`E13 ${name}: kein @import, kein <link>, kein <script>`,
      !/@import/i.test(mail.html) && !/<link\b/i.test(mail.html) && !/<script\b/i.test(mail.html));
    check(`E13 ${name}: keine Hintergrundbilder (url(…) in Stilen)`, !/url\s*\(/i.test(mail.html));
    check(`E13 ${name}: keine 1x1-Zaehlpixel-Muster`,
      !/width="1"/.test(mail.html) && !/height="1"/.test(mail.html) && !/display\s*:\s*none/i.test(mail.html));
    // Genau zwei Ziele sind zulaessig: der Aktionslink und das Impressum. Alles andere
    // waere ein Rueckkanal oder ein Marketingelement.
    const ziele = new Set(hrefs(mail.html));
    check(`E13 ${name}: GENAU zwei Linkziele (Aktion + Impressum), nicht mehr und nicht weniger`,
      ziele.size === 2, JSON.stringify([...ziele]));
    check(`E13 ${name}: keine Social-Media-Ziele`,
      ![...ziele].some((z) => /(twitter|x\.com|facebook|instagram|linkedin|mastodon|bsky|youtube)/i.test(z)));
    check(`E ${name}: keine Abmelde-/Marketingfloskeln`,
      !/(abmelden|newsletter|unsubscribe|jetzt entdecken|kostenlos testen)/i.test(sichtbarerText(mail.html)));
  }

  // ── F · Keine internen Kennungen, keine Tokens in Logs ──────────────────────────────────
  // Reale Feldnamen aus accounts.js/storage.js — sie duerfen in keiner Fassung auftauchen.
  const INTERN = /(userId|user_id|tenantId|mandatsId|passwordHash|passwordSalt|tokenHash|"role"|abgeordneter|admin\b)/;
  for (const [name, mail] of [["Einladung", einladung], ["Reset", reset]]) {
    check(`F14 ${name}: keine interne Kennung im Text`, !INTERN.test(mail.text), mail.text.slice(0, 80));
    check(`F14 ${name}: keine interne Kennung im sichtbaren HTML`, !INTERN.test(sichtbarerText(mail.html)));
    check(`F14 ${name}: keine Rolle, kein Mandant, keine Nutzer-ID im HTML-Quelltext`,
      !/data-user|data-tenant|x-helmut-user/i.test(mail.html));
  }
  {
    // Der Token darf ausschliesslich IM Link stehen — nirgends sonst, und in keinem Log.
    const zeilen = [];
    const echt = { log: console.log, warn: console.warn, error: console.error, info: console.info };
    for (const k of Object.keys(echt)) console[k] = (...a) => zeilen.push(a.map(String).join(" "));
    let gebaut;
    try {
      gebaut = inviteMail.buildInviteMail({ name: "Eva", inviteUrl: "https://helmut.example/passwort-setzen?token=GEHEIM-TOKEN-XYZ" });
      await inviteMail.sendAccessMail({ to: TEST_EMPFAENGER, ...gebaut }, { env: {} });
    } finally {
      for (const k of Object.keys(echt)) console[k] = echt[k];
    }
    check("F15 Vorlagenbau und Versandversuch protokollieren nichts", zeilen.length === 0, zeilen.join(" | "));
    check("F15 der Token steht ausschliesslich im Link",
      (gebaut.text.match(/GEHEIM-TOKEN-XYZ/g) || []).length === 1
      && (gebaut.html.match(/GEHEIM-TOKEN-XYZ/g) || []).length === 3, // Schaltflaeche + Rueckfall-href + Rueckfall-Text
      `text=${(gebaut.text.match(/GEHEIM-TOKEN-XYZ/g) || []).length} html=${(gebaut.html.match(/GEHEIM-TOKEN-XYZ/g) || []).length}`);
    check("F15 der Token steht nicht im Betreff und nicht im <title>",
      !gebaut.subject.includes("GEHEIM-TOKEN-XYZ")
      && !/<title>[^<]*GEHEIM-TOKEN-XYZ/.test(gebaut.html));
    const ohneTransport = await inviteMail.sendAccessMail({ to: TEST_EMPFAENGER, ...gebaut }, { env: {} });
    check("F15 Fehlermeldung ohne Transport nennt weder Token noch Empfaenger",
      ohneTransport.sent === false && !JSON.stringify(ohneTransport).includes("GEHEIM-TOKEN-XYZ")
      && !JSON.stringify(ohneTransport).includes(TEST_EMPFAENGER), JSON.stringify(ohneTransport));
  }

  // ── G · Layoutregeln ────────────────────────────────────────────────────────────────────
  check("G Inhaltsbereich ist auf 600 px begrenzt", einladung.html.includes("max-width:600px"));
  check("G Tabellenbasiertes Layout mit direkten Stilen",
    einladung.html.includes('role="presentation"') && (einladung.html.match(/<table/g) || []).length >= 3
    && einladung.html.includes('cellpadding="0"'));
  check("G Heller Hintergrund (Seite und Karte)",
    einladung.html.includes("background-color:#f4f6fb") && einladung.html.includes("background-color:#ffffff"));
  check("G Helmut-Schriftzug ist echter Text, kein Logo", sichtbarerText(einladung.html).startsWith("Helmut"));
  check("G Nur Systemschriften", einladung.html.includes("-apple-system")
    && einladung.html.includes("Arial, sans-serif") && !/Inter|Roboto:wght|@font-face/.test(einladung.html.replace("Roboto,", "")));
  check("G Schaltflaeche traegt Hintergrundfarbe auf der Zelle (Outlook-fest)",
    /<td[^>]*bgcolor="#2c3f9e"[^>]*background-color:#2c3f9e/.test(einladung.html));
  check("G Lesbare Schriftgroessen (Fliesstext 16 px, Nebentext 14 px, nichts unter 12 px)",
    einladung.html.includes("font-size:16px") && einladung.html.includes("font-size:14px")
    && !/font-size:(?:[0-9]|1[01])px/.test(einladung.html));
  check("G Mobil-Regel vorhanden (Abstaende auf schmalen Schirmen)",
    einladung.html.includes("@media only screen and (max-width:620px)")
    && einladung.html.includes('<meta name="viewport"'));
  check("G Farben stammen aus dem Designsystem (Light-Mode-Tokens)",
    layout.FARBE.text === "#0f1729" && layout.FARBE.akzent === "#2c3f9e" && layout.FARBE.karte === "#ffffff");
  {
    // Kontraste werden GERECHNET, nicht behauptet — und zwar jeweils gegen den Hintergrund,
    // auf dem der Text tatsaechlich steht. Die Fusszeile steht als einzige NICHT auf der
    // weissen Karte, sondern auf dem Seitenhintergrund.
    const leuchtdichte = (hex) => {
      const teile = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * teile[0] + 0.7152 * teile[1] + 0.0722 * teile[2];
    };
    const kontrast = (a, b) => {
      const x = leuchtdichte(a), y = leuchtdichte(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const paare = [
      ["Fliesstext", layout.FARBE.text, layout.FARBE.karte],
      ["Nebentext auf der Karte", layout.FARBE.gedaempft, layout.FARBE.karte],
      ["Schaltflaechenbeschriftung", layout.FARBE.aufAkzent, layout.FARBE.akzent],
      ["Links auf der Karte", layout.FARBE.akzent, layout.FARBE.karte],
      ["Fusszeile auf dem Seitenhintergrund", layout.FARBE.gedaempftAufSeite, layout.FARBE.seite]
    ];
    for (const [was, vorn, hinten] of paare) {
      const k = kontrast(vorn, hinten);
      check(`G Kontrast erfuellt AAA (>= 7:1): ${was}`, k >= 7, `${k.toFixed(2)}:1 (${vorn} auf ${hinten})`);
    }
    check("G die Fusszeile benutzt NICHT die Kartenfarbe (die verfehlte dort AAA)",
      layout.FARBE.gedaempftAufSeite !== layout.FARBE.gedaempft
      && einladung.html.includes(`color:${layout.FARBE.gedaempftAufSeite}`));
  }
  check("G Langer Link kann die Spalte nicht sprengen", einladung.html.includes("word-break:break-all"));

  // ── H · Beide Fassungen kommen unveraendert durch die zentrale Versandlogik ─────────────
  {
    const f = testFetch(jsonAntwort(200, { ID: "mailpit-testkennung" }));
    const status = await transport.sendeMail({ to: TEST_EMPFAENGER, ...einladung }, { env: MAILPIT_ENV, fetchImpl: f });
    const rumpf = JSON.parse(f.zustand.letzteOptionen.body);
    check("H16 Mailpit: Versand gemeldet", status.sent === true && status.transport === "mailpit", JSON.stringify(status));
    check("H16 Mailpit: Feldname ist HTML (gegen v1.30.6 belegt)", typeof rumpf.HTML === "string" && rumpf.HTML.length > 0);
    check("H16 Mailpit: HTML-Teil ist byte-identisch zur Vorlage", rumpf.HTML === einladung.html);
    check("H16 Mailpit: Text-Teil ist byte-identisch zur Vorlage", rumpf.Text === einladung.text);
    check("H16 Mailpit: Betreff unveraendert", rumpf.Subject === "Deine Einladung zu Helmut");
  }
  {
    const f = testFetch(jsonAntwort(200, { id: "resend-testkennung" }));
    const status = await transport.sendeMail({ to: TEST_EMPFAENGER, ...reset }, { env: RESEND_ENV, fetchImpl: f });
    const rumpf = JSON.parse(f.zustand.letzteOptionen.body);
    check("H16 Resend: Versand gemeldet", status.sent === true && status.transport === "resend", JSON.stringify(status));
    check("H16 Resend: Feldname ist html (Anbietervertrag)", typeof rumpf.html === "string" && rumpf.html.length > 0);
    check("H16 Resend: HTML-Teil ist byte-identisch zur Vorlage", rumpf.html === reset.html);
    check("H16 Resend: Text-Teil ist byte-identisch zur Vorlage", rumpf.text === reset.text);
    check("H16 Resend: Betreff unveraendert", rumpf.subject === "Neues Passwort für Helmut festlegen");
    check("H16 Resend: der Schluessel steht NICHT im Rumpf",
      !String(f.zustand.letzteOptionen.body).includes(RESEND_ENV.HELMUT_RESEND_API_KEY));
  }
  {
    // Rueckwaertskompatibilitaet: eine Nachricht OHNE HTML-Teil bleibt byte-identisch zu
    // der Fassung vor dieser Arbeit — der Schluessel steht dann gar nicht erst im Rumpf.
    const f = testFetch(jsonAntwort(200, { ID: "x" }));
    await transport.sendeMail({ to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Nur Text", text: "Nur Text" },
      { env: MAILPIT_ENV, fetchImpl: f });
    const rumpf = JSON.parse(f.zustand.letzteOptionen.body);
    check("H Ohne HTML-Teil bleibt der Mailpit-Rumpf unveraendert (kein HTML-Schluessel)",
      rumpf.HTML === undefined && Object.keys(rumpf).join(",") === "From,To,Subject,Text", Object.keys(rumpf).join(","));
    const g = testFetch(jsonAntwort(200, { id: "x" }));
    await transport.sendeMail({ to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Nur Text", text: "Nur Text" },
      { env: RESEND_ENV, fetchImpl: g });
    check("H Ohne HTML-Teil bleibt der Resend-Rumpf unveraendert (kein html-Schluessel)",
      JSON.parse(g.zustand.letzteOptionen.body).html === undefined);
  }
  {
    // Der HTML-Teil ist Nutzlast, keine Kopfzeile: Zeilenumbrueche darin duerfen den
    // Versand NICHT blockieren — die Kopfzeilenpruefung gilt weiter fuer Betreff/Adressen.
    const f = testFetch(jsonAntwort(200, { ID: "x" }));
    const mitUmbruch = await transport.sendeMail(
      { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test", text: "a\nb", html: "<p>a</p>\r\n<p>b</p>" },
      { env: MAILPIT_ENV, fetchImpl: f });
    check("H Zeilenumbrueche im HTML-Teil blockieren den Versand nicht", mitUmbruch.sent === true, JSON.stringify(mitUmbruch));
    const g = testFetch(jsonAntwort(200, { ID: "x" }));
    const betreffEinschleusung = await transport.sendeMail(
      { to: TEST_EMPFAENGER, from: TEST_ABSENDER, subject: "Test\r\nBcc: fremd@example.org", text: "x", html: "<p>x</p>" },
      { env: MAILPIT_ENV, fetchImpl: g });
    check("H Kopfzeilen-Einschleusung im Betreff bleibt trotz HTML-Teil gesperrt",
      betreffEinschleusung.sent === false && betreffEinschleusung.reason === "mailpit-kopfzeilen-einschleusung"
      && g.zustand.aufrufe === 0, JSON.stringify(betreffEinschleusung));
  }

  // ── I · Linkpruefung: fail closed ───────────────────────────────────────────────────────
  check("I sichereZielUrl laesst http und https durch",
    layout.sichereZielUrl("http://127.0.0.1:3000/x") === "http://127.0.0.1:3000/x"
    && layout.sichereZielUrl("https://helmut.example/x?token=a-b_c") === "https://helmut.example/x?token=a-b_c");
  check("I das Ziel muss BUCHSTAEBLICH mit http:// oder https:// beginnen",
    layout.sichereZielUrl("HTTPS://A.TEST/x") === "HTTPS://A.TEST/x"
    && layout.sichereZielUrl("https:/a.test/x") === null
    && layout.sichereZielUrl("https:a.test/x") === null,
    JSON.stringify([layout.sichereZielUrl("https:/a.test/x"), layout.sichereZielUrl("https:a.test/x")]));
  for (const boeses of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<script>x</script>",
    "vbscript:msgbox", "file:///etc/passwd", "//helmut.example/x", "", "   ", "java\nscript:alert(1)",
    "http://helmut.example/ onmouseover=x", "https:/\\/\\evil.example/x", "mailto:x@a.test"]) {
    check(`I unsicheres Ziel wird abgelehnt: ${JSON.stringify(boeses).slice(0, 40)}`,
      layout.sichereZielUrl(boeses) === null, String(layout.sichereZielUrl(boeses)));
  }
  {
    const unsicher = inviteMail.buildInviteMail({ name: "Eva", inviteUrl: "javascript:alert(1)" });
    check("I unsicheres Ziel: KEINE Schaltflaeche, KEIN href auf das Ziel",
      !unsicher.html.includes('href="javascript') && !/>Passwort festlegen<\/a>/.test(unsicher.html));
    check("I unsicheres Ziel: die Adresse erscheint nur noch als maskierter Text",
      unsicher.html.includes("javascript:alert(1)") && !/javascript:alert\(1\)"/.test(unsicher.html));
    check("I unsicheres Ziel: Textfassung bleibt ehrlich und zeigt den Wert",
      unsicher.text.includes("javascript:alert(1)"));
    // Ohne Schaltflaeche darf die Beschriftung nicht verschwinden — sonst traegt die
    // Textfassung eine Information, die dem HTML fehlt.
    check("I unsicheres Ziel: beide Fassungen tragen weiterhin die Beschriftung",
      sichtbarerText(unsicher.html).includes("Passwort festlegen:")
      && unsicher.text.includes("Passwort festlegen:"), sichtbarerText(unsicher.html).slice(0, 200));
    check("I unsicheres Ziel: das Impressum bleibt der einzige verlinkte Rest",
      hrefs(unsicher.html).length === 1
      && hrefs(unsicher.html)[0] === "https://helmut-website.vercel.app/impressum.html",
      JSON.stringify(hrefs(unsicher.html)));
  }
  {
    // Der Impressum-Link laeuft durch DIESELBE Pruefung wie das Aktionsziel — heute eine
    // Code-Konstante, morgen vielleicht konfigurierbar. Direkt am Layout geprueft.
    const boese = layout.baueLayout({
      titel: "T", anrede: "Hallo,", absaetze: ["A"], aktionLabel: "Los", aktionUrl: "https://a.test/x",
      hinweise: ["H"], gruss: ["G"], absender: "Helmut <x@a.test>", impressumUrl: "javascript:alert(1)"
    });
    // Uebrig bleiben genau die zwei Ziele des SICHEREN Aktionslinks (Schaltflaeche +
    // Rueckfallweg) — das Impressum ist nicht mehr darunter.
    check("I unsicheres Impressum-Ziel wird nicht verlinkt",
      !/javascript/i.test(hrefs(boese.html).join(" ")) && hrefs(boese.html).length === 2
      && hrefs(boese.html).every((h) => h === "https://a.test/x"), JSON.stringify(hrefs(boese.html)));
    check("I unsicheres Impressum-Ziel bleibt als maskierter Text sichtbar",
      boese.html.includes("Impressum: javascript:alert(1)"));
    const gut = layout.baueLayout({
      titel: "T", anrede: "Hallo,", absaetze: ["A"], aktionLabel: "Los", aktionUrl: "https://a.test/x",
      hinweise: ["H"], gruss: ["G"], absender: "Helmut <x@a.test>", impressumUrl: "https://a.test/impressum"
    });
    check("I sicheres Impressum-Ziel wird normal verlinkt",
      gut.html.includes('href="https://a.test/impressum"'));
  }
  {
    // „Geprüft" und „verlinkt" müssen derselbe String sein. Der Rohwert ist NICHT getrimmt —
    // stünde er im href, wäre ein anderer Wert verlinkt als der, der die Prüfung bestand.
    const mitLeerraum = layout.baueLayout({
      titel: "T", anrede: "Hallo,", absaetze: ["A"], aktionLabel: "Los",
      aktionUrl: "  https://a.test/x?token=1  ",
      hinweise: ["H"], gruss: ["G"], absender: "Helmut <x@a.test>", impressumUrl: ""
    });
    check("I jedes href trägt exakt den geprüften Wert (kein ungetrimmter Rohwert)",
      hrefs(mitLeerraum.html).length === 2
      && hrefs(mitLeerraum.html).every((h) => h === "https://a.test/x?token=1"),
      JSON.stringify(hrefs(mitLeerraum.html)));
    check("I Textfassung zeigt denselben geprüften Wert wie das HTML",
      mitLeerraum.text.includes("\nhttps://a.test/x?token=1\n")
      && !mitLeerraum.text.includes("  https://a.test"), JSON.stringify(mitLeerraum.text.slice(0, 120)));
  }

  delete process.env.HELMUT_MAIL_FROM;
  console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Mailvorlagen-Assertions`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
