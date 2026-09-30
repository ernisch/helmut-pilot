"use strict";

// Helmut — LOKALER, FAIL-CLOSED 500er-ERSATZ-PREFLIGHT + SQL-GENERATOR
// =============================================================================================
// BELEGTE SICHERHEITSLUECKE, DIE DIESES WERKZEUG SCHLIESST
//   Der fruehere Generator erzeugte bei bestehendem Bestand einen ADDITIVEN Import und einen
//   sogenannten "Rollback", der nur die NEUE Kohorte loeschte. Lagen die 500 Mandatsprofile
//   bereits vor (Production-Befund: 500 mandate_profiles, 501 profiles gesamt, 1 profile ohne
//   mandate, alle Mandatsprofile aktiv = false, Kinddaten u. a. in briefings, decisions,
//   matching_results, matching_runs, profile_embeddings), dann war der Vorwaertsweg kein Ersatz,
//   sondern ein Doppelbestand, und der "Rollback" stellte den Altbestand NICHT wieder her — er
//   liess ihn geloescht zurueck. Beides ist mit diesem Werkzeug nicht mehr moeglich.
//
// DAS IST DER KONTROLLIERTE ERSATZ
//   Die heutigen exakt 500 Mandatsprofile werden durch das Offline-Paket
//   daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json ERSETZT. Ein zusaetzliches,
//   technisch anderes profiles-Row OHNE Mandat bleibt UNANGETASTET.
//
// FAIL-CLOSED OHNE VOLLSTAENDIGEN PREIMAGE-SNAPSHOT
//   Ohne expliziten, gueltigen Preimage-Snapshot (--snapshot) erzeugt dieses Werkzeug KEIN SQL
//   und endet mit Exit != 0. Es gibt keinen additiven Default-Import und keinen "Rollback", der
//   nur die neue Kohorte loescht, mehr.
//
// DER SNAPSHOT WIRD NICHT VON DIESEM WERKZEUG ERZEUGT
//   Der vollstaendige Preimage-Snapshot MUSS vom Betreiber VOR der geschuetzten Production-Aktion
//   SEPARAT REIN LESEND aus der Production-Datenbank erzeugt, geprueft und sicher aufbewahrt
//   werden. Dieses Werkzeug liest KEINE Datenbank, fuehrt KEINE Production-Aktion aus und erzeugt
//   den Snapshot NICHT selbst. Es konsumiert ausschliesslich eine bereits vorliegende
//   Snapshot-Datei. Ein vom Werkzeug erzeugter "Snapshot" waere keine unabhaengige Vorabbildung.
//
// SNAPSHOT-VERTRAG v2 (versioniert, lokal pruefbar)
//   helmut-500-preimage/2 ist ein Snapshot-VERZEICHNIS:
//     manifest.json                         kleines, kanonisch versiegeltes Manifest
//     <tabelle>.jsonl                       je Snapshot-Tabelle genau eine JSONL-Datei
//     fremd_profiles.jsonl                  profiles ohne Mandat
//   Das Manifest bindet operationId, Paket-Hash, Mengen, ID-Sets, Spaltenlisten, Zeilenzahlen,
//   SHA-256 jeder Datei und einen eigenen kanonischen Hash. v1 faellt nicht still: es wird weder
//   erzeugt noch als v2 akzeptiert. Jede JSONL-Datei wird einzeln gehasht und beim Konsum
//   fail-closed geprueft (fehlende/extra/manipulierte Datei, Spalten, Zeilen, IDs, aktiv, AfD).
//
// WAS DIE SQL-PRUEFUNG SICHERT (Selbsttest, ohne Ausfuehrung)
//   Genau eine Transaktion je Weg; transaktionale Sperre; ausfuehrbare Preimage-, Nach-, Guard-
//   und Rueckweg-Riegel (Verletzung bricht ab, fail-closed); Vorwaerts loescht AUSSCHLIESSLICH
//   die Preimage-profile-IDs (Kinddaten fallen ueber ON DELETE CASCADE); danach exakt 500
//   Mandatsprofile, 501 profiles gesamt, 0 aktiv, AfD = 0 und erhaltenes Fremdprofil; der
//   Rueckweg loescht exakt die neue Kohorte nur ohne unerwartete neue Kinddaten und stellt die
//   vollstaendigen Snapshotdaten in FK-sicherer Reihenfolge wieder her.
//
// WAS DIESES SKRIPT NICHT TUT
//   Kein Netz, keine DB, kein Modell, kein Flag, keine Production-Aktion, kein Git, kein
//   Commit/Push/PR, keine Migration. Es erzeugt nur SQL-Text; ausgefuehrt wird er erst durch den
//   Betreiber innerhalb der gesonderten Import-/Aktivierungsfreigabe. Im Repo wird nichts
//   veraendert.
//
// AUFRUF
//   node scripts/import-preflight-500-sql-generator.js --snapshot <v2-snapshot-verzeichnis> --out <dir>
//   node scripts/import-preflight-500-sql-generator.js --snapshot <v2-snapshot-verzeichnis> --out <dir> --paket <datei>
//   node scripts/import-preflight-500-sql-generator.js                              # fail-closed, Exit 2
//   Es wird KEIN SQL auf stdout geschrieben. Exit 0 = Preflight + v2-Snapshot + Datei-Selbsttest
//   gruen · 2 = kein/ungueltiger Snapshot oder Preflight rot (kein SQL) · 3 = SQL-Selbsttest rot.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const IMPORT = require(path.join(__dirname, "..", "lib", "helmut", "profil-import.js"));
const ZULASSUNG = require(path.join(__dirname, "..", "lib", "helmut", "profil-zulassung.js"));

const PAKET_PFAD = path.join(__dirname, "..", "daten", "mandatsprofile-bundestag-berlin-brandenburg-20260929.json");
const KOHORTE_GESAMT = 500;
const MANDATE_GESAMT = 500;
const PROFILES_GESAMT = 501;
const ERWARTET = Object.freeze({ bundestag: 330, "landtag-berlin": 120, "landtag-brandenburg": 50 });
const REGIERUNGSROLLEN = Object.freeze(["regierung", "opposition", "unbekannt"]);

const SNAPSHOT_VERTRAG = "helmut-500-preimage/2";
const SPALTEN_NAME = /^[a-z_][a-z0-9_]*$/;
const MANIFEST_DATEI = "manifest.json";
const FREMD_TABELLE = "fremd_profiles";
const JSONB_BATCH_MAX_ROWS = 200;
const JSONB_BATCH_MAX_BYTES = 4 * 1024 * 1024;

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

// Alle bekannten FK-Kindtabellen von public.profiles(id) aus supabase/schema.sql und den
// Migrationen — in FK-SICHERER Reihenfolge (Eltern vor Kindern) fuer die Wiederherstellung.
// Quelle: supabase/schema.sql (mandate_profiles, political_items, personalized_recommendations,
// daily_tasks, communication_drafts, user_notes, priority_changes, matching_weights, decisions,
// topic_memory, interactions, office_outputs, briefings, profile_embeddings, matching_results)
// und supabase/migrations/20260728_matching_audit.sql (matching_runs).
// WICHTIG: matching_runs steht VOR matching_results, weil
// matching_results.run_id -> matching_runs.id zeigt
// (20260728_matching_audit.sql, "add column if not exists run_id text references
// public.matching_runs(id)"). Werden die Zeilen in umgekehrter Reihenfolge eingefuegt,
// verletzt ein matching_results-Satz mit nicht-null run_id den FK. matching_runs ist
// ausserdem Voraussetzung fuer den Trigger matching_results_run_complete, der je Ergebniszeile
// eine bereits vorhandene, vollstaendige Laufzeile verlangt.
const FK_KINDTABELLEN = Object.freeze([
  "mandate_profiles",
  "political_items",
  "personalized_recommendations",
  "daily_tasks",
  "communication_drafts",
  "user_notes",
  "priority_changes",
  "matching_weights",
  "decisions",
  "topic_memory",
  "interactions",
  "office_outputs",
  "briefings",
  "profile_embeddings",
  "matching_runs",
  "matching_results"
]);
const SNAPSHOT_TABELLEN = Object.freeze(["profiles", ...FK_KINDTABELLEN]);
const V2_SNAPSHOT_DATEIEN = Object.freeze([...SNAPSHOT_TABELLEN, FREMD_TABELLE]);

// Spaltenliste = nur Spalten, die real existieren und aus dem Importvertrag belegbar sind.
const MANDAT_SPALTEN = Object.freeze([
  "user_id", "partei", "fraktion", "rolle", "politische_ebene", "wahlkreis", "bundesland",
  "ausschuesse", "berichterstatter_themen", "fachpolitische_schwerpunkte", "namensvarianten",
  "stellvertretende_ausschuesse", "regionale_themen", "regierungsrolle", "relevante_ministerien",
  "regionale_interessen", "aktiv", "onboarding_status", "profil_extras"
]);
const TEXTARR_SPALTEN = new Set([
  "ausschuesse", "berichterstatter_themen", "fachpolitische_schwerpunkte", "namensvarianten",
  "stellvertretende_ausschuesse", "regionale_themen", "relevante_ministerien", "regionale_interessen"
]);

const AFD_SQL = "(coalesce(partei, '') ilike '%afd%' or coalesce(fraktion, '') ilike '%afd%'"
  + " or coalesce(partei, '') ilike '%alternative%deutschland%' or coalesce(fraktion, '') ilike '%alternative%deutschland%')";

