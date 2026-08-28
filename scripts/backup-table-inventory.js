"use strict";

// Eine einzige, maschinenlesbare Wahrheit fuer Voll-Export und Restore.
//
// TABLES enthaelt ausschliesslich Tabellen, deren Migration laut dem
// dokumentierten Production-Stand angewendet ist. NICHT_PRODUKTIV enthaelt
// bekannte CREATE-TABLE-Migrationen, die bewusst noch nicht angewendet sind.
// Der migrationsbasierte Abgleich unten erzwingt, dass JEDE neue Tabelle in
// genau einer der beiden Mengen landet. backup-export.js prueft die bewusst
// ausgenommene Menge zusaetzlich ueber PostgREST: existiert eine solche Tabelle
// inzwischen doch, bricht der Export VOR dem Schreiben eines Backup-Ordners ab.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Diese beiden Werte sind bewusst AUSSERHALB der editierbaren JSON-Referenz
// verankert. Eine Referenz, in der lediglich 24 beliebige Policy-Namen, 20
// beliebige Trigger-Namen oder 62 beliebige Funktionsnamen stehen, darf nicht
// durch ihre selbst neu berechnete Pruefsumme wieder gruen werden. Der Hash
// bindet den vollstaendigen, am 2026-08-28 rein lesend erhobenen Katalogvertrag
// (Tabellen, Policies, Trigger, Funktionen, Identity-Spalten, RLS-Luecken,
// PostgreSQL-/pgvector-Version, Zeitpunkt und Projekt-Ref).
const ERWARTETE_PRODUKTIONS_QUELLE = "ddckuvvpcytqbyfmbvie";
const ERWARTETE_KATALOG_PRUEFSUMME = "2c359ed619735b435e77233a90a7154efc78fea2bb691896a161f0de0996fce0";
// Am 2026-08-28 wurde kein aktueller spaltengenauer Production-Abzug
// erhoben. `null` ist deshalb ein bewusster Sperrwert: Eine in der JSON-Datei
// selbst gesetzte und selbst gehashte Spaltenliste darf den Restore nicht
// entsperren. Erst nach einem neuen rein lesenden Production-Abzug wird hier
// dessen unabhaengig gepruefter SHA-256 fest eingetragen.
const ERWARTETE_SPALTENKATALOG_PRUEFSUMME = null;

// Tabelle -> Primaerschluessel-Spalten fuer stabile PostgREST-Paginierung und
// den spaeteren Mengenvergleich. Reihenfolge der Objektfelder ist unerheblich;
// RESTORE_ORDER unten ist die einzige Restore-Reihenfolge.
const TABLES = Object.freeze({
  helmut_store: "id",
  profiles: "id",
  mandate_profiles: "user_id",
  raw_documents: "id",
  knowledge_objects: "id",
  ko_document_links: "knowledge_object_id,raw_document_id",
  ko_relations: "from_ko_id,to_ko_id,relation_type",
  decisions: "id",
  briefings: "id",
  matching_results: "id",
  matching_weights: "user_id",
  profile_embeddings: "user_id",
  office_outputs: "id",
  topic_memory: "id",
  interactions: "id",
  user_notes: "id",
  daily_tasks: "id",
  communication_drafts: "id",
  political_items: "id",
  personalized_recommendations: "id",
  priority_changes: "id",
  llm_usage: "id",
  llm_budget_counters: "day,scope",
  pipeline_locks: "job_name",
  sources: "id",
  publishers: "id",
  retrieval_paths: "id",
  source_packages: "id",
  package_paths: "package_id,retrieval_path_id",
  political_entities: "id",
  geographies: "id",
  electoral_districts: "id",
  path_expected_levels: "retrieval_path_id,level",
  path_expected_geographies: "retrieval_path_id,geography_id",
  path_expected_topics: "retrieval_path_id,topic",
  path_expected_entities: "retrieval_path_id,entity_id",
  document_findings: "raw_document_id,source_id,original_url",
  gate_shadow_events: "id",
  source_crawl_telemetry: "id",
  process_runs: "run_id,process",

  // Bereits angewandte Juli-Migrationen, die in der alten 40er-Referenz fehlten.
  knowledge_object_embeddings: "knowledge_object_id,embedding_kind,model,dim,recipe_version",
  matching_runs: "id",

  // OP-30 / August: alle aktuell produktiven Queue-, Budget-, Klassen-,
  // Anbieter- und CAS-Tabellen.
  llm_reservations: "result_key",
  helmut_jobs: "id",
  helmut_job_outbox: "id",
  helmut_klassen_anker: "klasse",
  helmut_klassen_slots: "id",
  helmut_anbieter_fenster: "schluessel,fensterart,fenster_start",
  helmut_anbieter_schutzschalter: "schluessel",
  helmut_verstehen_reservierungen: "vorgang_id",
  helmut_verstehen_vormerkungen: "vorgang_id"
});

