"use strict";

// Closed membership proof for the unchanged, finally accepted B2 input bytes.
// This is an integrity handoff, not a newly generated sources/verdict approval.
const P = require("./synthetik-500-profile");
const B = require("./briefing-speicher");
const { immutableInvocationData } = require("./streaming-canonical-hash");
const { isProxy } = require("node:util").types;
const indexApply = Reflect.apply, indexFreeze = Object.freeze, IndexMap = Map;
const IM = { get: Map.prototype.get, has: Map.prototype.has, set: Map.prototype.set };
function pairMap() {
  const data = new IndexMap(); return indexFreeze({ get: key => indexApply(IM.get, data, [key]),
    has: key => indexApply(IM.has, data, [key]), set: (key, value) => { indexApply(IM.set, data, [key, value]); } });
}
const INDEX_METADATA = { descriptor: Object.getOwnPropertyDescriptor, prototype: Object.getPrototypeOf,
  descriptors: Object.getOwnPropertyDescriptors, keys: Object.keys, names: Object.getOwnPropertyNames,
  symbols: Object.getOwnPropertySymbols, own: Object.hasOwn, array: Array.isArray,
  objectPrototype: Object.prototype, arrayPrototype: Array.prototype };
const ARRAY_DEPENDENCIES = [[Array.prototype, "find"], [Array.prototype, "flatMap"], [Array.prototype, "map"],
  [Array.prototype, "constructor"], [Array, Symbol.species], [Array.prototype, Symbol.iterator]]
  .map(([object, key]) => ({ object, key, descriptor: INDEX_METADATA.descriptor(object, key) }));
const { berlinTagKey } = require("./briefing-frische");
const VERSION = "helmut-b2-d-historical-snapshot/1";
const PROOF_VERSION = "helmut-b2-accepted-snapshot-proof/1";
const MERKLE_ROOT = "ce7ee487274b39952d23dbb377647659f6c41b6684eb0406cbc1d8553df87c69";
const ROOT_ACCEPTANCE_SHA256 = "74175988639291cfb86d50e149c98f55f79df3288bb8f091335ef5c3ad32557c";
const ENUMERATION_SHA256 = "0e48b02dfa15eafea6946d7baf1332c16aec599c5ce5687a1a6359b709dca170";
const PUBLICATION_POLICY_HASH = "274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04";
const RUN_ID = "38102593796", CAPTURE_DAY = "2026-10-11";
const snapshots = new WeakMap();
const SHA = /^[a-f0-9]{64}$/;
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const requireThat = (ok, code) => { if (!ok) throw Error("blocker2-d-historical-binding-" + code); };
const utc = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function isHistoricalSnapshot(snapshot) {
  return snapshot !== null && typeof snapshot === "object" && snapshots.has(snapshot);
}
function metadata(snapshot) {
  requireThat(isHistoricalSnapshot(snapshot), "snapshot-token");
  return structuredClone(snapshots.get(snapshot).metadata);
}
function contextAdditions(snapshot) {
  requireThat(isHistoricalSnapshot(snapshot), "snapshot-token");
  return structuredClone(snapshots.get(snapshot).contextAdditions);
}
function assertProjection(snapshot, kos, sources) {
  requireThat(isHistoricalSnapshot(snapshot), "snapshot-token");
  requireThat(Array.isArray(kos) && sources && typeof sources === "object" && !Array.isArray(sources), "projection-shape");
  const accepted = snapshots.get(snapshot), seen = new Set();
  for (const ko of kos) {
    const id = ko?.vorgang_id;
    requireThat(typeof id === "string" && !seen.has(id) && accepted.kos.has(id)
      && P.hash(ko) === accepted.kos.get(id), "projection-ko");
    seen.add(id);
    requireThat(Object.hasOwn(sources, id) && accepted.sources.has(id)
      && P.hash(sources[id]) === accepted.sources.get(id), "projection-sources");
  }
  for (const [id, rows] of Object.entries(sources))
    requireThat(accepted.sources.has(id) && P.hash(rows) === accepted.sources.get(id), "projection-sources");
  return true;
}

// A pure proof primitive, with no authority to admit a different root.
function recomputeRoot(proof) {
  requireThat(exact(proof, ["version", "leaf", "siblings"]) && proof.version === PROOF_VERSION, "proof-shape");
  const leaf = proof.leaf;
  requireThat(exact(leaf, ["position", "owner", "profileHash", "nativeProfileHash", "bodySHA256", "eingabeHash", "basisHash", "capturedAtUTC"])
    && Number.isSafeInteger(leaf.position) && leaf.position >= 1 && leaf.position <= 500
    && typeof leaf.owner === "string" && leaf.owner.length > 0 && leaf.owner.length <= 200
    && [leaf.profileHash, leaf.nativeProfileHash, leaf.bodySHA256, leaf.eingabeHash, leaf.basisHash].every(v => typeof v === "string" && SHA.test(v))
    && utc(leaf.capturedAtUTC), "leaf-shape");
  requireThat(Array.isArray(proof.siblings) && proof.siblings.length === 9
    && proof.siblings.every(v => typeof v === "string" && SHA.test(v)), "proof-depth");
  let root = P.hash({ domain: "helmut-b2-accepted-snapshot-leaf/1", leaf }), index = leaf.position - 1;
  for (const sibling of proof.siblings) {
    root = P.hash({ domain: "helmut-b2-accepted-snapshot-node/1",
      left: index % 2 ? sibling : root, right: index % 2 ? root : sibling });
    index = Math.floor(index / 2);
  }
  return root;
}

