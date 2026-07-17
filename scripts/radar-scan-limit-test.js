"use strict";

// Test für P1-6 (radar.md §3): das KO-Scan-Fenster deckt jetzt den Bestand ab
// (Default 500 statt 200), damit belegte Personen-Erwähnungen jenseits Rang 200
// nicht unsichtbar werden. KEIN Netz, KEINE KI — Storage/AI/SourceSafety gemockt.

const storage = require("../lib/helmut/storage");
const ai = require("../lib/helmut/ai");
const sourceSafety = require("../lib/helmut/sourceSafety");
const lage = require("../lib/helmut/lage");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// 250 verstandene KOs; das relevante (person-belegte) liegt auf Position 220 —
// mit dem alten 200er-Fenster wäre es unsichtbar gewesen.
const KOS = Array.from({ length: 250 }, (_, i) => ({
  id: `ko-${String(i).padStart(3, "0")}`, vorgang_id: `vg-${i}`, status: "update", understanding_status: "complete",
  headline: `Vorgang ${i}`, was_ist_passiert: "Etwas ist passiert.", warum_wichtig: "Wichtig.",
  best_source_url: "https://example.org/x", updated_at: "2026-07-12T06:00:00Z"
}));
const TARGET_INDEX = 220;
KOS[TARGET_INDEX].headline = "Zielvorgang mit Beleg";

const orig = {
  v3StoreReady: storage.v3StoreReady, listKnowledgeObjects: storage.listKnowledgeObjects,
  listMatchingResults: storage.listMatchingResults, getSourcesForVorgang: storage.getSourcesForVorgang,
  getRenderedBriefingV3: storage.getRenderedBriefingV3, guardKnowledgeObject: sourceSafety.guardKnowledgeObject
};

let requestedLimit = null;
storage.v3StoreReady = () => true;
storage.listKnowledgeObjects = async (o) => { requestedLimit = o && o.limit; return KOS.slice(0, o && o.limit ? o.limit : KOS.length); };
storage.listMatchingResults = async () => [];
storage.getSourcesForVorgang = async () => [{ url: "https://example.org/x", source_name: "Quelle" }];
storage.getRenderedBriefingV3 = async () => null;
sourceSafety.guardKnowledgeObject = () => ({ status: "ok" });

(async () => {
  const res = await lage.buildLageBriefing({ id: "test-politician-one", fullName: "Test Politician One" }, { politicianId: "test-politician-one", cacheOnly: true });
  check("Scan-Fenster >= 500 angefragt (deckt Bestand ab)", Number(requestedLimit) >= 500, `limit=${requestedLimit}`);
  check("KO auf Position 220 liegt im Scan-Fenster (vorher unsichtbar)", KOS.length <= Number(requestedLimit), `${KOS.length} <= ${requestedLimit}`);
  check("Lage liefert Karten aus dem erweiterten Fenster", res.available === true && Array.isArray(res.vorgaenge));

  Object.assign(storage, orig); sourceSafety.guardKnowledgeObject = orig.guardKnowledgeObject; ai.generateLageBriefing = orig.generateLageBriefing;
  console.log(`\n${passed}/${passed + failed} Radar-Scan-Limit-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch((e) => { Object.assign(storage, orig); console.error("Test-Fehler:", e); process.exit(1); });
