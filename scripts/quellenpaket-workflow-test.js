"use strict";

// ============================================================================
// Helmut — Quellenpaket-Workflow · KANONISCHE P1-Verifikation (gehaertet).
// ----------------------------------------------------------------------------
// Beweist die Sicherheitsgarantien eines Quellenpaket-Seeds TECHNISCH und macht den
// Workflow beliebig oft wiederverwendbar. Prueft die GESAMTE erzeugte Ausgabe (inkl.
// Kommentare, Reihenfolge, Leerzeilen) sowie die REGISTRY selbst — fail-closed.
//
//   (0) VOLLSTAENDIGKEIT (fail-closed, §4/§5)
//       Jeder relevante Seed unter supabase/seeds/ ist registriert und hat einen
//       Generator/Build-Weg; jeder Registry-Eintrag zeigt auf ein vorhandenes Artefakt;
//       jeder kind:"package"-Eintrag traegt ALLE fuer die Garantien noetigen Hooks
//       (packageId/paths/packagePaths/publishers/render/Zielartefakt). Verwaister Seed
//       oder fehlender Hook -> ROT. Keine stillen Ueberspringungen.
//
//   (A) DRIFT / Reproduzierbarkeit
//       Jede committete Seed-Datei ist BYTE-FUER-BYTE aus ihrem Generator reproduzierbar.
//
//   (B) ADDITIVITAET + MUTATIONSMODUS (§9)
//       Kein destruktives Statement (delete/drop/truncate/alter/merge), kein bare update
//       ausserhalb `do update set`. Der TATSAECHLICHE Mutationsmodus jedes Seeds wird aus
//       dem SQL gemessen (insert_only vs. upsert_update) und gegen den erwarteten geprueft.
//       Der Basis-Seed ist ein reproduzierbarer UPSERT-Seed (DO UPDATE) — NICHT insert-only.
//
//   (C) KOLLISION (paketgenerisch, §6)
//       Ueber die VEREINIGUNG aller registrierten Basis- + Paketdefinitionen: eindeutige
//       Path-/Package-/Entity-IDs, Slugs, (scoped) Canonical Keys; jede Domain genau EIN
//       Herausgeber (ausser begruendete Shared-Domain-Ausnahme); keine URL-Dublette ueber
//       den schema-insensitiven Schluessel (exakt/normalisiert/www/Trailing-Slash/Tracking/
//       Query-Reihenfolge/http-https). REDIRECT-Dubletten sind offline NICHT erkennbar —
//       Bestandteil der spaeteren Live-Verifikation je Paket (siehe Doku).
//
//   (D) RUNTIME-INERTHEIT
//       Jedes vorbereitete Paket fuegt ausschliesslich technisch inaktive Abrufwege ein
//       (status='needs_review', activation_mode='manual'); mit dem Paket 'prepared' liefert
//       model.isPathActive() fuer JEDEN Weg false — kein Crawl bis zur expliziten Freigabe.
//
// KEIN Netz, KEINE DB, KEINE KI, KEIN Date.now()/Math.random(). Reine Codegen-Verifikation.
//
// AUSGABE (maschinenlesbar): `node scripts/quellenpaket-workflow-test.js --out <pfad> [--sha <git-sha>]`
//   schreibt das Urteil als JSON. Die Registry (scripts/quellenpaket-registry.js) ist der
//   EINZIGE Erweiterungspunkt: ein neues Quellenpaket = EIN neuer Registry-Eintrag.
// ============================================================================

const fs = require("fs");
const path = require("path");
const model = require("../lib/helmut/quellenarchitektur/model");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");
const registry = require("./quellenpaket-registry");
const {
  REGISTRY, SEEDS_DIR, NON_ARCHITECTURE_SEED_ALLOWLIST, SHARED_DOMAIN_EXCEPTIONS,
  checkRegistryCompleteness, missingPackageHooks, packageEntries, registryByKey,
  hasDestructive, hasIllegalBareUpdate, detectMutationMode,
  buildUnion, detectCollisions, collisionCount,
} = registry;

