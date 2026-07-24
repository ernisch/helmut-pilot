"use strict";

// Test des PREPARED-Seed-Generators fuer das Bund-Fachpaket 'Kultur, Medien und Sport (Bund)'
// (scripts/generate-kultur-medien-sport-seed.js). Prueft die SICHERHEITS- und WIEDERVERWENDUNGS-
// invarianten des erzeugten SQL: technisch inaktiv, prepared, idempotent, method-CHECK-konform,
// alle verbindlichen fachlichen Korrekturen 1-9, keine Dubletten, Rollback vollstaendig + guarded.
// REIN OFFLINE (kein Netz, keine DB) — wird vom Offline-Runner automatisch eingesammelt.

const { build, buildRollback } = require("./generate-kultur-medien-sport-seed");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

const { sql, seed } = build();
const rollback = buildRollback(seed);

// Hilfsfunktion: den VALUES-Block eines insert-Statements isolieren (bis 'do nothing;').
function block(table) {
  const start = sql.indexOf(`insert into public.${table} (`);
  if (start < 0) return "";
  const end = sql.indexOf("do nothing;", start);
  return sql.slice(start, end < 0 ? undefined : end);
}
const rpBlock = block("retrieval_paths");
const pubBlock = block("publishers");
const ppBlock = block("package_paths");
const pkgBlock = block("source_packages");

// --- 1. Zeilenzahlen ---
check("3 neue Entitaeten (BKM, Sport/Ehrenamt, NADA)", seed.entities.length === 3);
check("2 neue Herausgeber (BKM, NADA)", seed.publishers.length === 2);
check("1 neues Paket", seed.package && seed.package.id === "pkg-kultur-medien-und-sport-bund");
check("5 neue Abrufwege", seed.retrievalPaths.length === 5);
check("8 Paketzuordnungen (5 neu + 3 wiederverwendet)", seed.packagePaths.length === 8);
check("3 wiederverwendete Wege", seed.reusedPaths.length === 3);
check("5 path_expected_levels + 5 geographies + 5 entities", seed.pathExpectedLevels.length === 5 && seed.pathExpectedGeographies.length === 5 && seed.pathExpectedEntities.length === 5);
check("24 path_expected_topics", seed.pathExpectedTopics.length === 24);

// --- 2. Technisch INAKTIV (hart im SQL) ---
check("KEIN 'auto'/'always_on'/'healthy' im SQL", !/'auto'|'always_on'|'healthy'/.test(sql));
check("alle 5 Abrufwege needs_review + manual", (sql.match(/'needs_review', 'manual'/g) || []).length === 5);
check("Seed-Selbstpruefung: 0 aktive neue Wege", seed.retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length === 0);
check("alle neuen Wege needs_review + manual + is_critical=false", seed.retrievalPaths.every((p) => p.status === "needs_review" && p.activation_mode === "manual" && p.is_critical === false));

// --- 3. Paket prepared, is_base=false, kanonischer Key ---
check("Paket status='prepared'", seed.package.status === "prepared");
check("Paket is_base=false", seed.package.is_base === false);
check("kanonischer Paket-Key = kultur-medien-und-sport-bund", seed.package.key === "kultur-medien-und-sport-bund");
check("source_packages-Insert traegt 'prepared', false, 'bund'", /'prepared', false, 'bund', 'geo-bund'/.test(pkgBlock));

// --- 4. method-CHECK-konform + KEIN PDF (Korrektur 4) ---
const erlaubteMethoden = new Set(["rss", "api", "html", "googlenews_search", "structured_download"]);
check("alle method-Werte DB-CHECK-konform", seed.retrievalPaths.every((p) => erlaubteMethoden.has(p.method)));
check("alle neuen Wege googlenews_search (echter Herausgeber via site:)", seed.retrievalPaths.every((p) => p.method === "googlenews_search"));
check("KEIN structured_download / PDF-Weg (Korrektur 4: Sportbericht via DIP)", !/structured_download/.test(sql) && !/\.pdf/i.test(sql));

