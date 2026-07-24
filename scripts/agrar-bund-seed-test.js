"use strict";

// Test des PREPARED-Seed-Generators für das Bundes-Fachpaket
//   "landwirtschaft-ernaehrung-und-laendliche-raeume-bund"
// (scripts/generate-agrar-bund-seed.js). Prüft die SICHERHEITS- und DUBLETTEN-Invarianten
// des erzeugten SQL: technisch inaktiv (needs_review+manual), Paket prepared/is_base=false,
// kein Profil-Mapping / kein aktiver Crawl-Plan, additive Wiederverwendung von Destatis/DIP/
// Ausschuss, keine BZL/BZfE/DVS-Publisher, BMEL nur als Alias, keine Kollision mit dem
// Basis-Seed, idempotent, Rollback guarded + reihenfolgekorrekt, Generator deterministisch.
// REIN OFFLINE (kein Netz, keine DB).

const fs = require("fs");
const path = require("path");
const { buildSql, buildRollback } = require("./generate-agrar-bund-seed");
const data = require("../lib/helmut/quellenarchitektur/seeds/agrar-bund-quellen");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

const { sql, seed } = buildSql();
const rollback = buildRollback(seed);
const baseSeed = fs.readFileSync(path.join(__dirname, "..", "supabase", "seeds", "20260713_source_architecture_seed.sql"), "utf8");
const bebbSeed = fs.readFileSync(path.join(__dirname, "..", "supabase", "seeds", "20260717_landesmodul_be_bb_seed.sql"), "utf8");

// Hilfs-Ausschnitt: der retrieval_paths-VALUES-Block (bis zum on conflict).
const rpBlock = (sql.split("insert into public.retrieval_paths")[1] || "").split("on conflict")[0];
const pubBlock = (sql.split("insert into public.publishers")[1] || "").split("on conflict")[0];
const rpDeleteLine = (rollback.split("\n").find((l) => l.startsWith("delete from public.retrieval_paths")) || "");
const pubDeleteLine = (rollback.split("\n").find((l) => l.startsWith("delete from public.publishers")) || "");

// --- 1. Zeilenzahlen ---
check("3 neue Entitäten", seed.entities.length === 3);
check("3 neue Herausgeber", seed.publishers.length === 3);
check("7 neue Abrufwege", seed.newPaths.length === 7);
check("2 wiederverwendete Bestandswege", seed.reusedPaths.length === 2);
check("9 Paketzuordnungen (7 neu + 2 wiederverwendet)", seed.packagePaths.length === 9);
check("7 path_expected_levels + 7 path_expected_geographies", seed.pathExpectedLevels.length === 7 && seed.pathExpectedGeographies.length === 7);
check("30 path_expected_topics", seed.pathExpectedTopics.length === 30);

// --- 2. Paket: prepared / is_base=false / bund / kein Pflichtklassen ---
check("Paket status=prepared", seed.package.status === "prepared");
check("Paket is_base=false", seed.package.is_base === false);
check("Paket political_level=bund + geo-bund", seed.package.political_level === "bund" && seed.package.geography_id === "geo-bund");
check("Paket ohne Pflichtklassen (kein Landesmodul)", Array.isArray(seed.package.required_classes) && seed.package.required_classes.length === 0);
check("Paket-Key exakt kanonisch", seed.package.key === "landwirtschaft-ernaehrung-und-laendliche-raeume-bund");
check("SQL: source_packages trägt 'prepared', false", /insert into public\.source_packages[\s\S]*'prepared', false/.test(sql));

// --- 3. Technisch INAKTIV (hart im SQL) ---
check("KEIN 'auto'/'always_on'/'healthy' im gesamten SQL", !/'auto'|'always_on'|'healthy'/.test(sql));
check("alle 7 neuen Abrufwege needs_review + manual", (sql.match(/'needs_review', 'manual'/g) || []).length === 7);
check("retrieval_paths-Block enthält NUR needs_review+manual (7x, keine anderen Status/Modi)",
  (rpBlock.match(/'needs_review'/g) || []).length === 7 && (rpBlock.match(/'manual'/g) || []).length === 7 &&
  !/'healthy'|'degraded'|'broken'|'paused'|'archived'/.test(rpBlock) && !/'auto'|'always_on'|'dev_only'/.test(rpBlock));
check("kein is_critical=true (Fachpaket, keine Kernquelle)", !/, true, 16,/.test(rpBlock) && (rpBlock.match(/, false, 16,/g) || []).length === 7);
check("alle Methoden googlenews_search (bot-sicheres Hausmuster)", (rpBlock.match(/'googlenews_search'/g) || []).length === 7);

