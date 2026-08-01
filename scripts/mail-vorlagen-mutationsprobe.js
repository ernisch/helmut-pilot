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
// run-offline-tests.js wird als Netz-Guard mitkopiert (siehe fuehreSuiteAus).
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
    // BEIDE Wachen auf einmal. Einzeln geht es nicht mehr: seit der Praefixpruefung sind es
    // zwei unabhaengige Schichten, und das Entfernen NUR der Protokollpruefung laesst den
    // Code korrekt (die Praefixpruefung faengt `javascript:` weiterhin ab). Das ist
    // Redundanz, kein Loch — und deshalb waere eine Mutation darauf keine echte Regression.
    // M25 nimmt die Praefixpruefung einzeln zurueck; hier fallen beide.
    name: "M4 Linkpruefung vollstaendig abgeschaltet (javascript:-Ziel wird verlinkt)",
    datei: "lib/helmut/mail-layout.js",
    von: "  if (!/^https?:\\/\\//i.test(wert)) return null;\n"
      + "  let url;\n"
      + "  try {\n"
      + "    url = new URL(wert);\n"
      + "  } catch (_) {\n"
      + "    return null;\n"
      + "  }\n"
      + "  if (url.protocol !== \"http:\" && url.protocol !== \"https:\") return null;",
    nach: "  let url;\n"
      + "  try {\n"
      + "    url = new URL(wert);\n"
      + "  } catch (_) {\n"
      + "    return null;\n"
      + "  }"
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
    von: "      ? schaltflaecheHtml(aktionLabel, zielUrl)",
    nach: "      ? schaltflaecheHtml(aktionLabel, \"https://helmut-website.vercel.app/impressum.html\")"
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
    von: "const HINWEIS_BEFRISTUNG = \"Der Link ist nur für dich bestimmt, zeitlich begrenzt und kann nur einmal verwendet werden.\";",
    nach: "const HINWEIS_BEFRISTUNG = \"Der Link ist nur für dich bestimmt, 7 Tage gültig und kann nur einmal verwendet werden.\";"
  },
  {
    // Die Einmaligkeit ist dauerhaft wahr und soll deshalb IN der Mail stehen.
    name: "M26 Einmaligkeits-Aussage faellt aus dem Hinweis",
    datei: "lib/helmut/invite-mail.js",
    von: "const HINWEIS_BEFRISTUNG = \"Der Link ist nur für dich bestimmt, zeitlich begrenzt und kann nur einmal verwendet werden.\";",
    nach: "const HINWEIS_BEFRISTUNG = \"Der Link ist nur für dich bestimmt und zeitlich begrenzt.\";"
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
    // Realistische Regression: „wir gruessen halt mit dem, was im Namensfeld steht".
    // Ein blosses Entfernen des @-Schutzes genuegt hier NICHT mehr als Mutation — seit der
    // Vornamenspruefung (M22) faengt die Zeichenklasse die Adresse ohnehin ab. Das ist
    // Redundanz, kein Loch; die Mutation muss die Adresse deshalb aktiv durchreichen.
    name: "M14 E-Mail-Adresse wird als Vorname benutzt",
    datei: "lib/helmut/invite-mail.js",
    von: "  if (roh.includes(\"@\")) return \"\";",
    nach: "  if (roh.includes(\"@\")) return roh.split(/\\s+/)[0];"
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
    // Der Fusszeilen-Link ist heute eine Konstante — die Pruefung soll trotzdem bestehen
    // bleiben, falls er je konfigurierbar wird.
    name: "M19 Impressum-Ziel umgeht die Linkpruefung",
    datei: "lib/helmut/mail-layout.js",
    von: "  const impressumZiel = sichereZielUrl(impressumUrl);",
    nach: "  const impressumZiel = impressumUrl;"
  },
  {
    // „Geprueft" und „verlinkt" duerfen nicht auseinanderfallen: der Rohwert ist nicht
    // getrimmt, im href staende sonst ein anderer String als der geprueufte.
    name: "M20 Rueckfall-Link traegt den Rohwert statt des geprueften Ziels",
    datei: "lib/helmut/mail-layout.js",
    von: "  const anzeigeUrl = verlinkbar ? zielUrl : aktionUrlRoh;",
    nach: "  const anzeigeUrl = aktionUrlRoh;"
  },
  {
    // Ohne Schaltflaeche verlaeren die beiden Fassungen die Beschriftung unterschiedlich.
    name: "M21 ohne verlinkbares Ziel faellt die Beschriftung aus dem HTML",
    datei: "lib/helmut/mail-layout.js",
    von: "      : absatzHtml(`<strong>${escapeHtml(aktionLabel)}:</strong>`, { oben: 28 }),",
    nach: "      : \"\","
  },
  {
    name: "M22 Vornamenspruefung abgeschaltet (URL-artiger Name wird zur Anrede)",
    datei: "lib/helmut/invite-mail.js",
    von: "    if (!VORNAME_MUSTER.test(sauber)) continue;",
    nach: "    if (false) continue;"
  },
  {
    name: "M23 Sortierform „Nachname, Vorname“ gruesst wieder mit dem Nachnamen",
    datei: "lib/helmut/invite-mail.js",
    von: "  const komma = roh.indexOf(\",\");",
    nach: "  const komma = -1;"
  },
  {
    name: "M24 Fusszeile benutzt die Kartenfarbe und verfehlt AAA auf dem Seitenhintergrund",
    datei: "lib/helmut/mail-layout.js",
    von: "  gedaempftAufSeite: \"#3f4759\", // dieselbe Rolle, aber auf dem Seitenhintergrund",
    nach: "  gedaempftAufSeite: \"#4c5568\", // dieselbe Rolle, aber auf dem Seitenhintergrund"
  },
  {
    name: "M25 Ziel muss nicht mehr buchstaeblich mit http(s):// beginnen",
    datei: "lib/helmut/mail-layout.js",
    von: "  if (!/^https?:\\/\\//i.test(wert)) return null;",
    nach: "  if (false) return null;"
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
  fs.copyFileSync(path.join(ROOT, "scripts", "run-offline-tests.js"), path.join(basis, "scripts", "run-offline-tests.js"));
  return basis;
}

// Die Suite laeuft im Abzug unter DENSELBEN Bedingungen wie im kanonischen Lauf:
// mit dem Netz-Guard aus scripts/run-offline-tests.js als `--require`-Preload und mit einer
// bereinigten Umgebung. Sonst pruefte die Probe eine Suite, die es so nirgends gibt — und
// eine geerbte Umgebungsvariable koennte ein Ergebnis verfaelschen.
function fuehreSuiteAus(basis) {
  return spawnSync(process.execPath,
    ["--require", path.join(basis, "scripts", "run-offline-tests.js"), path.join(basis, "scripts", SUITE)], {
      cwd: basis, encoding: "utf8", timeout: 120000,
      env: {
        PATH: process.env.PATH, HOME: process.env.HOME, NODE_PATH: process.env.NODE_PATH || "",
        HELMUT_OFFLINE_TEST: "1", NO_NETWORK_TESTS: "1"
      }
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
