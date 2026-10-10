"use strict";

// Quellengeprüfte Ereignisgleichheit, keine Ähnlichkeitsheuristik und kein
// Daten-DELETE. Jede Abweichung lässt beide ursprünglichen Vorgänge bestehen.
const { hash } = require("./briefing-speicher");

// Zweite unabhängig quellengeprüfte Fassung derselben n-tv Quelle (Source19).
// Beide exakten Fassungen sind nur vorübergehend zulässig, weil der belegte
// Original-Veröffentlichungszeitpunkt korrigiert werden soll (07:00:00 -> 19:41:40
// UTC) und der exakte ursprüngliche 200-Zeichen-Kontext als summary ergänzt
// werden soll; es kommen keine neuen Ereignisfakten hinzu. Keine Verallgemeinerung des
// Registers, keine abgeleitete Quellengleichheit und keine zusätzlichen
// Versionen. Gilt ausschließlich für das n-tv-Mitglied; der Peer-Vorgang
// behält seinen einzelnen festen Hash unverändert.
const NTV_SOURCE19_QUELLE_HASHES = Object.freeze([
  "e040157a04435f2b467c9ef14057a42d56b2e118ab259111570ea28521605fa2",
  "97e4f458506e2f0758b01020eb5912a8c4255db03480777fc88633d8c4aa0080"
]);

const BESCHLUSS = Object.freeze({
  id: "ereignis-bt-haushaltsausschuss-meko-20260708",
  // Die unabhängige Volltextprüfung steht im Vorbereitungsbeleg. Der Adapter
  // lädt keine Originalartikel: Laufzeitbindung ausschließlich an die exakten
  // tatsächlichen KO-/Quellenprojektionen. Keine behauptete Live-Textprüfung.
  mitglieder: Object.freeze([
    Object.freeze({ koId: "ko-vg-haushaltsausschuss-20260708-6cf862",
      vorgangId: "vg-haushaltsausschuss-20260708-6cf862",
      koHash: "f9c6917a9adf3ee5d2cff460eb1b812859133174d607a8ea658b5bc8f5ca49ba",
      quelleId: "rd-e116a8d2e36564a8169d128853c3d2fcc3f2b5b45e4573a406db10058807e78d",
      quelleHash: "e040157a04435f2b467c9ef14057a42d56b2e118ab259111570ea28521605fa2",
      quelleHashes: NTV_SOURCE19_QUELLE_HASHES }),
    Object.freeze({ koId: "ko-vg-haushaltsausschuss-20260708-734bcf",
      vorgangId: "vg-haushaltsausschuss-20260708-734bcf",
      koHash: "17207dce899bbf928496eba0b700dc9e8a630b715918f446c7278a1137e676af",
      quelleId: "rd-5985aa691aebdd2401d9ed12963af89f9aa8ef56a4c04fca781448b73c3dcc32",
      quelleHash: "7ae2f9b4ad2f87b2d5016d22b878d01f73a12bdee018223a1a248ebf9e1d3c6f" })
  ])
});

// Exakte Hashbindung je Mitglied: das n-tv-Mitglied akzeptiert ausschließlich
// die beiden fest eingefrorenen Fassungen, jedes andere Mitglied genau seinen
// einzelnen festen Hash. Keine Toleranz für unbekannte Hashes.
function quelleHashAkzeptiert(m, quelleHash) {
  const erlaubt = Array.isArray(m.quelleHashes) ? m.quelleHashes : [m.quelleHash];
  return erlaubt.includes(quelleHash);
}

function plane({ decisions = [], kosById = {}, sourcesByVorgang = {} } = {}) {
  if (!Array.isArray(decisions)) return null;
  for (const m of BESCHLUSS.mitglieder) {
    const ko = kosById instanceof Map ? kosById.get(m.koId) : kosById?.[m.koId];
    const docs = sourcesByVorgang?.[m.vorgangId];
    const rows = decisions.filter(d => d?.knowledge_object_id === m.koId);
    if (!ko || ko.id !== m.koId || ko.vorgang_id !== m.vorgangId || hash(ko) !== m.koHash
      || !Array.isArray(docs) || docs.length !== 1 || docs[0]?.id !== m.quelleId
      || !quelleHashAkzeptiert(m, hash(docs[0])) || rows.length !== 1
      || (rows[0].vorgang_id && rows[0].vorgang_id !== m.vorgangId)) return null;
  }
  return BESCHLUSS;
}

// Darstellungsadapter für einen bereits gebundenen Plan. Einzeltexte behalten
// ihre Quellenzuordnung; keine neue gemeinsame Prosa oder Sachabnahme.
function gruppiereAusgaben({ items, recommendations, plan, primaryVorgangId = null }) {
  if (!plan || !Array.isArray(items) || !Array.isArray(recommendations))
    return { items, recommendations };
  const members = plan.mitglieder;
  if (!Array.isArray(members) || members.length < 2
    || members.some(m => !m?.koId || !m.vorgangId || !m.quelleId)
    || new Set(members.map(m => m.koId)).size !== members.length
    || new Set(members.map(m => m.vorgangId)).size !== members.length
    || members.some(m => items.filter(i => i?.knowledgeObjectId === m.koId && i.vorgangId === m.vorgangId).length !== 1
      || recommendations.filter(r => r?.knowledge_object_id === m.koId && r.vorgang_id === m.vorgangId).length !== 1))
    return { items, recommendations };
  const ids = new Set(members.map(m => m.koId));
  const representative = items.find(i => ids.has(i.knowledgeObjectId) && i.vorgangId === primaryVorgangId)
    || items.find(i => ids.has(i.knowledgeObjectId));
  const memberItems = items.filter(i => ids.has(i.knowledgeObjectId));
  const memberRecommendations = recommendations.filter(r => ids.has(r.knowledge_object_id));
  const annotate = (row, records, idKey) => ({ ...row, ereignisId: plan.id,
    ereignisMitglieder: records.map(r => ({ ...r,
      quellenIds: [members.find(m => m.koId === r[idKey]).quelleId] })) });
  return {
    items: items.filter(i => !ids.has(i.knowledgeObjectId) || i === representative)
      .map(i => i === representative ? annotate(i, memberItems, "knowledgeObjectId") : i),
    recommendations: recommendations.filter(r => !ids.has(r.knowledge_object_id)
      || r.knowledge_object_id === representative.knowledgeObjectId)
      .map(r => r.knowledge_object_id === representative.knowledgeObjectId
        ? annotate(r, memberRecommendations, "knowledge_object_id") : r)
  };
}

function ausserhalbTageskopf(plan, state = {}) {
  if (!plan) return null;
  // Tageskopf/zugehörige Vorgänge besitzen ihren eigenen Vertrag. Solange dort
  // eines der Mitglieder vorkommt, bleiben auch die Einzelkarten unangetastet.
  // Keine Abhängigkeit von Datum, Ignorieren-Schwelle oder alten Quellenzeiten.
  const sichtbar = new Set([state.primaryVorgangId, state.primaryItem?.id,
    state.primaryItem?.vorgangId, ...(state.relatedVorgangIds || []),
    ...(state.items || []).flatMap(i => [i?.id, i?.vorgangId, i?.vorgang_id])].filter(Boolean));
  return plan.mitglieder.some(m => sichtbar.has(m.vorgangId)) ? null : plan;
}

module.exports = { plane, gruppiereAusgaben, ausserhalbTageskopf };
