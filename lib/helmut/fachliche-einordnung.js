"use strict";

// Fehlende Fachzuordnung ist etwas anderes als eine vollstaendig technisch
// angenommene Zuordnung ohne Profiltreffer. Letztere erlaubt NoPriority, keine
// fachliche Vollabnahme oder Entwarnung. Keine neuen Treffer/Decisionwerte.
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
    && tagesAnlass(docs, jetzt, fenster)?.art === "neue-quelle"
    && !require("./understanding-fachthemen").vollstaendigGebunden(ko, docs));
}

module.exports = { aktuellerFachstandOffen };
