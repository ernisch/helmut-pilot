"use strict";

// Offline-Test der Restore-Übung (scripts/restore-drill.js): erzeugt ein
// Fixture-Backup (synthetische Daten, KEINE echten), fuehrt den Drill im
// --local-Modus aus und prueft Protokoll, Vollstaendigkeit, Zeitmessung und
// die harten Sicherheitsverweigerungen (Quelle=Ziel, fehlendes Ziel).

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

function runDrill(args, env = {}) {
  return spawnSync(process.execPath, [path.join(__dirname, "restore-drill.js"), ...args], {
    encoding: "utf8",
    timeout: 60000,
    env: { ...process.env, ...env }
  });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-restore-drill-"));
const backupDir = path.join(tmp, "backup");
const targetDir = path.join(tmp, "ziel");
fs.mkdirSync(backupDir, { recursive: true });

// Fixture-Backup: 3 Tabellen + Manifest (Format wie backup-export.js).
const fixtures = {
  helmut_store: [{ id: "main", data: { profiles: {} } }, { id: "main-auth", data: { users: [] } }],
  profiles: [{ id: "test-profil", full_name: "Test Person" }],
  briefings: [{ id: "b1", profile_id: "test-profil" }, { id: "b2", profile_id: "test-profil" }]
};
const manifest = { erstellt: new Date().toISOString(), quelle: "testquelle", tabellen: {}, fehler: [] };
for (const [table, rows] of Object.entries(fixtures)) {
  fs.writeFileSync(path.join(backupDir, `${table}.json`), JSON.stringify(rows));
  manifest.tabellen[table] = rows.length;
}
fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log("== 1) Lokaler Drill: Erfolg + Protokoll ==");
{
  const res = runDrill(["--backup", backupDir, "--local", targetDir]);
  check("Exit-Code 0", res.status === 0, (res.stdout || "") + (res.stderr || ""));
  const protokollPath = path.join(targetDir, "drill-protokoll.json");
  check("Protokoll JSON existiert", fs.existsSync(protokollPath));
  const protokoll = JSON.parse(fs.readFileSync(protokollPath, "utf8"));
  check("alle 3 Tabellen wiederhergestellt", Object.keys(protokoll.tabellen).length === 3);
  check("Zeilenzahlen validiert", protokoll.tabellen.briefings.zeilen === 2 && protokoll.tabellen.briefings.wiederhergestellt === 2);
  check("Zeitmessung vorhanden", typeof protokoll.dauerSekunden === "number" && typeof protokoll.tabellen.profiles.ms === "number");
  check("Erfolg protokolliert", protokoll.erfolg === true && protokoll.fehler.length === 0);
  check("Markdown-Protokoll existiert", fs.existsSync(path.join(targetDir, "drill-protokoll.md")));
  check("Zieldateien vorhanden", fs.existsSync(path.join(targetDir, "profiles.json")));
  check("nicht enthaltene Tabellen als uebersprungen ausgewiesen", protokoll.uebersprungen.includes("raw_documents"));
}

console.log("== 2) Manipuliertes Backup (Zeilenzahl != Manifest) -> Fehler ==");
{
  const brokenDir = path.join(tmp, "backup-broken");
  fs.mkdirSync(brokenDir, { recursive: true });
  fs.writeFileSync(path.join(brokenDir, "profiles.json"), JSON.stringify([]));
  fs.writeFileSync(path.join(brokenDir, "manifest.json"), JSON.stringify({ quelle: "x", tabellen: { profiles: 5 } }));
  const res = runDrill(["--backup", brokenDir, "--local", path.join(tmp, "ziel2")]);
  check("Exit-Code != 0 bei beschaedigtem Backup", res.status === 1);
  check("Fehler nennt das Manifest", /Manifest/.test(res.stderr || res.stdout || ""));
}

console.log("== 3) Sicherheitsverweigerungen ==");
{
  const noTarget = runDrill(["--backup", backupDir]);
  check("ohne Ziel: verweigert", noTarget.status === 2 && /Ziel fehlt/.test(noTarget.stderr || ""));

  const sourceAsTarget = runDrill(
    ["--backup", backupDir, "--target-url", "https://testquelle.supabase.co"],
    { TARGET_SUPABASE_SERVICE_ROLE_KEY: "dummy" }
  );
  check("Ziel = Backup-Quelle: verweigert", sourceAsTarget.status === 2 && /QUELLE des Backups/.test(sourceAsTarget.stderr || ""));

  const prodAsTarget = runDrill(
    ["--backup", backupDir, "--target-url", "https://prodprojekt.supabase.co"],
    { SUPABASE_URL: "https://prodprojekt.supabase.co", TARGET_SUPABASE_SERVICE_ROLE_KEY: "dummy" }
  );
  check("Ziel = SUPABASE_URL (Production): verweigert", prodAsTarget.status === 2 && /Production/.test(prodAsTarget.stderr || ""));

  const noKey = runDrill(["--backup", backupDir, "--target-url", "https://anderes-projekt.supabase.co"], { TARGET_SUPABASE_SERVICE_ROLE_KEY: "" });
  check("Remote-Ziel ohne Ziel-Key: verweigert", noKey.status === 2 && /TARGET_SUPABASE_SERVICE_ROLE_KEY/.test(noKey.stderr || ""));

  const fehltBackup = runDrill(["--backup", path.join(tmp, "gibt-es-nicht"), "--local", path.join(tmp, "ziel3")]);
  check("fehlendes Backup-Verzeichnis: verweigert", fehltBackup.status === 2);
}

// Testdaten der Uebung loeschen (Teil des Drill-Ablaufs).
fs.rmSync(tmp, { recursive: true, force: true });
check("Testdaten geloescht", !fs.existsSync(tmp));

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
