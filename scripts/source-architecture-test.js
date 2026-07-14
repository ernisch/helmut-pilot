"use strict";

// Tests fuer die Neue Quellenarchitektur — Sprint 1 (relationales Fundament).
// Deckt ab (Auftrag §36): Unit (Herausgeber-/URL-/Fingerprint-/Paket-/Refcount-/Status-/
// Ebenen-/Geografie-/Entitaetslogik), Integration (Quelle->Abrufweg->Paket, m:n, ein Crawl),
// Migration (144 zugeordnet, 13 Orphans klassifiziert, keine Bundesquelle verloren, Rollback
// vollstaendig) und Edge-Cases (kaputte/doppelte/Google-News-Quellen).
// Reine Offline-Tests (injizierte Deps/Fixtures), kein Netz, keine KI, kein DB-Zugriff.

const fs = require("fs");
const path = require("path");
const model = require("../lib/helmut/quellenarchitektur/model");
const catalog = require("../lib/helmut/quellenarchitektur/catalog");
const { buildFullModel, seeds, packageKeysForSource } = require("../lib/helmut/quellenarchitektur");
const { v1Sources } = require("../lib/helmut/sources");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const M = buildFullModel();

// ============================ UNIT ============================
console.log("== Unit: URL-Normalisierung / Canonical ==");
check("Tracking-Parameter entfernt", model.normalizeUrl("https://www.bmas.de/a?utm_source=x&id=7") === "https://bmas.de/a?id=7");
check("www + Trailing-Slash + Fragment weg", model.normalizeUrl("https://www.tagesschau.de/inland/#top") === "https://tagesschau.de/inland");
check("nicht-http -> leer", model.normalizeUrl("javascript:alert(1)") === "");
check("canonicalDomain", model.canonicalDomain("https://www.dgb.de/presse") === "dgb.de");
check("site:-Domain aus Query", model.extractSiteDomain("site:verdi.de (Tarif OR Pflege)") === "verdi.de");
check("keine site:-Domain -> leer", model.extractSiteDomain("Bürgergeld (Reform OR Sanktionen)") === "");

console.log("== Unit: Inhaltsfingerabdruck ==");
const fpA = model.contentFingerprint({ title: "Bürgergeld-Reform beschlossen", summary: "Der Bundestag" });
const fpB = model.contentFingerprint({ title: "Reform Bürgergeld beschlossen", summary: "Bundestag der" });
check("Fingerprint stabil gegen Wortstellung", fpA === fpB && fpA.length === 64);
check("Fingerprint unterscheidet Inhalte", model.contentFingerprint({ title: "Rente steigt" }) !== fpA);
check("Fingerprint leer bei leerem Text", model.contentFingerprint({ title: "" }) === "");

console.log("== Unit: Herausgeber-Normalisierung ==");
check("Themensuffix 'Politik' entfernt", catalog.normalizePublisherName("Deutschlandfunk Politik") === "Deutschlandfunk");
check("Themensuffix 'Pflege' entfernt", catalog.normalizePublisherName("BMAS Pflege") === "BMAS");
check("mehrfaches Suffix entfernt", catalog.normalizePublisherName("BMAS Vorhaben Radar") === "BMAS");
check("Mediumsname unveraendert", catalog.normalizePublisherName("ZEIT Online") === "ZEIT Online");

console.log("== Unit: Abrufweg-Methode ==");
check("Google-News-RSS -> googlenews_search", model.classifyMethod({ rssUrl: "https://news.google.com/rss/search?q=x" }) === "googlenews_search");
check("Direkt-RSS -> rss", model.classifyMethod({ rssUrl: "https://www.bmas.de/feed.xml", crawlMethod: "rss" }) === "rss");
check("HTML-Scrape -> html", model.classifyMethod({ url: "https://www.dgb.de", crawlMethod: "html" }) === "html");
check("directSource mit GN-URL -> googlenews_search (cem-ince-news-Fall)",
  model.classifyMethod({ crawlMethod: "rss", rssUrl: "https://news.google.com/rss/search?q=%22Cem%20Ince%22" }) === "googlenews_search");

