"use strict";
// Neue redaktionelle Sollfaelle. Keine Modellleistung und keine Productionfreigabe.
const { hash } = require("../../lib/helmut/briefing-speicher");
const F = require("../../lib/helmut/prosa-faktenplan");
const P = require("../../lib/helmut/prosa-einordnung");
const faelle = [
  { klasse: "finanzen", original: "Der Stadtrat beschliesst einen Zuschuss von 20 Euro fuer Busfahrkarten. Berechtigte erhalten ihn beim Kauf.",
    tatsache: "Der Stadtrat beschliesst einen Zuschuss von 20 Euro fuer Busfahrkarten.",
    option: "Du könntest die Wirkung des Zuschusses auf den Nahverkehr politisch prüfen.",
    falsch: "Die neue Steuer belastet Busfahrkarten zusätzlich.", grund: "Zuschuss wird zur Steuer umgedeutet." },
  { klasse: "vollzug", original: "Das Ministerium prueft die Verlaengerung des Programms. Eine Entscheidung ist noch nicht getroffen.",
    tatsache: "Das Ministerium prueft die Verlaengerung; eine Entscheidung steht noch aus.",
    option: "Du könntest nach dem Stand der Prüfung fragen und dabei die offene Entscheidung benennen.",
    falsch: "Du könntest die beschlossene Verlängerung begrüßen.", grund: "Pruefung wird zum Beschluss, auch im Vorschlag falsch." },
  { klasse: "zuschreibung", original: "In einem Gastbeitrag kritisiert Verband A die Forderung des Verbands B. Die Redaktion macht sich diese Position nicht zu eigen.",
    tatsache: "Verband A kritisiert in einem Gastbeitrag die Forderung von Verband B.",
    option: "Du könntest die Forderung und die Kritik getrennt bewerten, bevor du Stellung beziehst.",
    falsch: "Du könntest die Kritik der Redaktion an Verband A aufgreifen.", grund: "Sprecher und Kritikadressat vertauscht." },
  { klasse: "zeit", original: "Das Ministerium plant die Umsetzung ab 1. September 2027. Ein Termin fuer den Beschluss ist nicht genannt.",
    tatsache: "Die Umsetzung ist ab 1. September 2027 geplant; ein Beschlusstermin ist nicht genannt.",
    option: "Du könntest nach dem noch offenen Beschlusstermin fragen.",
    falsch: "Du könntest dich auf den Beschluss am 1. September 2027 vorbereiten.", grund: "Umsetzungsdatum ist kein Beschlussdatum." },
  { klasse: "profil", original: "Der Verkehrsausschuss beraet ueber die Finanzierung des Nahverkehrs. Ein Auftrag an einzelne Abgeordnete ist nicht genannt.",
    tatsache: "Der Verkehrsausschuss beraet ueber die Finanzierung des Nahverkehrs.",
    option: "Du könntest dich im Rahmen deiner stellvertretenden Ausschussmitgliedschaft auf die Beratung vorbereiten.",
    falsch: "Als Vorsitzender musst du die Finanzierung beschließen.", grund: "Stellvertretung belegt weder Vorsitz noch Pflicht." },
  { klasse: "bedingung", original: "Nur wenn der Stadtrat den Zuschuss beschliesst, kann eine Foerderung moeglich werden. Weitere Voraussetzungen sind nicht genannt. Eine Bewilligung ist nicht zugesagt.",
    tatsache: "Der Beschluss ist eine notwendige Voraussetzung; weitere Voraussetzungen und eine Bewilligung bleiben offen.",
    option: "Du könntest die weiteren Voraussetzungen klären lassen und die offene Bewilligung ausdrücklich benennen.",
    falsch: "Du könntest bei einem Beschluss mit der sicheren Bewilligung rechnen.", grund: "Notwendige Bedingung ist keine Zusage." }
];
function basis(klasse = 0) {
  const c = faelle[klasse];
  const profile = { id: "synthetisch-einordnung", deputyCommittees: ["Verkehrsausschuss"],
    focusTopics: ["Öffentliche Verwaltung"] };
  const quellen = [c, { original: "Das Parlament beraet einen Bericht zur Barrierefreiheit oeffentlicher Gebaeude.",
    tatsache: "Das Parlament beraet einen Bericht zur Barrierefreiheit oeffentlicher Gebaeude." }]
    .map((x, i) => ({ id: "q-" + i, vorgangId: "v-" + i, url: `https://parlament.example/dokument/${i + 12345}`,
      titel: "Synthetischer Bericht " + i, auszug: x.original, veroeffentlichtAm: "2026-09-21T06:00:00Z", satz: x.tatsache }));
  const fakten = quellen.map((q, i) => {
    const satz = q.satz; delete q.satz;
    return { id: "f-" + i, vorgangId: q.vorgangId, quelleId: q.id, quellenHash: hash(q),
      stelle: { feld: "auszug", von: 0, bis: q.auszug.length, kontextVon: 0, kontextBis: q.auszug.length },
      akteur: null, handlung: null, gegenstand: null, aussagegrad: null, verneinung: null,
      zuschreibung: null, bedingung: null, ereigniszeit: null, profilHash: null,
      formulierungen: { ereignis: satz } };
  });
  const b = { quellen, fakten, profile, tag: "2026-09-21",
    feldvertrag: fakten.map((f, i) => ({ pfad: `/fakten/${i}/text`, zweck: "ereignis", vorgangId: f.vorgangId })),
    trustedFreigaben: fakten.map(f => ({ faktId: f.id, faktHash: hash(f), pruefer: "synthetische-redaktion",
      nachweisHash: hash({ klasse, original: quellen.find(q => q.id === f.quelleId) }), tag: "2026-09-21", urteil: "getragen" })) };
  const faktenPlan = { version: F.VERSION, basisHash: F.binde(b).basisHash,
    felder: b.feldvertrag.map((f, i) => ({ pfad: f.pfad, faktId: fakten[i].id, zweck: f.zweck })) };
  return { basis: b, faktenPlan };
}
function entwurf(klasse = 0) {
  return { bloecke: [
    { faktIds: ["f-0"], mandatsbezug: { feld: "schwerpunkt", wert: "Öffentliche Verwaltung" }, einordnung: {
      relevanz: "Für deinen Schwerpunkt Öffentliche Verwaltung könnte die politische Bewertung des Vorgangs hilfreich sein.",
      risiko: null, chance: null, option: faelle[klasse].option, kommunikation: null } },
    { faktIds: ["f-1"], mandatsbezug: { feld: "schwerpunkt", wert: "Öffentliche Verwaltung" }, einordnung: {
      relevanz: "Barrierefreiheit öffentlicher Gebäude könnte für deinen Schwerpunkt Öffentliche Verwaltung ein Ansatzpunkt sein.",
      risiko: null, chance: null, option: "Du könntest konkrete offene Fragen zur Barrierefreiheit für die Beratung sammeln.", kommunikation: null } }
  ] };
}
function urteil(eingabe) {
  return { version: 1, eingabeHash: eingabe.eingabeHash,
    pruefungen: eingabe.bloecke.flatMap(b => P.FELDER.filter(k => b.einordnung[k] !== null).map(feld => ({
      block: b.index, feld, status: "plausibel", ...Object.fromEntries(P.URTEILFELDER.map(k => [k, true])),
      begruendung: "Synthetisches positives Sollurteil: politische Pruefoption auf der angegebenen Grundlage ohne neue Pflicht." }))),
    vergleiche: eingabe.bloecke.flatMap((b, a) => eingabe.bloecke.slice(a + 1).map(c => ({ a, b: c.index,
      eigenstaendigeSachverhalte: true, begruendung: "Zwei verschiedene beschriebene Beratungsgegenstaende." }))) };
}
module.exports = { faelle, basis, entwurf, urteil };
