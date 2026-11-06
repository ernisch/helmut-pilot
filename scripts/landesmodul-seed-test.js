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
check("15 Herausgeber (MAZ und LR getrennt)", seed.publishers.length === 15);
check("19 Abrufwege (LR als eigener Kandidat)", seed.retrievalPaths.length === 19);
check("20 Paketzuordnungen", seed.packagePaths.length === 20);
check("19 Ebenen + 20 Geografien (rbb für beide Länder)", seed.pathExpectedLevels.length === 19 && seed.pathExpectedGeographies.length === 20);

// --- 2. Technisch INAKTIV (hart im SQL) ---
check("KEIN 'auto'/'always_on'/'healthy' im SQL", !/'auto'|'always_on'|'healthy'/.test(sql));
const nManual = (sql.match(/'needs_review', 'manual'/g) || []).length;
check("alle Abrufwege needs_review + manual", nManual === seed.retrievalPaths.length);
check("Seed-Selbstprüfung: 0 aktive Wege", seed.retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length === 0);

// --- 3. method-CHECK-konform (opendata_xml -> structured_download) ---
check("kein 'opendata_xml' im SQL (gemappt)", !/'opendata_xml'/.test(sql));
check("structured_download vorhanden (2x Open-Data)", (sql.match(/'structured_download'/g) || []).length === 2);
check("dbMethod: opendata_xml -> structured_download", dbMethod("opendata_xml") === "structured_download" && dbMethod("rss") === "rss" && dbMethod("googlenews_search") === "googlenews_search");
const erlaubteMethoden = new Set(["rss", "api", "html", "googlenews_search", "structured_download"]);
check("alle method-Werte DB-CHECK-konform", seed.retrievalPaths.every((p) => erlaubteMethoden.has(dbMethod(p.method))));

// --- 4. Idempotent + transaktional ---
check("ON CONFLICT DO NOTHING (nicht-destruktiv, überschreibt nichts)", (sql.match(/on conflict \([^)]*\) do nothing/g) || []).length === 6);
check("begin + commit + notify pgrst", /begin;/.test(sql) && /commit;/.test(sql) && /notify pgrst/.test(sql));

// --- 5. Klassifikation ---
const byKat = cls.reduce((m, c) => { m[c.kategorie] = (m[c.kategorie] || 0) + 1; return m; }, {});
check("12 Google-News-Suchkandidaten", byKat["Google-News-Ersatzweg"] === 12);
check("2 direkte Primärquellen (Open-Data)", byKat["direkte Primärquelle"] === 2);
check("2 journalistische Quellen (Tagesspiegel/rbb24)", byKat["journalistische Quelle"] === 2);
check("3 Partei-/Fraktionsquellen", byKat["Partei-/Fraktionsquelle (Eigeninteresse)"] === 3);

// --- 6. 3 Bot-gesperrte Parteiquellen: eingeschränkt + NICHT aktivierbar ---
const eingeschr = cls.filter((c) => c.eingeschraenkt).map((c) => c.id).sort();
check("genau 3 eingeschränkte Wege = die Bot-429-Parteifeeds", JSON.stringify(eingeschr) === JSON.stringify(["rp-bb-partei_pilot", "rp-be-fraktion_pilot", "rp-be-partei_pilot"]));
check("eingeschränkte Wege sind NICHT aktivierbar", cls.filter((c) => c.eingeschraenkt).every((c) => c.aktivierbar === false));
check("nur explizit geeignete Wege gelten im historischen Bericht als aktivierbar",
  cls.every((c) => c.aktivierbar === (c.urteil === "geeignet")));
check("neuer LR-Suchkandidat ohne Altbeleg bleibt nicht aktivierbar",
  cls.some((c) => c.id === "rp-bb-regionale-leitmedien-lr" && !c.urteil && c.aktivierbar === false));

// --- 7. Rollback vollständig + dependency-korrekt ---
check("Rollback löscht path_expected_geographies + levels + package_paths + retrieval_paths + publishers + political_entities",
  /path_expected_geographies/.test(rollback) && /path_expected_levels/.test(rollback) && /package_paths/.test(rollback) &&
  /delete from public\.retrieval_paths/.test(rollback) && /delete from public\.publishers/.test(rollback) && /delete from public\.political_entities/.test(rollback));
// Reihenfolge: Kinder vor Eltern (geographies vor retrieval_paths vor publishers vor entities)
const ord = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Kinder vor Eltern", ord(/path_expected_geographies/) < ord(/delete from public\.retrieval_paths/) && ord(/delete from public\.retrieval_paths/) < ord(/delete from public\.publishers/) && ord(/delete from public\.publishers/) < ord(/delete from public\.political_entities/));

console.log(`\n== Ergebnis: ${cls.length + 0} Wege · ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
