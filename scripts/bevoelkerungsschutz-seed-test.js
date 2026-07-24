"use strict";

// Test des PREPARED-Seed-Generators fuer 'bevoelkerungsschutz-katastrophenschutz-bund'
// (scripts/generate-bevoelkerungsschutz-seed.js). Prueft die SICHERHEITSINVARIANTEN des
// erzeugten SQL: Paket + alle neuen Wege technisch INAKTIV, idempotent, method-CHECK-konform,
// additive Wiederverwendung bestehender Wege ohne Aenderung, guarded Rollback ohne Kollateral-
// loeschung geteilter Bestandsobjekte, saubere Abgrenzung zu Nachbarpaketen.

const { build, buildRollback, klassifiziere } = require("./generate-bevoelkerungsschutz-seed");
const { buildBevoelkerungsschutzSeed } = require("../lib/helmut/quellenarchitektur/seeds/bevoelkerungsschutz-quellen");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

const { sql, seed } = build();
const rollback = buildRollback(seed);
const cls = klassifiziere(seed);
const model = buildBevoelkerungsschutzSeed();

// Bekannte BESTEHENDE Ids, die wiederverwendet (nicht dupliziert) werden.
const BESTEHENDE_ENTITAETEN = ["ministry-bmi", "authority-bundesrechnungshof", "parliament-bundestag", "parliament-bundesrat", "government-bund", "committee-bt-inneres"];
const BESTEHENDE_WEGE = ["rp-dip", "rp-committee-inneres"];

// --- 1. Zeilenzahlen ---
check("1 Quellenpaket", !!seed.package && seed.package.id === "pkg-bevoelkerungsschutz-katastrophenschutz-bund");
check("3 neue Entitaeten (BBK, THW, IMK)", seed.entities.length === 3);
check("5 Herausgeber-Zeilen (4 neu + BRH bestehend)", seed.publishers.length === 5 && seed.summary.neuePublisher === 4);
check("7 neue Abrufwege", seed.retrievalPaths.length === 7);
check("9 Paketzuordnungen (7 neu + 2 wiederverwendet)", seed.packagePaths.length === 9);
check("7 path_expected_levels + 7 path_expected_geographies", seed.pathExpectedLevels.length === 7 && seed.pathExpectedGeographies.length === 7);

// --- 2. Paket + alle neuen Wege technisch INAKTIV (hart im SQL) ---
check("Paket status='prepared' (nie active)", seed.package.status === "prepared" && /'prepared'/.test(sql) && !/'pkg-bevoelkerungsschutz[^)]*'active'/.test(sql));
check("Paket ist NICHT is_base, Bund, geo-bund", seed.package.is_base === false && seed.package.political_level === "bund" && seed.package.geography_id === "geo-bund");
// Der retrieval_paths-Insert-Block darf kein auto/always_on/healthy enthalten.
const rpBlock = sql.slice(sql.indexOf("insert into public.retrieval_paths"), sql.indexOf("-- 5)"));
check("KEIN 'auto'/'always_on'/'healthy' im retrieval_paths-Block", !/'auto'|'always_on'|'healthy'/.test(rpBlock));
const nManual = (sql.match(/'needs_review', 'manual'/g) || []).length;
check("alle 7 neuen Wege needs_review + manual", nManual === 7);
check("Seed-Selbstpruefung: 0 aktive neue Wege", seed.summary.aktiveNeueWege === 0);
check("kein neuer Weg healthy/auto/always_on im Modell", seed.retrievalPaths.every((p) => p.status === "needs_review" && p.activation_mode === "manual"));

// --- 3. method/Parser CHECK-konform + keine erfundenen Direkt-Endpunkte ---
const erlaubteMethoden = new Set(["rss", "api", "html", "googlenews_search", "structured_download"]);
check("alle neuen Wege method 'googlenews_search'", seed.retrievalPaths.every((p) => p.method === "googlenews_search" && erlaubteMethoden.has(p.method)));
check("alle neuen Wege Parser 'googlenews-batchexecute'", seed.retrievalPaths.every((p) => p.parser === "googlenews-batchexecute"));
check("keine erfundenen Feed-Endpunkte: alle URLs -> news.google.com/rss/search", seed.retrievalPaths.every((p) => /^https:\/\/news\.google\.com\/rss\/search\?q=/.test(p.url)));
check("jede Suchdefinition ist site:-scoped auf die eigene Institution", seed.retrievalPaths.every((p) => /(^|\s)site:[a-z.]+/.test(p.query)));

// --- 4. Idempotent + transaktional ---
check("ON CONFLICT DO NOTHING (7 Inserts, nicht-destruktiv)", (sql.match(/on conflict \([^)]*\) do nothing/g) || []).length === 7);
check("begin + commit + notify pgrst", /begin;/.test(sql) && /commit;/.test(sql) && /notify pgrst/.test(sql));

