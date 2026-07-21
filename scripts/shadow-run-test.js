"use strict";

// Sprint-4-Shadow · Parallele Berechnung (Aufgabe 3). REINE LOGIK, synthetische Fixtures.
// Deckt ab: 11-Feld-Laufzeitplan, dynamische Zuweisung, Determinismus, Paket=Laufzeit,
// harte Trennung Legacy/Neu (Fehler im neuen Pfad beschaedigt Legacy nicht).

const shadow = require("../lib/helmut/quellenarchitektur/shadow");
const run = require("../lib/helmut/quellenarchitektur/shadow-run");
const F = require("./shadow-fixtures");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const ctx = F.buildFixtureContext({ withHealth: true });
const mandat = { id: "m-linke", partei: "Die Linke", fraktion: "Die Linke", mandatsebene: "Bundestag", bundesland: "Berlin", ausschuesse: ["Arbeit und Soziales"] };
const res = shadow.runOne(mandat, ctx, {});
const neu = res.shadow.neu;

// Paket = Laufzeitobjekt (nicht persistiert).
check("1 neuer Plan ist ein Laufzeitobjekt (kind runtime_supply_plan, persisted:false)",
  neu.kind === "runtime_supply_plan" && neu.persisted === false);

// Alle 11 Pflichtfelder vorhanden.
const feld1 = Array.isArray(neu.sources) && neu.sources.length > 0;
const feld2 = neu.sources.every((s) => typeof s.versorgungsebene === "string");
const feld3 = neu.sources.every((s) => Array.isArray(s.auswahlgrund));
const feld4 = neu.sources.every((s) => typeof s.relevanz === "number");
const feld5 = neu.sources.every((s) => "qualitaet" in s);
const feld6 = neu.sources.every((s) => "gesundheit" in s);
const feld7 = typeof neu.alternativen === "object";
const feld8 = Array.isArray(neu.ausgeschlossen);
const feld9 = Array.isArray(neu.versorgungsluecken);
const feld10 = neu.suchanbieterAbhaengigkeit && typeof neu.suchanbieterAbhaengigkeit.anteil === "number";
const feld11 = ["vollstaendig", "eingeschraenkt", "blockiert"].includes(neu.gesamtstatus);
check("2 alle 11 Pflichtfelder des neuen Plans vorhanden",
  [feld1, feld2, feld3, feld4, feld5, feld6, feld7, feld8, feld9, feld10, feld11].every(Boolean),
  JSON.stringify({ feld1, feld2, feld3, feld4, feld5, feld6, feld7, feld8, feld9, feld10, feld11 }));

check("3 gewaehlte Quellen tragen Auswahlgrund + Relevanz (nachvollziehbar)",
  neu.sources.some((s) => s.auswahlgrund.length > 0 && s.relevanz > 0));
check("4 Versorgungsebene wird je Quelle klassifiziert",
  neu.sources.some((s) => s.versorgungsebene === "primaer_amtlich" || s.versorgungsebene === "primaer_direkt"));
check("5 ausgeschlossene Quellen tragen einen Grund (z. B. Lizenz untersagt)",
  neu.ausgeschlossen.some((e) => e.grund === "lizenz-untersagt") , JSON.stringify(neu.ausgeschlossen));
check("6 Gesundheit wird aus dem EINEN Modell gespeist (kanonischer Zustand, hier vorhanden)",
  neu.sources.some((s) => ["healthy", "degraded", "broken", "needs_review", "paused", "archived"].includes(s.gesundheit)));

// Dynamik: verschiedene Mandate -> verschiedene Plaene.
const planA = run.computeNewPlan({ id: "a", partei: "Die Linke" }, ctx.registry, {});
const planB = run.computeNewPlan({ id: "b", partei: "SPD" }, ctx.registry, {});
check("7 dynamisch: verschiedene Mandate ergeben verschiedene Quellenmengen",
  JSON.stringify(planA.sources.map((s) => s.id)) !== JSON.stringify(planB.sources.map((s) => s.id)));

// Determinismus.
check("8 deterministisch: gleiche Eingabe -> identischer Plan",
  shadow.isDeterministic(mandat, ctx) === true);

// Harte Trennung: Fehler im neuen Pfad beschaedigt Legacy nicht.
const brokenCtx = { registry: null, legacyAdapter: ctx.legacyAdapter, healthAdapter: ctx.healthAdapter, qualityAdapter: ctx.qualityAdapter };
const shadowErr = run.runShadowMandate(mandat, brokenCtx);
check("9 Fehler im neuen Pfad: neuError gesetzt, neu=null",
  shadowErr.neuError != null && shadowErr.neu === null);
check("10 Fehler im neuen Pfad: Legacy bleibt intakt + sichtbar",
  shadowErr.legacy.visible === true && shadowErr.legacyIntact === true);

// Legacy bleibt immer das sichtbare Ergebnis.
check("11 Legacy ist im Normalfall das allein sichtbare Ergebnis",
  res.shadow.legacy.visible === true && res.shadow.legacyIntact === true);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Shadow-Run-Assertions`);
process.exit(failed > 0 ? 1 : 0);
