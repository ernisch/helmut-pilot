"use strict";

// Helmut — gezielter OFFLINE-Test fuer den Preimage-Snapshot-Assembler.
// =============================================================================================
// Beweist, dass der Assembler aus rein lokal exportierten JSON-Dateien genau EINEN gueltigen
// 500er-Preimage-Snapshot baut, der den Vertrag des bestehenden fail-closed Ersatzgenerators
// erfuellt und aus dem der Generator sein Ersatz-SQL baut:
//   1. Positiv: synthetischer 501er-Bestand (500 Mandate + 1 Fremdprofil ohne Mandat, mit FK-
//      Kinddaten) => Exit 0, genau eine Datei, mode 0600, konsistenter sha256.
//   2. Vertrag: pruefeSnapshot/hashSnapshot des Generators akzeptieren den Snapshot; die
//      ID-Mengenbindung und der Fremdprofilbestand stimmen.
//   3. Generator-Kompatibilitaet: baueErsatzSql baut aus dem Snapshot Ersatz-SQL; der SQL-
//      Selbsttest ist gruen. Es wird KEIN SQL ausgefuehrt.
//   4. Negative, fail-closed: fehlende Datei, 499 Mandate, falsche ID-Menge, AfD in
//      Partei/Fraktion, Output im Repository, vorhandene Zieldatei, fehlende Pflichtwerte,
//      falsche Paketbindung => kein Output, Exit != 0.
//   5. Keine Rohdaten auf stdout (nur Pfad/Hash/Zusammenfassung).
//
// KEIN Netzwerk, KEINE DB, KEIN Modellaufruf, KEINE Schreibwirkung im Repo, KEINE Production.
// Synthetische, erfundene Daten — keine personenbezogenen Daten.
// Aufruf:  node scripts/import-preimage-500-snapshot-test.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
process.env.HELMUT_SOURCE_MODE = "off";

const ASSEMBLER = path.join(__dirname, "import-preimage-500-snapshot.js");
const GEN = require(path.join(ROOT, "scripts", "import-preflight-500-sql-generator.js"));
const PAKET_PFAD = path.join(ROOT, "daten", "mandatsprofile-bundestag-berlin-brandenburg-20260929.json");

const OP_ID = "test-preimage-snapshot-20260930";
const OPERATOR = "Synthetischer Testbetreiber, rein lesend";
const FREMD_ID = "fremd-synthetisch-ohne-mandat";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }
function klon(v) { return JSON.parse(JSON.stringify(v)); }

