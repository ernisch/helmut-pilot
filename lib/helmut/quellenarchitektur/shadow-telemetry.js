"use strict";

// Helmut — Quellenplattform · Sprint 4 (Shadow) · PII-freie Telemetrie (Aufgabe 7).
// =============================================================================================
// Speichert/protokolliert AUSSCHLIESSLICH technische Kennzahlen. Personenbezogene Inhalte sind
// strukturell ausgeschlossen: eine ALLOWLIST erlaubter Schluessel + eine Selbstpruefung, die
// verbotene Felder, freie Texte, E-Mails, Namen und fremde Tenant-IDs zurueckweist.
//
// Reine Logik. KEINE echte Zeit (Zeit wird injiziert), kein Storage-Write. Die Mandats- und
// Tenant-Referenz sind ANONYMISIERT (Kurz-Hash), nie die Rohkennung.

const crypto = require("crypto");

// Erlaubte technische Kennzahlen (Aufgabe 7). NICHTS ausserhalb dieser Menge darf im Record stehen.
const TELEMETRY_ALLOWED_KEYS = new Set([
  "mandatsRef",          // anonymisierte Mandatsreferenz (Hash, kein Name/keine ID)
  "tenantRef",           // tenant-interne Referenz (Hash)
  "anzahlQuellen",       // Anzahl Quellen
  "anzahlLuecken",
  "coverageStatus",      // Coverage-Wert (Slug: vollstaendig|eingeschraenkt|blockiert)
  "kritischeLuecken",    // Coverage-Wert
  "googleNewsAnteil",    // Coverage-Wert
  "qualitaetVerfuegbar", // Qualitaetswert (bool)
  "gesundheitVerfuegbar",// Gesundheitswert (bool)
  "dauerMs",             // Laufzeit
  "fehlerklasse",        // Fehlerklasse (Slug oder null)
  "vergleichBesser",     // Vergleichsergebnis (Zahlen)
  "vergleichSchlechter",
  "vergleichGleich",
  "vergleichNichtVergleichbar",
  "freigabefaehig",      // Vergleichsergebnis (bool)
  "blockerRegeln"        // Vergleichsergebnis: Liste kurzer Regel-Slugs (kein Freitext)
]);

// Muster, die NIE in einem Telemetrie-Wert vorkommen duerfen (E-Mail, offensichtlicher Name).
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

function hashRef(prefix, value) {
  const v = String(value == null ? "" : value);
  if (!v) return `${prefix}-anon`;
  const h = crypto.createHash("sha256").update(v).digest("hex").slice(0, 12);
  return `${prefix}-${h}`;
}

// Baut den PII-freien Telemetrie-Datensatz aus einem Shadow-Lauf + Vergleich + Abbruchurteil.
function buildTelemetryRecord({ run, comparison, abort, tenantId = "", durationMs = 0 } = {}) {
  const neu = run && run.neu;
  const cmp = comparison || { besser: [], schlechter: [], gleich: [], nichtVergleichbar: [] };
  const ab = abort || { freigabefaehig: false, blockers: [] };
  const record = {
    mandatsRef: hashRef("m", run && run.mandateId),
    tenantRef: hashRef("t", tenantId),
    anzahlQuellen: neu ? neu.sourceCount : 0,
    anzahlLuecken: neu ? (neu.versorgungsluecken || []).length : 0,
    coverageStatus: neu ? neu.gesamtstatus : "blockiert",
    kritischeLuecken: neu ? (neu.versorgungsluecken || []).filter((g) => ["parties", "factions", "committees"].includes(g.dimension)).length : 0,
    googleNewsAnteil: neu ? neu.suchanbieterAbhaengigkeit.anteil : 0,
    qualitaetVerfuegbar: !!(neu && neu.qualityAvailable),
    gesundheitVerfuegbar: !!(neu && neu.healthAvailable),
    dauerMs: Math.max(0, Number(durationMs) || 0),
    fehlerklasse: run && run.neuError ? String(run.neuError.klasse || "Error") : null,
    vergleichBesser: cmp.besser.length,
    vergleichSchlechter: cmp.schlechter.length,
    vergleichGleich: cmp.gleich.length,
    vergleichNichtVergleichbar: cmp.nichtVergleichbar.length,
    freigabefaehig: ab.freigabefaehig === true,
    blockerRegeln: (ab.blockers || []).map((b) => b.regel)
  };
  return record;
}

// Selbstpruefung: nur Allowlist-Schluessel, nur Skalare/kurze Regel-Slugs, keine E-Mail/kein
// Freitext, keine fremde Tenant-ID im Klartext. Rueckgabe {clean, violations}.
function checkTelemetryClean(record = {}) {
  const violations = [];
  for (const [k, v] of Object.entries(record)) {
    if (!TELEMETRY_ALLOWED_KEYS.has(k)) { violations.push(`verbotenes-feld:${k}`); continue; }
    if (Array.isArray(v)) {
      if (v.some((x) => typeof x !== "string" || x.length > 48 || /\s/.test(x) || EMAIL_RE.test(x))) violations.push(`array-inhalt:${k}`);
      continue;
    }
    if (v === null) continue;
    if (typeof v === "number" || typeof v === "boolean") continue;
    if (typeof v === "string") {
      if (EMAIL_RE.test(v)) violations.push(`email:${k}`);
      else if (v.length > 48 || /\s/.test(v)) violations.push(`freitext:${k}`);
      continue;
    }
    violations.push(`nicht-skalar:${k}`); // Objekte (z. B. ganzes Profil) sind verboten
  }
  return { clean: violations.length === 0, violations };
}

// Baut den Record UND haengt das Pruefergebnis an; wirft NIE (der Aufrufer entscheidet).
function buildCleanTelemetry(input) {
  const record = buildTelemetryRecord(input);
  const check = checkTelemetryClean(record);
  return { record, ...check };
}

module.exports = {
  TELEMETRY_ALLOWED_KEYS, hashRef,
  buildTelemetryRecord, checkTelemetryClean, buildCleanTelemetry
};
