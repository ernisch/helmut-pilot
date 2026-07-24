"use strict";

// Test des PREPARED-Seed-Generators fuer das Themenpaket 'verkehr-infrastruktur-bund'
// (scripts/generate-verkehr-infrastruktur-seed.js). Prueft die SICHERHEITS- und
// WIEDERVERWENDUNGS-Invarianten: technisch inaktiv, idempotent, method-CHECK-konform,
// KEINE Dubletten gegen den Bestandskatalog, Bestandsquellen unveraendert, Rollback vollstaendig.

const { build, buildRollback } = require("./generate-verkehr-infrastruktur-seed");
const { buildVerkehrSeed } = require("../lib/helmut/quellenarchitektur/seeds/verkehr-infrastruktur-bund");
const { POLITICAL_ENTITIES } = require("../lib/helmut/quellenarchitektur/seeds/entities");
const { DOMAIN_PUBLISHERS } = require("../lib/helmut/quellenarchitektur/seeds/publishers");

let fail = 0;
function check(name, cond, detail) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <<< " + (detail || "")}`); if (!cond) fail += 1; }

const { sql, seed } = build();
const rollback = buildRollback(seed);

// --- 1. Zeilenzahlen ---
check("18 neue Entitaeten", seed.entities.length === 18, String(seed.entities.length));
check("19 neue Herausgeber", seed.publishers.length === 19, String(seed.publishers.length));
check("23 neue Abrufwege", seed.retrievalPaths.length === 23, String(seed.retrievalPaths.length));
check("24 Paketzuordnungen (23 neu + 1 Wiederverwendung)", seed.packagePaths.length === 24, String(seed.packagePaths.length));
check("23 path_expected_levels/geographies/entities/topics",
  seed.pathExpectedLevels.length === 23 && seed.pathExpectedGeographies.length === 23 &&
  seed.pathExpectedEntities.length === 23 && seed.pathExpectedTopics.length === 23);

// --- 2. Technisch INAKTIV (hart im SQL) ---
check("Paket status='prepared' (nie active)", seed.package.status === "prepared" && /'prepared'/.test(sql));
// Hinweis: Herausgeber tragen legitim lifecycle_status='active' — das ist KEIN Wege-/Paketstatus.
// Verboten sind ausschliesslich die aktivierenden Wege-/Paketwerte auto/always_on/healthy.
check("KEIN 'auto'/'always_on'/'healthy' im SQL (keine Aktivierung)",
  !/'auto'/.test(sql) && !/'always_on'/.test(sql) && !/'healthy'/.test(sql));
check("Paket-Insert traegt 'prepared', NICHT 'active'", /, 'prepared', false,/.test(sql) && !/'verkehr-infrastruktur-bund'.*'active'/.test(sql));
const nManual = (sql.match(/'needs_review', 'manual'/g) || []).length;
check("alle 23 Abrufwege needs_review + manual", nManual === 23, String(nManual));
check("Seed-Selbstpruefung: 0 aktive Wege", seed.summary.aktiveAbrufwege === 0);
check("Seed-Selbstpruefung: Paket nicht aktiv", seed.summary.paketAktiv === false);

// --- 3. method-CHECK-konform (nur googlenews_search) ---
const erlaubteMethoden = new Set(["rss", "api", "html", "googlenews_search", "structured_download"]);
check("alle method-Werte DB-CHECK-konform", seed.retrievalPaths.every((p) => erlaubteMethoden.has(p.method)));
check("nur googlenews_search (keine erfundenen Feeds/APIs)", seed.retrievalPaths.every((p) => p.method === "googlenews_search"));
check("alle URLs zeigen auf news.google.com (deterministische Suche)", seed.retrievalPaths.every((p) => /^https:\/\/news\.google\.com\/rss\/search\?q=/.test(p.url)));

// --- 4. Idempotent + transaktional (nicht-destruktiv) ---
check("ON CONFLICT DO NOTHING an jedem Insert (9 Bloecke)", (sql.match(/on conflict \([^)]*\) do nothing/g) || []).length === 9, String((sql.match(/on conflict \([^)]*\) do nothing/g) || []).length));
check("begin + commit + notify pgrst", /begin;/.test(sql) && /commit;/.test(sql) && /notify pgrst/.test(sql));

// --- 5. WIEDERVERWENDUNG statt Dubletten ---
// 5a) Bestehende Herausgeber (Destatis/BDI/Google News) werden NICHT neu angelegt.
const neuePublisherIds = new Set(seed.publishers.map((p) => p.id));
check("publisher-destatis.de NICHT neu angelegt (wiederverwendet)", !neuePublisherIds.has("publisher-destatis.de"));
check("publisher-bdi.eu NICHT neu angelegt (wiederverwendet)", !neuePublisherIds.has("publisher-bdi.eu"));
check("aggregator-google-news NICHT neu angelegt", !neuePublisherIds.has("aggregator-google-news"));
// 5b) Bestehender Abrufweg rp-committee-verkehr wird verlinkt, aber NICHT als neuer Weg erzeugt.
check("rp-committee-verkehr nur verlinkt, nicht neu erzeugt",
  seed.packagePaths.some((pp) => pp.retrieval_path_id === "rp-committee-verkehr") &&
  !seed.retrievalPaths.some((p) => p.id === "rp-committee-verkehr"));
