"use strict";

// Ausschliesslich lokale, unveraenderliche Evidenz um die bestehenden Intents.
// Kein Auth-/Runtime-Leser, Planslot-Installierer, Anbieter oder Aktivierungsweg.
const crypto = require("node:crypto");
const P = require("./synthetik-500-profile");
const A = require("./synthetik-500-kosten-admission");
const I = require("./synthetik-500-kosten-intents");
const V = require("./verstehen-vertrag");
const K = require("./testkosten-budget");
const KO = require("./knowledge-object-version");
const VERSION = "helmut-synthetik500-kosten-plan/1";
const INPUT_VERSION = "helmut-synthetik500-kosten-plan-eingaben/1";
// Expliziter Offline-Opt-in; /1 bleibt bytegleich der Standard.
const REVIEW_VERSION = "helmut-synthetik500-kosten-plan/2";
const REVIEW_INPUT_VERSION = "helmut-synthetik500-kosten-plan-eingaben/2";
// Neue /3-Kandidaten binden zentrale Plan3 innerhalb unveraenderter Slot2-Reviewguards.
const ARTICLE_VERSION = "helmut-synthetik500-kosten-plan/3";
const ARTICLE_INPUT_VERSION = "helmut-synthetik500-kosten-plan-eingaben/3";
const PROOF_VERSION = "helmut-synthetik500-lokaler-endlichkeitsbeleg/1";
const MAX_VERSIONS = A.MAX_INTENTS - 1000;
const sha = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const id = x => typeof x === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(x);
const object = x => x !== null && typeof x === "object" && !Array.isArray(x)
  && [Object.prototype, null].includes(Object.getPrototypeOf(x));
const exact = (x, keys) => object(x) && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const requireThat = (ok, code) => { if (!ok) throw new Error("synthetik500-kostenplan-" + code); };
const sorted = xs => [...xs].sort();
const same = (a, b) => P.hash(a) === P.hash(b);
const reserve = tokens => Math.round(K.reservierungHoeheUsd(tokens) * 1e6);
const byteHash = text => crypto.createHash("sha256").update(text, "utf8").digest("hex");
function jsonValue(x, depth = 0) {
  requireThat(depth <= 80, "json-tiefe");
  if (x === null || typeof x === "string" || typeof x === "boolean") return;
  if (typeof x === "number") { requireThat(Number.isFinite(x), "json-zahl"); return; }
  requireThat(Array.isArray(x) || object(x), "json-wert");
  requireThat(!Object.hasOwn(x, "toJSON"), "json-tojson");
  for (const value of Object.values(x)) jsonValue(value, depth + 1);
  if (Array.isArray(x)) requireThat(Object.keys(x).length === x.length, "json-array");
}
function reference(x) {
  requireThat(exact(x, ["reference", "sha256"]) && typeof x.reference === "string"
    && x.reference.trim() === x.reference && x.reference.length > 0 && x.reference.length <= 2000
    && sha(x.sha256), "primaerbeleg");
}
function keys(xs, code) {
  requireThat(Array.isArray(xs) && xs.length <= 10000 && xs.every(sha)
    && new Set(xs).size === xs.length, code);
  return sorted(xs);
}
function request(body, tokens, model = "gpt-5-mini") {
  if (body === null) return null;
  requireThat(typeof body === "string" && Buffer.byteLength(body, "utf8") <= 4 * 1024 * 1024, "request-body");
  let payload;
  try { payload = JSON.parse(body); } catch { throw new Error("synthetik500-kostenplan-request-json"); }
  // Entspricht dem zentralen JSON.stringify-Sender; doppelte JSON-Schluessel
  // und eine abweichende Bytefassung duerfen keine zweite Identitaet verbergen.
  const limits = object(payload) ? ["max_output_tokens", "max_completion_tokens", "max_tokens"]
    .filter(k => Object.hasOwn(payload, k)) : [];
  requireThat(object(payload) && JSON.stringify(payload) === body && payload.model === model
    && (tokens === null ? limits.length === 0 : limits.length === 1 && payload[limits[0]] === tokens), "request-binding");
  requireThat(typeof payload.input === "string" || Array.isArray(payload.input)
    || Array.isArray(payload.messages), "request-input");
  return { actualRequestHash: A.requestHash(body), frozenBodySha256: byteHash(body),
    frozenBodyBytes: Buffer.byteLength(body, "utf8") };
}
function intent(runId, descriptor) { return { id: A.intentHash(runId, descriptor), ...descriptor }; }

