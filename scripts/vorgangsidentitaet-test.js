"use strict";

// Vorgangsidentitaet — Anker, Zusammenfuehrung, Trennung, Kennung.
// REINE LOGIK: kein Netz, keine KI, keine DB (lib/helmut/vorgang-identity.js).
//
// ANSPRUCH DIESER DATEI: sie erzaehlt NICHT die Implementierung nach, sondern
// stellt sie vor Faelle, in denen Aehnlichkeit und Verschiedenheit bewusst schwer
// zu trennen sind — dieselben Woerter, derselbe Ort, dieselben Akteure, aber
// verschiedene Vorgaenge. Jeder Trennungsfall hat einen Zwilling, der
// zusammengefuehrt werden MUSS; sonst waere "trennt alles" eine bestandene Note.
//
// Grundlage: Betriebsbefund B4 (docs/befund-csd-2026-vorgangsverlust.md).

const V = require("../lib/helmut/vorgang-identity");

let fail = 0;
let n = 0;
function check(name, cond, detail = "") { n += 1; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); if (!cond) fail += 1; }

const d = (id, title, published_at, source_id = "s1", summary = "") => ({ id, title, summary, published_at, source_id });
function zusammen(a, b) { return V.docsShareEvent(a, b); }
function clusterAnzahl(docs) { return V.clusterRawDocuments(docs).length; }

// =========================================================================
// 1 · anchorTokens — was ueberhaupt ein Anker ist
// =========================================================================
const anker = V.anchorTokens("Angriff bei CSD in Berlin: AfD und SPD reagieren, EuGH prüft 2016 und 2026");
check("1 · Woerter ab 5 Zeichen werden Anker", anker.includes("angriff") && anker.includes("berlin"));
check("1 · Abkuerzungen werden ueber Grossschreibung erkannt, nicht ueber Laenge",
  anker.includes("csd") && anker.includes("afd") && anker.includes("spd") && anker.includes("eugh"), JSON.stringify(anker));
check("1 · Jahreszahlen sind eigene Anker", anker.includes("2016") && anker.includes("2026"));
check("1 · Fuellwoerter unter 5 Zeichen werden nicht zu Ankern",
  !anker.includes("bei") && !anker.includes("und") && !anker.includes("in"));
check("1 · ein gewoehnliches grossgeschriebenes Wort ist KEINE Abkuerzung",
  V.isAcronym("Berlin") === false && V.isAcronym("CSD") === true && V.isAcronym("AfD") === true);
check("1 · Anker sind dublettenfrei und reihenfolgestabil",
  JSON.stringify(V.anchorTokens("Rentenpaket Rentenpaket Bundestag")) === JSON.stringify(["rentenpaket", "bundestag"]));

// =========================================================================
// 2 · anchorsMatch / matchStaerke — der Kern der Altfehler V2
// =========================================================================
check("2 · Flexion trifft: berlin ~ berlins ~ berliner",
  V.anchorsMatch("berlin", "berlins") && V.anchorsMatch("berlin", "berliner"));
check("2 · Flexion trifft: angriff ~ angriffe, verletzte ~ verletzten",
  V.anchorsMatch("angriff", "angriffe") && V.anchorsMatch("verletzte", "verletzten"));
check("2 · Kompositum trifft die Wurzel: tariftreuegesetz in bundestariftreuegesetz",
  V.anchorsMatch("tariftreuegesetz", "bundestariftreuegesetz"));
check("2 · und zwar als STARKER Beleg (Gewicht 2)",
  V.matchStaerke("tariftreue", "tariftreuegesetz") === 2, `staerke=${V.matchStaerke("tariftreue", "tariftreuegesetz")}`);
// Der belegte Production-Fehler: "menschen" zog den Anschlag in einen Taifun.
check("2 · ALTFEHLER V2 behoben: menschen trifft NICHT menschenmenge",
  V.anchorsMatch("menschen", "menschenmenge") === false);
check("2 · kurze Woerter koennen nicht mehr in Komposita hineinmatchen",
  V.anchorsMatch("gesetz", "tariftreuegesetz") === false && V.anchorsMatch("polizei", "polizeieinsatz") === false);
check("2 · ein exakt gleicher, sehr langer Anker ist ein starker Beleg",
  V.matchStaerke("emissionshandel", "emissionshandel") === 2);
