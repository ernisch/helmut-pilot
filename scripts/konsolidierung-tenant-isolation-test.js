"use strict";

// Tests der Quellenplattform-KONSOLIDIERUNG · Mandantentrennung + DSGVO/PII (Phase 5 §4/§5).
// REINE LOGIK, synthetische Fixtures. Deckt die harten SaaS-Invarianten der Zielarchitektur ab:
//   - Globale Quellen werden per REFERENZ zugewiesen, NIE pro Mandant kopiert (Punkt 9).
//   - Private, kundenspezifische Quellen bleiben strikt nach Tenant getrennt (Punkt 10):
//     Mandant A sieht NIE eine private Quelle von B.
//   - Der Laufzeit-Versorgungsplan speist die mandantengetrennte Aufloesung (Schicht 4).
//   - DSGVO: der globale Katalogrecord enthaelt nur quellenbezogene Metadaten, keine privaten PII.

const K = require("../lib/helmut/quellenarchitektur/konsolidierung");
const VP = require("../lib/helmut/quellenarchitektur/konsolidierung-versorgungsplan");
const { scanForPrivatePii, buildSourceRecord } = require("../lib/helmut/quellenarchitektur/master/source-record");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Globaler Katalog (Referenzobjekte) + Laufzeit-Versorgungsplan.
const RECORDS = [
  { id: "g-basis", publisher_id: "publisher-bundestag.de", source_type: "parlament", political_level: "bund", universal: true, retrieval: { method: "rss", url: "https://www.bundestag.de/rss" }, trust: "hoch", review_status: "active", license_status: "offen_erlaubt" },
  { id: "g-linke", publisher_id: "publisher-die-linke.de", source_type: "fraktion", political_level: "bund", party_id: "linke", group_id: "linke", retrieval: { method: "rss", url: "https://www.die-linke.de/feed" }, trust: "mittel", review_status: "active", license_status: "presse_erlaubt" }
];
const plat = K.buildPlatform(RECORDS);
const plan = plat.supplyPlanFor({ id: "m-a", partei: "Die Linke", fraktion: "Die Linke" });

const globalCatalogById = { "g-basis": RECORDS[0], "g-linke": RECORDS[1] };
const privateSources = [
  { tenant_id: "A", id: "privA-1", publisher_id: "publisher-kunde-a.internal", relevance: 3 },
  { tenant_id: "B", id: "privB-1", publisher_id: "publisher-kunde-b.internal", relevance: 3 }
];

// Aufloesung fuer Mandant A.
const resA = VP.resolveTenantSupply("A", {
  supplyPlan: plan, globalCatalogById, privateSources, allPrivateSources: privateSources
});

check("T1 globale Quellen werden per Referenz zugewiesen (nicht kopiert)",
  resA.globalReferencedCount >= 1 && resA.sources.some((s) => s.source_id === "g-linke" && s.private === false && s.origin === "mandate_global"));
check("T2 Mandant A sieht seine EIGENE private Quelle",
  resA.sources.some((s) => s.private === true && s.source_id === "privA-1"));
check("T3 Mandant A sieht NIE die private Quelle von B",
  !resA.sources.some((s) => s.source_id === "privB-1"));
check("T4 harte Isolationspruefung: kein Leak",
  resA.isolation.isolated === true && resA.isolation.leaked.length === 0);

// Aufloesung fuer Mandant B (Symmetrie).
const resB = VP.resolveTenantSupply("B", {
  supplyPlan: plan, globalCatalogById, privateSources, allPrivateSources: privateSources
});
check("T5 Symmetrie: Mandant B sieht privB-1, nie privA-1",
  resB.sources.some((s) => s.source_id === "privB-1") && !resB.sources.some((s) => s.source_id === "privA-1"));

// Globale Quelle ist geteilt (dieselbe ID bei A und B) — Beleg fuer Referenz statt Kopie.
check("T6 dieselbe globale Quelle wird von A und B REFERENZIERT (eine globale Wahrheit)",
  resA.sources.some((s) => s.source_id === "g-linke") && resB.sources.some((s) => s.source_id === "g-linke"));

// Fremd-Tenant-Datensatz, der faelschlich uebergeben wird, muss abgewiesen + gemeldet werden.
const resLeakAttempt = VP.resolveTenantSupply("A", {
  supplyPlan: plan, globalCatalogById,
  privateSources: [{ tenant_id: "B", id: "sneaky", publisher_id: "x" }], allPrivateSources: privateSources
});
check("T7 faelschlich uebergebene Fremd-Private-Quelle wird abgewiesen + als Verletzung gemeldet",
  !resLeakAttempt.sources.some((s) => s.source_id === "sneaky") &&
  resLeakAttempt.violations.some((v) => v.startsWith("fremde-private-quelle-abgewiesen")));

// ── DSGVO / PII am globalen Katalogrecord ─────────────────────────────────────
const cleanRec = buildSourceRecord({
  publisher_id: "publisher-bmas.de", canonical_url: "https://www.bmas.de", source_type: "ministerium",
  political_level: "bund", discovery_origin: "official_directory", discovered_at: "2026-07-01",
  responsible: "regel-amtliche-quelle", license_status: "offen_erlaubt", privacy_status: "unbedenklich"
});
check("D1 sauberer Katalogrecord enthaelt keine privaten PII",
  scanForPrivatePii(cleanRec).length === 0, JSON.stringify(scanForPrivatePii(cleanRec)));
check("D2 privates Kontaktfeld wird als DSGVO-Verstoss erkannt",
  scanForPrivatePii({ ...cleanRec, private_email: "max.mustermann@example.com" }).length > 0);
check("D3 amtliche Rollen-Mailbox (presse@) bleibt erlaubt",
  scanForPrivatePii({ ...cleanRec, responsible: "presse@bmas.bund.de" }).length === 0);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Tenant-Isolation/DSGVO-Assertions`);
process.exit(failed > 0 ? 1 : 0);
