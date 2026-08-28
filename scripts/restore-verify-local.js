"use strict";

// OP-01 Rueckweg-Beweis: stellt ein mit backup-export.js erzeugtes VOLL-Backup
// in eine ISOLIERTE, LOKALE PostgreSQL-Instanz wieder her und BEWEIST die
// Wiederherstellung feld- und mengenmaessig. Der alte Remote-REST-Weg ist
// vollstaendig gesperrt; nur eine lokale PostgreSQL + pgvector kommt als
// isoliertes Importziel in Betracht.
//
// Ein Restore gilt hier NICHT als erfolgreich, weil der Import mit Exit 0
// endet — er gilt als erfolgreich, wenn ALLE Pruefungen bestehen:
//   1. Backup-Integritaet (jede Datei gegen die Manifest-Pruefsumme)
//   2. Schema-Aufbau aus schema.sql + exakt 29 belegten Production-Migrationen
//   3. Alle Tabellen vorhanden, Zeilenzahlen == Manifest
//   4. Primaerschluessel-Mengen byte-identisch (Digest je Tabelle)
//   5. Feldgenaue Stichproben je kritischer Tabelle (normalisierter Vergleich)
//   6. Spalten-Vollstaendigkeit (Nicht-NULL-Zaehler je Spalte, knowledge_objects)
//   7. Struktur gegen produktions-strukturreferenz.json: RLS-Flags, Policies,
//      Trigger, Funktionen — nichts fehlt, nichts Unerwartetes hinzu
//   8. Mandantentrennung FUNKTIONAL: RLS-Probe als Rolle `authenticated`
//      mit JWT-Claim (auth.jwt()-Shim identisch zur Supabase-Semantik)
//   9. Funktions-/Trigger-Proben: match_knowledge_objects (pgvector),
//      set_updated_at (in ROLLBACK-Transaktion — Drill-Daten bleiben unveraendert)
//  10. Keine unerwarteten Zusatzdaten (Gesamtzeilensumme == Manifestsumme)
//
// SICHERHEIT (hart erzwungen, im Zweifel verweigern — Exit 2):
//   - Ziel MUSS lokal sein (Unix-Socket, localhost, 127.0.0.1, ::1).
//   - Jeder Host/DB-Name mit "supabase" wird verweigert — Production oder
//     irgendein Supabase-Projekt kann konstruktionsbedingt nie Ziel sein.
//   - Entspricht das Ziel dem Host aus SUPABASE_URL: verweigert.
//   - Ohne ausdruecklichen Bestaetigungs-Schalter --ziel-bestaetigt: verweigert.
//   - Backup ohne manifest.quelle, ohne vollstaendig:true oder mit art!=voll:
//     verweigert (Teil-Backups beweisen keinen Voll-Rueckweg).
//   - Nichttransaktionaler Export ohne Schreibstopp+Quersummen: verweigert.
//   - Ohne strukturierten, aktuellen 51-Tabellen-Spaltenkatalog: verweigert.
//   - Ziel-Datenbank wird vom Skript SELBST angelegt (CREATE DATABASE);
//     existiert sie schon, wird abgebrochen — kein Lauf ueberschreibt einen
//     aelteren, keine gewachsene Datenbank wird still weiterbenutzt.
//   - Production wird von diesem Skript NIE angesprochen, auch nicht lesend.
//
// Aufruf (Beispiel; lokale PostgreSQL 16 + pgvector muessen laufen):
//   PGPASSWORD=<lokales-drill-passwort> node scripts/restore-verify-local.js \
//     --backup backups/<stamp> --ziel-bestaetigt \
//     --pg-host 127.0.0.1 --pg-port 5432 --pg-user postgres
//
// Protokoll: <backup>/restore-verify-<lauf>/protokoll.json + .md — nur
// Kennzahlen, Objektnamen und Digests, NIE Feldwerte (personenbezogene Daten).
// Ein abgebrochener Lauf hinterlaesst ein Protokoll mit erfolg:false.

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { RESTORE_ORDER, hostOf, pruefeManifestInventar, pruefeBackupDateien } = require("./restore-drill.js");
const {
  TABLES,
  fordereGueltigesInventar,
  berechneKanonischePruefsumme,
  parseJsonVerlustfrei,
  zerlegeJsonArrayRoh,
  verlustfreierZahltext,
  ERWARTETE_SPALTENKATALOG_PRUEFSUMME
} = require("./backup-table-inventory.js");

const STRUKTUR_REFERENZ_PFAD = path.join(__dirname, "produktions-strukturreferenz.json");

// Kritische Tabellen fuer feldgenaue Stichproben (Phase 6/7 des OP-01-Auftrags):
// Mandanten, Profile, Quellenarchitektur, Wissensobjekte, Briefings, Blob-Store,
// Budget. Stichprobe = deterministisch (Anfang/Mitte/Ende der PK-Sortierung).
const KRITISCHE_TABELLEN = [
  "helmut_store", "profiles", "mandate_profiles", "knowledge_objects",
  "briefings", "decisions", "retrieval_paths", "source_packages",
  "raw_documents", "llm_budget_counters",
  "knowledge_object_embeddings", "matching_runs", "llm_reservations",
  "helmut_jobs", "helmut_job_outbox", "helmut_klassen_anker",
  "helmut_klassen_slots", "helmut_anbieter_fenster",
  "helmut_anbieter_schutzschalter", "helmut_verstehen_reservierungen",
  "helmut_verstehen_vormerkungen"
];
const STICHPROBEN_JE_TABELLE = 9;

// Tabellen mit tenant_isolation-Policy und user_id-Spalte — Grundlage der
// funktionalen RLS-Probe (Auszug; briefings/decisions sind die datentragenden).
const TENANT_PROBE_TABELLEN = ["briefings", "decisions", "matching_results"];

// ── Reine Hilfsfunktionen (testbar, kein Netz, kein Prozessstart) ────────────

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// COPY-Text-Format: eine JSON-Zeile je Datensatz; im Text-Format ist nur der
// Backslash zu verdoppeln (JSON.stringify erzeugt weder rohe Tabs noch rohe
// Zeilenumbrueche). Tabs/Newlines INNERHALB von JSON-Strings sind bereits als
// \t / \n escaped und werden durch die Verdopplung korrekt transportiert.
function escapeCopyZeile(jsonZeile) {
  return String(jsonZeile).replace(/\\/g, "\\\\");
}

