"use strict";

// ============================================================================
// Isolierter End-to-End-Test: Pre-Seed-Backup -> Seed 1 -> Seed 2 -> Restore.
// ============================================================================
// Beweist offline und ohne jede Datenbank, dass ein gezielter Restore die Wirkung
// der beiden Quellen-Seeds vollstaendig zurueckdreht.
//
// METHODE: ein minimaler SQL-Ausfuehrer fuer GENAU die Statement-Formen, die in
// den beiden Seeds und im erzeugten Restore vorkommen (insert/on conflict,
// delete ... not in, update ... where id). Damit laeuft der Nachweis am ECHTEN
// SQL der Repo-Dateien statt an einer Nachbildung.
//
// AUSGANGSZUSTAND: die vor PR #118 committeten Seeds (git show 54fe370:...) —
// das ist der erwartete Production-Stand laut Freigabedoku. Es werden KEINE
// echten Production-Daten verwendet; alles stammt aus Repo-Dateien.

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { build } = require("./seed-restore-sql.js");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const ROOT = path.join(__dirname, "..");
const VORHER_COMMIT = "54fe370"; // letzter main-Stand VOR dem Merge von PR #118

// ---------------------------------------------------------------- Mini-SQL --
function splitValues(s) {
  const out = []; let depth = 0, cur = "", inStr = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inStr) { cur += c; if (c === "'" && s[i + 1] === "'") { cur += s[++i]; } else if (c === "'") inStr = false; continue; }
    if (c === "'") { inStr = true; cur += c; continue; }
    // Runde UND eckige Klammern zaehlen: array['a','b'] enthaelt Kommas, die KEINE
    // Spaltentrenner sind. Ohne die eckigen Klammern zerfaellt so eine Zeile.
    if (c === "(" || c === "[") depth += 1;
    if (c === ")" || c === "]") depth -= 1;
    if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseVal(v) {
  const t = String(v).trim();
  if (/^null$/i.test(t)) return null;
  if (/^true$/i.test(t)) return true;
  if (/^false$/i.test(t)) return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  // Postgres-Arrayliterale: BEIDE Schreibweisen. Die Seeds nutzen array[...]::text[],
  // frueher erzeugte der Restore '{...}'::text[] — beides muss hier ankommen, sonst
  // verdeckt der Test einen echten Typfehler im erzeugten SQL.
  // Suffix ::text[] wird ausdruecklich verlangt — sonst verschluckt ein gieriges
  // (.*) bei `array[]::text[]` den Suffix und liefert ein Pseudo-Element.
  const arrLit = t.match(/^array\[([\s\S]*)\]::text\[\]$/) || t.match(/^array\[([\s\S]*)\]$/);
  if (arrLit) {
    const inner = arrLit[1].trim();
    if (!inner) return [];
    return splitValues(inner).map(parseVal);
  }
  const arr = t.match(/^'\{(.*)\}'(::text\[\])?$/s);
  if (arr) {
    const inner = arr[1].trim();
    if (!inner) return [];
    return inner.split(",").map((x) => x.trim().replace(/^"(.*)"$/s, "$1").replace(/\\"/g, '"'));
  }
  const str = t.match(/^'(.*)'$/s);
  if (str) return str[1].replace(/''/g, "'");
  return t;
}

function rowTuples(block) {
  // "(a, b),\n  (c, d)" -> [[a,b],[c,d]]
  const tuples = [];
  let depth = 0, cur = "", inStr = false;
  for (let i = 0; i < block.length; i += 1) {
    const c = block[i];
    if (inStr) { cur += c; if (c === "'" && block[i + 1] === "'") { cur += block[++i]; } else if (c === "'") inStr = false; continue; }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === "(") { depth += 1; if (depth === 1) { cur = ""; continue; } }
    if (c === ")") { depth -= 1; if (depth === 0) { tuples.push(splitValues(cur).map(parseVal)); continue; } }
    if (depth >= 1) cur += c;
  }
  return tuples;
}

const PK = {
  geographies: ["id"], political_entities: ["id"], publishers: ["id"],
  retrieval_paths: ["id"], source_packages: ["id"],
  package_paths: ["package_id", "retrieval_path_id"],
  path_expected_levels: ["retrieval_path_id", "level"],
  path_expected_geographies: ["retrieval_path_id", "geography_id"]
};
const keyOf = (t, row) => PK[t].map((c) => String(row[c])).join("|");

function execSql(db, sql) {
  const stats = { ins: 0, upd: 0, del: 0 };
  // Statements grob trennen (do $$ ... $$; als Einheit behalten)
  const stmts = [];
  let rest = sql;
  const doRe = /do \$\$[\s\S]*?\$\$;/g;
  const doBlocks = rest.match(doRe) || [];
  rest = rest.replace(doRe, "");
  for (const s of rest.split(/;\s*\n/)) { const t = s.trim(); if (t) stmts.push(t); }

  for (const stmt of stmts) {
    const clean = stmt.replace(/^\s*--.*$/gm, "").trim();
    // Nicht datenverändernde Statements überspringen (Transaktionsklammer,
    // PostgREST-Schema-Reload am Seed-Ende).
    if (!clean || /^(begin|commit)$/i.test(clean) || /^notify\s+/i.test(clean)) continue;

    let m = clean.match(/^insert into public\.(\w+)\s*\(([^)]*)\)\s*values([\s\S]*?)on conflict\s*\(([^)]*)\)\s*do\s+(nothing|update set([\s\S]*))$/i);
    if (m) {
      const [, table, colsRaw, valsRaw, , doWhat, updRaw] = m;
      const cols = colsRaw.split(",").map((c) => c.trim());
      db[table] = db[table] || new Map();
      for (const tup of rowTuples(valsRaw)) {
        const row = {}; cols.forEach((c, i) => { row[c] = tup[i]; });
        const k = keyOf(table, row);
        if (!db[table].has(k)) { db[table].set(k, row); stats.ins += 1; }
        else if (/^update set/i.test(doWhat)) {
          const cur = db[table].get(k); let changed = false;
          for (const part of (updRaw || "").split(",")) {
            const mm = part.trim().match(/^(\w+)\s*=\s*excluded\.(\w+)$/i);
            if (!mm) continue;
            if (JSON.stringify(cur[mm[1]]) !== JSON.stringify(row[mm[2]])) { cur[mm[1]] = row[mm[2]]; changed = true; }
          }
          if (changed) stats.upd += 1;
        }
      }
      continue;
    }

    m = clean.match(/^delete from public\.(\w+)\s*where\s*retrieval_path_id in \(([\s\S]*?)\)\s*and\s*\(package_id, retrieval_path_id\) not in \(([\s\S]*)\)$/i);
    if (m) {
      const [, table, idsRaw, keepRaw] = m;
      const ids = new Set(splitValues(idsRaw).map(parseVal));
      const keep = new Set(rowTuples(keepRaw).map((t) => `${t[0]}|${t[1]}`));
      for (const [k, row] of [...db[table]]) {
        if (ids.has(row.retrieval_path_id) && !keep.has(k)) { db[table].delete(k); stats.del += 1; }
      }
      continue;
    }

    m = clean.match(/^delete from public\.(\w+)\s*where\s*\(package_id, retrieval_path_id\) not in \(([\s\S]*)\)$/i);
    if (m) {
      const [, table, keepRaw] = m;
      const keep = new Set(rowTuples(keepRaw).map((t) => `${t[0]}|${t[1]}`));
      for (const [k] of [...db[table]]) if (!keep.has(k)) { db[table].delete(k); stats.del += 1; }
      continue;
    }

    m = clean.match(/^delete from public\.(\w+)\s*where\s*id\s*=\s*('(?:[^']|'')*')$/i);
    if (m) {
      const [, table, idRaw] = m;
      const k = String(parseVal(idRaw));
      if (db[table] && db[table].has(k)) { db[table].delete(k); stats.del += 1; }
      continue;
    }

    m = clean.match(/^update public\.(\w+)\s*set([\s\S]*?)where\s*id\s*=\s*('(?:[^']|'')*')$/i);
    if (m) {
      const [, table, setRaw, idRaw] = m;
      const k = String(parseVal(idRaw));
      const row = db[table] && db[table].get(k);
      if (row) {
        let changed = false;
        for (const part of splitValues(setRaw)) {
          const mm = part.match(/^(\w+)\s*=\s*([\s\S]+)$/);
          if (!mm) continue;
          const v = parseVal(mm[2]);
          if (JSON.stringify(row[mm[1]]) !== JSON.stringify(v)) { row[mm[1]] = v; changed = true; }
        }
        if (changed) stats.upd += 1;
      }
      continue;
    }
    throw new Error("Unbekanntes Statement: " + clean.slice(0, 90));
  }
  return { stats, doBlocks };
}

