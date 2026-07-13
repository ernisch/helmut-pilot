"use strict";

// Tests fuer Sprint 8: Admin-Report (reine Reshaping-Logik der 6 Ansichten).
// Reine Offline-Tests (echter Sprint-1-Katalog + S4-Aktivierung + S7-Qualitaetsreport).
// Prueft: die 6 Ansichten, ehrliche Leerzustaende (Tabellen nicht migriert / Metriken leer),
// keine erfundenen Zahlen, kuratierter (entrauschter) Pruefbedarf.

const { buildFullModel } = require("../lib/helmut/quellenarchitektur");
const pp = require("../lib/helmut/quellenarchitektur/profile-packages");
const qw = require("../lib/helmut/quellenarchitektur/quality-watchdog");
const ar = require("../lib/helmut/quellenarchitektur/admin-report");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const NOW = Date.parse("2026-07-13T12:00:00Z");
const H = 3600000;
const M = buildFullModel();
const cem = { id: "cem-ince", fullName: "Cem Ince", party: "Die Linke", politische_ebene: "bundestag", ausschuesse: ["Arbeit und Soziales"], bundesland: "Niedersachsen", profileActive: true };
const berlin = { id: "be", fullName: "Berlin MdA", party: "SPD", politische_ebene: "landtag", bundesland: "Berlin", ausschuesse: ["Inneres"], profileActive: true };
const activation = pp.computeGlobalActivation({ packages: M.packages, packagePaths: M.packagePaths, retrievalPaths: M.retrievalPaths, profiles: [cem, berlin] });

// A) LEERE Metriken = neue Tabellen nicht migriert (Ehrlichkeits-Leerzustand)
const qualityEmpty = qw.buildQualityReport({ catalog: { retrievalPaths: M.retrievalPaths, packages: M.packages, packagePaths: M.packagePaths }, activation, rawDocs: [], koSourceLinks: [], dedupDocuments: [], profiles: [cem, berlin], llmUsage: [], signals: {}, now: NOW });
const rEmpty = ar.buildSourceAdminReport({ catalog: M, activation, qualityReport: qualityEmpty, now: NOW });

console.log("== Migrations-/Leerzustand ==");
check("Migration: neue Tabellen NICHT migriert (Default)", rEmpty.migration.newTablesMigrated === false);
check("Migrations-Hinweis nennt Vorschau/Bestandsdaten", /Vorschau|Bestandsdaten|nicht migriert/i.test(rEmpty.migration.note));
check("availability spiegelt leere Metriken (alle false)", rEmpty.availability.documents === false && rEmpty.availability.duplicates === false && rEmpty.availability.costAttribution === false && rEmpty.availability.pathTelemetry === false);

console.log("== View 1: Länder und Pakete ==");
const lp = rEmpty.views.laenderPakete;
check("16 Bundesländer gelistet", lp.laender.length === 16);
check("welche Länder vorbereitet: Berlin/Brandenburg", ["Berlin", "Brandenburg"].every((n) => lp.laender.find((l) => l.name === n && l.status === "vorbereitet")));
check("welches Land aktiv: Niedersachsen (regional-niedersachsen active)", !!lp.laender.find((l) => l.name === "Niedersachsen" && l.status === "aktiv"));
check("13 Länder ohne Modul", rEmpty.counts.laenderKeinModul === 13);
const berlinLand = lp.laender.find((l) => l.name === "Berlin");
check("welche Pflichtklassen fehlen: Berlin 15/15 fehlend (ehrlich, keine Quellen)", berlinLand.pflichtklassen.total === 15 && berlinLand.pflichtklassen.missing.length === 15);
check("Länder ohne Landesmodul: keine erfundenen Pflichtklassen", lp.laender.find((l) => l.name === "Bayern").pflichtklassen.total === 0);
check("Pakete: berlin/brandenburg 'vorbereitet'", ["berlin-basis", "brandenburg-basis"].every((k) => lp.pakete.find((p) => p.key === k && p.supply === "vorbereitet")));

console.log("== View 2: Quellen und Abrufwege ==");
const qa = rEmpty.views.quellenAbrufwege;
check("alle 145 Abrufwege bewertet (keine Lücke)", qa.pathCount === 145);
check("nach Herausgeber gruppiert (51 Herausgeber)", qa.herausgeber.length === 51);
check("welche Abrufwege gesund/defekt/unbekannt (drei Kübel)", typeof qa.healthCounts.gesund === "number" && typeof qa.healthCounts.defekt === "number" && typeof qa.healthCounts.unbekannt === "number");
check("defekte Abrufwege erkannt (>=6 broken aus Sprint 1)", qa.healthCounts.defekt >= 6);
check("ohne Metriken: keine 'gesund' erfunden (alle unbekannt/defekt/inaktiv)", qa.healthCounts.gesund === 0);
const bundestagPath = rEmpty.views.quellendetail.paths.find((p) => p.legacy_source_id === "bundestag");
check("defekte Pflichtquelle (bundestag) -> health defekt", bundestagPath.health === "defekt");

console.log("== View 3: Profile und Paketversorgung ==");
const prof = rEmpty.views.profileVersorgung;
check("welche Profile versorgt: Cem versorgt", prof.find((p) => p.profileId === "cem-ince").supply === "versorgt");
check("welche Profile unversorgt: Berlin-MdA unversorgt (Landespaket prepared)", prof.find((p) => p.profileId === "be").supply === "unversorgt");
check("unversorgtes Profil trägt konkrete Handlung", prof.find((p) => p.profileId === "be").recommendedAction.severity !== "keine");

