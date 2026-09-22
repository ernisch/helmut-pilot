"use strict";

// 18 kanonische Fachfaelle (6 Sachklassen x 3 Fallarten) fuer den 36er Vertrag
// (docs/betrieb/prosa-36er-vertrag-2026-09-21.md). Daraus entstehen 36 Pfadfaelle
// durch die zwei echten Bereiche des Produktpfads: `briefing` und `lage`.
//
// Synthetisch; keine Behauptungen ueber reale Ereignisse. Die Sollurteile
// (`erwartet`) liegen getrennt vom Modellpayload und gehen NIE in den Auftrag ein.
// Die Eingaben folgen dem echten Vertrag `lib/helmut/prosa-faktenplan.js`;
// die Einordnung dem echten Vertrag `lib/helmut/prosa-einordnung.js`.
const { hash } = require("../../lib/helmut/briefing-speicher");
const F = require("../../lib/helmut/prosa-faktenplan");
const P = require("../../lib/helmut/prosa-einordnung");

const BEREICHE = Object.freeze(["briefing", "lage"]);
const ARTEN = Object.freeze(["negativ", "positiv", "unklar"]);
const TAG = "2026-09-21";
const PROFILE = Object.freeze({ id: "synthetisch-36er", deputyCommittees: ["Verkehrsausschuss"],
  focusTopics: ["Oeffentliche Verwaltung"] });

