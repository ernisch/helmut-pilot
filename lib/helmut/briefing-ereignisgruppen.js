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

// Gleicher belegter Teilnahme-Kern; Reise, Fotos und Vorfeldstatement bleiben
// als vollständige, getrennt zugeordnete Mitglieder erhalten. Das erste KO
// trägt drei Quellen: keine Reduktion auf die geteilte amtliche Hauptquelle.
const ANKARA_TEILNAHME = Object.freeze({
  id: "ereignis-nato-gipfel-ankara-kanzler-teilnahme",
  mitglieder: Object.freeze([
    Object.freeze({ koId: "ko-vg-kanzler-20260707-d96896",
      vorgangId: "vg-kanzler-20260707-d96896",
      koHash: "b331ea98a119559d239f5472c0b2df3fb36aa2c97d5de9335b2d8be7dd7174b7",
      quellen: Object.freeze([
        Object.freeze({ quelleId: "rd-2ded9a718103cfca04fd87f2fad30e36e6fb4fc98729bd0e5ada8fe42c01b9a5",
          quelleHash: "9525de419dbe7a42e14861860fdf580b9864565de3f52931fd3214e7a6b33a21" }),
        Object.freeze({ quelleId: "rd-63a4df3327c1a804217aba53c43a6c9712910815db2f7c8817028599c2b31eee",
          quelleHash: "de7284d6f4044fb8f1d41f05729e6eadc7962ce23a1692204e05e5cb07a29836" }),
        Object.freeze({ quelleId: "rd-66259f7a0696a504d2108e20bb4bf2e56a6abfac012a526cff3b61023ff26f73",
          quelleHash: "555b72caa1a2085dc4d422ee5fde99b5ee3891e7e04acd32b9cb0b2c4cd78482" })
      ]) }),
    Object.freeze({ koId: "ko-vg-kanzler-20260708-20b7a7",
      vorgangId: "vg-kanzler-20260708-20b7a7",
      koHash: "ebcd41c7ba03e295d2c6acb146972694354f631feca74010c5ac1bedddb86874",
      quellen: Object.freeze([
        Object.freeze({ quelleId: "rd-66259f7a0696a504d2108e20bb4bf2e56a6abfac012a526cff3b61023ff26f73",
          quelleHash: "555b72caa1a2085dc4d422ee5fde99b5ee3891e7e04acd32b9cb0b2c4cd78482" })
      ]) })
  ])
});
// Beide Berichte beschreiben denselben belegten Interimsbeschluss zur
// bevorstehenden GKV-Abstimmung. Späterer Bundestagsbeschluss und Vermittlung
// bleiben eigene Vorgänge; Berichtstermine und mögliche Folgen bleiben im
// jeweiligen vollständigen Mitgliedstext mit dessen eigener Quelle erhalten.
const GKV_INTERIMSBESCHLUSS = Object.freeze({
  id: "ereignis-bverfg-gkv-abstimmung-interimsbeschluss",
  mitglieder: Object.freeze([
    Object.freeze({ koId: "ko-vg-verfassungsgericht-20260709-9c13ca",
      vorgangId: "vg-verfassungsgericht-20260709-9c13ca",
      koHash: "0d914e108399f6261628e8f0d03b983236f16dfbbacaa13b6bb8da507a2dad05",
      quelleId: "rd-9d214337bfce866a21b36336ba95542042372f325b7f5a62ceb341404c2429bf",
      quelleHash: "0a8eff48550fd9aca530457113108caab1577ceb5bc8998df809ad26387578a1" }),
    Object.freeze({ koId: "ko-vg-bundesverfassungsgericht-20260713-c425db",
      vorgangId: "vg-bundesverfassungsgericht-20260713-c425db",
      koHash: "a2b89b459d2752687af75bf238448adebebdd859809e1881f03e9bea6adbc8e2",
      quelleId: "rd-6ace2a35a26485e3a6467c07acaf32af81506663d6449f67f3b25c1fec85a3f7",
      quelleHash: "74719ee655cea688026b281e0ab64c7c67c2a7d1f546638b493b33f0dd16b1d3" })
  ])
});
const REGISTER = Object.freeze([BESCHLUSS, ANKARA_TEILNAHME, GKV_INTERIMSBESCHLUSS]);
const quellenPins = m => Array.isArray(m.quellen) ? m.quellen : [m];