function sourceVersions(documents, knowledgeObjects, clusters, inputVersion = INPUT_VERSION) {
  requireThat([INPUT_VERSION, REVIEW_INPUT_VERSION, ARTICLE_INPUT_VERSION].includes(inputVersion), "quellen-version");
  const articleV3 = inputVersion === ARTICLE_INPUT_VERSION, documentVersions = new Map();
  const docs = documents === null ? null : documents.map(x => {
    requireThat(exact(x, ["id", "scope", "version"]) && id(x.id)
      && ["BT", "BE", "BB"].includes(x.scope) && object(x.version)
      && x.version.id === x.id, "dokumentversion");
    const versionHash = P.hash(x.version);
    const key = P.hash({ id: x.id, scope: x.scope, versionHash });
    documentVersions.set(key, x.version);
    return { key, id: x.id, scope: x.scope, versionHash };
  }).sort((a, b) => a.key.localeCompare(b.key));
  requireThat(docs === null || (docs.length <= 10000 && new Set(docs.map(x => x.key)).size === docs.length), "dokument-doppelt");
  const kos = knowledgeObjects === null ? null : knowledgeObjects.map(x => {
    requireThat(exact(x, ["vorgangId", "koVersion", "version"]) && id(x.vorgangId)
      && Number.isSafeInteger(x.koVersion) && x.koVersion > 0 && object(x.version)
      && x.version.vorgang_id === x.vorgangId && x.version.ko_version === x.koVersion, "ko-version");
    if (articleV3) KO.pruefe(x.version);
    const versionHash = P.hash(x.version);
    return { key: P.hash({ vorgangId: x.vorgangId, koVersion: x.koVersion, versionHash }),
      vorgangId: x.vorgangId, koVersion: x.koVersion, versionHash };
  }).sort((a, b) => a.key.localeCompare(b.key));
  requireThat(kos === null || (kos.length <= 10000 && new Set(kos.map(x => x.key)).size === kos.length), "ko-doppelt");
  const docMap = new Map((docs || []).map(x => [x.key, x]));
  const koMap = new Map((kos || []).map(x => [x.key, x]));
  const versions = clusters === null ? null : clusters.map(x => {
    requireThat(exact(x, ["vorgangId", "mode", "koVersion", "documentKeys", "requiresUnderstanding", "coverage",
      ...(articleV3 ? ["artikelkontextVersuch"] : [])])
      && id(x.vorgangId) && ["erst", "update"].includes(x.mode)
      && (x.mode === "erst" ? x.koVersion === null : Number.isSafeInteger(x.koVersion) && x.koVersion >= 2)
      && typeof x.requiresUnderstanding === "boolean", "cluster-version");
    const documentKeys = keys(x.documentKeys, "cluster-dokumente");
    requireThat(documentKeys.length > 0 && docs !== null && documentKeys.every(k => docMap.has(k)), "cluster-dokument-fehlt");
    requireThat(new Set(documentKeys.map(k => docMap.get(k).id)).size === documentKeys.length, "cluster-dokument-zwei-versionen");
    const hashBasis = { vorgangId: x.vorgangId, modus: x.mode, koVersion: x.koVersion,
      dokumente: documentKeys.map(k => ({ id: docMap.get(k).id })) };
    let contractInputHash = V.eingabeHash(hashBasis), artikelkontextBinding = null;
    if (articleV3 && x.artikelkontextVersuch !== null) {
      requireThat(object(x.artikelkontextVersuch), "artikelkontext-beleg");
      const cluster = { documents: documentKeys.map(k => documentVersions.get(k)) };
      // Derselbe vollstaendige Runtimeprompt und dieselbe Beleg-/Quellenauswahl.
      // raw-Felder und frei behauptete Prompt-/40er-Hashes aktivieren nichts.
      const beleg = require("./artikelkontext").pruefeArtikelkontext(cluster.documents, x.artikelkontextVersuch);
      const prompt = require("./understanding").buildUnderstandingPrompt(cluster, { artikelkontextVersuch: beleg });
      contractInputHash = require("./verstehen-artikelkontext-hash").eingabeHash(hashBasis, prompt);
      artikelkontextBinding = { version: "artikelkontext-v1", belegHash: P.hash(beleg), fullPromptSha256: byteHash(prompt) };
    }
    if (x.requiresUnderstanding) requireThat(x.coverage === null, "u-coverage-widerspruch");
    else {
      const c = x.coverage, ko = koMap.get(c?.knowledgeObjectKey);
      requireThat(exact(c, ["knowledgeObjectKey", "documentKeys", "contractInputHash", "evidence"])
        && ko && ko.vorgangId === x.vorgangId && ko.koVersion === (x.mode === "erst" ? 1 : x.koVersion)
        && c.contractInputHash === contractInputHash
        && same(keys(c.documentKeys, "coverage-dokumente"), documentKeys), "u-ausschluss-positivbeleg");
      reference(c.evidence);
    }
    const descriptor = { vorgangId: x.vorgangId, mode: x.mode, koVersion: x.koVersion, documentKeys, contractInputHash,
      ...(articleV3 ? { artikelkontextBinding } : {}) };
    return { key: P.hash(descriptor), ...descriptor, requiresUnderstanding: x.requiresUnderstanding, coverage: x.coverage };
  }).sort((a, b) => a.key.localeCompare(b.key));
  requireThat(versions === null || (versions.length <= MAX_VERSIONS
    && new Set(versions.map(x => x.key)).size === versions.length), "cluster-doppelt");
  if (docs !== null && versions !== null)
    requireThat(same(sorted(new Set(versions.flatMap(x => x.documentKeys))), docs.map(x => x.key)), "dokument-ungedeckt");
  return { documents: docs, knowledgeObjects: kos, clusters: versions };
}

