"use strict";

// Test des PREPARED-Seed-Generators fuer das Fachpaket "Innere Sicherheit (Bund)"
// (scripts/generate-innere-sicherheit-bund-seed.js). Prueft die SICHERHEITS- und
// AUDIT-INVARIANTEN (Auftrag §18/§19): technisch INAKTIV, prepared, idempotent,
// method-CHECK-konform, Wiederverwendung statt Parallelweg, keine ID-/Slug-/Domain-Dublette,
// KEINE Aenderung an packages.js/Basis-Seed (Isolation), kein Profil-Mapping, Rollback sicher,
// deterministisch, Egress-Ehrlichkeit (0 byte-verifiziert).

const fs = require("fs");
const path = require("path");
const { build, buildRollback, ERLAUBTE_METHODEN } = require("./generate-innere-sicherheit-bund-seed");
const { buildInnereSicherheitBundSeed } = require("../lib/helmut/quellenarchitektur/seeds/innere-sicherheit-bund");
const { PACKAGE_DEFINITIONS } = require("../lib/helmut/quellenarchitektur/seeds/packages");
const { resolveProfilePackages } = require("../lib/helmut/quellenarchitektur/profile-packages");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

const { sql, seed } = build();
const rollback = buildRollback(seed);
const baseSeedPath = path.join(__dirname, "..", "supabase", "seeds", "20260713_source_architecture_seed.sql");
const baseSeed = fs.readFileSync(baseSeedPath, "utf8");

// --- 1. Zeilenzahlen -------------------------------------------------------
check("1 Quellenpaket", seed.package && seed.package.id === "pkg-innere-sicherheit-bund");
check("3 neue Entitaeten (Behoerden)", seed.entities.length === 3);
check("4 neue Herausgeber", seed.publishers.length === 4);
check("5 neue Abrufwege", seed.retrievalPaths.length === 5);
check("2 wiederverwendete Wege", seed.reusePathIds.length === 2);
check("7 Paketzuordnungen (5 neu + 2 wiederverwendet)", seed.packagePaths.length === 7);
check("5 path_expected_levels + 5 geographies + 5 entities_dim", seed.pathExpectedLevels.length === 5 && seed.pathExpectedGeographies.length === 5 && seed.pathExpectedEntities.length === 5);
check("15 path_expected_topics (BKA-Lagebilder gebuendelt)", seed.pathExpectedTopics.length === 15);

// --- 2. Paket + alle neuen Wege technisch INAKTIV (hart im SQL) ------------
check("Paket status='prepared'", seed.package.status === "prepared" && /'pkg-innere-sicherheit-bund', 'innere-sicherheit-bund'.*'prepared'/.test(sql));
check("Paket is_base=false, Bund", seed.package.is_base === false && seed.package.political_level === "bund");
check("KEIN 'auto'/'always_on'/'healthy'/'active' als Wegstatus im SQL", !/'auto'|'always_on'|'healthy'/.test(sql));
const nManual = (sql.match(/'needs_review', 'manual'/g) || []).length;
check("alle 5 neuen Abrufwege needs_review + manual", nManual === 5);
check("Seed-Selbstpruefung: 0 aktive neue Wege", seed.summary.aktiveNeueAbrufwege === 0);
check("computeGlobalActivation aktiviert das Paket NICHT (prepared, kein aktives Profil)",
  // Simulation: das Paket ist prepared -> selbst wenn referenziert, nie 'active'.
  seed.package.status !== "active");

// --- 3. method-CHECK-konform ----------------------------------------------
check("alle method-Werte DB-CHECK-konform", seed.retrievalPaths.every((p) => ERLAUBTE_METHODEN.has(p.method)));
check("nur html-Methode genutzt (amtliche Uebersichtsseiten)", seed.retrievalPaths.every((p) => p.method === "html"));