// ── Ergebnis-Sammler ─────────────────────────────────────────────────────────
const findings = [];
let pass = 0, fail = 0;
function check(id, name, cond, detail) {
  const ok = !!cond;
  if (ok) pass += 1; else fail += 1;
  findings.push({ id, name, ok, detail: detail || null });
  console.log(`${ok ? "PASS" : "FAIL"}  [${id}] ${name}${!ok && detail ? " — " + detail : ""}`);
}

function firstDiff(aStr, bStr) {
  const a = String(aStr).split("\n"), b = String(bStr).split("\n");
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) return { line: i + 1, committed: a[i] === undefined ? "<fehlt>" : a[i], generated: b[i] === undefined ? "<fehlt>" : b[i] };
  }
  return null;
}

// SQL, das ein Registry-Eintrag materialisiert: eigener render() ODER der des providedBySeed.
function seedSqlFor(entry) {
  if (typeof entry.render === "function") return entry.render();
  if (entry.providedBySeed) {
    const provider = registryByKey(entry.providedBySeed);
    if (provider && typeof provider.render === "function") return provider.render();
  }
  return null;
}
function seedFileFor(entry) {
  return entry.file || entry.seedFile || (entry.providedBySeed && (registryByKey(entry.providedBySeed) || {}).file) || null;
}

// Abrufweg-Zeilen aus dem retrieval_paths-INSERT-Block extrahieren: id -> Zeilentext.
function extractRetrievalRows(sql) {
  const block = (String(sql).match(/insert into public\.retrieval_paths[\s\S]*?on conflict/i) || [""])[0];
  const rows = new Map();
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*\('([^']+)',/);
    if (m) rows.set(m[1], line);
  }
  return rows;
}

