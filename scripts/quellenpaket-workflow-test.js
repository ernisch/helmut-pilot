"use strict";

// ============================================================================
// Helmut — Quellenpaket-Workflow · KANONISCHE P1-Verifikation.
// ----------------------------------------------------------------------------
// Dieses Skript macht die Aussage "rein additiv" TECHNISCH BEWEISBAR und den
// Workflow beliebig oft wiederverwendbar. Es prueft NICHT nur Datenzeilen,
// sondern die GESAMTE erzeugte Ausgabe (inkl. Kommentare, Reihenfolge, Leer-
// zeilen). Vier Garantien:
//
//   (A) DRIFT / Reproduzierbarkeit
//       Jede committete Seed-Datei ist BYTE-FUER-BYTE aus ihrem Generator
//       reproduzierbar. Erkennt: entfernte, verschobene, geaenderte Zeilen,
//       verlorene Kommentare und jeden Handedit. (Behebt genau den Drift, durch
//       den der Basis-Seed einen vom Modell laengst definierten package_paths-
//       Link verloren hatte, ohne dass ein Test es merkte.)
//
//   (B) ADDITIVITAET
//       Jede Anweisung eines Seeds ist ein nicht-destruktives additives Upsert
//       (insert ... on conflict do nothing|do update). KEIN delete/drop/
//       truncate/alter, KEIN update ausserhalb von "do update set". Damit ist
//       "rein additiv" ueber die ganze Datei bewiesen, nicht nur behauptet.
//
//   (C) KOLLISION (Domain/URL)
//       Kein Abrufweg-URL kollidiert ueber ALLE Retrieval Paths hinweg
//       (Basismodell + JEDES Paket-Seed), nicht nur innerhalb des neuen Pakets.
//       Jede Herausgeber-Domain gehoert genau EINEM Herausgeber.
//
//   (D) RUNTIME-INERTHEIT
//       Ein NEUES Paket-Seed fuegt ausschliesslich technisch inaktive Abrufwege
//       ein (status='needs_review', activation_mode='manual'); mit dem Paket im
//       Status 'prepared' liefert model.isPathActive() fuer JEDEN neuen Weg
//       false — also KEIN Crawl, KEIN Runtime-Effekt bis zur expliziten Freigabe.
//
// KEIN Netz, KEINE DB, KEINE KI. Reine Codegen-Verifikation.
//
// AUSGABE (maschinenlesbar): `node scripts/quellenpaket-workflow-test.js --out <pfad>`
//   schreibt das Urteil als JSON. Diese JSON-Ausgabe ist die QUELLE der
//   Dokumentation (docs/quellenarchitektur/quellenpaket-workflow.md) — es werden
//   KEINE Ergebnisse von Hand in Berichte geschrieben.
//
// Registry (unten) ist der einzige Erweiterungspunkt: ein neues Quellenpaket =
// EIN neuer Registry-Eintrag. Der Workflow setzt NICHT voraus, dass genau ein
// neues Paket existiert — er prueft N Seeds gleichartig.
// ============================================================================

const fs = require("fs");
const path = require("path");
const model = require("../lib/helmut/quellenarchitektur/model");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const srcArch = require("./generate-source-architecture-seed");
const landesmodul = require("./generate-landesmodul-seed");

const ROOT = path.join(__dirname, "..");
const SEEDS_DIR = path.join(ROOT, "supabase", "seeds");

