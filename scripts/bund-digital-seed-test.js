"use strict";

// Offline-Test für den PREPARED-Seed des Pakets "digitales-daten-staatsmodernisierung-bund".
// Prüft die SICHERHEITSINVARIANTEN des erzeugten SQL + der Seed-Struktur: Paket prepared,
// alle neuen Wege needs_review/manual (technisch INAKTIV), idempotent, method-/CHECK-konform,
// keine ID-/Domain-Kollision mit dem Basis-Seed, Wiederverwendung statt Duplikat, GUARDED Rollback.
//
// Rein deterministisch: liest Module + gebaute SQL-Strings, KEIN Netz, KEIN DB-/Storage-Zugriff.

const fs = require("fs");
const path = require("path");
const { build, buildRollback } = require("./generate-bund-digital-seed");
const { buildBundDigitalSeed } = require("../lib/helmut/quellenarchitektur/seeds/bund-digital-quellen");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

const { sql, seed } = build();
const rollback = buildRollback(seed);

// Basis-Seed einlesen (für Kollisions-/Dubletten-Checks).
const baseSeed = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "seeds", "20260713_source_architecture_seed.sql"), "utf8");

// --- 1. Zeilenzahlen ---
check("1 Paket", !!seed.package && seed.package.id === "pkg-digitales-daten-staatsmodernisierung-bund");
check("4 neue Entitäten", seed.entities.length === 4);
check("4 neue Herausgeber", seed.publishers.length === 4);
check("5 neue Abrufwege", seed.retrievalPaths.length === 5);
check("2 wiederverwendete Bestandswege", seed.reusedPathIds.length === 2);
check("7 Paketzuordnungen (5 neu + 2 wiederverwendet)", seed.packagePaths.length === 7);
check("5 expected_levels + 5 expected_geographies", seed.pathExpectedLevels.length === 5 && seed.pathExpectedGeographies.length === 5);
check("expected_topics vorhanden (>=1 je neuem Weg)", seed.pathExpectedTopics.length >= 5);

// --- 2. Paket + Wege technisch INAKTIV (hart im SQL) ---
check("Paket status='prepared' (kein 'active')", /'prepared'/.test(sql) && !/source_packages[\s\S]*'active'/.test(sql.split("retrieval_paths")[0]));
check("Paketobjekt status=prepared", seed.package.status === "prepared");
check("Paket is_base=false", seed.package.is_base === false);
check("KEIN 'auto'/'always_on'/'healthy' im SQL", !/'auto'|'always_on'|'healthy'/.test(sql));
const nManual = (sql.match(/'needs_review', 'manual'/g) || []).length;
check("alle 5 neuen Abrufwege needs_review + manual", nManual === 5);
check("Seed-Selbstprüfung: 0 aktive neue Wege", seed.summary.aktiveNeueWege === 0);
check("alle neuen Wege verify_before_activation=true", seed.summary.alleVerifyBeforeActivation === true);

// --- 3. method-/CHECK-konform ---
const erlaubteMethoden = new Set(["rss", "api", "html", "googlenews_search", "structured_download"]);
check("alle method-Werte DB-CHECK-konform", seed.retrievalPaths.every((p) => erlaubteMethoden.has(p.method)));
const erlaubteEvidence = new Set(["official_primary", "direct_interest", "journalistic", "data_source", "aggregator"]);
check("alle evidence_role DB-CHECK-konform", seed.publishers.every((p) => erlaubteEvidence.has(p.evidence_role)));
const erlaubteEntity = new Set(["person", "party", "parliamentary_group", "committee", "ministry", "parliament",
  "government", "association", "union", "authority", "statistical_office", "other_institution"]);
check("alle entity_type DB-CHECK-konform", seed.entities.every((e) => erlaubteEntity.has(e.entity_type)));
check("Paket political_level DB-CHECK-konform", ["international", "eu", "bund", "land", "kommune"].includes(seed.package.political_level));

// --- 4. Idempotent + transaktional ---
check("ON CONFLICT DO NOTHING auf allen 8 Insert-Blöcken", (sql.match(/on conflict \([^)]*\) do nothing/g) || []).length === 8);
check("begin + commit + notify pgrst", /begin;/.test(sql) && /commit;/.test(sql) && /notify pgrst/.test(sql));

// --- 5. Keine ID-Kollision mit Basis-Seed (neue Objekte müssen wirklich neu sein) ---
const neueIds = [
  ...seed.entities.map((e) => e.id),
  ...seed.publishers.map((p) => p.id),
  ...seed.retrievalPaths.map((p) => p.id),
  seed.package.id
];
const kollisionen = neueIds.filter((id) => baseSeed.includes(`'${id}'`));
check("keine ID-Kollision mit Basis-Seed", kollisionen.length === 0);

// --- 6. Keine Domain-Dublette (neue Herausgeber-Domains dürfen nicht im Basis-Seed stehen) ---
const domainDubletten = seed.publishers
  .map((p) => p.canonical_domain)
  .filter((d) => new RegExp(`'${d.replace(/\./g, "\\.")}'`).test(baseSeed));
check("keine Domain-Dublette (BMDS/ITPLR/NKR/BfDI-Domains neu)", domainDubletten.length === 0);

