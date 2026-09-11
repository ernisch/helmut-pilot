"use strict";

// Private Auswahl vor dem Text. Ihre Begruendung ist kein Quellenbeweis;
// Quellenabdeckung und fachliche Relevanz prueft weiterhin der separate Review.
const Q = require("./lage-textqualitaet");
const FELDER = ["ausschuesse", "schwerpunkte", "wahlkreis", "bundesland", "ebene", "partei", "fraktion", "regierungsrolle"];
const SCHEMA = { type: "object", additionalProperties: false,
  required: ["quelle_id", "mandatsfeld", "mandatswert", "begruendung"],
  properties: { quelle_id: { type: "string" }, mandatsfeld: { type: "string", enum: FELDER },
    mandatswert: { type: "string" }, begruendung: { type: "string",
      description: "Maximal 240 Zeichen: konkreter Zusammenhang dieses Quelldokuments mit genau diesem vorhandenen Mandatsfeld. Keine erfundene Zustaendigkeit." } } };

function binde(raw, paragraphs, vorgaenge, profile, { erlaubeAltbeleg = false } = {}) {
  const list = raw?.paragraphs, kontext = Q.profilKontext(profile);
  const fail = grund => ({ ok: false, grund });
  if (!Array.isArray(list) || list.length !== paragraphs.length) return fail("ai-text-source-reference");
  // Ausschliesslich der separat verifizierte Zeitbudget-Entwurf darf seinen
  // bisherigen Vertrag behalten. Neue Modellantworten brauchen jede Auswahl.
  if (erlaubeAltbeleg && list.every(p => !Object.hasOwn(p, "auswahl")))
    return { ok: true, paragraphs };
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i].auswahl, p = paragraphs[i];
    if (!a || typeof a !== "object" || Array.isArray(a)
      || Object.keys(a).length !== 4 || !SCHEMA.required.every(k => Object.hasOwn(a, k))
      || typeof a.quelle_id !== "string" || p.vorgang_ids.length !== 1)
      return fail("ai-text-source-reference");
    const v = vorgaenge.find(v => v.vorgang_id === p.vorgang_ids[0]);
    if (!v?.quellenbelege?.some(q => q.quelle_id === a.quelle_id)) return fail("ai-text-source-reference");
    const value = kontext[a.mandatsfeld], values = Array.isArray(value) ? value : [value];
    if (!FELDER.includes(a.mandatsfeld) || typeof a.mandatswert !== "string" || !a.mandatswert.trim()
      || !values.some(v => typeof v === "string" && v === a.mandatswert)
      || typeof a.begruendung !== "string" || a.begruendung.trim().length < 12 || a.begruendung.length > 240)
      return fail("ai-text-quality-incomplete");
    out.push({ ...p, quellen_ids: [a.quelle_id], auswahl: { ...a } });
  }
  return { ok: true, paragraphs: out };
}
module.exports = { SCHEMA, binde };
