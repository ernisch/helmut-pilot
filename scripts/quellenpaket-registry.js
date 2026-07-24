"use strict";

// ============================================================================
// Helmut — Quellenpaket-Registry (KANONISCH, gemeinsam genutzt).
// ----------------------------------------------------------------------------
// EINZIGE Quelle der Wahrheit fuer:
//   - alle generierten Seed-Artefakte (Datei + Generator + optionales Rollback)
//   - alle vorbereiteten Quellenpakete (Modell-Hooks: paths/packagePaths/publishers/entities)
//   - die Allowlist der NICHT zur Quellenarchitektur gehoerenden Seeds (mit Begruendung)
//   - die erlaubten Shared-Domain-Ausnahmen (Domain + Publisher + fachliche Begruendung)
//
// Konsumiert von:
//   scripts/quellenpaket-workflow-test.js  (Drift/Additivitaet/Kollision/Inertheit,
//                                            Fail-Closed-Vollstaendigkeit, JSON-Report)
//   scripts/source-architecture-test.js    (Non-Catalog-Pfad-Klassifikation, §7)
//   scripts/quellenpaket-negativ-test.js    (negative Beweise, §13 — nur In-Memory/Temp)
//
// REIN & DETERMINISTISCH: kein Netz, keine DB, keine KI, KEIN Date.now()/Math.random(),
// KEIN Write-on-import. Generatoren schreiben NUR bei direktem Aufruf (require.main === module).
//
// EIN neues Quellenpaket = EIN neuer Registry-Eintrag. Fehlt einem Paket-Eintrag ein fuer
// die Sicherheitsgarantien noetiger Hook, wird der Workflow-Test ROT (fail-closed) —
// keine stillen `if (entry.paths)`-Ueberspringungen mehr.
// ============================================================================

const fs = require("fs");
const path = require("path");
const model = require("../lib/helmut/quellenarchitektur/model");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const { buildWohnenBauenStadtentwicklungSeed } = require("../lib/helmut/quellenarchitektur/seeds/wohnen-bauen-stadtentwicklung");
const srcArch = require("./generate-source-architecture-seed");
const landesmodul = require("./generate-landesmodul-seed");

const ROOT = path.join(__dirname, "..");
const SEEDS_DIR = path.join(ROOT, "supabase", "seeds");