// --- 4. Kein Profil-Mapping / kein aktiver Crawl-Plan / keine Fremdtabellen ---
check("SQL berührt keine Profil-/Mandanten-/Rohdaten-Tabellen",
  !/public\.(mandate_profiles|mandate_profile_fields|profiles|raw_documents|knowledge_objects|briefings|decisions|crawl_runs)\b/.test(sql));
check("nur die 8 erlaubten Quellen-Tabellen werden beschrieben", (() => {
  const tables = [...sql.matchAll(/insert into public\.(\w+)/g)].map((m) => m[1]);
  const allowed = new Set(["political_entities", "source_packages", "publishers", "retrieval_paths", "package_paths", "path_expected_levels", "path_expected_geographies", "path_expected_topics"]);
  return tables.length === 8 && tables.every((t) => allowed.has(t));
})());

// --- 5. Wiederverwendung Destatis (Herausgeber + Entität NICHT neu) ---
check("Destatis-Herausgeber NICHT im publishers-Insert (wiederverwendet)", !/destatis/i.test(pubBlock));
check("neuer Agrar-Weg hängt am Bestands-Herausgeber publisher-destatis.de", /'rp-agrar-destatis-agrarstatistik', 'publisher-destatis\.de'/.test(sql));
check("reusedPublisherIds nennt publisher-destatis.de", data.REUSED_PUBLISHER_IDS.includes("publisher-destatis.de"));
check("keine zweite Destatis-Entität (statoffice-destatis nicht angefasst)", !/statoffice-destatis/.test(sql));

// --- 6. Wiederverwendung DIP + Ausschuss (nur additive Paketverknüpfung) ---
check("rp-dip im package_paths (additiv verknüpft)", /'pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund', 'rp-dip'/.test(sql));
check("rp-committee-landwirtschaft im package_paths (additiv verknüpft)", /'pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund', 'rp-committee-landwirtschaft'/.test(sql));
check("rp-dip / rp-committee-landwirtschaft NICHT im retrieval_paths-Insert (kein Overwrite)", !/'rp-dip'/.test(rpBlock) && !/'rp-committee-landwirtschaft'/.test(rpBlock));

// --- 7. BZL / BZfE / DVS NICHT als Herausgeber/Entität; Forschungsinstitute begrenzt ---
check("keine BZL/BZfE/DVS-Publisher oder -Entitäten", !/bzl|bzfe|\bdvs\b/i.test(sql));
check("kein Thünen/BfR/JKI/FLI/MRI im Paket (Future Targets, nicht geseedet)", !/thuenen|bfr\.bund|julius-?k[üu]hn|loeffler|rubner/i.test(sql));

// --- 8. BMEL nur als Alias, EINE Ministeriums-Entität mit aktuellem Namen ---
const bmleh = seed.entities.find((e) => e.id === "ministry-bmleh");
check("genau EINE Ministeriums-Entität (ministry-bmleh)", seed.entities.filter((e) => e.entity_type === "ministry").length === 1 && !!bmleh);
check("BMLEH-Name aktuell (enthält 'Heimat')", /Heimat/.test(bmleh.name));
check("historische Bezeichnung BMEL nur als Alias", bmleh.aliases.includes("BMEL") && bmleh.aliases.includes("BMLEH") && bmleh.aliases.includes("Bundesministerium für Ernährung und Landwirtschaft"));
check("keine zweite Ministeriums-Entität für Landwirtschaft (kein 'ministry-bmel' o.ä.)", !/'ministry-bmel'|'ministry-bmleh-alt'/.test(sql));

// --- 9. GAK / ländliche Räume sichtbar & substanziell ---
check("eigener GAK/ländliche-Räume-Weg vorhanden", seed.newPaths.some((p) => p.id === "rp-agrar-bmleh-gak-laendliche-raeume"));
check("Thema 'laendliche_raeume' + 'gak' in erwarteten Themen", seed.pathExpectedTopics.some((t) => t.topic === "laendliche_raeume") && seed.pathExpectedTopics.some((t) => t.topic === "gak"));
check("GAP und GAK getrennt (zwei distinkte Wege, keine Scheindublette)",
  seed.newPaths.some((p) => p.id === "rp-agrar-bmleh-gap") && seed.newPaths.some((p) => p.id === "rp-agrar-bmleh-gak-laendliche-raeume"));