// Exakte Hashbindung je Mitglied: das n-tv-Mitglied akzeptiert ausschließlich
// die beiden fest eingefrorenen Fassungen, jedes andere Mitglied genau seinen
// einzelnen festen Hash. Keine Toleranz für unbekannte Hashes.
function quelleHashAkzeptiert(m, quelleHash) {
  const erlaubt = Array.isArray(m.quelleHashes) ? m.quelleHashes : [m.quelleHash];
  return erlaubt.includes(quelleHash);
}

function planeGruppe(gruppe, { decisions, kosById, sourcesByVorgang }) {
  for (const m of gruppe.mitglieder) {
    const ko = kosById instanceof Map ? kosById.get(m.koId) : kosById?.[m.koId];
    const docs = sourcesByVorgang?.[m.vorgangId];
    const rows = decisions.filter(d => d?.knowledge_object_id === m.koId);
    if (!ko || ko.id !== m.koId || ko.vorgang_id !== m.vorgangId || hash(ko) !== m.koHash
      || !Array.isArray(docs) || docs.length !== quellenPins(m).length
      || new Set(docs.map(d => d?.id)).size !== docs.length
      || quellenPins(m).some(pin => {
        const doc = docs.find(d => d?.id === pin.quelleId);
        return !doc || !quelleHashAkzeptiert(pin, hash(doc));
      }) || rows.length !== 1
      || (rows[0].vorgang_id && rows[0].vorgang_id !== m.vorgangId)) return null;
  }
  return gruppe;
}

function planeAlle({ decisions = [], kosById = {}, sourcesByVorgang = {} } = {}) {
  if (!Array.isArray(decisions)) return [];
  return REGISTER.map(gruppe => planeGruppe(gruppe, { decisions, kosById, sourcesByVorgang })).filter(Boolean);
}

// Bestehender Einzelplan-Vertrag bleibt verfügbar. Der Briefing-Caller nutzt
// planeAlle, damit voneinander unabhängige gültige Gruppen erhalten bleiben.
function plane(input) {
  return planeAlle(input)[0] || null;
}

// Darstellungsadapter für einen bereits gebundenen Plan. Einzeltexte behalten
// ihre Quellenzuordnung; keine neue gemeinsame Prosa oder Sachabnahme.
function gruppiereEineAusgabe({ items, recommendations, plan, primaryVorgangId = null }) {
  if (!plan || !Array.isArray(items) || !Array.isArray(recommendations))
    return { items, recommendations };
  const members = plan.mitglieder;
  if (!Array.isArray(members) || members.length < 2
    || members.some(m => !m?.koId || !m.vorgangId
      || quellenPins(m).some(pin => !pin?.quelleId))
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
      quellenIds: quellenPins(members.find(m => m.koId === r[idKey])).map(pin => pin.quelleId) })) });
  return {
    items: items.filter(i => !ids.has(i.knowledgeObjectId) || i === representative)
      .map(i => i === representative ? annotate(i, memberItems, "knowledgeObjectId") : i),
    recommendations: recommendations.filter(r => !ids.has(r.knowledge_object_id)
      || r.knowledge_object_id === representative.knowledgeObjectId)
      .map(r => r.knowledge_object_id === representative.knowledgeObjectId
        ? annotate(r, memberRecommendations, "knowledge_object_id") : r)
  };
}

function gruppiereAusgaben({ items, recommendations, plan, plans, primaryVorgangId = null }) {
  const gruppen = Array.isArray(plans) ? plans : plan ? [plan] : [];
  return gruppen.reduce((out, gruppe) => gruppiereEineAusgabe({ ...out, plan: gruppe, primaryVorgangId }),
    { items, recommendations });
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

module.exports = { plane, planeAlle, gruppiereAusgaben, ausserhalbTageskopf };
