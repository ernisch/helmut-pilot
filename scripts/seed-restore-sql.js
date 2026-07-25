"use strict";

// ============================================================================
// Gezielter Restore der Quellen-Seed-Einspielung — SQL-GENERATOR, KEIN Ausfuehrer.
// ============================================================================
// Erzeugt aus einer Pre-Seed-Sicherung (scripts/backup-export.js --scope=seed)
// exakt das SQL, das die Wirkung der beiden Quellen-Seeds
//   20260713_source_architecture_seed.sql  (Bund)
//   20260717_landesmodul_be_bb_seed.sql    (Landesmodul BE/BB)
// gezielt zurueckdreht.
//
// SICHERHEIT — per Konstruktion:
//   * KEIN DB-Client, KEIN Netz, KEIN Schreibpfad. Dieses Skript gibt Text aus.
//     Die Ausfuehrung des erzeugten SQL ist ein separater, freigabepflichtiger
//     Betreiberschritt (wie bei den Seeds selbst).
//   * KEIN `drop table`, KEIN `truncate`, KEIN `delete` auf Elterntabellen.
//     retrieval_paths.publisher_id und beide package_paths-FKs sind ON DELETE
//     CASCADE — ein Loeschen in publishers/retrieval_paths wuerde Kindzeilen
//     mitreissen. Der Restore fasst daher NUR die drei tatsaechlich veraenderten
//     Tabellen an und loescht dort ausschliesslich einzeln benannte Zeilen.
//   * Alles in EINER Transaktion; jeder Soll-Ist-Verstoss bricht per raise
//     exception ab und rollt die gesamte Transaktion zurueck.
//   * Idempotent: ein zweiter Lauf findet den Sollzustand bereits vor und
//     aendert 0 Zeilen (der Vorher-Check laesst beide Zustaende zu).
//
// Aufruf:
//   node scripts/seed-restore-sql.js <pfad-zum-pre-seed-backup-verzeichnis>
//   -> SQL nach stdout (in Datei umleiten, pruefen, dann manuell einspielen)

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Genau die drei Tabellen, die die beiden Seeds veraendern. publishers,
// political_entities, geographies und die path_expected_*-Tabellen werden von den
// Seeds NICHT veraendert (verifiziert) und daher hier auch nicht angefasst.
const RESTORE_TABLES = ["retrieval_paths", "source_packages", "package_paths"];

// Die 6 Bundeswege, deren status/method die Seeds veraendern.
const SECHS_WEGE = [
  "rp-bundestag", "rp-bundesregierung", "rp-die-linke",
  "rp-linksfraktion", "rp-ausschuss-arbeit-soziales", "rp-dgb"
];

// Die 2 Pakete, die Seed 1 NEU anlegt (existieren im Pre-Seed-Backup nicht).
const NEUE_PAKETE = ["pkg-die-linke-berlin", "pkg-die-linke-brandenburg"];

// Genau die Spalten, die die beiden Seeds schreiben (= die Spaltenlisten ihrer
// insert-Statements). Der Restore setzt exakt diese zurueck — nicht mehr.
// BEWUSST AUSGENOMMEN:
//   * created_at/updated_at — `updated_at` traegt einen Trigger (set_updated_at)
//     und laesst sich per update grundsaetzlich nicht zuruecksetzen.
//   * last_success_at/last_error/error_streak — Laufzeit-Telemetrie. Die Seeds
//     fassen sie nicht an; sie zurueckzuschreiben wuerde echte Betriebsdaten
//     ueberschreiben, die zwischen Backup und Restore entstanden sind.
const SEED_COLUMNS = {
  retrieval_paths: ["publisher_id", "legacy_source_id", "name", "method", "url", "query",
    "parser", "priority", "status", "activation_mode", "is_critical", "max_items", "represents_type"],
  source_packages: ["key", "name", "purpose", "status", "is_base", "political_level",
    "geography_id", "required_classes"]
};

function q(v) {
  if (v === null || v === undefined) return "null";
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Typgerechte Literale: Arrays -> text[], Zahlen/Booleans unquoted, sonst Text.
function qVal(col, v) {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return qTextArray(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return q(v);
}

// text[] -> Postgres-Array-Literal in DERSELBEN Schreibweise wie die Seeds
// (array[...]::text[]). required_classes ist text[]; ein Textliteral waere hier ein
// Typfehler, ein JSON-Array ebenfalls.
function qTextArray(arr) {
  if (arr === null || arr === undefined) return "null";
  const items = Array.isArray(arr) ? arr : [];
  if (!items.length) return "array[]::text[]";
  return `array[${items.map((s) => `'${String(s).replace(/'/g, "''")}'`).join(",")}]::text[]`;
}