// SQL-Stringliteral (standard_conforming_strings): nur ' verdoppeln.
function sqlLiteral(wert) {
  return "'" + String(wert).replace(/'/g, "''") + "'";
}

// PK-Textdarstellung einer Zeile — MUSS byte-identisch zu dem sein, was die
// SQL-Seite mit concat_ws(<US>, col::text, ...) erzeugt. US = Unit Separator
// (0x1F), kommt in URLs/IDs nicht vor. null wird von concat_ws uebersprungen —
// Backup-PKs sind not null, zur Sicherheit identisch behandeln.
const PK_TRENNER = "";
function pkTextZeile(zeile, pkSpalten) {
  // concat() in Postgres behandelt NULL als Leerstring und behaelt Trenner bei
  // — hier identisch, damit die Digests byte-gleich vergleichbar sind.
  return pkSpalten
    .map((c) => {
      if (zeile[c] === null || zeile[c] === undefined) return "";
      return verlustfreierZahltext(zeile[c]) ?? String(zeile[c]);
    })
    .join(PK_TRENNER);
}

// Byte-Sortierung (UTF-8) — identisch zu ORDER BY ... COLLATE "C" in Postgres.
// JS-Standard-Sort (UTF-16-Codeunits) weicht bei Astral-Zeichen ab.
function sortiereBytes(liste) {
  return liste
    .map((s) => [Buffer.from(s, "utf8"), s])
    .sort((a, b) => Buffer.compare(a[0], b[0]))
    .map((p) => p[1]);
}

function pkDigestAusZeilen(zeilen, pkSpalten) {
  const keys = sortiereBytes(zeilen.map((z) => pkTextZeile(z, pkSpalten)));
  return sha256(Buffer.from(keys.join("\n"), "utf8"));
}

function normalisiereZeile(zeile, spaltenTypen = {}) {
  const out = {};
  for (const spalte of Object.keys(zeile || {}).sort()) {
    out[spalte] = normalisiereWert(zeile[spalte], spaltenTypen[spalte] || null);
  }
  return out;
}

function feldDigestAusZeilen(zeilen, pkSpalten, spaltenTypen = {}) {
  const eintraege = zeilen.map((zeile) => ({
    pk: pkTextZeile(zeile, pkSpalten),
    zeile: normalisiereZeile(zeile, spaltenTypen)
  }));
  eintraege.sort((a, b) => Buffer.compare(Buffer.from(a.pk, "utf8"), Buffer.from(b.pk, "utf8")));
  return sha256(Buffer.from(JSON.stringify(eintraege), "utf8"));
}

// Deterministische Stichproben-Indizes: Anfang, Ende, gleichmaessig dazwischen.
function waehleStichprobenIndizes(anzahl, gewuenscht) {
  if (anzahl <= 0) return [];
  const n = Math.min(anzahl, gewuenscht);
  const set = new Set();
  for (let i = 0; i < n; i++) set.add(Math.round((i * (anzahl - 1)) / Math.max(1, n - 1)));
  return Array.from(set).sort((a, b) => a - b);
}

function casRestoreVorbereitung(tabelle) {
  return tabelle === "knowledge_objects"
    ? "select set_config('helmut.verstehen_cas', 'geprueft', true);"
    : "-- keine CAS-Restore-Markierung noetig";
}

function normalisiereZahltext(s) {
  // Zahllexeme stammen ausschliesslich aus parseJsonVerlustfrei oder einem
  // echten JS-Number-Wert. Ein beliebiger TEXT-Spaltenwert wird nie hierher
  // geleitet — sonst wuerden z. B. die legitimen Texte "001" und "1"
  // ununterscheidbar.
  const dezimal = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(String(s));
  if (!dezimal) return `zahllexem:${String(s)}`;
  const negativ = dezimal[1] === "-";
  const ganz = dezimal[2];
  const bruch = dezimal[3] || "";
  const exponent = Number(dezimal[4] || 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100000) return `zahllexem:${String(s)}`;
  let ziffern = (ganz + bruch).replace(/^0+/, "");
  if (!ziffern) return "zahl:0";
  const skala = bruch.length - exponent;
  let kanonisch;
  if (skala <= 0) kanonisch = ziffern + "0".repeat(-skala);
  else if (skala >= ziffern.length) kanonisch = "0." + "0".repeat(skala - ziffern.length) + ziffern;
  else kanonisch = ziffern.slice(0, ziffern.length - skala) + "." + ziffern.slice(ziffern.length - skala);
  if (kanonisch.includes(".")) kanonisch = kanonisch.replace(/0+$/, "").replace(/\.$/, "");
  return "zahl:" + (negativ ? "-" : "") + kanonisch;
}

function istTimestampTyp(typ) {
  return /^timestamp(?:\(\d+\))? (?:with|without) time zone$/i.test(String(typ || ""));
}

function istVectorTyp(typ) {
  return /^vector(?:\(\d+\))?$/i.test(String(typ || ""));
}

// Wert-Normalisierung fuer den feldgenauen Vergleich REST-Export (PostgREST-
// JSON) vs. to_jsonb() aus der wiederhergestellten Datenbank. Sie ist bewusst
// typgebunden: echte JSON-Zahllexeme werden semantisch verglichen; Timestamp-
// und Vector-Textdarstellungen nur dann, wenn der aktuelle, fest attestierte
// Spaltenkatalog genau diesen PostgreSQL-Typ nennt. Alle echten Strings bleiben
// ansonsten texttreu. Auch Strings innerhalb json/jsonb bleiben immer Strings.
function normalisiereWert(wert, spaltenTyp = null) {
  if (wert === null || wert === undefined) return null;
  const zahltext = verlustfreierZahltext(wert);
  if (zahltext !== null) return normalisiereZahltext(zahltext);
  if (typeof wert === "number") return Number.isFinite(wert)
    ? normalisiereZahltext(String(wert))
    : "zahl:" + wert;
  if (typeof wert === "boolean") return "bool:" + wert;
  if (Array.isArray(wert)) return wert.map((x) => normalisiereWert(x, null));
  if (typeof wert === "object") {
    const out = {};
    for (const k of Object.keys(wert).sort()) out[k] = normalisiereWert(wert[k], null);
    return out;
  }
  const s = String(wert);
  // Timestamp auf UTC-Sekunde + verlustfreie Nachkommastellen normalisieren.
  // Date.parse waere hier falsch: es kuerzt Postgres-Mikrosekunden auf ms.
  const ts = istTimestampTyp(spaltenTyp)
    ? /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(s)
    : null;
  if (ts) {
    const [, jahr, monat, tag, stunde, minute, sekunde, rohBruch = "", zone = "Z"] = ts;
    let offsetMinuten = 0;
    if (zone !== "Z") {
      const zm = /^([+-])(\d{2})(?::?(\d{2}))?$/.exec(zone);
      if (zm) offsetMinuten = (zm[1] === "+" ? 1 : -1) * (Number(zm[2]) * 60 + Number(zm[3] || 0));
    }
    const utcMillis = Date.UTC(Number(jahr), Number(monat) - 1, Number(tag), Number(stunde), Number(minute), Number(sekunde))
      - offsetMinuten * 60000;
    if (Number.isFinite(utcMillis)) {
      const bruch = rohBruch.replace(/0+$/, "");
      return `ts:${Math.trunc(utcMillis / 1000)}.${bruch || "0"}`;
    }
  }
  // pgvector-Textform "[0.1,0.2,...]": als Zahlenliste vergleichen.
  if (istVectorTyp(spaltenTyp) && /^\[\s*-?\d/.test(s) && /\]$/.test(s)) {
    try {
      const arr = parseJsonVerlustfrei(s);
      if (Array.isArray(arr) && arr.every((x) => typeof x === "number" || verlustfreierZahltext(x) !== null)) {
        return arr.map((x) => normalisiereWert(x, null));
      }
    } catch (_) { /* kein Vektor — als String vergleichen */ }
  }
  return `text:${s}`;
}

// Vergleicht zwei Zeilen feldgenau (normalisiert). Ergebnis nennt NUR
// Spaltennamen und Wert-Digests — nie die Werte selbst (personenbezogene
// Daten gehoeren nicht ins Protokoll).
function vergleicheZeile(erwartet, tatsaechlich, spaltenTypen = {}) {
  const abweichungen = [];
  const spalten = new Set([...Object.keys(erwartet || {}), ...Object.keys(tatsaechlich || {})]);
  for (const spalte of spalten) {
    const hatA = Object.prototype.hasOwnProperty.call(erwartet || {}, spalte);
    const hatB = Object.prototype.hasOwnProperty.call(tatsaechlich || {}, spalte);
    const a = JSON.stringify(hatA
      ? normalisiereWert(erwartet[spalte], spaltenTypen[spalte] || null)
      : "(feld-fehlt)");
    const b = JSON.stringify(hatB
      ? normalisiereWert(tatsaechlich[spalte], spaltenTypen[spalte] || null)
      : "(feld-fehlt)");
    if (a !== b) {
      abweichungen.push({
        spalte,
        erwartetDigest: sha256(Buffer.from(a || "", "utf8")).slice(0, 12),
        tatsaechlichDigest: sha256(Buffer.from(b || "", "utf8")).slice(0, 12)
      });
    }
  }
  return abweichungen;
}

// ── Ziel-Pruefung (hart, konservativ; reine Funktion fuer Tests) ─────────────

function pruefeZiel(opts) {
  const { host, dbName, bestaetigt, manifest, env } = opts;
  if (!bestaetigt) {
    return { ok: false, grund: "Fehlende Freigabe: --ziel-bestaetigt ist Pflicht (ausdrueckliche Bestaetigung, dass das Ziel eine isolierte lokale Instanz ist)." };
  }
  const h = String(host || "").trim().toLowerCase();
  const istUnixSocket = h.startsWith("/");
  const istLokal = istUnixSocket || h === "localhost" || h === "127.0.0.1" || h === "::1";
  if (!istLokal) {
    return { ok: false, grund: `Ziel-Host '${host}' ist nicht lokal — nur Unix-Socket, localhost, 127.0.0.1 oder ::1 sind erlaubt.` };
  }
  const kombiniert = (h + " " + String(dbName || "")).toLowerCase();
  if (kombiniert.includes("supabase")) {
    return { ok: false, grund: "Ziel enthaelt 'supabase' — ein Supabase-Projekt (insbesondere Production) ist als Ziel konstruktionsbedingt verweigert." };
  }
  const prodHost = hostOf((env || {}).SUPABASE_URL || "");
  if (prodHost && (h === prodHost || kombiniert.includes(prodHost) || kombiniert.includes(prodHost.split(".")[0]))) {
    return { ok: false, grund: "Ziel entspricht SUPABASE_URL (Production) — verweigert." };
  }
  if (!manifest || typeof manifest !== "object") {
    return { ok: false, grund: "Kein lesbares manifest.json — kein Backup, kein Restore." };
  }
  if (!manifest.quelle) {
    return { ok: false, grund: "manifest.quelle fehlt — Herkunft des Backups unklar, verweigert." };
  }
  if (manifest.vollstaendig !== true) {
    return { ok: false, grund: "manifest.vollstaendig ist nicht true — ein unvollstaendiges/ungueltiges Backup beweist keinen Rueckweg und wird nicht wiederhergestellt." };
  }
  if (manifest.art !== "voll") {
    return { ok: false, grund: `manifest.art ist '${manifest.art}' — der Voll-Rueckweg-Beweis verlangt ein Voll-Backup (Teil-Umfaenge: eigener Weg, Runbook 1a).` };
  }
  if (manifest.simulation && manifest.simulation.aktiv === true) {
    return { ok: false, grund: "Simulations-Backup kann keinen Production-Rueckweg beweisen." };
  }
  if (!manifest.konsistenz || manifest.konsistenz.vollRueckwegBelegt !== true) {
    return { ok: false, grund: "Backup belegt keinen querschnittskonsistenten Voll-Rueckweg: erforderlich ist ein transaktionaler Snapshot oder belegter Schreibstopp plus Quersummen." };
  }
  return { ok: true, grund: null };
}

// Dateiintegritaet: jede Tabelle im Manifest braucht ihre Datei, jede Datei
// muss die Manifest-Pruefsumme treffen. Manipulation/Fehlen => Abbruch.
function pruefeDateiPruefsummen(backupDir, manifest) {
  return pruefeBackupDateien(backupDir, manifest, Object.keys(manifest.tabellen || {}));
}

function pruefeSpaltengenauenProduktionsbeleg(referenz) {
  const katalog = referenz && referenz.spaltenKatalog;
  if (ERWARTETE_SPALTENKATALOG_PRUEFSUMME === null) {
    return {
      ok: false,
      grund: katalog
        ? "selbst gesetzter Spaltenkatalog ist nicht vertrauenswuerdig: kein echter Production-Spaltenkatalog-Digest ist fest verankert"
        : "strukturierter spaltengenauer Production-Katalogbeleg fehlt"
    };
  }
  if (!katalog || katalog.vertrag !== 1 || katalog.quelle !== "rein-lesender-production-katalog") {
    return { ok: false, grund: "strukturierter spaltengenauer Production-Katalogbeleg fehlt" };
  }
  if (katalog.erhoben !== referenz.erhoben) {
    return { ok: false, grund: "Spaltenkatalog und 51er Production-Katalog wurden nicht im selben belegten Stand erhoben" };
  }
  const sollTabellen = (referenz.tabellen || []).slice().sort();
  const istTabellen = Object.keys(katalog.tabellen || {}).sort();
  if (JSON.stringify(istTabellen) !== JSON.stringify(sollTabellen)) {
    return { ok: false, grund: "Spaltenkatalog deckt nicht exakt alle 51 Production-Tabellen" };
  }
  for (const tabelle of sollTabellen) {
    const spalten = katalog.tabellen[tabelle];
    if (!Array.isArray(spalten) || !spalten.length) return { ok: false, grund: `Spaltenkatalog fuer ${tabelle} fehlt` };
    const namen = new Set();
    for (const spalte of spalten) {
      const gueltig = spalte && /^[a-z_][a-z0-9_]*$/.test(String(spalte.spalte || ""))
        && typeof spalte.typ === "string" && spalte.typ.length > 0
        && typeof spalte.nullable === "boolean"
        && ["", "a", "d"].includes(spalte.identity)
        && ["", "s"].includes(spalte.generated)
        && (spalte.defaultDigest === null || /^[0-9a-f]{64}$/.test(String(spalte.defaultDigest || "")))
        && (spalte.primaerschluesselPosition === null
          || (Number.isInteger(spalte.primaerschluesselPosition) && spalte.primaerschluesselPosition > 0));
      if (!gueltig || namen.has(spalte && spalte.spalte)) {
        return { ok: false, grund: `Spaltenkatalog fuer ${tabelle} ist unvollstaendig oder ungueltig` };
      }
      namen.add(spalte.spalte);
    }
  }
  if (!/^[0-9a-f]{64}$/.test(String(katalog.pruefsumme || ""))
      || katalog.pruefsumme !== berechneKanonischePruefsumme(katalog.tabellen)) {
    return { ok: false, grund: "Spaltenkatalog-Pruefsumme fehlt oder passt nicht" };
  }
  if (katalog.pruefsumme !== ERWARTETE_SPALTENKATALOG_PRUEFSUMME) {
    return { ok: false, grund: "Spaltenkatalog passt nicht zum fest verankerten Production-Digest" };
  }
  return { ok: true, grund: null };
}

// Baut aus einem pg_catalog-Abzug genau den Vertrag, den spaltenKatalog
// prueft. defaultDigest = SHA256 des von pg_get_expr kanonisch gelieferten
// Default-Ausdrucks; keine Default-Inhalte gelangen ins Protokoll.
function baueSpaltenKatalogAusKatalogzeilen(zeilen) {
  const tabellen = {};
  for (const roh of zeilen || []) {
    const zeile = typeof roh === "string" ? JSON.parse(roh) : roh;
    if (!zeile || !/^[a-z_][a-z0-9_]*$/.test(String(zeile.tabelle || ""))
        || !/^[a-z_][a-z0-9_]*$/.test(String(zeile.spalte || ""))) {
      throw new Error("ungueltige pg_catalog-Spaltenzeile");
    }
    if (!tabellen[zeile.tabelle]) tabellen[zeile.tabelle] = [];
    tabellen[zeile.tabelle].push({
      spalte: zeile.spalte,
      typ: zeile.typ,
      nullable: zeile.nullable,
      identity: zeile.identity || "",
      generated: zeile.generated || "",
      defaultDigest: zeile.defaultAusdruck == null
        ? null
        : sha256(Buffer.from(String(zeile.defaultAusdruck), "utf8")),
      primaerschluesselPosition: zeile.primaerschluesselPosition == null
        ? null
        : Number(zeile.primaerschluesselPosition)
    });
  }
  return tabellen;
}

function spaltenTypenAusKatalog(katalog) {
  const out = {};
  for (const [tabelle, spalten] of Object.entries((katalog && katalog.tabellen) || {})) {
    out[tabelle] = Object.fromEntries(spalten.map((spalte) => [spalte.spalte, spalte.typ]));
  }
  return out;
}

const SPALTEN_KATALOG_SQL = `
select jsonb_build_object(
  'tabelle', c.relname,
  'spalte', a.attname,
  'typ', format_type(a.atttypid, a.atttypmod),
  'nullable', not a.attnotnull,
  'identity', a.attidentity,
  'generated', a.attgenerated,
  'defaultAusdruck', pg_get_expr(ad.adbin, ad.adrelid),
  'primaerschluesselPosition', pk.position
)::text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
left join lateral (
  select array_position(i.indkey::smallint[], a.attnum::smallint) as position
  from pg_index i where i.indrelid = c.oid and i.indisprimary
) pk on true
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname, a.attnum`;

// Der strukturierte Production-Beleg nennt PostgreSQL 17.6 und pgvector
// 0.8.0. Ein lokal aufgebautes Schema darf nicht allein deshalb gruen werden,
// weil es auf einer anderen, zufaellig kompatiblen Version laeuft. Beide Werte
// werden aus der tatsaechlichen lokalen Instanz erhoben; eine vom Aufrufer
// gelieferte Versionsbehauptung gibt es nicht.
const DATENBANK_VERSION_SQL = `
select jsonb_build_object(
  'postgresVersionNum', current_setting('server_version_num'),
  'pgvectorVersion', (
    select e.extversion
    from pg_catalog.pg_extension e
    where e.extname = 'vector'
  )
)::text`;

function postgresVersionNumAusReferenz(version) {
  const m = /^(\d+)\.(\d+)$/.exec(String(version || ""));
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor)
      || major < 10 || minor < 0 || minor > 99) return null;
  return String(major * 10000 + minor).padStart(6, "0");
}

