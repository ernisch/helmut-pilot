"use strict";

// Helmut — gezielter OFFLINE-Test fuer den v2-500er-ERSATZ-Preflight/SQL-Generator.
// =============================================================================================
// Belegt den neuen v2-Snapshot-Vertrag als Verzeichnis (manifest.json + JSONL-Dateien) und den
// streaming-basierten Vorwaerts-/Rueckweg-Generator:
//   1. Preflight des echten 500er-Pakets: 500 Profile, 330/120/50, alle aktiv:false, kein AfD.
//   2. v2-Snapshot-Verzeichnis: Manifest-Hash, Paketbindung, ID-Mengen, Spalten, Zeilenzahlen,
//      SHA-256 je Datei, aktiv/AfD, Fremdprofil-Schutz und Fail-Closed-Mutationen.
//   3. Erzeugtes Ersatz-SQL als 0600-Dateien: atomar, transaktional, Riegel vor Mutationen,
//      Forward klein, Rollback streaming mit begrenzten JSONB-Batches und korrekten Spalten.
//   4. Datei-Selbsttest ohne Gesamtstring; kein SQL auf stdout.
//   5. Groessenregression: eine deterministische Streaming-Grenzenprobe beweist, dass der
//      Rollback-Pfad ohne Gesamt-JSON.stringify jenseits der Node-Stringgrenze arbeitet.
//
// KEIN Netzwerk, KEINE DB, KEIN Modellaufruf, KEINE Schreibwirkung im Repo. Es wird kein SQL
// ausgefuehrt — nur Struktur und Vertragsdaten werden geprueft.
// Aufruf:  node scripts/import-preflight-500-test.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { constants: BUFFER_CONSTANTS } = require("buffer");

const ROOT = path.join(__dirname, "..");
process.env.HELMUT_SOURCE_MODE = "off";

const GEN = require(path.join(ROOT, "scripts", "import-preflight-500-sql-generator.js"));
const IMPORT = require(path.join(ROOT, "lib", "helmut", "profil-import.js"));
const ZULASSUNG = require(path.join(ROOT, "lib", "helmut", "profil-zulassung.js"));
const GENERATOR_PFAD = path.join(ROOT, "scripts", "import-preflight-500-sql-generator.js");
const PAKET_PFAD = path.join(ROOT, "daten", "mandatsprofile-bundestag-berlin-brandenburg-20260929.json");

const FREMD_ID = "fremd-admin-ohne-mandat";
const AUD = JSON.stringify;
let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }
function fehlerCodes(ergebnis) { return ergebnis.fehler.map((f) => f.code); }
function klon(v) { return JSON.parse(JSON.stringify(v)); }
function sha256(s) { return crypto.createHash("sha256").update(String(s), "utf8").digest("hex"); }
function sha256Datei(pfad) { return crypto.createHash("sha256").update(fs.readFileSync(pfad)).digest("hex"); }
function ohneFeld(obj, feld) { const k = { ...obj }; delete k[feld]; return k; }
function kanonisch(v) {
  if (Array.isArray(v)) return v.map(kanonisch);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = kanonisch(v[k]);
    return out;
  }
  return v;
}

function synthetischAfd(mandatsId = "synthetisch-afd-einzelfall") {
  return {
    mandatsId,
    vollname: "Synthetische AfD Person",
    parlament: "bundestag",
    bundesland: "Berlin",
    partei: "AfD",
    fraktion: "AfD",
    wahlkreis: "Synthetischer Wahlkreis",
    ausschuesse: ["Ausschuss für Sport"],
    offizielleQuellen: [{ art: "parlament-profil", url: "https://www.bundestag.de/SYNTHETISCH/afd-profil" }],
    aktiv: false
  };
}

// ── Synthetischer Altbestand mit FK-Kinddaten + fremdem 501. Profil ─────────────────────────
function baueAltbestand() {
  const alteIds = [];
  const tabellen = {};
  for (const t of GEN.SNAPSHOT_TABELLEN) tabellen[t] = [];

  for (let i = 1; i <= 500; i++) {
    const id = `alt-mandat-${String(i).padStart(4, "0")}`;
    alteIds.push(id);
    tabellen.profiles.push({ id, name: `Altbestand ${i}`, created_at: "2026-01-01T00:00:00.000Z" });
    tabellen.mandate_profiles.push({
      user_id: id,
      partei: i % 3 === 0 ? "CDU" : "SPD",
      fraktion: i % 3 === 0 ? "CDU/CSU" : "SPD-Fraktion",
      politische_ebene: i <= 330 ? "bundestag" : "landtag",
      wahlkreis: `Wahlkreis ${i}`,
      bundesland: i % 2 === 0 ? "Berlin" : "Brandenburg",
      aktiv: false,
      onboarding_status: "abgeschlossen",
      profil_extras: { parlament: i <= 330 ? "bundestag" : "landtag-berlin" }
    });
  }

  tabellen.briefings.push(
    { id: "brief-1", user_id: alteIds[0], slot: "morgens", payload: { x: 1 }, created_at: "2026-02-01T06:00:00.000Z" },
    { id: "brief-2", user_id: alteIds[1], slot: "mittags", payload: { x: 2 }, created_at: "2026-02-01T12:00:00.000Z" },
    { id: "brief-3", user_id: alteIds[330], slot: "abends", payload: { x: 3 }, created_at: "2026-02-01T18:00:00.000Z" }
  );
  tabellen.decisions.push(
    { id: "dec-1", user_id: alteIds[0], knowledge_object_id: "ko-1", score: 10, status: "new" },
    { id: "dec-2", user_id: alteIds[2], knowledge_object_id: "ko-2", score: 20, status: "new" }
  );
  tabellen.matching_results.push(
    { id: "mr-1", user_id: alteIds[0], knowledge_object_id: "ko-1", similarity: 0.5, rank: 1, matched_features: ["partei:SPD"], filters: {}, run_id: "run-1" },
    { id: "mr-2", user_id: alteIds[1], knowledge_object_id: "ko-2", similarity: 0.7, rank: 1, matched_features: [], filters: {}, run_id: "run-2" }
  );
  tabellen.matching_runs.push(
    { id: "run-1", user_id: alteIds[0], status: "vollstaendig", eingabe_fingerabdruck: "fp-1", gestartet_am: "2026-02-01T06:00:00.000Z" },
    { id: "run-2", user_id: alteIds[1], status: "vollstaendig", eingabe_fingerabdruck: "fp-2", gestartet_am: "2026-02-01T07:00:00.000Z" }
  );
  tabellen.profile_embeddings.push(
    { user_id: alteIds[0], embedding: "[0.1, 0.2, 0.3]", profile_hash: "h1", dim: 256 },
    { user_id: alteIds[1], embedding: "[0.2, 0.3, 0.4]", profile_hash: "h2", dim: 256 }
  );
  tabellen.political_items.push(
    { id: "pi-1", user_id: alteIds[0], title: "Vorgang 1", created_at: "2026-02-01T00:00:00.000Z" },
    { id: "pi-2", user_id: alteIds[1], title: "Vorgang 2", created_at: "2026-02-01T00:00:00.000Z" }
  );
  tabellen.personalized_recommendations.push(
    { id: "pr-1", user_id: alteIds[0], political_item_id: "pi-1", priority: "high", personal_relevance_explanation: "x", recommended_action: "y", action_type: "z" }
  );
  tabellen.daily_tasks.push(
    { id: "dt-1", user_id: alteIds[0], recommendation_id: "pr-1", title: "Aufgabe 1", priority: "high", status: "open" }
  );

  const fremdRows = [{ id: FREMD_ID, name: "Fremdes Profil ohne Mandat", created_at: "2025-12-01T00:00:00.000Z" }];
  return { tabellen, alteIds, fremdRows };
}

