"use strict";

// Zwei separat entschiedene Teilmitgliedschaften, keine Gleichsetzung ganzer KOs.
// Laufzeitbindung an komplette KO59-/Source19-Projektionen. Die Originalpruefung
// bleibt im Betreiberbeleg; hier gibt es weder Artikelabrufe noch ein Fach-PASS.
const { hash } = require("./briefing-speicher");
const REGISTER = [
  {
    "id": "ereignis-br-grundsicherung-zustimmung-teilmitglied",
    "art": "br",
    "mitglieder": [
      {
        "koId": "ko-vg-grundsicherung-20260623-c6ff5a",
        "vorgangId": "vg-grundsicherung-20260623-c6ff5a",
        "koHash": "a00d89f7b13f45b78e8ad02a606a9e1d905482f4806d573419e166474dac6c1f",
        "title": "Bundesrat billigt Reform der Grundsicherung",
        "summary": "Der Bundesrat hat der Reform der Grundsicherung (Bürgergeld) zugestimmt. Damit ist ein wichtiger legislativer Schritt für die Umsetzung der Änderungen auf Bundesebene erfolgt.",
        "quellen": [
          {
            "quelleId": "rd-d97f522e02339bd93fb2e99030e44078f9a6431737767a5b80e40685eddbf865",
            "quelleHash": "3a5dbe227d36f559c96431c6d58915be5f13f491e990dacf96cf53b78c4ca27f"
          }
        ]
      },
      {
        "koId": "ko-vg-grundsicherung-20251023-60c4ad",
        "vorgangId": "vg-grundsicherung-20251023-60c4ad",
        "koHash": "7dc58ef3a187110a425e7b15c694ce8fc66089fe7d21e96c1ae2bed644a33de9",
        "title": "Neue Grundsicherung ersetzt Bürgergeld: Gesetzgebungsstand und Beschlüsse",
        "summary": "Quellen melden, dass ein nicht-offizieller Referenten-Vorentwurf zum 13. SGB II-Änderungsgesetz vorliegt, der Bundestag bereits Beschlüsse zum Nachfolger des Bürgergelds gefasst hat und der Bundesrat die neue Grundsicherung gebilligt hat.",
        "quellen": [
          {
            "quelleId": "rd-7c0f3286f7d99a6405185f9bbaceb449c321ce373e8b3e1edfe2175c9a4c4117",
            "quelleHash": "8e2970a2a3bca1abe56dc12c737ef5642c1ac39c735ecdcf4e5f954f3b3ccdd1"
          },
          {
            "quelleId": "rd-8edbf49a50c945a3c33f5e5610b949da7c3f4b3c4e45cbbc9082d6694fe2d0d9",
            "quelleHash": "47bb992fe6d57287b58aab84236721b7b5a2a090b41cfae0e1de2704f2026551"
          },
          {
            "quelleId": "rd-d97f522e02339bd93fb2e99030e44078f9a6431737767a5b80e40685eddbf865",
            "quelleHash": "3a5dbe227d36f559c96431c6d58915be5f13f491e990dacf96cf53b78c4ca27f"
          }
        ]
      }
    ]
  },
  {
    "id": "ereignis-gruene-remagen-personalwechsel-teilmitglied",
    "art": "green",
    "mitglieder": [
      {
        "koId": "ko-vg-fraktion-20260325-de43c3",
        "vorgangId": "vg-fraktion-20260325-de43c3",
        "koHash": "dbfc40d1bf40a8cd592970db11837eac9af9f98d2d61cf7961d8f4bbf31a08a4",
        "title": "Generations- und Personalwechsel in mehreren Grünen-Fraktionen und positionsbezogene Pressemitteilungen",
        "summary": "Mehrere Veröffentlichungen berichten über Personalwechsel und politische Positionierungen von Bündnis 90/Die Grünen auf Landes- und kommunaler Ebene.",
        "quellen": [
          {
            "quelleId": "rd-1a27664cb53e659d9da10a55ca925b0744b625c397f8556676d5a944260d1c4e",
            "quelleHash": "768304f13edeec7e437b1c3f4cd1612a7faf45b2c4b10ac9b85488e74e56df55"
          },
          {
            "quelleId": "rd-1dfbc7d699c5f30e05711122ed6a2bab9ca70791a41a2814a83def97ef09e112",
            "quelleHash": "f035ffe4c6d1607b7b3fafde63f96de884a9c71f3a03cb842ac25a3e865b1a4e"
          },
          {
            "quelleId": "rd-224081f074d0fd49563b1e39c5f4d52e613e64e189117352f77c3f420c77910c",
            "quelleHash": "d548d06935da94299c56ec04fe230913b437b05f0c711b13300d31f314c8ef43"
          },
          {
            "quelleId": "rd-4036ab8ecaaf75651a0bb8f191f44bd9f240f5fe02db2447666c4e163d2c55dc",
            "quelleHash": "87da5e1420252e61e7aa2cb829e7b78017a76a201173de5531fe30cec8494e79"
          },
          {
            "quelleId": "rd-4c0c5986f484fec93641faa9cd8a6a771eab2e7f73433ea0964893d301ce94e0",
            "quelleHash": "3457e399d1b755a0b1752c8e04897e4270beee6a5412d0592f2ff1a97811a3c5"
          },
          {
            "quelleId": "rd-6e71f168666c38bd14e3b008c609584b479049a6088daa8b6ed00bd593dfadfd",
            "quelleHash": "e2ddda1ece6595a79ee4a11e8e717149f9551e2483423ff10d0ec7919423814b"
          },
          {
            "quelleId": "rd-e98cf693674beca0eecde49334576107449eccd3554d5a8e40e0edf7e7c5040c",
            "quelleHash": "fdbdec5be353c8c373836d8d00b58cdc5b3d20775a0ea4820c4f0fe67cc678ea"
          },
          {
            "quelleId": "rd-ea34e5c3475d92d8ac5c0982bb36545331a4a394e6164f617b986cd68eaee1aa",
            "quelleHash": "b14e39b36fd8c54e423ebfafb442ee13ec0490fc5fcb0ff13dbffb3d20fb8cda"
          }
        ]
      },
      {
        "koId": "ko-vg-fraktion-20260308-acc64b",
        "vorgangId": "vg-fraktion-20260308-acc64b",
        "koHash": "16d12b4fcf83569f19634c8854f1f596c0c7f2c10c88644661424491084b5556",
        "title": "Grüne-Fraktionen melden Personal- und inhaltliche Positionierungen nach Wahl und Debatten",
        "summary": "Die Meldungen zeigen interne Personalveränderungen, thematische Prioritäten (Gleichstellung, Bildung, Pflege, Europa, Verfassungsschutz) und öffentlich kommunizierte Forderungen der Grünen auf Landes- und lokaler Ebene; sie geben Hinweise auf Agenda- und Personalentwicklung innerhalb der Partei in mehreren Ebenen.",
        "quellen": [
          {
            "quelleId": "rd-1dfbc7d699c5f30e05711122ed6a2bab9ca70791a41a2814a83def97ef09e112",
            "quelleHash": "f035ffe4c6d1607b7b3fafde63f96de884a9c71f3a03cb842ac25a3e865b1a4e"
          },
          {
            "quelleId": "rd-224081f074d0fd49563b1e39c5f4d52e613e64e189117352f77c3f420c77910c",
            "quelleHash": "d548d06935da94299c56ec04fe230913b437b05f0c711b13300d31f314c8ef43"
          },
          {
            "quelleId": "rd-3b290f0f32ebd21d3641039f029d791091eefb10f623ddfae6aaa52a4caea0e4",
            "quelleHash": "f0645975163dda24357701420411eddaa8cf13eb2d0946fd519f827ee4fbd898"
          },
          {
            "quelleId": "rd-4036ab8ecaaf75651a0bb8f191f44bd9f240f5fe02db2447666c4e163d2c55dc",
            "quelleHash": "87da5e1420252e61e7aa2cb829e7b78017a76a201173de5531fe30cec8494e79"
          },
          {
            "quelleId": "rd-4c0c5986f484fec93641faa9cd8a6a771eab2e7f73433ea0964893d301ce94e0",
            "quelleHash": "3457e399d1b755a0b1752c8e04897e4270beee6a5412d0592f2ff1a97811a3c5"
          },
          {
            "quelleId": "rd-6e71f168666c38bd14e3b008c609584b479049a6088daa8b6ed00bd593dfadfd",
            "quelleHash": "e2ddda1ece6595a79ee4a11e8e717149f9551e2483423ff10d0ec7919423814b"
          },
          {
            "quelleId": "rd-88d5c9fff9c51ce9063a1b0925fdce2ff6d0a0aa77d88251cf7a6ba693ddd27a",
            "quelleHash": "6b1c3dde8eb3f34aca9cc903bfbff6acd5bb7e2c46bef7686f76d86868112a82"
          },
          {
            "quelleId": "rd-a4e477012d2b5ae28f8a33b1355362a44d466c8ebbd37c3b6da0ff1c7921bd85",
            "quelleHash": "35b7f75de95476336adceac5c79ecc6e85b065803b056c6eae66dd2fbfce5799"
          },
          {
            "quelleId": "rd-e98cf693674beca0eecde49334576107449eccd3554d5a8e40e0edf7e7c5040c",
            "quelleHash": "fdbdec5be353c8c373836d8d00b58cdc5b3d20775a0ea4820c4f0fe67cc678ea"
          },
          {
            "quelleId": "rd-ea34e5c3475d92d8ac5c0982bb36545331a4a394e6164f617b986cd68eaee1aa",
            "quelleHash": "b14e39b36fd8c54e423ebfafb442ee13ec0490fc5fcb0ff13dbffb3d20fb8cda"
          }
        ]
      }
    ]
  }
];
for (const r of REGISTER) {
  for (const m of r.mitglieder) { m.quellen.forEach(Object.freeze); Object.freeze(m.quellen); Object.freeze(m); }
  Object.freeze(r.mitglieder); Object.freeze(r);
}
Object.freeze(REGISTER);
const REMAGEN = "Anna Koch folgt Fokje Schreurs in die Fraktion von Bündnis 90/Die Grünen im Remagener Stadtrat.";
const BR_REST = "Quellen melden, dass ein nicht-offizieller Referenten-Vorentwurf zum 13. SGB II-Änderungsgesetz vorliegt und der Bundestag bereits Beschlüsse zum Nachfolger des Bürgergelds gefasst hat.";
const source = d => ({ documentId: d.id, source19Hash: hash(d), name: d.source_name || "",
  sourceName: d.source_name || "", title: d.title || "", excerpt: d.summary || "",
  url: d.url || d.canonical_url || "", publishedAt: d.published_at || null,
  sourceType: d.source_type || null, linkType: d.link_type || "direct" });

