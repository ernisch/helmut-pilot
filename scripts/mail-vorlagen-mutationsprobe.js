"use strict";

// Mutationsprobe fuer die Helmut-Systemmails (HTML + reiner Text).
// =============================================================================================
// Ein gruener Test beweist nichts, solange nicht gezeigt ist, dass er auch ROT werden kann.
// Diese Probe baut genau die Fehler ein, die in einer Mailvorlage realistisch passieren —
// vergessene Maskierung, HTML nur halb versendet, falscher Link in der Schaltflaeche,
// externes Bild, erfundene Gueltigkeitsdauer — und prueft, dass
// scripts/mail-vorlagen-test.js JEDEN davon bemerkt.
//
// ARBEITSWEISE (Konvention wie die uebrigen *-mutationsprobe.js): die Arbeitskopie des Repos
// wird NICHT angefasst — fuer jede Mutation entsteht ein Abzug in einem temporaeren
// Verzeichnis; mutiert und ausgefuehrt wird ausschliesslich dort.
// Exit 0 nur, wenn JEDE Mutation die Suite rot macht. Ein nicht gefundener oder mehrdeutiger
// Ankertext beendet die Probe mit Exit 2 (veraltete Probe, keine Aussage).
//
// Aufruf: node scripts/mail-vorlagen-mutationsprobe.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SUITE = "mail-vorlagen-test.js";

const VERZEICHNISSE = ["lib"];
const DATEIEN = ["package.json"];

