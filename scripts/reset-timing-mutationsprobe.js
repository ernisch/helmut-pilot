"use strict";

// Mutationsprobe fuer den Timing-Schutz des anonymen Passwort-Resets.
// =============================================================================================
// Ein gruener Test beweist nichts, solange nicht gezeigt ist, dass er auch ROT werden kann.
// Diese Probe nimmt den Schutz Stueck fuer Stueck zurueck und prueft, dass
// scripts/reset-timing-seitenkanal-test.js JEDE Ruecknahme bemerkt.
//
// ARBEITSWEISE (Konvention wie die uebrigen *-mutationsprobe.js): die Arbeitskopie des Repos
// wird NICHT angefasst — fuer jede Mutation entsteht ein Abzug in einem temporaeren
// Verzeichnis; mutiert und ausgefuehrt wird ausschliesslich dort.
// Exit 0 nur, wenn JEDE Mutation die Suite rot macht. Ein nicht gefundener oder mehrdeutiger
// Ankertext beendet die Probe mit Exit 2 (veraltete Probe, keine Aussage).
//
// Aufruf: node scripts/reset-timing-mutationsprobe.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SUITE = "reset-timing-seitenkanal-test.js";

// Was der Abzug braucht, damit server.js startet und die Suite laufen kann.
const VERZEICHNISSE = ["lib", "api"];
const DATEIEN = ["server.js", "package.json", "helmut-flags.json", "index.html", "client.js", "styles.css"];

const MUTATIONEN = [
  {
    name: "M1 Versand wieder VOR der Antwort abwarten (der urspruengliche Seitenkanal)",
    datei: "server.js",
    von: "    await resetTiming.warteBisFreigabe(beginn);",
    nach: "    if (versand) await versand;\n    await resetTiming.warteBisFreigabe(beginn);"
  },
  {
    name: "M2 Antwortgitter entfernt",
    datei: "server.js",
    von: "    await resetTiming.warteBisFreigabe(beginn);",
    nach: "    await Promise.resolve();"
  },
  {
    name: "M3 Not-Found-Zweig antwortet sofort (frueher Ausstieg vor dem Gitter)",
    datei: "server.js",
    von: "    const zustellbar = Boolean(",
    nach: "    if (!user) return generic;\n    const zustellbar = Boolean("
  },
  {
    name: "M4 semantisches Leck im Antwortrumpf",
    datei: "server.js",
    von: "    sendJson(response, generic);",
    nach: "    sendJson(response, { ...generic, bekannt: Boolean(user) });"
  },
  {
    name: "M5 anonymer Zweig faellt in den Besitzer-Pfad (Link an Fremde)",
    datei: "server.js",
    von: "    if (isOwner && user.active !== false) {",
    nach: "    if (user && user.active !== false) {"
  },
  {
    name: "M6 Freigabezeitpunkt ohne Stufenaufschlag",
    datei: "lib/helmut/reset-timing.js",
    von: "  const stufen = Math.floor(vergangen / fenster) + 1;",
    nach: "  const stufen = 0;"
  },
  {
    name: "M7 Antwortfenster ohne Klemmung (Schutz abschaltbar)",
    datei: "lib/helmut/reset-timing.js",
    von: "  return Math.min(MAX_FENSTER_MS, Math.max(MIN_FENSTER_MS, Math.round(roh)));",
    nach: "  return Math.round(roh);"
  },
  {
    // Realistische Produktregression: "wir sagen der Person freundlich Bescheid".
    name: "M8 unbekannte Adresse bekommt eine Nachricht",
    datei: "server.js",
    von: "    const zustellbar = Boolean(user && user.active !== false && inviteMail.isMailConfigured());",
    nach: "    const zustellbar = Boolean(user && user.active !== false && inviteMail.isMailConfigured());\n"
      + "    if (!zustellbar && email && inviteMail.isMailConfigured()) {\n"
      + "      resetTiming.starteHintergrundarbeit(() => inviteMail.sendAccessMail({\n"
      + "        to: email, from: process.env.HELMUT_MAIL_FROM, subject: \"Kein Konto\",\n"
      + "        text: \"Zu dieser Adresse gibt es kein Helmut-Konto.\"\n"
      + "      }));\n"
      + "    }"
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
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-reset-timing-mutation-"));
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
    cwd: basis, encoding: "utf8", timeout: 300000,
    env: { ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", HELMUT_V3_STORE: "" }
  });
}

function entferne(basis) {
  try { fs.rmSync(basis, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

(async () => {
  console.log(`Mutationsprobe — Zielsuite: scripts/${SUITE}\n`);

  // Gegenprobe: der unveraenderte Abzug MUSS gruen sein, sonst sagt die Probe nichts aus.
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
      console.log(`      erkannt von: ${gemeldet.slice(0, 4).join(" · ") || "(Abbruch der Suite)"}`);
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
