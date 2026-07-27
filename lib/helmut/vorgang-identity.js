"use strict";

// Helmut — Vorgangsidentitaet (Ankerbildung, Clusterbildung, Vorgangskennung).
// =============================================================================
// REINE LOGIK: kein Netz, keine KI, keine Datenbank, kein Zufall, keine Uhr
// (jede Zeitangabe kommt als Parameter herein). Damit ist jede Entscheidung
// dieses Moduls reproduzierbar und einzeln testbar.
//
// WARUM ES DIESES MODUL GIBT (Betriebsbefund B4, docs/befund-csd-2026-vorgangsverlust.md):
// Die alte Vorgangsbildung in understanding.js hat drei Aufgaben in drei Zeilen
// vermischt und dabei politisch relevante Ereignisse lautlos verloren:
//
//   V1  anchorTokens() verlangte >= 8 Zeichen. Die Leitvokabeln eines Ereignisses
//       ("CSD", "Berlin", "Angriff", "Merz", "Wegner", "Polizei") sind kuerzer —
//       ein solches Ereignis konnte STRUKTURELL keinen eigenen Vorgang bilden.
//   V2  anchorsMatch() verglich per Teilstring (a.includes(b)). Ueber ein
//       Allerweltswort ("menschen") landeten fachfremde Dokumente im selben
//       Vorgang — dieselbe Konstruktion, die als F-3 den Recovery-Pfad zerstoert hat.
//   V3  deriveVorgangId() reduzierte einen Cluster auf EIN Wort. Diese Kennung war
//       zugleich fachliche Identitaet UND technischer Eindeutigkeitsschluessel.
//       Traf das Wort einen aelteren, fachfremden Vorgang, galt das neue Ereignis
//       als "schon verstanden".
//
// LEITENTSCHEIDUNG DIESES MODULS: fachliche Identitaet und technische
// Eindeutigkeit werden getrennt.
//   - Die KENNUNG (deriveVorgangId) ist ein VORSCHLAG. Sie traegt Themenwurzel,
//     Ereignistag und eine Kurzpruefsumme der Ankermenge und ist damit zwischen
//     verschiedenen Ereignissen praktisch kollisionsfrei.
//   - Ob zwei Dokumentmengen DERSELBE Vorgang sind, entscheidet nicht der
//     Zeichenkettenvergleich der Kennung, sondern der Belegvergleich
//     (sameVorgang): Ankerueberdeckung + Zeitfenster + Jahres-/Datumskonflikt.
//     Das passiert in understanding.js gegen echte Kandidaten aus der Datenbank.
// Eine gleiche Kennung bedeutet deshalb NIE mehr "ignoriere das neue Dokument".
//
// BEWUSSTE GRENZEN (ehrlich, nicht kaschiert):
//   - Zwei verschiedene Ereignisse am selben Ort, im selben Crawl-Stapel, ohne
//     jede Zeitangabe im Text und mit gleichem Vokabular sind hier nicht
//     trennbar. Getrennt werden sie ueber den Ereignistag in der Kennung, sobald
//     sie in verschiedenen Laeufen ankommen — und ueber Jahres-/Datumsangaben im
//     Text, wenn welche vorhanden sind (haeufigster Realfall: historischer
//     Rueckblick vs. aktuelles Ereignis).
//   - Zusammenhangskomponenten koennen ketten (A~B, B~C, aber A!~C). Die
//     Zwei-Anker-Regel macht das selten; gegen Restketten wirkt die Kernanker-
//     Nachpruefung in clusterRawDocuments.

const crypto = require("crypto");
// HOTFIX B4-4: Herausgebernamen duerfen niemals Vorgangsidentitaet erzeugen.
// Begruendung, Messwerte und verworfene Alternativen stehen im Modul selbst.
const { istHerausgeberAnker, titelRumpf, herausgeberWoerter } = require("./herausgeber");

// --- Schwellenwerte (an einer Stelle, damit sie messbar und aenderbar sind) ---

// Mindestlaenge eines normalen Wortankers. 8 (alt) war auf deutsche Komposita
// zugeschnitten und blind fuer Ereignisvokabular; 5 traegt "merz" nicht, aber
// "berlin", "wegner", "polizei", "angriff".
const ANCHOR_MIN_LEN = 5;

// Kurzformen/Abkuerzungen sind starke Identitaetstraeger und fast immer kurz
// ("CSD", "AfD", "EuGH", "BSW"). Sie werden ueber die GROSSSCHREIBUNG im
// Originaltext erkannt, nicht ueber die Laenge.
const ACRONYM_MIN_LEN = 3;
const ACRONYM_MAX_LEN = 6;

// Komposit-Enthalten ("Tariftreuegesetz" in "Bundestariftreuegesetz") bleibt
// erlaubt — aber erst ab einer echten Wortwurzel. Genau diese Untergrenze fehlte:
// mit ihr kann "menschen" (8) nicht mehr in "menschenmenge" hineinmatchen.
const COMPOUND_MIN_LEN = 10;

// Flexion/Ableitung am Wortanfang: berlin ~ berlins ~ berliner, angriff ~ angriffe.
const PREFIX_MAX_DELTA = 3;

// BEWEISGEWICHT statt blosser Ankerzahl. Ein einzelnes gemeinsames
// Allerweltswort reicht nicht mehr (das ist die eigentliche Reparatur von V2) —
// aber ein einzelner sehr spezifischer Beleg genuegt. Bewertung je Ankerpaar:
//   Gewicht 2  ein sehr langer, nicht generischer Anker stimmt exakt ueberein
//              ODER eine Abkuerzung stimmt exakt ueberein ("CSD")
//              ODER ein Wort steckt als Wurzel in einem Kompositum des anderen
//              Textes ("Tariftreue" in "Tariftreuegesetz") — deutsche Komposita
//              sind hochspezifisch, das ist ein starker Beleg
//   Gewicht 1  jeder andere Treffer (gleiches Wort, Flexionsform)
// Zusammengehoerigkeit ab MIN_BEWEISGEWICHT.
//
// HOTFIX B4-3: das Gewicht wird NICHT mehr je Rohtreffer summiert, sondern je
// BEWEISFAMILIE (siehe unten). Sonst zaehlen zwei Flexionsformen desselben Wortes
// als zwei unabhaengige Belege — genau der Production-Fehler vom 2026-07-27.
const MIN_BEWEISGEWICHT = 2;

// Ein Anker mit 3 oder 4 Zeichen kann STRUKTURELL nur eine Abkuerzung sein:
// normale Woerter brauchen ANCHOR_MIN_LEN (5), Jahreszahlen werden vorher
// abgefangen. Abkuerzungen sind die staerksten Identitaetstraeger der politischen
// Berichterstattung ("CSD", "AfD", "EuGH"), tragen aber wegen ihrer Kuerze nie
// die Laengenschwelle STRONG_ANCHOR_LEN. Ohne diese Regel waere "CSD" ein
// schwaecherer Beleg als ein beliebiges zwoelfbuchstabiges Wort.
const ACRONYM_STRONG_MAX_LEN = 4;

// AUSNAHME zur Abkuerzungsregel: Kuerzel, die in praktisch jeder politischen
// Meldung vorkommen (Parteien, Fraktionen, Sender, Agenturen, Staatenbloecke).
// Sie sind spezifisch, beschreiben aber kein EREIGNIS — "beide Meldungen nennen
// die SPD" darf niemals allein eine Vorgangsidentitaet beweisen. Sie behalten
// deshalb Gewicht 1 und bleiben damit ein ZUSATZbeleg.
const HAEUFIGE_ABKUERZUNGEN = new Set([
  "spd", "cdu", "csu", "afd", "fdp", "bsw", "npd", "mdb", "mdl", "mdep",
  "ard", "zdf", "dpa", "afp", "rbb", "mdr", "wdr", "ndr", "swr", "brd", "ddr",
  "eu", "usa", "uno", "nato", "bund", "bmi"
]);

// Ab dieser Laenge gilt ein exakt gleicher, nicht generischer Anker allein als
// Beleg ("vergesellschaftung", "emissionshandel").
const STRONG_ANCHOR_LEN = 12;

// Ein Nachrichtenzyklus. Liegen zwei Meldungen weiter auseinander, ist ein
// gemeinsames Ereignis nicht mehr die naheliegende Erklaerung -> hoehere
// Beweislast. Belegter Grenzfall: zwei Fahrzeugangriffe in Berlin an
// aufeinanderfolgenden Tagen teilen "Berlin" und "Fahrzeug" — das genuegt
// innerhalb eines Zyklus, ueber einen Tag hinaus aber nicht.
// Ein sich entwickelndes Ereignis bleibt trotzdem zusammen: seine Meldungen
// tragen typischerweise drei und mehr gemeinsame Sachanker und haengen ausserdem
// ueber die zeitlich naeher liegenden Zwischenmeldungen aneinander.
const EVENT_WINDOW_HOURS = 24;
const FERN_MIN_BEWEISGEWICHT = 3;

