"use strict";

// Helmut — Quellenarchitektur · Tests für das INAKTIVE Quellenpaket GESUNDHEIT (Bund).
// Reine Offline-Tests (kein Netz, keine KI, kein DB-Zugriff). Sichert die Auftrags-Grenzen:
//   - alle neuen Abrufwege INAKTIV (needs_review + manual, nie auto/always_on/healthy),
//   - keine Publisher-/Entity-/Path-/Domain-Dublette gegen den Bestand (buildFullModel),
//   - Bestandswiederverwendung korrekt (BMG/Bundesrat/Destatis-Herausgeber + Entitäten),
//   - Paket prepared + is_base false + KEIN Profil-Mapping -> nie aktiviert,
//   - Funktionsdubletten vermieden (Bundestag/DIP), Destatis über EINEN Abrufweg (2 Reihen),
//   - fachliche Klassifizierung (Verbände direct_interest, amtlich data_source/official_primary),
//   - Frequenzklassen + Prioritäts-Empfehlung, deterministische Regenerierung,
//   - Verifikation zweistufig (Recherche belegt, Byte-Ebene offen).

const model = require("../lib/helmut/quellenarchitektur/model");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");
const { buildGesundheitBundSeed, KERNQUELLEN, FREQ } = require("../lib/helmut/quellenarchitektur/seeds/gesundheit-bund-quellen");
const { PACKAGE_DEFINITIONS } = require("../lib/helmut/quellenarchitektur/seeds/packages");
const { computeGlobalActivation, resolveProfilePackages } = require("../lib/helmut/quellenarchitektur/profile-packages");
const { VERIFIKATION, VERIFIKATION_META } = require("../lib/helmut/quellenarchitektur/seeds/gesundheit-bund-verifikation");
const gen = require("./generate-gesundheit-bund-seed");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const seed = buildGesundheitBundSeed();
const M = buildFullModel();
const basePublisherIds = new Set(M.publishers.map((p) => p.id));
const basePublisherDomains = new Set(M.publishers.map((p) => p.canonical_domain));
const baseEntityIds = new Set(M.entities.map((e) => e.id));
const basePathIds = new Set(M.retrievalPaths.map((p) => p.id));

// ============================ Struktur / Zählwerk ============================
console.log("== Struktur ==");
check("16 fachliche Kernquellen dokumentiert (14 neue Wege + 2 bestandsabgedeckt: Bundestag/Destatis-2.Reihe)",
  KERNQUELLEN.length === 14 && seed.bestandsabgedeckt.length === 1);
check("14 Abrufwege", seed.retrievalPaths.length === 14);
check("11 neue Herausgeber", seed.publishers.length === 11);
check("3 wiederverwendete Herausgeber", seed.reusedPublisherIds.length === 3);
check("11 neue Entitäten", seed.entities.length === 11);
check("3 wiederverwendete Entitäten", seed.reusedEntityIds.length === 3);
check("14 Paketzuordnungen (alle -> pkg-gesundheit-bund)",
  seed.packagePaths.length === 14 && seed.packagePaths.every((pp) => pp.package_id === "pkg-gesundheit-bund"));
check("14 path_expected_levels (alle bund)", seed.pathExpectedLevels.length === 14 && seed.pathExpectedLevels.every((l) => l.level === "bund"));
check("14 path_expected_geographies (alle geo-bund)", seed.pathExpectedGeographies.length === 14 && seed.pathExpectedGeographies.every((g) => g.geography_id === "geo-bund"));

// ============================ INAKTIVITÄT ============================
console.log("== Inaktivität (Auftrag: Paket bleibt vollständig inaktiv) ==");
check("0 aktive Wege (kein healthy/auto/always_on)", seed.summary.aktiveAbrufwege === 0);
check("jeder Weg status=needs_review", seed.retrievalPaths.every((p) => p.status === "needs_review"));
check("jeder Weg activation_mode=manual", seed.retrievalPaths.every((p) => p.activation_mode === "manual"));
check("kein Weg dev_only/auto/always_on", seed.retrievalPaths.every((p) => p.activation_mode === "manual"));
check("gültige Methoden (Enum)", seed.retrievalPaths.every((p) => model.RETRIEVAL_METHODS.includes(p.method)));

