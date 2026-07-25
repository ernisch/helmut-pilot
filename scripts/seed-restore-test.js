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
// AUSGANGSZUSTAND: die vor PR #118 committeten Seeds — das ist der erwartete
// Production-Stand laut Freigabedoku. Es werden KEINE echten Production-Daten
// verwendet; alles stammt aus Repo-Dateien.
//
// Diese beiden Dateien liegen als Fixture unter scripts/fixtures/seeds-vor-pr118/.
// Frueher las der Test sie per `git show 54fe370:...`. Das lief lokal, ist aber in
// CI reproduzierbar gescheitert: actions/checkout klont flach (fetch-depth 1), der
// Commit existiert dort nicht ("fatal: invalid object name '54fe370'"). Ein Test,
// der von der Klontiefe abhaengt, ist kein Test.
//
// Damit die Fixture nicht still von der Historie abdriftet, wird sie zusaetzlich
// gegen `git show 54fe370:...` geprueft — aber nur, wenn der Commit lokal
// vorhanden ist. Fehlt er (CI), sagt der Lauf das ausdruecklich; der inhaltliche
// Nachweis laeuft trotzdem vollstaendig.

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
    // PostgREST-Schema-Reload am Seed-Ende, Sitzungsparameter).
    if (!clean || /^(begin|commit)$/i.test(clean) || /^notify\s+/i.test(clean)
      || /^set\s+local\s+/i.test(clean)) continue;

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

    // Eingegrenzte Form des Restores: nur innerhalb der Seed-Pakete loeschen.
    // Genau diese Eingrenzung schuetzt Zeilen, die nach dem Backup entstanden sind.
    m = clean.match(/^delete from public\.(\w+)\s*where\s*package_id in \(([\s\S]*?)\)\s*and\s*\(package_id, retrieval_path_id\) not in \(([\s\S]*)\)$/i);
    if (m) {
      const [, table, scopeRaw, keepRaw] = m;
      const scope = new Set(splitValues(scopeRaw).map(parseVal));
      const keep = new Set(rowTuples(keepRaw).map((t) => `${t[0]}|${t[1]}`));
      for (const [k, row] of [...db[table]]) {
        if (scope.has(row.package_id) && !keep.has(k)) { db[table].delete(k); stats.del += 1; }
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

// Wertet die `do $$ … $$;`-Pruefbloecke des erzeugten Restores WIRKLICH aus.
// Bis hierhin wurden sie nur aus dem SQL herausgeschnitten und ihr Vorkommen
// gezaehlt (Review PR #125, Befund 12) — die gesamte Vor- und Nachpruefung war
// damit unbelegt. Nachgebildet werden genau die vier Formen, die der Generator
// erzeugt; jede andere Form faellt auf, weil sie hier nicht gefunden wird.
// Rueckgabe: Liste der ausgeloesten Ausnahmen (leer = alle Pruefungen bestanden).
function execDoBlocks(db, bloecke) {
  const ausnahmen = [];
  const zahl = (t) => Number(String(t).trim());

  for (const block of bloecke) {
    // a) Vorher-Check: wie viele der aufgezaehlten Wege fehlen in retrieval_paths?
    let m = block.match(/unnest\(array\[([^\]]*)\]\)[\s\S]*?not exists[\s\S]*?retrieval_paths[\s\S]*?if fehlend > 0 then/i);
    if (m) {
      const ids = m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
      const fehlend = ids.filter((id) => !(db.retrieval_paths || new Map()).has(id)).length;
      if (fehlend > 0) ausnahmen.push(`Vorher-Check: ${fehlend} Abrufwege fehlen`);
      continue;
    }
    // b) raise notice-Schleife: reine Meldung, veraendert nichts.
    if (/for\s+r\s+in\s+select/i.test(block) && !/raise exception/i.test(block)) continue;

    // c) Nachher-Check: mehrere Bedingungen in einem Block.
    if (/Restore-Nachpruefung/i.test(block)) {
      // c1) Status der 6 Wege
      let mm = block.match(/where id in \(([^)]*)\) and status = 'broken';\s*if n_pfade <> (\d+) then/i);
      if (mm) {
        const ids = mm[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
        const ist = ids.filter((id) => (db.retrieval_paths.get(id) || {}).status === "broken").length;
        if (ist !== zahl(mm[2])) ausnahmen.push(`Nachpruefung: Status der Abrufwege ${ist} statt ${mm[2]}`);
      }
      // c2) fehlende gesicherte Zuordnungen
      mm = block.match(/from \(values([\s\S]*?)\) as s\(pid, rid\)/i);
      if (mm) {
        const paare = [...mm[1].matchAll(/\('([^']*)',\s*'([^']*)'\)/g)].map((x) => `${x[1]}|${x[2]}`);
        const fehlend = paare.filter((k) => !db.package_paths.has(k)).length;
        if (fehlend > 0) ausnahmen.push(`Nachpruefung: ${fehlend} gesicherte Zuordnungen fehlen`);
      }
      // c3) die von Seed 1 angelegten Pakete
      mm = block.match(/from public\.source_packages where id in \(([^)]*)\);\s*if n_pakete <> (\d+) then/i);
      if (mm) {
        const ids = mm[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
        const ist = ids.filter((id) => db.source_packages.has(id)).length;
        if (ist !== zahl(mm[2])) ausnahmen.push(`Nachpruefung: ${ist} neue Pakete noch vorhanden, erwartet ${mm[2]}`);
      }
      // c4) Zuordnungen im Seed-Wirkbereich
      mm = block.match(/from public\.package_paths where package_id in \(([^)]*)\);\s*if n_zuordnungen <> (\d+) then/i);
      if (mm) {
        const pakete = new Set(mm[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")));
        const ist = [...db.package_paths.values()].filter((r) => pakete.has(r.package_id)).length;
        if (ist !== zahl(mm[2])) ausnahmen.push(`Nachpruefung: ${ist} Zuordnungen im Seed-Bereich, erwartet ${mm[2]}`);
      }
      continue;
    }
    ausnahmen.push(`UNBEKANNTER Pruefblock (Test deckt ihn nicht ab): ${block.slice(0, 80)}`);
  }
  return ausnahmen;
}

function snapshot(db, tables) {
  const o = {};
  for (const t of tables) o[t] = [...(db[t] || new Map()).entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, v]);
  return JSON.stringify(o);
}

const FIXTURE_DIR = path.join(__dirname, "fixtures", "seeds-vor-pr118");

function loadSeed(file) {
  return fs.readFileSync(path.join(FIXTURE_DIR, file), "utf8");
}

// Aktueller Sollstand: die Seeds im Arbeitsbaum. Bewusst NICHT `git show HEAD:...` —
// geprueft wird der Stand, den CI auscheckt und den das Drift-Gate absichert.
function loadAktuell(file) {
  return fs.readFileSync(path.join(ROOT, "supabase", "seeds", file), "utf8");
}

// Herkunftsnachweis: stimmt die Fixture noch mit dem Stand vor PR #118 ueberein?
// Nur moeglich, wenn der Commit im lokalen Klon liegt — in CI (flacher Klon) nicht.
// Rueckgabe: true = geprueft und gleich, false = geprueft und ABWEICHEND,
// null = nicht pruefbar (Commit fehlt).
function fixtureEntsprichtHistorie(file) {
  let ausHistorie;
  try {
    ausHistorie = execFileSync("git", ["show", `${VORHER_COMMIT}:supabase/seeds/${file}`],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch (_) {
    return null;
  }
  return ausHistorie === loadSeed(file);
}

// ------------------------------------------------------------------ Ablauf --
const TAB = ["geographies", "political_entities", "publishers", "retrieval_paths", "source_packages", "package_paths", "path_expected_levels", "path_expected_geographies"];

console.log("== 0) Herkunft der Fixture ==");
for (const f of ["20260713_source_architecture_seed.sql", "20260717_landesmodul_be_bb_seed.sql"]) {
  const gleich = fixtureEntsprichtHistorie(f);
  if (gleich === null) {
    console.log(`INFO  0 · ${f}: Herkunft nicht pruefbar — Commit ${VORHER_COMMIT} fehlt im Klon (flacher CI-Klon). Inhaltlicher Nachweis laeuft trotzdem.`);
  } else {
    check(`0 · ${f} entspricht dem Stand vor PR #118 (${VORHER_COMMIT})`, gleich);
  }
}

console.log("\n== 1) Ausgangszustand herstellen (Stand VOR PR #118) ==");
const db = {};
execSql(db, loadSeed("20260713_source_architecture_seed.sql"));
execSql(db, loadSeed("20260717_landesmodul_be_bb_seed.sql"));
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
const s1 = execSql(db, loadAktuell("20260713_source_architecture_seed.sql"));
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
const s2 = execSql(db, loadAktuell("20260717_landesmodul_be_bb_seed.sql"));
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
const r1 = execSql(db, loadAktuell("20260713_source_architecture_seed.sql"));
const r2 = execSql(db, loadAktuell("20260717_landesmodul_be_bb_seed.sql"));
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

// Die Pruefbloecke werden jetzt tatsaechlich ausgewertet, nicht nur gezaehlt.
const nachAusnahmen = execDoBlocks(db, rst.doBlocks);
check(`7 · Die Pruefbloecke laufen wirklich durch (${rst.doBlocks.length} Bloecke, 0 Ausnahmen)`,
  rst.doBlocks.length >= 3 && nachAusnahmen.length === 0, nachAusnahmen.join(" | "));

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
execSql(dbT, loadSeed("20260713_source_architecture_seed.sql"));
execSql(dbT, loadSeed("20260717_landesmodul_be_bb_seed.sql"));
const AUSGANG_T = snapshot(dbT, TAB);
execSql(dbT, loadAktuell("20260713_source_architecture_seed.sql")); // nur Seed 1
check("11 · Teilzustand nach nur Seed 1: 8 Pakete, Landeswege noch am Pflichtpaket",
  dbT.source_packages.size === 8 && dbT.package_paths.has("pkg-berlin-basis|rp-be-partei_pilot"));
execSql(dbT, build(dir));
check("12 · Restore heilt auch den Teilzustand vollstaendig", snapshot(dbT, TAB) === AUSGANG_T);

console.log("\n== 13) Prozessabbruch: Transaktion nicht committet ==");
// Abbruch VOR commit = keine Wirkung. Nachbildung: Seeds auf einer Kopie anwenden
// und verwerfen -> der Originalzustand bleibt unberuehrt.
const dbA = {};
execSql(dbA, loadSeed("20260713_source_architecture_seed.sql"));
execSql(dbA, loadSeed("20260717_landesmodul_be_bb_seed.sql"));
const vorAbbruch = snapshot(dbA, TAB);
const kopie = {}; for (const t of TAB) kopie[t] = new Map([...dbA[t]].map(([k, v]) => [k, { ...v }]));
execSql(kopie, loadAktuell("20260713_source_architecture_seed.sql"));
check("13 · Verworfene Transaktion laesst den Ausgangszustand unberuehrt", snapshot(dbA, TAB) === vorAbbruch);

console.log("\n== 14) Kein Restdiff ==");
check("14 · Nach vollstaendigem Zyklus bleibt kein Diff zurueck", snapshot(db, TAB) === AUSGANG);

// ---------------------------------------------------------------------------
// 15) Regressionstests zu den Befunden aus dem Review von PR #125
// ---------------------------------------------------------------------------
console.log("\n== 15) Regression: Eingangspruefungen des Generators ==");

// Hilfsfunktion: schreibt ein Backup-Verzeichnis aus beliebigen Tabellen.
function schreibeBackup(tabellen, patch = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "regress-"));
  const mf = { art: "pre-seed", erstellt: new Date().toISOString(), mainCommit: "test", quelle: "fixture",
    tabellen: {}, pruefsummen: {}, fehler: [], vollstaendig: true };
  for (const [t, rows] of Object.entries(tabellen)) {
    const json = JSON.stringify(rows);
    fs.writeFileSync(path.join(d, `${t}.json`), json);
    mf.tabellen[t] = rows.length;
    mf.pruefsummen[t] = crypto.createHash("sha256").update(json).digest("hex");
  }
  mf.pruefsummeGesamt = crypto.createHash("sha256").update(JSON.stringify(mf.pruefsummen)).digest("hex");
  Object.assign(mf, patch);
  fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify(mf, null, 2));
  return d;
}
function wirft(d) {
  try { build(d); return null; } catch (e) { return String(e.message); }
}

