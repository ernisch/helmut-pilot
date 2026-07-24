"use strict";

// Test des PREPARED-Seed-Generators für `aussen-europa-und-entwicklung-bund`
// (scripts/generate-aussen-europa-entwicklung-seed.js). Prüft die SICHERHEITS- und
// AUFTRAGS-Invarianten des erzeugten SQL: Paket prepared, alle neuen Wege technisch inaktiv
// (needs_review/manual), idempotent, method-CHECK-konform, DIP + Bundesregierung + AA-Entity
// wiederverwendet (nicht dupliziert), Bundeskanzleramt/GIZ/KfW/Engagement Global NICHT
// modelliert, EP Legislative Observatory aufgenommen, Rat + Europäischer Rat gebündelt,
// Rollback vollständig + guarded + wiederverwendete Wege geschützt. REIN OFFLINE.

const { build, buildRollback } = require("./generate-aussen-europa-entwicklung-seed");
const { buildAussenEuropaEntwicklungSeed, NEW_ENTITIES, NEW_PUBLISHERS, REUSED_ENTITY_IDS } =
  require("../lib/helmut/quellenarchitektur/seeds/aussen-europa-entwicklung-quellen");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

const { sql, seed } = build();
const rollback = buildRollback(seed);

// --- 1. Zeilenzahlen ---
check("1 neues Paket", seed.package && seed.package.key === "aussen-europa-und-entwicklung-bund");
check("5 neue Entitäten", seed.entities.length === 5);
check("5 neue Herausgeber", seed.publishers.length === 5);
check("5 neue Abrufwege", seed.retrievalPaths.length === 5);
check("7 Paketzuordnungen (5 neu + 2 wiederverwendet)", seed.packagePaths.length === 7);
check("2 wiederverwendete Wege (rp-dip, rp-bundesregierung)", JSON.stringify(seed.reusedPathIds.slice().sort()) === JSON.stringify(["rp-bundesregierung", "rp-dip"]));
check("7 path_expected_levels", seed.pathExpectedLevels.length === 7);
check("5 path_expected_geographies (je neuer Weg 1x geo-bund)", seed.pathExpectedGeographies.length === 5);
check("21 path_expected_topics", seed.pathExpectedTopics.length === 21);
check("6 path_expected_entities (Rat+Europäischer Rat = 2)", seed.pathExpectedEntities.length === 6);

// --- 2. Paket prepared + is_base false (nicht aktiv) ---
check("source_packages: status='prepared'", /'pkg-aussen-europa-und-entwicklung-bund',.*'prepared', false, 'bund', 'geo-bund'/.test(sql));
check("Paket ist NICHT 'active'", seed.package.status === "prepared" && seed.package.is_base === false);
check("political_level = bund (Fachthema Bund)", seed.package.political_level === "bund");

// --- 3. Technisch INAKTIV (hart im SQL) ---
check("KEIN 'auto'/'always_on'/'healthy' im SQL", !/'auto'|'always_on'|'healthy'/.test(sql));
const nManual = (sql.match(/'needs_review', 'manual'/g) || []).length;
check("alle 5 neuen Abrufwege needs_review + manual", nManual === 5);
check("Seed-Selbstprüfung: 0 aktive NEUE Wege", seed.summary.aktiveNeueAbrufwege === 0);
check("kein neuer Weg is_critical (Kandidat vor Verifikation)", seed.retrievalPaths.every((p) => p.is_critical === false));

// --- 4. method-CHECK-konform ---
const erlaubteMethoden = new Set(["rss", "api", "html", "googlenews_search", "structured_download"]);
check("alle method-Werte DB-CHECK-konform", seed.retrievalPaths.every((p) => erlaubteMethoden.has(p.method)));
check("alle neuen Wege method='html' (stabile Übersichtsseiten, keine erfundene RSS/API)", seed.retrievalPaths.every((p) => p.method === "html"));

// --- 5. Idempotent + transaktional ---
check("9 Inserts mit ON CONFLICT DO NOTHING (nicht-destruktiv)", (sql.match(/on conflict \([^)]*\) do nothing/g) || []).length === 9);
check("begin + commit + notify pgrst", /begin;/.test(sql) && /commit;/.test(sql) && /notify pgrst/.test(sql));
check("determinismus: zweiter Build identisch", build().sql === sql);

