"use strict";

// Offline-Test des Backup-Dateidrills (scripts/restore-drill.js): erzeugt ein
// Fixture-Backup (synthetische Daten, KEINE echten), fuehrt die byteidentische
// --local-Kopie aus und prueft Protokoll, Vollstaendigkeit, Zeitmessung und
// die harten Sicherheitsverweigerungen (Quelle=Ziel, Production-Ziel inkl.
// http/https-/Gross-Klein-/Slash-Varianten, Production-Key, fehlende quelle,
// fehlendes Ziel). Zusaetzlich strukturell: RESTORE_ORDER muss FK-sicher sein
// (Eltern vor Kindern fuer jedes bekannte FK-Paar) und deckungsgleich mit den
// exportierten Tabellen aus backup-export.js (inkl. llm_budget_counters).

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const { RESTORE_ORDER, pruefeManifestInventar, pruefeRemoteRestoreVertrag, pruefeBackupDateien } = require("./restore-drill.js");
const { TABLES } = require("./backup-export.js");
const { fordereGueltigesInventar, berechneBackupManifestPruefsumme } = require("./backup-table-inventory.js");
const AKTUELLES_INVENTAR = fordereGueltigesInventar(path.join(__dirname, ".."));

// Die gesamte Suite arbeitet ausschliesslich mit weiter unten erzeugten
// Loopback-Fixtures. Auch direkte Vertragspruefungen im Elternprozess muessen
// diese Simulation explizit benennen; Production-Code setzt den Marker nie.
process.env.HELMUT_SCHUTZ_SIMULIERTE_UMGEBUNG = "ja";

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