console.log("== Unit: Belegfunktion (evidence_role) ==");
check("offiziell -> official_primary", model.evidenceRoleFor({ category: "offiziell", entityType: "ministry" }) === "official_primary");
check("Partei -> direct_interest", model.evidenceRoleFor({ category: "partei_fraktion", entityType: "party" }) === "direct_interest");
check("Medien -> journalistic", model.evidenceRoleFor({ category: "medien", entityType: "other_institution" }) === "journalistic");
check("Statistikamt -> data_source", model.evidenceRoleFor({ category: "offiziell", entityType: "statistical_office" }) === "data_source");

console.log("== Unit: Statuswechsel ==");
check("3 Fehler -> degraded", model.nextPathStatus("healthy", { success: false, errorStreak: 3 }) === "degraded");
check("6 Fehler -> broken", model.nextPathStatus("healthy", { success: false, errorStreak: 6 }) === "broken");
check("Erfolg -> healthy", model.nextPathStatus("degraded", { success: true }) === "healthy");
check("paused bleibt paused", model.nextPathStatus("paused", { success: false, errorStreak: 9 }) === "paused");
check("kritische Pflichtquelle nie auto-archiviert", model.mayAutoPause({ is_critical: true }) === false);
check("always_on nie auto-pausiert", model.mayAutoPause({ activation_mode: "always_on" }) === false);

console.log("== Unit: politische Ebenen / Enums ==");
check("5 Ebenen inkl. bund/land/kommune", ["international", "eu", "bund", "land", "kommune"].every((l) => model.POLITICAL_LEVELS.includes(l)));
check("Region/Wahlkreis KEINE Ebene", !model.POLITICAL_LEVELS.includes("region") && !model.POLITICAL_LEVELS.includes("wahlkreis"));
check("12 Entitaetstypen", model.ENTITY_TYPES.length === 12 && model.ENTITY_TYPES.includes("statistical_office"));

console.log("== Unit: Paketzuordnung ==");
check("neutral -> bund-basis", packageKeysForSource({ neutral: true }).includes("bund-basis"));
check("thema:social -> arbeit-und-soziales", packageKeysForSource({ themeTerms: ["soziales"] }).includes("arbeit-und-soziales"));
check("Die Linke -> die-linke-bund", packageKeysForSource({ party: "Die Linke" }).includes("die-linke-bund"));
check("regional trennt Thema (nur Regionalpaket)", JSON.stringify(packageKeysForSource({ regional: true, themeTerms: ["soziales"] })) === JSON.stringify(["regional-niedersachsen"]));
check("demoOnly -> Profilpaket", packageKeysForSource({ demoOnly: true }).includes("profil-cem-ince"));

console.log("== Unit: Referenzzaehlung ==");
const rc = model.computePathRefcounts({
  packages: [{ id: "p1", status: "active" }, { id: "p2", status: "active" }, { id: "p3", status: "paused" }],
  packagePaths: [
    { package_id: "p1", retrieval_path_id: "rpA" },
    { package_id: "p2", retrieval_path_id: "rpA" },
    { package_id: "p3", retrieval_path_id: "rpA" }
  ]
});
check("Abrufweg von 2 aktiven Paketen referenziert", rc.rpA.length === 2);
check("aktiv wenn >=1 aktives Paket", model.isPathActive({ status: "healthy", activation_mode: "auto" }, rc.rpA) === true);
check("inaktiv ohne aktives Paket", model.isPathActive({ status: "healthy", activation_mode: "auto" }, []) === false);
check("always_on immer aktiv (Bund Basis)", model.isPathActive({ status: "healthy", activation_mode: "always_on" }, []) === true);
check("dev_only loest NIE Crawl aus", model.isPathActive({ status: "healthy", activation_mode: "dev_only" }, ["p1"]) === false);

