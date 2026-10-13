"use strict";

// Closed, server-selected data contract. These validators do not issue actual
// admissions: Root must supply genuine private receipts after native/W review.
const fs = require("node:fs");
const crypto = require("node:crypto");
const P = require("./synthetik-500-profile");
const EU = require("./synthetik-500-eu-service-contract");
const Dates = require("./synthetik-500-date-binding");
const A = require("./synthetik-500-kosten-admission");
const KO = require("./knowledge-object-version");
const N = require("./synthetik-500-u-no-sender");
const cacheApply = Reflect.apply, cacheFreeze = Object.freeze;
const WeakMapCache = WeakMap, WeakSetCache = WeakSet, MapCache = Map, SetCache = Set;
const WC = { get: WeakMap.prototype.get, has: WeakMap.prototype.has, set: WeakMap.prototype.set,
  weakHas: WeakSet.prototype.has, weakAdd: WeakSet.prototype.add, weakDelete: WeakSet.prototype.delete,
  mapGet: Map.prototype.get, mapHas: Map.prototype.has, mapSet: Map.prototype.set,
  setHas: Set.prototype.has, setAdd: Set.prototype.add };
function privateWeakMap() {
  const data = new WeakMapCache(); return cacheFreeze({ get: key => cacheApply(WC.get, data, [key]),
    has: key => cacheApply(WC.has, data, [key]), set: (key, value) => { cacheApply(WC.set, data, [key, value]); } });
}
function privateWeakSet() {
  const data = new WeakSetCache(); return cacheFreeze({ has: key => cacheApply(WC.weakHas, data, [key]),
    add: key => { cacheApply(WC.weakAdd, data, [key]); }, delete: key => cacheApply(WC.weakDelete, data, [key]) });
}
function privateSet() {
  const data = new SetCache(); return cacheFreeze({ has: key => cacheApply(WC.setHas, data, [key]),
    add: key => { cacheApply(WC.setAdd, data, [key]); } });
}
function privateMap(entries = []) {
  const data = new MapCache();
  for (let i = 0; i < entries.length; i++) cacheApply(WC.mapSet, data, [entries[i][0], entries[i][1]]);
  return cacheFreeze({ get: key => cacheApply(WC.mapGet, data, [key]), has: key => cacheApply(WC.mapHas, data, [key]),
    set: (key, value) => { cacheApply(WC.mapSet, data, [key, value]); } });
}
const MEMO_METADATA = { frozen: Object.isFrozen, prototype: Object.getPrototypeOf,
  descriptors: Object.getOwnPropertyDescriptors, keys: Object.keys, names: Object.getOwnPropertyNames,
  symbols: Object.getOwnPropertySymbols, own: Object.hasOwn, array: Array.isArray,
  finite: Number.isFinite, integer: Number.isInteger, safeInteger: Number.isSafeInteger,
  objectPrototype: Object.prototype, arrayPrototype: Array.prototype };
const memoDescriptor = Object.getOwnPropertyDescriptor;
const memoSlot = (object, key) => MEMO_METADATA.own(object, key) ? object[key] : undefined;
const MEMO_DEPENDENCIES = [[Object, "keys"], [Object, "getOwnPropertyDescriptors"], [JSON, "stringify"],
  [Array.prototype, "find"], [Array.prototype, "map"], [Array.prototype, "sort"], [Array.prototype, "flatMap"],
  [Array.prototype, "constructor"], [Array, Symbol.species], [Array.prototype, Symbol.iterator]]
  .map(([object, key]) => ({ object, key, descriptor: memoDescriptor(object, key) }));
