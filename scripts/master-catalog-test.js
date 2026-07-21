"use strict";

// Tests — Master Quellenkatalog (Sprint 3). Reine Offline-Tests (Fixtures/Seed), kein Netz,
// keine KI, kein DB-Zugriff. Keine realen Mandanten im Code (kuenstliche IDs tenant-alpha etc.).
//
// Deckt die Auftrags-Testpunkte ab (Phase 10): idempotenter Import (1), Dublettenerkennung (2),
// URL-Normalisierung (3), Herausgeber-Zusammenfuehrung (4), Parteien/Fraktionen (5), Ausschuss (6),
// Themen (7), Region (8), globale Quelle (9), fehlende Herkunft (12), fehlende Lizenzpruefung (13),
// veraltete (14), ersetzte (15), deaktivierte (16), Quarantaene (17), Shadow-Vergleich (18),
// ausgewogene Abdeckung (19), keine Alleinversorgung durch einen Suchanbieter (20), kein
// fest codierter Pilot-Sonderfall (22), neue Partei/Ausschuss/Bundesland ohne Codeaenderung (23/24/25).
// Mandantentrennung (10/11) + Datenschutz (21) liegen in master-catalog-tenant-test.js.

const fs = require("fs");
const path = require("path");
const M = require("../lib/helmut/quellenarchitektur/master");
const { model, taxonomy, sourceRecord, acquisition, intake, assignment, supply, coverage, shadow } = M;
const { buildMasterPackages, partyPackages, landPackages, committeePackages } = require("../lib/helmut/quellenarchitektur/master/seeds/packages");
const quellenarchitektur = require("../lib/helmut/quellenarchitektur");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const CAT = M.buildMasterCatalog();

// ============================ Taxonomie (Phase 2) ============================
console.log("== Taxonomie ==");
check("26 inhaltliche Kategorien", taxonomy.CONTENT_SOURCE_TYPE_IDS.length === 26);
check("Suchanbieter ist eigener technischer Typ, keine Inhaltskategorie", !taxonomy.CONTENT_SOURCE_TYPE_IDS.includes("suchanbieter") && taxonomy.isSearchProviderType("suchanbieter"));
check("Partei = Position, nicht Fakt", taxonomy.isPositionType("partei") && !taxonomy.isFactualType("partei"));
check("Parlament/Behoerde = Fakt", taxonomy.isFactualType("parlament") && taxonomy.isFactualType("behoerde"));
check("Taxonomie kodiert keine Produktlogik (nur Datenfelder)", taxonomy.SOURCE_TYPES.every((t) => typeof t.id === "string" && typeof t.name === "string"));

// ============================ 3) URL-Normalisierung ============================
console.log("== URL-Normalisierung ==");
check("Tracking/www entfernt", model.canonicalUrl("https://www.bmas.de/a?utm_source=x&id=7") === "https://bmas.de/a?id=7");
check("Suchquery normalisiert (Wortstellung stabil)", model.normalizeSearchQuery("Pflege OR Rente") === model.normalizeSearchQuery("rente or pflege"));
check("kanonischer Schluessel gleich fuer www/nicht-www",
  model.canonicalSourceKey({ url: "https://www.dgb.de/presse", method: "html" }) === model.canonicalSourceKey({ url: "https://dgb.de/presse", method: "html" }));

// ============================ 4) Herausgeber-Zusammenfuehrung ============================
console.log("== Herausgeber-Zusammenfuehrung ==");
check("Domain-Varianten -> ein Herausgeber", model.publisherIdForDomain("www.BMAS.de") === model.publisherIdForDomain("bmas.de"));
check("Google News -> Aggregator-Herausgeber", model.publisherIdForDomain("news.google.com") === "aggregator-google-news");
{
  const dup = model.dedupeCandidates([
    { url: "https://www.bmas.de/feed", method: "rss" },
    { url: "https://bmas.de/feed", method: "rss" }
  ]);
  check("Herausgeber+URL-Dublette zusammengefuehrt", dup.uniqueCount === 1 && dup.duplicateCount === 1);
}

