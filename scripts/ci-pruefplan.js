"use strict";

const fs = require("fs");
const A = require("./bereichsauswahl.js");

const FULL_FILES = [
  /(^|\/)\.github\/workflows\/ci\.yml$/i,
  /(^|\/)scripts\/ci-pruefplan(?:-test)?\.js$/i,
  /(^|\/)scripts\/bereichsauswahl(?:-test)?\.js$/i,
  /(^|\/)scripts\/run-offline-tests\.js$/i,
  /(^|\/)scripts\/offline-suite-auswahl-test\.js$/i,
  /(^|\/)scripts\/lokal(?:er-netzschutz)?\.js$/i,
  /(^|\/)package(?:-lock)?\.json$/i,
];

const BROWSER_DIRECT = [
  /(^|\/)client\.js$/i,
  /(^|\/)styles\.css$/i,
  /(^|\/)index\.html$/i,
  /(^|\/)sw\.js$/i,
  /(^|\/)assets\//i,
  /(^|\/)server\.js$/i,
  /(^|\/)api\/index\.js$/i,
  /(^|\/)package(?:-lock)?\.json$/i,
  /(^|\/)\.github\/workflows\/ci\.yml$/i,
];

function matches(file, rules) {
  return rules.some((rule) => rule.test(file));
}

function normalize(files) {
  return [...new Set(files.map((x) => String(x || "").trim()).filter(Boolean))].sort();
}

function plan(files) {
  const changed = normalize(files);
  if (!changed.length) {
    return {
      mode: "full",
      reason: "Keine geaenderten Dateien sicher bestimmbar",
      changed,
      standard: true,
      area: true,
      database: true,
      browser: true,
      syntax: true,
      npm: true,
    };
  }

  const info = A.analysiere(changed);
  const fullFile = changed.some((f) => matches(f, FULL_FILES));
  const criticalArea = info.bereiche.includes("datenbank-migration") || info.bereiche.includes("500-nachweis");
  const full = fullFile || info.querschnitt || info.unbekannt.length > 0 || criticalArea;
  const relevant = changed.some((f) => A.istRelevant(f)) || fullFile;
  const browser = changed.some((f) => matches(f, BROWSER_DIRECT)) || info.bereiche.includes("ui");
  const area = relevant;
  const syntax = full || changed.some((f) => /\.js$/i.test(f));
  const database = full;

  let mode = "targeted";
  let reason = "Gezielte Fachpruefung";
  if (!relevant && !browser) {
    mode = "docs";
    reason = "Nur Dokumentation oder Agentenregeln";
  } else if (full) {
    mode = "full";
    reason = fullFile ? "CI Kern oder Abhaengigkeiten geaendert"
      : (info.querschnitt ? "Geteilte Kerndatei geaendert"
        : (info.unbekannt.length ? "Relevante Datei ohne sichere Zuordnung"
          : "500er oder Datenbank Schutzbereich geaendert"));
  } else if (browser && info.bereiche.length === 1 && info.bereiche[0] === "ui") {
    mode = "ui";
    reason = "Nur UI Bereich betroffen";
  }

  return {
    mode,
    reason,
    changed,
    standard: full,
    area,
    database,
    browser,
    syntax,
    npm: standardOrAreaOrBrowser(full, area, browser),
    bereiche: info.bereiche,
    unbekannt: info.unbekannt,
    querschnitt: info.querschnitt,
  };
}

function standardOrAreaOrBrowser(standard, area, browser) {
  return Boolean(standard || area || browser);
}

function parseArgs(argv) {
  const out = { files: [], githubOutput: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--files") out.files.push(...String(argv[++i] || "").split(/\r?\n|\s+/).filter(Boolean));
    else if (argv[i] === "--github-output") out.githubOutput = argv[++i] || null;
    else throw new Error("unknown-argument:" + argv[i]);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = plan(args.files);
  console.log(JSON.stringify(result));
  if (args.githubOutput) {
    for (const key of ["standard", "area", "database", "browser", "syntax", "npm"]) {
      fs.appendFileSync(args.githubOutput, key + "=" + String(Boolean(result[key])) + "\n");
    }
    fs.appendFileSync(args.githubOutput, "mode=" + result.mode + "\n");
  }
}

if (require.main === module) main();

module.exports = { FULL_FILES, BROWSER_DIRECT, plan, parseArgs };
