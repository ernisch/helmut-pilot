"use strict";

// Only the closed server adapter attaches these hooks. JSON commands contain
// no callbacks. Normal Understanding dependencies have neither hook.
const V = require("./verstehen-vertrag");
const CODE = "FINITE_PRODUCTION_U_GUARD";
async function provedPreSend(check, actual) {
  try { await check(actual); }
  catch { const error = Error("synthetik500-production-u-guard"); error.code = CODE;
    error.kiNichtGesendet = true; throw error; }
}
function beforeEffectsPair(cluster, resolution, options, deps) {
  if (Object.hasOwn(options, "artikelkontextVersuch") || typeof deps.artikelkontextVersorgung === "function")
    throw Error("synthetik500-production-u-article-context-not-admitted");
  const existing = resolution.existing, documents = cluster.documents || [];
  if (!existing || existing.status === "pending") return { vorgangId: resolution.vorgangId,
    contractInputHash: V.eingabeHash({ vorgangId: resolution.vorgangId, dokumente: documents, modus: "erst" }) };
  const linked = resolution.bestandsDokumente || [], known = new Set(linked.map(d => d?.id).filter(Boolean));
  const added = documents.filter(d => d && (!d.id || !known.has(d.id)));
  const all = added.length ? [...linked, ...added] : linked.length ? linked : documents;
  return { vorgangId: resolution.vorgangId, contractInputHash: V.eingabeHash({ vorgangId: resolution.vorgangId,
    dokumente: all, modus: "update", koVersion: Number(existing.ko_version) > 0 ? Number(existing.ko_version) + 1 : 2 }) };
}
function attach(deps, checkPair, checkControl) {
  // This evidence comes from the pre-provider guard boundary, never from a
  // guessed provider error. Post-provider writer guards do not set it.
  const pairGuard = actual => provedPreSend(checkPair, actual);
  deps.beforeUnderstandingMutation = deps.beforeUnderstandingReservation = pairGuard;
  const request = deps.requestUnderstanding;
  deps.requestUnderstanding = async (prompt, actual) => { await pairGuard(actual); return request(prompt, actual); };
  for (const name of ["save", "saveSources", "savePending", "markFailed", "writeUpdateRetries",
    "recordGateParkung", "markGateGeparkt", "releaseGateGeparkt"]) {
    const real = deps[name];
    if (typeof real === "function") deps[name] = async (...args) => { await checkControl(); return real(...args); };
  }
  const factory = deps.verstehenVertrag;
  deps.verstehenVertrag = () => {
    const real = factory(); if (!real) return real;
    const bound = { ...real };
    for (const name of ["reserviere", "modellstart", "schreibrecht", "speichere", "vormerkungErhoehe", "vormerkungLoese"]) {
      if (typeof real[name] === "function") bound[name] = async (...args) => { await checkControl(); return real[name](...args); };
    }
    // Release/unknown recording must still work after a stop or expired window.
    return bound;
  };
  return deps;
}
module.exports = { CODE, provedPreSend, beforeEffectsPair, attach };