// --- 6. Wiederverwendung DIP + Bundesregierung (NICHT neu angelegt) ---
check("package_paths verknüpft rp-dip", /\('pkg-aussen-europa-und-entwicklung-bund', 'rp-dip'\)/.test(sql));
check("package_paths verknüpft rp-bundesregierung", /\('pkg-aussen-europa-und-entwicklung-bund', 'rp-bundesregierung'\)/.test(sql));
const rpInsertBlock = sql.slice(sql.indexOf("insert into public.retrieval_paths"), sql.indexOf("-- 5)"));
check("rp-dip wird NICHT als retrieval_path neu angelegt", !/\('rp-dip',/.test(rpInsertBlock));
check("rp-bundesregierung wird NICHT als retrieval_path neu angelegt", !/\('rp-bundesregierung',/.test(rpInsertBlock));
check("kein DIP-/Bundesregierung-/Bundestag-Herausgeber neu angelegt", !/publisher-dip\.bundestag\.de|publisher-bundesregierung\.de|publisher-bundestag\.de|publisher-bundesrat\.de/.test(sql));

// --- 7. Entity-Wiederverwendung AA (keine zweite Entity) ---
check("AA-Herausgeber referenziert bestehende Entity ministry-auswaertiges-amt", /'publisher-auswaertiges-amt\.de'.*'ministry-auswaertiges-amt'/.test(sql));
const entInsertBlock = sql.slice(sql.indexOf("insert into public.political_entities"), sql.indexOf("-- 3)"));
check("ministry-auswaertiges-amt wird NICHT neu als Entity angelegt", !/'ministry-auswaertiges-amt',/.test(entInsertBlock));
check("keine neue Entity überschneidet wiederverwendete Entities", NEW_ENTITIES.every((e) => !REUSED_ENTITY_IDS.includes(e.id)));

// --- 8. Keine Dubletten: Entity-IDs + Domains eindeutig ---
const entIds = NEW_ENTITIES.map((e) => e.id);
check("neue Entity-IDs eindeutig", new Set(entIds).size === entIds.length);
const domains = NEW_PUBLISHERS.map((p) => p.canonical_domain);
check("neue Herausgeber-Domains eindeutig (canonical_domain UNIQUE)", new Set(domains).size === domains.length);
const pubIds = NEW_PUBLISHERS.map((p) => p.id);
check("neue Herausgeber-IDs eindeutig", new Set(pubIds).size === pubIds.length);

// --- 9. Korrektur 3: Bundeskanzleramt NICHT dupliziert ---
check("kein Bundeskanzleramt-Herausgeber/-Weg (Korrektur 3)", !/bundeskanzler|kanzleramt/i.test(sql));
check("kein neues government-bund/Bundesregierung-Entity (via Bundesregierung-Weg abgedeckt)", !/'government-bund',/.test(sql));

// --- 10. Korrektur 7/§7: GIZ, KfW, Engagement Global NICHT modelliert ---
check("kein GIZ", !/\bgiz\b|giz\.de/i.test(sql));
check("kein KfW", !/\bkfw\b|kfw-entwicklungsbank/i.test(sql));
check("kein Engagement Global", !/engagement.?global/i.test(sql));

// --- 11. EU-Institutionen korrekt typisiert ---
check("BMZ = ministry, level bund", NEW_ENTITIES.some((e) => e.id === "ministry-bmz" && e.entity_type === "ministry" && e.level === "bund"));
const euEntities = NEW_ENTITIES.filter((e) => e.id.startsWith("eu-"));
check("4 EU-Institutionen (Kommission, Rat, Europäischer Rat, Parlament)", euEntities.length === 4);
check("alle EU-Institutionen other_institution + level eu", euEntities.every((e) => e.entity_type === "other_institution" && e.level === "eu"));

// --- 12. Korrektur 2 / Report: Europäisches Parlament Legislative Observatory aufgenommen ---
check("EP Legislative Observatory (OEIL) als eigener Weg", /rp-eu-parlament-oeil/.test(sql) && /oeil\.secure\.europarl\.europa\.eu/.test(sql));
check("EP nicht mit DIP verwechselt (eigener EU-Weg + eigene Entity)", /'eu-parliament'/.test(sql));

// --- 13. Rat + Europäischer Rat gebündelt (1 Publisher/Weg, 2 Entitäten) ---
check("Rat + Europäischer Rat: EIN Publisher (consilium)", pubIds.filter((id) => id === "publisher-consilium.europa.eu").length === 1);
const ratEntities = seed.pathExpectedEntities.filter((e) => e.retrieval_path_id === "rp-eu-rat").map((e) => e.entity_id).sort();
check("Rat-Weg trägt beide Entitäten (Bündelung)", JSON.stringify(ratEntities) === JSON.stringify(["eu-council-of-the-eu", "eu-european-council"]));

// --- 14. Paketgröße gesamt = 7 Wege (5 neu + 2 wiederverwendet) ---
check("Paket umfasst 7 Abrufwege gesamt", seed.summary.abrufwegeGesamtImPaket === 7);

// --- 15. path_expected_levels: EU-Wege 'eu', AA/BMZ 'bund'+'international' ---
const lvlByPath = seed.pathExpectedLevels.reduce((m, l) => { (m[l.retrieval_path_id] = m[l.retrieval_path_id] || []).push(l.level); return m; }, {});
check("EU-Kommission Ebene = eu", JSON.stringify(lvlByPath["rp-eu-kommission"]) === JSON.stringify(["eu"]));
check("AA Ebene = bund+international", JSON.stringify((lvlByPath["rp-aa-newsroom"] || []).sort()) === JSON.stringify(["bund", "international"]));

// --- 16. Rollback vollständig + guarded + wiederverwendete Wege geschützt ---
check("Rollback löscht alle 4 path_expected_* + package_paths + retrieval_paths + source_packages + publishers + political_entities",
  /path_expected_entities/.test(rollback) && /path_expected_topics/.test(rollback) && /path_expected_geographies/.test(rollback) &&
  /path_expected_levels/.test(rollback) && /package_paths/.test(rollback) &&
  /delete from public\.retrieval_paths/.test(rollback) && /delete from public\.source_packages/.test(rollback) &&
  /delete from public\.publishers/.test(rollback) && /delete from public\.political_entities/.test(rollback));
check("Rollback entfernt package_paths NUR per package_id (rp-dip/rp-bundesregierung-Basis-Links geschützt)",
  /delete from public\.package_paths where package_id = 'pkg-aussen-europa-und-entwicklung-bund';/.test(rollback));
check("Rollback löscht rp-dip/rp-bundesregierung NICHT als retrieval_path",
  !/delete from public\.retrieval_paths where id in \([^)]*rp-dip/.test(rollback) &&
  !/delete from public\.retrieval_paths where id in \([^)]*rp-bundesregierung/.test(rollback));
check("Rollback: Herausgeber + Entitaeten GUARDED (not exists)", (rollback.match(/and not exists/g) || []).length === 2);
const ord = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Kinder vor Eltern",
  ord(/path_expected_entities/) < ord(/delete from public\.retrieval_paths/) &&
  ord(/delete from public\.package_paths/) < ord(/delete from public\.retrieval_paths/) &&
  ord(/delete from public\.retrieval_paths/) < ord(/delete from public\.source_packages/) &&
  ord(/delete from public\.publishers/) < ord(/delete from public\.political_entities/));

// --- 17. Kanonischer Paketname + keine ID-Kollision der neuen Wege mit Reuse ---
check("kanonischer Paketname bestätigt", seed.package.key === "aussen-europa-und-entwicklung-bund" && seed.package.id === "pkg-aussen-europa-und-entwicklung-bund");
const newPathIds = seed.retrievalPaths.map((p) => p.id);
check("neue Weg-IDs kollidieren nicht mit wiederverwendeten", newPathIds.every((id) => !seed.reusedPathIds.includes(id)));

console.log(`\n== Ergebnis: Paket ${seed.package.key} · ${seed.summary.neueAbrufwege} neu + ${seed.summary.wiederverwendeteAbrufwege} wiederverwendet · ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