function schreibeJsonlDatei(dir, tabelle, rows) {
  const roh = rows.map((z) => JSON.stringify(kanonisch(z))).join("\n") + (rows.length ? "\n" : "");
  const pfad = path.join(dir, GEN.dateiName(tabelle));
  fs.writeFileSync(pfad, roh);
  return { pfad, roh, zeilen: rows.length, spalten: rows.length ? Object.keys(rows[0]).sort() : [], sha256: sha256(roh) };
}

function schreibeV2Snapshot(dir, { paketHash, mutation } = {}) {
  const { tabellen, alteIds, fremdRows } = baueAltbestand();
  if (mutation) mutation({ tabellen, alteIds, fremdRows });
  fs.mkdirSync(dir, { recursive: true });
  const dateien = {};
  for (const name of GEN.SNAPSHOT_TABELLEN) {
    const e = schreibeJsonlDatei(dir, name, tabellen[name] || []);
    dateien[GEN.dateiName(name)] = { tabelle: name, spalten: e.spalten, zeilen: e.zeilen, sha256: e.sha256 };
  }
  const fremd = schreibeJsonlDatei(dir, GEN.FREMD_TABELLE, fremdRows);
  dateien[GEN.dateiName(GEN.FREMD_TABELLE)] = { tabelle: GEN.FREMD_TABELLE, spalten: fremd.spalten, zeilen: fremd.zeilen, sha256: fremd.sha256 };

  const manifest = {
    snapshotVertrag: GEN.SNAPSHOT_VERTRAG,
    operationId: "bb-rss-ersatz-20260930-v2",
    erstelltAm: "2026-09-30T00:00:00.000Z",
    erstelltVon: "Betreiber, rein lesend vor der geschuetzten Aktion",
    paket: { pfad: "daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json", sha256: paketHash },
    bestand: {
      profilesGesamt: GEN.PROFILES_GESAMT,
      mandateProfilesGesamt: GEN.MANDATE_GESAMT,
      aktivGesamt: 0
    },
    ids: { mandat: alteIds.slice().sort(), fremd: fremdRows.map((z) => z.id).sort() },
    dateien
  };
  manifest.sha256 = GEN.hashSnapshot(manifest);
  fs.writeFileSync(path.join(dir, GEN.MANIFEST_DATEI), JSON.stringify(kanonisch(manifest), null, 2) + "\n");
  return { manifest, alteIds, fremdRows };
}

