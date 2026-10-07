"use strict";
// Fully fictional, offline-only command assembly. Real contract validators;
// no provider, native SQL, production credentials or approval is supplied.
const P = require("../../lib/helmut/synthetik-500-profile");
const E = require("../../lib/helmut/synthetik-500-executor");
const A = require("../../lib/helmut/synthetik-500-kosten-admission");
const K = require("../../lib/helmut/synthetik-500-kosten-plan");
const KO = require("../../lib/helmut/knowledge-object-version");
const W = require("../../lib/helmut/synthetik-500-w-inventar");
const B = require("../../lib/helmut/briefing-aussagenbindung");
const L = require("../../lib/helmut/briefing-lagebindung");
const F = require("../synthetik-500-runtime-test");
module.exports = function fixture() {
  const f = F.fixture(), am = new Date(F.NOW).toISOString(), day = require("../../lib/helmut/briefing-frische").berlinTagKey(new Date(am));
  const documents = ["BT", "BE", "BB"].map((scope, i) => ({ id: "rd-fictional-" + scope.toLowerCase(), scope,
    version: { ...Object.fromEntries(W.SOURCE_VERSION_FIELDS.map(k => [k, null])), id: "rd-fictional-" + scope.toLowerCase(),
      title: "Fiktive Beratung eines Entwurfs " + i, summary: "Eine fiktive Beratung ist vorgesehen.", source_name: "Offlinefixture",
      url: "https://example.org/fictional/" + i, canonical_url: "https://example.org/fictional/" + i,
      published_at: new Date(F.NOW - 3600000).toISOString() } }));
  const kos = ["a", "b", "c"].map((id, i) => ({ ...Object.fromEntries(KO.VERSION_FIELDS.map(k => [k, null])),
    id: "ko-fictional-" + id, vorgang_id: "vg-fictional-" + id, ko_version: 1,
    headline: documents[i].version.title, was_ist_passiert: documents[i].version.summary,
    understanding_status: "complete", status: "ready", updated_at: am }));
  const sourcesByVorgang = Object.fromEntries(kos.map((ko, i) => [ko.vorgang_id, [documents[i].version]]));
  const e = { ...require("../synthetik-500-kosten-plan-test").emptyInputs(), version: K.ROUTE_INPUT_VERSION,
    operationId: f.manifest.operationId, productionCommit: F.COMMIT, runtimeManifestHash: P.hash(f.runtimeManifest),
    window: { startUTC: am, endUTC: f.manifest.endeAm }, documents,
    knowledgeObjects: kos.map(version => ({ vorgangId: version.vorgang_id, koVersion: 1, version })),
    clusters: [], understandingInputs: [], otherPaidInputs: [], paidRoutes: null };
  const versions = K.sourceVersions(e.documents, e.knowledgeObjects, null, e.version);
  e.clusters = kos.map((ko, i) => {
    const documentKeys = [versions.documents.find(x => x.id === documents[i].id).key];
    return { vorgangId: ko.vorgang_id, mode: "erst", koVersion: null, documentKeys, requiresUnderstanding: false,
      artikelkontextVersuch: null, coverage: { knowledgeObjectKey: versions.knowledgeObjects.find(x => x.vorgangId === ko.vorgang_id).key,
        documentKeys, contractInputHash: require("../../lib/helmut/verstehen-vertrag").eingabeHash({ vorgangId: ko.vorgang_id,
          modus: "erst", koVersion: null, dokumente: [{ id: documents[i].id }] }),
        evidence: { reference: "fictional-covered-cluster", sha256: P.hash("fictional") } } };
  });
  const source = K.sourceVersions(e.documents, e.knowledgeObjects, e.clusters, e.version);
  e.understandingCompleteness = { version: K.PROOF_VERSION, documentInventoryHash: P.hash(source.documents),
    knowledgeObjectInventoryHash: P.hash(source.knowledgeObjects), clusterInventoryHash: P.hash(source.clusters),
    requiredVersionKeys: [], evidence: { reference: "fictional-empty-U-coverage-not-production", sha256: P.hash("fictional") } };
  e.routeContract = { version: A.ROUTE_CONTRACT_VERSION, runtimeManifestHash: e.runtimeManifestHash,
    route: { provider: "azure", responsesUrl: "https://helmut-resource.openai.azure.com/openai/v1/responses", model: "gpt-5-mini",
      productionCommit: F.COMMIT, deploymentHost: "helmut-fictional-direct.vercel.app", deploymentId: f.runtimeManifest.startbelegeGrundlinie.deploymentId, authMode: "api-key" },
    management: { modelFamily: "gpt-5-mini", versionPolicy: "family-context-price-class-re-admit-on-contradiction", contextTokens: 400000,
      maxInputTokens: 272000, inputReserveTokens: 400000, maxOutputTokens: 128000, reasoningIncludedInOutput: true,
      inputUsdPerMillion: 0.5, outputUsdPerMillion: 4, validFromUTC: am, validUntilUTC: f.manifest.endeAm,
      evidencePins: Object.fromEntries(["rootAdmission", "management", "serviceContext", "price"].map(name => [name,
        { name: "fictional-" + name, sha256: P.hash(name), bytes: 1 }])) } };
  const drafts = f.paket.profile.map(p => {
    const identity = f.snapshot.profiles.find(x => x.id === p.mandatsId), row = f.snapshot.mandate_profiles.find(x => x.user_id === p.mandatsId);
    const profile = require("../../lib/helmut/storage").fromMandateProfileRow(identity, { ...row, aktiv: true });
    const briefing = { available: true, items: kos.map(k => ({ vorgangId: k.vorgang_id, title: k.headline, summary: k.was_ist_passiert })) };
    const eingabe = B.baueEingabe({ briefing, kos, sourcesByVorgang, profile, userId: profile.id, day });
    const urteil = { version: B.VERSION, eingabeHash: eingabe.eingabeHash, ursprungHash: eingabe.eingabeHash,
      ausgelasseneVorgaenge: [], aussagen: eingabe.aussagen.map(a => ({ ...a, sachlichGetragen: true, kontextGetragen: true,
        mandatsbezugGetragen: true, begruendung: "Fiktives Vertragsurteil, niemals Production Abnahme.",
        belege: [{ vorgangId: a.vorgangId, documentId: sourcesByVorgang[a.vorgangId][0].id,
          feld: "auszug", text: sourcesByVorgang[a.vorgangId][0].summary }] })) };
    const result = { briefing, eingabe, korrekturBasis: { kos, sourcesByVorgang } };
    urteil.gesamtpruefung = require("./briefing-fachurteil")(result, urteil);
    const briefingEingabe = L.baue(result, urteil);
    const descriptor = { owner: profile.id, profileHash: P.hash(p),
      context: { profileVersionHash: P.hash(profile), briefingEingabeHash: P.hash(briefingEingabe), briefingDatum: am },
      documentKeys: source.documents.map(x => x.key).sort(), knowledgeObjectKeys: source.knowledgeObjects.map(x => x.key).sort() };
    return { profile, descriptor, briefingEingabe, briefingDatum: am,
      sources: { documents: documents.map(x => x.version), knowledgeObjects: kos } };
  }).sort((a, b) => a.profile.id.localeCompare(b.profile.id));
  e.draftInputs = drafts.map(d => ({ ...d.descriptor,
    requestBody: JSON.stringify({ model: "gpt-5-mini", input: "Fiktiver noch nicht gesendeter Entwurf " + d.profile.id,
      max_output_tokens: 3000, reasoning: { effort: "low" } }), routeId: "offline-text", attemptLimit: 1 }));
  const prelim = K.vorbereite(f.paket, e);
  e.paidRoutes = [{ id: "offline-text", provider: "azure-openai", api: "responses", deploymentId: "fictional-gpt5-mini",
    model: "gpt-5-mini", disposition: "aufgenommen", admittedRequestIds: prelim.phasePositions.D.map(x => x.requestId).sort(),
    priceContract: "existing-conservative-text", exclusionEvidence: null }];
  const cost = K.vorbereite(f.paket, e), slot = cost.admissionCandidate;
  const sollplan = require("../../lib/helmut/synthetik-500-nachweis").erzeugeSollplan(f.paket, { operationId: e.operationId,
    productionCommit: F.COMMIT, deploymentId: e.routeContract.route.deploymentId, runtimeManifestHash: e.runtimeManifestHash,
    definiertAm: f.manifest.vorflugAm, startsAt: am, endsAt: f.manifest.endeAm, briefingFensterStart: new Date(F.NOW - 86400000).toISOString() });
  const executorInputs = { version: E.DIRECT_INPUT_VERSION, runtimeManifest: f.runtimeManifest,
    snapshot: f.snapshot, sollplan, kostenSlot: slot, kostenPlan: cost };
  return { package: f.paket, executorInputs, predecessors: [], drafts: drafts.map(d => ({
    intentId: slot.plan.intents.find(x => x.phase === "D" && x.owner === d.profile.id).id, ...d })) };
};