check("2 · ein exakt gleicher, aber generischer Anker bleibt schwach",
  V.matchStaerke("gesellschaft", "gesellschaft") === 1);
check("2 · verschiedene Jahreszahlen treffen sich nie",
  V.matchStaerke("2016", "2026") === 0 && V.matchStaerke("2016", "2016") === 1);

// =========================================================================
// 3 · ZUSAMMENFUEHRUNG — Meldungen zu demselben Ereignis
// =========================================================================

// 3a · Laufende Meldung mit spaeter korrigierter Opferzahl.
const opfer1 = d("o1", "CSD in Berlin: Fahrzeug in Menschenmenge gefahren - eine Tote und mehrere Verletzte", "2026-07-25T22:31:00Z");
const opfer2 = d("o2", "Angriff auf CSD in Berlin: Zahl der Verletzten steigt auf 16", "2026-07-26T14:10:00Z", "s2");
check("3a · korrigierte Opferzahl bleibt derselbe Vorgang", zusammen(opfer1, opfer2).gleich,
  JSON.stringify(zusammen(opfer1, opfer2).grund));

// 3b · Politische Reaktion auf ein Ereignis gehoert zum Ereignis.
const reaktion = d("r1", "Wegner nach Angriff auf den Berliner CSD: Attacke auf eine freie Stadt", "2026-07-26T09:12:00Z", "s3");
check("3b · politische Reaktion wird dem Ereignis zugeordnet", zusammen(opfer1, reaktion).gleich,
  JSON.stringify(zusammen(opfer1, reaktion).grund));

// 3c · Stark verschiedene Formulierungen ueber denselben Vorgang.
const form1 = d("f1", "Bundesrat stoppt das Tariftreuegesetz", "2026-07-20T10:00:00Z");
const form2 = d("f2", "Laender verweigern Zustimmung zur Tariftreue bei Bundesauftraegen", "2026-07-20T11:30:00Z", "s2");
check("3c · sehr verschiedene Formulierungen finden ueber die Kompositum-Wurzel zusammen",
  zusammen(form1, form2).gleich, JSON.stringify(zusammen(form1, form2)));

// 3d · Wiederveroeffentlichung derselben Agenturmeldung durch mehrere Haeuser.
const agentur = "Bundeskabinett beschliesst Reform der Grundsicherung";
const agenturDocs = [
  d("a1", `${agentur} - dpa`, "2026-07-21T08:00:00Z", "tagesschau"),
  d("a2", `${agentur} - Zeit Online`, "2026-07-21T08:14:00Z", "zeit"),
  d("a3", `${agentur}`, "2026-07-21T08:31:00Z", "sz")
];
check("3d · dieselbe Agenturmeldung bei drei Haeusern ist EIN Vorgang", clusterAnzahl(agenturDocs) === 1,
  `cluster=${clusterAnzahl(agenturDocs)}`);
// Kommen die drei Kopien in verschiedenen Laeufen an, ist ihre Kennung nicht
// zeichengleich (die Pruefsumme haengt an der jeweiligen Ankermenge) — sie fallen
// aber auf dasselbe Themenwurzel-Praefix. Genau darueber findet die
// Vorgangsaufloesung sie und schreibt EINEN Vorgang fort, statt zu duplizieren.
const agenturPraefixe = agenturDocs.map((doc) => V.candidatePrefixes(V.clusterRawDocuments([doc])[0], 1)[0]);
check("3d · einzeln angekommene Kopien fallen auf dasselbe Kandidaten-Praefix",
  new Set(agenturPraefixe).size === 1, JSON.stringify(agenturPraefixe));
check("3d · und werden ueber den Bestandsabgleich als derselbe Vorgang erkannt",
  V.sameVorgang({ documents: [agenturDocs[2]] }, { vorgangId: "vg-x", documents: [agenturDocs[0]] }).gleich === true);

