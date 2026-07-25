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
//   * Idempotent in den FACHLICHEN Werten: ein zweiter Lauf findet den Sollzustand
//     vor und aendert keinen fachlichen Wert. Er schreibt die Zeilen aber erneut,
//     und der Trigger set_updated_at bumpt dabei jedes Mal `updated_at`. Die
//     fruehere Zusicherung "aendert 0 Zeilen" war am DB-Objekt falsch.
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

// Genau die Pakete, deren Zuordnungen die beiden Seeds anfassen. Nur innerhalb
// dieses Wirkbereichs darf der Restore loeschen (Review PR #125, Befund 1).
// Alles ausserhalb — insbesondere die bei der Provisionierung entstehenden
// 'profil-<mandats-id>'-Pakete — bleibt unberuehrt.
const SEED_PAKETE = [
  "pkg-bund-basis", "pkg-arbeit-und-soziales", "pkg-die-linke-bund",
  "pkg-regional-niedersachsen", "pkg-berlin-basis", "pkg-brandenburg-basis",
  "pkg-die-linke-berlin", "pkg-die-linke-brandenburg"
];

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
    // FAIL-CLOSED (Review PR #125, Befund 4): frueher wurde die Pruefung
    // uebersprungen, wenn die Pruefsumme FEHLTE (`if (soll && …)`). Ein Angreifer
    // oder ein Versehen musste also nur den Manifest-Eintrag entfernen, um eine
    // manipulierte Datei durchzubringen. Eine fehlende Pruefsumme ist jetzt ein Fehler.
    const ist = crypto.createHash("sha256").update(raw).digest("hex");
    const soll = manifest.pruefsummen && manifest.pruefsummen[t];
    if (!soll) throw new Error(`Keine Pruefsumme fuer ${t} im Manifest — Backup nicht verifizierbar`);
    if (soll !== ist) throw new Error(`Pruefsumme fuer ${t} stimmt nicht (Backup veraendert?)`);
    tables[t] = JSON.parse(raw);
  }
  // Gesamtpruefsumme nachrechnen — sie war bisher nur Zierde im Kopf des Skripts.
  if (manifest.pruefsummeGesamt) {
    const gesamt = crypto.createHash("sha256").update(JSON.stringify(manifest.pruefsummen)).digest("hex");
    if (gesamt !== manifest.pruefsummeGesamt) {
      throw new Error("Gesamtpruefsumme stimmt nicht — Manifest veraendert?");
    }
  }
  return { manifest, tables };
}

// Belegt, dass das Backup WIRKLICH den Zustand VOR den Seeds zeigt.
// Ohne diese Pruefung (Review PR #125, Befund 2) waere ein zu spaet gezogenes
// Backup — also eines NACH der Einspielung — nicht erkennbar: der erzeugte Restore
// waere ein No-Op, alle Nachpruefungen liefen gruen durch und das Werkzeug meldete
// Erfolg, ohne irgendetwas zurueckgedreht zu haben.
function pruefeVorSeedZustand(tables) {
  const pfade = new Map(tables.retrieval_paths.map((r) => [r.id, r]));
  const pakete = new Set(tables.source_packages.map((r) => r.id));

  const fehlend = SECHS_WEGE.filter((id) => !pfade.has(id));
  if (fehlend.length) {
    throw new Error(`Backup unvollstaendig: diese Abrufwege fehlen: ${fehlend.join(", ")}`);
  }
  // Vor der Einspielung stehen alle 6 auf 'broken'. Steht auch nur einer auf
  // 'needs_review', wurde Seed 1 bereits eingespielt.
  const schonRepariert = SECHS_WEGE.filter((id) => pfade.get(id).status !== "broken");
  if (schonRepariert.length) {
    throw new Error(
      `Backup zeigt NICHT den Zustand vor der Einspielung: ${schonRepariert.join(", ")} `
      + "steht/stehen nicht mehr auf 'broken'. Vermutlich wurde das Backup ERST NACH Seed 1 gezogen. "
      + "Ein solcher Restore waere wirkungslos und wuerde faelschlich Erfolg melden."
    );
  }
  const schonDa = NEUE_PAKETE.filter((id) => pakete.has(id));
  if (schonDa.length) {
    throw new Error(
      `Backup enthaelt bereits die von Seed 1 angelegten Pakete (${schonDa.join(", ")}) `
      + "— es zeigt also den Zustand NACH der Einspielung und taugt nicht als Rueckweg."
    );
  }
  // Ein leeres Backup erzeugt syntaktisch ungueltiges SQL (`not in ()`, `insert … values`
  // ohne Werte, `unnest(array[])` ohne Typ). Lieber hier klar abbrechen.
  for (const t of RESTORE_TABLES) {
    if (!Array.isArray(tables[t]) || tables[t].length === 0) {
      throw new Error(`Tabelle ${t} ist im Backup leer — als Restore-Grundlage unbrauchbar`);
    }
  }
  // Pflichtspalten — aber NUR fuer die Zeilen, die der Restore tatsaechlich schreibt.
  // Eine dort fehlende Spalte wuerde still zu `null` und echte Werte ueberschreiben.
  // Zeilen ausserhalb des Schreibbereichs duerfen unvollstaendig sein; sie werden nie
  // angefasst.
  for (const id of SECHS_WEGE) {
    const fehlt = SEED_COLUMNS.retrieval_paths.filter((c) => !(c in pfade.get(id)));
    if (fehlt.length) throw new Error(`Zeile ${id} in retrieval_paths: Spalten fehlen im Backup: ${fehlt.join(", ")}`);
  }
  for (const row of tables.source_packages) {
    if (!SEED_PAKETE.includes(row.id)) continue;
    const fehlt = SEED_COLUMNS.source_packages.filter((c) => !(c in row));
    if (fehlt.length) throw new Error(`Zeile ${row.id} in source_packages: Spalten fehlen im Backup: ${fehlt.join(", ")}`);
  }
  for (const row of tables.package_paths) {
    if (!row.package_id || !row.retrieval_path_id) {
      throw new Error("Zeile in package_paths ohne package_id/retrieval_path_id — Backup unbrauchbar");
    }
  }
}