// Bekannte Definition, laut CURRENT_STATE.md in Production weiterhin NICHT
// angewendet. Der Export prueft ihre Abwesenheit jedes Mal rein lesend. Damit
// kann eine spaetere Anwendung nicht unbemerkt an der Sicherung vorbeilaufen.
const NICHT_PRODUKTIV = Object.freeze({
  crawl_runs: Object.freeze({
    primaerschluessel: "id",
    migration: "20260720_crawl_runs_relational.sql"
  })
});

// Genau die Tabellen, die die Quellen-Seeds beruehren. Reihenfolge FK-sicher.
const SEED_SCOPE_TABLES = Object.freeze([
  "geographies",
  "political_entities",
  "publishers",
  "retrieval_paths",
  "source_packages",
  "package_paths",
  "path_expected_levels",
  "path_expected_geographies"
]);

// Genau die beiden Profiltabellen. Eltern vor Kind.
const PROFIL_SCOPE_TABLES = Object.freeze([
  "profiles",
  "mandate_profiles"
]);

const SCOPES = Object.freeze({
  voll: null,
  seed: SEED_SCOPE_TABLES,
  profil: PROFIL_SCOPE_TABLES
});

// FK-sichere Wiederherstellungsreihenfolge. Neben echten Fremdschluesseln sind
// die OP-30-Betriebstabellen logisch Eltern-zuerst angeordnet. Insbesondere
// steht knowledge_objects VOR den CAS-Reservierungen: Eine legitime aktive
// Reservierung kann bereits Fencing 4 tragen, waehrend das zuletzt persistierte
// Wissensobjekt noch Fencing 3 traegt. Der isolierte SQL-Restore setzt fuer den
// KO-Import die transaktionslokale CAS-Markierung und spielt erst danach den
// aktuelleren Reservierungsstand ein.
const RESTORE_ORDER = Object.freeze([
  "helmut_store",
  "profiles", "mandate_profiles",
  "geographies", "electoral_districts", "political_entities",
  "publishers", "retrieval_paths", "source_packages", "package_paths",
  "path_expected_levels", "path_expected_geographies", "path_expected_topics", "path_expected_entities",
  "sources",

  "raw_documents", "knowledge_objects", "knowledge_object_embeddings",
  "ko_document_links", "ko_relations", "document_findings", "gate_shadow_events",

  "political_items", "personalized_recommendations",
  "decisions", "matching_runs",
  "briefings", "matching_weights", "matching_results", "profile_embeddings",
  "topic_memory", "interactions", "office_outputs",
  "daily_tasks", "communication_drafts", "user_notes", "priority_changes",

  "llm_usage", "pipeline_locks", "llm_budget_counters",
  "helmut_jobs", "helmut_job_outbox", "llm_reservations",
  "helmut_klassen_anker", "helmut_klassen_slots",
  "helmut_anbieter_fenster", "helmut_anbieter_schutzschalter",
  "helmut_verstehen_reservierungen", "helmut_verstehen_vormerkungen",
  "source_crawl_telemetry", "process_runs"
]);

function ohneSqlKommentare(sql) {
  return String(sql || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n\r]*/g, "");
}

