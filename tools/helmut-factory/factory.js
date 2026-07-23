#!/usr/bin/env node
"use strict";

// =============================================================================
// Helmut Factory V1 — minimaler, vollständig manueller Ein-Issue-Workflow.
// =============================================================================
// Genau EIN Issue pro Lauf. Kein Scheduler, kein Hintergrundprozess, keine
// Modell-API, keine automatische Auswahl weiterer Issues, keine Schreibaktion
// auf GitHub. Die GitHub CLI (`gh`) wird — falls vorhanden — NUR lesend genutzt.
//
// Befehle:
//   node tools/helmut-factory/factory.js start  <issue-nummer>
//   node tools/helmut-factory/factory.js finish <issue-nummer>
//   node tools/helmut-factory/factory.js review <issue-nummer>
// =============================================================================

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const CONFIG_PATH = path.join(__dirname, "factory.config.json");

// --- Konfiguration ---------------------------------------------------------

function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  cfg.runsDir = cfg.runsDir || ".factory-runs";
  cfg.maxComments = cfg.maxComments || 10;
  cfg.defaults = cfg.defaults || {};
  return cfg;
}

// --- Issue-Nummer prüfen ---------------------------------------------------

function parseIssueNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error("Bitte eine Issue-Nummer angeben, z. B.: factory.js start 42");
  }
  const n = Number(String(value).replace(/^#/, "").trim());
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Ungültige Issue-Nummer: "${value}". Erlaubt sind positive ganze Zahlen.`);
  }
  return n;
}

// --- GitHub lesen (nur lesend, über gh) ------------------------------------

function defaultGhRun(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function assertGhAvailable(ghRun) {
  try {
    ghRun(["--version"]);
  } catch (e) {
    throw new Error(
      "GitHub CLI (gh) ist nicht verfügbar. Bitte installieren (https://cli.github.com) " +
        "und mit `gh auth login` anmelden. Die Factory nutzt gh ausschließlich lesend."
    );
  }
}

function fetchIssue(number, cfg, ghRun) {
  assertGhAvailable(ghRun);
  let raw;
  try {
    raw = ghRun([
      "issue", "view", String(number),
      "--repo", cfg.repo,
      "--json", "number,title,body,url,comments",
    ]);
  } catch (e) {
    throw new Error(
      `Issue #${number} konnte nicht geladen werden. Prüfe die Nummer, das Repository ` +
        `(${cfg.repo}) und ob du mit \`gh auth status\` angemeldet bist.`
    );
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error("Antwort von gh war kein gültiges JSON.");
  }
  if (!data || typeof data.number !== "number") {
    throw new Error(`Issue #${number} wurde nicht gefunden.`);
  }
  return data;
}

// --- Verlinkte Dateien aus dem Text herausziehen ---------------------------