// Je Sachklasse: eine Quelle, die tragende Tatsache, ein tragfaehiger Vorschlag
// (positiv), eine sachlich falsche Aussage (negativ) und eine ehrliche Aussage
// ueber die offene Grundlage (unklar). Die Inhalte sind redaktionelle Sollfaelle.
const faelle = [
  { klasse: "sachgebiet-finanzwirkung",
    quelle: "Der Stadtrat beschliesst einen Zuschuss von 20 Euro fuer Busfahrkarten. Berechtigte erhalten ihn beim Kauf.",
    tatsache: "Der Stadtrat beschliesst einen Zuschuss von 20 Euro fuer Busfahrkarten.",
    relevanz: "Für deinen Schwerpunkt Oeffentliche Verwaltung ist konkret relevant, dass der Stadtrat einen 20-Euro-Zuschuss für Busfahrkarten beschlossen hat; daran lässt sich die politische Wirkung der Förderung auf den Nahverkehr bewerten.",
    positiv: "Du koenntest die Wirkung des Zuschusses auf den Nahverkehr politisch pruefen.",
    negativ: "Die neue Steuer belastet Busfahrkarten zusätzlich.",
    unklar: "Ueber die Gegenfinanzierung des Zuschusses ist nichts gesagt; dazu laesst sich nichts belegen." },
  { klasse: "vollzug-modalitaet",
    quelle: "Das Ministerium prueft die Verlaengerung des Programms. Eine Entscheidung ist noch nicht getroffen.",
    tatsache: "Das Ministerium prueft die Verlaengerung; eine Entscheidung steht noch aus.",
    relevanz: "Für deinen Schwerpunkt Oeffentliche Verwaltung ist konkret relevant, dass nur die Verlängerung geprüft wird und noch keine Entscheidung getroffen ist; politische Bewertung und Kommunikation müssen diesen offenen Entscheidungsstand berücksichtigen.",
    positiv: "Du koenntest nach dem Stand der Prüfung fragen und dabei die offene Entscheidung benennen.",
    negativ: "Du koenntest die beschlossene Verlängerung begrüßen.",
    unklar: "Ob eine Entscheidung faellt, ist nicht gesagt; ein Beschluss laesst sich nicht behaupten." },
  { klasse: "rolle-zuschreibung",
    quelle: "In einem Gastbeitrag kritisiert Verband A die Forderung des Verbands B. Die Redaktion macht sich diese Position nicht zu eigen.",
    tatsache: "Verband A kritisiert in einem Gastbeitrag die Forderung von Verband B.",
    relevanz: "Für deinen Schwerpunkt Oeffentliche Verwaltung ist konkret relevant, dass Verband A die Forderung von Verband B kritisiert und die Redaktion diese Position nicht übernimmt; eine politische Bewertung muss die Rollen getrennt halten.",
    positiv: "Du koenntest die Forderung und die Kritik getrennt bewerten, bevor du Stellung beziehst.",
    negativ: "Du koenntest die Kritik der Redaktion an Verband A aufgreifen.",
    unklar: "Wie die Redaktion selbst zu der Forderung steht, ist nicht genannt." },
  { klasse: "zeit-frist",
    quelle: "Das Ministerium plant die Umsetzung ab 1. September 2027. Ein Termin fuer den Beschluss ist nicht genannt.",
    tatsache: "Die Umsetzung ist ab 1. September 2027 geplant; ein Beschlusstermin ist nicht genannt.",
    relevanz: "Für deinen Schwerpunkt Oeffentliche Verwaltung ist konkret relevant, dass die Umsetzung ab 1. September 2027 geplant ist, aber kein Beschlusstermin genannt wird; Vorbereitung und Kommunikation müssen diese beiden Zeitpunkte auseinanderhalten.",
    positiv: "Du koenntest nach dem noch offenen Beschlusstermin fragen.",
    negativ: "Du koenntest dich auf den Beschluss am 1. September 2027 vorbereiten.",
    unklar: "Ein Beschlusstermin ist nicht genannt; eine Vorbereitung darauf waere unbelegt." },
  { klasse: "profil-zustaendigkeit",
    quelle: "Der Verkehrsausschuss beraet ueber die Finanzierung des Nahverkehrs. Ein Auftrag an einzelne Abgeordnete ist nicht genannt.",
    tatsache: "Der Verkehrsausschuss beraet ueber die Finanzierung des Nahverkehrs.",
    relevanz: "Für deinen Schwerpunkt Oeffentliche Verwaltung ist konkret relevant, dass der Verkehrsausschuss die Finanzierung des Nahverkehrs berät; das gibt einen sachlichen Anlass zur Vorbereitung auf die Beratung.",
    positiv: "Du koenntest dich im Rahmen deiner stellvertretenden Ausschussmitgliedschaft auf die Beratung vorbereiten.",
    negativ: "Als Vorsitzender musst du die Finanzierung beschließen.",
    unklar: "Ein Auftrag an einzelne Abgeordnete ist nicht genannt." },
  { klasse: "bedingte-wirkung",
    quelle: "Nur wenn der Stadtrat den Zuschuss beschliesst, kann eine Foerderung moeglich werden. Weitere Voraussetzungen sind nicht genannt. Eine Bewilligung ist nicht zugesagt.",
    tatsache: "Der Beschluss ist eine notwendige Voraussetzung; weitere Voraussetzungen und eine Bewilligung bleiben offen.",
    relevanz: "Für deinen Schwerpunkt Oeffentliche Verwaltung ist konkret relevant, dass ein Stadtratsbeschluss nur eine notwendige Voraussetzung für eine mögliche Förderung ist; weitere Voraussetzungen und eine Bewilligung bleiben offen.",
    positiv: "Du koenntest die weiteren Voraussetzungen klaeren lassen und die offene Bewilligung ausdrücklich benennen.",
    negativ: "Du koenntest bei einem Beschluss mit der sicheren Bewilligung rechnen.",
    unklar: "Ob weitere Voraussetzungen erfuellt sind, ist nicht genannt; eine Bewilligung ist nicht zugesagt." }
];

// Eingabe fuer den echten Faktenvertrag. Gleiche Quelle je Klasse; die
// Einordnung unterscheidet nur die Fallart.
function basis(klasse) {
  const c = faelle[klasse];
  const quellen = [
    { id: "q-0", vorgangId: "v-0", url: "https://parlament.example/dokument/" + (12345 + klasse),
      titel: "Synthetischer Bericht " + klasse, auszug: c.quelle, veroeffentlichtAm: TAG + "T06:00:00Z" },
    { id: "q-1", vorgangId: "v-1", url: "https://parlament.example/dokument/" + (12445 + klasse),
      titel: "Synthetischer Bericht " + klasse + " (Hintergrund)",
      auszug: "Das Parlament beraet einen Bericht zur Barrierefreiheit oeffentlicher Gebaeude.",
      veroeffentlichtAm: TAG + "T06:30:00Z" }
  ];
  const fakten = [
    { id: "f-0", quelleId: "q-0", vorgangId: "v-0", formulierungen: { ereignis: c.tatsache } },
    { id: "f-1", quelleId: "q-1", vorgangId: "v-1",
      formulierungen: { ereignis: "Das Parlament beraet einen Bericht zur Barrierefreiheit oeffentlicher Gebaeude." } }
  ].map(f => {
    const q = quellen.find(x => x.id === f.quelleId);
    return { ...f, quellenHash: hash(q),
      stelle: { feld: "auszug", von: 0, bis: q.auszug.length, kontextVon: 0, kontextBis: q.auszug.length },
      akteur: null, handlung: null, gegenstand: null, aussagegrad: null, verneinung: null,
      zuschreibung: null, bedingung: null, ereigniszeit: null, profilHash: null };
  });
  const b = { quellen, fakten, profile: { ...PROFILE }, tag: TAG,
    feldvertrag: fakten.map((f, i) => ({ pfad: `/fakten/${i}/text`, zweck: "ereignis", vorgangId: f.vorgangId })),
    trustedFreigaben: fakten.map(f => ({ faktId: f.id, faktHash: hash(f), pruefer: "synthetische-redaktion",
      nachweisHash: hash({ klasse, faktId: f.id }), tag: TAG, urteil: "getragen" })) };
  const faktenPlan = { version: F.VERSION, basisHash: F.binde(b).basisHash,
    felder: b.feldvertrag.map((f, i) => ({ pfad: f.pfad, faktId: fakten[i].id, zweck: f.zweck })) };
  return { basis: b, faktenPlan };
}

