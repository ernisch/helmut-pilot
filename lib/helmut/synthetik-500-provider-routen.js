"use strict";

// Ausschliesslich lokale Inventur. Keine Runtime-Imports, Env-Lesung, Store-
// Abfrage, Aktivierung oder Providerfunktion. Ein Ausschlussbeleg ist hier eine
// Deklaration; seine wirksame Durchsetzung muss gesondert abgenommen werden.
const crypto = require("node:crypto");
const VERSION = "helmut-synthetik500-provider-routen/1";
const INPUT_VERSION = "helmut-synthetik500-provider-routen-deklarationen/1";
const SHA = /^[a-f0-9]{64}$/;
const KEYS = ["id", "provider", "api", "deploymentId", "model", "disposition",
  "admittedRequestIds", "priceContract", "exclusionEvidence"];
const forder = (ok, code) => { if (!ok) throw new Error("synthetik500-routen-" + code); };
const plain = x => x !== null && typeof x === "object" && Object.getPrototypeOf(x) === Object.prototype;
const exact = (x, keys) => plain(x) && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const text = x => typeof x === "string" && x.length > 0 && x.length <= 512 && !/[\u0000-\u001f]/.test(x);
function canonical(x) {
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  if (plain(x)) return "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}";
  forder(x === null || typeof x === "string" || typeof x === "boolean" || (typeof x === "number" && Number.isSafeInteger(x)), "hash-typ");
  return JSON.stringify(x);
}
const hash = x => crypto.createHash("sha256").update(canonical(x), "utf8").digest("hex");
const bytesHash = x => crypto.createHash("sha256").update(x).digest("hex");

// Wire-/Providerauftrittswege, nicht Sollausgaben oder eine Callanzahl. Der
// injizierte Shadow-Provider ueberlappt mit seinen konkreten Azure-Aufrufern.
const ROUTES = [
  ["azure-responses", "azure-openai", "responses", "lib/helmut/ai.js", "requestOpenAI -> https.request", "central-text"],
  ["openai-responses", "openai", "responses", "lib/helmut/ai.js", "requestOpenAI -> https.request", "central-text"],
  ["openai-fallback", "openai", "responses", "lib/helmut/ai.js", "HTTP400 -> requestOpenAI(FALLBACK_MODEL)", "central-text-fallback"],
  ["azure-embedding-backfill", "azure-openai", "embeddings", "lib/helmut/embedding-backfill.js", "azureEmbeddingProvider -> fetchImpl", "uncovered-direct"],
  ["injected-embedding-shadow", null, "embeddings", "lib/helmut/embedding-shadow-pipeline.js", "runShadowPipeline -> injected provider", "uncovered-injected"],
  ["azure-embedding-testlauf", "azure-openai", "embeddings", "scripts/embedding-testlauf.js", "azureProvider -> fetch", "uncovered-manual"],
  ["compatible-embedding-testlauf", null, "embeddings", "scripts/embedding-testlauf.js", "openaiKompatibelProvider -> fetch", "uncovered-manual"],
  ["azure-responses-z3b", "azure-openai", "responses", "scripts/skalierung-z3b-azure.js", "eineAnfrage -> fetchImpl", "uncovered-manual"]
].map(([id, provider, api, source, entry, coverage]) => ({ id, provider, api, source, entry, coverage }));

const REQUIRED = ["server.js", "api/index.js", "vercel.json", "package.json",
  "lib/helmut/ai.js", "lib/helmut/testkosten-budget.js", "lib/helmut/synthetik-500-kosten-admission.js",
  "lib/helmut/embedding-backfill.js", "lib/helmut/embedding-shadow-pipeline.js", "lib/helmut/embedding-contract.js",
  "lib/helmut/matching.js", "lib/helmut/understanding.js", "lib/helmut/lage.js", "lib/helmut/office.js",
  "lib/helmut/presentation-backfill.js", "lib/helmut/staff-backfill.js", "lib/helmut/prosa-einordnung-ai.js",
  "lib/helmut/b055-redaktion.js", "lib/helmut/verstehen-vier-speicher.js",
  "scripts/embedding-backfill.js", "scripts/embedding-testlauf.js", "scripts/skalierung-z3b-azure.js"];
