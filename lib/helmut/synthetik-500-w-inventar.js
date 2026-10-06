"use strict";

// Inerte Originalbyte-/Capture-Naht. Kein Netz, Default-Dependency, Installer
// oder Herkunftsurteil. Native Vollstaendigkeit/Eligibility brauchen Abnahme.
const crypto = require("node:crypto");
const P = require("./synthetik-500-profile");
const C = require("./synthetik-500-kosten-plan");
const A = require("./synthetik-500-kosten-admission");
const KO = require("./knowledge-object-version");
const VERSION = "helmut-synthetik500-w-inventar/1";
const ROUTE_VERSION = "helmut-synthetik500-w-route-intake/1";
const PREFIX_FIELDS = Object.freeze(["id", "vorgang_id", "ko_version", "status", "understanding_status", "headline",
  "display_title", "created_at", "updated_at", "source_document_count", "decision_level", "political_level",
  "classification_confidence", "affected_geographies", "mentioned_geographies"]);
const CAS_FIELDS = Object.freeze(["vorgang_id", "eingabe_hash", "besitzer", "fencing", "lease_bis", "zustand",
  "ergebnis_fencing", "ergebnis_hash", "versuche", "ki_aufrufe", "letzter_grund", "created_at", "updated_at"]);
const MEMO_FIELDS = Object.freeze(["vorgang_id", "fehlversuche", "letzte_fencing", "created_at", "updated_at"]);
// Explizite endliche Source-Version aus dem angenommenen Quellenplan; die
// tatsächlichen SQL-Werte/Codecs dieser Projektion bleiben getrennt abzunehmen.
const SOURCE_VERSION_FIELDS = Object.freeze(["id", "title", "summary", "canonical_url", "url", "content_hash",
  "source_id", "source_name", "source_type", "document_type", "link_type", "confidence", "published_at",
  "retrieved_at", "created_at", "quellenauszug_beleg", "dip_quellfelder", "bundestag_artikelstand",
  "berlin_artikelstand", "brandenburg_artikelstand", "bundestag_abgerufen_at", "berlin_abgerufen_at", "brandenburg_abgerufen_at"]);
// Exakt storage.listKoDocuments: aliasierte Werte, kein raw/source_type/created_at.
const LINKED_SOURCE_FIELDS = Object.freeze(["id", "title", "summary", "quellenauszug_beleg", "dip_quellfelder",
  "bundestag_artikelstand", "bundestag_abgerufen_at", "berlin_artikelstand", "berlin_abgerufen_at",
  "brandenburg_artikelstand", "brandenburg_abgerufen_at", "published_at", "url", "canonical_url", "content_hash",
  "source_id", "source_name", "document_type", "link_type", "confidence"]);
const object = x => x !== null && typeof x === "object" && !Array.isArray(x)
  && [Object.prototype, null].includes(Object.getPrototypeOf(x));
