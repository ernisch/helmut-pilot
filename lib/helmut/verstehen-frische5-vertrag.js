"use strict";
// Einmalige fest gebundene Quelleneingabe; keine neuen Artikelabrufe.
const crypto = require("node:crypto");
const A = require("./artikelkontext");
const F = require("./verstehen-frische30-vertrag");
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
// Commit des verwendeten Quellenkontext-Codes; die Eingabe selbst ist separat gehasht.
const FRISCHE5 = Object.freeze({ commit: "654fd8ea72f31260ffce6a104e071b237dd61ebf",
  dokumente: 5, idHash: "ec7424653949de4e3230be44a9e84e8e529c948ee92d3b6ac54974f25bf0527d",
  cluster: 5, clusterGroessen: Object.freeze({ 1: 5 }), maxModellaufrufe: 5,
  maxUsd: 0.25, maxMs: 7 * 60000 });
const QUITTUNG = "verstehen-frische5-20260926-a";
const EINGABE = "quellen-frische5-20260926-a";
const INHALT_HASH = "fc845bc31a1e80a07d35a6d4d2df8fbf83629a91f24f68d11a5ccb37c96a1f53";
const BELEGE_HASH = "747368d75bf4bcb090e5c3fbf4f1d02ff0022f7020caea8e5929043d7c53d7a4";
const versorgungen = new WeakSet();
function kanonischeSpeicherzeiten(doc) {
  const out = { ...doc };
  for (const feld of ["published_at", "retrieved_at"]) {
    const wert = doc[feld];
    if (typeof wert !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(wert)
      || /\.\d{3}\d*[1-9]\d*(?:Z|[+-]\d{2}:\d{2})$/.test(wert)
      || !Number.isFinite(Date.parse(wert))) throw new Error("frische5-speicherzeit-ungueltig");
    out[feld] = new Date(wert).toISOString();
  }
  return out;
}
// Importbeleg bleibt unveraendert. Erst seine vollstaendige Bindung gegen
// dieselben Zeitpunkte pruefen, dann an die konkrete Storage-Darstellung binden.
// Kein historischer Artikelvertrag und kein gespeichertes Datum werden geaendert.
function pruefeSpeicherbindung(docs, beleg) {
  // Der Beleg gehoert genau einer Quelle. Andere Quellen eines Updates
  // duerfen andere Speicherformate oder keinen Abrufzeitpunkt haben.
  // Mehrdeutige Zielkennungen bleiben durch den Artikelvertrag gesperrt.
  const clean = A.pruefeArtikelkontext(docs.map(d => d.id === beleg?.dokumentId
    ? kanonischeSpeicherzeiten(d) : d), beleg);
  const doc = docs.find(d => d.id === clean.dokumentId);
  return A.pruefeArtikelkontext(docs, { ...clean, quellenHash: A.quellenstandHash(doc) });
}
function pruefeInhalt(docs, now = Date.now()) {
  try { return docs.length === 5 && F.inhaltsHash(docs) === INHALT_HASH && docs.every(d =>
    [d.published_at, d.retrieved_at].every(t => Date.parse(t) <= now && Date.parse(t) >= now - 48 * 3600000)); }
  catch { return false; }
}
function ausGesichertenBelegen(docs, belege, now = Date.now()) {
  if (!pruefeInhalt(docs, now) || !Array.isArray(belege) || belege.length !== 5) throw new Error("frische5-eingabe-abweichend");
  const clean = belege.map(b => A.pruefeArtikelkontext(docs.map(kanonischeSpeicherzeiten), b)).sort((a, b) => a.dokumentId.localeCompare(b.dokumentId));
  if (hash(JSON.stringify(clean)) !== BELEGE_HASH || new Set(clean.map(b => b.dokumentId)).size !== 5
    || clean.some(b => b.version !== 2 || b.gewinnung.verfahren !== "deutschlandfunk-artikel-leitabsatz-v1"
      || Date.parse(b.gelesenAm) > now)) throw new Error("frische5-belege-abweichend");
  const frozenDocs = structuredClone(docs), frozen = structuredClone(clean);
  const versorgung = async (selected) => {
    const matching = frozen.filter(b => selected.some(d => d.id === b.dokumentId));
    if (matching.length !== 1) return { angefordert: true, ok: false, reason: "frische5-kontext-mehrdeutig-oder-fehlend" };
    const b = matching[0];
    try {
      if (!pruefeInhalt(frozenDocs)) throw new Error("veraltet");
      if (F.inhaltsHash(selected.filter(d => d.id === b.dokumentId))
        !== F.inhaltsHash(frozenDocs.filter(d => d.id === b.dokumentId))) throw new Error("veraendert");
      return { angefordert: true, ok: true, beleg: pruefeSpeicherbindung(selected, b) };
    } catch { return { angefordert: true, ok: false, reason: "frische5-quellenstand-abweichend" }; }
  };
  versorgungen.add(versorgung);
  return versorgung;
}
const istVersorgung = fn => typeof fn === "function" && versorgungen.has(fn);
module.exports = { FRISCHE5, QUITTUNG, EINGABE, INHALT_HASH, BELEGE_HASH, pruefeInhalt, ausGesichertenBelegen, istVersorgung, pruefeSpeicherbindung };