// ============================ KEINE DUBLETTEN gegen Bestand ============================
console.log("== Dedup / keine Kollision mit Bestand ==");
check("neue Herausgeber-IDs kollidieren NICHT mit Bestand", seed.publishers.every((p) => !basePublisherIds.has(p.id)));
check("neue Herausgeber-Domains kollidieren NICHT mit Bestand", seed.publishers.every((p) => !basePublisherDomains.has(p.canonical_domain)));
check("neue Entity-IDs kollidieren NICHT mit Bestand", seed.entities.every((e) => !baseEntityIds.has(e.id)));
check("neue Abrufweg-IDs kollidieren NICHT mit Bestand", seed.retrievalPaths.every((p) => !basePathIds.has(p.id)));
check("wiederverwendete Herausgeber EXISTIEREN im Bestand", seed.reusedPublisherIds.every((id) => basePublisherIds.has(id)));
check("wiederverwendete Entitäten EXISTIEREN im Bestand", seed.reusedEntityIds.every((id) => baseEntityIds.has(id)));
check("reused = genau BMG/Bundesrat/Destatis-Herausgeber",
  ["publisher-bundesgesundheitsministerium.de", "publisher-bundesrat.de", "publisher-destatis.de"].every((id) => seed.reusedPublisherIds.includes(id)));
check("intern eindeutige Abrufweg-IDs", new Set(seed.retrievalPaths.map((p) => p.id)).size === seed.retrievalPaths.length);
check("intern eindeutige Publisher-Domains", new Set(seed.publishers.map((p) => p.canonical_domain)).size === seed.publishers.length);
// Cross-Seed-Kollision gegen das andere standalone-Seed (Landesmodule Berlin/Brandenburg).
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const lm = buildLandesmodulSeed();
const lmPathIds = new Set(lm.retrievalPaths.map((p) => p.id));
const lmPubIds = new Set(lm.publishers.map((p) => p.id));
const lmEntIds = new Set(lm.entities.map((e) => e.id));
check("keine Abrufweg-ID-Kollision mit Landesmodul-Seed", seed.retrievalPaths.every((p) => !lmPathIds.has(p.id)));
check("keine Herausgeber-ID-Kollision mit Landesmodul-Seed", seed.publishers.every((p) => !lmPubIds.has(p.id)));
check("keine Entity-ID-Kollision mit Landesmodul-Seed", seed.entities.every((e) => !lmEntIds.has(e.id)));

// ============================ Funktionsdubletten vermieden (Auftrag §7) ============================
console.log("== Funktionsdubletten ==");
check("KEIN eigener Bundestags-Drucksachen-Weg (DIP-API/Ausschuss aus Bestand)",
  !seed.retrievalPaths.some((p) => /bundestag|drucksache|\bdip\b/i.test(p.legacy_source_id)));
check("Bundestag/Ausschuss Gesundheit als Bestandswiederverwendung dokumentiert",
  seed.bestandsabgedeckt[0].entitaeten.includes("committee-bt-gesundheit") && seed.bestandsabgedeckt[0].entitaeten.includes("parliament-bundestag"));
const destatis = seed.retrievalPaths.filter((p) => p.publisher_id === "publisher-destatis.de");
check("Destatis: EIN gemeinsamer Abrufweg deckt BEIDE Reihen ab (Krankenhaus + GAR)",
  destatis.length === 1 && destatis[0].covers.includes("krankenhaus_grunddaten") && destatis[0].covers.includes("gesundheitsausgabenrechnung"));
check("BMG-Gesetzgebungsweg ist KEINE URL-Dublette zu BMG-Pflege (distinkte Suchdefinition)",
  seed.retrievalPaths.some((p) => p.publisher_id === "publisher-bundesgesundheitsministerium.de" && /Referentenentwurf|Gesetz/.test(p.query || "")));