// Findet jede CREATE TABLE-Anweisung. Nicht eindeutig als public.<name>
// erkennbare Definitionen werden als Fehler zurueckgegeben statt ignoriert.
function tabellenAusSql(sql, quelle = "(sql)") {
  const text = ohneSqlKommentare(sql);
  const tabellen = [];
  const fehler = [];
  const re = /\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)/gi;
  let treffer;
  while ((treffer = re.exec(text))) {
    const roh = String(treffer[1] || "").replace(/"/g, "");
    const m = /^public\.([a-z_][a-z0-9_]*)$/i.exec(roh);
    if (!m) {
      fehler.push(`${quelle}: CREATE TABLE ohne eindeutig qualifiziertes public.<name>: ${roh || "(leer)"}`);
      continue;
    }
    tabellen.push(m[1].toLowerCase());
  }
  return { tabellen, fehler };
}

function ermittleSchemaTabellen(repoRoot = path.join(__dirname, "..")) {
  const dateien = [path.join(repoRoot, "supabase", "schema.sql")];
  const migrationsDir = path.join(repoRoot, "supabase", "migrations");
  const migrationen = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql") && !/rollback/i.test(name))
    .sort()
    .map((name) => path.join(migrationsDir, name));
  dateien.push(...migrationen);

  const quellen = new Map();
  const fehler = [];
  for (const datei of dateien) {
    const relativ = path.relative(repoRoot, datei);
    const gelesen = tabellenAusSql(fs.readFileSync(datei, "utf8"), relativ);
    fehler.push(...gelesen.fehler);
    for (const tabelle of gelesen.tabellen) {
      if (!quellen.has(tabelle)) quellen.set(tabelle, []);
      quellen.get(tabelle).push(relativ);
    }
  }
  return { tabellen: Array.from(quellen.keys()).sort(), quellen, fehler };
}

function sha256(inhalt) {
  return crypto.createHash("sha256").update(inhalt).digest("hex");
}

function kanonisch(wert) {
  if (Array.isArray(wert)) return wert.map(kanonisch);
  if (wert && typeof wert === "object") {
    const out = {};
    for (const key of Object.keys(wert).sort()) out[key] = kanonisch(wert[key]);
    return out;
  }
  return wert;
}

function berechneKanonischePruefsumme(wert) {
  return sha256(JSON.stringify(kanonisch(wert)));
}

const VERLUSTFREIE_ZAHL = Symbol("helmut.verlustfreie-json-zahl");

function verlustfreierZahltext(wert) {
  return wert && typeof wert === "object" && typeof wert[VERLUSTFREIE_ZAHL] === "string"
    ? wert[VERLUSTFREIE_ZAHL]
    : null;
}

// JSON.parse rundet bigint/numeric bereits beim Einlesen. Fuer feldgenaue
// Vergleiche werden Zahlen deshalb als opake Lexem-Objekte erhalten; Strings
// koennen dank zufaelligem, im Eingabetext ausgeschlossenem Marker nicht mit
// ihnen kollidieren.
function parseJsonVerlustfrei(jsonText) {
  const text = String(jsonText);
  let marker;
  do { marker = `__HELMUT_ZAHL_${crypto.randomBytes(16).toString("hex")}__`; }
  while (text.includes(marker));

  let transformiert = "";
  for (let i = 0; i < text.length;) {
    if (text[i] === '"') {
      const start = i++;
      while (i < text.length) {
        if (text[i] === "\\") { i += 2; continue; }
        if (text[i] === '"') { i += 1; break; }
        i += 1;
      }
      transformiert += text.slice(start, i);
      continue;
    }
    if (text[i] === "-" || (text[i] >= "0" && text[i] <= "9")) {
      const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      if (m) {
        transformiert += JSON.stringify(marker + m[0]);
        i += m[0].length;
        continue;
      }
    }
    transformiert += text[i++];
  }
  return JSON.parse(transformiert, (_, wert) => {
    if (typeof wert === "string" && wert.startsWith(marker)) {
      return Object.freeze({ [VERLUSTFREIE_ZAHL]: wert.slice(marker.length) });
    }
    return wert;
  });
}