function callbackFreeCommand(value) {
  if (MEMO_METADATA.prototype(MEMO_METADATA.arrayPrototype) !== MEMO_METADATA.objectPrototype
    || MEMO_METADATA.prototype(MEMO_METADATA.objectPrototype) !== null
    || memoDescriptor(MEMO_METADATA.arrayPrototype, "toJSON") || memoDescriptor(MEMO_METADATA.objectPrototype, "toJSON")) return false;
  const prototypes = [MEMO_METADATA.arrayPrototype, MEMO_METADATA.objectPrototype];
  for (let p = 0; p < prototypes.length; p++) {
    const names = MEMO_METADATA.names(prototypes[p]);
    for (let i = 0; i < names.length; i++) {
      const key = names[i], number = +key;
      if (number >= 0 && number < 4294967295 && number % 1 === 0 && "" + number === key) return false;
    }
  }
  for (let i = 0; i < MEMO_DEPENDENCIES.length; i++) {
    const { object, key, descriptor } = MEMO_DEPENDENCIES[i], current = memoDescriptor(object, key);
    if (!current || memoSlot(current, "value") !== memoSlot(descriptor, "value") || memoSlot(current, "get") !== memoSlot(descriptor, "get") || memoSlot(current, "set") !== memoSlot(descriptor, "set")
      || memoSlot(current, "enumerable") !== memoSlot(descriptor, "enumerable") || memoSlot(current, "configurable") !== memoSlot(descriptor, "configurable")
      || memoSlot(current, "writable") !== memoSlot(descriptor, "writable")) return false;
  }
  const complete = privateWeakSet(), visiting = privateWeakSet(), { isProxy } = require("node:util").types;
  const visit = value => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return MEMO_METADATA.finite(value)
      && (!MEMO_METADATA.integer(value) || MEMO_METADATA.safeInteger(value));
    if (!value || typeof value !== "object" || isProxy(value)) return false;
    if (complete.has(value)) return true;
    const array = MEMO_METADATA.array(value), prototype = MEMO_METADATA.prototype(value);
    if ((array ? prototype !== MEMO_METADATA.arrayPrototype : prototype !== MEMO_METADATA.objectPrototype && prototype !== null)
      || MEMO_METADATA.own(value, "toJSON") || MEMO_METADATA.symbols(value).length || visiting.has(value)) return false;
    const keys = MEMO_METADATA.keys(value), own = MEMO_METADATA.descriptors(value);
    if (MEMO_METADATA.names(value).length !== keys.length + (array ? 1 : 0) || array && keys.length !== value.length) return false;
    visiting.add(value);
    for (let i = 0; i < keys.length; i++) {
      if (array && keys[i] !== "" + i || !MEMO_METADATA.own(own[keys[i]], "value") || !visit(own[keys[i]].value)) {
        visiting.delete(value); return false;
      }
    }
    visiting.delete(value); complete.add(value); return true;
  };
  return visit(value);
}
const VERSION = "helmut-synthetik500-production-command/1";
const DIRECT_VERSION = "helmut-synthetik500-production-command/2-direct";
const ADMISSION_VERSION = "helmut-synthetik500-production-root-admission/1";
const ACTUAL_GATE_VERSION = "helmut-synthetik500-production-actual-gate/1";
const GATES = Object.freeze(["nativeSource17", "finiteW", "nativeCodec", "currentFinancing",
  "quiescence", "nativeD", "endGuard", "windowAuthority", "outputContract"]);
const DIRECT_GATES = Object.freeze([...GATES.filter(x => x !== "nativeD"), "draftEvidence", "testGo"]);
const isDirect = command => command?.version === DIRECT_VERSION && command.mode === "D-R-500";
const sha = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const exact = (x, ks) => x && typeof x === "object" && !Array.isArray(x)
  && Object.keys(x).sort().join("|") === [...ks].sort().join("|");
const fail = code => { throw Error("synthetik500-production-" + code); };
const requireThat = (ok, code) => { if (!ok) fail(code); };
const same = (x, y) => P.hash(x) === P.hash(y);
const utc = x => typeof x === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)
  && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
const NATIVE_ABI = Object.freeze({ version: "helmut-synthetik500-native-D-abi/1",
  contract: { name: "helmut_immutable_d_contract_v1", args: ["p_expected_contract_hash"] },
  store: { name: "helmut_store_immutable_d_v1", args: ["p_owner", "p_id", "p_version_hash", "p_entry_canonical",
    "p_completion_preimage", "p_output_canonical", "p_sources_canonical", "p_usage_canonical", "p_expected_contract_hash"] },
  read: { name: "helmut_read_immutable_d_v1", args: ["p_owner", "p_id", "p_version_hash", "p_expected_contract_hash"] } });
