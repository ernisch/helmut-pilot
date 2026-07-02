"use strict";

// Helmut Core V3 — C7b: JSON-Schema + Validator fuer knowledge_objects.
// Wird VOM GOLDSET geprueft und spaeter (C7) vom echten understandDocument()-Call
// als Structured-Output-Vertrag genutzt (Form erzwingen). Reine, deps-freie Logik.
//
// DSGVO by design:
//   - Alle Pflichtfelder muessen praesent sein (auch leer []), damit die KI keine
//     Felder "vergisst" und spaeter kein Nachfassen (2. Call) noetig ist.
//   - dsgvoScan() verbietet Kontakt-/PII-Felder und E-Mail-Muster und stellt sicher,
//     dass mentioned_* kurze OEFFENTLICHE Labels sind (Erwaehnung, kein Dossier).
//   - mentioned_* sind ausschliesslich oeffentlich-politische Akteure — es werden
//     keine privaten Personenprofile aus Artikeln abgeleitet.

const MENTION_FIELDS = [
  "mentioned_people", "mentioned_mps", "mentioned_parties", "mentioned_committees",
  "mentioned_ministries", "mentioned_locations", "mentioned_organizations"
];

const ZEITDRUCK_ENUM = ["hoch", "mittel", "niedrig", "keiner"];
const STATUS_ENUM = ["neu", "update", "beobachtung", "abgeschlossen"];

// JSON-Schema (draft-07-nah) — single source of truth fuer Struktur & Pflichtfelder.
const KNOWLEDGE_OBJECT_SCHEMA = {
  type: "object",
  additionalProperties: true, // erlaubt zusaetzliche V3-Spalten (tags, stage, deadline, ...)
  required: [
    "id", "vorgang_id", "status", "confidence_score", "source_document_count",
    "was_ist_passiert", "warum_wichtig", "wer_ist_betroffen", "zeitdruck", "handlungsempfehlung",
    "parteien", "ausschuesse", "ministerien", "risiken", "chancen",
    "mentioned_people", "mentioned_mps", "mentioned_parties", "mentioned_committees",
    "mentioned_ministries", "mentioned_locations", "mentioned_organizations"
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    vorgang_id: { type: "string", minLength: 1 },
    ko_version: { type: "integer", minimum: 1 },
    headline: { type: "string" },
    status: { type: "string", enum: STATUS_ENUM },
    confidence_score: { type: "integer", minimum: 0, maximum: 100 },
    source_document_count: { type: "integer", minimum: 0 },
    // Pflicht-Analyse (Prosa, nicht leer):
    was_ist_passiert: { type: "string", minLength: 1 },
    warum_wichtig: { type: "string", minLength: 1 },
    wer_ist_betroffen: { type: "string", minLength: 1 },
    zeitdruck: { type: "string", enum: ZEITDRUCK_ENUM },
    handlungsempfehlung: { type: "string", minLength: 1 },
    // Strukturierte Listen (duerfen leer sein, muessen aber praesent sein):
    parteien: { type: "array", items: { type: "string" } },
    ausschuesse: { type: "array", items: { type: "string" } },
    ministerien: { type: "array", items: { type: "string" } },
    risiken: { type: "array", items: { type: "string" } },
    chancen: { type: "array", items: { type: "string" } },
    // Radar-Erwaehnungen (oeffentlich-politisch):
    mentioned_people: { type: "array", items: { type: "string" } },
    mentioned_mps: { type: "array", items: { type: "string" } },
    mentioned_parties: { type: "array", items: { type: "string" } },
    mentioned_committees: { type: "array", items: { type: "string" } },
    mentioned_ministries: { type: "array", items: { type: "string" } },
    mentioned_locations: { type: "array", items: { type: "string" } },
    mentioned_organizations: { type: "array", items: { type: "string" } }
  }
};

