"use strict";

// Acht neue, unabhaengige redaktionelle Sollfaelle fuer den einmaligen
// Modell-Sollfall-Vergleich der Praemissenpruefung (8 Fall Vertrag).
//
// Sie sind synthetisch; keine Behauptungen ueber reale Ereignisse oder Personen.
// Sie ersetzen NICHT die 18 aelteren Methodenfaelle aus prosa-praemissen.js
// (anderer Namespace version=2, eigenes Kennungspraefix "m"). Keine Kennung und
// keine Eingabe der aelteren Faelle wird wiederverwendet.
//
// Die Sollurteile (erwartet) und ihre Begruendungen liegen hier getrennt vom
// eigentlichen Modellpayload: `eingabe` enthaelt ausschliesslich id, quellen,
// profil, mandatsbezug und einordnung. `erwartet`/`begruendung` gelangen NIE
// in den Modellauftrag; sie dienen nur der unabhaengigen Auswertung.
const { hash } = require("../../lib/helmut/briefing-speicher");

const faelle = [
  // ── Sechs negative Sollfaelle (Sollurteil "widersprochen") ────────────────
  { klasse: "finanzen", art: "negativ", erwartet: "widersprochen",
    begruendung: "Ausdruecklich nicht beschlossene Steuererhoehung wird als beschlossen dargestellt.",
    quelle: "Der Gemeinderat beschliesst eine Ruecklage fuer den Haushalt 2027. Eine Erhoehung der Grundsteuer wird ausdruecklich nicht beschlossen.",
    profil: "Mitglied im Gemeinderat.",
    mandatsbezug: "Haushalt und Finanzen",
    einordnung: "Du koenntest die beschlossene Grundsteuererhoehung gegenueber den Anwohnern verteidigen." },
  { klasse: "vollzug", art: "negativ", erwartet: "widersprochen",
    begruendung: "Beratung und Ueberweisung werden als bereits gefasster Beschluss ausgegeben.",
    quelle: "Der Ausschuss ueberweist den Gesetzentwurf zur Beratung. Eine Beschlussfassung steht noch aus.",
    profil: "Mitglied im zustaendigen Ausschuss.",
    mandatsbezug: "Gesetzgebung",
    einordnung: "Du koenntest das beschlossene Gesetz gegenueber deiner Fraktion verteidigen." },
  { klasse: "zuschreibung", art: "negativ", erwartet: "widersprochen",
    begruendung: "Eine persoenliche Einzelmeinung wird zur offiziellen Fraktionsposition umgedeutet.",
    quelle: "Eine einzelne Abgeordnete aeussert in einem Interview ihre persoenliche Einschaetzung. Die Fraktion hat dazu keine gemeinsame Position beschlossen.",
    profil: "Mitglied der Fraktion.",
    mandatsbezug: "Fraktion",
    einordnung: "Du koenntest die offizielle Fraktionsposition zur Reform vertreten." },
  { klasse: "zeit", art: "negativ", erwartet: "widersprochen",
    begruendung: "Der belegte Beschlusstermin (8. Februar 2027) wird mit dem Inkrafttretensdatum (1. Mai 2027) vertauscht.",
    quelle: "Das Landeskabinett beschliesst am 8. Februar 2027 die neue Foerderrichtlinie. Die Richtlinie tritt am 1. Mai 2027 in Kraft.",
    profil: "Mitglied im Landtag.",
    mandatsbezug: "Terminplanung",
    einordnung: "Du koenntest dich auf den Beschluss am 1. Mai 2027 vorbereiten." },
  { klasse: "profil", art: "negativ", erwartet: "widersprochen",
    begruendung: "Eine Stellvertretung wird zum Vorsitz und eine unbelegte Entscheidungspflicht hinzuerfunden.",
    quelle: "Im Haushaltsausschuss fuehrt eine andere Person den Vorsitz. Das Mandat ist ausschliesslich stellvertretendes Mitglied.",
    profil: "Stellvertretendes Mitglied im Haushaltsausschuss.",
    mandatsbezug: "Haushaltsausschuss",
    einordnung: "Als Vorsitzende des Haushaltsausschusses musst du ueber den Haushalt entscheiden." },
  { klasse: "bedingung", art: "negativ", erwartet: "widersprochen",
    begruendung: "Eine notwendige Bedingung wird trotz fehlender Zusage als hinreichende Bewilligung ausgegeben.",
    quelle: "Nur wenn der Antrag bis zum 30. Juni eingeht, kann die Foerderung geprueft werden. Eine Bewilligung ist damit nicht zugesagt.",
    profil: "Mitglied im Gemeinderat.",
    mandatsbezug: "Foerderverfahren",
    einordnung: "Wer fristgerecht einreicht, dem ist die Foerderung sicher bewilligt." },

  // ── Zwei positive Kontrollfaelle (Sollurteil "tragfaehig") ────────────────
  { klasse: "profilbezug", art: "positiv", erwartet: "tragfaehig",
    begruendung: "Mitgliedschaft und Beratung im selben Ausschuss sind belegt; die Vorbereitung ist eine reine Moeglichkeit ohne neue Tatsache oder Befugnis.",
    quelle: "Der Ausschuss fuer Arbeit und Soziales beraet ueber die Reform der Grundsicherung. Ein Beschluss ist nicht gefasst.",
    profil: "Mitglied im Ausschuss fuer Arbeit und Soziales.",
    mandatsbezug: "Ausschuss fuer Arbeit und Soziales",
    einordnung: "Du koenntest dich als Mitglied des Ausschusses fuer Arbeit und Soziales auf die Beratung zur Grundsicherung vorbereiten." },
  { klasse: "beschlussfrist", art: "positiv", erwartet: "tragfaehig",
    begruendung: "Beschluss und eigene, zum Beschluss gehoerende Frist sind ausdruecklich genannt; das Begruessen ist eine freiwillige Bewertung ohne neue Tatsache oder angenommene Leserposition.",
    quelle: "Der Stadtrat beschliesst am 3. Mai 2027 die Erhoehung des Zuschusses fuer den Nahverkehr. Die Erhoehung tritt am 1. Juli 2027 in Kraft.",
    profil: "Mitglied im Stadtrat.",
    mandatsbezug: "Nahverkehr",
    einordnung: "Du koenntest die beschlossene Zuschusserhoehung ab dem 1. Juli 2027 begruessen." }
];

function corpus() {
  return faelle.map(f => {
    const id = "m" + hash({ version: 2, klasse: f.klasse, art: f.art }).slice(0, 12);
    return { klasse: f.klasse, art: f.art, erwartet: f.erwartet, begruendung: f.begruendung,
      eingabe: { id,
        quellen: [{ id: id + "q", text: f.quelle }],
        profil: [{ id: id + "p", text: f.profil }],
        mandatsbezug: f.mandatsbezug, einordnung: f.einordnung } };
  });
}

function eingaben() { return corpus().map(r => r.eingabe); }

module.exports = { faelle, corpus, eingaben };