function extractLinkedFiles(text, root) {
  const found = new Set();
  const body = text || "";
  // GitHub-Blob-Links: .../blob/<ref>/pfad/zur/datei.ext
  const blobRe = /blob\/[^/\s]+\/([^\s)]+\.[A-Za-z0-9]+)/g;
  // Inline-Pfade in Backticks: `pfad/zur/datei.ext`
  const backtickRe = /`([^`\s]+\.[A-Za-z0-9]+)`/g;
  let m;
  while ((m = blobRe.exec(body))) found.add(m[1]);
  while ((m = backtickRe.exec(body))) found.add(m[1]);
  return Array.from(found).map((rel) => ({
    path: rel,
    exists: fs.existsSync(path.join(root, rel)),
  }));
}

// --- Markdown-Bausteine (reine Funktionen, testbar) ------------------------

function bullets(list) {
  return (list && list.length ? list : ["(keine)"]).map((x) => `- ${x}`).join("\n");
}

function buildWorkFile(issue, cfg, linkedFiles, now) {
  const d = cfg.defaults;
  const comments = (issue.comments || []).slice(0, cfg.maxComments);
  const commentBlock = comments.length
    ? comments
        .map((c) => `> **${(c.author && c.author.login) || "?"}:** ${(c.body || "").trim()}`)
        .join("\n\n")
    : "(keine Kommentare geladen)";
  const linkedBlock = linkedFiles.length
    ? linkedFiles.map((f) => `- \`${f.path}\` ${f.exists ? "(im Repo vorhanden)" : "(nicht lokal gefunden)"}`).join("\n")
    : "(keine direkt verlinkten Dateien erkannt)";

  return `# Arbeitsauftrag — Issue #${issue.number}

**Titel:** ${issue.title}
**Quelle:** ${issue.url || "(unbekannt)"}
**Erstellt:** ${now}

> Dies ist eine lokale Arbeitsdatei. Sie startet Claude Code NICHT automatisch.

## 1. Issue-Ziel
${(issue.body || "(keine Beschreibung im Issue)").trim()}

## 2. Erlaubter Umfang
${bullets(d.erlaubterUmfang)}

## 3. Verbotene Änderungen
${bullets(d.verboteneAenderungen)}

## 4. Abnahmekriterien
${bullets(d.abnahmekriterien)}

## 5. Direkt verlinkte Dateien
${linkedBlock}

## 6. Relevante Kommentare
${commentBlock}

## 7. Empfohlener Claude-Code-Auftrag
${cfg.claudeAuftragHinweis || "Öffne Claude Code manuell und übergib diese Datei als Kontext."}

Vorschlag für die erste Anweisung an Claude Code:

> Bearbeite ausschließlich Issue #${issue.number} ("${issue.title}").
> Halte dich strikt an "Erlaubter Umfang" und "Verbotene Änderungen" oben.
> Erfülle alle Abnahmekriterien. Erstelle KEINEN Pull Request und führe KEINEN
> Merge aus. Fasse am Ende die geänderten Dateien und getesteten Punkte zusammen.
`;
}

function buildFinishReport(number, title, answers, now) {
  return `# Abschlussbericht — Issue #${number}

**Titel:** ${title || "(unbekannt)"}
**Abgeschlossen:** ${now}

## Zusammenfassung
${answers.zusammenfassung || "(keine Angabe)"}

## Geänderte Dateien
${answers.dateien || "(keine Angabe)"}

## Tests
${answers.tests || "(keine Angabe)"}

## Offene Risiken
${answers.risiken || "(keine Angabe)"}

## Commit / Pull-Request
${answers.link || "(keine Angabe)"}
`;
}

function buildReviewAuftrag(number, title, workFile, finishReport, now) {
  return `# Review-Auftrag — Issue #${number}

**Titel:** ${title || "(unbekannt)"}
**Erstellt:** ${now}

> Kompakter, manueller Review-Auftrag. Er ruft KEIN Modell und keine API auf.
> Übergib ihn nach eigener Entscheidung an einen Reviewer oder an Claude Code.

## Prüfe bitte
- Wurde das Issue-Ziel wirklich erfüllt?
- Wurde der erlaubte Umfang eingehalten?
- Fehlen Tests?
- Sind unnötige oder ungefragte Änderungen entstanden?
- Wird ein Merge empfohlen? (Ja / Nein / mit Auflagen)

## Ursprünglicher Arbeitsauftrag
${workFile ? workFile.trim() : "(nicht gefunden — bitte zuerst `factory.js start` ausführen)"}

## Gemeldeter Abschluss
${finishReport ? finishReport.trim() : "(nicht gefunden — bitte zuerst `factory.js finish` ausführen)"}

## Erwartetes Ergebnis des Reviews
Ein kurzes Urteil je Prüfpunkt oben sowie eine klare Merge-Empfehlung mit Begründung.
`;
}

// --- Dateisystem-Helfer ----------------------------------------------------

function runDir(number, cfg) {
  return path.join(ROOT, cfg.runsDir, `issue-${number}`);
}

function ensureRunDir(number, cfg) {
  const dir = runDir(number, cfg);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    return null;
  }
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (a) => resolve((a || "").trim())));
}

// --- Befehle ---------------------------------------------------------------

