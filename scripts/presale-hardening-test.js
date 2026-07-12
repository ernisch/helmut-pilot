"use strict";

// Pre-Sale-Hardening: gezielte Regressionstests fuer die in diesem Sprint
// behobenen Verträge. KEIN Netz, KEINE KI, KEINE Kosten.
//  - Storage: listKnowledgeObjects signalisiert echten Ausfall (statt still []).
//  - Lage: selectLageVorgaenge zeigt moderne UND belegte Legacy-Vorgaenge.

const path = require("path");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- Storage: store-error vs. leer -----------------------------------------
// Ohne HELMUT_V3_STORE/Supabase ist v3StoreReady()=false. Der Read soll dann
// mit _signalError:true ein Sentinel liefern (echter Ausfall), sonst [].
{
  const saved = { s: process.env.HELMUT_V3_STORE, u: process.env.SUPABASE_URL };
  delete process.env.HELMUT_V3_STORE; delete process.env.SUPABASE_URL;
  // frisch laden, damit v3StoreReady() den aktuellen Env-Zustand sieht
  delete require.cache[require.resolve("../lib/helmut/storage")];
  const storage = require("../lib/helmut/storage");
  const noSignal = storage.listKnowledgeObjects ? null : null;
  return (async () => {
    const withSignal = await storage.listKnowledgeObjects({ limit: 10, _signalError: true });
    const without = await storage.listKnowledgeObjects({ limit: 10 });
    check("Store-aus + _signalError -> Sentinel {__storeError:true}", withSignal && withSignal.__storeError === true);
    check("Store-aus ohne Signal -> leeres Array (Rueckwaertskompatibel)", Array.isArray(without) && without.length === 0);
    if (saved.s !== undefined) process.env.HELMUT_V3_STORE = saved.s;
    if (saved.u !== undefined) process.env.SUPABASE_URL = saved.u;

    // --- Lage: modern-first, Legacy beigemischt ---------------------------
    const lage = require("../lib/helmut/lage");
    const withSrc = { sources: [{ name: "Tagesschau" }], sourceCount: 1 };
    const modern = (id) => ({ id, displaySummary: "S", whyRelevant: "W", recommendation: "R", ...withSrc });
    const legacy = (id) => ({ id, displaySummary: "", whyRelevant: "", recommendation: "", ...withSrc });
    const out = lage.selectLageVorgaenge([legacy("a"), modern("b"), legacy("c")]);
    check("Lage: moderne + belegte Legacy erscheinen zusammen (kein Entweder-oder)", out.length === 3);
    check("Lage: moderner Vorgang steht vorn", out[0].id === "b");
    check("Lage: Legacy mit Quelle nicht mehr ausgeblendet", out.some((v) => v.id === "a") && out.some((v) => v.id === "c"));
    check("Lage: display_title NICHT erforderlich fuer 'modern'", lage.isModernVorgang({ displaySummary: "S", whyRelevant: "W", recommendation: "R" }));

    console.log(`\n${passed}/${passed + failed} Pre-Sale-Hardening-Assertions erfolgreich.`);
    if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
  })();
}
