"use strict";

// Test des PREPARED-Seeds für das Bund-Fachthemenpaket „Wohnen, Bauen & Stadtentwicklung".
// Prüft die SICHERHEITS- und INTEGRITÄTS-INVARIANTEN (Auftrag §9):
//   - keine Dubletten (neue Herausgeber/Entitäten kollidieren NICHT mit dem Bestandskatalog;
//     wiederverwendete existieren dort und werden NICHT verändert),
//   - keine Bestandsquelle verändert (Kern-Seeds + Basis-Seed unberührt; buildFullModel grün),
//   - Paket vollständig inaktiv (needs_review + manual + prepared, 0 aktive Wege),
//   - Seed stabil (deterministisch), Rollback vollständig, method/evidence/entity DB-CHECK-konform.
// Reiner Offline-Test (kein Netz, keine KI, kein DB-Zugriff).

const fs = require("fs");
const path = require("path");
const { build, buildRollback } = require("./generate-wohnen-bauen-seed");
const seedMod = require("../lib/helmut/quellenarchitektur/seeds/wohnen-bauen-quellen");
const { buildFullModel, seeds } = require("../lib/helmut/quellenarchitektur");
const model = require("../lib/helmut/quellenarchitektur/model");

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass += 1; console.log(`PASS  ${name}`); } else { fail += 1; console.log(`FAIL  ${name}`); } }

const { sql, seed } = build();
const rollback = buildRollback(seed);

// --- 1. Zeilenzahlen ---
console.log("== Zeilenzahlen ==");
check("8 neue Entitäten", seed.entities.length === 8);
check("10 Herausgeber (2 reuse + 8 neu)", seed.publishers.length === 10 && seed.summary.publishersReused === 2 && seed.summary.publishersNeu === 8);
check("10 Abrufwege", seed.retrievalPaths.length === 10);
check("10 Paketzuordnungen (1 Paket)", seed.packagePaths.length === 10 && new Set(seed.packagePaths.map((p) => p.package_id)).size === 1);
check("10 path_expected_levels + 10 path_expected_geographies", seed.pathExpectedLevels.length === 10 && seed.pathExpectedGeographies.length === 10);
check("5 Future Targets", seed.futureTargets.length === 5);

// --- 2. Paket vollständig INAKTIV ---
console.log("== Paket vollständig inaktiv ==");
check("Paketstatus prepared (nie active)", seed.package.status === "prepared");
check("Seed-Selbstprüfung: 0 aktive Wege", seed.summary.aktiveAbrufwege === 0);
check("alle Wege status=needs_review", seed.retrievalPaths.every((p) => p.status === "needs_review"));
check("alle Wege activation_mode=manual", seed.retrievalPaths.every((p) => p.activation_mode === "manual"));
// Reale Aktivierungssemantik: das Paket ist 'prepared' -> die Referenzzählung liefert 0
// aktive Pakete je Weg -> isPathActive=false. (Ein 'manual'-Weg würde bei fiktiv AKTIVEM
// Paket zwar referenziert; genau deshalb schützt hier der Paketstatus, nicht nur der Modus.)
const refcounts = model.computePathRefcounts({
  packages: [{ id: seed.package.id, status: seed.package.status }], // prepared
  packagePaths: seed.packagePaths
});
check("Referenzzählung: 0 aktive Pakete je Weg (Paket prepared)", seed.retrievalPaths.every((p) => (refcounts[p.id] || []).length === 0));
check("model.isPathActive = false für JEDEN Weg (Paket prepared -> keine aktive Referenz)", seed.retrievalPaths.every((p) => model.isPathActive(p, refcounts[p.id] || []) === false));
check("Kontrollprobe: würde das Paket fälschlich 'active', bliebe manual+needs_review dennoch NICHT always_on", seed.retrievalPaths.every((p) => p.activation_mode !== "always_on"));
check("KEIN 'auto'/'always_on'/'healthy' im SQL", !/'auto'|'always_on'|'healthy'/.test(sql));
check("Paket-Insert trägt status='prepared'", /'pkg-wohnen-bauen-stadtentwicklung-bund'[\s\S]*?'prepared'/.test(sql));
const nManual = (sql.match(/'needs_review', 'manual'/g) || []).length;
check("alle 10 Abrufwege needs_review + manual im SQL", nManual === 10);

// --- 3. Additiv / idempotent / nicht-destruktiv ---
console.log("== Additiv / idempotent ==");
check("ausschließlich ON CONFLICT DO NOTHING (nie DO UPDATE)", /on conflict/.test(sql) && !/do update/.test(sql));
const nConflict = (sql.match(/on conflict \([^)]*\) do nothing/g) || []).length;
check("7 ON-CONFLICT-Blöcke (entities/publishers/package/paths/pkgpaths/levels/geos)", nConflict === 7);
check("begin + commit + notify pgrst", /begin;/.test(sql) && /commit;/.test(sql) && /notify pgrst/.test(sql));
// Seed deterministisch/stabil: zweimal bauen -> byte-identisch.
check("Seed stabil (deterministisch, 2× identisch)", build().sql === sql);

