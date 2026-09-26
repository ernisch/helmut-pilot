"use strict";
// Nur die 15 unbegonnenen Quellen des gestoppten16er Auftrags. Kein Retry.
const F16 = require("./verstehen-frische16-vertrag");
const { inhaltsHash } = require("./verstehen-frische30-vertrag");
const AUSGESCHLOSSEN = "rd-93bb69ff6b02514021ef90b49c939ed751ff16f17dd95c4deac275b64b1fff33";
const VORGANG = "vg-bundespolizeigesetz-20260925-c1afab";
const REST15 = Object.freeze({ commit: F16.FRISCHE16.commit,
  dokumente: 15, idHash: "d5d571bfb2d83248bb92dde6ee2432ca7dfaf9970f51c65d782517b1bc007b41",
  cluster: 15, clusterGroessen: Object.freeze({ 1: 15 }), maxModellaufrufe: 15,
  maxUsd: 0.8, maxMs: 15 * 60000 });
const QUITTUNG = "verstehen-rest15-20260926-a";
const INHALT_HASH = "997d3d554e33a5e278d9a1dfaa5a0b4c9ef387c2249621d9b2ef1c3f8924d63c";
const versorgungen = new WeakSet();
function pruefeVorgaenger(q, cas) {
  return q?.status === "gestoppt" && q.runId === "verstehen16-36207593889"
    && q.runtimeCommit === "af4d51c6c15b95165dbefa1ca9320d341278c2c4"
    && q.idHash === F16.FRISCHE16.idHash && q.modellaufrufe === 1
    && q.abbruchVorgangId === VORGANG && q.abbruchGrund === "verstehen-frische16-einzelergebnis-nicht-bestaetigt"
    && q.bilanz?.verarbeitet === 1 && q.bilanz?.arten?.["skipped-invalid"] === 1
    && q.laufkostenUsd === 0.007537 && q.fachlichBestanden === false
    && cas?.vorgang_id === VORGANG && cas.zustand === "unbekannt"
    && cas.fencing === 2 && cas.ki_aufrufe === 2 && cas.lease_bis === null;
}
function pruefeInhalt(docs, now = Date.now()) {
  try { return docs.length === 15 && inhaltsHash(docs) === INHALT_HASH
    && docs.every(d => d.id !== AUSGESCHLOSSEN && [d.published_at, d.retrieved_at]
      .every(t => Date.parse(t) <= now && Date.parse(t) >= now - 48 * 3600000)); }
  catch { return false; }
}
function ausGesichertenBelegen(alle, belege, now = Date.now()) {
  const original = F16.ausGesichertenBelegen(alle, belege, now);
  if (!pruefeInhalt(alle.filter(d => d.id !== AUSGESCHLOSSEN), now)) throw Error("rest15-eingabe-abweichend");
  const fn = async selected => selected.some(d => d.id === AUSGESCHLOSSEN)
    ? { angefordert: true, ok: false, reason: "rest15-gesperrter-vorgang" } : original(selected);
  versorgungen.add(fn); return fn;
}
module.exports = { REST15, QUITTUNG, EINGABE: F16.EINGABE, AUSGESCHLOSSEN, VORGANG,
  pruefeVorgaenger, pruefeInhalt, ausGesichertenBelegen, istVersorgung: fn => versorgungen.has(fn) };