// ── Synthetischer, vertragskonformer Bestand: 500 Mandate + 1 Fremdprofil, mit FK-Kinddaten. ──
function baueSynthetischenBestand() {
  const tabellen = {};
  for (const t of GEN.SNAPSHOT_TABELLEN) tabellen[t] = [];
  const alteIds = [];

  for (let i = 1; i <= 500; i++) {
    const id = `synthetisch-mandat-${String(i).padStart(4, "0")}`;
    alteIds.push(id);
    tabellen.profiles.push({ id, name: `Synthetischer Altbestand ${i}`, created_at: "2026-01-01T00:00:00.000Z" });
    tabellen.mandate_profiles.push({
      user_id: id,
      partei: i % 3 === 0 ? "CDU" : "SPD",
      fraktion: i % 3 === 0 ? "CDU/CSU" : "SPD-Fraktion",
      politische_ebene: i <= 330 ? "bundestag" : "landtag",
      wahlkreis: `Synthetischer Wahlkreis ${i}`,
      bundesland: i % 2 === 0 ? "Berlin" : "Brandenburg",
      aktiv: false,
      onboarding_status: "abgeschlossen",
      profil_extras: { parlament: i <= 330 ? "bundestag" : "landtag-berlin" }
    });
  }

  // Relevante FK-Kinddaten (mehrere Tabellen, inkl. Eltern-Kind-Paar) — erfundene Inhalte.
  tabellen.briefings.push(
    { id: "sbrief-1", user_id: alteIds[0], slot: "morgens", payload: { x: 1 }, created_at: "2026-02-01T06:00:00.000Z" },
    { id: "sbrief-2", user_id: alteIds[1], slot: "mittags", payload: { x: 2 }, created_at: "2026-02-01T12:00:00.000Z" },
    { id: "sbrief-3", user_id: alteIds[330], slot: "abends", payload: { x: 3 }, created_at: "2026-02-01T18:00:00.000Z" }
  );
  tabellen.decisions.push(
    { id: "sdec-1", user_id: alteIds[0], knowledge_object_id: "ko-1", score: 10, status: "new" },
    { id: "sdec-2", user_id: alteIds[2], knowledge_object_id: "ko-2", score: 20, status: "new" }
  );
  tabellen.matching_results.push(
    { id: "smr-1", user_id: alteIds[0], knowledge_object_id: "ko-1", similarity: 0.5, rank: 1, matched_features: ["partei:SPD"], filters: {} },
    { id: "smr-2", user_id: alteIds[1], knowledge_object_id: "ko-2", similarity: 0.7, rank: 1, matched_features: [], filters: {} }
  );
  tabellen.matching_runs.push(
    { id: "srun-1", user_id: alteIds[0], status: "abgeschlossen", eingabe_fingerabdruck: "fp-1", gestartet_am: "2026-02-01T06:00:00.000Z" }
  );
  tabellen.profile_embeddings.push(
    { user_id: alteIds[0], embedding: "[0.1, 0.2, 0.3]", profile_hash: "h1", dim: 256 },
    { user_id: alteIds[1], embedding: "[0.2, 0.3, 0.4]", profile_hash: "h2", dim: 256 }
  );
  tabellen.political_items.push(
    { id: "spi-1", user_id: alteIds[0], title: "Synthetischer Vorgang 1", created_at: "2026-02-01T00:00:00.000Z" },
    { id: "spi-2", user_id: alteIds[1], title: "Synthetischer Vorgang 2", created_at: "2026-02-01T00:00:00.000Z" }
  );
  tabellen.personalized_recommendations.push(
    { id: "spr-1", user_id: alteIds[0], political_item_id: "spi-1", priority: "high", personal_relevance_explanation: "x", recommended_action: "y", action_type: "z" }
  );
  tabellen.daily_tasks.push(
    { id: "sdt-1", user_id: alteIds[0], recommendation_id: "spr-1", title: "Synthetische Aufgabe 1", priority: "high", status: "open" }
  );

  const fremdRows = [{ id: FREMD_ID, name: "Synthetisches Fremdprofil ohne Mandat", created_at: "2025-12-01T00:00:00.000Z" }];
  return { tabellen, alteIds, fremdRows };
}

function schreibeInput(dir, bestand, paketHash) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of GEN.SNAPSHOT_TABELLEN) {
    if (bestand.tabellen[name] === undefined) continue; // "fehlende Datei"-Fall
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(bestand.tabellen[name]));
  }
  fs.writeFileSync(path.join(dir, "fremd_profiles.json"), JSON.stringify(bestand.fremdRows));
  fs.writeFileSync(path.join(dir, "paket.json"), JSON.stringify({
    pfad: "daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json",
    sha256: paketHash
  }));
}

function laufAssembler(inputDir, outPfad, extra = []) {
  return spawnSync(process.execPath, [
    ASSEMBLER,
    "--input-dir", inputDir,
    "--out", outPfad,
    "--operation-id", OP_ID,
    "--operator", OPERATOR,
    ...extra
  ], { encoding: "utf8" });
}

function keineTempReste(dir) {
  try { return !fs.readdirSync(dir).some((n) => n.startsWith(".") && n.includes(".tmp-")); }
  catch (_) { return true; }
}

