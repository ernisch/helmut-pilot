"use strict";

// Helmut — LOKALER, FAIL-CLOSED ADAPTER: Voll-Backup -> Preimage-Assembler-Input
// =============================================================================================
// ZWECK
//   Schliesst genau eine Luecke: scripts/backup-export.js erzeugt ein vollstaendiges lokales
//   Backup (manifest.json + <tabelle>.json), aber NICHT die zwei Dateien, die der bestehende
//   Preimage-Assembler (scripts/import-preimage-500-snapshot.js) erwartet. Dieses Werkzeug
//   uebersetzt rein lokal ein vollstaendiges Backup in genau den Eingabeordner des Assemblers:
//     paket.json, fremd_profiles.json und je Snapshot-Tabelle <tabelle>.json.
//   Es erzeugt KEINEN Snapshot und KEIN SQL — nur den Eingabeordner. Den Snapshot baut weiterhin
//   ausschliesslich scripts/import-preimage-500-snapshot.js.
//
// KEIN DB-, SUPABASE- ODER NETZWERKZUGRIFF
//   Es werden ausschliesslich lokale Dateien gelesen (Backup + kanonisches Paket) und lokale
//   Dateien geschrieben. Keine Datenbank, kein Netz, keine Production, keine Modellaufrufe.
//
// FAIL-CLOSED-VORBEDINGUNGEN (jede Verletzung = kein Output, Exit 2)
//   * Backup-Manifest vorhanden, art === "voll", vollstaendig === true, pruefsummeGesamt konsistent.
//   * Alle 17 Pflichttabellen vorhanden; manifest.tabellen[<t>] == tatsaechliche Zeilenzahl UND
//     manifest.pruefsummen[<t>] == sha256 des gelieferten <t>.json.
//   * profiles (Voll-Backup): eindeutige ids; genau 500 Zeilen MIT Mandat + genau 1 ohne Mandat.
//   * mandate_profiles: exakt 500 Zeilen mit eindeutiger user_id; ID-Menge == profiles-ID-Menge.
//   * 0 aktive Mandatszeilen (jede Zeile woertlich aktiv === false).
//   * Keine AfD-Zugehoerigkeit in Partei ODER Fraktion (AGENTS.md, lib/helmut/profil-zulassung.js).
//   * Alle FK-Kindzeilen tragen eine user_id INNERHALB der 500er-Kohorte.
//   * fremd_profiles == profiles OHNE Mandat == genau 1 Zeile; profiles.json (Assembler) == die
//     500 profiles-Zeilen MIT Mandat.
//   * --paket ist das kanonische 500er-Paket; paket.json traegt dessen sha256.
//
// AUSGABE
//   --out-dir muss AUSSERHALB des Repository-Root liegen. Jede Datei wird atomar (Temp + rename)
//   mit mode 0600 geschrieben. Ohne --force wird kein vorhandenes Ziel ueberschrieben. Es wird
//   erst geschrieben, NACHDEM alle Vorbedingungen erfuellt sind. Auf stdout stehen nur Pfad,
//   Hash und Mengenzusammenfassung — niemals Rohdaten.
//
// AUFRUF
//   node scripts/import-preimage-500-backup-adapter.js \
//     --backup-dir <vollbackup> --out-dir <ziel-ausserhalb-repo> \
//     --paket <kanonisches-500er-paket> [--force]
//
// WAS DIESES SKRIPT NICHT TUT
//   Kein Netz, keine DB, kein Modell, keine Production-Aktion, kein Git, kein Commit/Push/PR,
//   keine Migration, keine Profilanlage/-aktivierung, kein Crawl, kein 500er-Test. Es erzeugt nur
//   lokale Eingabedateien; ausgefuehrt wird nichts.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const GEN = require(path.join(__dirname, "import-preflight-500-sql-generator.js"));
const ZULASSUNG = require(path.join(ROOT, "lib", "helmut", "profil-zulassung.js"));

// Die einzige Wahrheit fuer Tabellen, Mengen und Vertrag stammt aus dem bestehenden Generator.
const SNAPSHOT_TABELLEN = GEN.SNAPSHOT_TABELLEN;
const FK_KINDTABELLEN = GEN.FK_KINDTABELLEN;
const MANDATE_GESAMT = GEN.MANDATE_GESAMT;
const PROFILES_GESAMT = GEN.PROFILES_GESAMT;
const FREMD_GESAMT = PROFILES_GESAMT - MANDATE_GESAMT; // = 1

