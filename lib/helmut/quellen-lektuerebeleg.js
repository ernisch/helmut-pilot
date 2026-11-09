"use strict";
// Reine gemeinsame Prompt-/Lektuerebindung fuer Understanding und Quellenleser.
// Kein Modell-, Crawler-, Speicher- oder Dispatchimport.
const crypto = require("node:crypto");
const Q = require("./quellen-zeitvertrag"), H = require("./herausgeber");
const kanonisch = value => Array.isArray(value) ? value.map(kanonisch)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, kanonisch(value[k])])) : value;
const legacyHash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const hash = value => legacyHash(kanonisch(value));
function quelleBasis(d, i, beleg, normalisiert) {
  const normal = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : value;
  const quelle = Q.understandingQuelle(normalisiert
    ? { ...d, published_at: normal(d.published_at), retrieved_at: normal(d.retrieved_at) } : d, i);
  quelle.titel = H.titelRumpf(d);
  if (beleg) quelle.artikelkontext = beleg;
  return quelle;
}
function quelleMitAbschnitt(d, i = 0, beleg = null, piece) {
  const teil = require("./artikel-abschnitte").pruefe(piece);
  // Der Aufrufer prueft einen strukturierten Gesamtbeleg EINMAL mit A.pruefe.
  // Hier nur den ausgewaehlten Teil gegen dessen Original-/Bundlebindung pruefen.
  if (beleg ? teil.originalHash !== beleg.gewinnung?.artikelTextHash
      || teil.bundleHash !== beleg.gewinnung?.abschnitte?.bundleHash
    : teil.originalHash !== crypto.createHash("sha256").update(String(d.summary || "")).digest("hex"))
    throw Error("quellen-abschnitt-quellbindung-abweichend");
  const quelle = quelleBasis(d, i, beleg, true);
  quelle.quellenabschnitt = teil;
  quelle.auszug = beleg ? "" : teil.text;
  if (beleg) {
    const { absaetze, zwischenTexte, abschnitte, ...g } = beleg.gewinnung;
    quelle.artikelkontext = { ...beleg, text: teil.text,
      textHash: teil.textHash, gewinnung: { ...g, abschnitt: teil } };
  }
  return quelle;
}
function quelleFuerPrompt(d, i = 0, beleg = null, abschnittIndex) {
  const bundle = beleg?.gewinnung?.abschnitte
    || (abschnittIndex !== undefined && typeof d.summary === "string"
      && (d.summary.length > 1400 || Buffer.byteLength(d.summary) > 12000)
      ? require("./artikel-abschnitte").segmentiere(d.summary) : null);
  return bundle ? quelleMitAbschnitt(d, i, beleg, require("./artikel-abschnitte").waehle(bundle, abschnittIndex || 0))
    : quelleBasis(d, i, beleg, abschnittIndex !== undefined);
}
function quellenLektuereBeleg(eingabe, hashVersion = 2) {
    if (![1, 2].includes(hashVersion)) throw Error("quellen-hashversion-ungueltig");
    const hashQuelle = hashVersion === 1 ? legacyHash : hash;
    const { artikelkontext = null, ...quelle } = eingabe;
    const { quellenabschnitt = null, ...metadaten } = quelle;
    return { dokumentId: quelle.quelle_id, hashVersion,
      quellenHash: quellenabschnitt ? hashQuelle({ ...metadaten, auszug: null, originalHash: quellenabschnitt.originalHash }) : hashQuelle(quelle),
      textstandHash: quellenabschnitt ? hashQuelle([artikelkontext, quellenabschnitt]) : hashQuelle(artikelkontext),
      ...(quellenabschnitt ? { abschnitt: { index: quellenabschnitt.index, count: quellenabschnitt.count,
        bundleHash: quellenabschnitt.bundleHash } } : {}) };
}
function leseQuellenLektuere(ko) {
  const b = ko?.classification_confidence?.["helmut_quellen_lektuere"];
  if (b === undefined) return [];
  if (!b || ![1, 2].includes(b.version) || b.vorgangId !== ko.vorgang_id || b.koVersion !== ko.ko_version
    || !Number.isInteger(ko.ko_version) || ko.ko_version < 1
    || !Number.isInteger(ko.source_document_count) || ko.source_document_count < 0
    || !Array.isArray(b.quellen) || b.quellen.length > Number(ko.source_document_count)
    || new Set(b.quellen.map(q => q?.dokumentId)).size !== b.quellen.length
    || b.quellen.some(q => !q || typeof q.dokumentId !== "string" || !q.dokumentId
      || !/^[a-f0-9]{64}$/.test(q.quellenHash) || !/^[a-f0-9]{64}$/.test(q.textstandHash)
      || b.version === 1 && Object.keys(q).sort().join() !== ["dokumentId", "quellenHash", "textstandHash"].sort().join()
      || b.version === 2 && ![1, 2].includes(q.hashVersion)
      || (b.version === 1 || q.hashVersion === 1) && (q.abschnitt || q.geleseneAbschnitte)
      || q.abschnitt && (!Number.isSafeInteger(q.abschnitt.index) || q.abschnitt.index < 0
        || !Number.isSafeInteger(q.abschnitt.count) || q.abschnitt.count > 256 || q.abschnitt.index >= q.abschnitt.count
        || !/^[a-f0-9]{64}$/.test(q.abschnitt.bundleHash || "") || !Array.isArray(q.geleseneAbschnitte)
        || q.geleseneAbschnitte.length !== q.abschnitt.index + 1
        || q.geleseneAbschnitte.some(h => !/^[a-f0-9]{64}$/.test(h || ""))))
    || b.belegHash !== (b.version === 2 ? hash([b.version, b.vorgangId, b.koVersion, b.quellen])
      : legacyHash([b.version, b.vorgangId, b.koVersion, b.quellen.map(q => ({
        dokumentId: q.dokumentId, quellenHash: q.quellenHash, textstandHash: q.textstandHash }))])))
    throw new Error("quellen-lektuerebeleg-ungueltig");
  return b.version === 1 ? b.quellen.map(q => ({ ...q, hashVersion: 1 })) : b.quellen;
}
module.exports = { quelleFuerPrompt, quelleMitAbschnitt, quellenLektuereBeleg, leseQuellenLektuere, hash, kanonisch };
