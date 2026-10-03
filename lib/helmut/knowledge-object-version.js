"use strict";

// Vollstaendige Nichtvektor-Version, getrennt von App59 und allen Schreibern.
// Feldidentitaet/JSON-Werte sind kein nativer Typ-, Codec- oder Herkunftsbeleg.
const crypto = require("node:crypto");
const VERSION = "helmut-knowledge-object-version-projection/1";
const VERSION_FIELDS = Object.freeze([
  "id", "vorgang_id", "ko_version", "headline", "was_ist_passiert", "warum_wichtig", "wer_ist_betroffen",
  "parteien", "ausschuesse", "ministerien", "risiken", "chancen", "zeitdruck", "handlungsempfehlung",
  "confidence_score", "source_document_count", "status", "understanding_status", "mentioned_people",
  "mentioned_mps", "mentioned_parties", "mentioned_committees", "mentioned_ministries", "mentioned_locations",
  "mentioned_organizations", "policy_field", "political_level", "instrument", "stage", "tags", "deadline",
  "best_source_url", "best_link_type", "source_trust", "understanding_model", "understanding_tokens",
  "created_at", "updated_at", "display_title", "display_summary", "why_relevant", "recommendation",
  "display_category", "risk_of_no_action", "opportunity_summary", "recommended_communication", "action_items",
  "risk_level", "opportunity_level", "recommended_communication_struct", "action_items_struct", "decision_level",
  "related_levels", "event_type", "affected_geographies", "mentioned_geographies", "decision_entities",
  "related_entities", "classification_confidence", "verstehen_fencing"
]);
const SELECT = VERSION_FIELDS.join(",");
const FIELDSET_HASH = crypto.createHash("sha256").update(JSON.stringify(VERSION_FIELDS), "utf8").digest("hex");
const object = x => x !== null && typeof x === "object" && !Array.isArray(x)
  && [Object.prototype, null].includes(Object.getPrototypeOf(x));
const requireThat = (ok, code) => { if (!ok) throw new Error("knowledge-object-version-" + code); };
function jsonValue(x, depth = 0) {
  requireThat(depth <= 80, "json-tiefe");
  if (x === null || typeof x === "string" || typeof x === "boolean") return;
  if (typeof x === "number") {
    requireThat(Number.isFinite(x) && (!Number.isInteger(x) || Number.isSafeInteger(x)), "json-zahl");
    return;
  }
  requireThat(Array.isArray(x) || object(x), "json-wert");
  requireThat(!Object.hasOwn(x, "toJSON"), "json-tojson");
  requireThat(Object.getOwnPropertySymbols(x).length === 0, "json-symbol");
  const descriptors = Object.getOwnPropertyDescriptors(x);
  for (const key of Object.keys(x)) {
    requireThat(Object.hasOwn(descriptors[key], "value"), "json-accessor");
    jsonValue(descriptors[key].value, depth + 1);
  }
  if (Array.isArray(x)) requireThat(Object.keys(x).length === x.length, "json-array");
}
function pruefe(version) {
  requireThat(object(version) && Object.keys(version).sort().join("|") === [...VERSION_FIELDS].sort().join("|"), "ko60-felder");
  jsonValue(version);
  return { projectionVersion: VERSION, projectionFieldsetHash: FIELDSET_HASH };
}
module.exports = { VERSION, VERSION_FIELDS, SELECT, FIELDSET_HASH, pruefe, jsonValue };
