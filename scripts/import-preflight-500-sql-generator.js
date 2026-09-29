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
// SNAPSHOT-VERTRAG (versioniert, lokal pruefbar)
//   {
//     "snapshotVertrag": "helmut-500-preimage/1",
//     "operationId": "<eindeutige Kennung des Ersatzes>",
//     "erstelltAm": "<ISO-Zeitstempel>",
//     "erstelltVon": "<wer/womit, rein lesend>",
//     "paket": { "pfad": "...", "sha256": "<SHA-256 der Paketdatei>" },
//     "bestand": { "profilesGesamt": 501, "mandateProfilesGesamt": 500, "aktivGesamt": 0 },
//     "ids": { "mandat": ["<500 IDs>"], "fremd": ["<IDs der profiles ohne Mandat>"] },
//     "fremd_profiles": [ { "id": "...", "name": "..." } ],
//     "tabellen": {
//       "profiles": [ <genau 500 vollstaendige alte profiles-Zeilen> ],
//       "mandate_profiles": [ <genau 500 vollstaendige alte mandate_profiles-Zeilen> ],
//       "<jede FK-Kindtabelle>": [ <vollstaendiger Tabellenabschnitt der Preimage-Kohorte> ]
//     },
//     "sha256": "<SHA-256 des Snapshots ohne dieses Feld, kanonisches JSON>"
//   }
//   * GENAU 500 profiles- und 500 mandate_profiles-Zeilen.
//   * ALLE bekannten FK-Kindtabellen von profiles(id) muessen als Schluessel vorhanden sein
//     (leere Liste = vollstaendig geprueft leer). Fehlende Schluessel sind ein Fehler.
//   * ID-Mengenbindung: ids.mandat == Set(profiles[].id) == Set(mandate_profiles[].user_id).
//   * Kindzeilen tragen user_id und gehoeren ausschliesslich zur Preimage-Kohorte.
//   * Der Snapshot-Hash bindet den gesamten Inhalt; der Paket-Hash bindet die Paketdatei.
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
//   node scripts/import-preflight-500-sql-generator.js --snapshot <datei>            # SQL -> stdout
//   node scripts/import-preflight-500-sql-generator.js --snapshot <datei> --out <dir>
//   node scripts/import-preflight-500-sql-generator.js --snapshot <datei> --paket <datei>
//   node scripts/import-preflight-500-sql-generator.js                              # fail-closed, Exit 2
//   Exit 0 = Preflight + Snapshot + SQL-Selbsttest gruen · 2 = kein/ungueltiger Snapshot oder
//            Preflight rot (kein SQL) · 3 = generiertes SQL hat den Selbsttest nicht bestanden

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const IMPORT = require(path.join(__dirname, "..", "lib", "helmut", "profil-import.js"));
const ZULASSUNG = require(path.join(__dirname, "..", "lib", "helmut", "profil-zulassung.js"));

const PAKET_PFAD = path.join(__dirname, "..", "daten", "mandatsprofile-bundestag-berlin-brandenburg-20260929.json");
const KOHORTE_GESAMT = 500;
const MANDATE_GESAMT = 500;
const PROFILES_GESAMT = 501;
const ERWARTET = Object.freeze({ bundestag: 330, "landtag-berlin": 120, "landtag-brandenburg": 50 });
const REGIERUNGSROLLEN = Object.freeze(["regierung", "opposition", "unbekannt"]);

const SNAPSHOT_VERTRAG = "helmut-500-preimage/1";
const SPALTEN_NAME = /^[a-z_][a-z0-9_]*$/;

// Alle bekannten FK-Kindtabellen von public.profiles(id) aus supabase/schema.sql und den
// Migrationen — in FK-SICHERER Reihenfolge (Eltern vor Kindern) fuer die Wiederherstellung.
// Quelle: supabase/schema.sql (mandate_profiles, political_items, personalized_recommendations,
// daily_tasks, communication_drafts, user_notes, priority_changes, matching_weights, decisions,
// topic_memory, interactions, office_outputs, briefings, profile_embeddings, matching_results)
// und supabase/migrations/20260728_matching_audit.sql (matching_runs).
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
  "matching_results",
  "matching_runs"
]);
const SNAPSHOT_TABELLEN = Object.freeze(["profiles", ...FK_KINDTABELLEN]);

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