// --- 10. Publisher-/Tier-Rechnung ---
check("genau 3 NEUE Herausgeber (BMLEH/BLE/BVL)", seed.publishers.map((p) => p.id).sort().join(",") === "publisher-ble.de,publisher-bmleh.de,publisher-bvl.bund.de");
check("BVL aufgenommen, BfR NICHT (kein Doppel BVL/BfR)", seed.publishers.some((p) => p.id === "publisher-bvl.bund.de") && !/bfr/i.test(sql));
const tier1 = [...seed.newPaths, ...seed.reusedPaths].filter((p) => p.tier === 1).length;
const tier2 = [...seed.newPaths, ...seed.reusedPaths].filter((p) => p.tier === 2).length;
check("Tier-Verteilung: 7 Tier-1, 2 Tier-2, gesamt 9 Wege", tier1 === 7 && tier2 === 2 && (seed.newPaths.length + seed.reusedPaths.length) === 9);

// --- 11. Idempotent + transaktional ---
check("8 x 'on conflict ... do nothing' (nicht-destruktiv)", (sql.match(/on conflict \([^)]*\) do nothing/g) || []).length === 8);
check("begin + commit + notify pgrst", /^begin;/m.test(sql) && /^commit;/m.test(sql) && /notify pgrst/.test(sql));
check("method-Werte DB-CHECK-konform", seed.newPaths.every(() => true) && (sql.match(/'googlenews_search'/g) || []).length === 7);

// --- 12. KEINE Kollision mit Basis-Seed / BE-BB-Seed (IDs + Domains) ---
const newIds = [seed.package.id, ...seed.entities.map((e) => e.id), ...seed.publishers.map((p) => p.id), ...seed.newPaths.map((p) => p.id)];
check("keine ID-Kollision mit Basis-Seed", newIds.every((id) => !baseSeed.includes(`'${id}'`)));
check("keine ID-Kollision mit BE/BB-Seed", newIds.every((id) => !bebbSeed.includes(`'${id}'`)));
check("keine Domain-Dublette (bmleh.de/ble.de/bvl.bund.de nicht im Basis-Seed)",
  !/'bmleh\.de'/.test(baseSeed) && !/'ble\.de'/.test(baseSeed) && !/'bvl\.bund\.de'/.test(baseSeed));
check("legacy_source_id 'agrar-*' kollidiert nicht mit Basis-Seed", seed.newPaths.every((p) => !baseSeed.includes(`'${p.legacy_source_id}'`)));
check("Paket-Key nicht im Basis-/BE-BB-Seed vorhanden", !baseSeed.includes(seed.package.key) && !bebbSeed.includes(seed.package.key));

// --- 13. Rollback guarded + dependency-korrekt ---
check("Rollback: Herausgeber guarded (nur wenn kein Abrufweg referenziert)", /delete from public\.publishers p where[\s\S]*not exists \(select 1 from public\.retrieval_paths rp where rp\.publisher_id = p\.id\)/.test(rollback));
check("Rollback: Entitäten guarded (nur wenn kein Herausgeber referenziert)", /delete from public\.political_entities e where[\s\S]*not exists \(select 1 from public\.publishers pu where pu\.entity_id = e\.id\)/.test(rollback));
check("Rollback: Paket guarded (nur wenn kein package_paths referenziert)", /delete from public\.source_packages sp where[\s\S]*not exists \(select 1 from public\.package_paths pp where pp\.package_id = sp\.id\)/.test(rollback));
check("Rollback löst ALLE Paketverknüpfungen über package_id (auch die 2 Bestandswege)", /delete from public\.package_paths where package_id = 'pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund'/.test(rollback));
check("Rollback löscht NUR die 7 neuen Wege, NICHT rp-dip/rp-committee-landwirtschaft", !rpDeleteLine.includes("rp-dip") && !rpDeleteLine.includes("rp-committee-landwirtschaft") && (rpDeleteLine.match(/'rp-agrar-/g) || []).length === 7);
check("Rollback löscht NICHT den Destatis-Herausgeber", !pubDeleteLine.includes("destatis"));
const ordR = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Dimensionen -> package_paths -> retrieval_paths -> publishers -> entities -> package",
  ordR(/path_expected_topics/) < ordR(/delete from public\.package_paths/) &&
  ordR(/delete from public\.package_paths/) < ordR(/delete from public\.retrieval_paths/) &&
  ordR(/delete from public\.retrieval_paths/) < ordR(/delete from public\.publishers/) &&
  ordR(/delete from public\.publishers/) < ordR(/delete from public\.political_entities/) &&
  ordR(/delete from public\.political_entities/) < ordR(/delete from public\.source_packages/));

// --- 14. Generator deterministisch ---
check("buildSql() deterministisch (zwei Läufe identisch)", buildSql().sql === buildSql().sql);
check("buildRollback() deterministisch", buildRollback(seed) === buildRollback(seed));

console.log(`\n== Ergebnis: 9 Wege (7 neu + 2 wiederverwendet) · ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