// --- 5. Additive Wiederverwendung bestehender Wege (NICHT neu angelegt, NICHT geaendert) ---
const neueWegIds = new Set(seed.retrievalPaths.map((p) => p.id));
check("rp-dip + rp-committee-inneres NICHT als neue Wege angelegt", BESTEHENDE_WEGE.every((id) => !neueWegIds.has(id)));
check("beide bestehenden Wege sind additiv dem Paket zugeordnet", BESTEHENDE_WEGE.every((id) => seed.packagePaths.some((pp) => pp.retrieval_path_id === id && pp.package_id === seed.package.id)));
check("Wiederverwendung exakt = [rp-dip, rp-committee-inneres]", JSON.stringify(seed.reusedPaths.map((r) => r.id).sort()) === JSON.stringify([...BESTEHENDE_WEGE].sort()));
// Der Seed darf KEINEN UPDATE/DELETE auf bestehende Wege enthalten (nur INSERT ... DO NOTHING).
check("kein update/delete auf bestehende Objekte im Seed", !/\bupdate\b|\bdelete\b/i.test(sql));

// --- 6. Keine Dubletten / Kollisionen ---
const newPubIds = seed.publishers.filter((p) => p.neu).map((p) => p.id);
const newPubDomains = seed.publishers.filter((p) => p.neu).map((p) => p.canonical_domain);
check("neue Herausgeber-Ids kollidieren nicht mit bestehendem BRH", !newPubIds.includes("publisher-bundesrechnungshof.de"));
check("keine doppelte Herausgeber-Domain unter neuen", new Set(newPubDomains).size === newPubDomains.length);
check("keine Entitaets-Dublette: neue Entitaeten sind NICHT bereits bestehende", seed.entities.every((e) => !BESTEHENDE_ENTITAETEN.includes(e.id)));
check("BMI/BRH werden als Entitaet WIEDERVERWENDET, nicht neu angelegt", !seed.entities.some((e) => e.id === "ministry-bmi" || e.id === "authority-bundesrechnungshof"));
check("BMI-Herausgeber verweist auf bestehende Entitaet ministry-bmi", seed.publishers.some((p) => p.id === "publisher-bmi.bund.de" && p.entity_id === "ministry-bmi"));
check("keine doppelten Weg-Ids", new Set(seed.retrievalPaths.map((p) => p.id)).size === seed.retrievalPaths.length);

// --- 7. Entitaets-Typisierung (Institution vs. Programm/Produkt/Gesetz getrennt) ---
const entById = new Map(seed.entities.map((e) => [e.id, e]));
check("BBK = authority", entById.get("authority-bbk")?.entity_type === "authority");
check("THW = authority (Bundesanstalt)", entById.get("authority-thw")?.entity_type === "authority");
check("IMK = other_institution (Bund-Laender-Gremium, keine Behoerde)", entById.get("institution-imk")?.entity_type === "other_institution");
// KEINE Personen als Entitaet.
check("keine Person-Entitaet modelliert", !seed.entities.some((e) => e.entity_type === "person"));
// KEINE Produkte/Gesetze/Programme als Publisher/Entitaet (nur als Suchbegriffe erlaubt).
const verboteneInstitutionen = /(NINA|MoWaS|Cell Broadcast|LÜKEX|LUEKEX|PiB-16|ZSKG|KRITIS-Dachgesetz|Warntag|\bPakt\b)/i;
check("kein Produkt/Gesetz/Programm als neue Entitaet", !seed.entities.some((e) => verboteneInstitutionen.test(e.name)));
check("kein Produkt/Gesetz/Programm als neuer Herausgeber", !seed.publishers.filter((p) => p.neu).some((p) => verboteneInstitutionen.test(p.name)));