// --- 4. DB-CHECK-Konformität ---
console.log("== DB-CHECK-Konformität ==");
const METHODS = new Set(["rss", "api", "html", "googlenews_search", "structured_download"]);
const EVIDENCE = new Set(["official_primary", "direct_interest", "journalistic", "data_source", "aggregator"]);
const ENTITY_TYPES = new Set(model.ENTITY_TYPES);
const TRUST = new Set(["hoch", "mittel", "niedrig", "blockiert", "unbekannt"]);
check("alle method-Werte DB-CHECK-konform", seed.retrievalPaths.every((p) => METHODS.has(p.method)));
check("alle Wege sind googlenews_search (keine erfundene Feed-URL)", seed.retrievalPaths.every((p) => p.method === "googlenews_search"));
check("alle Weg-URLs zeigen auf news.google.com (Aggregator-Endpunkt, keine Fantasie-Domain)", seed.retrievalPaths.every((p) => model.isGoogleNewsUrl(p.url)));
check("alle publisher.evidence_role DB-CHECK-konform", seed.publishers.every((p) => EVIDENCE.has(p.evidence_role)));
check("alle publisher.trust DB-CHECK-konform", seed.publishers.every((p) => TRUST.has(p.trust)));
check("alle entity_type DB-CHECK-konform", seed.entities.every((e) => ENTITY_TYPES.has(e.entity_type)));
check("Frequenzklassen gültig (ereignisnah/regelmaessig/periodisch)", seed.retrievalPaths.every((p) => seedMod.FREQUENZKLASSEN.includes(p.frequenz)));

// --- 5. KEINE DUBLETTEN gegen den Bestandskatalog (buildFullModel + Basis-Seed) ---
console.log("== Keine Dubletten ==");
const M = buildFullModel();
const bestandPubIds = new Set(M.publishers.map((p) => p.id));
const bestandEntIds = new Set(M.entities.map((e) => e.id));
const bestandPkgIds = new Set(M.packages.map((p) => p.id));
const bestandPathIds = new Set(M.retrievalPaths.map((p) => p.id));
const neuePubs = seed.publishers.filter((p) => !p.reuse);
const reusePubs = seed.publishers.filter((p) => p.reuse);
check("neue Herausgeber existieren NOCH NICHT im Bestand (keine Dublette)", neuePubs.every((p) => !bestandPubIds.has(p.id)));
check("wiederverwendete Herausgeber existieren im Bestand (echtes reuse)", reusePubs.length === 2 && reusePubs.every((p) => bestandPubIds.has(p.id)));
check("reuse-Herausgeber sind genau destatis.de + bundesrat.de", JSON.stringify(reusePubs.map((p) => p.id).sort()) === JSON.stringify(["publisher-bundesrat.de", "publisher-destatis.de"]));
check("neue Entitäten existieren NOCH NICHT im Bestand", seed.entities.every((e) => !bestandEntIds.has(e.id)));
check("Paket existiert NOCH NICHT im Bestand (kein Doppel-Paket)", !bestandPkgIds.has(seed.package.id));
check("neue Abrufweg-IDs kollidieren nicht mit Bestand", seed.retrievalPaths.every((p) => !bestandPathIds.has(p.id)));
check("Herausgeber-IDs im Seed eindeutig", new Set(seed.publishers.map((p) => p.id)).size === seed.publishers.length);
check("Abrufweg-IDs im Seed eindeutig", new Set(seed.retrievalPaths.map((p) => p.id)).size === seed.retrievalPaths.length);
check("Entitäts-IDs im Seed eindeutig", new Set(seed.entities.map((e) => e.id)).size === seed.entities.length);

// Gegen den PERSISTIERTEN Basis-Seed prüfen (die reale DB-Wahrheit vor diesem Paket).
const baseSeedPath = path.join(__dirname, "..", "supabase", "seeds", "20260713_source_architecture_seed.sql");
const baseSeed = fs.readFileSync(baseSeedPath, "utf8");
check("reuse-Herausgeber stehen im Basis-Seed (publisher-destatis.de/-bundesrat.de)",
  /'publisher-destatis\.de'/.test(baseSeed) && /'publisher-bundesrat\.de'/.test(baseSeed));
check("neue Herausgeber-Domains stehen NICHT im Basis-Seed", neuePubs.every((p) => !baseSeed.includes(`'${p.id}'`)));
check("neue Entitäten stehen NICHT im Basis-Seed", seed.entities.every((e) => !baseSeed.includes(`'${e.id}'`)));