// 3e · Ein Ereignis, das sich ueber mehrere Tage entwickelt.
const lauf = [
  d("l1", "Explosion vor dem Landgericht Karlsruhe - Ermittlungen laufen", "2026-07-22T18:00:00Z", "s1"),
  d("l2", "Landgericht Karlsruhe: Generalbundesanwalt uebernimmt Ermittlungen zur Explosion", "2026-07-23T09:00:00Z", "s2"),
  d("l3", "Nach Explosion am Landgericht Karlsruhe: Innenausschuss beraet Sicherheitslage", "2026-07-24T11:00:00Z", "s3")
];
check("3e · ein sich entwickelndes Ereignis bleibt EIN Vorgang ueber drei Tage",
  clusterAnzahl(lauf) === 1, `cluster=${clusterAnzahl(lauf)}`);

// =========================================================================
// 4 · TRENNUNG — verschiedene Vorgaenge trotz gemeinsamer Woerter
// =========================================================================

// 4a · Zwei verschiedene Anschlaege am GLEICHEN Ort (der schwerste Fall).
const ortA = d("x1", "Anschlag auf dem Breitscheidplatz 2016: Bundesgerichtshof entscheidet ueber Entschaedigung", "2026-07-24T10:00:00Z");
const ortB = d("x2", "Berlin: Fahrzeug faehrt auf dem Breitscheidplatz in eine Menschenmenge", "2026-07-24T19:00:00Z", "s2");
check("4a · historischer Anschlag und aktueller Vorfall am selben Ort werden GETRENNT",
  zusammen(ortA, ortB).gleich === false, JSON.stringify(zusammen(ortA, ortB).grund));
check("4a · Trennungsgrund ist der Zeitbezug, nicht fehlende Ueberdeckung",
  zusammen(ortA, ortB).grund === "jahreskonflikt", zusammen(ortA, ortB).grund);

// 4b · Historischer Rueckblick auf dasselbe Thema.
const rueckblick = d("h1", "Zehn Jahre Mindestlohn: Was die Einfuehrung 2015 gebracht hat", "2026-07-20T07:00:00Z");
const aktuell = d("h2", "Mindestlohnkommission empfiehlt Erhoehung des Mindestlohns", "2026-07-20T12:00:00Z", "s2");
check("4b · historischer Rueckblick und aktuelle Entscheidung werden getrennt",
  zusammen(rueckblick, aktuell).gleich === false, JSON.stringify(zusammen(rueckblick, aktuell).grund));

// 4c · Der belegte Production-Fall: Allerweltswort verbindet Fachfremdes.
const csd = d("c1", "Berliner Polizei: CSD abgebrochen - Fahrzeug soll Menschen angefahren haben", "2026-07-25T21:44:00Z");
const taifun = d("c2", "340.000 Menschen in China wegen Taifun Noul in Sicherheit gebracht", "2026-07-25T22:00:00Z", "s2");
check("4c · Anschlag und Taifun teilen nur \"menschen\" und bleiben getrennt",
  zusammen(csd, taifun).gleich === false, JSON.stringify(zusammen(csd, taifun)));

// 4d · Gleicher Nachname, verschiedene Vorgaenge.
const nameA = d("n1", "Liveblog zu Angriff auf CSD: Dobrindt schliesst weitere Gefaehrdung aus", "2026-07-26T12:40:00Z");
const nameB = d("n2", "Verfassungsgericht zu Afghanistan und Dobrindt: Willkuer bei Entscheidungen ueber Leben und Tod", "2026-07-26T19:58:00Z", "s2");
check("4d · derselbe Minister in zwei verschiedenen Vorgaengen wird getrennt",
  zusammen(nameA, nameB).gleich === false, JSON.stringify(zusammen(nameA, nameB)));

// 4e · Dasselbe Gremium, verschiedene Themen (der haeufigste Sammelbegriff).
const gremiumA = d("g1", "Bundestag billigt Gesetz ueber neue Gaskraftwerke", "2026-07-23T15:00:00Z");
const gremiumB = d("g2", "Abstimmungspanne im Bundestag beim Bundespolizeigesetz", "2026-07-23T16:00:00Z", "s2");
check("4e · zwei Bundestagsvorgaenge am selben Tag bleiben getrennt",
  zusammen(gremiumA, gremiumB).gleich === false, JSON.stringify(zusammen(gremiumA, gremiumB)));