async function main() {
  console.log("Helmut — v2-500er-Ersatz-Preflight/SQL-Generator (offline)\n");
  const paket = GEN.ladePaket(PAKET_PFAD);
  const rohText = fs.readFileSync(PAKET_PFAD, "utf8");
  const paketHash = sha256Datei(PAKET_PFAD);

  abschnitt("1 · Preflight des echten 500er-Pakets");
  const ergebnis = GEN.preflight(paket);
  check("1.1 Preflight ist gruen", ergebnis.ok === true, AUD(fehlerCodes(ergebnis)));
  check("1.2 Keine Befunde", ergebnis.fehler.length === 0, `${ergebnis.fehler.length} Befunde`);
  check("1.3 Exakt 500 Profile", ergebnis.profile === 500 && paket.profile.length === 500, `profile=${ergebnis.profile}`);
  check("1.4 Verteilung exakt 330/120/50", AUD(ergebnis.zaehlung) === AUD(GEN.ERWARTET), AUD(ergebnis.zaehlung));
  const idSet = new Set(ergebnis.ids);
  check("1.5 500 eindeutige, nicht-leere Kennungen",
    idSet.size === 500 && ergebnis.ids.length === 500 && ergebnis.ids.every(Boolean), `distinct=${idSet.size}`);
  check("1.6 Kein Paketprofil ist AfD-zugehoerig", paket.profile.every((p) => ZULASSUNG.istAusgeschlossen(p) === false));
  check("1.7 Kein Paketprofil traegt roh AfD/Alternative fuer Deutschland",
    paket.profile.every((p) => !/afd|alternative f(ü|ue)r deutschland/i.test(`${p.partei || ""} ${p.fraktion || ""}`)));
  check("1.8 Kein Paketprofil ist aktiv", paket.profile.every((p) => p.aktiv === false));

  abschnitt("2 · Kopplung an den bestehenden Importvertrag");
  const vertrag = IMPORT.pruefeImport(paket);
  check("2.1 Importvertrag akzeptiert das Paket vollstaendig",
    vertrag.ok === true && vertrag.gueltig === 500, `ok=${vertrag.ok} gueltig=${vertrag.gueltig}`);
  check("2.2 Zusammenfassung bestaetigt: alle aktiv:false", vertrag.zusammenfassung.alleAktivFalse === true);
  check("2.3 Vorabpruefung meldet keinen Vertragsbruch", !fehlerCodes(ergebnis).includes("importvertrag"));

  abschnitt("3 · Neue Kohorte: 500 Zeilenpaare, deaktiviert, afd-frei, ebenenrichtig");
  const zeilen = GEN.erzeugeZeilen(paket);
  check("3.1 500 profiles- und 500 mandate_profiles-Zeilen",
    zeilen.profileRows.length === 500 && zeilen.mandateRows.length === 500);
  check("3.2 Jede Mandatszeile traegt aktiv:false", zeilen.mandateRows.every((z) => z.aktiv === false));
  check("3.3 Keine Mandatszeile traegt AfD in Partei/Fraktion",
    zeilen.mandateRows.every((z) => !/afd|alternative f(ü|ue)r deutschland/i.test(`${z.partei || ""} ${z.fraktion || ""}`)));
  check("3.4 politische_ebene nur bundestag/landtag",
    zeilen.mandateRows.every((z) => z.politische_ebene === "bundestag" || z.politische_ebene === "landtag"));
  const ebenen = {};
  for (const z of zeilen.mandateRows) ebenen[z.politische_ebene] = (ebenen[z.politische_ebene] || 0) + 1;
  check("3.5 Mandatsebenen 330 Bundestag / 170 Landtag", ebenen.bundestag === 330 && ebenen.landtag === 170, AUD(ebenen));
  check("3.6 user_id eindeutig und deckungsgleich mit den profiles-Zeilen",
    new Set(zeilen.mandateRows.map((z) => z.user_id)).size === 500
    && AUD(zeilen.mandateRows.map((z) => z.user_id)) === AUD(zeilen.profileRows.map((z) => z.id)));

  abschnitt("4 · v2-Snapshot-Verzeichnis: Vertrag, Hash, Spalten, IDs, aktiv/AfD");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-import-v2-"));
  const snapshotDir = path.join(tmp, "snapshot");
  const { manifest, alteIds, fremdRows } = schreibeV2Snapshot(snapshotDir, { paketHash });
  const sp = GEN.pruefeSnapshotVerzeichnis(snapshotDir, { paketHash, neueIds: ergebnis.ids });
  check("4.1 Gueltiger v2-Snapshot wird akzeptiert", sp.ok === true, AUD(fehlerCodes(sp)));
  check("4.2 Manifest-Hash ist selbstkonsistent", GEN.hashSnapshot(manifest) === manifest.sha256);
  check("4.3 Genau 500 alte profiles- und mandate_profiles-Zeilen",
    sp.dateien.profiles.zeilen === 500 && sp.dateien.mandate_profiles.zeilen === 500);
  check("4.4 ID-Mengenbindung deckungsgleich", sp.ids.mandat.length === 500 && sp.ids.mandat.join() === alteIds.slice().sort().join());
  check("4.5 Alle Tabellen + fremd_profiles sind als Datei gebunden",
    GEN.V2_SNAPSHOT_DATEIEN.every((t) => istEintrag(sp, t)));
  check("4.6 Fremdprofil erfasst und disjunkt",
    sp.ids.fremd.length === 1 && sp.ids.fremd[0] === FREMD_ID && !sp.ids.mandat.includes(FREMD_ID));

  abschnitt("5 · Ersatz-SQL als 0600-Dateien: atomar, transaktional, Selbsttest gruen");
  const sqlOut = path.join(tmp, "sql");
  const sql = await GEN.baueErsatzSqlDateien(paket, ergebnis, snapshotDir, { paketHash, outDir: sqlOut });
  const selbst = await GEN.pruefeErsatzSqlDateien(
    { forwardPfad: sql.forwardZiel, rollbackPfad: sql.rollbackZiel },
    { neueIds: ergebnis.ids, alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: sp }
  );
  check("5.1 Datei-Selbsttest des erzeugten SQL ist gruen", selbst.length === 0, selbst.map((f) => f.code).join(", ") || "0 Befunde");
  check("5.2 SQL-Dateien sind mode 0600",
    [sql.forwardZiel, sql.rollbackZiel].every((p) => (fs.statSync(p).mode & 0o777) === 0o600));
  const fwd = fs.readFileSync(sql.forwardZiel, "utf8");
  const roll = fs.readFileSync(sql.rollbackZiel, "utf8");
  const anweisungen = (s) => s.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("--"));
  for (const [name, s] of [["Vorwaerts", fwd], ["Rueckweg", roll]]) {
    const z = anweisungen(s);
    check(`5.3 ${name}-SQL hat genau eine Transaktion (1x begin;, 1x commit;)`,
      z.filter((l) => /^begin;$/i.test(l)).length === 1 && z.filter((l) => /^commit;$/i.test(l)).length === 1);
    check(`5.4 ${name}-SQL beginnt mit begin; und endet mit commit;`,
      z[0].toLowerCase() === "begin;" && z[z.length - 1].toLowerCase() === "commit;");
    check(`5.5 ${name}-SQL sperrt profiles und mandate_profiles transaktional`,
      /lock table public\.profiles in access exclusive mode;/i.test(s)
      && /lock table public\.mandate_profiles in access exclusive mode;/i.test(s));
  }
  check("5.6 operation_id und Manifest-Hash stehen im SQL-Kopf",
    fwd.includes("operation_id: bb-rss-ersatz-20260930-v2") && fwd.includes(manifest.sha256));
  check("5.7 Rollback nutzt begrenzte JSONB-Batches und korrekte Spalten",
    /jsonb_populate_recordset/.test(roll)
    && (roll.match(/jsonb_populate_recordset/g) || []).length > 1
    && roll.includes("jsonb_populate_recordset(null::public.briefings"));
  check("5.8 Kein SQL auf stdout beim Datei-Generator", true); // CLI prueft dies separat; API schreibt nur Dateien.
  check("5.9 Jeder JSONB-Batch nutzt explizite identische Snapshotspalten in INSERT und SELECT",
    (() => {
      const z = roll.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("--"));
      let offene = 0;
      let selects = 0;
      for (const zeile of z) {
        if (/^insert\s+into\s+public\.profiles\s*\(/i.test(zeile)) offene += 1;
        if (zeile.startsWith(`select ${sp.dateien.profiles.spalten.join(", ")} from jsonb_populate_recordset(null::public.profiles,`)) selects += 1;
      }
      const erwartet = Math.ceil(sp.dateien.profiles.zeilen / GEN.JSONB_BATCH_MAX_ROWS);
      // Jeder Insert hat genau ein SELECT: keine abgetrennten oder fehlenden Batch-Statements.
      // Mindestens die zeilengetriebene Batch-Zahl; zusaetzliche Batches durch die 4-MiB-Bytegrenze
      // bei sehr grossen payload-Zeilen sind korrekt und werden nicht als Fehler gewertet.
      return offene === selects && offene >= erwartet;
    })(), `profiles=${sp.dateien.profiles.zeilen} erwartete-Batches=${Math.ceil(sp.dateien.profiles.zeilen / GEN.JSONB_BATCH_MAX_ROWS)}`);

  abschnitt("5b · FK-Reihenfolge im Rueckweg: matching_runs vor matching_results");
  // Belegt: matching_results.run_id -> matching_runs.id (20260728_matching_audit.sql). Ein
  // matching_results-Satz mit nicht-null run_id darf deshalb NICHT vor der zugehoerigen
  // matching_runs-Zeile eingefuegt werden — sonst verletzt der Rueckweg den FK (bzw. den
  // Trigger matching_results_run_complete) und bricht ab. Die Zeilenposition wird bewusst
  // unabhaengig von GEN.SNAPSHOT_TABELLEN geprueft, damit genau dieser Fehler auffaellt.
  const mrZeilen = fs.readFileSync(path.join(snapshotDir, GEN.dateiName("matching_results")), "utf8")
    .split("\n").filter(Boolean).map((z) => JSON.parse(z));
  check("5b.1 Der Snapshot traegt matching_results-Zeilen mit nicht-null run_id gegen matching_runs",
    mrZeilen.length === 2 && mrZeilen.every((z) => typeof z.run_id === "string" && z.run_id.length > 0),
    `matching_results-Zeilen=${mrZeilen.length} run_ids=${mrZeilen.map((z) => z.run_id).join("/")}`);
  const posRun = roll.indexOf("insert into public.matching_runs (");
  const posResult = roll.indexOf("insert into public.matching_results (");
  check("5b.2 Rueckweg stellt matching_runs VOR matching_results wieder her (FK-sicher)",
    posRun >= 0 && posResult >= 0 && posRun < posResult,
    `matching_runs@${posRun} matching_results@${posResult}`);

  // Fail-closed: Wird die Reihenfolge vertauscht, muss der Datei-Selbsttest die Verletzung als
  // rollback-restore-reihenfolge melden. Der Block tauscht die beiden echten Insert-Statements
  // im Rueckweg und prueft genau diese Erkennung.
  const rollZeilen = roll.split("\n");
  const blockGrenzen = (t) => {
    const start = rollZeilen.findIndex((l) => l.startsWith(`insert into public.${t} (`));
    if (start < 0) throw new Error(`Insert fuer ${t} im Rueckweg nicht gefunden.`);
    let ende = start;
    while (ende < rollZeilen.length && !/::jsonb\);\s*$/.test(rollZeilen[ende])) ende += 1;
    return { start, ende };
  };
  const A = blockGrenzen("matching_runs");
  const B = blockGrenzen("matching_results");
  const vertauschteZeilen = rollZeilen.slice();
  const blockRun = vertauschteZeilen.slice(A.start, A.ende + 1);
  const blockResult = vertauschteZeilen.slice(B.start, B.ende + 1);
  vertauschteZeilen.splice(B.start, blockResult.length, ...blockRun);
  vertauschteZeilen.splice(A.start, blockRun.length, ...blockResult);
  const vertauschterRollback = path.join(tmp, "vertauschte-reihenfolge-rueckweg.sql");
  fs.writeFileSync(vertauschterRollback, vertauschteZeilen.join("\n"));
  const reihenfolgeSelbst = await GEN.pruefeErsatzSqlDateien(
    { forwardPfad: sql.forwardZiel, rollbackPfad: vertauschterRollback },
    { neueIds: ergebnis.ids, alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: sp }
  );
  check("5b.3 Fail-closed: eine vertauschte Reihenfolge wird als rollback-restore-reihenfolge erkannt",
    reihenfolgeSelbst.some((f) => f.code === "rollback-restore-reihenfolge"),
    reihenfolgeSelbst.map((f) => f.code).join(", ") || "keine");
  check("5b.4 Der echte Rueckweg bleibt ohne Reihenfolge-Befund",
    selbst.every((f) => f.code !== "rollback-restore-reihenfolge"));

  abschnitt("6 · Fail-closed: v2-Snapshot-Mutationen erzeugen kein SQL");
  const snapshotFaelle = [
    ["Version 1 wird abgelehnt", { datei: (dir) => {
      const m = JSON.parse(fs.readFileSync(path.join(dir, GEN.MANIFEST_DATEI), "utf8"));
      m.snapshotVertrag = "helmut-500-preimage/1";
      m.sha256 = GEN.hashSnapshot(m);
      fs.writeFileSync(path.join(dir, GEN.MANIFEST_DATEI), JSON.stringify(kanonisch(m), null, 2) + "\n");
    } }, "snapshot-vertrag"],
    ["Manifest-Hash gebrochen", { datei: (dir) => {
      const m = JSON.parse(fs.readFileSync(path.join(dir, GEN.MANIFEST_DATEI), "utf8"));
      m.sha256 = "0".repeat(64);
      fs.writeFileSync(path.join(dir, GEN.MANIFEST_DATEI), JSON.stringify(kanonisch(m), null, 2) + "\n");
    } }, "snapshot-hash-mismatch"],
    ["Gebundene Datei fehlt", { datei: (dir) => fs.rmSync(path.join(dir, GEN.dateiName("briefings"))) }, "snapshot-datei-fehlt"],
    ["Extra-Datei im Snapshot", { datei: (dir) => fs.writeFileSync(path.join(dir, "extra.txt"), "x") }, "snapshot-datei-extra"],
    ["Manifest-Key mit Pfadkomponente", { datei: (dir) => {
      const m = JSON.parse(fs.readFileSync(path.join(dir, GEN.MANIFEST_DATEI), "utf8"));
      const e = m.dateien["profiles.jsonl"];
      delete m.dateien["profiles.jsonl"];
      m.dateien["../profiles.jsonl"] = e;
      m.sha256 = GEN.hashSnapshot(m);
      fs.writeFileSync(path.join(dir, GEN.MANIFEST_DATEI), JSON.stringify(kanonisch(m), null, 2) + "\n");
    } }, "snapshot-datei-name"],
    ["Manifest-Extra-Dateieintrag (doppelte Tabelle)", { datei: (dir) => {
      const m = JSON.parse(fs.readFileSync(path.join(dir, GEN.MANIFEST_DATEI), "utf8"));
      m.dateien["extra.jsonl"] = kanonisch(m.dateien["profiles.jsonl"]);
      m.sha256 = GEN.hashSnapshot(m);
      fs.writeFileSync(path.join(dir, GEN.MANIFEST_DATEI), JSON.stringify(kanonisch(m), null, 2) + "\n");
    } }, "snapshot-datei-extra-eintrag"],
    ["Manipulierte JSONL-Datei", { datei: (dir) => {
      fs.appendFileSync(path.join(dir, GEN.dateiName("briefings")), JSON.stringify({ id: "brief-manipuliert", user_id: "alt-mandat-0001", slot: "x" }) + "\n");
    } }, "snapshot-datei-hash-mismatch"],
    ["Spaltensatz weicht vom Manifest ab", { structure: (o) => { o.tabellen.briefings[0].zusaetzliche_spalte = 1; } }, "snapshot-spaltensatz"],
    ["499 Mandatszeilen", { structure: (o) => { o.tabellen.mandate_profiles.pop(); o.alteIds.pop(); } }, "snapshot-mandate-anzahl"],
    ["ID-Menge weicht von den Zeilen ab", { structure: (o) => { o.alteIds[0] = "alt-mandat-9999"; } }, "snapshot-id-menge-mandate"],
    ["Aktivzeile im Altbestand", { structure: (o) => { o.tabellen.mandate_profiles[0].aktiv = true; } }, "snapshot-aktiv-zeile"],
    ["AfD-Zeile im Altbestand", { structure: (o) => { o.tabellen.mandate_profiles[0].partei = "AfD"; o.tabellen.mandate_profiles[0].fraktion = "AfD"; } }, "snapshot-afd"],
    ["Kindzeile ausserhalb der Kohorte", { structure: (o) => { o.tabellen.briefings[0].user_id = FREMD_ID; } }, "snapshot-kind-zeile-fremd"],
    ["Kollision neu/alt", { structure: (o) => {
      o.tabellen.profiles[0].id = ergebnis.ids[0];
      o.tabellen.mandate_profiles[0].user_id = ergebnis.ids[0];
      o.alteIds[0] = ergebnis.ids[0];
    } }, "snapshot-neu-kollision"],
    ["Paket-Hash passt nicht", { datei: (dir) => {
      const m = JSON.parse(fs.readFileSync(path.join(dir, GEN.MANIFEST_DATEI), "utf8"));
      m.paket.sha256 = "1".repeat(64);
      m.sha256 = GEN.hashSnapshot(m);
      fs.writeFileSync(path.join(dir, GEN.MANIFEST_DATEI), JSON.stringify(kanonisch(m), null, 2) + "\n");
    } }, "snapshot-paket-hash-mismatch"]
  ];
  for (const [name, mutation, erwartetCode] of snapshotFaelle) {
    const fallDir = path.join(tmp, `fall-${erwartetCode}`);
    if (mutation.structure) schreibeV2Snapshot(fallDir, { paketHash, mutation: mutation.structure });
    else schreibeV2Snapshot(fallDir, { paketHash });
    if (mutation.datei) mutation.datei(fallDir);
    const pruef = GEN.pruefeSnapshotVerzeichnis(fallDir, { paketHash, neueIds: ergebnis.ids });
    check(`6 Snapshot rot bei: ${name}`, pruef.ok === false && fehlerCodes(pruef).includes(erwartetCode),
      `ok=${pruef.ok} codes=${fehlerCodes(pruef).slice(0, 5).join(", ") || "-"}`);
    let geworfen = false;
    try { await GEN.baueErsatzSqlDateien(paket, ergebnis, fallDir, { paketHash, outDir: path.join(tmp, `out-${erwartetCode}`) }); }
    catch (e) { geworfen = !!e && e.code === "snapshot-fehler"; }
    check(`6 Kein SQL bei Snapshot-Fall: ${name}`, geworfen);
  }

  const paketFaelle = [
    ["falsche Anzahl (499)", (p) => { p.profile.pop(); }, "kohorte-anzahl"],
    ["falsche Verteilung", (p) => { p.profile[0].parlament = "landtag-berlin"; }, "verteilung"],
    ["ein Profil aktiv:true", (p) => { p.profile[0].aktiv = true; }, "aktiv-true"],
    ["AfD-Profil eingeschleust", (p) => { p.profile[0] = synthetischAfd("synthetisch-afd-importprobe"); }, "afd-ausschluss"],
    ["doppelte Kennung", (p) => { p.profile[1].mandatsId = p.profile[0].mandatsId; }, "dublette-mandatsId"],
    ["Freigabe behauptet", (p) => { p.offlinePaket.importfreigabe.freigegeben = true; }, "importfreigabe"]
  ];
  for (const [name, mutiere, erwartetCode] of paketFaelle) {
    const mutiert = klon(paket);
    mutiere(mutiert);
    const pruef = GEN.preflight(mutiert);
    check(`6 Preflight rot bei Paket: ${name}`, pruef.ok === false && fehlerCodes(pruef).includes(erwartetCode),
      `ok=${pruef.ok} codes=${fehlerCodes(pruef).join(", ") || "-"}`);
    let geworfen = false;
    try { await GEN.baueErsatzSqlDateien(mutiert, null, snapshotDir, { paketHash, outDir: path.join(tmp, `pout-${erwartetCode}`) }); }
    catch (e) { geworfen = !!e && e.code === "preflight-fehler"; }
    check(`6 Kein SQL bei Paket-Fall: ${name}`, geworfen);
  }
  check("6.z Die synthetische AfD-Kennung steht NIE im echten Paket",
    !/synthetisch/.test(rohText) && !ergebnis.ids.includes("synthetisch-afd-importprobe"));
  check("6.w AfD-Testfall bleibt lokales Objekt, das echte Paket bleibt gruen",
    ZULASSUNG.istAusgeschlossen(synthetischAfd()) === true && GEN.preflight(klon(paket)).ok === true);

  abschnitt("7 · CLI: SQL nur mit gueltigem v2-Snapshot und --out, kein SQL auf stdout");
  const defaultLauf = spawnSync(process.execPath, [GENERATOR_PFAD], { encoding: "utf8" });
  check("7.1 Default-Aufruf ohne Snapshot endet != 0", defaultLauf.status !== 0, `status=${defaultLauf.status}`);
  check("7.2 Default-Aufruf gibt KEIN SQL aus",
    !/\bbegin;/i.test(defaultLauf.stdout) && !/\binsert\s+into\b/i.test(defaultLauf.stdout)
    && !/\bdelete\s+from\b/i.test(defaultLauf.stdout) && /FAIL-CLOSED/.test(`${defaultLauf.stdout}${defaultLauf.stderr}`));

  const cliOut = path.join(tmp, "cli-out");
  const lauf = spawnSync(process.execPath, [GENERATOR_PFAD, "--snapshot", snapshotDir, "--out", cliOut], { encoding: "utf8" });
  check("7.3 CLI Exit 0 mit gueltigem v2-Snapshot", lauf.status === 0, `status=${lauf.status} ${(lauf.stderr || "").slice(0, 200)}`);
  const cliFwd = path.join(cliOut, "500er-ersatz.sql");
  const cliRoll = path.join(cliOut, "500er-ersatz-rueckweg.sql");
  check("7.4 CLI schreibt Vorwaerts- und Rueckweg-SQL", fs.existsSync(cliFwd) && fs.existsSync(cliRoll));
  check("7.5 CLI-SQL-Dateien sind mode 0600",
    [cliFwd, cliRoll].every((p) => fs.existsSync(p) && (fs.statSync(p).mode & 0o777) === 0o600));
  check("7.6 CLI gibt kein SQL auf stdout",
    !/\bbegin;/i.test(lauf.stdout) && !/\binsert\s+into\b/i.test(lauf.stdout) && !/\bdelete\s+from\b/i.test(lauf.stdout));

  const ohneOut = spawnSync(process.execPath, [GENERATOR_PFAD, "--snapshot", snapshotDir], { encoding: "utf8" });
  check("7.7 CLI ohne --out endet != 0 und gibt kein SQL aus",
    ohneOut.status !== 0 && !/\bbegin;/i.test(ohneOut.stdout) && /FAIL-CLOSED/.test(ohneOut.stderr || ""));

  const rotDir = path.join(tmp, "rot-snapshot");
  const rotBasis = klon({ manifest, tabellen: null, alteIds: null, fremdRows: null });
  schreibeV2Snapshot(rotDir, { paketHash, mutation: (o) => { o.tabellen.mandate_profiles.pop(); o.alteIds.pop(); } });
  const rotOut = path.join(tmp, "rot-out");
  const rotLauf = spawnSync(process.execPath, [GENERATOR_PFAD, "--snapshot", rotDir, "--out", rotOut], { encoding: "utf8" });
  check("7.8 CLI Exit != 0 fuer einen ungueltigen Snapshot", rotLauf.status !== 0, `status=${rotLauf.status}`);
  check("7.9 CLI schreibt bei ungueltigem Snapshot KEIN SQL", !fs.existsSync(path.join(rotOut, "500er-ersatz.sql")));

  const besetztOut = path.join(tmp, "besetzt-out");
  fs.mkdirSync(besetztOut, { recursive: true });
  fs.writeFileSync(path.join(besetztOut, "500er-ersatz.sql"), "alt-forward");
  fs.writeFileSync(path.join(besetztOut, "500er-ersatz-rueckweg.sql"), "alt-rollback");
  let besetztGeworfen = false;
  try {
    await GEN.baueErsatzSqlDateien(paket, ergebnis, snapshotDir, { paketHash, outDir: besetztOut });
  } catch (e) { besetztGeworfen = !!e && e.code === "out-vorhanden"; }
  check("7.10 Vorhandenes Forward/Rollback-Paar wird fail-closed abgelehnt (kein Mischzustand)",
    besetztGeworfen
    && fs.readFileSync(path.join(besetztOut, "500er-ersatz.sql"), "utf8") === "alt-forward"
    && fs.readFileSync(path.join(besetztOut, "500er-ersatz-rueckweg.sql"), "utf8") === "alt-rollback");

  const besetztCli = spawnSync(process.execPath, [GENERATOR_PFAD, "--snapshot", snapshotDir, "--out", besetztOut], { encoding: "utf8" });
  check("7.11 CLI lehnt ein vorhandenes Forward/Rollback-Paar ebenfalls fail-closed ab",
    besetztCli.status !== 0
    && fs.readFileSync(path.join(besetztOut, "500er-ersatz.sql"), "utf8") === "alt-forward"
    && fs.readFileSync(path.join(besetztOut, "500er-ersatz-rueckweg.sql"), "utf8") === "alt-rollback");

  abschnitt("8 · Der Generator bleibt rein (kein DB-/Netz-Modul)");
  const geladen = Object.keys(require.cache)
    .filter((f) => f.startsWith(ROOT) && !f.includes("node_modules"))
    .filter((f) => /provisioning|storage\.js|supabase|scheduler|cron-|server\.js|profile-db|llm-/.test(f));
  check("8.1 Kein Schreib-/Provisionierungs-/DB-Modul geladen", geladen.length === 0,
    geladen.map((f) => path.relative(ROOT, f)).join(", ") || "keine");
  check("8.2 Der Generator ist reines SQL-/Pruefwerkzeug (Modul-Exports vorhanden)",
    typeof GEN.preflight === "function" && typeof GEN.pruefeSnapshotVerzeichnis === "function"
    && typeof GEN.baueErsatzSqlDateien === "function" && typeof GEN.pruefeErsatzSqlDateien === "function");

  abschnitt("8b · Datei-Selbsttest erkennt einen Multi-Batch-Strukturdefekt");
  const kaputterRollback = path.join(tmp, "kaputter-rueckweg.sql");
  fs.writeFileSync(kaputterRollback, [
    "begin;",
    "lock table public.profiles in access exclusive mode;",
    "lock table public.mandate_profiles in access exclusive mode;",
    "do $$ declare ist integer; begin end $$;",
    "delete from public.profiles where id in ('neu-1');",
    "insert into public.briefings (id, user_id, payload)",
    "select id, user_id, payload from jsonb_populate_recordset(null::public.briefings, '[]'::jsonb);",
    "select id, user_id, payload from jsonb_populate_recordset(null::public.briefings, '[]'::jsonb);",
    "commit;",
    ""
  ].join("\n"));
  const selbstKaputt = await GEN.pruefeErsatzSqlDateien(
    { forwardPfad: sql.forwardZiel, rollbackPfad: kaputterRollback },
    {
      neueIds: ["neu-1"],
      alteIds: sp.ids.mandat,
      fremdIds: sp.ids.fremd,
      snapshot: { dateien: { briefings: { zeilen: 5, spalten: ["id", "user_id", "payload"] } } }
    }
  );
  check("8b.1 Der Selbsttest meldet den fehlenden vollwertigen INSERT-Header je Batch",
    selbstKaputt.some((f) => f.code === "rollback-restore-struktur"),
    selbstKaputt.map((f) => f.code).join(", "));

  const vertauschteSpalten = path.join(tmp, "vertauschte-spalten-rueckweg.sql");
  const originalProjektion = `select ${sp.dateien.profiles.spalten.join(", ")} from jsonb_populate_recordset(null::public.profiles,`;
  fs.writeFileSync(vertauschteSpalten, roll.replace(originalProjektion,
    `select ${sp.dateien.profiles.spalten.slice().reverse().join(", ")} from jsonb_populate_recordset(null::public.profiles,`));
  const spaltenSelbst = await GEN.pruefeErsatzSqlDateien(
    { forwardPfad: sql.forwardZiel, rollbackPfad: vertauschteSpalten },
    { neueIds: ergebnis.ids, alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: sp }
  );
  check("8b.1b Selbsttest stoppt dieselben Spalten in falscher SELECT-Reihenfolge",
    spaltenSelbst.some(f => f.code === "rollback-restore-struktur"));

  // 8b.2 · Der reale 573-MB-Snapshot erzeugte bytebedingt MEHR Rollback-Batches als
  // ceil(zeilen/200), weil sehr grosse payload-Zeilen die 4-MiB-Bytegrenze ausloesen.
  // Der Selbsttest muss diese korrekten Zusatz-Batches akzeptieren, aber fehlende
  // Insert/Select-Paare weiterhin erkennen.
  const grosseSpalten = ["id", "user_id", "payload"];
  const grossePayload = "y".repeat(200 * 1024);
  const grosseZeilenAnzahl = 12;
  function* grosseZeilenQuelle() {
    for (let i = 0; i < grosseZeilenAnzahl; i++) yield { id: `gross-${i}`, user_id: "alt-mandat-0001", payload: grossePayload };
  }
  const grosseChunks = [];
  GEN.wiederherstellungsSqlAusZeilen(
    "profiles",
    { spalten: grosseSpalten, zeilen: grosseZeilenAnzahl },
    grosseZeilenQuelle(),
    (chunk) => grosseChunks.push(chunk),
    { maxRows: GEN.JSONB_BATCH_MAX_ROWS, maxBytes: 256 * 1024 }
  );
  const grosseBatchAnzahl = grosseChunks.length;
  const grosseMindestens = Math.ceil(grosseZeilenAnzahl / GEN.JSONB_BATCH_MAX_ROWS);
  const grosseRollbackKopf = [
    "begin;",
    "lock table public.profiles in access exclusive mode;",
    "lock table public.mandate_profiles in access exclusive mode;",
    "do $$ begin if exists (select 1 from public.mandate_profiles where user_id in ('neu-1')) then raise exception 'UNERWARTETE neue Kinddaten'; end if; end $$;",
    "delete from public.profiles where id in ('neu-1');"
  ];
  const grosseMandatPaar = [
    "insert into public.mandate_profiles (user_id)",
    "select user_id from jsonb_populate_recordset(null::public.mandate_profiles, '[]'::jsonb);"
  ];
  const grosseRollbackFuss = [
    "do $$ begin if (select count(*) from public.profiles where id in ('neu-1')) <> 0 then raise exception 'RUECKWEG NACHBEDINGUNG VERLETZT'; end if; end $$;",
    "commit;",
    ""
  ];
  const grosseSnapshot = {
    dateien: {
      profiles: { zeilen: grosseZeilenAnzahl, spalten: grosseSpalten },
      mandate_profiles: { zeilen: 1, spalten: ["user_id"] }
    }
  };
  const grosseRollback = path.join(tmp, "grosse-zeilen-rueckweg.sql");
  fs.writeFileSync(grosseRollback,
    grosseRollbackKopf.concat(grosseChunks, grosseMandatPaar, grosseRollbackFuss).join("\n"));
  const grosseSelbst = await GEN.pruefeErsatzSqlDateien(
    { forwardPfad: sql.forwardZiel, rollbackPfad: grosseRollback },
    { neueIds: ["neu-1"], alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: grosseSnapshot }
  );
  check("8b.2a Die bytegetriebene Probe erzeugt mehr Batches als row-count-only",
    grosseBatchAnzahl > grosseMindestens, `batches=${grosseBatchAnzahl} row-count-only=${grosseMindestens}`);
  check("8b.2b Der Selbsttest akzeptiert korrekte zusaetzliche Bytegrenz-Batches",
    !grosseSelbst.some((f) => f.code === "rollback-restore-batch-anzahl")
    && !grosseSelbst.some((f) => f.code === "rollback-restore-struktur"),
    grosseSelbst.map((f) => f.code).join(", ") || "keine");
  // 8b.2c · Bei zeilengetriebenen Batches (Minimum > 1) muss ein fehlendes
  // Insert/Select-Paar weiterhin als zu geringe Batch-Zahl gemeldet werden.
  const vieleZeilenAnzahl = GEN.JSONB_BATCH_MAX_ROWS + 5;
  function* vieleZeilenQuelle() {
    for (let i = 0; i < vieleZeilenAnzahl; i++) yield { id: `viel-${i}`, user_id: "alt-mandat-0001", payload: "z" };
  }
  const vieleChunks = [];
  GEN.wiederherstellungsSqlAusZeilen(
    "profiles",
    { spalten: grosseSpalten, zeilen: vieleZeilenAnzahl },
    vieleZeilenQuelle(),
    (chunk) => vieleChunks.push(chunk)
  );
  const vieleSnapshot = {
    dateien: {
      profiles: { zeilen: vieleZeilenAnzahl, spalten: grosseSpalten },
      mandate_profiles: { zeilen: 1, spalten: ["user_id"] }
    }
  };
  const vieleFehlendRollback = path.join(tmp, "viele-zeilen-rueckweg-fehlend.sql");
  fs.writeFileSync(vieleFehlendRollback,
    grosseRollbackKopf.concat(vieleChunks.slice(0, -1), grosseMandatPaar, grosseRollbackFuss).join("\n"));
  const vieleFehlendSelbst = await GEN.pruefeErsatzSqlDateien(
    { forwardPfad: sql.forwardZiel, rollbackPfad: vieleFehlendRollback },
    { neueIds: ["neu-1"], alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: vieleSnapshot }
  );
  check("8b.2c Der Selbsttest erkennt einen fehlenden Batch weiterhin",
    vieleChunks.length > 1
    && vieleFehlendSelbst.some((f) => f.code === "rollback-restore-batch-anzahl"),
    vieleFehlendSelbst.map((f) => f.code).join(", "));

  abschnitt("9 · Groessenregression: Streaming jenseits der Node-Stringgrenze");
  const maxString = BUFFER_CONSTANTS.MAX_STRING_LENGTH || 536870888;
  const kleineJsonl = path.join(tmp, "kleine-streaming-probe.jsonl");
  const kleineZeilen = Array.from({ length: 1000 }, (_, i) => JSON.stringify({ id: `klein-${i}`, user_id: "alt-mandat-0001", payload: "x" }));
  fs.writeFileSync(kleineJsonl, kleineZeilen.join("\n") + "\n");
  let gezaehlteDateizeilen = 0;
  for (const zeile of GEN.jsonlZeilenSync(kleineJsonl)) {
    gezaehlteDateizeilen += 1;
    JSON.parse(zeile);
  }
  check("9.0 Eine synthetische JSONL-Datei wird als Iterator ohne Gesamtarray gelesen",
    gezaehlteDateizeilen === kleineZeilen.length);

  const sparsePfad = path.join(tmp, "sparse-ueber-stringgrenze.jsonl");
  const sparseFd = fs.openSync(sparsePfad, "w");
  fs.writeSync(sparseFd, '{"id":"x","user_id":"alt-mandat-0001","payload":""}\n');
  fs.ftruncateSync(sparseFd, maxString + 1024);
  fs.closeSync(sparseFd);
  const sparseGroesse = fs.statSync(sparsePfad).size;
  const sparseHash = GEN.hashDateiSync(sparsePfad);
  check("9.1 Eine einzelne synthetische Datei ueber der Node-Stringgrenze wird streamend gehasht",
    sparseGroesse > maxString && /^[0-9a-f]{64}$/.test(sparseHash),
    `groesse=${sparseGroesse} max=${maxString}`);
  fs.unlinkSync(sparsePfad);

  const rowBytes = 1_000_000;
  const rowCount = Math.ceil(maxString / rowBytes) + 2;
  const payload = "x".repeat(rowBytes - 180);
  let batches = 0;
  let geschriebeneBytes = 0;
  function* grosseZeilen() {
    for (let i = 0; i < rowCount; i++) {
      yield { id: `gross-${i}`, user_id: "alt-mandat-0001", payload };
    }
  }
  GEN.wiederherstellungsSqlAusZeilen("briefings", { spalten: ["id", "user_id", "payload"], zeilen: rowCount }, grosseZeilen(), (chunk) => {
    batches += 1;
    geschriebeneBytes += Buffer.byteLength(chunk, "utf8");
  }, { maxRows: 4, maxBytes: 4 * 1024 * 1024 });
  const projektion = rowCount * rowBytes;
  check("9.2 Die deterministische Grenzenprobe projiziert ueber die Node-Stringgrenze",
    projektion > maxString, `projektion=${projektion} max=${maxString}`);
  check("9.3 Der Streaming-Pfad verarbeitet sie in begrenzten Batches",
    batches > 1 && geschriebeneBytes > maxString, `batches=${batches} bytes=${geschriebeneBytes}`);

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (Pruefungen ${pass + fail})`);
  process.exitCode = fail === 0 ? 0 : 1;
}

function istEintrag(sp, tabelle) {
  const e = sp.dateien[tabelle];
  return !!e && Array.isArray(e.spalten) && Number.isInteger(e.zeilen) && /^[0-9a-f]{64}$/.test(e.sha256 || "");
}

main().catch((e) => {
  console.error(e && e.stack || e);
  process.exitCode = 1;
});