function build(dir) {
  const { manifest, tables } = readBackup(dir);
  pruefeVorSeedZustand(tables);
  const pfadeVorher = new Map(tables.retrieval_paths.map((r) => [r.id, r]));
  const paketeVorher = new Map(tables.source_packages.map((r) => [r.id, r]));
  const zuordnungenVorher = tables.package_paths.map((r) => [r.package_id, r.retrieval_path_id]);
  // Nur die Zuordnungen INNERHALB des Seed-Wirkbereichs sind Gegenstand des
  // Rueckbaus. Alles andere (z. B. `profil-<mandats-id>` aus der Provisionierung)
  // bleibt unangetastet.
  const zuordnungenImScope = zuordnungenVorher.filter(([p]) => SEED_PAKETE.includes(p));

  // Nach pruefeVorSeedZustand() sind garantiert alle 6 da — kein stilles Filtern mehr
  // (Review PR #125, Befund 3): frueher verschwand ein im Backup fehlender Weg
  // kommentarlos aus Rueckbau UND Pruefung.
  const sechs = SECHS_WEGE.slice();
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
  out.push("-- Textliterale strikt nach SQL-Standard auslegen. q() maskiert nur das");
  out.push("-- einfache Anfuehrungszeichen; bei standard_conforming_strings=off wuerde ein");
  out.push("-- Backslash im Backup-Wert aus dem Literal ausbrechen koennen. Postgres liefert");
  out.push("-- seit 9.1 'on' aus — diese Zeile macht es unabhaengig von der Serverkonfiguration.");
  out.push("set local standard_conforming_strings = on;");
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
  out.push("--    NUR die vom Seed beschriebenen Pakete (Review PR #125, Befund 9): frueher");
  out.push("--    wurde JEDES Paket aus dem Backup zurueckgeschrieben, also auch die an ein");
  out.push("--    konkretes Mandat gebundenen 'profil-<mandats-id>'-Pakete. Ein");
  out.push("--    Quellen-Rollback hat auf Mandantenzeilen nichts zu suchen.");
  for (const [id, p] of paketeVorher) {
    if (!SEED_PAKETE.includes(id)) continue;
    const sets = SEED_COLUMNS.source_packages.map((c) => `  ${c} = ${qVal(c, p[c])}`).join(",\n");
    out.push(`update public.source_packages set\n${sets}\nwhere id = ${q(id)};`);
  }
  out.push("");

  // --- 4) Paketzuordnungen exakt auf den gesicherten Stand ------------------
  out.push("-- 4) package_paths auf den gesicherten Stand — AUSSCHLIESSLICH innerhalb des");
  out.push("--    Seed-Wirkbereichs (die 8 Seed-Pakete). Zuordnungen anderer Pakete, etwa");
  out.push("--    der bei der Provisionierung entstandenen 'profil-<mandats-id>'-Pakete,");
  out.push("--    werden NICHT angefasst: ein Quellen-Rollback darf keine Mandantendaten");
  out.push("--    loeschen, auch nicht solche, die nach dem Backup entstanden sind.");
  out.push("--    Kein Delete auf Elterntabellen -> kein Cascade-Risiko.");
  const scopeListe = SEED_PAKETE.map(q).join(", ");
  const paare = zuordnungenImScope.map(([p, r]) => `(${q(p)}, ${q(r)})`).join(",\n    ");
  // Was geloescht wird, wird vorher benannt — ein stiller Verlust waere hier das
  // gefaehrlichste Ergebnis.
  out.push("do $$");
  out.push("declare r record;");
  out.push("begin");
  out.push("  for r in select package_id, retrieval_path_id from public.package_paths");
  out.push(`   where package_id in (${scopeListe})`);
  out.push("     and (package_id, retrieval_path_id) not in (");
  out.push(`      ${paare}`);
  out.push("     ) loop");
  out.push("    raise notice 'Restore entfernt Zuordnung: % -> %', r.package_id, r.retrieval_path_id;");
  out.push("  end loop;");
  out.push("end $$;");
  out.push("");
  out.push("delete from public.package_paths");
  out.push(` where package_id in (${scopeListe})`);
  out.push("   and (package_id, retrieval_path_id) not in (");
  out.push(`    ${paare}`);
  out.push("   );");
  out.push("");
  out.push("insert into public.package_paths (package_id, retrieval_path_id) values");
  out.push(`  ${zuordnungenImScope.map(([p, r]) => `(${q(p)}, ${q(r)})`).join(",\n  ")}`);
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
  out.push("--    WICHTIG: die tragenden Pruefungen sind die ZEILENBEZOGENEN unten. Eine reine");
  out.push("--    Zeilenzahl ueber package_paths waere nach delete+insert per Konstruktion");
  out.push("--    immer erfuellt und damit wertlos (Review PR #125, Befund 1).");
  out.push("do $$");
  out.push("declare n_pfade int; n_pakete int; n_zuordnungen int; n_fehlend int;");
  out.push("begin");
  out.push(`  select count(*) into n_pfade from public.retrieval_paths where id in (${sechs.map(q).join(", ")}) and status = 'broken';`);
  out.push(`  if n_pfade <> ${sechs.filter((id) => pfadeVorher.get(id).status === "broken").length} then`);
  out.push("    raise exception 'Restore-Nachpruefung: unerwarteter Status der Abrufwege (%)', n_pfade;");
  out.push("  end if;");
  out.push("");
  out.push("  -- Zeilenbezogen: JEDE gesicherte Zuordnung des Seed-Wirkbereichs muss wieder da sein.");
  out.push("  select count(*) into n_fehlend from (values");
  out.push(`    ${zuordnungenImScope.map(([p, r]) => `(${q(p)}, ${q(r)})`).join(",\n    ")}`);
  out.push("  ) as s(pid, rid)");
  out.push("   where not exists (select 1 from public.package_paths pp");
  out.push("                      where pp.package_id = s.pid and pp.retrieval_path_id = s.rid);");
  out.push("  if n_fehlend > 0 then");
  out.push("    raise exception 'Restore-Nachpruefung: % gesicherte Zuordnungen fehlen', n_fehlend;");
  out.push("  end if;");
  out.push("");
  out.push("  -- Zeilenbezogen: die von Seed 1 angelegten Pakete duerfen nicht mehr existieren.");
  out.push(`  select count(*) into n_pakete from public.source_packages where id in (${NEUE_PAKETE.map(q).join(", ")});`);
  out.push(`  if n_pakete <> ${NEUE_PAKETE.filter((id) => paketeVorher.has(id)).length} then`);
  out.push("    raise exception 'Restore-Nachpruefung: von Seed 1 angelegte Pakete noch vorhanden (%)', n_pakete;");
  out.push("  end if;");
  out.push("");
  out.push("  -- Zahlenprobe NUR im Seed-Wirkbereich. Global waere sie falsch: zwischen Backup");
  out.push("  -- und Restore kann die Provisionierung eines Mandanten legitim ein Paket");
  out.push("  -- anlegen — das darf den Rueckweg nicht blockieren (Befund 6).");
  out.push(`  select count(*) into n_zuordnungen from public.package_paths where package_id in (${scopeListe});`);
  out.push(`  if n_zuordnungen <> ${zuordnungenImScope.length} then`);
  out.push(`    raise exception 'Restore-Nachpruefung: % Zuordnungen im Seed-Bereich, erwartet ${zuordnungenImScope.length}', n_zuordnungen;`);
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