// ============================ 1) Idempotenter Import ============================
console.log("== Idempotenter Import ==");
{
  const candidates = [
    { url: "https://www.example-amt.de/feed", method: "rss", source_type: "behoerde", political_level: "bund", discovery_origin: "official_directory", discovered_at: "2026-07-21" },
    { url: "https://example-amt.de/feed?utm_source=news", method: "rss", source_type: "behoerde", political_level: "bund", discovery_origin: "official_directory", discovered_at: "2026-07-21" }
  ];
  const run1 = intake.ingestBatch([], candidates, { clock: "2026-07-21" });
  const run2 = intake.ingestBatch(run1.catalog, candidates, { clock: "2026-07-21" });
  check("erste Charge: 1 Aufnahme, 1 Batch-Dublette", run1.report.added === 1 && run1.report.duplicatesInBatch === 1);
  check("zweite Charge idempotent: 0 neue Aufnahmen", run2.report.added === 0 && run2.catalog.length === run1.catalog.length);
  check("Neuzugang landet auf 'normalized', NIE direkt 'active'", run1.catalog[0].review_status === "normalized");
}

// ============================ 2) Dublettenerkennung ============================
console.log("== Dublettenerkennung ==");
{
  const d = model.dedupeCandidates([
    { publisher_id: "aggregator-google-news", method: "googlenews_search", query: "\"Ausschuss fuer Gesundheit\" Bundestag" },
    { publisher_id: "aggregator-google-news", method: "googlenews_search", query: "bundestag \"ausschuss fuer gesundheit\"" }
  ]);
  check("Suchweg-Dublette ueber normalisierte Query erkannt", d.uniqueCount === 1);
}

// ============================ 5) Parteien & Fraktionen ============================
console.log("== Parteien & Fraktionen ==");
check("je Partei ein generiertes Paket (datengetrieben)", partyPackages().length === M.parties.length);
check("alle 9 Parteien im Coverage", CAT.coverage.byParty.length === 9);
check("keine Partei unterversorgt (je >=1 Direktquelle)", CAT.coverage.findings.unterversorgung.filter((id) => String(id).startsWith("party-")).length === 0);
{
  const linkeSource = CAT.records.find((r) => r.party_id === "party-linke");
  const keys = assignment.assignSourceToPackages(linkeSource, CAT.packages);
  check("Linke-Quelle wird ihrem Partei-Paket zugeordnet", keys.includes("partei-linke"));
}

// ============================ 6) Ausschuss-Zuordnung ============================
console.log("== Ausschuss-Zuordnung ==");
check("je Ausschuss ein generiertes Paket", committeePackages().length === M.committees.length);
check("23 Ausschuesse im Coverage", CAT.coverage.byCommittee.length === 23);
{
  const src = CAT.records.find((r) => (r.committee_ids || []).includes("committee-bt-gesundheit"));
  check("Gesundheitsausschuss-Quelle vorhanden", !!src);
  check("Zuordnung ins Ausschuss-Paket", assignment.assignSourceToPackages(src, CAT.packages).includes("ausschuss-gesundheit"));
}

// ============================ 7) Themen-Zuordnung ============================
console.log("== Themen-Zuordnung ==");
{
  const rec = { source_type: "fachmedien", topics: ["Pflegeversicherung", "Rente"], retrieval: { method: "rss" } };
  const pkg = { key: "thema-soziales", criteria: { topics: ["pflege", "rente"], search_provider_ok: true } };
  check("Thema matcht ueber Wortstamm", assignment.assignSourceToPackages(rec, [pkg]).includes("thema-soziales"));
  check("kein Match bei fremdem Thema", !assignment.assignSourceToPackages({ source_type: "fachmedien", topics: ["Verkehr"], retrieval: { method: "rss" } }, [pkg]).length);
}

// ============================ 8) Regionale Zuordnung ============================
console.log("== Regionale Zuordnung ==");
check("16 Bundeslaender im Coverage", CAT.coverage.byBundesland.length === 16);
check("je Bundesland ein generiertes Landespaket", landPackages().length === M.laender.length);
{
  const rbb = CAT.records.find((r) => r.id === "seed-region-rbb24-de");
  check("rbb24 traegt Region Berlin+Brandenburg", rbb && rbb.region_ids.includes("geo-land-berlin") && rbb.region_ids.includes("geo-land-brandenburg"));
}

