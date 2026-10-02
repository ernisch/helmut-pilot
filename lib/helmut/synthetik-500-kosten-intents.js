"use strict";

// Reine Vorbereitung einer endlichen Request-Inventur. Kein Admission-Hook,
// Auth-Store-Schreiber, Anbieterclient oder Production-Konfigurationsleser.
const P = require("./synthetik-500-profile");
const K = require("./testkosten-budget");
const VERSION = "helmut-synthetik500-kosten-intents/1";
const INPUT_VERSION = "helmut-synthetik500-kosten-eingaben/1";
const MAX_WINDOW_MS = 4 * 3600000;
const MAX_U_INPUTS = 10000; // Nur lokale Eingabegroesse, keine Lauf-/Aufruffreigabe.
const SHA = /^[a-f0-9]{64}$/;
const istSha = x => typeof x === "string" && SHA.test(x);
const fordere = (ok, code) => { if (!ok) throw new Error("synthetik500-intents-" + code); };
const exakt = (o, keys) => o !== null && typeof o === "object" && !Array.isArray(o)
  && [Object.prototype, null].includes(Object.getPrototypeOf(o))
  && Object.keys(o).sort().join("|") === [...keys].sort().join("|");
function kanonisch(x) {
  if (Array.isArray(x)) return "[" + x.map(kanonisch).join(",") + "]";
  if (x !== null && typeof x === "object") return "{" + Object.keys(x).sort()
    .map(k => JSON.stringify(k) + ":" + kanonisch(x[k])).join(",") + "}";
  return JSON.stringify(x);
}
function utc(s) {
  fordere(typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)
    && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s, "utc-format");
  return Date.parse(s);
}
function normalisiere(paket, eingaben) {
  const meta = P.pruefePaket(paket);
  fordere(exakt(eingaben, ["version", "runId", "window", "model", "reviewMaxOutputTokens", "lageInputs", "understandingInputs"])
    && eingaben.version === INPUT_VERSION && typeof eingaben.runId === "string"
    && K.MANUELLE_RUN_ID.test(eingaben.runId)
    && /^nachlauf500-/.test(eingaben.runId), "eingaben-format");
  fordere(exakt(eingaben.window, ["startUTC", "endUTC"]), "fenster-format");
  const start = utc(eingaben.window.startUTC), end = utc(eingaben.window.endUTC);
  fordere(end > start && end - start <= MAX_WINDOW_MS
    && eingaben.window.startUTC.slice(0, 10) === eingaben.window.endUTC.slice(0, 10), "fenster-grenze");
  fordere(eingaben.model === "gpt-5-mini" && [3000, 6000].includes(eingaben.reviewMaxOutputTokens), "modell-qualitaetsmodus");
  const ids = new Set(paket.profile.map(p => p.mandatsId));
  fordere(Array.isArray(eingaben.lageInputs) && eingaben.lageInputs.length === 500, "lage-inputs-500");
  const lage = eingaben.lageInputs.map(x => {
    fordere(exakt(x, ["owner", "inputVersionHash"]) && typeof x.owner === "string"
      && ids.has(x.owner) && istSha(x.inputVersionHash), "lage-input-bindung");
    return { owner: x.owner, inputVersionHash: x.inputVersionHash };
  }).sort((a, b) => a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0);
  fordere(new Set(lage.map(x => x.owner)).size === 500, "lage-input-doppelt");
  const u = eingaben.understandingInputs;
  fordere(u === null || (Array.isArray(u) && u.length <= MAX_U_INPUTS), "u-inputs-endlich");
  const understanding = u === null ? null : u.map(x => {
    fordere(exakt(x, ["vorgangId", "inputVersionHash"])
      && typeof x.vorgangId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(x.vorgangId)
      && istSha(x.inputVersionHash), "u-input-bindung");
    return { vorgangId: x.vorgangId, inputVersionHash: x.inputVersionHash };
  }).sort((a, b) => a.vorgangId < b.vorgangId ? -1 : a.vorgangId > b.vorgangId ? 1 : 0);
  // Ein Vorgang darf nicht mit zwei Versionen konkurrieren. Neue Versionen
  // benoetigen einen neuen geprueften Plan, niemals einen stillen zweiten Slot.
  fordere(understanding === null || new Set(understanding.map(x => x.vorgangId)).size === understanding.length, "u-vorgang-doppelt");
  return { meta, eingaben: { version: INPUT_VERSION, runId: eingaben.runId,
    window: { startUTC: eingaben.window.startUTC, endUTC: eingaben.window.endUTC },
    model: eingaben.model, reviewMaxOutputTokens: eingaben.reviewMaxOutputTokens,
    lageInputs: lage, understandingInputs: understanding } };
}
function vorbereite(paket, eingaben) {
  const n = normalisiere(paket, eingaben), e = n.eingaben;
  const intents = [];
  for (const x of e.lageInputs) {
    const d = { phase: "D", owner: x.owner, inputVersionHash: x.inputVersionHash,
      model: e.model, maxOutputTokens: 3000, attemptLimit: 1 };
    const draftId = P.hash({ runId: e.runId, ...d });
    intents.push({ id: draftId, ...d, binding: "declared-local-input-version" });
    // Q.prompt verwendet den erst spaeter erzeugten Text. Ein Kontext- oder
    // Profilhash ist deshalb KEIN exakter Hash dieses Review-Eingangs.
    const r = { phase: "R", owner: x.owner, inputVersionHash: null,
      model: e.model, maxOutputTokens: e.reviewMaxOutputTokens, attemptLimit: 1,
      dependsOn: draftId, contextVersionHash: x.inputVersionHash };
    intents.push({ id: P.hash({ runId: e.runId, ...r }), ...r,
      binding: "pending-confirmed-draft-receipt-and-exact-review-input" });
  }
  for (const x of e.understandingInputs || []) {
    const u = { phase: "U", vorgangId: x.vorgangId, inputVersionHash: x.inputVersionHash,
      model: e.model, maxOutputTokens: 3000, attemptLimit: 1 };
    intents.push({ id: P.hash({ runId: e.runId, ...u }), ...u, binding: "declared-local-input-version" });
  }
  const reserve = tokens => Math.round(K.reservierungHoeheUsd(tokens) * 1e6);
  const partial = 500 * reserve(3000) + 500 * reserve(e.reviewMaxOutputTokens);
  const payload = { version: VERSION, mode: "inert-local-finite-request-inventory", runId: e.runId,
    packageBinding: { paketHash: n.meta.paketHash, idsHash: n.meta.idsHash, profileHash: n.meta.profileHash,
      expectedOutputs: 1500, distribution: { ...n.meta.verteilung } },
    inputs: e, intents,
    phaseInventory: { D: 500, R: 500, U: e.understandingInputs?.length ?? null,
      knownPositions: intents.length, unresolvedReviewInputVersions: 500,
      totalPositionsFinite: e.understandingInputs !== null },
    money: { basis: "existing-conservative-test-cost-reservation-not-provider-invoice",
      dailyLimitMicroUsd: K.LIMIT_MICRO_USD, cumulativeLimitMicroUsd: 7000000,
      DAndRConditionalGrossReserveMicroUsd: partial,
      enumeratedTextConditionalGrossReserveMicroUsd: e.understandingInputs === null ? null
        : partial + e.understandingInputs.length * reserve(3000),
      wholeRunMaximumCostMicroUsd: null, requestedBudgetMicroUsd: null },
    status: { proposalOnly: true, executionReady: false, runtimeEnforcement: false,
      paidGo: false, budgetGo: false, full500CompletionProven: false },
    remainingGuards: ["actual-deployed-runtime-and-provider-binding", "actual-input-version-proof",
      "review-input-bound-to-confirmed-draft-receipt", "atomic-intent-consume-and-money-reserve-in-existing-auth-cas",
      "every-central-text-caller-identifies-its-intent", "embedding-and-other-paid-paths-excluded-or-separately-bounded",
      "current-day-and-order-money-and-ticket-headroom", "independent-runtime-enforcement-proof",
      "separate-activation-and-paid-500-go", ...(e.understandingInputs === null ? ["finite-understanding-input-version-list"] : [])] };
  return { ...payload, planHash: P.hash(payload) };
}
function pruefe(vorbereitung, paket) {
  fordere(vorbereitung?.version === VERSION, "vorbereitung-format");
  const erwartet = vorbereite(paket, vorbereitung.inputs);
  fordere(kanonisch(vorbereitung) === kanonisch(erwartet), "vorbereitung-drift");
  return { version: VERSION, runId: erwartet.runId, planHash: erwartet.planHash,
    phaseInventory: erwartet.phaseInventory, money: erwartet.money, status: erwartet.status };
}
function serialisiere(vorbereitung, paket) {
  pruefe(vorbereitung, paket);
  return kanonisch(vorbereite(paket, vorbereitung.inputs)) + "\n";
}
module.exports = { VERSION, INPUT_VERSION, MAX_WINDOW_MS, MAX_U_INPUTS, vorbereite, pruefe, serialisiere };
