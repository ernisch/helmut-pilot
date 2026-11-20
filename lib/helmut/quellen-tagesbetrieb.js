"use strict";

const { berlinTagKey, berlinZeitpunkt } = require("./briefing-frische");

const MINUTE = 60000;
const MAX_FENSTER = 24 * 4;
const MODUS = "24h";

function zeiten(jetztMs) {
  const tag = berlinTagKey(jetztMs);
  if (!tag) return null;
  const uhr = (h, m) => berlinZeitpunkt(tag, h, m).getTime();
  return { pflichtstart: uhr(4, 30), redaktionsschluss: uhr(6, 45),
    paketStart: uhr(7, 10), frist: uhr(7, 30) };
}

function ausgabeFaellig(art, jetztMs) {
  const tag = zeiten(jetztMs);
  if (!tag) return false;
  const start = art === "lage" ? tag.redaktionsschluss : tag.paketStart;
  return [start, start + 10 * MINUTE].some(termin => jetztMs >= termin && jetztMs < termin + 5 * MINUTE);
}

function quellenslot(jetztMs) {
  const tag = zeiten(jetztMs);
  if (!tag || (jetztMs >= tag.redaktionsschluss && jetztMs < tag.frist)) return null;
  const minute = Math.floor(jetztMs / MINUTE) % 15;
  if (minute >= 5) return null;
  const beginn = new Date(Math.floor(jetztMs / (15 * MINUTE)) * 15 * MINUTE);
  return { slot: beginn.toISOString().slice(11, 16),
    pflicht: jetztMs >= tag.pflichtstart && jetztMs < tag.redaktionsschluss,
    nurPflichtanalyse: jetztMs < tag.redaktionsschluss };
}

function vorSchnitt(dokument, schnitt) {
  const aufgenommen = Date.parse(dokument?.retrieved_at || dokument?.created_at || "");
  const publiziert = Date.parse(dokument?.published_at || "");
  return aufgenommen <= schnitt && (!Number.isFinite(publiziert) || publiziert <= schnitt);
}

function quellenstandBis(quellen, schnitt) {
  if (!Number.isFinite(schnitt)) return quellen;
  const gelesen = beleg => Date.parse(beleg?.gelesenAm || "") <= schnitt;
  const begrenze = doc => ({ ...doc,
    ...(Array.isArray(doc.parlamentsOriginalbelege)
      ? { parlamentsOriginalbelege: doc.parlamentsOriginalbelege.filter(gelesen) } : {}),
    ...(Array.isArray(doc.dipBeratungsstaende)
      ? { dipBeratungsstaende: doc.dipBeratungsstaende.map(b => gelesen(b) ? b : null) } : {}) });
  return Object.fromEntries(Object.entries(quellen).map(([vorgang, docs]) => [vorgang,
    docs.filter(doc => vorSchnitt(doc, schnitt)).map(begrenze)]));
}

module.exports = { MODUS, MAX_FENSTER, zeiten, ausgabeFaellig, quellenslot, vorSchnitt, quellenstandBis };