function jsonType(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function checkValue(value, spec, path, errors) {
  if (spec.type === "array") {
    if (!Array.isArray(value)) { errors.push(`${path}: erwartet array, ist ${jsonType(value)}`); return; }
    if (spec.items) value.forEach((el, i) => checkValue(el, spec.items, `${path}[${i}]`, errors));
    return;
  }
  if (spec.type === "integer") {
    if (!Number.isInteger(value)) { errors.push(`${path}: erwartet integer, ist ${jsonType(value)}`); return; }
    if (spec.minimum !== undefined && value < spec.minimum) errors.push(`${path}: ${value} < min ${spec.minimum}`);
    if (spec.maximum !== undefined && value > spec.maximum) errors.push(`${path}: ${value} > max ${spec.maximum}`);
    return;
  }
  if (spec.type === "string") {
    if (typeof value !== "string") { errors.push(`${path}: erwartet string, ist ${jsonType(value)}`); return; }
    if (spec.minLength !== undefined && value.trim().length < spec.minLength) errors.push(`${path}: leer/zu kurz`);
    if (spec.enum && !spec.enum.includes(value)) errors.push(`${path}: '${value}' nicht in {${spec.enum.join(", ")}}`);
  }
}

// Struktur-/Pflichtfeld-Validierung gegen das Schema.
function validateKnowledgeObject(ko = {}, schema = KNOWLEDGE_OBJECT_SCHEMA) {
  const errors = [];
  if (!ko || typeof ko !== "object" || Array.isArray(ko)) {
    return { valid: false, errors: ["knowledge_object ist kein Objekt"] };
  }
  for (const key of schema.required || []) {
    if (ko[key] === undefined) errors.push(`Pflichtfeld fehlt: ${key}`);
  }
  for (const [key, spec] of Object.entries(schema.properties || {})) {
    if (ko[key] !== undefined) checkValue(ko[key], spec, key, errors);
  }
  errors.push(...dsgvoScan(ko));
  return { valid: errors.length === 0, errors };
}

// DSGVO: keine Kontakt-/PII-Felder, keine E-Mail-Muster, mentioned_* nur kurze
// oeffentliche Labels (Erwaehnung, kein privates Personenprofil/Dossier).
const FORBIDDEN_PII_KEYS = [
  "email", "e_mail", "mail", "phone", "telefon", "tel", "handy", "address", "adresse",
  "anschrift", "private", "privat", "geburtsdatum", "geburtstag", "dob", "iban",
  "ssn", "sozialversicherung", "personalausweis", "passport", "kontakt"
];
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const MENTION_MAX_LEN = 120;

function dsgvoScan(ko) {
  const errors = [];
  for (const key of Object.keys(ko)) {
    const low = key.toLowerCase();
    if (FORBIDDEN_PII_KEYS.some((f) => low.includes(f))) errors.push(`DSGVO: verbotenes PII-Feld '${key}'`);
  }
  const scan = (value, path) => {
    if (typeof value === "string") {
      if (EMAIL_RE.test(value)) errors.push(`DSGVO: E-Mail-Muster in ${path}`);
    } else if (Array.isArray(value)) {
      value.forEach((el, i) => scan(el, `${path}[${i}]`));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([k, v]) => scan(v, `${path}.${k}`));
    }
  };
  scan(ko, "ko");
  for (const field of MENTION_FIELDS) {
    for (const entry of ko[field] || []) {
      if (typeof entry === "string" && entry.length > MENTION_MAX_LEN) {
        errors.push(`DSGVO: ${field}-Eintrag zu lang (${entry.length}) — Erwaehnung, kein Dossier`);
      }
    }
  }
  return errors;
}

const GOLDSET_CASE_TYPES = [
  "neuer_vorgang", "update_bestehender_vorgang", "mehrere_artikel_selber_vorgang",
  "lokaler_bezug", "partei_bezug", "ausschuss_bezug", "abgeordneten_erwaehnung"
];

// Ein raw_document im Goldset muss datenminimiert sein (wie C6 toRawDocumentRow):
// KEIN Volltext/excerpt/imageUrl/Autor-PII.
const FORBIDDEN_RAWDOC_KEYS = ["content", "excerpt", "imageurl", "image_url", "author", "body", "volltext"];

function validateGoldset(goldset) {
  const errors = [];
  const cases = (goldset && Array.isArray(goldset.cases)) ? goldset.cases : null;
  if (!cases) return { valid: false, errors: ["Goldset hat kein cases[]-Array"], caseTypes: [] };

  const seenTypes = new Set();
  cases.forEach((c, i) => {
    const label = c && c.name ? c.name : `#${i}`;
    if (!c || typeof c !== "object") { errors.push(`Fall ${label}: kein Objekt`); return; }
    if (!GOLDSET_CASE_TYPES.includes(c.case_type)) errors.push(`Fall ${label}: unbekannter case_type '${c.case_type}'`);
    else seenTypes.add(c.case_type);
    if (!Array.isArray(c.raw_documents) || c.raw_documents.length === 0) {
      errors.push(`Fall ${label}: raw_documents fehlt/leer`);
    } else {
      c.raw_documents.forEach((doc, j) => {
        for (const key of Object.keys(doc || {})) {
          if (FORBIDDEN_RAWDOC_KEYS.includes(key.toLowerCase())) {
            errors.push(`Fall ${label} raw_documents[${j}]: DSGVO — verbotenes Feld '${key}' (Volltext/PII)`);
          }
        }
      });
    }
    const res = validateKnowledgeObject(c.expected);
    res.errors.forEach((e) => errors.push(`Fall ${label} expected: ${e}`));
  });

  const missingTypes = GOLDSET_CASE_TYPES.filter((t) => !seenTypes.has(t));
  if (missingTypes.length) errors.push(`Nicht abgedeckte Fall-Typen: ${missingTypes.join(", ")}`);

  return { valid: errors.length === 0, errors, caseTypes: [...seenTypes] };
}

module.exports = {
  KNOWLEDGE_OBJECT_SCHEMA,
  MENTION_FIELDS,
  GOLDSET_CASE_TYPES,
  ZEITDRUCK_ENUM,
  STATUS_ENUM,
  validateKnowledgeObject,
  validateGoldset,
  dsgvoScan
};
