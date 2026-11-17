"use strict";

// Quellenbereich nach scripts/bereichsauswahl.js; nur synthetische Metadaten.
// Bestehende Referenzerhaltung, keine Freigabe von Fristen oder Loeschvollzug.
const assert = require("node:assert/strict");
const { planRetention, retentionExecuteEnabled } = require("../lib/helmut/retention");
const nowMs = Date.UTC(2026, 10, 17);
const daysAgo = days => new Date(nowMs - days * 86400000).toISOString();
const raw = { id: "rd-linked", created_at: daysAgo(400) };
const oldKo = { id: "ko-old", created_at: daysAgo(400) };
const freshKo = { id: "ko-fresh", created_at: daysAgo(10) };
let passed = 0;

function check(name, knowledgeObjects, ids, blocked) {
  const input = { nowMs, rawDocuments: [raw], knowledgeObjects,
    koDocumentLinks: ids.map(knowledge_object_id => ({ raw_document_id: raw.id, knowledge_object_id })) };
  const before = JSON.stringify(input);
  const result = planRetention(input);
  assert.deepEqual(result.rawToDelete, blocked ? [] : [raw.id]);
  assert.deepEqual(result.rawBlockedByKeepReference, blocked ? [raw.id] : []);
  assert.equal(result.report.rawToDelete, blocked ? 0 : 1);
  assert.equal(result.integrityOk, true);
  assert.equal(JSON.stringify(input), before, "Planung darf die Eingaben nicht veraendern");
  // Unabhaengiger Vertragscheck: jede Referenz eines Kandidaten muss explizit
  // im KO-Loeschplan stehen, auch wenn sie in den KO-Metadaten nicht vorkommt.
  for (const id of result.rawToDelete) {
    assert(input.koDocumentLinks.filter(link => link.raw_document_id === id)
      .every(link => result.koToDelete.includes(link.knowledge_object_id)));
  }
  passed++;
  console.log("PASS " + name);
}

check("fehlender KO-Metadatensatz sperrt Original", [], ["ko-not-loaded"], true);
check("mitgeloeschtes KO hebt unbekannte weitere Referenz nicht auf", [oldKo], [oldKo.id, "ko-not-loaded"], true);
check("behaltenes KO sperrt Original weiterhin", [oldKo, freshKo], [oldKo.id, freshKo.id], true);
check("nur nachweislich mitgeloeschte KOs geben Original frei", [oldKo], [oldKo.id], false);
check("altes ungebundenes Original bleibt planbar", [], [], false);
for (const id of [undefined, null, ""]) {
  check("unvollstaendige Linkkennung " + String(id), [], [id], true);
  check("ungueltige alte KO-Kennung legitimiert keine Referenz " + String(id),
    [{ id, created_at: daysAgo(400) }], [id], true);
}
assert.equal(retentionExecuteEnabled({}), false);
console.log(`${passed}/${passed} Referenzgruppen gruen; Ausfuehrung default AUS.`);
