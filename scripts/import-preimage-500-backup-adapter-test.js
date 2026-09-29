"use strict";

// Helmut — gezielter OFFLINE-Test fuer den Voll-Backup -> Assembler-Eingabe-Adapter.
// =============================================================================================
// Beweist, dass scripts/import-preimage-500-backup-adapter.js aus einem vollstaendigen Backup
// (Format von scripts/backup-export.js) genau den Eingabeordner baut, den der bestehende
// Preimage-Assembler erwartet:
//   1. Positiv: synthetischer 501er-Bestand (500 Mandate + 1 Fremdprofil ohne Mandat, mit
//      FK-Kinddaten) als vollstaendiges Backup => Exit 0, 19 Eingabedateien, alle mode 0600.
//   2. Der entstandene Input wird vom bestehenden Assembler akzeptiert (Exit 0) und dessen
//      Snapshot vom Generatorvertrag bestaetigt (pruefeSnapshot + baueErsatzSql, KEINE Ausfuehrung).
//   3. Fail-closed Negativfaelle: unvollstaendiges Manifest, falsche Pruefsumme, inkonsistente
//      Zeilenzahl, fehlende Pflichttabelle, falsches Paket, Fremdprofilanzahl 0/2, AfD in
//      Partei/Fraktion, aktive Zeile, Kindzeile ausserhalb der Kohorte.
//   4. Grenzen: Output im Repository und vorhandene Zieldateien ohne --force scheitern; mit
//      --force wird ersetzt; assembler lehnt einen falschen Paket-Hash ab.
//   5. Keine Rohdaten auf stdout (nur Pfad/Hash/Zusammenfassung).
//
// KEIN Netzwerk, KEINE DB, KEIN Modellaufruf, KEINE Schreibwirkung im Repo, KEINE Production.
// Synthetische, erfundene Daten — keine personenbezogenen Daten.
// Aufruf:  node scripts/import-preimage-500-backup-adapter-test.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
process.env.HELMUT_SOURCE_MODE = "off";

const ADAPTER = path.join(__dirname, "import-preimage-500-backup-adapter.js");
const ASSEMBLER = path.join(__dirname, "import-preimage-500-snapshot.js");
const GEN = require(path.join(ROOT, "scripts", "import-preflight-500-sql-generator.js"));
const BACKUP = require(path.join(ROOT, "scripts", "backup-export.js"));
const PAKET_PFAD = path.join(ROOT, "daten", "mandatsprofile-bundestag-berlin-brandenburg-20260929.json");

const OP_ID = "test-backup-adapter-20260930";
const OPERATOR = "Synthetischer Testbetreiber, rein lesend";
const FREMD_ID = "fremd-synthetisch-ohne-mandat";

// Alle Tabellen eines vollstaendigen Backups. scripts/backup-export.js fuehrt matching_runs
// inzwischen als Pflichttabelle des Voll-Exports; der Test baut ein vollstaendiges Backup mit
// ALLEN Pflichttabellen und prueft die fehlende Tabelle separat als fail-closed-Fall (3.7).
const BACKUP_TABELLEN = [...Object.keys(BACKUP.TABLES), ...GEN.SNAPSHOT_TABELLEN.filter((t) => !(t in BACKUP.TABLES))];

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }
function sha256(s) { return crypto.createHash("sha256").update(String(s), "utf8").digest("hex"); }