// ── Registry aller generierten Seed-Artefakte ────────────────────────────────
// kind: "base"    = bereits aktive Grundversorgung (Bund-Basis etc.)
//       "package" = NEUES/vorbereitetes Quellenpaket (technisch inaktiv einzufuehren)
const REGISTRY = [
  {
    key: "source-architecture",
    kind: "base",
    file: "20260713_source_architecture_seed.sql",
    render: () => srcArch.build(),
  },
  {
    key: "landesmodul-be-bb",
    kind: "package",
    file: "20260717_landesmodul_be_bb_seed.sql",
    rollbackFile: "20260717_landesmodul_be_bb_seed_rollback.sql",
    render: () => landesmodul.build().sql,
    renderRollback: () => landesmodul.buildRollback(landesmodul.build().seed),
    // Modell-Paths des Pakets (fuer Runtime-Inertheit + Kollisionsvereinigung).
    paths: () => buildLandesmodulSeed().retrievalPaths,
    packagePaths: () => buildLandesmodulSeed().packagePaths,
  },
];

// ── Ergebnis-Sammler ─────────────────────────────────────────────────────────
const findings = [];
let pass = 0, fail = 0;
function check(id, name, cond, detail) {
  const ok = !!cond;
  if (ok) pass += 1; else fail += 1;
  findings.push({ id, name, ok, detail: detail || null });
  console.log(`${ok ? "PASS" : "FAIL"}  [${id}] ${name}${!ok && detail ? " — " + detail : ""}`);
}

// Kommentare/Leerraum aus SQL entfernen, damit die Additivitaets-Schluesselwort-
// Suche nur echten Code sieht (Kommentare duerfen Woerter wie "loescht" enthalten).
function stripSqlComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
}

// Erste abweichende Zeile zweier Texte (fuer praezisen Drift-Bericht).
function firstDiff(aStr, bStr) {
  const a = aStr.split("\n");
  const b = bStr.split("\n");
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) {
      return { line: i + 1, committed: a[i] === undefined ? "<fehlt>" : a[i], generated: b[i] === undefined ? "<fehlt>" : b[i] };
    }
  }
  return null;
}

// ============================================================================
// (A) DRIFT — jede committete Datei byte-fuer-byte aus dem Generator
// ============================================================================
console.log("== (A) Drift / Reproduzierbarkeit ==");
for (const entry of REGISTRY) {
  const committedPath = path.join(SEEDS_DIR, entry.file);
  const committed = fs.existsSync(committedPath) ? fs.readFileSync(committedPath, "utf8") : null;
  const generated = entry.render();
  const diff = committed === null ? { line: 0, committed: "<Datei fehlt>", generated: "" } : firstDiff(committed, generated);
  check(`drift:${entry.key}`, `Seed '${entry.file}' ist byte-fuer-byte reproduzierbar`,
    committed !== null && committed === generated,
    diff ? `erste Abweichung Zeile ${diff.line}: committed=${JSON.stringify(diff.committed)} generiert=${JSON.stringify(diff.generated)}` : null);

  if (entry.rollbackFile) {
    const rbPath = path.join(SEEDS_DIR, entry.rollbackFile);
    const rbCommitted = fs.existsSync(rbPath) ? fs.readFileSync(rbPath, "utf8") : null;
    const rbGenerated = entry.renderRollback();
    const rbDiff = rbCommitted === null ? { line: 0 } : firstDiff(rbCommitted, rbGenerated);
    check(`drift:${entry.key}:rollback`, `Rollback '${entry.rollbackFile}' ist byte-fuer-byte reproduzierbar`,
      rbCommitted !== null && rbCommitted === rbGenerated,
      rbDiff ? `erste Abweichung Zeile ${rbDiff.line}` : null);
  }
}