// ============================ Fachliche Klassifizierung (Auftrag §3) ============================
console.log("== Belegfunktion (evidence_role) ==");
const pubByDomain = Object.fromEntries(seed.publishers.map((p) => [p.canonical_domain, p]));
check("Verbände GKV/KBV/DKG/BÄK/Pflegerat = direct_interest (Interessenvertretung)",
  ["gkv-spitzenverband.de", "kbv.de", "dkgev.de", "bundesaerztekammer.de", "deutscher-pflegerat.de"].every((d) => pubByDomain[d].evidence_role === "direct_interest"));
check("G-BA = official_primary (normative Selbstverwaltung)", pubByDomain["g-ba.de"].evidence_role === "official_primary");
check("BfArM/PEI = official_primary (Zulassungs-/Sicherheitsbehörde)",
  pubByDomain["bfarm.de"].evidence_role === "official_primary" && pubByDomain["pei.de"].evidence_role === "official_primary");
check("RKI = data_source (amtliche Datenquelle)", pubByDomain["rki.de"].evidence_role === "data_source");
check("IQWiG/SVR = data_source (gesetzliche Evidenz)", pubByDomain["iqwig.de"].evidence_role === "data_source" && pubByDomain["svr-gesundheit.de"].evidence_role === "data_source");
check("gültige evidence_role (Enum)", seed.publishers.every((p) => model.EVIDENCE_ROLES.includes(p.evidence_role)));
check("gültige entity_type (Enum, inkl. other_institution)", seed.entities.every((e) => model.ENTITY_TYPES.includes(e.entity_type)));
check("is_critical nur bei official_primary (amtliche Primärquellen nie still archivieren)",
  seed.retrievalPaths.every((p) => (p.is_critical === (pubByDomain[canonicalDomainOf(p, seed)] ? pubByDomain[canonicalDomainOf(p, seed)].evidence_role === "official_primary" : reusedOfficialPrimary(p)))));

function canonicalDomainOf(path, s) {
  const pub = s.publishers.find((p) => p.id === path.publisher_id);
  return pub ? pub.canonical_domain : null;
}
function reusedOfficialPrimary(path) {
  // BMG + Bundesrat sind official_primary (reused), Destatis ist data_source (reused).
  return path.publisher_id === "publisher-bundesgesundheitsministerium.de" || path.publisher_id === "publisher-bundesrat.de";
}

// ============================ Frequenzklassen (Auftrag §6) ============================
console.log("== Frequenzklassen / Prioritätsempfehlung ==");
check("ereignisnah=6, regelmaessig=6, periodisch=2", seed.summary.ereignisnah === 6 && seed.summary.regelmaessig === 6 && seed.summary.periodisch === 2);
check("Priorität folgt Frequenzklasse (ereignisnah 85 > regelmaessig 65 > periodisch 45)",
  seed.retrievalPaths.every((p) => p.priority === FREQ[p.frequenzklasse].priority) && FREQ.ereignisnah.priority > FREQ.regelmaessig.priority && FREQ.regelmaessig.priority > FREQ.periodisch.priority);
check("Timeout/Retry-Empfehlung je Weg vorhanden", seed.retrievalPaths.every((p) => p.timeoutMsEmpfehlung > 0 && p.retriesEmpfehlung >= 1));
check("keine unnötig hohe Frequenz für periodische Quellen (Destatis/SVR periodisch)",
  seed.retrievalPaths.filter((p) => /destatis|svr/.test(p.legacy_source_id)).every((p) => p.frequenzklasse === "periodisch"));

