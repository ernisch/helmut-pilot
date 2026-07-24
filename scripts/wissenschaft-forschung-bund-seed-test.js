"use strict";

// Test des PREPARED-Seed-Generators für das Bund-Fachpaket `wissenschaft-forschung-bund`
// (scripts/generate-wissenschaft-forschung-bund-seed.js). Prüft die SICHERHEITSINVARIANTEN:
// vollständig INAKTIV, idempotent, method-CHECK-konform, keine ID-/Domain-Dubletten,
// Wiederverwendung von Destatis/OECD, keine BMFTR/BMBF-Dublette, keine Überschneidung mit
// bund-basis (keine parallelen Parlaments-/Ausschusswege), Rollback guarded + vollständig.
// Reiner Offline-Test (kein Netz, keine KI, kein DB-Zugriff).

const fs = require("fs");
const path = require("path");
const { build, buildRollback } = require("./generate-wissenschaft-forschung-bund-seed");
const { buildWissenschaftForschungBundSeed } = require("../lib/helmut/quellenarchitektur/seeds/wissenschaft-forschung-bund");
const model = require("../lib/helmut/quellenarchitektur/model");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

const seed = buildWissenschaftForschungBundSeed();
const { sql } = build();
const rollback = buildRollback(seed);
const baseSeed = fs.readFileSync(path.join(__dirname, "..", "supabase", "seeds", "20260713_source_architecture_seed.sql"), "utf8");

// --- 1. Struktur / Zeilenzahlen --------------------------------------------------------------
check("1 Paket", !!seed.package && seed.package.id === "pkg-wissenschaft-forschung-bund");
check("8 neue Entitäten", seed.entities.length === 8);
check("8 neue Herausgeber", seed.publishers.length === 8);
check("2 wiederverwendete Herausgeber (Destatis/OECD)", seed.reusedPublisherIds.length === 2);
check("12 Abrufwege (8–12-Ziel eingehalten)", seed.retrievalPaths.length === 12 && seed.retrievalPaths.length >= 8 && seed.retrievalPaths.length <= 12);
check("12 Paketzuordnungen", seed.packagePaths.length === 12);
check("12 path_expected_levels", seed.pathExpectedLevels.length === 12);
check("10 path_expected_geographies (nur Bund-Ebene)", seed.pathExpectedGeographies.length === 10);
check("Tier 1/2/3 = 5/5/2", seed.summary.tier1 === 5 && seed.summary.tier2 === 5 && seed.summary.tier3 === 2);

// --- 2. Vollständig INAKTIV ------------------------------------------------------------------
check("Paketstatus prepared", seed.package.status === "prepared");
check("KEIN 'auto'/'always_on'/'healthy' im SQL", !/'auto'|'always_on'|'healthy'/.test(sql));
const nManual = (sql.match(/'needs_review', 'manual'/g) || []).length;
check("alle 12 Abrufwege needs_review + manual", nManual === 12);
check("Seed-Selbstprüfung: 0 aktive Wege", seed.summary.aktiveAbrufwege === 0);
check("SQL setzt Paketstatus 'prepared'", /'prepared'/.test(sql));

// --- 3. method-CHECK-konform ----------------------------------------------------------------
const erlaubteMethoden = new Set(model.RETRIEVAL_METHODS);
check("alle method-Werte DB-CHECK-konform (googlenews_search)", seed.retrievalPaths.every((p) => erlaubteMethoden.has(p.method) && p.method === "googlenews_search"));
const erlaubteLevels = new Set(model.POLITICAL_LEVELS);
check("alle expected_levels enum-konform", seed.pathExpectedLevels.every((l) => erlaubteLevels.has(l.level)));

// --- 4. Idempotent + transaktional ----------------------------------------------------------
check("7x ON CONFLICT DO NOTHING (package/entities/publishers/paths/package_paths/levels/geos)", (sql.match(/on conflict \([^)]*\) do nothing/g) || []).length === 7);
check("begin + commit + notify pgrst", /begin;/.test(sql) && /commit;/.test(sql) && /notify pgrst/.test(sql));

