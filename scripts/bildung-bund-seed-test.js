"use strict";

// Helmut — Offline-Test fuer das PREPARED-Quellenpaket 'bildung-bund'.
// Rein lesend/deterministisch: baut das In-Memory-Abbild und prueft es gegen die
// bestehenden Seed-SQL-Dateien (Basis + Landesmodule) auf Inaktivitaet, Wiederverwendung
// und Dublettenfreiheit. KEIN Netz, keine DB, kein LLM.

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { buildBildungBundSeed } = require("../lib/helmut/quellenarchitektur/seeds/bildung-bund-quellen");

const ROOT = path.join(__dirname, "..");
const SEEDS = path.join(ROOT, "supabase", "seeds");

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log(`  ok  ${name}`);
}

// --- Bestehende IDs/Domains aus den vorhandenen Seed-SQL-Dateien einsammeln ----
function readIfExists(p) { return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; }
const baseSeed = readIfExists(path.join(SEEDS, "20260713_source_architecture_seed.sql"));
const landSeed = readIfExists(path.join(SEEDS, "20260717_landesmodul_be_bb_seed.sql"));
const existingSql = `${baseSeed}\n${landSeed}`;
assert.ok(baseSeed.length > 1000, "Basis-Seed-SQL vorhanden (Voraussetzung des Tests)");

function idsFrom(sql, table) {
  // Grober, aber robuster Extraktor: nach 'insert into public.<table>' bis zum naechsten
  // 'insert into' alle fuehrenden ('id', ...) Tupel-Ids einsammeln.
  const start = sql.indexOf(`insert into public.${table} `);
  if (start < 0) return new Set();
  const rest = sql.slice(start);
  const end = rest.indexOf("insert into public.", 5);
  const block = end > 0 ? rest.slice(0, end) : rest;
  const ids = new Set();
  const re = /^\s*\('([^']+)'/gm;
  let m;
  while ((m = re.exec(block)) !== null) ids.add(m[1]);
  return ids;
}
function domainsFrom(sql) {
  // canonical_domain steht im publishers-Insert an 3. Position: ('id', 'name', 'domain', ...)
  const start = sql.indexOf("insert into public.publishers ");
  if (start < 0) return new Set();
  const rest = sql.slice(start);
  const end = rest.indexOf("insert into public.", 5);
  const block = end > 0 ? rest.slice(0, end) : rest;
  const doms = new Set();
  const re = /^\s*\('[^']+',\s*'(?:[^']|'')*',\s*'([^']+)'/gm;
  let m;
  while ((m = re.exec(block)) !== null) doms.add(m[1]);
  return doms;
}

const existingEntityIds = new Set([...idsFrom(baseSeed, "political_entities"), ...idsFrom(landSeed, "political_entities")]);
const existingPublisherIds = new Set([...idsFrom(baseSeed, "publishers"), ...idsFrom(landSeed, "publishers")]);
const existingPathIds = new Set([...idsFrom(baseSeed, "retrieval_paths"), ...idsFrom(landSeed, "retrieval_paths")]);
const existingPackageIds = idsFrom(baseSeed, "source_packages");
const existingDomains = new Set([...domainsFrom(baseSeed), ...domainsFrom(landSeed)]);

console.log("bildung-bund PREPARED-Seed — Test\n");
const seed = buildBildungBundSeed();

// --- 1) Paket: prepared, Fachpaket, korrekt verortet ---------------------------
check("Paket status = prepared (nicht active)", seed.package.status === "prepared");
check("Paket is_base = false (Fachthemenpaket, kein Pflicht-Basispaket)", seed.package.is_base === false);
check("Paket political_level = bund, geo = geo-bund", seed.package.political_level === "bund" && seed.package.geography_id === "geo-bund");
check("Paket-Key bildung-bund existiert NICHT im Basis-Seed", !existingPackageIds.has("pkg-bildung-bund"));

// --- 2) Inaktivitaets-Invariante: kein neuer Weg aktiv -------------------------
check("Alle neuen Wege: status = needs_review", seed.retrievalPaths.every((p) => p.status === "needs_review"));
check("Alle neuen Wege: activation_mode = manual", seed.retrievalPaths.every((p) => p.activation_mode === "manual"));
check("Alle neuen Wege: method = googlenews_search (kein erfundener Direktfeed)", seed.retrievalPaths.every((p) => p.method === "googlenews_search"));
check("0 aktive/auto/always_on Wege (summary.aktiveWege === 0)", seed.summary.aktiveWege === 0);
check("Alle neuen Weg-URLs zeigen auf news.google.com", seed.retrievalPaths.every((p) => /news\.google\.com/.test(p.url)));

// --- 3) Erwartete Mengen / Tiering --------------------------------------------
check("7 neue Entitaeten", seed.entities.length === 7);
check("7 neue Herausgeber", seed.publishers.length === 7);
check("11 neue Abrufwege", seed.retrievalPaths.length === 11);
check("12 Paketzuordnungen (11 neu + 1 wiederverwendet)", seed.packagePaths.length === 12);
check("Tier 1 = 6, Tier 2 = 4, Tier 3 = 2", seed.summary.tier1 === 6 && seed.summary.tier2 === 4 && seed.summary.tier3 === 2);
check("Gesamtzahl Wege im Paket = 12 (8-12-Zielkorridor eingehalten)", seed.summary.wegeGesamt === 12);

// --- 4) Wiederverwendung statt Neuanlage ---------------------------------------
check("rp-committee-bildung wird wiederverwendet (im Paket, NICHT neu definiert)",
  seed.packagePaths.some((pp) => pp.retrieval_path_id === "rp-committee-bildung") &&
  !seed.retrievalPaths.some((p) => p.id === "rp-committee-bildung"));