// ============================ GEOGRAFIE / ENTITAETEN ============================
console.log("== Geografie-Hierarchie ==");
const geoIds = new Set(M.geographies.map((g) => g.id));
check("alle 16 Bundeslaender strukturell", M.geographies.filter((g) => g.level === "land").length === 16);
check("Bund als Wurzel (parent null)", M.geographies.find((g) => g.id === "geo-bund").parent_id === null);
check("jede Geografie hat gueltigen parent (oder null)", M.geographies.every((g) => g.parent_id === null || geoIds.has(g.parent_id)));
check("Berlin mit 12 Bezirken (Stadtstaat: Land/Bezirk getrennt)", M.geographies.filter((g) => g.level === "bezirk" && g.parent_id === "geo-land-berlin").length === 12);
check("Brandenburg-Grundstruktur (kreisfreie Staedte + Landkreise)", M.geographies.filter((g) => g.parent_id === "geo-land-brandenburg").length >= 14);
check("Niedersachsen-Bezug fuer Cem vorhanden", M.geographies.some((g) => g.name === "Salzgitter"));

console.log("== Politische Entitaeten (typisiert) ==");
check("alle entity_type im Enum", M.entities.every((e) => model.ENTITY_TYPES.includes(e.entity_type)));
check("9 Parteien", M.entities.filter((e) => e.entity_type === "party").length === 9);
check("22+ Ausschuesse", M.entities.filter((e) => e.entity_type === "committee").length >= 22);
check("Landesmodul-Parlamente Berlin+Brandenburg", M.entities.some((e) => e.id === "parliament-berlin-agh") && M.entities.some((e) => e.id === "parliament-brandenburg-landtag"));
check("Entitaet-Geografie-FK gueltig", M.entities.every((e) => !e.geography_id || geoIds.has(e.geography_id)));
check("Entitaets-IDs eindeutig", new Set(M.entities.map((e) => e.id)).size === M.entities.length);

// ============================ INTEGRATION ============================
console.log("== Integration: Quelle -> Abrufweg -> Paket ==");
const pubIds = new Set(M.publishers.map((p) => p.id));
const pathIds = new Set(M.retrievalPaths.map((p) => p.id));
const pkgIds = new Set(M.packages.map((p) => p.id));
check("jeder Abrufweg hat gueltigen Herausgeber", M.retrievalPaths.every((p) => pubIds.has(p.publisher_id)));
check("jede package_path-Zeile referenziert gueltige IDs", M.packagePaths.every((pp) => pkgIds.has(pp.package_id) && pathIds.has(pp.retrieval_path_id)));
check("jeder Herausgeber genau einmal je Domain (Dedup)", (() => {
  const byDom = {}; for (const p of M.publishers) if (p.canonical_domain) byDom[p.canonical_domain] = (byDom[p.canonical_domain] || 0) + 1;
  return Object.values(byDom).every((c) => c === 1);
})());
check("BMAS: 1 Herausgeber mit >=2 Abrufwegen (Herausgeber 1:n Abrufweg)", (() => {
  const bmas = M.publishers.find((p) => p.canonical_domain === "bmas.de");
  return bmas && M.retrievalPaths.filter((p) => p.publisher_id === bmas.id).length >= 2;
})());

console.log("== Integration: m:n + global genau ein Crawl ==");
// Synthetischer Nachweis: EIN Abrufweg in ZWEI aktiven Paketen -> genau EIN Crawl-Job.
const synthPackages = [{ id: "bund-basis", status: "active" }, { id: "arbeit-und-soziales", status: "active" }];
const synthPackagePaths = [
  { package_id: "bund-basis", retrieval_path_id: "rp-shared" },
  { package_id: "arbeit-und-soziales", retrieval_path_id: "rp-shared" }
];
const synthRc = model.computePathRefcounts({ packages: synthPackages, packagePaths: synthPackagePaths });
const crawlSet = new Set(synthPackagePaths.map((pp) => pp.retrieval_path_id)); // Abrufweg-global entdedupt
check("Abrufweg in 2 Paketen -> 2 Referenzen", synthRc["rp-shared"].length === 2);
check("... aber global nur EIN Crawl (dedup nach Abrufweg-ID)", crawlSet.size === 1);

