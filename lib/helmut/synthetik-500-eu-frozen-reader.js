"use strict";
// Pure, explicit EU Direct frozen-reader domain. No provider, native writer,
// source discovery, Root admission or runtime-authority inference.
const crypto = require("node:crypto");
const P = require("./synthetik-500-profile"), EU = require("./synthetik-500-eu-service-contract"), KO = require("./knowledge-object-version");
const VERSION = "helmut-synthetik500-eu-frozen-reader-primary/1";
const PROOF_VERSION = "helmut-synthetik500-lokaler-endlichkeitsbeleg/2-eu-frozen-reader";
const INVENTORY_VERSION = "helmut-synthetik500-w-eu-frozen-reader/1";
const TRANSPORT_VERSION = "helmut-synthetik500-eu-frozen-reader-cost-transport/1";
const MODE = "eu-direct-frozen-reader", COMMAND_VERSION = "helmut-synthetik500-production-command/2-direct";
const ENCODED_MAX = 32 * 1024 * 1024, EXPANDED_MAX = 96 * 1024 * 1024, NODE_MAX = 200000, DEPTH_MAX = 80, REFERENCE_MAX = 687000;
const exact = (x, ks) => x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).sort().join("|") === [...ks].sort().join("|");
const sha = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const same = (a, b) => P.hash(a) === P.hash(b);
const sorted = xs => [...xs].sort();
const requireThat = (ok, code) => { if (!ok) throw Error("synthetik500-frozen-reader-" + code); };
const bytesHash = x => crypto.createHash("sha256").update(x, "utf8").digest("hex");
const isProof = p => p?.version === PROOF_VERSION;
function reference(p) {
  requireThat(exact(p, ["reference", "sha256"]) && typeof p.reference === "string" && p.reference.length > 0 && p.reference.length <= 2000 && p.reference.trim() === p.reference && sha(p.sha256), "reference");
}
function keyList(xs, n) {
  requireThat(Array.isArray(xs) && xs.length === n && xs.every(sha) && new Set(xs).size === n && same(xs, sorted(xs)), "source-key-list");
}
function domain(x, route) {
  requireThat(EU.isRoute(route) && x.mode === MODE && x.serviceContractHash === EU.HASH && x.commandVersion === COMMAND_VERSION && x.commandMode === "D-R-500", "closed-EU-Direct-domain");
}
function inventory(source, proof, route) {
  requireThat(exact(proof, ["version", "documentInventoryHash", "knowledgeObjectInventoryHash", "clusterInventoryHash", "requiredVersionKeys", "evidence", "mode", "serviceContractHash", "commandVersion", "commandMode", "ingestionDocumentKeys", "contextOnlyDocumentKeys", "contextCoverage", "frozenDraftBindings", "frozenDraftBindingsHash", "readerPrimaryHash"]) && isProof(proof), "proof-shape");
  domain(proof, route); reference(proof.evidence);
  requireThat(Array.isArray(source.documents) && source.documents.length === 874 && Array.isArray(source.knowledgeObjects) && source.knowledgeObjects.length === 500 && Array.isArray(source.clusters) && source.clusters.length === 0 && same(proof.requiredVersionKeys, []) && same(proof.ingestionDocumentKeys, []), "finite-reader-domain");
  keyList(proof.contextOnlyDocumentKeys, 874);
  requireThat(same(proof.contextOnlyDocumentKeys, sorted(source.documents.map(x => x.key))) && proof.documentInventoryHash === P.hash(source.documents) && proof.knowledgeObjectInventoryHash === P.hash(source.knowledgeObjects) && proof.clusterInventoryHash === P.hash([]) && sha(proof.readerPrimaryHash), "inventory-hash-binding");
  const docs = new Map(source.documents.map(d => [d.key, d])), kos = new Map(source.knowledgeObjects.map(k => [k.key, k]));
  const covered = new Set(), edges = new Set();
  requireThat(Array.isArray(proof.contextCoverage) && proof.contextCoverage.length === 939, "context-edge-count");
  for (const c of proof.contextCoverage) {
    const d = docs.get(c.documentKey), k = kos.get(c.knowledgeObjectKey), m = c.originalMembership, l = c.nativeLink;
    requireThat(exact(c, ["documentKey", "knowledgeObjectKey", "sourceVersionHash", "knowledgeObjectVersionHash", "originalMembership", "nativeLink"]) && d && k && c.sourceVersionHash === d.versionHash && c.knowledgeObjectVersionHash === k.versionHash && exact(m, ["vorgangId", "knowledgeObjectId", "koVersion", "documentId"]) && m.documentId === d.id && m.vorgangId === k.vorgangId && m.koVersion === k.koVersion && exact(l, ["knowledge_object_id", "raw_document_id", "created_at"]) && l.knowledge_object_id === m.knowledgeObjectId && l.raw_document_id === d.id && typeof l.created_at === "string" && Number.isFinite(Date.parse(l.created_at)), "context-native-membership-binding");
    const edge = JSON.stringify([c.documentKey, c.knowledgeObjectKey]); requireThat(!edges.has(edge), "context-duplicate-edge"); edges.add(edge); covered.add(c.documentKey);
  }
  requireThat(same(sorted(covered), proof.contextOnlyDocumentKeys), "context-document-uncovered");
  bindings(proof.frozenDraftBindings);
  requireThat(proof.frozenDraftBindingsHash === P.hash(proof.frozenDraftBindings), "frozen-draft-inventory-hash");
  return true;
}
function bindings(rows) {
  requireThat(Array.isArray(rows) && rows.length === 500 && new Set(rows.map(x => x.owner)).size === 500 && same(rows.map(x => x.owner), sorted(rows.map(x => x.owner))), "frozen500-binding-order");
  for (const r of rows) requireThat(exact(r, ["owner", "profileHash", "context", "originalInputBinding", "requestBodySHA256", "actualRequestHash"]) && typeof r.owner === "string" && r.owner.length > 0 && sha(r.profileHash) && exact(r.context, ["profileVersionHash", "briefingEingabeHash", "briefingDatum"]) && sha(r.context.profileVersionHash) && sha(r.context.briefingEingabeHash) && typeof r.context.briefingDatum === "string" && Number.isFinite(Date.parse(r.context.briefingDatum)) && r.originalInputBinding?.owner === r.owner && sha(r.originalInputBinding?.bodySHA256) && sha(r.originalInputBinding?.basisHash) && sha(r.originalInputBinding?.inputHash) && sha(r.requestBodySHA256) && sha(r.actualRequestHash), "frozen-input-binding");
}
function sourceWrapper(d) {
  const fields = require("./synthetik-500-w-inventar").SOURCE_VERSION_FIELDS;
  requireThat(exact(d, ["id", "scope", "version"]) && exact(d.version, fields) && d.id === d.version.id
    && ["bundestag_abgerufen_at", "berlin_abgerufen_at", "brandenburg_abgerufen_at"].every(k => same(d.version[k], d.version.retrieved_at)), "native-Source23-binding");
  const stand = require("./artikelstand").leseStand(d.version), scopes = { bundestag: "BT", berlin: "BE", brandenburg: "BB" };
  requireThat(d.scope === null ? !stand && ["dip_quellfelder", "bundestag_artikelstand", "berlin_artikelstand", "brandenburg_artikelstand"].every(k => d.version[k] === null) : stand && scopes[stand.name] === d.scope, "official-or-exact-neutral-scope");
}
function validateInputs(input, proof, source) {
  inventory(source, proof, input.routeContract);
  requireThat(same(input.clusters, []) && same(input.understandingInputs, []) && same(input.otherPaidInputs, []) && input.reviewMaxOutputTokens === 3000 && Array.isArray(input.draftInputs) && input.draftInputs.length === 500, "only1000DR-noU-other");
  for (const d of input.documents) sourceWrapper(d);
  const nativeKOByVersion = new Map(input.knowledgeObjects.map(k => [JSON.stringify([k.vorgangId, k.koVersion]), k.version.id]));
  for (const c of proof.contextCoverage) requireThat(c.originalMembership.knowledgeObjectId === nativeKOByVersion.get(JSON.stringify([c.originalMembership.vorgangId,c.originalMembership.koVersion])) && c.nativeLink.knowledge_object_id === c.originalMembership.knowledgeObjectId, "input-native-KO-id-binding");
  const byOwner = new Map(proof.frozenDraftBindings.map(x => [x.owner, x]));
  for (const d of input.draftInputs) {
    const b = byOwner.get(d.owner);
    requireThat(b && d.profileHash === b.profileHash && same(d.context, b.context) && same(d.documentKeys, sorted(source.documents.map(x => x.key))) && same(d.knowledgeObjectKeys, sorted(source.knowledgeObjects.map(x => x.key))) && typeof d.requestBody === "string" && bytesHash(d.requestBody) === b.requestBodySHA256 && require("./synthetik-500-kosten-admission").requestHash(d.requestBody) === b.actualRequestHash, "actual-frozen-D-binding");
  }
}
function validatePrimary(primary, documents, knowledgeObjects, route) {
  requireThat(exact(primary, ["version", "mode", "serviceContractHash", "commandVersion", "commandMode", "originalSource", "nativeSource", "originalMembership", "nativeLinks", "frozenDraftBindings", "selectedReaderReferences", "pins", "auxiliarySupport", "readMetadata"]) && primary.version === VERSION, "primary-shape");
  domain(primary, route); bindings(primary.frozenDraftBindings);
  const W = require("./synthetik-500-w-inventar"), fields = W.SOURCE_VERSION_FIELDS;
  const sourceShape = s => exact(s, ["documents", "knowledgeObjects"]) && Array.isArray(s.documents) && s.documents.length === 874 && Array.isArray(s.knowledgeObjects) && s.knowledgeObjects.length === 500;
  requireThat(sourceShape(primary.originalSource) && sourceShape(primary.nativeSource) && same(primary.originalSource, primary.nativeSource), "original-native-full-source-drift");
  requireThat(Array.isArray(documents) && documents.length === 874 && Array.isArray(knowledgeObjects) && knowledgeObjects.length === 500 && new Set(documents.map(x => x.id)).size === 874 && new Set(knowledgeObjects.map(x => x.vorgangId)).size === 500, "input-full-inventory");
  const nativeDocs = new Map(primary.nativeSource.documents.map(d => [d.id, d])), nativeKO = new Map(primary.nativeSource.knowledgeObjects.map(k => [k.id, k]));
  requireThat(nativeDocs.size === 874 && nativeKO.size === 500, "native-source-duplicate");
  const documentVersions = documents.map(d => {
    sourceWrapper(d);
    requireThat(nativeDocs.has(d.id) && same(d.version, nativeDocs.get(d.id)), "native-Source23-binding");
    const versionHash = P.hash(d.version); return { key: P.hash({ id: d.id, scope: d.scope, versionHash }), id: d.id, scope: d.scope, versionHash };
  }).sort((a,b) => a.key.localeCompare(b.key));
  const knowledgeObjectVersions = knowledgeObjects.map(k => {
    KO.pruefe(k.version); requireThat(exact(k, ["vorgangId", "koVersion", "version"]) && k.vorgangId === k.version.vorgang_id && k.koVersion === k.version.ko_version && nativeKO.has(k.version.id) && same(k.version, nativeKO.get(k.version.id)), "native-KO60-binding");
    const versionHash = P.hash(k.version); return { key: P.hash({ vorgangId:k.vorgangId, koVersion:k.koVersion, versionHash }), vorgangId:k.vorgangId, koVersion:k.koVersion, versionHash };
  }).sort((a,b) => a.key.localeCompare(b.key));
  for (const s of ["BT", "BE", "BB"]) requireThat(documentVersions.some(d => d.scope === s), "official-scope-missing");
  const support = primary.auxiliarySupport;
  requireThat(exact(support, ["documents", "knowledgeObjects", "admittedToInputInventory"]) && support.admittedToInputInventory === false && Array.isArray(support.documents) && support.documents.length === 50 && Array.isArray(support.knowledgeObjects) && support.knowledgeObjects.length === 11, "explicit-auxiliary-support");
  const allDocIds = new Set(nativeDocs.keys()), allKOIds = new Set(nativeKO.keys());
  for (const d of support.documents) { requireThat(exact(d, fields) && !allDocIds.has(d.id), "aux-source-separation"); allDocIds.add(d.id); }
  for (const k of support.knowledgeObjects) { KO.pruefe(k); requireThat(!allKOIds.has(k.id), "aux-KO-separation"); allKOIds.add(k.id); }
  requireThat(exact(primary.readMetadata, ["caller", "sessionUser", "readOnly", "isolation", "captureComplete", "observedAtUTC", "snapshot", "nativeSourceInventoryHash", "nativeKOInventoryHash", "auxiliarySourceInventoryHash", "auxiliaryKOInventoryHash", "nativeLinkInventoryHash"]) && primary.readMetadata.caller === "supabase_read_only_user" && primary.readMetadata.sessionUser === primary.readMetadata.caller && primary.readMetadata.readOnly === "on" && primary.readMetadata.isolation === "repeatable read" && primary.readMetadata.captureComplete === true && typeof primary.readMetadata.snapshot === "string" && primary.readMetadata.snapshot.length > 0 && Number.isFinite(Date.parse(primary.readMetadata.observedAtUTC)) && primary.readMetadata.nativeSourceInventoryHash === P.hash(primary.nativeSource.documents) && primary.readMetadata.nativeKOInventoryHash === P.hash(primary.nativeSource.knowledgeObjects) && primary.readMetadata.auxiliarySourceInventoryHash === P.hash(support.documents) && primary.readMetadata.auxiliaryKOInventoryHash === P.hash(support.knowledgeObjects) && primary.readMetadata.nativeLinkInventoryHash === P.hash(primary.nativeLinks), "native-primary-capture-binding");
  requireThat(Array.isArray(primary.nativeLinks) && primary.nativeLinks.length === 972, "all-native-links-retained");
  const nativeLinkMap = new Map();
  for (const l of primary.nativeLinks) { const key = JSON.stringify([l.knowledge_object_id,l.raw_document_id]); requireThat(exact(l,["knowledge_object_id","raw_document_id","created_at"]) && nativeKO.has(l.knowledge_object_id) && allDocIds.has(l.raw_document_id) && typeof l.created_at === "string" && Number.isFinite(Date.parse(l.created_at)) && !nativeLinkMap.has(key), "native-link-separation"); nativeLinkMap.set(key,l); }
  const dById = new Map(documentVersions.map(d => [d.id,d])), kByVG = new Map(knowledgeObjectVersions.map(k => [k.vorgangId,k]));
  requireThat(Array.isArray(primary.originalMembership) && primary.originalMembership.length === 488 && new Set(primary.originalMembership.map(m => m.knowledgeObjectId)).size === 488, "original-context-membership");
  const coverage=[];
  for (const m of primary.originalMembership) {
    const nativeK = nativeKO.get(m.knowledgeObjectId), k = kByVG.get(m.vorgangId);
    requireThat(exact(m,["vorgangId","knowledgeObjectId","koVersion","documentIds"]) && nativeK && k && nativeK.vorgang_id === m.vorgangId && nativeK.ko_version === m.koVersion && Array.isArray(m.documentIds) && m.documentIds.length > 0 && new Set(m.documentIds).size === m.documentIds.length, "original-KO-membership-binding");
    for (const id of m.documentIds) { const d = dById.get(id), l = nativeLinkMap.get(JSON.stringify([m.knowledgeObjectId,id])); requireThat(d && l, "context-original-native-edge-missing"); coverage.push({documentKey:d.key,knowledgeObjectKey:k.key,sourceVersionHash:d.versionHash,knowledgeObjectVersionHash:k.versionHash,originalMembership:{vorgangId:m.vorgangId,knowledgeObjectId:m.knowledgeObjectId,koVersion:m.koVersion,documentId:id},nativeLink:l}); }
  }
  coverage.sort((a,b) => JSON.stringify([a.documentKey,a.knowledgeObjectKey]).localeCompare(JSON.stringify([b.documentKey,b.knowledgeObjectKey])));
  requireThat(Array.isArray(primary.selectedReaderReferences) && primary.selectedReaderReferences.length === 500 && new Set(primary.selectedReaderReferences.map(r => r.owner)).size === 500, "selected-reader500");
  const ownerSet = new Set(primary.frozenDraftBindings.map(r => r.owner));
  for (const r of primary.selectedReaderReferences) requireThat(exact(r,["owner","documentIds","knowledgeObjectIds"]) && ownerSet.has(r.owner) && Array.isArray(r.documentIds) && new Set(r.documentIds).size === r.documentIds.length && r.documentIds.every(id => nativeDocs.has(id)) && Array.isArray(r.knowledgeObjectIds) && new Set(r.knowledgeObjectIds).size === r.knowledgeObjectIds.length && r.knowledgeObjectIds.every(vg => kByVG.has(vg)), "selected-reader-reference-namespace");
  requireThat(primary.pins && typeof primary.pins === "object" && primary.pins.nativeCapture && primary.pins.originalSources && primary.pins.preparedRequest && primary.pins.publicationPolicy && primary.pins.publicationLinkIdentities && primary.pins.originals && Array.isArray(primary.pins.staticDirectExecutionSources) && primary.pins.staticDirectExecutionSources.length >= 5, "original-native-policy-code-primaries");
  return { source:{documents:documentVersions,knowledgeObjects:knowledgeObjectVersions,clusters:[]}, coverage };
}
function makeProof(primary, documents, knowledgeObjects, route, evidence) {
  const v=validatePrimary(primary,documents,knowledgeObjects,route),s=v.source;
  const proof={version:PROOF_VERSION,documentInventoryHash:P.hash(s.documents),knowledgeObjectInventoryHash:P.hash(s.knowledgeObjects),clusterInventoryHash:P.hash([]),requiredVersionKeys:[],evidence,mode:MODE,serviceContractHash:EU.HASH,commandVersion:COMMAND_VERSION,commandMode:"D-R-500",ingestionDocumentKeys:[],contextOnlyDocumentKeys:sorted(s.documents.map(d=>d.key)),contextCoverage:v.coverage,frozenDraftBindings:primary.frozenDraftBindings,frozenDraftBindingsHash:P.hash(primary.frozenDraftBindings),readerPrimaryHash:P.hash(primary)};
  inventory(s,proof,route);return proof;
}
function metrics(value) {
  const cache=new WeakMap(),visiting=new WeakSet();let nodes=0;
  function count(x,depth) {
    requireThat(depth<=DEPTH_MAX,"transport-depth");
    if(x===null||["string","boolean","number"].includes(typeof x)){requireThat(typeof x!=="number"||Number.isFinite(x),"transport-number");return Buffer.byteLength(JSON.stringify(x));}
    requireThat(x&&[Object.prototype,null,Array.prototype].includes(Object.getPrototypeOf(x))&&!Object.hasOwn(x,"toJSON")&&!visiting.has(x),"transport-json-object");
    if(cache.has(x))return cache.get(x);requireThat(++nodes<=NODE_MAX,"transport-nodes");visiting.add(x);const ks=Object.keys(x),arr=Array.isArray(x);if(arr)requireThat(ks.length===x.length,"transport-dense-array");let n=2+Math.max(0,ks.length-1);
    for(const k of ks){if(!arr)n+=Buffer.byteLength(JSON.stringify(k))+1;n+=count(x[k],depth+1);requireThat(Number.isSafeInteger(n)&&n<=EXPANDED_MAX,"transport-expanded-bytes");}visiting.delete(x);cache.set(x,n);return n;
  }
  return{expandedBytes:count(value,0),uniqueContainerNodes:nodes};
}
function encodeInput(input) {
  requireThat(isProof(input.understandingCompleteness)&&EU.isRoute(input.routeContract)&&Array.isArray(input.draftInputs)&&input.draftInputs.length===500,"transport-frozen-only");
  const documentKeys=input.draftInputs[0].documentKeys,knowledgeObjectKeys=input.draftInputs[0].knowledgeObjectKeys;keyList(documentKeys,874);keyList(knowledgeObjectKeys,500);
  const rows=input.draftInputs.map(d=>{requireThat(same(d.documentKeys,documentKeys)&&same(d.knowledgeObjectKeys,knowledgeObjectKeys),"transport-full-shared-descriptor");const{documentKeys:dk,knowledgeObjectKeys:kk,...rest}=d;return rest;});
  const m=metrics(input),envelope={version:TRANSPORT_VERSION,input:{...input,draftInputs:rows},documentKeys,knowledgeObjectKeys,expandedBytes:m.expandedBytes,expandedCanonicalHash:P.hash(input)};
  requireThat(Buffer.byteLength(JSON.stringify(envelope))<=ENCODED_MAX,"transport-encoded-bytes");return envelope;
}
function decodeInput(value) {
  requireThat(exact(value,["version","input","documentKeys","knowledgeObjectKeys","expandedBytes","expandedCanonicalHash"])&&value.version===TRANSPORT_VERSION&&Number.isSafeInteger(value.expandedBytes)&&value.expandedBytes>0&&value.expandedBytes<=EXPANDED_MAX&&sha(value.expandedCanonicalHash)&&Buffer.byteLength(JSON.stringify(value))<=ENCODED_MAX,"transport-envelope");
  KO.jsonValue(value);keyList(value.documentKeys,874);keyList(value.knowledgeObjectKeys,500);
  requireThat(value.input?.version===require("./synthetik-500-kosten-admission").ROUTE_INPUT_VERSION&&EU.isRoute(value.input.routeContract)&&isProof(value.input.understandingCompleteness)&&Array.isArray(value.input.draftInputs)&&value.input.draftInputs.length===500&&value.input.draftInputs.length*(value.documentKeys.length+value.knowledgeObjectKeys.length)<=REFERENCE_MAX,"transport-closed-reference-count");
  const rows=value.input.draftInputs.map(d=>{requireThat(exact(d,["owner","profileHash","context","requestBody","routeId","attemptLimit"]),"transport-draft-shape");return{...d,documentKeys:value.documentKeys,knowledgeObjectKeys:value.knowledgeObjectKeys};});
  const result={...value.input,draftInputs:rows},m=metrics(result);requireThat(m.expandedBytes===value.expandedBytes&&P.hash(result)===value.expandedCanonicalHash,"transport-lossless-expanded-hash");return result;
}
module.exports={VERSION,PROOF_VERSION,INVENTORY_VERSION,TRANSPORT_VERSION,MODE,COMMAND_VERSION,ENCODED_MAX,EXPANDED_MAX,NODE_MAX,DEPTH_MAX,REFERENCE_MAX,isProof,inventory,validateInputs,validatePrimary,makeProof,metrics,encodeInput,decodeInput};