// Ausgangsbestand fuer die Regressionsfaelle: der echte Pre-Seed-Stand.
const basis = {};
execSql(basis, loadSeed("20260713_source_architecture_seed.sql"));
execSql(basis, loadSeed("20260717_landesmodul_be_bb_seed.sql"));
const roh = (t) => [...basis[t].values()].map((r) => ({ ...r }));

// 15a · Backup NACH der Einspielung gezogen -> muss abbrechen.
// Frueher lief der Restore als No-Op durch und meldete Erfolg.
{
  const nachSeed = {};
  execSql(nachSeed, loadSeed("20260713_source_architecture_seed.sql"));
  execSql(nachSeed, loadSeed("20260717_landesmodul_be_bb_seed.sql"));
  execSql(nachSeed, loadAktuell("20260713_source_architecture_seed.sql"));
  execSql(nachSeed, loadAktuell("20260717_landesmodul_be_bb_seed.sql"));
  const d = schreibeBackup({
    retrieval_paths: [...nachSeed.retrieval_paths.values()],
    source_packages: [...nachSeed.source_packages.values()],
    package_paths: [...nachSeed.package_paths.values()]
  });
  const msg = wirft(d);
  check("15a · Zu spaet gezogenes Backup (nach Seed 1) wird abgewiesen",
    msg !== null && /nicht den Zustand vor der Einspielung|bereits die von Seed 1/i.test(msg), msg || "kein Abbruch");
  fs.rmSync(d, { recursive: true, force: true });
}