function main() {
  console.log("Helmut — Preimage-Snapshot-Assembler (offline)\n");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-preimage-"));
  const paket = GEN.ladePaket(PAKET_PFAD);
  const paketHash = GEN.hashPaket(PAKET_PFAD);
  const ergebnis = GEN.preflight(paket);
  check("0.1 Das echte 500er-Paket ist Preflight-gruen", ergebnis.ok === true, `${ergebnis.fehler.length} Befunde`);

  // ── 1 · Positiv: gueltiger 501er-Input => genau ein Snapshot, 0600, konsistent ───────────
  abschnitt("1 · Positiv: 500 Mandate + 1 Fremdprofil => ein gueltiger Snapshot (0600)");
  const inDir = path.join(tmp, "input");
  const bestand = baueSynthetischenBestand();
  schreibeInput(inDir, bestand, paketHash);
  check("1.1 Synthetischer Input: 500 profiles / 500 mandate_profiles / 1 Fremdprofil",
    bestand.tabellen.profiles.length === 500 && bestand.tabellen.mandate_profiles.length === 500
    && bestand.fremdRows.length === 1);

  const outDatei = path.join(tmp, "snapshot.json");
  const lauf = laufAssembler(inDir, outDatei);
  check("1.2 Assembler Exit 0", lauf.status === 0, `status=${lauf.status} ${(lauf.stderr || "").slice(0, 200)}`);
  check("1.3 Genau die eine Zieldatei existiert", fs.existsSync(outDatei));
  check("1.4 Keine Temp-Reste im Zielverzeichnis", keineTempReste(path.dirname(outDatei)));
  const mode = fs.existsSync(outDatei) ? (fs.statSync(outDatei).mode & 0o777) : -1;
  check("1.5 Dateimodus ist 0600", mode === 0o600, `mode=${mode.toString(8)}`);

  const snapshot = fs.existsSync(outDatei) ? JSON.parse(fs.readFileSync(outDatei, "utf8")) : null;
  check("1.6 Snapshot traegt den versionierten Vertrag", !!snapshot && snapshot.snapshotVertrag === GEN.SNAPSHOT_VERTRAG);
  check("1.7 operationId und erstelltVon stammen aus der CLI",
    !!snapshot && snapshot.operationId === OP_ID && snapshot.erstelltVon === OPERATOR);
  check("1.8 Paketbindung (pfad + sha256) vorhanden",
    !!snapshot && snapshot.paket && snapshot.paket.sha256 === paketHash);
  check("1.9 Bestand: 501 profiles / 500 mandate / 0 aktiv",
    !!snapshot && snapshot.bestand.profilesGesamt === 501 && snapshot.bestand.mandateProfilesGesamt === 500
    && snapshot.bestand.aktivGesamt === 0);
  check("1.10 Alle bekannten Snapshot-Tabellen enthalten",
    !!snapshot && GEN.SNAPSHOT_TABELLEN.every((t) => Array.isArray(snapshot.tabellen[t])));
  check("1.11 Fremdprofil ohne Mandat erfasst",
    !!snapshot && snapshot.fremd_profiles.length === 1 && snapshot.fremd_profiles[0].id === FREMD_ID);
  const paketAus = path.join(tmp, "snapshot-mit-paket.json");
  const laufMitPaket = laufAssembler(inDir, paketAus, ["--paket", PAKET_PFAD]);
  check("1.12 --paket mit passender Bindung (lokaler Hashabgleich) => Exit 0",
    laufMitPaket.status === 0 && fs.existsSync(paketAus), `status=${laufMitPaket.status}`);

  // ── 2 · Vertrag: Generator-Pruefungen akzeptieren den Snapshot ───────────────────────────
  abschnitt("2 · Vertrag: pruefeSnapshot/hashSnapshot des Generators akzeptieren den Snapshot");
  const sp = GEN.pruefeSnapshot(snapshot, { paketHash, neueIds: [] });
  check("2.1 pruefeSnapshot ist gruen", sp.ok === true, sp.fehler.map((f) => f.code).join(", ") || "0 Befunde");
  check("2.2 hashSnapshot stimmt mit dem gespeicherten sha256",
    !!snapshot && GEN.hashSnapshot(snapshot) === snapshot.sha256);
  check("2.3 ID-Mengenbindung: ids.mandat == profiles == mandate_profiles",
    sp.ids.mandat.length === 500 && sp.ids.mandat.join() === bestand.alteIds.slice().sort().join());
  check("2.4 ids.fremd == Fremdprofilbestand",
    sp.ids.fremd.length === 1 && sp.ids.fremd[0] === FREMD_ID);
  check("2.5 Altbestand ist AfD-frei und vollstaendig inaktiv",
    snapshot.tabellen.mandate_profiles.every((z) => z.aktiv === false
      && !/afd|alternative f(ü|ue)r deutschland/i.test(`${z.partei || ""} ${z.fraktion || ""}`)));
  check("2.6 Mindestens eine relevante Kindzeile vorhanden",
    snapshot.tabellen.briefings.length + snapshot.tabellen.decisions.length
    + snapshot.tabellen.matching_results.length + snapshot.tabellen.matching_runs.length > 0);

  // ── 3 · Generator-Kompatibilitaet: aus dem Snapshot entsteht Ersatz-SQL ──────────────────
  abschnitt("3 · Generator baut aus dem Snapshot Ersatz-SQL (Selbsttest gruen, keine Ausfuehrung)");
  let sql = null;
  try { sql = GEN.baueErsatzSql(paket, ergebnis, snapshot, { paketHash }); } catch (e) {
    check("3.1 baueErsatzSql wirft nicht", false, `${e && e.code}: ${e && e.message}`);
  }
  check("3.1 baueErsatzSql baut Vorwaerts- und Rueckweg-SQL",
    !!sql && typeof sql.forward === "string" && typeof sql.rollback === "string"
    && sql.forward.length > 0 && sql.rollback.length > 0);
  if (sql) {
    const selbst = GEN.pruefeErsatzSql(sql, {
      neueIds: ergebnis.ids, alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: sp
    });
    check("3.2 Der SQL-Selbsttest des Generators ist gruen", selbst.length === 0,
      selbst.map((f) => f.code).join(", ") || "0 Befunde");
    check("3.3 Vorwaerts loescht nur die Preimage-Kohorte, nie das Fremdprofil",
      (sql.forward.match(/delete\s+from\s+public\./gi) || []).length === 1
      && (() => {
        const m = sql.forward.match(/delete\s+from\s+public\.profiles\s+where\s+id\s+in\s*\(([^)]*)\)/i);
        const ids = m ? [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) : [];
        return ids.length === 500 && !ids.includes(FREMD_ID) && ids.includes(bestand.alteIds[0]);
      })());
    check("3.4 Rueckweg stellt die Snapshot-Zeilen wieder her (nicht ausgefuehrt)",
      /jsonb_populate_recordset/.test(sql.rollback) && /UNERWARTETE neue Kinddaten/.test(sql.rollback));
  }

  // ── 4 · stdout: nur Pfad/Hash/Zusammenfassung, keine Rohdaten/SQL ────────────────────────
  abschnitt("4 · stdout enthaelt nur Pfad/Hash/Zusammenfassung");
  check("4.1 stdout nennt Pfad und sha256",
    !!snapshot && lauf.stdout.includes(outDatei) && lauf.stdout.includes(snapshot.sha256));
  check("4.2 stdout enthaelt keine Rohdaten oder SQL",
    !/Synthetischer Altbestand/.test(lauf.stdout) && !/begin;/i.test(lauf.stdout)
    && !/insert\s+into/i.test(lauf.stdout) && !/synthetisch-mandat-/.test(lauf.stdout));

  // ── 5 · Fail-closed: ungueltige Eingaben erzeugen keinen Output ──────────────────────────
  abschnitt("5 · Fail-closed: ungueltige/unsichere Eingaben => kein Output, Exit != 0");
  const negativFaelle = [
    ["fehlende Eingabedatei (briefings.json)", (b) => { delete b.tabellen.briefings; }],
    ["499 Mandate", (b) => { b.tabellen.mandate_profiles.pop(); }],
    ["falsche ID-Menge (doppelte mandate-user_id)", (b) => {
      b.tabellen.mandate_profiles[0].user_id = b.tabellen.mandate_profiles[1].user_id;
    }],
    ["AfD in Partei/Fraktion", (b) => {
      b.tabellen.mandate_profiles[0].partei = "AfD";
      b.tabellen.mandate_profiles[0].fraktion = "AfD";
    }]
  ];
  negativFaelle.forEach(([name, mutiere], idx) => {
    const dir = path.join(tmp, `neg-${idx}`);
    const b = klon(bestand);
    mutiere(b);
    schreibeInput(dir, b, paketHash);
    const aus = path.join(tmp, `neg-out-${idx}.json`);
    const l = laufAssembler(dir, aus);
    check(`5.x kein Output/Exit!=0 bei: ${name}`, l.status !== 0 && !fs.existsSync(aus),
      `status=${l.status} ${(l.stderr || "").split("\n")[0]}`);
  });

  const repoOut = path.join(ROOT, "preimage-snapshot-darf-nicht-entstehen.json");
  const repoLauf = laufAssembler(inDir, repoOut);
  check("5.5 Output im Repository-Root wird abgelehnt",
    repoLauf.status !== 0 && !fs.existsSync(repoOut), `status=${repoLauf.status}`);

  const bestOut = path.join(tmp, "vorhanden.json");
  fs.writeFileSync(bestOut, "bereits vorhanden");
  const ohneForce = laufAssembler(inDir, bestOut);
  check("5.6 Vorhandene Zieldatei ohne --force wird abgelehnt",
    ohneForce.status !== 0 && fs.readFileSync(bestOut, "utf8") === "bereits vorhanden", `status=${ohneForce.status}`);
  const mitForce = laufAssembler(inDir, bestOut, ["--force"]);
  check("5.7 Mit --force wird die Zieldatei atomar ersetzt",
    mitForce.status === 0 && JSON.parse(fs.readFileSync(bestOut, "utf8")).snapshotVertrag === GEN.SNAPSHOT_VERTRAG);

  const ohnePflicht = spawnSync(process.execPath, [ASSEMBLER, "--input-dir", inDir], { encoding: "utf8" });
  check("5.8 Fehlende Pflichtwerte => Exit != 0, kein Output",
    ohnePflicht.status !== 0 && /FAIL-CLOSED/.test(ohnePflicht.stderr || ""));

  const paketDir = path.join(tmp, "input-ohne-paket");
  schreibeInput(paketDir, bestand, paketHash);
  fs.rmSync(path.join(paketDir, "paket.json"));
  const ohnePaket = laufAssembler(paketDir, path.join(tmp, "ohne-paket.json"));
  check("5.9 Fehlende Paketbindung => Exit != 0, kein Output",
    ohnePaket.status !== 0 && !fs.existsSync(path.join(tmp, "ohne-paket.json")));

  const falscheBindungDir = path.join(tmp, "input-falsche-bindung");
  schreibeInput(falscheBindungDir, bestand, "a".repeat(64));
  const falschesPaket = laufAssembler(falscheBindungDir, path.join(tmp, "falsches-paket.json"), ["--paket", PAKET_PFAD]);
  check("5.10 --paket mit abweichender Bindung passt nicht => Exit != 0, kein Output",
    falschesPaket.status !== 0 && !fs.existsSync(path.join(tmp, "falsches-paket.json")), `status=${falschesPaket.status}`);

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (Pruefungen ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