// SICHERHEITSVENTIL gegen Digest-Cluster INNERHALB EINES LAUFS.
// EHRLICHE GRENZE (Production-Befund B4-2, 2026-07-27): dieses Ventil begrenzt
// nur die Clusterbildung eines einzelnen Laufs. Es begrenzt NICHT, wie viele
// Dokumente ein bereits bestehender Vorgang ueber resolveVorgang()/sameVorgang()
// ueber Laufe hinweg einsammelt — dort waechst ein thematisch gemischter Vorgang
// selbstverstaerkend weiter (gemessen: 13 -> 65 Dokumente in einem Lauf).
// Die Korrektur ist ein eigener Sprint: docs/befund-csd-2026-vorgangsverlust.md §12b.
// Zusammenhangskomponenten koennen ueber
// Ketten wachsen (A~B, B~C, aber A!~C). Ein Cluster aus Dutzenden Dokumenten
// ergaebe EIN Knowledge Object aus einem Prompt, der nur die ersten zwoelf
// Dokumente sieht — also genau den Multi-Themen-Digest, der als F-3 schon einmal
// einen Production-Rueckrollfall verursacht hat (CURRENT_STATE.md §5). Ab dieser
// Groesse wird die Komponente deshalb an ihrem staerksten Dokument neu gebunden:
// drin bleibt nur, wer eine DIREKTE Kante dorthin hat, der Rest wird erneut
// geclustert. Deterministisch, reihenfolgeunabhaengig, endlich.
const MAX_CLUSTER_DOKUMENTE = 60;

// Historischer Rueckblick vs. aktuelles Ereignis: erst ab diesem Jahresabstand
// gelten zwei Texte als verschiedene Zeitraeume. 1 Jahr Abstand waere zu streng —
// ein Jahreswechsel zwischen Ereignis und Bericht ist voellig normal.
const JAHRESABSTAND_TRENNT = 2;

// Generische Begriffe: duerfen mitzaehlen, aber nie ALLEIN Identitaet stiften und
// nie Themenwurzel einer Kennung werden. Bewusst kurz gehalten und auf Woerter
// beschraenkt, die in der politischen Berichterstattung praktisch jeden Text
// treffen. KEIN Sachbegriff steht hier ("bundestag", "minister" bleiben gueltig).
const GENERISCHE_ANKER = new Set([
  "menschen", "personen", "deutschland", "deutsche", "deutschen", "millionen",
  "milliarden", "prozent", "jahren", "jahre", "wochen", "monate", "montag",
  "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag",
  "aktuell", "aktuelle", "aktuellen", "wichtig", "wichtige", "wichtigsten",
  "sollen", "sollten", "koennen", "wurden", "worden", "werden", "haben",
  "gegeben", "gegenueber", "weitere", "weiteren", "erneut", "wieder",
  "berichte", "berichtet", "meldung", "meldungen", "nachrichten", "liveblog",
  "interview", "kommentar", "analyse", "ueberblick", "zusammenfassung",
  // Lang, aber inhaltsleer: wuerden sonst allein Identitaet stiften (>= 12 Zeichen).
  "gesellschaft", "entscheidung", "entscheidungen", "diskussion", "diskussionen",
  "bevoelkerung", "oeffentlichkeit", "zusammenarbeit", "unterstuetzung",
  "veranstaltung", "moeglichkeiten", "entwicklung", "entwicklungen",
  "zusammenhang", "hintergrund", "bundesweit", "voraussetzungen",
  // Politische Fuellwoerter: kommen in fast jeder Meldung vor und beschreiben
  // keinen Vorgang. Sie zaehlen weiter als ZUSATZbeleg, koennen aber keine
  // Zusammenfuehrung mehr allein tragen.
  "vorhaben", "vorhabens", "massnahme", "massnahmen", "thema", "themen",
  "bereich", "bereiche", "punkte", "vorschlag", "vorschlaege", "forderung",
  "forderungen", "kritik", "debatte", "reaktion", "reaktionen", "ergebnis",
  "ergebnisse", "beispiel", "ueberblick", "hinweis", "hinweise"
]);

// HOTFIX B4-3 — Funktionswoerter ab 5 Zeichen. Sie passieren die Ankerbildung
// strukturell, beschreiben aber keinen Sachverhalt; im Production-Fehlurteil vom
// 2026-07-27 stand "wegen" als vollwertiger Beleg in der Beweisliste des
// Bestandsvorgangs. Bewusst eine kurze, aufgezaehlte Liste — keine Wortartlogik.
//
// BEWUSST EINE ZWEITE MENGE und keine Erweiterung von GENERISCHE_ANKER: die
// beiden Mengen haben verschiedene Aufgaben. GENERISCHE_ANKER steuert zusaetzlich
// die Dokumentauswahl fuer den KI-Prompt (dort zaehlt Faktenabdeckung, und die
// ist am echten CSD-Stapel gemessen). Diese Menge wirkt AUSSCHLIESSLICH auf die
// Beweiskraft in der Vorgangsidentitaet.
//
// HOTFIX B4-4 — NACHTRAG aus der Production-Analyse: Funktionswoerter unter
// 5 Zeichen kommen ueber die ABKUERZUNGSREGEL doch in die Ankermenge, sobald sie
// in Grossbuchstaben geschrieben sind. Genau das passiert in Zeitungsnamen:
// "DIE ZEIT" erzeugte die Anker "die" und "zeit", und "die" galt als
// dreibuchstabige Abkuerzung sogar als STARKER Beleg (Gewicht 2). Read-only in
// Production nachgewiesen: der Kern von `vg-zeit-20260311-030001` (26 Dokumente)
// bestand aus ["bundesregierung", "die", "zeit"]. Diese Woerter tragen in JEDER
// Schreibweise nichts zur Identitaet bei.
const GENERISCHE_FUNKTIONSWOERTER = new Set([
  "der", "die", "das", "den", "dem", "des", "ein", "und", "oder", "aber",
  "fuer", "für", "mit", "von", "aus", "auf", "ist", "sind", "wir", "ihr", "neu",
  "wegen", "gegen", "unter", "ueber", "über", "durch", "zwischen", "waehrend",
  "während", "nicht", "mehrere", "mehreren", "einen", "einem", "eines", "einer",
  "diese", "dieser", "diesem", "diesen", "seine", "seiner", "seinen", "ihrer",
  "ihren", "sagte", "erklaerte", "erklärte", "teilte", "zufolge", "laufen",
  "laufende", "laufenden"
]);

// --- Beweisfamilien (Hotfix B4-3) -------------------------------------------
// PRODUCTION-FEHLER, den dieser Block schliesst (2026-07-27): der Bestandsvorgang
// `vg-angriffen` bestand aus EINEM Dokument ueber Trumps Drohung an den Iran wegen
// Huthi-Angriffen. Sein Kern enthielt "angriffen", der Kern des Berliner
// CSD-Clusters "angriff" und "angriffe". Beide Formen wurden als ZWEI
// unabhaengige Treffer gezaehlt, MIN_BEWEISGEWICHT=2 war damit allein durch einen
// generischen Wortstamm erfuellt — 19 CSD-Dokumente landeten im Iran-Vorgang.
//
// VERBINDLICHE PRODUKTENTSCHEIDUNG: KEINE allgemeine deutsche Stammwortlogik.
// Ein Stemmer zoege "Wahlkampf", "Wahlrecht" und "Auswahl" zusammen und wuerde
// neue, schwerer auffindbare Fehlzusammenfuehrungen erzeugen. Stattdessen eine
// AUFGEZAEHLTE Normalisierung: jede Zuordnung steht einzeln, ist begruendbar,
// deterministisch und offline pruefbar. Was nicht in der Liste steht, bleibt ein
// eigenstaendiger Anker — im Zweifel also getrennt, nie zusammengezogen.
//
// Die Praefixregel in matchStaerke() faengt bereits "angriff ~ angriffe ~
// angriffen" (Laengendelta <= 3). Diese Tabelle ergaenzt genau die Formen, die
// sie NICHT erreicht ("angegriffen") — und macht die Familienzugehoerigkeit
// ueberhaupt erst benennbar, damit sie in der Entscheidungsspur auftaucht.
const FAMILIEN_DEFINITION = {
  // --- Die im Hotfix-Auftrag verbindlich geforderten Ereignisfamilien --------
  angriff: ["angriff", "angriffe", "angriffen", "angriffs", "angriffes", "angegriffen"],
  anschlag: ["anschlag", "anschlags", "anschlages", "anschlaege", "anschläge", "anschlaegen", "anschlägen"],
  // "traf" (4 Zeichen, nie ein Anker) und "getroffen" (auch "getroffen werden"
  // im Sinne von treffen/schaedigen) bleiben BEWUSST getrennt: die Normalisierung
  // kann diese Bedeutungen nicht sicher unterscheiden. Beide sind generisch,
  // koennen also ohnehin keine Zusammenfuehrung allein tragen.
  treffen: ["treffen", "treffens"],
  getroffen: ["getroffen"],
  gespraech: ["gespraech", "gespräch", "gespraechs", "gesprächs", "gespraeche", "gespräche", "gespraechen", "gesprächen"],
  debatte: ["debatte", "debatten", "debattiert", "debattieren"],
  streit: ["streit", "streits", "streites", "streitigkeiten", "streiten"],
  kritik: ["kritik", "kritisiert", "kritisierte", "kritisieren", "kritischen"],
  forderung: ["forderung", "forderungen", "fordert", "fordern", "forderte", "forderten", "gefordert"],
  entscheidung: ["entscheidung", "entscheidungen", "entscheidet", "entscheiden", "entschieden"],
  protest: ["protest", "protests", "protestes", "proteste", "protesten", "protestieren", "protestierten"],
  demonstration: ["demonstration", "demonstrationen", "demonstranten", "demonstrieren"],
  wahl: ["wahl", "wahlen", "waehlen", "wählen", "gewaehlt", "gewählt"],
  abstimmung: ["abstimmung", "abstimmungen", "abgestimmt"],
  konflikt: ["konflikt", "konflikts", "konfliktes", "konflikte", "konflikten"],
  krise: ["krise", "krisen"],
  // --- Weitere generische Ereignisfamilien aus dem Bestandsvokabular ---------
  // Bereits einzeln in GENERISCHE_ANKER, hier nur als Familie zusammengefasst,
  // damit ihre Flexionsformen ebenfalls nur EINMAL zaehlen.
  vorwurf: ["vorwurf", "vorwuerfe", "vorwürfe", "vorwuerfen", "vorwürfen", "vorgeworfen"],
  warnung: ["warnung", "warnungen", "warnt", "warnen", "warnte", "gewarnt"]
};