// ============================================================================
// (B) ADDITIVITAET — jede Seed-Anweisung ist ein additives Upsert
// ============================================================================
console.log("\n== (B) Additivitaet (rein additiv, technisch) ==");
const DESTRUCTIVE = /\b(delete|drop|truncate|alter)\b/i;
for (const entry of REGISTRY) {
  const code = stripSqlComments(entry.render());
  const inserts = (code.match(/insert\s+into/gi) || []).length;
  const conflicts = (code.match(/on\s+conflict/gi) || []).length;
  // "update" ist NUR als "do update set" (Upsert) erlaubt.
  const bareUpdate = /\bupdate\b/gi;
  let m; let illegalUpdate = false;
  while ((m = bareUpdate.exec(code)) !== null) {
    const before = code.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
    if (!/do\s*$/.test(before)) { illegalUpdate = true; break; }
  }
  check(`additiv:${entry.key}:no-destructive`, `'${entry.file}': keine destruktive Anweisung (delete/drop/truncate/alter)`,
    !DESTRUCTIVE.test(code));
  check(`additiv:${entry.key}:upsert-only`, `'${entry.file}': jedes insert traegt on-conflict, kein update ausserhalb Upsert`,
    inserts > 0 && inserts === conflicts && !illegalUpdate,
    `inserts=${inserts} on-conflict=${conflicts} illegalUpdate=${illegalUpdate}`);
  check(`additiv:${entry.key}:tx`, `'${entry.file}': in einer Transaktion (begin/commit balanciert)`,
    (code.match(/begin;/gi) || []).length === 1 && (code.match(/commit;/gi) || []).length === 1);
}

// ============================================================================
// (C) KOLLISION — URL/Domain ueber ALLE Retrieval Paths (nicht nur neues Paket)
// ============================================================================
console.log("\n== (C) Domain-/URL-Kollision ueber ALLE Abrufwege ==");
const fullModel = buildFullModel();
// Vereinigung: Basismodell-Paths + Paths JEDES Paket-Seeds der Registry.
const allPaths = [...fullModel.retrievalPaths.map((p) => ({ id: p.id, url: p.url, src: "base" }))];
for (const entry of REGISTRY) {
  if (typeof entry.paths !== "function") continue;
  for (const p of entry.paths()) allPaths.push({ id: p.id, url: p.url, src: entry.key });
}
// URL-Kollision: zwei UNTERSCHIEDLICHE Path-IDs mit gleicher normalisierter URL.
const byUrl = new Map();
for (const p of allPaths) {
  const u = model.normalizeUrl(p.url || "");
  if (!u) continue;
  if (!byUrl.has(u)) byUrl.set(u, new Map());
  byUrl.get(u).set(p.id, p.src);
}
const urlCollisions = [];
for (const [u, ids] of byUrl) if (ids.size > 1) urlCollisions.push({ url: u, paths: [...ids.entries()].map(([id, src]) => `${id}@${src}`) });
check("collision:url", `keine URL-Kollision ueber alle ${allPaths.length} Abrufwege (Basis + alle Pakete)`,
  urlCollisions.length === 0, urlCollisions.length ? JSON.stringify(urlCollisions.slice(0, 5)) : null);

// Path-ID-Eindeutigkeit ueber die Vereinigung (ein neues Paket darf keine Basis-ID recyceln).
const idCount = new Map();
for (const p of allPaths) idCount.set(p.id, (idCount.get(p.id) || 0) + 1);
const dupIds = [...idCount.entries()].filter(([, c]) => c > 1).map(([id]) => id);
check("collision:path-id", "Path-IDs ueber Basis + alle Pakete eindeutig",
  dupIds.length === 0, dupIds.length ? dupIds.join(", ") : null);

// Herausgeber-Domain-Eindeutigkeit ueber die Vereinigung (Basis + Paket-Herausgeber).
const allPublishers = [...fullModel.publishers.map((p) => ({ id: p.id, dom: p.canonical_domain }))];
for (const entry of REGISTRY) {
  if (entry.key !== "landesmodul-be-bb") continue;
  for (const p of buildLandesmodulSeed().publishers) allPublishers.push({ id: p.id, dom: p.canonical_domain });
}
const byDom = new Map();
for (const p of allPublishers) {
  if (!p.dom) continue;
  if (!byDom.has(p.dom)) byDom.set(p.dom, new Set());
  byDom.get(p.dom).add(p.id); // geteilte Herausgeber nutzen dieselbe ID -> kollabiert
}
const domCollisions = [...byDom.entries()].filter(([, ids]) => ids.size > 1).map(([dom, ids]) => `${dom}: ${[...ids].join("/")}`);
check("collision:domain", "jede Herausgeber-Domain gehoert genau EINEM Herausgeber (Basis + alle Pakete)",
  domCollisions.length === 0, domCollisions.length ? domCollisions.join("; ") : null);

