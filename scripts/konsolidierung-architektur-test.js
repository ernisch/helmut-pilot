"use strict";

// Tests der Quellenplattform-KONSOLIDIERUNG · verbindliche Einzelmodelle + Architektur-Manifest.
// REINE LOGIK, synthetische Fixtures, kein Netz/KI/Storage. Deckt die Auftrags-Pflichtinvarianten
// der Zielarchitektur ab (Phase 3/5):
//   - EIN Gesundheitsmodell: kanonisches Vokabular + Schwellen aus dem Live-Modell; die
//     Sprint-2/3-Vokabulare bilden TOTAL hinein; Eskalation ueber die kanonischen Schwellen (3/6).
//   - EIN Qualitaetsmodell: kategoriales Watchdog-Urteil ist die Wahrheit; der Sprint-2-Skalar ist
//     untergeordnet und zieht seine Stabilitaet aus der kanonischen Gesundheit.
//   - Keine Pilot-/Mandanten-Sonderfaelle in der Konsolidierungsschicht.
//   - Das Architektur-Manifest kodiert genau die verbindlichen Entscheidungen.

const fs = require("fs");
const path = require("path");
const model = require("../lib/helmut/quellenarchitektur/model");
const K = require("../lib/helmut/quellenarchitektur/konsolidierung");
const H = require("../lib/helmut/quellenarchitektur/konsolidierung-modelle");
const s2quality = require("../lib/helmut/quellenbibliothek/quality");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
function eqArr(a, b) { return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]); }

// ── EIN Gesundheitsmodell ────────────────────────────────────────────────────
check("H1 kanonisches Gesundheitsvokabular == Live-Modell PATH_STATUS",
  eqArr(H.CANONICAL_HEALTH_STATES, model.PATH_STATUS), JSON.stringify(H.CANONICAL_HEALTH_STATES));
check("H2 kanonische Schwellen stammen aus dem Live-Modell (3/6)",
  H.HEALTH_THRESHOLDS.degrade === model.DEGRADE_THRESHOLD && H.HEALTH_THRESHOLDS.broken === model.BROKEN_THRESHOLD,
  JSON.stringify(H.HEALTH_THRESHOLDS));

const S2_ACUTE_STATES = ["reachable", "slow", "rate_limited", "http_error", "parser_error", "broken", "never_checked", "disabled"];
check("H3 alle Sprint-2-Akutzustaende bilden TOTAL ins kanonische Vokabular",
  S2_ACUTE_STATES.every((s) => H.CANONICAL_HEALTH_STATES.includes(H.acuteToCanonicalHealth(s))),
  S2_ACUTE_STATES.map((s) => `${s}->${H.acuteToCanonicalHealth(s)}`).join(", "));

const S3_STATES = ["unknown", "healthy", "degraded", "broken"];
check("H4 alle Sprint-3-Aggregatzustaende bilden TOTAL ins kanonische Vokabular",
  S3_STATES.every((s) => H.CANONICAL_HEALTH_STATES.includes(H.catalogHealthToCanonical(s))));

check("H5 Sprint-3-Aggregat nutzt bereits die kanonischen Schwellen (kein Parallelmodell)",
  H.catalogHealthUsesCanonicalThresholds() === true);

// Eskalation ueber die kanonischen Schwellen (6), NICHT die Sprint-2-Serie (5).
const fiveFails = Array.from({ length: 5 }, () => ({ ok: false, httpStatus: 500 }));
const sixFails = Array.from({ length: 6 }, () => ({ ok: false, httpStatus: 500 }));
check("H6 5 Fehler in Folge sind NOCH nicht 'broken' (kanonische Schwelle ist 6, nicht 5)",
  H.healthFromObservations(fiveFails) === "degraded", H.healthFromObservations(fiveFails));
check("H7 6 Fehler in Folge -> 'broken' (kanonische Schwelle)",
  H.healthFromObservations(sixFails) === "broken", H.healthFromObservations(sixFails));
check("H8 healthFromObservations liefert AUSSCHLIESSLICH kanonische Zustaende",
  [[], [{ ok: true, latencyMs: 100 }], fiveFails, sixFails, [{ ok: false, httpStatus: 429 }]]
    .every((obs) => H.CANONICAL_HEALTH_STATES.includes(H.healthFromObservations(obs))));
check("H9 nextHealthStatus delegiert an das Live-Modell (identisches Ergebnis)",
  H.nextHealthStatus("healthy", { success: false, errorStreak: 6 }) === model.nextPathStatus("healthy", { success: false, errorStreak: 6 }));

// ── EIN Qualitaetsmodell ─────────────────────────────────────────────────────
check("Q1 verbindliche Qualitaetswahrheit ist der Live-Watchdog",
  H.QUALITY_VERDICT_SOURCE === "quellenarchitektur/quality-watchdog.js");

