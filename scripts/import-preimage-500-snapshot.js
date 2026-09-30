"use strict";

// Helmut — LOKALER, OFFLINE-PREIMAGE-SNAPSHOT-ASSEMBLER für den 500er-Ersatz
// =============================================================================================
// ZWECK
//   Baut aus bereits vorhandenen, vom Betreiber lokal und rein lesend exportierten JSON-Dateien
//   einen versionierten v2-Preimage-Snapshot. v2 ist kein einzelner JSON-Blob mehr, sondern ein
//   Snapshot-VERZEICHNIS:
//     manifest.json                         kleiner, kanonisch versiegelter Vertrag
//     <tabelle>.jsonl                       je Snapshot-Tabelle genau eine kanonische JSONL-Datei
//     fremd_profiles.jsonl                  profiles ohne Mandat (bleibt unangetastet)
//   Dadurch wird der fruehere Gesamt-JSON.stringify-Pfad vermieden; Tabellen werden einzeln
//   gelesen, geprueft und geschrieben.
//
// VERTRAG: helmut-500-preimage/2
//   Das Manifest bindet operationId, Paket-Hash, Mengen, ID-Sets, Spaltenlisten, Zeilenzahlen,
//   SHA-256 jeder Datei und einen eigenen kanonischen Hash. Version 1 faellt nicht still: sie
//   wird weder erzeugt noch als v2 akzeptiert.
//
// KEIN DB-, SUPABASE- ODER NETZWERKZUGRIFF
//   Dieses Werkzeug liest AUSSCHLIESSLICH lokale Dateien aus --input-dir und schreibt
//   AUSSCHLIESSLICH ein lokales Snapshot-Verzeichnis. Keine Datenbank, kein Netz, keine
//   Production-Aktion.
//
// EINGABEVERTRAG (--input-dir)
//   <input-dir>/paket.json                  { "pfad": "...", "sha256": "<64 hex>" }  Paketbindung
//   <input-dir>/profiles.json               JSON-Zeilenliste der alten profiles-Zeilen
//   <input-dir>/mandate_profiles.json       JSON-Zeilenliste der alten mandate_profiles-Zeilen
//   <input-dir>/<jede FK-Kindtabelle>.json  JSON-Zeilenliste je bekannter FK-Kindtabelle
//   <input-dir>/fremd_profiles.json         JSON-Zeilenliste der profiles-Zeilen OHNE Mandat
//   Eine "JSON-Zeilenliste" ist ein JSON-Array von Zeilenobjekten. Zusaetzlich wird JSONL
//   (ein JSON-Objekt je Zeile) akzeptiert. Leer oder "null" bedeutet leere Liste.
//
// AUSGABE
//   Genau ein Snapshot-VERZEICHNIS an --out. --out muss AUSSERHALB des Repository-Root liegen.
//   Jede Datei wird atomar (Temp + rename) mit mode 0600 geschrieben. Ein bereits vorhandenes
//   nicht-leeres Ziel wird ohne --force fail-closed abgelehnt. Auf stdout stehen nur Pfad/Hash/
//   Mengenzusammenfassung — niemals Rohdaten, SQL oder Zeileninhalte.
//
// AUFRUF
//   node scripts/import-preimage-500-snapshot.js \
//     --input-dir <verzeichnis> --out <snapshot-verzeichnis> \
//     --operation-id <kennung> --operator <erstelltVon> [--paket <paketdatei>] [--force]
//   Exit 0 = Snapshot gueltig geschrieben · 2 = Eingabe fehlerhaft/missing/unsicher (kein Output).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const GEN = require(path.join(__dirname, "import-preflight-500-sql-generator.js"));
const ZULASSUNG = require(path.join(ROOT, "lib", "helmut", "profil-zulassung.js"));

const SNAPSHOT_VERTRAG = GEN.SNAPSHOT_VERTRAG;
const SNAPSHOT_TABELLEN = GEN.SNAPSHOT_TABELLEN;
const FK_KINDTABELLEN = GEN.FK_KINDTABELLEN;
const PROFILES_GESAMT = GEN.PROFILES_GESAMT;
const MANDATE_GESAMT = GEN.MANDATE_GESAMT;
const FREMD_GESAMT = PROFILES_GESAMT - MANDATE_GESAMT;

