"use strict";

// Backup-DATEIDRILL: kopiert ein mit backup-export.js erzeugtes Backup nach
// vollstaendiger kryptografischer Pruefung in ein neues lokales Verzeichnis.
// Das ist ausdruecklich KEIN Datenbank-Restore und kein Voll-Rueckwegbeweis.
//
// SICHERHEIT (hart erzwungen, konservativ: im Zweifel verweigern):
//   - Remote-REST ist ausnahmslos gesperrt, bevor ein Ziel-Key gelesen oder ein
//     Netzaufruf ausgefuehrt werden koennte.
//   - Das lokale Ziel muss neu sein und darf auch ueber Symlink-Aliase weder
//     identisch mit der Backup-Quelle sein noch in ihr/ueber ihr liegen.
//   - Manifest, Inventar, Migrationen und jede Tabellendatei werden vor der
//     ersten Kopie kryptografisch und mengenmaessig geprueft.
//
// Modi:
//   --local <zielverzeichnis>
//       Kopiert Manifest und JSON-Dateien byteidentisch (kein Netz, kein
//       Datenbank-Restore). Das Protokoll liegt unter <ziel>/dateidrill/.
//   --target-url ...
//       Immer verweigert. Der alte REST-Weg kann GENERATED ALWAYS-Identity,
//       CAS/Fencing und einen querschnittskonsistenten Snapshot nicht sicher
//       restaurieren. Nur restore-verify-local.js darf Daten importieren.
//
// Aufruf-Beispiele:
//   node scripts/restore-drill.js --backup backups/<stamp> --local /tmp/drill
//
// Nach dem Dateidrill: lokale Kopie entfernen; sie enthaelt Originaldaten.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  TABLES,
  SEED_SCOPE_TABLES,
  PROFIL_SCOPE_TABLES,
  RESTORE_ORDER,
  fordereGueltigesInventar,
  berechneBackupManifestPruefsumme
} = require("./backup-table-inventory.js");

