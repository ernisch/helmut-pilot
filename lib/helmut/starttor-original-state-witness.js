"use strict";

// Read-only bridge. Original data stays inside this backend; this is never an
// activation/production-command admission, a reserve, or a book repair.
const V = require("./realkohorte-500-vertrag");
const C = require("./synthetik-500-production-command");
const HASH = /^[a-f0-9]{64}$/;
const NONCE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const OID = /^[1-9][0-9]{0,9}$/;
const XMIN = /^(0|[1-9][0-9]{0,9})$/;
const VERSION = "helmut-original-state-witness/1";
const PACKET_VERSION = "helmut-original-state-witness-root-packet/1";
const RPC_VERSION = "helmut-original-state-native-witness/1";
const RPC = "helmut_starttor_original_state_witness";
const LIMITS = Object.freeze({ packet: 1048576, original: 4194304, total: 8388608,
  output: 8192, calls: 4, deadlineMs: 20000, freshnessMs: 60000, windowMs: 1200000 });

function demand(ok) { if (!ok) throw new Error("starttor-original-state-closed"); }
function object(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }
function exact(x, keys) {
  return object(x) && Object.keys(x).sort().join("\0") === [...keys].sort().join("\0");
}
function pin(p) {
  return exact(p, ["sha256", "bytes"]) && HASH.test(p.sha256)
    && Number.isSafeInteger(p.bytes) && p.bytes > 0;
}
function utc(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)
    && Number.isFinite(Date.parse(s)) && new Date(Date.parse(s)).toISOString() === s;
}
function fresh(s, now) { demand(utc(s) && now >= Date.parse(s) && now - Date.parse(s) <= LIMITS.freshnessMs); }
function head(h, id, revisionKey) {
  demand(exact(h, ["id", "tableOid", "xmin", "revisionPresent", "revision"])
    && h.id === id && OID.test(h.tableOid) && XMIN.test(h.xmin)
    && typeof h.revisionPresent === "boolean"
    && (!h.revisionPresent ? h.revision === null : h.revision === null ||
      (typeof h.revision === "string" && /^[a-fA-F0-9-]{36}$/.test(h.revision))));
  return { ...h, revisionKey };
}
function matchesHead(a, b) { return V.hash(a) === V.hash(b); }
function packet(p, request, runtime, now) {
  demand(exact(p, ["version", "operationNonce", "rootExecutor", "purpose", "admittedAtUTC", "expiresAtUTC",
    "runtime", "nativeAbi", "finance", "scopeEvidence", "authorization", "startschutz", "gates"])
    && p.version === PACKET_VERSION && p.operationNonce === request.nonce && p.rootExecutor === "/root"
    && p.purpose === "original-auth-main-js-native-hash-and-quiet-bridge" && V.hash(p) === request.packetHash);
  fresh(p.admittedAtUTC, now);
  demand(utc(p.expiresAtUTC) && Date.parse(p.expiresAtUTC) > now
    && Date.parse(p.expiresAtUTC) - Date.parse(p.admittedAtUTC) > 0
    && Date.parse(p.expiresAtUTC) - Date.parse(p.admittedAtUTC) <= LIMITS.windowMs);
  demand(exact(p.runtime, ["commit", "deploymentId", "immutableHost", "projectRef", "actualReviewPin"])
    && p.runtime.commit === runtime.commit && /^[a-f0-9]{40}$/.test(runtime.commit)
    && p.runtime.deploymentId === runtime.deploymentId && /^dpl_[a-zA-Z0-9]+$/.test(runtime.deploymentId)
    && p.runtime.immutableHost === runtime.immutableHost && /^[a-z0-9-]+\.vercel\.app$/.test(runtime.immutableHost)
    && p.runtime.projectRef === runtime.projectRef && /^[a-z0-9]{20}$/.test(runtime.projectRef)
    && runtime.production === true && pin(p.runtime.actualReviewPin));
  demand(exact(p.nativeAbi, ["version", "name", "oid", "bodySha256", "catalogNativeSha256", "serializerOid",
    "serializerBodySha256", "actor", "sessionActor", "jwtRole", "actualReviewPin"])
    && p.nativeAbi.version === RPC_VERSION && p.nativeAbi.name === RPC && OID.test(p.nativeAbi.oid)
    && OID.test(p.nativeAbi.serializerOid) && HASH.test(p.nativeAbi.bodySha256)
    && HASH.test(p.nativeAbi.catalogNativeSha256) && HASH.test(p.nativeAbi.serializerBodySha256)
    && [p.nativeAbi.actor, p.nativeAbi.sessionActor, p.nativeAbi.jwtRole].every(s =>
      typeof s === "string" && /^[a-zA-Z0-9_]{1,63}$/.test(s)) && pin(p.nativeAbi.actualReviewPin));
  demand(exact(p.finance, ["observedAtUTC", "authHead", "counterHead", "actualReviewPin"])
    && pin(p.finance.actualReviewPin));
  fresh(p.finance.observedAtUTC, now);
  head(p.finance.authHead, "main-auth", "_authStoreRevision");
  demand(exact(p.finance.counterHead, ["day", "scope", "tableOid", "xmin", "used"])
    && p.finance.counterHead.day === new Date(now).toISOString().slice(0, 10)
    && p.finance.counterHead.scope === "global" && OID.test(p.finance.counterHead.tableOid)
    && XMIN.test(p.finance.counterHead.xmin) && Number.isSafeInteger(p.finance.counterHead.used)
    && p.finance.counterHead.used >= 0);
  demand(exact(p.authorization, ["version", "specificOriginalInternalReadApproved", "originalUserEvidencePin"])
    && p.authorization.version === "helmut-original-state-internal-read-authorization/1"
    && p.authorization.specificOriginalInternalReadApproved === true && pin(p.authorization.originalUserEvidencePin));
  demand(exact(p.scopeEvidence, ["observedAtUTC", "paidRoutes", "workerAndManual", "github", "cronWindow", "endGuard"]));
  fresh(p.scopeEvidence.observedAtUTC, now);
  for (const key of ["paidRoutes", "workerAndManual", "github", "cronWindow", "endGuard"]) demand(pin(p.scopeEvidence[key]));
  demand(exact(p.gates, ["independentSourceReviewPin", "rootReadAdmissionPin", "specificReadAuthorizationAccepted",
    "installedNativeAbiAccepted", "finiteCurrentNativeCatalogAccepted", "completeFreshFinanceAccepted",
    "controlledPaidInflightScopeAccepted", "endGuardReadyAccepted"])
    && pin(p.gates.independentSourceReviewPin) && pin(p.gates.rootReadAdmissionPin)
    && ["specificReadAuthorizationAccepted", "installedNativeAbiAccepted", "finiteCurrentNativeCatalogAccepted",
      "completeFreshFinanceAccepted", "controlledPaidInflightScopeAccepted", "endGuardReadyAccepted"].every(k => p.gates[k] === true));
  demand(exact(p.startschutz, ["paketUtf8", "input", "quietReference", "financeReference"])
    && typeof p.startschutz.paketUtf8 === "string" && p.startschutz.paketUtf8.length > 0
    && exact(p.startschutz.input, ["manifest", "snapshot", "belege"])
    && p.startschutz.input.belege?.kosten?.auth === null);
  // Use the existing consumer's exact reference validator; no ad-hoc URL/pin format.
  const S = require("./synthetik-500-startschutz").erzeugeStartschutz(Buffer.from(p.startschutz.paketUtf8, "utf8"));
  S.referenz(p.startschutz.quietReference); S.referenz(p.startschutz.financeReference);
  return S;
}
function blobQuiet(auth, now) {
  demand(object(auth.pipelineLocks) && Array.isArray(auth.processRuns));
  let locks = 0, runs = 0;
  for (const x of Object.values(auth.pipelineLocks)) {
    demand(object(x) && Number.isSafeInteger(x.expiresAt) && x.expiresAt >= 0);
    if (x.expiresAt > now) locks++;
  }
  const terminal = new Set(["ok", "skipped", "success", "partial", "failed", "blocked", "rolled_back"]);
  for (const r of auth.processRuns) {
    demand(object(r) && (terminal.has(r.status) || r.status === "running"));
    if (r.status === "running") { demand(r.finishedAt === null); runs++; }
    else demand(typeof r.finishedAt === "string" && Number.isFinite(Date.parse(r.finishedAt)));
  }
  // No empty/missing-default substitute and no mutation of an old journal/slot.
  demand(!Object.hasOwn(auth, "synthetik500KostenAdmission") && !Object.hasOwn(auth, "synthetik500DispatchJournal"));
  return { locks, runs };
}
function nativeWitness(w, p, request, hashes, now) {
  demand(exact(w, ["version", "operationNonce", "packetHash", "nativeAsOfUTC", "snapshotContract", "signature",
    "abi", "catalogNativeSha256", "serializer", "auth", "main", "counter", "quiet"])
    && w.version === RPC_VERSION && w.operationNonce === request.nonce && w.packetHash === request.packetHash
    && w.snapshotContract === "single-stable-statement");
  fresh(w.nativeAsOfUTC, now);
  demand(exact(w.signature, ["actor", "sessionActor", "jwtRole", "database", "serverVersionNum", "readOnly", "isolation",
    "securityDefiner", "bypassRls"])
    && w.signature.actor === p.nativeAbi.actor && w.signature.sessionActor === p.nativeAbi.sessionActor
    && w.signature.jwtRole === p.nativeAbi.jwtRole && w.signature.database === "postgres"
    && w.signature.serverVersionNum === "170006" && w.signature.readOnly === "on"
    && ["read committed", "repeatable read", "serializable"].includes(w.signature.isolation)
    && w.signature.securityDefiner === false && w.signature.bypassRls === true);
  demand(exact(w.abi, ["oid", "bodySha256"]) && w.abi.oid === p.nativeAbi.oid
    && w.abi.bodySha256 === p.nativeAbi.bodySha256 && w.catalogNativeSha256 === p.nativeAbi.catalogNativeSha256
    && exact(w.serializer, ["oid", "bodySha256"]) && w.serializer.oid === p.nativeAbi.serializerOid
    && w.serializer.bodySha256 === p.nativeAbi.serializerBodySha256);
  for (const [key, id, revisionKey] of [["auth", "main-auth", "_authStoreRevision"], ["main", "main", "_storeRevision"]]) {
    demand(exact(w[key], ["head", "compactHash", "compactBytes"]) && w[key].compactHash === hashes[key]
      && Number.isSafeInteger(w[key].compactBytes) && w[key].compactBytes > 0 && w[key].compactBytes <= LIMITS.original);
    head(w[key].head, id, revisionKey);
  }
  demand(matchesHead(w.auth.head, p.finance.authHead) && matchesHead(w.counter, p.finance.counterHead));
  demand(exact(w.quiet, ["openJobs", "liveLocks", "liveLeases", "runningProcesses", "openOutbox", "unknownRows"])
    && Object.values(w.quiet).every(n => Number.isSafeInteger(n) && n === 0));
}