// ── Text-/Hash-Helfer ────────────────────────────────────────────────────────────────────
function text(v) { return String(v == null ? "" : v).trim(); }
function normal(v) { return text(v).toLowerCase().replace(/\s+/g, " "); }
function sqlText(v) {
  if (v === null || v === undefined || v === "") return "null";
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function sqlTextArray(liste) {
  const l = Array.isArray(liste) ? liste.map(text).filter(Boolean) : [];
  return l.length ? "array[" + l.map(sqlText).join(", ") + "]::text[]" : "'{}'::text[]";
}
function sqlJsonb(obj) { return sqlText(JSON.stringify(obj)) + "::jsonb"; }
function sqlIdListe(ids) { return "(" + ids.map(sqlText).join(", ") + ")"; }
function istZeile(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function eindeutigeSortiert(liste) { return [...new Set(liste)].sort(); }
function gleichMenge(a, b) { return JSON.stringify(eindeutigeSortiert(a)) === JSON.stringify(eindeutigeSortiert(b)); }

function spaltenWert(spalte, wert) {
  if (spalte === "aktiv") return wert === true ? "true" : "false"; // IMMER false
  if (spalte === "profil_extras") return sqlJsonb(wert || {});
  if (TEXTARR_SPALTEN.has(spalte)) return sqlTextArray(wert);
  return sqlText(wert);
}

// Kanonisches JSON (Objektschluessel rekursiv sortiert; Array-Reihenfolge bleibt) + SHA-256.
function kanonisch(v) {
  if (Array.isArray(v)) return v.map(kanonisch);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = kanonisch(v[k]);
    return out;
  }
  return v;
}
function sha256Hex(s) { return crypto.createHash("sha256").update(String(s), "utf8").digest("hex"); }
function hashSnapshot(snapshot) {
  const kopie = { ...(snapshot || {}) };
  delete kopie.sha256;
  return sha256Hex(JSON.stringify(kanonisch(kopie)));
}
function hashPaket(pfad) { return crypto.createHash("sha256").update(fs.readFileSync(pfad)).digest("hex"); }

function dateiName(tabelle) { return `${tabelle}.jsonl`; }

function leeresSnapshotErgebnis() {
  return { ok: false, fehler: [], ids: { mandat: [], fremd: [] }, dateien: {}, zaehlung: {} };
}

function liesJsonlRoh(pfad) {
  let roh;
  try {
    roh = fs.readFileSync(pfad, "utf8");
  } catch (e) {
    const err = new Error(`Snapshot-Datei nicht lesbar: ${path.basename(pfad)} (${String(e && e.message)}).`);
    err.code = "snapshot-datei-unlesbar";
    throw err;
  }
  return roh;
}

function jsonlZeilen(roh) {
  return roh.split(/\r?\n/).filter((z) => z.trim() !== "");
}

function hashDateiSync(pfad) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(pfad, "r");
  const puffer = Buffer.alloc(64 * 1024);
  try {
    for (;;) {
      const n = fs.readSync(fd, puffer, 0, puffer.length, null);
      if (n === 0) break;
      hash.update(puffer.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

// Synchroner, speicherbegrenzter JSONL-Zeileniterator. Haelt nie die ganze Datei als String
// oder Array; nur die aktuell geparste Zeile und ein kleiner Restpuffer sind im Speicher.
function* jsonlZeilenSync(pfad) {
  const fd = fs.openSync(pfad, "r");
  const puffer = Buffer.alloc(64 * 1024);
  let rest = Buffer.alloc(0);
  function* liefern(rohZeile) {
    let zeile = rohZeile.toString("utf8");
    if (zeile.endsWith("\r")) zeile = zeile.slice(0, -1);
    if (zeile.trim() !== "") yield zeile;
  }
  try {
    for (;;) {
      const n = fs.readSync(fd, puffer, 0, puffer.length, null);
      if (n === 0) break;
      let start = 0;
      for (let i = 0; i < n; i++) {
        if (puffer[i] !== 10) continue;
        const teil = puffer.subarray(start, i);
        const zeile = rest.length ? Buffer.concat([rest, teil]) : Buffer.from(teil);
        yield* liefern(zeile);
        rest = Buffer.alloc(0);
        start = i + 1;
      }
      const uebrig = puffer.subarray(start, n);
      rest = rest.length ? Buffer.concat([rest, uebrig]) : Buffer.from(uebrig);
    }
    if (rest.length) yield* liefern(rest);
  } finally {
    fs.closeSync(fd);
  }
}

// ── Paket-Preflight (unveraendert gueltig fuer die neue Kohorte) ─────────────────────────────
function befund(code, text_, hinweis) { return { code, text: text_, hinweis }; }
function fehler(code, nachricht) {
  const e = new Error(nachricht);
  e.code = code;
  return e;
}

function afdRohTreffer(profil) {
  return /afd|alternative f(ü|ue)r deutschland/i.test(`${text(profil.partei)} ${text(profil.fraktion)}`);
}

function preflight(paket) {
  const fehler = [];
  const add = (code, text_, hinweis) => fehler.push(befund(code, text_, hinweis));
  const ergebnis = { ok: false, fehler, zaehlung: {}, ids: [], profile: 0 };

  if (!paket || typeof paket !== "object" || Array.isArray(paket)) {
    add("paket-kein-objekt", "Die Eingabe ist kein JSON-Objekt.",
      "Erwartet wird { version, profile: [...] } aus dem Offline-Paket.");
    return ergebnis;
  }

  if (text(paket.version) !== IMPORT.VERTRAGSVERSION) {
    add("version-unbekannt", `version = "${text(paket.version) || "(fehlt)"}".`,
      `Erwartet: ${IMPORT.VERTRAGSVERSION}. Ein Generator, der eine unbekannte Version raet, erzeugt Import-SQL fuer irgendetwas.`);
  }

  const profile = Array.isArray(paket.profile) ? paket.profile : null;
  if (!profile) {
    add("profile-kein-array", "`profile` ist keine Liste.",
      "Erwartet wird eine Liste von Profilobjekten.");
    return ergebnis;
  }
  ergebnis.profile = profile.length;

  if (profile.length !== KOHORTE_GESAMT) {
    add("kohorte-anzahl", `Es sind ${profile.length} Profile, erwartet exakt ${KOHORTE_GESAMT}.`,
      "Der 500er-Nachweis verlangt genau 500 gleich behandelte Profile — nicht mehr und nicht weniger.");
  }

  const zaehlung = {};
  for (const p of profile) {
    const k = text(p && p.parlament) || "(ohne)";
    zaehlung[k] = (zaehlung[k] || 0) + 1;
  }
  ergebnis.zaehlung = zaehlung;
  if (JSON.stringify(zaehlung) !== JSON.stringify(ERWARTET)) {
    add("verteilung", `Verteilung ist ${JSON.stringify(zaehlung)}, erwartet ${JSON.stringify(ERWARTET)}.`,
      "Die erste Etappe ist Bundestag 330 / Berlin 120 / Brandenburg 50; andere oder unbekannte Parlamente sind nicht Teil dieser Kohorte.");
  }

  const vertrag = IMPORT.pruefeImport(paket);
  if (!vertrag.ok) {
    const codes = vertrag.fehler.map((f) => f.code).slice(0, 8).join(", ") || "(keine globalen Codes)";
    const profilfehler = (vertrag.ergebnisse || []).reduce((n, e) => n + e.fehler.length, 0);
    add("importvertrag", `Der Importvertrag lehnt das Paket ab (${vertrag.fehler.length} globale Befunde, ${profilfehler} Profilbefunde).`,
      `Betroffene Codes u. a.: ${codes}.`);
  }
  if (vertrag.gueltig !== KOHORTE_GESAMT) {
    add("importvertrag-gueltig", `Der Importvertrag findet ${vertrag.gueltig} gueltige Profile, erwartet ${KOHORTE_GESAMT}.`,
      "Teilimporte sind nicht vorgesehen — ein ungueltiges Profil macht die ganze Kohorte unbrauchbar.");
  }

  const nichtInaktiv = profile.filter((p) => !p || p.aktiv !== false);
  if (nichtInaktiv.length) {
    add("aktiv-true", `${nichtInaktiv.length} Profil(e) tragen nicht woertlich aktiv === false.`,
      "Ein Import aktiviert NIE (CLAUDE.md §5). Aktivierung ist eine gesonderte Betreiberfreigabe.");
  }
  const freigabe = (paket.offlinePaket && paket.offlinePaket.importfreigabe) || null;
  if (freigabe && ["freigegeben", "import", "provisionierung", "aktivierung"].some((k) => freigabe[k] !== false)) {
    add("importfreigabe", `offlinePaket.importfreigabe meldet eine Freigabe: ${JSON.stringify(freigabe)}.`,
      "Das Paket muss Import/Provisionierung/Aktivierung ausdruecklich als false ausweisen.");
  }
  const profilstatus = paket.offlinePaket && paket.offlinePaket.profilstatus;
  if (profilstatus !== undefined) {
    const statusOk = Array.isArray(profilstatus) && profilstatus.length === KOHORTE_GESAMT
      && profilstatus.every((s) => s && s.aktiv === false && s.importfreigegeben === false);
    if (!statusOk) {
      add("profilstatus", "offlinePaket.profilstatus ist nicht 500x { aktiv:false, importfreigegeben:false }.",
        "Die 500 Statuszeilen muessen vollstaendig deaktiviert und nicht importfreigegeben sein.");
    }
  }

  const ausgeschlossen = profile.filter((p) => {
    if (!p || typeof p !== "object") return true;
    try { return ZULASSUNG.istAusgeschlossen(p) === true; } catch (_) { return true; }
  });
  if (ausgeschlossen.length) {
    add("afd-ausschluss", `${ausgeschlossen.length} Profil(e) sind ueber Partei/Fraktion als AfD-zugehoerig ausgeschlossen.`,
      "AfD-Profile duerfen nicht importiert, angelegt, aktiviert oder versorgt werden (AGENTS.md, lib/helmut/profil-zulassung.js).");
  }
  const afdText = profile.filter((p) => p && afdRohTreffer(p));
  if (afdText.length) {
    add("afd-text", `${afdText.length} Profil(e) tragen "AfD"/"Alternative fuer Deutschland" in Partei oder Fraktion.`,
      "Unabhaengig von der Normalisierung: aktuelle AfD-Zugehoerigkeit ist ausgeschlossen.");
  }
  const ohneZugehoerigkeit = profile.filter((p) => p && !(text(p.partei) || text(p.fraktion) || p.fraktionslos === true));
  if (ohneZugehoerigkeit.length) {
    add("zugehoerigkeit-fehlt", `${ohneZugehoerigkeit.length} Profil(e) weisen weder Partei/Fraktion noch fraktionslos aus.`,
      "Eine Luecke ist keine Aussage: entweder Partei/Fraktion ODER ausdruecklich fraktionslos. Sonst ist die AfD-Sperre nicht pruefbar.");
  }

  for (const p of profile) {
    if (p && p.regierungsrolle !== undefined && p.regierungsrolle !== null && p.regierungsrolle !== "") {
      if (!REGIERUNGSROLLEN.includes(text(p.regierungsrolle))) {
        add("regierungsrolle", `regierungsrolle = "${text(p.regierungsrolle)}" ist kein erlaubter Wert.`,
          `Erlaubt sind: ${REGIERUNGSROLLEN.join(", ")} (CHECK mandate_profiles_regierungsrolle_check).`);
      }
    }
  }

  const ids = profile.map((p) => text(p && p.mandatsId).toLowerCase());
  ergebnis.ids = ids;
  const zaehleWerte = (werte) => {
    const m = new Map();
    for (const w of werte) { if (!w) continue; m.set(w, (m.get(w) || 0) + 1); }
    return [...m].filter(([, n]) => n > 1);
  };
  const dublIds = zaehleWerte(ids);
  if (dublIds.length) {
    add("dublette-mandatsId", `${dublIds.length} Mandatskennung(en) kommen mehrfach vor.`,
      "Die Kennung ist der Mandantenschluessel — sie muss eindeutig sein.");
  }
  const dublNamen = zaehleWerte(profile.map((p) => normal(p && p.vollname)));
  if (dublNamen.length) {
    add("dublette-name", `${dublNamen.length} Vollname(n) kommen mehrfach vor.`,
      "Dieselbe Person wurde mehrfach erfasst.");
  }
  const quellenUrl = (p) => {
    const q = ((p && p.offizielleQuellen) || []).find((x) => x && x.art === "parlament-profil");
    return q ? text(q.url).toLowerCase().replace(/\/+$/, "") : "";
  };
  const dublQuellen = zaehleWerte(profile.map(quellenUrl));
  if (dublQuellen.length) {
    add("dublette-quelle", `${dublQuellen.length} amtliche Profilseite(n) sind mehrfach zugeordnet.`,
      "Zwei Kennungen auf derselben amtlichen Seite meinen dieselbe Person.");
  }
  const eindeutig = new Set(ids.filter(Boolean));
  if (eindeutig.size !== KOHORTE_GESAMT || ids.some((id) => !id)) {
    add("kennungen", `Es sind ${eindeutig.size} eindeutige, nicht-leere Mandatskennungen (erwartet ${KOHORTE_GESAMT}).`,
      "Jedes der 500 Profile braucht eine eindeutige, nicht-leere Kennung als user_id.");
  }

  ergebnis.ok = fehler.length === 0;
  return ergebnis;
}

// ── Snapshot-Pruefung (fail-closed, keine DB) ───────────────────────────────────────────────
function pruefeSnapshot(snapshot, { paketHash = null, neueIds = [] } = {}) {
  const fehler = [];
  const add = (code, text_, hinweis) => fehler.push(befund(code, text_, hinweis));
  const ergebnis = { ok: false, fehler, ids: { mandat: [], fremd: [] }, tabellen: {}, zaehlung: {} };
  const s = snapshot;

  if (!istZeile(s)) {
    add("snapshot-kein-objekt", "Die Snapshot-Eingabe ist kein JSON-Objekt.",
      `Der Preimage-Snapshot muss dem versionierten Vertrag ${SNAPSHOT_VERTRAG} entsprechen.`);
    return ergebnis;
  }

  if (text(s.snapshotVertrag) !== SNAPSHOT_VERTRAG) {
    add("snapshot-vertrag", `snapshotVertrag = "${text(s.snapshotVertrag) || "(fehlt)"}".`,
      `Erwartet: ${SNAPSHOT_VERTRAG}. Eine unbekannte Version wird nicht geraten.`);
  }
  if (!text(s.operationId)) {
    add("snapshot-operation-id", "operationId fehlt.", "Jeder Ersatz braucht eine eindeutige, benannte Operation.");
  }
  if (!text(s.erstelltAm)) {
    add("snapshot-erstellt-am", "erstelltAm fehlt.", "Der Snapshot muss einen Erzeugungszeitpunkt tragen.");
  }
  if (!istZeile(s.paket)) {
    add("snapshot-paket", "`paket` fehlt.", "Erwartet wird { pfad, sha256 } der neuen Paketdatei.");
  } else {
    const paketSha = text(s.paket.sha256).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(paketSha)) {
      add("snapshot-paket-hash", `paket.sha256 = "${text(s.paket.sha256) || "(fehlt)"}" ist kein SHA-256.`,
        "Der Paket-Hash bindet den Snapshot an genau die importierte Paketdatei.");
    } else if (paketHash && paketSha !== String(paketHash).toLowerCase()) {
      add("snapshot-paket-hash-mismatch", "paket.sha256 passt nicht zur geladenen Paketdatei.",
        "Andere Paketdatei oder manipulierter Snapshot — fail-closed.");
    }
  }

  const eigenHash = text(s.sha256).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(eigenHash)) {
    add("snapshot-hash", `sha256 = "${text(s.sha256) || "(fehlt)"}" ist kein SHA-256.`,
      "Der Snapshot-Hash bindet den gesamten Snapshot-Inhalt.");
  } else if (eigenHash !== hashSnapshot(s)) {
    add("snapshot-hash-mismatch", "sha256 passt nicht zum Snapshot-Inhalt.",
      "Der Snapshot wurde nach dem Versiegeln veraendert oder falsch kanonisiert — fail-closed.");
  }

  const bestand = istZeile(s.bestand) ? s.bestand : {};
  if (bestand.profilesGesamt !== PROFILES_GESAMT) {
    add("snapshot-profiles-gesamt", `bestand.profilesGesamt = ${JSON.stringify(bestand.profilesGesamt)} (erwartet ${PROFILES_GESAMT}).`,
      `Der Ersatz verlangt 501 profiles gesamt: ${MANDATE_GESAMT} Mandatsprofile + 1 Fremdprofil ohne Mandat.`);
  }
  if (bestand.mandateProfilesGesamt !== MANDATE_GESAMT) {
    add("snapshot-mandate-gesamt", `bestand.mandateProfilesGesamt = ${JSON.stringify(bestand.mandateProfilesGesamt)} (erwartet ${MANDATE_GESAMT}).`,
      "Es werden genau 500 Mandatsprofile ersetzt.");
  }
  if (bestand.aktivGesamt !== 0) {
    add("snapshot-aktiv-gesamt", `bestand.aktivGesamt = ${JSON.stringify(bestand.aktivGesamt)} (erwartet 0).`,
      "Der Preimage-Bestand muss vollstaendig inaktiv sein (alle Mandatsprofile aktiv = false).");
  }

  const tab = s.tabellen;
  if (!istZeile(tab)) {
    add("snapshot-tabellen", "`tabellen` fehlt.", "Erwartet werden vollstaendige Tabellenabschnitte je Snapshot-Tabelle.");
    return ergebnis;
  }
  for (const name of Object.keys(tab)) {
    if (!SNAPSHOT_TABELLEN.includes(name)) {
      add("snapshot-tabelle-unbekannt", `Unbekannte Snapshot-Tabelle "${name}".`,
        `Erlaubt sind ausschliesslich: ${SNAPSHOT_TABELLEN.join(", ")}.`);
    }
  }
  for (const name of SNAPSHOT_TABELLEN) {
    if (!Array.isArray(tab[name])) {
      add("snapshot-tabelle-fehlt", `Tabelle "${name}" fehlt als Liste.`,
        "Jede bekannte FK-Kindtabelle muss als vollstaendiger (ggf. leerer) Abschnitt vorhanden sein.");
    }
  }
  ergebnis.tabellen = tab;

  const spaltenPruefen = (zeile, kontext) => {
    for (const sp of Object.keys(zeile)) {
      if (!SPALTEN_NAME.test(sp)) {
        add("snapshot-spalte", `${kontext}: Spaltenname "${sp}" ist kein sicherer Bezeichner.`,
          "Spaltennamen muessen /^[a-z_][a-z0-9_]*$/ entsprechen (SQL-Bau aus Snapshotdaten).");
      }
    }
  };
  // Ein vollstaendiger Tabellenabschnitt hat in allen Zeilen denselben Spaltensatz. Uneinheitliche
  // Zeilen wuerden bei der Wiederherstellung still Spalten verlieren — deshalb fail-closed.
  const spaltensatzPruefen = (zeilen, kontext) => {
    const saetze = new Set((Array.isArray(zeilen) ? zeilen : [])
      .filter(istZeile)
      .map((z) => Object.keys(z).slice().sort().join(",")));
    if (saetze.size > 1) {
      add("snapshot-spaltensatz", `Tabelle "${kontext}" hat uneinheitliche Spaltensaetze.`,
        "Vollstaendige Tabellenabschnitte (z. B. select json_agg(t) from public.<t> t where user_id in (...)) erwartet.");
    }
  };
  for (const name of SNAPSHOT_TABELLEN) spaltensatzPruefen(tab[name], name);
  spaltensatzPruefen(s.fremd_profiles, "fremd_profiles");

  // profiles: genau 500 vollstaendige Zeilen der Preimage-Kohorte.
  const profileRows = Array.isArray(tab.profiles) ? tab.profiles : [];
  if (profileRows.length !== MANDATE_GESAMT) {
    add("snapshot-profiles-anzahl", `tabellen.profiles hat ${profileRows.length} Zeilen (erwartet ${MANDATE_GESAMT}).`,
      "Der Snapshot muss genau 500 vollstaendige alte profiles-Zeilen enthalten.");
  }
  const profileIds = [];
  for (const z of profileRows) {
    if (!istZeile(z) || !text(z.id)) {
      add("snapshot-profiles-zeile", "Eine profiles-Zeile ist kein Objekt mit nicht-leerer id.",
        "Vollstaendige Zeilen mit id erwartet (z. B. select json_agg(t) from public.profiles t where id in (...)).");
      continue;
    }
    spaltenPruefen(z, "profiles");
    profileIds.push(text(z.id));
  }
  if (new Set(profileIds).size !== profileIds.length) {
    add("snapshot-profiles-dublette", "tabellen.profiles enthaelt doppelte ids.",
      "Die Preimage-ID-Menge muss eindeutig sein.");
  }

  // mandate_profiles: genau 500 vollstaendige Zeilen, alle inaktiv, kein AfD.
  const mandateRows = Array.isArray(tab.mandate_profiles) ? tab.mandate_profiles : [];
  if (mandateRows.length !== MANDATE_GESAMT) {
    add("snapshot-mandate-anzahl", `tabellen.mandate_profiles hat ${mandateRows.length} Zeilen (erwartet ${MANDATE_GESAMT}).`,
      "Der Snapshot muss genau 500 vollstaendige alte mandate_profiles-Zeilen enthalten.");
  }
  const mandateIds = [];
  let snapshotAktiv = 0;
  let snapshotAfd = 0;
  for (const z of mandateRows) {
    if (!istZeile(z) || !text(z.user_id)) {
      add("snapshot-mandate-zeile", "Eine mandate_profiles-Zeile ist kein Objekt mit nicht-leerer user_id.",
        "Vollstaendige Zeilen mit user_id erwartet.");
      continue;
    }
    spaltenPruefen(z, "mandate_profiles");
    mandateIds.push(text(z.user_id));
    if (z.aktiv !== false) snapshotAktiv += 1;
    if (ZULASSUNG.istAusgeschlossen({ partei: z.partei, fraktion: z.fraktion }) || afdRohTreffer(z)) snapshotAfd += 1;
  }
  if (snapshotAktiv !== 0) {
    add("snapshot-aktiv-zeile", `${snapshotAktiv} mandate_profiles-Zeilen im Snapshot sind nicht woertlich aktiv === false.`,
      "Ein Ersatz-Snapshot eines vollstaendig inaktiven Bestands ist Voraussetzung.");
  }
  if (snapshotAfd !== 0) {
    add("snapshot-afd", `${snapshotAfd} mandate_profiles-Zeilen im Snapshot tragen AfD-Zugehoerigkeit.`,
      "AfD-zugehoerige Profile duerfen nicht importiert, wiederhergestellt oder versorgt werden (AGENTS.md).");
  }

  // ID-Mengenbindung.
  const idsRoh = istZeile(s.ids) ? s.ids : {};
  const mandat = Array.isArray(idsRoh.mandat) ? idsRoh.mandat.map(text) : [];
  const fremdIds = Array.isArray(idsRoh.fremd) ? idsRoh.fremd.map(text) : [];
  ergebnis.ids = { mandat: mandat.slice().sort(), fremd: fremdIds.slice().sort() };
  ergebnis.zaehlung = { profiles: profileIds.length, mandateProfiles: mandateIds.length, fremd: fremdIds.length };

  if (mandat.length !== MANDATE_GESAMT) {
    add("snapshot-id-menge-anzahl", `ids.mandat hat ${mandat.length} Eintraege (erwartet ${MANDATE_GESAMT}).`,
      "Die ID-Mengenbindung muss die 500 Preimage-Mandatskennungen vollstaendig nennen.");
  }
  if (new Set(mandat).size !== mandat.length) {
    add("snapshot-id-menge-dublette", "ids.mandat enthaelt doppelte Kennungen.", "Die ID-Menge muss eindeutig sein.");
  }
  if (!gleichMenge(mandat, profileIds)) {
    add("snapshot-id-menge-profiles", "ids.mandat stimmt nicht mit den ids in tabellen.profiles ueberein.",
      "Die ID-Mengenbindung koppelt die Kennungsliste an die vollstaendigen profiles-Zeilen.");
  }
  if (!gleichMenge(mandat, mandateIds)) {
    add("snapshot-id-menge-mandate", "ids.mandat stimmt nicht mit den user_ids in tabellen.mandate_profiles ueberein.",
      "Die ID-Mengenbindung koppelt die Kennungsliste an die vollstaendigen mandate_profiles-Zeilen.");
  }

  // Fremdprofilbestand: profiles ohne Mandat, bleibt unangetastet.
  const fremdRows = Array.isArray(s.fremd_profiles) ? s.fremd_profiles : [];
  const erwartetFremd = PROFILES_GESAMT - MANDATE_GESAMT;
  if (fremdRows.length !== erwartetFremd) {
    add("snapshot-fremd-anzahl", `fremd_profiles hat ${fremdRows.length} Zeilen (erwartet ${erwartetFremd}).`,
      "Der technisch andere profiles-Bestand ohne Mandat muss vollstaendig erfasst, aber unangetastet bleiben.");
  }
  const fremdRowIds = [];
  for (const z of fremdRows) {
    if (!istZeile(z) || !text(z.id)) {
      add("snapshot-fremd-zeile", "Eine fremd_profiles-Zeile ist kein Objekt mit nicht-leerer id.", "Vollstaendige Zeilen mit id erwartet.");
      continue;
    }
    spaltenPruefen(z, "fremd_profiles");
    fremdRowIds.push(text(z.id));
  }
  if (!gleichMenge(fremdIds, fremdRowIds)) {
    add("snapshot-fremd-id-menge", "ids.fremd stimmt nicht mit den ids in fremd_profiles ueberein.",
      "Die ID-Mengenbindung koppelt auch den Fremdprofilbestand.");
  }
  if (fremdIds.some((id) => mandat.includes(id))) {
    add("snapshot-fremd-kollision", "Ein Fremdprofil traegt zugleich eine Preimage-Mandatskennung.",
      "Fremdprofil und Mandatskohorte muessen disjunkt sein.");
  }

  // Kindabschnitte: vollstaendig, nur Preimage-Kohorte.
  const mandatSet = new Set(mandat);
  for (const name of FK_KINDTABELLEN) {
    const zeilen = Array.isArray(tab[name]) ? tab[name] : [];
    for (const z of zeilen) {
      if (!istZeile(z)) {
        add("snapshot-kind-zeile", `Tabelle "${name}" enthaelt eine Zeile, die kein Objekt ist.`, "Vollstaendige Zeilen erwartet.");
        continue;
      }
      spaltenPruefen(z, name);
      if (!text(z.user_id)) {
        add("snapshot-kind-zeile-user-id", `Tabelle "${name}" enthaelt eine Zeile ohne user_id.`,
          "FK-Kindzeilen sind ueber user_id an profiles gebunden.");
      } else if (!mandatSet.has(text(z.user_id))) {
        add("snapshot-kind-zeile-fremd", `Tabelle "${name}" verweist auf "${text(z.user_id)}" ausserhalb der Preimage-Kohorte.`,
          "Der Snapshot enthaelt ausschliesslich Kindzeilen der 500 zu ersetzenden Mandatsprofile; der Fremdbestand bleibt unangetastet.");
      }
    }
  }

  // Neues Paket und Altbestand duerfen sich nicht ueberschneiden.
  const neueSet = new Set(neueIds.map(text));
  const kollision = [...neueSet].filter((id) => mandatSet.has(id) || fremdRowIds.includes(id));
  if (kollision.length) {
    add("snapshot-neu-kollision", `${kollision.length} neue Kennung(en) kollidieren mit dem Preimage-Bestand.`,
      "Die neue Kohorte muss disjunkt zum Altbestand und zum Fremdprofil sein.");
  }

  ergebnis.ok = fehler.length === 0;
  return ergebnis;
}

// ── Snapshot-VERZEICHNIS v2 pruefen (Manifest + jede Datei fail-closed) ─────────────────────
function pruefeSnapshotVerzeichnis(snapshotDir, { paketHash = null, neueIds = [] } = {}) {
  const fehler = [];
  const add = (code, text_, hinweis) => fehler.push(befund(code, text_, hinweis));
  const ergebnis = { ok: false, fehler, ids: { mandat: [], fremd: [] }, dateien: {}, zaehlung: {} };
  const dir = path.resolve(snapshotDir);

  let manifest;
  try {
    const pfad = path.join(dir, MANIFEST_DATEI);
    manifest = JSON.parse(liesJsonlRoh(pfad));
  } catch (e) {
    add("snapshot-manifest", `manifest.json fehlt oder ist kein gueltiges JSON: ${String(e && e.message)}.`,
      "Der v2-Snapshot ist ein Verzeichnis mit manifest.json und je Tabelle einer .jsonl-Datei.");
    return ergebnis;
  }

  if (!istZeile(manifest)) {
    add("snapshot-manifest", "manifest.json ist kein JSON-Objekt.", "Erwartet wird das kleine v2-Manifest.");
    return ergebnis;
  }
  ergebnis.manifest = manifest;
  ergebnis.snapshotDir = dir;
  if (text(manifest.snapshotVertrag) !== SNAPSHOT_VERTRAG) {
    add("snapshot-vertrag", `snapshotVertrag = "${text(manifest.snapshotVertrag) || "(fehlt)"}".`,
      `Erwartet: ${SNAPSHOT_VERTRAG}. Version 1 faellt nicht still: sie wird weder erzeugt noch als v2 akzeptiert.`);
  }
  if (!text(manifest.operationId)) add("snapshot-operation-id", "operationId fehlt.", "Jeder Ersatz braucht eine eindeutige, benannte Operation.");
  if (!text(manifest.erstelltAm)) add("snapshot-erstellt-am", "erstelltAm fehlt.", "Der Snapshot muss einen Erzeugungszeitpunkt tragen.");
  if (!istZeile(manifest.paket)) {
    add("snapshot-paket", "`paket` fehlt.", "Erwartet wird { pfad, sha256 } der neuen Paketdatei.");
  } else {
    const paketSha = text(manifest.paket.sha256).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(paketSha)) {
      add("snapshot-paket-hash", `paket.sha256 = "${text(manifest.paket.sha256) || "(fehlt)"}" ist kein SHA-256.`,
        "Der Paket-Hash bindet den Snapshot an genau die importierte Paketdatei.");
    } else if (paketHash && paketSha !== String(paketHash).toLowerCase()) {
      add("snapshot-paket-hash-mismatch", "paket.sha256 passt nicht zur geladenen Paketdatei.",
        "Andere Paketdatei oder manipulierter Snapshot — fail-closed.");
    }
  }

  const eigenHash = text(manifest.sha256).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(eigenHash)) {
    add("snapshot-hash", `sha256 = "${text(manifest.sha256) || "(fehlt)"}" ist kein SHA-256.`,
      "Der Manifest-Hash bindet alle Datei-Hashes, Spalten, Mengen und ID-Sets.");
  } else if (eigenHash !== hashSnapshot(manifest)) {
    add("snapshot-hash-mismatch", "sha256 passt nicht zum Manifest-Inhalt.",
      "Das Manifest wurde nach dem Versiegeln veraendert oder falsch kanonisiert — fail-closed.");
  }

  const bestand = istZeile(manifest.bestand) ? manifest.bestand : {};
  if (bestand.profilesGesamt !== PROFILES_GESAMT) {
    add("snapshot-profiles-gesamt", `bestand.profilesGesamt = ${JSON.stringify(bestand.profilesGesamt)} (erwartet ${PROFILES_GESAMT}).`,
      `Der Ersatz verlangt ${PROFILES_GESAMT} profiles gesamt: ${MANDATE_GESAMT} Mandatsprofile + 1 Fremdprofil ohne Mandat.`);
  }
  if (bestand.mandateProfilesGesamt !== MANDATE_GESAMT) {
    add("snapshot-mandate-gesamt", `bestand.mandateProfilesGesamt = ${JSON.stringify(bestand.mandateProfilesGesamt)} (erwartet ${MANDATE_GESAMT}).`,
      "Es werden genau 500 Mandatsprofile ersetzt.");
  }
  if (bestand.aktivGesamt !== 0) {
    add("snapshot-aktiv-gesamt", `bestand.aktivGesamt = ${JSON.stringify(bestand.aktivGesamt)} (erwartet 0).`,
      "Der Preimage-Bestand muss vollstaendig inaktiv sein.");
  }

  const idsRoh = istZeile(manifest.ids) ? manifest.ids : {};
  const mandat = Array.isArray(idsRoh.mandat) ? idsRoh.mandat.map(text) : [];
  const fremdIds = Array.isArray(idsRoh.fremd) ? idsRoh.fremd.map(text) : [];
  ergebnis.ids = { mandat: mandat.slice().sort(), fremd: fremdIds.slice().sort() };
  if (mandat.length !== MANDATE_GESAMT) {
    add("snapshot-id-menge-anzahl", `ids.mandat hat ${mandat.length} Eintraege (erwartet ${MANDATE_GESAMT}).`,
      "Die ID-Mengenbindung muss die 500 Preimage-Mandatskennungen vollstaendig nennen.");
  }
  if (new Set(mandat).size !== mandat.length) add("snapshot-id-menge-dublette", "ids.mandat enthaelt doppelte Kennungen.", "Die ID-Menge muss eindeutig sein.");
  if (new Set(fremdIds).size !== fremdIds.length) add("snapshot-fremd-id-menge-dublette", "ids.fremd enthaelt doppelte Kennungen.", "Die Fremdprofil-ID-Menge muss eindeutig sein.");
  if (fremdIds.some((id) => mandat.includes(id))) add("snapshot-fremd-kollision", "Ein Fremdprofil traegt zugleich eine Preimage-Mandatskennung.", "Fremdprofil und Mandatskohorte muessen disjunkt sein.");

  if (!istZeile(manifest.dateien)) {
    add("snapshot-dateien", "`dateien` fehlt.", "Erwartet wird ein Objekt: <dateiname> -> { tabelle, spalten, zeilen, sha256 }.");
    return ergebnis;
  }
  const erlaubteDateinamen = new Set(V2_SNAPSHOT_DATEIEN.map(dateiName));
  for (const name of Object.keys(manifest.dateien)) {
    const e = manifest.dateien[name];
    if (!istZeile(e)) {
      add("snapshot-datei-eintrag", `Dateieintrag "${name}" ist kein Objekt.`, "Erwartet: { tabelle, spalten, zeilen, sha256 }.");
      continue;
    }
    if (!erlaubteDateinamen.has(name) || name !== path.basename(name) || path.isAbsolute(name)) {
      add("snapshot-datei-name", `Dateieintrag "${name}" ist kein exakt erlaubter, pfadloser Dateiname.`,
        `Erlaubt sind ausschliesslich: ${[...erlaubteDateinamen].sort().join(", ")}.`);
    }
    if (!V2_SNAPSHOT_DATEIEN.includes(e.tabelle)) {
      add("snapshot-datei-unbekannt", `Unbekannte Snapshot-Tabelle "${text(e.tabelle) || "(fehlt)"}" in ${name}.`,
        `Erlaubt sind ausschliesslich: ${V2_SNAPSHOT_DATEIEN.join(", ")}.`);
    }
    if (V2_SNAPSHOT_DATEIEN.includes(e.tabelle) && dateiName(e.tabelle) !== name) {
      add("snapshot-datei-name-tabelle", `Dateieintrag "${name}" gehoert nicht zur Tabelle "${e.tabelle}" (erwartet "${dateiName(e.tabelle)}").`,
        "Manifest-Key und Dateiname sind hart an die Tabelle gebunden.");
    }
    if (!text(e.sha256).match(/^[0-9a-f]{64}$/)) {
      add("snapshot-datei-hash", `Dateieintrag "${name}" hat keinen gueltigen SHA-256.`,
        "Jede JSONL-Datei ist einzeln versiegelt.");
    }
    if (!Number.isInteger(e.zeilen) || e.zeilen < 0) {
      add("snapshot-datei-zeilen", `Dateieintrag "${name}" hat keine gueltige Zeilenzahl.`, "Die Zeilenzahl bindet den vollstaendigen Tabellenabschnitt.");
    }
    if (!Array.isArray(e.spalten) || e.spalten.some((s) => !SPALTEN_NAME.test(s)) || new Set(e.spalten).size !== e.spalten.length) {
      add("snapshot-datei-spalten", `Dateieintrag "${name}" hat keine gueltige Spaltenliste.`,
        "Spalten muessen eindeutige sichere Bezeichner sein und werden aus dem Manifest verbindlich.");
    }
    if (e.tabelle === "profiles" && e.zeilen !== MANDATE_GESAMT) add("snapshot-profiles-anzahl", `profiles.jsonl meldet ${e.zeilen} Zeilen (erwartet ${MANDATE_GESAMT}).`, "Der Snapshot muss genau 500 vollstaendige alte profiles-Zeilen enthalten.");
    if (e.tabelle === "mandate_profiles" && e.zeilen !== MANDATE_GESAMT) add("snapshot-mandate-anzahl", `mandate_profiles.jsonl meldet ${e.zeilen} Zeilen (erwartet ${MANDATE_GESAMT}).`, "Der Snapshot muss genau 500 vollstaendige alte mandate_profiles-Zeilen enthalten.");
    if (e.tabelle === FREMD_TABELLE && e.zeilen !== PROFILES_GESAMT - MANDATE_GESAMT) add("snapshot-fremd-anzahl", `fremd_profiles.jsonl meldet ${e.zeilen} Zeilen (erwartet ${PROFILES_GESAMT - MANDATE_GESAMT}).`, "Der Fremdprofilbestand ohne Mandat muss vollstaendig erfasst sein.");
  }
  for (const name of V2_SNAPSHOT_DATEIEN) {
    if (!Object.prototype.hasOwnProperty.call(manifest.dateien, dateiName(name))) {
      add("snapshot-datei-fehlt", `Dateieintrag "${dateiName(name)}" fehlt im Manifest.`,
        "Jede erforderliche Snapshot-Tabelle plus fremd_profiles muss als JSONL-Datei gebunden sein.");
    }
  }
  for (const name of Object.keys(manifest.dateien)) {
    if (!erlaubteDateinamen.has(name)) {
      add("snapshot-datei-extra-eintrag", `Unerwarteter Dateieintrag im Manifest: ${name}`,
        "Das Manifest darf ausschliesslich genau eine Datei je erlaubter Tabelle binden.");
    }
  }

  // Neue Kohorte darf weder Altbestand noch Fremdprofil beruehren.
  const neueSet = new Set(neueIds.map(text));
  const kollision = [...neueSet].filter((id) => mandat.includes(id) || fremdIds.includes(id));
  if (kollision.length) add("snapshot-neu-kollision", `${kollision.length} neue Kennung(en) kollidieren mit dem Preimage-Bestand.`, "Die neue Kohorte muss disjunkt zum Altbestand und zum Fremdprofil sein.");

  // Dateieintraege fuer die spaetere SQL-Erzeugung normalisieren.
  for (const name of Object.keys(manifest.dateien)) {
    const e = manifest.dateien[name];
    if (istZeile(e) && V2_SNAPSHOT_DATEIEN.includes(e.tabelle)) ergebnis.dateien[e.tabelle] = e;
  }

  // Jede deklarierte Datei physisch pruefen (Hash, Zeilenzahl, Spalten, IDs, aktiv, AfD).
  const vorhandene = (() => { try { return fs.readdirSync(dir).sort(); } catch (e) { return null; } })();
  if (vorhandene === null) {
    add("snapshot-verzeichnis", `Snapshot-Verzeichnis nicht lesbar: ${dir}`, "Das v2-Snapshot-Verzeichnis muss lesbar sein.");
    return ergebnis;
  }
  const erwarteteDateinamen = new Set([MANIFEST_DATEI, ...V2_SNAPSHOT_DATEIEN.map(dateiName)]);
  for (const name of vorhandene) {
    if (!erwarteteDateinamen.has(name)) add("snapshot-datei-extra", `Unerwartete Datei im Snapshot-Verzeichnis: ${name}`, "Das Verzeichnis darf nur manifest.json und die gebundenen JSONL-Dateien enthalten.");
  }

  const mandatSet = new Set(mandat);
  const gesammelteIds = { profiles: [], mandate: [], fremd: [] };
  for (const tabelle of V2_SNAPSHOT_DATEIEN) {
    const name = dateiName(tabelle);
    const e = manifest.dateien[name];
    if (!istZeile(e)) continue;
    const pfad = path.join(dir, name);
    if (!fs.existsSync(pfad) || !fs.statSync(pfad).isFile()) {
      add("snapshot-datei-fehlt", `Gebundene Datei fehlt: ${name}`, "Jede Manifest-Datei muss physisch vorhanden sein.");
      continue;
    }
    let dateiHash;
    try { dateiHash = hashDateiSync(pfad); } catch (err) { add("snapshot-datei-unlesbar", `${name}: ${String(err && err.message)}`, "fail-closed."); continue; }
    if (dateiHash !== text(e.sha256).toLowerCase()) {
      add("snapshot-datei-hash-mismatch", `${name}: sha256 weicht vom Manifest ab.`, "Manipulierte oder beschädigte Snapshot-Datei — fail-closed.");
    }
    const spaltenSet = new Set(e.spalten || []);
    const pk = PRIMAERSCHLUESSEL[tabelle];
    const pkGesehen = new Set();
    let zeilen = 0;
    let aktiv = 0;
    let afd = 0;
    for (const zeileText of jsonlZeilenSync(pfad)) {
      zeilen += 1;
      let z;
      try { z = JSON.parse(zeileText); } catch (err) {
        add("snapshot-datei-json", `${name}: Zeile ${zeilen} ist kein gueltiges JSON.`, "Kanonische JSONL-Datei erwartet.");
        continue;
      }
      if (!istZeile(z)) { add("snapshot-datei-zeile", `${name}: Zeile ${zeilen} ist kein Objekt.`, "JSONL-Zeilen sind vollstaendige Zeilenobjekte."); continue; }
      const keys = Object.keys(z).sort();
      if (JSON.stringify(keys) !== JSON.stringify([...(e.spalten || [])].sort())) {
        add("snapshot-spaltensatz", `${name}: Zeile ${zeilen} hat einen abweichenden Spaltensatz.`,
          "Alle Zeilen einer Tabelle muessen exakt die Manifest-Spalten tragen.");
      }
      if (tabelle === "profiles") {
        if (!text(z.id)) add("snapshot-profiles-zeile", `${name}: Zeile ${zeilen} hat keine id.`, "Vollstaendige profiles-Zeile erwartet.");
        else gesammelteIds.profiles.push(text(z.id));
      } else if (tabelle === "mandate_profiles") {
        if (!text(z.user_id)) add("snapshot-mandate-zeile", `${name}: Zeile ${zeilen} hat keine user_id.`, "Vollstaendige mandate_profiles-Zeile erwartet.");
        else {
          gesammelteIds.mandate.push(text(z.user_id));
          if (z.aktiv !== false) aktiv += 1;
          if (ZULASSUNG.istAusgeschlossen({ partei: z.partei, fraktion: z.fraktion }) || afdRohTreffer(z)) afd += 1;
        }
      } else if (tabelle === FREMD_TABELLE) {
        if (!text(z.id)) add("snapshot-fremd-zeile", `${name}: Zeile ${zeilen} hat keine id.`, "Vollstaendige fremd_profiles-Zeile erwartet.");
        else gesammelteIds.fremd.push(text(z.id));
      } else {
        if (!text(z.user_id)) add("snapshot-kind-zeile-user-id", `${name}: Zeile ${zeilen} hat keine user_id.`, "FK-Kindzeilen sind ueber user_id an profiles gebunden.");
        else if (!mandatSet.has(text(z.user_id))) add("snapshot-kind-zeile-fremd", `${name}: Zeile ${zeilen} verweist auf "${text(z.user_id)}" ausserhalb der Preimage-Kohorte.`, "Der Snapshot enthaelt ausschliesslich Kindzeilen der 500 zu ersetzenden Mandatsprofile.");
        if (pk) {
          if (!text(z[pk])) add("snapshot-kind-pk-fehlt", `${name}: Zeile ${zeilen} hat keine nicht-leere Primärschlüsselspalte "${pk}".`, "Die PK-Identität muss eindeutig pruefbar sein.");
          else if (pkGesehen.has(text(z[pk]))) add("snapshot-kind-pk-dublette", `${name}: Zeile ${zeilen} wiederholt Primärschlüssel "${pk}" = "${text(z[pk])}".`, "1:n-Tabellen duerfen user_id mehrfach tragen, aber keine PK-Kennung wiederholen.");
          else pkGesehen.add(text(z[pk]));
        }
      }
    }
    if (zeilen !== e.zeilen) {
      add("snapshot-datei-zeilen-mismatch", `${name}: ${zeilen} Zeilen, Manifest meldet ${e.zeilen}.`,
        "Zeilenzahl muss exakt mit dem Manifest uebereinstimmen.");
    }
    if (tabelle === "mandate_profiles") {
      if (aktiv !== 0) add("snapshot-aktiv-zeile", `${aktiv} mandate_profiles-Zeilen im Snapshot sind nicht woertlich aktiv === false.`, "Ein Ersatz-Snapshot eines vollstaendig inaktiven Bestands ist Voraussetzung.");
      if (afd !== 0) add("snapshot-afd", `${afd} mandate_profiles-Zeilen im Snapshot tragen AfD-Zugehoerigkeit.`, "AfD-zugehoerige Profile duerfen nicht importiert, wiederhergestellt oder versorgt werden.");
    }
  }

  if (!gleichMenge(gesammelteIds.profiles, mandat)) add("snapshot-id-menge-profiles", "ids.mandat stimmt nicht mit den ids in profiles.jsonl ueberein.", "Die ID-Mengenbindung koppelt die Kennungsliste an die vollstaendigen profiles-Zeilen.");
  if (!gleichMenge(gesammelteIds.mandate, mandat)) add("snapshot-id-menge-mandate", "ids.mandat stimmt nicht mit den user_ids in mandate_profiles.jsonl ueberein.", "Die ID-Mengenbindung koppelt die Kennungsliste an die vollstaendigen mandate_profiles-Zeilen.");
  if (!gleichMenge(gesammelteIds.fremd, fremdIds)) add("snapshot-fremd-id-menge", "ids.fremd stimmt nicht mit den ids in fremd_profiles.jsonl ueberein.", "Die ID-Mengenbindung koppelt auch den Fremdprofilbestand.");

  ergebnis.zaehlung = {
    profiles: gesammelteIds.profiles.length,
    mandateProfiles: gesammelteIds.mandate.length,
    fremd: gesammelteIds.fremd.length
  };
  ergebnis.ok = fehler.length === 0;
  return ergebnis;
}