const MUTATIONEN = [
  {
    // Der klassische Fehler: der Name wird direkt eingesetzt.
    name: "M1 Anrede ohne Maskierung ins HTML (Einschleusung moeglich)",
    datei: "lib/helmut/mail-layout.js",
    von: "    absatzHtml(escapeHtml(anrede), { oben: 24 }),",
    nach: "    absatzHtml(anrede, { oben: 24 }),"
  },
  {
    // Zweite Stelle, an der ein Fremdwert in HTML landet.
    name: "M2 Rueckfall-Adresse ohne Maskierung",
    datei: "lib/helmut/mail-layout.js",
    von: "  const sichtbar = escapeHtml(url);",
    nach: "  const sichtbar = String(url);"
  },
  {
    // Der Escaper selbst wird unvollstaendig — genau die Regression, die eine geteilte
    // Hilfsfunktion irgendwann trifft.
    name: "M3 Maskierer laesst Anfuehrungszeichen durch",
    datei: "lib/helmut/template.js",
    von: "    .replace(/\"/g, \"&quot;\").replace(/'/g, \"&#39;\");",
    nach: "    .replace(/'/g, \"&#39;\");"
  },
  {
    name: "M4 Linkpruefung abgeschaltet (javascript:-Ziel wird verlinkt)",
    datei: "lib/helmut/mail-layout.js",
    von: "  if (url.protocol !== \"http:\" && url.protocol !== \"https:\") return null;",
    nach: "  if (false) return null;"
  },
  {
    name: "M5 HTML-Teil wird gar nicht erst versendet (nur Text kommt an)",
    datei: "lib/helmut/mail-transport.js",
    von: "  return String((nachricht && nachricht.html) || \"\");",
    nach: "  return \"\";"
  },
  {
    name: "M6 Schaltflaeche zeigt auf ein anderes Ziel als der Rueckfallweg",
    datei: "lib/helmut/mail-layout.js",
    von: "    verlinkbar ? schaltflaecheHtml(aktionLabel, zielUrl) : \"\",",
    nach: "    verlinkbar ? schaltflaecheHtml(aktionLabel, \"https://helmut-website.vercel.app/impressum.html\") : \"\","
  },
  {
    name: "M7 externes Bild (Zaehlpixel) im Layout",
    datei: "lib/helmut/mail-layout.js",
    von: "    `</td></tr></table>`,\n    fussBlock,",
    nach: "    `</td></tr></table>`,\n    `<img src=\"https://helmut.example/o.gif\" width=\"1\" height=\"1\" alt=\"\">`,\n    fussBlock,"
  },
  {
    name: "M8 extern geladene Schriftart",
    datei: "lib/helmut/mail-layout.js",
    von: "    `@media only screen and (max-width:620px){`,",
    nach: "    `@import url('https://fonts.googleapis.com/css2?family=Inter');`,\n    `@media only screen and (max-width:620px){`,"
  },
  {
    // Genau die Behauptung, die dieser Sprint entfernt hat: eine Zahl, die eine
    // Umgebungsvariable jederzeit falsch machen kann.
    name: "M9 erfundene Gueltigkeitsdauer im Hinweistext",
    datei: "lib/helmut/invite-mail.js",
    von: "const HINWEIS_BEFRISTUNG = \"Der Link ist nur für dich bestimmt und zeitlich begrenzt.\";",
    nach: "const HINWEIS_BEFRISTUNG = \"Der Link ist nur für dich bestimmt und 7 Tage gültig.\";"
  },
  {
    name: "M10 Textfassung verliert den vollstaendigen Link",
    datei: "lib/helmut/mail-layout.js",
    von: "  textZeilen.push(`${aktionLabel}:`, anzeigeUrl, \"\");",
    nach: "  textZeilen.push(`${aktionLabel}`, \"\");"
  },
  {
    name: "M11 Textfassung verliert die Hinweisabsaetze (Fassungen laufen auseinander)",
    datei: "lib/helmut/mail-layout.js",
    von: "  for (const h of hinweise) textZeilen.push(h, \"\");",
    nach: "  for (const h of []) textZeilen.push(h, \"\");"
  },
  {
    name: "M12 Betreff der Einladung wieder auf den alten Wortlaut",
    datei: "lib/helmut/invite-mail.js",
    von: "const BETREFF_EINLADUNG = \"Deine Einladung zu Helmut\";",
    nach: "const BETREFF_EINLADUNG = \"Dein Zugang zu Helmut steht bereit\";"
  },
  {
    name: "M13 Schaltflaechenbeschriftung des Resets falsch",
    datei: "lib/helmut/invite-mail.js",
    von: "const LABEL_RESET = \"Neues Passwort festlegen\";",
    nach: "const LABEL_RESET = \"Weiter\";"
  },
  {
    // Der Notnagel aus accounts.js schlaegt durch: die Adresse wird zur Anrede.
    name: "M14 E-Mail-Adresse wird als Vorname benutzt",
    datei: "lib/helmut/invite-mail.js",
    von: "  if (roh.includes(\"@\")) return \"\";",
    nach: "  if (false) return \"\";"
  },
  {
    name: "M15 interne Kennung (Rolle) landet in der Mail",
    datei: "lib/helmut/invite-mail.js",
    von: "      \"Lege jetzt dein persönliches Passwort fest, um deinen Zugang zu aktivieren.\"",
    nach: "      \"Lege jetzt dein persönliches Passwort fest, um deinen Zugang zu aktivieren.\",\n"
      + "      \"Deine Rolle: abgeordneter\""
  },
  {
    name: "M16 Inhaltsbreite unbegrenzt (Layout sprengt jede Leseansicht)",
    datei: "lib/helmut/mail-layout.js",
    von: "const MAX_BREITE = 600;",
    nach: "const MAX_BREITE = 1200;"
  },
  {
    // Kein falsches Gruen an der Nahtstelle: der HTML-Teil darf die bestehende
    // Kopfzeilen-Sperre nicht aushebeln.
    name: "M17 Kopfzeilenpruefung faellt weg, sobald ein HTML-Teil vorhanden ist",
    datei: "lib/helmut/mail-transport.js",
    von: "  if (hatSteuerzeichen(betreff) || hatSteuerzeichen(an)) return { sent: false, reason: GRUND.KOPFZEILEN };",
    nach: "  if (!nachricht.html && (hatSteuerzeichen(betreff) || hatSteuerzeichen(an))) return { sent: false, reason: GRUND.KOPFZEILEN };"
  },
  {
    name: "M18 HTML-Schluessel steht auch ohne Inhalt im Rumpf (Rueckwaertskompatibilitaet weg)",
    datei: "lib/helmut/mail-transport.js",
    von: "  if (html) rumpf.HTML = html;",
    nach: "  rumpf.HTML = html;"
  }
];