// --- 5. Keine ID-/Domain-Dubletten (in sich + gegen Basis-Seed) ------------------------------
const pathIds = seed.retrievalPaths.map((p) => p.id);
check("Abrufweg-Ids eindeutig", new Set(pathIds).size === pathIds.length);
const pubIds = seed.publishers.map((p) => p.id);
check("Herausgeber-Ids eindeutig", new Set(pubIds).size === pubIds.length);
const pubDomains = seed.publishers.map((p) => p.canonical_domain);
check("Herausgeber-Domains eindeutig", new Set(pubDomains).size === pubDomains.length);
const entIds = seed.entities.map((e) => e.id);
check("Entitäts-Ids eindeutig", new Set(entIds).size === entIds.length);
check("keine neue Publisher-Id kollidiert mit Basis-Seed", pubIds.every((id) => !baseSeed.includes(`'${id}'`)));
check("keine neue Publisher-Domain kollidiert mit Basis-Seed", pubDomains.every((d) => !new RegExp(`'${d.replace(/\./g, "\\.")}'`).test(baseSeed)));
check("keine neue Entitäts-Id kollidiert mit Basis-Seed", entIds.every((id) => !baseSeed.includes(`'${id}'`)));
check("Paket-Key kollidiert nicht mit Basis-Seed", !baseSeed.includes("'wissenschaft-forschung-bund'"));

// --- 6. Wiederverwendung Destatis/OECD (referenziert, NICHT neu eingefügt) -------------------
check("Destatis + OECD existieren im Basis-Seed", /'publisher-destatis\.de'/.test(baseSeed) && /'publisher-oecd\.org'/.test(baseSeed));
// Publisher-INSERT-Block isolieren (von 'insert into public.publishers' bis zum ersten 'on conflict'),
// damit die Referenz auf publisher-destatis.de im retrieval_paths-Block das Ergebnis nicht verfälscht.
const pubInsertBlock = (sql.match(/insert into public\.publishers[\s\S]*?on conflict \([^)]*\) do nothing;/) || [""])[0];
check("Destatis/OECD stehen NICHT im publishers-Insert dieses Seeds", !/'publisher-destatis\.de'/.test(pubInsertBlock) && !/'publisher-oecd\.org'/.test(pubInsertBlock));
check("Destatis/OECD werden als Abrufweg-Herausgeber referenziert", seed.retrievalPaths.some((p) => p.publisher_id === "publisher-destatis.de") && seed.retrievalPaths.some((p) => p.publisher_id === "publisher-oecd.org"));
const allowedPubs = new Set([...pubIds, ...seed.reusedPublisherIds]);
check("jeder Abrufweg zeigt auf neuen ODER wiederverwendeten Herausgeber", seed.retrievalPaths.every((p) => allowedPubs.has(p.publisher_id)));
check("kein neuer Herausgeber ist verwaist (jeder von ≥1 Weg referenziert)", pubIds.every((id) => seed.retrievalPaths.some((p) => p.publisher_id === id)));

// --- 7. Keine BMFTR/BMBF-Dublette; BMBFSFJ NICHT angelegt ------------------------------------
check("genau EINE BMFTR-Ministeriumsentität", seed.entities.filter((e) => e.entity_type === "ministry").length === 1 && seed.entities.some((e) => e.id === "ministry-bmftr"));
const bmftr = seed.entities.find((e) => e.id === "ministry-bmftr");
check("BMBF nur als historischer Alias des BMFTR (keine eigene Entität/Publisher)", bmftr.aliases.includes("BMBF") && !seed.entities.some((e) => /bmbf(?!tr)/i.test(e.id)) && !seed.publishers.some((p) => /bmbf(?!tr)/i.test(p.id)));
check("BMBFSFJ NICHT im Paket (gehört zu bildung-bund/familie-bund)", !/bmbfsfj/i.test(sql));