// ── Zeilenplan der neuen Kohorte (reine Abbildung) ──────────────────────────────────────────
function erzeugeZeilen(paket) {
  const profileRows = [];
  const mandateRows = [];
  for (const p of paket.profile) {
    const h = IMPORT.zuHelmutProfil(p);
    profileRows.push({ id: text(p.mandatsId), name: text(p.vollname) });
    mandateRows.push({
      user_id: h.id,
      partei: h.party || null,
      fraktion: h.faction || null,
      rolle: h.function || null,
      politische_ebene: h.politische_ebene || null,
      wahlkreis: h.constituency || null,
      bundesland: h.bundesland || null,
      ausschuesse: h.committees || [],
      berichterstatter_themen: h.reportingTopics || [],
      fachpolitische_schwerpunkte: h.focusTopics || [],
      namensvarianten: h.namensvarianten || [],
      stellvertretende_ausschuesse: h.deputyCommittees || [],
      regionale_themen: h.regionalTopics || [],
      regierungsrolle: h.governmentRole || null,
      relevante_ministerien: h.relevantMinistries || [],
      regionale_interessen: h.regionalInterests || [],
      aktiv: false, // IMMER deaktiviert
      onboarding_status: "neu",
      profil_extras: {
        parlament: text(p.parlament),
        regionHinweis: text(p.regionHinweis),
        listenmandat: p.listenmandat === true,
        offizielleQuellen: Array.isArray(p.offizielleQuellen) ? p.offizielleQuellen : []
      }
    });
  }
  return { profileRows, mandateRows };
}