function readBackup(dir) {
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`Kein manifest.json in ${dir}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.art !== "pre-seed") {
    throw new Error(`Backup-Art ist '${manifest.art}', erwartet 'pre-seed' (mit --scope=seed erzeugen)`);
  }
  if (manifest.vollstaendig !== true) {
    throw new Error("Backup ist als UNVOLLSTAENDIG markiert — als Restore-Grundlage unzulaessig");
  }
  const tables = {};
  for (const t of RESTORE_TABLES) {
    const p = path.join(dir, `${t}.json`);
    if (!fs.existsSync(p)) throw new Error(`Tabelle ${t} fehlt im Backup`);
    const raw = fs.readFileSync(p, "utf8");
    // Pruefsumme gegen das Manifest — ein nachtraeglich veraendertes Backup darf
    // nie unbemerkt zur Restore-Grundlage werden.
    const ist = crypto.createHash("sha256").update(raw).digest("hex");
    const soll = manifest.pruefsummen && manifest.pruefsummen[t];
    if (soll && soll !== ist) throw new Error(`Pruefsumme fuer ${t} stimmt nicht (Backup veraendert?)`);
    tables[t] = JSON.parse(raw);
  }
  return { manifest, tables };
}

function build(dir) {
  const { manifest, tables } = readBackup(dir);
  const pfadeVorher = new Map(tables.retrieval_paths.map((r) => [r.id, r]));
  const paketeVorher = new Map(tables.source_packages.map((r) => [r.id, r]));
  const zuordnungenVorher = tables.package_paths.map((r) => [r.package_id, r.retrieval_path_id]);

  const sechs = SECHS_WEGE.filter((id) => pfadeVorher.has(id));
  const out = [];
  out.push("-- ============================================================================");
  out.push("-- RESTORE der Quellen-Seed-Einspielung (erzeugt, nicht von Hand schreiben)");
  out.push("-- ============================================================================");
  out.push(`-- Backup:      ${path.resolve(dir)}`);
  out.push(`-- erstellt:    ${manifest.erstellt}`);
  out.push(`-- main-Commit: ${manifest.mainCommit || "(unbekannt)"}`);
  out.push(`-- Pruefsumme:  ${manifest.pruefsummeGesamt || "(keine)"}`);
  out.push("--");
  out.push("-- Setzt zurueck: 6 Abrufwege (status/method), required_classes der Landes-");
  out.push("-- Basispakete, sowie ALLE Paketzuordnungen auf den gesicherten Stand.");
  out.push("-- Fasst NUR retrieval_paths, source_packages und package_paths an.");
  out.push("-- Kein drop/truncate, keine Elterntabellen, alles in einer Transaktion.");
  out.push("");
  out.push("begin;");
  out.push("");

  // --- Soll-Ist-Check VOR der Aenderung ------------------------------------
  out.push("-- 1) Vorher-Check: existieren die erwarteten Zeilen? Sonst harter Abbruch.");
  out.push("do $$");
  out.push("declare fehlend int;");
  out.push("begin");
  out.push(`  select count(*) into fehlend from (select unnest(array[${sechs.map(q).join(", ")}]) as id) s`);
  out.push("    where not exists (select 1 from public.retrieval_paths rp where rp.id = s.id);");
  out.push("  if fehlend > 0 then");
  out.push("    raise exception 'Restore abgebrochen: % der gesicherten Abrufwege fehlen in der Datenbank', fehlend;");
  out.push("  end if;");
  out.push("end $$;");
  out.push("");

  // --- 2) Die 6 Abrufwege zurueck ------------------------------------------
  out.push("-- 2) Die 6 reparierten Abrufwege exakt auf den gesicherten Stand.");
  out.push("--    Zurueckgesetzt werden ALLE Spalten, die der Seed schreibt — nicht nur die");
  out.push("--    vier, die sein on-conflict heute aktualisiert. So dreht der Restore auch");
  out.push("--    einen spaeter erweiterten Seed vollstaendig zurueck.");
  for (const id of sechs) {
    const r = pfadeVorher.get(id);
    const sets = SEED_COLUMNS.retrieval_paths.map((c) => `  ${c} = ${qVal(c, r[c])}`).join(",\n");
    out.push(`update public.retrieval_paths set\n${sets}\nwhere id = ${q(id)};`);
  }
  out.push("");

  // --- 3) required_classes der gesicherten Pakete zurueck -------------------
  out.push("-- 3) source_packages: alle vom Seed geschriebenen Spalten zurueck — u. a.");
  out.push("--    required_classes (15 -> 12 wird rueckgaengig gemacht) UND purpose/name,");
  out.push("--    die der Seed per on-conflict ebenfalls aktualisiert.");
  for (const [id, p] of paketeVorher) {
    const sets = SEED_COLUMNS.source_packages.map((c) => `  ${c} = ${qVal(c, p[c])}`).join(",\n");
    out.push(`update public.source_packages set\n${sets}\nwhere id = ${q(id)};`);
  }
  out.push("");

  // --- 4) Paketzuordnungen exakt auf den gesicherten Stand ------------------
  out.push("-- 4) package_paths auf den gesicherten Stand: erst alles entfernen, was NICHT");
  out.push("--    gesichert war (die vom Seed neu eingefuegten Zuordnungen), dann die");
  out.push("--    gesicherten wieder einfuegen (die vom Seed geloeschten kommen so zurueck).");
  out.push("--    Kein Delete auf Elterntabellen -> kein Cascade-Risiko.");
  const paare = zuordnungenVorher.map(([p, r]) => `(${q(p)}, ${q(r)})`).join(",\n    ");
  out.push("delete from public.package_paths");
  out.push(" where (package_id, retrieval_path_id) not in (");
  out.push(`    ${paare}`);
  out.push("   );");
  out.push("");
  out.push("insert into public.package_paths (package_id, retrieval_path_id) values");
  out.push(`  ${zuordnungenVorher.map(([p, r]) => `(${q(p)}, ${q(r)})`).join(",\n  ")}`);
  out.push("on conflict (package_id, retrieval_path_id) do nothing;");
  out.push("");

  // --- 5) Die neu angelegten Pakete ---------------------------------------
  out.push("-- 5) Die von Seed 1 NEU angelegten Pakete entfernen. Nach Schritt 4 sind sie");
  out.push("--    garantiert leer (ihre Zuordnungen wurden entfernt), das Cascade auf");
  out.push("--    package_paths trifft also 0 Zeilen. Nur loeschen, wenn sie im Backup");
  out.push("--    NICHT vorkamen — sonst waeren sie Bestand und muessten bleiben.");
  for (const id of NEUE_PAKETE) {
    if (paketeVorher.has(id)) {
      out.push(`-- ${id}: war bereits im Backup vorhanden -> bleibt bestehen (kein Delete).`);
    } else {
      out.push(`delete from public.source_packages where id = ${q(id)};`);
    }
  }
  out.push("");

  // --- 6) Soll-Ist-Check NACH der Aenderung --------------------------------
  out.push("-- 6) Nachher-Check: Zielzahlen muessen exakt dem Backup entsprechen, sonst");
  out.push("--    bricht die Transaktion ab und NICHTS wird geschrieben.");
  out.push("do $$");
  out.push("declare n_pfade int; n_pakete int; n_zuordnungen int;");
  out.push("begin");
  out.push(`  select count(*) into n_pfade from public.retrieval_paths where id in (${sechs.map(q).join(", ")}) and status = 'broken';`);
  out.push(`  if n_pfade <> ${sechs.filter((id) => pfadeVorher.get(id).status === "broken").length} then`);
  out.push("    raise exception 'Restore-Nachpruefung: unerwarteter Status der Abrufwege (%)', n_pfade;");
  out.push("  end if;");
  out.push("  select count(*) into n_zuordnungen from public.package_paths;");
  out.push(`  if n_zuordnungen <> ${zuordnungenVorher.length} then`);
  out.push(`    raise exception 'Restore-Nachpruefung: % Paketzuordnungen, erwartet ${zuordnungenVorher.length}', n_zuordnungen;`);
  out.push("  end if;");
  out.push("  select count(*) into n_pakete from public.source_packages;");
  out.push(`  if n_pakete <> ${paketeVorher.size} then`);
  out.push(`    raise exception 'Restore-Nachpruefung: % Pakete, erwartet ${paketeVorher.size}', n_pakete;`);
  out.push("  end if;");
  out.push("end $$;");
  out.push("");
  out.push("commit;");
  out.push("");
  out.push("-- Erwarteter Endzustand:");
  out.push(`--   retrieval_paths: ${sechs.length} Wege zurueckgesetzt`);
  out.push(`--   source_packages: ${paketeVorher.size}`);
  out.push(`--   package_paths:   ${zuordnungenVorher.length}`);
  return out.join("\n") + "\n";
}

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Aufruf: node scripts/seed-restore-sql.js <pre-seed-backup-verzeichnis>");
    process.exit(2);
  }
  try {
    process.stdout.write(build(dir));
  } catch (error) {
    console.error("FEHLER: " + error.message);
    process.exit(1);
  }
}

module.exports = { build, readBackup, RESTORE_TABLES, SECHS_WEGE, NEUE_PAKETE, qTextArray };
