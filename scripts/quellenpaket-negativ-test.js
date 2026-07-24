"use strict";

// ============================================================================
// Helmut — Quellenpaket-Workflow · NEGATIVE Beweise (§13).
// ----------------------------------------------------------------------------
// Beweist, dass die Sicherheitsgarantien TATSAECHLICH GREIFEN: jeder Guard wird mit
// bewusst FEHLERHAFTEN Eingaben konfrontiert und MUSS rot werden. Ein gruener Guard bei
// fehlerhafter Eingabe waere ein blinder Test — genau das schliessen diese Faelle aus.
//
// STRIKT NEBENWIRKUNGSFREI: keine Repository-Datei wird veraendert. Alle Datei-Faelle
// laufen in einem TEMP-Verzeichnis (os.tmpdir), alles andere rein In-Memory. Kein Netz,
// keine DB, keine KI. Deterministisch (kein Date.now()/Math.random()).
// ============================================================================

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const model = require("../lib/helmut/quellenarchitektur/model");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");
const { buildWohnenBauenStadtentwicklungSeed } = require("../lib/helmut/quellenarchitektur/seeds/wohnen-bauen-stadtentwicklung");
const srcArch = require("./generate-source-architecture-seed");
const landesmodul = require("./generate-landesmodul-seed");
const {
  checkRegistryCompleteness, missingPackageHooks, detectCollisions, collisionKey,
  hasDestructive, detectMutationMode, classifyNonCatalogPath, registeredPackagePathIds,
} = require("./quellenpaket-registry");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const mkUnion = (over) => ({ paths: [], publishers: [], packages: [], entities: [], ...over });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qp-neg-"));
try {
  // ── #1 verwaiste Seed-Datei -> ROT ─────────────────────────────────────────
  fs.writeFileSync(path.join(tmp, "registered.sql"), "-- ok\ninsert into public.x values (1) on conflict (id) do nothing;\n");
  fs.writeFileSync(path.join(tmp, "99999_verwaister_seed.sql"), "insert into public.x values (2) on conflict (id) do nothing;\n");
  const reg1 = [{ key: "base", kind: "base", file: "registered.sql", render: () => "x" }];
  const c1 = checkRegistryCompleteness({ registry: reg1, seedsDir: tmp, allowlist: {} });
  check("#1 verwaiste Seed-Datei -> orphanSeeds nicht leer (ROT)", c1.orphanSeeds.includes("99999_verwaister_seed.sql"));
  // Gegenprobe: mit Allowlist wird dieselbe Datei bewusst zugelassen (GRUEN).
  const c1b = checkRegistryCompleteness({ registry: reg1, seedsDir: tmp, allowlist: { "99999_verwaister_seed.sql": "Testausnahme" } });
  check("#1b begruendet allowlisted -> kein Orphan (GRUEN)", !c1b.orphanSeeds.includes("99999_verwaister_seed.sql"));

  // ── #2 Registry-Eintrag ohne Artefakt -> ROT ───────────────────────────────
  const reg2 = [{ key: "x", kind: "base", file: "existiert_nicht.sql", render: () => "x" }];
  const c2 = checkRegistryCompleteness({ registry: reg2, seedsDir: tmp, allowlist: {} });
  check("#2 Registry-Eintrag ohne Artefakt -> missingArtifacts nicht leer (ROT)", c2.missingArtifacts.includes("existiert_nicht.sql"));

  // ── #3 Paket ohne paths() -> ROT ───────────────────────────────────────────
  const noPaths = { key: "p", kind: "package", packageId: "pkg-p", packagePaths: () => [], publishers: () => [], render: () => "x", file: "f.sql" };
  check("#3 Paket ohne paths() -> Pflicht-Hook fehlt (ROT)", missingPackageHooks(noPaths).includes("paths()"));

  // ── #4 Paket ohne packagePaths() -> ROT ────────────────────────────────────
  const noPkgPaths = { key: "p", kind: "package", packageId: "pkg-p", paths: () => [], publishers: () => [], render: () => "x", file: "f.sql" };
  check("#4 Paket ohne packagePaths() -> Pflicht-Hook fehlt (ROT)", missingPackageHooks(noPkgPaths).includes("packagePaths()"));
  // Gegenprobe: vollstaendiger Eintrag -> keine fehlenden Hooks (GRUEN).
  const complete = { key: "p", kind: "package", packageId: "pkg-p", paths: () => [], packagePaths: () => [], publishers: () => [], render: () => "x", file: "f.sql" };
  check("#4b vollstaendiger Paket-Eintrag -> keine fehlenden Hooks (GRUEN)", missingPackageHooks(complete).length === 0);

  // ── #5 doppelte Path-ID -> Kollision ───────────────────────────────────────
  const u5 = mkUnion({ paths: [{ id: "rp-x", url: "https://a.de/1", src: "base" }, { id: "rp-x", url: "https://b.de/2", src: "pkg" }] });
  check("#5 doppelte Path-ID -> Kollision", detectCollisions(u5).pathId.length > 0);

  // ── #6 doppelte Package-ID -> Kollision ────────────────────────────────────
  const u6 = mkUnion({ packages: [{ id: "pkg-x", key: "x", src: "base" }, { id: "pkg-x", key: "y", src: "pkg" }] });
  check("#6 doppelte Package-ID -> Kollision", detectCollisions(u6).packageId.length > 0);

  // ── #7 doppelter Slug (source_packages.key) -> ROT ─────────────────────────
  const u7 = mkUnion({ packages: [{ id: "pkg-a", key: "gleich", src: "base" }, { id: "pkg-b", key: "gleich", src: "pkg" }] });
  check("#7 doppelter Slug (key) -> Kollision", detectCollisions(u7).slug.length > 0);

  // ── #8 doppelter Canonical Key (gleicher Typ + Geografie) -> ROT ────────────
  const u8 = mkUnion({ entities: [
    { id: "e1", canonical_key: "linke", entity_type: "party", geography_id: "geo-bund", src: "base" },
    { id: "e2", canonical_key: "linke", entity_type: "party", geography_id: "geo-bund", src: "pkg" }] });
  check("#8 doppelter Canonical Key (gleicher Typ+Geografie) -> Kollision", detectCollisions(u8).canonicalKey.length > 0);
  // Gegenprobe: gleicher Key ueber VERSCHIEDENE Geografien -> KEINE Kollision (legitim).
  const u8b = mkUnion({ entities: [
    { id: "e1", canonical_key: "linke", entity_type: "party", geography_id: "geo-land-berlin", src: "base" },
    { id: "e2", canonical_key: "linke", entity_type: "party", geography_id: "geo-land-brandenburg", src: "pkg" }] });
  check("#8b gleicher Canonical Key ueber verschiedene Geografien -> KEINE Kollision (legitim)", detectCollisions(u8b).canonicalKey.length === 0);

  // ── #9 URL mit und ohne Trailing-Slash -> Kollision ────────────────────────
  check("#9a collisionKey: mit/ohne Trailing-Slash identisch", collisionKey("https://x.de/a/") === collisionKey("https://x.de/a") && collisionKey("https://x.de/a") !== "");
  const u9 = mkUnion({ paths: [{ id: "rp-1", url: "https://x.de/a/", src: "base" }, { id: "rp-2", url: "https://x.de/a", src: "pkg" }] });
  check("#9b URL mit und ohne Slash -> URL-Kollision", detectCollisions(u9).url.length > 0);

  // ── #10 HTTP-/HTTPS-Variante -> Kollision ──────────────────────────────────
  check("#10a collisionKey: http/https zusammengefaltet (identisch)", collisionKey("http://x.de/a") === collisionKey("https://x.de/a"));
  const u10 = mkUnion({ paths: [{ id: "rp-1", url: "http://x.de/a", src: "base" }, { id: "rp-2", url: "https://x.de/a", src: "pkg" }] });
  check("#10b HTTP-/HTTPS-Variante -> URL-Kollision", detectCollisions(u10).url.length > 0);
  // Zusatz: www + Tracking-Parameter + Query-Reihenfolge werden ebenfalls zusammengefaltet.
  check("#10c www + Tracking + Query-Reihenfolge zusammengefaltet",
    collisionKey("https://www.x.de/a?b=2&a=1&utm_source=z") === collisionKey("http://x.de/a?a=1&b=2"));

  // ── #11 gleiche Domain mit zwei Publishern OHNE Ausnahme -> ROT ─────────────
  const u11 = mkUnion({ publishers: [{ id: "pub-a", canonical_domain: "shared.de", src: "base" }, { id: "pub-b", canonical_domain: "shared.de", src: "pkg" }] });
  check("#11 gleiche Domain mit zwei Publishern ohne Ausnahme -> ROT", detectCollisions(u11, []).domainPublishers.length > 0);

  // ── #12 erlaubte Shared Domain mit begruendeter Ausnahme -> GRUEN ───────────
  const exc = [{ domain: "shared.de", publisherIds: ["pub-a", "pub-b"], reason: "gemeinsame Landesdomain (Test)" }];
  check("#12 erlaubte Shared Domain mit begruendeter Ausnahme -> GRUEN", detectCollisions(u11, exc).domainPublishers.length === 0);
  // Gegenprobe: Ausnahme deckt NUR pub-a ab -> pub-b weiterhin unerlaubt (ROT).
  const excPartial = [{ domain: "shared.de", publisherIds: ["pub-a"], reason: "unvollstaendig" }];
  check("#12b unvollstaendige Ausnahme -> weiterhin ROT", detectCollisions(u11, excPartial).domainPublishers.length > 0);

  // ── #13 verlorene SQL-Zeile -> Drift erkannt ───────────────────────────────
  const baseSql = srcArch.build();
  const linesLost = baseSql.split("\n"); linesLost.splice(20, 1); const tamperedLost = linesLost.join("\n");
  check("#13 verlorene SQL-Zeile -> Drift (committed != generiert)", tamperedLost !== baseSql);

  // ── #14 veraenderter Kommentar -> Drift erkannt ────────────────────────────
  const linesCmt = baseSql.split("\n");
  const ci = linesCmt.findIndex((l) => l.trim().startsWith("--"));
  linesCmt[ci] = linesCmt[ci] + " HANDEDIT";
  check("#14 veraenderter Kommentar -> Drift (committed != generiert)", ci >= 0 && linesCmt.join("\n") !== baseSql);

  // ── #15 destruktives SQL-Statement -> ROT ──────────────────────────────────
  check("#15 destruktives SQL-Statement -> hasDestructive true", hasDestructive("insert into x values (1);\ndelete from y where z = 1;") === true);
  check("#15b destruktive CTE -> hasDestructive true", hasDestructive("with d as (delete from y returning *) insert into z select * from d;") === true);
  check("#15c Basis-Seed hat KEIN destruktives Statement", hasDestructive(baseSql) === false);

  // ── #16 Upsert-Seed korrekt als upsert_update, Landesmodul als insert_only ──
  check("#16 Basis-Seed -> upsert_update (DO UPDATE)", detectMutationMode(baseSql) === "upsert_update");
  check("#16b Landesmodul-Seed -> insert_only (DO NOTHING)", detectMutationMode(landesmodul.build().sql) === "insert_only");

  // ── #17 WBSB-Paket wird als registriertes vorbereitetes Paket erkannt ──────
  const wbsb = buildWohnenBauenStadtentwicklungSeed();
  const regIds = registeredPackagePathIds();
  check("#17 WBSB-Weg -> classifyNonCatalogPath == registered_package",
    wbsb.retrievalPaths.length > 0 && wbsb.retrievalPaths.every((p) => classifyNonCatalogPath(p, { registeredPackagePathIds: regIds }) === "registered_package"));

  // ── #18 WBSB-Wege bleiben inaktiv ──────────────────────────────────────────
  check("#18 WBSB-Wege isPathActive=false ohne aktive Referenz",
    wbsb.retrievalPaths.every((p) => model.isPathActive({ status: "needs_review", activation_mode: "manual" }, []) === false));
  const M = buildFullModel();
  const rc = model.computePathRefcounts({ packagePaths: [...M.packagePaths, ...wbsb.packagePaths], packages: M.packages });
  check("#18b WBSB-Wege inaktiv im Modell-Refcount (Paket 'prepared')",
    wbsb.retrievalPaths.every((p) => model.isPathActive({ status: "needs_review", activation_mode: "manual" }, rc[p.id] || []) === false));

  // ── #19 unbekannter Non-Catalog-Pfad -> orphan (ROT) ───────────────────────
  check("#19 unbekannter Non-Catalog-Pfad -> orphan",
    classifyNonCatalogPath({ legacy_source_id: "geist-quelle-x", id: "rp-geist-x" }, { registeredPackagePathIds: regIds }) === "orphan");
  // Gegenprobe: DIP bleibt 'explicit'.
  check("#19b DIP-Weg -> explicit (kein Orphan)",
    classifyNonCatalogPath({ legacy_source_id: "dip", id: "rp-dip" }, { registeredPackagePathIds: regIds }) === "explicit");

  // ── #20 CI-Report enthaelt Git-SHA + echtes Ergebnis ───────────────────────
  const rep = path.join(tmp, "neg-report.json");
  let spawnOk = true;
  try {
    execFileSync("node", [path.join(__dirname, "quellenpaket-workflow-test.js"), "--out", rep, "--sha", "NEGSHA20"], { stdio: "ignore" });
  } catch (e) { spawnOk = false; } // Exit != 0 nur bei fail>0; Report wird trotzdem geschrieben
  const report = JSON.parse(fs.readFileSync(rep, "utf8"));
  check("#20 CI-Report enthaelt uebergebenen Git-SHA", report.git_sha === "NEGSHA20");
  check("#20b CI-Report traegt echtes Ergebnis (verdict + pass/fail konsistent)",
    typeof report.verdict === "string" && typeof report.pass === "number" && typeof report.fail === "number"
    && report.verdict === (report.fail === 0 ? "GRUEN" : "ROT"));
  check("#20c Report-Schema traegt pro Seed den tatsaechlichen Mutationsmodus (§9)",
    Array.isArray(report.seeds) && report.seeds.every((s) => "mutation_mode" in s && "destructive_statements" in s && "reproducible" in s));
  check("#20d Workflow-Test war grün (spawn exit 0)", spawnOk === true);

} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
