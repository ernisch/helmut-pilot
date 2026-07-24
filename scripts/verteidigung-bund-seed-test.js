"use strict";

// Offline-Test des PREPARED-Pakets "verteidigung-bund" (Builder + SQL-Generator).
// Prueft die verbindlichen Auftragsinvarianten: prepared/inaktiv, additiv, idempotent,
// kollisionsfrei, keine erfundenen Feeds, korrekte Wiederverwendung, korrekter Rollback,
// keine hart codierten Reform-/Personen-/Berichtsdetails.

const { buildVerteidigungBundSeed } = require("../lib/helmut/quellenarchitektur/seeds/verteidigung-bund");
const { build, buildRollback } = require("./generate-verteidigung-bund-seed");
const { POLITICAL_ENTITIES } = require("../lib/helmut/quellenarchitektur/seeds/entities");
const { DOMAIN_PUBLISHERS } = require("../lib/helmut/quellenarchitektur/seeds/publishers");
const { PACKAGE_DEFINITIONS } = require("../lib/helmut/quellenarchitektur/seeds/packages");
const model = require("../lib/helmut/quellenarchitektur/model");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

const seed = buildVerteidigungBundSeed();
const { sql } = build();
const rollback = buildRollback(seed);

// --- 1. Paket: prepared + is_base=false + Bundesebene ---
check("Paketname bestaetigt: key='verteidigung-bund'", seed.package.key === "verteidigung-bund" && seed.package.id === "pkg-verteidigung-bund");
check("Paket status='prepared'", seed.package.status === "prepared");
check("Paket is_base=false", seed.package.is_base === false);
check("Paket political_level='bund' + geo-bund", seed.package.political_level === "bund" && seed.package.geography_id === "geo-bund");
check("Paket steht NICHT im Code-Seed PACKAGE_DEFINITIONS (DB-only, bricht buildCatalog nicht)",
  !PACKAGE_DEFINITIONS.some((p) => p.key === "verteidigung-bund"));

// --- 2. Zielarchitektur: 5 neue + 1 wiederverwendeter Weg = 6 im Paket ---
check("5 neue Abrufwege", seed.retrievalPaths.length === 5);
check("rp-dip wiederverwendet (nur Paketverknuepfung)", seed.reused.retrievalPaths.includes("rp-dip"));
check("Paket umfasst 6 Abrufwege (5 neu + rp-dip)", seed.summary.abrufwegeGesamtImPaket === 6);
check("Zielband 6-7 Retrieval Paths eingehalten", seed.summary.abrufwegeGesamtImPaket >= 6 && seed.summary.abrufwegeGesamtImPaket <= 7);
check("genau 6 package_paths", seed.packagePaths.length === 6);

// --- 3. Genau 2 BMVg-Wege (kein 3. Weg) ---
check("genau 2 BMVg-Wege", seed.summary.bmvgWege === 2);
check("BMVg-Wege = Politik/Strategie/Bundeswehr + Beschaffung/Ruestung",
  seed.retrievalPaths.some((p) => p.id === "rp-vtdg-bmvg-politik-strategie-bundeswehr") &&
  seed.retrievalPaths.some((p) => p.id === "rp-vtdg-bmvg-beschaffung-ruestung"));
check("KEIN dritter BMVg-Weg (Personal/Einsatzbereitschaft) angelegt",
  !seed.retrievalPaths.some((p) => /personal|einsatzbereitschaft/i.test(p.id)));
check("KEIN eigener Auslandseinsatz-Weg", !seed.retrievalPaths.some((p) => /auslandseinsatz|einsatz-/i.test(p.id)));

// --- 4. Technisch INAKTIV (hart im SQL) ---
check("Seed-Selbstpruefung: 0 aktive Wege", seed.summary.aktiveAbrufwege === 0);
check("alle neuen Wege status='needs_review'", seed.retrievalPaths.every((p) => p.status === "needs_review"));
check("alle neuen Wege activation_mode='manual'", seed.retrievalPaths.every((p) => p.activation_mode === "manual"));
check("KEIN 'auto'/'always_on'/'healthy' im SQL", !/'auto'|'always_on'|'healthy'/.test(sql));
const nManual = (sql.match(/'needs_review', 'manual'/g) || []).length;
check("alle 5 Abrufwege im SQL needs_review + manual", nManual === 5);
check("Paket im SQL prepared + false", /'pkg-verteidigung-bund'.*'prepared', false/.test(sql));

// --- 5. Keine erfundenen Feeds/APIs: nur googlenews_search (realer Suchweg) ---
check("alle neuen Wege method='googlenews_search'", seed.retrievalPaths.every((p) => p.method === "googlenews_search"));
const erlaubteMethoden = new Set(model.RETRIEVAL_METHODS);
check("alle method-Werte DB-CHECK-konform", seed.retrievalPaths.every((p) => erlaubteMethoden.has(p.method)));
check("kein RSS/API/structured_download erfunden", !seed.retrievalPaths.some((p) => ["rss", "api", "structured_download", "html"].includes(p.method)));
check("jeder Weg verifyBeforeActivation=true (Direkt-Feed vor Aktivierung pruefen)", seed.retrievalPaths.every((p) => p.verifyBeforeActivation === true));