function pruefeLokaleDatenbankVersion(roh, referenz) {
  let ist;
  try { ist = typeof roh === "string" ? JSON.parse(roh) : roh; }
  catch (_) { return { ok: false, grund: "lokaler Datenbank-Versionsbeleg ist kein gueltiges JSON" }; }
  if (!ist || typeof ist !== "object" || Array.isArray(ist)
      || JSON.stringify(Object.keys(ist).sort()) !== JSON.stringify(["pgvectorVersion", "postgresVersionNum"])) {
    return { ok: false, grund: "lokaler Datenbank-Versionsbeleg hat nicht exakt die zwei erwarteten Felder" };
  }
  const sollPostgres = postgresVersionNumAusReferenz(referenz && referenz.postgresVersion);
  const sollVector = referenz && referenz.pgvectorVersion;
  if (!sollPostgres || !/^\d+\.\d+\.\d+$/.test(String(sollVector || ""))) {
    return { ok: false, grund: "Production-Referenz enthaelt keinen auswertbaren PostgreSQL-/pgvector-Vertrag" };
  }
  if (!/^\d{6}$/.test(String(ist.postgresVersionNum || ""))
      || ist.postgresVersionNum !== sollPostgres) {
    return {
      ok: false,
      grund: `lokale PostgreSQL-Version ${String(ist.postgresVersionNum || "(fehlt)")} weicht von Production ${sollPostgres} ab`
    };
  }
  if (typeof ist.pgvectorVersion !== "string" || ist.pgvectorVersion !== sollVector) {
    return {
      ok: false,
      grund: `lokale pgvector-Version ${String(ist.pgvectorVersion || "(fehlt)")} weicht von Production ${sollVector} ab`
    };
  }
  return {
    ok: true,
    grund: null,
    postgresVersionNum: ist.postgresVersionNum,
    pgvectorVersion: ist.pgvectorVersion
  };
}