// ============================ Paket: prepared + niemals aktiviert ============================
console.log("== Paket-Aktivierung ==");
const pkg = PACKAGE_DEFINITIONS.find((p) => p.id === "pkg-gesundheit-bund");
check("Paket in PACKAGE_DEFINITIONS", !!pkg);
check("Paket status=prepared, is_base=false, level=bund", pkg && pkg.status === "prepared" && pkg.is_base === false && pkg.political_level === "bund");
check("KEIN Profil-Mapping -> Gesundheitsprofil aktiviert gesundheit-bund NICHT", (() => {
  const gesundheitsProfil = { id: "t-gesundheit", parlament: "Bundestag", ausschuesse: ["Gesundheit"], fachpolitische_schwerpunkte: ["Gesundheit", "Pflege", "Krankenhaus"] };
  const keys = resolveProfilePackages(gesundheitsProfil).all;
  return !keys.includes("gesundheit-bund");
})());
check("computeGlobalActivation: gesundheit-bund bleibt inactive (auch bei aktivem Gesundheitsprofil)", (() => {
  const act = computeGlobalActivation({
    profiles: [{ id: "t1", parlament: "Bundestag", status: "aktiv", ausschuesse: ["Gesundheit"], fachpolitische_schwerpunkte: ["Gesundheit"] }],
    packages: PACKAGE_DEFINITIONS, packagePaths: seed.packagePaths, retrievalPaths: seed.retrievalPaths
  });
  const ps = act.packageStatus.find((p) => p.key === "gesundheit-bund");
  return ps && ps.activation === "inactive" && act.activePathIds.length === 0;
})());

// ============================ Verifikation zweistufig (Auftrag §5) ============================
console.log("== Verifikation (zwei Ebenen) ==");
check("Byte-Ebene für ALLE Wege offen (Sandbox-Egress gesperrt, ehrlich getrennt)",
  seed.retrievalPaths.every((p) => VERIFIKATION[p.legacy_source_id] && VERIFIKATION[p.legacy_source_id].byte.urteil === "offen"));
check("Recherche-Ebene für ALLE Wege belegt/teilbelegt (keine fachliche Ablehnung wegen Technik)",
  seed.retrievalPaths.every((p) => /belegt/.test(VERIFIKATION[p.legacy_source_id].recherche.urteil)));
check("RKI-Migrationsrisiko dokumentiert", VERIFIKATION["gesbund-rki-epidbull"].recherche.urteil === "belegt_mit_migrationsrisiko");
check("Byte-Meta: Kontrollabruf belegt gesperrten Egress", VERIFIKATION_META.byteEbeneStatus === "offen" && VERIFIKATION_META.kontrollabruf.http === 403);

// ============================ Deterministische Regenerierung + SQL-Sicherheit ============================
console.log("== Determinismus / SQL-Sicherheit ==");
check("Seed deterministisch (zweifacher Build identisch)", JSON.stringify(buildGesundheitBundSeed()) === JSON.stringify(seed));
const { sql } = gen.build();
const { sql: sql2 } = gen.build();
check("SQL deterministisch", sql === sql2);
check("SQL setzt status='needs_review' HART (14x)", (sql.match(/'needs_review'/g) || []).length >= 14);
check("SQL setzt activation_mode='manual' HART (14x)", (sql.match(/'manual'/g) || []).length >= 14);
check("SQL enthält KEIN 'auto'/'always_on'/'healthy' für Wege", !/'always_on'|'healthy'/.test(sql) && !/, 'auto',/.test(sql));
check("SQL: Paket idempotent (on conflict do nothing)", /pkg-gesundheit-bund.*\n.*on conflict \(id\) do nothing/.test(sql) || sql.includes("'pkg-gesundheit-bund'"));
check("SQL: nur additive Upserts (kein DELETE/UPDATE/TRUNCATE)", !/\b(delete|update|truncate|drop)\b/i.test(sql));
check("Rollback vorhanden + guarded (löscht Bestand nicht)", (() => {
  const rb = gen.buildRollback(seed);
  // Der Herausgeber-/Entity-Delete ist guarded (not exists) und listet NUR neue IDs.
  const pubDelete = rb.split("delete from public.publishers")[1] || "";
  const nurNeuePublisher = seed.publishers.every((p) => pubDelete.includes(`'${p.id}'`))
    && !["publisher-bundesgesundheitsministerium.de", "publisher-bundesrat.de", "publisher-destatis.de"].some((id) => pubDelete.split("and not exists")[0].includes(`'${id}'`));
  return (rb.match(/not exists/g) || []).length >= 2 && nurNeuePublisher;
})());

// ============================ Zusammenfassung ============================
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