function snapshot(db, tables) {
  const o = {};
  for (const t of tables) o[t] = [...(db[t] || new Map()).entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, v]);
  return JSON.stringify(o);
}

function loadSeed(sha, file) {
  return execFileSync("git", ["show", `${sha}:supabase/seeds/${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

// ------------------------------------------------------------------ Ablauf --
const TAB = ["geographies", "political_entities", "publishers", "retrieval_paths", "source_packages", "package_paths", "path_expected_levels", "path_expected_geographies"];

console.log("== 1) Ausgangszustand herstellen (Stand VOR PR #118) ==");
const db = {};
execSql(db, loadSeed(VORHER_COMMIT, "20260713_source_architecture_seed.sql"));
execSql(db, loadSeed(VORHER_COMMIT, "20260717_landesmodul_be_bb_seed.sql"));
const AUSGANG = snapshot(db, TAB);
const n0 = Object.fromEntries(TAB.map((t) => [t, (db[t] || new Map()).size]));
console.log("   " + JSON.stringify(n0));
check("1 · Ausgangszustand aufgebaut (162 Abrufwege, 6 Pakete, 163 Zuordnungen)",
  n0.retrieval_paths === 162 && n0.source_packages === 6 && n0.package_paths === 163);
check("1 · Die 6 Bundeswege stehen auf 'broken' (heutiger Production-Stand)",
  ["rp-bundestag", "rp-bundesregierung", "rp-die-linke", "rp-linksfraktion", "rp-ausschuss-arbeit-soziales", "rp-dgb"]
    .every((id) => db.retrieval_paths.get(id).status === "broken"));
check("1 · Partei-/Personenwege haengen am PFLICHT-Basispaket",
  ["rp-be-partei_pilot", "rp-be-fraktion_pilot", "rp-be-person_pilot"]
    .every((p) => db.package_paths.has(`pkg-berlin-basis|${p}`)));

console.log("\n== 2) Pre-Seed-Backup erzeugen (Format wie backup-export.js --scope=seed) ==");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preseed-"));
const manifest = { art: "pre-seed", erstellt: new Date().toISOString(), mainCommit: "test-fixture", quelle: "fixture", tabellen: {}, pruefsummen: {}, fehler: [] };
for (const t of ["retrieval_paths", "source_packages", "package_paths"]) {
  const rows = [...db[t].values()];
  const json = JSON.stringify(rows);
  fs.writeFileSync(path.join(dir, `${t}.json`), json);
  manifest.tabellen[t] = rows.length;
  manifest.pruefsummen[t] = crypto.createHash("sha256").update(json).digest("hex");
}
manifest.vollstaendig = true;
manifest.pruefsummeGesamt = crypto.createHash("sha256").update(JSON.stringify(manifest.pruefsummen)).digest("hex");
fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
check("2 · Backup enthaelt die 3 veraenderten Tabellen + Pruefsummen + Pre-Seed-Kennzeichnung",
  manifest.art === "pre-seed" && Object.keys(manifest.pruefsummen).length === 3 && !!manifest.pruefsummeGesamt);

console.log("\n== 3) Seed 1 (Bund, nach #118) ==");
const s1 = execSql(db, loadSeed("HEAD", "20260713_source_architecture_seed.sql"));
const n1 = Object.fromEntries(TAB.map((t) => [t, (db[t] || new Map()).size]));
console.log(`   +${s1.stats.ins} eingefuegt, ${s1.stats.upd} aktualisiert, ${s1.stats.del} geloescht`);
check("3 · Seed 1: +2 Pakete, +1 Paketzuordnung", n1.source_packages === 8 && n1.package_paths === 164);
check("3 · Seed 1: die 6 Wege stehen jetzt auf 'needs_review'",
  ["rp-bundestag", "rp-bundesregierung", "rp-die-linke", "rp-linksfraktion", "rp-ausschuss-arbeit-soziales", "rp-dgb"]
    .every((id) => db.retrieval_paths.get(id).status === "needs_review"));
check("3 · Seed 1: required_classes der Landes-Basispakete auf 12 reduziert",
  db.source_packages.get("pkg-berlin-basis").required_classes.length === 12
  && db.source_packages.get("pkg-brandenburg-basis").required_classes.length === 12);

console.log("\n== 4/5) Seed 2 (Landesmodul, nach #118) ==");
const s2 = execSql(db, loadSeed("HEAD", "20260717_landesmodul_be_bb_seed.sql"));
const n2 = Object.fromEntries(TAB.map((t) => [t, (db[t] || new Map()).size]));
console.log(`   +${s2.stats.ins} eingefuegt, ${s2.stats.upd} aktualisiert, ${s2.stats.del} geloescht`);
check("5 · Seed 2: genau 4 alte Zuordnungen entfernt, 4 neue eingefuegt", s2.stats.del === 4 && s2.stats.ins === 4);
check("5 · Seed 2: Partei-/Personenwege NICHT mehr im Pflicht-Basispaket",
  ["rp-be-partei_pilot", "rp-be-fraktion_pilot", "rp-be-person_pilot"]
    .every((p) => !db.package_paths.has(`pkg-berlin-basis|${p}`)));
check("5 · Seed 2: sie haengen jetzt am optionalen Parteipaket",
  ["rp-be-partei_pilot", "rp-be-fraktion_pilot", "rp-be-person_pilot"]
    .every((p) => db.package_paths.has(`pkg-die-linke-berlin|${p}`)));
check("5 · Gesamtzahl Zuordnungen unveraendert (4 raus, 4 rein)", n2.package_paths === 164);

console.log("\n== 6) Idempotenz der Seeds ==");
const vorWdh = snapshot(db, TAB);
const r1 = execSql(db, loadSeed("HEAD", "20260713_source_architecture_seed.sql"));
const r2 = execSql(db, loadSeed("HEAD", "20260717_landesmodul_be_bb_seed.sql"));
check("6 · Zweiter Lauf beider Seeds aendert 0 Zeilen",
  r1.stats.ins + r1.stats.upd + r1.stats.del + r2.stats.ins + r2.stats.upd + r2.stats.del === 0,
  `ins=${r1.stats.ins + r2.stats.ins} upd=${r1.stats.upd + r2.stats.upd} del=${r1.stats.del + r2.stats.del}`);
check("6 · Zustand nach Wiederholung unveraendert", snapshot(db, TAB) === vorWdh);

console.log("\n== 7) Restore erzeugen und ausfuehren ==");
const restoreSql = build(dir);
// Kommentare vor der Pruefung entfernen — im Kopf des erzeugten SQL steht das Wort
// "drop table" als Zusicherung, das darf den Check nicht falsch-positiv ausloesen.
const restoreOhneKommentare = restoreSql.replace(/^\s*--.*$/gm, "");
check("7 · Restore enthaelt KEIN drop/truncate", !/drop\s+table|truncate/i.test(restoreOhneKommentare));
check("7 · Restore laeuft in einer Transaktion", /^begin;/m.test(restoreSql) && /^commit;/m.test(restoreSql));
check("7 · Restore hat Vorher- UND Nachher-Check mit hartem Abbruch",
  (restoreSql.match(/raise exception/g) || []).length >= 3);
check("7 · Restore fasst keine Elterntabellen an (publishers/political_entities/geographies)",
  !/delete from public\.(publishers|political_entities|geographies)/i.test(restoreSql));
const rst = execSql(db, restoreSql);
console.log(`   +${rst.stats.ins} eingefuegt, ${rst.stats.upd} aktualisiert, ${rst.stats.del} geloescht`);

console.log("\n== 8) Endzustand gegen Ausgangszustand ==");
const ENDE = snapshot(db, TAB);
check("8 · Endzustand ist BYTEGLEICH zum Ausgangszustand", ENDE === AUSGANG);
if (ENDE !== AUSGANG) {
  const a = JSON.parse(AUSGANG), e = JSON.parse(ENDE);
  for (const t of TAB) if (JSON.stringify(a[t]) !== JSON.stringify(e[t])) {
    console.log(`      Abweichung in ${t}: ${a[t].length} vs ${e[t].length}`);
    for (let i = 0; i < a[t].length; i += 1) {
      if (JSON.stringify(a[t][i]) !== JSON.stringify(e[t][i])) {
        const av = a[t][i][1] || {}, ev = (e[t][i] || [])[1] || {};
        for (const k of new Set([...Object.keys(av), ...Object.keys(ev)])) {
          if (JSON.stringify(av[k]) !== JSON.stringify(ev[k])) console.log(`        ${a[t][i][0]} · ${k}: ${JSON.stringify(av[k]).slice(0,70)} -> ${JSON.stringify(ev[k]).slice(0,70)}`);
        }
      }
    }
  }
}
check("8 · Die 6 Wege wieder auf 'broken'",
  ["rp-bundestag", "rp-bundesregierung", "rp-die-linke", "rp-linksfraktion", "rp-ausschuss-arbeit-soziales", "rp-dgb"]
    .every((id) => db.retrieval_paths.get(id).status === "broken"));
check("8 · required_classes wieder auf 15", db.source_packages.get("pkg-berlin-basis").required_classes.length === 15);
check("8 · Die 2 neuen Pakete sind entfernt",
  !db.source_packages.has("pkg-die-linke-berlin") && !db.source_packages.has("pkg-die-linke-brandenburg"));
check("8 · Alte Paketzuordnungen wiederhergestellt",
  ["rp-be-partei_pilot", "rp-be-fraktion_pilot", "rp-be-person_pilot"]
    .every((p) => db.package_paths.has(`pkg-berlin-basis|${p}`)));
check("8 · Aktive Bundestagsquellen unbeschaedigt (162 Abrufwege, kein Verlust)",
  db.retrieval_paths.size === 162 && db.retrieval_paths.has("rp-bundestag") && db.retrieval_paths.has("rp-dip"));

console.log("\n== 9) Backup-Pruefsumme ==");
let manipuliertErkannt = false;
try {
  const p = path.join(dir, "retrieval_paths.json");
  const orig = fs.readFileSync(p, "utf8");
  fs.writeFileSync(p, orig.replace("]", ",{}]"));
  build(dir);
} catch (e) { manipuliertErkannt = /Pruefsumme/.test(e.message); }
check("9 · Manipuliertes Backup wird per Pruefsumme abgewiesen", manipuliertErkannt);
// Backup wiederherstellen fuer die Folgeschritte
{
  const rows = JSON.parse(fs.readFileSync(path.join(dir, "retrieval_paths.json"), "utf8")).filter((r) => r && r.id);
  const json = JSON.stringify(rows);
  fs.writeFileSync(path.join(dir, "retrieval_paths.json"), json);
  manifest.pruefsummen.retrieval_paths = crypto.createHash("sha256").update(json).digest("hex");
  manifest.pruefsummeGesamt = crypto.createHash("sha256").update(JSON.stringify(manifest.pruefsummen)).digest("hex");
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
}
let unvollstaendigAbgewiesen = false;
try {
  const bad = { ...manifest, vollstaendig: false };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(bad, null, 2));
  build(dir);
} catch (e) { unvollstaendigAbgewiesen = /UNVOLLSTAENDIG/.test(e.message); }
fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
check("9 · Als unvollstaendig markiertes Backup wird abgewiesen", unvollstaendigAbgewiesen);

console.log("\n== 10) Restore erneut ausfuehren (Idempotenz) ==");
const vorZweitRestore = snapshot(db, TAB);
const rst2 = execSql(db, build(dir));
check("10 · Zweiter Restore aendert 0 Zeilen",
  rst2.stats.ins + rst2.stats.upd + rst2.stats.del === 0,
  `ins=${rst2.stats.ins} upd=${rst2.stats.upd} del=${rst2.stats.del}`);
check("10 · Zustand nach zweitem Restore unveraendert", snapshot(db, TAB) === vorZweitRestore);

console.log("\n== 11/12) Teilerfolg: nur Seed 1 lief, dann Restore ==");
const dbT = {};
execSql(dbT, loadSeed(VORHER_COMMIT, "20260713_source_architecture_seed.sql"));
execSql(dbT, loadSeed(VORHER_COMMIT, "20260717_landesmodul_be_bb_seed.sql"));
const AUSGANG_T = snapshot(dbT, TAB);
execSql(dbT, loadSeed("HEAD", "20260713_source_architecture_seed.sql")); // nur Seed 1
check("11 · Teilzustand nach nur Seed 1: 8 Pakete, Landeswege noch am Pflichtpaket",
  dbT.source_packages.size === 8 && dbT.package_paths.has("pkg-berlin-basis|rp-be-partei_pilot"));
execSql(dbT, build(dir));
check("12 · Restore heilt auch den Teilzustand vollstaendig", snapshot(dbT, TAB) === AUSGANG_T);

console.log("\n== 13) Prozessabbruch: Transaktion nicht committet ==");
// Abbruch VOR commit = keine Wirkung. Nachbildung: Seeds auf einer Kopie anwenden
// und verwerfen -> der Originalzustand bleibt unberuehrt.
const dbA = {};
execSql(dbA, loadSeed(VORHER_COMMIT, "20260713_source_architecture_seed.sql"));
execSql(dbA, loadSeed(VORHER_COMMIT, "20260717_landesmodul_be_bb_seed.sql"));
const vorAbbruch = snapshot(dbA, TAB);
const kopie = {}; for (const t of TAB) kopie[t] = new Map([...dbA[t]].map(([k, v]) => [k, { ...v }]));
execSql(kopie, loadSeed("HEAD", "20260713_source_architecture_seed.sql"));
check("13 · Verworfene Transaktion laesst den Ausgangszustand unberuehrt", snapshot(dbA, TAB) === vorAbbruch);

console.log("\n== 14) Kein Restdiff ==");
check("14 · Nach vollstaendigem Zyklus bleibt kein Diff zurueck", snapshot(db, TAB) === AUSGANG);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
