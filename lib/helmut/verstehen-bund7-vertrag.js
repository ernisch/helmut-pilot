"use strict";
// Einmalige fest gebundene amtliche Eingabe; keine neuen Artikelabrufe.
const crypto = require("node:crypto");
const A = require("./artikelkontext");
const F = require("./verstehen-frische30-vertrag");
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
const BUND7 = Object.freeze({ commit: "5d3687a6d1666605892245821144677bf250c2c2",
  dokumente: 7, idHash: "3673a24e0b8eceb88ce98ee0a6914499c77956409bf996ec690d6698ba792f9f",
  cluster: 7, clusterGroessen: Object.freeze({ 1: 7 }), maxModellaufrufe: 7,
  maxUsd: 0.30, maxMs: 10 * 60000 });
// a stoppte vor dem ersten Modell am nicht eingebundenen Kostenleser.
// Diese historische Quittung bleibt unveraendert; b ist ein neuer begrenzter Auftrag.
const VORGAENGER = "verstehen-bund7-20260925-a";
const VORGAENGER_RUN = "verstehen-bund7-36141840797";
const QUITTUNG = "verstehen-bund7-20260925-b";
const EINGABE = "quellen-bund7-20260925-a";
const INHALT_HASH = "e7322e54360c74b6746d225a1cd13d0c5597425cc69915609faa09c776e2bde8";
const BELEGE_HASH = "bddbeec40cbcf98c8ebf9938df13850c760965946b2d1a8af2db2333e4e041c1";
const versorgungen = new WeakSet();
function kanonischeSpeicherzeiten(doc) {
  const out = { ...doc };
  for (const feld of ["published_at", "retrieved_at"]) {
    const wert = doc[feld];
    if (typeof wert !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(wert)
      || /\.\d{3}\d*[1-9]\d*(?:Z|[+-]\d{2}:\d{2})$/.test(wert)
      || !Number.isFinite(Date.parse(wert))) throw new Error("bund7-speicherzeit-ungueltig");
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
  try { return docs.length === 7 && F.inhaltsHash(docs) === INHALT_HASH && docs.every(d =>
    [d.published_at, d.retrieved_at].every(t => Date.parse(t) <= now && Date.parse(t) >= now - 48 * 3600000)); }
  catch { return false; }
}
function ausGesichertenBelegen(docs, belege, now = Date.now()) {
  if (!pruefeInhalt(docs, now) || !Array.isArray(belege) || belege.length !== 7) throw new Error("bund7-eingabe-abweichend");
  const clean = belege.map(b => A.pruefeArtikelkontext(docs.map(kanonischeSpeicherzeiten), b)).sort((a, b) => a.dokumentId.localeCompare(b.dokumentId));
  if (hash(JSON.stringify(clean)) !== BELEGE_HASH || new Set(clean.map(b => b.dokumentId)).size !== 7
    || clean.some(b => b.version !== 2 || b.gewinnung.verfahren !== "bundestag-artikel-leitabsatz-v1"
      || Date.parse(b.gelesenAm) > now)) throw new Error("bund7-belege-abweichend");
  const frozenDocs = structuredClone(docs), frozen = structuredClone(clean);
  const versorgung = async (selected) => {
    const matching = frozen.filter(b => selected.some(d => d.id === b.dokumentId));
    if (matching.length !== 1) return { angefordert: true, ok: false, reason: "bund7-kontext-mehrdeutig-oder-fehlend" };
    const b = matching[0];
    try {
      if (!pruefeInhalt(frozenDocs)) throw new Error("veraltet");
      if (F.inhaltsHash(selected.filter(d => d.id === b.dokumentId))
        !== F.inhaltsHash(frozenDocs.filter(d => d.id === b.dokumentId))) throw new Error("veraendert");
      return { angefordert: true, ok: true, beleg: pruefeSpeicherbindung(selected, b) };
    } catch { return { angefordert: true, ok: false, reason: "bund7-quellenstand-abweichend" }; }
  };
  versorgungen.add(versorgung);
  return versorgung;
}
const istVersorgung = fn => typeof fn === "function" && versorgungen.has(fn);
module.exports = { BUND7, QUITTUNG, VORGAENGER, VORGAENGER_RUN, EINGABE, INHALT_HASH, BELEGE_HASH, pruefeInhalt, ausGesichertenBelegen, istVersorgung, pruefeSpeicherbindung };