async function witness({ request, runtime, storage }) {
  const began = Date.now();
  demand(NONCE.test(request.nonce) && HASH.test(request.packetHash));
  const reader = storage.createStarttorOriginalStateReader({ projectRef: runtime.projectRef, deadlineMs: began + LIMITS.deadlineMs });
  const p = await reader.packet(request.nonce);
  const S = packet(p, request, runtime, Date.now());
  const auth = await reader.original("auth"), main = await reader.original("main");
  const hashes = { auth: V.hash(auth), main: V.hash(main) };
  const q = blobQuiet(auth, Date.now());
  demand(q.locks === 0 && q.runs === 0);
  const w = await reader.native({ nonce: request.nonce, packetHash: request.packetHash,
    authHash: hashes.auth, mainHash: hashes.main });
  nativeWitness(w, p, request, hashes, Date.now());
  const atNative = blobQuiet(auth, Date.parse(w.nativeAsOfUTC));
  demand(atNative.locks === 0 && atNative.runs === 0);
  // The original JavaScript objects and their native heads agree, including
  // missing-vs-null revision presence. No serializer equality is inferred from shape.
  for (const [key, data, revisionKey] of [["auth", auth, "_authStoreRevision"], ["main", main, "_storeRevision"]]) {
    demand(Object.hasOwn(data, revisionKey) === w[key].head.revisionPresent
      && (Object.hasOwn(data, revisionKey) ? data[revisionKey] : null) === w[key].head.revision);
  }
  const now = Date.now(); packet(p, request, runtime, now); fresh(w.nativeAsOfUTC, now);
  demand(now < began + LIMITS.deadlineMs && w.counter.day === new Date(now).toISOString().slice(0, 10));
  const input = p.startschutz.input;
  const ruhe = { beobachtetAm: w.nativeAsOfUTC, authHash: hashes.auth, mainHash: hashes.main,
    offeneJobs: w.quiet.openJobs, lebendeLocks: w.quiet.liveLocks + atNative.locks,
    lebendeLeases: w.quiet.liveLeases, laufendeProzesse: w.quiet.runningProcesses + atNative.runs,
    primaerbeleg: p.startschutz.quietReference };
  const kosten = { beobachtetAm: w.nativeAsOfUTC, auth, counter: w.counter.used,
    primaerbeleg: p.startschutz.financeReference };
  // Complete original kosten.auth goes to the existing full Startschutz consumer.
  // No book creation, reservation, claim, profile write or activation function.
  const result = S.pruefeVorbereitung({ ...input, belege: { ...input.belege, ruhe, kosten } },
    Buffer.from(p.startschutz.paketUtf8, "utf8"), now);
  return { ok: true, version: VERSION, reinLesend: true, operationNonce: request.nonce,
    commit: runtime.commit, deploymentId: runtime.deploymentId, immutableHost: runtime.immutableHost,
    observedAtUTC: w.nativeAsOfUTC, snapshotContract: w.snapshotContract, signature: w.signature,
    originalAuthHash: hashes.auth, originalMainHash: hashes.main,
    authHead: w.auth.head, mainHead: w.main.head, counterHeadHash: V.hash(w.counter),
    booksHash: C.booksHash(auth), controlHash: C.controlHash(auth), quiet: w.quiet,
    localStartschutzPassed: result.ok === true, startbelegeGrundlinie: result.startbelegeGrundlinie,
    nativeAbi: w.abi, nativeCatalogHash: w.catalogNativeSha256, serializer: w.serializer,
    readTransport: reader.inventory(), budgetPolicy: { dayMicroUsd: 6000000, totalMicroUsd: 7000000 },
    fundingAccepted: false, globalFutureQuietAccepted: false, activation: false, paid500: false };
}