// 15b · Fehlender Abrufweg -> muss abbrechen statt still zu filtern.
{
  const d = schreibeBackup({
    retrieval_paths: roh("retrieval_paths").filter((r) => r.id !== "rp-dgb"),
    source_packages: roh("source_packages"),
    package_paths: roh("package_paths")
  });
  const msg = wirft(d);
  check("15b · Fehlender Abrufweg im Backup wird abgewiesen (kein stilles Filtern)",
    msg !== null && /rp-dgb/.test(msg), msg || "kein Abbruch");
  fs.rmSync(d, { recursive: true, force: true });
}

// 15c · Fehlende Pruefsumme -> muss abbrechen (frueher fail-open).
{
  const d = schreibeBackup({
    retrieval_paths: roh("retrieval_paths"), source_packages: roh("source_packages"),
    package_paths: roh("package_paths")
  });
  const mf = JSON.parse(fs.readFileSync(path.join(d, "manifest.json"), "utf8"));
  delete mf.pruefsummen.retrieval_paths;
  delete mf.pruefsummeGesamt;
  fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify(mf));
  const msg = wirft(d);
  check("15c · Fehlende Pruefsumme wird abgewiesen (fail-closed)",
    msg !== null && /Keine Pruefsumme/i.test(msg), msg || "kein Abbruch");
  fs.rmSync(d, { recursive: true, force: true });
}