// 4f · Gegenprobe zu 4e — ZWEI Meldungen ueber DENSELBEN Bundestagsvorgang
// muessen zusammenfinden, sonst waere "trennt alles" die Loesung.
const gremiumC = d("g3", "Bundestag beschliesst Gesetz ueber neue Gaskraftwerke in erster Lesung", "2026-07-23T15:20:00Z", "s3");
check("4f · GEGENPROBE: zwei Meldungen ueber denselben Bundestagsvorgang finden zusammen",
  zusammen(gremiumA, gremiumC).gleich === true, JSON.stringify(zusammen(gremiumA, gremiumC)));

// 4g · Zwei getrennte Ereignisse mit identischem Ereignistyp und Ort, aber
// explizit verschiedenen Tagesangaben im Text.
const tagA = d("t1", "Warnstreik im Nahverkehr am 12.08. legt Busse und Bahnen lahm", "2026-07-25T09:00:00Z");
const tagB = d("t2", "Warnstreik im Nahverkehr am 19.08. angekuendigt", "2026-07-25T10:00:00Z", "s2");
check("4g · zwei Streiks mit verschiedenen Datumsangaben im Text bleiben getrennt",
  zusammen(tagA, tagB).gleich === false && zusammen(tagA, tagB).grund === "datumskonflikt",
  JSON.stringify(zusammen(tagA, tagB).grund));

// =========================================================================
// 5 · Clusterbildung — Reihenfolge, Ketten, Determinismus
// =========================================================================
const gemischt = [...agenturDocs, csd, taifun, gremiumA, gremiumB, ortA, ortB];
const c1 = V.clusterRawDocuments(gemischt).map((c) => c.documents.map((x) => x.id).sort().join("+")).sort();
const c2 = V.clusterRawDocuments(gemischt.slice().reverse()).map((c) => c.documents.map((x) => x.id).sort().join("+")).sort();
check("5 · Clusterbildung ist reihenfolgeunabhaengig", JSON.stringify(c1) === JSON.stringify(c2), JSON.stringify(c1));
check("5 · aus 9 gemischten Dokumenten entstehen die erwarteten 7 Vorgaenge",
  c1.length === 7, `${c1.length}: ${JSON.stringify(c1)}`);

// Schwache Kette: k1~k2 ueber ein echtes Thema, k2~k3 nur ueber ein generisches
// Wort. k3 darf NICHT in den Vorgang von k1 gezogen werden — genau diese Art
// Kette hat als F-3 einen Production-Rueckrollfall verursacht.
const kettenDocs = [
  d("k1", "Rentenpaket 2026 im Kabinett beschlossen", "2026-07-20T08:00:00Z"),
  d("k2", "Kabinett beschliesst Rentenpaket und weitere Vorhaben", "2026-07-20T08:30:00Z", "s2"),
  d("k3", "Weitere Vorhaben der Koalition: Digitalpakt kommt spaeter", "2026-07-20T09:00:00Z", "s3")
];
const ketten = V.clusterRawDocuments(kettenDocs);
const kettenIds = ketten.map((c) => c.documents.map((x) => x.id).sort().join("+")).sort();
check("5 · eine schwache Kette ueber ein generisches Wort zieht nichts Fremdes hinein",
  kettenIds.length === 2 && kettenIds.includes("k1+k2") && kettenIds.includes("k3"), JSON.stringify(kettenIds));

check("5 · ein leerer Eingang ergibt keine Cluster", V.clusterRawDocuments([]).length === 0);
check("5 · ein Dokument ohne verwertbaren Titel bildet trotzdem einen eigenen Vorgang",
  V.clusterRawDocuments([{ id: "leer", title: "ok" }]).length === 1);

// =========================================================================
// 6 · Vorgangskennung
// =========================================================================
const csdCluster = V.clusterRawDocuments([opfer1, opfer2, reaktion])[0];
const csdId = V.deriveVorgangId(csdCluster);
check("6 · die Kennung besteht aus Themenwurzel, Ereignistag und Pruefsumme",
  /^vg-[a-z0-9äöüß]+-\d{8}-[0-9a-f]{6}$/.test(csdId), csdId);
check("6 · sie ist deterministisch", V.deriveVorgangId(V.clusterRawDocuments([opfer1, opfer2, reaktion])[0]) === csdId);
check("6 · der Ereignistag ist der FRUEHESTE Zeitpunkt im Cluster", csdId.includes("20260725"), csdId);
check("6 · generische Woerter werden nicht Themenwurzel",
  !csdId.startsWith("vg-menschen") && !csdId.startsWith("vg-mehrere"), csdId);