const now = 1_000_000_000_000;
const verdict = H.sourceQualityVerdict({
  paths: [{ id: "p1", legacy_source_id: "s1", status: "healthy", activation_mode: "auto" }],
  rawDocs: [{ source_id: "s1", retrieved_at: now - 3600000 }],
  koSourceLinks: [{ knowledge_object_id: "k1", source_ids: ["s1"] }],
  activePathIds: ["p1"], now
});
check("Q2 kanonisches Urteil ist KATEGORIAL (productValue aus dem Watchdog-Vokabular)",
  ["ergiebig", "nur_duplikate", "ohne_ko", "ohne_ko_unbestaetigt", "unbekannt"].includes(verdict.verdicts[0].productValue),
  verdict.verdicts[0] && verdict.verdicts[0].productValue);

const desc = { id: "s1", evidenceRole: "official_primary", trust: "hoch", expectedFrequency: "daily" };
const metrics = { attempts: 10, successes: 9, latencyMs: 500 };
const rankBroken = H.rankingScore(desc, metrics, { canonicalHealthState: "broken" });
const rankHealthy = H.rankingScore(desc, metrics, { canonicalHealthState: "healthy" });
check("Q3 Ranking-Score ist ausdruecklich UNTERGEORDNET (nicht autoritativ)",
  rankBroken.isAuthoritative === false && rankBroken.subordinateTo === H.QUALITY_VERDICT_SOURCE);
check("Q4 Ranking-Stabilitaet zieht aus der kanonischen Gesundheit (broken < healthy)",
  rankBroken.axes.stability < rankHealthy.axes.stability,
  `broken=${rankBroken.axes.stability} healthy=${rankHealthy.axes.stability}`);
check("Q5 nur EINE Achsen-/Gewichtsdefinition (aus der Sprint-2-Bibliothek)",
  eqArr(H.RANKING_AXES, s2quality.AXES) && Object.keys(H.RANKING_WEIGHTS).length === s2quality.AXES.length);

// ── Architektur-Manifest ─────────────────────────────────────────────────────
const A = K.ARCHITECTURE;
check("M1 Sprint 1 = einzige Mandatswahrheit",
  A.mandateResolution.authority.includes("mandate-registry") && A.mandateResolution.writeTruth === "mandate_profiles");
check("M2 Sprint 3 = einziger globaler Master-Katalog, nicht pro Mandant kopiert",
  A.masterCatalog.authority.includes("master") && A.masterCatalog.global === true && A.masterCatalog.copiedPerTenant === false);
check("M3 Sprint 2 = dynamische Auswahl/Gewichtung/Discovery/Parser",
  A.dynamicSelection.authority.includes("assignment") &&
  ["selection", "weighting", "discovery", "parser"].every((x) => A.dynamicSelection.delivers.includes(x)));
check("M4 Paket = dynamischer Laufzeitplan, NICHT persistiert",
  A.supplyPackage.model === "runtime_supply_plan" && A.supplyPackage.persisted === false);
check("M5 Legacy-Pakete bleiben Kompatibilitaetsschicht",
  /profile-packages|source_packages/.test(A.supplyPackage.legacy || ""));
check("M6 EIN Gesundheitsmodell im Manifest",
  A.health.authority === "quellenarchitektur/model.js" && eqArr(A.health.states, model.PATH_STATUS));
check("M7 EIN Qualitaetsmodell im Manifest (Skalar untergeordnet)",
  A.quality.authority === "quellenarchitektur/quality-watchdog.js" && /nicht autoritativ/.test(A.quality.subordinate));
check("M8 Tenant: global referenziert, privat getrennt",
  A.tenantSeparation.globalByReference === true && A.tenantSeparation.privateTenantIsolated === true);

// ── Keine Pilot-/Mandanten-Sonderfaelle ──────────────────────────────────────
const KONSO_FILES = [
  "lib/helmut/quellenarchitektur/konsolidierung.js",
  "lib/helmut/quellenarchitektur/konsolidierung-modelle.js",
  "lib/helmut/quellenarchitektur/konsolidierung-versorgungsplan.js"
];
const FORBIDDEN = [/===\s*["']pilot["']/i, /["']pilot["']\s*===/i, /isPilot/i, /pilotOnly/i, /=== *["']linke["'].*special/i];
let pilotHit = null;
for (const rel of KONSO_FILES) {
  const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
  for (const re of FORBIDDEN) if (re.test(src)) { pilotHit = `${rel}: ${re}`; break; }
  if (pilotHit) break;
}
check("P1 keine Pilot-/Sonderfall-Verzweigung in der Konsolidierungsschicht", pilotHit === null, pilotHit || "");

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Konsolidierungs-Architektur-Assertions`);
process.exit(failed > 0 ? 1 : 0);