// --- 8. Abgrenzung zu Nachbarpaketen (keine fremden Institutionen) ---
const fremd = /\b(BKA|Bundeskriminalamt|Bundespolizei|Verfassungsschutz|BSI|DWD|RKI|Bundesnetzagentur|BNetzA|BLE|BfS|Bundeswehr)\b/i;
check("keine fremde Institution als neue Entitaet (Innere Sicherheit/Cyber/DWD/RKI/...)", !seed.entities.some((e) => fremd.test(e.name)));
check("keine fremde Institution als neuer Herausgeber", !seed.publishers.filter((p) => p.neu).some((p) => fremd.test(p.name) || fremd.test(p.canonical_domain)));
check("Paketzweck grenzt Innere Sicherheit ausdruecklich ab", /innere-sicherheit-bund/.test(seed.package.purpose) && /rein zivil/i.test(seed.package.purpose));

// --- 9. Tiering (~7-10 Wege, max 4-5 neue Publisher) ---
check("Wege gesamt 9 (im Zielkorridor 7-10)", seed.summary.wegeGesamt === 9 && seed.summary.wegeGesamt >= 7 && seed.summary.wegeGesamt <= 10);
check("neue Publisher = 4 (<= 5)", seed.summary.neuePublisher === 4 && seed.summary.neuePublisher <= 5);
check("Tier-Verteilung 5/3/1 (Summe 9)", seed.summary.tier1 === 5 && seed.summary.tier2 === 3 && seed.summary.tier3 === 1 && (seed.summary.tier1 + seed.summary.tier2 + seed.summary.tier3) === 9);
check("Tier-1-kritische neue Wege genau BMI/BBK-Strategie/IMK", JSON.stringify(seed.retrievalPaths.filter((p) => p.is_critical).map((p) => p.id).sort()) === JSON.stringify(["rp-bevschutz-bbk-strategie-risiko", "rp-bevschutz-bmi-strategie", "rp-bevschutz-imk-beschluesse"]));

// --- 10. Guarded Rollback (child-first, keine Kollateralloeschung) ---
check("Rollback loescht path_expected_* + package_paths(pkg) + retrieval_paths + source_packages + publishers + political_entities",
  /path_expected_geographies/.test(rollback) && /path_expected_levels/.test(rollback) &&
  /delete from public\.package_paths where package_id = 'pkg-bevoelkerungsschutz-katastrophenschutz-bund'/.test(rollback) &&
  /delete from public\.retrieval_paths/.test(rollback) && /delete from public\.source_packages/.test(rollback) &&
  /delete from public\.publishers/.test(rollback) && /delete from public\.political_entities/.test(rollback));
const ord = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Kinder vor Eltern",
  ord(/path_expected_geographies/) < ord(/delete from public\.retrieval_paths/) &&
  ord(/delete from public\.retrieval_paths/) < ord(/delete from public\.source_packages/) &&
  ord(/delete from public\.source_packages/) < ord(/delete from public\.publishers/) &&
  ord(/delete from public\.publishers/) < ord(/delete from public\.political_entities/));
check("Herausgeber-Loeschung guarded (nur wenn kein Weg referenziert)", /delete from public\.publishers p where[\s\S]*not exists \(select 1 from public\.retrieval_paths rp where rp\.publisher_id = p\.id\)/.test(rollback));
check("Entitaets-Loeschung guarded (nur wenn kein Herausgeber referenziert)", /delete from public\.political_entities e where[\s\S]*not exists \(select 1 from public\.publishers pu where pu\.entity_id = e\.id\)/.test(rollback));
// Rollback darf ministry-bmi / authority-bundesrechnungshof NICHT in der Entitaets-Loeschung listen.
const entDeleteLine = (rollback.match(/delete from public\.political_entities e where e\.id in \(([^)]*)\)/) || [])[1] || "";
check("Rollback loescht NUR die 3 neuen Entitaeten (BMI/BRH nicht gelistet)",
  /authority-bbk/.test(entDeleteLine) && /authority-thw/.test(entDeleteLine) && /institution-imk/.test(entDeleteLine) &&
  !/ministry-bmi/.test(entDeleteLine) && !/authority-bundesrechnungshof/.test(entDeleteLine));
// publisher-bundesrechnungshof.de IST in der (guarded) Herausgeber-Loeschung, aber durch die
// Guard geschuetzt (rp-institution-bundesrechnungshof-soziales referenziert ihn weiter).
check("BRH-Herausgeber ist guarded gelistet (Guard schuetzt ihn vor Loeschung)", /publisher-bundesrechnungshof\.de/.test(rollback));

console.log(`\n== Ergebnis: ${cls.length} Wege (${seed.retrievalPaths.length} neu + ${seed.reusedPaths.length} wiederverwendet) · ${fail === 0 ? "ALLE TESTS GRUEN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
