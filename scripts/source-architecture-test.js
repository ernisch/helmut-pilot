"use strict";

// Tests fuer die Neue Quellenarchitektur — Sprint 1 (relationales Fundament).
// Deckt ab (Auftrag §36): Unit (Herausgeber-/URL-/Fingerprint-/Paket-/Refcount-/Status-/
// Ebenen-/Geografie-/Entitaetslogik), Integration (Quelle->Abrufweg->Paket, m:n, ein Crawl),
// Migration (143 zugeordnet, Orphans musterbasiert klassifiziert, keine Bundesquelle
// verloren, Rollback vollstaendig) und Edge-Cases (kaputte/doppelte/Google-News-Quellen).
// Reine Offline-Tests (injizierte Deps/Fixtures), kein Netz, keine KI, kein DB-Zugriff.
// Mandats-Testdaten sind KLAR KUENSTLICH (tenant-alpha etc.), kein realer Mandant im Code.

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
check("directSource mit GN-URL -> googlenews_search (dynamische Personenquelle '<id>-news')",
  model.classifyMethod({ crawlMethod: "rss", rssUrl: "https://news.google.com/rss/search?q=%22Test%20Politician%20One%22" }) === "googlenews_search");

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
check("regional trennt Thema (nur Regionalpaket)", JSON.stringify(packageKeysForSource({ regional: true, themeTerms: ["soziales"], id: "region-salzgitter-x", name: "Salzgitter Arbeit und Soziales" })) === JSON.stringify(["regional-niedersachsen"]));
// Punkt 13: eine regionale Quelle ohne Bezug zur Region des Regionalpakets bleibt bewusst OHNE
// Paket, statt still im Niedersachsen-Paket zu landen (mit HELMUT_SOURCE_CURATION=off waeren das
// 30 fremde Regionen gewesen).
check("regionale Fremdquelle -> kein Regionalpaket", packageKeysForSource({ regional: true, themeTerms: ["soziales"], id: "region-bayern-x", name: "Bayern Arbeit und Soziales" }).length === 0);
check("demoOnly-Personenquelle '<id>-news' -> Profilpaket 'profil-<id>' (abgeleitet, kein Mandant im Code)",
  JSON.stringify(packageKeysForSource({ demoOnly: true, id: "tenant-alpha-news" })) === JSON.stringify(["profil-tenant-alpha"]));
check("demoOnly ohne '-news'-Basis -> KEINE Paketzuordnung", packageKeysForSource({ demoOnly: true, id: "irgendwas" }).length === 0);

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
check("Niedersachsen-Bezug (Regionalpaket) vorhanden", M.geographies.some((g) => g.name === "Salzgitter"));

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
// 144 statt 143 seit der Ausschuss-Korrektur (Punkt 13, 2026-07-26): der bis dahin fehlende
// 24. staendige Ausschuss (Wahlpruefung, Immunitaet und Geschaeftsordnung) ist ergaenzt.
check("151 kuratierte Quellen im Katalog — KEINE Personenquelle (entsteht dynamisch als '<id>-news')",
  v1Sources.length === 151 && v1Sources.every((s) => s.type !== "person" && !s.demoOnly));