// Umkehrtabelle Form -> Familienschluessel. Einmal gebaut, danach nur gelesen.
const WORTFAMILIEN = new Map();
for (const [schluessel, formen] of Object.entries(FAMILIEN_DEFINITION)) {
  for (const form of formen) WORTFAMILIEN.set(form, schluessel);
}

// Familien, deren Mitglieder GENERISCHE Ereigniswoerter sind. Sie duerfen als
// Zusatzbeleg mitlaufen, aber NIE allein eine Vorgangsidentitaet beweisen —
// "beide Texte sprechen von einem Angriff" ist kein gemeinsames Ereignis.
const GENERISCHE_FAMILIEN = new Set([
  "angriff", "anschlag", "treffen", "getroffen", "gespraech", "debatte",
  "streit", "kritik", "forderung", "entscheidung", "protest", "demonstration",
  "wahl", "abstimmung", "konflikt", "krise", "vorwurf", "warnung"
]);

// Familienschluessel eines Ankers. Ohne Eintrag ist der Anker seine eigene
// Familie — die Tabelle kann also nie etwas zusammenziehen, was nicht ausdruecklich
// dort steht.
function beweisfamilie(anchor) {
  const a = String(anchor || "");
  return WORTFAMILIEN.get(a) || a;
}

// Generisch = das Wort selbst ist ein Allerweltswort ODER es gehoert zu einer
// generischen Ereignisfamilie ODER es ist ein Herausgeber-/Medien-/Plattformname.
// Ersetzt alle frueheren direkten Zugriffe auf GENERISCHE_ANKER, damit eine
// Flexionsform nicht spezifisch wirkt, nur weil sie nicht einzeln in der Liste
// steht ("angriffen" war genau so ein Fall).
//
// HOTFIX B4-4: der Herausgeberteil ist der ZWEITE, aufgezaehlte Riegel gegen
// Mediennamen (der erste ist die Suffixkuerzung in docAnchors). Er wirkt auch
// dort, wo kein Suffix im Spiel ist — mitten im Text, in einer KI-formulierten
// Ueberschrift, in der Abkuerzungsschreibweise ("FAZ", "dpa"). Wirkung an genau
// dieser Stelle: nicht-spezifisch heisst 0 Beitrag zum geforderten Beweisgewicht
// (anchorOverlap), keine Themenwurzel einer Kennung (topicRoots), keine
// Bezugsgroesse im Kernvergleich (sameVorgang).
function istGenerisch(anchor) {
  const a = String(anchor || "");
  if (GENERISCHE_ANKER.has(a) || GENERISCHE_FUNKTIONSWOERTER.has(a)) return true;
  if (istHerausgeberAnker(a)) return true;
  const familie = beweisfamilie(a);
  return GENERISCHE_FAMILIEN.has(familie) || GENERISCHE_ANKER.has(familie);
}

// --- Ankerbildung -----------------------------------------------------------

function stripDiacriticsLower(token) {
  return String(token).toLowerCase();
}

// Abkuerzung im Originaltext? Erkannt an >= 2 Grossbuchstaben bei 3-6 Zeichen.
// Trifft "CSD", "AfD", "EuGH", "BSW", "NATO" — nicht "Berlin", nicht "Der".
function isAcronym(token) {
  const t = String(token || "");
  if (t.length < ACRONYM_MIN_LEN || t.length > ACRONYM_MAX_LEN) return false;
  if (!/^[A-Za-zÄÖÜäöüß]+$/.test(t)) return false;
  const gross = (t.match(/[A-ZÄÖÜ]/g) || []).length;
  return gross >= 2;
}

// Jahreszahlen (1900-2099) sind starke Trennsignale zwischen historischem
// Rueckblick und aktuellem Ereignis. Sie werden als eigener Ankertyp gefuehrt.
function isYear(token) {
  return /^(19|20)\d{2}$/.test(String(token || ""));
}

// Anker eines Textes. Reihenfolgestabil, dublettenfrei.
// Zusammensetzung: normale Woerter ab ANCHOR_MIN_LEN + Abkuerzungen + Jahreszahlen.
function anchorTokens(text) {
  const roh = String(text || "").split(/[^A-Za-z0-9ÄÖÜäöüß]+/).filter(Boolean);
  const out = [];
  const seen = new Set();
  const add = (t) => { if (t && !seen.has(t)) { seen.add(t); out.push(t); } };
  for (const token of roh) {
    if (isYear(token)) { add(token); continue; }
    if (isAcronym(token)) { add(stripDiacriticsLower(token)); continue; }
    const lower = stripDiacriticsLower(token);
    if (!/^[a-z0-9äöüß]+$/.test(lower)) continue;
    if (lower.length >= ANCHOR_MIN_LEN) add(lower);
  }
  return out;
}

// Anker eines Rohdokuments (Titel + Kurzfassung).
//
// HOTFIX B4-4 — ERSTER RIEGEL gegen Herausgeberidentitaet: der Titel wird nur
// bis zu seinem BESTAETIGTEN Herausgebersuffix ausgewertet. Google-News-RSS
// liefert "<Schlagzeile> - <Herausgeber>"; ohne diese Kuerzung wurde
// "tagesspiegel" zu einem 13-Zeichen-Anker und damit zu einem STARKEN Beleg,
// der allein MIN_BEWEISGEWICHT erfuellte. Ein Herausgebername in
// Herausgeberposition beschreibt die Herkunft, nicht das Ereignis — jedes
// Dokument desselben Feeds traegt ihn und er kann deshalb nichts unterscheiden.
//
// "Bestaetigt" ist entscheidend und in herausgeber.js belegt: abgeschnitten wird
// nur, was sich mit den Herausgeberangaben DESSELBEN Dokuments deckt oder
// strukturell als Herausgeberbezeichnung erkennbar ist. Blindes Abschneiden des
// letzten Segments waere gemessen falsch (613 von 1 000 Production-Titeln haben
// eines, viele davon sind der eigentliche Schlagzeilenrumpf hinter einer
// Dachzeile).
function docAnchors(doc = {}) {
  return anchorTokens(`${titelRumpf(doc)} ${(doc && doc.summary) || ""}`);
}

// Zwei Anker beschreiben dieselbe Sache?
// 1. identisch
// 2. gemeinsamer Wortstamm am Wortanfang (Flexion/Ableitung), enge Laengengrenze
// 3. Komposit-Enthalten, aber erst ab einer echten Wortwurzel (COMPOUND_MIN_LEN)
// Der freie Teilstring-Vergleich der Altfassung existiert bewusst nicht mehr.
// Beweisgewicht eines Ankerpaars: 0 (kein Treffer), 1 (Treffer), 2 (starker Beleg).
function matchStaerke(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  if (!x || !y) return 0;
  // Jahreszahlen sind exakt oder gar nicht gleich — nie ueber Praefix/Enthalten.
  if (isYear(x) || isYear(y)) return x === y ? 1 : 0;
  if (x === y) {
    if (istGenerisch(x)) return 1;
    if (x.length >= STRONG_ANCHOR_LEN) return 2;
    // Abkuerzung: 3-4 Zeichen koennen strukturell nur eine Abkuerzung sein
    // (normale Woerter brauchen ANCHOR_MIN_LEN). Ausser den Allerweltskuerzeln
    // ist eine exakt gleiche Abkuerzung ein starker Identitaetsbeleg.
    if (x.length <= ACRONYM_STRONG_MAX_LEN && !HAEUFIGE_ABKUERZUNGEN.has(x)) return 2;
    return 1;
  }
  // Ausdruecklich aufgezaehlte Beweisfamilie ("angegriffen" ~ "angriff"): genau
  // die Formen, die die Praefixregel unten nicht erreicht. Schwacher Beleg — und
  // durch die Familienzaehlung in anchorOverlap ohnehin nur EIN Beleg.
  if (WORTFAMILIEN.has(x) && WORTFAMILIEN.has(y) && beweisfamilie(x) === beweisfamilie(y)) return 1;
  const kurz = x.length <= y.length ? x : y;
  const lang = x.length <= y.length ? y : x;
  // Flexion/Ableitung am Wortanfang: berlin ~ berlins ~ berliner. Schwacher Beleg.
  if (lang.startsWith(kurz) && kurz.length >= ANCHOR_MIN_LEN && (lang.length - kurz.length) <= PREFIX_MAX_DELTA) return 1;
  // Wortwurzel in einem Kompositum: "Tariftreue" in "Tariftreuegesetz". Deutsche
  // Komposita sind hochspezifisch — das ist ein STARKER Beleg und der Grund,
  // warum zwei sehr verschieden formulierte Meldungen ueber denselben Vorgang
  // zusammenfinden. Erst ab einer echten Wortwurzel (COMPOUND_MIN_LEN); genau
  // diese Untergrenze fehlte der Altfassung, weshalb "menschen" in
  // "menschenmenge" greifen konnte.
  if (kurz.length >= COMPOUND_MIN_LEN && lang.includes(kurz)) return istGenerisch(kurz) ? 1 : 2;
  return 0;
}

