"use strict";

// Synthetic copy for structural tests only; no claim of political copy quality.
const first = "Der vorliegende Quellenauszug beschreibt eine parlamentarische Beratung zum Thema Pflege. Er nennt den Anlass und beteiligte Stellen, liefert jedoch keinen Beleg für einen heutigen Verfahrensstand. Für eine belastbare Einordnung sollten die genannten Punkte anhand des Originaldokuments geprüft werden. Dabei sind belegte Aussagen und offene Fragen klar auseinanderzuhalten.";
const second = "Auf dieser Grundlage lässt sich die weitere Vorbereitung im Büro gezielt organisieren. Zunächst sind die Aussagen des Auszugs mit dem Originaldokument abzugleichen. Anschließend können offene Sachfragen gebündelt und zusätzliche Belege gesucht werden. Welche Schritte politisch sinnvoll sind, bleibt eine eigenständige Entscheidung. Zuständigkeiten, Termine oder persönliche Positionen werden durch diese Arbeitsgrundlage nicht festgelegt.";
const texts = {
  press: `${first}\n\n${second}`,
  linkedin: `${first}\n\n${second}`,
  x: "Der vorliegende Quellenstand beschreibt eine Beratung zur Pflege. Vor weiteren Schritten sind der aktuelle Sachstand und offene Fragen zu prüfen.",
  instagram: `${first} Wichtig bleibt: Erst die Quellen prüfen und offene Fragen sammeln. Daraus ergibt sich eine belastbare Grundlage für die weitere Arbeit. #Pflege`,
  committee_question: "1. Welche im vorliegenden Auszug genannten Maßnahmen sind durch das Originaldokument belegt?\n\n2. Welche zusätzlichen Informationen werden benötigt, um den aktuellen Sachstand zu klären?",
  citizen_dialogue: `${first}\n\n${second}`,
  internal_line: "- Anlass und Datum der vorliegenden Quelle festhalten.\n- Die Aussagen mit dem Originaldokument abgleichen.\n- Den aktuellen Sachstand anhand weiterer Belege prüfen.\n- Offene Fragen für die weitere Arbeit sammeln.\n- Entscheidungsvorlage ohne erfundene Fristen oder Zuständigkeiten vorbereiten."
};
module.exports = { texts };