// --- 8. Keine Überschneidung mit bund-basis (keine parallelen Parlaments-/Ausschusswege) -----
check("kein Bundestag/Bundesrat/DIP/Ausschuss-Herausgeber im Seed", !/publisher-bundestag|publisher-bundesrat|publisher-dip|aggregator-google-news', 'committee/.test(sql));
check("keine committee-* Abrufweg-Id (Ausschusswege bleiben in bund-basis)", !seed.retrievalPaths.some((p) => /committee/i.test(p.id)));

// --- 9. Semantische Nicht-Dubletten: getrennte Entitäten je Steuerungsfunktion ---------------
const ids = new Set(entIds);
check("GWK ≠ Wissenschaftsrat (getrennte Entitäten)", ids.has("institution-gwk") && ids.has("institution-wissenschaftsrat"));
check("Wissenschaftsrat ≠ DFG (getrennte Entitäten)", ids.has("institution-wissenschaftsrat") && ids.has("institution-dfg"));
check("EFI ≠ OECD (EFI eigene Entität, OECD wiederverwendeter Publisher)", ids.has("institution-efi") && seed.reusedPublisherIds.includes("publisher-oecd.org"));
check("DLR/Deutsche Raumfahrtagentur/ESA NICHT als eigener Weg (Raumfahrt via BMFTR)", !/publisher-dlr|raumfahrtagentur\.de|publisher-esa|esa\.int/i.test(sql) && seed.retrievalPaths.some((p) => p.id === "rp-wf-bmftr-raumfahrt" && p.publisher_id === "publisher-bmftr.bund.de"));
check("Max-Planck/Helmholtz/Fraunhofer/Leibniz NICHT als Einzelwege", !/max-planck|helmholtz|fraunhofer|leibniz/i.test(sql));
check("BuFI als BMFTR-Weg, NICHT als eigener Publisher/Entität", seed.retrievalPaths.some((p) => p.id === "rp-wf-bmftr-bufi" && p.publisher_id === "publisher-bmftr.bund.de") && !seed.publishers.some((p) => /bufi|bundesbericht/i.test(p.id)) && !seed.entities.some((e) => /bufi|bundesbericht/i.test(e.id)));

// --- 10. Keine erfundenen Direkt-Feeds: alle Wege = Google-News-Suchweg -----------------------
check("alle URLs sind news.google.com-Suchwege (kein erfundener Direkt-Feed)", seed.retrievalPaths.every((p) => /^https:\/\/news\.google\.com\/rss\/search\?q=/.test(p.url)));
check("jede Query enthält site:<domain>", seed.retrievalPaths.every((p) => /site:[a-z0-9.\-]+/.test(p.query)));

// --- 11. Rollback guarded + dependency-korrekt ----------------------------------------------
check("Rollback löscht geographies+levels+package_paths+retrieval_paths+source_packages+publishers+political_entities",
  /path_expected_geographies/.test(rollback) && /path_expected_levels/.test(rollback) && /package_paths/.test(rollback) &&
  /delete from public\.retrieval_paths/.test(rollback) && /delete from public\.source_packages/.test(rollback) &&
  /delete from public\.publishers/.test(rollback) && /delete from public\.political_entities/.test(rollback));
const ord = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Kinder vor Eltern",
  ord(/path_expected_geographies/) < ord(/delete from public\.retrieval_paths/) &&
  ord(/delete from public\.retrieval_paths/) < ord(/delete from public\.publishers/) &&
  ord(/delete from public\.publishers/) < ord(/delete from public\.political_entities/));
check("Rollback fasst Destatis/OECD NICHT an (guarded, nicht in Id-Liste)", !/'publisher-destatis\.de'/.test(rollback) && !/'publisher-oecd\.org'/.test(rollback));
check("Herausgeber-Löschung guarded (not exists retrieval_paths)", /delete from public\.publishers[\s\S]*?not exists \(select 1 from public\.retrieval_paths/.test(rollback));
check("Entitäts-Löschung guarded (not exists publishers)", /delete from public\.political_entities[\s\S]*?not exists \(select 1 from public\.publishers/.test(rollback));

console.log(`\n== Ergebnis: ${seed.retrievalPaths.length} Wege · ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
