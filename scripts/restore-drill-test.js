"use strict";

// Offline-Test der Restore-Übung (scripts/restore-drill.js): erzeugt ein
// Fixture-Backup (synthetische Daten, KEINE echten), fuehrt den Drill im
// --local-Modus aus und prueft Protokoll, Vollstaendigkeit, Zeitmessung und
// die harten Sicherheitsverweigerungen (Quelle=Ziel, Production-Ziel inkl.
// http/https-/Gross-Klein-/Slash-Varianten, Production-Key, fehlende quelle,
// fehlendes Ziel). Zusaetzlich strukturell: RESTORE_ORDER muss FK-sicher sein
// (Eltern vor Kindern fuer jedes bekannte FK-Paar) und deckungsgleich mit den
// exportierten Tabellen aus backup-export.js (inkl. llm_budget_counters).

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { RESTORE_ORDER } = require("./restore-drill.js");
const { TABLES } = require("./backup-export.js");

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

console.log("== 0) Struktur: FK-sichere Reihenfolge + Tabellenabdeckung ==");
{
  // Bekannte FK-Paare [Eltern, Kind] aus supabase/schema.sql und
  // supabase/migrations/ (20260713_source_architecture.sql,
  // 20260715_dedup_findings.sql). Eltern MUESSEN in RESTORE_ORDER vor
  // ihren Kindern stehen, sonst scheitert der Remote-Drill mit FK-Fehlern.
  const FK_PAARE = [
    // Quellenarchitektur (20260713_source_architecture.sql)
    ["geographies", "electoral_districts"],
    ["geographies", "political_entities"],
    ["geographies", "source_packages"],
    ["geographies", "path_expected_geographies"],
    ["political_entities", "publishers"],
    ["political_entities", "path_expected_entities"],
    ["publishers", "retrieval_paths"],
    ["retrieval_paths", "package_paths"],
    ["source_packages", "package_paths"],
    ["retrieval_paths", "path_expected_levels"],
    ["retrieval_paths", "path_expected_geographies"],
    ["retrieval_paths", "path_expected_topics"],
    ["retrieval_paths", "path_expected_entities"],
    // Kern-Schema (supabase/schema.sql)
    ["profiles", "mandate_profiles"],
    ["profiles", "political_items"],
    ["profiles", "personalized_recommendations"],
    ["profiles", "daily_tasks"],
    ["profiles", "communication_drafts"],
    ["profiles", "user_notes"],
    ["profiles", "priority_changes"],
    ["profiles", "briefings"],
    ["profiles", "matching_weights"],
    ["profiles", "profile_embeddings"],
    ["profiles", "matching_results"],
    ["profiles", "decisions"],
    ["profiles", "topic_memory"],
    ["profiles", "interactions"],
    ["profiles", "office_outputs"],
    ["political_items", "personalized_recommendations"],
    ["political_items", "user_notes"],
    ["personalized_recommendations", "daily_tasks"],
    ["personalized_recommendations", "communication_drafts"],
    ["personalized_recommendations", "user_notes"],
    ["personalized_recommendations", "priority_changes"],
    // V3 (schema.sql) + Dedup (20260715_dedup_findings.sql)
    ["raw_documents", "ko_document_links"],
    ["knowledge_objects", "ko_document_links"],
    ["knowledge_objects", "ko_relations"],
    ["raw_documents", "document_findings"],
    ["knowledge_objects", "decisions"],
    ["knowledge_objects", "matching_results"],
    ["knowledge_objects", "topic_memory"],
    ["knowledge_objects", "interactions"],
    ["knowledge_objects", "office_outputs"],
    ["decisions", "interactions"],
    ["decisions", "office_outputs"]
  ];
  const idx = new Map(RESTORE_ORDER.map((t, i) => [t, i]));
  const verletzt = FK_PAARE.filter(([eltern, kind]) => {
    return !idx.has(eltern) || !idx.has(kind) || idx.get(eltern) >= idx.get(kind);
  });
  check(
    `RESTORE_ORDER ist FK-sicher (alle ${FK_PAARE.length} bekannten FK-Paare: Eltern vor Kind)`,
    verletzt.length === 0,
    verletzt.map(([e, k]) => `${e} muss vor ${k}`).join("; ")
  );
  check("keine Duplikate in RESTORE_ORDER", new Set(RESTORE_ORDER).size === RESTORE_ORDER.length);

  const exportTabellen = Object.keys(TABLES);
  check("llm_budget_counters wird exportiert (backup-export TABLES)", exportTabellen.includes("llm_budget_counters"));
  check("llm_budget_counters wird wiederhergestellt (RESTORE_ORDER)", RESTORE_ORDER.includes("llm_budget_counters"));
  const nurExport = exportTabellen.filter((t) => !RESTORE_ORDER.includes(t));
  const nurRestore = RESTORE_ORDER.filter((t) => !exportTabellen.includes(t));
  check(
    "Export- und Restore-Tabellen sind deckungsgleich",
    nurExport.length === 0 && nurRestore.length === 0,
    `nur Export: [${nurExport}] nur Restore: [${nurRestore}]`
  );
  check("jede exportierte Tabelle hat einen order=-Primaerschluessel", exportTabellen.every((t) => typeof TABLES[t] === "string" && TABLES[t].length > 0));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-restore-drill-"));
const backupDir = path.join(tmp, "backup");
const targetDir = path.join(tmp, "ziel");
fs.mkdirSync(backupDir, { recursive: true });

// Fixture-Backup: 4 Tabellen + Manifest (Format wie backup-export.js).
// geographies absichtlich Kind-vor-Eltern, um die Eltern-zuerst-Sortierung
// (selbstreferenzielles parent_id) zu pruefen.
const fixtures = {
  helmut_store: [{ id: "main", data: { profiles: {} } }, { id: "main-auth", data: { users: [] } }],
  profiles: [{ id: "test-profil", full_name: "Test Person" }],
  briefings: [{ id: "b1", profile_id: "test-profil" }, { id: "b2", profile_id: "test-profil" }],
  geographies: [
    { id: "geo-land-berlin", level: "land", name: "Berlin", parent_id: "geo-bund" },
    { id: "geo-bezirk-mitte", level: "bezirk", name: "Mitte", parent_id: "geo-land-berlin" },
    { id: "geo-bund", level: "bund", name: "Deutschland", parent_id: null }
  ]
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
  check("alle 4 Tabellen wiederhergestellt", Object.keys(protokoll.tabellen).length === 4);
  check("Zeilenzahlen validiert", protokoll.tabellen.briefings.zeilen === 2 && protokoll.tabellen.briefings.wiederhergestellt === 2);
  check("Zeitmessung vorhanden", typeof protokoll.dauerSekunden === "number" && typeof protokoll.tabellen.profiles.ms === "number");
  check("Erfolg protokolliert", protokoll.erfolg === true && protokoll.fehler.length === 0);
  check("Markdown-Protokoll existiert", fs.existsSync(path.join(targetDir, "drill-protokoll.md")));
  check("Zieldateien vorhanden", fs.existsSync(path.join(targetDir, "profiles.json")));
  check("nicht enthaltene Tabellen als uebersprungen ausgewiesen", protokoll.uebersprungen.includes("raw_documents"));

  // Selbstreferenzielle Tabelle: Eltern muessen VOR ihren Kindern stehen
  // (geographies.parent_id), sonst scheitern Remote-Batches > 500 Zeilen.
  const geo = JSON.parse(fs.readFileSync(path.join(targetDir, "geographies.json"), "utf8"));
  const pos = (id) => geo.findIndex((r) => r.id === id);
  check(
    "geographies Eltern-zuerst sortiert (bund < land < bezirk)",
    pos("geo-bund") < pos("geo-land-berlin") && pos("geo-land-berlin") < pos("geo-bezirk-mitte"),
    JSON.stringify(geo.map((r) => r.id))
  );
  check("geographies vollstaendig trotz Sortierung", geo.length === 3);
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

  // Varianten-Haertung: http statt https, Grossschreibung, trailing Slash.
  const sourceVariant = runDrill(
    ["--backup", backupDir, "--target-url", "http://TESTQUELLE.supabase.co/"],
    { TARGET_SUPABASE_SERVICE_ROLE_KEY: "dummy" }
  );
  check("Ziel = Quelle in http/Gross/Slash-Variante: verweigert", sourceVariant.status === 2 && /QUELLE des Backups/.test(sourceVariant.stderr || ""));

  const prodAsTarget = runDrill(
    ["--backup", backupDir, "--target-url", "https://prodprojekt.supabase.co"],
    { SUPABASE_URL: "https://prodprojekt.supabase.co", TARGET_SUPABASE_SERVICE_ROLE_KEY: "dummy" }
  );
  check("Ziel = SUPABASE_URL (Production): verweigert", prodAsTarget.status === 2 && /Production/.test(prodAsTarget.stderr || ""));

  // Varianten-Haertung: Ziel in anderer Schreibweise als SUPABASE_URL.
  const prodVariant = runDrill(
    ["--backup", backupDir, "--target-url", "http://ProdProjekt.supabase.co/"],
    { SUPABASE_URL: "https://prodprojekt.supabase.co/", TARGET_SUPABASE_SERVICE_ROLE_KEY: "dummy" }
  );
  check("Ziel = Production in http/Gross/Slash-Variante: verweigert", prodVariant.status === 2 && /Production/.test(prodVariant.stderr || ""));

  const noKey = runDrill(["--backup", backupDir, "--target-url", "https://anderes-projekt.supabase.co"], { TARGET_SUPABASE_SERVICE_ROLE_KEY: "" });
  check("Remote-Ziel ohne Ziel-Key: verweigert", noKey.status === 2 && /TARGET_SUPABASE_SERVICE_ROLE_KEY/.test(noKey.stderr || ""));

  // Ziel-Key = Production-Key: verweigert (auch bei fremder Ziel-URL).
  const prodKeyReuse = runDrill(
    ["--backup", backupDir, "--target-url", "https://anderes-projekt.supabase.co"],
    { SUPABASE_URL: "https://prodprojekt.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "prod-geheim", TARGET_SUPABASE_SERVICE_ROLE_KEY: "prod-geheim" }
  );
  check("Ziel-Key = Production-Key: verweigert", prodKeyReuse.status === 2 && /identisch/.test(prodKeyReuse.stderr || ""));

  // Manifest ohne quelle-Feld: Herkunft unklar -> Remote konservativ verweigert.
  const noQuelleDir = path.join(tmp, "backup-ohne-quelle");
  fs.mkdirSync(noQuelleDir, { recursive: true });
  fs.writeFileSync(path.join(noQuelleDir, "profiles.json"), JSON.stringify([{ id: "p1" }]));
  fs.writeFileSync(path.join(noQuelleDir, "manifest.json"), JSON.stringify({ tabellen: { profiles: 1 } }));
  const noQuelle = runDrill(
    ["--backup", noQuelleDir, "--target-url", "https://anderes-projekt.supabase.co"],
    { TARGET_SUPABASE_SERVICE_ROLE_KEY: "dummy" }
  );
  check("Manifest ohne quelle: Remote verweigert", noQuelle.status === 2 && /quelle fehlt/.test(noQuelle.stderr || ""));

  const fehltBackup = runDrill(["--backup", path.join(tmp, "gibt-es-nicht"), "--local", path.join(tmp, "ziel3")]);
  check("fehlendes Backup-Verzeichnis: verweigert", fehltBackup.status === 2);
}

// Testdaten der Uebung loeschen (Teil des Drill-Ablaufs).
fs.rmSync(tmp, { recursive: true, force: true });
check("Testdaten geloescht", !fs.existsSync(tmp));

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