// ── REGISTRY ─────────────────────────────────────────────────────────────────
// kind: "base"    = aktive Grundversorgung (Bund-Basis etc.); enthaelt ueber das
//                   Basismodell ZUSAETZLICH das vorbereitete WBSB-Paket (injiziert in
//                   catalog.js -> materialisiert im Basis-Seed).
//       "package" = vorbereitetes Quellenpaket (technisch inaktiv einzufuehren).
//
// Feldvertrag (verpflichtend fuer kind:"package", siehe §5 / assertPackageEntryComplete):
//   packageId      Modell-Paket-ID, in die die Wege einspeisen (Pflicht).
//   paths()        Modell-Abrufwege des Pakets (Pflicht — Inertheit + Kollisionsvereinigung).
//   packagePaths() Modell-Paketzuordnungen des Pakets (Pflicht).
//   publishers()   Herausgeber, die das Paket definiert ODER wiederverwendet (Pflicht, sobald
//                  das Paket ueberhaupt Herausgeber beruehrt).
//   render()       Generator des EIGENEN Seed-Artefakts ODER providedBySeed -> Basis-Seed.
//   file/seedFile  Zielartefakt (Pflicht: entweder eigene Datei ODER providedBySeed-Datei).
//   expectedMutationMode  erwarteter Modus; gegen das TATSAECHLICHE SQL geprueft (§9).
//   inBaseModel    true  = Paketzeilen sind bereits in buildFullModel()/Basis-Seed (WBSB)
//                          -> in der Kollisionsvereinigung NICHT erneut addieren (Doppelzaehlung).
//                  false = separates Seed, NICHT im Basismodell (Landesmodul) -> ergaenzen.
const REGISTRY = [
  {
    key: "source-architecture",
    kind: "base",
    file: "20260713_source_architecture_seed.sql",
    render: () => srcArch.build(),
    // Der Basis-Seed nutzt fuer geographies/entities/publishers/packages/retrieval_paths
    // `on conflict ... do update` -> reproduzierbarer UPSERT-Seed (NICHT insert-only / NICHT
    // "rein additiv"). package_paths ist `do nothing` (insert-only). Gesamturteil: upsert_update.
    expectedMutationMode: "upsert_update",
    // Ueber das Basismodell eingebettete, vorbereitete Pakete (nur Doku/Nachweis):
    embeddedPackages: ["pkg-wohnen-bauen-stadtentwicklung-bund"],
  },
  {
    key: "landesmodul-be-bb",
    kind: "package",
    packageId: "pkg-berlin-basis",
    // Landesmodul speist ZWEI vorbereitete Landespakete (Berlin + Brandenburg).
    secondaryPackageIds: ["pkg-brandenburg-basis"],
    file: "20260717_landesmodul_be_bb_seed.sql",
    rollbackFile: "20260717_landesmodul_be_bb_seed_rollback.sql",
    render: () => landesmodul.build().sql,
    renderRollback: () => landesmodul.buildRollback(landesmodul.build().seed),
    // Landesmodul-Seed nutzt ausschliesslich `on conflict ... do nothing` -> insert_only.
    expectedMutationMode: "insert_only",
    paths: () => buildLandesmodulSeed().retrievalPaths,
    packagePaths: () => buildLandesmodulSeed().packagePaths,
    publishers: () => buildLandesmodulSeed().publishers,
    entities: () => buildLandesmodulSeed().entities,
    inBaseModel: false,
    seedFile: "20260717_landesmodul_be_bb_seed.sql",
  },
  {
    key: "wohnen-bauen-stadtentwicklung-bund",
    kind: "package",
    packageId: "pkg-wohnen-bauen-stadtentwicklung-bund",
    // KEINE eigene Seed-Datei: die Paketzeilen sind ins Basismodell injiziert (catalog.js)
    // und werden vom Basis-Seed materialisiert. Generator/Zielartefakt = Basis-Seed.
    file: null,
    providedBySeed: "source-architecture",
    // Wird ueber den Basis-Seed materialisiert -> selber Modus wie der Basis-Seed.
    expectedMutationMode: "upsert_update",
    paths: () => buildWohnenBauenStadtentwicklungSeed().retrievalPaths,
    packagePaths: () => buildWohnenBauenStadtentwicklungSeed().packagePaths,
    publishers: () => buildWohnenBauenStadtentwicklungSeed().publishers,
    inBaseModel: true,
    seedFile: "20260713_source_architecture_seed.sql",
  },
];

// ── Allowlist: Seeds unter supabase/seeds/, die NACHWEISLICH NICHT zur ────────
// Quellenarchitektur gehoeren. Jede Ausnahme mit Begruendung. Diese Dateien sind vom
// Registry<->Artefakt-Zwang (Generator/Drift) ausgenommen, muessen aber existieren.
// Aktuell LEER: alle drei vorhandenen Seeds gehoeren zur Quellenarchitektur und sind
// vollstaendig registriert. Die Struktur bleibt bestehen, damit ein spaeterer fachfremder
// Seed bewusst + begruendet ausgenommen werden kann (statt still durchzurutschen).
const NON_ARCHITECTURE_SEED_ALLOWLIST = {
  // Beispielformat (derzeit ungenutzt):
  // "20260901_irgendein_fachfremder_seed.sql": "gehoert zu Feature X, keine Quellenarchitektur",
};