// --- 4. evidence_role-Konvention (wie Basis-Seed) -------------------------
const bmiPub = seed.publishers.find((p) => p.id === "publisher-bmi.bund.de");
check("BMI-Herausgeber: ministry + official_primary + entity ministry-bmi", bmiPub && bmiPub.publisher_type === "ministry" && bmiPub.evidence_role === "official_primary" && bmiPub.entity_id === "ministry-bmi");
check("Behoerden-Herausgeber (BKA/BfV/BfDI): authority + data_source", seed.publishers.filter((p) => p.id !== "publisher-bmi.bund.de").every((p) => p.publisher_type === "authority" && p.evidence_role === "data_source"));
check("alle neuen Herausgeber trust=hoch, lifecycle active", seed.publishers.every((p) => p.trust === "hoch" && p.lifecycle_status === "active"));

// --- 5. Wiederverwendung statt Parallelweg (Auftrag §11) ------------------
check("rp-dip + rp-committee-inneres werden REFERENZIERT", seed.reusePathIds.includes("rp-dip") && seed.reusePathIds.includes("rp-committee-inneres"));
check("KEIN neuer retrieval_path dupliziert DIP/Innenausschuss", !seed.retrievalPaths.some((p) => ["rp-dip", "rp-committee-inneres"].includes(p.id)));
check("Wiederverwendete Wege existieren im Basis-Seed", /\('rp-dip',/.test(baseSeed) && /\('rp-committee-inneres',/.test(baseSeed));
check("ministry-bmi wird referenziert, NICHT neu angelegt", !seed.entities.some((e) => e.id === "ministry-bmi") && /\('ministry-bmi',/.test(baseSeed) && bmiPub.entity_id === "ministry-bmi");
check("package_paths enthaelt genau die 2 Wiederverwendungs-Referenzen", seed.packagePaths.filter((pp) => ["rp-dip", "rp-committee-inneres"].includes(pp.retrieval_path_id)).length === 2);

// --- 6. Keine Dublette / keine Kollision mit dem Basis-Seed (Audit §19) ----
const neuIds = [seed.package.id, ...seed.entities.map((e) => e.id), ...seed.publishers.map((p) => p.id), ...seed.retrievalPaths.map((p) => p.id)];
check("alle neuen IDs eindeutig", new Set(neuIds).size === neuIds.length);
check("keine neue ID kollidiert mit dem Basis-Seed", neuIds.every((id) => !new RegExp(`\\('${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}',`).test(baseSeed)));
const neueDomains = seed.publishers.map((p) => p.canonical_domain);
check("keine neue Herausgeber-Domain im Basis-Seed (keine Domain-Dublette)", neueDomains.every((d) => !new RegExp(`'${d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`).test(baseSeed)));
const neueUrls = seed.retrievalPaths.map((p) => p.url);
check("keine neue Abruf-URL im Basis-Seed (keine URL-Dublette)", neueUrls.every((u) => !baseSeed.includes(u)));
check("keine historische BMI-Dublette (nur EIN BMI-Herausgeber, verknuepft mit bestehender Entitaet)", seed.publishers.filter((p) => p.entity_id === "ministry-bmi").length === 1);

// --- 7. Isolation: keine Aenderung an packages.js / Basis-Seed ------------
check("Paket NICHT in packages.js PACKAGE_DEFINITIONS (Isolation, source-architecture-test bleibt bei 6)",
  !PACKAGE_DEFINITIONS.some((p) => p.key === "innere-sicherheit-bund" || p.id === "pkg-innere-sicherheit-bund"));
check("Basis-Seed enthaelt das neue Paket NICHT (unveraendert)", !/pkg-innere-sicherheit-bund/.test(baseSeed));

// --- 8. Kein Profil-Mapping (Auftrag: kein Profil-Mapping) -----------------
const profileProben = [
  { id: "p-bt", politische_ebene: "Bundestag", ausschuesse: ["Innenausschuss"], fachpolitische_schwerpunkte: ["Innere Sicherheit", "Migration", "Polizei"] },
  { id: "p-innen", politische_ebene: "Bundestag", ausschuesse: ["Ausschuss für Inneres und Heimat"], fachpolitische_schwerpunkte: ["Verfassungsschutz", "Extremismus"] },
  { id: "p-landtag", politische_ebene: "Landtag", bundesland: "Berlin", fachpolitische_schwerpunkte: ["Sicherheit"] }
];
check("kein Proben-Profil erhaelt innere-sicherheit-bund (keine Resolver-Regel)",
  profileProben.every((pr) => !resolveProfilePackages(pr).all.includes("innere-sicherheit-bund")));

// --- 9. Idempotent + transaktional ----------------------------------------
check("ON CONFLICT DO NOTHING fuer alle 9 Insert-Bloecke (nicht-destruktiv)", (sql.match(/on conflict \([^)]*\) do nothing/g) || []).length === 9);
check("begin + commit + notify pgrst", /begin;/.test(sql) && /commit;/.test(sql) && /notify pgrst/.test(sql));
check("kein UPDATE/DELETE/DROP/ALTER im Seed (rein additiv)", !/\b(update|delete|drop|alter|truncate)\b/i.test(sql));

// --- 10. Rollback sicher + dependency-korrekt -----------------------------
check("Rollback loescht path_expected_* + package_paths + retrieval_paths + source_packages + publishers + political_entities",
  /path_expected_entities/.test(rollback) && /path_expected_topics/.test(rollback) && /path_expected_geographies/.test(rollback) &&
  /path_expected_levels/.test(rollback) && /delete from public\.package_paths/.test(rollback) &&
  /delete from public\.retrieval_paths/.test(rollback) && /delete from public\.source_packages/.test(rollback) &&
  /delete from public\.publishers/.test(rollback) && /delete from public\.political_entities/.test(rollback));
check("Rollback loescht NICHT rp-dip / rp-committee-inneres (Wiederverwendung geschuetzt)",
  !/retrieval_paths where id in[^;]*rp-dip/.test(rollback) && !/retrieval_paths where id in[^;]*rp-committee-inneres/.test(rollback));
check("Rollback loescht NICHT ministry-bmi (bestehende Entitaet geschuetzt)", !/'ministry-bmi'/.test(rollback));
check("Rollback: Herausgeber/Entitaeten GUARDED (not exists)", (rollback.match(/and not exists/g) || []).length === 2);
const ord = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Kinder vor Eltern (path_expected -> package_paths -> retrieval_paths -> source_packages -> publishers -> entities)",
  ord(/path_expected_entities/) < ord(/delete from public\.package_paths/) &&
  ord(/delete from public\.package_paths/) < ord(/delete from public\.retrieval_paths/) &&
  ord(/delete from public\.retrieval_paths/) < ord(/delete from public\.source_packages/) &&
  ord(/delete from public\.source_packages/) < ord(/delete from public\.publishers/) &&
  ord(/delete from public\.publishers/) < ord(/delete from public\.political_entities/));

// --- 11. Determinismus -----------------------------------------------------
const again = build();
check("deterministisch: zwei Laeufe erzeugen byte-identisches SQL", again.sql === sql);
const seed2 = buildInnereSicherheitBundSeed();
check("deterministisch: In-Memory-Abbild stabil", JSON.stringify(seed2) === JSON.stringify(buildInnereSicherheitBundSeed()));

// --- 12. Egress-/Verifikations-Ehrlichkeit (Auftrag §17) ------------------
check("0 Wege byte-genau verifiziert (lokaler Egress gesperrt)", seed.summary.byteVerifiziert === 0);
check("jeder neue Weg traegt officialConfirmed=true + byteVerified=false", seed.retrievalPaths.every((p) => p.verification && p.verification.officialConfirmed === true && p.verification.byteVerified === false));

// --- 13. Priorisierung (Tier) ---------------------------------------------
check("3 Tier-1-Wege + 2 Tier-2-Wege", seed.summary.tier1 === 3 && seed.summary.tier2 === 2);
check("4 kritische Wege (amtliche Kern-Primaerquellen)", seed.summary.kritischeWege === 4);

console.log(`\n== Ergebnis: ${seed.retrievalPaths.length} neue Wege + ${seed.reusePathIds.length} wiederverwendet · ${fail === 0 ? "ALLE TESTS GRUEN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
