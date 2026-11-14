"use strict";

// Ein einziger Ergaenzungsversuch eines bereits streng bestaetigten Teilstands.
// Kein neuer Freigabevertrag: die unveraenderte Gesamt-/Paarpruefung entscheidet.
const B = require("./briefing-speicher"), T = require("./lage-teilstand"),
  E = require("./lage-quellenbeleg"), D = require("./dedup");
const VERSION = 1, vertraege = new WeakMap();
const gleich = require("node:util").isDeepStrictEqual;
const need = value => { if (!value) throw Error("lage-ergaenzungsbindung-ungueltig"); };
const exakt = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && gleich(Object.keys(value).sort(), [...keys].sort());
const identitaet = q => D.briefingArticleIdentity(q?.url) || D.canonicalizeUrl(q?.url);
function vorbereiten(payload, args) {
  need(T.gueltig(payload, args) && Array.isArray(args.quellen)
    && E.hashEingabe(args.quellen) === payload.quellenHash
    && args.quellen.every(v => !v.historischerKontext));
  const raw = payload.provenienz.originale.entwurf.payload.antwort;
  const positiv = structuredClone(raw.paragraphs[payload.provenienz.originalIndex]);
  const negativ = raw.paragraphs[payload.provenienz.ausgeschlossen];
  const alle = args.quellen.flatMap(v => v.quellenbelege);
  const ausgenommen = new Set([positiv, negativ].map(p => identitaet(alle.find(q => q.quelle_id === p.quelle_id))));
  need(ausgenommen.size === 2 && !ausgenommen.has(""));
  // Ganze Artikelidentitaeten ausschliessen, auch mit anderer q-/Vorgangskennung,
  // URL-Tracking, www oder bereits belegten Publisher-URL-Aliasformaten.
  const alternativen = args.quellen.map(v => ({ ...structuredClone(v), quellenbelege: v.quellenbelege
    .filter(q => identitaet(q) && !ausgenommen.has(identitaet(q))).map(q => structuredClone(q)) }))
    .filter(v => v.quellenbelege.length);
  if (!alternativen.length) return null;
  const eingabe = { art: "lage-einmalergaenzung", version: VERSION, mandat: args.userId,
    tag: args.tag, basis: structuredClone(payload.eingabe), originalBelegHash: payload.inhaltHash };
  const ctx = Object.freeze({});
  const data = { eingabe, eingabeHash: B.hash(eingabe), positiv,
    negativ: { quelle_id: negativ.quelle_id, mandatsbezug: structuredClone(negativ.mandatsbezug) },
    alternativen, quellenHash: payload.quellenHash, profilHash: payload.profilHash,
    briefingDatum: payload.provenienz.originale.entwurf.generated_at };
  vertraege.set(ctx, { data, original: structuredClone(payload) });
  return ctx;
}
function lese(ctx, quellen, profile, userId) {
  const intern = ctx && vertraege.get(ctx), data = intern?.data;
  need(data && userId === data.eingabe.mandat && profile?.id === userId
    && B.profilHash(profile) === data.profilHash && E.hashEingabe(quellen) === data.quellenHash
    && T.gueltig(intern.original, { userId, tag: data.eingabe.tag, profile,
      eingabe: data.eingabe.basis, now: new Date() }));
  return structuredClone(data);
}
function pruefeEntwurf(ctx, raw, quellen, profile, userId) {
  const data = lese(ctx, quellen, profile, userId);
  need(exakt(raw, ["paragraphs"]) && Array.isArray(raw.paragraphs) && raw.paragraphs.length === 2
    && gleich(raw.paragraphs[0], data.positiv));
  const ersatz = raw.paragraphs[1];
  need(exakt(ersatz, ["vorgang_ids", "quelle_id", "auswahlbegruendung", "mandatsbezug", "text"])
    && exakt(ersatz.mandatsbezug, ["feld", "wert"])
    && Array.isArray(ersatz.vorgang_ids) && ersatz.vorgang_ids.length === 1
    && data.alternativen.some(v => v.vorgang_id === ersatz.vorgang_ids[0]
      && v.quellenbelege.some(q => q.quelle_id === ersatz.quelle_id)));
  return raw;
}
function verbinde(ctx, antwort, quellen, profile, userId) {
  const data = lese(ctx, quellen, profile, userId);
  need(exakt(antwort, ["ersatz"]));
  const raw = { paragraphs: [data.positiv, structuredClone(antwort.ersatz)] };
  return pruefeEntwurf(ctx, raw, quellen, profile, userId);
}
function beleg(ctx, quellen, profile, userId) {
  const data = lese(ctx, quellen, profile, userId);
  return { version: VERSION, basisEingabeHash: B.hash(data.eingabe.basis),
    originalBelegHash: data.eingabe.originalBelegHash, ergaenzungsEingabeHash: data.eingabeHash };
}
module.exports = { VERSION, vorbereiten, lese, verbinde, pruefeEntwurf, beleg };