// ── Erlaubte Shared-Domain-Ausnahmen (§6) ────────────────────────────────────
// Eine Domain darf regulaer nur EINEM Herausgeber gehoeren. Legitime Shared Domains
// (z. B. Behoerden unter einer gemeinsamen Landesdomain) werden hier EXPLIZIT und
// BEGRUENDET zugelassen — keine pauschale Abschaltung der Pruefung. Aktuell LEER:
// im vereinigten Modell besitzt jede Domain genau einen Herausgeber (Subdomains wie
// bmwsb.bund.de / bbr.bund.de / recht.bund.de sind eigenstaendige Domains, keine geteilte).
const SHARED_DOMAIN_EXCEPTIONS = [
  // Beispielformat (derzeit ungenutzt):
  // { domain: "example.landesportal.de", publisherIds: ["publisher-a", "publisher-b"], reason: "..." },
];

// ── SQL-Analyse (rein, §9) ────────────────────────────────────────────────────
// Kommentare entfernen, damit Schluesselwortsuche nur echten Code sieht.
function stripSqlComments(sql) {
  return String(sql || "")
    .split("\n")
    .map((line) => { const i = line.indexOf("--"); return i >= 0 ? line.slice(0, i) : line; })
    .join("\n");
}
// String-Literale kollabieren, damit Werte (URLs/Namen wie "...Zusammenfuehrung...") die
// Schluesselwortsuche NICHT faelschlich ausloesen. '' bleibt '' (leerer Platzhalter).
function stripSqlLiterals(sql) {
  return String(sql || "").replace(/'(?:[^']|'')*'/g, "''");
}
function structuralSql(sql) { return stripSqlLiterals(stripSqlComments(sql)); }

// Destruktive Statements: DELETE/DROP/TRUNCATE/ALTER/MERGE (auch in destruktiven CTEs,
// da Literale/Kommentare entfernt sind). ON CONFLICT DO UPDATE ist KEIN destruktives
// Statement (mutierender Upsert, kein Loeschen/Ersetzen).
const DESTRUCTIVE = /\b(delete|drop|truncate|alter|merge)\b/i;
function hasDestructive(sql) { return DESTRUCTIVE.test(structuralSql(sql)); }

// Illegales bare UPDATE = ein `update`, das NICHT Teil von `do update` (Upsert) ist.
function hasIllegalBareUpdate(sql) {
  const s = structuralSql(sql);
  const re = /\bupdate\b/gi; let m;
  while ((m = re.exec(s)) !== null) {
    const before = s.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
    if (!/do\s*$/.test(before)) return true;
  }
  return false;
}

// Tatsaechlicher Mutationsmodus aus dem SQL (§9): der Bericht gibt NICHT eine Behauptung,
// sondern das gemessene Verhalten aus.
//   "upsert_update" = enthaelt `do update`   (mutierender Upsert)
//   "insert_only"   = nur `on conflict ... do nothing`
//   "insert_no_conflict" = Inserts OHNE on-conflict (nicht idempotent — unerwuenscht)
//   "empty"         = keine Inserts
function detectMutationMode(sql) {
  const s = structuralSql(sql);
  const inserts = (s.match(/\binsert\s+into\b/gi) || []).length;
  if (inserts === 0) return "empty";
  if (/\bdo\s+update\b/i.test(s)) return "upsert_update";
  if (/\bon\s+conflict\b/i.test(s)) return "insert_only";
  return "insert_no_conflict";
}