// Schutz vor Secret-Leaks in Protokoll/Logs: wirft, wenn ein Text den Wert
// einer bekannten Secret-Variable enthaelt. Wird vor jedem Schreiben des
// Protokolls und vor jeder Konsolenzeile angewandt.
const SECRET_ENV_NAMEN = ["SUPABASE_SERVICE_ROLE_KEY", "TARGET_SUPABASE_SERVICE_ROLE_KEY", "PGPASSWORD", "SUPABASE_ACCESS_TOKEN"];
function ohneSecrets(text, env) {
  const e = env || process.env;
  let s = String(text);
  for (const name of SECRET_ENV_NAMEN) {
    const wert = e[name];
    if (wert && wert.length >= 8 && s.includes(wert)) {
      throw new Error(`Sicherheitsabbruch: Ausgabe wuerde den Wert von ${name} enthalten.`);
    }
  }
  return s;
}

function baueLaufKennung(jetztIso) {
  return String(jetztIso).replace(/[:.]/g, "-");
}

// ── Ab hier: Prozess-Steuerung (nicht in Offline-Tests ausgefuehrt) ──────────

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function flag(name) {
  return process.argv.includes(name);
}
function fail(msg, code = 2) {
  console.error(ohneSecrets(`FEHLER: ${msg}`));
  process.exit(code);
}

function psqlFehlermeldung(sqlOderDatei, istDatei, status) {
  return `psql (${istDatei ? path.basename(sqlOderDatei) : "SQL"}) Exit ${status}; stderr wegen moeglicher Inhaltsdaten unterdrueckt`;
}

function entferneSensibleDateien(dateien, operationen = {}) {
  const exists = operationen.existsSync || fs.existsSync;
  const unlink = operationen.unlinkSync || fs.unlinkSync;
  const fehler = [];
  for (const datei of dateien) {
    if (!exists(datei)) continue;
    try { unlink(datei); }
    catch (_) { /* Existenzprobe unten entscheidet fail closed. */ }
    if (exists(datei)) fehler.push(path.basename(datei));
  }
  return fehler;
}

