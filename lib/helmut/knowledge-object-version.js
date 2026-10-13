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
const memoApply = Reflect.apply, MemoWeakMap = WeakMap, MemoWeakSet = WeakSet, memoMax = Math.max;
const MW = { get: WeakMap.prototype.get, has: WeakMap.prototype.has, set: WeakMap.prototype.set,
  setHas: WeakSet.prototype.has, add: WeakSet.prototype.add, delete: WeakSet.prototype.delete };
function memoMap() {
  const data = new MemoWeakMap(); return { get: key => memoApply(MW.get, data, [key]),
    has: key => memoApply(MW.has, data, [key]), set: (key, value) => { memoApply(MW.set, data, [key, value]); } };
}
function memoSet() {
  const data = new MemoWeakSet(); return { has: key => memoApply(MW.setHas, data, [key]),
    add: key => { memoApply(MW.add, data, [key]); }, delete: key => memoApply(MW.delete, data, [key]) };
}
const MEMO = { frozen: Object.isFrozen, prototype: Object.getPrototypeOf, descriptors: Object.getOwnPropertyDescriptors,
  keys: Object.keys, names: Object.getOwnPropertyNames, symbols: Object.getOwnPropertySymbols, own: Object.hasOwn,
  array: Array.isArray, finite: Number.isFinite, integer: Number.isInteger, safeInteger: Number.isSafeInteger,
  objectPrototype: Object.prototype, arrayPrototype: Array.prototype };
const object = x => x !== null && typeof x === "object" && !Array.isArray(x)
  && [Object.prototype, null].includes(Object.getPrototypeOf(x));
const requireThat = (ok, code) => { if (!ok) throw new Error("knowledge-object-version-" + code); };
function jsonValue(x, depth = 0) {
  // Dictionary aliases are immutable JSON data. Validate their complete subtree
  // once per call, but retain the depth check at every incoming alias path.
  const complete = memoMap(), visiting = memoSet();
  const { isProxy } = require("node:util").types;
  function visit(x, depth) {
    requireThat(depth <= 80, "json-tiefe");
    if (x === null || typeof x === "string" || typeof x === "boolean") return { height: 0, immutable: true };
    if (typeof x === "number") {
      requireThat(Number.isFinite(x) && (!Number.isInteger(x) || Number.isSafeInteger(x)), "json-zahl");
      return { height: 0, immutable: true };
    }
    requireThat(Array.isArray(x) || object(x), "json-wert");
    const previous = complete.get(x);
    if (previous !== undefined) {
      requireThat(depth + previous <= 80, "json-tiefe");
      return { height: previous, immutable: true };
    }
    requireThat(!visiting.has(x), "json-tiefe");
    requireThat(!Object.hasOwn(x, "toJSON"), "json-tojson");
    requireThat(Object.getOwnPropertySymbols(x).length === 0, "json-symbol");
    const descriptors = Object.getOwnPropertyDescriptors(x);
    const keys = Object.keys(x);
    let height = 0;
    visiting.add(x);
    for (const key of keys) {
      requireThat(Object.hasOwn(descriptors[key], "value"), "json-accessor");
      const child = visit(descriptors[key].value, depth + 1);
      height = memoMax(height, child.height + 1);
    }
    if (Array.isArray(x)) requireThat(Object.keys(x).length === x.length, "json-array");
    visiting.delete(x);
    let immutable = !isProxy(x) && MEMO.frozen(x);
    if (immutable) {
      const array = MEMO.array(x), prototype = MEMO.prototype(x), own = MEMO.descriptors(x), ownKeys = MEMO.keys(x);
      immutable = (array ? prototype === MEMO.arrayPrototype : prototype === MEMO.objectPrototype || prototype === null)
        && !MEMO.own(x, "toJSON") && MEMO.symbols(x).length === 0
        && MEMO.names(x).length === ownKeys.length + (array ? 1 : 0) && (!array || ownKeys.length === x.length);
      let actualHeight = 0;
      for (let i = 0; i < ownKeys.length && immutable; i++) {
        const key = ownKeys[i];
        if (array && key !== "" + i || !MEMO.own(own[key], "value")) { immutable = false; break; }
        const value = own[key].value;
        let childHeight = 0;
        if (value === null || typeof value === "string" || typeof value === "boolean") {}
        else if (typeof value === "number") immutable = MEMO.finite(value) && (!MEMO.integer(value) || MEMO.safeInteger(value));
        else if (value && typeof value === "object" && complete.has(value)) childHeight = complete.get(value);
        else immutable = false;
        actualHeight = memoMax(actualHeight, childHeight + 1);
      }
      immutable = immutable && actualHeight === height;
    }
    if (immutable) complete.set(x, height);
    return { height, immutable };
  }
  visit(x, depth);
}
function pruefe(version) {
  requireThat(object(version) && Object.keys(version).sort().join("|") === [...VERSION_FIELDS].sort().join("|"), "ko60-felder");
  jsonValue(version);
  return { projectionVersion: VERSION, projectionFieldsetHash: FIELDSET_HASH };
}
module.exports = { VERSION, VERSION_FIELDS, SELECT, FIELDSET_HASH, pruefe, jsonValue };