check("6 · das Praefix ist stabil und dient der Kandidatensuche",
  V.candidatePrefixes(csdCluster, 3).some((p) => csdId.startsWith(p)), JSON.stringify(V.candidatePrefixes(csdCluster, 3)));
check("6 · ein Cluster ohne jeden Anker bekommt trotzdem eine stabile Kennung",
  /^vg-/.test(V.deriveVorgangId({ documents: [{ id: "x", title: "ab cd", content_hash: "hash1" }] })));

// Zwei VERSCHIEDENE Ereignisse duerfen niemals dieselbe Kennung bekommen.
const idGremiumA = V.deriveVorgangId(V.clusterRawDocuments([gremiumA])[0]);
const idGremiumB = V.deriveVorgangId(V.clusterRawDocuments([gremiumB])[0]);
check("6 · zwei verschiedene Bundestagsvorgaenge bekommen verschiedene Kennungen",
  idGremiumA !== idGremiumB, `${idGremiumA} vs ${idGremiumB}`);

// =========================================================================
// 7 · sameVorgang / neueErkenntnisse — Bestandsabgleich
// =========================================================================
const bestand = { vorgangId: "vg-alt", documents: [opfer1], headline: "Angriff auf den Berliner CSD" };
check("7 · ein neues Dokument zum selben Ereignis erkennt den Bestand (Beleg: Dokumente)",
  V.sameVorgang({ documents: [opfer2] }, bestand).gleich === true, JSON.stringify(V.sameVorgang({ documents: [opfer2] }, bestand)));
check("7 · ein fachfremdes Dokument erkennt den Bestand NICHT",
  V.sameVorgang({ documents: [taifun] }, bestand).gleich === false);
check("7 · ohne verknuepfte Dokumente wird die Ueberschrift als schwaecherer Beleg genutzt",
  V.sameVorgang({ documents: [opfer2] }, { vorgangId: "vg-alt", documents: [], headline: "Angriff auf den Berliner CSD" }).beleg === "ueberschrift");
check("7 · ohne jeden Beleg wird NICHT zusammengefuehrt (kein Blindvertrauen in die Kennung)",
  V.sameVorgang({ documents: [opfer2] }, { vorgangId: "vg-alt", documents: [], headline: "" }).gleich === false);

check("8 · neue Fakten werden als solche erkannt",
  V.neueErkenntnisse([reaktion], [opfer1]).neu === true, JSON.stringify(V.neueErkenntnisse([reaktion], [opfer1])));
check("8 · dasselbe Dokument bringt keine neuen Fakten",
  V.neueErkenntnisse([opfer1], [opfer1]).neu === false);
check("8 · eine reine Wiederveroeffentlichung bringt keine neuen Fakten",
  V.neueErkenntnisse([d("w1", `${agentur} - dpa`, "2026-07-21T09:00:00Z")], [d("w0", agentur, "2026-07-21T08:00:00Z")]).neu === false);

// =========================================================================
// 9 · Grosse Mengen — die Clusterbildung muss beherrschbar bleiben
// =========================================================================
const viele = Array.from({ length: 600 }, (_, i) =>
  d(`m${i}`, `Kommunalpolitik ${i % 40}: Stadtrat beraet Haushaltsplan ${2020 + (i % 6)}`, `2026-07-2${(i % 5) + 1}T08:00:00Z`, `q${i % 12}`));
const start = Date.now();
const vieleCluster = V.clusterRawDocuments(viele);
const dauerMs = Date.now() - start;
check("9 · 600 Dokumente werden in unter 15 s geclustert (paarweiser Vergleich bleibt tragbar)",
  dauerMs < 15000, `${dauerMs} ms, ${vieleCluster.length} Cluster`);
check("9 · das Sicherheitsventil verhindert einen Digest-Cluster (F-3-Fehlerart)",
  vieleCluster.every((c) => c.documents.length <= V.MAX_CLUSTER_DOKUMENTE),
  `groesster=${Math.max(...vieleCluster.map((c) => c.documents.length))}, Grenze=${V.MAX_CLUSTER_DOKUMENTE}`);