async function handleRequest(request, response, url, { authorizeCron, jsonHeaders, storage, runtime }) {
  const headers = jsonHeaders({ "Cache-Control": "no-store, private", Pragma: "no-cache" });
  if (request.method !== "GET" || url.search !== "?modus=starttor-original-state") {
    response.writeHead(405, { ...headers, Allow: "GET" }); response.end('{"ok":false,"grund":"starttor-original-state-request"}'); return;
  }
  // This mode never accepts a query-string credential, even if a legacy mode does.
  if (typeof request.headers.authorization !== "string" || !request.headers.authorization.startsWith("Bearer ")) {
    response.writeHead(403, headers); response.end('{"ok":false,"grund":"starttor-original-state-auth"}'); return;
  }
  if (!authorizeCron(request, url, response)) return;
  try {
    const body = JSON.stringify(await witness({ request: { nonce: request.headers["x-helmut-witness-nonce"],
      packetHash: request.headers["x-helmut-witness-packet-hash"] }, runtime: runtime(), storage }));
    demand(Buffer.byteLength(body, "utf8") <= LIMITS.output);
    response.writeHead(200, headers); response.end(body);
  } catch (_) {
    // No endpoint, credential, original object, financial ticket or backend error text.
    response.writeHead(503, headers); response.end('{"ok":false,"grund":"starttor-original-state-closed"}');
  }
}
module.exports = { VERSION, PACKET_VERSION, RPC_VERSION, RPC, LIMITS, witness, handleRequest };