// --- 6. BBSR↔BBR: genau EINE Institution (keine Doppelmodellierung) ---
console.log("== BBSR ↔ BBR: keine Doppelmodellierung ==");
check("genau EINE BBSR/BBR-Entität (authority-bbsr)", seed.entities.filter((e) => /bbsr|bbr/i.test(e.id)).length === 1);
check("keine separate authority-bbr-Entität", !seed.entities.some((e) => e.id === "authority-bbr"));
check("BBR als Alias der BBSR-Entität geführt", seed.entities.find((e) => e.id === "authority-bbsr").aliases.some((a) => /BBR|Bauwesen und Raumordnung/.test(a)));
check("nur EIN BBSR-Herausgeber (bbsr.bund.de), kein bbr.bund.de", seed.publishers.filter((p) => /bbsr|bbr/i.test(p.canonical_domain)).length === 1);

// --- 7. Reuse/Parallelweg-Disziplin (Bundestag/DIP/Ausschuss NICHT dupliziert) ---
console.log("== Keine parallelen parlamentarischen Wege ==");
const reusedIds = new Set(seedMod.REUSED.map((r) => r.id));
check("committee-bt-bau-wohnen als REUSE dokumentiert, NICHT neu angelegt",
  reusedIds.has("committee-bt-bau-wohnen") && !seed.entities.some((e) => e.id === "committee-bt-bau-wohnen"));
check("DIP (rp-dip) als REUSE dokumentiert, kein Parallelweg im Seed",
  reusedIds.has("rp-dip") && !seed.retrievalPaths.some((p) => /dip/i.test(p.id)));
check("kein Abrufweg auf bundestag.de (parlamentarische Abdeckung = bund-basis + DIP)",
  seed.publishers.every((p) => p.canonical_domain !== "bundestag.de"));
check("DIP im Bestand ist aktiver always_on-Weg (Reuse-Grundlage real vorhanden)",
  (() => { const dip = M.retrievalPaths.find((p) => p.legacy_source_id === "dip"); return dip && dip.activation_mode === "always_on"; })());

// --- 8. Future Targets: fachlich NICHT abgewertet, technisch begründet, KEIN Abrufweg ---
console.log("== Future Targets ==");
check("GMBl ist Future Target (Paywall/kein Feed), NICHT als Abrufweg",
  seed.futureTargets.some((t) => t.id === "gmbl") && !seed.retrievalPaths.some((p) => /gmbl/i.test(p.id)));
check("ARGEBAU/Bauministerkonferenz ist Future Target (aspx/kein Feed)",
  seed.futureTargets.some((t) => t.id === "argebau-beschluesse") && !seed.retrievalPaths.some((p) => /argebau/i.test(p.id)));
check("jeder Future Target trägt Fachqualität + technischen Grund", seed.futureTargets.every((t) => t.fachqualitaet && t.grund));

// --- 9. KEINE Bestandsänderung: Kern-Seeds + buildFullModel unberührt ---
console.log("== Bestand unverändert ==");
check("Paket NICHT in PACKAGE_DEFINITIONS (Registry unangetastet)", !seeds.PACKAGE_DEFINITIONS.some((p) => p.id === seed.package.id));
check("buildFullModel weiterhin 6 Pakete (kein 7.)", M.packages.length === 6);
check("neue Entitäten NICHT in POLITICAL_ENTITIES", seed.entities.every((e) => !seeds.POLITICAL_ENTITIES.some((x) => x.id === e.id)));
check("neue Domains NICHT in DOMAIN_PUBLISHERS", neuePubs.every((p) => !seeds.DOMAIN_PUBLISHERS[p.canonical_domain]));

// --- 10. Rollback vollständig + reuse-schonend + dependency-korrekt ---
console.log("== Rollback ==");
check("Rollback löscht geographies/levels/package_paths/retrieval_paths/source_packages/publishers/political_entities",
  /path_expected_geographies/.test(rollback) && /path_expected_levels/.test(rollback) && /package_paths/.test(rollback) &&
  /delete from public\.retrieval_paths/.test(rollback) && /delete from public\.source_packages/.test(rollback) &&
  /delete from public\.publishers/.test(rollback) && /delete from public\.political_entities/.test(rollback));
check("Rollback fasst wiederverwendete Herausgeber NICHT an (kein destatis/bundesrat im publishers-delete)",
  !/publisher-destatis\.de|publisher-bundesrat\.de/.test(rollback.split("delete from public.publishers")[1] || ""));
const ord = (re) => rollback.search(re);
check("Rollback-Reihenfolge: Kinder vor Eltern",
  ord(/path_expected_geographies/) < ord(/delete from public\.retrieval_paths/) &&
  ord(/delete from public\.retrieval_paths/) < ord(/delete from public\.source_packages/) &&
  ord(/delete from public\.source_packages/) < ord(/delete from public\.publishers/) &&
  ord(/delete from public\.publishers/) < ord(/delete from public\.political_entities/));

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL — ${seed.retrievalPaths.length} Wege · Paket ${seed.package.status} · aktiv ${seed.summary.aktiveAbrufwege} ==`);
process.exit(fail > 0 ? 1 : 0);