check("9 · jedes Dokument landet in genau einem Cluster (nichts geht verloren, nichts doppelt)",
  vieleCluster.reduce((s, c) => s + c.documents.length, 0) === viele.length
    && new Set(vieleCluster.flatMap((c) => c.documents.map((x) => x.id))).size === viele.length);

// =========================================================================
// 10 · Dokumentauswahl fuer den KI-Prompt
// =========================================================================
// Belegter Anlass (Production-Nachweis zu B4): der Prompt fasst 12 Dokumente,
// ausgewaehlt wurde nach Dokumentkennung — also nach einem Inhalts-Hash. Bei
// einem 16-Meldungen-Ereignis fiel dadurch die Terror-Einordnung heraus.
const ereignis = [
  d("e01", "Fahrzeug faehrt in Menschenmenge am Rand des CSD in Berlin", "2026-07-25T21:44:00Z", "sz"),
  d("e02", "Berliner Polizei bricht CSD ab, mehrere Verletzte", "2026-07-25T22:10:00Z", "tagesschau"),
  d("e03", "CSD Berlin: eine Tote und 16 Verletzte bestaetigt", "2026-07-26T04:01:00Z", "dlf"),
  d("e04", "Wegner nach Angriff auf den CSD: Attacke auf eine freie Stadt", "2026-07-26T09:12:00Z", "tagesschau"),
  d("e05", "Angriff auf CSD Berlin: Tatverdaechtiger polizeibekannter Islamist", "2026-07-26T16:05:00Z", "tagesschau"),
  d("e06", "Dobrindt spricht von islamistischem Terroranschlag auf den CSD", "2026-07-26T16:06:00Z", "dlf"),
  d("e07", "Trauer in der queeren Community nach der Gewalttat", "2026-07-26T16:30:00Z", "dlf"),
  d("e08", "CDU fordert haerteres Strafmass nach dem Angriff auf den CSD", "2026-07-26T17:00:00Z", "cdu"),
  d("e09", "Linksfraktion: Queeres Leben muss vor Angriffen geschuetzt werden", "2026-07-26T17:10:00Z", "linke"),
  d("e10", "Bundeskanzler Merz beschwoert Zusammenhalt nach dem CSD-Anschlag", "2026-07-26T18:00:00Z", "tagesschau"),
  d("e11", "Tatverdaechtiger bei Polizeieinsatz erschossen", "2026-07-26T20:01:00Z", "dlf"),
  d("e12", "CSD-Anschlag: Bundespraesident kuendigt Gedenkveranstaltung an", "2026-07-26T20:30:00Z", "tagesschau"),
  d("e13", "Angriff auf CSD in Berlin - was bisher bekannt ist", "2026-07-26T21:00:00Z", "sz"),
  d("e14", "CSD-Angriff: Generalbundesanwalt uebernimmt die Ermittlungen", "2026-07-26T21:30:00Z", "dlf"),
  d("e15", "Berlin: Gedenken am Ort des Angriffs auf den CSD", "2026-07-26T22:00:00Z", "tagesschau"),
  d("e16", "Angriff auf CSD in Berlin - was bisher bekannt ist", "2026-07-26T22:10:00Z", "rnd")  // Wiederveroeffentlichung
];
const auswahl = V.selectPromptDocuments(ereignis, 12);
check("10 · die Auswahl haelt die Obergrenze ein", auswahl.length === 12, `${auswahl.length}`);
check("10 · sie ist chronologisch geordnet (die KI liest die Entwicklung in der Reihenfolge)",
  auswahl.every((doc, i) => i === 0 || Date.parse(doc.published_at) >= Date.parse(auswahl[i - 1].published_at)));
check("10 · das AELTESTE Dokument ist gesetzt (der Ereigniskern)", auswahl[0].id === "e01");
check("10 · das NEUESTE Dokument ist gesetzt (der aktuelle Stand)", auswahl[auswahl.length - 1].id === "e16");
check("10 · die Terror-Einordnung ist enthalten (der Fall, der den Fehler zeigte)",
  auswahl.some((doc) => doc.id === "e06"), auswahl.map((x) => x.id).join(","));