function originalFindCurrent() {
  const dependency = ARRAY_DEPENDENCIES[0], current = INDEX_METADATA.descriptor(dependency.object, dependency.key);
  return current && current.value === dependency.descriptor.value && current.get === dependency.descriptor.get
    && current.set === dependency.descriptor.set && current.enumerable === dependency.descriptor.enumerable
    && current.configurable === dependency.descriptor.configurable && current.writable === dependency.descriptor.writable;
}
function sourcePairIndex(quellen, sourcesByVorgang, sourceIds) {
  if (!immutableInvocationData(sourcesByVorgang)
    || INDEX_METADATA.prototype(INDEX_METADATA.arrayPrototype) !== INDEX_METADATA.objectPrototype) return null;
  for (let i = 0; i < ARRAY_DEPENDENCIES.length; i++) {
    const { object, key, descriptor } = ARRAY_DEPENDENCIES[i], current = INDEX_METADATA.descriptor(object, key);
    if (!current || current.value !== descriptor.value || current.get !== descriptor.get || current.set !== descriptor.set
      || current.enumerable !== descriptor.enumerable || current.configurable !== descriptor.configurable
      || current.writable !== descriptor.writable) return null;
  }
  const collections = [sourceIds, quellen];
  for (let c = 0; c < collections.length; c++) {
    const rows = collections[c];
    if (isProxy(rows) || !INDEX_METADATA.array(rows) || INDEX_METADATA.prototype(rows) !== INDEX_METADATA.arrayPrototype
      || INDEX_METADATA.symbols(rows).length) return null;
    const keys = INDEX_METADATA.keys(rows), own = INDEX_METADATA.descriptors(rows);
    if (INDEX_METADATA.names(rows).length !== keys.length + 1 || keys.length !== rows.length) return null;
    for (let i = 0; i < keys.length; i++)
      if (keys[i] !== "" + i || !INDEX_METADATA.own(own[keys[i]], "value")) return null;
  }
  for (let i = 0; i < sourceIds.length; i++) if (typeof sourceIds[i] !== "string") return null;
  const index = pairMap();
  for (let i = 0; i < quellen.length; i++) {
    const q = quellen[i];
    if (!q || typeof q !== "object" || isProxy(q)) return null;
    const prototype = INDEX_METADATA.prototype(q);
    if (prototype !== INDEX_METADATA.objectPrototype && prototype !== null || INDEX_METADATA.own(q, "toJSON")
      || INDEX_METADATA.symbols(q).length) return null;
    const own = INDEX_METADATA.descriptors(q), fields = INDEX_METADATA.keys(q);
    if (INDEX_METADATA.names(q).length !== fields.length) return null;
    for (let j = 0; j < fields.length; j++)
      if (!INDEX_METADATA.own(own[fields[j]], "value") || typeof own[fields[j]].value === "function") return null;
    const required = ["vorgangId", "documentId", "url"];
    for (let j = 0; j < required.length; j++)
      if (!INDEX_METADATA.own(own, required[j]) || typeof own[required[j]].value !== "string") return null;
    const id = own.vorgangId.value, documentId = own.documentId.value;
    if (!index.has(id)) index.set(id, pairMap());
    if (!index.get(id).has(documentId)) index.get(id).set(documentId, q);
  }
  return index;
}