// Entwurf je Fallart. Zwei Bloecke, damit derselbe Entwurf fuer `briefing`
// (1-4) und `lage` (2-4) gueltig ist. Nur Block 0 traegt die Fallart-Aussage.
function entwurf(klasse, art) {
  const c = faelle[klasse];
  const aussage = { negativ: c.negativ, positiv: c.positiv, unklar: c.unklar }[art];
  return { bloecke: [
    { faktIds: ["f-0"], mandatsbezug: { feld: "schwerpunkt", wert: "Oeffentliche Verwaltung" }, einordnung: {
      relevanz: c.relevanz,
      risiko: null, chance: null, option: aussage, kommunikation: null } },
    { faktIds: ["f-1"], mandatsbezug: { feld: "schwerpunkt", wert: "Oeffentliche Verwaltung" }, einordnung: {
      relevanz: "Für deinen Schwerpunkt Oeffentliche Verwaltung ist konkret relevant, dass das Parlament Barrierefreiheit öffentlicher Gebäude berät; das gibt einen sachlichen Anlass, Umsetzungsfragen für die weitere Beratung zu strukturieren.",
      risiko: null, chance: null,
      option: "Du könntest konkrete offene Fragen zur Barrierefreiheit für die Beratung sammeln.", kommunikation: null } }
  ] };
}

// Sollurteil je Fallart (getrennt vom Modellpayload).
function erwartet(art) {
  if (art === "positiv") return "akzeptiert";
  return "nicht-akzeptiert";
}

// 18 Fachfaelle x zwei Bereiche = 36 Pfadfaelle.
function pfadfaelle() {
  const out = [];
  for (let k = 0; k < faelle.length; k += 1) {
    for (const art of ARTEN) {
      for (const bereich of BEREICHE) {
        out.push({ id: `${faelle[k].klasse}/${art}/${bereich}`, klasse: faelle[k].klasse, klasseIndex: k,
          art, bereich, erwartet: erwartet(art), ...basis(k), entwurf: entwurf(k, art) });
      }
    }
  }
  return out;
}

// Eingefrorenes Paket: die 36 Pfadfaelle bestimmen den Pakethash. Keine Sollurteile
// im Auftrag; `entwurf` ist der redaktionelle Sollentwurf, nicht der Modellauftrag.
function paket() {
  const faelleListe = pfadfaelle();
  const basisHashes = Object.fromEntries(faelleListe.map(f =>
    [f.id, P.binde({ basis: f.basis, faktenPlan: f.faktenPlan, bereich: f.bereich }).basisHash]));
  return { faelle: faelleListe, basisHashes,
    paketHash: hash({ faelle: faelleListe.map(f => ({ id: f.id, klassen: f.klasse, art: f.art,
      bereich: f.bereich, erwartet: f.erwartet, basis: f.basis, faktenPlan: f.faktenPlan, entwurf: f.entwurf })),
      scope: "36-Pfadfaelle-18-Fachfaelle-zwei-Bereiche-ein-Lauf-kein-Retry" }) };
}

module.exports = { BEREICHE, ARTEN, TAG, PROFILE, faelle, basis, entwurf, erwartet, pfadfaelle, paket };