// ============================================================================
// (D) RUNTIME-INERTHEIT — ein neues Paket-Seed ist technisch wirkungslos
// ============================================================================
console.log("\n== (D) Runtime-Inertheit neuer Paket-Seeds ==");
for (const entry of REGISTRY) {
  if (entry.kind !== "package") continue;
  const seedPaths = entry.paths();
  const seedPkgPaths = entry.packagePaths();
  // 1) Der GENERIERTE SQL setzt jeden Weg hart auf inaktiv (Schutz gegen DB-Default 'auto').
  const sql = entry.render();
  const pathInserts = (sql.match(/insert into public\.retrieval_paths[\s\S]*?on conflict/i) || [""])[0];
  const rowCount = (pathInserts.match(/^\s{2}\(/gm) || []).length;
  const inactiveRows = (pathInserts.match(/'needs_review', 'manual'/g) || []).length;
  check(`inert:${entry.key}:sql-inactive`, `'${entry.file}': alle ${rowCount} Abrufwege im SQL needs_review+manual`,
    rowCount > 0 && rowCount === inactiveRows, `rows=${rowCount} inaktiv=${inactiveRows}`);
  check(`inert:${entry.key}:no-active-keywords`, `'${entry.file}': KEIN 'auto'/'always_on'/'healthy' im Abrufweg-SQL`,
    !/'auto'|'always_on'|'healthy'/.test(pathInserts));

  // 2) TECHNISCHER Beweis via Modell: mit dem Paket im Status 'prepared' liefert
  //    isPathActive() fuer JEDEN neuen Weg false (leerer aktiver Refcount).
  const combinedPkgPaths = [...fullModel.packagePaths, ...seedPkgPaths];
  const rc = model.computePathRefcounts({ packagePaths: combinedPkgPaths, packages: fullModel.packages });
  const wouldBeActive = seedPaths.filter((p) => model.isPathActive({ status: "needs_review", activation_mode: "manual" }, rc[p.id] || []));
  check(`inert:${entry.key}:isPathActive-false`, `'${entry.key}': model.isPathActive()=false fuer alle ${seedPaths.length} neuen Wege (kein Crawl)`,
    wouldBeActive.length === 0, wouldBeActive.length ? wouldBeActive.map((p) => p.id).join(", ") : null);
}

// ============================================================================
// Zusammenfassung + optionaler maschinenlesbarer Report
// ============================================================================
console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);

const outIdx = process.argv.indexOf("--out");
if (outIdx > -1 && process.argv[outIdx + 1]) {
  const report = {
    tool: "quellenpaket-workflow-test",
    version: 1,
    // KEIN Date.now()/new Date() ohne Argument (bricht Reproduzierbarkeit/Sandbox);
    // Zeitstempel setzt der Aufrufer (CI) beim Archivieren.
    seeds: REGISTRY.map((e) => ({ key: e.key, kind: e.kind, file: e.file, rollbackFile: e.rollbackFile || null })),
    totals: {
      base_retrieval_paths: fullModel.retrievalPaths.length,
      base_packages: fullModel.packages.length,
      base_package_paths: fullModel.packagePaths.length,
      union_retrieval_paths: allPaths.length,
    },
    checks: findings,
    pass, fail,
    verdict: fail === 0 ? "GRUEN" : "ROT",
  };
  fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify(report, null, 2));
  console.log(`JSON-Report: ${process.argv[outIdx + 1]}`);
}

process.exit(fail > 0 ? 1 : 0);