function verify(basis, profile, userId, now = new Date()) {
  requireThat(exact(basis, ["version", "briefing", "eingabe", "korrekturBasis", "acceptedSnapshot"])
    && basis.version === 2, "basis-shape");
  requireThat(recomputeRoot(basis.acceptedSnapshot) === MERKLE_ROOT, "membership-root");
  const leaf = basis.acceptedSnapshot.leaf, input = basis.eingabe;
  requireThat(profile && profile.id === userId && userId === leaf.owner && input?.mandat === userId, "owner");
  const capturedProfile = { ...profile, profileActive: false };
  requireThat(typeof profile.profileActive === "boolean" && B.profilHash(profile) === leaf.profileHash
    && P.hash(capturedProfile) === leaf.nativeProfileHash, "profile");
  const currentTime = new Date(now), capture = new Date(leaf.capturedAtUTC);
  requireThat(Number.isFinite(currentTime.getTime()) && currentTime >= capture
    && input.tag === CAPTURE_DAY && berlinTagKey(capture) === CAPTURE_DAY
    && berlinTagKey(currentTime) === CAPTURE_DAY, "capture-day");
  const { eingabeHash, ...inputWithoutHash } = input;
  requireThat(eingabeHash === leaf.eingabeHash && P.hash(inputWithoutHash) === eingabeHash, "input-hash");
  requireThat(P.hash({ briefing: basis.briefing, eingabe: input, korrekturBasis: basis.korrekturBasis }) === leaf.basisHash, "basis-hash");
  const eligibility = require("./publication-eligibility"), policy = eligibility.current();
  requireThat(policy.hash === PUBLICATION_POLICY_HASH, "publication-policy");
  eligibility.assertRecorded(input.publicationEligibilityPolicy, policy);
  eligibility.assertRecorded(basis.briefing?.publicationEligibilityPolicy, policy);
  const { kos, sourcesByVorgang } = basis.korrekturBasis || {};
  requireThat(Array.isArray(kos) && sourcesByVorgang && basis.briefing?.available === true
    && Array.isArray(basis.briefing.items), "original-content");
  const A = require("./briefing-aussagenbindung");
  // The accepted correction context includes the original inactive profile.
  // Its exact full hash was just verified; only the runtime activation differs.
  const rebuilt = A.baueEingabe({ briefing: basis.briefing, sourcesByVorgang, profile: capturedProfile, userId,
    day: input.tag, kos, korrekturHash: input.korrekturHash });
  requireThat(P.hash(rebuilt) === P.hash(input), "rebuilt-input");
  const events = require("./briefing-ereignisteilmitglieder"), items = basis.briefing.items;
  requireThat(items.every(i => !i.ereignisUrspruenge || events.projektionGueltig(i)), "event-projection");
  const ids = items.map(i => i.vorgangId);
  requireThat(ids.length > 0 && ids.every(id => typeof id === "string" && id.length > 0)
    && new Set(ids).size === ids.length, "selected-ids");
  const ranked = ids.map(id => {
    const matches = kos.filter(k => k.vorgang_id === id);
    requireThat(matches.length === 1, "selected-ko");
    return structuredClone(matches[0]);
  });
  let excludedProvenanceSources = 0;
  const sourceIds = events.vorgangIds(items, false);
  const sourcePairs = sourcePairIndex(rebuilt.quellen, sourcesByVorgang, sourceIds);
  const sources = Object.fromEntries(sourceIds.map(id => [id, (sourcesByVorgang[id] || []).flatMap(d => {
    const q = sourcePairs && immutableInvocationData(d) && originalFindCurrent() ? sourcePairs.get(id)?.get(d.id)
      : rebuilt.quellen.find(q => q.vorgangId === id && q.documentId === d.id);
    requireThat(q, "source-binding");
    if (!require("./lage-quellenbeleg").artikelUrl(q.url)) { excludedProvenanceSources++; return []; }
    // No replacement address or source: use the exact accepted article address.
    return [{ ...structuredClone(d), url: q.url, canonical_url: q.url }];
  })]));
  const snapshotData = { version: VERSION, rootAcceptanceSHA256: ROOT_ACCEPTANCE_SHA256,
    enumerationSHA256: ENUMERATION_SHA256, runId: RUN_ID, merkleRoot: MERKLE_ROOT,
    position: leaf.position, owner: leaf.owner, sourceCaptureUTC: leaf.capturedAtUTC,
    bodySHA256: leaf.bodySHA256, inputHash: leaf.eingabeHash, basisHash: leaf.basisHash, excludedProvenanceSources };
  // JSON callers can reproduce the metadata but cannot mint this capability.
  const historicalSnapshot = Object.freeze({ ...snapshotData });
  snapshots.set(historicalSnapshot, { metadata: Object.freeze(snapshotData),
    kos: new Map(ranked.map(ko => [ko.vorgang_id, P.hash(ko)])),
    sources: new Map(Object.entries(sources).map(([id, rows]) => [id, P.hash(rows)])),
    contextAdditions: Object.fromEntries(items.filter(i => i.ereignisUrspruenge).map(i => [i.vorgangId,
      { title: i.title, summary: i.summary, ...events.oeffentlicheRollen(i) }])) });
  const SOURCE_SCOPE = { mode: "accepted-historical-background", captureUTC: leaf.capturedAtUTC,
    rootSHA: ROOT_ACCEPTANCE_SHA256, publicationDatesUnchanged: true };
  return { ranked, sources, eingabeHash: rebuilt.eingabeHash,
    teilmitgliedProjektionen: items.filter(i => i.ereignisUrspruenge).map(i => structuredClone(i)),
    historicalSnapshot, SOURCE_SCOPE };
}

module.exports = { VERSION, recomputeRoot, verify, isHistoricalSnapshot, metadata, contextAdditions, assertProjection };
