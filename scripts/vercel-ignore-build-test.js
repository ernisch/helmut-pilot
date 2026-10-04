"use strict";

const assert = require("assert");
const V = require("./vercel-ignore-build.js");

let pass = 0;
function check(name, fn) {
  fn();
  pass += 1;
  console.log("PASS", name);
}

check("Reine Doku und Agentenregeln duerfen Build ueberspringen", () => {
  assert.equal(V.shouldSkip(["AGENTS.md", "docs/CURRENT_STATE.md", "README.md"]), true);
});

check("Reine Tests duerfen Build ueberspringen", () => {
  assert.equal(V.shouldSkip(["scripts/deepseek-cloud-router-test.js", "scripts/source23_closed_tuple_codec_test.py"]), true);
});

check("Runtime Code erzwingt Build", () => {
  assert.equal(V.shouldSkip(["lib/helmut/lage.js"]), false);
  assert.equal(V.shouldSkip(["client.js"]), false);
  assert.equal(V.shouldSkip(["server.js"]), false);
});

check("Vercel und GitHub Konfiguration erzwingen Build", () => {
  assert.equal(V.shouldSkip(["vercel.json"]), false);
  assert.equal(V.shouldSkip([".github/workflows/ci.yml"]), false);
});

check("Gemischter Diff erzwingt Build", () => {
  assert.equal(V.shouldSkip(["docs/x.md", "lib/helmut/lage.js"]), false);
});

check("Leere oder unbekannte Menge ist fail closed", () => {
  assert.equal(V.shouldSkip([]), false);
  assert.equal(V.shouldSkip(["irgendwas.neu"]), false);
});

check("Diff Fehler bleibt fail closed", () => {
  const files = V.diffFiles("abcdef1", {
    spawnSync: () => ({ status: 1, stdout: "", stderr: "bad", error: null }),
  });
  assert.equal(files, null);
});

console.log("\n" + pass + " PASS / 0 FAIL");