const MANIFEST_DATEI = "manifest.json";
const PAKET_METADAT_DATEI = "paket.json";
const FREMD_DATEI = "fremd_profiles.json";
const SHA256_RE = /^[0-9a-f]{64}$/;

// ── kleine Helfer ───────────────────────────────────────────────────────────────────────────
function text(v) { return String(v == null ? "" : v).trim(); }
function istZeile(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function sha256Hex(s) { return crypto.createHash("sha256").update(String(s), "utf8").digest("hex"); }
function gleichMenge(a, b) {
  const s = (l) => JSON.stringify([...new Set(l.map(text))].sort());
  return s(a) === s(b);
}
function fehler(code, nachricht) {
  const e = new Error(nachricht);
  e.code = code;
  return e;
}
// Rohform-Treffer wie im Generator: "AfD"/"Alternative fuer Deutschland" in Partei oder Fraktion.
function afdRohTreffer(p) {
  return /afd|alternative f(ü|ue)r deutschland/i.test(`${text(p && p.partei)} ${text(p && p.fraktion)}`);
}

// ── Backup-Manifest pruefen (fail-closed) ────────────────────────────────────────────────────
function ladeManifest(backupDir) {
  const pfad = path.join(backupDir, MANIFEST_DATEI);
  let roh;
  try {
    roh = JSON.parse(fs.readFileSync(pfad, "utf8"));
  } catch (e) {
    throw fehler("manifest-unlesbar",
      `Backup-Manifest fehlt oder ist kein gueltiges JSON: ${MANIFEST_DATEI} (${String(e && e.message)}).`);
  }
  if (!istZeile(roh)) throw fehler("manifest-kein-objekt", `${MANIFEST_DATEI} ist kein JSON-Objekt.`);
  if (roh.art !== "voll") {
    throw fehler("manifest-art", `manifest.art = ${JSON.stringify(roh.art)} (erwartet "voll").`);
  }
  if (roh.vollstaendig !== true) {
    throw fehler("manifest-unvollstaendig",
      `manifest.vollstaendig = ${JSON.stringify(roh.vollstaendig)} (erwartet true). Ein unvollstaendiges Backup ist keine Grundlage.`);
  }
  if (!istZeile(roh.tabellen)) throw fehler("manifest-tabellen", "manifest.tabellen fehlt/kein Objekt.");
  if (!istZeile(roh.pruefsummen)) throw fehler("manifest-pruefsummen", "manifest.pruefsummen fehlt/kein Objekt.");
  const gesamt = text(roh.pruefsummeGesamt).toLowerCase();
  if (!SHA256_RE.test(gesamt)) {
    throw fehler("manifest-gesamtpruefsumme", "manifest.pruefsummeGesamt fehlt oder ist kein SHA-256.");
  }
  if (gesamt !== sha256Hex(JSON.stringify(roh.pruefsummen))) {
    throw fehler("manifest-gesamtpruefsumme", "manifest.pruefsummeGesamt passt nicht zu manifest.pruefsummen.");
  }
  return roh;
}

// ── Pflichttabelle lesen: Zeilenzahl UND Pruefsumme gegen das Manifest halten ─────────────────
function ladeTabelle(backupDir, name, manifest) {
  const pfad = path.join(backupDir, `${name}.json`);
  let roh;
  try {
    roh = fs.readFileSync(pfad, "utf8");
  } catch (e) {
    throw fehler("tabelle-fehlt", `Pflichttabelle fehlt im Backup: ${name}.json (${String(e && e.message)}).`);
  }
  let zeilen;
  try {
    zeilen = JSON.parse(roh);
  } catch (e) {
    throw fehler("tabelle-json", `${name}.json ist kein gueltiges JSON: ${String(e && e.message)}.`);
  }
  if (!Array.isArray(zeilen)) throw fehler("tabelle-kein-array", `${name}.json ist keine JSON-Zeilenliste.`);
  const erwarteteZahl = manifest.tabellen[name];
  if (!Number.isInteger(erwarteteZahl)) {
    throw fehler("manifest-zeilenzahl", `manifest.tabellen.${name} fehlt oder ist keine Zahl.`);
  }
  if (zeilen.length !== erwarteteZahl) {
    throw fehler("tabelle-anzahl", `${name}: ${zeilen.length} Zeilen, Manifest meldet ${erwarteteZahl} — inkonsistent.`);
  }
  const erwarteteSumme = text(manifest.pruefsummen[name]).toLowerCase();
  if (!SHA256_RE.test(erwarteteSumme)) {
    throw fehler("manifest-tabelle-pruefsumme", `manifest.pruefsummen.${name} fehlt oder ist kein SHA-256.`);
  }
  if (sha256Hex(roh) !== erwarteteSumme) {
    throw fehler("tabelle-pruefsumme", `${name}: sha256 weicht vom Manifest ab — Backup beschaedigt oder veraendert.`);
  }
  return zeilen;
}

// ── Bestand pruefen und Fremdprofilbestand ableiten ──────────────────────────────────────────
function pruefeBestand(tabellen) {
  // Das VOLL-Backup traegt in profiles ALLE Profile (Mandatskohorte + Fremdprofil). Der Assembler
  // erwartet dagegen profiles.json = genau die 500 Preimage-Mandatszeilen. Der Adapter trennt die
  // beiden Bestaende anhand der mandate_profiles-user_ids: profiles MIT Mandat sind die
  // Preimage-Kohorte, profiles OHNE Mandat sind der Fremdbestand.
  const alleProfile = tabellen.profiles;
  const alleProfileIds = [];
  for (const z of alleProfile) {
    if (!istZeile(z) || !text(z.id)) throw fehler("profiles-zeile", "Eine profiles-Zeile ist kein Objekt mit nicht-leerer id.");
    alleProfileIds.push(text(z.id));
  }
  if (new Set(alleProfileIds).size !== alleProfileIds.length) throw fehler("profiles-dublette", "profiles enthaelt doppelte ids.");

  const mandateRows = tabellen.mandate_profiles;
  if (mandateRows.length !== MANDATE_GESAMT) {
    throw fehler("mandate-anzahl", `mandate_profiles: ${mandateRows.length} Zeilen (erwartet exakt ${MANDATE_GESAMT}).`);
  }
  const mandateIds = [];
  let aktiv = 0;
  let afd = 0;
  for (const z of mandateRows) {
    if (!istZeile(z) || !text(z.user_id)) throw fehler("mandate-zeile", "Eine mandate_profiles-Zeile ist kein Objekt mit nicht-leerer user_id.");
    mandateIds.push(text(z.user_id));
    if (z.aktiv !== false) aktiv += 1;
    if (ZULASSUNG.istAusgeschlossen({ partei: z.partei, fraktion: z.fraktion }) || afdRohTreffer(z)) afd += 1;
  }
  if (new Set(mandateIds).size !== mandateIds.length) throw fehler("mandate-dublette", "mandate_profiles enthaelt doppelte user_ids.");
  if (aktiv !== 0) throw fehler("aktiv", `${aktiv} mandate_profiles-Zeilen sind nicht woertlich aktiv === false (erwartet 0 aktive).`);
  if (afd !== 0) {
    throw fehler("afd", `${afd} Mandatszeile(n) tragen AfD-Zugehoerigkeit in Partei oder Fraktion — ausgeschlossen (AGENTS.md).`);
  }

  const mandatSet = new Set(mandateIds);
  const mandatsProfileRows = alleProfile.filter((z) => mandatSet.has(text(z.id)));
  const fremdRows = alleProfile.filter((z) => !mandatSet.has(text(z.id)));
  if (mandatsProfileRows.length !== MANDATE_GESAMT) {
    throw fehler("profiles-mandat-anzahl",
      `profiles mit Mandat: ${mandatsProfileRows.length} Zeile(n) (erwartet exakt ${MANDATE_GESAMT}).`);
  }
  if (!gleichMenge(mandatsProfileRows.map((z) => text(z.id)), mandateIds)) {
    throw fehler("id-menge", "profiles-Mandats-ids und mandate_profiles.user_ids stimmen nicht ueberein.");
  }

  // FK-Kindzeilen gehoeren ausschliesslich zur Preimage-Kohorte (der Fremdbestand bleibt unberuehrt).
  for (const name of FK_KINDTABELLEN) {
    if (name === "mandate_profiles") continue;
    for (const z of tabellen[name]) {
      if (!istZeile(z) || !text(z.user_id)) {
        throw fehler("kind-user-id", `Tabelle "${name}" enthaelt eine Zeile ohne user_id.`);
      }
      if (!mandatSet.has(text(z.user_id))) {
        throw fehler("kind-fremd", `Tabelle "${name}" verweist auf "${text(z.user_id)}" ausserhalb der 500er-Kohorte.`);
      }
    }
  }

  if (fremdRows.length !== FREMD_GESAMT) {
    throw fehler("fremd-anzahl", `profiles ohne Mandat: ${fremdRows.length} Zeile(n) (erwartet exakt ${FREMD_GESAMT}).`);
  }
  return { profileRows: mandatsProfileRows, fremdRows };
}

// ── Kanonisches Paket einbinden (Paketpfad + sha256) ─────────────────────────────────────────
function ladePaket(paketPfad) {
  let roh;
  try {
    roh = fs.readFileSync(paketPfad);
  } catch (e) {
    throw fehler("paket-unlesbar", `--paket nicht lesbar: ${paketPfad} (${String(e && e.message)}).`);
  }
  let paket;
  try {
    paket = JSON.parse(roh.toString("utf8"));
  } catch (e) {
    throw fehler("paket-json", `--paket ist kein gueltiges JSON: ${String(e && e.message)}.`);
  }
  if (!istZeile(paket) || !Array.isArray(paket.profile) || paket.profile.length !== MANDATE_GESAMT) {
    throw fehler("paket-unerwartet",
      `--paket ist nicht das kanonische 500er-Paket (profile muss ${MANDATE_GESAMT} Eintraege haben).`);
  }
  return { pfad: paketPfad, sha256: crypto.createHash("sha256").update(roh).digest("hex") };
}

// ── Zielpfad-Schutz (Output ausserhalb des Repository-Root) ──────────────────────────────────
function realPfadAus(pfad) {
  let cur = path.resolve(pfad);
  const rest = [];
  while (!fs.existsSync(cur)) {
    rest.unshift(path.basename(cur));
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  const real = fs.existsSync(cur) ? fs.realpathSync(cur) : cur;
  return rest.length ? path.join(real, ...rest) : real;
}

function liegtImRepo(zielPfad) {
  const rootReal = fs.realpathSync(ROOT);
  const rel = path.relative(rootReal, realPfadAus(zielPfad));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// ── Atomares Schreiben mit mode 0600 ─────────────────────────────────────────────────────────
function schreibeAtomar(zielPfad, inhalt) {
  const dir = path.dirname(zielPfad);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.${path.basename(zielPfad)}.tmp-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(tmp, inhalt, { mode: 0o600 });
    fs.chmodSync(tmp, 0o600); // umask-unabhaengig sicherstellen
    fs.renameSync(tmp, zielPfad);
  } catch (e) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
    throw e;
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────
const PFLICHT_FLAGS = ["--backup-dir", "--out-dir", "--paket"];
const FLAG_ZU_OPT = { "--backup-dir": "backupDir", "--out-dir": "outDir", "--paket": "paket" };

function parseArgs(argv) {
  const opts = { backupDir: null, outDir: null, paket: null, force: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--backup-dir") opts.backupDir = argv[++i];
    else if (a === "--out-dir") opts.outDir = argv[++i];
    else if (a === "--paket") opts.paket = argv[++i];
    else if (a === "--force") opts.force = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else throw fehler("arg-unbekannt", `Unbekanntes Argument '${a}'.`);
  }
  return opts;
}

function nutzung() {
  return [
    "Aufruf: node scripts/import-preimage-500-backup-adapter.js \\",
    "  --backup-dir <vollbackup> --out-dir <ziel-ausserhalb-repo> \\",
    "  --paket <kanonisches-500er-paket> [--force]",
    "",
    "Uebersetzt ein vollstaendiges Backup (scripts/backup-export.js) in den Eingabeordner des",
    "Preimage-Assemblers (scripts/import-preimage-500-snapshot.js):",
    `  ${PAKET_METADAT_DATEI}, ${FREMD_DATEI} und je Snapshot-Tabelle <tabelle>.json`,
    `  (${SNAPSHOT_TABELLEN.length} Tabellen).`,
    "Das Ziel (--out-dir) muss AUSSERHALB des Repository-Root liegen."
  ].join("\n");
}

function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`FAIL-CLOSED: ${String(e && e.message)}\n${nutzung()}\n`);
    return 2;
  }
  if (opts.help) { process.stdout.write(nutzung() + "\n"); return 0; }

  // (1) Pflichtwerte: ohne alle fail-closed, kein Output.
  const fehlend = PFLICHT_FLAGS.filter((f) => !text(opts[FLAG_ZU_OPT[f]]));
  if (fehlend.length) {
    process.stderr.write(`FAIL-CLOSED: fehlende Pflichtwerte: ${fehlend.join(", ")}\n${nutzung()}\n`);
    return 2;
  }

  const backupDir = path.resolve(opts.backupDir);
  const outDir = path.resolve(opts.outDir);
  const paketPfad = path.resolve(opts.paket);

  // (2) Output ausserhalb des Repository-Root.
  if (liegtImRepo(outDir)) {
    process.stderr.write("FAIL-CLOSED: --out-dir muss AUSSERHALB des Repository-Root liegen.\n");
    return 2;
  }
  if (fs.existsSync(outDir) && !fs.statSync(outDir).isDirectory()) {
    process.stderr.write(`FAIL-CLOSED: --out-dir zeigt auf eine Datei: ${outDir}\n`);
    return 2;
  }
  if (!fs.existsSync(backupDir) || !fs.statSync(backupDir).isDirectory()) {
    process.stderr.write(`FAIL-CLOSED: --backup-dir ist kein Verzeichnis: ${backupDir}\n`);
    return 2;
  }

  // (3) Backup + Paket lesen und streng pruefen, BEVOR irgendetwas geschrieben wird.
  let manifest;
  let tabellen;
  let bestand;
  let paket;
  try {
    manifest = ladeManifest(backupDir);
    tabellen = {};
    for (const name of SNAPSHOT_TABELLEN) tabellen[name] = ladeTabelle(backupDir, name, manifest);
    bestand = pruefeBestand(tabellen);
    paket = ladePaket(paketPfad);
  } catch (e) {
    process.stderr.write(`FAIL-CLOSED: ${String(e && e.message)}\n`);
    return 2;
  }

  // (4) Zieldateien bestimmen und Ueberschreiben ohne --force verweigern.
  // profiles.json ist der Sonderfall: der Assembler erwartet genau die 500 Mandatszeilen, nicht
  // die 501 profiles des Voll-Backups. Der Fremdbestand wird zu fremd_profiles.json.
  const dateien = [];
  for (const name of SNAPSHOT_TABELLEN) {
    dateien.push([`${name}.json`, JSON.stringify(name === "profiles" ? bestand.profileRows : tabellen[name])]);
  }
  dateien.push([FREMD_DATEI, JSON.stringify(bestand.fremdRows)]);
  dateien.push([PAKET_METADAT_DATEI, JSON.stringify({ pfad: paket.pfad, sha256: paket.sha256 })]);

  const vorhanden = dateien.map(([name]) => path.join(outDir, name)).filter((f) => fs.existsSync(f));
  if (vorhanden.length && !opts.force) {
    process.stderr.write(
      `FAIL-CLOSED: Zieldateien existieren bereits (${vorhanden.length}). Nutze --force zum Ersetzen.\n`
      + vorhanden.slice(0, 5).map((f) => `  ${f}`).join("\n") + "\n");
    return 2;
  }

  // (5) Atomar, mode 0600. Keine Rohdaten/Dateninhalte auf stdout.
  try {
    fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
    for (const [name, inhalt] of dateien) schreibeAtomar(path.join(outDir, name), inhalt);
  } catch (e) {
    process.stderr.write(`FAIL-CLOSED: Ziel nicht schreibbar: ${String(e && e.message)}\n`);
    return 2;
  }

  const kindZeilen = FK_KINDTABELLEN
    .filter((t) => t !== "mandate_profiles")
    .reduce((n, t) => n + (Array.isArray(tabellen[t]) ? tabellen[t].length : 0), 0);
  process.stdout.write(
    "Assembler-Eingabe geschrieben (rein lokal, fail-closed geprueft, nicht ausgefuehrt).\n"
    + `  Backup: ${backupDir} (art=voll, vollstaendig=true, ${Object.keys(manifest.tabellen).length} Tabellen)\n`
    + `  profiles=${bestand.profileRows.length} mandateProfiles=${tabellen.mandate_profiles.length}`
    + ` fremd=${bestand.fremdRows.length} aktiv=0 afd=0 kindzeilen=${kindZeilen}\n`
    + `  Paket: ${paket.pfad} sha256 ${paket.sha256}\n`
    + `  Ziel: ${outDir} (${dateien.length} Dateien, mode 0600)\n`
    + "  Naechster Schritt (Assembler, separat):\n"
    + `    node scripts/import-preimage-500-snapshot.js --input-dir ${outDir}`
    + " --out <snapshot.json AUSSERHALB repo> --operation-id <kennung> --operator <wer>\n");
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = {
  PFLICHT_FLAGS,
  MANIFEST_DATEI,
  PAKET_METADAT_DATEI,
  FREMD_DATEI,
  ladeManifest,
  ladeTabelle,
  pruefeBestand,
  ladePaket,
  liegtImRepo,
  schreibeAtomar,
  main
};