function completeness(source, proof) {
  if (proof === null) return false;
  requireThat(source.documents !== null && source.knowledgeObjects !== null && source.clusters !== null
    && exact(proof, ["version", "documentInventoryHash", "knowledgeObjectInventoryHash", "clusterInventoryHash", "requiredVersionKeys", "evidence"])
    && proof.version === PROOF_VERSION && proof.documentInventoryHash === P.hash(source.documents)
    && proof.knowledgeObjectInventoryHash === P.hash(source.knowledgeObjects)
    && proof.clusterInventoryHash === P.hash(source.clusters)
    && same(keys(proof.requiredVersionKeys, "endlichkeits-versionen"),
      source.clusters.filter(x => x.requiresUnderstanding).map(x => x.key)), "endlichkeitsbeleg-binding");
  reference(proof.evidence);
  return true; // Gebundener LOKALER Beleg, keine unabhaengige Production-Abnahme.
}

function vorbereite(paket, eingaben) {
  jsonValue(eingaben);
  const articleV3 = eingaben?.version === ARTICLE_INPUT_VERSION;
  const reviewV2 = eingaben?.version === REVIEW_INPUT_VERSION || articleV3;
  requireThat(exact(eingaben, ["version", "operationId", "runId", "window", "productionCommit", "runtimeManifestHash",
    "documents", "knowledgeObjects", "clusters", "understandingInputs", "understandingCompleteness",
    "draftInputs", "reviewMaxOutputTokens", "paidRoutes", "otherPaidInputs"])
    && (eingaben.version === INPUT_VERSION || reviewV2) && typeof eingaben.operationId === "string"
    && /^synthetik500-[a-z0-9-]{8,80}$/.test(eingaben.operationId), "eingaben-format");
  const meta = P.pruefePaket(paket), profile = new Map(paket.profile.map(p => [p.mandatsId, p]));
  // Wiederverwendung des existierenden Zeit-/Qualitaets-/Kohortenvertrags.
  I.vorbereite(paket, { version: I.INPUT_VERSION, runId: eingaben.runId, window: eingaben.window,
    model: "gpt-5-mini", reviewMaxOutputTokens: eingaben.reviewMaxOutputTokens,
    lageInputs: paket.profile.map(p => ({ owner: p.mandatsId, inputVersionHash: P.hash(p) })), understandingInputs: null });
  requireThat(eingaben.productionCommit === null || (typeof eingaben.productionCommit === "string"
    && /^[a-f0-9]{40}$/.test(eingaben.productionCommit)), "production-commit");
  requireThat(eingaben.runtimeManifestHash === null || sha(eingaben.runtimeManifestHash), "runtime-manifest");
  for (const field of ["documents", "knowledgeObjects", "clusters", "understandingInputs", "draftInputs", "paidRoutes", "otherPaidInputs"])
    requireThat(eingaben[field] === null || Array.isArray(eingaben[field]), "endliche-liste");
  const source = sourceVersions(eingaben.documents, eingaben.knowledgeObjects, eingaben.clusters, eingaben.version);
  const finiteProofBound = completeness(source, eingaben.understandingCompleteness);
  const missing = new Set();
  for (const [field, code] of [["documents", "accepted-bt-be-bb-document-versions"], ["knowledgeObjects", "existing-ko-versions"],
    ["clusters", "complete-cluster-input-version-list"], ["understandingInputs", "actual-understanding-request-list"],
    ["draftInputs", "final-profile-context-and-actual-draft-payloads"], ["paidRoutes", "complete-paid-route-inventory"],
    ["otherPaidInputs", "finite-other-paid-input-list"], ["productionCommit", "actual-production-commit"],
    ["runtimeManifestHash", "actual-runtime-manifest-hash"]]) if (eingaben[field] === null) missing.add(code);
  if (!finiteProofBound) missing.add("bound-positive-finite-input-completeness-proof");
  if (source.documents !== null) for (const scope of ["BT", "BE", "BB"])
    if (!source.documents.some(x => x.scope === scope)) missing.add("accepted-" + scope.toLowerCase() + "-source-document-versions");
  const byVersion = new Map((source.clusters || []).map(x => [x.key, x]));
  const u = (eingaben.understandingInputs || []).map(x => {
    requireThat(exact(x, ["versionKey", "contractInputHash", "requestBody", "routeId", "attemptLimit"])
      && sha(x.versionKey) && x.attemptLimit === 1 && (x.routeId === null || id(x.routeId)), "u-input");
    const v = byVersion.get(x.versionKey);
    requireThat(v?.requiresUnderstanding && x.contractInputHash === v.contractInputHash, "u-version-binding");
    const r = request(x.requestBody, 3000);
    if (r && v.artikelkontextBinding) {
      const payload = JSON.parse(x.requestBody);
      requireThat(typeof payload.input === "string"
        && byteHash(payload.input) === v.artikelkontextBinding.fullPromptSha256, "artikelkontext-request-prompt");
    }
    if (!r) missing.add("actual-understanding-provider-payload");
    if (x.routeId === null) missing.add("actual-understanding-provider-route");
    const admitted = r ? intent(eingaben.runId, { phase: "U", vorgangId: v.vorgangId,
      contractInputHash: v.contractInputHash, actualRequestHash: r.actualRequestHash,
      model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 }) : null;
    return { phase: "U", versionKey: v.key, vorgangId: v.vorgangId, mode: v.mode, koVersion: v.koVersion,
      documentKeys: v.documentKeys, contractInputHash: v.contractInputHash, routeId: x.routeId,
      inputVersionHash: v.key, requestId: admitted?.id || null, request: r, admissionIntent: admitted,
      model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 };
  }).sort((a, b) => a.versionKey.localeCompare(b.versionKey));
  requireThat(new Set(u.map(x => x.versionKey)).size === u.length, "u-version-doppelt");
  if (eingaben.understandingInputs !== null) {
    requireThat(source.clusters !== null && same(u.map(x => x.versionKey),
      source.clusters.filter(x => x.requiresUnderstanding).map(x => x.key)), "u-version-ungedeckt");
    requireThat(u.length > 0 || finiteProofBound, "u-leer-ohne-positivbeleg");
  }
  const multiU = new Set(u.map(x => x.vorgangId)).size !== u.length;
  if (multiU && !articleV3) missing.add("central-admission-multiple-u-versions-per-vorgang");
  if (articleV3) requireThat(new Set(u.map(x => JSON.stringify([x.vorgangId, x.contractInputHash]))).size === u.length, "u-cas-paar-doppelt");
  requireThat(eingaben.draftInputs === null || eingaben.draftInputs.length === 500, "draft-500");
  const draftMap = new Map((eingaben.draftInputs || []).map(x => {
    requireThat(exact(x, ["owner", "profileHash", "context", "documentKeys", "knowledgeObjectKeys", "requestBody", "routeId", "attemptLimit"])
      && profile.has(x.owner) && x.profileHash === P.hash(profile.get(x.owner)) && x.attemptLimit === 1
      && object(x.context) && Object.keys(x.context).length > 0 && (x.routeId === null || id(x.routeId)), "draft-input");
    const documentKeys = keys(x.documentKeys, "draft-dokumente"), koKeys = keys(x.knowledgeObjectKeys, "draft-kos");
    requireThat(source.documents !== null && source.knowledgeObjects !== null
      && documentKeys.every(k => source.documents.some(d => d.key === k))
      && koKeys.every(k => source.knowledgeObjects.some(ko => ko.key === k)), "draft-source-binding");
    const inputVersionHash = P.hash({ owner: x.owner, profileHash: x.profileHash, context: x.context,
      documentKeys, knowledgeObjectKeys: koKeys });
    const r = request(x.requestBody, 3000);
    if (!r) missing.add("actual-draft-provider-payload");
    if (x.routeId === null) missing.add("actual-draft-provider-route");
    return [x.owner, { inputVersionHash, routeId: x.routeId, request: r }];
  }));
  requireThat(eingaben.draftInputs === null || draftMap.size === 500, "draft-owner-doppelt");
  const d = [...profile.keys()].sort().map(owner => {
    const x = draftMap.get(owner), admitted = x?.request ? intent(eingaben.runId, { phase: "D", owner,
      inputVersionHash: x.inputVersionHash, actualRequestHash: x.request.actualRequestHash,
      model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 }) : null;
    return { phase: "D", owner, profileHash: P.hash(profile.get(owner)), inputVersionHash: x?.inputVersionHash || null,
      routeId: x?.routeId || null, requestId: admitted?.id || null, request: x?.request || null,
      admissionIntent: admitted, model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 };
  });
  let reviewRule = null;
  if (reviewV2) {
    const R = require("./synthetik-500-review-receipt");
    reviewRule = { version: R.RULE_VERSION,
      reasoningEffort: eingaben.reviewMaxOutputTokens === 3000 ? "low" : "medium" };
    requireThat(R.validRule(reviewRule, eingaben.reviewMaxOutputTokens), "review-rule");
  }
  const r = d.map(x => {
    const admitted = x.admissionIntent ? intent(eingaben.runId, { phase: "R", owner: x.owner,
      inputVersionHash: null, actualRequestHash: null, dependsOn: x.requestId,
      contextVersionHash: x.inputVersionHash, model: "gpt-5-mini",
      maxOutputTokens: eingaben.reviewMaxOutputTokens, attemptLimit: 1,
      ...(reviewV2 ? { reviewRule: { ...reviewRule } } : {}) }) : null;
    return { phase: "R", owner: x.owner, dependsOn: x.requestId, contextVersionHash: x.inputVersionHash,
      requestId: admitted?.id || null, actualRequestHash: null, actualInputVersionHash: null,
      binding: "pending-confirmed-D-output-receipt-and-exact-R-provider-payload",
      admissionIntent: admitted, model: "gpt-5-mini", maxOutputTokens: eingaben.reviewMaxOutputTokens, attemptLimit: 1,
      ...(reviewV2 ? { reviewRule: { ...reviewRule } } : {}) };
  });
  const other = (eingaben.otherPaidInputs || []).map(x => {
    requireThat(exact(x, ["id", "routeId", "inputVersion", "requestBody", "model", "maxOutputTokens", "attemptLimit"])
      && id(x.id) && id(x.routeId) && object(x.inputVersion) && typeof x.model === "string"
      && x.attemptLimit === 1 && (x.maxOutputTokens === null || Number.isSafeInteger(x.maxOutputTokens)
        && x.maxOutputTokens > 0 && x.maxOutputTokens <= 8000), "other-input");
    const text = x.model === "gpt-5-mini" && x.maxOutputTokens !== null;
    const binding = request(x.requestBody, x.maxOutputTokens, x.model);
    requireThat(x.requestBody === null || typeof x.requestBody === "string", "other-request");
    if (!text || !binding) missing.add("other-paid-input-tariff-and-reserve-contract");
    const descriptor = { ...x, inputVersionHash: P.hash(x.inputVersion), actualRequestHash: binding?.actualRequestHash || null };
    return { id: x.id, phase: "other", routeId: x.routeId, inputVersionHash: descriptor.inputVersionHash,
      requestId: P.hash(descriptor), request: binding, model: x.model, maxOutputTokens: x.maxOutputTokens,
      reserveMicroUsd: text ? reserve(x.maxOutputTokens) : null, attemptLimit: 1 };
  }).sort((a, b) => a.id.localeCompare(b.id));
  requireThat(other.length <= MAX_VERSIONS && new Set(other.map(x => x.id)).size === other.length, "other-doppelt");
  const actualBindings = [...u, ...d, ...other].filter(x => x.requestId && x.request);
  requireThat(new Set(actualBindings.map(x => x.requestId)).size === actualBindings.length, "request-doppelt");
  const routes = (eingaben.paidRoutes || []).map(x => {
    requireThat(exact(x, ["id", "provider", "api", "deploymentId", "model", "disposition", "admittedRequestIds", "priceContract", "exclusionEvidence"])
      && id(x.id) && ["aufgenommen", "ausgeschlossen", "unbekannt"].includes(x.disposition)
      && [x.provider, x.api, x.deploymentId, x.model].every(v => v === null || typeof v === "string" && v.length > 0 && v.length <= 200), "route");
    const admittedRequestIds = keys(x.admittedRequestIds, "route-requests");
    requireThat(x.priceContract === null || x.priceContract === "existing-conservative-text", "route-preisvertrag");
    if (x.disposition === "ausgeschlossen") {
      requireThat(admittedRequestIds.length === 0, "route-ausschluss-request"); reference(x.exclusionEvidence);
    } else requireThat(x.exclusionEvidence === null, "route-ausschluss-widerspruch");
    if (x.disposition === "unbekannt") missing.add("other-paid-route-disposition");
    if (x.disposition === "aufgenommen") {
      requireThat(admittedRequestIds.length > 0 && same(admittedRequestIds,
        sorted(actualBindings.filter(b => b.routeId === x.id).map(b => b.requestId))), "route-request-binding");
      requireThat(x.model === null || actualBindings.filter(b => b.routeId === x.id).every(b => b.model === x.model), "route-modell-binding");
      if ([x.provider, x.api, x.deploymentId, x.model, x.priceContract].some(v => v === null)) missing.add("actual-provider-route-and-price-contract");
      if (x.priceContract === "existing-conservative-text") requireThat(x.model === "gpt-5-mini", "route-preis-modell");
    }
    return { ...x, admittedRequestIds, enforcementProof: null };
  }).sort((a, b) => a.id.localeCompare(b.id));
  requireThat(routes.length <= 10000 && new Set(routes.map(x => x.id)).size === routes.length, "route-doppelt");
  if (eingaben.paidRoutes !== null) requireThat(actualBindings.every(b => b.routeId === null
    || routes.some(x => x.id === b.routeId && x.disposition === "aufgenommen")), "request-route-ungedeckt");
  if (routes.some(x => x.disposition === "aufgenommen") && other.length) missing.add("central-other-paid-path-admission");
  let admissionCandidate = null;
  if ((!multiU || articleV3) && (!articleV3 || finiteProofBound)
    && d.every(x => x.admissionIntent) && u.every(x => x.admissionIntent)
    && eingaben.understandingInputs !== null && eingaben.productionCommit !== null && eingaben.runtimeManifestHash !== null) {
    const plan = { version: articleV3 ? A.MULTI_U_PLAN_VERSION : reviewV2 ? A.REVIEW_PLAN_VERSION : A.PLAN_VERSION, operationId: eingaben.operationId, runId: eingaben.runId,
      productionCommit: eingaben.productionCommit, runtimeManifestHash: eingaben.runtimeManifestHash,
      startsAtUTC: eingaben.window.startUTC, endsAtUTC: eingaben.window.endUTC,
      intents: [...u, ...d, ...r].map(x => x.admissionIntent),
      ...(articleV3 ? { sourceBinding: { inputVersion: ARTICLE_INPUT_VERSION, inputHash: P.hash(eingaben),
        projectionVersion: KO.VERSION, projectionFieldsetHash: KO.FIELDSET_HASH } } : {}) };
    admissionCandidate = { version: reviewV2 ? A.REVIEW_VERSION : A.VERSION, plan, planHash: P.hash(plan), consumed: {},
      ...(reviewV2 ? { draftCompletions: {}, reviewBindings: {}, reviewBindingsHash: P.hash({}) } : {}) };
    A.pruefeSlot(admissionCandidate); // Zentraler Vertrag bleibt die Wahrheitsquelle.
  }
  const U = eingaben.understandingInputs === null ? null : u.length;
  const O = eingaben.otherPaidInputs === null ? null : other.length;
  const inventoryComplete = missing.size === 0;
  const phaseGrossReserveMicroUsd = { U: U === null ? null : U * reserve(3000), D: 500 * reserve(3000),
    R: 500 * reserve(eingaben.reviewMaxOutputTokens), other: O === null || other.some(x => x.reserveMicroUsd === null)
      ? null : other.reduce((sum, x) => sum + x.reserveMicroUsd, 0) };
  const gross = Object.values(phaseGrossReserveMicroUsd).every(Number.isSafeInteger)
    ? Object.values(phaseGrossReserveMicroUsd).reduce((sum, x) => sum + x, 0) : null;
  const payload = { version: articleV3 ? ARTICLE_VERSION : reviewV2 ? REVIEW_VERSION : VERSION, mode: "inert-local-full-version-cost-plan", runId: eingaben.runId,
    packageBinding: { paketHash: meta.paketHash, profileHash: meta.profileHash, idsHash: meta.idsHash,
      expectedOutputs: 1500, distribution: meta.verteilung }, inputs: JSON.parse(JSON.stringify(eingaben)), sourceVersions: source,
    phasePositions: { U: eingaben.understandingInputs === null ? null : u, D: d, R: r,
      other: eingaben.otherPaidInputs === null ? null : other }, routeInventory: eingaben.paidRoutes === null ? null : routes,
    routeInventoryHash: eingaben.paidRoutes === null ? null : P.hash(routes), admissionCandidate,
    completeness: { localFiniteProofBound: finiteProofBound, localPreDraftInputAndPriceInventoryComplete: inventoryComplete,
      actualInputAcceptanceVerified: false, runtimeRouteEnforcementProven: false, U, D: 500, R: 500, other: O,
      multiVersionUAdmissionSupported: !multiU || articleV3, pendingActualReviewPayloads: 500 },
    money: { basis: "existing-conservative-reserve-not-provider-invoice", dailyLimitMicroUsd: K.LIMIT_MICRO_USD,
      cumulativeLimitMicroUsd: 7000000, phaseGrossReserveMicroUsd, enumeratedGrossReserveMicroUsd: gross,
      conditionalInventoryReserveUpperBoundMicroUsd: inventoryComplete ? gross : null,
      wholeRunMaximumCostMicroUsd: null, // Offene Runtimepfade/Quittungen sind kein Vollbudget.
      sequentialKnownPeakReserveMicroUsd: Math.max(reserve(3000), reserve(eingaben.reviewMaxOutputTokens),
        ...other.map(x => x.reserveMicroUsd || 0)), sequentialPeakAssumesNoOutstandingUnknownCalls: true,
      actualDayAndOrderHeadroomMicroUsd: null, requestedBudgetMicroUsd: null },
    requiredActualInputs: sorted(missing), remainingRuntimeGuards: ["independent-actual-input-and-route-acceptance",
      "actual-R-output-receipt-and-payload-admission", "central-route-enforcement-and-other-paid-path-closure",
      "atomic-planslot-installation-and-removal", "fresh-actual-day-order-cost-and-outstanding-ticket-headroom",
      "separate-activation-and-paid-500-GO"],
    status: { proposalOnly: true, executionReady: false, activationAvailable: false, runtimeEnforcement: false,
      paidGo: false, budgetGo: false, full500CompletionProven: false } };
  return { ...payload, planHash: P.hash(payload) };
}
function pruefe(plan, paket) {
  requireThat([VERSION, REVIEW_VERSION, ARTICLE_VERSION].includes(plan?.version), "plan-format");
  const expected = vorbereite(paket, plan.inputs);
  requireThat(same(plan, expected), "plan-drift");
  return { version: expected.version, runId: expected.runId, planHash: expected.planHash,
    completeness: expected.completeness, money: expected.money, requiredActualInputs: expected.requiredActualInputs,
    remainingRuntimeGuards: expected.remainingRuntimeGuards, status: expected.status };
}
function serialisiere(plan, paket) { pruefe(plan, paket); return JSON.stringify(plan, null, 2) + "\n"; }
module.exports = { VERSION, INPUT_VERSION, REVIEW_VERSION, REVIEW_INPUT_VERSION, ARTICLE_VERSION, ARTICLE_INPUT_VERSION,
  PROOF_VERSION, MAX_VERSIONS, sourceVersions, vorbereite, pruefe, serialisiere };
