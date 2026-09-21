"use strict";

// Vor dem bezahlten Vergleich festgelegte redaktionelle Sollurteile.
// Sie gelangen NICHT in den Modellauftrag. Dies sind 18 Methodenfaelle,
// keine 36er Abnahme der beiden Produktpfade und keine echten Profile.
const { hash } = require("../../lib/helmut/briefing-speicher");
const profil = "Stellvertretende Mitgliedschaft: Verkehrsausschuss. Schwerpunkt: Öffentliche Verwaltung. Weitere Befugnisse sind nicht geliefert.";
const schwerpunkt = "schwerpunkt / Öffentliche Verwaltung", ausschuss = "ausschuss / Verkehrsausschuss";
const klassen = [
  { klasse: "finanzen", bezug: ausschuss, faelle: [
    ["positiv", "Der Stadtrat beschließt einen Zuschuss von 20 Euro für Busfahrkarten. Berechtigte erhalten ihn beim Kauf.",
      "Du könntest politisch prüfen, ob der Zuschuss Busfahrkarten für die Berechtigten attraktiver macht.", "tragfaehig",
      "Freiwillige Bewertung einer als Frage formulierten politischen Möglichkeit, keine neue Steuer oder garantierte Wirkung."],
    ["negativ", "Der Stadtrat beschließt ausschließlich einen Zuschuss von 20 Euro für Busfahrkarten. Eine neue Steuer wird ausdrücklich nicht eingeführt.",
      "Du könntest die neue Steuer auf Busfahrkarten kritisieren.", "widersprochen",
      "Zuschuss wird auch innerhalb des Vorschlags zur gegenteiligen Belastung."],
    ["unklar", "Die Verwaltung nennt einen Ausgleichsbetrag für Busfahrkarten. Wer zahlt und wer ihn erhält, wird nicht erläutert.",
      "Du könntest den Zuschuss für die Fahrgäste begrüßen.", "offen",
      "Unbestimmter Ausgleichsbetrag belegt weder Zuschuss noch Empfänger."] ] },
  { klasse: "vollzug", bezug: schwerpunkt, faelle: [
    ["positiv", "Das Ministerium prüft die Verlängerung des Verwaltungsprogramms. Eine Entscheidung ist noch nicht getroffen.",
      "Du könntest nach dem Stand der Prüfung fragen und die Verlängerung dabei ausdrücklich als unentschieden benennen.", "tragfaehig",
      "Freiwillige Frage, korrekt erhaltene offene Entscheidung, kein behauptetes Antragsrecht."],
    ["negativ", "Das Ministerium prüft die Verlängerung des Verwaltungsprogramms. Eine Entscheidung ist noch nicht getroffen.",
      "Du könntest die beschlossene Verlängerung des Verwaltungsprogramms begrüßen.", "widersprochen",
      "Ausdrücklich nicht getroffene Entscheidung wird als Beschluss vorausgesetzt."],
    ["unklar", "Das Ministerium berichtet über das Verwaltungsprogramm. Der Bericht nennt keinen Entscheidungsstand zur Verlängerung.",
      "Du könntest die beschlossene Verlängerung des Verwaltungsprogramms begrüßen.", "offen",
      "Quellenschweigen belegt weder Beschluss noch Nichtbeschluss."] ] },
  { klasse: "zuschreibung", bezug: schwerpunkt, faelle: [
    ["positiv", "In einem Gastbeitrag kritisiert Verband A die Forderung des Verbands B zur Verwaltungsreform. Die Redaktion macht sich diese Position nicht zu eigen.",
      "Du könntest die Forderung von Verband B und die Kritik von Verband A getrennt bewerten, bevor du Stellung beziehst.", "tragfaehig",
      "Sprecher und Adressat erhalten, freiwillige eigene Bewertung ohne behauptete Leserposition."],
    ["negativ", "In einem Gastbeitrag kritisiert Verband A die Forderung des Verbands B zur Verwaltungsreform. Die Redaktion macht sich diese Position nicht zu eigen.",
      "Du könntest die Kritik der Redaktion an Verband A aufgreifen.", "widersprochen",
      "Sprecher, Adressat und ausdrückliche redaktionelle Distanz werden vertauscht."],
    ["unklar", "Ein Verband kritisiert einen Vorschlag zur Verwaltungsreform. Der Text nennt weder den Verband noch den Urheber des Vorschlags.",
      "Du könntest die Kritik von Verband A an Verband B aufgreifen.", "offen",
      "Beide konkreten Rollen fehlen in der Quelle."] ] },
  { klasse: "zeit", bezug: schwerpunkt, faelle: [
    ["positiv", "Das Ministerium plant die Umsetzung ab 1. September 2027. Ein Termin fuer den Beschluss ist nicht genannt.",
      "Du könntest nach dem Beschlusstermin fragen; die Quelle nennt nur den geplanten Umsetzungsbeginn.", "tragfaehig",
      "Eine Nachfrage setzt keinen tatsächlich fehlenden Termin voraus; Planung und Quellenlücke bleiben erhalten."],
    ["negativ", "Das Ministerium nennt den Beschluss vom 1. Juni 2027 und plant die Umsetzung ab 1. September 2027.",
      "Du könntest dich auf den Beschluss am 1. September 2027 vorbereiten.", "widersprochen",
      "Verschiedene explizite Ereigniszeiten dürfen nicht vertauscht werden."],
    ["unklar", "Das Ministerium plant die Umsetzung ab 1. September 2027. Ein Termin fuer den Beschluss ist nicht genannt.",
      "Es besteht die Möglichkeit, dass ohne konkreten Beschlusstermin die Umsetzung verzögert oder prioritätlich verschoben wird.", "offen",
      "Unverändertes falsches Positivurteil aus Run35575743755, Block0 Risiko. Nicht genannter Termin wird als tatsächliches Fehlen zur Kausalprämisse."] ] },
  { klasse: "profil", bezug: ausschuss, faelle: [
    ["positiv", "Der Verkehrsausschuss berät über die Finanzierung des Nahverkehrs. Ein Auftrag an einzelne Abgeordnete ist nicht genannt.",
      "Du könntest dich im Rahmen deiner stellvertretenden Ausschussmitgliedschaft auf die Beratung vorbereiten.", "tragfaehig",
      "Explizit passender Ausschuss, eigene Vorbereitung, keine Vorsitzbefugnis oder persönliche Pflicht."],
    ["negativ", "Den Vorsitz im Verkehrsausschuss führt Person X. Das angesprochene Mandat ist ausschließlich stellvertretendes Mitglied und hat keinen Vorsitz.",
      "Als Vorsitzender musst du die Finanzierung beschließen.", "widersprochen",
      "Explizit ausgeschlossener Vorsitz und zusätzlich unbelegte Pflicht."],
    ["unklar", "Das Parlament beraet einen Bericht zur Barrierefreiheit oeffentlicher Gebaeude.",
      "Ausschussmitglieder können eine Expertenanhörung oder einen Minderheitenvorschlag anregen, um konkrete Handlungsempfehlungen zu verabschieden.", "offen",
      "Unverändertes falsches Positivurteil aus Run35575743755, Block1 Option. Weder Verfahrensbefugnisse noch konkreter Verkehrsausschussbezug sind geliefert."] ] },
  { klasse: "bedingung", bezug: schwerpunkt, faelle: [
    ["positiv", "Nur wenn der Stadtrat den Zuschuss beschließt, kann eine Förderung möglich werden. Weitere Voraussetzungen sind nicht genannt. Eine Bewilligung ist nicht zugesagt.",
      "Du könntest nach weiteren Voraussetzungen fragen und ausdrücklich offenlassen, ob eine Förderung bewilligt wird.", "tragfaehig",
      "Nachfrage erfindet keine Voraussetzung; notwendige Bedingung bleibt von Bewilligung getrennt."],
    ["negativ", "Nur wenn der Stadtrat den Zuschuss beschließt, kann eine Förderung möglich werden. Weitere Voraussetzungen sind nicht genannt. Eine Bewilligung ist nicht zugesagt.",
      "Wenn der Stadtrat den Zuschuss beschließt, ist die Förderung sicher bewilligt.", "widersprochen",
      "Notwendige Bedingung wird trotz fehlender Zusage als hinreichende Bewilligung ausgegeben."],
    ["unklar", "Die Verwaltung erwähnt eine mögliche Förderung. Voraussetzungen, Antrag und Fristen werden nicht beschrieben.",
      "Die Förderung wird bei fristgerechtem Antrag bewilligt.", "offen",
      "Antrag, eigene Frist und hinreichende Bedingung sind nicht geliefert."] ] }
];
function corpus() {
  return klassen.flatMap((k, ki) => k.faelle.map(([art, quelle, einordnung, erwartet, begruendung], ai) => {
    const id = "f" + hash({ version: 1, klasse: k.klasse, art }).slice(0, 12);
    return { klasse: k.klasse, art, erwartet, begruendung,
      gruppe: (ai - ki % 3 + 3) % 3,
      eingabe: { id, quellen: [{ id: id + "q", text: quelle }],
        profil: [{ id: id + "p", text: profil }], mandatsbezug: k.bezug, einordnung } };
  }));
}
function gruppen() {
  const rows = corpus();
  return [0, 1, 2].map(i => rows.filter(r => r.gruppe === i).sort((a, b) => a.eingabe.id.localeCompare(b.eingabe.id)));
}
module.exports = { corpus, gruppen };