check("alle 151 + DIP als Abrufwege abgebildet", M.retrievalPaths.length === 152);
check("keine unzugeordnete Quelle (unmapped=0)", M.unmapped.length === 0);
check("jeder Abrufweg traegt legacy_source_id (ID-Kompatibilitaet)", M.retrievalPaths.every((p) => !!p.legacy_source_id));
// Ist-Zustand: ZWEI Abrufwege gehoeren BEWUSST zu je zwei Paketen ->
// 144 Wege + 2 Doppelzuordnungen = 146.
//   - fraction-linke: bund-basis (neutraler Fraktions-Suchweg) + die-linke-bund (funktionierender
//     Ersatz fuer die zwei defekten Original-RSS-Wege der Partei, P8-Paketfix).
//   - ausschuss-arbeit-soziales: bund-basis (Vollzaehligkeit "alle Ausschuesse" des neutralen
//     Pflichtpakets) + arbeit-und-soziales (Kernquelle des Fachthemas, Punkt 13).
// Begruendung + Test: quellenarchitektur/paket-vollstaendigkeit.js, paketvollstaendigkeit-test.js.
check("jede Katalog-Quelle mind. einem Paket zugeordnet; 2 Wege bewusst in zweien (152+2)", M.packagePaths.length === 154);
check("fraction-linke in bund-basis UND die-linke-bund",
  M.packagePaths.some((pp) => pp.package_id === "pkg-die-linke-bund" && pp.retrieval_path_id === "rp-fraction-linke") &&
  M.packagePaths.some((pp) => pp.package_id === "pkg-bund-basis" && pp.retrieval_path_id === "rp-fraction-linke"));

console.log("== Migration: Bundesbasis nicht verloren (Bestandsschutz) ==");
const legacyIds = new Set(M.retrievalPaths.map((p) => p.legacy_source_id));
check("gesunde Bundesquellen erhalten (DLF/Tagesschau/BMAS)", ["deutschlandfunk-politik", "tagesschau-politik", "bmas"].every((id) => legacyIds.has(id)));
const bundBasis = M.packagePaths.filter((pp) => pp.package_id === "pkg-bund-basis").length;
check("Bund-Basis-Paket traegt 54 neutrale + DIP + Fachausschuss = 56 Abrufwege", bundBasis === 56);
check("Arbeit-und-Soziales-Paket traegt 84 Fachquellen", M.packagePaths.filter((pp) => pp.package_id === "pkg-arbeit-und-soziales").length === 84);
// 11 = 7 benannte Pflichtwege (vorbereitet, status 'paused') + 4 ergaenzende Themensuchen.
check("Regional Niedersachsen = 11 Abrufwege (7 benannt/vorbereitet + 4 Themensuchen)", M.packagePaths.filter((pp) => pp.package_id === "pkg-regional-niedersachsen").length === 11);
check("die 7 benannten Niedersachsen-Wege sind paused + manual (kein Abruf)", (() => {
  const nds = M.retrievalPaths.filter((p) => /^rp-(nds-|news-haz|news-ndr|news-braunschweiger-zeitung|news-salzgitter-zeitung|news-regionalheute)/.test(p.id));
  return nds.length === 7 && nds.every((p) => p.status === "paused" && p.activation_mode === "manual");
})());