// --- 7. Wiederverwendung statt Duplikat (Reuse-IDs MÜSSEN im Basis-Seed existieren) ---
check("rp-dip wird wiederverwendet (existiert im Basis-Seed)", seed.reusedPathIds.includes("rp-dip") && baseSeed.includes("'rp-dip'"));
check("rp-committee-digitales wird wiederverwendet (existiert im Basis-Seed)", seed.reusedPathIds.includes("rp-committee-digitales") && baseSeed.includes("'rp-committee-digitales'"));
check("Bundesrechnungshof-Herausgeber wiederverwendet (kein neuer BRH-Publisher)", !seed.publishers.some((p) => /bundesrechnungshof/.test(p.id)) && baseSeed.includes("'publisher-bundesrechnungshof.de'"));
check("neuer BRH-Digitalweg nutzt Bestands-Herausgeber", seed.retrievalPaths.some((p) => p.id === "rp-bundesrechnungshof-digital" && p.publisher_id === "publisher-bundesrechnungshof.de"));

// --- 8. Keine BMDS/BMI-Dublette, kein separater Bundes-CIO ---
check("BMI wird NICHT als Digital-Herausgeber dupliziert", !seed.publishers.some((p) => /bmi|inneres/i.test(p.id)) && !seed.entities.some((e) => /bmi|inneres/i.test(e.id)));
// Der historische Bundes-CIO / "Beauftragte der Bundesregierung für Informationstechnik" darf
// NICHT als eigene Entität/Herausgeber/ID/Key auftauchen — die Funktion ist mit BMDS aufgelöst.
const cioMuster = /\bcio\b|informationstechnik|it-beauftragt/i;
check("kein separater Bundes-CIO / IT-Beauftragter modelliert",
  !seed.entities.some((e) => cioMuster.test(`${e.id} ${e.canonical_key} ${e.name}`)) &&
  !seed.publishers.some((p) => cioMuster.test(`${p.id} ${p.name}`)));
check("keine Personenabhängigkeit in IDs/Keys", !seed.entities.some((e) => /richter|wildberger|specht/i.test(`${e.id} ${e.canonical_key}`)) && !seed.publishers.some((p) => /richter|wildberger|specht/i.test(p.id)));

// --- 9. FITKO nicht als eigener Dauerweg (Doppelerfassung mit IT-Planungsrat vermeiden) ---
check("FITKO NICHT als eigener Herausgeber/Weg (Jahresbericht via IT-PLR)", !seed.publishers.some((p) => /fitko/i.test(p.id)) && !seed.retrievalPaths.some((p) => /fitko/i.test(p.id)));

// --- 10. Keine Produktnamen als Institution (Deutschland-Stack/BundID/NOOTS/OZG/GovData/Bundesportal) ---
const produktMuster = /deutschland-stack|deutschland-architektur|bundid|deutschlandid|eudi|noots|verwaltungscloud|\bozg\b|digitalcheck|govdata|bundesportal/i;
check("keine Produkt-/Programm-Namen als Herausgeber/Entität", !seed.publishers.some((p) => produktMuster.test(p.id)) && !seed.entities.some((e) => produktMuster.test(e.id)));

// --- 11. GUARDED Rollback, dependency-korrekt ---
check("Rollback entfernt Paketverknüpfungen per package_id (schützt Reuse-Wege)", /delete from public\.package_paths where package_id = 'pkg-digitales-daten-staatsmodernisierung-bund'/.test(rollback));
check("Rollback löscht NUR die 5 neuen Wege (nicht rp-dip/rp-committee-digitales)", !/delete from public\.retrieval_paths[^;]*rp-dip/.test(rollback) && !/delete from public\.retrieval_paths[^;]*rp-committee-digitales/.test(rollback));
check("Rollback: Herausgeber GUARDED (not exists retrieval_paths)", /delete from public\.publishers p[\s\S]*not exists[\s\S]*retrieval_paths rp where rp\.publisher_id = p\.id/.test(rollback));
check("Rollback: Entitäten GUARDED (not exists publishers)", /delete from public\.political_entities e[\s\S]*not exists[\s\S]*publishers pu where pu\.entity_id = e\.id/.test(rollback));
const ord = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Kinder vor Eltern",
  ord(/path_expected_topics/) < ord(/delete from public\.package_paths/) &&
  ord(/delete from public\.package_paths/) < ord(/delete from public\.retrieval_paths/) &&
  ord(/delete from public\.retrieval_paths/) < ord(/delete from public\.source_packages/) &&
  ord(/delete from public\.source_packages/) < ord(/delete from public\.publishers/) &&
  ord(/delete from public\.publishers/) < ord(/delete from public\.political_entities/));

// --- 12. Tier-Verteilung (kompakte Architektur, ~7 Kernwege) ---
check("Tier 1 = 4 Wege (BMDS, IT-PLR, DIP, Ausschuss Digitales)", seed.summary.tier1 === 4);
check("Tier 2 = 3 Wege (BRH-Digital, NKR, BfDI)", seed.summary.tier2 === 3);
check("Gesamt 7 Kern-Wege (5 neu + 2 wiederverwendet)", (seed.retrievalPaths.length + seed.reusedPathIds.length) === 7);

// --- 13. Google-News-URLs korrekt aufgebaut (keine erfundenen Publisher-Feeds) ---
check("alle neuen URLs sind news.google.com-Suchwege", seed.retrievalPaths.every((p) => /^https:\/\/news\.google\.com\/rss\/search\?q=/.test(p.url)));
check("alle site:-Queries zielen auf die amtliche Herausgeber-Domain", seed.retrievalPaths.every((p) => /site:/.test(p.query)));

console.log(`\n== Ergebnis: Paket + ${seed.retrievalPaths.length} neue Wege · ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