const exact = (x, keys) => object(x) && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const sha = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const requireThat = (ok, code) => { if (!ok) throw new Error("synthetik500-w-inventar-" + code); };
const hashBytes = x => crypto.createHash("sha256").update(x, "utf8").digest("hex");
const same = (a, b) => P.hash(a) === P.hash(b);
const copy = structuredClone;
function reference(x) {
  requireThat(exact(x, ["reference", "sha256"]) && typeof x.reference === "string"
    && x.reference.trim() === x.reference && x.reference.length > 0 && x.reference.length <= 2000
    && sha(x.sha256), "belegreferenz");
}
function original(bytes) {
  requireThat(typeof bytes === "string" && Buffer.byteLength(bytes, "utf8") <= 32 * 1024 * 1024, "originalbytes");
  let value;
  try { value = JSON.parse(bytes); } catch { throw new Error("synthetik500-w-inventar-originaljson"); }
  // Eindeutige neue Capturefassung: keine doppelten JSON-Schluessel oder
  // unerkannte Zahlenrundung. Historische Dateien werden niemals umgeschrieben.
  KO.jsonValue(value);
  requireThat(JSON.stringify(value) === bytes, "original-kanonisch");
  return value;
}
function baueLeseAdapter(inventar) {
  KO.jsonValue(inventar);
  requireThat(exact(inventar, ["version", "projectionVersion", "projectionFieldsetHash", "documents", "linkedDocuments", "knowledgeObjects",
    "prefixes", "exacts", "links", "reservations", "memos", "decisions"])
    && inventar.version === VERSION && inventar.projectionVersion === KO.VERSION
    && inventar.projectionFieldsetHash === KO.FIELDSET_HASH, "format");
  const w = copy(inventar); // Keine spaetere Aenderung an Callerobjekten.
  for (const key of ["documents", "linkedDocuments", "knowledgeObjects", "prefixes", "exacts", "links", "reservations", "memos", "decisions"])
    requireThat(Array.isArray(w[key]) && w[key].length <= 10000, "endliche-liste");
  const kos = new Map(), byVorgang = new Map(), docs = new Map(), prefixes = new Map(), exacts = new Map(), links = new Map();
  for (const [linkedOnly, documents] of [[false, w.documents], [true, w.linkedDocuments]]) for (const x of documents) {
    // Nur Zusatzquellen ohne DIP- oder Parlamentsartikelstand koennen neutral
    // bleiben. Die Eingangsquellen behalten ihre verbindliche Mandatsebene.
    requireThat(exact(x, ["id", "scope", "version"]) && exact(x.version, SOURCE_VERSION_FIELDS)
      && (["BT", "BE", "BB"].includes(x.scope) || (linkedOnly && x.scope === null
        && ["dip_quellfelder", "bundestag_artikelstand", "berlin_artikelstand", "brandenburg_artikelstand"]
          .every(k => x.version[k] === null)))
      && typeof x.id === "string" && x.id.length > 0
      && x.id === x.version.id && !docs.has(x.id)
      && ["bundestag_abgerufen_at", "berlin_abgerufen_at", "brandenburg_abgerufen_at"]
        .every(k => same(x.version[k], x.version.retrieved_at)), "dokument");
    docs.set(x.id, x.version);
  }
  for (const x of w.knowledgeObjects) {
    KO.pruefe(x.version);
    requireThat(exact(x, ["vorgangId", "koVersion", "version"])
      && x.vorgangId === x.version.vorgang_id && x.koVersion === x.version.ko_version
      && typeof x.version.id === "string" && !kos.has(x.version.id) && !byVorgang.has(x.vorgangId), "ko-version");
    kos.set(x.version.id, x.version); byVorgang.set(x.vorgangId, x.version);
  }
  for (const x of w.prefixes) {
    reference(x.evidence);
    requireThat(exact(x, ["prefixes", "rows", "evidence"]) && Array.isArray(x.prefixes) && x.prefixes.length > 0
      && x.prefixes.every(p => typeof p === "string" && p.length > 0)
      && new Set(x.prefixes).size === x.prefixes.length && Array.isArray(x.rows)
      && x.rows.length <= 10000 && !prefixes.has(P.hash(x.prefixes)), "prefix-inventar");
    const seen = new Set();
    for (const row of x.rows) {
      const full = kos.get(row.id);
      requireThat(exact(row, PREFIX_FIELDS) && full && !seen.has(row.vorgang_id)
        && x.prefixes.some(p => row.vorgang_id.startsWith(p))
        && PREFIX_FIELDS.every(k => same(row[k], full[k])), "prefix-ko60-bindung");
      seen.add(row.vorgang_id);
    }
    requireThat(same([...kos.values()].filter(row => x.prefixes.some(p => row.vorgang_id.startsWith(p))).map(row => row.id).sort(),
      x.rows.map(row => row.id).sort()), "prefix-bekannte-ko-fehlen");
    for (let i = 1; i < x.rows.length; i++) requireThat(String(x.rows[i - 1].updated_at || "") >= String(x.rows[i].updated_at || ""), "prefix-reihenfolge");
    // Die aktuelle8er Runtimeauswahl kennt keinen ID-Tiebreaker.
    for (const boundary of [7, 8]) requireThat(x.rows.length <= boundary
      || x.rows[boundary - 1].updated_at !== x.rows[boundary].updated_at, "prefix-8-grenzgleichstand");
    prefixes.set(P.hash(x.prefixes), x);
  }
  for (const x of w.exacts) {
    reference(x.evidence);
    requireThat(exact(x, ["vorgangId", "knowledgeObjectId", "evidence"]) && typeof x.vorgangId === "string"
      && !exacts.has(x.vorgangId) && (x.knowledgeObjectId === null ? !byVorgang.has(x.vorgangId)
        : kos.get(x.knowledgeObjectId)?.vorgang_id === x.vorgangId), "exakt-oder-abwesenheit");
    exacts.set(x.vorgangId, x);
  }
  for (const x of w.links) {
    reference(x.evidence);
    requireThat(exact(x, ["knowledgeObjectId", "rows", "evidence"]) && kos.has(x.knowledgeObjectId)
      && !links.has(x.knowledgeObjectId) && Array.isArray(x.rows) && x.rows.length <= 40, "links-vollstaendig-40");
    const seen = new Set();
    for (const row of x.rows) {
      requireThat(exact(row, ["knowledge_object_id", "raw_document_id", "created_at"])
        && row.knowledge_object_id === x.knowledgeObjectId && docs.has(row.raw_document_id)
        && !seen.has(row.raw_document_id), "link-verwaist-oder-doppelt");
      seen.add(row.raw_document_id);
    }
    links.set(x.knowledgeObjectId, x);
  }
  const states = new Map();
  for (const [name, fields] of [["reservations", CAS_FIELDS], ["memos", MEMO_FIELDS]]) {
    const seen = new Set();
    for (const x of w[name]) {
      reference(x.evidence);
      requireThat(exact(x, ["vorgangId", "row", "evidence"]) && typeof x.vorgangId === "string"
        && !seen.has(x.vorgangId) && (x.row === null || exact(x.row, fields) && x.row.vorgang_id === x.vorgangId), "cas-memo-oder-abwesenheit");
      seen.add(x.vorgangId); states.set(name + "|" + x.vorgangId, x);
    }
  }
  function exactRead(vorgangId) {
    requireThat(exacts.has(vorgangId), "exakt-capture-fehlt");
    const x = exacts.get(vorgangId);
    return x.knowledgeObjectId === null ? null : copy(kos.get(x.knowledgeObjectId));
  }
  return { inventar: w, states,
    deps: Object.freeze({
      getExisting: exactRead, getExistingStreng: exactRead,
      findVorgangCandidates: (ps, limit) => {
        const x = prefixes.get(P.hash(ps));
        requireThat(x && limit === 8, "prefix-capture-fehlt");
        return copy(x.rows.slice(0, 8));
      },
      listVorgangDocuments: koId => {
        requireThat(links.has(koId), "link-capture-fehlt");
        return links.get(koId).rows.map(row => {
          const full = docs.get(row.raw_document_id);
          const dto = Object.fromEntries(LINKED_SOURCE_FIELDS.map(k => [k, copy(full[k])]));
          return require("./quellen-auszug").geleseneQuelle(dto);
        });
      }
    }) };
}
async function vorbereiteVersion(paket, inputBytes, inventoryBytes, evidence, inputVersion) {
  requireThat([C.ARTICLE_INPUT_VERSION, C.ROUTE_INPUT_VERSION].includes(inputVersion), "intake-version");
  reference(evidence);
  requireThat(evidence.sha256 === hashBytes(inventoryBytes), "originalinventar-hash");
  const input = original(inputBytes), adapter = baueLeseAdapter(original(inventoryBytes)), w = adapter.inventar;
  const mappedDocuments = w.documents.map(x => ({ ...x,
    version: require("./quellen-auszug").geleseneQuelle(copy(x.version)) }));
  requireThat(input.version === inputVersion && same(input.understandingCompleteness?.evidence, evidence)
    && same(input.documents, mappedDocuments) && same(input.knowledgeObjects, w.knowledgeObjects), "originalinput-w-bindung");
  const plan = C.vorbereite(paket, input), clusters = plan.sourceVersions.clusters;
  requireThat(clusters && w.decisions.length === clusters.length, "alle-cluster-entscheidungen");
  const seen = new Set();
  for (const x of w.decisions) {
    reference(x.eligibilityEvidence);
    const c = clusters.find(c => c.key === x.versionKey);
    requireThat(exact(x, ["versionKey", "cluster", "resolution", "eligibilityEvidence"]) && c && !seen.has(x.versionKey)
      && object(x.cluster) && Array.isArray(x.cluster.documents), "entscheidung");
    const sourceDocs = input.documents.filter(d => c.documentKeys.includes(P.hash({ id: d.id, scope: d.scope, versionHash: P.hash(d.version) }))).map(d => d.version);
    requireThat(same(x.cluster.documents, sourceDocs), "resolver-originalquellen");
    const resolution = await require("./understanding").resolveVorgang(copy(x.cluster), adapter.deps);
    requireThat(resolution.resolution !== "bestand-lesefehler" && same(resolution, x.resolution)
      && resolution.vorgangId === c.vorgangId && adapter.states.has("reservations|" + c.vorgangId)
      && adapter.states.has("memos|" + c.vorgangId), "resolver-oder-zustandsbeleg");
    // Auch die vom Resolver gebildete Konfliktkennung braucht einen exakten
    // KO60-Treffer oder gebundene Abwesenheit, niemals stillen freien Namensraum.
    const exactKo = await adapter.deps.getExistingStreng(c.vorgangId);
    requireThat(["neu", "konflikt-neue-kennung"].includes(resolution.resolution)
      ? exactKo === null : exactKo && (same(exactKo, resolution.existing)
        || exact(resolution.existing, PREFIX_FIELDS) && resolution.existing.id === exactKo.id
          && PREFIX_FIELDS.every(k => same(resolution.existing[k], exactKo[k]))), "konflikt-kennung-belegt");
    seen.add(x.versionKey);
  }
  return { version: VERSION, inputBytesSha256: hashBytes(inputBytes), inventoryBytesSha256: evidence.sha256,
    sourceBinding: plan.admissionCandidate?.plan.sourceBinding || null, plan,
    actualInputAcceptanceVerified: false, eligibilityAcceptanceVerified: false,
    primitiveAndCodecAcceptanceVerified: false, executionReady: false, installationAvailable: false };
}
async function vorbereite(paket, inputBytes, inventoryBytes, evidence) {
  return vorbereiteVersion(paket, inputBytes, inventoryBytes, evidence, C.ARTICLE_INPUT_VERSION);
}
async function vorbereiteRoute(paket, inputBytes, inventoryBytes, evidence, routeContractBytes, routeEvidence) {
  reference(routeEvidence);
  const route = original(routeContractBytes);
  requireThat(routeEvidence.sha256 === hashBytes(routeContractBytes), "originalroute-hash");
  const result = await vorbereiteVersion(paket, inputBytes, inventoryBytes, evidence, C.ROUTE_INPUT_VERSION);
  const input = result.plan.inputs;
  requireThat(result.plan.version === C.ROUTE_VERSION && input.routeContract !== null && same(input.routeContract, route)
    && typeof input.productionCommit === "string" && /^[a-f0-9]{40}$/.test(input.productionCommit)
    && sha(input.runtimeManifestHash), "originalinput4-route-bindung");
  A.pruefeRouteContract(route, { productionCommit: input.productionCommit, runtimeManifestHash: input.runtimeManifestHash,
    startsAtUTC: input.window.startUTC, endsAtUTC: input.window.endUTC });
  const inputHash = P.hash(input), routeContractHash = P.hash(route), slot = result.plan.admissionCandidate;
  if (slot !== null) requireThat(slot.version === A.ROUTE_VERSION && slot.plan.version === A.ROUTE_PLAN_VERSION
    && slot.plan.sourceBinding.inputVersion === C.ROUTE_INPUT_VERSION && slot.plan.sourceBinding.inputHash === inputHash
    && same(slot.plan.routeContract, route) && slot.planHash === P.hash(slot.plan), "route-admission-domane");
  // Missing actual D contexts keep the original incomplete cost plan. This
  // intake grants neither a U-only slot nor production/500 acceptance.
  return { ...result, version: ROUTE_VERSION, routeBinding: { inputVersion: C.ROUTE_INPUT_VERSION, inputHash,
    routeBytesSha256: hashBytes(routeContractBytes), routeContractHash, routeEvidence: copy(routeEvidence),
    productionCommit: input.productionCommit, runtimeManifestHash: input.runtimeManifestHash,
    admissionPlanHash: slot?.planHash || null } };
}
module.exports = { VERSION, ROUTE_VERSION, PREFIX_FIELDS, CAS_FIELDS, MEMO_FIELDS, SOURCE_VERSION_FIELDS, LINKED_SOURCE_FIELDS,
  baueLeseAdapter, vorbereite, vorbereiteRoute };
