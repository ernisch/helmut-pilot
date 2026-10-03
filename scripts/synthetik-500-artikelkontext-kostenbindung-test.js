"use strict";

// Nur die neue Runtime-/Offlineplan-/3-Naht. Ausschliesslich fiktive Daten und
// ausdrueckliche Speicher-/Modellattrappen; kein alter Lauf und kein Anbieter.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const P = require("../lib/helmut/synthetik-500-profile");
const I = require("../lib/helmut/synthetik-500-import");
const V = require("../lib/helmut/synthetik-500-vertrag");
const N = require("../lib/helmut/synthetik-500-nachweis");
const H = require("../lib/helmut/verstehen-artikelkontext-hash");
const VH = require("../lib/helmut/verstehen-vertrag");
const U = require("../lib/helmut/understanding");
const AK = require("../lib/helmut/artikelkontext");
const D = require("../lib/helmut/dedup");
const A = require("../lib/helmut/synthetik-500-kosten-admission");
const C = require("../lib/helmut/synthetik-500-kosten-plan");
const B = require("../lib/helmut/synthetik-500-executor");
const schema = require("../lib/helmut/understanding-schema").KNOWLEDGE_OBJECT_SCHEMA;
const paket = P.erzeuge(), clone = structuredClone;
const START = "2026-10-02T12:00:00.000Z", END = "2026-10-02T13:00:00.000Z", OBS = "2026-10-02T11:59:30.000Z";
const vorgangId = "vg-fiktive-konferenz";
const hash = text => crypto.createHash("sha256").update(text, "utf8").digest("hex");
const expectedArticle = (basis, prompt) => hash(JSON.stringify(["artikelkontext-v1", basis, prompt])).slice(0, 40);
const body = input => JSON.stringify({ model: "gpt-5-mini", input, max_output_tokens: 3000,
  reasoning: { effort: "minimal" }, text: { format: { type: "json_schema", name: "knowledge_object", schema, strict: false } } });
