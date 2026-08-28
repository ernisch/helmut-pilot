"use strict";

// Adversariale Offline-Pruefung des Retention-Metadatenwegs.
// Kein Netz, keine Datenbank und insbesondere keine echte Loeschung: alle Reads
// sind injizierte Attrappen; Executor-Proben enthalten entweder einen blockierten
// Plan oder einen gueltigen Plan mit exakt null Kandidaten.

const assert = require("node:assert/strict");
const storage = require("../lib/helmut/storage");
const { planRetention } = require("../lib/helmut/retention");

const NOW = Date.UTC(2026, 7, 28);
const isoDaysAgo = (days) => new Date(NOW - days * 86400000).toISOString();

function tableFromEndpoint(endpoint) {
  const match = String(endpoint).match(/^\/rest\/v1\/([^?]+)/);
  return match && match[1];
}

function pagedRequestFor(tables, calls = []) {
  return async (endpoint) => {
    calls.push(endpoint);
    const url = new URL(endpoint, "http://offline.invalid");
    const table = tableFromEndpoint(endpoint);
    assert.ok(Object.prototype.hasOwnProperty.call(tables, table), `unerwartete Tabelle ${table}`);
    const offset = Number(url.searchParams.get("offset"));
    const limit = Number(url.searchParams.get("limit"));
    return tables[table].slice(offset, offset + limit);
  };
}