// ── Kollisions-Helfer (§6) ────────────────────────────────────────────────────
// collisionKey: schema-INSENSITIVER Dublettenschluessel. canonicalizeUrl faltet bereits
// www., Fragment, Tracking-Parameter, Query-Reihenfolge und Trailing-Slash; hier wird
// ZUSAETZLICH http/https zusammengefaltet. Die tatsaechlich gespeicherte URL bleibt
// UNVERAENDERT (das ist nur ein Vergleichsschluessel). Redirect-Dubletten sind offline
// NICHT erkennbar (Bestandteil der spaeteren Live-Verifikation je Paket).
function collisionKey(url) {
  const canon = model.normalizeUrl(url || "");
  if (!canon) return "";
  return canon.replace(/^https?:\/\//i, "scheme://");
}

// ── Fail-Closed-Vollstaendigkeit (§4) ─────────────────────────────────────────
// Reine Funktion, damit die Negativtests sie mit Temp-Daten aufrufen koennen.
function discoverSeedFiles(seedsDir) {
  if (!fs.existsSync(seedsDir)) return [];
  return fs.readdirSync(seedsDir).filter((f) => f.endsWith(".sql")).sort();
}

// Registrierte Artefaktnamen (eigene Seed-Dateien + Rollbacks).
function registeredArtifacts(registry) {
  const set = new Set();
  for (const e of registry) {
    if (e.file) set.add(e.file);
    if (e.rollbackFile) set.add(e.rollbackFile);
  }
  return set;
}

// Liefert { orphanSeeds, missingArtifacts }:
//   orphanSeeds      = Dateien unter seeds/, die WEDER registriert NOCH allowlisted sind (-> ROT)
//   missingArtifacts = registrierte Artefakte, deren Datei fehlt (-> ROT)
function checkRegistryCompleteness({ registry = REGISTRY, seedsDir = SEEDS_DIR, allowlist = NON_ARCHITECTURE_SEED_ALLOWLIST } = {}) {
  const discovered = discoverSeedFiles(seedsDir);
  const registered = registeredArtifacts(registry);
  const allowed = new Set(Object.keys(allowlist));
  const orphanSeeds = discovered.filter((f) => !registered.has(f) && !allowed.has(f));
  const missingArtifacts = [...registered].filter((f) => !fs.existsSync(path.join(seedsDir, f))).sort();
  return { discovered, orphanSeeds, missingArtifacts };
}

// ── Strikte Paket-Vollstaendigkeit (§5) ───────────────────────────────────────
// Liefert eine Liste fehlender Pflicht-Hooks fuer einen kind:"package"-Eintrag ([] = ok).
function missingPackageHooks(entry) {
  const missing = [];
  if (typeof entry.packageId !== "string" || !entry.packageId) missing.push("packageId");
  if (typeof entry.paths !== "function") missing.push("paths()");
  if (typeof entry.packagePaths !== "function") missing.push("packagePaths()");
  // publishers() ist Pflicht, sobald das Paket ueberhaupt Herausgeber beruehrt (definiert
  // oder wiederverwendet). Ein vorbereitetes Quellenpaket hat immer Herausgeber.
  if (typeof entry.publishers !== "function") missing.push("publishers()");
  // Generator/Build-Weg: eigener render() ODER Materialisierung ueber providedBySeed.
  const hasOwnRender = typeof entry.render === "function";
  const providerRenders = entry.providedBySeed
    && (registryByKey(entry.providedBySeed) || {}).render
    && typeof registryByKey(entry.providedBySeed).render === "function";
  if (!hasOwnRender && !providerRenders) missing.push("render()/providedBySeed");
  // Zielartefakt: eigene Datei ODER Datei des providedBySeed-Eintrags.
  const targetFile = entry.file || entry.seedFile
    || (entry.providedBySeed && (registryByKey(entry.providedBySeed) || {}).file);
  if (!targetFile) missing.push("Zielartefakt (file/seedFile/providedBySeed)");
  return missing;
}

function registryByKey(key) { return REGISTRY.find((e) => e.key === key) || null; }
function packageEntries(registry = REGISTRY) { return registry.filter((e) => e.kind === "package"); }

// Menge aller Path-IDs, die zu einem registrierten Paket gehoeren (ueber alle Paket-Eintraege).
// Grundlage der §7-Klassifikation in source-architecture-test.js.
function registeredPackagePathIds(registry = REGISTRY) {
  const set = new Set();
  for (const e of packageEntries(registry)) {
    if (typeof e.paths !== "function") continue;
    for (const p of e.paths()) set.add(p.id);
  }
  return set;
}

// ── §7-Klassifikation eines Non-Catalog-Abrufwegs ─────────────────────────────
// Non-Catalog = legacy_source_id NICHT im v1-Katalog. Zulaessig sind NUR:
//   "explicit"           -> fachlich dokumentierter Einzelweg (amtliche DIP-API)
//   "registered_package" -> gehoert zu einem registrierten, vorbereiteten Paket (WBSB)
// Alles andere -> "orphan" (unbekannt/verwaist) und macht den Test ROT.
const EXPLICIT_NON_CATALOG_LEGACY_IDS = new Set(["dip"]);
function classifyNonCatalogPath(pathObj, opts = {}) {
  const registeredIds = opts.registeredPackagePathIds || registeredPackagePathIds();
  if (EXPLICIT_NON_CATALOG_LEGACY_IDS.has(pathObj.legacy_source_id)) return "explicit";
  if (registeredIds.has(pathObj.id)) return "registered_package";
  return "orphan";
}

// ── Kollisionsvereinigung (§6) ────────────────────────────────────────────────
// Vereinigt Basismodell + JEDES separate Paket-Seed (inBaseModel:false). inBaseModel:true-
// Pakete (WBSB) sind schon im Basismodell und werden NICHT erneut addiert (Doppelzaehlung).
function buildUnion(fullModel, registry = REGISTRY) {
  const M = fullModel || buildFullModel();
  const paths = M.retrievalPaths.map((p) => ({ id: p.id, url: p.url, publisher_id: p.publisher_id, src: "base" }));
  const publishers = M.publishers.map((p) => ({ id: p.id, canonical_domain: p.canonical_domain, src: "base" }));
  const packages = M.packages.map((p) => ({ id: p.id, key: p.key, src: "base" }));
  const entities = M.entities.map((e) => ({ id: e.id, canonical_key: e.canonical_key, entity_type: e.entity_type, geography_id: e.geography_id, src: "base" }));
  for (const e of registry) {
    if (e.kind !== "package" || e.inBaseModel) continue;
    if (typeof e.paths === "function") for (const p of e.paths()) paths.push({ id: p.id, url: p.url, publisher_id: p.publisher_id, src: e.key });
    if (typeof e.publishers === "function") for (const p of e.publishers()) publishers.push({ id: p.id, canonical_domain: p.canonical_domain, src: e.key });
    if (typeof e.entities === "function") for (const en of e.entities()) entities.push({ id: en.id, canonical_key: en.canonical_key, entity_type: en.entity_type, geography_id: en.geography_id, src: e.key });
  }
  return { paths, publishers, packages, entities };
}

// Reine Kollisionspruefung ueber eine Vereinigung -> strukturiertes Urteil.
// sharedDomainExceptions: Liste {domain, publisherIds:[...]} -> diese Domains duerfen mehrere
// Herausgeber tragen (begruendete Ausnahme). Publisher-Reuse (dieselbe ID mehrfach) ist KEINE
// Kollision — es kollabiert zu einer ID.
function detectCollisions(union, sharedDomainExceptions = SHARED_DOMAIN_EXCEPTIONS) {
  const out = { pathId: [], packageId: [], entityId: [], publisherIdDomain: [], domainPublishers: [], slug: [], canonicalKey: [], url: [] };

  // Path-IDs eindeutig (ein Paket darf keine Basis-Path-ID recyceln).
  countDup(union.paths, (p) => p.id).forEach(([id, srcs]) => out.pathId.push(`${id} @ ${srcs.join("/")}`));
  // Package-IDs eindeutig.
  countDup(union.packages, (p) => p.id).forEach(([id, srcs]) => out.packageId.push(`${id} @ ${srcs.join("/")}`));
  // Entity-IDs eindeutig.
  countDup(union.entities, (e) => e.id).forEach(([id, srcs]) => out.entityId.push(`${id} @ ${srcs.join("/")}`));

  // Package-Slug (= source_packages.key) eindeutig.
  countDup(union.packages.filter((p) => p.key), (p) => p.key).forEach(([key, srcs]) => out.slug.push(`${key} @ ${srcs.join("/")}`));

  // Canonical Key: SCOPED je (canonical_key|entity_type|geography_id). Legitime Wiederholung
  // ueber Geografieebenen (z. B. "linke" fuer Bund/Berlin/Brandenburg) ist KEINE Kollision;
  // zwei VERSCHIEDENE Entitaeten desselben Typs in derselben Geografie mit gleichem Key schon.
  const byScope = new Map();
  for (const e of union.entities) {
    if (!e.canonical_key) continue;
    const scope = `${e.canonical_key}|${e.entity_type}|${e.geography_id || ""}`;
    if (!byScope.has(scope)) byScope.set(scope, new Set());
    byScope.get(scope).add(e.id);
  }
  for (const [scope, ids] of byScope) if (ids.size > 1) out.canonicalKey.push(`${scope}: ${[...ids].join("/")}`);

  // Publisher-ID -> genau eine Domain (dieselbe ID darf nicht auf zwei Domains zeigen).
  const domById = new Map();
  for (const p of union.publishers) {
    if (!domById.has(p.id)) domById.set(p.id, new Set());
    if (p.canonical_domain) domById.get(p.id).add(p.canonical_domain);
  }
  for (const [id, doms] of domById) if (doms.size > 1) out.publisherIdDomain.push(`${id}: ${[...doms].join("/")}`);

  // Domain -> genau ein Herausgeber (ausser begruendete Shared-Domain-Ausnahme).
  const idsByDom = new Map();
  for (const p of union.publishers) {
    if (!p.canonical_domain) continue;
    if (!idsByDom.has(p.canonical_domain)) idsByDom.set(p.canonical_domain, new Set());
    idsByDom.get(p.canonical_domain).add(p.id);
  }
  const exByDomain = new Map(sharedDomainExceptions.map((x) => [x.domain, new Set(x.publisherIds || [])]));
  for (const [dom, ids] of idsByDom) {
    if (ids.size <= 1) continue;
    const allowed = exByDomain.get(dom);
    // Ausnahme greift nur, wenn GENAU die beteiligten Herausgeber deklariert sind.
    const covered = allowed && [...ids].every((id) => allowed.has(id));
    if (!covered) out.domainPublishers.push(`${dom}: ${[...ids].join("/")}`);
  }

  // URL-Kollision ueber den schema-insensitiven collisionKey (deckt exakte + normalisierte
  // URLs, www., Trailing-Slash, Tracking-Parameter, Query-Reihenfolge, http/https ab).
  const byKey = new Map();
  for (const p of union.paths) {
    const k = collisionKey(p.url);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, new Map());
    byKey.get(k).set(p.id, p.src);
  }
  for (const [k, ids] of byKey) if (ids.size > 1) out.url.push({ key: k, paths: [...ids.entries()].map(([id, src]) => `${id}@${src}`) });

  return out;
}

