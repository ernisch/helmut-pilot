"use strict";

// Helmut — LOKALER, OFFLINE-PREIMAGE-SNAPSHOT-ASSEMBLER für den 500er-Ersatz
// =============================================================================================
// ZWECK
//   Der fail-closed Ersatzgenerator (scripts/import-preflight-500-sql-generator.js) verlangt
//   einen vollstaendigen, versionierten Preimage-Snapshot (Vertrag helmut-500-preimage/1). Der
//   Generator erzeugt diesen Snapshot bewusst NICHT selbst — er konsumiert ihn nur. Dieses
//   Werkzeug schliesst genau diese Luecke: Es baut aus bereits vorhandenen, vom Betreiber lokal
//   und rein lesend exportierten JSON-Dateien genau EINEN Snapshot zusammen und versiegelt ihn
//   mit einem konsistenten sha256.
//
// KEIN DB-, SUPABASE- ODER NETZWERKZUGRIFF
//   Dieses Werkzeug liest AUSSCHLIESSLICH lokale JSON-Dateien aus dem uebergebenen --input-dir
//   und schreibt AUSSCHLIESSLICH eine lokale Snapshot-Datei. Es oeffnet keine Datenbank, ruft
//   kein Netzwerk und keine Production auf. Die Exporte selbst erzeugt der Betreiber separat,
//   rein lesend, VOR der geschuetzten Production-Aktion.
//
// EINGABEVERTRAG (--input-dir)
//   <input-dir>/paket.json                  { "pfad": "...", "sha256": "<64 hex>" }  Paketbindung
//   <input-dir>/profiles.json               JSON-Zeilenliste der alten profiles-Zeilen
//   <input-dir>/mandate_profiles.json       JSON-Zeilenliste der alten mandate_profiles-Zeilen
//   <input-dir>/<jede FK-Kindtabelle>.json  JSON-Zeilenliste je bekannter FK-Kindtabelle
//   <input-dir>/fremd_profiles.json         JSON-Zeilenliste der profiles-Zeilen OHNE Mandat
//   Eine "JSON-Zeilenliste" ist ein JSON-Array von Zeilenobjekten. Zusaetzlich wird eine
//   JSONL-Datei (ein JSON-Objekt je Zeile) akzeptiert. Leer oder "null" bedeutet leere Liste.
//
// QUELLE DER SNAPSHOT-TABELLEN UND DES VERTRAGS
//   Die zu exportierenden Tabellen (SNAPSHOT_TABELLEN), der Snapshot-Vertrag, die Mengen (500/501),
//   die ID-Mengenbindung, der Hash und die strikte Validierung stammen AUSSCHLIESSLICH aus den
//   Exports des bestehenden Generators (pruefeSnapshot/hashPaket/hashSnapshot). Es gibt keine
//   zweite Wahrheit.
//
// AUSGABE
//   Genau EINE Snapshot-Datei an --out. --out muss AUSSERHALB des Repository-Root liegen, wird
//   mit mode 0600 atomar geschrieben (Temp-Datei + rename) und bei bereits vorhandenem Ziel ohne
//   explizites --force fail-closed abgelehnt. Auf stdout stehen nur Pfad/Hash/Mengenzusammenfassung
//   — niemals Rohdaten, SQL oder Zeileninhalte.
//
// AUFRUF
//   node scripts/import-preimage-500-snapshot.js \
//     --input-dir <verzeichnis> --out <snapshot.json> \
//     --operation-id <kennung> --operator <erstelltVon> [--paket <paketdatei>] [--force]
//   Ohne alle Pflichtwerte (--input-dir, --out, --operation-id, --operator) fail-closed: kein Output.
//   Exit 0 = Snapshot gueltig geschrieben · 2 = Eingabe fehlerhaft/missing/unsicher (kein Output).
//
// WAS DIESES SKRIPT NICHT TUT
//   Kein Netz, keine DB, kein Modell, keine Production-Aktion, kein Git, kein Commit/Push/PR,
//   keine Migration, keine Profilanlage/-aktivierung, kein Crawl, kein 500er-Test. Es erzeugt nur
//   eine lokale Snapshot-Datei; ausgefuehrt wird nichts.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const GEN = require(path.join(__dirname, "import-preflight-500-sql-generator.js"));