async function main() {
  const rawRows = [
    { id: "rd-a", created_at: isoDaysAgo(400) },
    { id: "rd-b", created_at: isoDaysAgo(10) },
    { id: "rd-c", created_at: isoDaysAgo(5) }
  ];
  const koRows = [
    { id: "ko-a", created_at: isoDaysAgo(10) },
    { id: "ko-b", created_at: isoDaysAgo(5) }
  ];
  const linkRows = [
    { knowledge_object_id: "ko-a", raw_document_id: "rd-a" },
    { knowledge_object_id: "ko-b", raw_document_id: "rd-b" }
  ];

  const calls = [];
  const loaded = await storage.loadRetentionMetadata({
    ready: true,
    request: pagedRequestFor({
      raw_documents: rawRows,
      knowledge_objects: koRows,
      ko_document_links: linkRows
    }, calls),
    pageSize: 2,
    maxPages: 10
  });

  assert.equal(loaded.available, true);
  assert.equal(loaded.complete, true);
  assert.equal(loaded.metadataComplete, true);
  assert.equal(loaded.konsistenz, "sequenziell-rest-nicht-transaktional");
  assert.equal(loaded.dryRunOnly, true);
  assert.equal(loaded.executable, false);
  assert.deepEqual(loaded.rawDocuments, rawRows);
  assert.deepEqual(loaded.knowledgeObjects, koRows);
  assert.deepEqual(loaded.koDocumentLinks, linkRows);
  assert.equal(loaded.metadataCompleteness.rawDocuments.pages, 2);
  assert.equal(loaded.metadataCompleteness.rawDocuments.terminalPageRows, 1);
  assert.equal(loaded.metadataCompleteness.knowledgeObjects.pages, 2);
  assert.equal(loaded.metadataCompleteness.knowledgeObjects.terminalPageRows, 0);
  assert.ok(calls.some((endpoint) => endpoint.includes("raw_documents") && endpoint.includes("offset=2")));
  assert.ok(calls.some((endpoint) => endpoint.includes("ko_document_links") && endpoint.includes("offset=2")));
  assert.deepEqual(calls.map(tableFromEndpoint), [
    "raw_documents", "raw_documents",
    "knowledge_objects", "knowledge_objects",
    "ko_document_links", "ko_document_links"
  ]);

  const plan = planRetention({ nowMs: NOW, rawRetentionDays: 180, koRetentionDays: 365, ...loaded });
  assert.equal(plan.integrityOk, true);
  assert.equal(plan.executable, false);
  assert.equal(plan.dryRunOnly, true);
  assert.match(plan.executionBlockReason, /page-shift.*toctou/);
  assert.equal(plan.metadataComplete, true);
  assert.deepEqual(plan.rawToDelete, []); // rd-a ist an das behaltene ko-a gebunden.

  // Ein einziger Lesefehler (hier Links) macht den GESAMTEN Abzug unavailable.
  const readFailure = await storage.loadRetentionMetadata({
    ready: true,
    request: async (endpoint) => {
      if (endpoint.includes("ko_document_links")) throw new Error("synthetischer-link-lesefehler");
      return [];
    },
    pageSize: 2,
    maxPages: 10
  });
  assert.equal(readFailure.available, false);
  assert.equal(readFailure.complete, false);
  assert.equal(readFailure.metadataComplete, false);
  assert.equal(readFailure.integrityOk, false);
  assert.equal(readFailure.executable, false);
  assert.equal(Object.prototype.hasOwnProperty.call(readFailure, "koDocumentLinks"), false);

  // Nicht-Array-Antworten werden nicht still nach [] konvertiert.
  const invalidResponse = await storage.loadRetentionMetadata({
    ready: true,
    request: async (endpoint) => endpoint.includes("raw_documents") ? null : [],
    pageSize: 2,
    maxPages: 10
  });
  assert.equal(invalidResponse.available, false);
  assert.equal(invalidResponse.metadataComplete, false);

  // Ein hartes Sicherheitslimit nach einer vollen Seite ist KEIN
  // Vollstaendigkeitsbeleg und darf available:true nie erreichen.
  const pageLimit = await storage.loadRetentionMetadata({
    ready: true,
    request: pagedRequestFor({
      raw_documents: rawRows.slice(0, 2),
      knowledge_objects: [],
      ko_document_links: []
    }),
    pageSize: 2,
    maxPages: 1
  });
  assert.equal(pageLimit.available, false);
  assert.equal(pageLimit.complete, false);
  assert.equal(pageLimit.integrityOk, false);
  assert.equal(pageLimit.executable, false);
  assert.match(pageLimit.reason, /pagination-unvollstaendig-seitenlimit/);

  // Auch formal voll paginierte, aber inhaltlich unbrauchbare Metadaten sind
  // unavailable (kein falsches Gruen bei kaputtem Timestamp/Referenz).
  const invalidMetadata = await storage.loadRetentionMetadata({
    ready: true,
    request: pagedRequestFor({
      raw_documents: [{ id: "rd-kaputt", created_at: null }],
      knowledge_objects: [],
      ko_document_links: []
    }),
    pageSize: 2,
    maxPages: 10
  });
  assert.equal(invalidMetadata.available, false);
  assert.equal(invalidMetadata.metadataComplete, false);

  // Executor fail closed: weder integrityOk:false noch fehlendes integrityOk
  // darf mit execute-Flag einen Request ausloesen.
  let deleteCalls = 0;
  const noDeleteRequest = async () => { deleteCalls += 1; throw new Error("darf-nicht-aufgerufen-werden"); };
  const executeDeps = {
    env: { HELMUT_RETENTION_EXECUTE: "on" },
    ready: true,
    request: noDeleteRequest
  };
  const blocked = await storage.deleteRetention({
    contract: plan.contract,
    metadataComplete: false,
    integrityOk: false,
    executable: false,
    rawToDelete: ["rd-a"],
    koToDelete: []
  }, executeDeps);
  assert.equal(blocked.skipped, true);
  assert.equal(blocked.reason, "transaktionaler-retention-executor-nicht-implementiert");
  assert.equal(deleteCalls, 0);

  const missingIntegrity = await storage.deleteRetention({
    contract: plan.contract,
    metadataComplete: true,
    executable: true,
    rawToDelete: ["rd-a"],
    koToDelete: []
  }, executeDeps);
  assert.equal(missingIntegrity.skipped, true);
  assert.equal(missingIntegrity.reason, "transaktionaler-retention-executor-nicht-implementiert");
  assert.equal(deleteCalls, 0);

  // Selbst ein formal vollständiger REST-Plan MIT realem Löschkandidaten bleibt
  // dry-run-only. Damit belegt der Test die Page-Shift-/TOCTOU-Grenze an der
  // gefährlichen Kante und nicht nur an einem leeren Plan.
  const candidateLoaded = await storage.loadRetentionMetadata({
    ready: true,
    request: pagedRequestFor({
      raw_documents: [{ id: "rd-alt-ungebunden", created_at: isoDaysAgo(400) }],
      knowledge_objects: [],
      ko_document_links: []
    }),
    pageSize: 2,
    maxPages: 10
  });
  const candidatePlan = planRetention({ nowMs: NOW, ...candidateLoaded });
  assert.deepEqual(candidatePlan.rawToDelete, ["rd-alt-ungebunden"]);
  assert.equal(candidatePlan.integrityOk, true);
  assert.equal(candidatePlan.executable, false);
  const candidateResult = await storage.deleteRetention(candidatePlan, executeDeps);
  assert.equal(candidateResult.skipped, true);
  assert.equal(candidateResult.reason, "transaktionaler-retention-executor-nicht-implementiert");
  const forgedResult = await storage.deleteRetention({
    ...candidatePlan,
    executable: true,
    dryRunOnly: false,
    integrityOk: true,
    konsistenz: "angeblich-db-transaktional"
  }, executeDeps);
  assert.equal(forgedResult.skipped, true);
  assert.equal(forgedResult.reason, "transaktionaler-retention-executor-nicht-implementiert");
  assert.equal(deleteCalls, 0);

  console.log("PASS  Retention-Metadaten werden vollstaendig paginiert und validiert");
  console.log("PASS  Jeder Lese-/Seitenlimitfehler ergibt available:false");
  console.log("PASS  Sequenzieller Offset-REST-Abzug ist als nicht-transaktional markiert");
  console.log("PASS  Formal vollstaendiger REST-Plan mit Kandidat bleibt dry-run-only");
  console.log("PASS  Executor ist bis zu atomarem DB-Vertrag konstruktiv gesperrt (0 DELETE)");
}

main().catch((error) => {
  console.error("FAIL  Retention-Storage-Test:", error && error.stack || error);
  process.exitCode = 1;
});
