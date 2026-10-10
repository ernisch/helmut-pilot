"use strict";

// Operator-reviewed publication withholding, independent of Understanding.
// Default EMPTY. No IDs, source contents, writes, models or automatic releases.
const crypto = require("node:crypto");
const ENV = "HELMUT_PUBLICATION_ELIGIBILITY_JSON";
const PROOF = Symbol("publication-eligibility-read");
const proofs = new WeakSet();
const sha = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
class PublicationEligibilityError extends Error {
  constructor(reason) {
    super("publication-eligibility-" + reason);
    this.name = "PublicationEligibilityError";
    this.code = "PUBLICATION_ELIGIBILITY_UNAVAILABLE";
    this.statusCode = 503;
  }
}
const fail = reason => { throw new PublicationEligibilityError(reason); };

function identity(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const u = new URL(value);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || u.port || !u.hostname.includes(".")) return null;
    // Transport variants identify the same publication; operator config remains HTTPS only.
    u.protocol = "https:";
    u.hash = "";
    u.hostname = u.hostname.replace(/^www\./, "");
    // Only standard tracking parameters, never article/issue identifiers.
    for (const k of [...u.searchParams.keys()])
      if (/^utm_/i.test(k) || /^(fbclid|gclid|igshid|mc_cid|mc_eid)$/i.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    return u.href;
  } catch { return null; }
}

function parse(raw) {
  if (raw === undefined || raw === "") return Object.freeze({ version: 1, holds: Object.freeze([]), hash: null });
  if (typeof raw !== "string" || raw.length > 32768) fail("configuration-invalid");
  let data;
  try { data = JSON.parse(raw); } catch { fail("configuration-invalid"); }
  if (!exact(data, ["version", "holds"]) || data.version !== 1 || !Array.isArray(data.holds)
    || data.holds.length > 20) fail("configuration-invalid");
  const seen = new Set();
  const holds = data.holds.map(h => {
    if (!exact(h, ["publicationUrl", "reason", "review"])
      || h.reason !== "unresolved-event-relation"
      || !exact(h.review, ["id", "receiptSHA256", "koSHA256", "sourceSHA256"])
      || typeof h.review.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(h.review.id)
      || [h.review.receiptSHA256, h.review.koSHA256, h.review.sourceSHA256]
        .some(v => typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v))) fail("configuration-invalid");
    const publicationUrl = identity(h.publicationUrl);
    if (!publicationUrl || new URL(h.publicationUrl).protocol !== "https:" || new URL(publicationUrl).pathname === "/" || new URL(h.publicationUrl).hash
      || seen.has(publicationUrl)) fail("configuration-invalid");
    seen.add(publicationUrl);
    return Object.freeze({ publicationUrl, reason: h.reason, review: Object.freeze({ ...h.review }) });
  }).sort((a,b) => a.publicationUrl.localeCompare(b.publicationUrl));
  return Object.freeze({ version: 1, holds: Object.freeze(holds), hash: holds.length ? sha({ version: 1, holds }) : null });
}
function current(env = process.env) { return parse(env[ENV]); }
function publicInfo(policy = current()) {
  return policy.hash ? { version: 1, hash: policy.hash, heldPublications: policy.holds.length } : null;
}
function sourceSafetyStandard(policy = current(), env = process.env) {
  return !policy.hash && ![env.HELMUT_SOURCE_BLOCKLIST, env.HELMUT_SOURCE_ALLOWLIST]
    .some(v => String(v || "").split(",").some(x => x.trim()));
}
function sourceStateInfo(policy = current(), env = process.env) {
  const legacySourceFiltersActive = !sourceSafetyStandard({ hash: null }, env);
  return policy.hash ? { sourceSafetyStandard: false, legacySourceFiltersActive }
    : legacySourceFiltersActive ? { sourceSafetyStandard: false } : {};
}
function assertSame(policy) { if (current().hash !== policy.hash) fail("policy-drift"); }
function urls(ko, docs) {
  return [ko?.best_source_url, ...(docs || []).flatMap(d => [d?.canonical_url, d?.url])]
    .map(identity).filter(Boolean);
}
function held(ko, docs = [], policy = current()) {
  if (!policy.hash) return false;
  const targets = new Set(policy.holds.map(h => h.publicationUrl));
  return urls(ko, docs).some(url => targets.has(url));
}
const koIdentity = ko => sha([ko.id, ko.vorgang_id, ko.best_source_url || null]);
function known(ko, policy = current()) {
  const p = ko?.[PROOF];
  return Boolean(p && proofs.has(p) && p.hash === policy.hash && p.koIdentity === koIdentity(ko));
}
function assertKnown(ko, policy = current()) {
  if (policy.hash && !known(ko, policy)) fail("candidate-unchecked");
}