// Zerlegt ein JSON-Array in rohe Elementtexte, ohne Zahlen oder verschachtelte
// json/jsonb-Werte zu deserialisieren. JSON.parse dient nur der Syntax-/Array-
// Validierung; ausgegeben werden ausschliesslich unveraenderte Rohsegmente.
function zerlegeJsonArrayRoh(jsonText) {
  const text = String(jsonText).trim();
  const validiert = JSON.parse(text);
  if (!Array.isArray(validiert)) throw new Error("JSON-Wert ist kein Array");
  const innen = text.slice(1, -1);
  if (!innen.trim()) return [];
  const elemente = [];
  let start = 0;
  let tiefe = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < innen.length; i += 1) {
    const c = innen[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === "{" || c === "[") { tiefe += 1; continue; }
    if (c === "}" || c === "]") { tiefe -= 1; continue; }
    if (c === "," && tiefe === 0) {
      elemente.push(innen.slice(start, i).trim());
      start = i + 1;
    }
  }
  elemente.push(innen.slice(start).trim());
  return elemente;
}

// Bindet nicht nur die Tabellendateien, sondern den gesamten semantischen
// Manifestvertrag (Quelle, Commit, Inventar, Migrationsstand, Konsistenz,
// Zeilenzahlen und Dateihashes). Nur das Ergebnisfeld selbst wird ausgelassen.
function berechneBackupManifestPruefsumme(manifest) {
  const kopie = { ...(manifest || {}) };
  delete kopie.manifestPruefsumme;
  return berechneKanonischePruefsumme(kopie);
}

function vorwaertsMigrationen(repoRoot) {
  return fs.readdirSync(path.join(repoRoot, "supabase", "migrations"))
    .filter((name) => name.endsWith(".sql") && !/rollback/i.test(name))
    .sort();
}