function sources() {
  const documents = ["BT", "BE", "BB"].map(scope => ({ scope, version: D.toRawDocumentRow({
    title: "Fiktive Verkehrskonferenz in Neustadt " + scope,
    summary: "Die Konferenz soll einen Austausch ueber Bahnstrecken ermoeglichen.",
    url: "https://example.org/fiktiv/konferenz-" + scope.toLowerCase(), sourceName: "Fiktive Quelle",
    publishedAt: "2026-09-14T16:00:00Z" }) }));
  for (const d of documents) d.id = d.version.id;
  const d = documents[0].version;
  const beleg = { version: 1, dokumentId: d.id, quellenHash: AK.quellenstandHash(d),
    artikelUrl: d.url, artikelTitel: d.title, herkunft: "manueller-originalvergleich",
    gelesenAm: "2026-09-17T12:30:00Z", absatzPosition: 2,
    text: "Die fiktive Konferenz endete am Montag mit einer gemeinsamen Erklaerung." };
  return { documents, beleg };
}
function bindings(e) { return C.sourceVersions(e.documents, e.knowledgeObjects, e.clusters, e.version); }
function rebuild(e) {
  const s = bindings(e);
  e.understandingInputs = s.clusters.filter(x => x.requiresUnderstanding).map(v => {
    const cluster = e.clusters.find(x => x.vorgangId === v.vorgangId && x.mode === v.mode && x.koVersion === v.koVersion);
    const selected = e.documents.filter(d => v.documentKeys.includes(P.hash({ id: d.id, scope: d.scope, versionHash: P.hash(d.version) })))
      .map(d => d.version);
    const prompt = U.buildUnderstandingPrompt({ documents: selected }, cluster.artikelkontextVersuch
      ? { artikelkontextVersuch: cluster.artikelkontextVersuch } : {});
    return { versionKey: v.key, contractInputHash: v.contractInputHash, requestBody: body(prompt),
      routeId: "fixture-route", attemptLimit: 1 };
  });
  e.understandingCompleteness = { version: C.PROOF_VERSION, documentInventoryHash: P.hash(s.documents),
    knowledgeObjectInventoryHash: P.hash(s.knowledgeObjects), clusterInventoryHash: P.hash(s.clusters),
    requiredVersionKeys: s.clusters.filter(x => x.requiresUnderstanding).map(x => x.key),
    evidence: { reference: "fictional-offline-fixture-only", sha256: P.hash("fictional-only") } };
  return e;
}
function fixture(version = C.ARTICLE_INPUT_VERSION, article = true, mode = "erst") {
  const { documents, beleg } = sources(), initial = C.sourceVersions(documents, [], null);
  const documentKeys = initial.documents.map(d => d.key);
  const cluster = { vorgangId, mode, koVersion: mode === "erst" ? null : 5,
    documentKeys, requiresUnderstanding: true, coverage: null };
  if (version === C.ARTICLE_INPUT_VERSION) cluster.artikelkontextVersuch = article ? beleg : null;
  return rebuild({ version, operationId: "synthetik500-artikelkontext-offline-20261002", runId: "nachlauf500-1790942400000",
    productionCommit: "c".repeat(40), runtimeManifestHash: P.hash("fictional-runtime"),
    window: { startUTC: START, endUTC: END }, documents, knowledgeObjects: [], clusters: [cluster],
    understandingInputs: null, understandingCompleteness: null,
    draftInputs: paket.profile.map(p => ({ owner: p.mandatsId, profileHash: P.hash(p), context: { fictional: p.mandatsId },
      documentKeys, knowledgeObjectKeys: [], requestBody: body("Fiktiver Lageinput " + p.mandatsId),
      routeId: "fixture-route", attemptLimit: 1 })), reviewMaxOutputTokens: 3000, paidRoutes: null, otherPaidInputs: [] });
}
async function runtime(e, override, seen = { reservations: [], requests: [], budgetReads: 0 }) {
  const cluster = { documents: e.documents.map(d => clone(d.version)) }, c = e.clusters[0];
  const vertrag = {
    reserviere: async input => { seen.reservations.push(clone(input)); return { erlaubt: true, fencing: 1 }; },
    modellstart: async () => ({ erlaubt: true }), schreibrecht: async () => ({ erlaubt: true }),
    speichere: async () => ({ gespeichert: true, pruefbar: true }), freigabe: async () => {},
    freigabeOhneAufruf: async () => {}, ausgangUnbekannt: async () => {},
    vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
    vormerkungErhoehe: async () => {}, vormerkungLoese: async () => {}
  };
  const deps = { canSpend: async () => { seen.budgetReads++; return { allowed: true }; },
    requestUnderstanding: async (prompt, input) => {
      seen.requests.push({ prompt, input: clone(input) });
      // Ungueltiger Ergebnisdatensatz beendet die Attrappe nach der neuen
      // Eingabenaht; keine alte KO-Qualitaets-/Persistenzsuite nachstellen.
      return null;
    }, save: async () => { throw Error("unexpected unguarded fixture save"); },
    saveSources: async () => {}, markFailed: async () => {}, modelName: () => "fictional-only", logSkip: () => {},
    findVorgangCandidates: async () => [], listVorgangDocuments: async () => [],
    readUpdateRetries: async () => ({}), writeUpdateRetries: async () => {} };
  const opts = { vorgangId, existing: null, vertrag,
    ...(c.artikelkontextVersuch ? { artikelkontextVersuch: clone(c.artikelkontextVersuch) } : {}), ...override };
  if (c.mode === "update") await U.understandUpdate(cluster, deps, { ...opts,
    existing: { id: "ko-fictional", ko_version: c.koVersion - 1 }, alleDocs: cluster.documents,
    neueDocs: [], neueAnker: [], spur: {} });
  else await U.understandOneCluster(cluster, deps, opts);
  return seen;
}
function executorFixture(e) {
  const rows = I.erzeugeZeilen(paket), snapshot = { beobachtetAm: OBS,
    profiles: [...rows.profileRows, { id: "article-v3-fictional-foreign", name: "Fiktive geschuetzte Identitaet" }],
    mandate_profiles: rows.mandateRows.map(p => ({ ...p, geloescht_at: null, updated_at: OBS })) };
  const profilvertrag = V.vorbereiten({ paketBytes: P.serialisiere(paket), snapshot, operationId: e.operationId,
    vorflugAm: OBS, startBis: "2026-10-02T12:04:30.000Z", endeAm: END, kosten: { tag: "2026-10-02", beobachtetAm: OBS,
      tageslimitMikroUsd: 6000000, auftragslimitMikroUsd: 7000000, tagVerbrauchtMikroUsd: 0, tagReserviertMikroUsd: 0,
      auftragVerbrauchtMikroUsd: 0, auftragReserviertMikroUsd: 0, restreserveMikroUsd: 6000000, laufreserveMikroUsd: 224000 } });
  const grund = Object.fromEntries(["belegHash", "technikHash", "fachHash", "productionHash", "ruheHash", "kostenHash",
    "landesversorgungHash", "snapshotHash", "authHash", "mainHash"].map(k => [k, P.hash("fictional-" + k)]));
  Object.assign(grund, { snapshotHash: P.hash(snapshot), productionCommit: e.productionCommit, deploymentId: "dpl_OFFLINEARTICLE" });
  const runtimeManifest = { version: "helmut-synthetik500-runtime-manifest/1", profilManifestHash: P.hash(profilvertrag),
    profilvertrag, startbelegeGrundlinie: grund };
  e.runtimeManifestHash = P.hash(runtimeManifest);
  const first = C.vorbereite(paket, e);
  e.paidRoutes = [{ id: "fixture-route", provider: "azure-openai", api: "responses", deploymentId: "fictional-only",
    model: "gpt-5-mini", disposition: "aufgenommen", admittedRequestIds: [...first.phasePositions.U, ...first.phasePositions.D]
      .map(x => x.requestId).sort(), priceContract: "existing-conservative-text", exclusionEvidence: null }];
  const kostenPlan = C.vorbereite(paket, e), sollplan = N.erzeugeSollplan(paket, { operationId: e.operationId,
    productionCommit: e.productionCommit, deploymentId: grund.deploymentId, runtimeManifestHash: e.runtimeManifestHash,
    definiertAm: "2026-10-02T11:58:00.000Z", startsAt: START, endsAt: END, briefingFensterStart: "2026-10-02T00:00:00.000Z" });
  return { version: B.REVIEW_INPUT_VERSION, snapshot, runtimeManifest, sollplan, kostenPlan,
    kostenSlot: clone(kostenPlan.admissionCandidate) };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
async function main() {
  const https = require("node:https"), http = require("node:http");
  const before = { fetch: global.fetch, https: https.request, http: http.request }; let sends = 0;
  const deny = () => { sends++; throw Error("offline-only-no-provider"); };
  global.fetch = https.request = http.request = deny;
  try {
    await test("Plain/1 und/2 behalten den originalen40er Vertrag und Descriptorhash", async () => {
      for (const version of [C.INPUT_VERSION, C.REVIEW_INPUT_VERSION]) {
        const e = fixture(version, false), v = bindings(e).clusters[0], raw = e.documents.map(d => d.version);
        const basis = VH.eingabeHash({ vorgangId, dokumente: raw, modus: "erst", koVersion: null });
        const descriptor = { vorgangId, mode: "erst", koVersion: null, documentKeys: e.clusters[0].documentKeys.slice().sort(), contractInputHash: basis };
        assert.deepEqual(v, { key: P.hash(descriptor), ...descriptor, requiresUnderstanding: true, coverage: null });
        const p = C.vorbereite(paket, e); assert.equal(p.phasePositions.U[0].contractInputHash, basis);
        assert.equal(p.version, version === C.INPUT_VERSION ? C.VERSION : C.REVIEW_VERSION);
        assert.equal(Object.hasOwn(v, "artikelkontextBinding"), false);
        assert.equal(C.pruefe(p, paket).planHash, p.planHash);
      }
      const e = fixture(C.INPUT_VERSION, false), seen = await runtime(e);
      assert.equal(seen.requests.length, 1); assert.equal(seen.requests[0].input.contractInputHash, e.understandingInputs[0].contractInputHash);
      assert.equal(seen.requests[0].prompt, JSON.parse(e.understandingInputs[0].requestBody).input);
      const explicitPlain = fixture(C.ARTICLE_INPUT_VERSION, false), plain = bindings(explicitPlain).clusters[0];
      const plainSeen = await runtime(explicitPlain);
      assert.equal(plain.artikelkontextBinding, null);
      assert.equal(plain.contractInputHash, e.understandingInputs[0].contractInputHash);
      assert.equal(plainSeen.requests[0].prompt, seen.requests[0].prompt);
      assert.equal(plainSeen.requests[0].input.contractInputHash, plain.contractInputHash);
    });
    for (const mode of ["erst", "update"]) await test("Artikel/3 bindet echten Runtimeprompt und40/64 im " + mode, async () => {
      const e = fixture(C.ARTICLE_INPUT_VERSION, true, mode), seen = await runtime(e), p = C.vorbereite(paket, e);
      assert.equal(seen.requests.length, 1); assert.equal(seen.reservations.length, 1);
      const prompt = seen.requests[0].prompt, basis = VH.eingabeHash({ vorgangId, dokumente: e.documents.map(d => d.version),
        modus: mode, koVersion: mode === "erst" ? null : 5 });
      const expected = expectedArticle(basis, prompt), planned = p.phasePositions.U[0];
      assert.equal(H.eingabeHash({ vorgangId, dokumente: e.documents.map(d => d.version), modus: mode,
        koVersion: mode === "erst" ? null : 5 }, prompt), expected);
      assert.equal(seen.reservations[0].eingabeHash, expected); assert.equal(seen.requests[0].input.contractInputHash, expected);
      assert.equal(planned.contractInputHash, expected); assert.notEqual(expected, basis);
      assert.equal(JSON.parse(e.understandingInputs[0].requestBody).input, prompt);
      assert.equal(planned.request.actualRequestHash, A.requestHash(body(prompt)));
      assert.equal(p.sourceVersions.clusters[0].artikelkontextBinding.fullPromptSha256, hash(prompt));
      assert.equal(planned.model, "gpt-5-mini"); assert.equal(planned.maxOutputTokens, 3000); assert.equal(planned.attemptLimit, 1);
      assert.equal(p.status.executionReady, false); assert.equal(p.status.paidGo, false);
    });
    await test("Ungueltige Belege scheitern im Plan und vor Runtime-CAS/Budget", async () => {
      for (const mutate of [b => b.quellenHash = "0".repeat(64), b => b.dokumentId = "foreign",
        b => b.artikelUrl = "https://example.org/foreign", b => b.text = "x".repeat(601)]) {
        const e = fixture(); mutate(e.clusters[0].artikelkontextVersuch);
        assert.throws(() => bindings(e), /artikelkontext-/);
        const seen = { reservations: [], requests: [], budgetReads: 0 };
        await assert.rejects(runtime(e, undefined, seen), /artikelkontext-/);
        assert.deepEqual(seen, { reservations: [], requests: [], budgetReads: 0 });
      }
      const e = fixture(); await assert.rejects(runtime(e, { artikelkontextVersuch: null }), /artikelkontext-/);
      assert.throws(() => H.eingabeHash({}, ""), /artikelkontext-prompt-fehlt/);
    });
    await test("Explizite/3-Form laesst keinen Kontext-Downgrade oder fehlendes Feld zu", () => {
      const e = fixture(); delete e.clusters[0].artikelkontextVersuch;
      assert.throws(() => C.vorbereite(paket, e), /cluster-version/);
      const old = fixture(C.REVIEW_INPUT_VERSION, false); old.clusters[0].artikelkontextVersuch = sources().beleg;
      assert.throws(() => C.vorbereite(paket, old), /cluster-version/);
      const p = C.vorbereite(paket, fixture(C.REVIEW_INPUT_VERSION, false)); p.version = C.ARTICLE_VERSION;
      assert.throws(() => C.pruefe(p, paket), /plan-drift/);
    });
    await test("Vollpromptdrift und bestehende Modell/Token/Attempt-Riegel bleiben hart", () => {
      for (const mutate of [e => { const p = JSON.parse(e.understandingInputs[0].requestBody); p.input += " Fremdtext";
        e.understandingInputs[0].requestBody = JSON.stringify(p); },
        e => { const p = JSON.parse(e.understandingInputs[0].requestBody); p.model = "gpt-4.1"; e.understandingInputs[0].requestBody = JSON.stringify(p); },
        e => { const p = JSON.parse(e.understandingInputs[0].requestBody); p.max_output_tokens = 2999; e.understandingInputs[0].requestBody = JSON.stringify(p); },
        e => e.understandingInputs[0].attemptLimit = 2]) {
        const e = fixture(); mutate(e); assert.throws(() => C.vorbereite(paket, e), /synthetik500-kostenplan-/);
      }
      const e = fixture(), old = bindings(e).clusters[0];
      e.clusters[0].artikelkontextVersuch.text = "Die fiktive Konferenz wurde ohne Erklaerung beendet.";
      assert.notEqual(bindings(e).clusters[0].contractInputHash, old.contractInputHash);
      assert.throws(() => C.vorbereite(paket, e), /endlichkeitsbeleg-binding/);
      const changed = bindings(e);
      e.understandingCompleteness.clusterInventoryHash = P.hash(changed.clusters);
      e.understandingCompleteness.requiredVersionKeys = changed.clusters.filter(x => x.requiresUnderstanding).map(x => x.key);
      assert.throws(() => C.vorbereite(paket, e), /u-version-binding/);
    });
    await test("Validierter/3-Plan wird unter denselben Offline-Executor/2-Gates vorbereitet", () => {
      const e = fixture(), input = executorFixture(e), prepared = B.vorbereite(paket, input);
      assert.equal(input.kostenPlan.version, C.ARTICLE_VERSION); assert.equal(input.kostenSlot.version, A.REVIEW_VERSION);
      assert.equal(prepared.kostenPlanHash, input.kostenPlan.planHash); assert.equal(prepared.schedule.length, 1001);
      assert.equal(B.pruefe(prepared, paket).startrecht, false); assert.equal(prepared.productionReady, false);
      const malformed = clone(input); malformed.kostenPlan.inputs.clusters[0].artikelkontextVersuch.quellenHash = "0".repeat(64);
      assert.throws(() => B.vorbereite(paket, malformed), /artikelkontext-/);
    });
    await test("Mehrere U-Versionen erhalten nur bei/3 den gebundenen zentralenPlan3", () => {
      const e = fixture(); e.clusters.push({ ...clone(e.clusters[0]), mode: "update", koVersion: 2 }); rebuild(e);
      const p = C.vorbereite(paket, e); assert.equal(p.completeness.U, 2);
      assert.equal(p.admissionCandidate.version, A.REVIEW_VERSION);
      assert.equal(p.admissionCandidate.plan.version, A.MULTI_U_PLAN_VERSION);
      assert.equal(p.admissionCandidate.plan.sourceBinding.inputHash, P.hash(e));
      assert.equal(p.completeness.multiVersionUAdmissionSupported, true);
      assert(!p.requiredActualInputs.includes("central-admission-multiple-u-versions-per-vorgang"));
    });
    assert.equal(sends, 0);
    console.log(JSON.stringify({ newGroups: passed, passed, providerCalls: sends, databaseCalls: 0, nativeCalls: 0,
      oldSuitesRun: 0, productionReady: false, paidGo: false }));
  } finally { global.fetch = before.fetch; https.request = before.https; http.request = before.http; }
}
if (require.main === module) main().catch(e => { console.error(e.stack); process.exitCode = 1; });
module.exports = { main };