const PAKET_METADAT_DATEI = "paket.json";
const FREMD_EINGABE_DATEI = "fremd_profiles.json";
const FREMD_TABELLE = "fremd_profiles";
const MANIFEST_DATEI = "manifest.json";
const SHA256_RE = /^[0-9a-f]{64}$/;
const SPALTEN_NAME = /^[a-z_][a-z0-9_]*$/;

// Primärschlüssel-Identität je Snapshot-Tabelle, belegt aus supabase/schema.sql und
// supabase/migrations/20260728_matching_audit.sql. 1:n-Kindtabellen duerfen dieselbe
// user_id mehrfach tragen; eindeutig ist ausschliesslich die jeweilige PK-Spalte.
const PRIMAERSCHLUESSEL = Object.freeze({
  profiles: "id",
  mandate_profiles: "user_id",
  political_items: "id",
  personalized_recommendations: "id",
  daily_tasks: "id",
  communication_drafts: "id",
  user_notes: "id",
  priority_changes: "id",
  matching_weights: "user_id",
  decisions: "id",
  topic_memory: "id",
  interactions: "id",
  office_outputs: "id",
  briefings: "id",
  profile_embeddings: "user_id",
  matching_results: "id",
  matching_runs: "id",
  fremd_profiles: "id"
});

// ── kleine Helfer ───────────────────────────────────────────────────────────────────────────
function text(v) { return String(v == null ? "" : v).trim(); }
function istZeile(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function eindeutigSortiert(liste) { return [...new Set(liste)].sort(); }
function gleichMenge(a, b) {
  return JSON.stringify(eindeutigSortiert(a.map(text))) === JSON.stringify(eindeutigSortiert(b.map(text)));
}
function sha256Text(s) { return crypto.createHash("sha256").update(String(s), "utf8").digest("hex"); }
function dateiName(tabelle) { return `${tabelle}.jsonl`; }
function afdRohTreffer(p) {
  return /afd|alternative f(ü|ue)r deutschland/i.test(`${text(p && p.partei)} ${text(p && p.fraktion)}`);
}
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

// ── Zeilenvalidierung (fail-closed, ohne Gesamtstring) ───────────────────────────────────────
function pruefeSpaltennamen(spalten, kontext) {
  const gesehen = new Set();
  for (const sp of spalten) {
    if (!SPALTEN_NAME.test(sp)) {
      throw fehlerKlasse("spalten-name", `${kontext}: Spaltenname "${sp}" ist kein sicherer Bezeichner.`);
    }
    if (gesehen.has(sp)) throw fehlerKlasse("spalten-dublette", `${kontext}: Spalte "${sp}" kommt doppelt vor.`);
    gesehen.add(sp);
  }
}

function spaltenAusZeilen(zeilen, kontext) {
  const zeilenObjekte = zeilen.filter(istZeile);
  if (zeilenObjekte.length !== zeilen.length) {
    throw fehlerKlasse("zeile-kein-objekt", `${kontext}: Eine Zeile ist kein Objekt.`);
  }
  if (!zeilenObjekte.length) return [];
  const erste = Object.keys(zeilenObjekte[0]).sort();
  pruefeSpaltennamen(erste, kontext);
  for (const z of zeilenObjekte) {
    const keys = Object.keys(z).sort();
    if (JSON.stringify(keys) !== JSON.stringify(erste)) {
      throw fehlerKlasse("spaltensatz", `${kontext}: Uneinheitliche Spaltensaetze — vollstaendige Tabellenabschnitte erwartet.`);
    }
    pruefeSpaltennamen(keys, kontext);
  }
  return erste;
}

function sortierEintraege(zeilen) {
  const keys = zeilen.map((z) => text(z.id) || text(z.user_id) || "");
  const allePrimaer = keys.every(Boolean) && new Set(keys).size === zeilen.length;
  if (allePrimaer) {
    return zeilen.map((z, i) => ({ z, json: JSON.stringify(GEN.kanonisch(z)), key: `${keys[i]}\u0000${i}` }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }
  return zeilen.map((z, i) => {
    const json = JSON.stringify(GEN.kanonisch(z));
    return { z, json, key: `${keys[i] || ""}\u0000${json}\u0000${i}` };
  }).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function schreibeJsonlAtomar(zielPfad, zeilen) {
  const dir = path.dirname(zielPfad);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.${path.basename(zielPfad)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const hash = crypto.createHash("sha256");
  let fd;
  try {
    fd = fs.openSync(tmp, "w", 0o600);
    for (const eintrag of sortierEintraege(zeilen)) {
      const chunk = `${eintrag.json}\n`;
      fs.writeSync(fd, chunk);
      hash.update(chunk, "utf8");
    }
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, zielPfad);
    return hash.digest("hex");
  } catch (e) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) { /* best effort */ } }
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
    throw e;
  }
}

function schreibeManifestAtomar(zielPfad, manifest) {
  const dir = path.dirname(zielPfad);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.${path.basename(zielPfad)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(GEN.kanonisch(manifest), null, 2) + "\n", { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, zielPfad);
  } catch (e) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
    throw e;
  }
}

