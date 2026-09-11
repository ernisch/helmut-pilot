"use strict";

// Interne Uebergabe desselben geprueften Briefings an den Lagepfad.
// Keine neue Auswahl, kein Nachladen alter Analysen, kein eigenes Fachurteil.
const { hash } = require("./briefing-speicher");
const { berlinTagKey } = require("./briefing-frische");
const fail = () => { throw new Error("briefing-lagebindung-abweichend"); };

function baue(result, urteil) {
  const basis = { version: 1, briefing: result.briefing, eingabe: result.eingabe,
    korrekturBasis: result.korrekturBasis, urteil };
  return structuredClone(basis);
}

function pruefe(basis, profile, userId, now = new Date()) {
  const A = require("./briefing-aussagenbindung");
  if (basis?.version !== 1 || !basis.korrekturBasis || profile?.id !== userId
    || basis.eingabe?.mandat !== userId || basis.eingabe.tag !== berlinTagKey(now)) fail();
  const { kos, sourcesByVorgang } = basis.korrekturBasis;
  if (!Array.isArray(kos) || !sourcesByVorgang || !basis.briefing?.available) fail();
  const neu = A.baueEingabe({ briefing: basis.briefing, sourcesByVorgang, profile, userId,
    day: basis.eingabe.tag, kos, korrekturHash: basis.eingabe.korrekturHash });
  if (hash(neu) !== hash(basis.eingabe) || !A.pruefe(neu, basis.urteil).bereit
    || !require("./briefing-fachurteil").pruefe(basis, basis.urteil).bereit) fail();
  const ids = basis.briefing.items.map(i => i.vorgangId);
  if (!ids.length || ids.some(id => typeof id !== "string" || !id)
    || new Set(ids).size !== ids.length) fail();
  const ranked = ids.map(id => {
    const rows = kos.filter(k => k.vorgang_id === id);
    if (rows.length !== 1) fail();
    return structuredClone(rows[0]);
  });
  const sources = Object.fromEntries(ids.map(id => [id, (sourcesByVorgang[id] || []).map(d => {
    const q = neu.quellen.find(q => q.vorgangId === id && q.documentId === d.id);
    if (!q || !require("./lage-quellenbeleg").artikelUrl(q.url)) fail();
    // Briefing und Lage muessen dieselbe gepruefte Artikeladresse verwenden.
    // Der regulaere Lagepfad bevorzugt sonst canonical_url vor url.
    return { ...structuredClone(d), url: q.url, canonical_url: q.url };
  })]));
  return { ranked, sources, eingabeHash: neu.eingabeHash };
}

module.exports = { baue, pruefe };