function kopiereVerzeichnis(quelle, ziel) {
  fs.mkdirSync(ziel, { recursive: true });
  for (const eintrag of fs.readdirSync(quelle, { withFileTypes: true })) {
    const q = path.join(quelle, eintrag.name);
    const z = path.join(ziel, eintrag.name);
    if (eintrag.isDirectory()) kopiereVerzeichnis(q, z);
    else if (eintrag.isFile()) fs.copyFileSync(q, z);
  }
}

function baueAbzug() {
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-mail-vorlagen-mutation-"));
  for (const verzeichnis of VERZEICHNISSE) kopiereVerzeichnis(path.join(ROOT, verzeichnis), path.join(basis, verzeichnis));
  for (const datei of DATEIEN) {
    const q = path.join(ROOT, datei);
    if (fs.existsSync(q)) fs.copyFileSync(q, path.join(basis, datei));
  }
  fs.mkdirSync(path.join(basis, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "scripts", SUITE), path.join(basis, "scripts", SUITE));
  return basis;
}

function fuehreSuiteAus(basis) {
  return spawnSync(process.execPath, [path.join(basis, "scripts", SUITE)], {
    cwd: basis, encoding: "utf8", timeout: 120000,
    env: { ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", HELMUT_V3_STORE: "" }
  });
}

function entferne(basis) {
  try { fs.rmSync(basis, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

(async () => {
  console.log(`Mutationsprobe — Zielsuite: scripts/${SUITE}\n`);

  const basisAbzug = baueAbzug();
  const grundlauf = fuehreSuiteAus(basisAbzug);
  entferne(basisAbzug);
  if (grundlauf.status !== 0) {
    console.log("ABBRUCH  Der unveraenderte Abzug ist bereits rot — die Probe hat keine Aussagekraft.");
    console.log(`${grundlauf.stdout || ""}${grundlauf.stderr || ""}`.split("\n").filter((z) => /FAIL|Error/.test(z)).slice(0, 10).join("\n"));
    process.exit(2);
  }
  console.log("PASS  Gegenprobe: unveraenderter Abzug ist gruen\n");

  let erkannt = 0;
  for (const mutation of MUTATIONEN) {
    const basis = baueAbzug();
    const ziel = path.join(basis, mutation.datei);
    const quelle = fs.readFileSync(ziel, "utf8");
    const treffer = quelle.split(mutation.von).length - 1;
    if (treffer !== 1) {
      entferne(basis);
      console.log(`ABBRUCH  ${mutation.name}: Ankertext ${treffer === 0 ? "nicht gefunden" : `${treffer}x vorhanden`} in ${mutation.datei}.`);
      process.exit(2);
    }
    fs.writeFileSync(ziel, quelle.replace(mutation.von, mutation.nach));
    const lauf = fuehreSuiteAus(basis);
    const ausgabe = `${lauf.stdout || ""}${lauf.stderr || ""}`;
    const rot = lauf.status !== 0;
    const gemeldet = ausgabe.split("\n").filter((z) => z.startsWith("FAIL")).map((z) => z.replace(/\s+--.*$/, "").trim());
    entferne(basis);
    if (rot) {
      erkannt += 1;
      console.log(`ROT   ${mutation.name}`);
      console.log(`      erkannt von: ${gemeldet.slice(0, 3).join(" · ") || "(Abbruch der Suite)"}`);
    } else {
      console.log(`GRUEN ${mutation.name}  <-- NICHT ERKANNT`);
    }
  }

  console.log(`\n${erkannt}/${MUTATIONEN.length} Mutationen erkannt`);
  process.exit(erkannt === MUTATIONEN.length ? 0 : 1);
})().catch((error) => {
  console.error("Mutationsprobe abgebrochen:", error && error.message);
  process.exit(2);
});