// Bindet den Restore an den am 2026-08-28 rein lesend erhobenen Production-
// Katalog und die explizit belegte Supabase-Migrationshistorie. Der allgemeine
// CREATE-TABLE-Scan allein kann weder unversionierte Production-Tabellen noch
// den tatsaechlich angewendeten Stand beweisen; deshalb muessen Katalogmenge,
// angewendete Repo-Dateien, ausgeschlossene Vorwaertsdateien und beide
// kryptografischen Pruefsummen zusammenpassen.
function pruefeProduktionsMigrationsmanifest(
  repoRoot = path.join(__dirname, ".."),
  referenzPfad = path.join(repoRoot, "scripts", "produktions-strukturreferenz.json")
) {
  const fehler = [];
  let referenz;
  try {
    referenz = JSON.parse(fs.readFileSync(referenzPfad, "utf8"));
  } catch (error) {
    return { ok: false, fehler: [`Production-Strukturreferenz nicht lesbar: ${error.message}`] };
  }
  const manifest = referenz.migrationsmanifest || {};
  const history = manifest.productionHistory;
  const angewendet = manifest.repoStrukturMigrationen;
  const nichtAngewendet = manifest.nichtAngewendet;
  if (!/^production-migrations-\d{4}-\d{2}-\d{2}-\d{14}$/.test(String(manifest.id || ""))) {
    fehler.push("Migrationsmanifest-ID fehlt oder ist nicht versioniert");
  }
  if (!manifest.belegtAm || !Number.isFinite(Date.parse(manifest.belegtAm))) {
    fehler.push("Migrationsmanifest hat keinen gueltigen Belegzeitpunkt");
  }
  if (!Array.isArray(history) || history.length !== 33
      || history.some((x) => !Array.isArray(x) || x.length !== 2 || !/^\d{14}$/.test(String(x[0])) || !String(x[1] || "").trim())) {
    fehler.push("Production-Migrationshistorie ist nicht der belegte 33-Versionen-Vertrag");
  } else {
    const versionen = history.map((x) => x[0]);
    if (new Set(versionen).size !== versionen.length) fehler.push("Production-Migrationshistorie enthaelt doppelte Versionen");
    if (versionen[versionen.length - 1] !== manifest.letzteVersion) fehler.push("letzteVersion passt nicht zur Production-Historie");
    const historyPruefsumme = sha256(JSON.stringify(history));
    if (historyPruefsumme !== manifest.historyPruefsumme) fehler.push("Production-Migrationshistorie passt nicht zu historyPruefsumme");
  }
  if (!Array.isArray(angewendet) || angewendet.length !== 29 || new Set(angewendet).size !== 29) {
    fehler.push("Repo-Strukturmigrationsmenge ist nicht der belegte 29-Dateien-Vertrag");
  } else if (JSON.stringify(angewendet) !== JSON.stringify(angewendet.slice().sort())) {
    fehler.push("Repo-Strukturmigrationen sind nicht in der belegten chronologischen Dateireihenfolge");
  }
  if (!Array.isArray(nichtAngewendet) || nichtAngewendet.length !== 3 || new Set(nichtAngewendet).size !== 3) {
    fehler.push("Menge nicht angewendeter Vorwaertsmigrationen ist nicht der belegte 3-Dateien-Vertrag");
  } else {
    const zwingendAusgeschlossen = [
      "20260720_crawl_runs_relational.sql",
      "20260825101500_jobqueue_ankunftskennzahl.sql",
      "20260826190000_jobqueue_vorbedingung_mandatsfilter.sql"
    ];
    if (JSON.stringify(nichtAngewendet) !== JSON.stringify(zwingendAusgeschlossen)) {
      fehler.push("nichtAngewendet ist nicht exakt crawl_runs/F9/Z22 in belegter Reihenfolge");
    }
  }

  const repoMigrationen = vorwaertsMigrationen(repoRoot);
  const alleManifestiert = [...(angewendet || []), ...(nichtAngewendet || [])].sort();
  if (JSON.stringify(alleManifestiert) !== JSON.stringify(repoMigrationen)) {
    fehler.push("Vorwaertsmigrationen im Repo sind nicht exakt in angewendet/nichtAngewendet entschieden");
  }
  const ueberschneidung = (angewendet || []).filter((name) => (nichtAngewendet || []).includes(name));
  if (ueberschneidung.length) fehler.push(`Migrationen zugleich angewendet und ausgeschlossen: ${ueberschneidung.join(", ")}`);

  const dateiPruefsummen = {};
  for (const name of (angewendet || []).slice().sort()) {
    const datei = path.join(repoRoot, "supabase", "migrations", name);
    if (!fs.existsSync(datei)) {
      fehler.push(`belegte Production-Migration fehlt im Repo: ${name}`);
      continue;
    }
    dateiPruefsummen[name] = sha256(fs.readFileSync(datei));
  }
  const repoSqlPruefsumme = sha256(JSON.stringify(dateiPruefsummen));
  if (repoSqlPruefsumme !== manifest.repoSqlPruefsumme) {
    fehler.push("angewendete Repo-Migrationen passen nicht zu repoSqlPruefsumme");
  }

  const katalogTabellen = Array.isArray(referenz.tabellen) ? referenz.tabellen.slice().sort() : [];
  const exportTabellen = Object.keys(TABLES).sort();
  if (JSON.stringify(katalogTabellen) !== JSON.stringify(exportTabellen)) {
    fehler.push("51er Production-Katalog und Backup-TABLES sind nicht exakt deckungsgleich");
  }
  if (!referenz.katalogBeleg || referenz.katalogBeleg.publicTabellen !== 51
      || !Array.isArray(referenz.katalogBeleg.rlsNichtAktiv)
      || referenz.katalogBeleg.rlsNichtAktiv.length !== 0) {
    fehler.push("Production-Katalogbeleg fuer 51 Tabellen mit RLS auf allen Tabellen fehlt");
  }
  if (referenz.quelle !== ERWARTETE_PRODUKTIONS_QUELLE) {
    fehler.push("Production-Katalogbeleg stammt nicht aus der fest verankerten Supabase-Production-Quelle");
  }
  const pruefeKatalogListe = (name, liste, anzahl) => {
    if (!Array.isArray(liste) || liste.length !== anzahl || new Set(liste).size !== anzahl
        || JSON.stringify(liste) !== JSON.stringify(liste.slice().sort())) {
      fehler.push(`Production-Katalogliste ${name} ist nicht der belegte sortierte ${anzahl}er-Vertrag`);
    }
  };
  pruefeKatalogListe("policies", referenz.policies, 24);
  pruefeKatalogListe("trigger", referenz.trigger, 20);
  pruefeKatalogListe("funktionen", referenz.funktionen, 62);
  pruefeKatalogListe("identitySpalten", referenz.identitySpalten, 2);
  if (JSON.stringify(referenz.identitySpalten || []) !== JSON.stringify([
    "gate_shadow_events.id", "source_crawl_telemetry.id"
  ])) fehler.push("Production-Identity-Spalten sind nicht der belegte Vertrag");
  if (referenz.postgresVersion !== "17.6" || referenz.pgvectorVersion !== "0.8.0") {
    fehler.push("Production-Postgres-/pgvector-Version passt nicht zum Katalogbeleg");
  }
  const katalogPruefsumme = berechneKanonischePruefsumme({
    tabellen: katalogTabellen,
    policies: referenz.policies || [],
    trigger: referenz.trigger || [],
    funktionen: referenz.funktionen || [],
    identitySpalten: referenz.identitySpalten || [],
    rlsNichtAktiv: (referenz.katalogBeleg && referenz.katalogBeleg.rlsNichtAktiv) || [],
    postgresVersion: referenz.postgresVersion,
    pgvectorVersion: referenz.pgvectorVersion,
    erhoben: referenz.erhoben,
    quelle: referenz.quelle
  });
  if (katalogPruefsumme !== ERWARTETE_KATALOG_PRUEFSUMME) {
    fehler.push("vollstaendiger Production-Katalogvertrag passt nicht zur fest verankerten Katalog-Pruefsumme");
  }
  if (ERWARTETE_SPALTENKATALOG_PRUEFSUMME === null) {
    if (referenz.spaltenKatalog !== null) {
      fehler.push("kein Production-Spaltenkatalog-Digest ist fest verankert; jeder selbst gesetzte Spaltenkatalog bleibt gesperrt");
    }
  } else if (!referenz.spaltenKatalog
      || referenz.spaltenKatalog.pruefsumme !== ERWARTETE_SPALTENKATALOG_PRUEFSUMME) {
    fehler.push("Production-Spaltenkatalog passt nicht zur fest verankerten Spaltenkatalog-Pruefsumme");
  }

  // Nur schema.sql plus die explizit als Production-angewendet belegten
  // Migrationen duerfen den Restore-Sollstand bilden. F9, Z22 und crawl_runs
  // bleiben damit konstruktionsbedingt draussen.
  const produktiveQuellen = [path.join(repoRoot, "supabase", "schema.sql")]
    .concat((angewendet || []).map((name) => path.join(repoRoot, "supabase", "migrations", name)));
  const produktiveTabellen = new Set();
  for (const datei of produktiveQuellen) {
    if (!fs.existsSync(datei)) continue;
    const gelesen = tabellenAusSql(fs.readFileSync(datei, "utf8"), path.relative(repoRoot, datei));
    fehler.push(...gelesen.fehler);
    gelesen.tabellen.forEach((name) => produktiveTabellen.add(name));
  }
  const produktiveListe = Array.from(produktiveTabellen).sort();
  if (JSON.stringify(produktiveListe) !== JSON.stringify(exportTabellen)) {
    fehler.push("schema.sql + belegte Production-Migrationen ergeben nicht exakt den 51er Katalog");
  }

  const inventarHash = sha256(JSON.stringify({
    tabellen: exportTabellen,
    restoreOrder: RESTORE_ORDER,
    migrationsmanifest: manifest.id,
    historyPruefsumme: manifest.historyPruefsumme,
    repoSqlPruefsumme,
    katalogPruefsumme,
    katalogErhoben: referenz.erhoben,
    katalogTabellen,
    spaltenKatalogPruefsumme: (referenz.spaltenKatalog && referenz.spaltenKatalog.pruefsumme) || null
  }));
  return Object.freeze({
    ok: fehler.length === 0,
    fehler: Object.freeze(fehler),
    manifest: Object.freeze({ ...manifest }),
    referenz: Object.freeze(referenz),
    angewendet: Object.freeze((angewendet || []).slice()),
    nichtAngewendet: Object.freeze((nichtAngewendet || []).slice()),
    produktiveTabellen: Object.freeze(produktiveListe),
    katalogPruefsumme,
    inventarHash
  });
}

