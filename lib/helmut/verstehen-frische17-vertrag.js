"use strict";
// Einmalige fest gebundene Quelleneingabe; keine neuen Artikelabrufe.
const crypto = require("node:crypto");
const A = require("./artikelkontext");
const F = require("./verstehen-frische30-vertrag");
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
const FRISCHE17 = Object.freeze({ commit: "8fa1d3e05035dd1a019b876d97e7b2e07d98b47d",
  dokumente: 17, idHash: "5c6baa380c4c72c9bdb7b0af556ab898507e2e1ad3afa6ec8d351beed3395f66",
  cluster: 17, clusterGroessen: Object.freeze({ 1: 17 }), maxModellaufrufe: 17,
  maxUsd: 0.80, maxMs: 15 * 60000 });
const QUITTUNG = "verstehen-frische17-20260926-a";
const EINGABE = "quellen-frische17-20260926-a";
const INHALT_HASH = "5ff3ebc3c915105fbfb7fd28db1d542dad877c0e733be462d9d9660ee6461013";
const BELEGE_HASH = "711f3504e1e05bd1718a094adc20c0c25a4979259a185ac49a2cbe5b46e24766";
const versorgungen = new WeakSet();
function kanonischeSpeicherzeiten(doc) {
  const out = { ...doc };
  for (const feld of ["published_at", "retrieved_at"]) {
    const wert = doc[feld];
    if (typeof wert !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(wert)
      || /\.\d{3}\d*[1-9]\d*(?:Z|[+-]\d{2}:\d{2})$/.test(wert)
      || !Number.isFinite(Date.parse(wert))) throw new Error("frische17-speicherzeit-ungueltig");
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
  try { return docs.length === 17 && F.inhaltsHash(docs) === INHALT_HASH && docs.every(d =>
    [d.published_at, d.retrieved_at].every(t => Date.parse(t) <= now && Date.parse(t) >= now - 48 * 3600000)); }
  catch { return false; }
}
function ausGesichertenBelegen(docs, belege, now = Date.now()) {
  if (!pruefeInhalt(docs, now) || !Array.isArray(belege) || belege.length !== 17) throw new Error("frische17-eingabe-abweichend");
  const clean = belege.map(b => A.pruefeArtikelkontext(docs.map(kanonischeSpeicherzeiten), b)).sort((a, b) => a.dokumentId.localeCompare(b.dokumentId));
  if (hash(JSON.stringify(clean)) !== BELEGE_HASH || new Set(clean.map(b => b.dokumentId)).size !== 17
    || clean.some(b => b.version !== 2 || !["deutschlandfunk-artikel-leitabsatz-v1", "artikel-absatz-titel-v1"].includes(b.gewinnung.verfahren)
      || Date.parse(b.gelesenAm) > now)
    || clean.filter(b => b.gewinnung.verfahren === "deutschlandfunk-artikel-leitabsatz-v1").length !== 13
    || clean.filter(b => b.gewinnung.verfahren === "artikel-absatz-titel-v1").length !== 4) throw new Error("frische17-belege-abweichend");
  const frozenDocs = structuredClone(docs), frozen = structuredClone(clean);
  const versorgung = async (selected) => {
    const matching = frozen.filter(b => selected.some(d => d.id === b.dokumentId));
    if (matching.length !== 1) return { angefordert: true, ok: false, reason: "frische17-kontext-mehrdeutig-oder-fehlend" };
    const b = matching[0];
    try {
      if (!pruefeInhalt(frozenDocs)) throw new Error("veraltet");
      if (F.inhaltsHash(selected.filter(d => d.id === b.dokumentId))
        !== F.inhaltsHash(frozenDocs.filter(d => d.id === b.dokumentId))) throw new Error("veraendert");
      return { angefordert: true, ok: true, beleg: pruefeSpeicherbindung(selected, b) };
    } catch { return { angefordert: true, ok: false, reason: "frische17-quellenstand-abweichend" }; }
  };
  versorgungen.add(versorgung);
  return versorgung;
}
const istVersorgung = fn => typeof fn === "function" && versorgungen.has(fn);
module.exports = { FRISCHE17, QUITTUNG, EINGABE, INHALT_HASH, BELEGE_HASH, pruefeInhalt, ausGesichertenBelegen, istVersorgung, pruefeSpeicherbindung };
