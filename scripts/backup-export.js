"use strict";

// Betreiber-Backup (Audit 2026-07, Sprint 7): liest ALLE Helmut-Daten aus
// Supabase (Blob-Store + V3-Tabellen) und legt sie lokal als JSON ab.
// AUSSCHLIESSLICH LESEND (nur GET) — kein Write, keine Migration, kein Delete.
//
// Hintergrund: Dieses Skript liefert eine dateibasierte Zweitsicherung. Es ist
// keine alleinige Wiederherstellungsgrundlage und ersetzt weder Supabase-
// Backups/PITR noch einen transaktionalen Snapshot.
//
// EHRLICHE GRENZE: Das ist KEIN transaktionaler DB-Snapshot. Die Tabellen
// werden sequenziell ueber REST gelesen; laufen waehrend des Exports Writes,
// koennen Querbezuege zwischen Tabellen inkonsistent sein. Deshalb: Export nur
// zu nutzungsarmer Zeit (vor dem 20:00-UTC-Crawl), Details im Runbook
// docs/betrieb/backup-restore-runbook.md Abschnitt 1.
//
// Aufruf lokal (mit .env.local des Betreibers):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-export.js
// Aufruf in einer Claude-Code-Cloud-Sitzung: identischer Befehl, ohne Praefix — die
// beiden Variablen muessen vorab in den Environment-Einstellungen der Cloud-Umgebung
// hinterlegt sein (niemals im Chat, niemals in einem Commit). Siehe CLAUDE.md §4.9
// und docs/betrieb/env-inventar.md §8. Das Skript liest ausschliesslich process.env
// und ist gegenueber dem Herkunftskanal der Variablen blind.
// Ablage: ./backups/<UTC-Zeitstempel>/<tabelle>.json + manifest.json
// WICHTIG: ./backups/ ist gitignored — Backups NIE committen (enthalten
// personenbezogene/politische Daten). Ablage nur auf verschluesseltem Geraet;
// Retention + Verschluesselung vor Offsite-Kopie: Runbook Abschnitt 1b.

// TEIL-UMFAENGE (`--scope=`): `voll` (Standard, alle Tabellen) · `seed` (8 Quellentabellen) ·
// `profil` (2 Profiltabellen, seit Punkt 14B). Uebersicht + Zweck je Umfang:
// docs/betrieb/backup-restore-runbook.md Abschnitt 1a.
//
// PRE-SEED-MODUS (2026-07-25, Vorbereitung Quellen-Seed-Einspielung):
//   node scripts/backup-export.js --scope=seed
// Exportiert NUR die 8 Tabellen, die die beiden Quellen-Seeds beruehren. Zweck:
// eine gezielte, kleine Sicherung genau der Datensaetze, die zurueckgerollt
// werden muessten — und deutlich weniger personenbezogene Daten auf der Platte
// als beim Voll-Export. Das Manifest wird als `art: "pre-seed"` gekennzeichnet.
//
// VOLLSTAENDIGKEIT (seit 2026-07-25): je Tabelle wird die Zeilenzahl serverseitig
// per `Prefer: count=exact` gegengeprueft. Weicht die exportierte Zahl ab, gilt der
// Export als UNVOLLSTAENDIG (Fehlerliste + Exit 1). Vorher konnte eine serverseitig
// gekappte Seite (PostgREST `max-rows` < PAGE_SIZE) die Paginierung still beenden
// und ein Teil-Backup sah wie ein vollstaendiges aus.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const {
  TABLES,
  NICHT_PRODUKTIV,
  SEED_SCOPE_TABLES,
  PROFIL_SCOPE_TABLES,
  SCOPES,
  fordereGueltigesInventar,
  berechneBackupManifestPruefsumme,
  zerlegeJsonArrayRoh
} = require("./backup-table-inventory.js");

const PAGE_SIZE = 1000;