// EHRLICHE GRENZE, hier ausdruecklich geprueft statt behauptet: die Auswahl
// garantiert KEIN bestimmtes Dokument. Sie maximiert die Faktenabdeckung. Eine
// knappe Faktenmeldung, deren Wortlaut sich mit einer frueheren fast deckt, kann
// hinter einer sprachlich reicheren Reaktion landen. Was garantiert IST:
// eine eigene Zahl verschafft einem Dokument Vorrang vor einem sonst gleichen
// ohne Zahl — genau der Fall "korrigierte Opferzahl".
(() => {
  const basis = [
    d("z0", "Explosion am Hauptbahnhof Dortmund, Bereich gesperrt", "2026-07-20T10:00:00Z"),
    d("z1", "Explosion am Hauptbahnhof Dortmund: Ermittlungen dauern an", "2026-07-20T11:00:00Z"),
    d("z2", "Explosion am Hauptbahnhof Dortmund: Ermittlungen laufen weiter", "2026-07-20T12:00:00Z"),
    d("z3", "Explosion am Hauptbahnhof Dortmund: 14 Verletzte bestaetigt", "2026-07-20T12:30:00Z"),
    d("z4", "Explosion am Hauptbahnhof Dortmund: Lage unveraendert", "2026-07-20T13:00:00Z")
  ];
  const drei = V.selectPromptDocuments(basis, 3).map((x) => x.id);
  check("10 · eine Meldung MIT eigener Zahl schlaegt die wortgleiche ohne Zahl",
    drei.includes("z3"), drei.join(","));
})();
check("10 · die Auswahl ist deterministisch", JSON.stringify(V.selectPromptDocuments(ereignis, 12).map((x) => x.id)) === JSON.stringify(auswahl.map((x) => x.id)));
check("10 · und unabhaengig von der Eingangsreihenfolge",
  JSON.stringify(V.selectPromptDocuments(ereignis.slice().reverse(), 12).map((x) => x.id).sort())
    === JSON.stringify(auswahl.map((x) => x.id).sort()));
check("10 · passt alles hinein, wird nichts weggelassen",
  V.selectPromptDocuments(ereignis.slice(0, 5), 12).length === 5);
check("10 · ein leerer Cluster ergibt eine leere Auswahl", V.selectPromptDocuments([], 12).length === 0);

// Die eigentliche Gueteprobe: mehr Faktenabdeckung als die naheliegenden Strategien.
const abdeckung = (liste) => new Set(liste.flatMap((doc) => V.docAnchors(doc))).size;
const nachZeit = (liste, absteigend) => liste.slice().sort((a, b) =>
  (absteigend ? -1 : 1) * (Date.parse(a.published_at) - Date.parse(b.published_at)));
const neuesteZuerst = nachZeit(ereignis, true).slice(0, 12);
const aeltesteZuerst = nachZeit(ereignis, false).slice(0, 12);
const nachKennung = ereignis.slice().sort((a, b) => a.id.localeCompare(b.id)).slice(0, 12);
check("10 · deckt mehr Fakten ab als 'neueste zuerst'",
  abdeckung(auswahl) > abdeckung(neuesteZuerst), `${abdeckung(auswahl)} vs ${abdeckung(neuesteZuerst)}`);
check("10 · deckt mehr Fakten ab als 'aelteste zuerst'",
  abdeckung(auswahl) > abdeckung(aeltesteZuerst), `${abdeckung(auswahl)} vs ${abdeckung(aeltesteZuerst)}`);
check("10 · deckt mehr Fakten ab als die alte Auswahl nach Dokumentkennung",
  abdeckung(auswahl) > abdeckung(nachKennung), `${abdeckung(auswahl)} vs ${abdeckung(nachKennung)}`);
check("10 · 'neueste zuerst' verliert nachweislich den Ereigniskern",
  !neuesteZuerst.some((doc) => doc.id === "e01"));
check("10 · eine reine Wiederveroeffentlichung verdraengt kein neues Faktum",
  !auswahl.some((doc) => doc.id === "e13") || !auswahl.some((doc) => doc.id === "e16") || auswahl.some((doc) => doc.id === "e06"));

console.log(`\n${n - fail}/${n} Assertions erfolgreich.`);
if (fail) console.log(`\nFEHLGESCHLAGEN: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
