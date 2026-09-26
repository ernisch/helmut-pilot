"use strict";
// Einmalige fest gebundene Quelleneingabe; keine neuen Artikelabrufe.
const crypto = require("node:crypto");
const A = require("./artikelkontext");
const F = require("./verstehen-frische30-vertrag");
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
// Commit des verwendeten Quellenkontext-Codes; die Eingabe selbst ist separat gehasht.
const FRISCHE18 = Object.freeze({ commit: "700001011b971cb0d1eb3dd552905fd66601e4c6",
  dokumente: 18, idHash: "71c33b623bb251422286ee34d14d8c6269b38c53f9d24518898b618b835e291f",
  cluster: 18, clusterGroessen: Object.freeze({ 1: 18 }), maxModellaufrufe: 18,
  maxUsd: 0.65, maxMs: 15 * 60000 });
const QUITTUNG = "verstehen-frische18-20260926-a";
const EINGABE = "quellen-frische18-20260926-a";
const INHALT_HASH = "0abb51891433446ddf75052f8ceb5505452b8d1f6b904364940fd274001ca7d3";
const BELEGE_HASH = "97e245d1f3ef1804fde9a6357472bccc9a83480a4d8bde550726081e928dc5a4";
const versorgungen = new WeakSet();
function kanonischeSpeicherzeiten(doc) {
  const out = { ...doc };
  for (const feld of ["published_at", "retrieved_at"]) {
    const wert = doc[feld];
    if (typeof wert !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(wert)
      || /\.\d{3}\d*[1-9]\d*(?:Z|[+-]\d{2}:\d{2})$/.test(wert)
      || !Number.isFinite(Date.parse(wert))) throw new Error("frische18-speicherzeit-ungueltig");
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
  try { return docs.length === 18 && F.inhaltsHash(docs) === INHALT_HASH && docs.every(d =>
    [d.published_at, d.retrieved_at].every(t => Date.parse(t) <= now && Date.parse(t) >= now - 48 * 3600000)); }
  catch { return false; }
}
function ausGesichertenBelegen(docs, belege, now = Date.now()) {
  if (!pruefeInhalt(docs, now) || !Array.isArray(belege) || belege.length !== 18) throw new Error("frische18-eingabe-abweichend");
  const clean = belege.map(b => A.pruefeArtikelkontext(docs.map(kanonischeSpeicherzeiten), b)).sort((a, b) => a.dokumentId.localeCompare(b.dokumentId));
  if (hash(JSON.stringify(clean)) !== BELEGE_HASH || new Set(clean.map(b => b.dokumentId)).size !== 18
    || clean.some(b => b.version !== 2 || !["deutschlandfunk-artikel-leitabsatz-v1", "artikel-absatz-titel-v1"].includes(b.gewinnung.verfahren)
      || Date.parse(b.gelesenAm) > now)
    || clean.filter(b => b.gewinnung.verfahren === "deutschlandfunk-artikel-leitabsatz-v1").length !== 11
    || clean.filter(b => b.gewinnung.verfahren === "artikel-absatz-titel-v1").length !== 7) throw new Error("frische18-belege-abweichend");
  const frozenDocs = structuredClone(docs), frozen = structuredClone(clean);
  const versorgung = async (selected) => {
    const matching = frozen.filter(b => selected.some(d => d.id === b.dokumentId));
    if (matching.length !== 1) return { angefordert: true, ok: false, reason: "frische18-kontext-mehrdeutig-oder-fehlend" };
    const b = matching[0];
    try {
      if (!pruefeInhalt(frozenDocs)) throw new Error("veraltet");
      if (F.inhaltsHash(selected.filter(d => d.id === b.dokumentId))
        !== F.inhaltsHash(frozenDocs.filter(d => d.id === b.dokumentId))) throw new Error("veraendert");
      return { angefordert: true, ok: true, beleg: pruefeSpeicherbindung(selected, b) };
    } catch { return { angefordert: true, ok: false, reason: "frische18-quellenstand-abweichend" }; }
  };
  versorgungen.add(versorgung);
  return versorgung;
}
const istVersorgung = fn => typeof fn === "function" && versorgungen.has(fn);
module.exports = { FRISCHE18, QUITTUNG, EINGABE, INHALT_HASH, BELEGE_HASH, pruefeInhalt, ausGesichertenBelegen, istVersorgung, pruefeSpeicherbindung };