function plane({ decisions = [], kosById = {}, sourcesByVorgang = {}, currentHelmutState } = {}) {
  const get = id => kosById instanceof Map ? kosById.get(id) : kosById[id];
  return REGISTER.filter(r => r.mitglieder.every(m => {
    const ko = get(m.koId), docs = sourcesByVorgang[m.vorgangId];
    const ds = decisions.filter(d => d.knowledge_object_id === m.koId);
    if (!ko || ko.id !== m.koId || ko.vorgang_id !== m.vorgangId || hash(ko) !== m.koHash
      || ds.length !== 1 || ds[0].vorgang_id !== m.vorgangId || !Array.isArray(docs)
      || docs.length !== m.quellen.length || new Set(docs.map(d => d.id)).size !== docs.length) return false;
    return docs.every(d => m.quellen.some(q => q.quelleId === d.id && q.quelleHash === hash(d)));
  })).filter(r => !currentHelmutState || require("./briefing-ereignisgruppen")
    .ausserhalbTageskopf(r, currentHelmutState));
}

function projiziere({ items = [], recommendations = [], ...basis } = {}) {
  let out = { items, recommendations };
  for (const r of plane(basis)) {
    const ii = r.mitglieder.map(m => out.items.filter(i => i.knowledgeObjectId === m.koId && i.vorgangId === m.vorgangId));
    const rr = r.mitglieder.map(m => out.recommendations.filter(i => i.knowledge_object_id === m.koId && i.vorgang_id === m.vorgangId));
    // Exakte sichtbare Texte/Rollen, keine Fuzzy-Auswahl und kein Drift-Tolerieren.
    if (ii.some(x => x.length !== 1) || rr.some(x => x.length !== 1)
      || r.mitglieder.some((m, n) => [ii[n][0], rr[n][0]].some(i => i.title !== m.title || i.summary !== m.summary
        || i.ereignisMitglieder || i.ereignisUrspruenge))) continue;
    const get = id => basis.kosById instanceof Map ? basis.kosById.get(id) : basis.kosById[id];
    const origins = r.mitglieder.map((m, n) => ({ vorgangId: m.vorgangId,
      originalItem: structuredClone(ii[n][0]), originalRecommendation: structuredClone(rr[n][0]),
      originalKO: structuredClone(get(m.koId)), source19: structuredClone(basis.sourcesByVorgang[m.vorgangId]) }));
    const docs = m => basis.sourcesByVorgang[m.vorgangId].map(source);
    const allSources = [...new Map(r.mitglieder.flatMap(docs).map(d => [d.documentId, d])).values()];
    const role = (m, rolle, title, summary, ids) => ({ vorgangId: m.vorgangId, rolle, title, summary,
      sources: docs(m).filter(d => !ids || ids.includes(d.documentId)) });
    function change(i, n) {
      if (r.art === "br" && n === 0) return { ...i, ereignisTeilmitgliedId: r.id };
      const fields = { ereignisTeilmitgliedId: r.id, ereignisUrspruenge: origins };
      if (r.art === "br") {
        const m = r.mitglieder[1];
        fields.summary = BR_REST;
        fields.sources = docs(m).filter(d => d.documentId !== r.mitglieder[0].quellen[0].quelleId);
        fields.primarySource = fields.sources.find(d => d.documentId === "rd-7c0f3286f7d99a6405185f9bbaceb449c321ce373e8b3e1edfe2175c9a4c4117");
        fields.sourceCount = fields.sources.length; fields.source_count = fields.sources.length;
        fields.url = fields.primarySource.url; fields.linkType = fields.primarySource.linkType;
        fields.ereignisTeilrollen = [
          role(m, "referenten-vorentwurf", "Referenten-Vorentwurf", "Ein nicht-offizieller Referenten-Vorentwurf zum 13. SGB II-Änderungsgesetz liegt vor.", ["rd-7c0f3286f7d99a6405185f9bbaceb449c321ce373e8b3e1edfe2175c9a4c4117"]),
          role(m, "bundestags-beschluesse", "Bundestagsstand", "Der Bundestag hat bereits Beschlüsse zum Nachfolger des Bürgergelds gefasst.", ["rd-8edbf49a50c945a3c33f5e5610b949da7c3f4b3c4e45cbbc9082d6694fe2d0d9"])
        ];
      } else {
        fields.title = REMAGEN; fields.summary = REMAGEN;
        fields.ereignisKontexte = r.mitglieder.map(m => role(m, "pluraler-kontext", m.title, m.summary));
        fields.sources = allSources; fields.sourceCount = allSources.length; fields.source_count = allSources.length;
      }
      return { ...i, ...fields };
    }
    if (r.art === "br") {
      out = { items: out.items.map(i => { const n = ii.findIndex(x => x[0] === i); return n < 0 ? i : change(i, n); }),
        recommendations: out.recommendations.map(i => { const n = rr.findIndex(x => x[0] === i); return n < 0 ? i : change(i, n); }) };
    } else {
      // Der zuerst gewaehlte Vorgang bleibt der Vertreter. Seine Bewertung wird
      // nicht hochgestuft; beide unveraenderten Kontexte und Originale bleiben.
      const first = out.items.find(i => ii.some(x => x[0] === i));
      const n = ii.findIndex(x => x[0] === first);
      out = { items: out.items.flatMap(i => ii.some(x => x[0] === i) ? (i === first ? [change(i, n)] : []) : [i]),
        recommendations: out.recommendations.flatMap(i => rr.some(x => x[0] === i) ? (i === rr[n][0] ? [change(i, n)] : []) : [i]) };
    }
  }
  return out;
}

