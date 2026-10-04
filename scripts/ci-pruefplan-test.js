"use strict";

const assert = require("assert");
const P = require("./ci-pruefplan.js");

let pass = 0;
function check(name, fn) {
  fn();
  pass += 1;
  console.log("PASS", name);
}

check("Dokumentation startet keine grosse CI", () => {
  const p = P.plan(["docs/CURRENT_STATE.md", "AGENTS.md"]);
  assert.equal(p.mode, "docs");
  assert.equal(p.standard, false);
  assert.equal(p.database, false);
  assert.equal(p.browser, false);
  assert.equal(p.area, false);
});

check("Normale Fachdatei bekommt nur Bereichstests", () => {
  const p = P.plan(["lib/helmut/briefing-lauf.js"]);
  assert.equal(p.mode, "targeted");
  assert.equal(p.standard, false);
  assert.equal(p.database, false);
  assert.equal(p.browser, false);
  assert.equal(p.area, true);
  assert(p.bereiche.includes("briefing"));
});

check("UI bekommt Bereich plus Browser aber keine grosse Offline Suite", () => {
  const p = P.plan(["client.js", "styles.css"]);
  assert.equal(p.standard, false);
  assert.equal(p.database, false);
  assert.equal(p.browser, true);
  assert.equal(p.area, true);
});

check("Assets zaehlen als UI und nicht als unbekannter Volltest", () => {
  const p = P.plan(["assets/fonts/beispiel.ttf"]);
  assert.equal(p.standard, false);
  assert.equal(p.browser, true);
  assert.equal(p.area, true);
  assert(p.bereiche.includes("ui"));
});

check("500er Schutzbereich bleibt voll abgesichert", () => {
  const p = P.plan(["lib/helmut/testnachweis.js"]);
  assert.equal(p.mode, "full");
  assert.equal(p.standard, true);
  assert.equal(p.database, true);
});

check("Migration bleibt voll abgesichert", () => {
  const p = P.plan(["supabase/migrations/20261004120000_test.sql"]);
  assert.equal(p.standard, true);
  assert.equal(p.database, true);
});

check("Unbekannter Code faellt sicher auf Vollpruefung zurueck", () => {
  const p = P.plan(["lib/helmut/neuer-unbekannter-pfad.js"]);
  assert.equal(p.standard, true);
  assert.equal(p.database, true);
  assert(p.unbekannt.length === 1);
});

check("CI Aenderung prueft die CI selbst voll", () => {
  const p = P.plan([".github/workflows/ci.yml"]);
  assert.equal(p.standard, true);
  assert.equal(p.database, true);
  assert.equal(p.browser, true);
});

check("Leere Dateiliste ist fail closed", () => {
  const p = P.plan([]);
  assert.equal(p.mode, "full");
  assert.equal(p.standard, true);
  assert.equal(p.browser, true);
});

console.log("\n" + pass + " PASS / 0 FAIL");
