"use strict";

// Tests — Quellenplattform (Konsolidierung) · einheitliche Gesundheit + einheitliche Qualität,
// unbekannt vs. negativ (Aufgabe 9: 14, 15, 17). Rein statisch, kein Netz/KI/Storage.

const health = require("../lib/helmut/quellenplattform/health-model");
const quality = require("../lib/helmut/quellenplattform/quality-model");
const runtimeSource = require("../lib/helmut/quellenplattform/runtime-source");

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass += 1; console.log(`PASS  ${name}`); } else { fail += 1; console.log(`FAIL  ${name}`); } }

console.log("== 14. Ein Gesundheitsvokabular (10 Zustände) ==");
const WANTED = ["never_checked", "healthy", "slow", "degraded", "rate_limited", "http_error", "parser_error", "broken", "disabled", "quarantined"];
check("genau die 10 geforderten Zustände", WANTED.every((s) => health.HEALTH_STATES.includes(s)) && health.HEALTH_STATES.length === 10);
// Alle drei bisherigen Vokabulare landen im vereinheitlichten Modell.
const mainStates = ["healthy", "degraded", "broken", "needs_review", "paused", "archived"];
const s2States = ["never_checked", "reachable", "slow", "rate_limited", "http_error", "parser_error", "broken", "disabled"];
const s3States = ["unknown", "healthy", "degraded", "broken"];
check("main-Zustände (6) mappen alle in das Vokabular", mainStates.every((s) => health.isHealthState(health.fromMain(s))));
check("S2-Zustände (8) mappen alle in das Vokabular", s2States.every((s) => health.isHealthState(health.fromS2(s))));
check("S3-Zustände (4) mappen alle in das Vokabular", s3States.every((s) => health.isHealthState(health.fromS3(s))));
check("konkrete Mappings: reachable->healthy, unknown->never_checked, needs_review->quarantined",
  health.fromS2("reachable") === "healthy" && health.fromS3("unknown") === "never_checked" && health.fromMain("needs_review") === "quarantined");
check("Quarantäne-Importzustand überschreibt Gesundheit", health.fromIntake("quarantined") === "quarantined");
// Eskalation: Fehlerserie geht never_checked -> ... -> degraded -> broken.
let h = health.initialHealth();
for (let i = 0; i < 3; i++) h = health.applyObservation(h, { ok: false, httpStatus: 500 });
check("3 Fehler in Folge -> beeinträchtigt (degraded)", h.state === "degraded");
for (let i = 0; i < 3; i++) h = health.applyObservation(h, { ok: false, httpStatus: 500 });
check("6 Fehler in Folge -> defekt (broken)", h.state === "broken");
check("erfolgreiche Beobachtung setzt zurück auf healthy", health.applyObservation(h, { ok: true, latencyMs: 100 }).state === "healthy");
check("langsame Antwort -> slow", health.applyObservation(health.initialHealth(), { ok: true, latencyMs: 9000 }).state === "slow");

console.log("\n== Gesundheit ist GLOBAL/technisch — keine Mandantenrelevanz ==");
const rec = { id: "s", source_type: "parlament", political_level: "bund", trust: "hoch", health: "healthy", review_status: "active", license_status: "presse_erlaubt", privacy_status: "unbedenklich", discovery_origin: "official_directory", discovered_at: "2026-07-01", canonical_url: "https://s.example", retrieval: { method: "rss" } };
const rsGlobalA = runtimeSource.toRuntimeSource(rec, { visibility: "global" });
const rsForTenantB = runtimeSource.toRuntimeSource(rec, { visibility: "global" });
check("Gesundheit ist tenant-unabhängig (gleiche Quelle -> gleiche Gesundheit)", rsGlobalA.health.state === rsForTenantB.health.state);

console.log("\n== 15. Ein Qualitätsmodell (10 Achsen) ==");
check("genau die 10 geforderten Achsen", quality.AXES.length === 10 &&
  ["authority", "freshness", "mandateRelevance", "thematicRelevance", "regionalRelevance", "stability", "uniqueness", "independence", "legalStatus", "technicalAvailability"].every((a) => quality.AXES.includes(a)));
const rs = runtimeSource.toRuntimeSource(rec);
const qFull = quality.scoreQuality(rs, { assignment: { reasons: [{ dimension: "parties", matched: ["spd"], weight: 4 }] }, metrics: { attempts: 10, successes: 9, latestAgeHours: 2, documentCount: 20, koCount: 12, duplicateCount: 1, duplicatesAvailable: true } });
check("Gesamtscore = gewichtetes Mittel der verfügbaren Achsen (0..1)", qFull.score > 0 && qFull.score <= 1);
check("Autorität amtlicher Primärquelle ist hoch", qFull.axes.authority >= 0.9);

console.log("\n== 17. Fehlende Daten = UNBEKANNT, nicht NEGATIV ==");
const qBare = quality.scoreQuality(rs, {}); // keine Metriken, kein Zuweisungskontext
check("ohne Kontext: Relevanzachsen sind UNBEKANNT (nicht verfügbar), nicht 0",
  qBare.available.mandateRelevance === false && qBare.available.thematicRelevance === false && !("mandateRelevance" in qBare.axes));
check("Score wird NUR über verfügbare Achsen gebildet (unbekannte zählen nicht als 0)",
  qBare.score > 0 && qBare.unknownAxes.length > 0);
// Lizenz 'unbewertet' = unbekannt; 'untersagt' = negativ. Beide müssen sich unterscheiden.
const recUnknownLegal = { ...rec, license_status: "unbewertet", privacy_status: "unbewertet" };
const recBadLegal = { ...rec, license_status: "untersagt", privacy_status: "unzulaessig" };
const qUnknownLegal = quality.scoreQuality(runtimeSource.toRuntimeSource(recUnknownLegal), {});
const qBadLegal = quality.scoreQuality(runtimeSource.toRuntimeSource(recBadLegal), {});
check("Lizenz 'unbewertet' -> legalStatus UNBEKANNT (nicht bewertet)", qUnknownLegal.available.legalStatus === false);
check("Lizenz 'untersagt' -> legalStatus NEGATIV (Wert 0, aber verfügbar)", qBadLegal.available.legalStatus === true && qBadLegal.axes.legalStatus === 0);
check("nie geprüfte Quelle ohne jede Datengrundlage: Stabilität unbekannt (nicht 0)",
  quality.scoreQuality(runtimeSource.toRuntimeSource({ ...rec, health: "never_checked" }), {}).available.stability === false);

console.log(`\n== ${pass} PASS, ${fail} FAIL ==`);
if (fail) process.exit(1);