function run() {
  const fullModel = buildFullModel();

  // ==========================================================================
  // (0) VOLLSTAENDIGKEIT — fail-closed Registry <-> Artefakt + Paket-Hooks
  // ==========================================================================
  console.log("== (0) Vollstaendigkeit (fail-closed) ==");
  const completeness = checkRegistryCompleteness({ registry: REGISTRY, seedsDir: SEEDS_DIR, allowlist: NON_ARCHITECTURE_SEED_ALLOWLIST });
  check("registry:no-orphan-seed", "kein verwaister Seed unter supabase/seeds/ (jeder registriert oder begruendet allowlisted)",
    completeness.orphanSeeds.length === 0, completeness.orphanSeeds.join(", "));
  check("registry:no-missing-artifact", "jeder Registry-Eintrag zeigt auf ein vorhandenes Artefakt",
    completeness.missingArtifacts.length === 0, completeness.missingArtifacts.join(", "));
  for (const entry of packageEntries(REGISTRY)) {
    const missing = missingPackageHooks(entry);
    check(`registry:hooks:${entry.key}`, `Paket '${entry.key}' traegt alle Pflicht-Hooks (packageId/paths/packagePaths/publishers/render/Zielartefakt)`,
      missing.length === 0, missing.length ? `fehlt: ${missing.join(", ")}` : null);
    // Das im Modell vorhandene Paket muss existieren + 'prepared' sein.
    const pkg = fullModel.packages.find((p) => p.id === entry.packageId);
    check(`registry:pkg-present:${entry.key}`, `Paket '${entry.packageId}' existiert im Modell und ist 'prepared'`,
      !!pkg && pkg.status === "prepared", pkg ? `status=${pkg.status}` : "Paket fehlt im Modell");
  }
  // Das WBSB-Pilotpaket MUSS in der Pruefung tatsaechlich enthalten sein.
  check("registry:wbsb-registered", "Wohnungs-Paket ist als vorbereitetes Paket registriert (nicht nur dokumentiert)",
    packageEntries(REGISTRY).some((e) => e.packageId === "pkg-wohnen-bauen-stadtentwicklung-bund"));

  // ==========================================================================
  // (A) DRIFT — jede committete Datei byte-fuer-byte aus dem Generator
  // ==========================================================================
  console.log("\n== (A) Drift / Reproduzierbarkeit ==");
  const reproducible = new Map(); // key -> bool|null
  for (const entry of REGISTRY) {
    if (typeof entry.render !== "function") { reproducible.set(entry.key, null); continue; }
    const committedPath = path.join(SEEDS_DIR, entry.file);
    const committed = fs.existsSync(committedPath) ? fs.readFileSync(committedPath, "utf8") : null;
    const generated = entry.render();
    const ok = committed !== null && committed === generated;
    reproducible.set(entry.key, ok);
    const diff = committed === null ? { line: 0, committed: "<Datei fehlt>", generated: "" } : firstDiff(committed, generated);
    check(`drift:${entry.key}`, `Seed '${entry.file}' ist byte-fuer-byte reproduzierbar`, ok,
      diff ? `erste Abweichung Zeile ${diff.line}: committed=${JSON.stringify(diff.committed)} generiert=${JSON.stringify(diff.generated)}` : null);
    if (entry.rollbackFile) {
      const rbPath = path.join(SEEDS_DIR, entry.rollbackFile);
      const rbCommitted = fs.existsSync(rbPath) ? fs.readFileSync(rbPath, "utf8") : null;
      const rbGenerated = entry.renderRollback();
      const rbOk = rbCommitted !== null && rbCommitted === rbGenerated;
      const rbDiff = rbCommitted === null ? { line: 0 } : firstDiff(rbCommitted, rbGenerated);
      check(`drift:${entry.key}:rollback`, `Rollback '${entry.rollbackFile}' ist byte-fuer-byte reproduzierbar`, rbOk,
        rbDiff ? `erste Abweichung Zeile ${rbDiff.line}` : null);
    }
  }

  // ==========================================================================
  // (B) ADDITIVITAET + MUTATIONSMODUS (§9)
  // ==========================================================================
  console.log("\n== (B) Additivitaet + tatsaechlicher Mutationsmodus ==");
  const mutationModes = new Map();
  const destructiveFlags = new Map();
  for (const entry of REGISTRY) {
    if (typeof entry.render !== "function") continue; // nur Eintraege mit eigenem Artefakt
    const sql = entry.render();
    const destructive = hasDestructive(sql);
    const mode = detectMutationMode(sql);
    mutationModes.set(entry.key, mode);
    destructiveFlags.set(entry.key, destructive);
    check(`additiv:${entry.key}:no-destructive`, `'${entry.file}': keine destruktive Anweisung (delete/drop/truncate/alter/merge)`,
      !destructive);
    check(`additiv:${entry.key}:no-bare-update`, `'${entry.file}': kein update ausserhalb 'do update set' (Upsert)`,
      !hasIllegalBareUpdate(sql));
    check(`additiv:${entry.key}:mode`, `'${entry.file}': gemessener Mutationsmodus '${mode}' == erwartet '${entry.expectedMutationMode}'`,
      mode === entry.expectedMutationMode, `gemessen=${mode} erwartet=${entry.expectedMutationMode}`);
    const s = registry.structuralSql(sql);
    check(`additiv:${entry.key}:tx`, `'${entry.file}': in einer Transaktion (begin/commit balanciert)`,
      (s.match(/begin;/gi) || []).length === 1 && (s.match(/commit;/gi) || []).length === 1);
  }

  // ==========================================================================
  // (C) KOLLISION — paketgenerisch ueber die Vereinigung (§6)
  // ==========================================================================
  console.log("\n== (C) Kollision (paketgenerisch, Basis + alle Pakete) ==");
  const union = buildUnion(fullModel, REGISTRY);
  const collisions = detectCollisions(union, SHARED_DOMAIN_EXCEPTIONS);
  check("collision:path-id", `Path-IDs eindeutig ueber alle ${union.paths.length} Wege (Basis + alle Pakete)`,
    collisions.pathId.length === 0, collisions.pathId.join("; "));
  check("collision:package-id", "Package-IDs eindeutig ueber Basis + alle Pakete",
    collisions.packageId.length === 0, collisions.packageId.join("; "));
  check("collision:entity-id", "Entity-IDs eindeutig ueber Basis + alle Pakete",
    collisions.entityId.length === 0, collisions.entityId.join("; "));
  check("collision:slug", "Paket-Slugs (source_packages.key) eindeutig",
    collisions.slug.length === 0, collisions.slug.join("; "));
  check("collision:canonical-key", "Canonical Keys eindeutig je (key|typ|geografie)",
    collisions.canonicalKey.length === 0, collisions.canonicalKey.join("; "));
  check("collision:publisher-id-domain", "jede Herausgeber-ID zeigt auf genau EINE Domain",
    collisions.publisherIdDomain.length === 0, collisions.publisherIdDomain.join("; "));
  check("collision:domain-publishers", "jede Domain gehoert genau EINEM Herausgeber (ausser begruendete Shared-Domain-Ausnahme)",
    collisions.domainPublishers.length === 0, collisions.domainPublishers.join("; "));
  check("collision:url", `keine URL-Dublette ueber schema-insensitiven Schluessel (${union.paths.length} Wege)`,
    collisions.url.length === 0, collisions.url.length ? JSON.stringify(collisions.url.slice(0, 5)) : null);

  // ==========================================================================
  // (D) RUNTIME-INERTHEIT — jedes vorbereitete Paket ist technisch wirkungslos
  // ==========================================================================
  console.log("\n== (D) Runtime-Inertheit vorbereiteter Pakete ==");
  const inertFlags = new Map();
  for (const entry of packageEntries(REGISTRY)) {
    const seedPaths = entry.paths();
    const seedPkgPaths = entry.packagePaths();
    // 1) Modell-Beweis: mit dem Paket 'prepared' liefert isPathActive() fuer JEDEN Weg false.
    const combinedPkgPaths = [...fullModel.packagePaths, ...seedPkgPaths];
    const rc = model.computePathRefcounts({ packagePaths: combinedPkgPaths, packages: fullModel.packages });
    const active = seedPaths.filter((p) => model.isPathActive({ status: "needs_review", activation_mode: "manual" }, rc[p.id] || []));
    const inertModel = active.length === 0;
    check(`inert:${entry.key}:isPathActive-false`, `'${entry.key}': isPathActive()=false fuer alle ${seedPaths.length} Wege (kein Crawl)`,
      inertModel, active.length ? active.map((p) => p.id).join(", ") : null);
    // 2) SQL-Beweis: im materialisierten Seed traegt JEDER Paket-Weg needs_review+manual und
    //    KEIN 'auto'/'always_on'/'healthy' (Schutz gegen DB-Default). Fuer WBSB werden nur die
    //    WBSB-Zeilen im Basis-Seed betrachtet (nicht die aktiven Basiswege).
    const seedFile = seedFileFor(entry);
    let inertSql = false;
    if (seedFile && fs.existsSync(path.join(SEEDS_DIR, seedFile))) {
      const sql = fs.readFileSync(path.join(SEEDS_DIR, seedFile), "utf8");
      const rows = extractRetrievalRows(sql);
      const bad = seedPaths.filter((p) => {
        const row = rows.get(p.id);
        return !row || !/'needs_review'/.test(row) || !/'manual'/.test(row) || /'auto'|'always_on'|'healthy'/.test(row);
      });
      inertSql = bad.length === 0;
      check(`inert:${entry.key}:sql-inactive`, `'${seedFile}': alle ${seedPaths.length} '${entry.key}'-Wege needs_review+manual, kein auto/always_on/healthy`,
        inertSql, bad.length ? bad.map((p) => p.id).join(", ") : null);
    } else {
      check(`inert:${entry.key}:sql-inactive`, `Seed-Datei fuer '${entry.key}' vorhanden`, false, `fehlt: ${seedFile}`);
    }
    inertFlags.set(entry.key, inertModel && inertSql);
  }

  return { fullModel, union, collisions, reproducible, mutationModes, destructiveFlags, inertFlags };
}

