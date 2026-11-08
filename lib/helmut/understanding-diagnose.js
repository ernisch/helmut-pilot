"use strict";

// Gemeinsame Speichergrenze fuer wertfreie Understanding-Diagnosen. Keine
// Validierungsentscheidung: unbekannte Codes/Pfade werden nur hier verworfen.
const { createHash } = require("node:crypto");
const { KNOWLEDGE_OBJECT_SCHEMA, MENTION_FIELDS } = require("./understanding-schema");
const { redactSensitive } = require("./redact");

const MAX_AUFFAELLIGKEITEN = 25;
const MAX_VALIDIERUNGSFEHLER = 5;
const FELDPFADE = new Set(["unbekannt"]);
function schemaPfade(spec, prefix = "") {
  for (const [key, child] of Object.entries(spec.properties || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    FELDPFADE.add(path);
    schemaPfade(child.items || child, path);
  }
}
schemaPfade(KNOWLEDGE_OBJECT_SCHEMA);
const SCHEMA_CODES = new Set(["schema-pflichtfeld", "schema-leer", "schema-zu-lang",
  "schema-enum", "schema-null", "schema-typ", "schema-fehler"]);
const FESTE_CODES = new Set(["ki-antwort-nicht-verwertbar", "decision_level-antwortkonflikt",
  "schema-objekt", "dsgvo-pii-feld", "dsgvo-eintrag-zu-lang",
  ...["ministerien", "mentioned_ministries", "parteien", "mentioned_parties",
    "mentioned_people", "mentioned_mps", "ausschuesse", "mentioned_committees"]
    .map(f => `quellenbeleg-${f}`)]);

function sichereValidierungsfehler(values) {
  if (!Array.isArray(values)) return [];
  const out = [];
  // Der vorhandene Bericht fuehrt bereits hoechstens fuenf Eintraege.
  for (const value of values.slice(0, MAX_VALIDIERUNGSFEHLER)) {
    if (typeof value !== "string" || value.length > 160) continue;
    const [code, path, extra] = value.split(":");
    const erlaubt = FESTE_CODES.has(value) || (extra === undefined && (
      (SCHEMA_CODES.has(code) && FELDPFADE.has(path))
      || (code === "dsgvo-emailmuster" && typeof path === "string"
        && path.startsWith("ko.") && FELDPFADE.has(path.slice(3)))
      || (code === "dsgvo-eintrag-zu-lang" && MENTION_FIELDS.includes(path))));
    if (erlaubt && !out.includes(value)) out.push(value);
  }
  return out;
}

const STATUS = new Set(["saved", "updated", "merged", "duplicate", "skipped-failed",
  "skipped-error", "skipped-invalid", "cluster-error", "skipped-update-final",
  "skipped-no-vorgang", "skipped-ausgang-unbekannt"]);
const GRUENDE = new Set(["validierung-fehlgeschlagen", "aktualisierung-ungueltig",
  "konflikt-neue-kennung", "ki-antwort-nicht-verwertbar"]);

function vorgangsHash(entry) {
  if (typeof entry.vorgangHash === "string" && /^[a-f0-9]{64}$/.test(entry.vorgangHash)) return entry.vorgangHash;
  const id = entry.vorgangId;
  // Kennung nie selbst speichern: ihr Slug kann Namen oder Quelleninhalt tragen.
  if (typeof id !== "string" || !/^vg-[a-z0-9äöüß-]{1,120}$/i.test(id)
    || redactSensitive(id) !== id) return null;
  return createHash("sha256").update(id).digest("hex");
}

function sichereAuffaelligkeiten(values) {
  if (!Array.isArray(values)) return [];
  return values.slice(0, MAX_AUFFAELLIGKEITEN)
    .filter(e => e && typeof e === "object" && !Array.isArray(e))
    .map(e => ({
      vorgangHash: vorgangsHash(e),
      status: STATUS.has(e.status) ? e.status : "unbekannt",
      grund: GRUENDE.has(e.grund) ? e.grund : null,
      validierungsfehler: sichereValidierungsfehler(e.validierungsfehler)
    }));
}

module.exports = { MAX_AUFFAELLIGKEITEN, sichereValidierungsfehler, sichereAuffaelligkeiten };