// PROFIL-MODUS (2026-07-26, Phase-1-Punkt 14B): `node scripts/backup-export.js --scope=profil`
// Genau die zwei Tabellen, die das Anlegen des Berliner Abnahmeprofils beruehrt
// (supabase/seeds/20260726_berlin_abnahmeprofil.sql). Warum ein eigener Umfang noetig war:
// `--scope=seed` sichert die 8 QUELLEN-Tabellen und damit KEINE der beiden Profiltabellen —
// die Vorbereitung fuer Schritt 5 der Aktivierungsreihenfolge hatte bis 14B also gar keine
// passende Sicherung. `--scope=voll` deckt sie ab, zieht aber zusaetzlich raw_documents,
// briefings, interactions und user_notes auf die Platte und hebt damit genau die
// Datenminimierung auf, wegen der es die Teil-Umfaenge gibt.
// Reihenfolge = FK-sichere Restore-Reihenfolge (Eltern vor Kindern:
// mandate_profiles.user_id -> profiles.id ON DELETE CASCADE).
// EHRLICHE GRENZE: `profiles` traegt Klarnamen realer Mandatstraeger. Auch dieser kleine
// Export ist personenbezogen und gehoert auf ein verschluesseltes Geraet (Runbook 1b).
async function fetchPage(baseUrl, key, table, orderCols, offset) {
  const order = String(orderCols).split(",").map((c) => `${c.trim()}.asc`).join(",");
  const url = `${baseUrl}/rest/v1/${table}?select=*&order=${order}&limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    redirect: "error"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fuer ${table} (offset ${offset})`);
  return zerlegeJsonArrayRoh(await res.text());
}

// Serverseitige Zeilenzahl (PostgREST Content-Range, z. B. "0-0/162"). Nur damit
// laesst sich ein still gekappter Export erkennen; null = Server liefert keine Zahl.
async function fetchCount(baseUrl, key, table) {
  const res = await fetch(`${baseUrl}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
    redirect: "error"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} bei Zeilenzahl fuer ${table}`);
  const range = res.headers.get("content-range") || "";
  const total = String(range).split("/")[1];
  return total && /^\d+$/.test(total) ? Number(total) : null;
}

// Positive Data-API-Erreichbarkeit beweist, dass eine bislang ausgenommene
// Tabelle nachgezogen werden muss. Ein 404 ist dagegen KEIN Katalogbeweis: er
// kann auch fehlende Data-API-Exposition oder einen alten Schema-Cache bedeuten.
// Die belastbare Grundlage bleibt deshalb das explizite Production-
// Migrationsmanifest; diese Probe ist nur ein zusaetzlicher positiver Riegel.
async function tableExists(baseUrl, key, table) {
  const res = await fetch(`${baseUrl}/rest/v1/${table}?select=*&limit=0`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    redirect: "error"
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`HTTP ${res.status} bei Existenzpruefung fuer ${table}`);
  return true;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// Commit + sauberer Arbeitsbaum: Nur dann identifiziert mainCommit den
// tatsaechlich ausgefuehrten Exportcode. Uncommittete oder unversionierte
// Aenderungen werden nicht durch einen Commit belegt und schliessen den Export.
function gitStand() {
  try {
    const cwd = path.join(__dirname, "..");
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
    const status = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd, encoding: "utf8" });
    return { commit, sauber: status.length === 0 };
  } catch (_) { return { commit: null, sauber: false }; }
}

function pruefeBackupQuelle(baseUrl, katalogRef, env = process.env) {
  let url;
  try { url = new URL(baseUrl); }
  catch (_) { return { ok: false, grund: "SUPABASE_URL ist keine gueltige URL" }; }
  const hostname = url.hostname.toLowerCase();
  const loopback = hostname === "127.0.0.1" || hostname === "localhost";
  const simulation = env.HELMUT_SCHUTZ_SIMULIERTE_UMGEBUNG === "ja" && loopback;
  if (simulation) {
    return { ok: true, simulation: true, ref: hostname.split(".")[0], host: url.host.toLowerCase() };
  }
  const erwarteterHost = `${katalogRef}.supabase.co`;
  if (url.protocol !== "https:" || hostname !== erwarteterHost || url.port
      || (url.pathname && url.pathname !== "/") || url.search || url.hash
      || url.username || url.password) {
    return {
      ok: false,
      grund: `Realexport ist nur gegen https://${erwarteterHost} ohne Port/Pfad/Query erlaubt; lokale HTTP-Ziele nur unter dem Simulationsmarker`
    };
  }
  return { ok: true, simulation: false, ref: katalogRef, host: erwarteterHost };
}

