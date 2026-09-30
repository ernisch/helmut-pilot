"use strict";

// Helmut — gezielter OFFLINE-Test fuer den v2-Preimage-Snapshot-Assembler.
// =============================================================================================
// Beweist, dass der Assembler aus rein lokal exportierten JSON-Dateien ein v2-Snapshot-
// VERZEICHNIS baut (manifest.json + je Tabelle eine JSONL-Datei), das der fail-closed
// v2-Generator prueft und als Ersatz-SQL streamt:
//   1. Positiv: synthetischer 501er-Bestand => Exit 0, 19 Dateien, alle mode 0600, Manifest-Hash.
//   2. Vertrag: pruefeSnapshotVerzeichnis akzeptiert den Snapshot; ID-Mengenbindung stimmt.
//   3. Generator-Kompatibilitaet: baueErsatzSqlDateien erzeugt 0600-SQL-Dateien; der Datei-
//      Selbsttest ist gruen. Es wird KEIN SQL ausgefuehrt.
//   4. Negative, fail-closed: fehlende Datei, 499 Mandate, falsche ID-Menge, AfD, Output im
//      Repository, vorhandenes Ziel, fehlende Pflichtwerte, falsche Paketbindung => kein Output.
//   5. Keine Rohdaten/SQL auf stdout (nur Pfad/Hash/Zusammenfassung).
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

const OP_ID = "test-preimage-snapshot-v2-20260930";
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

  tabellen.briefings.push(
    { id: "sbrief-1", user_id: alteIds[0], slot: "morgens", payload: { x: 1 }, created_at: "2026-02-01T06:00:00.000Z" },
    { id: "sbrief-2", user_id: alteIds[1], slot: "mittags", payload: { x: 2 }, created_at: "2026-02-01T12:00:00.000Z" },
    { id: "sbrief-3", user_id: alteIds[330], slot: "abends", payload: { x: 3 }, created_at: "2026-02-01T18:00:00.000Z" },
    { id: "sbrief-4", user_id: alteIds[0], slot: "mittags", payload: { x: 4 }, created_at: "2026-02-02T12:00:00.000Z" }
  );
  tabellen.decisions.push(
    { id: "sdec-1", user_id: alteIds[0], knowledge_object_id: "ko-1", score: 10, status: "new" },
    { id: "sdec-2", user_id: alteIds[2], knowledge_object_id: "ko-2", score: 20, status: "new" },
    { id: "sdec-3", user_id: alteIds[0], knowledge_object_id: "ko-3", score: 30, status: "new" }
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
    if (bestand.tabellen[name] === undefined) continue;
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(bestand.tabellen[name]));
  }
  fs.writeFileSync(path.join(dir, "fremd_profiles.json"), JSON.stringify(bestand.fremdRows));
  fs.writeFileSync(path.join(dir, "paket.json"), JSON.stringify({
    pfad: "daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json",
    sha256: paketHash
  }));
}

function laufAssembler(inputDir, outDir, extra = []) {
  return spawnSync(process.execPath, [
    ASSEMBLER,
    "--input-dir", inputDir,
    "--out", outDir,
    "--operation-id", OP_ID,
    "--operator", OPERATOR,
    ...extra
  ], { encoding: "utf8" });
}

function keineTempReste(dir) {
  try { return !fs.readdirSync(dir).some((n) => n.startsWith(".") && n.includes(".tmp-")); }
  catch (_) { return true; }
}