// ── SQL-Bau ───────────────────────────────────────────────────────────────────────────────
function einschubSql(tabelle, spalten, zeilen) {
  const kopf = `insert into public.${tabelle}\n  (${spalten.join(", ")}) values`;
  const koerper = zeilen.map((z) => "  (" + spalten.map((s) => spaltenWert(s, z[s])).join(", ") + ")").join(",\n");
  return `${kopf}\n${koerper};`;
}

function wachBlock(pruefungen) {
  const innen = pruefungen.map((p) => [
    `  ${p.zaehlen(2)}`,
    `  if ist ${p.bedingung} then`,
    `    raise exception '${String(p.meldung).replace(/'/g, "''")}', ist;`,
    "  end if;"
  ].join("\n")).join("\n");
  return `do $$\ndeclare ist integer;\nbegin\n${innen}\nend $$;`;
}

function zaehleKohorte(indent, tabelle, ids, zusatz = "") {
  return `${" ".repeat(indent)}select count(*) into ist from public.${tabelle} where user_id in ${sqlIdListe(ids)}${zusatz};`;
}
function zaehleProfile(indent, ids, zusatz = "") {
  return `${" ".repeat(indent)}select count(*) into ist from public.profiles where id in ${sqlIdListe(ids)}${zusatz};`;
}
function zaehleGesamt(indent, tabelle, zusatz = "") {
  return `${" ".repeat(indent)}select count(*) into ist from public.${tabelle}${zusatz};`;
}

const TAG = "$helmut_snapshot$";
function wiederherstellungsSql(tabelle, zeilen) {
  if (!zeilen.length) return `-- ${tabelle}: 0 Snapshot-Zeilen — nichts wiederherzustellen (Nachbedingung prueft 0).`;
  const spalten = Object.keys(zeilen[0]);
  const json = JSON.stringify(zeilen);
  if (json.includes(TAG)) {
    const e = new Error(`Snapshot-Daten fuer ${tabelle} enthalten die Dollar-Quote-Kennung ${TAG}.`);
    e.code = "snapshot-tag-kollision";
    throw e;
  }
  return [
    `insert into public.${tabelle} (${spalten.join(", ")})`,
    `select ${spalten.join(", ")} from jsonb_populate_recordset(null::public.${tabelle}, ${TAG}${json}${TAG}::jsonb);`
  ].join("\n");
}