function vergleicheInventar(schemaErgebnis) {
  const schema = new Set((schemaErgebnis && schemaErgebnis.tabellen) || []);
  const exportiert = Object.keys(TABLES);
  const ausgenommen = Object.keys(NICHT_PRODUKTIV);
  const bekannt = new Set([...exportiert, ...ausgenommen]);
  const reihenfolge = new Set(RESTORE_ORDER);
  const fehler = [...((schemaErgebnis && schemaErgebnis.fehler) || [])];

  const neuOhneEntscheidung = Array.from(schema).filter((t) => !bekannt.has(t)).sort();
  const inventarOhneSchema = Array.from(bekannt).filter((t) => !schema.has(t)).sort();
  const ohneRestore = exportiert.filter((t) => !reihenfolge.has(t));
  const nurRestore = RESTORE_ORDER.filter((t) => !Object.prototype.hasOwnProperty.call(TABLES, t));
  const doppelRestore = RESTORE_ORDER.filter((t, i) => RESTORE_ORDER.indexOf(t) !== i);
  const ohnePk = exportiert.filter((t) => typeof TABLES[t] !== "string" || !TABLES[t].trim());
  const ausnahmeAuchExport = ausgenommen.filter((t) => Object.prototype.hasOwnProperty.call(TABLES, t) || reihenfolge.has(t));

  if (neuOhneEntscheidung.length) fehler.push(`neue public-Tabellen ohne Backup-Entscheidung: ${neuOhneEntscheidung.join(", ")}`);
  if (inventarOhneSchema.length) fehler.push(`Inventartabellen ohne CREATE TABLE im Schema: ${inventarOhneSchema.join(", ")}`);
  if (ohneRestore.length) fehler.push(`Exporttabellen ohne Restore-Reihenfolge: ${ohneRestore.join(", ")}`);
  if (nurRestore.length) fehler.push(`Restore-Tabellen ohne Export: ${nurRestore.join(", ")}`);
  if (doppelRestore.length) fehler.push(`doppelte Restore-Tabellen: ${Array.from(new Set(doppelRestore)).join(", ")}`);
  if (ohnePk.length) fehler.push(`Exporttabellen ohne Primaerschluessel: ${ohnePk.join(", ")}`);
  if (ausnahmeAuchExport.length) fehler.push(`Tabellen zugleich exportiert und ausgenommen: ${ausnahmeAuchExport.join(", ")}`);

  for (const [scope, tabellen] of Object.entries(SCOPES)) {
    if (!tabellen) continue;
    const unbekannt = tabellen.filter((t) => !Object.prototype.hasOwnProperty.call(TABLES, t));
    if (unbekannt.length) fehler.push(`Scope ${scope} enthaelt unbekannte Tabellen: ${unbekannt.join(", ")}`);
  }

  return Object.freeze({
    ok: fehler.length === 0,
    fehler: Object.freeze(fehler),
    schemaTabellen: Object.freeze(Array.from(schema).sort()),
    exportTabellen: Object.freeze(exportiert.slice().sort()),
    ausgenommeneTabellen: Object.freeze(ausgenommen.slice().sort())
  });
}