async function main() {
  console.log("Helmut — v2-Preimage-Snapshot-Assembler (offline)\n");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-preimage-v2-"));
  const paket = GEN.ladePaket(PAKET_PFAD);
  const paketHash = GEN.hashPaket(PAKET_PFAD);
  const ergebnis = GEN.preflight(paket);
  check("0.1 Das echte 500er-Paket ist Preflight-gruen", ergebnis.ok === true, `${ergebnis.fehler.length} Befunde`);

  abschnitt("1 · Positiv: 500 Mandate + 1 Fremdprofil => ein gueltiges v2-Snapshot-Verzeichnis");
  const inDir = path.join(tmp, "input");
  const bestand = baueSynthetischenBestand();
  schreibeInput(inDir, bestand, paketHash);
  check("1.1 Synthetischer Input: 500 profiles / 500 mandate_profiles / 1 Fremdprofil",
    bestand.tabellen.profiles.length === 500 && bestand.tabellen.mandate_profiles.length === 500
    && bestand.fremdRows.length === 1);

  const outDir = path.join(tmp, "snapshot");
  const lauf = laufAssembler(inDir, outDir);
  check("1.2 Assembler Exit 0", lauf.status === 0, `status=${lauf.status} ${(lauf.stderr || "").slice(0, 200)}`);
  check("1.3 Snapshot-Verzeichnis existiert", fs.existsSync(outDir) && fs.statSync(outDir).isDirectory());
  check("1.4 Keine Temp-Reste im Zielverzeichnis", keineTempReste(outDir));

  const erwarteteDateien = [GEN.MANIFEST_DATEI, ...[...GEN.SNAPSHOT_TABELLEN, GEN.FREMD_TABELLE].map((t) => GEN.dateiName(t))].sort();
  const vorhandene = fs.existsSync(outDir) ? fs.readdirSync(outDir).sort() : [];
  check("1.5 Genau die 19 v2-Dateien (manifest + 18 JSONL) vorhanden",
    JSON.stringify(vorhandene) === JSON.stringify(erwarteteDateien),
    `ist=${vorhandene.length} soll=${erwarteteDateien.length}`);
  const modi = vorhandene.map((n) => fs.statSync(path.join(outDir, n)).mode & 0o777);
  check("1.6 Alle Dateien haben mode 0600", modi.every((m) => m === 0o600), modi.map((m) => m.toString(8)).join(","));

  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, GEN.MANIFEST_DATEI), "utf8"));
  check("1.7 Manifest traegt den versionierten v2-Vertrag", manifest.snapshotVertrag === GEN.SNAPSHOT_VERTRAG);
  check("1.8 operationId und erstelltVon stammen aus der CLI",
    manifest.operationId === OP_ID && manifest.erstelltVon === OPERATOR);
  check("1.9 Paketbindung (pfad + sha256) vorhanden",
    manifest.paket && manifest.paket.sha256 === paketHash);
  check("1.10 Bestand: 501 profiles / 500 mandate / 0 aktiv",
    manifest.bestand.profilesGesamt === 501 && manifest.bestand.mandateProfilesGesamt === 500
    && manifest.bestand.aktivGesamt === 0);
  check("1.11 Alle Tabellen + fremd_profiles sind im Manifest gebunden",
    GEN.V2_SNAPSHOT_DATEIEN.every((t) => istEintrag(manifest, t)));
  check("1.12 Fremdprofil ohne Mandat erfasst",
    manifest.ids.fremd.length === 1 && manifest.ids.fremd[0] === FREMD_ID);
  check("1.13 Manifest-Hash ist selbstkonsistent", GEN.hashSnapshot(manifest) === manifest.sha256);

  const paketOut = path.join(tmp, "snapshot-mit-paket");
  const laufMitPaket = laufAssembler(inDir, paketOut, ["--paket", PAKET_PFAD]);
  check("1.14 --paket mit passender Bindung => Exit 0",
    laufMitPaket.status === 0 && fs.existsSync(path.join(paketOut, GEN.MANIFEST_DATEI)), `status=${laufMitPaket.status}`);

  abschnitt("2 · Vertrag: pruefeSnapshotVerzeichnis akzeptiert den Snapshot");
  const sp = GEN.pruefeSnapshotVerzeichnis(outDir, { paketHash, neueIds: [] });
  check("2.1 pruefeSnapshotVerzeichnis ist gruen", sp.ok === true, sp.fehler.map((f) => f.code).join(", ") || "0 Befunde");
  check("2.2 ID-Mengenbindung: ids.mandat == profiles == mandate_profiles",
    sp.ids.mandat.length === 500 && sp.ids.mandat.join() === bestand.alteIds.slice().sort().join());
  check("2.3 ids.fremd == Fremdprofilbestand",
    sp.ids.fremd.length === 1 && sp.ids.fremd[0] === FREMD_ID);
  check("2.4 Altbestand ist AfD-frei und vollstaendig inaktiv",
    (() => {
      const pfad = path.join(outDir, GEN.dateiName("mandate_profiles"));
      return fs.readFileSync(pfad, "utf8").trim().split(/\r?\n/).every((l) => {
        const z = JSON.parse(l);
        return z.aktiv === false && !/afd|alternative f(ü|ue)r deutschland/i.test(`${z.partei || ""} ${z.fraktion || ""}`);
      });
    })());
  check("2.5 Mindestens eine relevante Kindzeile vorhanden",
    sp.dateien.briefings.zeilen + sp.dateien.decisions.zeilen
    + sp.dateien.matching_results.zeilen + sp.dateien.matching_runs.zeilen > 0);
  check("2.6 1:n-Kindtabellen duerfen dieselbe user_id mehrfach tragen",
    (() => {
      const pfad = path.join(outDir, GEN.dateiName("briefings"));
      const counts = {};
      for (const z of fs.readFileSync(pfad, "utf8").trim().split(/\r?\n/).map((l) => JSON.parse(l))) {
        counts[z.user_id] = (counts[z.user_id] || 0) + 1;
      }
      return Object.values(counts).some((n) => n > 1);
    })());

  abschnitt("3 · Generator streamt aus dem v2-Snapshot Ersatz-SQL (Datei-Selbsttest gruen)");
  const sqlOut = path.join(tmp, "sql");
  let sql = null;
  try { sql = await GEN.baueErsatzSqlDateien(paket, ergebnis, outDir, { paketHash, outDir: sqlOut }); }
  catch (e) { check("3.1 baueErsatzSqlDateien wirft nicht", false, `${e && e.code}: ${e && e.message}`); }
  check("3.1 baueErsatzSqlDateien erzeugt Vorwaerts- und Rueckweg-SQL",
    !!sql && fs.existsSync(sql.forwardZiel) && fs.existsSync(sql.rollbackZiel));
  check("3.2 SQL-Dateien sind mode 0600",
    !!sql && [sql.forwardZiel, sql.rollbackZiel].every((p) => (fs.statSync(p).mode & 0o777) === 0o600));
  if (sql) {
    const selbst = await GEN.pruefeErsatzSqlDateien(
      { forwardPfad: sql.forwardZiel, rollbackPfad: sql.rollbackZiel },
      { neueIds: ergebnis.ids, alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: sp }
    );
    check("3.3 Der Datei-Selbsttest des Generators ist gruen", selbst.length === 0,
      selbst.map((f) => f.code).join(", ") || "0 Befunde");
    const fwd = fs.readFileSync(sql.forwardZiel, "utf8");
    const roll = fs.readFileSync(sql.rollbackZiel, "utf8");
    check("3.4 Vorwaerts loescht nur die Preimage-Kohorte, nie das Fremdprofil",
      (fwd.match(/delete\s+from\s+public\./gi) || []).length === 1
      && (() => {
        const m = fwd.match(/delete\s+from\s+public\.profiles\s+where\s+id\s+in\s*\(([^)]*)\)/i);
        const ids = m ? [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) : [];
        return ids.length === 500 && !ids.includes(FREMD_ID) && ids.includes(bestand.alteIds[0]);
      })());
    check("3.5 Rueckweg streamt JSONB-Batches und Guard (nicht ausgefuehrt)",
      /jsonb_populate_recordset/.test(roll) && /UNERWARTETE neue Kinddaten/.test(roll)
      && (roll.match(/jsonb_populate_recordset/g) || []).length > 0);
  }

  abschnitt("4 · stdout enthaelt nur Pfad/Hash/Zusammenfassung");
  check("4.1 stdout nennt Pfad und sha256",
    lauf.stdout.includes(outDir) && lauf.stdout.includes(manifest.sha256));
  check("4.2 stdout enthaelt keine Rohdaten oder SQL",
    !/Synthetischer Altbestand/.test(lauf.stdout) && !/begin;/i.test(lauf.stdout)
    && !/insert\s+into/i.test(lauf.stdout) && !/synthetisch-mandat-/.test(lauf.stdout));

  abschnitt("5 · Fail-closed: ungueltige Eingaben erzeugen keinen Output");
  const negativFaelle = [
    ["fehlende Eingabedatei (briefings.json)", (b) => { delete b.tabellen.briefings; }],
    ["499 Mandate", (b) => { b.tabellen.mandate_profiles.pop(); }],
    ["falsche ID-Menge (doppelte mandate-user_id)", (b) => {
      b.tabellen.mandate_profiles[0].user_id = b.tabellen.mandate_profiles[1].user_id;
    }],
    ["AfD in Partei/Fraktion", (b) => {
      b.tabellen.mandate_profiles[0].partei = "AfD";
      b.tabellen.mandate_profiles[0].fraktion = "AfD";
    }],
    ["doppelte Primärschlüssel in 1:n-Kindtabelle", (b) => {
      b.tabellen.briefings[1].id = b.tabellen.briefings[0].id;
    }],
    ["doppelte Primärschlüssel in 1:1-Kindtabelle", (b) => {
      b.tabellen.profile_embeddings[1].user_id = b.tabellen.profile_embeddings[0].user_id;
    }]
  ];
  negativFaelle.forEach(([name, mutiere], idx) => {
    const dir = path.join(tmp, `neg-${idx}`);
    const b = klon(bestand);
    mutiere(b);
    schreibeInput(dir, b, paketHash);
    const aus = path.join(tmp, `neg-out-${idx}`);
    const l = laufAssembler(dir, aus);
    check(`5.x kein Output/Exit!=0 bei: ${name}`, l.status !== 0 && !fs.existsSync(aus),
      `status=${l.status} ${(l.stderr || "").split("\n")[0]}`);
  });

  const repoOut = path.join(ROOT, "preimage-snapshot-v2-darf-nicht-entstehen");
  const repoLauf = laufAssembler(inDir, repoOut);
  check("5.5 Output im Repository-Root wird abgelehnt",
    repoLauf.status !== 0 && !fs.existsSync(repoOut), `status=${repoLauf.status}`);

  const bestOut = path.join(tmp, "vorhanden");
  fs.mkdirSync(bestOut, { recursive: true });
  fs.writeFileSync(path.join(bestOut, "bleibt.txt"), "bereits vorhanden");
  const ohneForce = laufAssembler(inDir, bestOut);
  check("5.6 Vorhandenes nicht-leeres Ziel ohne --force wird abgelehnt",
    ohneForce.status !== 0 && fs.readFileSync(path.join(bestOut, "bleibt.txt"), "utf8") === "bereits vorhanden", `status=${ohneForce.status}`);
  const mitForce = laufAssembler(inDir, bestOut, ["--force"]);
  check("5.7 Mit --force wird das Ziel ersetzt",
    mitForce.status === 0 && fs.existsSync(path.join(bestOut, GEN.MANIFEST_DATEI))
    && JSON.parse(fs.readFileSync(path.join(bestOut, GEN.MANIFEST_DATEI), "utf8")).snapshotVertrag === GEN.SNAPSHOT_VERTRAG);

  const ohnePflicht = spawnSync(process.execPath, [ASSEMBLER, "--input-dir", inDir], { encoding: "utf8" });
  check("5.8 Fehlende Pflichtwerte => Exit != 0, kein Output",
    ohnePflicht.status !== 0 && /FAIL-CLOSED/.test(ohnePflicht.stderr || ""));

  const paketDir = path.join(tmp, "input-ohne-paket");
  schreibeInput(paketDir, bestand, paketHash);
  fs.rmSync(path.join(paketDir, "paket.json"));
  const ohnePaket = laufAssembler(paketDir, path.join(tmp, "ohne-paket"));
  check("5.9 Fehlende Paketbindung => Exit != 0, kein Output",
    ohnePaket.status !== 0 && !fs.existsSync(path.join(tmp, "ohne-paket")));

  const falscheBindungDir = path.join(tmp, "input-falsche-bindung");
  schreibeInput(falscheBindungDir, bestand, "a".repeat(64));
  const falschesPaket = laufAssembler(falscheBindungDir, path.join(tmp, "falsches-paket"), ["--paket", PAKET_PFAD]);
  check("5.10 --paket mit abweichender Bindung passt nicht => Exit != 0, kein Output",
    falschesPaket.status !== 0 && !fs.existsSync(path.join(tmp, "falsches-paket")), `status=${falschesPaket.status}`);

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (Pruefungen ${pass + fail})`);
  process.exitCode = fail === 0 ? 0 : 1;
}

function istEintrag(manifest, tabelle) {
  const e = manifest.dateien[GEN.dateiName(tabelle)];
  return !!e && e.tabelle === tabelle && Array.isArray(e.spalten) && Number.isInteger(e.zeilen)
    && /^[0-9a-f]{64}$/.test(e.sha256 || "");
}

main().catch((e) => {
  console.error(e && e.stack || e);
  process.exitCode = 1;
});