console.log("== View 4: Prüfbedarf (kuratiert, ruhig) ==");
const pb = rEmpty.views.pruefbedarf;
check("Prüfbedarf ist entrauscht (nur konkrete Probleme, < 20)", pb.actions.length > 0 && pb.actions.length < 20);
check("KEINE 139 'beobachten'-Rauschhinweise (nur echte Probleme)", pb.actions.every((a) => a.severity === "hoch" || a.severity === "mittel"));
check("defekte Pflichtquellen als 'hoch'", pb.actions.some((a) => a.area === "abrufweg" && a.severity === "hoch"));
check("unversorgtes Profil im Prüfbedarf", pb.actions.some((a) => a.area === "profil" && a.ref === "be"));
check("nach Schwere sortiert (hoch zuerst)", pb.actions[0].severity === "hoch");
check("welche Messwerte noch nicht verfügbar: als Hinweise gelistet", pb.missingMetrics.length >= 4);

console.log("== View 5: Quellendetail ==");
const detail = rEmpty.views.quellendetail.paths;
check("Quellendetail je Abrufweg vorhanden (145)", detail.length === 145);
const cemNews = detail.find((p) => p.legacy_source_id === "cem-ince-news");
check("Detail trägt Herausgeber/Methode/Pakete", cemNews.publisher && cemNews.method && Array.isArray(cemNews.packages));
check("ohne Metriken: documentCount/koCount = null (nicht 0 erfunden)", cemNews.documentCount === null && cemNews.koCount === null);
check("ohne Dedup: duplicateCount = null", cemNews.duplicateCount === null);

console.log("== View 6: Kosten und Produktnutzen ==");
const kn = rEmpty.views.kostenNutzen;
check("Kosten: Gesamt 0 bei leerer llm_usage (real, nicht erfunden)", kn.costs.totalUsd === 0);
check("Kosten-Attribution ehrlich nicht verfügbar", kn.costs.sourceAttributionAvailable === false);
check("kostenOhneNutzen ohne Nutzendaten leer (keine Behauptung)", kn.kostenOhneNutzen.length === 0);

// B) MIT realen Metriken -> gesund + Kosten + Nutzen sichtbar (keine Erfindung, echte Fixtures)
console.log("== Mit realen Bestandsdaten (Dokumente/Kosten) ==");
const rawDocs = [
  { source_id: "bmas", retrieved_at: new Date(NOW - 2 * H).toISOString() }, { source_id: "bmas", retrieved_at: new Date(NOW - 3 * H).toISOString() },
  { source_id: "tagesschau-politik", retrieved_at: new Date(NOW - 1 * H).toISOString() }
];
const koSourceLinks = [{ knowledge_object_id: "ko-1", source_ids: ["bmas", "tagesschau-politik"] }];
const llmUsage = [{ createdAt: new Date(NOW - 1 * H).toISOString(), pipelineStep: "understanding", model: "gpt-5-mini", estimatedCost: 0.0012 }];
const qualityReal = qw.buildQualityReport({ catalog: { retrievalPaths: M.retrievalPaths, packages: M.packages, packagePaths: M.packagePaths }, activation, rawDocs, koSourceLinks, dedupDocuments: [], profiles: [cem, berlin], llmUsage, signals: { storageOk: true, crawlAt: new Date(NOW - 2 * H).toISOString() }, now: NOW });
const rReal = ar.buildSourceAdminReport({ catalog: M, activation, qualityReport: qualityReal, now: NOW });
const bmas = rReal.views.quellendetail.paths.find((p) => p.legacy_source_id === "bmas");
check("mit Doku-Daten: bmas gesund", bmas.health === "gesund");
check("mit Doku-Daten: documentCount echt (2, nicht null)", bmas.documentCount === 2);
check("mit KO-Daten: bmas Produktnutzen 'ergiebig'", bmas.value === "ergiebig");
check("Kosten je Pipeline-Schritt echt sichtbar", rReal.views.kostenNutzen.costs.byPipelineStep.understanding === 0.0012);
check("availability.documents=true bei echten Dokumenten", rReal.availability.documents === true);

// C) ROBUSTHEIT (Verify B1): kaputte Profil-Elemente dürfen den Report NICHT crashen lassen.
console.log("== Robustheit: kaputte/leere Profil-Elemente ==");
const brokenProfiles = [null, undefined, "kaputt", 42, {}, cem];
const activationBroken = pp.computeGlobalActivation({ packages: M.packages, packagePaths: M.packagePaths, retrievalPaths: M.retrievalPaths, profiles: brokenProfiles });
let robustOk = true, robustReport = null;
try {
  const qb = qw.buildQualityReport({ catalog: { retrievalPaths: M.retrievalPaths, packages: M.packages, packagePaths: M.packagePaths }, activation: activationBroken, rawDocs: [], koSourceLinks: [], dedupDocuments: [], profiles: brokenProfiles, llmUsage: [], signals: {}, now: NOW });
  robustReport = ar.buildSourceAdminReport({ catalog: M, activation: activationBroken, qualityReport: qb, now: NOW });
} catch (e) { robustOk = false; }
check("kaputte Profil-Elemente (null/undefined/String/Zahl/{}) crashen den Report NICHT", robustOk === true && robustReport !== null);
check("gültiges Profil (Cem) bleibt trotz kaputter Nachbarn versorgt", robustReport && robustReport.views.profileVersorgung.some((p) => p.profileId === "cem-ince" && p.supply === "versorgt"));
check("kaputte Elemente werden 'nicht_aktivierbar', nicht fälschlich versorgt", robustReport && robustReport.views.profileVersorgung.filter((p) => p.supply === "versorgt").length === 1);

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