// Normalisierter Host für den URL-Vergleich: Protokoll weg, Pfad/Query weg,
// kleingeschrieben. hostOf("http://REF.supabase.co/x") -> "ref.supabase.co".
function hostOf(url) {
  return String(url || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

// Projekt-Ref = erstes Host-Label ("ref.supabase.co" -> "ref").
function refOf(url) {
  return hostOf(url).split(".")[0];
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function fail(msg, code = 2) {
  console.error(`FEHLER: ${msg}`);
  process.exit(code);
}

function sha256(inhalt) {
  return crypto.createHash("sha256").update(inhalt).digest("hex");
}

// Ein Restore darf nicht aus einem historisch "vollstaendigen", heute aber
// tabellenarmen Manifest still nur den bekannten Teil einspielen. Fuer jeden
// Backup-Typ gilt deshalb eine exakte Sollmenge. Neue, fehlende oder fuer den
// Typ unerwartete Tabellen schliessen den Restore VOR dem ersten Write.
function pruefeManifestInventar(manifest, aktuellesInventar = null) {
  const fehler = [];
  if (!aktuellesInventar) {
    try { aktuellesInventar = fordereGueltigesInventar(path.join(__dirname, "..")); }
    catch (error) { fehler.push(`aktueller Production-Inventarvertrag ist ungueltig: ${error.message}`); }
  }
  if (!manifest || typeof manifest !== "object") {
    return { ok: false, fehler: ["Manifest fehlt oder ist kein Objekt"] };
  }
  if (manifest.vollstaendig !== true) fehler.push("manifest.vollstaendig ist nicht true");
  if (!Array.isArray(manifest.fehler)) fehler.push("manifest.fehler muss ein Array sein");
  else if (manifest.fehler.length) fehler.push("Manifest enthaelt Exportfehler");
  if (manifest.backupVertrag !== 3) fehler.push("manifest.backupVertrag ist nicht 3");
  if (!manifest.quelle || typeof manifest.quelle !== "string" || !manifest.quelle.trim()) fehler.push("manifest.quelle fehlt");
  if (!manifest.quelleHost || typeof manifest.quelleHost !== "string" || !manifest.quelleHost.trim()) fehler.push("manifest.quelleHost fehlt");
  if (manifest.quelle && manifest.quelleHost
      && refOf(manifest.quelleHost) !== String(manifest.quelle).trim().toLowerCase()) {
    fehler.push("manifest.quelle passt nicht zu manifest.quelleHost");
  }
  if (!manifest.simulation || typeof manifest.simulation.aktiv !== "boolean"
      || !(manifest.simulation.grund === null || typeof manifest.simulation.grund === "string")) {
    fehler.push("manifest.simulation fehlt oder ist ungueltig");
  }
  if (!/^[0-9a-f]{40}$/i.test(String(manifest.mainCommit || ""))) fehler.push("manifest.mainCommit fehlt oder ist keine 40-stellige Git-Kennung");
  if (!manifest.arbeitsbaum || manifest.arbeitsbaum.sauber !== true) fehler.push("manifest.arbeitsbaum.sauber ist nicht true");
  if (!manifest.erstellt || !Number.isFinite(Date.parse(manifest.erstellt))) fehler.push("manifest.erstellt fehlt oder ist kein gueltiger Zeitpunkt");
  if (!manifest.tabellen || typeof manifest.tabellen !== "object" || Array.isArray(manifest.tabellen)) {
    fehler.push("manifest.tabellen fehlt oder ist kein Objekt");
    return { ok: false, fehler };
  }

  let erwartet;
  if (manifest.art === "voll") erwartet = Object.keys(TABLES);
  else if (manifest.art === "pre-seed") erwartet = SEED_SCOPE_TABLES.slice();
  else if (manifest.art === "pre-profil") erwartet = PROFIL_SCOPE_TABLES.slice();
  else {
    fehler.push(`unbekannte Backup-Art: ${manifest.art || "(fehlt)"}`);
    erwartet = [];
  }

  const vorhanden = Object.keys(manifest.tabellen);
  const fehlt = erwartet.filter((t) => !Object.prototype.hasOwnProperty.call(manifest.tabellen, t));
  const unerwartet = vorhanden.filter((t) => !erwartet.includes(t));
  if (fehlt.length) fehler.push(`Tabellen fehlen im Manifest: ${fehlt.join(", ")}`);
  if (unerwartet.length) fehler.push(`Tabellen ohne Restore-Vertrag im Manifest: ${unerwartet.join(", ")}`);

  for (const [tabelle, anzahl] of Object.entries(manifest.tabellen)) {
    if (!Number.isInteger(anzahl) || anzahl < 0) fehler.push(`ungueltige Zeilenzahl fuer ${tabelle}`);
  }

  const pruefsummen = manifest.pruefsummen;
  if (!pruefsummen || typeof pruefsummen !== "object" || Array.isArray(pruefsummen)) {
    fehler.push("manifest.pruefsummen fehlt oder ist kein Objekt");
  } else {
    const checksumTabellen = Object.keys(pruefsummen);
    const checksumFehlt = erwartet.filter((t) => !Object.prototype.hasOwnProperty.call(pruefsummen, t));
    const checksumExtra = checksumTabellen.filter((t) => !erwartet.includes(t));
    const checksumUngueltig = checksumTabellen.filter((t) => !/^[0-9a-f]{64}$/i.test(String(pruefsummen[t] || "")));
    if (checksumFehlt.length) fehler.push(`Pruefsummen fehlen: ${checksumFehlt.join(", ")}`);
    if (checksumExtra.length) fehler.push(`Pruefsummen ohne Tabelle: ${checksumExtra.join(", ")}`);
    if (checksumUngueltig.length) fehler.push(`ungueltige Pruefsummen: ${checksumUngueltig.join(", ")}`);
    const gesamt = sha256(JSON.stringify(pruefsummen));
    if (!/^[0-9a-f]{64}$/i.test(String(manifest.pruefsummeGesamt || ""))) {
      fehler.push("manifest.pruefsummeGesamt fehlt oder ist ungueltig");
    } else if (manifest.pruefsummeGesamt !== gesamt) {
      fehler.push("manifest.pruefsummeGesamt passt nicht zu manifest.pruefsummen");
    }
  }

  const inventar = manifest.inventar;
  if (!inventar || inventar.schemaTabellen !== 52 || inventar.exportTabellen !== 51
      || JSON.stringify(inventar.ausgenommen || []) !== JSON.stringify(["crawl_runs"])) {
    fehler.push("manifest.inventar fehlt oder bezeichnet nicht den 52/51/crawl_runs-Vertrag");
  }
  const soll = aktuellesInventar && aktuellesInventar.production;
  if (soll) {
    const produktionsRef = soll.referenz.quelle;
    if (manifest.produktionsKatalogQuelle !== produktionsRef) {
      fehler.push("manifest.produktionsKatalogQuelle passt nicht zum belegten Production-Katalog");
    }
    if (manifest.simulation && manifest.simulation.aktiv) {
      const rohHost = hostOf(manifest.quelleHost);
      const host = rohHost.startsWith("[") ? rohHost.slice(1, rohHost.indexOf("]")) : rohHost.split(":")[0];
      const loopback = host === "127.0.0.1" || host === "localhost";
      if (process.env.HELMUT_SCHUTZ_SIMULIERTE_UMGEBUNG !== "ja" || !loopback
          || manifest.simulation.grund !== "isolierter-lokaler-test") {
        fehler.push("simulierte Backup-Quelle ist nur als expliziter lokaler Loopback-Test erlaubt");
      }
    } else if (manifest.quelle !== produktionsRef || manifest.quelleHost !== `${produktionsRef}.supabase.co`) {
      fehler.push("Backup-Quelle ist nicht exakt das Projekt des belegten Production-Katalogs");
    }
    const erwartetInventar = {
      hash: soll.inventarHash,
      migrationsmanifest: soll.manifest.id,
      migrationsHistoryPruefsumme: soll.manifest.historyPruefsumme,
      migrationsPruefsumme: soll.manifest.repoSqlPruefsumme,
      katalogPruefsumme: soll.katalogPruefsumme,
      katalogErhoben: soll.referenz.erhoben,
      spaltenKatalogPruefsumme: (soll.referenz.spaltenKatalog && soll.referenz.spaltenKatalog.pruefsumme) || null
    };
    for (const [feld, wert] of Object.entries(erwartetInventar)) {
      if (!inventar || inventar[feld] !== wert) fehler.push(`manifest.inventar.${feld} passt nicht zum belegten Production-Vertrag`);
    }
  }
  const konsistenz = manifest.konsistenz;
  if (!konsistenz || typeof konsistenz.art !== "string"
      || typeof konsistenz.transaktional !== "boolean"
      || typeof konsistenz.schreibstoppBestaetigt !== "boolean"
      || typeof konsistenz.quersummenBestaetigt !== "boolean"
      || typeof konsistenz.vollRueckwegBelegt !== "boolean") {
    fehler.push("manifest.konsistenz fehlt oder ist kein vollstaendiger Konsistenzvertrag");
  } else {
    const vollBelegbar = konsistenz.transaktional === true
      || (konsistenz.schreibstoppBestaetigt === true && konsistenz.quersummenBestaetigt === true);
    if (konsistenz.vollRueckwegBelegt !== vollBelegbar) {
      fehler.push("manifest.konsistenz.vollRueckwegBelegt passt nicht zu Snapshot/Schreibstopp und Quersummen");
    }
    // Noch existiert kein unabhaengig signierter/CI-attestierter Snapshot-
    // Vertrag. Selbst gesetzte Booleans plus unkeyed SHA256 duerfen deshalb
    // niemals einen Voll-Rueckweg entsperren. Ein spaeterer echter Mechanismus
    // braucht eine neue, explizit verifizierte Vertragsversion.
    if (konsistenz.art !== "sequenzieller-rest-export"
        || konsistenz.transaktional !== false
        || konsistenz.schreibstoppBestaetigt !== false
        || konsistenz.quersummenBestaetigt !== false
        || konsistenz.vollRueckwegBelegt !== false) {
      fehler.push("kein vertrauenswuerdig attestierter Snapshot-Vertrag implementiert; Voll-Rueckweg bleibt gesperrt");
    }
  }
  if (!/^[0-9a-f]{64}$/i.test(String(manifest.manifestPruefsumme || ""))) {
    fehler.push("manifest.manifestPruefsumme fehlt oder ist ungueltig");
  } else if (berechneBackupManifestPruefsumme(manifest) !== manifest.manifestPruefsumme) {
    fehler.push("manifest.manifestPruefsumme passt nicht zum vollstaendigen Manifestvertrag");
  }

  return { ok: fehler.length === 0, fehler, erwartet };
}

// Kryptografischer Dateivertrag VOR jedem Restore-Schreibvorgang. Neben dem
// Hash wird die JSON-Form und die manifestierte Zeilenzahl geprueft. Ein
// fehlendes, veraendertes oder nur umetikettiertes Backup ist damit rot.
function pruefeBackupDateien(backupDir, manifest, erwartet) {
  const fehler = [];
  const manifestDatei = path.join(backupDir, "manifest.json");
  try {
    const status = fs.lstatSync(manifestDatei);
    if (!status.isFile() || status.isSymbolicLink()) {
      fehler.push({ tabelle: "(Manifest)", fehler: "manifest.json muss eine regulaere Datei sein und darf kein symbolischer Link sein" });
    }
  } catch (_) {
    fehler.push({ tabelle: "(Manifest)", fehler: "manifest.json fehlt oder ist nicht sicher pruefbar" });
  }
  const extraJson = fs.readdirSync(backupDir, { withFileTypes: true })
    .filter((e) => e.name.endsWith(".json") && e.name !== "manifest.json")
    .map((e) => e.name.replace(/\.json$/, ""))
    .filter((name) => !(erwartet || []).includes(name));
  if (extraJson.length) fehler.push({ tabelle: "(Verzeichnis)", fehler: `unerwartete JSON-Tabellendateien: ${extraJson.join(", ")}` });
  for (const tabelle of erwartet || []) {
    const datei = path.join(backupDir, `${tabelle}.json`);
    if (!fs.existsSync(datei)) {
      fehler.push({ tabelle, fehler: "Datei fehlt trotz Eintrag im Manifest" });
      continue;
    }
    let status;
    try { status = fs.lstatSync(datei); }
    catch (_) {
      fehler.push({ tabelle, fehler: "Tabellendatei ist nicht sicher pruefbar" });
      continue;
    }
    if (!status.isFile() || status.isSymbolicLink()) {
      fehler.push({ tabelle, fehler: "Tabellendatei muss regulaer sein und darf kein symbolischer Link sein" });
      continue;
    }
    const inhalt = fs.readFileSync(datei);
    const soll = manifest.pruefsummen && manifest.pruefsummen[tabelle];
    if (!soll || sha256(inhalt) !== soll) {
      fehler.push({ tabelle, fehler: "Pruefsumme weicht ab oder fehlt" });
      continue;
    }
    try {
      const zeilen = JSON.parse(inhalt.toString("utf8"));
      if (!Array.isArray(zeilen)) fehler.push({ tabelle, fehler: "Tabellendatei ist kein JSON-Array" });
      else if (zeilen.length !== manifest.tabellen[tabelle]) {
        fehler.push({ tabelle, fehler: `Zeilenzahl ${zeilen.length} passt nicht zum Manifestwert ${manifest.tabellen[tabelle]}` });
      }
    } catch (_) {
      fehler.push({ tabelle, fehler: "Tabellendatei ist kein gueltiges JSON" });
    }
  }
  return fehler;
}

function pruefeRemoteRestoreVertrag(manifest) {
  void manifest;
  return {
    ok: false,
    grund: "Remote-REST-Restore ist vollstaendig gesperrt: PostgREST kann GENERATED ALWAYS-Identity, CAS/Fencing, Zielleerheit und einen transaktionalen Gesamtimport nicht sicher garantieren. Es wird kein Ziel-Key gelesen und kein Netz-Write ausgefuehrt."
  };
}

function pruefeLokalesKopierziel(backupDir, localDir) {
  const kanonischerPfad = (eingabe) => {
    let cursor = path.resolve(eingabe);
    const rest = [];
    while (!fs.existsSync(cursor)) {
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      rest.unshift(path.basename(cursor));
      cursor = parent;
    }
    const basis = fs.realpathSync(cursor);
    return path.join(basis, ...rest);
  };
  const quelle = fs.realpathSync(path.resolve(backupDir));
  const ziel = kanonischerPfad(localDir);
  if (quelle === ziel) return { ok: false, grund: "Lokales Kopierziel ist identisch mit dem Backup-Verzeichnis" };
  if (ziel.startsWith(quelle + path.sep) || quelle.startsWith(ziel + path.sep)) {
    return { ok: false, grund: "Backup-Quelle und lokales Kopierziel duerfen nicht ineinander liegen" };
  }
  if (fs.existsSync(ziel)) return { ok: false, grund: "Lokales Kopierziel existiert bereits; nichts wird ueberschrieben" };
  return { ok: true, grund: null, quelle, ziel };
}

async function main() {
  let aktuellesInventar;
  try {
    aktuellesInventar = fordereGueltigesInventar(path.join(__dirname, ".."));
  } catch (error) {
    fail(error.message);
  }

  const backupDir = arg("--backup");
  const localDir = arg("--local");
  const targetUrl = String(arg("--target-url") || "").replace(/\/+$/, "");

  if (!backupDir) fail("--backup <verzeichnis> ist Pflicht (ein mit backup-export.js erzeugtes Verzeichnis).");
  const manifestPath = path.join(backupDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail(`Kein manifest.json unter ${backupDir} — ist das ein Backup-Verzeichnis?`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const manifestPruefung = pruefeManifestInventar(manifest, aktuellesInventar);
  if (!manifestPruefung.ok) fail(`Backup-Inventar unvollstaendig oder ungueltig: ${manifestPruefung.fehler.join(" | ")}`);
  const dateiPruefung = pruefeBackupDateien(backupDir, manifest, manifestPruefung.erwartet);
  if (dateiPruefung.length) fail(`Backup-Dateivertrag verletzt: ${dateiPruefung.map((f) => `${f.tabelle}: ${f.fehler}`).join(" | ")}`);
  if (!localDir && !targetUrl) fail("Ziel fehlt: --local <verzeichnis> angeben. (--target-url wird konstruktiv verweigert: Remote-REST-Restore ist gesperrt; Production-Restore macht dieses Skript bewusst NICHT.)");
  if (localDir && targetUrl) fail("Nur EIN Ziel: entweder --local oder --target-url.");

  // Vollstaendige konstruktive Sperre VOR Key-Lesen oder irgendeinem Fetch.
  if (targetUrl) fail(pruefeRemoteRestoreVertrag(manifest).grund);

  const lokalesZiel = pruefeLokalesKopierziel(backupDir, localDir);
  if (!lokalesZiel.ok) fail(lokalesZiel.grund);
  fs.mkdirSync(lokalesZiel.ziel, { recursive: false });
  fs.copyFileSync(manifestPath, path.join(lokalesZiel.ziel, "manifest.json"), fs.constants.COPYFILE_EXCL);

  const protokoll = {
    begonnen: new Date().toISOString(),
    modus: "datei-kopie-kein-datenbank-restore",
    backup: backupDir,
    quelle: manifest.quelle || "(unbekannt)",
    ziel: localDir ? `lokal:${localDir}` : refOf(targetUrl),
    tabellen: {},
    fehler: [],
    uebersprungen: []
  };
  const t0 = Date.now();

  for (const table of RESTORE_ORDER) {
    const file = path.join(backupDir, `${table}.json`);
    if (!Object.prototype.hasOwnProperty.call(manifest.tabellen, table)) {
      protokoll.uebersprungen.push(table);
      continue;
    }
    if (!fs.existsSync(file)) {
      protokoll.fehler.push({ tabelle: table, fehler: "Datei fehlt trotz Eintrag im Manifest" });
      console.error(`FEHL  ${table}: Datei fehlt trotz Eintrag im Manifest`);
      continue;
    }
    const tStart = Date.now();
    try {
      let rows = JSON.parse(fs.readFileSync(file, "utf8"));
      const erwartet = manifest.tabellen && manifest.tabellen[table] != null ? manifest.tabellen[table] : rows.length;
      if (rows.length !== erwartet) {
        throw new Error(`Datei enthaelt ${rows.length} Zeilen, Manifest erwartet ${erwartet} — Backup unvollstaendig/beschaedigt?`);
      }
      fs.copyFileSync(file, path.join(lokalesZiel.ziel, `${table}.json`), fs.constants.COPYFILE_EXCL);
      const kopiert = rows.length;
      protokoll.tabellen[table] = { zeilen: rows.length, kopiert, ms: Date.now() - tStart };
      console.log(`OK    ${table}: ${rows.length} Zeilen (${Date.now() - tStart}ms)`);
    } catch (error) {
      protokoll.fehler.push({ tabelle: table, fehler: String(error.message).slice(0, 300) });
      console.error(`FEHL  ${table}: ${error.message}`);
    }
  }

  protokoll.dauerSekunden = Math.round((Date.now() - t0) / 1000);
  protokoll.beendet = new Date().toISOString();
  protokoll.erfolg = protokoll.fehler.length === 0;

  // Das kopierte Backup bleibt im Zielwurzelverzeichnis selbst erneut
  // validierbar. Protokolle gehoeren deshalb in einen Unterordner und duerfen
  // nicht wie eine zusaetzliche Tabellendatei aussehen.
  const outDir = path.join(lokalesZiel.ziel, "dateidrill");
  fs.mkdirSync(outDir, { recursive: false });
  fs.writeFileSync(path.join(outDir, "drill-protokoll.json"), JSON.stringify(protokoll, null, 2));
  const md = [
    `# Backup-Dateidrill ${protokoll.begonnen}`,
    ``,
    `- Backup: ${protokoll.backup} (Quelle: ${protokoll.quelle})`,
    `- Ziel: ${protokoll.ziel}`,
    `- Dauer: ${protokoll.dauerSekunden}s`,
    `- Modus: lokale Dateikopie, kein Datenbank-Restore`,
    `- Ergebnis: ${protokoll.erfolg ? "DATEI-INTEGRIERT" : `${protokoll.fehler.length} FEHLER`}`,
    ``,
    `| Tabelle | Zeilen | Kopiert | ms |`,
    `| --- | --- | --- | --- |`,
    ...Object.entries(protokoll.tabellen).map(([t, v]) => `| ${t} | ${v.zeilen} | ${v.kopiert} | ${v.ms} |`),
    ``,
    protokoll.uebersprungen.length ? `Übersprungen (nicht im Backup): ${protokoll.uebersprungen.join(", ")}` : ``,
    protokoll.fehler.length ? `\n## Fehler\n${protokoll.fehler.map((f) => `- ${f.tabelle}: ${f.fehler}`).join("\n")}` : ``,
    ``,
    `Nach dem Dateidrill: lokale Kopie entfernen. Dieses Ergebnis ist kein`,
    `Datenbank-Restore- oder Voll-Rueckwegbeweis. Protokoll NUR`,
    `als Kennzahlen-Auszug — die Rohdateien enthalten personenbezogene Daten.`
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "drill-protokoll.md"), md);

  console.log(`\nBackup-Dateidrill ${protokoll.erfolg ? "DATEI-INTEGRIERT" : "MIT FEHLERN"} in ${protokoll.dauerSekunden}s — kein Datenbank-Restore; Protokoll: ${path.join(outDir, "drill-protokoll.md")}`);
  process.exit(protokoll.erfolg ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Backup-Dateidrill abgebrochen:", error);
    process.exit(1);
  });
}

module.exports = {
  RESTORE_ORDER,
  hostOf,
  refOf,
  pruefeManifestInventar,
  pruefeBackupDateien,
  pruefeRemoteRestoreVertrag,
  pruefeLokalesKopierziel
};