// A complete, bounded link-identity read (not the existing first-40 source DTO).
// A matching linked publication withholds the entire KO; no silent text rewrite.
async function filterCandidates(storage, kos, policy = current()) {
  if (!policy.hash) return kos;
  if (!Array.isArray(kos) || kos.length > 500 || kos.some(k => !k || typeof k.id !== "string")
    || new Set(kos.map(k => k.id)).size !== kos.length) fail("candidates-invalid");
  if (typeof storage.getPublicationSourceIdentities !== "function") fail("source-reader-unavailable");
  let docs;
  try { docs = await storage.getPublicationSourceIdentities(kos); }
  catch (error) { if (error.code === "PUBLICATION_ELIGIBILITY_UNAVAILABLE") throw error; fail("source-read-unavailable"); }
  assertSame(policy);
  const eligible = [];
  for (const ko of kos) {
    if (!Array.isArray(docs[ko.id])) fail("source-read-incomplete");
    if (held(ko, docs[ko.id], policy)) continue;
    const proof = Object.freeze({ hash: policy.hash, koIdentity: koIdentity(ko) });
    proofs.add(proof);
    // Symbols do not alter JSON/native tuples, but survive ordinary object spreads.
    const output = { ...ko };
    Object.defineProperty(output, PROOF, { value: proof, enumerable: true, configurable: true });
    eligible.push(output);
  }
  return eligible;
}

// Refill the existing input window before ranking, rather than shrink its limit.
async function listCandidates(storage, options = {}, policy = current()) {
  if (!policy.hash) return storage.listKnowledgeObjects(options);
  const limit = Number(options.limit ?? 50);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) fail("candidate-limit-invalid");
  const out = [], seen = new Set();
  let offset = 0;
  while (out.length < limit) {
    if (offset >= 5000) fail("candidate-scan-limit");
    const width = limit - out.length;
    const rows = await storage.listKnowledgeObjects({ ...options, limit: width, offset, _signalError: true });
    if (rows?.__storeError || !Array.isArray(rows)) fail("candidate-read-unavailable");
    if (rows.some(k => !k || seen.has(k.id))) fail("candidate-window-drift");
    for (const k of rows) seen.add(k.id);
    out.push(...await filterCandidates(storage, rows, policy));
    offset += rows.length;
    if (!rows.length) break;
  }
  assertSame(policy);
  return out;
}
function bindCache(hash, policy = current()) {
  return policy.hash ? sha([hash, policy.hash]).slice(0, 32) : hash;
}
function assertRecorded(info, policy = current()) {
  const expected = publicInfo(policy);
  if (JSON.stringify(info ?? null) !== JSON.stringify(expected)) fail("stored-policy-stale");
}
function assertCaptureHeader(headers, env = process.env) {
  const policy = current(env), actual = headers?.["x-helmut-publication-eligibility-hash"];
  if ((actual || null) !== policy.hash) fail("capture-policy-mismatch");
  return policy;
}
async function filterMatchingResults(storage, rows, policy = current()) {
  if (!policy.hash) return rows;
  if (!Array.isArray(rows) || rows.length > 500 || rows.some(r => typeof r?.id !== "string")
    || new Set(rows.map(r => r.id)).size !== rows.length) fail("matching-response-invalid");
  const ids = rows.map(r => r.id), kos = await storage.listKnowledgeObjectsByIds(ids);
  if (!Array.isArray(kos) || kos.length !== ids.length || kos.some(k => !ids.includes(k.id)))
    fail("matching-source-incomplete");
  const allowed = new Set((await filterCandidates(storage, kos, policy)).map(k => k.id));
  return rows.filter(r => allowed.has(r.id));
}
module.exports = { ENV, PublicationEligibilityError, identity, parse, current, publicInfo, sourceSafetyStandard, sourceStateInfo,
  assertSame, held, known, assertKnown, filterCandidates, listCandidates, bindCache,
  assertRecorded, assertCaptureHeader, filterMatchingResults };