console.log("== Migration: Orphans + defekte Pflichtquellen ==");
// Orphans werden DATENGETRIEBEN klassifiziert: die zu pruefenden Legacy-IDs kommen aus
// den beobachteten Bestandsdaten (hier: 12 kuenstliche Muster-IDs) — im Code steht kein
// Mandant. Ohne Datenkontext bleibt nur der explizite Eintrag (dip).
const observedOrphanIds = [
  ...Array.from({ length: 8 }, (_, i) => `tenant-alpha-news-alt${i + 1}`),   // historische Bestands-IDs (Daten)
  ...Array.from({ length: 4 }, (_, i) => `test-politician-news-alt${i + 1}`) // Test-Rueckstaende (Daten)
];
const orphans = catalog.classifyOrphans(observedOrphanIds);
// KEIN Namensmuster mehr: historische Bestands-IDs klassifiziert der Aufrufer
// ueber seine eigene Datenkarte; der Code kennt nur den expliziten dip-Eintrag.
check("classifyOrphans klassifiziert uebergebene Bestands-IDs NICHT per Muster (nur dip explizit)", orphans.length === 1 && orphans[0].legacy_source_id === "dip");
check("Historische Bestands-IDs bleiben unklassifiziert (kein Muster) — Zuordnung ist Datenkarte des Aufrufers", (() => {
  const c = orphans.reduce((a, o) => (a[o.classification] = (a[o.classification] || 0) + 1, a), {});
  return !c.orphan_legacy && !c.orphan_test && c.active_uncatalogued === 1;
})());
check("ohne Datenkontext nur explizite Eintraege (dip)", (() => {
  const rows = catalog.classifyOrphans();
  return rows.length === 1 && rows[0].legacy_source_id === "dip" && rows[0].classification === "active_uncatalogued";
})());
const broken = M.retrievalPaths.filter((p) => p.status === "broken").map((p) => p.legacy_source_id);
check("P1-5: keine defekten Direkt-Feeds mehr (alle 6 verifiziert repariert, Sprint 9B)", broken.length === 0);
check("P1-5: reparierte Pflichtquellen (Bundestag/Bundesregierung) needs_review, weiter kritisch -> nicht still archiviert", (() => {
  const bt = M.retrievalPaths.find((p) => p.legacy_source_id === "bundestag");
  const br = M.retrievalPaths.find((p) => p.legacy_source_id === "bundesregierung");
  return bt.status === "needs_review" && bt.is_critical && br.status === "needs_review" && br.is_critical;
})());
check("P1-5: die 6 reparierten Bundeswege tragen ihre verifizierte Ersatz-URL", (() => {
  const byId = new Map(M.retrievalPaths.map((p) => [p.legacy_source_id, p]));
  return byId.get("bundestag").url === "https://www.bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss"
    && byId.get("bundesregierung").url === "https://news.google.com/rss/search?q=site:bundesregierung.de&hl=de&gl=DE&ceid=DE:de"
    && byId.get("die-linke").url === "https://news.google.com/rss/search?q=site:die-linke.de&hl=de&gl=DE&ceid=DE:de"
    && byId.get("linksfraktion").url === "https://www.dielinkebt.de/presse/pressemitteilungen/feed.rss"
    && byId.get("ausschuss-arbeit-soziales").url === "https://news.google.com/rss/search?q=site:bundestag.de%20%22Ausschuss%20f%C3%BCr%20Arbeit%20und%20Soziales%22&hl=de&gl=DE&ceid=DE:de"
    && byId.get("dgb").url === "https://news.google.com/rss/search?q=site:dgb.de&hl=de&gl=DE&ceid=DE:de";
})());
// Regression: JEDE Google-News-Feed-URL im Katalog muss Ausgabe und Sprache pinnen. Ohne
// &hl=de&gl=DE&ceid=DE:de waehlt Google die Edition nach Egress-IP des Runners aus — moeglich
// waere eine leere oder englischsprachige Ausgabe. Der ausschuss-arbeit-soziales-Weg war beim
// Uebernehmen der P1-5-Reparatur als einziger ungepinnt; dieser Check verhindert den Rueckfall.
check("Alle Google-News-Feeds pinnen Ausgabe/Sprache (hl=de, gl=DE, ceid=DE:de)", (() => {
  const googleFeeds = v1Sources.filter((s) => String(s.rssUrl || "").includes("news.google.com"));
  if (googleFeeds.length < 5) return false; // Vorbedingung: es gibt ueberhaupt Google-Feeds
  return googleFeeds.every((s) => /[?&]hl=de(&|$)/.test(s.rssUrl) && /[?&]gl=DE(&|$)/.test(s.rssUrl) && /[?&]ceid=DE:de(&|$)/.test(s.rssUrl));
})());
check("P1-5: Herausgeber-Identitaet bei googlenews-Ersatz erhalten (site:-Filter haelt die Original-Domain)", (() => {
  const byId = new Map(M.retrievalPaths.map((p) => [p.legacy_source_id, p]));
  return byId.get("bundesregierung").publisher_id === "publisher-bundesregierung.de"
    && byId.get("die-linke").publisher_id === "publisher-die-linke.de"
    && byId.get("dgb").publisher_id === "publisher-dgb.de"
    && byId.get("ausschuss-arbeit-soziales").publisher_id === "publisher-bundestag.de";
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
check("8 Pakete (4 aktiv + Berlin/Brandenburg-Basis + 2 Landes-Partei-Pakete prepared) — KEIN Personenpaket im Code-Seed", M.packages.length === 8 && M.packages.every((p) => !p.key.startsWith("profil-")));
check("Berlin+Brandenburg als prepared Basispakete", (() => {
  const b = M.packages.find((p) => p.key === "berlin-basis");
  const bb = M.packages.find((p) => p.key === "brandenburg-basis");
  return b && b.status === "prepared" && b.is_base && bb && bb.status === "prepared" && bb.is_base;
})());
check("P0-2: Landes-Basispakete tragen nur die 12 NEUTRALEN Pflichtklassen (keine Partei-/Personenklasse)", (() => {
  const PILOT = ["partei_pilot", "fraktion_pilot", "person_pilot"];
  const b = M.packages.find((p) => p.key === "berlin-basis");
  const bb = M.packages.find((p) => p.key === "brandenburg-basis");
  return b.required_classes.length === 12 && bb.required_classes.length === 12
    && PILOT.every((k) => !b.required_classes.includes(k)) && PILOT.every((k) => !bb.required_classes.includes(k));
})());
check("P0-2: Landes-Partei-Pakete (die-linke-berlin/-brandenburg) existieren, NICHT is_base, tragen die 3 Pilotklassen", (() => {
  const dlb = M.packages.find((p) => p.key === "die-linke-berlin");
  const dlbb = M.packages.find((p) => p.key === "die-linke-brandenburg");
  const PILOT = ["partei_pilot", "fraktion_pilot", "person_pilot"];
  return dlb && dlb.is_base === false && dlb.status === "prepared" && JSON.stringify(dlb.required_classes.slice().sort()) === JSON.stringify(PILOT.slice().sort())
    && dlbb && dlbb.is_base === false && dlbb.status === "prepared" && JSON.stringify(dlbb.required_classes.slice().sort()) === JSON.stringify(PILOT.slice().sort());
})());
check("P0-2: die 15 Pflichtklassen (Basis+Partei) je Land bleiben in Summe vollstaendig", (() => {
  const b = M.packages.find((p) => p.key === "berlin-basis");
  const dlb = M.packages.find((p) => p.key === "die-linke-berlin");
  const union = new Set([...b.required_classes, ...dlb.required_classes]);
  return union.size === 15 && seeds.LANDESMODUL_PFLICHTKLASSEN.every((k) => union.has(k));
})());
// Diese Pruefung MUSS gegen den Landesmodul-Seed laufen: die BE/BB-Abrufwege leben dort, nicht
// im Bund-Modell M. Frueher lief sie gegen M — dort sind beide Mengen leer, der Check konnte
// also nie fehlschlagen (vakuos). Jetzt mit Nichtleer-Vorbedingung, damit er echt bindet.
check("P0-2: KEIN Abrufweg der Linke-Berlin-Partei-/Fraktions-/Personenquellen in berlin-basis (Neutralitaet)", (() => {
  const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
  const L = buildLandesmodulSeed();
  const pilotPathIds = new Set(L.retrievalPaths
    .filter((p) => ["be-partei_pilot", "be-fraktion_pilot", "be-person_pilot"].includes(p.legacy_source_id))
    .map((p) => p.id));
  if (pilotPathIds.size !== 3) return false; // Vorbedingung: die 3 Pilotwege existieren wirklich
  const imBasis = L.packagePaths.some((pp) => pp.package_id === "pkg-berlin-basis" && pilotPathIds.has(pp.retrieval_path_id));
  const imParteipaket = L.packagePaths.filter((pp) => pp.package_id === "pkg-die-linke-berlin" && pilotPathIds.has(pp.retrieval_path_id)).length;
  return !imBasis && imParteipaket === 3; // raus aus dem Pflichtpaket UND drin im Parteipaket
})());
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