function runDrill(args, env = {}) {
  return spawnSync(process.execPath, [path.join(__dirname, "restore-drill.js"), ...args], {
    encoding: "utf8",
    timeout: 60000,
    // Jede Quelle dieser Suite ist ein im Temp-Verzeichnis erzeugtes
    // Loopback-Fixture. Der Laufzeitvertrag verlangt dafuer bewusst den
    // expliziten Simulationsmarker; ohne ihn wuerde die Suite am richtigen
    // Produktionsriegel statt an ihrem jeweiligen Gegenbeispiel abbrechen.
    env: {
      ...process.env,
      HELMUT_SCHUTZ_SIMULIERTE_UMGEBUNG: "ja",
      ...env
    }
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
    ["decisions", "office_outputs"],
    // Spaetere angewandte Migrationen
    ["knowledge_objects", "knowledge_object_embeddings"],
    ["profiles", "matching_runs"],
    ["matching_runs", "matching_results"],
    ["helmut_jobs", "helmut_job_outbox"]
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
  check("llm_budget_counters hat einen Platz im lokalen SQL-RESTORE_ORDER", RESTORE_ORDER.includes("llm_budget_counters"));
  const nurExport = exportTabellen.filter((t) => !RESTORE_ORDER.includes(t));
  const nurRestore = RESTORE_ORDER.filter((t) => !exportTabellen.includes(t));
  check(
    "Export- und Restore-Tabellen sind deckungsgleich",
    nurExport.length === 0 && nurRestore.length === 0,
    `nur Export: [${nurExport}] nur Restore: [${nurRestore}]`
  );
  check("jede exportierte Tabelle hat einen order=-Primaerschluessel", exportTabellen.every((t) => typeof TABLES[t] === "string" && TABLES[t].length > 0));
  check("knowledge_objects steht vor einer moeglicherweise hoeher gefenceten aktiven CAS-Reservierung",
    RESTORE_ORDER.indexOf("knowledge_objects") < RESTORE_ORDER.indexOf("helmut_verstehen_reservierungen"));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-restore-drill-"));
const backupDir = path.join(tmp, "backup");
const targetDir = path.join(tmp, "ziel");
// Fixture-Backup: alle produktiven Tabellen + Manifest (Format wie
// backup-export.js). Die sicherheitskritischen August-Tabellen tragen
// representative synthetische Zeilen; alle uebrigen duerfen leer sein.
// geographies absichtlich Kind-vor-Eltern, um die Eltern-zuerst-Sortierung
// (selbstreferenzielles parent_id) zu pruefen.
const fixtures = Object.fromEntries(Object.keys(TABLES).map((t) => [t, []]));
Object.assign(fixtures, {
  helmut_store: [{ id: "main", data: { profiles: {} } }, { id: "main-auth", data: { users: [] } }],
  profiles: [{ id: "test-profil", full_name: "Test Person" }],
  briefings: [{ id: "b1", profile_id: "test-profil" }, { id: "b2", profile_id: "test-profil" }],
  geographies: [
    { id: "geo-land-berlin", level: "land", name: "Berlin", parent_id: "geo-bund" },
    { id: "geo-bezirk-mitte", level: "bezirk", name: "Mitte", parent_id: "geo-land-berlin" },
    { id: "geo-bund", level: "bund", name: "Deutschland", parent_id: null }
  ],
  knowledge_objects: [{ id: "ko-1", vorgang_id: "v-1", verstehen_fencing: 3 }],
  knowledge_object_embeddings: [{ knowledge_object_id: "ko-1", embedding_kind: "semantic_text", model: "test", dim: 3, recipe_version: "r1" }],
  matching_runs: [{ id: "match-1", user_id: "test-profil", status: "vollstaendig" }],
  matching_results: [{ id: "result-1", user_id: "test-profil", run_id: "match-1" }],
  helmut_jobs: [{ id: "job-1", status: "laeuft", lease_owner: "worker-1", lease_expires_at: "2026-08-28T01:00:00Z" }],
  helmut_job_outbox: [{ id: "outbox-1", job_id: "job-1", status: "offen" }],
  llm_reservations: [{ result_key: "llm-1", status: "reserviert", job_id: "job-1" }],
  helmut_klassen_anker: [{ klasse: "verstehen" }],
  helmut_klassen_slots: [{ id: "slot-1", klasse: "verstehen", owner: "worker-1" }],
  helmut_anbieter_fenster: [{ schluessel: "azure", fensterart: "tag", fenster_start: "2026-08-28T00:00:00Z", verbraucht: 1 }],
  helmut_anbieter_schutzschalter: [{ schluessel: "azure", zustand: "zu" }],
  helmut_verstehen_reservierungen: [{ vorgang_id: "v-1", fencing: 4, zustand: "laeuft" }],
  helmut_verstehen_vormerkungen: [{ vorgang_id: "v-1", fehlversuche: 1 }]
});

function schreibeVollBackup(dir, daten = fixtures) {
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {
    backupVertrag: 3,
    art: "voll",
    erstellt: new Date().toISOString(),
    mainCommit: "a".repeat(40),
    arbeitsbaum: { sauber: true },
    quelle: "127",
    quelleHost: "127.0.0.1:54321",
    produktionsKatalogQuelle: AKTUELLES_INVENTAR.production.referenz.quelle,
    simulation: { aktiv: true, grund: "isolierter-lokaler-test" },
    inventar: {
      schemaTabellen: 52,
      exportTabellen: 51,
      ausgenommen: ["crawl_runs"],
      hash: AKTUELLES_INVENTAR.production.inventarHash,
      migrationsmanifest: AKTUELLES_INVENTAR.production.manifest.id,
      migrationsHistoryPruefsumme: AKTUELLES_INVENTAR.production.manifest.historyPruefsumme,
      migrationsPruefsumme: AKTUELLES_INVENTAR.production.manifest.repoSqlPruefsumme,
      katalogPruefsumme: AKTUELLES_INVENTAR.production.katalogPruefsumme,
      katalogErhoben: AKTUELLES_INVENTAR.production.referenz.erhoben,
      spaltenKatalogPruefsumme: null
    },
    konsistenz: {
      art: "sequenzieller-rest-export",
      transaktional: false,
      schreibstoppBestaetigt: false,
      quersummenBestaetigt: false,
      vollRueckwegBelegt: false
    },
    tabellen: {},
    pruefsummen: {},
    fehler: [],
    vollstaendig: true
  };
  for (const table of Object.keys(TABLES)) {
    const rows = daten[table] || [];
    const json = JSON.stringify(rows);
    fs.writeFileSync(path.join(dir, `${table}.json`), json);
    manifest.tabellen[table] = rows.length;
    manifest.pruefsummen[table] = crypto.createHash("sha256").update(json).digest("hex");
  }
  manifest.pruefsummeGesamt = crypto.createHash("sha256").update(JSON.stringify(manifest.pruefsummen)).digest("hex");
  manifest.manifestPruefsumme = berechneBackupManifestPruefsumme(manifest);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
const manifest = schreibeVollBackup(backupDir);

console.log("== 1) Lokaler Drill: Erfolg + Protokoll ==");
{
  const res = runDrill(["--backup", backupDir, "--local", targetDir]);
  check("Exit-Code 0", res.status === 0, (res.stdout || "") + (res.stderr || ""));
  const protokollPath = path.join(targetDir, "dateidrill", "drill-protokoll.json");
  check("Protokoll JSON existiert", fs.existsSync(protokollPath));
  const protokoll = JSON.parse(fs.readFileSync(protokollPath, "utf8"));
  check(`alle ${Object.keys(TABLES).length} produktiven Tabellendateien kopiert`,
    Object.keys(protokoll.tabellen).length === Object.keys(TABLES).length);
  check("Zeilenzahlen validiert", protokoll.tabellen.briefings.zeilen === 2 && protokoll.tabellen.briefings.kopiert === 2
    && !("wiederhergestellt" in protokoll.tabellen.briefings));
  check("Zeitmessung vorhanden", typeof protokoll.dauerSekunden === "number" && typeof protokoll.tabellen.profiles.ms === "number");
  check("Erfolg protokolliert", protokoll.erfolg === true && protokoll.fehler.length === 0);
  check("Markdown-Protokoll existiert", fs.existsSync(path.join(targetDir, "dateidrill", "drill-protokoll.md")));
  check("Zieldateien vorhanden", fs.existsSync(path.join(targetDir, "profiles.json")));
  check("Manifest wird byteidentisch mitkopiert",
    fs.readFileSync(path.join(targetDir, "manifest.json")).equals(fs.readFileSync(path.join(backupDir, "manifest.json"))));
  check("Voll-Backup ueberspringt keine Tabelle", protokoll.uebersprungen.length === 0);
  check("Queue, Outbox und KI-Reservierung sind mit ihren Zeilen vorhanden",
    JSON.parse(fs.readFileSync(path.join(targetDir, "helmut_jobs.json"), "utf8")).length === 1
      && JSON.parse(fs.readFileSync(path.join(targetDir, "helmut_job_outbox.json"), "utf8"))[0].job_id === "job-1"
      && JSON.parse(fs.readFileSync(path.join(targetDir, "llm_reservations.json"), "utf8"))[0].result_key === "llm-1");
  check("CAS-, Klassen- und Anbieterzustand ist mit seinen Zeilen vorhanden",
    JSON.parse(fs.readFileSync(path.join(targetDir, "helmut_verstehen_reservierungen.json"), "utf8"))[0].fencing === 4
      && JSON.parse(fs.readFileSync(path.join(targetDir, "helmut_klassen_slots.json"), "utf8"))[0].owner === "worker-1"
      && JSON.parse(fs.readFileSync(path.join(targetDir, "helmut_anbieter_fenster.json"), "utf8"))[0].verbraucht === 1);

  check("Dateikopie bleibt byte-identisch zur kryptografisch geprueften Quelle",
    fs.readFileSync(path.join(targetDir, "geographies.json")).equals(fs.readFileSync(path.join(backupDir, "geographies.json"))));
  check("Protokoll bezeichnet den Lauf ausdruecklich nicht als Datenbank-Restore",
    protokoll.modus === "datei-kopie-kein-datenbank-restore"
      && /kein Datenbank-Restore/.test(fs.readFileSync(path.join(targetDir, "dateidrill", "drill-protokoll.md"), "utf8")));
  const kopieManifest = JSON.parse(fs.readFileSync(path.join(targetDir, "manifest.json"), "utf8"));
  const kopieVertrag = pruefeManifestInventar(kopieManifest, AKTUELLES_INVENTAR);
  check("erzeugte Backup-Kopie ist mit ihrem eigenen Vertrag erneut vollstaendig validierbar",
    kopieVertrag.ok && pruefeBackupDateien(targetDir, kopieManifest, kopieVertrag.erwartet).length === 0,
    kopieVertrag.fehler.join(" | "));
}

console.log("== 2) Manipuliertes Backup (Zeilenzahl != Manifest) -> Fehler ==");
{
  const brokenDir = path.join(tmp, "backup-broken");
  const brokenManifest = schreibeVollBackup(brokenDir);
  fs.writeFileSync(path.join(brokenDir, "profiles.json"), JSON.stringify([]));
  brokenManifest.tabellen.profiles = 5;
  fs.writeFileSync(path.join(brokenDir, "manifest.json"), JSON.stringify(brokenManifest));
  const res = runDrill(["--backup", brokenDir, "--local", path.join(tmp, "ziel2")]);
  check("Exit-Code 2 vor jedem Restore bei beschaedigtem Backup", res.status === 2);
  check("Fehler nennt den kryptografischen Dateivertrag", /Pruefsumme|Dateivertrag/.test(res.stderr || res.stdout || ""));
}

console.log("== 3) Sicherheitsverweigerungen ==");
{
  const noTarget = runDrill(["--backup", backupDir]);
  check("ohne Ziel: verweigert", noTarget.status === 2 && /Ziel fehlt/.test(noTarget.stderr || ""));

  const sourceAsTarget = runDrill(
    ["--backup", backupDir, "--target-url", "https://testquelle.supabase.co"],
    { TARGET_SUPABASE_SERVICE_ROLE_KEY: "dummy" }
  );
  check("Remote-Ziel = Backup-Quelle: durch globale REST-Sperre verweigert", sourceAsTarget.status === 2 && /vollstaendig gesperrt/.test(sourceAsTarget.stderr || ""));

  // Varianten-Haertung: http statt https, Grossschreibung, trailing Slash.
  const sourceVariant = runDrill(
    ["--backup", backupDir, "--target-url", "http://TESTQUELLE.supabase.co/"],
    { TARGET_SUPABASE_SERVICE_ROLE_KEY: "dummy" }
  );
  check("Remote-Ziel in http/Gross/Slash-Variante: global verweigert", sourceVariant.status === 2 && /vollstaendig gesperrt/.test(sourceVariant.stderr || ""));

  const prodAsTarget = runDrill(
    ["--backup", backupDir, "--target-url", "https://prodprojekt.supabase.co"],
    { SUPABASE_URL: "https://prodprojekt.supabase.co", TARGET_SUPABASE_SERVICE_ROLE_KEY: "dummy" }
  );
  check("Remote-Production-Ziel: durch globale REST-Sperre verweigert", prodAsTarget.status === 2 && /vollstaendig gesperrt/.test(prodAsTarget.stderr || ""));

  // Varianten-Haertung: Ziel in anderer Schreibweise als SUPABASE_URL.
  const prodVariant = runDrill(
    ["--backup", backupDir, "--target-url", "http://ProdProjekt.supabase.co/"],
    { SUPABASE_URL: "https://prodprojekt.supabase.co/", TARGET_SUPABASE_SERVICE_ROLE_KEY: "dummy" }
  );
  check("Remote-Production-Variante: global verweigert", prodVariant.status === 2 && /vollstaendig gesperrt/.test(prodVariant.stderr || ""));

  const noKey = runDrill(["--backup", backupDir, "--target-url", "https://anderes-projekt.supabase.co"], { TARGET_SUPABASE_SERVICE_ROLE_KEY: "" });
  check("Remote-Ziel wird bereits vor Lesen/Verlangen eines Ziel-Keys verweigert",
    noKey.status === 2 && /vollstaendig gesperrt/.test(noKey.stderr || "") && !/Key fehlt/.test(noKey.stderr || ""));

  // Ziel-Key = Production-Key: verweigert (auch bei fremder Ziel-URL).
  const prodKeyReuse = runDrill(
    ["--backup", backupDir, "--target-url", "https://anderes-projekt.supabase.co"],
    { SUPABASE_URL: "https://prodprojekt.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "prod-geheim", TARGET_SUPABASE_SERVICE_ROLE_KEY: "prod-geheim" }
  );
  check("Remote-Ziel bleibt auch mit gesetzten Keys global gesperrt",
    prodKeyReuse.status === 2 && /vollstaendig gesperrt/.test(prodKeyReuse.stderr || ""));

  // Manifest ohne quelle-Feld: Herkunft unklar -> Remote konservativ verweigert.
  const noQuelleDir = path.join(tmp, "backup-ohne-quelle");
  const noQuelleManifest = schreibeVollBackup(noQuelleDir);
  delete noQuelleManifest.quelle;
  fs.writeFileSync(path.join(noQuelleDir, "manifest.json"), JSON.stringify(noQuelleManifest));
  const noQuelle = runDrill(
    ["--backup", noQuelleDir, "--target-url", "https://anderes-projekt.supabase.co"],
    { TARGET_SUPABASE_SERVICE_ROLE_KEY: "dummy" }
  );
  check("Manifest ohne quelle: Remote verweigert", noQuelle.status === 2 && /quelle fehlt/.test(noQuelle.stderr || ""));

  const remoteCas = runDrill(
    ["--backup", backupDir, "--target-url", "https://anderes-projekt.supabase.co"],
    { TARGET_SUPABASE_SERVICE_ROLE_KEY: "dummy" }
  );
  check("Jeder Voll-Restore ueber Remote REST wird vor jedem Netz-Write verweigert",
    remoteCas.status === 2 && /vollstaendig gesperrt/.test(remoteCas.stderr || ""));
  check("reiner Vertragscheck sperrt den Remote-Weg unabhaengig vom Tabellenumfang",
    !pruefeRemoteRestoreVertrag(manifest).ok);

  const fehltBackup = runDrill(["--backup", path.join(tmp, "gibt-es-nicht"), "--local", path.join(tmp, "ziel3")]);
  check("fehlendes Backup-Verzeichnis: verweigert", fehltBackup.status === 2);

  const gleich = runDrill(["--backup", backupDir, "--local", backupDir]);
  check("lokales Kopierziel = Backup-Quelle: verweigert", gleich.status === 2 && /identisch/.test(gleich.stderr || ""));
  const existiert = runDrill(["--backup", backupDir, "--local", targetDir]);
  check("existierendes lokales Kopierziel wird nie ueberschrieben", existiert.status === 2 && /existiert bereits/.test(existiert.stderr || ""));
  const verschachtelt = runDrill(["--backup", backupDir, "--local", path.join(backupDir, "kopie")]);
  check("lokales Kopierziel innerhalb der Backup-Quelle: verweigert", verschachtelt.status === 2 && /ineinander/.test(verschachtelt.stderr || ""));
  const alias = path.join(tmp, "backup-alias");
  fs.symlinkSync(backupDir, alias, "dir");
  const symlinkVerschachtelt = runDrill(["--backup", backupDir, "--local", path.join(alias, "kopie")]);
  check("Symlink-Alias kann die Quelle/Ziel-Verschachtelung nicht umgehen",
    symlinkVerschachtelt.status === 2 && /ineinander/.test(symlinkVerschachtelt.stderr || ""));
}

console.log("== 4) Manifest-Vollstaendigkeit ist fail closed ==");
{
  const alt40 = {
    art: "voll", vollstaendig: true, fehler: [],
    tabellen: Object.fromEntries(Object.keys(TABLES).slice(0, 40).map((t) => [t, 0]))
  };
  const alt = pruefeManifestInventar(alt40);
  check("historisches 40er-Manifest gilt heute nicht mehr als Voll-Backup",
    !alt.ok && alt.fehler.some((f) => /Tabellen fehlen/.test(f)));

  const mitUnbekannt = JSON.parse(JSON.stringify(manifest));
  mitUnbekannt.tabellen.neue_tabelle = 0;
  const unbekannt = pruefeManifestInventar(mitUnbekannt);
  check("unbekannte Manifesttabelle ohne Restore-Vertrag wird abgewiesen",
    !unbekannt.ok && unbekannt.fehler.some((f) => /ohne Restore-Vertrag/.test(f)));

  const ohneDateiDir = path.join(tmp, "backup-ohne-datei");
  schreibeVollBackup(ohneDateiDir);
  fs.unlinkSync(path.join(ohneDateiDir, "helmut_job_outbox.json"));
  const ohneDatei = runDrill(["--backup", ohneDateiDir, "--local", path.join(tmp, "ziel-ohne-datei")]);
  check("Manifesteintrag ohne Datei ergibt Fehler statt erfolgreichem Ueberspringen",
    ohneDatei.status === 2 && /Datei fehlt/.test((ohneDatei.stdout || "") + (ohneDatei.stderr || "")));

  const symlinkDateiDir = path.join(tmp, "backup-mit-tabellen-symlink");
  schreibeVollBackup(symlinkDateiDir);
  const profilesPfad = path.join(symlinkDateiDir, "profiles.json");
  const profilesAusserhalb = path.join(tmp, "profiles-ausserhalb.json");
  fs.copyFileSync(profilesPfad, profilesAusserhalb);
  fs.unlinkSync(profilesPfad);
  fs.symlinkSync(profilesAusserhalb, profilesPfad, "file");
  const symlinkDateiLauf = runDrill([
    "--backup", symlinkDateiDir, "--local", path.join(tmp, "ziel-tabellen-symlink")
  ]);
  check("symbolischer Link als Tabellendatei bleibt trotz passender Bytes fail closed",
    symlinkDateiLauf.status === 2 && /symbolischer Link/.test(symlinkDateiLauf.stderr || ""));

  const ohneCommitDir = path.join(tmp, "backup-ohne-commit");
  const ohneCommit = schreibeVollBackup(ohneCommitDir);
  delete ohneCommit.mainCommit;
  fs.writeFileSync(path.join(ohneCommitDir, "manifest.json"), JSON.stringify(ohneCommit));
  const ohneCommitLauf = runDrill(["--backup", ohneCommitDir, "--local", path.join(tmp, "ziel-ohne-commit")]);
  check("Manifest ohne Git-Commit wird abgewiesen",
    ohneCommitLauf.status === 2 && /mainCommit/.test(ohneCommitLauf.stderr || ""));

  const ohneChecksumsDir = path.join(tmp, "backup-ohne-checksums");
  const ohneChecksums = schreibeVollBackup(ohneChecksumsDir);
  delete ohneChecksums.pruefsummen.helmut_jobs;
  ohneChecksums.pruefsummeGesamt = crypto.createHash("sha256").update(JSON.stringify(ohneChecksums.pruefsummen)).digest("hex");
  fs.writeFileSync(path.join(ohneChecksumsDir, "manifest.json"), JSON.stringify(ohneChecksums));
  const ohneChecksumsLauf = runDrill(["--backup", ohneChecksumsDir, "--local", path.join(tmp, "ziel-ohne-checksums")]);
  check("fehlende Tabellenpruefsumme wird abgewiesen",
    ohneChecksumsLauf.status === 2 && /Pruefsummen fehlen/.test(ohneChecksumsLauf.stderr || ""));

  const falscheGesamtsummeDir = path.join(tmp, "backup-falsche-gesamtsumme");
  const falscheGesamtsumme = schreibeVollBackup(falscheGesamtsummeDir);
  falscheGesamtsumme.pruefsummeGesamt = "0".repeat(64);
  fs.writeFileSync(path.join(falscheGesamtsummeDir, "manifest.json"), JSON.stringify(falscheGesamtsumme));
  const falscheGesamtsummeLauf = runDrill(["--backup", falscheGesamtsummeDir, "--local", path.join(tmp, "ziel-falsche-gesamtsumme")]);
  check("falsche Gesamtpruefsumme wird abgewiesen",
    falscheGesamtsummeLauf.status === 2 && /pruefsummeGesamt passt nicht/.test(falscheGesamtsummeLauf.stderr || ""));

  const extraDateiDir = path.join(tmp, "backup-extra-datei");
  schreibeVollBackup(extraDateiDir);
  fs.writeFileSync(path.join(extraDateiDir, "stille_neue_tabelle.json"), "[]");
  const extraDateiLauf = runDrill(["--backup", extraDateiDir, "--local", path.join(tmp, "ziel-extra-datei")]);
  check("unerwartete JSON-Tabellendatei wird nicht still ignoriert",
    extraDateiLauf.status === 2 && /unerwartete JSON/.test(extraDateiLauf.stderr || ""));

  const quelleManipuliertDir = path.join(tmp, "backup-quelle-manipuliert");
  const quelleManipuliert = schreibeVollBackup(quelleManipuliertDir);
  quelleManipuliert.quelle = "umetikettiert";
  fs.writeFileSync(path.join(quelleManipuliertDir, "manifest.json"), JSON.stringify(quelleManipuliert));
  const quelleManipuliertLauf = runDrill(["--backup", quelleManipuliertDir, "--local", path.join(tmp, "ziel-quelle-manipuliert")]);
  check("nachtraeglich umetikettierte Quelle verletzt den Gesamtmanifestvertrag",
    quelleManipuliertLauf.status === 2 && /quelle passt nicht|manifestPruefsumme passt nicht/.test(quelleManipuliertLauf.stderr || ""));

  const fremdProjektDir = path.join(tmp, "backup-fremdprojekt");
  const fremdProjekt = schreibeVollBackup(fremdProjektDir);
  fremdProjekt.quelle = "aaaaaaaaaaaaaaaaaaaa";
  fremdProjekt.quelleHost = "aaaaaaaaaaaaaaaaaaaa.supabase.co";
  fremdProjekt.simulation = { aktiv: false, grund: null };
  fremdProjekt.manifestPruefsumme = berechneBackupManifestPruefsumme(fremdProjekt);
  fs.writeFileSync(path.join(fremdProjektDir, "manifest.json"), JSON.stringify(fremdProjekt));
  const fremdProjektLauf = runDrill(["--backup", fremdProjektDir, "--local", path.join(tmp, "ziel-fremdprojekt")]);
  check("kryptografisch konsistentes Fremdprojekt mit identischem Schema bleibt gegen Production-Katalog rot",
    fremdProjektLauf.status === 2 && /nicht exakt das Projekt/.test(fremdProjektLauf.stderr || ""));

  for (const [name, suffix] of [["pfad", "/beliebig"], ["fragment", "#@evil.invalid"]]) {
    const hostDir = path.join(tmp, `backup-production-host-${name}`);
    const hostManifest = schreibeVollBackup(hostDir);
    hostManifest.quelle = AKTUELLES_INVENTAR.production.referenz.quelle;
    hostManifest.quelleHost = `${hostManifest.quelle}.supabase.co${suffix}`;
    hostManifest.simulation = { aktiv: false, grund: null };
    hostManifest.manifestPruefsumme = berechneBackupManifestPruefsumme(hostManifest);
    fs.writeFileSync(path.join(hostDir, "manifest.json"), JSON.stringify(hostManifest));
    const hostLauf = runDrill([
      "--backup", hostDir, "--local", path.join(tmp, `ziel-production-host-${name}`)
    ]);
    check(`Production-quelleHost mit ${name} bleibt trotz gueltiger Ref und neuem Manifesthash rot`,
      hostLauf.status === 2 && /nicht exakt das Projekt/.test(hostLauf.stderr || ""));
  }

  const fehlerObjektDir = path.join(tmp, "backup-fehler-als-objekt");
  const fehlerObjekt = schreibeVollBackup(fehlerObjektDir);
  fehlerObjekt.fehler = { verschwiegen: "Exportfehler" };
  fehlerObjekt.manifestPruefsumme = berechneBackupManifestPruefsumme(fehlerObjekt);
  fs.writeFileSync(path.join(fehlerObjektDir, "manifest.json"), JSON.stringify(fehlerObjekt));
  const fehlerObjektLauf = runDrill([
    "--backup", fehlerObjektDir, "--local", path.join(tmp, "ziel-fehler-als-objekt")
  ]);
  check("manifest.fehler als Objekt kann Exportfehler nicht verschweigen",
    fehlerObjektLauf.status === 2 && /manifest\.fehler muss ein Array/.test(fehlerObjektLauf.stderr || ""));

  const altInventarDir = path.join(tmp, "backup-altes-inventar");
  const altInventar = schreibeVollBackup(altInventarDir);
  altInventar.inventar.migrationsmanifest = "production-migrations-2026-08-27-20260823063208";
  altInventar.manifestPruefsumme = berechneBackupManifestPruefsumme(altInventar);
  fs.writeFileSync(path.join(altInventarDir, "manifest.json"), JSON.stringify(altInventar));
  const altInventarLauf = runDrill(["--backup", altInventarDir, "--local", path.join(tmp, "ziel-altes-inventar")]);
  check("kryptografisch neu berechnetes, aber veraltetes Migrationsmanifest bleibt rot",
    altInventarLauf.status === 2 && /migrationsmanifest passt nicht/.test(altInventarLauf.stderr || ""));

  const falschesGruenDir = path.join(tmp, "backup-falsches-konsistenz-gruen");
  const falschesGruen = schreibeVollBackup(falschesGruenDir);
  falschesGruen.konsistenz.vollRueckwegBelegt = true;
  falschesGruen.manifestPruefsumme = berechneBackupManifestPruefsumme(falschesGruen);
  fs.writeFileSync(path.join(falschesGruenDir, "manifest.json"), JSON.stringify(falschesGruen));
  const falschesGruenLauf = runDrill(["--backup", falschesGruenDir, "--local", path.join(tmp, "ziel-falsches-konsistenz-gruen")]);
  check("nichttransaktionaler Export kann nicht durch blosses Umetikettieren zum Voll-Rueckweg werden",
    falschesGruenLauf.status === 2 && /vollRueckwegBelegt passt nicht/.test(falschesGruenLauf.stderr || ""));

  const selbstAttestiertDir = path.join(tmp, "backup-selbst-attestiert");
  const selbstAttestiert = schreibeVollBackup(selbstAttestiertDir);
  selbstAttestiert.konsistenz = {
    art: "behaupteter-snapshot", transaktional: true,
    schreibstoppBestaetigt: false, quersummenBestaetigt: false,
    vollRueckwegBelegt: true
  };
  selbstAttestiert.manifestPruefsumme = berechneBackupManifestPruefsumme(selbstAttestiert);
  fs.writeFileSync(path.join(selbstAttestiertDir, "manifest.json"), JSON.stringify(selbstAttestiert));
  const selbstAttestiertLauf = runDrill(["--backup", selbstAttestiertDir, "--local", path.join(tmp, "ziel-selbst-attestiert")]);
  check("unkeyed SHA256 plus selbst gesetzte Snapshot-Booleans entsperren keinen Voll-Rueckweg",
    selbstAttestiertLauf.status === 2 && /kein vertrauenswuerdig attestierter Snapshot/.test(selbstAttestiertLauf.stderr || ""));
}

// Testdaten der Uebung loeschen (Teil des Drill-Ablaufs).
fs.rmSync(tmp, { recursive: true, force: true });
check("Testdaten geloescht", !fs.existsSync(tmp));

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