// ── Synthetischer, vertragskonformer Bestand (erfundene Daten). ──────────────────────────────
function baueBestand() {
  const rows = {};
  for (const t of BACKUP_TABELLEN) rows[t] = [];
  const alteIds = [];
  for (let i = 1; i <= 500; i++) {
    const id = `synthetisch-mandat-${String(i).padStart(4, "0")}`;
    alteIds.push(id);
    rows.profiles.push({ id, name: `Synthetischer Altbestand ${i}`, created_at: "2026-01-01T00:00:00.000Z" });
    rows.mandate_profiles.push({
      user_id: id,
      partei: i % 3 === 0 ? "CDU" : "SPD",
      fraktion: i % 3 === 0 ? "CDU/CSU" : "SPD-Fraktion",
      rolle: null,
      politische_ebene: i <= 330 ? "bundestag" : "landtag",
      wahlkreis: `Synthetischer Wahlkreis ${i}`,
      bundesland: i % 2 === 0 ? "Berlin" : "Brandenburg",
      aktiv: false,
      onboarding_status: "abgeschlossen",
      profil_extras: { parlament: i <= 330 ? "bundestag" : "landtag-berlin" }
    });
  }
  rows.profiles.push({ id: FREMD_ID, name: "Synthetisches Fremdprofil ohne Mandat", created_at: "2025-12-01T00:00:00.000Z" });

  rows.briefings.push(
    { id: "sbrief-1", user_id: alteIds[0], slot: "morgens", payload: { x: 1 }, created_at: "2026-02-01T06:00:00.000Z" },
    { id: "sbrief-2", user_id: alteIds[1], slot: "mittags", payload: { x: 2 }, created_at: "2026-02-01T12:00:00.000Z" }
  );
  rows.decisions.push(
    { id: "sdec-1", user_id: alteIds[0], knowledge_object_id: "ko-1", score: 10, status: "new" }
  );
  rows.matching_results.push(
    { id: "smr-1", user_id: alteIds[0], knowledge_object_id: "ko-1", similarity: 0.5, rank: 1, matched_features: ["partei:SPD"], filters: {} }
  );
  rows.matching_runs.push(
    { id: "srun-1", user_id: alteIds[0], status: "abgeschlossen", eingabe_fingerabdruck: "fp-1", gestartet_am: "2026-02-01T06:00:00.000Z" }
  );
  rows.profile_embeddings.push(
    { user_id: alteIds[0], embedding: "[0.1, 0.2, 0.3]", profile_hash: "h1", dim: 256 }
  );
  rows.political_items.push(
    { id: "spi-1", user_id: alteIds[0], title: "Synthetischer Vorgang 1", created_at: "2026-02-01T00:00:00.000Z" }
  );
  return { rows, alteIds };
}

// Vollstaendiges Backup im Format von scripts/backup-export.js schreiben.
function schreibeBackup(dir, mutation) {
  fs.mkdirSync(dir, { recursive: true });
  const { rows, alteIds } = baueBestand();
  if (mutation && mutation.rows) mutation.rows(rows, alteIds);

  const manifest = {
    art: "voll",
    erstellt: "2026-09-30T00:00:00.000Z",
    mainCommit: "synthetisch",
    quelle: "synthetisch",
    tabellen: {},
    pruefsummen: {},
    fehler: []
  };
  for (const t of BACKUP_TABELLEN) {
    const json = JSON.stringify(rows[t] || []);
    fs.writeFileSync(path.join(dir, `${t}.json`), json);
    manifest.tabellen[t] = (rows[t] || []).length;
    manifest.pruefsummen[t] = sha256(json);
  }
  manifest.vollstaendig = true;
  manifest.pruefsummeGesamt = sha256(JSON.stringify(manifest.pruefsummen));
  if (mutation && mutation.manifest) mutation.manifest(manifest, dir);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  if (mutation && mutation.nachher) mutation.nachher(dir);
  return { rows, alteIds, manifest };
}

function laufAdapter(backupDir, outDir, extra = []) {
  return spawnSync(process.execPath, [
    ADAPTER,
    "--backup-dir", backupDir,
    "--out-dir", outDir,
    "--paket", PAKET_PFAD,
    ...extra
  ], { encoding: "utf8" });
}