const ABI_HASH = P.hash(NATIVE_ABI);
function validate(command) {
  return require("./streaming-canonical-hash").withImmutableInvocation(() => validateCommand(command));
}
function validateCommand(command) {
  KO.jsonValue(command);
  const reusableCommand = callbackFreeCommand(command)
    && require("./streaming-canonical-hash").primeImmutableInvocation(command);
  // Only immutable plain JSON can reuse work, and only within this invocation.
  // In particular no admission, clock or publication-policy decision is cached.
  const immutable = privateWeakMap(), hashes = privateWeakMap(), sourcesChecked = privateWeakSet();
  const projectionChecks = privateWeakMap(), readSources = privateWeakMap();
  const sourceMaps = privateWeakMap(), versionIndexes = privateWeakMap(), sourceKeys = privateWeakMap();
  const sourceFields = require("./synthetik-500-w-inventar").SOURCE_VERSION_FIELDS
    .filter(k => !["content_hash", "retrieved_at", "created_at", "quellenauszug_beleg"].includes(k));
  const koFields = KO.VERSION_FIELDS.filter(k => k !== "verstehen_fencing");
  const projectionSignatures = privateMap([[sourceFields, JSON.stringify([true, sourceFields])],
    [koFields, JSON.stringify([false, koFields])]]);
  const { isProxy } = require("node:util").types;
  const frozen = value => {
    if (!reusableCommand) return false;
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return MEMO_METADATA.finite(value)
      && (!MEMO_METADATA.integer(value) || MEMO_METADATA.safeInteger(value));
    if (value && typeof value === "object" && immutable.has(value)) return immutable.get(value);
    if (!value || typeof value !== "object" || isProxy(value) || !MEMO_METADATA.frozen(value)) return false;
    const array = MEMO_METADATA.array(value), prototype = MEMO_METADATA.prototype(value);
    if (array ? prototype !== MEMO_METADATA.arrayPrototype
      : prototype !== MEMO_METADATA.objectPrototype && prototype !== null) return false;
    immutable.set(value, false);
    const descriptors = MEMO_METADATA.descriptors(value), keys = MEMO_METADATA.keys(value);
    let result = !MEMO_METADATA.own(value, "toJSON") && MEMO_METADATA.symbols(value).length === 0
      && MEMO_METADATA.names(value).length === keys.length + (array ? 1 : 0)
      && (!array || keys.length === value.length);
    for (let i = 0; i < keys.length && result; i++) {
      const key = keys[i];
      result = (!array || key === "" + i) && MEMO_METADATA.own(descriptors[key], "value") && frozen(descriptors[key].value);
    }
    immutable.set(value, result); return result;
  };
  const hash = value => {
    if (!frozen(value) || value === null || typeof value !== "object") return P.hash(value);
    if (!hashes.has(value)) hashes.set(value, P.hash(value));
    return hashes.get(value);
  };
  const checkSources = sources => {
    if (sourcesChecked.has(sources)) return;
    validateSources(sources);
    if (frozen(sources)) sourcesChecked.add(sources);
  };
  const projection = (current, original, keys, repair) => {
    const reusable = frozen(current) && frozen(original) && current && original;
    const signature = projectionSignatures.get(keys);
    let originals, checks;
    if (reusable) {
      originals = projectionChecks.get(current);
      checks = originals?.get(original);
      if (checks?.has(signature)) return true;
    }
    let projected = current;
    if (repair) {
      if (frozen(current) && readSources.has(current)) projected = readSources.get(current);
      else {
        projected = require("./quellen-auszug").geleseneQuelle(current);
        if (current && frozen(current)) readSources.set(current, projected);
      }
    }
    const result = projected && exact(original, keys)
      && hash(Object.fromEntries(keys.map(k => [k, projected[k]]))) === hash(original);
    if (result && reusable) {
      if (!originals) { originals = privateWeakMap(); projectionChecks.set(current, originals); }
      if (!checks) { checks = privateSet(); originals.set(original, checks); }
      checks.add(signature);
    }
    return result;
  };
  const indexRows = (rows, idField) => {
    // Mutable version rows are indexed afresh for each draft. Only own plain
    // scalar data is read, and first-match semantics include duplicate scopes.
    if (!Array.isArray(rows) || isProxy(rows) || Object.getPrototypeOf(rows) !== Array.prototype
      || Object.getOwnPropertySymbols(rows).length) return null;
    const descriptors = Object.getOwnPropertyDescriptors(rows), keys = Object.keys(rows);
    if (Object.getOwnPropertyNames(rows).length !== keys.length + 1 || keys.length !== rows.length) return null;
    const index = privateMap();
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] !== String(i) || !Object.hasOwn(descriptors[keys[i]], "value")) return null;
      const row = descriptors[keys[i]].value;
      if (!row || typeof row !== "object" || isProxy(row) || ![Object.prototype, null].includes(Object.getPrototypeOf(row))
        || Object.hasOwn(row, "toJSON") || Object.getOwnPropertySymbols(row).length) return null;
      const own = Object.getOwnPropertyDescriptors(row), fields = Object.keys(row);
      if (Object.getOwnPropertyNames(row).length !== fields.length) return null;
      for (const field of fields) {
        if (!Object.hasOwn(own[field], "value")) return null;
        const v = own[field].value;
        if (v !== null && !["string", "boolean", "number"].includes(typeof v)) return null;
      }
      if (![idField, "versionHash", "key"].every(k => Object.hasOwn(own, k) && typeof own[k].value === "string")) return null;
      const id = own[idField].value, version = own.versionHash.value;
      if (!index.has(id)) index.set(id, privateMap());
      if (!index.get(id).has(version)) index.get(id).set(version, row);
    }
    return index;
  };
  const resolveKeys = (sources, versions) => {
    const safeSources = frozen(sources), reusable = safeSources && frozen(versions);
    let byVersions = sourceKeys.get(sources);
    if (reusable && byVersions?.has(versions)) return byVersions.get(versions);
    let indexes = reusable ? versionIndexes.get(versions) : null;
    if (!indexes && safeSources && versions && typeof versions === "object" && !isProxy(versions)
      && [Object.prototype, null].includes(Object.getPrototypeOf(versions))
      && !Object.hasOwn(versions, "toJSON") && Object.getOwnPropertySymbols(versions).length === 0) {
      const descriptors = Object.getOwnPropertyDescriptors(versions), keys = Object.keys(versions);
      if (Object.getOwnPropertyNames(versions).length === keys.length
        && keys.every(k => Object.hasOwn(descriptors[k], "value") && typeof descriptors[k].value !== "function")
        && ["documents", "knowledgeObjects"].every(k => Object.hasOwn(descriptors, k) && Object.hasOwn(descriptors[k], "value")))
        indexes = { documents: indexRows(descriptors.documents.value, "id"),
          knowledgeObjects: indexRows(descriptors.knowledgeObjects.value, "vorgangId") };
      // A fallback collection can execute user callbacks. Never retain an early
      // index for its mutable companion across that original evaluation point.
      if (!indexes?.documents || !indexes?.knowledgeObjects) indexes = null;
      if (reusable) versionIndexes.set(versions, indexes);
    }
    const documentKeys = sources.documents.map(row => {
      const expected = indexes?.documents ? indexes.documents.get(row.id)?.get(hash(row))
        : versions.documents.find(x => x.id === row.id && x.versionHash === hash(row));
      requireThat(expected, "direct-document-context-drift"); return expected.key;
    }).sort();
    const knowledgeObjectKeys = sources.knowledgeObjects.map(row => {
      const expected = indexes?.knowledgeObjects ? indexes.knowledgeObjects.get(row.vorgang_id)?.get(hash(row))
        : versions.knowledgeObjects.find(x => x.vorgangId === row.vorgang_id && x.versionHash === hash(row));
      requireThat(expected, "direct-ko-context-drift"); return expected.key;
    }).sort();
    const result = { documentKeys, knowledgeObjectKeys };
    if (reusable) {
      if (!byVersions) { byVersions = privateWeakMap(); sourceKeys.set(sources, byVersions); }
      byVersions.set(versions, result);
    }
    return result;
  };
  const mapsFor = sources => {
    if (sourceMaps.has(sources)) return sourceMaps.get(sources);
    const result = { docs: new Map(sources.documents.map(row => [row.id, row])),
      kos: new Map(sources.knowledgeObjects.map(row => [row.id, row])) };
    if (frozen(sources)) sourceMaps.set(sources, result);
    return result;
  };
  requireThat(exact(command, ["version", "mode", "package", "executor", "slot", "understanding", "drafts", "predecessors", "native", "units"])
    && (command.version === VERSION && ["U-prestage", "D-R-500"].includes(command.mode)
      || isDirect(command)), "command-shape");
  const { p, byId } = A.pruefeSlot(command.slot);
  if (EU.isPlan(p)) requireThat(isDirect(command) && command.mode === "D-R-500"
    && EU.isManifest(command.executor?.eingaben?.runtimeManifest?.profilvertrag)
    && EU.isSollplan(command.executor?.eingaben?.sollplan), "common-EU-contract-required");
  requireThat(command.slot.version === A.ROUTE_VERSION && p.version === A.ROUTE_PLAN_VERSION
    && Object.keys(command.slot.consumed).length === 0 && Object.keys(command.slot.draftCompletions).length === 0
    && Object.keys(command.slot.reviewBindings).length === 0, "fresh-route-slot-required");
  requireThat(Array.isArray(command.understanding) && Array.isArray(command.drafts) && Array.isArray(command.predecessors), "finite-inputs");
  const uIntents = p.intents.filter(x => x.phase === "U").sort((a, b) => a.id.localeCompare(b.id));
  requireThat(command.understanding.length === uIntents.length, "u-cardinality");
  const units = [];
  for (const [i, u] of command.understanding.entries()) {
    const intent = uIntents[i];
    requireThat(exact(u, ["intentId", "cluster", "reads", "sources", "options"])
      && u.intentId === intent.id && u.cluster && Array.isArray(u.cluster.documents)
      && u.cluster.documents.length > 0 && exact(u.options, [])
      && exact(u.reads, ["getExisting", "findVorgangCandidates", "listVorgangDocuments"]), "u-binding");
    checkSources(u.sources);
    const originalDocs = new Map(u.sources.documents.map(d => [d.id, d]));
    requireThat(new Set(u.cluster.documents.map(d => d.id)).size === u.cluster.documents.length
      && u.cluster.documents.every(d => originalDocs.has(d.id)
        && same(d, require("./quellen-auszug").geleseneQuelle(structuredClone(originalDocs.get(d.id))))), "u-original-cluster-documents");
    for (const map of Object.values(u.reads)) requireThat(map && typeof map === "object" && !Array.isArray(map), "u-read-map");
    units.push({ kind: "U", subject: JSON.stringify([intent.vorgangId, intent.contractInputHash]), intentIds: [intent.id] });
  }
  if (command.mode === "U-prestage") {
    requireThat(uIntents.length > 0 && uIntents.length === p.intents.length && command.drafts.length === 0
      && command.package === null && command.executor === null && command.native === null, "u-only-not-500");
  } else {
    requireThat(uIntents.length === 0, "future-u-dependent-D-not-admissible");
    P.pruefePaket(command.package);
    require("./synthetik-500-executor").pruefe(command.executor, command.package);
    requireThat(command.executor.version === (isDirect(command)
      ? require("./synthetik-500-executor").DIRECT_VERSION : require("./synthetik-500-executor").ROUTE_VERSION)
      && command.executor.strukturVollstaendig === true && command.executor.fehlendeEingaben.length === 0
      && command.executor.laufBindung?.admissionPlanHash === command.slot.planHash, "executor-plan");
    requireThat(command.drafts.length === 500 && p.intents.length === 1000, "500-d-r");
    const owners = [...new Set(p.intents.filter(x => x.phase === "D").map(x => x.owner))].sort();
    requireThat(owners.length === 500 && same(owners, command.drafts.map(x => x.profile?.id)), "owner-order");
    for (const d of command.drafts) {
      const intent = byId.get(d.intentId), r = p.intents.find(x => x.phase === "R" && x.owner === d.profile.id);
      requireThat(exact(d, ["intentId", "profile", "descriptor", "briefingEingabe", "briefingDatum", "sources"])
        && intent?.phase === "D" && intent.owner === d.profile.id && r?.dependsOn === intent.id
        && utc(d.briefingDatum), "d-binding");
      if (isDirect(command) && EU.isPlan(p) && Dates.isHistorical(d)) Dates.bind(d, p);
      else requireThat(d.briefingDatum.slice(0, 10) === p.startsAtUTC.slice(0, 10), "d-binding");
      checkSources(d.sources);
      const descriptor = d.descriptor;
      requireThat(exact(descriptor, ["owner", "profileHash", "context", "documentKeys", "knowledgeObjectKeys"])
        && descriptor.owner === intent.owner && descriptor.profileHash === P.hash(command.package.profile.find(x => x.mandatsId === intent.owner))
        && same(descriptor.context, { profileVersionHash: P.hash(d.profile), briefingEingabeHash: P.hash(d.briefingEingabe), briefingDatum: d.briefingDatum })
        && sha(intent.inputVersionHash) && P.hash(descriptor) === intent.inputVersionHash, "d-actual-context");
      require("./briefing-lagebindung").pruefe(d.briefingEingabe, d.profile, d.profile.id, new Date(d.briefingDatum),
        { acceptedSnapshot: isDirect(command) });
      if (isDirect(command)) {
        requireThat(d.profile.profileActive === true, "direct-active-target-profile-required");
        const versions = command.executor.eingaben.kostenPlan.sourceVersions;
        const { documentKeys: docKeys, knowledgeObjectKeys: koKeys } = resolveKeys(d.sources, versions);
        requireThat(same(docKeys, descriptor.documentKeys) && same(koKeys, descriptor.knowledgeObjectKeys), "direct-source-descriptor-drift");
        const { docs, kos } = mapsFor(d.sources);
        requireThat(matchOriginalSources(d.briefingEingabe, docs, kos, projection, sourceFields, koFields),
          "direct-briefing-original-input-drift");
      }
      units.push({ kind: "DR", subject: intent.owner, intentIds: [intent.id, r.id] });
    }
    if (isDirect(command)) requireThat(command.native === null, "direct-no-native-D");
    else requireThat(exact(command.native, ["version", "contractHash", "abiHash", "installedSourceHash", "bodySealHash"])
      && command.native.version === require("./synthetik-500-review-receipt").STORAGE_VERSION
      && [command.native.contractHash, command.native.installedSourceHash, command.native.bodySealHash].every(sha)
      && command.native.abiHash === ABI_HASH, "native-actual-binding-missing");
  }
  requireThat(same(command.units, units), "derived-unit-schedule");
  for (const x of command.predecessors) requireThat((exact(x, N.BASE_KEYS)
    && typeof x.operationId === "string" && [x.commandHash, x.planHash, x.journalHash].every(sha))
    || N.validBinding(x), "predecessor-binding");
  requireThat(N.bindings(command).length <= 1
    && new Set(command.predecessors.map(x => x.operationId)).size === command.predecessors.length, "unique-predecessors");
  return { commandHash: P.hash(command), plan: p, byId };
}
function originalSourcesMatch(basis, docs, kos) {
  return matchOriginalSources(basis, docs, kos, (current, original, keys, repair) => {
    if (repair) current = require("./quellen-auszug").geleseneQuelle(current);
    return current && exact(original, keys)
      && same(Object.fromEntries(keys.map(k => [k, current[k]])), original);
  });
}
function matchOriginalSources(basis, docs, kos, projection, fields, koFields) {
  if (basis.version !== 2) return basis.korrekturBasis.kos.every(row => same(kos.get(row.id), row))
    && Object.values(basis.korrekturBasis.sourcesByVorgang).every(rows => rows.every(row => same(docs.get(row.id), row)));
  // The closed B2 proof retains Source19/KO59. Current-input guards retain full
  // native Source23/KO60 separately; projection back must match every old field.
  fields ??= require("./synthetik-500-w-inventar").SOURCE_VERSION_FIELDS
    .filter(k => !["content_hash", "retrieved_at", "created_at", "quellenauszug_beleg"].includes(k));
  koFields ??= KO.VERSION_FIELDS.filter(k => k !== "verstehen_fencing");
  return basis.korrekturBasis.kos.every(row => projection(kos.get(row.id), row, koFields, false))
    && Object.values(basis.korrekturBasis.sourcesByVorgang).every(rows => rows.every(row =>
      projection(docs.get(row.id), row, fields, true)));
}
function validateSources(s) {
  requireThat(exact(s, ["documents", "knowledgeObjects"]) && Array.isArray(s.documents) && Array.isArray(s.knowledgeObjects)
    && s.documents.length <= 4000 && s.knowledgeObjects.length <= 4000, "finite-source-set");
  const fields = require("./synthetik-500-w-inventar").SOURCE_VERSION_FIELDS;
  for (const d of s.documents) requireThat(exact(d, fields) && typeof d.id === "string" && d.id.length > 0, "source23");
  for (const k of s.knowledgeObjects) KO.pruefe(k);
  for (const rows of [s.documents, s.knowledgeObjects]) requireThat(new Set(rows.map(x => x.id)).size === rows.length, "duplicate-current-input");
}
function controlHash(auth) { return P.hash({ slot: auth.synthetik500KostenAdmission ?? null,
  journal: auth.synthetik500DispatchJournal ?? null }); }