check("wiederverwendeter Weg rp-committee-bildung existiert real im Basis-Seed", existingPathIds.has("rp-committee-bildung"));
check("alle wiederverwendeten Herausgeber existieren real im Basis-Seed",
  seed.reusedPublisherIds.every((id) => existingPublisherIds.has(id)));
check("alle wiederverwendeten Entitaeten existieren real im Basis-Seed",
  seed.reusedEntityIds.every((id) => existingEntityIds.has(id)));
check("Destatis/BA/Bundesrat/OECD werden als Herausgeber wiederverwendet (nicht neu angelegt)",
  ["publisher-destatis.de", "publisher-arbeitsagentur.de", "publisher-bundesrat.de", "publisher-oecd.org"]
    .every((id) => seed.reusedPublisherIds.includes(id) && !seed.publishers.some((p) => p.id === id)));

// --- 5) Keine ID-/Domain-Dubletten gegen den Bestand ---------------------------
check("keine neue Entitaets-ID kollidiert mit Bestand",
  seed.entities.every((e) => !existingEntityIds.has(e.id)));
check("keine neue Herausgeber-ID kollidiert mit Bestand",
  seed.publishers.every((p) => !existingPublisherIds.has(p.id)));
check("keine neue Abrufweg-ID kollidiert mit Bestand",
  seed.retrievalPaths.every((p) => !existingPathIds.has(p.id)));
check("keine neue Herausgeber-Domain kollidiert mit Bestand (uq_publishers_domain)",
  seed.publishers.every((p) => !existingDomains.has(p.canonical_domain)));

// --- 6) Semantische Dubletten bewusst vermieden --------------------------------
check("BMBFSFJ ist eigene Entitaet, NICHT identisch mit historischem ministry-bmfsfj",
  seed.entities.some((e) => e.id === "ministry-bmbfsfj") &&
  !seed.entities.some((e) => e.id === "ministry-bmfsfj") &&
  existingEntityIds.has("ministry-bmfsfj"));
check("BMBFSFJ-Domain (bmbfsfj.bund.de) != historische Familienministeriums-Domain (bmfsfj.de)",
  seed.publishers.some((p) => p.canonical_domain === "bmbfsfj.bund.de") && !existingDomains.has("bmbfsfj.bund.de"));
check("KMK/Bildungs-MK, SWK und IQB sind drei getrennte Entitaeten (keine Dublette)",
  ["institution-kmk", "institution-swk", "institution-iqb"].every((id) => seed.entities.some((e) => e.id === id)));
check("DIPF ist EINE Entitaet hinter Bildungsbericht (kein doppelter DIPF)",
  seed.publishers.filter((p) => p.entity_id === "institution-dipf").length >= 1 &&
  seed.entities.filter((e) => e.id === "institution-dipf").length === 1);
check("KMK ist als other_institution (Laenderkoordination), NICHT als Bundesbehoerde modelliert",
  seed.entities.find((e) => e.id === "institution-kmk").entity_type === "other_institution");
check("BMFTR/GWK NICHT als Herausgeber/Entitaet aufgenommen (Abgrenzung zu wissenschaft-forschung-bund)",
  !seed.publishers.some((p) => /bmftr|gwk/i.test(p.id)) && !seed.entities.some((e) => /bmftr|gwk/i.test(e.id)));

// --- 7) Referentielle Integritaet des In-Memory-Modells ------------------------
const knownPublisherIds = new Set([...seed.publishers.map((p) => p.id), ...seed.reusedPublisherIds]);
check("jeder neue Weg referenziert einen bekannten (neuen oder wiederverwendeten) Herausgeber",
  seed.retrievalPaths.every((p) => knownPublisherIds.has(p.publisher_id)));
const knownPathIds = new Set([...seed.retrievalPaths.map((p) => p.id), ...seed.reusedPathIds]);
check("jede Paketzuordnung referenziert einen bekannten Weg",
  seed.packagePaths.every((pp) => knownPathIds.has(pp.retrieval_path_id)));
check("path_expected_levels referenzieren NUR neue Wege (wiederverwendeter Weg bleibt unangetastet)",
  seed.pathExpectedLevels.every((l) => seed.retrievalPaths.some((p) => p.id === l.retrieval_path_id)));
check("jeder neue Weg hat >= 1 erwartete Geografie (geo-bund)",
  seed.retrievalPaths.every((p) => seed.pathExpectedGeographies.some((g) => g.retrieval_path_id === p.id && g.geography_id === "geo-bund")));

// --- 8) Fachliche Mindestabdeckung (Abdeckungsmatrix) --------------------------
const topicSet = new Set(seed.pathExpectedTopics.map((t) => t.topic));
const mindestabdeckung = [
  "bundesgesetzgebung", "bund_laender_koordination", "berufliche_bildung", "ausbildungsmarkt",
  "bafoeg", "bildungsfoerderung", "fruehkindliche_bildung", "ganztag", "bildungsgerechtigkeit",
  "bildungsmonitoring", "bildungsstandards", "schulqualitaet", "hochschulzugang",
  "internationale_vergleiche", "weiterbildung", "anerkennung"
];
for (const t of mindestabdeckung) check(`Abdeckung vorhanden: ${t}`, topicSet.has(t));

// --- 9) Kritische Pflicht-Primaerquellen korrekt markiert ----------------------
check("BMBFSFJ, KMK, BIBB als is_critical markiert (Pflicht-Primaerquellen)",
  ["rp-bildung-bmbfsfj", "rp-bildung-kmk", "rp-bildung-bibb"]
    .every((id) => seed.retrievalPaths.find((p) => p.id === id).is_critical === true));

console.log(`\n${passed} Checks gruen — bildung-bund ist vollstaendig vorbereitet und INAKTIV.`);