// ============================================================================
// Ausfuehrung mit Fehlerbericht-Absicherung (§11): stuerzt die Pruefung vor dem
// normalen JSON-Schreiben ab, wird ein MINIMALER Fehlerbericht geschrieben, das
// Ergebnis rot markiert und mit Exit 1 beendet — CI faellt nie still durch.
// ============================================================================
const outIdx = process.argv.indexOf("--out");
const outPath = outIdx > -1 ? process.argv[outIdx + 1] : null;
const shaIdx = process.argv.indexOf("--sha");
const gitSha = (shaIdx > -1 ? process.argv[shaIdx + 1] : null) || process.env.GITHUB_SHA || null;

function writeReport(report) {
  if (!outPath) return;
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`JSON-Report: ${outPath}`);
}

try {
  const ctx = run();
  console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);

  const report = {
    tool: "quellenpaket-workflow-test",
    schema_version: 2,
    git_sha: gitSha,
    status: "completed",
    verdict: fail === 0 ? "GRUEN" : "ROT",
    pass, fail,
    totals: {
      base_retrieval_paths: ctx.fullModel.retrievalPaths.length,
      base_packages: ctx.fullModel.packages.length,
      base_package_paths: ctx.fullModel.packagePaths.length,
      union_retrieval_paths: ctx.union.paths.length,
      union_publishers: ctx.union.publishers.length,
      union_entities: ctx.union.entities.length,
      collision_count: collisionCount(ctx.collisions),
    },
    // §9: pro Seed der TATSAECHLICHE Modus + Sicherheitsattribute.
    seeds: REGISTRY.map((e) => ({
      key: e.key,
      kind: e.kind,
      file: e.file || e.seedFile || null,
      rollbackFile: e.rollbackFile || null,
      package_id: e.packageId || null,
      is_package: e.kind === "package",
      reproducible: ctx.reproducible.get(e.key) != null
        ? ctx.reproducible.get(e.key)
        : (e.providedBySeed && ctx.reproducible.get(e.providedBySeed) != null ? ctx.reproducible.get(e.providedBySeed) : null),
      destructive_statements: ctx.destructiveFlags.has(e.key)
        ? ctx.destructiveFlags.get(e.key)
        : (e.providedBySeed && ctx.destructiveFlags.has(e.providedBySeed) ? ctx.destructiveFlags.get(e.providedBySeed) : false),
      mutation_mode: ctx.mutationModes.has(e.key) ? ctx.mutationModes.get(e.key)
        : (e.providedBySeed ? (ctx.mutationModes.get(e.providedBySeed) || null) : null),
      expected_mutation_mode: e.expectedMutationMode || null,
      runtime_inert: e.kind === "package" ? (ctx.inertFlags.get(e.key) || false) : null,
    })),
    // §6-Grenze ehrlich dokumentiert (kein Overclaim):
    offline_limits: {
      redirect_duplicates: "offline NICHT erkennbar — Bestandteil der Live-Verifikation je Paket",
    },
    checks: findings,
  };
  writeReport(report);
  process.exit(fail > 0 ? 1 : 0);
} catch (err) {
  // §11: minimaler, roter Fehlerbericht statt stillem Durchrutschen.
  console.error(`FATAL  Pruefsystem abgestuerzt: ${err && err.stack ? err.stack : err}`);
  writeReport({
    tool: "quellenpaket-workflow-test",
    schema_version: 2,
    git_sha: gitSha,
    status: "crashed",
    verdict: "ROT",
    pass, fail: Math.max(fail, 1),
    error: String(err && err.message ? err.message : err),
    checks: findings,
  });
  process.exit(1);
}