function cmdStart(numberArg, deps) {
  const cfg = deps.cfg;
  const number = parseIssueNumber(numberArg);
  const issue = fetchIssue(number, cfg, deps.ghRun);
  const linked = extractLinkedFiles(issue.body, ROOT);
  const dir = ensureRunDir(number, cfg);
  const file = path.join(dir, "arbeitsauftrag.md");
  fs.writeFileSync(file, buildWorkFile(issue, cfg, linked, deps.now()));
  deps.log(`Arbeitsauftrag erstellt: ${path.relative(ROOT, file)}`);
  deps.log("Claude Code wurde NICHT gestartet. Bitte manuell öffnen.");
  return file;
}

async function cmdFinish(numberArg, deps) {
  const cfg = deps.cfg;
  const number = parseIssueNumber(numberArg);
  const dir = ensureRunDir(number, cfg);
  const workFile = readIfExists(path.join(dir, "arbeitsauftrag.md"));
  const title = workFile ? (workFile.match(/\*\*Titel:\*\* (.*)/) || [])[1] : "";
  const rl = deps.createInterface();
  const answers = {
    zusammenfassung: await ask(rl, "Zusammenfassung: "),
    dateien: await ask(rl, "Geänderte Dateien: "),
    tests: await ask(rl, "Tests (was wurde ausgeführt?): "),
    risiken: await ask(rl, "Offene Risiken: "),
    link: await ask(rl, "Commit- oder Pull-Request-Link: "),
  };
  rl.close();
  const file = path.join(dir, "abschlussbericht.md");
  fs.writeFileSync(file, buildFinishReport(number, title, answers, deps.now()));
  deps.log(`Abschlussbericht gespeichert: ${path.relative(ROOT, file)}`);
  return file;
}

function cmdReview(numberArg, deps) {
  const cfg = deps.cfg;
  const number = parseIssueNumber(numberArg);
  const dir = runDir(number, cfg);
  const workFile = readIfExists(path.join(dir, "arbeitsauftrag.md"));
  const finishReport = readIfExists(path.join(dir, "abschlussbericht.md"));
  if (!workFile && !finishReport) {
    throw new Error(
      `Für Issue #${number} liegen keine lokalen Dateien vor. ` +
        "Bitte zuerst `start` (und idealerweise `finish`) ausführen."
    );
  }
  const title = workFile ? (workFile.match(/\*\*Titel:\*\* (.*)/) || [])[1] : "";
  ensureRunDir(number, cfg);
  const file = path.join(dir, "review-auftrag.md");
  fs.writeFileSync(file, buildReviewAuftrag(number, title, workFile, finishReport, deps.now()));
  deps.log(`Review-Auftrag erstellt: ${path.relative(ROOT, file)}`);
  return file;
}

// --- CLI-Einstieg ----------------------------------------------------------

async function main(argv, overrides) {
  const [command, numberArg] = argv;
  const deps = Object.assign(
    {
      cfg: loadConfig(),
      ghRun: defaultGhRun,
      log: (m) => console.log(m),
      now: () => new Date().toISOString(),
      createInterface: () => readline.createInterface({ input: process.stdin, output: process.stdout }),
    },
    overrides
  );

  switch (command) {
    case "start":
      return cmdStart(numberArg, deps);
    case "finish":
      return cmdFinish(numberArg, deps);
    case "review":
      return cmdReview(numberArg, deps);
    default:
      deps.log("Helmut Factory V1 — genau ein Issue pro Lauf.");
      deps.log("Befehle:");
      deps.log("  start  <nummer>   Arbeitsauftrag aus einem Issue erzeugen");
      deps.log("  finish <nummer>   Abschlussbericht per Fragen aufnehmen");
      deps.log("  review <nummer>   Review-Auftrag aus Issue + Abschluss erzeugen");
      if (command && command !== "help" && command !== "--help") {
        process.exitCode = 1;
      }
      return null;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`Fehler: ${e.message}`);
    process.exit(1);
  });
}

module.exports = {
  parseIssueNumber,
  extractLinkedFiles,
  buildWorkFile,
  buildFinishReport,
  buildReviewAuftrag,
  fetchIssue,
  cmdStart,
  cmdReview,
  main,
};
