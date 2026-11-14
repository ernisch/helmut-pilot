"use strict";

// Ein fehlender Profiltreffer ist kein bestaetigtes negatives Fachurteil.
// Auch ein wortgleich belegtes Themenlabel belegt noch keine abgeschlossene
// semantische Einordnung (helmut_fachthemen.semantischePruefung bleibt offen).
// Dieser Leser erzeugt weder neue Treffer noch einen anderen Decisionwert.
const { tagesAnlass } = require("./briefing-bereichsvertrag");
const MERKMALE = new Set(["partei", "ausschuss", "wahlkreis", "thema"]);

function positiverProfilbezug(ko, decisions, profilId) {
  return decisions.some(d => d && d.knowledge_object_id === ko.id
    && d.user_id === profilId
    && Array.isArray(d.matched_features)
    && d.matched_features.some(f => f && MERKMALE.has(f.type)
      && typeof f.value === "string" && f.value.trim()));
}

function aktuellerFachstandOffen({ vorgaenge = [], decisions = [], profilId = null,
  jetzt = new Date(), fenster = null } = {}) {
  if (!profilId || !Number.isFinite(new Date(jetzt).getTime())) return false;
  return vorgaenge.some(({ ko, docs }) => ko && ko.id
    && !positiverProfilbezug(ko, decisions, profilId)
    // Leere KO-/Profildaten lassen nur den bestehenden Publikationsbeleg zu:
    // keine Frist, kein vermuteter Mandatsbezug, kein heutiges KO-Update.
    && tagesAnlass(docs, jetzt, fenster)?.art === "neue-quelle");
}

module.exports = { aktuellerFachstandOffen };
