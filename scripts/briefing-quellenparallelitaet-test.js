"use strict";

// Echter Leser aus server.js, kontrollierte asynchrone Quellenantworten.
const A = require("node:assert/strict");
const vm = require("node:vm");
const source = require("node:fs").readFileSync(require.resolve("../server"), "utf8");
const start = source.indexOf("async function loadSourcesByVorgang(kos)");
const end = source.indexOf("function compactBriefingPayload", start);
A(start > 0 && end > start);
const code = source.slice(start, end);
(async () => {
  for (const functionName of ["loadSourcesByVorgang", "loadPruefSourcesByVorgang"]) {
    let active = 0, peak = 0;
    const seen = [];
    const read = vm.runInNewContext(code + `; ${functionName}`, {
      getSourcesForVorgang: async id => {
        active++; peak = Math.max(peak, active); seen.push(id);
        try {
          await new Promise(resolve => setImmediate(resolve));
          if (id === "vg-9") throw new Error("synthetischer Lesefehler");
          return [{ id: `quelle-${id}` }];
        } finally { active--; }
      }
    });
    const kos = Array.from({ length: 57 }, (_, i) => ({ vorgang_id: `vg-${i}` }));
    const out = await read(kos);
    A.equal(peak, 8); A.equal(active, 0);
    A.equal(seen.length, 57); A.equal(new Set(seen).size, 57);
    A.equal(Object.keys(out).length, 57);
    A.equal(out["vg-9"].length, 0);
    A.equal(out["vg-56"][0].id, "quelle-vg-56");
    A.equal(Object.keys(await read([])).length, 0);
    console.log(`PASS ${functionName}: alle 57 Quellenpakete, maximal 8 parallel, Fehler isoliert`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