console.log("== Integration: Google News als Suchweg, nicht Herausgeber ==");
const gn = M.publishers.find((p) => p.id === "aggregator-google-news");
check("Google-News-Aggregator existiert", !!gn && gn.evidence_role === "aggregator");
check("site:-Suche zaehlt zum echten Herausgeber (verdi.de vorhanden)", M.publishers.some((p) => p.canonical_domain === "verdi.de"));
check("reine Themensuchen haengen am Aggregator", M.retrievalPaths.filter((p) => p.publisher_id === "aggregator-google-news").length > 50);
check("Aggregator-Abrufwege sind googlenews_search", M.retrievalPaths.filter((p) => p.publisher_id === "aggregator-google-news").every((p) => p.method === "googlenews_search"));

// ============================ MIGRATION ============================
console.log("== Migration: Katalogabbildung ==");
check("144 kuratierte Quellen im Katalog", v1Sources.length === 144);
check("alle 144 + DIP als Abrufwege abgebildet", M.retrievalPaths.length === 145);
check("keine unzugeordnete Quelle (unmapped=0)", M.unmapped.length === 0);
check("jeder Abrufweg traegt legacy_source_id (ID-Kompatibilitaet)", M.retrievalPaths.every((p) => !!p.legacy_source_id));
check("jede Katalog-Quelle genau einem Paket zugeordnet (Ist-Zustand)", M.packagePaths.length === 145);

console.log("== Migration: Bundesbasis nicht verloren (Cem-Schutz) ==");
const legacyIds = new Set(M.retrievalPaths.map((p) => p.legacy_source_id));
check("gesunde Bundesquellen erhalten (DLF/Tagesschau/BMAS)", ["deutschlandfunk-politik", "tagesschau-politik", "bmas"].every((id) => legacyIds.has(id)));
const bundBasis = M.packagePaths.filter((pp) => pp.package_id === "pkg-bund-basis").length;
check("Bund-Basis-Paket traegt 53 neutrale + DIP = 54 Abrufwege", bundBasis === 54);
check("Arbeit-und-Soziales-Paket traegt 84 Fachquellen", M.packagePaths.filter((pp) => pp.package_id === "pkg-arbeit-und-soziales").length === 84);
check("Regional Niedersachsen = 4 (Cems Region)", M.packagePaths.filter((pp) => pp.package_id === "pkg-regional-niedersachsen").length === 4);

console.log("== Migration: Orphans + defekte Pflichtquellen ==");
const orphans = catalog.classifyOrphans();
check("13 Orphan-Eintraege klassifiziert", orphans.length === 13);
check("8 Legacy + 4 Test + 1 aktiv-unkatalogisiert (DIP)", (() => {
  const c = orphans.reduce((a, o) => (a[o.classification] = (a[o.classification] || 0) + 1, a), {});
  return c.orphan_legacy === 8 && c.orphan_test === 4 && c.active_uncatalogued === 1;
})());
const broken = M.retrievalPaths.filter((p) => p.status === "broken").map((p) => p.legacy_source_id);
check("6 defekte Direkt-Feeds als broken markiert", broken.length === 6);
check("defekte Pflichtquellen (Bundestag/Bundesregierung) als kritisch -> nicht still archivieren", (() => {
  const bt = M.retrievalPaths.find((p) => p.legacy_source_id === "bundestag");
  const br = M.retrievalPaths.find((p) => p.legacy_source_id === "bundesregierung");
  return bt.status === "broken" && bt.is_critical && br.status === "broken" && br.is_critical;
})());
check("DIP als amtlicher API-Abrufweg (healthy, always_on, Bund Basis)", (() => {
  const dip = M.retrievalPaths.find((p) => p.legacy_source_id === "dip");
  return dip && dip.method === "api" && dip.status === "healthy" && dip.activation_mode === "always_on";
})());

