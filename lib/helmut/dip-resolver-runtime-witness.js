"use strict";

// Fixed, public-code probes only. No caller data, storage, profiles or sender.
// The early server route bypasses all account/session preparation.
const crypto = require("node:crypto");
const fs = require("node:fs");
const DIP = require("./dip");
const Q = require("./dip-quellfelder");
const V = require("./vorgang-identity");
const B = require("./berlin-artikelstand");
const { resolveVorgang } = require("./understanding");
const PATH = "/api/release/dip-resolver";
const VERSION = "helmut-dip-resolver-runtime-witness/1";
const FILES = Object.freeze({
  "dip-quellfelder": require.resolve("./dip-quellfelder"),
  "dip-vorgangsbezug": require.resolve("./dip-vorgangsbezug"),
  "vorgang-identity": require.resolve("./vorgang-identity")
});
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function berlinDocument(number, title, summary) {
  const url = `https://berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.${number}.php`;
  const stand = { version: 1, herkunft: B.HERKUNFT, url, titel: title, publikationstag: "2026-10-06",
    absatzHash: sha(summary), volltextHash: sha(summary + "\n") };
  stand.standHash = B.standHashFuer(stand);
  return { id: "rd-" + stand.standHash, content_hash: stand.standHash, title, summary,
    url, canonical_url: url, published_at: null, berlin_artikelstand: stand };
}
function document(id, title, refs) {
  const normalized = DIP.normalizeDrucksache({ id, titel: title, datum: "2026-10-01",
    drucksachetyp: "Gesetzentwurf", dokumentart: "Drucksache",
    urheber: [{ titel: "Bundesregierung" }],
    ...(refs === undefined ? {} : { vorgangsbezug: refs.map(ref => ({
      id: ref, titel: "Synthetische Fachaufgabe " + ref, vorgangstyp: "Gesetzgebung"
    })) }) });
  return { id: "runtime-fixture-" + id, title: normalized.title, url: normalized.url,
    canonical_url: normalized.url, source_id: "dip", document_type: normalized.type,
    published_at: "2026-10-01T00:00:00.000Z", dip_quellfelder: normalized.dipQuellfelder };
}
async function inspect() {
  const title = "Entwurf eines Gesetzes zur Modernisierung und Digitalisierung";
  const a = document(990201, title, [880001, 880002]);
  const b = document(990202, title, [880003]);
  const shared = document(990203, "Foerderung der Erwachsenenbildung", [880002]);
  const energyTitle = "Entwurf eines Gesetzes zur Änderung des Energiewirtschaftsgesetzes zur Gewährung eines Zuschusses zu den Übertragungsnetzkosten für die Jahre 2027 bis 2029";
  const energy = document(990204, energyTitle, [880004]);
  const followup = document(990205, energyTitle, [880004, 880005]);
  const budget = { id: "runtime-fixture-budget", title: "Entwurf eines Gesetzes über die Feststellung des Bundeshaushaltsplans für das Haushaltsjahr 2027 (Haushaltsgesetz 2027 - HG 2027) Finanzplan des Bundes 2026 bis 2030", published_at: "2026-10-01T00:00:00.000Z" };
  const yearA = { id: "runtime-fixture-year-a", title: "Debatte zur Eisenbahninfrastruktur 2026 und 2027", published_at: "2026-10-01T00:00:00.000Z" };
  const yearB = { id: "runtime-fixture-year-b", title: "Debatte zur Erwachsenenbildung 2026 und 2027", published_at: "2026-10-01T00:00:00.000Z" };
  const invalid = structuredClone(a); invalid.dip_quellfelder.vorgangsbezug[0].id = "880099";
  const existing = { id: "runtime-fixture-ko-budget", vorgang_id: "vg-runtime-budget",
    headline: budget.title, updated_at: "2026-10-01T00:00:00.000Z" };
  const reads = { prefixes: 0, exact: 0, links: 0 };
  const resolution = await resolveVorgang({ documents: [energy] }, {
    findVorgangCandidates: () => { reads.prefixes++; return [existing]; },
    getExistingStreng: () => { reads.exact++; return null; },
    listVorgangDocuments: () => { reads.links++; return [budget]; }
  });
  const v1 = Q.lese(document(990206, title));
  const paper = berlinDocument(1999904, "Auszeichnung: Berlin ist eine der recyclingpapierfreundlichsten Städte Deutschlands",
    "Berlin wurde 2026 fuer die Beschaffung von Recyclingpapier ausgezeichnet.");
  const nobel = berlinDocument(1999905, "Nobelpreis für Berliner Spitzenforscher – Erfolg für Berlin",
    "Berlin wurde 2026 fuer seine Forschung mit dem Nobelpreis ausgezeichnet.");
  const nobelFollowup = berlinDocument(1999906, "Berlin gratuliert Spitzenforscher zum Nobelpreis",
    "Der Spitzenforscher wurde mit dem Nobelpreis ausgezeichnet. Berlin gratuliert 2026.");
  const checks = {
    legacyV1Readable: v1?.version === 1 && !Object.hasOwn(v1, "vorgangsbezug"),
    completeV2References: Q.lese(a)?.vorgangsbezug.map(r => r.id).join(",") === "880001,880002",
    disjointReferencesSeparate: V.docsShareEvent(a, b).grund === "dip-vorgangsbezug-konflikt"
      && V.docsShareEvent(b, a).gleich === false && V.clusterRawDocuments([a, b]).length === 2,
    sharedReferenceNoPositiveShortcut: V.docsShareEvent(a, shared).gleich === false,
    trueFollowupPreserved: V.docsShareEvent(energy, followup).gleich === true
      && V.clusterRawDocuments([energy, followup]).length === 1,
    yearNotSubject: V.docsShareEvent(yearA, yearB).gleich === false,
    invalidMetadataRejected: Q.lese(invalid) === null,
    berlinContextNotSubject: V.docsShareEvent(paper, nobel).gleich === false
      && V.docsShareEvent(nobel, paper).gleich === false
      && V.docsShareEvent(nobel, nobelFollowup).gleich === true,
    resolverRejectsUnrelatedBudget: resolution.resolution === "neu"
      && resolution.spuren.length === 1 && resolution.spuren[0].gleich === false
      && reads.prefixes === 1 && reads.exact === 1 && reads.links === 1
  };
  const codeHashes = Object.fromEntries(Object.entries(FILES).map(([name, path]) => [name, sha(fs.readFileSync(path))]));
  return { checks, codeHashes, syntheticFixturesOnly: true,
    productionSourceVersionsInspected: false, all500InputAcceptance: false };
}
async function handleRequest(req, res, url, { jsonHeaders, env = process.env }) {
  const reply = (status, body, extra = {}) => {
    res.writeHead(status, jsonHeaders({ "Cache-Control": "no-store", ...extra }));
    res.end(JSON.stringify(body));
  };
  if (req.method !== "GET") return reply(405, { ok: false, reason: "only-get" }, { Allow: "GET" });
  if (url.pathname !== PATH || url.search !== "") return reply(400, { ok: false, reason: "fixed-path-only" });
  const commit = env.VERCEL_GIT_COMMIT_SHA, deploymentId = env.VERCEL_DEPLOYMENT_ID;
  if (env.VERCEL_ENV !== "production" || !/^[a-f0-9]{40}$/.test(commit || "")
    || !/^dpl_[A-Za-z0-9]{1,100}$/.test(deploymentId || ""))
    return reply(503, { ok: false, reason: "production-identity-unbound" });
  if (req.headers["x-helmut-production-commit"] !== commit)
    return reply(409, { ok: false, reason: "production-commit-mismatch" });
  try {
    const result = await inspect();
    const ok = Object.values(result.checks).every(value => value === true);
    return reply(ok ? 200 : 503, { ok, version: VERSION, commit, deploymentId, reinLesend: true,
      ...result, productionDataWrites: 0, paidModelCalls: 0 });
  } catch {
    return reply(503, { ok: false, reason: "bounded-code-probe-unavailable" });
  }
}
module.exports = { PATH, VERSION, inspect, handleRequest };
