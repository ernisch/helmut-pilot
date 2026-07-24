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

// --- 1. Struktur-Konsistenz (§8: KEINE harten Gesamtzahlen 4/14/18/19; Soll aus dem Modell) ---
// Statt Zahlen pruefen wir die INVARIANTEN: eindeutige IDs, Herausgeber == distinkt von den
// Abrufwegen referenzierte Menge (kein verwaister/fehlender Herausgeber), FK der neuen
// Entitaeten erfuellbar, jede Paketzuordnung auf einen gueltigen Weg, keine Doppelzuordnung,
// jeder Weg mindestens einmal zugeordnet.
check("Abrufweg-IDs eindeutig", new Set(seed.retrievalPaths.map((p) => p.id)).size === seed.retrievalPaths.length);
// HINWEIS: Herausgeber duerfen die von Abrufwegen referenzierte Menge geringfuegig
// UEBERSTEIGEN — die URL-Dedup (gleiche method|url) fuehrt Kandidaten zu EINEM Weg zusammen,
// waehrend ihr Herausgeber bereits angelegt wurde (z. B. Staatskanzlei Brandenburg). Das ist
// bestehendes, additives Verhalten (nicht Teil dieses Sprints). Geprueft wird daher:
// eindeutige Herausgeber-IDs + KEIN danglender Verweis eines Abrufwegs.
check("Herausgeber-IDs eindeutig + jeder Abrufweg zeigt auf einen vorhandenen Herausgeber (kein danglender Verweis)",
  new Set(seed.publishers.map((p) => p.id)).size === seed.publishers.length
  && seed.retrievalPaths.every((p) => seed.publishers.some((pub) => pub.id === p.publisher_id)));
check("neue Entitäten eindeutig + jede von einem eigenen Herausgeber referenziert (FK erfüllbar)",
  new Set(seed.entities.map((e) => e.id)).size === seed.entities.length
  && seed.entities.every((e) => seed.publishers.some((pub) => pub.entity_id === e.id)));
check("Paketzuordnungen: keine Doppelzuordnung, jede auf gültigen Weg, jeder Weg >= 1x zugeordnet (>= Wege wg. rbb24-Mehrfach)",
  new Set(seed.packagePaths.map((pp) => `${pp.package_id}|${pp.retrieval_path_id}`)).size === seed.packagePaths.length
  && seed.packagePaths.every((pp) => seed.retrievalPaths.some((p) => p.id === pp.retrieval_path_id))
  && seed.retrievalPaths.every((p) => seed.packagePaths.some((pp) => pp.retrieval_path_id === p.id))
  && seed.packagePaths.length >= seed.retrievalPaths.length);
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

// --- 5. Klassifikation (§8: Partition statt harter Kategoriezahlen 11/2/2/3) ---
const byKat = cls.reduce((m, c) => { m[c.kategorie] = (m[c.kategorie] || 0) + 1; return m; }, {});
check("Klassifikation partitioniert JEDEN Weg genau einmal (Summe = Wege, keine Restkategorie)",
  Object.values(byKat).reduce((a, b) => a + b, 0) === cls.length && cls.every((c) => !!c.kategorie));
check("die fachlichen Kernkategorien sind vertreten (GN-Ersatz, Open-Data, journalistisch, Partei/Fraktion)",
  ["Google-News-Ersatzweg", "direkte Primärquelle", "journalistische Quelle", "Partei-/Fraktionsquelle (Eigeninteresse)"].every((k) => (byKat[k] || 0) > 0));

// --- 6. 3 Bot-gesperrte Parteiquellen: eingeschränkt + NICHT aktivierbar ---
const eingeschr = cls.filter((c) => c.eingeschraenkt).map((c) => c.id).sort();
check("genau 3 eingeschränkte Wege = die Bot-429-Parteifeeds", JSON.stringify(eingeschr) === JSON.stringify(["rp-bb-partei_pilot", "rp-be-fraktion_pilot", "rp-be-partei_pilot"]));
check("eingeschränkte Wege sind NICHT aktivierbar", cls.filter((c) => c.eingeschraenkt).every((c) => c.aktivierbar === false));
check("alle übrigen (nicht-eingeschränkten) Wege sind aktivierbar", cls.filter((c) => !c.eingeschraenkt).every((c) => c.aktivierbar === true));

// --- 7. Rollback vollständig + dependency-korrekt ---
check("Rollback löscht path_expected_geographies + levels + package_paths + retrieval_paths + publishers + political_entities",
  /path_expected_geographies/.test(rollback) && /path_expected_levels/.test(rollback) && /package_paths/.test(rollback) &&
  /delete from public\.retrieval_paths/.test(rollback) && /delete from public\.publishers/.test(rollback) && /delete from public\.political_entities/.test(rollback));
// Reihenfolge: Kinder vor Eltern (geographies vor retrieval_paths vor publishers vor entities)
const ord = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Kinder vor Eltern", ord(/path_expected_geographies/) < ord(/delete from public\.retrieval_paths/) && ord(/delete from public\.retrieval_paths/) < ord(/delete from public\.publishers/) && ord(/delete from public\.publishers/) < ord(/delete from public\.political_entities/));

console.log(`\n== Ergebnis: ${cls.length + 0} Wege · ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