async function main() {
  let inventar;
  try {
    inventar = fordereGueltigesInventar(path.join(__dirname, ".."));
  } catch (error) {
    console.error(`FEHLER: ${error.message}`);
    process.exit(2);
  }

  // Argumente streng pruefen (Review PR #125, Befund 2): `--scope seed` mit Leerzeichen
  // oder ein Tippfehler fiel frueher still auf den VOLL-Export zurueck — und der zieht
  // auch raw_documents, briefings, user_notes und interactions auf die Platte. Genau die
  // Datenminimierung, wegen der es den Seed-Modus gibt, war damit unbemerkt aufgehoben.
  // ZUERST pruefen, VOR jedem Verzeichnis: ein abgewiesener Aufruf darf keinen leeren
  // Ordner hinterlassen, der spaeter wie ein Backup aussieht.
  let scope = "voll";
  for (const arg of process.argv.slice(2)) {
    const m = /^--scope=(.*)$/.exec(arg);
    if (m && Object.prototype.hasOwnProperty.call(SCOPES, m[1])) { scope = m[1]; continue; }
    console.error(`FEHLER: unbekanntes Argument '${arg}'. Erlaubt: ${Object.keys(SCOPES).map((s) => "--scope=" + s).join(", ")} (Standard: voll).`);
    process.exit(2);
  }
  const seedScope = scope === "seed";
  const profilScope = scope === "profil";

  const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  if (!baseUrl) {
    console.error("FEHLER: SUPABASE_URL muss gesetzt sein (.env.local).");
    process.exit(2);
  }
  const quellenPruefung = pruefeBackupQuelle(baseUrl, inventar.production.referenz.quelle);
  if (!quellenPruefung.ok) {
    console.error(`FEHLER: ${quellenPruefung.grund}. Kein Schluessel wurde an diese URL gesendet.`);
    process.exit(2);
  }
  // Ein lokaler Test darf niemals versehentlich den echten Production-Key an
  // einen Testserver senden. Simulationen haben deshalb eine eigene Attrappe-
  // Variable; der normale SUPABASE_SERVICE_ROLE_KEY wird dort nicht gelesen.
  const key = quellenPruefung.simulation
    ? (process.env.HELMUT_SIMULIERTER_SUPABASE_KEY || "")
    : (process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!key) {
    console.error(quellenPruefung.simulation
      ? "FEHLER: HELMUT_SIMULIERTER_SUPABASE_KEY fehlt fuer den isolierten lokalen Test."
      : "FEHLER: SUPABASE_SERVICE_ROLE_KEY fehlt fuer den katalogbelegten Production-Export.");
    process.exit(2);
  }

  const git = gitStand();
  if (!/^[0-9a-f]{40}$/i.test(String(git.commit || ""))) {
    console.error("FEHLER: aktueller Git-Commit ist nicht belegbar — ohne 40-stellige mainCommit-Kennung kein kryptografischer Backup-Vertrag.");
    process.exit(2);
  }
  if (!git.sauber) {
    console.error("FEHLER: Git-Arbeitsbaum ist nicht sauber — mainCommit wuerde den ausgefuehrten Exportcode nicht vollstaendig belegen.");
    process.exit(2);
  }

  // Rein lesender Drift-Riegel VOR Anlage des Backup-Verzeichnisses. Die
  // einzige bekannte Ausnahme ist crawl_runs (Migration 20260720, laut
  // Production-Stand nicht angewendet). Sobald sie erreichbar ist, muss sie
  // zuerst bewusst in TABLES und RESTORE_ORDER aufgenommen werden.
  for (const table of Object.keys(NICHT_PRODUKTIV)) {
    try {
      if (await tableExists(baseUrl, key, table)) {
        console.error(`FEHLER: public.${table} existiert, ist aber im Backup-Inventar als nicht produktiv ausgenommen. Inventar und Restore-Reihenfolge zuerst nachziehen.`);
        process.exit(2);
      }
    } catch (error) {
      console.error(`FEHLER: Status von public.${table} nicht sicher pruefbar: ${error.message}`);
      process.exit(2);
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(__dirname, "..", "backups", stamp);
  fs.mkdirSync(dir, { recursive: true });

  const tableNames = SCOPES[scope] ? SCOPES[scope].slice() : Object.keys(TABLES);
  const manifest = {
    backupVertrag: 3,
    art: seedScope ? "pre-seed" : (profilScope ? "pre-profil" : "voll"),
    erstellt: new Date().toISOString(),
    mainCommit: git.commit,
    arbeitsbaum: { sauber: true },
    quelle: quellenPruefung.ref,
    quelleHost: quellenPruefung.host,
    produktionsKatalogQuelle: inventar.production.referenz.quelle,
    simulation: {
      aktiv: quellenPruefung.simulation,
      grund: quellenPruefung.simulation ? "isolierter-lokaler-test" : null
    },
    inventar: {
      schemaTabellen: inventar.schemaTabellen.length,
      exportTabellen: inventar.exportTabellen.length,
      ausgenommen: inventar.ausgenommeneTabellen.slice(),
      hash: inventar.production.inventarHash,
      migrationsmanifest: inventar.production.manifest.id,
      migrationsHistoryPruefsumme: inventar.production.manifest.historyPruefsumme,
      migrationsPruefsumme: inventar.production.manifest.repoSqlPruefsumme,
      katalogPruefsumme: inventar.production.katalogPruefsumme,
      katalogErhoben: inventar.production.referenz.erhoben,
      spaltenKatalogPruefsumme: (inventar.production.referenz.spaltenKatalog
        && inventar.production.referenz.spaltenKatalog.pruefsumme) || null
    },
    // Dieser Export ist sequenziell und kann selbst keinen Schreibstopp oder
    // transaktionalen Snapshot beweisen. restore-verify-local verweigert daher
    // einen Voll-Rueckwegbeweis mit diesem Manifest fail closed. Die Dateien
    // bleiben als kryptografisch gepruefte Zweitsicherung nutzbar.
    konsistenz: {
      art: "sequenzieller-rest-export",
      transaktional: false,
      schreibstoppBestaetigt: false,
      quersummenBestaetigt: false,
      vollRueckwegBelegt: false
    },
    tabellen: {},
    pruefsummen: {},
    fehler: []
  };
  if (seedScope) {
    manifest.zweck = "Pre-Seed-Sicherung vor Einspielung von 20260713_source_architecture_seed.sql + 20260717_landesmodul_be_bb_seed.sql";
    manifest.restoreReihenfolge = SEED_SCOPE_TABLES.slice();
  }
  if (profilScope) {
    manifest.zweck = "Pre-Profil-Sicherung vor Ausfuehrung von 20260726_berlin_abnahmeprofil.sql (Schritt 5 der Berliner Aktivierungsreihenfolge)";
    manifest.restoreReihenfolge = PROFIL_SCOPE_TABLES.slice();
  }
  for (const table of tableNames) {
    try {
      const erwartet = await fetchCount(baseUrl, key, table);
      const rows = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await fetchPage(baseUrl, key, table, TABLES[table], offset);
        if (!Array.isArray(page)) throw new Error(`unerwartete Antwort (kein Array) bei offset ${offset}`);
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
      // Vollstaendigkeitsprobe: ein still gekappter Export darf NIE als ok gelten.
      if (erwartet === null) {
        throw new Error("Zeilenzahl serverseitig nicht bestaetigt (kein Content-Range) — Vollstaendigkeit nicht pruefbar");
      }
      if (rows.length !== erwartet) {
        throw new Error(`unvollstaendig: ${rows.length} exportiert, ${erwartet} erwartet`);
      }
      // Rohe JSON-Elemente bleiben bytegetreu: JSON.parse/JSON.stringify wuerde
      // bigint/numeric sowie Zahlen in jsonb bereits vor dem Hash runden.
      const json = `[${rows.join(",")}]`;
      fs.writeFileSync(path.join(dir, `${table}.json`), json);
      manifest.tabellen[table] = rows.length;
      manifest.pruefsummen[table] = sha256(json);
      console.log(`OK    ${table}: ${rows.length} Zeilen`);
    } catch (error) {
      manifest.fehler.push({ tabelle: table, fehler: String(error.message).slice(0, 200) });
      console.error(`FEHL  ${table}: ${error.message}`);
    }
  }
  // PLAUSIBILISIERUNG (2026-07-25, Review PR #125, Befund 1): Ein technisch
  // fehlerfreier Lauf kann trotzdem wertlos sein. Auf allen acht Quellentabellen ist
  // RLS aktiv, es existiert aber KEINE Policy (20260713_source_architecture.sql:205).
  // Ein Zugriff mit anon-/publishable-Key oder gegen ein falsches Projekt ist deshalb
  // kein Fehler, sondern liefert HTTP 200 mit `[]` — frueher lief das als
  // `vollstaendig: true` durch und haette das Go-/Stop-Gate des Runbooks bestanden.
  // Ein leeres Backup ist keine Wiederherstellungsgrundlage.
  const summe = Object.values(manifest.tabellen).reduce((a, b) => a + b, 0);
  if (Object.keys(manifest.tabellen).length > 0 && summe === 0) {
    manifest.fehler.push({
      tabelle: "(alle)",
      fehler: "0 Zeilen ueber alle Tabellen — vermutlich falscher Schluessel (kein service_role) oder falsches Projekt"
    });
  }
  // Im Pre-Seed-Modus ist zusaetzlich belegbar, WELCHE Tabellen nicht leer sein duerfen:
  // ohne Abrufwege, Pakete und Zuordnungen gibt es nichts zurueckzurollen. Bewusst nur
  // "> 0" und keine festen Sollzahlen — absolute Zahlen driften (die Production-Inventur
  // vom 2026-07-25 weicht bereits vom Code-Seed ab) und wuerden hier falsch alarmieren.
  if (seedScope) {
    for (const t of ["retrieval_paths", "source_packages", "package_paths"]) {
      if (manifest.tabellen[t] === 0) {
        manifest.fehler.push({ tabelle: t, fehler: "0 Zeilen — als Pre-Seed-Sicherung unbrauchbar" });
      }
    }
  }
  // Dieselbe Logik fuer den Profil-Umfang: eine Sicherung ohne Mandatsbestand kann den
  // Zustand vor dem Anlegen des Abnahmeprofils nicht belegen und ist damit unbrauchbar.
  if (profilScope) {
    for (const t of PROFIL_SCOPE_TABLES) {
      if (manifest.tabellen[t] === 0) {
        manifest.fehler.push({ tabelle: t, fehler: "0 Zeilen — als Pre-Profil-Sicherung unbrauchbar" });
      }
    }
  }
  // Ein Backup mit Fehlern ist KEIN Backup — im Manifest unmissverstaendlich markieren,
  // damit ein Teil-Export nicht spaeter faelschlich als Wiederherstellungsgrundlage gilt.
  manifest.vollstaendig = manifest.fehler.length === 0 && Object.keys(manifest.tabellen).length === tableNames.length;
  manifest.pruefsummeGesamt = sha256(JSON.stringify(manifest.pruefsummen));
  manifest.manifestPruefsumme = berechneBackupManifestPruefsumme(manifest);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nBackup unter ${dir}`);
  console.log(`Art: ${manifest.art} · Tabellen ok: ${Object.keys(manifest.tabellen).length}/${tableNames.length} · Fehler: ${manifest.fehler.length}`);
  // Die Meldung muss den Umfang mitsagen: ein Pre-Seed-Backup ist fuer SEINEN Zweck
  // vollstaendig, deckt aber nur 8 der Tabellen ab — nicht die uebrige Datenbank.
  if (!manifest.vollstaendig) {
    console.log("UNVOLLSTAENDIG — NICHT als Wiederherstellungsgrundlage verwenden.");
    for (const f of manifest.fehler) console.log(`      ${f.tabelle}: ${f.fehler}`);
  } else if (seedScope) {
    console.log(`VOLLSTAENDIG fuer die ${tableNames.length} Quellentabellen (pre-seed) — deckt die uebrigen`
      + ` ${Object.keys(TABLES).length - tableNames.length} Tabellen ausdruecklich NICHT ab.`);
  } else if (profilScope) {
    console.log(`VOLLSTAENDIG fuer die ${tableNames.length} Profiltabellen (pre-profil) — deckt die uebrigen`
      + ` ${Object.keys(TABLES).length - tableNames.length} Tabellen ausdruecklich NICHT ab.`);
  } else {
    console.log("DATEI-INTEGRIERT gegen den belegten 51-Tabellen-Katalog und den versionierten Production-Migrationsstand.");
    console.log("KEIN Voll-Rueckwegbeweis: Der sequenzielle REST-Export ist ohne belegten Schreibstopp oder transaktionalen Snapshot nicht querschnittskonsistent.");
  }
  process.exit(manifest.vollstaendig ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { TABLES, SEED_SCOPE_TABLES, PROFIL_SCOPE_TABLES, SCOPES, tableExists, gitStand, pruefeBackupQuelle };