// --- 6. Wiederverwendung: bestehende Komponenten NUR referenziert, NICHT dupliziert ---
const existingEntityIds = new Set(POLITICAL_ENTITIES.map((e) => e.id));
check("committee-bt-verteidigung existiert im Basis-Seed (wiederverwendet)", existingEntityIds.has("committee-bt-verteidigung"));
check("parliament-bundestag + government-bund existieren (wiederverwendet)", existingEntityIds.has("parliament-bundestag") && existingEntityIds.has("government-bund"));
check("neue Entitaeten kollidieren NICHT mit Basis-Entitaeten", seed.entities.every((e) => !existingEntityIds.has(e.id)));
check("bundestag.de + bundesregierung.de sind bestehende Herausgeber (wiederverwendet)",
  DOMAIN_PUBLISHERS["bundestag.de"] && DOMAIN_PUBLISHERS["bundesregierung.de"]);
check("neuer Herausgeber-Domain bmvg.de NICHT im Basis-Herausgeberregister (keine Domain-Dublette)", !DOMAIN_PUBLISHERS["bmvg.de"]);
check("Wehrbeauftragte + Ausschuss haengen am bestehenden publisher-bundestag.de",
  seed.retrievalPaths.find((p) => p.id === "rp-vtdg-wehrbeauftragter").publisher_id === "publisher-bundestag.de" &&
  seed.retrievalPaths.find((p) => p.id === "rp-vtdg-verteidigungsausschuss").publisher_id === "publisher-bundestag.de");
check("Bundesregierung-Weg haengt am bestehenden publisher-bundesregierung.de",
  seed.retrievalPaths.find((p) => p.id === "rp-vtdg-bundesregierung-sicherheit").publisher_id === "publisher-bundesregierung.de");
check("nur 1 neuer Herausgeber (BMVg)", seed.publishers.length === 1 && seed.publishers[0].id === "publisher-bmvg.de");
// Block-genaue Pruefung: extrahiere den jeweiligen INSERT-Block (bis zum ersten 'on conflict').
function insertBlock(table) {
  const m = new RegExp(`insert into public\\.${table.replace(/\./g, "\\.")} \\([\\s\\S]*?on conflict`).exec(sql);
  return m ? m[0] : "";
}
// rp-dip darf NICHT als retrieval_paths-INSERT erscheinen (nur als package_paths-Referenz).
check("rp-dip NICHT in retrieval_paths-Insert (nicht dupliziert/veraendert)",
  !/'rp-dip'/.test(insertBlock("retrieval_paths")) && /'rp-dip'/.test(insertBlock("package_paths")));
check("bestehende Herausgeber NICHT in publishers-Insert (nicht dupliziert)",
  !/publisher-bundestag\.de|publisher-bundesregierung\.de/.test(insertBlock("publishers")));
check("bestehende Entitaeten NICHT in political_entities-Insert",
  !/'committee-bt-verteidigung'|'parliament-bundestag'|'government-bund'/.test(insertBlock("political_entities")));

// --- 7. Entitaetstypen gueltig, Bundeswehr/Wehrbeauftragte als Institutionen ---
const validEntityTypes = new Set(model.ENTITY_TYPES);
check("alle neuen Entitaetstypen DB-CHECK-konform", seed.entities.every((e) => validEntityTypes.has(e.entity_type)));
check("BMVg = ministry, Bundeswehr/Wehrbeauftragte = other_institution",
  seed.entities.find((e) => e.id === "ministry-bmvg").entity_type === "ministry" &&
  seed.entities.find((e) => e.id === "institution-bundeswehr").entity_type === "other_institution" &&
  seed.entities.find((e) => e.id === "institution-wehrbeauftragter").entity_type === "other_institution");

// --- 8. Verteidigungsausschuss realistisch: nur oeffentliche Inhalte ---
const ausschuss = seed.retrievalPaths.find((p) => p.id === "rp-vtdg-verteidigungsausschuss");
check("Ausschuss-Weg referenziert nur oeffentliche Inhalte (Anhoerung/Tagesordnung/Stellungnahme)",
  /Anhoerung/.test(ausschuss.query) && /Tagesordnung/.test(ausschuss.query) && /Stellungnahme/.test(ausschuss.query));
check("Ausschuss erwartet die bestehende Entitaet committee-bt-verteidigung",
  seed.pathExpectedEntities.some((e) => e.retrieval_path_id === "rp-vtdg-verteidigungsausschuss" && e.entity_id === "committee-bt-verteidigung"));