function anchorsMatch(a, b) {
  return matchStaerke(a, b) > 0;
}

// Gruppiert Treffer zu BEWEISFAMILIEN. Zwei Treffer gehoeren zusammen, wenn sie
// dieselbe aufgezaehlte Familie haben ODER einander direkt matchen (Flexion,
// Kompositum). Zusammenhangskomponenten, deshalb reihenfolgeunabhaengig.
// Familiengewicht = STAERKSTER Beleg der Familie, nicht die Summe: zwei
// Schreibweisen desselben Wortes sind ein Beleg, nicht zwei.
function gruppiereFamilien(treffer = [], staerkeJe = new Map()) {
  const liste = (Array.isArray(treffer) ? treffer : []).filter(Boolean);
  if (!liste.length) return [];
  const parent = liste.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { const a = find(i); const b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
  for (let i = 0; i < liste.length; i += 1) {
    for (let j = i + 1; j < liste.length; j += 1) {
      if (beweisfamilie(liste[i]) === beweisfamilie(liste[j]) || matchStaerke(liste[i], liste[j]) > 0) union(i, j);
    }
  }
  const gruppen = new Map();
  for (let i = 0; i < liste.length; i += 1) {
    const w = find(i);
    if (!gruppen.has(w)) gruppen.set(w, []);
    gruppen.get(w).push(liste[i]);
  }
  return [...gruppen.values()]
    .map((mitglieder) => {
      const sortiert = mitglieder.slice().sort((a, b) => (a.length - b.length) || (a < b ? -1 : 1));
      return {
        // Schluessel = kuerzeste Form der Familie bzw. ihr aufgezaehlter Name.
        schluessel: beweisfamilie(sortiert[0]),
        formen: sortiert,
        staerke: Math.max(...sortiert.map((m) => Number(staerkeJe.get(m)) || 0)),
        // Generisch nur, wenn KEIN Mitglied einen eigenen Sachgehalt hat.
        generisch: sortiert.every((m) => istGenerisch(m))
      };
    })
    .sort((a, b) => (a.schluessel < b.schluessel ? -1 : a.schluessel > b.schluessel ? 1 : 0));
}

// Ueberdeckung zweier Ankermengen mit Beweisgewicht. Je Anker aus aList zaehlt
// nur der STAERKSTE Treffer — ein Wort kann nicht dadurch schwerer wiegen, dass
// es im anderen Text mehrfach vorkommt.
//
// HOTFIX B4-3 — die eigentliche Reparatur: das entscheidungsrelevante Gewicht ist
// `gewichtSpezifisch`, die Summe der Familiengewichte NICHT-generischer Familien.
//   - Flexionsformen derselben Familie ("angriff" + "angriffe") zaehlen EINMAL.
//   - Generische Ereignisfamilien tragen 0 zum geforderten Gewicht bei; sie
//     bleiben in der Spur sichtbar, koennen aber keine Zusammenfuehrung tragen.
// `gewicht`/`spezifisch` bleiben erhalten — sie sind ab hier reine Diagnosewerte
// (Rohbegriffe), damit die Entscheidungsspur beide Sichten zeigt.
function anchorOverlap(aList = [], bList = []) {
  const treffer = [];
  const staerkeJe = new Map();
  let gewicht = 0;
  for (const a of aList || []) {
    let beste = 0;
    for (const b of bList || []) {
      const s = matchStaerke(a, b);
      if (s > beste) beste = s;
      if (beste === 2) break;
    }
    if (beste > 0) { treffer.push(a); staerkeJe.set(a, beste); gewicht += beste; }
  }
  const familien = gruppiereFamilien(treffer, staerkeJe);
  const spezifischeFamilien = familien.filter((f) => !f.generisch);
  const generischeFamilien = familien.filter((f) => f.generisch);
  const spezifisch = treffer.filter((a) => !istGenerisch(a));
  return {
    anzahl: treffer.length,
    spezifisch: spezifisch.length,
    gewicht,
    treffer,
    familien,
    familienAnzahl: familien.length,
    spezifischeFamilien: spezifischeFamilien.length,
    generischeFamilien: generischeFamilien.length,
    gewichtFamilien: familien.reduce((n, f) => n + f.staerke, 0),
    gewichtSpezifisch: spezifischeFamilien.reduce((n, f) => n + f.staerke, 0)
  };
}

// --- Zeit- und Datumssignale ------------------------------------------------

const MONATE = {
  januar: 1, februar: 2, "märz": 3, maerz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12
};

// Explizite Datumsangaben im Text ("25. Juli", "25.07.2026", "25.07."). Rueckgabe
// als Menge "MM-TT" — bewusst ohne Jahr, weil das Jahr separat verglichen wird.
function textDates(text) {
  const s = String(text || "");
  const out = new Set();
  const numerisch = s.match(/\b(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(?:19|20)\d{2})?/g) || [];
  for (const m of numerisch) {
    const teile = m.match(/(\d{1,2})\.\s?(\d{1,2})\./);
    if (!teile) continue;
    const tag = Number(teile[1]);
    const monat = Number(teile[2]);
    if (tag >= 1 && tag <= 31 && monat >= 1 && monat <= 12) out.add(`${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`);
  }
  const benannt = s.match(/\b(\d{1,2})\.\s?([A-Za-zÄÖÜäöü]+)/g) || [];
  for (const m of benannt) {
    const teile = m.match(/(\d{1,2})\.\s?([A-Za-zÄÖÜäöü]+)/);
    if (!teile) continue;
    const tag = Number(teile[1]);
    const monat = MONATE[teile[2].toLowerCase()];
    if (monat && tag >= 1 && tag <= 31) out.add(`${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`);
  }
  return [...out];
}

function textYears(text) {
  return [...new Set((String(text || "").match(/\b(19|20)\d{2}\b/g) || []))];
}

function docTime(doc = {}) {
  const t = Date.parse((doc && (doc.published_at || doc.created_at)) || "");
  return Number.isFinite(t) ? t : null;
}

// --- Gehoeren zwei Dokumente zum selben Ereignis? ---------------------------
// Deterministische Entscheidung mit Begruendung (die Begruendung wandert in die
// Telemetrie, damit eine Trennung/Zusammenfuehrung spaeter nachvollziehbar ist).
// Auf welchen Zeitraum bezieht sich ein Text? Explizite Jahreszahlen im Text;
// fehlen sie, gilt das Veroeffentlichungsjahr. Damit ist ein historischer
// Rueckblick ("Zehn Jahre nach dem Anschlag 2016 …") von einer aktuellen Meldung
// ueber dasselbe Thema unterscheidbar, ohne dass beide Texte ein Jahr nennen muessen.
function bezugsJahre(doc = {}) {
  const explizit = textYears(`${doc.title || ""} ${doc.summary || ""}`).map(Number);
  if (explizit.length) return explizit;
  const t = docTime(doc);
  return t != null ? [new Date(t).getUTCFullYear()] : [];
}

function jahresKonflikt(a, b) {
  const ja = bezugsJahre(a);
  const jb = bezugsJahre(b);
  if (!ja.length || !jb.length) return false;
  let minAbstand = Infinity;
  for (const x of ja) for (const y of jb) minAbstand = Math.min(minAbstand, Math.abs(x - y));
  return minAbstand >= JAHRESABSTAND_TRENNT;
}

function docsShareEvent(a = {}, b = {}, opts = {}) {
  const aAnchors = opts.aAnchors || docAnchors(a);
  const bAnchors = opts.bAnchors || docAnchors(b);
  const overlap = anchorOverlap(aAnchors, bAnchors);

  // Harte Trennsignale zuerst: verschiedene Bezugsjahre bzw. verschiedene
  // Ereignistage im Text schliessen ein gemeinsames Ereignis aus — historischer
  // Rueckblick, Jahrestag, zwei Vorfaelle am selben Ort zu verschiedenen Zeiten.
  if (jahresKonflikt(a, b)) return { gleich: false, grund: "jahreskonflikt", overlap };

  const aDaten = textDates(`${a.title || ""} ${a.summary || ""}`);
  const bDaten = textDates(`${b.title || ""} ${b.summary || ""}`);
  if (aDaten.length && bDaten.length && !aDaten.some((d) => bDaten.includes(d))) {
    return { gleich: false, grund: "datumskonflikt", overlap };
  }

  // Zeitliche Naehe bestimmt die Beweislast: weit auseinander liegende Meldungen
  // brauchen mehr Beleg als solche aus demselben Nachrichtenzyklus.
  const ta = docTime(a);
  const tb = docTime(b);
  const fern = ta != null && tb != null && Math.abs(ta - tb) > EVENT_WINDOW_HOURS * 3600 * 1000;
  const noetig = fern ? FERN_MIN_BEWEISGEWICHT : MIN_BEWEISGEWICHT;

  // Generische Anker duerfen nie ALLEIN tragen, und Flexionsformen derselben
  // Familie sind EIN Beleg — deshalb wird `gewichtSpezifisch` gemessen und nicht
  // die Rohsumme (Hotfix B4-3).
  if (overlap.spezifischeFamilien >= 1 && overlap.gewichtSpezifisch >= noetig) {
    return { gleich: true, grund: fern ? "beweisgewicht-fern" : "beweisgewicht", overlap };
  }
  if (!overlap.anzahl) return { gleich: false, grund: "keine-ueberdeckung", overlap };
  if (!overlap.spezifischeFamilien) return { gleich: false, grund: "nur-generische-evidenz", overlap };
  return { gleich: false, grund: "zu-wenig-beweisgewicht", overlap };
}

// --- Clusterbildung ---------------------------------------------------------
// Zusammenhangskomponenten ueber paarweise Kanten. REIHENFOLGEUNABHAENGIG:
// dieselbe Dokumentmenge ergibt immer dieselben Cluster, egal in welcher
// Reihenfolge sie ankommt (die Altfassung war "erster Treffer gewinnt" und damit
// von der Ankunftsreihenfolge abhaengig — belegt in der CSD-Diagnose).
function clusterRawDocuments(rawDocuments = []) {
  const docs = (Array.isArray(rawDocuments) ? rawDocuments : []).filter(Boolean);
  if (!docs.length) return [];
  const anchors = docs.map((d) => docAnchors(d));

  // Union-Find ueber alle Paare.
  const parent = docs.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { const a = find(i); const b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
  for (let i = 0; i < docs.length; i += 1) {
    for (let j = i + 1; j < docs.length; j += 1) {
      if (docsShareEvent(docs[i], docs[j], { aAnchors: anchors[i], bAnchors: anchors[j] }).gleich) union(i, j);
    }
  }

  const gruppen = new Map();
  for (let i = 0; i < docs.length; i += 1) {
    const w = find(i);
    if (!gruppen.has(w)) gruppen.set(w, []);
    gruppen.get(w).push(i);
  }

  // Kernanker-Nachpruefung gegen Kettenbildung (A~B, B~C, aber A!~C): ab drei
  // Dokumenten muss jedes Mitglied mindestens einen KERNANKER tragen — einen
  // Anker, den mindestens die Haelfte der Gruppe teilt. Wer keinen traegt, wird
  // herausgeloest und bildet einen eigenen Vorgang. Haengt nur von der
  // Gruppenmenge ab, nicht von der Reihenfolge.
  // Kante zwischen zwei Dokumenten (fuer das Sicherheitsventil erneut gebraucht).
  const kante = (i, j) => docsShareEvent(docs[i], docs[j], { aAnchors: anchors[i], bAnchors: anchors[j] }).gleich;

  // Sicherheitsventil, dreistufig und jederzeit deterministisch:
  //   1. an das staerkste Dokument neu binden (loest Ketten auf)
  //   2. nach Ereignistag trennen — eine sehr grosse, paarweise zusammenhaengende
  //      Menge ist kein Einzelereignis, sondern ein WIEDERKEHRENDES THEMA; die
  //      sinnvolle Einheit ist dann der Tag, nicht das Thema
  //   3. notfalls nach Zeit in Scheiben schneiden (letzte Reissleine, damit
  //      niemals ein Digest-Cluster entsteht)
  const tagVon = (i) => {
    const t = docTime(docs[i]);
    return t == null ? "0000-00-00" : new Date(t).toISOString().slice(0, 10);
  };
  const entkette = (indizes, tiefe = 0) => {
    if (indizes.length <= MAX_CLUSTER_DOKUMENTE) return [indizes];
    if (tiefe > 12) return scheiben(indizes);

    // Stufe 1: staerkstes Dokument = hoechster Grad, Gleichstand nach Kennung.
    const grad = new Map(indizes.map((i) => [i, 0]));
    for (let x = 0; x < indizes.length; x += 1) {
      for (let y = x + 1; y < indizes.length; y += 1) {
        if (kante(indizes[x], indizes[y])) {
          grad.set(indizes[x], grad.get(indizes[x]) + 1);
          grad.set(indizes[y], grad.get(indizes[y]) + 1);
        }
      }
    }
    const kern = indizes.slice().sort((a, b) =>
      (grad.get(b) - grad.get(a)) || String(docs[a].id || a).localeCompare(String(docs[b].id || b)))[0];
    const drin = indizes.filter((i) => i === kern || kante(kern, i));
    const rest = indizes.filter((i) => !drin.includes(i));
    if (rest.length && drin.length < indizes.length) {
      return [...entkette(drin, tiefe + 1), ...entkette(rest, tiefe + 1)];
    }

    // Stufe 2: nach Ereignistag trennen.
    const jeTag = new Map();
    for (const i of indizes) {
      const t = tagVon(i);
      if (!jeTag.has(t)) jeTag.set(t, []);
      jeTag.get(t).push(i);
    }
    if (jeTag.size > 1) {
      return [...jeTag.keys()].sort().flatMap((t) => entkette(jeTag.get(t), tiefe + 1));
    }

    // Stufe 3: Reissleine.
    return scheiben(indizes);
  };
  const scheiben = (indizes) => {
    const sortiert = indizes.slice().sort((a, b) =>
      ((docTime(docs[a]) ?? 0) - (docTime(docs[b]) ?? 0)) || String(docs[a].id || a).localeCompare(String(docs[b].id || b)));
    const out = [];
    for (let i = 0; i < sortiert.length; i += MAX_CLUSTER_DOKUMENTE) out.push(sortiert.slice(i, i + MAX_CLUSTER_DOKUMENTE));
    return out;
  };

  const cluster = [];
  for (const indizes of gruppen.values()) {
    let gruppe = indizes;
    if (gruppe.length >= 3) {
      // Kernanker-Nachpruefung: ab drei Dokumenten muss jedes Mitglied einen
      // Anker tragen, den mindestens die Haelfte der Gruppe teilt. Wer keinen
      // traegt, haengt nur ueber eine Kette daran und bildet einen eigenen Vorgang.
      const kern = coreAnchors(gruppe.map((i) => anchors[i]));
      if (kern.length) {
        const drin = gruppe.filter((i) => anchors[i].some((a) => kern.some((k) => anchorsMatch(a, k))));
        const raus = gruppe.filter((i) => !drin.includes(i));
        for (const i of raus) cluster.push([i]);
        gruppe = drin;
      }
    }
    if (gruppe.length) cluster.push(...entkette(gruppe));
  }

  return cluster
    .map((indizes) => {
      const sortiert = indizes.slice().sort((x, y) => String(docs[x].id || x).localeCompare(String(docs[y].id || y)));
      return {
        documents: sortiert.map((i) => docs[i]),
        anchors: [...new Set(sortiert.flatMap((i) => anchors[i]))]
      };
    })
    // Cluster deterministisch ordnen: aeltestes Dokument zuerst, dann nach Kennung
    // der ersten Dokument-ID. Ohne diese Ordnung waere die Verarbeitungsreihenfolge
    // wieder von der Eingangsreihenfolge abhaengig.
    .sort((a, b) => {
      const ta = Math.min(...a.documents.map((d) => docTime(d) ?? Number.MAX_SAFE_INTEGER));
      const tb = Math.min(...b.documents.map((d) => docTime(d) ?? Number.MAX_SAFE_INTEGER));
      return (ta - tb) || String(a.documents[0].id || "").localeCompare(String(b.documents[0].id || ""));
    });
}

// Kernanker einer Dokumentmenge: Anker, die mindestens die Haelfte der Dokumente
// tragen. Sie sind das gemeinsame Thema, nicht das Vokabular eines Einzeltextes.
function coreAnchors(perDocAnchors = []) {
  const n = perDocAnchors.length;
  if (!n) return [];
  const schwelle = Math.ceil(n / 2);
  const alle = [...new Set(perDocAnchors.flat())];
  return alle
    .filter((a) => perDocAnchors.filter((liste) => liste.some((x) => anchorsMatch(x, a))).length >= schwelle)
    .sort();
}

// --- Vorgangskennung --------------------------------------------------------

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

// Themenwurzel eines Clusters: der Ankerstamm mit der hoechsten Dokumentfrequenz.
// Generische Anker kommen nur zum Zug, wenn es keinen spezifischen gibt.
// Tie-Break: laengere Wurzel, dann alphabetisch -> vollstaendig deterministisch.
function topicRoots(cluster = {}, limit = 3) {
  const docs = (cluster && cluster.documents) || [];
  const perDoc = docs.map((d) => docAnchors(d));
  const alle = [...new Set(perDoc.flat())].filter((a) => !isYear(a));
  if (!alle.length) return [];
  const rootOf = (anchor) => {
    let root = anchor;
    for (const other of alle) if (anchorsMatch(anchor, other) && other.length < root.length) root = other;
    return root;
  };
  const roots = [...new Set(alle.map(rootOf))];
  const docFreq = (root) => perDoc.filter((liste) => liste.some((a) => anchorsMatch(a, root))).length;
  const bewertet = roots.map((root) => ({
    root,
    df: docFreq(root),
    generisch: istGenerisch(root)
  }));
  const spezifisch = bewertet.filter((r) => !r.generisch);
  const basis = spezifisch.length ? spezifisch : bewertet;
  return basis
    .sort((x, y) => (y.df - x.df) || (y.root.length - x.root.length) || (x.root < y.root ? -1 : 1))
    .slice(0, Math.max(1, limit))
    .map((r) => r.root);
}

// Ereignistag eines Clusters (UTC): der FRUEHESTE Veroeffentlichungszeitpunkt.
// Der frueheste, nicht der neueste — sonst wanderte die Kennung eines laufenden
// Ereignisses mit jeder Folgemeldung weiter.
function eventDay(cluster = {}) {
  const docs = (cluster && cluster.documents) || [];
  const zeiten = docs.map((d) => docTime(d)).filter((t) => t != null);
  if (!zeiten.length) return null;
  return new Date(Math.min(...zeiten)).toISOString().slice(0, 10).replace(/-/g, "");
}

// Kurzpruefsumme der Kernanker: trennt zwei Ereignisse, die zufaellig dieselbe
// Themenwurzel am selben Tag haben. Bewusst aus den KERNANKERN (nicht aus
// Dokument-IDs): dieselbe Meldungslage ergibt dieselbe Pruefsumme, auch wenn ein
// Dokument mehr oder weniger dabei ist.
function anchorSignature(cluster = {}) {
  const docs = (cluster && cluster.documents) || [];
  const kern = coreAnchors(docs.map((d) => docAnchors(d)));
  const basis = (kern.length ? kern : [...new Set(docs.flatMap((d) => docAnchors(d)))].sort()).join("|");
  return crypto.createHash("sha1").update(basis || "leer").digest("hex").slice(0, 6);
}

// Vorschlag fuer die Vorgangskennung: vg-<themenwurzel>-<ereignistag>-<pruefsumme>.
// Drei unabhaengige Bestandteile -> eine technische Kollision zwischen zwei
// verschiedenen Ereignissen setzt gleiche Themenwurzel UND gleichen Tag UND
// gleiche Ankerpruefsumme voraus. Sie ist damit praktisch ausgeschlossen und wird
// im Konfliktfall zusaetzlich sicher erkannt (understanding.js).
//
// WICHTIG: Diese Kennung ist ein VORSCHLAG. Ob ein Cluster zu einem bereits
// bestehenden Vorgang gehoert, entscheidet sameVorgang() gegen echte Kandidaten.
function deriveVorgangId(cluster = {}) {
  const docs = (cluster && cluster.documents) || [];
  const roots = topicRoots(cluster, 1);
  if (!roots.length) {
    const first = docs[0] || {};
    const key = first.content_hash || first.id || first.title || "unbekannt";
    return `vg-${slug(String(key)).slice(0, 24)}`;
  }
  const teile = [`vg-${slug(roots[0]).slice(0, 24)}`];
  const tag = eventDay(cluster);
  if (tag) teile.push(tag);
  teile.push(anchorSignature(cluster));
  return teile.join("-");
}

// Praefix, unter dem Kandidaten fuer denselben Vorgang gesucht werden.
// Die LEGACY-Kennung `vg-<wurzel>` faellt exakt auf dieses Praefix — Altvorgaenge
// bleiben damit auffindbar und werden weiter fortgeschrieben statt dupliziert.
function vorgangPrefix(root) {
  return `vg-${slug(root).slice(0, 24)}`;
}

function candidatePrefixes(cluster = {}, limit = 3) {
  return topicRoots(cluster, limit).map(vorgangPrefix);
}

// --- Ist ein Cluster derselbe Vorgang wie ein bestehender? ------------------
// `bestand` beschreibt einen bereits existierenden Vorgang aus Sicht der Belege:
//   { vorgangId, documents: [...], headline, createdAt }
// documents sind die bereits verknuepften Rohdokumente (aus ko_document_links).
// Fehlen sie, wird ersatzweise die Ueberschrift des Vorgangs herangezogen — das
// ist schwaecher und wird in der Begruendung kenntlich gemacht.
// ============================================================================
// WARUM DIESE FUNKTION NEU GESCHRIEBEN WURDE (Betriebsbefund B4-2, 2026-07-27)
// ============================================================================
// Die Altfassung fragte: "gibt es IRGENDEIN Dokumentpaar, das dasselbe Ereignis
// beschreibt?" — ein Existenzquantor. Damit waechst die Trefferwahrscheinlichkeit
// LINEAR mit der Groesse des Bestands: ein Vorgang mit 13 thematisch gemischten
// Dokumenten passt zu fast jedem neuen Cluster, und jede Aufnahme macht ihn
// anziehender. Production-Beleg: `vg-zeitung-20260428-f362cc` wuchs in einem
// einzigen Lauf von 13 auf 65 Dokumente und enthielt am Ende den Anschlag auf den
// Berliner CSD, einen Armutsbericht, die Pflegereform, den Ruecktritt des
// Verkehrsministers und eine vietnamesische Gewerkschaftswahl.
//
// GEMESSENE UNTERSCHEIDUNG (36 Production-Vorgaenge, §12c des Befunds):
//   gesunde Vorgaenge:  Kohaerenz 0,67-1,00 · KERNANKER 2-8
//   Magnet-Vorgaenge:   Kohaerenz 0,07-0,55 · KERNANKER 0-2, ueberwiegend 0
//
// LEITENTSCHEIDUNG: verglichen wird KERN gegen KERN, nicht Dokument gegen
// Dokument. Ein Vorgang, dessen Dokumente nichts gemeinsam haben, HAT keinen Kern
// — und kann deshalb strukturell nichts mehr anziehen. Der Magnet wird durch seine
// eigene Heterogenitaet unschaedlich. Das ist die kleinste Aenderung, die die
// Fehlerklasse dauerhaft schliesst: kein neues Modell, keine neue Tabelle, keine
// Schwelle, die geraten werden muesste.
//
// VERWORFENE ALTERNATIVEN (kurz, damit sie nicht erneut probiert werden):
//   - Mehrheitsentscheidung ueber Dokumentpaare ("mehr als die Haelfte der
//     Bestandsdokumente muss passen"): waere bei einem laufenden Ereignis zu
//     streng — die spaeten Reaktionen passen sprachlich nicht zu den fruehen
//     Tatmeldungen. Der Kern loest genau das, weil er nur den STABILEN Teil nimmt.
//   - Reine Groessenobergrenze: begrenzt den Schaden, behebt die Ursache nicht;
//     ein Magnet mit 59 Dokumenten bleibt ein Magnet. Sie ist deshalb nur noch
//     zweiter Riegel (VORGANG_MAX_DOKUMENTE), nicht die Loesung.
//   - Semantische Aehnlichkeit (Embeddings): teuer, nicht deterministisch, nicht
//     offline testbar — und fuer diesen Fehler nicht noetig.
//
// RUECKGABE: eine vollstaendige, reproduzierbare Entscheidungsspur. Jede
// Entscheidung nennt erfuellte und fehlende Kriterien, die verglichenen
// Dokumentmengen, die Kerne und das Beweisgewicht.

// Harte Obergrenze: ein Vorgang, der so viele Dokumente traegt, nimmt nichts mehr
// auf. Zweiter, unabhaengiger Riegel gegen unbegrenztes Wachstum — gleicher Wert
// wie das Cluster-Ventil, damit beide Wege dieselbe Grenze haben.
const VORGANG_MAX_DOKUMENTE = MAX_CLUSTER_DOKUMENTE;

// Ein Vorgang kann fortgeschrieben werden, solange er "lebt". Traefe ein Cluster
// auf einen Vorgang, dessen letztes Dokument Wochen alt ist, waere das keine
// Fortschreibung mehr, sondern ein neues Ereignis zum gleichen Thema.
const VORGANG_FORTSCHREIBUNG_TAGE = 14;

// SCHWACHER BESTAND (Hotfix B4-3, Production-Befund vom 2026-07-27).
// Ein Vorgang mit nur EINEM Dokument ist strukturell leichter zu treffen als ein
// etablierter: coreAnchors() nimmt bei einem Dokument alles auf, was in ihm
// vorkommt (die Haelfte-Schwelle ist bei n=1 immer erfuellt). Sein "Kern" ist
// damit nicht das gemeinsame Thema mehrerer Meldungen, sondern das komplette
// Vokabular eines einzelnen Textes — inklusive Fuellwoertern. Genau daran ist
// `vg-angriffen` (1 Dokument ueber Trump/Iran/Huthi) zum Sammelbecken fuer
// 19 Berliner CSD-Dokumente geworden.
// Bei so einem Bestand gilt deshalb FAIL CLOSED: es genuegt nicht, das geforderte
// Gewicht zu erreichen — es braucht ZWEI unabhaengige spezifische Beweisfamilien,
// und die Evidenz darf nicht ueberwiegend generisch sein.
const SCHWACHER_BESTAND_DOKUMENTE = 1;
const EINZELVORGANG_MIN_FAMILIEN = 2;

function sameVorgang(cluster = {}, bestand = {}) {
  const neueDocs = ((cluster && cluster.documents) || []).filter(Boolean);
  const altDocs = ((bestand && bestand.documents) || []).filter(Boolean);
  const spur = {
    vorgangId: (bestand && bestand.vorgangId) || null,
    neueDokumente: neueDocs.length,
    bestandsDokumente: altDocs.length,
    verglicheneDokumente: {
      neu: neueDocs.slice(0, 12).map((d) => d.id).filter(Boolean),
      bestand: altDocs.slice(0, 12).map((d) => d.id).filter(Boolean)
    },
    kernNeu: [], kernBestand: [], ueberdeckung: null,
    erfuellt: [], fehlend: []
  };
  const nein = (grund, beleg) => ({ gleich: false, grund, beleg, spur: { ...spur, fehlend: [...spur.fehlend, grund] } });
  const ja = (grund, beleg) => ({ gleich: true, grund, beleg, overlap: spur.ueberdeckung, spur: { ...spur, erfuellt: [...spur.erfuellt, grund] } });

  if (!neueDocs.length) return nein("kein-neues-dokument", "keiner");

  // --- Riegel 1: Groesse ---------------------------------------------------
  if (altDocs.length >= VORGANG_MAX_DOKUMENTE) return nein("vorgang-voll", "dokumente");
  spur.erfuellt.push("groesse-im-rahmen");

  // --- Kern des Bestands ---------------------------------------------------
  // Ohne verknuepfte Dokumente bleibt nur die (KI-formulierte) Ueberschrift als
  // schwaecherer Ersatzbeleg — unveraendert gegenueber der Altfassung.
  const beleg = altDocs.length ? "dokumente" : "ueberschrift";
  const kernBestand = altDocs.length
    ? coreAnchors(altDocs.map((d) => docAnchors(d)))
    : anchorTokens(`${bestand.headline || ""} ${bestand.display_title || ""}`);
  spur.kernBestand = kernBestand.slice(0, 12);
  if (!kernBestand.length) {
    // GENAU HIER stirbt der Magnet: seine Dokumente teilen keinen Anker, also hat
    // er keinen Kern, also kann nichts mehr zu ihm gehoeren.
    return nein(altDocs.length ? "bestand-ohne-kern" : "kein-beleg-am-bestand", beleg);
  }
  spur.erfuellt.push("bestand-hat-kern");

  // --- Kern des neuen Clusters --------------------------------------------
  const kernNeu = coreAnchors(neueDocs.map((d) => docAnchors(d)));
  spur.kernNeu = kernNeu.slice(0, 12);
  if (!kernNeu.length) return nein("cluster-ohne-kern", beleg);
  spur.erfuellt.push("cluster-hat-kern");

  // --- Riegel 2: Zeit ------------------------------------------------------
  // Jahreskonflikt und Fortschreibungsfenster werden gegen das NEUESTE
  // Bestandsdokument geprueft (der Vorgang lebt bis dorthin).
  if (altDocs.length) {
    const zeiten = altDocs.map((d) => docTime(d)).filter((t) => t != null);
    const neuesteAlt = zeiten.length ? Math.max(...zeiten) : null;
    const aeltesteNeu = Math.min(...neueDocs.map((d) => docTime(d) ?? Infinity));
    if (neuesteAlt != null && Number.isFinite(aeltesteNeu)) {
      const tage = (aeltesteNeu - neuesteAlt) / 86400000;
      spur.abstandTage = Math.round(tage * 10) / 10;
      if (tage > VORGANG_FORTSCHREIBUNG_TAGE) return nein("vorgang-zu-alt", beleg);
      spur.erfuellt.push("im-fortschreibungsfenster");
    }
    const jungsteAlt = altDocs.slice().sort((a, b) => (docTime(b) ?? 0) - (docTime(a) ?? 0))[0];
    const aeltesteNeuDoc = neueDocs.slice().sort((a, b) => (docTime(a) ?? 0) - (docTime(b) ?? 0))[0];
    if (jungsteAlt && aeltesteNeuDoc && jahresKonflikt(jungsteAlt, aeltesteNeuDoc)) return nein("jahreskonflikt", beleg);
    spur.erfuellt.push("kein-jahreskonflikt");
  }

  // --- Kernvergleich -------------------------------------------------------
  // Die Anforderung SKALIERT mit der Kerngroesse. Ein fester Wert waere in beide
  // Richtungen falsch:
  //   - Ein Vorgang mit nur zwei Kernankern ("rentenpaket", "2026") koennte zwei
  //     Treffer kaum je liefern — echte Fortschreibungen wuerden abgelehnt.
  //   - Ein Vorgang mit sechs Kernankern wuerde bei einem einzigen Treffer
  //     ("berlin") jedes Berliner Thema anziehen — der Magnet in klein.
  // Deshalb: mindestens die HAELFTE des Kerns muss getroffen sein, aber nie mehr
  // als MIN_BEWEISGEWICHT. Beides gemessen in SPEZIFISCHEN (nicht generischen)
  // Treffern; generische Anker koennen eine Zuordnung nie allein tragen.
  // Die Bezugsgroesse ist der SPEZIFISCHE Kern: ein Bestand, dessen Kern nur aus
  // generischen Woertern besteht, beschreibt kein unterscheidbares Ereignis und
  // darf strukturell nichts mehr anziehen (Hotfix B4-3).
  const spezifischerKern = kernBestand.filter((a) => !istGenerisch(a));
  spur.kernBestandSpezifisch = spezifischerKern.length;
  if (!spezifischerKern.length) return nein("bestand-nur-generisch", beleg);

  const o = anchorOverlap(kernNeu, kernBestand);
  const noetig = Math.max(1, Math.min(MIN_BEWEISGEWICHT, Math.ceil(spezifischerKern.length / 2)));
  spur.ueberdeckung = {
    // Rohbegriffe (Diagnose) …
    anzahl: o.anzahl, spezifisch: o.spezifisch, gewicht: o.gewicht,
    treffer: o.treffer.slice(0, 8),
    // … und die tatsaechlich GEZAEHLTEN Beweisfamilien (Entscheidungsgrundlage).
    familien: o.familienAnzahl,
    spezifischeFamilien: o.spezifischeFamilien,
    generischeFamilien: o.generischeFamilien,
    gewichtSpezifisch: o.gewichtSpezifisch,
    familienBeleg: o.familien.slice(0, 8).map((f) => ({
      familie: f.schluessel, formen: f.formen, staerke: f.staerke, generisch: f.generisch
    })),
    noetig, kernGroesse: kernBestand.length, kernSpezifisch: spezifischerKern.length
  };
  // Gemessen wird das FAMILIENGEWICHT der spezifischen Treffer, nicht die blosse
  // Trefferzahl und nicht die Rohsumme: ein sehr spezifischer Kernanker
  // ("verkehrsminister") wiegt zwei gewoehnliche auf, waehrend zwei Schreibweisen
  // desselben Wortes ("angriff"/"angriffe") zusammen genau EINEN Beleg ergeben.
  if (o.spezifischeFamilien < 1) return nein("kein-spezifischer-kerntreffer", beleg);
  if (o.gewichtSpezifisch < noetig) return nein("kernueberdeckung-zu-schwach", beleg);
  spur.erfuellt.push("spezifische-kernueberdeckung");

  // --- Riegel 3: schwacher Bestand (Ein-Dokument-Vorgaenge) -----------------
  if (altDocs.length <= SCHWACHER_BESTAND_DOKUMENTE) {
    spur.schwacherBestand = true;
    if (o.spezifischeFamilien < EINZELVORGANG_MIN_FAMILIEN) return nein("einzelvorgang-zu-wenig-familien", beleg);
    // "nicht hauptsaechlich generisch": mindestens so viele spezifische wie
    // generische Familien. Eine Zuordnung, die ueberwiegend aus Ereignisfloskeln
    // besteht, ist bei einem Ein-Dokument-Vorgang kein Beleg.
    if (o.spezifischeFamilien < o.generischeFamilien) return nein("einzelvorgang-evidenz-generisch", beleg);
    // Harte Themenkollision: nennen beide Seiten ausdrueckliche Daten und
    // ueberschneiden sie sich nicht, sind es zwei verschiedene Ereignisse.
    if (altDocs.length === 1) {
      const altText = `${altDocs[0].title || ""} ${altDocs[0].summary || ""}`;
      const neuText = neueDocs.map((d) => `${d.title || ""} ${d.summary || ""}`).join(" ");
      const altDaten = textDates(altText);
      const neuDaten = textDates(neuText);
      if (altDaten.length && neuDaten.length && !altDaten.some((x) => neuDaten.includes(x))) {
        return nein("datumskonflikt", beleg);
      }
    }
    spur.erfuellt.push("einzelvorgang-belegt");
  }
  return ja("kernueberdeckung", beleg);
}

// --- Dokumentauswahl fuer den KI-Prompt -------------------------------------
// PROBLEM (gefunden beim Production-Nachweis zu B4): der Prompt fasst hoechstens
// zwoelf Dokumente. Welche zwoelf, entschied bisher die Reihenfolge im Cluster —
// und die ist nach Dokumentkennung sortiert, also nach einem Inhalts-Hash. Bei
// einem Grossereignis mit 16 Meldungen fielen dadurch ausgerechnet
// "Dobrindt spricht von islamistischem Terroranschlag" und "ein Toter und
// mehrere Verletzte" heraus. Das Knowledge Object waere ohne die Terror-
// Einordnung und ohne Opferzahl entstanden.
//
// WARUM NICHT EINFACH "NEUESTE ZUERST" (die naheliegende Loesung):
// Die neuesten Meldungen eines laufenden Ereignisses sind ueberwiegend
// Reaktionen und Einordnungen ("Trauer in der Community", "Partei fordert").
// Der Tathergang, die Opferzahl und der Ort stehen in den FRUEHEN Meldungen.
// Reines "neueste zuerst" verliert also den Ereigniskern — und reines "aelteste
// zuerst" verliert jede Entwicklung, was genau der alte Fehler in neuer Form waere.
//
// GEWAEHLTE LOESUNG — maximale Faktenabdeckung mit festen Endpunkten:
//   1. Das ALTESTE Dokument ist gesetzt (der Ereigniskern).
//   2. Das NEUESTE Dokument ist gesetzt (der aktuelle Stand).
//   3. Der Rest wird gierig nach NEUEN FAKTEN gewaehlt: das Dokument, das die
//      meisten noch nicht abgedeckten, nicht generischen Anker UND die meisten
//      noch nicht genannten Zahlen beitraegt. Gleichstand: das neuere zuerst,
//      dann die Kennung.
//   4. Ausgegeben wird chronologisch, damit die KI die Entwicklung in der
//      richtigen Reihenfolge liest.
//
// Der Neuigkeitsgewinn nutzt dieselbe "neue Fakten"-Regel, mit der auch ueber
// Aktualisierung vs. Duplikat entschieden wird — es kommt kein zweites
// Relevanzmodell dazu. Nebenwirkung, die genau richtig ist: reine
// Wiederveroeffentlichungen tragen keine neuen Fakten und belegen keinen Platz.
//
// VERWORFENE ALTERNATIVE (gemessen, nicht vermutet): zusaetzlich eine ZEITLICHE
// STREUUNG ueber gleich breite Abschnitte zu erzwingen, damit sich Reaktionen
// nicht in einer Stunde ballen. Am echten CSD-Stapel (16 Meldungen) war das
// SCHLECHTER: die Streuung erzwang Dokumente aus duennen Fruehabschnitten und
// verdraengte dafuer aus der dichten Nachmittagsstunde ausgerechnet die
// Terror-Einordnung — 5 von 6 Schluesselfakten statt 6 von 6. Die einfachere
// Regel gewinnt hier nachweisbar.
function selectPromptDocuments(documents = [], limit = 12) {
  const docs = (Array.isArray(documents) ? documents : []).filter(Boolean);
  const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 12;
  const chronologisch = (liste) => liste.slice().sort((a, b) =>
    ((docTime(a) ?? 0) - (docTime(b) ?? 0)) || String(a.id || "").localeCompare(String(b.id || "")));
  if (docs.length <= max) return chronologisch(docs);

  const sortiert = chronologisch(docs);
  const anker = new Map(sortiert.map((d) => [d, docAnchors(d)]));
  // ZAHLEN als eigenes Faktenmerkmal — NUR fuer diese Auswahl, nicht fuer die
  // Identitaet. Grund: die politisch wichtigste Fortschreibung eines Ereignisses
  // ist oft eine geaenderte Zahl ("eine Tote und 16 Verletzte" nach "mehrere
  // Verletzte"). Sprachlich ist die neue Meldung fast deckungsgleich mit der
  // alten — ohne dieses Merkmal faellt ausgerechnet die korrigierte Opferzahl aus
  // dem Prompt. In der Ankerbildung haben Zahlen bewusst NICHTS verloren: dort
  // wuerden sie fachfremde Dokumente ueber Prozentwerte und Betraege verbinden.
  const zahlen = new Map(sortiert.map((d) => [d,
    [...new Set(String(`${d.title || ""} ${d.summary || ""}`).match(/\b\d{1,6}(?:[.,]\d{1,3})?\b/g) || [])]]));
  const gewaehlt = [];
  const abgedeckt = [];
  const abgedeckteZahlen = new Set();
  const nimm = (d) => {
    if (!d || gewaehlt.includes(d)) return;
    gewaehlt.push(d);
    for (const a of anker.get(d) || []) if (!abgedeckt.some((b) => anchorsMatch(a, b))) abgedeckt.push(a);
    for (const z of zahlen.get(d) || []) abgedeckteZahlen.add(z);
  };

  // BEWUSST `GENERISCHE_ANKER` und NICHT `istGenerisch` (Hotfix B4-3):
  // Die beiden Begriffe von "generisch" haben verschiedene Aufgaben.
  //   Identitaet:  "Angriff" darf keine Zusammenfuehrung BEWEISEN.
  //   Prompt:      "Angriff" ist fuer die KI sehr wohl ein Fakt und gehoert in
  //                die Auswahl — hier zaehlt Faktenabdeckung, nicht Beweiskraft.
  // Wuerde hier `istGenerisch` greifen, saenke die gemessene Faktenabdeckung am
  // echten CSD-Stapel wieder (gepruefte Gegenprobe, vorgangsidentitaet-test.js
  // Abschnitt 10). Die Auswahl bleibt deshalb unveraendert.
  const gewinnVon = (d) => (anker.get(d) || [])
    .filter((a) => !GENERISCHE_ANKER.has(a) && !abgedeckt.some((b) => anchorsMatch(a, b))).length
    + (zahlen.get(d) || []).filter((z) => !abgedeckteZahlen.has(z)).length;

  // Bestes Dokument einer Menge: hoechster Neuigkeitsgewinn, bei Gleichstand das
  // NEUERE, dann die Kennung — vollstaendig deterministisch.
  const bestesAus = (menge) => {
    let bester = null;
    let besterGewinn = -1;
    for (let i = menge.length - 1; i >= 0; i -= 1) {
      const d = menge[i];
      if (gewaehlt.includes(d)) continue;
      const g = gewinnVon(d);
      if (g > besterGewinn) { bester = d; besterGewinn = g; }
    }
    return bester;
  };

  // Feste Endpunkte: Ereigniskern und aktueller Stand.
  nimm(sortiert[0]);
  nimm(sortiert[sortiert.length - 1]);

  // Restplaetze: gierige Maximalabdeckung.
  while (gewaehlt.length < max) {
    const bester = bestesAus(sortiert);
    if (!bester) break;
    nimm(bester);
  }

  return chronologisch(gewaehlt);
}

// Bringt das neue Dokumentmaterial fachlich Neues gegenueber dem Bestand?
// Grundlage fuer die Unterscheidung "echtes Duplikat" (kein KI-Lauf noetig) vs.
// "Aktualisierung" (neue Fakten -> Vorgang muss neu verstanden werden).
// Kriterium: mindestens ein KERNANKER, den der Bestand nicht kennt.
function neueErkenntnisse(neueDocs = [], altDocs = []) {
  const neu = coreAnchors((neueDocs || []).map((d) => docAnchors(d)));
  const alt = [...new Set((altDocs || []).flatMap((d) => docAnchors(d)))];
  const unbekannt = neu.filter((a) => !istGenerisch(a) && !alt.some((b) => anchorsMatch(a, b)));
  return { neu: unbekannt.length > 0, anker: unbekannt.slice(0, 8) };
}

module.exports = {
  ANCHOR_MIN_LEN, ACRONYM_MIN_LEN, ACRONYM_MAX_LEN, COMPOUND_MIN_LEN,
  PREFIX_MAX_DELTA, MIN_BEWEISGEWICHT, STRONG_ANCHOR_LEN, EVENT_WINDOW_HOURS,
  FERN_MIN_BEWEISGEWICHT, JAHRESABSTAND_TRENNT, MAX_CLUSTER_DOKUMENTE, GENERISCHE_ANKER,
  VORGANG_MAX_DOKUMENTE, VORGANG_FORTSCHREIBUNG_TAGE,
  ACRONYM_STRONG_MAX_LEN, HAEUFIGE_ABKUERZUNGEN,
  FAMILIEN_DEFINITION, WORTFAMILIEN, GENERISCHE_FAMILIEN, GENERISCHE_FUNKTIONSWOERTER,
  SCHWACHER_BESTAND_DOKUMENTE, EINZELVORGANG_MIN_FAMILIEN,
  beweisfamilie, istGenerisch, gruppiereFamilien,
  // Herausgebererkennung (B4-4) — durchgereicht, damit Werkzeuge und Tests nur
  // EIN Modul einbinden muessen und keine zweite Wahrheit entsteht.
  istHerausgeberAnker, titelRumpf, herausgeberWoerter,
  anchorTokens, docAnchors, anchorsMatch, matchStaerke, anchorOverlap, coreAnchors,
  isAcronym, isYear, textDates, textYears, bezugsJahre, jahresKonflikt,
  docsShareEvent, clusterRawDocuments,
  slug, topicRoots, eventDay, anchorSignature, deriveVorgangId, selectPromptDocuments,
  vorgangPrefix, candidatePrefixes, sameVorgang, neueErkenntnisse
};