// --- 5. Idempotent + transaktional ---
check("9x ON CONFLICT DO NOTHING (nicht-destruktiv)", (sql.match(/on conflict \([^)]*\) do nothing/g) || []).length === 9);
check("begin + commit + notify pgrst", /begin;/.test(sql) && /commit;/.test(sql) && /notify pgrst/.test(sql));
check("Aliase als text[] gesetzt (Entitaeten)", /array\[.*\]::text\[\]/.test(block("political_entities")));

// --- 6. WIEDERVERWENDUNG statt Dublette (Auftrag §7) ---
// 6a: reused paths NUR in package_paths, NICHT als neuer retrieval_path.
check("rp-dip wiederverwendet (in package_paths, NICHT neu angelegt)", /rp-dip/.test(ppBlock) && !/'rp-dip'/.test(rpBlock));
check("rp-committee-kultur-medien wiederverwendet (nicht neu)", /rp-committee-kultur-medien/.test(ppBlock) && !/'rp-committee-kultur-medien'/.test(rpBlock));
check("rp-committee-sport wiederverwendet (nicht neu)", /rp-committee-sport/.test(ppBlock) && !/'rp-committee-sport'/.test(rpBlock));
// 6b: reused publishers referenziert, aber NICHT neu angelegt.
check("publisher-bundesregierung.de referenziert, NICHT neu angelegt", /publisher-bundesregierung\.de/.test(rpBlock) && !/publisher-bundesregierung\.de/.test(pubBlock));
check("publisher-destatis.de referenziert, NICHT neu angelegt", /publisher-destatis\.de/.test(rpBlock) && !/publisher-destatis\.de/.test(pubBlock));
check("nur 2 neue Herausgeber im publishers-Insert (BKM + NADA)", /publisher-kulturstaatsminister\.de/.test(pubBlock) && /publisher-nada\.de/.test(pubBlock) && (pubBlock.match(/'publisher-/g) || []).length === 2);

// --- 7. Verbindliche fachliche Korrekturen ---
// Korrektur 1: Sport != BKM, eigene Staatsministerin; via Bundesregierung-Publisher.
const sportPath = seed.retrievalPaths.find((p) => p.id === "rp-sport-ehrenamt-bund");
const sportEnt = seed.pathExpectedEntities.find((e) => e.retrieval_path_id === "rp-sport-ehrenamt-bund");
check("Korrektur 1: Sport-Weg haengt am Bundesregierung-Publisher (nicht BKM)", sportPath && sportPath.publisher_id === "publisher-bundesregierung.de");
check("Korrektur 1: Sport-Weg erwartet eigene Staatsministerin-Entitaet (nicht ministry-bkm)", sportEnt && sportEnt.entity_id === "government-sport-ehrenamt-bk");
check("Korrektur 1: eigene Sport/Ehrenamt-Entitaet angelegt", seed.entities.some((e) => e.id === "government-sport-ehrenamt-bk" && e.entity_type === "government"));
// Korrektur 2: KEIN neuer bundeskanzleramt.de-Publisher.
check("Korrektur 2: KEIN bundeskanzleramt.de im SQL", !/bundeskanzleramt/i.test(sql));
// Korrektur 3: Kulturfinanzbericht via bestehenden Destatis-Publisher.
const kfb = seed.retrievalPaths.find((p) => p.id === "rp-destatis-kulturfinanzbericht");
check("Korrektur 3: Kulturfinanzbericht-Weg am Destatis-Publisher", kfb && kfb.publisher_id === "publisher-destatis.de");
check("Korrektur 3: Query nennt Kulturfinanzbericht", kfb && /Kulturfinanzbericht/.test(kfb.query));
// Korrektur 4: bereits oben geprueft (kein PDF/structured_download); DIP deckt Sportbericht ab.
check("Korrektur 4: DIP als wiederverwendeter Weg fuer Berichte", seed.reusedPaths.some((r) => r.id === "rp-dip"));
// Korrektur 5: kein erfundener bundestag.de/ausschuesse/sport-Weg.
check("Korrektur 5: keine erfundene ausschuesse/sport-URL", !/ausschuesse\/sport/i.test(sql));
// Korrektur 6: BISp NICHT aufgenommen (Future Target).
check("Korrektur 6: BISp NICHT im SQL", !/bisp/i.test(sql));
check("Korrektur 6: BISp als Future Target dokumentiert", seed.futureTargets.some((f) => f.id === "bisp") && seed.summary.bispAufgenommen === false);
// Korrektur 7: NADA-Fokus Berichte/WADA/Regeln, KEINE operativen Dopingmeldungen.
const nada = seed.retrievalPaths.find((p) => p.id === "rp-nada-antidoping");
check("Korrektur 7: NADA-Query nennt Jahresbericht + WADA-Code", nada && /Jahresbericht/.test(nada.query) && /WADA/.test(nada.query));
check("Korrektur 7: NADA-Query meidet operative Einzelfaelle", nada && !/(Sperre|gesperrt|positiv|Dopingfall|Dopingprobe|Athlet)/i.test(nada.query));
// Korrektur 8: BKM in zwei Wege getrennt, ein Publisher.
const bkmPaths = seed.retrievalPaths.filter((p) => p.publisher_id === "publisher-kulturstaatsminister.de");
check("Korrektur 8: BKM in 2 Wege getrennt (Kultur + Medien/Film)", bkmPaths.length === 2 && bkmPaths.some((p) => p.id === "rp-bkm-kultur") && bkmPaths.some((p) => p.id === "rp-bkm-medien-film"));
check("Korrektur 8: beide BKM-Wege auf EINEM neuen Publisher", new Set(bkmPaths.map((p) => p.publisher_id)).size === 1);

// --- 8. Rollback vollstaendig, guarded, reuse-sicher ---
check("Rollback loescht alle 4 path_expected_* + package_paths + retrieval_paths + source_packages + publishers + entities",
  /path_expected_entities/.test(rollback) && /path_expected_topics/.test(rollback) && /path_expected_geographies/.test(rollback) && /path_expected_levels/.test(rollback) &&
  /delete from public\.package_paths/.test(rollback) && /delete from public\.retrieval_paths/.test(rollback) &&
  /delete from public\.source_packages/.test(rollback) && /delete from public\.publishers/.test(rollback) && /delete from public\.political_entities/.test(rollback));
const ord = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Kinder vor Eltern",
  ord(/path_expected_entities/) < ord(/delete from public\.package_paths/) &&
  ord(/delete from public\.package_paths/) < ord(/delete from public\.retrieval_paths/) &&
  ord(/delete from public\.retrieval_paths/) < ord(/delete from public\.publishers/) &&
  ord(/delete from public\.publishers/) < ord(/delete from public\.political_entities/));
// reuse-Sicherheit: Rollback loescht KEINE wiederverwendeten Wege/Herausgeber/Entitaeten.
const rpDeleteLine = (rollback.split("\n").find((l) => /delete from public\.retrieval_paths where id in/.test(l)) || "");
check("Rollback loescht KEINE wiederverwendeten Wege (rp-dip/rp-committee-*)", !/rp-dip|rp-committee/.test(rpDeleteLine));
const pubDeleteLine = (rollback.split("\n").find((l) => /delete from public\.publishers p where/.test(l)) || "");
check("Rollback loescht KEINE wiederverwendeten Herausgeber", !/bundesregierung|destatis/.test(pubDeleteLine));
const entDeleteLine = (rollback.split("\n").find((l) => /delete from public\.political_entities e where/.test(l)) || "");
check("Rollback loescht KEINE wiederverwendete Entitaet (statoffice-destatis/government-bund)", !/statoffice-destatis|government-bund/.test(entDeleteLine));
check("Rollback: package_paths nur ueber package_id (Wege bleiben in anderen Paketen)", /delete from public\.package_paths where package_id =/.test(rollback));
check("Rollback: Herausgeber guarded (not exists retrieval_paths)", /delete from public\.publishers[\s\S]*not exists[\s\S]*retrieval_paths/.test(rollback));
check("Rollback: Entitaeten guarded (not exists publishers + path_expected_entities)", /political_entities[\s\S]*not exists[\s\S]*publishers[\s\S]*not exists[\s\S]*path_expected_entities/.test(rollback));

console.log(`\n== Ergebnis: ${seed.retrievalPaths.length} neue Wege · ${seed.reusedPaths.length} wiederverwendet · ${fail === 0 ? "ALLE TESTS GRUEN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