// --- 9. Future Targets korrekt behandelt (BAAINBw/MAD/NATO/EU) ---
const ft = new Set(seed.summary.futureTargets.join(" | "));
check("BAAINBw als Future Target", seed.rejected.some((v) => /BAAINBw/.test(v.kandidat) && v.entscheidung === "future_target"));
check("MAD als Future Target (kein Kernquelle)", seed.rejected.some((v) => /MAD/.test(v.kandidat) && v.entscheidung === "future_target"));
check("NATO + EU-Verteidigung als Future Targets", seed.rejected.filter((v) => /NATO|EU-Verteidigung/.test(v.kandidat) && v.entscheidung === "future_target").length === 2);
void ft;

// --- 10. Keine hart codierten Reform-/Personen-/Berichtsdetails (Korrektur 5/6) ---
check("keine Jahreszahl im SQL (keine Berichts-/Reformjahre)", !/\b(19|20)\d{2}\b/.test(sql));
check("keine Berichtsnummer-Muster (Drucksache/Nr.)", !/Drucksache|\bNr\.\s*\d/i.test(sql));
// Keine aktuellen Personennamen (Minister/Wehrbeauftragter/Staatssekretaer) fest verdrahtet.
check("kein aktueller Personenname hart codiert", !/Pistorius|Otte|Zimmermann|Hoegl|Högl/i.test(sql));

// --- 11. Additiv/idempotent/transaktional ---
const nConflict = (sql.match(/on conflict \([^)]*\) do nothing/g) || []).length;
check("ON CONFLICT DO NOTHING an jedem Insert-Block (9 Bloecke)", nConflict === 9);
check("begin + commit + notify pgrst", /begin;/.test(sql) && /commit;/.test(sql) && /notify pgrst/.test(sql));
check("kein DROP/ALTER/DELETE/UPDATE im Seed (rein additiv)", !/\b(drop|alter|delete|update)\b/i.test(sql));

// --- 12. Erwartete Dimensionen vollstaendig ---
check("5 path_expected_levels (alle bund)", seed.pathExpectedLevels.length === 5 && seed.pathExpectedLevels.every((l) => l.level === "bund"));
check("5 path_expected_geographies (alle geo-bund)", seed.pathExpectedGeographies.length === 5 && seed.pathExpectedGeographies.every((g) => g.geography_id === "geo-bund"));
check("path_expected_topics vorhanden (Signalsemantik)", seed.pathExpectedTopics.length >= 20);
check("path_expected_entities vorhanden inkl. wiederverwendeter Entitaet", seed.pathExpectedEntities.length === 8);

// --- 13. Rollback vollstaendig + dependency-korrekt + schont Wiederverwendetes ---
check("Rollback loescht Kinder + Wege + Paket + guarded Herausgeber/Entitaeten",
  /path_expected_entities/.test(rollback) && /path_expected_topics/.test(rollback) &&
  /path_expected_geographies/.test(rollback) && /path_expected_levels/.test(rollback) &&
  /delete from public\.package_paths/.test(rollback) && /delete from public\.retrieval_paths/.test(rollback) &&
  /delete from public\.source_packages/.test(rollback) && /delete from public\.publishers/.test(rollback) &&
  /delete from public\.political_entities/.test(rollback));
check("Rollback loescht rp-dip NICHT", !/delete from public\.retrieval_paths where id in \([^)]*rp-dip/.test(rollback));
check("Rollback loescht package_paths ueber package_id (loest auch rp-dip-Link, ohne rp-dip zu loeschen)",
  /delete from public\.package_paths where package_id = 'pkg-verteidigung-bund'/.test(rollback));
check("Rollback: Herausgeber/Entitaeten nur guarded (not exists)", (rollback.match(/not exists/g) || []).length >= 3);
const ord = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Kinder vor Wegen vor Paket vor Herausgeber vor Entitaeten",
  ord(/path_expected_entities/) < ord(/delete from public\.retrieval_paths/) &&
  ord(/delete from public\.retrieval_paths/) < ord(/delete from public\.source_packages/) &&
  ord(/delete from public\.source_packages/) < ord(/delete from public\.publishers/) &&
  ord(/delete from public\.publishers/) < ord(/delete from public\.political_entities/));

// --- 14. ID-Eindeutigkeit + kein Legacy-Fake ---
const allNewIds = [seed.package.id, ...seed.entities.map((e) => e.id), ...seed.publishers.map((p) => p.id), ...seed.retrievalPaths.map((p) => p.id)];
check("alle neuen IDs eindeutig", new Set(allNewIds).size === allNewIds.length);
check("neue Wege ohne erfundene legacy_source_id (null)", seed.retrievalPaths.every((p) => p.legacy_source_id === null));

console.log(`\n== verteidigung-bund: ${seed.retrievalPaths.length} neue Wege + rp-dip · ${fail === 0 ? "ALLE TESTS GRUEN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