// ============================ 9) Globale Quelle (einmal kanonisch) ============================
console.log("== Globale Quelle ==");
{
  const keys = CAT.records.map((r) => r.canonical_key);
  check("jede Quelle hat einen kanonischen Schluessel", keys.every(Boolean));
  check("kein doppelter kanonischer Schluessel im Katalog", new Set(keys).size === keys.length);
  check("kein doppelter Record-ID", new Set(CAT.records.map((r) => r.id)).size === CAT.records.length);
}

// ============================ 4/20) Beschaffungsstrategie & Suchanbieter-Rang ============================
console.log("== Beschaffungsstrategie ==");
check("amtliche API = Prioritaet 1", acquisition.acquisitionTier({ source_type: "parlament", retrieval: { method: "api" } }) === 1);
check("Suchanbieter = immer Prioritaet 5", acquisition.acquisitionTier({ source_type: "ausschuss", retrieval: { method: "googlenews_search" } }) === 5);
check("Medien = Prioritaet 4", acquisition.acquisitionTier({ source_type: "medien_ueberregional", retrieval: { method: "rss" } }) === 4);

// ============================ 12) Fehlende Herkunft ============================
console.log("== Fehlende Herkunft ==");
{
  const rec = sourceRecord.buildSourceRecord({ url: "https://x-amt.de", method: "html", source_type: "behoerde", political_level: "bund" });
  const v = sourceRecord.validateSourceRecord(rec);
  check("ohne discovery_origin -> ungueltig", !v.ok && v.errors.some((e) => /Herkunft/.test(e)));
  check("ohne discovered_at -> ungueltig", v.errors.some((e) => /discovered_at/.test(e)));
}

// ============================ 13) Fehlende Lizenzpruefung ============================
console.log("== Fehlende Lizenzpruefung ==");
{
  const rec = sourceRecord.buildSourceRecord({
    url: "https://amt.de", method: "html", source_type: "behoerde", political_level: "bund",
    discovery_origin: "official_directory", discovered_at: "2026-07-21", review_status: "classified"
  });
  check("Lizenz unbewertet -> nicht aktivierbar", sourceRecord.isEligibleForActivation(rec).ok === false);
  const ok = { ...rec, license_status: "presse_erlaubt", privacy_status: "oeffentliche_mandatsdaten", release_status: "manuell_freigegeben", review_status: "released" };
  check("nach Lizenz+Datenschutz+Freigabe -> aktivierbar", sourceRecord.isEligibleForActivation(ok).ok === true);
}

// ============================ 5-Zustandsmaschine: 14/15/16/17 ============================
console.log("== Importzustaende (veraltet/ersetzt/deaktiviert/quarantaene) ==");
check("kein direkter Sprung entdeckt->aktiv", !model.canTransition("discovered", "active"));
check("regulaerer Pfad ...->released->active erlaubt", model.canTransition("released", "active"));
check("aktiv -> ersetzt (superseded) erlaubt", model.canTransition("active", "superseded"));   // 15
check("aktiv -> archiviert (deaktiviert) erlaubt", model.canTransition("active", "archived")); // 16
check("aktiv -> quarantaene erlaubt", model.canTransition("active", "quarantined"));           // 17
check("archiviert ist terminal", model.INTAKE_TRANSITIONS.archived.length === 0);
{
  const supersededSeed = CAT.records.find((r) => r.id === "seed-bmwi-old");
  check("Seed enthaelt eine ersetzte (veraltete) Quelle", supersededSeed && supersededSeed.review_status === "superseded"); // 14
}
check("quarantaene/duplikat erfordern Review", model.REVIEW_REQUIRED_STATES.includes("quarantined") && model.REVIEW_REQUIRED_STATES.includes("duplicate_candidate"));
check("nur active/restricted sind serveable", model.SERVEABLE_STATES.join(",") === "active,restricted");