function erzeugeErsatzSql(paket, ergebnis, snapshot) {
  const { profileRows, mandateRows } = erzeugeZeilen(paket);
  const neueIds = ergebnis.ids.slice();
  const alteIds = snapshot.ids.mandat.slice().sort();
  const fremdIds = snapshot.ids.fremd.slice().sort();
  const tab = snapshot.tabellen;
  const op = text(snapshot.operationId);

  const preimage = wachBlock([
    { zaehlen: (i) => zaehleProfile(i, alteIds), bedingung: `<> ${MANDATE_GESAMT}`,
      meldung: `ERSATZ VORBEDINGUNG VERLETZT: % profiles-Zeilen der Preimage-Kohorte (erwartet ${MANDATE_GESAMT})` },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", alteIds), bedingung: `<> ${MANDATE_GESAMT}`,
      meldung: `ERSATZ VORBEDINGUNG VERLETZT: % mandate_profiles-Zeilen der Preimage-Kohorte (erwartet ${MANDATE_GESAMT})` },
    { zaehlen: (i) => zaehleGesamt(i, "mandate_profiles"), bedingung: `<> ${MANDATE_GESAMT}`,
      meldung: `ERSATZ VORBEDINGUNG VERLETZT: % mandate_profiles-Zeilen gesamt — es werden NUR die ${MANDATE_GESAMT} Mandatsprofile ersetzt` },
    { zaehlen: (i) => zaehleGesamt(i, "profiles"), bedingung: `<> ${PROFILES_GESAMT}`,
      meldung: `ERSATZ VORBEDINGUNG VERLETZT: % profiles-Zeilen gesamt (erwartet ${PROFILES_GESAMT} = ${MANDATE_GESAMT} Mandatsprofile + 1 Fremdprofil)` },
    { zaehlen: (i) => zaehleProfile(i, fremdIds), bedingung: `<> ${fremdIds.length}`,
      meldung: `ERSATZ VORBEDINGUNG VERLETZT: % Fremdprofil-Zeilen vorhanden (erwartet ${fremdIds.length})` },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", fremdIds), bedingung: "<> 0",
      meldung: "ERSATZ VORBEDINGUNG VERLETZT: % Fremdprofile tragen ein Mandat (erwartet 0) — nur Mandatsprofile werden ersetzt" },
    { zaehlen: (i) => zaehleProfile(i, neueIds), bedingung: "<> 0",
      meldung: "ERSATZ VORBEDINGUNG VERLETZT: % profiles-Zeilen der neuen Kohorte existieren bereits (erwartet 0)" },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", neueIds), bedingung: "<> 0",
      meldung: "ERSATZ VORBEDINGUNG VERLETZT: % mandate_profiles-Zeilen der neuen Kohorte existieren bereits (erwartet 0)" }
  ]);

  const nachNeu = wachBlock([
    { zaehlen: (i) => zaehleProfile(i, neueIds), bedingung: `<> ${KOHORTE_GESAMT}`,
      meldung: `ERSATZ NACHBEDINGUNG VERLETZT: % neue profiles-Zeilen (erwartet ${KOHORTE_GESAMT})` },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", neueIds), bedingung: `<> ${KOHORTE_GESAMT}`,
      meldung: `ERSATZ NACHBEDINGUNG VERLETZT: % neue mandate_profiles-Zeilen (erwartet ${KOHORTE_GESAMT})` },
    { zaehlen: (i) => zaehleGesamt(i, "mandate_profiles"), bedingung: `<> ${MANDATE_GESAMT}`,
      meldung: `ERSATZ NACHBEDINGUNG VERLETZT: % mandate_profiles gesamt (erwartet exakt ${MANDATE_GESAMT})` },
    { zaehlen: (i) => zaehleGesamt(i, "profiles"), bedingung: `<> ${PROFILES_GESAMT}`,
      meldung: `ERSATZ NACHBEDINGUNG VERLETZT: % profiles gesamt (erwartet exakt ${PROFILES_GESAMT})` },
    { zaehlen: (i) => zaehleProfile(i, alteIds), bedingung: "<> 0",
      meldung: "ERSATZ NACHBEDINGUNG VERLETZT: % alte Preimage-profiles-Zeilen verbleiben (erwartet 0)" },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", neueIds, " and aktiv is not false"), bedingung: "<> 0",
      meldung: "ERSATZ NACHBEDINGUNG VERLETZT: % neue Mandatszeilen sind aktiv (erwartet 0 aktive)" },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", neueIds, ` and ${AFD_SQL}`), bedingung: "<> 0",
      meldung: "ERSATZ NACHBEDINGUNG VERLETZT: % neue Mandatszeilen tragen AfD-Zugehoerigkeit (erwartet 0)" },
    { zaehlen: (i) => zaehleProfile(i, fremdIds), bedingung: `<> ${fremdIds.length}`,
      meldung: `ERSATZ NACHBEDINGUNG VERLETZT: % Fremdprofil-Zeilen erhalten (erwartet ${fremdIds.length} unangetastet)` },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", fremdIds), bedingung: "<> 0",
      meldung: "ERSATZ NACHBEDINGUNG VERLETZT: % Fremdprofile tragen ein Mandat (erwartet 0)" }
  ]);

  const guardPruefungen = [
    { zaehlen: (i) => zaehleProfile(i, neueIds), bedingung: `<> ${KOHORTE_GESAMT}`,
      meldung: `RUECKWEG VORBEDINGUNG VERLETZT: % neue profiles-Zeilen vorhanden (erwartet ${KOHORTE_GESAMT})` },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", neueIds), bedingung: `<> ${KOHORTE_GESAMT}`,
      meldung: `RUECKWEG VORBEDINGUNG VERLETZT: % neue mandate_profiles-Zeilen vorhanden (erwartet ${KOHORTE_GESAMT})` }
  ];
  for (const name of FK_KINDTABELLEN) {
    if (name === "mandate_profiles") continue;
    guardPruefungen.push({
      zaehlen: (i) => zaehleKohorte(i, name, neueIds), bedingung: "<> 0",
      meldung: `RUECKWEG VORBEDINGUNG VERLETZT: % UNERWARTETE neue Kinddaten in public.${name} zur neuen Kohorte (erwartet 0)`
    });
  }
  const guard = wachBlock(guardPruefungen);

  const rollPruefungen = [
    { zaehlen: (i) => zaehleGesamt(i, "profiles"), bedingung: `<> ${PROFILES_GESAMT}`,
      meldung: `RUECKWEG NACHBEDINGUNG VERLETZT: % profiles gesamt (erwartet ${PROFILES_GESAMT})` },
    { zaehlen: (i) => zaehleGesamt(i, "mandate_profiles"), bedingung: `<> ${MANDATE_GESAMT}`,
      meldung: `RUECKWEG NACHBEDINGUNG VERLETZT: % mandate_profiles gesamt (erwartet ${MANDATE_GESAMT})` },
    { zaehlen: (i) => zaehleProfile(i, alteIds), bedingung: `<> ${MANDATE_GESAMT}`,
      meldung: `RUECKWEG NACHBEDINGUNG VERLETZT: % Preimage-profiles-Zeilen wiederhergestellt (erwartet ${MANDATE_GESAMT})` },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", alteIds), bedingung: `<> ${MANDATE_GESAMT}`,
      meldung: `RUECKWEG NACHBEDINGUNG VERLETZT: % Preimage-mandate_profiles-Zeilen wiederhergestellt (erwartet ${MANDATE_GESAMT})` },
    { zaehlen: (i) => zaehleProfile(i, neueIds), bedingung: "<> 0",
      meldung: "RUECKWEG NACHBEDINGUNG VERLETZT: % neue profiles-Zeilen verbleiben (erwartet 0)" },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", neueIds), bedingung: "<> 0",
      meldung: "RUECKWEG NACHBEDINGUNG VERLETZT: % neue mandate_profiles-Zeilen verbleiben (erwartet 0)" },
    { zaehlen: (i) => zaehleProfile(i, fremdIds), bedingung: `<> ${fremdIds.length}`,
      meldung: `RUECKWEG NACHBEDINGUNG VERLETZT: % Fremdprofil-Zeilen erhalten (erwartet ${fremdIds.length})` },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", fremdIds), bedingung: "<> 0",
      meldung: "RUECKWEG NACHBEDINGUNG VERLETZT: % Fremdprofile tragen ein Mandat (erwartet 0)" },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", alteIds, " and aktiv is not false"), bedingung: "<> 0",
      meldung: "RUECKWEG NACHBEDINGUNG VERLETZT: % Preimage-Mandatszeilen aktiv (erwartet 0 aktive)" },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", alteIds, ` and ${AFD_SQL}`), bedingung: "<> 0",
      meldung: "RUECKWEG NACHBEDINGUNG VERLETZT: % Preimage-Mandatszeilen mit AfD-Zugehoerigkeit (erwartet 0)" }
  ];
  for (const name of FK_KINDTABELLEN) {
    const erwartet = Array.isArray(tab[name]) ? tab[name].length : 0;
    rollPruefungen.push({
      zaehlen: (i) => zaehleKohorte(i, name, alteIds), bedingung: `<> ${erwartet}`,
      meldung: `RUECKWEG NACHBEDINGUNG VERLETZT: % Snapshot-Zeilen in public.${name} (erwartet ${erwartet})`
    });
  }
  const nachAlt = wachBlock(rollPruefungen);

  const kopfZeile = (titel, zusatz) => [
    "-- ============================================================================================",
    `-- Helmut — ${titel}`,
    "-- GENERIERT von scripts/import-preflight-500-sql-generator.js. NICHT AUSGEFÜHRT.",
    `-- operation_id: ${op}`,
    `-- Quelle (neue Kohorte): ${path.relative(path.join(__dirname, ".."), PAKET_PFAD)}`,
    `-- Snapshot: ${text(snapshot.erstelltAm)} von ${text(snapshot.erstelltVon) || "(unbekannt)"} · sha256 ${text(snapshot.sha256)}`,
    "-- Der Snapshot wurde NICHT von diesem Werkzeug erzeugt; er ist vor der geschuetzten",
    "-- Production-Aktion separat rein lesend zu erzeugen und sicher aufzubewahren.",
    `-- ${zusatz}`,
    "-- Ausfuehrung nur innerhalb der gesonderten Import-/Aktivierungsfreigabe; dies ist KEINE",
    "-- Import- oder Aktivierungsfreigabe.",
    "-- ============================================================================================"
  ].join("\n");

  const forward = [
    kopfZeile("500er-ERSATZ Bundestag / Abgeordnetenhaus Berlin / Landtag Brandenburg — VORWAERTS",
      `Ersetzt die ${MANDATE_GESAMT} Preimage-Mandatsprofile; ${fremdIds.length} Fremdprofil(e) bleiben unangetastet.`),
    "begin;",
    "",
    "-- [SPERRE] transaktionale Sperre: kein paralleler Schreibzugriff waehrend des Ersatzes.",
    "lock table public.profiles in access exclusive mode;",
    "lock table public.mandate_profiles in access exclusive mode;",
    "",
    "-- [PREIMAGE] ausfuehrbare Vorbedingung: passende Preimage-ID-Menge, nur die 500 Mandatsprofile,",
    `-- ${PROFILES_GESAMT} profiles gesamt, Fremdprofil vorhanden und ohne Mandat, neue Kohorte noch nicht vorhanden.`,
    preimage,
    "",
    "-- [DELETE-ALT] loescht AUSSCHLIESSLICH die Preimage-profile-IDs; Kinddaten fallen ueber ON DELETE CASCADE.",
    `delete from public.profiles where id in ${sqlIdListe(alteIds)};`,
    "",
    "-- [INSERT-NEU] neue Kohorte, ALLE aktiv = false.",
    einschubSql("profiles", ["id", "name"], profileRows),
    "",
    einschubSql("mandate_profiles", MANDAT_SPALTEN, mandateRows),
    "",
    "-- [POST-NEU] ausfuehrbare Nachbedingung: 500 Mandatsprofile, 501 profiles, 0 aktiv, AfD = 0,",
    "-- Fremdprofilbestand erhalten. Jede Verletzung bricht die Transaktion ab.",
    nachNeu,
    "",
    "commit;"
  ].join("\n");

  const rollback = [
    kopfZeile("500er-ERSATZ Bundestag/Berlin/Brandenburg — ATOMARER RUECKWEG (Preimage-Wiederherstellung)",
      `Entfernt exakt die neue Kohorte und stellt die ${MANDATE_GESAMT} Snapshot-Profile samt Kinddaten wieder her.`),
    "begin;",
    "",
    "-- [SPERRE] transaktionale Sperre.",
    "lock table public.profiles in access exclusive mode;",
    "lock table public.mandate_profiles in access exclusive mode;",
    "",
    "-- [GUARD-NEU] loescht die neue Kohorte NUR, wenn keine unerwarteten neuen Kinddaten existieren.",
    guard,
    "",
    "-- [DELETE-NEU] loescht AUSSCHLIESSLICH die neue Kohorte (Kinddaten ueber ON DELETE CASCADE).",
    `delete from public.profiles where id in ${sqlIdListe(neueIds)};`,
    "",
    "-- [RESTORE-ALT] vollstaendige Snapshotdaten, FK-sichere Reihenfolge (Eltern vor Kindern).",
    ...SNAPSHOT_TABELLEN.map((name) => wiederherstellungsSql(name, Array.isArray(tab[name]) ? tab[name] : [])),
    "",
    "-- [POST-ALT] ausfuehrbare Nachbedingung: exakt der Snapshot-Bestand ist wiederhergestellt.",
    nachAlt,
    "",
    "commit;"
  ].join("\n");

  return { forward, rollback, zeilen: { profileRows, mandateRows }, neueIds, alteIds, fremdIds };
}

function baueErsatzSql(paket, ergebnis, snapshot, kontext = {}) {
  const v = ergebnis || preflight(paket);
  if (!v.ok) {
    const e = new Error("Paket-Preflight nicht bestanden — es wird KEIN SQL erzeugt.");
    e.code = "preflight-fehler";
    e.fehler = v.fehler;
    throw e;
  }
  const sp = pruefeSnapshot(snapshot, { paketHash: kontext.paketHash || null, neueIds: v.ids });
  if (!sp.ok) {
    const e = new Error("Preimage-Snapshot ungueltig — es wird KEIN SQL erzeugt (fail-closed).");
    e.code = "snapshot-fehler";
    e.fehler = sp.fehler;
    throw e;
  }
  const sql = erzeugeErsatzSql(paket, v, { ...snapshot, ids: sp.ids, tabellen: sp.tabellen });
  const selbst = pruefeErsatzSql(sql, { neueIds: v.ids, alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: sp });
  if (selbst.length) {
    const e = new Error("Genauigkeits-Selbsttest des erzeugten SQL nicht bestanden — kein SQL.");
    e.code = "sql-selbsttest";
    e.fehler = selbst;
    throw e;
  }
  return { ...sql, snapshot: sp };
}

// ── v2-Datei-Erzeugung: Forward klein, Rollback streaming in 0600-Temp + atomarem Rename ───
function schreibeSqlTemp(zielPfad, generator) {
  const dir = path.dirname(zielPfad);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.${path.basename(zielPfad)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  let fd;
  const schreibe = (chunk) => { if (chunk) fs.writeSync(fd, chunk); };
  try {
    fd = fs.openSync(tmp, "w", 0o600);
    generator(schreibe);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.chmodSync(tmp, 0o600);
    return tmp;
  } catch (e) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) { /* best effort */ } }
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
    throw e;
  }
}

function sichererDollarTag(inhalt, seed) {
  let n = 0;
  for (;;) {
    const tag = `$helmut_snapshot_v2_${sha256Hex(`${seed}:${n}`).slice(0, 18)}$`;
    n += 1;
    if (!inhalt.includes(tag)) return tag;
  }
}

function wiederherstellungsSqlAusZeilen(tabelle, eintrag, zeilenIter, schreibe, limits = {}) {
  const spalten = eintrag.spalten || [];
  if (!eintrag.zeilen) {
    schreibe(`-- ${tabelle}: 0 Snapshot-Zeilen — nichts wiederherzustellen (Nachbedingung prueft 0).\n`);
    return;
  }
  const maxRows = Number.isInteger(limits.maxRows) && limits.maxRows > 0 ? limits.maxRows : JSONB_BATCH_MAX_ROWS;
  const maxBytes = Number.isInteger(limits.maxBytes) && limits.maxBytes > 0 ? limits.maxBytes : JSONB_BATCH_MAX_BYTES;
  let batch = [];
  let bytes = 0;
  const flush = () => {
    if (!batch.length) return;
    const json = JSON.stringify(batch);
    const tag = sichererDollarTag(json, tabelle);
    schreibe(
      `insert into public.${tabelle} (${spalten.join(", ")})\n`
      + `select * from jsonb_populate_recordset(null::public.${tabelle}, ${tag}${json}${tag}::jsonb);\n`
    );
    batch = [];
    bytes = 0;
  };
  for (const z of zeilenIter) {
    if (!istZeile(z)) throw fehler("snapshot-datei-zeile", `${tabelle}: Eine Zeile ist kein Objekt.`);
    const rowJson = JSON.stringify(z);
    const rowBytes = Buffer.byteLength(rowJson, "utf8") + 1;
    if (batch.length && (batch.length >= maxRows || bytes + rowBytes > maxBytes)) flush();
    batch.push(z);
    bytes += rowBytes;
  }
  flush();
}

function* zeilenAusJsonlDatei(pfad) {
  let idx = 0;
  for (const zeile of jsonlZeilenSync(pfad)) {
    idx += 1;
    let z;
    try { z = JSON.parse(zeile); } catch (e) {
      throw fehler("snapshot-datei-json", `${path.basename(pfad)}: Zeile ${idx} ist kein gueltiges JSON.`);
    }
    if (!istZeile(z)) throw fehler("snapshot-datei-zeile", `${path.basename(pfad)}: Zeile ${idx} ist kein Objekt.`);
    yield z;
  }
}

function wiederherstellungsSqlStream(tabelle, eintrag, pfad, schreibe) {
  wiederherstellungsSqlAusZeilen(tabelle, eintrag, zeilenAusJsonlDatei(pfad), schreibe);
}