function main() {
  console.log("Helmut — Voll-Backup -> Assembler-Input-Adapter (offline)\n");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-backup-adapter-"));
  const paketHash = GEN.hashPaket(PAKET_PFAD);

  // ── 1 · Positiv: vollstaendiges Backup => Assembler-Eingabe, 0600 ────────────────────────
  abschnitt("1 · Positiv: vollstaendiges Backup => 19 Eingabedateien, alle 0600");
  const backupDir = path.join(tmp, "backup");
  schreibeBackup(backupDir);
  const outDir = path.join(tmp, "assembler-input");
  const lauf = laufAdapter(backupDir, outDir);
  check("1.1 Adapter Exit 0", lauf.status === 0, `status=${lauf.status} ${(lauf.stderr || "").slice(0, 200)}`);

  const erwarteteDateien = [...GEN.SNAPSHOT_TABELLEN.map((t) => `${t}.json`), "fremd_profiles.json", "paket.json"].sort();
  const vorhandene = fs.existsSync(outDir) ? fs.readdirSync(outDir).sort() : [];
  check("1.2 Genau die 19 erwarteten Eingabedateien vorhanden",
    JSON.stringify(vorhandene) === JSON.stringify(erwarteteDateien),
    `ist=${vorhandene.length} soll=${erwarteteDateien.length}`);
  const modi = vorhandene.map((n) => fs.statSync(path.join(outDir, n)).mode & 0o777);
  check("1.3 Alle Eingabedateien haben mode 0600", modi.every((m) => m === 0o600),
    modi.map((m) => m.toString(8)).join(","));

  const bindung = JSON.parse(fs.readFileSync(path.join(outDir, "paket.json"), "utf8"));
  check("1.4 paket.json traegt Paketpfad und korrekten sha256",
    bindung.sha256 === paketHash && path.resolve(bindung.pfad) === PAKET_PFAD);
  const profile = JSON.parse(fs.readFileSync(path.join(outDir, "profiles.json"), "utf8"));
  const mandate = JSON.parse(fs.readFileSync(path.join(outDir, "mandate_profiles.json"), "utf8"));
  const fremd = JSON.parse(fs.readFileSync(path.join(outDir, "fremd_profiles.json"), "utf8"));
  check("1.5 profiles=500 / mandate_profiles=500 / fremd_profiles=1",
    profile.length === 500 && mandate.length === 500 && fremd.length === 1);
  check("1.6 Fremdprofil ist genau die profiles-Zeile ohne Mandat",
    fremd.length === 1 && fremd[0].id === FREMD_ID && !mandate.some((z) => z.user_id === FREMD_ID));

  // ── 2 · Der entstandene Input wird vom bestehenden Assembler akzeptiert ──────────────────
  abschnitt("2 · Bestehender Assembler akzeptiert den Input (keine Ausfuehrung)");
  const snapshotPfad = path.join(tmp, "snapshot.json");
  const assembler = spawnSync(process.execPath, [
    ASSEMBLER, "--input-dir", outDir, "--out", snapshotPfad,
    "--operation-id", OP_ID, "--operator", OPERATOR, "--paket", PAKET_PFAD
  ], { encoding: "utf8" });
  check("2.1 Assembler Exit 0 auf dem Adapter-Input", assembler.status === 0,
    `status=${assembler.status} ${(assembler.stderr || "").slice(0, 200)}`);
  const snapshot = fs.existsSync(snapshotPfad) ? JSON.parse(fs.readFileSync(snapshotPfad, "utf8")) : null;
  const sp = snapshot ? GEN.pruefeSnapshot(snapshot, { paketHash, neueIds: [] }) : { ok: false, fehler: [] };
  check("2.2 Generatorvertrag bestaetigt den Snapshot", sp.ok === true,
    (sp.fehler || []).map((f) => f.code).join(", ") || "0 Befunde");
  check("2.3 Bestand: 501 profiles / 500 mandate / 0 aktiv / 1 fremd",
    !!snapshot && snapshot.bestand.profilesGesamt === 501 && snapshot.bestand.mandateProfilesGesamt === 500
    && snapshot.bestand.aktivGesamt === 0 && snapshot.fremd_profiles.length === 1);
  let sql = null;
  try { sql = GEN.baueErsatzSql(GEN.ladePaket(PAKET_PFAD), GEN.preflight(GEN.ladePaket(PAKET_PFAD)), snapshot, { paketHash }); }
  catch (e) { check("2.4 Aus dem Snapshot entsteht gueltiges Ersatz-SQL", false, `${e && e.code}: ${e && e.message}`); }
  if (sql) {
    const selbst = GEN.pruefeErsatzSql(sql, {
      neueIds: GEN.preflight(GEN.ladePaket(PAKET_PFAD)).ids, alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: sp
    });
    check("2.4 Aus dem Snapshot entsteht gueltiges Ersatz-SQL (Selbsttest gruen)", selbst.length === 0,
      selbst.map((f) => f.code).join(", ") || "0 Befunde");
  }

  // ── 3 · Fail-closed Negativfaelle (kein Output, Exit != 0) ───────────────────────────────
  abschnitt("3 · Fail-closed: unvollstaendige/falsche Backups => kein Output");
  const negativ = [
    ["unvollstaendiges Manifest (vollstaendig=false)", { manifest: (m) => { m.vollstaendig = false; } }],
    ["falsches Manifest-Art (pre-seed)", { manifest: (m) => { m.art = "pre-seed"; } }],
    ["Manifest-Gesamtpruefsumme manipuliert", { manifest: (m) => { m.pruefsummeGesamt = "0".repeat(64); } }],
    ["Zeilenpruefsumme manipuliert (Manifest konsistent gehalten)", { manifest: (m) => {
      m.pruefsummen.profiles = "0".repeat(64); m.pruefsummeGesamt = sha256(JSON.stringify(m.pruefsummen));
    } }],
    ["Zeilenzahl inkonsistent (Manifest meldet 499)", { manifest: (m) => {
      m.tabellen.profiles = 499; m.pruefsummeGesamt = sha256(JSON.stringify(m.pruefsummen));
    } }],
    ["Pflichttabelle fehlt (daily_tasks.json entfernt)", { nachher: (dir) => { fs.rmSync(path.join(dir, "daily_tasks.json")); } }],
    ["Pflichttabelle matching_runs fehlt", { nachher: (dir) => { fs.rmSync(path.join(dir, "matching_runs.json")); } }],
    ["Fremdprofilanzahl 0 (kein profiles ohne Mandat)", { rows: (r) => { r.profiles = r.profiles.filter((z) => z.id !== FREMD_ID); } }],
    ["Fremdprofilanzahl 2 (zweites profiles ohne Mandat)", { rows: (r) => {
      r.profiles.push({ id: "fremd-2", name: "Synthetisches zweites Fremdprofil", created_at: "2025-12-02T00:00:00.000Z" });
    } }],
    ["AfD in Partei/Fraktion", { rows: (r) => { r.mandate_profiles[0].partei = "AfD"; r.mandate_profiles[0].fraktion = "AfD"; } }],
    ["aktive Mandatszeile (aktiv=true)", { rows: (r) => { r.mandate_profiles[0].aktiv = true; } }],
    ["Kindzeile ausserhalb der Kohorte", { rows: (r) => { r.briefings[0].user_id = "nicht-in-kohorte"; } }]
  ];
  negativ.forEach(([name, mutation], idx) => {
    const bk = path.join(tmp, `neg-backup-${idx}`);
    schreibeBackup(bk, mutation);
    const out = path.join(tmp, `neg-out-${idx}`);
    const l = laufAdapter(bk, out);
    check(`3.${idx + 1} kein Output/Exit!=0: ${name}`,
      l.status !== 0 && !fs.existsSync(out), `status=${l.status} ${(l.stderr || "").split("\n")[0]}`);
  });

  // ── 4 · Grenzen: Repo-Output, --force, Paket-Hash ────────────────────────────────────────
  abschnitt("4 · Grenzen: Repo-Output, --force, Paket-Hash");
  const repoOut = path.join(ROOT, "adapter-input-darf-nicht-entstehen");
  const repoLauf = laufAdapter(backupDir, repoOut);
  check("4.1 Output im Repository-Root wird abgelehnt",
    repoLauf.status !== 0 && !fs.existsSync(repoOut), `status=${repoLauf.status}`);

  const zweiOut = path.join(tmp, "overwrite");
  const erster = laufAdapter(backupDir, zweiOut);
  check("4.2 Erster Lauf schreibt den Input", erster.status === 0 && fs.existsSync(path.join(zweiOut, "profiles.json")));
  const vorher = fs.readFileSync(path.join(zweiOut, "profiles.json"), "utf8");
  const zweiter = laufAdapter(backupDir, zweiOut);
  check("4.3 Vorhandener Output ohne --force wird abgelehnt",
    zweiter.status !== 0 && fs.readFileSync(path.join(zweiOut, "profiles.json"), "utf8") === vorher, `status=${zweiter.status}`);
  const dritter = laufAdapter(backupDir, zweiOut, ["--force"]);
  check("4.4 Mit --force wird ersetzt", dritter.status === 0 && fs.existsSync(path.join(zweiOut, "profiles.json")));

  const ohnePflicht = spawnSync(process.execPath, [ADAPTER, "--backup-dir", backupDir], { encoding: "utf8" });
  check("4.5 Fehlende Pflichtwerte => Exit != 0, kein Output",
    ohnePflicht.status !== 0 && /FAIL-CLOSED/.test(ohnePflicht.stderr || ""));
  const unbekannt = spawnSync(process.execPath, [
    ADAPTER, "--backup-dir", backupDir, "--out-dir", path.join(tmp, "x"), "--paket", PAKET_PFAD, "--quatsch"
  ], { encoding: "utf8" });
  check("4.6 Unbekanntes Argument => Exit != 0", unbekannt.status !== 0 && /FAIL-CLOSED/.test(unbekannt.stderr || ""));

  // falscher Paket-Hash: gebundene sha256 stimmt nicht zur --paket-Datei => Assembler lehnt ab.
  const falschDir = path.join(tmp, "paket-hash");
  fs.cpSync(outDir, falschDir, { recursive: true });
  fs.writeFileSync(path.join(falschDir, "paket.json"), JSON.stringify({ pfad: PAKET_PFAD, sha256: "a".repeat(64) }));
  const falscherHash = spawnSync(process.execPath, [
    ASSEMBLER, "--input-dir", falschDir, "--out", path.join(tmp, "falscher-hash.json"),
    "--operation-id", OP_ID, "--operator", OPERATOR, "--paket", PAKET_PFAD
  ], { encoding: "utf8" });
  check("4.7 Assembler lehnt falschen Paket-Hash ab (kein Output)",
    falscherHash.status !== 0 && !fs.existsSync(path.join(tmp, "falscher-hash.json")), `status=${falscherHash.status}`);

  const falschesPaket = path.join(tmp, "paket-499.json");
  const paketRoh = JSON.parse(fs.readFileSync(PAKET_PFAD, "utf8"));
  paketRoh.profile = paketRoh.profile.slice(0, 499);
  fs.writeFileSync(falschesPaket, JSON.stringify(paketRoh));
  const falschesPaketLauf = spawnSync(process.execPath, [
    ADAPTER, "--backup-dir", backupDir, "--out-dir", path.join(tmp, "paket-499-out"), "--paket", falschesPaket
  ], { encoding: "utf8" });
  check("4.8 Adapter lehnt ein nicht-kanonisches Paket ab",
    falschesPaketLauf.status !== 0 && !fs.existsSync(path.join(tmp, "paket-499-out")), `status=${falschesPaketLauf.status}`);

  // ── 5 · stdout enthaelt nur Pfad/Hash/Zusammenfassung ────────────────────────────────────
  abschnitt("5 · stdout enthaelt nur Pfad/Hash/Zusammenfassung");
  check("5.1 stdout nennt Ziel und Paket-Hash",
    lauf.stdout.includes(outDir) && lauf.stdout.includes(paketHash));
  check("5.2 stdout enthaelt keine Rohdaten/Zeileninhalte",
    !/Synthetischer Altbestand/.test(lauf.stdout) && !/synthetisch-mandat-/.test(lauf.stdout)
    && !/insert\s+into/i.test(lauf.stdout) && !/begin;/i.test(lauf.stdout));

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (Pruefungen ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