// ============================ 18) Shadow-Vergleich (Alt-relational vs. Master) ============================
console.log("== Shadow-Vergleich ==");
{
  const full = quellenarchitektur.buildFullModel();
  const { comparison } = M.shadowAgainstRelational(full);
  check("Vergleich liefert ein Urteil", ["identisch", "erklaerbare_abweichung", "pruefbeduerftig", "konflikt"].includes(comparison.verdict));
  check("alle 6 Kategorien sind Arrays", [comparison.onlyOld, comparison.onlyNew, comparison.differingClassification, comparison.conflictingUrls, comparison.likelyDuplicates, comparison.differingAssignment].every(Array.isArray));
  check("reproduzierbar: zweiter Lauf identisch", JSON.stringify(M.shadowAgainstRelational(full).comparison.counts) === JSON.stringify(comparison.counts));
  check("nur-Alt und nur-Neu werden getrennt ausgewiesen", comparison.counts.onlyOld >= 0 && comparison.counts.onlyNew >= 0);
}
{
  // gezielte URL-Widerspruchspruefung: gleicher Herausgeber+Methode+Rolle, zwei URLs.
  const conflicts = shadow.detectUrlConflicts([
    { id: "a", publisher_id: "publisher-x.de", source_type: "ministerium", canonical_url: "https://x.de/feed-a", retrieval: { method: "rss" } },
    { id: "b", publisher_id: "publisher-x.de", source_type: "ministerium", canonical_url: "https://x.de/feed-b", retrieval: { method: "rss" } }
  ]);
  check("widerspruechliche URLs erkannt", conflicts.length === 1 && conflicts[0].urls.length === 2);
}

// ============================ 19/20) Ausgewogenheit & keine Alleinversorgung durch Suchanbieter ============================
console.log("== Ausgewogenheit & Suchanbieter-Regel ==");
check("Gegenpositionen vorhanden (mehrere Parteien mit Positionsquellen)", CAT.coverage.findings.fehlendeGegenpositionen === false);
// 22 von 23 Ausschuessen sind heute Suchanbieter-Monokultur (Petitionsausschuss hat eine
// belegbare Direktquelle -> nicht such-allein). Genau diese Abhaengigkeit macht die Matrix sichtbar.
check("22 von 23 Ausschuessen sind Suchanbieter-Monokultur (Petitionen ausgenommen)", CAT.coverage.findings.nurSuchanbieterBuckets.filter((id) => String(id).startsWith("committee-")).length === 22);
{
  // Versorgungsstandard: eine Partei-Ebene NUR mit Suchanbieter gilt als NICHT versorgt (Abnahme §9).
  const searchOnly = [{ review_status: "active", source_type: "suchanbieter", publisher_id: "aggregator-google-news", trust: "niedrig", retrieval: { method: "googlenews_search" } }];
  const evalSearch = supply.evaluateLevel(supply.LEVEL_BY_ID.get("party"), searchOnly);
  check("Partei nur ueber Suchanbieter -> nicht versorgt", evalSearch.met === false && evalSearch.reasons.includes("nur-suchanbieter-versorgung"));
  const real = [{ review_status: "active", source_type: "partei", publisher_id: "publisher-spd.de", party_id: "party-spd", trust: "mittel", health: "healthy", retrieval: { method: "html" } }];
  const evalReal = supply.evaluateLevel(supply.LEVEL_BY_ID.get("party"), real);
  check("Partei mit echter Direktquelle -> versorgt", evalReal.met === true);
}
check("Suchanbieter-Gesamtanteil wird ausgewiesen", typeof CAT.coverage.overallSearchShare === "number");
check("Quellen ohne Rechtsbewertung werden gefunden", CAT.coverage.findings.quellenOhneRechtsbewertung.length > 0);