function kopfZeileV2(titel, zusatz, manifest) {
  return [
    "-- ============================================================================================",
    `-- Helmut — ${titel}`,
    "-- GENERIERT von scripts/import-preflight-500-sql-generator.js. NICHT AUSGEFÜHRT.",
    `-- operation_id: ${text(manifest.operationId)}`,
    `-- Quelle (neue Kohorte): ${path.relative(path.join(__dirname, ".."), PAKET_PFAD)}`,
    `-- Snapshot: ${text(manifest.erstelltAm)} von ${text(manifest.erstelltVon) || "(unbekannt)"} · sha256 ${text(manifest.sha256)}`,
    "-- Der Snapshot wurde NICHT von diesem Werkzeug erzeugt; er ist vor der geschuetzten",
    "-- Production-Aktion separat rein lesend zu erzeugen und sicher aufzubewahren.",
    `-- ${zusatz}`,
    "-- Ausfuehrung nur innerhalb der gesonderten Import-/Aktivierungsfreigabe; dies ist KEINE",
    "-- Import- oder Aktivierungsfreigabe.",
    "-- ============================================================================================"
  ].join("\n");
}

function erzeugeErsatzSqlDateien(paket, ergebnis, sp, snapshotDir, outDir) {
  const { profileRows, mandateRows } = erzeugeZeilen(paket);
  const neueIds = ergebnis.ids.slice();
  const alteIds = sp.ids.mandat.slice().sort();
  const fremdIds = sp.ids.fremd.slice().sort();
  const manifest = sp.manifest;
  const op = text(manifest.operationId);

  const preimage = wachBlock([
    { zaehlen: (i) => zaehleProfile(i, alteIds), bedingung: `<> ${MANDATE_GESAMT}`,
      meldung: `ERSATZ VORBEDINGUNG VERLETZT: % profiles-Zeilen der Preimage-Kohorte (erwartet ${MANDATE_GESAMT})` },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", alteIds), bedingung: `<> ${MANDATE_GESAMT}`,
      meldung: `ERSATZ VORBEDINGUNG VERLETZT: % mandate_profiles-Zeilen der Preimage-Kohorte (erwartet ${MANDATE_GESAMT})` },
    { zaehlen: (i) => zaehleGesamt(i, "mandate_profiles"), bedingung: `<> ${MANDATE_GESAMT}`,
      meldung: `ERSATZ VORBEDINGUNG VERLETZT: % mandate_profiles-Zeilen gesamt — es werden NUR die ${MANDATE_GESAMT} Mandatsprofile ersetzt` },
    { zaehlen: (i) => zaehleGesamt(i, "profiles"), bedingung: `<> ${PROFILES_GESAMT}`,
      meldung: `ERSATZ VORBEDINGUNG VERLETZT: % profiles-Zeilen gesamt (erwartet ${PROFILES_GESAMT} = ${MANDATE_GESAMT} Mandatsprofile + 1 Fremdprofil)` },
    { zaehlen: (i) => zaehleProfile(i, fremdIds), bedingung: `<> ${fremdIds.length}`,
      meldung: `ERSATZ VORBEDINGUNG VERLETZT: % Fremdprofil-Zeilen vorhanden (erwartet ${fremdIds.length})` },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", fremdIds), bedingung: "<> 0",
      meldung: "ERSATZ VORBEDINGUNG VERLETZT: % Fremdprofile tragen ein Mandat (erwartet 0) — nur Mandatsprofile werden ersetzt" },
    { zaehlen: (i) => zaehleProfile(i, neueIds), bedingung: "<> 0",
      meldung: "ERSATZ VORBEDINGUNG VERLETZT: % profiles-Zeilen der neuen Kohorte existieren bereits (erwartet 0)" },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", neueIds), bedingung: "<> 0",
      meldung: "ERSATZ VORBEDINGUNG VERLETZT: % mandate_profiles-Zeilen der neuen Kohorte existieren bereits (erwartet 0)" }
  ]);

  const nachNeu = wachBlock([
    { zaehlen: (i) => zaehleProfile(i, neueIds), bedingung: `<> ${KOHORTE_GESAMT}`,
      meldung: `ERSATZ NACHBEDINGUNG VERLETZT: % neue profiles-Zeilen (erwartet ${KOHORTE_GESAMT})` },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", neueIds), bedingung: `<> ${KOHORTE_GESAMT}`,
      meldung: `ERSATZ NACHBEDINGUNG VERLETZT: % neue mandate_profiles-Zeilen (erwartet ${KOHORTE_GESAMT})` },
    { zaehlen: (i) => zaehleGesamt(i, "mandate_profiles"), bedingung: `<> ${MANDATE_GESAMT}`,
      meldung: `ERSATZ NACHBEDINGUNG VERLETZT: % mandate_profiles gesamt (erwartet exakt ${MANDATE_GESAMT})` },
    { zaehlen: (i) => zaehleGesamt(i, "profiles"), bedingung: `<> ${PROFILES_GESAMT}`,
      meldung: `ERSATZ NACHBEDINGUNG VERLETZT: % profiles gesamt (erwartet exakt ${PROFILES_GESAMT})` },
    { zaehlen: (i) => zaehleProfile(i, alteIds), bedingung: "<> 0",
      meldung: "ERSATZ NACHBEDINGUNG VERLETZT: % alte Preimage-profiles-Zeilen verbleiben (erwartet 0)" },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", neueIds, " and aktiv is not false"), bedingung: "<> 0",
      meldung: "ERSATZ NACHBEDINGUNG VERLETZT: % neue Mandatszeilen sind aktiv (erwartet 0 aktive)" },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", neueIds, ` and ${AFD_SQL}`), bedingung: "<> 0",
      meldung: "ERSATZ NACHBEDINGUNG VERLETZT: % neue Mandatszeilen tragen AfD-Zugehoerigkeit (erwartet 0)" },
    { zaehlen: (i) => zaehleProfile(i, fremdIds), bedingung: `<> ${fremdIds.length}`,
      meldung: `ERSATZ NACHBEDINGUNG VERLETZT: % Fremdprofil-Zeilen erhalten (erwartet ${fremdIds.length} unangetastet)` },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", fremdIds), bedingung: "<> 0",
      meldung: "ERSATZ NACHBEDINGUNG VERLETZT: % Fremdprofile tragen ein Mandat (erwartet 0)" }
  ]);

  const guardPruefungen = [
    { zaehlen: (i) => zaehleProfile(i, neueIds), bedingung: `<> ${KOHORTE_GESAMT}`,
      meldung: `RUECKWEG VORBEDINGUNG VERLETZT: % neue profiles-Zeilen vorhanden (erwartet ${KOHORTE_GESAMT})` },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", neueIds), bedingung: `<> ${KOHORTE_GESAMT}`,
      meldung: `RUECKWEG VORBEDINGUNG VERLETZT: % neue mandate_profiles-Zeilen vorhanden (erwartet ${KOHORTE_GESAMT})` }
  ];
  for (const name of FK_KINDTABELLEN) {
    if (name === "mandate_profiles") continue;
    guardPruefungen.push({
      zaehlen: (i) => zaehleKohorte(i, name, neueIds), bedingung: "<> 0",
      meldung: `RUECKWEG VORBEDINGUNG VERLETZT: % UNERWARTETE neue Kinddaten in public.${name} zur neuen Kohorte (erwartet 0)`
    });
  }
  const guard = wachBlock(guardPruefungen);

  const rollPruefungen = [
    { zaehlen: (i) => zaehleGesamt(i, "profiles"), bedingung: `<> ${PROFILES_GESAMT}`,
      meldung: `RUECKWEG NACHBEDINGUNG VERLETZT: % profiles gesamt (erwartet ${PROFILES_GESAMT})` },
    { zaehlen: (i) => zaehleGesamt(i, "mandate_profiles"), bedingung: `<> ${MANDATE_GESAMT}`,
      meldung: `RUECKWEG NACHBEDINGUNG VERLETZT: % mandate_profiles gesamt (erwartet ${MANDATE_GESAMT})` },
    { zaehlen: (i) => zaehleProfile(i, alteIds), bedingung: `<> ${MANDATE_GESAMT}`,
      meldung: `RUECKWEG NACHBEDINGUNG VERLETZT: % Preimage-profiles-Zeilen wiederhergestellt (erwartet ${MANDATE_GESAMT})` },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", alteIds), bedingung: `<> ${MANDATE_GESAMT}`,
      meldung: `RUECKWEG NACHBEDINGUNG VERLETZT: % Preimage-mandate_profiles-Zeilen wiederhergestellt (erwartet ${MANDATE_GESAMT})` },
    { zaehlen: (i) => zaehleProfile(i, neueIds), bedingung: "<> 0",
      meldung: "RUECKWEG NACHBEDINGUNG VERLETZT: % neue profiles-Zeilen verbleiben (erwartet 0)" },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", neueIds), bedingung: "<> 0",
      meldung: "RUECKWEG NACHBEDINGUNG VERLETZT: % neue mandate_profiles-Zeilen verbleiben (erwartet 0)" },
    { zaehlen: (i) => zaehleProfile(i, fremdIds), bedingung: `<> ${fremdIds.length}`,
      meldung: `RUECKWEG NACHBEDINGUNG VERLETZT: % Fremdprofil-Zeilen erhalten (erwartet ${fremdIds.length})` },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", fremdIds), bedingung: "<> 0",
      meldung: "RUECKWEG NACHBEDINGUNG VERLETZT: % Fremdprofile tragen ein Mandat (erwartet 0)" },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", alteIds, " and aktiv is not false"), bedingung: "<> 0",
      meldung: "RUECKWEG NACHBEDINGUNG VERLETZT: % Preimage-Mandatszeilen aktiv (erwartet 0 aktive)" },
    { zaehlen: (i) => zaehleKohorte(i, "mandate_profiles", alteIds, ` and ${AFD_SQL}`), bedingung: "<> 0",
      meldung: "RUECKWEG NACHBEDINGUNG VERLETZT: % Preimage-Mandatszeilen mit AfD-Zugehoerigkeit (erwartet 0)" }
  ];
  for (const name of FK_KINDTABELLEN) {
    const eintrag = sp.dateien[name];
    const erwartet = istZeile(eintrag) ? eintrag.zeilen : 0;
    rollPruefungen.push({
      zaehlen: (i) => zaehleKohorte(i, name, alteIds), bedingung: `<> ${erwartet}`,
      meldung: `RUECKWEG NACHBEDINGUNG VERLETZT: % Snapshot-Zeilen in public.${name} (erwartet ${erwartet})`
    });
  }
  const nachAlt = wachBlock(rollPruefungen);

  const forwardZiel = path.join(outDir, "500er-ersatz.sql");
  const rollbackZiel = path.join(outDir, "500er-ersatz-rueckweg.sql");
  const forward = [
    kopfZeileV2("500er-ERSATZ Bundestag / Abgeordnetenhaus Berlin / Landtag Brandenburg — VORWAERTS",
      `Ersetzt die ${MANDATE_GESAMT} Preimage-Mandatsprofile; ${fremdIds.length} Fremdprofil(e) bleiben unangetastet.`, manifest),
    "begin;",
    "",
    "-- [SPERRE] transaktionale Sperre: kein paralleler Schreibzugriff waehrend des Ersatzes.",
    "lock table public.profiles in access exclusive mode;",
    "lock table public.mandate_profiles in access exclusive mode;",
    "",
    "-- [PREIMAGE] ausfuehrbare Vorbedingung: passende Preimage-ID-Menge, nur die 500 Mandatsprofile,",
    `-- ${PROFILES_GESAMT} profiles gesamt, Fremdprofil vorhanden und ohne Mandat, neue Kohorte noch nicht vorhanden.`,
    preimage,
    "",
    "-- [DELETE-ALT] loescht AUSSCHLIESSLICH die Preimage-profile-IDs; Kinddaten fallen ueber ON DELETE CASCADE.",
    `delete from public.profiles where id in ${sqlIdListe(alteIds)};`,
    "",
    "-- [INSERT-NEU] neue Kohorte, ALLE aktiv = false.",
    einschubSql("profiles", ["id", "name"], profileRows),
    "",
    einschubSql("mandate_profiles", MANDAT_SPALTEN, mandateRows),
    "",
    "-- [POST-NEU] ausfuehrbare Nachbedingung: 500 Mandatsprofile, 501 profiles, 0 aktiv, AfD = 0,",
    "-- Fremdprofilbestand erhalten. Jede Verletzung bricht die Transaktion ab.",
    nachNeu,
    "",
    "commit;"
  ].join("\n");

  const forwardTemp = schreibeSqlTemp(forwardZiel, (schreibe) => {
    schreibe(forward + "\n");
  });

  const rollbackTemp = schreibeSqlTemp(rollbackZiel, (schreibe) => {
    schreibe([
      kopfZeileV2("500er-ERSATZ Bundestag/Berlin/Brandenburg — ATOMARER RUECKWEG (Preimage-Wiederherstellung)",
        `Entfernt exakt die neue Kohorte und stellt die ${MANDATE_GESAMT} Snapshot-Profile samt Kinddaten wieder her.`, manifest),
      "begin;",
      "",
      "-- [SPERRE] transaktionale Sperre.",
      "lock table public.profiles in access exclusive mode;",
      "lock table public.mandate_profiles in access exclusive mode;",
      "",
      "-- [GUARD-NEU] loescht die neue Kohorte NUR, wenn keine unerwarteten neuen Kinddaten existieren.",
      guard,
      "",
      "-- [DELETE-NEU] loescht AUSSCHLIESSLICH die neue Kohorte (Kinddaten ueber ON DELETE CASCADE).",
      `delete from public.profiles where id in ${sqlIdListe(neueIds)};`,
      "",
      "-- [RESTORE-ALT] vollstaendige Snapshotdaten, FK-sichere Reihenfolge (Eltern vor Kindern).",
      ""
    ].join("\n") + "\n");
    for (const name of SNAPSHOT_TABELLEN) {
      const eintrag = sp.dateien[name];
      if (!istZeile(eintrag)) throw fehler("snapshot-datei-fehlt", `Dateieintrag fuer ${name} fehlt.`);
      wiederherstellungsSqlStream(name, eintrag, path.join(snapshotDir, dateiName(name)), schreibe);
    }
    schreibe([
      "",
      "-- [POST-ALT] ausfuehrbare Nachbedingung: exakt der Snapshot-Bestand ist wiederhergestellt.",
      nachAlt,
      "",
      "commit;",
      ""
    ].join("\n"));
  });

  return {
    forwardPfad: forwardTemp,
    rollbackPfad: rollbackTemp,
    forwardZiel,
    rollbackZiel,
    zeilen: { profileRows, mandateRows },
    neueIds,
    alteIds,
    fremdIds
  };
}

async function baueErsatzSqlDateien(paket, ergebnis, snapshotDir, kontext = {}) {
  const v = ergebnis || preflight(paket);
  if (!v.ok) {
    const e = new Error("Paket-Preflight nicht bestanden — es wird KEIN SQL erzeugt.");
    e.code = "preflight-fehler";
    e.fehler = v.fehler;
    throw e;
  }
  const sp = pruefeSnapshotVerzeichnis(snapshotDir, { paketHash: kontext.paketHash || null, neueIds: v.ids });
  if (!sp.ok) {
    const e = new Error("Preimage-Snapshot ungueltig — es wird KEIN SQL erzeugt (fail-closed).");
    e.code = "snapshot-fehler";
    e.fehler = sp.fehler;
    throw e;
  }
  const outDir = path.resolve(kontext.outDir);
  const parent = path.dirname(outDir);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (fs.existsSync(outDir)) {
    if (!fs.statSync(outDir).isDirectory()) {
      throw fehler("out-datei", `--out zeigt auf eine Datei: ${outDir}`);
    }
    if (fs.readdirSync(outDir).length) {
      throw fehler("out-vorhanden",
        `--out ist ein nicht-leeres Verzeichnis (${outDir}). Ein Forward/Rollback-Paar wird nur als atomarer neuer Run bereitgestellt.`);
    }
  }

  let stagingDir;
  try {
    stagingDir = fs.mkdtempSync(path.join(parent, ".helmut-sql-v2-"));
    const erzeugt = erzeugeErsatzSqlDateien(paket, v, sp, sp.snapshotDir, stagingDir);
    const selbst = await pruefeErsatzSqlDateien(
      { forwardPfad: erzeugt.forwardPfad, rollbackPfad: erzeugt.rollbackPfad },
      { neueIds: v.ids, alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: sp }
    );
    if (selbst.length) {
      const e = new Error("Genauigkeits-Selbsttest des erzeugten SQL nicht bestanden — kein SQL.");
      e.code = "sql-selbsttest";
      e.fehler = selbst;
      throw e;
    }
    for (const [tmp, ziel] of [[erzeugt.forwardPfad, erzeugt.forwardZiel], [erzeugt.rollbackPfad, erzeugt.rollbackZiel]]) {
      fs.chmodSync(tmp, 0o600);
      fs.renameSync(tmp, ziel);
    }
    if (fs.existsSync(outDir)) fs.rmdirSync(outDir);
    fs.renameSync(stagingDir, outDir);
    stagingDir = null;
    const forwardZiel = path.join(outDir, "500er-ersatz.sql");
    const rollbackZiel = path.join(outDir, "500er-ersatz-rueckweg.sql");
    return { ...erzeugt, forwardPfad: forwardZiel, rollbackPfad: rollbackZiel, forwardZiel, rollbackZiel, snapshot: sp };
  } catch (e) {
    if (stagingDir) {
      try { if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
    }
    throw e;
  }
}

// ── Selbsttest des erzeugten SQL (Struktur + Vertrag, ohne Ausfuehrung) ─────────────────────
function sqlAnweisungen(sql) {
  return sql.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("--"));
}