// ── Einzelne Snapshot-Tabelle verarbeiten und nach Staging schreiben ─────────────────────────
function verarbeiteTabelle({ stagingDir, inputDir, name, mandateSet }) {
  const rows = ladeZeilenliste(path.join(inputDir, `${name}.json`), name);
  const spalten = spaltenAusZeilen(rows, name);
  const ids = [];
  const pk = PRIMAERSCHLUESSEL[name];
  if (!pk) {
    throw fehlerKlasse("kind-pk-unbekannt",
      `Tabelle "${name}" hat keinen belegten Primärschlüssel — fail-closed.`);
  }

  for (const z of rows) {
    if (name === "profiles") {
      if (!text(z.id)) throw fehlerKlasse("profiles-zeile", "Eine profiles-Zeile ist kein Objekt mit nicht-leerer id.");
      ids.push(text(z.id));
    } else if (name === "mandate_profiles") {
      if (!text(z.user_id)) throw fehlerKlasse("mandate-zeile", "Eine mandate_profiles-Zeile ist kein Objekt mit nicht-leerer user_id.");
      ids.push(text(z.user_id));
      if (z.aktiv !== false) throw fehlerKlasse("aktiv", `Eine mandate_profiles-Zeile ist nicht woertlich aktiv === false: ${text(z.user_id)}.`);
      if (ZULASSUNG.istAusgeschlossen({ partei: z.partei, fraktion: z.fraktion }) || afdRohTreffer(z)) {
        throw fehlerKlasse("afd", `Eine mandate_profiles-Zeile traegt AfD-Zugehoerigkeit: ${text(z.user_id)}.`);
      }
    } else if (name === FREMD_TABELLE) {
      if (!text(z.id)) throw fehlerKlasse("fremd-zeile", "Eine fremd_profiles-Zeile ist kein Objekt mit nicht-leerer id.");
      ids.push(text(z.id));
    } else {
      if (!text(z.user_id)) throw fehlerKlasse("kind-user-id", `Tabelle "${name}" enthaelt eine Zeile ohne user_id.`);
      if (!mandateSet.has(text(z.user_id))) {
        throw fehlerKlasse("kind-fremd", `Tabelle "${name}" verweist auf "${text(z.user_id)}" ausserhalb der 500er-Kohorte.`);
      }
      if (!text(z[pk])) {
        throw fehlerKlasse("kind-pk-fehlt",
          `Tabelle "${name}" enthaelt eine Zeile ohne nicht-leere Primärschlüsselspalte "${pk}".`);
      }
      if (ids.includes(text(z[pk]))) {
        throw fehlerKlasse("kind-pk-dublette",
          `Tabelle "${name}" enthaelt doppelte Primärschlüssel "${pk}" (${text(z[pk])}).`);
      }
      ids.push(text(z[pk]));
    }
  }

  if ((name === "profiles" || name === "mandate_profiles" || name === FREMD_TABELLE) && ids.length && new Set(ids).size !== ids.length) {
    const code = name === "profiles" ? "profiles-dublette"
      : name === "mandate_profiles" ? "mandate-dublette"
      : "fremd-dublette";
    const spalte = name === "profiles" || name === FREMD_TABELLE ? "id" : "user_id";
    throw fehlerKlasse(code, `Tabelle "${name}" enthaelt doppelte ${spalte}.`);
  }

  const ziel = path.join(stagingDir, dateiName(name));
  const sha256 = schreibeJsonlAtomar(ziel, rows);
  return {
    tabelle: name,
    spalten,
    zeilen: rows.length,
    sha256,
    ids: eindeutigSortiert(ids)
  };
}