function booksHash(auth) { return P.hash({ days: auth.testKostenTage ?? null, order: auth.testKostenAuftrag ?? null }); }
function admission(command, record, now, fresh = false) {
  const { commandHash, plan } = validate(command);
  requireThat(exact(record, ["version", "executor", "purpose", "commandHash", "planHash", "productionCommit",
    "admittedAtUTC", "expiresAtUTC", "controlHash", "booksHash", "gates", "evidencePins"])
    && record.version === ADMISSION_VERSION && record.executor === "/root"
    && record.purpose === (command.mode === "U-prestage" ? "finite-U-prestage-no-500" : "finite-D-R-500")
    && record.commandHash === commandHash && record.planHash === command.slot.planHash
    && record.productionCommit === plan.productionCommit && utc(record.admittedAtUTC) && utc(record.expiresAtUTC)
    && Date.parse(record.expiresAtUTC) === Date.parse(plan.endsAtUTC)
    && Date.parse(now) >= Date.parse(record.admittedAtUTC) && Date.parse(now) < Date.parse(record.expiresAtUTC)
    && (!fresh || Date.parse(now) - Date.parse(record.admittedAtUTC) <= 60000)
    && sha(record.controlHash) && sha(record.booksHash), "genuine-root-admission-required");
  const needed = (isDirect(command) ? DIRECT_GATES : GATES).filter(x => command.mode !== "U-prestage" || !["nativeD", "endGuard", "outputContract"].includes(x));
  if (N.bindings(command).length) needed.push("noSender");
  requireThat(exact(record.gates, needed) && exact(record.evidencePins, needed), "complete-actual-gates");
  for (const g of needed) { requireThat(record.gates[g] === true, "actual-gate-" + g); validatePin(record.evidencePins[g]); }
  return commandHash;
}
function validatePin(p) {
  requireThat(exact(p, ["path", "bytes", "sha256"]) && typeof p.path === "string" && /^(\/tmp\/|\/workspace\/)/.test(p.path)
    && Number.isSafeInteger(p.bytes) && p.bytes > 0 && p.bytes <= 16 * 1024 * 1024 && sha(p.sha256), "evidence-pin");
}
function readPin(pin) {
  validatePin(pin);
  const fd = fs.openSync(pin.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const a = fs.fstatSync(fd);
    requireThat(a.isFile() && (a.mode & 0o077) === 0 && a.size === pin.bytes, "private-evidence-file");
    const bytes = fs.readFileSync(fd), b = fs.fstatSync(fd), c = fs.lstatSync(pin.path);
    const identity = s => [s.dev, s.ino, s.mode, s.nlink, s.uid, s.gid, s.size, s.mtimeMs, s.ctimeMs].join("|");
    requireThat(identity(a) === identity(b) && identity(a) === identity(c)
      && crypto.createHash("sha256").update(bytes).digest("hex") === pin.sha256, "evidence-bytes");
    requireThat(Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes), "evidence-utf8");
    return bytes;
  } finally { fs.closeSync(fd); }
}
function loadPacket(commandPin, admissionPin, now) {
  const command = require("./synthetik-500-direct-codec").decode(JSON.parse(readPin(commandPin))), record = JSON.parse(readPin(admissionPin));
  admission(command, record, now, true);
  for (const [purpose, pin] of Object.entries(record.evidencePins)) {
    const gate = JSON.parse(readPin(pin));
    validateActualGate(command, record, purpose, gate);
    for (const primary of gate.primaryEvidencePins) readPin(primary);
    if (isDirect(command) && purpose === "testGo") validateTestGo(command, JSON.parse(readPin(gate.primaryEvidencePins[0])), now);
    if (purpose === "noSender") {
      const [x] = N.bindings(command), proofPin = gate.primaryEvidencePins[0];
      requireThat(proofPin.sha256 === x.noSenderProofHash, "no-sender-proof-pin");
      const proof = N.validateProof(JSON.parse(readPin(proofPin)), command);
      for (const primary of proof.primaryEvidencePins) readPin(primary);
      const originals = Object.fromEntries(Object.entries(proof.originalEvidencePins).map(([role, pin]) => [role, readPin(pin)]));
      N.validateOriginalEvidence(proof, originals);
    }
  }
  const packet = { command, admission: record, commandPin, admissionPin };
  if (isDirect(command)) {
    const gateBytes = readPin(record.evidencePins.testGo), gate = JSON.parse(gateBytes);
    packet.testAuthority = { gateBytes: gateBytes.toString("base64"), goBytes: readPin(gate.primaryEvidencePins[0]).toString("base64") };
    validateStoredAuthority(command, record, packet.testAuthority, now);
  }
  return packet;
}
function validateStoredAuthority(command, record, authority, now) {
  requireThat(exact(authority, ["gateBytes", "goBytes"]), "direct-test-authority-required");
  const decode = (encoded, pin) => {
    requireThat(typeof encoded === "string" && encoded.length <= 24 * 1024 * 1024, "direct-go-bytes");
    const bytes = Buffer.from(encoded, "base64");
    requireThat(bytes.toString("base64") === encoded && bytes.length === pin.bytes
      && crypto.createHash("sha256").update(bytes).digest("hex") === pin.sha256
      && Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes), "direct-go-primary-drift");
    return JSON.parse(bytes);
  };
  const gate = decode(authority.gateBytes, record.evidencePins.testGo);
  validateActualGate(command, record, "testGo", gate);
  return validateTestGo(command, decode(authority.goBytes, gate.primaryEvidencePins[0]), now);
}
function validateTestGo(command, go, now) {
  requireThat(exact(go, ["version", "operationId", "productionCommit", "deploymentId", "planHash", "paketHash",
    "startsAtUTC", "endsAtUTC", "authorizedAtUTC", "authorizationReference", "confirmation"])
    && go.version === "helmut-synthetik500-test-go/1" && isDirect(command)
    && go.operationId === command.slot.plan.operationId && go.productionCommit === command.slot.plan.productionCommit
    && go.deploymentId === command.slot.plan.routeContract.route.deploymentId && go.planHash === command.slot.planHash
    && go.paketHash === command.package.bindung.paketHash && go.startsAtUTC === command.slot.plan.startsAtUTC
    && go.endsAtUTC === command.slot.plan.endsAtUTC && utc(go.authorizedAtUTC) && Date.parse(go.authorizedAtUTC) <= Date.parse(now)
    && typeof go.authorizationReference === "string" && go.authorizationReference.trim().length > 0
    && go.confirmation === "SEPARATES_GO_EXAKT500_SYNTHETIK_PRODUCTION_TEST", "direct-separate-test-go-required");
  return go;
}
function validateActualGate(command, record, purpose, gate) {
    requireThat(exact(gate, ["version", "purpose", "rootExecutor", "operationId", "runId", "productionCommit",
      "planHash", "commandHash", "acceptedActualScope", "primaryEvidencePins"])
      && gate.version === ACTUAL_GATE_VERSION && gate.purpose === purpose && gate.rootExecutor === "/root"
      && gate.operationId === command.slot.plan.operationId && gate.runId === command.slot.plan.runId
      && gate.productionCommit === record.productionCommit && gate.planHash === record.planHash
      && gate.commandHash === record.commandHash && gate.acceptedActualScope === true
      && Array.isArray(gate.primaryEvidencePins) && gate.primaryEvidencePins.length > 0 && gate.primaryEvidencePins.length <= 32,
      "actual-receipt-scope-" + purpose);
    for (const primary of gate.primaryEvidencePins) validatePin(primary);
}
module.exports = { VERSION, DIRECT_VERSION, isDirect, DIRECT_GATES, ADMISSION_VERSION, ACTUAL_GATE_VERSION, GATES, NATIVE_ABI, ABI_HASH, exact, requireThat, same, utc, validate,
  validateSources, originalSourcesMatch, controlHash, booksHash, admission, validateActualGate, validateTestGo, validateStoredAuthority, readPin, loadPacket };
