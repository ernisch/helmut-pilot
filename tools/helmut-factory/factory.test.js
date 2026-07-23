#!/usr/bin/env node
"use strict";

// Minimaler Test für die Helmut Factory V1. Kein Netzwerk, kein gh, keine API.
//   node tools/helmut-factory/factory.test.js

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const f = require("./factory.js");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name} — ${e.message}`);
    process.exitCode = 1;
  }
}

const cfg = {
  repo: "ernisch/helmut-pilot",
  runsDir: path.relative(path.join(__dirname, "..", ".."), fs.mkdtempSync(path.join(os.tmpdir(), "factory-"))),
  maxComments: 5,
  defaults: {
    erlaubterUmfang: ["a"],
    verboteneAenderungen: ["b"],
    abnahmekriterien: ["c"],
  },
  claudeAuftragHinweis: "manuell",
};
const now = () => "2026-07-23T00:00:00.000Z";
let writes = 0;
const deps = () => ({ cfg, now, log: () => {}, ghRun: () => { writes++; return "{}"; } });

const fakeIssue = {
  number: 42,
  title: "Testtitel",
  url: "https://example/issues/42",
  body: "Ziel des Issues. Siehe `lib/helmut/x.js` und blob/main/scripts/y.js",
  comments: [{ author: { login: "alice" }, body: "Wichtig!" }],
};

// 1. Fehlende Issue-Nummer -> Fehler
test("fehlende Issue-Nummer wirft Fehler", () => {
  assert.throws(() => f.parseIssueNumber(undefined), /Issue-Nummer/);
  assert.throws(() => f.parseIssueNumber(""), /Issue-Nummer/);
  assert.throws(() => f.parseIssueNumber("abc"), /Ungültige/);
});

// 2. Nicht gefundenes Issue -> Fehler
test("nicht gefundenes Issue wirft Fehler", () => {
  const ghRun = (args) => (args[0] === "--version" ? "gh 2.0" : "{}"); // gh liefert leeres Objekt
  assert.throws(() => f.fetchIssue(999, cfg, ghRun), /nicht gefunden/);
});

// 3. Erfolgreiches Erzeugen einer Arbeitsdatei
test("Arbeitsdatei wird erzeugt und enthält alle Abschnitte", () => {
  const ghRun = (args) => (args[0] === "--version" ? "gh 2.0" : JSON.stringify(fakeIssue));
  const file = f.cmdStart("42", Object.assign(deps(), { ghRun }));
  const md = fs.readFileSync(file, "utf8");
  assert.ok(md.includes("Issue-Ziel"), "Issue-Ziel fehlt");
  assert.ok(md.includes("Erlaubter Umfang"), "Umfang fehlt");
  assert.ok(md.includes("Verbotene Änderungen"), "Verbote fehlen");
  assert.ok(md.includes("Abnahmekriterien"), "Abnahmekriterien fehlen");
  assert.ok(md.includes("Empfohlener Claude-Code-Auftrag"), "Auftrag fehlt");
  assert.ok(md.includes("lib/helmut/x.js"), "verlinkte Datei fehlt");
});

// 4. Erfolgreiches Erzeugen eines Review-Auftrags
test("Review-Auftrag wird aus vorhandenen Dateien erzeugt", () => {
  const ghRun = (args) => (args[0] === "--version" ? "gh 2.0" : JSON.stringify(fakeIssue));
  f.cmdStart("42", Object.assign(deps(), { ghRun })); // legt Arbeitsdatei an
  const file = f.cmdReview("42", deps());
  const md = fs.readFileSync(file, "utf8");
  assert.ok(md.includes("Review-Auftrag"), "Titel fehlt");
  assert.ok(md.includes("Merge empfohlen"), "Merge-Frage fehlt");
  assert.ok(md.includes("Ursprünglicher Arbeitsauftrag"), "Arbeitsauftrag fehlt");
});

// 5. Keine automatische GitHub-Schreibaktion
test("gh wird nur lesend aufgerufen (view/--version)", () => {
  const calls = [];
  const ghRun = (args) => {
    calls.push(args);
    return args[0] === "--version" ? "gh 2.0" : JSON.stringify(fakeIssue);
  };
  f.cmdStart("42", Object.assign(deps(), { ghRun }));
  const writeVerbs = ["create", "edit", "comment", "close", "delete", "merge"];
  for (const c of calls) {
    assert.ok(!writeVerbs.includes(c[1]), `Schreibaktion erkannt: gh ${c.join(" ")}`);
  }
  assert.ok(calls.some((c) => c[0] === "issue" && c[1] === "view"), "kein Lesezugriff erfolgt");
});

console.log(`\n${passed}/5 Tests bestanden.`);