// ── Manifest bauen (klein; bindet alle Datei-Hashes, Mengen, ID-Sets, Spalten) ──────────────
function baueManifest({ paket, operationId, erstelltVon, erstelltAm, dateiEintraege, bestand, ids }) {
  const dateien = {};
  for (const e of dateiEintraege) dateien[dateiName(e.tabelle)] = {
    tabelle: e.tabelle,
    spalten: e.spalten,
    zeilen: e.zeilen,
    sha256: e.sha256
  };
  const manifest = {
    snapshotVertrag: SNAPSHOT_VERTRAG,
    operationId: text(operationId),
    erstelltAm,
    erstelltVon: text(erstelltVon),
    paket: { pfad: text(paket.pfad), sha256: text(paket.sha256).toLowerCase() },
    bestand,
    ids,
    dateien
  };
  manifest.sha256 = GEN.hashSnapshot(manifest);
  return manifest;
}

function raeumeStaging(stagingDir) {
  if (!stagingDir) return;
  try { if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

function finalisiereStaging(stagingDir, outDir, force) {
  fs.mkdirSync(path.dirname(outDir), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(outDir)) {
    fs.renameSync(stagingDir, outDir);
    return;
  }
  if (!fs.statSync(outDir).isDirectory()) {
    throw fehlerKlasse("out-datei", `--out zeigt auf eine Datei: ${outDir}`);
  }
  const vorhanden = fs.readdirSync(outDir);
  if (vorhanden.length && !force) {
    throw fehlerKlasse("out-vorhanden",
      `--out ist ein nicht-leeres Verzeichnis (${outDir}). Nutze --force zum Ersetzen der bekannten Snapshot-Dateien.`);
  }
  if (!vorhanden.length) {
    fs.rmdirSync(outDir);
    fs.renameSync(stagingDir, outDir);
    return;
  }
  for (const name of fs.readdirSync(stagingDir)) {
    fs.renameSync(path.join(stagingDir, name), path.join(outDir, name));
  }
  fs.rmdirSync(stagingDir);
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
    "  --input-dir <verzeichnis> --out <snapshot-verzeichnis> \\",
    "  --operation-id <kennung> --operator <erstelltVon> [--paket <paketdatei>] [--force]",
    "",
    "Input-Vertrag (--input-dir, rein lokale, vom Betreiber exportierte JSON-Dateien):",
    `  ${PAKET_METADAT_DATEI}  { "pfad", "sha256" }   · ${FREMD_EINGABE_DATEI}  Fremdprofile ohne Mandat`,
    `  je Tabelle eine JSON-Zeilenliste: ${SNAPSHOT_TABELLEN.map((t) => `${t}.json`).join(", ")}`,
    "Ausgabe: ein v2-Snapshot-Verzeichnis (manifest.json + je Tabelle eine .jsonl) ausserhalb des Repo-Root."
  ].join("\n");
}

function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) { process.stdout.write(nutzung() + "\n"); return 0; }

  const fehlend = PFLICHT_FLAGS.filter((f) => !text(opts[FLAG_ZU_OPT[f]]));
  if (fehlend.length) {
    process.stderr.write(`FAIL-CLOSED: fehlende Pflichtwerte: ${fehlend.join(", ")}\n${nutzung()}\n`);
    return 2;
  }

  const inputDir = path.resolve(opts.inputDir);
  const outDir = path.resolve(opts.out);

  if (liegtImRepo(outDir)) {
    process.stderr.write("FAIL-CLOSED: --out muss AUSSERHALB des Repository-Root liegen.\n");
    return 2;
  }
  if (fs.existsSync(outDir) && !fs.statSync(outDir).isDirectory()) {
    process.stderr.write(`FAIL-CLOSED: --out zeigt auf eine Datei: ${outDir}\n`);
    return 2;
  }
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length && !opts.force) {
    process.stderr.write(`FAIL-CLOSED: --out ist ein nicht-leeres Verzeichnis (${outDir}). Nutze --force zum Ersetzen.\n`);
    return 2;
  }
  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    process.stderr.write(`FAIL-CLOSED: --input-dir ist kein Verzeichnis: ${inputDir}\n`);
    return 2;
  }

  let paketBindung;
  try {
    paketBindung = ladePaketBindung(inputDir);
  } catch (e) { process.stderr.write(`FAIL-CLOSED: ${String(e && e.message)}\n`); return 2; }

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

  let stagingDir;
  try {
    fs.mkdirSync(path.dirname(outDir), { recursive: true, mode: 0o700 });
    stagingDir = fs.mkdtempSync(path.join(path.dirname(outDir), ".helmut-snapshot-v2-"));
  } catch (e) {
    process.stderr.write(`FAIL-CLOSED: Zielverzeichnis nicht vorbereitbar: ${String(e && e.message)}\n`);
    return 2;
  }

  try {
    const dateiEintraege = [];
    const profile = verarbeiteTabelle({ stagingDir, inputDir, name: "profiles", mandateSet: null });
    const mandate = verarbeiteTabelle({ stagingDir, inputDir, name: "mandate_profiles", mandateSet: null });
    const mandateSet = new Set(mandate.ids);

    if (profile.zeilen !== MANDATE_GESAMT) {
      throw fehlerKlasse("profiles-anzahl", `profiles: ${profile.zeilen} Zeilen (erwartet ${MANDATE_GESAMT}).`);
    }
    if (mandate.zeilen !== MANDATE_GESAMT) {
      throw fehlerKlasse("mandate-anzahl", `mandate_profiles: ${mandate.zeilen} Zeilen (erwartet ${MANDATE_GESAMT}).`);
    }
    if (!gleichMenge(profile.ids, mandate.ids)) {
      throw fehlerKlasse("id-menge", "profiles-ids und mandate_profiles.user_ids stimmen nicht ueberein.");
    }

    dateiEintraege.push(profile);
    dateiEintraege.push(mandate);

    for (const name of FK_KINDTABELLEN) {
      if (name === "mandate_profiles") continue;
      const eintrag = verarbeiteTabelle({ stagingDir, inputDir, name, mandateSet });
      dateiEintraege.push(eintrag);
    }

    const fremd = verarbeiteTabelle({ stagingDir, inputDir, name: FREMD_TABELLE, mandateSet });
    if (fremd.zeilen !== FREMD_GESAMT) {
      throw fehlerKlasse("fremd-anzahl", `fremd_profiles: ${fremd.zeilen} Zeilen (erwartet ${FREMD_GESAMT}).`);
    }
    if (fremd.ids.some((id) => mandateSet.has(id))) {
      throw fehlerKlasse("fremd-kollision", "Ein Fremdprofil traegt zugleich eine Preimage-Mandatskennung.");
    }
    dateiEintraege.push(fremd);

    const manifest = baueManifest({
      paket: paketBindung,
      operationId: opts.operationId,
      erstelltVon: opts.operator,
      erstelltAm: new Date().toISOString(),
      dateiEintraege,
      bestand: {
        profilesGesamt: profile.zeilen + fremd.zeilen,
        mandateProfilesGesamt: mandate.zeilen,
        aktivGesamt: 0
      },
      ids: {
        mandat: profile.ids,
        fremd: fremd.ids
      }
    });
    schreibeManifestAtomar(path.join(stagingDir, MANIFEST_DATEI), manifest);

    finalisiereStaging(stagingDir, outDir, opts.force);
    stagingDir = null;

    const kindZeilen = dateiEintraege
      .filter((e) => FK_KINDTABELLEN.includes(e.tabelle) && e.tabelle !== "mandate_profiles")
      .reduce((n, e) => n + e.zeilen, 0);
    process.stdout.write(
      "Snapshot-Verzeichnis geschrieben (v2, fail-closed geprueft, nicht ausgefuehrt).\n"
      + `  Pfad: ${outDir}\n`
      + `  manifest: ${MANIFEST_DATEI}\n`
      + `  sha256: ${manifest.sha256}\n`
      + `  operationId: ${manifest.operationId}\n`
      + `  bestand: profiles=${manifest.bestand.profilesGesamt} mandateProfiles=${manifest.bestand.mandateProfilesGesamt}`
      + ` aktiv=${manifest.bestand.aktivGesamt} fremd=${fremd.zeilen}\n`
      + `  dateien: ${dateiEintraege.length} JSONL-Dateien (profiles=${profile.zeilen}`
      + ` mandate_profiles=${mandate.zeilen} kindzeilen=${kindZeilen})\n`);
    return 0;
  } catch (e) {
    raeumeStaging(stagingDir);
    process.stderr.write(`FAIL-CLOSED: ${String(e && e.message)}\n`);
    return 2;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = {
  PFLICHT_FLAGS,
  PAKET_METADAT_DATEI,
  FREMD_EINGABE_DATEI,
  FREMD_TABELLE,
  MANIFEST_DATEI,
  dateiName,
  ladeZeilenliste,
  ladePaketBindung,
  verarbeiteTabelle,
  baueManifest,
  liegtImRepo,
  schreibeJsonlAtomar,
  schreibeManifestAtomar,
  main
};