// 5c) KEINE Dublette: neue Entitaets-IDs kollidieren nicht mit bestehenden.
const bestandEntityIds = new Set(POLITICAL_ENTITIES.map((e) => e.id));
const entKollision = seed.entities.filter((e) => bestandEntityIds.has(e.id)).map((e) => e.id);
check("keine Entitaets-ID-Dublette gegen Bestand (entities.js)", entKollision.length === 0, entKollision.join(","));
// 5d) KEINE Dublette: neue Herausgeber-Domains kollidieren nicht mit dem Domain-Register.
const bestandDomains = new Set(Object.keys(DOMAIN_PUBLISHERS));
const domKollision = seed.publishers.filter((p) => bestandDomains.has(p.canonical_domain)).map((p) => p.canonical_domain);
check("keine Herausgeber-Domain-Dublette gegen Domain-Register (publishers.js)", domKollision.length === 0, domKollision.join(","));
// 5e) reuse-Metadaten stimmen.
check("reuse-Summary: 3 Herausgeber / 6 Entitaeten / 1 Weg wiederverwendet",
  seed.summary.wiederverwendetePublisher === 3 && seed.summary.wiederverwendeteEntitaeten === 6 && seed.summary.wiederverwendeteWege === 1);

// --- 6. Bestandsquellen unveraendert: SQL fasst KEINE fremde ID schreibend an ---
// (Alle Inserts sind ON CONFLICT DO NOTHING; die einzige Bestands-Referenz ist der additive
//  package_paths-Link auf rp-committee-verkehr — kein UPDATE/DELETE auf Bestand im Seed.)
check("Seed enthaelt KEIN update/delete (rein additiv)", !/\bupdate\s+public\./i.test(sql) && !/\bdelete\s+from\s+public\./i.test(sql));

// --- 7. Frequenzklassen vollstaendig + gemappt ---
const gueltigeFreq = new Set(["ereignisnah", "regelmaessig", "periodisch"]);
check("jeder Weg hat eine gueltige Frequenzklasse", seed.retrievalPaths.every((p) => gueltigeFreq.has(p.frequenz)));
check("expected_frequency je Weg gesetzt (daily/monthly/multi_year)", seed.retrievalPaths.every((p) => ["daily", "monthly", "multi_year"].includes(p.expected_frequency)));
check("Frequenzverteilung 7 ereignisnah / 13 regelmaessig / 3 periodisch",
  seed.summary.frequenz.ereignisnah === 7 && seed.summary.frequenz.regelmaessig === 13 && seed.summary.frequenz.periodisch === 3,
  JSON.stringify(seed.summary.frequenz));

// --- 8. Kritische Primaerquellen korrekt (nur official_primary) ---
check("is_critical nur bei official_primary",
  seed.retrievalPaths.every((p) => p.is_critical === (p.evidenceRole === "official_primary")));

// --- 9. Verifikationsstatus ehrlich (Egress gesperrt) ---
check("jeder neue Weg traegt verifikation='unverifiziert_egress_gesperrt'",
  seed.retrievalPaths.every((p) => p.verifikation === "unverifiziert_egress_gesperrt"));

// --- 10. Rollback vollstaendig + dependency-korrekt + Bestand geschuetzt ---
check("Rollback loescht Kinder + Wege + Paket + Herausgeber + Entitaeten",
  /path_expected_topics/.test(rollback) && /path_expected_entities/.test(rollback) &&
  /path_expected_geographies/.test(rollback) && /path_expected_levels/.test(rollback) &&
  /delete from public\.package_paths/.test(rollback) && /delete from public\.retrieval_paths/.test(rollback) &&
  /delete from public\.source_packages/.test(rollback) && /delete from public\.publishers/.test(rollback) &&
  /delete from public\.political_entities/.test(rollback));
const ord = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Kinder vor Wegen vor Herausgebern vor Entitaeten",
  ord(/path_expected_topics/) < ord(/delete from public\.retrieval_paths/) &&
  ord(/delete from public\.retrieval_paths/) < ord(/delete from public\.publishers/) &&
  ord(/delete from public\.publishers/) < ord(/delete from public\.political_entities/));
check("Rollback fasst rp-committee-verkehr NICHT als zu loeschenden Weg an", !/id in \([^)]*rp-committee-verkehr/.test(rollback));
check("Rollback loescht Herausgeber/Entitaeten nur GUARDED (not exists)", (rollback.match(/and not exists/g) || []).length === 2);

console.log(`\n${fail === 0 ? "OK" : "FAIL"} — ${fail} Fehler`);
process.exit(fail === 0 ? 0 : 1);