const SELF = ["lib/helmut/synthetik-500-provider-routen.js", "scripts/synthetik-500-provider-routen.js",
  "scripts/synthetik-500-provider-routen-test.js"];
// Zeileninventur ist ein transparenter Suchbeleg, kein vollstaendiger JS-
// Callgraph. Kommentare/Treffer werden nicht als bezahlte Requests gezaehlt.
const MATCH = /requestOpenAI|requestStructuredJson|requestText|generateCommunicationDraft|generateHelmutAssessment|assessParliamentaryItem|extractKnowledgeObjectTags|enrichBriefingWithAI|generateLageBriefing|require\([^\n]*["'](?:\.\.?\/)+[^"']*\bai["']|runShadowPipeline|azureEmbeddingProvider|openaiKompatibelProvider|\/(?:responses|embeddings)\b|https\.request|fetchImpl\(|\bfetch\(/;
const CONTEXTS = [
  { id: "understanding", source: "lib/helmut/understanding.js", sender: "central-text", phases: ["U"], note: "Defaultdeps/Crons/Worker und manuelle Bedienwege; endliche U-Versionen fehlen." },
  { id: "lage-draft-review", source: "lib/helmut/lage.js", sender: "central-text", phases: ["D", "R"], note: "500 D/R brauchen echte Bindungen; R bleibt im aktuellen zentralen Vertrag gesperrt." },
  { id: "lage-nachlauf-redaktion", source: "lib/helmut/b055-redaktion.js", sender: "central-text", phases: [], note: "Weitere App-/Cronerneuerungen sind nicht allein durch 500 D/R aufgenommen." },
  { id: "office", source: "lib/helmut/office.js", sender: "central-text", phases: [], note: "/api/office/generate -> requestText; 1500 Default-Ausgabetokens sind keine Tarifaufnahme." },
  { id: "communication", source: "server.js", sender: "central-text", phases: [], note: "/api/communication/generate -> generateCommunicationDraft -> requestJson." },
  { id: "parliament", source: "server.js", sender: "central-text", phases: [], note: "/api/parliament/assess -> assessParliamentaryItem -> requestJson." },
  { id: "ko-enrichment", source: "server.js", sender: "central-text", phases: [], note: "Admin KO-Backfill/extractKnowledgeObjectTags; budgetExempt ersetzt keine Testkosten-Admission." },
  { id: "presentation-backfill", source: "lib/helmut/presentation-backfill.js", sender: "central-text", phases: [], note: "requestStructuredJson; separater Backfill braucht Aufnahme oder wirksamen Ausschluss." },
  { id: "staff-backfill", source: "lib/helmut/staff-backfill.js", sender: "central-text", phases: [], note: "requestStructuredJson; manuelle Workflow-Ausfuehrungen ebenfalls binden." },
  { id: "prosa", source: "lib/helmut/prosa-einordnung-ai.js", sender: "central-text", phases: [], note: "requestStructuredJson; kein Beweis aus Sollpositionen." },
  { id: "other-ai-exports", source: "lib/helmut/ai.js", sender: "central-text", phases: [], note: "refineBriefingItem/enrichBriefingWithAI/generateHelmutAssessment und requestText/Structured bleiben im Suchbeleg sichtbar." },
  { id: "cron-app-worker", source: "server.js", sender: "central-text", phases: [], note: "Cron pipeline/crawl/understanding/rueckstand/lage-briefing/nachlauf und Appwege; bestehende Flags/Rate-Limits beweisen keinen ruhigen Testzeitraum." },
  { id: "embedding-backfill", source: "scripts/embedding-backfill.js", sender: "uncovered-direct", phases: [], note: "Default Dry-Run/Freigabe/Schreibgate und eigener Lock sind kein zentraler Kosten-Slotguard." },
  { id: "manual-provider-tools", source: "scripts/embedding-testlauf.js", sender: "uncovered-manual", phases: [], note: "Manuelle Opt-ins sind kein wirksamer Ausschluss bei gleichzeitig installiertem synthetischem Planslot." }
];

function sourceInventory(files) {
  forder(Array.isArray(files) && files.length > 0, "source-liste");
  const seen = new Set(), refs = [], matches = [];
  for (const f of files) {
    forder(exact(f, ["path", "bytes"]) && text(f.path) && !f.path.startsWith("/") && !f.path.split("/").includes("..")
      && Buffer.isBuffer(f.bytes) && !seen.has(f.path), "source-format");
    seen.add(f.path);
    if (SELF.includes(f.path)) continue;
    refs.push({ path: f.path, bytes: f.bytes.length, sha256: bytesHash(f.bytes) });
    f.bytes.toString("utf8").split("\n").forEach((line, index) => {
      if (MATCH.test(line)) matches.push({ path: f.path, line: index + 1, lineSha256: bytesHash(Buffer.from(line, "utf8")) });
    });
  }
  forder(REQUIRED.every(p => seen.has(p)), "source-unvollstaendig");
  refs.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  matches.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line);
  return { sourceRefs: refs, matches, sourceGraphHash: hash({ sourceRefs: refs, matches }),
    scope: "alle .js in lib/scripts/api, server.js, alle .yml/.yaml in .github/workflows, vercel.json, package.json; einschliesslich Tests/Fixtures, ohne diese drei neuen Planerdateien",
    limitation: "Lexikalisches eingefrorenes Frontiereninventar plus manuell zugeordnete Sender; keine Laufzeit- oder transitive JS-Callgraph-Abnahme." };
}

function pruefeDeklarationen(input, sourceGraphHash) {
  forder(exact(input, ["version", "sourceGraphHash", "paidRoutes"]) && input.version === INPUT_VERSION
    && input.sourceGraphHash === sourceGraphHash && SHA.test(sourceGraphHash) && Array.isArray(input.paidRoutes), "deklarationen-bindung");
  forder(input.paidRoutes.length === ROUTES.length, "routen-unvollstaendig");
  const used = new Set();
  const rows = input.paidRoutes.map(r => {
    const route = ROUTES.find(x => x.id === r?.id);
    forder(exact(r, KEYS) && route && !used.has(r.id), "route-format"); used.add(r.id);
    forder((r.provider === null || text(r.provider)) && (r.deploymentId === null || text(r.deploymentId))
      && (r.model === null || text(r.model)) && r.api === route.api
      && (route.provider === null || r.provider === null || r.provider === route.provider), "provider-bindung");
    if (r.id === "openai-fallback") forder(r.model === null || r.model === "gpt-4.1", "fallback-modell");
    forder(["aufgenommen", "ausgeschlossen", "unbekannt"].includes(r.disposition)
      && Array.isArray(r.admittedRequestIds) && r.admittedRequestIds.every(x => typeof x === "string" && SHA.test(x))
      && new Set(r.admittedRequestIds).size === r.admittedRequestIds.length, "disposition-request");
    forder(r.priceContract === null || (r.priceContract === "existing-conservative-text" && r.api === "responses" && r.model === "gpt-5-mini"), "tarif-bindung");
    if (r.disposition === "aufgenommen") {
      forder(r.provider !== null && r.model !== null && r.admittedRequestIds.length > 0
        && r.priceContract === "existing-conservative-text" && r.exclusionEvidence === null, "aufnahme-ungebunden");
      forder(route.coverage.startsWith("central-text"), "aufnahme-central-fehlt");
    } else if (r.disposition === "ausgeschlossen") {
      forder(r.admittedRequestIds.length === 0 && exact(r.exclusionEvidence, ["reference", "sha256"])
        && text(r.exclusionEvidence.reference) && typeof r.exclusionEvidence.sha256 === "string"
        && SHA.test(r.exclusionEvidence.sha256), "ausschluss-beleg");
    } else forder(r.admittedRequestIds.length === 0 && r.exclusionEvidence === null, "unbekannt-keine-aufnahme");
    return JSON.parse(JSON.stringify(r));
  });
  rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return rows;
}

function vorbereite(files, input = null) {
  const source = sourceInventory(files);
  const paidRoutes = input === null ? ROUTES.map(r => ({ id: r.id, provider: r.provider, api: r.api,
    deploymentId: null, model: null, disposition: "unbekannt", admittedRequestIds: [], priceContract: null, exclusionEvidence: null }))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : pruefeDeklarationen(input, source.sourceGraphHash);
  const result = { version: VERSION, source, definitions: ROUTES, callerContexts: CONTEXTS, paidRoutes,
    actualProviderAccount: null, enforcementProof: null,
    localFeatureVectors: { paid: false, source: "lib/helmut/matching.js", contract: "lib/helmut/embedding-contract.js",
      note: "feature_vector ist der bestehende deterministische lokale 256-D-Merkmalsvektor; keine bezahlte semantische Embedding-Anfrage." },
    status: { localPreparation: true, declarationsComplete: paidRoutes.every(r => r.disposition !== "unbekannt"),
      runtimeEnforcement: false, completePaidRouteCoverage: false, wholeRunMaximumCostMicroUsd: null,
      executionReady: false, paidGo: false, budgetGo: false, providerCalls: 0, activationAvailable: false },
    remainingGuards: ["actual-U-D-R-body-input-route-bindings", "confirmed-D-to-R-receipt", "effective-exclusion-of-all-other-callers",
      "central-slot-install-remove-CAS-and-no-inflight-call-race", "embedding-and-manual-bypass-block-before-send",
      "actual-provider-account-deployment-and-price-or-reviewed-conservative-text-reserve", "fresh-runtime-auth-commit-window-proof"],
    centralIntegrationContract: {
      owner: "separater alleiniger Zentralwriter; dieser Planer installiert nichts",
      embeddingBeforeSend: "azureEmbeddingProvider vor fetchImpl und runShadowPipeline vor injected provider: echter atomarer Slot-/Intent-/Geldentscheid fuer denselben unveraenderten Body; unbekannt/malformed/installed-without-embedding-contract STOP vor HTTP.",
      embeddingScope: "Der vorhandene Admission-v1-Vertrag kennt nur gpt-5-mini U/D/R, keine Embeddingphase. Eingabebatch, Rezept/Modell/Dim/Deployment/API, exakte Payloadhashes, Tokenobergrenze, Tarif, Attempt1 und Ende muessen neu unabhaengig abgenommen werden oder der Weg wirksam ausgeschlossen sein.",
      lifecycle: "Eine bestaetigte Abwesenheitslesung reicht nicht: Slotinstallation nach dieser Lesung vor HTTP ist ein Race. Installation/Entfernung muss CAS+Runtime+Commit+Ruhe+bereits laufende Calls binden. Kein Caller-Bool, Flag oder lokaler Ausschlussbeleg loest das.",
      manualBypasses: "embedding-testlauf Azure/kompatibel und skalierung-z3b-azure umgehen den zentralen Sender ebenfalls; waehrend des konkreten Fensters unabhaengig wirksam ausschliessen oder in denselben atomaren Vertrag integrieren.",
      fallback: "OpenAI HTTP400-Fallback ist ein weiterer Providerrequest mit gpt-4.1 und geaendertem Payload. Keine U/D/R-Aufnahme aus der Erstrequest-Reserve ableiten; Preis null bis eigener Vertrag oder wirksamer Ausschluss.",
      preservation: "Keine Budget-, Modell-, Qualitaets-, Attempt-, zentrale Schema- oder bestehende Prodpfad-Aenderung durch dieses Paket." }
  };
  return { ...result, inventoryHash: hash(result) };
}
function pruefeInventar(inventory, files) {
  forder(plain(inventory) && inventory.version === VERSION, "inventar-format");
  const rebuilt = vorbereite(files, { version: INPUT_VERSION, sourceGraphHash: inventory.source?.sourceGraphHash, paidRoutes: inventory.paidRoutes });
  forder(canonical(inventory) === canonical(rebuilt), "inventar-drift");
  return true;
}

module.exports = { VERSION, INPUT_VERSION, ROUTES, REQUIRED, SELF, hash, bytesHash,
  sourceInventory, pruefeDeklarationen, vorbereite, pruefeInventar };