function deleteIdListe(sql, tabelle) {
  const re = new RegExp(`delete\\s+from\\s+public\\.${tabelle}\\s+where\\s+user_id\\s+in\\s*\\(([^)]*)\\)`, "i");
  const reId = new RegExp(`delete\\s+from\\s+public\\.${tabelle}\\s+where\\s+id\\s+in\\s*\\(([^)]*)\\)`, "i");
  const m = sql.match(re) || sql.match(reId);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

function pruefeErsatzSql(sql, { neueIds, alteIds, fremdIds, snapshot }) {
  const fehler = [];
  const add = (code, text_) => fehler.push({ code, text: text_ });
  const gleich = (a, b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());

  for (const [name, s] of [["forward", sql.forward], ["rollback", sql.rollback]]) {
    const z = sqlAnweisungen(s);
    const begins = z.filter((l) => /^begin;$/i.test(l)).length;
    const commits = z.filter((l) => /^commit;$/i.test(l)).length;
    if (begins !== 1) add(`${name}-transaktion`, `${name} hat ${begins} "begin;" (erwartet genau 1 — atomar).`);
    if (commits !== 1) add(`${name}-transaktion`, `${name} hat ${commits} "commit;" (erwartet genau 1 — atomar).`);
    if (z.length && z[0].toLowerCase() !== "begin;") add(`${name}-start`, `${name} beginnt nicht mit "begin;".`);
    if (z.length && z[z.length - 1].toLowerCase() !== "commit;") add(`${name}-ende`, `${name} endet nicht mit "commit;".`);
    if (!/lock\s+table\s+public\.profiles\s+in\s+access\s+exclusive\s+mode/i.test(s)) {
      add(`${name}-sperre`, `${name} sperrt public.profiles nicht transaktional.`);
    }
    if (!/lock\s+table\s+public\.mandate_profiles\s+in\s+access\s+exclusive\s+mode/i.test(s)) {
      add(`${name}-sperre`, `${name} sperrt public.mandate_profiles nicht transaktional.`);
    }
  }

  // Fail-closed Reihenfolge: der ausfuehrbare Riegel (do $$ ... raise exception ... end $$;) muss
  // vollstaendig VOR der ersten Schreiboperation stehen — ein nachgelagerter Riegel koennte eine
  // bereits begonnene Mutation nicht mehr verhindern. Reine Positionspruefung auf dem Text, ohne
  // Ausfuehrung. Kommentarzeilen werden ignoriert, damit Beschriftungen wie "-- [INSERT-NEU]"
  // nicht als Mutation zaehlen.
  const ersteSchreibposition = (s) => {
    const re = /\b(insert\s+into|update\s+public|delete\s+from|alter\s+table|truncate)\b/i;
    let offset = 0;
    for (const zeile of s.split("\n")) {
      const rumpf = zeile.replace(/--.*$/, "");
      if (re.test(rumpf)) return offset + rumpf.search(re);
      offset += zeile.length + 1;
    }
    return -1;
  };
  for (const [name, s] of [["forward", sql.forward], ["rollback", sql.rollback]]) {
    const posMutation = ersteSchreibposition(s);
    if (posMutation < 0) continue; // fehlende Schreiboperation melden die Einzelpruefungen unten
    const posRiegel = s.indexOf("do $$");
    const posEnde = posRiegel >= 0 ? s.indexOf("end $$;", posRiegel) : -1;
    const posBeginn = s.search(/^\s*begin;/mi);
    if (!(posBeginn >= 0 && posBeginn < posRiegel && posRiegel < posEnde && posEnde < posMutation)) {
      add(`${name}-riegel-reihenfolge`,
        `${name}: fail-closed Riegel (do $$ ... end $$;) steht nicht vollstaendig vor der ersten Schreiboperation.`);
    }
  }

  if (!/VORBEDINGUNG VERLETZT/.test(sql.forward)) add("forward-vorbedingung", "Vorwaerts-SQL enthaelt keine ausfuehrbare Vorbedingung.");
  const nach = (sql.forward.match(/NACHBEDINGUNG VERLETZT/g) || []).length;
  if (nach < 6) add("forward-nachbedingung", `Vorwaerts-SQL hat nur ${nach} Nachbedingung(en); erwartet >= 6 (500, 501, aktiv, AfD, Fremdprofil, Altbestand).`);
  if ((sql.forward.match(/delete\s+from\s+public\./gi) || []).length !== 1) {
    add("forward-delete-anzahl", "Vorwaerts-SQL hat nicht genau ein delete (nur profiles, Cascades).");
  }
  if (deleteIdListe(sql.forward, "mandate_profiles")) {
    add("forward-delete-mandate", "Vorwaerts-SQL loescht mandate_profiles explizit (erwartet: nur profiles, Cascades).");
  }
  const fDel = deleteIdListe(sql.forward, "profiles");
  if (!fDel) add("forward-delete", "Vorwaerts-SQL loescht profiles nicht kennungsgebunden.");
  else if (!gleich(fDel, alteIds)) add("forward-delete-ids", "Vorwaerts-delete trifft nicht exakt die Preimage-ID-Menge.");

  if ((sql.forward.match(/\binsert\s+into\s+public\.profiles\b/gi) || []).length !== 1) add("forward-insert-profiles", "Vorwaerts-SQL hat nicht genau ein Insert in public.profiles.");
  if ((sql.forward.match(/\binsert\s+into\s+public\.mandate_profiles\b/gi) || []).length !== 1) add("forward-insert-mandate", "Vorwaerts-SQL hat nicht genau ein Insert in public.mandate_profiles.");
  if (!/ilike\s+'%afd%'/i.test(sql.forward)) add("forward-afd-wache", "Vorwaerts-SQL enthaelt keine AfD-Nachbedingung.");
  if (!sql.forward.includes(`= ${MANDATE_GESAMT}`) && !sql.forward.includes(`<> ${MANDATE_GESAMT}`)) add("forward-500", `Vorwaerts-SQL prueft nicht ${MANDATE_GESAMT} Mandatsprofile.`);
  if (!sql.forward.includes(`= ${PROFILES_GESAMT}`) && !sql.forward.includes(`<> ${PROFILES_GESAMT}`)) add("forward-501", `Vorwaerts-SQL prueft nicht ${PROFILES_GESAMT} profiles gesamt.`);
  const fehlendF = neueIds.filter((id) => !sql.forward.includes(sqlText(id)));
  if (fehlendF.length) add("forward-ids-fehlen", `${fehlendF.length} neue Kohorten-Kennung(en) fehlen im Vorwaerts-SQL.`);
  const fehlendAlt = alteIds.filter((id) => !sql.forward.includes(sqlText(id)));
  if (fehlendAlt.length) add("forward-preimage-ids-fehlen", `${fehlendAlt.length} Preimage-Kennung(en) fehlen im Vorwaerts-SQL.`);
  const fDelSet = new Set(fDel || []);
  if (fremdIds.some((id) => fDelSet.has(id))) add("forward-fremd-geloescht", "Vorwaerts-delete trifft ein Fremdprofil (verboten: bleibt unangetastet).");

  if (!/UNERWARTETE neue Kinddaten/.test(sql.rollback)) add("rollback-guard", "Rueckweg-SQL hat keinen Guard gegen unerwartete neue Kinddaten.");
  if ((sql.rollback.match(/delete\s+from\s+public\./gi) || []).length !== 1) {
    add("rollback-delete-anzahl", "Rueckweg hat nicht genau ein delete (nur profiles, Cascades).");
  }
  if (deleteIdListe(sql.rollback, "mandate_profiles")) {
    add("rollback-delete-mandate", "Rueckweg loescht mandate_profiles explizit (erwartet: nur profiles, Cascades).");
  }
  const rDel = deleteIdListe(sql.rollback, "profiles");
  if (!rDel) add("rollback-delete", "Rueckweg loescht profiles nicht kennungsgebunden.");
  else if (!gleich(rDel, neueIds)) add("rollback-delete-ids", "Rueckweg-delete trifft nicht exakt die neue Kohorte.");

  if (!/NACHBEDINGUNG VERLETZT/.test(sql.rollback)) add("rollback-nachbedingung", "Rueckweg-SQL enthaelt keine ausfuehrbare Nachbedingung.");
  let letzte = -1;
  const tab = snapshot.tabellen;
  for (const name of SNAPSHOT_TABELLEN) {
    const zeilen = Array.isArray(tab[name]) ? tab[name] : [];
    if (!zeilen.length) continue;
    const pos = sql.rollback.indexOf(`insert into public.${name} `);
    if (pos < 0) { add("rollback-restore-fehlt", `Rueckweg stellt public.${name} nicht wieder her.`); continue; }
    if (pos < letzte) add("rollback-restore-reihenfolge", `Rueckweg stellt public.${name} nicht in FK-sicherer Reihenfolge wieder her.`);
    letzte = pos;
    if (!sql.rollback.includes(sqlText(alteIds[0]))) {
      add("rollback-inhalt", `Rueckweg enthaelt die Snapshot-Zeilen von public.${name} nicht.`);
    }
  }
  if (!/insert\s+into\s+public\.profiles\b/i.test(sql.rollback)) add("rollback-restore-profiles", "Rueckweg stellt profiles nicht wieder her.");
  if (!/insert\s+into\s+public\.mandate_profiles\b/i.test(sql.rollback)) add("rollback-restore-mandate", "Rueckweg stellt mandate_profiles nicht wieder her.");
  if (!/jsonb_populate_recordset/.test(sql.rollback)) add("rollback-spaltenvollstaendig", "Rueckweg nutzt keine spaltenvollstaendige Wiederherstellung.");
  if (/\bupdate\s+public\.|\balter\s+table\b/i.test(sql.rollback)) add("rollback-nur-wiederherstellung", "Rueckweg enthaelt Update/DDL (erwartet: nur delete + insert).");

  return fehler;
}

// ── Selbsttest fuer die streaming-erzeugten SQL-DATEIEN (zeilenweise, ohne Gesamtarray) ─────
async function* sqlZeilen(pfad) {
  const rl = readline.createInterface({ input: fs.createReadStream(pfad), crlfDelay: Infinity });
  for await (const zeile of rl) yield zeile;
}

async function pruefeErsatzSqlDateien({ forwardPfad, rollbackPfad }, { neueIds, alteIds, fremdIds, snapshot }) {
  const fehler = [];
  const add = (code, text_) => fehler.push({ code, text: text_ });
  const gleich = (a, b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());
  const ersteSchreibRe = /\b(insert\s+into|update\s+public|delete\s+from|alter\s+table|truncate)\b/i;

  async function pruefeGemeinsam(name, pfad, onZeile) {
    const st = {
      begins: 0,
      commits: 0,
      ersteAnweisung: null,
      letzteAnweisung: null,
      lockProfiles: false,
      lockMandate: false,
      riegelStart: -1,
      riegelEnde: -1,
      ersteMutation: -1,
      zeilennummer: 0
    };
    for await (const roh of sqlZeilen(pfad)) {
      st.zeilennummer += 1;
      const rumpf = roh.replace(/--.*$/, "");
      const anweisung = rumpf.trim();
      if (anweisung) {
        if (st.ersteAnweisung === null) st.ersteAnweisung = anweisung;
        st.letzteAnweisung = anweisung;
        if (/^begin;$/i.test(anweisung)) st.begins += 1;
        if (/^commit;$/i.test(anweisung)) st.commits += 1;
      }
      if (/lock\s+table\s+public\.profiles\s+in\s+access\s+exclusive\s+mode/i.test(roh)) st.lockProfiles = true;
      if (/lock\s+table\s+public\.mandate_profiles\s+in\s+access\s+exclusive\s+mode/i.test(roh)) st.lockMandate = true;
      if (!/^\s*--/.test(roh)) {
        if (st.riegelStart < 0 && /do\s+\$\$/.test(rumpf)) st.riegelStart = st.zeilennummer;
        if (st.riegelStart >= 0 && st.riegelEnde < 0 && /end\s+\$\$;/.test(rumpf)) st.riegelEnde = st.zeilennummer;
      }
      if (st.ersteMutation < 0 && ersteSchreibRe.test(rumpf)) st.ersteMutation = st.zeilennummer;
      if (onZeile) onZeile({ roh, rumpf, anweisung, st });
    }
    if (st.begins !== 1) add(`${name}-transaktion`, `${name} hat ${st.begins} "begin;" (erwartet genau 1 — atomar).`);
    if (st.commits !== 1) add(`${name}-transaktion`, `${name} hat ${st.commits} "commit;" (erwartet genau 1 — atomar).`);
    if (st.ersteAnweisung !== null && st.ersteAnweisung.toLowerCase() !== "begin;") add(`${name}-start`, `${name} beginnt nicht mit "begin;".`);
    if (st.letzteAnweisung !== null && st.letzteAnweisung.toLowerCase() !== "commit;") add(`${name}-ende`, `${name} endet nicht mit "commit;".`);
    if (!st.lockProfiles) add(`${name}-sperre`, `${name} sperrt public.profiles nicht transaktional.`);
    if (!st.lockMandate) add(`${name}-sperre`, `${name} sperrt public.mandate_profiles nicht transaktional.`);
    if (st.ersteMutation >= 0 && !(st.riegelStart >= 0 && st.riegelEnde >= 0 && st.riegelEnde < st.ersteMutation)) {
      add(`${name}-riegel-reihenfolge`,
        `${name}: fail-closed Riegel (do $$ ... end $$;) steht nicht vollstaendig vor der ersten Schreiboperation.`);
    }
    return st;
  }

  const fehlenF = new Set(neueIds.map(String));
  const fehlenAlt = new Set(alteIds.map(String));
  const fZustand = {
    vorbedingung: false,
    nachbedingung: 0,
    deleteAnzahl: 0,
    deleteZeile: null,
    insertProfiles: 0,
    insertMandate: 0,
    afdWache: false,
    fuenfhundert: false,
    fuenfhundertundeins: false
  };
  const f = await pruefeGemeinsam("forward", forwardPfad, ({ roh, rumpf }) => {
    if (/VORBEDINGUNG VERLETZT/.test(roh)) fZustand.vorbedingung = true;
    fZustand.nachbedingung += (roh.match(/NACHBEDINGUNG VERLETZT/g) || []).length;
    if (/delete\s+from\s+public\./i.test(rumpf)) {
      fZustand.deleteAnzahl += 1;
      if (!fZustand.deleteZeile) fZustand.deleteZeile = roh;
    }
    if (/\binsert\s+into\s+public\.profiles\b/i.test(rumpf)) fZustand.insertProfiles += 1;
    if (/\binsert\s+into\s+public\.mandate_profiles\b/i.test(rumpf)) fZustand.insertMandate += 1;
    if (/ilike\s+'%afd%'/i.test(roh)) fZustand.afdWache = true;
    if (roh.includes(`= ${MANDATE_GESAMT}`) || roh.includes(`<> ${MANDATE_GESAMT}`)) fZustand.fuenfhundert = true;
    if (roh.includes(`= ${PROFILES_GESAMT}`) || roh.includes(`<> ${PROFILES_GESAMT}`)) fZustand.fuenfhundertundeins = true;
    for (const id of [...fehlenF]) if (roh.includes(sqlText(id))) fehlenF.delete(id);
    for (const id of [...fehlenAlt]) if (roh.includes(sqlText(id))) fehlenAlt.delete(id);
  });
  Object.assign(f, fZustand);

  if (!fZustand.vorbedingung) add("forward-vorbedingung", "Vorwaerts-SQL enthaelt keine ausfuehrbare Vorbedingung.");
  if (fZustand.nachbedingung < 6) add("forward-nachbedingung", `Vorwaerts-SQL hat nur ${fZustand.nachbedingung} Nachbedingung(en); erwartet >= 6.`);
  if (fZustand.deleteAnzahl !== 1) add("forward-delete-anzahl", "Vorwaerts-SQL hat nicht genau ein delete (nur profiles, Cascades).");
  if (deleteIdListe(fZustand.deleteZeile || "", "mandate_profiles")) {
    add("forward-delete-mandate", "Vorwaerts-SQL loescht mandate_profiles explizit (erwartet: nur profiles, Cascades).");
  }
  const fDel = deleteIdListe(fZustand.deleteZeile || "", "profiles");
  if (!fDel) add("forward-delete", "Vorwaerts-SQL loescht profiles nicht kennungsgebunden.");
  else if (!gleich(fDel, alteIds)) add("forward-delete-ids", "Vorwaerts-delete trifft nicht exakt die Preimage-ID-Menge.");
  if (fZustand.insertProfiles !== 1) add("forward-insert-profiles", "Vorwaerts-SQL hat nicht genau ein Insert in public.profiles.");
  if (fZustand.insertMandate !== 1) add("forward-insert-mandate", "Vorwaerts-SQL hat nicht genau ein Insert in public.mandate_profiles.");
  if (!fZustand.afdWache) add("forward-afd-wache", "Vorwaerts-SQL enthaelt keine AfD-Nachbedingung.");
  if (!fZustand.fuenfhundert) add("forward-500", `Vorwaerts-SQL prueft nicht ${MANDATE_GESAMT} Mandatsprofile.`);
  if (!fZustand.fuenfhundertundeins) add("forward-501", `Vorwaerts-SQL prueft nicht ${PROFILES_GESAMT} profiles gesamt.`);
  if (fehlenF.size) add("forward-ids-fehlen", `${fehlenF.size} neue Kohorten-Kennung(en) fehlen im Vorwaerts-SQL.`);
  if (fehlenAlt.size) add("forward-preimage-ids-fehlen", `${fehlenAlt.size} Preimage-Kennung(en) fehlen im Vorwaerts-SQL.`);
  const fDelSet = new Set(fDel || []);
  if (fremdIds.some((id) => fDelSet.has(id))) add("forward-fremd-geloescht", "Vorwaerts-delete trifft ein Fremdprofil (verboten: bleibt unangetastet).");

  const r = {
    deleteAnzahl: 0,
    deleteZeile: null,
    guard: false,
    nachbedingung: false,
    jsonb: false,
    updateDdl: false,
    batchAnzahl: new Map(),
    erstePosition: new Map(),
    jsonbTabellen: new Set(),
    pendingInsert: null,
    strukturFehler: false
  };
  await pruefeGemeinsam("rollback", rollbackPfad, ({ roh, rumpf, st }) => {
    if (/delete\s+from\s+public\./i.test(rumpf)) {
      r.deleteAnzahl += 1;
      if (!r.deleteZeile) r.deleteZeile = roh;
    }
    if (/UNERWARTETE neue Kinddaten/.test(roh)) r.guard = true;
    if (/NACHBEDINGUNG VERLETZT/.test(roh)) r.nachbedingung = true;
    if (/jsonb_populate_recordset/.test(roh)) r.jsonb = true;
    if (/\bupdate\s+public\.|\balter\s+table\b/i.test(rumpf)) r.updateDdl = true;

    const ins = rumpf.match(/^insert\s+into\s+public\.([a-z_][a-z0-9_]*)\s*\(/i);
    const sel = rumpf.match(/^select\s+\*\s+from\s+jsonb_populate_recordset\(null::public\.([a-z_][a-z0-9_]*),/i);
    if (ins && !sel) {
      if (r.pendingInsert) r.strukturFehler = true;
      r.pendingInsert = ins[1];
      if (!r.erstePosition.has(ins[1])) r.erstePosition.set(ins[1], st.zeilennummer);
    }
    if (sel) {
      if (r.pendingInsert !== sel[1]) r.strukturFehler = true;
      else {
        r.batchAnzahl.set(sel[1], (r.batchAnzahl.get(sel[1]) || 0) + 1);
        r.jsonbTabellen.add(sel[1]);
        r.pendingInsert = null;
      }
    }
  });
  if (r.pendingInsert) r.strukturFehler = true;

  if (r.deleteAnzahl !== 1) add("rollback-delete-anzahl", "Rueckweg hat nicht genau ein delete (nur profiles, Cascades).");
  if (deleteIdListe(r.deleteZeile || "", "mandate_profiles")) {
    add("rollback-delete-mandate", "Rueckweg loescht mandate_profiles explizit (erwartet: nur profiles, Cascades).");
  }
  const rDel = deleteIdListe(r.deleteZeile || "", "profiles");
  if (!rDel) add("rollback-delete", "Rueckweg loescht profiles nicht kennungsgebunden.");
  else if (!gleich(rDel, neueIds)) add("rollback-delete-ids", "Rueckweg-delete trifft nicht exakt die neue Kohorte.");
  if (!r.guard) add("rollback-guard", "Rueckweg-SQL hat keinen Guard gegen unerwartete neue Kinddaten.");
  if (!r.nachbedingung) add("rollback-nachbedingung", "Rueckweg-SQL enthaelt keine ausfuehrbare Nachbedingung.");
  if (!r.jsonb) add("rollback-spaltenvollstaendig", "Rueckweg nutzt keine spaltenvollstaendige Wiederherstellung.");
  if (r.updateDdl) add("rollback-nur-wiederherstellung", "Rueckweg enthaelt Update/DDL (erwartet: nur delete + insert).");
  if (r.strukturFehler) {
    add("rollback-restore-struktur", "Rueckweg enthaelt keinen vollwertigen INSERT ... SELECT * FROM jsonb_populate_recordset(...) je JSONB-Batch.");
  }

  let letztePosition = -1;
  for (const name of SNAPSHOT_TABELLEN) {
    const eintrag = snapshot.dateien[name];
    if (!istZeile(eintrag) || !eintrag.zeilen) continue;
    // Mindestzahl an Batches aus der Zeilenobergrenze. Die 4-MiB-Bytegrenze darf bei
    // sehr grossen payload-Zeilen korrekt ZUSAETZLICHE Batches erzeugen, daher ist nur
    // eine zu geringe Batch-Zahl (fehlende Inserts) ein Fehler, keine hoehere.
    const mindestens = Math.ceil(eintrag.zeilen / JSONB_BATCH_MAX_ROWS);
    const anzahl = r.batchAnzahl.get(name) || 0;
    const pos = r.erstePosition.get(name);
    if (pos === undefined) {
      add("rollback-restore-fehlt", `Rueckweg stellt public.${name} nicht wieder her.`);
      continue;
    }
    if (pos < letztePosition) add("rollback-restore-reihenfolge", `Rueckweg stellt public.${name} nicht in FK-sicherer Reihenfolge wieder her.`);
    letztePosition = pos;
    if (anzahl < mindestens) {
      add("rollback-restore-batch-anzahl",
        `Rueckweg stellt public.${name} mit nur ${anzahl} vollwertigen JSONB-Statements wieder her (mindestens ${mindestens} bei ${eintrag.zeilen} Zeilen erwartet).`);
    }
    if (!r.jsonbTabellen.has(name)) {
      add("rollback-restore-jsonb", `Rueckweg stellt public.${name} nicht ueber jsonb_populate_recordset wieder her.`);
    }
  }
  if (!r.erstePosition.has("profiles")) add("rollback-restore-profiles", "Rueckweg stellt profiles nicht wieder her.");
  if (!r.erstePosition.has("mandate_profiles")) add("rollback-restore-mandate", "Rueckweg stellt mandate_profiles nicht wieder her.");

  return fehler;
}

// ── Bericht / CLI ────────────────────────────────────────────────────────────────────────
function bericht(ergebnis) {
  const zeilen = [];
  zeilen.push(`Kohorte: ${ergebnis.profile} Profile · Verteilung: ${JSON.stringify(ergebnis.zaehlung)}`);
  for (const f of ergebnis.fehler) {
    zeilen.push(`  FEHLER [${f.code}] ${f.text}`);
    if (f.hinweis) zeilen.push(`         -> ${f.hinweis}`);
  }
  zeilen.push(ergebnis.ok ? "ERGEBNIS: Paket importierbar" : "ERGEBNIS: Paket NICHT importierbar (kein SQL erzeugt)");
  return zeilen.join("\n");
}

function snapshotBericht(fehler) {
  return ["Preimage-Snapshot ungueltig — es wird KEIN SQL erzeugt (fail-closed)."]
    .concat(fehler.map((f) => `  FEHLER [${f.code}] ${f.text}${f.hinweis ? `\n         -> ${f.hinweis}` : ""}`))
    .join("\n");
}

function ladeDatei(pfad) { return JSON.parse(fs.readFileSync(pfad, "utf8")); }
function ladePaket(pfad) { return ladeDatei(pfad); }

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
  const rootReal = fs.realpathSync(path.join(__dirname, ".."));
  const rel = path.relative(rootReal, realPfadAus(zielPfad));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function parseArgs(argv) {
  const opts = { paket: null, out: null, snapshot: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--paket") opts.paket = argv[++i];
    else if (argv[i] === "--out") opts.out = argv[++i];
    else if (argv[i] === "--snapshot") opts.snapshot = argv[++i];
  }
  return opts;
}

async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const paketPfad = opts.paket ? path.resolve(opts.paket) : PAKET_PFAD;

  if (!opts.snapshot) {
    process.stderr.write(
      "FAIL-CLOSED: Kein Preimage-Snapshot uebergeben (--snapshot <v2-snapshot-verzeichnis>).\n"
      + "Dieses Werkzeug erzeugt KEINEN additiven Import und KEINEN 'Rollback', der nur die neue\n"
      + "Kohorte loescht. Der vollstaendige Preimage-Snapshot ist vom Betreiber VOR der geschuetzten\n"
      + "Production-Aktion separat rein lesend zu erzeugen und sicher aufzubewahren. Es wird kein SQL ausgegeben.\n");
    return 2;
  }
  if (!opts.out) {
    process.stderr.write(
      "FAIL-CLOSED: Kein Ausgabeverzeichnis uebergeben (--out <dir>).\n"
      + "Der v2-Generator schreibt Forward und Rollback als 0600-Dateien und gibt KEIN SQL auf stdout aus.\n");
    return 2;
  }

  const snapshotDir = path.resolve(opts.snapshot);
  const outDir = path.resolve(opts.out);
  if (liegtImRepo(outDir)) {
    process.stderr.write("FAIL-CLOSED: --out muss AUSSERHALB des Repository-Root liegen.\n");
    return 2;
  }
  if (fs.existsSync(outDir) && !fs.statSync(outDir).isDirectory()) {
    process.stderr.write(`FAIL-CLOSED: --out zeigt auf eine Datei: ${outDir}\n`);
    return 2;
  }
  if (!fs.existsSync(snapshotDir) || !fs.statSync(snapshotDir).isDirectory()) {
    process.stderr.write(`FAIL-CLOSED: --snapshot ist kein v2-Snapshot-Verzeichnis: ${snapshotDir}\n`);
    return 2;
  }

  let paket;
  try {
    paket = ladePaket(paketPfad);
  } catch (e) {
    process.stderr.write(`Paket nicht lesbar/parsebar: ${paketPfad}\n${String(e && e.message)}\n`);
    return 2;
  }

  const ergebnis = preflight(paket);
  if (!ergebnis.ok) {
    process.stderr.write(bericht(ergebnis) + "\n");
    return 2;
  }

  let paketHashHex = null;
  try {
    paketHashHex = hashPaket(paketPfad);
  } catch (e) {
    process.stderr.write(`Paket-Hash nicht berechenbar: ${String(e && e.message)}\n`);
    return 2;
  }

  const sp = pruefeSnapshotVerzeichnis(snapshotDir, { paketHash: paketHashHex, neueIds: ergebnis.ids });
  if (!sp.ok) {
    process.stderr.write(snapshotBericht(sp.fehler) + "\n");
    return 2;
  }

  try {
    await baueErsatzSqlDateien(paket, ergebnis, snapshotDir, { paketHash: paketHashHex, outDir });
  } catch (e) {
    if (e && e.code === "sql-selbsttest") {
      process.stderr.write("SQL-Selbsttest NICHT bestanden — kein SQL ausgegeben:\n"
        + (e.fehler || []).map((f) => `  FEHLER [${f.code}] ${f.text}`).join("\n") + "\n");
      return 3;
    }
    process.stderr.write(`${String(e && e.message)}\n`);
    return 2;
  }

  process.stdout.write(
    "Preflight + v2-Snapshot gruen. SQL geschrieben (mode 0600, atomar, nicht ausgefuehrt).\n"
    + `  Vorwaerts: ${path.join(outDir, "500er-ersatz.sql")}\n`
    + `  Rueckweg: ${path.join(outDir, "500er-ersatz-rueckweg.sql")}\n`
    + `  Snapshot: ${snapshotDir} · operationId ${sp.manifest.operationId} · sha256 ${sp.manifest.sha256}\n`);
  return 0;
}

// Bewusst process.exitCode statt process.exit(): bei gepuffertem stdout (Pipe) wuerde
// process.exit() das noch nicht geflushte SQL abschneiden.
if (require.main === module) {
  main().then((code) => { process.exitCode = code; }, (e) => {
    process.stderr.write(`${String(e && e.stack || e)}\n`);
    process.exitCode = 2;
  });
}

module.exports = {
  PAKET_PFAD,
  KOHORTE_GESAMT,
  MANDATE_GESAMT,
  PROFILES_GESAMT,
  ERWARTET,
  SNAPSHOT_VERTRAG,
  SNAPSHOT_TABELLEN,
  FK_KINDTABELLEN,
  MANDAT_SPALTEN,
  MANIFEST_DATEI,
  FREMD_TABELLE,
  V2_SNAPSHOT_DATEIEN,
  JSONB_BATCH_MAX_ROWS,
  JSONB_BATCH_MAX_BYTES,
  preflight,
  erzeugeZeilen,
  pruefeSnapshot,
  pruefeSnapshotVerzeichnis,
  erzeugeErsatzSql,
  baueErsatzSql,
  erzeugeErsatzSqlDateien,
  baueErsatzSqlDateien,
  wiederherstellungsSqlAusZeilen,
  hashDateiSync,
  jsonlZeilenSync,
  pruefeErsatzSql,
  pruefeErsatzSqlDateien,
  kanonisch,
  hashSnapshot,
  hashPaket,
  dateiName,
  bericht,
  ladeDatei,
  ladePaket,
  main
};