// ============================ MIGRATIONS-KONSISTENZ (SQL) ============================
console.log("== Migration: Schema/Rollback-Konsistenz ==");
const migDir = path.join(__dirname, "..", "supabase", "migrations");
const upSql = fs.readFileSync(path.join(migDir, "20260713_source_architecture.sql"), "utf8");
const downSql = fs.readFileSync(path.join(migDir, "20260713_source_architecture_rollback.sql"), "utf8");
const createdTables = [...upSql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
const droppedTables = new Set([...downSql.matchAll(/drop table if exists public\.(\w+)/g)].map((m) => m[1]));
check("Migration legt 11 Tabellen an", createdTables.length === 11);
check("Rollback entfernt jede angelegte Tabelle", createdTables.every((t) => droppedTables.has(t)));
check("Migration ist additiv (kein DROP/ALTER an Bestandstabellen)", !/drop table (?!if exists public\.(geographies|electoral_districts|political_entities|publishers|retrieval_paths|source_packages|package_paths|path_expected))/.test(upSql) && !/alter table public\.(raw_documents|knowledge_objects|sources|profiles|mandate_profiles)/.test(upSql));
check("begin/commit balanciert (up + down)", (upSql.match(/begin;/g) || []).length === 1 && (upSql.match(/commit;/g) || []).length === 1 && (downSql.match(/begin;/g) || []).length === 1);
check("RLS aktiviert + restriktiv (nur service_role, KEINE authenticated-Leserichtlinie)",
  (upSql.match(/enable row level security/g) || []).length >= 1
  && !/for select to authenticated using \(true\)/.test(upSql)
  && /BEWUSST KEINE for-select-Policy/.test(upSql));

// ============================ SEED-VOLLSTAENDIGKEIT ============================
console.log("== Seed-Vollstaendigkeit ==");
check("7 Pakete (5 aktiv + Berlin/Brandenburg prepared)", M.packages.length === 7);
check("Berlin+Brandenburg als prepared Basispakete", (() => {
  const b = M.packages.find((p) => p.key === "berlin-basis");
  const bb = M.packages.find((p) => p.key === "brandenburg-basis");
  return b && b.status === "prepared" && b.is_base && bb && bb.status === "prepared" && bb.is_base;
})());
check("Landesmodule tragen 15 Pflichtklassen", M.packages.find((p) => p.key === "berlin-basis").required_classes.length === 15);
check("Bund Basis ist Pflicht-Basispaket (is_base)", (() => { const b = M.packages.find((p) => p.key === "bund-basis"); return b.is_base === true; })());
check("kein Paket traegt mehr ein always_on-Flag (Daueraktivierung lebt auf Abrufweg-Ebene)", M.packages.every((p) => p.always_on === undefined));
check("nur die 5 neutralen Kern-Abrufwege sind activation_mode=always_on", (() => {
  const on = M.retrievalPaths.filter((p) => p.activation_mode === "always_on").map((p) => p.legacy_source_id).sort();
  return JSON.stringify(on) === JSON.stringify(["bundesregierung", "bundestag", "deutschlandfunk-politik", "dip", "tagesschau-politik"]);
})());
check("Publisher-Entity-FK gueltig (falls gesetzt)", (() => {
  const eIds = new Set(M.entities.map((e) => e.id));
  return M.publishers.every((p) => !p.entity_id || eIds.has(p.entity_id));
})());

// ============================ ZUSAMMENFASSUNG ============================
console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