const SNAPSHOT_VERTRAG = GEN.SNAPSHOT_VERTRAG;
const SNAPSHOT_TABELLEN = GEN.SNAPSHOT_TABELLEN;
const FK_KINDTABELLEN = GEN.FK_KINDTABELLEN;
const PROFILES_GESAMT = GEN.PROFILES_GESAMT;
const MANDATE_GESAMT = GEN.MANDATE_GESAMT;

const PAKET_METADAT_DATEI = "paket.json";
const FREMD_DATEI = "fremd_profiles.json";
const SHA256_RE = /^[0-9a-f]{64}$/;

// ── kleine Helfer ───────────────────────────────────────────────────────────────────────────
function text(v) { return String(v == null ? "" : v).trim(); }
function istZeile(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function eindeutigSortiert(liste) { return [...new Set(liste)].sort(); }

function fehlerKlasse(code, nachricht) {
  const e = new Error(nachricht);
  e.code = code;
  return e;
}

// ── Eingaben lesen (nur lokal) ───────────────────────────────────────────────────────────────
function ladeZeilenliste(pfad, name) {
  let roh;
  try {
    roh = fs.readFileSync(pfad, "utf8");
  } catch (e) {
    throw fehlerKlasse("input-fehlt",
      `Eingabedatei fehlt oder ist nicht lesbar: ${path.basename(pfad)} (Tabelle "${name}").`);
  }
  const trimmed = roh.trim();
  if (trimmed === "" || trimmed === "null") return [];
  if (trimmed.startsWith("[")) {
    let liste;
    try { liste = JSON.parse(trimmed); } catch (e) {
      throw fehlerKlasse("input-json", `Eingabedatei ${path.basename(pfad)} ist kein gueltiges JSON: ${String(e && e.message)}.`);
    }
    if (!Array.isArray(liste)) {
      throw fehlerKlasse("input-json", `Eingabedatei ${path.basename(pfad)} ist kein JSON-Array von Zeilen.`);
    }
    return liste;
  }
  // JSONL: ein JSON-Objekt je Zeile.
  const liste = [];
  for (const zeile of trimmed.split(/\r?\n/)) {
    if (!zeile.trim()) continue;
    try { liste.push(JSON.parse(zeile)); } catch (e) {
      throw fehlerKlasse("input-json", `Eingabedatei ${path.basename(pfad)} ist weder JSON-Array noch gueltiges JSONL: ${String(e && e.message)}.`);
    }
  }
  return liste;
}

function ladePaketBindung(dir) {
  const pfad = path.join(dir, PAKET_METADAT_DATEI);
  let roh;
  try {
    roh = JSON.parse(fs.readFileSync(pfad, "utf8"));
  } catch (e) {
    throw fehlerKlasse("paketbindung",
      `Paketbindung fehlt/unlesbar: ${PAKET_METADAT_DATEI} erwartet { "pfad", "sha256" } (${String(e && e.message)}).`);
  }
  if (!istZeile(roh)) throw fehlerKlasse("paketbindung", `${PAKET_METADAT_DATEI} ist kein JSON-Objekt { "pfad", "sha256" }.`);
  const sha256 = text(roh.sha256).toLowerCase();
  if (!SHA256_RE.test(sha256)) {
    throw fehlerKlasse("paketbindung", `${PAKET_METADAT_DATEI}.sha256 ist kein SHA-256 (64 hex).`);
  }
  return { pfad: text(roh.pfad), sha256 };
}

// ── Snapshot bauen (reine Abbildung vorhandener Exporte) ─────────────────────────────────────
function baueSnapshot({ tabellen, fremdRows, paket, operationId, erstelltVon, erstelltAm }) {
  const mandateRows = Array.isArray(tabellen.mandate_profiles) ? tabellen.mandate_profiles : [];
  const profileRows = Array.isArray(tabellen.profiles) ? tabellen.profiles : [];

  const mandatIds = eindeutigSortiert(profileRows.map((z) => text(istZeile(z) ? z.id : "")).filter(Boolean));
  const fremdIds = eindeutigSortiert(fremdRows.map((z) => text(istZeile(z) ? z.id : "")).filter(Boolean));
  // Strikt: alles, was nicht woertlich aktiv === false ist, zaehlt als aktiv (fail-closed).
  const aktivGesamt = mandateRows.filter((z) => !istZeile(z) || z.aktiv !== false).length;

  const roh = {
    snapshotVertrag: SNAPSHOT_VERTRAG,
    operationId: text(operationId),
    erstelltAm,
    erstelltVon: text(erstelltVon),
    paket: { pfad: text(paket.pfad), sha256: text(paket.sha256).toLowerCase() },
    bestand: {
      profilesGesamt: profileRows.length + fremdRows.length,
      mandateProfilesGesamt: mandateRows.length,
      aktivGesamt
    },
    ids: { mandat: mandatIds, fremd: fremdIds },
    fremd_profiles: fremdRows,
    tabellen
  };
  roh.sha256 = GEN.hashSnapshot(roh);
  return roh;
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
  fs.mkdirSync(dir, { recursive: true });
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
const PFLICHT_FLAGS = ["--input-dir", "--out", "--operation-id", "--operator"];
const FLAG_ZU_OPT = { "--input-dir": "inputDir", "--out": "out", "--operation-id": "operationId", "--operator": "operator" };

function parseArgs(argv) {
  const opts = { inputDir: null, out: null, operationId: null, operator: null, paket: null, force: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input-dir") opts.inputDir = argv[++i];
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--operation-id") opts.operationId = argv[++i];
    else if (a === "--operator") opts.operator = argv[++i];
    else if (a === "--paket") opts.paket = argv[++i];
    else if (a === "--force") opts.force = true;
    else if (a === "--help" || a === "-h") opts.help = true;
  }
  return opts;
}

function nutzung() {
  return [
    "Aufruf: node scripts/import-preimage-500-snapshot.js \\",
    "  --input-dir <verzeichnis> --out <snapshot.json> \\",
    "  --operation-id <kennung> --operator <erstelltVon> [--paket <paketdatei>] [--force]",
    "",
    "Input-Vertrag (--input-dir, rein lokale, vom Betreiber exportierte JSON-Dateien):",
    `  ${PAKET_METADAT_DATEI}  { "pfad", "sha256" }   · ${FREMD_DATEI}  Fremdprofile ohne Mandat`,
    `  je Tabelle eine JSON-Zeilenliste: ${SNAPSHOT_TABELLEN.map((t) => `${t}.json`).join(", ")}`,
    "Das Ziel (--out) muss AUSSERHALB des Repository-Root liegen."
  ].join("\n");
}

function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) { process.stdout.write(nutzung() + "\n"); return 0; }

  // (1) Pflichtwerte: ohne alle fail-closed, kein Output.
  const fehlend = PFLICHT_FLAGS.filter((f) => !text(opts[FLAG_ZU_OPT[f]]));
  if (fehlend.length) {
    process.stderr.write(`FAIL-CLOSED: fehlende Pflichtwerte: ${fehlend.join(", ")}\n${nutzung()}\n`);
    return 2;
  }

  const inputDir = path.resolve(opts.inputDir);
  const outPfad = path.resolve(opts.out);

  // (4) Output ausserhalb des Repository-Root.
  if (liegtImRepo(outPfad)) {
    process.stderr.write("FAIL-CLOSED: --out muss AUSSERHALB des Repository-Root liegen.\n");
    return 2;
  }
  // (4) Bestehendes Ziel ohne --force fail-closed.
  if (fs.existsSync(outPfad)) {
    if (fs.statSync(outPfad).isDirectory()) {
      process.stderr.write(`FAIL-CLOSED: --out zeigt auf ein Verzeichnis: ${outPfad}\n`);
      return 2;
    }
    if (!opts.force) {
      process.stderr.write(`FAIL-CLOSED: Zieldatei existiert bereits (${outPfad}). Nutze --force zum Ersetzen.\n`);
      return 2;
    }
  }

  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    process.stderr.write(`FAIL-CLOSED: --input-dir ist kein Verzeichnis: ${inputDir}\n`);
    return 2;
  }

  // (2)/(3) Paketbindung, Eingaben lesen, strikt pruefen.
  let paketBindung;
  try {
    paketBindung = ladePaketBindung(inputDir);
  } catch (e) { process.stderr.write(`FAIL-CLOSED: ${String(e && e.message)}\n`); return 2; }

  // Optionaler Paketbeleg: der echte Paket-Hash wird lokal berechnet und mit der Bindung
  // abgeglichen (reine lokale Dateipruefung; kein Netz/DB).
  if (opts.paket) {
    let echt;
    try { echt = GEN.hashPaket(path.resolve(opts.paket)); } catch (e) {
      process.stderr.write(`FAIL-CLOSED: --paket nicht lesbar: ${String(e && e.message)}\n`);
      return 2;
    }
    if (echt !== paketBindung.sha256) {
      process.stderr.write("FAIL-CLOSED: paket.json sha256 passt nicht zur --paket-Datei.\n");
      return 2;
    }
  }

  let tabellen;
  let fremdRows;
  try {
    tabellen = {};
    for (const name of SNAPSHOT_TABELLEN) {
      tabellen[name] = ladeZeilenliste(path.join(inputDir, `${name}.json`), name);
    }
    fremdRows = ladeZeilenliste(path.join(inputDir, FREMD_DATEI), "fremd_profiles");
  } catch (e) { process.stderr.write(`FAIL-CLOSED: ${String(e && e.message)}\n`); return 2; }

  const snapshot = baueSnapshot({
    tabellen,
    fremdRows,
    paket: paketBindung,
    operationId: opts.operationId,
    erstelltVon: opts.operator,
    erstelltAm: new Date().toISOString()
  });

  const sp = GEN.pruefeSnapshot(snapshot, { paketHash: paketBindung.sha256, neueIds: [] });
  if (!sp.ok) {
    const zeilen = ["FAIL-CLOSED: zusammengesetzter Snapshot ist ungueltig — kein Output."];
    for (const f of sp.fehler) {
      zeilen.push(`  FEHLER [${f.code}] ${f.text}`);
      if (f.hinweis) zeilen.push(`         -> ${f.hinweis}`);
    }
    process.stderr.write(zeilen.join("\n") + "\n");
    return 2;
  }
  // Konsistenz abschliessend gegen die unabhaengige Eigenpruefung stellen.
  if (GEN.hashSnapshot(snapshot) !== snapshot.sha256) {
    process.stderr.write("FAIL-CLOSED: sha256 ist nicht selbstkonsistent — kein Output.\n");
    return 2;
  }

  // (4) Atomar, mode 0600, nur Pfad/Hash/Mengenzusammenfassung auf stdout.
  try {
    schreibeAtomar(outPfad, JSON.stringify(snapshot) + "\n");
  } catch (e) {
    process.stderr.write(`FAIL-CLOSED: Snapshot nicht schreibbar: ${String(e && e.message)}\n`);
    return 2;
  }

  const kindZeilen = FK_KINDTABELLEN
    .filter((t) => t !== "mandate_profiles")
    .reduce((n, t) => n + (Array.isArray(tabellen[t]) ? tabellen[t].length : 0), 0);
  process.stdout.write(
    "Snapshot geschrieben (fail-closed geprueft, nicht ausgefuehrt).\n"
    + `  Pfad: ${outPfad}\n`
    + `  sha256: ${snapshot.sha256}\n`
    + `  operationId: ${snapshot.operationId}\n`
    + `  bestand: profiles=${snapshot.bestand.profilesGesamt} mandateProfiles=${snapshot.bestand.mandateProfilesGesamt}`
    + ` aktiv=${snapshot.bestand.aktivGesamt} fremd=${fremdRows.length}\n`
    + `  tabellen: ${SNAPSHOT_TABELLEN.length} Abschnitte (profiles=${tabellen.profiles.length}`
    + ` mandate_profiles=${tabellen.mandate_profiles.length} kindzeilen=${kindZeilen})\n`);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = {
  PFLICHT_FLAGS,
  PAKET_METADAT_DATEI,
  FREMD_DATEI,
  ladeZeilenliste,
  ladePaketBindung,
  baueSnapshot,
  liegtImRepo,
  schreibeAtomar,
  main
};