function psql(conn, dbName, sqlOderDatei, istDatei) {
  const args = ["-v", "ON_ERROR_STOP=1", "-X", "-q", "-tA", "-h", conn.host, "-p", String(conn.port), "-U", conn.user, "-d", dbName];
  args.push(istDatei ? "-f" : "-c", sqlOderDatei);
  const res = spawnSync("psql", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  if (res.status !== 0) {
    // stderr kann COPY-Zeilenwerte und damit personenbezogene Daten enthalten.
    throw new Error(psqlFehlermeldung(sqlOderDatei, istDatei, res.status));
  }
  return String(res.stdout);
}

function psqlWert(conn, dbName, sql) {
  return psql(conn, dbName, sql, false).trim();
}

const PRELUDE_SQL = `
-- Lokaler Nachbau der Supabase-Laufzeitumgebung (nur was das Schema braucht):
-- Rollen + auth.jwt()-Shim mit identischer Semantik (request.jwt.claims-GUC).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as
$fn$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $fn$;
`;

const GRANTS_SQL = `
-- Leserechte fuer die RLS-Probe (Supabase vergibt CRUD-Grants an authenticated;
-- fuer den funktionalen Mandantentrennungs-Beweis genuegt SELECT).
grant usage on schema public to authenticated, anon;
grant select on all tables in schema public to authenticated;
-- Wie in Supabase: authenticated darf auth.jwt() aufrufen (Claims lesen).
grant usage on schema auth to authenticated, anon;
grant execute on function auth.jwt() to authenticated, anon;
`;

function main() {
  const t0 = Date.now();
  const backupDir = arg("--backup");
  if (!backupDir) fail("--backup <verzeichnis> ist Pflicht.");
  const manifestPfad = path.join(backupDir, "manifest.json");
  if (!fs.existsSync(manifestPfad)) fail(`Kein manifest.json unter ${backupDir}.`);
  const manifest = JSON.parse(fs.readFileSync(manifestPfad, "utf8"));
  let aktuellesInventar;
  try { aktuellesInventar = fordereGueltigesInventar(path.join(__dirname, "..")); }
  catch (error) { fail(error.message); }
  const manifestPruefung = pruefeManifestInventar(manifest, aktuellesInventar);
  if (!manifestPruefung.ok) fail(`Backup-Inventar unvollstaendig oder ungueltig: ${manifestPruefung.fehler.join(" | ")}`);

  const conn = {
    host: arg("--pg-host") || "127.0.0.1",
    port: Number(arg("--pg-port") || 5432),
    user: arg("--pg-user") || "postgres"
  };
  const laufKennung = baueLaufKennung(new Date().toISOString());
  const dbName = arg("--db-name") || `helmut_drill_${laufKennung.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  const ziel = pruefeZiel({
    host: conn.host, dbName, bestaetigt: flag("--ziel-bestaetigt"),
    manifest, env: process.env
  });
  if (!ziel.ok) fail(ziel.grund);

  const angeforderteReferenz = arg("--struktur-referenz");
  if (angeforderteReferenz && path.resolve(angeforderteReferenz) !== path.resolve(STRUKTUR_REFERENZ_PFAD)) {
    fail("Eine abweichende --struktur-referenz ist fuer den Production-Rueckwegbeweis nicht erlaubt.");
  }
  const strukturReferenz = aktuellesInventar.production.referenz;
  const kanonischesSchemaDir = path.join(__dirname, "..", "supabase");
  const angefordertesSchemaDir = arg("--schema-dir");
  if (angefordertesSchemaDir && path.resolve(angefordertesSchemaDir) !== path.resolve(kanonischesSchemaDir)) {
    fail("Ein abweichendes --schema-dir ist fuer den Production-Rueckwegbeweis nicht erlaubt.");
  }
  const schemaDir = kanonischesSchemaDir;

  const spaltenbeleg = pruefeSpaltengenauenProduktionsbeleg(strukturReferenz);
  if (!spaltenbeleg.ok) fail(`${spaltenbeleg.grund}; kein exakter Production-Restore-Beweis.`);
  const spaltenTypenJeTabelle = spaltenTypenAusKatalog(strukturReferenz.spaltenKatalog);

  // Nie in die Backup-Quelle schreiben. Staging und Protokoll liegen in einem
  // neuen lokalen Temp-Verzeichnis; Tabellendateien werden nur gelesen.
  const protokollDir = fs.mkdtempSync(path.join(os.tmpdir(), `helmut-restore-verify-${laufKennung}-`));

  const protokoll = {
    begonnen: new Date().toISOString(),
    backup: path.resolve(backupDir),
    quelle: manifest.quelle,
    ziel: `${conn.host}:${conn.port}/${dbName}`,
    schritte: {},
    pruefungen: [],
    fehler: [],
    erfolg: false,
    status: "laeuft"
  };
  const pruefe = (name, ok, detail) => {
    protokoll.pruefungen.push({ name, ok: !!ok, detail: detail || null });
    console.log(ohneSecrets(`${ok ? "OK  " : "FEHL"} ${name}${detail ? " — " + detail : ""}`));
    if (!ok) protokoll.fehler.push({ pruefung: name, detail: detail || null });
  };
  const schreibeProtokoll = () => {
    protokoll.beendet = new Date().toISOString();
    protokoll.dauerSekunden = Math.round((Date.now() - t0) / 1000);
    const json = JSON.stringify(protokoll, null, 2);
    ohneSecrets(json);
    fs.writeFileSync(path.join(protokollDir, "protokoll.json"), json);
    const md = [
      `# Restore-Verify (lokal) ${protokoll.begonnen}`,
      ``,
      `- Backup: ${protokoll.backup} (Quelle: ${protokoll.quelle})`,
      `- Ziel: ${protokoll.ziel} (lokale PostgreSQL, isoliert)`,
      `- Status: ${protokoll.status} · Erfolg: ${protokoll.erfolg}`,
      `- Dauer gesamt: ${protokoll.dauerSekunden}s (Schema ${protokoll.schritte.schemaSekunden ?? "—"}s · Import ${protokoll.schritte.importSekunden ?? "—"}s · Pruefung ${protokoll.schritte.verifySekunden ?? "—"}s)`,
      `- Pruefungen: ${protokoll.pruefungen.filter((p) => p.ok).length}/${protokoll.pruefungen.length} bestanden`,
      ``,
      `| Pruefung | Ergebnis | Detail |`,
      `| --- | --- | --- |`,
      ...protokoll.pruefungen.map((p) => `| ${p.name} | ${p.ok ? "OK" : "FEHL"} | ${p.detail || ""} |`),
      ``,
      `Aufraeumen: \`dropdb ${dbName}\` (lokale Drill-Datenbank enthaelt personenbezogene Daten).`
    ].join("\n");
    fs.writeFileSync(path.join(protokollDir, "protokoll.md"), ohneSecrets(md));
  };

  try {
    // 1) Backup-Integritaet VOR jedem Datenbankschritt.
    const integritaet = pruefeDateiPruefsummen(backupDir, manifest);
    pruefe("Backup-Integritaet: alle Tabellendateien gegen Manifest-Pruefsumme", integritaet.length === 0,
      integritaet.length ? integritaet.map((f) => `${f.tabelle}: ${f.fehler}`).join("; ") : `${Object.keys(manifest.tabellen).length} Dateien`);
    if (integritaet.length) throw new Error("Backup-Integritaet verletzt — Abbruch vor jedem Restore-Schritt.");

    // 2) Datenbank anlegen (Kollision = Abbruch, nie weiterverwenden).
    if (!/^[a-z][a-z0-9_]*$/.test(dbName)) fail(`--db-name '${dbName}' ist kein zulaessiger Bezeichner (nur [a-z0-9_]).`);
    const tSchema = Date.now();
    psql(conn, "postgres", `create database "${dbName}"`, false);

    // 3) Prelude, Schema und AUSSCHLIESSLICH die 29 explizit als Production-
    //    angewendet belegten Repo-Migrationen. F9, Z22 und crawl_runs bleiben
    //    draussen; neue Repo-Dateien brechen bereits den Inventarvertrag.
    const preludePfad = path.join(protokollDir, "_prelude.sql");
    fs.writeFileSync(preludePfad, PRELUDE_SQL);
    psql(conn, dbName, preludePfad, true);
    psql(conn, dbName, path.join(schemaDir, "schema.sql"), true);
    const migrationen = aktuellesInventar.production.angewendet.slice();
    for (const m of migrationen) psql(conn, dbName, path.join(schemaDir, "migrations", m), true);
    const grantsPfad = path.join(protokollDir, "_grants.sql");
    fs.writeFileSync(grantsPfad, GRANTS_SQL);
    psql(conn, dbName, grantsPfad, true);
    protokoll.schritte.schemaSekunden = Math.round((Date.now() - tSchema) / 1000);
    protokoll.schritte.migrationen = migrationen.length;
    pruefe("Schema-Aufbau (schema.sql + expliziter belegter Production-Migrationsstand)", true,
      `${migrationen.length} Repo-Migrationen · ${aktuellesInventar.production.manifest.id}`);

    const lokaleVersionen = pruefeLokaleDatenbankVersion(
      psqlWert(conn, dbName, DATENBANK_VERSION_SQL),
      strukturReferenz
    );
    pruefe("Lokale PostgreSQL-/pgvector-Version == Production-Katalog",
      lokaleVersionen.ok,
      lokaleVersionen.ok
        ? `PostgreSQL ${strukturReferenz.postgresVersion} · pgvector ${lokaleVersionen.pgvectorVersion}`
        : lokaleVersionen.grund);
    if (!lokaleVersionen.ok) throw new Error(lokaleVersionen.grund);

    // Freier historischer schemaDrift-Text wird NICHT angewendet. Der lokal
    // aufgebaute Katalog muss stattdessen bytegenau denselben strukturierten
    // Vertrag ergeben wie der aktuelle Production-Abzug.
    const katalogZeilen = psqlWert(conn, dbName, SPALTEN_KATALOG_SQL).split("\n").filter(Boolean);
    const lokalerSpaltenKatalog = baueSpaltenKatalogAusKatalogzeilen(katalogZeilen);
    const lokalerSpaltenHash = berechneKanonischePruefsumme(lokalerSpaltenKatalog);
    const spaltenHashOk = lokalerSpaltenHash === strukturReferenz.spaltenKatalog.pruefsumme;
    pruefe("Lokaler Spaltenkatalog == aktueller Production-Spaltenkatalog (Typ/NULL/Identity/Generated/Default/PK)",
      spaltenHashOk, `${Object.keys(lokalerSpaltenKatalog).length}/51 Tabellen · Hash ${lokalerSpaltenHash.slice(0, 12)}`);
    if (!spaltenHashOk) throw new Error("Lokaler Schemaaufbau weicht vom strukturierten Production-Spaltenkatalog ab.");

    const identitySpalten = psqlWert(conn, dbName,
      `select c.relname||'.'||a.attname from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and a.attidentity in ('a','d') order by 1`)
      .split("\n").filter(Boolean);
    const identityOk = JSON.stringify(identitySpalten) === JSON.stringify(strukturReferenz.identitySpalten);
    pruefe("Identity-Spaltenmenge == Production-Katalog", identityOk,
      `${identitySpalten.length}/${strukturReferenz.identitySpalten.length}`);
    if (!identityOk) throw new Error("Identity-Spalten weichen vom Production-Katalog ab.");
    const identityTabellen = new Set(identitySpalten.map((name) => name.split(".")[0]));

    // schema.sql legt EINE Bootstrap-Zeile an (helmut_store id='main', leeres
    // data) — das Backup bringt die echte main-Zeile mit. Bootstrap entfernen,
    // damit die Leerheitspruefung aussagekraeftig bleibt und der Import nicht
    // auf dem Primaerschluessel kollidiert.
    psql(conn, dbName, `delete from public.helmut_store where id = 'main'`, false);

    // Ziel muss leer sein (Seeds wuerden Mengenvergleich verfaelschen).
    const vorabSumme = Number(psqlWert(conn, dbName,
      `select coalesce(sum(n),0) from (select (xpath('/row/cnt/text()', query_to_xml(format('select count(*) as cnt from %I.%I','public',t.tablename), false, true, '')))[1]::text::bigint as n from pg_tables t where schemaname='public') q`));
    pruefe("Zielumgebung beginnt leer (0 Zeilen ueber alle Tabellen)", vorabSumme === 0, `${vorabSumme} Zeilen vorgefunden`);
    if (vorabSumme !== 0) throw new Error("Ziel nicht leer — Abbruch.");

    // 4) Import in FK-sicherer Reihenfolge; jede Tabelle EIN Statement in EINER
    //    Transaktion (FK-Pruefung am Statement-Ende, live und unumgangen).
    const tImport = Date.now();
    const importiert = {};
    const imBackup = new Set(Object.keys(manifest.tabellen));
    const reihenfolge = RESTORE_ORDER.filter((t) => imBackup.has(t));
    const fehltInOrder = Array.from(imBackup).filter((t) => !RESTORE_ORDER.includes(t));
    pruefe("Jede Backup-Tabelle hat einen Platz in RESTORE_ORDER", fehltInOrder.length === 0, fehltInOrder.join(", ") || `${reihenfolge.length} Tabellen`);
    if (fehltInOrder.length) throw new Error("RESTORE_ORDER unvollstaendig.");
    for (const tabelle of reihenfolge) {
      const elemente = zerlegeJsonArrayRoh(fs.readFileSync(path.join(backupDir, `${tabelle}.json`), "utf8"));
      const datenPfad = path.join(protokollDir, `_stage_${tabelle}.txt`);
      const overriding = identityTabellen.has(tabelle) ? "overriding system value " : "";
      // Die CAS-Migration verbietet konstruktionsbedingt jeden direkten Insert
      // eines knowledge_objects mit verstehen_fencing. Beim isolierten
      // Voll-Restore ist dies kein fremder Anwendungsschreibweg. Die
      // Reservierungszeile wird bewusst ERST DANACH eingespielt: Eine aktive
      // Reservierung darf Fencing 4 tragen, waehrend der letzte KO-Stand noch
      // Fencing 3 traegt. Die transaktionslokale
      // Markierung oeffnet daher nur dieses eine Importstatement und faellt beim
      // Commit automatisch zurueck.
      const casRestore = casRestoreVorbereitung(tabelle);
      const sqlPfad = path.join(protokollDir, `_import_${tabelle}.sql`);
      try {
        fs.writeFileSync(datenPfad, elemente.map(escapeCopyZeile).join("\n") + (elemente.length ? "\n" : ""));
        fs.writeFileSync(sqlPfad, [
          "begin;",
          casRestore,
          "create temp table _stage(zeile jsonb);",
          elemente.length ? `\\copy _stage(zeile) from '${datenPfad}' with (format text)` : "-- leere Tabelle",
          `insert into public."${tabelle}" ${overriding}select r.* from _stage s, lateral jsonb_populate_record(null::public."${tabelle}", s.zeile) r;`,
          "drop table _stage;",
          "commit;"
        ].join("\n"));
        psql(conn, dbName, sqlPfad, true);
        importiert[tabelle] = elemente.length;
      } finally {
        // COPY-Staging kann PII enthalten und muss auch bei Importfehlern weg.
        const cleanupFehler = entferneSensibleDateien([datenPfad, sqlPfad]);
        if (cleanupFehler.length) {
          throw new Error(`Sicherheitsabbruch: sensible Staging-Dateien konnten nicht entfernt werden: ${cleanupFehler.join(", ")}`);
        }
      }
    }
    // Identity-Sequenzen fortsetzen — sonst kollidiert der ERSTE neue Insert
    // nach einem echten Restore mit einer importierten ID. Teil des Rueckwegs,
    // nicht nur der Uebung.
    for (const tabelle of identityTabellen) {
      if (!(tabelle in manifest.tabellen)) continue;
      psqlWert(conn, dbName,
        `select setval(pg_get_serial_sequence('public."${tabelle}"','id'), coalesce((select max(id) from public."${tabelle}"), 0) + 1, false)`);
    }
    protokoll.schritte.importSekunden = Math.round((Date.now() - tImport) / 1000);
    protokoll.schritte.tabellenImportiert = reihenfolge.length;

    // 5) Beweise.
    const tVerify = Date.now();

    // 5a) Tabellen vorhanden + Zeilenzahlen == Manifest.
    let zaehlerOk = true;
    const zaehlerDetails = [];
    for (const [tabelle, soll] of Object.entries(manifest.tabellen)) {
      const ist = Number(psqlWert(conn, dbName, `select count(*) from public."${tabelle}"`));
      if (ist !== soll) { zaehlerOk = false; zaehlerDetails.push(`${tabelle}: ${ist}/${soll}`); }
    }
    pruefe("Zeilenzahlen aller Tabellen == Manifest", zaehlerOk, zaehlerOk ? `${Object.keys(manifest.tabellen).length} Tabellen exakt` : zaehlerDetails.join("; "));

    // 5b) Keine unerwarteten Zusatzdaten: Gesamtsumme == Manifestsumme und
    //     keine Tabelle ausserhalb des Manifests traegt Zeilen.
    const manifestSumme = Object.values(manifest.tabellen).reduce((a, b) => a + b, 0);
    const dbSumme = Number(psqlWert(conn, dbName,
      `select coalesce(sum(n),0) from (select (xpath('/row/cnt/text()', query_to_xml(format('select count(*) as cnt from %I.%I','public',t.tablename), false, true, '')))[1]::text::bigint as n from pg_tables t where schemaname='public') q`));
    pruefe("Keine unerwarteten Zusatzdaten (Gesamtzeilensumme == Manifest)", dbSumme === manifestSumme, `${dbSumme} vs ${manifestSumme}`);

    // 5c) PK-Mengen byte-identisch je Tabelle (keine kanonische ID verloren).
    let pkOk = true;
    const pkDetails = [];
    for (const [tabelle, pkSpaltenStr] of Object.entries(TABLES)) {
      if (!(tabelle in manifest.tabellen)) continue;
      const pkSpalten = pkSpaltenStr.split(",").map((s) => s.trim());
      const zeilen = parseJsonVerlustfrei(fs.readFileSync(path.join(backupDir, `${tabelle}.json`), "utf8"));
      const sollDigest = pkDigestAusZeilen(zeilen, pkSpalten);
      const concat = pkSpalten.map((c) => `"${c}"::text`).join(`, E'\\x1f', `);
      const istDigest = psqlWert(conn, dbName,
        `select encode(sha256(convert_to(coalesce(string_agg(k, E'\\n' order by k collate "C"),''),'utf8')),'hex') from (select concat(${concat}) as k from public."${tabelle}") q`);
      if (sollDigest !== istDigest) { pkOk = false; pkDetails.push(tabelle); }
    }
    pruefe("Primaerschluessel-Mengen byte-identisch (Digest je Tabelle)", pkOk, pkOk ? `${Object.keys(manifest.tabellen).length} Tabellen` : `abweichend: ${pkDetails.join(", ")}`);

    // 5d) Vollstaendiger feldgenauer All-row-Digest fuer JEDE Tabelle. Die
    // spaeteren Stichproben bleiben nur als gezielter Diagnosevertrag; das
    // Gruen haengt nicht von einer Stichprobe ab.
    let feldOk = true;
    const feldDetails = [];
    for (const [tabelle, pkSpaltenStr] of Object.entries(TABLES)) {
      if (!(tabelle in manifest.tabellen)) continue;
      const pkSpalten = pkSpaltenStr.split(",").map((s) => s.trim());
      const backupZeilen = parseJsonVerlustfrei(fs.readFileSync(path.join(backupDir, `${tabelle}.json`), "utf8"));
      const dbRoh = psqlWert(conn, dbName, `select to_jsonb(t) from public."${tabelle}" t`);
      const dbZeilen = dbRoh ? dbRoh.split("\n").filter(Boolean).map(parseJsonVerlustfrei) : [];
      const typen = spaltenTypenJeTabelle[tabelle] || {};
      const sollDigest = feldDigestAusZeilen(backupZeilen, pkSpalten, typen);
      const istDigest = feldDigestAusZeilen(dbZeilen, pkSpalten, typen);
      if (sollDigest !== istDigest) { feldOk = false; feldDetails.push(tabelle); }
    }
    pruefe("Alle Felder aller Zeilen aller Tabellen byte-semantisch identisch (All-row-Digest)", feldOk,
      feldOk ? `${Object.keys(manifest.tabellen).length} Tabellen vollstaendig` : `abweichend: ${feldDetails.join(", ")}`);

    // 5e) Zusaetzliche deterministische Diagnose-Stichproben je kritischer Tabelle.
    let stichprobenGesamt = 0;
    let stichprobenAbweichungen = [];
    for (const tabelle of KRITISCHE_TABELLEN) {
      if (!(tabelle in manifest.tabellen)) continue;
      const pkSpalten = TABLES[tabelle].split(",").map((s) => s.trim());
      const zeilen = parseJsonVerlustfrei(fs.readFileSync(path.join(backupDir, `${tabelle}.json`), "utf8"));
      if (!zeilen.length) continue;
      const sortiert = zeilen.map((z) => ({ k: pkTextZeile(z, pkSpalten), z }));
      const reihenfolgeKeys = sortiereBytes(sortiert.map((p) => p.k));
      const proIndex = new Map(sortiert.map((p) => [p.k, p.z]));
      for (const idx of waehleStichprobenIndizes(reihenfolgeKeys.length, STICHPROBEN_JE_TABELLE)) {
        const zeile = proIndex.get(reihenfolgeKeys[idx]);
        const where = pkSpalten.map((c) => `"${c}"::text = ${sqlLiteral(verlustfreierZahltext(zeile[c]) ?? String(zeile[c]))}`).join(" and ");
        const raw = psqlWert(conn, dbName, `select to_jsonb(t) from public."${tabelle}" t where ${where}`);
        stichprobenGesamt++;
        if (!raw) { stichprobenAbweichungen.push({ tabelle, pkDigest: sha256(Buffer.from(pkTextZeile(zeile, pkSpalten))).slice(0, 12), spalten: ["(Zeile fehlt)"] }); continue; }
        const diff = vergleicheZeile(zeile, parseJsonVerlustfrei(raw), spaltenTypenJeTabelle[tabelle] || {});
        if (diff.length) stichprobenAbweichungen.push({ tabelle, pkDigest: sha256(Buffer.from(pkTextZeile(zeile, pkSpalten))).slice(0, 12), spalten: diff.map((d) => d.spalte) });
      }
    }
    pruefe("Feldgenaue Stichproben kritischer Tabellen", stichprobenAbweichungen.length === 0,
      stichprobenAbweichungen.length ? JSON.stringify(stichprobenAbweichungen).slice(0, 400) : `${stichprobenGesamt} Zeilen feldidentisch`);

    // 5f) Spalten-Vollstaendigkeit knowledge_objects (Sprint-19–21-Felder und
    //     alle uebrigen Spalten): Nicht-NULL-Zaehler je Spalte == Backup.
    {
      const zeilen = parseJsonVerlustfrei(fs.readFileSync(path.join(backupDir, "knowledge_objects.json"), "utf8"));
      const spalten = zeilen.length ? Object.keys(zeilen[0]) : [];
      const abweichend = [];
      for (const spalte of spalten) {
        const soll = zeilen.filter((z) => z[spalte] !== null && z[spalte] !== undefined).length;
        const ist = Number(psqlWert(conn, dbName, `select count("${spalte}") from public.knowledge_objects`));
        if (ist !== soll) abweichend.push(`${spalte}: ${ist}/${soll}`);
      }
      pruefe("knowledge_objects: Nicht-NULL-Zaehler je Spalte == Backup (inkl. Sprint-19–21-Felder)", abweichend.length === 0,
        abweichend.length ? abweichend.join("; ") : `${spalten.length} Spalten geprueft`);
      const nachklassSoll = zeilen.filter((z) => z.classification_confidence && z.classification_confidence.nachklassifikation_am).length;
      const nachklassIst = Number(psqlWert(conn, dbName, `select count(*) from public.knowledge_objects where classification_confidence ? 'nachklassifikation_am'`));
      pruefe("Sprint-21-Nachklassifikation erhalten (classification_confidence.nachklassifikation_am)", nachklassIst === nachklassSoll, `${nachklassIst}/${nachklassSoll} Objekte`);
    }

    // 5g) Katalogmengen gegen den am 2026-08-28 rein lesend erhobenen Beleg.
    // Der gesonderte strukturierte Spaltenkatalog wurde bereits vor DB-Anlage
    // geprueft; freier historischer schemaDrift-Text kann ihn nicht ersetzen.
    const dbTabellen = psqlWert(conn, dbName, `select tablename from pg_tables where schemaname='public' order by 1`).split("\n").filter(Boolean);
    const refTabellen = Object.keys(TABLES).sort();
    pruefe("Tabellenmenge == migrationsgesichertes Backup-Inventar", JSON.stringify(dbTabellen) === JSON.stringify(refTabellen),
      `${dbTabellen.length}/${refTabellen.length}`);
    const rlsOhne = psqlWert(conn, dbName, `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1`).split("\n").filter(Boolean);
    pruefe("RLS auf allen Tabellen aktiv", rlsOhne.length === 0, rlsOhne.join(", ") || `${dbTabellen.length} Tabellen`);
    const dbPolicies = psqlWert(conn, dbName, `select tablename||':'||policyname from pg_policies where schemaname='public' order by 1`).split("\n").filter(Boolean);
    pruefe("Policy-Menge == Production-Referenz (keine RLS-Policy fehlt, keine zusaetzlich)",
      JSON.stringify(dbPolicies) === JSON.stringify(strukturReferenz.policies.slice().sort()), `${dbPolicies.length}/${strukturReferenz.policies.length}`);
    const dbTrigger = psqlWert(conn, dbName, `select c.relname||':'||t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by 1`).split("\n").filter(Boolean);
    pruefe("Trigger-Menge == Production-Referenz", JSON.stringify(dbTrigger) === JSON.stringify(strukturReferenz.trigger.slice().sort()), `${dbTrigger.length}/${strukturReferenz.trigger.length}`);
    const dbFunktionen = psqlWert(conn, dbName, `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') and p.proname <> 'jwt' order by 1`).split("\n").filter(Boolean);
    pruefe("Funktions-Menge == Production-Referenz", JSON.stringify(dbFunktionen) === JSON.stringify(strukturReferenz.funktionen.slice().sort()), `${dbFunktionen.length}/${strukturReferenz.funktionen.length}`);

    // 5g) Mandantentrennung FUNKTIONAL: RLS-Probe mit auth.jwt()-Shim.
    //     Mandanten werden aus den DATEN gewaehlt (kein Mandant hartkodiert).
    {
      const briefings = parseJsonVerlustfrei(fs.readFileSync(path.join(backupDir, "briefings.json"), "utf8"));
      const proTenant = new Map();
      for (const b of briefings) proTenant.set(b.user_id, (proTenant.get(b.user_id) || 0) + 1);
      const tenants = Array.from(proTenant.entries()).sort((a, b) => b[1] - a[1]).map((p) => p[0]);
      if (tenants.length >= 2) {
        const [tA, tB] = [tenants[0], tenants[1]];
        const zaehle = (tenant, tabelle) => Number(psqlWert(conn, dbName, [
          "begin;",
          `select set_config('request.jwt.claims', ${sqlLiteral(JSON.stringify({ user_id: tenant }))}, true);`,
          "set local role authenticated;",
          `select count(*) from public."${tabelle}";`,
          "rollback;"
        ].join(" ")).split("\n").filter(Boolean).pop());
        let rlsOk = true;
        const rlsDetails = [];
        for (const tabelle of TENANT_PROBE_TABELLEN) {
          const zeilenT = parseJsonVerlustfrei(fs.readFileSync(path.join(backupDir, `${tabelle}.json`), "utf8"));
          const sollA = zeilenT.filter((z) => z.user_id === tA).length;
          const sollB = zeilenT.filter((z) => z.user_id === tB).length;
          const istA = zaehle(tA, tabelle);
          const istB = zaehle(tB, tabelle);
          const istOhne = Number(psqlWert(conn, dbName, [
            "begin;", "set local role authenticated;", `select count(*) from public."${tabelle}";`, "rollback;"
          ].join(" ")).split("\n").filter(Boolean).pop());
          if (istA !== sollA || istB !== sollB || istOhne !== 0) {
            rlsOk = false;
            rlsDetails.push(`${tabelle}: MandantA ${istA}/${sollA}, MandantB ${istB}/${sollB}, ohne Claim ${istOhne}/0`);
          }
        }
        pruefe("Mandantentrennung funktional (RLS-Probe als authenticated, je Mandant nur eigene Zeilen, ohne Claim 0)",
          rlsOk, rlsOk ? `${TENANT_PROBE_TABELLEN.length} Tabellen, 2 Mandanten, Kreuz- und Leerprobe` : rlsDetails.join("; "));
      } else {
        pruefe("Mandantentrennung funktional (RLS-Probe)", false, "weniger als 2 Mandanten mit Briefings im Backup — Probe nicht durchfuehrbar");
      }
    }

    // 5h) Funktions-/Trigger-Proben (in der Drill-DB; Trigger in ROLLBACK-Txn).
    {
      const embeddings = parseJsonVerlustfrei(fs.readFileSync(path.join(backupDir, "profile_embeddings.json"), "utf8"));
      const koZeilen = parseJsonVerlustfrei(fs.readFileSync(path.join(backupDir, "knowledge_objects.json"), "utf8"));
      const mitEmbedding = koZeilen.filter((z) => z.embedding !== null && z.embedding !== undefined).length;
      if (embeddings.length && mitEmbedding > 0) {
        const n = Number(psqlWert(conn, dbName,
          `select count(*) from public.match_knowledge_objects(${sqlLiteral(String(embeddings[0].embedding))}::vector, 3, null, null, null)`));
        pruefe("Funktionsprobe match_knowledge_objects (pgvector, echtes Profil-Embedding)", n > 0 && n <= 3, `${n} Treffer (Embeddings im Bestand: ${mitEmbedding})`);
      } else {
        pruefe("Funktionsprobe match_knowledge_objects", mitEmbedding === 0, `uebersprungen — keine Embeddings im Backup (Profile: ${embeddings.length}, KOs mit Embedding: ${mitEmbedding})`);
      }
      const blobIds = parseJsonVerlustfrei(fs.readFileSync(path.join(backupDir, "helmut_store.json"), "utf8"));
      if (blobIds.length) {
        const erste = blobIds[0];
        const triggerErgebnis = psqlWert(conn, dbName, [
          "begin;",
          `update public.helmut_store set data = data where id = ${sqlLiteral(erste.id)} returning (updated_at > ${sqlLiteral(erste.updated_at)}::timestamptz)::text;`,
          "rollback;"
        ].join(" ")).split("\n").filter(Boolean).pop();
        pruefe("Triggerprobe helmut_store_set_updated_at (in Rollback-Transaktion)", triggerErgebnis === "true", `updated_at fortgeschrieben: ${triggerErgebnis}`);
      }
    }

    protokoll.schritte.verifySekunden = Math.round((Date.now() - tVerify) / 1000);
    protokoll.erfolg = protokoll.fehler.length === 0;
    protokoll.status = protokoll.erfolg ? "erfolgreich" : "fehlgeschlagen";
  } catch (error) {
    protokoll.status = "abgebrochen";
    protokoll.erfolg = false;
    protokoll.fehler.push({ pruefung: "(Abbruch)", detail: String(error.message).slice(0, 500) });
    console.error(ohneSecrets(`ABBRUCH: ${error.message}`));
  } finally {
    schreibeProtokoll();
  }

  console.log(ohneSecrets(`\nRestore-Verify ${protokoll.status.toUpperCase()} — ${protokoll.pruefungen.filter((p) => p.ok).length}/${protokoll.pruefungen.length} Pruefungen, Protokoll: ${path.join(protokollDir, "protokoll.md")}`));
  process.exit(protokoll.erfolg ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  pruefeZiel,
  pruefeDateiPruefsummen,
  escapeCopyZeile,
  sqlLiteral,
  pkTextZeile,
  sortiereBytes,
  pkDigestAusZeilen,
  feldDigestAusZeilen,
  waehleStichprobenIndizes,
  normalisiereWert,
  vergleicheZeile,
  ohneSecrets,
  baueLaufKennung,
  casRestoreVorbereitung,
  pruefeSpaltengenauenProduktionsbeleg,
  baueSpaltenKatalogAusKatalogzeilen,
  spaltenTypenAusKatalog,
  SPALTEN_KATALOG_SQL,
  DATENBANK_VERSION_SQL,
  postgresVersionNumAusReferenz,
  pruefeLokaleDatenbankVersion,
  psqlFehlermeldung,
  entferneSensibleDateien,
  KRITISCHE_TABELLEN,
  TENANT_PROBE_TABELLEN,
  STRUKTUR_REFERENZ_PFAD
};