function vorgangIds(items = [], mitVollmitgliedern = true) {
  return [...new Set(items.flatMap(i => [i.vorgangId, ...(mitVollmitgliedern ? i.ereignisMitglieder || [] : []).map(m => m.vorgangId),
    ...(i.ereignisUrspruenge || []).map(m => m.vorgangId)]).filter(Boolean))];
}
// Ausschliesslich sichtbare, bereits gebundene Rollen. Rohobjekte bleiben im
// internen Vertrag und seinem Hash, niemals im Modell- oder UI-Rollenarray.
function oeffentlicheRollen(item = {}) {
  return Object.fromEntries(["ereignisTeilrollen", "ereignisKontexte"].filter(k => Array.isArray(item[k]))
    .map(k => [k, structuredClone(item[k])]));
}
function lageKarte(card, item) {
  if (!item?.ereignisUrspruenge) return card;
  return { ...card, title: item.title, displayTitle: item.title, displaySummary: item.summary,
    summary: { ...card.summary, wasIstPassiert: item.summary },
    ...oeffentlicheRollen(item), sources: structuredClone(item.sources), sourceCount: item.sources.length,
    // Die komplette Chronologie gehoert den Originalen, nicht dem isolierten
    // Mitglied. Kein zweites BR-/Remagen-Ereignis aus einer Quellenueberschrift.
    chronologie: [], ereignisTeilmitgliedId: item.ereignisTeilmitgliedId };
}
// Ein persistierter Container muss aus genau denselben gepinnten Originalen
// und Rollen erneut entstehen. Ein selbst gesetztes Hashfeld allein reicht nicht.
function projektionGueltig(item) {
  try {
    const origins = item?.ereignisUrspruenge;
    if (!Array.isArray(origins) || origins.length !== 2) return false;
    const first = origins.find(o => o.originalItem.knowledgeObjectId === item.knowledgeObjectId);
    if (!first) return false;
    const sorted = [first, ...origins.filter(o => o !== first)];
    const out = projiziere({ items: sorted.map(o => o.originalItem),
      recommendations: sorted.map(o => o.originalRecommendation),
      decisions: sorted.map(o => ({ knowledge_object_id: o.originalKO.id, vorgang_id: o.originalKO.vorgang_id })),
      kosById: Object.fromEntries(origins.map(o => [o.originalKO.id, o.originalKO])),
      sourcesByVorgang: Object.fromEntries(origins.map(o => [o.vorgangId, o.source19])) });
    const expected = out.items.find(i => i.knowledgeObjectId === item.knowledgeObjectId);
    return expected?.ereignisUrspruenge && hash(expected) === hash(item);
  } catch { return false; }
}
function cachePasst(payload, projektionen = []) {
  const stored = payload?.teilmitgliedProjektionen;
  if (!projektionen.length) return !stored && !payload?.teilmitgliedProjektionHash;
  return Array.isArray(stored) && stored.length === projektionen.length
    && stored.every(projektionGueltig) && projektionen.every(projektionGueltig)
    && payload.teilmitgliedProjektionHash === hash(stored) && hash(stored) === hash(projektionen);
}
function gespeicherteLageKarten(cards, payload) {
  if (!payload?.teilmitgliedProjektionen && !payload?.teilmitgliedProjektionHash) return cards;
  const projected = payload.teilmitgliedProjektionen;
  if (!Array.isArray(projected) || !projected.length || !payload.briefingEingabeHash
    || !cachePasst(payload, projected)) throw new Error("lage-teilmitgliedprojektion-abweichend");
  let out = cards;
  for (const item of projected) {
    const ids = item.ereignisUrspruenge.map(o => o.vorgangId), green = Boolean(item.ereignisKontexte);
    const index = out.findIndex(v => v.vorgangId === item.vorgangId || (green && ids.includes(v.vorgangId)));
    if (index < 0) continue;
    out = out.flatMap((v, n) => n === index ? [lageKarte({ ...v, vorgangId: item.vorgangId }, item)]
      : green && ids.includes(v.vorgangId) ? [] : [v]);
  }
  return out;
}
module.exports = { REGISTER, plane, projiziere, vorgangIds, oeffentlicheRollen, lageKarte,
  projektionGueltig, cachePasst, gespeicherteLageKarten };