// 15d · Leere Tabelle -> muss abbrechen (erzeugte sonst ungueltiges SQL).
{
  const d = schreibeBackup({
    retrieval_paths: roh("retrieval_paths"), source_packages: roh("source_packages"), package_paths: []
  });
  const msg = wirft(d);
  check("15d · Leere Tabelle im Backup wird abgewiesen",
    msg !== null && /leer/i.test(msg), msg || "kein Abbruch");
  fs.rmSync(d, { recursive: true, force: true });
}

console.log("\n== 16) Regression: Wirkbereich des Restores ==");
{
  // Ein nach dem Backup provisionierter Mandant: eigenes Paket, eigener Weg,
  // eigene Zuordnung. Der Restore darf davon NICHTS anfassen.
  const d = schreibeBackup({
    retrieval_paths: roh("retrieval_paths"), source_packages: roh("source_packages"),
    package_paths: roh("package_paths")
  });
  const sql = build(d);
  fs.rmSync(d, { recursive: true, force: true });

  const dbM = {};
  execSql(dbM, loadSeed("20260713_source_architecture_seed.sql"));
  execSql(dbM, loadSeed("20260717_landesmodul_be_bb_seed.sql"));
  execSql(dbM, loadAktuell("20260713_source_architecture_seed.sql"));
  execSql(dbM, loadAktuell("20260717_landesmodul_be_bb_seed.sql"));
  // Provisionierung NACH dem Backup:
  dbM.source_packages.set("pkg-profil-neu", { id: "pkg-profil-neu", key: "profil-neu", name: "Profil neu",
    purpose: null, status: "active", is_base: false, political_level: "bund", geography_id: null, required_classes: [] });
  dbM.retrieval_paths.set("rp-neu-news", { id: "rp-neu-news", publisher_id: null, legacy_source_id: null,
    name: "Personensuche neu", method: "googlenews_search", url: "https://news.google.com/x", query: null,
    parser: "googlenews-batchexecute", priority: 50, status: "healthy", activation_mode: "auto",
    is_critical: false, max_items: 16, represents_type: null });
  dbM.package_paths.set("pkg-profil-neu|rp-neu-news", { package_id: "pkg-profil-neu", retrieval_path_id: "rp-neu-news" });

  const r = execSql(dbM, sql);
  const ausnahmen = execDoBlocks(dbM, r.doBlocks);

  check("16 · Das nach dem Backup angelegte Mandantenpaket ueberlebt den Restore",
    dbM.source_packages.has("pkg-profil-neu"));
  check("16 · Seine Paketzuordnung wird NICHT geloescht",
    dbM.package_paths.has("pkg-profil-neu|rp-neu-news"));
  check("16 · Sein Abrufweg bleibt unveraendert",
    dbM.retrieval_paths.get("rp-neu-news").status === "healthy");
  check("16 · Die Nachpruefung bricht deswegen NICHT ab (kein Fehlalarm)",
    ausnahmen.length === 0, ausnahmen.join(" | "));
  check("16 · Der Seed-Wirkbereich ist trotzdem vollstaendig zurueckgedreht",
    ["rp-bundestag", "rp-bundesregierung", "rp-die-linke", "rp-linksfraktion",
      "rp-ausschuss-arbeit-soziales", "rp-dgb"].every((id) => dbM.retrieval_paths.get(id).status === "broken")
    && !dbM.source_packages.has("pkg-die-linke-berlin")
    && dbM.package_paths.has("pkg-berlin-basis|rp-be-partei_pilot"));
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