// ── Paket-Preflight (unveraendert gueltig fuer die neue Kohorte) ─────────────────────────────
function befund(code, text_, hinweis) { return { code, text: text_, hinweis }; }

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
      "Der Preimage-Snapshot muss dem versionierten Vertrag helmut-500-preimage/1 entsprechen.");
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

function parseArgs(argv) {
  const opts = { paket: null, out: null, snapshot: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--paket") opts.paket = argv[++i];
    else if (argv[i] === "--out") opts.out = argv[++i];
    else if (argv[i] === "--snapshot") opts.snapshot = argv[++i];
  }
  return opts;
}

function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const paketPfad = opts.paket ? path.resolve(opts.paket) : PAKET_PFAD;

  // (1) FAIL-CLOSED ohne vollstaendigen Preimage-Snapshot: kein SQL, Exit != 0.
  if (!opts.snapshot) {
    process.stderr.write(
      "FAIL-CLOSED: Kein Preimage-Snapshot uebergeben (--snapshot <datei>).\n"
      + "Dieses Werkzeug erzeugt KEINEN additiven Import und KEINEN 'Rollback', der nur die neue\n"
      + "Kohorte loescht. Der vollstaendige Preimage-Snapshot ist vom Betreiber VOR der geschuetzten\n"
      + "Production-Aktion separat rein lesend zu erzeugen und sicher aufzubewahren. Es wird kein SQL ausgegeben.\n");
    return 2;
  }

  let paket;
  try {
    paket = ladePaket(paketPfad);
  } catch (e) {
    process.stderr.write(`Paket nicht lesbar/parsebar: ${paketPfad}\n${String(e && e.message)}\n`);
    return 2;
  }
  let snapshot;
  try {
    snapshot = ladeDatei(path.resolve(opts.snapshot));
  } catch (e) {
    process.stderr.write(`Preimage-Snapshot nicht lesbar/parsebar: ${path.resolve(opts.snapshot)}\n${String(e && e.message)}\n`);
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

  const sp = pruefeSnapshot(snapshot, { paketHash: paketHashHex, neueIds: ergebnis.ids });
  if (!sp.ok) {
    process.stderr.write(snapshotBericht(sp.fehler) + "\n");
    return 2;
  }

  let sql;
  try {
    sql = baueErsatzSql(paket, ergebnis, snapshot, { paketHash: paketHashHex });
  } catch (e) {
    if (e && e.code === "sql-selbsttest") {
      process.stderr.write("SQL-Selbsttest NICHT bestanden — kein SQL ausgegeben:\n"
        + (e.fehler || []).map((f) => `  FEHLER [${f.code}] ${f.text}`).join("\n") + "\n");
      return 3;
    }
    process.stderr.write(`${String(e && e.message)}\n`);
    return 2;
  }

  if (opts.out) {
    const ziel = path.resolve(opts.out);
    fs.mkdirSync(ziel, { recursive: true });
    fs.writeFileSync(path.join(ziel, "500er-ersatz.sql"), sql.forward + "\n");
    fs.writeFileSync(path.join(ziel, "500er-ersatz-rueckweg.sql"), sql.rollback + "\n");
    process.stdout.write(`Preflight + Snapshot gruen. SQL geschrieben nach ${ziel}/500er-ersatz.sql und ${ziel}/500er-ersatz-rueckweg.sql\n`);
  } else {
    process.stdout.write(sql.forward + "\n\n" + sql.rollback + "\n");
  }
  return 0;
}

// Bewusst process.exitCode statt process.exit(): bei gepuffertem stdout (Pipe) wuerde
// process.exit() das noch nicht geflushte SQL abschneiden.
if (require.main === module) process.exitCode = main();

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
  preflight,
  erzeugeZeilen,
  pruefeSnapshot,
  erzeugeErsatzSql,
  baueErsatzSql,
  pruefeErsatzSql,
  kanonisch,
  hashSnapshot,
  hashPaket,
  bericht,
  ladeDatei,
  ladePaket,
  main
};
