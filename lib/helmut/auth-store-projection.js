"use strict";

// Ausschliesslich lesende Ansichten. Niemals als vollstaendigen Kontenstand
// zurueckschreiben: weder lokal noch ueber den CAS Schreiber.
const READ_ONLY = Symbol("auth-store-read-only");
const TYPES = Object.freeze({
  users: "array", sessions: "array", assignments: "array", dailyInputs: "array",
  auditEvents: "array", systemErrors: "array", passwordTokens: "array", processRuns: "array",
  pipelineLocks: "object", understandingRetries: "object", updateRetries: "object",
  sourceModeShadowLastRun: "nullable", adminRecoveryLastRun: "nullable",
  monitoringWebhookDelivery: "nullable"
});

function fieldsFor(fields) {
  if (!Array.isArray(fields) || !fields.length || fields.some(f => typeof f !== "string" || !Object.hasOwn(TYPES, f))) {
    throw new Error("Ungueltige Feldauswahl des Kontenspeichers");
  }
  return [...new Set(fields)];
}

function select(fields) {
  return ["id", ...fieldsFor(fields).map(f => `${f}:data->${f}`)].join(",");
}

function project(store, fields) {
  const out = {};
  for (const field of fieldsFor(fields)) {
    const type = TYPES[field], value = store[field];
    if (value == null) out[field] = type === "array" ? [] : type === "object" ? {} : null;
    else if (type === "array" ? !Array.isArray(value) : typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Ungueltiger Inhalt der Kontenspeicheransicht");
    } else out[field] = value;
  }
  // Enumerable: auch {...ansicht} behaelt den Schutz. Keine CAS Lesemarke.
  Object.defineProperty(out, READ_ONLY, { value: true, enumerable: true });
  return out;
}

function fromRows(rows, rowId, fields) {
  const chosen = fieldsFor(fields);
  if (!Array.isArray(rows) || rows.length > 1) throw new Error("Ungueltige Antwort der Kontenspeicheransicht");
  const row = rows[0];
  if (rows.length && (!row || row.id !== rowId || chosen.some(f => !Object.hasOwn(row, f)))) {
    throw new Error("Unvollstaendige Antwort der Kontenspeicheransicht");
  }
  return project(row || {}, chosen);
}

function assertWritable(store) {
  if (store?.[READ_ONLY]) {
    const error = new Error("Eine Kontenspeicheransicht darf nicht zurueckgeschrieben werden");
    error.code = "AUTH_STORE_READ_ONLY";
    throw error;
  }
}

module.exports = { select, project, fromRows, assertWritable };