// Hilfsfunktion: alle Schluessel, die (ueber die gesamte Vereinigung) mehr als einmal
// vorkommen — je mit der Liste ihrer Herkuenfte. Path-/Package-/Entity-IDs muessen global
// eindeutig sein; jedes Zweitvorkommen ist eine Kollision.
function countDup(rows, keyFn) {
  const seen = new Map(); // key -> [src, ...]
  for (const r of rows) {
    const k = keyFn(r);
    if (k === undefined || k === null || k === "") continue;
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(r.src || "?");
  }
  return [...seen.entries()].filter(([, srcs]) => srcs.length > 1);
}

function collisionCount(out) {
  return Object.values(out).reduce((n, arr) => n + arr.length, 0);
}

module.exports = {
  REGISTRY, SEEDS_DIR, ROOT,
  NON_ARCHITECTURE_SEED_ALLOWLIST, SHARED_DOMAIN_EXCEPTIONS,
  EXPLICIT_NON_CATALOG_LEGACY_IDS,
  // SQL-Analyse
  stripSqlComments, stripSqlLiterals, structuralSql, hasDestructive, hasIllegalBareUpdate, detectMutationMode,
  // Kollision
  collisionKey, buildUnion, detectCollisions, collisionCount,
  // Vollstaendigkeit / Pakete
  discoverSeedFiles, registeredArtifacts, checkRegistryCompleteness, missingPackageHooks,
  packageEntries, registryByKey, registeredPackagePathIds, classifyNonCatalogPath,
};
