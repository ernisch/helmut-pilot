"use strict";

// Sprint 9B — Test des PREPARED-Seed-Generators (scripts/generate-landesmodul-seed.js).
// Prüft die SICHERHEITSINVARIANTEN des erzeugten SQL: technisch inaktiv, idempotent,
// method-CHECK-konform, 3 bot-gesperrte Parteiquellen nicht aktivierbar, Rollback vollständig.

const { build, buildRollback, klassifiziere, dbMethod } = require("./generate-landesmodul-seed");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

const { sql, seed } = build();
const rollback = buildRollback(seed);
const cls = klassifiziere(seed);

// --- 1. Zeilenzahlen (Seed) ---
check("4 neue Entitäten", seed.entities.length === 4);
check("14 Herausgeber", seed.publishers.length === 14);
check("18 Abrufwege", seed.retrievalPaths.length === 18);
check("19 Paketzuordnungen", seed.packagePaths.length === 19);
check("je Abrufweg genau 1 erwartete Ebene + 1 erwartete Geografie (Soll = retrievalPaths.length)",
  seed.pathExpectedLevels.length === seed.retrievalPaths.length && seed.pathExpectedGeographies.length === seed.retrievalPaths.length);

// --- 2. Technisch INAKTIV (hart im SQL) ---
// P1-Workflow-Haertung: Sollwerte aus dem Modell abgeleitet statt hart kodiert, damit der
// Test mitwaechst, falls der verifizierte Landesmodul-Seed spaeter Wege gewinnt/verliert.
check("KEIN 'auto'/'always_on'/'healthy' im SQL", !/'auto'|'always_on'|'healthy'/.test(sql));
const nManual = (sql.match(/'needs_review', 'manual'/g) || []).length;
check("JEDER Abrufweg needs_review + manual (Soll = seed.retrievalPaths.length)", nManual === seed.retrievalPaths.length);
check("Seed-Selbstprüfung: 0 aktive Wege", seed.retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length === 0);

// --- 3. method-CHECK-konform (opendata_xml -> structured_download) ---
const nStructured = seed.retrievalPaths.filter((p) => dbMethod(p.method) === "structured_download").length;
check("kein 'opendata_xml' im SQL (gemappt)", !/'opendata_xml'/.test(sql));
check("structured_download im SQL = Zahl der gemappten Open-Data-Wege (Soll aus Modell)", (sql.match(/'structured_download'/g) || []).length === nStructured);
check("dbMethod: opendata_xml -> structured_download", dbMethod("opendata_xml") === "structured_download" && dbMethod("rss") === "rss" && dbMethod("googlenews_search") === "googlenews_search");
const erlaubteMethoden = new Set(["rss", "api", "html", "googlenews_search", "structured_download"]);
check("alle method-Werte DB-CHECK-konform", seed.retrievalPaths.every((p) => erlaubteMethoden.has(dbMethod(p.method))));

// --- 4. Idempotent + transaktional + REIN ADDITIV ---
// Soll = Zahl der insert-Anweisungen: jedes insert ist ein additives ON CONFLICT DO NOTHING,
// kein Upsert-Overwrite, kein destruktives Statement.
const nInserts = (sql.match(/insert into public\./g) || []).length;
check("jedes insert ist ON CONFLICT DO NOTHING (rein additiv, Soll = Zahl der inserts)", (sql.match(/on conflict \([^)]*\) do nothing/g) || []).length === nInserts);
check("keine destruktive Anweisung im Seed (delete/drop/truncate/alter/do update)", !/\b(delete|drop|truncate|alter)\b|do update/i.test(sql));
check("begin + commit + notify pgrst", /begin;/.test(sql) && /commit;/.test(sql) && /notify pgrst/.test(sql));

// --- 5. Klassifikation ---
const byKat = cls.reduce((m, c) => { m[c.kategorie] = (m[c.kategorie] || 0) + 1; return m; }, {});
check("11 Google-News-Ersatzwege", byKat["Google-News-Ersatzweg"] === 11);
check("2 direkte Primärquellen (Open-Data)", byKat["direkte Primärquelle"] === 2);
check("2 journalistische Quellen (Tagesspiegel/rbb24)", byKat["journalistische Quelle"] === 2);
check("3 Partei-/Fraktionsquellen", byKat["Partei-/Fraktionsquelle (Eigeninteresse)"] === 3);

// --- 6. 3 Bot-gesperrte Parteiquellen: eingeschränkt + NICHT aktivierbar ---
const eingeschr = cls.filter((c) => c.eingeschraenkt).map((c) => c.id).sort();
check("genau 3 eingeschränkte Wege = die Bot-429-Parteifeeds", JSON.stringify(eingeschr) === JSON.stringify(["rp-bb-partei_pilot", "rp-be-fraktion_pilot", "rp-be-partei_pilot"]));
check("eingeschränkte Wege sind NICHT aktivierbar", cls.filter((c) => c.eingeschraenkt).every((c) => c.aktivierbar === false));
check("alle übrigen (21) sind aktivierbar", cls.filter((c) => !c.eingeschraenkt).every((c) => c.aktivierbar === true));

// --- 7. Rollback vollständig + dependency-korrekt ---
check("Rollback löscht path_expected_geographies + levels + package_paths + retrieval_paths + publishers + political_entities",
  /path_expected_geographies/.test(rollback) && /path_expected_levels/.test(rollback) && /package_paths/.test(rollback) &&
  /delete from public\.retrieval_paths/.test(rollback) && /delete from public\.publishers/.test(rollback) && /delete from public\.political_entities/.test(rollback));
// Reihenfolge: Kinder vor Eltern (geographies vor retrieval_paths vor publishers vor entities)
const ord = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Kinder vor Eltern", ord(/path_expected_geographies/) < ord(/delete from public\.retrieval_paths/) && ord(/delete from public\.retrieval_paths/) < ord(/delete from public\.publishers/) && ord(/delete from public\.publishers/) < ord(/delete from public\.political_entities/));

console.log(`\n== Ergebnis: ${cls.length + 0} Wege · ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