// ============================ 22) Kein fest codierter Pilot-Sonderfall ============================
console.log("== Kein Pilot-Sonderfall ==");
{
  const dir = path.join(__dirname, "..", "lib", "helmut", "quellenarchitektur", "master");
  const files = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith(".js")) files.push(p); } })(dir);
  const offenders = [];
  for (const f of files) {
    const txt = fs.readFileSync(f, "utf8");
    // Ein hartkodierter Mandant/Pilot waere eine konkrete, in Anfuehrungszeichen stehende
    // Personen-/Mandats-ID (String-Literal). Deutsche Prosa wie "Pilot-Sonderfall" in Kommentaren
    // ist zulaessig; ein echtes ID-Literal nicht.
    if (/["'`]pilot-[a-z0-9]{4,}["'`]/i.test(txt) ||
        /["'`](?:mandats?-|user[-_]?id-|politician-)[a-z0-9]{6,}["'`]/i.test(txt) ||
        /politician[iI]d\s*[:=]\s*["'`][a-z0-9-]{6,}["'`]/.test(txt)) offenders.push(path.basename(f));
  }
  check("keine hartkodierte Mandanten-/Pilot-ID in den Master-Modulen", offenders.length === 0);
}

// ============================ 23/24/25) Neue Partei / Ausschuss / Bundesland ohne Codeaenderung ============================
console.log("== Datengetriebene Erweiterbarkeit ==");
{
  // Neue Partei rein als DATEN: neue Entitaet + Quelle + Paketkriterium -> automatisch abgedeckt.
  const newParty = { id: "party-neuX", name: "Neue Partei X", entity_type: "party" };
  const newSource = M.sourceRecord.buildSourceRecord({
    url: "https://neue-partei-x.de", method: "html", source_type: "partei", party_id: "party-neuX",
    political_level: "bund", discovery_origin: "official_directory", discovered_at: "2026-07-21", review_status: "active"
  });
  const cov = coverage.buildCoverageMatrix({ records: [newSource], parties: [newParty], groups: [], committees: [], laender: [] });
  check("neue Partei ohne Codeaenderung im Coverage", cov.byParty.length === 1 && cov.byParty[0].id === "party-neuX" && cov.byParty[0].working === 1);
  const pkg = { key: "partei-neuX", criteria: { party_ids: ["party-neuX"] } };
  check("neue Partei ohne Codeaenderung zuweisbar", assignment.assignSourceToPackages(newSource, [pkg]).includes("partei-neuX"));
}
{
  // Neuer Ausschuss.
  const newCommittee = { id: "committee-bt-neuY", name: "Ausschuss Neu Y", entity_type: "committee" };
  const src = M.sourceRecord.buildSourceRecord({ url: "https://bundestag.de/ausschuss-neuy", method: "html", source_type: "ausschuss", committee_ids: ["committee-bt-neuY"], political_level: "bund", discovery_origin: "official_directory", discovered_at: "2026-07-21", review_status: "active" });
  const cov = coverage.buildCoverageMatrix({ records: [src], parties: [], groups: [], committees: [newCommittee], laender: [] });
  check("neuer Ausschuss ohne Codeaenderung im Coverage", cov.byCommittee.length === 1 && cov.byCommittee[0].working === 1);
}
{
  // Neues Bundesland.
  const newLand = { id: "geo-land-neuz", name: "Land Neu Z", level: "land" };
  const src = M.sourceRecord.buildSourceRecord({ url: "https://neuz.de", method: "html", source_type: "bundesland", region_ids: ["geo-land-neuz"], political_level: "land", discovery_origin: "official_directory", discovered_at: "2026-07-21", review_status: "active" });
  const cov = coverage.buildCoverageMatrix({ records: [src], parties: [], groups: [], committees: [], laender: [newLand] });
  check("neues Bundesland ohne Codeaenderung im Coverage", cov.byBundesland.length === 1 && cov.byBundesland[0].working === 1);
}

// ============================ Attributschema (Phase 4) ============================
console.log("== Attributschema ==");
check("20 Pflichtattribute definiert", model.SOURCE_ATTRIBUTES.length === 20);
check("alle Seed-Records tragen einen gueltigen Prüfstatus", CAT.records.every((r) => model.isIntakeState(r.review_status)));
check("jede Seed-Quelle hat Herkunft + Beleg oder amtliches Verzeichnis", CAT.records.every((r) => r.discovery_origin && r.discovered_at));

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