function pruefeInventar(repoRoot = path.join(__dirname, "..")) {
  const schema = vergleicheInventar(ermittleSchemaTabellen(repoRoot));
  const production = pruefeProduktionsMigrationsmanifest(repoRoot);
  return Object.freeze({
    ...schema,
    ok: schema.ok && production.ok,
    fehler: Object.freeze([...schema.fehler, ...production.fehler]),
    production
  });
}

function fordereGueltigesInventar(repoRoot = path.join(__dirname, "..")) {
  const ergebnis = pruefeInventar(repoRoot);
  if (!ergebnis.ok) {
    throw new Error(`Backup-Inventar stimmt nicht mit schema.sql/Migrationen ueberein: ${ergebnis.fehler.join(" | ")}`);
  }
  return ergebnis;
}

module.exports = {
  TABLES,
  NICHT_PRODUKTIV,
  SEED_SCOPE_TABLES,
  PROFIL_SCOPE_TABLES,
  SCOPES,
  RESTORE_ORDER,
  tabellenAusSql,
  ermittleSchemaTabellen,
  pruefeProduktionsMigrationsmanifest,
  berechneKanonischePruefsumme,
  berechneBackupManifestPruefsumme,
  parseJsonVerlustfrei,
  zerlegeJsonArrayRoh,
  verlustfreierZahltext,
  vergleicheInventar,
  pruefeInventar,
  fordereGueltigesInventar,
  ERWARTETE_PRODUKTIONS_QUELLE,
  ERWARTETE_KATALOG_PRUEFSUMME,
  ERWARTETE_SPALTENKATALOG_PRUEFSUMME
};
